/**
 * Remembered first-use flags (Batch 13, commit 9).
 *
 * WHY THIS STORE EXISTS AT ALL
 * The other badge counts are DERIVED: gratitude notes are countable because
 * `lib/gratitude` holds them, and the feature-use sidecar asks each store how
 * many it has. Three features cannot be counted that way, because what they do
 * leaves nothing behind:
 *
 *   - a health import writes tracker values onto an entry, and `entry.source`
 *     is `"import"` for THREE different things: this, a CSV import, and the
 *     v1 migration. Counting that field would award the badge to anyone who
 *     ever imported a spreadsheet.
 *   - a food-AI analysis writes tracker values too, indistinguishable from any
 *     other tracker entry.
 *   - a PDF export writes a file and nothing else.
 *
 * So these three are EVENTS, not records. The only honest way to know one
 * happened is to be told when it happens, which is what this store is. It is
 * deliberately a set of flags and not a set of counters: the badges that read
 * it all ask "at least once", and a counter would imply a precision nobody has.
 *
 * WHAT THIS IS NOT
 * It is not a usage log and must not become one. There is no timestamp, no
 * history and no per-use increment — writing one would start collecting a
 * record of what a person did and when, which is the opposite of what this
 * app is for. A reader who wants the record erased deletes the entries; this
 * key holds only the fact that a feature was reached once, and "delete
 * everything" removes it along with the rest.
 */
/**
 * The features that leave no residue. A closed list, for the same reason
 * `FeatureKey` is closed: the flags are written by name from three different
 * components, and a name that is not in this union is a typo rather than a
 * silently ignored write.
 */
export type EventFeatureKey = "healthImport" | "foodAi" | "pdfExport";

export const EVENT_FEATURE_KEYS: readonly EventFeatureKey[] = [
  "healthImport",
  "foodAi",
  "pdfExport",
] as const;

const KEY = "belso-iranytu-feature-flags-v1";

const listeners = new Set<() => void>();

function isEventKey(n: unknown): n is EventFeatureKey {
  return typeof n === "string" && (EVENT_FEATURE_KEYS as readonly string[]).includes(n);
}

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

/** The features reached at least once. Unknown names in storage are dropped. */
export function seenEventFeatures(): Set<EventFeatureKey> {
  const s = storage();
  if (!s) return new Set();
  try {
    const raw = s.getItem(KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter(isEventKey));
  } catch {
    // Corrupt JSON must not take the shelf down; it reads as "none yet".
    return new Set();
  }
}

/**
 * The same subscribe pattern as `lib/gratitude`, `lib/cbt` and
 * `lib/experiments`, and for the same reason: the person who just pressed
 * Export on the Insights screen should see the badge appear without a reload.
 * Polling would have been the alternative and would have been worse — an
 * interval running for the life of the app to notice three writes in total.
 */
export function subscribeEventFeatures(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Record that a feature was reached. Idempotent: setting a flag twice is the
 * same as once, so a reader who exports a PDF every week does not accumulate
 * anything.
 */
export function markEventFeature(key: EventFeatureKey): void {
  if (!isEventKey(key)) return;
  const seen = seenEventFeatures();
  if (seen.has(key)) return;
  seen.add(key);
  const s = storage();
  if (!s) return;
  try {
    s.setItem(KEY, JSON.stringify([...seen]));
  } catch {
    // Storage full or unavailable. The badge simply will not appear, which is
    // a far better failure than an exception on the export button.
    return;
  }
  for (const fn of listeners) fn();
}

/** Forgets every flag. Used by the tests and by "delete everything". */
export function resetEventFeatures(): void {
  try {
    storage()?.removeItem(KEY);
  } catch {
    /* ignore */
  }
  for (const fn of listeners) fn();
}

/**
 * The flags as the 0/1 counts the sidecar wants. This is the only place the
 * two modules meet, so the badge side never has to know that flags exist.
 */
export function eventFeatureCounts(): { healthImport: number; foodAi: number; pdfExport: number } {
  const seen = seenEventFeatures();
  return {
    healthImport: seen.has("healthImport") ? 1 : 0,
    foodAi: seen.has("foodAi") ? 1 : 0,
    pdfExport: seen.has("pdfExport") ? 1 : 0,
  };
}

export const EVENT_FLAGS_KEY = KEY;