/**
 * Batch 13, commit 1 — the character-map reader tells the truth.
 *
 * THE DEFECT, in one sentence: `woff2Codepoints` did not read a font's `cmap`,
 * it PROBED it, asking "does this file cover code point N?" for every N in
 * 0x00..0x2FF, so every character above U+02FF was invisible to it — and
 * `inter-latin.woff2` declares 211 code points where the probe found 190.
 *
 * WHY 0x2FF IS THE WRONG CEILING, which is the part worth remembering: it is
 * not an arbitrary number, it is a *sensible* one. 0x2FF is Latin, Latin-1
 * Supplement and Latin Extended-A, which is where ő (U+0151) and ű (U+0171)
 * live, so the range was chosen for the APP rather than for the FONT. The
 * twenty-one characters it hid are the euro sign, the trademark sign, the en
 * and em dashes, every quote this repository's UI uses, the bullet, the
 * ellipsis, the guillemets, the primes, the fraction slash and the minus sign —
 * that is, precisely the characters a claim about typographic marks is made of.
 * Which is how `tests/batch7i-ui-fonts.test.ts` came to assert, in green, for
 * two generations of the repository, that no family carries the em dash.
 *
 * THE FIX is to enumerate what the subtables DECLARE rather than to ask about a
 * range chosen here. Both character-map formats are lists of ranges: format 12
 * is a list of groups, format 4 a list of segments, and walking them is exact.
 * A higher ceiling would have been the same mistake with a different constant,
 * and would be wrong again the first time a font declared a character nobody
 * thought to include.
 *
 * THE COUNTS BELOW ARE CROSS-CHECKED, and CI does not need the cross-check.
 * Every entry in PINNED was produced by reading each committed file with
 * fontTools' `getBestCmap` and confirming this reader returns the same number —
 * 24 files, 24 agreements, including the 211 above. fontTools is a Python
 * build tool and is not installed in CI, so the numbers are written down here
 * instead, which is also what makes them a pin: a subsetter that re-cut a file
 * differently would fail this file rather than silently change what the
 * repository believes about its own fonts.
 *
 * WHY THE SYNTHETIC FONTS ARE HERE, and which paths they are for. All 24
 * committed files are format 4 — Google and fontTools both emit that for a Latin
 * subset — and all 24 use the `glyphIdArray` addressing, so the counts above pin
 * both the arithmetic-run path and the array path, hard. Two paths have no
 * committed file at all: format 12, which is the full-Unicode format a
 * CJK-capable writer emits, and an ODD `idRangeOffset`, which the specification
 * defines as a glyph index stored shifted left by one bit. A parser can be
 * perfect on the twenty-four files in the repository and still be wrong on a
 * font that uses either, and no test that only reads committed files could ever
 * notice. So the fonts below are built byte by byte, which is also the only way
 * to reach the refusal path: a format-12 group may declare any range up to
 * U+10FFFF, and a corrupt end value asks for 1.1M insertions. The reader
 * refuses with a reason rather than allocating them — the failure mode its own
 * header asks for, and one no real file in this repository can provoke.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync } from "node:zlib";

import { woff2Covers, woff2Codepoints } from "../src/lib/font-cmap";
import { FONTS, HAND_FONTS } from "../src/lib/fonts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const FONT_DIR = join(ROOT, "public", "fonts");

/** Every code point a committed file declares, as fontTools also reports it. */
const PINNED: Record<string, number> = {
  "dancing-script-latin-ext.woff2": 125,
  "dancing-script-latin.woff2": 208,
  "inter-latin-ext.woff2": 125,
  "inter-latin.woff2": 211,
  "jetbrains-mono-latin-ext.woff2": 124,
  "jetbrains-mono-latin.woff2": 210,
  "lato-400-latin-ext.woff2": 129,
  "lato-400-latin.woff2": 244,
  "lato-700-latin-ext.woff2": 129,
  "lato-700-latin.woff2": 244,
  "lora-latin-ext.woff2": 125,
  "lora-latin.woff2": 209,
  "montserrat-latin-ext.woff2": 126,
  "montserrat-latin.woff2": 211,
  "playfair-display-latin-ext.woff2": 126,
  "playfair-display-latin.woff2": 210,
  "quicksand-latin-ext.woff2": 125,
  "quicksand-latin.woff2": 211,
  "roboto-latin-ext.woff2": 126,
  "roboto-latin.woff2": 213,
  "saira-condensed-400-latin-ext.woff2": 126,
  "saira-condensed-400-latin.woff2": 211,
  "saira-condensed-700-latin-ext.woff2": 126,
  "saira-condensed-700-latin.woff2": 211,
};

