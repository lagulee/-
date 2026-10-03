import type { WindowInfo } from '../../shared/allowlist'
import { FlightController, type PersistedData, type Snapshot } from '../../shared/controller'
import type { FocusFlightApi } from '../../shared/ipc'

/**
 * Electron에서는 preload가 넣어 준 window.focusFlight를 쓴다.
 * 브라우저 미리보기(npm run web)에서는 같은 컨트롤러를 렌더러 안에서 돌리는 mock을 쓴다.
 */
export const isMock = !window.focusFlight

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

function createMockApi(): FocusFlightApi {
  const KEY = 'focus-flight-preview'
  const ctl = new FlightController({
    load: () => {
      try {
        return JSON.parse(localStorage.getItem(KEY) ?? 'null') as PersistedData | null
      } catch {
        return null
      }
    },
    save: (d) => {
      try {
        localStorage.setItem(KEY, JSON.stringify(d))
      } catch {
        // 저장 불가(사생활 보호 모드 등)면 메모리에만 유지
      }
    }
  })
  if (!ctl.settings.allowlist.playlists.includes('PLlofi-study-0001')) {
    ctl.updateSettings({
      allowlist: { ...ctl.settings.allowlist, playlists: [...ctl.settings.allowlist.playlists, 'PLlofi-study-0001'] }
    })
  }
  const listeners = new Set<(s: Snapshot) => void>()
  const emit = (): void => listeners.forEach((l) => l(ctl.snapshot()))
  setInterval(() => {
    ctl.observeWindow(mockWindow)
    emit()
  }, 500)
  const act =
    (fn: () => void) =>
    async (): Promise<void> => {
      fn()
      emit()
    }
  return {
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

export const api: FocusFlightApi = window.focusFlight ?? createMockApi()
