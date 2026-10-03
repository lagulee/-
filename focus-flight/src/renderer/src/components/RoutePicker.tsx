import { geoGraticule10, geoNaturalEarth1, geoPath, type GeoProjection } from 'd3-geo'
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { feature } from 'topojson-client'
import type { Topology } from 'topojson-specification'
import land110m from 'world-atlas/land-110m.json'
import { CITIES, findCity, type City } from '../../../shared/cities'
import type { FlightConfig } from '../../../shared/config'
import { planRoute } from '../../../shared/controller'
import { bucketOf, formatMinutes, type Bucket } from '../../../shared/durations'
import { greatCirclePath, slerp, type LatLon } from '../../../shared/geo'

const W = 960
const H = 560
const topo110 = land110m as unknown as Topology
const land110 = feature(topo110, topo110.objects.land)
const graticule = geoGraticule10()

/** 확대하면 세밀한 해안선(50m)을 쓴다. 처음 확대할 때 불러온다 */
let land50: GeoJSON.FeatureCollection | GeoJSON.Feature | null = null
let land50Promise: Promise<void> | null = null
function loadLand50(): Promise<void> {
  land50Promise ??= import('world-atlas/land-50m.json').then((m) => {
    const t = (m.default ?? m) as unknown as Topology
    land50 = feature(t, t.objects.land)
  })
  return land50Promise
}

interface View {
  k: number
  lon: number
  lat: number
}

const WORLD: View = { k: 1, lon: 150, lat: 15 }
const MIN_K = 1
const MAX_K = 24
const baseScale = geoNaturalEarth1().fitExtent([[8, 8], [W - 8, H - 8]], { type: 'Sphere' }).scale()

function makeProjection(v: View): GeoProjection {
  return geoNaturalEarth1()
    .rotate([-v.lon, 0])
    .center([0, v.lat])
    .scale(baseScale * v.k)
    .translate([W / 2, H / 2])
    .clipExtent([
      [-20, -20],
      [W + 20, H + 20]
    ])
}

/** 노선이 화면에 꽉 차도록 하는 보기 */
function fitRoute(a: LatLon, b: LatLon): View {
  const mid = slerp(a, b, 0.5)
  const pts = greatCirclePath(a, b, 32)
  const p = geoNaturalEarth1()
    .rotate([-mid.lon, 0])
    .fitExtent(
      [
        [80, 70],
        [W - 80, H - 70]
      ],
      { type: 'MultiPoint', coordinates: pts.map((q) => [q.lon, q.lat]) }
    )
  const center = p.invert?.([W / 2, H / 2]) ?? [mid.lon, mid.lat]
  return { k: Math.min(MAX_K, Math.max(MIN_K, p.scale() / baseScale)), lon: mid.lon, lat: center[1] }
}

interface Props {
  from: string
  to: string
  config: FlightConfig
  stamps: Record<string, number>
  /** 이 시간대만 강조 (null이면 전체) */
  bucket: Bucket | null
  onPick: (code: string) => void
}

/**
 * 비행 예약용 지도. 휠로 확대·축소, 끌어서 이동, 도시를 눌러 도착지 선택.
 * 도시 점의 색은 출발지에서의 집중 시간대.
 */
