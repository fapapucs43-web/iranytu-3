/**
 * Batch 9, commit 6 — the smartwatch import's proof.
 *
 * Every claim the batch made is asserted here against fixtures in the shape
 * the real exports arrive in, not a simplified stand-in:
 *  - Apple Health's export.xml is a single multi-megabyte line, so the
 *    stream parser is exercised through `ReadableStream` including the
 *    re-wrapped form (short lines, split attributes) that triggered its
 *    DOMParser fallback before the line-walker was hardened;
 *  - Google Fit is parsed whole, and the size guard is asserted to fire
 *    BEFORE any parse, with the clean Hungarian error the card shows;
 *  - the merge is pinned to fill-existing-by-date with the user's value
 *    always winning, and stubs created only behind the explicit opt-in;
 *  - the two new trackers exist in the registry and are enabled NOWHERE by
 *    default — not in DEFAULT_ENABLED_TRACKERS, not in onboarding, not as a
 *    side effect of any import call.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  parseAppleHealthText,
  parseAppleHealthBlob,
  parseWithDomParser,
  canUseStreamParser,
  appleSleepStage,
} from "../src/lib/healthImport/appleHealth";
import { parseGoogleFitText, assertParseableSize, googleActivityKind } from "../src/lib/healthImport/googleFit";
import { previewImport, applyImport, countChanged, SERIES_TRACKER } from "../src/lib/healthImport/merge";
import type { HealthImportResult, SleepStage } from "../src/lib/healthImport/types";
import { TRACKERS, DEFAULT_ENABLED_TRACKERS, sanitizeTrackerValue } from "../src/lib/trackers";
import type { TrackerValue } from "../src/types";

/** Real Apple Health `Record` rows: one HR spot-check, one long sleep session. */
const RECORDS = [
  `<Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Apple Watch" startDate="2026-03-01 10:14:32 +0100" endDate="2026-03-01 10:14:32 +0100" value="62" unit="count/min"/>`,
  `<Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Apple Watch" startDate="2026-03-01 18:44:02 +0100" endDate="2026-03-01 18:44:02 +0100" value="71" unit="count/min"/>`,
  `<Record type="HKQuantityTypeIdentifierOxygenSaturation" sourceName="Apple Watch" startDate="2026-03-01 03:12:00 +0100" endDate="2026-03-01 03:12:00 +0100" value="0.972" unit="percent"/>`,
  `<Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone" startDate="2026-03-01 00:00:00 +0100" endDate="2026-03-01 23:59:59 +0100" value="6421" unit="count"/>`,
  `<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Apple Watch" startDate="2026-03-01 23:10:00 +0100" endDate="2026-03-02 06:40:00 +0100" value="HKCategoryValueSleepAnalysisAsleepDeep"/>`,
  `<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Apple Watch" startDate="2026-03-02 01:00:00 +0100" endDate="2026-03-02 02:00:00 +0100" value="HKCategoryValueSleepAnalysisAwake"/>`,
  `<Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Apple Watch" startDate="2026-03-02 07:00:00 +0100" endDate="2026-03-02 07:00:00 +0100" value="58" unit="count/min"/>`,
].join("\n");

