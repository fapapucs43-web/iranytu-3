/**
 * The registry of every storage key this app writes, and the wipe that is
 * derived from it.
 *
 * WHY A LIST RATHER THAN MORE CALLS
 * "Minden adat törlése" had grown one call per batch — the PIN, the fired
 * reminders, the read articles, the seen lessons, the weekly answers, the
 * wallpaper, and then, in Phase 5, the seven modules whose exported reset the
 * chain had never called — while the keys nobody owned a reset for were simply
 * never named. Phase 5's audit counted eighteen of those and wrote them down
 * instead of fixing them, which is the honest thing to do with a list and the
 * wrong thing to leave as the mechanism. The wipe reads `WIPE_KEYS` now, so a
 * key with no owner is still removed and a key added tomorrow cannot be
 * forgotten silently.
 *
 * THREE LISTS, AND THE FIRST ONE IS THE WIPE
 * `WIPE_KEYS` is every `belso-iranytu*` key the app writes to `localStorage`
 * or `sessionStorage`: the store and its v1 leftovers, the food, training and
 * diet records, the habits, gratitude, CBT and tracker records, the assessment
 * log, the emotion vocabulary, onboarding, the feature flags, the seen badges
 * and lessons, the reminder wording and its last fire time, the weather caches,
 * the install-banner flag, the locale mirror, the OpenAI key, the PIN and its
 * unlock session, the card layout, and what this device knows about its own
 * backup. `NON_STORAGE_NAMES` is the names that LOOK like a key and are not:
 * the backup bundle's own app marker, the backup file's name prefix and its
 * IndexedDB database name, and the two download filenames. Both are checked
 * against the tree by `tests/lib/storage-keys.test.ts`, which reads every
 * `belso-iranytu*` literal in `src/` and requires it to be in exactly one of
 * the two — so the registry cannot drift from the code that writes the keys.
 * `RESET_FUNCTIONS` is the third list and the memory half of the same wipe: the
 * modules that read their blob into memory at import. Its own docblock argues
 * what belongs in it and what is deliberately not there.
 *
 * WHAT "DELETE EVERYTHING" MEANS HERE
 * Everything in `WIPE_KEYS`, including two the older chain deliberately kept:
 * the locale mirror and the OpenAI key. The locale is a preference and the key
 * is a secret the reader pasted, and the promise on the button is about their
 * data. Keeping a pasted secret after "delete everything" is the more
 * surprising of the two behaviours, and a wipe that leaves the interface in a
 * language the reader no longer chose is the other, so both go.
 *
 * THE MEMORY HALF, WHICH NO KEY CAN REACH
 * Removing a key empties the next load, not the running session: a module that
 * read its blob at import keeps serving what it holds until the page is
 * reloaded. Phase 6 left that as a stated limit and it became a defect the
 * moment a reader deleted everything and stayed in the app, so the wipe now
 * runs `RESET_FUNCTIONS` before it removes a single key — the five modules that
 * had no production reset of their own. The records the chain already resets
 * (the main store, the food, workout and diet logs, the collapse map, the
 * questionnaire log) stay the chain's; repeating them here would be a second
 * owner for the same decision, which is the thing every registry in this
 * codebase exists to avoid.
 */

import { resetCbtRecords } from "./cbt";
import { resetCustomActivities } from "./customActivities";
import { resetCustomTrackers } from "./customTrackers";
import { resetGratitude } from "./gratitude";
import { resetHabits } from "./habits";
import { resetCardStates } from "./cardStates";
import { clearAssessments } from "./assessmentStore";
import { resetSeenBadges } from "./achievements";
import { resetSeenLessons } from "./micro-lessons";
import { resetReminderMessage } from "./notifications";
import { resetWeeklyAnswers, resetWeeklySkips } from "./weeklyReflection";
import { resetCompanion } from "./companion";

/** Every app key begins with this, which is also the bundle's app marker. */
export const APP_KEY_PREFIX = "belso-iranytu";

/**
 * Every `belso-iranytu*` key the wipe removes, grouped by what it holds. The
 * order is for a reader, not for the code: `wipeAppStorage` removes whichever
 * of them exist and does not care what order they are in.
 */
