// jobs.js — "How 土 is used" and where a sound branches (patch plan 7.37):
// on the family page and the card's As a part, under the role bar.
//
// The block (Decided 10-14, 24-28, 31): one branch per job the part has, in
// the role bar's order -- For its sound (N) · For its meaning (N) · In
// characters with no sound part (N) · For its shape only (N) -- from core
// partJobs, so its counts are the bar's. Each branch's characters sit in rows
// by where the part is in them ("on the left": 地 埋 場 ...), the row with
// the most first, a use nothing places next with no mark (Decided 7), then a
// row for each part a use comes through ("through 䩻": 霸), unplaced and
// outside the patterns; path order, the first ROW_SHOWN and "+ N more" that
// opens the row in place.
//   * a sound or meaning branch of RARE_SHARE of the uses or less, of
//     RARE_MIN or more, is "Rarely for its sound (3)": "Only 3 of the 34
//     characters with 食 use it for its sound." (Decided 27)
//   * the no-sound-part branch: "Here 土 may carry meaning or be part of a
//     picture." (Decided 24)
//   * a sound or meaning branch of 5+ direct uses says the pattern its places
//     make, the fewest (one or two) holding 80%+ of them: "Usually on the
//     left or below (75 of 77)." (Decided 11); a sound branch with none,
//     "Its sound part moves: on the right 14 · on top 3 · ...".
//   * where the sound and meaning patterns share no place, one line above
//     the branches (Decided 12): "土 usually gives its meaning on the left
//     or below, and its sound on the right."
//   * a part with one job, one line: "尚 is always used for its sound (29
//     characters)." (Decided 28)
//   * on the family page the sound branch holds How characters with 土 are
//     read in place of tiles (`soundBody`; Decided 14, 31).
//
// How 口's shapes connect across its sound family (Decided 29, 33, 34;
// sound_part `from`): a small tree in the For its sound branch, of the
// page's own family (a fold's card: its head's) -- the head (于 jyu4, "You'll
// meet it only as a part" for 弋), and above it, a dashed line down from
// it, the family it comes from (尚 under 向, "the sound shifts here (h-
// becomes s-), its own family"; Mark, 2026-11-18); solid, each part its
// members join through, "口 worn down to 厶" where it is (勾: 鈎; 䩻: 霸 under
// it, then 壩 under 霸); dashed, each head branching off into a family of
// its own, "same sound, its own family" or "the sound shifts here (j-
// becomes w-, -yu becomes -un), ...", "On its own jyun4" where it is taught
// another reading, up to TREE_TILES of its members and "+ N more" opening
// the rest in place; the page's own node marked.
//
// jobsModel(content, form, {tiles}) -> {of, differ, branches} | {of, one, job} | null
// treeModel(content, form) -> {here, of, up, root, folds, branches} | null
// renderJobs(model, {onTap, kindOf, soundBody})
// renderTree(model, cb)   cb: {onFamily, onRef, kindOf}

import {h, han, jpSpan} from './dom.js';
import {glyphTile} from './glyph.js';
import {shownForm} from '../core/shapehead.js';
import {partJobs, splitSyl} from '../core/soundfamily.js';
import {familiesOf} from '../core/family.js';
import {charJp} from './facts.js';
import {ROW_SHOWN} from './shapes.js';

export const PLACE_SAID = {left: 'on the left', right: 'on the right', top: 'on top', bottom: 'below',
                           middle: 'in the middle', outside: 'around the outside', inside: 'inside',
                           across: 'across it'};
const PLACES = Object.keys(PLACE_SAID);
const JOBS = [['sound', 'For its sound'], ['meaning', 'For its meaning'],
              ['nosound', 'In characters with no sound part'], ['form', 'For its shape only']];
