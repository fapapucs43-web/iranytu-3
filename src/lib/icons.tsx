/**
 * Vendored Lucide icon set (Batch 5, P10).
 *
 * WHY VENDORED: the plan's constraint is 0 new dependencies, and we only need
 * ~40 icons. Vendoring the path data keeps the addition at a few kB and adds
 * nothing to package.json. Paths follow Lucide (ISC licensed), 24×24 grid.
 *
 * DESIGN RULES (enforced by tests in tests/batch5.test.ts):
 * - `currentColor` only, so every icon follows the active theme token.
 * - ONE stroke width across the whole set (STROKE), so nothing looks heavier
 *   or lighter than its neighbour.
 * - Default size is `1em`, so icons inherit `--font-scale` and grow with the
 *   accessibility text-size settings instead of staying pinned.
 * - Decorative by default: `aria-hidden` + `focusable="false"`. An icon only
 *   becomes an accessible image when the caller passes an explicit `label`.
 *
 * ICON DATA IS NOT TOUCHED: emoji stored by the user or embedded in activity
 * labels (see lib/store DEFAULT_ACTIVITIES) is user content and is rendered
 * as-is. Only decorative UI chrome comes from here.
 */
import type { ReactNode, SVGProps } from "react";

/** The single stroke width for the entire set. */
export const STROKE = 1.75;

/** Size used when the caller does not specify one — inherits the font size. */
export const DEFAULT_SIZE = "1em";

export type IconProps = {
  /**
   * Any CSS length. Defaults to `1em` so the icon scales with the text and
   * with the app's `--font-scale` accessibility setting.
   */
  size?: number | string;
  /**
   * Accessible name. When omitted the icon is treated as decorative and is
   * hidden from assistive technology — the correct default for icons that sit
   * next to a visible text label.
   */
  label?: string;
  className?: string;
  strokeWidth?: number;
};

/** Internal base: one consistent svg shell for every icon in the set. */
function Icon({
  size = DEFAULT_SIZE,
  label,
  className,
  strokeWidth = STROKE,
  children,
  ...rest
}: IconProps & { children: ReactNode } & SVGProps<SVGSVGElement>): ReactNode {
  const decorative = label === undefined;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ? `icon ${className}` : "icon"}
      aria-hidden={decorative ? true : undefined}
      role={decorative ? undefined : "img"}
      focusable="false"
      {...rest}
    >
      {label !== undefined && <title>{label}</title>}
      {children}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Navigation & chrome                                                  */
/* ------------------------------------------------------------------ */

export function Sprout(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M7 20h10" />
      <path d="M10 20c5.5-2.5.8-6.4 3-10" />
      <path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-1-2.5-1.6-3.9-1.7.3 2.7 1.8 4.3 3.7 4.8" />
      <path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z" />
    </Icon>
  );
}

export function Compass(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="12" r="10" />
      <path d="m16.24 7.76-2.12 6.36-6.36 2.12-2.12-6.36 6.36-2.12 2.12 6.36z" />
    </Icon>
  );
}

export function Settings(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  );
}

/* ------------------------------------------------------------------ */
/* Dates, time, reminders                                               */
/* ------------------------------------------------------------------ */

export function Calendar(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M3 10h18" />
    </Icon>
  );
}

export function CalendarDays(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 14h.01" />
      <path d="M12 14h.01" />
      <path d="M16 14h.01" />
      <path d="M8 18h.01" />
      <path d="M12 18h.01" />
      <path d="M16 18h.01" />
    </Icon>
  );
}

export function Clock(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </Icon>
  );
}

export function Hourglass(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M5 22h14" />
      <path d="M5 2h14" />
      <path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22" />
      <path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2" />
    </Icon>
  );
}

export function Bell(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M10.268 21a2 2 0 0 0 3.464 0" />
      <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
    </Icon>
  );
}

export function Sunrise(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 2v8" />
      <path d="m4.93 10.93 1.41 1.41" />
      <path d="M2 18h2" />
      <path d="M20 18h2" />
      <path d="m19.07 10.93-1.41 1.41" />
      <path d="M22 22H2" />
      <path d="m8 6 4-4 4 4" />
      <path d="M16 18a4 4 0 0 0-8 0" />
    </Icon>
  );
}

/* ------------------------------------------------------------------ */
/* Insight & data                                                      */
/* ------------------------------------------------------------------ */

