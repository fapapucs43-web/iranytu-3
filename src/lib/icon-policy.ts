/**
 * Icon policy (Batch 7f).
 *
 * THE PROBLEM THIS FILE MAKES STRUCTURAL
 * A user who picks a 3D icon set reported that the icons "did not fully
 * switch". The bottom navigation was innocent — all four tabs were already
 * correct in every set. The real gap was everything else: 17 distinct Lucide
 * icons, at 39 call sites, were drawn as line art even though the content
 * registry already held a picture for every one of them. A section header, a
 * streak flame and the app's own logo sat in a 3D app as monochrome.
 *
 * So the app now has two kinds of icon and this file is the line between them.
 *
 *   CONTENT — the icon carries meaning the registry already models. It is
 *   drawn through `<ContentIcon>` and therefore follows the chosen set.
 *   CHROME  — the icon is a control affordance or a piece of furniture. It
 *   stays a Lucide line icon in every set, and is listed here so that "stays
 *   Lucide" is a decision on the record rather than an oversight.
 *
 * WHY CHROME STAYS LUCIDE, INSTEAD OF A MISSING EMOJI BEING ADDED
 * `Plus`, `X`, `Check`, `Search`, `ChevronDown` and their neighbours are the
 * vocabulary of a button. A 3D photograph of a plus sign in a 40px button is
 * not a better plus sign: it is blurrier, busier, and harder to hit, and the
 * control stops looking like a control. There is no artwork that makes those
 * better, so the honest answer is that a set has nothing to contribute there
 * and the app should not pretend otherwise. Where the registry DOES have a
 * picture — a flame, a pill, a trophy — the picture is better than the line
 * art, and it is used.
 *
 * THE POINT OF LISTING THE 46
 * Before this file, a chrome icon and a content icon were the same line of
 * code: `<Flame size="1.1em" />`. Nothing recorded which was which, which is
 * exactly how a 3D set ended up with a monochrome logo. Now the two are
 * different components, and a test asserts that every Lucide name in the app
 * is either routed through `<ContentIcon>` or appears here with a reason. A
 * new icon cannot be added without someone deciding which kind it is, and an
 * icon cannot quietly stay Lucide in a 3D set.
 *
 * WHY THIS IS SHOWN TO THE USER AND NOT ONLY TO REVIEWERS
 * Because a user who chose a 3D set will look for the leftovers, and "some
 * icons stay line-drawn, on purpose" is a better answer than letting them find
 * out. The Settings screen lists all 46 with the reason for each, under a
 * disclosure so it costs nothing to a user who does not care. An exception
 * nobody can see is not documented; it is merely tolerated.
 *
 * WHY THE REASONS ARE IN HUNGARIAN
 * They are read on the Settings screen, by a Hungarian speaker, and a policy
 * nobody can read is a policy nobody follows.
 *
 * SINCE ROUND 15 THEY ARE ALSO IN THE CATALOGUE
 * That is not a contradiction of the paragraph above — it is the reason for
 * it. `t()` returns Hungarian by default, so the sentence still holds for the
 * reader who never changes the language, and the reason now travels for the
 * one who does. Both were true at once; only one of them was before.
 */

import { t } from "./i18n";

/**
 * Why an icon stays a line drawing. Drives the grouping in Settings.
 *
 * THE VALUES ARE HUNGARIAN AND THEY ARE IDS, NOT COPY. `chromeByGroup()`
 * matches on them and `CHROME_GROUPS` lists them in display order, so
 * translating them here would break the lookup rather than translate anything.
 * The heading the reader sees comes from `CHROME_GROUP_LABEL` below, which is
 * one `t()` per group. Round 15 catalogued the reader-facing half and left the
 * structural half alone, deliberately.
 */
export type ChromeGroup = "Gombok" | "Jelzések" | "Berendezés" | "Mérőszámok";

/** The reader-facing name of each group. Total, so a new group cannot skip it. */
export const CHROME_GROUP_LABEL: Readonly<Record<ChromeGroup, string>> = {
  Gombok: t("iconPolicy.group.gombok"),
  Jelzések: t("iconPolicy.group.jelzesek"),
  Berendezés: t("iconPolicy.group.berendezes"),
  Mérőszámok: t("iconPolicy.group.meroszamok"),
};

