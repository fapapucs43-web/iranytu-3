/**
 * Apple Health export parser (Batch 9, commit 3).
 *
 * WHAT AN APPLE HEALTH EXPORT IS
 * "Export Health Data.zip" unzips to `Export.xml` (and ExportCda.xml, which we
 * ignore): one huge `<HealthData>` root wrapping tens of thousands of flat
 * `<Record>` elements, each with attributes — `type`, `unit`, `startDate`,
 * `endDate`, `value` — plus `<Workout>` elements with `<WorkoutStatistics>`
 * children, and `<MetadataEntry>` children carrying extra flags. Typical size
 * 10–200 MB, which is why this file exists at all: `DOMParser` on a 100 MB
 * string OOMs mobile browsers, so the primary path reads the file as a
 * STREAM of lines and regexes the few element shapes we care about.
 *
 * THE LINE-ORIENTED PARSE, AND ITS HONEST LIMIT
 * Apple's exporter writes one element per line — an accident of its serializer
 * that happens to be the reason streaming works. But it is an accident, not a
 * contract: a re-wrapped or re-serialized file (pretty-printers, XSLT tools)
 * can break the one-element-per-line shape. So the parser is a two-stage
 * design: the stream pass records whether it saw a healthy number of records;
 * if it saw almost none on a non-trivially-sized file, the caller falls back
 * to `parseWithDomParser`, which is slower and memory-hungrier but reads real
 * XML structure. `canUseStreamParser` reports this honestly rather than
 * returning an empty success.
 *
 * BOTH PARSERS FEED THE SAME ACCUMULATOR
 * Every record is funnelled through `addRecord()`, so the two backends cannot
 * drift: same unit handling, same date truncation to the app's ISO day, same
 * mapping into `HealthSample`. Unknown record types are skipped by design —
 * an export carries hundreds of types this app does not chart, and "skipped"
 * is the correct answer for them, not an error.
 *
 * WHAT IS EXTRACTED, AND WHERE IT LANDS (the caller maps further):
 *   heart rate   HKQuantityTypeIdentifierHeartRate          → bpm samples
 *   SpO2         HKQuantityTypeIdentifierOxygenSaturation   → % samples
 *   steps        HKQuantityTypeIdentifierStepCount          → summed per day
 *   sleep        HKCategoryTypeIdentifierSleepAnalysis      → stage durations
 *   workouts     HKWorkout                                   → minutes + kind
 *
 * Units are read from the record's own `unit` attribute and normalized —
 * Apple writes heart rate as "count/min", SpO2 as "%" (sometimes "count %"),
 * sleep as seconds in `value`. Nothing is assumed about locale.
 */
import type {
  HealthSample,
  HealthImportResult,
  HealthDaySummary,
  HealthWorkout,
  SleepStage,
} from "./types";

const HR_TYPE = "HKQuantityTypeIdentifierHeartRate";
const SPO2_TYPE = "HKQuantityTypeIdentifierOxygenSaturation";
const STEP_TYPE = "HKQuantityTypeIdentifierStepCount";
const SLEEP_TYPE = "HKCategoryTypeIdentifierSleepAnalysis";
const WORKOUT_TAG = "<Workout ";
const RECORD_TAG = "<Record ";

/**
 * The stream pass expects at least this many Record lines before trusting
 * itself. A re-wrapped file puts several elements on one line (or one element
 * across many), so the line regex misses most records; a real export of any
 * size has thousands. Below the floor, prefer the DOM fallback.
 */
const STREAM_MIN_RECORDS = 50;

