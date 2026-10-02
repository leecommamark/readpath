// search.js — Find a character (patch plan 6, Phase 2).
//
// search(content, query, {states, offKnown}) -> {path, parts, off, total}
// Three kinds of query (Mark, 2026-09-29, Phase 0 decided 8):
//   * characters, traditional or simplified: each is looked up as typed and
//     as s2t makes it (normalizeText, its `force` too), as a path character
//     (every reading item it has), a part, or an off-path character
//     (content.offchar); a converted result carries `typed`;
//   * jyutping, one syllable, with or without its tone, compared as a
//     merging speaker hears it (soundKey: n = l, ng = zero, gw/kw = g/k
//     before -o), so nei finds 你 lei5; a typed tone must match too;
//   * English: whole words, case-insensitive, in the meanings; and where a
//     word is in no meaning at all, in the meanings of each path
//     character's own example words (patch plan 7.7, Phase 5; Mark, P3:
//     "sunny" finds 晴 through 天晴 "sunny day"), ranked below, each result
//     carrying `via` {form, gloss}: the word that matched.
// A Latin query is tried as jyutping where it is a syllable, and as English
// unless it's a stop word or a syllable of two letters, so "fan" can find
// both. Results are grouped: characters typed come in the order typed;
// otherwise the best match first (SCORE: the reading as spelled, as heard,
// then the meaning), then path order (off the path: dictionary-backed first,
// then code point). Each group is cut at LIMIT; `total` says how many it had
// before the cut. An off-path row shows the reading that matched.
//
// Pure: no I/O, no clock. The view shortens glosses and draws the rows.

import {kindOf, toneless} from './content.js';
import {normalizeText} from './normalize.js';
import {isKnown} from './state.js';

export const LIMIT = 20;

// reading_relations.sound_key, for a syllable with or without its tone: the
// export's syllable table has it for every syllable a reading has, and a
// test holds the two equal; this one also folds a syllable the table lacks.
const INITIALS = ['ng', 'gw', 'kw', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k',
                  'h', 'w', 'z', 'c', 's', 'j'];
export function soundKey(syl) {
  const s = toneless(syl);
  let i = INITIALS.find(x => s.startsWith(x)) || '';
  const f = s.slice(i.length);
  i = {n: 'l', ng: ''}[i] ?? i;
  if ((i === 'gw' || i === 'kw') && f.startsWith('o')) i = i[0];
  return i + f;
}

const HAN = /\p{Script=Han}/u;
const SYLLABLE = /^([a-z]+?)([1-6]?)$/;

// a state as the rows show it
export function stateOf(s) {
  if (!s) return 'ahead';
  return isKnown(s) ? 'known' : 'learning';
}

