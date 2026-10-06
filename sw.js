// sw.js — the service worker (patch plan 7B, Phase 2).
//
// Precaches the app shell and the boot tables, so the app opens offline
// after one online load. The dictionary's files are left to cache.js, which
// keeps a text's in IndexedDB as they are fetched; this never caches them
// twice.
//
// Caches are named rp-<build>. Not readpath-: songpath's worker, on the same
// origin, deletes every cache named readpath-* but its own (7B Phase 0).
//
// Updates: a new build installs in the background and waits. The page shows
// "Update ready", and only a tap on Reload posts SKIP_WAITING. The very
// first install has nothing to replace, so it takes over at once.
//
// build_dist.py stamps BUILD; precache.json, beside this file, lists the
// files to keep. Served from readpath/app/ (BUILD 'dev') it never registers.

const BUILD = '1c0a44abf745112e';
const PREFIX = 'rp-';
const CACHE = PREFIX + BUILD;
const SHARDS = /\/content\/dict\/(?!index\.json)[^/]+\.json$/;

// A file that fails is fetched again, twice, after these waits: right
// after a deploy GitHub Pages can fail a request or two, and one failure
// used to sink the whole install until the next check (7B 6b; seen on the
// live site, Phase 6).
const WAITS_MS = [1500, 4000];

async function fetchOk(url) {
  let last = null;
  for (let i = 0; i <= WAITS_MS.length; i++) {
    if (i) await new Promise(r => setTimeout(r, WAITS_MS[i - 1]));
    try {
      const res = await fetch(new Request(url, {cache: 'reload'}));
      if (res.ok) {
        // read the body now: an unread response holds its connection, and
        // with every file fetched before any is kept, a browser's few
        // connections per host would all wait for nothing (7B 6b, caught in
        // the browser pane); a body that breaks off is a failure, retried
        const body = await res.blob();
        return new Response(body, {status: res.status, statusText: res.statusText,
                                   headers: res.headers});
      }
      last = new Error(`${url}: ${res.status}`);
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try {
      const {files} = await (await fetchOk('precache.json')).json();
      // all or nothing: every file is fetched before any is kept, and a
      // half-filled cache would open offline and then fail
      const urls = ['./', ...files];
      const responses = await Promise.all(urls.map(fetchOk));
      const cache = await caches.open(CACHE);
      await Promise.all(urls.map((u, i) => cache.put(u, responses[i])));
    } catch (e) {
      await caches.delete(CACHE);          // nothing half-made is left behind
      throw e;
    }
    if (!self.registration.active) await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || SHARDS.test(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, {ignoreSearch: true}) ||
                (req.mode === 'navigate' ? await cache.match('./') : null);
    return hit || fetch(req);
  })());
});
