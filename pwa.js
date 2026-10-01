// pwa.js — installed, offline and updated (patch plan 7B, Phase 2).
//
// The worker's registration and its "Update ready" (nothing reloads unless
// the learner taps Reload), asking the browser to keep storage, and the two
// prompts Today shows: Add to Home Screen until the app is installed, and
// Export when it has been a while. The prompts' rules are pure, for tests.

import {KEYS} from './store.js';

export const EXPORT_DAYS = 14;

// What Today offers for installing: the iOS steps in a Safari tab, an
// Install button where the browser offers one (Android's
// beforeinstallprompt), else nothing.
export function installOffer({ios, standalone}, canPrompt) {
  if (standalone) return null;
  if (ios) return 'ios';
  return canPrompt ? 'prompt' : null;
}

// "Export your progress": once there is progress, and the last export (or,
// with none, the first answer) is EXPORT_DAYS or more ago. -> {days} | null
export function exportReminder(meta, states, today) {
  const met = Object.values(states).map(s => s.met).filter(Number.isInteger);
  if (!met.length) return null;
  const since = Number.isInteger(meta.exported) ? meta.exported : Math.min(...met);
  const days = today - since;
  return days >= EXPORT_DAYS ? {days, never: !Number.isInteger(meta.exported)} : null;
}

// Registers ./sw.js (a published build only), and calls onReady() when a
// new build is installed and waiting. Checks for one on load and whenever
// the app comes back to the foreground: an installed app on iOS is resumed,
// not reloaded, so it never navigates. Returns update(): Reload's tap.
export function watchWorker({build, nav = navigator, doc = document, onReady}) {
  if (build === 'dev' || !nav.serviceWorker) return null;
  let reg = null;
  const ready = r => { if (r.waiting && nav.serviceWorker.controller) onReady(); };
  nav.serviceWorker.register('./sw.js').then(r => {
    reg = r;
    ready(r);
    r.addEventListener('updatefound', () => {
      const w = r.installing;
      if (w) w.addEventListener('statechange', () => { if (w.state === 'installed') ready(r); });
    });
    doc.addEventListener('visibilitychange', () => {
      if (doc.visibilityState === 'visible') r.update().catch(() => {});
    });
  }).catch(e => console.warn('readpath: service worker', e));
  return function update() {
    if (!reg || !reg.waiting) return location.reload();
    // the one reload: when the waiting build has taken over
    nav.serviceWorker.addEventListener('controllerchange', () => location.reload(), {once: true});
    reg.waiting.postMessage({type: 'SKIP_WAITING'});
  };
}

// Asks the browser to keep this origin's storage, once installed (WebKit
// grants it to a Home Screen web app). The answer goes into meta, and into
// Send feedback's device line (Phase 3).
export async function askPersist(store, nav = navigator) {
  if (!nav.storage || !nav.storage.persist) return null;
  let granted = await nav.storage.persisted();
  if (!granted) granted = await nav.storage.persist();
  store.save(KEYS.meta, {...store.load(KEYS.meta, {}), persisted: granted});
  return granted;
}
