/**
 * Correlation grid (Batch 2, P7 — Bearable-style matrix).
 *
 * Generalizes the existing tagCorrelations (analysis.ts) and lagAnalysis
 * patterns: rows are activities (built-in defaults + the user's custom
 * activities), columns are OUTCOMES — the four fixed scalars (mood, stress,
 * energy, sleep), every built-in tracker that declares itself a numeric
 * outcome, and every numeric custom tracker. Each cell is the average on
 * "row active" days minus the baseline (all other days), with the same ≥2
 * sample guard the rest of the app uses. Pure math; the component renders it.
 *
 * WHY THE OUTCOME LIST IS DERIVED, NOT WRITTEN
 * Built-in numeric columns come from `TrackerDef.outcome` in `lib/trackers`, so
 * a new numeric tracker is a first-class outcome by adding one field to its
 * definition and nothing else. `nutrition` used to be a hard-coded fifth entry
 * here; it is now a registry row like any other, which is what makes that true
 * for `steps`, `nutritionCalories`, `sportDuration` and `weatherTemp`.
 *
 * The one thing that is still written out is the four fixed scalars, because
 * they are not stored on `trackerValues` at all.
 */
import type { Entry } from "../types";
import { moodByLevel } from "./mood";
import { DEFAULT_ACTIVITIES } from "./store";
import { TRACKERS } from "./trackers";
import { t } from "./i18n";

export type OutcomeId =
  | "mood"
  | "stress"
  | "energy"
  | "sleep"
  | `tracker:${string}`
  | `custom:${string}`;

export type OutcomeDef = {
  id: OutcomeId;
  label: string;
  icon: string;
  /**
   * `true`/`false` is a value judgement and flips the ▲/▼ wording. `null` is
   * NEUTRAL: the delta is reported with its direction and no judgement at all.
   *
   * The neutral case is not decoration. Calories, temperature and workout
   * length are all "more is not better", and the model this replaced had only a
   * boolean — so it would have had to claim that 2400 kcal is a better Tuesday
   * than 1800, which is not something the data can know.
   */
  higherIsBetter: boolean | null;
};

// Round 18 keyed the four labels. `id` stays what it is: it is the name a stored
// correlation result is matched on, while `label` is what the tag says.
export const BUILT_IN_OUTCOMES: OutcomeDef[] = [
  { id: "mood", label: t("correlation.mood"), icon: "🙂", higherIsBetter: true },
  { id: "stress", label: t("correlation.stress"), icon: "🔴", higherIsBetter: false },
  { id: "energy", label: t("correlation.energy"), icon: "🔋", higherIsBetter: true },
  { id: "sleep", label: t("correlation.sleep"), icon: "😴", higherIsBetter: true },
];

export const MIN_SAMPLES = 2;

/** Raw sample average for one outcome on a set of entries; null when absent. */
function outcomeValue(entry: Entry, id: OutcomeId): number | null {
  switch (id) {
    case "mood":
      return moodByLevel(entry.mood).score;
    case "stress":
      return entry.stress;
    case "energy":
      return entry.energy;
    case "sleep": {
      const h = entry.vitals.sleepHours;
      return typeof h === "number" ? h : null;
    }
    default: {
      // Both prefixes name a tracker id in `trackerValues`, and the two
      // numeric value kinds are the only ones that can be a measurement. A
      // `number` holding `null` is "not recorded" and falls out here as no
      // sample, which is the whole reason the kind is nullable.
      const key = id.startsWith("custom:") ? id.slice("custom:".length) : id.slice(8);
      const v = entry.trackerValues?.[key];
      if (v?.kind === "slider") return v.value;
      if (v?.kind === "number") return v.value;
      return null;
    }
  }
}

export type GridCell = {
  /** avg(active) − avg(baseline); null when either side lacks samples. */
  delta: number | null;
  /** Days with this row active AND a value for the outcome. */
  count: number;
};

export type GridRow = {
  /** Activity label as shown on tags, e.g. "🚶 Mozgás". */
  label: string;
  icon: string;
  isCustom: boolean;
  cells: Record<string, GridCell>;
};

