/**
 * Web font registry (Batch 5, P10b → revised in Batch 8).
 *
 * WHY SELF-HOSTED, NOT A CDN
 * This app makes a promise on its own Settings page: nothing leaves the device,
 * there is no account, no upload, no tracking. Loading typography from
 * fonts.googleapis.com would quietly break that promise — every first visit
 * would tell Google which IP opened a mood journal, and the app would stop
 * rendering correctly offline while a PWA that advertises offline support is
 * the whole point. So the woff2 files live in `public/fonts/` next to the
 * rest of the app's own assets, served from our own origin, and cached by our
 * own service worker. No network call ever leaves the site.
 *
 * WHY THE DEFAULT IS STILL THE SYSTEM STACK
 * `DEFAULT_FONT` is `system`, and that is the one decision in this file that
 * Batch 8 deliberately did NOT change. A webfont cannot load zero bytes, so
 * making Inter the default would hand every existing user a 130 kB download and
 * a different typeface without ever opening Settings — the exact opposite of
 * "nothing changes for anyone who never touches the picker". Inter is instead
 * marked `recommended`, so the picker can point at it while the untouched
 * default stays free and invisible. If that trade is ever revisited, it is a
 * one-line change here, and it is a product decision, not a technical one.
 *
 * WHY SPLIT INTO `FONTS` AND `HAND_FONTS`
 * Dancing Script is a decorative script face. Applied to buttons, nav labels or
 * form fields it is measurably harder to read, and this app's whole premise is
 * that it is large-type and easy to read (see its own meta description). So it
 * is not a row in the font picker at all: it is a separate, opt-in control that
 * changes the face of exactly three things — the note the user wrote, and the
 * two fields they write it in. Everything else stays in the selected sans.
 * Keeping it out of `FONTS` makes that structural rather than a rule someone
 * has to remember at each call site: a `fontFamily` of "dancing-script" is not
 * even a valid `FontId`.
 *
 * WHY ONE FILE IS NOT ALWAYS ENOUGH
 * Four of the five UI families ship as a single variable font per subset, so one
 * file covers the whole weight axis. Saira Condensed does not: it has no
 * variable version upstream, only static cuts, so each weight is its own file
 * and `FontFile` carries a `weight` of its own. Without that field a static
 * family would be registered as if it covered the axis, and every heading would
 * be synthesised fake-bold. The stylesheet asks for 600 and 800, which Saira
 * does not ship; `STATIC_BOLD_RANGE` covers that gap explicitly by declaring
 * Bold to stand in for 700–800, so the choice is visible here rather than
 * implied by a browser's nearest-weight rule.
 *
 * THE `latin-ext` SUBSET IS NOT OPTIONAL
 * Hungarian needs ő and ű (U+0151, U+0171), which live in latin-ext. Dropping
 * it would render exactly those two letters in a fallback face — a visible,
 * embarrassing half-and-half mixture in the language the whole UI is written in.
 *
 * AND THE SUBSET IS NOT PROOF EITHER
 * This header used to end "all five families were verified to cover both
 * characters", and that was false. Lato was offered for months while being
 * unable to render ő or ű at all: the upstream font has them, and Google's
 * `latin-ext` subset of Lato does not — it is the Central-European cut
 * (`ĄąĆćĘęŁłŃńŚśŠšŸŹźŻżŽžƒ`), and there is no pinned gstatic URL that serves a
 * Lato which can. Nothing caught it because the check that existed read the
 * `unicodeRange` STRING in this file, which said `U+0100-02BA` and was true —
 * the range is a claim, not a fact about the bytes. `src/lib/font-cmap.ts` now
 * reads the real character map out of each woff2, and
 * `tests/batch7f.test.ts` asserts the two characters are present. A family that
 * cannot spell Hungarian no longer gets into this file.
 *
 * WHY LATO WAS GONE, AND WHY IT IS BACK
 * It was not withdrawn for looking different. It was withdrawn because the app
 * could not ship it correctly without a subsetting step, and shipping a
 * typeface that drops two letters of the app's own language is worse than not
 * offering it. The promise made at the time was that the family would return in
 * the batch that subsets the fonts — and it does, in Batch 12.
 *
 * What changed is that it is now cut from the UPSTREAM TrueType, pinned by URL,
 * byte count and SHA-256 in `scripts/subset-ui-fonts.ts`, rather than from a
 * Google `woff2` subset. Google's `latin-ext` of Lato is the Central-European
 * cut and cannot spell ő and ű no matter what this registry claims about it;
 * subsetting cannot bring back a glyph that was never in the input. The
 * upstream font has all 3 023 of them, so the floor in the script — which
 * includes ő, ű, Ő and Ű — produces a Lato that spells Hungarian by
 * construction, and the script reads the character map back out of the bytes it
 * has just produced and refuses to write a file that cannot. That is the whole
 * difference between this entry and the one Batch 7f deleted: this one is
 * verified rather than trusted.
 *
 * LICENSING
 * Every family here — Inter, Montserrat, Roboto, Lato, Playfair Display, Lora,
 * Quicksand, Saira Condensed, JetBrains Mono and Dancing Script — is under the
 * SIL Open Font License 1.1. Roboto is the one that surprises people: it was
 * Apache 2.0 for years, but Google relicensed it to OFL and the `apache/roboto`
 * path in `google/fonts` is now a 404. The licence texts ship alongside the
 * binaries in `public/fonts/OFL-*.txt`, as OFL redistribution requires — Lato's
 * included, even though its binaries come from upstream TrueType rather than
 * from a Google subset, because the obligation is about redistribution and not
 * about which URL the bytes were fetched from.
 */

