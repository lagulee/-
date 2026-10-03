import { DEFAULT_ALLOWLIST, explainWindow, type AllowList, type Verdict, type WindowInfo } from './allowlist'
import { findCity } from './cities'
import { DEFAULT_CONFIG, type FlightConfig } from './config'
import {
  initialState,
  isActive,
  transition,
  type FlightEvent,
  type FlightState,
  type Route
} from './flightMachine'
import { focusMinutes, haversineKm } from './geo'
import { computeStats, type FlightRecord, type Stats } from './records'
import { milesFor } from './rewards'

export interface Settings {
  config: FlightConfig
  allowlist: AllowList
  aircraft: string
  /** Windows 로그인 시 자동 시작 */
  launchAtLogin: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  config: DEFAULT_CONFIG,
  allowlist: DEFAULT_ALLOWLIST,
  aircraft: 'prop',
  launchAtLogin: false
}

export interface PersistedData {
  /** 저장 형식 버전. 기본값이 바뀌었을 때 옛 기본값을 새 값으로 옮기는 데 쓴다 */
  schema?: number
  settings: Settings
  records: FlightRecord[]
}

export const SCHEMA = 2

/** 옛 버전에서 저장된 데이터를 현재 형식으로 바꾼다 */
export function migrate(data: PersistedData | null): PersistedData | null {
  if (!data) return null
  const out = { ...data }
  if ((data.schema ?? 1) < 2 && data.settings?.config?.maxFocusMinutes === 180) {
    // 0.1.6까지의 기본 최대 집중 시간(180분)을 장거리 노선용 새 기본값으로
    out.settings = { ...data.settings, config: { ...data.settings.config, maxFocusMinutes: DEFAULT_CONFIG.maxFocusMinutes } }
  }
  out.schema = SCHEMA
  return out
}

/** 렌더러로 보내는 화면 상태 */
export interface Snapshot {
  now: number
  flight: FlightState
  settings: Settings
  stats: Stats
  lastRecord: FlightRecord | null
  recentRecords: FlightRecord[]
  activeWindow: (WindowInfo & { verdict: Verdict; reason: string }) | null
  extensionConnected: boolean
}

export interface Storage {
  load(): PersistedData | null
  save(data: PersistedData): void
}

export function planRoute(from: string, to: string, cfg: FlightConfig): { route: Route; durationMs: number } | null {
  const a = findCity(from)
  const b = findCity(to)
  if (!a || !b || a.code === b.code) return null
  const distanceKm = Math.round(haversineKm(a, b))
  return { route: { from, to, distanceKm }, durationMs: focusMinutes(distanceKm, cfg) * 60_000 }
}

/**
 * 상태 기계 + 저장 + 허용 목록 판정을 묶은 컨트롤러.
 * Electron Main 프로세스와 브라우저 미리보기(mock)가 같은 코드를 쓴다.
 */
export class FlightController {
  private state: FlightState
  private data: PersistedData
  private activeWindow: Snapshot['activeWindow'] = null
  private lastRecord: FlightRecord | null = null
  private flightStartedAt: number | null = null
  extensionConnected = false

  constructor(
    private readonly storage: Storage,
    private readonly clock: () => number = Date.now
  ) {
    const loaded = migrate(storage.load())
    this.data = {
      schema: SCHEMA,
      settings: mergeSettings(loaded?.settings),
      records: loaded?.records ?? []
    }
    this.state = initialState(clock())
  }

  get settings(): Settings {
    return this.data.settings
  }

  get flight(): FlightState {
    return this.state
  }

  private dispatch(ev: FlightEvent): void {
    const before = this.state
    this.state = transition(before, ev, this.data.settings.config)
    if (
      before.phase !== this.state.phase &&
      (this.state.phase === 'landed' || this.state.phase === 'crashed')
    ) {
      this.recordFlight(this.state)
    }
  }

