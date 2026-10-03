import type { CrashReason } from './flightMachine'

export interface FlightRecord {
  id: string
  from: string
  to: string
  distanceKm: number
  plannedMs: number
  focusMs: number
  startedAt: number
  endedAt: number
  outcome: 'landed' | 'crashed'
  crashReason: CrashReason | null
  turbulenceCount: number
  miles: number
}

export interface Stats {
  totalMiles: number
  totalFocusMs: number
  weekFocusMs: number
  landedCount: number
  crashedCount: number
  /** 오늘(또는 어제)까지 이어진 연속 착륙 일수 */
  streakDays: number
  /** 도착 도시별 첫 도장 시각 */
  stamps: Record<string, number>
}

/** 로컬 시간 기준 날짜 키 (YYYY-MM-DD) */
export function dayKey(t: number): string {
  const d = new Date(t)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** 이번 주 월요일 0시 (로컬) */
export function startOfWeek(now: number): number {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  const offset = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - offset)
  return d.getTime()
}

export function computeStats(records: FlightRecord[], now: number): Stats {
  const weekStart = startOfWeek(now)
  const stamps: Record<string, number> = {}
  const landedDays = new Set<string>()
  let totalMiles = 0
  let totalFocusMs = 0
  let weekFocusMs = 0
  let landedCount = 0
  let crashedCount = 0

  for (const r of records) {
    totalMiles += r.miles
    totalFocusMs += r.focusMs
    if (r.endedAt >= weekStart) weekFocusMs += r.focusMs
    if (r.outcome === 'landed') {
      landedCount++
      landedDays.add(dayKey(r.endedAt))
      if (stamps[r.to] === undefined || r.endedAt < stamps[r.to]) stamps[r.to] = r.endedAt
    } else {
      crashedCount++
    }
  }

  // 오늘 기록이 없으면 어제부터 거꾸로 센다 (오늘 아직 비행 전이어도 연속 기록 유지)
  const cursor = new Date(now)
  cursor.setHours(12, 0, 0, 0)
  if (!landedDays.has(dayKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1)
  let streakDays = 0
  while (landedDays.has(dayKey(cursor.getTime()))) {
    streakDays++
    cursor.setDate(cursor.getDate() - 1)
  }

  return { totalMiles, totalFocusMs, weekFocusMs, landedCount, crashedCount, streakDays, stamps }
}
