/**
 * Batch 11, commit 4 — what a meal note is allowed to become.
 *
 * THE SHAPE OF THE RULES
 * The user records three nutrition facts a day: a 1–10 quality slider, five
 * flags (zöldség, fehérje, szénhidrát, édesség, gyorsétel), and an optional
 * calorie estimate. This module turns recorded facts into at most ONE line
 * of feedback — never a score, never a plan, never a judgement about the
 * person. Every sentence here is encouragement or a small, concrete next
 * step; the batch6 medical-vocabulary sweep is extended to this file, so a
 * clinical word cannot enter through a later edit without failing the suite.
 *
 * PURE — no React, no storage, no clock. `weeklySummary` takes whatever
 * entries the caller has and a "today" string; the component reads the store,
 * this module reasons. That keeps every rule reachable from a table-driven
 * test and keeps the wording in exactly one place.
 *
 * THE SAFETY RAIL, AND ITS EXACT LIMITS
 * A three-day average under 500 kcal or over 4000 kcal produces one fixed,
 * calm sentence — the wording the batch specified, character for character —
 * and nothing else. No escalation, no modal, no block: an inline muted note
 * that names a conversation, not a condition. The thresholds sit at the
 * round numbers the batch chose and are exported for the boundary tests;
 * they are screening rails, not diagnostic criteria, and the wording never
 * pretends otherwise.
 */
import type { Entry, TrackerValue } from "../types";
import { allergyHits, foodById, type AllergenId, type Totals } from "./nutrition";

/** The nutrition tracker ids, as the registry declares them (lib/trackers). */
export const NUTRITION_IDS = {
  quality: "nutrition",
  note: "nutrition-note",
  calories: "nutrition-calories",
  flags: "nutrition-flags",
} as const;

/** Flag ids in registry order. */
export type NutritionFlag = "veg" | "protein" | "carb" | "sweet" | "fast";

/** The safety rail's edges, exported for the boundary tests. */
export const SAFETY_MIN_KCAL = 500;
export const SAFETY_MAX_KCAL = 4000;
/** How many days with a calorie estimate the rail needs. */
export const SAFETY_DAYS = 3;

/** The safety sentence, character for character — pinned by its own test. */
export const SAFETY_NOTE =
  "Ha ez szándékos, rendben. Ha nem, érdemes szakemberrel beszélni.";

/** The one result a day can produce: a tip, the safety note, or nothing. */
export type MealTipResult =
  | { kind: "tip"; text: string }
  | { kind: "safety"; text: string };

/* ----------------------------- extraction ----------------------------- */

/** The day's flag record, or null when the flags field carries nothing. */
function flagsOf(entry: Entry): Record<string, boolean> | null {
  const v: TrackerValue | undefined = entry.trackerValues?.[NUTRITION_IDS.flags];
  if (!v || v.kind !== "flags") return null;
  const on = Object.values(v.value).filter(Boolean).length;
  return on > 0 ? v.value : null;
}

/** The day's calorie estimate, or null. */
export function kcalOf(entry: Entry): number | null {
  const v: TrackerValue | undefined = entry.trackerValues?.[NUTRITION_IDS.calories];
  if (!v || v.kind !== "number" || v.value === null) return null;
  return v.value;
}

/* ------------------------------ mealTip ------------------------------- */

/**
 * One day's feedback line.
 *
 * ORDER IS THE RULE: the balance combination first (the thing to repeat),
 * then the gentle fast-food nudge, then nothing. Recorded facts that match
 * no rule produce NO line — silence is the honest default, and a tip has to
 * earn its place. The safety rail is the WEEK's business (see
 * weeklySummary), not a single day's: one low-calorie day is a day.
 *
 * Returns `null` when there is nothing to say: no flags recorded, or flags
 * that match no rule. `kcal` is accepted for signature stability with the
 * spec — the per-day rules read shapes, not amounts.
 */
export function mealTip(
  flags: Record<string, boolean> | null,
  _kcal: number | null,
): MealTipResult | null {
  void _kcal;
  if (!flags) return null;
  if (flags.veg && flags.protein) {
    return { kind: "tip", text: "Szép egyensúly. A zöldség és a fehérje jó kombináció." };
  }
  if (flags.fast && !flags.veg && !flags.protein) {
    return { kind: "tip", text: "A gyorsétel néha belefér. Holnap próbálj egy zöldséges fogást is." };
  }
  return null;
}

/* --------------------------- weeklySummary ---------------------------- */

export type WeeklySummary = {
  /** Days with a calorie estimate, the rail's honest denominator. */
  days: number;
  /** Mean of the recorded calorie estimates, rounded. */
  avgKcal: number | null;
  /** Flag ids recorded on more than half the days, in registry order. */
  topFlags: NutritionFlag[];
  /** The one suggestion line, or null when nothing earned one. */
  suggestion: string | null;
  /** Present only when the three-day rail trips; then suggestion is null. */
  safety: boolean;
};

