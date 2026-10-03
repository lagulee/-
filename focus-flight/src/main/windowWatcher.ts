import path from 'node:path'
import type { WindowInfo } from '../shared/allowlist'

type ActiveWindowFn = () => Promise<
  { title: string; owner: { name: string; path: string } } | undefined
>

let activeWindowFn: ActiveWindowFn | null = null

/** get-windows는 ESM 전용이라 동적 import로 불러온다 */
async function load(): Promise<ActiveWindowFn> {
  if (!activeWindowFn) {
    const mod = await import('get-windows')
    activeWindowFn = mod.activeWindow as ActiveWindowFn
  }
  return activeWindowFn
}

/** 현재 포그라운드 창. 감지 실패 시 null (판정하지 않음) */
export async function getActiveWindow(): Promise<WindowInfo | null> {
  try {
    const win = await (await load())()
    if (!win) return null
    const exe = win.owner.path ? path.win32.basename(win.owner.path) : `${win.owner.name}.exe`
    return { processName: exe, title: win.title ?? '' }
  } catch {
    return null
  }
}