/** Every selectable UI face. `system` is the no-download default. */
export type FontId =
  | "system"
  | "inter"
  | "montserrat"
  | "roboto"
  | "lato"
  | "playfair-display"
  | "lora"
  | "quicksand"
  | "saira-condensed"
  | "jetbrains-mono";

import { t } from "./i18n";

/**
 * The visual family a face belongs to, which is what the picker groups by.
 *
 * The complaint this answers was that Inter, Montserrat and Roboto "look nearly
 * identical" — and they do, because they are all neutral grotesques. A list of
 * ten names in alphabetical order asks the user to already know the difference.
 * Grouping by kind makes the shape of the choice visible: four sans, two serif,
 * one rounded, one condensed, one monospaced. Someone who cannot tell the sans
 * from the serif apart can at least see that the serif ones are together.
 *
 * The handwriting face is deliberately NOT one of these. It is not a choice of
 * what the app looks like; it is a separate opt-in control that changes the
 * face of the user's own words and nothing else, and folding it into a
 * category would read as "pick one of these for the app".
 */
export type FontCategory = "sans" | "serif" | "rounded" | "condensed" | "mono";

/** Category order in the picker. Deliberately not alphabetical. */
export const FONT_CATEGORIES: readonly FontCategory[] = [
  "sans",
  "serif",
  "rounded",
  "condensed",
  "mono",
] as const;

/**
 * The heading for a category, as the user reads it.
 *
 * NOT HUNGARIAN, AND NOT KEYS. This comment used to say "the Hungarian
 * heading", which was simply wrong: "Sans", "Serif", "Rounded", "Condensed" and
 * "Mono" are the international typographic terms, the same ones every font tool
 * shows in every locale. Round 16 catalogued the NOTES under this table —
 * those are Hungarian copy — and left these alone on purpose: translating a
 * category away from the term its own faces are named after makes the picker
 * harder to use, not easier.
 *
 * The family `label:` values are the same kind of thing for the same reason:
 * "Inter" is a proper noun. `RETIRED_FONT_LABELS` is proper-noun memory —
 * it exists to remember the name the user READ — so translating it would
 * defeat its purpose. What IS copy is `label: "Rendszer"` and
 * `label: "Kikapcsolva"`, which name a state rather than a family, and every
 * `hint:` line.
 */
export const FONT_CATEGORY_LABELS: Readonly<Record<FontCategory, string>> = {
  sans: "Sans",
  serif: "Serif",
  rounded: "Rounded",
  condensed: "Condensed",
  mono: "Mono",
};

