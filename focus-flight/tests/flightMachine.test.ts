import { describe, expect, it } from 'vitest'
import {
  initialState,
  progress,
  transition,
  type FlightEvent,
  type FlightState,
  type MachineConfig
} from '../src/shared/flightMachine'

const cfg: MachineConfig = {
  boardingMs: 5_000,
  toleranceMs: 2_000,
  graceMs: 10_000,
  maxPauses: 2,
  maxPauseMs: 60_000
}
const route = { from: 'ICN', to: 'NRT', distanceKm: 1200 }
const MIN = 60_000

function run(events: FlightEvent[], start: FlightState = initialState(0)): FlightState {
  return events.reduce((s, e) => transition(s, e, cfg), start)
}

/** t=0에 탑승, t=5000에 이륙한 10분 비행 */
function flyingAt5s(): FlightState {
  return run([
    { type: 'BOARD', route, durationMs: 10 * MIN, now: 0 },
    { type: 'TICK', now: 5_000 }
  ])
}

describe('idle / boarding', () => {
  it('idle에서 BOARD하면 boarding', () => {
    const s = run([{ type: 'BOARD', route, durationMs: 10 * MIN, now: 0 }])
    expect(s.phase).toBe('boarding')
    expect(s.route).toEqual(route)
  })

  it('길이가 0 이하인 비행은 탑승하지 않는다', () => {
    expect(run([{ type: 'BOARD', route, durationMs: 0, now: 0 }]).phase).toBe('idle')
  })

  it('idle에서는 TICK, PAUSE, RESUME, ABORT, RESET이 아무 일도 하지 않는다', () => {
    for (const type of ['TICK', 'PAUSE', 'RESUME', 'ABORT', 'RESET', 'CANCEL'] as const) {
      expect(run([{ type, now: 1000 }]).phase).toBe('idle')
    }
  })

  it('boardingMs가 지나면 flying, 탑승 중에는 시간이 쌓이지 않는다', () => {
    const before = run([
      { type: 'BOARD', route, durationMs: 10 * MIN, now: 0 },
      { type: 'TICK', now: 4_999 }
    ])
    expect(before.phase).toBe('boarding')
    const s = transition(before, { type: 'TICK', now: 7_000 }, cfg)
    expect(s.phase).toBe('flying')
    expect(s.phaseSince).toBe(5_000)
    expect(s.elapsedMs).toBe(2_000)
  })

  it('탑승 중 CANCEL/ABORT하면 기록 없이 idle', () => {
    const boarding = run([{ type: 'BOARD', route, durationMs: MIN, now: 0 }])
    expect(transition(boarding, { type: 'CANCEL', now: 1 }, cfg).phase).toBe('idle')
    expect(transition(boarding, { type: 'ABORT', now: 1 }, cfg).phase).toBe('idle')
  })

  it('비행 중 BOARD는 무시한다', () => {
    const s = flyingAt5s()
    expect(transition(s, { type: 'BOARD', route, durationMs: MIN, now: 6_000 }, cfg)).toMatchObject({
      phase: 'flying',
      durationMs: 10 * MIN
    })
  })

  it('비허용 창을 보던 중 이륙하면 곧바로 이탈로 계산한다', () => {
    const s = run([
      { type: 'FOCUS', allowed: false, now: 0 },
      { type: 'BOARD', route, durationMs: 10 * MIN, now: 0 },
      { type: 'TICK', now: 7_000 }
    ])
    expect(s.phase).toBe('turbulence')
    expect(s.phaseSince).toBe(7_000)
  })
})

describe('flying → landed', () => {
  it('집중 시간이 다 차면 정확한 시각에 착륙한다', () => {
    const s = transition(flyingAt5s(), { type: 'TICK', now: 5_000 + 10 * MIN + 3_000 }, cfg)
    expect(s.phase).toBe('landed')
    expect(s.phaseSince).toBe(5_000 + 10 * MIN)
    expect(s.elapsedMs).toBe(10 * MIN)
    expect(progress(s)).toBe(1)
  })

  it('진행률은 elapsed / duration', () => {
    const s = transition(flyingAt5s(), { type: 'TICK', now: 5_000 + 5 * MIN }, cfg)
    expect(progress(s)).toBeCloseTo(0.5)
  })
})

