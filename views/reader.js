// reader.js — the Reader (patch plan 5, Phase 4; DESIGN *Screens*: Reader).
//
// A port of songpath's reader (static/js/reader.js): the text as its lines
// have it, punctuation kept, each word's characters over their jyutping --
// but jyutping only over a character not known in the reading its word
// gives (decided 5), and over one not on the path (decided 10), which is
// also listed at the foot as "Not taught yet" -- unless the learner has said
// they know it (readpath.offKnown, patch plan 6): then neither. Read mode: tap a word for
// its meaning (a panel at the foot, whose characters open their reference
// cards), or Show all meanings under every word. A long text is read a
// section at a time (core/sections.js), and a text s2t changed can be shown
// as written. Mark mode (Phase 5): tap a character to mark it known, or a
// known one for "I forgot this" (the shell does it, through actions.js, with
// an Undo). Reading changes nothing: no state is touched here.
//
// readerModel() is pure (a test reads it without a DOM); renderReader()
// draws it. What a tap does is the shell's (main.js).

import {h, han, clear, put, jpSpan, layerChip} from './dom.js';
import {LAYER_TEXT} from './facts.js';
import {readingItemFor} from '../core/focus.js';
import {isKnown} from '../core/state.js';
import {coverage} from '../core/coverage.js';
import {tokensOf} from '../core/lines.js';
import {sectionsOf, entryLine, entryIndex} from '../core/sections.js';
import {glyphTile} from './glyph.js';
import {shortGloss as cutGloss} from '../core/gloss.js';
import {charGloss, DICTIONARY_SENSE} from '../core/provenance.js';

const GLOSS_SHOWN = 18;                    // characters of a gloss under a word

// A gloss under a word: core/gloss.js's one rule, cut to fit under a word;
// the panel shows the whole meaning.
const shortGloss = g => cutGloss(g, GLOSS_SHOWN);

// A word's meaning: the dictionary's for a word of 2+ characters; for one
// character, its lone reading's (brief 7.16; the content's curated gloss), else the
// dictionary's.
// -> {text, weak}: muted as core/provenance.js says (brief 7.11).
export function wordGloss(content, form, {wordOf, charOf}) {
  if (Array.from(form).length > 1) return {text: ((wordOf && wordOf(form)) || {}).gloss || '', weak: false};
  return charGloss(content, form, charOf || null, {lone: true});
}
export const glossOf = (content, form, opts) => wordGloss(content, form, opts).text;

// One word part -> its characters as the Reader shows them:
//   {char, shown, over, id, known, off, offKnown, layer}
//   shown  the form on the page: as written when asked for and s2t changed it
//   over   the jyutping over it, or null where it's known in that reading
//   id     its reading item (the word's jyutping decides it), null off the path
//   offKnown  off the path, and in the learner's offKnown set: no jyutping
//   layer  文 or 白: the mark on the reading it has here (brief 7.16), or null
export function wordChars(content, states, part, {asWritten = false, charOf, offKnown} = {}) {
  const jps = part.jp ? part.jp.split(' ') : [];
  const perChar = jps.length === part.chars.length;
  return part.chars.map((c, k) => {
    const id = readingItemFor(content, c.char, perChar ? jps[k] : '', part.chars.length === 1);
    const syl = perChar ? jps[k]
      : id ? content.item(id).jp : ((charOf && charOf(c.char)) || {}).jp || '';
    const known = !!id && isKnown(states[id]);
    const offK = !id && !!offKnown && offKnown.has(c.char);
    return {char: c.char, shown: asWritten && c.src ? c.src : c.char,
            over: known || offK ? null : (syl || null), id, known, off: !id, offKnown: offK,
            layer: (id && content.item(id).layer) || null};
  });
}

