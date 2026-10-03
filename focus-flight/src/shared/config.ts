/**
 * 실험적으로 정한 값들은 모두 여기 모아 둔다.
 * (k = 0.5, 유예 10초 등은 임의값이므로 써 보면서 조정한다.)
 */
export interface FlightConfig {
  /** 실제 비행시간 → 집중 시간 환산 비율 k */
  timeScale: number
  /** 순항 속도 v (km/h) */
  cruiseSpeedKmh: number
  /** 탑승(카운트다운) 시간 */
  boardingMs: number
  /** 이 시간 이상 연속으로 이탈해야 난기류로 판정 (Alt+Tab 오탐 방지) */
  toleranceMs: number
  /** 난기류 상태에서 이 시간을 넘기면 추락 */
  graceMs: number
  /** 한 비행당 일시정지 허용 횟수 */
  maxPauses: number
  /** 일시정지 1회 최대 길이. 넘으면 자동으로 비행 재개 */
  maxPauseMs: number
  /** 활성 창 감시 주기 */
  pollIntervalMs: number
  /** 집중 시간 하한/상한 (너무 짧거나 긴 노선 보정) */
  minFocusMinutes: number
  maxFocusMinutes: number
}

export const DEFAULT_CONFIG: FlightConfig = {
  timeScale: 0.5,
  cruiseSpeedKmh: 850,
  boardingMs: 5_000,
  toleranceMs: 2_000,
  graceMs: 10_000,
  maxPauses: 2,
  maxPauseMs: 5 * 60_000,
  pollIntervalMs: 1_000,
  minFocusMinutes: 10,
  maxFocusMinutes: 360
}
