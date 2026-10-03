import { afterEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { ExtensionBridge } from '../src/main/extensionBridge'
import { EXTENSION_PORT } from '../src/shared/ipc'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

function open(origin: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${EXTENSION_PORT}`, { origin })
    ws.on('open', () => resolve(ws))
    ws.on('error', reject)
  })
}

describe('ExtensionBridge', () => {
  let bridge: ExtensionBridge | null = null
  afterEach(() => bridge?.stop())

  it('확장에서 받은 URL을 같은 제목의 브라우저 창에만 붙인다', async () => {
    bridge = new ExtensionBridge(() => {})
    bridge.start()
    const ws = await open('chrome-extension://abcdef')
    ws.send(JSON.stringify({ type: 'tab', url: 'https://www.youtube.com/watch?v=1&list=PLx', title: 'Lofi' }))
    await wait(50)
    expect(bridge.connected).toBe(true)
    expect(bridge.urlFor('Lofi - YouTube - Chrome')).toBe('https://www.youtube.com/watch?v=1&list=PLx')
    expect(bridge.urlFor('다른 창 - Microsoft Edge')).toBeUndefined()
    ws.close()
    await wait(50)
    expect(bridge.connected).toBe(false)
    expect(bridge.urlFor('Lofi - YouTube - Chrome')).toBeUndefined()
  })

  it('웹페이지(일반 origin)에서 온 연결은 끊는다', async () => {
    bridge = new ExtensionBridge(() => {})
    bridge.start()
    const ws = await open('https://evil.example')
    await new Promise((r) => ws.on('close', r))
    expect(bridge.connected).toBe(false)
  })
})
