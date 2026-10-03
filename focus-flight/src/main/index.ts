import { app, BrowserWindow, ipcMain, Menu, nativeImage, Notification, screen, Tray } from 'electron'
import path from 'node:path'
import { FlightController, type Settings } from '../shared/controller'
import { isActive, remainingMs, type Phase } from '../shared/flightMachine'
import { IPC } from '../shared/ipc'
import { isNewerVersion } from '../shared/version'
import { ExtensionBridge } from './extensionBridge'
import { runSmokeTest } from './smokeTest'
import { JsonFileStorage } from './storage'
import { getActiveWindow } from './windowWatcher'

const PHASE_LABEL: Record<Phase, string> = {
  idle: '대기 중',
  boarding: '탑승 중',
  flying: '비행 중',
  turbulence: '난기류!',
  paused: '일시정지',
  landed: '착륙',
  crashed: '추락'
}

let mainWindow: BrowserWindow | null = null
let overlay: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false

/** --smoke-test=<폴더>: 실행 테스트 모드 (실제 기록을 건드리지 않도록 임시 폴더 사용) */
const smokeArg = process.argv.find((a) => a.startsWith('--smoke-test='))
const smokeDir = smokeArg ? path.resolve(smokeArg.slice('--smoke-test='.length)) : null
if (smokeDir) app.setPath('userData', path.join(smokeDir, 'userData'))

const controller = new FlightController(
  new JsonFileStorage(path.join(app.getPath('userData'), 'focus-flight.json'))
)
const bridge = new ExtensionBridge(() => {
  controller.extensionConnected = bridge.connected
  broadcast()
})

function rendererUrl(hash = ''): { url?: string; file?: string; hash: string } {
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    return { url: `${process.env.ELECTRON_RENDERER_URL}#${hash}`, hash }
  }
  return { file: path.join(__dirname, '../renderer/index.html'), hash }
}

function load(win: BrowserWindow, hash = ''): void {
  const target = rendererUrl(hash)
  if (target.url) void win.loadURL(target.url)
  else void win.loadFile(target.file!, { hash })
}

const webPreferences = {
  preload: path.join(__dirname, '../preload/index.js'),
  contextIsolation: true,
  sandbox: false
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 860,
    minHeight: 600,
    title: 'Focus Flight',
    show: !process.argv.includes('--hidden'),
    backgroundColor: '#0b1220',
    autoHideMenuBar: true,
    icon: appIcon(),
    webPreferences
  })
  load(mainWindow)
  // 닫기 버튼은 트레이로 숨기기
  mainWindow.on('close', (e) => {
    if (!quitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })
}

/** 난기류 경고 오버레이: 포커스를 빼앗지 않는 항상-위 창 */
function createOverlay(): void {
  const { workArea } = screen.getPrimaryDisplay()
  const width = 420
  overlay = new BrowserWindow({
    width,
    height: 120,
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: workArea.y + 24,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    webPreferences
  })
  overlay.setAlwaysOnTop(true, 'screen-saver')
  overlay.setIgnoreMouseEvents(true)
  load(overlay, 'overlay')
}

function appIcon(): Electron.NativeImage {
  return nativeImage.createFromPath(path.join(__dirname, '../../resources/icon.png'))
}

function broadcast(): void {
  const snap = controller.snapshot()
  for (const win of [mainWindow, overlay]) {
    if (win && !win.isDestroyed()) win.webContents.send(IPC.snapshot, snap)
  }
  updateTray()
}

let lastPhase: Phase = 'idle'

function onPhaseChange(phase: Phase): void {
  if (phase === lastPhase) return
  const prev = lastPhase
  lastPhase = phase
  if (phase === 'turbulence') {
    overlay?.showInactive()
    new Notification({ title: '⚠️ 난기류!', body: '허용된 앱으로 돌아오지 않으면 추락합니다.' }).show()
  } else {
    overlay?.hide()
  }
  if (phase === 'landed') {
    new Notification({ title: '🛬 착륙 성공', body: '여권에 도장이 찍혔습니다.' }).show()
    mainWindow?.show()
  }
  if (phase === 'crashed' && prev !== 'idle') {
    new Notification({ title: '💥 추락', body: '다음 비행에서 다시 도전해 보세요.' }).show()
    mainWindow?.show()
  }
}

