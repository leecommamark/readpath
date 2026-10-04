// refcard.js — the reference card (patch plan 4, Phase 5; Blueprint:
// reference card). Every fact about a character lives here, opened on demand
// from any character anywhere, never pushed mid-task (DESIGN *Design rules*
// 1): its readings, meaning, what it's built from, what it looks like (its
// tell-apart family), words, the rung it's on, and Mark known / I forgot
// this. A part opens a part's card: its reading or meaning, and the
// characters it unlocks. In your texts (step 5): up to three lines from the
// learner's texts that have the character, each opening the Reader there.
// Step 6: a part that is a study item offers Test me (its own test, now);
// a character off the path with a jyutping has an off-path card -- its
// readings, meaning and words, "Not on the learning path", and I know this /
// I don't know this (readpath.offKnown, never an item_state).
//
// refModel() is pure; renderRef() draws it into the overlay.

import {h, han, clear, put, rubyWord} from './dom.js';
import {builtFrom, relationText, word as wordEntry, overOf, overChar, meaningWording,
        cardWords, WORDS_SHOWN} from './facts.js';
import {isKnown, MAINTAIN} from '../core/state.js';
import {canMarkKnown, canForget, canKnowOff} from '../actions.js';
import {canTestMe} from '../runner.js';
import {wordChars} from './reader.js';
import {glyphTile, glyphKey} from './glyph.js';
import {charGlossWeak, offReadingsWeak, partGlossWeak, DICTIONARY_SENSE} from '../core/provenance.js';

export {WORDS_SHOWN};
export const MEMBERS_SHOWN = 16;
export const IN_TEXTS = 3;
const EXCERPT = 24;                        // characters of a line shown

const lineLength = l => l.parts.reduce((n, p) =>
  n + (p.type === 'word' ? p.chars.length : Array.from(p.text).length), 0);

// In your texts: lines that have `form`, the focus text's first, then the
// newest text's; the shortest line of each text before a second from any.
// Each is its words (the Reader's jyutping rule, `form` marked) cut to
// about 24 characters around it. `texts` is texts.js heldLines().
// The forms `form` was written as in the learner's texts, where s2t turned
// them into it (爱 for 愛): the card's 簡 line (patch plan 6.5, CO-043,
// Mark 2026-09-29). Each line's characters carry the form as written.
export function writtenAs(form, texts = []) {
  const out = new Set();
  for (const t of texts) {
    for (const l of t.lines || []) {
      for (const p of l.parts || []) {
        for (const c of p.chars || []) if (c.char === form && c.src && c.src !== form) out.add(c.src);
      }
    }
  }
  return [...out].sort();
}

export function inYourTexts(content, states, form, texts = []) {
  const order = [...texts].reverse().sort((a, b) => b.focus - a.focus);
  const has = l => !l.blank && l.parts.some(p => p.type === 'word' && p.chars.some(c => c.char === form));
  const per = order.map(t => t.lines.map((l, i) => ({t, l, i})).filter(x => has(x.l))
    .sort((a, b) => lineLength(a.l) - lineLength(b.l)));
  const picked = [];
  for (let round = 0; picked.length < IN_TEXTS && per.some(p => p[round]); round++) {
    for (const p of per) if (p[round] && picked.length < IN_TEXTS) picked.push(p[round]);
  }
  return picked.map(({t, l, i}) => {
    const at = l.parts.findIndex(p => p.type === 'word' && p.chars.some(c => c.char === form));
    // widen around the word until the excerpt is full
    let from = at, to = at + 1, n = lineLength({parts: l.parts.slice(from, to)});
    while (n < EXCERPT && (from > 0 || to < l.parts.length)) {
      if (to < l.parts.length) n += lineLength({parts: [l.parts[to++]]});
      if (n < EXCERPT && from > 0) n += lineLength({parts: [l.parts[--from]]});
    }
    const parts = l.parts.slice(from, to).map(p => (p.type !== 'word' ? {text: p.text}
      : {form: p.form, over: wordChars(content, states, p, {charOf: content.char}).map(c => c.over),
         mark: Array.from(p.form).indexOf(form)}));
    return {text: t.id, title: t.title, line: i, parts,
            before: from > 0, after: to < l.parts.length};
  });
}

export function statusOf(content, s, id) {
  if (!s) return 'not met yet';
  if (s.rung === MAINTAIN) return 'known';
  return content.kind(id) === 'reading' ? `rung ${s.rung} of 5` : 'learning';
}

