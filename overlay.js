// overlay.js — the reference card and the report sheet as overlays, and
// their history entries (patch plan 7.5, Phase 1; moved out of main.js).
//
// Each overlay pushes a history entry, so the phone's back gesture closes it
// rather than leaving the app (Mark's iPhone check, step 4). Closing one any
// other way pops that entry again; `skips` swallows the popstate that
// history.back() causes.
//
// Bug 2 (7.5): a card opened from Find a character with the keyboard up
// could stick -- ✕ and Close dead, the sheet still scrolling, Back closing
// it. Nothing in the code leaves a card open once ✕ runs, so the taps never
// reached it: iOS Safari keeps the scrolled offset of the keyboard's
// viewport for hit-testing a fixed overlay that appears as the keyboard
// closes. So an overlay opens only once the keyboard is gone: the focused
// field is blurred first and, if the visual viewport says the keyboard was
// up, the overlay waits for the viewport to settle (its resize, at most
// SETTLE_MS), scrolls by nothing to re-sync hit-testing, and then shows.
//
// No module state: createOverlays() takes the document, history and window,
// so a test drives it with fakes (test/overlay.test.js).

export const SETTLE_MS = 400;
// the keyboard takes far more than this from the viewport's height; browser
// chrome sliding in and out takes less
const KEYBOARD_PX = 100;

export function keyboardUp(win) {
  const vv = win && win.visualViewport;
  return !!vv && (vv.height < win.innerHeight - KEYBOARD_PX || vv.offsetTop > 0);
}

// createOverlays({doc, history, win, ids, onHidden(id)}) -> overlays
//   open(id, {push, state})
//                       -> its .sheet, to draw into at once; shown now, or
//                          once the keyboard has gone; push: false, on the
//                          entry already there; state, the entry's
//                          (default {overlay: id})
//   close(id, {fromPop}) closes it (and pops its history entry unless the
//                          back gesture already did)
//   isOpen(id)          shown, or about to be
//   swallow(n, then)    goes back n entries without the page seeing it;
//                          then() once it has landed
//   onPop()             for the window's popstate: true if it was the
//                          overlays' (swallowed or closed one), else false.
//                          The `managed` ids are never closed by it: their
//                          entries are the page's (createLayer)
export function createOverlays({doc, history, win = null, ids = ['ref', 'report'], managed = [],
                                onHidden = () => {}, settleMs = SETTLE_MS}) {
  const el = id => doc.getElementById(id);
  const pending = new Map();            // id -> cancel(), while waiting to show
  // one per popstate to swallow, each with what to run when it comes (or null)
  const skips = [];

  function reveal(id, push = true, state = null) {
    pending.delete(id);
    const e = el(id);
    if (e.hidden && push) history.pushState(state || {overlay: id}, '');
    e.hidden = false;
    doc.body.classList.add('overlaid');
  }

  // Wait for the keyboard to finish closing: the viewport's next resize, or
  // SETTLE_MS, whichever is first; then re-sync hit-testing and show.
  function afterKeyboard(id, push, state) {
    const vv = win.visualViewport;
    let timer = null;
    const done = () => {
      if (!pending.has(id)) return;
      cancel();
      win.scrollTo(win.scrollX || 0, win.scrollY || 0);
      reveal(id, push, state);
    };
    const cancel = () => {
      vv.removeEventListener('resize', done);
      win.clearTimeout(timer);
      pending.delete(id);
    };
    vv.addEventListener('resize', done);
    timer = win.setTimeout(done, settleMs);
    pending.set(id, cancel);
  }

  // push: false shows it on the history entry already there (the layer's,
  // come back to: createLayer)
  function open(id, {push = true, state = null} = {}) {
    const sheet = el(id).querySelector('.sheet');
    sheet.scrollTop = 0;
    if (pending.has(id)) return sheet;
    const up = el(id).hidden && keyboardUp(win);
    const active = doc.activeElement;
    if (active && active !== doc.body && typeof active.blur === 'function') active.blur();
    if (up) afterKeyboard(id, push, state);
    else reveal(id, push, state);
    return sheet;
  }

  function close(id, {fromPop = false} = {}) {
    if (pending.has(id)) {               // never shown, so nothing to pop
      pending.get(id)();
      onHidden(id);
      return;
    }
    const e = el(id);
    if (e.hidden) return;
    e.hidden = true;
    if (ids.every(x => el(x).hidden)) doc.body.classList.remove('overlaid');
    onHidden(id);
    if (!fromPop) { skips.push(null); history.back(); }
  }

  function swallow(n, then = () => {}) {
    if (!n) { then(); return; }
    skips.push(then);
    history.go(-n);
  }

  const isOpen = id => pending.has(id) || !el(id).hidden;

  // The topmost overlay showing, in `ids` order from the end (the report
  // sheet opens over the card).
  const top = () => [...ids].reverse().find(id => !el(id).hidden) || null;

  // A back gesture while an overlay waits to show isn't its: no entry was
  // pushed yet. The wait is dropped and the page's own back goes ahead.
  function onPop() {
    if (skips.length) { const after = skips.shift(); if (after) after(); return true; }
    for (const [id, cancel] of [...pending]) { cancel(); onHidden(id); }
    const id = top();
    if (!id || managed.includes(id)) return false;
    close(id, {fromPop: true});
    return true;
  }

  return {open, close, swallow, isOpen, top, onPop, get skipPop() { return skips.length; }};
}