const FLAG_ORDER: NutritionFlag[] = ["veg", "protein", "carb", "sweet", "fast"];

/**
 * The week in one glance — null under three days with a calorie estimate,
 * because a two-day average is a noise impression, not a summary.
 *
 * The suggestion picks the single most useful true sentence: the majority
 * flag gets a named, factual compliment; protein is the one absence worth
 * naming, with two concrete foods. At most one suggestion — a list of advice
 * is a diet plan, and this module does not write those.
 */
export function weeklySummary(entries: Entry[], todayIso: string): WeeklySummary | null {
  const from = isoMonday(todayIso);
  const inWeek = entries.filter((e) => e.date >= from && e.date <= todayIso);

  const withKcal = inWeek.map(kcalOf).filter((k): k is number => k !== null);
  if (withKcal.length < SAFETY_DAYS) return null;

  const avgKcal = Math.round(withKcal.reduce((a, b) => a + b, 0) / withKcal.length);

  // The safety rail, first: when it trips, it is the WHOLE result — no tip,
  // no suggestion rides along with it.
  if (avgKcal < SAFETY_MIN_KCAL || avgKcal > SAFETY_MAX_KCAL) {
    return {
      days: withKcal.length,
      avgKcal,
      topFlags: [],
      suggestion: null,
      safety: true,
    };
  }

  const days = inWeek.length;
  const counts = new Map<NutritionFlag, number>();
  for (const e of inWeek) {
    const flags = flagsOf(e);
    if (!flags) continue;
    for (const id of FLAG_ORDER) if (flags[id]) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const topFlags = FLAG_ORDER.filter((id) => (counts.get(id) ?? 0) * 2 > days);

  // One suggestion, from one rule each: the majority flag is named with its
  // true count; otherwise a protein that appeared at all gets its one
  // nudge (two concrete foods, no numbers). Exactly the shapes the batch
  // specified — nothing more generalises into a diet plan.
  let suggestion: string | null = null;
  if (topFlags.includes("veg")) {
    const n = counts.get("veg") ?? 0;
    suggestion = `A héten ${n} napon volt zöldség – jó arány.`;
  } else if ((counts.get("protein") ?? 0) > 0) {
    suggestion = "A fehérje kevesebb volt – próbálj tojást vagy hüvelyeseket.";
  }

  return { days: withKcal.length, avgKcal, topFlags, suggestion, safety: false };
}

/* ------------------- Batch 15: an idea from what was eaten ---------------- */

/**
 * The protein sources an idea may name, in the order they are offered.
 *
 * These are FOOD IDS from `lib/nutrition`, and the choice is made against the
 * reader's own allergen list rather than in prose — which is the whole point of
 * putting this rule in the module that owns both halves. A suggestion that
 * named milk to someone who marked milk would be worse than no suggestion.
 */
const PROTEIN_SOURCES = ["lentil", "chicken", "egg", "greek-yoghurt", "tofu"] as const;

/** The two safe sources to name, or none when the reader marked all of them. */
function safeProteinNames(marked: readonly AllergenId[]): string[] {
  const out: string[] = [];
  for (const id of PROTEIN_SOURCES) {
    const food = foodById(id);
    if (!food) continue;
    if (allergyHits(food, marked).length > 0) continue;
    out.push(food.name.toLowerCase());
    if (out.length === 2) break;
  }
  return out;
}

/**
 * One idea from the day's own list — or nothing, which is the common case.
 *
 * This is the meal-LOG half of the module: `weeklySummary` reads the tracker's
 * estimates, this reads what the reader actually put on the list today. The
 * rules are deliberately three and none of them is a target: a day with little
 * protein gets a concrete, allergen-safe pair of foods; a day with three or
 * more items and real protein gets the one compliment it earned; anything else
 * gets silence. No calorie goal, no deficit, no "should" — the same register
 * the rest of this file keeps, and the reason it can sit next to a card that
 * prints totals without turning them into a verdict.
 */
export function mealIdea(
  totals: Totals,
  items: number,
  marked: readonly AllergenId[] = [],
): string | null {
  if (items === 0) return null;
  if (totals.protein < 20) {
    const safe = safeProteinNames(marked);
    if (safe.length < 2) return null;
    return `Fehérjéből ma kevesebb került a listára — a ${safe[0]} vagy a ${safe[1]} jó választás lehet.`;
  }
  if (items >= 3 && totals.protein >= 30) {
    return "Ma több étkezésből is került valami a listára — jó ritmus.";
  }
  return null;
}

/** Monday of the ISO week containing `iso` (local, no deps). */
function isoMonday(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  const shift = (date.getDay() + 6) % 7; // Mon = 0 … Sun = 6
  date.setDate(date.getDate() - shift);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