function familyOf(content, ch) {
  const own = content.tellapart.find(r => r.char === ch);
  if (!own) return [];
  return content.tellapart.filter(r => r.head === own.head && r.char !== ch).map(r => r.char);
}

// Main-reading characters on the path that have `part` in `role`, in path
// order.
const WITH_PART = new WeakMap();
function withPart(content, part, role) {
  let m = WITH_PART.get(content);
  if (!m) {
    m = new Map();
    for (const id of content.path) {
      const it = content.item(id);
      if (it.kind !== 'reading' || !it.primary) continue;
      for (const p of content.partsOf(it.char)) {
        if (!p.listed) continue;           // 撚 under 扌 (CO-058)
        const k = `${p.role}|${p.part}`;
        if (!m.has(k)) m.set(k, []);
        m.get(k).push(it.char);
      }
    }
    WITH_PART.set(content, m);
  }
  return m.get(`${role}|${part}`) || [];
}

// A form's roles as a part (sound, meaning), each with its reading or
// meaning, status, members and whether Test me has something to ask.
// `itemsOnly` keeps the study items: a character's own card shows them
// (青 is a character and a sound part).
function partRoles(content, states, form, {itemsOnly = false} = {}) {
  const roles = [];
  for (const [kind, id] of [['sound', `s:${form}`], ['meaning', `m:${form}`]]) {
    let members, reading, gloss, standsFor = null, status;
    if (content.has(id)) {
      const it = content.item(id);
      members = content.membersOf(id).map(r => content.item(r).char);
      reading = it.taughtReading || null;
      gloss = it.meaning || it.gloss || null;
      standsFor = it.standsFor && it.standsFor !== form ? it.standsFor : null;
      status = statusOf(content, states[id], id);
    } else {
      // a part that isn't a study item still has a reading or a meaning,
      // and characters on the path it is that part of (勺 in 的)
      members = withPart(content, form, kind);
      reading = kind === 'sound' ? content.partReading(form) : null;
      gloss = kind === 'meaning' ? content.partGloss(form) : null;
      status = 'not a study item';
      if (itemsOnly || !members.length) continue;
    }
    // what the learner knows first, then path order (CO-060: songpath's
    // order, the known ones being the anchor for the part)
    const known = ch => isKnown(states[content.mainReading(ch)]);
    members = [...members.filter(known), ...members.filter(ch => !known(ch))];
    roles.push({kind, id, reading, gloss, standsFor, status,
                // a meaning from Unihan's kDefinition, shown muted (7.10)
                glossWeak: kind === 'meaning' && !!gloss && partGlossWeak(content, form),
                wording: kind === 'meaning' ? meaningWording(content, form, gloss) : null,
                canTest: canTestMe(content, states, id),
                members: members.slice(0, MEMBERS_SHOWN)
                  .map(ch => ({ch, over: overChar(content, states, ch)})),
                more: Math.max(0, members.length - MEMBERS_SHOWN)});
  }
  return roles;
}

