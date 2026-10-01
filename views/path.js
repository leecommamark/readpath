// path.js — the Path tab (patch plan 6, Phase 3; as families since patch
// plan 7.5, Phase 4; DESIGN *Screens*: Path).
//
// A compact header -- where you are, the placement check (views/check.js),
// Find a character (views/find.js) -- then the path as family cards
// (views/families.js). Done and the Meaning parts list (the sound parts are
// the families now) are a row each above the list, since 7.6 3b. The step 6
// map of 100-item blocks is gone.
//
// Where you are: known characters (main reading in Maintain), known parts,
// readings learning (met, not yet known), and "about N% of the characters in
// written Chinese" -- the summed written share of the known characters
// (decided 6; it counts characters, so like "N% readable" it flatters).
//
// pathModel() is pure (a test reads it without a DOM); renderPath() draws it.

import {h, clear, put} from './dom.js';
import {isKnown} from '../core/state.js';
import {checkBlock} from './check.js';
import {familyCards, renderFamilyList} from './families.js';
import {glyphKey} from './glyph.js';

export {stateOf} from './families.js';

const plural = (n, one, many = `${one}s`) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;

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

// pathModel(content, states, nextUp) -> {where, families, meaning}
//   nextUp: Today's summary.next_up, which marks the current family
export function pathModel(content, states, nextUp = null) {
  const meaning = {total: 0, known: 0};
  for (const id of content.path) {
    if (content.kind(id) !== 'meaning') continue;
    meaning.total++;
    if (isKnown(states[id])) meaning.known++;
  }
  return {where: whereYouAre(content, states), families: familyCards(content, states, nextUp),
          meaning};
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

// Done and Meaning parts (7.6 3b, Mark): a row each near the top, since
// the family list below them loads as it scrolls and never ends. Done shows
// once a card is done.
function jumpsBlock(m, cb) {
  const row = (title, sub, onclick) => h('button', {type: 'button', class: 'jump', onclick},
    h('span', {class: 'jump-text'}, h('b', {}, title), h('span', {class: 'sm'}, sub)),
    h('span', {class: 'jump-go', 'aria-hidden': 'true'}, '›'));
  const done = m.families.done.length;
  return h('section', {class: 'block jumps'},
    done > 0 && row('Done', plural(done, 'card'), cb.onDone),
    row('Meaning parts', `${m.meaning.known} of ${m.meaning.total} known`, cb.onParts),
    // a row, not a foot: nothing is drawn below the family list (7.6 3b),
    // so Send feedback joins these (patch plan 7B, Phase 3)
    cb.onFeedback && row('Send feedback', 'A note, and your reports, to Mark', cb.onFeedback));
}

// renderPath(el, model, cb)   cb: onFamily(key), onCheck, placement (the
// last check's record, or null), query, onQuery(q, host), onParts, onDone,
// kindOf, shown / onShown (how many family cards were drawn, kept across
// redraws)
export function renderPath(el, m, cb) {
  const w = m.where;
  const f = m.families;
  const list = h('div', {class: 'fam-host'});
  put(clear(el),
    h('div', {class: 'top'}),
    h('h1', {id: 'path-h'}, 'Path'),
    h('section', {class: 'block first where'},
      h('p', {class: 'known'}, h('b', {}, plural(w.characters, 'character')), ' and ',
        h('b', {}, plural(w.parts, 'part')), ' known'),
      h('p', {class: 'note'}, `${plural(w.learning, 'reading')} learning · about ${w.share}% of the characters in written Chinese`)),
    checkBlock(cb.placement || null, cb),
    findBlock(cb),
    jumpsBlock(m, cb),
    h('section', {class: 'block families'},
      h('div', {class: 'row'},
        h('span', {class: 'label'}, `Your path · ${plural(f.total, 'card')}`)),
      h('p', {class: 'note'}, 'Characters grouped by the sound part they share, in the order Today '
        + 'teaches them. Open one to see its characters and mark what you know.'),
      glyphKey(),
      list));
  const drawn = renderFamilyList(list, f.open, cb, {shown: cb.shown});
  if (cb.onShown) cb.onShown(drawn);
}
