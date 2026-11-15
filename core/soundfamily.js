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
//   * the boxes are by ending, then start (Mark, 2026-11-15: "-ong and
//     -oeng with d, t and c in the first section and s and z in the
//     second"): one box per ending, its rows the starts read with it;
//     syllabic ng and m one box of their own; boxes, and rows in a box, by
//     share, highest first (decided 8); a lone row under OTHERS_UNDER folds
//     into Others (decided 9). Until 7.32 a box was readings that sound
//     alike (sylSim single linkage, decided 5);
//   * the head's tile sits on each row that is one of its own readings;
//     a reading of its own that no member has is `headOnly` (P6);
//   * `range` (patch plan 7.32, Phase 2 as Mark revised it): the family's
//     range (core/soundfit.js) as a syllable grid, no characters and no tone
//     -- {starts, ends, cells: [end][start] share, rest}: the starts and
//     endings some reading in the range has, by how many members carry
//     them, and in each cell the share of the family read that way; `rest`
//     is the share read outside the range. "At a glance, the guessing rule."
// Shares are fractions of n, the members counted. Fixed reference figures:
// nothing here reads a learner's states.
//
// roleCounts(content, form) -> {total, sound, meaning, form}: the
// characters that have `form` as a part with a recorded role (decided 10).
// One with no role row is unknown, not empty, and isn't counted.

import {familiesOf} from './family.js';
import {familyRange, rangeSyl} from './soundfit.js';

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
  // a family head counts its whole family as using it for its sound,
  // the members of the parts folded into it too (7.32 R1: 院 uses 元, through
  // 完), each character once
  const uses = content.usesOf(form);
  const sound = new Set(uses.filter(u => u.role === 'sound').map(u => u.char));
  const added = content.familyMembers(form).filter(c => !sound.has(c));
  if (!added.length) return {total: n.sound + n.meaning + n.form, ...n};
  const moved = r => uses.filter(u => u.role === r && added.includes(u.char)).length;
  const out = {sound: n.sound + added.length, meaning: n.meaning - moved('meaning'), form: n.form - moved('form')};
  return {total: out.sound + out.meaning + out.form, ...out};
}

// a member's study-item readings with their part of its one count
function splitCount(content, ch) {
  const rs = content.readingsOf(ch).filter(r => r.item);
  const total = rs.reduce((t, r) => t + (r.share || 0), 0);
  return rs.map(r => ({r, w: total ? (r.share || 0) / total : 1 / rs.length}));
}

// the distinct values of one slot over rows, in row order
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
  // boxes by ending, syllabic ng and m one ending
  const endOf = row => (rangeSyl(row.syl) || {rime: row.syl}).rime;
  const groups = new Map();
  for (const row of list) {
    const e = endOf(row);
    if (!groups.has(e)) groups.set(e, []);
    groups.get(e).push(row);              // list is in order, so each group is
  }
  const all = [...groups].map(([e, rs]) => ({
    rows: rs, share: rs.reduce((t, r) => t + r.share, 0),
    title: rs.length === 1 && e !== 'm' ? {kind: 'one', chips: []}
      : e === 'm' ? {kind: 'syllabic', chips: []} : {kind: 'ending', ending: e, chips: []}}))
    .sort((a, b) => b.share - a.share || a.rows[0].first - b.rows[0].first);
  const lone = b => b.rows.length === 1 && b.share < OTHERS_UNDER;
  const otherRows = all.filter(lone).flatMap(b => b.rows);
  // the range as a syllable grid (a row whose characters are all per_char
  // members, 語 under 五, is Mark's ruling, not the range's: it counts in rest)
  const rg = familyRange(content, head);
  const cell = new Map(), carried = {onset: new Map(), rime: new Map()};
  let inside = 0;
  for (const row of list) {
    const p = rangeSyl(row.syl);
    if (!p || !rg.onsets.has(p.onset) || !rg.rimes.has(p.rime)) continue;
    const k = `${p.onset}|${p.rime}`;
    cell.set(k, (cell.get(k) || 0) + row.share);
    inside += row.share;
    for (const slot of ['onset', 'rime']) carried[slot].set(p[slot], (carried[slot].get(p[slot]) || 0) + row.count);
  }
  const byCount = m => [...m.keys()].sort((a, b) => m.get(b) - m.get(a) || a.localeCompare(b));
  const starts = byCount(carried.onset), ends = byCount(carried.rime);
  const range = {starts, ends, cells: ends.map(e => starts.map(o => cell.get(`${o}|${e}`) || 0)),
                 rest: Math.max(0, 1 - inside)};
  return {key, head, n, boxes: all.filter(b => !lone(b)),
          others: otherRows.length ? {rows: otherRows, share: otherRows.reduce((t, r) => t + r.share, 0)} : null,
          range, headOnly, roles: roleCounts(content, head)};
}
