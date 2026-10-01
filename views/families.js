// families.js — Path as families (patch plan 7.5, Phase 4; brief 7.5
// decided 5, Chop by Chop's family cards).
//
// A path character's family is the sound part part_role names for it. A
// character with no sound part that other characters have as theirs heads
// that family and is its member (止 in the 止 family); one with a sound
// part of its own (青, under 生) is a member of that family and only shown
// as the head of its own. Families of 2+ members get a card (Mark, Phase 0
// decided 1: 674); the rest -- one-member families and the characters
// that head none (人 了 一) -- go into "Characters on their own" cards of
// 20, in path order (533 characters, 27 cards). Every path character is in
// exactly one card.
//
// The cards come in the order Today will reach them: by the path rank of
// each card's first member not yet known. A card with every member known
// sinks into Done. "Current" is the card holding Today's next new item.
// The ring counts members whose main reading is known (Maintain).
//
// The family page (#path/family/<key>) is the step 6 grid's successor: the
// head's facts (its reading, "unlocks N", Test me), then every member as a
// tile in path order, with Look / Mark (Mark first; Phase 0 decided 4).
// Mark marks a character reading known, or offers I forgot this on a known
// one, through transition() (actions.js), with an Undo.
//
// Everything here but the drawing is pure, so a test reads it without a DOM.

import {h, clear, put} from './dom.js';
import {isKnown} from '../core/state.js';
import {soundId} from '../core/content.js';
import {markInReader} from '../actions.js';
import {canTestMe} from '../runner.js';
import {glyphTile, progressOf} from './glyph.js';
import {familiesOf, familyPlan, reviewLoad, MIN_MEMBERS, OWN_SIZE} from '../core/family.js';

// the grouping is core/family.js's (the runner and the simulator use it too)
export {familiesOf, MIN_MEMBERS, OWN_SIZE};
export const PREVIEW = 6;

export const MODES = ['mark', 'look'];

export const stateOf = s => (!s ? 'ahead' : isKnown(s) ? 'known' : 'learning');

// The key of the card holding Today's next new item (compose()'s
// summary.next_up), or null. A sound part is its own family's; any other
// part is the card of its first member not yet known.
export function currentKey(content, states, fam, nextUp) {
  if (!nextUp || !content.has(nextUp)) return null;
  const it = content.item(nextUp);
  if (it.kind === 'reading') return fam.cardOf.get(it.char) || null;
  if (it.kind === 'sound' && fam.byKey.has(`f:${it.part}`)) return `f:${it.part}`;
  const first = content.membersOf(nextUp).find(id => !isKnown(states[id]));
  return first ? fam.cardOf.get(content.item(first).char) || null : null;
}

const readingOf = (content, head) =>
  content.partReading(head)
  || (content.mainReading(head) && content.item(content.mainReading(head)).jp) || null;

// "about N‰ of text": one decimal, more under 0.1 so a small family shows
export function permille(perMillion) {
  const v = perMillion / 1000;
  if (v === 0) return '0';
  return v < 0.1 ? v.toPrecision(1) : v.toFixed(1).replace(/\.0$/, '');
}

// familyCards(content, states, nextUp) -> {open, done, current, total}
//   each card: {key, type, head, reading, members, preview, known, learning,
//               total, value (per million), first (its first member not
//               yet known: number), state: current | started | ahead | done,
//               from, to (an own card's stretch, by character number)}
export function familyCards(content, states, nextUp = null) {
  const fam = familiesOf(content);
  const current = currentKey(content, states, fam, nextUp);
  const rows = fam.cards.map(card => {
    const st = card.members.map(c => stateOf(states[content.mainReading(c)]));
    const known = st.filter(s => s === 'known').length;
    const learning = st.filter(s => s === 'learning').length;
    const open = card.members.find((c, i) => st[i] !== 'known');
    const total = card.members.length;
    const state = known === total ? 'done' : card.key === current ? 'current'
      : known + learning > 0 ? 'started' : 'ahead';
    return {key: card.key, type: card.type, head: card.head || null,
            reading: card.type === 'family' ? readingOf(content, card.head) : null,
            members: card.members, preview: card.members.slice(0, PREVIEW),
            known, learning, total, state,
            value: card.members.reduce((n, c) => n + content.valueOf(c), 0),
            first: open ? fam.number.get(open) : Infinity,
            from: fam.number.get(card.members[0]),
            to: fam.number.get(card.members[card.members.length - 1])};
  });
  const byFirst = (a, b) => a.first - b.first || a.from - b.from;
  return {open: rows.filter(r => r.state !== 'done').sort(byFirst),
          done: rows.filter(r => r.state === 'done').sort((a, b) => a.from - b.from),
          current, total: rows.length};
}

