import { execFile } from 'node:child_process'
import path from 'node:path'
import { isNewerVersion } from '../shared/version'

export interface RunningInstance {
  pid: number
  path: string
  version: string | null
}

const PS_LIST = `
$items = @(Get-Process -Name 'Focus Flight' -ErrorAction SilentlyContinue | ForEach-Object {
  $v = $null
  try { $v = $_.MainModule.FileVersionInfo.ProductVersion } catch {}
  [pscustomobject]@{ pid = $_.Id; path = $_.Path; version = $v }
})
ConvertTo-Json -Compress -InputObject $items
`

function powershell(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true, timeout: 15_000 },
      (err, stdout) => (err ? reject(err) : resolve(stdout))
    )
  })
}

/** 다른 경로에서 실행 중인 Focus Flight 프로세스 목록 (Windows 전용) */
export async function otherInstances(): Promise<RunningInstance[]> {
  if (process.platform !== 'win32') return []
  const out = (await powershell(PS_LIST)).trim()
  if (!out) return []
  const parsed = JSON.parse(out) as RunningInstance | RunningInstance[]
  const list = Array.isArray(parsed) ? parsed : [parsed]
  const self = path.resolve(process.execPath).toLowerCase()
  return list.filter((p) => p.path && path.resolve(p.path).toLowerCase() !== self)
}

/**
 * 이미 켜져 있는 이전 버전(0.1.1~0.1.2처럼 새 버전에 자리를 비켜 주는 기능이 없는 버전)을 종료한다.
 * 더 새롭거나 같은 버전은 건드리지 않는다. 종료했으면 true.
 */
export async function stopOlderInstances(myVersion: string): Promise<boolean> {
  const older = (await otherInstances()).filter((p) => !p.version || isNewerVersion(myVersion, p.version))
  if (older.length === 0) return false
  const ids = [...new Set(older.map((p) => p.pid))].join(',')
  await powershell(`Stop-Process -Id ${ids} -Force -ErrorAction SilentlyContinue`)
  return true
}
