// settings.js — the Settings screen (brief 7.12, decided 4 and 5).
//
// How jyutping's tones are drawn, Tone marks or Numbers (jp.js), and the
// name on reports and feedback (brief 7.19 P2). Two option cards, each showing sik6 as it would draw whatever is
// chosen; a Preview of two lines that redraws as the choice changes; with
// marks, a key to them. Audio, Off · Tap · Auto (brief 7.31 A5), or, with
// no Cantonese voice, how to add one (A1). New a day, 5 · 7 · 10 (D2):
// Today composes from the saved setting each time it is shown. Then the
// housekeeping (brief 7.38 P6, decided 4): Send feedback, Your progress
// (export and import), Add to Home Screen, About and licences, and the build
// id last. Reached from Today's gear, #settings, Back as About's.

import {h, clear, put, rubyWord, jpSpan} from './dom.js';
import {jpMode} from '../jp.js';
import {audioMode} from '../audio.js';
import {DEFAULTS} from '../core/today.js';

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
// the new items a day on offer (brief 7.31 D2); the minutes are the
// simulator's once reviews settle, at p 0.9 (tools/simulate.js --new N)
export const PACES = [5, 7, 10];
export const PACE_NOTE = 'About 6, 8 or 11 minutes a day once reviews settle.';
const AUDIO = [{mode: 'off', label: 'Off'}, {mode: 'tap', label: 'Tap'}, {mode: 'auto', label: 'Auto'}];
export const AUDIO_NOTE = 'Tap plays a word when you tap its speaker. Auto also plays each new character '
  + 'and each answer once. Nothing plays before you answer.';
// Audio ships as a beta (Mark, 2026-11-03): the phone's voice gets tones
// wrong, most of all tone 6 said alone (係 hai6 near hai1 on the iPhone; 事
// si6 level with si3, measured on the Mac), so the learner is told to trust
// the jyutping. Here and on How jyutping works.
export const AUDIO_BETA = 'Audio is in beta. The phone’s voice sometimes says a tone wrong, most often '
  + 'tone 6. Trust the jyutping over the voice.';
export const NO_VOICE = 'This phone has no Cantonese voice. On iPhone: Settings → Accessibility → '
  + 'Spoken Content → Voices → Chinese (Hong Kong).';

// settingsModel(settings, {voice}) -> {jp: 'marks' | 'numbers', name, newPerDay,
//                                      audio: 'off' | 'tap' | 'auto', voice}
//   voice: a Cantonese voice is there to speak (speech.js canSpeak())
export function settingsModel(settings, {voice = false} = {}) {
  return {jp: jpMode(settings), name: settings.testerName || '',
          newPerDay: settings.new_per_day ?? DEFAULTS.new_per_day,
          audio: audioMode(settings), voice};
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// renderSettings(el, m, {onBack, onJp(mode), onName(name), onAudio(mode), onPace(n), onHowJp,
//                        onFeedback, onExport, onImport, exportDue, unsent, install, onInstall,
//                        onAbout, build, version, loadedMs})
//   exportDue: pwa.js's exportReminder(), {days, never}; unsent: reports
//   not sent yet; install: 'ios' | 'prompt' | null (pwa.js installOffer)
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
        '). Copied and exported text keeps numbers too.'),
      // the explainer (brief 7.31 J1)
      cb.onHowJp && h('button', {type: 'button', class: 'link', onclick: cb.onHowJp}, 'How jyutping works ›')),
    // audio (brief 7.31 A5), under the tone marks; no voice, how to add one
    cb.onAudio && h('section', {class: 'block'},
      m.voice
        ? h('fieldset', {class: 'opt-group'},
            h('legend', {class: 'label'}, 'Audio'),
            h('div', {class: 'opt-cards three'}, ...AUDIO.map(o =>
              h('label', {class: `opt-card${m.audio === o.mode ? ' on' : ''}`},
                h('input', {type: 'radio', name: 'audio', value: o.mode, checked: m.audio === o.mode,
                            onchange: () => cb.onAudio(o.mode)}),
                h('span', {class: 'opt-name'}, o.label)))),
            h('p', {class: 'note'}, AUDIO_NOTE),
            h('p', {class: 'note beta-note'}, h('span', {class: 'tag learn'}, 'Beta'), ' ', AUDIO_BETA))
        : [h('span', {class: 'label'}, 'Audio'), h('p', {class: 'note no-voice'}, NO_VOICE)]),
    // the daily pace (brief 7.31 D2)
    cb.onPace && h('section', {class: 'block'},
      h('fieldset', {class: 'opt-group'},
        h('legend', {class: 'label'}, 'New a day'),
        h('div', {class: 'opt-cards three'}, ...PACES.map(n =>
          h('label', {class: `opt-card${m.newPerDay === n ? ' on' : ''}`},
            h('input', {type: 'radio', name: 'pace', value: String(n), checked: m.newPerDay === n,
                        onchange: () => cb.onPace(n)}),
            h('span', {class: 'opt-name'}, String(n))))),
        h('p', {class: 'note'}, PACE_NOTE))),
    // the tester's name on reports and feedback (brief 7.19 P2)
    cb.onName && h('section', {class: 'block'},
      h('label', {class: 'label', for: 'tester-name'}, 'Your name'),
      h('p', {class: 'note'}, 'On your reports and feedback, so Mark knows who sent them. '
        + 'Nowhere else.'),
      h('input', {type: 'text', class: 'note-input', id: 'tester-name', maxlength: 60,
                  autocomplete: 'name', value: m.name, placeholder: 'Optional',
                  onchange: e => cb.onName(e.target.value)})),
    // a row as on Path: a title, a line under it, and ›
    jump(cb.onFeedback, 'Send feedback', 'A note, and your reports, to Mark'),
    progressBlock(cb),
    installBlock(cb),
    jump(cb.onAbout, 'About and licences', null),
    (cb.version || cb.build) && h('p', {class: 'sm build-line'},
      (cb.build ? `App ${cb.build} · ` : '') + `Content ${cb.version || ''}`
        + (cb.loadedMs != null ? ` · loaded in ${cb.loadedMs} ms` : '')));
}

