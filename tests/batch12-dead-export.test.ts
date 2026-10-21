/**
 * Batch 12 (the final wrap-up batch), commit 3b — the dead-export guard, and
 * the five removals it exists to justify.
 *
 * The rule this file enforces is deliberately the CONSERVATIVE one:
 *
 *   an export is dead only when nothing outside its own module names it AND
 *   nothing inside its own module names it either — i.e. the declaration is
 *   the only occurrence in the entire repository.
 *
 * Anything with a single internal use is NOT dead, and this file will not let
 * it be called dead: `SUPERSEDED_SYSTEM_REPLACEMENT` (fonts.ts),
 * `HUNGARIAN_DIACRITICS` (font-cmap.ts) and `PBKDF2_ITERATIONS` (appLock.ts)
 * are all module-private in practice and all three are pinned below as alive,
 * because the sweep can tell the difference. Types are outside the sweep
 * entirely (a type costs nothing at runtime and several are the public shape
 * of a function's return), and so are the class-like icon exports in
 * `icons.tsx`, which are reachable through the registry object at the bottom
 * of that file rather than by name.
 *
 * The five removals this commit makes, all proved dead by exactly the rule
 * above and all re-pinned at the bottom of this file:
 *
 *   dates.ts        diffDays       never called, not even by dates.ts
 *   yearInPixels.ts yearMatrices   YearInPixels.tsx builds months itself
 *   iconsets.ts     glyphStem      superseded by the (glyph, stem) pair list
 *   iconsets.ts     LEGACY_RENDER  a constant whose doc block described a
 *                                  `LEGACY_GLYPHS` that no longer exists
 *   pwa.ts          canInstall     a one-line wrapper over isInstallable,
 *                                  which useInstallable calls directly
 *
 * And a sixth the audit's first pass misfiled: `HUNGARIAN_DIACRITICS` in
 * font-cmap.ts. Its audit rule was "no reference outside its own declaration",
 * which a sweep of constants answers with a yes for this one too — it was
 * simply not carried through to the removal list, because the string-form twin
 * sat next to `HUNGARIAN_DIACRITIC_CODEPOINTS`, which IS read by the CMap
 * tests. Both are re-checked here, so neither can drift back.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function walk(dir: string, match: RegExp): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path, match));
    else if (match.test(path)) out.push(path);
  }
  return out;
}

const LIB_FILES = walk(join(ROOT, "src/lib"), /\.tsx?$/);
/**
 * Everything that can consume a lib export: app code, tests, and the scripts.
 *
 * This file is excluded from its own corpus. It necessarily NAMES the exports
 * it asserts about, and a sweep that counted its own assertions would find
 * every one of them "used" — the guard would then pass precisely because the
 * names appear here, which is the opposite of what it is for.
 */
const CONSUMERS = [
  ...walk(join(ROOT, "src"), /\.tsx?$/),
  ...walk(join(ROOT, "tests"), /\.tsx?$/),
  ...walk(join(ROOT, "scripts"), /\.tsx?$/),
].filter((file) => !file.endsWith("batch12-dead-export.test.ts"));

/** Value exports only — `export function`/`class`, and `export const`/`let`. */
function valueExports(source: string): string[] {
  const names: string[] = [];
  for (const match of source.matchAll(/^export (?:async )?function (\w+)|^export (?:class|const|let) (\w+)/gm)) {
    names.push(match[1] ?? match[2]!);
  }
  return names;
}

type Refs = { inside: number; outside: number };

/**
 * Every consumer file's text, read once.
 *
 * The sweep below used to read every consumer file AGAIN for every export name
 * — some 300 names across ~280 files, so about eighty thousand reads and regex
 * sweeps. That was invisible while the library was small and became visible as
 * it grew: the guard crossed bun's five-second per-test timeout and went red for
 * a reason that had nothing to do with the code it guards. Reading once and
 * sweeping once (below) is the same measurement, taken the cheaper way.
 */
const CONTENT = new Map<string, string>();
function content(file: string): string {
  const hit = CONTENT.get(file);
  if (hit !== undefined) return hit;
  const text = readFileSync(file, "utf8");
  CONTENT.set(file, text);
  return text;
}

/** The value exports of a lib file, cached — the same list `deadExports` walks. */
const EXPORTS = new Map<string, string[]>();
function exportsOf(file: string): string[] {
  const hit = EXPORTS.get(file);
  if (hit) return hit;
  const names = valueExports(content(file));
  EXPORTS.set(file, names);
  return names;
}

const ALL_EXPORT_NAMES = [...new Set(LIB_FILES.flatMap((f) => exportsOf(f)))];

/**
 * `name → file → occurrences`, built in ONE pass over the consumers.
 *
 * The semantics are the ones this file always used: a word-boundary match of the
 * bare name over the file's raw text, comments and strings included, counted per
 * file. The only thing that changed is batching — one alternation of every export
 * name, one sweep — so the counts are the same numbers the per-name loop would
 * have produced, and the guard's rule is unchanged.
 */
const COUNTS = new Map<string, Map<string, number>>();
{
  const escape = (n: string) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`\\b(${ALL_EXPORT_NAMES.map(escape).join("|")})\\b`, "g");
  for (const file of CONSUMERS) {
    for (const m of content(file).matchAll(pattern)) {
      const name = m[1]!;
      let per = COUNTS.get(name);
      if (!per) {
        per = new Map();
        COUNTS.set(name, per);
      }
      per.set(file, (per.get(file) ?? 0) + 1);
    }
  }
}

function refs(name: string, home: string): Refs {
  let inside = 0;
  let outside = 0;
  for (const [file, n] of COUNTS.get(name) ?? []) {
    if (file === home) inside += n;
    else outside += n;
  }
  return { inside, outside };
}

