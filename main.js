// main.js — the shell (patch plan 4, Phases 3-5).
//
// Boot: open the store, fetch the content, compose Today, show it. Three tabs
// (Today, Texts, Path; Path since step 6), remembered in
// the URL's hash so a reload stays put. The day is read once per
// composition, and again when the app comes back to the foreground on a new
// day. The reference card and the report sheet are overlays over any
// screen (Phase 5).

import {createStore, KEYS} from './store.js';
import {loadTables} from './loader.js';
import {openCache} from './cache.js';
import {createDict} from './dict.js';
import {createLibrary} from './texts.js';
import {compose} from './core/today.js';
import {systemDay, isoOf} from './core/clock.js';
import {deviceSeed, learnerFrom, composeRng, startRun, startPractice,
        practiceItems, startTestMe, startFamily} from './runner.js';
import {todayModel, renderToday, placementOffered} from './views/today.js';
import {libraryModel, previewOf, renderTexts} from './views/texts.js';
import {h, clear, jpSpan} from './views/dom.js';
import {applyJp, setJp} from './jp.js';
import {settingsModel, renderSettings} from './views/settings.js';
import {bodyOfFile, autoTitle} from './core/import.js';
import {readerModel, renderReader, shownOfReader} from './views/reader.js';
import {wordsOf} from './core/lines.js';
import {sectionsOf, sectionOfLine} from './core/sections.js';
import {showSession} from './views/session.js';
import {refModel, renderRef, shownOfRef} from './views/refcard.js';
import {renderReport} from './views/report.js';
import {markKnown, forgot, markInReader, undoMark, canKnowOff, knowOff, unknowOff,
        undoOff} from './actions.js';
import {pathModel, renderPath} from './views/path.js';
import {familyCards, familyPage, familyTap, renderFamily, renderDone, familiesOf, browseModel, renderBrowse,
        BROWSE_CHUNK} from './views/families.js';
// the check's confirm, named so it never shadows window.confirm (7B: Import
// progress called this one and broke)
import {questionModel, meaningModel, renderQuestion, renderMeaning, tilesPerPage, reviewModel,
        nothingFound, renderReview, renderNothing} from './views/check.js';
import {startCheck, resumeCheck, answer as answerCheck, result as checkResult} from './core/placement.js';
import {startPending, questionsPending, stageOf, toggle as toggleReview, toPage, resume as resumeReview, confirmReview,
        undoConfirm, placementHigh} from './core/review.js';
import {makeRng} from './core/rng.js';
import {search} from './core/search.js';
import {renderFind} from './views/find.js';
import {partsModel, renderParts, stepsView, stepsUrl} from './views/parts.js';
import {treeModel, renderTree} from './views/tree.js';
import {makeReport, addReport, unsent} from './reports.js';
import {createOverlays, createCardStack} from './overlay.js';
import {glyphKind, tileProgress} from './views/glyph.js';
import {needsWelcome, installContext, starterFocus, finishWelcome} from './firstrun.js';
import {renderWelcome, renderOffer} from './views/welcome.js';
import {BUILD} from './build.js';
import {watchWorker, installOffer, exportReminder, askPersist} from './pwa.js';
import {feedbackDoc, deviceOf, mailtoUrl, toSend, markSent, undoSent,
        SUBJECT} from './feedback.js';
import {renderFeedback} from './views/feedback.js';
import {renderAbout} from './views/about.js';

const $ = id => document.getElementById(id);
// Steps (Pavers in brief 7.8 decided 2; Steps since 7.12) is a tab with two
// screens of its own, Browse families (#steps) and Meaning parts (#steps/meaning)
const TABS = ['today', 'texts', 'path', 'steps'];
const SCREENS = ['today', 'texts', 'path', 'reader', 'family', 'check', 'parts', 'done', 'browse', 'tree',
                 'session', 'welcome', 'about', 'settings'];

const app = {
  store: null, content: null, version: null, today: null,
  learner: null, composed: null, run: null,
  dict: null, cache: null, loadedMs: null, library: null,
  reader: null,             // {id, lines, selected}: the text being read
  family: null,             // {key, mode}: the family page open (patch plan 7.5)
  tree: null,               // {trail, expanded}: the tree open (patch plan 7.7)
  browse: {sort: 'text', shown: 0},  // Browse families' sort and rows drawn (7.7)
  steps: 'families',        // the Steps tab's side: 'families' | 'meaning' (7.8)
  fromTab: 'path',          // the tab a family page or a tree was opened from (7.8)
  check: null,              // {check, rng, meaning, back} or {review, perPage}: the placement check on
  pathQuery: '',            // Find a character's box, kept while the app is open
  firstRun: false,          // first run is on (patch plan 7B)
  updateReady: false,       // a new build is waiting (7B Phase 2)
  applyUpdate: null,        // Reload: pwa.js's watchWorker()
  installEvent: null,       // the browser's deferred Install (Android)
  storage: '',              // 'indexedDB' or 'localStorage': the device line
  about: null,              // content/about.json, once fetched (7B Phase 3)
};

const offKnownSet = () => new Set(app.store.load(KEYS.offKnown, []));
// a glyph's kind, for its tile (views/glyph.js; patch plan 7.5, Phase 3)
const kindOf = form => glyphKind(app.content, form);
// a tile's state, for its border (every tile but a question's: Mark, after
// patch plan 7.7): progressFrom(states)(form)
const progressFrom = states => form => tileProgress(app.content, states, form);


function dateLabel() {
  return new Date().toLocaleDateString('en-GB', {weekday: 'short', day: 'numeric', month: 'short'});
}

