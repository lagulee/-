import { describe, expect, it } from 'vitest'
import { CITIES, REGIONS } from '../src/shared/cities'
import { DEFAULT_CONFIG } from '../src/shared/config'
import { migrate, planRoute } from '../src/shared/controller'
import { BUCKETS, bucketOf, formatMinutes } from '../src/shared/durations'

describe('도시 목록', () => {
  it('코드가 겹치지 않고 좌표가 올바르다', () => {
    expect(new Set(CITIES.map((c) => c.code)).size).toBe(CITIES.length)
    for (const c of CITIES) {
      expect(c.code).toMatch(/^[A-Z]{3}$/)
      expect(Math.abs(c.lat)).toBeLessThanOrEqual(90)
      expect(Math.abs(c.lon)).toBeLessThanOrEqual(180)
      expect(REGIONS).toContain(c.region)
    }
    expect(CITIES.length).toBeGreaterThanOrEqual(100)
  })

  it('인천에서 출발하면 모든 시간대에 목적지가 5곳 이상 있다', () => {
    const counts = new Map<string, number>()
    for (const c of CITIES) {
      const plan = planRoute('ICN', c.code, DEFAULT_CONFIG)
      if (!plan) continue
      const b = bucketOf(plan.durationMs / 60_000)
      counts.set(b.id, (counts.get(b.id) ?? 0) + 1)
    }
    for (const b of BUCKETS) expect(counts.get(b.id) ?? 0, b.label).toBeGreaterThanOrEqual(5)
  })
})

describe('시간대', () => {
  it('구간 경계', () => {
    expect(bucketOf(10).id).toBe('short')
    expect(bucketOf(30).id).toBe('hour')
    expect(bucketOf(119).id).toBe('two')
    expect(bucketOf(360).id).toBe('long')
  })

  it('보기 좋은 시간 표기', () => {
    expect(formatMinutes(45)).toBe('45분')
    expect(formatMinutes(120)).toBe('2시간')
    expect(formatMinutes(135)).toBe('2시간 15분')
  })
})

describe('migrate', () => {
  const base = { settings: { config: { ...DEFAULT_CONFIG, maxFocusMinutes: 180 }, allowlist: { apps: [], sites: [], playlists: [], titleKeywords: [] }, aircraft: 'prop', launchAtLogin: false }, records: [] }

  it('옛 기본 최대 시간(180분)은 새 기본값으로 바꾼다', () => {
    expect(migrate(base)?.settings.config.maxFocusMinutes).toBe(DEFAULT_CONFIG.maxFocusMinutes)
  })

  it('사용자가 직접 바꾼 값과 새 형식 데이터는 그대로 둔다', () => {
    const custom = { ...base, settings: { ...base.settings, config: { ...DEFAULT_CONFIG, maxFocusMinutes: 90 } } }
    expect(migrate(custom)?.settings.config.maxFocusMinutes).toBe(90)
    expect(migrate({ ...base, schema: 2 })?.settings.config.maxFocusMinutes).toBe(180)
  })
})
