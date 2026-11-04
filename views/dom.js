// dom.js — the one DOM helper the views share (patch plan 4, Phase 3).
//
// h('div', {class: 'card'}, 'text', child, [more, children]) makes an
// element. Strings become text nodes, so nothing here ever parses HTML and
// content can't inject markup. `on*` attributes become listeners; `false`,
// null and undefined attributes and children are skipped.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v === null || v === undefined) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c === false || c === null || c === undefined) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

// A span of Chinese text: the CJK face, and the document's zh-Hant-HK lang.
export const han = (text, attrs = {}) =>
  h('span', {lang: 'zh-Hant-HK', ...attrs, class: `han ${attrs.class || ''}`.trim()}, text);

// A span of jyutping, alone (brief 7.12): its tones drawn as marks when the
// learner has them on (app.css .jp). Never wrap other text in it.
export const jpSpan = text => h('span', {class: 'jp', lang: 'en'}, text);

// A 文 or 白 chip (brief 7.16): its own element, never inside a .jp (the
// font would draw nothing wrong, but .jp holds jyutping only, jp.test.js).
// `label` is facts.js LAYER_TEXT's words, for a screen reader and a tooltip.
export const layerChip = (layer, label) => layer
  ? h('span', {class: 'layer-chip', lang: 'zh-Hant-HK', title: label, 'aria-label': label}, layer)
  : null;

// Characters each over their jyutping line (views/facts.js overOf: blank
// where the learner knows it). `mark` underlines one (a word question's
// target).
export function rubyWord(form, over, {cls = '', mark = -1} = {}) {
  return h('span', {class: `rw ${cls}`.trim(), lang: 'zh-Hant-HK'},
    ...[...form].map((c, i) => h('span', {class: 'rc'},
      h('span', {class: 'rt jp', lang: 'en'}, (over && over[i]) || '\u00a0'),
      i === mark ? h('mark', {class: 'rb'}, c) : h('span', {class: 'rb'}, c))));
}


// A speaker that says `text` (brief 7.31 A5), or null when there is
// nothing to say or no Cantonese voice to say it (speech.js): then no
// speaker is drawn at all. Its label says what it will say ("Hear 銀行").
export const canSay = speech => !!(speech && typeof speech.canSpeak === 'function' && speech.canSpeak());
export function speaker(text, speech) {
  if (!text || !canSay(speech)) return null;
  return h('button', {type: 'button', class: 'speaker', 'aria-label': `Hear ${text}`, title: `Hear ${text}`,
                      onclick: e => { e.stopPropagation(); speech.say(text); }}, speakerIcon());
}

// The speaker drawn here (no icon set), as the gear is: a cone, then two
// sound waves, or, quiet, a cross.
const SVG = 'http://www.w3.org/2000/svg';
export function speakerIcon(quiet = false) {
  const el = (tag, attrs) => {
    const e = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    return e;
  };
  const line = {fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round'};
  const svg = el('svg', {class: 'speaker-icon', viewBox: '0 0 24 24', 'aria-hidden': 'true'});
  svg.append(el('path', {d: 'M4 9h4l5-4v14l-5-4H4z', fill: 'currentColor'}),
    ...(quiet ? [el('path', {...line, d: 'M16 9l5 6M21 9l-5 6'})]
              : [el('path', {...line, d: 'M16 9.5a3.5 3.5 0 0 1 0 5'}),
                 el('path', {...line, d: 'M18.5 7a7 7 0 0 1 0 10'})]));
  return svg;
}

// el.append(), skipping false, null and undefined as h() does.
export function put(el, ...children) {
  append(el, children);
  return el;
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}
