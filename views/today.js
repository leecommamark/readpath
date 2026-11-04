// today.js — the Today screen (patch plan 4, Phase 3; Blueprint: Today).
//
// todayModel() is pure: compose()'s summary and the learner's states in,
// what the screen says out, so a test can read it without a DOM. renderToday()
// draws it. The screen shows the session (counts and a time estimate), Start,
// what's next up, and the known totals (DESIGN *Screens*), and Continue
// reading the focus text (step 5); the export and import controls live here until a
// settings screen exists.

import {searchButton} from './search.js';
import {h, han, clear, put, speakerIcon} from './dom.js';
import {isKnown} from '../core/state.js';
import {DEFAULTS} from '../core/today.js';
import {glyphTile} from './glyph.js';
import {toNextMarker} from '../core/markers.js';
import {readableLine, progressBar} from './texts.js';

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// `reading` is the focus text's coverage, {id, title, pct, learningPct,
// toLearn}, or null: Continue reading (patch plan 5; in progress, 7.29 K1).
// `trail` is where the learner is among the trail markers (brief 7.29 M3).
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
  // characters: main readings; in progress: met, not yet known (K3)
  let characters = 0, partsKnown = 0, learning = 0;
  for (const st of Object.values(states)) {
    if (!content.has(st.item)) continue;
    const it = content.item(st.item);
    if (!isKnown(st)) {
      if (it.kind === 'reading' && it.primary) learning++;
      continue;
    }
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
    known: {characters, parts: partsKnown, learning},
    trail: toNextMarker(content, states),
  };
}

// "開步 · 18 more to 行開" (M3): the marker, and the characters to the next
export function trailLine(t) {
  return t.next ? `${t.marker.name} · ${t.more.toLocaleString('en-GB')} more to ${t.next.name}`
    : `${t.marker.name} · ${t.marker.gloss}`;
}

// The placement check's card on Today (brief 7.8 decided 3): until a check
// has been done (a placement record) or the card has been dismissed (Not
// now: meta.placementOffer, a flag, not progress); never in first run,
// which offers the check itself, and never while a check's review is pending
// (the resume card takes its place, 7.13 decided 10). Path's row offers it
// either way.
export function placementOffered({placement = null, meta = {}, firstRun = false, pending = null} = {}) {
  return !firstRun && !pending && !placement && !meta.placementOffer;
}

// The gear before Settings, drawn here (no icon set): a dashed ring is its
// eight teeth, a ring inside them its body.
const SVG = 'http://www.w3.org/2000/svg';
function gear() {
  const el = (tag, attrs) => {
    const e = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    return e;
  };
  const svg = el('svg', {class: 'gear', viewBox: '0 0 24 24', 'aria-hidden': 'true'});
  svg.append(el('circle', {cx: 12, cy: 12, r: 8.5, fill: 'none', stroke: 'currentColor',
                           'stroke-width': 3.5, 'stroke-dasharray': (2 * Math.PI * 8.5 / 16).toFixed(3)}),
             el('circle', {cx: 12, cy: 12, r: 6, fill: 'none', stroke: 'currentColor', 'stroke-width': 2.2}));
  return svg;
}

// Today's audio, beside Start (brief 7.31 A6): one button, On or Quiet,
// that turns to the other; Keep going and Practise again follow it.
function audioToggle(value, onChange) {
  const quiet = value === 'quiet';
  return h('button', {type: 'button', class: `btn audio-toggle${quiet ? ' quiet' : ''}`,
                      'aria-pressed': String(!quiet), 'aria-label': quiet ? 'Audio: quiet. Turn on' : 'Audio: on. Make quiet',
                      onclick: () => onChange(quiet ? 'on' : 'quiet')},
    speakerIcon(quiet), quiet ? 'Quiet' : 'On');
}

