import { describe, expect, it } from 'vitest'
import { initialState, type FlightState } from '../src/shared/flightMachine'
import { flightMotion, instruments } from '../src/renderer/src/flightMotion'

const MIN = 60_000
const flying = (durationMs: number, phase: FlightState['phase'] = 'flying'): FlightState => ({
  ...initialState(0),
  phase,
  durationMs,
  route: { from: 'ICN', to: 'NRT', distanceKm: 1200 }
})

describe('flightMotion', () => {
  it('탑승 중에는 지상에 정지', () => {
    expect(flightMotion(flying(40 * MIN, 'boarding'), 0)).toMatchObject({ altitude: 0, airspeed: 0, progress: 0 })
  })

  it('활주로에서 가속한 뒤 기수를 들고 이륙한다', () => {
    const f = flying(40 * MIN)
    const start = flightMotion(f, 0)
    expect(start).toMatchObject({ altitude: 0, pitch: 0, airspeed: 0 })
    const roll = flightMotion(f, 5_000)
    expect(roll.altitude).toBe(0)
    expect(roll.airspeed).toBeGreaterThan(0)
    expect(flightMotion(f, 7_900).pitch).toBeGreaterThan(0.1)
  })

  it('상승, 중간엔 순항, 끝에서 하강', () => {
    const f = flying(40 * MIN)
    const takeoff = flightMotion(f, 20_000)
    expect(takeoff.altitude).toBeGreaterThan(0)
    expect(takeoff.altitude).toBeLessThan(1)
    expect(takeoff.pitch).toBeGreaterThan(0.1)
    expect(flightMotion(f, 20 * MIN)).toMatchObject({ altitude: 1, pitch: 0 })
    const approach = flightMotion(f, 40 * MIN - 20_000)
    expect(approach.altitude).toBeLessThan(1)
    expect(approach.pitch).toBeLessThan(0)
    expect(flightMotion(f, 40 * MIN).altitude).toBe(0)
  })

  it('1분짜리 비행도 상승·순항·하강이 모두 있다', () => {
    const f = flying(MIN)
    expect(flightMotion(f, 31_000).altitude).toBe(1)
    expect(flightMotion(f, 10_000).altitude).toBeLessThan(1)
  })

  it('일시정지면 구름이 멈추고, 착륙하면 도착지 지상', () => {
    expect(flightMotion(flying(40 * MIN, 'paused'), 20 * MIN).airspeed).toBe(0)
    expect(flightMotion(flying(40 * MIN, 'landed'), 40 * MIN)).toMatchObject({ progress: 1, altitude: 0 })
  })

  it('계기판: 순항 37,000 ft / 순항 속도', () => {
    expect(instruments(flightMotion(flying(40 * MIN), 20 * MIN), 850)).toEqual({ feet: 37_000, kmh: 850 })
  })
})
