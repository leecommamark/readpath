// glyph.js — one glyph, drawn as a tile that says what it is (patch plan
// 7.6, Phase 1; brief 7.6 decided 1 and 4, the mock-up's S2; the border
// alone says the role since 3b, Mark).
//
//   the border   a dotted square: a sound part of other characters; a
//                dotted circle: a meaning part; a solid square: neither (a
//                part only ever `form` doesn't count). A glyph with both
//                roles takes the one it plays in more characters, a tie to
//                sound (口: meaning in 134, sound in 3, a circle; 青: a
//                square). No mark says "a part you'll study": the border is
//                enough, and marks were too distracting (3b, Mark).
//   bound        a form never written alone (氵 辶 亻) follows the same rule
//                and keeps a grey tint and muted ink, so it still looks "not
//                a character"
//   the bar      learning state, along the bottom: none while ahead (the
//                ink and border faded), a mustard bar as long as the rung
//                while learning, full and jade once known. The tile is never
//                filled and the ink never takes a state's colour.
//
// glyphKind(), progressOf() and tileModel() are pure, so a test reads them
// without a DOM; glyphTile() draws tileModel(). Running text (the Reader's
// lines, words, In your texts, sentences) keeps its lighter treatment and
// never uses this.

import {h} from './dom.js';

export const SIZES = ['sm', 'md', 'lg', 'xl', 'xxl'];

// glyphKind(content, form) -> {shape: 'square' | 'circle', component, bound}
//   shape      a circle for a meaning part, else a square
//   component  true for a dotted border: a sound or meaning part
//   bound      never written alone: tinted
// A form the glyph table doesn't have (an off-path character) is a plain
// square.
export function glyphKind(content, form) {
  const g = content && content.glyph && content.glyph.get(form);
  const role = content && content.componentRole ? content.componentRole(form) : null;
  const bound = !!g && (!g.is_character || (g.bound !== null && g.bound !== undefined && g.bound !== ''));
  return {shape: role === 'meaning' ? 'circle' : 'square', component: !!role, bound};
}

const PLAIN = {shape: 'square', component: false, bound: false};

// progressOf(itemState, kind) -> {state: 'ahead' | 'learning' | 'known', fill}
//   kind 'reading' (rungs 2-5) or 'sound' / 'meaning' (a part: 2-3). Rung 1
//   is the Meet, which writes rung 2, so a reading's bar is (rung-1)/5 of
//   the tile (a stub just met, four fifths at rung 5) and a part's is
//   (rung-1)/3, its shorter ladder; Maintain is full.
export function progressOf(s, kind = 'reading') {
  if (!s) return {state: 'ahead', fill: 0};
  if (s.rung === 'M') return {state: 'known', fill: 1};
  const steps = kind === 'reading' ? 5 : 3;
  return {state: 'learning', fill: (s.rung - 1) / steps};
}

// tileModel(kind, {size, progress}) -> {classes, bar, outer}
//   what glyphTile draws, without a DOM: the tile's classes, the bar
//   ({state, fill}) or null, and the outer element's classes
export function tileModel(kind, {size = 'sm', progress = null} = {}) {
  const k = kind || PLAIN;
  const state = progress ? progress.state : null;
  const classes = ['gt', `gt-${k.shape}`, k.component ? 'gt-comp' : 'gt-solid', k.bound && 'gt-bound']
    .filter(Boolean);
  const bar = progress && progress.state !== 'ahead'
    ? {state: progress.state, fill: Math.max(0, Math.min(1, progress.fill))} : null;
  return {classes, bar,
          outer: ['glyph-tile', `gs-${size}`, state && `is-${state}`].filter(Boolean)};
}

// glyphTile(form, kind, opts) -> element
//   kind      glyphKind()'s result (or null: a plain character)
//   size      sm (lists, Built from) · md (an answer) · lg (Next up) ·
//             xl (a task's glyph) · xxl (the reference card's head)
//   onTap     makes it a button; `locked` keeps it from acting (a question's
//             glyph before it's answered, which would give the answer away)
//   over      its jyutping, above the tile, never below it (brief 7.6
//             decided 5): blank where it's known, and never on a question's
//             glyph
//   progress  progressOf()'s result: the bar, and ahead's fade
//   label     the aria-label; by default "清: open its reference card"
export function glyphTile(form, kind, {size = 'sm', onTap = null, locked = false, over = null,
                                       progress = null, label = null, cls = ''} = {}) {
  const m = tileModel(kind, {size, progress});
  const tile = h('span', {class: m.classes.join(' '), lang: 'zh-Hant-HK'},
    h('span', {class: 'gt-form'}, form),
    m.bar && h('span', {class: `gt-bar is-${m.bar.state}`, 'aria-hidden': 'true',
                        style: `--fill:${+m.bar.fill.toFixed(3)}`}));
  const parts = [over != null && h('span', {class: 'gt-over mono', lang: 'en'}, over || ' '), tile];
  const classes = [...m.outer, cls].filter(Boolean).join(' ');
  if (!onTap) return h('span', {class: classes}, ...parts);
  return h('button', {type: 'button', class: classes,
                      'aria-label': label || `${form}: open its reference card`,
                      onclick: () => { if (!locked || !locked()) onTap(form); }}, ...parts);
}

// The key (patch plan 7.6, Phase 2; the two borders since 3b): what the
// borders say, on Path and on a part's card. KEY is the wording, so a test
// reads it without a DOM; each sample is a small tile border.
export const KEY = [
  {sample: 'square', text: 'sound part'},
  {sample: 'circle', text: 'meaning part'},
];

export function glyphKey() {
  return h('p', {class: 'note glyph-key'},
    ...KEY.flatMap(({sample, text}, i) => [
      i ? h('span', {class: 'gk-sep', 'aria-hidden': 'true'}, '·') : '',
      h('span', {class: 'gk-item'}, h('span', {class: `gk-${sample}`, 'aria-hidden': 'true'}), text)]));
}
