import type { Settings, Snapshot } from './controller'

/** Main ↔ Renderer IPC 채널 이름 */
export const IPC = {
  snapshot: 'flight:snapshot',
  getSnapshot: 'flight:get-snapshot',
  board: 'flight:board',
  cancel: 'flight:cancel',
  pause: 'flight:pause',
  resume: 'flight:resume',
  abort: 'flight:abort',
  reset: 'flight:reset',
  updateSettings: 'settings:update',
  clearRecords: 'records:clear'
} as const

/** preload가 window.focusFlight 로 노출하는 API */
export interface FocusFlightApi {
  getSnapshot(): Promise<Snapshot>
  onSnapshot(cb: (s: Snapshot) => void): () => void
  board(from: string, to: string): Promise<boolean>
  cancel(): Promise<void>
  pause(): Promise<void>
  resume(): Promise<void>
  abort(): Promise<void>
  reset(): Promise<void>
  updateSettings(patch: Partial<Settings>): Promise<void>
  clearRecords(): Promise<void>
}

/** 브라우저 확장 ↔ 앱 WebSocket 포트 (127.0.0.1에서만 연다) */
export const EXTENSION_PORT = 47321
