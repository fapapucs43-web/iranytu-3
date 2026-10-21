/**
 * PDF report export (Phase 3).
 *
 * jsPDF is imported DYNAMICALLY (await import) so it never inflates the main
 * bundle — it is only fetched when the user actually exports a report.
 * The report contains a summary block, a simple mood bar chart drawn with the
 * PDF's vector primitives, and the most recent entries as a table.
 */
import { avgMoodScore, avg } from "./analysis";
import { moodByLevel } from "./mood";
import { formatShort } from "./dates";
import { QUADRANTS } from "./quadrant";
import { DISCLAIMER, SOURCE_ATTRIBUTION } from "./assessments";
import { groupHeadId, getTrackerDefs, type MergedTrackerDef } from "./trackers";
import { isRecorded, summarise } from "./trackerDisplay";
import { loadPdfFonts, PDF_FONT_FAMILY } from "./pdfFonts";
import { localeTag, t } from "./i18n";
import type { Entry, TrackerValue } from "../types";
// Type-only, so it is erased at build time and jsPDF stays dynamically
// imported. It is here because the builder's return type is a jsPDF document
// and naming that type by hand would be a lie waiting to be caught.
import type { jsPDF as JsPDFDoc } from "jspdf";

/**
 * Batch A — the quadrant names the PDF prints. The built-in font cannot draw
 * Hungarian diacritics (see the character map below), so the Hungarian values
 * are spelled without the two letters it cannot draw; the UI keeps its proper
 * Hungarian labels.
 *
 * Round 18 moved them into the catalogue: they are headings, not data, and a
 * German report that prints Hungarian quadrant names is the half-translated
 * report this round exists to prevent. The `id` keys stay ASCII, because they
 * are matched against `Entry.quadrant`.
 */
const QUADRANT_PDF_LABELS: Record<string, string> = {
  "high-neg": t("report.quadrantHighNeg"),
  "high-pos": t("report.quadrantHighPos"),
  "low-neg": t("report.quadrantLowNeg"),
  "low-pos": t("report.quadrantLowPos"),
};

export type ReportOptions = {
  /** How many recent entries to include in the table (default 30). */
  recentCount?: number;
  userName?: string;
  /**
   * Self-assessment runs to summarise (Batch 6). When present the report
   * gains an "Önreflexiós összegzés" block AND the source attribution in the
   * footer. When absent, neither appears — a mood-only report must not cite
   * an instrument the reader never used, because that would suggest a
   * clinical assessment was made when none was.
   */
  assessments?: { date: string; score: number; bandLabel: string }[];
};

/**
 * Characters jsPDF's built-in fonts cannot draw, and what they become.
 *
 * MEASURED, NOT ASSUMED. Every entry was verified by drawing it alone in a
 * jsPDF document and reading the content stream back: `ő` and `ű` arrive as the
 * control byte U+0001 followed by a stray letter, and the typographic dashes
 * and quotes arrive as unrelated control glyphs. Nothing else is wrong with
 * them — `ö`, `ü`, `á`, `é`, `í`, `ó`, `Á`, `É`, `Ö`, `Ü`, `°` and `·` all come
 * through untouched, which is why this table is this short and why folding a
 * character that already works would be a REGRESSION: `Hőmérséklet` must not
 * become `HöMérséklet` for the reader.
 *
 * The report title shipped broken for exactly this reason — "Belső Iránytű"
 * printed as `Bels<U+0001>q`. Nothing about the glyph was ever wrong; the
 * font simply has no ő, and the text went to the page anyway.
 *
 * THE HONEST LIMIT OF THE FOLD: `ő` becomes `ö`, which is not how the word is
 * spelled. That limit is what this table is for now, and ONLY now: Batch 7i
 * embeds a subsetted Noto Sans, which carries the whole Hungarian alphabet, so
 * with the font loaded this table is not used at all and the report spells
 * `Belső Iránytű` correctly. It stays for the one case the font cannot cover
 * — an export on a device that has never been online, where the subsets are
 * not in the HTTP cache and cannot be fetched. A degraded report that says
 * `Belsö` is better than no report, and better than a control byte.
 */
