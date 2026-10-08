// feedback.js — the Send feedback sheet (patch plan 7B, Phase 3; brief 7.19).
//
// A note, "Include my N reports" (on by default; absent with none), and
// Send. Until the tester's name has been asked once, a name field too
// (7.19 P2). What Send does (the relay, else the share sheet or an email)
// is the shell's; when the relay can't take it, the sheet stays open with
// the note and offers the other way (fallback()).

import {h, clear, put} from './dom.js';
import {NOTE_MAX} from '../feedback.js';

// The name field (7.19 P2), on this sheet and the report sheet.
export const nameField = () => h('input', {type: 'text', class: 'note-input', maxlength: 60,
  autocomplete: 'name', placeholder: 'Your name (so Mark knows who sent it)',
  'aria-label': 'Your name'});

// renderFeedback(el, {reports, askName, canShare}, {onSend(note, include, name), onCancel})
//   -> {fallback(why, onOther)}: the relay couldn't take it; offer the
//   share sheet or an email (a fresh tap, which share() needs)
export function renderFeedback(el, m, cb) {
  const note = h('textarea', {class: 'paste-area feedback-note', rows: 5, maxlength: NOTE_MAX,
                              placeholder: 'What’s working, what isn’t, what you’d like',
                              'aria-label': 'Your note'});
  const name = m.askName ? nameField() : null;
  const include = m.reports > 0 && h('input', {type: 'checkbox', checked: true});
  const said = h('p', {class: 'note', role: 'status'});
  said.hidden = true;
  let other = null;                // set by fallback(): Send becomes Share or Email
  const send = h('button', {type: 'button', class: 'btn primary', onclick: () => {
    const inc = include ? include.checked : false;
    if (other) return other(note.value, inc);
    send.disabled = true;
    cb.onSend(note.value, inc, name ? name.value : undefined);
  }}, 'Send');
  put(clear(el),
    h('h2', {}, 'Send feedback'),
    h('p', {class: 'note'}, 'It goes straight to Mark. It carries your note, the app and content '
      + 'versions and your phone type, never your progress or your texts.'),
    name || '',
    note,
    include && h('label', {class: 'radio'}, include, ' ',
      `Include my ${m.reports} ${m.reports === 1 ? 'report' : 'reports'}`),
    said,
    h('div', {class: 'btns'},
      h('button', {type: 'button', class: 'btn quiet', onclick: cb.onCancel}, 'Cancel'),
      send));
  return {
    fallback(why, onOther) {
      said.textContent = `It couldn’t go straight to Mark (${why}). `
        + (m.canShare ? 'Send it through your phone’s share sheet instead: pick Mail, or any app.'
                      : 'Send it as an email instead, filled in for you.');
      said.hidden = false;
      send.textContent = m.canShare ? 'Share' : 'Email';
      send.disabled = false;
      other = onOther;
    },
  };
}