const jump = (onclick, title, sub) => onclick && h('section', {class: 'block jumps'},
  h('button', {type: 'button', class: 'jump', onclick},
    h('span', {class: 'jump-text'}, h('b', {}, title), sub && h('span', {class: 'sm'}, sub)),
    h('span', {class: 'jump-go', 'aria-hidden': 'true'}, '›')));

// Your progress: saved on the device; export and import (moved from Today,
// brief 7.38 P6), with the export reminder and the reports waiting to go
function progressBlock(cb) {
  if (!cb.onExport) return null;
  const due = cb.exportDue;
  return h('section', {class: 'block', 'aria-labelledby': 'progress-h'},
    h('span', {class: 'label', id: 'progress-h'}, 'Your progress'),
    h('p', {class: 'note'},
      'Saved on this device. Export it to keep a copy, or to move it to another device.'),
    due && h('p', {class: 'note unsent'},
      due.never ? `You started ${due.days} days ago and haven’t exported yet. Export to keep a copy.`
                : `Your last export was ${due.days} days ago. Export to keep a copy.`),
    h('div', {class: 'btns', style: 'margin-top:var(--s2)'},
      h('button', {type: 'button', class: 'btn quiet', onclick: cb.onExport}, 'Export'),
      h('button', {type: 'button', class: 'btn quiet', onclick: cb.onImport}, 'Import')),
    cb.unsent > 0 && h('p', {class: 'note unsent'},
      `${plural(cb.unsent, 'report')} not sent yet. ${cb.unsent === 1 ? 'It goes' : 'They go'} `
      + 'to Mark when the app is back online, and with your next export.'));
}

// until the app is installed (patch plan 7B): on iOS a Safari tab's
// storage is not the installed app's, and can be cleared after a week
function installBlock(cb) {
  if (!cb.install) return null;
  return h('section', {class: 'block', 'aria-labelledby': 'install-h'},
    h('span', {class: 'label', id: 'install-h'}, 'Add to Home Screen'),
    cb.install === 'ios'
      ? h('p', {class: 'note'},
          'Tap Share (in iOS 26, under ⋯), then Add to Home Screen, then Add. '
          + 'From your home screen Read Path works offline, and keeps your progress.')
      : [h('p', {class: 'note'}, 'Install Read Path to use it offline, like an app.'),
         h('button', {type: 'button', class: 'btn quiet', onclick: cb.onInstall}, 'Install')]);
}
