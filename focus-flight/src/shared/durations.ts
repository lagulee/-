/** 집중 시간대 구분 (지도 색과 필터에 사용) */
export interface Bucket {
  id: string
  label: string
  /** 분, min 이상 max 미만 */
  min: number
  max: number
  color: string
}

export const BUCKETS: Bucket[] = [
  { id: 'short', label: '~30분', min: 0, max: 30, color: '#3ddc97' },
  { id: 'hour', label: '30분~1시간', min: 30, max: 60, color: '#4fb3ff' },
  { id: 'two', label: '1~2시간', min: 60, max: 120, color: '#ffd166' },
  { id: 'four', label: '2~4시간', min: 120, max: 240, color: '#ff9f5a' },
  { id: 'long', label: '4시간+', min: 240, max: Infinity, color: '#ff6b9a' }
]

export function bucketOf(minutes: number): Bucket {
  return BUCKETS.find((b) => minutes >= b.min && minutes < b.max) ?? BUCKETS[BUCKETS.length - 1]
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${min}분`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`
}
