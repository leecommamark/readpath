// parts.js — the Parts list (patch plan 6, Phase 5; DESIGN *Screens*: Path);
// the Meaning parts list since patch plan 7.5 (the sound parts are Path's
// families); one side of the Steps tab (Pavers in 7.8, Steps since 7.12),
// Browse families the other.
//
// Every part that is a study item, sound parts then meaning parts, in path
// order. Each row: the glyph (its card), its sound or meaning, its state --
// ahead, met, unlocks its characters (met and passed its test once), known
// -- and "unlocks N characters". Test me asks the part's own test now
// (brief 6 decided 8); there is no marking a part known by hand.
//
// partsModel() is pure; renderParts() draws.

import {h, clear, put, jpSpan} from './dom.js';
import {isKnown} from '../core/state.js';
import {canTestMe} from '../runner.js';
import {glyphTile, progressOf} from './glyph.js';

export const PART_STATE = {
  ahead: 'ahead', met: 'met', unlocked: 'unlocks its characters', known: 'known'};

export function partStateOf(s) {
  if (!s) return 'ahead';
  if (isKnown(s)) return 'known';
  return s.unlocked != null ? 'unlocked' : 'met';
}

export function partsModel(content, states) {
  const groups = {sound: [], meaning: []};
  for (const id of content.path) {
    const it = content.item(id);
    if (it.kind === 'reading') continue;
    groups[it.kind].push({
      id, form: it.part, kind: it.kind,
      reading: it.kind === 'sound' ? it.taughtReading : null,
      gloss: it.kind === 'meaning' ? it.gloss : null,
      state: partStateOf(states[id]), progress: progressOf(states[id], it.kind),
      unlocks: content.membersOf(id).length,
      canTest: canTestMe(content, states, id)});
  }
  const counts = rows => ({total: rows.length,
                           known: rows.filter(r => r.state === 'known').length,
                           ahead: rows.filter(r => r.state === 'ahead').length});
  return {sound: groups.sound, meaning: groups.meaning,
          counts: {sound: counts(groups.sound), meaning: counts(groups.meaning)}};
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function row(r, cb) {
  return h('li', {class: 'part-row'},
    glyphTile(r.form, cb.kindOf ? cb.kindOf(r.form) : null,
              {size: 'md', progress: r.progress, label: `${r.form}: open its tree`,
               onTap: f => cb.onRef(f)}),
    h('div', {class: 'part-text'},
      h('p', {class: 'part-what'},
        r.reading ? jpSpan(r.reading) : (r.gloss || ''),
        h('span', {class: 'sm'}, ` · unlocks ${plural(r.unlocks, 'character')}`)),
      h('p', {class: `tag ${r.state === 'known' ? 'accent' : r.state === 'ahead' ? '' : 'learn'}`},
        PART_STATE[r.state])),
    r.canTest && h('button', {type: 'button', class: 'link', onclick: () => cb.onTestMe(r.id)}, 'Test me'));
}

// The Steps tab's switch (Pavers, brief 7.8 decided 2, P1; Steps since
// 7.12): its two screens, Sound families (Browse families) and Meaning parts.
// `view` is 'families' or 'meaning'; onSwitch(view) shows the other.
export const STEPS_VIEWS = [{key: 'families', label: 'Sound families'}, {key: 'meaning', label: 'Meaning parts'}];
export function stepsSwitch(view, onSwitch) {
  return h('div', {class: 'modes steps-switch', role: 'group', 'aria-label': 'Show'},
    ...STEPS_VIEWS.map(v => h('button', {
      type: 'button', class: `mode-btn${v.key === view ? ' on' : ''}`, 'aria-pressed': String(v.key === view),
      onclick: () => v.key !== view && onSwitch(v.key)}, v.label)));
}

// Each side's URL, and the side a URL names: #steps and #steps/meaning, and
// the older names that land there (#pavers, #pavers/meaning since 7.12;
// #path/families, #path/parts since 7.8). -> 'families' | 'meaning' | null
export const stepsUrl = view => (view === 'meaning' ? '#steps/meaning' : '#steps');
export function stepsView(hash) {
  const at = hash.replace(/^#/, '');
  if (['steps/meaning', 'pavers/meaning', 'path/parts'].includes(at)) return 'meaning';
  if (['steps', 'pavers', 'path/families'].includes(at)) return 'families';
  return null;
}

// renderParts(el, m, cb)   cb: onSwitch(view), onRef(form), kindOf, onTestMe(id)
export function renderParts(el, m, cb) {
  const group = (kind, label, note) => h('section', {class: 'block'},
    h('div', {class: 'row'},
      h('h2', {}, label),
      h('span', {class: 'sm'}, `${m.counts[kind].known} of ${m.counts[kind].total} known`)),
    h('p', {class: 'note'}, note),
    h('ul', {class: 'part-list'}, ...m[kind].map(r => row(r, cb))));
  // the sound parts are the families on Path now (patch plan 7.5): this
  // lists the meaning parts
  put(clear(el),
    h('div', {class: 'top'}),
    h('h1', {id: 'parts-h'}, 'Steps'),
    stepsSwitch('meaning', cb.onSwitch),
    h('p', {class: 'note'}, 'Tap a part to see its tree.'),
    h('p', {class: 'note'},
      'Each comes on the path just before the characters that need it. Once you’ve met it and '
      + 'passed its test, those characters unlock. Knowing characters doesn’t mark their parts known: '
      + 'Test me asks a part’s own question. A sound part is on its family’s page.'),
    group('meaning', 'In path order', 'A meaning part tells apart characters that sound the same.'));
}
