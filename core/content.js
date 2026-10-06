// content.js — build/content/ as indexes (patch plan 3, Phase 1).
//
// The content tables are read-only and generated (readpath/tools/
// export_content.py); this file only indexes them. It does no I/O: the caller
// fetches or reads the nine `.json` files and passes them in, parsed, as
// `{glyph, reading, part_role, sound_part, meaning_part, tellapart, word,
// path, syllable}`. Each is `{fields: [...], rows: [[...]]}`.
//
// Item ids are the export's: `r:清:cing1` (a character reading), `s:青` (a
// sound part), `m:氵` (a meaning part). Everything the learner model asks of
// the content goes through the object returned here, so a later change of
// table shape is a change to this file alone.

export const TABLES = ['glyph', 'reading', 'part_role', 'sound_part',
                       'meaning_part', 'tellapart', 'word', 'path', 'syllable',
                       'decomp'];
// The Reader's (patch plan 5, Phase 1), loaded at boot too, but optional
// here: a caller that only composes Today needs none of them. `lexicon` is a
// flat array, `variants` one object (s2t), `char` rows as above. `offchar`
// (patch plan 6, Phase 1) is the off-path card's: readings and words.
export const READER_TABLES = ['lexicon', 'char', 'variants', 'offchar'];

// {fields, rows} -> [{field: value}], in row order.
export function rowsOf(table) {
  const {fields, rows} = table;
  return rows.map(r => {
    const o = {};
    fields.forEach((f, i) => { o[f] = r[i]; });
    return o;
  });
}

export const readingId = (ch, jp) => `r:${ch}:${jp}`;
export const soundId = part => `s:${part}`;
export const meaningId = part => `m:${part}`;
const KIND_OF_PREFIX = {r: 'reading', s: 'sound', m: 'meaning'};
export const kindOf = id => KIND_OF_PREFIX[id[0]];
// 'cing1' -> 'cing': the syllable without its tone
export const toneless = jp => jp.replace(/[1-6]$/, '');

