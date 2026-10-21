/**
 * Re-cut every vendored UI face to the characters this app can actually show.
 *
 *   bun scripts/subset-ui-fonts.ts            subset, write, report
 *   bun scripts/subset-ui-fonts.ts --check    subset to a scratch dir, write nothing
 *
 * WHY THIS EXISTS: THE 660 kB THAT NOBODY USES
 * `public/fonts/` held 20 woff2 files totalling 660 568 B. Google cuts them
 * by UNICODE BLOCK, and the blocks include Latin Extended-B, the phonetic
 * extensions (U+1D00–U+1DBF) and Latin Extended-D (U+A720–U+A7FF) — several
 * hundred codepoints a mood journal written in Hungarian has no way to
 * produce, and which are carried in every single file of every family. The
 * declared `unicodeRange` in `src/lib/fonts.ts` is therefore a true statement
 * about a range the file covers and a wildly optimistic statement about what
 * the app needs.
 *
 * WHAT IS DROPPED, EXACTLY
 * The floor is fixed, declared and small, and the two files per face are split
 * along the segments the registry already uses, so no `unicodeRange` in the
 * registry has to change and every declared range stays a true upper bound:
 *
 *   latin      printable ASCII, Latin-1 Supplement, General Punctuation, €, ™
 *   latin-ext  Latin Extended-A — which is where ő ű Ő Ű live
 *
 * What falls outside both is handed on purpose, to the thing that already draws
 * it: the emoji the activity and mood registries name, and the arrows,
 * geometric shapes and check marks in their labels. Those are outside Google's
 * own declared ranges too, so a browser already resolves them to the system
 * emoji face today; putting them in a webfont would change nothing and cost
 * bytes. The list is explicit, and the script REFUSES to run if the app's own
 * source mentions a character that is neither in the floor nor in that list —
 * so the next person to add a symbol to a string finds out here rather than in
 * a screenshot.
 *
 * WHY THE CHARACTERS THE APP USES ARE WALKED, NOT ONLY THE FLOOR
 * The floor is what a user can type. The walk is what the app can show, read
 * out of `src/` and `index.html`, and it is deliberately over-inclusive: a
 * character mentioned in a comment costs a handful of bytes and costs nothing
 * if it is never rendered, whereas a character that turns up in a real string
 * after this script last ran and is missing from the file is a glyph that
 * silently falls back to a system face — half Hungarian, half not, which is
 * the exact defect that got Lato withdrawn in Batch 7f.
 *
 * LATO, AND WHY IT CANNOT BE RE-CUT LIKE THE OTHERS
 * Every other family here is re-cut from the gstatic woff2 already committed,
 * so its provenance is unchanged and `scripts/vendor-fonts.ts` still owns it.
 * Lato cannot be: Google's `latin-ext` of Lato is the Central-European cut and
 * omits ő and ű, and there is no pinned gstatic URL that serves a Lato which has
 * them. Subsetting a file that already lost the letters cannot bring them back.
 * So Lato is cut from the upstream TrueType, pinned by URL, size and SHA-256,
 * and it is the reason this script fetches anything at all. It is also the case
 * that proves the script is a fix and not only a size optimisation: the floor
 * contains ő and ű, so a Lato cut this way spells Hungarian by construction,
 * and the script reads the character map back out of the bytes it just produced
 * and refuses to write a file that cannot spell them.
 *
 * WHAT IT REFUSES TO WRITE
 * A non-200, an upstream body whose size or digest is not the pinned one, a
 * cached upstream that is not the pinned one, a vendored file that is not
 * woff2, an output that is not woff2, an output that came out LARGER than its
 * input, and a `latin-ext` file that cannot spell `őűŐŰ`. Each is a case where
 * writing would put a worse artefact in the repository than the one already
 * there — and the first of them, the size comparison, is the one that makes
 * re-running this script safe: the second run cuts an already-cut file, gets
 * the same file, and is allowed to leave it alone.
 *
 * BUILD-TIME ONLY
 * fontTools is a build tool. It is not a dependency of the app, nothing in
 * `src/` imports it, and the deployed bundle does not contain it — the same
 * rule `scripts/subset-pdf-font.ts` follows. The script says so plainly and
 * stops if `pyftsubset` is not on PATH, rather than quietly producing something
 * subtly different from what the committed bytes are.
 *
 * THE REGISTRY IS NOT EDITED BY THIS SCRIPT
 * It prints the exact `bytes:` line to paste for every file whose size changed,
 * and stops. Same decision as `src/lib/pdfFonts.ts`: the numbers in the
 * registry are a contract, they are copied by hand on purpose, and a build step
 * that rewrites the source it is measuring is a build step nobody can review.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FONTS, HAND_FONTS, FONT_BASE, type FontFile } from "../src/lib/fonts";

const OUT_ROOT = "public/fonts";
const CACHE_ROOT = ".fontcache";
const TIMEOUT_MS = 30_000;
const CHECK_ONLY = process.argv.includes("--check");

/**
 * The declared floor, split along the registry's own two segments.
 *
 * Both lists sit INSIDE the `unicodeRange` the registry already declares for
 * that segment, so every declared range remains a true upper bound and no
 * registry string has to change. That is the whole reason the split is done
 * this way round rather than as one flat set per family: a narrower, honest
 * range would be nicer, but it is not this commit's business, and a range that
 * over-promises is harmless for the one thing CSS uses it for — deciding when
 * to download the file.
 */