function updateTray(): void {
  if (!tray) return
  const s = controller.flight
  const left = Math.ceil(remainingMs(s) / 60_000)
  const route = s.route ? `${s.route.from} → ${s.route.to}` : ''
  tray.setToolTip(
    isActive(s) ? `Focus Flight · ${PHASE_LABEL[s.phase]} ${route} (${left}분 남음)` : 'Focus Flight'
  )
}

function createTray(): void {
  tray = new Tray(appIcon().resize({ width: 16, height: 16 }))
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '열기', click: () => mainWindow?.show() },
      { type: 'separator' },
      {
        label: '종료',
        click: () => {
          quitting = true
          app.quit()
        }
      }
    ])
  )
  tray.on('click', () => mainWindow?.show())
  updateTray()
}

/** 1초 간격 폴링: 활성 창 감시 → 상태 기계 → 화면 갱신 */
let polling = false
async function poll(): Promise<void> {
  if (polling) return
  polling = true
  try {
    const win = await getActiveWindow()
    if (win) win.url = bridge.urlFor(win.title)
    controller.observeWindow(win)
    onPhaseChange(controller.flight.phase)
    broadcast()
  } finally {
    polling = false
  }
}

function applyLoginItem(settings: Settings): void {
  if (process.platform === 'win32' || process.platform === 'darwin') {
    app.setLoginItemSettings({
      openAtLogin: settings.launchAtLogin,
      args: ['--hidden'],
      // 포터블 exe는 임시 폴더에 풀려 실행되므로 원래 exe 경로를 등록한다
      path: process.env.PORTABLE_EXECUTABLE_FILE ?? process.execPath
    })
  }
}

function registerIpc(): void {
  const act = (fn: () => void) => () => {
    fn()
    onPhaseChange(controller.flight.phase)
    broadcast()
  }
  ipcMain.handle(IPC.getSnapshot, () => controller.snapshot())
  ipcMain.handle(IPC.board, (_e, from: string, to: string) => {
    const ok = controller.board(from, to)
    onPhaseChange(controller.flight.phase)
    broadcast()
    return ok
  })
  ipcMain.handle(IPC.cancel, act(() => controller.cancel()))
  ipcMain.handle(IPC.pause, act(() => controller.pause()))
  ipcMain.handle(IPC.resume, act(() => controller.resume()))
  ipcMain.handle(IPC.abort, act(() => controller.abort()))
  ipcMain.handle(IPC.reset, act(() => controller.reset()))
  ipcMain.handle(IPC.clearRecords, act(() => controller.clearRecords()))
  ipcMain.handle(IPC.updateSettings, (_e, patch: Partial<Settings>) => {
    controller.updateSettings(patch)
    applyLoginItem(controller.settings)
    restartPolling()
    broadcast()
  })
}

let timer: NodeJS.Timeout | null = null
function restartPolling(): void {
  if (timer) clearInterval(timer)
  timer = setInterval(() => void poll(), Math.max(250, controller.settings.config.pollIntervalMs))
}

/** 다른 실행 파일(새 버전)이 켜졌을 때 넘겨받는 정보 */
interface LaunchInfo {
  version: string
  exe: string
  args: string[]
}

const launchInfo: LaunchInfo = {
  version: app.getVersion(),
  // 포터블 exe는 임시 폴더에서 실행되므로 원래 exe 경로를 넘긴다
  exe: process.env.PORTABLE_EXECUTABLE_FILE ?? process.execPath,
  args: process.argv.slice(1).filter((a) => a !== '--hidden')
}

if (!app.requestSingleInstanceLock(launchInfo)) {
  app.quit()
} else {
  app.on('second-instance', (_e, _argv, _cwd, data) => {
    const other = data as Partial<LaunchInfo> | undefined
    if (other?.version && other.exe && isNewerVersion(other.version, app.getVersion())) {
      // 더 새로운 버전이 실행되면 이 버전은 물러나고 새 버전을 대신 띄운다
      quitting = true
      bridge.stop()
      app.relaunch({ execPath: other.exe, args: other.args ?? [] })
      app.exit(0)
      return
    }
    mainWindow?.show()
  })

  app.whenReady().then(() => {
    app.setAppUserModelId('com.lagulee.focusflight')
    registerIpc()
    createMainWindow()
    createOverlay()
    createTray()
    bridge.start()
    restartPolling()
    if (smokeDir && mainWindow) void runSmokeTest(smokeDir, mainWindow, controller)
  })

  app.on('before-quit', () => {
    quitting = true
    bridge.stop()
  })

  // 트레이에 상주하므로 창이 모두 닫혀도 종료하지 않는다
  app.on('window-all-closed', () => {})
}
