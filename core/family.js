// family.js — Path's families, and studying one (patch plan 7.5, Phases 4
// and 4b; brief 7.5 decided 5 and 6).
//
// familiesOf(content): the path's characters grouped by the sound part
// part_role names for them, as Path shows them (views/families.js draws
// them). A character with no sound part that others have as theirs heads
// that family and is its member (止); one with a sound part of its own (青,
// under 井) is a member of that family, and only the head of its own.
// Families of 2+ members get a card (674); the rest go into "Characters on
// their own" cards of 20, in path order (27). Every path character is in
// exactly one card.
//
// Family study is its own session, separate from Today (Mark, 2026-10-01):
//   * familyPlan() is what a card has left to learn: its sound part if it's
//     an item not yet unlocked, then its members' other part prerequisites
//     (their meaning parts), then the members not yet met, in path order,
//     and the secondary readings whose main reading is already known. A
//     secondary reading waits for its main reading to be known (DESIGN
//     *Unlocking*), so one isn't taught with its main reading.
//   * composeFamily() makes the tasks for what is available now: a part's
//     Meet and test, a character's Meet and its rung-2 quiz QUIZ_GAP later
//     (Today's chains, through Today's interleave()). A member waits for its
//     part to UNLOCK (met, and its test passed), so the session runs in
//     stages: after every part test it composes again, and a passed test
//     brings its members in (an inferred Meet, as Today's payoff). A part
//     whose test was missed isn't asked again this session, and the members
//     that need it wait.
//   * Nothing is stored for a family: what's learned goes into item_state
//     through transition(), its reviews fall due in Today, and the next
//     session starts from what is still unmet. Today is untouched, except
//     that what a family session met today doesn't count against its 10
//     (today.js, learner.familyToday).
//   * reviewLoad(): with every answer right, how many reviews the items add
//     over the next week -- the note on the family page.
//
// Pure and deterministic: no clock, no Math.random, no disk.

import {isKnown, transition, INTERVALS} from './state.js';
import {taskFor} from './tasks.js';
import {isAvailable, partUnlocked} from './unlock.js';
import {interleave, QUIZ_GAP} from './today.js';
import {soundId, readingId} from './content.js';
import {isMeet} from './session.js';

export const MIN_MEMBERS = 2;
export const OWN_SIZE = 20;

// familiesOf(content) -> {cards, chars, number, cardOf, byKey}
//   cards   [{key, type: 'family' | 'own', head?, i?, members}], members in
//           path order; keys are `f:<head>` and `o:<i>`
//   chars   the path's characters (their main readings' order)
//   number  char -> its place among them, from 1
//   cardOf  char -> the key of its card
// Computed once per content (the result is kept).
const made = new WeakMap();
export function familiesOf(content) {
  if (made.has(content)) return made.get(content);
  const chars = [];
  for (const id of content.path) {
    const it = content.item(id);
    if (it.kind === 'reading' && content.mainReading(it.char) === id) chars.push(it.char);
  }
  const number = new Map(chars.map((c, i) => [c, i + 1]));
  const byPath = (a, b) => number.get(a) - number.get(b);
  const groups = new Map();
  for (const c of chars) {
    const s = content.soundPartOf(c);
    if (!s) continue;
    if (!groups.has(s)) groups.set(s, []);
    groups.get(s).push(c);
  }
  for (const c of chars) if (!content.soundPartOf(c) && groups.has(c)) groups.get(c).push(c);
  const cards = [], loose = [];
  for (const [head, members] of groups) {
    members.sort(byPath);
    if (members.length >= MIN_MEMBERS) cards.push({key: `f:${head}`, type: 'family', head, members});
    else loose.push(...members);
  }
  for (const c of chars) if (!content.soundPartOf(c) && !groups.has(c)) loose.push(c);
  loose.sort(byPath);
  for (let i = 0; i * OWN_SIZE < loose.length; i++) {
    cards.push({key: `o:${i}`, type: 'own', i, members: loose.slice(i * OWN_SIZE, (i + 1) * OWN_SIZE)});
  }
  const cardOf = new Map();
  for (const card of cards) for (const c of card.members) cardOf.set(c, card.key);
  const out = {cards, chars, number, cardOf, byKey: new Map(cards.map(c => [c.key, c]))};
  made.set(content, out);
  return out;
}

// ---- studying a family

