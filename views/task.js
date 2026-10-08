// task.js — the task cards (patch plan 4, Phase 4; Blueprint: Session).
//
// cardModel(content, task, rng) is pure: a task descriptor (core/tasks.js)
// in, what the card shows out. renderTask() draws it. A card asks one
// question and shows only what that question needs (DESIGN *Design rules*
// 1); the feedback is right or wrong and the answer, and the character opens
// its reference card (Phase 5), where every other fact lives.
//
// Kinds of card:
//   teach     a taught Meet: glyph, reading, meaning, one word, built from
//   guess     an inferred Meet: a guess first (not scored: a Meet is not a
//             test), then the reading, meaning and one word
//   question  rungs 2-4: scored, with "I don't know" (a miss; Phase 0,
//             decided 3)
//   part      a part's Meet: a sound part's reading and what it unlocks; a
//             meaning part's meaning and the character it stands for
//   question  also a part's test: Predict (a member's reading from its sound
//             part) and Tell apart (a member of a family, from its meaning)
//   standin   a part test with nothing to ask (no member left): passed

import {h, han, clear, put, rubyWord, jpSpan, layerChip} from './dom.js';
import {cardWords, word as wordEntry, builtFrom, relationOf, overOf, meaningWording,
        LAYER_TEXT} from './facts.js';
import {kindOf} from '../core/content.js';
import {readingChoices, characterChoices, meaningChoices,
        tellApartChoices} from '../core/choices.js';
import {toneless} from '../core/content.js';
import {WORD_MAX} from '../core/tasks.js';
import {readingItemFor} from '../core/focus.js';
import {sentenceSpans} from '../core/lines.js';
import {wordChars} from './reader.js';
import {glyphTile} from './glyph.js';

// Sound patterns taught at Predict (DESIGN *Sound patterns*), by the code
// export_content.py records per member in sound_part.patterns.
export const PATTERN_TEXT = {
  ng_j: 'In this series ng- becomes j- before yu and i.',
};

function partCard(content, task, base, states = {}) {
  const it = content.item(task.item);
  const key = jp => content.syllables.get(toneless(jp))?.key;
  if (task.task === 'part_meet') {
    const members = content.membersOf(task.item);
    if (it.kind === 'sound') {
      const same = members.filter(id => key(content.item(id).jp) === key(it.taughtReading));
      return {...base, kind: 'part', glyph: it.part, lead: 'A new sound part',
              reveal: {jp: it.taughtReading},
              facts: [`Unlocks ${members.length} characters on your path; ` +
                      `${same.length} of them sound like it.`],
              choices: [], answer: null};
    }
    // worded as its reliability allows (CO-059): a misleading part's note
    // comes first, its meaning muted after
    const w = meaningWording(content, it.part, it.meaning || it.gloss);
    return {...base, kind: 'part', glyph: it.part, lead: 'A new meaning part',
            reveal: {gloss: w.meaning}, partLead: w.lead, partNote: w.note, quiet: w.quiet,
            standsFor: it.standsFor && it.standsFor !== it.part ? it.standsFor : null,
            facts: [`It helps tell apart ${plural(it.resolves.length, 'family', 'families')} of characters that sound alike.`],
            choices: [], answer: null};
  }
  if (task.task === 'predict' && task.target) {
    const m = content.item(task.target);
    const pat = (it.patterns || []).find(p => p.startsWith(`${m.char}:`));
    // Test me on a part not met yet (Mark, step 6 6b): nothing has taught it,
    // so the lead says what it is rather than "You know"
    return {...base, kind: 'question', glyph: m.char, target: task.target,
            from: {part: it.part, note: it.taughtReading, kind: 'sound', verb: 'Predict:',
                   met: base.met !== false},
            choices: readingChoices(content, m.char, m.jp, base.rng, base.pool).map(reading),
            answer: m.jp,
            // the meaning and the card's words with the reading, as the
            // inferred Meet shows them, so the answer teaches without a tap
            // (brief 7.9; the card's words since 7.10)
            reveal: {glyph: m.char, jp: m.jp, gloss: m.gloss,
                     words: cardWords(content, task.target),
                     pattern: pat ? PATTERN_TEXT[pat.split(':')[1]] || null : null}};
  }
  if (task.task === 'tell_apart' && task.target) {
    const t = tellApartChoices(content, task.target, base.rng, it.part, states);
    const row = ch => content.tellapart.find(r => r.head === task.target && r.char === ch);
    const a = content.item(content.mainReading(t.answer));
    return {...base, kind: 'question', lead: 'Which one means', text: a.gloss, hint: a.jp,
            target: t.answer,
            choices: t.choices.map(ch => ({value: ch, label: ch, type: 'han'})),
            answer: t.answer,
            // the reveal leads with what makes them sound alike, the shared
            // sound part (CO-048), then a line per choice: the character, its
            // reading and meaning, then its meaning part and what that part
            // means (CO-049; Mark, 2026-09-29: 清 cing1 clear · 氵 water)
            reveal: {glyph: t.answer, jp: a.jp,
                     // and the answer's card words under them (7.9, 7.10),
                     // of 4 characters at most (brief 7.20 P1: not
                     // 黔東南苗族侗族自治州)
                     words: cardWords(content, content.mainReading(t.answer))
                       .filter(w => [...w.form].length <= WORD_MAX),
                     head: {char: task.target, jp: content.partReading(task.target)},
                     marks: t.choices.map(ch => ({char: ch, part: row(ch).meaning_part,
                                                  gloss: row(ch).part_gloss, jp: row(ch).reading,
                                                  meaning: content.item(content.mainReading(ch)).gloss}))}};
  }
  return {...base, kind: 'standin', glyph: it.part, lead: 'Nothing to ask about this part today',
          choices: [], answer: null};
}

