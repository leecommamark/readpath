// report.js — the report sheet (patch plan 4, Phase 5). What was on screen
// is captured already; the learner picks a kind and may add one line.

import {h, clear} from './dom.js';
import {KINDS, NOTE_MAX} from '../reports.js';

const LABEL = {gloss: 'The meaning', reading: 'The reading', word: 'The example word',
               part: 'A part or its role', other: 'Something else'};

// renderReport(el, {onSave(kind, note), onCancel})
export function renderReport(el, cb) {
  let kind = null;
  const save = h('button', {type: 'button', class: 'btn primary wide', disabled: true,
                            onclick: () => cb.onSave(kind, note.value)}, 'Save report');
  const note = h('input', {type: 'text', class: 'note-input', maxlength: NOTE_MAX,
                           placeholder: 'What’s wrong? (optional)', 'aria-label': 'Note'});
  const radios = KINDS.map(k => h('label', {class: 'radio'},
    h('input', {type: 'radio', name: 'report-kind', value: k,
                onchange: () => { kind = k; save.disabled = false; }}),
    ' ', LABEL[k]));
  clear(el).append(
    h('h2', {}, 'What looks wrong?'),
    h('p', {class: 'note'}, 'What was on screen is saved with it. Reports go out with Export.'),
    h('fieldset', {class: 'radios'}, h('legend', {class: 'label'}, 'It’s about'), ...radios),
    note,
    h('div', {class: 'btns'},
      h('button', {type: 'button', class: 'btn quiet', onclick: cb.onCancel}, 'Cancel'), save));
}
