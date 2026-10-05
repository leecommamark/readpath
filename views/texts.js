// texts.js — the Texts screen (patch plan 5, Phase 3; DESIGN *Screens*: Texts).
//
// The library: each text with its title, "N% readable", a badge for a
// simplified or mixed source, and the one Focus marker, which the learner
// moves (decided 1). Add a text by pasting it (with a preview and a title
// taken from its first line) or by importing one file or several (a batch
// with a running count and a line per file). Rename in place; delete with
// Undo (the shell's toast). An empty library offers the sample, 飲茶.
// Get texts from a link (patch plan 7.14): a beta tester's text set, named
// by a link or typed in, previewed with a tick per text, and added through
// the same batch import.
//
// libraryModel() and previewOf() are pure, so a test reads them without a
// DOM. renderTexts() draws the screen; what happens on a tap is the shell's
// (main.js), passed in as callbacks.

import {h, han, clear, put} from './dom.js';
import {bodyOfFile, importProblem, autoTitle} from '../core/import.js';
import {normalizeText} from '../core/normalize.js';
import {CJK_RUN_SOURCE} from '../core/segment.js';
import {bundleIdOf} from '../core/bundle.js';

const plural = (n, one, many = `${one}s`) => `${n.toLocaleString('en')} ${n === 1 ? one : many}`;
const CJK = new RegExp(CJK_RUN_SOURCE.replace(/\+$/, ''), 'gu');
export const SCRIPT_BADGE = {simp: 'Simplified', mixed: 'Mixed script'};

// libraryModel(texts, coverageOf) -> {rows, focus}
//   coverageOf(text) is texts.js's (null while its tokens are being worked
//   out). The focus text comes first, then the newest.
export function libraryModel(texts, coverageOf) {
  const rows = texts.map((t, i) => {
    const c = coverageOf(t);
    return {id: t.id, title: t.title, focus: !!t.focus, order: i,
            chars: (t.body.match(CJK) || []).length,
            badge: SCRIPT_BADGE[t.script] || null,
            pct: c ? c.pct : null, toLearn: c ? c.toLearn : null,
            offPath: c ? c.offPath.length : null};
  });
  rows.sort((a, b) => (b.focus - a.focus) || (b.order - a.order));
  return {rows, focus: rows.find(r => r.focus) || null};
}

// previewOf(raw, texts, content) -> {body, note, lines, chars, script,
//   title, problem}: what the paste box says as it's typed in. An LRC is
//   stripped on arrival (songpath), so `body` may differ from `raw`.
export function previewOf(raw, texts, content) {
  const {body, note} = bodyOfFile(raw || '');
  const trimmed = body.trim();
  const problem = importProblem(trimmed, texts, content);
  const chars = (trimmed.match(CJK) || []).length;
  // the title as it will be stored: from the normalised text
  const n = chars ? normalizeText(trimmed, content) : null;
  return {body, note, chars, script: n ? n.script.kind : 'trad',
          title: autoTitle(n ? n.text : trimmed), problem,
          lines: trimmed ? trimmed.split('\n').filter(l => l.trim()).length : 0};
}

export function previewLine(p) {
  if (!p.lines) return '';
  const bits = [`${plural(p.lines, 'line')}, ${plural(p.chars, 'character')}`];
  if (p.script !== 'trad') bits.push(`${SCRIPT_BADGE[p.script].toLowerCase()}: shown in traditional`);
  if (p.note) bits.push(p.note);
  return bits.join(' · ');
}

