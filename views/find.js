// find.js — Find a character's results (patch plan 6, Phase 5).
//
// Draws core/search.js's three groups under the search box: characters on
// the path (with their state), parts, and characters not on the path. A row
// opens its reference card. Only the results are drawn again as the learner
// types, so the box keeps its focus.

import {h, clear, put} from './dom.js';
import {shortGloss} from './reader.js';
import {glyphTile} from './glyph.js';

const STATE = {known: 'known', learning: 'learning', ahead: 'ahead'};

// "You typed 复, the simplified form" (patch plan 7A, 6b): a learner who
// typed one form and is shown another needs to know it's the same character
export function typedNote(x) {
  if (!x.typed) return null;
  return x.simplified ? `you typed ${x.typed}, the simplified form`
    : `you typed ${x.typed}, another way of writing it`;
}

function row(form, jp, gloss, tag, tagClass, onRef, note = null, id = null, kindOf = null) {
  return h('li', {},
    h('button', {type: 'button', class: 'find-row', onclick: () => onRef(form, id)},
      glyphTile(form, kindOf ? kindOf(form) : null, {size: 'sm'}),
      h('span', {class: 'find-text'},
        jp && h('span', {class: 'mono'}, jp),
        gloss && h('span', {class: 'sm'}, ` ${shortGloss(gloss)}`),
        note && h('span', {class: 'sm note find-typed'}, note)),
      tag && h('span', {class: `tag ${tagClass}`}, tag)));
}

function group(label, rows, total) {
  if (!rows.length) return null;
  return h('section', {class: 'find-group'},
    h('span', {class: 'label'}, label),
    h('ul', {class: 'find-list'}, ...rows),
    total > rows.length && h('p', {class: 'note'}, `and ${total - rows.length} more: type more to narrow it`));
}

// renderFind(host, query, results, onRef, kindOf): kindOf is glyph.js
// glyphKind over the content, for each row's tile
export function renderFind(host, query, r, onRef, kindOf = null) {
  clear(host);
  if (!query.trim()) return host;
  const cls = s => (s === 'known' ? 'accent' : s === 'learning' ? 'learn' : '');
  // a reading's row opens the card on that reading (7A 6b)
  const path = r.path.map(x => row(x.char, x.jp, x.gloss, STATE[x.state], cls(x.state), onRef,
    typedNote(x), x.id, kindOf));
  const parts = r.parts.map(x => row(x.form, x.reading, x.gloss,
    `${x.kind} part · ${STATE[x.state]}`, cls(x.state), onRef, null, null, kindOf));
  const off = r.off.map(x => row(x.char, x.jp, x.gloss, x.known ? 'you know this' : 'not on the path',
    x.known ? 'accent' : '', onRef, typedNote(x), null, kindOf));
  if (!path.length && !parts.length && !off.length) {
    return put(host, h('p', {class: 'note'}, 'Nothing found. Try a character, a jyutping syllable, or an English word.'));
  }
  return put(host,
    group('On your path', path, r.total.path),
    group('Parts', parts, r.total.parts),
    group('Not on the path', off, r.total.off));
}
