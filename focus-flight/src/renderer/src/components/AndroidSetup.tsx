import { useEffect, useMemo, useState } from 'react'
import type { AllowList } from '../../../shared/allowlist'
import { getAndroidEnv, onAndroidEnv, refreshAndroidEnv } from '../api'
import { FocusMonitor } from '../native/focusMonitor'

function useAndroidEnv(): ReturnType<typeof getAndroidEnv> {
  const [env, setEnv] = useState(getAndroidEnv)
  useEffect(() => onAndroidEnv(() => setEnv(getAndroidEnv())), [])
  return env
}

/** 권한 안내: 사용 기록 접근(앱 감지)과 알림(난기류 경고) */
export function PermissionBanner({ compact }: { compact?: boolean }) {
  const env = useAndroidEnv()
  if (!env) return null
  if (env.usageGranted && env.notificationsGranted) return compact ? null : <p className="perm ok">✅ 앱 감지와 알림이 켜져 있습니다.</p>
  return (
    <div className="perm">
      {!env.usageGranted && (
        <div>
          <b>앱 감지를 켜 주세요</b>
          <p className="small">
            비행 중에 어떤 앱을 쓰는지 알려면 <b>사용 기록 접근</b> 권한이 필요합니다. 설정 화면에서 <b>Focus Flight</b>를 찾아
            허용해 주세요. (기록은 휴대폰 밖으로 나가지 않습니다)
          </p>
          <p className="small muted">권한이 없으면 Focus Flight 화면을 벗어나는 것 자체를 이탈로 봅니다.</p>
          <button className="primary" onClick={() => void FocusMonitor.openUsageSettings()}>
            사용 기록 접근 허용하러 가기
          </button>
        </div>
      )}
      {!env.notificationsGranted && (
        <div>
          <b>난기류 알림 허용</b>
          <p className="small">다른 앱을 쓸 때 "돌아오세요" 알림을 띄우려면 알림 권한이 필요합니다.</p>
          <button
            onClick={() =>
              void FocusMonitor.requestNotifications()
                .then(() => refreshAndroidEnv())
                .catch(() => undefined)
            }
          >
            알림 허용
          </button>
        </div>
      )}
    </div>
  )
}

/** 허용 앱 고르기 (설치된 앱 목록에서) */
export function AndroidAppPicker(props: { list: AllowList; locked: boolean; onChange: (apps: string[]) => void }) {
  const [apps, setApps] = useState<{ pkg: string; label: string }[] | null>(null)
  const [q, setQ] = useState('')
  useEffect(() => {
    void FocusMonitor.listApps()
      .then((r) => setApps(r.apps))
      .catch(() => setApps([]))
  }, [])
  const selected = new Set(props.list.apps)
  const shown = useMemo(() => {
    const all = apps ?? []
    const f = q.trim().toLowerCase()
    const filtered = f ? all.filter((a) => a.label.toLowerCase().includes(f) || a.pkg.includes(f)) : all
    // 허용한 앱을 위로
    return [...filtered].sort((a, b) => Number(selected.has(b.pkg)) - Number(selected.has(a.pkg)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apps, q, props.list.apps])

  return (
    <div className="app-picker">
      <h3>허용 앱 ({selected.size}개)</h3>
      <p className="muted small">
        비행 중에 써도 되는 앱을 고르세요. 음악 앱은 백그라운드 재생만 하면 고르지 않아도 됩니다. 홈 화면·알림창·화면 끄기는 이탈이 아닙니다.
      </p>
      <input placeholder="앱 이름 검색" value={q} onChange={(e) => setQ(e.target.value)} />
      {apps === null ? (
        <p className="muted small">앱 목록을 불러오는 중…</p>
      ) : (
        <ul>
          {shown.map((a) => {
            const on = selected.has(a.pkg)
            // 비행 중에는 허용을 늘릴 수 없다 (끄는 것만 가능)
            const disabled = props.locked && !on
            return (
              <li key={a.pkg}>
                <label className={disabled ? 'disabled' : ''}>
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={disabled}
                    onChange={(e) =>
                      props.onChange(e.target.checked ? [...props.list.apps, a.pkg] : props.list.apps.filter((p) => p !== a.pkg))
                    }
                  />
                  <span>{a.label}</span>
                  <small className="muted">{a.pkg}</small>
                </label>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
