// soundfit.js — how well a sound part gives a character its sound (brief
// 7.28 P4; Mark's rulings, 2026-11-02).
//
// soundFit(content, ch, part) -> {kind, like}, for a character whose part
// is labelled `sound`. The first that holds, tone ignored:
//   * 'sound'     the character's reading sits in the box that holds the
//                 head's own sound on the family page (soundFamily): the
//                 part predicts it;
//   * 'rhymes'    it shares the part's rime;
//   * 'start'     it shares the part's onset;
//   * 'shifted'   its onset is a learned alternation of the part's
//                 (sound_sim onset >= SHIFT_MIN: gw~w 國 或, n~j 撚 然) and
//                 the rime or the coda is the part's;
//   * 'family'    none of those with the part, but one of them with other
//                 members (都 <- 者: 賭 屠 堵); `like` names up to two;
//   * 'historic'  nothing in Cantonese, or only a shared coda: the label
//                 is likely Old Chinese (Wiktionary's analyses), and Mark is
//                 not convinced: "possibly historic?".
// Syllabic m and ng count as one sound (Mark: 唔 m4 rhymes with 吾 ng4).
// Members are the characters whose part this is, as family.js counts them.
// Pure; memoised per content.

import {familiesOf} from './family.js';
import {soundFamily, splitSyl, toneless} from './soundfamily.js';

export const SHIFT_MIN = 0.05;
export const FITS = ['sound', 'rhymes', 'start', 'shifted', 'family', 'historic'];

const made = new WeakMap();

// splitSyl with syllabic ng read as m
function syl(jp) {
  const s = splitSyl(jp);
  return s && s.nucleus === 'ng' ? {...s, nucleus: 'm', rime: 'm'} : s;
}

function memo(content) {
  if (!made.has(content)) made.set(content, {fam: new Map(), members: null});
  const m = made.get(content);
  if (!m.members) {
    m.members = new Map();                 // part -> chars with it as sound part
    for (const ch of familiesOf(content).chars) {
      for (const p of content.partsOf(ch)) {
        if (p.role !== 'sound') continue;
        if (!m.members.has(p.part)) m.members.set(p.part, []);
        m.members.get(p.part).push(ch);
      }
    }
  }
  return m;
}

const studySyls = (content, ch) =>
  content.readingsOf(ch).filter(r => r.item).map(r => syl(r.jp)).filter(Boolean);

function partSyls(content, part, reading) {
  let jps = content.readingsOf(part).filter(r => r.item).map(r => r.jp);
  if (!jps.length && content.partReading(part)) jps = [content.partReading(part)];
  if (reading) jps = jps.concat(reading);
  return jps.map(syl).filter(Boolean);
}

// the first of rhymes / start / shifted that `mine` has with `theirs`
function relation(content, mine, theirs) {
  const any = test => mine.some(x => theirs.some(y => test(x, y)));
  if (any((x, y) => x.rime === y.rime)) return 'rhymes';
  if (any((x, y) => x.onset && x.onset === y.onset)) return 'start';
  if (any((x, y) => x.onset !== y.onset
      && (content.soundSim('onset', x.onset, y.onset) || 0) >= SHIFT_MIN
      && (x.rime === y.rime || (x.coda && x.coda === y.coda)))) return 'shifted';
  return null;
}

// rhymesWith(content, ch, form) -> whether `form`'s own reading shares a
// rime with one of `ch`'s (tone ignored, m and ng one sound): a worn-down
// shape that is close in sound too (patch plan 7.34, Decided 13: 志 寺 zi
// and the 士 si6 they show; 矣 ji5 and 厶 si1)
export function rhymesWith(content, ch, form) {
  const theirs = partSyls(content, form);
  return studySyls(content, ch).some(x => theirs.some(y => x.rime === y.rime));
}

export function soundFit(content, ch, part) {
  const m = memo(content);
  if (!m.fam.has(part)) m.fam.set(part, soundFamily(content, `f:${part}`));
  const f = m.fam.get(part);
  if (f && f.boxes.some(b => b.rows.some(r => r.own)
      && b.rows.some(r => r.tiles.some(t => t.form === ch && !t.head)))) return {kind: 'sound', like: []};
  const mine = studySyls(content, ch);
  const own = (content.partsOf(ch).find(p => p.part === part) || {}).reading;
  const rel = relation(content, mine, partSyls(content, part, own));
  if (rel) return {kind: rel, like: []};
  // the members it sounds most like: rhymes before a shared start before a
  // shift, then path order (說 <- 兌: like 脫 閱, not 稅)
  const like = (m.members.get(part) || []).filter(o => o !== ch)
    .map(o => ({o, rel: relation(content, mine, studySyls(content, o))}))
    .filter(x => x.rel)
    .sort((a, b) => FITS.indexOf(a.rel) - FITS.indexOf(b.rel));
  if (like.length) return {kind: 'family', like: like.slice(0, 2).map(x => x.o)};
  return {kind: 'historic', like: []};
}

// the label after a part on a card, Meet or answer: "(sound: rhymes)"
export function fitLabel(fit) {
  switch (fit && fit.kind) {
    case 'rhymes': return 'sound: rhymes';
    case 'start': return 'sound: same start';
    case 'shifted': return 'sound: shifted';
    case 'family': return `sound: like ${fit.like.join(' ')}`;
    case 'historic': return 'possibly historic?';
    default: return 'sound';
  }
}

// ---- the range (patch plan 7.32, R2-R8; Mark, 2026-11-14/15)
//
// A family is its head and its members: the head's own, and the members of
// any part folded into it (R1; content.familyMembers carries them merged).
// Its range is a set of starts and a set of endings (the research's range B,
// research/analysis/score.py): a value is in it when two members carry it,
// or one does and a class-mate (curated/sound_classes.tsv) is carried. The
// head's readings build the range and are never tested. Syllabic m and ng
// are one sound starting ng- (soundFit's, W3a, W4a).
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

// [ch, {onset, rime}] for the head and every member with a studied reading
function bagOf(content, head) {
  const m = rangeMemo(content);
  if (!m.bag.has(head)) {
    const own = studied(content, head);
    const hr = own.length ? own : [content.partReading(head)].filter(Boolean);
    const members = content.familyMembers(head).filter(c => studied(content, c).length);
    const bag = [...hr.map(jp => [head, rangeSyl(jp)]),
                 ...members.flatMap(c => studied(content, c).map(jp => [c, rangeSyl(jp)]))]
      .filter(x => x[1]);
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
