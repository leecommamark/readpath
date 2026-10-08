// import.js — a pasted or imported text becomes a library text (patch plan
// 5, Phase 2).
//
// Pure: the texts and the content are passed in, and nothing is saved here
// (app/texts.js does that). songpath's rules and wording (library.js
// importProblem, bodyOfFile, firstLine; lrc.js), with one change: a
// duplicate is the same NORMALISED body, so a simplified and a traditional
// copy of one text are one text.
//
// A text as stored (readpath.texts; DESIGN *Learner model*):
//   {id, title, body, src?, script, focus, added, section, asWritten}
//   body      normalised (core/normalize.js)
//   src       the text as written, only where s2t changed it (decided 13)
//   script    'trad' | 'mixed' | 'simp'
//   focus     true on at most one text
//   added     the day it was added
//   section   where the Reader was left; asWritten, its toggle (view state:
//             nothing about learning is stored per text, design rule 2)

import {normalizeText, COMPAT_RE} from './normalize.js';
import {CJK_RUN_SOURCE} from './segment.js';

export const MAX_TEXT_CHARS = 20000;       // songpath's limit, UTF-16 units
export const TITLE_MAX = 60;
const CJK = new RegExp(CJK_RUN_SOURCE, 'u');

export const firstLine = body => (body.split(/\n/).find(l => l.trim()) || '').trim();
export const autoTitle = body => firstLine(body).slice(0, TITLE_MAX);

// ---- LRC (songpath lrc.js): one timed line is enough to call it LRC

const REST_GAP = 6000;                     // ms; a longer gap is a blank line
const LRC_TIME = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const LRC_META = /^\[[a-z]+:.*\]$/i;
const LRC_WORD = /<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>([^<]*)/g;
const ms = (mm, ss, frac) => (+mm * 60 + +ss) * 1000 +
  (frac ? (frac.length === 3 ? +frac : +frac * 10) : 0);

function timedLines(text) {
  const out = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    LRC_TIME.lastIndex = 0;
    const times = [];
    let m, end = 0;
    // only the run of timestamps at the head of the line counts
    while ((m = LRC_TIME.exec(line)) && m.index === end) {
      times.push(ms(m[1], m[2], m[3]));
      end = LRC_TIME.lastIndex;
    }
    if (!times.length || LRC_META.test(line)) continue;
    const rest = line.slice(end).trim();
    const words = [...rest.matchAll(LRC_WORD)].map(w => w[1]);
    const plain = words.length ? words.join('') : rest;
    for (const t of times) out.push({t, text: plain});
  }
  return out.sort((a, b) => a.t - b.t);
}

// bodyOfFile(raw) -> {body, note}: an LRC's timestamps stripped, a gap of
// over 6 s kept as a blank line.
export function bodyOfFile(raw) {
  const lines = timedLines(raw);
  if (!lines.length) return {body: raw, note: ''};
  const out = [];
  lines.forEach((cur, i) => {
    const next = lines[i + 1];
    if (cur.text) out.push(cur.text);
    const rest = (!cur.text && next) || (next && next.t - cur.t > REST_GAP);
    if (rest && out.length && out[out.length - 1] !== '') out.push('');
  });
  while (out.length && out[out.length - 1] === '') out.pop();
  return {body: out.join('\n'), note: 'timestamps stripped'};
}

// ---- refusals

// importProblem(raw, texts, content) -> null | {code, why, message}
//   `message` is the preview's sentence; `why` is the batch log's
//   ("name — skipped: <why>"). songpath's wording for both.
export function importProblem(raw, texts, content) {
  const body = (raw || '').trim();
  const say = (code, why, message) => ({code, why, message});
  if (!body) return say('empty', 'empty', 'Paste some text first.');
  if (!CJK.test(body)) {
    return say('no_chinese', 'no Chinese characters in it',
               'No Chinese characters in this — there would be nothing to learn.');
  }
  if (body.length > MAX_TEXT_CHARS) {
    const why = `${body.length.toLocaleString('en')} characters — the limit is ` +
                MAX_TEXT_CHARS.toLocaleString('en');
    return say('too_long', why, `${why}. Split it and import the parts; nothing has been cut.`);
  }
  const norm = normalizeText(body, content).text;
  const dup = texts.find(t => t.body.trim() === norm);
  if (dup) {
    const why = `already in your library as “${dup.title}”`;
    // with the text it duplicates, so first run can focus that one (7B)
    return {...say('duplicate', why, `${why[0].toUpperCase()}${why.slice(1)}.`), id: dup.id};
  }
  return null;
}

// ---- the record

// A new id: t<day>-<n>, the first n not taken.
export function newId(texts, day) {
  const ids = new Set(texts.map(t => t.id));
  let n = 1;
  while (ids.has(`t${day}-${n}`)) n++;
  return `t${day}-${n}`;
}

// makeText(raw, {title, texts, content, day}) -> {text} | {problem}
//   The title is the given one, trimmed and cut to 60, else the first line.
export function makeText(raw, {title = '', texts, content, day}) {
  const problem = importProblem(raw, texts, content);
  if (problem) return {problem};
  const n = normalizeText(raw.trim(), content);
  const text = {id: newId(texts, day), title: (title || '').trim().slice(0, TITLE_MAX) || autoTitle(n.text),
                body: n.text, script: n.script.kind, focus: false, added: day,
                section: 0, asWritten: false};
  if (n.text !== n.srcText) text.src = n.srcText;
  return {text};
}

// A saved text holding CJK compatibility ideographs (imported before patch
// plan 7.11, when they passed through as no lookup's key): each takes the
// form an import gives it now (說 U+F96F -> 說 U+8AAA), and nothing else in the body
// moves. The length holds, so the lines and the Reader's place do too; the
// text as written is kept as `src`. null when there is nothing to change.
export function unifySaved(t, content) {
  if (!COMPAT_RE.test(t.body)) return null;
  const body = Array.from(t.body)
    .map(c => (COMPAT_RE.test(c) ? normalizeText(c, content).text : c)).join('');
  return {...t, body, src: t.src || t.body};
}

// The sample (starter/jamcaa.txt): its first line is the title, the rest the
// body, as songpath's importStarter read it.
export function splitTitled(raw) {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const i = lines.findIndex(l => l.trim());
  if (i < 0) return {title: '', body: ''};
  return {title: lines[i].trim(), body: lines.slice(i + 1).join('\n').trim()};
}

// ---- the library as a list (each returns a new array)

// One focus at most: the marker moves (decided 1). id null clears it.
export const setFocus = (texts, id) => texts.map(t => ({...t, focus: t.id === id}));
export const rename = (texts, id, title) => texts.map(t => (t.id === id
  ? {...t, title: (title || '').trim().slice(0, TITLE_MAX) || t.title} : t));
// Deleting the focus text clears the focus with it.
export const remove = (texts, id) => texts.filter(t => t.id !== id);
export const update = (texts, id, fields) => texts.map(t => (t.id === id ? {...t, ...fields} : t));
