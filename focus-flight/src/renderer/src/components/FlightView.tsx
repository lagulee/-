import { useState } from 'react'
import { CITIES, findCity } from '../../../shared/cities'
import { planRoute, type Snapshot } from '../../../shared/controller'
import { progress, remainingMs } from '../../../shared/flightMachine'
import { AIRCRAFT, milesFor } from '../../../shared/rewards'
import { api } from '../api'
import { formatClock } from '../useSnapshot'
import FlightMap from './FlightMap'

const PHASE_TEXT = {
  idle: '목적지를 고르세요',
  boarding: '탑승 중… 곧 이륙합니다',
  flying: '순항 중',
  turbulence: '난기류! 허용된 앱으로 돌아오세요',
  paused: '일시정지 (기내 대기)',
  landed: '착륙했습니다',
  crashed: '추락했습니다'
} as const

export default function FlightView({ snap }: { snap: Snapshot }) {
  const { flight, settings } = snap
  const [from, setFrom] = useState('ICN')
  const [to, setTo] = useState('NRT')
  const plane = AIRCRAFT.find((a) => a.id === settings.aircraft)?.emoji ?? '✈️'

  if (flight.phase === 'idle') {
    const plan = planRoute(from, to, settings.config)
    return (
      <div className="flight-layout">
        <FlightMap
          from={from}
          to={to}
          progress={null}
          plane={plane}
          stamps={snap.stats.stamps}
          onPickCity={(c) => {
            if (c !== from) setTo(c)
          }}
        />
        <aside className="panel">
          <h2>비행 예약</h2>
          <label>
            출발
            <select value={from} onChange={(e) => setFrom(e.target.value)}>
              {CITIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} · {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            도착 <small>(지도에서 도시를 눌러도 됩니다)</small>
            <select value={to} onChange={(e) => setTo(e.target.value)}>
              {CITIES.map((c) => (
                <option key={c.code} value={c.code} disabled={c.code === from}>
                  {c.code} · {c.name}
                </option>
              ))}
            </select>
          </label>
          {plan ? (
            <BoardingPass
              from={from}
              to={to}
              distanceKm={plan.route.distanceKm}
              minutes={plan.durationMs / 60_000}
              k={settings.config.timeScale}
            />
          ) : (
            <p className="muted">출발지와 다른 도착지를 고르세요.</p>
          )}
          <button className="primary big" disabled={!plan} onClick={() => void api.board(from, to)}>
            탑승하기
          </button>
        </aside>
      </div>
    )
  }

  const p = progress(flight)
  const route = flight.route!
  const turbulenceLeft =
    flight.phase === 'turbulence' ? flight.phaseSince + settings.config.graceMs - snap.now : 0
  const boardingLeft = flight.phase === 'boarding' ? flight.phaseSince + settings.config.boardingMs - snap.now : 0
  const pausesLeft = settings.config.maxPauses - flight.pausesUsed
  const done = flight.phase === 'landed' || flight.phase === 'crashed'

  return (
    <div className="flight-layout">
      <div className="map-wrap">
        <FlightMap
          from={route.from}
          to={route.to}
          progress={flight.phase === 'boarding' ? 0 : p}
          plane={flight.phase === 'crashed' ? '💥' : plane}
          stamps={snap.stats.stamps}
          shaking={flight.phase === 'turbulence'}
        />
        {flight.phase === 'turbulence' && (
          <div className="banner danger">
            ⚠️ 난기류! {Math.ceil(turbulenceLeft / 1000)}초 안에 돌아오지 않으면 추락합니다
          </div>
        )}
      </div>
      <aside className={`panel phase-${flight.phase}`}>
        <div className="route-title">
          {route.from} <span>✈</span> {route.to}
        </div>
        <div className="muted">
          {findCity(route.from)?.name} → {findCity(route.to)?.name} · {route.distanceKm.toLocaleString()} km
        </div>
        <div className="phase-badge">{PHASE_TEXT[flight.phase]}</div>
        <div className="clock">
          {flight.phase === 'boarding' ? formatClock(boardingLeft) : formatClock(remainingMs(flight))}
        </div>
        <div className="progress">
          <div style={{ width: `${p * 100}%` }} />
        </div>
        <div className="muted small">
          {Math.round(p * 100)}% · 난기류 {flight.turbulenceCount}회
        </div>

        {done ? (
          <Result snap={snap} />
        ) : (
          <div className="controls">
            {flight.phase === 'boarding' && <button onClick={() => void api.cancel()}>탑승 취소</button>}
            {(flight.phase === 'flying' || flight.phase === 'turbulence') && (
              <button disabled={pausesLeft <= 0} onClick={() => void api.pause()}>
                일시정지 ({pausesLeft}회 남음)
              </button>
            )}
            {flight.phase === 'paused' && (
              <button className="primary" onClick={() => void api.resume()}>
                비행 재개 (최대 {Math.round(settings.config.maxPauseMs / 60_000)}분 후 자동 재개)
              </button>
            )}
            {flight.phase !== 'boarding' && (
              <button
                className="danger"
                onClick={() => {
                  if (confirm('비행을 포기하면 추락으로 기록됩니다. 계속할까요?')) void api.abort()
                }}
              >
                비행 포기
              </button>
            )}
          </div>
        )}
        <WindowStatus snap={snap} />
      </aside>
    </div>
  )
}

function BoardingPass(props: { from: string; to: string; distanceKm: number; minutes: number; k: number }) {
  const hours = props.distanceKm / 850
  return (
    <div className="boarding-pass">
      <div className="bp-head">BOARDING PASS · FOCUS AIR</div>
      <div className="bp-route">
        <div>
          <b>{props.from}</b>
          <small>{findCity(props.from)?.name}</small>
        </div>
        <span>✈</span>
        <div>
          <b>{props.to}</b>
          <small>{findCity(props.to)?.name}</small>
        </div>
      </div>
      <dl>
        <div>
          <dt>거리</dt>
          <dd>{props.distanceKm.toLocaleString()} km</dd>
        </div>
        <div>
          <dt>실제 비행</dt>
          <dd>{hours.toFixed(1)} h</dd>
        </div>
        <div>
          <dt>집중 시간</dt>
          <dd>{props.minutes}분</dd>
        </div>
        <div>
          <dt>예상 마일</dt>
          <dd>{milesFor(props.minutes).toLocaleString()}</dd>
        </div>
      </dl>
      <div className="bp-foot">t집중 = k · d / v = {props.k} × {props.distanceKm} / 850 h</div>
    </div>
  )
}

function Result({ snap }: { snap: Snapshot }) {
  const r = snap.lastRecord
  const landed = snap.flight.phase === 'landed'
  return (
    <div className={`result ${landed ? 'ok' : 'fail'}`}>
      {landed ? (
        <>
          <div className="stamp">
            {r?.to}
            <small>{findCity(r?.to ?? '')?.name}</small>
          </div>
          <p>여권에 도장이 찍혔습니다!</p>
        </>
      ) : (
        <p>{snap.flight.crashReason === 'aborted' ? '비행을 포기했습니다.' : '난기류를 벗어나지 못했습니다.'}</p>
      )}
      {r && <p className="muted">+{r.miles.toLocaleString()} 마일 · 집중 {formatClock(r.focusMs)}</p>}
      <button className="primary" onClick={() => void api.reset()}>
        새 비행 예약
      </button>
    </div>
  )
}

function WindowStatus({ snap }: { snap: Snapshot }) {
  const w = snap.activeWindow
  return (
    <div className="window-status">
      <div>
        현재 창:{' '}
        {w ? (
          <span className={`verdict ${w.verdict}`}>
            {w.processName} · {w.verdict === 'allowed' ? '허용' : w.verdict === 'blocked' ? '비허용' : '시스템'}
          </span>
        ) : (
          <span className="muted">감지 안 됨</span>
        )}
      </div>
      {w?.title && <div className="muted small ellipsis">{w.title}</div>}
      <div className="muted small">
        브라우저 확장: {snap.extensionConnected ? '연결됨 (URL로 판정)' : '미연결 (창 제목으로 근사)'}
      </div>
    </div>
  )
}