export function Brain(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
      <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
      <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
      <path d="M17.599 6.5a3 3 0 0 0 .399-1.375" />
      <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5" />
      <path d="M3.477 10.896a4 4 0 0 1 .585-.396" />
      <path d="M19.938 10.5a4 4 0 0 1 .585.396" />
      <path d="M6 18a4 4 0 0 1-1.967-.516" />
      <path d="M19.967 17.484A4 4 0 0 1 18 18" />
    </Icon>
  );
}

export function BarChart(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </Icon>
  );
}

export function TrendingUp(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M22 7 13.5 15.5l-5-5L2 17" />
      <path d="M16 7h6v6" />
    </Icon>
  );
}

export function Link(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </Icon>
  );
}

export function Lightbulb(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
      <path d="M9 18h6" />
      <path d="M10 22h4" />
    </Icon>
  );
}

export function LayoutGrid(p: IconProps) {
  return (
    <Icon {...p}>
      <rect width="7" height="7" x="3" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="14" rx="1" />
      <rect width="7" height="7" x="3" y="14" rx="1" />
    </Icon>
  );
}

export function Table(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 3v18" />
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M3 9h18" />
      <path d="M3 15h18" />
    </Icon>
  );
}

export function Scale(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
      <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
      <path d="M7 21h10" />
      <path d="M12 3v18" />
      <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" />
    </Icon>
  );
}

export function FileText(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </Icon>
  );
}

export function NotebookPen(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4" />
      <path d="M2 6h4" />
      <path d="M2 10h4" />
      <path d="M2 14h4" />
      <path d="M2 18h4" />
      <path d="M21.378 12.626 16.8 8.05a1 1 0 0 0-1.6 0l-3.8 3.786a1 1 0 0 0 0 1.6l4.594 4.594a1 1 0 0 0 1.6 0l3.784-3.8a1 1 0 0 0 0-1.604Z" />
      <path d="m14.5 9.5 1.5 1.5" />
    </Icon>
  );
}

export function ClipboardList(p: IconProps) {
  return (
    <Icon {...p}>
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M12 11h4" />
      <path d="M12 16h4" />
      <path d="M8 11h.01" />
      <path d="M8 16h.01" />
    </Icon>
  );
}

/* ------------------------------------------------------------------ */
/* Actions                                                              */
/* ------------------------------------------------------------------ */

export function Search(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </Icon>
  );
}

export function Plus(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </Icon>
  );
}

export function X(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </Icon>
  );
}

export function Check(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M20 6 9 17l-5-5" />
    </Icon>
  );
}

export function Trash(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </Icon>
  );
}

export function Pencil(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
      <path d="m15 5 4 4" />
    </Icon>
  );
}

export function Download(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </Icon>
  );
}

export function Upload(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M17 8l-5-5-5 5" />
      <path d="M12 3v12" />
    </Icon>
  );
}

export function Save(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" />
      <path d="M7 3v4a1 1 0 0 0 1 1h7" />
    </Icon>
  );
}

/**
 * Named `LockIcon` rather than `Lock`: the DOM exposes a global `Lock`, so a
 * plain `Lock` export collides with `window.Lock` inside components and makes
 * `<Lock />` resolve to the browser constructor instead of this icon.
 */
export function LockIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <rect width="18" height="11" x="3" y="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </Icon>
  );
}

export function Eye(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  );
}

export function AlertTriangle(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </Icon>
  );
}

export function Smartphone(p: IconProps) {
  return (
    <Icon {...p}>
      <rect width="14" height="20" x="5" y="2" rx="2" />
      <path d="M12 18h.01" />
    </Icon>
  );
}

export function Sliders(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4 21v-7" />
      <path d="M4 10V3" />
      <path d="M12 21v-9" />
      <path d="M12 8V3" />
      <path d="M20 21v-5" />
      <path d="M20 12V3" />
      <path d="M1 14h6" />
      <path d="M9 8h6" />
      <path d="M17 16h6" />
    </Icon>
  );
}

export function Wind(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12.8 19.6A2 2 0 1 0 14 16H2a2 2 0 1 0 0 4h1a5 5 0 0 0 5 0" />
      <path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2" />
      <path d="M9.6 4.6A2 2 0 1 1 11 8H2" />
    </Icon>
  );
}

export function Palette(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z" />
      <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
    </Icon>
  );
}

export function Image(p: IconProps) {
  return (
    <Icon {...p}>
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </Icon>
  );
}

export function Briefcase(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      <rect width="20" height="14" x="2" y="7" rx="2" />
    </Icon>
  );
}

export function Target(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </Icon>
  );
}

export function Flame(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </Icon>
  );
}

export function Heart(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </Icon>
  );
}