// `texts` (texts.js heldLines()) gives In your texts; omitted, it's empty.
// opts: {wordOf (dict.js: an off-path card's words, once their files are
// held), offKnown (a Set: the characters the learner said they know)}.
export function refModel(content, states, form, texts = [], opts = {}) {
  const {wordOf = null, offKnown = new Set(), focus = null} = opts;
  const inTexts = inYourTexts(content, states, form, texts);
  const simplified = writtenAs(form, texts);
  const main = content.mainReading(form);
  if (main) {
    const m = content.item(main);
    const readings = content.readingsOf(form).filter(r => r.item).map(r => {
      const id = `r:${form}:${r.jp}`;
      return {id, jp: r.jp, gloss: r.gloss, main: !!r.primary,
              relation: r.primary ? null : relationText(r.relation),
              status: statusOf(content, states[id], id)};
    });
    const words = cardWords(content, states, main);
    return {kind: 'char', glyph: form, main, readings, gloss: m.gloss,
            built: builtFrom(content, form, states),
            looksLike: familyOf(content, form).map(ch => ({ch, over: overChar(content, states, ch)})),
            words, inTexts, simplified, asPart: partRoles(content, states, form, {itemsOnly: true}),
            // the tag at the top: the reading the card was opened for (a
            // search row's, patch plan 7A 6b: 好 hou3 from its own row says
            // "not met yet", not hou2's "known"), else the main one; named
            // whenever the character has more than one
            ...(() => {
              const at = focus && readings.some(r => r.id === focus) ? focus : main;
              return {status: statusOf(content, states[at], at), known: isKnown(states[at]),
                      statusReading: readings.length > 1 ? content.item(at).jp : null};
            })(),
            canMarkKnown: canMarkKnown(content, states, main),
            canForget: canForget(content, states, main)};
  }
  const roles = partRoles(content, states, form);
  if (roles.length) return {kind: 'part', glyph: form, roles};
  if (canKnowOff(content, form)) {
    const o = content.offchar(form);
    const known = offKnown.has(form);
    const words = [];
    for (const f of o.words) {
      const w = wordOf && wordOf(f);
      if (!w) continue;
      const over = overOf(content, states, f, w.jp)
        .map((jp, i) => (offKnown.has([...f][i]) ? null : jp));
      words.push({form: f, jp: w.jp, gloss: w.gloss, over});
      if (words.length >= WORDS_SHOWN) break;
    }
    const c = content.char(form) || {};
    return {kind: 'offpath', glyph: form, readings: o.readings, gloss: c.gloss || '',
            // CC-CEDICT's sense, a reading only kCantonese gives: muted (7.10)
            glossWeak: charGlossWeak(c), readingsWeak: offReadingsWeak(o),
            words, wordForms: o.words, built: builtFrom(content, form, states), inTexts, simplified,
            status: known ? 'you know this' : 'not on the path', known};
  }
  return {kind: 'other', glyph: form, built: builtFrom(content, form, states), inTexts};
}

// What the card showed, for a report.
export function shownOfRef(m) {
  const prompt = m.kind === 'char'
    ? [m.glyph, m.readings.map(r => `${r.jp} ${r.gloss || ''}`.trim()).join('; '),
       m.words.map(w => `${w.form} ${w.jp}`).join(', ')].join(' | ')
    : m.kind === 'part'
      ? [m.glyph, ...m.roles.map(r => `${r.kind} ${r.reading || r.gloss || ''}`)].join(' | ')
      : m.kind === 'offpath'
        ? [m.glyph, m.readings.join(' '), m.gloss, m.words.map(w => `${w.form} ${w.jp}`).join(', ')].join(' | ')
        : m.glyph;
  return {item: m.main || (m.roles && m.roles[0] && m.roles[0].id) || m.glyph,
          task: 'reference', rung: m.status || null, prompt, choices: [], answer: null};
}

// Every glyph on the card that opens its own card is a tile by its kind
// (views/glyph.js; 7.5 retired the dotted box): Built from, Looks like and a
// part's characters (Mark, step 6 iPhone check: Looks like was tappable
// with nothing to say so). cb.kindOf is glyph.js glyphKind over the content.
const kindOf = (cb, ch) => (cb.kindOf ? cb.kindOf(ch) : null);
// its state in its border (after 7.7, Mark: every tile but a question's);
// cb.progressOf is glyph.js tileProgress over the learner's states
const progressOf = (cb, ch) => (cb.progressOf ? cb.progressOf(ch) : null);
const charBtn = (ch, cb) => glyphTile(ch, kindOf(cb, ch),
  {size: 'sm', progress: progressOf(cb, ch), onTap: c => cb.onRef(c)});
// a tile with its jyutping over it (blank where known; brief 7.6 decided 5)
const rubyBtn = ({ch, over}, cb) => glyphTile(ch, kindOf(cb, ch),
  {size: 'sm', over: over || '', progress: progressOf(cb, ch), onTap: c => cb.onRef(c)});

// In your texts: each line a button to the Reader there (cb.onOpenText;
// without it, as during a session, the lines are shown but not tappable).
function textsSection(m, cb) {
  if (!m.inTexts || !m.inTexts.length) return null;
  return section('In your texts', ...m.inTexts.map(x => {
    const body = [x.before ? '…' : '',
      ...x.parts.map(p => (p.form ? rubyWord(p.form, p.over, {mark: p.mark}) : han(p.text))),
      x.after ? '…' : '', h('span', {class: 'sm in-text-title'}, ' 《', x.title, '》')];
    return cb.onOpenText
      ? h('button', {type: 'button', class: 'in-text', onclick: () => cb.onOpenText(x.text, x.line)}, ...body)
      : h('p', {class: 'in-text'}, ...body);
  }));
}

