/** Core data types of the app. All user data stays on the device (localStorage). */
import { DEFAULT_FONT, type FontId, type HandFontId } from "./lib/fonts";
import type { IconSetId } from "./lib/iconsets";
import type { Locale } from "./lib/i18n";
import type { AllergenId } from "./lib/nutrition";


export type MoodLevel = 1 | 2 | 3 | 4 | 5;

/**
 * The four quadrants of the Mood Meter (Batch A — Recording 2.0).
 *
 * Names follow the two axes: the first word is the ENERGY half (high/low),
 * the second the PLEASANTNESS half (positive/negative).
 */
export type MoodQuadrant = "high-neg" | "high-pos" | "low-neg" | "low-pos";

/**
 * The context panel's three dimensions (Batch A — Recording 2.0).
 * Each entry stores string arrays; the label registries live in
 * `lib/contextOptions`.
 */
export type EntryContext = {
  withWhom?: string[];
  where?: string[];
  doing?: string[];
};

export type Reflection = {
  feeling: string;
  stressReason: string;
  need: string;
};

export type Vitals = {
  /** Resting heart rate in beats per minute. */
  restingHr: number | null;
  /** Heart rate variability (RMSSD) in milliseconds. */
  hrv: null | number;
  /** Hours of sleep, e.g. 7.5 */
  sleepHours: number | null;
};

export type Entry = {
  id: string;
  /** ISO date "YYYY-MM-DD"; entries are unique per day. */
  date: string;
  mood: MoodLevel;
  /** 1–10 stress slider. */
  stress: number;
  /** 1–10 energy slider. */
  energy: number;
  note: string;
  tags: string[];
  emotions: string[];
  activities: string[];
  reflection: Reflection;
  vitals: Vitals;
  source: "manual" | "voice" | "import";
  createdAt: number;
  updatedAt: number;
  /** Photos/audio attached to this entry (content lives in lib/attachments). */
  attachments?: Attachment[];
  /** Values for enabled modular trackers (definitions in lib/trackers). */
  trackerValues?: TrackerState;
  /*
   * Batch A, Recording 2.0 (all OPTIONAL, purely additive):
   *
   * The 4-quadrant flow records coordinates on a 1-10 x 1-10 grid (the old
   * `mood` level stays as the fallback recorder and remains required).
   *
   * NAMING NOTE: the spec calls the meter's Y axis "energy", but `Entry`
   * has had a REQUIRED `energy` (the 1–10 daily-energy slider) since v2 —
   * writing meter coordinates into it would overwrite live user data during
   * migration. The coordinate is stored as `moodEnergy` instead; the
   * semantics the spec asks for are unchanged (see `quadrantFromCoords`).
   *
   * Every new field is optional so a v2 record reads back unchanged, and the
   * old flow keeps writing records that stay valid without these.
   */
  /** Mood Meter Y axis, 1–10 (spec name: energy; renamed to avoid a collision). */
  moodEnergy?: number;
  /** Mood Meter X axis, 1–10. */
  pleasantness?: number;
  /** Quadrant derived from the coordinates; see `quadrantFromCoords`. */
  quadrant?: MoodQuadrant;
  /** The single emotion chosen in step 2 (or the user's own wording). */
  emotion?: string;
  /** Intensity of `emotion`, 1–10. */
  emotionIntensity?: number;
  /** Step 3 selections; every dimension independent. */
  context?: EntryContext;
};

export type AttachmentKind = "photo" | "audio" | "video";

export type Attachment = {
  id: string;
  kind: AttachmentKind;
  createdAt: number;
  /** Original file name, when known (optional). */
  name?: string;
};

export type CustomActivity = {
  id: string;
  icon: string;
  label: string;
};

/*
 * MIRRORED FROM `lib/trackers.ts` — DELIBERATELY, AND IT MUST STAY IN STEP.
 *
 * `Entry.trackerValues` is declared here while the component layer builds its
 * values against the copy in `lib/trackers`, so the two unions have to be the
 * same type or `TodayView` cannot hand a `TrackerState` to `Entry`. Re-exporting
 * the other one instead would make `types` import `lib/trackers`, which imports
 * `lib/customTrackers`, which already refers back here — a cycle for two type
 * declarations that are four lines each. So they are duplicated, and
 * `tests/batch7e.test.ts` asserts the two sets of `kind`s are equal, which is
 * what makes the duplication safe rather than merely convenient.
 */
