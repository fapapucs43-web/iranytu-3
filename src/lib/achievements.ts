/**
 * Achievements / badge shelf (Batch 2, P6).
 *
 * Pure, derived rules over existing data — nothing new is stored except the
 * "already seen" flags (own key, same pattern as the other libs). The badge
 * rules were user-approved: journaling streaks, entry counts, first photo /
 * video, gratitude, CBT and habit milestones. The component (Commit 2) feeds
 * in the counts; this module never reads entry stores itself.
 */
import type { Entry } from "../types";
import { currentStreak } from "./analysis";
import { MOODS } from "./mood";
import {
  NO_FEATURE_USE,
  attachmentCount,
  moodLevelsUsed,
  type FeatureUse,
} from "./featureUse";

export type BadgeDef = {
  id: string;
  icon: string;
  label: string;
  hint: string;
};

export const BADGES: BadgeDef[] = [
  { id: "streak-3", icon: "🧭", label: "Első irány", hint: "3 napos naplózási sorozat" },
  { id: "streak-7", icon: "🔥", label: "Egy hét", hint: "7 napos sorozat" },
  { id: "streak-14", icon: "🌿", label: "Két hét", hint: "14 napos sorozat" },
  { id: "streak-30", icon: "🏔️", label: "Egy hónap", hint: "30 napos sorozat" },
  { id: "entries-10", icon: "📓", label: "10 bejegyzés", hint: "10 nap rögzítve" },
  { id: "entries-50", icon: "📚", label: "50 bejegyzés", hint: "50 nap rögzítve" },
  { id: "entries-100", icon: "🏆", label: "100 bejegyzés", hint: "100 nap rögzítve" },
  { id: "first-photo", icon: "📸", label: "Első fénykép", hint: "Első fotó egy bejegyzéshez" },
  { id: "first-video", icon: "🎬", label: "Első videó", hint: "Első videó egy bejegyzéshez" },
  { id: "gratitude-5", icon: "🙏", label: "Hála ×5", hint: "5 hálafeljegyzés" },
  { id: "cbt-5", icon: "🧠", label: "Gondolatmester", hint: "5 gondolatnapló (KBK)" },
  { id: "habit-7", icon: "💧", label: "Szokás-gép", hint: "Bármely szokás 7 napig sorban" },
  /* --- Batch 13, commit 8: the second twelve ---
     Every icon here is one the app ALREADY ships as a glyph. A badge icon is
     decoration; the label and hint carry the meaning. Adding twelve new emoji
     would have meant twelve new GLYPHS entries, each with a codepoint list and
     a Lucide and a Fluent name to keep in step — for twelve pictures of
     nothing. The glyph set stays at 43 and the icon policy stays closed. */
  { id: "streak-60", icon: "🏃", label: "Két hónap", hint: "60 napos sorozat" },
  { id: "streak-100", icon: "⭐", label: "Száz nap", hint: "100 napos sorozat" },
  { id: "entries-365", icon: "💙", label: "Egy teljes év", hint: "365 nap rögzítve" },
  { id: "photo-10", icon: "📸", label: "Tíz fénykép", hint: "10 fotó összesen" },
  { id: "video-5", icon: "🎬", label: "Öt videó", hint: "5 videó összesen" },
  { id: "gratitude-25", icon: "🙏", label: "Hála ×25", hint: "25 hálafeljegyzés" },
  { id: "cbt-25", icon: "🧠", label: "Gondolatmester II", hint: "25 gondolatnapló (KBK)" },
  { id: "habit-30", icon: "👟", label: "Hónapos szokás", hint: "Bármely szokás 30 napig sorban" },
  { id: "mood-range", icon: "🔁", label: "Teljes hangulatskála", hint: "Legalább 4 különböző hangulat" },
  { id: "first-reflection", icon: "🧘", label: "Első önreflexió", hint: "Első kitöltött önértékelés" },
  { id: "first-experiment", icon: "🌱", label: "Első kísérlet", hint: "Első saját kísérlet elindítva" },
  { id: "experiment-closed", icon: "⬆️", label: "Lezárt kísérlet", hint: "Egy kísérletet lezártál" },
  /* --- Batch 13, commit 9: the three deferred ones ---
     All three read the sidecar the same way and need nothing from this file
     that commit 8 did not already provide. They were deferred precisely so the
     sidecar would exist first: before it, each of these was another field on
     AchievementInput, and there is no third way to add a feature. */
  { id: "first-health-import", icon: "🩺", label: "Első egészségimport", hint: "Egyszer importáltál adatot" },
  { id: "first-food-ai", icon: "🥗", label: "Első ételelemzés", hint: "Egyszer elemezted egy étel fotóját" },
  { id: "first-pdf-export", icon: "⬇️", label: "Első PDF", hint: "Egyszer exportáltál hangulatjelentést" },
];

