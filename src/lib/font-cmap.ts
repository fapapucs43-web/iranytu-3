/**
 * Reading a woff2 file's real character map (Batch 7f).
 *
 * WHY THIS EXISTS
 * The app shipped Lato for months while being unable to render ő or ű. The
 * cause was not a mistake in the registry — the registry said
 * `unicodeRange: "U+0100-02BA, …"`, which is TRUE, because ő (U+0151) and ű
 * (U+0171) are both inside U+0100-02BA. The cause was that the `unicodeRange`
 * in a registry is a CLAIM about a file, and the file did not keep it: Google's
 * `latin-ext` subset of Lato is the Central-European cut and omits both
 * letters, while the upstream font has them. Every test that existed checked the
 * claim. Nothing checked the bytes.
 *
 * So the registry is no longer trusted, and this reads the bytes. It is the only
 * honest way to keep a promise about what a typeface can spell, and a promise
 * the app makes in the only language it is written in.
 *
 * WHY NOT A FONT PARSING LIBRARY
 * The repository's rule is zero new dependencies, and rightly so for a mood
 * journal that promises nothing leaves the device. But there is a second reason,
 * and it is the better one: this is a TEST-ONLY concern. Nothing in the running
 * app reads a character map, so the right shape is a small pure module a test
 * imports — not a runtime dependency and not a build step, which would also have
 * to exist on the deploy machine.
 *
 * WHY IT IS THIS MUCH CODE
 * woff2 is a Brotli stream of a table directory plus the table data. Three
 * facts make the rest short: `cmap` is never transformed in woff2 (only `glyf`,
 * `loca` and `hmtx` ever are), it is entry 0 of the spec's fixed tag list, and
 * the two character-map formats Google Fonts emits are format 4 and format 12.
 * Everything below is those three facts and the error paths around them — a
 * parser that returns a confident wrong answer is worse than one that refuses.
 *
 * It is a devDependency-shaped module on purpose: nothing in the RUNNING app
 * imports it, so it is neither a runtime dependency nor a build step — which
 * would also have to exist on the deploy machine. Its two importers are the
 * tests and `scripts/subset-ui-fonts.ts`, which uses it at build time to read
 * the character map of a subset it has just produced. That is also why the fix
 * below left the production bundle byte-identical: this module is not in it.
 * (The header used to say "imported by tests/batch7f.test.ts and by nothing
 * else", which stopped being true when Batch 12 gave the subsetter the same
 * check.)
 *
 * WHAT BATCH 13 CHANGED, AND WHY IT WAS A REAL DEFECT
 * Until Batch 13 this module did not read the character map. It PROBED it: it
 * asked "does this file cover code point N?" for every N in 0x00..0x2FF, and
 * reported the yeses. 0x2FF is Latin, Latin-1 Supplement and Latin Extended-A —
 * the range the APP needs, because that is where ő and ű live — and it is
 * nowhere near the range a real font declares. The euro sign (U+20AC), the
 * trademark sign (U+2122), the en and em dashes, the quotes, the guillemets
 * and the bullet are all above it, so a file could carry every one of them and
 * this reader would report none. `inter-latin.woff2` declares 211 code points;
 * the probe found 190, and the 21 it missed were exactly the ones above the
 * ceiling. The module's own comment two paragraphs up — "a parser that returns
 * a confident wrong answer is worse than one that refuses" — was the standard
 * it was failing.
 *
 * The fix is not a higher number. A higher ceiling is the same mistake with a
 * different constant in it, and it fails again the first time a font declares a
 * character nobody thought to include. The fix is to read what the subtables
 * DECLARE: both formats are lists of ranges, and enumerating them is exact.
 */
import { brotliDecompressSync } from "node:zlib";

/**
 * The two letters Hungarian needs and a Latin-only face would fall back on, as
 * code points, for the checks that work in numbers: U+0151 `ő` and U+0171 `ű`.
 *
 * Batch 12, commit 3b removed the string-form twin of this list
 * (`HUNGARIAN_DIACRITICS`), which nothing in the repository had ever read — the
 * tests assert against the code points, and the module has no other consumer.
 * The comment above used to be the twin's doc comment; the two characters are
 * named here so the list still says what it is for.
 */