// 簡: written 爱 in simplified, where the learner's texts had it so (CO-043)
function simplifiedLine(m) {
  if (!m.simplified || !m.simplified.length) return null;
  return h('p', {class: 'note center simp-line'}, 'Written ',
    ...m.simplified.flatMap((f, i) => [i ? ' or ' : '', han(f)]), ' in simplified in your texts');
}

// Built from: each part in its dotted box with its reading or meaning and
// role, then, where the sound part's reading is no clue, the members that
// carry the sound (CO-016: 當 <- 尚 soeng6, sounds like 黨 堂)
function builtSection(built, cb) {
  const like = built.find(b => b.cousins && b.cousins.length);
  return section('Built from', h('p', {class: 'built'},
    ...built.flatMap((b, i) => [i ? h('span', {class: 'built-plus'}, '+') : '',
      // a part and its note wrap together, never apart (7.5)
      h('span', {class: 'part'}, charBtn(b.part, cb),
        h('span', {class: 'muted'}, b.note ? `${b.note} (${b.role})` : `(${b.role})`))])),
    like && h('p', {class: 'ref-row like-line'}, h('span', {class: 'sm'}, 'Sounds like '),
      ...like.cousins.map(x => rubyBtn(x, cb))));
}

function section(label, ...body) {
  return h('section', {class: 'block'}, h('span', {class: 'label'}, label), ...body);
}

// A part role: its reading or meaning, what it stands for, its characters,
// and Test me (not during a session: cb.onTestMe is null then).
function roleSection(r, cb) {
  return section(r.kind === 'sound' ? `Sound part · ${r.status}` : `Meaning part · ${r.status}`,
    r.wording && r.wording.lead && h('p', {class: 'note part-lead'}, r.wording.lead),
    h('p', {class: `answer-line${r.wording && r.wording.quiet ? ' muted' : ''}${!r.reading && r.glossWeak ? ' weak' : ''}`},
      r.reading ? h('span', {class: 'mono big-jp'}, r.reading) : (r.wording ? r.wording.meaning : r.gloss)),
    !r.reading && r.glossWeak && h('p', {class: 'note weak-note'}, DICTIONARY_SENSE),
    r.wording && r.wording.note && h('p', {class: 'note'}, r.wording.note),
    r.standsFor && h('p', {class: 'note'}, 'It stands for ', han(r.standsFor)),
    h('p', {class: 'ref-row'}, ...r.members.map(x => rubyBtn(x, cb)),
      r.more ? h('span', {class: 'sm'}, ` and ${r.more} more`) : ''),
    r.canTest && cb.onTestMe && h('div', {class: 'btns'},
      h('button', {type: 'button', class: 'btn', onclick: () => cb.onTestMe(r.id)}, 'Test me')),
    r.canTest && cb.onTestMe && h('p', {class: 'note'}, r.kind === 'sound'
      ? 'One question: predict a character’s sound from this part.'
      : 'One question: tell a character apart by this part.'));
}

