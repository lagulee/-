import { geoGraticule10, geoNaturalEarth1, geoPath, type GeoProjection } from 'd3-geo'
import { useMemo } from 'react'
import { feature } from 'topojson-client'
import type { Topology } from 'topojson-specification'
import land110m from 'world-atlas/land-110m.json'
import { CITIES, findCity } from '../../../shared/cities'
import { greatCirclePath, slerp, type LatLon } from '../../../shared/geo'

const W = 960
const H = 500

const topo = land110m as unknown as Topology
const land = feature(topo, topo.objects.land)

const worldProjection = geoNaturalEarth1()
  .rotate([-150, 0]) // 태평양 중심 지도: 한국과 미국 서부가 함께 보인다
  .fitExtent(
    [
      [8, 8],
      [W - 8, H - 8]
    ],
    { type: 'Sphere' }
  )

function makeLayers(projection: GeoProjection) {
  const path = geoPath(projection)
  return {
    projection,
    path,
    land: path(land) ?? '',
    grat: path(geoGraticule10()) ?? '',
    sphere: path({ type: 'Sphere' }) ?? ''
  }
}

const worldLayers = makeLayers(worldProjection)

/** 노선이 화면을 채우도록 확대한 투영 (최소 30° 범위는 보이게) */
function routeProjection(a: LatLon, b: LatLon): GeoProjection {
  const mid = slerp(a, b, 0.5)
  const pts = [...greatCirclePath(a, b, 32), ...[-1, 1].flatMap((dx) => [-1, 1].map((dy) => ({ lat: mid.lat + dy * 8, lon: mid.lon + dx * 15 })))]
  return geoNaturalEarth1()
    .rotate([-mid.lon, 0])
    .fitExtent(
      [
        [20, 20],
        [W - 20, H - 20]
      ],
      { type: 'MultiPoint', coordinates: pts.map((p) => [p.lon, p.lat]) }
    )
}

const lineString = (pts: LatLon[]) => ({
  type: 'LineString' as const,
  coordinates: pts.map((p) => [p.lon, p.lat])
})

interface Props {
  from: string | null
  to: string | null
  /** 0 ~ 1 비행 진행률 (null이면 비행기 숨김) */
  progress: number | null
  plane: string
  stamps?: Record<string, number>
  shaking?: boolean
  onPickCity?: (code: string) => void
  /** true면 세계 지도 대신 노선 주변을 확대 */
  zoom?: boolean
}

export default function FlightMap({ from, to, progress, plane, stamps = {}, shaking, onPickCity, zoom }: Props) {
  const a = from ? findCity(from) : undefined
  const b = to ? findCity(to) : undefined
  const layers = useMemo(
    () => (zoom && a && b && a.code !== b.code ? makeLayers(routeProjection(a, b)) : worldLayers),
    [zoom, a, b]
  )
  const { projection, path } = layers

  const route = useMemo(() => {
    if (!a || !b || a.code === b.code) return null
    const pts = greatCirclePath(a, b, 128)
    return { full: path(lineString(pts)) ?? '' }
  }, [a, b, path])

  const flown = useMemo(() => {
    if (!a || !b || progress === null || progress <= 0) return ''
    const n = Math.max(2, Math.round(128 * progress))
    const pts = Array.from({ length: n + 1 }, (_, i) => slerp(a, b, (i / n) * progress))
    return path(lineString(pts)) ?? ''
  }, [a, b, progress, path])

  const planePos = useMemo(() => {
    if (!a || !b || progress === null) return null
    const p = slerp(a, b, progress)
    const ahead = slerp(a, b, Math.min(1, progress + 0.01))
    const behind = slerp(a, b, Math.max(0, progress - 0.01))
    const xy = projection([p.lon, p.lat])
    const x1 = projection([behind.lon, behind.lat])
    const x2 = projection([ahead.lon, ahead.lat])
    if (!xy || !x1 || !x2) return null
    // 이모지 ✈️ 는 오른쪽 위(-45°)를 향하므로 보정
    const angle = (Math.atan2(x2[1] - x1[1], x2[0] - x1[0]) * 180) / Math.PI + 45
    return { x: xy[0], y: xy[1], angle }
  }, [a, b, progress, projection])

  return (
    <svg className={`map ${shaking ? 'shake' : ''}`} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="비행 지도">
      <path d={layers.sphere} className="map-sea" />
      <path d={layers.grat} className="map-grat" />
      <path d={layers.land} className="map-land" />
      {route && <path d={route.full} className="map-route" />}
      {flown && <path d={flown} className="map-flown" />}
      {CITIES.map((c) => {
        const xy = projection([c.lon, c.lat])
        if (!xy || (zoom && (xy[0] < 0 || xy[0] > W || xy[1] < 0 || xy[1] > H))) return null
        const active = c.code === from || c.code === to
        const stamped = stamps[c.code] !== undefined
        return (
          <g
            key={c.code}
            transform={`translate(${xy[0]},${xy[1]})`}
            className={`city ${active ? 'active' : ''} ${stamped ? 'stamped' : ''} ${onPickCity ? 'pickable' : ''}`}
            onClick={onPickCity ? () => onPickCity(c.code) : undefined}
          >
            <circle r={active ? 5 : 3} />
            {(active || onPickCity) && (
              <text y={-9} textAnchor="middle">
                {c.code}
              </text>
            )}
          </g>
        )
      })}
      {planePos && (
        <text
          className="plane"
          x={planePos.x}
          y={planePos.y}
          transform={`rotate(${planePos.angle} ${planePos.x} ${planePos.y})`}
          textAnchor="middle"
          dominantBaseline="central"
        >
          {plane}
        </text>
      )}
    </svg>
  )
}
