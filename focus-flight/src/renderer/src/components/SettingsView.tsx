import { useState } from 'react'
import { BROWSERS, parsePlaylistInput, type AllowList, type WindowInfo } from '../../../shared/allowlist'
import type { FlightConfig } from '../../../shared/config'
import type { Snapshot } from '../../../shared/controller'
import { isActive } from '../../../shared/flightMachine'
import { unlockedAircraft } from '../../../shared/rewards'
import { api, platform } from '../api'
import { AndroidAppPicker, PermissionBanner } from './AndroidSetup'

export default function SettingsView({ snap }: { snap: Snapshot }) {
  const { settings } = snap
  const list = settings.allowlist
  const flying = isActive(snap.flight)
  const setList = (patch: Partial<AllowList>): void => void api.updateSettings({ allowlist: { ...list, ...patch } })
  const setConfig = (patch: Partial<FlightConfig>): void =>
    void api.updateSettings({ config: { ...settings.config, ...patch } })
  const w = snap.activeWindow

  return (
    <div className="page settings">
      {flying && <p className="banner warn">비행 중에는 허용 목록을 넓힐 수 없습니다. (자기 약속 지키기!)</p>}

      {platform === 'android' ? (
        <section>
          <h2>권한</h2>
          <PermissionBanner />
          <AndroidAppPicker list={list} locked={flying} onChange={(apps) => setList({ apps })} />
        </section>
      ) : (
      <section>
        <h2>허용 목록</h2>
        <p className="muted">목록에 없는 창이 앞에 오면 난기류가 발생합니다. 시스템 창(작업 표시줄, UAC 등)은 무시합니다.</p>
        {w && w.verdict === 'blocked' && !flying && <QuickAllow w={w} list={list} setList={setList} />}
        <ListEditor
          title="앱 (실행 파일 이름)"
          placeholder="예: code.exe"
          items={list.apps}
          locked={flying}
          onChange={(apps) => setList({ apps })}
        />
        <ListEditor
          title="사이트 (도메인, 하위 도메인 포함)"
          placeholder="예: notion.so"
          items={list.sites}
          locked={flying}
          normalize={(s) => s.replace(/^https?:\/\//, '').split('/')[0].toLowerCase() || null}
          onChange={(sites) => setList({ sites })}
        />
        <ListEditor
          title="플레이리스트 (YouTube 링크 또는 ID)"
          placeholder="https://www.youtube.com/playlist?list=..."
          items={list.playlists}
          locked={flying}
          normalize={parsePlaylistInput}
          onChange={(playlists) => setList({ playlists })}
        />
        <ListEditor
          title="창 제목 키워드 (확장 없이 플레이리스트를 근사할 때)"
          placeholder="예: 공부 플레이리스트"
          items={list.titleKeywords}
          locked={flying}
          onChange={(titleKeywords) => setList({ titleKeywords })}
        />
      </section>
      )}

      <section>
        <h2>비행 규칙</h2>
        <p className="muted">아래 값은 임의로 정한 기본값입니다. 써 보면서 맞춰 보세요.</p>
        <div className="grid">
          <NumberField label="환산 비율 k" step={0.05} value={settings.config.timeScale} disabled={flying}
            onChange={(v) => setConfig({ timeScale: v })} />
          <NumberField label="이탈 허용(초)" value={settings.config.toleranceMs / 1000} disabled={flying}
            onChange={(v) => setConfig({ toleranceMs: v * 1000 })} />
          <NumberField label="난기류 유예(초)" value={settings.config.graceMs / 1000} disabled={flying}
            onChange={(v) => setConfig({ graceMs: v * 1000 })} />
          <NumberField label="일시정지 횟수" value={settings.config.maxPauses} disabled={flying}
            onChange={(v) => setConfig({ maxPauses: Math.round(v) })} />
          <NumberField label="일시정지 최대(분)" value={settings.config.maxPauseMs / 60_000} disabled={flying}
            onChange={(v) => setConfig({ maxPauseMs: v * 60_000 })} />
          <NumberField label="최소 집중(분)" value={settings.config.minFocusMinutes} disabled={flying}
            onChange={(v) => setConfig({ minFocusMinutes: v })} />
          <NumberField label="최대 집중(분)" value={settings.config.maxFocusMinutes} disabled={flying}
            onChange={(v) => setConfig({ maxFocusMinutes: v })} />
        </div>
      </section>

      <section>
        <h2>기타</h2>
        <label className="row">
          기종
          <select value={settings.aircraft} onChange={(e) => void api.updateSettings({ aircraft: e.target.value })}>
            {unlockedAircraft(snap.stats.totalMiles).map((a) => (
              <option key={a.id} value={a.id}>
                {a.emoji} {a.name}
              </option>
            ))}
          </select>
        </label>
        {platform === 'desktop' && (
        <label className="row">
          <input
            type="checkbox"
            checked={settings.launchAtLogin}
            onChange={(e) => void api.updateSettings({ launchAtLogin: e.target.checked })}
          />
          Windows 시작 시 트레이에서 자동 실행
        </label>
        )}
        <button
          className="danger"
          disabled={flying}
          onClick={() => {
            if (confirm('모든 비행 기록과 도장을 지울까요?')) void api.clearRecords()
          }}
        >
          기록 초기화
        </button>
      </section>
    </div>
  )
}

/** 지금 보고 있는 창을 허용 목록에 넣는 단축 버튼. 브라우저는 통째로가 아니라 사이트 단위로만 */
function QuickAllow({ w, list, setList }: { w: WindowInfo; list: AllowList; setList: (p: Partial<AllowList>) => void }) {
  if (!BROWSERS.includes(w.processName.toLowerCase())) {
    return (
      <button onClick={() => setList({ apps: [...list.apps, w.processName] })}>
        지금 보고 있는 앱({w.processName}) 허용하기
      </button>
    )
  }
  let host: string | null = null
  try {
    host = w.url ? new URL(w.url).hostname.replace(/^www\./, '') : null
  } catch {
    host = null
  }
  return host ? (
    <button onClick={() => setList({ sites: [...list.sites, host] })}>지금 보고 있는 사이트({host}) 허용하기</button>
  ) : null
}

function ListEditor(props: {
  title: string
  placeholder: string
  items: string[]
  locked: boolean
  normalize?: (s: string) => string | null
  onChange: (items: string[]) => void
}) {
  const [draft, setDraft] = useState('')
  const [error, setError] = useState(false)
  const add = (): void => {
    const v = props.normalize ? props.normalize(draft) : draft.trim() || null
    if (!v) {
      setError(true)
      return
    }
    if (!props.items.includes(v)) props.onChange([...props.items, v])
    setDraft('')
    setError(false)
  }
  return (
    <div className="list-editor">
      <h3>{props.title}</h3>
      <div className="chips">
        {props.items.length === 0 && <span className="muted small">비어 있음</span>}
        {props.items.map((it) => (
          <span key={it} className="chip">
            {it}
            {/* 비행 중에는 지우는 것(더 엄격하게)만 허용 */}
            <button aria-label={`${it} 삭제`} onClick={() => props.onChange(props.items.filter((x) => x !== it))}>
              ×
            </button>
          </span>
        ))}
      </div>
      <form
        className="add-row"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <input
          value={draft}
          disabled={props.locked}
          placeholder={props.placeholder}
          className={error ? 'invalid' : ''}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" disabled={props.locked || !draft.trim()}>
          추가
        </button>
      </form>
    </div>
  )
}

function NumberField(props: {
  label: string
  value: number
  step?: number
  disabled: boolean
  onChange: (v: number) => void
}) {
  return (
    <label>
      {props.label}
      <input
        type="number"
        min={0}
        step={props.step ?? 1}
        value={props.value}
        disabled={props.disabled}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (Number.isFinite(v) && v >= 0) props.onChange(v)
        }}
      />
    </label>
  )
}
