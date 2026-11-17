// shapes.js — "How 又 looks in its characters" (brief 7.36): a part's
// members grouped by what they show of it, on the family page and the part
// card, sound parts and meaning parts alike.
//
// A sound family's rows are the export's (sound_part `shown`, Decided 14):
// the head as it is, then each member that others are shown through, by its
// own reading ("有 jau5: 有 郁 賄 宥"; Mark, 2026-11-17), then its shapes
// ("worn down to 𠂇: 右", "written another way, 佘"), then the head worn down
// inside a member ("worn down, in 舍"). A meaning part's rows are its full form and each squeezed form that
// tells as it ("squeezed, on the left: 扌"), each with the characters its
// card counts; 月 is its own part, so 肉's card has no 月 row. The block
// shows where there are two rows or more, or one that is not the head as it
// is (慈 滋 磁 孳 show 茲 written 兹). Wording: Decided 15-17.
//
// soundShapes(content, head) / meaningShapes(content, form)
//   -> {of, rows: [{tile, label, members, over}]} | null
//   label: text and ['han', form] pieces; over: each member's reading
// alsoWritten(content, form, kind) -> the Meet's line, pieces, or null
// shapeLinks(content, form) -> P8's lines; renderLinks(lines, cb)
// renderShapes(model, {onTap, kindOf}) -> the block

import {h, han, jpSpan} from './dom.js';
import {glyphTile} from './glyph.js';
import {shownForm, shapeHead} from '../core/shapehead.js';
import {familiesOf} from '../core/family.js';
import {meaningId} from '../core/content.js';
import {charJp} from './facts.js';

// a row's characters drawn at most, then "and N more" (扌 has 235)
export const ROW_SHOWN = 8;

const H = f => ['han', f];
const overOf = (content, chars) => Object.fromEntries(chars.slice(0, ROW_SHOWN).map(c => [c, charJp(content, c)]));

function soundLabel(content, g, shape) {
  if (g.kind === 'head') return [];
  // a member others show heads their row by its own reading (Mark,
  // 2026-11-17: 雷 leoi4: 雷 蕾 擂 鐳)
  if (g.kind === 'char') return [['jp', charJp(content, g.shape)]];
  if (g.kind === 'worn') return ['worn down to ', H(g.shape)];
  if (g.kind === 'variant') return ['written another way, ', H(g.shape)];
  if (g.kind === 'in') return ['worn down, in ', H(g.shape)];
  // via: the nearer part, and how it shows the head
  if (g.seen) return [H(g.shape), ', worn down to ', H(g.seen)];
  if (g.worn) return [H(g.shape), ' (', H(shape), ' worn down to ', H(g.worn), ')'];
  if (g.variant) return [H(g.shape), ' (', H(shape), ' written another way, ', H(g.variant), ')'];
  return [H(g.shape)];
}

export function soundShapes(content, head) {
  const rows = content.shownOf(head);
  if (!rows.length) return null;
  const shape = shownForm(head);
  return {of: shape, rows: rows.map(g => ({
    tile: g.kind === 'head' ? head : g.seen || g.shape,
    label: soundLabel(content, g, shape),
    members: g.members, over: overOf(content, g.members)}))};
}

// a meaning part's forms: the full form it tells as, and every meaning item
// telling as that form, each with its members (content.membersOf)
function meaningForms(content, form) {
  const full = content.onePart(form);
  const forms = [full];
  for (const id of content.path) {
    if (content.kind(id) !== 'meaning') continue;
    const p = content.item(id).part;
    if (p !== full && content.onePart(p) === full) forms.push(p);
  }
  const membersOf = f => (content.has(meaningId(f))
    ? content.membersOf(meaningId(f)).map(r => content.item(r).char) : []);
  return {full, rows: forms.map(f => ({form: f, members: membersOf(f)})).filter(r => r.members.length)};
}

export function meaningShapes(content, form) {
  const {full, rows} = meaningForms(content, form);
  if (rows.length < 2) return null;
  return {of: full, rows: rows.map(r => {
    const w = r.form !== full && content.item(meaningId(r.form)).written;
    return {tile: r.form, members: r.members, over: overOf(content, r.members),
            label: r.form === full ? [] : [`squeezed${w ? `, ${w}` : ''}: `, H(r.form)]};
  })};
}