function mean(nums: number[]): number | null {
  if (nums.length < MIN_SAMPLES) return null;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

/** Round deltas to 1 decimal for stable display/tests. */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export type GridInput = {
  entries: Entry[];
  /** Numeric custom tracker defs: id + label + icon (from useCustomTrackers). */
  customNumericTrackers: { id: string; icon: string; label: string }[];
  /** User-defined activity rows (from useCustomActivities in the component). */
  customActivities: { icon: string; label: string }[];
};

export type CorrelationGridResult = {
  outcomes: OutcomeDef[];
  rows: GridRow[];
};

/**
 * Build the full matrix. Rows with no activity occurrences at all are skipped
 * (nothing to compare); cells below the sample guard get `delta: null`.
 */
export function buildCorrelationGrid(input: GridInput): CorrelationGridResult {
  const { entries } = input;

  // A built-in numeric column appears only once the user has recorded
  // something in it. Without this, Batch 7e would have added four columns that
  // are entirely "·" for everybody who has not used the new trackers, inside a
  // horizontally scrolling table.
  //
  // `nutrition` is included in this, which is the visible consequence: a user
  // with entries but no nutrition records loses a column of dots. The four
  // fixed scalars are never gated, and custom numeric columns keep the
  // ungated behaviour they shipped with in Batch 2 — gating those would be a
  // change to a shipped feature, and this batch's rule is that it is additive.
  const trackerOutcomes: OutcomeDef[] = TRACKERS.filter((t) => t.outcome).map((t) => ({
    id: `tracker:${t.id}` as OutcomeId,
    label: t.label,
    icon: t.icon,
    higherIsBetter: t.outcome!.higherIsBetter,
  }));

  const outcomes: OutcomeDef[] = [
    ...BUILT_IN_OUTCOMES,
    ...trackerOutcomes.filter((o) => entries.some((e) => outcomeValue(e, o.id) !== null)),
    ...input.customNumericTrackers.map((t) => ({
      id: `custom:${t.id}` as OutcomeId,
      label: t.label,
      icon: t.icon,
      higherIsBetter: true,
    })),
  ];

  // Row candidates: built-ins first (stable order), then custom defs.
  const builtIn = DEFAULT_ACTIVITIES.map((label) => ({ label, icon: label.split(" ")[0] ?? "⭐", isCustom: false }));
  const custom = input.customActivities.map((a) => ({ label: `${a.icon} ${a.label}`, icon: a.icon, isCustom: true }));

  const rows: GridRow[] = [];
  for (const row of [...builtIn, ...custom]) {
    const active = entries.filter((e) => e.activities.includes(row.label));
    if (active.length === 0) continue;
    const baseline = entries.filter((e) => !e.activities.includes(row.label));

    const cells: Record<string, GridCell> = {};
    for (const outcome of outcomes) {
      const activeVals = active
        .map((e) => outcomeValue(e, outcome.id))
        .filter((v): v is number => v !== null);
      const baseVals = baseline
        .map((e) => outcomeValue(e, outcome.id))
        .filter((v): v is number => v !== null);
      const a = mean(activeVals);
      const b = mean(baseVals);
      cells[outcome.id] = {
        delta: a !== null && b !== null ? round1(a - b) : null,
        count: activeVals.length,
      };
    }
    rows.push({ label: row.label, icon: row.icon, isCustom: row.isCustom, cells });
  }
  return { outcomes, rows };
}

/** Sign word for a cell, respecting "higher is better" of the outcome. */
export function cellTone(cell: GridCell, outcome: OutcomeDef): "up" | "down" | "flat" | "none" {
  if (cell.delta === null) return "none";
  if (Math.abs(cell.delta) < 0.5) return "flat";
  // A NEUTRAL outcome keeps its direction and drops the judgement, so a
  // calorie cell reads "nagyobb" rather than asserting that more is better.
  if (outcome.higherIsBetter === null) return cell.delta > 0 ? "up" : "down";
  const positive = outcome.higherIsBetter ? cell.delta > 0 : cell.delta < 0;
  return positive ? "up" : "down";
}
