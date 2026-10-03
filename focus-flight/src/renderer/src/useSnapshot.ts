import { useEffect, useState } from 'react'
import type { Snapshot } from '../../shared/controller'
import { api } from './api'

export function useSnapshot(): Snapshot | null {
  const [snap, setSnap] = useState<Snapshot | null>(null)
  useEffect(() => {
    let alive = true
    void api.getSnapshot().then((s) => alive && setSnap(s))
    const off = api.onSnapshot(setSnap)
    return () => {
      alive = false
      off()
    }
  }, [])
  return snap
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export function formatHours(ms: number): string {
  const h = ms / 3_600_000
  return h >= 10 ? `${Math.round(h)}시간` : `${h.toFixed(1)}시간`
}
