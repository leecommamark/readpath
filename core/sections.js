// sections.js — a long text, a section at a time (patch plan 5, Phase 4).
//
// A port of songpath's reader.js sectionsOf (plan 4 Phase 4): a text of up
// to 1,500 characters is one section. A longer one is cut at the blank lines
// the writer put there, packed to about 1,200 characters a section. A block
// over that is split at line boundaries, and a single line over it (a pasted
// wall of prose) at word boundaries, never inside a word.
//
// A section is a list of entries, and an entry is a line index or a slice
// of one line's parts, {i, from, to}. entryLine() turns either into a line
// of core/lines.js's shape. The lines themselves are never changed.

export const SECTION_MIN = 1500;           // at or under this: one section
export const SECTION_TARGET = 1200;        // characters to aim for in one

const partsChars = ps => ps.reduce((n, p) =>
  n + (p.type === 'word' ? p.chars.length : Array.from(p.text).length), 0);
const lineChars = l => (l.blank ? 0 : partsChars(l.parts));
const entryParts = (lines, e) => (typeof e === 'number'
  ? (lines[e].blank ? [] : lines[e].parts)
  : lines[e.i].parts.slice(e.from, e.to));

export const entryLine = (lines, e) => (typeof e === 'number' ? lines[e]
  : {parts: lines[e.i].parts.slice(e.from, e.to)});
export const entryIndex = e => (typeof e === 'number' ? e : e.i);

// one line -> the entries it takes to keep within the target
function splitLine(lines, i) {
  const parts = lines[i].parts;
  if (partsChars(parts) <= SECTION_TARGET) return [i];
  const out = [];
  let from = 0, n = 0;
  for (let k = 0; k < parts.length; k++) {
    const c = partsChars([parts[k]]);
    if (n + c > SECTION_TARGET && k > from) { out.push({i, from, to: k}); from = k; n = 0; }
    n += c;
  }
  if (from < parts.length) out.push({i, from, to: parts.length});
  return out;
}

// sectionsOf(lines) -> [[entry]]: at least one section, every line in order
export function sectionsOf(lines) {
  const all = lines.map((_, i) => i);
  if (lines.reduce((n, l) => n + lineChars(l), 0) <= SECTION_MIN) return [all];
  // blank-line blocks; a blank line belongs to the block it closes
  const blocks = [];
  let cur = [];
  lines.forEach((l, i) => {
    cur.push(i);
    if (l.blank) { blocks.push(cur); cur = []; }
  });
  if (cur.length) blocks.push(cur);

  const out = [];
  let acc = [], accN = 0;
  const flush = () => { if (acc.length) { out.push(acc); acc = []; accN = 0; } };
  for (const b of blocks) {
    const n = b.reduce((m, i) => m + lineChars(lines[i]), 0);
    if (n > SECTION_TARGET) {
      flush();
      let part = [], partN = 0;
      for (const i of b) {
        for (const e of splitLine(lines, i)) {
          const c = partsChars(entryParts(lines, e));
          if (partN + c > SECTION_TARGET && part.length) { out.push(part); part = []; partN = 0; }
          part.push(e);
          partN += c;
        }
      }
      if (part.length) out.push(part);
      continue;
    }
    if (accN + n > SECTION_TARGET && acc.length) flush();
    acc = acc.concat(b);
    accN += n;
  }
  flush();
  return out.length ? out : [all];
}

// The section a line is in (In your texts opens the Reader there).
export function sectionOfLine(sections, line) {
  const i = sections.findIndex(s => s.some(e => entryIndex(e) === line));
  return i < 0 ? 0 : i;
}
