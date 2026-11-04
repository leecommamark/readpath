// jyutping.js — How jyutping works (brief 7.31 J1-J5).
//
// One scrolling screen of reference, no quiz (J5): the six tones, each on a
// syllable heard on tap; the letters a heritage speaker trips on, each with
// two characters they know, heard on tap; and the sounds the app counts as
// one (DESIGN *Same sound*). An optional step in first run, beside the
// placement check, and from Settings afterwards (J1, Mark: "like a
// tutorial"; no link from the Meet). The examples are Mark's
// (review/jyutping_examples.tsv, 2026-11-03), each a character read alone
// as shown, so the voice says it right. With no Cantonese voice
// (cb.speech null) they show, and nothing plays.

import {h, clear, put, jpSpan, speakerIcon, canSay} from './dom.js';
import {AUDIO_BETA} from './settings.js';
import {shortGloss} from '../core/gloss.js';

export const TONES = [['詩', 'si1'], ['史', 'si2'], ['試', 'si3'], ['時', 'si4'], ['市', 'si5'], ['事', 'si6']];
export const TONE_LINE = 'Above is high, below is low; the mark follows the pitch. Tone 3 has no mark.';
export const LETTERS = [
  {spell: 'z', said: 'like j or dz', ex: [['早', 'zou2'], ['姐', 'ze2']]},
  {spell: 'c', said: 'like ch or ts', ex: [['菜', 'coi3'], ['車', 'ce1']]},
  {spell: 'j', said: 'like y in yes', ex: [['人', 'jan4'], ['熱', 'jit6']]},
  {spell: 'aa · a', said: 'aa is long, a is short', ex: [['三', 'saam1'], ['心', 'sam1']]},
  {spell: 'eo', said: 'the vowel of 出 and 水', ex: [['出', 'ceot1'], ['水', 'seoi2']]},
  {spell: 'oe', said: 'the vowel of 香 and 腳', ex: [['香', 'hoeng1'], ['腳', 'goek3']]},
  {spell: 'yu', said: 'the vowel of 豬 and 書', ex: [['豬', 'zyu1'], ['書', 'syu1']]},
  {spell: 'ng', said: 'can start a syllable', ex: [['我', 'ngo5']]},
  {spell: '-k · -t · -p', said: 'stopped short, not let out', ex: [['食', 'sik6'], ['筆', 'bat1'], ['十', 'sap6']]},
];
// J4, as Mark reworded it (2026-11-03: the app has no listening, so it
// doesn't "hear" anything): the mergers are how people speak, and the
// jyutping shown is the dictionary spelling. Search takes either (DESIGN
// *Search*: nei finds 你, then lei).
export const SAME_SOUND = [
  'Many speakers say n as l (你 lei5), drop the ng at the start (我 o5), or say gw as g before o '
    + '(國 gok3). That’s ordinary Cantonese.',
  'The jyutping in Read Path is the standard spelling, what you’d type to look a word up in a '
    + 'dictionary: 你 nei5, 我 ngo5, 國 gwok3. Search finds either.',
];

// An example: its character with its jyutping over it (and, for a tone,
// its meaning under it), a button that says it when there is a voice
// ("Hear 詩 si1"), else the same, drawn still.
function example([ch, jp], speech, gloss = null) {
  const inner = [h('span', {class: 'jp', lang: 'en'}, jp), h('span', {class: 'han ex-han', lang: 'zh-Hant-HK'}, ch),
                 gloss && h('span', {class: 'ex-gloss'}, gloss)];
  if (!canSay(speech)) return h('span', {class: 'jp-ex'}, ...inner);
  return h('button', {type: 'button', class: 'jp-ex', 'aria-label': `Hear ${ch} ${jp}`,
                      onclick: () => speech.say(ch)}, ...inner, speakerIcon());
}

// A line with jyutping in it: each syllable with its tone digit in a .jp
// span, so marks draw as marks (jp.test.js); the rest as it is.
function withJp(text) {
  return text.split(/(\b[a-z]+[1-6]\b)/).map((t, i) => (i % 2 ? jpSpan(t) : t));
}

// toneGlosses(content) -> {char: short gloss}: each tone example's meaning,
// its main reading's, shortened as a card's summary is (Mark, 2026-11-04)
export function toneGlosses(content) {
  return Object.fromEntries(TONES.map(([ch]) => {
    const id = content.mainReading(ch);
    return [ch, id ? shortGloss(content.item(id).gloss || '') || null : null];
  }));
}

// renderJyutping(el, {firstRun, glosses}, {onBack, onContinue, speech})
//   firstRun: Continue goes on to the placement offer; else ‹ Back
//   glosses: toneGlosses(content), under the six tones
export function renderJyutping(el, m, cb) {
  const speech = canSay(cb.speech) ? cb.speech : null;
  put(clear(el),
    h('div', {class: 'top'},
      m.firstRun ? h('span', {})
        : h('button', {type: 'button', class: 'link back-btn', onclick: cb.onBack}, '‹ Back'),
      h('span', {})),
    h('h1', {id: 'jyutping-h'}, 'How jyutping works'),
    h('section', {class: 'block first'},
      h('p', {class: 'lead-note'}, 'Jyutping spells a Cantonese syllable in letters, then its tone.'),
      speech && h('p', {class: 'note'}, 'Tap any example to hear it.'),
      speech && h('p', {class: 'note beta-note'}, h('span', {class: 'tag learn'}, 'Beta'), ' ', AUDIO_BETA)),
    h('section', {class: 'block', 'aria-labelledby': 'jp-tones-h'},
      h('h2', {id: 'jp-tones-h'}, 'Six tones'),
      h('div', {class: 'jp-tones'}, ...TONES.map(t => example(t, speech, (m.glosses || {})[t[0]]))),
      h('p', {class: 'note'}, TONE_LINE)),
    h('section', {class: 'block', 'aria-labelledby': 'jp-letters-h'},
      h('h2', {id: 'jp-letters-h'}, 'Letters to know'),
      h('dl', {class: 'jp-letters'}, ...LETTERS.flatMap(l => [
        h('dt', {}, h('span', {class: 'mono'}, l.spell), h('span', {class: 'note'}, ` ${l.said}`)),
        h('dd', {}, ...l.ex.map(x => example(x, speech)))]))),
    h('section', {class: 'block', 'aria-labelledby': 'jp-same-h'},
      h('h2', {id: 'jp-same-h'}, 'How you say it'),
      ...SAME_SOUND.map(s => h('p', {class: 'note'}, ...withJp(s)))),
    m.firstRun && h('section', {class: 'block'},
      h('button', {type: 'button', class: 'btn primary wide', onclick: cb.onContinue}, 'Continue')));
}