/** One icon that deliberately stays a Lucide line icon in every set. */
export type ChromeIcon = {
  /** The Lucide component name, as `lib/icons` spells it. */
  name: string;
  /** Why this one does not follow the set, in one line, plain Hungarian. */
  reason: string;
  /** Which family of chrome it belongs to, for the Settings grouping. */
  group: ChromeGroup;
};

/**
 * The 48, in group order. Every Lucide name the app draws outside `ContentIcon`.
 *
 * `reason` is `t()`-resolved HERE, at module scope, rather than stored as a key
 * and resolved at the display site. That is the same trade `FontPicker` makes
 * for its sample sentence, and it is why the `ChromeIcon.reason` type is still
 * `string`: this record is exported, matched by name, and asserted on by
 * `tests/batch7f.test.ts`, so changing its shape would change four contracts
 * for no gain. `t()` returns Hungarian by default, which is what this file
 * always showed.
 */
export const CHROME_ICONS: readonly ChromeIcon[] = [
  // Gombok. A picture of these would be worse, not better: the symbol is the
  // label, and a 3D rendering of it is less legible at button size.
  { name: "Plus", group: "Gombok", reason: t("iconPolicy.reason.plus") },
  { name: "X", group: "Gombok", reason: t("iconPolicy.reason.x") },
  { name: "Check", group: "Gombok", reason: t("iconPolicy.reason.check") },
  { name: "Trash", group: "Gombok", reason: t("iconPolicy.reason.trash") },
  { name: "Pencil", group: "Gombok", reason: t("iconPolicy.reason.pencil") },
  { name: "Save", group: "Gombok", reason: t("iconPolicy.reason.save") },
  { name: "Upload", group: "Gombok", reason: t("iconPolicy.reason.upload") },
  { name: "Download", group: "Gombok", reason: t("iconPolicy.reason.download") },
  { name: "Mic", group: "Gombok", reason: t("iconPolicy.reason.mic") },
  { name: "Square", group: "Gombok", reason: t("iconPolicy.reason.square") },

  // Jelzések. Direction, state and attachment — not subject matter. A 3D
  // chevron points in exactly the same direction and takes twice the room.
  { name: "ChevronDown", group: "Jelzések", reason: t("iconPolicy.reason.chevronDown") },
  { name: "ChevronRight", group: "Jelzések", reason: t("iconPolicy.reason.chevronDown") },
  { name: "Search", group: "Jelzések", reason: t("iconPolicy.reason.search") },
  { name: "Sliders", group: "Jelzések", reason: t("iconPolicy.reason.sliders") },
  { name: "Eye", group: "Jelzések", reason: t("iconPolicy.reason.eye") },
  { name: "LockIcon", group: "Jelzések", reason: t("iconPolicy.reason.lockIcon") },
  { name: "ShieldAlert", group: "Jelzések", reason: t("iconPolicy.reason.shieldAlert") },
  { name: "Bell", group: "Jelzések", reason: t("iconPolicy.reason.bell") },
  { name: "MapPin", group: "Jelzések", reason: t("iconPolicy.reason.mapPin") },
  { name: "Paperclip", group: "Jelzések", reason: t("iconPolicy.reason.paperclip") },
  { name: "Link", group: "Jelzések", reason: t("iconPolicy.reason.link") },

  // Berendezés. The parts a screen is made of, none of which the user reads as
  // a picture of anything.
  { name: "Settings", group: "Berendezés", reason: t("iconPolicy.reason.settings") },
  { name: "Calendar", group: "Berendezés", reason: t("iconPolicy.reason.calendar") },
  { name: "CalendarDays", group: "Berendezés", reason: t("iconPolicy.reason.calendarDays") },
  { name: "Clock", group: "Berendezés", reason: t("iconPolicy.reason.clock") },
  { name: "Hourglass", group: "Berendezés", reason: t("iconPolicy.reason.hourglass") },
  { name: "LayoutGrid", group: "Berendezés", reason: t("iconPolicy.reason.layoutGrid") },
  { name: "Table", group: "Berendezés", reason: t("iconPolicy.reason.table") },
  { name: "Palette", group: "Berendezés", reason: t("iconPolicy.reason.palette") },
  // A custom background IMAGE. Not `Camera`, which exists as a content picture:
  // this one names the thing being chosen (a picture to put behind the app), not
  // the act of taking a photo, and the content set would show a camera for it.
  { name: "Image", group: "Berendezés", reason: t("iconPolicy.reason.image") },
  { name: "Type", group: "Berendezés", reason: t("iconPolicy.reason.type") },
  { name: "ClipboardList", group: "Berendezés", reason: t("iconPolicy.reason.clipboardList") },
  { name: "FileText", group: "Berendezés", reason: t("iconPolicy.reason.fileText") },
  { name: "History", group: "Berendezés", reason: t("iconPolicy.reason.history") },
  { name: "BarChart", group: "Berendezés", reason: t("iconPolicy.reason.barChart") },
  { name: "Lightbulb", group: "Berendezés", reason: t("iconPolicy.reason.lightbulb") },
  { name: "Smartphone", group: "Berendezés", reason: t("iconPolicy.reason.smartphone") },
  { name: "Phone", group: "Berendezés", reason: t("iconPolicy.reason.phone") },
  { name: "MessageCircle", group: "Berendezés", reason: t("iconPolicy.reason.messageCircle") },
  { name: "Briefcase", group: "Berendezés", reason: t("iconPolicy.reason.briefcase") },
  { name: "Wind", group: "Berendezés", reason: t("iconPolicy.reason.wind") },
  { name: "Ban", group: "Berendezés", reason: t("iconPolicy.reason.ban") },
  { name: "Radio", group: "Berendezés", reason: t("iconPolicy.reason.ban") },

  // Mérőszámok. These sit beside a NUMBER. The number is the information; the
  // icon only says which scale it is, and a 3D emoji beside a digit reads as
  // decoration competing with the value.
  { name: "Scale", group: "Mérőszámok", reason: t("iconPolicy.reason.scale") },
  { name: "Target", group: "Mérőszámok", reason: t("iconPolicy.reason.target") },
  { name: "Zap", group: "Mérőszámok", reason: t("iconPolicy.reason.zap") },
  { name: "Activity", group: "Mérőszámok", reason: t("iconPolicy.reason.activity") },
  // Batch A — a kvadráns-alvás kártya fejléce.
  { name: "Moon", group: "Mérőszámok", reason: t("iconPolicy.reason.moon") },
] as const;