// a pattern: a branch of USUAL_MIN uses or more, its fewest places (one or
// two) holding USUAL_SHARE of them (Decided 11)
export const USUAL_MIN = 5;
export const USUAL_SHARE = 0.8;
// a rare branch: a sound or meaning branch of RARE_SHARE of a part's uses or
// less, where it has RARE_MIN or more (Decided 27: 食, 3 of 34)
export const RARE_MIN = 10;
export const RARE_SHARE = 0.1;

const byPlace = xs => {
  const n = new Map();
  for (const x of xs) if (x.where) n.set(x.where, (n.get(x.where) || 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1] || PLACES.indexOf(a[0]) - PLACES.indexOf(b[0]));
};

// {places, count, of} | null
export function usually(xs) {
  if (xs.length < USUAL_MIN) return null;
  const counts = byPlace(xs);
  for (const k of [1, 2]) {
    const top = counts.slice(0, k);
    const count = top.reduce((t, [, c]) => t + c, 0);
    if (top.length === k && count >= USUAL_SHARE * xs.length) return {places: top.map(([w]) => w), count, of: xs.length};
  }
  return null;
}

const saidPlaces = ws => ws.map(w => PLACE_SAID[w]).join(' or ');

export function jobsModel(content, form, {tiles = true} = {}) {
  const jobs = partJobs(content, form);
  const have = JOBS.filter(([k]) => jobs[k].length);
  if (!have.length) return null;
  const of = shownForm(form);
  if (have.length === 1) return {of, one: oneSaid(of, have[0][0], jobs[have[0][0]].length), job: have[0][0], branches: []};
  const total = have.reduce((n, [k]) => n + jobs[k].length, 0);
  // a use through another part claims no place and counts in no pattern
  // (Decided 25: 馬 is worn to 月 in 霸)
  const direct = xs => xs.filter(x => !x.through);
  const pat = {sound: usually(direct(jobs.sound)), meaning: usually(jobs.meaning)};
  const differ = pat.sound && pat.meaning && !pat.sound.places.some(w => pat.meaning.places.includes(w))
    ? `${of} usually gives its meaning ${saidPlaces(pat.meaning.places)}, and its sound ${saidPlaces(pat.sound.places)}.`
    : null;
  const branches = have.map(([job, title]) => {
    const xs = jobs[job];
    const rare = (job === 'sound' || job === 'meaning') && total >= RARE_MIN && xs.length <= RARE_SHARE * total;
    const lines = [];
    if (rare) lines.push(`Only ${xs.length} of the ${total.toLocaleString('en-GB')} characters with ${of} use it for its ${job}.`);
    if (job === 'nosound') lines.push(`Here ${of} may carry meaning or be part of a picture.`);
    let line = null;
    if (pat[job]) {
      line = `Usually ${saidPlaces(pat[job].places)} (${pat[job].count} of ${pat[job].of}).`;
    } else if (job === 'sound' && direct(xs).length >= USUAL_MIN && byPlace(xs).length >= 2) {
      line = `Its sound part moves: ${byPlace(xs).map(([w, c]) => `${PLACE_SAID[w]} ${c}`).join(' · ')}.`;
    }
    const rows = new Map(), through = new Map();
    for (const x of xs) {
      const by = x.through ? through : rows, k = x.through || x.where;
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(x.char);
    }
    const ordered = [...rows].sort((a, b) => (a[0] === '') - (b[0] === '') || b[1].length - a[1].length
      || PLACES.indexOf(a[0]) - PLACES.indexOf(b[0]));
    const row = (where, said, chars) => ({where, said, members: chars,
                                          over: Object.fromEntries(chars.map(c => [c, charJp(content, c)]))});
    if (line) lines.push(line);
    return {job, title: `${rare ? title.replace('For', 'Rarely for') : title} (${xs.length.toLocaleString('en-GB')})`, lines,
            rows: job === 'sound' && !tiles ? []
              : [...ordered.map(([where, chars]) => row(where, PLACE_SAID[where] || '', chars)),
                 ...[...through].map(([via, chars]) => ({...row('', `through ${shownForm(via)}`, chars), via}))]};
  });
  return {of, differ, branches};
}