// The Meet's one line (Decided 17): "Also written 𠂇 (有 右)." -- a sound
// part's shapes, a full meaning form's squeezed forms ("Also written 扌, on
// the left (打 把)."); at most two, two members each, in path order. A
// squeezed form keeps its standsLine, so gets none here.
export function alsoWritten(content, form, kind) {
  let shapes;
  if (kind === 'sound') {
    // a shape's characters, those heading rows of their own too (有 shows
    // 𠂇 and heads 郁 賄 宥: "Also written 𠂇 (有 右)."), in path order
    const by = new Map();
    for (const g of content.shownOf(form)) {
      const shape = g.kind === 'worn' || g.kind === 'variant' ? g.shape
        : g.kind === 'char' ? g.worn || g.variant : null;
      if (!shape) continue;
      if (!by.has(shape)) by.set(shape, []);
      by.get(shape).push(...(g.kind === 'char' ? [g.shape] : g.members));
    }
    const rank = c => content.rank(content.mainReading(c));
    shapes = [...by].map(([shape, ms]) => ({shape, where: null, members: ms.sort((a, b) => rank(a) - rank(b))}))
      .sort((a, b) => rank(a.members[0]) - rank(b.members[0]));
  } else {
    const {full, rows} = meaningForms(content, form);
    if (full !== form) return null;
    shapes = rows.filter(r => r.form !== full)
      .map(r => ({shape: r.form, where: content.item(meaningId(r.form)).written, members: r.members}));
  }
  shapes = shapes.slice(0, 2);
  if (!shapes.length) return null;
  const out = ['Also written '];
  shapes.forEach((s, i) => {
    if (i) out.push(' and ');
    out.push(H(s.shape));
    if (s.where) out.push(`, ${s.where}`);
    const ex = s.members.slice(0, 2);
    out.push(' (');
    ex.forEach((c, j) => out.push(...(j ? [' ', H(c)] : [H(c)])));
    out.push(')');
  });
  out.push('.');
  return out;
}

export const piecesText = ps => ps.map(x => (!Array.isArray(x) ? x : x[0] === 'jp' ? x[1] : shownForm(x[1]))).join('');
const pieces = ps => ps.map(x => (!Array.isArray(x) ? x : x[0] === 'jp' ? jpSpan(x[1]) : han(shownForm(x[1]))));
export const renderPieces = pieces;

export function renderShapes(m, {onTap = null, kindOf = null} = {}) {
  if (!m) return null;
  const tile = (f, size, over = null) => glyphTile(f, kindOf ? kindOf(f) : null, {size, onTap, over});
  return h('section', {class: 'block shapes'},
    h('h2', {class: 'shapes-h'}, 'How ', han(m.of), ' looks in its characters'),
    ...m.rows.map(r => h('div', {class: 'shapes-row'},
      h('div', {class: 'shapes-what'}, tile(r.tile, 'md'),
        r.label.length > 0 && h('span', {class: 'note shapes-label'}, ...pieces(r.label))),
      h('div', {class: 'shapes-members'},
        ...r.members.slice(0, ROW_SHOWN).map(c => tile(c, 'sm', (r.over || {})[c] || '')),
        r.members.length > ROW_SHOWN && h('span', {class: 'sm'}, ` and ${r.members.length - ROW_SHOWN} more`)))));
}

// The links between a shape and its shape heads (P8, Decided 20), on the
// page and the card at each end: "余 also heads a se series: 舍 捨 啥 斜 佘
// 賒 ›" and "A branch of 余's family: 余 read se, the reading 佘 keeps ›";
// "女 also heads an on series: 安 ›". Only where the shape heads a family of
// its own ([殳 jik] [享 deon] [廿口夫 naan] get none). Each link goes to the
// family page, or the part card where there is none.
// shapeLinks(content, form) -> [{pieces, family?: key, ref?: form}]
export function shapeLinks(content, form) {
  const fam = familiesOf(content);
  const to = f => (fam.byKey.has(`f:${f}`) ? {family: `f:${f}`} : {ref: f});
  const an = name => (/^[aeiou]/.test(name) ? 'an' : 'a');
  const out = [];
  const sh = shapeHead(form);
  if (sh && fam.byKey.has(`f:${sh.shape}`)) {
    // the member that is the shape written another way, and kept the reading
    const keeper = content.shownOf(form).find(g => g.kind === 'variant' && g.members.includes(g.shape));
    out.push({pieces: ['A branch of ', H(sh.shape), '’s family: ', H(sh.shape), ` read ${sh.name}`,
                       ...(keeper ? [', the reading ', H(keeper.shape), ' keeps'] : []), ' ›'],
              ...to(sh.shape)});
  }
  if (!sh && fam.byKey.has(`f:${form}`)) {
    for (const s of content.shapeHeadsOn(form)) {
      const name = shapeHead(s).name;
      const ms = content.familyMembers(s);
      out.push({pieces: [H(form), ` also heads ${an(name)} ${name} series: `,
                         ...ms.flatMap((c, i) => (i ? [' ', H(c)] : [H(c)])), ' ›'], ...to(s)});
    }
  }
  return out;
}

// renderLinks(links, {onFamily, onRef}): one line each, a tap to the other end
export function renderLinks(links, {onFamily = null, onRef = null} = {}) {
  return links.map(l => {
    const go = l.family ? onFamily && (() => onFamily(l.family)) : onRef && (() => onRef(l.ref));
    return go
      ? h('p', {class: 'shape-link'}, h('button', {type: 'button', class: 'link', onclick: go}, ...pieces(l.pieces)))
      : h('p', {class: 'note shape-link'}, ...pieces(l.pieces.filter(x => x !== ' ›')));
  });
}