function showToday() {
  app.today = systemDay();
  app.learner = learnerFrom(app.store, app.library.learnerTexts());
  // the same composition the session will run (runner.js), so Today's counts
  // are the session's
  app.composed = compose(app.content, app.learner, app.today,
                         composeRng(deviceSeed(app.store), app.today));
  const focus = app.library.focus();
  const cov = focus && app.library.coverageOf(focus, app.learner.states);
  const reading = cov && {id: focus.id, title: focus.title, pct: cov.pct, toLearn: cov.toLearn};
  renderToday($('today'), todayModel(app.content, app.learner.states, app.composed.summary, reading), {
    onRead: id => showReader(id),
    date: dateLabel(),
    version: app.version,
    loadedMs: app.loadedMs,
    trouble: app.store.trouble(),
    onStart: () => startSession(),
    onKeepGoing: () => startSession({keepGoing: true}),
    onPractice: () => startSession({practice: true}),
    practiceCount: practiceItems(app.store, app.today).length,
    onExport: () => exportProgress(),
    onImport: () => $('importFile').click(),
    onRef: openRef,
    kindOf,
    progressOf: progressFrom(app.learner.states),
    unsent: unsent(app.store),
    build: BUILD,
    update: app.updateReady,
    onUpdate: () => app.applyUpdate && app.applyUpdate(),
    install: installOffer(installContext(navigator, globalThis.matchMedia), !!app.installEvent),
    onInstall: async () => {
      const e = app.installEvent;
      app.installEvent = null;
      if (!e) return;
      e.prompt();
      try { await e.userChoice; } catch { /* dismissed */ }
      showToday();
    },
    exportDue: exportReminder(app.store.load(KEYS.meta, {}), app.learner.states, app.today),
    onFeedback: openFeedback,
    onAbout: () => showAbout(),
    onSettings: () => showSettings(),
    // the placement check's card (brief 7.8 decided 3), or, while a finished
    // check waits for its review, the card that reopens it (7.13 decided 10)
    placementOffer: placementOffered({placement: app.store.load(KEYS.placement, null),
                                      meta: app.store.load(KEYS.meta, {}), firstRun: app.firstRun,
                                      pending: app.store.load(KEYS.placementPending, null)}),
    // 'questions' or 'review' (Mark, after 7.13: a check left midway resumes)
    placementPending: !app.firstRun && stageOf(app.store.load(KEYS.placementPending, null)),
    onResume: () => resumePlacement(),
    onStartOver: () => startPlacement(),
    // once, if more than 30% of placed first reviews missed (7.13 decided 12)
    placementHigh: placementHigh(app.store.load(KEYS.placement, null), app.learner.states),
    onPlacementNoted: () => {
      app.store.save(KEYS.placement, {...app.store.load(KEYS.placement, null), noted: true});
      showToday();
    },
    onCheck: () => startPlacement(),
    onNotNow: () => {
      app.store.save(KEYS.meta, {...app.store.load(KEYS.meta, {}), placementOffer: 'dismissed'});
      showToday();
    },
  });
}

// ---- installed, offline, updated (patch plan 7B, Phase 2; pwa.js)
//
// A waiting build shows "Update ready" on Today, or as a toast elsewhere;
// never during a session, the check or first run, which Today follows
// anyway. Nothing reloads unless the learner taps Reload.
function updateReady() {
  app.updateReady = true;
  if (app.run || app.check || app.firstRun) return;
  if (!$('today').hidden) return showToday();
  toast('Update ready.', {action: 'Reload', onAction: () => app.applyUpdate()});
}

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();               // offered on Today instead, as Install
  app.installEvent = e;
  if (app.store && !app.firstRun && !$('today').hidden) showToday();
});
window.addEventListener('appinstalled', () => {
  app.installEvent = null;
  if (app.store) askPersist(app.store).catch(() => {});
});

// ---- overlays: the reference card and the report sheet (overlay.js)
//
// Each is an entry in the history, so the phone's back gesture closes it;
// one opened with the keyboard up waits for the keyboard to go (7.5, bug 2).

// A card opened from a card stacks, and "Back to 清" returns to it.
const cards = createCardStack();
const overlays = createOverlays({doc: document, history, win: window,
                                 ids: ['ref', 'report', 'feedback'],
                                 onHidden: id => { if (id === 'ref') cards.clear(); }});
const showOverlay = id => overlays.open(id);
const hideOverlay = (id, opts) => overlays.close(id, opts);
window.addEventListener('popstate', () => {
  if (overlays.onPop()) return;
  if (app.firstRun) return;     // first run keeps no history of its own
  // the Reader is an entry in the history, so the phone's back gesture
  // leaves it (never during a session, which has its own ✕)
  if (!app.run) route();
});

// The screen the URL names: #read/<text id> is the Reader,
// #path/family/<key> a family's page (an old #path/block/<i> is Path),
// #steps/meaning the Meaning parts side of Steps (parts.js stepsView: the
// old #pavers, #pavers/meaning, #path/families and #path/parts land on
// Steps, which replaces them with its own), else a tab.
function route() {
  const hash = location.hash.slice(1);
  if (hash.startsWith('read/')) showReader(decodeURIComponent(hash.slice(5)), {push: false});
  else if (hash.startsWith('path/family/')) showFamily(decodeURIComponent(hash.slice(12)), {push: false});
  else if (hash.startsWith('char/')) showTree(decodeURIComponent(hash.slice(5)), {push: false});
  else if (/^path\/block\/\d+$/.test(hash)) showTab('path');
  else if (hash === 'path/check/review') openReview({push: false});
  else if (hash === 'path/check') resumePlacement({push: false});
  else if (stepsView(hash)) showSteps(stepsView(hash));
  else if (hash === 'path/done') showDone({push: false});
  else if (hash === 'about') showAbout({push: false});
  else if (hash === 'settings') showSettings({push: false});
  else showTab(hash);
}

// A learner's states changed outside a session: every screen that shows
// them is drawn again.
function statesChanged() {
  if (!app.run) showToday();
  if (app.reader) drawReader();
  if (app.family) drawFamily();
  if (app.tree) drawTree();
  if (!$('path').hidden) showPath();
  if (!$('parts').hidden) drawParts();
  if (!$('done').hidden) drawDone();
  if (!$('browse').hidden) drawBrowse();
}

// The learner whose states an action changes: the session's while one is
// on, so the session sees the change at once.
const liveLearner = () => (app.run ? app.run.learner
                                    : learnerFrom(app.store, app.library.learnerTexts()));