/**
 * One line saying what the group is for, shown under the heading. Five keys,
 * not five literals — this is the one part of the table above that is copy.
 */
export const FONT_CATEGORY_NOTES: Readonly<Record<FontCategory, string>> = {
  sans: t("font.categoryNote.sans"),
  serif: t("font.categoryNote.serif"),
  rounded: t("font.categoryNote.rounded"),
  condensed: t("font.categoryNote.condensed"),
  mono: t("font.categoryNote.mono"),
};

/** The handwriting face, or off. Deliberately not a `FontId`. */
export type HandFontId = "none" | "dancing-script";

/** One woff2 subset file of a font. */
export type FontFile = {
  /** Filename under `public/fonts/`. */
  file: string;
  /** Subset name, for humans and for the cache-friendly filename. */
  subset: "latin" | "latin-ext";
  /**
   * The CSS `font-weight` this file is registered under.
   *
   * A range like `"100 900"` for a variable font; a single value like `"400"`
   * for a static cut. It lives on the FILE rather than only on the family
   * because a family can mix the two — that is exactly Lato's situation.
   */
  weight: string;
  /** CSS unicode-range so the browser only downloads what text needs. */
  unicodeRange: string;
  /** On-disk size, so the picker can be honest about the cost. */
  bytes: number;
};

/** What a FontFace needs to be constructed — mirrors the DOM FontFace API. */
export type FontFaceDescriptors = {
  family: string;
  src: string;
  unicodeRange: string;
  weight: string;
};

export type FontDef = {
  id: FontId;
  /** UI label. Hungarian, like the rest of the app. */
  label: string;
  /** Which visual family this is, for the picker's grouping. */
  category: FontCategory;
  /** One line explaining the trade-off, shown under the option. */
  hint: string;
  /** CSS `font-family` value. Empty string for the system stack. */
  stack: string;
  /** FontFace family name to register; null when there is nothing to load. */
  family: string | null;
  /**
   * The weight axis a variable file covers, as a CSS font-weight descriptor.
   * Empty for `system` and for Saira Condensed, whose weights are per-file.
   */
  weightRange: string;
  /** Self-hosted subsets. Empty for `system`. */
  files: FontFile[];
  /**
   * Marked in the picker as the recommended webfont.
   *
   * NOT the same as the default: the default is `system` so that untouched
   * users download nothing (see the file header). This is a hint, nothing more.
   */
  recommended?: boolean;
};

/**
 * The pre-Batch-5 stack, verbatim. Kept as a named constant so `system` is
 * provably identical to what shipped before, and so the CSS fallback in
 * styles.css and this module can never drift apart.
 */
export const SYSTEM_FONT_STACK =
  '"Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';

/**
 * The selection used when nothing is stored, or when the stored value is junk.
 *
 * Inter, and this is a deliberate reversal of the Batch 5 and Batch 8 decision.
 * Those chose `system` so that a user who never opened the picker would
 * download zero font bytes and see nothing change. That reasoning was sound
 * but it optimised for the wrong thing: `system` is whatever the operating
 * system happens to pick, which is why the app looked different on every
 * device, and a mood journal's whole visual identity is its own typeface. So
 * the app now ships its own. The cost is real and accepted: 130 kB of gzip
 * once, on first load, for everyone — and a one-time move of anyone who had
 * deliberately chosen `system` onto Inter, which they can undo by picking
 * Rendszer again. That override is in `normalizeFontFamily`, not here.
 */
export const DEFAULT_FONT: FontId = "inter";

/** The default for the handwriting control: off, which costs nothing. */
export const DEFAULT_HAND_FONT: HandFontId = "none";