// "Add 2 texts": the preview's button, following the ticks
export const addLabel = n => `Add ${plural(n, 'text')}`;
export const NOT_A_SET = 'That isn’t a link to a text set, or a set’s name.';
// what the field's Get does with what's in it: {id} | {error}, before
// anything is fetched. A pasted message with the link in it gives the link's
// set (the emulator, 7.14): each URL in it is tried, trailing punctuation off.
const URLS = /https?:\/\/[^\s<>"'「」（）()]+/g;
export function linkInput(raw) {
  if (!(raw || '').trim()) return {error: 'Paste a link, or type a set’s name.'};
  const id = bundleIdOf(raw) ||
    (raw.match(URLS) || []).map(u => bundleIdOf(u.replace(/[.,;:!?。，；：！？]+$/u, ''))).find(Boolean);
  return id ? {id} : {error: NOT_A_SET};
}
// the note under a preview opened outside the installed app (7.14): on iOS
// Safari's storage is not the home-screen app's; on Android it usually is,
// but not in another browser or an app's own
export const BUNDLE_NOTE = {
  ios: 'Using Read Path from your home screen? Copy this link, open Read Path there, and use Get texts from a link.',
  android: 'Using Read Path from your home screen and the texts aren’t there? Copy this link and use Get texts from a link in the app.',
};

const readable = r => (r.pct === null ? 'Working out how readable…'
  : `${r.pct}% readable` + (r.toLearn ? ` · ${plural(r.toLearn, 'reading')} to learn` : ''));

// renderTexts(el, model, ui, cb)
//   ui: {pasting, draft: {raw, title, titleAuto}, renaming, batch, bundle}
//     bundle (7.14): null, or one of
//       {stage: 'ask', input, error, retry}   the field ("Link or set name")
//       {stage: 'loading'}                     fetching the set's index
//       {stage: 'preview', index, chosen: Set of files, note: 'ios'|'android'|null}
//   cb: onPaste, onDraft(raw, title, titleAuto), onAdd, onCancelPaste,
//       onFiles(FileList), onSample, onFocus(id), onRename(id), onRenamed(id,
//       title), onCancelRename, onDelete(id), onOpen(id) (the Reader, step 5
//       Phase 4; absent until then), preview(raw) -> previewOf's result;
//       onLink, onLinkGet(raw), onLinkPaste (absent where the clipboard can't
//       be read), onBundleTick(file, on), onBundleAdd, onBundleCancel
export function renderTexts(el, m, ui, cb) {
  const picker = h('input', {type: 'file', multiple: true, hidden: true,
                             accept: '.txt,.lrc,text/plain',
                             onchange: e => { const f = [...e.target.files]; e.target.value = '';
                                              if (f.length) cb.onFiles(f); }});
  const pick = () => picker.click();

  const bundle = ui.bundle && bundlePanel(ui.bundle, cb);
  const add = ui.pasting ? pastePanel(ui, cb)
    : bundle ? ''
    : h('section', {class: 'block', 'aria-label': 'Add a text'},
        !m.rows.length && h('p', {class: 'lead-note'},
          'Add something you want to read. Jyutping shows over only the characters you don’t know yet, and the text you make the focus sets what Today teaches next.'),
        h('div', {class: 'btns'},
          h('button', {type: 'button', class: `btn ${m.rows.length ? 'quiet' : 'primary'}`,
                       onclick: cb.onPaste}, 'Paste a text'),
          h('button', {type: 'button', class: 'btn quiet', onclick: pick}, 'Import files'),
          h('button', {type: 'button', class: 'btn quiet', onclick: cb.onLink}, 'Get texts from a link')),
        !m.rows.length && h('button', {type: 'button', class: 'link', onclick: cb.onSample},
          'Try the sample text, 飲茶'));

  const batch = ui.batch && h('section', {class: 'block', 'aria-live': 'polite'},
    h('span', {class: 'label'}, ui.batch.done ? 'Imported' : 'Importing'),
    h('p', {class: 'note'}, ui.batch.status),
    h('ul', {class: 'batch-log'}, ...ui.batch.log.map(l => h('li', {class: l.result},
      `${l.name} — ${l.result === 'added' ? `added${l.note ? `, ${l.note}` : ''}` : `${l.result}: ${l.why}`}`))),
    ui.batch.done && h('button', {type: 'button', class: 'link', onclick: cb.onCloseBatch}, 'Done'));

  const list = m.rows.length > 0 && h('section', {class: 'block', 'aria-label': 'Your texts'},
    m.focus
      ? h('p', {class: 'note'}, 'The focus text sets what Today teaches next. Move it any time.')
      : h('p', {class: 'note'}, 'Make a text the focus, and Today teaches its characters first.'),
    h('ul', {class: 'text-list'}, ...m.rows.map(r => textRow(r, ui, cb))));

  put(clear(el),
    h('div', {class: 'top'}, h('span', {}), h('span', {})),
    h('h1', {id: 'texts-h'}, 'Texts'),
    bundle || '', batch || '', list || '', add, picker,
    // Send feedback at the foot (patch plan 7B, Phase 3)
    cb.onFeedback && h('section', {class: 'block quiet'},
      h('button', {type: 'button', class: 'link', onclick: cb.onFeedback}, 'Send feedback')));
}

function textRow(r, ui, cb) {
  const title = ui.renaming === r.id
    ? renameForm(r, cb)
    : (cb.onOpen
      ? h('button', {type: 'button', class: 'text-title', onclick: () => cb.onOpen(r.id)}, han(r.title))
      : h('span', {class: 'text-title'}, han(r.title)));
  return h('li', {class: `text-row${r.focus ? ' is-focus' : ''}`},
    h('div', {class: 'row'}, title,
      r.focus && h('span', {class: 'tag accent'}, 'Focus')),
    h('p', {class: 'text-meta'}, readable(r),
      r.badge && h('span', {class: 'badge'}, r.badge)),
    h('div', {class: 'bar', 'aria-hidden': 'true'},
      h('i', {style: `width:${r.pct || 0}%`})),
    ui.renaming !== r.id && h('div', {class: 'links'},
      !r.focus && h('button', {type: 'button', class: 'link', onclick: () => cb.onFocus(r.id)}, 'Make focus'),
      h('button', {type: 'button', class: 'link', onclick: () => cb.onRename(r.id)}, 'Rename'),
      h('button', {type: 'button', class: 'link', onclick: () => cb.onDelete(r.id)}, 'Delete')));
}

function renameForm(r, cb) {
  const input = h('input', {class: 'note-input title-input', value: r.title, maxlength: 60,
                            'aria-label': 'Title', lang: 'zh-Hant-HK'});
  const save = e => { e.preventDefault(); cb.onRenamed(r.id, input.value); };
  const form = h('form', {class: 'rename', onsubmit: save},
    input,
    h('div', {class: 'btns'},
      h('button', {type: 'submit', class: 'btn primary'}, 'Save'),
      h('button', {type: 'button', class: 'btn quiet', onclick: cb.onCancelRename}, 'Cancel')));
  queueMicrotask(() => { input.focus(); input.select(); });
  return form;
}

// The paste box. Typing updates the preview in place rather than redrawing
// the screen, so the text area keeps its focus and its caret.
function pastePanel(ui, cb) {
  const d = ui.draft;
  const area = h('textarea', {class: 'paste-area', rows: 8, lang: 'zh-Hant-HK',
                              placeholder: 'Paste Chinese text here',
                              'aria-label': 'The text'});
  area.value = d.raw;
  const title = h('input', {class: 'note-input title-input', value: d.title, maxlength: 60,
                            placeholder: 'Title (the first line, unless you give one)',
                            'aria-label': 'Title', lang: 'zh-Hant-HK'});
  const meta = h('p', {class: 'note'});
  const why = h('p', {class: 'refusal', role: 'status'});
  const addBtn = h('button', {type: 'submit', class: 'btn primary'}, 'Add');
  let titleAuto = d.titleAuto;
  const refresh = () => {
    const p = cb.preview(area.value);
    if (p.note && p.body !== area.value) area.value = p.body;      // an LRC, stripped
    if (titleAuto) title.value = p.title;
    meta.textContent = previewLine(p);
    why.textContent = area.value.trim() && p.problem ? p.problem.message : '';
    addBtn.disabled = !!p.problem;
    cb.onDraft(area.value, title.value, titleAuto);
  };
  area.addEventListener('input', refresh);
  title.addEventListener('input', () => { titleAuto = !title.value.trim(); cb.onDraft(area.value, title.value, titleAuto); });
  queueMicrotask(() => { refresh(); if (!d.raw) area.focus(); });
  return h('form', {class: 'block paste', 'aria-label': 'Paste a text',
                    onsubmit: e => { e.preventDefault(); cb.onAdd(area.value, title.value); }},
    h('span', {class: 'label'}, 'Paste a text'),
    area, title, meta, why,
    h('div', {class: 'btns'},
      addBtn,
      h('button', {type: 'button', class: 'btn quiet', onclick: cb.onCancelPaste}, 'Cancel')));
}

// Get texts from a link (7.14): the field, then the preview. Nothing is
// saved until Add, which hands the ticked files to the shell's batch import.
function bundlePanel(b, cb) {
  if (b.stage === 'loading') {
    return h('section', {class: 'block', 'aria-label': 'Text set', 'aria-live': 'polite'},
      h('span', {class: 'label'}, 'Text set'),
      h('p', {class: 'note'}, 'Getting the text set…'),
      h('div', {class: 'btns'},
        h('button', {type: 'button', class: 'btn quiet', onclick: cb.onBundleCancel}, 'Cancel')));
  }
  if (b.stage === 'preview') return previewPanel(b, cb);
  const input = h('input', {class: 'note-input', value: b.input || '', type: 'text',
                            inputmode: 'url', autocapitalize: 'off', autocorrect: 'off',
                            spellcheck: 'false', autocomplete: 'off',
                            placeholder: 'Link or set name', 'aria-label': 'Link or set name'});
  const get = e => { e.preventDefault(); cb.onLinkGet(input.value); };
  if (!b.input) queueMicrotask(() => input.focus());
  return h('form', {class: 'block paste', 'aria-label': 'Get texts from a link', onsubmit: get},
    h('span', {class: 'label'}, 'Get texts from a link'),
    h('p', {class: 'note'}, 'Paste the link you were sent, or type the set’s name.'),
    input,
    h('p', {class: 'refusal', role: 'status'}, b.error || ''),
    h('div', {class: 'btns'},
      cb.onLinkPaste && h('button', {type: 'button', class: 'btn quiet', onclick: cb.onLinkPaste}, 'Paste'),
      h('button', {type: 'submit', class: 'btn primary'}, b.retry ? 'Try again' : 'Get'),
      h('button', {type: 'button', class: 'btn quiet', onclick: cb.onBundleCancel}, 'Cancel')));
}

// The ticks update the button in place, as the paste box does, so the list
// keeps its scroll.
function previewPanel(b, cb) {
  const {index, chosen} = b;
  const addBtn = h('button', {type: 'button', class: 'btn primary', onclick: cb.onBundleAdd,
                              disabled: chosen.size === 0}, addLabel(chosen.size));
  const tick = (file, on) => {
    cb.onBundleTick(file, on);
    addBtn.textContent = addLabel(chosen.size);
    addBtn.disabled = chosen.size === 0;
  };
  return h('section', {class: 'block bundle', 'aria-label': 'Text set'},
    h('span', {class: 'label'}, 'Text set'),
    h('p', {class: 'lead-note'}, index.name),
    index.description && h('p', {class: 'note'}, index.description),
    b.note && h('p', {class: 'note bundle-note'}, BUNDLE_NOTE[b.note]),
    h('p', {class: 'note'}, index.texts.length ? plural(index.texts.length, 'text')
                                               : 'There are no texts in this set yet.'),
    h('ul', {class: 'bundle-list'}, ...index.texts.map(t => h('li', {},
      h('label', {class: 'bundle-row'},
        h('input', {type: 'checkbox', checked: chosen.has(t.file),
                    onchange: e => tick(t.file, e.target.checked)}),
        han(t.title, {class: 'bundle-title'}),
        h('span', {class: 'note'}, plural(t.chars, 'character')))))),
    h('div', {class: 'btns'},
      addBtn,
      h('button', {type: 'button', class: 'btn quiet', onclick: cb.onBundleCancel}, 'Cancel')));
}
