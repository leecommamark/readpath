// placement.js — the placement check (patch plan 6, Phase 1).
//
// Optional and re-runnable; it only ever checks off characters (DESIGN
// *Decisions*, Placement). It searches written-Chinese frequency, not the
// learning order: the pool is content.placementPool(), every main reading
// with a written rank, most written first. Which list ranked them is the
// export's business, not this file's.
//
// The search (brief 7.13 decided 6; it replaces step 6 6b's seven levels of
// three right in a row, which decided hundreds of characters on about three
// answers a level and marked 8-17% wrongly even for a learner who never
// guessed). Every answer feeds one model, and the cutoff is read off its
// pessimistic side:
//
//   P(right at rank r) = g + (1 - g - m) * fade(r / K),
//   fade(x) = 1 / (1 + x^(1/s))
//
// K is the rank where half is known; s how gently knowledge fades with
// rarity; g the chance of a right answer to an unknown character (a guess
// that gets both the reading and the meaning); m the chance of a miss on a
// known one (a slip or a hole). The model is a GRID over the four, with this
// prior: K log-uniform from 1 to 8,000 (past the pool's 4,856 since brief
// 7.17, 2,922 before, for a reader who knows them all); s from sharp (0.2) to gentle (0.65), equally likely;
// g and m each equally likely low or high. Every answer reweights the grid.
//
// The cutoff N: each cell's N is the largest rank whose expected unknown
// share, after the review step, is within BUDGET (the reviewed band counts
// only for what the learner misses there: Mark, Phase 3, counted the review
// in the target); the check's N is the LOWER quantile of those, weighted, so
// it is the pessimistic side of the estimate, not its midpoint. The next
// question goes to the rank whose answer, either way, would most narrow the
// spread of N, and asks an unasked character in a band round it. The check
// stops once N's midpoint is within SETTLED of its lower bound (after
// MIN_QUESTIONS), or at MAX_QUESTIONS. Tuned against test/placement_sim.js's
// learner (guessing, holes, slips) until brief 7.13 decided 1's targets
// passed: of what it marks, after the review, at most 5% unknown at the
// median, 10% in the worst tenth.
// "I don't know" is a miss, and so is a right reading with a wrong meaning
// (brief 7.13 decided 5: the meaning is asked after a right reading).
//
// Applying it is core/review.js's: nothing is placed until the learner
// confirms the review pages (brief 7.13 decided 7), and it only ever adds.
//
// Pure: the content, the states, the day and a seeded rng come in. A check
// is a plain object; answer() returns a new one and never edits its input.

import {readingChoices, placementMeaningChoices} from './choices.js';

export const MAX_QUESTIONS = 35;
export const MIN_QUESTIONS = 12;
export const BUDGET = 0.04;                // the model's after-review unknown share at the cutoff
export const LOWER = 0.2;                  // the quantile of N that is the cutoff
export const SETTLED = 1.25;               // stop once median N / lower N is this
export const BAND = 0.15;                  // a question's band: its rank ±15%
export const MIN_BAND = 2;                 // ... and at least ±2 places
// The review step (brief 7.13 decided 8): the rarest R of the top N are
// reviewed, R = min(N, REVIEW_A * N^REVIEW_B), fitted to Mark's anchors
// (10 -> 10, 100 -> about 70, 500 -> about 100). The cutoff counts on the
// learner untapping CAUGHT of the unknown characters it is shown there
// (Mark, Phase 3: the target counts the review step).
export const REVIEW_A = 25, REVIEW_B = 0.22;
export const CAUGHT = 0.8;
export const reviewBand = n => Math.min(n, Math.round(REVIEW_A * Math.pow(n, REVIEW_B)));
const K_MAX = 8000, K_STEPS = 48;
const SS = [0.2, 0.3, 0.45, 0.65];
const GS = [0.02, 0.1];
const MS = [0.06, 0.2];
const PROBES = 24;                         // ranks weighed for the next question

// The grid, made once: each cell {K, s, g, m}.
const GRID = (() => {
  const out = [];
  for (let i = 0; i < K_STEPS; i++) {
    const K = Math.exp(Math.log(K_MAX) * i / (K_STEPS - 1));
    for (const s of SS) for (const g of GS) for (const m of MS) out.push({K, s, g, m});
  }
  return out;
})();

