// Focus Flight 웹 버전: 한 번 연 화면은 오프라인에서도 열리게 캐시한다.
// 새 버전이 올라오면 네트워크 우선으로 가져와 캐시를 갱신한다.
const CACHE = 'focus-flight-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone()
          void caches.open(CACHE).then((c) => c.put(req, copy))
        }
        return res
      })
      .catch(() => caches.match(req).then((hit) => hit || Response.error()))
  )
})