// renderToday(el, model, {date, onStart, onExport, onImport, onRef, trouble,
//                         version, loadedMs, unsent, practiceCount, onPractice,
//                         onKeepGoing, onRead(textId),
//                         build, update, onUpdate, install, onInstall, exportDue,
//                         onFeedback, onAbout, onSettings, placementOffer, onCheck, onNotNow,
//                         placementPending ('questions' | 'review' | falsy), onResume,
//                         onStartOver, placementHigh, onPlacementNoted, newPerDay})
//   update: a new build is waiting ("Update ready · Reload", patch plan 7B);
//   install: 'ios' (the Add to Home Screen steps) | 'prompt' (the browser's
//   Install) | null; exportDue: pwa.js's exportReminder(), {days, never};
//   newPerDay: the learner's new items a day, for Keep going's note (7.31);
//   dayAudio: 'on' | 'quiet', today's audio beside Start, or null for no
//   toggle (audio Off, or no Cantonese voice; brief 7.31 A6); onDayAudio(v)
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
          'Practice doesn’t change your schedule. Keep going starts tomorrow’s reviews early, then '
            + `${opts.newPerDay ?? DEFAULTS.new_per_day} new.`))
    : h('section', {class: 'block first', 'aria-labelledby': 'session-h'},
        h('div', {class: 'row'},
          h('h2', {id: 'session-h'}, 'Today’s session'),
          h('span', {class: 'sm'}, `about ${m.minutes} min`)),
        h('p', {class: 'session-line'}, m.line,
          m.from && [m.line ? ' · ' : '', h('span', {class: 'nowrap'}, m.from)]),
        m.backlog && h('p', {class: 'note'},
          'Lots of reviews are due, so there are no new items today. They come back once the reviews are down.'),
        opts.dayAudio
          ? h('div', {class: 'start-row'},
              h('button', {type: 'button', class: 'btn primary wide', onclick: opts.onStart}, 'Start'),
              audioToggle(opts.dayAudio, opts.onDayAudio))
          : h('button', {type: 'button', class: 'btn primary wide', onclick: opts.onStart},
              'Start'));

  const next = m.next && h('section', {class: 'block', 'aria-label': 'Next up'},
    h('div', {class: 'row'}, h('span', {class: 'label'}, 'Next up'),
      h('span', {class: 'tag learn'}, m.next.chip)),
    h('div', {class: 'next'},
      glyphTile(m.next.form, opts.kindOf ? opts.kindOf(m.next.form) : null,
                {size: 'lg', over: m.next.jp || '',
                 progress: opts.progressOf ? opts.progressOf(m.next.form) : null,
                 onTap: opts.onRef ? f => opts.onRef(f) : null}),
      h('span', {}, m.next.note)));

  // Continue reading: the focus text, how readable it is, and a tap that
  // opens it where it was left
  const r = m.reading;
  const reading = r && h('section', {class: 'block', 'aria-label': 'Continue reading'},
    h('span', {class: 'label'}, 'Continue reading'),
    h('button', {type: 'button', class: 'continue', onclick: () => opts.onRead && opts.onRead(r.id)},
      h('span', {class: 'text-title'}, han(r.title)),
      h('span', {class: 'text-meta'}, r.toLearn ? readableLine(r) : `${r.pct}% readable · every reading known`),
      progressBar(r.pct, r.learningPct)));

  const place = opts.placementOffer && !opts.placementPending && h('section', {class: 'block', 'aria-labelledby': 'place-h'},
    h('h2', {id: 'place-h'}, 'Already read some Chinese?'),
    h('p', {class: 'note'}, 'Check what you know: a few minutes’ check marks the characters you can already read.'),
    h('div', {class: 'btns'},
      h('button', {type: 'button', class: 'btn', onclick: opts.onCheck}, 'Check'),
      h('button', {type: 'button', class: 'btn quiet', onclick: opts.onNotNow}, 'Not now')));

  // placement may have been high (7.13 decided 12): said once, then OK
  const high = opts.placementHigh && h('section', {class: 'block', 'aria-labelledby': 'high-h'},
    h('h2', {id: 'high-h'}, 'Placement may have been high'),
    h('p', {class: 'note'}, `${opts.placementHigh.miss} of the ${opts.placementHigh.pass + opts.placementHigh.miss} `
      + 'placed characters you’ve reviewed so far didn’t come back to you. They’ve gone back into '
      + 'learning on their own, so there’s nothing to do.'),
    h('button', {type: 'button', class: 'btn', onclick: opts.onPlacementNoted}, 'OK'));

  // a check left midway (Mark, after 7.13) or done but not confirmed (7.13
  // decided 10): go on with it, or start over
  const atReview = opts.placementPending === 'review';
  const resume = opts.placementPending && h('section', {class: 'block', 'aria-labelledby': 'resume-h'},
    h('h2', {id: 'resume-h'}, atReview ? 'Finish checking your placement' : 'Finish your placement check'),
    h('p', {class: 'note'}, atReview
      ? 'Your check is done. Look over its last pages, then mark them known.'
      : 'You’re partway through. Carry on where you left off.'),
    h('div', {class: 'btns'},
      h('button', {type: 'button', class: 'btn primary', onclick: opts.onResume},
        atReview ? 'Finish checking' : 'Carry on'),
      opts.onStartOver && h('button', {type: 'button', class: 'btn quiet', onclick: opts.onStartOver},
        'Start over')));

  // a marker passed (M4): one line, the day after, until tapped away
  const p = opts.passed;
  const passed = p && h('section', {class: 'block passed', role: 'status'},
    h('button', {type: 'button', class: 'passed-line', onclick: opts.onPassedSeen,
                 'aria-label': 'Dismiss'},
      h('span', {}, 'You passed ', h('b', {lang: 'zh-Hant-HK'}, p.name), p.yesterday ? ' yesterday.' : '.'),
      h('span', {class: 'sm'}, p.gloss),
      h('span', {class: 'passed-x', 'aria-hidden': 'true'}, '✕')));

  const known = h('section', {class: 'block'},
    h('span', {class: 'label'}, 'So far'),
    h('p', {class: 'known', style: 'margin:0'},
      // characters known, those in progress, then parts (Mark, 7.29 Phase 2)
      h('b', {}, String(m.known.characters)), ` ${m.known.characters === 1 ? 'character' : 'characters'} known`,
      m.known.learning > 0 && [' · ', h('b', {}, String(m.known.learning)), ' in progress'],
      ' · ',
      h('b', {}, String(m.known.parts)), ` ${m.known.parts === 1 ? 'part' : 'parts'} known`));

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
    opts.unsent > 0 && h('p', {class: 'note unsent'},
      `${plural(opts.unsent, 'report')} not sent yet. ${opts.unsent === 1 ? 'It goes' : 'They go'} `
      + 'to Mark when the app is back online, and with your next export.'),
    opts.version && h('p', {class: 'sm', style: 'margin:var(--s2) 0 0'},
      (opts.build ? `App ${opts.build} · ` : '') + `Content ${opts.version}` + (opts.loadedMs != null ? ` · loaded in ${opts.loadedMs} ms` : '')));

  // a row as on Path: a title, a line under it, and ›
  const jump = (onclick, title, sub, icon = null) => onclick && h('section', {class: 'block jumps'},
    h('button', {type: 'button', class: 'jump', onclick},
      h('span', {class: 'jump-text'}, h('b', {}, icon || '', title), sub && h('span', {class: 'sm'}, sub)),
      h('span', {class: 'jump-go', 'aria-hidden': 'true'}, '›')));
  // Send feedback during the beta (brief 7.19 P5), below the learning since
  // brief 7.28 P29
  const feedback = jump(opts.onFeedback, 'Send feedback', 'A note, and your reports, to Mark');
  // the search, under the session card (brief 7.28 P18)
  const find = jump(opts.onSearch, 'Find a character or sound', null);
  // Settings and About, each a row at the foot (brief 7.28 P29; one row of
  // links in Your progress since 7.12)
  const settings = jump(opts.onSettings, 'Settings', null, gear());
  const about = jump(opts.onAbout, 'About and licences', null);

  const trouble = opts.trouble;
  const warn = h('p', {class: 'warn', role: 'status', hidden: !trouble},
    trouble ? `Some progress could not be saved (${trouble.message}). ` +
              `${plural(trouble.pending, 'item')} still pending. Export your progress to keep a copy.` : '');

  put(clear(el),
    h('div', {class: 'top'},
      h('span', {class: 'top-date'}, opts.date || '',
        m.trail && h('span', {class: 'trail-line', lang: 'zh-Hant-HK'}, trailLine(m.trail))),
      searchButton(opts.onSearch) || h('span', {})),
    h('h1', {id: 'today-h'}, 'Today'),
    passed || '',
    // brief 7.28 P29: an unfinished placement first, then the session, the
    // search, the learning, feedback, and the device's rows at the foot
    update || '', warn, resume || '', session, find || '', reading || '', next || '',
    feedback || '', place || '', high || '', known, install || '', progress,
    settings || '', about || '');
}
