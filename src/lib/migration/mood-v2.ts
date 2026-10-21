/**
 * Batch A — Recording 2.0: the mood-level → coordinates migration.
 *
 * The app gains a 4-quadrant mood recorder (Mood Meter → emotion → context).
 * Every entry recorded before it has only the old 1–5 `mood` level, so the
 * Insights surfaces that now colour by quadrant would silently skip every
 * historical entry. This module lifts each old entry onto the new grid —
 * ONE TIME, on app start, and defensively: any error is logged and the
 * stored data is left untouched rather than half-rewritten.
 *
 * WHY DERIVE INSTEAD OF CONVERTING
 * The old level is kept on the entry. `mood` remains the fallback recorder's
 * field and a readable piece of history; the coordinates are ADDED beside it,
 * so a user who switches back to the old recorder loses nothing, and an
 * export still shows the level the user actually picked in the old UI.
 *
 * WHY NO MIGRATION FLAG
 * A `belso-iranytu-mood-v2-done` flag is one more thing that can disagree
 * with the data. Instead the migration is IDEMPOTENT: an entry that already
 * carries both coordinates is skipped, so "nothing left to migrate" is the
 * natural end state and a second boot is a no-op by construction. The flag
 * could drift; the data cannot.
 *
 * WHAT COUNTS AS ALREADY MIGRATED
 * BOTH coordinates present. One coordinate alone is a corrupt write from a
 * build that crashed mid-save — the migration refuses to guess the missing
 * half and leaves the row exactly as it is, because a half-filled coordinate
 * pair is worse data than none.
 */
import type { Entry, MoodLevel, MoodQuadrant } from "../../types";

/**
 * The level → coordinate table, exactly as the batch pinned it.
 * X = pleasantness, Y = energy, both 1–10; the point (5,5) is the centre of
 * the meter, which is also why level 3 ("semleges") maps there.
 *
 * NOTE ON NAMES: the meter's Y axis is stored as `moodEnergy` because `Entry`
 * has had a required `energy` (the daily-energy slider) since v2. The spec's
 * "energy" semantics live here under the non-colliding name.
 */
export const MOOD_LEVEL_COORDINATES: Record<
  MoodLevel,
  { moodEnergy: number; pleasantness: number }
> = {
  1: { moodEnergy: 3, pleasantness: 1 },
  2: { moodEnergy: 4, pleasantness: 3 },
  3: { moodEnergy: 5, pleasantness: 5 },
  4: { moodEnergy: 6, pleasantness: 7 },
  5: { moodEnergy: 8, pleasantness: 9 },
};

/** The four quadrants, in meter reading order (top row first). */
export const QUADRANTS: readonly MoodQuadrant[] = [
  "high-neg",
  "high-pos",
  "low-neg",
  "low-pos",
];

/** Type guard for values read back from storage (imports, hand-edited JSON). */
export function isQuadrant(value: unknown): value is MoodQuadrant {
  return (
    typeof value === "string" &&
    (QUADRANTS as readonly string[]).includes(value)
  );
}

/**
 * Which quadrant a point on the meter falls into.
 *
 * The boundaries are INCLUSIVE on the high side of both axes (`>= 5`): the
 * centre point (5,5) itself is high-pos, matching the table above, where
 * level 3 maps to exactly (5,5) and a neutral day must not be filed as
 * negative. Everything below 5 on either axis is the low half.
 */
export function quadrantFromCoords(energy: number, pleasantness: number): MoodQuadrant {
  if (energy >= 5 && pleasantness < 5) return "high-neg";
  if (energy >= 5 && pleasantness >= 5) return "high-pos";
  if (energy < 5 && pleasantness < 5) return "low-neg";
  return "low-pos";
}

/**
 * Coordinates for a legacy 5-level mood, or `null` when the value is not a
 * level at all (a corrupt row is skipped, not guessed).
 */
export function coordinatesForMoodLevel(
  level: unknown,
): { moodEnergy: number; pleasantness: number } | null {
  if (level !== 1 && level !== 2 && level !== 3 && level !== 4 && level !== 5) {
    return null;
  }
  return MOOD_LEVEL_COORDINATES[level];
}

/**
 * Does this entry already carry a complete coordinate pair?
 * One half alone does NOT count — see the module header.
 */
function hasCoordinates(entry: Entry): boolean {
  return typeof entry.moodEnergy === "number" && typeof entry.pleasantness === "number";
}

/**
 * The pure half of the migration: old entries in, coordinates added, nothing
 * else touched. Returns the SAME array when there is nothing to do, and never
 * throws — a malformed row (null, a string, a level that is not 1–5) is
 * skipped in place, because one bad row must not cost the user the other
 * rows' migration.
 */
export function migrateMoodData(entries: Entry[]): { entries: Entry[]; changed: number } {
  if (!Array.isArray(entries)) return { entries, changed: 0 };
  let changed = 0;
  const next = entries.map((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return entry;
    if (hasCoordinates(entry)) return entry;
    const coords = coordinatesForMoodLevel(entry.mood);
    if (!coords) return entry;
    changed += 1;
    return {
      ...entry,
      moodEnergy: coords.moodEnergy,
      pleasantness: coords.pleasantness,
      quadrant: quadrantFromCoords(coords.moodEnergy, coords.pleasantness),
    };
  });
  return { entries: changed > 0 ? next : entries, changed };
}

/**
 * The runner the store calls once on app start. Defensive by contract:
 * whatever `migrateMoodData` or the `write` callback throws is logged and
 * swallowed — the app boots on the unmigrated data rather than not at all.
 * `write` is invoked at most once, only when at least one entry changed.
 */
export function runMoodV2Migration(
  entries: Entry[],
  write: (entries: Entry[]) => void,
): void {
  try {
    const { entries: next, changed } = migrateMoodData(entries);
    if (changed > 0) write(next);
  } catch (error) {
    console.warn("[mood-v2] mood migration skipped — data untouched:", error);
  }
}
