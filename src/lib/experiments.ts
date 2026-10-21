/**
 * Self-experiments (Batch 13, commit 7).
 *
 * WHAT THIS IS FOR
 * The app shows correlations ("on days you walked, your mood was higher") and
 * badges that reward doing things. Neither helps anybody find out whether a
 * SPECIFIC change would help THEM, because a correlation observed after the
 * fact is not a thing you can try. This module is the smallest honest version
 * of that: the reader writes down one change they want to test, lives with it
 * for three days, rates each day, and gets an outcome they can accept or
 * reject.
 *
 * THE THREE-DAY GUARD IS THE FEATURE, NOT A LIMIT ON IT
 * `EXPERIMENT_DAYS` is the whole design. Long enough that the first day's mood
 * cannot decide the result, short enough that a reader who forgets what they
 * started can still remember. It is why there is no "extend" and no way to
 * rate day four: the window is computed from the start date and is not an
 * editable field, so an experiment cannot drift into an open-ended project
 * that is never concluded.
 *
 * WHY AT MOST ONE AT A TIME
 * A reader running four half-observed changes learns nothing from any of them,
 * and the app would be encouraging exactly the confounding it exists to
 * untangle. `EXPERIMENT_LIMIT` is 1 and `startExperiment` REFUSES rather than
 * warning: the rule lives in the store so no screen can forget it. The card
 * does not even render the start form while one is live.
 *
 * WHAT IS NOT STORED
 * No mood is copied in from the journal. The daily rating is the reader's own
 * number, entered here, and nothing joins it to their entries — an experiment
 * that silently read the journal would be measuring the journal, not the
 * change. The outcome is a yes/no the reader types, not something inferred.
 *
 * THE KEY IS ITS OWN. Same reason as `assessmentStore`: an experiment is a
 * hypothesis about a person, and it must not be readable by the analysis
 * engine, a badge rule, or a profile panel by accident.
 */
import { addDays, toISODate } from "./dates";

export type ExperimentCheck = {
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  /** The reader's own 1–10 rating for that day. */
  rating: number;
  /** Optional free note for the day. */
  note: string;
};

export type Experiment = {
  id: string;
  /** ISO date the experiment began — day 1. */
  startDate: string;
  /** ISO date three days after the start — the day it closes. */
  endDate: string;
  /** The change being tested, in the reader's words. */
  what: string;
  /** Why they think it will help. Optional; an experiment does not need a theory. */
  why: string;
  checks: ExperimentCheck[];
  /** Set exactly once, when the reader closes it. Null while it is live. */
  verdict: { worked: boolean; note: string } | null;
};

const KEY = "belso-iranytu-experiments-v1";

/** Three days. The window, the guard, and the reason there is no extend. */
export const EXPERIMENT_DAYS = 3;

/** One at a time. Named so the rule is stated in exactly one place. */
export const EXPERIMENT_LIMIT = 1;

const MAX_EXPERIMENTS = 40;
const MAX_WHAT = 120;
const MAX_WHY = 200;
const MAX_NOTE = 200;

/** The rating scale's ends, shared with the card so the labels cannot drift. */
export const RATING_MIN = 1;
export const RATING_MAX = 10;

let memory: Experiment[] = [];
const listeners = new Set<() => void>();

function storage(): Storage | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const probe = "__belso_probe__";
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

function clampRating(n: unknown): number {
  const num = typeof n === "number" ? n : Number(n);
  if (Number.isNaN(num)) return RATING_MIN;
  return Math.min(RATING_MAX, Math.max(RATING_MIN, Math.round(num)));
}

function text(n: unknown, max: number): string {
  return typeof n === "string" ? n.slice(0, max) : "";
}

/** Reject anything that is not a well-formed record rather than coerce it. */
export function sanitizeExperiment(raw: unknown): Experiment | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !r.id) return null;
  if (typeof r.startDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r.startDate)) return null;
  if (typeof r.endDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r.endDate)) return null;
  const what = text(r.what, MAX_WHAT).trim();
  if (!what) return null;
  const rawChecks = Array.isArray(r.checks) ? r.checks : [];
  const checks: ExperimentCheck[] = [];
  for (const c of rawChecks) {
    if (!c || typeof c !== "object") continue;
    const check = c as Record<string, unknown>;
    if (typeof check.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(check.date)) continue;
    checks.push({
      date: check.date,
      rating: clampRating(check.rating),
      note: text(check.note, MAX_NOTE),
    });
  }
  const v = r.verdict as Record<string, unknown> | null | undefined;
  const verdict =
    v && typeof v === "object" && typeof v.worked === "boolean"
      ? { worked: v.worked, note: text(v.note, MAX_NOTE) }
      : null;
  return { id: r.id, startDate: r.startDate, endDate: r.endDate, what, why: text(r.why, MAX_WHY), checks, verdict };
}

function load(): Experiment[] {
  const s = storage();
  if (!s) return memory;
  try {
    const raw = s.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(sanitizeExperiment)
      .filter((x): x is Experiment => x !== null)
      .slice(0, MAX_EXPERIMENTS);
  } catch {
    return [];
  }
}

function write(items: Experiment[]): void {
  memory = items;
  const s = storage();
  if (!s) return;
  try {
    s.setItem(KEY, JSON.stringify(items));
  } catch {
    // Storage full or unavailable; the UI keeps working from memory.
  }
  for (const fn of listeners) fn();
}

