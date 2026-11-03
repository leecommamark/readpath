// markers.js — the trail markers (brief 7.29; DESIGN *Learner model*).
//
// Places on the walk, not grades (decided 2): 起步 at the start, then one
// each time the known characters' share of written Chinese crosses a
// milestone, to 一路睇. The table is curated/markers.tsv, placed on the path
// by the content export (content.markers). Derived, never stored (decided
// 5): a learner's marker is worked out from their states each time, so
// placement and Mark mode count (M2), and a lapse can move one back.
//
//   knownShare(content, states) -> per million: the summed written share of
//       the known characters (main reading in Maintain), Path's "about N%"
//   markerOf(content, share) -> the index of the last marker that share has
//       reached (0, 起步, for a fresh learner)
//   toNextMarker(content, states) -> {at, marker, next, more, share}
//       at, marker   the learner's marker, its index and row
//       next         the next marker's row, or null past the last
//       more         the fewest unknown characters, taken in path order,
//                    whose shares lift the known share to the next marker
//                    (M3); 0 past the last

import {isKnown} from './state.js';

export function knownShare(content, states) {
  let share = 0;
  for (const s of Object.values(states)) {
    if (!isKnown(s) || !content.has(s.item)) continue;
    const it = content.item(s.item);
    if (it.kind === 'reading' && it.primary) share += content.wshareOf(it.char) || 0;
  }
  return share;
}

const reached = (m, share) => share >= m.share * 10_000;

export function markerOf(content, share) {
  const ms = content.markers;
  let at = 0;
  while (at + 1 < ms.length && reached(ms[at + 1], share)) at++;
  return at;
}

export function toNextMarker(content, states) {
  const share = knownShare(content, states);
  const at = markerOf(content, share);
  const ms = content.markers;
  const next = ms[at + 1] || null;
  let more = 0;
  if (next) {
    let s = share;
    for (const id of content.path) {
      if (reached(next, s)) break;
      const it = content.item(id);
      if (it.kind !== 'reading' || !it.primary || isKnown(states[id])) continue;
      s += content.wshareOf(it.char) || 0;
      more++;
    }
  }
  return {at, marker: ms[at], next, more, share};
}

// markerVisit(record, at, today) -> {record, passed}: Today's "You passed 行開
// yesterday." (M4), once. `record` is readpath.meta.marker, view state and
// not learning state: {at, best, day, news, shown}
//   best    the furthest marker reached, so one lost to a lapse and passed
//           again is not news twice
//   news    the marker passed on `day`, said on a Today visit after that
//           day, on that visit's day only (`shown`), or null
// A fresh record says nothing: a learner placed past three markers on day
// one hears of none. `passed` is {at, yesterday} or null; the caller saves
// `record` when it differs from what it passed in.
export function markerVisit(record, at, today) {
  if (!record) return {record: {at, best: at, day: today, news: null, shown: null}, passed: null};
  let r = {...record, at};
  if (at > r.best) r = {...r, best: at, day: today, news: at, shown: null};
  if (r.news != null && r.shown != null && r.shown < today) r = {...r, news: null, shown: null};
  let passed = null;
  if (r.news != null && today > r.day) {
    if (r.shown == null) r = {...r, shown: today};
    passed = {at: r.news, yesterday: today - r.day === 1};
  }
  return {record: r, passed};
}

// The learner tapped the line away.
export const markerDismissed = record => ({...record, news: null, shown: null});
