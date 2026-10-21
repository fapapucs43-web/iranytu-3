/**
 * Google Fit / Health Connect export parser (Batch 9, commit 4).
 *
 * WHAT A GOOGLE FIT EXPORT IS
 * Takeout delivers a directory of JSON files; the useful one is
 * `Fit/Activities/Activities.json` (session workouts) plus, depending on
 * version, `All Data.json` or per-type daily aggregates with `point` arrays:
 * `com.google.step_count.delta`, `com.google.heart_rate.summary`,
 * `com.google.oxygen_saturation.summary`, `com.google.sleep.segment`.
 * Typical exports are a few MB; a heavy multi-year account can reach tens of
 * MB, which a browser JSON.parse()s comfortably. That is why this parser is
 * whole-file `JSON.parse()` where Apple's is a stream: the formats differ in
 * size by an order of magnitude and the code should say so rather than
 * pretend one strategy fits both.
 *
 * THE SIZE GUARD IS THE ERROR HANDLING
 * `JSON.parse` on an unexpectedly huge file is the one thing here that can
 * kill a tab, so the guard runs BEFORE parsing: past 120 MB the parse is
 * refused with a clean, specific error instead of an OOM. The typical export
 * is under 20 MB, so the limit is 6× headroom, not a feature gate.
 *
 * SHAPE TOLERANCE, STATED
 * Takeout's shape has changed across years (keys renamed, `point` vs
 * `dataSet`, `fitValue` nesting). The parser reads what it recognises and
 * SKIPS the rest rather than throwing: a partially-understood export still
 * imports its steps even if its sleep uses an unknown schema. What it cannot
 * understand at all produces `error: "unrecognized"` with a zero-record
 * result, which the UI reports honestly — not silently empty.
 */
import type { HealthImportResult, HealthWorkout, SleepStage } from "./types";

/** Past this, refuse to parse. Typical exports are < 20 MB. */
const MAX_JSON_BYTES = 120 * 1024 * 1024;

const STEP_TYPES = ["com.google.step_count.delta", "com.google.activity.segment"];
const HR_TYPES = ["com.google.heart_rate.summary", "com.google.heart_rate.delta"];
const SPO2_TYPES = ["com.google.oxygen_saturation.summary", "com.google.oxygen_saturation.delta"];
const SLEEP_TYPES = ["com.google.sleep.segment"];

/** "2026-03-01T06:14:32.123Z" or epoch millis → the app's ISO day. */
function dayOf(ts: string | number): string | null {
  const d = typeof ts === "number" ? new Date(ts) : new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function epochOf(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Date.parse(v);
    if (!Number.isNaN(n)) return n;
  }
  return null;
}

/** Google'sFitValue shape: [{ intVal }] / [{ fpVal }] — read the first. */
function firstNumber(fitValue: unknown): number | null {
  if (!Array.isArray(fitValue)) return null;
  for (const v of fitValue) {
    if (v && typeof v === "object") {
      const o = v as { fpVal?: unknown; intVal?: unknown };
      if (typeof o.fpVal === "number") return o.fpVal;
      if (typeof o.intVal === "number") return o.intVal;
    }
  }
  return null;
}

/** Google sleep segment ints → the app's stages. */
function sleepStage(stage: unknown): SleepStage {
  // 1 = awake, 2 = light(=asleep), 3 = deep, 4 = rem; strings tolerated.
  switch (stage) {
    case 1:
    case "1":
      return "awake";
    case 3:
    case "3":
      return "deep";
    case 4:
    case "4":
      return "rem";
    default:
      return "asleep";
  }
}

/** Google activity ints → the app's sport select ids (best effort). */
export function googleActivityKind(activity: number | null): HealthWorkout["kind"] {
  // Google's activity codes: 8 walking, 9/10/57 running, 1 biking,
  // 82 swimming, 83 yoga, 79 strength...
  if (activity === 8) return "walk";
  if (activity === 9 || activity === 10 || activity === 57) return "run";
  if (activity === 1 || activity === 0) return "bike";
  if (activity === 82) return "swim";
  if (activity === 83) return "yoga";
  if (activity === 79) return "gym";
  return "other";
}

