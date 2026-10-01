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

const BUILD = '1c6abad6c252958f';
const PREFIX = 'rp-';
const CACHE = PREFIX + BUILD;
const SHARDS = /\/content\/dict\/(?!index\.json)[^/]+\.json$/;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const res = await fetch('precache.json', {cache: 'reload'});
    if (!res.ok) throw new Error(`precache.json: ${res.status}`);
    const {files} = await res.json();
    const cache = await caches.open(CACHE);
    // all or nothing: a half-filled cache would open offline and then fail
    await cache.addAll(['./', ...files].map(f => new Request(f, {cache: 'reload'})));
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