export function Award(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526" />
      <circle cx="12" cy="8" r="6" />
    </Icon>
  );
}

export function Smile(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <path d="M9 9h.01" />
      <path d="M15 9h.01" />
    </Icon>
  );
}

/* ------------------------------------------------------------------------- */
/* Batch 7 (P12) — the objects behind the 29 data glyphs.                     */
/*                                                                            */
/* Until Batch 7 those glyphs were drawn as literal emoji, so unlike the       */
/* chrome icons above there was no prior mapping to copy. These are vendored  */
/* from upstream Lucide at the same 24×24 grid and the same STROKE, verified   */
/* against github.com/lucide-icons/lucide rather than written from memory.    */
/*                                                                            */
/* The three faces are the exception: Lucide ships no face icons. `Smile`      */
/* already existed here for chrome, and `Frown` / `Meh` are drawn in the same  */
/* hand (circle r=10, eyes as dots, mouth as a single path) so the mood scale  */
/* reads as one family. The scale is the one thing in the app a user           */
/* calibrates their feelings against, so its five rungs must be visually      */
/* distinct at a glance — hence three faces rather than one reused shape.      */
/* ------------------------------------------------------------------------- */

export function Frown(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="12" r="10" />
      <path d="M16 17.5s-1.5-2.5-4-2.5-4 2.5-4 2.5" />
      <path d="M9 9h.01" />
      <path d="M15 9h.01" />
    </Icon>
  );
}

export function Grin(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <path d="M9 9h.01" />
      <path d="M15 9h.01" />
      {/* The open mouth: an arc under the smile line, so the top rung is not
          just a bigger version of the one below it. */}
      <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0z" />
    </Icon>
  );
}

export function Meh(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="12" r="10" />
      {/* A shallow downturn, distinct from both Frown's deep curve and
          Neutral's flat line. See the mood-scale test: three rungs that look
          alike would leave the user guessing on the worst days. */}
      <path d="M16 15.5s-1.5-1.4-4-1.4-4 1.4-4 1.4" />
      <path d="M9 9h.01" />
      <path d="M15 9h.01" />
    </Icon>
  );
}

export function Neutral(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="12" r="10" />
      <path d="M8 15h8" />
      <path d="M9 9h.01" />
      <path d="M15 9h.01" />
    </Icon>
  );
}

export function BookOpen(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 7v14" />
      <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
    </Icon>
  );
}

export function House(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
      <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </Icon>
  );
}

export function Users(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </Icon>
  );
}

export function Footprints(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z" />
      <path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z" />
      <path d="M16 17h4" />
      <path d="M4 13h4" />
    </Icon>
  );
}

export function Laptop(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16" />
    </Icon>
  );
}

export function Mountain(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="m8 3 4 8 5-5 5 15H2L8 3z" />
    </Icon>
  );
}

export function Droplet(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z" />
    </Icon>
  );
}

export function Stethoscope(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M11 2v2" />
      <path d="M5 2v2" />
      <path d="M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1" />
      <path d="M8 15a6 6 0 0 0 12 0v-3" />
      <circle cx="20" cy="10" r="2" />
    </Icon>
  );
}

export function Salad(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M7 21h10" />
      <path d="M12 21a9 9 0 0 0 9-9H3a9 9 0 0 0 9 9Z" />
      <path d="M11.38 12a2.4 2.4 0 0 1-.4-4.77 2.4 2.4 0 0 1 3.2-2.77 2.4 2.4 0 0 1 3.47-.63 2.4 2.4 0 0 1 3.37 3.37 2.4 2.4 0 0 1-1.1 3.7 2.51 2.51 0 0 1 .03 1.1" />
      <path d="M13 12a4 4 0 0 1-1.17-2.77" />
      <path d="M14 8a2 2 0 0 0-1.82-1.18" />
      <path d="M9 8a2 2 0 0 1 1.63-.94" />
      <path d="M16 15a6 6 0 0 1 .83 2" />
    </Icon>
  );
}

export function Star(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M11.5 2.4a.6.6 0 0 1 1 0l2.3 4.66 5.14.75a.6.6 0 0 1 .33 1.02l-3.72 3.63.88 5.12a.6.6 0 0 1-.87.63L12 15.8l-4.56 2.4a.6.6 0 0 1-.87-.63l.88-5.12L3.73 8.83a.6.6 0 0 1 .33-1.02l5.14-.75z" />
    </Icon>
  );
}