export function loadContent(tables) {
  for (const t of TABLES) {
    if (!tables[t]) throw new Error(`content table missing: ${t}`);
  }
  const T = Object.fromEntries(TABLES.map(t => [t, rowsOf(tables[t])]));

  // ---- the path: every item, in order, with its prerequisites
  const items = new Map();                 // id -> item
  const path = [];                         // ids in rank order
  for (const p of T.path) {
    items.set(p.item, {id: p.item, kind: p.kind, form: p.form, jp: p.jp,
                       rank: p.rank, prereqs: p.prereqs || [],
                       inserted: !!p.inserted});
    path.push(p.item);
  }
  path.sort((a, b) => items.get(a).rank - items.get(b).rank);

  // ---- readings: every reading of a path character, item or not
  const readingsOf = new Map();            // char -> [reading row]
  for (const r of T.reading) {
    if (!readingsOf.has(r.char)) readingsOf.set(r.char, []);
    readingsOf.get(r.char).push(r);
    if (!r.item) continue;
    const it = items.get(readingId(r.char, r.jp));
    if (!it) throw new Error(`reading item not on the path: ${r.char} ${r.jp}`);
    Object.assign(it, {
      char: r.char, primary: !!r.primary, gloss: r.gloss,
      // where the gloss comes from (patch plan 7.10): core/provenance.js
      src: r.src || null,
      words: r.words || [],
      unlockAfter: r.unlock_after ? readingId(r.char, r.unlock_after) : null,
      relation: r.relation, base: r.base,
      // 文 or 白 (brief 7.16, Mark's ruling), null where he made none
      layer: r.layer || null,
    });
  }
  const mainOf = new Map();                // char -> main reading item id
  const loneOf = new Map();                // char -> its lone reading item id (7.16)
  const written = new Map();               // char -> {wrank, wshare}
  const holeRisk = new Set();              // char -> hole-risk (7.13)
  const value = new Map();                 // char -> word-token value per million (7.5)
  for (const [ch, rs] of readingsOf) {
    const m = rs.find(r => r.primary && r.item);
    if (m) mainOf.set(ch, readingId(ch, m.jp));
    const lone = rs.find(r => r.lone && r.item);
    if (lone) loneOf.set(ch, readingId(ch, lone.jp));
    if (m && m.wrank != null) written.set(ch, {wrank: m.wrank, wshare: m.wshare});
    if (m && m.value != null) value.set(ch, m.value);
    if (m && m.wrank != null && m.holerisk) holeRisk.add(ch);
  }
  // placement's pool (patch plan 6): every main reading with a written rank,
  // most written first. Which list ranked them is the export's business.
  const pool = [...written].sort((a, b) => a[1].wrank - b[1].wrank)
    .map(([ch, w]) => ({id: mainOf.get(ch), char: ch, wrank: w.wrank}));

  // ---- parts: each character's sound and meaning part, and each part
  // item's members (main reading items, in path order)
  const soundPartOf = new Map();           // char -> part form
  const meaningPartOf = new Map();         // char -> part form
  const partsOf = new Map();               // char -> [{part, role}]
  for (const r of T.part_role) {
    if (r.role === 'sound') soundPartOf.set(r.char, r.part);
    else if (r.role === 'meaning') meaningPartOf.set(r.char, r.part);
    if (!partsOf.has(r.char)) partsOf.set(r.char, []);
    // reading: the part's reading nearest this character's, where it isn't
    // the taught one (稅 <- 兌 deoi3); cousins: members that carry the sound
    // where the part's reading is no clue (當 <- 尚: 黨 堂); listed: false for
    // a curated no-example pair (撚 under 扌), never shown among the part's
    // characters (patch plan 6.5: CO-064, CO-016, CO-058); written: the
    // worn-down shape the character shows for it (巷 邑 as 巳, 有 又 as 𠂇),
    // the form decomp and roleIn know it by (brief 7.9)
    partsOf.get(r.char).push({part: r.part, role: r.role, reading: r.reading || null,
                              cousins: r.cousins || [], listed: r.listed !== 0,
                              written: r.written || null});
  }
  // a component's main role: 'sound' or 'meaning', whichever it plays in
  // more characters, a tie to sound (patch plan 7.6 3b, Mark: 口 is a
  // meaning part, sound in 3 and meaning in 134); a part only ever `form`
  // has none. The glyph tile's border: a dotted square or circle.
  const roleCount = new Map();             // part -> {sound, meaning}
  for (const r of T.part_role) {
    if (r.role !== 'sound' && r.role !== 'meaning') continue;
    if (!roleCount.has(r.part)) roleCount.set(r.part, {sound: 0, meaning: 0});
    roleCount.get(r.part)[r.role]++;
  }
  const mainRole = new Map([...roleCount].map(([p, n]) => [p, n.sound >= n.meaning ? 'sound' : 'meaning']));
  const unlisted = new Set(T.part_role.filter(r => r.listed === 0).map(r => `${r.char}|${r.part}`));
  // every part's taught reading and gloss, study item or not, for the "built
  // from" line (step 4 6b: 的's 勺 is no item, and had no reading shown)
  const partReading = new Map(T.sound_part.map(s => [s.part, s.taught_reading || s.head_reading]));
  const partGloss = new Map(T.meaning_part.map(m => [m.part, m.gloss]));
  // where they come from (patch plan 7.10): a part gloss curated or Unihan's
  // kDefinition, a taught part reading a dictionary's, Mark's or kCantonese's
  const partGlossSrc = new Map(T.meaning_part.map(m => [m.part, m.src || null]));
  const partReadingSrc = new Map(T.sound_part.map(s => [s.part, s.jp_src || null]));
  // how far a meaning part can be trusted, and Mark's note on it (CO-059)
  const partTrust = new Map(T.meaning_part.map(m => [m.part, {reliability: m.reliability || null,
                                                             note: m.note || null}]));
  // the part a shape stands for (忄 心, 氵 水, 㣺 心): two parts are one where
  // this agrees, and never tell characters apart (CO-062)
  const stands = new Map(T.meaning_part.filter(m => m.stands_for).map(m => [m.part, m.stands_for]));
  const onePart = part => (part && stands.get(part)) || part;
  const byRank = ids => ids.sort((a, b) => items.get(a).rank - items.get(b).rank);
  const members = new Map();               // part item id -> [reading item id]
  for (const s of T.sound_part) {
    if (!s.item) continue;
    const it = items.get(soundId(s.part));
    if (!it) throw new Error(`sound item not on the path: ${s.part}`);
    Object.assign(it, {part: s.part, taughtReading: s.taught_reading,
                       patterns: s.patterns || []});
    members.set(it.id, byRank(s.members.map(ch => mainOf.get(ch)).filter(Boolean)));
  }
  for (const m of T.meaning_part) {
    if (!m.item) continue;
    const it = items.get(meaningId(m.part));
    if (!it) throw new Error(`meaning item not on the path: ${m.part}`);
    Object.assign(it, {part: m.part, gloss: m.gloss, meaning: m.meaning,
                       standsFor: m.stands_for || null, resolves: m.resolves || [],
                       reliability: m.reliability || null, note: m.note || null});
    members.set(it.id, []);
  }
  for (const [ch, part] of meaningPartOf) {
    const list = members.get(meaningId(part));
    if (list && mainOf.has(ch) && !unlisted.has(`${ch}|${part}`)) list.push(mainOf.get(ch));
  }
  for (const [id, list] of members) if (id[0] === 'm') byRank(list);

  // ---- decomp: parts in written order, as arrays of code points
  const decomp = new Map(T.decomp.map(d => [d.char, [...d.parts]]));
  const ordered = new Map(T.decomp.map(d => [d.char, !!d.ordered]));
  // a part's role in a character, by the form the character shows (巷's
  // 邑 is written 巳): the tree reads decomp's forms
  const roleIn = new Map();                // `${char}|${form}` -> role
  for (const r of T.part_role) roleIn.set(`${r.char}|${r.written || r.part}`, r.role);
  // what is built from a part as its sound or meaning (the tree's right
  // side): listed pairs only, sound uses first, then path order
  const uses = new Map();                  // part -> [{char, role}]
  for (const r of T.part_role) {
    if ((r.role !== 'sound' && r.role !== 'meaning') || r.listed === 0) continue;
    if (!uses.has(r.part)) uses.set(r.part, []);
    uses.get(r.part).push({char: r.char, role: r.role});
  }
  const charRank = ch => (mainOf.has(ch) ? items.get(mainOf.get(ch)).rank : Infinity);
  for (const list of uses.values()) {
    list.sort((a, b) => (a.role !== 'sound') - (b.role !== 'sound') || charRank(a.char) - charRank(b.char));
  }

  // ---- the lookups the learner model uses
  const item = id => {
    const it = items.get(id);
    if (!it) throw new Error(`no such item: ${id}`);
    return it;
  };
  const partItem = (form, make) => {
    const id = form && make(form);
    return id && items.has(id) ? id : null;
  };
  const soundItemOf = ch => partItem(soundPartOf.get(ch), soundId);
  const meaningItemOf = ch => partItem(meaningPartOf.get(ch), meaningId);

  return {
    items, path,
    has: id => items.has(id),
    item,
    rank: id => item(id).rank,
    prereqs: id => item(id).prereqs,
    kind: id => item(id).kind,
    mainReading: ch => mainOf.get(ch) || null,
    // the reading item a character takes standing alone in a text (brief
    // 7.16, Decided 2): its 白 reading, or Mark's ruling, else the main one
    loneReading: ch => loneOf.get(ch) || mainOf.get(ch) || null,
    // a character's written-Chinese rank (1 = most written) and its share of
    // written characters, per million; null for the colloquial few unranked
    wrankOf: ch => (written.get(ch) || {}).wrank ?? null,
    wshareOf: ch => (written.get(ch) || {}).wshare ?? null,
    // curated/holerisk.tsv (7.13 P1): a literary character a heritage
    // learner may not know; only ever true on a ranked main reading
    holeRiskOf: ch => holeRisk.has(ch),
    // its share of word tokens, per million, both lists (patch plan 7.5):
    // a family card's "N‰ of text" sums it
    valueOf: ch => value.get(ch) ?? 0,
    placementPool: () => pool,
    readingsOf: ch => readingsOf.get(ch) || [],
    soundPartOf: ch => soundPartOf.get(ch) || null,
    meaningPartOf: ch => meaningPartOf.get(ch) || null,
    // every part of a character with its role (sound, meaning, form), in
    // part_role's order: sound, then the rest as drawn
    partsOf: ch => partsOf.get(ch) || [],
    componentRole: form => mainRole.get(form) || null,
    partReading: part => partReading.get(part) || null,
    partGloss: part => partGloss.get(part) || null,
    partGlossSrc: part => partGlossSrc.get(part) || null,
    partReadingSrc: part => partReadingSrc.get(part) || null,
    partTrust: part => partTrust.get(part) || {reliability: null, note: null},
    onePart,
    soundItemOf, meaningItemOf,
    membersOf: id => members.get(id) || [],
    wordsOf: id => item(id).words || [],
    // A reading's example word for the word rung. `words` never holds the
    // bare character (Phase 0 finding 2), so any entry is a real word.
    hasWord: id => (item(id).words || []).length > 0,
    glyph: new Map(T.glyph.map(g => [g.form, g])),
    // every character build/chars.tsv decomposes, its parts in written
    // order (patch plan 7.7): the tree's parts, down to the atomic pieces.
    // [] for an atomic form. Roles are partsOf's.
    partsInOrder: form => decomp.get(form) || [],
    // whether that order is known (the IDS placed every part), or the
    // sheet's kept
    partsOrdered: form => ordered.get(form) ?? true,
    // a part's role in a character: sound, meaning, form, or null where
    // part_role has no row (a character off the path, a part's own parts)
    roleIn: (char, form) => roleIn.get(`${char}|${form}`) || null,
    // the characters built from a part as their sound or meaning part
    usesOf: part => uses.get(part) || [],
    tellapart: T.tellapart,
    words: new Map(T.word.map(w => [`${w.form}|${w.jp}`, w])),
    // toneless syllable -> {syllable, key, uses, tones, near, sim}: every
    // syllable a reading has, its sound key (as a merging speaker hears it),
    // and its sound-alikes, closest first (step 4's reading choices)
    syllables: new Map(T.syllable.map(s => [s.syllable, s])),
    ...readerContent(tables),
  };
}

// The Reader's tables, where they were passed: `lexicon` (a Set, for the
// segmenter), `char(c)` -> {char, rd, jp, gloss} | null (s2t's readability,
// a one-character token's reading and meaning), `variants` (s2t) and
// `offchar(c)` -> {char, readings, words} | null (an off-path character with
// a jyutping: its readings, most used first, and up to four words).
function readerContent(tables) {
  if (!READER_TABLES.every(t => tables[t])) return {};
  const chars = new Map(rowsOf(tables.char).map(r => [r.char, r]));
  const off = new Map(rowsOf(tables.offchar).map(r => [r.char, r]));
  return {lexicon: new Set(tables.lexicon), variants: tables.variants,
          char: c => chars.get(c) || null,
          offchar: c => off.get(c) || null, offchars: off};
}
