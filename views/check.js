// check.js — the placement check screen (patch plan 6, Phase 4).
//
// A thin view over core/placement.js. The question is the character alone
// and four readings, plus I don't know (a miss); nothing is shown between
// questions: it's a check, not a lesson. ✕ leaves, and leaving midway
// records nothing.
//
// When the check finishes, every character answered right is placed
// straight away (Mark, Phase 0 decided 1): `finish()`. The result then
// offers the top N by written rank: Confirm places them (`confirm()`), Not
// now leaves it there. Both only ever add (brief 6, decided 6): a reading
// already known is never in a plan, and a miss changes nothing. The last
// result is `readpath.placement`, {day, n, asked, right, confirmed, runs},
// which the Path tab shows and Export carries.
//
// finish(), confirm() and resultModel() are pure (a test drives them without
// a DOM); renderQuestion() and renderResult() draw.

import {h, clear, put} from './dom.js';
import {glyphTile} from './glyph.js';
import {question, choicesFor, result, placementPlan, applyPlacement,
        LEVELS} from '../core/placement.js';

// The question as the screen shows it, its choices drawn once.
export function questionModel(content, check, rng) {
  const q = question(check);
  if (!q) return null;
  return {level: q.level, levels: LEVELS, n: q.n, char: q.char, id: q.id,
          answer: content.item(q.id).jp, choices: choicesFor(content, check, rng)};
}

// The check is done: place what was answered right, and say what the result
// offers. -> {states, record}
export function finish(content, states, check, today, last = null) {
  const r = result(check);
  const plan = placementPlan(content, states, {n: 0, right: r.right}, today);
  return {states: applyPlacement(states, plan, today),
          record: {day: today, n: r.n, asked: r.asked, right: r.right.length,
                   confirmed: false, runs: ((last && last.runs) || 0) + 1}};
}

// Confirm: the top n by written rank, less what's known. -> {states, placed,
// before}: `before` is what Undo needs, each placed id's state as it was (null
// where there was none).
export function confirm(content, states, n, today) {
  const plan = placementPlan(content, states, {n}, today);
  const before = Object.fromEntries(plan.ids.map(id => [id, states[id] || null]));
  return {states: applyPlacement(states, plan, today), placed: plan.ids.length, before};
}

// Undo a Confirm (Mark, step 6 6b): each id it placed back to the state it
// had, or none. Only those ids: anything else changed since stays.
export function undoConfirm(states, before) {
  const out = {...states};
  for (const [id, s] of Object.entries(before)) {
    if (s) out[id] = s; else delete out[id];
  }
  return out;
}

export function resultModel(content, states, record, today) {
  const toPlace = placementPlan(content, states, {n: record.n}, today).ids.length;
  return {n: record.n, asked: record.asked, right: record.right, toPlace,
          confirmed: record.confirmed};
}

// ---- drawing

function top(label, cb) {
  return h('div', {class: 'top session-top'},
    h('div', {class: 'top-left'},
      h('button', {type: 'button', class: 'icon-btn', 'aria-label': 'Leave the check',
                   onclick: cb.onExit}, '✕')),
    h('span', {class: 'count mono'}, label));
}

// renderQuestion(el, model, cb)   cb: onExit, onAnswer(ok)
export function renderQuestion(el, m, cb) {
  put(clear(el),
    top(`Level ${m.level} of ${m.levels}`, cb),
    h('div', {class: 'bar'}, h('i', {style: `width:${Math.round(100 * (m.level - 1) / m.levels)}%`})),
    h('div', {class: 'card-host'},
      h('p', {class: 'lead'}, 'How is it read?'),
      // a plain tile that opens nothing: its card would give the answer
      // away, and its kind would say nothing the check asks (7.5)
      glyphTile(m.char, null, {size: 'xl', cls: 'task-glyph'}),
      h('div', {class: 'choices jp-choices'},
        ...m.choices.map(jp => h('button', {type: 'button', class: 'choice mono', lang: 'en',
                                            onclick: () => cb.onAnswer(jp === m.answer)}, jp))),
      h('button', {type: 'button', class: 'btn quiet wide idk', onclick: () => cb.onAnswer(false)},
        'I don’t know'),
      h('p', {class: 'note center check-note'},
        'Don’t guess: a lucky guess sets the estimate too high.')));
}

const n0 = n => n.toLocaleString('en-GB');

// renderResult(el, model, cb)   cb: onConfirm, onNotNow
export function renderResult(el, m, cb) {
  const got = `You answered ${m.right} of ${m.asked} right${m.right ? ', and they’re marked known' : ''}.`;
  put(clear(el),
    h('div', {class: 'top'}),
    h('h1', {id: 'check-h'}, 'Placement check'),
    m.n > 0
      ? h('section', {class: 'block first'},
          h('p', {class: 'lead-note'},
            `You seem to know about the ${n0(m.n)} most common characters in written Chinese.`),
          h('p', {class: 'note'}, got),
          m.toPlace > 0
            ? [h('h2', {}, 'Mark them known?'),
               h('p', {class: 'note'}, `${n0(m.toPlace)} of them ${m.toPlace === 1 ? 'isn’t' : 'aren’t'} known yet. `
                 + 'They go into your reviews, spread over the next two months. Nothing you know already changes.'),
               h('div', {class: 'btns stack'},
                 h('button', {type: 'button', class: 'btn primary', onclick: cb.onConfirm}, 'Mark them known'),
                 h('button', {type: 'button', class: 'btn quiet', onclick: cb.onNotNow}, 'Not now'))]
            : [h('p', {class: 'note'}, 'You know all of them already.'),
               h('button', {type: 'button', class: 'btn', onclick: cb.onNotNow}, 'Done')])
      : h('section', {class: 'block first'},
          h('p', {class: 'lead-note'}, 'The check didn’t find a stretch of characters you know.'),
          h('p', {class: 'note'}, `${got} Nothing you already knew has changed.`),
          h('button', {type: 'button', class: 'btn', onclick: cb.onNotNow}, 'Done')));
}
