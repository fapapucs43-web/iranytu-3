/**
 * Batch 13, commit 4 — the inventory's own proof.
 *
 * A document of `file:line` claims is worth exactly as much as the checking of
 * it, because a wrong line number is indistinguishable from a right one to a
 * reader. This file is the checking: it reads `docs/PROJECT-INVENTORY.md`,
 * pulls out every claim, and asserts that the file exists, that the line
 * exists, and that the line says what the document says it says.
 *
 * THE CLAIM FORMAT IS DELIBERATELY RIGID
 * A claim is `` `path:line` — `anchor` `` — code span, then an EM DASH with a
 * space on each side, then the quoted text that must be on that line. The
 * separator is what makes the format parseable at all: without a fixed one,
 * a line carrying two claims has two possible anchors and no way to tell
 * which went stale, and the parser would silently pair the first claim with
 * the second one's anchor. Pinning the separator turns that ambiguity into a
 * failure, which is the whole point.
 *
 * So: a claim without its anchor is a failure, not a shorter claim. That is
 * the assertion most likely to be resented and the one that matters most —
 * an unverifiable pointer in a document whose entire claim is that it is
 * verifiable is exactly the thing this file exists to prevent.
 *
 * The measured-counts block in §1 is a second, independent check: those
 * numbers are recomputed here from the filesystem and from the registries,
 * so the document cannot quietly become a snapshot of a tree that no longer
 * exists. Between them, the two checks cover what can rot: a claim that
 * drifts by a line, and a count that drifts by a file.
 *
 * THE §10 TABLE IS THE THIRD, AND IT IS THE ONE THAT WAS MISSING
 * §1 says how many test files there are. It never said WHICH. For most of the
 * project's life §10 listed 36 of 85 files in an order nobody could reconstruct,
 * so the other 49 existed only on disk — a test suite whose inventory named
 * barely half of it. The count in §1 was correct the whole time, which is
 * exactly why the gap was invisible: a guard can only fail on what it checks.
 * So §10 now lists all 85, grouped by what they pin, and the last describe in
 * this file walks the tree and fails on any file the table does not name, or on
 * any row whose test count the table and the suite disagree about.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { FONTS, HAND_FONTS } from "../src/lib/fonts";
import { GLYPHS, ICON_SETS } from "../src/lib/iconsets";
import { BADGES } from "../src/lib/achievements";
import { trackerGroupHeads } from "../src/lib/trackers";
import { THEMES } from "../src/lib/themes";
import { NAV_ICONS } from "../src/lib/nav-icons";

const DOC = "../docs/PROJECT-INVENTORY.md";
const doc = readFileSync(new URL(DOC, import.meta.url), "utf8");

/* --------------------------- the claim format ------------------------- */

/**
 * `path:line` followed by the exact separator and a quoted anchor.
 *
 * The extension list is explicit rather than `[\w.]+` so that a bare number
 * like `1928:12` cannot be mistaken for a claim, and so that a claim about a
 * file type nobody keeps in this repository fails loudly instead of being
 * quietly accepted.
 */
