/* OK수학 서비스 워커
 * - 앱 화면(셸)을 미리 저장해 두어 인터넷이 없어도 실행
 * - 같은 사이트 파일: 네트워크 우선(항상 최신) → 실패 시 저장본 사용
 * - 글꼴(CDN): 저장본 우선
 * 배포할 때 VERSION 을 올리면 예전 저장본이 정리됩니다.
 */
const VERSION = 'okmath-v3';
const RUNTIME = 'okmath-runtime';
const SHELL = [
  './', 'index.html', 'style.css', 'core.js', 'app.js', 'manifest.webmanifest',
  'icons/favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== RUNTIME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then(cache => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true })
          .then(hit => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())))
    );
    return;
  }

  if (url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(
      caches.open(RUNTIME).then(cache => cache.match(req).then(hit => hit || fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      }).catch(() => Response.error())))
    );
  }
});
