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
//   its colour   learning state, said by the same border (brief 7.7
//                decided 7; it replaced 7.6's bar): grey while ahead (the
//                ink faded too), mustard from the top centre clockwise as
//                far as the rung over a grey track while learning, jade all
//                round once known, plain ink where there is no state. A
//                dotted border stays dotted in every colour. The tile is
//                never filled (a bound form's tint aside) and the ink never
//                takes a state's colour.
//
// The border is a small SVG the size of the glyph's box, because CSS can't
// stop a dotted border part way: ringModel() says what it draws.
//
// glyphKind(), progressOf(), tileModel() and ringModel() are pure, so a
// test reads them without a DOM; glyphTile() draws them. Running text (the Reader's
// lines, words, In your texts, sentences) keeps its lighter treatment and
// never uses this.

import {h} from './dom.js';
import {soundId, meaningId} from '../core/content.js';

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

// The item a lone glyph's state comes from: its own part item if it has
// one (青 the sound part), else its main reading; null where it is neither
// (off the path, a part's part). One rule for every tile that shows a state
// (patch plan 7.7: the tree, Path; since Mark's ruling after 7.7, every
// tile but a question's).
export function stateItemOf(content, form) {
  for (const [make, kind] of [[soundId, 'sound'], [meaningId, 'meaning']]) {
    if (content.has(make(form))) return {id: make(form), kind};
  }
  const r = content.mainReading(form);
  return r ? {id: r, kind: 'reading'} : null;
}

// tileProgress(content, states, form) -> progressOf()'s result, or null
// (plain ink) where the form has no item
export function tileProgress(content, states, form) {
  const it = stateItemOf(content, form);
  return it ? progressOf(states[it.id], it.kind) : null;
}

// tileModel(kind, {size, progress}) -> {classes, border, outer}
//   what glyphTile draws, without a DOM: the tile's classes, the border
//   ({shape, dotted, state, fill}: state 'plain' where no progress is given,
//   fill the share drawn in the state's colour, 1 but while learning), and
//   the outer element's classes
export function tileModel(kind, {size = 'sm', progress = null} = {}) {
  const k = kind || PLAIN;
  const state = progress ? progress.state : null;
  const classes = ['gt', `gt-${k.shape}`, k.component ? 'gt-comp' : 'gt-solid', k.bound && 'gt-bound']
    .filter(Boolean);
  const border = {shape: k.shape, dotted: !!k.component, state: state || 'plain',
                  fill: state === 'learning' ? Math.max(0, Math.min(1, progress.fill)) : 1};
  return {classes, border,
          outer: ['glyph-tile', `gs-${size}`, state && `is-${state}`].filter(Boolean)};
}

// The ring per size: the glyph's font size in px (app.css's --g-*), and in
// screen px the solid line, the dot's diameter and the distance between dots.
export const RING = {
  sm: {px: 24, line: 1.25, dot: 2.25, pitch: 4},
  md: {px: 34, line: 1.5, dot: 2.6, pitch: 4.75},
  lg: {px: 46, line: 1.75, dot: 3, pitch: 5.5},
  xl: {px: 68, line: 2, dot: 3.4, pitch: 6.5},
  xxl: {px: 84, line: 2.25, dot: 3.8, pitch: 7.5},
};
const EDGE = 1.42;                        // the tile's edge, in ems (app.css .gt)
// The outline, in a 100 x 100 box: a rounded square (its corner the .16em
// of the old CSS border) or a circle, read from the top centre clockwise.
const INSET = 3, CORNER = 12, RADIUS = 47;
const SIDE = 100 - 2 * INSET - 2 * CORNER;                  // a straight side
const ARC = Math.PI * CORNER / 2;                           // a corner
const PERIMETER = {square: 4 * SIDE + 4 * ARC, circle: 2 * Math.PI * RADIUS};
const PATHS = {
  square: `M50 ${INSET} H${100 - INSET - CORNER} A${CORNER} ${CORNER} 0 0 1 ${100 - INSET} ${INSET + CORNER} `
        + `V${100 - INSET - CORNER} A${CORNER} ${CORNER} 0 0 1 ${100 - INSET - CORNER} ${100 - INSET} `
        + `H${INSET + CORNER} A${CORNER} ${CORNER} 0 0 1 ${INSET} ${100 - INSET - CORNER} `
        + `V${INSET + CORNER} A${CORNER} ${CORNER} 0 0 1 ${INSET + CORNER} ${INSET} Z`,
  circle: `M50 ${50 - RADIUS} A${RADIUS} ${RADIUS} 0 1 1 50 ${50 + RADIUS} A${RADIUS} ${RADIUS} 0 1 1 50 ${50 - RADIUS} Z`,
};
const MIN_FILL = .04;                     // a just-met item still shows a stroke