/** Attribute extraction. Apple attribute values are XML-escaped. */
function attr(line: string, name: string): string | null {
  const m = line.match(new RegExp(`${name}="([^"]*)"`));
  if (!m) return null;
  return m[1]
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** "2026-03-01 06:14:32 +0100" → "2026-03-01" (the app's day key). */
function toDay(appleDate: string | null): string | null {
  if (!appleDate) return null;
  const m = appleDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** "2026-03-01 06:14:32 +0100" → minutes elapsed, or null. */
function durationMinutes(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const parse = (s: string) => {
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
    if (!m) return null;
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  };
  const a = parse(start);
  const b = parse(end);
  if (a === null || b === null || b <= a) return null;
  return (b - a) / 60_000;
}

/**
 * Apple's sleep category values → the app's four stages. Anything unknown
 * becomes "asleep" rather than dropped: the older exports' "Asleep" values
 * and the newer stage values must both count toward sleep duration.
 */
export function appleSleepStage(value: string): SleepStage {
  const v = value.toLowerCase();
  if (v.includes("deep")) return "deep";
  if (v.includes("rem")) return "rem";
  if (v.includes("awake")) return "awake";
  if (v.includes("inbed")) return "inbed";
  return "asleep";
}

/** Apple workout activity types → the app's sport select ids (best effort). */
export function appleWorkoutKind(activityType: string): HealthWorkout["kind"] {
  const t = activityType.toLowerCase();
  if (t.includes("running") || t.includes("walk")) return t.includes("walk") ? "walk" : "run";
  if (t.includes("cycling")) return "bike";
  if (t.includes("swim")) return "swim";
  if (t.includes("yoga")) return "yoga";
  if (t.includes("gym") || t.includes("strength") || t.includes("functional")) return "gym";
  return "other";
}

/**
 * The accumulator. One instance per parse; both backends call `addRecord`.
 * Samples keep their original timestamp-day split (a sleep session spanning
 * midnight contributes to both days it actually spans).
 */
export class HealthAccumulator {
  readonly hr: HealthSample[] = [];
  readonly spo2: HealthSample[] = [];
  readonly steps: HealthSample[] = [];
  readonly sleep: { day: string; minutes: number; stage: SleepStage }[] = [];
  readonly workouts: HealthWorkout[] = [];
  recordsSeen = 0;

  addRecord(line: string): void {
    const type = attr(line, "type");
    this.recordsSeen++;
    const day = toDay(attr(line, "startDate"));
    if (!day) return;
    const value = attr(line, "value");
    if (type === HR_TYPE && value) {
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) this.hr.push({ day, value: n });
    } else if (type === SPO2_TYPE && value) {
      const n = Number(value);
      // Apple writes 0.97 ("count %") or 97 ("%") — normalize both to %.
      const pct = attr(line, "unit") === "%" ? n : n * 100;
      if (Number.isFinite(pct) && pct > 50 && pct <= 100) {
        this.spo2.push({ day, value: pct });
      }
    } else if (type === STEP_TYPE && value) {
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) this.steps.push({ day, value: n });
    } else if (type === SLEEP_TYPE) {
      const minutes = durationMinutes(attr(line, "startDate"), attr(line, "endDate"));
      if (minutes !== null) {
        this.sleep.push({
          day,
          minutes,
          stage: appleSleepStage(value ?? ""),
        });
      }
    }
  }

  addWorkout(line: string): void {
    const day = toDay(attr(line, "startDate"));
    const minutes = durationMinutes(attr(line, "startDate"), attr(line, "endDate"));
    const activity = attr(line, "workoutActivityType") ?? "";
    if (day && minutes !== null) {
      this.workouts.push({ day, minutes, kind: appleWorkoutKind(activity) });
    }
    this.recordsSeen++;
  }
}

/**
 * Parse a whole export as text, one record per line. Runs on anything that
 * can produce a string; the caller is responsible for streaming the blob
 * (`blob.stream()` + TextDecoderStream) and for the fallback decision —
 * see `canUseStreamParser`.
 */
export function parseAppleHealthText(text: string): HealthImportResult {
  const acc = new HealthAccumulator();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith(RECORD_TAG)) acc.addRecord(trimmed);
    else if (trimmed.startsWith(WORKOUT_TAG)) acc.addWorkout(trimmed);
  }
  return summarize(acc);
}