const refWordsAsked = new Set();
// the reading a card was opened for, by form (a search row's; 7A 6b)
const refFocus = new Map();
function openRef(form, focus = null) {
  showOverlay('ref');
  cards.open(form);
  if (focus) refFocus.set(form, focus); else refFocus.delete(form);
  drawRef();
}
function drawRef() {
  const sheet = $('ref').querySelector('.sheet');
  const form = cards.top;
  const learner = liveLearner();
  const m = refModel(app.content, learner.states, form, app.library.heldLines(),
                     {wordOf: app.dict.wordOf, offKnown: offKnownSet(),
                      focus: refFocus.get(form) || null});
  // an off-path card's words come from the dictionary's files: fetch them
  // once, then draw again
  const off = m.kind === 'offpath' && app.content.offchar(form);
  if (off && off.words.length && !refWordsAsked.has(form)) {
    refWordsAsked.add(form);
    app.dict.need(off.words).then(() => {
      if (overlays.isOpen('ref') && cards.top === form) drawRef();
    }, e => console.warn('readpath: words', e));
  }
  const act = fn => () => {
    if (app.run && app.run.practice) return;       // practice changes nothing
    fn(learner, m.main, systemDay());
    app.store.save(KEYS.states, learner.states);
    statesChanged();                   // the jyutping over it, Path, the family page
    drawRef();
  };
  const prev = cards.prev;
  renderRef(sheet, {...m, canMarkKnown: m.canMarkKnown && !(app.run && app.run.practice),
                    canForget: m.canForget && !(app.run && app.run.practice)}, {
    onClose: () => hideOverlay('ref'),
    onBack: prev ? () => { cards.back(); drawRef(); sheet.scrollTop = 0; } : null,
    backTo: prev,
    closeLabel: app.run ? 'Back to the session' : 'Close',
    onRef: openRef,
    kindOf,
    progressOf: progressFrom(learner.states),
    onMarkKnown: act(markKnown),
    onForgot: act(forgot),
    // Test me: a part's own test, now; not from inside a session
    onTestMe: app.run ? null : id => { hideOverlay('ref'); testMe(id); },
    // an off-path character: a list, never a state (patch plan 6)
    onKnowOff: app.run && app.run.practice ? null : on => {
      const done = (on ? knowOff : unknowOff)(app.store.load(KEYS.offKnown, []), form);
      app.store.save(KEYS.offKnown, done.list);
      statesChanged();
      drawRef();
      toast(on ? `${form}: you know this. Its jyutping goes from the Reader.`
               : `${form}: its jyutping shows again.`,
        {action: 'Undo', onAction: () => {
          app.store.save(KEYS.offKnown, undoOff(app.store.load(KEYS.offKnown, []), done));
          statesChanged();
          if (overlays.isOpen('ref')) drawRef();
        }});
    },
    onReport: () => openReport(shownOfRef(m), 'reference'),
    onTree: app.run ? null : f => showTree(f),
    // In your texts opens the Reader at that line's section; not mid-session
    onOpenText: app.run ? null : (id, line) => {
      const lines = (app.library.heldLines().find(t => t.id === id) || {}).lines;
      if (lines) app.library.update(id, {section: sectionOfLine(sectionsOf(lines), line)});
      // the card's history entry becomes the Reader's: a history.back() to
      // close the card would land after the Reader's push and leave it
      hideOverlay('ref', {fromPop: true});
      showReader(id, {replace: true});
    },
  });
}

function openReport(shown, where) {
  const sheet = showOverlay('report');
  renderReport(sheet, {
    onCancel: () => hideOverlay('report'),
    onSave: (kind, note) => {
      addReport(app.store, makeReport(shown, {kind, note, where, build: app.version,
                                              day: systemDay(), at: Date.now()}));
      hideOverlay('report');
      toast('Report saved. It goes out with your next Export.');
      if (!app.run) showToday();
    },
  });
}

// ---- Send feedback, and About and licences (patch plan 7B, Phase 3)
//
// The file is made inside Send's tap, before share(), which needs the tap
// (transient activation). A share that resolves marks the reports sent; a
// cancelled one marks nothing. Without file sharing, an email opens, and
// the reports are marked sent with an Undo, since nothing says it went.

function openFeedback() {
  const sheet = showOverlay('feedback');
  const probe = new File([''], 'readpath-feedback.txt', {type: 'text/plain'});
  const canShare = !!(navigator.canShare && navigator.canShare({files: [probe]}));
  renderFeedback(sheet, {reports: toSend(app.store).length, canShare}, {
    onCancel: () => hideOverlay('feedback'),
    onSend(note, include) {
      const reps = include ? toSend(app.store) : [];
      const meta = app.store.load(KEYS.meta, {});
      const ctx = installContext(navigator, globalThis.matchMedia);
      const day = systemDay();
      const {name, text, doc} = feedbackDoc({
        note, reports: reps, build: BUILD, content: app.version, day, at: Date.now(),
        device: deviceOf({nav: navigator, win: window, standalone: ctx.standalone,
                          persisted: meta.persisted, storage: app.storage})});
      const ids = reps.map(r => r.id);
      const done = (how, undoable) => {
        const before = markSent(app.store, ids, isoOf(day));
        hideOverlay('feedback');
        if (!app.run) showToday();
        const what = ids.length ? ` with ${ids.length} ${ids.length === 1 ? 'report' : 'reports'}` : '';
        toast(`${how}${what}. Thank you.`, undoable ? {action: 'Undo', onAction: () => {
          undoSent(app.store, before);
          if (!app.run) showToday();
        }} : {});
      };
      // the sheet closes first (its history entry popped), and the email
      // opens once that back() has landed: a mailto: navigation started
      // before it let the back() go past the page in the browser pane
      const email = () => {
        const url = mailtoUrl(doc);
        done('Email opened', true);
        setTimeout(() => {
          const a = Object.assign(document.createElement('a'), {href: url});
          document.body.append(a);
          a.click();
          a.remove();
        }, 250);
      };
      const file = new File([text], name, {type: 'text/plain'});
      if (canShare && navigator.canShare({files: [file]})) {
        navigator.share({files: [file], title: SUBJECT}).then(() => done('Sent', false), e => {
          if (e && e.name === 'AbortError') return;          // cancelled: nothing sent
          console.warn('readpath: share', e);
          email();
        });
      } else {
        email();
      }
    },
  });
}

// ---- Settings (brief 7.12): reached from Your progress, Back as About's
function showSettings({push = true} = {}) {
  if (push) history.pushState({settings: true}, '', '#settings');
  app.reader = null;
  app.family = null;
  showScreen('settings');
  markTab('today');
  const draw = () => renderSettings($('settings'), settingsModel(app.store.load(KEYS.settings, {})), {
    onBack: () => (history.state && history.state.settings ? history.back() : showTab('today')),
    onJp: mode => { setJp(document.documentElement, app.store, mode); draw(); },
  });
  draw();
  window.scrollTo(0, 0);
}

