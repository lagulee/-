/**
 * 마일리지 보상: m = c · t^α  (t: 집중 시간[분])
 * α > 1 이면 dm/dt = cα·t^(α-1) 이 t에 따라 커져 긴 집중일수록 분당 보상이 늘어난다.
 */
export const MILES_PER_MINUTE = 10
export const MILES_ALPHA = 1.2

export function milesFor(focusMinutes: number, c = MILES_PER_MINUTE, alpha = MILES_ALPHA): number {
  if (focusMinutes <= 0) return 0
  return Math.round(c * focusMinutes ** alpha)
}

export interface Aircraft {
  id: string
  name: string
  emoji: string
  /** 해금에 필요한 누적 마일리지 */
  unlockMiles: number
}

export const AIRCRAFT: Aircraft[] = [
  { id: 'prop', name: '프로펠러기', emoji: '🛩️', unlockMiles: 0 },
  { id: 'a320', name: 'A320', emoji: '✈️', unlockMiles: 3_000 },
  { id: 'b787', name: 'B787 드림라이너', emoji: '🛫', unlockMiles: 15_000 },
  { id: 'a380', name: 'A380', emoji: '🛬', unlockMiles: 50_000 },
  { id: 'rocket', name: '로켓', emoji: '🚀', unlockMiles: 150_000 }
]

export function unlockedAircraft(totalMiles: number): Aircraft[] {
  return AIRCRAFT.filter((a) => totalMiles >= a.unlockMiles)
}