/**
 * Families that were offered and are gone now.
 *
 * A user who picked one of these has a stored id that no longer resolves. They
 * are moved to Inter rather than silently dropped to `system`: dropping to the
 * system stack would look like the setting was ignored, while Inter is the
 * other neutral, workhorse sans we still ship — the same kind of face they
 * chose. The move is announced once, with the name they actually read in the
 * picker, because a setting that quietly changes itself is worse than one that
 * says so.
 *
 * Lato joined the list in Batch 7f and left it again in Batch 12, when the
 * subsetter could cut it from the upstream TrueType instead of from a Google
 * cut that had already lost ő and ű. It is a smaller list than it was: the two
 * families still on it are there because Batch 8 chose a different direction,
 * not because anything was wrong with the files.
 *
 * A user whose stored id is `lato` needs no migration at all now — it resolves
 * to the family again, because `isFontId` is asked before this list is.
 */
export const RETIRED_FONTS: readonly string[] = ["manrope", "plus-jakarta-sans"];

/**
 * Why each retired family is gone, for the one-time announcement.
 *
 * Keyed by the name the user read in the picker rather than by id, because the
 * toast is the only place that explains the change and it has to use the word
 * the choice was made with. Lato's line is the honest one: the typeface was
 * fine, the file the app had was not.
 */
export const RETIRED_FONT_REASONS: Readonly<Record<string, string>> = {
  manrope: t("font.retiredReason.manrope"),
  "plus-jakarta-sans": t("font.retiredReason.plusJakartaSans"),
};

/**
 * The picker label each retired family had, for the same announcement.
 *
 * A separate map from the reasons because `fontDef("manrope")` answers the
 * SYSTEM stack — the family is gone from the registry, which is the whole point
 * — so asking the registry for its name returns the wrong one. The name the user
 * read has to be remembered, not looked up, or the toast would say "A(z)
 * Rendszer betűtípus már nem elérhető".
 */
export const RETIRED_FONT_LABELS: Readonly<Record<string, string>> = {
  manrope: "Manrope",
  "plus-jakarta-sans": "Plus Jakarta Sans",
};

/** Where a retired id goes. Inter, per decision. */
export const RETIRED_FONT_REPLACEMENT: FontId = "inter";

/**
 * Where a stored `system` goes.
 *
 * This one is not about a family that no longer exists — `system` is still
 * offered in the picker and still works. It is about the fact that it used to
 * be the default, so a stored `system` usually means "never chose", not "chose
 * the system face and wants to keep it". Moving those users to Inter once is
 * the deliberate visual refresh. A user who genuinely prefers the system face
 * picks Rendszer again after the first load and the value is then a real
 * choice, kept forever like any other.
 */
export const SUPERSEDED_SYSTEM_REPLACEMENT: FontId = "inter";

/** The `latin` range every family here shares. */
const LATIN_RANGE =
  "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";

/** The `latin-ext` range every family here shares. */
const LATIN_EXT_RANGE =
  "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF";

/**
 * Bold stands in for the whole 700–800 band, for a family that ships only 400
 * and 700 as static cuts.
 *
 * The stylesheet asks for 600 twelve times and 800 five times, and Saira
 * Condensed ships 100/200/…/900 only as separate files — two of which this app
 * carries. Left to the browser's nearest-weight rule an 800 would resolve
 * upward past the family entirely and land on a synthetic bold, which is
 * visibly heavier than the real headings beside it. Declaring Bold to serve
 * 700–800 means the extra weights resolve to a real cut, so a heading looks the
 * same whichever UI family is selected. 600 still resolves upward to 700, which
 * is a real bold rather than a synthesised one.
 *
 * This used to be Lato's constant, for the same reason and with the same
 * reasoning. The two families are unrelated; the problem is the same one, and
 * keeping the name would have tied a general rule to whichever family happened
 * to need it when it was written.
 *
 * Declared before `FONTS` because `FONTS` refers to it: a `const` is in its
 * temporal dead zone until its own statement runs, so a use above the
 * declaration would throw at module load.
 */
const STATIC_BOLD_RANGE = "700 800";