export function CloudSun(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 2v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="M20 12h2" />
      <path d="m19.07 4.93-1.41 1.41" />
      <path d="M15.947 12.65a4 4 0 0 0-5.925-4.128" />
      <path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z" />
    </Icon>
  );
}

export function Minus(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M5 12h14" />
    </Icon>
  );
}

export function Circle(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="12" r="10" />
    </Icon>
  );
}

export function Battery(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M15 7h1a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2" />
      <path d="M6 7h9a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z" />
      <path d="M11 10v4" />
      <path d="M14 10v4" />
    </Icon>
  );
}

export function RefreshCw(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </Icon>
  );
}

export function TrendingDown(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M16 7h6v6" />
      <path d="m22 7-8.5 8.5-5-5L2 17" />
    </Icon>
  );
}

export function Camera(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </Icon>
  );
}

export function Mic(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 19v3" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <rect width="12" height="16" x="8" y="2" rx="2" />
    </Icon>
  );
}

export function Music(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </Icon>
  );
}

export function Film(p: IconProps) {
  return (
    <Icon {...p}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M7 3v18" />
      <path d="M3 7.5h4" />
      <path d="M3 12h18" />
      <path d="M3 16.5h4" />
      <path d="M17 3v18" />
      <path d="M17 7.5h4" />
      <path d="M17 16.5h4" />
    </Icon>
  );
}

export function Paperclip(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </Icon>
  );
}

export function Sun(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </Icon>
  );
}

export function Moon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </Icon>
  );
}

export function Leaf(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
      <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
    </Icon>
  );
}

export function Sparkles(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
      <path d="M20 3v4" />
      <path d="M22 5h-4" />
      <path d="M4 17v2" />
      <path d="M5 18H3" />
    </Icon>
  );
}

export function Flower(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 7a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z" />
      <path d="M12 7c-1.5 0-3 1-3 2.5S10.5 12 12 12s3-1 3-2.5S13.5 7 12 7Z" />
      <path d="M9.5 9.5C8 9 6 9.5 5.5 11s.5 3 2 3.5 3.5-1 3.5-2.5-.5-2.5-1.5-2.5Z" />
      <path d="M14.5 9.5c1.5-.5 3.5 0 4 1.5s-.5 3-2 3.5-3.5-1-3.5-2.5.5-2.5 1.5-2.5Z" />
      <path d="M9.5 14.5c-1.5.5-3.5 0-4-1.5s.5-3 2-3.5 3.5 1 3.5 2.5-.5 2.5-1.5 2.5Z" />
      <path d="M14.5 14.5c1.5.5 3.5 0 4-1.5s-.5-3-2-3.5-3.5 1-3.5 2.5.5 2.5 1.5 2.5Z" />
      <path d="M12 12v9" />
    </Icon>
  );
}

export function Dumbbell(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M14.4 14.4 9.6 9.6" />
      <path d="M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.768a2 2 0 1 1-2.829-2.829l6.364-6.364a2 2 0 1 1 2.829 2.829l-1.768 1.767a2 2 0 1 1 2.828 2.829z" />
      <path d="m21.5 21.5-1.4-1.4" />
      <path d="M3.9 3.9 2.5 2.5" />
      <path d="M6.404 12.768a2 2 0 1 1-2.829-2.829l1.768-1.767a2 2 0 1 1-2.828-2.829l2.828-2.828a2 2 0 1 1 2.829 2.828l1.767-1.768a2 2 0 1 1 2.829 2.829z" />
    </Icon>
  );
}

/**
 * Batch 7e, for the 🌡️ hőmérséklet tracker: one path, taken from Lucide
 * (ISC) with the rest of this file's rules applied by the `Icon` wrapper —
 * `currentColor`, the single shared STROKE, a 24×24 grid and decorative by
 * default.
 *
 * Vendored rather than borrowed from an existing icon on purpose. `Sun` is the
 * obvious neighbour in `ICONS` and it would have cost nothing, but a sun is a
 * picture of the sun: on a temperature field it is a wrong answer that happens
 * to look plausible, which is worse than an obvious substitute.
 */
export function Thermometer(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z" />
    </Icon>
  );
}

export function Zap(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
    </Icon>
  );
}

export function MapPin(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
      <circle cx="12" cy="10" r="3" />
    </Icon>
  );
}

export function Ban(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="12" r="10" />
      <path d="m4.9 4.9 14.2 14.2" />
    </Icon>
  );
}

export function Radio(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
      <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5" />
      <circle cx="12" cy="12" r="2" />
      <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5" />
      <path d="M19.1 4.9C23 8.8 23 15.1 19.1 19" />
    </Icon>
  );
}

