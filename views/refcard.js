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

import {h, han, clear, put, rubyWord, jpSpan, layerChip} from './dom.js';
import {builtFrom, roleText, standsLine, relationOf, word as wordEntry, allOver, charJp, meaningWording,
        cardWords, WORDS_SHOWN, LAYER_TEXT, partRankOf, rankSaid} from './facts.js';
import {isKnown, MAINTAIN} from '../core/state.js';
import {canMarkKnown, canForget, canKnowOff} from '../actions.js';
import {canTestMe} from '../runner.js';
import {wordChars} from './reader.js';
import {glyphTile, glyphKey} from './glyph.js';
import {roleBar, boxTitle, pct, ROLE_SAID, soundsSection} from './families.js';
import {roleCounts, soundFamily} from '../core/soundfamily.js';
import {familiesOf, familyKeyOf, familyPlan} from '../core/family.js';
import {soundLine} from '../core/tree.js';
import {shortGloss} from '../core/gloss.js';
import {charGlossWeak, offReadingsWeak, partGlossWeak, formJp, DICTIONARY_SENSE} from '../core/provenance.js';

export {WORDS_SHOWN};
export const MEMBERS_SHOWN = 16;
export const IN_TEXTS = 3;
const EXCERPT = 24;                        // characters of a line shown

const lineLength = l => l.parts.reduce((n, p) =>
  n + (p.type === 'word' ? p.chars.length : Array.from(p.text).length), 0);

// In your texts: lines that have `form`, the focus text's first, then the
// newest text's; the shortest line of each text before a second from any.
// Each is its words, every syllable over them as on the rest of the card
// (Mark, brief 7.18 P4; the Reader's rule until then), `form` marked, cut to
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
      : {form: p.form, over: wordChars(content, states, p, {charOf: content.char, all: true}).map(c => c.over),
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
    let members, reading, gloss, standsFor = null, written = null, status;
    if (content.has(id)) {
      const it = content.item(id);
      members = content.membersOf(id).map(r => content.item(r).char);
      reading = it.taughtReading || null;
      gloss = it.meaning || it.gloss || null;
      standsFor = it.standsFor && it.standsFor !== form ? it.standsFor : null;
      written = standsFor && it.written;
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
    roles.push({kind, id, reading, gloss, standsFor, written, status,
                // a meaning from Unihan's kDefinition, shown muted (7.10)
                glossWeak: kind === 'meaning' && !!gloss && partGlossWeak(content, form),
                wording: kind === 'meaning' ? meaningWording(content, form, gloss) : null,
                canTest: canTestMe(content, states, id),
                members: members.slice(0, MEMBERS_SHOWN)
                  .map(ch => ({ch, over: charJp(content, ch)})),
                more: Math.max(0, members.length - MEMBERS_SHOWN)});
  }
  return roles;
}

// `texts` (texts.js heldLines()) gives In your texts; omitted, it's empty.
// opts: {wordOf (dict.js: an off-path card's words, once their files are
// held), offKnown (a Set: the characters the learner said they know)}.
// the family page of a character's sound part, where it has one (brief
// 7.25 P1: 煮 -> "者 family: how it's read")
function familyOfPart(content, form) {
  const part = content.soundPartOf(form);
  return part && familiesOf(content).byKey.has(`f:${part}`) ? {key: `f:${part}`, head: part} : null;
}

// how a form is used as a part, for its card's bar (decided 10); null where
// no character uses it for its sound or meaning
function partUse(content, form) {
  const r = roleCounts(content, form);
  return r.sound || r.meaning ? r : null;
}

// ---- brief 7.26 (patch plan 7.26, Phase 1): what the card lacked, for the
// complete card -- its rank, the whole sound line, its family as the tree
// has it, what is built from it, and each section's line when it is closed

// 讀 <- 賣 <- 買, where the line is three or more long (the tree's)
function soundLineOf(content, form) {
  const line = soundLine(form, content);
  return line.length >= 3 ? line.map(f => ({form: f, jp: formJp(content, f).text})) : null;
}