/** `file :: name` for every export nothing in the repository names. */
function deadExports(): string[] {
  const out: string[] = [];
  for (const file of LIB_FILES) {
    for (const name of exportsOf(file)) {
      const { inside, outside } = refs(name, file);
      if (outside === 0 && inside === 1) out.push(`${file.slice(ROOT.length + 1)} :: ${name}`);
    }
  }
  return out.sort();
}

/**
 * Dead exports a batch is allowed to keep, each with the reason it survives.
 *
 * EMPTY, and that is the point rather than an oversight: the sweep is clean
 * after this commit's five removals, so every future entry has to be argued
 * for in prose instead of arriving by accident.
 */
const ALLOWED_DEAD: Record<string, string> = {
  // Batch A — Recording 2.0: persisted by the vocabulary step in this same
  // batch (step 3); the store half ships in step 1 so the storage key and
  // validation exist before any UI writes to them.
  "rc/lib/store.ts :: loadCustomEmotions": "consumed by the emotion vocabulary step (Batch A, step 3)",
  "rc/lib/store.ts :: saveCustomEmotions": "consumed by the emotion vocabulary step (Batch A, step 3)",
};

describe("no export in src/lib is unreachable", () => {
  test("the sweep reads the whole library and a real number of exports", () => {
    // A sweep that matched nothing would pass the assertion below forever.
    expect(LIB_FILES.length).toBeGreaterThan(40);
    const total = LIB_FILES.reduce((n, f) => n + exportsOf(f).length, 0);
    expect(total).toBeGreaterThan(300);
  });

  test("every dead export is a named exception with a reason", () => {
    const dead = deadExports().filter((entry) => !(entry in ALLOWED_DEAD));
    expect(dead, `unreachable export(s): ${dead.join(", ")}`).toEqual([]);
  });

  test("each exception names a reason, and the reason is not empty", () => {
    for (const [entry, reason] of Object.entries(ALLOWED_DEAD)) {
      expect(reason.length, `${entry} has no stated reason`).toBeGreaterThan(20);
    }
  });

  test("the sweep tells internal-only apart from dead", () => {
    // These two LOOK like the removed ones: module-private constants with no
    // outside consumer. They have a real internal use, so the rule keeps
    // them. If the rule ever widens to "unused outside its module", they go
    // red — which is the point of asserting them by name.
    for (const [file, name] of [
      ["src/lib/fonts.ts", "SUPERSEDED_SYSTEM_REPLACEMENT"],
      ["src/lib/appLock.ts", "PBKDF2_ITERATIONS"],
    ] as const) {
      const { inside, outside } = refs(name, join(ROOT, file));
      expect(inside, `${name} is no longer used inside its own module`).toBeGreaterThan(1);
      expect(outside, `${name} has an outside consumer — the sweep's premise changed`).toBe(0);
    }
  });

  test("the code-point list the CMap tests use is still there", () => {
    // The sibling of the removed `HUNGARIAN_DIACRITICS`, and the reason that
    // one was safe to delete rather than a pair that has to stay together.
    const file = join(ROOT, "src/lib/font-cmap.ts");
    expect(refs("HUNGARIAN_DIACRITIC_CODEPOINTS", file).outside).toBeGreaterThan(0);
    expect(readFileSync(file, "utf8")).not.toContain("HUNGARIAN_DIACRITICS:");
  });

  test("registry-reachable icons are not mistaken for dead code", () => {
    // `Sunrise`, `Minus` and `ChevronLeft` are exported by name and used by
    // nothing by name; they are reached through the object at the end of
    // icons.tsx. A text sweep that deleted them would break three glyphs.
    for (const name of ["Sunrise", "Minus", "ChevronLeft"]) {
      const { inside } = refs(name, join(ROOT, "src/lib/icons.tsx"));
      expect(inside, `${name} lost its registry entry`).toBeGreaterThan(1);
    }
  });

  test("the five this commit removed are gone for good", () => {
    for (const [file, name] of [
      ["src/lib/dates.ts", "diffDays"],
      ["src/lib/yearInPixels.ts", "yearMatrices"],
      ["src/lib/iconsets.ts", "glyphStem"],
      ["src/lib/iconsets.ts", "LEGACY_RENDER"],
      ["src/lib/pwa.ts", "canInstall"],
    ] as const) {
      expect(readFileSync(join(ROOT, file), "utf8"), `${name} came back`).not.toContain(name);
    }
  });

  test("the sixth, the one the audit misfiled, is gone too", () => {
    // Matched as CODE, not as text: font-cmap.ts still names the removed
    // constant in the comment that explains the removal, and a prose mention
    // is not an export. The three shapes that would bring it back are an
    // export declaration, an import, and a reference in any other module.
    const corpus = [...walk(join(ROOT, "src"), /\.tsx?$/), ...walk(join(ROOT, "tests"), /\.tsx?$/)]
      .filter((file) => !file.endsWith("batch12-dead-export.test.ts"))
      .map((file) => ({ file, code: readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "") }))
      .filter(({ code }) => code.includes("HUNGARIAN_DIACRITICS"));
    expect(corpus.map((entry) => entry.file)).toEqual([]);
  });

  test("the stale doc block went with its constant", () => {
    // `LEGACY_RENDER`'s comment described a `LEGACY_GLYPHS` that no longer
    // exists anywhere. The policy it described is real, and lives on
    // `renderModeFor`, which is where the assertions below check it.
    const iconsets = readFileSync(join(ROOT, "src/lib/iconsets.ts"), "utf8");
    expect(iconsets).not.toContain("LEGACY_GLYPHS");
    expect(iconsets).toContain("export function renderModeFor");
  });
});
