// shapehead.js — a shape head (patch plan 7.34, phase 8; Decided 4: a
// family head is a shape, not necessarily a character): a sound part that
// is a shape some characters share and read alike, which is not the
// character of that shape (安 斯's 女 斤 read on, si; 女 is neoi5). The data
// names it `[女 on]`; the learner never sees the brackets (Mark, 2026-11-14):
// the app draws the shape in a marked tile.
//
// shapeHead(form) -> {shape, name} or null
// CROPS: a shape with no code point, drawn as part of a member's glyph
//   (Mark: [廿口夫 naan] is 難's left side): {from, keep}

export function shapeHead(form) {
  const m = typeof form === 'string' && /^\[(\S+) (\S+)\]$/.exec(form);
  return m ? {shape: m[1], name: m[2]} : null;
}
export const isShapeHead = form => !!shapeHead(form);
// a form in a line of plain text: a shape head is its shape (女), never [女 on]
export const shownForm = form => (shapeHead(form) ? shapeHead(form).shape : form);

export const CROPS = {'廿口夫': {from: '難', keep: 'left'}};