// its family (the tree's rule: its own, else its sound part's), how that
// family is read -- its first box -- and Study's "N to learn"
function familyCardOf(content, states, form) {
  const key = familyKeyOf(content, form);
  if (!key) return null;
  const card = familiesOf(content).byKey.get(key);
  const sf = soundFamily(content, key);
  const box = sf && sf.boxes[0];
  // a grid box's title, short for the closed line: 青's c/z–ing/eng
  const title = b => (b.title.kind === 'grid'
    ? `${b.title.starts.map(x => x || '∅').join('/')}–${b.title.ends.join('/')}` : boxTitle(b));
  return {key, head: card.head, n: sf ? sf.n : card.members.length - 1, members: card.members.length,
          top: box ? {title: title(box), share: box.share} : null,
          toLearn: familyPlan(content, states, card).length, sounds: sf};
}

// what is built from it as a sound or meaning part: the tree's first column
// to the right, what the learner knows first (CO-060, as a part's members),
// then content.usesOf's order (sound uses first, then path order)
function usedInOf(content, states, form) {
  const all = [...new Set(content.usesOf(form).map(u => u.char))];
  const known = ch => isKnown(states[content.mainReading(ch)]);
  const chars = [...all.filter(known), ...all.filter(ch => !known(ch))];
  return {total: chars.length,
          tiles: chars.slice(0, MEMBERS_SHOWN).map(ch => ({ch, over: charJp(content, ch)})),
          more: Math.max(0, chars.length - MEMBERS_SHOWN)};
}

const count = (n, one, many = `${one}s`) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;

// the line each section shows closed (P2): 言 + 賣 · sounds like 賣 maai6;
// 者 family · –yu 47%; 4 words · 青春 youth; 清 · 請 · 晴; 3 lines · 《飲茶》;
// in 37 characters; 15 for its sound · 2 for its meaning. A section with
// nothing to show has none.
export function summariesOf(m) {
  const out = {};
  if (m.built && m.built.length) {
    const sound = m.built.find(b => b.role === 'sound' && b.note);
    out.built = m.built.map(b => b.part).join(' + ') + (sound ? ` · sounds like ${sound.part} ${sound.note}` : '');
  }
  if (m.familyCard) {
    const f = m.familyCard;
    out.family = `${f.head} family` + (f.top ? ` · ${f.top.title} ${pct(f.top.share)}` : '');
  }
  if (m.words && m.words.length) {
    const w = m.words[0];
    out.words = `${count(m.words.length, 'word')} · ${w.form}` + (w.gloss ? ` ${shortGloss(w.gloss)}` : '');
  }
  if (m.looksLike && m.looksLike.length) out.looksLike = m.looksLike.map(x => x.ch).join(' · ');
  if (m.inTexts && m.inTexts.length) {
    out.inTexts = `${count(m.inTexts.length, 'line')} · 《${m.inTexts[0].title}》`;
  }
  if (m.usedIn && m.usedIn.total) out.usedIn = `in ${count(m.usedIn.total, 'character')}`;
  if (m.partUse) {
    out.asPart = ROLE_SAID.filter(([k]) => m.partUse[k])
      .map(([k, w]) => `${m.partUse[k].toLocaleString('en-GB')} ${w}`).join(' · ');
  }
  return out;
}