/**
 * The twenty-one code points `inter-latin.woff2` declares above the old
 * ceiling, named. 190 + 21 is the 211, so this list and that number are the
 * same fact stated two ways — and the difference between them is the defect.
 */
const ABOVE_THE_OLD_CEILING: ReadonlyArray<readonly [number, string]> = [
  [0x2002, "EN SPACE"],
  [0x2009, "THIN SPACE"],
  [0x200b, "ZERO WIDTH SPACE"],
  [0x2013, "EN DASH"],
  [0x2014, "EM DASH"],
  [0x2018, "LEFT SINGLE QUOTATION MARK"],
  [0x2019, "RIGHT SINGLE QUOTATION MARK"],
  [0x201a, "SINGLE LOW-9 QUOTATION MARK"],
  [0x201c, "LEFT DOUBLE QUOTATION MARK"],
  [0x201d, "RIGHT DOUBLE QUOTATION MARK"],
  [0x201e, "DOUBLE LOW-9 QUOTATION MARK"],
  [0x2022, "BULLET"],
  [0x2026, "HORIZONTAL ELLIPSIS"],
  [0x2032, "PRIME"],
  [0x2033, "DOUBLE PRIME"],
  [0x2039, "SINGLE LEFT-POINTING ANGLE QUOTATION MARK"],
  [0x203a, "SINGLE RIGHT-POINTING ANGLE QUOTATION MARK"],
  [0x2044, "FRACTION SLASH"],
  [0x20ac, "EURO SIGN"],
  [0x2122, "TRADE MARK"],
  [0x2212, "MINUS SIGN"],
];

/** The characters the reader's original purpose was serving, still served. */
const HUNGARIAN = ["ő", "ű", "Ő", "Ű"] as const;

const codepointsOf = (file: string): Set<number> => {
  const parsed = woff2Codepoints(new Uint8Array(readFileSync(join(FONT_DIR, file))));
  if (!parsed.ok) throw new Error(`${file}: ${parsed.reason}`);
  return parsed.codepoints;
};

describe("the reader reports the map the font declares, not the one it guessed", () => {
  test("inter-latin.woff2 declares 211 code points, and no longer 190", () => {
    const covered = codepointsOf("inter-latin.woff2");
    // Both numbers, deliberately. 211 alone would pass against a reader that
    // happened to overshoot; 190 is the exact value the probe returned, so
    // naming it makes the regression a one-character edit to catch.
    expect(covered.size).toBe(211);
    expect(covered.size).not.toBe(190);
  });

  test("and the twenty-one it could not see are the ones above U+02FF", () => {
    // The difference between the old answer and the true one, named. If a
    // future change to the reader costs a single one of these, the message says
    // which character and what it is called.
    const covered = codepointsOf("inter-latin.woff2");
    const above = [...covered].filter((cp) => cp > 0x2ff).sort((a, b) => a - b);
    expect(above.length).toBe(21);
    expect(above).toEqual(ABOVE_THE_OLD_CEILING.map(([cp]) => cp));
    for (const [cp, name] of ABOVE_THE_OLD_CEILING) {
      expect(covered.has(cp), `inter-latin.woff2 does not report ${name}`).toBe(true);
    }
  });

  test("€ and ™ are reported, by name", () => {
    // The two the audit singled out, asserted on their own so a failure reads as
    // "the euro sign is missing" rather than as a count.
    const covered = codepointsOf("inter-latin.woff2");
    expect(covered.has(0x20ac), "EURO SIGN is missing").toBe(true);
    expect(covered.has(0x2122), "TRADE MARK is missing").toBe(true);
  });

  test("the Latin letters the app is written in are still all there", () => {
    // The ceiling was removed; nothing may have been lost with it. If the
    // enumeration ever dropped the arithmetic-run path, this is the test that
    // would notice. The four double-acute letters are asserted on the
    // `latin-ext` file below rather than here, because a `latin` file that
    // carried ő would be lying to the browser about when to download itself —
    // that split is the property `tests/batch7i-ui-fonts.test.ts` pins.
    const covered = codepointsOf("inter-latin.woff2");
    for (const letter of "AaZzÁáÉéÍíÓóÖöÚúÜü") {
      expect(covered.has(letter.codePointAt(0)!), `inter-latin.woff2 lost ${letter}`).toBe(true);
    }
  });

  test("and the four Hungarian letters are in the latin-ext file", () => {
    const covered = codepointsOf("inter-latin-ext.woff2");
    for (const letter of HUNGARIAN) {
      expect(covered.has(letter.codePointAt(0)!), `inter-latin-ext.woff2 lost ${letter}`).toBe(true);
    }
  });
});

