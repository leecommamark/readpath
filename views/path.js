// path.js — the Path tab (patch plan 6, Phase 3; as families since 7.5;
// where you are on the path since 7.7, Phase 4; DESIGN *Screens*: Path).
//
// Top to bottom (brief 7.7 decided 1): where you are; the whole path as
// one strip, the known share filled and a pin at Today's next item; Find a
// character; "You are here", a short trail of path items on a rail (the
// last few met, Next, then what's ahead); then a row each for Done, the
// placement check (Mark, 7.7 Phase 0: a row now) and Send feedback. Browse
// families and Meaning parts are the Steps tab (Pavers, brief 7.8 decided 2; Steps since 7.12).
// Every tile and stone here opens the character's tree.
//
// Where you are: known characters (main reading in Maintain), known parts,
// readings learning (met, not yet known), and "about N% of the characters in
// written Chinese" -- the summed written share of the known characters
// (decided 6; it counts characters, so like "N% readable" it flatters).
//
// pathModel() is pure (a test reads it without a DOM); renderPath() draws it.

import {h, clear, put, jpSpan} from './dom.js';
import {isKnown} from '../core/state.js';
import {familyCards, stateOf} from './families.js';
import {glyphTile, progressOf} from './glyph.js';
import {shortGloss} from '../core/gloss.js';
import {partGlossWeak} from '../core/provenance.js';

export {stateOf} from './families.js';

const plural = (n, one, many = `${one}s`) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;
const n0 = n => n.toLocaleString('en-GB');

// "about N%": one decimal under 10, so a first few characters show at all
export function sharePct(perMillion) {
  const pct = perMillion / 10_000;
  return pct < 10 ? pct.toFixed(1).replace(/\.0$/, '') : String(Math.round(pct));
}

export function whereYouAre(content, states) {
  let characters = 0, parts = 0, learning = 0, share = 0;
  for (const s of Object.values(states)) {
    if (!content.has(s.item)) continue;
    const it = content.item(s.item);
    if (!isKnown(s)) {
      if (it.kind === 'reading') learning++;
      continue;
    }
    if (it.kind !== 'reading') parts++;
    else if (it.primary) {
      characters++;
      share += content.wshareOf(it.char) || 0;
    }
  }
  return {characters, parts, learning, share: sharePct(share)};
}

export const TRAIL_BEHIND = 4;
export const TRAIL_AHEAD = 10;
const KIND_SAID = {sound: 'Sound part', meaning: 'Meaning part'};

// a stone's gloss and whether it is weak data, shown muted (7.10,
// core/provenance.js): an item's own, else its part gloss, else (a sound
// part) its character's, where it is one: its main reading's, or the
// dictionary's, which on a part's stone is always muted (Mark, 7.10 Phase 4)
function stoneGloss(content, it) {
  if (it.gloss) {
    return {text: it.gloss, weak: it.kind === 'reading' ? it.src === 'other_reading'
                                  : partGlossWeak(content, it.form)};
  }
  const pg = content.partGloss(it.form);
  if (pg) return {text: pg, weak: partGlossWeak(content, it.form)};
  const r = content.mainReading(it.form);
  if (r && content.item(r).gloss) return {text: content.item(r).gloss, weak: false};
  const c = content.char ? content.char(it.form) : null;
  return {text: (c && c.gloss) || '', weak: !!(c && c.gloss)};
}

// one stone: the item, its tile's state, and what the row says
function stoneOf(content, states, id, next) {
  const it = content.item(id);
  const kind = it.kind === 'reading' ? 'reading' : it.kind;
  const s = states[id];
  const g = stoneGloss(content, it);
  return {id, form: it.form, kind, rank: it.rank, jp: it.jp || content.partReading(it.form) || '',
          gloss: shortGloss(g.text), weak: g.weak,
          tag: KIND_SAID[kind] || null,
          state: stateOf(s), progress: progressOf(s, kind), next};
}

