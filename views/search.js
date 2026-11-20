// search.js — one search, from the header of every tab (brief 7.26 P5;
// patch plan 7.26, Phase 3). It replaces Path's Find a character box.
//
// A sheet over the tab, like the card, so the phone's back gesture closes
// it: the box, then the results as the learner types (only the results are
// drawn again, so the box keeps its focus). On top, Words (decided 3, W1): a
// query of two or more characters that is a word in the word table (exact
// form only, as typed or converted), each row opening the word sheet. Then
// one row per glyph (brief 7.38 P11): a character on the path, a part and a
// family head are one row, "土 tou2 earth", its roles as tags under it
// (character · sound part · meaning part · 土 family (7)), each opening the
// card at that role or the family's page; the row itself opens the card
// (P4). Then the characters not on the path, as Find drew them.

import {h, han, clear, put, jpSpan} from './dom.js';
import {renderFind, typedNote, viaSaid} from './find.js';
import {shortGloss} from '../core/gloss.js';
import {glyphTile} from './glyph.js';


// the header's search button, on Today, Texts, Path and Steps: a magnifier
// drawn, not a glyph a font may lack
const SVG = 'http://www.w3.org/2000/svg';
function magnifier() {
  const svg = document.createElementNS(SVG, 'svg');
  for (const [k, v] of Object.entries({width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none',
                                       stroke: 'currentColor', 'stroke-width': 2,
                                       'stroke-linecap': 'round', 'aria-hidden': 'true'})) svg.setAttribute(k, String(v));
  const circle = document.createElementNS(SVG, 'circle');
  for (const [k, v] of Object.entries({cx: 10.5, cy: 10.5, r: 6.5})) circle.setAttribute(k, String(v));
  const line = document.createElementNS(SVG, 'path');
  line.setAttribute('d', 'M15.5 15.5 L21 21');
  svg.append(circle, line);
  return svg;
}
export const searchButton = onSearch => onSearch && h('button', {type: 'button', class: 'icon-btn search-btn',
  'aria-label': 'Search', onclick: onSearch}, magnifier());

// renderSearch(sheet, {query}, cb)   cb: onClose, onQuery(q, host), focus
// (true when it was opened by a tap, so the keyboard comes up)
export function renderSearch(sheet, {query = ''} = {}, cb) {
  const host = h('div', {class: 'find-results'});
  const input = h('input', {type: 'search', class: 'note-input find-input search-input', value: query,
                            placeholder: 'A character, a word, jyutping or English',
                            'aria-label': 'Search', autocomplete: 'off',
                            autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'search',
                            oninput: e => cb.onQuery(e.target.value, host),
                            // the keyboard's Search key closes the keyboard, so
                            // the results show whole (Mark's iPhone check, 7.26)
                            onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } }});
  put(clear(sheet),
    h('div', {class: 'top sheet-head'}, h('span', {class: 'label'}, 'Search'),
      h('button', {type: 'button', class: 'icon-btn close-btn', 'aria-label': 'Close',
                   onclick: cb.onClose}, '✕')),
    h('section', {class: 'block first find'}, input, host));
  if (query) cb.onQuery(query, host);
  if (cb.focus && input.focus) input.focus();
  return sheet;
}

// words: {status: 'pending' | 'done' | 'offline', found: [{form, jp, gloss}], forms}
function wordsGroup(words, onWord) {
  if (!words || !words.forms.length) return null;
  if (words.status === 'offline') {
    return h('section', {class: 'find-group'}, h('span', {class: 'label'}, 'Words'),
      h('p', {class: 'note'}, han(words.forms[words.forms.length - 1]), ': not available offline yet.'));
  }
  if (!words.found.length) return null;
  return h('section', {class: 'find-group'}, h('span', {class: 'label'}, 'Words'),
    h('ul', {class: 'find-list'}, ...words.found.map(w => h('li', {},
      h('button', {type: 'button', class: 'find-row', onclick: () => onWord(w)},
        han(w.form, {class: 'find-word'}),
        h('span', {class: 'find-text'}, jpSpan(w.jp),
          w.gloss && h('span', {class: 'sm'}, ` ${shortGloss(w.gloss)}`)))))));
}

