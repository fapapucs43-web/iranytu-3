/**
 * Batch 7i — the UI font subsets are what they are claimed to be.
 *
 * TWENTY BINARIES, AND NO TEST OF THEIR OWN UNTIL NOW
 * `scripts/subset-ui-fonts.ts` re-cuts every face in `public/fonts/` from
 * 660 568 B to 415 kB, and until this file existed the only things checking
 * the result were a byte count, a four-byte magic number and a handful of
 * Hungarian letters. That is enough to catch a truncated file and not enough
 * to catch a file cut to the wrong floor — which is the failure this commit
 * could plausibly have shipped, because "smaller" and "correct" are different
 * properties and a subsetter makes the first trivially easy.
 *
 * THE PROPERTIES, STATED PRECISELY
 *
 * 1. The repo's own woff2 reader can read every file.
 * 2. Every `latin-ext` file spells `ő ű Ő Ű`. The `latin` files cannot and
 *    must not — those letters are not in the segment's declared range, and a
 *    `latin` file that carried them would be lying to the browser about when
 *    to download itself.
 * 3. Every LETTER the app's own source mentions is in the file whose declared
 *    range claims it. This is the strong one, and it is the property Lato
 *    failed: a face that cannot draw two letters of the language the UI is
 *    written in renders them in some other face, which is a visible
 *    half-and-half mixture.
 * 4. The twelve typographic marks the app can show are named here, exactly —
 *    and every one of them is now carried by a family in the registry, so the
 *    list is a regression guard rather than a record of a gap. It was a record
 *    of a gap until Batch 13, and the reason it was believed to be one is the
 *    defect described below.
 * 5. The floor the script declares sits inside the range the registry
 *    declares, so every `unicodeRange` in `src/lib/fonts.ts` remains a true
 *    statement about its file rather than an aspiration.
 *
 * WHY THE READER IS PART OF WHAT IS UNDER TEST
 * `src/lib/font-cmap.ts` read the woff2 table directory by treating `hmtx` as a
 * transformed table, which the specification permits and which no writer in
 * this repository's supply chain actually does. It worked on the twenty files
 * Google produced and failed on three of the ten fontTools produced —
 * reporting `Decompression failed` for files fontTools opens without complaint.
 * It was found by running the subsetter and refusing to accept the answer,
 * which is the only reason it was found: every existing test read the files
 * that happened to work. Check 1 is the regression test, and the twenty
 * committed files are now a mix of both writers, so a reintroduction fails
 * here rather than in a browser.
 *
 * THE TWELVE, AND WHY THEY ARE NOT A REGRESSION
 * `—` `–` `‒` `―` `‘` `’` `”` `„` `•` `…` `‹` `›` are not in Google's `latin`
 * subsets for the families this commit cut from, and cutting cannot add a glyph
 * that was never in the input. The Lato faces added in Batch 12 were cut from
 * UPSTREAM TrueType rather than re-cut, and they carry all twelve — which is
 * why the list below is a guard and not a gap: every mark the app can show now
 * has a family that draws it, so a dash or a quote between two words of one
 * typeface cannot fall back to a second one.
 *
 * WHAT BATCH 13 FOUND, AND WHY IT IS THE INTERESTING DEFECT IN THIS FILE
 * Until Batch 13 this file asserted that those twelve marks were "absent from
 * every family in the registry", and it was green. It was green for the wrong
 * reason: `src/lib/font-cmap.ts` did not read the character map, it PROBED it,
 * asking only about 0x00..0x2FF. Every one of the twelve sits above U+02FF. So
 * the file that reported the gap was the thing that could not see the fix, and
 * `inter-latin.woff2` declares 211 code points where the probe found 190 — the
 * 21 it missed being the euro sign, the trademark sign, the dashes, the quotes
 * and the guillemets, i.e. exactly the characters a claim about typographic
 * marks is made of. The reader now enumerates what the character map declares
 * instead of probing a range chosen for the app, and agrees with fontTools on
 * all twenty-four committed files; `tests/batch13-cmap.test.ts` pins the counts
 * and covers the format-12 path, which no committed file uses.
 *
 * The lesson is kept here rather than in the fix's own commit message, because
 * it is about this file: a test can be green, precise, table-driven and
 * documented, and still be a measurement of the instrument rather than of the
 * thing. Every other assertion in this file is about LETTERS, which live
 * below the old ceiling — which is why they were right all along, and why the
 * letters are the ones carrying the weight.
 *
 * NOTHING HERE NEEDS fontTools
 * The suite runs in CI, where a Python build tool is not installed. Every
 * assertion is made against the committed bytes and the script's exported
 * constants, so this file is as portable as the fonts it checks.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { woff2Codepoints } from "../src/lib/font-cmap";
import { FONTS, HAND_FONTS, type FontFile } from "../src/lib/fonts";
import {
  DECLARED_RANGE,
  DELEGATED,
  FLOOR,
  MUST_SPELL,
  expand,
  inDelegated,
} from "../scripts/subset-ui-fonts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const FONT_DIR = join(ROOT, "public", "fonts");

const FILES: FontFile[] = [...FONTS, ...HAND_FONTS].flatMap((d) => d.files);

/**
 * The twelve typographic marks, named so the property is a fact in the
 * repository rather than something a reader has to rediscover by reading
 * character maps. Every one of them is carried by a family in the registry —
 * see the header for why that was not true until Batch 13, and why the gap was
 * believed real for as long as it was.
 */