export const WIPE_KEYS = [
  // The journal store, plus the v1 keys migration reads and must not resurrect.
  "belso-iranytu-data-v2",
  "belso-iranytu-data",
  "belso-iranytu-profile",
  // The records this app's own phases added.
  "belso-iranytu-nutrition-log-v1",
  "belso-iranytu-custom-foods-v1",
  "belso-iranytu-fitness-v1",
  "belso-iranytu-diet-v1",
  "belso-iranytu-habits-v1",
  "belso-iranytu-gratitude",
  "belso-iranytu-cbt-records",
  "belso-iranytu-custom-trackers",
  "belso-iranytu-custom-activities",
  "belso-iranytu-attachments",
  "belso-iranytu-emotion-vocab",
  "belso-iranytu-assessments-v1",
  "belso-iranytu-experiments-v1",
  "belso-iranytu-feature-flags-v1",
  "belso-iranytu-achievements-seen",
  "belso-iranytu-seen-lessons",
  "belso-iranytu-education-read",
  "belso-iranytu-weekly-skip",
  "belso-iranytu-weekly-answers",
  "belso-iranytu-onboarding",
  "belso-iranytu-companion",
  // Device state: what this device has shown, chosen or been told not to show.
  "belso-iranytu:cardStates",
  "belso-iranytu-background",
  "belso-iranytu-reminder-message",
  "belso-iranytu-reminder-last",
  "belso-iranytu-med-reminders-fired",
  "belso-iranytu-install-banner-dismissed",
  // The manual update's marker — `src/lib/pwa.ts`. A flag about the load that
  // is starting rather than a preference, and the one key here written a moment
  // before a reload: `forceAppUpdate` sets it so the next document knows its
  // caches were already dropped. It belongs in the wipe for the reason the
  // registry exists — a written key nothing removes is exactly what the reader
  // presses "delete everything" about — and `consumeUpdateRequest` says so at
  // the writer, which is why leaving it out would have been a contradiction
  // rather than an omission.
  "belso-iranytu-update-requested",
  // And the reset marker's current name — `src/lib/pwa.ts`. Both are here on
  // purpose: the old one was written by the button before the reset grew its
  // query-string navigation, so an install that pressed THAT button still has it
  // set, and `consumeForceReset` reads both. A key nobody reads is a key nobody
  // removes, which is the whole reason this list exists.
  "belso-iranytu-force-reset",
  "belso-iranytu-locale",
  "belso-iranytu-backup-state",
  // Secrets and locks.
  "belso-iranytu:openai-key",
  "belso-iranytu-app-lock",
  "belso-iranytu-app-lock-session",
  // Caches.
  "belso-iranytu/weather-cache/v1",
  "belso-iranytu/weather-places/v1",
] as const;

/**
 * The memory half of the wipe: every module that owns a stored record.
 *
 * WHY EVERY MODULE HERE
 * Earlier this list held only the five modules whose records were read into a
 * module-level variable at import — habits, gratitude, CBT, custom trackers and
 * custom activities — because those were the only ones whose in-memory copy
 * survived a key wipe. That left the running session showing the habits, notes,
 * labels, card states and assessment log the reader had just deleted, until they
 * reloaded. The wipe now calls every module's own production reset, which
 * clears the in-memory copy, removes the key and notifies subscribers — so the
 * session shows exactly what the next load would read, with no reload needed.
 *
 * THE ORDER
 * The order mirrors `WIPE_KEYS`: habits, gratitude, CBT, trackers, activities,
 * card states, assessments, seen badges, seen lessons, weekly answers, weekly
 * skips, reminder message. A reset is allowed to WRITE — the chain's `resetAll`
 * writes an empty store blob — and a reset that ran after the key loop could
 * leave a key behind a wipe that has already passed it. No entry below writes
 * today; the order is pinned so that the one that does cannot be the reason a
 * residue comes back.
 *
 * WHAT A RESET DOES
 * Each entry is that module's own production reset. Modules with an in-memory
 * copy clear it; modules without one have a no-op for that step. Each removes
 * its own key; each notifies its subscribers if it has them. A reset that
 * throws is caught and the wipe continues: one module failing is not a reason
 * to leave the reader's key in storage.
 */
export const RESET_FUNCTIONS = [
  resetHabits,
  resetGratitude,
  resetCbtRecords,
  resetCustomTrackers,
  resetCustomActivities,
  resetCardStates,
  clearAssessments,
  resetSeenBadges,
  resetSeenLessons,
  resetWeeklyAnswers,
  resetWeeklySkips,
  resetReminderMessage,
  resetCompanion,
] as const;

/**
 * Names that read like a key and are not one: a value the backup format
 * carries, a file that is written to the reader's disk or into IndexedDB, and
 * the download filenames. None of them is in `localStorage`, so the wipe has
 * nothing to remove — but each is a `belso-iranytu*` literal in `src/`, and
 * naming it here is what lets the guard tell "not a key" apart from "a key
 * somebody forgot".
 */
export const NON_STORAGE_NAMES = [
  /** The bundle's own app marker, `BACKUP_BUNDLE_APP` in `lib/backup.ts`. */
  "belso-iranytu",
  /** The backup file's name prefix: `<prefix>-<date>.json` on the disk. */
  "belso-iranytu-mentes",
  /** The exported JSON document's filename. */
  "belso-iranytu-mentes.json",
  /** The exported CSV document's filename. */
  "belso-iranytu-export.csv",
  /** The IndexedDB database the encrypted backup file handle lives in. */
  "belso-iranytu-backup",
] as const;

/**
 * The whole wipe, in three steps: the memory half, then every key in the
 * registry, in both web storages.
 *
 * STEP 1 — `RESET_FUNCTIONS`, first, so that the session the reader is looking
 * at becomes the fresh one at the moment the keys go (see the list's docblock
 * for why the order is pinned rather than arbitrary).
 *
 * STEP 2 — `localStorage`, and STEP 3 — `sessionStorage`: both storages,
 * because one of the keys — the unlock session — is written to `sessionStorage`,
 * and a wipe that cleared only `localStorage` would leave a live unlock behind.
 * A storage that is absent or blocked is not an error: the only thing this can
 * do with one is skip it.
 */
export function wipeAppStorage(): void {
  for (const reset of RESET_FUNCTIONS) {
    try {
      reset();
    } catch {
      /* one module's failure must not leave the rest of the wipe undone */
    }
  }
  for (const key of WIPE_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* no storage */
    }
  }
  for (const key of WIPE_KEYS) {
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* no session storage */
    }
  }
}