export const FONTS: FontDef[] = [
  {
    id: "system",
    label: t("font.systemLabel"),
    category: "sans",
    hint: t("font.systemHint"),
    stack: SYSTEM_FONT_STACK,
    family: null,
    weightRange: "",
    files: [],
  },
  {
    id: "inter",
    label: "Inter",
    category: "sans",
    hint: t("font.interHint"),
    stack: `"Inter", ${SYSTEM_FONT_STACK}`,
    family: "Inter",
    weightRange: "100 900",
    recommended: true,
    files: [
      {
        file: "inter-latin.woff2",
        subset: "latin",
        weight: "100 900",
        bytes: 37084,
        unicodeRange: LATIN_RANGE,
      },
      {
        file: "inter-latin-ext.woff2",
        subset: "latin-ext",
        weight: "100 900",
        bytes: 14768,
        unicodeRange: LATIN_EXT_RANGE,
      },
    ],
  },
  {
    id: "montserrat",
    label: "Montserrat",
    category: "sans",
    hint: t("font.montserratHint"),
    stack: `"Montserrat", ${SYSTEM_FONT_STACK}`,
    family: "Montserrat",
    weightRange: "100 900",
    files: [
      {
        file: "montserrat-latin.woff2",
        subset: "latin",
        weight: "100 900",
        bytes: 31500,
        unicodeRange: LATIN_RANGE,
      },
      {
        file: "montserrat-latin-ext.woff2",
        subset: "latin-ext",
        weight: "100 900",
        bytes: 16748,
        unicodeRange: LATIN_EXT_RANGE,
      },
    ],
  },
  {
    id: "roboto",
    label: "Roboto",
    category: "sans",
    hint: t("font.robotoHint"),
    stack: `"Roboto", ${SYSTEM_FONT_STACK}`,
    family: "Roboto",
    weightRange: "100 900",
    files: [
      {
        file: "roboto-latin.woff2",
        subset: "latin",
        weight: "100 900",
        bytes: 34676,
        unicodeRange: LATIN_RANGE,
      },
      {
        file: "roboto-latin-ext.woff2",
        subset: "latin-ext",
        weight: "100 900",
        bytes: 18340,
        unicodeRange: LATIN_EXT_RANGE,
      },
    ],
  },
  {
    id: "lato",
    label: "Lato",
    category: "sans",
    hint: t("font.latoHint"),
    stack: `"Lato", ${SYSTEM_FONT_STACK}`,
    family: "Lato",
    // Static, like Saira Condensed: upstream ships Regular and Bold as separate
    // TrueType files and no variable version, so the weights are per file and
    // the family axis stays empty. `scripts/subset-ui-fonts.ts` cuts both cuts
    // from the pinned upstream font — the reason this family is offered at all.
    weightRange: "",
    files: [
      {
        file: "lato-400-latin.woff2",
        subset: "latin",
        weight: "400",
        bytes: 31108,
        unicodeRange: LATIN_RANGE,
      },
      {
        file: "lato-400-latin-ext.woff2",
        subset: "latin-ext",
        weight: "400",
        bytes: 14348,
        unicodeRange: LATIN_EXT_RANGE,
      },
      {
        file: "lato-700-latin.woff2",
        subset: "latin",
        weight: STATIC_BOLD_RANGE,
        bytes: 30580,
        unicodeRange: LATIN_RANGE,
      },
      {
        file: "lato-700-latin-ext.woff2",
        subset: "latin-ext",
        weight: STATIC_BOLD_RANGE,
        bytes: 14044,
        unicodeRange: LATIN_EXT_RANGE,
      },
    ],
  },
  {
    id: "playfair-display",
    label: "Playfair Display",
    category: "serif",
    hint: t("font.playfairDisplayHint"),
    stack: `"Playfair Display", ${SYSTEM_FONT_STACK}`,
    family: "Playfair Display",
    weightRange: "400 900",
    files: [
      {
        file: "playfair-display-latin.woff2",
        subset: "latin",
        weight: "400 900",
        bytes: 32784,
        unicodeRange: LATIN_RANGE,
      },
      {
        file: "playfair-display-latin-ext.woff2",
        subset: "latin-ext",
        weight: "400 900",
        bytes: 14148,
        unicodeRange: LATIN_EXT_RANGE,
      },
    ],
  },
  {
    id: "lora",
    label: "Lora",
    category: "serif",
    hint: t("font.loraHint"),
    stack: `"Lora", ${SYSTEM_FONT_STACK}`,
    family: "Lora",
    weightRange: "400 700",
    files: [
      {
        file: "lora-latin.woff2",
        subset: "latin",
        weight: "400 700",
        bytes: 33292,
        unicodeRange: LATIN_RANGE,
      },
      {
        file: "lora-latin-ext.woff2",
        subset: "latin-ext",
        weight: "400 700",
        bytes: 13064,
        unicodeRange: LATIN_EXT_RANGE,
      },
    ],
  },
  {
    id: "quicksand",
    label: "Quicksand",
    category: "rounded",
    hint: t("font.quicksandHint"),
    stack: `"Quicksand", ${SYSTEM_FONT_STACK}`,
    family: "Quicksand",
    weightRange: "300 700",
    files: [
      {
        file: "quicksand-latin.woff2",
        subset: "latin",
        weight: "300 700",
        bytes: 24748,
        unicodeRange: LATIN_RANGE,
      },
      {
        file: "quicksand-latin-ext.woff2",
        subset: "latin-ext",
        weight: "300 700",
        bytes: 12564,
        unicodeRange: LATIN_EXT_RANGE,
      },
    ],
  },
  {
    id: "saira-condensed",
    label: "Saira Condensed",
    category: "condensed",
    hint: t("font.sairaCondensedHint"),
    stack: `"Saira Condensed", ${SYSTEM_FONT_STACK}`,
    family: "Saira Condensed",
    // Not a variable font: upstream ships static cuts only. Each file below
    // carries its own weight, and Bold stands in for 700-800.
    weightRange: "",
    files: [
      {
        file: "saira-condensed-400-latin.woff2",
        subset: "latin",
        weight: "400",
        bytes: 15952,
        unicodeRange: LATIN_RANGE,
      },
      {
        file: "saira-condensed-400-latin-ext.woff2",
        subset: "latin-ext",
        weight: "400",
        bytes: 8744,
        unicodeRange: LATIN_EXT_RANGE,
      },
      {
        file: "saira-condensed-700-latin.woff2",
        subset: "latin",
        weight: STATIC_BOLD_RANGE,
        bytes: 15676,
        unicodeRange: LATIN_RANGE,
      },
      {
        file: "saira-condensed-700-latin-ext.woff2",
        subset: "latin-ext",
        weight: STATIC_BOLD_RANGE,
        bytes: 8808,
        unicodeRange: LATIN_EXT_RANGE,
      },
    ],
  },
  {
    id: "jetbrains-mono",
    label: "JetBrains Mono",
    category: "mono",
    hint: t("font.jetBrainsMonoHint"),
    stack: `"JetBrains Mono", ${SYSTEM_FONT_STACK}`,
    family: "JetBrains Mono",
    weightRange: "400 800",
    files: [
      {
        file: "jetbrains-mono-latin.woff2",
        subset: "latin",
        weight: "400 800",
        bytes: 28724,
        unicodeRange: LATIN_RANGE,
      },
      {
        file: "jetbrains-mono-latin-ext.woff2",
        subset: "latin-ext",
        weight: "400 800",
        bytes: 7608,
        unicodeRange: LATIN_EXT_RANGE,
      },
    ],
  },
];