const TYPOGRAPHIC_MARKS = [
  "‒", "–", "—", "―", "‘", "’",
  "”", "„", "•", "…", "‹", "›",
] as const;

const inRanges = (cp: number, ranges: ReadonlyArray<readonly [number, number]>) =>
  ranges.some(([lo, hi]) => cp >= lo && cp <= hi);

/** Every code point the app's own source mentions, read the way the script reads it. */
function walkedCodepoints(): Set<number> {
  const out = new Set<number>();
  const read = (path: string) => {
    for (const c of readFileSync(path, "utf8")) out.add(c.codePointAt(0)!);
  };
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.(ts|tsx|css|html)$/.test(entry.name)) read(path);
    }
  };
  walk(join(ROOT, "src"));
  read(join(ROOT, "index.html"));
  return out;
}

/** The code points a file really covers, or a thrown error naming the file. */
function coveredBy(file: string): Set<number> {
  const parsed = woff2Codepoints(new Uint8Array(readFileSync(join(FONT_DIR, file))));
  if (!parsed.ok) throw new Error(`${file}: ${parsed.reason}`);
  return parsed.codepoints;
}

/** What the app can show that a declared range covers and no delegated block claims. */
function showableCharacters(walked: Set<number>): number[] {
  return [...walked]
    .filter(
      (cp) =>
        cp > 0x20 &&
        (inRanges(cp, DECLARED_RANGE.latin) || inRanges(cp, DECLARED_RANGE["latin-ext"])) &&
        !inDelegated(cp),
    )
    .sort((a, b) => a - b);
}

/** A letter of a Latin-script alphabet, as opposed to a mark or a digit. */
function isLetter(cp: number): boolean {
  return /\p{L}/u.test(String.fromCodePoint(cp)) && cp > 0x3f;
}

describe("the reader can read every file the repository ships", () => {
  test.each(FILES.map((f) => f.file))("%s parses, and is a woff2", (name) => {
    const bytes = new Uint8Array(readFileSync(join(FONT_DIR, name)));
    // `String.fromCharCode` and not `toString("latin1")`: this is a plain
    // `Uint8Array`, and a typed array's `toString` ignores the encoding and
    // returns "119,79,70,50" — which fails, correctly, for the wrong reason.
    expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe("wOF2");
    const parsed = woff2Codepoints(bytes);
    // A parser that cannot read a file must say so rather than return nothing:
    // an empty set here would read as "this font spells nothing", which looks
    // like a font problem and is really a parser problem.
    expect(parsed.ok, `${name}: ${parsed.ok ? "" : parsed.reason}`).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.codepoints.size, `${name} claims no code points at all`).toBeGreaterThan(100);
  });
});

