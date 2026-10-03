// session.js — the session screen (patch plan 4, Phase 4; Blueprint:
// Session). One task card at a time under a progress bar, an exit, and a
// short summary at the end. The run (runner.js) saves every answer as it is
// given, so the exit needs no confirmation: leaving loses nothing.

import {h, clear, put} from './dom.js';
import {cardModel, renderTask} from './task.js';
import {glyphKind} from './glyph.js';

// showSession(el, content, run, {onExit(), onRef(char), onReport(shown),
//                                tipOnce(), lineOf({text, line})})
// ‹ Back takes back the last answer and asks it again (Mark, 2026-09-29).
export function showSession(el, content, run, cb) {
  const count = h('span', {class: 'count mono'});
  const fill = h('i');
  const card = h('div', {class: 'card-host'});
  const back = h('button', {type: 'button', class: 'link back-btn', disabled: true,
                            'aria-label': 'Back: take back the last answer',
                            onclick: () => { if (run.undo()) next(); }}, '‹ Back');
  put(clear(el),
    h('div', {class: 'top session-top'},
      back,
      // a family session names its family (7.5, Phase 4b)
      run.family && h('span', {class: 'session-title'},
        run.family.head ? `${run.family.head} family` : 'On their own'),
      // ✕ top right, as on the card and the word panel (brief 7.8 decided 1)
      h('div', {class: 'top-right'},
        count,
        h('button', {type: 'button', class: 'icon-btn close-btn', 'aria-label': 'Leave the session',
                     onclick: () => cb.onExit()}, '✕'))),
    h('div', {class: 'bar'}, fill),
    card);

  function progress() {
    const {done, total} = run.progress;
    count.textContent = `${Math.min(done + 1, total)} / ${total}`;
    fill.style.width = `${total ? Math.round(100 * done / total) : 100}%`;
  }

  function next() {
    const task = run.task;
    // Test me is one task: its feedback card is the end, and Continue leaves
    if (!task) return run.testMe ? cb.onExit() : finish();
    progress();
    back.disabled = !run.canUndo;
    const m = cardModel(content, task, run.choices, run.pool, run.learner.states,
                        {lineOf: cb.lineOf});
    renderTask(card, m, {
      onAnswer: ok => {
        // the task this card shows: a stale card answers nothing (7.5, bug 1)
        run.answer(ok, {meet: task.task === 'meet' || task.task === 'part_meet', task});
        back.disabled = !run.canUndo;
      },
      onNext: next,
      onRef: cb.onRef,
      onReport: cb.onReport,
      tipOnce: cb.tipOnce,
      kindOf: form => glyphKind(content, form),
    });
    window.scrollTo(0, 0);
  }

  function finish() {
    const t = run.tally;
    back.disabled = !run.canUndo;
    fill.style.width = '100%';
    count.textContent = '';
    const asked = t.right + t.wrong;
    put(clear(card),
      h('h1', {}, run.practice ? 'Practice done'
        : run.family ? `${run.family.head ? `${run.family.head} family` : 'These characters'}: done`
          : 'Done for today'),
      run.family && h('p', {class: 'note'}, 'What you met comes back in Today’s reviews.'),
      run.practice && h('p', {class: 'note'}, 'Practice doesn’t count: your schedule is unchanged.'),
      h('section', {class: 'block first'},
        h('p', {class: 'session-line'},
          asked ? `${t.right} of ${asked} right` : 'Nothing was asked today',
          t.met ? ` · ${t.met} new met` : '')),
      h('div', {class: 'foot'},
        h('button', {type: 'button', class: 'btn primary wide', onclick: () => cb.onExit()},
          run.family ? 'Back to the family' : 'Back to Today')));
  }

  next();
}
