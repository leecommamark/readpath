// lines.js — a text as the Reader draws it (patch plan 5, Phase 1).
//
// A port of songpath's line model (songpath/static/js/analysis/assemble.js
// `linesOf`), checked against it by reader_data.test.js. Every line is
// trimmed; a run of blank lines becomes one {blank: true}, never leading or
// trailing; any other line is its parts in order: each CJK run segmented
// into words (segment.js), everything else, punctuation included, kept as
// text.
//
//   [{blank: true}
//    | {parts: [{type: 'word', form, jp, chars: [{char, src?}]}
//               | {type: 'text', text}]}]
//
// `jp` is the word's jyutping from `wordJp(form)` for a word of 2+
// characters, '' for a single character or an unknown word: the same rule as
// segment.tokenise, so tokensOf(lines) gives its tokens. A character's `src`
// is the form as written, present only where s2t changed it: the normalised
// text and the text as written split into the same shape, because
// normalisation is positional and never touches whitespace.

import {CJK_RUN_SOURCE, segment} from './segment.js';

const RUN = new RegExp(`(${CJK_RUN_SOURCE})`, 'u');
const IS_RUN = new RegExp(`^${CJK_RUN_SOURCE}$`, 'u');

// linesOf(text, srcText, lexicon, wordJp) -> lines (above). srcText is the
// text as written; pass `text` again when nothing was changed.
export function linesOf(text, srcText, lexicon, wordJp) {
  const lines = [];
  const a = text.split('\n'), b = srcText.split('\n');
  for (let n = 0; n < a.length; n++) {
    const line = a[n].trim();
    if (!line) {
      if (lines.length && !lines[lines.length - 1].blank) lines.push({blank: true});
      continue;
    }
    const srcCps = Array.from((b[n] === undefined ? '' : b[n]).trim());
    const parts = [];
    let i = 0;                             // code points into the line
    for (const piece of line.split(RUN)) {
      if (!piece) continue;
      if (!IS_RUN.test(piece)) {
        parts.push({type: 'text', text: piece});
        i += Array.from(piece).length;
        continue;
      }
      for (const form of segment(Array.from(piece), lexicon)) {
        const cps = Array.from(form);
        const chars = cps.map((char, k) => {
          const s = srcCps[i + k];
          return s !== undefined && s !== char ? {char, src: s} : {char};
        });
        parts.push({type: 'word', form,
                    jp: cps.length > 1 ? (wordJp(form) || '') : '', chars});
        i += cps.length;
      }
    }
    lines.push({parts});
  }
  while (lines.length && lines[lines.length - 1].blank) lines.pop();
  return lines;
}

// A line's sentences, as [from, to) part indexes: a text part with a
// sentence end (。！？；, or ! ? ;) closes one, closing quotes with it (呀？」).
// So does a space between two Chinese characters, which written Chinese
// never has unless it means a pause (a lyric's phrasing: Mark, 7.14); a
// space beside a Latin word (我用 iPhone 打字) doesn't. A lyric line without
// one is one sentence; a prose line is a paragraph of them.
const SENTENCE_END = /[。！？；!?;]/;
const PAUSE = /^\s+$/u;                   // the whole text part: words on both sides
export function sentenceSpans(parts) {
  const out = [];
  let from = 0;
  parts.forEach((p, k) => {
    if (p.type === 'text' && (SENTENCE_END.test(p.text) || PAUSE.test(p.text))) {
      out.push([from, k + 1]);
      from = k + 1;
    }
  });
  if (from < parts.length) out.push([from, parts.length]);
  return out;
}

// tokensOf(lines) -> [{form, jp, line, sent}]: the words, in text order, with
// the index of the line each is on and of the sentence within that line
// (rung 5's). focus.js and today.js read {form, jp}.
export function tokensOf(lines) {
  const out = [];
  lines.forEach((l, line) => {
    if (l.blank) return;
    sentenceSpans(l.parts).forEach(([from, to], sent) => {
      for (const p of l.parts.slice(from, to)) {
        if (p.type === 'word') out.push({form: p.form, jp: p.jp, line, sent});
      }
    });
  });
  return out;
}

// The words a text's lines need looked up: every form of 2+ characters,
// once each, in first-occurrence order (what dict.need fetches).
export function wordsOf(text, lexicon) {
  const seen = new Set();
  for (const raw of text.split('\n')) {
    for (const m of raw.trim().matchAll(new RegExp(CJK_RUN_SOURCE, 'gu'))) {
      for (const w of segment(Array.from(m[0]), lexicon)) {
        if (Array.from(w).length > 1) seen.add(w);
      }
    }
  }
  return [...seen];
}