async function showAbout({push = true} = {}) {
  if (push) history.pushState({about: true}, '', '#about');
  app.reader = null;
  app.family = null;
  showScreen('about');
  markTab('today');
  const draw = () => renderAbout($('about'), {about: app.about, build: BUILD, version: app.version}, {
    onBack: () => (history.state && history.state.about ? history.back() : showTab('today')),
  });
  draw();
  window.scrollTo(0, 0);
  if (app.about && !app.about.error) return;
  try {
    const r = await fetch('content/about.json');
    if (!r.ok) throw new Error(String(r.status));
    app.about = await r.json();
  } catch (e) {
    app.about = {error: e.message};
  }
  if (!$('about').hidden) draw();
}

// The one-time tip that a character opens its reference card: true the
// first time it's asked for on this device, then never again.
function tipOnce() {
  const meta = app.store.load(KEYS.meta, {});
  if (meta.refTip) return false;
  meta.refTip = true;
  app.store.save(KEYS.meta, meta);
  return true;
}

// A short message at the foot of the screen; with an action (Undo), it
// stays a little longer and the action closes it.
let toastTimer = null;
function toast(text, {action = null, onAction = null} = {}) {
  const el = $('toast');
  clear(el).append(h('span', {}, text));
  if (action) {
    el.append(h('button', {type: 'button', class: 'toast-action',
                           onclick: () => { el.hidden = true; onAction(); }}, action));
  }
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, action ? 6000 : 3000);
}

// ---- the Texts screen (patch plan 5, Phase 3)

const freshDraft = () => ({raw: '', title: '', titleAuto: true});
const textsUi = {pasting: false, draft: freshDraft(), renaming: null, batch: null};
let warming = false;

function showTexts() {
  const lib = app.library;
  const states = app.store.load(KEYS.states, {});
  const model = libraryModel(lib.list(), t => lib.coverageOf(t, states));
  renderTexts($('texts'), model, textsUi, textsActions);
  // a text's coverage needs its tokens: work them out, then draw again
  // (not over the paste box while it's being typed in)
  if (!warming && model.rows.some(r => r.pct === null)) {
    warming = true;
    lib.warmAll().then(() => {
      warming = false;
      if (!$('texts').hidden && !$('texts').contains(document.activeElement)) showTexts();
    }, e => { warming = false; console.warn('readpath: texts', e); });
  }
}

// Anything that moves the focus or the library changes Today too.
function libraryChanged() {
  showTexts();
  if (!app.run) showToday();
}

// ---- the Reader (patch plan 5, Phase 4)

async function showReader(id, {push = true, replace = false} = {}) {
  const t = app.library.find(id);
  if (!t) return showTab('texts');
  const url = `#read/${encodeURIComponent(id)}`;
  if (replace) history.replaceState({reader: id}, '', url);
  else if (push) history.pushState({reader: id}, '', url);
  app.reader = {id, lines: null, selected: null};
  app.family = null;
  showScreen('reader');
  markTab('texts');
  clear($('reader')).append(h('p', {class: 'loading'}, 'Opening…'));
  window.scrollTo(0, 0);
  try {
    const {lines} = await app.library.linesFor(t);
    await app.dict.need(wordsOf(t.body, app.content.lexicon));    // the meanings
    if (!app.reader || app.reader.id !== id) return;             // left meanwhile
    app.reader.lines = lines;
    drawReader();
  } catch (e) {
    clear($('reader')).append(h('p', {class: 'loading'}, `Couldn’t open this text: ${e.message}.`));
  }
}

function readerSettings() {
  return app.store.load(KEYS.settings, {}).reader || {};
}

function drawReader() {
  const r = app.reader;
  const t = r && app.library.find(r.id);
  if (!t || !r.lines) return;
  const m = readerModel(app.content, app.store.load(KEYS.states, {}), t, r.lines, {
    section: t.section, asWritten: t.asWritten, showAll: readerSettings().showAll,
    mode: readerSettings().mode || 'read',
    selected: r.selected, wordOf: app.dict.wordOf, charOf: app.content.char,
    offKnown: new Set(app.store.load(KEYS.offKnown, []))});
  const saveReader = fields => {
    const settings = app.store.load(KEYS.settings, {});
    app.store.save(KEYS.settings, {...settings, reader: {...(settings.reader || {}), ...fields}});
  };
  renderReader($('reader'), m, {
    onBack: () => (history.state && history.state.reader ? history.back() : showTab('texts')),
    async onFocus() {
      app.library.setFocus(t.id);
      libraryChanged();
      drawReader();
      toast(`“${t.title}” is the focus. Today teaches it first.`);
    },
    onShowAll(v) { saveReader({showAll: v}); drawReader(); },
    onMode(mode) { saveReader({mode}); r.selected = null; drawReader(); },
    // Mark mode: through transition() alone (actions.js), with an Undo that
    // puts back exactly the state there was
    onMark(c) {
      if (!c.id) {
        return toast(canKnowOff(app.content, c.char)
          ? `${c.char} isn’t on the path: open its card to say you know it.`
          : `${c.char} isn’t on the path, so it can’t be marked.`);
      }
      const learner = learnerFrom(app.store, app.library.learnerTexts());
      const done = markInReader(app.content, learner, c.id, systemDay());
      if (!done) return;
      app.store.save(KEYS.states, learner.states);
      drawReader();
      showToday();
      const jp = app.content.item(c.id).jp;
      toast([`${c.char} `, jpSpan(jp), done.did === 'known' ? ' marked known.' : ': back to learning.'],
        {action: 'Undo', onAction: () => {
          const now = learnerFrom(app.store, app.library.learnerTexts());
          undoMark(now, done);
          app.store.save(KEYS.states, now.states);
          drawReader();
          showToday();
        }});
    },
    onAsWritten(v) { app.library.update(t.id, {asWritten: v}); drawReader(); },
    onSection(i) {
      app.library.update(t.id, {section: i});
      r.selected = null;
      drawReader();
      window.scrollTo(0, 0);
    },
    onWord(key) { r.selected = key; drawReader(); },
    onRef: openRef,
    kindOf,
    progressOf: progressFrom(liveLearner().states),
    onReport: word => openReport(shownOfReader(m, word), 'reader'),
  });
}

