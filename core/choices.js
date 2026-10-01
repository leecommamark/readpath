// choices.js — the answer choices a task card shows (patch plan 4, Phase 1).
//
// Pure and seeded, like the rest of core/: the content comes in, every draw
// comes from the rng, and nothing here reads the clock or the disk. A task
// descriptor (tasks.js) names the item; this file decides what it is asked
// against. Four builders:
//
//   readingChoices     a reading, among the session's other readings (rungs 2
//                      and 4, Predict, the Meet guessed from a sound part)
//   characterChoices   a character for an English meaning (rung 3)
//   tellApartChoices   a family member for its meaning (Tell apart)
//   meaningChoices     a meaning for a character (the Meet inferred from its
//                      meaning part)
//
// Reading choices (Mark, 2026-09-29, from the iPhone check; replacing brief
// 4's decision 2): sound-alike choices clustered round the answer, so the
// answer was the one in the middle -- hai among haai, gai, hei -- and the
// question became spelling, not recall. The wrong choices are now the
// readings of the session's OTHER characters, then of main readings near the
// character on the path, never picked for sounding alike. What stays:
//   * no two choices sound the same to a merging speaker (the syllable
//     table's `key`: n = l, ng = zero, gw/kw = g/k before -o), so none
//     differs from another by tone alone;
//   * none is a reading of the same character, nor the answer's
//     literary/colloquial counterpart (the table's `pair`: cing ~ ceng);
//   * each is a real reading of a real character, so it is attested.
// Character and meaning choices never share an English gloss, so the
// question always has one answer.

import {toneless} from './content.js';

export const CHOICES = 4;
// the rank window (either side) for choices drawn by path rank
export const WINDOW = 50;

const norm = g => (g || '').trim().toLowerCase();

// Indexes over the content the builders share, made once per content object.
const INDEX = new WeakMap();
function index(content) {
  let X = INDEX.get(content);
  if (X) return X;
  const family = new Map();            // head -> [tellapart row]
  const familyOf = new Map();          // char -> head
  for (const r of content.tellapart) {
    if (!family.has(r.head)) family.set(r.head, []);
    family.get(r.head).push(r);
    familyOf.set(r.char, r.head);
  }
  const mains = content.path.filter(id => {
    const it = content.item(id);
    return it.kind === 'reading' && it.primary;
  });                                  // main reading ids, in path order
  const mainAt = new Map(mains.map((id, i) => [content.item(id).char, i]));
  const withPart = new Map();          // part -> [char] with a main reading
  for (const id of mains) {
    const ch = content.item(id).char;
    for (const {part} of content.partsOf(ch)) {
      if (!withPart.has(part)) withPart.set(part, []);
      withPart.get(part).push(ch);
    }
  }
  X = {family, familyOf, mains, mainAt, withPart};
  INDEX.set(content, X);
  return X;
}

const glossOf = (content, ch) => {
  const id = content.mainReading(ch);
  return id ? content.item(id).gloss : null;
};

// ---- readings

// readingChoices(content, char, answer, rng, pool, exclude) -> [jp], CHOICES
// long, shuffled, the answer among them once. `answer` is the toned reading
// asked for; `pool` the toned readings of the session's other items
// (runner.js); `exclude` readings never to offer -- a word question's other
// syllables, which sit on screen above the other characters.
export function readingChoices(content, char, answer, rng, pool = [], exclude = []) {
  const syl = content.syllables;
  const own = syl.get(toneless(answer));
  if (!own) throw new Error(`no syllable row for ${answer}`);
  const keyOf = jp => (syl.get(toneless(jp)) || {}).key;
  const banned = new Set([own.key, ...own.pair.map(s => syl.get(s).key)]);
  for (const r of content.readingsOf(char)) {
    const k = keyOf(r.jp);
    if (k) banned.add(k);
  }
  for (const jp of exclude) {
    const k = keyOf(jp);
    if (k && k !== own.key) banned.add(k);
  }
  const wrong = [];
  const take = list => {
    for (const jp of rng.shuffle([...new Set(list)])) {
      if (wrong.length === CHOICES - 1) return;
      const k = keyOf(jp);
      if (!k || banned.has(k)) continue;
      banned.add(k);
      wrong.push(jp);
    }
  };
  take(pool);
  // then main readings near the character on the path, the window widening
  // until three are found (a test checks every reading item with no pool)
  const X = index(content);
  for (let width = WINDOW; wrong.length < CHOICES - 1; width *= 2) {
    take(byRank(content, char, width).map(ch => content.item(content.mainReading(ch)).jp));
    if (width > X.mains.length) break;
  }
  return rng.shuffle([answer, ...wrong]);
}

// ---- characters