export const HUNGARIAN_DIACRITIC_CODEPOINTS: readonly number[] = [0x151, 0x171];

/**
 * Big-endian reads, without `Buffer`.
 *
 * The repository has no `@types/node` in its `tsconfig`, and adding one for a
 * test-only parser would be a new dependency bought for convenience. Plain
 * `Uint8Array` does the same job. Every multi-byte field in a woff2 header and
 * in a `cmap` is big-endian, and reading one the wrong way round does not throw
 * — it returns a different number, which in a character-map parser means a
 * different answer about a font. So the endianness is written out in each read
 * rather than hidden behind one helper that might get it wrong once.
 */
function u8(b: Uint8Array, at: number): number {
  return b[at]!;
}

function u16(b: Uint8Array, at: number): number {
  return (b[at]! << 8) | b[at + 1]!;
}

/** Signed, because `cmap` format 4's `idDelta` is a signed 16-bit value. */
function i16(b: Uint8Array, at: number): number {
  const v = u16(b, at);
  return v >= 0x8000 ? v - 0x10000 : v;
}

function u32(b: Uint8Array, at: number): number {
  return ((b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!) >>> 0;
}

/** A four-character table tag, which may contain a trailing space. */
function tag4(b: Uint8Array, at: number): string {
  return String.fromCharCode(b[at]!, b[at + 1]!, b[at + 2]!, b[at + 3]!);
}

/**
 * The woff2 tag list, in the spec's fixed order.
 *
 * Entry 0 is `cmap`, which is the only entry this module looks for. The list is
 * written out in full rather than truncated at `cmap` because the DIRECTORY is
 * parsed positionally: a short list would make every tag index after the end
 * decode as the wrong table, which is precisely the kind of quiet wrong answer
 * this module is supposed to be incapable of.
 */
const KNOWN_TAGS: readonly string[] = [
  "cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ", "fpgm",
  "glyf", "loca", "prep", "CFF ", "VORG", "EBDT", "EBLC", "gasp", "hdmx", "kern",
  "LTSH", "PCLT", "VDMX", "vhea", "vmtx", "BASE", "GDEF", "GPOS", "GSUB", "EBSC",
  "JSTF", "MATH", "CBDT", "CBLC", "COLR", "CPAL", "SVG ", "sbix", "acnt", "avar",
  "bdat", "bloc", "bsln", "cvar", "fdsc", "feat", "fmtx", "fvar", "gvar", "hsty",
  "just", "lcar", "mort", "morx", "opbd", "prop", "trak", "Zapf", "Silf", "Glat",
  "Gloc", "Feat", "Sill",
];

/**
 * The tables whose entry in the directory is followed by a second length.
 *
 * `glyf` and `loca` only, and `hmtx` is deliberately NOT in this set even though
 * the specification allows it to be transformed. Both real writers — Google's,
 * which produced the twenty files this repository shipped until Batch 7i, and
 * fontTools', which produced the rest — write `hmtx` untransformed, so its entry
 * is followed by nothing. Reading a second length anyway consumes bytes that
 * belong to the NEXT entry, and from that point on every tag is wrong and the
 * brotli stream is read from the wrong offset.
 *
 * It went unnoticed because the error is not always fatal: the committed files
 * happened to resynchronise, or to land close enough for brotli to finish the
 * stream anyway. Three of fontTools' own outputs did not, and the symptom was
 * `Decompression failed` on files that fontTools itself opens without complaint
 * — which is exactly the confusion this module's error path was written to
 * avoid, and which is why the rule is stated here rather than left implicit.
 *
 * A parser that returns a confident wrong answer is worse than one that stops,
 * so this set is the parser's whole claim about which entries are two numbers
 * wide. It is checked against both writers' output in
 * `tests/batch5-typography.test.ts` and `tests/batch7i-ui-fonts.test.ts`, which
 * read every committed file.
 */
const TRANSFORMED_TAGS = new Set(["glyf", "loca"]);

/** A character map we could read, or the reason we could not. */
export type CmapResult =
  | { ok: true; codepoints: Set<number> }
  | { ok: false; reason: string };

/** The four signature bytes every woff2 file starts with. */
const WOFF2_MAGIC = 0x774f4632; // 'wOF2'

/**
 * A variable-length integer, base 128, most significant group first.
 *
 * woff2's own encoding, not the sfnt one: five 7-bit groups, each contributing
 * seven bits, so the value is 35 bits wide and the fifth group can only be
 * `0b0000011`. A longer run is not a large number, it is a corrupt file, and
 * treating it as one is what stops this from looping forever on bad input.
 */
function readBase128(b: Uint8Array, at: number): { value: number; next: number } {
  let value = 0;
  for (let i = 0; i < 5; i += 1) {
    if (at + i >= b.length) throw new Error("truncated UIntBase128");
    const byte = b[at + i]!;
    // Seven bits of value per byte, and the eighth bit IS a continuation flag:
    // it is set on every byte except the last. This comment used to say the
    // opposite — "no continuation bit" — directly above code that checks for
    // one, which is how an encoder written from it would emit a length the
    // reader mis-parses. `tests/batch13-cmap.test.ts` writes this format by
    // hand and is the reason the contradiction was noticed.
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) return { value, next: at + i + 1 };
  }
  throw new Error("UIntBase128 longer than five bytes");
}

