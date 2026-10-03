import type { FlightState } from '../../shared/flightMachine'

/** 비행 연출용 값: 이륙 상승과 착륙 하강을 집중 시간에 맞춰 계산한다 (순수 함수, 테스트 가능) */
export interface Motion {
  progress: number
  /** 0(지상) ~ 1(순항) */
  altitude: number
  pitch: number
  /** 구름이 흘러가는 시각적 속도 */
  airspeed: number
}

/** 활주로 가속 → 기수 들기 → 상승 → 순항 → 하강 */
const ROLL_MS = 8_000
const ROTATE_MS = 1_500
const CLIMB_MS = 40_000
const DESCENT_MS = 40_000
const ROTATE_PITCH = 0.17
const CRUISE_AIRSPEED = 16

const smooth = (x: number): number => {
  const t = Math.min(1, Math.max(0, x))
  return t * t * (3 - 2 * t)
}

export function flightMotion(f: FlightState, liveElapsedMs: number): Motion {
  const duration = Math.max(1, f.durationMs)
  const elapsed = Math.min(duration, Math.max(0, liveElapsedMs))
  const remaining = duration - elapsed
  // 짧은 비행에서도 상승·순항·하강이 모두 보이도록 길이를 비행 시간의 1/4 이하로 제한
  const rollMs = Math.min(ROLL_MS, duration / 10)
  const climbMs = Math.min(CLIMB_MS, duration / 4)
  const descentMs = Math.min(DESCENT_MS, duration / 4)
  const progress = elapsed / duration

  switch (f.phase) {
    case 'idle':
    case 'boarding':
      return { progress: 0, altitude: 0, pitch: 0, airspeed: 0 }
    case 'landed':
      return { progress: 1, altitude: 0, pitch: 0, airspeed: 0 }
    default: {
      const climbT = (elapsed - rollMs) / climbMs
      const climb = smooth(climbT)
      const descent = smooth(remaining / descentMs)
      const altitude = Math.min(climb, descent)
      let pitch = 0
      if (elapsed < rollMs) pitch = ROTATE_PITCH * smooth((elapsed - (rollMs - ROTATE_MS)) / ROTATE_MS)
      else if (climbT < 1) pitch = ROTATE_PITCH * (1 - smooth((climbT - 0.55) / 0.45))
      else if (remaining < descentMs) pitch = -0.05 * Math.sin(Math.PI * (1 - remaining / descentMs))
      // 활주로에서는 0에서부터 가속
      const roll = smooth(elapsed / rollMs)
      const airspeed = f.phase === 'paused' ? 0 : CRUISE_AIRSPEED * (0.35 * roll + 0.65 * altitude)
      return { progress, altitude, pitch, airspeed }
    }
  }
}

export function instruments(m: Motion, cruiseKmh: number): { feet: number; kmh: number } {
  return {
    feet: Math.round((m.altitude * 37_000) / 100) * 100,
    kmh: Math.round((cruiseKmh * m.airspeed) / CRUISE_AIRSPEED)
  }
}