export default function RoutePicker({ from, to, config, stamps, bucket, onPick }: Props) {
  const [view, setView] = useState<View>(WORLD)
  const [moving, setMoving] = useState(false)
  const [hover, setHover] = useState<string | null>(null)
  const [, setDetailReady] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{ x: number; y: number; view: View; moved: boolean } | null>(null)

  const projection = useMemo(() => makeProjection(view), [view])
  const path = useMemo(() => geoPath(projection), [projection])

  useEffect(() => {
    if (view.k >= 2.5 && !land50) void loadLand50().then(() => setDetailReady(true))
  }, [view.k])

  // 드래그 중에는 가벼운 지도, 멈추면 세밀한 지도
  const landPath = useMemo(
    () => path(view.k >= 2.5 && land50 && !moving ? land50 : land110) ?? '',
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [path, moving, land50]
  )
  const gratPath = useMemo(() => path(graticule) ?? '', [path])
  const spherePath = useMemo(() => path({ type: 'Sphere' }) ?? '', [path])

  const a = findCity(from)
  const b = findCity(to)
  const routePath = useMemo(() => {
    if (!a || !b || a.code === b.code) return ''
    return path({ type: 'LineString', coordinates: greatCirclePath(a, b, 96).map((p) => [p.lon, p.lat]) }) ?? ''
  }, [a, b, path])

  const minutesTo = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of CITIES) {
      const plan = planRoute(from, c.code, config)
      if (plan) m.set(c.code, plan.durationMs / 60_000)
    }
    return m
  }, [from, config])

  // 출발지가 바뀌면 그 주변으로 이동
  useEffect(() => {
    const c = findCity(from)
    if (c) setView((v) => (v.k > 1.5 ? { ...v, lon: c.lon, lat: c.lat } : v))
  }, [from])

  // 휠 확대: 커서 아래 지점이 고정되도록
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      const r = svg.getBoundingClientRect()
      const mx = ((e.clientX - r.left) / r.width) * W
      const my = ((e.clientY - r.top) / r.height) * H
      setView((v) => zoomAt(v, Math.exp(-e.deltaY * 0.0015), mx, my))
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [])

  const onDown = (e: PointerEvent<SVGSVGElement>): void => {
    drag.current = { x: e.clientX, y: e.clientY, view, moved: false }
  }
  const onMove = (e: PointerEvent<SVGSVGElement>): void => {
    const d = drag.current
    if (!d) return
    const r = svgRef.current!.getBoundingClientRect()
    const dx = ((e.clientX - d.x) / r.width) * W
    const dy = ((e.clientY - d.y) / r.height) * H
    if (!d.moved && Math.hypot(dx, dy) < 4) return
    if (!d.moved) {
      d.moved = true
      svgRef.current!.setPointerCapture(e.pointerId)
      setMoving(true)
    }
    const s = baseScale * d.view.k
    setView({
      ...d.view,
      lon: wrapLon(d.view.lon - (dx / s) * (180 / Math.PI)),
      lat: clampLat(d.view.lat + (dy / s) * (180 / Math.PI))
    })
  }
  const onUp = (e: PointerEvent<SVGSVGElement>): void => {
    const d = drag.current
    drag.current = null
    setMoving(false)
    if (d && !d.moved) {
      const code = (e.target as Element).closest('[data-code]')?.getAttribute('data-code')
      if (code && code !== from) onPick(code)
    }
  }

  const zoomBy = (f: number): void => setView((v) => zoomAt(v, f, W / 2, H / 2))
  const showLabels = view.k >= 2.2
  const hovered = hover ? findCity(hover) : null
  const hoverXY = hovered ? projection([hovered.lon, hovered.lat]) : null

  return (
    <div className="picker-map">
      <svg
        ref={svgRef}
        className={`map ${moving ? 'grabbing' : ''}`}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="도착지 선택 지도"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={() => setHover(null)}
      >
        <path d={spherePath} className="map-sea" />
        <path d={gratPath} className="map-grat" />
        <path d={landPath} className="map-land" />
        {routePath && <path d={routePath} className="map-route" />}
        {CITIES.map((c) => {
          const xy = projection([c.lon, c.lat])
          if (!xy || xy[0] < -10 || xy[0] > W + 10 || xy[1] < -10 || xy[1] > H + 10) return null
          const isFrom = c.code === from
          const isTo = c.code === to
          const min = minutesTo.get(c.code)
          const bk = min === undefined ? null : bucketOf(min)
          const dim = bucket !== null && bk?.id !== bucket.id && !isFrom && !isTo
          return (
            <g
              key={c.code}
              data-code={c.code}
              transform={`translate(${xy[0]},${xy[1]})`}
              className={`pick-city ${isFrom ? 'from' : ''} ${isTo ? 'to' : ''} ${dim ? 'dim' : ''}`}
              onPointerEnter={() => setHover(c.code)}
              onPointerLeave={() => setHover((h) => (h === c.code ? null : h))}
            >
              <circle r={12} className="hit" />
              {stamps[c.code] !== undefined && <circle r={7} className="stamp-ring" />}
              <circle r={isFrom || isTo ? 6 : 4} style={{ fill: isFrom ? '#ffffff' : bk?.color }} />
              {(showLabels || isFrom || isTo) && (
                <text y={-10} textAnchor="middle">
                  {showLabels ? c.name : c.code}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      {hovered && hoverXY && hovered.code !== from && (
        <CityTip city={hovered} minutes={minutesTo.get(hovered.code)} x={hoverXY[0] / W} y={hoverXY[1] / H} stamped={stamps[hovered.code] !== undefined} />
      )}

      <div className="zoom-ctl">
        <button aria-label="확대" onClick={() => zoomBy(1.6)}>
          +
        </button>
        <button aria-label="축소" onClick={() => zoomBy(1 / 1.6)}>
          −
        </button>
        <button onClick={() => a && b && a.code !== b.code && setView(fitRoute(a, b))}>노선</button>
        <button onClick={() => setView(WORLD)}>전체</button>
      </div>
      <div className="map-hint">휠: 확대·축소 · 끌기: 이동 · 도시 클릭: 도착지 선택</div>
    </div>
  )

  function zoomAt(v: View, factor: number, mx: number, my: number): View {
    const k = Math.min(MAX_K, Math.max(MIN_K, v.k * factor))
    if (k === v.k) return v
    const before = makeProjection(v).invert?.([mx, my])
    const next = { ...v, k }
    if (!before) return next
    const after = makeProjection(next).invert?.([mx, my])
    if (!after) return next
    return { k, lon: wrapLon(v.lon + (before[0] - after[0])), lat: clampLat(v.lat + (before[1] - after[1])) }
  }
}

function CityTip(props: { city: City; minutes?: number; x: number; y: number; stamped: boolean }) {
  const { city, minutes } = props
  const bk = minutes === undefined ? null : bucketOf(minutes)
  return (
    <div
      className={`city-tip ${props.y < 0.3 ? 'below' : ''}`}
      style={{ left: `${Math.min(0.88, Math.max(0.12, props.x)) * 100}%`, top: `${props.y * 100}%` }}
    >
      <b>
        {city.code} · {city.name}
      </b>
      <span className="muted small">{city.region}</span>
      {minutes !== undefined && (
        <span style={{ color: bk?.color }}>집중 {formatMinutes(Math.round(minutes))}</span>
      )}
      {props.stamped && <span className="small">🛂 도장 있음</span>}
    </div>
  )
}

const wrapLon = (lon: number): number => ((((lon + 180) % 360) + 360) % 360) - 180
const clampLat = (lat: number): number => Math.max(-75, Math.min(80, lat))
