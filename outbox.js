// outbox.js — reports and feedback sent through the relay (brief 7.19,
// Phase 2).
//
// core/relay.js makes the email and posts it; this keeps the hourly cap in
// readpath.meta, marks what went as sent (feedback.js markSent), and
// retries what didn't (P3): each unsent report at most once per launch,
// when the app opens and when it comes back online. A report counts as sent
// only on the relay's success: true. Saved reports stay in readpath.reports
// either way, so Send feedback and Export still carry any that didn't go.

import {KEYS} from './store.js';
import {isoOf} from './core/clock.js';
import {emailOf, send, budget, spend} from './core/relay.js';
import {feedbackDoc, toSend, markSent} from './feedback.js';

// The tester's name (P2): undefined until asked; '' once left empty, and
// then never asked again. Settings changes it.
export const testerName = store => store.load(KEYS.settings, {}).testerName;
export const askName = store => testerName(store) === undefined;

export function saveName(store, name) {
  const settings = store.load(KEYS.settings, {});
  store.save(KEYS.settings, {...settings, testerName: String(name ?? '').trim()});
}

// relaySend(store, doc, {fetchFn, now}) -> send's result, or {ok: false,
// retry: true, why: 'cap'} with nothing posted when the hour's sends are
// used up. Every post counts against the cap, sent or not.
export async function relaySend(store, doc, {fetchFn, now}) {
  const {left, meta} = budget(store.load(KEYS.meta, {}), now);
  if (left <= 0) return {ok: false, retry: true, why: 'cap'};
  store.save(KEYS.meta, spend(meta, now));
  return send(emailOf(doc, {name: testerName(store)}), fetchFn);
}

// A one-report doc: feedbackDoc's shape, no note (relay.js reads it as a
// report email; import_reports.py reads it like any feedback file).
export const reportDoc = (report, ctx) => feedbackDoc({...ctx, note: '', reports: [report]}).doc;

// createOutbox({store, fetchFn, ctx(), online()}) -> {sendReport(report),
// flush()}. ctx() gives feedbackDoc's {build, content, device, day, at};
// online() is navigator.onLine. Both resolve to the report's result, or,
// for flush, how many went.
export function createOutbox({store, fetchFn, ctx, online = () => true}) {
  const tried = new Set();         // flushed this launch (P3: once each)
  const busy = new Set();          // posting now: never twice at once

  async function post(report) {
    if (busy.has(report.id)) return {ok: false, retry: true, why: 'busy'};
    busy.add(report.id);
    try {
      const c = ctx();
      const r = await relaySend(store, reportDoc(report, c), {fetchFn, now: c.at});
      if (r.ok) markSent(store, [report.id], isoOf(c.day));
      return r;
    } finally {
      busy.delete(report.id);
    }
  }

  return {
    async sendReport(report) {
      if (!online()) return {ok: false, retry: true, why: 'offline'};
      return post(report);
    },
    async flush() {
      let sent = 0;
      for (const r of toSend(store)) {
        if (!online()) break;
        if (tried.has(r.id) || busy.has(r.id)) continue;
        tried.add(r.id);
        const res = await post(r);
        if (res.ok) sent++;
        else if (res.why === 'cap') { tried.delete(r.id); break; }   // not posted: next time
      }
      return sent;
    },
  };
}
