// store.js — the learner's data on the device (patch plan 4, Phase 2).
//
// Ported from songpath's static/js/store.js (plan 8), which was debugged on
// iOS: IndexedDB behind a synchronous cache, every write of one tick flushed
// in one transaction, localStorage when there is no IndexedDB, and a failure
// that is surfaced, never swallowed. Nothing else of songpath's store came
// over: no page caches, no card model, no migration (nobody uses songpath;
// Read Path starts fresh, Mark 2026-09-28).
//
// What is stored is plain JSON under these keys:
//
//   readpath.states    {item id: item_state}   (core/state.js makes them)
//   readpath.settings  {new_per_day, jp, ...}  overrides of the defaults (jp.js)
//   readpath.reports   [report]                content reports (Phase 5)
//   readpath.meta      {seed, exported}        the session seed; last export day
//   readpath.today     {day, missed, practised} today's misses and practice
//                                              passes (Practise again; 4b)
//   readpath.texts     [text]                  the library (patch plan 5;
//                                              core/import.js has the shape)
//
// The store is made with its storage passed in, so node tests drive it with
// songpath's tools/idb_stub.js and the app with the browser's:
//
//   const store = createStore({indexedDB, localStorage});
//   await store.hydrate();
//   store.load('readpath.states', {});  store.save('readpath.states', states);
//
// Export and import are here as data (a file's text, and its name); the
// download and the file picker are the shell's.

export const PREFIX = 'readpath.';
export const KEYS = Object.freeze({
  states: 'readpath.states', settings: 'readpath.settings',
  reports: 'readpath.reports', meta: 'readpath.meta', today: 'readpath.today',
  texts: 'readpath.texts', offKnown: 'readpath.offKnown',
  placement: 'readpath.placement',
  // a finished check not yet confirmed (brief 7.13 decided 10)
  placementPending: 'readpath.placement.pending'});
export const APP = 'readpath';
export const FORMAT = 1;
const DB_NAME = 'readpath', DB_STORE = 'kv', DB_V = 1;

