// cache.js — what the device keeps that isn't the learner's (patch plan 5).
//
// A separate IndexedDB database, `readpath-cache`, so nothing here is under
// a `readpath.` key in the store: none of it travels in Export, and all of it
// can be rebuilt from the content. Two object stores:
//   * `files`: the dictionary files a text has needed (dict.js), keyed
//     `<content version>:<file>`;
//   * `lines`: a text's lines and tokens (Phase 2), keyed likewise.
// A key from another content version is stale: `prune(version)` deletes it
// at boot. Every failure degrades to "not cached": the caller fetches or
// recomputes, and nothing is lost.

const DB_NAME = 'readpath-cache';
const DB_V = 1;
export const STORES = ['files', 'lines'];

// openCache(indexedDB) -> {get, put, prune} over one store name each call.
// Without IndexedDB (or if it won't open), a cache that holds nothing.
export async function openCache(indexedDB) {
  let db = null;
  if (indexedDB) {
    db = await new Promise(res => {
      try {
        const r = indexedDB.open(DB_NAME, DB_V);
        r.onupgradeneeded = e => {
          const d = e.target.result;
          for (const s of STORES) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s);
        };
        r.onsuccess = e => res(e.target.result);
        r.onerror = () => res(null);
        r.onblocked = () => res(null);
      } catch (e) { res(null); }
    });
  }
  const run = (store, mode, fn) => new Promise(res => {
    if (!db) return res(undefined);
    try {
      const tx = db.transaction(store, mode);
      const r = fn(tx.objectStore(store));
      tx.oncomplete = () => res(r && r.result);
      tx.onerror = tx.onabort = () => res(undefined);
    } catch (e) { res(undefined); }
  });
  return {
    persistent: !!db,
    get: (store, key) => run(store, 'readonly', os => os.get(key)),
    put: (store, key, value) => run(store, 'readwrite', os => os.put(value, key)),
    // delete every key not of this content version, in both stores
    async prune(version) {
      let n = 0;
      for (const s of STORES) {
        const keys = (await run(s, 'readonly', os => os.getAllKeys())) || [];
        const stale = keys.filter(k => !String(k).startsWith(`${version}:`));
        if (stale.length) await run(s, 'readwrite', os => { stale.forEach(k => os.delete(k)); });
        n += stale.length;
      }
      return n;
    },
  };
}
