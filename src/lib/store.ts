import type {
  AppData,
  Entry,
  Goal,
  Medication,
  Profile,
  Settings,
} from "../types";
import { DEFAULT_SETTINGS } from "../types";
import { RETIRED_FONTS, isHandFontId, normalizeFontFamily } from "./fonts";
import { RETIRED_ICON_SETS, RETIRED_ICON_SET_REPLACEMENT } from "./iconsets";
import { isIconSetId } from "./iconsets";
// The allergen ids the reader may mark, from the module that owns the rule.
// Imported rather than re-listed here for the reason every registry in this
// codebase is imported: a second copy is a second thing to keep in step, and
// an id dropped from one would live on in the other.
import { ALLERGEN_IDS } from "./nutrition";
import { isThemeName } from "./themes";
import { todayISO } from "./dates";
import { mapLegacyMood } from "./mood";
import { runMoodV2Migration } from "./migration/mood-v2";
import { removeAttachments } from "./attachments";
import { parseTint } from "./imageBackground";
// The two halves of one decision: `DEFAULT_LOCALE` is what "no choice" means,
// and `setActiveLocale` is what puts the choice where `lib/i18n` can read it
// before any React code has run. See that module's header for why the language
// is mirrored instead of imported.
import { DEFAULT_LOCALE, isLocale, setActiveLocale } from "./i18n";

const KEY = "belso-iranytu-data-v2";

/* ---------------------------- defaults ---------------------------- */

export const DEFAULT_ACTIVITIES = [
  "🚶 Mozgás",
  "👥 Társaság",
  "🧘 Relaxáció",
  "💻 Munka",
  "🏠 Otthon",
  "📚 Tanulás",
  "🎵 Zene",
  "🌿 Természet",
];

export const DEFAULT_EMOTIONS = [
  "Öröm",
  "Nyugalom",
  "Hála",
  "Aggodalom",
  "Düh",
  "Szomorúság",
];

/**
 * Batch A — Recording 2.0: emotions a user added via the vocabulary step's
 * "Egyéb" (Other) bubble, persisted under their own localStorage key.
 *
 * Separate from `DEFAULT_EMOTIONS` (the old flow's fixed chips) so the old
 * recorder's palette can never be modified by a custom addition — the same
 * two-owner split the fonts and icon sets use. Validation mirrors the rest
 * of the store: a non-array blob or junk rows are dropped silently.
 */
export function loadCustomEmotions(): string[] {
  try {
    const raw = localStorage.getItem("belso-iranytu-emotion-vocab");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((s) => (typeof s === "string" ? s.trim() : ""))
      .filter(Boolean)
      .slice(0, 100);
  } catch {
    return [];
  }
}

/** Persist the custom-emotion list; called by the vocabulary step on add. */
export function saveCustomEmotions(list: string[]): void {
  try {
    localStorage.setItem(
      "belso-iranytu-emotion-vocab",
      JSON.stringify(list.filter((s) => typeof s === "string" && s.trim().length > 0).slice(0, 100)),
    );
  } catch {
    // storage full or unavailable — the session keeps working in memory
  }
}

/* ------------------------- storage helpers ------------------------ */

export function emptyData(): AppData {
  return {
    version: 2,
    entries: [],
    goals: [],
    dailyQuestion: null,
    medications: [],
    medicationChecks: {},
    profile: { name: "", goal: "" },
    settings: { ...DEFAULT_SETTINGS },
  };
}

function read(): AppData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return migrateLegacy();
    const parsed = JSON.parse(raw) as Partial<AppData>;
    return {
      ...emptyData(),
      ...parsed,
      settings: normalizeSettings(parsed.settings),
      entries: Array.isArray(parsed.entries) ? parsed.entries.map(normalizeEntry) : [],
    };
  } catch {
    return emptyData();
  }
}

function write(data: AppData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // storage full or unavailable — the UI keeps working in memory
  }
}

