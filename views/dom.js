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

// Characters each over their jyutping line (views/facts.js overOf: blank
// where the learner knows it). `mark` underlines one (a word question's
// target).
export function rubyWord(form, over, {cls = '', mark = -1} = {}) {
  return h('span', {class: `rw ${cls}`.trim(), lang: 'zh-Hant-HK'},
    ...[...form].map((c, i) => h('span', {class: 'rc'},
      h('span', {class: 'rt mono', lang: 'en'}, (over && over[i]) || '\u00a0'),
      i === mark ? h('mark', {class: 'rb'}, c) : h('span', {class: 'rb'}, c))));
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
