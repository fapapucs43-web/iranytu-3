import type { MoodLevel } from "../types";

/**
 * Daylio-style 5-point mood scale. One scale everywhere — this replaces the
 * old app's three competing emoji sets that could never be compared.
 */
export const MOODS: {
  level: MoodLevel;
  emoji: string;
  label: string;
  color: string;
  score: number; // 0–100 well-being points
}[] = [
  /* Batch 11, commit 3 — the hexes, and why exactly these four moved.
   *
   * A mood colour draws as a FILL (calendar cells, PDF chart bars, legend
   * swatches) on every theme's `--surface`/`--bg`, and as a BORDER on the
   * active mood button. The batch's test (batch11-polish) computes the WCAG
   * contrast ratio of every hex against all six backgrounds the app can put
   * under it — light/dark/warm/vibrant, surface and bg — and pins both a
   * floor (≥ 3.0, the WCAG AA graphics threshold, with 4.5 preferred) and
   * the exact hexes themselves, so a future edit re-runs the arithmetic
   * instead of eyeballing it.
   *
   * The previous palette failed that computation on four rows, all in the
   * same direction: too light for light themes or too dark for dark ones
   * (Nehéz hit 2.82 on light bg, Közepes 2.88, Jó 2.99, Nagyon jó 2.01 on
   * dark surface — below even the 3.0 graphics floor). Level 1 (Nagyon
   * rossz) computed ≥ 3.21 everywhere already and was left alone — the rule
   * is "adjust only where the ratio fails", not "redesign the palette".
   * The four replacements are the same hues, nudged in chroma/lightness
   * until the WORST case over all six backgrounds clears the floor with
   * margin (their floors: 3.75 / 3.68 / 3.38 / 3.52) while keeping light-
   * theme ratios comfortably high (≥ 3.76 / 3.83 / 4.17 / 4.01).
   */
  { level: 1, emoji: "😖", label: "Nagyon rossz", color: "#c0455a", score: 10 },
  { level: 2, emoji: "😕", label: "Nehéz", color: "#ba6503", score: 30 },
  { level: 3, emoji: "😐", label: "Közepes", color: "#747a84", score: 50 },
  { level: 4, emoji: "🙂", label: "Jó", color: "#338253", score: 75 },
  { level: 5, emoji: "😄", label: "Nagyon jó", color: "#1e8662", score: 95 },
];

export function moodByLevel(level: number) {
  const found = MOODS.find((m) => m.level === level);
  return found ?? MOODS[2];
}

/** Hungarian display of a mood, e.g. "🙂 Jó". */
export function moodLabel(level: number): string {
  const m = moodByLevel(level);
  return `${m.emoji} ${m.label}`;
}

/** Legacy emoji from v1 data mapped onto the new scale. */
const LEGACY_MOOD_MAP: Record<string, MoodLevel> = {
  "😄": 5,
  "🙂": 4,
  "😊": 4,
  "😐": 3,
  "😕": 2,
  "😔": 2,
  "😡": 1,
  "😰": 1,
  "😀": 5,
};

export function mapLegacyMood(value: unknown): MoodLevel | null {
  if (typeof value === "number") {
    if (value >= 1 && value <= 5) return value as MoodLevel;
    return null;
  }
  if (typeof value === "string") {
    const direct = LEGACY_MOOD_MAP[value];
    if (direct) return direct;
    const firstEmoji = [...value][0];
    return LEGACY_MOOD_MAP[firstEmoji] ?? null;
  }
  return null;
}