/**
 * Merge stored settings over the defaults, validating the three fields a bad
 * write can actually break rendering: `fontFamily`, `handFont` and `iconSet`.
 * An unknown value (hand-edited JSON, a build that shipped a different
 * registry) is coerced HERE, at load, so it can never reach the picker or a
 * render — and so the next save writes the corrected value.
 *
 * `fontFamily` gets `normalizeFontFamily` rather than a plain validity check,
 * because a value can be invalid AND still be something the user chose: a
 * family that Batch 8 retired is a deliberate selection, and it is moved to its
 * successor instead of being thrown away. Only genuinely junk falls to the
 * free default.
 *
 * `iconSet` is the one field where a corrupt value is NOT replaced by a
 * default the user never chose. An absent value is meaningful: it is what
 * makes the app look exactly as it did before the user picked a set. So
 * absent stays absent, and only a present-but-invalid value is corrected.
 */
function normalizeSettings(stored: Partial<Settings> | undefined): Settings {
  const merged: Settings = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
  // Whether the stored value was a RETIRED family, decided BEFORE the
  // normalisation rewrites it. A stored `lato` becomes `inter` either way, but
  // only one of those two cases is something the user needs to be told about:
  // a retired family is a face they chose that has gone away, and a silently
  // different typeface reads as a bug. The `system` → Inter refresh is a
  // designed one-time move and is deliberately NOT announced, because there is
  // nothing to apologise for — it is the same font, applied to everyone.
  const retiredFont =
    typeof stored?.fontFamily === "string" && RETIRED_FONTS.includes(stored.fontFamily)
      ? stored.fontFamily
      : null;
  merged.fontFamily = normalizeFontFamily(merged.fontFamily);
  if (retiredFont) pendingRetiredFontNotice = retiredFont;
  if (!isHandFontId(merged.handFont)) delete merged.handFont;
  // A boolean toggle, coerced to a real boolean rather than deleted, so the
  // invariant "this field is a boolean" holds everywhere downstream instead of
  // only in DEFAULT_SETTINGS. The difference is not academic: in JavaScript the
  // STRING "false" is truthy, so a settings blob carrying
  // `autoHideNav: "false"` — from a hand-edited export, a bad merge, or an
  // older importer — would otherwise switch the feature ON for someone who had
  // turned it off. Assigning also repairs the stored blob on the next save,
  // rather than leaving the corruption to be re-read forever.
  merged.autoHideNav = merged.autoHideNav === true;
  // A stored theme outside the six the picker offers is corruption, and unlike
  // the four neighbours above it is not a cosmetic one: `resolveTheme` would
  // return `{}` for it, and `applyThemeTokens` would then call
  // `isLight(undefined)` and throw — inside ThemeProvider's effect, before the
  // first painted frame, with no UI left to recover from. Coerce to the same
  // default DEFAULT_SETTINGS declares, and assign so the next save rewrites the
  // blob rather than re-reading the corruption forever.
  if (!isThemeName(merged.theme)) merged.theme = DEFAULT_SETTINGS.theme;
  // The background image is an ATTACHMENT ID, and the scrim is a number.
  //
  // Both are checked rather than null-coalesced, for the same reason `theme`
  // above is: `??` catches only null and undefined, so a string in
  // `backgroundScrim` would survive as a string and then be composed into the
  // `rgba()` it becomes — producing an invalid declaration that the browser
  // drops silently, leaving the reader with the picture and no scrim at all.
  //
  // The two fields are REPAIRED DIFFERENTLY, and the difference is not a
  // preference. `undefined` is the meaningful state for an id — it is what "no
  // picture is set" means, and DEFAULT_SETTINGS has no such key — so a bad id is
  // deleted and absence is preserved. For the scrim it is not: absence is not a
  // state the app has, DEFAULT_SETTINGS declares 0.55, and every reader that
  // wants a number has to write a `?? DEFAULT_SCRIM` beside it. So the scrim is
  // ASSIGNED the default, exactly as `theme` is three lines above. Deleting it
  // instead would leave the reader holding `undefined` for the whole live
  // session — it only heals on the NEXT save, once the key is simply absent and
  // the spread supplies the default again — which is the "tolerated, not owned"
  // state the `theme` comment above exists to rule out.
  if (merged.backgroundImage !== undefined) {
    if (typeof merged.backgroundImage !== "string" || merged.backgroundImage === "") {
      delete merged.backgroundImage;
    }
  }
  if (merged.backgroundScrim !== undefined) {
    const scrim = merged.backgroundScrim;
    if (typeof scrim !== "number" || !Number.isFinite(scrim) || scrim < 0 || scrim > 1) {
      merged.backgroundScrim = DEFAULT_SETTINGS.backgroundScrim;
    }
  }
  // The three fields that came with the blur and the tint. Same rule as the
  // scrim above — assign, do not delete — because DEFAULT_SETTINGS declares the
  // blur and the palette, and a component reading them would otherwise have to
  // carry a `?? DEFAULT` beside every use. The tint is the exception and the
  // reason is the same one that keeps `backgroundImage` an absent key: there is
  // no tint until there is a picture, so a corrupt one is deleted and absence is
  // preserved. A stale tint that survived its picture would tint the scrim of a
  // backdrop the reader has already thrown away.
  if (merged.backgroundBlur !== undefined) {
    const blur = merged.backgroundBlur;
    if (typeof blur !== "number" || !Number.isFinite(blur) || blur < 0 || blur > 1) {
      merged.backgroundBlur = DEFAULT_SETTINGS.backgroundBlur;
    }
  }
  if (merged.backgroundPalette !== undefined) {
    if (merged.backgroundPalette !== "image" && merged.backgroundPalette !== "theme") {
      merged.backgroundPalette = DEFAULT_SETTINGS.backgroundPalette;
    }
  }
  if (merged.backgroundCardTransparency !== undefined) {
    const card = merged.backgroundCardTransparency;
    if (typeof card !== "number" || !Number.isFinite(card) || card < 0 || card > 1) {
      merged.backgroundCardTransparency = DEFAULT_SETTINGS.backgroundCardTransparency;
    }
  }
  if (merged.backgroundFit !== undefined) {
    // Assigned, not deleted, for the reason the palette above is: the field
    // has a default, and a component reading it should not have to carry a
    // `?? DEFAULT` beside every use. The retired `auto` is exactly the value
    // this branch exists for now: it repairs to the default, which is the
    // migration rather than a broken blob.
    if (
      merged.backgroundFit !== "cover" &&
      merged.backgroundFit !== "contain" &&
      merged.backgroundFit !== "soft"
    ) {
      merged.backgroundFit = DEFAULT_SETTINGS.backgroundFit;
    }
  }
  if (merged.backgroundTint !== undefined) {
    // `parseTint`, not a local `split(",")` check: the store already repairs the
    // stored blob and the scrim is built from the same three numbers, so a
    // second grammar here would be a second answer to "is this a colour".
    if (!parseTint(merged.backgroundTint)) delete merged.backgroundTint;
  }
  // Batch 11: the tabs' order is either a real array or NOTHING. A string,
  // an object or a number is not an arrangement, it is corruption — and an
  // `orderedTabs` that met one would fall back to the default anyway, so the
  // store repairs the blob here (assigned so the next save rewrites it) and
  // the field stays an array everywhere downstream.
  if (merged.tabOrder !== undefined && !Array.isArray(merged.tabOrder)) {
    delete merged.tabOrder;
  }
  // Batch 15: the reader's allergen list is a list of KNOWN ids or nothing.
  // The repair is stricter than `tabOrder`'s because the values are not an
  // arrangement but a set of facts the app acts on: an id the registry does
  // not have would be a marking that never warns about anything, so it is
  // dropped here rather than carried as a silent no-op. A non-array is dropped
  // wholesale, exactly as `tabOrder` treats one.
  if (merged.foodAllergies !== undefined) {
    if (Array.isArray(merged.foodAllergies)) {
      const known = merged.foodAllergies.filter(
        (id) => typeof id === "string" && ALLERGEN_IDS.has(id),
      );
      if (known.length) merged.foodAllergies = known;
      else delete merged.foodAllergies;
    } else {
      delete merged.foodAllergies;
    }
  }
  // `sectionOrder` is the same rule over a different shape: a per-tab MAP of
  // arrays, not one array, so the `Array.isArray` repair above cannot see a
  // single thing wrong with it. Two steps, because there are two ways to be
  // wrong. A `sectionOrder` that is not a plain object is not a map of
  // arrangements at all; a map whose per-tab value is not an array is
  // corruption the normaliser has no arrangement to work with. Either way the
  // field stays something `orderSections` can be handed without a guard at the
  // call site — which is where a second answer to the question would grow.
  if (merged.sectionOrder !== undefined) {
    const raw: unknown = merged.sectionOrder;
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      delete merged.sectionOrder;
    } else {
      const map = raw as Record<string, unknown>;
      for (const tab of Object.keys(map)) {
        if (!Array.isArray(map[tab])) delete map[tab];
      }
    }
  }
  // Batch A: the recorder switch has exactly two answers. Absence is the
  // new-flow default (see the Settings type), anything else non-"old" is a
  // hand-edited value, not a choice — repaired here so the next save writes
  // a clean blob.
  if (merged.moodFlow !== undefined && merged.moodFlow !== "new" && merged.moodFlow !== "old") {
    delete merged.moodFlow;
  }
  if (merged.iconSet !== undefined && !isIconSetId(merged.iconSet)) {
    // A RETIRED set is a choice the user made, so it moves to its successor
    // rather than vanishing: dropping it would put them back on the
    // pre-Batch-7 appearance with no explanation, which is the one outcome
    // worse than either. The move is announced once — see below.
    if (typeof merged.iconSet === "string" && RETIRED_ICON_SETS.includes(merged.iconSet)) {
      pendingIconSetNotice = merged.iconSet;
      merged.iconSet = RETIRED_ICON_SET_REPLACEMENT;
    } else {
      delete merged.iconSet;
    }
  }
  // Phase 2: the chosen language. Unlike `iconSet`, a value this build does not
  // have is NOT a choice to be migrated — there is no successor catalogue to
  // move a `"fr"` onto, and inventing one would mean rendering a language the
  // app cannot speak. So it is deleted, and the field goes back to meaning
  // "never chose", which is Hungarian. `isLocale` is the registry's own test
  // rather than a local list, so a fourth language cannot be added to
  // `SUPPORTED_LOCALES` and forgotten here.
  if (merged.locale !== undefined && !isLocale(merged.locale)) {
    delete merged.locale;
  }
  // AND NOTHING IS PUT BACK. `merged.locale` stays absent for a reader who has
  // never chosen, because absent is a different fact from `"hu"` — see
  // `Settings.locale`'s own note. The default is applied where it is read (this
  // module's `commit`, the picker's summary, `t()`'s own default), not written
  // into the blob on the way in, where nothing downstream could tell the two
  // apart again.
  //
  // The mirror IS written here, at the one place a stored blob becomes the
  // settings the app runs on, so a load cannot leave `t()` answering in the
  // language of last session's reload while the store says otherwise. This is
  // also the half that repairs the mirror after a restore or a wipe.
  setActiveLocale(merged.locale ?? DEFAULT_LOCALE);
  return merged;
}

