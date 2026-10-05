// welcome.js — first run's two screens (patch plan 7B, Phase 1).
//
// The welcome (what Read Path does, Start, and Import for someone moving
// from another phone), then the placement offer. In a Safari tab on iOS, and
// in a browser on Android, an install screen comes first and is all there
// is: the steps (or Android's Install button), and a quiet way to carry on
// in the browser (Mark, 7B Phase 0; install-only, 7.14).

import {h, clear, put} from './dom.js';
import {KEY} from './settings.js';

export const NAME = 'Read Path · 一路睇';
const LINES = [
  'Learn to read the Cantonese you already speak.',
  'Common characters first, and the parts that give away their sound.',
  'A few minutes a day. Everything stays on this phone.',
];

// Tones show as marks (brief 7.12 decided 6): the default, said once, with
// si1 .. si6 each over its number. Settings has the way back to numbers.
function marksCard() {
  return h('section', {class: 'block marks-card', 'aria-labelledby': 'marks-h'},
    h('h2', {id: 'marks-h'}, 'Tones show as marks'),
    h('div', {class: 'tone-row'}, ...KEY.map(([s]) => h('span', {class: 'tone-cell'},
      h('span', {class: 'jp jp-marks', lang: 'en'}, s), h('span', {class: 'key-n'}, s.slice(-1))))),
    h('p', {class: 'note'}, 'Above is high, below is low, and the stroke follows the pitch. '
      + 'Tone 3 has no mark. Prefer tone numbers (',
      h('span', {class: 'jp jp-numbers', lang: 'en'}, 'si1'), ')? Change it in Settings.'));
}

// The install screen comes first where the app runs in a browser on a phone.
export const installFirst = ctx => !ctx.standalone && !!(ctx.ios || ctx.android);

const WHY = 'Read Path runs from your home screen, like an app. It works offline there, and keeps your progress.';
const OPEN = 'Open Read Path from your home screen.';

// renderInstall(el, {ios, android, canPrompt, installed}, cb)
//   cb: onInstall (Android's prompt), onContinue (the welcome, in the browser)
//   canPrompt: the browser has offered its Install (Android's
//   beforeinstallprompt); installed: it was accepted here.
export function renderInstall(el, ctx, cb) {
  const steps = items => h('ol', {class: 'install-steps'}, ...items.map(t => h('li', {}, t)));
  let how;
  if (ctx.ios) {
    how = steps(['Tap Share (in iOS 26, under ⋯).', 'Tap Add to Home Screen, then Add.', OPEN]);
  } else if (ctx.installed) {
    how = h('p', {class: 'lead-note'}, `Installed. ${OPEN}`);
  } else if (ctx.canPrompt) {
    how = [h('button', {type: 'button', class: 'btn primary wide', onclick: cb.onInstall}, 'Install Read Path'),
           h('p', {class: 'note'}, `Then ${OPEN[0].toLowerCase()}${OPEN.slice(1)}`)];
  } else {
    how = steps(['Tap ⋮, the browser’s menu.', 'Tap Install app, or Add to Home screen.', OPEN]);
  }
  put(clear(el),
    h('div', {class: 'top'}),
    h('h1', {id: 'welcome-h'}, NAME),
    h('section', {class: 'block first install', 'aria-labelledby': 'install-h'},
      h('h2', {id: 'install-h'}, ctx.ios ? 'Add Read Path to your home screen' : 'Install Read Path'),
      h('p', {class: 'lead-note'}, WHY),
      how),
    h('section', {class: 'block quiet'},
      h('button', {type: 'button', class: 'link', onclick: cb.onContinue},
        ctx.ios ? 'Continue in Safari' : 'Continue in the browser'),
      h('p', {class: 'note'}, ctx.ios ? 'Progress made in Safari stays in Safari.'
                                      : 'You can install it later from the browser’s menu.')));
}

// renderWelcome(el, cb)   cb: onStart, onImport
export function renderWelcome(el, cb) {
  put(clear(el),
    h('div', {class: 'top'}),
    h('h1', {id: 'welcome-h'}, NAME),
    h('section', {class: 'block first'},
      ...LINES.map(l => h('p', {class: 'lead-note'}, l))),
    marksCard(),
    h('section', {class: 'block'},
      h('button', {type: 'button', class: 'btn primary wide', onclick: cb.onStart}, 'Start')),
    h('section', {class: 'block quiet'},
      h('p', {class: 'note'}, 'Moving from another phone?'),
      h('button', {type: 'button', class: 'link', onclick: cb.onImport}, 'Import progress')));
}

// renderOffer(el, cb)   cb: onCheck, onSkip
export function renderOffer(el, cb) {
  put(clear(el),
    h('div', {class: 'top'}),
    h('h1', {id: 'welcome-h'}, 'Already read some Chinese?'),
    h('section', {class: 'block first'},
      h('p', {class: 'note'},
        'A few minutes’ check marks the characters you know, so Read Path starts where you are. '
        + 'It’s optional, and you can run it again from Path.'),
      h('div', {class: 'btns stack'},
        h('button', {type: 'button', class: 'btn primary', onclick: cb.onCheck}, 'Take the check'),
        h('button', {type: 'button', class: 'btn quiet', onclick: cb.onSkip}, 'Skip'))));
}