const textsActions = {
  onFeedback: () => openFeedback(),
  onOpen: id => showReader(id),
  preview: raw => previewOf(raw, app.library.list(), app.content),
  onPaste() { Object.assign(textsUi, {pasting: true, draft: freshDraft(), batch: null}); showTexts(); },
  onDraft(raw, title, titleAuto) { textsUi.draft = {raw, title, titleAuto}; },
  onCancelPaste() { Object.assign(textsUi, {pasting: false, draft: freshDraft()}); showTexts(); },
  async onAdd(raw, title) {
    const r = app.library.add(bodyOfFile(raw).body,
                              {title: textsUi.draft.titleAuto ? '' : title, day: systemDay()});
    if (r.problem) return toast(r.problem.message);
    Object.assign(textsUi, {pasting: false, draft: freshDraft()});
    await app.store.flush();
    libraryChanged();
    toast(`Added “${r.text.title}”.`);
  },
  async onFiles(files) {
    const read = await Promise.all(files.map(async f => {
      try { return {name: f.name, raw: await f.text()}; } catch (e) { return {name: f.name, raw: null}; }
    }));
    if (read.length === 1 && read[0].raw !== null) {
      // one file: into the paste box, to be looked at before it's added
      const {body} = bodyOfFile(read[0].raw);
      const title = autoTitle(body) || read[0].name.replace(/\.[^.]*$/, '');
      Object.assign(textsUi, {pasting: true, batch: null,
                              draft: {raw: body, title, titleAuto: !!autoTitle(body)}});
      return showTexts();
    }
    textsUi.pasting = false;
    textsUi.batch = {status: '', log: [], done: false};
    const out = await app.library.importFiles(read, {day: systemDay(), onStep: (i, n, name) => {
      textsUi.batch.status = `Importing ${i} of ${n} — ${name}`;
      showTexts();
    }});
    textsUi.batch = {done: true, log: out.log,
                     status: `${out.added} added, ${out.skipped} skipped, ${out.failed} failed.`};
    libraryChanged();
  },
  onCloseBatch() { textsUi.batch = null; showTexts(); },
  async onSample() {
    try {
      const r = await app.library.addSample(fetch, systemDay());
      if (r.problem) toast(r.problem.message);
      await app.store.flush();
      libraryChanged();
    } catch (e) { toast(e.message); }
  },
  async onFocus(id) {
    app.library.setFocus(id);
    try { await app.library.linesFor(app.library.focus()); } catch (e) { console.warn(e); }
    libraryChanged();
    toast(`“${app.library.focus().title}” is the focus. Today teaches it first.`);
  },
  onRename(id) { textsUi.renaming = id; showTexts(); },
  onCancelRename() { textsUi.renaming = null; showTexts(); },
  onRenamed(id, title) {
    app.library.rename(id, title);
    textsUi.renaming = null;
    libraryChanged();
  },
  onDelete(id) {
    const gone = app.library.remove(id);
    if (!gone) return;
    libraryChanged();
    toast(`Deleted “${gone.text.title}”.`, {action: 'Undo', onAction: () => {
      app.library.restore(gone);
      libraryChanged();
    }});
  },
};

// A session: the tabs give way to the task cards until it ends or is left.
// Every answer is saved as it is given, so leaving loses nothing. Keep going
// and Practise again (after All done) run on the same screen.
function startSession({keepGoing = false, practice = false} = {}) {
  app.today = systemDay();
  const run = practice ? startPractice(app.content, app.store, app.today,
                                       {texts: app.library.learnerTexts()})
                       : startRun(app.content, app.store, app.today,
                                  {keepGoing, texts: app.library.learnerTexts()});
  app.run = run;
  showScreen('session');
  showSession($('session'), app.content, run, {
    onExit: () => { app.run = null; showToday(); showTab('today'); },
    onRef: openRef,
    onReport: shown => openReport(shown, 'card'),
    tipOnce,
    lineOf: s => app.library.lineAt(s),
  });
}

// ---- the Path tab (patch plan 6, Phase 3; families since 7.5)

function showPath() {
  const nextUp = app.composed && app.composed.summary.next_up;
  renderPath($('path'), pathModel(app.content, app.store.load(KEYS.states, {}), nextUp), {
    onTree: form => showTree(form),
    kindOf,
    // a check left midway is finished from here too, not started again
    onCheck: () => resumePlacement(),
    placement: app.store.load(KEYS.placement, null),
    pending: !!app.store.load(KEYS.placementPending, null),
    query: app.pathQuery,
    onQuery(q, host) {
      app.pathQuery = q;
      renderFind(host, q, search(app.content, q, {states: app.store.load(KEYS.states, {}),
                                                   offKnown: offKnownSet()}), form => showTree(form), kindOf,
                 progressFrom(app.store.load(KEYS.states, {})));
    },
    onDone: () => showDone(),
    onFeedback: openFeedback,
  });
}

// ---- the Steps tab (Pavers, brief 7.8 decided 2; Steps since 7.12): a
// switch between Browse families (7.7, Phase 4: every family by share of
// text; a row opens the family's page) and Meaning parts. Each side is the
// tab's own URL, so reload and Back land on it; the switch replaces the
// entry, as a tab does, and so does an old name for it.

function showSteps(view = app.steps) {
  app.steps = view === 'meaning' ? 'meaning' : 'families';
  app.fromTab = 'steps';
  app.reader = null;
  app.family = null;
  app.tree = null;
  app.check = null;
  const url = stepsUrl(app.steps);
  if (location.hash !== url) history.replaceState(null, '', url);
  showScreen(app.steps === 'meaning' ? 'parts' : 'browse');
  markTab('steps');
  if (app.steps === 'meaning') drawParts(); else drawBrowse();
  window.scrollTo(0, 0);
}

function drawBrowse() {
  const b = app.browse;
  renderBrowse($('browse'), browseModel(app.content, app.store.load(KEYS.states, {}), b.sort), {
    onSwitch: view => showSteps(view),
    onSort: key => { b.sort = key; b.shown = 0; drawBrowse(); },
    onFamily: key => showFamily(key),
    onMore: () => { b.shown = (b.shown || BROWSE_CHUNK) + BROWSE_CHUNK; drawBrowse(); },
    shown: b.shown,
    kindOf,
    progressOf: progressFrom(app.store.load(KEYS.states, {})),
  });
}

