import { useSnapshot } from '../useSnapshot'

/** 난기류 때만 화면 위쪽에 뜨는 경고 (클릭 통과, 포커스 없음) */
export default function Overlay() {
  const snap = useSnapshot()
  if (!snap || snap.flight.phase !== 'turbulence') return null
  const left = Math.ceil((snap.flight.phaseSince + snap.settings.config.graceMs - snap.now) / 1000)
  return (
    <div className="overlay shake">
      <div className="overlay-title">⚠️ 난기류 발생</div>
      <div>
        {Math.max(0, left)}초 안에 허용된 앱으로 돌아오지 않으면 <b>추락</b>합니다
      </div>
      {snap.activeWindow && (
        <div className="overlay-sub">
          지금 창: {snap.activeWindow.processName} — {snap.activeWindow.reason}
        </div>
      )}
    </div>
  )
}
