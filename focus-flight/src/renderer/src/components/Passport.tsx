import { CITIES, findCity } from '../../../shared/cities'
import type { Snapshot } from '../../../shared/controller'
import { AIRCRAFT } from '../../../shared/rewards'
import { formatClock, formatHours } from '../useSnapshot'

export default function Passport({ snap }: { snap: Snapshot }) {
  const { stats } = snap
  const next = AIRCRAFT.find((a) => a.unlockMiles > stats.totalMiles)
  return (
    <div className="page">
      <section className="tiles">
        <Tile label="누적 마일리지" value={stats.totalMiles.toLocaleString()} />
        <Tile label="이번 주 비행" value={formatHours(stats.weekFocusMs)} />
        <Tile label="연속 성공" value={`${stats.streakDays}일`} />
        <Tile label="착륙 / 추락" value={`${stats.landedCount} / ${stats.crashedCount}`} />
      </section>

      <section>
        <h2>여권 도장 ({Object.keys(stats.stamps).length} / {CITIES.length})</h2>
        <div className="stamps">
          {CITIES.map((c) => {
            const at = stats.stamps[c.code]
            return (
              <div key={c.code} className={`stamp ${at ? '' : 'empty'}`} title={c.name}>
                {c.code}
                <small>{at ? new Date(at).toLocaleDateString('ko-KR') : c.name}</small>
              </div>
            )
          })}
        </div>
      </section>

      <section>
        <h2>기종</h2>
        <div className="aircraft">
          {AIRCRAFT.map((a) => (
            <div key={a.id} className={`ac ${stats.totalMiles >= a.unlockMiles ? '' : 'locked'}`}>
              <span>{a.emoji}</span>
              <b>{a.name}</b>
              <small>{a.unlockMiles.toLocaleString()} 마일</small>
            </div>
          ))}
        </div>
        {next && (
          <p className="muted">
            {next.name}까지 {(next.unlockMiles - stats.totalMiles).toLocaleString()} 마일 남음
          </p>
        )}
      </section>

      <section>
        <h2>최근 비행</h2>
        {snap.recentRecords.length === 0 ? (
          <p className="muted">아직 비행 기록이 없습니다.</p>
        ) : (
          <table className="log">
            <thead>
              <tr>
                <th>날짜</th>
                <th>노선</th>
                <th>집중</th>
                <th>결과</th>
                <th>마일</th>
              </tr>
            </thead>
            <tbody>
              {snap.recentRecords.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.endedAt).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td>
                    {r.from} → {r.to} <span className="muted">{findCity(r.to)?.name}</span>
                  </td>
                  <td>{formatClock(r.focusMs)}</td>
                  <td className={r.outcome}>{r.outcome === 'landed' ? '🛬 착륙' : '💥 추락'}</td>
                  <td>{r.miles.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="tile">
      <div className="tile-value">{value}</div>
      <div className="tile-label">{label}</div>
    </div>
  )
}