const withSummaries = m => ({...m, summaries: summariesOf(m)});

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
              layer: r.layer || null,
              relation: r.primary ? null : relationOf(r),
              status: statusOf(content, states[id], id)};
    });
    const words = cardWords(content, main);
    return withSummaries({kind: 'char', glyph: form, main, readings, gloss: m.gloss,
            built: builtFrom(content, form),
            looksLike: familyOf(content, form).map(ch => ({ch, over: charJp(content, ch)})),
            words, inTexts, simplified, also: alsoOf(content, form), asPart: partRoles(content, states, form, {itemsOnly: true}),
            family: familyOfPart(content, form), partUse: partUse(content, form),
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
            canForget: canForget(content, states, main),
            rank: content.rank(main), partRank: partRankOf(content, form), soundLine: soundLineOf(content, form),
            familyCard: familyCardOf(content, states, form), usedIn: usedInOf(content, states, form)});
  }
  const roles = partRoles(content, states, form);
  if (roles.length) {
    // its place on the path: its first study item's (a part may be both)
    const ranks = roles.filter(r => content.has(r.id)).map(r => content.rank(r.id));
    return withSummaries({kind: 'part', glyph: form, roles, partUse: partUse(content, form),
                          rank: ranks.length ? Math.min(...ranks) : null,
                          usedIn: usedInOf(content, states, form)});
  }
  if (canKnowOff(content, form)) {
    const o = content.offchar(form);
    const known = offKnown.has(form);
    const words = [];
    for (const f of o.words) {
      const w = wordOf && wordOf(f);
      if (!w) continue;
      words.push({form: f, jp: w.jp, gloss: w.gloss, over: allOver(f, w.jp)});
      if (words.length >= WORDS_SHOWN) break;
    }
    const c = content.char(form) || {};
    return withSummaries({kind: 'offpath', glyph: form, readings: o.readings, gloss: c.gloss || '',
            // CC-CEDICT's sense, a reading only kCantonese gives: muted (7.10)
            glossWeak: charGlossWeak(c), readingsWeak: offReadingsWeak(o),
            words, wordForms: o.words, built: builtFrom(content, form), inTexts, simplified,
            also: alsoOf(content, form),
            status: known ? 'you know this' : 'not on the path', known,
            usedIn: usedInOf(content, states, form)});
  }
  return withSummaries({kind: 'other', glyph: form, built: builtFrom(content, form), inTexts,
                        usedIn: usedInOf(content, states, form)});
}

// The other forms a learner may meet the character in (brief 7.23: 說, 説),
// from curated/characters.tsv's also_written, as an array of characters.
const alsoOf = (content, form) => [...((content.char(form) || {}).also || '')];

