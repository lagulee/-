/**
 * 허용 목록 판정
 *
 *   허용(w) = [프로세스(w) ∈ W_앱] ∨ [도메인(w) ∈ W_사이트] ∨ [URL(w)에 list=ID_지정 포함]
 *
 * 브라우저 URL은 확장 프로그램이 알려줄 때만 정확히 알 수 있다.
 * URL을 모를 때는 창 제목에 키워드(예: 플레이리스트 이름)가 들어 있는지로 근사한다.
 */
export interface AllowList {
  /** 허용 앱 실행 파일 이름 (예: code.exe, notepad.exe) */
  apps: string[]
  /** 허용 도메인. 하위 도메인까지 허용 (예: notion.so → www.notion.so) */
  sites: string[]
  /** 허용 플레이리스트 ID (YouTube URL의 list= 값) */
  playlists: string[]
  /** URL을 모를 때 쓰는 창 제목 키워드 */
  titleKeywords: string[]
}

export const DEFAULT_ALLOWLIST: AllowList = {
  apps: ['code.exe', 'notepad.exe', 'winword.exe', 'excel.exe', 'powerpnt.exe', 'acrobat.exe'],
  sites: ['notion.so', 'docs.google.com', 'github.com'],
  playlists: [],
  titleKeywords: []
}

export interface WindowInfo {
  /** 실행 파일 이름 (예: chrome.exe) */
  processName: string
  title: string
  /** 브라우저 확장이 알려준 현재 탭 URL (없으면 undefined) */
  url?: string
}

/** neutral: 판정하지 않음(상태 유지). 시스템 창·Alt+Tab 전환 화면 등 */
export type Verdict = 'allowed' | 'blocked' | 'neutral'

export const BROWSERS = [
  'chrome.exe',
  'msedge.exe',
  'firefox.exe',
  'whale.exe',
  'brave.exe',
  'opera.exe',
  'vivaldi.exe'
]

/** 포커스를 가져가도 위반으로 보지 않는 Windows 시스템 창 */
export const SYSTEM_PROCESSES = [
  'explorer.exe', // 작업 표시줄, Alt+Tab, 바탕 화면
  'shellexperiencehost.exe',
  'startmenuexperiencehost.exe',
  'searchhost.exe',
  'searchapp.exe',
  'textinputhost.exe',
  'lockapp.exe',
  'consent.exe', // UAC
  'credentialuibroker.exe',
  'applicationframehost.exe',
  'focus flight.exe',
  'focus-flight.exe',
  'electron.exe'
]

const norm = (s: string): string => s.trim().toLowerCase()

export function hostMatches(host: string, site: string): boolean {
  const h = norm(host).replace(/^www\./, '')
  const s = norm(site).replace(/^www\./, '')
  return s !== '' && (h === s || h.endsWith('.' + s))
}

export function playlistId(url: URL): string | null {
  return url.searchParams.get('list')
}

export function judgeUrl(rawUrl: string, list: AllowList): boolean {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }
  // 브라우저 내부 페이지(새 탭, 설정 등)는 막지 않는다
  if (!/^https?:$/.test(url.protocol)) return true
  if (list.sites.some((s) => hostMatches(url.hostname, s))) return true
  const pid = playlistId(url)
  return pid !== null && list.playlists.some((p) => p.trim() === pid)
}

export function judgeWindow(w: WindowInfo | null, list: AllowList): Verdict {
  if (!w) return 'neutral'
  const proc = norm(w.processName)
  if (SYSTEM_PROCESSES.includes(proc)) return 'neutral'
  if (list.apps.some((a) => norm(a) === proc)) return 'allowed'
  const title = norm(w.title)
  const titleHit = list.titleKeywords.some((k) => norm(k) !== '' && title.includes(norm(k)))
  if (BROWSERS.includes(proc)) {
    if (w.url) return judgeUrl(w.url, list) ? 'allowed' : 'blocked'
    return titleHit ? 'allowed' : 'blocked'
  }
  return titleHit ? 'allowed' : 'blocked'
}

/** 사용자가 붙여 넣은 YouTube 플레이리스트 링크나 ID에서 ID만 뽑는다 */
export function parsePlaylistInput(input: string): string | null {
  const s = input.trim()
  if (!s) return null
  try {
    return playlistId(new URL(s))
  } catch {
    return /^[A-Za-z0-9_-]{10,}$/.test(s) ? s : null
  }
}
