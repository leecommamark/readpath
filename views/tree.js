// tree.js — a character's tree (patch plan 7.7, Phase 3; brief 7.7 decided
// 3-5 and 8). `#char/<form>`, opened from a tile on Path's screens or from
// a card's "Trace this character’s steps" (its tree).
//
// The header: the character's tile (it opens the card), gloss, readings,
// where it is on the path and its state, the parts in written order, and
// the sound line where it is three or more long. Then the tree, across, in
// a box of its own that scrolls sideways and opens centred on the
// character (core/tree.js lays it out); the lines say the relationship. A
// tap on any tile re-centres the tree there, and the breadcrumb goes back.
// Under it, the key and Learn this family next (the family study session).

import {h, han, put, clear, jpSpan} from './dom.js';
import {glyphTile, progressOf, stateItemOf} from './glyph.js';
import {treeLayout, soundLine} from '../core/tree.js';
import {familiesOf} from '../core/family.js';
import {stateOf} from './families.js';
import {headSense, shortGloss} from '../core/gloss.js';
import {formGloss, formJp, DICTIONARY_SENSE} from '../core/provenance.js';

const STATE_SAID = {known: 'known', learning: 'learning', ahead: 'not met yet'};

// the item a tile stands for: glyph.js's one rule
export const itemOfTile = stateItemOf;

// main reading > part > dictionary, with whether it is weak data (7.10:
// core/provenance.js; a muted gloss or reading, never a hidden one)
const jpOf = (content, form) => formJp(content, form).text;

// tileOf(content, states, form) -> {form, jp, over, gloss, sense, weak,
//                                   jpWeak, progress, state}
//   gloss: the short gloss under a tile (core/gloss.js); sense: the whole
//   first sense, for the header, which has the room (7.8 Phase 2)
//   over: the jyutping above the tile, known or not: in the tree it shows
//   the sound running through the parts (Mark, 7.7 3b), so it's the one
//   place jyutping isn't taken off what the learner knows
//   weak, jpWeak: the gloss or the reading is weak data, shown muted (7.10)
export function tileOf(content, states, form) {
  const it = itemOfTile(content, form);
  const state = it ? stateOf(states[it.id]) : null;
  const jp = formJp(content, form);
  const g = formGloss(content, form);
  return {form, jp: jp.text, over: jp.text, gloss: shortGloss(g.text), sense: headSense(g.text),
          weak: g.weak && !!g.text, jpWeak: jp.weak,
          progress: it ? progressOf(states[it.id], it.kind) : null, state};
}

// treeModel(content, states, form, {trail, expanded}) -> what renderTree draws
export function treeModel(content, states, form, {trail = [form], expanded = {}} = {}) {
  const it = itemOfTile(content, form);
  const fam = familiesOf(content);
  const sp = content.soundPartOf(form);
  const familyKey = fam.byKey.has(`f:${form}`) ? `f:${form}`
    : sp && fam.byKey.has(`f:${sp}`) ? `f:${sp}` : null;
  const parts = content.partsInOrder(form);
  const line = soundLine(form, content);
  const layout = treeLayout(form, content, expanded);
  const tiles = new Map();
  for (const c of layout.columns) for (const t of c.tiles) tiles.set(t.form, tileOf(content, states, t.form));
  const readings = content.readingsOf(form).filter(r => r.item)
    .sort((a, b) => b.primary - a.primary).map(r => r.jp);
  return {
    form, trail,
    head: tileOf(content, states, form),
    readings: readings.length ? readings : [jpOf(content, form)].filter(Boolean),
    rank: it ? content.rank(it.id) : null,
    state: it ? stateOf(states[it.id]) : null,
    written: parts.length > 1 ? {ordered: content.partsOrdered(form), parts} : null,
    soundLine: line.length >= 3 ? line.map(f => ({form: f, jp: jpOf(content, f)})) : null,
    familyKey, familyHead: familyKey && familyKey.slice(2),
    layout, tiles,
  };
}