// a part with one job says so where the block would be (Decided 28)
function oneSaid(of, job, n) {
  const c = n.toLocaleString('en-GB');
  if (n === 1) {
    return {sound: `${of} is used once, for its sound.`, meaning: `${of} is used once, for its meaning.`,
            nosound: `${of} is used once, in a character with no sound part.`,
            form: `${of} is used once, as part of the shape.`}[job];
  }
  return {sound: `${of} is always used for its sound (${c} characters).`,
          meaning: `${of} is always used for its meaning (${c} characters).`,
          nosound: `${of} appears only in characters with no sound part (${c}).`,
          form: `${of} is only ever part of the shape (${c}).`}[job];
}

// "h- becomes s-, -eng becomes -ing": what changes from the part's reading
// to the head's, tone aside
export function shiftSaid(from, to) {
  const a = splitSyl(from), b = splitSyl(to);
  if (!a || !b) return null;
  const out = [];
  if (a.onset !== b.onset) {
    out.push(!b.onset ? `${a.onset}- drops` : !a.onset ? `${b.onset}- comes in` : `${a.onset}- becomes ${b.onset}-`);
  }
  if (a.rime !== b.rime) out.push(`-${a.rime} becomes -${b.rime}`);
  return out.join(', ');
}

// the tree's one level: the parent, then each head branching off it
const TREE_TILES = 4;
export function treeModel(content, form) {
  const fam = familiesOf(content);
  const to = f => (fam.byKey.has(`f:${f}`) ? {family: `f:${f}`} : {ref: f});
  // the tree is the page's own family's (Mark, 2026-11-18: 尚's page shows
  // 尚's, 向 above it as where it comes from); a fold's card, its head's
  const root = content.familyHead(form) || form;
  const f = content.fromOf(root);
  // nodes by their own rank on the path, a part off it last (Mark,
  // 2026-11-18: 尚: 當 常 堂 賞 嘗 ..., not by where their first member falls)
  const byRank = (a, b) => content.charRank(a) - content.charRank(b) || (a < b ? -1 : 1);
  const kids = [...content.branchesOf(root)].sort(byRank);
  // the parts its members join through (后: 垢 詬 逅; Decided 33)
  const via = new Map();
  for (const c of content.familyMembers(root)) {
    const p = content.soundPartOf(c);
    if (!p || p === root) continue;
    if (!via.has(p)) via.set(p, []);
    via.get(p).push(c);
  }
  if (!f && !kids.length && !via.size) return null;
  const n = c => content.familyMembers(c).length;
  const offPath = c => !Number.isFinite(content.charRank(c));
  const tilesOf = ms => ({tiles: ms, over: Object.fromEntries(ms.map(x => [x, charJp(content, x)]))});
  // where the head is worn down in the part (勾: 口 written 厶; 䩻: 馬 as
  // 月, Decided 34)
  const written = c => (content.partsOf(c).find(x => x.role === 'sound' && x.part === root) || {}).written
    || content.foldWritten(c);
  // how a head's sound stands to the family it comes from
  const fromSaid = (k, jp) => (k.kind === 'same'
    ? `same sound${jp === k.jp ? '' : ', apart from the tone'}, its own family`
    : `the sound shifts here (${shiftSaid(k.jp, jp)}), its own family`);
  const rjp = content.partReading(root);
  return {
    here: form, of: root,
    up: f && {form: f.part, jp: content.partReading(f.part) || f.jp, own: content.ownReading(f.part),
              n: n(f.part), offPath: offPath(f.part), ...to(f.part)},
    // its own characters too, those taking the sound from it straight, not
    // the heads with nodes of their own (Mark, 2026-11-18: 口 口 扣 叩 釦 ...,
    // not 勾 后 句)
    root: {form: root, jp: rjp, own: content.ownReading(root), n: n(root), offPath: offPath(root),
           said: f ? [fromSaid(f, rjp)] : [], ...to(root),
           ...tilesOf(content.familyMembers(root).filter(c => content.soundPartOf(c) === root
                                                          && !via.has(c) && !kids.includes(c)))},
    folds: nest([...via].sort((a, b) => byRank(a[0], b[0])).map(([v, ms]) => ({form: v, jp: content.partReading(v) || charJp(content, v),
                                            said: written(v) ? [['han', root], ' worn down to ', ['han', written(v)]] : [],
                                            ...tilesOf(ms), ...to(v), folds: []}))),
    branches: kids.map(c => {
      const jp = content.partReading(c), ms = content.familyMembers(c);
      return {form: c, jp, own: content.ownReading(c), said: [fromSaid(content.fromOf(c), jp)], n: ms.length,
              ...tilesOf(ms), ...to(c)};
    })};
}