/** Every chrome name, for a membership test. */
export const CHROME_ICON_NAMES: readonly string[] = CHROME_ICONS.map((c) => c.name);

/** The groups, in the order the Settings screen shows them. */
export const CHROME_GROUPS: readonly ChromeGroup[] = [
  "Gombok",
  "Jelzések",
  "Berendezés",
  "Mérőszámok",
] as const;

/**
 * The chrome list grouped for display.
 *
 * Derived from `CHROME_GROUPS` rather than from the order of `CHROME_ICONS`,
 * so a group can be added or reordered without a second list to keep in step.
 * A group with nothing in it is dropped rather than rendered empty.
 */
export function chromeByGroup(): { group: ChromeGroup; icons: ChromeIcon[] }[] {
  const out: { group: ChromeGroup; icons: ChromeIcon[] }[] = [];
  for (const group of CHROME_GROUPS) {
    const icons = CHROME_ICONS.filter((c) => c.group === group);
    if (icons.length > 0) out.push({ group, icons });
  }
  return out;
}

/** True when this icon is one that deliberately stays Lucide. */
export function isChromeIcon(name: string): boolean {
  return CHROME_ICON_NAMES.includes(name);
}

/** The recorded reason for a chrome icon, or undefined when it is content. */
export function chromeReason(name: string): string | undefined {
  return CHROME_ICONS.find((c) => c.name === name)?.reason;
}
