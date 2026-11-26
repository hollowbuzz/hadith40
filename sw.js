// Service worker: offline app shell + cached Google Fonts.
// Bump VERSION whenever you change any file so returning users get the update.
const VERSION = 'arbaeen-v1.4.0';
const AUDIO_CACHE = 'arbaeen-audio'; // kept across app versions; files are keyed by their ?v= hash
const FONT_CACHE = 'arbaeen-fonts';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/app.js', './js/data.js', './js/store.js', './js/i18n.js', './js/text.js', './js/srs.js', './js/quiz.js',
  './js/lesson.js', './js/render.js', './js/ui.js', './js/sound.js', './js/achievements.js', './js/sharh.js', './js/iraab.js', './js/audio.js', './js/recorder.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-180.png', './icons/icon-maskable-512.png',
];

// The books (about 2.5 MB, much less compressed) are cached too, so they read offline.
// They are optional: if one fails to download, the app still installs and fetches it when opened.
const BOOKS = ['fath-al-qawi-al-matin', 'al-tuhfah-al-rabbaniyyah', 'al-sharh-al-mujaz-al-mufid']
  .map(f => `./data/commentaries/${f}.json`)
  .concat('./data/iraab/iraab-al-arbain-al-nawawiyyah.json');

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(async c => {
    await c.addAll(SHELL);
    await Promise.all(BOOKS.map(u => c.add(u).catch(() => {})));
  }));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION && k !== FONT_CACHE && k !== AUDIO_CACHE) await caches.delete(k);
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

// Recorded audio (data/audio/*.mp3): kept once played, so it works offline. Audio elements ask for byte
// ranges, which the Cache API cannot store, so the whole file is fetched and cached, and ranges are cut from it.
async function audio(req) {
  const cache = await caches.open(AUDIO_CACHE);
  const u = new URL(req.url);
  const key = new Request(u.pathname + u.search);
  let res = await cache.match(key);
  if (!res) {
    const net = await fetch(key.url);
    if (!net.ok) return net;
    for (const old of await cache.keys()) if (new URL(old.url).pathname === u.pathname) await cache.delete(old);
    await cache.put(key, net.clone());
    res = net;
  }
  const range = req.headers.get('range');
  if (!range) return res;
  const buf = await res.arrayBuffer();
  const [, a, b] = /bytes=(\d*)-(\d*)/.exec(range) || [];
  const start = a ? +a : Math.max(0, buf.byteLength - +b);
  const end = a && b ? Math.min(+b, buf.byteLength - 1) : buf.byteLength - 1;
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: { 'Content-Type': 'audio/mpeg', 'Content-Range': `bytes ${start}-${end}/${buf.byteLength}`, 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes' },
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin && /\/data\/audio\/[^/]+\.mp3$/.test(url.pathname)) {
    e.respondWith(audio(req));
  } else if (url.origin === self.location.origin) {
    e.respondWith(networkFirst(req));
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONT_CACHE).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(res => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
  }
});