// a fold reached through another sits under it, out of its tiles (馬: 䩻's
// 霸, then 霸's 壩)
function nest(nodes) {
  const top = [];
  for (const x of nodes) {
    const up = nodes.find(u => u !== x && u.tiles.includes(x.form));
    if (!up) { top.push(x); continue; }
    up.tiles = up.tiles.filter(c => c !== x.form);
    up.folds.push(x);
  }
  return top;
}

// a place, drawn as the slot shaded in a square; nothing where unplaced
const placeMark = where => h('span', {class: `pm${where ? ` pm-${where}` : ''}`, 'aria-hidden': 'true'});

// whether the model has a sound branch (or is one sound job) to hold a body
export const soundHolds = m => !!m && (m.one ? m.job === 'sound' : m.branches.some(b => b.job === 'sound'));

// soundBody: what the sound branch holds below its line (the family page's
// How characters with 土 are read; Decided 31), or under a one-job line
export function renderJobs(m, {onTap = null, kindOf = null, soundBody = null} = {}) {
  if (!m) return null;
  if (m.one) {
    return h('section', {class: 'block jobs'},
      h('h2', {class: 'jobs-h'}, 'How ', han(m.of), ' is used'),
      h('p', {class: 'note jobs-line'}, m.one),
      m.job === 'sound' && soundBody);
  }
  const tile = (c, over) => glyphTile(c, kindOf ? kindOf(c) : null, {size: 'sm', onTap, over});
  const row = r => {
    const members = h('div', {class: 'jobs-members'}, ...r.members.slice(0, ROW_SHOWN).map(c => tile(c, r.over[c] || '')));
    if (r.members.length > ROW_SHOWN) {
      const more = h('button', {type: 'button', class: 'link sm', onclick: () => {
        more.remove();
        members.append(...r.members.slice(ROW_SHOWN).map(c => tile(c, r.over[c] || '')));
      }}, `+ ${r.members.length - ROW_SHOWN} more`);
      members.append(more);
    }
    return h('div', {class: 'jobs-row'},
      h('div', {class: 'jobs-where'}, !r.via && placeMark(r.where), r.said && h('span', {class: 'note'}, r.said)),
      members);
  };
  return h('section', {class: 'block jobs'},
    h('h2', {class: 'jobs-h'}, 'How ', han(m.of), ' is used'),
    m.differ && h('p', {class: 'note jobs-differ'}, m.differ),
    ...m.branches.map(b => h('div', {class: `jobs-branch jb-${b.job}`},
      h('h3', {class: 'jobs-title'}, h('span', {class: `rk-dot rb-${b.job}`, 'aria-hidden': 'true'}), b.title),
      ...b.lines.map(l => h('p', {class: 'note jobs-line'}, l)),
      ...b.rows.map(row),
      b.job === 'sound' && soundBody)));
}

const goTo = ({onFamily = null, onRef = null}) => l =>
  (l.family ? onFamily && (() => onFamily(l.family)) : onRef && (() => onRef(l.ref)));

