// facts.js — small facts the cards show, looked up from the content (patch
// plan 4, Phase 4). Pure: no DOM. The reference card (Phase 5) uses them too.

import {readingId} from '../core/content.js';
import {isKnown} from '../core/state.js';

const WORDS_BY_FORM = new WeakMap();
function wordsByForm(content) {
  let m = WORDS_BY_FORM.get(content);
  if (!m) {
    m = new Map();
    for (const w of content.words.values()) {
      if (!m.has(w.form)) m.set(w.form, []);
      m.get(w.form).push(w);
    }
    WORDS_BY_FORM.set(content, m);
  }
  return m;
}

// word(content, form, char, jp) -> {form, jp, gloss} or null: the word
// entry in which `char` is read `jp`, else the word's first entry.
export function word(content, form, char, jp) {
  const ws = wordsByForm(content).get(form) || [];
  const i = [...form].indexOf(char);
  const fits = ws.find(w => i >= 0 && w.jp.split(' ')[i] === jp);
  return fits || ws[0] || null;
}

// The first of a reading item's words that has an entry, as {form, jp, gloss}.
export function firstWord(content, id) {
  const it = content.item(id);
  for (const f of it.words || []) {
    const w = word(content, f, it.char, it.jp);
    if (w) return w;
  }
  return null;
}

// built from: a character's parts with their roles, each with what the
// learner can know of it: a sound part's reading, a meaning part's gloss,
// study item or not. A sound part shows its reading nearest this character
// (稅: 兌 deoi3, though 兌 is taught jyut6), and where even that is no clue,
// `cousins`: members that carry the sound, each with its jyutping unless
// known (當 <- 尚 soeng6: like 黨 堂). Patch plan 6.5, CO-064 and CO-016.
export function builtFrom(content, ch, states = {}) {
  return content.partsOf(ch).map(({part, role, reading, cousins}) => {
    let note = null;
    if (role === 'sound') note = reading || content.partReading(part);
    if (role === 'meaning') note = content.partGloss(part);
    const like = role === 'sound' && cousins
      ? cousins.map(c => ({ch: c, over: overChar(content, states, c)})) : [];
    return {part, role, note, cousins: like};
  });
}

// A meaning part's meaning as its reliability allows (CO-059, songpath's
// wording): a strong part states it, a loose one hedges ("Often to do with
// water."), and a misleading one leads with Mark's note, the meaning after
// it and muted. -> {lead, meaning, quiet, note}: `lead` before the meaning,
// `note` after it.
export function meaningWording(content, part, meaning) {
  const {reliability, note} = content.partTrust(part);
  if (!meaning) return {lead: null, meaning, quiet: false, note};
  if (reliability === 'misleading') return {lead: note, meaning, quiet: true, note: null};
  const said = reliability === 'loose' ? `Often to do with ${meaning}.` : meaning;
  return {lead: null, meaning: said, quiet: false, note};
}

// A reading item's example words, up to `n`, as {form, jp, gloss}.
export function wordsFor(content, id, n = 3) {
  const it = content.item(id);
  const out = [];
  for (const f of it.words || []) {
    const w = word(content, f, it.char, it.jp);
    if (w) out.push(w);
    if (out.length >= n) break;
  }
  return out;
}

// How a secondary reading relates to the main one, in words (DESIGN
// *Related readings*: taught as a pattern, not as a second fact).
export const RELATION_TEXT = {
  changed_tone: 'a changed tone',
  tone_meaning: 'a different tone for a different meaning',
  literary_colloquial: 'the literary and colloquial readings',
  initial_merger: 'a merged initial',
  other: 'another reading',
};
export function relationText(relation) {
  return RELATION_TEXT[relation] || RELATION_TEXT.other;
}

// The jyutping to show over each character of `form` read `jp`: the
// syllable, or null where the learner knows that character in that reading
// (Maintain), where the word has no jyutping, or at index `skip` (a question's
// target). Mark, 2026-09-29: "basically anywhere in the app if characters are
// appearing, they should have jyutping if they are not already known".
export function overOf(content, states, form, jp, skip = -1) {
  const chars = [...form];
  const syl = jp ? jp.split(' ') : [];
  return chars.map((c, i) => {
    if (i === skip || syl.length !== chars.length) return null;
    const id = readingId(c, syl[i]);
    return content.has(id) && isKnown(states[id]) ? null : syl[i];
  });
}

// One character's main reading, or null where it is known or has none.
export function overChar(content, states, ch) {
  const id = content.mainReading(ch);
  if (!id) return null;
  return isKnown(states[id]) ? null : content.item(id).jp;
}

// wordsFor with each word's jyutping over its unknown characters.
export function wordsWithOver(content, states, id, n = 3) {
  return wordsFor(content, id, n).map(w => ({...w, over: overOf(content, states, w.form, w.jp)}));
}