// glyphRows(results, families) -> [{form, jps, gloss, weak, note, via,
// character (its first reading's id), sound, meaning, read (a sound part
// read as its family), family {key, members}}]: core/search.js's path and
// parts rows and the families, one per glyph, in the order first found
export function glyphRows(results, families) {
  const by = new Map();
  const at = form => {
    if (!by.has(form)) by.set(form, {form, jps: [], gloss: '', weak: false, note: null, via: null,
                                     character: null, sound: false, meaning: false, read: false, family: null});
    return by.get(form);
  };
  for (const x of results.path) {
    const r = at(x.char);
    r.jps.push(x.jp);
    // the main reading's gloss, the card's; else the first found
    if (!r.character || x.primary) Object.assign(r, {gloss: x.gloss, weak: x.weak});
    if (!r.character) Object.assign(r, {character: x.id, note: typedNote(x), via: x.via || null});
  }
  for (const x of results.parts) {
    const r = at(x.form);
    r[x.kind] = true;
    if (x.kind === 'sound') {
      r.read = !r.character && !!x.family;
      if (!r.jps.length && x.reading) r.jps.push(x.reading);
    }
    if (!r.gloss) Object.assign(r, {gloss: x.gloss || '', weak: x.weak});
  }
  for (const f of families) at(f.head).family = {key: f.key, members: f.members};
  return [...by.values()];
}

// one row: the tile, its reading(s) and gloss (the row opens the card), and
// its roles as tags under it
function glyphRow(r, cb) {
  const tag = (label, onclick) => h('button', {type: 'button', class: 'link sm role-tag', onclick}, label);
  const tags = [
    r.character && tag('character', () => cb.onRef(r.form, r.character)),
    r.sound && tag('sound part', () => cb.onPart(r.form)),
    r.meaning && tag('meaning part', () => cb.onPart(r.form)),
    r.family && tag(`${r.form} family (${r.family.members}) ›`, () => cb.onFamily(r.family.key)),
  ].filter(Boolean);
  return h('li', {class: 'glyph-row'},
    h('button', {type: 'button', class: 'find-row', onclick: () => cb.onRef(r.form, r.character)},
      glyphTile(r.form, cb.kindOf ? cb.kindOf(r.form) : null,
                {size: 'sm', progress: cb.progressOf ? cb.progressOf(r.form) : null}),
      h('span', {class: 'find-text'},
        ...r.jps.flatMap((jp, i) => [i ? ', ' : '', jpSpan(jp)]),
        r.read && h('span', {class: 'muted'}, ' (family)'),
        r.gloss && h('span', {class: `sm${r.weak ? ' weak' : ''}`}, ` ${shortGloss(r.gloss)}`),
        r.via && h('span', {class: 'sm note find-typed'}, ...viaSaid(r.via)),
        r.note && h('span', {class: 'sm note find-typed'}, r.note))),
    h('p', {class: 'role-tags'}, ...tags.flatMap((t, i) => [i ? ' · ' : '', t])));
}

// renderResults(host, query, {results, words, families}, cb)
//   cb: onRef(form, id), onPart(form) (the card at As a part), onWord(word),
//   onFamily(key), kindOf, progressOf
export function renderResults(host, query, {results, words = null, families = []}, cb) {
  clear(host);
  if (!query.trim()) return host;
  const rows = glyphRows(results, families);
  const more = results.total.path > results.path.length || results.total.parts > results.parts.length;
  const glyphs = rows.length > 0 && h('section', {class: 'find-group'},
    h('ul', {class: 'find-list'}, ...rows.map(r => glyphRow(r, cb))),
    more && h('p', {class: 'note'}, 'And more: type more to narrow it.'));
  const off = results.off.length > 0 && h('div', {});
  if (off) renderFind(off, query, {path: [], parts: [], off: results.off, total: results.total},
                      cb.onRef, cb.kindOf, cb.progressOf);
  const found = (words && words.found.length) || rows.length || results.off.length;
  return put(host, wordsGroup(words, cb.onWord), glyphs || null, off || null,
    !found && !(words && words.status === 'pending')
      && h('p', {class: 'note'}, 'Nothing found. Try a character, a jyutping syllable, or an English word.'));
}
