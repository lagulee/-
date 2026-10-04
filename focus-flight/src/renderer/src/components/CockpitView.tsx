import { useEffect, useRef, useState } from 'react'
import { findCity } from '../../../shared/cities'
import type { Snapshot } from '../../../shared/controller'
import { flightMotion, instruments, type Motion } from '../flightMotion'
import { FlightScene, type CameraMode } from '../three/FlightScene'
import CabinWindow from './CabinWindow'
import FlightMap from './FlightMap'

type View = CameraMode | 'map'

const VIEWS: { id: View; label: string }[] = [
  { id: 'chase', label: '3인칭' },
  { id: 'cockpit', label: '조종석' },
  { id: 'window', label: '창가석' },
  { id: 'map', label: '지도' }
]

const VIEW_KEY = 'focus-flight-view'

function savedView(): View {
  try {
    const v = localStorage.getItem(VIEW_KEY)
    if (v && VIEWS.some((x) => x.id === v)) return v as View
  } catch {
    // 저장소를 못 쓰면 기본값
  }
  return 'chase'
}

/**
 * 비행기 시점의 3D 비행 화면.
 * 스냅샷은 1초에 한 번 오므로, 그 사이의 진행률은 렌더러 시계로 보간한다.
 */
export default function CockpitView({ snap, plane }: { snap: Snapshot; plane: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<FlightScene | null>(null)
  const [view, setView] = useState<View>(savedView)
  const [failed, setFailed] = useState(false)
  const [motion, setMotion] = useState<Motion>(() => flightMotion(snap.flight, snap.flight.elapsedMs))

  // 최신 스냅샷과 받은 시각
  const live = useRef({ snap, receivedAt: performance.now(), crashAt: null as number | null })
  useEffect(() => {
    const prev = live.current
    const crashAt =
      snap.flight.phase === 'crashed' ? (prev.snap.flight.phase === 'crashed' ? prev.crashAt : performance.now()) : null
    live.current = { snap, receivedAt: performance.now(), crashAt }
  }, [snap])

  const route = snap.flight.route!
  const from = findCity(route.from)!
  const to = findCity(route.to)!

  useEffect(() => {
    if (view === 'map') return
    const canvas = canvasRef.current!
    let scene: FlightScene
    try {
      scene = new FlightScene(canvas)
    } catch {
      setFailed(true)
      return
    }
    sceneRef.current = scene
    scene.setMode(view)
    const fit = (): void => {
      const r = wrapRef.current!.getBoundingClientRect()
      scene.resize(Math.max(1, r.width), Math.max(1, r.height))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(wrapRef.current!)

    let raf = 0
    let last = performance.now()
    let hudTick = 0
    const loop = (now: number): void => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const { snap: s, receivedAt, crashAt } = live.current
      const f = s.flight
      const sinceSnap = now - receivedAt
      const elapsedAtSnap = f.phase === 'flying' ? f.elapsedMs + Math.max(0, s.now - f.lastUpdate) : f.elapsedMs
      const elapsed = f.phase === 'flying' ? elapsedAtSnap + sinceSnap : elapsedAtSnap
      const m = flightMotion(f, elapsed)
      const a = findCity(f.route?.from ?? '') ?? from
      const b = findCity(f.route?.to ?? '') ?? to
      scene.setRoute(a, b)
      scene.render(
        {
          from: a,
          to: b,
          ...m,
          turbulence: f.phase === 'turbulence',
          crashSeconds: crashAt === null ? null : (now - crashAt) / 1000
        },
        dt
      )
      hudTick += dt
      if (hudTick > 0.25) {
        hudTick = 0
        setMotion(m)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      scene.dispose()
      sceneRef.current = null
    }
    // 시점이 바뀌면 장면을 새로 만들지 않고 카메라만 바꾼다 (아래 effect)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view === 'map'])

  useEffect(() => {
    if (view !== 'map') sceneRef.current?.setMode(view)
    try {
      localStorage.setItem(VIEW_KEY, view)
    } catch {
      // 무시
    }
  }, [view])

  const f = snap.flight
  const { feet, kmh } = instruments(motion, snap.settings.config.cruiseSpeedKmh)
  const leftKm = Math.round(route.distanceKm * (1 - motion.progress))
  const remainingMs = Math.max(0, f.durationMs - f.elapsedMs)
  const eta = new Date(Date.now() + remainingMs).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  const turbulenceLeft = f.phase === 'turbulence' ? f.phaseSince + snap.settings.config.graceMs - snap.now : 0
  const w = snap.activeWindow
  const showMap = view === 'map' || failed

  return (
    <div className={`cockpit view-${showMap ? 'map' : view} ${f.phase === 'turbulence' ? 'turb' : ''}`} ref={wrapRef}>
      {showMap ? (
        <div className="cockpit-map">
          <FlightMap
            from={route.from}
            to={route.to}
            progress={f.phase === 'boarding' ? 0 : motion.progress}
            plane={f.phase === 'crashed' ? '💥' : plane}
            stamps={snap.stats.stamps}
            shaking={f.phase === 'turbulence'}
          />
        </div>
      ) : (
        <canvas ref={canvasRef} className="cockpit-canvas" />
      )}

      {view === 'window' && !showMap && <CabinWindow />}
      {view === 'cockpit' && !showMap && (
        <div className="dashboard">
          <div className="gauge">
            <small>ALT</small>
            <b>{feet.toLocaleString()}</b>
            <small>ft</small>
          </div>
          <div className="gauge">
            <small>SPD</small>
            <b>{kmh}</b>
            <small>km/h</small>
          </div>
          <div className="gauge">
            <small>DIST</small>
            <b>{leftKm.toLocaleString()}</b>
            <small>km</small>
          </div>
        </div>
      )}

      <div className="hud-top">
        <div className="hud-route">
          <b>{route.from}</b> {from.name} <span>✈</span> <b>{route.to}</b> {to.name}
        </div>
        <div className="hud-views">
          {VIEWS.map((v) => (
            <button key={v.id} className={view === v.id ? 'on' : ''} onClick={() => setView(v.id)}>
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {f.phase === 'boarding' && (
        <div className="hud-center">
          <div className="hud-big">{Math.max(0, Math.ceil((f.phaseSince + snap.settings.config.boardingMs - snap.now) / 1000))}</div>
          <div>탑승 완료 · 곧 이륙합니다</div>
        </div>
      )}
      {f.phase === 'paused' && (
        <div className="hud-center">
          <div className="hud-big">⏸</div>
          <div>일시정지 · 기내 대기 중</div>
        </div>
      )}
      {f.phase === 'turbulence' && (
        <div className="hud-alert">
          <div className="hud-alert-title">⚠️ 난기류! {Math.max(0, Math.ceil(turbulenceLeft / 1000))}초 안에 돌아오세요</div>
          {w && (
            <div className="hud-alert-sub">
              지금 앱: {w.appName ?? w.processName} — {w.reason}
            </div>
          )}
        </div>
      )}

      <div className="hud-bottom">
        <div className="hud-stats">
          <span>고도 {feet.toLocaleString()} ft</span>
          <span>속도 {kmh} km/h</span>
          <span>남은 거리 {leftKm.toLocaleString()} km</span>
          <span>도착 예정 {eta}</span>
        </div>
        <div className="hud-progress">
          <div className="hud-progress-fill" style={{ width: `${motion.progress * 100}%` }} />
          <span className="hud-progress-plane" style={{ left: `${motion.progress * 100}%` }}>
            ✈
          </span>
        </div>
      </div>

      {!showMap && (
        <div className="minimap">
          <FlightMap
            zoom
            from={route.from}
            to={route.to}
            progress={f.phase === 'boarding' ? 0 : motion.progress}
            plane={plane}
            stamps={snap.stats.stamps}
          />
        </div>
      )}
    </div>
  )
}
