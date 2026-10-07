// firstrun.js — first run (patch plan 7B, Phase 1; DESIGN *Screens*).
//
// welcome → "Already read some Chinese?" (step 6's check, or No) → the
// sample 飲茶 added as the focus → Today. It appears only on a device with
// no learner state, and never again once it has finished.
//
//   needsWelcome(store)           -> true on a device with nothing of a learner
//   installContext(nav, matchMedia) -> {ios, android, standalone}
//   await starterFocus(library, fetchFn, day) -> the focus text
//   finishWelcome(store, day)     records that first run is done
//   sayNo(store)                  "No" to "Already read some Chinese?"

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

// iOS or iPadOS (which reports itself as a Mac with a touch screen), Android,
// and whether the app runs installed. In a Safari tab on iOS the welcome asks
// for Add to Home Screen first (Mark, 7B Phase 0): a tab's storage is not
// the installed app's. In a browser on Android it asks to install first too
// (Mark, 7.14).
export function installContext(nav = {}, matchMedia = null) {
  const ua = nav.userAgent || '';
  const ios = /iPad|iPhone|iPod/.test(ua) ||
              (/Macintosh/.test(ua) && nav.platform === 'MacIntel' && (nav.maxTouchPoints || 0) > 1);
  const standalone = nav.standalone === true ||
                     !!(matchMedia && matchMedia('(display-mode: standalone)').matches);
  const android = /Android/.test(ua);
  return {ios, android, standalone};
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

// "No" (brief 7.18 Decided 6; Mark, P1): Today's placement card is
// dismissed, as Not now does, with the answer as its value. No placement
// record -- Path would read one as "Last check: about 0" -- and no state:
// the check still runs from Path.
export function sayNo(store) {
  store.save(KEYS.meta, {...store.load(KEYS.meta, {}), placementOffer: 'no'});
}

export function finishWelcome(store, day) {
  store.save(KEYS.meta, {...store.load(KEYS.meta, {}), welcomed: day});
}
