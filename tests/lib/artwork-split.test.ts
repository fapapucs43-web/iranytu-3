/**
 * The artwork split, guarded.
 *
 * `src/lib/iconsets/fluent-artwork.ts` is close to 600 kB of generated SVG —
 * the largest single thing this app ships. It was in the entry bundle for
 * readers who never pick a 3D set, and `lucide` is the default set, so most
 * readers never needed it at all. It is now a chunk reached through
 * `loadFluentArtwork()`.
 *
 * The thing that would quietly undo this is someone adding a static import.
 * Not a failing build — Rollup would simply put 600 kB back in the entry chunk
 * and every measurement in `docs/PROJECT-INVENTORY.md` would become a memory.
 * So the primary assertion here is about the SOURCE, not the output, for the
 * same reason `tests/views/insights-split.test.ts` is: nothing in this suite
 * reads `dist/`, and a test needing a build first is a test CI cannot run.
 *
 * Unlike the Insights guard, this one can also exercise the loader directly —
 * `bun` resolves `import()` of a TypeScript module perfectly well — so the
 * loaded behaviour is asserted as behaviour. The UNLOADED behaviour is asserted
 * against the source instead, for a reason the test itself explains.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fluentArtworkSync, loadFluentArtwork } from "../../src/lib/iconsets";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

function sourceFiles(dir = "src", out: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) sourceFiles(rel, out);
    else if (/\.tsx?$/.test(rel)) out.push(rel);
  }
  return out;
}

/** Every test file, so the loader guard can look across all of them. */
const testFiles: string[] = [];
(function walk(dir: string) {
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(rel);
    else if (/\.tsx?$/.test(rel)) testFiles.push(rel);
  }
})("tests");

/** A STATIC import of the artwork: `import … from` or `require(`. */
function staticallyImports(rel: string): boolean {
  const src = readFileSync(join(ROOT, rel), "utf8");
  return /^\s*import\s[^;]*?from\s+["'][^"']*iconsets\/fluent-artwork["']/m.test(src)
    || /require\(\s*["'][^"']*iconsets\/fluent-artwork["']\s*\)/.test(src);
}

describe("the artwork chunk cannot collapse back into the entry bundle", () => {
  test("no file in src/ imports it statically", () => {
    const offenders = sourceFiles().filter(staticallyImports);
    expect(offenders, `static import of the artwork in: ${offenders.join(", ")}`).toEqual([]);
  });

  test("the only way in is the loader", () => {
    const iconsets = readFileSync(join(ROOT, "src/lib/iconsets.ts"), "utf8");
    expect(iconsets).toContain('import("./iconsets/fluent-artwork")');
    // …and it is a dynamic import, not a re-export that would pull it back.
    expect(iconsets).not.toMatch(/^\s*export\s+\*\s+from/m);
  });

  test("every consumer asks for it, so it arrives for people who chose a 3D set", () => {
    // Each of these renders artwork and would silently stay on its Lucide
    // fallback forever if none of them made the request.
    for (const file of [
      "src/components/NavIcon.tsx",
      "src/components/ContentIcon.tsx",
      "src/components/IconSetPicker.tsx",
    ]) {
      const src = readFileSync(join(ROOT, file), "utf8");
      expect(src, `${file} never warms the artwork`).toContain("useWarmFluentArtwork()");
    }
    // `GlyphIcon` lives in the context itself, next to the loader's re-export.
    const ctx = readFileSync(join(ROOT, "src/state/IconSetContext.tsx"), "utf8");
    expect(ctx).toContain("export function useWarmFluentArtwork(");
  });

  test("the nav bar uses the loader's lookup, not a direct import of the module", () => {
    const nav = readFileSync(join(ROOT, "src/components/NavIcon.tsx"), "utf8");
    expect(nav).toContain("fluentArtworkSync(");
    expect(nav).not.toContain("iconsets/fluent-artwork");
  });

  test("and no comment claims the artwork is in the module graph any more", () => {
    // Two comments said exactly that, and both became false the moment the
    // artwork became a chunk. A stale comment is how the next person decides
    // this was never worth doing.
    for (const file of ["src/components/IconSetPicker.tsx", "src/components/NavIcon.tsx"]) {
      const src = readFileSync(join(ROOT, file), "utf8");
      expect(src, `${file} still claims the artwork is already in memory`).not.toMatch(
        /in the bundle, in memory|in this very render/,
      );
    }
  });
});

