import { registerPlugin } from '@capacitor/core'

/** 안드로이드 네이티브 플러그인 (android/app/src/main/java/.../FocusMonitorPlugin.java) */
export interface FocusEvent {
  t: number
  type: 'app' | 'screen_off' | 'screen_on'
  pkg?: string
  label?: string
}

export interface FocusMonitorPlugin {
  getEnvironment(): Promise<{
    ownPackage: string
    usageGranted: boolean
    notificationsGranted: boolean
    sdk: number
    launchers: string[]
  }>
  log(opts: { message: string }): Promise<void>
  openUsageSettings(): Promise<void>
  requestNotifications(): Promise<{ granted: boolean }>
  getEvents(opts: { since: number }): Promise<{ now: number; screenOn: boolean; granted: boolean; events: FocusEvent[] }>
  listApps(): Promise<{ apps: { pkg: string; label: string }[] }>
  startWatch(opts: {
    allowed: string[]
    neutral: string[]
    toleranceMs: number
    graceMs: number
    endsAt: number
    title: string
  }): Promise<void>
  stopWatch(): Promise<void>
}

export const FocusMonitor = registerPlugin<FocusMonitorPlugin>('FocusMonitor')
