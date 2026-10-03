import { WebSocketServer, type WebSocket } from 'ws'
import { EXTENSION_PORT } from '../shared/ipc'

interface TabMessage {
  type: 'tab'
  url: string
  title: string
}

/**
 * 브라우저 확장이 보내는 현재 탭 URL을 받는다.
 * 127.0.0.1에만 바인딩하므로 외부에서는 접속할 수 없다.
 */
export class ExtensionBridge {
  private server: WebSocketServer | null = null
  private clients = new Set<WebSocket>()
  private lastTab: TabMessage | null = null

  constructor(private readonly onChange: () => void) {}

  start(): void {
    this.server = new WebSocketServer({ host: '127.0.0.1', port: EXTENSION_PORT })
    this.server.on('error', (err) => console.warn('[extension bridge]', err.message))
    this.server.on('connection', (ws, req) => {
      // 확장 프로그램(chrome-extension://, moz-extension://)에서 온 연결만 받는다
      const origin = req.headers.origin ?? ''
      if (!/^(chrome|moz)-extension:\/\//.test(origin)) {
        ws.close()
        return
      }
      this.clients.add(ws)
      this.onChange()
      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(String(raw)) as TabMessage
          if (msg.type === 'tab' && typeof msg.url === 'string') {
            this.lastTab = { type: 'tab', url: msg.url, title: String(msg.title ?? '') }
          }
        } catch {
          // 잘못된 메시지는 무시
        }
      })
      ws.on('close', () => {
        this.clients.delete(ws)
        this.onChange()
      })
    })
  }

  get connected(): boolean {
    return this.clients.size > 0
  }

  /**
   * 브라우저 창 제목이 확장이 알려준 탭 제목으로 시작할 때만 그 URL을 쓴다.
   * (다른 브라우저 창을 보고 있는데 엉뚱한 URL로 판정하는 것을 막는다)
   */
  urlFor(windowTitle: string): string | undefined {
    const tab = this.lastTab
    if (!tab || !this.connected) return undefined
    if (tab.title && !windowTitle.startsWith(tab.title)) return undefined
    return tab.url
  }

  stop(): void {
    for (const c of this.clients) c.close()
    this.server?.close()
  }
}