// trailModel(content, states, nextUp) -> {stones, behind, ahead, next}
//   the last TRAIL_BEHIND items met before Today's next item, the next item
//   (tagged Next), then TRAIL_AHEAD items ahead not met yet, all in path
//   order; behind: items met before Next that it leaves out; ahead: items
//   not met after its last stone. With no next item (the path done), the
//   trail ends at the last.
export function trailModel(content, states, nextUp = null) {
  const path = content.path;
  let at = nextUp && content.has(nextUp) ? path.indexOf(nextUp) : -1;
  if (at < 0) at = path.findIndex(id => !states[id]);
  const next = at >= 0 ? path[at] : null;
  const before = [], after = [];
  for (let i = (at >= 0 ? at : path.length) - 1; i >= 0 && before.length < TRAIL_BEHIND; i--) {
    if (states[path[i]]) before.unshift(path[i]);
  }
  if (at >= 0) {
    for (let i = at + 1; i < path.length && after.length < TRAIL_AHEAD; i++) {
      if (!states[path[i]]) after.push(path[i]);
    }
  }
  // the ends: items met before Next that the trail leaves out, and items
  // not met after its last stone (a focus text can pull items ahead of
  // path order, so some are met beyond Next: they are neither)
  const end = at >= 0 ? at : path.length;
  const metBefore = path.slice(0, end).filter(id => states[id]).length;
  const lastAt = after.length ? path.indexOf(after[after.length - 1]) : end;
  const unmetAfter = path.slice(lastAt + 1).filter(id => !states[id]).length;
  return {stones: [...before.map(id => stoneOf(content, states, id, false)),
                   ...(next ? [stoneOf(content, states, next, true)] : []),
                   ...after.map(id => stoneOf(content, states, id, false))],
          behind: metBefore - before.length, ahead: unmetAfter, next};
}

// stripModel(content, states, next) -> {total, known, pin}: the whole path
// as one bar, 1 to its last item; `known` the share of items known, `pin`
// where Today's next item is (a fraction), or null
export function stripModel(content, states, next) {
  const total = content.path.length;
  const known = content.path.filter(id => isKnown(states[id])).length;
  const rank = next ? content.rank(next) : null;
  return {total, known: known / total, knownN: known, nextRank: rank,
          pin: rank == null ? null : (rank - 0.5) / total};
}

// pathModel(content, states, nextUp) -> {where, strip, trail, families:
// {done}}: nextUp is Today's summary.next_up
export function pathModel(content, states, nextUp = null) {
  const trail = trailModel(content, states, nextUp);
  return {where: whereYouAre(content, states), strip: stripModel(content, states, trail.next),
          trail, families: {done: familyCards(content, states).done.length}};
}

// ---- drawing

// Find a character (Phase 5): the box, and a host its results are drawn into
// (views/find.js) as the learner types, so the box keeps its focus.
function findBlock(cb) {
  const host = h('div', {class: 'find-results'});
  const input = h('input', {type: 'search', class: 'note-input find-input', value: cb.query || '',
                            placeholder: 'A character, jyutping or English',
                            'aria-label': 'Find a character', autocomplete: 'off',
                            autocapitalize: 'off', spellcheck: 'false',
                            oninput: e => cb.onQuery(e.target.value, host)});
  if (cb.query) cb.onQuery(cb.query, host);
  return h('section', {class: 'block find'},
    h('span', {class: 'label'}, 'Find a character'), input, host);
}

function stripBlock(s) {
  const pct = f => `${(100 * f).toFixed(2)}%`;
  return h('section', {class: 'block path-strip-block'},
    h('div', {class: 'path-strip', role: 'img',
              'aria-label': `${n0(s.knownN)} of ${n0(s.total)} path items known`
                + (s.nextRank ? `; next is item ${n0(s.nextRank)}` : '')},
      h('span', {class: 'path-strip-known', style: `width:${pct(s.known)}`}),
      s.pin != null && h('span', {class: 'path-strip-pin', style: `left:${pct(s.pin)}`})),
    h('div', {class: 'path-strip-scale sm'},
      h('span', {}, '1'),
      s.nextRank ? h('span', {}, `next: item ${n0(s.nextRank)}`) : h('span', {}, 'all met'),
      h('span', {}, n0(s.total))));
}

