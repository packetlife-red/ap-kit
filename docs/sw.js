// 応用情報ドリル — オフライン用 Service Worker（ビルド生成物）
const CACHE = 'ap-drill-20260807-0009';
// './' と './index.html' の両方を入れる。ホスティングによってどちらで参照されるか変わるため。
const ASSETS = ['./', './index.html', './ap_drill.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// キャッシュ優先。ネットワークが無くても動くことを最優先にする
// （出題は全てローカル生成なので、新しいデータを取りに行く必要がない）。
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).catch(() => caches.match('./index.html') || caches.match('./ap_drill.html')))
  );
});
