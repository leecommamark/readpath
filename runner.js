// runner.js — one session as the app runs it (patch plan 4, Phase 4).
//
// core/session.js is the loop; this adds the store. Every answer is saved
// the moment it is given (the whole `readpath.states` map, flushed on the
// next microtask), so killing the tab mid-session loses nothing: reopening
// composes again from what was saved, and met items aren't new again
// (DESIGN *Today composer* 6). No DOM, so a test drives it exactly as the
// session screen does.
//
// Two rngs, deliberately. The session's own (seed * 100003 + day, as
// simulate.js) is compose()'s, and a recomposition draws from it; the card
// choices draw from a second one, so showing choices never moves what a
// recomposition would give, and the app stays in step with the simulator.

import {KEYS} from './store.js';
import {openSession, current, answer, isMeet, nextDueDay} from './core/session.js';
import {taskFor} from './core/tasks.js';
import {sentenceIndex} from './core/sentences.js';
import {focusText} from './core/today.js';
import {makeRng} from './core/rng.js';
import {transition} from './core/state.js';
import {openFamily, answerFamily} from './core/family.js';

export const composeRng = (seed, day) => makeRng(seed * 100003 + day);
export const choiceRng = (seed, day) => makeRng((seed * 7919 + day * 31 + 1) >>> 0);

// The per-device seed, made once and kept in readpath.meta.
export function deviceSeed(store, random = Math.random) {
  const meta = store.load(KEYS.meta, {});
  if (!Number.isInteger(meta.seed)) {
    meta.seed = 1 + Math.floor(random() * 0x7ffffffe);
    store.save(KEYS.meta, meta);
  }
  return meta.seed;
}

// The learner as core/ reads it. `texts` is texts.js's learnerTexts():
// {id, title, tokens, focus} for each text whose tokens are held (the
// tokens are derived, never stored: patch plan 5).
// familyToday: what family study met today (today's log), which Today
// doesn't count against its new items (patch plan 7.5). A log from another
// day names items not met today, so compose() never counts them anyway.
export function learnerFrom(store, texts = []) {
  return {states: store.load(KEYS.states, {}), texts,
          settings: store.load(KEYS.settings, {}),
          familyToday: (store.load(KEYS.today, null) || {}).family || []};
}

// The toned readings a set of tasks asks about: what the reading choices
// draw their wrong answers from (choices.js; Mark, 2026-09-29).
export function readingsOf(content, tasks) {
  const out = new Set();
  for (const t of tasks) {
    for (const id of [t.item, t.target]) {
      if (typeof id === 'string' && id.startsWith('r:') && content.has(id)) out.add(content.item(id).jp);
    }
  }
  return [...out];
}

// startRun(content, store, today, {keepGoing, texts}) -> run
//   run.task      the task on screen, or null when the session is over
//   run.answer(ok) saves and moves on; returns {task, state, recomposed}
//   run.progress  {done, total}: total grows or shrinks when it recomposes
//   run.choices   the rng the cards draw their choices from
//   run.pool      the session's readings, for the reading choices
// keepGoing composes as of the next day anything is due (Mark, 2026-09-29:
// "Keep going" after All done): tomorrow's reviews early, then 10 new.
export function startRun(content, store, today, {keepGoing = false, texts = []} = {}) {
  const seed = deviceSeed(store);
  const learner = learnerFrom(store, texts);
  const asOf = keepGoing ? nextDueDay(learner.states, today, content) : today;
  const session = openSession(content, learner, today, composeRng(seed, asOf), {asOf});
  const tally = {right: 0, wrong: 0, met: 0};
  // what answer() changed, newest last, so undo() can put it back (Mark,
  // 2026-09-29: a back button that takes back the last answer)
  const history = [];
  const run = {
    learner, session, tally,
    choices: choiceRng(seed, today),
    // A Meet for an item already met is dropped: the reference card can mark
    // an item known mid-session, after its Meet was queued.
    get task() {
      let t = current(session);
      while (t && isMeet(t) && learner.states[t.item]) {
        session.queue.shift();
        t = current(session);
      }
      return t;
    },
    get summary() { return session.summary; },
    get pool() { return readingsOf(content, [...session.composed.tasks, ...session.queue]); },
    keepGoing, practice: false,
    get progress() {
      return {done: session.answered, total: session.answered + session.queue.length};
    },
    get canUndo() { return history.length > 0; },
    // `task` is the task the card showed: an answer for any other changes
    // nothing and returns null, so a card left on screen can never answer
    // the task after it (patch plan 7.5, bug 1). Nor does a Meet whose item
    // was met since its card was drawn (Mark known from the reference
    // card): it returns null, and `task` then drops it.
    answer(ok, {meet = false, task: shown = null} = {}) {
      const task = current(session);
      if (!task || (shown && shown !== task)) return null;
      if (isMeet(task) && learner.states[task.item]) return null;
      history.push({item: task.item, before: learner.states[task.item] || null,
                    queue: session.queue.slice(), answered: session.answered,
                    passed: session.passed, recomposed: session.recomposed,
                    tally: {...tally}, day: structuredClone(todayLog(store, today))});
      const r = answer(content, learner, session, ok);
      store.save(KEYS.states, learner.states);
      if (meet) tally.met++;
      else if (ok) tally.right++;
      else {
        tally.wrong++;
        noteToday(store, today, 'missed', task.item);
      }
      return r;
    },
    // Takes back the last answer: the item's state as it was, the queue as it
    // was (a recomposition undone with it), and the tallies. Saved at once.
    // Returns the task to ask again, or null when there is nothing to undo.
    undo() {
      const h = history.pop();
      if (!h) return null;
      if (h.before) learner.states[h.item] = h.before;
      else delete learner.states[h.item];
      session.queue = h.queue;
      Object.assign(session, {answered: h.answered, passed: h.passed, recomposed: h.recomposed});
      Object.assign(tally, h.tally);
      store.save(KEYS.states, learner.states);
      store.save(KEYS.today, h.day);
      return current(session);
    },
  };
  return run;
}

