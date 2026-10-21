/**
 * Health import: apply a parsed export to entries (Batch 9, commit 5).
 *
 * THE DECISION THIS MODULE ENFORCES
 * The user settled the merge semantics twice, and both times the answer was
 * the conservative one: **fill existing entries by date only**. A parsed
 * sample lands only where the user has already written an entry for that
 * day; where there is no entry, nothing is created (stub creation is an
 * explicit opt-in the card exposes). Where the user's own value exists, the
 * user's value wins — the import never overwrites a hand-written number.
 *
 * Two of the four series land in trackers the app ALREADY has (`sleep` in
 * hours, `steps`); only heart rate and SpO2 need new ones, and those two are
 * OFF in every entry this module touches. Turning them on is a settings
 * action, never a side effect of reading a watch file.
 */
import { t } from "../i18n";
import type { HealthImportResult } from "./types";
import type { TrackerValue } from "../../types";

/** The tracker each parsed series writes to. Sleep/steps are pre-existing ids. */
export const SERIES_TRACKER = {
  hr: "smartwatch-hr",
  spo2: "smartwatch-spo2",
  sleep: "sleep",
  steps: "steps",
} as const;

export type SeriesId = keyof typeof SERIES_TRACKER;
export type TrackerCell = TrackerValue;

/**
 * The four series, with the label each row of the preview prints.
 *
 * THE LABELS ARE `t()`-RESOLVED HERE (round 17), at module scope, and that is
 * deliberate rather than lazy: `ImportPreviewRow.label` is a plain string that
 * `HealthImportCard` renders outside every key and `tests/batch9.test.ts` finds
 * its rows by, so the two contracts the label already carries — a string, and
 * these exact words — stay exactly as they were. The ID stays `SeriesId` too,
 * which is why this declaration is typed rather than `as const`: a `t()` call
 * is a plain `string` and the literal tuple types would widen with it, turning
 * `SERIES_TRACKER[series]` into an index error.
 */
const SERIES_LIST: ReadonlyArray<readonly [SeriesId, string]> = [
  ["hr", t("healthImport.seriesHr")],
  ["spo2", t("healthImport.seriesSpo2")],
  ["sleep", t("healthImport.seriesSleep")],
  ["steps", t("healthImport.seriesSteps")],
];

/** One averaged value per day for spot series; per-day totals otherwise. */
function seriesAsDays(result: HealthImportResult, series: SeriesId): Map<string, number> {
  if (series === "steps") return new Map(Object.entries(result.steps));
  if (series === "sleep") {
    // The parser accumulates minutes; the app's sleep tracker is hours.
    return new Map(Object.entries(result.sleep).map(([d, min]) => [d, Math.round((min / 60) * 10) / 10]));
  }
  const raw = series === "hr" ? result.hr : result.spo2;
  const m = new Map<string, number>();
  for (const sample of raw) {
    const cur = m.get(sample.day);
    m.set(sample.day, cur === undefined ? sample.value : (cur + sample.value) / 2);
  }
  return m;
}

function trackerCell(series: SeriesId, value: number): TrackerCell {
  switch (series) {
    case "sleep":
      return { kind: "slider", value }; // sleep is a 0–14 hour slider
    case "steps":
      return { kind: "number", value };
    case "hr":
    case "spo2":
      return { kind: "number", value };
  }
}

function isEmptyValue(v: unknown): boolean {
  return v === null || v === undefined || v === "";
}

export type MergeEntry = { date: string; trackerValues?: Record<string, TrackerCell> };

/** One row of the pre-apply preview. */
export type ImportPreviewRow = {
  label: string;
  count: number;
  /** Days where the import would actually write (entry exists, tracker on). */
  applies: number;
  /** Days where a value already exists and the import would NOT overwrite. */
  preserved: number;
};

export type ImportPreview = {
  rows: ImportPreviewRow[];
  /** Entries the import would touch at all. */
  entriesTouched: number;
  /** Days with data but no entry (invisible unless the stub opt-in is on). */
  skippedNoEntry: number;
};

