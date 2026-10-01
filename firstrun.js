// firstrun.js — first run (patch plan 7B, Phase 1; DESIGN *Screens*).
//
// welcome → "Already read some Chinese?" (step 6's check, or skip) → the
// sample 飲茶 added as the focus → Today. It appears only on a device with
// no learner state, and never again once it has finished.
//
//   needsWelcome(store)           -> true on a device with nothing of a learner
//   installContext(nav, matchMedia) -> {ios, standalone}
//   await starterFocus(library, fetchFn, day) -> the focus text
//   finishWelcome(store, day)     records that first run is done

import {KEYS} from './store.js';

// Nothing of a learner: no item states, texts, placement or off-path marks,
// and first run never finished. Read after hydrate() and before Today, whose
// composition writes the device seed into meta, so meta alone can't say.
export function needsWelcome(store) {
  if (store.load(KEYS.meta, {}).welcomed) return false;
  if (Object.keys(store.load(KEYS.states, {})).length) return false;
  if (store.load(KEYS.texts, []).length) return false;
  if (store.load(KEYS.placement, null)) return false;
  if (store.load(KEYS.offKnown, []).length) return false;
  return true;
}

// iOS or iPadOS (which reports itself as a Mac with a touch screen), and
// whether the app runs installed. In a Safari tab on iOS the welcome asks
// for Add to Home Screen first (Mark, 7B Phase 0): a tab's storage is not
// the installed app's.
export function installContext(nav = {}, matchMedia = null) {
  const ua = nav.userAgent || '';
  const ios = /iPad|iPhone|iPod/.test(ua) ||
              (/Macintosh/.test(ua) && nav.platform === 'MacIntel' && (nav.maxTouchPoints || 0) > 1);
  const standalone = nav.standalone === true ||
                     !!(matchMedia && matchMedia('(display-mode: standalone)').matches);
  return {ios, standalone};
}

// The sample, through the normal import, made the focus. One already in
// the library (an import brought it) is only focused.
export async function starterFocus(library, fetchFn, day) {
  const r = await library.addSample(fetchFn, day);
  const id = r.text ? r.text.id : r.problem.code === 'duplicate' ? r.problem.id : null;
  if (!id) throw new Error(r.problem.message);
  library.setFocus(id);
  return library.focus();
}

export function finishWelcome(store, day) {
  store.save(KEYS.meta, {...store.load(KEYS.meta, {}), welcomed: day});
}
