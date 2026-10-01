// tasks.js — which task an item gets at its current rung (plan 3, Phase 3).
//
// The answer is a task DESCRIPTOR: ids and small facts only. Choices, glosses
// and layout are step 4's. Every descriptor has the same fields:
//
//   task           meet | reading | meaning | word | sentence
//                  | part_meet | predict | tell_apart
//   item           the item being graded
//   rung           the state's rung (2-5, "M"), or "new" for a Meet
//   asked          the rung actually shown, after rotation and fallback
//   fallback       the fallbacks taken, in order: "secondary", "no_sentence",
//                  "no_word" (empty when none)
//   inferred_from  meet: the unlocked part item it is inferred from, or null
//   pattern        meet of a secondary reading: {main, relation, base}, so
//                  step 4 can teach it as a pattern (DESIGN *Related readings*)
//   word           the word rung: the word shown
//   sentence       the sentence rung: {text, line}, the focus text's line
//                  (core/sentences.js; patch plan 5)
//   target         predict: the member asked about (a reading item);
//                  tell_apart: the family asked about (its head)
//   role           review | new | quiz | test | payoff (the composer's)
//
// The character ladder (DESIGN): 1 Meet, 2 reading, 3 meaning, 4 word,
// 5 sentence, then Maintain rotating [3, 4, 5][step % 3]. The fallbacks, in
// this order (Mark, 2026-09-28):
//   * a secondary reading at rung 2 is asked in a word (rung 4): the bare
//     character doesn't say which reading is meant;
//   * rung 5 falls back to rung 4 when the focus text has no line for the
//     reading (core/sentences.js; there is no focus text, no line);
//   * rung 4 falls back to rung 3 for the 21 readings with no example word
//     (43 before patch plan 6.5 gave 22 of them dictionary words).
// A part: Meet, then its test task at every later rung (Predict for a sound
// part, Tell apart for a meaning part), Maintained at the test task.

import {readingId} from './content.js';
import {MAINTAIN} from './state.js';
import {partUnlocked} from './unlock.js';

const CHAR_TASK = {2: 'reading', 3: 'meaning', 4: 'word', 5: 'sentence'};
const PART_TEST = {sound: 'predict', meaning: 'tell_apart'};
export const ROTATION = Object.freeze([3, 4, 5]);

const descriptor = fields => Object.freeze({
  task: null, item: null, rung: null, asked: null, fallback: [],
  inferred_from: null, pattern: null, word: null, sentence: null, target: null,
  role: 'review', ...fields});

// The rung a character reading is asked at, and why it isn't its own.
// `sentences` is sentenceIndex()'s map for the focus text, or null.
export function askedRung(content, id, rung, step, sentences = null) {
  const it = content.item(id);
  let asked = rung === MAINTAIN ? ROTATION[((step % 3) + 3) % 3] : rung;
  const fallback = [];
  if (asked === 2 && !it.primary) { asked = 4; fallback.push('secondary'); }
  if (asked === 5 && !(sentences && sentences.has(id))) { asked = 4; fallback.push('no_sentence'); }
  if (asked === 4 && !content.hasWord(id)) { asked = 3; fallback.push('no_word'); }
  return {asked, fallback};
}

// The part a new character's Meet is inferred from: its sound part if that
// has unlocked, else its meaning part (decided 2026-09-28: unlocked, not
// known). `assume` counts a part being met this session (the payoff Meet).
// A secondary reading is never inferred: its parts predict the main one.
export function inferredFrom(content, states, id, assume = []) {
  const it = content.item(id);
  if (!it.primary) return null;
  for (const q of [content.soundItemOf(it.char), content.meaningItemOf(it.char)]) {
    if (q && (assume.includes(q) || partUnlocked(states[q]))) return q;
  }
  return null;
}

// Predict: an unmet member, the LAST on the path so it isn't met again soon;
// with none left, any member but `exclude`, drawn with the rng.
// Test me draws among the unmet members instead (patch plan 7A, 6b, Mark:
// asking the same member every time let two quick Test me's mark a part
// known on one remembered answer), never the member it asked last
// (`exclude`), so passing twice means predicting two members.
function predictTarget(content, states, id, exclude, rng, role) {
  const members = content.membersOf(id).filter(m => m !== exclude);
  const unmet = members.filter(m => !states[m]);
  if (role === 'testme') {
    const pool = unmet.length ? unmet : members;
    if (!pool.length) return null;
    return rng ? rng.pick(pool) : pool[pool.length - 1];
  }
  if (unmet.length) return unmet[unmet.length - 1];
  if (!members.length) return null;
  return rng ? rng.pick(members) : members[0];
}

