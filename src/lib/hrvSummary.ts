/**
 * HRV summary — the numbers behind the Egészség tab's HRV card (phase 4).
 *
 * WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT
 * A description of the reader's own imported samples: an average, a recent
 * average, an earlier average, and the direction between the two windows.
 * It is NOT an interpretation — no reference range, no "good" or "bad", no
 * age-adjusted band. The audit's rule for wearable data holds here exactly:
 * HRV appears neutral, and the card reports the reader's own numbers rather
 * than a verdict about them.
 *
 * THE TWO WINDOWS ARE SAMPLED DAYS, NOT CALENDAR DAYS
 * The import writes a value wherever an entry existed, which is most days but
 * never all of them. Counting empty calendar days would make a week of
 * holidays look like a collapse, so the windows slice the SORTED SAMPLED days:
 * the last up-to-seven are "recent", the up-to-seven before those "earlier".
 * A reader who logged sparsely gets an honest "these three days" rather than
 * an average padded with absences.
 *
 * THE TREND NEEDS TWO DAYS PER WINDOW ON PURPOSE
 * One value per window is a difference of two single nights, and HRV moves
 * that much between two nights for reasons the record does not contain. The
 * verdict is withheld until each window has at least two sampled days; the
 * averages still render, because they are facts even when the direction is
 * not yet one.
 *
 * Rounding happens here, once, to one decimal: these are display numbers, the
 * card prints them verbatim, and two rounding sites would be two answers to
 * "what is my average?".
 */
import { SERIES_TRACKER } from "./healthImport/merge";
import type { TrackerValue } from "../types";

/** Days per window. Seven is a week of watch nights, not a statistical claim. */
export const HRV_WINDOW = 7;

/** Each window needs at least this many sampled days before a trend is stated. */
export const HRV_TREND_MIN_DAYS = 2;

/**
 * The smallest shift the card calls a direction. Day-to-day HRV noise on a
 * healthy wrist routinely spans several milliseconds, so a two-millisecond
 * gap between the windows is "no visible movement" — reporting a direction
 * under it would be storytelling from noise.
 */
export const HRV_TREND_DELTA_MS = 2;

export type HrvTrend = "up" | "down" | "flat";

export type HrvSummary = {
  /** Distinct sampled days. */
  days: number;
  /** Mean over every sampled day, or null when there is none. */
  avg: number | null;
  /** Mean over the last up-to-seven sampled days. */
  recentAvg: number | null;
  /** Mean over the up-to-seven sampled days before those. */
  priorAvg: number | null;
  /** Direction between the two windows; null while either is too thin to speak. */
  trend: HrvTrend | null;
};

type Sampled = Pick<
  { date: string; trackerValues?: Record<string, TrackerValue> },
  "date" | "trackerValues"
>;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return round1(values.reduce((a, b) => a + b, 0) / values.length);
}

/**
 * Summarise the imported HRV samples in a set of entries.
 *
 * One tracker cell per day by construction (the import fills, never stacks),
 * so a day contributes its stored number as-is; days without a usable numeric
 * cell are absent from every average rather than counted as zero.
 */
export function hrvSummary(entries: ReadonlyArray<Sampled>): HrvSummary {
  // TEMPORAL order, not numeric: "recent" means the last days the reader
  // recorded, and sorting by value would silently turn the recent window into
  // the highest-reading window — a trend that flatters a rising body and
  // hides a falling one, which is precisely the kind of silent lie this
  // module's neutrality exists to prevent.
  const byDay = entries
    .filter((entry) => typeof entry.date === "string" && entry.date !== "")
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const values: number[] = [];
  for (const entry of byDay) {
    const cell = entry.trackerValues?.[SERIES_TRACKER.hrv];
    if (!cell || (cell.kind !== "number" && cell.kind !== "slider")) continue;
    if (typeof cell.value !== "number" || !Number.isFinite(cell.value)) continue;
    values.push(cell.value);
  }
  const days = values.length;

  const recent = values.slice(-HRV_WINDOW);
  const prior = values.slice(Math.max(0, days - HRV_WINDOW * 2), days - HRV_WINDOW);
  const recentAvg = mean(recent);
  const priorAvg = mean(prior);

  let trend: HrvTrend | null = null;
  if (
    recent.length >= HRV_TREND_MIN_DAYS &&
    prior.length >= HRV_TREND_MIN_DAYS &&
    recentAvg !== null &&
    priorAvg !== null
  ) {
    const delta = recentAvg - priorAvg;
    trend = delta > HRV_TREND_DELTA_MS ? "up" : delta < -HRV_TREND_DELTA_MS ? "down" : "flat";
  }

  return { days, avg: mean(values), recentAvg, priorAvg, trend };
}
