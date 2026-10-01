// today.js — the Today screen (patch plan 4, Phase 3; Blueprint: Today).
//
// todayModel() is pure: compose()'s summary and the learner's states in,
// what the screen says out, so a test can read it without a DOM. renderToday()
// draws it. The screen shows the session (counts and a time estimate), Start,
// what's next up, and the known totals (DESIGN *Screens*), and Continue
// reading the focus text (step 5); the export and import controls live here until a
// settings screen exists.

import {h, han, clear} from './dom.js';
import {isKnown} from '../core/state.js';
import {glyphTile} from './glyph.js';

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// `reading` is the focus text's coverage, {id, title, pct, toLearn}, or
// null: Continue reading (patch plan 5).
export function todayModel(content, states, summary, reading = null) {
  const s = summary;
  const parts = [];
  if (s.reviews) parts.push(plural(s.reviews, 'review'));
  const fresh = s.new.characters + s.new.parts;
  if (fresh) {
    const what = [s.new.parts && plural(s.new.parts, 'part'),
                  s.new.characters && plural(s.new.characters, 'character')]
      .filter(Boolean).join(', ');
    parts.push(`${fresh} new (${what})`);
  }
  // how many of today's new items the focus text supplied (decided 12); its
  // own field, so the title never breaks across lines
  const from = s.new.from_focus && s.focus ? `${s.new.from_focus} from 《${s.focus.title}》` : null;
  let next = null;
  if (s.next_up) {
    const it = content.item(s.next_up);
    if (it.kind === 'reading') {
      next = it.primary
        ? {form: it.char, jp: it.jp, chip: 'character', note: 'a new character'}
        : {form: it.char, jp: it.jp, chip: 'reading', note: 'a new reading of a character you know'};
    } else if (it.kind === 'sound') {
      const n = content.membersOf(it.id).length;
      next = {form: it.part, jp: it.taughtReading, chip: 'sound part',
              note: `unlocks ${plural(n, 'character')} on your path`};
    } else {
      const n = content.membersOf(it.id).length;
      next = {form: it.part, chip: 'meaning part',
              note: `${it.gloss || 'a meaning part'} · in ${plural(n, 'character')} on your path`};
    }
  }
  let characters = 0, partsKnown = 0;
  for (const st of Object.values(states)) {
    if (!isKnown(st) || !content.has(st.item)) continue;
    const it = content.item(st.item);
    if (it.kind !== 'reading') partsKnown++;
    else if (it.primary) characters++;
  }
  return {
    tasks: s.tasks,
    minutes: s.est_minutes,
    line: parts.join(' · '),
    from,
    done: s.tasks === 0,
    backlog: s.backlog_rule,
    dropped: s.dropped_new,
    next,
    reading,
    known: {characters, parts: partsKnown},
  };
}

