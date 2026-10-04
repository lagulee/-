import { describe, expect, it } from 'vitest'
import {
  explainAndroid,
  explainWeb,
  WEB_APP,
  explainWindow,
  hostMatches,
  siteTitleKeyword,
  judgeUrl,
  judgeWindow,
  parsePlaylistInput,
  type AllowList
} from '../src/shared/allowlist'

const list: AllowList = {
  apps: ['Code.exe'],
  sites: ['notion.so'],
  playlists: ['PLstudy123456'],
  titleKeywords: ['공부 플레이리스트']
}

describe('hostMatches', () => {
  it('하위 도메인까지 허용하지만 비슷한 이름은 막는다', () => {
    expect(hostMatches('www.notion.so', 'notion.so')).toBe(true)
    expect(hostMatches('team.notion.so', 'notion.so')).toBe(true)
    expect(hostMatches('notnotion.so', 'notion.so')).toBe(false)
  })
})

describe('judgeUrl', () => {
  it('허용 사이트', () => {
    expect(judgeUrl('https://www.notion.so/page', list)).toBe(true)
  })

  it('지정 플레이리스트만 허용, 같은 사이트의 다른 영상은 차단', () => {
    expect(judgeUrl('https://www.youtube.com/watch?v=abc&list=PLstudy123456', list)).toBe(true)
    expect(judgeUrl('https://music.youtube.com/playlist?list=PLstudy123456', list)).toBe(true)
    expect(judgeUrl('https://www.youtube.com/watch?v=abc', list)).toBe(false)
    expect(judgeUrl('https://www.youtube.com/watch?v=abc&list=PLother', list)).toBe(false)
  })

  it('브라우저 내부 페이지는 허용, 잘못된 URL은 차단', () => {
    expect(judgeUrl('chrome://newtab/', list)).toBe(true)
    expect(judgeUrl('not a url', list)).toBe(false)
  })
})

describe('judgeWindow', () => {
  it('창 정보가 없으면 neutral', () => {
    expect(judgeWindow(null, list)).toBe('neutral')
  })

  it('허용 앱은 대소문자 무시', () => {
    expect(judgeWindow({ processName: 'code.exe', title: 'main.ts' }, list)).toBe('allowed')
  })

  it('시스템 창(작업 표시줄, UAC)은 neutral', () => {
    expect(judgeWindow({ processName: 'explorer.exe', title: '' }, list)).toBe('neutral')
    expect(judgeWindow({ processName: 'consent.exe', title: '사용자 계정 컨트롤' }, list)).toBe('neutral')
  })

  it('Focus Flight 자기 창은 허용 (난기류 중 앱을 눌러 확인해도 회복)', () => {
    expect(judgeWindow({ processName: 'Focus Flight.exe', title: 'Focus Flight' }, list)).toBe('allowed')
    expect(judgeWindow({ processName: 'electron.exe', title: 'Focus Flight' }, list)).toBe('allowed')
  })

  it('실행 파일 경로를 못 읽어도 앱 이름으로 허용 (code.exe ↔ Code)', () => {
    expect(judgeWindow({ processName: 'Code.exe', appName: 'Code', title: 'x' }, list)).toBe('allowed')
    expect(judgeWindow({ processName: 'Visual Studio Code.exe', appName: 'Code', title: 'x' }, list)).toBe('allowed')
  })

  it('확장이 없어도 창 제목의 사이트 이름으로 허용 사이트를 짐작한다', () => {
    expect(judgeWindow({ processName: 'chrome.exe', title: '회의록 - Notion - Chrome' }, list)).toBe('allowed')
    expect(judgeWindow({ processName: 'chrome.exe', title: '웃긴 영상 - YouTube - Chrome' }, list)).toBe('blocked')
  })

  it('판정 이유를 알려 준다', () => {
    expect(explainWindow({ processName: 'chrome.exe', title: 'YouTube' }, list).reason).toContain('확장')
  })

  it('목록에 없는 앱은 차단', () => {
    expect(judgeWindow({ processName: 'Discord.exe', title: 'Discord' }, list)).toBe('blocked')
  })

  it('브라우저: URL이 있으면 URL로 판정', () => {
    const w = { processName: 'chrome.exe', title: 'YouTube' }
    expect(judgeWindow({ ...w, url: 'https://www.youtube.com/watch?v=1&list=PLstudy123456' }, list)).toBe(
      'allowed'
    )
    expect(judgeWindow({ ...w, url: 'https://www.youtube.com/shorts/1' }, list)).toBe('blocked')
  })

  it('브라우저: URL이 없으면 창 제목 키워드로 근사', () => {
    expect(
      judgeWindow({ processName: 'whale.exe', title: '공부 플레이리스트 - YouTube - Whale' }, list)
    ).toBe('allowed')
    expect(judgeWindow({ processName: 'whale.exe', title: '웃긴 영상 - YouTube' }, list)).toBe('blocked')
  })
})

describe('parsePlaylistInput', () => {
  it('링크나 ID에서 플레이리스트 ID를 꺼낸다', () => {
    expect(parsePlaylistInput('https://www.youtube.com/playlist?list=PLabcdefghij')).toBe('PLabcdefghij')
    expect(parsePlaylistInput('PLabcdefghij')).toBe('PLabcdefghij')
    expect(parsePlaylistInput('https://www.youtube.com/watch?v=x')).toBeNull()
    expect(parsePlaylistInput('  ')).toBeNull()
  })
})

describe('siteTitleKeyword', () => {
  it('도메인에서 제목에 나올 법한 이름을 뽑는다', () => {
    expect(siteTitleKeyword('notion.so')).toBe('notion')
    expect(siteTitleKeyword('www.github.com')).toBe('github')
    expect(siteTitleKeyword('docs.google.com')).toBe('docs')
    expect(siteTitleKeyword('x.ai')).toBeNull()
  })
})

describe('explainAndroid', () => {
  const env = { ownPackage: 'com.lagulee.focusflight', launchers: ['com.google.android.apps.nexuslauncher', 'com.android.settings'] }
  const app = (pkg: string) => ({ processName: pkg, title: '' })
  const l = { ...list, apps: ['com.spotify.music'] }

  it('홈 화면은 neutral, 허용 앱은 allowed, 나머지는 blocked', () => {
    expect(explainAndroid(app('com.google.android.apps.nexuslauncher'), l, env).verdict).toBe('neutral')
    expect(explainAndroid(app('com.spotify.music'), l, env).verdict).toBe('allowed')
    expect(explainAndroid(app('com.instagram.android'), l, env).verdict).toBe('blocked')
    expect(explainAndroid(app('com.lagulee.focusflight'), l, env).verdict).toBe('allowed')
  })

  it('설정 앱이 홈 후보(FallbackHome)로 잡혀도 홈 화면으로 보지 않는다 (에뮬레이터에서 발견)', () => {
    expect(explainAndroid(app('com.android.settings'), l, env).verdict).toBe('blocked')
  })
})

describe('explainWeb', () => {
  it('Focus Flight 화면이면 집중, 아니면 이탈', () => {
    expect(explainWeb({ processName: WEB_APP, title: '' }).verdict).toBe('allowed')
    expect(explainWeb({ processName: '__background__', title: '' }).verdict).toBe('blocked')
  })
})
