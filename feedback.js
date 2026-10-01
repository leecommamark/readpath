// feedback.js — Send feedback (patch plan 7B, Phase 3; brief 7B decided 4).
//
// A note, and the content reports not yet sent, as a small file shared
// through the phone's share sheet; where the browser can't share a file, a
// pre-filled email instead. The file is a .txt holding JSON: Chromium's
// share sheet refuses .json (7B Phase 0). It carries the reports, the note,
// the app and content versions and the device, and never the learner's
// progress or texts: a Reader report quotes only the line it was filed on.
// readpath/tools/import_reports.py reads it like an export.

import {KEYS} from './store.js';
import {isoOf} from './core/clock.js';
import {reports} from './reports.js';

// Public in the shipped app, deliberately (brief 7B decided 4: never the
// work address).
export const FEEDBACK_EMAIL = 'mark@chinnlee.com';
export const SUBJECT = 'Read Path feedback';
export const FORMAT = 1;
export const NOTE_MAX = 2000;
// The whole mailto: URL, encoded, stays under this (Gmail breaks past
// about 4,096, and about 2,000 is the safe ceiling; 7B Phase 0)
export const MAILTO_MAX = 1900;

// Reports not yet sent with feedback ("Include my N reports").
export const toSend = store => reports(store).filter(r => !r.sent);

// The device line: what helps read a report, nothing that identifies.
export function deviceOf({nav = {}, win = {}, standalone = false, persisted = null,
                          storage = ''} = {}) {
  const s = win.screen || {};
  return {ua: nav.userAgent || '', screen: s.width ? `${s.width}x${s.height}@${win.devicePixelRatio || 1}` : '',
          standalone: !!standalone, persisted: persisted ?? null, storage};
}

// feedbackDoc({note, reports, build, content, device, day, at, random})
//   -> {name, text, doc}: the file's name, its text, and what it says
export function feedbackDoc({note = '', reports: reps = [], build, content, device, day, at,
                             random = Math.random}) {
  const rand = Math.floor(random() * 36 ** 6).toString(36).padStart(6, '0');
  const doc = {app: 'readpath', kind: 'feedback', format: FORMAT,
               id: `${day}-${rand}`, date: isoOf(day), at, build, content, device,
               note: String(note).trim().slice(0, NOTE_MAX), reports: reps};
  return {name: `readpath-feedback-${isoOf(day)}.txt`, text: JSON.stringify(doc, null, 1), doc};
}

const enc = s => encodeURIComponent(s);

// The email fallback: the note, the versions and device, then one line per
// report until the encoded URL would pass MAILTO_MAX, then how many more.
// Every line is measured encoded (a Chinese character is nine).
export function mailtoUrl(doc, max = MAILTO_MAX) {
  const head = `mailto:${FEEDBACK_EMAIL}?subject=${enc(SUBJECT)}&body=`;
  const room = max - head.length;
  const size = s => enc(s).length;
  const clip = (s, n) => {
    const cs = Array.from(s);             // never half a surrogate pair
    while (cs.length && size(cs.join('')) > n) cs.pop();
    return cs.join('');
  };
  const d = doc.device || {};
  const reps = doc.reports || [];
  const more = n => (n ? `\n…and ${n} more: Export sends them all` : '');
  const facts = ['', `App ${doc.build} · Content ${doc.content}`,
                 `${d.ua || ''} · ${d.screen || ''}${d.standalone ? ' · installed' : ''}`,
                 ...(reps.length ? ['', `Reports (${reps.length}):`] : [])].join('\n');
  // the note gives way first, so the versions and the count always fit,
  // and takes at most half the room when there are reports to list
  const noteRoom = room - size(facts) - size(more(reps.length));
  let body = clip(doc.note || '(no note)', reps.length ? Math.min(noteRoom, room / 2) : noteRoom) + facts;
  body = clip(body, room - size(more(reps.length)));
  for (let i = 0; i < reps.length; i++) {
    const r = reps[i];
    const line = `\n${r.date} ${r.kind} ${r.item || ''} ${r.note || ''}`.trimEnd();
    if (size(body + line + more(reps.length - i - 1)) > room) return head + enc(body + more(reps.length - i));
    body += line;
  }
  return head + enc(body);
}

// Marks reports sent (by id) on `date`; returns what to undo.
export function markSent(store, ids, date) {
  const want = new Set(ids);
  const before = {};
  store.save(KEYS.reports, reports(store).map(r => {
    if (!want.has(r.id)) return r;
    before[r.id] = r.sent ?? null;
    return {...r, sent: date};
  }));
  return before;
}

export function undoSent(store, before) {
  store.save(KEYS.reports, reports(store).map(r => {
    if (!(r.id in before)) return r;
    const {sent, ...rest} = r;
    return before[r.id] == null ? rest : {...rest, sent: before[r.id]};
  }));
}
