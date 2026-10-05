// bundle.js — text bundles for beta testers, fetched from a link (patch plan
// 7.14, Phase 2).
//
// Pure: no DOM, and no fetch of its own (fetchFn is passed in, as for
// texts.js addSample). A bundle is a folder of .txt files with an index.json
// under TEXTS_BASE; the only URLs built here are TEXTS_BASE + a BUNDLE_ID
// folder + (index.json | an index entry's file name), so nothing outside
// TEXTS_BASE is ever fetched. The texts go to library.importFiles as
// [{name, raw, title}] (raw null: the file couldn't be read): a set's file is
// its title on line 1, then the text, so the title comes off, as the
// sample's does (Mark, 7.14).
//
// index.json: {format: 1, name, description, texts: [{file, title, chars}]}

import {splitTitled} from './import.js';

export const TEXTS_BASE = 'https://leecommamark.github.io/readpath-beta-texts/';
export const BUNDLE_ID = /^[a-z0-9-]{1,40}$/;

const APP_HOST = 'leecommamark.github.io';
const BASE_PATH = '/readpath-beta-texts/';
const LAN = /^(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/;

const fold = s => String(s).trim().toLowerCase();
const valid = s => BUNDLE_ID.test(s) ? s : null;

// bundleIdOf(input) -> id | null. A bare name, the app's ?texts= link (on
// the app's host or a local one: the boot code passes location.href), or a
// link into the texts folder. Whatever comes in, the result is a BUNDLE_ID
// or null.
export function bundleIdOf(input) {
  if (typeof input !== 'string') return null;
  const bare = valid(fold(input));
  if (bare) return bare;
  let url;
  try { url = new URL(input.trim()); } catch { return null; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.searchParams.has('texts')) {
    if (url.hostname !== APP_HOST && !LAN.test(url.hostname)) return null;
    return valid(fold(url.searchParams.get('texts')));
  }
  if (url.origin !== 'https://' + APP_HOST || !url.pathname.startsWith(BASE_PATH)) return null;
  const parts = url.pathname.slice(BASE_PATH.length).split('/');
  if (parts.length > 2) return null;       // one folder, then at most a file
  return valid(parts[0]);
}

const NO_NET = 'Couldn’t reach the text sets. Check your connection and try again.';
const goodFile = f => typeof f === 'string' && f.endsWith('.txt') &&
  !/[\\/]/.test(f) && !f.includes('..');

// fetchBundleIndex(id, fetchFn) -> {id, name, description, texts: [{file, title, chars}]}
//   Throws an Error whose message is for the learner. no-cache: the browser
//   revalidates, so an edit pushed to the texts repo shows at once.
export async function fetchBundleIndex(id, fetchFn) {
  if (typeof id !== 'string' || !BUNDLE_ID.test(id)) throw new Error(`bad bundle id: ${id}`);
  let res, data;
  try {
    res = await fetchFn(TEXTS_BASE + id + '/index.json', {cache: 'no-cache'});
    if (res.status === 404) throw new Error(`No text set called “${id}”. Check the link.`);
    if (!res.ok) throw new Error(NO_NET);
    data = await res.json();
  } catch (e) {
    if (res && res.status === 404) throw e;
    throw new Error(NO_NET);
  }
  if (!data || data.format !== 1) throw new Error('This text set needs a newer Read Path.');
  const name = typeof data.name === 'string' && data.name.trim() ? data.name.trim() : id;
  const description = typeof data.description === 'string' ? data.description : '';
  const texts = (Array.isArray(data.texts) ? data.texts : [])
    .filter(t => t && goodFile(t.file))
    .map(t => ({
      file: t.file,
      title: typeof t.title === 'string' && t.title.trim() ? t.title : t.file.slice(0, -4),
      chars: typeof t.chars === 'number' ? t.chars : 0,
    }));
  return {id, name, description, texts};
}

// fetchBundleTexts(index, files, fetchFn, onStep) -> [{name, raw, title}]
//   The chosen files that are in the index, in index order, one at a time.
//   onStep(i, n, title) runs before each. A file that fails comes back with
//   raw null and the rest go on.
export async function fetchBundleTexts(index, files, fetchFn, onStep = () => {}) {
  const chosen = index.texts.filter(t => files.includes(t.file));
  const out = [];
  for (let i = 0; i < chosen.length; i++) {
    const {file, title} = chosen[i];
    onStep(i + 1, chosen.length, title);
    let raw = null;
    try {
      const res = await fetchFn(TEXTS_BASE + index.id + '/' + encodeURIComponent(file), {cache: 'no-cache'});
      if (res.ok) raw = await res.text();
    } catch { /* raw stays null */ }
    if (raw === null) { out.push({name: file, raw, title}); continue; }
    const t = splitTitled(raw);
    out.push({name: file, raw: t.body, title: t.title || title});
  }
  return out;
}