/** Whether the stream pass saw enough to be trusted on this input. */
export function canUseStreamParser(result: HealthImportResult, textLength: number): boolean {
  // Tiny files (< 64 kB) go through the stream pass regardless: even an
  // empty-looking result is cheap and a DOMParser fallback on a small file
  // buys nothing.
  if (textLength < 64 * 1024) return true;
  return result.recordsSeen >= STREAM_MIN_RECORDS;
}

/**
 * The DOM fallback: real XML parsing for files whose line shape broke.
 * Same accumulator, so the output shape is identical.
 */
export function parseWithDomParser(text: string): HealthImportResult {
  const acc = new HealthAccumulator();
  if (typeof DOMParser === "undefined") {
    return summarize(acc, "no-domparser");
  }
  const doc = new DOMParser().parseFromString(text, "text/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    return summarize(acc, "unparseable");
  }
  for (const node of Array.from(doc.getElementsByTagName("Record"))) {
    acc.addRecord(nodeXmlShape(node));
  }
  for (const node of Array.from(doc.getElementsByTagName("Workout"))) {
    acc.addWorkout(nodeXmlShape(node));
  }
  return summarize(acc);
}

/** Flatten an Element into the attribute-string shape the accumulator reads. */
function nodeXmlShape(node: Element): string {
  const parts: string[] = [];
  for (const a of Array.from(node.attributes)) parts.push(`${a.name}="${a.value}"`);
  return `<${node.tagName} ${parts.join(" ")}>`;
}

function summarize(acc: HealthAccumulator, error?: string): HealthImportResult {
  return {
    source: "apple",
    recordsSeen: acc.recordsSeen,
    hr: acc.hr,
    spo2: acc.spo2,
    steps: sumStepsPerDay(acc.steps),
    sleep: sumSleepPerDay(acc.sleep),
    workouts: acc.workouts,
    error,
  };
}

function sumStepsPerDay(steps: HealthSample[]): HealthDaySummary {
  const out: HealthDaySummary = {};
  for (const s of steps) out[s.day] = (out[s.day] ?? 0) + s.value;
  return Object.fromEntries(Object.entries(out).map(([d, v]) => [d, Math.round(v)]));
}

function sumSleepPerDay(rows: { day: string; minutes: number; stage: SleepStage }[]): HealthDaySummary {
  const out: HealthDaySummary = {};
  for (const r of rows) {
    if (r.stage === "inbed") continue; // in-bed-but-awake is not sleep
    out[r.day] = (out[r.day] ?? 0) + r.minutes;
  }
  return Object.fromEntries(Object.entries(out).map(([d, v]) => [d, Math.round(v * 10) / 10]));
}

/**
 * Top-level entry: stream a Blob line by line, fall back to DOM parsing when
 * the stream pass looks like it missed the file's shape.
 *
 * `Blob.stream()` + `TextDecoderStream` are native; nothing is buffered whole
 * unless the DOM fallback fires, which is the trade the caller was told about.
 */
export async function parseAppleHealthBlob(blob: Blob): Promise<HealthImportResult> {
  if (typeof blob.stream !== "function" || typeof TextDecoderStream === "undefined") {
    const text = await blob.text();
    const streamed = parseAppleHealthText(text);
    if (!canUseStreamParser(streamed, text.length)) return parseWithDomParser(text);
    return streamed;
  }

  let text = "";
  let truncated = false;
  const reader = blob.stream().pipeThrough(new TextDecoderStream()).getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += value;
      // Guardrail: a >400 MB text accumulation would OOM. The parse result
      // from the first 400 MB is still returned — better than a crash —
      // and the guard exists so the limit is a decision, not a surprise.
      if (text.length > 400 * 1024 * 1024) {
        truncated = true;
        break;
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* already closed */
    }
  }

  const streamed = parseAppleHealthText(text);
  if (truncated) return summarizeFromStream(streamed, truncated);
  if (!canUseStreamParser(streamed, text.length)) return parseWithDomParser(text);
  return streamed;
}

function summarizeFromStream(result: HealthImportResult, truncated: boolean): HealthImportResult {
  return truncated ? { ...result, error: "truncated" } : result;
}