export function ChevronRight(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="m9 18 6-6-6-6" />
    </Icon>
  );
}

export function ChevronLeft(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="m15 18-6-6 6-6" />
    </Icon>
  );
}

export function ChevronDown(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );
}

export function Square(p: IconProps) {
  return (
    <Icon {...p}>
      <rect width="16" height="16" x="4" y="4" rx="2" />
    </Icon>
  );
}

export function Type(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4 7V4h16v3" />
      <path d="M9 20h6" />
      <path d="M12 4v16" />
    </Icon>
  );
}

export function Phone(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M13.8 21a15.9 15.9 0 0 1-10.8-10.8A2 2 0 0 1 4.6 6l2.3-1.4a1 1 0 0 1 1.2.3l1.5 2.2a1 1 0 0 1-.2 1.3l-1.2 1a12.8 12.8 0 0 0 5.7 5.7l1-1.2a1 1 0 0 1 1.3-.2l2.2 1.5a1 1 0 0 1 .3 1.2L18 19.4a2 2 0 0 1-1.6 1.6Z" />
    </Icon>
  );
}

export function History(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </Icon>
  );
}

export function ShieldAlert(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1Z" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </Icon>
  );
}

export function MessageCircle(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
    </Icon>
  );
}

/** Named `PillIcon` to avoid colliding with the UI `Pill` component in ui.tsx. */
export function PillIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" />
      <path d="M8.5 8.5l7 7" />
    </Icon>
  );
}

export function Bed(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8" />
      <path d="M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4" />
      <path d="M12 4v6" />
    </Icon>
  );
}

export function Activity(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M22 12h-2.5a1 1 0 0 0-1 1v2a1 1 0 0 1-1 1v-4" />
      <path d="M6.5 12H4a2 2 0 0 1 2-4h1.5" />
      <path d="M12 7.5V6a2 2 0 0 1 2-2" />
      <path d="M6.5 17.5V20a2 2 0 0 1-2 2" />
      <path d="M12 12v2.5a1 1 0 0 0 1 1h2a1 1 0 0 1 1 1v1a1 1 0 0 0 1 1h1" />
    </Icon>
  );
}

/* ------------------------------------------------------------------ */
/* Registry                                                             */
/* ------------------------------------------------------------------ */

/**
 * Every icon in the set, keyed by name. Tests iterate this to guarantee each
 * entry renders valid SVG markup and carries the shared accessibility rules,
 * so a new icon cannot be added without them.
 */
export const ICONS = {
  Activity,
  AlertTriangle,
  Award,
  BarChart,
  Bed,
  Bell,
  Briefcase,
  Brain,
  Calendar,
  CalendarDays,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  Compass,
  Download,
  Dumbbell,
  // Batch 7e: the 🌡️ glyph's Lucide name. It is CONTENT, not chrome, so it
  // does not belong in `lib/icon-policy.ts`'s 46 and must never be added there.
  Thermometer,
  Eye,
  FileText,
  Film,
  Flame,
  Flower,
  Heart,
  History,
  Hourglass,
  LayoutGrid,
  Leaf,
  Lightbulb,
  Link,
  LockIcon,
  MessageCircle,
  Mic,
  Moon,
  Music,
  NotebookPen,
  Palette,
  Paperclip,
  Pencil,
  Phone,
  PillIcon,
  Plus,
  Radio,
  Save,
  Scale,
  Search,
  Settings,
  ShieldAlert,
  Sliders,
  Smartphone,
  Sparkles,
  Square,
  Sprout,
  Sun,
  Sunrise,
  Table,
  Target,
  Type,
  Trash,
  TrendingUp,
  Upload,
  Wind,
  X,
  Zap,
  // Batch 7 — the 29 data glyphs. `Smile` and `Ban` were already defined for
  // chrome but missing from the registry, so `useIcon` could not reach them.
  Ban,
  Smile,
  Frown,
  Grin,
  Meh,
  Neutral,
  BookOpen,
  House,
  Users,
  Footprints,
  Laptop,
  Mountain,
  Droplet,
  Stethoscope,
  Salad,
  Star,
  CloudSun,
  Minus,
  Circle,
  Battery,
  RefreshCw,
  TrendingDown,
} as const;

export type IconName = keyof typeof ICONS;

/** Look an icon up by name; returns null for an unknown key. */
export function getIcon(name: string): ((p: IconProps) => ReactNode) | null {
  return Object.prototype.hasOwnProperty.call(ICONS, name)
    ? ICONS[name as IconName]
    : null;
}
