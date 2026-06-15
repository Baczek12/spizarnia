// Service Worker — Spiżarnia (offline + szybsze ładowanie)
const CACHE = 'spizarnia-v4';
const CORE = ['./', './index.html', './brand.png', './icon.png', './icon-192.png', './manifest.json'];

// Hosty dynamiczne — zawsze z sieci, nigdy z cache (dane, logowanie, AI)
const NETWORK_ONLY = ['kltipgnmyihxotqfryow.supabase.co', 'generativelanguage.googleapis.com'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.allSettled(CORE.map((u) => c.add(u)));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }

  // Dane/API/realtime — przepuść do sieci bez ingerencji
  if (NETWORK_ONLY.includes(url.hostname)) return;

  // Nawigacja (HTML) — najpierw sieć (świeże), offline → z cache
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const c = await caches.open(CACHE);
        c.put('./index.html', fresh.clone());
        return fresh;
      } catch {
        return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Reszta (logo, ikony, fonty, biblioteki) — stale-while-revalidate
  e.respondWith((async () => {
    const cached = await caches.match(req);
    const network = fetch(req).then((res) => {
      if (res && (res.ok || res.type === 'opaque')) {
        caches.open(CACHE).then((c) => c.put(req, res.clone()));
      }
      return res;
    }).catch(() => null);
    return cached || (await network) || Response.error();
  })());
});
