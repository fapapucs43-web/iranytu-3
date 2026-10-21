/**
 * Batch 6 — the PDF footer gate, proven behaviourally.
 *
 * The decision: the source attribution is GATED. A report that contains no
 * self-assessment must not name the instrument, because citing it would
 * tell whoever reads the PDF that a clinical assessment was made when none
 * was. The disclaimer is NOT gated — it appears on every report.
 *
 * The earlier version of this asserted the gate by reading reportPdf.ts as
 * text, which proves the source says what we hope. It does not prove the
 * running function does. This replaces that with an intercepted jsPDF, so
 * the assertion is on the strings the PDF generator actually draws.
 */
import { describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** Every string the generator passes to doc.text(). */
let drawn: string[] = [];

class FakeDoc {
  lastSaved: string | null = null;
  // jsPDF's real API is a big flat object; the generator only ever calls
  // these on it, and an unknown call is a bug we want to hear about.
  private noop() {}
  text(t: unknown) {
    if (typeof t === "string") drawn.push(t);
    return this;
  }
  setFont() { return this; }
  // Batch 7i: the generator hands the two subsets to jsPDF before it draws
  // anything, and the index signature below types the call without providing
  // it — so the method has to exist even though the fake does nothing with it.
  // This file asserts on strings, and the registration is proven against a real
  // document in `tests/batch7i.test.ts`.
  addFileToVFS() { return this; }
  addFont() { return this; }
  setFontSize() { return this; }
  setTextColor() { return this; }
  setFillColor() { return this; }
  setDrawColor() { return this; }
  setLineWidth() { return this; }
  line() { return this; }
  rect() { return this; }
  roundedRect() { return this; }
  circle() { return this; }
  triangle() { return this; }
  setLineDashPattern() { return this; }
  getTextWidth() { return 40; }
  getFontList() {
    // What the generator sees after Batch 7i registered the subset: the
    // report's own family, with both faces. It used to answer `helvetica`,
    // which was true then and would now be a lie about the document.
    return [{ fontName: "NotoSansPdf" }];
  }
  setPage() { return this; }
  addPage() { return this; }
  internal = { pageSize: { getWidth: () => 595, getHeight: () => 842 } };
  save(name: string) { this.lastSaved = name; return this; }
  output() { return new ArrayBuffer(8); }
  setProperties() { return this; }
  splitTextToSize(t: string) { return [t]; }
  getFontSize() { return 10; }
  getNumberOfPages() { return 1; }
  deletePage() { return this; }
  [k: string]: unknown;
}

mock.module("jspdf", () => ({
  jsPDF: FakeDoc as unknown as typeof import("jspdf").jsPDF,
}));

const { exportMoodReportPdf } = await import("../src/lib/reportPdf");

/**
 * The report's own font, primed before a single test here runs.
 *
 * This file's whole method is asserting on the strings the generator ACTUALLY
 * DRAWS, and until Batch 7i the strings it was asserting were the folded ones
 * — not because the test wanted folding but because no font could be loaded
 * under Bun, so the generator fell back to Helvetica every time. Priming the
 * loader with the real committed subset is what makes these assertions about
 * what a reader sees. The whole document is faked here, but the FONT is not:
 * the fake records what is handed to jsPDF, and that is the thing under test.
 */
const { loadPdfFonts, resetPdfFontCacheForTests } = await import("../src/lib/pdfFonts");
resetPdfFontCacheForTests();
const primed = await loadPdfFonts((async (input: RequestInfo | URL) => {
  const name = String(input).replace(/^.*\/pdf-fonts\//, "");
  return new Response(readFileSync(join(ROOT, "public", "pdf-fonts", name)));
}) as unknown as typeof fetch);
if (!primed.ok) throw new Error(`the PDF font could not be primed: ${primed.reason}`);
const { SOURCE_ATTRIBUTION } = await import("../src/lib/assessments");
const { addAssessment, listAssessments, resetForTests } = await import("../src/lib/assessmentStore");

const entries = [
  // stress/energy included: the real store's normalizeEntry always fills
  // them, and omitting them here would print "undefined" in the table.
  { id: "e1", date: "2026-03-01", mood: 3, stress: 4, energy: 6, activities: [], emotions: [], note: "Teszt", trackers: {} },
] as unknown as Parameters<typeof exportMoodReportPdf>[0];

async function generate(opts: Parameters<typeof exportMoodReportPdf>[1] = {}) {
  drawn = [];
  await exportMoodReportPdf(entries, opts);
  return drawn.join("  ");
}

describe("the PDF footer", () => {
  test("a report with no assessment never names the instrument", async () => {
    const text = await generate({ userName: "Teszt" });
    expect(text).not.toContain("Pfizer");
    expect(text).not.toContain(SOURCE_ATTRIBUTION);
    // ...and it is not merely a different wording of it.
    expect(text).not.toContain("MAPI");
  });

  test("a report with an assessment names the source in the footer", async () => {
    const text = await generate({
      userName: "Teszt",
      assessments: [{ date: "2026-03-01", score: 14, bandLabel: "Közepes erősségű tünetek" }],
    });
    expect(text).toContain(SOURCE_ATTRIBUTION);
    // `Közepes erősségű` has two characters the built-in font cannot draw. The
    // assertion has been through three spellings and each one was honest at the
    // time: before Batch 7h the long-o arrived as a control byte and a stray
    // letter, and Batch 7h corrected this to the FOLDED `Közepes erösségü` —
    // correctly, because that is what the page really said. Batch 7i embeds a
    // subsetted Noto Sans, so the page says what the store holds again, and the
    // assertion returns to the spelling at the top. The input is unchanged
    // throughout, because the store has always held what the user typed.
    expect(text).toContain("Közepes erősségű tünetek");
  });

  test("an EMPTY assessments array is still gated — the call site relies on this", async () => {
    // reportPdf gates on `assessments.length > 0`, and ReportExport passes
    // whatever listAssessments() returns. A user who has the module on but
    // has not filled it in must get a mood-only report, not a cited one.
    const text = await generate({ userName: "Teszt", assessments: [] });
    expect(text).not.toContain(SOURCE_ATTRIBUTION);
  });

  test("the disclaimer is on every report, gated or not", async () => {
    const without = await generate({ userName: "Teszt" });
    const with_ = await generate({
      userName: "Teszt",
      assessments: [{ date: "2026-03-01", score: 14, bandLabel: "Közepes erősségű tünetek" }],
    });
    for (const t of [without, with_]) {
      expect(t).toContain("Ez nem diagnózis");
      expect(t).toContain("nem orvosi tanács");
    }
  });

  test("the call site passes the real log, so the gate opens only for real runs", async () => {
    resetForTests();
    addAssessment({ date: "2026-03-01", answers: [1, 1, 2, 0, 1, 2, 1, 0, 0] });
    const live = listAssessments().map((a) => ({ date: a.date, score: a.score, bandLabel: a.band.label }));
    const text = await generate({ userName: "Teszt", assessments: live });
    expect(text).toContain(SOURCE_ATTRIBUTION);
    // The run is summarised, not just cited: date, band and score all land.
    expect(text).toContain("márc. 1.");
    expect(text).toContain("Enyhe tünetek jelei");
    resetForTests();
  });

  test("a report with no entries cannot gain an attribution either", async () => {
    drawn = [];
    await exportMoodReportPdf([], { userName: "Teszt" });
    expect(drawn.join(" ")).not.toContain(SOURCE_ATTRIBUTION);
  });
});
