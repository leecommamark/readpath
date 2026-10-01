// texts.js — the library on the device (patch plan 5, Phase 2).
//
// The texts themselves are `readpath.texts` in the store (core/import.js has
// the record), so they travel in Export / Import (decided 13). What a text
// is drawn from -- its lines and tokens (core/lines.js) -- is never stored
// there: it is recomputed from the body, and kept in memory and in the
// device cache (cache.js `lines`) under `<content version>:<id>:<hash of the
// body>`, so a lexicon or dictionary change never leaves stale tokens, and
// Today can compose from the focus text at boot without the dictionary.
//
//   const lib = createLibrary({store, content, dict, cache, version});
//   lib.add(raw, {title, day})    -> {text} | {problem}   (saved)
//   await lib.linesFor(text)      -> {lines, tokens}
//   await lib.warmFocus()         the focus text's tokens, before compose
//   lib.learnerTexts()            [{id, title, tokens, focus}] for today.js:
//                                 every text whose tokens are held

import {KEYS} from './store.js';
import {makeText, splitTitled, setFocus, rename, remove, update, bodyOfFile,
        autoTitle} from './core/import.js';
import {linesOf, tokensOf, wordsOf} from './core/lines.js';
import {coverage} from './core/coverage.js';
import {fnv1aCp} from './dict.js';

export const SAMPLE_URL = 'starter/jamcaa.txt';
export const LINES_FORMAT = 2;

export function createLibrary({store, content, dict, cache = null, version}) {
  const held = new Map();                  // cache key -> {lines, tokens}
  const list = () => store.load(KEYS.texts, []);
  const save = texts => store.save(KEYS.texts, texts);
  const find = id => list().find(t => t.id === id) || null;
  // LINES_FORMAT moves when the cached shape does (Phase 5: tokens gained `sent`)
  const keyOf = t => `${version}:${LINES_FORMAT}:${t.id}:${fnv1aCp(t.body)}`;

  async function linesFor(t) {
    const k = keyOf(t);
    if (held.has(k)) return held.get(k);
    let v = cache ? await cache.get('lines', k) : undefined;
    if (!v) {
      await dict.need(wordsOf(t.body, content.lexicon));
      const lines = linesOf(t.body, t.src || t.body, content.lexicon, dict.wordJp);
      v = {lines, tokens: tokensOf(lines)};
      if (cache) await cache.put('lines', k, v);
    }
    held.set(k, v);
    return v;
  }
  const tokensHeld = t => (held.get(keyOf(t)) || {}).tokens || null;

  return {
    list, find, linesFor,
    focus: () => list().find(t => t.focus) || null,
    async warmFocus() {
      const f = list().find(t => t.focus);
      if (f) await linesFor(f);
    },
    async warmAll() {
      for (const t of list()) await linesFor(t);
    },
    // a held text's line, for a sentence question (rung 5), or null
    lineAt({text: id, line}) {
      const t = find(id);
      const v = t && held.get(keyOf(t));
      return (v && v.lines[line]) || null;
    },
    // every text whose lines are held, with them: [{id, title, focus, lines}]
    heldLines: () => list().map(t => ({id: t.id, title: t.title, focus: !!t.focus,
                                       lines: (held.get(keyOf(t)) || {}).lines}))
      .filter(t => t.lines),
    learnerTexts: () => list().map(t => ({id: t.id, title: t.title, focus: !!t.focus,
                                          tokens: tokensHeld(t)}))
      .filter(t => t.tokens),
    // coverage of a text whose tokens are held, else null (not yet computed)
    coverageOf(t, states, opts) {
      const tokens = tokensHeld(t);
      return tokens ? coverage(content, states, tokens, opts) : null;
    },
    add(raw, {title = '', day}) {
      const texts = list();
      const r = makeText(raw, {title, texts, content, day});
      if (r.text) save([...texts, r.text]);
      return r;
    },
    // The sample (decided 7), through the same import as any text.
    async addSample(fetchFn, day) {
      const res = await fetchFn(SAMPLE_URL);
      if (!res.ok) throw new Error(`could not load the sample text (${res.status})`);
      const {title, body} = splitTitled(await res.text());
      return this.add(body, {title, day});
    },
    // importFiles([{name, raw}], {day, onStep}) -> {log, added, skipped, failed}
    //   raw null: a file that couldn't be read, logged as failed.
    //   One file at a time, in order, flushed after each (songpath's batch):
    //   an LRC's timestamps are stripped, the title is the first line (else
    //   the file's name), a refusal is logged and the batch moves on, and a
    //   file the store couldn't save is taken out again and logged as
    //   failed. onStep(i, n, name) runs before each: "Importing i of n".
    async importFiles(files, {day, onStep = () => {}}) {
      const log = [];
      const count = {added: 0, skipped: 0, failed: 0};
      for (let i = 0; i < files.length; i++) {
        const {name, raw} = files[i];
        onStep(i + 1, files.length, name);
        if (raw === null) {                // the file couldn't be read
          log.push({name, result: 'failed', why: 'couldn’t read the file'});
          count.failed++;
          continue;
        }
        const {body, note} = bodyOfFile(raw);
        const r = this.add(body, {title: autoTitle(body) || name.replace(/\.[^.]*$/, ''), day});
        if (r.problem) {
          log.push({name, result: 'skipped', why: r.problem.why});
          count.skipped++;
          continue;
        }
        store.clearTrouble();
        await store.flush();
        const trouble = store.trouble();
        if (trouble) {
          this.remove(r.text.id);
          log.push({name, result: 'failed', why: trouble.message});
          count.failed++;
          continue;
        }
        log.push({name, result: 'added', note, text: r.text});
        count.added++;
      }
      return {log, ...count};
    },
    setFocus: id => save(setFocus(list(), id)),
    rename: (id, title) => save(rename(list(), id, title)),
    update: (id, fields) => save(update(list(), id, fields)),
    // remove(id) -> {text, index}, for Undo; restore puts it back where it was
    remove(id) {
      const texts = list();
      const index = texts.findIndex(t => t.id === id);
      if (index < 0) return null;
      save(remove(texts, id));
      return {text: texts[index], index};
    },
    restore({text, index}) {
      const texts = list().filter(t => t.id !== text.id);
      texts.splice(Math.min(index, texts.length), 0, text);
      save(text.focus ? texts.map(t => ({...t, focus: t.id === text.id})) : texts);
    },
  };
}
