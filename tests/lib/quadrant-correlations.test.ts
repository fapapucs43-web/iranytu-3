/**
 * Batch A — the two new insight cards' math, with the sample guard asserted
 * from both directions: one day is never a pattern, two days are.
 */
import { describe, expect, test } from "bun:test";
import type { Entry } from "../../src/types";
import { emotionContextRows, quadrantSleepRows } from "../../src/lib/quadrantCorrelations";

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

describe("emotion × context", () => {
  test("a co-occurring pair is reported with its ratio", () => {
    const rows = emotionContextRows([
      entry({ date: "2026-09-01", emotion: "Szomorú", context: { where: ["Otthon"] } }),
      entry({ date: "2026-09-02", emotion: "Szomorú", context: { where: ["Otthon"] } }),
      entry({ date: "2026-09-03", emotion: "Szomorú", context: { where: ["Munka"] } }),
    ]);
    expect(rows.length).toBe(2);
    const home = rows.find((r) => r.contextLabel === "Otthon")!;
    expect(home.emotion).toBe("Szomorú");
    expect(home.together).toBe(2);
    expect(home.emotionDays).toBe(3);
    expect(home.percent).toBe(67);
  });

  test("one emotion day is below the sample guard and produces nothing", () => {
    const rows = emotionContextRows([
      entry({ date: "2026-09-01", emotion: "Boldog", context: { withWhom: ["Barátok"] } }),
    ]);
    expect(rows).toEqual([]);
  });

  test("entries without emotion or context contribute nothing", () => {
    const rows = emotionContextRows([
      entry({ date: "2026-09-01" }),
      entry({ date: "2026-09-02", emotion: "Boldog" }),
      entry({ date: "2026-09-03", emotion: "  ", context: { where: ["Otthon"] } }),
    ]);
    expect(rows).toEqual([]);
  });

  test("rows are sorted by strongest evidence", () => {
    const rows = emotionContextRows([
      entry({ date: "2026-09-01", emotion: "Boldog", context: { withWhom: ["Barátok"] } }),
      entry({ date: "2026-09-02", emotion: "Boldog", context: { withWhom: ["Barátok"] } }),
      entry({ date: "2026-09-03", emotion: "Boldog", context: { withWhom: ["Család"] } }),
    ]);
    expect(rows[0]!.contextLabel).toBe("Barátok");
  });

  test("context labels are deduplicated across dimensions within a day", () => {
    const rows = emotionContextRows([
      entry({ date: "2026-09-01", emotion: "Nyugodt", context: { where: ["Otthon"], doing: ["Otthon"] } }),
      entry({ date: "2026-09-02", emotion: "Nyugodt", context: {} }),
    ]);
    expect(rows.filter((r) => r.contextLabel === "Otthon")).toHaveLength(1);
  });
});

describe("quadrant × sleep", () => {
  test("a quadrant with two sleep days is compared against the rest", () => {
    const rows = quadrantSleepRows([
      entry({ date: "2026-09-01", quadrant: "high-pos", vitals: { restingHr: null, hrv: null, sleepHours: 8 } }),
      entry({ date: "2026-09-02", quadrant: "high-pos", vitals: { restingHr: null, hrv: null, sleepHours: 6 } }),
      entry({ date: "2026-09-03", quadrant: "low-neg", vitals: { restingHr: null, hrv: null, sleepHours: 9 } }),
      entry({ date: "2026-09-04", quadrant: "low-neg", vitals: { restingHr: null, hrv: null, sleepHours: 7 } }),
    ]);
    const highPos = rows.find((r) => r.quadrant === "high-pos")!;
    expect(highPos.days).toBe(2);
    expect(highPos.avgSleep).toBe(7);
    expect(highPos.avgSleepRest).toBe(8);
    expect(highPos.delta).toBe(-1);
  });

  test("a quadrant with fewer than two sleep days reads as no data", () => {
    const rows = quadrantSleepRows([
      entry({ date: "2026-09-01", quadrant: "low-pos", vitals: { restingHr: null, hrv: null, sleepHours: 8 } }),
      entry({ date: "2026-09-02", quadrant: "high-pos", vitals: { restingHr: null, hrv: null, sleepHours: 8 } }),
      entry({ date: "2026-09-03", quadrant: "high-pos", vitals: { restingHr: null, hrv: null, sleepHours: 8 } }),
    ]);
    expect(rows.find((r) => r.quadrant === "low-pos")!.avgSleep).toBeNull();
    expect(rows.find((r) => r.quadrant === "high-pos")!.avgSleepRest).toBeNull();
  });

  test("all four quadrants are always present, in meter order", () => {
    const rows = quadrantSleepRows([]);
    expect(rows.map((r) => r.quadrant)).toEqual(["high-neg", "high-pos", "low-neg", "low-pos"]);
    for (const r of rows) {
      expect(r.avgSleep).toBeNull();
      expect(r.delta).toBeNull();
    }
  });

  test("entries without a sleep value never enter either average", () => {
    const rows = quadrantSleepRows([
      entry({ date: "2026-09-01", quadrant: "high-pos" }),
      entry({ date: "2026-09-02", quadrant: "high-pos", vitals: { restingHr: null, hrv: null, sleepHours: 5 } }),
      entry({ date: "2026-09-03", quadrant: "high-pos", vitals: { restingHr: null, hrv: null, sleepHours: 7 } }),
    ]);
    const highPos = rows.find((r) => r.quadrant === "high-pos")!;
    expect(highPos.days).toBe(2);
    expect(highPos.avgSleep).toBe(6);
    // No other quadrant carries a sleep value, so the baseline is unguarded.
    expect(highPos.avgSleepRest).toBeNull();
    expect(highPos.delta).toBeNull();
  });
});