// familyPlan(content, states, card) -> [item id]: what's left to learn, in
// the order the session takes it: parts first (the card's sound part, then
// the others in path order), then the readings in path order.
export function familyPlan(content, states, card) {
  const parts = new Set(), readings = [];
  const head = card.head && soundId(card.head);
  if (head && content.has(head) && !partUnlocked(states[head])) parts.add(head);
  for (const c of card.members) {
    const main = content.mainReading(c);
    if (!main) continue;
    if (!states[main]) {
      for (const q of content.prereqs(main)) {
        if (content.kind(q) !== 'reading' && !partUnlocked(states[q])) parts.add(q);
      }
      readings.push(main);
    } else if (isKnown(states[main])) {
      // secondary readings, once the main reading is known
      for (const r of content.readingsOf(c)) {
        const id = readingId(c, r.jp);
        if (!r.primary && r.item && content.has(id) && !states[id]) readings.push(id);
      }
    }
  }
  const rank = id => content.rank(id);
  const ps = [...parts].sort((a, b) => (a === head ? -1 : b === head ? 1 : rank(a) - rank(b)));
  return [...ps, ...readings.sort((a, b) => rank(a) - rank(b))];
}

// composeFamily(content, learner, today, rng, card, {tried, quizzes})
//   -> {tasks, summary}
//   tried    parts whose test this session already asked: not asked again
//   quizzes  readings met this session whose quiz is still to come
export function composeFamily(content, learner, today, rng, card, {tried = [], quizzes = []} = {}) {
  const states = learner.states || {};
  const plan = familyPlan(content, states, card);
  const skip = new Set(tried);
  const chains = [];
  for (const id of plan) {
    if (content.kind(id) === 'reading') {
      if (!isAvailable(content, states, id)) continue;      // its part isn't unlocked yet
      chains.push({tasks: [taskFor(content, states, id, {role: 'new', rng}),
                           taskFor(content, states, id, {role: 'quiz', planned: 2, rng})],
                   gaps: [0, QUIZ_GAP]});
    } else if (!skip.has(id)) {
      chains.push(states[id]
        // met before and not unlocked: its test, now
        ? {tasks: [taskFor(content, states, id, {role: 'test', rng})], gaps: [0]}
        : {tasks: [taskFor(content, states, id, {role: 'new', rng}),
                   taskFor(content, states, id, {role: 'test', planned: 2, rng})],
           gaps: [0, QUIZ_GAP]});
    }
  }
  const pending = quizzes.filter(id => states[id] && !isKnown(states[id]))
    .map(id => taskFor(content, states, id, {role: 'quiz', rng}));
  const tasks = interleave(pending, chains);
  return {tasks, summary: {key: card.key, to_learn: plan.length, tasks: tasks.length,
                           new: chains.filter(c => c.tasks[0].role === 'new').length}};
}

// openFamily(content, learner, today, rng, card) -> a family session
export function openFamily(content, learner, today, rng, card) {
  const composed = composeFamily(content, learner, today, rng, card);
  return {today, rng, card, composed, queue: composed.tasks.slice(), answered: 0, passed: 0,
          recomposed: 0, tried: [], quizzes: [], metHere: []};
}

// answerFamily(content, learner, fs, ok) -> {task, state, recomposed}
//   As core/session.js's answer(): atomic, a Meet is met whatever `ok` is.
//   A part's test composes the session again (its members come in if it
//   passed; it isn't asked again either way).
export function answerFamily(content, learner, fs, ok) {
  const task = fs.queue[0];
  if (!task) throw new Error('answerFamily: the session is over');
  const before = learner.states[task.item] || null;
  const meet = isMeet(task);
  const state = transition(before, meet ? {type: 'meet', item: task.item}
                                        : {type: ok ? 'pass' : 'miss'}, fs.today);
  fs.queue.shift();
  learner.states[task.item] = state;
  fs.answered++;
  if (!meet && ok) fs.passed++;
  if (meet) {
    fs.metHere.push(task.item);
    if (content.kind(task.item) === 'reading') fs.quizzes.push(task.item);
  } else if (task.role === 'quiz') {
    fs.quizzes = fs.quizzes.filter(id => id !== task.item);
  }
  let recomposed = null;
  if (task.role === 'test') {
    fs.tried.push(task.item);
    // what's still to come: the quizzes queued, and whatever is now available
    const queued = new Set(fs.queue.filter(t => t.role === 'quiz').map(t => t.item));
    recomposed = composeFamily(content, learner, fs.today, fs.rng, fs.card,
                               {tried: fs.tried, quizzes: fs.quizzes.filter(id => queued.has(id))});
    fs.queue = recomposed.tasks.slice();
    fs.recomposed++;
  }
  return {task, state, recomposed};
}

// reviewLoad(n, days) -> about how many reviews n items learned today add
// over the next `days` days, with every answer right: after the session's
// quiz, a pass sets the item 1, then 3, then 7 days on (INTERVALS), so in a
// week each falls due on days 1 and 4.
export function reviewLoad(n, days = 7) {
  let per = 0;
  for (let d = 0, i = 0; i < INTERVALS.length && (d += INTERVALS[i]) <= days; i++) per++;
  return n * per;
}