function wordsRe(q) {
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(^|[^a-z])${esc}($|[^a-z])`, 'i');
}

// every sound key a syllable of the content has: a Latin query is tried as
// jyutping only when it sounds like one of them
const KEYS = new WeakMap();
function keysOf(content) {
  if (!KEYS.has(content)) KEYS.set(content, new Set([...content.syllables.values()].map(s => s.key)));
  return KEYS.get(content);
}

// English words too common to find anything by
const STOP = new Set(['a', 'an', 'the', 'of', 'to', 'in', 'on', 'at', 'and', 'or', 'is',
                      'be', 'as', 'by', 'for', 'with', 'it', 'its', 'from', 'that', 'this']);

// A meaning's first sense, without a leading "(noun)"-style tag
const firstSense = g => (g || '').split(/[;,/]/)[0].trim().replace(/^\([^)]*\)\s*/, '').toLowerCase();

// How well a result matches, best first: its reading as typed, its reading as
// heard (a merger), its meaning's first sense exactly, a first sense that
// starts with the query, the query anywhere in the meaning.
const SCORE = {spelled: 0, heard: 1, sense: 2, starts: 3, anywhere: 4, via: 5};

// every word's gloss, by its form (the first the word table has)
const WORD_GLOSS = new WeakMap();
function wordGloss(content) {
  if (!WORD_GLOSS.has(content)) {
    const g = new Map();
    for (const w of content.words.values()) if (!g.has(w.form) && w.gloss) g.set(w.form, w.gloss);
    WORD_GLOSS.set(content, g);
  }
  return WORD_GLOSS.get(content);
}

// a character's reading items, the main reading first, then the others in
// path order
const READINGS = new WeakMap();
export function readingItems(content, ch) {
  if (!READINGS.has(content)) {
    const by = new Map();
    for (const id of content.path) {
      if (kindOf(id) !== 'reading') continue;
      const c = content.item(id).char;
      by.set(c, [...(by.get(c) || []), id]);
    }
    READINGS.set(content, by);
  }
  const ids = READINGS.get(content).get(ch) || [];
  const main = content.mainReading(ch);
  return main ? [main, ...ids.filter(id => id !== main)] : ids;
}

// what a converted result says about the form typed: `typed` (复) and
// whether it was the simplified form (else another written form, 裡 for 裏)
function typedAs(content, from) {
  if (!from) return {};
  return {typed: from, simplified: from in content.variants.s2t};
}

export function search(content, query, {states = {}, offKnown = new Set()} = {}) {
  const q = (query || '').trim();
  const found = new Map();                 // id or off-path char -> result
  const isPart = ch => content.has(`s:${ch}`) || content.has(`m:${ch}`);
  const addItem = (id, score, order = 0, from = null) => {
    const had = found.get(id);
    if (had) { had.score = Math.min(had.score, score); return; }
    const it = content.item(id);
    found.set(id, kindOf(id) === 'reading'
      ? {group: 'path', id, char: it.char, jp: it.jp, gloss: it.gloss || '', primary: it.primary,
         state: stateOf(states[id]), score, order, ...typedAs(content, from)}
      : {group: 'parts', id, form: it.form, kind: it.kind,
         reading: it.kind === 'sound' ? it.taughtReading || content.partReading(it.form) : null,
         gloss: it.kind === 'meaning' ? it.gloss : content.partGloss(it.form) || '',
         state: stateOf(states[id]), score, order});
  };
  const addOff = (ch, score, jp = null, order = 0, from = null) => {
    const o = content.offchar(ch);
    if (!o || isPart(ch)) return;          // a part opens its part card instead
    const had = found.get(ch);
    if (had) { had.score = Math.min(had.score, score); return; }
    const c = content.char(ch) || {};
    found.set(ch, {group: 'off', char: ch, jp: jp || o.readings[0], readings: o.readings,
                   gloss: c.gloss || '', known: offKnown.has(ch), rd: c.rd || 0, score, order,
                   ...typedAs(content, from)});
  };

  if (HAN.test(q)) {
    // in the order typed: the learner asked for these characters. Each is
    // looked up as typed AND as s2t makes it (patch plan 7A, 6b: 复 is a
    // sound part as typed, and 復 once converted), and a converted result
    // says what was typed. A path character brings every reading item it
    // has (畫 waa2 and waak6), its main reading first.
    const typed = Array.from(q);
    const norm = Array.from(normalizeText(q, content).text);
    const pairs = [];
    typed.forEach((a, i) => {
      if (!HAN.test(a)) return;
      const b = norm[i];
      // as typed: a part, or (when s2t leaves it) the character itself
      if (!pairs.some(p => p.ch === a)) pairs.push({ch: a, from: null, partsOnly: b !== a});
      if (b !== a && HAN.test(b) && !pairs.some(p => p.ch === b)) pairs.push({ch: b, from: a});
    });
    pairs.forEach(({ch, from, partsOnly}, n) => {
      for (const make of ['s:', 'm:']) if (content.has(make + ch)) addItem(make + ch, 0, n);
      if (partsOnly) return;               // 裡 is shown as 裏, not twice
      const main = content.mainReading(ch);
      if (main) for (const id of readingItems(content, ch)) addItem(id, 0, n, from);
      else addOff(ch, 0, null, n, from);
    });
  } else if (q) {
    const lower = q.toLowerCase().replace(/\s+/g, ' ');
    const m = lower.replace(/ /g, '').match(SYLLABLE);
    const syllable = !!m && keysOf(content).has(soundKey(m[1]));
    if (syllable) {
      const key = soundKey(m[1]), tone = m[2];
      const score = jp => (soundKey(jp) !== key || (tone && !jp.endsWith(tone)) ? null
        : toneless(jp) === m[1] ? SCORE.spelled : SCORE.heard);
      for (const id of content.path) {
        const it = content.item(id);
        const jp = it.kind === 'reading' ? it.jp : it.kind === 'sound' ? it.taughtReading : null;
        const sc = jp ? score(jp) : null;
        if (sc !== null) addItem(id, sc);
      }
      for (const [ch, o] of content.offchars) {
        const hit = o.readings.map(jp => [jp, score(jp)]).filter(([, sc]) => sc !== null)
          .sort((a, b) => a[1] - b[1])[0];
        if (hit) addOff(ch, hit[1], hit[0]);
      }
    }
    // English: not a stop word, and not a syllable of two letters or fewer
    // ("ng", "go"), which would find noise
    if (/[a-z]/.test(lower) && !STOP.has(lower) && !(syllable && lower.length < 3)) {
      const re = wordsRe(lower);
      const score = g => (!re.test(g || '') ? null
        : firstSense(g) === lower ? SCORE.sense
        : firstSense(g).startsWith(lower) ? SCORE.starts : SCORE.anywhere);
      let hits = 0;
      for (const id of content.path) {
        const it = content.item(id);
        const g = it.kind === 'reading' ? it.gloss
          : it.kind === 'meaning' ? `${it.gloss || ''}; ${it.meaning || ''}` : null;
        const sc = g ? score(g) : null;
        if (sc !== null) { addItem(id, sc); hits++; }
      }
      for (const ch of content.offchars.keys()) {
        const sc = score((content.char(ch) || {}).gloss);
        if (sc !== null) { addOff(ch, sc); hits++; }
      }
      // no meaning has the word: try each reading's own example words, the
      // most frequent first, and say which one matched
      if (!hits) {
        const glosses = wordGloss(content);
        for (const id of content.path) {
          const it = content.item(id);
          if (it.kind !== 'reading') continue;
          const w = (it.words || []).find(x => re.test(glosses.get(x) || ''));
          if (!w) continue;
          addItem(id, SCORE.via);
          const r = found.get(id);
          if (!r.via) r.via = {form: w, gloss: glosses.get(w)};
        }
      }
    }
  }
  // best match first; then the order typed, path order, or (off the path)
  // dictionary-backed first and code point
  const byPath = (a, b) => a.score - b.score || a.order - b.order || content.rank(a.id) - content.rank(b.id);
  const group = g => [...found.values()].filter(r => r.group === g);
  const path = group('path').sort(byPath), parts = group('parts').sort(byPath);
  const off = group('off').sort((a, b) => a.score - b.score || a.order - b.order || b.rd - a.rd
                                || a.char.codePointAt(0) - b.char.codePointAt(0));
  const cut = rs => rs.slice(0, LIMIT).map(({group: _g, score: _s, order: _o, ...r}) => r);
  return {path: cut(path), parts: cut(parts), off: cut(off),
          total: {path: path.length, parts: parts.length, off: off.length}};
}
