import { describe, expect, it } from 'vitest'
import { computeStats, type FlightRecord } from '../src/shared/records'
import { milesFor, unlockedAircraft } from '../src/shared/rewards'

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime()

function rec(endedAt: number, outcome: 'landed' | 'crashed', to = 'NRT', focusMin = 30): FlightRecord {
  return {
    id: String(endedAt),
    from: 'ICN',
    to,
    distanceKm: 1200,
    plannedMs: focusMin * 60_000,
    focusMs: focusMin * 60_000,
    startedAt: endedAt - focusMin * 60_000,
    endedAt,
    outcome,
    crashReason: outcome === 'crashed' ? 'turbulence' : null,
    turbulenceCount: 0,
    miles: 100
  }
}

describe('computeStats', () => {
  // 2026-10-03은 토요일 → 이번 주 시작은 9/28(월)
  const now = at(2026, 10, 3, 18)

  it('합계·주간·도장', () => {
    const s = computeStats(
      [rec(at(2026, 9, 20), 'landed', 'LHR'), rec(at(2026, 9, 29), 'landed'), rec(at(2026, 10, 1), 'crashed', 'JFK')],
      now
    )
    expect(s.totalMiles).toBe(300)
    expect(s.weekFocusMs).toBe(60 * 60_000)
    expect(s.landedCount).toBe(2)
    expect(s.crashedCount).toBe(1)
    expect(Object.keys(s.stamps).sort()).toEqual(['LHR', 'NRT'])
  })

  it('연속 일수: 오늘 비행 전이면 어제부터 센다, 추락한 날은 끊긴다', () => {
    const base = [rec(at(2026, 9, 30), 'landed'), rec(at(2026, 10, 1), 'landed'), rec(at(2026, 10, 2), 'landed')]
    expect(computeStats(base, now).streakDays).toBe(3)
    expect(computeStats([...base, rec(at(2026, 10, 3), 'landed')], now).streakDays).toBe(4)
    expect(computeStats([rec(at(2026, 10, 1), 'landed'), rec(at(2026, 10, 2), 'crashed')], now).streakDays).toBe(0)
  })
})

describe('rewards', () => {
  it('m = c·t^α 는 α>1에서 장시간 집중에 가중치를 준다', () => {
    expect(milesFor(0)).toBe(0)
    expect(milesFor(60) / 60).toBeGreaterThan(milesFor(30) / 30)
  })

  it('누적 마일리지로 기종이 해금된다', () => {
    expect(unlockedAircraft(0).map((a) => a.id)).toEqual(['prop'])
    expect(unlockedAircraft(20_000).map((a) => a.id)).toEqual(['prop', 'a320', 'b787'])
  })
})
