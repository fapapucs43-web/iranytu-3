/**
 * Batch 7h — tracker values finally get read, and the PDF learns to spell.
 *
 * TWO SEPARATE THINGS, IN ONE BATCH
 *
 * 1. The display gap. Batch 7e added eight trackers. Storing them, exporting
 *    them to CSV and counting them in the correlation grid all worked from the
 *    first commit. Rendering one did not: `grep -rn trackerValues src/` found
 *    four readers and every one of them was a machine. So a step count was
 *    written, exported and correlated, and never shown to the person who typed
 *    it. This file is the evidence that it is now shown.
 *
 * 2. A bug that shipped before this batch. jsPDF's built-in fonts are WinAnsi,
 *    which has no `ő`. The report title "Belső Iránytű — közérzet-jelentés"
 *    has been reaching the page as `Bels<U+0001>q Irányt<U+0001>q <U+0097>`:
 *    a control byte and a stray letter where two words should be. It is worth
 *    recording that this was never a glyph problem and never a font problem —
 *    the text was simply handed to a font that cannot draw it.
 *
 * WHY THE FIRST TESTS HERE MEASURE INSTEAD OF TRUSTING THE MAP
 * The folding table in `reportPdf.ts` claims seven characters are unencodable.
 * That claim was verified by drawing each one alone in a real jsPDF document
 * and reading the content stream back, and `pdfSafe` is checked against real
 * jsPDF output below rather than against the table that motivated it. The
 * probe also draws the UNFOLDED string and asserts it IS corrupt: a test that
 * cannot fail is worse than no test, and "no U+0001" is exactly the kind of
 * assertion that passes for the wrong reason.
 *
 * WHAT BATCH 7i CHANGED IN THIS FILE, AND WHY IT IS MOSTLY DELETIONS
 * Every assertion below that spelled a Hungarian word the FOLDED way — `Belsö`,
 * `Idöjárás`, `Sport idötartama`, `Közepes erösségü`, a hyphen where the report
 * draws an em dash — now spells it correctly, because the report embeds a
 * subsetted Noto Sans and the fold is only the fallback for a device that
 * cannot fetch it. That is not a loosened assertion: it is a corrected one,
 * and it is corrected against a real font this file loads, not against the
 * expectation that one exists.
 *
 * The `pdfSafe` tests themselves stay, unchanged and still meaningful. The
 * function is the offline path, and the offline path is a real path — it is
 * what a first export on a device that has never been online will draw, and
 * `tests/batch7i.test.ts` proves it end to end. What is gone is the idea that
 * it is the NORMAL path.
 */