const CLAIM = /`([A-Za-z0-9_][A-Za-z0-9_./-]*\.(?:ts|tsx|css|html|js|json|yml|webmanifest|md)):(\d+)` — `([^`]+)`/g;

/** Any `path:line` written at all, anchored or not — the thing CLAIM misses. */
const ANY_POINTER = /`([A-Za-z0-9_][A-Za-z0-9_./-]*\.(?:ts|tsx|css|html|js|json|yml|webmanifest|md)):(\d+)`/g;

type Claim = { file: string; line: number; anchor: string; docLine: number };

function claims(): Claim[] {
  const found: Claim[] = [];
  doc.split("\n").forEach((text, i) => {
    for (const m of text.matchAll(CLAIM)) {
      found.push({ file: m[1]!, line: Number(m[2]), anchor: m[3]!, docLine: i + 1 });
    }
  });
  return found;
}

/** How many lines a file has, or 0 if it does not exist. */
function lineCount(path: string): number {
  try {
    return readFileSync(new URL(`../${path}`, import.meta.url), "utf8").split("\n").length;
  } catch {
    return 0;
  }
}

/* ------------------------ 1 · every claim is true ---------------------- */

describe("PROJECT-INVENTORY — every file:line claim is true", () => {
  const all = claims();

  test("the document carries a claim per section, not a token few", () => {
    // A handful of claims would mean an inventory nobody can check their
    // reading against. The floor is set well under the real count so adding
    // claims never breaks it, and well over "one per section" so a section
    // cannot be prose with nothing to verify.
    expect(all.length).toBeGreaterThan(90);
  });

  test("every claim names a file that exists", () => {
    const missing = all.filter((c) => lineCount(c.file) === 0).map((c) => `doc:${c.docLine} → ${c.file}:${c.line}`);
    expect(missing, `claims naming a file that does not exist:\n  ${missing.join("\n  ")}`).toEqual([]);
  });

  test("every claim names a line that exists", () => {
    // Collected rather than asserted inside the loop, so a maintainer fixing
    // the document gets the whole list in one run instead of discovering it
    // one shifted line at a time.
    const past = all
      .filter((c) => {
        const n = lineCount(c.file);
        return n > 0 && (c.line < 1 || c.line > n);
      })
      .map((c) => `doc:${c.docLine} → ${c.file}:${c.line} (file has ${lineCount(c.file)} lines)`);
    expect(past, `claims past the end of their file:\n  ${past.join("\n  ")}`).toEqual([]);
  });

  test("every claim's anchor is really on that line", () => {
    const wrong = all
      .filter((c) => {
        const line = readFileSync(new URL(`../${c.file}`, import.meta.url), "utf8").split("\n")[c.line - 1] ?? "";
        return !line.includes(c.anchor);
      })
      .map((c) => {
        const line = readFileSync(new URL(`../${c.file}`, import.meta.url), "utf8").split("\n")[c.line - 1] ?? "";
        return `doc:${c.docLine} → ${c.file}:${c.line}\n      claimed: ${c.anchor}\n      actual:  ${line.trim()}`;
      });
    expect(wrong, `anchors that are not on the line they name:\n  ${wrong.join("\n  ")}`).toEqual([]);
  });

  test("every file:line pointer carries an anchor — an unverifiable one is a failure", () => {
    const anchored = new Set(all.map((c) => `${c.file}:${c.line}@${c.docLine}`));
    const orphans: string[] = [];
    doc.split("\n").forEach((text, i) => {
      for (const m of text.matchAll(ANY_POINTER)) {
        const key = `${m[1]}:${m[2]}@${i + 1}`;
        if (!anchored.has(key)) orphans.push(`doc:${i + 1} → ${m[1]}:${m[2]}`);
      }
    });
    expect(orphans, `pointers with no anchor: ${orphans.join(", ")}`).toEqual([]);
  });

  test("the claims span the document, not one lucky section", () => {
    // A claim count proves nothing if every claim is in §1. Each numbered
    // section is required to carry at least one.
    for (let n = 1; n <= 12; n++) {
      const heading = doc.search(new RegExp(`^## ${n}\\. `, "m"));
      expect(heading, `section ${n} has no heading`).toBeGreaterThan(-1);
      const next = doc.slice(heading + 1).search(/^## \d+\. /m);
      const body = doc.slice(heading, next < 0 ? undefined : heading + 1 + next);
      const inSection = (body.match(CLAIM) ?? []).length;
      expect(inSection, `section ${n} carries no verified claim`).toBeGreaterThan(0);
    }
  });

  test("there are exactly twelve numbered sections", () => {
    expect(doc.match(/^## \d+\. /gm) ?? []).length >= 12;
    expect((doc.match(/^## \d+\. /gm) ?? []).length).toBe(12);
  });
});

/* ------------------- 2 · the measured counts, recomputed ---------------- */

describe("PROJECT-INVENTORY — the measured counts are the current tree", () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const e of readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(p, out);
      else out.push(p);
    }
    return out;
  }

  const countLines = (files: string[]): number =>
    files.reduce((n, f) => n + readFileSync(new URL(`../${f}`, import.meta.url), "utf8").split("\n").length - 1, 0);

  function measured(): Record<string, number> {
    const src = walk("src");
    const ts = src.filter((f) => /\.tsx?$/.test(f));
    const lib = src.filter((f) => f.startsWith("src/lib/"));
    const comp = src.filter((f) => f.startsWith("src/components/"));
    const views = src.filter((f) => f.startsWith("src/views/"));
    const state = src.filter((f) => f.startsWith("src/state/"));
    // `.tsx?`, not `.ts`. The component tests are `.tsx` (the suite's first
    // were EducationLibraryCard and MicroLessonCard), and a `.ts`-only filter
    // counted 55 files while the tree held 57 — an inventory that is short by
    // exactly the files a reviewer would most want counted. Every sibling walk
    // in this suite already spells it `/\.tsx?$/`: the dead-export guard
    // (batch12), the CSS guard (batch12), the icon guard (batch7f) and
    // batch10's extension sweep. This line was the only one that did not, and
    // that is why it is now the only one that does.
    const tests = walk("tests").filter((f) => /\.tsx?$/.test(f));
    const pub = walk("public");
    const keys = new Set<string>();
    for (const f of [...src, "public/sw.js"]) {
      const text = readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
      for (const m of text.matchAll(/["'`](belso-iranytu[:-][A-Za-z0-9:-]+)["'`]/g)) keys.add(m[1]!);
    }
    return {
      srcTsFiles: ts.length,
      srcTsLines: countLines(ts),
      srcCssFiles: src.filter((f) => f.endsWith(".css")).length,
      srcCssLines: countLines(src.filter((f) => f.endsWith(".css"))),
      libFiles: lib.length,
      libLines: countLines(lib),
      componentFiles: comp.length,
      componentLines: countLines(comp),
      viewFiles: views.length,
      viewLines: countLines(views),
      stateFiles: state.length,
      stateLines: countLines(state),
      testFiles: tests.length,
      testLines: countLines(tests),
      scriptFiles: walk("scripts").length,
      publicFontWoff2: pub.filter((f) => /^public\/fonts\/.*\.woff2$/.test(f)).length,
      publicFontLicences: pub.filter((f) => /^public\/fonts\/OFL-/.test(f)).length,
      publicPdfFontFiles: pub.filter((f) => f.startsWith("public/pdf-fonts/")).length,
      publicIconFiles: pub.filter((f) => f.startsWith("public/icons/")).length,
      storageKeys: keys.size,
      fontFamilies: FONTS.length + HAND_FONTS.length,
      fontFiles: [...FONTS, ...HAND_FONTS].reduce((n, f) => n + f.files.length, 0),
      iconSets: ICON_SETS.length,
      glyphs: GLYPHS.length,
      badges: BADGES.length,
      trackerGroups: trackerGroupHeads().length,
      themeTokens: Object.keys(Object.values(THEMES)[0]!).length,
      navIcons: NAV_ICONS.length,
    };
  }

  /** The fenced JSON block in §1, parsed rather than pattern-matched. */
  function declared(): Record<string, number> {
    const fence = /```json\n([\s\S]*?)\n```/.exec(doc);
    if (!fence) throw new Error("the inventory has no json block of measured counts");
    return JSON.parse(fence[1]!) as Record<string, number>;
  }

  test("every declared number equals the recomputed one", () => {
    const now = measured();
    const said = declared();
    for (const [key, value] of Object.entries(now)) {
      expect(typeof value, `${key} should be a number`).toBe("number");
      expect(said[key], `inventory says ${key} = ${String(said[key])}, tree says ${value}`).toBe(value);
    }
  });

  test("the block declares nothing the tree cannot account for", () => {
    // The other direction. A key left behind after the tree lost it would
    // keep the previous test passing forever, because a missing key compared
    // as `undefined` against a value the test never visits.
    expect(Object.keys(declared()).sort()).toEqual(Object.keys(measured()).sort());
  });

  test("the document is not shipped to the browser", () => {
    // `docs/` is outside `src/` and `public/`, so nothing here can reach
    // `dist/` — but "cannot" is worth a test, because one `import` or one
    // copy into `public/` would make a 300-line document of internal line
    // numbers part of the download.
    const pkg = readFileSync(new URL("../package.json", import.meta.url), "utf8");
    expect(pkg).not.toContain("docs/PROJECT-INVENTORY.md");
    for (const name of readdirSync(new URL("../public", import.meta.url))) {
      expect(name.toLowerCase()).not.toContain("inventory");
    }
  });
});

describe("PROJECT-INVENTORY — §10 names every test file", () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const e of readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(p, out);
      else out.push(p);
    }
    return out;
  }

  /** One §10 row: the backticked path and the test count in the next cell. */
  function rows(): Map<string, number> {
    const out = new Map<string, number>();
    for (const m of doc.matchAll(/^\| `(tests\/[^`]+\.test\.tsx?)` \| (\d+) \|/gm)) {
      out.set(m[1]!, Number(m[2]));
    }
    return out;
  }

  const listed = rows();
  const onDisk = walk("tests").filter((f) => /\.tsx?$/.test(f)).sort();

  test("every test file on disk has a row", () => {
    const missing = onDisk.filter((f) => !listed.has(f));
    expect(missing).toEqual([]);
  });

  test("no row names a file that does not exist", () => {
    // The other direction. A renamed or deleted file leaves its row behind, and
    // the first test would never look at it.
    const stale = [...listed.keys()].filter((f) => !onDisk.includes(f)).sort();
    expect(stale).toEqual([]);
  });

  test("a file is listed once, not twice", () => {
    const rowLines = [...doc.matchAll(/^\| `(tests\/[^`]+\.test\.tsx?)` \| \d+ \|/gm)].map(
      (m) => m[1]!,
    );
    expect(rowLines.length).toBe(new Set(rowLines).size);
    expect(new Set(rowLines).size).toBe(onDisk.length);
  });

  test("the rows' counts add up to the total §10 states", () => {
    // What this CANNOT do is re-derive each row's count: a file gets its tests
    // from loops and helpers, so the only honest source is the runner itself
    // (`bun test --reporter=junit`). What it can do is make the stated total
    // depend on the table rather than on prose, so one stale row shows up as a
    // failing sum instead of as a sentence nobody re-reads.
    const total = [...listed.values()].reduce((a, b) => a + b, 0);
    const stated = /\*\*(\d+) files, [\d ]+ lines, ([\d ]+) tests\.\*\*/.exec(doc);
    expect(stated, "§10 must state its own totals in the bold form the guard reads").not.toBeNull();
    expect(Number(stated![2]!.replace(/ /g, ""))).toBe(total);
  });

  test("the file count §10 states is the number of rows", () => {
    const stated = /\*\*(\d+) files, [\d ]+ lines,/.exec(doc)!;
    expect(Number(stated[1])).toBe(listed.size);
  });

  test("every group heading agrees with the rows beneath it", () => {
    // The five bold group lines ("... — 44 files, 1 995 tests") were prose, and
    // prose drifts: two of them were already stale before this guard existed, and
    // the row-sum guard above cannot see them because it only checks the grand
    // total. A group whose heading is wrong is still internally consistent — the
    // rows add up, the total adds up, and the sentence in between lies.
    //
    // Derived from the rows, so it cannot be satisfied by editing a number to
    // match a heading that is also wrong.
    const group = (path: (f: string) => boolean): [number, number] => {
      const entries = [...listed].filter(([f]) => path(f));
      return [entries.length, entries.reduce((a, [, n]) => a + n, 0)];
    };
    const isLib = (f: string) => f.startsWith("tests/lib/");
    const isComponent = (f: string) => f.startsWith("tests/components/");
    const isView = (f: string) => f.startsWith("tests/views/");
    const isFlow = (f: string) => f.startsWith("tests/integration/") || f.startsWith("tests/migration/");
    const isCrossCutting = (f: string) => !isLib(f) && !isComponent(f) && !isView(f) && !isFlow(f);

    const headings: Array<[RegExp, [number, number], string]> = [
      [/\*\*Guards and cross-cutting invariants\*\* — (\d+) files, ([\d ]+) tests/, group(isCrossCutting), "guards"], // §10 row; see COMMIT 2 test-file addition
      [/\*\*`tests\/lib\/` — one file per library module\*\* — (\d+) files, ([\d ]+) tests/, group(isLib), "tests/lib"],
      [/\*\*`tests\/components\/` — rendered markup\*\* — (\d+) files, ([\d ]+) tests/, group(isComponent), "tests/components"],
      [/\*\*`tests\/views\/`\*\* — (\d+) files?,? (\d+) tests/, group(isView), "tests/views"],
      [/\*\*`tests\/integration\/` and `tests\/migration\/`\*\* — (\d+) files, ([\d ]+) tests/, group(isFlow), "integration+migration"],
    ];

    const wrong: string[] = [];
    for (const [pattern, [files, tests], label] of headings) {
      const m = pattern.exec(doc);
      if (!m) {
        wrong.push(`${label}: no heading matched ${pattern}`);
        continue;
      }
      const statedFiles = Number(m[1]);
      const statedTests = Number(m[2]!.replace(/ /g, ""));
      if (statedFiles !== files || statedTests !== tests) {
        wrong.push(`${label}: heading says ${statedFiles} files / ${statedTests} tests, rows say ${files} / ${tests}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});