const reading = jp => ({value: jp, label: jp, type: 'jp'});
// "1 family", not "1 families" (patch plan 6.5, CO-083)
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// cardModel(content, task, rng, pool, states, {lineOf}): `pool` is the toned
// readings of the session's other items, which reading choices draw from
// (runner.js); `states` the learner's, for which characters of a word are
// known; `lineOf({text, line})` the focus text's line for a sentence task
// (texts.js lineAt), null when it's gone.
export function cardModel(content, task, rng, pool = [], states = {}, {lineOf = null} = {}) {
  const base = {task: task.task, item: task.item, rung: task.rung, asked: task.asked,
                fallback: task.fallback, role: task.role};
  if (content.kind(task.item) !== 'reading') {
    const m = partCard(content, task, {...base, rng, pool, met: !!states[task.item]}, states);
    delete m.rng;
    delete m.pool;
    delete m.met;
    return m;
  }
  const it = content.item(task.item);
  const reveal = {glyph: it.char, jp: it.jp, gloss: it.gloss, layer: it.layer || null,
                  words: cardWords(content, task.item)};
  // a question's answer teaches as a part test's does: the reading, its
  // meaning and the card's words (brief 7.9, Mark: "all of the tests"; the
  // card's words, all of them, since 7.10)
  const asked = reveal;

  if (task.task === 'meet') {
    const from = task.inferred_from;
    if (!from) {
      const pattern = task.pattern && {
        main: content.item(task.pattern.main).jp,
        relation: relationOf(it),
      };
      return {...base, kind: 'teach', glyph: it.char, reveal, pattern,
              lead: pattern ? `A new reading of ${it.char}` : 'A new character',
              built: pattern ? [] : builtFrom(content, it.char),
              choices: [], answer: null};
    }
    const part = content.item(from);
    if (kindOf(from) === 'sound') {
      return {...base, kind: 'guess', glyph: it.char, reveal,
              lead: `You know ${part.part} ${part.taughtReading}. Guess:`,
              from: {part: part.part, note: part.taughtReading, kind: 'sound'},
              choices: readingChoices(content, it.char, it.jp, rng, pool).map(reading),
              answer: it.jp};
    }
    const m = meaningChoices(content, task.item, rng);
    return {...base, kind: 'guess', glyph: it.char, reveal,
            lead: `You know ${part.part} ${part.gloss}. Which meaning fits?`,
            from: {part: part.part, note: part.gloss, kind: 'meaning'},
            choices: m.choices.map(g => ({value: g, label: g, type: 'text'})),
            answer: m.answer};
  }

  if (task.task === 'meaning') {                    // rung 3
    const c = characterChoices(content, task.item, rng);
    return {...base, kind: 'question', lead: 'Which one means',
            text: it.gloss, hint: it.jp,
            choices: c.choices.map(ch => ({value: ch, label: ch, type: 'han'})),
            answer: it.char, reveal: {...asked, answerLabel: it.char, answerHan: true}};
  }

  if (task.task === 'reading') {                    // rung 2
    // the meaning is a hint to ask for, not shown: shown, it can answer the
    // question without the character (Mark, 2026-09-29: 出)
    const choices = readingChoices(content, it.char, it.jp, rng, pool).map(reading);
    return {...base, kind: 'question', lead: 'How is it read?', glyph: it.char,
            hint: it.gloss, hintOnAsk: true,
            choices, answer: it.jp, reveal: {...asked, answerLabel: it.jp}};
  }
  // rung 5: a sentence of the focus text, the character marked in the reading
  // its word gives, jyutping over the other characters not known in theirs
  // (decided 9); the choices as rung 4's
  if (task.task === 'sentence') {
    const s = sentenceCard(content, states, task, it, lineOf);
    if (s) {
      const choices = readingChoices(content, it.char, it.jp, rng, pool, s.others).map(reading);
      return {...base, kind: 'question', lead: 'Read the marked character', sentence: s.sentence,
              choices, answer: it.jp, reveal: {...asked, answerLabel: it.jp}};
    }
  }
  // rung 4 (and rung 5's fallback): the word, the target marked and without
  // jyutping; jyutping over each OTHER character the learner doesn't know in
  // that reading (Mark's iPhone check: "much too hard" bare; songpath did
  // the same)
  const form = task.word || content.wordsOf(task.item)[0];
  if (!form) return cardModel(content, {...task, task: 'meaning', asked: 3}, rng, pool, states);
  const we = wordEntry(content, form, it.char, it.jp);
  const target = [...form].indexOf(it.char);
  const syl = we ? we.jp.split(' ') : [];
  // no jyutping over the character where the word has it twice (媽媽 would
  // give maa1 away), and its own syllable isn't one to keep out of the choices
  const chars = [...form];
  const over = overOf(content, states, form, we && we.jp, target)
    .map((o, i) => (chars[i] === it.char ? null : o));
  const others = syl.filter((_, i) => chars[i] !== it.char);
  const choices = readingChoices(content, it.char, it.jp, rng, pool, others).map(reading);
  return {...base, kind: 'question', lead: 'Read the marked character',
          word: {form, target, gloss: we && we.gloss, over},
          choices, answer: it.jp, reveal: {...asked, answerLabel: it.jp}};
}