export function createStore({indexedDB = null, localStorage = null,
                             warn = () => {}} = {}) {
  // `mem` holds the stored JSON string for each key, never the parsed object:
  // load() parses, and what it returns belongs to the caller
  const mem = new Map();
  const dirty = new Set();      // written since the last flush; absent from
                                // `mem` means "delete me"
  let dbh = null;               // IDBDatabase, or null without IndexedDB
  let flushQueued = false;
  let flushFailed = null;       // the last write error, for the warning line

  const load = (k, d) => (mem.has(k) ? JSON.parse(mem.get(k)) : d);
  const save = (k, v) => { mem.set(k, JSON.stringify(v)); dirty.add(k); flushSoon(); };
  const forget = k => { mem.delete(k); dirty.add(k); flushSoon(); };

  // Every write of one tick lands in one transaction: an answer saves its
  // state and the session's meta together. A promise, not a timer, so
  // `await store.flush()` drains it.
  function flushSoon() {
    if (flushQueued) return;
    flushQueued = true;
    Promise.resolve().then(() => { flushQueued = false; flush(); });
  }

  function flush() {
    if (!dirty.size) return Promise.resolve(0);
    const keys = [...dirty];
    dirty.clear();
    if (!dbh) return Promise.resolve(fallbackWrite(keys));
    return new Promise(res => {
      const failed = e => {
        // put them back: the cache is still right, and the next flush retries
        for (const k of keys) dirty.add(k);
        flushFailed = (e && e.target && e.target.error) || e || new Error('write failed');
        warn(`readpath: a write failed, ${keys.length} keys still pending`, flushFailed);
        res(0);
      };
      try {
        const tx = dbh.transaction(DB_STORE, 'readwrite');
        const os = tx.objectStore(DB_STORE);
        for (const k of keys) mem.has(k) ? os.put(mem.get(k), k) : os.delete(k);
        tx.oncomplete = () => res(keys.length);
        tx.onerror = failed;
        tx.onabort = failed;
      } catch (e) { failed(e); }
    });
  }

  // No IndexedDB (a private window on some engines, a webview with it off):
  // the session still runs from `mem`, written through to localStorage.
  function fallbackWrite(keys) {
    let n = 0;
    for (const k of keys) {
      try {
        if (!localStorage) throw new Error('no storage on this device');
        if (mem.has(k)) localStorage.setItem(k, mem.get(k));
        else localStorage.removeItem(k);
        n++;
      } catch (e) {
        dirty.add(k);
        flushFailed = e;
      }
    }
    return n;
  }

  // What the warning line shows: null, or the error and what is still owed.
  const trouble = () => (flushFailed
    ? {message: String((flushFailed && flushFailed.message) || flushFailed),
       pending: dirty.size}
    : null);
  const clearTrouble = () => { flushFailed = null; };

  function openDB() {
    return new Promise((res, rej) => {
      if (!indexedDB) return rej(new Error('no indexedDB'));
      const r = indexedDB.open(DB_NAME, DB_V);
      r.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
      };
      r.onsuccess = e => res(e.target.result);
      r.onerror = e => rej(e.target.error);
      r.onblocked = () => rej(new Error('indexedDB blocked'));
    });
  }

  // Fill the cache from storage: every `readpath.` key. Await it before the
  // first load().
  async function hydrate() {
    try { dbh = await openDB(); } catch (e) { dbh = null; }
    if (dbh) {
      await new Promise((res, rej) => {
        const tx = dbh.transaction(DB_STORE, 'readonly');
        const r = tx.objectStore(DB_STORE).openCursor();
        r.onsuccess = e => {
          const c = e.target.result;
          if (!c) return res();
          if (typeof c.key === 'string' && c.key.startsWith(PREFIX)
              && !dirty.has(c.key)) mem.set(c.key, c.value);
          c.continue();
        };
        r.onerror = e => rej(e.target.error);
      });
    } else if (localStorage) {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PREFIX) && !dirty.has(k)) mem.set(k, localStorage.getItem(k));
      }
    }
    return {indexedDB: !!dbh, keys: mem.size};
  }

  // ---- export and import

  // exportFile(isoDate) -> {name, text}: everything under `readpath.`, as
  // parsed values, in a file that says what it is.
  async function exportFile(isoDate) {
    await flush();
    const data = {};
    for (const k of [...mem.keys()].sort()) data[k] = JSON.parse(mem.get(k));
    const text = JSON.stringify({app: APP, format: FORMAT, exported: isoDate, data}, null, 1);
    return {name: `readpath-progress-${isoDate}.json`, text};
  }

  // importFile(text) -> {keys}: replaces everything under `readpath.` with the
  // file's, and flushes. Throws on anything that is not a Read Path export,
  // without touching the store.
  async function importFile(text) {
    const doc = parseExport(text);
    for (const k of [...mem.keys()]) if (!(k in doc.data)) forget(k);
    for (const [k, v] of Object.entries(doc.data)) save(k, v);
    await flush();
    return {keys: Object.keys(doc.data).length};
  }

  return {load, save, forget, flush, hydrate, trouble, clearTrouble,
          exportFile, importFile, keys: () => [...mem.keys()].sort()};
}

// parseExport(text) -> {app, format, exported, data}, or throws a message fit
// to show the learner.
export function parseExport(text) {
  let doc;
  try { doc = JSON.parse(text); } catch (e) { throw new Error('Not a Read Path export (not JSON).'); }
  if (!doc || doc.app !== APP || typeof doc.data !== 'object' || !doc.data) {
    throw new Error('Not a Read Path export.');
  }
  if (doc.format !== FORMAT) {
    throw new Error(`This export is format ${doc.format}; this app reads format ${FORMAT}.`);
  }
  for (const k of Object.keys(doc.data)) {
    if (!k.startsWith(PREFIX)) throw new Error(`Not a Read Path export (key ${k}).`);
  }
  return doc;
}