/**
 * The retired set a load just moved the user off, or null.
 *
 * Deliberately module-level, never persisted, and read-and-cleared: the
 * announcement is a one-time event, not a piece of state. Persisting it would
 * mean a user who dismissed the toast never saw it again and one who did not
 * dismiss it saw it on every single launch.
 */
let pendingIconSetNotice: string | null = null;

/** Take the pending announcement, if there is one. Clears it either way. */
export function consumeRetiredIconSetNotice(): string | null {
  const notice = pendingIconSetNotice;
  pendingIconSetNotice = null;
  return notice;
}

/**
 * The retired FAMILY a load just moved the user off, or null.
 *
 * Module-level, never persisted, read-and-cleared, for the same reason as
 * `pendingIconSetNotice`: an announcement is an event, not state. Persisting it
 * would mean the toast either never appears again or appears on every launch.
 */
let pendingRetiredFontNotice: string | null = null;

/** Take the pending retired-family announcement, if there is one. */
export function consumeRetiredFontNotice(): string | null {
  const notice = pendingRetiredFontNotice;
  pendingRetiredFontNotice = null;
  return notice;
}

function normalizeEntry(e: Partial<Entry>): Entry {  return {
    id: e.id ?? crypto.randomUUID(),
    // `normalizeLegacyDate` rather than `?? todayISO()`: `??` only catches
    // null and undefined, so an EMPTY or malformed date survived it and then
    // threw inside `fromISODate` — an "x" in a hand-edited import took the
    // analysis screen down with it. The regex accepts the ISO form and rejects
    // everything else, and the fallback is today.
    date: normalizeLegacyDate(typeof e.date === "string" ? e.date : ""),
    // A NUMBER survives as itself, EVEN off grid. That is not an oversight: the
    // migration layer has a documented case for a row whose level is out of
    // range, and re-derives its coordinates from it
    // (`tests/lib/recording-storage.test.ts`, "a stray coordinate on a non-level
    // row"). Clamping it here would make that branch unreachable and quietly
    // change what the migration does.
    //
    // Anything else — a word, an object, null — goes through `mapLegacyMood`,
    // which reads the legacy emoji vocabulary and rejects the rest. A cast is
    // not a check, so before this a hand-edited import carrying `mood: "rossz"`
    // reached `mean()` as itself and the app rendered "NaN ponttal magasabb volt
    // a hangulatod" to the reader. `mapLegacyMood` was already imported for
    // `migrateLegacy`: the check that should have guarded every entry was only
    // guarding the old ones.
    mood: (typeof e.mood === "number" && Number.isFinite(e.mood)
      ? e.mood
      : mapLegacyMood(e.mood) ?? 3) as Entry["mood"],
    stress: clamp(e.stress, 5, 1, 10),
    energy: clamp(e.energy, 5, 1, 10),
    note: e.note ?? "",
    // `Array.isArray`, not `??`. A non-array (`null`, a number) passed through and
    // then threw at `for (const tag of entry.activities)`; a STRING passed too,
    // and iterated as characters, so every one of them scored `count: 1` and was
    // dropped by the engine's own floor — the day's activity silently vanished
    // from the analysis. `migrateLegacy` below already guards `tags` this way;
    // these three are the same field and are guarded the same way now.
    tags: Array.isArray(e.tags) ? e.tags : [],
    emotions: Array.isArray(e.emotions) ? e.emotions : [],
    activities: Array.isArray(e.activities) ? e.activities : [],
    reflection: e.reflection ?? { feeling: "", stressReason: "", need: "" },
    vitals: e.vitals ?? { restingHr: null, hrv: null, sleepHours: null },
    trackerValues: e.trackerValues,
    // Batch A — Recording 2.0. An absent field stays absent (old records
    // read back unchanged). A present NUMBER is clamped into its 1–10 range
    // the same way `stress` and `energy` above are: a hand-edited export or
    // a bad import must not put a meter point off the grid. The quadrant,
    // the emotion label and the context object are re-judged at read time
    // by their consumers, which already tolerate junk.
    moodEnergy: typeof e.moodEnergy === "number" && !Number.isNaN(e.moodEnergy) ? clamp(e.moodEnergy, 5, 1, 10) : undefined,
    pleasantness: typeof e.pleasantness === "number" && !Number.isNaN(e.pleasantness) ? clamp(e.pleasantness, 5, 1, 10) : undefined,
    quadrant: e.quadrant,
    emotion: e.emotion,
    emotionIntensity:
      typeof e.emotionIntensity === "number" && !Number.isNaN(e.emotionIntensity)
        ? clamp(e.emotionIntensity, 5, 1, 10)
        : undefined,
    context: e.context,
    attachments: e.attachments,
    source: e.source ?? "manual",
    createdAt: e.createdAt ?? Date.now(),
    updatedAt: e.updatedAt ?? Date.now(),
  };
}

