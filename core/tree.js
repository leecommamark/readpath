// tree.js — a character's tree, laid out across (patch plan 7.7, Phase 3;
// brief 7.7 decided 3-5).
//
// The character sits in the middle column. Its parts go left, in the order
// they are written (decomp: left before right, top before bottom, outside
// before inside), and their parts further left, all the way down to the
// atomic pieces; each set of parts sits beside the character it builds, so
// a column reads top to bottom (讀: 言 above 賣). What is built from it as
// a sound or meaning part goes right, up to three columns: shape uses
// would explode (口 alone is in hundreds). A built-from column shows 10 and
// pages on, 10 at a time (Mark, Phase 0: P5); one or two left over are
// shown rather than a button.
//
// treeLayout(form, content, expanded) -> {columns, edges, more}
//   columns  [{level, tiles: [{form, row}]}], left to right; level 0 is the
//            character, negative its parts, positive what is built from it;
//            `row` is a vertical position in tile rows (0 the character's),
//            not necessarily whole
//   edges    [{from, to, role, hot, worn}]: `from` is a part of `to`; role
//            'sound' | 'meaning' | 'shape' (part_role's role, `form` or none
//            being shape); hot where the edge touches the character; worn
//            where `from` is a full part the character shows worn down
//            (part_role `written`, 7.34): on the left it runs from the full
//            part to the shape shown (畾 ⇢ 田, then 田 → 雷), on the right
//            from the full part straight to the character (畾 ⇢ 雷); and
//            variant where the shape is the part written another way (茲 ⇢
//            兹 → 慈), drawn the same, keyed apart
//   more     {level: {shown, left}}: a paged built-from column
//   expanded {level: pages opened past the first}
//
// Pure: no DOM and no states, so a test reads it. A form is placed once,
// at the first place it is reached; a part shared by two characters gets an
// edge from each. Nothing is followed into a cycle.

import {isShapeHead} from './shapehead.js';

export const PAGE = 10;            // a built-from column's page
export const SLACK = 2;            // shown rather than paged
export const RIGHT_LEVELS = 3;
const MAX_DEPTH = 16;              // the parts never go deeper than this

const ROLE = {sound: 'sound', meaning: 'meaning'};
export const edgeRole = (content, char, part) => ROLE[content.roleIn(char, part)] || 'shape';

// a character's parts as the tree shows them: a shape head in place of the
// shape it is (安: 宀 and [女 on], not 女; 難: [廿口夫 naan] for the sheet's
// 堇; 7.34)
export function shownParts(content, f) {
  const rows = (content.partsOf ? content.partsOf(f) : []).filter(r => r.written && isShapeHead(r.part));
  return content.partsInOrder(f).map(p => (rows.find(r => r.written === p) || {part: p}).part);
}

