// check.js — the placement check screen (patch plan 6 Phase 4; 7.13 Phase 4).
//
// A thin view over core/placement.js and core/review.js. The question is the
// character alone and four readings, plus I don't know (a miss). After a
// right reading it asks the character's meaning from four English glosses
// (brief 7.13 decided 5), plus I don't know; the question is right only if
// both are. Nothing is shown between questions: it's a check, not a lesson.
//
// The flow (7.13 decided 7-10): questions, then a PENDING record (main.js,
// review.js startPending), then the review pages, then Confirm. Nothing is
// placed before Confirm. ✕ during the questions leaves and records nothing;
// ✕ on the review pages leaves and keeps the pending record, which Today
// offers to finish. When the review set is empty, renderNothing() says so
// (the old empty result screens) and there is nothing to confirm.
//
// questionModel(), meaningModel(), reviewModel(), nothingFound() and
// tilesPerPage() are pure (a test drives them without a DOM);
// renderQuestion(), renderMeaning(), renderReview() and renderNothing() draw.

import {h, clear, put} from './dom.js';
import {glyphTile} from './glyph.js';
import {question, choicesFor, meaningChoicesFor} from '../core/placement.js';
import {reviewSet, reviewed, reviewPages, summary} from '../core/review.js';

// The question as the screen shows it, its choices drawn once.
export function questionModel(content, check, rng) {
  const q = question(check);
  if (!q) return null;
  return {n: q.n, max: q.max, char: q.char, id: q.id,
          answer: content.item(q.id).jp, choices: choicesFor(content, check, rng)};
}

// The meaning step of the same question: the character's reading shown as a
// hint, four English glosses, drawn once. -> null when the check is over.
export function meaningModel(content, check, rng) {
  const q = question(check);
  if (!q) return null;
  const {answer, choices} = meaningChoicesFor(content, check, rng);
  return {n: q.n, max: q.max, char: q.char, id: q.id,
          jp: content.item(q.id).jp, answer, choices};
}

// ---- the review pages

// The review grid's cell, in CSS px: a medium tile and its padding (app.css
// .review-grid), and the gap between cells.
const CELL = 56, GAP = 8;
// Everything on a review page that isn't the grid, in px, from the screen's
// padding down: padding, the top bar, the prompt, the first page's note
// (two lines), the buttons, the last page's summary (two lines), the
// tab/safe-area allowance. Generous: a page must never scroll.
const CHROME = 16 + 24 + 34 + 52 + 51 + 48 + 60 + 48;
const COLUMN = 560, SIDE = 24;                    // --col and the screen's side padding

// tilesPerPage(width, height) -> how many review tiles fit one screenful
// with no scrolling inside a page, at least 4.
export function tilesPerPage(width, height) {
  const w = Math.min(width, COLUMN) - 2 * SIDE;
  const cols = Math.max(1, Math.floor((w + GAP) / (CELL + GAP)));
  const rows = Math.max(1, Math.floor((height - CHROME + GAP) / (CELL + GAP)));
  return Math.max(4, cols * rows);
}

// reviewModel(content, states, pending, perPage) -> {page, pages, tiles,
// note, last, summary}. tiles: [{id, char, unmarked}] of the current page.
// note: S on the first page when characters were skipped, else null.
export function reviewModel(content, states, pending, perPage) {
  const set = reviewSet(content, states, pending);
  const all = reviewPages(set, perPage);
  const pages = Math.max(1, all.length);
  const page = Math.max(0, Math.min(pending.page || 0, pages - 1));
  const off = new Set(pending.unmarked);
  const sum = summary(content, states, pending);
  return {page, pages,
          tiles: (all[page] || []).map(id => ({id, char: content.item(id).char, unmarked: off.has(id)})),
          note: page === 0 && sum.skipped > 0 ? sum.skipped : null,
          last: page === pages - 1, summary: sum};
}

// true when there is nothing to review and nothing skipped
export function nothingFound(content, states, pending) {
  const set = reviewSet(content, states, pending);
  return reviewed(set).length === 0 && set.skipped.length === 0;
}

// ---- drawing

const n0 = n => n.toLocaleString('en-GB');

function top(label, cb, exitLabel = 'Leave the check') {
  // its label and ✕ on the right (brief 7.8 decided 1); on a question,
  // ‹ Back on the left takes back the last answer, as a session's does
  // (Mark, 7.13: a mistaken tap shouldn't count)
  return h('div', {class: 'top session-top'},
    cb.onBack ? h('button', {type: 'button', class: 'link back-btn', disabled: !cb.canBack,
                             'aria-label': 'Back: take back the last answer',
                             onclick: cb.onBack}, '‹ Back')
              : h('span', {}),
    h('div', {class: 'top-right'},
      h('span', {class: 'count mono'}, label),
      h('button', {type: 'button', class: 'icon-btn close-btn', 'aria-label': exitLabel,
                   onclick: cb.onExit}, '✕')));
}

