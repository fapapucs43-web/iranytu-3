/**
 * Batch 12 (the final wrap-up batch), commit 4 — Lato comes back.
 *
 * WHY IT WENT AWAY AND WHY IT IS BACK, in one paragraph each.
 * It went away in Batch 7f because the file the app shipped could not spell
 * ő or ű: Google's `latin-ext` of Lato is the Central-European cut
 * (`ĄąĆćĘęŁłŃńŚśŠšŸŹźŻżŽžƒ`), and a subset cannot bring back a glyph the input
 * never had. It is back now because `scripts/subset-ui-fonts.ts` cuts it from the
 * UPSTREAM TrueType instead, pinned by URL, byte count and SHA-256 — and because
 * the floor that script cuts to contains ő, ű, Ő and Ű, so a Lato produced this
 * way spells Hungarian by construction.
 *
 * WHAT THIS FILE PROVES, and why each block is here:
 *  - the pin is a real pin (URL, size, 64-hex digest), because the whole claim
 *    rests on cutting from a specific file rather than from "some Lato";
 *  - the four committed binaries are woff2, non-trivial, and their registry
 *    byte counts are the bytes on disk;
 *  - BOTH `latin-ext` files spell all four Hungarian letters, per weight — this
 *    is the test that failed for four batches, in the other direction;
 *  - "Tűnődöm az őszön." is covered character by character, and the two double-
 *    accented vowels come from the `latin-ext` file, which is the file the
 *    browser will actually ask for, because latin's declared range stops below
 *    U+0151. A file that carried ő in `latin` would be lying to the browser;
 *  - the FontFace descriptors route each subset to the right URL and range, so
 *    the picker draws Lato's own sample rather than the fallback;
 *  - Lato is NOT on the background preload list, so a user who never opens the
 *    picker pays nothing for 88 kB of font;
 *  - the retirement is really over: the id resolves, the family is on disk, its
 *    licence ships, and the one-time announcement no longer mentions it.
 *
 * THE UPSTREAM CHECK IS NOT IN HERE, and cannot be. This suite runs in CI
 * without network access, so "the pinned URL still serves those bytes" is not a
 * test — it is a manual verification, done for this commit on 2026-09-29 (both
 * files: HTTP 200, 656 568 B and 656 544 B, both SHA-256 digests matching the
 * table below exactly). What IS testable, and is tested, is that the table is
 * shaped like a pin and that the digests are well formed, so a future edit that
 * softens it to a bare URL fails here.
 *
 * A KNOWN LIMITATION OF THE READER, so this file is not read as stronger than
 * it is. `src/lib/font-cmap.ts` under-reports: asked about
 * `public/fonts/inter-latin.woff2` it returns 190 code points where the file
 * really carries 211 (it misses €, ™ and ten of the twelve typographic marks),
 * and it does the same for the Lato files. Every assertion below is about
 * LETTERS, which it reports correctly — the four Hungarian vowels, and every
 * character of the test sentence. The under-reporting is a real defect in the
 * reader and is not fixed here; it is a separate piece of work.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { woff2Codepoints } from "../src/lib/font-cmap";
import {
  FONTS,
  PRELOAD_FONT_IDS,
  RETIRED_FONT_LABELS,
  RETIRED_FONT_REASONS,
  RETIRED_FONTS,
  fontFaceDescriptors,
  fontWeightKb,
  isFontId,
  normalizeFontFamily,
  preloadHref,
  preloadTotalBytes,
} from "../src/lib/fonts";
import { UPSTREAM_TTF, stemOf } from "../scripts/subset-ui-fonts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const FONT_DIR = join(ROOT, "public", "fonts");

const LATO = FONTS.find((f) => f.id === "lato");
const LATO_FILES = LATO?.files ?? [];
/** The four letters the whole episode was about. */
const HUNGARIAN = ["ő", "ű", "Ő", "Ű"] as const;

function codepoints(file: string): Set<number> {
  const parsed = woff2Codepoints(new Uint8Array(readFileSync(join(FONT_DIR, file))));
  if (!parsed.ok) throw new Error(`${file}: ${parsed.reason}`);
  return parsed.codepoints;
}