/** The handwriting registry. `none` first, because it is the default. */
export type HandFontDef = {
  id: HandFontId;
  label: string;
  hint: string;
  /**
   * The CSS `font-family` for the user's own words, or `null` for `none` —
   * which is why `--hand-font` simply keeps pointing at the UI stack.
   */
  stack: string | null;
  family: string | null;
  weightRange: string;
  files: FontFile[];
};

export const HAND_FONTS: HandFontDef[] = [
  {
    id: "none",
    label: t("font.handOffLabel"),
    hint: t("font.handOffHint"),
    stack: null,
    family: null,
    weightRange: "",
    files: [],
  },
  {
    id: "dancing-script",
    label: "Dancing Script",
    hint: t("font.dancingScriptHint"),
    stack: `"Dancing Script", ${SYSTEM_FONT_STACK}`,
    family: "Dancing Script",
    weightRange: "400 700",
    files: [
      {
        file: "dancing-script-latin.woff2",
        subset: "latin",
        weight: "400 700",
        bytes: 41088,
        unicodeRange: LATIN_RANGE,
      },
      {
        file: "dancing-script-latin-ext.woff2",
        subset: "latin-ext",
        weight: "400 700",
        bytes: 14640,
        unicodeRange: LATIN_EXT_RANGE,
      },
    ],
  },
];

