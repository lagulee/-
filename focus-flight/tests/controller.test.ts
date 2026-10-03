import { describe, expect, it } from 'vitest'
import { FlightController, planRoute, type PersistedData, type Storage } from '../src/shared/controller'
import { DEFAULT_CONFIG } from '../src/shared/config'

class MemoryStorage implements Storage {
  data: PersistedData | null = null
  load() {
    return this.data
  }
  save(d: PersistedData) {
    this.data = structuredClone(d)
  }
}

function setup() {
  let t = 1_000_000
  const storage = new MemoryStorage()
  const clock = { now: () => t, advance: (ms: number) => (t += ms) }
  const ctl = new FlightController(storage, clock.now)
  ctl.updateSettings({ config: { ...DEFAULT_CONFIG, minFocusMinutes: 1, maxFocusMinutes: 1 } })
  return { ctl, storage, clock }
}

describe('planRoute', () => {
  it('같은 도시나 없는 도시는 거절', () => {
    expect(planRoute('ICN', 'ICN', DEFAULT_CONFIG)).toBeNull()
    expect(planRoute('ICN', 'XXX', DEFAULT_CONFIG)).toBeNull()
  })

  it('거리로 집중 시간을 정한다', () => {
    // 김포→하네다 ≈ 1,180 km → 0.5 × 1180/850 h ≈ 42분
    const plan = planRoute('GMP', 'HND', DEFAULT_CONFIG)!
    expect(plan.route.distanceKm).toBeCloseTo(1180, -1)
    expect(plan.durationMs).toBe(42 * 60_000)
  })
})

describe('FlightController', () => {
  it('착륙하면 기록과 마일리지가 저장된다', () => {
    const { ctl, storage, clock } = setup()
    expect(ctl.board('ICN', 'NRT')).toBe(true)
    clock.advance(5_000)
    ctl.observeWindow({ processName: 'code.exe', title: 'x' })
    clock.advance(60_000)
    ctl.tick()
    const snap = ctl.snapshot()
    expect(snap.flight.phase).toBe('landed')
    expect(snap.lastRecord).toMatchObject({ outcome: 'landed', to: 'NRT', focusMs: 60_000 })
    expect(storage.data?.records).toHaveLength(1)
    expect(snap.stats.stamps.NRT).toBeDefined()
  })

  it('비허용 앱에 머무르면 추락하고 마일리지는 절반', () => {
    const { ctl, clock } = setup()
    ctl.board('ICN', 'NRT')
    clock.advance(5_000)
    ctl.tick()
    clock.advance(20_000)
    ctl.tick()
    ctl.observeWindow({ processName: 'game.exe', title: 'game' })
    clock.advance(DEFAULT_CONFIG.toleranceMs + DEFAULT_CONFIG.graceMs)
    ctl.observeWindow({ processName: 'game.exe', title: 'game' })
    const snap = ctl.snapshot()
    expect(snap.flight.phase).toBe('crashed')
    expect(snap.lastRecord?.outcome).toBe('crashed')
    expect(snap.activeWindow?.verdict).toBe('blocked')
  })

  it('시스템 창은 포커스 상태를 바꾸지 않는다', () => {
    const { ctl, clock } = setup()
    ctl.board('ICN', 'NRT')
    clock.advance(5_000)
    ctl.observeWindow({ processName: 'explorer.exe', title: '' })
    clock.advance(30_000)
    ctl.tick()
    expect(ctl.flight.phase).toBe('flying')
  })

  it('저장된 설정과 기록을 다시 불러온다', () => {
    const { ctl, storage } = setup()
    ctl.updateSettings({ aircraft: 'a320' })
    const again = new FlightController(storage)
    expect(again.settings.aircraft).toBe('a320')
    expect(again.settings.config.minFocusMinutes).toBe(1)
  })
  it('비행 중에는 허용 목록을 넓히거나 규칙을 바꿀 수 없고, 줄이는 것만 된다', () => {
    const { ctl } = setup()
    ctl.board('ICN', 'NRT')
    const list = ctl.settings.allowlist
    ctl.updateSettings({ allowlist: { ...list, apps: [...list.apps, 'game.exe'] } })
    expect(ctl.settings.allowlist.apps).not.toContain('game.exe')
    ctl.updateSettings({ config: { ...ctl.settings.config, graceMs: 999_999 } })
    expect(ctl.settings.config.graceMs).toBe(DEFAULT_CONFIG.graceMs)
    ctl.updateSettings({ allowlist: { ...list, apps: list.apps.slice(1) } })
    expect(ctl.settings.allowlist.apps).toHaveLength(list.apps.length - 1)
  })
  it('난기류 중 허용 사이트(확장 없음)나 Focus Flight 창으로 돌아오면 회복한다', () => {
    const { ctl, clock } = setup()
    ctl.board('ICN', 'NRT')
    clock.advance(5_000)
    ctl.observeWindow({ processName: 'game.exe', title: 'game' })
    clock.advance(3_000)
    ctl.observeWindow({ processName: 'game.exe', title: 'game' })
    expect(ctl.flight.phase).toBe('turbulence')
    ctl.observeWindow({ processName: 'Focus Flight.exe', title: 'Focus Flight' })
    expect(ctl.flight.phase).toBe('flying')

    ctl.observeWindow({ processName: 'game.exe', title: 'game' })
    clock.advance(3_000)
    ctl.observeWindow({ processName: 'game.exe', title: 'game' })
    expect(ctl.flight.phase).toBe('turbulence')
    ctl.observeWindow({ processName: 'chrome.exe', title: '과제 - Notion - Chrome' })
    expect(ctl.flight.phase).toBe('flying')
    expect(ctl.snapshot().activeWindow?.reason).toContain('notion.so')
  })
})
