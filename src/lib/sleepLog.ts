/**
 * The sleep log — when the night started, when it ended, and how it felt.
 *
 * WHY NOT THE `sleep` TRACKER
 * The tracker already asks for hours, and it is the right answer for "how long
 * did I sleep". It cannot answer the two questions a sleep log exists for:
 * WHEN the night was (a 03:00–10:00 night and a 22:00–05:00 night are the same
 * length and not the same night), and how it FELT independent of its length.
 * The hours stay in the tracker — this log does not duplicate them, it stores
 * the pair of clock times and a 1–5 quality, and derives the duration.
 *
 * THE NIGHT BELONGS TO THE DAY IT ENDED
 * A record is keyed by the wake-up day, the same day the journal entry uses,
 * because that is the day the reader is writing about. `durationMinutes`
 * therefore treats a wake time earlier than the bed time as a crossing of
 * midnight rather than an error, which is the only way a 23:30 → 07:10 night
 * can be one record.
 *
 * QUALITY IS SUBJECTIVE AND STAYS THAT WAY
 * No score is computed from it and nothing here calls a night "bad". The
 * correlation below reports a direction and a sample count, the same restraint
 * the rest of the analysis surfaces keep.
 */
import { moodByLevel } from "./mood";
import type { Entry } from "../types";

export type SleepQuality = 1 | 2 | 3 | 4 | 5;

export type SleepRecord = {
  /** The wake-up day, ISO — the journal entry's own key. */
  date: string;
  /** "HH:MM" 24-hour local time. */
  bedTime: string;
  /** "HH:MM" 24-hour local time; earlier than `bedTime` means past midnight. */
  wakeTime: string;
  quality: SleepQuality;
};

export const SLEEP_LOG_KEY = "belso-iranytu-sleep-log";

export const SLEEP_QUALITY_LABELS: Readonly<Record<SleepQuality, string>> = {
  1: "Nagyon rossz",
  2: "Rossz",
  3: "Megfelelő",
  4: "Jó",
  5: "Nagyon jó",
};

const listeners = new Set<(records: SleepRecord[]) => void>();

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTime(value: string): boolean {
  return TIME.test(value);
}

export function isValidQuality(value: number): value is SleepQuality {
  return Number.isInteger(value) && value >= 1 && value <= 5;
}

/** A day a record may name. Same shape the app's entries use. */
function isIsoDay(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  );
}

/** Minutes asleep between the two clock times; null when either is invalid. */
export function durationMinutes(record: Pick<SleepRecord, "bedTime" | "wakeTime">): number | null {
  if (!isValidTime(record.bedTime) || !isValidTime(record.wakeTime)) return null;
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const bed = toMin(record.bedTime);
  const wake = toMin(record.wakeTime);
  // Equal times are ambiguous (zero minutes, or a whole day); refuse rather
  // than pick the absurd one.
  if (bed === wake) return null;
  return wake > bed ? wake - bed : 24 * 60 - bed + wake;
}

