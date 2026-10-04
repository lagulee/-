import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import {
  ANDROID_SYSTEM,
  APP_BACKGROUND,
  explainAndroid,
  SCREEN_OFF,
  type AndroidEnv,
  type WindowInfo
} from '../../shared/allowlist'
import { FlightController, type PersistedData, type Snapshot, type Storage } from '../../shared/controller'
import { isActive, remainingMs } from '../../shared/flightMachine'
import type { FocusFlightApi } from '../../shared/ipc'
import { FocusMonitor } from './native/focusMonitor'

/**
 * - desktop: Electron (preload가 넣어 준 window.focusFlight 사용)
 * - android: Capacitor 앱. 컨트롤러를 화면 안에서 돌리고 네이티브 플러그인으로 앱 사용 기록을 받는다
 * - preview: 브라우저 미리보기 (가상 활성 창)
 */
export type Platform = 'desktop' | 'android' | 'preview'

export const platform: Platform = window.focusFlight
  ? 'desktop'
  : Capacitor.getPlatform() === 'android'
    ? 'android'
    : 'preview'

export const isMock = platform === 'preview'

export const MOCK_WINDOWS: WindowInfo[] = [
  { processName: 'Code.exe', title: 'flightMachine.ts - Visual Studio Code' },
  {
    processName: 'chrome.exe',
    title: 'Lo-fi 공부 플레이리스트 - YouTube - Chrome',
    url: 'https://www.youtube.com/watch?v=abc&list=PLlofi-study-0001'
  },
  { processName: 'chrome.exe', title: '웃긴 영상 모음 - YouTube - Chrome', url: 'https://www.youtube.com/shorts/xyz' },
  { processName: 'Discord.exe', title: 'Discord' },
  { processName: 'explorer.exe', title: '작업 전환' }
]

let mockWindow: WindowInfo = MOCK_WINDOWS[0]
export function setMockWindow(w: WindowInfo): void {
  mockWindow = w
}

function localStorageStore(key: string): Storage {
  return {
    load: () => {
      try {
        return JSON.parse(localStorage.getItem(key) ?? 'null') as PersistedData | null
      } catch {
        return null
      }
    },
    save: (d) => {
      try {
        localStorage.setItem(key, JSON.stringify(d))
      } catch {
        // 저장 불가면 메모리에만 유지
      }
    }
  }
}

/** 컨트롤러를 화면 안에서 돌리는 API (미리보기·안드로이드 공용) */
function localApi(ctl: FlightController, onChange: () => void): {
  api: FocusFlightApi
  emit: () => void
} {
  const listeners = new Set<(s: Snapshot) => void>()
  const emit = (): void => {
    const s = ctl.snapshot()
    listeners.forEach((l) => l(s))
    onChange()
  }
  const act =
    (fn: () => void) =>
    async (): Promise<void> => {
      fn()
      emit()
    }
  return {
    emit,
    api: {
      getSnapshot: async () => ctl.snapshot(),
      onSnapshot: (cb) => {
        listeners.add(cb)
        return () => listeners.delete(cb)
      },
      board: async (from, to) => {
        const ok = ctl.board(from, to)
        emit()
        return ok
      },
      cancel: act(() => ctl.cancel()),
      pause: act(() => ctl.pause()),
      resume: act(() => ctl.resume()),
      abort: act(() => ctl.abort()),
      reset: act(() => ctl.reset()),
      clearRecords: act(() => ctl.clearRecords()),
      updateSettings: async (patch) => {
        ctl.updateSettings(patch)
        emit()
      }
    }
  }
}

function createPreviewApi(): FocusFlightApi {
  const ctl = new FlightController(localStorageStore('focus-flight-preview'))
  if (!ctl.settings.allowlist.playlists.includes('PLlofi-study-0001')) {
    ctl.updateSettings({
      allowlist: { ...ctl.settings.allowlist, playlists: [...ctl.settings.allowlist.playlists, 'PLlofi-study-0001'] }
    })
  }
  const { api, emit } = localApi(ctl, () => undefined)
  setInterval(() => {
    ctl.observeWindow(mockWindow)
    emit()
  }, 500)
  return api
}

let androidEnv: (AndroidEnv & { usageGranted: boolean; notificationsGranted: boolean }) | null = null
const envListeners = new Set<() => void>()
export function getAndroidEnv(): typeof androidEnv {
  return androidEnv
}
export function onAndroidEnv(cb: () => void): () => void {
  envListeners.add(cb)
  return () => envListeners.delete(cb)
}
export async function refreshAndroidEnv(): Promise<void> {
  androidEnv = await FocusMonitor.getEnvironment()
  envListeners.forEach((l) => l())
}

