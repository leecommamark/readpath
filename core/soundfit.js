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
