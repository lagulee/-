import { useState } from 'react'
import { CITIES, findCity, REGIONS } from '../../../shared/cities'
import { BUCKETS, bucketOf, formatMinutes, type Bucket } from '../../../shared/durations'
import { planRoute, type Snapshot } from '../../../shared/controller'
import { progress, remainingMs } from '../../../shared/flightMachine'
import { AIRCRAFT, milesFor } from '../../../shared/rewards'
import { api } from '../api'
import { formatClock } from '../useSnapshot'
import CockpitView from './CockpitView'
import RoutePicker from './RoutePicker'

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
  const [bucket, setBucket] = useState<Bucket | null>(null)
  const plane = AIRCRAFT.find((a) => a.id === settings.aircraft)?.emoji ?? '✈️'

  if (flight.phase === 'idle') {
    const plan = planRoute(from, to, settings.config)
    const minutesFrom = (code: string): number | null => {
      const pl = planRoute(from, code, settings.config)
      return pl ? Math.round(pl.durationMs / 60_000) : null
    }
    const pickTo = (code: string): void => {
      if (code !== from) setTo(code)
    }
    return (
      <div className="flight-layout">
        <div className="picker-wrap">
          <div className="bucket-chips">
            <button className={bucket === null ? 'on' : ''} onClick={() => setBucket(null)}>
              전체
            </button>
            {BUCKETS.map((b) => (
              <button
                key={b.id}
                className={bucket?.id === b.id ? 'on' : ''}
                onClick={() => setBucket(bucket?.id === b.id ? null : b)}
              >
                <i style={{ background: b.color }} />
                {b.label}
              </button>
            ))}
          </div>
          <RoutePicker
            from={from}
            to={to}
            config={settings.config}
            stamps={snap.stats.stamps}
            bucket={bucket}
            onPick={pickTo}
          />
        </div>
        <aside className="panel">
          <h2>비행 예약</h2>
          <label>
            출발
            <select
              value={from}
              onChange={(e) => {
                setFrom(e.target.value)
                if (e.target.value === to) setTo(from)
              }}
            >
              {REGIONS.map((r) => (
                <optgroup key={r} label={r}>
                  {CITIES.filter((c) => c.region === r).map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} · {c.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label>
            도착 <small>(지도에서 도시를 눌러도 됩니다)</small>
            <select value={to} onChange={(e) => pickTo(e.target.value)}>
              {REGIONS.map((r) => {
                const list = CITIES.filter((c) => c.region === r && c.code !== from).filter((c) => {
                  const m = minutesFrom(c.code)
                  return bucket === null || c.code === to || (m !== null && bucketOf(m).id === bucket.id)
                })
                if (list.length === 0) return null
                return (
                  <optgroup key={r} label={r}>
                    {list.map((c) => {
                      const m = minutesFrom(c.code)
                      return (
                        <option key={c.code} value={c.code}>
                          {c.code} · {c.name}
                          {m !== null ? ` (${formatMinutes(m)})` : ''}
                        </option>
                      )
                    })}
                  </optgroup>
                )
              })}
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
  const boardingLeft = flight.phase === 'boarding' ? flight.phaseSince + settings.config.boardingMs - snap.now : 0
  const pausesLeft = settings.config.maxPauses - flight.pausesUsed
  const done = flight.phase === 'landed' || flight.phase === 'crashed'

  return (
    <div className="flight-layout">
      <CockpitView snap={snap} plane={plane} />
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
          <dd>{formatMinutes(props.minutes)}</dd>
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
      {w && <div className="muted small">판정: {w.reason}</div>}
      <div className="muted small">
        브라우저 확장: {snap.extensionConnected ? '연결됨 (URL로 판정)' : '미연결 (창 제목으로 근사)'}
      </div>
    </div>
  )
}
