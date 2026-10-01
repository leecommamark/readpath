// feedback.js — the Send feedback sheet (patch plan 7B, Phase 3).
//
// A note, "Include my N reports" (on by default; absent with none), and
// Send. What Send does (the share sheet, or an email) is the shell's.

import {h, clear} from './dom.js';
import {NOTE_MAX} from '../feedback.js';

// renderFeedback(el, {reports, canShare}, {onSend(note, include), onCancel})
export function renderFeedback(el, m, cb) {
  const note = h('textarea', {class: 'paste-area feedback-note', rows: 5, maxlength: NOTE_MAX,
                              placeholder: 'What’s working, what isn’t, what you’d like',
                              'aria-label': 'Your note'});
  const include = m.reports > 0 && h('input', {type: 'checkbox', checked: true});
  clear(el).append(
    h('h2', {}, 'Send feedback'),
    h('p', {class: 'note'},
      m.canShare
        ? 'It goes to Mark as a small file, through your phone’s share sheet: pick Mail, or any app.'
        : 'It opens an email to Mark, filled in for you.'),
    note,
    include && h('label', {class: 'radio'}, include, ' ',
      `Include my ${m.reports} ${m.reports === 1 ? 'report' : 'reports'}`),
    h('p', {class: 'note'},
      'It carries the app and content versions and your device, never your progress or your texts.'),
    h('div', {class: 'btns'},
      h('button', {type: 'button', class: 'btn quiet', onclick: cb.onCancel}, 'Cancel'),
      h('button', {type: 'button', class: 'btn primary',
                   onclick: () => cb.onSend(note.value, include ? include.checked : false)},
        'Send')));
}
