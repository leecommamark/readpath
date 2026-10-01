// today.js — the Today composer (plan 3, Phase 5).
//
// compose(content, learner, today, rng) -> {tasks, summary}
//
//   learner = {states: {item: state}, texts: [{id, title, tokens, focus}],
//              settings: {new_per_day, session_cap, backlog},
//              familyToday: [item]: met today by family study, which doesn't
//              count against the day's new items (patch plan 7.5)}
//
// In this order (DESIGN *Today composer*, and plan 3's decisions):
//  1. Due reviews: every state due today or earlier, most overdue first, then
//     by path rank.
//  2. New items, unless more than `backlog` (100) reviews are due: up to
//     `new_per_day` (10), less the items already met today. With a focus
//     text that isn't done, its available items come first, and the path
//     fills any slots left (Mark, 2026-09-28). Available means unmet with
//     every prerequisite met (unlock.js).
//     * A new character: Meet, then a rung-2 quiz at least QUIZ_GAP tasks
//       later.
//     * A new part: Meet, then its test task QUIZ_GAP later, then straight
//       away the payoff: an inferred Meet of its next unmet member (a
//       focus-text member first), which counts as one of the N, then that
//       member's quiz. The member must be available apart from this part.
//  3. Interleave: each new group's first task spread evenly through the
//     reviews, its later tasks as soon as their gap allows, never two tasks
//     for one item side by side unless nothing else is left.
//  4. Cap at `session_cap` (100). New groups go from the end first, a part's
//     payoff before the part; reviews are cut only when they alone exceed it.
//  5. The summary the Today screen shows.
//
// A session can be recomposed. Meeting an item writes its state (rung 2, due
// today), so a planned quiz or test comes back as a due review, and an item
// met today is never new again. The UI recomposes after a missed part test,
// which drops the payoff: the member is not unlocked yet.
//
// Deterministic: the same content, learner, day and seed give the same
// output. The rng draws only the words and targets inside tasks.

import {taskFor} from './tasks.js';
import {sentenceIndex} from './sentences.js';
import {isAvailable} from './unlock.js';
import {focusNeeds} from './focus.js';

export const QUIZ_GAP = 5;
export const SECONDS_PER_TASK = 7;         // DESIGN: 100 tasks ≈ 12 minutes
export const DEFAULTS = Object.freeze({new_per_day: 10, session_cap: 100, backlog: 100});

// ---- 1. reviews

// A state whose item the content no longer has (a reading a later ruling or
// source swap dropped) is skipped, never an error, and kept: it comes back
// if the item does (patch plan 6.5, CO-079, Mark 2026-09-29).
export function dueReviews(content, states, today) {
  return Object.values(states)
    .filter(s => s.due <= today && content.has(s.item))
    .sort((a, b) => a.due - b.due || content.rank(a.item) - content.rank(b.item))
    .map(s => s.item);
}

// ---- 2. new items

export function focusText(learner) {
  return (learner.texts || []).find(t => t.focus) || null;
}

// The units of new work, in the order chosen. A unit is one new item:
// {item, kind: 'char' | 'part' | 'payoff', of (payoff: its part), source}.
function chooseNew(content, states, slots, focusItems) {
  const units = [], chosen = new Set();
  const focusSet = new Set(focusItems);
  const take = (id, source) => {
    if (units.length >= slots || chosen.has(id) || !isAvailable(content, states, id)) return;
    chosen.add(id);
    if (content.kind(id) === 'reading') {
      units.push({item: id, kind: 'char', source});
      return;
    }
    units.push({item: id, kind: 'part', source});
    if (units.length >= slots) return;
    const members = content.membersOf(id).filter(m => !chosen.has(m)
      && isAvailable(content, states, m, [id]));
    const m = members.find(x => focusSet.has(x)) || members[0];
    if (!m) return;
    chosen.add(m);
    units.push({item: m, kind: 'payoff', of: id, source: focusSet.has(m) ? 'focus' : 'path'});
  };
  for (const id of focusItems) take(id, 'focus');
  for (const id of content.path) {
    if (units.length >= slots) break;
    take(id, 'path');
  }
  return units;
}

// ---- 4. the cap, on units before they become tasks

const UNIT_SIZE = 2;                       // every unit is two tasks

function capUnits(units, budget) {
  const kept = units.slice();
  while (kept.length && kept.length * UNIT_SIZE > budget) {
    const last = kept.pop();
    // a part's payoff can't outlive the part
    if (last.kind === 'part') {
      const i = kept.findIndex(u => u.kind === 'payoff' && u.of === last.item);
      if (i >= 0) kept.splice(i, 1);
    }
  }
  return kept;
}

// ---- 3. interleave