import { describe, expect, mock, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const reportPdf = readFileSync(join(ROOT, "src/lib/reportPdf.ts"), "utf8");

/**
 * Intercept jsPDF the way `tests/batch6-pdf.test.ts` does, so these are
 * assertions about the strings the generator ACTUALLY DRAWS rather than about
 * what the source appears to say. Everything the fake is asked to do that is
 * not `text` is a no-op; an unknown call is deliberately not an error, because
 * a strict fake makes every future jsPDF method a test failure.
 */
let drawn: string[] = [];
let pageBreaks = 0;
/** Where each string was drawn, so a page break can be located rather than counted. */
let positions: { text: string; x: number; y: number }[] = [];

class FakeDoc {
  private noop() {}
  text(t: unknown, x?: number, y?: number) {
    if (typeof t === "string") {
      drawn.push(t);
      positions.push({ text: t, x: x ?? 0, y: y ?? 0 });
    }
    return this;
  }
  setFont() { return this; }
  // Batch 7i: the generator hands the two subsets to jsPDF before it draws
  // anything. The fake cannot register a font and does not pretend to — a
  // silent no-op here is honest, because what these assertions are about is the
  // STRING handed over, and the registration itself is proven against a real
  // document in `tests/batch7i.test.ts`, down to the ToUnicode map the embedded
  // font produces. The class's index signature types these calls without
  // complaint and then leaves them undefined at runtime, which is why they have
  // to exist as methods rather than as nothing.
  addFileToVFS() { return this; }
  addFont() { return this; }
  setFontSize() { return this; }
  setTextColor() { return this; }
  setFillColor() { return this; }
  setDrawColor() { return this; }
  setLineWidth() { return this; }
  line() { return this; }
  rect() { return this; }
  addPage() { pageBreaks++; return this; }
  internal = { pageSize: { getWidth: () => 595, getHeight: () => 842 } };
  save() { return this; }
  output() { return new ArrayBuffer(8); }
  [k: string]: unknown;
}

mock.module("jspdf", () => ({ jsPDF: FakeDoc as unknown as typeof import("jspdf").jsPDF }));

const { exportMoodReportPdf } = await import("../src/lib/reportPdf");

/**
 * The report's own font, primed before a single test in this file runs.
 *
 * Until Batch 7i these tests passed for the wrong reason: `loadPdfFonts()`
 * found no `fetch` it could satisfy for `/pdf-fonts/…` under Bun, every
 * generator call fell back to Helvetica, and the assertions below had been
 * written to match the folded text that produced. Priming the loader with the
 * real committed subset is what makes them assert what a reader sees.
 *
 * It is primed HERE, at module scope, rather than inside `generate()`, because
 * the loader caches one result per session on purpose and `bun test` runs
 * every test file in a single process: a prime inside a test would leak into
 * whichever file ran next, and a reset in one file would decide another's
 * outcome. A failure to prime throws here rather than surfacing later as a
 * hundred confusing assertion failures about a font nobody loaded.
 */
const { loadPdfFonts, resetPdfFontCacheForTests } = await import("../src/lib/pdfFonts");
resetPdfFontCacheForTests();
const primed = await loadPdfFonts((async (input: RequestInfo | URL) => {
  const name = String(input).replace(/^.*\/pdf-fonts\//, "");
  return new Response(readFileSync(join(ROOT, "public", "pdf-fonts", name)));
}) as unknown as typeof fetch);
if (!primed.ok) throw new Error(`the PDF font could not be primed: ${primed.reason}`);

/** One entry, with the given tracker values and nothing else. */
function entryWith(date: string, trackerValues: Record<string, unknown> | undefined) {
  return {
    id: date,
    date,
    mood: 3,
    stress: 4,
    energy: 6,
    activities: [],
    emotions: [],
    note: "",
    trackerValues,
  } as unknown as Parameters<typeof exportMoodReportPdf>[0];
}

async function generate(entries: Parameters<typeof exportMoodReportPdf>[0][]) {
  drawn = [];
  positions = [];
  pageBreaks = 0;
  await exportMoodReportPdf(entries);
  return drawn;
}

/** The characters `pdfSafe` exists for, with the codepoint each one becomes. */
const UNENCODABLE = ["ő", "ű", "—", "–", "‒", "―", "„", "”", "‘", "’", "…", " "];

/** Characters jsPDF's fonts draw perfectly well. Folding these is a bug. */
const ENCODABLE = ["ö", "ü", "á", "é", "í", "ó", "ú", "Á", "É", "Í", "Ó", "Ö", "Ü", "°", "·", "—"];

/**
 * Every string jsPDF wrote, read back out of a REAL generated document.
 *
 * IN A SUBPROCESS, and the reason is worth recording. `tests/batch6-pdf.test.ts`
 * calls `mock.module("jspdf", …)` to intercept the generator, and a module mock
 * in Bun applies to the whole process — not to one file. So an in-process
 * `import("jspdf")` here silently received that fake, whose `output()` returns
 * eight zero bytes, and the probe reported "no corruption" for everything. The
 * control assertion in the test below is what caught it, and it is why the
 * probe asserts the UNFOLDED string is corrupt before trusting anything about
 * the folded one.
 */
function drawInRealPdf(text: string): string {
  const script = `
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(${JSON.stringify(text)}, 48, 100);
    const bytes = new Uint8Array(doc.output("arraybuffer"));
    let pdf = "";
    for (const b of bytes) pdf += String.fromCharCode(b);
    process.stdout.write(pdf.includes("\\u0001") ? "CORRUPT" : "CLEAN");
  `;
  // A temp script file, not `-e`: on Windows `bun` resolves to a `.cmd` shim,
  // and Bun refuses to hand it an argument carrying cmd.exe metacharacters —
  // this script is several lines of quotes and newlines, which is exactly the
  // shape that check rejects. The directory is created under ROOT so the ESM
  // resolver still finds `node_modules`, is named for `.gitignore`, and is
  // removed in a `finally` so a failed probe leaves nothing behind.
  const dir = mkdtempSync(join(ROOT, ".tmp-pdf-"));
  try {
    const file = join(dir, "probe.mjs");
    writeFileSync(file, script, "utf8");
    const proc = Bun.spawnSync(["bun", file], { cwd: ROOT });
    const out = proc.stdout.toString().trim();
    if (proc.exitCode !== 0) {
      throw new Error(`the jsPDF probe failed: ${proc.stderr.toString().slice(0, 400)}`);
    }
    return out;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The first argument of every `doc.text(` in the source, comments stripped. */
function firstArgsOfTextCalls(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const out: string[] = [];
  for (const call of code.matchAll(/doc\.text\(/g)) {
    let i = call.index! + call[0].length;
    const start = i;
    let depth = 0;
    let quote: string | null = null;
    for (; i < code.length; i++) {
      const c = code[i]!;
      if (quote) {
        if (c === "\\") i++;
        else if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "(" || c === "[" || c === "{") depth++;
      else if (c === ")" || c === "]" || c === "}") {
        if (depth === 0) break;
        depth--;
      } else if (c === "," && depth === 0) break;
    }
    out.push(code.slice(start, i).trim().replace(/\s+/g, " "));
  }
  return out;
}

/**
 * Every `doc.text` first argument in the module that is NOT folded, and why
 * each is safe. Adding a line here is a decision; adding a folded call is not.
 */
// ROUND 18 SHRANK THIS LIST BY EIGHT, AND THAT IS THE POINT OF IT.
//
// Nine Hungarian literals used to sit here — `"Összegzés"`, the four column
// headers, the two headings and the chart's own title — each argued clean by
// hand against jsPDF's encoding. Round 18 moved all nine into the catalogue, so
// they are no longer literals this test can vouch for: a translated value is a
// string nobody has read, and `Összegzés` in German is `Zusammenfassung` while
// the Hungarian could gain a `ő` in a future edit. Every one of them now goes
// through `drawable`, which is the one seam that knows what the built-in font
// can draw — so the list lost them and the seam gained them. The four that
// remain are computed from data, not from copy.
const CLEAN_ARGUMENTS = [
  "DISCLAIMER",
  "SOURCE_ATTRIBUTION",
  "formatShort(e.date)",
  "moodByLevel(e.mood).label",
  "String(e.stress)",
  "String(e.energy)",
];

/** The stylesheet with its comments removed — the fold table lives in prose. */
const css = readFileSync(join(ROOT, "src/styles.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

/** Selector (one per comma-separated part) → every body it appears in. */
function rules(): Map<string, string> {
  const map = new Map<string, string>();
  for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const part of selector.split(",")) {
      const key = part.trim();
      map.set(key, (map.get(key) ?? "") + body);
    }
  }
  return map;
}

/**
 * The class names inside `className` attributes, read with a brace count so a
 * nested object or a template's own `${…}` cannot end the scan early.
 *
 * Two refinements, each forced by a real false positive.
 *
 * The obvious version — scan every string in the file — picks up the Hungarian
 * copy, which looks exactly like a class name, and misses a class that is the
 * untagged head of a template literal. Both are recorded in Batch 7g.
 *
 * And a `className` expression may CONTAIN a comparison: this file writes
 * `shown.kind === "flags" ? "a b" : "c"`, and `"flags"` is a value, not a
 * class. A literal directly preceded by a comparison operator is therefore
 * skipped. That is a rule about syntax, not a list of words to ignore, so it
 * cannot quietly stop covering a class that happens to be named something
 * ordinary.
 */
function classLiterals(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(/className(\s*=\s*)(["'{])/g)) {
    const start = m.index! + m[0].length;
    if (m[2] !== "{") {
      out.push(source.slice(start, source.indexOf(m[2], start)));
      continue;
    }
    let depth = 0;
    let end = start;
    for (; end < source.length; end++) {
      if (source[end] === "{") depth++;
      else if (source[end] === "}" && --depth === 0) break;
    }
    const expr = source.slice(start, end);
    for (const lit of expr.matchAll(/"([^"]*)"|'([^']*)'|`([^`$]*)(?:\$|\{)/g)) {
      const before = expr.slice(0, lit.index).trimEnd();
      if (/(?:===|!==|==|!=|=>|[=(,]|^)$/.test(before)) continue;
      out.push(lit[1] ?? lit[2] ?? lit[3] ?? "");
    }
  }
  return out;
}

const RULE = rules();
const entryDetail = readFileSync(join(ROOT, "src/components/EntryDetail.tsx"), "utf8");
const NEW_CLASSES = [
  "detail-trackers",
  "tracker-read-head",
  "tracker-read-row",
  "tracker-read-row-wide",
  "tracker-read-label",
  "tracker-read-value",
  "tracker-chip",
];

describe("the report summarises what was recorded", () => {
  test("no recorded tracker means no section at all", async () => {
    // A mood-only report must not gain an empty heading. Same reasoning as the
    // assessment block, which is gated on there being something to say.
    const lines = await generate([entryWith("2026-03-01", undefined)]);
    expect(lines.join("\n")).not.toContain("Nyomonkövetés");
    const withEmptyValues = await generate([
      entryWith("2026-03-01", { steps: { kind: "number", value: null } }),
    ]);
    // Present but blank is still not recorded: a key exists for every enabled
    // tracker, so "there is a value" would put a section on every report.
    expect(withEmptyValues.join("\n")).not.toContain("Nyomonkövetés");
  });

  test("a recorded tracker draws a section, grouped and in registry order", async () => {
    const lines = await generate([
      entryWith("2026-03-01", {
        sport: { kind: "select", value: "run" },
        "sport-duration": { kind: "number", value: 40 },
        // Two members in the nutrition group, so its head has something to head.
        "nutrition-calories": { kind: "number", value: 1850 },
        "nutrition-note": { kind: "text", value: "alma" },
        steps: { kind: "number", value: 9000 },
      }),
    ]);
    expect(lines).toContain("Nyomonkövetés");
    // A group of more than one gets its head...
    expect(lines).toContain("Étkezés");
    expect(lines).toContain("Sport");
    // ...and a lone tracker does not, or it would print its own label twice.
    expect(lines.filter((l) => l.startsWith("Lépésszám")).length).toBe(1);
    const nutritionHead = lines.indexOf("Étkezés");
    const sportHead = lines.indexOf("Sport");
    const sportLine = lines.findIndex((l) => l.startsWith("Sport —"));
    // As the registry spells it. This line was asserted against the folded
    // `Sport idötartama` until Batch 7i, and the fold was the correct output
    // then: the report could not draw `ő`. Now it embeds a subsetted Noto
    // Sans, and the label reaches the page as the user typed it.
    const duration = lines.findIndex((l) => l.startsWith("Sport időtartama"));
    expect(sportHead).toBeGreaterThan(-1);
    expect(sportLine).toBeGreaterThan(sportHead);
    expect(duration).toBeGreaterThan(sportLine);
    // Nutrition is declared before sport in the registry, so it comes first,
    // and steps is declared last.
    expect(nutritionHead).toBeLessThan(sportHead);
    expect(sportHead).toBeLessThan(lines.findIndex((l) => l.startsWith("Lépésszám")));
  });

  test("the aggregates are computed from samples, not from entries", async () => {
    const lines = await generate([
      entryWith("2026-03-01", { steps: { kind: "number", value: 1000 } }),
      entryWith("2026-03-02", { steps: { kind: "number", value: 2000 } }),
      // The third day has the tracker ENABLED but nothing typed, which is the
      // case a naive average gets wrong: it would read as 1000 steps.
      entryWith("2026-03-03", { steps: { kind: "number", value: null } }),
    ]);
    const line = lines.find((l) => l.startsWith("Lépésszám"))!;
    // `Intl` in hu-HU only groups from five digits, so 1500 is "1500" and not
    // "1 500" — measured, not assumed, like everything else here.
    expect(line).toBe("Lépésszám — átlag 1500 lépés (2/2 nap)");
    // ...not the mean of all three, and not 3/3.
    expect(line).not.toContain("1000");
    expect(line).not.toContain("3/3");
  });

  test("a select reports its most common answer, ties going to declaration order", async () => {
    const lines = await generate([
      entryWith("2026-03-01", { sport: { kind: "select", value: "run" } }),
      entryWith("2026-03-02", { sport: { kind: "select", value: "walk" } }),
      entryWith("2026-03-03", { sport: { kind: "select", value: "walk" } }),
    ]);
    // A group of one: the head line is skipped, so the member line carries the
    // label on its own.
    expect(lines).toContain("Sport — séta (2/3 nap)");
    // A tie must not depend on which day happened to sort first.
    const tie = await generate([
      entryWith("2026-03-01", { sport: { kind: "select", value: "run" } }),
      entryWith("2026-03-02", { sport: { kind: "select", value: "walk" } }),
    ]);
    expect(tie).toContain("Sport — séta (1/2 nap)");
  });

  test("flags are counted per option, and empty ones are left out", async () => {
    const lines = await generate([
      entryWith("2026-03-01", {
        "nutrition-flags": {
          kind: "flags",
          value: { veg: true, protein: true, carb: false, sweet: false, fast: false },
        },
      }),
      entryWith("2026-03-02", {
        "nutrition-flags": {
          kind: "flags",
          value: { veg: true, protein: false, carb: false, sweet: true, fast: false },
        },
      }),
    ]);
    const line = lines.find((l) => l.startsWith("Mit tartalmazott?"))!;
    expect(line).toContain("zöldség / gyümölcs 2/2");
    expect(line).toContain("fehérje 1/2");
    expect(line).toContain("édesség 1/2");
    // An option nobody set is not reported as zero.
    expect(line).not.toContain("gyorsétel");
  });

  test("a free-text tracker is counted, never quoted", async () => {
    const lines = await generate([
      entryWith("2026-03-01", { "nutrition-note": { kind: "text", value: "zabpepe és alma" } }),
      entryWith("2026-03-02", { "nutrition-note": { kind: "text", value: "" } }),
    ]);
    const line = lines.find((l) => l.startsWith("Mit ettél?"))!;
    expect(line).toBe("Mit ettél? — 1/1 napon kitöltve");
    // Thirty entries of two hundred characters is not a summary.
    expect(lines.join("\n")).not.toContain("zabpepe és alma");
  });

  test("the section page-breaks rather than running off the page", async () => {
    // Every group in the registry, on a long enough report that the block
    // cannot fit below the table. 22 entries is not a guess: the table starts
    // at y=438 and adds 16pt a row, so 22 rows end at 790 — past the 782pt
    // floor — and the block's FIRST line has to break. Twenty-one rows end at
    // 774 and would not, which is why the number is exact.
    const all: Record<string, unknown> = {
      sleep: { kind: "slider", value: 7 },
      symptoms: { kind: "checkbox", value: true },
      vitamins: { kind: "checkbox", value: false },
      "weather-condition": { kind: "select", value: "sunny" },
      weather: { kind: "text", value: "napos" },
      "weather-temp": { kind: "number", value: 21 },
      nutrition: { kind: "slider", value: 7 },
      "nutrition-note": { kind: "text", value: "alma" },
      "nutrition-calories": { kind: "number", value: 1800 },
      "nutrition-flags": { kind: "flags", value: { veg: true, protein: true } },
      sport: { kind: "select", value: "run" },
      "sport-duration": { kind: "number", value: 40 },
      steps: { kind: "number", value: 9000 },
    };
    const entries = Array.from({ length: 22 }, (_, i) =>
      entryWith(`2026-03-${String(i + 1).padStart(2, "0")}`, all),
    );
    const lines = await generate(entries);
    const text = lines.join("\n");
    // Every tracker in the registry is summarised, and the labels are compared
    // to the registry's OWN, unfolded — which is what makes this a check that
    // a label is drawn rather than a check that a folded label is drawn. Run
    // it through `pdfSafe` first, as this test did until Batch 7i, and it would
    // pass on a report that had mangled every Hungarian letter in it.
    const { displayDefs } = await import("../src/lib/trackerDisplay");
    for (const def of displayDefs([])) {
      expect(text, `${def.id} (${def.label}) is missing from the report`).toContain(
        def.label,
      );
    }
    expect(text).toContain("Lépésszám — átlag 9000 lépés (22/22 nap)");
    expect(text).toContain("Étkezés");
    expect(text).toContain("Időjárás");
    // The head line carries no icon. That was the built-in font's limit before
    // Batch 7i and it is now a rule about the subset instead: the generator
    // passes the label through `trackerDisplay`'s head formatting, and the
    // subset has no emoji, so drawing one would put a blank on the page.
    expect(text).not.toContain("🥗");
    // And the block's first line is the one that broke, which is checked by
    // position rather than by counting: a break that happened inside the
    // entries table would satisfy a bare counter and prove nothing.
    const heading = positions.find((p) => p.text === "Nyomonkövetés")!;
    expect(heading.y, "the tracker block started at the top of a fresh page").toBe(60);
    expect(pageBreaks, "the tracker block ran past the page without breaking").toBe(1);
  });

  test("the section draws the labels with the letters they were written with", async () => {
    // This test used to be called "nothing the section draws can be corrupted
    // by the font", and it asserted the OPPOSITE of what it asserts now: the
    // long-o, the long-u and the em dash were forbidden, because the built-in
    // font had no glyph for them and the fold removed them. With a subsetted
    // Noto Sans embedded they are the whole point, so the check is inverted.
    //
    // The one thing that is true in both worlds is left where it was: no
    // control byte ever reaches the page. That is the entire signature of the
    // bug this batch's font fixes, and a font change must not be able to bring
    // it back by accident.
    const lines = await generate([
      entryWith("2026-03-01", {
        "weather-condition": { kind: "select", value: "sunny" },
        "weather-temp": { kind: "number", value: 21 },
        "sport": { kind: "select", value: "run" },
        "sport-duration": { kind: "number", value: 40 },
        "nutrition-flags": { kind: "flags", value: { veg: true, sweet: true } },
      }),
    ]);
    for (const line of lines) {
      expect(line, `the generator drew ${JSON.stringify(line)}`).not.toContain("U+0001");
    }
    // The labels are drawn as the registry spells them, and nothing was folded
    // on the way to them. The second half of each pair below is the exact
    // corruption this report shipped with: one substitution per diacritic,
    // named so that a regression is recognisable rather than merely visible.
    const text = lines.join("\n");
    expect(text).toContain("Hőmérséklet — átlag 21 °C");
    expect(text).toContain("Időjárás");
    expect(text).toContain("Sport időtartama");
    expect(text).not.toContain("Hömérséklet");
    expect(text).not.toContain("Idöjárás");
    expect(text).not.toContain("Sport idötartama");
  });
});

describe("the entry detail shows what was recorded", () => {
  /**
   * Classes this file uses that `styles.css` does not define. Both are
   * pre-Batch-7h, both are used in two or three files, and neither is fixed
   * here — the batch cannot know which colour either was meant to be, and a
   * guess would be a new fact about the app's appearance. They are listed so
   * the check below can be exact, and the list is itself checked: fix one and
   * this test says so, add a new one and it fails.
   */
  const PRE_EXISTING_ORPHANS = ["slider-amber", "slider-rose"];

  test("every class the detail uses has a rule, and no new rule is orphaned", () => {
    const used = new Set<string>();
    for (const literal of classLiterals(entryDetail)) {
      for (const token of literal.split(/\s+/)) {
        if (/^[a-z][a-z0-9-]*$/.test(token)) used.add(token);
      }
    }
    const orphans = [...used].filter((n) => !RULE.has(`.${n}`)).sort();
    expect(orphans, "the pre-existing orphan list is out of date").toEqual(
      PRE_EXISTING_ORPHANS,
    );
    // The other direction, and only for what this batch added: a rule the card
    // stopped rendering is a dead branch nobody notices.
    for (const selector of RULE.keys()) {
      if (!/^\.(detail-trackers|tracker-read-[\w-]+|tracker-chip)$/.test(selector)) continue;
      expect(used, `${selector} styles a class the detail never renders`).toContain(
        selector.slice(1),
      );
    }
    for (const name of NEW_CLASSES) {
      expect(used, `${name} is declared in CSS but the block does not use it`).toContain(name);
    }
  });

  test("the detail reads the entry, never the settings", () => {
    // The whole batch turns on this. `trackerValues` is populated from
    // defaultTrackerState for every ENABLED tracker, so the keys record what
    // the settings said that day rather than what anybody typed. Reading the
    // settings now would show a tracker on an entry from before the user had
    // heard of it, and would hide one they recorded and have since switched off.
    expect(entryDetail).not.toContain("enabledTrackers");
    expect(entryDetail).toContain("recordedGroups(entry.trackerValues");
    expect(entryDetail).toContain("describeValue(def, value)");
  });

  test("the block is under the note, in the read-only branch only", () => {
    const note = entryDetail.indexOf('className="detail-note"');
    const block = entryDetail.indexOf('className="detail-trackers"');
    expect(note).toBeGreaterThan(-1);
    expect(block).toBeGreaterThan(note);
    // The guard itself, not just the fact that the block exists. A mutation
    // that turned the guard into `false &&` left every other assertion in this
    // file green, because the block's text was all still in the source.
    expect(entryDetail).toMatch(/\{trackerGroups\.length > 0 && \(/);
    // Editing the entry does not rewrite tracker values, and this batch does
    // not change that: the read-only half is the only half that draws.
    const readOnly = entryDetail.indexOf("{!editing ? (");
    const editBranch = entryDetail.indexOf("mood-row");
    expect(readOnly).toBeGreaterThan(-1);
    expect(block).toBeLessThan(editBranch);
    // There is no DOM harness for this component anywhere in the suite, so
    // these are wiring assertions rather than rendered-output ones. That is the
    // repo's own norm for components (`batch6-ui`, `batch7f` do the same) and
    // it is a real limit: nothing here would catch a row that rendered the
    // wrong tracker, only one that failed to render at all.
  });

  test("the new rules stay inside the tokens high contrast overrides", () => {
    // Same rule as the Year in Pixels block: the palette tokens are written by
    // applyThemeTokens from the chosen theme, and .app.contrast-high does not
    // redefine them, so in high contrast they still hold a value picked for a
    // palette rather than for contrast.
    const body = (RULE.get(".app.contrast-high") ?? "").matchAll(/(--[\w-]+)\s*:/g);
    const themed = new Set([...body].map(([, n]) => n));
    const notColour = new Set(["--font-scale", "--radius"]);
    for (const name of NEW_CLASSES) {
      const decls = RULE.get(`.${name}`) ?? "";
      for (const [, token] of decls.matchAll(/var\((--[\w-]+)\)/g)) {
        expect(
          themed.has(token) || notColour.has(token),
          `.${name} reads ${token}, which high contrast does not override`,
        ).toBe(true);
      }
    }
  });
});

describe("a value is recorded, or it is not", () => {
  test("a BLANK value is not shown either — and that is not the same as absent", async () => {
    // This test exists because a mutation removed `isRecorded` from
    // `recordedGroups` and the whole suite stayed green: every test that
    // reached the grouping passed either a real value or no key at all, and a
    // key holding its own kind's blank was never tried. The detail is the path
    // that draws a key, so that is where it is tried.
    const { recordedGroups, displayDefs } = await import("../src/lib/trackerDisplay");
    const groups = recordedGroups(
      {
        sleep: { kind: "slider", value: 7 },
        // Present, and blank: the tracker was enabled that day and nothing was
        // typed. It must draw nothing, and it must not drag a heading with it.
        steps: { kind: "number", value: null },
        "nutrition-note": { kind: "text", value: "" },
        "nutrition-flags": {
          kind: "flags",
          value: { veg: false, protein: false, carb: false, sweet: false, fast: false },
        },
        sport: { kind: "select", value: "" },
        symptoms: { kind: "checkbox", value: false },
      } as never,
      displayDefs([]),
    );
    const ids = groups.flatMap((g) => g.members.map((m) => m.def.id));
    // A blank number, a blank text and an unset flag are all absent as far as
    // the reader is concerned...
    expect(ids).toContain("sleep");
    expect(ids).toContain("symptoms");
    expect(ids).toContain("sport");
    expect(ids).not.toContain("steps");
    expect(ids).not.toContain("nutrition-note");
    expect(ids).not.toContain("nutrition-flags");
    // ...and no group is left behind with an empty member list, which would
    // draw a heading over nothing.
    for (const group of groups) expect(group.members.length).toBeGreaterThan(0);
  });

  test("an absent tracker is not shown, and never as a dash", async () => {
    const { recordedGroups, displayDefs } = await import("../src/lib/trackerDisplay");
    // Only `sleep` was filled in. Everything else is absent, and the point of
    // the whole batch is that absent is invisible rather than a row of dashes:
    // a dash would report that the user left something out on a tracker that
    // was never on their card.
    const groups = recordedGroups({ sleep: { kind: "slider", value: 7.5 } }, displayDefs([]));
    const ids = groups.flatMap((g) => g.members.map((m) => m.def.id));
    expect(ids).toEqual(["sleep"]);
    const rendered = JSON.stringify(groups);
    expect(rendered).not.toContain("—");
    expect(rendered).not.toContain("steps");
    expect(rendered).not.toContain("sport");
  });

  test("each kind's own blank is not a recording", async () => {
    const { isRecorded, displayDefs } = await import("../src/lib/trackerDisplay");
    const defs = displayDefs([]);
    const steps = defs.find((d) => d.id === "steps")!;
    const note = defs.find((d) => d.id === "nutrition-note")!;
    const flags = defs.find((d) => d.id === "nutrition-flags")!;
    const sport = defs.find((d) => d.id === "sport")!;
    const symptoms = defs.find((d) => d.id === "symptoms")!;

    // The registry says `null` IS the absent meaning, so this is the same
    // claim `trackers.ts` makes, checked from the other side.
    expect(isRecorded(steps, { kind: "number", value: null })).toBe(false);
    expect(isRecorded(note, { kind: "text", value: "   " })).toBe(false);
    expect(isRecorded(flags, { kind: "flags", value: { veg: false, protein: false } })).toBe(false);
    // ...and the two kinds whose blank IS an answer.
    expect(isRecorded(sport, { kind: "select", value: "" })).toBe(true);
    expect(isRecorded(symptoms, { kind: "checkbox", value: false })).toBe(true);
  });

  test("a recorded 0 is a measurement, and survives as one", async () => {
    // The other half of the same registry claim. A `0` is somebody walking
    // nowhere; rendering it as blank would throw away a real reading.
    const { recordedGroups, describeValue, displayDefs } = await import(
      "../src/lib/trackerDisplay"
    );
    const defs = displayDefs([]);
    const steps = defs.find((d) => d.id === "steps")!;
    const groups = recordedGroups({ steps: { kind: "number", value: 0 } }, defs);
    expect(groups.flatMap((g) => g.members.map((m) => m.def.id))).toEqual(["steps"]);
    expect(describeValue(steps, { kind: "number", value: 0 })).toEqual({
      kind: "text",
      text: "0 lépés",
    });
  });

  test("a value of a DIFFERENT kind is not reinterpreted", async () => {
    // The same rule `sanitizeTrackerValue` applies on the way in, applied on
    // the way out. Six kinds share one map; guessing which was meant is how a
    // stored entry gets quietly corrupted.
    const { isRecorded, displayDefs } = await import("../src/lib/trackerDisplay");
    const defs = displayDefs([]);
    const steps = defs.find((d) => d.id === "steps")!;
    expect(isRecorded(steps, { kind: "text", value: "7200" } as never)).toBe(false);
    expect(isRecorded(steps, { kind: "checkbox", value: true } as never)).toBe(false);
  });

  test("the grouping is the registry's own, head first, no new sort", async () => {
    const { recordedGroups, displayDefs } = await import("../src/lib/trackerDisplay");
    const defs = displayDefs([]);
    const groups = recordedGroups(
      {
        "sport-duration": { kind: "number", value: 40 },
        "nutrition-calories": { kind: "number", value: 1850 },
        sport: { kind: "select", value: "run" },
        "weather-temp": { kind: "number", value: 12 },
      },
      defs,
    );
    // Registry order, not the order the keys happened to be written in: the
    // weather group is declared before nutrition, and nutrition before sport.
    expect(groups.map((g) => g.head.id)).toEqual([
      "weather-condition",
      "nutrition",
      "sport",
    ]);
    // A head is first in its own member list even though the key that brought
    // the group in was its child.
    expect(groups[2]!.members.map((m) => m.def.id)).toEqual(["sport", "sport-duration"]);
    expect(groups[1]!.members.map((m) => m.def.id)).toEqual(["nutrition-calories"]);
  });

  test("a custom tracker is displayed, and is a group of its own", async () => {
    const { recordedGroups, displayDefs, describeValue } = await import(
      "../src/lib/trackerDisplay"
    );
    const defs = displayDefs([
      { id: "vizsgamunka", icon: "📖", label: "Vizsgamunka", kind: "slider", min: 0, max: 10 },
    ]);
    const groups = recordedGroups({ vizsgamunka: { kind: "slider", value: 4 } }, defs);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.head.id).toBe("vizsgamunka");
    expect(groups[0]!.members[0]!.def.custom).toBe(true);
    expect(describeValue(groups[0]!.members[0]!.def, { kind: "slider", value: 4 })).toEqual({
      kind: "text",
      text: "4/10",
    });
    // ...and it is not shown when nothing was recorded for it.
    expect(recordedGroups({ sleep: { kind: "slider", value: 7 } }, defs).flatMap((g) =>
      g.members.map((m) => m.def.id),
    )).toEqual(["sleep"]);
  });

  test("values are formatted per kind, in Hungarian", async () => {
    const { describeValue, displayDefs, formatNumber } = await import(
      "../src/lib/trackerDisplay"
    );
    const defs = displayDefs([]);
    const by = (id: string) => defs.find((d) => d.id === id)!;
    const show = (id: string, value: never) => describeValue(by(id), value);

    expect(show("sleep", { kind: "slider", value: 7.5 } as never)).toEqual({
      kind: "text",
      text: "7,5 óra",
    });
    // A slider with no unit reads as a position on a scale, because a bare "7"
    // does not say out of what.
    expect(show("nutrition", { kind: "slider", value: 7 } as never)).toEqual({
      kind: "text",
      text: "7/10",
    });
    expect(show("nutrition-calories", { kind: "number", value: 1850 } as never)).toEqual({
      kind: "text",
      text: "1850 kcal",
    });
    expect(show("weather-temp", { kind: "number", value: -3 } as never)).toEqual({
      kind: "text",
      text: "-3 °C",
    });
    expect(show("sport", { kind: "select", value: "run" } as never)).toEqual({
      kind: "text",
      text: "futás",
    });
    // The synthetic first option is an answer, and it reads as its own label.
    expect(show("sport", { kind: "select", value: "" } as never)).toEqual({
      kind: "text",
      text: "— nem sportoltam —",
    });
    expect(show("nutrition-note", { kind: "text", value: "zabpepe" } as never)).toEqual({
      kind: "text",
      text: "zabpepe",
    });
    expect(show("symptoms", { kind: "checkbox", value: true } as never)).toEqual({
      kind: "text",
      text: "igen",
    });
    expect(show("symptoms", { kind: "checkbox", value: false } as never)).toEqual({
      kind: "text",
      text: "nem",
    });
    // Flags come back as a list, because the detail draws them as chips.
    expect(
      show("nutrition-flags", {
        kind: "flags",
        value: { veg: true, protein: true, carb: false, sweet: true, fast: false },
      } as never),
    ).toEqual({ kind: "flags", labels: ["zöldség / gyümölcs", "fehérje", "édesség"] });
    // ...in registry order, not in the order the flags happen to be set.
    expect(
      show("nutrition-flags", {
        kind: "flags",
        value: { sweet: true, veg: true, protein: false, carb: false, fast: false },
      } as never),
    ).toEqual({ kind: "flags", labels: ["zöldség / gyümölcs", "édesség"] });
    expect(formatNumber(10000)).toContain("10");
  });

  test("a not-recorded value describes as nothing at all", async () => {
    const { describeValue, displayDefs } = await import("../src/lib/trackerDisplay");
    const defs = displayDefs([]);
    const steps = defs.find((d) => d.id === "steps")!;
    expect(describeValue(steps, { kind: "number", value: null })).toBeNull();
    expect(describeValue(steps, { kind: "number", value: 5 } as never)).not.toBeNull();
  });
});

describe("the PDF can spell Hungarian", () => {
  test("pdfSafe folds exactly the characters jsPDF cannot encode", async () => {
    const { pdfSafe } = await import("../src/lib/reportPdf");
    for (const c of UNENCODABLE) {
      expect(pdfSafe(c), `${c} survived the fold`).not.toBe(c);
    }
    // And the two that actually matter for a reader, spelled out.
    expect(pdfSafe("Hőmérséklet")).toBe("Hömérséklet");
    expect(pdfSafe("Sport időtartama")).toBe("Sport idötartama");
    expect(pdfSafe("Időjárás")).toBe("Idöjárás");
    expect(pdfSafe("Belső Iránytű — közérzet-jelentés")).toBe(
      "Belsö Iránytü - közérzet-jelentés",
    );
  });

  test("a character that already works is never folded", async () => {
    // The asymmetry matters: folding `ö` because `ő` needed folding would turn
    // every correctly-spelled `Hőmérséklet` into `Hömérséklet` everywhere,
    // including in the app, to fix a problem that only exists in the PDF.
    const { pdfSafe } = await import("../src/lib/reportPdf");
    for (const c of ENCODABLE.filter((x) => !UNENCODABLE.includes(x))) {
      expect(pdfSafe(c), `${c} was folded but does not need to be`).toBe(c);
    }
    expect(pdfSafe("Étkezés")).toBe("Étkezés");
    expect(pdfSafe("Kalória 1850 kcal")).toBe("Kalória 1850 kcal");
    expect(pdfSafe("napsütéses")).toBe("napsütéses");
    expect(pdfSafe("Sütés")).toBe("Sütés");
  });

  test("the fold is measured against real jsPDF output, not against the table", async () => {
    const { pdfSafe } = await import("../src/lib/reportPdf");
    // The control first, or the rest proves nothing: if the probe could not
    // see corruption, "no corruption below" would be worth nothing.
    expect(
      drawInRealPdf("Hőmérséklet"),
      "jsPDF no longer corrupts ő, so this probe is stale — re-measure it",
    ).toBe("CORRUPT");

    expect(
      drawInRealPdf(pdfSafe("Hőmérséklet")),
      "a folded string still corrupts in a real PDF",
    ).toBe("CLEAN");
    // ...and what survives is the folded text, not a blank page.
    expect(drawInRealPdf(pdfSafe("Hőmérséklet")), "the fold blanked the string").not.toBe(
      "CLEANBLANK",
    );
    expect(drawInRealPdf(pdfSafe("Étkezés")), "an already-clean string must still draw").toBe(
      "CLEAN",
    );
  });

  test("the whole title, folded, comes out clean", async () => {
    const { pdfSafe } = await import("../src/lib/reportPdf");
    const title = "Belső Iránytű — közérzet-jelentés";
    expect(drawInRealPdf(title), "the title is no longer the proof of anything").toBe("CORRUPT");
    expect(drawInRealPdf(pdfSafe(title))).toBe("CLEAN");
  });

  test("the report routes every string of its own through the drawable seam", () => {
    // The behaviour above is what the fold does; this is the wiring, which is
    // the half that actually shipped broken. `tests/batch6-ui.test.ts` pins
    // the wiring of this module the same way, and for the same reason: a
    // correct function that nothing calls has changed nothing.
    //
    // Batch 7i renamed the seam from `pdfSafe` to `drawable`, and that is not a
    // rename for tidiness. Folding is now CONDITIONAL: with the embedded
    // subset the report spells `Belső`, and without it — a first export while
    // offline — the old fold applies. The call sites are unchanged in shape,
    // so the wiring this test asserts is still the wiring that matters: every
    // string the report draws goes through the one function that decides.
    //
    // `DISCLAIMER` and `SOURCE_ATTRIBUTION` are deliberately NOT in this list.
    // Both were checked and both are clean, so the call sites stay exactly as
    // they are — and `doc.text(DISCLAIMER, M, 92` is a literal another test
    // pins, which is the better way to keep it.
    expect(reportPdf).toContain("doc.text(drawable(title), M, 56)");
    // Round 18: the composed "Készült: …" line and the footer note are named
    // consts now, because both wrap a catalogue value and the seam is what has to
    // be visible. `title` is one of them too — it is `t("report.title")` above.
    expect(reportPdf).toContain("const madeLine = `${t(\"report.made\"");
    expect(reportPdf).toContain("doc.text(drawable(madeLine), M, 74)");
    expect(reportPdf).toContain("doc.text(drawable(line), M, 128 + i * 16)");
    expect(reportPdf).toContain("drawable(`${formatShort(a.date)}");
    expect(reportPdf).toContain('const footerNote = t("report.footer")');
    expect(reportPdf).toContain("drawable(footerNote)");
    expect(reportPdf).toContain('drawable(t("report.summary"))');
    // The rest of the module, checked call site by call site.
    //
    // A first draft swept every string literal in the file for these
    // characters and failed on the TITLE — which is folded, correctly, at its
    // use site. That is the limit of a literal sweep: it cannot tell a string
    // that is folded later from one that is not folded at all. So this reads
    // the first argument of every `doc.text(` and requires it to be either
    // already folded, or one of a short list of expressions verified to carry
    // no unencodable character. The list is the claim, and it is checked
    // below rather than trusted.
    const args = firstArgsOfTextCalls(reportPdf);
    expect(args.length, "no doc.text call sites were found at all").toBeGreaterThan(10);
    for (const arg of args) {
      if (arg.startsWith("drawable(")) continue;
      expect(
        CLEAN_ARGUMENTS,
        `doc.text(${arg}) is neither routed nor known to be clean`,
      ).toContain(arg);
    }
    // ...and the claim itself, rather than the list being taken on trust.
    for (const arg of CLEAN_ARGUMENTS) {
      for (const c of UNENCODABLE) {
        expect(arg, `${arg} is on the clean list but contains ${c}`).not.toContain(c);
      }
    }
  });
});
