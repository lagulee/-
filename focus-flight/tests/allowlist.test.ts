import { describe, expect, it } from 'vitest'
import {
  hostMatches,
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
