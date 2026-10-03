import { geoEquirectangular, geoPath, type GeoProjection } from 'd3-geo'
import { feature, mesh } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import { CITIES } from '../../../shared/cities'

/** 지도 데이터는 비행이 시작될 때만 필요하므로 지연 로드한다 */
export interface GeoData {
  land: GeoJSON.FeatureCollection | GeoJSON.Feature
  borders: GeoJSON.MultiLineString
}

let geoPromise: Promise<GeoData> | null = null

export function loadGeoData(): Promise<GeoData> {
  geoPromise ??= Promise.all([
    import('world-atlas/land-50m.json'),
    import('world-atlas/countries-50m.json')
  ]).then(([landMod, countriesMod]) => {
    const land = (landMod.default ?? landMod) as unknown as Topology
    const countries = (countriesMod.default ?? countriesMod) as unknown as Topology
    const obj = countries.objects.countries as GeometryCollection
    return {
      land: feature(land, land.objects.land),
      borders: mesh(countries, obj, (a, b) => a !== b)
    }
  })
  return geoPromise
}

/** 위도별 지표 색 (극지방 눈 → 침엽수 → 온대 → 아열대 건조 → 열대 우림) */
const LAT_STOPS: [number, string][] = [
  [90, '#f4f7fa'],
  [72, '#e3eaee'],
  [64, '#5d7a5a'],
  [55, '#3f6b3f'],
  [42, '#5c8a45'],
  [32, '#a4a06a'],
  [22, '#b9a273'],
  [12, '#4f8a3c'],
  [0, '#2f7436']
]

let grain: HTMLCanvasElement | null = null

/** 지형 질감용 노이즈 패턴 */
function grainCanvas(): HTMLCanvasElement {
  if (grain) return grain
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(256, 256)
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 110 + Math.random() * 145
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v
    img.data[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  // 큰 얼룩(산맥·평야 느낌)
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * 256
    const y = Math.random() * 256
    const r = 10 + Math.random() * 40
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    const dark = Math.random() < 0.5
    g.addColorStop(0, dark ? 'rgba(40,40,40,0.35)' : 'rgba(255,255,255,0.3)')
    g.addColorStop(1, 'rgba(128,128,128,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 256, 256)
  }
  grain = c
  return c
}

/**
 * projection으로 지도를 canvas에 그린다.
 * latTop/latBottom: 이 canvas가 덮는 위도 범위 (지표 색 그라데이션 계산용)
 */
function paint(
  ctx: CanvasRenderingContext2D,
  projection: GeoProjection,
  geo: GeoData,
  w: number,
  h: number,
  latTop: number,
  latBottom: number,
  detail: number
): void {
  const path = geoPath(projection, ctx)

  // 바다: 적도는 밝고 극지방은 어둡게
  ctx.fillStyle = latGradient(ctx, h, latTop, latBottom, SEA_STOPS)
  ctx.fillRect(0, 0, w, h)

  // 얕은 바다 (해안선 주변 밝은 띠)
  ctx.lineJoin = 'round'
  for (const [width, alpha] of [
    [10 * detail, 0.12],
    [5 * detail, 0.18],
    [2 * detail, 0.25]
  ]) {
    ctx.beginPath()
    path(geo.land)
    ctx.strokeStyle = `rgba(90, 190, 210, ${alpha})`
    ctx.lineWidth = width
    ctx.stroke()
  }

  // 육지: 위도별 색 + 질감
  ctx.save()
  ctx.beginPath()
  path(geo.land)
  ctx.clip()
  ctx.fillStyle = latGradient(ctx, h, latTop, latBottom, LAT_STOPS)
  ctx.fillRect(0, 0, w, h)
  ctx.globalCompositeOperation = 'multiply'
  const pattern = ctx.createPattern(grainCanvas(), 'repeat')!
  ctx.fillStyle = pattern
  ctx.fillRect(0, 0, w, h)
  ctx.restore()

  // 해안선과 국경
  ctx.globalCompositeOperation = 'source-over'
  ctx.beginPath()
  path(geo.land)
  ctx.strokeStyle = 'rgba(230, 220, 180, 0.35)'
  ctx.lineWidth = 0.8 * detail
  ctx.stroke()
  ctx.beginPath()
  path(geo.borders)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)'
  ctx.lineWidth = 0.6 * detail
  ctx.setLineDash([3 * detail, 2 * detail])
  ctx.stroke()
  ctx.setLineDash([])
}

const SEA_STOPS: [number, string][] = [
  [90, '#16304a'],
  [55, '#1b466b'],
  [0, '#1f5f8f']
]

/** 북반구 기준 색 목록을 남반구로 대칭시킨 뒤, 위도 범위 [latBottom, latTop]에 맞는 세로 그라데이션을 만든다 */
function latGradient(
  ctx: CanvasRenderingContext2D,
  h: number,
  latTop: number,
  latBottom: number,
  north: [number, string][]
): CanvasGradient {
  const all = [...north, ...north.filter(([l]) => l > 0).map(([l, c]) => [-l, c] as [number, string]).reverse()]
  const colorAt = (lat: number): string => {
    let best = all[0]
    for (const st of all) if (Math.abs(st[0] - lat) < Math.abs(best[0] - lat)) best = st
    return best[1]
  }
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, colorAt(latTop))
  for (const [lat, col] of all) {
    const t = (latTop - lat) / (latTop - latBottom)
    if (t > 0 && t < 1) g.addColorStop(t, col)
  }
  g.addColorStop(1, colorAt(latBottom))
  return g
}

