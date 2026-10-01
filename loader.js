// loader.js — the content tables, fetched (patch plan 4, Phase 3; patch
// plan 5, Phase 1).
//
// Every boot table is fetched in parallel and parsed once: the nine content
// tables, the Reader's four (lexicon, char, variants, offchar) and the
// dictionary's index, about 5.8 MB (2.0 MB gzipped). The dictionary's 1,024 files are not
// boot tables: dict.js fetches a text's as it needs them. The content
// version is an FNV-1a hash of the boot tables' text, in load order, the
// index included, so a change to any dictionary file changes it too: a
// content report records it, so a report can be read against the build it
// was made on, and the device's caches are keyed by it. Not crypto.subtle,
// which iOS withholds on a plain-http LAN address.

import {TABLES, READER_TABLES, loadContent} from './core/content.js';

export const CONTENT_URL = 'content/';

// FNV-1a, 32 bits, over the UTF-16 code units; continues from `h`.
export function fnv1a(text, h = 0x811c9dc5) {
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// Every boot file, in version order: the tables, then the dictionary index.
export const BOOT = [...TABLES, ...READER_TABLES, 'dict/index'];

// The version of a set of table texts, {name: text}: 8 hex digits.
export function contentVersion(texts) {
  let h = 0x811c9dc5;
  for (const t of BOOT) h = fnv1a(texts[t], h);
  return h.toString(16).padStart(8, '0');
}

// loadTables(fetch) -> {content, version, index}. Throws with the table's
// name if one can't be fetched or parsed.
export async function loadTables(fetchFn = fetch, base = CONTENT_URL) {
  const texts = {};
  await Promise.all(BOOT.map(async t => {
    const r = await fetchFn(`${base}${t}.json`);
    if (!r.ok) throw new Error(`could not load the ${t} table (${r.status})`);
    texts[t] = await r.text();
  }));
  const tables = Object.fromEntries(BOOT.map(t => [t, JSON.parse(texts[t])]));
  return {content: loadContent(tables), version: contentVersion(texts),
          index: tables['dict/index']};
}
