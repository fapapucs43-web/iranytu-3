/** Local-timezone ISO date helpers. Replaces fragile toLocaleDateString keys. */
import { localeTag, t } from "./i18n";

export function toISODate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function todayISO(): string {
  return toISODate(new Date());
}

/** Human readable: "2026. május 3., vasárnap" */
export function formatHuman(iso: string): string {
  return fromISODate(iso).toLocaleDateString(localeTag(), {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

/** Short: "máj. 3." */
export function formatShort(iso: string): string {
  return fromISODate(iso).toLocaleDateString(localeTag(), {
    month: "short",
    day: "numeric",
  });
}

export function addDays(iso: string, days: number): string {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Monday of the ISO week containing `iso`. */
export function startOfWeek(iso: string): string {
  const d = fromISODate(iso);
  const day = (d.getDay() + 6) % 7; // Mon = 0 … Sun = 6
  d.setDate(d.getDate() - day);
  return toISODate(d);
}

export function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString(localeTag(), {
    year: "numeric",
    month: "long",
  });
}

/**
 * Calendar grid for a month: leading days from the previous month, then the
 * month's days, then trailing days to complete the last week (Mon–Sun).
 */
export function monthGrid(year: number, month: number): string[] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: string[] = [];
  for (let i = lead; i > 0; i--) {
    const d = new Date(year, month, 1 - i);
    cells.push(toISODate(d));
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(toISODate(new Date(year, month, day)));
  }
  while (cells.length % 7 !== 0) {
    const last = fromISODate(cells[cells.length - 1]);
    last.setDate(last.getDate() + 1);
    cells.push(toISODate(last));
  }
  return cells;
}

/**
 * The calendar header's seven initials, Monday first.
 *
 * Round 18 moved them into the catalogue: `Hé` is `Mon` in English and `Mo` in
 * German, and a week grid wearing Hungarian initials under a translated month
 * name is the half-translated screen the staged i18n exists to prevent. The
 * `Intl` calls above decide the LONG forms, through the tag for the locale in
 * force (`localeTag`); these are the short ones `Intl` cannot give, because the
 * app wants three letters, not three plus a period.
 *
 * They are read ONCE, at import, which is why the picker reloads the page
 * instead of re-rendering: a `const` cannot be re-evaluated, and this one is a
 * whole week of column headings. See `lib/i18n`'s header.
 */
export const WEEKDAYS_SHORT = [
  t("dates.weekdayMon"),
  t("dates.weekdayTue"),
  t("dates.weekdayWed"),
  t("dates.weekdayThu"),
  t("dates.weekdayFri"),
  t("dates.weekdaySat"),
  t("dates.weekdaySun"),
];
