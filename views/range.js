// range.js — what a family's range says on the screens (patch plan 7.32
// Phase 2). The range itself is core/soundfit.js's, and how a family is read,
// with its range and the readings its part doesn't give, is soundFamily's,
// drawn by families.js soundsBlock (Mark, 2026-11-15: one section, not a grid
// beside it; the grid of the first build scrolled sideways).
//   rangeLabel(content, ch) -> 'in' | 'outside' | 'alone' | null: how Built
//     from labels a character's sound part (decision B)
//   rangeNote(content, ch, jp, head) -> the line under a sound guess's
//     verdict (R10)

import {h} from './dom.js';
import {familyRange, inRange, rangeSyl} from '../core/soundfit.js';

const studied = (content, ch) => content.readingsOf(ch).filter(r => r.item).map(r => r.jp);

export function rangeLabel(content, ch) {
  const head = content.familyHeadOf(ch);
  if (!head || !studied(content, ch).length) return null;
  if (inRange(content, ch, head)) return 'in';
  const r = familyRange(content, head);
  return studied(content, ch).some(jp => {
    const p = rangeSyl(jp);
    return p && r.onsets.has(p.onset) && r.rimes.has(p.rime);
  }) ? 'alone' : 'outside';
}

// rangeNote: right or wrong, null where the answer is the part's own sound or
// rhymes with it ("You inferred it" says enough), else where in the range it
// sits: "當 is dong1: d– and –ong, both in 尚's family." As segments, so the
// renderer puts every jyutping in a .jp span: a string, or ['han', x] or
// ['jp', x]. rangeNoteText joins them, for tests and reports.
export function rangeNote(content, ch, jp, head) {
  const p = rangeSyl(jp), t = rangeSyl(content.partReading(head) || '');
  if (!p || (t && p.rime === t.rime)) return null;
  if (p.rime === 'm') return [['han', ch], ' is ', ['jp', jp], ': ', ['jp', 'ng'], ' on its own, as in ',
                              ['han', head], '’s family.'];
  const start = p.onset === '∅' ? ['no start'] : [['jp', `${p.onset}–`]];
  const off = offPathNote(content, ch, jp, head) || [];
  return [['han', ch], ' is ', ['jp', jp], ': ', ...start, ' and ', ['jp', `–${p.rime}`],
          ', both in ', ['han', head], '’s family', ...off, '.'];
}
// modalNote: where a part taught by its family's modal syllable is
// introduced (its Meet, its card, its family page; brief 7.33 decision A),
// the line that says so; null for any other part. 乙 has a reading of its own
// (jyut3) its family doesn't follow; 𢦏 has none.
export function modalNote(content, part) {
  if (!content.partModal(part)) return null;
  const jp = content.partReading(part);
  const own = content.readingsOf(part).some(r => r.item);
  return [['han', part], own ? ' isn’t read on its own here: ' : ' has no reading of its own: ',
          'most characters with it are read ', ['jp', jp], '.'];
}

// offPathNote: where a start or an ending of a guessed reading is in the
// family's range only because of characters off the path (leave-one-out,
// for `ch`), up to two of them for each, as segments to follow rangeNote
// (brief 7.33 decision B): " (–ik as in 扚 玓, off the path)"
export function offPathNote(content, ch, jp, head) {
  const p = rangeSyl(jp);
  if (!p) return null;
  const onPath = new Set([head, ...content.familyMembers(head)].filter(c => content.mainReading(c) || c === head));
  const carriers = {onset: [], rime: []};
  for (const [c, jps] of Object.entries(content.rangeReadingsOf(head))) {
    if (c === ch) continue;
    for (const x of jps.map(rangeSyl).filter(Boolean)) {
      for (const slot of ['onset', 'rime']) {
        if (x[slot] === p[slot] && !carriers[slot].includes(c)) carriers[slot].push(c);
      }
    }
  }
  const named = slot => {
    const cs = carriers[slot];
    if (!cs.length || cs.some(c => onPath.has(c)) || (slot === 'onset' && p.onset === '∅')) return null;
    return cs.slice(0, 2);
  };
  const label = slot => ['jp', slot === 'onset' ? `${p.onset}–` : `–${p.rime}`];
  const chars = cs => cs.flatMap((c, i) => (i ? [' ', ['han', c]] : [['han', c]]));
  const o = named('onset'), r = named('rime');
  const parts = [];
  if (o && r && o.join() === r.join()) parts.push([label('onset'), ' and ', label('rime'), ' as in ', ...chars(o)]);
  else {
    if (o) parts.push([label('onset'), ' as in ', ...chars(o)]);
    if (r) parts.push([label('rime'), ' as in ', ...chars(r)]);
  }
  if (!parts.length) return null;
  return [' (', ...parts.flatMap((x, i) => (i ? [', ', ...x] : x)), ', off the path)'];
}

export const rangeNoteText = segs => (segs ? segs.map(x => (Array.isArray(x) ? x[1] : x)).join('') : null);

// renderRangeNote(segs) -> the line, or null
export function renderRangeNote(segs) {
  return segs && h('p', {class: 'note range-note'},
    ...segs.map(x => (!Array.isArray(x) ? x : x[0] === 'jp' ? h('span', {class: 'jp', lang: 'en'}, x[1])
      : h('span', {lang: 'zh-Hant-HK'}, x[1]))));
}