// Tell apart: one of the gated families the part resolves; Test me avoids
// the family it asked last, where the part resolves more than one.
function tellApartTarget(content, id, rng, exclude = null) {
  const all = content.item(id).resolves || [];
  const heads = all.length > 1 ? all.filter(h => h !== exclude) : all;
  if (!heads.length) return null;
  return rng ? rng.pick(heads) : heads[0];
}

// taskFor(content, states, id, opts) -> descriptor
//   opts.role     the composer's role for the task (default "review")
//   opts.rng      seeded rng for the word and target draws (else the first)
//   opts.planned  a rung to plan at before the state exists: the composer's
//                 same-session quiz (2) after a Meet, or a part's test (2)
//   opts.assume   parts to count as unlocked (the payoff Meet)
//   opts.exclude  a member Predict must not ask about (the payoff member;
//                 for Test me, the member or family it asked last)
//   opts.sentences  sentenceIndex()'s map for the focus text (rung 5)
// The word rung's word (patch plan 6.5, CO-035, Mark 2026-09-29): one of
// 2-4 characters, as songpath's quiz words were (the reference card still
// lists all eight), preferring a word whose other characters the learner
// knows in the reading the word gives them. The draw stays seeded.
const WORD_MAX = 4;
export function wordFor(content, states, id, rng = null) {
  const all = content.wordsOf(id);
  if (!all.length) return null;
  const short = all.filter(f => [...f].length <= WORD_MAX);
  const pool = short.length ? short : all;
  const it = content.item(id);
  const read = pool.filter(f => othersKnown(content, states, f, it.char, it.jp));
  const from = read.length ? read : pool;
  return rng ? rng.pick(from) : from[0];
}

function othersKnown(content, states, form, char, jp) {
  const chars = [...form];
  const i = chars.indexOf(char);
  const entry = wordEntry(content, form, i, jp);
  if (!entry) return false;
  const syls = entry.jp.split(' ');
  return chars.every((c, k) => k === i || c === char
    || (states[readingId(c, syls[k])] || {}).rung === MAINTAIN);
}

const BY_FORM = new WeakMap();
function wordEntry(content, form, i, jp) {
  let m = BY_FORM.get(content);
  if (!m) {
    m = new Map();
    for (const w of content.words.values()) {
      if (!m.has(w.form)) m.set(w.form, []);
      m.get(w.form).push(w);
    }
    BY_FORM.set(content, m);
  }
  const ws = m.get(form) || [];
  return ws.find(w => w.jp.split(' ')[i] === jp) || ws[0] || null;
}

export function taskFor(content, states, id, opts = {}) {
  const {role = 'review', rng = null, planned = null, assume = [],
         exclude = null, sentences = null} = opts;
  const kind = content.kind(id);
  const s = states[id];
  const rung = s ? s.rung : planned;
  const step = s ? s.step : -1;

  if (rung === null || rung === undefined) {            // a Meet
    if (kind !== 'reading') {
      return descriptor({task: 'part_meet', item: id, rung: 'new', asked: 1, role});
    }
    const it = content.item(id);
    return descriptor({
      task: 'meet', item: id, rung: 'new', asked: 1, role,
      inferred_from: inferredFrom(content, states, id, assume),
      pattern: it.primary ? null
        : {main: it.unlockAfter, relation: it.relation, base: it.base},
    });
  }

  if (kind !== 'reading') {
    const task = PART_TEST[kind];
    return descriptor({
      task, item: id, rung, asked: rung, role,
      target: task === 'predict' ? predictTarget(content, states, id, exclude, rng, role)
                                 : tellApartTarget(content, id, rng,
                                                   role === 'testme' ? exclude : null),
    });
  }

  const {asked, fallback} = askedRung(content, id, rung, step, sentences);
  if (asked === 5) {                       // no word drawn: the rng is untouched
    return descriptor({task: 'sentence', item: id, rung, asked, fallback,
                       sentence: sentences.get(id), role});
  }
  const word = asked >= 4 ? wordFor(content, states, id, rng) : null;
  return descriptor({task: CHAR_TASK[asked], item: id, rung, asked, fallback,
                     word, role});
}
