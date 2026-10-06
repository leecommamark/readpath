// actions.js — the reference card's two actions (patch plan 4, Phase 5).
//
// Mark known and I forgot this, through state.js's transition() like every
// other change (DESIGN *State changes outside the ladder*): Mark known puts a
// character reading straight into Maintain at step 4, due in 30 days; I
// forgot this drops it to rung 2, due now. Both are for character readings
// only; state.js refuses them for a part, which is learned only through its
// own tasks. They write into `learner.states`, the run's while a session is
// on, so the session sees them at once.

import {transition, isKnown, INTERVALS, PLACED_STEP, placedDue} from './core/state.js';

export const canMarkKnown = (content, states, id) =>
  !!id && content.kind(id) === 'reading' && !isKnown(states[id]);
// I forgot this is for a known character only (Mark, 2026-09-29): before
// that, the ladder already handles a miss.
export const canForget = (content, states, id) =>
  !!id && content.kind(id) === 'reading' && isKnown(states[id]);

export function markKnown(learner, id, today) {
  const s = transition(learner.states[id] || null,
                       {type: 'mark_known', item: id, due: today + INTERVALS[PLACED_STEP]}, today);
  learner.states[id] = s;
  return s;
}

export function forgot(learner, id, today) {
  const s = transition(learner.states[id], {type: 'forgot'}, today);
  learner.states[id] = s;
  return s;
}

// The Reader's Mark mode (patch plan 5, Phase 5): a tap marks a character
// reading known, or, if it is known, says "I forgot this" (Mark,
// 2026-09-29: I forgot this only for a known reading). Returns what Undo
// needs: {id, before, after, did: 'known' | 'forgot'}.
export function markInReader(content, learner, id, today) {
  const before = learner.states[id] || null;
  if (canForget(content, learner.states, id)) {
    return {id, before, after: forgot(learner, id, today), did: 'forgot'};
  }
  if (canMarkKnown(content, learner.states, id)) {
    return {id, before, after: markKnown(learner, id, today), did: 'known'};
  }
  return null;
}

// Undo puts back exactly the state there was, one transition() made, or
// none: nothing is built here.
export function undoMark(learner, {id, before}) {
  if (before) learner.states[id] = before;
  else delete learner.states[id];
}

// ---- characters off the path (patch plan 6, Phase 2; brief 6 decided 7)
//
// "I know this" for a character with no reading item: never taught, quizzed,
// scheduled or counted in "N% readable". It isn't an item, so it never
// becomes an item_state: the learner's `readpath.offKnown` is a plain sorted
// list of characters, and all it does is hide the character's jyutping in
// the Reader and leave it out of "Not taught yet". Offered only for an
// off-path character with a jyutping (Mark, Phase 0 decided 9): one with
// none has nothing to hide. Each returns the new list and what Undo needs.

export const canKnowOff = (content, ch) => !!content.offchar && !!content.offchar(ch);

const withOff = (list, ch, on) => {
  const set = new Set(list);
  if (on) set.add(ch); else set.delete(ch);
  return [...set].sort();
};
export function knowOff(list, ch) {
  return {list: withOff(list, ch, true), char: ch, before: list.includes(ch)};
}
export function unknowOff(list, ch) {
  return {list: withOff(list, ch, false), char: ch, before: list.includes(ch)};
}
// carryOffKnown(content, states, list, today) -> {states, carried}: the
// path grew (brief 7.17, P2, Mark 2026-10-06), so a character a learner
// marked "I know this" while it was off the path may be on it now. Each
// such character with no state yet becomes a known state, provisional with
// an early first review, as a placed character is (7.13: state.js
// `placed`, placedDue's early window). One with a state already keeps it,
// and the list itself is left alone (on the path it no longer reads it).
// Safe to run at every start: a carried character has a state the next
// time. `carried` is the reading ids placed, in the list's order.
export function carryOffKnown(content, states, list, today) {
  const carried = list.map(ch => content.mainReading(ch))
    .filter(id => id && !states[id]);
  if (!carried.length) return {states, carried};
  const due = placedDue(carried, [], today);
  const out = {...states};
  for (const id of carried) {
    out[id] = transition(null, {type: 'placed', item: id, due: due.get(id)}, today);
  }
  return {states: out, carried};
}

// Undo: the character back in the list exactly if it was there before.
export function undoOff(list, {char, before}) {
  return withOff(list, char, before);
}