/**
 * What the badge rules are given.
 *
 * `gratitudeCount` and `cbtCount` used to be fields of their own. They are now
 * keys in `featureUse`, which is the entire reason that map exists: a badge
 * rule about gratitude now reads the same shape as one about experiments, and
 * commit 9's three additions are three keys rather than three arguments at
 * five call sites. `entries` and `maxHabitStreak` stay as they are because
 * they are not counts — one is the journal itself and the other is a streak.
 */
export type AchievementInput = {
  entries: Entry[];
  /** Longest current streak among habits (computed by the caller). */
  maxHabitStreak: number;
  /**
   * Per-feature counts. Optional so an existing caller that has nothing to
   * report still type-checks and earns nothing rather than crashing — but the
   * card always builds a real one.
   */
  featureUse?: FeatureUse;
};

function hasAttachment(entries: Entry[], kind: "photo" | "video"): boolean {
  return entries.some((e) => (e.attachments ?? []).some((a) => a.kind === kind));
}

/** Pure: which badge ids are earned for the given data snapshot. */
export function earnedBadgeIds(input: AchievementInput): Set<string> {
  const streak = currentStreak(input.entries);
  const count = input.entries.length;
  const use = input.featureUse ?? NO_FEATURE_USE;
  const earned = new Set<string>();
  for (const def of BADGES) {
    let ok = false;
    switch (def.id) {
      case "streak-3":
        ok = streak >= 3;
        break;
      case "streak-7":
        ok = streak >= 7;
        break;
      case "streak-14":
        ok = streak >= 14;
        break;
      case "streak-30":
        ok = streak >= 30;
        break;
      case "streak-60":
        ok = streak >= 60;
        break;
      case "streak-100":
        ok = streak >= 100;
        break;
      case "entries-10":
        ok = count >= 10;
        break;
      case "entries-50":
        ok = count >= 50;
        break;
      case "entries-100":
        ok = count >= 100;
        break;
      case "entries-365":
        ok = count >= 365;
        break;
      case "first-photo":
        ok = hasAttachment(input.entries, "photo");
        break;
      case "first-video":
        ok = hasAttachment(input.entries, "video");
        break;
      case "photo-10":
        ok = attachmentCount(input.entries, "photo") >= 10;
        break;
      case "video-5":
        ok = attachmentCount(input.entries, "video") >= 5;
        break;
      case "gratitude-5":
        ok = use.gratitude >= 5;
        break;
      case "gratitude-25":
        ok = use.gratitude >= 25;
        break;
      case "cbt-5":
        ok = use.cbt >= 5;
        break;
      case "cbt-25":
        ok = use.cbt >= 25;
        break;
      case "habit-7":
        ok = input.maxHabitStreak >= 7;
        break;
      case "habit-30":
        ok = input.maxHabitStreak >= 30;
        break;
      case "mood-range":
        // Read from the scale itself rather than written as 4: the badge is
        // for having recorded the WHOLE range, and a mood scale that gains or
        // loses a level must not leave this badge quietly unearnable.
        ok = moodLevelsUsed(input.entries) >= MOODS.length;
        break;
      case "first-reflection":
        ok = use.reflection >= 1;
        break;
      case "first-experiment":
        ok = use.experiment >= 1;
        break;
      case "experiment-closed":
        ok = use.experimentClosed >= 1;
        break;
      case "first-health-import":
        ok = use.healthImport >= 1;
        break;
      case "first-food-ai":
        ok = use.foodAi >= 1;
        break;
      case "first-pdf-export":
        ok = use.pdfExport >= 1;
        break;
    }
    if (ok) earned.add(def.id);
  }
  return earned;
}

/* -------------------------- seen flags (own key) ------------------------- */

const SEEN_KEY = "belso-iranytu-achievements-seen";

function loadSeen(): string[] {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function getSeenBadgeIds(): Set<string> {
  return new Set(loadSeen());
}

/** Persist that the user has now "seen" these badges (no more NEW pulse). */
export function markBadgesSeen(ids: string[]) {
  const merged = new Set(loadSeen());
  for (const id of ids) merged.add(id);
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...merged]));
  } catch {
    /* in-memory only */
  }
}

/** Reset seen flags (used by tests and a future "reset all" hook). */
export function resetSeenBadges() {
  try {
    localStorage.removeItem(SEEN_KEY);
  } catch {
    /* noop */
  }
}
