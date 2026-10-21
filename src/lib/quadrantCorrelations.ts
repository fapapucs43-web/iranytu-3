/**
 * Batch A — the two new insight cards' math: "Érzés és kontextus" (which
 * contexts co-occur with which emotions) and "Kvadráns és alvás" (average
 * sleep per quadrant, against every other day as baseline).
 *
 * Both are pure functions over entries, with the app's standard sample guard
 * (`MIN_SAMPLES`, 2 — the same rule the correlation grid and the lag analysis
 * apply) so a card never reads a single day as a pattern.
 *
 * WHY CO-OCCURRENCE RATHER THAN CORRELATION FOR EMOTION × CONTEXT
 * Context selections are multi-valued strings and the emotion is one label —
 * a Pearson-style number would have to invent units for them. What the data
 * CAN say honestly is how often a context chip appeared next to an emotion,
 * against how often that emotion appears at all; that ratio is stated as a
 * percentage with its sample count, never as a causal claim.
 */
import type { Entry, EntryContext, MoodQuadrant } from "../types";
import { CONTEXT_DIMENSIONS } from "./contextOptions";
import { MIN_SAMPLES } from "./correlationGrid";

/** Emotion × Context: one context chip's co-occurrence with one emotion. */
export type EmotionContextRow = {
  emotion: string;
  contextLabel: string;
  /** Days with both the emotion and the context chip. */
  together: number;
  /** Days with the emotion at all. */
  emotionDays: number;
  /** together / emotionDays, 0–100, rounded; null under the sample guard. */
  percent: number | null;
};

function contextLabels(context: EntryContext | undefined): string[] {
  if (!context) return [];
  const out: string[] = [];
  for (const dim of CONTEXT_DIMENSIONS) {
    for (const label of context[dim] ?? []) {
      if (typeof label === "string" && label.trim() && !out.includes(label)) out.push(label);
    }
  }
  return out;
}

/**
 * Co-occurrence rows for every (emotion, context) pair with at least one
 * joint day, sorted by the strongest evidence. Emotions with fewer than
 * `MIN_SAMPLES` days are skipped entirely — one day proves nothing.
 */
export function emotionContextRows(entries: Entry[]): EmotionContextRow[] {
  const rows: EmotionContextRow[] = [];
  const byEmotion = new Map<string, Entry[]>();
  for (const entry of entries) {
    const emotion = entry.emotion?.trim();
    if (!emotion) continue;
    const list = byEmotion.get(emotion) ?? [];
    list.push(entry);
    byEmotion.set(emotion, list);
  }
  for (const [emotion, days] of byEmotion) {
    if (days.length < MIN_SAMPLES) continue;
    const seenPairs = new Set<string>();
    for (const entry of days) {
      for (const label of contextLabels(entry.context)) {
        const key = `${emotion}\u0000${label}`;
        if (seenPairs.has(key)) continue;
        seenPairs.add(key);
        const together = days.filter((d) => contextLabels(d.context).includes(label)).length;
        rows.push({
          emotion,
          contextLabel: label,
          together,
          emotionDays: days.length,
          percent: Math.round((together / days.length) * 100),
        });
      }
    }
  }
  return rows.sort((a, b) => b.together - a.together || a.emotion.localeCompare(b.emotion, "hu"));
}

/** Quadrant × Sleep: one quadrant's average sleep against the rest. */
export type QuadrantSleepRow = {
  quadrant: MoodQuadrant;
  /** Days in this quadrant WITH a sleep value. */
  days: number;
  /** Mean sleep hours on those days; null under the sample guard. */
  avgSleep: number | null;
  /** Mean sleep on all OTHER days with a sleep value; null under the guard. */
  avgSleepRest: number | null;
  /** avgSleep − avgSleepRest, rounded to 1 decimal; null unless both exist. */
  delta: number | null;
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function meanSleep(days: Entry[]): number | null {
  const vals = days
    .map((e) => e.vitals.sleepHours)
    .filter((h): h is number => typeof h === "number");
  if (vals.length < MIN_SAMPLES) return null;
  return vals.reduce((s, n) => s + n, 0) / vals.length;
}

export function quadrantSleepRows(entries: Entry[]): QuadrantSleepRow[] {
  const withSleep = entries.filter((e) => typeof e.vitals.sleepHours === "number");
  const quadrants: MoodQuadrant[] = ["high-neg", "high-pos", "low-neg", "low-pos"];
  return quadrants.map((quadrant) => {
    const own = withSleep.filter((e) => e.quadrant === quadrant);
    const rest = withSleep.filter((e) => e.quadrant !== quadrant);
    const avgSleep = meanSleep(own);
    const avgSleepRest = meanSleep(rest);
    return {
      quadrant,
      days: own.length,
      avgSleep: avgSleep !== null ? round1(avgSleep) : null,
      avgSleepRest: avgSleepRest !== null ? round1(avgSleepRest) : null,
      delta: avgSleep !== null && avgSleepRest !== null ? round1(avgSleep - avgSleepRest) : null,
    };
  });
}