export function subscribeExperiments(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Every experiment, newest first. */
export function getExperiments(): Experiment[] {
  return load().sort((a, b) => (a.startDate < b.startDate ? 1 : a.startDate > b.startDate ? -1 : 0));
}

/** True on `startDate` and `endDate` inclusive — three days, not four. */
export function isLive(exp: Experiment, iso: string): boolean {
  return exp.verdict === null && iso >= exp.startDate && iso <= exp.endDate;
}

/** The live experiment, or null. At most one can be live; see startExperiment. */
export function activeExperiment(iso: string): Experiment | null {
  return getExperiments().find((e) => isLive(e, iso)) ?? null;
}

/** Day 1..3 on `iso`, or null when the experiment is not live that day. */
export function dayNumber(exp: Experiment, iso: string): number | null {
  if (!isLive(exp, iso)) return null;
  const a = Date.parse(`${exp.startDate}T00:00:00`);
  const b = Date.parse(`${iso}T00:00:00`);
  return Math.round((b - a) / 86_400_000) + 1;
}

/** The rating already entered for a day, or null. */
export function checkOn(exp: Experiment, iso: string): ExperimentCheck | null {
  return exp.checks.find((c) => c.date === iso) ?? null;
}

/**
 * Whether today can still be rated: live, and not already rated today.
 *
 * NOTE ON FRESHNESS. Every write replaces the stored array; nothing mutates a
 * record in place. So `canRate`, `dayNumber` and `checkOn` answer about the
 * record they are HANDED, and a snapshot taken before a write will answer
 * about that older state. Callers should pass a record read from
 * `getExperiments` — which is what `subscribeExperiments` is for.
 */
export function canRate(exp: Experiment, iso: string): boolean {
  return dayNumber(exp, iso) !== null && checkOn(exp, iso) === null;
}

/**
 * Begin an experiment. `endDate` is COMPUTED, never accepted — that is the
 * three-day guard, and it is why there is no parameter a caller could widen.
 *
 * Returns null, with no write, when one is already live or the text is empty.
 * `EXPERIMENT_LIMIT` is 1, so the live count is the whole rule; the constant is
 * still checked rather than hard-coded so raising the limit later is a change
 * in one place.
 */
export function startExperiment(input: {
  what: string;
  why?: string;
  date?: string;
}): Experiment | null {
  const what = text(input.what, MAX_WHAT).trim();
  if (!what) return null;
  const startDate = input.date ?? toISODate();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return null;
  if (activeExperiment(startDate) !== null) return null;
  if (load().filter((e) => isLive(e, startDate)).length >= EXPERIMENT_LIMIT) return null;
  const exp: Experiment = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `x-${startDate}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    startDate,
    // INCLUSIVE on both ends, which is where the off-by-one lives:
    // `addDays(start, 3)` is the FOURTH day (start, +1, +2, +3), so a
    // three-day window is start + EXPERIMENT_DAYS - 1. Writing it as the
    // subtraction it is means the two cannot disagree — an experiment cannot
    // be four days long while claiming to be three.
    endDate: addDays(startDate, EXPERIMENT_DAYS - 1),
    what,
    why: text(input.why, MAX_WHY).trim(),
    checks: [],
    verdict: null,
  };
  write([exp, ...load()]);
  return exp;
}

/**
 * Record one day's rating. One per day, only while live, only for a date
 * inside the three-day window — a check outside it would be an observation the
 * experiment cannot be said to have produced, so it is refused rather than
 * stored and quietly ignored later.
 */
export function rateExperiment(id: string, iso: string, rating: number, note = ""): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const exp = load().find((e) => e.id === id);
  if (!exp) return false;
  if (!canRate(exp, iso)) return false;
  const updated: Experiment = {
    ...exp,
    checks: [...exp.checks, { date: iso, rating: clampRating(rating), note: text(note, MAX_NOTE) }],
  };
  write(load().map((e) => (e.id === id ? updated : e)));
  return true;
}

/** Close it with a verdict. The only way `verdict` is ever set. */
export function finishExperiment(id: string, worked: boolean, note = ""): boolean {
  const exp = load().find((e) => e.id === id);
  if (!exp || exp.verdict !== null) return false;
  write(
    load().map((e) =>
      e.id === id ? { ...e, verdict: { worked, note: text(note, MAX_NOTE) } } : e,
    ),
  );
  return true;
}

/** Abandon without an answer. Distinct from finishing: the reader did not learn. */
export function abandonExperiment(id: string): boolean {
  const exp = load().find((e) => e.id === id);
  if (!exp || exp.verdict !== null) return false;
  write(load().filter((e) => e.id !== id));
  return true;
}

export function deleteExperiment(id: string): boolean {
  const before = load().length;
  write(load().filter((e) => e.id !== id));
  return load().length < before;
}

/** Average of the days actually rated, or null when none are. */
export function averageRating(exp: Experiment): number | null {
  if (exp.checks.length === 0) return null;
  const sum = exp.checks.reduce((n, c) => n + c.rating, 0);
  return Math.round((sum / exp.checks.length) * 10) / 10;
}

/** Test seam, and what the app's own "delete everything" does for this key. */
export function resetExperiments(): void {
  memory = [];
  const s = storage();
  try {
    s?.removeItem(KEY);
  } catch {
    /* ignore */
  }
  for (const fn of listeners) fn();
}

export const STORAGE_KEY = KEY;