/** Public base path for the self-hosted binaries. */
export const FONT_BASE = "/fonts/";

/**
 * The families warmed in the background after the app has loaded.
 *
 * WHY INTER AND THE FIVE NEW ONES, AND NOT ALL NINE
 * This is Option B of three ways to stop a download happening when the user
 * picks a face: inline every family as a data URI, preload them all at idle, or
 * preload the ones a user is likely to reach for. It is the third.
 *
 * Inter is here because it is the default, so it is already in flight on the
 * very first load; warming it a moment later costs nothing and closes the window
 * where a fast pick outruns it. The five new families are here because they are
 * the whole point of the batch — they are what a user opens the picker FOR, and
 * they are 274 kB against a 292 kB bundle, which is cheap to have ready and
 * expensive to wait for.
 *
 * Montserrat, Roboto and Dancing Script are not. They shipped in earlier
 * batches, nobody arrives hoping for them, and together they are 250 kB of
 * background traffic a user who never touches the picker would pay for. They
 * keep the path that has always worked: hover or focus in the picker loads the
 * family, and the pick itself waits for it. `tests/batch7f.test.ts` pins this
 * list, so adding a family does not quietly add background traffic, and dropping
 * one does not quietly break a pick.
 *
 * Batch C: Saira Condensed left this list. It was the last family over the
 * 250 kB background-traffic bound the batch sets (262 kB for six families);
 * without it the preload is 214 kB and the bound holds with margin. Nothing is
 * lost: Saira still loads on hover or focus in the picker, and picking it
 * waits for it exactly as before — the only change is that people who never
 * choose it no longer pay 48 kB of background bytes for it. That is the same
 * reasoning that keeps Montserrat and Roboto off this list.
 */
export const PRELOAD_FONT_IDS: readonly FontId[] = [
  "inter",
  "playfair-display",
  "lora",
  "quicksand",
  "jetbrains-mono",
] as const;

/** Total bytes the background preload will fetch, for the honest figure. */
export function preloadTotalBytes(): number {
  return PRELOAD_FONT_IDS.reduce((n, id) => {
    const def = fontDef(id);
    return n + def.files.reduce((m, f) => m + f.bytes, 0);
  }, 0);
}

/** Full public URL of a subset file. */
export function fontUrl(file: FontFile): string {
  return `${FONT_BASE}${file.file}`;
}

/** Narrow an arbitrary value (stored JSON, an old build) to a real FontId. */
export function isFontId(value: unknown): value is FontId {
  return typeof value === "string" && FONTS.some((f) => f.id === value);
}

/** Narrow an arbitrary value to a real HandFontId. */
export function isHandFontId(value: unknown): value is HandFontId {
  return typeof value === "string" && HAND_FONTS.some((f) => f.id === value);
}

/**
 * The families grouped for the picker, in `FONT_CATEGORIES` order.
 *
 * A category with no family in it is dropped rather than rendered as an empty
 * heading, so a category can be added to the union before anything fills it
 * without the UI growing an empty band.
 */
export function fontsByCategory(): { category: FontCategory; fonts: FontDef[] }[] {
  const out: { category: FontCategory; fonts: FontDef[] }[] = [];
  for (const category of FONT_CATEGORIES) {
    const fonts = FONTS.filter((f) => f.category === category);
    if (fonts.length > 0) out.push({ category, fonts });
  }
  return out;
}

/**
 * Resolve a stored value to a definition, falling back to the system default.
 * A corrupt or pre-Batch-5 settings blob must never leave the app fontless.
 */
export function fontDef(id: unknown): FontDef {
  return FONTS.find((f) => f.id === id) ?? FONTS[0]!;
}

