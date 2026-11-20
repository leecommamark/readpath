// today.js — the Today screen (patch plan 4, Phase 3; Blueprint: Today).
//
// todayModel() is pure: compose()'s summary and the learner's states in,
// what the screen says out, so a test can read it without a DOM. renderToday()
// draws it. The screen shows the session (counts and a time estimate) and
// Start, Continue reading the focus text (step 5), and the notices that need
// the learner; search and the Settings gear in its header (brief 7.38 P5,
// decided 4: progress is shown once, on Path; feedback, export and import,
// install, About and the build id are Settings').

import {searchButton} from './search.js';
import {h, han, clear, put, speakerIcon} from './dom.js';
import {DEFAULTS} from '../core/today.js';
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
  return {
    tasks: s.tasks,
    minutes: s.est_minutes,
    line: parts.join(' · '),
    from,
    done: s.tasks === 0,
    backlog: s.backlog_rule,
    dropped: s.dropped_new,
    reading,
    // where the learner is among the markers: Today says when one is passed
    // (M4); Path shows the rest
    trail: toNextMarker(content, states),
  };
}

// The placement check's card on Today (brief 7.8 decided 3): until a check
// has been done (a placement record) or the card has been dismissed (Not
// now: meta.placementOffer, a flag, not progress); never in first run,
// which offers the check itself, and never while a check's review is pending
// (the resume card takes its place, 7.13 decided 10); and only until the
// first session is done (`started`: the learner has answered something;
// brief 7.38 Q7). Path's row offers it either way.
export function placementOffered({placement = null, meta = {}, firstRun = false, pending = null,
                                  started = false} = {}) {
  return !firstRun && !pending && !started && !placement && !meta.placementOffer;
}

// The gear that opens Settings, beside search in the header (brief 7.38
// P5), drawn here (no icon set): a dashed ring is its teeth, a ring inside
// them its body.
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
export const settingsButton = onSettings => onSettings && h('button', {type: 'button', class: 'icon-btn gear-btn',
  'aria-label': 'Settings', onclick: onSettings}, gear());

// Today's audio, beside Start (brief 7.31 A6): one button, On or Quiet,
// that turns to the other; Keep going and Practise again follow it.
function audioToggle(value, onChange) {
  const quiet = value === 'quiet';
  return h('button', {type: 'button', class: `btn audio-toggle${quiet ? ' quiet' : ''}`,
                      'aria-pressed': String(!quiet), 'aria-label': quiet ? 'Audio: quiet. Turn on' : 'Audio: on. Make quiet',
                      onclick: () => onChange(quiet ? 'on' : 'quiet')},
    speakerIcon(quiet), quiet ? 'Quiet' : 'On');
}

// renderToday(el, model, {date, onStart, trouble, practiceCount, onPractice,
//                         onKeepGoing, onRead(textId), update, onUpdate, exportDue,
//                         onSearch, onSettings, placementOffer, onCheck, onNotNow,
//                         placementPending ('questions' | 'review' | falsy), onResume,
//                         onStartOver, placementHigh, onPlacementNoted, newPerDay,
//                         passed, onPassedSeen, dayAudio, onDayAudio})
//   update: a new build is waiting ("Update ready · Reload", patch plan 7B);
//   exportDue: pwa.js's exportReminder(), {days, never}, one line that opens
//   Settings (brief 7.38 Q7); newPerDay: the learner's new items a day, for
//   Keep going's note (7.31); dayAudio: 'on' | 'quiet', today's audio beside
//   Start, or null for no toggle (audio Off, or no Cantonese voice; brief
//   7.31 A6); onDayAudio(v)
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

  // Continue reading: the focus text, how readable it is, and a tap that
  // opens it where it was left
  const r = m.reading;
  const reading = r && h('section', {class: 'block', 'aria-label': 'Continue reading'},
    h('span', {class: 'label'}, 'Continue reading'),
    h('button', {type: 'button', class: 'continue', onclick: () => opts.onRead && opts.onRead(r.id)},
      h('span', {class: 'text-title'}, han(r.title)),
      h('span', {class: 'text-meta'}, r.toLearn ? readableLine(r) : `${r.pct}% readable · every reading known`),
      progressBar(r.pct, r.learningPct)));

  // the notices that need the learner (brief 7.38 Q7), above the session
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

  const update = opts.update && h('section', {class: 'block first update', role: 'status'},
    h('div', {class: 'row'},
      h('span', {}, 'Update ready'),
      h('button', {type: 'button', class: 'btn quiet', onclick: opts.onUpdate}, 'Reload')));

  // the export nudge: one line, opening Settings' Your progress (Q7)
  const due = opts.exportDue;
  const nudge = due && h('section', {class: 'block jumps'},
    h('button', {type: 'button', class: 'jump', onclick: opts.onSettings},
      h('span', {class: 'jump-text'}, h('span', {class: 'note unsent'},
        due.never ? `You started ${due.days} days ago and haven’t exported your progress yet.`
                  : `Your last export was ${due.days} days ago.`)),
      h('span', {class: 'jump-go', 'aria-hidden': 'true'}, '›')));

  const trouble = opts.trouble;
  const warn = h('p', {class: 'warn', role: 'status', hidden: !trouble},
    trouble ? `Some progress could not be saved (${trouble.message}). ` +
              `${plural(trouble.pending, 'item')} still pending. Export your progress to keep a copy.` : '');

  put(clear(el),
    h('div', {class: 'top'},
      h('span', {class: 'top-date'}, opts.date || ''),
      h('span', {class: 'top-right'}, searchButton(opts.onSearch) || '', settingsButton(opts.onSettings) || '')),
    h('h1', {id: 'today-h'}, 'Today'),
    // the notices, then the session and Continue reading (brief 7.38 P5)
    passed || '', update || '', warn, resume || '', place || '', high || '', nudge || '',
    session, reading || '');
}