  private recordFlight(s: FlightState): void {
    if (!s.route) return
    const focusMin = s.elapsedMs / 60_000
    const landed = s.phase === 'landed'
    const rec: FlightRecord = {
      id: `${s.phaseSince}-${s.route.from}-${s.route.to}`,
      from: s.route.from,
      to: s.route.to,
      distanceKm: s.route.distanceKm,
      plannedMs: s.durationMs,
      focusMs: Math.round(s.elapsedMs),
      startedAt: this.flightStartedAt ?? s.phaseSince,
      endedAt: s.phaseSince,
      outcome: landed ? 'landed' : 'crashed',
      crashReason: s.crashReason,
      turbulenceCount: s.turbulenceCount,
      // 추락하면 마일리지는 절반만 (그래도 집중한 시간은 인정)
      miles: Math.round(milesFor(focusMin) * (landed ? 1 : 0.5))
    }
    this.lastRecord = rec
    this.data.records = [...this.data.records, rec]
    this.persist()
  }

  board(from: string, to: string): boolean {
    const plan = planRoute(from, to, this.data.settings.config)
    if (!plan || this.state.phase !== 'idle') return false
    this.lastRecord = null
    this.flightStartedAt = this.clock()
    this.dispatch({ type: 'BOARD', ...plan, now: this.flightStartedAt })
    return true
  }

  cancel(): void {
    this.dispatch({ type: 'CANCEL', now: this.clock() })
  }

  pause(): void {
    this.dispatch({ type: 'PAUSE', now: this.clock() })
  }

  resume(): void {
    this.dispatch({ type: 'RESUME', now: this.clock() })
  }

  abort(): void {
    this.dispatch({ type: 'ABORT', now: this.clock() })
  }

  reset(): void {
    this.dispatch({ type: 'RESET', now: this.clock() })
  }

  tick(): void {
    this.dispatch({ type: 'TICK', now: this.clock() })
  }

  /** 활성 창 감시 결과를 반영한다. neutral 이면 포커스 상태를 바꾸지 않는다. */
  observeWindow(w: WindowInfo | null): Verdict {
    const { verdict, reason } = explainWindow(w, this.data.settings.allowlist)
    this.activeWindow = w ? { ...w, verdict, reason } : null
    if (verdict !== 'neutral') {
      this.dispatch({ type: 'FOCUS', allowed: verdict === 'allowed', now: this.clock() })
    } else {
      this.tick()
    }
    return verdict
  }

  /**
   * 비행 중에는 허용 목록을 줄이는 것만 허용하고 비행 규칙은 바꿀 수 없다.
   * (UI뿐 아니라 여기서도 막아 자기 약속을 지키게 한다)
   */
  updateSettings(patch: Partial<Settings>): void {
    const next = { ...patch }
    if (isActive(this.state)) {
      delete next.config
      if (next.allowlist && !isSubset(next.allowlist, this.data.settings.allowlist)) delete next.allowlist
    }
    this.data.settings = mergeSettings({ ...this.data.settings, ...next })
    this.persist()
  }

  clearRecords(): void {
    this.data.records = []
    this.lastRecord = null
    this.persist()
  }

  snapshot(): Snapshot {
    const now = this.clock()
    return {
      now,
      flight: this.state,
      settings: this.data.settings,
      stats: computeStats(this.data.records, now),
      lastRecord: this.lastRecord,
      recentRecords: this.data.records.slice(-20).reverse(),
      activeWindow: this.activeWindow,
      extensionConnected: this.extensionConnected
    }
  }

  private persist(): void {
    this.storage.save(this.data)
  }
}

function isSubset(a: AllowList, b: AllowList): boolean {
  const keys: (keyof AllowList)[] = ['apps', 'sites', 'playlists', 'titleKeywords']
  return keys.every((k) => a[k].every((v) => b[k].includes(v)))
}

function mergeSettings(s: Partial<Settings> | undefined): Settings {
  return {
    config: { ...DEFAULT_CONFIG, ...s?.config },
    allowlist: { ...DEFAULT_ALLOWLIST, ...s?.allowlist },
    aircraft: s?.aircraft ?? DEFAULT_SETTINGS.aircraft,
    launchAtLogin: s?.launchAtLogin ?? DEFAULT_SETTINGS.launchAtLogin
  }
}