// Done (7.6 3b): the cards whose every member is known, a screen of their own
function showDone({push = true} = {}) {
  if (push) history.pushState({done: true}, '', '#path/done');
  app.reader = null;
  app.family = null;
  app.tree = null;
  showScreen('done');
  markTab('path');
  drawDone();
  window.scrollTo(0, 0);
}

function drawDone() {
  renderDone($('done'), familyCards(app.content, app.store.load(KEYS.states, {})).done, {
    onBack: () => (history.state && history.state.done ? history.back() : showTab('path')),
    onFamily: key => showFamily(key),
    kindOf,
    progressOf: progressFrom(app.store.load(KEYS.states, {})),
  });
}

// ---- the Meaning parts list (patch plan 6, Phase 5; Pavers since 7.8, now Steps) and Test me

function drawParts() {
  renderParts($('parts'), partsModel(app.content, app.store.load(KEYS.states, {})), {
    onSwitch: view => showSteps(view),
    onRef: form => showTree(form),       // on Path's screens a tile opens its tree (7.7)
    kindOf,
    onTestMe: id => testMe(id),
  });
}

// One task through the session screen; when it's answered, back to the
// screen the URL names, with a word if the part's characters just unlocked.
function testMe(id) {
  if (app.run) return;
  app.today = systemDay();
  const before = app.store.load(KEYS.states, {})[id] || null;
  const run = startTestMe(app.content, app.store, app.today, id);
  app.run = run;
  showScreen('session');
  showSession($('session'), app.content, run, {
    onExit: () => {
      app.run = null;
      route();
      statesChanged();
      const s = app.store.load(KEYS.states, {})[id];
      const it = app.content.item(id);
      if (s && s.unlocked != null && !(before && before.unlocked != null)) {
        toast(`${it.part} is unlocked: its characters can come up in Today.`);
      }
    },
    onRef: openRef,
    onReport: shown => openReport(shown, 'card'),
    tipOnce,
    lineOf: l => app.library.lineAt(l),
  });
}

// Study this family (patch plan 7.5, Phase 4b): a session of that family
// alone, through the session screen; when it ends or is left, back to the
// family's page (the URL still names it), drawn afresh.
function studyFamily(key) {
  if (app.run) return;
  const card = familiesOf(app.content).byKey.get(key);
  if (!card) return;
  app.today = systemDay();
  const run = startFamily(app.content, app.store, app.today, card,
                          {texts: app.library.learnerTexts()});
  app.run = run;
  showScreen('session');
  showSession($('session'), app.content, run, {
    onExit: () => {
      app.run = null;
      route();
      statesChanged();
      window.scrollTo(0, 0);
    },
    onRef: openRef,
    onReport: shown => openReport(shown, 'card'),
    tipOnce,
    lineOf: l => app.library.lineAt(l),
  });
}

// ---- the placement check (patch plan 6, Phase 4)
//
// An entry in the history, like the Reader, so back (or ✕) leaves it; leaving
// before the end records nothing. Its rng is seeded from the device, the day
// and the number of runs, so a rerun on the same day asks different
// characters.

// A new check replaces any pending one (7.13 decided 10).
function startPlacement({push = true} = {}) {
  app.store.forget(KEYS.placementPending);
  openCheck(rng => startCheck(app.content.placementPool(), rng), 0, {push});
}

// Go on with a pending check (Mark, after 7.13): its questions, rebuilt from
// the answers so far, or its review pages; a new check if there is none.
function resumePlacement({push = true} = {}) {
  const pending = app.store.load(KEYS.placementPending, null);
  if (!pending) return startPlacement({push});
  if (stageOf(pending) === 'review') return openReview({push});
  openCheck(rng => resumeCheck(app.content.placementPool(), pending.asked, rng),
            pending.asked.length, {push});
}

function openCheck(make, salt, {push}) {
  // first run goes on from the check, not back, and keeps no history
  if (app.firstRun) push = null;
  if (push) history.pushState({check: true}, '', '#path/check');
  else if (push === false) history.replaceState({check: true}, '', '#path/check');
  const last = app.store.load(KEYS.placement, null);
  const rng = makeRng((deviceSeed(app.store) * 131 + systemDay() * 7 + ((last && last.runs) || 0)
                       + salt * 13) >>> 0);
  app.reader = null;
  app.family = null;
  app.check = {check: make(rng), rng, meaning: null, back: []};
  showScreen('check');
  markTab('path');
  drawCheck();
}

function leaveCheck() {
  app.check = null;
  if (app.firstRun) return finishFirstRun();
  // Today's cards follow the check: the resume card while a review is
  // pending, the offer gone once a check is recorded (7.13)
  showToday();
  if (history.state && history.state.check) history.back();
  else showTab('path');
}

function drawCheck() {
  const c = app.check;
  // ‹ Back (Mark, 7.13): each screen's check and step are kept before an
  // answer, and Back puts the last back. A check is never edited, so the
  // kept one is exactly the screen before.
  const keep = () => c.back.push({check: c.check, meaning: c.meaning});
  const nav = {onExit: leaveCheck, canBack: c.back.length > 0,
               onBack: () => { Object.assign(c, c.back.pop()); drawCheck(); }};
  // the answers so far are kept, so ✕ midway leaves a check to finish later
  // (Mark, after 7.13; it had recorded nothing)
  if (c.check.asked.length) {
    app.store.save(KEYS.placementPending,
                   questionsPending(c.check, systemDay(), app.store.load(KEYS.placement, null)));
  } else app.store.forget(KEYS.placementPending);
  if (c.meaning) {
    // the meaning step of a question whose reading was right (7.13 decided 5)
    renderMeaning($('check'), c.meaning, {
      ...nav,
      onAnswer(ok) {
        keep();
        c.meaning = null;
        c.check = answerCheck(c.check, {reading: true, meaning: ok}, c.rng);
        drawCheck();
      },
    });
    window.scrollTo(0, 0);
    return;
  }
  const m = questionModel(app.content, c.check, c.rng);
  if (m) {
    renderQuestion($('check'), m, {
      ...nav,
      onAnswer(ok) {
        keep();
        if (ok) c.meaning = meaningModel(app.content, c.check, c.rng);
        else c.check = answerCheck(c.check, {reading: false}, c.rng);
        drawCheck();
      },
    });
    window.scrollTo(0, 0);
    return;
  }
  finishQuestions();
}

