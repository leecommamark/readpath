// state.js — an item's learning state, and every change to it (plan 3, P2).
//
// The rung (which task an item gets) and the interval (when it comes back)
// are separate, which is the thing songpath's one-number card could not do
// (DESIGN *Learner model*). A state is a plain JSON object:
//
//     {item, rung, step, due, lapses, source, met, unlocked, last}
//
//   rung      characters 2-5 or "M"; parts 2-3 or "M". Rung 1 is the Meet,
//             which is a task and never a stored state: meeting an item
//             writes it at rung 2, due today (its same-session quiz or test).
//             A part's rung 2 is its test with 2 passes to go, rung 3 with 1.
//   step      an index into INTERVALS; -1 until the first pass
//   due, met, last, unlocked   day numbers (clock.js); `unlocked` is a
//             part's first test pass, and never goes back to null
//   source    "learned" | "placed" | "marked"
//
// Every change goes through `transition(state, event, today)`, which returns
// a new frozen object and never touches its input. Nothing else in the app
// builds or edits a state (a test checks). Adaptive promotion, when it comes,
// is a new branch in `pass` and nothing else.

import {kindOf} from './content.js';

export const INTERVALS = Object.freeze([1, 3, 7, 14, 30, 90, 180, 365]);
export const MAINTAIN = 'M';
const TOP_RUNG = {reading: 5, sound: 3, meaning: 3};
const FLOOR = 2;                           // a miss never drops below the quiz
const LAPSE_RUNG = {reading: 4, sound: 2, meaning: 2};
export const PLACED_STEP = 4;              // 30 days
export const SPREAD = Object.freeze([7, 60]);  // placed due days, from today
const SOURCES = new Set(['learned', 'placed', 'marked']);
export const EVENTS = Object.freeze(['meet', 'pass', 'miss', 'forgot',
                                     'mark_known', 'placed']);

const isDay = d => Number.isInteger(d);
const LAST_STEP = INTERVALS.length - 1;

// Refuse anything that is not a state this module could have made: states
// come back from storage, and a bad one should stop here.
export function check(s) {
  const bad = why => { throw new Error(`bad state (${why}): ${JSON.stringify(s)}`); };
  if (!s || typeof s !== 'object') bad('not an object');
  const kind = kindOf(String(s.item));
  if (!kind) bad('item');
  if (!(s.rung === MAINTAIN
        || (Number.isInteger(s.rung) && s.rung >= FLOOR && s.rung <= TOP_RUNG[kind]))) bad('rung');
  if (!(Number.isInteger(s.step) && s.step >= -1 && s.step <= LAST_STEP)) bad('step');
  if (!isDay(s.due) || !isDay(s.met) || !isDay(s.last)) bad('day');
  if (!(Number.isInteger(s.lapses) && s.lapses >= 0)) bad('lapses');
  if (!SOURCES.has(s.source)) bad('source');
  if (kind === 'reading' ? s.unlocked !== null
                         : !(s.unlocked === null || isDay(s.unlocked))) bad('unlocked');
  if (kind !== 'reading' && s.source !== 'learned') bad('a part is only learned');
  return s;
}

const make = s => Object.freeze(check(s));

// ---- the transitions

function meet(state, event, today) {
  if (state) throw new Error(`meet: ${state.item} was already met`);
  return make({item: event.item, rung: FLOOR, step: -1, due: today, lapses: 0,
               source: 'learned', met: today, unlocked: null, last: today});
}

function pass(s, today) {
  const kind = kindOf(s.item);
  const step = Math.min(s.step + 1, LAST_STEP);
  const rung = s.rung === MAINTAIN || s.rung === TOP_RUNG[kind] ? MAINTAIN : s.rung + 1;
  // a part's first pass is a pass of its test task: it unlocks its characters
  const unlocked = kind === 'reading' ? null : (s.unlocked ?? today);
  return make({...s, rung, step, due: today + INTERVALS[step], unlocked, last: today});
}

function miss(s, today) {
  const kind = kindOf(s.item);
  if (s.rung === MAINTAIN) {               // a lapse
    return make({...s, rung: LAPSE_RUNG[kind], step: 0, due: today + 1,
                 lapses: s.lapses + 1, last: today});
  }
  return make({...s, rung: Math.max(s.rung - 1, FLOOR), step: 0,
               due: today + 1, last: today});
}

function forgot(s, today) {
  return make({...s, rung: FLOOR, step: 0, due: today,
               lapses: s.lapses + (s.rung === MAINTAIN ? 1 : 0), last: today});
}

function known(s, event, today, source) {
  if (!isDay(event.due) || event.due < today) {
    throw new Error(`${event.type}: needs a due day from today on, got ${event.due}`);
  }
  return make({item: event.item, rung: MAINTAIN, step: PLACED_STEP, due: event.due,
               lapses: s ? s.lapses : 0, source, met: s ? s.met : today,
               unlocked: null, last: today});
}

// transition(state | null, {type, item?, due?}, today) -> frozen state
//   meet                 {type: 'meet', item}          state must be null
//   pass, miss, forgot   {type}                        state must exist
//   mark_known, placed   {type, item, due}             characters only
export function transition(state, event, today) {
  if (!isDay(today)) throw new Error(`today must be a day number: ${today}`);
  if (!event || !EVENTS.includes(event.type)) {
    throw new Error(`unknown event: ${JSON.stringify(event)}`);
  }
  if (state) check(state);
  const item = state ? state.item : event.item;
  if (event.item !== undefined && event.item !== item) {
    throw new Error(`${event.type}: event for ${event.item}, state for ${item}`);
  }
  const kind = kindOf(String(item));
  if (!kind) throw new Error(`${event.type}: not an item id: ${item}`);
  const t = event.type;
  if (kind !== 'reading' && ['forgot', 'mark_known', 'placed'].includes(t)) {
    // DESIGN: placement and Mark mode never touch parts
    throw new Error(`${t}: parts are learned only through their own tasks (${item})`);
  }
  if (t === 'meet') return meet(state, {...event, item}, today);
  if (t === 'mark_known') return known(state, {...event, item}, today, 'marked');
  if (t === 'placed') return known(state, {...event, item}, today, 'placed');
  if (!state) throw new Error(`${t}: ${item} has not been met`);
  if (t === 'pass') return pass(state, today);
  if (t === 'miss') return miss(state, today);
  return forgot(state, today);
}

// ---- helpers for the callers

// Due days for a placement of many items at once, spread over SPREAD days
// from today in the order given (the caller passes path order), so a big
// placement doesn't all fall due on one day and set off the backlog rule.
export function spreadDue(items, today) {
  const [lo, hi] = SPREAD, n = items.length, span = hi - lo + 1;
  return new Map(items.map((id, i) => [id, today + lo + Math.floor(i * span / n)]));
}

export const isKnown = s => !!s && s.rung === MAINTAIN;
export const isDue = (s, today) => !!s && s.due <= today;
