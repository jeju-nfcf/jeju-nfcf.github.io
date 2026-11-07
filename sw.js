/* 제주시 임야 재배임산물 추천 — 오프라인·자동 갱신 서비스워커 (버전 72c8919dfd28) */
const CACHE = 'imsanmul-terrain-20261107';
const PAGE = './';
const ASSETS = ['./', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
const WAIT = 4000;   // 이 시간 안에 서버 응답이 없으면 저장된 판을 먼저 보여 준다

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function notifyUpdated() {
  for (const c of await self.clients.matchAll({type: 'window'})) c.postMessage({type: 'updated'});
}

async function pageFetch(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(PAGE);
  const oldTag = cached && (cached.headers.get('etag') || cached.headers.get('last-modified'));
  // 브라우저 HTTP 캐시를 거쳐 조건부 요청(304)으로 확인하므로 바뀐 게 없으면 거의 받지 않는다
  const net = fetch(PAGE, {cache: 'no-cache'}).then(async res => {
    if (res.ok) {
      await cache.put(PAGE, res.clone());
      const tag = res.headers.get('etag') || res.headers.get('last-modified');
      if (cached && tag && tag !== oldTag) res.__changed = true;
    }
    return res;
  });
  if (!cached) return net;
  let timedOut = false;
  const timer = new Promise(r => setTimeout(() => { timedOut = true; r(cached); }, WAIT));
  const first = await Promise.race([net.catch(() => cached), timer]);
  if (timedOut) net.then(res => { if (res.__changed) notifyUpdated(); }).catch(() => {});
  return first;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('/index.html')) {
    e.respondWith(pageFetch(req));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  })));
});