// The frame both steps share: the top, the bar, the lead, the plain glyph
// tile, then `middle` (any hint and the choices), I don't know, the note.
// The tile opens nothing: its card would give the answer away, and its kind
// would say nothing the check asks (7.5).
function frame(el, m, cb, lead, middle) {
  put(clear(el),
    // a question count, not levels (7.13): the check stops once it is sure,
    // at most m.max characters in
    top(`Question ${m.n}`, cb),
    h('div', {class: 'bar'}, h('i', {style: `width:${Math.round(100 * (m.n - 1) / m.max)}%`})),
    h('div', {class: 'card-host'},
      h('p', {class: 'lead'}, lead),
      glyphTile(m.char, null, {size: 'xl', cls: 'task-glyph'}),
      ...middle,
      h('button', {type: 'button', class: 'btn quiet wide idk', onclick: () => cb.onAnswer(false)},
        'I don’t know'),
      h('p', {class: 'note center check-note'},
        'Don’t guess: a lucky guess sets the estimate too high.')));
}

// renderQuestion(el, model, cb)   cb: onExit, onAnswer(ok), onBack, canBack
export function renderQuestion(el, m, cb) {
  frame(el, m, cb, 'How is it read?', [
    h('div', {class: 'choices jp-choices'},
      ...m.choices.map(jp => h('button', {type: 'button', class: 'choice jp', lang: 'en',
                                          onclick: () => cb.onAnswer(jp === m.answer)}, jp)))]);
}

// renderMeaning(el, model, cb)   cb: onExit, onAnswer(ok), onBack, canBack
// The English choices are plain (not jp/mono); the reading sits under the
// tile as a session's meaning question shows it.
export function renderMeaning(el, m, cb) {
  frame(el, m, cb, 'What does it mean?', [
    h('p', {class: 'hint jp', lang: 'en'}, m.jp),
    h('div', {class: 'choices'},
      ...m.choices.map(g => h('button', {type: 'button', class: 'choice', lang: 'en',
                                         onclick: () => cb.onAnswer(g === m.answer)}, g)))]);
}

const plural = (n, one, many = `${one}s`) => n === 1 ? one : many;

// renderReview(el, model, cb)   cb: onExit, onToggle(id), onBack, onNext, onConfirm
export function renderReview(el, m, cb) {
  const sum = m.summary;
  const line = `${n0(sum.toMark)} to mark known · ${n0(sum.unmarked)} unmarked`
    + (sum.skipped > 0
        ? ` · ${n0(sum.skipped)} common ${plural(sum.skipped, 'character')} marked without review` : '');
  put(clear(el),
    top(`Page ${m.page + 1} of ${m.pages}`, cb, 'Leave the review: your taps are kept'),
    h('div', {class: 'review'},
      h('h1', {id: 'review-h', class: 'review-prompt'}, 'Tap any you don’t actually know.'),
      m.note != null && h('p', {class: 'note review-note'},
        m.note === 1 ? 'Your most common character is marked known. Check the rest.'
                     : `Your ${n0(m.note)} most common characters are marked known. Check the rest.`),
      h('div', {class: 'review-grid', 'aria-labelledby': 'review-h'},
        ...m.tiles.map(t => {
          const b = glyphTile(t.char, null, {
            size: 'md', cls: t.unmarked ? 'review-tile review-off' : 'review-tile',
            label: t.unmarked ? `${t.char}: unmarked, tap to mark it known again`
                              : `${t.char}: marked known, tap to unmark it`,
            onTap: () => cb.onToggle(t.id)});
          b.setAttribute('aria-pressed', t.unmarked ? 'true' : 'false');
          return b;
        })),
      m.last && h('p', {class: 'note center review-summary'}, line),
      h('div', {class: 'btns review-btns'},
        m.page > 0 && h('button', {type: 'button', class: 'btn quiet', onclick: cb.onBack}, 'Back'),
        m.last
          ? h('button', {type: 'button', class: 'btn primary', onclick: cb.onConfirm}, 'Mark them known')
          : h('button', {type: 'button', class: 'btn primary', onclick: cb.onNext}, 'Next'))));
}

// renderNothing(el, model, cb)   model: {asked, right, allKnown}   cb: onDone
export function renderNothing(el, m, cb) {
  put(clear(el),
    h('div', {class: 'top'}),
    h('h1', {id: 'check-h'}, 'Placement check'),
    h('section', {class: 'block first'},
      h('p', {class: 'lead-note'}, m.allKnown ? 'You know all of them already.'
                                              : 'The check didn’t find a stretch of characters you know.'),
      h('p', {class: 'note'}, `You answered ${m.right} of ${m.asked} right. Nothing you already knew has changed.`),
      h('button', {type: 'button', class: 'btn', onclick: cb.onDone}, 'Done')));
}