// The sentence for a rung-5 task: the sentence's parts (a line, or its
// sentence within a prose line), each word's characters as the Reader shows
// them, the target (its first occurrence in this reading) marked, no
// jyutping over the character anywhere, and the syllables to keep out of the
// choices: the target word's others (as rung 4) and every one shown. Null
// if the line is gone or no longer has it (the text was edited or deleted
// mid-session).
function sentenceCard(content, states, task, it, lineOf) {
  const line = task.sentence && lineOf ? lineOf(task.sentence) : null;
  if (!line || line.blank) return null;
  const span = sentenceSpans(line.parts)[task.sentence.sent || 0];
  if (!span) return null;
  let others = null;
  const parts = line.parts.slice(span[0], span[1]).map(p => {
    if (p.type !== 'word') return {type: 'text', text: p.text};
    const chars = wordChars(content, states, p, {charOf: content.char});
    const jps = p.jp ? p.jp.split(' ') : [];
    const perChar = jps.length === p.chars.length;
    if (!others) {
      const k = p.chars.findIndex((c, i) => c.char === it.char
        && readingItemFor(content, c.char, perChar ? jps[i] : '', p.chars.length === 1) === task.item);
      if (k >= 0) {
        chars[k] = {...chars[k], over: null, mark: true};
        others = perChar ? jps.filter((_, i) => i !== k) : [];
      }
    }
    return {type: 'word', form: p.form, chars};
  });
  // no jyutping over the character anywhere else in the sentence either:
  // 茶樓 ... 飲茶 would give caa4 away
  for (const p of parts) {
    if (p.chars) p.chars = p.chars.map(c => (c.char === it.char ? {...c, over: null} : c));
  }
  if (!others) return null;
  // rung 4 keeps the word's other syllables out of the choices; here, every
  // syllable shown in the sentence (係 hai6 over it would rule hai6 out)
  const shown = parts.flatMap(p => (p.chars || []).map(c => c.over)).filter(Boolean);
  return {sentence: {parts}, others: [...new Set([...others, ...shown])]};
}

