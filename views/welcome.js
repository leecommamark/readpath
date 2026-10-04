// welcome.js — first run's two screens (patch plan 7B, Phase 1).
//
// The welcome (what Read Path does, Start, and Import for someone moving
// from another phone), then the placement offer. In a Safari tab on iOS the
// welcome shows the Add to Home Screen steps in Start's place, with a quiet
// way to carry on in Safari (Mark, 7B Phase 0).

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

// renderWelcome(el, {ios, standalone}, cb)   cb: onStart, onImport
export function renderWelcome(el, ctx, cb) {
  const gate = ctx.ios && !ctx.standalone;
  put(clear(el),
    h('div', {class: 'top'}),
    h('h1', {id: 'welcome-h'}, NAME),
    h('section', {class: 'block first'},
      ...LINES.map(l => h('p', {class: 'lead-note'}, l))),
    marksCard(),
    gate
      ? h('section', {class: 'block', 'aria-labelledby': 'install-h'},
          h('h2', {id: 'install-h'}, 'Add it to your home screen first'),
          h('p', {class: 'note'},
            'Tap Share (in iOS 26, under ⋯), then Add to Home Screen, then Add. '
            + 'Open Read Path from your home screen: it works offline there, and keeps your progress.'),
          h('button', {type: 'button', class: 'link', onclick: cb.onStart}, 'Continue in Safari'),
          h('p', {class: 'note'}, 'Progress made in Safari stays in Safari.'))
      : h('section', {class: 'block'},
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
