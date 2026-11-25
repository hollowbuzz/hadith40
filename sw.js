// Service worker: offline app shell + cached Google Fonts.
// Bump VERSION whenever you change any file so returning users get the update.
const VERSION = 'arbaeen-v1.0.0';
const FONT_CACHE = 'arbaeen-fonts';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/app.js', './js/data.js', './js/store.js', './js/i18n.js', './js/text.js', './js/srs.js', './js/quiz.js',
  './js/lesson.js', './js/render.js', './js/ui.js', './js/sound.js', './js/achievements.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-180.png', './icons/icon-maskable-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION && k !== FONT_CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => { if (e.data?.type === 'SKIP_WAITING') self.skipWaiting(); });

// Same-origin: network-first (always fresh when online), falling back to the cache
// after a short timeout or when offline. Google Fonts: cache-first, refreshed in the background.
function networkFirst(req) {
  return new Promise(resolve => {
    let settled = false;
    const finish = r => { if (!settled && r) { settled = true; resolve(r); } };
    const fromCache = () => caches.match(req, { ignoreSearch: true })
      .then(r => r || (req.mode === 'navigate' ? caches.match('./index.html') : null));
    const timer = setTimeout(() => fromCache().then(finish), 3500);
    fetch(req).then(res => {
      clearTimeout(timer);
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      finish(res);
    }).catch(() => {
      clearTimeout(timer);
      fromCache().then(r => finish(r || Response.error()));
    });
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    e.respondWith(networkFirst(req));
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONT_CACHE).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(res => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
  }
});