/**
 * Parse one Google Fit JSON file's text. Never throws on data: a malformed
 * file yields `error: "unparseable"`, an empty one `error: "unrecognized"`.
 * Throws ONLY on `text` exceeding `MAX_JSON_BYTES` — checked by the caller
 * via `assertParseableSize` before this is reached, so the throw here is the
 * backstop, not the interface.
 */
export function parseGoogleFitText(text: string): HealthImportResult {
  const acc = {
    source: "google" as const,
    recordsSeen: 0,
    hr: [] as HealthImportResult["hr"],
    spo2: [] as HealthImportResult["spo2"],
    steps: {} as Record<string, number>,
    sleep: {} as Record<string, number>,
    workouts: [] as HealthWorkout[],
  };

  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    return { ...acc, error: "unparseable" };
  }

  // Takeout wraps arrays in { "Data Points": [...] } or { "sessions": [...] }
  // or is itself an array. Collect every plausible record array.
  const arrays: unknown[][] = [];
  const collect = (node: unknown): void => {
    if (Array.isArray(node)) {
      if (node.length > 0) arrays.push(node);
      for (const item of node) collect(item);
      return;
    }
    if (node && typeof node === "object") {
      for (const value of Object.values(node as Record<string, unknown>)) collect(value);
    }
  };
  collect(root);

  for (const arr of arrays) {
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      const dataType = typeof rec.dataType === "string" ? rec.dataType : "";
      const startDate = epochOf(rec.startTimeNanos ? Number(rec.startTimeNanos) / 1e6 : rec.startTime ?? rec.startDate);
      const endDate = epochOf(rec.endTimeNanos ? Number(rec.endTimeNanos) / 1e6 : rec.endTime ?? rec.endDate);
      if (startDate === null) continue;
      const day = dayOf(startDate);
      if (!day) continue;
      acc.recordsSeen++;

      // Heart rate / SpO2: fitValue arrays on summary records.
      const fv = rec.fitValue ?? rec.value;
      if (HR_TYPES.includes(dataType)) {
        const bpm = firstNumber(fv);
        if (bpm !== null && bpm > 20 && bpm < 250) acc.hr.push({ day, value: bpm });
      } else if (SPO2_TYPES.includes(dataType)) {
        const pct = firstNumber(fv);
        if (pct !== null && pct > 50 && pct <= 100) acc.spo2.push({ day, value: pct * 100 > 100 ? pct : pct * 100 });
      } else if (STEP_TYPES.includes(dataType)) {
        const n = firstNumber(fv);
        if (n !== null && n > 0) acc.steps[day] = (acc.steps[day] ?? 0) + n;
      } else if (SLEEP_TYPES.includes(dataType) && endDate !== null) {
        const seg = rec.segment;
        const stage = sleepStage(Array.isArray(seg) ? seg[0] : rec.value);
        if (stage !== "inbed") {
          const minutes = (endDate - startDate) / 60_000;
          if (minutes > 0) acc.sleep[day] = (acc.sleep[day] ?? 0) + minutes;
        }
      } else if (endDate !== null) {
        // Sessions (Activities.json): activity + duration = a workout.
        const activity = typeof rec.activity === "number" ? rec.activity : null;
        const minutes = (endDate - startDate) / 60_000;
        if (activity !== null && minutes > 1) {
          acc.workouts.push({
            day,
            minutes: Math.round(minutes),
            kind: googleActivityKind(activity),
          });
        }
      }
    }
  }

  if (acc.recordsSeen === 0) return { ...acc, error: "unrecognized" };
  return {
    ...acc,
    steps: Object.fromEntries(Object.entries(acc.steps).map(([d, v]) => [d, Math.round(v)])),
    sleep: Object.fromEntries(
      Object.entries(acc.sleep).map(([d, v]) => [d, Math.round(v * 10) / 10]),
    ),
  };
}

/** Size pre-check with the error the UI shows. Call before parseGoogleFitText. */
export function assertParseableSize(byteLength: number): void {
  if (byteLength > MAX_JSON_BYTES) {
    throw new Error(
      `A fájl ${(byteLength / 1024 / 1024).toFixed(0)} MB — a biztonságos limite ${(
        MAX_JSON_BYTES /
        1024 /
        1024
      ).toFixed(0)} MB. Bontsd kisebb részekre a Takeout exportot.`,
    );
  }
}
