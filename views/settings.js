// settings.js — the Settings screen (brief 7.12, decided 4 and 5).
//
// One setting today: how jyutping's tones are drawn, Tone marks or Numbers
// (jp.js). Two option cards, each showing sik6 as it would draw whatever is
// chosen; a Preview of two lines that redraws as the choice changes; with
// marks, a key to them. Reached from Your progress on Today, #settings,
// Back as About's.

import {h, clear, put, rubyWord, jpSpan} from './dom.js';
import {jpMode} from '../jp.js';

// the preview: all six tones (brief 7.12 decided 5)
export const PREVIEW = [
  {form: '我哋一齊去食飯', jp: 'ngo5 dei6 jat1 cai4 heoi3 sik6 faan6'},
  {form: '唔好五點先嚟', jp: 'm4 hou2 ng5 dim2 sin1 lai4'},
];
export const KEY = [
  ['si1', 'high level'], ['si2', 'high rising'], ['si3', 'mid level: no mark'],
  ['si4', 'low falling'], ['si5', 'low rising'], ['si6', 'low level'],
];
const OPTIONS = [{mode: 'marks', label: 'Tone marks'}, {mode: 'numbers', label: 'Numbers'}];

// settingsModel(settings) -> {jp: 'marks' | 'numbers'}
export function settingsModel(settings) {
  return {jp: jpMode(settings)};
}

// renderSettings(el, m, {onBack, onJp(mode)})
export function renderSettings(el, m, cb) {
  const option = o => h('label', {class: `opt-card${m.jp === o.mode ? ' on' : ''}`},
    h('input', {type: 'radio', name: 'jp-mode', value: o.mode, checked: m.jp === o.mode,
                onchange: () => cb.onJp(o.mode)}),
    h('span', {class: 'opt-name'}, o.label),
    // as this option would draw it, whatever is chosen now
    h('span', {class: `opt-sample jp jp-${o.mode}`, lang: 'en', 'aria-hidden': 'true'}, 'sik6'));
  const marks = m.jp === 'marks';
  put(clear(el),
    h('div', {class: 'top'},
      h('button', {type: 'button', class: 'link back-btn', onclick: cb.onBack}, '‹ Back'),
      h('span', {})),
    h('h1', {id: 'settings-h'}, 'Settings'),
    h('section', {class: 'block first'},
      h('fieldset', {class: 'opt-group'},
        h('legend', {class: 'label'}, 'Jyutping'),
        h('p', {class: 'note'}, 'How tones show in the jyutping over characters.'),
        h('div', {class: 'opt-cards'}, ...OPTIONS.map(option))),
      h('div', {class: 'opt-preview', 'aria-label': 'Preview'},
        h('span', {class: 'label'}, 'Preview'),
        ...PREVIEW.map(l => h('p', {class: 'preview-line'}, rubyWord(l.form, l.jp.split(' '))))),
      marks && h('div', {class: 'mark-key'},
        h('span', {class: 'label'}, 'Reading the marks'),
        h('p', {class: 'note'}, 'Above = high, below = low. The stroke follows the pitch.'),
        h('dl', {class: 'key-rows'}, ...KEY.flatMap(([s, said]) => [
          h('dt', {}, jpSpan(s), h('span', {class: 'key-n'}, s.slice(-1))),
          h('dd', {}, said)]))),
      h('p', {class: 'note'}, 'Search and answers still take numbers (',
        h('span', {class: 'jp jp-numbers', lang: 'en'}, 'sik6'),
        '). Copied and exported text keeps numbers too.')));
}
