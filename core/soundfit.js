// soundfit.js — how a sound part gives a character its sound.
//
// Since patch plan 7.32 that is the family's range (below): what the guesses,
// Built from's labels and the family section all read. Until 7.34 phase 9
// this file also held soundFit, brief 7.28 P4's six labels (sound, rhymes,
// same start, shifted, like ..., possibly historic?), retired when
// review/sound_labels.tsv was rebuilt on the range (Mark, 2026-11-15).
// rhymesWith stays: a worn-down shape close in sound too (7.34 Decided 13).

import {splitSyl} from './soundfamily.js';

// splitSyl with syllabic ng read as m
function syl(jp) {
  const s = splitSyl(jp);
  return s && s.nucleus === 'ng' ? {...s, nucleus: 'm', rime: 'm'} : s;
}

const studySyls = (content, ch) =>
  content.readingsOf(ch).filter(r => r.item).map(r => syl(r.jp)).filter(Boolean);

function partSyls(content, part, reading) {
  let jps = content.readingsOf(part).filter(r => r.item).map(r => r.jp);
  if (!jps.length && content.partReading(part)) jps = [content.partReading(part)];
  if (reading) jps = jps.concat(reading);
  return jps.map(syl).filter(Boolean);
}

// rhymesWith(content, ch, form) -> whether `form`'s own reading shares a
// rime with one of `ch`'s (tone ignored, m and ng one sound): a worn-down
// shape that is close in sound too (patch plan 7.34, Decided 13: 志 寺 zi
// and the 士 si6 they show; 矣 ji5 and 厶 si1)
export function rhymesWith(content, ch, form) {
  const theirs = partSyls(content, form);
  return studySyls(content, ch).some(x => theirs.some(y => x.rime === y.rime));
}

// ---- the range (patch plan 7.32, R2-R8; Mark, 2026-11-14/15)
//
// A family is its head and its members: the head's own, and the members of
// any part folded into it (R1; content.familyMembers carries them merged).
// Since brief 7.33 its range is built from the research's family: the head
// and every member on the path or off, with the readings Mark's sound
// analysis keeps (content.rangeReadingsOf, sources/sound_research.tsv via
// the export, which decides with the same range which parts are taught:
// readpath/lib/soundrange.py; test/range_agree.test.js holds the two
// together). The range is a set of starts and a set of endings (the
// research's range B, research/analysis/score.py): a value is in it when two
// characters carry it, or one does and a class-mate (curated/sound_classes.tsv)
// is carried. The head's readings build the range and are never tested.
// Syllabic m and ng are one sound starting ng- (soundFit's, W3a, W4a).
//   familyRange(content, head)  {onsets, rimes}: the whole family's, the one
//                               the line names (R11)
//   inRange(content, ch, head)  ch's family without ch gives a range one of
//                               ch's readings is in (leave-one-out, R2); a
//                               member with a per_char reading always is
//   guessable(content, ch)      ch's MAIN reading is in its family's range
//                               without it (R7)
//   partFit(content, head)      {n, inn, outside, alone}: the share in range;
//                               `outside` has no reading in the whole range
//                               (the line's "Not in"), `alone` is in it only
//                               on its own account
// Memoised per content.

const ranged = new WeakMap();

// a start and an ending; syllabic m and ng one sound starting ng-
export function rangeSyl(jp) {
  const s = splitSyl(jp);
  if (!s) return null;
  if (s.nucleus === 'ng' || s.nucleus === 'm') return {onset: 'ng', rime: 'm'};
  return {onset: s.onset || '∅', rime: s.rime};
}

const studied = (content, ch) => content.readingsOf(ch).filter(r => r.item).map(r => r.jp);

function rangeMemo(content) {
  if (!ranged.has(content)) ranged.set(content, {bag: new Map(), whole: new Map(), loo: new Map()});
  return ranged.get(content);
}

// [ch, {onset, rime}] for the head and every member, on the path or off,
// from the range readings; `members` the path members with a studied reading
function bagOf(content, head) {
  const m = rangeMemo(content);
  if (!m.bag.has(head)) {
    const bag = Object.entries(content.rangeReadingsOf(head))
      .flatMap(([c, jps]) => jps.map(jp => [c, rangeSyl(jp)]))
      .filter(x => x[1]);
    const members = content.familyMembers(head).filter(c => studied(content, c).length);
    m.bag.set(head, {bag, members});
  }
  return m.bag.get(head);
}

// the values of one slot in range, `excl` left out
function slotSet(content, bag, slot, excl) {
  const by = new Map();
  for (const [c, p] of bag) {
    if (c === excl) continue;
    if (!by.has(p[slot])) by.set(p[slot], new Set());
    by.get(p[slot]).add(c);
  }
  const classes = content.soundClasses[slot];
  const out = new Set();
  for (const [v, cs] of by) {
    if (cs.size >= 2) out.add(v);
    else if ((classes.find(g => g.includes(v)) || []).some(u => u !== v && by.has(u))) out.add(v);
  }
  return out;
}

export function familyRange(content, head) {
  const m = rangeMemo(content);
  if (!m.whole.has(head)) {
    const {bag} = bagOf(content, head);
    m.whole.set(head, {onsets: slotSet(content, bag, 'onset'), rimes: slotSet(content, bag, 'rime')});
  }
  return m.whole.get(head);
}

function looRange(content, head, ch) {
  const m = rangeMemo(content);
  const k = `${head}|${ch}`;
  if (!m.loo.has(k)) {
    const {bag} = bagOf(content, head);
    m.loo.set(k, {onsets: slotSet(content, bag, 'onset', ch), rimes: slotSet(content, bag, 'rime', ch)});
  }
  return m.loo.get(k);
}

const within = (r, jp) => {
  const p = rangeSyl(jp);
  return !!p && r.onsets.has(p.onset) && r.rimes.has(p.rime);
};

export function inRange(content, ch, head) {
  if (content.perCharOf(head)[ch]) return true;
  const r = looRange(content, head, ch);
  return studied(content, ch).some(jp => within(r, jp));
}

export function guessable(content, ch) {
  const head = content.familyHeadOf(ch);
  const id = content.mainReading(ch);
  if (!head || !id || ch === head) return false;
  if (content.perCharOf(head)[ch]) return true;
  return within(looRange(content, head, ch), content.item(id).jp);
}

// whether a reading falls in a family's whole range: a wrong choice must not
// share its start or its ending with it (R8), so this is per slot
export function sharesRange(content, head, jp) {
  const p = rangeSyl(jp);
  const r = familyRange(content, head);
  return !!p && (r.onsets.has(p.onset) || r.rimes.has(p.rime));
}

export function partFit(content, head) {
  const {members} = bagOf(content, head);
  const whole = familyRange(content, head);
  const inn = [], outside = [], alone = [];
  for (const c of members) {
    if (inRange(content, c, head)) inn.push(c);
    else (studied(content, c).some(jp => within(whole, jp)) ? alone : outside).push(c);
  }
  return {n: members.length, fit: members.length ? inn.length / members.length : 1, inn, outside, alone};
}
