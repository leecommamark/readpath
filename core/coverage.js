// coverage.js — how readable a text is (patch plan 5, Phase 2).
//
// Derived, never stored (decided 3): from the learner's states and the
// text's tokens, each time it's shown. A character token counts in the
// reading its word gives it (focus.charItems: 銀行 counts 行 hong4, 行山
// counts 行 haang4), and it is readable when that reading is known
// (Maintain). A character not on the path has no reading item: it is left
// out of both sides and listed instead (decided 10), so a text can reach
// 100% with names or rare characters still in it.
//
// coverage(content, states, tokens, {line}) ->
//   {pct, known, total, readings, toLearn, offPath}
//   pct       known / total as a whole percent, rounded DOWN, so 100% means
//             every counted token is readable; 100 when nothing counts
//   known, total   character tokens (occurrences), off-path ones excluded
//   readings  distinct reading items in the text
//   toLearn   distinct reading items not yet known
//   offPath   the characters not on the path, distinct, in text order
// `line`, if given, counts only tokens on those lines (a Set of line
// indexes): the Reader's "N% readable here" for a section.

import {charItems} from './focus.js';
import {isKnown} from './state.js';

export function coverage(content, states, tokens, {line = null} = {}) {
  const toks = line ? tokens.filter(t => line.has(t.line)) : tokens;
  let known = 0, total = 0;
  const readings = new Set(), unknown = new Set(), offPath = [];
  for (const {ch, id} of charItems(content, toks)) {
    if (!id) {
      if (!offPath.includes(ch)) offPath.push(ch);
      continue;
    }
    total++;
    readings.add(id);
    if (isKnown(states[id])) known++;
    else unknown.add(id);
  }
  const pct = total ? Math.floor((100 * known) / total) : 100;
  return {pct, known, total, readings: readings.size, toLearn: unknown.size, offPath};
}