// The questions are done: nothing is placed (brief 7.13 decided 7). The
// result becomes the pending record, which replaces any earlier one, and the
// review pages open. A check that found nothing to place says so and keeps
// its record, so Today stops offering the check.
function finishQuestions() {
  const today = systemDay();
  const states = app.store.load(KEYS.states, {});
  const last = app.store.load(KEYS.placement, null);
  const pending = startPending(checkResult(app.check.check), today, last);
  if (nothingFound(app.content, states, pending)) {
    app.store.forget(KEYS.placementPending);
    app.store.save(KEYS.placement, {day: today, n: pending.n, asked: pending.asked,
                                    right: pending.right.length, confirmed: false,
                                    runs: pending.runs, placed: 0});
    renderNothing($('check'), {asked: pending.asked, right: pending.right.length,
                               allKnown: pending.n > 0 || pending.right.length > 0}, {onDone: leaveCheck});
    window.scrollTo(0, 0);
    return;
  }
  app.store.save(KEYS.placementPending, pending);
  openReview({push: false});
}

// ---- the review pages (patch plan 7.13, Phase 4): an entry in the history
// like the check, so ✕ or back leaves them; leaving keeps the pending record
// (taps and page), and Today's card or #path/check/review reopens it, less
// whatever became known meanwhile.

function openReview({push = true} = {}) {
  const saved = app.store.load(KEYS.placementPending, null);
  if (!saved) return showTab('path');
  if (push) history.pushState({check: true}, '', '#path/check/review');
  else history.replaceState({check: true}, '', '#path/check/review');
  const perPage = tilesPerPage(window.innerWidth, window.innerHeight);
  const pending = resumeReview(app.content, app.store.load(KEYS.states, {}), saved, perPage);
  app.store.save(KEYS.placementPending, pending);
  app.reader = null;
  app.family = null;
  app.check = {review: true, perPage};
  showScreen('check');
  markTab('path');
  drawReview();
}

function drawReview() {
  const {perPage} = app.check;
  const states = app.store.load(KEYS.states, {});
  const pending = app.store.load(KEYS.placementPending, null);
  const save = p => { app.store.save(KEYS.placementPending, p); drawReview(); };
  const turn = by => { save(toPage(pending, pending.page + by)); window.scrollTo(0, 0); };
  renderReview($('check'), reviewModel(app.content, states, pending, perPage), {
    onExit: leaveCheck,
    onToggle: id => save(toggleReview(pending, id)),
    onBack: () => turn(-1),
    onNext: () => turn(1),
    onConfirm() {
      const today = systemDay();
      const last = app.store.load(KEYS.placement, null);
      const r = confirmReview(app.content, states, pending, today, perPage);
      app.store.save(KEYS.states, r.states);
      app.store.save(KEYS.placement, r.record);
      app.store.forget(KEYS.placementPending);
      leaveCheck();
      statesChanged();
      // Undo puts back everything Confirm placed, the record before it, and
      // the review pages with their taps (Phase 0 Q7): Today offers them again
      toast(`${r.placed.toLocaleString('en-GB')} ${r.placed === 1 ? 'character' : 'characters'} marked known.`, {action: 'Undo', onAction: () => {
        app.store.save(KEYS.states, undoConfirm(app.store.load(KEYS.states, {}), r.before));
        if (last) app.store.save(KEYS.placement, last); else app.store.forget(KEYS.placement);
        app.store.save(KEYS.placementPending, pending);
        statesChanged();
        toast('Undone. Finish checking your placement from Today when you’re ready.');
      }});
    },
  });
}

// A family's page is an entry in the history, as the Reader is, so back
// leaves it (patch plan 7.5; it took over from step 6's block grid).
function showFamily(key, {push = true} = {}) {
  const url = `#path/family/${encodeURIComponent(key)}`;
  if (push) history.pushState({family: key}, '', url);
  app.reader = null;
  app.tree = null;
  // every family page opens in Read (brief 7.9, Mark): Mark is a tap away
  app.family = {key, mode: 'read'};
  if (!familyPage(app.content, {}, key)) return showTab(app.fromTab);
  showScreen('family');
  markTab(app.fromTab);
  drawFamily();
  window.scrollTo(0, 0);
}

function drawFamily() {
  const f = app.family;
  const m = familyPage(app.content, app.store.load(KEYS.states, {}), f.key, f.mode);
  renderFamily($('family'), m, {
    onBack: () => (history.state && history.state.family != null ? history.back() : showTab(app.fromTab)),
    onMode(mode) { f.mode = mode; drawFamily(); },
    onRef: form => showTree(form),       // on Path's screens a tile opens its tree (7.7)
    kindOf,
    onTestMe: id => testMe(id),
    onStudy: key => studyFamily(key),
    // one character a tap, through transition() (actions.js), with an Undo
    // that puts back exactly the state there was (brief 6, decided 9)
    onTap(c) {
      const learner = learnerFrom(app.store, app.library.learnerTexts());
      const r = familyTap(app.content, learner, c, f.mode, systemDay());
      if (!r) return;
      if (r.open) return showTree(r.open);
      const done = r.mark;
      app.store.save(KEYS.states, learner.states);
      statesChanged();
      const jp = app.content.item(done.id).jp;
      toast([`${c.form} `, jpSpan(jp), done.did === 'known' ? ' marked known.' : ': back to learning.'],
        {action: 'Undo', onAction: () => {
          const now = learnerFrom(app.store, app.library.learnerTexts());
          undoMark(now, done);
          app.store.save(KEYS.states, now.states);
          statesChanged();
        }});
    },
  });
}

// ---- a character's tree (patch plan 7.7, Phase 3)
//
// `#char/<form>`, an entry in the history like a family's page. Re-centring
// on a tile pushes another, so back retraces the trail; the breadcrumb goes
// back as many steps as it names.

function showTree(form, {push = true} = {}) {
  if (!form) return showTab(app.fromTab);
  // the trail lives in each history entry, so back and the breadcrumb
  // always name the entries there are
  const saved = !push && history.state && history.state.tree === form && history.state.trail;
  const trail = app.tree ? app.tree.trail : [];
  const next = saved || [...trail, form];
  // from a card's "Its tree", the tree takes the card's history entry, so
  // back from the tree lands where the card was opened
  const fromCard = overlays.isOpen('ref');
  if (fromCard) hideOverlay('ref', {fromPop: true});
  if (push) {
    history[fromCard ? 'replaceState' : 'pushState']({tree: form, trail: next}, '',
                                                     `#char/${encodeURIComponent(form)}`);
  }
  app.reader = null;
  app.family = null;
  app.tree = {trail: next, expanded: {}};
  showScreen('tree');
  markTab(app.fromTab);
  drawTree();
  window.scrollTo(0, 0);
}