const PDF_UNENCODABLE: Record<string, string> = {
  "ő": "ö", // U+0151 -> U+0001 + a stray letter
  "ű": "ü", // U+0171 -> U+0001 + a stray letter
  "—": "-", // U+2014 em dash -> U+0097
  "–": "-", // U+2013 en dash  -> U+0096
  "‒": "-", // U+2012 figure dash
  "―": "-", // U+2015 horizontal bar
  "„": '"', // U+201E low quote  -> U+0084
  "”": '"', // U+201D high quote -> U+0094
  "‘": "'", // U+2018
  "’": "'", // U+2019 apostrophe -> U+0092
  "…": "...", // U+2026 ellipsis
  "\u00A0": " ", // no-break space: it survives, but a surprise in a PDF
};

/** Fold a string into the character set jsPDF's built-in fonts can draw. */
export function pdfSafe(input: string): string {
  return input.replace(
    /[őű—–‒―„”‘’… ]/g,
    (c) => PDF_UNENCODABLE[c] ?? c,
  );
}

/**
 * Build the PDF document and hand it back without saving it.
 *
 * WHY THE DOWNLOAD IS NOT HERE
 * `doc.save()` is the last statement of the old function, and it is the reason
 * this report could only ever be tested through a fake: a fake asserts what
 * was passed to it, a real document can be READ. The whole point of Batch 7i
 * is bytes on a page — whether `ő` is drawn or arrives as a control byte — and
 * that question is unanswerable without the bytes. So the building is one
 * function and the saving is one line on top of it, and the end-to-end test
 * takes the document.
 *
 * Nothing else changed shape: `exportMoodReportPdf` below still takes the same
 * arguments, still saves, and still returns the file name.
 */
