/**
 * Lag analysis (Phase 3): does an activity's effect on mood show up a day or
 * two LATER? (E.g. hard workout today, sore/faded mood tomorrow.)
 *
 * For each activity tag we compare the average mood on "tagged" days (lag 0)
 * with the days 1 and 2 days AFTER a tagged day (lag +1, +2), against all
 * other days. Sample-size guards keep tiny datasets from producing noise.
 */
import { moodByLevel } from "./mood";
import { addDays } from "./dates";
import type { Entry } from "../types";

export type LagStat = {
  tag: string;
  count: number;
  /** Average mood score (0–100) on the tagged day itself. */
  sameDay: number;
  /** Average mood score `lag` days after tagged days. */
  nextDay: number | null;
  dayAfter: number | null;
  /** Baseline: average on days that are not tagged (and not "after" days). */
  baseline: number;
};

const MIN_SAMPLES = 2;

function moodScore(e: Entry): number {
  return moodByLevel(e.mood).score;
}

function avg(scores: number[]): number | null {
  if (scores.length < MIN_SAMPLES) return null;
  return Math.round(scores.reduce((s, n) => s + n, 0) / scores.length);
}

export function lagStats(entries: Entry[]): LagStat[] {
  if (entries.length < 4) return [];
  const byDate = new Map(entries.map((e) => [e.date, e]));
  const allTags = new Set(entries.flatMap((e) => e.activities));

  const stats: LagStat[] = [];
  for (const tag of allTags) {
    const tagged = entries.filter((e) => e.activities.includes(tag));
    if (tagged.length < MIN_SAMPLES) continue;

    const sameDayScores = tagged.map(moodScore);

    const nextDayScores: number[] = [];
    const dayAfterScores: number[] = [];
    for (const e of tagged) {
      const n1 = byDate.get(addDays(e.date, 1));
      if (n1) nextDayScores.push(moodScore(n1));
      const n2 = byDate.get(addDays(e.date, 2));
      if (n2) dayAfterScores.push(moodScore(n2));
    }

    const taggedDates = new Set(tagged.map((e) => e.date));
    const afterDates = new Set([
      ...tagged.map((e) => addDays(e.date, 1)),
      ...tagged.map((e) => addDays(e.date, 2)),
    ]);
    const baselineScores = entries
      .filter((e) => !taggedDates.has(e.date) && !afterDates.has(e.date))
      .map(moodScore);

    stats.push({
      tag,
      count: tagged.length,
      sameDay: avg(sameDayScores) ?? 0,
      nextDay: avg(nextDayScores),
      dayAfter: avg(dayAfterScores),
      baseline: avg(baselineScores) ?? 0,
    });
  }
  return stats.sort((a, b) => b.count - a.count);
}

/** Human-readable delta vs baseline, in mood points; null when insufficient. */
export function deltaLabel(value: number | null, baseline: number): string | null {
  if (value === null) return null;
  const d = Math.round(value - baseline);
  return d > 0 ? `+${d}` : `${d}`;
}
