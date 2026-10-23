/**
 * HRV (SDNN) — Phase 3's half of the wearable import.
 *
 * Three claims, in order: the parser reads Apple's SDNN records into their own
 * series (never into bpm), the merge writes them per day without registering a
 * tracker, and the correlation grid grows a column for them only once a sample
 * exists. The range window is pinned too, because a watch writing 0 for a failed
 * reading must not become a daily average of zero.
 */
import { describe, expect, test } from "bun:test";
import { parseAppleHealthText } from "../../src/lib/healthImport/appleHealth";
import { SERIES_TRACKER, applyImport, previewImport } from "../../src/lib/healthImport/merge";
import { buildCorrelationGrid } from "../../src/lib/correlationGrid";
import { TRACKERS } from "../../src/lib/trackers";
import type { Entry } from "../../src/types";

const RECORDS = [
  `<Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" startDate="2026-03-01 03:00:00 +0100" endDate="2026-03-01 03:00:00 +0100" value="42" unit="ms"/>`,
  `<Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" startDate="2026-03-01 04:00:00 +0100" endDate="2026-03-01 04:00:00 +0100" value="58" unit="ms"/>`,
  // A failed reading, and a value in seconds rather than milliseconds.
  `<Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" startDate="2026-03-02 03:00:00 +0100" endDate="2026-03-02 03:00:00 +0100" value="0" unit="ms"/>`,
  `<Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" startDate="2026-03-02 04:00:00 +0100" endDate="2026-03-02 04:00:00 +0100" value="0.05" unit="s"/>`,
].join("\n");

const parsed = parseAppleHealthText(RECORDS);

describe("the parser", () => {
  test("SDNN lands in its own series, in milliseconds", () => {
    expect(parsed.hrv).toHaveLength(2);
    expect(parsed.hrv.every((s) => s.day === "2026-03-01")).toBe(true);
    expect(parsed.hrv.map((s) => s.value)).toEqual([42, 58]);
    expect(parsed.hr).toEqual([]);
  });

  test("a zero and a sub-millisecond reading are dropped, not averaged in", () => {
    expect(parsed.hrv.some((s) => s.value === 0)).toBe(false);
    expect(parsed.hrv.some((s) => s.value < 1)).toBe(false);
  });
});

describe("the merge", () => {
  const entries = [{ date: "2026-03-01", trackerValues: {} }] as unknown as Entry[];

  test("it writes the smartwatch-hrv value on a matching day, behind its id", () => {
    const out = applyImport(parsed, entries, [SERIES_TRACKER.hrv], false);
    expect(out[0]!.trackerValues?.[SERIES_TRACKER.hrv]).toEqual({ kind: "number", value: 50 });
  });

  test("it writes nothing unless the reader enabled the watch series", () => {
    const out = applyImport(parsed, entries, [], false);
    expect(out[0]!.trackerValues?.[SERIES_TRACKER.hrv]).toBeUndefined();
  });

  test("the preview has an HRV row that counts the days it could fill", () => {
    const preview = previewImport(parsed, entries, [SERIES_TRACKER.hrv]);
    const row = preview.rows.find((r) => r.label === "HRV (ms)")!;
    expect(row.count).toBe(1);
    expect(row.applies).toBe(1);
  });

  test("the id is NOT a registry tracker — it rides on settings only", () => {
    expect(TRACKERS.map((t) => t.id)).not.toContain(SERIES_TRACKER.hrv);
  });
});

