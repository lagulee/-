import type { FlightConfig } from './config'

/**
 * 비행 상태 기계
 *
 *   idle → boarding → flying ⇄ turbulence → landed | crashed
 *                       ⇅          │
 *                     paused ←─────┘
 *
 * - 순수 함수(reducer)로만 구성한다. 시간은 항상 이벤트의 `now`로 받는다.
 * - flying 중 비허용 창이 toleranceMs 이상 이어지면 turbulence.
 * - turbulence가 graceMs를 넘기면 crashed, 그 전에 복귀하면 flying.
 * - 집중 시간(elapsedMs)은 flying 동안에만 쌓인다.
 */
export type Phase = 'idle' | 'boarding' | 'flying' | 'turbulence' | 'paused' | 'landed' | 'crashed'

export interface Route {
  from: string
  to: string
  distanceKm: number
}

export type CrashReason = 'turbulence' | 'aborted'

export interface FlightState {
  phase: Phase
  route: Route | null
  durationMs: number
  /** 집중으로 인정된 누적 시간 */
  elapsedMs: number
  /** 현재 phase에 들어온 시각 */
  phaseSince: number
  /** elapsedMs를 마지막으로 정산한 시각 */
  lastUpdate: number
  /** 가장 최근에 보고된 포커스 상태(허용 창 여부) */
  focused: boolean
  /** flying 중 비허용 창으로 이탈하기 시작한 시각 */
  awaySince: number | null
  pausesUsed: number
  /** 난기류 진입 횟수 */
  turbulenceCount: number
  crashReason: CrashReason | null
}

export type FlightEvent =
  | { type: 'BOARD'; route: Route; durationMs: number; now: number }
  | { type: 'CANCEL'; now: number }
  | { type: 'TICK'; now: number }
  | { type: 'FOCUS'; allowed: boolean; now: number }
  | { type: 'PAUSE'; now: number }
  | { type: 'RESUME'; now: number }
  | { type: 'ABORT'; now: number }
  | { type: 'RESET'; now: number }

export type MachineConfig = Pick<
  FlightConfig,
  'boardingMs' | 'toleranceMs' | 'graceMs' | 'maxPauses' | 'maxPauseMs'
>

export function initialState(now = 0): FlightState {
  return {
    phase: 'idle',
    route: null,
    durationMs: 0,
    elapsedMs: 0,
    phaseSince: now,
    lastUpdate: now,
    focused: true,
    awaySince: null,
    pausesUsed: 0,
    turbulenceCount: 0,
    crashReason: null
  }
}

export function progress(s: FlightState): number {
  return s.durationMs > 0 ? Math.min(1, s.elapsedMs / s.durationMs) : 0
}

export function remainingMs(s: FlightState): number {
  return Math.max(0, s.durationMs - s.elapsedMs)
}

export function isActive(s: FlightState): boolean {
  return s.phase === 'boarding' || s.phase === 'flying' || s.phase === 'turbulence' || s.phase === 'paused'
}

/** 비행 재개(이륙·일시정지 해제·난기류 탈출) 시각 t로 flying 상태를 만든다 */
function enterFlying(s: FlightState, t: number): FlightState {
  return { ...s, phase: 'flying', phaseSince: t, lastUpdate: t, awaySince: s.focused ? null : t }
}

/** 한 단계의 시간 경과를 처리한다. 상태가 바뀌지 않으면 같은 객체를 돌려준다. */
function step(s: FlightState, now: number, cfg: MachineConfig): FlightState {
  switch (s.phase) {
    case 'boarding': {
      const takeoff = s.phaseSince + cfg.boardingMs
      return now >= takeoff ? enterFlying(s, takeoff) : s
    }
    case 'flying': {
      const landAt = s.lastUpdate + (s.durationMs - s.elapsedMs)
      const turbAt = s.awaySince === null ? Infinity : s.awaySince + cfg.toleranceMs
      const until = Math.min(now, landAt, turbAt)
      const accrued = { ...s, elapsedMs: s.elapsedMs + Math.max(0, until - s.lastUpdate), lastUpdate: until }
      if (landAt <= now && landAt <= turbAt) {
        return { ...accrued, elapsedMs: s.durationMs, phase: 'landed', phaseSince: landAt, awaySince: null }
      }
      if (turbAt <= now) {
        return {
          ...accrued,
          phase: 'turbulence',
          phaseSince: turbAt,
          turbulenceCount: s.turbulenceCount + 1
        }
      }
      return until === s.lastUpdate ? s : accrued
    }
    case 'turbulence': {
      const crashAt = s.phaseSince + cfg.graceMs
      return now >= crashAt
        ? { ...s, phase: 'crashed', phaseSince: crashAt, lastUpdate: crashAt, crashReason: 'turbulence' }
        : s
    }
    case 'paused': {
      const resumeAt = s.phaseSince + cfg.maxPauseMs
      return now >= resumeAt ? enterFlying(s, resumeAt) : s
    }
    default:
      return s
  }
}

/** now 시각까지 시간을 흘려보낸다 (여러 전이가 연쇄로 일어날 수 있음) */
export function advance(s: FlightState, now: number, cfg: MachineConfig): FlightState {
  let cur = s
  for (let i = 0; i < 16; i++) {
    const next = step(cur, now, cfg)
    if (next === cur) return cur
    cur = next
  }
  return cur
}

export function transition(s: FlightState, ev: FlightEvent, cfg: MachineConfig): FlightState {
  const cur = advance(s, ev.now, cfg)
  switch (ev.type) {
    case 'TICK':
      return cur

    case 'BOARD':
      if (cur.phase !== 'idle' || ev.durationMs <= 0) return cur
      return advance(
        {
          ...initialState(ev.now),
          phase: 'boarding',
          route: ev.route,
          durationMs: ev.durationMs,
          focused: cur.focused
        },
        ev.now,
        cfg
      )

    case 'CANCEL':
      return cur.phase === 'boarding' ? { ...initialState(ev.now), focused: cur.focused } : cur

    case 'FOCUS': {
      const s2 = { ...cur, focused: ev.allowed }
      if (cur.phase === 'flying') {
        if (ev.allowed) return { ...s2, awaySince: null }
        return advance({ ...s2, awaySince: cur.awaySince ?? ev.now }, ev.now, cfg)
      }
      if (cur.phase === 'turbulence' && ev.allowed) return enterFlying(s2, ev.now)
      return cur.focused === ev.allowed ? cur : s2
    }

    case 'PAUSE':
      if ((cur.phase !== 'flying' && cur.phase !== 'turbulence') || cur.pausesUsed >= cfg.maxPauses) {
        return cur
      }
      return {
        ...cur,
        phase: 'paused',
        phaseSince: ev.now,
        lastUpdate: ev.now,
        awaySince: null,
        pausesUsed: cur.pausesUsed + 1
      }

    case 'RESUME':
      return cur.phase === 'paused' ? advance(enterFlying(cur, ev.now), ev.now, cfg) : cur

    case 'ABORT':
      if (cur.phase === 'boarding') return { ...initialState(ev.now), focused: cur.focused }
      if (!isActive(cur)) return cur
      return { ...cur, phase: 'crashed', phaseSince: ev.now, lastUpdate: ev.now, crashReason: 'aborted' }

    case 'RESET':
      return cur.phase === 'landed' || cur.phase === 'crashed'
        ? { ...initialState(ev.now), focused: cur.focused }
        : cur
  }
}