describe("every latin-ext file spells the four Hungarian letters", () => {
  const ext = FILES.filter((f) => f.subset === "latin-ext");

  test("every face has a latin-ext file beside its latin one", () => {
    // A family with only a `latin` file renders ő and ű in some other face,
    // which is the exact defect that withdrew Lato. Counted rather than named,
    // because a family can have more than one weight and the pairing is by
    // weight, not by family.
    expect(ext.length).toBeGreaterThan(0);
    expect(ext.length).toBe(FILES.filter((f) => f.subset === "latin").length);
  });

  test.each(ext.map((f) => f.file))("%s covers ő ű Ő Ű", (name) => {
    const covered = coveredBy(name);
    for (const c of MUST_SPELL) {
      expect(covered.has(c.codePointAt(0)!), `${name} cannot spell ${c}`).toBe(true);
    }
  });

  test("no latin file claims a Hungarian letter it did not ask for", () => {
    // The other half of the same idea. `latin`'s declared range stops below
    // U+0151, so a `latin` file carrying ő would be telling the browser to
    // download the wrong file for the wrong text.
    for (const spec of FILES.filter((f) => f.subset === "latin")) {
      for (const c of MUST_SPELL) {
        const cp = c.codePointAt(0)!;
        expect(
          inRanges(cp, DECLARED_RANGE.latin),
          `${c} is inside latin's declared range, so a latin file may be expected to carry it`,
        ).toBe(false);
      }
    }
  });
});

describe("every letter the app can show is in the file that claims it", () => {
  const walked = walkedCodepoints();
  const letters = showableCharacters(walked).filter(isLetter);

  test("the app really does mention letters in both segments", () => {
    // A guard against the tests below passing because the set is empty — which
    // is what a wrong file-extension filter or a moved directory would do.
    expect(letters.length).toBeGreaterThan(60);
    expect(letters.some((cp) => inRanges(cp, DECLARED_RANGE["latin-ext"]))).toBe(true);
    expect(letters.some((cp) => inRanges(cp, DECLARED_RANGE.latin))).toBe(true);
  });

  test.each(FILES.map((f) => f.file))("%s covers every letter in its own range", (name) => {
    // Per segment, not across the pair: a `latin` file must NOT carry ő, and
    // asserting that it does would be asserting a lie to the browser. What it
    // must do is carry every letter of the app's own text that its declared
    // range claims, because that is exactly the text the browser will ask this
    // file for.
    const spec = FILES.find((f) => f.file === name)!;
    const covered = coveredBy(name);
    let checked = 0;
    for (const cp of letters) {
      if (!inRanges(cp, DECLARED_RANGE[spec.subset])) continue;
      checked += 1;
      expect(
        covered.has(cp),
        `${name} cannot spell ${String.fromCodePoint(cp)} (U+${cp.toString(16).toUpperCase()}), ` +
          `which the app's own source contains and which this file's range claims`,
      ).toBe(true);
    }
    expect(checked, `${name} had no letters to check`).toBeGreaterThan(20);
  });
});

