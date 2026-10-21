/**
 * The four views, checked for reachability the way `src/lib` is.
 *
 * `tests/batch12-dead-export.test.ts` answers one question about `src/lib`: is
 * anything in there that nothing can reach? Its answer is deliberately
 * conservative — an export counts as dead only when its declaration is the
 * single occurrence in the whole repository — and it is the reason five dead
 * functions and a superseded constant are gone rather than merely unused.
 *
 * The four views had no equivalent. That is an asymmetry worth closing, and it
 * is a real one: the views are the largest files in the app and the ones most
 * edited, because every feature lands there first and then moves. `TodayView`
 * is roughly 500 lines and `SettingsView` roughly 700, each holding local
 * helpers, section-label tables and mount lists that nothing outside the file
 * can see. A helper that stops being called there is invisible to every other
 * guard in this repository, because `src/lib` has nothing to do with it.
 *
 * FOUR CHECKS, IN THE ORDER A VIOLATION WOULD BE FOUND
 *
 *  1. EVERY IMPORT IS NAMED IN THE BODY. The cheapest and the one that catches
 *     most: an import left behind when a feature moved out is the usual way a
 *     view accumulates. Counted by identifier, so `import { Card }` used twice
 *     still counts once.
 *  2. EVERY DECLARED `function` IS REACHED. A local helper nobody names is dead
 *     code that still typechecks, still bundles, and still gets edited.
 *  3. EVERY EXPORTED CONSTANT IS READ SOMEWHERE. A view exports its section-id
 *     tables so a test can pin them; if an export is never read by another file
 *     either, it is decoration.
 *  4. NOTHING IS IMPORTED AND NEVER NAMED — repeated as a standalone assertion
 *     so the failure names the file and the identifier rather than arriving as
 *     a count.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * - React hooks are not checked for being called inside a component; that is the
 *   compiler's job and it does it correctly.
 * - JSX does not need an imported identifier — `<Foo />` names it — so check 1
 *   counts any occurrence of the identifier in the source, which covers both
 *   the JSX and a plain call.
 * - Line coverage is not attempted and could not be without a runner this
 *   project deliberately does not have. This asks whether a name is reachable,
 *   not whether it executes on a given path.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Two levels up: this file lives in `tests/views/`, so `..` would resolve to
// `tests/` and every path below would be `tests/src/views/…`.
const ROOT = fileURLToPath(new URL("../..", import.meta.url));

const VIEWS = [
  "src/views/TodayView.tsx",
  "src/views/JournalView.tsx",
  "src/views/InsightsView.tsx",
  "src/views/SettingsView.tsx",
] as const;

function source(path: string): string {
  return readFileSync(ROOT + path.replace(/^/, "/"), "utf8");
}

/** The import block, up to the first top-level declaration that is not one. */
function importsOf(src: string): string {
  const lines = src.split("\n");
  const out: string[] = [];
  let inImport = false;
  for (const line of lines) {
    if (/^import\b/.test(line)) inImport = true;
    else if (inImport && /^(export )?(const|function|type|interface|class|let)\b/.test(line)) break;
    if (inImport) out.push(line);
  }
  return out.join("\n");
}

/** Named bindings in the import block, without the `from "…"` clause. */
function importedNames(src: string): string[] {
  const names = new Set<string>();
  for (const line of importsOf(src).split("\n")) {
    const clause = line.replace(/^import\s*/, "").replace(/\s+from\s+["'].*$/, "").trim();
    if (!clause || clause.startsWith("type ")) continue;
    const braces = clause.match(/\{([^}]*)\}/);
    if (braces) {
      for (const part of braces[1]!.split(",")) {
        const name = part.replace(/^\s*type\s+/, "").split(/\s+as\s+/).pop()!.trim();
        if (name) names.add(name);
      }
      continue;
    }
    const def = clause.replace(/^\*\s*as\s*/, "").trim();
    if (/^[A-Za-z_$][\w$]*$/.test(def)) names.add(def);
  }
  return [...names];
}

/** The body with the import block removed, so a name cannot match its own import. */
function body(src: string): string {
  return src.slice(importsOf(src).length);
}

describe("every view is reachable — the same rule src/lib already answers", () => {
  describe.each(VIEWS)("%s", (path) => {
    const src = source(path);

    test("every import is named in the body", () => {
      const rest = body(src);
      const unused = importedNames(src).filter((n) => !new RegExp(`\\b${n}\\b`).test(rest));
      expect(unused, `${path} imports nothing reads`).toEqual([]);
    });

    test("every declared function is reached", () => {
      const rest = body(src);
      const declared = [...rest.matchAll(/^\s*function\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]!);
      // Reachability, not `name(` specifically: `<DataSection />` and
      // `onConfirm={confirmEnable}` are how half these functions are used, and
      // a rule that demanded a call site would flag every component passed as
      // a prop. Two hits means the declaration plus at least one use.
      const unreached = declared.filter(
        (n) => (rest.match(new RegExp(`\\b${n}\\b`, "g")) ?? []).length < 2,
      );
      expect(unreached, `${path} declares a function nothing reaches`).toEqual([]);
    });

    test("every exported constant is read somewhere", () => {
      const exported = [
        ...src.matchAll(/^export\s+const\s+([A-Za-z_$][\w$]*)/gm),
      ].map((m) => m[1]!);
      expect(exported.length, `${path} exports nothing, which would make this vacuous`).toBeGreaterThan(0);
      const orphans = exported.filter((name) => {
        for (const other of [src, ...VIEWS.filter((v) => v !== path).map(source)]) {
          const hits = [...other.matchAll(new RegExp(`\\b${name}\\b`, "g"))].length;
          // One hit is the declaration itself in its own file.
          if (other === src && hits >= 2) return false;
          if (other !== src && hits >= 1) return false;
        }
        return true;
      });
      expect(orphans, `${path} exports a name nothing reads`).toEqual([]);
    });
  });

  test("the guard is not vacuous: all four views are in the sweep", () => {
    expect(VIEWS.length).toBe(4);
    for (const path of VIEWS) {
      expect(source(path).length, `${path} was empty — the sweep would pass on nothing`).toBeGreaterThan(1000);
    }
  });
});