// fold.js — the one collapse pattern and the one overflow pattern (brief
// 7.38 D1, P9, P10).
//
// A fold is the card's section (brief 7.26 P2): a heading, what is inside
// in one line, and a chevron that turns as it opens; its body is drawn
// whole and hidden, so a tap opens it without drawing again. The card, the
// family page and the card's How 土 is used all fold this way.
//
// A row of tiles shows its first ROW_SHOWN, then "+ N more", a chip that
// opens the rest in place (7.37's rows, Mark: not a jump to a card).
//
// fold({key, label, summary, open, body, onToggle, cls, level}) -> <section>
//   label: the heading's words (string or nodes); summary: the closed line;
//   onToggle(key, open) when the learner opens or closes it; level: 'section'
//   (the card's and the family page's) or 'sub' (a fold inside a section)
// moreRow(members, tile, {cls, shown}) -> <div>

import {h} from './dom.js';

export const ROW_SHOWN = 8;

export function fold({key, label, summary = null, open = false, body = [], onToggle = null, cls = '', level = 'section'}) {
  const id = `fold-${key}`;
  const inner = h('div', {class: 'fold-body', id, hidden: !open}, ...body);
  const head = h('button', {type: 'button', class: 'fold-head', 'aria-expanded': String(open),
                            'aria-controls': id, onclick: () => {
    const now = head.getAttribute('aria-expanded') !== 'true';
    head.setAttribute('aria-expanded', String(now));
    inner.hidden = !now;
    if (onToggle) onToggle(key, now);
  }},
    h('span', {class: 'label'}, label),
    h('span', {class: 'fold-sum'}, summary),
    h('span', {class: 'fold-chev', 'aria-hidden': 'true'}, '›'));
  return h('section', {class: `${level === 'sub' ? 'fold-sub' : 'block'} fold ${cls}`.trim(), 'data-section': key}, head, inner);
}

export function moreRow(members, tile, {cls = 'tiles-row', shown = ROW_SHOWN} = {}) {
  const box = h('div', {class: cls}, ...members.slice(0, shown).map(tile));
  if (members.length > shown) {
    const more = h('button', {type: 'button', class: 'more-chip',
                              'aria-label': `Show ${members.length - shown} more`, onclick: () => {
      more.remove();
      box.append(...members.slice(shown).map(tile));
    }}, `+ ${members.length - shown} more`);
    box.append(more);
  }
  return box;
}
