// session.js — running one day's session (patch plan 4, Phase 2).
//
// The loop simulate.js ran (plan 3), lifted out so the app and the simulator
// run the same code, which is what lets a headless test say the app's next
// composition matches the simulator's (brief 4, pass conditions):
//
//   const s = openSession(content, learner, today, rng);   // compose Today
//   while (current(s)) answer(content, learner, s, ok);    // one task each
//
// A Meet is met whatever `ok` says (a Meet is not a test, DESIGN); anything
// else passes or misses. After a missed part test the session is recomposed
// with the same rng, which drops the part's payoff (DESIGN *Today composer*
// 6). Every state change goes through state.js's transition(), and the new
// state is written into `learner.states` and returned, so the caller can
// save exactly the item that changed.

import {compose} from './today.js';
import {transition} from './state.js';

const MEETS = new Set(['meet', 'part_meet']);
export const isMeet = task => MEETS.has(task.task);

// openSession(content, learner, today, rng, {asOf}) -> session
//   learner: {states, texts, settings}; `states` is written by answer()
//   rng:     seeded; compose draws from it, and so does a recomposition
//   asOf:    compose as if it were this day (Keep going, step 4 6b: the next
//            day with anything due, so its reviews are done early and it has
//            its own 10 new); answers are still recorded on `today`
export function openSession(content, learner, today, rng, {asOf = today} = {}) {
  const composed = compose(content, learner, asOf, rng);
  return {today, asOf, rng, composed, summary: composed.summary,
          queue: composed.tasks.slice(), answered: 0, passed: 0, recomposed: 0};
}

// The day Keep going composes as: the soonest day after `today` with a
// review due, or tomorrow when nothing is.
export function nextDueDay(states, today, content = null) {
  let next = Infinity;
  for (const s of Object.values(states)) {
    if (content && !content.has(s.item)) continue;   // CO-079: not due, only kept
    if (s.due > today && s.due < next) next = s.due;
  }
  return Number.isFinite(next) ? next : today + 1;
}

// The task on screen, or null when the session is over.
export const current = session => session.queue[0] || null;

// answer(content, learner, session, ok) -> {task, state, recomposed}
//   Takes the current task off the queue and applies the answer. `recomposed`
//   is the new composition when a missed test recomposed the session, else
//   null. Atomic: the transition is worked out before the task leaves the
//   queue, so an answer transition() refuses changes nothing (patch plan
//   7.5, bug 1: a refused Meet used to leave the queue, and the next tap
//   answered the task after it, unseen).
export function answer(content, learner, session, ok) {
  const task = current(session);
  if (!task) throw new Error('answer: the session is over');
  const {today} = session;
  const before = learner.states[task.item] || null;
  const meet = isMeet(task);
  const state = transition(before, meet ? {type: 'meet', item: task.item}
                                        : {type: ok ? 'pass' : 'miss'}, today);
  session.queue.shift();
  learner.states[task.item] = state;
  session.answered++;
  if (!meet && ok) session.passed++;
  let recomposed = null;
  if (!meet && !ok && task.role === 'test') {
    recomposed = compose(content, learner, session.asOf ?? today, session.rng);
    session.queue = recomposed.tasks.slice();
    session.recomposed++;
  }
  return {task, state, recomposed};
}
