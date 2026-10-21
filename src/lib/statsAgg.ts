/**
 * Monthly/yearly statistics aggregations (Batch 2, P4).
 *
 * Pure functions over the existing Entry[]. Mood averages use the same 0–100
 * mapping as the rest of the app; days-logged counts come from entry dates.
 */
import { moodByLevel } from "./mood";
import { toISODate } from "./dates";
import type { Entry } from "../types";

export type PeriodStat = {
  /** "2026" or "2026-09" */
  key: string;
  label: string;
  daysLogged: number;
  avgMood: number | null; // 0–100
  avgStress: number | null; // 1–10, 1 decimal
  avgEnergy: number | null;
  bestDay: { date: string; mood: number } | null;
  worstDay: { date: string; mood: number } | null;
};

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((s, n) => s + n, 0) / nums.length) * 10) / 10;
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function yearKey(iso: string): string {
  return iso.slice(0, 4);
}

const MONTH_LABELS = [
  "Január", "Február", "Március", "Április", "Május", "Június",
  "Július", "Augusztus", "Szeptember", "Október", "November", "December",
];

/** Aggregate entries for one month key ("2026-09"). */
export function monthStat(entries: Entry[], key: string): PeriodStat {
  const month = Number(key.slice(5, 7)) - 1;
  const inPeriod = entries.filter((e) => monthKey(e.date) === key);
  const moods = inPeriod.map((e) => moodByLevel(e.mood).score);
  const best = inPeriod.reduce<Entry | null>(
    (acc, e) => (!acc || moodByLevel(e.mood).score > moodByLevel(acc.mood).score ? e : acc),
    null,
  );
  const worst = inPeriod.reduce<Entry | null>(
    (acc, e) => (!acc || moodByLevel(e.mood).score < moodByLevel(acc.mood).score ? e : acc),
    null,
  );
  return {
    key,
    label: `${MONTH_LABELS[month]} ${key.slice(0, 4)}`,
    daysLogged: inPeriod.length,
    avgMood: moods.length ? Math.round(moods.reduce((s, n) => s + n, 0) / moods.length) : null,
    avgStress: avg(inPeriod.map((e) => e.stress)),
    avgEnergy: avg(inPeriod.map((e) => e.energy)),
    bestDay: best ? { date: best.date, mood: moodByLevel(best.mood).score } : null,
    worstDay: worst ? { date: worst.date, mood: moodByLevel(worst.mood).score } : null,
  };
}

/** Aggregate entries for one year key ("2026"). */
export function yearStat(entries: Entry[], key: string): PeriodStat {
  const inPeriod = entries.filter((e) => yearKey(e.date) === key);
  const moods = inPeriod.map((e) => moodByLevel(e.mood).score);
  const best = inPeriod.reduce<Entry | null>(
    (acc, e) => (!acc || moodByLevel(e.mood).score > moodByLevel(acc.mood).score ? e : acc),
    null,
  );
  const worst = inPeriod.reduce<Entry | null>(
    (acc, e) => (!acc || moodByLevel(e.mood).score < moodByLevel(acc.mood).score ? e : acc),
    null,
  );
  return {
    key,
    label: key,
    daysLogged: inPeriod.length,
    avgMood: moods.length ? Math.round(moods.reduce((s, n) => s + n, 0) / moods.length) : null,
    avgStress: avg(inPeriod.map((e) => e.stress)),
    avgEnergy: avg(inPeriod.map((e) => e.energy)),
    bestDay: best ? { date: best.date, mood: moodByLevel(best.mood).score } : null,
    worstDay: worst ? { date: worst.date, mood: moodByLevel(worst.mood).score } : null,
  };
}

/** Month keys present in the data plus the current month, newest first. */
export function availableMonths(entries: Entry[]): string[] {
  const keys = new Set(entries.map((e) => monthKey(e.date)));
  // Local month, so the current month matches every entry's local date.
  keys.add(toISODate().slice(0, 7));
  return [...keys].sort((a, b) => (a < b ? 1 : -1));
}

export function availableYears(entries: Entry[]): string[] {
  const keys = new Set(entries.map((e) => yearKey(e.date)));
  keys.add(String(new Date().getFullYear()));
  return [...keys].sort((a, b) => (a < b ? 1 : -1));
}
