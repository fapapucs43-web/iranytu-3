/**
 * Vendor the PDF's own typeface into `public/pdf-fonts/` (Batch 7i).
 *
 *   bun scripts/subset-pdf-font.ts
 *
 * WHY A SCRIPT AND NOT A MANUAL DOWNLOAD
 * The subsets are DERIVED, not chosen. The set of characters is walked out of
 * the app at run time — the real `trackers.ts` / `assessments.ts` / `mood.ts`
 * exports and every string literal in `src/lib/reportPdf.ts` — so a label that
 * gains a new letter, or a new tracker that adds a new word, is inside the
 * subset on the next run without anyone remembering a font. A hand-picked
 * character list is correct exactly until someone edits a string, and then the
 * PDF quietly draws a box instead of a letter, which is the same class of
 * defect this whole batch exists to remove.
 *
 * The same walk is what `tests/batch7i.test.ts` runs, so the test and the
 * generator cannot disagree about what the app can say.
 *
 * WHY NOTO SANS AND NOT A WEBFONT
 * jsPDF embeds a font by its bytes, and a woff2 is a Brotli-compressed table
 * stream that jsPDF's TrueType parser cannot read. The app's own typefaces are
 * all woff2. So the PDF needs a real TTF, and a full Noto Sans is 621 kB — too
 * much to ship to someone who never taps export. Hence a subset.
 *
 * WHY ITS OWN DIRECTORY AND NOT `public/fonts/`
 * The first version wrote here, with a `pdf-` prefix, and three existing tests
 * objected — correctly. `public/fonts/` is required to hold exactly the UI
 * registry and nothing else, which is what makes "a withdrawn family's file
 * cannot linger on disk" true by construction; its licence-text count is
 * derived from the registry, and a tenth OFL text in it fails that. So this
 * directory has two owners and no exceptions: `src/lib/fonts.ts` owns
 * `public/fonts/`, and this script owns `public/pdf-fonts/`. The cost is one
 * service-worker rule, which is the price of not weakening a guarantee.
 *
 * WHY PYTHON, AND WHY THAT IS NOT A DEPENDENCY
 * The subsetting itself is `fontTools`, which is a Python tool. It is run by
 * THIS script and nowhere else: the output is committed, the app build never
 * invokes it, and the deploy machine never needs it. A developer regenerating
 * the subsets needs `python3` with `fontTools` (and `brotli`) installed; the
 * script says so in its failure message rather than leaving a bare
 * "ModuleNotFoundError" to be interpreted.
 *
 * WHY PINNED URLS AND PINNED HASHES
 * Both properties are bought separately, and the second is the one that
 * matters here. A pinned URL pins whatever that URL serves; the sha256 pin
 * says the bytes are the ones this subset was derived from. A silent upstream
 * swap therefore fails HERE, at the vendor, instead of in a user's PDF.
 *
 * WHAT IT REFUSES TO WRITE
 * A non-200, a body that is not a TrueType sfnt (`\0\1\0\0`), a file whose
 * subsetting did not actually get smaller, and any upstream whose hash is not
 * the one recorded below. "A successful response that is really an error page"
 * would otherwise be written into `public/` and produce a PDF that renders
 * nothing at all.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import * as assessments from "../src/lib/assessments";
import * as mood from "../src/lib/mood";
import * as trackers from "../src/lib/trackers";

/** Pinned upstream binaries and the hashes they must have, keyed by output name. */
const SOURCES: Record<string, { url: string; sha256: string }> = {
  "pdf-noto-sans-regular.ttf": {
    url: "https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts/NotoSans/hinted/ttf/NotoSans-Regular.ttf",
    sha256: "478c558ea716033cd60c03438f628dfa75694dcf6b5f6d505a2f05fd2b4f3823",
  },
  "pdf-noto-sans-bold.ttf": {
    url: "https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts/NotoSans/hinted/ttf/NotoSans-Bold.ttf",
    sha256: "1df075a380fc7cb898acf64c1f7b3b4dd780de3caa860178bf929de35817a913",
  },
};

