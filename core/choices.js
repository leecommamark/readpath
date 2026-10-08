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
//   placementMeaningChoices   a meaning for a character in the placement
//                      check (7.13), where the meaning part is no clue
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
  const withSound = new Map();         // sound part -> [char] with a main reading
  for (const id of mains) {
    const ch = content.item(id).char;
    const sp = content.soundPartOf && content.soundPartOf(ch);
    if (!sp) continue;
    if (!withSound.has(sp)) withSound.set(sp, []);
    withSound.get(sp).push(ch);
  }
  X = {family, familyOf, mains, mainAt, withPart, withSound};
  INDEX.set(content, X);
  return X;
}

// ---- tell apart near the learner (brief 7.20 P1, Mark 2026-10-08)
//
// A first session (placed at ~270 known) was asked 侗 (rank 4,808) among
// 胴 恫 洞, and offered 騮 餾 遛 against 榴: the family was any the part
// resolves, the member any member. Now a member is *eligible* when its main
// reading is met (learning or known) or lies within TELL_WINDOW path ranks
// after the learner's frontier, the rank of the first main reading not yet
// met. The target is an eligible member; wrong choices are eligible members
// first, then the family's other members ranked TELL_FAR or less. A family
// with fewer than 2 eligible members is not asked. Without `states` (a
// reference view) every member is eligible, as before.
export const TELL_WINDOW = 300;
export const TELL_FAR = 3000;

// The rank of the first main reading on the path not yet met; past the end,
// when every one is.
export function frontier(content, states) {
  const X = index(content);
  for (const id of X.mains) if (!states[id]) return content.rank(id);
  return Infinity;
}

// tellApartPool(content, head, states) -> {eligible: [row], far: [row]}:
// the family's members a question may ask about, and the others that may
// still be offered (ranked TELL_FAR or less), each in the family's order.
export function tellApartPool(content, head, states = null) {
  const rows = index(content).family.get(head) || [];
  if (!states) return {eligible: rows, far: []};
  const edge = frontier(content, states) + TELL_WINDOW;
  const eligible = [], far = [];
  for (const r of rows) {
    const id = content.mainReading(r.char);
    const rank = id ? content.rank(id) : Infinity;
    if (id && (states[id] || rank <= edge)) eligible.push(r);
    else if (rank <= TELL_FAR) far.push(r);
  }
  return {eligible, far};
}

const glossOf = (content, ch) => {
  const id = content.mainReading(ch);
  return id ? content.item(id).gloss : null;
};

// ---- readings

// readingChoices(content, char, answer, rng, pool, exclude, opts) -> [jp],
// CHOICES long, shuffled, the answer among them once. `answer` is the toned
// reading asked for; `pool` the toned readings of the session's other items
// (runner.js); `exclude` readings never to offer -- a word question's other
// syllables, which sit on screen above the other characters, or the
// placement check's earlier answers (7.13). opts.soundRival (the placement
// check, brief 7.13 decided 4): where another character with the same sound
// part reads differently, one wrong choice is its reading, so knowing the
// sound part doesn't single out the answer (青 doesn't give away 晴).
export function readingChoices(content, char, answer, rng, pool = [], exclude = [], opts = {}) {
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
  if (opts.soundRival) {
    const sp = content.soundPartOf && content.soundPartOf(char);
    const members = (sp && index(content).withSound.get(sp)) || [];
    const rivals = members.filter(ch => ch !== char)
      .map(ch => content.item(content.mainReading(ch)).jp);
    for (const jp of rng.shuffle([...new Set(rivals)])) {
      const k = keyOf(jp);
      if (!k || banned.has(k)) continue;
      banned.add(k);
      wrong.push(jp);
      break;
    }
  }
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

// tellApartChoices(content, head, rng, part, states) -> {answer, choices}:
// Tell apart, one member of the family asked for by its meaning, among the
// members that sound like it, then the rest. The member is the one `part`
// (the meaning part under test) marks, where the family has one: the
// question tests that part. Otherwise, and among several, it is drawn from
// those with a same-sounding sibling, which is what a meaning part tells
// apart. A family has at least 3 members, so a question may have 3 choices,
// not 4. With `states`, the member and the choices come from
// tellApartPool's eligible members first (brief 7.20 P1), so a question
// may have only 2.
export function tellApartChoices(content, head, rng, part = null, states = null) {
  const all = index(content).family.get(head);
  if (!all) throw new Error(`no tell-apart family: ${head}`);
  // tellApartTarget only names a family with 2+ eligible members; a caller
  // whose states disagree gets the whole family, as before 7.20
  const pool = tellApartPool(content, head, states);
  const {eligible: rows, far} = pool.eligible.length >= 2 ? pool : {eligible: all, far: []};
  const rivals = rows.filter(r => rows.some(o => o !== r && o.sound === r.sound));
  const marked = rows.filter(r => part && r.meaning_part === part);
  const markedRivals = marked.filter(r => rivals.includes(r));
  const own = rng.pick(markedRivals.length ? markedRivals
                       : marked.length ? marked : rivals.length ? rivals : rows);
  // never a sibling marked by another shape of the same part: 忘's 心 and
  // 忙's 忄 are one part, so they tell nothing apart (patch plan 6.5,
  // CO-062, Mark 2026-09-29)
  const one = content.onePart || (x => x);
  const sib = r => r !== own && !(r.meaning_part && own.meaning_part
    && r.meaning_part !== own.meaning_part && one(r.meaning_part) === one(own.meaning_part));
  const near = rows.filter(sib), rest = far.filter(sib);
  const wrong = takeByGloss(content, [
    near.filter(r => r.sound === own.sound).map(r => r.char),
    near.filter(r => r.sound !== own.sound).map(r => r.char),
    rest.filter(r => r.sound === own.sound).map(r => r.char),
    rest.filter(r => r.sound !== own.sound).map(r => r.char),
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

// placementMeaningChoices(content, id, rng, exclude) -> {answer, choices}: the
// placement check's meaning question (brief 7.13 decided 5, Phase 0 Q6).
// Unlike meaningChoices, the meaning part is no clue: the wrong meanings
// come from characters with the SAME meaning part first (another shape of
// it counts: 心 and 忄), then from main readings near it in written rank,
// the window widening. No two choices share a gloss, none is a gloss the
// character has under another reading, and none belongs to `exclude` (the
// check's earlier characters).
export function placementMeaningChoices(content, id, rng, exclude = []) {
  const it = content.item(id);
  const answer = it.gloss;
  const one = content.onePart || (x => x);
  const part = content.meaningPartOf(it.char);
  const pool = content.placementPool();
  const at = pool.findIndex(p => p.char === it.char);
  const sameTier = part
    ? pool.filter(p => p.char !== it.char && one(content.meaningPartOf(p.char)) === one(part))
        .map(p => p.char)
    : [];
  const near = width => {
    const out = [];
    for (let d = 1; d <= width; d++) {
      for (const i of [at - d, at + d]) if (i >= 0 && i < pool.length) out.push(pool[i].char);
    }
    return out;
  };
  const taken = [it.char, ...exclude.filter(ch => ch !== it.char)];
  let wrong = [];
  for (let width = WINDOW; wrong.length < CHOICES - 1; width *= 2) {
    wrong = takeByGloss(content, [sameTier, near(width)], taken, CHOICES - 1, rng);
    if (width > pool.length) break;
  }
  return {answer, choices: rng.shuffle([answer, ...wrong.map(ch => glossOf(content, ch))])};
}
