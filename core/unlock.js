// unlock.js — is an item available to learn? (plan 3, Phase 3)
//
// An item is available when it has never been met and every prerequisite on
// the path is met:
//   * a part prerequisite once that part has UNLOCKED: met, and passed its
//     test task once (decision 1; Mark, 2026-09-28). The unlock is sticky
//     (state.js keeps `unlocked` through a lapse), so a lapse never locks a
//     part's characters again.
//   * a main-reading prerequisite (a secondary reading's) once that main
//     reading is in Maintain. A lapse holds back a secondary that hasn't been
//     met; one already met carries on, because availability is only asked of
//     new items.
// The prerequisites are the path's, and nothing else: content.js has them.
//
// `assume` names parts to treat as unlocked. The composer passes the part it
// is meeting this session, to plan the part's payoff Meet (the member is
// "available apart from this part"); the Meet itself happens only after the
// part's test is passed, and recomposing drops it if the test was missed.

import {isKnown} from './state.js';

export const partUnlocked = s => !!s && s.unlocked !== null && s.unlocked !== undefined;

export function prereqMet(content, states, q, assume = []) {
  if (content.kind(q) === 'reading') return isKnown(states[q]);
  return assume.includes(q) || partUnlocked(states[q]);
}

// The prerequisites not met yet, in path order.
export function unmetPrereqs(content, states, id, assume = []) {
  return content.prereqs(id).filter(q => !prereqMet(content, states, q, assume));
}

export function isAvailable(content, states, id, assume = []) {
  return !states[id] && unmetPrereqs(content, states, id, assume).length === 0;
}
