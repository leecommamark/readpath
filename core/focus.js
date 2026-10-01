// focus.js — what the focus text still needs (plan 3, Phase 4).
//
// With a focus text set, all new items come from it, together with the parts
// they need, until every item in it is known; then the path resumes
// (decision 4; Mark, 2026-09-28). This file answers "what does it need":
//
//   * each character of each token maps to its MAIN reading item, or to a
//     secondary reading item when the token is a word whose jyutping names
//     that reading (銀行 -> 行 hong4; 行山 -> 行 haang4). A single-character
//     token has no word context, so it is the main reading;
//   * known readings (in Maintain) are dropped;
//   * each remaining reading brings its unmet prerequisites (a part not yet
//     unlocked, a main reading not yet known, and that main reading's own
//     parts), so text-driven learning keeps the path's prerequisites;
//   * the result is in path order, which puts every prerequisite first.
//
// Characters not on the 3,000-character path are listed, not learned.

import {readingId} from './content.js';
import {isKnown} from './state.js';
import {prereqMet} from './unlock.js';

// The reading item a character stands for in a token, or null (off the path).
export function readingItemFor(content, ch, jp) {
  const main = content.mainReading(ch);
  if (!main) return null;
  if (jp) {
    const id = readingId(ch, jp);
    if (content.has(id)) return id;
  }
  return main;
}

// Every character token of a text, in text order: [{ch, id, line, sent}], where
// id is its reading item (readingItemFor, with the word's jyutping when it
// has one syllable per character) or null off the path. coverage.js counts
// these; textReadings collects them.
export function charItems(content, tokens) {
  const out = [];
  for (const {form, jp, line, sent} of tokens) {
    const chars = Array.from(form);
    const jps = jp ? jp.split(' ') : [];
    const perChar = jps.length === chars.length;   // else no word context
    chars.forEach((ch, i) => {
      out.push({ch, id: readingItemFor(content, ch, perChar ? jps[i] : ''), line, sent});
    });
  }
  return out;
}

// The reading items a text uses, in path order, and the characters it uses
// that are not on the path, in text order.
export function textReadings(content, tokens) {
  const readings = new Set(), offPath = [];
  for (const {ch, id} of charItems(content, tokens)) {
    if (id) readings.add(id);
    else if (!offPath.includes(ch)) offPath.push(ch);
  }
  const byRank = [...readings].sort((a, b) => content.rank(a) - content.rank(b));
  return {readings: byRank, offPath};
}

// focusNeeds(content, states, tokens) ->
//   {items, readings, known, offPath, done}
//   items     what is still needed: unknown readings and their unmet
//             prerequisites, in path order (met-but-climbing items included;
//             the composer takes only the ones not met yet)
//   readings  every reading item the text uses, in path order
//   known     how many of them are known
//   done      every reading in the text is known: the path resumes
export function focusNeeds(content, states, tokens) {
  const {readings, offPath} = textReadings(content, tokens);
  const need = new Set();
  const add = id => {
    if (need.has(id)) return;
    need.add(id);
    for (const q of content.prereqs(id)) {
      if (!prereqMet(content, states, q)) add(q);
    }
  };
  let known = 0;
  for (const id of readings) {
    if (isKnown(states[id])) known++;
    else add(id);
  }
  const items = [...need].sort((a, b) => content.rank(a) - content.rank(b));
  return {items, readings, known, offPath, done: known === readings.length};
}