/** The slice of the decompressed font that holds one table. */
type Located = { tag: string; data: Uint8Array };

function readDirectory(b: Uint8Array): Located[] {
  if (b.length < 48) throw new Error("shorter than a woff2 header");
  if (u32(b, 0) !== WOFF2_MAGIC) throw new Error("not a woff2 file");
  const numTables = u16(b, 12);
  const totalCompressedSize = u32(b, 20);

  let at = 48;
  const entries: { tag: string; origLength: number; stored: number }[] = [];
  for (let i = 0; i < numTables; i += 1) {
    const flags = u8(b, at);
    at += 1;
    const tagIndex = flags & 0x3f;
    const transformVersion = (flags >> 6) & 0x03;
    let tag: string;
    if (tagIndex === 0x3f) {
      tag = tag4(b, at);
      at += 4;
    } else {
      tag = KNOWN_TAGS[tagIndex]!;
      if (!tag) throw new Error(`unknown tag index ${tagIndex}`);
    }
    const orig = readBase128(b, at);
    at = orig.next;
    // The transformed length is present only when the table really was
    // transformed. `cmap` never is, and neither is anything else here, so the
    // stored length equals the original for every table this file type carries
    // — see `TRANSFORMED_TAGS` for why `hmtx` is not read as two numbers wide.
    let stored = orig.value;
    if (TRANSFORMED_TAGS.has(tag) && transformVersion !== 3) {
      const t = readBase128(b, at);
      stored = t.value;
      at = t.next;
    }
    entries.push({ tag, origLength: orig.value, stored });
  }

  const stream = b.subarray(at, at + totalCompressedSize);
  const font = new Uint8Array(brotliDecompressSync(stream));

  // Tables sit back to back in directory order, each occupying its STORED
  // length, so the running offset is how a tag is found in the plain bytes.
  const out: Located[] = [];
  let offset = 0;
  for (const e of entries) {
    if (e.tag === "cmap") {
      out.push({ tag: e.tag, data: font.subarray(offset, offset + e.stored) });
    }
    offset += e.stored;
  }
  return out;
}

/**
 * How many code points one file may declare before this reader stops trusting
 * it, and says so.
 *
 * Every file this repository ships declares between 124 and 244, so the
 * ceiling is two orders of magnitude above anything real. It is not there to
 * bound ordinary work — enumeration is cheap — it is there for the one case
 * this module promises to handle: a file that declares more than a reader
 * should expand on its word. A format-12 group may declare any range up to
 * U+10FFFF, so a corrupt end value can ask for 1.1M insertions. Rather than
 * allocate them, or silently truncate and report a smaller map, the reader
 * refuses with a reason — the failure mode the header asks for.
 */
