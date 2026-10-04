// jp.js — how jyutping's tones are drawn (brief 7.12).
//
// One setting, readpath.settings.jp: 'marks' (Jyutping Clear draws each tone
// digit as a mark on the vowel) or 'numbers'. Absent is marks, for testers
// already using the app too (Mark, 7.12 P1). Only the font changes: the text
// keeps its digits, so search, copy, export and reports are the same either
// way. app.css sets `.jp` in Jyutping Clear under <html data-jp="marks">.

import {KEYS} from './store.js';

export const JP_MODES = ['marks', 'numbers'];

// The learner's choice, from readpath.settings: 'marks' | 'numbers'.
export function jpMode(settings) {
  return settings && settings.jp === 'numbers' ? 'numbers' : 'marks';
}

// Sets <html data-jp="marks">, or takes it off for numbers. boot() calls it
// once the store is hydrated, before anything with jyutping is drawn, and
// Settings on every change: the font swaps with no reload.
export function applyJp(root, store) {
  if (jpMode(store.load(KEYS.settings, {})) === 'marks') root.setAttribute('data-jp', 'marks');
  else root.removeAttribute('data-jp');
}

// Saves the choice, keeping the other settings, and applies it.
export function setJp(root, store, mode) {
  if (!JP_MODES.includes(mode)) throw new Error(`jp: no mode ${mode}`);
  store.save(KEYS.settings, {...store.load(KEYS.settings, {}), jp: mode});
  applyJp(root, store);
}