// What was on screen, for a content report (Phase 5): the prompt as the
// learner saw it, the choices, the right answer and the one given.
export function shownOf(m, given = null) {
  const sentence = m.sentence && m.sentence.parts.map(p => (p.type === 'word'
    ? p.chars.map(c => (c.mark ? `[${c.char}]` : c.char)).join('') : p.text)).join('');
  const prompt = [m.lead, m.from && `${m.from.part} ${m.from.note}`, m.glyph, m.text,
                  m.hint, m.word && m.word.form, sentence].filter(Boolean).join(' | ');
  return {item: m.item, task: m.task, rung: m.rung, asked: m.asked, prompt,
          choices: m.choices.map(c => c.value), answer: m.answer, given,
          target: m.target || null};
}

// ---- drawing

function wordLine(w) {
  if (!w) return null;
  return h('p', {class: 'word-line'}, rubyWord(w.form, w.over), w.gloss ? ` ${w.gloss}` : '');
}

function wordLines(ws) {
  return ws && ws.length ? h('div', {class: 'words'}, ...ws.map(wordLine)) : null;
}

// The reading, then the meaning on a line of its own (Mark's iPhone check:
// "the english gloss and reading appeared in the same line").
function readingBlock(jp, gloss, cls = '', layer = null) {
  return h('div', {class: `reading-block ${cls}`.trim()},
    jp && h('div', {class: 'jp-line'}, h('p', {class: 'jp big-jp'}, jp),
      layerChip(layer, LAYER_TEXT[layer])),
    gloss && h('p', {class: 'gloss-line'}, gloss));
}

// The first card with a tappable character says once how the reference
// card is reached (Mark, 2026-09-29: never obvious). Since 7.5 every tile
// opens its card; the dotted box is retired.
function tipLine(cb) {
  return cb.tipOnce && cb.tipOnce()
    ? h('p', {class: 'note center tip'}, 'Tap a character’s tile for everything about it.')
    : null;
}

const tileKind = (cb, ch) => (cb.kindOf ? cb.kindOf(ch) : null);

function builtLine(built, cb) {
  if (!built || !built.length) return null;
  const parts = built.map(b => h('span', {class: 'part'}, glyphButton(b.part, cb, 'sm'),
    h('span', {class: 'muted'},
        // a sound part's note is its reading, a meaning part's its gloss
        b.note ? [b.role === 'sound' ? jpSpan(b.note) : b.note, ` (${b.role})`] : `(${b.role})`)));
  const joined = [];
  parts.forEach((p, i) => { if (i) joined.push(h('span', {class: 'built-plus'}, '+')); joined.push(p); });
  return h('p', {class: 'built'}, h('span', {class: 'label'}, 'Built from '), ...joined);
}

// Where the sound part's reading is no clue, members that carry the sound
// (CO-016: 當 <- 尚 soeng6, sounds like 黨 堂), each with its jyutping; under
// Its tree, not Built from (brief 7.18)
function likeLine(built, cb) {
  const like = built && built.find(b => b.cousins && b.cousins.length);
  return like && h('p', {class: 'built like-line'}, h('span', {class: 'label'}, 'Sounds like '),
    ...like.cousins.map(({ch, over}) => glyphTile(ch, tileKind(cb, ch),
      {size: 'sm', over: over || '', onTap: cb.onRef ? c => cb.onRef(c) : null})));
}

// Its tree (patch plan 7.7), as the reference card's row; only where the
// caller gives cb.onTree (brief 7.18)
function treeRow(ch, cb) {
  return cb.onTree && h('section', {class: 'block jumps'},
    h('button', {type: 'button', class: 'jump', onclick: () => cb.onTree(ch)},
      h('span', {class: 'jump-text'}, h('b', {}, 'Trace this character’s steps'),
        h('span', {class: 'sm'}, 'What it’s built from, and what’s built from it')),
      h('span', {class: 'jump-go', 'aria-hidden': 'true'}, '›')));
}

// A glyph as a tile by its kind (views/glyph.js), opening its reference
// card. `locked()` holds it shut while true: a question's glyph until it's
// answered, since the card shows the answer.
function glyphButton(ch, cb, size = 'xl', locked = null) {
  return glyphTile(ch, tileKind(cb, ch), {size, locked, cls: size === 'xl' ? 'task-glyph' : '',
                                        onTap: cb.onRef ? c => cb.onRef(c) : null});
}