const STATE_SAID = {known: 'known', learning: 'learning', ahead: 'not met yet'};

function trailBlock(t, cb) {
  const kindOf = f => (cb.kindOf ? cb.kindOf(f) : null);
  const stone = (st, i) => h('button', {
    type: 'button',
    class: ['stone', `is-${st.state}`, st.next && 'is-next', i === 0 && 'is-first',
            i === t.stones.length - 1 && 'is-last'].filter(Boolean).join(' '),
    'aria-label': `${st.next ? 'Next: ' : ''}${st.form} ${st.jp}, ${st.gloss}, item ${n0(st.rank)}, `
      + `${STATE_SAID[st.state]}: its tree`,
    onclick: () => cb.onTree(st.form)},
    h('span', {class: 'stone-rail', 'aria-hidden': 'true'}),
    glyphTile(st.form, kindOf(st.form), {size: 'sm', progress: st.progress}),
    h('span', {class: 'stone-text'},
      h('span', {class: 'stone-line'},
        st.next && h('span', {class: 'tag accent'}, 'Next'),
        st.tag && h('span', {class: 'tag'}, st.tag),
        h('span', {class: `stone-gloss${st.weak ? ' weak' : ''}`}, st.gloss || '—')),
      h('span', {class: 'stone-meta sm'}, jpSpan(st.jp), st.jp ? ' · ' : '',
        `#${n0(st.rank)}`, st.state !== 'ahead' ? ` · ${STATE_SAID[st.state]}` : '')));
  return h('section', {class: 'block trail-block'},
    h('span', {class: 'label'}, 'You are here'),
    h('p', {class: 'trail-end sm'}, t.behind ? `↑ ${plural(t.behind, 'item')} behind you` : 'The start of the path'),
    h('div', {class: 'trail'}, ...t.stones.map(stone)),
    h('p', {class: 'trail-end sm'}, t.ahead ? `↓ ${n0(t.ahead)} more ahead` : 'The end of the path'));
}

// the rows: Done, the placement check and Send feedback (7.7 decided 1;
// Browse families and Meaning parts moved to the Pavers (now Steps) tab in 7.8)
function rowsBlock(m, cb) {
  const row = (title, sub, onclick) => h('button', {type: 'button', class: 'jump', onclick},
    h('span', {class: 'jump-text'}, h('b', {}, title), h('span', {class: 'sm'}, sub)),
    h('span', {class: 'jump-go', 'aria-hidden': 'true'}, '›'));
  const last = cb.placement || null;
  return h('section', {class: 'block jumps'},
    m.families.done > 0 && row('Done', plural(m.families.done, 'card'), cb.onDone),
    row('Placement check', cb.pending ? 'In progress: tap to finish it'
      : last ? `Last check: about ${n0(last.n)}` : 'Already read some Chinese?', cb.onCheck),
    cb.onFeedback && row('Send feedback', 'A note, and your reports, to Mark', cb.onFeedback));
}

// renderPath(el, model, cb)   cb: onTree(form), onDone, onCheck, placement (the last check's record, or null), query,
// onQuery(q, host), onFeedback, kindOf
export function renderPath(el, m, cb) {
  const w = m.where;
  put(clear(el),
    h('div', {class: 'top'}),
    h('h1', {id: 'path-h'}, 'Path'),
    // every tile and stone here opens a tree, and nothing said so (7.8)
    h('p', {class: 'note'}, 'Tap a character to see its tree.'),
    h('section', {class: 'block first where'},
      h('p', {class: 'known'}, h('b', {}, plural(w.characters, 'character')), ' and ',
        h('b', {}, plural(w.parts, 'part')), ' known'),
      h('p', {class: 'note'}, `${plural(w.learning, 'reading')} learning · about ${w.share}% of the characters in written Chinese`)),
    stripBlock(m.strip),
    findBlock(cb),
    trailBlock(m.trail, cb),
    rowsBlock(m, cb));
}