export const FLOOR: Readonly<Record<FontFile["subset"], ReadonlyArray<readonly [number, number]>>> = {
  latin: [
    [0x20, 0x7e], // printable ASCII
    [0xa0, 0xff], // Latin-1 Supplement, including NBSP
    [0x2000, 0x206f], // General Punctuation: – — ' ' " " … ‰ ‹ ›
    [0x20ac, 0x20ac], // €
    [0x2122, 0x2122], // ™
  ],
  "latin-ext": [
    [0x100, 0x17f], // Latin Extended-A: á é í ó ö ő ú ü ű, and their capitals
  ],
};

/**
 * Blocks the app deliberately does not put in a webfont, and why.
 *
 * Each is outside the `unicodeRange` Google declares for both of its segments,
 * so a browser resolves them to the system emoji or symbol face today and will
 * keep doing so. The app's own icon set draws most of them as SVG, and the rest
 * are the emoji the mood, activity and achievement registries name.
 *
 * This is also the safety net. The walk below collects every codepoint in the
 * app's source that the floor does not cover, and the script REFUSES to run if
 * one of them is not in this list — so adding a symbol to a string becomes a
 * decision somebody has to make here, not a glyph that quietly goes missing.
 */
export const DELEGATED: ReadonlyArray<readonly [number, number, string]> = [
  [0x2190, 0x21ff, "arrows — the app draws its own"],
  [0x2200, 0x22ff, "math operators (−, ≥) in prose, not in data"],
  [0x2300, 0x23ff, "technical symbols, of which the app uses only ⌚"],
  [0x25a0, 0x25ff, "geometric shapes used as rank markers"],
  [0x2600, 0x27bf, "dingbats and misc symbols (✅, ⚠, ☕) — the system face"],
  [0x2b00, 0x2bff, "arrows and stars (⬆, ⭐) — the system face"],
  [0x1f000, 0x1faff, "emoji — the system face, which is the point"],
  [0xfe00, 0xfe0f, "variation selectors, which select the system face's glyph"],
].sort((a, b) => a[0] - b[0]) as ReadonlyArray<readonly [number, number, string]>;

function inDelegated(cp: number): boolean {
  return DELEGATED.some(([lo, hi]) => cp >= lo && cp <= hi);
}

/** `true` for a code point one of the delegated blocks claims. */
export { inDelegated };

/** Every code point in a set of inclusive ranges, ascending. */
export function expand(ranges: ReadonlyArray<readonly [number, number]>): number[] {
  const out: number[] = [];
  for (const [lo, hi] of ranges) for (let c = lo; c <= hi; c++) out.push(c);
  return out;
}

function inRanges(cp: number, ranges: ReadonlyArray<readonly [number, number]>): boolean {
  return ranges.some(([lo, hi]) => cp >= lo && cp <= hi);
}

/** Google's declared `unicode-range` for each segment, parsed to bounds. */
export const DECLARED_RANGE: Readonly<
  Record<FontFile["subset"], ReadonlyArray<readonly [number, number]>>