// Take up to `n` characters from tiers of candidates, each tier shuffled,
// skipping any whose gloss is missing or already taken.
// Every reading's gloss of the characters already taken counts as taken too,
// so no wrong choice is a meaning the character itself has under another
// reading (Mark's iPhone check: 應 offered "should" as wrong).
function takeByGloss(content, tiers, taken, n, rng) {
  const out = [];
  const seen = new Set(taken.map(ch => ch));
  const glosses = new Set(taken.map(ch => norm(glossOf(content, ch))));
  for (const ch of taken) {
    for (const r of content.readingsOf(ch)) if (r.gloss) glosses.add(norm(r.gloss));
  }
  for (const tier of tiers) {
    for (const ch of rng.shuffle(tier)) {
      if (out.length >= n) return out;
      if (seen.has(ch)) continue;
      const g = norm(glossOf(content, ch));
      if (!g || glosses.has(g)) continue;
      seen.add(ch);
      glosses.add(g);
      out.push(ch);
    }
  }
  return out;
}

// Main-reading characters near `ch` on the path, nearest first.
function byRank(content, ch, width = WINDOW) {
  const X = index(content);
  const at = X.mainAt.get(ch) ?? 0;
  const out = [];
  for (let d = 1; d <= width; d++) {
    for (const i of [at - d, at + d]) {
      if (i >= 0 && i < X.mains.length) out.push(content.item(X.mains[i]).char);
    }
  }
  return out;
}

// characterChoices(content, id, rng) -> {answer, choices}: rung 3, a main
// reading's character among others for its English meaning (Phase 0,
// decided 2): its tell-apart family (gated or not; the same-sounding rivals
// first), then characters sharing a part with it (sound part first), then
// main readings within WINDOW path ranks.
export function characterChoices(content, id, rng) {
  const X = index(content);
  const ch = content.item(id).char;
  const tiers = [];
  const head = X.familyOf.get(ch);
  if (head) {
    const own = X.family.get(head).find(r => r.char === ch);
    const sibs = X.family.get(head).filter(r => r.char !== ch);
    tiers.push(sibs.filter(r => r.sound === own.sound).map(r => r.char));
    tiers.push(sibs.filter(r => r.sound !== own.sound).map(r => r.char));
  }
  for (const {part} of content.partsOf(ch)) tiers.push(X.withPart.get(part) || []);
  tiers.push(byRank(content, ch));
  const wrong = takeByGloss(content, tiers, [ch], CHOICES - 1, rng);
  return {answer: ch, choices: rng.shuffle([ch, ...wrong])};
}

// tellApartChoices(content, head, rng, part) -> {answer, choices}: Tell apart,
// one member of the family asked for by its meaning, among the members that
// sound like it, then the rest. The member is the one `part` (the meaning
// part under test) marks, where the family has one: the question tests that
// part. Otherwise, and among several, it is drawn from those with a
// same-sounding sibling, which is what a meaning part tells apart. A family
// has at least 3 members, so a question may have 3 choices, not 4.
export function tellApartChoices(content, head, rng, part = null) {
  const rows = index(content).family.get(head);
  if (!rows) throw new Error(`no tell-apart family: ${head}`);
  const rivals = rows.filter(r => rows.some(o => o !== r && o.sound === r.sound));
  const marked = rows.filter(r => part && r.meaning_part === part);
  const markedRivals = marked.filter(r => rivals.includes(r));
  const own = rng.pick(markedRivals.length ? markedRivals
                       : marked.length ? marked : rivals.length ? rivals : rows);
  // never a sibling marked by another shape of the same part: 忘's 心 and
  // 忙's 忄 are one part, so they tell nothing apart (patch plan 6.5,
  // CO-062, Mark 2026-09-29)
  const one = content.onePart || (x => x);
  const sibs = rows.filter(r => r !== own && !(r.meaning_part && own.meaning_part
    && r.meaning_part !== own.meaning_part && one(r.meaning_part) === one(own.meaning_part)));
  const wrong = takeByGloss(content, [
    sibs.filter(r => r.sound === own.sound).map(r => r.char),
    sibs.filter(r => r.sound !== own.sound).map(r => r.char),
  ], [own.char], CHOICES - 1, rng);
  return {answer: own.char, choices: rng.shuffle([own.char, ...wrong])};
}

// ---- meanings

// meaningChoices(content, id, rng) -> {answer, choices}: the Meet inferred
// from a meaning part ("You know 氵 water. Which meaning fits?", Phase 0,
// decided 1). The wrong meanings belong to main readings near it on the path
// whose meaning part is a different one, so the part is the clue; the window
// widens if the nearest can't supply three.
export function meaningChoices(content, id, rng) {
  const it = content.item(id);
  const part = content.meaningPartOf(it.char);
  const answer = it.gloss;
  // a different part, not another shape of this one (CO-062: a 心
  // character is no wrong answer for 忄)
  const one = content.onePart || (x => x);
  const other = ch => {
    const p = content.meaningPartOf(ch);
    return p && one(p) !== one(part);
  };
  let wrong = [];
  for (let width = WINDOW; wrong.length < CHOICES - 1; width *= 2) {
    wrong = takeByGloss(content, [byRank(content, it.char, width).filter(other)],
                        [it.char], CHOICES - 1, rng);
    if (width > index(content).mains.length) break;
  }
  return {answer, choices: rng.shuffle([answer, ...wrong.map(ch => glossOf(content, ch))])};
}
