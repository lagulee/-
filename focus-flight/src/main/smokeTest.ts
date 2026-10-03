import { app, type BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { FlightController } from '../shared/controller'
import { otherInstances } from './legacyInstances'
import { getActiveWindow, lastWatcherError } from './windowWatcher'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * `--smoke-test=<폴더>` 로 실행하면 실제 Windows에서 핵심 기능을 확인하고 결과를 남긴 뒤 종료한다.
 * (GitHub Actions의 Windows 빌드에서 릴리스 전에 실행)
 */
export async function runSmokeTest(outDir: string, win: BrowserWindow, controller: FlightController): Promise<void> {
  fs.mkdirSync(outDir, { recursive: true })
  const rendererErrors: string[] = []
  win.webContents.on('console-message', (...args: unknown[]) => {
    const d = args[0] as { level?: string | number; message?: string }
    const level = typeof d?.level !== 'undefined' ? d.level : args[1]
    const message = typeof d?.message === 'string' ? d.message : String(args[2] ?? '')
    if (level === 'error' || level === 3) rendererErrors.push(message)
  })
  win.webContents.on('render-process-gone', (_e, details) => rendererErrors.push(`renderer gone: ${details.reason}`))

  if (win.webContents.isLoading()) await new Promise<void>((r) => win.webContents.once('did-finish-load', () => r()))
  win.show()
  win.focus()
  await wait(1500)

  const samples = []
  for (let i = 0; i < 3; i++) {
    samples.push({ window: await getActiveWindow(), error: lastWatcherError })
    await wait(300)
  }

  // 이전 버전 찾기(PowerShell)가 이 PC에서 동작하는지 확인 (자기 자신은 목록에서 빠져야 한다)
  let instances: unknown
  let instancesError: string | null = null
  try {
    instances = await otherInstances()
  } catch (err) {
    instancesError = err instanceof Error ? err.message : String(err)
  }

  // 1분짜리 비행으로 3D 화면(이륙·상승)을 확인
  controller.updateSettings({ config: { ...controller.settings.config, minFocusMinutes: 1, maxFocusMinutes: 1 } })
  const boarded = controller.board('ICN', 'NRT')
  await wait(16_000)

  const dom = (await win.webContents.executeJavaScript(`(() => {
    const c = document.querySelector('.cockpit-canvas')
    const probe = document.createElement('canvas')
    return {
      versionText: document.querySelector('.version')?.textContent ?? null,
      cockpitCanvas: !!c,
      canvasSize: c ? [c.width, c.height] : null,
      webgl2: !!probe.getContext('webgl2'),
      hudStats: document.querySelector('.hud-stats')?.textContent ?? null,
      phaseText: document.querySelector('.phase-badge')?.textContent ?? null
    }
  })()`)) as Record<string, unknown>

  const image = await win.webContents.capturePage()
  fs.writeFileSync(path.join(outDir, 'screenshot.png'), image.toPNG())

  const snap = controller.snapshot()
  const detected = samples.some((s) => s.window !== null)
  const report = {
    version: app.getVersion(),
    platform: `${process.platform}-${process.arch}`,
    activeWindowSamples: samples,
    activeWindowDetected: detected,
    otherInstances: instances,
    otherInstancesError: instancesError,
    boarded,
    phase: snap.flight.phase,
    renderer: dom,
    rendererErrors
  }
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2))

  const ok =
    boarded &&
    dom.cockpitCanvas === true &&
    rendererErrors.length === 0 &&
    instancesError === null &&
    Array.isArray(instances) &&
    instances.length === 0 &&
    // 감지 모듈이 오류를 내면 실패 (포그라운드 창이 없어서 null인 것은 허용)
    samples.every((s) => s.error === null)
  app.exit(ok ? 0 : 1)
}
