import type { Entry } from "../types";
import { moodByLevel } from "./mood";
import { t } from "./i18n";
import { toISODate } from "./dates";

/** Average of a numeric field across entries. */
export function avg(entries: Entry[], field: "stress" | "energy"): number {
  if (entries.length === 0) return 0;
  return entries.reduce((sum, e) => sum + e[field], 0) / entries.length;
}

/** Average well-being score (0–100) from mood levels. */
export function avgMoodScore(entries: Entry[]): number {
  if (entries.length === 0) return 0;
  return (
    entries.reduce((sum, e) => sum + moodByLevel(e.mood).score, 0) /
    entries.length
  );
}

/** Balance score of the newest entry: 0–100 (stress + energy + mood). */
export function balanceScore(entry: Entry): number {
  const moodPart = (moodByLevel(entry.mood).score / 100) * 40;
  const stressPart = ((10 - entry.stress) / 9) * 30;
  const energyPart = ((entry.energy - 1) / 9) * 30;
  return Math.round(moodPart + stressPart + energyPart);
}

/** Consecutive days with an entry, counting back from today (or yesterday). */
export function currentStreak(entries: Entry[]): number {
  const days = new Set(entries.map((e) => e.date));
  if (days.size === 0) return 0;

  // Start from today; if today is missing, start yesterday (the streak is not
  // "broken" just because today has not been logged yet). Keys come from
  // toISODate (LOCAL date), matching how every entry is dated — using
  // toISOString() here would compare against the UTC date and silently miss
  // between local midnight and the UTC rollover.
  const day = new Date();
  if (!days.has(toISODate(day))) {
    day.setDate(day.getDate() - 1);
  }
  let streak = 0;
  // Walk backwards day by day while an entry exists.
  for (;;) {
    if (!days.has(toISODate(day))) break;
    streak++;
    day.setDate(day.getDate() - 1);
  }
  return streak;
}

export type TagStat = {
  tag: string;
  count: number;
  avgMood: number; // 0–100
  avgStress: number;
  avgEnergy: number;
  /** avgMood − overall average; positive = lifts mood, negative = drags it down. */
  delta: number;
};

/**
 * Daylio-style correlation engine: for each activity/tag, compare the average
 * weekly emotional score with and without the tag.
 */
export function tagCorrelations(entries: Entry[]): TagStat[] {
  if (entries.length === 0) return [];
  const overall = avgMoodScore(entries);

  const byTag: Record<string, Entry[]> = {};
  for (const entry of entries) {
    for (const tag of entry.activities) {
      (byTag[tag] ??= []).push(entry);
    }
  }

  const stats: TagStat[] = [];
  for (const [tag, list] of Object.entries(byTag)) {
    if (list.length < 2) continue; // not enough data to mean anything
    const m = avgMoodScore(list);
    stats.push({
      tag,
      count: list.length,
      avgMood: Math.round(m),
      avgStress: Math.round(avg(list, "stress") * 10) / 10,
      avgEnergy: Math.round(avg(list, "energy") * 10) / 10,
      delta: Math.round(m - overall),
    });
  }
  return stats.sort((a, b) => b.delta - a.delta);
}

export type InsightItem = {
  icon: string;
  text: string;
};

/** Personalized, plain-language insights from recent data. */
export function personalInsights(entries: Entry[]): InsightItem[] {
  const out: InsightItem[] = [];
  if (entries.length < 3) {
    return [
      {
        icon: "🌱",
        text: t("analysis.needMore"),
      },
    ];
  }

  const stress = avg(entries, "stress");
  const energy = avg(entries, "energy");

  // Round 18: the sentence is catalogue copy with its number as a placeholder.
  // The insight list is drawn by the Insights view, which already renders
  // catalogue values, so an insight is chrome rather than content — unlike the
  // education registry's articles, which own their prose in their own module.
  if (stress >= 7) {
    out.push({
      icon: "🔴",
      text: t("analysis.highStress", { stress: stress.toFixed(1) }),
    });
  } else if (stress <= 4) {
    out.push({
      icon: "🟢",
      text: t("analysis.lowStress", { stress: stress.toFixed(1) }),
    });
  }

  if (energy <= 4) {
    out.push({
      icon: "🔋",
      text: t("analysis.lowEnergy"),
    });
  }

  const last3 = entries.slice(0, 3);
  if (last3.length === 3 && last3.every((e) => e.mood === last3[0].mood)) {
    out.push({
      icon: "🔁",
      text: t("analysis.sameMood", { mood: moodByLevel(last3[0].mood).label }),
    });
  }

  const corr = tagCorrelations(entries);
  const best = corr[0];
  const worst = corr[corr.length - 1];
  if (best && best.delta >= 8) {
    out.push({
      icon: "⬆️",
      text: t("analysis.bestTag", { tag: best.tag, delta: best.delta }),
    });
  }
  if (worst && worst !== best && worst.delta <= -8) {
    out.push({
      icon: "⬇️",
      text: t("analysis.worstTag", { tag: worst.tag, delta: Math.abs(worst.delta) }),
    });
  }

  const stressDays = entries.filter((e) => e.stress >= 8).length;
  if (stressDays >= 3) {
    out.push({
      icon: "⚠️",
      text: t("analysis.stressDays", { days: stressDays }),
    });
  }

  if (out.length === 0) {
    out.push({
      icon: "🧭",
      text: t("analysis.balanced"),
    });
  }
  return out;
}
