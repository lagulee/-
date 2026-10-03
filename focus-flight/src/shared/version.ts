/** "0.1.12" > "0.1.3" 처럼 숫자 단위로 비교한다 */
export function isNewerVersion(candidate: string, current: string): boolean {
  const a = candidate.split('.').map((n) => parseInt(n, 10) || 0)
  const b = current.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)
    if (d !== 0) return d > 0
  }
  return false
}
