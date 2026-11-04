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
//     `new_per_day` (7; brief 7.31), less the items already met today. With a focus
//     text that isn't done, its available items come first, and the path
//     fills any slots left (Mark, 2026-09-28). Available means unmet with
//     every prerequisite met (unlock.js).
//     * A new character: Meet, then a rung-2 quiz at least QUIZ_GAP tasks
//       later.
//     * A new part: Meet, then its test task QUIZ_GAP later, then straight
//       away the payoff: an inferred Meet of its next unmet member (a
//       focus-text member first), which counts as one of the N, then that
//       member's quiz. The member must be available apart from this part.
//     * A taught Meet (not inferred, not a secondary reading's) and a
//       part's Meet are followed straight away by a check (brief 7.30): an
//       unscored tap that is never recorded (withChecks()).
//  3. Interleave: each new group's first task spread evenly through the
//     reviews, its later tasks as soon as their gap allows, never two tasks
//     for one item side by side unless nothing else is left (a Meet and its
//     check excepted). Never more than MEET_RUN (2) Meets in a row (brief
//     7.30, Mark's decided 1): a check neither ends a run nor adds to one,
//     and after two the next slot is a review, a follow-up whose gap is met,
//     one at least MIN_GAP after its Meet, and only then a third Meet.
//  4. Cap at `session_cap` (100) counted tasks; checks aren't counted. New
//     groups go from the end first, a part's payoff before the part;
//     reviews are cut only when they alone exceed it.
//  5. The summary the Today screen shows: its tasks are the counted ones,
//     and the minutes count a check at SECONDS_PER_CHECK.
//
// A session can be recomposed. Meeting an item writes its state (rung 2, due
// today), so a planned quiz or test comes back as a due review, and an item
// met today is never new again. The UI recomposes after a missed part test,
// which drops the payoff: the member is not unlocked yet.
//
// Deterministic: the same content, learner, day and seed give the same
// output. The rng draws only the words and targets inside tasks; a check
// draws nothing here (its tiles are the card's, choices.js checkChoices).

import {taskFor, checkFor, isCheck} from './tasks.js';
import {sentenceIndex} from './sentences.js';
import {isAvailable} from './unlock.js';
import {focusNeeds} from './focus.js';

export const QUIZ_GAP = 5;
export const SECONDS_PER_TASK = 7;         // DESIGN: 100 tasks ≈ 12 minutes
export const SECONDS_PER_CHECK = 2;        // brief 7.30 C6
export const MEET_RUN = 2;                 // the most Meets in a row (7.30)
export const MIN_GAP = 2;                  // the least a quiz comes after its Meet, to break a run
export const DEFAULTS = Object.freeze({new_per_day: 7, session_cap: 100, backlog: 100});

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

const UNIT_SIZE = 2;                       // every unit is two counted tasks

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

// ---- the checks (brief 7.30)

const isMeetTask = t => t.task === 'meet' || t.task === 'part_meet';

// A Meet that teaches something new to look at gets a check: a part's Meet,
// and a character's Meet that is neither inferred (the guess was the task)
// nor a secondary reading's (the glyph is already known).
export const needsCheck = t => t.task === 'part_meet'
  || (t.task === 'meet' && !t.inferred_from && !t.pattern);

// withChecks(content, states, chain) -> the chain with a check straight
// after each Meet that needs one; the next task's gap is still counted from
// the Meet. A part's check shows one of its members (checkMember).
export function withChecks(content, states, chain) {
  const tasks = [], gaps = [];
  const payoff = chain.tasks.find(t => t.role === 'payoff');
  let shrink = false;
  chain.tasks.forEach((t, i) => {
    tasks.push(t);
    gaps.push(shrink && chain.gaps[i] > 1 ? chain.gaps[i] - 1 : chain.gaps[i]);
    shrink = false;
    if (!needsCheck(t)) return;
    const target = t.task === 'part_meet'
      ? checkMember(content, states, t.item, payoff ? payoff.item : null) : null;
    if (t.task === 'part_meet' && !target) return;
    tasks.push(checkFor(t, target));
    gaps.push(1);
    shrink = true;
  });
  return {tasks, gaps};
}

// The member a part's check shows (Mark, 7.30 C2): the nearest member on the
// path that isn't the payoff, met or not, one already met first for a
// meaning part (you know 你: find its 亻); the payoff only where it is the
// only member (the check shows no reading, so the payoff's guess is
// untouched); null for a part with no member.
export function checkMember(content, states, id, payoff = null) {
  const r = content.rank(id);
  const near = (a, b) => Math.abs(content.rank(a) - r) - Math.abs(content.rank(b) - r)
    || content.rank(a) - content.rank(b);
  const ms = content.membersOf(id).slice().sort(near);
  const rest = ms.filter(m => m !== payoff);
  const met = content.kind(id) === 'meaning' ? rest.filter(m => states[m]) : [];
  return met[0] || rest[0] || ms[0] || null;
}

// ---- 3. interleave