describe("every committed font's count is pinned", () => {
  test("the pin covers exactly the files the registry ships", () => {
    // Otherwise a new family could be added and simply not be pinned, and the
    // table below would keep passing while asserting less than it appears to.
    const registered = [...FONTS, ...HAND_FONTS].flatMap((d) => d.files.map((f) => f.file));
    const onDisk = readdirSync(FONT_DIR).filter((n) => n.endsWith(".woff2"));
    expect(Object.keys(PINNED).sort()).toEqual(onDisk.sort());
    expect(registered.sort()).toEqual(onDisk.sort());
  });

  // A tuple, not a bare name: `test.each` with one string per row binds a single
  // argument, so the second parameter would be `undefined` and every row would
  // assert nothing.
  test.each(Object.keys(PINNED).sort().map((name) => [name, PINNED[name]] as const))(
    "%s declares exactly %i",
    (name, count) => {
      const covered = codepointsOf(name);
      expect(covered.size).toBe(count);
    },
  );

  test("and every file still spells the four Hungarian letters in latin-ext", () => {
    // The promise the module was written for, restated after the rewrite: the
    // fix must not have cost the one property the module exists to protect.
    const ext = [...FONTS, ...HAND_FONTS]
      .flatMap((d) => d.files)
      .filter((f) => f.subset === "latin-ext")
      .map((f) => f.file);
    expect(ext.length).toBeGreaterThan(0);
    for (const name of ext) {
      const bytes = new Uint8Array(readFileSync(join(FONT_DIR, name)));
      const result = woff2Covers(bytes, HUNGARIAN.map((c) => c.codePointAt(0)!));
      expect(result.ok, `${name}: ${result.reason ?? result.missing.join(", ")}`).toBe(true);
    }
  });
});

/* ------------------------- synthetic fonts ------------------------- */

/**
 * A woff2 file containing one `cmap` table, built from the bytes up.
 *
 * The minimum the reader needs: the 48-byte header, one directory entry whose
 * tag index 0 is `cmap` and whose length is a UIntBase128, and a Brotli stream
 * holding the table. `transformVersion` 0 on a `cmap` entry is not a lie —
 * `cmap` is never one of the four transformable tables, and the reader's own
 * `TRANSFORMED_TAGS` set says so.
 */
function synthWoff2(cmap: Uint8Array): Uint8Array {
  const compressed = new Uint8Array(brotliCompressSync(cmap));
  const out = new Uint8Array(48 + 1 + 5 + compressed.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x774f4632); // 'wOF2'
  view.setUint32(4, 0x00010000); // flavor: TrueType outlines
  view.setUint32(8, out.length);
  view.setUint16(12, 1); // numTables
  view.setUint16(14, 0); // reserved
  view.setUint32(20, compressed.length); // totalCompressedSize
  view.setUint16(24, 1); // majorVersion
  view.setUint16(26, 0); // minorVersion
  let at = 48;
  out[at] = 0x00; // flags: tagIndex 0 (`cmap`), transformVersion 0
  at += 1;
  at = writeBase128(out, at, cmap.length);
  out.set(compressed, at);
  return out;
}

/** woff2's UIntBase128: seven bits per byte, high bit set on all but the last. */
function writeBase128(out: Uint8Array, at: number, value: number): number {
  const groups: number[] = [];
  let rest = value;
  do {
    groups.unshift(rest & 0x7f);
    rest = Math.floor(rest / 128);
  } while (rest > 0);
  groups.forEach((g, i) => {
    out[at + i] = i === groups.length - 1 ? g : g | 0x80;
  });
  return at + groups.length;
}

/**
 * A `cmap` table wrapping one subtable, as a Windows/UCS-4 record.
 *
 * Every multi-byte field written below is BIG-endian, which is what the sfnt
 * specification requires — and what `DataView` does by default, so the third
 * argument is left off throughout. That default is the one trap in building
 * these bytes by hand: reading a `Uint8Array` back the way a JavaScript
 * `DataView` *could* be told to write it gives the byte-swapped number, which is
 * how the assertion at the end of this function first failed. It is kept as an
 * assertion on purpose: a helper that quietly built a wrong font would make
 * every test below it meaningless, and this is the line that says so.
 */
