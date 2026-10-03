// Focus Flight 데스크탑 앱과 로컬 WebSocket으로 통신한다.
// 보내는 것: 현재 활성 탭의 URL과 제목. 외부 서버로는 아무것도 보내지 않는다.
const ENDPOINT = 'ws://127.0.0.1:47321'

let socket = null

function connect() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return
  try {
    socket = new WebSocket(ENDPOINT)
  } catch {
    return
  }
  socket.onopen = () => void reportActiveTab()
  socket.onclose = () => {
    socket = null
  }
  socket.onerror = () => {}
}

async function reportActiveTab() {
  if (!socket || socket.readyState !== WebSocket.OPEN) return
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  if (!tab || !tab.url) return
  socket.send(JSON.stringify({ type: 'tab', url: tab.url, title: tab.title ?? '' }))
}

chrome.tabs.onActivated.addListener(() => void reportActiveTab())
chrome.tabs.onUpdated.addListener((_id, change, tab) => {
  if (tab.active && (change.url || change.title)) void reportActiveTab()
})
chrome.windows.onFocusChanged.addListener(() => void reportActiveTab())

// 앱이 나중에 켜져도 다시 연결되도록 주기적으로 확인한다
chrome.alarms.create('reconnect', { periodInMinutes: 0.5 })
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'reconnect') connect()
})
chrome.runtime.onStartup.addListener(connect)
chrome.runtime.onInstalled.addListener(connect)
connect()