// readerModel(content, states, text, lines, opts) -> what the Reader shows
//   opts: {section, asWritten, showAll, selected ('line:part'), mode ('read' |
//          'mark'), wordOf, charOf, offKnown (a Set of characters)}
export function readerModel(content, states, text, lines, opts = {}) {
  const {asWritten = false, showAll = false, mode = 'read'} = opts;
  const selected = mode === 'read' ? opts.selected || null : null;
  const sections = sectionsOf(lines);
  const i = Math.max(0, Math.min(sections.length - 1, opts.section || 0));
  const whole = coverage(content, states, tokensOf(lines));
  const words = [];
  const shownLines = sections[i].map(e => {
    const line = entryLine(lines, e);
    if (line.blank) return {blank: true};
    const at = entryIndex(e), from = typeof e === 'number' ? 0 : e.from;
    return {line: at, parts: line.parts.map((p, k) => {
      if (p.type !== 'word') return {type: 'text', text: p.text};
      words.push({form: p.form, jp: p.jp});
      const key = `${at}:${from + k}`;
      const {text: gloss, weak} = wordGloss(content, p.form, opts);
      return {type: 'word', key, form: p.form, gloss, weak, short: showAll ? shortGloss(gloss) : '',
              selected: key === selected, chars: wordChars(content, states, p, {asWritten, charOf: opts.charOf,
                                                    offKnown: opts.offKnown})};
    })};
  });
  const here = coverage(content, states, words);
  return {
    id: text.id, title: text.title, focus: !!text.focus,
    pct: whole.pct, toLearn: whole.toLearn,
    offPath: whole.offPath.filter(ch => !(opts.offKnown && opts.offKnown.has(ch))),
    canAsWritten: !!text.src, asWritten, showAll, mode,
    section: {i, n: sections.length, pct: here.pct},
    lines: shownLines,
  };
}

// The meaning panel for the selected word, or null.
export function selectedWord(m) {
  for (const l of m.lines) {
    for (const p of l.parts || []) {
      if (p.selected) {
        return {key: p.key, form: p.form, gloss: p.gloss, weak: !!p.weak, line: l.line, chars: p.chars,
                // P6 (brief 7.16): which reading each marked character has here
                layers: p.chars.filter(c => c.layer).map(c => ({char: c.char, layer: c.layer,
                                                                 jp: c.id.split(':')[2]}))};
      }
    }
  }
  return null;
}

// What a report from the Reader carries (decided 11): the text and the line,
// or the word with what its meaning showed.
export function shownOfReader(m, word = null) {
  const lineText = l => (l.parts || []).map(p => (p.type === 'word' ? p.form : p.text)).join('');
  if (word) {
    const line = m.lines.find(l => l.line === word.line);
    return {item: word.chars.length === 1 && word.chars[0].id ? word.chars[0].id : word.form,
            task: 'reader-word', rung: null,
            prompt: [word.form, word.chars.map(c => c.over || '').join(' ').trim(), word.gloss,
                     `${m.title}: ${line ? lineText(line) : ''}`].join(' | '),
            choices: [], answer: null};
  }
  const first = m.lines.find(l => !l.blank);
  return {item: m.title, task: 'reader', rung: null,
          prompt: `${m.title} | section ${m.section.i + 1} of ${m.section.n} | ${first ? lineText(first) : ''}`,
          choices: [], answer: null};
}

// ---- drawing

function charCell(c) {
  return h('span', {class: `rc${c.off ? ' off' : ''}`},
    h('span', {class: 'rt jp', lang: 'en'}, c.over || ' '),
    h('span', {class: 'rb'}, c.shown));
}

function sectionNav(m, cb, where) {
  if (m.section.n < 2) return '';
  return h('nav', {class: `section-nav ${where}`, 'aria-label': 'Sections'},
    h('button', {type: 'button', class: 'btn quiet sec-btn', disabled: m.section.i === 0,
                 'aria-label': 'Previous section', onclick: () => cb.onSection(m.section.i - 1)}, '‹'),
    h('span', {class: 'sm'}, `Section ${m.section.i + 1} of ${m.section.n} · ${m.section.pct}% readable here`),
    h('button', {type: 'button', class: 'btn quiet sec-btn', disabled: m.section.i === m.section.n - 1,
                 'aria-label': 'Next section', onclick: () => cb.onSection(m.section.i + 1)}, '›'));
}

export const MODE_HINT = {
  read: 'Tap a word for its meaning.',
  mark: 'Tap a character you know to mark it known, or a known one if you’ve forgotten it.',
};

