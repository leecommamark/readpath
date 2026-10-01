// sentences.js — rung 5's sentence, from the focus text (patch plan 5,
// Phase 5; brief 5 decided 9).
//
// A sentence of the focus text that has the character in the reading its
// word gives is the sentence question for that reading. A sentence is a line,
// or, in prose, where a line is a paragraph, the part of it up to 。！？；
// (core/lines.js sentenceSpans; a lyric line is one sentence). Only
// sentences of 4-30 characters qualify (a title like 飲茶 never does). The
// shortest wins; a tie goes to the one with fewer other characters the
// learner would see jyutping over (not known, or off the path), then to the
// earlier one (Mark, 2026-09-29, for lines; split into sentences in Phase 5,
// since prose_long.txt has no line of 30 characters or fewer and 197
// sentences that are). A reading with none falls back to rung 4, as before.
//
// Pure: the text's tokens (core/lines.js tokensOf, with `line` and `sent`) and the
// states in; it depends on the states only through that tie-break, so it is
// built afresh for each composition.

import {charItems} from './focus.js';
import {isKnown} from './state.js';

export const SENTENCE_MIN = 4;
export const SENTENCE_MAX = 30;

// sentenceIndex(content, states, text) -> Map<reading id, {text, line, sent}>
//   text: {id, tokens} (today.js's learner text); null gives an empty map
export function sentenceIndex(content, states, text) {
  const out = new Map();
  if (!text || !text.tokens) return out;
  const spans = new Map();                 // 'line:sent' -> {line, sent, chars}, text order
  for (const c of charItems(content, text.tokens)) {
    const key = `${c.line}:${c.sent || 0}`;
    if (!spans.has(key)) spans.set(key, {line: c.line, sent: c.sent || 0, chars: []});
    spans.get(key).chars.push(c);
  }
  const best = new Map();                  // id -> [length, unknown others, order, span]
  let order = 0;
  for (const span of spans.values()) {
    const at = order++;
    const n = span.chars.length;
    if (n < SENTENCE_MIN || n > SENTENCE_MAX) continue;
    const shows = c => !c.id || !isKnown(states[c.id]);
    const unknown = span.chars.filter(shows).length;
    for (const c of span.chars) {
      if (!c.id) continue;
      const cand = [n, unknown - (shows(c) ? 1 : 0), at, span];
      if (!best.has(c.id) || better(cand, best.get(c.id))) best.set(c.id, cand);
    }
  }
  for (const [id, [, , , span]] of best) out.set(id, {text: text.id, line: span.line, sent: span.sent});
  return out;
}

// shorter, then fewer unknown others, then earlier
function better([n, u, at], [n0, u0, at0]) {
  return n < n0 || (n === n0 && (u < u0 || (u === u0 && at < at0)));
}