export async function buildMoodReportPdf(
  entries: Entry[],
  opts: ReportOptions = {},
): Promise<{ doc: JsPDFDoc; fileName: string }> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const M = 48; // margin

  // THE FONT, OR THE FOLD. One decision, made once, in one place, because
  // thirteen `setFont` calls and six text calls all depend on it and a
  // decision repeated thirteen times is thirteen chances to get it wrong.
  //
  // With the font: every character the app can produce is drawable, so
  // `drawable` is the identity and the report says `Belső`. Without it — a
  // first-ever export while offline, the subsets never having been in the
  // cache — the old fold applies and the report says `Belsö`. Neither branch
  // throws: a report that is slightly wrong is worth more to the person
  // holding it than an error dialog is.
  const loaded = await loadPdfFonts();
  if (loaded.ok) {
    for (const font of loaded.fonts) {
      doc.addFileToVFS(font.file, font.base64);
      doc.addFont(font.file, font.family, font.style);
    }
  }
  const family = loaded.ok ? PDF_FONT_FAMILY : "helvetica";
  const face = (bold: boolean): void => {
    doc.setFont(family, bold ? "bold" : "normal");
  };
  const drawable: (text: string) => string = loaded.ok ? (text) => text : pdfSafe;
  // Set once so that any text drawn without an explicit `face` call still
  // lands in the embedded family rather than silently in Helvetica.
  doc.setFont(family, "normal");

  const recent = [...entries]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, opts.recentCount ?? 30);
  const name = opts.userName?.trim();
  const title = t("report.title");

  // Header
  face(true);
  doc.setFontSize(18);
  doc.text(drawable(title), M, 56);
  face(false);
  doc.setFontSize(10);
  doc.setTextColor(90, 90, 90);
  // The date goes in as one value and the reader's name is appended: a name is
  // not a translation, and a catalogue value may not end in a separator the next
  // language might want to place differently. Named rather than inline so the
  // drawable seam is a call site a test can point at — round 18 moved every
  // string in this module into the catalogue and routed the eight that were
  // drawn raw through `drawable` with it, because a translated value is a value
  // nobody has checked against jsPDF's built-in encoding.
  const madeLine = `${t("report.made", {
    date: new Date().toLocaleDateString(localeTag()),
  })}${name ? ` — ${name}` : ""}`;
  doc.text(drawable(madeLine), M, 74);
  doc.setTextColor(0);
  // The mandated sentence, in the header block where a clinician will read it
  // before the numbers, not buried in a footer.
  face(true);
  doc.setFontSize(9);
  doc.text(DISCLAIMER, M, 92, { maxWidth: pageW - M * 2 });
  face(false);
  doc.setFontSize(10);

  // Summary block
  doc.setFontSize(12);
  face(true);
  doc.text(drawable(t("report.summary")), M, 108);
  face(false);
  doc.setFontSize(11);
  const summary = [
    t("report.days", { count: entries.length }),
    t("report.avgMood", { value: Math.round(avgMoodScore(entries)) }),
    t("report.avgStress", { value: (Math.round(avg(entries, "stress") * 10) / 10) || "—" }),
    t("report.avgEnergy", { value: (Math.round(avg(entries, "energy") * 10) / 10) || "—" }),
  ];
  // Batch A — the quadrant days get their own summary line. ASCII fallback
  // labels, because the built-in PDF font has no Hungarian diacritics (the
  // same wall the tracker summary names below).
  const quadrantDays = QUADRANTS.filter((q) => entries.some((e) => e.quadrant === q));
  if (quadrantDays.length > 0) {
    summary.push(
      t("report.quadrantDays", {
        list: quadrantDays
          .map((q) => `${QUADRANT_PDF_LABELS[q]} ${entries.filter((e) => e.quadrant === q).length}`)
          .join(", "),
      }),
    );
  }
  summary.forEach((line, i) => doc.text(drawable(line), M, 128 + i * 16));

  // Mood bar chart (last N entries, vector bars)
  const chartTop = 210;
  const chartH = 140;
  const chartW = pageW - M * 2;
  face(true);
  doc.setFontSize(12);
  doc.text(drawable(t("report.moodChart")), M, chartTop - 14);
  doc.setDrawColor(200, 200, 200);
  doc.setFillColor(240, 240, 240);
  doc.rect(M, chartTop, chartW, chartH, "FD");

  const chartEntries = [...recent].reverse();
  const n = chartEntries.length;
  if (n > 0) {
    const slot = chartW / n;
    const barW = Math.max(2, slot * 0.6);
    chartEntries.forEach((e, i) => {
      const score = moodByLevel(e.mood).score / 100;
      const barH = Math.max(2, score * (chartH - 8));
      doc.setFillColor(moodByLevel(e.mood).color);
      doc.rect(M + i * slot + (slot - barW) / 2, chartTop + chartH - 4 - barH, barW, barH, "F");
    });
  }

  // Recent entries table
  let y = chartTop + chartH + 34;
  face(true);
  doc.setFontSize(12);
  doc.text(drawable(t("report.recent")), M, y);
  y += 18;
  doc.setFontSize(10);
  face(true);
  doc.text(drawable(t("report.colDate")), M, y);
  doc.text(drawable(t("report.colMood")), M + 110, y);
  doc.text(drawable(t("report.colStress")), M + 220, y);
  doc.text(drawable(t("report.colEnergy")), M + 300, y);
  face(false);
  y += 6;
  doc.setDrawColor(220);
  doc.line(M, y, pageW - M, y);
  y += 14;
  for (const e of recent) {
    if (y > doc.internal.pageSize.getHeight() - 60) {
      doc.addPage();
      y = 60;
    }
    doc.text(formatShort(e.date), M, y);
    // Batch A: a quadrant day shows its quadrant and its emotion beside the
    // fallback level, so both eras read in one table. Emotion text is drawn
    // through `drawable`, which already transliterates what the built-in
    // font cannot spell.
    const moodText = e.quadrant
      ? `${QUADRANT_PDF_LABELS[e.quadrant]}${e.emotion ? ` / ${e.emotion}` : ""}`
      : moodByLevel(e.mood).label;
    doc.text(drawable(moodText), M + 110, y);
    doc.text(String(e.stress), M + 220, y);
    doc.text(String(e.energy), M + 300, y);
    y += 16;
  }

  // Tracker summary (Batch 7h) — what was recorded, over every entry in the
  // report. Placed after the entries and before the assessments, so the
  // document reads as chronology first and aggregates after, which is where the
  // assessment block already sits.
  //
  // Aggregates over `entries`, not over `recent`, and the denominator is the
  // number of entries that CARRY each tracker: "12/14 nap" does not claim the
  // user forgot a step count on the sixteen days recorded before they had the
  // tracker switched on.
  //
  // No icons here. The tracker icons are emoji, and the built-in font cannot
  // draw those either — the same wall as `ő`, and there is no glyph set in a
  // PDF to fall back on. The labels carry it.
  const defs = getTrackerDefs([]);
  const valuesById = new Map<string, TrackerValue[]>();
  for (const e of entries) {
    for (const [id, value] of Object.entries(e.trackerValues ?? {})) {
      const list = valuesById.get(id);
      if (list) list.push(value);
      else valuesById.set(id, [value]);
    }
  }
  const trackerHeads: {
    head: MergedTrackerDef;
    members: { def: MergedTrackerDef; values: TrackerValue[] }[];
  }[] = [];
  for (const def of defs) {
    const values = valuesById.get(def.id);
    // Present is not recorded: a key exists for every ENABLED tracker, so a
    // group whose values are all their own blanks is left out entirely rather
    // than summarised as nothing.
    if (!values || !values.some((v) => isRecorded(def, v))) continue;
    const headId = groupHeadId(def);
    let group = trackerHeads.find((g) => g.head.id === headId);
    if (!group) {
      group = { head: defs.find((d) => d.id === headId) ?? def, members: [] };
      trackerHeads.push(group);
    }
    group.members.push({ def, values });
  }

  if (trackerHeads.length > 0) {
    // This is the first block in the report that can run past a page, so it
    // checks before every line rather than only where the entries table does.
    const floor = doc.internal.pageSize.getHeight() - 60;
    const line = (text: string, indent: number, size: number, bold: boolean) => {
      if (y > floor) {
        doc.addPage();
        y = 60;
      }
      face(bold);
      doc.setFontSize(size);
      doc.text(drawable(text), M + indent, y);
      y += size + 4;
    };
    y += 26;
    line(t("report.trackers"), 0, 12, true);
    for (const group of trackerHeads) {
      // A group of one would print its head and then the same label again.
      if (group.members.length > 1) line(group.head.label, 10, 10, true);
      for (const { def, values } of group.members) {
        const summary = summarise(def, values);
        if (summary) line(`${def.label} — ${summary}`, 18, 9, false);
      }
    }
  }

  // Self-assessment summary — only when there IS one.
  const assessments = opts.assessments ?? [];
  if (assessments.length > 0) {
    y += 26;
    doc.setFontSize(12);
    face(true);
    doc.text(drawable(t("report.assessments")), M, y);
    face(false);
    doc.setFontSize(9);
    y += 16;
    for (const a of assessments.slice(0, 12)) {
      doc.text(drawable(`${formatShort(a.date)} — ${a.bandLabel} (${a.score} pont)`), M, y);
      y += 13;
    }
  }

  // Footer note
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  const footerNote = t("report.footer");
  doc.text(drawable(footerNote), M, doc.internal.pageSize.getHeight() - 30);
  if (assessments.length > 0) {
    doc.text(
      SOURCE_ATTRIBUTION,
      M,
      doc.internal.pageSize.getHeight() - 16,
    );
  }

  const fileName = `belso-iranytu-jelentes-${new Date().toISOString().slice(0, 10)}.pdf`;
  return { doc, fileName };
}

/** Build and download the PDF. Returns the suggested file name. */
export async function exportMoodReportPdf(entries: Entry[], opts: ReportOptions = {}): Promise<string> {
  const { doc, fileName } = await buildMoodReportPdf(entries, opts);
  doc.save(fileName);
  return fileName;
}
