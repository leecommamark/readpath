// overlay.js — the reference card and the report sheet as overlays, and
// their history entries (patch plan 7.5, Phase 1; moved out of main.js).
//
// Each overlay pushes a history entry, so the phone's back gesture closes it
// rather than leaving the app (Mark's iPhone check, step 4). Closing one any
// other way pops that entry again; `skipPop` swallows the popstate that
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
//   open(id)            -> its .sheet, to draw into at once; shown now, or
//                          once the keyboard has gone
//   close(id, {fromPop}) closes it (and pops its history entry unless the
//                          back gesture already did)
//   isOpen(id)          shown, or about to be
//   onPop()             for the window's popstate: true if it was the
//                          overlays' (swallowed or closed one), else false
export function createOverlays({doc, history, win = null, ids = ['ref', 'report'],
                                onHidden = () => {}, settleMs = SETTLE_MS}) {
  const el = id => doc.getElementById(id);
  const pending = new Map();            // id -> cancel(), while waiting to show
  let skipPop = 0;

  function reveal(id) {
    pending.delete(id);
    const e = el(id);
    if (e.hidden) history.pushState({overlay: id}, '');
    e.hidden = false;
    doc.body.classList.add('overlaid');
  }

  // Wait for the keyboard to finish closing: the viewport's next resize, or
  // SETTLE_MS, whichever is first; then re-sync hit-testing and show.
  function afterKeyboard(id) {
    const vv = win.visualViewport;
    let timer = null;
    const done = () => {
      if (!pending.has(id)) return;
      cancel();
      win.scrollTo(win.scrollX || 0, win.scrollY || 0);
      reveal(id);
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

  function open(id) {
    const sheet = el(id).querySelector('.sheet');
    sheet.scrollTop = 0;
    if (pending.has(id)) return sheet;
    const up = el(id).hidden && keyboardUp(win);
    const active = doc.activeElement;
    if (active && active !== doc.body && typeof active.blur === 'function') active.blur();
    if (up) afterKeyboard(id);
    else reveal(id);
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
    if (!fromPop) { skipPop++; history.back(); }
  }

  const isOpen = id => pending.has(id) || !el(id).hidden;

  // The topmost overlay showing, in `ids` order from the end (the report
  // sheet opens over the card).
  const top = () => [...ids].reverse().find(id => !el(id).hidden) || null;

  // A back gesture while an overlay waits to show isn't its: no entry was
  // pushed yet. The wait is dropped and the page's own back goes ahead.
  function onPop() {
    if (skipPop > 0) { skipPop--; return true; }
    for (const [id, cancel] of [...pending]) { cancel(); onHidden(id); }
    const id = top();
    if (!id) return false;
    close(id, {fromPop: true});
    return true;
  }

  return {open, close, isOpen, top, onPop, get skipPop() { return skipPop; }};
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
