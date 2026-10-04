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
  /** 앱 표시 이름 (예: Visual Studio Code). 실행 파일 경로를 못 읽을 때 대신 비교한다 */
  appName?: string
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
  'applicationframehost.exe'
]

/** Focus Flight 자기 자신. 타이머를 확인하는 것은 이탈이 아니므로 허용으로 본다 */
export const OWN_PROCESSES = ['focus flight.exe', 'focus-flight.exe', 'electron.exe']

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

/** 확장 없이 창 제목으로 사이트를 짐작할 때 쓰는 이름 (notion.so → notion, docs.google.com → docs) */
export function siteTitleKeyword(site: string): string | null {
  const labels = norm(site).replace(/^https?:\/\//, '').split('/')[0].split('.')
  const name = labels.filter((l) => l !== 'www' && l !== '')[0]
  return name && name.length >= 4 && labels.length >= 2 ? name : null
}

export interface Judgement {
  verdict: Verdict
  /** 화면에 보여 줄 판정 이유 */
  reason: string
}

export function explainWindow(w: WindowInfo | null, list: AllowList): Judgement {
  if (!w) return { verdict: 'neutral', reason: '창을 감지하지 못함' }
  const proc = norm(w.processName)
  const app = norm(w.appName ?? '')
  if (OWN_PROCESSES.includes(proc)) return { verdict: 'allowed', reason: 'Focus Flight' }
  if (SYSTEM_PROCESSES.includes(proc)) return { verdict: 'neutral', reason: '시스템 창' }
  if (list.apps.some((a) => norm(a) === proc || (app !== '' && norm(a).replace(/\.exe$/, '') === app))) {
    return { verdict: 'allowed', reason: '허용 앱' }
  }
  const title = norm(w.title)
  const keyword = list.titleKeywords.find((k) => norm(k) !== '' && title.includes(norm(k)))
  if (BROWSERS.includes(proc)) {
    if (w.url) {
      return judgeUrl(w.url, list)
        ? { verdict: 'allowed', reason: '허용 사이트/플레이리스트' }
        : { verdict: 'blocked', reason: '허용 목록에 없는 사이트' }
    }
    if (keyword) return { verdict: 'allowed', reason: `제목에 "${keyword}" 포함` }
    // 확장이 없으면 URL을 모르므로 창 제목에 사이트 이름이 있는지로 짐작한다
    const site = list.sites.find((st) => {
      const k = siteTitleKeyword(st)
      return k !== null && title.includes(k)
    })
    if (site) return { verdict: 'allowed', reason: `제목으로 ${site} 추정 (확장 설치 시 정확)` }
    return { verdict: 'blocked', reason: '허용 사이트로 확인되지 않음 (브라우저 확장을 설치하면 정확해요)' }
  }
  if (keyword) return { verdict: 'allowed', reason: `제목에 "${keyword}" 포함` }
  return { verdict: 'blocked', reason: '허용 목록에 없는 앱' }
}

/** 안드로이드: 기기 정보 (플러그인이 알려 줌) */
export interface AndroidEnv {
  ownPackage: string
  /** 홈 화면 앱들 */
  launchers: string[]
}

/** 화면이 꺼졌거나 Focus Flight가 백그라운드로 간 것을 나타내는 가상 창 */
export const SCREEN_OFF = '__screen_off__'
export const APP_BACKGROUND = '__background__'

/** 안드로이드에서 판정하지 않는 시스템 화면 (알림창, 권한 대화상자 등) */
export const ANDROID_SYSTEM = [
  'com.android.systemui',
  'com.android.permissioncontroller',
  'com.google.android.permissioncontroller',
  'com.android.packageinstaller',
  'com.google.android.packageinstaller'
]

/** 안드로이드: processName은 패키지 이름, 허용 목록의 apps도 패키지 이름 */
export function explainAndroid(w: WindowInfo | null, list: AllowList, env: AndroidEnv): Judgement {
  if (!w) return { verdict: 'neutral', reason: '앱을 감지하지 못함' }
  const pkg = w.processName
  if (pkg === SCREEN_OFF) return { verdict: 'allowed', reason: '화면 꺼짐' }
  if (pkg === APP_BACKGROUND) return { verdict: 'blocked', reason: 'Focus Flight를 벗어남 (사용 기록 권한이 없어 앱을 알 수 없음)' }
  if (pkg === env.ownPackage) return { verdict: 'allowed', reason: 'Focus Flight' }
  // 설정 앱은 기기에 따라 홈 후보(FallbackHome)로 잡히지만 홈 화면이 아니다
  if (env.launchers.includes(pkg) && pkg !== 'com.android.settings') return { verdict: 'neutral', reason: '홈 화면' }
  if (ANDROID_SYSTEM.includes(pkg)) return { verdict: 'neutral', reason: '시스템 화면' }
  if (list.apps.includes(pkg)) return { verdict: 'allowed', reason: '허용 앱' }
  return { verdict: 'blocked', reason: '허용 목록에 없는 앱' }
}

export function judgeWindow(w: WindowInfo | null, list: AllowList): Verdict {
  return explainWindow(w, list).verdict
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