// the line under the header: "#1,234 on the path · learning"
export const placeSaid = m => (m.rank == null ? 'Not on the path'
  : `#${m.rank.toLocaleString('en-GB')} on the path · ${STATE_SAID[m.state]}`);

export const KEY_LINES = [
  {cls: 'sound', text: 'gives the sound'},
  {cls: 'meaning', text: 'gives the meaning'},
  {cls: 'shape', text: 'only the shape'},
];
export const KEY_BORDERS = [
  {cls: 'square', text: 'sound part'},
  {cls: 'circle', text: 'meaning part'},
  {cls: 'solid', text: 'neither'},
];

// the tree's geometry, in px: a column's width and a row's height
// (DY: a two-line gloss under a tile is 95px tall, so rows keep the 13px
// gap a one-line row had; 7.8 Phase 2)
const DX = 76, DY = 108, PAD = 12;
const SVG = 'http://www.w3.org/2000/svg';

// renderTree(el, m, cb)   cb: onBack, onCrumb(i), onTree(form), onRef(form),
// onMore(level), onStudy(key) (none during a session: no button), kindOf(form)
export function renderTree(el, m, cb) {
  const kindOf = f => (cb.kindOf ? cb.kindOf(f) : null);
  const crumbs = m.trail.length > 1 && h('nav', {class: 'tree-crumbs', 'aria-label': 'Trees you came through'},
    ...m.trail.flatMap((f, i) => [
      i ? h('span', {class: 'tree-crumb-sep', 'aria-hidden': 'true'}, '›') : '',
      i === m.trail.length - 1
        ? han(f, {class: 'tree-crumb here', 'aria-current': 'page'})
        : h('button', {type: 'button', class: 'link tree-crumb', lang: 'zh-Hant-HK',
                       onclick: () => cb.onCrumb(i)}, f)]));
  const head = h('section', {class: 'block first'}, h('div', {class: 'tree-head'},
    glyphTile(m.form, kindOf(m.form), {size: 'lg', over: m.head.over, progress: m.head.progress,
                                       overWeak: m.head.jpWeak,
                                       label: `${m.form}: open its card`, onTap: f => cb.onRef(f)}),
    h('div', {class: 'tree-head-text'},
      h('h1', {id: 'tree-h', class: `tree-gloss${m.head.weak ? ' weak' : ''}`}, m.head.sense || han(m.form)),
      m.head.weak && h('p', {class: 'note weak-note'}, DICTIONARY_SENSE),
      h('p', {class: 'note'}, jpSpan(m.readings.join(' · ')),
        m.readings.length ? ' · ' : '', placeSaid(m)),
      // an order the IDS didn't give isn't claimed as written order (7.10)
      m.written && h('p', {class: 'note'}, m.written.ordered ? 'Written: ' : 'Parts (order not known): ',
        han(m.written.parts.join(' · '))),
      m.soundLine && h('p', {class: 'note tree-soundline'}, 'Sound line: ',
        ...m.soundLine.flatMap((s, i) => [i ? h('span', {class: 'tree-arrow', 'aria-hidden': 'true'}, ' ← ') : '',
                                           han(s.form), s.jp ? [' ', jpSpan(s.jp)] : ''])))));

  // ---- the tree: columns of tiles, the lines in one SVG behind them
  const {columns, edges, more} = m.layout;
  const rows = columns.flatMap(c => c.tiles.map(t => t.row));
  const moreRow = L => Math.max(...columns.find(c => c.level === L).tiles.map(t => t.row)) + 1;
  for (const L of Object.keys(more)) rows.push(moreRow(+L));
  const top = Math.min(...rows), bottom = Math.max(...rows);
  const width = columns.length * DX + 2 * PAD;
  const height = (bottom - top + 1) * DY + 2 * PAD;
  const xOf = i => PAD + i * DX + DX / 2;
  const yOf = r => PAD + (r - top) * DY + DY / 2;
  const svg = document.createElementNS(SVG, 'svg');
  for (const [k, v] of Object.entries({class: 'tree-edges', width, height, viewBox: `0 0 ${width} ${height}`,
                                       'aria-hidden': 'true'})) svg.setAttribute(k, String(v));
  const canvas = h('div', {class: 'tree-canvas', style: `width:${width}px;height:${height}px`}, svg);
  const nodes = new Map();
  columns.forEach((c, i) => {
    for (const t of c.tiles) {
      const x = m.tiles.get(t.form);
      const node = h('div', {class: `tree-node${t.form === m.form ? ' is-here' : ''}`,
                             style: `left:${xOf(i) - DX / 2}px;top:${yOf(t.row) - DY / 2}px;width:${DX}px;height:${DY}px`},
        glyphTile(t.form, kindOf(t.form), {
          size: 'md', over: x.over, progress: x.progress, overWeak: x.jpWeak,
          label: `${t.form}${x.jp ? ` ${x.jp}` : ''}${x.gloss ? `, ${x.gloss}` : ''}`
            + (t.form === m.form ? ': this tree' : ': its tree'),
          onTap: f => (f === m.form ? cb.onRef(f) : cb.onTree(f))}),
        h('span', {class: `tree-tile-gloss${x.weak ? ' weak' : ''}`}, x.gloss || ' '));
      nodes.set(t.form, node);
      canvas.append(node);
    }
    if (more[c.level]) {
      const {left} = more[c.level];
      canvas.append(h('button', {type: 'button', class: 'tree-more',
                                 style: `left:${xOf(i) - DX / 2 + 4}px;top:${yOf(moreRow(c.level)) - 18}px;width:${DX - 8}px`,
                                 onclick: () => cb.onMore(c.level)},
        `${Math.min(10, left)} more`, h('span', {class: 'tree-more-left'}, `${left} left`)));
    }
  });
  const scroller = h('div', {class: 'tree-scroll'}, canvas);
  const centre = columns.findIndex(c => c.level === 0);
  // the lines, once the tiles are where the browser put them: from the
  // right side of a part's glyph to the left side of what it builds
  const draw = () => {
    const box = canvas.getBoundingClientRect();
    const glyphAt = f => {
      const g = nodes.get(f) && nodes.get(f).querySelector('.gt');
      if (!g) return null;
      const r = g.getBoundingClientRect();
      return {l: r.left - box.left, r: r.right - box.left, y: r.top - box.top + r.height / 2};
    };
    for (const e of edges) {
      const a = glyphAt(e.from), b = glyphAt(e.to);
      if (!a || !b) continue;
      const x1 = a.r + 3, x2 = b.l - 3, mx = (x1 + x2) / 2;
      const p = document.createElementNS(SVG, 'path');
      p.setAttribute('d', `M${x1} ${a.y} C${mx} ${a.y} ${mx} ${b.y} ${x2} ${b.y}`);
      p.setAttribute('class', `te te-${e.role}${e.hot ? ' hot' : ''}`);
      svg.append(p);
    }
    scroller.scrollLeft = Math.max(0, xOf(centre) - scroller.clientWidth / 2);
  };

  const key = h('div', {class: 'note tree-key'},
    ...KEY_LINES.map(k => h('span', {class: 'tree-key-item'},
      h('span', {class: `tree-key-line te-${k.cls}`, 'aria-hidden': 'true'}), k.text)),
    ...KEY_BORDERS.map(k => h('span', {class: 'tree-key-item'},
      h('span', {class: `gk-${k.cls}`, 'aria-hidden': 'true'}), k.text)));
  const study = m.familyKey && cb.onStudy && h('div', {class: 'btns'},
    h('button', {type: 'button', class: 'btn', onclick: () => cb.onStudy(m.familyKey)},
      m.familyHead === m.form ? 'Learn this family next' : ['Learn ', han(m.familyHead), '’s family next']));

  put(clear(el),
    h('div', {class: 'top'},
      h('button', {type: 'button', class: 'link back-btn', onclick: cb.onBack}, '‹ Back'),
      h('span', {})),
    crumbs,
    head,
    h('figure', {class: 'tree-figure', 'aria-label':
      `${m.form}: its parts on the left, the characters built from it on the right`}, scroller),
    key,
    study);
  requestAnimationFrame(draw);
}
