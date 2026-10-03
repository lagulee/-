import { describe, expect, it } from 'vitest'
import { findCity } from '../src/shared/cities'
import { focusMinutes, greatCirclePath, haversineKm, slerp } from '../src/shared/geo'

const city = (c: string) => findCity(c)!

describe('haversine', () => {
  it('같은 점은 0', () => {
    expect(haversineKm(city('ICN'), city('ICN'))).toBe(0)
  })

  it('서울(인천) → 도쿄(나리타) ≈ 1,250 km', () => {
    expect(haversineKm(city('ICN'), city('NRT'))).toBeGreaterThan(1200)
    expect(haversineKm(city('ICN'), city('NRT'))).toBeLessThan(1300)
  })

  it('김포 → 하네다 ≈ 1,180 km', () => {
    expect(haversineKm(city('GMP'), city('HND'))).toBeCloseTo(1180, -1)
  })

  it('대칭이고 반둘레(≈20,015 km)를 넘지 않는다', () => {
    const a = { lat: 0, lon: 0 }
    const b = { lat: 0, lon: 180 }
    expect(haversineKm(a, b)).toBeCloseTo(Math.PI * 6371, 0)
    expect(haversineKm(city('JFK'), city('ICN'))).toBeCloseTo(haversineKm(city('ICN'), city('JFK')), 6)
  })
})

describe('slerp', () => {
  const a = city('ICN')
  const b = city('JFK')

  it('양 끝점을 지난다', () => {
    expect(slerp(a, b, 0).lat).toBeCloseTo(a.lat, 6)
    expect(slerp(a, b, 0).lon).toBeCloseTo(a.lon, 6)
    expect(slerp(a, b, 1).lat).toBeCloseTo(b.lat, 6)
    expect(slerp(a, b, 1).lon).toBeCloseTo(b.lon, 6)
  })

  it('경로 위에서 등속으로 움직인다: d(P1,P(s)) = s · d(P1,P2)', () => {
    const d = haversineKm(a, b)
    for (const s of [0.1, 0.25, 0.5, 0.9]) {
      expect(haversineKm(a, slerp(a, b, s))).toBeCloseTo(s * d, 3)
    }
  })

  it('서울 → 뉴욕 대원 경로는 북쪽(위도 60° 이상)을 지난다', () => {
    const maxLat = Math.max(...greatCirclePath(a, b).map((p) => p.lat))
    expect(maxLat).toBeGreaterThan(60)
  })
})

describe('focusMinutes', () => {
  const opts = { timeScale: 0.5, cruiseSpeedKmh: 850, minFocusMinutes: 10, maxFocusMinutes: 180 }

  it('t_집중 = k · d / v (김포→하네다 약 41분)', () => {
    expect(focusMinutes(1160, opts)).toBe(41)
  })

  it('하한·상한을 적용한다', () => {
    expect(focusMinutes(100, opts)).toBe(10)
    expect(focusMinutes(20_000, opts)).toBe(180)
  })
})