// familyPage(content, states, key, mode) -> the page's model, or null
export function familyPage(content, states, key, mode = 'mark') {
  const fam = familiesOf(content);
  const card = fam.byKey.get(key);
  if (!card) return null;
  const head = card.type === 'family' ? card.head : null;
  const partId = head && content.has(soundId(head)) ? soundId(head) : null;
  const cells = card.members.map(c => {
    const id = content.mainReading(c);
    const state = stateOf(states[id]);
    return {id, kind: 'reading', form: c, state, progress: progressOf(states[id], 'reading'),
            jp: state === 'known' ? null : content.item(id).jp};
  });
  const counts = {known: 0, learning: 0, ahead: 0};
  for (const c of cells) counts[c.state]++;
  // Study this family (7.5, Phase 4b): what's left, and roughly what it
  // adds to Today's reviews over the next week
  const plan = familyPlan(content, states, card);
  return {key, type: card.type, head,
          study: {toLearn: plan.length, load: reviewLoad(plan.length),
                  parts: plan.filter(id => content.kind(id) !== 'reading').length},
          reading: head ? readingOf(content, head) : null,
          part: partId && {id: partId, state: stateOf(states[partId]),
                           progress: progressOf(states[partId], 'sound'),
                           unlocks: content.membersOf(partId).length,
                           canTest: canTestMe(content, states, partId)},
          from: fam.number.get(card.members[0]),
          to: fam.number.get(card.members[card.members.length - 1]),
          value: card.members.reduce((n, c) => n + content.valueOf(c), 0),
          mode: MODES.includes(mode) ? mode : 'mark', cells, counts};
}

// What a tap on a member does: {open: form} (its card), {mark: done} (as
// markInReader returns it, with what Undo needs), or null.
export function familyTap(content, learner, cell, mode, today) {
  if (mode === 'look') return {open: cell.form};
  const done = markInReader(content, learner, cell.id, today);
  return done ? {mark: done} : null;
}

// ---- drawing

const plural = (n, one, many = `${one}s`) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;
const STATE_SAID = {known: 'known', learning: 'learning', ahead: 'not met yet'};
export const FAMILY_HINT = {
  mark: 'Tap a character you know to mark it known, or a known one if you’ve forgotten it.',
  look: 'Tap a character for its card.',
};

// known / total, as a ring (the mock-up's): its own colours, so a test of
// the tokens covers it
function ring(known, total) {
  const r = 15, c = 2 * Math.PI * r, f = total ? known / total : 0;
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  };
  const svg = el('svg', {class: 'ring', width: 40, height: 40, viewBox: '0 0 40 40',
                         'aria-hidden': 'true'});
  svg.append(el('circle', {cx: 20, cy: 20, r, class: 'ring-track'}));
  // none known: no arc at all (a round cap would draw a dot)
  if (known) {
    svg.append(el('circle', {cx: 20, cy: 20, r, class: 'ring-fill',
                             'stroke-dasharray': `${(c * f).toFixed(2)} ${c.toFixed(2)}`,
                             transform: 'rotate(-90 20 20)'}));
  }
  const t = el('text', {x: 20, y: 24, 'text-anchor': 'middle', class: 'ring-text'});
  t.textContent = `${known}/${total}`;
  svg.append(t);
  return svg;
}

const titleOf = c => (c.type === 'family' ? `${c.head} family` : 'Characters on their own');