// Each cell's cutoff for a pool of `size`: the largest N whose expected
// unknown share, after the review, is within BUDGET -- the skipped range
// counts in full, the reviewed band only for what the learner misses
// (1 - CAUGHT). Unknown at rank r is 1 - fade(r / K); g and m don't enter.
// Made once per pool size, with the order and log N the search uses.
const CUTS = new Map();
function cuts(size) {
  let t = CUTS.get(size);
  if (t) return t;
  const byKs = new Map();
  const cum = new Float64Array(size + 1);
  const N = new Float64Array(GRID.length);
  GRID.forEach((cell, i) => {
    const key = `${cell.K} ${cell.s}`;
    if (!byKs.has(key)) {
      for (let r = 1; r <= size; r++) {
        cum[r] = cum[r - 1] + 1 - 1 / (1 + Math.pow(r / cell.K, 1 / cell.s));
      }
      let best = 0;
      for (let n = 1; n <= size; n++) {
        const skip = n - reviewBand(n);
        if (cum[skip] + (1 - CAUGHT) * (cum[n] - cum[skip]) <= BUDGET * n) best = n;
      }
      byKs.set(key, best);
    }
    N[i] = byKs.get(key);
  });
  const order = GRID.map((c, i) => i).sort((a, b) => N[a] - N[b]);
  t = {N, order, logN: Float64Array.from(N, n => Math.log(n + 1))};
  CUTS.set(size, t);
  return t;
}

const pRight = (cell, r) => cell.g + (1 - cell.g - cell.m) / (1 + Math.pow(r / cell.K, 1 / cell.s));

// Each check's grid log-weights are carried on it (`lw`), one answer added at
// a time; the probes' P(right) are made once per pool size.
const PROBE_TABLES = new Map();
function probes(size) {
  let t = PROBE_TABLES.get(size);
  if (t) return t;
  t = [];
  for (let j = 0; j < PROBES; j++) {
    const r = Math.max(1, Math.round(Math.exp(Math.log(size) * j / (PROBES - 1))));
    t.push({r, p: Float64Array.from(GRID, c => pRight(c, r))});
  }
  PROBE_TABLES.set(size, t);
  return t;
}

function weights(lw) {
  let top = -Infinity;
  for (const x of lw) if (x > top) top = x;
  const w = new Float64Array(lw.length);
  let sum = 0;
  for (let i = 0; i < lw.length; i++) sum += (w[i] = Math.exp(lw[i] - top));
  for (let i = 0; i < w.length; i++) w[i] /= sum;
  return w;
}

// The q-quantile of N under weights w, capped to the pool.
function quantileN(w, q, size) {
  const {N, order} = cuts(size);
  let t = 0;
  for (const i of order) {
    t += w[i];
    if (t >= q) return N[i];
  }
  return N[order[order.length - 1]];
}

// The expected spread of log N after an answer at a probe: the weighted
// variance under each outcome, weighted by its chance.
function expectedSpread(w, p, LOGN) {
  let pr = 0, mr = 0, mw = 0;
  for (let i = 0; i < w.length; i++) {
    pr += w[i] * p[i];
    mr += w[i] * p[i] * LOGN[i];
    mw += w[i] * (1 - p[i]) * LOGN[i];
  }
  const pw = 1 - pr;
  mr /= pr; mw /= pw;
  let vr = 0, vw = 0;
  for (let i = 0; i < w.length; i++) {
    vr += w[i] * p[i] * (LOGN[i] - mr) ** 2;
    vw += w[i] * (1 - p[i]) * (LOGN[i] - mw) ** 2;
  }
  return vr + vw;                          // = pr * Var_r + pw * Var_w
}

// The rank to ask next: of PROBES ranks across the pool, the one whose
// answer leaves the least expected spread of N.
function bestRank(w, size) {
  let best = 1, least = Infinity;
  const {logN} = cuts(size);
  for (const {r, p} of probes(size)) {
    const e = expectedSpread(w, p, logN);
    if (e < least) { least = e; best = r; }
  }
  return best;
}

const addAnswer = (lw, wrank, ok) => Float64Array.from(lw, (x, i) => {
  const p = pRight(GRID[i], wrank);
  return x + Math.log(ok ? p : 1 - p);
});

const estimate = (lw, size) => {
  const w = weights(lw);
  return {w, lower: quantileN(w, LOWER, size), mid: quantileN(w, 0.5, size)};
};