// the point `t` (0-1) of the way round the outline, from the top centre
export function pointAt(shape, t) {
  const u = ((t % 1) + 1) % 1;
  if (shape === 'circle') {
    const a = u * 2 * Math.PI;
    return [50 + RADIUS * Math.sin(a), 50 - RADIUS * Math.cos(a)];
  }
  // the square from the top centre: half a side, then corner, side, ...
  let d = u * PERIMETER.square;
  const half = SIDE / 2;
  const lo = INSET + CORNER, hi = 100 - INSET - CORNER;
  const corner = (cx, cy, from, len) => {
    const a = from + (len / ARC) * Math.PI / 2;
    return [cx + CORNER * Math.sin(a), cy - CORNER * Math.cos(a)];
  };
  const legs = [
    [half, l => [50 + l, INSET]],
    [ARC, l => corner(hi, lo, 0, l)],
    [SIDE, l => [100 - INSET, lo + l]],
    [ARC, l => corner(hi, hi, Math.PI / 2, l)],
    [SIDE, l => [hi - l, 100 - INSET]],
    [ARC, l => corner(lo, hi, Math.PI, l)],
    [SIDE, l => [INSET, hi - l]],
    [ARC, l => corner(lo, lo, 3 * Math.PI / 2, l)],
    [half, l => [lo + l, INSET]],
  ];
  for (const [len, at] of legs) {
    if (d <= len) return at(d);
    d -= len;
  }
  return [50, INSET];
}

const round = v => +v.toFixed(2);

// ringModel(border, size) -> {d, width, line: [{cls, dash}]} | {r, dots: [{x, y, cls}]}
//   what the border draws, in the 100 x 100 box, in that box's own units
//   (no pathLength, no non-scaling stroke: Safari drew both differently).
//   A solid border is the outline, whole or a dash as far as the rung over
//   a whole track; a dotted one is round dots, evenly spaced from the top
//   centre, the first ones the value's colour as far as the rung.
export function ringModel(border, size = 'sm') {
  const r = RING[size] || RING.sm;
  const {shape, dotted, state, fill} = border;
  const unit = 100 / (r.px * EDGE);                        // box units per screen px
  const upto = state === 'learning' ? Math.max(MIN_FILL, fill) : 1;
  if (!dotted) {
    const total = PERIMETER[shape];
    const line = state === 'learning'
      ? [{cls: 'track', dash: null}, {cls: 'value', dash: `${round(upto * total)} ${round(total * 2)}`}]
      : [{cls: state, dash: null}];
    return {d: PATHS[shape], width: round(r.line * unit), line};
  }
  const n = Math.max(8, Math.round(PERIMETER[shape] / unit / r.pitch));
  const lit = state === 'learning' ? Math.floor(upto * n + 1e-9) || 1 : n;
  const dots = [];
  for (let i = 0; i < n; i++) {
    const [x, y] = pointAt(shape, i / n);
    dots.push({x: round(x), y: round(y), cls: i < lit ? (state === 'learning' ? 'value' : state) : 'track'});
  }
  return {r: round(r.dot * unit / 2), dots};
}

const SVG = 'http://www.w3.org/2000/svg';
function ring(border, size) {
  const m = ringModel(border, size);
  const el = (tag, attrs) => {
    const e = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, String(v));
    return e;
  };
  const svg = el('svg', {class: 'gt-ring', viewBox: '0 0 100 100', 'aria-hidden': 'true',
                         focusable: 'false'});
  if (m.dots) {
    for (const d of m.dots) svg.append(el('circle', {cx: d.x, cy: d.y, r: m.r, class: `gr-${d.cls}`}));
  } else {
    for (const l of m.line) {
      svg.append(el('path', {d: m.d, class: `gr-${l.cls}`, 'stroke-width': m.width,
                             'stroke-dasharray': l.dash}));
    }
  }
  return svg;
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
//   progress  progressOf()'s result: the border's colour, and ahead's fade
//   label     the aria-label; by default "清: open its reference card"
export function glyphTile(form, kind, {size = 'sm', onTap = null, locked = false, over = null,
                                       progress = null, label = null, cls = ''} = {}) {
  const m = tileModel(kind, {size, progress});
  const tile = h('span', {class: m.classes.join(' '), lang: 'zh-Hant-HK'},
    ring(m.border, size), h('span', {class: 'gt-form'}, form));
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
