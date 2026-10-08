// report.js — the report sheet (patch plan 4, Phase 5). What was on screen
// is captured already; the learner picks a kind and may add one line. Save
// sends it to Mark (brief 7.19 P1); until the tester's name has been asked
// once, the sheet asks it too (P2).

import {h, clear, put} from './dom.js';
import {nameField} from './feedback.js';
import {KINDS, NOTE_MAX} from '../reports.js';

const LABEL = {gloss: 'The meaning', reading: 'The reading', word: 'The example word',
               part: 'A part or its role', other: 'Something else'};

// renderReport(el, {onSave(kind, note, name), onCancel}, {askName})
//   name: what the field held, or undefined when it wasn't asked
export function renderReport(el, cb, {askName = false} = {}) {
  let kind = null;
  const name = askName ? nameField() : null;
  const save = h('button', {type: 'button', class: 'btn primary wide', disabled: true,
                            onclick: () => cb.onSave(kind, note.value, name ? name.value : undefined)},
                 'Save report');
  const note = h('input', {type: 'text', class: 'note-input', maxlength: NOTE_MAX,
                           placeholder: 'What’s wrong? (optional)', 'aria-label': 'Note'});
  const radios = KINDS.map(k => h('label', {class: 'radio'},
    h('input', {type: 'radio', name: 'report-kind', value: k,
                onchange: () => { kind = k; save.disabled = false; }}),
    ' ', LABEL[k]));
  put(clear(el),
    h('h2', {}, 'What looks wrong?'),
    h('p', {class: 'note'}, 'What was on screen is sent to Mark with your note.'),
    h('fieldset', {class: 'radios'}, h('legend', {class: 'label'}, 'It’s about'), ...radios),
    note,
    name || '',
    h('div', {class: 'btns'},
      h('button', {type: 'button', class: 'btn quiet', onclick: cb.onCancel}, 'Cancel'), save));
}