/**
 * The OFL 1.1 text. `google/fonts` has no per-family release tags, so this is
 * read from `main` — acceptable precisely because the licence is fixed prose
 * and the only per-family line is the copyright holder. The file is committed,
 * so the shipped copy is pinned in the only way that matters; a re-fetch that
 * changed it would show up as a diff in a licence, which is exactly the kind of
 * change a reviewer should see.
 */
const LICENCE_URL = "https://raw.githubusercontent.com/google/fonts/main/ofl/notosans/OFL.txt";

const OUT_ROOT = "public/pdf-fonts";
const TIMEOUT_MS = 60_000;/**
 * The floor: what ANY Hungarian text can contain, whether or not a string in
 * the app says so today.
 *
 * The walk above is a snapshot. It was measured at 125 characters, and
 * checking what those 125 cover found `q`, `G`, `X`, `Y` and `Z` missing —
 * letters no current label happens to use, which is exactly the failure this
 * module is supposed to make impossible: the next label that writes "Gyógyszer"
 * would render boxes. A derived set is a safety net for NEW WORDS, never a
 * substitute for the alphabet itself. So the floor below is fixed and
 * deliberate — printable ASCII, Latin-1, the Hungarian letters, the
 * typographic set, and the space forms — and the walk is what narrows the rest.
 *
 * Written as escapes on purpose. These are NBSP, FIGURE SPACE and NARROW
 * NO-BREAK SPACE, and a literal `" "` in this file is an ordinary space that
 * looks identical in review and in a diff.
 */
const SAFETY_RANGES: readonly [number, number][] = [
  [0x20, 0x7e], // printable ASCII: letters, digits, punctuation
  [0xa0, 0xff], // Latin-1: NBSP, °, ·, ×, ÷, and the accented letters
  [0x150, 0x151], // Ő ő
  [0x170, 0x171], // Ű ű
  [0x2010, 0x2015], // hyphens, dashes
  [0x2018, 0x201f], // quotes, „ ”
  [0x2020, 0x2022], // † ‡ •
  [0x2026, 0x2026], // …
  [0x2030, 0x2030], // ‰
  [0x2039, 0x203a], // ‹ ›
  [0x20ac, 0x20ac], // €
  [0x2122, 0x2122], // ™
  [0x2007, 0x2007], // figure space
  [0x202f, 0x202f], // narrow no-break space
];

/** Every character the PDF generator can be asked to draw, from the real modules. */
function collectFromExports(): Set<string> {
  const out = new Set<string>();
  const walk = (value: unknown, depth: number): void => {
    if (depth > 6) return;
    if (typeof value === "string") for (const ch of value) out.add(ch);
    else if (Array.isArray(value)) for (const v of value) walk(v, depth + 1);
    else if (value && typeof value === "object") {
      for (const v of Object.values(value)) walk(v, depth + 1);
    }
  };
  walk(trackers, 0);
  walk(assessments, 0);
  walk(mood, 0);
  return out;
}

