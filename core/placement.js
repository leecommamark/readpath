// placement.js — the placement check (patch plan 6, Phase 1).
//
// Optional and re-runnable; it only ever checks off characters (DESIGN
// *Decisions*, Placement). It searches written-Chinese frequency, not the
// learning order: the pool is content.placementPool(), every main reading
// with a written rank, most written first. Which list ranked them is the
// export's business, not this file's.
//
// The search (Mark, 2026-09-29, step 6 6b; it replaces songpath's, plan
// 9.2): seven levels narrowing the learner's frontier ON A LOG SCALE -- the
// midpoint is the geometric mean of `lo` and `hi`, and the band round it is
// ±BAND of it -- so the steps are fine among the common characters and
// sweeping among the rare ones (knowing one rare character says more about
// knowing other rare ones than one common character says about the top 100).
// A level passes only on THREE RIGHT IN A ROW; a miss fails it -- except the
// check's first miss, which is forgiven once and asked again, so one slip
// can't cap a strong reader at the easy end (Mark chose it over strict three
// in a row and over three-before-two-wrong). So the check stops where the
// learner knows most of what it marks, not half: for a learner whose
// knowledge fades with rarity, songpath's best of 3 marked 18-34% wrongly,
// this about 8-17% (Phase 6b's simulation). A pass moves `lo` up to the
// midpoint, a fail moves `hi` down. The estimate is `lo`, so it errs low.
// "I don't know" is a miss.
//
// Applying it only ever adds (brief 6, decided 6): a reading already in
// Maintain is never in a plan, whatever was answered; a miss changes
// nothing. transition() itself would overwrite a known reading, so the rule
// lives here. Parts are never in a plan (they aren't in the pool).
//
// Pure: the content, the states, the day and a seeded rng come in. A check
// is a plain object; answer() returns a new one and never edits its input.

import {readingChoices} from './choices.js';
import {spreadDue, transition, isKnown} from './state.js';

export const LEVELS = 7;
export const PER_LEVEL = 3;                // right answers to pass a level
export const MISSES = 1;                   // wrong answers that fail it
export const FORGIVEN = 1;                 // misses per check that don't count (a slip)
export const BAND = 0.15;                  // the band: the midpoint's rank ±15%
export const MIN_BAND = 2;                 // ... and at least ±2 places
export const MIN_RATIO = 1.15;             // stop once hi / lo is this narrow
export const MAX_QUESTIONS = LEVELS * (PER_LEVEL + MISSES - 1) + FORGIVEN;

// The next question of a check, or null when it's done: a character from the
// band round the (geometric) midpoint that hasn't been asked in this run.
// Ranks are 1-based positions in the pool; lo = 0 is "none known".
function next(c, rng) {
  const a = Math.max(1, c.lo);
  if (c.level >= LEVELS || c.hi / a < MIN_RATIO) return null;
  const mid = Math.max(1, Math.round(Math.sqrt(a * c.hi)));
  const from = Math.max(1, Math.min(Math.floor(mid * (1 - BAND)), mid - MIN_BAND));
  const to = Math.min(c.pool.length, Math.max(Math.ceil(mid * (1 + BAND)), mid + MIN_BAND));
  const asked = new Set(c.asked.map(x => x.id));
  const band = c.pool.slice(from - 1, to).filter(p => !asked.has(p.id));
  if (!band.length) return null;
  return {...rng.pick(band), mid};
}

// startCheck(pool, rng) -> a check. `pool` is content.placementPool().
export function startCheck(pool, rng) {
  const c = {pool, lo: 0, hi: pool.length, level: 0, results: [], asked: [], cur: null,
             forgiven: 0};
  return Object.freeze({...c, cur: next(c, rng)});
}

// question(check) -> {id, char, wrank, level (1-based), n (1-based within the
// level)} | null when the check is done.
export function question(c) {
  if (!c.cur) return null;
  const {id, char, wrank} = c.cur;
  return {id, char, wrank, level: c.level + 1, n: c.results.length + 1};
}

// answer(check, ok, rng) -> the next check. ok false is a wrong answer or
// "I don't know".
export function answer(c, ok, rng) {
  if (!c.cur) throw new Error('answer: the check is done');
  const asked = [...c.asked, {id: c.cur.id, ok: !!ok}];
  let {lo, hi, level, forgiven} = c;
  // the first miss of the check is forgiven, once: asked again at the level
  if (!ok && forgiven < FORGIVEN) {
    const d = {...c, asked, forgiven: forgiven + 1, cur: null};
    return Object.freeze({...d, cur: next(d, rng)});
  }
  let results = [...c.results, !!ok];
  const rights = results.filter(Boolean).length;
  if (rights === PER_LEVEL || results.length - rights === MISSES) {  // settled
    if (rights === PER_LEVEL) lo = c.cur.mid; else hi = c.cur.mid;
    level++;
    results = [];
  }
  const d = {pool: c.pool, lo, hi, level, results, asked, forgiven, cur: null};
  return Object.freeze({...d, cur: next(d, rng)});
}

export const done = c => !c.cur;

// result(check) -> {n, right, asked}: about the n most written characters are
// known; `right` the ids answered right; `asked` how many questions.
export function result(c) {
  return {n: c.lo, right: c.asked.filter(a => a.ok).map(a => a.id),
          asked: c.asked.length};
}

// The question's four readings (readingChoices, as a session's rung 2): the
// wrong ones from the readings already asked in this check, then main
// readings near the character on the path.
export function choicesFor(content, c, rng) {
  const q = question(c);
  if (!q) return null;
  const pool = c.asked.map(a => content.item(a.id).jp);
  return readingChoices(content, q.char, content.item(q.id).jp, rng, pool);
}

// placementPlan(content, states, {n, right}, today) -> {ids, due}: the top n
// of the pool and every reading answered right, less any already in
// Maintain, in path order, with due days spread over SPREAD (state.js) so a
// big placement never sets off the backlog rule. Not now is {n: 0, right}.
export function placementPlan(content, states, {n, right = []}, today) {
  const pool = content.placementPool();
  const want = new Set([...pool.slice(0, Math.max(0, n)).map(p => p.id), ...right]);
  const ids = [...want]
    .filter(id => content.kind(id) === 'reading' && !isKnown(states[id]))
    .sort((a, b) => content.rank(a) - content.rank(b));
  return {ids, due: spreadDue(ids, today)};
}

// applyPlacement(states, plan, today) -> a new states object: each id placed
// through transition(). The input is not touched.
export function applyPlacement(states, {ids, due}, today) {
  const out = {...states};
  for (const id of ids) {
    out[id] = transition(states[id] || null, {type: 'placed', item: id, due: due.get(id)}, today);
  }
  return out;
}