describe('flying ⇄ turbulence → crashed', () => {
  it('허용 범위(tolerance) 안에 돌아오면 아무 일도 없다 (Alt+Tab 오탐 방지)', () => {
    const s = run(
      [
        { type: 'FOCUS', allowed: false, now: 10_000 },
        { type: 'TICK', now: 11_000 },
        { type: 'FOCUS', allowed: true, now: 11_500 },
        { type: 'TICK', now: 20_000 }
      ],
      flyingAt5s()
    )
    expect(s.phase).toBe('flying')
    expect(s.turbulenceCount).toBe(0)
    expect(s.elapsedMs).toBe(15_000)
  })

  it('toleranceMs 이상 이탈하면 turbulence, 그동안 시간은 멈춘다', () => {
    const s = run(
      [
        { type: 'FOCUS', allowed: false, now: 10_000 },
        { type: 'TICK', now: 15_000 }
      ],
      flyingAt5s()
    )
    expect(s.phase).toBe('turbulence')
    expect(s.phaseSince).toBe(12_000)
    expect(s.elapsedMs).toBe(7_000)
    expect(s.turbulenceCount).toBe(1)
  })

  it('유예 시간 안에 복귀하면 flying으로 돌아온다', () => {
    const s = run(
      [
        { type: 'FOCUS', allowed: false, now: 10_000 },
        { type: 'TICK', now: 15_000 },
        { type: 'FOCUS', allowed: true, now: 20_000 },
        { type: 'TICK', now: 25_000 }
      ],
      flyingAt5s()
    )
    expect(s.phase).toBe('flying')
    expect(s.elapsedMs).toBe(7_000 + 5_000)
  })

  it('유예 시간을 넘기면 crashed', () => {
    const s = run(
      [
        { type: 'FOCUS', allowed: false, now: 10_000 },
        { type: 'TICK', now: 30_000 }
      ],
      flyingAt5s()
    )
    expect(s.phase).toBe('crashed')
    expect(s.crashReason).toBe('turbulence')
    expect(s.phaseSince).toBe(12_000 + 10_000)
  })

  it('착륙 시각이 난기류 시각보다 먼저면 착륙이 이긴다', () => {
    const near = transition(flyingAt5s(), { type: 'TICK', now: 5_000 + 10 * MIN - 1_000 }, cfg)
    const s = run(
      [
        { type: 'FOCUS', allowed: false, now: 5_000 + 10 * MIN - 1_000 },
        { type: 'TICK', now: 5_000 + 10 * MIN + 60_000 }
      ],
      near
    )
    expect(s.phase).toBe('landed')
  })

  it('비허용 FOCUS가 반복돼도 이탈 시작 시각은 그대로', () => {
    const s = run(
      [
        { type: 'FOCUS', allowed: false, now: 10_000 },
        { type: 'FOCUS', allowed: false, now: 11_000 },
        { type: 'FOCUS', allowed: false, now: 11_900 }
      ],
      flyingAt5s()
    )
    expect(s.awaySince).toBe(10_000)
  })
})

describe('paused', () => {
  it('일시정지 중에는 시간이 쌓이지 않고 RESUME하면 이어진다', () => {
    const s = run(
      [
        { type: 'PAUSE', now: 10_000 },
        { type: 'TICK', now: 40_000 },
        { type: 'RESUME', now: 40_000 },
        { type: 'TICK', now: 45_000 }
      ],
      flyingAt5s()
    )
    expect(s.phase).toBe('flying')
    expect(s.elapsedMs).toBe(5_000 + 5_000)
    expect(s.pausesUsed).toBe(1)
  })

  it('일시정지 중 이탈은 위반이 아니다', () => {
    const s = run(
      [
        { type: 'PAUSE', now: 10_000 },
        { type: 'FOCUS', allowed: false, now: 11_000 },
        { type: 'TICK', now: 50_000 }
      ],
      flyingAt5s()
    )
    expect(s.phase).toBe('paused')
  })

  it('난기류 중에도 일시정지할 수 있다 (급한 전화)', () => {
    const s = run(
      [
        { type: 'FOCUS', allowed: false, now: 10_000 },
        { type: 'TICK', now: 13_000 },
        { type: 'PAUSE', now: 13_000 },
        { type: 'TICK', now: 40_000 }
      ],
      flyingAt5s()
    )
    expect(s.phase).toBe('paused')
  })

  it('maxPauses를 넘으면 더 일시정지할 수 없다', () => {
    const s = run(
      [
        { type: 'PAUSE', now: 10_000 },
        { type: 'RESUME', now: 11_000 },
        { type: 'PAUSE', now: 12_000 },
        { type: 'RESUME', now: 13_000 },
        { type: 'PAUSE', now: 14_000 }
      ],
      flyingAt5s()
    )
    expect(s.phase).toBe('flying')
    expect(s.pausesUsed).toBe(2)
  })

  it('maxPauseMs가 지나면 자동으로 재개하고, 그때 비허용 창이면 이탈로 센다', () => {
    const s = run(
      [
        { type: 'PAUSE', now: 10_000 },
        { type: 'FOCUS', allowed: false, now: 11_000 },
        { type: 'TICK', now: 10_000 + 60_000 + 1_000 }
      ],
      flyingAt5s()
    )
    expect(s.phase).toBe('flying')
    expect(s.awaySince).toBe(70_000)
    const later = transition(s, { type: 'TICK', now: 73_000 }, cfg)
    expect(later.phase).toBe('turbulence')
  })

  it('flying이 아닐 때 RESUME은 무시', () => {
    expect(transition(flyingAt5s(), { type: 'RESUME', now: 6_000 }, cfg).phase).toBe('flying')
  })
})

describe('abort / reset', () => {
  it('비행 중 ABORT하면 crashed(aborted)', () => {
    const s = transition(flyingAt5s(), { type: 'ABORT', now: 6_000 }, cfg)
    expect(s.phase).toBe('crashed')
    expect(s.crashReason).toBe('aborted')
    expect(s.elapsedMs).toBe(1_000)
  })

  it('landed/crashed에서만 RESET으로 idle', () => {
    expect(transition(flyingAt5s(), { type: 'RESET', now: 6_000 }, cfg).phase).toBe('flying')
    const crashed = transition(flyingAt5s(), { type: 'ABORT', now: 6_000 }, cfg)
    const s = transition(crashed, { type: 'RESET', now: 7_000 }, cfg)
    expect(s).toMatchObject({ phase: 'idle', route: null, elapsedMs: 0, pausesUsed: 0 })
  })

  it('종료 상태는 시간이 흘러도 변하지 않는다', () => {
    const crashed = transition(flyingAt5s(), { type: 'ABORT', now: 6_000 }, cfg)
    expect(transition(crashed, { type: 'TICK', now: 1e9 }, cfg)).toBe(crashed)
    expect(transition(crashed, { type: 'PAUSE', now: 1e9 }, cfg).phase).toBe('crashed')
  })
})