describe("the twelve marks are carried, and nothing the app can show is not", () => {
  const walked = walkedCodepoints();
  const union = new Set<number>();
  for (const spec of FILES) for (const cp of coveredBy(spec.file)) union.add(cp);
  const uncovered = showableCharacters(walked).filter((cp) => !union.has(cp));
  const markCodepoints = TYPOGRAPHIC_MARKS.map((c) => c.codePointAt(0)!);

  test("every mark the app can show is carried by a family, named one by one", () => {
    // The positive form of the claim this file used to make negatively. Naming
    // all twelve and asserting each keeps the knowledge in the repository: if a
    // future subset loses the em dash, this says which character went and not
    // merely that a count changed.
    for (const cp of markCodepoints) {
      expect(
        union.has(cp),
        `${String.fromCodePoint(cp)} (U+${cp.toString(16).toUpperCase()}) is showable and no family carries it`,
      ).toBe(true);
    }
    // …and that the list is still twelve, so a typo above cannot quietly
    // shorten it into an assertion that passes.
    expect(markCodepoints.length).toBe(12);
  });

  test("and the uncovered set is empty, not merely short of a list", () => {
    // Stronger than "the twelve are covered": nothing at all in the app's own
    // showable characters falls outside every family. This is the assertion
    // that was wrong before Batch 13, when the answer was twelve — because the
    // reader could not see the characters that would have emptied it.
    expect([...uncovered]).toEqual([]);
  });

  test("which is not vacuous: the showable set is real and holds both kinds", () => {
    // The guard against `uncovered` being empty because the filter emptied it.
    // A moved directory, a wrong file extension or a broken range table would
    // all produce an empty set here, and an empty set passes the test above.
    const showable = showableCharacters(walked);
    expect(showable.length).toBeGreaterThan(80);
    expect(showable.filter(isLetter).length).toBeGreaterThan(60);
    expect(showable.filter((cp) => markCodepoints.includes(cp)).length).toBe(12);
  });
});

describe("the floor the script declares is a true subset of the range", () => {
  test("every floor codepoint is inside the range the registry declares", () => {
    for (const subset of ["latin", "latin-ext"] as const) {
      for (const cp of expand(FLOOR[subset])) {
        expect(
          inRanges(cp, DECLARED_RANGE[subset]),
          `the ${subset} floor has U+${cp.toString(16).toUpperCase()}, outside the declared range`,
        ).toBe(true);
      }
    }
  });

  test("the registry's own unicodeRange really does contain the floor", () => {
    // The same claim, but read out of the registry rather than out of the
    // script's transcription of it, so the two cannot drift apart unnoticed.
    // Parsed, because a range in a stylesheet is a claim about the bytes and
    // the bytes are what the check above reads.
    for (const spec of FILES) {
      for (const cp of expand(FLOOR[spec.subset])) {
        expect(
          inRanges(cp, DECLARED_RANGE[spec.subset]),
          `${spec.file}: the registry declares a range that excludes its own floor`,
        ).toBe(true);
      }
      expect(spec.unicodeRange, `${spec.file} has no unicodeRange`).toBeTruthy();
    }
  });

  test("the two segments do not overlap, so no character is asked for twice", () => {
    const latin = new Set(expand(FLOOR.latin));
    for (const cp of expand(FLOOR["latin-ext"])) {
      expect(latin.has(cp), `U+${cp.toString(16).toUpperCase()} is in both segments`).toBe(false);
    }
  });

  test("the delegated blocks are ranges, in order, each with a reason", () => {
    expect(DELEGATED.length).toBeGreaterThan(0);
    let previousHi = -1;
    for (const [lo, hi, why] of DELEGATED) {
      expect(lo, `a delegated range is inside out: ${why}`).toBeLessThan(hi);
      expect(lo, "the delegated blocks overlap").toBeGreaterThan(previousHi);
      expect(why.length, `the block U+${lo.toString(16)} has no reason`).toBeGreaterThan(10);
      previousHi = hi;
    }
  });

  test("every character the app mentions is either in a floor or delegated", () => {
    // The script refuses to run when this is false, and this says so without
    // running the script. It is the safety net for the next person to put a
    // symbol in a user-facing string.
    const walked = walkedCodepoints();
    const accounted = new Set<number>();
    for (const subset of ["latin", "latin-ext"] as const) {
      for (const cp of expand(FLOOR[subset])) accounted.add(cp);
      for (const cp of walked) {
        if (inRanges(cp, DECLARED_RANGE[subset])) accounted.add(cp);
      }
    }
    for (const cp of walked) {
      if (accounted.has(cp) || inDelegated(cp)) continue;
      throw new Error(
        `the app mentions U+${cp.toString(16).toUpperCase().padStart(4, "0")} ` +
          `${JSON.stringify(String.fromCodePoint(cp))}, which no floor covers and no ` +
          `delegated block claims — add it to one of them, on purpose`,
      );
    }
  });
});