describe("the correlation grid", () => {
  const withHrv = (value: number | null) =>
    ({
      date: "2026-03-01",
      mood: 4,
      stress: 3,
      energy: 5,
      activities: ["🚶 Mozgás"],
      // Every stored entry has a `vitals` object; the grid's sleep outcome
      // reads it unconditionally, so a fixture without one is not an entry.
      vitals: { restingHr: null, hrv: null, sleepHours: null },
      trackerValues:
        value === null ? {} : { [SERIES_TRACKER.hrv]: { kind: "number", value } },
    }) as unknown as Entry;

  test("no sample means no column", () => {
    const grid = buildCorrelationGrid({
      entries: [withHrv(null)],
      customNumericTrackers: [],
      customActivities: [],
    });
    expect(grid.outcomes.some((o) => o.id === "tracker:smartwatch-hrv")).toBe(false);
  });

  test("one sample earns a neutral HRV column", () => {
    const grid = buildCorrelationGrid({
      entries: [withHrv(50), withHrv(60)],
      customNumericTrackers: [],
      customActivities: [],
    });
    const hrv = grid.outcomes.find((o) => o.id === "tracker:smartwatch-hrv");
    expect(hrv).toBeDefined();
    expect(hrv!.label).toBe("HRV");
    expect(hrv!.higherIsBetter).toBeNull();
  });
});

describe("resting heart rate — the wearable's second spot series (phase 4)", () => {
  const RESTING = [
    `<Record type="HKQuantityTypeIdentifierRestingHeartRate" startDate="2026-03-01 08:00:00 +0100" endDate="2026-03-01 08:00:00 +0100" value="54" unit="count/min"/>`,
    `<Record type="HKQuantityTypeIdentifierRestingHeartRate" startDate="2026-03-01 20:00:00 +0100" endDate="2026-03-01 20:00:00 +0100" value="58" unit="count/min"/>`,
    // A failed reading and a value that is not bpm at all. Neither may enter
    // the day's average — 0 would drag it down, 540 would make it a number
    // no wrist has measured.
    `<Record type="HKQuantityTypeIdentifierRestingHeartRate" startDate="2026-03-02 08:00:00 +0100" endDate="2026-03-02 08:00:00 +0100" value="0" unit="count/min"/>`,
    `<Record type="HKQuantityTypeIdentifierRestingHeartRate" startDate="2026-03-02 09:00:00 +0100" endDate="2026-03-02 09:00:00 +0100" value="540" unit="count/min"/>`,
  ].join("\n");

  const resting = parseAppleHealthText(RESTING);
  // Both spot series in one file: reading one must never feed the other.
  const mixed = parseAppleHealthText([RESTING, RECORDS].join("\n"));

  test("it lands in its own series, never in bpm and never in SDNN", () => {
    expect(resting.restingHr.map((s) => s.value)).toEqual([54, 58]);
    expect(resting.restingHr.every((s) => s.day === "2026-03-01")).toBe(true);
    expect(resting.hr).toEqual([]);
    expect(resting.hrv).toEqual([]);
    expect(mixed.hrv).toHaveLength(2);
    expect(mixed.restingHr).toHaveLength(2);
    expect(mixed.hr).toEqual([]);
  });

  test("a zero and an out-of-range value are dropped, not averaged in", () => {
    expect(resting.restingHr.some((s) => s.value === 0)).toBe(false);
    expect(resting.restingHr.some((s) => s.value > 150)).toBe(false);
  });

  test("the merge writes it behind its own id, on a matching day", () => {
    const entries = [{ date: "2026-03-01", trackerValues: {} }] as unknown as Entry[];
    const out = applyImport(resting, entries, [SERIES_TRACKER.restingHr], false);
    expect(out[0]!.trackerValues?.[SERIES_TRACKER.restingHr]).toEqual({
      kind: "number",
      value: 56,
    });
    // The neighbours stay empty: one toggle group, four independent lanes.
    expect(out[0]!.trackerValues?.[SERIES_TRACKER.hr]).toBeUndefined();
    expect(out[0]!.trackerValues?.[SERIES_TRACKER.hrv]).toBeUndefined();
  });

  test("the preview row counts the days it could fill, under its own label", () => {
    const entries = [{ date: "2026-03-01", trackerValues: {} }] as unknown as Entry[];
    const preview = previewImport(resting, entries, [SERIES_TRACKER.restingHr]);
    const row = preview.rows.find((r) => r.label === "Nyugalmi pulzus")!;
    expect(row.count).toBe(1);
    expect(row.applies).toBe(1);
  });

  test("the id is NOT a registry tracker — it rides on settings only", () => {
    expect(TRACKERS.map((t) => t.id)).not.toContain(SERIES_TRACKER.restingHr);
  });
});
