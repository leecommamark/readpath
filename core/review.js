// review.js — the placement check's review step (patch plan 7.13, Phase 4).
//
// Nothing is placed until the learner confirms (brief 7.13 decided 7). When
// the questions end, the check's result becomes a PENDING record; the review
// pages show part of what it would place, the learner untaps any they don't
// actually know, and Confirm places the rest. Decided 8:
//
//   the set       the top N by written rank, plus every character answered
//                 right (reading and meaning), less what is already known
//   the band      the rarest R of the top N, R = reviewBand(N) (placement.js)
//   hole-risk     curated/holerisk.tsv's characters inside the skipped
//                 range, most common first, at most RISK_CAP: always shown
//   beyond        characters answered right past N: always shown
//   skipped       the rest of the top N: placed on Confirm without review
//
// The pages show hole-risk, then the band from most to least common, then
// beyond (decided 9). The pending record keeps only what the learner did:
// the check's result, the untapped ids and the page. The set itself is
// worked out again from the states whenever it is shown, so on resume
// anything that became known meanwhile drops out (decided 10), and an untap
// of it with it.
//
// Pure: the content, the states and the day come in; nothing here reads the
// clock, the store or the screen. Every function returns a new object.

import {reviewBand} from './placement.js';
import {placedDue, transition, isKnown} from './state.js';

export const RISK_CAP = 20;                 // hole-risk tiles: about one page

// The pool ids a plan may place: main readings not yet known.
const placeable = (content, states) => id =>
  content.kind(id) === 'reading' && !isKnown(states[id]);

// reviewSet(content, states, {n, right}) -> {risk, band, beyond, skipped}: id
// lists, each in written-rank order (most common first), none known.
export function reviewSet(content, states, {n, right = []}) {
  const pool = content.placementPool();
  const ok = placeable(content, states);
  const top = pool.slice(0, Math.max(0, n));
  const R = reviewBand(top.length);
  const skipRange = top.slice(0, top.length - R);
  const risk = skipRange.filter(p => content.holeRiskOf(p.char) && ok(p.id))
    .slice(0, RISK_CAP).map(p => p.id);
  const riskSet = new Set(risk);
  const inTop = new Set(top.map(p => p.id));
  const rank = new Map(pool.map((p, i) => [p.id, i]));
  return {
    risk,
    band: top.slice(top.length - R).filter(p => ok(p.id)).map(p => p.id),
    beyond: [...new Set(right)].filter(id => !inTop.has(id) && ok(id))
      .sort((a, b) => (rank.get(a) ?? Infinity) - (rank.get(b) ?? Infinity)),
    skipped: skipRange.filter(p => ok(p.id) && !riskSet.has(p.id)).map(p => p.id),
  };
}

// The order the pages show the reviewed ids in (decided 9).
export const reviewed = set => [...set.risk, ...set.band, ...set.beyond];