/** Same, for the handwriting control. */
export function handFontDef(id: unknown): HandFontDef {
  return HAND_FONTS.find((f) => f.id === id) ?? HAND_FONTS[0]!;
}

/**
 * Turn whatever is stored in `settings.fontFamily` into a live `FontId`.
 *
 * Four cases, and the difference between the last three is the whole point:
 *   - a real id is kept;
 *   - a RETIRED id (Manrope, Plus Jakarta Sans) becomes Inter, because that
 *     user chose a face and should keep a face;
 *   - `system` becomes Inter, which is the one-time refresh below;
 *   - anything else — hand-edited JSON, a typo, a value from a future build —
 *     becomes the default.
 */
export function normalizeFontFamily(value: unknown): FontId {
  if (value === "system") return SUPERSEDED_SYSTEM_REPLACEMENT;
  if (isFontId(value)) return value;
  if (typeof value === "string" && RETIRED_FONTS.includes(value)) {
    return RETIRED_FONT_REPLACEMENT;
  }
  return DEFAULT_FONT;
}

/** The same treatment for the handwriting control, which has no retired ids. */
export function normalizeHandFont(value: unknown): HandFontId {
  return isHandFontId(value) ? value : DEFAULT_HAND_FONT;
}

/** The CSS `font-family` value for a stored id. Always ends in a real fallback. */
export function fontStack(id: unknown): string {
  return fontDef(id).stack;
}

/** The face for the user's own words, or null when handwriting is off. */
export function handStack(id: unknown): string | null {
  return handFontDef(id).stack;
}

/**
 * The FontFace descriptors needed to register a family, or `[]` for `system`.
 * Split out from the DOM work so the mapping is unit-testable without a browser.
 */
export function fontFaceDescriptors(id: unknown): FontFaceDescriptors[] {
  const def = fontDef(id);
  if (!def.family) return [];
  return def.files.map((f) => ({
    family: def.family!,
    src: `url("${fontUrl(f)}") format("woff2")`,
    unicodeRange: f.unicodeRange,
    weight: f.weight,
  }));
}

/** The same, for the handwriting family. */
export function handFaceDescriptors(id: unknown): FontFaceDescriptors[] {
  const def = handFontDef(id);
  if (!def.family) return [];
  return def.files.map((f) => ({
    family: def.family!,
    src: `url("${fontUrl(f)}") format("woff2")`,
    unicodeRange: f.unicodeRange,
    weight: f.weight,
  }));
}

/**
 * The single file worth preloading for a family: the `latin` subset at weight
 * 400, which covers the overwhelming majority of the Hungarian UI. `latin-ext`
 * is deliberately NOT preloaded — it only matters for ő/ű, and preloading it
 * would double the up-front cost to fix two letters.
 *
 * The weight matters now that a family can ship several files per subset: for
 * Saira Condensed, "the first latin file" would be whichever weight happened to
 * be listed first, and preloading Bold when the body text is Regular wastes a
 * download.
 */
function preloadFor(files: readonly FontFile[]): string | null {
  const latin = files.find((f) => f.subset === "latin" && f.weight === "400");
  if (latin) return fontUrl(latin);
  // A variable family declares its axis as a range, so it matches no exact
  // weight; for those, the single latin file is the right one.
  const firstLatin = files.find((f) => f.subset === "latin");
  return firstLatin ? fontUrl(firstLatin) : null;
}

export function preloadHref(id: unknown): string | null {
  return preloadFor(fontDef(id).files);
}

export function handPreloadHref(id: unknown): string | null {
  return preloadFor(handFontDef(id).files);
}

/** Bytes a family will cost on first use — shown in the picker as a hint. */
export function fontWeightKb(id: unknown): number {
  const files = fontDef(id).files;
  if (files.length === 0) return 0;
  return Math.round(files.reduce((n, f) => n + f.bytes, 0) / 1024);
}

/** Bytes the handwriting face costs, or 0 when it is off. */
export function handWeightKb(id: unknown): number {
  const files = handFontDef(id).files;
  if (files.length === 0) return 0;
  return Math.round(files.reduce((n, f) => n + f.bytes, 0) / 1024);
}
