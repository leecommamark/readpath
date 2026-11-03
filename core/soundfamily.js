// soundfamily.js — how a sound family is read, and how a part is used
// (brief 7.25; patch plan 7.25, Phase 2).
//
// soundFamily(content, key) answers "if I meet a character with 者 I
// haven't seen, how is it probably read?" for a family card (familiesOf):
//   * each member but the head counts once, its one count split across its
//     study-item readings by `share` (著: mostly zoek, a little zyu; evenly
//     where no reading has a share); the head can't be "a new character
//     with this part" (decided 2-3). Tone is ignored: one row per toneless
//     syllable;
//   * two rows go in the same box when their similarity is >= SIM_MIN,
//     single linkage (decided 5): phonology.py's syl_sim, onset ×
//     max(rime, nucleus × coda), from the sound_sim table. No hand-set
//     rules: oe and eo stay apart (decided 6);
//   * a box's title says what its rows share (decided 7; P3): the same
//     ending ("–yu"), the same start ("s–"), a grid when both vary and
//     every pair is there (青: c z × ing eng), or the syllables listed;
//     its chips name the swaps ("z ~ s ~ c");
//   * boxes, and rows in a box, by share, highest first (decided 8); a lone
//     row under OTHERS_UNDER folds into Others (decided 9);
//   * the head's tile sits on each row that is one of its own readings;
//     a reading of its own that no member has is `headOnly` (P6).
// Shares are fractions of n, the members counted. Fixed reference figures:
// nothing here reads a learner's states.
//
// roleCounts(content, form) -> {total, sound, meaning, form}: the
// characters that have `form` as a part with a recorded role (decided 10).
// One with no role row is unknown, not empty, and isn't counted.

import {familiesOf} from './family.js';

export const SIM_MIN = 0.15;
export const OTHERS_UNDER = 0.01;

// phonology.py's ONSETS, NUCLEI and CODAS (cantonese.py's onsets)
const ONSETS = ['ng', 'gw', 'kw', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l',
                'g', 'k', 'h', 'w', 'z', 'c', 's', 'j'];
const NUCLEI = ['aa', 'a', 'e', 'i', 'o', 'u', 'oe', 'eo', 'yu'];
const CODAS = ['ng', 'n', 'm', 'p', 't', 'k', 'i', 'u', ''];

export const toneless = jp => jp.replace(/[1-6]$/, '');

// splitSyl('zoek') -> {onset: 'z', nucleus: 'oe', coda: 'k', rime: 'oek'},
// as phonology.split; null if it doesn't parse
export function splitSyl(syl) {
  const s = toneless(syl);
  if (s === 'm' || s === 'ng') return {onset: '', nucleus: s, coda: '', rime: s};   // syllabic nasal
  const onset = ONSETS.find(o => s.startsWith(o)) || '';
  const rime = s.slice(onset.length);
  for (const coda of CODAS) {
    if (coda && !rime.endsWith(coda)) continue;
    const nucleus = rime.slice(0, rime.length - coda.length);
    if (NUCLEI.includes(nucleus)) return {onset, nucleus, coda, rime};
  }
  return null;
}

// phonology.py's syl_sim (SOFTEN is 1)
export function sylSim(content, a, b) {
  const x = splitSyl(a), y = splitSyl(b);
  if (!x || !y) return 0;
  const sim = slot => content.soundSim(slot, x[slot], y[slot]);
  return sim('onset') * Math.max(sim('rime'), sim('nucleus') * sim('coda'));
}

export function roleCounts(content, form) {
  const n = content.roleCountsOf(form);
  return {total: n.sound + n.meaning + n.form, ...n};
}

// a member's study-item readings with their part of its one count
function splitCount(content, ch) {
  const rs = content.readingsOf(ch).filter(r => r.item);
  const total = rs.reduce((t, r) => t + (r.share || 0), 0);
  return rs.map(r => ({r, w: total ? (r.share || 0) / total : 1 / rs.length}));
}

// the distinct values of one slot over rows, in row order
const valuesOf = (rows, slot) => [...new Set(rows.map(r => r.parts[slot]))];

