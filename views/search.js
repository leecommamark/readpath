// search.js — one search, from the header of every tab (brief 7.26 P5;
// patch plan 7.26, Phase 3). It replaces Path's Find a character box.
//
// A sheet over the tab, like the card, so the phone's back gesture closes
// it: the box, then the results as the learner types (only the results are
// drawn again, so the box keeps its focus). On top, Words (decided 3, W1): a
// query of two or more characters that is a word in the word table (exact
// form only, as typed or converted), each row opening the word sheet. Then
// Families: a typed character that heads one, opening its page. Then
// core/search.js's three groups as Find drew them (views/find.js). Every
// character row opens its card (P4).

import {h, han, clear, put, jpSpan} from './dom.js';
import {renderFind} from './find.js';
import {shortGloss} from '../core/gloss.js';

const plural = (n, one, many = `${one}s`) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;

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

function familiesGroup(families, onFamily) {
  if (!families.length) return null;
  return h('section', {class: 'find-group'}, h('span', {class: 'label'}, 'Families'),
    h('ul', {class: 'find-list'}, ...families.map(f => h('li', {},
      h('button', {type: 'button', class: 'find-row', onclick: () => onFamily(f.key)},
        han(f.head, {class: 'find-word'}),
        h('span', {class: 'find-text'}, 'family',
          h('span', {class: 'sm'}, ` · ${plural(f.members, 'character')}`)),
        h('span', {class: 'jump-go', 'aria-hidden': 'true'}, '›'))))));
}

// renderResults(host, query, {results, words, families}, cb)
//   cb: onRef(form, id), onWord(word), onFamily(key), kindOf, progressOf
export function renderResults(host, query, {results, words = null, families = []}, cb) {
  clear(host);
  if (!query.trim()) return host;
  const chars = h('div', {});
  renderFind(chars, query, results, cb.onRef, cb.kindOf, cb.progressOf);
  // with a word or a family found, Find's "Nothing found" isn't so
  const found = (words && words.found.length) || families.length;
  const nothing = !results.path.length && !results.parts.length && !results.off.length;
  return put(host, wordsGroup(words, cb.onWord), familiesGroup(families, cb.onFamily),
    found && nothing ? null : chars);
}
