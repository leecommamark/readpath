// forecast.js — how far away a text is (brief 7.29, P13; F1, F2).
//
// "Readable in about N days": the days until every reading the text uses is
// known (Maintain), if the learner made it the focus today and did each
// day's session, passing everything (Mark, 2026-11-03, after Phase 1's
// measurement). Counted by running core/session.js's loop -- the app's own
// -- on a copy of the learner, so it sees what a direct count can't: items
// that wait on a part or on a main reading, the path filling those slots,
// and the climb to Maintain. Passing everything makes it a best case;
// "about" says so.
//
// It costs a simulated day per day forecast (tens of ms for the starter, a
// few hundred for a long text, on a Mac): the caller caches the figure per
// text, content version and day (F2), never recomputing it on every draw.
//
// readableIn(content, learner, tokens, today, {limit}) -> days, or null
//   learner  {states, settings}: copied, never written
//   0        every reading is known already (ready to read)
//   null     not within `limit` days (LIMIT: two years)

import {makeRng} from './rng.js';
import {focusNeeds} from './focus.js';
import {openSession, current, answer} from './session.js';

export const LIMIT = 730;

export function readableIn(content, learner, tokens, today, {limit = LIMIT} = {}) {
  const states = {...(learner.states || {})};
  if (focusNeeds(content, states, tokens).done) return 0;
  const L = {states, settings: learner.settings || {},
             texts: [{id: 'forecast', title: '', tokens, focus: true}]};
  const rng = makeRng(1);
  for (let d = 0; d < limit; d++) {
    const s = openSession(content, L, today + d, rng);
    while (current(s)) answer(content, L, s, true);
    if (focusNeeds(content, states, tokens).done) return d + 1;
  }
  return null;
}
