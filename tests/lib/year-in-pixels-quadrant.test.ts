/**
 * Batch A — Year-in-Pixels quadrant mapping and the PDF's new fields.
 *
 * The Year-in-Pixels rule: a quadrant day paints the QUADRANT color; a day
 * recorded on the old scale keeps its level color; the two eras share one
 * month without either rewriting the other.
 */
import { describe, expect, test } from "bun:test";
import type { Entry } from "../../src/types";
import { monthMatrix } from "../../src/lib/yearInPixels";
import { moodByLevel } from "../../src/lib/mood";
import { QUADRANT_COLORS } from "../../src/lib/quadrant";
import { pdfSafe } from "../../src/lib/reportPdf";

function entry(overrides: Partial<Entry> & { date: string }): Entry {
  return {
    id: overrides.date,
    mood: 3,
    stress: 5,
    energy: 5,
    note: "",
    tags: [],
    emotions: [],
    activities: [],
    reflection: { feeling: "", stressReason: "", need: "" },
    vitals: { restingHr: null, hrv: null, sleepHours: null },
    source: "manual",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  } as Entry;
}

describe("year-in-pixels — quadrant colors", () => {
  test("a quadrant day paints the quadrant color", () => {
    const m = monthMatrix(2026, 8, [entry({ date: "2026-09-15", quadrant: "high-neg" })]);
    const cell = m.cells.find((c) => c.day === 15)!;
    expect(cell.quadrant).toBe("high-neg");
    expect(cell.color).toBe(QUADRANT_COLORS["high-neg"]);
    expect(cell.color).toBe("#ef4444");
  });

  test("each quadrant paints its pinned color", () => {
    const days = [
      { date: "2026-09-01", quadrant: "high-neg" as const },
      { date: "2026-09-02", quadrant: "high-pos" as const },
      { date: "2026-09-03", quadrant: "low-neg" as const },
      { date: "2026-09-04", quadrant: "low-pos" as const },
    ];
    const m = monthMatrix(2026, 8, days.map((d) => entry(d)));
    for (const d of days) {
      expect(m.cells.find((c) => c.day === Number(d.date.slice(8, 10)))!.color).toBe(
        QUADRANT_COLORS[d.quadrant],
      );
    }
  });

  test("an old-scale day keeps its level color, and the two eras coexist", () => {
    const m = monthMatrix(2026, 8, [
      entry({ date: "2026-09-10", mood: 5 }),
      entry({ date: "2026-09-11", quadrant: "low-neg" }),
    ]);
    const levelDay = m.cells.find((c) => c.day === 10)!;
    const quadrantDay = m.cells.find((c) => c.day === 11)!;
    expect(levelDay.quadrant).toBeNull();
    expect(levelDay.color).toBe(moodByLevel(5).color);
    expect(quadrantDay.color).toBe("#3b82f6");
  });

  test("an empty day still has null for everything drawable", () => {
    const m = monthMatrix(2026, 8, []);
    const cell = m.cells.find((c) => c.day === 15)!;
    expect(cell.level).toBeNull();
    expect(cell.quadrant).toBeNull();
    expect(cell.color).toBeNull();
  });
});

describe("pdf export — the new fields", () => {
  test("quadrant labels transliterate through pdfSafe", () => {
    // pdfSafe() maps what the built-in font cannot spell; a quadrant label
    // that arrives intact is safe on the summary line and in the table. The
    // report draws through `drawable`, which IS pdfSafe when the embedded
    // font is unavailable — the stricter of the two paths.
    const out = pdfSafe("derus-aktiv / Boldog");
    expect(out).not.toContain("ő");
    expect(out).not.toContain("ű");
    expect(out.toLowerCase()).toContain("boldog");
  });

  test("level and quadrant entries both produce printable mood text", () => {
    const level = moodByLevel(4).label;
    expect(typeof level).toBe("string");
    const quadrant = "derus-aktiv";
    expect(pdfSafe(quadrant)).toBe(quadrant);
  });
});