describe("no test asserts artwork without asking for it first", () => {
  // This one exists because of a real failure, not a hypothetical. `bun test`
  // shares one module registry across every file in a run, so whether
  // `glyphArtwork` answers with real SVG depends on whether some OTHER file's
  // `beforeAll` happened to run first. On a developer machine with a `dist/`
  // present the file order worked out; in CI there is no `dist/`, one bundle
  // test skips, the order shifts, and `batch7.test.ts` went red on a green
  // suite for a reason no reader could see.
  //
  // Files that import `fluentArtwork` straight from the module are excluded:
  // they hold the artwork by definition and never touch the loader.
  const needs = testFiles.filter((f) => {
    const src = readFileSync(join(ROOT, f), "utf8");
    return /glyphArtwork\(|iconset-inline/.test(src);
  });
  test("every one of them waits for the loader", () => {
    const missing = needs.filter(
      (f) => !readFileSync(join(ROOT, f), "utf8").includes("loadFluentArtwork"),
    );
    expect(
      missing,
      `these assert artwork without awaiting loadFluentArtwork, so they pass or fail by file order: ${missing.join(", ")}`,
    ).toEqual([]);
  });
  test("and there is at least one, so the guard is not quietly dead", () => {
    expect(needs.length).toBeGreaterThan(0);
  });
});

describe("the loader itself, once the chunk has landed", () => {
  test("the lookup answers with the same SVG the module exports", async () => {
    const { fluentArtwork } = await import("../../src/lib/iconsets/fluent-artwork");
    expect(fluentArtworkSync("seedling")).toBe(fluentArtwork("seedling"));
    expect(fluentArtworkSync("seedling")).toBeTruthy();
  });

  test("an unknown stem is still undefined, and now says so for a second reason", async () => {
    // Before the split there was one reason this returned undefined — the stem
    // was never vendored. There are two now, and they must not be confused:
    // a stem the artwork does not carry, and a stem looked up before the load.
    const { fluentArtwork } = await import("../../src/lib/iconsets/fluent-artwork");
    expect(fluentArtworkSync("a-stem-no-one-vendored")).toBeUndefined();
    expect(fluentArtwork("a-stem-no-one-vendored")).toBeUndefined();
  });

  test("the accessor is a single null-guarded read, so unloaded really means undefined", async () => {
    // WHY THIS IS A SOURCE ASSERTION AND NOT A RUNTIME ONE. The interesting
    // window is "asked for before the chunk has arrived", and that state cannot
    // be asserted in this suite: `bun test` shares one module registry across
    // every file in a run, so by the time any test here executes, another file's
    // `beforeAll` has already populated the loader's module-level cache. A file
    // written to start empty still sees it loaded — which is exactly what
    // happened when this assertion lived in its own file, where it passed alone
    // and failed in the full run.
    //
    // So the guarantee is asserted where it can be: the cache starts null, and
    // the accessor is an optional-chain over it. The four call sites' behaviour
    // on `undefined` is not left to this file either — `tests/batch7b.test.ts`
    // already proves each of them falls back per item, twice.
    const src = readFileSync(join(ROOT, "src/lib/iconsets.ts"), "utf8");
    expect(src).toMatch(/let artworkModule:[^=]*=\s*null/);
    expect(src).toMatch(/return artworkModule\?\.fluentArtwork\(stem\)/);
  });

  test("asking again after it has loaded is safe and does not re-import", async () => {
    await expect(loadFluentArtwork()).resolves.toBeUndefined();
    expect(fluentArtworkSync("seedling")).toBeTruthy();
  });
});

beforeAll(async () => {
  await loadFluentArtwork();
});