// What the card showed, for a report.
export function shownOfRef(m) {
  const prompt = m.kind === 'char'
    ? [m.glyph, m.readings.map(r => `${r.jp} ${r.gloss || ''}`.trim()).join('; '),
       m.words.map(w => `${w.form} ${w.jp}`).join(', ')].concat(m.also && m.also.length ? [`also written ${m.also.join(' ')}`] : []).join(' | ')
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
// a tile with its jyutping over it (brief 7.6 decided 5; known or not since 7.18)
const rubyBtn = ({ch, over}, cb) => glyphTile(ch, kindOf(cb, ch),
  {size: 'sm', over: over || '', progress: progressOf(cb, ch), onTap: c => cb.onRef(c)});

// In your texts: each line a button to the Reader there (cb.onOpenText;
// without it, as during a session, the lines are shown but not tappable).
function textLines(m, cb) {
  return m.inTexts.map(x => {
    const body = [x.before ? '…' : '',
      ...x.parts.map(p => (p.form ? rubyWord(p.form, p.over, {mark: p.mark}) : han(p.text))),
      x.after ? '…' : '', h('span', {class: 'sm in-text-title'}, ' 《', x.title, '》')];
    return cb.onOpenText
      ? h('button', {type: 'button', class: 'in-text', onclick: () => cb.onOpenText(x.text, x.line)}, ...body)
      : h('p', {class: 'in-text'}, ...body);
  });
}

// 簡: written 爱 in simplified, where the learner's texts had it so (CO-043)
function simplifiedLine(m) {
  if (!m.simplified || !m.simplified.length) return null;
  return h('p', {class: 'note center simp-line'}, 'Written ',
    ...m.simplified.flatMap((f, i) => [i ? ' or ' : '', han(f)]), ' in simplified in your texts');
}

// Also written 説: the character's other forms, plain glyphs (not taught)
function alsoLine(m) {
  if (!m.also || !m.also.length) return null;
  return h('p', {class: 'note center also-line'}, 'Also written ',
    ...m.also.flatMap((f, i) => [i ? ' or ' : '', han(f)]));
}

// Built from: each part in its dotted box with its reading or meaning and
// role, Sounds like, the whole sound line (brief 7.26), the sound part's
// family where it isn't the Family section's (青 -> 井).
function builtBody(m, cb) {
  const like = m.built.find(b => b.cousins && b.cousins.length);
  const family = m.family && !(m.familyCard && m.familyCard.key === m.family.key) ? m.family : null;
  return [h('p', {class: 'built'},
    ...m.built.flatMap((b, i) => [i ? h('span', {class: 'built-plus'}, '+') : '',
      // a part and its note wrap together, never apart (7.5)
      h('span', {class: 'part'}, charBtn(b.part, cb),
        h('span', {class: 'muted'},
        // a sound part's note is its reading, a meaning part's its gloss
        b.note ? [b.role === 'sound' ? jpSpan(b.note) : b.note, ` (${roleText(b)})`] : `(${roleText(b)})`))])),
    // where the sound part's reading is no clue, the members that carry the
    // sound (CO-016: 當 <- 尚 soeng6, sounds like 黨 堂)
    like && h('p', {class: 'ref-row like-line'}, h('span', {class: 'sm'}, 'Sounds like '),
      ...like.cousins.map(x => rubyBtn(x, cb))),
    soundLineP(m),
    // how its sound part's family is read (brief 7.25 P1); not mid-session
    family && cb.onFamily && h('p', {class: 'family-link'},
      h('button', {type: 'button', class: 'link', onclick: () => cb.onFamily(family.key)},
        `${family.head} family: how it’s read ›`))];
}

// 讀 ← 賣 ← 買 (the tree's), where it is three or more long
function soundLineP(m) {
  return m.soundLine && h('p', {class: 'note ref-soundline'}, 'Sound line: ',
    ...m.soundLine.flatMap((s, i) => [i ? h('span', {'aria-hidden': 'true'}, ' ← ') : '',
                                       han(s.form), s.jp ? [' ', jpSpan(s.jp)] : '']));
}

// Family (brief 7.26 P2): how its family is read, the family page's boxes;
// Study and the family's page, never mid-session (decided 2: cb.onStudy and
// cb.onFamily are null then)
function familyBody(m, cb) {
  const f = m.familyCard;
  const tileOf = x => glyphTile(x.form, kindOf(cb, x.form), {
    size: 'sm', over: x.jp || '', progress: progressOf(cb, x.form),
    dashed: !!x.second, cls: x.second ? 'fam-second' : '',
    label: `${x.form}${x.jp ? ` ${x.jp}` : ''}${x.second ? ', a second reading' : ''}: open its card`,
    onTap: () => cb.onRef(x.form)});
  return [f.sounds && f.sounds.n ? soundsSection({sounds: f.sounds, head: f.head}, tileOf)
            : h('p', {class: 'note'}, `No other character has ${f.head} as its sound part.`),
    cb.onStudy && h('div', {class: 'btns'}, f.toLearn
      ? h('button', {type: 'button', class: 'btn', onclick: () => cb.onStudy(f.key)},
          'Study this family', h('span', {class: 'study-n'}, ` · ${f.toLearn} to learn`))
      : h('p', {class: 'note'}, 'Nothing left to learn in this family: everything here is met.')),
    cb.onFamily && h('p', {class: 'family-link'},
      h('button', {type: 'button', class: 'link', onclick: () => cb.onFamily(f.key)},
        `${f.head} family: how it’s read ›`))];
}

// Used in (P2.6): what is built from it, as tiles; the rest are in its tree
function usedInBody(m, cb) {
  const u = m.usedIn;
  return [h('p', {class: 'ref-row'}, ...u.tiles.map(x => rubyBtn(x, cb)),
    u.more ? (cb.onTree
      ? h('button', {type: 'button', class: 'link sm', onclick: () => cb.onTree(m.glyph)}, ` and ${u.more} more ›`)
      : h('span', {class: 'sm'}, ` and ${u.more} more`)) : '')];
}

function wordsBody(m) {
  return m.words.map(w => h('p', {class: 'word-line'}, rubyWord(w.form, w.over), w.gloss ? ` ${w.gloss}` : ''));
}

// A part role: its reading or meaning, what it stands for, and Test me (not
// during a session: cb.onTestMe is null then). Its characters are Used in's.
function roleBody(r, cb) {
  return [h('span', {class: 'label'}, r.kind === 'sound' ? `Sound part · ${r.status}` : `Meaning part · ${r.status}`),
    r.wording && r.wording.lead && h('p', {class: 'note part-lead'}, r.wording.lead),
    h('p', {class: `answer-line${r.wording && r.wording.quiet ? ' muted' : ''}${!r.reading && r.glossWeak ? ' weak' : ''}`},
      r.reading ? h('span', {class: 'jp big-jp'}, r.reading) : (r.wording ? r.wording.meaning : r.gloss)),
    !r.reading && r.glossWeak && h('p', {class: 'note weak-note'}, DICTIONARY_SENSE),
    r.wording && r.wording.note && h('p', {class: 'note'}, r.wording.note),
    r.standsFor && h('p', {class: 'note'}, ...standsLine(r.standsFor, r.written)),
    r.canTest && cb.onTestMe && h('div', {class: 'btns'},
      h('button', {type: 'button', class: 'btn', onclick: () => cb.onTestMe(r.id)}, 'Test me')),
    r.canTest && cb.onTestMe && h('p', {class: 'note'}, r.kind === 'sound'
      ? 'One question: predict a character’s sound from this part.'
      : 'One question: tell a character apart by this part.')];
}

// As a part (P2.7): the 7.25 role bar, then each role it is a study item in
// (the key to its border is in the glance band)
function asPartBody(m, roles, cb) {
  return [m.partUse && roleBar(m.glyph, m.partUse),
    ...roles.map(r => h('div', {class: 'ref-role'}, ...roleBody(r, cb)))];
}

// ---- the sections (brief 7.26 P2-P3), in this order. Each is drawn whole
// and folded with `hidden`, so a tap opens it without drawing the card again;
// its header says in one line what is inside.
export const SECTIONS = ['built', 'family', 'words', 'looksLike', 'inTexts', 'usedIn', 'asPart'];
export const SECTION_LABEL = {built: 'Built from', family: 'Family', words: 'Words', looksLike: 'Looks like',
                              inTexts: 'In your texts', usedIn: 'Used in', asPart: 'As a part'};
// P3: open by where the card was opened from, until the learner opens or
// closes a section themselves (cb.opened, readpath.settings.card)
export const OPEN_FROM = {reader: ['words', 'inTexts'], session: ['built', 'looksLike'], other: []};
export function isOpen(key, {from = 'other', opened = {}} = {}) {
  return key in opened ? !!opened[key] : (OPEN_FROM[from] || []).includes(key);
}

// Where a card is opened from (P3): the caller's word, else a session's or
// anywhere else; a card opened from a card keeps the first one's, for what
// it reads and what it writes (brief 7.27, decided 4).
export const cardContext = ({stacked, prev, from, inRun}) =>
  (stacked ? prev : from || (inRun ? 'session' : 'other'));

// The learner's own open sections, one map per context (brief 7.27, decided
// 4: readpath.settings.cardOpen = {reader, session, other}). The one map
// saved before 7.27 (settings.card) is taken as elsewhere's (P1, Mark), and
// a toggle saves the new shape and drops it.
export const openedIn = (settings, from) =>
  (settings.cardOpen || (settings.card ? {other: settings.card} : {}))[from] || {};
export function withToggle(settings, from, key, open) {
  const {card, ...rest} = settings;
  const all = settings.cardOpen || (card ? {other: card} : {});
  return {...rest, cardOpen: {...all, [from]: {...(all[from] || {}), [key]: open}}};
}

// a section's closed line, drawn: its characters as han, its jyutping as .jp
function summaryNodes(key, m) {
  const s = m.summaries || {};
  if (!s[key]) return null;
  switch (key) {
    case 'built': {
      const sound = m.built.find(b => b.role === 'sound' && b.note);
      return [han(m.built.map(b => b.part).join(' + ')),
              sound ? [' · sounds like ', han(sound.part), ' ', jpSpan(sound.note)] : ''];
    }
    case 'family': {
      const f = m.familyCard;
      return [han(f.head), ' family', f.top ? [' · ', jpSpan(f.top.title), ` ${pct(f.top.share)}`] : ''];
    }
    case 'words': {
      const w = m.words[0];
      return [`${m.words.length} ${m.words.length === 1 ? 'word' : 'words'} · `, han(w.form),
              w.gloss ? ` ${shortGloss(w.gloss)}` : ''];
    }
    case 'looksLike': return han(s.looksLike);
    case 'inTexts': return [`${m.inTexts.length} ${m.inTexts.length === 1 ? 'line' : 'lines'} · `,
                            han(`《${m.inTexts[0].title}》`)];
    default: return s[key];
  }
}

function fold(key, m, cb, body) {
  const open = isOpen(key, cb);
  const inner = h('div', {class: 'fold-body', id: `fold-${key}`, hidden: !open}, ...body);
  const head = h('button', {type: 'button', class: 'fold-head', 'aria-expanded': String(open),
                            'aria-controls': `fold-${key}`, onclick: () => {
    const now = head.getAttribute('aria-expanded') !== 'true';
    head.setAttribute('aria-expanded', String(now));
    inner.hidden = !now;
    if (cb.onToggle) cb.onToggle(key, now);
  }},
    h('span', {class: 'label'}, SECTION_LABEL[key]),
    h('span', {class: 'fold-sum'}, summaryNodes(key, m)),
    h('span', {class: 'fold-chev', 'aria-hidden': 'true'}, '›'));
  return h('section', {class: 'block fold', 'data-section': key}, head, inner);
}

// the sections a model has, each with its body; one with nothing to show is
// left out
function sectionsOf(m, cb) {
  const out = [];
  const has = key => !!(m.summaries || {})[key];
  if (m.built && m.built.length) out.push(['built', builtBody(m, cb)]);
  if (m.familyCard) out.push(['family', familyBody(m, cb)]);
  if (m.words && m.words.length) out.push(['words', wordsBody(m)]);
  if (m.looksLike && m.looksLike.length) out.push(['looksLike', [h('p', {class: 'ref-row'}, ...m.looksLike.map(x => rubyBtn(x, cb)))]]);
  if (m.inTexts && m.inTexts.length) out.push(['inTexts', textLines(m, cb)]);
  if (m.usedIn && m.usedIn.total) out.push(['usedIn', usedInBody(m, cb)]);
  const roles = m.kind === 'part' ? m.roles : m.asPart || [];
  if (has('asPart') || roles.length) out.push(['asPart', asPartBody(m, roles, cb)]);
  out.sort((a, b) => SECTIONS.indexOf(a[0]) - SECTIONS.indexOf(b[0]));
  return out.map(([key, body]) => fold(key, m, cb, body));
}

// "#650 on the path · Trace its steps ›", or "#378 · part #2,832 · Trace
// its steps ›" (brief 7.27, decided 2-3 and P2): its tree, what it is built
// from and what is built from it, a tap from every card, mid-session too;
// the link alone where it has no rank
function rankLine(m, cb) {
  const said = rankSaid(m, {short: true});
  const trace = cb.onTree && h('button', {type: 'button', class: 'link ref-trace',
                                          onclick: () => cb.onTree(m.glyph)}, 'Trace its steps ›');
  if (!said && !trace) return null;
  return h('p', {class: 'note ref-rank'}, said || '', said && trace ? ' · ' : '', trace || '');
}

// renderRef(el, model, {onClose, onBack, backTo, closeLabel, onRef(form), kindOf(form),
//                        onMarkKnown, onForgot, onReport, onOpenText(id, line),
//                        onTestMe(id) (none during a session), onKnowOff(bool),
//                        onTree(form) (its tree), onFamily(key), onStudy(key)
//                        (a family's page and study; none during a session),
//                        from ('reader' | 'session' | 'other'), opened ({section: bool},
//                        the learner's own), onToggle(section, open)})
// onBack/backTo: the card this one was opened from, when there is one.
// The glance band is always open (P1): the character, each reading with its
// meaning, its state and place on the path, and Mark known / I forgot this.
export function renderRef(el, m, cb) {
  const head = h('div', {class: 'top sheet-head'},
    cb.onBack
      ? h('button', {type: 'button', class: 'link back-link', onclick: cb.onBack},
          '‹ ', han(cb.backTo))
      : h('span'),
    m.status ? h('span', {class: `tag ${m.known ? 'accent' : 'learn'}`},
                 m.statusReading ? [jpSpan(m.statusReading), ` · ${m.status}`] : m.status) : h('span'),
    h('button', {type: 'button', class: 'icon-btn close-btn', 'aria-label': 'Close',
                 onclick: cb.onClose}, '✕'));
  const glyph = glyphTile(m.glyph, kindOf(cb, m.glyph),
    {size: 'xl', progress: progressOf(cb, m.glyph), cls: 'ref-head-glyph'});
  const glance = (...text) => h('div', {class: 'ref-glance'}, glyph, h('div', {class: 'ref-glance-text'}, ...text));
  const body = [head];

  if (m.kind === 'char') {
    const main = m.readings.find(r => r.main) || m.readings[0];
    const reading = r => [h('div', {class: 'jp-line'}, h('p', {class: 'jp big-jp'}, r.jp), layerChip(r.layer, LAYER_TEXT[r.layer])),
      r.gloss && h('p', {class: 'gloss-line'}, r.gloss)];
    // a character that is a part (青 止) says what its border means, beside
    // it (Mark, 7.26 Phase 3 check: not down in As a part)
    body.push(glance(...reading(main), rankLine(m, cb), (m.asPart || []).length ? glyphKey() : null));
    // each other reading on one line: its jyutping, meaning and relation
    const others = m.readings.filter(r => r !== main);
    if (others.length) {
      body.push(h('div', {class: 'ref-others'}, ...others.map(r => h('p', {class: 'ref-other'},
        jpSpan(r.jp), layerChip(r.layer, LAYER_TEXT[r.layer]), r.gloss ? ` ${r.gloss}` : '',
        h('span', {class: 'sm'}, ` · ${r.relation}; ${r.status}`)))));
    }
    body.push(alsoLine(m), simplifiedLine(m));
    body.push(h('div', {class: 'btns ref-acts'},
      // they act on the main reading: say which, where there's more than one
      m.canMarkKnown && h('button', {type: 'button', class: 'btn', onclick: cb.onMarkKnown},
        m.readings.length > 1 ? ['Mark ', jpSpan(main.jp), ' known'] : 'Mark known'),
      m.canForget && h('button', {type: 'button', class: 'btn', onclick: cb.onForgot},
        m.readings.length > 1 ? ['I forgot ', jpSpan(main.jp)] : 'I forgot this')));
    body.push(...sectionsOf(m, cb));
  } else if (m.kind === 'part') {
    body.push(glance(...m.roles.map(r => h('p', {class: 'ref-role-line'},
      r.reading ? jpSpan(r.reading) : h('span', {class: r.glossWeak ? 'weak' : ''}, r.wording ? r.wording.meaning : r.gloss),
      h('span', {class: 'sm'}, ` · ${r.kind} part`))), rankLine(m, cb), glyphKey()));
    body.push(...sectionsOf(m, cb));
  } else if (m.kind === 'offpath') {
    body.push(glance(
      h('p', {class: `jp big-jp${m.readingsWeak ? ' weak' : ''}`}, m.readings.join(' · ')),
      m.gloss && h('p', {class: `gloss-line${m.glossWeak ? ' weak' : ''}`}, m.gloss), rankLine(m, cb)));
    if (m.gloss && m.glossWeak) body.push(h('p', {class: 'note weak-note'}, DICTIONARY_SENSE));
    body.push(h('p', {class: 'note center'}, 'Not on the learning path: it’s never taught or quizzed.'));
    body.push(alsoLine(m), simplifiedLine(m));
    if (cb.onKnowOff) {
      body.push(h('div', {class: 'btns ref-acts'},
        m.known
          ? h('button', {type: 'button', class: 'btn', onclick: () => cb.onKnowOff(false)}, 'I don’t know this')
          : h('button', {type: 'button', class: 'btn', onclick: () => cb.onKnowOff(true)}, 'I know this')),
        h('p', {class: 'note'}, m.known
          ? 'Its jyutping shows again in the Reader.'
          : 'Its jyutping goes from the Reader. It’s still never taught, and doesn’t count in “readable”.'));
    }
    body.push(...sectionsOf(m, cb));
  } else {
    body.push(glyph, h('p', {class: 'note center'}, 'Not on your path.'));
    body.push(...sectionsOf(m, cb));
  }
  // Back to 清, or Back to the session; a plain Close only repeats ✕ and the
  // back gesture, so it goes (7.26: the card fits a screen with its sections closed)
  if (cb.onBack || cb.closeLabel) {
    body.push(h('div', {class: 'foot'},
      h('button', {type: 'button', class: 'btn wide', onclick: cb.onBack || cb.onClose},
        cb.onBack ? ['Back to ', han(cb.backTo)] : cb.closeLabel)));
  }
  // Report is the last thing on the card, below Back / Close (Mark, 6b)
  body.push(h('button', {type: 'button', class: 'link report-link', onclick: cb.onReport},
              'Report a problem with this'));
  put(clear(el), ...body);
}