let globeCache: HTMLCanvasElement | null = null

/** 지구 전체 텍스처를 한 번만 그려 둔다 (앱이 한가할 때 미리 호출하면 이륙 순간 끊김이 없다) */
export async function globeCanvas(): Promise<{ geo: GeoData; canvas: HTMLCanvasElement }> {
  const geo = await loadGeoData()
  globeCache ??= paintGlobe(geo)
  return { geo, canvas: globeCache }
}

export function prewarmGlobe(): void {
  const run = (): void => void globeCanvas().catch(() => undefined)
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 5000 })
  else setTimeout(run, 1500)
}

/** 지구 전체 텍스처 (equirectangular, 2:1) */
export function paintGlobe(geo: GeoData, width = 4096): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = width
  c.height = width / 2
  const projection = geoEquirectangular()
    .scale(width / (2 * Math.PI))
    .translate([width / 2, width / 4])
    .precision(0.5)
  paint(c.getContext('2d')!, projection, geo, c.width, c.height, 90, -90, 1)
  return c
}

export interface Patch {
  canvas: HTMLCanvasElement
  /** 중심 경위도와 덮는 범위(도) */
  lat: number
  lon: number
  lonSpan: number
  latSpan: number
}

/**
 * 비행기 주변만 고해상도로 그린 조각 텍스처.
 * 경도 방향으로 선형인 equirectangular 투영이라 SphereGeometry의 부분 구에 그대로 입힐 수 있다.
 */
export function paintPatch(geo: GeoData, lat: number, lon: number, lonSpan = 24, latSpan = 12, width = 2048): Patch {
  const height = Math.round((width * latSpan) / lonSpan)
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  const scale = width / ((lonSpan * Math.PI) / 180)
  const projection = geoEquirectangular()
    .rotate([-lon, 0])
    .scale(scale)
    .translate([width / 2, height / 2 + (lat * Math.PI * scale) / 180])
    // 조각 밖은 그리지 않는다 (확대율이 커서 전 세계를 그리면 매우 느리다)
    .clipExtent([
      [-64, -64],
      [width + 64, height + 64]
    ])
    .precision(0.1)
  const ctx = c.getContext('2d')!
  const fine = latSpan < 4
  paint(ctx, projection, geo, width, height, lat + latSpan / 2, lat - latSpan / 2, fine ? 3 : 2)
  if (fine) paintGroundDetail(ctx, projection, geo, width, height)
  return { canvas: c, lat, lon, lonSpan, latSpan }
}

/** 저고도용: 농경지 조각과 도시(공항 주변)를 그려 이착륙 때 속도감과 크기감을 준다 */
function paintGroundDetail(
  ctx: CanvasRenderingContext2D,
  projection: GeoProjection,
  geo: GeoData,
  w: number,
  h: number
): void {
  const path = geoPath(projection, ctx)
  ctx.save()
  ctx.beginPath()
  path(geo.land)
  ctx.clip()
  const fields = ['#6f8f4a', '#879a55', '#5d7d3c', '#a39a62', '#7a8c4c', '#4e6f37']
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * w
    const y = Math.random() * h
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate((Math.random() - 0.5) * 0.6)
    ctx.globalAlpha = 0.35
    ctx.fillStyle = fields[i % fields.length]
    ctx.fillRect(0, 0, 8 + Math.random() * 30, 6 + Math.random() * 22)
    ctx.restore()
  }
  // 도시: 공항 주변 회색 시가지와 도로
  for (const c of CITIES) {
    const xy = projection([c.lon, c.lat])
    if (!xy || xy[0] < -300 || xy[0] > w + 300 || xy[1] < -300 || xy[1] > h + 300) continue
    for (let i = 0; i < 260; i++) {
      const r = Math.abs(randn()) * 90
      const a = Math.random() * Math.PI * 2
      ctx.globalAlpha = 0.5
      ctx.fillStyle = i % 3 === 0 ? '#9a9a96' : '#7d7f80'
      ctx.fillRect(xy[0] + Math.cos(a) * r, xy[1] + Math.sin(a) * r, 3 + Math.random() * 7, 3 + Math.random() * 7)
    }
    ctx.globalAlpha = 0.45
    ctx.strokeStyle = '#c9c4b5'
    ctx.lineWidth = 1.5
    for (let k = 0; k < 7; k++) {
      const a = Math.random() * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(xy[0], xy[1])
      ctx.lineTo(xy[0] + Math.cos(a) * 400, xy[1] + Math.sin(a) * 400)
      ctx.stroke()
    }
  }
  ctx.restore()
  ctx.globalAlpha = 1
}

function randn(): number {
  return Math.sqrt(-2 * Math.log(Math.random() || 1e-9)) * Math.cos(2 * Math.PI * Math.random())
}