// renderToday(el, model, {date, onStart, onExport, onImport, onRef, trouble,
//                         version, loadedMs, unsent, practiceCount, onPractice,
//                         onKeepGoing, onRead(textId),
//                         build, update, onUpdate, install, onInstall, exportDue,
//                         onFeedback, onAbout})
//   update: a new build is waiting ("Update ready · Reload", patch plan 7B);
//   install: 'ios' (the Add to Home Screen steps) | 'prompt' (the browser's
//   Install) | null; exportDue: pwa.js's exportReminder(), {days, never}
export function renderToday(el, m, opts) {
  // Done for the day: practise what was answered (it doesn't count), or keep
  // going into tomorrow's session early (it does). Mark, 2026-09-29.
  const session = m.done
    ? h('section', {class: 'block first'},
        h('h2', {}, 'All done for today'),
        h('p', {class: 'note'}, 'Nothing more is due today.'),
        h('div', {class: 'btns stack'},
          opts.practiceCount > 0 && h('button', {type: 'button', class: 'btn', onclick: opts.onPractice},
            `Practise again (${opts.practiceCount})`),
          h('button', {type: 'button', class: 'btn primary', onclick: opts.onKeepGoing}, 'Keep going')),
        h('p', {class: 'note'},
          'Practice doesn’t change your schedule. Keep going starts tomorrow’s reviews early, then 10 new.'))
    : h('section', {class: 'block first', 'aria-labelledby': 'session-h'},
        h('div', {class: 'row'},
          h('h2', {id: 'session-h'}, 'Today’s session'),
          h('span', {class: 'sm'}, `about ${m.minutes} min`)),
        h('p', {class: 'session-line'}, m.line,
          m.from && [m.line ? ' · ' : '', h('span', {class: 'nowrap'}, m.from)]),
        m.backlog && h('p', {class: 'note'},
          'Lots of reviews are due, so there are no new items today. They come back once the reviews are down.'),
        h('button', {type: 'button', class: 'btn primary wide', onclick: opts.onStart},
          'Start'));

  const next = m.next && h('section', {class: 'block', 'aria-label': 'Next up'},
    h('div', {class: 'row'}, h('span', {class: 'label'}, 'Next up'),
      h('span', {class: 'tag learn'}, m.next.chip)),
    h('div', {class: 'next'},
      glyphTile(m.next.form, opts.kindOf ? opts.kindOf(m.next.form) : null,
                {size: 'lg', over: m.next.jp || '',
                 onTap: opts.onRef ? f => opts.onRef(f) : null}),
      h('span', {}, m.next.note)));

  // Continue reading: the focus text, how readable it is, and a tap that
  // opens it where it was left
  const r = m.reading;
  const reading = r && h('section', {class: 'block', 'aria-label': 'Continue reading'},
    h('span', {class: 'label'}, 'Continue reading'),
    h('button', {type: 'button', class: 'continue', onclick: () => opts.onRead && opts.onRead(r.id)},
      h('span', {class: 'text-title'}, han(r.title)),
      h('span', {class: 'text-meta'}, `${r.pct}% readable` +
        (r.toLearn ? ` · ${plural(r.toLearn, 'reading')} to go` : ' · every reading known')),
      h('span', {class: 'bar', 'aria-hidden': 'true'}, h('i', {style: `width:${r.pct}%`}))));

  const known = h('section', {class: 'block'},
    h('span', {class: 'label'}, 'Known'),
    h('p', {class: 'known', style: 'margin:0'},
      h('b', {}, String(m.known.characters)), ` ${m.known.characters === 1 ? 'character' : 'characters'}`,
      ' · ',
      h('b', {}, String(m.known.parts)), ` ${m.known.parts === 1 ? 'part' : 'parts'}`));

  const update = opts.update && h('section', {class: 'block first update', role: 'status'},
    h('div', {class: 'row'},
      h('span', {}, 'Update ready'),
      h('button', {type: 'button', class: 'btn quiet', onclick: opts.onUpdate}, 'Reload')));

  // until the app is installed (patch plan 7B): on iOS a Safari tab's
  // storage is not the installed app's, and can be cleared after a week
  const install = opts.install && h('section', {class: 'block', 'aria-labelledby': 'install-h'},
    h('span', {class: 'label', id: 'install-h'}, 'Add to Home Screen'),
    opts.install === 'ios'
      ? h('p', {class: 'note'},
          'Tap Share (in iOS 26, under ⋯), then Add to Home Screen, then Add. '
          + 'From your home screen Read Path works offline, and keeps your progress.')
      : [h('p', {class: 'note'}, 'Install Read Path to use it offline, like an app.'),
         h('button', {type: 'button', class: 'btn quiet', onclick: opts.onInstall}, 'Install')]);

  const due = opts.exportDue;
  const progress = h('section', {class: 'block quiet', 'aria-labelledby': 'progress-h'},
    h('span', {class: 'label', id: 'progress-h'}, 'Your progress'),
    h('p', {class: 'note'},
      'Saved on this device. Export it to keep a copy, or to move it to another device.'),
    due && h('p', {class: 'note unsent'},
      due.never ? `You started ${due.days} days ago and haven’t exported yet. Export to keep a copy.`
                : `Your last export was ${due.days} days ago. Export to keep a copy.`),
    h('div', {class: 'btns', style: 'margin-top:var(--s2)'},
      h('button', {type: 'button', class: 'btn quiet', onclick: opts.onExport}, 'Export'),
      h('button', {type: 'button', class: 'btn quiet', onclick: opts.onImport}, 'Import')),
    // Send feedback, and About and licences (patch plan 7B, Phase 3)
    opts.onFeedback && h('div', {class: 'btns', style: 'margin-top:var(--s2)'},
      h('button', {type: 'button', class: 'btn quiet', onclick: opts.onFeedback}, 'Send feedback')),
    opts.onAbout && h('button', {type: 'button', class: 'link', onclick: opts.onAbout},
      'About and licences'),
    opts.unsent > 0 && h('p', {class: 'note unsent'},
      `${plural(opts.unsent, 'report')} ${opts.unsent === 1 ? 'goes' : 'go'} out with your next export.`),
    opts.version && h('p', {class: 'sm', style: 'margin:var(--s2) 0 0'},
      (opts.build ? `App ${opts.build} · ` : '') + `Content ${opts.version}` + (opts.loadedMs != null ? ` · loaded in ${opts.loadedMs} ms` : '')));

  const trouble = opts.trouble;
  const warn = h('p', {class: 'warn', role: 'status', hidden: !trouble},
    trouble ? `Some progress could not be saved (${trouble.message}). ` +
              `${plural(trouble.pending, 'item')} still pending. Export your progress to keep a copy.` : '');

  clear(el).append(
    h('div', {class: 'top'}, h('span', {}, opts.date || ''), h('span', {})),
    h('h1', {id: 'today-h'}, 'Today'),
    update || '', warn, session, reading || '', next || '', known, install || '', progress);
}
