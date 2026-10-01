// reports.js — content reports (patch plan 4, Phase 5; brief 4 decision 5).
//
// "This content is wrong", from inside the app: a gloss, a reading, an
// example word or a part's role. A report captures what was on screen
// (task.js's shownOf, or the reference card's), the content version, and the
// date, plus the learner's kind and one-line note. Reports are a list under
// readpath.reports: they travel in Export, and learning never reads them.
// readpath/tools/import_reports.py turns exports into review/reports.tsv.
// Send feedback (feedback.js, patch plan 7B) carries the same reports.

import {KEYS} from './store.js';
import {isoOf} from './core/clock.js';

export const KINDS = Object.freeze(['gloss', 'reading', 'word', 'part', 'other']);
export const NOTE_MAX = 200;

// makeReport(shown, {kind, note, where, build, day, at, random}) -> report
export function makeReport(shown, {kind, note = '', where, build, day, at,
                                   random = Math.random}) {
  if (!KINDS.includes(kind)) throw new Error(`unknown report kind: ${kind}`);
  const rand = Math.floor(random() * 36 ** 6).toString(36).padStart(6, '0');
  return {
    id: `${day}-${rand}`, date: isoOf(day), at, where, kind,
    note: String(note).replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX),
    item: shown.item, task: shown.task, rung: shown.rung ?? null,
    asked: shown.asked ?? null, prompt: shown.prompt || '',
    choices: shown.choices || [], answer: shown.answer ?? null,
    given: shown.given ?? null, target: shown.target ?? null, build,
  };
}

export function addReport(store, report) {
  const list = store.load(KEYS.reports, []);
  list.push(report);
  store.save(KEYS.reports, list);
  return list.length;
}

export const reports = store => store.load(KEYS.reports, []);

// Reports filed since the last export and not sent with Send feedback
// (Phase 0 proposal: a count on the Export control, so they aren't
// forgotten; 7B: a sent report has `sent`, its date, and is kept).
export function unsent(store) {
  const since = store.load(KEYS.meta, {}).exportedAt || 0;
  return reports(store).filter(r => r.at > since && !r.sent).length;
}