export type TrackerInputKind = "checkbox" | "slider" | "text" | "number" | "select" | "flags";

export type TrackerValue =
  | { kind: "checkbox"; value: boolean }
  | { kind: "slider"; value: number }
  | { kind: "text"; value: string }
  /** `null` means NOT RECORDED. See the header of `lib/trackers`. */
  | { kind: "number"; value: number | null }
  /** `""` is the synthetic "nothing chosen" option every select leads with. */
  | { kind: "select"; value: string }
  | { kind: "flags"; value: Record<string, boolean> };

export type TrackerState = { [trackerId: string]: TrackerValue };

/** Daily goal ("Moodfit" style targets). */
export type Goal = {
  id: string;
  text: string;
  done: boolean;
  date: string;
};

export type DailyQuestion = {
  date: string;
  question: string;
  answer: string;
};

export type Medication = {
  id: string;
  name: string;
  dose: string;
  times: string[];
  /** Batch 3: per-medication reminder switch. Absent or true = ON. */
  remind?: boolean;
};

export type MedicationCheck = {
  /** "2026-05-01" -> { "medId": true } */
  [date: string]: { [medId: string]: boolean };
};

export type Profile = {
  name: string;
  goal: string;
};

/** Switchable visual themes (Phase 1 design system). */
export type ThemeName =
  | "light"
  | "dark"
  | "warm"
  | "vibrant"
  | "cool"
  | "graphite"
  | "lavender"
  | "coconut"
  | "karma"
  | "sunset"
  | "forest"
  | "sea"
  | "lilac"
  | "gold"
  | "custom"
  | "auto";

/** Keys of the design-token palette a custom theme may override. */
export type CustomThemeKey =
  | "bg"
  | "bgSoft"
  | "surface"
  | "surface2"
  | "ink"
  | "inkSoft"
  | "line"
  | "brand"
  | "brandStrong"
  | "brandSoft"
  | "accent"
  | "danger"
  | "dangerSoft"
  | "ok";

/** User-defined colors for the "custom" theme (hex strings). */
export type CustomTheme = Partial<Record<CustomThemeKey, string>>;