/** "7 ó 10 p", or null when the pair is not a night. */
export function describeDuration(record: Pick<SleepRecord, "bedTime" | "wakeTime">): string | null {
  const minutes = durationMinutes(record);
  if (minutes === null) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} ó` : `${h} ó ${m} p`;
}

function normalise(input: unknown): SleepRecord | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Partial<SleepRecord>;
  if (!isIsoDay(value.date)) return null;
  if (typeof value.bedTime !== "string" || !isValidTime(value.bedTime)) return null;
  if (typeof value.wakeTime !== "string" || !isValidTime(value.wakeTime)) return null;
  if (typeof value.quality !== "number" || !isValidQuality(value.quality)) return null;
  return {
    date: value.date,
    bedTime: value.bedTime,
    wakeTime: value.wakeTime,
    quality: value.quality,
  };
}

function storage(): Storage | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const probe = "__belso_sleep_probe__";
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

/** Newest first, one record per day, repaired on read. */
export function loadSleepLog(): SleepRecord[] {
  const s = storage();
  if (!s) return [];
  try {
    const raw = s.getItem(SLEEP_LOG_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const byDate = new Map<string, SleepRecord>();
    for (const item of parsed) {
      const record = normalise(item);
      // A later duplicate wins: the reader's most recent answer about a night
      // is the one they meant.
      if (record) byDate.set(record.date, record);
    }
    return [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  } catch {
    return [];
  }
}

function save(records: SleepRecord[]): SleepRecord[] {
  const clean = [...records]
    .filter((r, i, all) => all.findIndex((x) => x.date === r.date) === i)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const s = storage();
  if (s) {
    try {
      s.setItem(SLEEP_LOG_KEY, JSON.stringify(clean));
    } catch {
      // Storage unavailable: the session still sees the new list.
    }
  }
  for (const fn of listeners) fn(clean);
  return clean;
}

/** Save (or replace) the record for one night. Invalid input changes nothing. */
export function saveSleepRecord(input: SleepRecord): SleepRecord[] {
  const record = normalise(input);
  if (!record) return loadSleepLog();
  const rest = loadSleepLog().filter((r) => r.date !== record.date);
  return save([record, ...rest]);
}

export function deleteSleepRecord(date: string): SleepRecord[] {
  return save(loadSleepLog().filter((r) => r.date !== date));
}

export function subscribeSleepLog(fn: (records: SleepRecord[]) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* ------------------------------ correlation ----------------------------- */

export type SleepMoodBand = {
  id: "poor" | "ok" | "good";
  label: string;
  /** Nights in this band that also have a mood. */
  count: number;
  /** Average mood score 0–100, or null below the sample floor. */
  avgMood: number | null;
};

export type SleepMoodCorrelation = {
  /** Days with both a sleep record and a mood. */
  n: number;
  /** Pearson r between quality (1–5) and mood score; null below the floor. */
  r: number | null;
  bands: SleepMoodBand[];
};

const MIN_SAMPLES = 3;

function mean(nums: number[]): number | null {
  return nums.length === 0 ? null : nums.reduce((s, n) => s + n, 0) / nums.length;
}

function pearson(xs: number[], ys: number[]): number | null {
  if (xs.length < MIN_SAMPLES || xs.length !== ys.length) return null;
  const mx = mean(xs)!;
  const my = mean(ys)!;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < xs.length; i += 1) {
    const a = xs[i]! - mx;
    const b = ys[i]! - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return null;
  return Math.round((num / Math.sqrt(dx * dy)) * 100) / 100;
}

/**
 * Sleep quality against the same day's mood.
 *
 * The three bands are shown even when the coefficient cannot be computed: a
 * reader with four nights learns more from "the four good nights averaged 70"
 * than from a refusal to say anything, and the coefficient's null is what
 * keeps the claim honest below the floor.
 */
export function sleepMoodCorrelation(
  records: readonly SleepRecord[],
  entries: readonly Entry[],
): SleepMoodCorrelation {
  const moodByDate = new Map(entries.map((e) => [e.date, moodByLevel(e.mood).score]));
  const pairs: { quality: number; mood: number }[] = [];
  for (const record of records) {
    const mood = moodByDate.get(record.date);
    if (typeof mood === "number") pairs.push({ quality: record.quality, mood });
  }

  const bandOf = (quality: number): SleepMoodBand["id"] =>
    quality <= 2 ? "poor" : quality === 3 ? "ok" : "good";
  const LABELS: Record<SleepMoodBand["id"], string> = {
    poor: "Rossz éjszaka (1–2)",
    ok: "Megfelelő éjszaka (3)",
    good: "Jó éjszaka (4–5)",
  };

  const bands: SleepMoodBand[] = (["poor", "ok", "good"] as const).map((id) => {
    const sample = pairs.filter((p) => bandOf(p.quality) === id).map((p) => p.mood);
    const avg = mean(sample);
    return {
      id,
      label: LABELS[id],
      count: sample.length,
      avgMood: avg === null ? null : Math.round(avg),
    };
  });

  return {
    n: pairs.length,
    r: pearson(pairs.map((p) => p.quality), pairs.map((p) => p.mood)),
    bands,
  };
}

/** One sentence for the card, total over the result's shapes. */
export function describeSleepMood(result: SleepMoodCorrelation): string {
  if (result.n === 0) return "Még nincs olyan nap, amelyen alvásnapló és hangulat is lenne.";
  if (result.r === null) {
    return `${result.n} közös nap van. Három nap alatt nem érdemes irányt mondani — ez még kevés.`;
  }
  if (Math.abs(result.r) < 0.2) {
    return `${result.n} közös nap: egyelőre nem látszik összefüggés az alvásminőség és a hangulat között.`;
  }
  return result.r > 0
    ? `${result.n} közös nap: a jobb alvású napokon valamivel jobb a hangulat (r = ${result.r.toFixed(2)}). Ez együtt járás, nem bizonyíték arra, hogy az alvás okozza.`
    : `${result.n} közös nap: a jobb alvású napokon valamivel rosszabb a hangulat (r = ${result.r.toFixed(2)}). Ez együtt járás, nem bizonyíték arra, hogy az alvás okozza.`;
}

/** Wipe the log. Used by "Minden adat törlése" and the tests. */
export function resetSleepLog(): void {
  try {
    storage()?.removeItem(SLEEP_LOG_KEY);
  } catch {
    /* ignore */
  }
  for (const fn of listeners) fn([]);
}