function clamp(n: unknown, fallback: number, min: number, max: number): number {
  const num = typeof n === "number" ? n : Number(n);
  if (Number.isNaN(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

/* ----------------------- v1 → v2 migration ------------------------ */

/**
 * The old app stored entries under "belso-iranytu-data" (often wrapped as
 * {version, entries}) with dates like "2026. 05. 03." and emoji-string moods.
 * Those records are lifted into the new format instead of being lost.
 */
function migrateLegacy(): AppData {
  const data = emptyData();
  try {
    const legacy = localStorage.getItem("belso-iranytu-data");
    if (!legacy) return data;
    const parsed = JSON.parse(legacy);
    const rawEntries = Array.isArray(parsed) ? parsed : parsed?.entries;
    if (!Array.isArray(rawEntries)) return data;

    data.entries = rawEntries.map((e: Record<string, unknown>) =>
      normalizeEntry({
        ...(e as Partial<Entry>),
        id: crypto.randomUUID(),
        date: normalizeLegacyDate(String(e.date ?? "")),
        mood: mapLegacyMood(e.mood) ?? 3,
        tags: [],
        emotions: [],
        activities: Array.isArray(e.tags) ? (e.tags as string[]) : [],
        source: "import",
      }),
    );

    const legacyProfile = localStorage.getItem("belso-iranytu-profile");
    if (legacyProfile) {
      try {
        const p = JSON.parse(legacyProfile);
        data.profile = { name: p.name ?? "", goal: p.goal ?? "" };
      } catch {
        /* keep defaults */
      }
    }

    const legacyGoals = localStorage.getItem("daily-goals");
    if (legacyGoals) {
      try {
        const g = JSON.parse(legacyGoals);
        if (Array.isArray(g)) {
          data.goals = g.map((goal: { id?: unknown; text?: unknown; done?: unknown }) => ({
            id: String(goal.id ?? crypto.randomUUID()),
            text: String(goal.text ?? ""),
            done: Boolean(goal.done),
            date: todayISO(),
          }));
        }
      } catch {
        /* keep defaults */
      }
    }

    write(data);
  } catch {
    /* start fresh on any parse failure */
  }
  return data;
}

/** "2026. 05. 03." / "2026.05.03." → "2026-05-03"; falls back to today. */
function normalizeLegacyDate(raw: string): string {
  const m = raw.match(/(\d{4})[.\-\s]+(\d{1,2})[.\-\s]+(\d{1,2})/);
  if (m) {
    return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  }
  return todayISO();
}

/* ------------------------------ store ----------------------------- */

type Listener = (data: AppData) => void;
const listeners = new Set<Listener>();

let state: AppData = read();
// Batch A: lift pre-Batch-A entries onto the 4-quadrant grid, once, before
// the first subscriber can render. Defensive (log, never modify on error).
runMoodV2Migration(state.entries, (migrated) => {
  write({ ...state, entries: migrated });
  state = { ...state, entries: migrated };
});

function commit(next: AppData) {
  state = next;
  // Every write path lands here — the picker, a restored backup, `resetAll` — so
  // this is the one place the mirror can be kept in step without each caller
  // having to remember. `setActiveLocale` writes storage only when the mirror
  // disagrees with the choice, which matters because a commit happens on every
  // saved entry and a language almost never changes.
  setActiveLocale(next.settings.locale ?? DEFAULT_LOCALE);
  write(state);
  listeners.forEach((fn) => fn(state));
}

/** Subscribe to store changes; returns an unsubscribe function. */
export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getState(): AppData {
  return state;
}

function update(patch: Partial<AppData>) {
  commit({ ...state, ...patch });
}

/* ------------------------------ actions --------------------------- */

function upsertEntry(entries: Entry[], entry: Entry): Entry[] {
  const idx = entries.findIndex((e) => e.date === entry.date);
  if (idx === -1) {
    const next = [entry, ...entries];
    next.sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first
    return next;
  }
  const next = [...entries];
  next[idx] = { ...entry, createdAt: entries[idx].createdAt };
  return next;
}

/**
 * Overlay a partial update onto the stored entry.
 *
 * Entries are unique per day, and several UI surfaces save a SINGLE part of the
 * day (reflection only, vitals only, voice only, an edit). Those callers
 * naturally pass only the fields they own — but a naive spread used to replace
 * the whole entry, silently destroying `attachments` and `trackerValues` that
 * another surface had already saved.
 *
 * Only keys the caller actually passed are taken from `patch`; anything absent
 * (or explicitly `undefined`) keeps the stored value. Callers can still clear a
 * field by passing an empty value — `[]`, `""`, `null` — because those are
 * defined, just falsy.
 */
function mergeEntry(existing: Entry | undefined, patch: Partial<Entry>): Partial<Entry> {
  const merged: Record<string, unknown> = { ...patch };
  if (!existing) return merged;
  // Walk the STORED entry, not the patch: any field the caller did not send
  // keeps its saved value.
  for (const key of Object.keys(existing) as (keyof Entry)[]) {
    if (merged[key] === undefined) merged[key] = existing[key];
  }
  return merged;
}

export function saveEntry(input: Partial<Entry> & { date: string }): Entry {
  const now = Date.now();
  const existing = state.entries.find((e) => e.date === input.date);
  const entry = normalizeEntry({
    ...mergeEntry(existing, input),
    id: existing?.id ?? crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  });
  update({ entries: upsertEntry(state.entries, entry) });
  return entry;
}

/**
 * Delete an entry and the attachment BLOBS it referenced.
 *
 * Entries keep only attachment metadata, so without this the images/audio/videos
 * would stay in `belso-iranytu-attachments` forever — a permanent leak against
 * the browser's small localStorage quota.
 */
export function deleteEntry(id: string) {
  const entry = state.entries.find((e) => e.id === id);
  if (!entry) return;
  const ids = (entry.attachments ?? []).map((a) => a.id);
  if (ids.length > 0) removeAttachments(ids);
  update({ entries: state.entries.filter((e) => e.id !== id) });
}

/**
 * Merge a batch of entries in, newest-wins per day.
 *
 * THROUGH `normalizeEntry`, deliberately. Every other way an entry reaches the
 * store — `read()` on load, `migrateLegacy`, `upsertEntry` on save — passes
 * through it, and this one did not, so a JSON import was the one path that could
 * put junk in front of the whole app: a word in `mood` rendered "NaN ponttal" on
 * the analysis screen, and a null `activities` threw there outright. The
 * incoming type says `Entry[]`, but this array comes from a file on disk that a
 * person can edit, which is the same situation `migrateLegacy` was written for.
 */
export function importEntries(incoming: Entry[]) {
  const map = new Map(state.entries.map((e) => [e.date, e]));
  for (const incoming0 of incoming) {
    // Normalise FIRST, then key on the NORMALISED date. Keying on the raw one
    // would store an entry whose own `date` disagrees with the key it is filed
    // under — an empty date would land under `""` while carrying today's date,
    // which `upsertEntry`'s `findIndex` by date would then never match.
    const entry = normalizeEntry(incoming0);
    map.set(entry.date, entry);
  }
  const merged = [...map.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
  update({ entries: merged });
}

export function setGoals(goals: Goal[]) {
  update({ goals });
}

export function setDailyQuestion(q: { date: string; question: string; answer: string } | null) {
  update({ dailyQuestion: q });
}

export function setMedications(meds: Medication[]) {
  update({ medications: meds });
}

export function toggleMedication(date: string, medId: string) {
  const day = state.medicationChecks[date] ?? {};
  const next = { ...day, [medId]: !day[medId] };
  update({ medicationChecks: { ...state.medicationChecks, [date]: next } });
}

export function setProfile(profile: Profile) {
  update({ profile });
}

export function setSettings(settings: Settings) {
  update({ settings });
}

export function resetAll() {
  commit(emptyData());
  // Clear the v1 leftovers so migration cannot resurrect old data.
  try {
    localStorage.removeItem("belso-iranytu-data");
  } catch {
    /* noop */
  }
}

/**
 * Replace the whole medication-check map in one write.
 *
 * The map is one singular value — date → { med id: taken } — so the restore
 * path has nothing to merge into: a backup carries the map as it stood.
 * `toggleMedication` stays the day-by-day door the UI uses; this is the one
 * the encrypted backup opens after it has decrypted a file. The parameter is
 * typed as the field itself, so the setter cannot drift from what it sets.
 */
export function setMedicationChecks(checks: AppData["medicationChecks"]) {
  update({ medicationChecks: checks });
}
