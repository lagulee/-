import { useEffect, useState } from 'react'
import { isMock, MOCK_WINDOWS, setMockWindow } from './api'
import FlightView from './components/FlightView'
import Passport from './components/Passport'
import SettingsView from './components/SettingsView'
import { prewarmGlobe } from './three/earthTexture'
import { useSnapshot } from './useSnapshot'

type Tab = 'flight' | 'passport' | 'settings'

const TABS: { id: Tab; label: string }[] = [
  { id: 'flight', label: '✈️ 비행' },
  { id: 'passport', label: '🛂 여권' },
  { id: 'settings', label: '⚙️ 설정' }
]

export default function App() {
  const snap = useSnapshot()
  const [tab, setTab] = useState<Tab>('flight')
  // 3D 지구 텍스처를 한가할 때 미리 그려 이륙 순간 끊기지 않게 한다
  useEffect(() => prewarmGlobe(), [])
  if (!snap) return <div className="loading">관제탑 연결 중…</div>

  return (
    <div className="app">
      <header>
        <div className="brand">
          Focus <span>Flight</span>
        </div>
        <nav>
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="miles">{snap.stats.totalMiles.toLocaleString()} mi</div>
      </header>
      {isMock && <MockBar />}
      <main>
        {tab === 'flight' && <FlightView snap={snap} />}
        {tab === 'passport' && <Passport snap={snap} />}
        {tab === 'settings' && <SettingsView snap={snap} />}
      </main>
    </div>
  )
}

/** 브라우저 미리보기 전용: 활성 창을 가상으로 바꿔 본다 */
function MockBar() {
  const [i, setI] = useState(0)
  return (
    <div className="mockbar">
      미리보기 모드 · 가상 활성 창:
      <select
        value={i}
        onChange={(e) => {
          const n = Number(e.target.value)
          setI(n)
          setMockWindow(MOCK_WINDOWS[n])
        }}
      >
        {MOCK_WINDOWS.map((w, n) => (
          <option key={n} value={n}>
            {w.processName} — {w.title}
          </option>
        ))}
      </select>
    </div>
  )
}