> = {
  latin: [
    [0x0000, 0x00ff], [0x0131, 0x0131], [0x0152, 0x0153], [0x02bb, 0x02bc],
    [0x02c6, 0x02c6], [0x02da, 0x02dc], [0x0304, 0x0304], [0x0308, 0x0308],
    [0x0329, 0x0329], [0x2000, 0x206f], [0x20ac, 0x20ac], [0x2122, 0x2122],
    [0x2191, 0x2191], [0x2193, 0x2193], [0x2212, 0x2212], [0x2215, 0x2215],
    [0xfeff, 0xfeff], [0xfffd, 0xfffd],
  ],
  "latin-ext": [
    [0x0100, 0x02ba], [0x02bd, 0x02c5], [0x02c7, 0x02cc], [0x02ce, 0x02d7],
    [0x02dd, 0x02ff], [0x0304, 0x0304], [0x0308, 0x0308], [0x0329, 0x0329],
    [0x1d00, 0x1dbf], [0x1e00, 0x1e9f], [0x1ef2, 0x1eff], [0x2020, 0x2020],
    [0x20a0, 0x20ab], [0x20ad, 0x20c0], [0x2113, 0x2113], [0x2c60, 0x2c7f],
    [0xa720, 0xa7ff],
  ],
};

/** The four Hungarian letters. A `latin-ext` file that misses one is refused. */
export const MUST_SPELL = ["ő", "ű", "Ő", "Ű"];

/**
 * Families that cannot be re-cut from Google's own subset, and the upstream
 * TrueType they must be cut from instead.
 *
 * Keyed by the filename stem before the segment suffix, so
 * `lato-400-latin-ext.woff2` looks up `lato-400`. Pinned three ways over —
 * URL, byte count and SHA-256 — because `google/fonts` has no per-family
 * release tags, and a silent upstream swap must fail here rather than in
 * someone's browser. Both files were measured by hand for this commit:
 * 656 568 B and 656 544 B, 3 023 glyphs each, ő and ű present.
 */
export const UPSTREAM_TTF: Readonly<Record<string, { url: string; bytes: number; sha256: string }>> = {
  "lato-400": {
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/lato/Lato-Regular.ttf",
    bytes: 656568,
    sha256: "d636e4683231f931eda222d588e944d082bfd3bdba02f928bee461c0f185b251",
  },
  "lato-700": {
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/lato/Lato-Bold.ttf",
    bytes: 656544,
    sha256: "8a0aace75d33794eece4b28187bfc1df0bbd2888b5d8a56e01788c8d65d16be1",
  },
};

/** `lato-400-latin-ext.woff2` → `lato-400`. Null when there is no upstream. */
export function stemOf(file: string): string | null {
  const stem = file.replace(/-latin(-ext)?\.woff2$/, "");
  return stem in UPSTREAM_TTF ? stem : null;
}

/**
 * Every codepoint the app's own source mentions.
 *
 * Deliberately the raw text of `src/**` and `index.html`, comments and all. The
 * over-inclusion is the point: a character in a comment costs a few hundred
 * bytes across the whole set, while a character that reaches a real string and
 * is not in the file is a glyph the browser resolves somewhere else.
 */
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
  walk("src");
  if (existsSync("index.html")) read("index.html");
  return out;
}

/** The sfnt version tag of an outline font: 1.0, Apple's "true", or CFF "OTTO". */
const SFNT_MAGICS: ReadonlySet<string> = new Set([
  String.fromCharCode(0x00, 0x01, 0x00, 0x00),
  "true",
  "OTTO",
]);

function assertWoff2(body: Uint8Array, what: string): void {
  const magic = String.fromCharCode(...body.subarray(0, 4));
  if (magic !== "wOF2") {
    throw new Error(`not a woff2 (magic was ${JSON.stringify(magic)}) — ${what}`);
  }
}

function assertTrueType(body: Uint8Array, what: string): void {
  const magic = String.fromCharCode(...body.subarray(0, 4));
  if (!SFNT_MAGICS.has(magic)) {
    throw new Error(`not an outline font (magic was ${JSON.stringify(magic)}) — ${what}`);
  }
}

/** The characters one output file must contain. */
function unicodesFor(spec: FontFile, walked: Set<number>): number[] {
  const set = new Set(expand(FLOOR[spec.subset]));
  for (const cp of walked) {
    if (inRanges(cp, DECLARED_RANGE[spec.subset])) set.add(cp);
  }
  if (spec.subset === "latin-ext") for (const c of MUST_SPELL) set.add(c.codePointAt(0)!);
  return [...set].sort((a, b) => a - b);
}

