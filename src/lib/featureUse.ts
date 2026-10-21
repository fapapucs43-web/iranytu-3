/**
 * The feature-use sidecar (Batch 13, commit 8).
 *
 * WHY THIS EXISTS
 * The badge rules read a different store for every feature they are about, and
 * until this commit `AchievementInput` carried one bespoke field per feature —
 * `gratitudeCount`, `cbtCount`. That shape does not scale: the next feature
 * meant another field, another argument at five call sites, and another thing
 * to forget when a store was reset. It is the same mistake the app already
 * made once with the settings blob, and the same answer works here.
 *
 * So the counts come in as raw numbers and go out as ONE uniform map, keyed by
 * a closed union. A badge rule asks for `use.gratitude` and cannot ask for a
 * feature nobody defined, because there is no other key to spell. Commit 9
 * adds three features by adding three members to `FeatureKey` and three lines
 * to `buildFeatureUse` — nothing in the badge engine changes.
 *
 * WHY IT IS DERIVED AND NOT STORED
 * Nothing here is persisted. Every number already lives in the store that owns
 * it — gratitude counts live in `lib/gratitude`, experiments in
 * `lib/experiments` — and a second copy would be a second thing to go stale
 * and a second thing for "delete everything" to have to reach. A sidecar that
 * writes nothing cannot disagree with what it summarises.
 *
 * WHY IT IS TOTAL
 * `buildFeatureUse` fills every key, defaulting to 0, so `use.gratitude` is a
 * number and never `undefined`. That is the whole contract: a badge rule that
 * had to guard against a missing key would be a badge rule that can silently
 * stop firing, and a badge that stops firing is invisible.
 */
import type { Entry } from "../types";

/**
 * Every feature a badge can be about. Closed on purpose — the point is that
 * adding a feature is a deliberate act in exactly two places, not a new field
 * that appears on an input type and gets forgotten at four call sites.
 */
export type FeatureKey =
  | "gratitude"
  | "cbt"
  | "reflection"
  | "experiment"
  | "experimentClosed"
  | "healthImport"
  | "foodAi"
  | "pdfExport";

/** Every key, zero-filled. `Readonly` because a rule must not patch it. */
export type FeatureUse = Readonly<Record<FeatureKey, number>>;

/**
 * The features in their declaration order — used to zero-fill.
 *
 * The last three arrived in commit 9 and are NOT derived the way the rest are:
 * a health import, a food-AI analysis and a PDF export leave nothing behind
 * that identifies them. `entry.source` is `"import"` for a CSV and a legacy
 * migration too, and an export writes a file. Their counts come from
 * `lib/featureFlags`, which is told when the event happens; the badge side
 * still only ever reads a number, so the two modules meet in exactly one place.
 */
export const FEATURE_KEYS: readonly FeatureKey[] = [
  "gratitude",
  "cbt",
  "reflection",
  "experiment",
  "experimentClosed",
  "healthImport",
  "foodAi",
  "pdfExport",
] as const;

/** The raw counts, all optional: a store that is empty passes `0` or nothing. */
export type FeatureUseInput = Partial<Record<FeatureKey, number>>;

/**
 * A count that is safe to compare with `>=`. Anything that is not a finite
 * non-negative number becomes 0, because a badge rule that received `NaN`
 * would evaluate `NaN >= 5` to false and the badge would simply never appear —
 * the quietest possible failure.
 */
function count(n: unknown): number {
  const num = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.floor(num);
}

/** Zero-fill every key, then apply whatever the caller actually knows. */
export function buildFeatureUse(raw: FeatureUseInput | null | undefined): FeatureUse {
  const out = {} as Record<FeatureKey, number>;
  for (const key of FEATURE_KEYS) out[key] = 0;
  if (!raw || typeof raw !== "object") return out;
  for (const key of FEATURE_KEYS) {
    const value = (raw as Record<string, unknown>)[key];
    if (value !== undefined) out[key] = count(value);
  }
  return out;
}

/** The all-zero sidecar. A caller with nothing to report passes this. */
export const NO_FEATURE_USE: FeatureUse = buildFeatureUse({});

/* --------------------- what the reader has actually done -------------------- */

/** Distinct mood levels recorded across every entry. */
export function moodLevelsUsed(entries: Entry[]): number {
  const levels = new Set<number>();
  for (const e of entries) {
    const m = Number(e.mood);
    if (Number.isFinite(m)) levels.add(m);
  }
  return levels.size;
}

/** How many attachments of one kind exist across every entry. */
export function attachmentCount(entries: Entry[], kind: "photo" | "video"): number {
  let n = 0;
  for (const e of entries) {
    for (const a of e.attachments ?? []) if (a.kind === kind) n += 1;
  }
  return n;
}