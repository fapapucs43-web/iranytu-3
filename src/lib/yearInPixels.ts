/**
 * Year-in-Pixels builder (Phase 3).
 *
 * Turns journal entries into a month × day matrix of mood colors. Uses the
 * existing date helpers and mood palette via imports only — no existing file
 * is modified.
 */
import { moodByLevel } from "./mood";
import { monthGrid, monthLabel } from "./dates";
import { QUADRANT_COLORS } from "./quadrant";
import { localeTag, t } from "./i18n";
import type { Entry, MoodLevel, MoodQuadrant } from "../types";

export type PixelCell = {
  /** ISO date of the day this cell draws, e.g. "2026-09-01". */
  date: string;
  day: number;
  /** null = no entry that day */
  level: MoodLevel | null;
  color: string | null;
  /**
   * Batch A — the day's quadrant, when the new recorder wrote one. The cell
   * then paints the QUADRANT color instead of the level color; days recorded
   * on the old scale keep their level color, so the two eras stay readable
   * side by side.
   */
  quadrant: MoodQuadrant | null;
};

/**
 * Three-letter month abbreviations, index-aligned to month numbers (0 = január).
 *
 * Three letters is the shortest form in which every HUNGARIAN month is
 * unambiguous on its own: the one-letter initials collide — J is január, június
 * and július, M is március and május — and no pair differs only by an accent, so
 * the diacritics carry no information the reader needs. The other two locales
 * choose their own cut (English `Jan`, German `Mär`), which is why round 18
 * moved these out of the module and into the catalogue; the abbreviations are
 * read by the year grid, so they have to travel with the language the grid is
 * drawn in.
 */
export const MONTH_ABBREVIATIONS = [
  t("yearInPixels.monthJan"),
  t("yearInPixels.monthFeb"),
  t("yearInPixels.monthMar"),
  t("yearInPixels.monthApr"),
  t("yearInPixels.monthMay"),
  t("yearInPixels.monthJun"),
  t("yearInPixels.monthJul"),
  t("yearInPixels.monthAug"),
  t("yearInPixels.monthSep"),
  t("yearInPixels.monthOct"),
  t("yearInPixels.monthNov"),
  t("yearInPixels.monthDec"),
] as const;

/**
 * The month name alone, for mid-sentence use and for `aria-label`, where
 * `monthLabel`'s year prefix is noise. Hungarian's long month form is already
 * lower-case, which is why there is no capital to fold here; the tests hold
 * that against both `monthLabel` and the abbreviation list, so a locale change
 * that started capitalising it fails loudly rather than quietly.
 *
 * The tag follows the locale in force (`localeTag`), so a reader who switched
 * to English gets `October` here and English initials in the grid above — the
 * two halves of one month's heading, which is exactly the pair that would look
 * broken if only one of them moved.
 */
export function monthName(month: number): string {
  return new Date(2026, month, 1).toLocaleDateString(localeTag(), { month: "long" });
}

export type YearInPixelsMonth = {
  year: number;
  month: number; // 0-based
  label: string;
  cells: PixelCell[];
};

/** Build the matrix for one month. */
export function monthMatrix(
  year: number,
  month: number,
  entries: Entry[],
): YearInPixelsMonth {
  const byDate = new Map(entries.map((e) => [e.date, e]));
  const cells: PixelCell[] = monthGrid(year, month).map((iso) => {
    const entry = byDate.get(iso);
    const quadrant = entry?.quadrant ?? null;
    return {
      date: iso,
      day: Number(iso.slice(8, 10)),
      level: entry?.mood ?? null,
      quadrant,
      color: quadrant
        ? QUADRANT_COLORS[quadrant]
        : entry
          ? moodByLevel(entry.mood).color
          : null,
    };
  });
  return { year, month, label: monthLabel(year, month), cells };
}

/** Available years in the data, newest first (plus the current year). */
export function availableYears(entries: Entry[]): number[] {
  const years = new Set<number>(entries.map((e) => Number(e.date.slice(0, 4))));
  years.add(new Date().getFullYear());
  return [...years].filter((y) => !Number.isNaN(y)).sort((a, b) => b - a);
}