// chains: [{tasks, gaps}] where gaps[i] is the least distance from task i-1
// to task i; a gap of 1 means straight after (the payoff Meet after its
// part's test). Leads are spread over the reviews less a tail as long as the
// longest chain, so the last lead's follow-ups still have room for their gaps.
// Exported for family study (core/family.js; patch plan 7.5), unchanged.
export function interleave(reviews, chains) {
  const R = reviews.length, G = chains.length, out = [];
  const tail = Math.max(0, ...chains.map(c => c.gaps.reduce((a, b) => a + b, 0)));
  const spread = Math.max(0, R - tail);
  const leadAfter = chains.map((_, i) => Math.floor(i * spread / G));
  const pending = [];                      // {task, notBefore, chain, idx, seq}
  let ri = 0, gi = 0, seq = 0;
  const last = () => (out.length ? out[out.length - 1].item : null);
  const release = (chain, idx, pos) => {
    if (idx >= chain.tasks.length) return;
    if (chain.gaps[idx] === 1) {           // straight after
      out.push(chain.tasks[idx]);
      release(chain, idx + 1, out.length - 1);
      return;
    }
    pending.push({task: chain.tasks[idx], notBefore: pos + chain.gaps[idx],
                  chain, idx, seq: seq++});
  };
  const emitPending = k => {
    const [x] = pending.splice(k, 1);
    out.push(x.task);
    release(x.chain, x.idx + 1, out.length - 1);
  };
  while (ri < R || gi < G || pending.length) {
    const p = out.length;
    pending.sort((a, b) => a.notBefore - b.notBefore || a.seq - b.seq);
    let k = pending.findIndex(x => x.notBefore <= p && x.task.item !== last());
    if (k >= 0) { emitPending(k); continue; }
    if (gi < G && (leadAfter[gi] <= ri || ri >= R)) {
      const chain = chains[gi++];
      out.push(chain.tasks[0]);
      release(chain, 1, out.length - 1);
      continue;
    }
    if (ri < R) { out.push(reviews[ri++]); continue; }
    // only follow-ups whose gap can't be met are left: take the earliest,
    // keeping items apart where there is any choice
    k = pending.findIndex(x => x.task.item !== last());
    emitPending(k >= 0 ? k : 0);
  }
  return out;
}

// ---- the composer

export function compose(content, learner, today, rng) {
  const settings = {...DEFAULTS, ...(learner.settings || {})};
  const states = learner.states || {};

  const reviewIds = dueReviews(content, states, today);
  const backlogRule = reviewIds.length > settings.backlog;

  const text = focusText(learner);
  const focus = text ? focusNeeds(content, states, text.tokens || []) : null;
  const focusItems = focus && !focus.done ? focus.items : [];

  // what a family session met today doesn't use Today's new items (patch
  // plan 7.5, Mark's decided 3): its ids are in learner.familyToday, from
  // today's log
  const family = new Set(learner.familyToday || []);
  const metToday = Object.values(states)
    .filter(s => s.met === today && s.source === 'learned' && !family.has(s.item)).length;
  const slots = backlogRule ? 0 : Math.max(0, settings.new_per_day - metToday);
  const chosen = chooseNew(content, states, slots, focusItems);

  const cappedReviews = reviewIds.slice(0, settings.session_cap);
  const units = capUnits(chosen, settings.session_cap - cappedReviews.length);

  // rung 5's sentences, from the focus text's lines (patch plan 5)
  const sentences = sentenceIndex(content, states, text);
  // tasks, built in a fixed order so the rng's draws are too
  const reviews = cappedReviews.map(id => taskFor(content, states, id, {role: 'review', rng, sentences}));
  const payoffOf = new Map(units.filter(u => u.kind === 'payoff').map(u => [u.of, u]));
  const chains = [];
  for (const u of units) {
    if (u.kind === 'char') {
      chains.push({
        tasks: [taskFor(content, states, u.item, {role: 'new', rng, sentences}),
                taskFor(content, states, u.item, {role: 'quiz', planned: 2, rng, sentences})],
        gaps: [0, QUIZ_GAP]});
    } else if (u.kind === 'part') {
      const pay = payoffOf.get(u.item);
      const tasks = [taskFor(content, states, u.item, {role: 'new', rng}),
                     taskFor(content, states, u.item, {role: 'test', planned: 2, rng,
                                                       exclude: pay ? pay.item : null})];
      const gaps = [0, QUIZ_GAP];
      if (pay) {
        tasks.push(taskFor(content, states, pay.item, {role: 'payoff', assume: [u.item], rng, sentences}),
                   taskFor(content, states, pay.item, {role: 'quiz', planned: 2, rng, sentences}));
        gaps.push(1, QUIZ_GAP);
      }
      chains.push({tasks, gaps});
    }
  }
  const tasks = interleave(reviews, chains);

  const count = kind => units.filter(u => kind(u)).length;
  const summary = {
    reviews: reviewIds.length,
    reviews_shown: reviews.length,
    new: {
      characters: count(u => u.kind !== 'part'),
      parts: count(u => u.kind === 'part'),
      from_focus: count(u => u.source === 'focus'),
      from_path: count(u => u.source === 'path'),
    },
    tasks: tasks.length,
    est_minutes: Math.ceil(tasks.length * SECONDS_PER_TASK / 60),
    next_up: units.length ? units[0].item : null,
    backlog_rule: backlogRule,
    dropped_new: chosen.length - units.length,
    focus: text ? {id: text.id, title: text.title, readings: focus.readings.length,
                   known: focus.known, done: focus.done} : null,
  };
  return {tasks, summary};
}