export type Settings = {
  /** Show the "Energia & alvás" module on Today. */
  energyModule: boolean;
  /** Show vitals (HR/HRV) fields and insights. */
  vitalsModule: BearableToggle;
  /** Show medication tracking. */
  medsModule: boolean;
  /** Show the reflection (CBT-style) card. */
  reflectionModule: boolean;
  /** Daily reminder time in "HH:mm" (local device notification). */
  reminder: { enabled: boolean; time: string };
  /** Multi-generational accessibility: larger text sizes. */
  textSize: "normal" | "large" | "xlarge";
  /**
   * Chosen typeface (Batch 5, P10b). Optional so a pre-Batch-5 settings blob
   * stays valid without a migration; `DEFAULT_SETTINGS` fills it in, and
   * `lib/fonts` validates it on read.
   *
   * Two kinds of invalid value are handled differently on purpose: a corrupt
   * one falls back to "system" (free, invisible), while a RETIRED one — a
   * family Batch 8 removed — becomes Inter, so a user who deliberately chose a
   * typeface keeps a typeface. See `normalizeFontFamily`.
   */
  fontFamily?: FontId;
  /**
   * Chosen handwriting face for the user's own notes (Batch 8).
   *
   * Optional and defaulting to "none", so nothing is downloaded until the user
   * asks for it. It is a separate field from `fontFamily` rather than a member
   * of the same union, which is what makes it structurally impossible for a
   * script face to become the app's UI font.
   */
  handFont?: HandFontId;
  /**
   * Chosen icon/emoji set (Batch 7, P12).
   *
   * DELIBERATELY ABSENT from `DEFAULT_SETTINGS`, and that is the whole point:
   * an absent value means "the user never chose", and renders the literal
   * character — exactly what the app looked like before Batch 7. Writing a
   * default here would silently opt every existing user into a set the first
   * time anything touched their settings, which is the "sees zero change
   * until they explicitly switch" promise broken at the storage layer.
   *
   * A corrupt or unknown value is coerced to `lucide` in `lib/store` at load,
   * so it can never reach the picker or a render.
   */
  iconSet?: IconSetId;
  /**
   * The language the reader chose in Settings (Phase 2), or absent for "never
   * chose" — which reads as Hungarian, the app's own voice and the catalogue
   * `TranslationKey` is derived from.
   *
   * ABSENT RATHER THAN `"hu"`, for the reason `iconSet` above is: there is a
   * difference between a reader who picked Hungarian and one who has never
   * opened the picker, and only the second one is a reader whose language the
   * app should be free to keep in step with a future default. Writing `"hu"`
   * into `DEFAULT_SETTINGS` would erase that difference at the storage layer,
   * where nothing downstream could recover it.
   *
   * A present-but-unknown value is CORRUPTION and is deleted by
   * `lib/store`'s `normalizeSettings`, exactly as a bad `iconSet` is: a locale
   * this build does not have cannot be rendered without inventing a catalogue
   * for it, and falling back to the default rather than to absence keeps the
   * "unset" meaning intact.
   */
  locale?: Locale;
  /** Extra contrast theme for low-vision users. */
  highContrast: boolean;
  /**
   * Hide the bottom navigation while the reader scrolls down, and bring it
   * back the moment they scroll up (Batch 7d).
   *
   * OFF BY DEFAULT, and unlike `iconSet` this one is safe to default rather
   * than leave absent: a boolean has two states, so "absent" and "false" are
   * the same answer, and there is no third meaning to protect. The reason for
   * the default is the same either way — a navigation that hides itself is a
   * change to how the app feels, and nobody asked for it.
   *
   * It has no effect while `prefers-reduced-motion: reduce` is set, and no
   * effect above the desktop breakpoint, where the nav is a sticky bar at the
   * top rather than a bar at the bottom. See `lib/navVisibility`.
   */
  autoHideNav: boolean;
  /**
   * Batch 11 — the bottom nav's tab order, as the user arranged it in
   * Settings. OPTIONAL with every later field's reasoning: an absent value
   * means "the user never rearranged anything", and the nav then draws the
   * registry's default order untouched — the pre-Batch-11 appearance, which
   * must stay exactly that. Content tolerance lives in `orderedTabs`
   * (lib/navVisibility): unknown ids are dropped, missing ids are appended in
   * default position, duplicates collapse — the same normalisation rule
   * `enabledTrackers` follows. A non-array blob is dropped wholesale by the
   * store's `normalizeSettings`, so a hand-edited export cannot crash boot.
   */
  tabOrder?: TabId[];
  /**
   * Per-tab section order, as ids the owning view named them. Same contract as
   * `tabOrder` above, over a different shape: this is a MAP of arrays rather
   * than one array, so the store has a second thing to repair — a non-object
   * `sectionOrder` drops the whole field, and a per-tab value that is not an
   * array drops just that tab.
   *
   * The contents are not validated here either. A section id that no longer
   * exists is dropped by `orderSections` (lib/sectionOrder), which also puts a
   * renamed section back in its place instead of losing it.
   */
  sectionOrder?: Partial<Record<TabId, SectionId[]>>;
  /** Active visual theme; applies instantly across the app. */
  theme: ThemeName;
  /**
   * The user's own background image, as an attachment id — NOT a data URL.
   *
   * The bytes live in the background image's own store
   * (`belso-iranytu-background`, `lib/imageBackground`), beside the journal
   * photos rather than inside them, so there is one image pipeline but two size
   * caps and two deletion paths. Storing the data URL here instead would put it
   * in `AppData`, which is exported and re-imported as JSON: every export would
   * then carry the image, and the JSON import path has a quota this setting
   * does not.
   *
   * Absent means no image. The store drops any value that is not a non-empty
   * string, so a corrupt id shows the empty state instead of a broken image.
   */
  backgroundImage?: string;
  /**
   * How opaque the scrim over the background image is, 0–1.
   *
   * A PLACEHOLDER control, not a contrast guarantee: the value is applied
   * faithfully but nothing derives it from the picture's own brightness. What
   * IS guaranteed is the polarity — the theme's background decides whether the
   * scrim is light or dark, so "light scrim + dark text" or "dark scrim + light
   * text" holds for every picture including a pathological one. See
   * `backgroundTint` for the half of it the picture does decide, and
   * `lib/imageBackground` for where the real engine plugs in. Always a number
   * so `null` never reaches the `rgba()` it is composed into.
   */
  backgroundScrim?: number;
  /**
   * How far the picture is softened, 0–1, and 0.25 by default.
   *
   * A default rather than an opt-in because the feature is unusable without it:
   * a sharp photograph behind a UI is not a backdrop, it is a competitor, and
   * the reader who did not want one can drag it to zero. Stored as a fraction
   * rather than as pixels so the slider is a proportion like every other slider
   * in the app; `MAX_BLUR_PX` is where the scale tops out.
   */
  backgroundBlur?: number;
  /**
   * The picture's average colour, as `"r, g, b"`.
   *
   * Read once when the picture is picked — see `sampleTint` — and stored because
   * the scrim needs it on every render and at every theme, and re-decoding a
   * full-screen JPEG to average it again would be the most expensive thing in
   * the app for the least visible result.
   *
   * It is a tint, not a colour: `deriveScrimRgb` blends it a third of the way
   * toward the polarity the theme needs, so it can change which colour the
   * scrim is and never which half of the space it is in. Absent is normal — no
   * picture, or a colour that could not be read — and reads as the flat
   * polarity scrim that shipped before tints existed.
   */
  backgroundTint?: string;
  /**
   * Which palette the scrim is mixed from: the picture's, or the theme's.
   *
   * This is the question a custom theme and a background image together
   * actually raise — the reader has two things that both want to be the
   * palette — and it is asked once, here, rather than answered differently by
   * each of them. The picture wins by default because a scrim carrying the
   * picture's own colour looks deliberate where a flat one looks like a bug,
   * and because it survives a theme change: the picture does not change, so
   * neither does the tint.
   */
  backgroundPalette?: "image" | "theme";
  /**
   * How the picture is fitted to the viewport: `cover`, `contain`, or the
   * default `soft`.
   *
   * `soft` is `contain` on top of a blurred, enlarged copy of the SAME picture
   * filling the bands, so the whole photograph arrives sharp and the backdrop
   * still reaches both edges. The retired `auto` is not listed because a stored
   * one is repaired rather than respected: it drew the picture at its intrinsic
   * size with no fitting at all, which for a large backdrop is a sharper
   * `cover`, not an alternative to it.
   *
   * Optional for the same reason `backgroundPalette` is: a blob written before
   * this field existed is still a valid blob, and "absent" is what the store
   * reads as `DEFAULT_SETTINGS.backgroundFit`. The union is written out rather
   * than imported because `lib/imageBackground` reaches back into this file,
   * and the type is the cheaper of the two directions to duplicate — which is
   * the same call `backgroundPalette` already made above.
   */
  backgroundFit?: "cover" | "contain" | "soft";
  /**
   * How far the CARDS fade over the backdrop, 0–1.
   *
   * Not the scrim: the scrim decides how much of the PICTURE shows, this
   * decides how much of the app's own card surface does. Optional for the same
   * reason every field here is — a blob written before it existed is still
   * valid, and absence reads as the default, which is 0.
   *
   * Independent of the scrim by design: the scrim slider decides how much of
   * the PICTURE shows, this one decides how much of the app's own card surface
   * does, and neither moves the other. Where the card is gone the text stands
   * on the scrim the reader set — the same ground the app's own background
   * text uses, which is the coupling-free guarantee.
   */
  backgroundCardTransparency?: number;
  /** Color overrides used when theme === "custom". */
  customTheme: CustomTheme;
  /** Modular trackers turned on (ids from lib/trackers). */
  enabledTrackers?: string[];
  /**
   * Önreflexiós kérdőív (Batch 6). Optional so a pre-Batch-6 settings blob
   * stays valid without a migration. OFF by default: turning it on is gated
   * behind the consent screen, and turning it off wipes the stored log.
   *
   * Note what is NOT here: the assessments themselves. They live in their own
   * localStorage key (lib/assessmentStore) precisely so no field on the
   * profile can ever hold a result.
   */
  assessmentsEnabled?: boolean;
  /**
   * Automatic weather (Batch 8b). All three fields are OPTIONAL with the same
   * reasoning as `iconSet`: a pre-Batch-8b blob stays valid, and — more
   * importantly — an absent value means "the user never decided", which is
   * the one state a default of `true` would erase and a default of `false`
   * would only paper over. The UI reads `=== true`, so a missing field and an
   * explicit `false` both render as off, but only the explicit `true` ever
   * sends a request.
   *
   * The three fields are one feature and are written together: turning the
   * module off also clears the GPS half, so a user who says "no" once does
   * not leave coordinates-permission implied in storage.
   */
  weatherApiEnabled?: boolean;
  /**
   * The city the weather API is keyed by, typed by the user. The DEFAULT —
   * geolocation is the opt-in, not this. Empty means "not set", and the
   * module then fills nothing rather than guessing a city.
   */
  weatherCity?: string;
  /**
   * Browser geolocation, behind a SECOND explicit opt-in. Unreadable while
   * `weatherApiEnabled` is false: the Settings card does not even render the
   * control, and `fetchWeatherFor` never sees a GPS location in that state.
   */
  weatherUseGps?: boolean;
  /**
   * Batch 9 — smartwatch import: create entries for imported days that have
   * no entry yet. OPTIONAL with the weather fields' reasoning: an absent
   * value means "the user never decided", and the default is the conservative
   * fill-existing-only semantics the batch was specified with (kept through
   * two user decisions). The card reads `=== true`.
   */
  healthImportStubs?: boolean;
  /**
   * Batch 10 — food photo AI (BYOK). OPTIONAL, `=== true` is the only on:
   * without explicit consent the capture UI does not exist, the same
   * structural gate the weather module uses. The API key itself is NOT a
   * settings field — it lives under its own localStorage key (lib/foodAi)
   * so no export/copy of app data ever carries it.
   */
  foodAiEnabled?: boolean;
  /**
   * Batch A — which mood recorder the Today card opens. OPTIONAL with the
   * `iconSet` reasoning: an absent value means "the user never chose", and
   * the absence IS the new-flow default — so a pre-Batch-A settings blob
   * renders the new flow without a migration writing a value the user never
   * picked, and switching to the old scale is the only stored decision.
   */
  moodFlow?: "new" | "old";
  /**
   * Batch 15 — the allergens the reader marked, from `lib/nutrition`'s ten.
   *
   * OPTIONAL with every later field's reasoning: absent means "marked none",
   * which is the state every existing reader is in, and the meal card then
   * shows no warning at all. It is a SET of facts rather than an arrangement,
   * so unlike `tabOrder` the store repairs it strictly — an unknown id is
   * dropped at load, because an allergen id the rule does not know would be a
   * marking that silently warns about nothing.
   */
  foodAllergies?: AllergenId[];
};

