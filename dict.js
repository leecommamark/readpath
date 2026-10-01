// dict.js — a word's jyutping and meaning, fetched as a text needs it
// (patch plan 5, Phase 1).
//
// The full word table ships (Mark, decided 14): 210,386 forms in 1,024 files
// under content/dict/, a form in file fnv1a(form) % 1024, hashed over CODE
// POINTS as export_content.py (build_dist.fnv1a) does. A text fetches only
// the files its words hash to, eight at a time, the first time it needs
// them; the device then keeps them (cache.js, keyed by content version).
//
//   const d = createDict({index, version, cache, fetchFn});
//   await d.need(['銀行', '行山']);
//   d.wordOf('銀行')  -> {jp: 'ngan4 hong4', gloss: 'bank'} | null
//   d.wordJp('銀行')  -> 'ngan4 hong4' ('' when unknown or not yet fetched)
//
// wordOf is synchronous: it answers only from files already held, so a
// caller awaits need() first. A form in no file is simply not a word.

export const DICT_URL = 'content/dict/';
const PARALLEL = 8;

// FNV-1a, 32 bits, over code points (not UTF-16 units: an astral word such
// as 𠝹紙 would otherwise hash to the wrong file).
export function fnv1aCp(s) {
  let h = 0x811c9dc5;
  for (const ch of s) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// The index's hash sample must agree with fnv1aCp, or every lookup would go
// to the wrong file. Throws, naming the first disagreement.
export function checkIndex(index) {
  for (const [w, h] of Object.entries(index.check || {})) {
    if (fnv1aCp(w) !== h) throw new Error(`dictionary hash disagrees on ${w}`);
  }
  if (!(index.shards > 0)) throw new Error('dictionary index has no shards');
}

export const fileOf = (form, shards) => String(fnv1aCp(form) % shards).padStart(4, '0');

// createDict({index, version, cache, fetchFn, base}) -> {need, wordOf, wordJp,
// held}. `cache` is cache.js's (or null); `index` is content/dict/index.json.
export function createDict({index, version, cache = null, fetchFn = fetch,
                            base = DICT_URL}) {
  checkIndex(index);
  const files = new Map();                 // '0042' -> {form: [jp, gloss]}
  const loading = new Map();               // '0042' -> Promise

  async function load(f) {
    const key = `${version}:${f}`;
    let d = cache ? await cache.get('files', key) : undefined;
    if (!d) {
      const r = await fetchFn(`${base}${f}.json`);
      if (!r.ok) throw new Error(`could not load dictionary file ${f} (${r.status})`);
      d = await r.json();
      if (cache) await cache.put('files', key, d);
    }
    files.set(f, d);
  }

  function start(f) {
    if (!loading.has(f)) {
      loading.set(f, load(f).catch(e => { loading.delete(f); throw e; }));
    }
    return loading.get(f);
  }

  // need(forms) -> Promise: every file these forms hash to is held after it.
  async function need(forms) {
    const want = [...new Set(forms.map(w => fileOf(w, index.shards)))]
      .filter(f => !files.has(f));
    for (let i = 0; i < want.length; i += PARALLEL) {
      await Promise.all(want.slice(i, i + PARALLEL).map(start));
    }
    return want.length;
  }

  function wordOf(form) {
    const d = files.get(fileOf(form, index.shards));
    const e = d && d[form];
    return e ? {jp: e[0], gloss: e[1]} : null;
  }

  return {need, wordOf, wordJp: form => (wordOf(form) || {}).jp || '',
          held: () => files.size};
}