// Today's log: what was missed today (asked first in practice) and what was
// then passed in practice (dropped from it for the rest of the day). Reset
// on a new day.
export function todayLog(store, today) {
  const t = store.load(KEYS.today, null);
  return t && t.day === today ? {family: [], ...t} : {day: today, missed: [], practised: [], family: []};
}
function noteToday(store, today, list, item) {
  const t = todayLog(store, today);
  if (!t[list].includes(item)) t[list].push(item);
  store.save(KEYS.today, t);
}

// startPractice(content, store, today) -> a run over what was answered today,
// for practice only (Mark, 2026-09-29: "Practise again"): each item is asked
// at its current rung, and nothing is recorded -- no state changes, so the
// schedule is untouched. Today's misses come first, and an item passed in
// practice drops out of it for the rest of the day, so the list shrinks.
// Same shape as startRun, so the session screen runs either.
export function practiceItems(store, today) {
  const log = todayLog(store, today);
  const ids = Object.values(store.load(KEYS.states, {}))
    .filter(s => s.last === today && !log.practised.includes(s.item)).map(s => s.item);
  return ids;
}

export function startPractice(content, store, today, {texts = []} = {}) {
  const seed = deviceSeed(store);
  const learner = learnerFrom(store, texts);
  const sentences = sentenceIndex(content, learner.states, focusText(learner));
  const rng = makeRng((seed * 31 + today * 17 + 7) >>> 0);
  const log = todayLog(store, today);
  const ids = practiceItems(store, today).sort();
  const missed = rng.shuffle(ids.filter(id => log.missed.includes(id)));
  const rest = rng.shuffle(ids.filter(id => !log.missed.includes(id)));
  const queue = [...missed, ...rest].map(id => taskFor(content, learner.states, id,
                                                       {role: 'practice', rng, sentences}));
  const all = queue.slice();
  const tally = {right: 0, wrong: 0, met: 0};
  const history = [];
  let done = 0;
  return {
    learner, tally, practice: true, keepGoing: false,
    choices: choiceRng(seed + 1, today),
    get task() { return queue[0] || null; },
    get summary() { return {tasks: all.length}; },
    get pool() { return readingsOf(content, all); },
    get progress() { return {done, total: all.length}; },
    get canUndo() { return history.length > 0; },
    answer(ok, {task: shown = null} = {}) {
      if (!queue.length || (shown && shown !== queue[0])) return null;
      const task = queue.shift();
      history.push({task, ok, day: structuredClone(todayLog(store, today))});
      done++;
      if (ok) {
        tally.right++;
        noteToday(store, today, 'practised', task.item);
      } else tally.wrong++;
      return {task, state: learner.states[task.item] || null, recomposed: null};
    },
    undo() {
      const h = history.pop();
      if (!h) return null;
      queue.unshift(h.task);
      done--;
      if (h.ok) tally.right--; else tally.wrong--;
      store.save(KEYS.today, h.day);
      return h.task;
    },
  };
}

// ---- Test me (patch plan 6, Phase 5; brief 6 decided 8)
//
// A part's own test task (Predict or Tell apart) asked now, one task, and
// scored normally through transition(): there is no marking a part known by
// hand, since knowing characters doesn't mean knowing their parts. On a part
// not yet met (Mark, Phase 0 decided 3) a pass is its Meet and one test pass,
// so its characters unlock; a miss is its Meet alone. On a met part it's an
// ordinary test answer. It never recomposes Today and writes nothing to
// today's log. Same shape as startRun, so the session screen runs it.

const testRng = (seed, today) => makeRng((seed * 53 + today * 11 + 5) >>> 0);

// Test me is offered only for a part item whose test has something to ask.
export function canTestMe(content, states, id) {
  if (!content.has(id) || content.kind(id) === 'reading') return false;
  return !!taskFor(content, states, id, {planned: 2, role: 'testme'}).target;
}