// A family's head is its members' sound part, so it is always drawn as a
// square, whatever role it plays most often elsewhere (patch plan 7.6 3b,
// Mark: 口 is mostly a meaning part, but the 口 family is a sound family).
// A bound head keeps its tint.
export const headKind = (cb, form) => (cb.kindOf
  ? {...cb.kindOf(form), shape: 'square', component: true}
  : {shape: 'square', component: true, bound: false});

export function familyCard(c, cb) {
  const sub = c.type === 'family'
    ? [`${permille(c.value)}‰ of text · `, h('span', {class: 'han'}, c.preview.join(' '))]
    : [`characters ${c.from.toLocaleString('en-GB')}–${c.to.toLocaleString('en-GB')} · `,
       h('span', {class: 'han'}, c.preview.join(' '))];
  return h('button', {type: 'button', class: `fam-card is-${c.state}`,
                      'aria-label': `${titleOf(c)}: ${c.known} of ${c.total} known. Open`,
                      onclick: () => cb.onFamily(c.key)},
    c.type === 'family'
      ? glyphTile(c.head, headKind(cb, c.head), {size: 'md'})
      // no head: how many, in a quiet square (a glyph would read as a head)
      : h('span', {class: 'fam-own', 'aria-hidden': 'true'}, String(c.total)),
    h('span', {class: 'fam-text'},
      h('span', {class: 'fam-title'}, h('b', {}, titleOf(c)),
        c.reading && h('span', {class: 'mono'}, ` · ${c.reading}`),
        c.state === 'current' && h('span', {class: 'tag accent fam-now'}, 'Current')),
      h('span', {class: 'fam-sub'}, ...sub)),
    ring(c.known, c.total));
}

// renderFamilyList(host, cards, cb, {shown}): the cards CHUNK at a time
// (patch plan 7.5: hundreds of cards, and the iPhone must scroll smoothly).
// The next chunk comes from a "Show more" button at the foot of the list,
// which an IntersectionObserver presses as it nears the screen, so scrolling
// just carries on; the button alone still works where the observer never
// fires. `shown` is how many to draw at once (a redraw keeps what was
// drawn, so the page doesn't jump). Path's open cards and the Done screen
// both use it; since 7.6 3b nothing is drawn below it, since an endless
// list hides whatever follows (Mark). Returns {shown()}.
export const CHUNK = 40;
export function renderFamilyList(host, cards, cb, {shown = CHUNK} = {}) {
  let drawn = 0, io = null;
  const list = h('div', {class: 'fam-list'});
  const moreBtn = h('button', {type: 'button', class: 'btn quiet wide fam-more',
                               onclick: () => more(CHUNK)});
  const more = n => {
    const next = cards.slice(drawn, drawn + n);
    list.append(...next.map(c => familyCard(c, cb)));
    drawn += next.length;
    const left = cards.length - drawn;
    moreBtn.textContent = `Show more · ${plural(left, 'card')} to go`;
    if (left <= 0) {
      moreBtn.remove();
      if (io) io.disconnect();
    }
  };
  more(Math.max(shown, CHUNK));
  put(clear(host), list, drawn < cards.length && moreBtn);
  if (drawn < cards.length && typeof IntersectionObserver !== 'undefined') {
    io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) more(CHUNK);
    }, {rootMargin: '600px 0px'});
    io.observe(moreBtn);
  }
  return {shown: () => drawn};
}

// renderDone(el, cards, cb)   cb: onBack, onFamily(key), kindOf. The cards
// whose every member is known, on a screen of their own (7.6 3b, Mark:
// at the foot of Path they were out of reach), #path/done.
export function renderDone(el, cards, cb) {
  const list = h('div', {class: 'fam-host'});
  put(clear(el),
    h('div', {class: 'top'},
      h('button', {type: 'button', class: 'link back-btn', onclick: cb.onBack}, '‹ Path'),
      h('span', {})),
    h('h1', {id: 'done-h'}, 'Done'),
    h('p', {class: 'note'}, cards.length
      ? `${plural(cards.length, 'card')} with every character known.`
      : 'No card has every character known yet.'),
    list);
  renderFamilyList(list, cards, cb);
}