function cmapWith(subtable: Uint8Array, format: number): Uint8Array {
  const table = new Uint8Array(4 + 8 + subtable.length);
  const view = new DataView(table.buffer);
  view.setUint16(0, 0); // version
  view.setUint16(2, 1); // numTables
  view.setUint16(4, 3); // platformID: Windows
  view.setUint16(6, 10); // encodingID: UCS-4
  view.setUint32(8, 12); // offset of the subtable
  table.set(subtable, 12);
  expect(((subtable[0] ?? 0) << 8) | (subtable[1] ?? 0)).toBe(format);
  return table;
}

/** A format-12 subtable: a header plus one 12-byte group per range. */
function format12(groups: ReadonlyArray<readonly [number, number]>): Uint8Array {
  const length = 16 + groups.length * 12;
  const out = new Uint8Array(length);
  const view = new DataView(out.buffer);
  view.setUint16(0, 12); // format
  view.setUint16(2, 0); // reserved
  view.setUint32(4, length);
  view.setUint32(8, 0); // language
  view.setUint32(12, groups.length);
  groups.forEach(([start, end], g) => {
    const at = 16 + g * 12;
    view.setUint32(at, start);
    view.setUint32(at + 4, end);
    view.setUint32(at + 8, 1); // startGlyphID
  });
  return out;
}

describe("format 12, which no committed font uses", () => {
  test("its groups are enumerated, including one above the old ceiling", () => {
    // If this file could only report what 0x00..0x2FF holds, the answer here
    // would be 28 and the euro sign would be missing — the same defect as the
    // one this commit fixed, on the path no committed file reaches.
    const font = synthWoff2(cmapWith(format12([[0x41, 0x5a], [0x151, 0x151], [0x171, 0x171], [0x20ac, 0x20ac]]), 12));
    const parsed = woff2Codepoints(font);
    expect(parsed.ok, parsed.ok ? "" : parsed.reason).toBe(true);
    if (!parsed.ok) return;
    const covered = parsed.codepoints;
    expect(covered.size).toBe(29);
    expect(covered.has(0x151)).toBe(true); // ő
    expect(covered.has(0x171)).toBe(true); // ű
    expect(covered.has(0x20ac)).toBe(true); // €
    for (let cp = 0x41; cp <= 0x5a; cp += 1) expect(covered.has(cp)).toBe(true);
  });

  test("a group that declares more than the reader will expand is refused", () => {
    // The header's own promise: a parser that returns a confident wrong answer
    // is worse than one that refuses. A format-12 group may declare up to
    // U+10FFFF, so a corrupt end value asks for 1.1M insertions. The refusal
    // costs one comparison, because the group's declared LENGTH is checked
    // before the loop rather than while it runs.
    const font = synthWoff2(cmapWith(format12([[0x20, 0x10ffff]]), 12));
    const parsed = woff2Codepoints(font);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reason).toMatch(/more than .* code points/);
  });

  test("and the refusal is not a crash, and not an empty answer", () => {
    // Both of the wrong answers a limit can produce, asserted because either
    // one would read downstream as "this font spells nothing".
    const font = synthWoff2(cmapWith(format12([[0x20, 0x10ffff]]), 12));
    const parsed = woff2Codepoints(font);
    expect(() => woff2Codepoints(font)).not.toThrow();
    expect(parsed).not.toHaveProperty("codepoints");
  });
});

/**
 * Two segments: U+0041 through the arithmetic run, and U+0042 through
 * `glyphIdArray` with an ODD `idRangeOffset` — the specification's "the stored
 * value is a glyph index shifted left by one bit" case, which no writer in this
 * repository's supply chain emits and therefore no committed file can test.
 *
 * `storedWord` is the 16-bit value the reader will find at the addressed byte,
 * BEFORE the shift. Build it as the specification does: a writer storing glyph
 * index N in the odd form writes `N << 1`.
 */