describe("the upstream pin is a pin", () => {
  test("two stems, each with a URL, a size and a 64-hex digest", () => {
    const stems = Object.keys(UPSTREAM_TTF).filter((s) => s.startsWith("lato")).sort();
    expect(stems).toEqual(["lato-400", "lato-700"]);
    for (const stem of stems) {
      const pin = UPSTREAM_TTF[stem]!;
      expect(pin.url).toMatch(/^https:\/\/raw\.githubusercontent\.com\/google\/fonts\//);
      expect(pin.url.endsWith(".ttf"), `${stem} is not pinned to a TrueType`).toBe(true);
      expect(pin.bytes).toBeGreaterThan(100_000);
      expect(pin.sha256, `${stem} has no digest`).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  test("the two digests differ, so the two cuts cannot be the same file", () => {
    // A copy-paste error here would quietly make the Bold file Regular.
    expect(UPSTREAM_TTF["lato-400"]!.sha256).not.toBe(UPSTREAM_TTF["lato-700"]!.sha256);
    expect(UPSTREAM_TTF["lato-400"]!.bytes).not.toBe(UPSTREAM_TTF["lato-700"]!.bytes);
  });

  test("every Lato file on disk is one this table owns", () => {
    for (const file of LATO_FILES) {
      const stem = stemOf(file.file);
      expect(stem, `${file.file} is not claimed by a pinned upstream`).not.toBeNull();
      expect(UPSTREAM_TTF[stem!]).toBeDefined();
    }
  });
});

describe("the four binaries", () => {
  test("all four exist, are woff2, and are the size the registry promises", () => {
    expect(LATO_FILES.map((f) => f.file).sort()).toEqual([
      "lato-400-latin-ext.woff2",
      "lato-400-latin.woff2",
      "lato-700-latin-ext.woff2",
      "lato-700-latin.woff2",
    ]);
    for (const file of LATO_FILES) {
      const path = join(FONT_DIR, file.file);
      expect(existsSync(path), `${file.file} is not on disk`).toBe(true);
      const bytes = readFileSync(path);
      expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe("wOF2");
      expect(bytes.length, `${file.file} is a stub`).toBeGreaterThan(10_000);
      // The picker shows this number to the user; it has to be the real one.
      expect(file.bytes, `${file.file}: the registry's size has drifted`).toBe(bytes.length);
    }
  });

  test("both weights are declared as static files, not a variable axis", () => {
    // Lato ships Regular and Bold as separate TrueType cuts and has no variable
    // version, so the family declares no axis and each file carries its own
    // weight. Getting this wrong makes every heading a synthesised fake bold.
    expect(LATO?.weightRange, "a static family must not declare a weight axis").toBe("");
    expect(LATO_FILES.filter((f) => f.subset === "latin").map((f) => f.weight).sort()).toEqual([
      "400",
      "700 800",
    ]);
  });

  test("every latin-ext file spells ő ű Ő Ű, at both weights", () => {
    for (const file of LATO_FILES.filter((f) => f.subset === "latin-ext")) {
      const covered = codepoints(file.file);
      for (const letter of HUNGARIAN) {
        expect(covered.has(letter.codePointAt(0)!), `${file.file} cannot spell ${letter}`).toBe(true);
      }
    }
  });

  test("and the latin files correctly do NOT carry them", () => {
    // The other half of the routing. A `latin` file holding ő would be telling
    // the browser to download the wrong file for the wrong text.
    for (const file of LATO_FILES.filter((f) => f.subset === "latin")) {
      const covered = codepoints(file.file);
      for (const letter of HUNGARIAN) {
        expect(covered.has(letter.codePointAt(0)!), `${file.file} claims ${letter}, which is not its range`).toBe(
          false,
        );
      }
    }
  });
});

describe("Tűnődöm az őszön.", () => {
  const SENTENCE = "Tűnődöm az őszön.";

  test("the sentence is the one this file claims to prove", () => {
    // A guard against the string being edited down to something easy.
    expect(SENTENCE).toContain("ű");
    expect(SENTENCE).toContain("ő");
    expect(SENTENCE).toContain("ö");
  });

  test.each([
    ["400", "lato-400-latin.woff2", "lato-400-latin-ext.woff2"],
    ["700", "lato-700-latin.woff2", "lato-700-latin-ext.woff2"],
  ])("at weight %s every character resolves, in the file its range claims", (_weight, latin, ext) => {
    const inLatin = codepoints(latin);
    const inExt = codepoints(ext);
    for (const character of SENTENCE) {
      const cp = character.codePointAt(0)!;
      const resolved = inLatin.has(cp) ? latin : inExt.has(cp) ? ext : null;
      expect(resolved, `"${character}" (U+${cp.toString(16).toUpperCase()}) is in neither file`).not.toBeNull();
    }
    // The double-accented vowels are the two that have to come from `latin-ext`,
    // because U+0151 and U+0171 sit outside the range a `latin` file declares.
    for (const character of ["ő", "ű"]) {
      const cp = character.codePointAt(0)!;
      expect(inLatin.has(cp), `${character} came from the latin file`).toBe(false);
      expect(inExt.has(cp), `${character} is missing from ${ext}`).toBe(true);
    }
  });
});

describe("the picker and the browser agree about Lato", () => {
  test("it is offered once, in the sans band, with a family name", () => {
    expect(FONTS.filter((f) => f.id === "lato")).toHaveLength(1);
    expect(LATO?.family).toBe("Lato");
    expect(LATO?.category).toBe("sans");
    expect(LATO?.stack).toContain(`"Lato"`);
    // Every stack ends in a real fallback, so a failed download is a fallback
    // rather than an unstyled document.
    expect(LATO?.stack).toContain("sans-serif");
  });

  test("four FontFace descriptors, each with the right URL, range and weight", () => {
    const descriptors = fontFaceDescriptors("lato");
    expect(descriptors).toHaveLength(4);
    for (const d of descriptors) {
      expect(d.family).toBe("Lato");
      expect(d.src).toMatch(/^url\("\/fonts\/lato-(400|700)-latin(-ext)?\.woff2"\) format\("woff2"\)$/);
      // The range is what makes the browser ask for the right file: the ext
      // range must cover U+0151, the latin one must not.
      if (d.src.includes("latin-ext")) {
        expect(d.unicodeRange).toContain("U+0100-02BA");
        expect(d.weight).toMatch(/^(400|700 800)$/);
      } else {
        expect(d.unicodeRange).not.toContain("U+0100-02BA");
        expect(d.weight).toMatch(/^(400|700 800)$/);
      }
    }
  });

  test("hovering it in the picker preloads exactly one file, the 400 latin one", () => {
    // The picker loads on hover or focus, and preloading `latin-ext` would
    // double the cost to fix two letters.
    expect(preloadHref("lato")).toBe("/fonts/lato-400-latin.woff2");
  });
});

describe("nobody pays for it who does not want it", () => {
  test("Lato is not on the background preload list", () => {
    // The same reasoning that took Saira Condensed off the list: the preload is
    // background traffic a user who never opens the picker would pay for.
    expect(PRELOAD_FONT_IDS).not.toContain("lato");
    expect(preloadTotalBytes()).toBeLessThanOrEqual(250 * 1024);
  });

  test("and the family states its own cost honestly", () => {
    // 88 kB for the family, of which a 400-weight user downloads 45 kB.
    expect(fontWeightKb("lato")).toBe(88);
    const regular = LATO_FILES.filter((f) => f.weight === "400").reduce((n, f) => n + f.bytes, 0);
    expect(regular).toBeLessThan(50 * 1024);
  });
});

describe("the retirement is really over", () => {
  test("a stored lato resolves to Lato again, with no migration", () => {
    expect(isFontId("lato")).toBe(true);
    expect(normalizeFontFamily("lato")).toBe("lato");
  });

  test("it is not on the retired list, and nothing announces it any more", () => {
    expect(RETIRED_FONTS).not.toContain("lato");
    // A leftover reason or label would be a leftover announcement: the toast
    // quotes the reason, so an entry the user is no longer told about is a
    // string nobody can reach.
    expect(Object.keys(RETIRED_FONT_REASONS)).not.toContain("lato");
    expect(Object.keys(RETIRED_FONT_LABELS)).not.toContain("lato");
  });

  test("its licence ships with the binaries, as OFL redistribution requires", () => {
    const licence = readFileSync(join(FONT_DIR, "OFL-lato.txt"), "utf8");
    expect(licence).toMatch(/SIL OPEN FONT LICENSE/i);
    // The one per-family line OFL does require to be accurate.
    expect(licence).toContain("Lato");
  });
});
