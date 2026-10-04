// provenance.js — weak data shown for what it is (brief 7.10 P6; patch plan
// 7.10, Phase 5). The content says where every gloss and every reading off
// the path comes from (`src`, `jp_src`); this is the one rule for which of
// them a screen shows muted.
//
//   * A taught item's gloss is the learner's lesson: shown as it is, CC-CEDICT
//     included (Mark, Phase 0), except one filed under another reading.
//   * A meaning part's gloss from Unihan's kDefinition is muted.
//   * A form that is no taught character falls back to the dictionary's
//     gloss for it (the `char` table): muted when that is CC-CEDICT's or
//     kDefinition's; on a part's stone or card, whatever dictionary it is
//     (Mark, Phase 4: the sound parts' dictionary glosses are muted).
//   * A reading only Unihan's kCantonese gives (no dictionary has the
//     character) is muted.
// Muted means the `weak` class; a card or a tree's header also says
// DICTIONARY_SENSE under it, a tile never does (no room, and it would repeat).

export const DICTIONARY_SENSE = 'dictionary sense';

const WEAK_SRC = new Set(['cedict', 'kdef', 'other_reading']);

// formGloss(content, form, {asPart}) -> {text, weak}: the gloss a tile or a
// stone shows for `form`, main reading > part gloss > dictionary, and
// whether it is muted
export function formGloss(content, form, {asPart = false} = {}) {
  const r = content.mainReading(form);
  const it = r && content.item(r);
  if (it && it.gloss) return {text: it.gloss, weak: it.src === 'other_reading'};
  const pg = content.partGloss(form);
  if (pg) return {text: pg, weak: content.partGlossSrc(form) === 'kdef'};
  const c = content.char ? content.char(form) : null;
  if (c && c.gloss) return {text: c.gloss, weak: asPart || WEAK_SRC.has(c.src)};
  return {text: '', weak: false};
}

// formJp(content, form) -> {text, weak}: main reading > part reading >
// dictionary, muted where only kCantonese gives it
export function formJp(content, form) {
  const r = content.mainReading(form);
  if (r) return {text: content.item(r).jp, weak: false};
  const pr = content.partReading(form);
  if (pr) return {text: pr, weak: content.partReadingSrc(form) === 'kcantonese'};
  const c = content.char ? content.char(form) : null;
  return {text: (c && c.jp) || '', weak: !!c && c.jp_src === 'kcantonese'};
}

// a gloss straight from the `char` table (the off-path card): muted when it
// is CC-CEDICT's or kDefinition's
export const charGlossWeak = c => !!c && !!c.gloss && WEAK_SRC.has(c.src);
// an off-path character's readings: muted when only kCantonese gives them
export const offReadingsWeak = o => !!o && o.jp_src === 'kcantonese';
// a part's gloss on its card: kDefinition's is muted
export const partGlossWeak = (content, part) => content.partGlossSrc(part) === 'kdef';
