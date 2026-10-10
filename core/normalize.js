// normalize.js — simplified and variant forms to the forms the content is
// keyed on (patch plan 5, Phase 1).
//
// A port of songpath's scanner (songpath/static/js/analysis/normalize.js,
// itself mirroring normalize.py), checked against it over every text in
// texts/ by reader_data.test.js. Per code point:
//   * a character the content reads well (readability 2: dictionary-backed)
//     is never touched, so 里 干 后 stay;
//   * otherwise its variant-map form, or failing that its OpenCC s2t form
//     (phrase-aware: 头发 -> 頭髮 but 发生 -> 發生), replaces it, but only
//     where that form reads better;
//   * except a character curated/characters.tsv `s2t` forces (variants
//     `force`: 么 -> 麼, Mark 2026-09-29), which always converts, before
//     s2t and again after it (钩 -> 鉤 -> 鈎, brief 7.23). That is the one
//     place this differs from songpath.
// It also classifies the pasted text's script (simp / mixed / trad) and
// records, per traditional form, the simplified form it came from.
//
// The tables come from the content (export_content.py's `variants` and
// `char`): content.variants and content.char(c).rd. core/ does no I/O.

import {CJK_RUN_SOURCE} from './segment.js';

const MAX_PHRASE = 6;                      // longest key in the phrase table
const CJK = new RegExp(`^${CJK_RUN_SOURCE}$`, 'u');

// CJK compatibility ideographs (U+F900-FAFF, U+2F800-2FA1F): a pasted 說
// U+F96F matches nothing in the content, so each takes its unified form
// first (NFC, which maps every one of them to a single code point, so the
// length still holds; patch plan 7.11)
export const COMPAT_RE = /[\uF900-\uFAFF\u{2F800}-\u{2FA1F}]/u;
const COMPAT_ALL = new RegExp(COMPAT_RE.source, 'gu');
export const unifyCompat = s => s.replace(COMPAT_ALL, c => c.normalize('NFC'));

// OpenCC's s2t over the whole text, as far as the shipped tables reproduce
// it: greedy longest phrase first, else the character map. Same length as
// the input's code points (the build refuses a length-changing phrase).
function s2tWhole(cps, V) {
  const out = new Array(cps.length);
  let i = 0;
  while (i < cps.length) {
    let n = Math.min(MAX_PHRASE, cps.length - i);
    for (; n > 1; n--) {
      const rep = V.phrases[cps.slice(i, i + n).join('')];
      if (rep) {
        Array.from(rep).forEach((c, k) => { out[i + k] = c; });
        break;
      }
    }
    if (n > 1) { i += n; continue; }
    out[i] = V.s2t[cps[i]] || cps[i];
    i += 1;
  }
  return out;
}

// Python's round(x, 3): half to even at an exact tie (songpath util.js).
function pyRound3(x) {
  const y = x * 1000, f = Math.floor(y);
  const n = y - f === 0.5 ? (f % 2 === 0 ? f : f + 1) : Math.round(y);
  return n / 1000;
}

const t2sSets = new WeakMap();

// normalizeText(text, content) -> {text, srcText, normalized, script, srcOf}
//   text        the normalised text, same code-point length as the input
//   srcText     the text as given
//   normalized  [{src, dst, count, simp}], first occurrence order
//   script      {kind: 'simp' | 'mixed' | 'trad', simp_ratio}
//   srcOf       {traditional: its most frequent simplified source}
export function normalizeText(text, content) {
  const V = content.variants;
  if (!t2sSets.has(V)) t2sSets.set(V, new Set(V.t2s));
  const t2s = t2sSets.get(V);
  const rd = c => (content.char(c) || {}).rd || 0;
  const isSimp = c => c in V.s2t;

  const given = Array.from(text);
  const src = given.map(c => (COMPAT_RE.test(c) ? c.normalize('NFC') : c));
  const whole = s2tWhole(src, V);
  const subs = new Map();                  // src+dst -> {src, dst, count}
  let nSimp = 0, nTrad = 0;
  const out = new Array(src.length);
  for (let i = 0; i < src.length; i++) {
    const a = src[i];
    let b = a;
    const forced = V.force && V.force[a];
    if (forced) {
      b = forced;
    } else if (rd(a) < 2) {
      let cand = V.vmap[a] || whole[i];
      if (V.vmap[cand]) cand = V.vmap[cand];   // s2t may give a TW form (說 -> 説)
      if (cand !== a && rd(cand) > rd(a)) b = cand;
      // a forced form again, after s2t: 钩 gives 鉤, which brief 7.23 forces
      // to 鈎 (Mark, 2026-10-09: the content is keyed on public typing)
      if (V.force && V.force[b]) b = V.force[b];
    }
    if (b !== given[i]) {                      // as given, compatibility form included
      const e = subs.get(given[i] + b);
      if (e) e.count++;
      else subs.set(given[i] + b, {src: given[i], dst: b, count: 1});
    }
    if (CJK.test(a)) {
      if (b !== a && isSimp(a)) nSimp++;
      else if (t2s.has(a)) nTrad++;
    }
    out[i] = b;
  }

  const normalized = [...subs.values()].map(e =>
    ({src: e.src, dst: e.dst, count: e.count, simp: isSimp(e.src)}));
  const total = nSimp + nTrad;
  const ratio = total ? pyRound3(nSimp / total) : 0;
  const script = {kind: ratio > 0.6 ? 'simp' : ratio > 0.1 ? 'mixed' : 'trad',
                  simp_ratio: ratio};
  // the most frequent simplified source per traditional form; a stable sort,
  // so a tie goes to the first seen
  const srcOf = {};
  for (const e of [...subs.values()].sort((x, y) => y.count - x.count)) {
    if (isSimp(e.src) && !(e.dst in srcOf)) srcOf[e.dst] = e.src;
  }
  return {text: out.join(''), srcText: text, normalized, script, srcOf};
}