function createAndroidApi(): FocusFlightApi {
  const env: AndroidEnv = { ownPackage: 'com.lagulee.focusflight', launchers: [] }
  const ctl = new FlightController(localStorageStore('focus-flight'), Date.now, (w, list) =>
    explainAndroid(w, list, env)
  )

  let watching: { endsAt: number } | null = null
  /** 비행 상태에 맞춰 백그라운드 감시(알림) 서비스를 켜고 끈다 */
  const syncWatch = (): void => {
    const f = ctl.flight
    const flyingNow = isActive(f) && f.phase !== 'paused'
    if (flyingNow && androidEnv?.usageGranted) {
      const boardingLeft = f.phase === 'boarding' ? Math.max(0, f.phaseSince + ctl.settings.config.boardingMs - Date.now()) : 0
      const endsAt = Date.now() + remainingMs(f) + boardingLeft
      if (!watching || Math.abs(watching.endsAt - endsAt) > 15_000) {
        watching = { endsAt }
        void FocusMonitor.startWatch({
          allowed: ctl.settings.allowlist.apps,
          neutral: [...env.launchers, ...ANDROID_SYSTEM],
          toleranceMs: ctl.settings.config.toleranceMs,
          graceMs: ctl.settings.config.graceMs,
          endsAt,
          title: f.route ? `${f.route.from} → ${f.route.to} 비행 중` : '비행 중'
        }).catch(() => undefined)
      }
    } else if (watching) {
      watching = null
      void FocusMonitor.stopWatch().catch(() => undefined)
    }
  }

  const { api, emit } = localApi(ctl, syncWatch)

  let lastSync = Date.now()
  let pausedAt: number | null = null
  let busy = false
  let loggedOwn = false

  /** 마지막 확인 이후의 앱 전환 기록을 순서대로 반영한다 */
  const sync = async (): Promise<void> => {
    if (busy) return
    busy = true
    try {
      if (androidEnv?.usageGranted) {
        const res = await FocusMonitor.getEvents({ since: lastSync - 1500 })
        const events = res.events.filter((e) => e.t > lastSync - 1500).sort((a, b) => a.t - b.t)
        for (const e of events) {
          let verdict: string | null = null
          if (e.type === 'app' && e.pkg) {
            verdict = ctl.observeWindowAt({ processName: e.pkg, appName: e.label, title: '' }, e.t)
          } else if (e.type === 'screen_off') {
            verdict = ctl.observeWindowAt({ processName: SCREEN_OFF, appName: '화면 꺼짐', title: '' }, e.t)
          }
          // 기기 로그(logcat)로 감지 과정을 확인할 수 있게 남긴다 (패키지 이름만, CI 에뮬레이터 테스트에서도 사용)
          if (verdict) console.info(`[ff] foreground: ${e.pkg ?? e.type} ${verdict} phase=${ctl.flight.phase}`)
        }
        lastSync = res.now
        if (document.visibilityState === 'visible') {
          const v = ctl.observeWindow({ processName: env.ownPackage, appName: 'Focus Flight', title: '' })
          if (events.length > 0 || !loggedOwn) console.info(`[ff] foreground: ${env.ownPackage} ${v} phase=${ctl.flight.phase}`)
          loggedOwn = true
        }
      } else {
        ctl.tick()
      }
      emit()
    } catch (err) {
      console.warn('[ff] sync failed', err)
    } finally {
      busy = false
    }
  }

  void refreshAndroidEnv()
    .then(() => {
      env.ownPackage = androidEnv!.ownPackage
      env.launchers = androidEnv!.launchers
    })
    .catch(() => undefined)
    .finally(() => void sync())

  setInterval(() => {
    if (document.visibilityState === 'visible') void sync()
  }, 1000)

  // 사용 기록 권한이 없을 때: 앱을 벗어난 시간을 "이탈"로 기록 (웹 방식)
  void App.addListener('pause', () => {
    pausedAt = Date.now()
  })
  void App.addListener('resume', () => {
    void refreshAndroidEnv()
      .catch(() => undefined)
      .then(() => {
        if (!androidEnv?.usageGranted && pausedAt !== null) {
          ctl.observeWindowAt({ processName: APP_BACKGROUND, appName: '다른 앱', title: '' }, pausedAt)
          ctl.observeWindow({ processName: env.ownPackage, appName: 'Focus Flight', title: '' })
        }
        pausedAt = null
        return sync()
      })
  })

  return api
}

export const api: FocusFlightApi =
  window.focusFlight ?? (platform === 'android' ? createAndroidApi() : createPreviewApi())