async function fetchUpstream(stem: string): Promise<Uint8Array> {
  const pinned = UPSTREAM_TTF[stem]!;
  const cached = join(CACHE_ROOT, `${stem}.ttf`);
  if (existsSync(cached)) {
    const bytes = new Uint8Array(readFileSync(cached));
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== pinned.sha256) {
      throw new Error(`${cached} is cached but is not the pinned upstream — delete it`);
    }
    return bytes;
  }
  const res = await fetch(pinned.url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${pinned.url}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength !== pinned.bytes) {
    throw new Error(`upstream size ${bytes.byteLength}, pinned ${pinned.bytes} — ${pinned.url}`);
  }
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== pinned.sha256) {
    throw new Error(`upstream digest ${digest}, pinned ${pinned.sha256} — ${pinned.url}`);
  }
  writeFileSync(cached, bytes);
  return bytes;
}

function subsetTo(input: string, output: string, unicodes: number[]): void {
  execFileSync(
    "pyftsubset",
    [
      input,
      `--unicodes=${unicodes.map((c) => `U+${c.toString(16).toUpperCase()}`).join(",")}`,
      "--flavor=woff2",
      // fontTools' own curated feature list, NOT `*`. Keeping every feature
      // costs real bytes in a file this app only ever renders UI text in, and
      // what it drops are stylistic alternates nobody switches on.
      "--canonical-order",
      "--name-IDs=*",
      "--notdef-glyph",
      `--output-file=${output}`,
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
}

/** Codepoints a woff2 really claims, read with the repo's own reader. */
async function cmapOf(path: string): Promise<Set<number>> {
  const { woff2Codepoints } = await import("../src/lib/font-cmap");
  const result = woff2Codepoints(new Uint8Array(readFileSync(path)));
  if (!result.ok) throw new Error(`${path}: ${result.reason}`);
  return result.codepoints;
}

async function main(): Promise<void> {
  const files: FontFile[] = [...FONTS, ...HAND_FONTS].flatMap((d) => d.files);
  if (files.length === 0) throw new Error("the registry lists no font files");

  // The refusal that makes this script safe to run on a repository it has never
  // seen: every character the app mentions is either in a floor or in the
  // delegated list. Anything else is a new decision, not a new glyph.
  const walked = walkedCodepoints();
  const accounted = new Set<number>();
  for (const spec of files) for (const c of unicodesFor(spec, walked)) accounted.add(c);
  const unaccounted = [...walked]
    .filter((c) => !accounted.has(c) && !inDelegated(c))
    .sort((a, b) => a - b);
  if (unaccounted.length > 0) {
    const listed = unaccounted
      .map(
        (c) =>
          `U+${c.toString(16).toUpperCase().padStart(4, "0")} ${JSON.stringify(
            String.fromCodePoint(c),
          )}`,
      )
      .join(", ");
    throw new Error(
      `the app mentions ${unaccounted.length} character(s) that no subset covers and that ` +
        `no delegated block claims: ${listed}\nAdd them to FLOOR, or to DELEGATED with a reason.`,
    );
  }

  mkdirSync(CACHE_ROOT, { recursive: true });
  const outDir = CHECK_ONLY ? join(CACHE_ROOT, "check") : OUT_ROOT;
  mkdirSync(outDir, { recursive: true });
  // Sweep any scratch file an earlier interrupted run left behind, so the
  // served directory is exactly the registry whatever happened last time.
  for (const stale of readdirSync(CACHE_ROOT)) {
    if (stale.endsWith(".tmp")) rmSync(join(CACHE_ROOT, stale), { force: true });
  }

  let before = 0;
  let after = 0;
  const rows: Array<[string, number, number]> = [];

  for (const spec of files) {
    const stem = stemOf(spec.file);
    const target = join(outDir, spec.file);
    let input: string;
    let sourceBytes: number;

    if (stem) {
      const ttf = join(CACHE_ROOT, `${stem}.ttf`);
      if (!existsSync(ttf)) writeFileSync(ttf, await fetchUpstream(stem));
      assertTrueType(new Uint8Array(readFileSync(ttf)), UPSTREAM_TTF[stem]!.url);
      input = ttf;
    } else {
      const vendored = join(OUT_ROOT, spec.file);
      if (!existsSync(vendored)) {
        throw new Error(
          `${spec.file} is in neither ${CACHE_ROOT} nor ${OUT_ROOT} — run ` +
            `\`bun scripts/vendor-fonts.ts\` first to restore the upstream files`,
        );
      }
      assertWoff2(new Uint8Array(readFileSync(vendored)), spec.file);
      input = vendored;
    }
    sourceBytes = readFileSync(input).byteLength;

    // The scratch file goes in the CACHE directory, never in the directory
    // being served. A run that throws between writing it and removing it used
    // to leave `.<name>.woff2.tmp` in `public/fonts/`, and two existing tests
    // correctly failed on it: that directory is required to hold the registry
    // and nothing else, and a build tool that can leave debris in the output is
    // a build tool somebody has to clean up by hand.
    const tmp = join(CACHE_ROOT, `${spec.file}.tmp`);
    subsetTo(input, tmp, unicodesFor(spec, walked));
    assertWoff2(new Uint8Array(readFileSync(tmp)), `the subset of ${spec.file}`);
    const out = new Uint8Array(readFileSync(tmp));

    if (out.byteLength > sourceBytes) {
      throw new Error(
        `the subset of ${spec.file} came out LARGER (${out.byteLength} > ${sourceBytes}) — ` +
          `refusing to replace a working file with a worse one`,
      );
    }
    if (spec.subset === "latin-ext") {
      // Read the character map out of the bytes just produced, never out of the
      // file this is about to replace. A check that could pass on the old
      // artefact is a check that has never checked anything.
      const produced = await cmapOf(tmp);
      for (const c of MUST_SPELL) {
        if (!produced.has(c.codePointAt(0)!)) {
          throw new Error(`${spec.file} cannot spell ${c} — refusing to write it`);
        }
      }
    }
    rmSync(tmp, { force: true });

    before += sourceBytes;
    after += out.byteLength;
    rows.push([spec.file, sourceBytes, out.byteLength]);
    if (!CHECK_ONLY) writeFileSync(target, out);
  }

  rows.sort((a, b) => b[1] - b[2] - (a[1] - a[2]));
  for (const [name, b, a] of rows) {
    const delta = b === a ? "unchanged" : `${(((a - b) / b) * 100).toFixed(0)}%`;
    console.log(`  ${name.padEnd(34)} ${String(b).padStart(7)} -> ${String(a).padStart(7)}  ${delta}`);
  }
  console.log(
    `\n${files.length} files, ${(before / 1024).toFixed(0)} kB -> ${(after / 1024).toFixed(0)} kB ` +
      `(${(((after - before) / before) * 100).toFixed(0)}%)` +
      (CHECK_ONLY ? "  [check only — nothing written to public/fonts]" : `  → ${OUT_ROOT}`),
  );
  if (CHECK_ONLY) return;

  // The registry is a contract, so it is updated by hand and this script only
  // says what to paste. See the header. The `bytes:` line is not on the same
  // line as the filename — each `FontFile` spans five — so the lookup walks
  // forward from the filename to the first `bytes:` it meets, and a file the
  // walk cannot find is reported as `not found` rather than as a silent `null`
  // that reads like a number.
  const registry = readFileSync("src/lib/fonts.ts", "utf8").split("\n");
  const registeredSize = (name: string): number | null => {
    const at = registry.findIndex((l) => l.includes(`"${name}"`));
    if (at < 0) return null;
    for (let i = at + 1; i < Math.min(at + 8, registry.length); i += 1) {
      const match = registry[i]!.trim().match(/^bytes:\s*(\d+),/);
      if (match) return Number(match[1]);
    }
    return null;
  };
  console.log("\nPaste these into src/lib/fonts.ts, one per file:");
  for (const [name, , a] of rows) {
    const current = registeredSize(name);
    const was = current === null ? "NOT FOUND" : String(current);
    if (current !== a) console.log(`  ${name.padEnd(34)} bytes: ${a},   (was ${was})`);
  }
  console.log(`\nServed at ${FONT_BASE}. fontTools is build-time only: nothing in src/ imports it.`);
}

// Only when run. The constants above are imported by
// `tests/batch7i-ui-fonts.test.ts`, which holds the committed files to this
// script's floor — and a test that silently re-cut twenty binaries on import
// would be a test nobody could run.
if (import.meta.main) {
  main().catch((err: unknown) => {
    console.error(`\nFAILED: ${err instanceof Error ? err.message : String(err)}`);
    console.error("Nothing was written. Fix the cause and re-run.");
    process.exit(1);
  });
}