function format4OddOffset(storedWord: number): Uint8Array {
  const length = 36; // 16-byte header + two entries per array + room for the word
  const out = new Uint8Array(length);
  const view = new DataView(out.buffer);
  view.setUint16(0, 4); // format
  view.setUint16(2, length);
  view.setUint16(4, 0); // language
  view.setUint16(6, 4); // segCountX2 — two segments
  view.setUint16(8, 4); // searchRange
  view.setUint16(10, 1); // entrySelector
  view.setUint16(12, 0); // rangeShift
  view.setUint16(14, 0x41); // endCode[0]
  view.setUint16(16, 0x42); // endCode[1]
  view.setUint16(18, 0); // reservedPad
  view.setUint16(20, 0x41); // startCode[0]
  view.setUint16(22, 0x42); // startCode[1]
  view.setUint16(24, 0); // idDelta[0]
  view.setUint16(26, 0); // idDelta[1]
  view.setUint16(28, 0); // idRangeOffset[0] — the arithmetic path
  view.setUint16(30, 3); // idRangeOffset[1] — ODD
  // Segment 1's idRangeOffset entry is at byte 30, so the reader addresses byte
  // 33. Padding to 36 keeps that address, and the byte after it, inside the
  // table — the reader stops a segment at the end of the array rather than
  // reading past it, and a synthetic that ran off the end would test the bounds
  // check instead of the shift.
  view.setUint16(33, storedWord);
  return out;
}

const oddOffsetFont = (storedWord: number): Uint8Array =>
  synthWoff2(cmapWith(format4OddOffset(storedWord), 4));

describe("an odd idRangeOffset, which no committed font uses", () => {
  test("a stored glyph index of 3 is found, so the odd path is walked", () => {
    // 3 << 1 = 6, so the bytes carry 0x0006 and the reader must shift it back.
    const parsed = woff2Codepoints(oddOffsetFont(0x0006));
    expect(parsed.ok, parsed.ok ? "" : parsed.reason).toBe(true);
    if (!parsed.ok) return;
    expect([...parsed.codepoints].sort((a, b) => a - b)).toEqual([0x41, 0x42]);
  });

  test("and a stored value of 1 means .notdef, because 1 >> 1 is 0", () => {
    // THE assertion that discriminates. A reader that forgot the shift would
    // read 1 as glyph 1 and report U+0042, so this one case fails if the rule is
    // dropped — while the test above, which stores 6, would pass either way,
    // because 6 and 3 are both non-zero. The two together are the difference
    // between testing that the path runs and testing that it runs CORRECTLY.
    const parsed = woff2Codepoints(oddOffsetFont(0x0001));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect([...parsed.codepoints].sort((a, b) => a - b)).toEqual([0x41]);
  });

  test("and a stored value of 0 is .notdef, reported as nothing", () => {
    const parsed = woff2Codepoints(oddOffsetFont(0x0000));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect([...parsed.codepoints].sort((a, b) => a - b)).toEqual([0x41]);
  });
});

describe("the error paths still refuse rather than answer", () => {
  test("a file that is not a woff2 says so", () => {
    const notAFont = new Uint8Array(64);
    const parsed = woff2Codepoints(notAFont);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reason).toMatch(/not a woff2/);
  });

  test("a file shorter than a header says so", () => {
    const parsed = woff2Codepoints(new Uint8Array(8));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reason).toMatch(/shorter than a woff2 header/);
  });

  test("a woff2 with no cmap table says so", () => {
    // A directory of one `head` table, which is tag index 1. Decompresses
    // cleanly and has nothing this reader is looking for, which is a different
    // failure from "the file is broken" and worth its own message.
    const compressed = new Uint8Array(brotliCompressSync(new Uint8Array([0, 1, 0, 0])));
    const out = new Uint8Array(48 + 2 + compressed.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, 0x774f4632);
    view.setUint16(12, 1);
    view.setUint32(20, compressed.length);
    out[48] = 0x01; // tagIndex 1 == `head`
    out[49] = 4; // length
    out.set(compressed, 50);
    const parsed = woff2Codepoints(out);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reason).toMatch(/no cmap table/);
  });

  test("a cmap with no subtable this reader knows says which formats it found", () => {
    // Format 6 is a trimmed table a symbol font can carry. The reader does not
    // implement it, and the only honest thing to do is name what it found —
    // an answer of "this font spells nothing" would read as a font problem.
    const sub = new Uint8Array(10);
    new DataView(sub.buffer).setUint16(0, 6);
    const parsed = woff2Codepoints(synthWoff2(cmapWith(sub, 6)));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reason).toMatch(/no format 4 or 12 subtable \(found formats 6\)/);
  });
});