/** Plus every string literal in the generator itself, including its constants. */
function collectFromGenerator(): Set<string> {
  const out = new Set<string>();
  const src = readFileSync(fileURLToPath(new URL("../src/lib/reportPdf.ts", import.meta.url)), "utf8");
  for (const m of src.matchAll(/"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g)) {
    for (const ch of (m[1] ?? m[2] ?? "").replace(/\\n/g, "\n")) out.add(ch);
  }
  return out;
}

function subsetText(): string {
  const chars = collectFromExports();
  for (const ch of collectFromGenerator()) chars.add(ch);
  for (const [from, to] of SAFETY_RANGES) {
    for (let cp = from; cp <= to; cp += 1) chars.add(String.fromCodePoint(cp));
  }
  // Control characters have no glyph in any font and would only make the
  // subsetter warn; everything above is U+0020 or higher.
  return [...chars].filter((c) => c.codePointAt(0)! > 0x1f).sort().join("");
}

function sha256(body: Uint8Array): string {
  return createHash("sha256").update(body).digest("hex");
}

async function fetchOrThrow(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** A TrueType sfnt starts with the version tag 0x00010000. */
function assertTrueType(body: Uint8Array, what: string): void {
  const magic = Array.from(body.subarray(0, 4)).map((b) => b.toString(16).padStart(2, "0")).join("");
  if (magic !== "00010000") {
    throw new Error(`not a TrueType sfnt (magic was 0x${magic}) — ${what}`);
  }
}

/** Run fontTools' subsetter. Dev-time only; never part of the app build. */
function runSubset(src: string, out: string, textFile: string): void {
  const res = spawnSync(
    "python3",
    [
      "-m",
      "fontTools.subset",
      src,
      `--text-file=${textFile}`,
      // No layout features: the PDF lays its own text out, and GPOS kerning
      // pairs are ~22 kB per weight of tables jsPDF never reads. Hinting is
      // KEPT, unlike the UI subsets — a report is printed.
      "--layout-features=",
      "--glyph-names",
      "--notdef-outline",
      "--recalc-bounds",
      "--recalc-average-width",
      "--drop-tables+=FFTM",
      `--output-file=${out}`,
    ],
    { encoding: "utf8" },
  );
  if (res.error) {
    const missingPython = String(res.error).includes("ENOENT");
    throw new Error(
      missingPython
        ? "python3 was not found. The subsetter needs `python3 -m pip install fonttools brotli` " +
            "on a developer machine; the committed subsets in " +
            `${OUT_ROOT} are all the app build needs.`
        : `could not run the subsetter: ${String(res.error)}`,
    );
  }
  if (res.status !== 0) {
    const stderr = (res.stderr ?? "").trim().split("\n").slice(-4).join("\n");
    throw new Error(`fontTools.subset failed (exit ${res.status}):\n${stderr}`);
  }
}

async function main(): Promise<void> {
  const names = Object.keys(SOURCES);
  if (names.length === 0) throw new Error("no pinned sources are declared");
  mkdirSync(OUT_ROOT, { recursive: true });

  const text = subsetText();
  const textFile = join(tmpdir(), "belso-iranytu-pdf-subset.txt");
  writeFileSync(textFile, text, "utf8");
  console.log(
    `subset set: ${[...text].length} characters from the app itself + the safety net`,
  );

  let bytes = 0;
  for (const name of names) {
    const { url, sha256: want } = SOURCES[name]!;
    const body = await fetchOrThrow(url);
    const got = sha256(body);
    if (got !== want) {
      throw new Error(`${name}: upstream hash is ${got}, this subset was derived from ${want}`);
    }
    assertTrueType(body, url);

    const src = join(tmpdir(), name);
    const out = join(OUT_ROOT, name);
    writeFileSync(src, body);
    runSubset(src, out, textFile);

    const subsetBody = new Uint8Array(readFileSync(out));
    assertTrueType(subsetBody, out);
    if (subsetBody.byteLength >= body.byteLength) {
      throw new Error(
        `${name}: subset is ${subsetBody.byteLength} B, upstream is ${body.byteLength} B — ` +
          `the subsetter did nothing, so the file on disk is wrong`,
      );
    }
    if (!existsSync(out)) throw new Error(`${name}: the subsetter produced no file`);
    bytes += subsetBody.byteLength;
    console.log(
      `  ${name.padEnd(30)} ${String(subsetBody.byteLength).padStart(7)} B  (from ${String(body.byteLength).padStart(7)} B)`,
    );
    rmSync(src, { force: true });
  }
  rmSync(textFile, { force: true });

  // The licence. OFL redistribution requires the text to travel with the fonts,
  // and it is prose, not a build artefact, so it is checked rather than built.
  const licence = await (await fetch(LICENCE_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) })).text();
  if (!/SIL OPEN FONT LICENSE/i.test(licence)) {
    throw new Error(`not an OFL 1.1 text (no "SIL Open Font License" heading) — ${LICENCE_URL}`);
  }
  writeFileSync(join(OUT_ROOT, "OFL-noto-sans.txt"), licence, "utf8");
  console.log("  OFL-noto-sans.txt             licence");

  console.log(
    `\n${names.length} PDF subsets + 1 licence, ${bytes} B → ${OUT_ROOT} (served at /pdf-fonts/, ` +
      `fetched only when the user exports a PDF)`,
  );
}

main().catch((err) => {
  console.error(`\nFAILED: ${err instanceof Error ? err.message : String(err)}`);
  console.error("Fix the cause and re-run. A partial vendor must not be committed.");
  process.exit(1);
});