// Study this family (brief 7.5 decided 6): its own session, with no daily
// limit; the note says what it adds to Today's reviews, so the load is no
// surprise. Stopping halfway keeps what was answered, and the button then
// offers what's left.
export function studyBlock(m, cb) {
  const st = m.study;
  if (!cb.onStudy) return null;
  if (!st.toLearn) {
    return h('section', {class: 'block study'},
      h('p', {class: 'note'}, m.head ? 'Nothing left to learn in this family: everything here is met.'
                                     : 'Nothing left to learn here: everything is met.'));
  }
  return h('section', {class: 'block study'},
    h('button', {type: 'button', class: 'btn primary wide', onclick: () => cb.onStudy(m.key)},
      m.head ? 'Study this family' : 'Study these characters',
      h('span', {class: 'study-n'}, ` · ${plural(st.toLearn, 'to learn', 'to learn')}`)),
    h('p', {class: 'note'},
      `About ${plural(st.load, 'extra review')} in Today over the next 7 days. `
      + (st.parts ? `Its ${st.parts === 1 ? 'part comes' : `${st.parts} parts come`} first. ` : '')
      + 'Stop whenever you like: what you’ve answered is kept.'));
}

// renderFamily(el, model, cb)   cb: onBack, onMode(mode), onTap(cell),
// onRef(form), onTestMe(id), kindOf(form), onStudy(key)
export function renderFamily(el, m, cb) {
  const c = m.counts;
  const tileOf = x => glyphTile(x.form, cb.kindOf ? cb.kindOf(x.form) : null, {
    size: 'md', over: x.jp || '', progress: x.progress,
    label: `${x.form}${x.jp ? ` ${x.jp}` : ''}: ${STATE_SAID[x.state]}; `
      + (m.mode === 'look' ? 'open its card' : x.state === 'known' ? 'tap if you’ve forgotten it' : 'mark known'),
    onTap: () => cb.onTap(x)});
  const modes = h('div', {class: 'modes', role: 'group', 'aria-label': 'Mode'},
    ...MODES.map(k => h('button', {
      type: 'button', class: `mode-btn${m.mode === k ? ' on' : ''}`, 'aria-pressed': String(m.mode === k),
      onclick: () => m.mode !== k && cb.onMode(k)}, k === 'mark' ? 'Mark' : 'Look')));
  const head = m.head && h('section', {class: 'block first fam-head'},
    h('div', {class: 'fam-head-row'},
      glyphTile(m.head, headKind(cb, m.head),
                {size: 'xl', progress: m.part ? m.part.progress : null, onTap: f => cb.onRef(f)}),
      h('div', {class: 'fam-head-text'},
        m.reading && h('p', {class: 'mono big-jp'}, m.reading),
        h('p', {class: 'note'}, `${permille(m.value)}‰ of text`),
        m.part && h('p', {class: 'note'},
          `Sound part · unlocks ${plural(m.part.unlocks, 'character')} · ${STATE_SAID[m.part.state]}`))),
    m.part && m.part.canTest && h('div', {class: 'btns'},
      h('button', {type: 'button', class: 'btn', onclick: () => cb.onTestMe(m.part.id)}, 'Test me')));
  put(clear(el),
    h('div', {class: 'top'},
      h('button', {type: 'button', class: 'link back-btn', onclick: cb.onBack}, '‹ Path'),
      h('span', {})),
    h('h1', {id: 'family-h'}, m.head ? `${m.head} family` : 'Characters on their own'),
    !m.head && h('p', {class: 'note'},
      `Characters ${m.from.toLocaleString('en-GB')}–${m.to.toLocaleString('en-GB')} on your path `
      + 'that share no sound part with another.'),
    head,
    studyBlock(m, cb),
    h('p', {class: 'note'}, [c.known && `${c.known} known`, c.learning && `${c.learning} learning`,
                             c.ahead && `${c.ahead} not met yet`].filter(Boolean).join(' · ')),
    h('div', {class: 'reader-controls'}, modes),
    h('p', {class: 'note mode-hint'}, FAMILY_HINT[m.mode]),
    h('div', {class: 'tiles fam-members', lang: 'zh-Hant-HK'}, ...m.cells.map(tileOf)));
}
