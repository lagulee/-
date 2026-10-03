export interface LatLon {
  lat: number
  lon: number
}

export const EARTH_RADIUS_KM = 6371

const toRad = (deg: number): number => (deg * Math.PI) / 180
const toDeg = (rad: number): number => (rad * 180) / Math.PI

/** 두 지점 사이의 대원 거리(km). haversine 공식. */
export function haversineKm(a: LatLon, b: LatLon): number {
  const phi1 = toRad(a.lat)
  const phi2 = toRad(b.lat)
  const dPhi = phi2 - phi1
  const dLambda = toRad(b.lon - a.lon)
  const h =
    Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

type Vec3 = [number, number, number]

function toVec(p: LatLon): Vec3 {
  const phi = toRad(p.lat)
  const lambda = toRad(p.lon)
  return [Math.cos(phi) * Math.cos(lambda), Math.cos(phi) * Math.sin(lambda), Math.sin(phi)]
}

function fromVec([x, y, z]: Vec3): LatLon {
  return { lat: toDeg(Math.atan2(z, Math.hypot(x, y))), lon: toDeg(Math.atan2(y, x)) }
}

/**
 * 구면 선형 보간(slerp).
 * P(s) = sin((1-s)θ)/sinθ · P1 + sin(sθ)/sinθ · P2,  0 ≤ s ≤ 1
 */
export function slerp(a: LatLon, b: LatLon, s: number): LatLon {
  const t = Math.min(1, Math.max(0, s))
  const p1 = toVec(a)
  const p2 = toVec(b)
  const dot = Math.min(1, Math.max(-1, p1[0] * p2[0] + p1[1] * p2[1] + p1[2] * p2[2]))
  const theta = Math.acos(dot)
  if (theta < 1e-9) return { ...a }
  const sinTheta = Math.sin(theta)
  const w1 = Math.sin((1 - t) * theta) / sinTheta
  const w2 = Math.sin(t * theta) / sinTheta
  return fromVec([w1 * p1[0] + w2 * p2[0], w1 * p1[1] + w2 * p2[1], w1 * p1[2] + w2 * p2[2]])
}

/** 대원 경로를 n개 구간으로 나눈 점 목록 (지도에 곡선으로 그릴 때 사용) */
export function greatCirclePath(a: LatLon, b: LatLon, segments = 64): LatLon[] {
  return Array.from({ length: segments + 1 }, (_, i) => slerp(a, b, i / segments))
}

/** 실제 비행시간(h) = d / v */
export function realFlightHours(distanceKm: number, speedKmh: number): number {
  return distanceKm / speedKmh
}

/** 집중 시간(분) = k · t_실, 하한/상한으로 자른 뒤 1분 단위로 반올림 */
export function focusMinutes(
  distanceKm: number,
  opts: { timeScale: number; cruiseSpeedKmh: number; minFocusMinutes: number; maxFocusMinutes: number }
): number {
  const raw = opts.timeScale * realFlightHours(distanceKm, opts.cruiseSpeedKmh) * 60
  return Math.round(Math.min(opts.maxFocusMinutes, Math.max(opts.minFocusMinutes, raw)))
}