// the reading is over the tile; "on its own jyun4" where it differs (爰)
const ownSaid = x => x.own && h('p', {class: 'note sm bt-own'}, 'On its own ', jpSpan(x.own));
const count = n => `${n.toLocaleString('en-GB')} ${n === 1 ? 'character' : 'characters'}`;

// Where its sound branches (Decided 29): the parent, then each branch, the
// one this page is about marked and not a link
export function renderTree(m, cb = {}) {
  if (!m) return null;
  const go = goTo(cb), kindOf = cb.kindOf || null;
  const tile = (f, size, onTap, over = '') => glyphTile(f, kindOf ? kindOf(f) : null, {size, over, onTap});
  const more = (x, text) => (x.form !== m.here && go(x)
    ? h('button', {type: 'button', class: 'link sm', onclick: go(x)}, `${text} ›`)
    : h('span', {class: 'note sm'}, text));
  const said = ps => ps.map(x => (Array.isArray(x) ? han(shownForm(x[1])) : x));
  // a node's row, then the parts under it, their line dropping from its
  // tile (古: 固, then 個 under 固, not under 固's 錮)
  const node = (b, shift = false) => h('li', {class: `bt-kid${shift ? ' bt-shift' : ''}`},
    h('div', {class: `bt-node${b.form === m.here ? ' bt-here' : ''}`},
      tile(b.form, 'md', b.form !== m.here ? go(b) : null, b.jp || ''),
      h('div', {class: 'bt-text'},
        ownSaid(b),
        b.said.length > 0 && h('p', {class: 'note sm bt-said'}, ...said(b.said)),
        b.tiles.length > 0 && branchTiles(b, c => tile(c, 'sm', cb.onRef ? () => cb.onRef(c) : null, b.over[c] || '')))),
    b.folds && b.folds.length > 0 && h('ul', {class: 'bt-kids'}, ...b.folds.map(x => node(x))));
  // a head with its count, and what it says of itself
  const head = (x, cls) => h('div', {class: `bt-node ${cls}${x.form === m.here ? ' bt-here' : ''}`},
    tile(x.form, 'md', x.form !== m.here ? go(x) : null, x.jp || ''),
    h('div', {class: 'bt-text'},
      ownSaid(x),
      x.said && x.said.length > 0 && h('p', {class: 'note sm bt-said'}, ...said(x.said)),
      x.offPath ? h('p', {class: 'note sm'}, 'You’ll meet it only as a part · ', more(x, count(x.n)))
                : more(x, count(x.n)),
      x.tiles && x.tiles.length > 0 && branchTiles(x, c => tile(c, 'sm', cb.onRef ? () => cb.onRef(c) : null, x.over[c] || ''))));
  const r = m.root;
  const kids = (m.folds.length > 0 || m.branches.length > 0)
    && h('ul', {class: 'bt-kids'}, ...m.folds.map(x => node(x)), ...m.branches.map(x => node(x, true)));
  return h('section', {class: 'block branches'},
    h('h3', {class: 'branches-h'}, 'How ', han(shownForm(m.of)), '’s shapes connect across its sound family'),
    // the family it comes from above it, the line down to it dashed
    ...(m.up
      ? [head(m.up, 'bt-parent'), h('ul', {class: 'bt-kids'}, h('li', {class: 'bt-kid bt-shift'}, head(r, ''), kids))]
      : [head(r, 'bt-parent'), kids]));
}

// a branch's first TREE_TILES members, and "+ N more" that opens the rest
// in place (Mark, 2026-11-18: not a jump to its card)
function branchTiles(b, tile) {
  const box = h('div', {class: 'bt-tiles'}, ...b.tiles.slice(0, TREE_TILES).map(tile));
  if (b.tiles.length > TREE_TILES) {
    const more = h('button', {type: 'button', class: 'link sm', onclick: () => {
      more.remove();
      box.append(...b.tiles.slice(TREE_TILES).map(tile));
    }}, `+ ${b.tiles.length - TREE_TILES} more`);
    box.append(more);
  }
  return box;
}