// ---- the search, the word sheet and the cards over them (brief 7.27, from
// Mark's iPhone check): one layer, each step of it an entry in the history
// whose state is the whole layer as it was then, {layer: L}, so back
// retraces it a step at a time -- a card to the card it was opened from, to
// the word sheet, to the search, to the screen under them. A screen opened
// from the layer (a tree, a family's page, the Reader) pushes its own entry
// over it, so back from the screen opens the layer again as it was left.
//
// L = {id, hash, under, search, word, cards, from, focus}: `id` tells one
// layer from the next; `hash` and `under` are the URL and history state of
// the screen it was opened over (the page draws that screen again first,
// coming back from a screen); `search` whether the search sheet is in it;
// `word` the word sheet's word or null; `cards` the cards' forms, the first
// at the bottom; `from` where the first card was opened from (refcard.js
// cardContext); `focus` the reading each card was opened for, by form.

export const LAYER = ['search', 'word', 'ref'];
export const layerDepth = L => (L.search ? 1 : 0) + (L.word ? 1 : 0) + L.cards.length;
const topOf = L => (L.cards.length ? 'ref' : L.word ? 'word' : L.search ? 'search' : null);
const has = (L, id) => !!L && (id === 'search' ? L.search : id === 'word' ? !!L.word : L.cards.length > 0);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let layerIds = 0;

// createLayer({overlays, history, loc, draw}) -> layer
//   draw: {search(L, {step}), word(L), ref(L)} draw into each sheet when
//   its part of the layer is new or changed (step: the learner opened it,
//   rather than came back to it)
//   go(change)    one step on: the layer with `change` (a new layer over the
//                 screen if none is shown); pushes its entry
//   close(id)     back to the step under `id` (its ✕): every card at once
//   leave()       hides it for a screen opened from it, entries kept
//   leaveAll()    hides it and goes back over its entries (Study, Test me:
//                 a session has no entry of its own)
//   onPop()       for the popstate the overlays didn't take: true if it was
//                 a step within the layer, now drawn; else false, and the
//                 page draws the screen the entry names, then restore(L)
//   shown         the layer as drawn, or null
export function createLayer({overlays, history, loc, draw}) {
  let shown = null;

  function apply(L, {step = false} = {}) {
    const was = shown;
    shown = L;
    for (const id of LAYER) {
      if (!has(L, id)) { overlays.close(id, {fromPop: true}); continue; }
      const fresh = !overlays.isOpen(id) || !has(was, id);
      if (!overlays.isOpen(id)) overlays.open(id, {push: false});
      if (fresh || (id === 'word' && !same(was.word, L.word))
          || (id === 'ref' && !same([was.cards, was.from, was.focus], [L.cards, L.from, L.focus]))) {
        draw[id](L, {step: step && id === topOf(L)});
      }
    }
  }

  function go(change) {
    const base = shown || {id: ++layerIds, hash: loc.hash, under: history.state || null,
                           search: false, word: null, cards: [], from: null, focus: {}};
    const L = {...base, ...change};
    const id = topOf(L);
    if (overlays.isOpen(id)) history.pushState({layer: L}, '');    // a card over a card
    else overlays.open(id, {state: {layer: L}});                     // now, or once the keyboard's gone
    apply(L, {step: true});
  }

  function close(id) {
    if (!has(shown, id)) return;
    const below = id === 'search' ? 0 : id === 'word' ? (shown.search ? 1 : 0)
      : (shown.search ? 1 : 0) + (shown.word ? 1 : 0);
    history.go(-(layerDepth(shown) - below));
  }

  const leave = () => { if (shown) apply(null); };
  function leaveAll() {
    if (!shown) return;
    const n = layerDepth(shown);
    apply(null);
    overlays.swallow(n);
  }

  function onPop() {
    const L = (history.state && history.state.layer) || null;
    if (shown && (L ? L.id === shown.id : loc.hash === shown.hash)) { apply(L); return true; }
    leave();
    return false;
  }

  return {go, close, leave, leaveAll, onPop, restore: L => apply(L), get shown() { return shown; }};
}

// A tree opened during a session (brief 7.18 Decided 3) is an entry in the
// history marked `inRun`, so a back gesture retraces the trees opened from
// the session and then lands on the session as it was. A tree entry from
// before the session (Learn this family next was tapped on a tree) isn't
// one: back past the session's own trees goes to the session, never to it.
export const runTree = state => (state && state.tree != null && state.inRun ? state.tree : null);

// A card opened from a card stacks, and "Back to 清" returns to it.
// open(form) pushes it unless it's already on top; back() pops one.
export function createCardStack() {
  const stack = [];
  return {
    open(form) { if (stack[stack.length - 1] !== form) stack.push(form); },
    back() { if (stack.length > 1) stack.pop(); return stack[stack.length - 1] || null; },
    clear() { stack.length = 0; },
    get top() { return stack[stack.length - 1] || null; },
    get prev() { return stack.length > 1 ? stack[stack.length - 2] : null; },
    get depth() { return stack.length; },
  };
}