// The next question of a check, or null when it's done: an unasked character
// in the band round the best rank.
function next(c, rng) {
  const n = c.asked.length;
  if (n >= MAX_QUESTIONS) return null;
  const size = c.pool.length;
  const {w, lower, mid} = estimate(c.lw, size);
  if (n >= MIN_QUESTIONS && (mid + 1) / (lower + 1) <= SETTLED) return null;
  const at = bestRank(w, size);
  const asked = new Set(c.asked.map(x => x.id));
  for (let widen = 1; widen <= 64; widen *= 2) {
    const from = Math.max(1, Math.min(Math.floor(at * (1 - BAND * widen)), at - MIN_BAND * widen));
    const to = Math.min(size, Math.max(Math.ceil(at * (1 + BAND * widen)), at + MIN_BAND * widen));
    const band = c.pool.slice(from - 1, to).filter(p => !asked.has(p.id));
    if (band.length) return rng.pick(band);
  }
  return null;
}

// startCheck(pool, rng) -> a check. `pool` is content.placementPool().
export function startCheck(pool, rng) {
  const c = {pool, asked: [], lw: new Float64Array(GRID.length), cur: null};
  return Object.freeze({...c, cur: next(c, rng)});
}

// resumeCheck(pool, asked, rng) -> a check rebuilt from the answers a left
// check had (Mark, after 7.13: leaving midway keeps them). Answers to
// characters no longer in the pool are dropped; ranks are the pool's now.
export function resumeCheck(pool, asked, rng) {
  const at = new Map(pool.map(p => [p.id, p]));
  const kept = asked.filter(a => at.has(a.id)).map(a => ({...a, wrank: at.get(a.id).wrank}));
  const lw = kept.reduce((w, a) => addAnswer(w, a.wrank, a.ok), new Float64Array(GRID.length));
  const c = {pool, asked: kept, lw, cur: null};
  return Object.freeze({...c, cur: next(c, rng)});
}

// question(check) -> {id, char, wrank, n (1-based), max} | null when the
// check is done.
export function question(c) {
  if (!c.cur) return null;
  const {id, char, wrank} = c.cur;
  return {id, char, wrank, n: c.asked.length + 1, max: MAX_QUESTIONS};
}

// answer(check, got, rng) -> the next check. `got` is {reading, meaning}
// (brief 7.13 decided 5): right only if both are, and anything else is a
// miss, as are a wrong answer and "I don't know". A bare boolean is both.
export function answer(c, got, rng) {
  if (!c.cur) throw new Error('answer: the check is done');
  const g = typeof got === 'object' && got !== null
    ? {reading: !!got.reading, meaning: !!got.reading && !!got.meaning}
    : {reading: !!got, meaning: !!got};
  const ok = g.reading && g.meaning;
  const d = {pool: c.pool, asked: [...c.asked, {id: c.cur.id, wrank: c.cur.wrank, ok, ...g}],
             lw: addAnswer(c.lw, c.cur.wrank, ok), cur: null};
  return Object.freeze({...d, cur: next(d, rng)});
}

export const done = c => !c.cur;

// result(check) -> {n, right, asked}: the n most written characters are
// known (the cutoff, on the pessimistic side; 0 when it is under one); `right`
// the ids answered right; `asked` how many characters were asked.
export function result(c) {
  const {lower} = estimate(c.lw, c.pool.length);
  return {n: Math.floor(lower), right: c.asked.filter(a => a.ok).map(a => a.id),
          asked: c.asked.length};
}

// The question's four readings (readingChoices, as a session's rung 2).
// Never a reading of this check's earlier characters, nor one that sounds
// like it (brief 7.13 decided 4: 6b drew the wrong choices from them, so a
// learner could rule them out); one wrong choice is another reading of the
// character's sound part where there is one; the rest are main readings
// near the character on the path.
export function choicesFor(content, c, rng) {
  const q = question(c);
  if (!q) return null;
  const earlier = c.asked.map(a => content.item(a.id).jp);
  return readingChoices(content, q.char, content.item(q.id).jp, rng, [], earlier,
                        {soundRival: true});
}

// The meaning question, asked after a right reading (decided 5): {answer,
// choices}, four English meanings, none of an earlier character's.
export function meaningChoicesFor(content, c, rng) {
  const q = question(c);
  if (!q) return null;
  return placementMeaningChoices(content, q.id, rng,
                                 c.asked.map(a => content.item(a.id).char));
}
