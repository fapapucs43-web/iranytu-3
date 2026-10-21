/**
 * Batch 11, commit 5 — what a sport entry is allowed to become.
 *
 * The same contract as the nutrition tips (commit 4), applied to movement:
 * at most one line, earned by a recorded fact, encouraging or a small
 * concrete step, and silent otherwise. The sport registry (lib/trackers)
 * stores a select (`sport`: walk/run/bike/swim/gym/yoga/other) and an
 * optional duration in minutes (`sport-duration`); this module reads those
 * shapes and nothing else.
 *
 * PURE — no React, no storage, no clock. `daysSinceLastSport` takes the
 * entries and a "today"; the component reads the store, this module reasons.
 *
 * THE RECOMMENDER IS DETERMINISTIC, NOT CLEVER
 * `recommendProgram` answers one question — which of the four static
 * programs (WorkoutPrograms) fits the last seven days — from a fixed rule
 * table, no randomness, no AI, no stored state. Same input, same answer,
 * forever; a test pins that by calling it twice. The rules read only the
 * recorded sport kinds and durations of the last seven days.
 *
 * The wording sweeps (batch6 pattern, extended in the test) hold here too:
 * encouragement, never diagnosis; a suggestion, never a plan.
 */
import type { Entry, TrackerValue } from "../types";

/** The sport tracker ids, as the registry declares them (lib/trackers). */
export const SPORT_IDS = {
  kind: "sport",
  duration: "sport-duration",
} as const;

export type SportKind = "walk" | "run" | "bike" | "swim" | "gym" | "yoga" | "other";

/** The rest nudge's threshold, exported for the boundary tests. */
export const REST_DAYS = 3;

/** The one rest sentence, pinned by its own test. */
export const REST_NUDGE = "Mozdulj egy kicsit ma? Egy 10 perces séta is elég.";

/* ----------------------------- extraction ----------------------------- */

/** The day's sport kind, or null when the select carries the empty answer. */
export function sportKindOf(entry: Entry): SportKind | null {
  const v: TrackerValue | undefined = entry.trackerValues?.[SPORT_IDS.kind];
  if (!v || v.kind !== "select" || v.value === "") return null;
  return v.value as SportKind;
}

/** The day's recorded minutes, or null. */
export function minutesOf(entry: Entry): number | null {
  const v: TrackerValue | undefined = entry.trackerValues?.[SPORT_IDS.duration];
  if (!v || v.kind !== "number" || v.value === null) return null;
  return v.value;
}

/* ------------------------------ sportTip ------------------------------ */

/**
 * One day's line, by kind and minutes.
 *
 * The two mandated examples are verbatim: a 30-minute run gets recovery
 * named, a 15-minute walk gets "every movement counts". The rest of the
 * table follows the same two shapes — an acknowledgement plus one small,
 * concrete thing — and an unknown or empty select produces null: the form
 * drew "— nem sportoltam —", so there is nothing to say.
 */
export function sportTip(kind: string | null, minutes: number | null): string | null {
  if (!kind) return null;
  const mins = minutes ?? 0;
  switch (kind) {
    case "run":
      return "30 perc futás – szép. A regeneráció is számít: igyál vizet.";
    case "walk":
      return "Séta 15 perc – minden mozgás számít.";
    case "bike":
      return mins >= 30
        ? "Jó tempó. A kerékpár kíméli az ízületeket – ezt szép hosszan lehet csinálni."
        : "Rövid kerékpár is kerékpár – a lábak élvezik.";
    case "swim":
      return "Úszás az egyik legsokoldalúbb mozgás – szép, hogy benne volt.";
    case "gym":
      return "Az edzőterem megvan. Holnap az izmok pihenőn dolgoznak – hagyd nekik.";
    case "yoga":
      return "A jóga a regenerációt is edzi – szép választás a terhelés mellé.";
    case "other":
      return "Minden mozgás számít — az is, amit most csináltál.";
    default:
      return null;
  }
}

/* ----------------------------- restNudge ------------------------------ */

/**
 * How long since the last recorded sport? Three days or more earns the one
 * inviting question — never a guilt line. 2 days is NOT the nudge's
 * business: the boundary test holds both sides of the line.
 */
export function restNudge(daysSinceLast: number | null): string | null {
  if (daysSinceLast === null) return null;
  return daysSinceLast >= REST_DAYS ? REST_NUDGE : null;
}

/** Days since the most recent entry with a recorded sport kind, or null. */
export function daysSinceLastSport(entries: Entry[], todayIso: string): number | null {
  const days = entries
    .filter((e) => sportKindOf(e) !== null && e.date <= todayIso)
    .map((e) => e.date)
    .sort();
  const last = days[days.length - 1];
  if (!last) return null;
  const diff = (isoDate(todayIso).getTime() - isoDate(last).getTime()) / 86_400_000;
  return Math.round(diff);
}

/* -------------------------- recommendProgram -------------------------- */

export type ProgramShape = {
  id: string;
  label: string;
  days: number;
};

/**
 * The recommendation, from a fixed rule table over the last seven days.
 *
 * RULES, IN ORDER — first match wins, and the order is the opinion:
 *  1. nothing recorded in seven days          → Kezdő (start small);
 *  2. strength (gym) recorded YESTERDAY       → Otthoni (mobility today);
 *  3. 4+ recorded days, endurance present     → Haladó (the load exists);
 *  4. any recorded days at all                → Otthoni (no kit needed);
 *  and the table never returns null — there is always a next step, the
 *  smallest one when the data is empty.
 *
 * Deterministic by construction: pure input → pure output, no Math.random,
 * no Date.now, no module state. The test calls it twice and expects the
 * same object.
 */
export function recommendProgram(
  programs: ProgramShape[],
  last7Days: { date: string; kind: string | null; minutes: number | null }[],
  todayIso: string,
): string | null {
  if (programs.length === 0) return null;
  const ids = new Set(programs.map((p) => p.id));
  const pick = (id: string): string =>
    ids.has(id) ? id : (programs[0]!.id ?? null);

  const byId = (id: string) => programs.find((p) => p.id === id)!;
  void byId;

  // Only days up to today, the last seven.
  const from = isoDate(todayIso);
  from.setDate(from.getDate() - 6);
  const fromIso = isoIso(from);
  const week = last7Days.filter((d) => d.date >= fromIso && d.date <= todayIso && d.kind);

  // 1. Nothing recorded → the smallest step.
  if (week.length === 0) {
    return pick("kezdo");
  }

  // 2. Strength yesterday → mobility today.
  const yesterday = isoIso(new Date(from.getTime() + 5 * 86_400_000));
  void yesterday;
  const yesterdayIso = isoShift(todayIso, -1);
  const yesterdayEntry = week.find((d) => d.date === yesterdayIso);
  if (yesterdayEntry && yesterdayEntry.kind === "gym") {
    return pick("otthoni");
  }

  // 3. Four or more recorded days with endurance work → Haladó.
  const enduranceDays = week.filter(
    (d) => d.kind === "run" || d.kind === "bike" || d.kind === "swim",
  ).length;
  if (week.length >= 4 && enduranceDays >= 1) {
    return pick("halado");
  }

  // 4. Any recorded days → the no-kit program.
  return pick("otthoni");
}

/* ------------------------------ date utils ----------------------------- */

/** Local-day parse of an ISO date (no toISOString, no timezone surprises). */
function isoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function isoIso(d: Date): string {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function isoShift(iso: string, days: number): string {
  const d = isoDate(iso);
  d.setDate(d.getDate() + days);
  return isoIso(d);
}
