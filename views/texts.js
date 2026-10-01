// texts.js — the Texts screen (patch plan 5, Phase 3; DESIGN *Screens*: Texts).
//
// The library: each text with its title, "N% readable", a badge for a
// simplified or mixed source, and the one Focus marker, which the learner
// moves (decided 1). Add a text by pasting it (with a preview and a title
// taken from its first line) or by importing one file or several (a batch
// with a running count and a line per file). Rename in place; delete with
// Undo (the shell's toast). An empty library offers the sample, 飲茶.
//
// libraryModel() and previewOf() are pure, so a test reads them without a
// DOM. renderTexts() draws the screen; what happens on a tap is the shell's
// (main.js), passed in as callbacks.

import {h, han, clear, put} from './dom.js';
import {bodyOfFile, importProblem, autoTitle} from '../core/import.js';
import {normalizeText} from '../core/normalize.js';
import {CJK_RUN_SOURCE} from '../core/segment.js';

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

const readable = r => (r.pct === null ? 'Working out how readable…'
  : `${r.pct}% readable` + (r.toLearn ? ` · ${plural(r.toLearn, 'reading')} to learn` : ''));

// renderTexts(el, model, ui, cb)
//   ui: {pasting, draft: {raw, title, titleAuto}, renaming, batch}
//   cb: onPaste, onDraft(raw, title, titleAuto), onAdd, onCancelPaste,
//       onFiles(FileList), onSample, onFocus(id), onRename(id), onRenamed(id,
//       title), onCancelRename, onDelete(id), onOpen(id) (the Reader, step 5
//       Phase 4; absent until then), preview(raw) -> previewOf's result
export function renderTexts(el, m, ui, cb) {
  const picker = h('input', {type: 'file', multiple: true, hidden: true,
                             accept: '.txt,.lrc,text/plain',
                             onchange: e => { const f = [...e.target.files]; e.target.value = '';
                                              if (f.length) cb.onFiles(f); }});
  const pick = () => picker.click();

  const add = ui.pasting ? pastePanel(ui, cb)
    : h('section', {class: 'block', 'aria-label': 'Add a text'},
        !m.rows.length && h('p', {class: 'lead-note'},
          'Add something you want to read. Jyutping shows over only the characters you don’t know yet, and the text you make the focus sets what Today teaches next.'),
        h('div', {class: 'btns'},
          h('button', {type: 'button', class: `btn ${m.rows.length ? 'quiet' : 'primary'}`,
                       onclick: cb.onPaste}, 'Paste a text'),
          h('button', {type: 'button', class: 'btn quiet', onclick: pick}, 'Import files')),
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
    batch || '', list || '', add, picker,
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