const MAX_MAPPED_CODEPOINTS = 0x10000; // 65 536

/**
 * Every code point a format-4 subtable maps, added to `out`. A reason string
 * means the subtable is malformed or too large, and `out` is then meaningless.
 *
 * A format-4 subtable is a sorted list of segments, and each segment declares
 * a start and an end, so the code points it maps are already written down.
 * Walking the segments enumerates them exactly — no range is chosen here, and
 * so no character can fall outside one.
 */
function collectFormat4(table: Uint8Array, out: Set<number>): string | null {
  if (table.length < 16) return "a format 4 subtable is shorter than its header";
  const segCount = u16(table, 6) / 2;
  if (!Number.isInteger(segCount) || segCount === 0) return "format 4 declares no segments";
  // The five parallel arrays, in the order the specification lays them out:
  // endCode, reservedPad, startCode, idDelta, idRangeOffset, glyphIdArray. The
  // `reservedPad` is the +2 in `startBase`, and it is why every base below sits
  // two bytes further on than the one above it.
  const endBase = 14;
  const startBase = endBase + segCount * 2 + 2;
  const deltaBase = startBase + segCount * 2;
  const rangeBase = deltaBase + segCount * 2;
  if (table.length < rangeBase + segCount * 2) {
    return "format 4 is truncated inside its segment arrays";
  }

  for (let s = 0; s < segCount; s += 1) {
    const start = u16(table, startBase + s * 2);
    const end = u16(table, endBase + s * 2);
    // Segments are sorted and never empty in a well-formed table, so a reversed
    // pair is a malformed one. Skipping it keeps one bad segment from adding a
    // run of code points the file never declared.
    if (start > end) continue;
    const delta = i16(table, deltaBase + s * 2);
    const rangeOffset = u16(table, rangeBase + s * 2);
    if (rangeOffset === 0) {
      // The common case: one arithmetic run, `glyph = (cp + idDelta) & 0xFFFF`.
      // Glyph 0 is `.notdef` — the "this character has no shape" entry — so a
      // character mapped to it is not one the file can draw and is not
      // reported. Every real table's last segment is 0xFFFF with `idDelta: 1`,
      // which maps to glyph 0, and it drops out here.
      for (let cp = start; cp <= end; cp += 1) {
        if (((cp + delta) & 0xffff) === 0) continue;
        if (out.size >= MAX_MAPPED_CODEPOINTS) return TOO_MANY;
        out.add(cp);
      }
      continue;
    }
    // The other case: the glyph indexes live in `glyphIdArray`, addressed
    // RELATIVE TO THE `idRangeOffset` SLOT ITSELF — the single most common way
    // to get this wrong, and the reason the arithmetic above cannot be reused
    // here. An ODD `idRangeOffset` means the stored value is a glyph index
    // shifted left by one bit, which the specification requires be shifted
    // back; no writer in this repository's supply chain emits one, and reading
    // it correctly costs one line rather than a silent wrong answer.
    const shifted = (rangeOffset & 1) === 1;
    for (let cp = start; cp <= end; cp += 1) {
      const at = rangeBase + s * 2 + rangeOffset + (cp - start) * 2;
      // Past the end of `glyphIdArray` the specification says the remaining
      // characters of the segment map to `.notdef`, and the address only grows
      // with `cp`, so the segment stops here instead of running to 0xFFFF.
      if (at + 1 >= table.length) break;
      const word = u16(table, at);
      if ((shifted ? word >> 1 : word) === 0) continue;
      if (out.size >= MAX_MAPPED_CODEPOINTS) return TOO_MANY;
      out.add(cp);
    }
  }
  return null;
}

/**
 * Every code point a format-12 subtable maps, added to `out`.
 *
 * Format 12 is the full-Unicode format: a sorted list of groups, each declaring
 * a start, an end and the first glyph index, with consecutive characters
 * taking consecutive glyphs. A group is therefore a run of mapped characters —
 * the same enumeration, and for the same reason as format 4: a group may
 * declare any range up to U+10FFFF, and the probe this replaced only ever
 * asked about 0x00..0x2FF.
 */