// renderReader(el, model, cb)
//   cb: onBack, onFocus, onShowAll(bool), onAsWritten(bool), onSection(i),
//       onWord(key|null), onRef(char), onReport(word|null), onMode(mode),
//       onMark(char cell)
export function renderReader(el, m, cb) {
  const toggle = (label, checked, on) => h('label', {class: 'toggle'},
    h('input', {type: 'checkbox', checked: checked || false, onchange: e => on(e.target.checked)}),
    ' ', label);

  const body = h('div', {class: 'reader-text', lang: 'zh-Hant-HK'},
    ...m.lines.map(l => (l.blank ? h('div', {class: 'rgap'})
      : h('p', {class: 'rline'}, ...l.parts.map(p => (p.type === 'text'
        ? h('span', {class: 'rtext'}, p.text)
        : m.mode === 'mark'
          ? h('span', {class: 'rword marking'},
              h('span', {class: 'rw'}, ...p.chars.map(c => h('button', {
                type: 'button', class: `rc-mark${c.known ? ' is-known' : ''}${c.off ? ' is-off' : ''}`,
                'aria-label': c.off ? `${c.char}: not on the path` : c.known
                  ? `${c.char}: known; tap if you’ve forgotten it` : `${c.char}: mark known`,
                onclick: () => cb.onMark(c)}, charCell(c)))),
              p.short && h('span', {class: `rgloss${p.weak ? ' weak' : ''}`, lang: 'en'}, p.short))
          : h('button', {type: 'button', class: `rword${p.selected ? ' sel' : ''}`,
                         'aria-label': `${p.form}: its meaning`,
                         onclick: () => cb.onWord(p.selected ? null : p.key)},
              h('span', {class: 'rw'}, ...p.chars.map(charCell)),
              p.short && h('span', {class: `rgloss${p.weak ? ' weak' : ''}`, lang: 'en'}, p.short))))))));

  const modes = h('div', {class: 'modes', role: 'group', 'aria-label': 'Mode'},
    ...['read', 'mark'].map(k => h('button', {
      type: 'button', class: `mode-btn${m.mode === k ? ' on' : ''}`, 'aria-pressed': String(m.mode === k),
      onclick: () => m.mode !== k && cb.onMode(k)}, k === 'read' ? 'Read' : 'Mark')));

  const word = selectedWord(m);
  const panel = word && h('aside', {class: 'word-panel', 'aria-label': `${word.form}: meaning`},
    h('div', {class: 'row'},
      h('span', {class: 'rw big'}, ...word.chars.map(charCell)),
      h('button', {type: 'button', class: 'icon-btn close-btn', 'aria-label': 'Close',
                   onclick: () => cb.onWord(null)}, '✕')),
    h('p', {class: `gloss-line${word.weak ? ' weak' : ''}`}, word.gloss || 'No meaning in the dictionary for this one.'),
    word.weak && h('p', {class: 'note weak-note'}, DICTIONARY_SENSE),
    ...word.layers.map(x => h('p', {class: 'note layer-note'},
      han(x.char), ' here is ', jpSpan(x.jp), `, ${LAYER_TEXT[x.layer]} `, layerChip(x.layer, LAYER_TEXT[x.layer]))),
    h('div', {class: 'links'},
      ...word.chars.map(c => glyphTile(c.char, cb.kindOf ? cb.kindOf(c.char) : null,
                                        {size: 'sm', progress: cb.progressOf ? cb.progressOf(c.char) : null,
                                         onTap: ch => cb.onRef(ch)}))),
    // Report is the last thing on any card (Mark, 2026-09-29, 6b)
    h('button', {type: 'button', class: 'link', onclick: () => cb.onReport(word)},
      'Report a problem with this'));

  put(clear(el),
    h('div', {class: 'top'},
      h('button', {type: 'button', class: 'link back-btn', onclick: cb.onBack}, '‹ Back'),
      h('span', {})),
    h('h1', {id: 'reader-h', class: 'reader-title'}, han(m.title)),
    h('div', {class: 'reader-meta'},
      h('span', {}, `${m.pct}% readable` + (m.toLearn ? ` · ${m.toLearn} ${m.toLearn === 1 ? 'reading' : 'readings'} to learn` : '')),
      m.focus ? h('span', {class: 'tag accent'}, 'Focus')
        : h('button', {type: 'button', class: 'link', onclick: cb.onFocus}, 'Make focus')),
    h('div', {class: 'bar', 'aria-hidden': 'true'}, h('i', {style: `width:${m.pct}%`})),
    h('div', {class: 'reader-controls'},
      modes,
      toggle('Show all meanings', m.showAll, cb.onShowAll),
      m.canAsWritten && toggle('As written', m.asWritten, cb.onAsWritten)),
    m.canAsWritten && h('p', {class: 'note'},
      m.asWritten ? 'Shown as it was pasted, in simplified.' : 'Shown in traditional; it was pasted in simplified.'),
    h('p', {class: 'note mode-hint'}, MODE_HINT[m.mode]),
    sectionNav(m, cb, 'top'),
    body,
    sectionNav(m, cb, 'foot'),
    m.offPath.length > 0 && h('section', {class: 'block not-taught'},
      h('span', {class: 'label'}, 'Not taught yet'),
      h('p', {class: 'marks'}, han(m.offPath.join(' '))),
      h('p', {class: 'note'},
        'These aren’t on the path, so they show their jyutping and don’t count in “readable”.')),
    h('button', {type: 'button', class: 'link foot-report', onclick: () => cb.onReport(null)},
      'Report a problem with this text'),
    panel);
}
