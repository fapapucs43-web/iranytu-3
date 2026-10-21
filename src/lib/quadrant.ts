/**
 * Batch A — the quadrant model's UI-facing constants, gathered in one place.
 *
 * The geometry lives in `lib/migration/mood-v2` (the migration owns the
 * level → coordinate table and the boundary rule); everything the meter,
 * the bubble cloud and Insights draw from is here, so a component never
 * imports from a migration module to paint a colour.
 */
import type { MoodQuadrant } from "../types";
import { QUADRANTS, quadrantFromCoords } from "./migration/mood-v2";

export { QUADRANTS, quadrantFromCoords };
export type { MoodQuadrant };

/** The palette the batch pins; fills and borders across meter and Insights. */
export const QUADRANT_COLORS: Record<MoodQuadrant, string> = {
  "high-neg": "#ef4444",
  "high-pos": "#fbbf24",
  "low-neg": "#3b82f6",
  "low-pos": "#10b981",
};

/** Hungarian display names for the four quadrants. */
export const QUADRANT_LABELS: Record<MoodQuadrant, string> = {
  "high-neg": "Feszült és aktív",
  "high-pos": "Derűs és aktív",
  "low-neg": "Lehangolt és nyugtalan",
  "low-pos": "Nyugodt és elégedett",
};

/** Hungarian one-line hints the meter shows inside each quadrant. */
export const QUADRANT_HINTS: Record<MoodQuadrant, string> = {
  "high-neg": "Sok energia, kellemetlen érzés",
  "high-pos": "Sok energia, kellemes érzés",
  "low-neg": "Kevés energia, kellemetlen érzés",
  "low-pos": "Kevés energia, kellemes érzés",
};