// A sentence (rung 5): each word's characters over their jyutping, the
// target marked, punctuation kept -- the Reader's layout, not tappable.
function sentencePrompt(s) {
  return h('div', {class: 'reader-text prompt-sentence', lang: 'zh-Hant-HK'},
    h('p', {class: 'rline'}, ...s.parts.map(p => (p.type === 'text'
      ? h('span', {class: 'rtext'}, p.text)
      : h('span', {class: 'rword'},
          h('span', {class: 'rw'}, ...p.chars.map(c => h('span', {class: `rc${c.off ? ' off' : ''}`},
            h('span', {class: 'rt jp', lang: 'en'}, c.over || '\u00a0'),
            c.mark ? h('mark', {class: 'rb'}, c.shown) : h('span', {class: 'rb'}, c.shown)))))))));
}

// The word, each character over its jyutping line: the target marked and
// its line empty, a known character's line empty too.
function wordPrompt(w) {
  return h('p', {class: 'prompt-word'}, rubyWord(w.form, w.over, {cls: 'big', mark: w.target}));
}

function reportLink(onReport) {
  return onReport && h('button', {type: 'button', class: 'link report-link', onclick: onReport},
                       'Report a problem with this');
}

function revealBlock(m, ok, cb, given) {
  const r = m.reveal;
  const verdict = m.kind === 'question'
    ? h('p', {class: `verdict ${ok ? 'good' : 'bad'}`}, ok ? 'Right' : 'Not quite')
    : h('p', {class: `verdict ${ok ? 'good' : 'learn'}`}, ok ? 'You inferred it' : 'Here it is');
  let main;
  // every answer teaches: the reading, its meaning and a word, as a guess
  // always did (brief 7.9, Mark: "all of the tests"). A character question
  // leads with the character; tell apart's lines carry the meanings, its
  // word comes after them.
  const answerLine = () => h('p', {class: 'answer-line'}, glyphButton(r.glyph, cb, 'md'),
                             ' ', jpSpan(r.jp));
  if (m.kind === 'question' && m.task === 'tell_apart') {
    main = answerLine();
  } else if (m.kind === 'question' && m.task === 'meaning') {
    main = h('div', {class: 'answer-block'}, answerLine(),
             h('p', {class: 'gloss-line'}, r.gloss), wordLines(r.words));
  } else {
    main = h('div', {class: 'answer-block'}, readingBlock(r.jp, r.gloss), wordLines(r.words));
  }
  // the shared sound part first (CO-048), then each choice with its reading
  // and meaning, its meaning part and what that part means, the answer's
  // first (Mark, step 6 iPhone check; patch plan 6.5, CO-049)
  const head = r.head && h('p', {class: 'mark-head'}, 'They all have ',
    glyphButton(r.head.char, cb, 'sm'),
    r.head.jp ? [' ', jpSpan(r.head.jp)] : '');
  const marks = r.marks && h('div', {class: 'marks mark-lines'}, head,
    ...[...r.marks].sort((a, b) => (b.char === r.glyph) - (a.char === r.glyph))
      .map(k => h('p', {class: `mark-line${k.char === r.glyph ? ' is-answer' : ''}`},
        han(k.char), k.jp ? [' ', jpSpan(k.jp)] : '',
        k.meaning ? ` ${k.meaning}` : '', ' · ',
        han(k.part || '', {class: 'muted'}), k.gloss ? ` ${k.gloss}` : '')));
  const pattern = r.pattern && h('p', {class: 'note'}, r.pattern);
  const word = m.task === 'tell_apart' ? wordLines(r.words) : null;
  return h('section', {class: 'feedback', role: 'status'}, verdict, main, marks, word, pattern);
}

