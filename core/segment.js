// segment.js — split a text into words (plan 3, Phase 4).
//
// A port of songpath's segmenter (songpath/static/js/analysis/resources.js
// `A.segment`, util.js `CJK_RUN_SOURCE`), which mirrors analyse.py: every
// line trimmed, every CJK run split by greedy longest match against the
// lexicon (up to 6 characters), and anything unmatched as a single
// character. It iterates code points, so an astral character is never split.
//
// s2t is core/normalize.js (patch plan 5), and the Reader's line model,
// which keeps what this drops (punctuation, line breaks), is core/lines.js.
// A text is stored already normalised, so nothing here sees simplified text.
//
// The lexicon (a Set of words) and the word readings (a lookup) are passed
// in: core/ does no I/O, and in the browser they will come from the store.

export const MAX_WORD = 6;                 // analyse.py
export const CJK_RUN_SOURCE =
  '[\\u3400-\\u4dbf\\u4e00-\\u9fff\\u{20000}-\\u{2ffff}]+';

// A run of CJK characters, as an array of code points -> words.
export function segment(runCps, lexicon) {
  const out = [];
  let i = 0;
  while (i < runCps.length) {
    let hit = 0;
    for (let n = Math.min(MAX_WORD, runCps.length - i); n > 1; n--) {
      const w = runCps.slice(i, i + n).join('');
      if (lexicon.has(w)) { out.push(w); i += n; hit = n; break; }
    }
    if (!hit) { out.push(runCps[i]); i += 1; }
  }
  return out;
}

// tokenise(text, lexicon, wordJp) -> [{form, jp}]
//   Only the CJK tokens, in text order. `jp` is the word's jyutping, one
//   syllable per character, from `wordJp(form)`, for a word of 2+ characters;
//   '' for a single character (it has no word context) or an unknown word.
export function tokenise(text, lexicon, wordJp) {
  const tokens = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const re = new RegExp(CJK_RUN_SOURCE, 'gu');
    let m;
    while ((m = re.exec(line)) !== null) {
      for (const form of segment(Array.from(m[0]), lexicon)) {
        const jp = Array.from(form).length > 1 ? (wordJp(form) || '') : '';
        tokens.push({form, jp});
      }
    }
  }
  return tokens;
}