function collectFormat12(table: Uint8Array, out: Set<number>): string | null {
  if (table.length < 16) return "a format 12 subtable is shorter than its header";
  const nGroups = u32(table, 12);
  for (let g = 0; g < nGroups; g += 1) {
    const at = 16 + g * 12;
    if (at + 12 > table.length) return "format 12 is truncated inside its groups";
    const start = u32(table, at);
    const end = u32(table, at + 4);
    if (end < start) continue;
    if (end > 0x10ffff) return "format 12 declares a code point above U+10FFFF";
    // The budget is checked against the group's declared LENGTH, before the
    // loop, so a corrupt end value costs one comparison rather than a million
    // insertions.
    if (end - start + 1 > MAX_MAPPED_CODEPOINTS - out.size) return TOO_MANY;
    for (let cp = start; cp <= end; cp += 1) out.add(cp);
  }
  return null;
}

/** The one refusal both collectors share, so the wording cannot drift. */
const TOO_MANY = `the file declares more than ${MAX_MAPPED_CODEPOINTS.toLocaleString("en-US")} code points, which this reader will not expand`;

/**
 * Every code point a woff2 file can draw, or why it could not be read.
 *
 * The error path is deliberately as carefully written as the success path. A
 * parser that returns an empty set on a file it did not understand would make
 * every family "fail the ő/ű check", which reads as a font problem and is
 * really a parser problem — the worst possible confusion. So it returns
 * `ok: false` with a reason, and the test treats that as a failure to fix rather
 * than as a pass.
 */
export function woff2Codepoints(file: Uint8Array): CmapResult {
  let table: Uint8Array;
  try {
    const found = readDirectory(file).find((t) => t.tag === "cmap");
    if (!found) return { ok: false, reason: "the file has no cmap table" };
    table = found.data;
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }

  try {
    if (table.length < 4) return { ok: false, reason: "the cmap table is truncated" };
    const numTables = u16(table, 2);
    // Prefer format 12 (full Unicode) when the file has one, because it is the
    // authoritative answer; fall back to format 4, which every Latin font has.
    const subtables: { offset: number; format: number }[] = [];
    for (let i = 0; i < numTables; i += 1) {
      const at = 4 + i * 8;
      if (at + 8 > table.length) break;
      const offset = u32(table, at + 4);
      if (offset + 2 > table.length) continue;
      subtables.push({ offset, format: u16(table, offset) });
    }
    const twelve = subtables.filter((s) => s.format === 12);
    const four = subtables.filter((s) => s.format === 4);
    if (twelve.length === 0 && four.length === 0) {
      return {
        ok: false,
        reason: `no format 4 or 12 subtable (found formats ${subtables.map((s) => s.format).join(", ") || "none"})`,
      };
    }

    // Every subtable the file declares, unioned. A font may map a character in
    // one subtable and not in another, and the question this function answers
    // is "what can this file draw", so a character is reported when ANY
    // subtable maps it. Format 12 comes first because where both exist it is
    // the authoritative one — though with a union that only affects the order
    // refusals are discovered in, not the answer.
    const out = new Set<number>();
    for (const s of [...twelve, ...four]) {
      const reason =
        s.format === 12
          ? collectFormat12(table.subarray(s.offset), out)
          : collectFormat4(table.subarray(s.offset), out);
      if (reason) return { ok: false, reason };
    }
    return { ok: true, codepoints: out };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Whether a woff2 file can draw every character in a list.
 *
 * The shape the test wants: a boolean plus, on failure, enough to say why. A
 * parse failure is NOT a pass — it is reported as a failure, because "we could
 * not check" and "the font is fine" must never be the same answer.
 */
export function woff2Covers(
  file: Uint8Array,
  wanted: readonly number[],
): { ok: boolean; missing: number[]; reason?: string } {
  const result = woff2Codepoints(file);
  if (!result.ok) return { ok: false, missing: [...wanted], reason: result.reason };
  const missing = wanted.filter((cp) => !result.codepoints.has(cp));
  return { ok: missing.length === 0, missing };
}