export function startTestMe(content, store, today, id) {
  const seed = deviceSeed(store);
  const learner = learnerFrom(store);
  // every Test me draws afresh, and never asks what it asked last for this
  // part (patch plan 7A, 6b): `testme` in the device's meta counts the
  // attempts and keeps each part's last target
  const meta = store.load(KEYS.meta, {});
  const tm = meta.testme || {n: 0, last: {}};
  const rng = testRng(seed + tm.n * 7919, today);
  const task = taskFor(content, learner.states, id,
                       {planned: 2, role: 'testme', rng, exclude: tm.last[id] || null});
  store.save(KEYS.meta, {...meta, testme: {n: tm.n + 1, last: {...tm.last, [id]: task.target}}});
  const tally = {right: 0, wrong: 0, met: 0};
  let queue = [task], before, lastOk;
  return {
    learner, tally, practice: false, keepGoing: false, testMe: true,
    choices: choiceRng(seed + 2 + tm.n, today),
    get task() { return queue[0] || null; },
    get summary() { return {tasks: 1}; },
    get pool() { return readingsOf(content, [task]); },
    get progress() { return {done: 1 - queue.length, total: 1}; },
    get canUndo() { return queue.length === 0; },
    answer(ok, {task: shown = null} = {}) {
      if (!queue.length || (shown && shown !== queue[0])) return null;
      before = learner.states[id] || null;
      let s = before || transition(null, {type: 'meet', item: id}, today);
      if (before || ok) s = transition(s, {type: ok ? 'pass' : 'miss'}, today);
      learner.states[id] = s;
      store.save(KEYS.states, learner.states);
      queue = [];
      lastOk = ok;
      if (ok) tally.right++; else tally.wrong++;
      return {task, state: s, recomposed: null};
    },
    undo() {
      if (queue.length) return null;
      if (before) learner.states[id] = before;
      else delete learner.states[id];
      store.save(KEYS.states, learner.states);
      if (lastOk) tally.right--; else tally.wrong--;
      queue = [task];
      return task;
    },
  };
}

// ---- family study (patch plan 7.5, Phase 4b; brief 7.5 decided 6)
//
// core/family.js's session through the store: every answer saved as it is
// given, through transition(); each item met noted in today's log `family`,
// so Today doesn't count it against its 10. No other state is stored: the
// next session starts from what is still unmet. Same shape as startRun, so
// the session screen runs it; ‹ Back takes back the last answer.

const familyRng = (seed, today) => makeRng((seed * 61 + today * 13 + 9) >>> 0);

export function startFamily(content, store, today, card, {texts = []} = {}) {
  const seed = deviceSeed(store);
  const learner = learnerFrom(store, texts);
  const fs = openFamily(content, learner, today, familyRng(seed, today), card);
  const tally = {right: 0, wrong: 0, met: 0};
  const history = [];
  const snap = () => ({queue: fs.queue.slice(), answered: fs.answered, passed: fs.passed,
                       recomposed: fs.recomposed, tried: fs.tried.slice(),
                       quizzes: fs.quizzes.slice(), metHere: fs.metHere.slice()});
  return {
    learner, tally, family: card, practice: false, keepGoing: false,
    choices: choiceRng(seed + 3, today),
    get session() { return fs; },
    // a Meet whose item was met since (Mark known from its card) is dropped,
    // as startRun's
    get task() {
      let t = fs.queue[0] || null;
      while (t && isMeet(t) && learner.states[t.item]) {
        fs.queue.shift();
        t = fs.queue[0] || null;
      }
      return t;
    },
    get summary() { return fs.composed.summary; },
    get pool() { return readingsOf(content, [...fs.composed.tasks, ...fs.queue]); },
    get progress() { return {done: fs.answered, total: fs.answered + fs.queue.length}; },
    get canUndo() { return history.length > 0; },
    answer(ok, {meet = false, task: shown = null} = {}) {
      const task = fs.queue[0];
      if (!task || (shown && shown !== task)) return null;
      if (isMeet(task) && learner.states[task.item]) return null;
      history.push({item: task.item, before: learner.states[task.item] || null, fs: snap(),
                    tally: {...tally}, day: structuredClone(todayLog(store, today))});
      const r = answerFamily(content, learner, fs, ok);
      store.save(KEYS.states, learner.states);
      if (meet || isMeet(task)) {
        tally.met++;
        noteToday(store, today, 'family', task.item);
      } else if (ok) tally.right++;
      else {
        tally.wrong++;
        noteToday(store, today, 'missed', task.item);
      }
      return r;
    },
    undo() {
      const h = history.pop();
      if (!h) return null;
      if (h.before) learner.states[h.item] = h.before;
      else delete learner.states[h.item];
      Object.assign(fs, h.fs);
      Object.assign(tally, h.tally);
      store.save(KEYS.states, learner.states);
      store.save(KEYS.today, h.day);
      return fs.queue[0] || null;
    },
  };
}