/** Kept as an alias so future toggles can share the same shape. */
export type BearableToggle = boolean;

export const DEFAULT_SETTINGS: Settings = {
  energyModule: true,
  vitalsModule: false,
  medsModule: false,
  reflectionModule: true,
  reminder: { enabled: false, time: "20:00" },
  textSize: "normal",
  fontFamily: DEFAULT_FONT,
  highContrast: false,
  autoHideNav: false,
  theme: "light",
  customTheme: {},
  // No image (absent), and a scrim strong enough that body text stays legible
  // over an arbitrary picture. `backgroundImage` is deliberately NOT listed:
  // "absent" is the whole state of having no image, and a `null` default would
  // be a third thing for the store to have to explain.
  //
  // The blur has a default because the feature is unusable without it, and the
  // palette has one because the picture's own colour is the better of the two
  // without the reader having to choose. `backgroundTint` is NOT listed for the
  // same reason as the image: there is no tint until there is a picture, and
  // that is absence, not a default.
  backgroundScrim: 0.55,
  backgroundBlur: 0.125,
  backgroundPalette: "image",
  // The soft fill, which is the only one of the three answers that carries
  // both halves of the report: `contain` alone leaves the bands, `cover`
  // alone magnifies the picture until it looks soft.
  backgroundFit: "soft",
  backgroundCardTransparency: 0,
  enabledTrackers: ["sleep", "symptoms"],
  assessmentsEnabled: false,
};

export type TabId = "today" | "tools" | "journal" | "insights" | "health" | "settings";

/** A section id belongs to the view that owns it; see lib/sectionOrder. */
export type SectionId = string;

export type AppData = {
  version: number;
  entries: Entry[];
  goals: Goal[];
  dailyQuestion: DailyQuestion | null;
  medications: Medication[];
  medicationChecks: MedicationCheck;
  profile: Profile;
  settings: Settings;
};
