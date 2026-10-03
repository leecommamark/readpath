// gloss.js — one rule for a gloss cut short (brief 7.8 decided 4; patch
// plan 7.8, Phase 2). The tree's tiles, Path's stones, the Reader's line
// under a word and Find's rows all show `shortGloss`; the reference card
// and the Reader's word panel show the gloss in full. Search matches on
// `firstPiece` (core/search.js), the same cut without the length.
//
// A gloss's pieces are split at `;` `/` `,` only outside brackets, so
// 著 "wear (clothes, shoes, etc.)" stays whole. A leading "(noun)"-style
// tag goes when a word follows it; 倍 "(two, three etc) -fold" keeps its.
// A first piece that is a bare grammar word or under 3 letters keeps the
// next piece (Mark, 7.8 P3): 在 "On, in", 咁 "so, such"; 掂 "OK, (of tasks)"
// stays "OK", its next piece a bracket.
//
// No length cut by default: the tree's tiles wrap to two lines and CSS
// clamps them, which fits more than any character count does (measured,
// 7.8 Phase 2: a 24-character cut put "…" on 135 glosses and still left 26
// needing three lines; the clamp alone leaves 120). What still doesn't fit
// is Mark's to reword (review/short_glosses.tsv, tools/short_glosses.js).
// A caller with one line passes `max` (the Reader: 18), and the cut is at
// a word boundary with "…".
//
// Pure: strings in, strings out.

const GRAMMAR = new Set(['a', 'an', 'the', 'of', 'to', 'in', 'on', 'at', 'by', 'for', 'with',
                         'from', 'and', 'or', 'not', 'as', 'so']);

// the pieces of `g` split at any of `seps`, outside brackets
function split(g, seps) {
  const out = [];
  let depth = 0, from = 0;
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    else if (!depth && seps.includes(c)) { out.push(g.slice(from, i)); from = i + 1; }
  }
  out.push(g.slice(from));
  return out.map(s => s.trim());
}

const untagged = g => (g || '').trim().replace(/^\([^)]*\)\s*(?=[\p{L}\p{N}])/u, '');

// The first sense in full: to the first `;` outside brackets (the tree's
// header, which has the room).
export function headSense(g) {
  return split((g || '').trim(), ';')[0];
}

// The first piece, without its tag: to the first `;` `/` or `,` outside
// brackets. What search matches against.
export function firstPiece(g) {
  return split(untagged(g), ';/,')[0];
}

// The first piece, kept with the next one after a grammar word (P3), cut
// at a word boundary past `max` when one is given.
export function shortGloss(g, max = Infinity) {
  const sense = split(untagged(g), ';/')[0];
  const pieces = split(sense, ',');
  let s = pieces[0];
  if (pieces.length > 1 && pieces[1] && !pieces[1].startsWith('(')
      && (s.length < 3 || GRAMMAR.has(s.toLowerCase()))) s = `${s}, ${pieces[1]}`;
  if (s.length <= max) return s;
  let cut = s.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  if (s[max - 1] !== ' ' && space > max / 2) cut = cut.slice(0, space);
  return `${cut.replace(/[\s,;:(-]+$/, '')}…`;
}