// a box's title: {kind: 'ending' | 'start' | 'grid' | 'list' | 'one', ...}
function titleOf(rows) {
  if (rows.length === 1) return {kind: 'one', chips: []};
  const starts = valuesOf(rows, 'onset'), ends = valuesOf(rows, 'rime');
  const chip = vs => vs.length > 1 ? [vs] : [];
  const chips = [...chip(starts), ...chip(ends)];
  if (ends.length === 1) return {kind: 'ending', ending: ends[0], chips};
  if (starts.length === 1 && starts[0]) return {kind: 'start', start: starts[0], chips};
  const has = new Set(rows.map(r => `${r.parts.onset}|${r.parts.rime}`));
  if (starts.length > 1 && starts.every(s => ends.every(e => has.has(`${s}|${e}`)))) {
    const at = new Map(rows.map(r => [`${r.parts.onset}|${r.parts.rime}`, r]));
    return {kind: 'grid', starts, ends, chips,
            cells: ends.map(e => starts.map(s => at.get(`${s}|${e}`)))};
  }
  return {kind: 'list', chips};
}

export function soundFamily(content, key) {
  const fam = familiesOf(content);
  const card = fam.byKey.get(key) || fam.folded.get(key);
  if (!card || card.type !== 'family') return null;
  const head = card.head;
  const order = ch => fam.number.get(ch) ?? Infinity;
  const members = card.members.filter(ch => ch !== head);
  const n = members.length;
  const rows = new Map();                  // toneless syllable -> row
  const rowOf = syl => {
    if (!rows.has(syl)) rows.set(syl, {syl, parts: splitSyl(syl), share: 0, chars: new Set(), tiles: []});
    return rows.get(syl);
  };
  for (const ch of members) {
    for (const {r, w} of splitCount(content, ch)) {
      const row = rowOf(toneless(r.jp));
      row.share += w / n;
      row.chars.add(ch);
      row.tiles.push({form: ch, id: `r:${ch}:${r.jp}`, jp: r.jp, second: !r.primary, head: false});
    }
  }
  // the head's own readings: its study items, else its reading as a part
  let own = content.readingsOf(head).filter(r => r.item).map(r => ({jp: r.jp, id: `r:${head}:${r.jp}`, second: !r.primary}));
  if (!own.length && content.partReading(head)) own = [{jp: content.partReading(head), id: null, second: false}];
  const headOnly = [];
  for (const o of own) {
    const row = rows.get(toneless(o.jp));
    if (row) {
      row.own = true;
      row.tiles.push({form: head, id: o.id, jp: o.jp, second: o.second, head: true});
    } else if (!headOnly.includes(toneless(o.jp))) headOnly.push(toneless(o.jp));
  }
  // rows: by share, then by their first character's place on the path
  for (const row of rows.values()) {
    row.first = Math.min(...[...row.chars].map(order));
    row.count = row.chars.size;
    delete row.chars;
    row.tiles.sort((a, b) => order(a.form) - order(b.form) || a.second - b.second);
  }
  const list = [...rows.values()].sort((a, b) => b.share - a.share || a.first - b.first);
  // single linkage at SIM_MIN
  const up = list.map((_, i) => i);
  const find = i => (up[i] === i ? i : (up[i] = find(up[i])));
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      if (sylSim(content, list[i].syl, list[j].syl) >= SIM_MIN) up[find(i)] = find(j);
    }
  }
  const groups = new Map();
  list.forEach((row, i) => {
    const g = find(i);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(row);           // list is in order, so each group is
  });
  const all = [...groups.values()].map(rs => ({
    rows: rs, share: rs.reduce((t, r) => t + r.share, 0), title: titleOf(rs)}))
    .sort((a, b) => b.share - a.share || a.rows[0].first - b.rows[0].first);
  const lone = b => b.rows.length === 1 && b.share < OTHERS_UNDER;
  const otherRows = all.filter(lone).flatMap(b => b.rows);
  return {key, head, n, boxes: all.filter(b => !lone(b)),
          others: otherRows.length ? {rows: otherRows, share: otherRows.reduce((t, r) => t + r.share, 0)} : null,
          headOnly, roles: roleCounts(content, head)};
}