// renderRef(el, model, {onClose, onBack, backTo, closeLabel, onRef(form), kindOf(form),
//                        onMarkKnown, onForgot, onReport, onOpenText(id, line),
//                        onTestMe(id) (none during a session), onKnowOff(bool),
//                        onTree(form) (its tree; none during a session)})
// onBack/backTo: the card this one was opened from, when there is one.
export function renderRef(el, m, cb) {
  const head = h('div', {class: 'top sheet-head'},
    cb.onBack
      ? h('button', {type: 'button', class: 'link back-link', onclick: cb.onBack},
          '‹ ', han(cb.backTo))
      : h('span'),
    m.status ? h('span', {class: `tag ${m.known ? 'accent' : 'learn'}`},
                 m.statusReading ? `${m.statusReading} · ${m.status}` : m.status) : h('span'),
    h('button', {type: 'button', class: 'icon-btn close-btn', 'aria-label': 'Close',
                 onclick: cb.onClose}, '✕'));
  const body = [head, glyphTile(m.glyph, kindOf(cb, m.glyph),
    {size: 'xxl', progress: progressOf(cb, m.glyph), cls: 'ref-head-glyph'})];

  if (m.kind === 'char') {
    body.push(h('div', {class: 'ref-readings'},
      ...m.readings.map(r => h('div', {class: 'reading-block center'},
        h('p', {class: 'mono big-jp'}, r.jp),
        r.gloss && h('p', {class: 'gloss-line'}, r.gloss),
        !r.main && h('p', {class: 'sm'}, `${r.relation}; ${r.status}`)))));
    body.push(simplifiedLine(m));
    if (m.built.length) {
      body.push(builtSection(m.built, cb));
    }
    if (m.looksLike.length) {
      body.push(section('Looks like', h('p', {class: 'ref-row'},
        ...m.looksLike.map(x => rubyBtn(x, cb)))));
    }
    if (m.words.length) {
      body.push(section('Words', ...m.words.map(w => h('p', {class: 'word-line'},
        rubyWord(w.form, w.over), w.gloss ? ` ${w.gloss}` : ''))));
    }
    for (const r of m.asPart || []) body.push(roleSection(r, cb));
    // a character that is a part item (青 止) says what its border means
    if ((m.asPart || []).length) body.push(glyphKey());
    body.push(textsSection(m, cb));
    body.push(h('section', {class: 'block'}, h('div', {class: 'btns'},
      // they act on the main reading: say which, where there's more than one
      m.canMarkKnown && h('button', {type: 'button', class: 'btn', onclick: cb.onMarkKnown},
        m.readings.length > 1 ? `Mark ${m.readings.find(r => r.main).jp} known` : 'Mark known'),
      m.canForget && h('button', {type: 'button', class: 'btn', onclick: cb.onForgot},
        m.readings.length > 1 ? `I forgot ${m.readings.find(r => r.main).jp}` : 'I forgot this'))));
  } else if (m.kind === 'part') {
    for (const r of m.roles) body.push(roleSection(r, cb));
    body.push(glyphKey());
  } else if (m.kind === 'offpath') {
    body.push(h('div', {class: 'ref-readings'},
      h('div', {class: 'reading-block center'},
        h('p', {class: `mono big-jp${m.readingsWeak ? ' weak' : ''}`}, m.readings.join(' · ')),
        m.gloss && h('p', {class: `gloss-line${m.glossWeak ? ' weak' : ''}`}, m.gloss),
        m.gloss && m.glossWeak && h('p', {class: 'note weak-note'}, DICTIONARY_SENSE))));
    body.push(h('p', {class: 'note center'}, 'Not on the learning path: it’s never taught or quizzed.'));
    body.push(simplifiedLine(m));
    if (m.built.length) {
      body.push(builtSection(m.built, cb));
    }
    if (m.words.length) {
      body.push(section('Words', ...m.words.map(w => h('p', {class: 'word-line'},
        rubyWord(w.form, w.over), w.gloss ? ` ${w.gloss}` : ''))));
    }
    body.push(textsSection(m, cb));
    if (cb.onKnowOff) {
      body.push(h('section', {class: 'block'}, h('div', {class: 'btns'},
        m.known
          ? h('button', {type: 'button', class: 'btn', onclick: () => cb.onKnowOff(false)}, 'I don’t know this')
          : h('button', {type: 'button', class: 'btn', onclick: () => cb.onKnowOff(true)}, 'I know this')),
        h('p', {class: 'note'}, m.known
          ? 'Its jyutping shows again in the Reader.'
          : 'Its jyutping goes from the Reader. It’s still never taught, and doesn’t count in “readable”.')));
    }
  } else {
    body.push(h('p', {class: 'note center'}, 'Not on your path.'));
    body.push(textsSection(m, cb));
  }
  // its tree (patch plan 7.7): what it is built from and what is built from
  // it; not from inside a session
  if (cb.onTree && (m.kind === 'char' || m.kind === 'part' || m.kind === 'offpath')) {
    body.push(h('section', {class: 'block jumps'},
      h('button', {type: 'button', class: 'jump', onclick: () => cb.onTree(m.glyph)},
        h('span', {class: 'jump-text'}, h('b', {}, 'Its tree'),
          h('span', {class: 'sm'}, 'What it’s built from, and what’s built from it')),
        h('span', {class: 'jump-go', 'aria-hidden': 'true'}, '›'))));
  }
  body.push(h('div', {class: 'foot'},
    h('button', {type: 'button', class: 'btn wide', onclick: cb.onBack || cb.onClose},
      cb.onBack ? ['Back to ', han(cb.backTo)] : (cb.closeLabel || 'Close'))));
  // Report is the last thing on the card, below Back / Close (Mark, 6b)
  body.push(h('button', {type: 'button', class: 'link report-link', onclick: cb.onReport},
              'Report a problem with this'));
  put(clear(el), ...body);
}
