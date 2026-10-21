/**
 * The Insights split, guarded structurally.
 *
 * The obvious way to test this is to build and assert the charting chunk
 * exists as its own file. This suite does not depend on a build — nothing else
 * here reads `dist/`, deliberately, because a test that needs `npm run build`
 * first is a test CI cannot run on a clean checkout.
 *
 * So this asserts the STRUCTURE that makes the split true, which is a proof
 * rather than a proxy:
 *
 *   1. `recharts` is imported by exactly one file in `src/`.
 *   2. That file is `InsightsView.tsx`.
 *   3. `App.tsx` reaches it only through `lazy(() => import(...))`.
 *
 * Together those mean the charting family cannot be in the entry chunk: the
 * entry's only route to the one file that imports it is a dynamic import.
 * Verified against the build after the fact — 421.80 kB out of the entry,
 * `recharts` at 0 occurrences in `dist/assets/index-*.js` — and recorded in
 * `docs/PROJECT-INVENTORY.md`, but the build is not what this file checks.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { t } from "../../src/lib/i18n";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const APP = readFileSync(join(ROOT, "src/App.tsx"), "utf8");
const CSS = readFileSync(join(ROOT, "src/styles.css"), "utf8");

/** Every source file, as a repo-relative path. */
function sourceFiles(dir = "src", out: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) sourceFiles(rel, out);
    else if (/\.tsx?$/.test(rel)) out.push(rel);
  }
  return out;
}

/** The files that name recharts as an import, not as a substring. */
const CHARTING_IMPORTERS = sourceFiles().filter((f) =>
  /from\s+["']recharts["']/.test(readFileSync(join(ROOT, f), "utf8")),
);

describe("recharts can only be reached through a dynamic import", () => {
  test("exactly one file in src/ imports it, and that file is InsightsView", () => {
    expect(CHARTING_IMPORTERS).toEqual(["src/views/InsightsView.tsx"]);
  });

  test("App.tsx does not import InsightsView statically", () => {
    expect(APP).not.toMatch(/^import\s+InsightsView\s+from/m);
    // The static form is the whole failure mode: it would pull the charting
    // family back into the entry chunk while leaving every other assertion
    // here still true.
    expect(APP).not.toContain('from "./views/InsightsView"');
  });

  test("and it loads it with lazy(() => import(...)) instead", () => {
    expect(APP).toContain('const InsightsView = lazy(() => import("./views/InsightsView"));');
  });

  test("the lazy binding is named InsightsView, so the existing JSX guard still holds", () => {
    // `tests/batch11-polish.test.ts` pins the literal
    // `<InsightsView onGoToday={() => setTab("today")} />` in this file. That
    // guard is about the CTA wiring, not about how the view is loaded, so it
    // must not be made to fail by a rename that only affects the import.
    expect(APP).toContain('<InsightsView onGoToday={() => setTab("today")} />');
  });
});

describe("the split is built in a way that can actually work", () => {
  test("the lazy call is at module scope, not inside a component body", () => {
    // A `lazy()` call in a render builds a new lazy component every time, so
    // the loaded chunk is discarded and re-fetched forever. The declaration
    // has to sit above the first component definition.
    const lazyAt = APP.indexOf("const InsightsView = lazy(");
    const shellAt = APP.indexOf("function Shell()");
    expect(lazyAt).toBeGreaterThan(-1);
    expect(shellAt).toBeGreaterThan(-1);
    expect(lazyAt).toBeLessThan(shellAt);
  });

  test("the mount is inside a Suspense boundary", () => {
    const mount = APP.slice(APP.indexOf('tab === "insights"'));
    expect(mount).toContain("<Suspense");
    expect(mount.indexOf("<Suspense")).toBeLessThan(mount.indexOf("<InsightsView"));
    expect(mount).toContain("</Suspense>");
  });

  test("and that Suspense is inside a boundary, so a failed chunk is survivable", () => {
    // `lazy` rethrows the import failure during render. With nothing above it
    // the nearest boundary is React's root, which unmounts the whole app — so
    // a reader who lost the chunk and opened Elemzés offline would get a blank
    // page rather than one degraded tab.
    const mount = APP.slice(APP.indexOf('tab === "insights"'));
    expect(mount).toContain("<ChunkBoundary>");
    expect(mount.indexOf("<ChunkBoundary>")).toBeLessThan(mount.indexOf("<Suspense"));
    expect(mount).toContain("</ChunkBoundary>");
    expect(APP).toContain("static getDerivedStateFromError()");
  });

  test("both placeholder states are styled, with reserved height", () => {
    expect(CSS).toContain(".view-loading,");
    expect(CSS).toContain(".view-error {");
    // Height is reserved so the charts do not snap the page as the chunk lands.
    const block = CSS.slice(CSS.indexOf(".view-loading,"), CSS.indexOf(".empty-state {"));
    expect(block).toContain("min-height");
    // The muted ink through the app's slot (`--app-ink-soft`), which answers
    // with the theme's `--ink-soft` without a picture and with the measured
    // decision under one — the claim is the same, the door has a new name.
    expect(block).toContain("var(--app-ink-soft)");
    // Tokens only — this stylesheet has a guard counting its gradients.
    expect(block).not.toContain("gradient");
    expect(block).not.toMatch(/#[0-9a-f]{3,6}/i);
  });

  test("the loading text is Hungarian, like every other string in the shell", () => {
    // Round 14 moved both messages into the catalogue, so this reads the
    // resolved values rather than grepping `App.tsx` — and asserts the wiring,
    // which is the part a grep could never check.
    expect(t("app.insightsLoading")).toBe("Elemzés betöltése…");
    expect(t("app.insightsFailed")).toContain("Az Elemzés nézet most nem tölthető be.");
    expect(APP).toContain('t("app.insightsLoading")');
    expect(APP).toContain('t("app.insightsFailed")');
  });
});