function drawTree() {
  const t = app.tree;
  const form = t.trail[t.trail.length - 1];
  const m = treeModel(app.content, app.store.load(KEYS.states, {}), form,
                      {trail: t.trail, expanded: t.expanded});
  renderTree($('tree'), m, {
    onBack: () => (history.state && history.state.tree != null ? history.back() : showTab(app.fromTab)),
    onCrumb: i => history.go(i - (t.trail.length - 1)),
    onTree: f => showTree(f),
    onRef: openRef,
    onMore: L => { t.expanded[L] = (t.expanded[L] || 0) + 1; drawTree(); },
    onStudy: key => studyFamily(key),
    kindOf,
  });
}

async function exportProgress() {
  const meta = app.store.load(KEYS.meta, {});
  meta.exported = app.today;
  meta.exportedAt = Date.now();        // reports filed after this are unsent
  app.store.save(KEYS.meta, meta);
  const {name, text} = await app.store.exportFile(isoOf(app.today));
  const url = URL.createObjectURL(new Blob([text], {type: 'application/json'}));
  const a = Object.assign(document.createElement('a'), {href: url, download: name});
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToday();
}

async function importProgress(file) {
  try {
    const text = await file.text();
    const n = Object.keys(JSON.parse(text).data || {}).length;
    if (!window.confirm(`Replace the progress on this device with this file’s (${n} parts)?`)) return;
    await app.store.importFile(text);
    location.reload();
  } catch (e) {
    alert(e.message);
  }
}

function showScreen(name) {
  for (const t of SCREENS) $(t).hidden = t !== name;
  $('tabs').hidden = name === 'session' || name === 'check' || name === 'welcome';
}

function markTab(name) {
  for (const b of document.querySelectorAll('#tabs button')) {
    if (b.dataset.tab === name) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  }
}

function showTab(name) {
  if (!TABS.includes(name)) name = 'today';
  if (name === 'steps') return showSteps();
  app.fromTab = name;
  app.reader = null;
  app.family = null;
  app.tree = null;
  app.check = null;
  if (name === 'texts') showTexts();
  if (name === 'path') showPath();
  showScreen(name);
  markTab(name);
  if (location.hash.slice(1) !== name) history.replaceState(null, '', `#${name}`);
  window.scrollTo(0, 0);
}

// ---- first run (patch plan 7B, Phase 1)
//
// welcome → the placement offer (the check, or skip) → 飲茶 as the focus →
// Today. Leaving the check any way (✕, Not now, Mark them known) goes on.
// Nothing is recorded as first run's until the end, so a learner who quits
// halfway sees the welcome again, unless the check has placed something.

function showWelcome() {
  app.firstRun = true;
  history.replaceState(null, '', location.pathname + location.search);
  showScreen('welcome');
  renderWelcome($('welcome'), installContext(navigator, globalThis.matchMedia), {
    onStart: showOffer,
    onImport: () => $('importFile').click(),
  });
  window.scrollTo(0, 0);
}

function showOffer() {
  showScreen('welcome');
  renderOffer($('welcome'), {onCheck: () => startPlacement(), onSkip: finishFirstRun});
  window.scrollTo(0, 0);
}

async function finishFirstRun() {
  const day = systemDay();
  try {
    const focus = await starterFocus(app.library, fetch, day);
    await app.library.linesFor(focus);
  } catch (e) {
    toast(`The sample text couldn’t be added (${e.message}). Try it from Texts.`);
  }
  finishWelcome(app.store, day);
  await app.store.flush();
  app.firstRun = false;
  showToday();
  showTab('today');
}

async function boot() {
  app.store = createStore({
    indexedDB: globalThis.indexedDB || null,
    localStorage: (() => { try { return globalThis.localStorage; } catch { return null; } })(),
    warn: (...a) => console.warn(...a),
  });
  try {
    const t0 = performance.now();
    const [hydrated, loaded, cache] = await Promise.all([
      app.store.hydrate(), loadTables(), openCache(globalThis.indexedDB || null)]);
    // boot time, content fetched and parsed: Phase 1 reads it on the iPhone
    app.loadedMs = Math.round(performance.now() - t0);
    app.storage = hydrated && hydrated.indexedDB ? 'indexedDB' : 'localStorage';
    app.content = loaded.content;
    app.version = loaded.version;
    app.cache = cache;
    app.dict = createDict({index: loaded.index, version: loaded.version, cache});
    cache.prune(loaded.version);
    app.library = createLibrary({store: app.store, content: app.content, dict: app.dict,
                                 cache, version: app.version});
  } catch (e) {
    $('loading').textContent = `Read Path couldn’t start: ${e.message}.`;
    return;
  }
  // tones as marks or numbers (7.12): before any jyutping is drawn
  applyJp(document.documentElement, app.store);
  $('loading').hidden = true;
  app.applyUpdate = watchWorker({build: BUILD, onReady: updateReady});
  if (installContext(navigator, globalThis.matchMedia).standalone) {
    askPersist(app.store).catch(e => console.warn('readpath: persist', e));
  }
  const welcome = needsWelcome(app.store);
  $('tabs').hidden = welcome;
  for (const b of document.querySelectorAll('#tabs button')) {
    b.addEventListener('click', () => showTab(b.dataset.tab));
  }
  $('importFile').addEventListener('change', e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) importProgress(f);
  });
  for (const id of ['ref', 'report', 'feedback']) {
    $(id).addEventListener('click', e => { if (e.target === $(id)) hideOverlay(id); });
  }
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const top = overlays.top();
    if (top) hideOverlay(top);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && systemDay() !== app.today) showToday();
  });
  // the focus text pulls in Today's first composition (usually from the
  // device cache; the dictionary only when its content version is new)
  window.readpath = app;          // for poking at from the console
  if (welcome) return showWelcome();
  try { await app.library.warmFocus(); } catch (e) { console.warn('readpath: focus text', e); }
  showToday();
  route();
}

boot();