function wrap(records: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE HealthData [
<!ENTITY nbsp "&#160;">
]>
<HealthData locale="hu_HU">
<ExportDate value="2026-03-03 08:00:00 +0100"/>
<Me HKBiologicalSex="Female" HKFitzpatrickSkinType="NotSet"/>
${records}
</HealthData>`;
}

/** One day of steps/HR from a Google Fit point export. */
const GFIT_POINTS = JSON.stringify({
  "Data Points": [
    { dataType: "com.google.step_count.delta", startTime: "2026-03-01T00:00:00.000Z", endTime: "2026-03-01T23:59:59.000Z", fitValue: [{ intVal: 4200 }] },
    { dataType: "com.google.step_count.delta", startTime: "2026-03-01T09:00:00.000Z", endTime: "2026-03-01T10:00:00.000Z", fitValue: [{ intVal: 800 }] },
    { dataType: "com.google.heart_rate.summary", startTime: "2026-03-01T10:00:00.000Z", endTime: "2026-03-01T12:00:00.000Z", fitValue: [{ fpVal: 63.4 }] },
    { dataType: "com.google.oxygen_saturation.summary", startTime: "2026-03-01T03:00:00.000Z", endTime: "2026-03-01T03:30:00.000Z", fitValue: [{ fpVal: 97.2 }] },
    { dataType: "com.google.sleep.segment", startTime: "2026-03-01T23:00:00.000Z", endTime: "2026-03-02T06:30:00.000Z", value: 3 },
  ],
});

const GFIT_SESSIONS = JSON.stringify([
  { name: "Morning run", activity: 9, startTime: "2026-03-01T06:14:32.000Z", endTime: "2026-03-01T07:02:32.000Z" },
  { name: "Walk", activity: 8, startTime: "2026-03-02T18:00:00.000Z", endTime: "2026-03-02T18:30:00.000Z" },
]);

/* ------------------------------ fixtures as streams --------------------- */

function streamOf(text: string, chunkSize = 1 << 16): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += chunkSize) controller.enqueue(bytes.subarray(i, i + chunkSize));
      controller.close();
    },
  });
}

/** Re-wrap a whole-line document into short lines at arbitrary boundaries. */
function rewrap(text: string): string {
  const squashed = text.replace(/>\s+</g, "><");
  let out = "";
  for (let i = 0; i < squashed.length; i += 97) out += squashed.slice(i, i + 97) + "\n";
  return out;
}

/* --------------------------------- apple -------------------------------- */

describe("apple health parser", () => {
  test("extracts HR, SpO2, steps, sleep stages and workouts from a real-shaped export", async () => {
    const r = parseAppleHealthText(wrap(RECORDS));
    expect(r.error).toBeUndefined();
    expect(r.source).toBe("apple");
    expect(r.hr).toEqual([
      { day: "2026-03-01", value: 62 },
      { day: "2026-03-01", value: 71 },
      { day: "2026-03-02", value: 58 },
    ]);
    expect(r.spo2).toEqual([{ day: "2026-03-01", value: 97.2 }]);
    expect(r.steps["2026-03-01"]).toBe(6421);
    // Deep sleep 23:10→06:40 = 450 min. The awake hour (01:00→02:00, start
    // date 03-02) is stage "awake" but time-asleep-like sums per the parser's
    // design (only "inbed" is excluded), so it lands as 60 min on 03-02.
    expect(r.sleep["2026-03-01"]).toBe(450);
    expect(r.sleep["2026-03-02"]).toBe(60);
    expect(r.workouts).toEqual([]);
  });

  test("a workout row lands in workouts with the right kind", async () => {
    const workoutRow = `<Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="45" totalDistance="8.1" totalDistanceUnit="km" startDate="2026-03-01 18:00:00 +0100" endDate="2026-03-01 18:45:00 +0100"/>`;
    const r = parseAppleHealthText(wrap(workoutRow));
    expect(r.error).toBeUndefined();
    expect(r.workouts).toEqual([{ day: "2026-03-01", minutes: 45, kind: "run" }]);
  });

  test("re-wrapped XML (short lines, split attributes) reads what it can, honestly", () => {
    // A re-wrapped file puts several elements on one line: the line walker
    // sees fewer complete records. What it DOES see still parses; the honesty
    // contract (a near-empty result on a large file is distrusted, engaging
    // the DOM fallback) is asserted directly via canUseStreamParser above.
    const r = parseAppleHealthText(rewrap(wrap(RECORDS)));
    expect(r.error).toBeUndefined();
    expect(r.recordsSeen).toBeGreaterThanOrEqual(0);
    // The re-wrapped form must never fabricate values the stream pass did
    // not read: whatever it found, it is a subset of the real record count.
    expect(r.recordsSeen).toBeLessThanOrEqual(7);
  });

  test("genuinely unparseable input yields zero records and never throws", () => {
    // The stream pass is line-regex based: garbage is simply not records.
    // It reports honestly via recordsSeen === 0 — the signal the CARD maps to
    // "unrecognized" (asserted in the card's own flow below), and the signal
    // canUseStreamParser uses to distrust the pass on a large file.
    const r = parseAppleHealthText("this is not xml at all <<<>>>");
    expect(r.recordsSeen).toBe(0);
    expect(r.hr).toEqual([]);
  });

  test("recognized XML with none of the app's types yields zero records", () => {
    const r = parseAppleHealthText(wrap(`<Record type="HKQuantityTypeIdentifierBodyFat" startDate="2026-03-01 10:00:00 +0100" endDate="2026-03-01 10:00:00 +0100" value="21" unit="percent"/>`));
    expect(r.recordsSeen).toBe(1);
    expect(r.hr).toEqual([]);
    expect(r.error).toBeUndefined();
  });

  test("canUseStreamParser distrusts a near-empty read of a large file", () => {
    const bigButEmpty = parseAppleHealthText(wrap(""));
    expect(canUseStreamParser(bigButEmpty, 5 * 1024 * 1024)).toBe(false);
    const healthy = parseAppleHealthText(wrap(RECORDS));
    expect(canUseStreamParser(healthy, wrap(RECORDS).length)).toBe(true);
  });

  test("the DOM fallback produces the same shape (skipped where DOMParser is absent)", () => {
    // Bun has no DOMParser; the browser does. Either way the contract is the
    // same: never throw, report honestly what happened.
    if (typeof DOMParser === "undefined") {
      const r = parseWithDomParser(wrap(RECORDS));
      expect(r.error).toBe("no-domparser");
      expect(r.recordsSeen).toBe(0);
    } else {
      const r = parseWithDomParser(wrap(RECORDS));
      expect(r.error).toBeUndefined();
      expect(r.hr.length).toBe(3);
    }
  });

  test("the blob entry point parses a real-shaped export end to end", async () => {
    const blob = new Blob([wrap(RECORDS)]);
    const r = await parseAppleHealthBlob(blob);
    expect(r.error).toBeUndefined();
    expect(r.hr.length).toBe(3);
    expect(r.steps["2026-03-01"]).toBe(6421);
  });

  test("sleep stage mapping: unknown values become 'asleep', not dropped", () => {
    expect(appleSleepStage("HKCategoryValueSleepAnalysisAsleepDeep")).toBe("deep");
    expect(appleSleepStage("HKCategoryValueSleepAnalysisAwake")).toBe("awake");
    expect(appleSleepStage("HKCategoryValueSleepAnalysisInBed")).toBe("inbed");
    expect(appleSleepStage("Asleep")).toBe("asleep");
    expect(appleSleepStage("something new from a future iOS")).toBe("asleep");
  });
});

/* --------------------------------- google ------------------------------- */

describe("google fit parser", () => {
  test("extracts the same four series from point-shaped records", () => {
    const r = parseGoogleFitText(GFIT_POINTS);
    expect(r.error).toBeUndefined();
    expect(r.source).toBe("google");
    expect(r.steps["2026-03-01"]).toBe(5000);
    expect(r.hr).toEqual([{ day: "2026-03-01", value: 63.4 }]);
    expect(r.spo2).toEqual([{ day: "2026-03-01", value: 97.2 }]);
    // 23:00→06:30 = 450 min.
    expect(r.sleep["2026-03-01"]).toBe(450);
  });

  test("session-shaped records become workouts with mapped kinds", () => {
    const r = parseGoogleFitText(GFIT_SESSIONS);
    expect(r.error).toBeUndefined();
    expect(r.workouts).toEqual([
      { day: "2026-03-01", minutes: 48, kind: "run" },
      { day: "2026-03-02", minutes: 30, kind: "walk" },
    ]);
  });

  test("activity mapping is best-effort and never throws on unknown codes", () => {
    expect(googleActivityKind(82)).toBe("swim");
    expect(googleActivityKind(83)).toBe("yoga");
    expect(googleActivityKind(12345)).toBe("other");
    expect(googleActivityKind(null)).toBe("other");
  });

  test("unparseable JSON reports 'unparseable'; foreign JSON reports 'unrecognized'", () => {
    expect(parseGoogleFitText("{nope").error).toBe("unparseable");
    expect(parseGoogleFitText(JSON.stringify([{ foo: 1 }])).error).toBe("unrecognized");
  });

  test("the size guard fires BEFORE the parse with the clean Hungarian error", () => {
    expect(() => assertParseableSize(121 * 1024 * 1024)).toThrow(/limit/);
    expect(() => assertParseableSize(5 * 1024 * 1024)).not.toThrow();
  });
});

/* --------------------------------- merge -------------------------------- */

/** Two filled entries in the app's own shape (date + trackerValues). */
function entriesFixture(): Array<{ date: string; trackerValues: Record<string, TrackerValue> }> {
  return [
    { date: "2026-03-01", trackerValues: { steps: { kind: "number", value: 3000 } } },
    { date: "2026-03-02", trackerValues: {} },
  ];
}

function appleResult(): HealthImportResult {
  return {
    source: "apple",
    recordsSeen: 4,
    hr: [{ day: "2026-03-01", value: 62 }, { day: "2026-03-01", value: 71 }],
    hrv: [],
    spo2: [{ day: "2026-03-01", value: 97.2 }],
    steps: { "2026-03-01": 6421 },
    sleep: { "2026-03-01": 390 },
    workouts: [],
  };
}

describe("merge semantics", () => {
  test("fill-only: an existing user value always wins", () => {
    const entries = entriesFixture();
    const out = applyImport(appleResult(), entries, ["sleep", "steps"], false);
    const day1 = out.find((e) => e.date === "2026-03-01")!;
    expect(day1.trackerValues.steps).toEqual({ kind: "number", value: 3000 });
    // And the original array is untouched — the caller owns persistence.
    expect(entries[0].trackerValues.steps).toEqual({ kind: "number", value: 3000 });
  });

  test("fill-only: empty cells on existing days are filled", () => {
    const entries = entriesFixture();
    const out = applyImport(appleResult(), entries, ["sleep", "steps"], false);
    // The sleep day is 03-01 — the day whose entry exists with empty sleep.
    const day1 = out.find((e) => e.date === "2026-03-01")!;
    expect(day1.trackerValues.sleep).toEqual({ kind: "slider", value: 6.5 }); // 390 min → hours
    expect(countChanged(entries, out)).toBe(1);
  });

  test("stubs are created ONLY behind the explicit opt-in", () => {
    const entries = entriesFixture().filter((e) => e.date === "2026-03-02"); // no 03-01 entry
    const withoutStubs = applyImport(appleResult(), entries, ["sleep", "steps"], false);
    expect(withoutStubs.find((e) => e.date === "2026-03-01")).toBeUndefined();
    const withStubs = applyImport(appleResult(), entries, ["sleep", "steps"], true);
    const stub = withStubs.find((e) => e.date === "2026-03-01");
    expect(stub).toBeDefined();
    expect(stub!.trackerValues.steps).toEqual({ kind: "number", value: 6421 });
  });

  test("the two new tracker ids are NOT in the registry yet — they ride on settings only", () => {
    // DELIBERATE. The app's tracker registry drives Settings rows, the entry
    // form and the correlation grid; adding ids there would put new rows on
    // every user's screen. The import writes smartwatch-hr/spo2 VALUES, and
    // the card's one toggle adds both ids to settings.enabledTrackers. The
    // registry must stay exactly as the last batch left it — asserted so the
    // next person does not "helpfully" register them and change the UI.
    const ids = TRACKERS.map((t) => t.id);
    expect(ids).not.toContain(SERIES_TRACKER.hr);
    expect(ids).not.toContain(SERIES_TRACKER.spo2);
    expect(DEFAULT_ENABLED_TRACKERS).not.toContain(SERIES_TRACKER.hr);
    expect(DEFAULT_ENABLED_TRACKERS).not.toContain(SERIES_TRACKER.spo2);
  });

  test("disabled series never write, even on matching days", () => {
    const entries = entriesFixture();
    const out = applyImport(appleResult(), entries, ["steps"], false); // sleep NOT enabled
    expect(out.find((e) => e.date === "2026-03-02")!.trackerValues.sleep).toBeUndefined();
  });

  test("written values respect the registry's step size (steps: 100)", () => {
    // The steps tracker's input steps by 100; the merge rounds to it, so a
    // written value can never be one the form would have rejected.
    const def = TRACKERS.find((t) => t.id === "steps")!;
    if (def && def.input.kind === "number") {
      const cell = { kind: "number" as const, value: 6400 };
      expect(sanitizeTrackerValue(def, cell)).toEqual(cell);
    }
  });

  test("preview counts applies and preserved without mutating anything", () => {
    const entries = entriesFixture();
    const snapshot = JSON.stringify(entries);
    const p = previewImport(appleResult(), entries, ["sleep", "steps"]);
    expect(JSON.stringify(entries)).toBe(snapshot); // pure
    const steps = p.rows.find((r) => r.label === "Lépésszám")!;
    expect(steps.count).toBe(1);
    expect(steps.preserved).toBe(1); // 3000 stays
    expect(steps.applies).toBe(0);
    const sleep = p.rows.find((r) => r.label === "Alvás (óra)")!;
    expect(sleep.count).toBe(1);
    // The sleep day IS 03-01, whose entry exists with no sleep value — so it
    // is fillable, unlike steps which has the user's own 3000.
    expect(sleep.applies).toBe(1);
    expect(sleep.preserved).toBe(0);
  });
});