// reviewPages(set, perPage) -> [[id]]: one screenful each; [] when nothing
// is to be reviewed.
export function reviewPages(set, perPage) {
  const ids = reviewed(set), size = Math.max(1, perPage), out = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

// startPending(result, today, last) -> the pending record of a finished
// check: {stage: 'review', day, n, asked, right, runs, unmarked, page}.
// `result` is placement.js's result(); `last` the previous placement record,
// for runs.
export function startPending({n, right, asked}, today, last = null) {
  return {stage: 'review', day: today, n, asked, right: [...right],
          runs: ((last && last.runs) || 0) + 1, unmarked: [], page: 0};
}

// questionsPending(check, today, last) -> the pending record of a check left
// during its questions (Mark, after 7.13): {stage: 'questions', day, runs,
// asked}, the answers so far, from which placement.js's resumeCheck goes on.
export function questionsPending(check, today, last = null) {
  return {stage: 'questions', day: today, runs: ((last && last.runs) || 0) + 1,
          asked: check.asked.map(({id, wrank, ok, reading, meaning}) => ({id, wrank, ok, reading, meaning}))};
}

// Which stage a pending record is at; one from before the stage was kept is
// at the review.
export const stageOf = pending => (pending ? pending.stage || 'review' : null);

// toggle(pending, id) -> a new pending record: an untapped id is tapped
// back, any other untapped.
export function toggle(pending, id) {
  const unmarked = pending.unmarked.includes(id)
    ? pending.unmarked.filter(x => x !== id) : [...pending.unmarked, id];
  return {...pending, unmarked};
}

export const toPage = (pending, page) => ({...pending, page});

// resume(content, states, pending, perPage) -> the pending record as it now
// stands: untaps of what is no longer in the set dropped, the page kept
// within the pages there now are.
export function resume(content, states, pending, perPage) {
  const set = reviewSet(content, states, pending);
  const shown = new Set(reviewed(set));
  const pages = reviewPages(set, perPage).length;
  return {...pending, unmarked: pending.unmarked.filter(id => shown.has(id)),
          page: Math.max(0, Math.min(pending.page, pages - 1))};
}

// summary(content, states, pending) -> {toMark, unmarked, skipped}: the last
// page's line, "N to mark known · M unmarked · S common characters marked
// without review".
export function summary(content, states, pending) {
  const set = reviewSet(content, states, pending);
  const shown = reviewed(set);
  const off = new Set(pending.unmarked);
  const unmarked = shown.filter(id => off.has(id)).length;
  return {toMark: shown.length - unmarked + set.skipped.length, unmarked,
          skipped: set.skipped.length};
}

// confirmReview(content, states, pending, today, perPage) -> {states,
// placed, before, record}: places the set less what was untapped. Each is
// provisional until its first review (state.js `placed`), which falls due
// soon for what the pages showed, nearest the cutoff first, and over about
// two months for what they skipped, the most common last (decided 11,
// state.js placedDue). `before` is what Undo needs: each
// placed id's state as it was (null where there was none). `record` is the
// new readpath.placement: the check's result, and per page how many tiles
// were shown and how many untapped (decided 14, the calibration).
export function confirmReview(content, states, pending, today, perPage) {
  const set = reviewSet(content, states, pending);
  const off = new Set(pending.unmarked);
  const wrank = id => content.wrankOf(content.item(id).char);
  const early = reviewed(set).filter(id => !off.has(id))
    .sort((a, b) => Math.abs(wrank(a) - pending.n) - Math.abs(wrank(b) - pending.n));
  const skipped = set.skipped.slice().sort((a, b) => wrank(b) - wrank(a));
  const due = placedDue(early, skipped, today);
  const ids = [...early, ...skipped];
  const out = {...states};
  const before = {};
  for (const id of ids) {
    before[id] = states[id] || null;
    out[id] = transition(states[id] || null, {type: 'placed', item: id, due: due.get(id)}, today);
  }
  const pages = reviewPages(set, perPage).map(p => ({shown: p.length,
                                                     unmarked: p.filter(id => off.has(id)).length}));
  return {states: out, placed: ids.length, before,
          record: {day: pending.day, n: pending.n, asked: pending.asked,
                   right: pending.right.length, confirmed: true, runs: pending.runs,
                   placed: ids.length, reviewed: reviewed(set).length,
                   skipped: set.skipped.length, pages}};
}

// undoConfirm(states, before) -> states: each id Confirm placed back to the
// state it had, or none. Only those ids: anything else changed since stays.
export function undoConfirm(states, before) {
  const out = {...states};
  for (const [id, s] of Object.entries(before)) {
    if (s) out[id] = s; else delete out[id];
  }
  return out;
}

// placementTally(states) -> {pass, miss}: how placed readings did at their
// first review (decided 12; state.js `placed`, so any Undo is counted right).
export function placementTally(states) {
  let pass = 0, miss = 0;
  for (const s of Object.values(states)) {
    if (s.placed === 'passed') pass++;
    else if (s.placed === 'missed') miss++;
  }
  return {pass, miss};
}

// Today's one note (decided 12, P2): placement may have been high, once
// HIGH_AFTER first reviews are in and more than HIGH_SHARE of them missed,
// once per placement (the record's `noted`).
export const HIGH_AFTER = 20, HIGH_SHARE = 0.3;
export function placementHigh(record, states) {
  if (!record || !record.confirmed || record.noted) return null;
  const {pass, miss} = placementTally(states);
  return pass + miss >= HIGH_AFTER && miss > HIGH_SHARE * (pass + miss) ? {pass, miss} : null;
}