// chains: [{tasks, gaps}] where gaps[i] is the least distance from task i-1
// to task i; a gap of 1 means straight after (the payoff Meet after its
// part's test, a check after its Meet). Leads are spread over the reviews
// less a tail as long as the longest chain, so the last lead's follow-ups
// still have room for their gaps. Exported for family study
// (core/family.js; patch plan 7.5).
// The Meet cap (brief 7.30): with MEET_RUN Meets in a row (checks don't
// count either way) and a lead due, a review comes first, then a follow-up
// whose gap is met, then one MIN_GAP or more after its chain's last task
// that isn't a check; only then the lead. Where reviews already sit
// between the Meets, nothing changes.
export function interleave(reviews, chains) {
  const R = reviews.length, G = chains.length, out = [];
  const tail = Math.max(0, ...chains.map(c => c.gaps.reduce((a, b) => a + b, 0)));
  const spread = Math.max(0, R - tail);
  const leadAfter = chains.map((_, i) => Math.floor(i * spread / G));
  const pending = [];                      // {task, notBefore, anchor, chain, idx, seq}
  let ri = 0, gi = 0, seq = 0, run = 0;
  const last = () => (out.length ? out[out.length - 1].item : null);
  const push = t => {
    out.push(t);
    if (isMeetTask(t)) run++;
    else if (!isCheck(t)) run = 0;
  };
  // anchor: where the chain's last task that isn't a check went
  const release = (chain, idx, pos, anchor) => {
    if (idx >= chain.tasks.length) return;
    if (chain.gaps[idx] === 1) {           // straight after
      const t = chain.tasks[idx];
      push(t);
      release(chain, idx + 1, out.length - 1, isCheck(t) ? anchor : out.length - 1);
      return;
    }
    pending.push({task: chain.tasks[idx], notBefore: pos + chain.gaps[idx], anchor,
                  chain, idx, seq: seq++});
  };
  const emitPending = k => {
    const [x] = pending.splice(k, 1);
    push(x.task);
    release(x.chain, x.idx + 1, out.length - 1, out.length - 1);
  };
  while (ri < R || gi < G || pending.length) {
    const p = out.length;
    pending.sort((a, b) => a.notBefore - b.notBefore || a.seq - b.seq);
    let k = pending.findIndex(x => x.notBefore <= p && x.task.item !== last());
    if (k >= 0) { emitPending(k); continue; }
    const leadDue = gi < G && (leadAfter[gi] <= ri || ri >= R);
    if (leadDue && run >= MEET_RUN) {
      if (ri < R) { push(reviews[ri++]); continue; }
      k = pending.findIndex(x => p - x.anchor >= MIN_GAP && x.task.item !== last());
      if (k >= 0) { emitPending(k); continue; }
    }
    if (leadDue) {
      const chain = chains[gi++];
      push(chain.tasks[0]);
      release(chain, 1, out.length - 1, out.length - 1);
      continue;
    }
    if (ri < R) { push(reviews[ri++]); continue; }
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
  // the focus text's title on a Meet it chose (brief 7.28 P17)
  const focusOf = u => (u.source === 'focus' && text ? text.title || null : null);
  const payoffOf = new Map(units.filter(u => u.kind === 'payoff').map(u => [u.of, u]));
  const chains = [];
  for (const u of units) {
    if (u.kind === 'char') {
      chains.push({
        tasks: [taskFor(content, states, u.item, {role: 'new', rng, sentences, focus: focusOf(u)}),
                taskFor(content, states, u.item, {role: 'quiz', planned: 2, rng, sentences})],
        gaps: [0, QUIZ_GAP]});
    } else if (u.kind === 'part') {
      const pay = payoffOf.get(u.item);
      const tasks = [taskFor(content, states, u.item, {role: 'new', rng}),
                     taskFor(content, states, u.item, {role: 'test', planned: 2, rng,
                                                       exclude: pay ? pay.item : null})];
      const gaps = [0, QUIZ_GAP];
      if (pay) {
        tasks.push(taskFor(content, states, pay.item, {role: 'payoff', assume: [u.item], rng, sentences,
                                                       focus: focusOf(pay)}),
                   taskFor(content, states, pay.item, {role: 'quiz', planned: 2, rng, sentences}));
        gaps.push(1, QUIZ_GAP);
      }
      chains.push({tasks, gaps});
    }
  }
  const tasks = interleave(reviews, chains.map(c => withChecks(content, states, c)));
  const checks = tasks.filter(isCheck).length;

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
    tasks: tasks.length - checks,
    checks,
    est_minutes: estMinutes(tasks.length - checks, checks),
    next_up: units.length ? units[0].item : null,
    backlog_rule: backlogRule,
    dropped_new: chosen.length - units.length,
    focus: text ? {id: text.id, title: text.title, readings: focus.readings.length,
                   known: focus.known, done: focus.done} : null,
  };
  return {tasks, summary};
}

// minutes for `tasks` counted tasks and `checks` checks (brief 7.30 C6)
export const estMinutes = (tasks, checks = 0) =>
  Math.ceil((tasks * SECONDS_PER_TASK + checks * SECONDS_PER_CHECK) / 60);