/**
 * Preview, BEFORE anything is applied: what would change, what would be
 * preserved, what would be skipped. Pure — no entry is mutated here.
 * `enabled` is the settings.enabledTrackers array; `smartwatch-*` ids are
 * off unless the user switched them on in Settings.
 */
export function previewImport(
  result: HealthImportResult,
  entries: ReadonlyArray<MergeEntry>,
  enabledTrackers: ReadonlyArray<string>,
): ImportPreview {
  const byDate = new Map(entries.map((e) => [e.date, e]));
  const isEnabled = (series: SeriesId) => enabledTrackers.includes(SERIES_TRACKER[series]);

  const rows: ImportPreviewRow[] = SERIES_LIST.map(([series, label]) => {
    const key = SERIES_TRACKER[series];
    const data = seriesAsDays(result, series);
    let applies = 0;
    let preserved = 0;
    for (const [date] of data) {
      const entry = byDate.get(date);
      if (!entry) continue;
      const t = entry.trackerValues?.[key];
      const existing = t && (t.kind === "slider" || t.kind === "number") ? t.value : undefined;
      if (isEnabled(series) && isEmptyValue(existing)) applies++;
      else if (!isEmptyValue(existing)) preserved++;
    }
    return { label, count: data.size, applies, preserved };
  });

  const touched = new Set<string>();
  let skipped = 0;
  for (const [series] of SERIES_LIST) {
    for (const [date] of seriesAsDays(result, series)) {
      if (byDate.has(date)) touched.add(date);
      else skipped++;
    }
  }
  return { rows, entriesTouched: touched.size, skippedNoEntry: skipped };
}

/**
 * Apply: fill-only. Returns a NEW entries array (originals untouched —
 * the caller owns persistence). An existing value always wins. Stubs are
 * created only when `createStubs` is true — the opt-in that has stayed off
 * by default through two user decisions.
 */
export function applyImport(
  result: HealthImportResult,
  entries: ReadonlyArray<MergeEntry>,
  enabledTrackers: ReadonlyArray<string>,
  createStubs: boolean,
): MergeEntry[] {
  const next: MergeEntry[] = entries.map((e) => ({ ...e, trackerValues: { ...(e.trackerValues ?? {}) } }));
  const byDate = new Map(next.map((e) => [e.date, e]));
  for (const [series] of SERIES_LIST) {
    const key = SERIES_TRACKER[series];
    if (!enabledTrackers.includes(key)) continue;
    for (const [date, value] of seriesAsDays(result, series)) {
      let entry = byDate.get(date);
      if (!entry) {
        if (!createStubs) continue;
        entry = { date, trackerValues: {} };
        next.push(entry);
        byDate.set(date, entry);
      }
      const t = entry.trackerValues?.[key];
      const existing = t && (t.kind === "slider" || t.kind === "number") ? t.value : undefined;
      if (!isEmptyValue(existing)) continue; // fill-only: the user's value wins
      const rounded = Math.round(value * 10) / 10;
      entry.trackerValues = { ...(entry.trackerValues ?? {}), [key]: trackerCell(series, rounded) };
    }
  }
  return next;
}

/** How many cells would change, for the "N érték feltöltve" line. */
export function countChanged(
  before: ReadonlyArray<MergeEntry>,
  after: ReadonlyArray<MergeEntry>,
): number {
  const beforeMap = new Map(before.map((e) => [e.date, e.trackerValues ?? {}]));
  let changed = 0;
  for (const e of after) {
    const prev = beforeMap.get(e.date) ?? {};
    for (const [key] of Object.entries(e.trackerValues ?? {})) {
      const was = prev[key];
      const wasEmpty = !was || isEmptyValue((was as { value?: unknown }).value);
      if (wasEmpty) changed++;
    }
  }
  return changed;
}
