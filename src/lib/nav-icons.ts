/**
 * Navigation icon registry (Batch 7b).
 *
 * WHY THIS EXISTS
 * Batch 7 gave the user four icon sets and applied them to the icons INSIDE
 * the app — the mood scale, the activity pills, the achievement badges, the
 * correlation columns. The bottom navigation kept its Lucide icons in every
 * set, so a user who chose a 3D emoji set saw a crisp monochrome nav bar above
 * a wall of 3D artwork. That reads as a bug, and the nav is the most
 * persistent piece of chrome on screen, so it is the first place a person
 * looks.
 *
 * SIX ITEMS, ONE PER TAB
 * This mirrors `TabId` exactly: `today`, `journal`, `insights`, `health`,
 * `tools`, `settings`. The health row arrived with the Egészség tab, between
 * Elemzés and Felfedezés in the bar's default order. The toolbox was the
 * Today tab's own collapsible until Batch 14
 * moved it to a tab of its own — the registry grew the row the same day the
 * tab arrived, and a test still asserts the two lists are the same set of ids.
 *
 * THE ARRAY ORDER IS THE DEFAULT BAR ORDER
 * `orderedTabs` (lib/navVisibility) derives the default from THIS array and
 * nowhere else, and `settings.tabOrder` is deliberately absent from
 * `DEFAULT_SETTINGS` — absence means "never rearranged", and the default is
 * then whatever this file says. So moving a row here moves the bar for every
 * reader who has not arranged it themselves, and changes nothing at all for a
 * reader who has (their stored permutation wins, verbatim). Batch 15's Phase 1
 * moved `Felfedezés` down beside `Beállítások`: the four journaling and
 * analysis tabs keep the first four places, and the two surfaces a reader
 * visits to CHANGE something — the toolbox and the settings — sit together at
 * the end, where a deliberate visit is expected rather than a daily one.
 *
 * THE LABEL IS THE TAB'S NAME, AND IT IS SAID TWICE
 * The row's `label` is what the bottom bar draws; the tab's own header takes
 * its title from the catalogue (`tools.title`). Two owners, one name, so the
 * two are asserted EQUAL in `tests/views/tools-split.test.ts` rather than kept
 * in step by hand — that is what caught this row the moment the name changed.
 *
 * WHY TWO FIELDS AND NOT A Partial<Record<IconSetId, string>>
 * The first draft had one map from set id to "a thing", which quietly mixed
 * two different key spaces: for `system` the value is the emoji CHARACTER the
 * OS draws, and for `fluent` it is the artwork STEM. Feeding either one into
 * the other silently produced nothing — `glyphHref("fluent", "seedling")`
 * looks up "seedling" in the content registry, does not find it, and returns
 * undefined, so the icon vanished rather than falling back. Two named fields
 * make it impossible to pass one where the other belongs, and both are
 * required, so a half-filled row cannot be written at all.
 *
 * ONLY TWO SETS NEED A ROW HERE
 * `lucide` draws from the row's `lucide` name, and a user who has chosen no
 * set at all gets Lucide — the pre-Batch-7 appearance, which must stay exactly
 * that. Those two cases need no data in this file.
 */
import type { TabId } from "../types";

/** One bottom-nav item, and how each artwork set draws it. */
export type NavIconDef = {
  /** The tab this row is. Same ids as `TabId`. */
  tab: TabId;
  /** The visible label, unchanged — the nav stays labelled, not icon-only. */
  label: string;
  /** The Lucide component name. The default set, and every fallback. */
  lucide: string;
  /**
   * The literal character the `system` set draws.
   *
   * Not required to be one of the 38 content glyphs: ⚙️ is a perfectly good
   * Unicode character the OS renders perfectly well, and it has no business
   * being in a registry of emoji the app stores in its data.
   */
  character: string;
  /** The Fluent `modern` artwork stem, e.g. `seedling`. */
  fluent: string;
  /**
   * Optional one-line description of what the tab holds (added with the
   * `health` row). Plain text, never a catalogue key — the registry has always
   * been language-free of `t()`, and a summary here is the bar's own copy.
   */
  summary?: string;
};

export const NAV_ICONS: NavIconDef[] = [
  {
    tab: "today",
    label: "Ma",
    lucide: "Sprout",
    // `seedling` is the same object Lucide's `Sprout` is, so switching to
    // Fluent changes the rendering style without changing what the icon means.
    character: "🌱",
    fluent: "seedling",
  },
  {
    tab: "journal",
    label: "Napló",
    lucide: "CalendarDays",
    character: "📔",
    fluent: "notebook-with-decorative-cover",
  },
  {
    tab: "insights",
    label: "Elemzés",
    lucide: "Brain",
    // An exact name match with the Lucide icon, which is the best kind of
    // mapping to have: nothing to interpret, nothing to get wrong.
    character: "🧠",
    fluent: "brain",
  },
  {
    tab: "health",
    label: "Egészség",
    lucide: "Heart",
    // `blue-heart` is the Fluent artwork of the SAME 💚/💙 heart Lucide's
    // `Heart` draws (see `lib/iconsets`' glyph table), so switching sets
    // changes the style without changing what the icon means.
    character: "💙",
    fluent: "blue-heart",
    summary: "Egészség és jólét",
  },
  {
    tab: "tools",
    label: "Felfedezés",
    lucide: "Briefcase",
    // 🧰 is a real Unicode character the OS draws; it is not one of the
    // content glyphs the app stores in its data, which is why it lives here
    // and not in GLYPHS.
    character: "🧰",
    fluent: "briefcase",
  },
  {
    tab: "settings",
    label: "Beállítás",
    lucide: "Settings",
    // There is no gear in the Fluent set. `counterclockwise-arrows-button` is
    // Fluent's adjustments mark and reads correctly at 24px; falling back to
    // Lucide here would have left one monochrome icon in an otherwise 3D bar.
    character: "⚙️",
    fluent: "counterclockwise-arrows-button",
  },
];

/**
 * The nav row for a tab, or undefined.
 *
 * Tabs are a closed union and a test asserts the two lists agree, so the
 * undefined case is unreachable today; it is returned rather than thrown so a
 * future tab cannot crash the whole navigation bar.
 */
export function navIconDef(tab: TabId): NavIconDef | undefined {
  return NAV_ICONS.find((n) => n.tab === tab);
}

/** The character the `system` set draws for a tab. */
export function navCharacter(tab: TabId): string | undefined {
  return navIconDef(tab)?.character;
}

/** The Fluent artwork stem for a tab. */
export function navFluentStem(tab: TabId): string | undefined {
  return navIconDef(tab)?.fluent;
}