// renderTask(el, model, {onAnswer(ok), onNext(), onRef(char), onReport(shown),
//                        kindOf(form): glyph.js glyphKind, for the tiles,
//                        onTree(form): a Meet card's Its tree row, under Built
//                        from; none, no row (brief 7.18)})
// onAnswer is called once, the moment the answer is given (so it is saved
// then); onNext when the learner moves on.
export function renderTask(el, m, cb) {
  clear(el);
  // Report sits at the very foot of every card, below Continue (Mark,
  // 2026-09-29); after an answer it carries the answer given
  const report = (given = null) => reportLink(cb.onReport && (() => cb.onReport(shownOf(m, given))));
  const cont = onclick => h('button', {type: 'button', class: 'btn primary wide', onclick},
                            'Continue');
  const meetAndGo = () => { cb.onAnswer(true); cb.onNext(); };

  if (m.kind === 'standin') {
    put(el, h('p', {class: 'lead'}, m.lead),
      glyphTile(m.glyph, tileKind(cb, m.glyph), {size: 'xl', cls: 'task-glyph'}),
      h('div', {class: 'foot'}, cont(meetAndGo), report()));
    return;
  }

  if (m.kind === 'teach' || m.kind === 'part') {
    const r = m.reveal;
    put(el,
      h('p', {class: 'lead'}, m.lead),
      glyphButton(m.glyph, cb),
      tipLine(cb),
      m.partLead && h('p', {class: 'note center part-lead'}, m.partLead),
      m.quiet ? h('div', {class: 'muted'}, readingBlock(r.jp, r.gloss, 'center', r.layer))
              : readingBlock(r.jp, r.gloss, 'center', r.layer),
      m.partNote && h('p', {class: 'note center'}, m.partNote),
      m.standsFor && h('p', {class: 'note center'}, 'It stands for ', han(m.standsFor)),
      m.pattern && h('p', {class: 'note center'}, 'Its main reading is ', jpSpan(m.pattern.main), '; ',
        jpSpan(r.jp), ` is ${m.pattern.relation}.`),
      ...(m.facts || []).map(f => h('p', {class: 'note center'}, f)),
      wordLines(r.words),
      builtLine(m.built, cb),
      treeRow(m.glyph, cb),
      likeLine(m.built, cb),
      h('div', {class: 'foot'}, cont(meetAndGo), report()));
    return;
  }

  // guess and question: the prompt, the choices, then the feedback
  const prompt = [m.from
    ? h('p', {class: 'lead'}, m.from.met === false ? '' : 'You know ', han(m.from.part, {class: 'lead-part'}),
        // a sound part's note is its reading, a meaning part's its gloss
        m.from.met === false ? ' is read ' : ' ',
        m.from.kind === 'sound' ? jpSpan(m.from.note) : m.from.note, '. ',
        m.from.verb || (m.from.kind === 'sound' ? 'Guess:' : 'Which meaning fits?'))
    : h('p', {class: 'lead'}, m.lead)];
  // The reference card would give the answer away, so the glyph opens it only
  // once the question is answered.
  let answered = false;
  const glyphBtn = m.glyph && glyphButton(m.glyph, cb, 'xl', () => !answered);
  if (glyphBtn) prompt.push(glyphBtn);
  if (m.text) prompt.push(h('p', {class: 'prompt-text'}, `“${m.text}”`));
  if (m.word) prompt.push(wordPrompt(m.word));
  if (m.sentence) prompt.push(sentencePrompt(m.sentence));
  if (m.hint && m.hintOnAsk) {
    const hint = h('p', {class: 'hint'},
      h('button', {type: 'button', class: 'link', onclick: () => {
        hint.textContent = m.hint;
      }}, 'Show the meaning'));
    prompt.push(hint);
  } else if (m.hint) prompt.push(h('p', {class: 'hint jp', lang: 'en'}, m.hint));
  const grid = h('div', {class: `choices ${m.choices[0].type}-choices`});
  const idk = m.kind === 'question'
    ? h('button', {type: 'button', class: 'btn quiet wide idk', onclick: () => pick(null)},
        'I don’t know')
    : null;
  const buttons = m.choices.map(c => h('button', {
    type: 'button', class: `choice ${c.type === 'han' ? 'glyph' : c.type === 'jp' ? 'jp' : ''}`,
    lang: c.type === 'han' ? 'zh-Hant-HK' : 'en', onclick: () => pick(c.value)}, c.label));
  grid.append(...buttons);
  const foot = h('div', {class: 'foot'});
  const footReport = h('div', {class: 'foot-report'}, report());
  put(el, ...prompt, grid, idk, foot, footReport);

  function pick(value) {
    if (answered) return;
    answered = true;
    const ok = value === m.answer;
    buttons.forEach((b, i) => {
      b.disabled = true;
      const v = m.choices[i].value;
      if (v === m.answer) b.classList.add('is-answer');
      else if (v === value) b.classList.add('is-wrong');
    });
    if (idk) idk.remove();
    cb.onAnswer(ok);
    const next = cont(() => cb.onNext());
    put(foot, revealBlock(m, ok, cb, value), tipLine(cb), next);
    put(clear(footReport), report(value));
    next.focus();
  }
}
