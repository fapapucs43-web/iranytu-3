/**
 * Batch A — Recording 2.0: the emotion vocabulary of the flow's second step.
 *
 * The bubbles a user can pick are DEFAULT (shipped, per quadrant) plus
 * CUSTOM (the user's own words added through the "Egyéb" bubble, persisted
 * by the store under `belso-iranytu-emotion-vocab`). The two lists are kept
 * apart so a custom word can never shadow or mutate a shipped one.
 *
 * WHY ID + LABEL
 * The entry stores the label the user picked (Hungarian, as shown), while
 * `id` is the pinned English word the batch enumerates. The id is what makes
 * the default vocabulary testable against the batch spec byte-for-byte and
 * what keeps analytics-free storage small; the label is what a Hungarian
 * reader actually sees. Custom words have id === label — they have no
 * English name, and none is invented for them.
 */
import type { MoodQuadrant } from "../types";

export type EmotionOption = {
  /** Pinned, spec-canonical word; stable across translations. */
  id: string;
  /** What the bubble shows (Hungarian). */
  label: string;
};

/** The batch's default vocabulary: exactly eight emotions per quadrant. */
export const DEFAULT_EMOTION_VOCAB: Record<MoodQuadrant, EmotionOption[]> = {
  "high-neg": [
    { id: "angry", label: "Dühös" },
    { id: "frustrated", label: "Frusztrált" },
    { id: "nervous", label: "Ideges" },
    { id: "anxious", label: "Szorongó" },
    { id: "panicking", label: "Pánikol" },
    { id: "hostile", label: "Ellenséges" },
    { id: "irritated", label: "Irritált" },
    { id: "overwhelmed", label: "Túlterhelt" },
  ],
  "high-pos": [
    { id: "excited", label: "Izgatott" },
    { id: "thrilled", label: "Felvillanyozott" },
    { id: "energetic", label: "Tele energiával" },
    { id: "happy", label: "Boldog" },
    { id: "motivated", label: "Motivált" },
    { id: "inspired", label: "Inspirált" },
    { id: "cheerful", label: "Vidám" },
    { id: "optimistic", label: "Optimista" },
  ],
  "low-neg": [
    { id: "sad", label: "Szomorú" },
    { id: "down", label: "Kedvetlen" },
    { id: "lonely", label: "Magányos" },
    { id: "disappointed", label: "Csalódott" },
    { id: "hopeless", label: "Kétségbeesett" },
    { id: "guilty", label: "Bűntudatos" },
    { id: "ashamed", label: "Szégyelli magát" },
    { id: "empty", label: "Üres" },
  ],
  "low-pos": [
    { id: "calm", label: "Nyugodt" },
    { id: "content", label: "Elégedett" },
    { id: "grateful", label: "Hálás" },
    { id: "peaceful", label: "Békés" },
    { id: "comfortable", label: "Kényelmes" },
    { id: "relaxed", label: "Ellazult" },
    { id: "safe", label: "Biztonságban" },
    { id: "loved", label: "Szeretett" },
  ],
};

/** Every default emotion id, across all quadrants. */
export function defaultEmotionIds(): Set<string> {
  const ids = new Set<string>();
  for (const list of Object.values(DEFAULT_EMOTION_VOCAB)) {
    for (const option of list) ids.add(option.id);
  }
  return ids;
}

/**
 * The bubble list for one quadrant: the eight defaults, then the user's own
 * words (custom words may repeat across quadrants — the same personal word
 * is legitimately useful in several moods). The custom list arrives from the
 * store's loader, already trimmed and validated.
 */
export function emotionsForQuadrant(
  quadrant: MoodQuadrant,
  customLabels: string[],
): EmotionOption[] {
  const defaults = DEFAULT_EMOTION_VOCAB[quadrant];
  // A custom word collides when it repeats a default's id OR its Hungarian
  // label — the bubble cloud renders labels, so either would draw twice.
  const defaultKeys = new Set<string>([
    ...defaults.map((o) => o.id),
    ...defaults.map((o) => o.label.toLowerCase()),
  ]);
  const custom: EmotionOption[] = [];
  for (const label of customLabels) {
    const clean = typeof label === "string" ? label.trim() : "";
    if (!clean) continue;
    if (defaultKeys.has(clean) || defaultKeys.has(clean.toLowerCase())) continue;
    if (custom.some((c) => c.id === clean)) continue;
    custom.push({ id: clean, label: clean });
  }
  return [...defaults, ...custom];
}

/** Is this stored emotion value a default word (by id or Hungarian label)? */
export function isDefaultEmotion(value: string): boolean {
  const clean = value.trim().toLowerCase();
  if (!clean) return false;
  for (const list of Object.values(DEFAULT_EMOTION_VOCAB)) {
    for (const option of list) {
      if (option.id === clean || option.label.toLowerCase() === clean) return true;
    }
  }
  return false;
}