export function treeLayout(form, content, expanded = {}) {
  const level = new Map([[form, 0]]);
  const row = new Map([[form, 0]]);

  // ---- the parts, left. Each part sits one column left of the deepest
  // character that uses it, beside it (唔 is 口 吾, and 吾 is 口 五: 口
  // sits by 吾, with an edge to 唔 too), so every edge runs left to right.
  // Depth is the longest path from the character; an edge back into the
  // path being walked (a cycle) is never followed.
  const reach = [];                        // reverse postorder: users before parts
  const state = new Map();                 // form -> 1 walking, 2 done
  const back = new Set();                  // `${char}|${part}` closing a cycle
  const walk = f => {
    state.set(f, 1);
    for (const p of shownParts(content, f)) {
      if (p === f) continue;
      if (state.get(p) === 1) { back.add(`${f}|${p}`); continue; }
      if (!state.has(p)) walk(p);
    }
    state.set(f, 2);
    reach.push(f);
  };
  walk(form);
  reach.reverse();
  const partsOf = f => shownParts(content, f).filter(p => p !== f && !back.has(`${f}|${p}`));
  const depth = new Map([[form, 0]]);
  const parent = new Map();
  for (const c of reach) {
    if (!depth.has(c)) continue;
    for (const p of partsOf(c)) {
      const d = depth.get(c) + 1;
      if (d > MAX_DEPTH) continue;
      if (!depth.has(p) || d > depth.get(p)) { depth.set(p, d); parent.set(p, c); }
    }
  }
  const kids = new Map();                  // form -> the parts placed beside it
  for (const c of reach) {
    if (depth.has(c)) kids.set(c, partsOf(c).filter(p => parent.get(p) === c));
  }
  // a part the character shows worn down (雷: 畾, written 田) sits beside
  // the shape, one column further left; it is not followed into its own
  // parts (its tree does that)
  const worn = [];
  const wornOf = c => (content.partsOf ? content.partsOf(c) : []).filter(r => r.written && !isShapeHead(r.part));
  for (const c of [...depth.keys()]) {
    for (const r of wornOf(c)) {
      const w = r.written;
      if (!depth.has(w) || depth.has(r.part) || r.part === form) continue;
      if (depth.get(w) + 1 > MAX_DEPTH) continue;
      depth.set(r.part, depth.get(w) + 1);
      kids.get(w).push(r.part);
      worn.push({from: r.part, to: w, role: ROLE[r.role] || 'shape', hot: false, worn: true,
                 ...(r.variant && {variant: true})});
    }
  }
  for (const [f, d] of depth) level.set(f, -d);
  // a tidy tree: each set of parts stacked, the character they build level
  // with their middle
  const span = new Map();                  // form -> rows its subtree needs
  const measure = f => {
    const ks = kids.get(f) || [];
    const n = ks.length ? ks.reduce((a, k) => a + measure(k), 0) : 1;
    span.set(f, n);
    return n;
  };
  measure(form);
  const place = (f, top) => {
    let y = top;
    for (const k of kids.get(f) || []) {
      place(k, y);
      y += span.get(k);
    }
    const ks = kids.get(f) || [];
    if (f !== form) {
      row.set(f, ks.length ? (row.get(ks[0]) + row.get(ks[ks.length - 1])) / 2 : top);
    }
  };
  place(form, 0);
  const firstKids = kids.get(form) || [];
  const mid = firstKids.length
    ? (row.get(firstKids[0]) + row.get(firstKids[firstKids.length - 1])) / 2 : 0;
  for (const [f, L] of level) if (L < 0) row.set(f, row.get(f) - mid);

  // ---- what is built from it, right: each column the uses of the one
  // before, sound uses first, then path order (content.usesOf's order)
  const more = {};
  let prev = [form];
  for (let L = 1; L <= RIGHT_LEVELS; L++) {
    const cand = [];
    for (const p of prev) {
      for (const u of content.usesOf(p)) {
        if (!level.has(u.char) && !cand.includes(u.char)) cand.push(u.char);
      }
    }
    if (!cand.length) break;
    let n = PAGE * (1 + (expanded[L] || 0));
    if (cand.length <= n + SLACK) n = cand.length;
    const shown = cand.slice(0, n);
    shown.forEach((c, i) => { level.set(c, L); row.set(c, i - (shown.length - 1) / 2); });
    if (shown.length < cand.length) more[L] = {shown: shown.length, left: cand.length - shown.length};
    prev = shown;
  }

  // ---- columns and edges
  const byLevel = new Map();
  for (const [f, L] of level) {
    if (!byLevel.has(L)) byLevel.set(L, []);
    byLevel.get(L).push({form: f, row: row.get(f)});
  }
  const columns = [...byLevel.keys()].sort((a, b) => a - b)
    .map(L => ({level: L, tiles: byLevel.get(L).sort((a, b) => a.row - b.row)}));
  const edges = [];
  for (const [c, Lc] of level) {
    for (const p of shownParts(content, c)) {
      if (p === c || !level.has(p) || back.has(`${c}|${p}`)) continue;
      const Lp = level.get(p);
      // a part is to the left of what it builds; on the right only the
      // column before counts (a use's other parts aren't followed there)
      if (Lp >= Lc || (Lc > 0 && Lp !== Lc - 1)) continue;
      edges.push({from: p, to: c, role: edgeRole(content, c, p), hot: p === form || c === form});
    }
    // on the right, a use that shows this part worn down (畾's tree: 雷)
    if (Lc > 0) {
      for (const r of wornOf(c)) {
        if (level.get(r.part) !== Lc - 1 || content.partsInOrder(c).includes(r.part)) continue;
        edges.push({from: r.part, to: c, role: ROLE[r.role] || 'shape', hot: r.part === form, worn: true,
                    ...(r.variant && {variant: true})});
      }
    }
  }
  edges.push(...worn.filter(e => level.has(e.from)));
  return {columns, edges, more};
}

// soundLine(form, content) -> [form, its sound part, that part's sound
// part, ...]: 讀 ← 賣 ← 買. Shown when it's three or more long.
export function soundLine(form, content) {
  const line = [form];
  for (let f = form, i = 0; i < 6; i++) {
    const s = content.soundPartOf(f);
    if (!s || line.includes(s)) break;
    line.push(s);
    f = s;
  }
  return line;
}

// seenAs(form, content) -> where the shape `form` is seen, for a shape some
// character shows a part worn down to (patch plan 7.34, Mark: visually 開 is
// connected to the 研 刑 sets): {groups: [{part, variant, chars}], shape:
// [chars]}, a group per part behind the shape, in the order its first
// character is met (开: 井 形 邢 刑, then 幵 研 妍), then the characters that
// have it only as a shape (開). null where no character shows it worn down.
export function seenAs(form, content) {
  const seen = content.seenIn ? content.seenIn(form) : [];
  if (!seen.length) return null;
  const groups = [];
  for (const s of seen) {
    let g = groups.find(x => x.part === s.part && x.variant === s.variant);
    if (!g) groups.push(g = {part: s.part, variant: s.variant, head: isShapeHead(s.part), chars: []});
    if (!g.chars.includes(s.char)) g.chars.push(s.char);
  }
  return {groups, shape: content.shapeUsesOf(form)};
}
