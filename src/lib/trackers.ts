/**
 * Modular tracker definitions (Phase 2, Bearable-style).
 *
 * A tracker is a small, typed input that appears on the daily entry only when
 * the user enables it in Settings. Definitions are static; enablement lives in
 * settings, values go on the entry as `trackerValues`.
 *
 * SIX INPUT KINDS, AND WHY THE TWO NEW NUMERIC ONES ARE NULLABLE
 * `checkbox`, `slider` and `text` are the original three. Batch 7e added
 * `number` (lépésszám, kalória, időtartam, hőmérséklet), `select` (sport típusa,
 * időjárás állapota) and `flags` (étkezés összetevői).
 *
 * The interesting one is `number`, and it is `number | null` rather than
 * `number` on purpose. A default of 0 would be a false claim in three ways at
 * once: 0 steps says "I walked nowhere" when the truth is "I did not record",
 * 0 °C is a perfectly ordinary temperature rather than a missing one, and the
 * correlation grid COUNTS SAMPLES — a 0 default drags every baseline toward
 * zero and manufactures a pattern out of the days somebody forgot to type.
 * So `null` means "not recorded", `defaultTrackerValue` returns `null`, and
 * the grid drops `null` samples. Because the default IS the absent meaning, a
 * pre-7e stored blob is still valid with no migration at all. That property is
 * the whole reason the default is `null`; please do not "simplify" it to 0.
 *
 * A `select` is the opposite case and deliberately needs no absent-means rule
 * like the one `iconSet` has. There, any written default would have silently
 * opted every existing user into an icon set, so the honest meaning had to be
 * *absence*. Here absence and the default are the same answer — the first
 * option of every select is a synthetic one with `id: ""` — so a stored
 * "nothing chosen" and a fresh "nothing chosen" are indistinguishable, which
 * is exactly the property that makes a migration unnecessary.
 */
import type { CustomTrackerDef } from "./customTrackers";

/** One choice in a `select` input, or one switch in a `flags` input. */
export type TrackerOption = { id: string; label: string };

export type TrackerInputKind = "checkbox" | "slider" | "text" | "number" | "select" | "flags";

export type TrackerInput =
  | { kind: "checkbox" }
  | { kind: "slider"; min: number; max: number; step?: number; unit?: string }
  | { kind: "text"; placeholder?: string }
  | { kind: "number"; min: number; max: number; step: number; unit?: string }
  | { kind: "select"; options: readonly TrackerOption[] }
  | { kind: "flags"; options: readonly TrackerOption[] };

export type TrackerDef = {
  id: string;
  icon: string;
  label: string;
  hint?: string;
  /**
   * The id of the tracker this one is filed UNDER, in both the daily card and
   * Settings. Optional: a def without one is its own group.
   *
   * Two things depend on this being optional rather than a required field. The
   * five trackers that shipped before Batch 7e have no group, so adding one
   * would have been a change to existing definitions; and the group is what
   * keeps Settings at seven rows instead of thirteen, because a head is one
   * toggle for all of its members.
   *
   * REGISTRY ORDER IS LOAD-BEARING: `trackerGroupMembers` returns members in
   * declaration order and the UI renders that order, so a head must be declared
   * before its children or the group draws the wrong way up.
   */
  group?: string;
  /**
   * Opt this tracker in as a correlation-grid COLUMN (see lib/correlationGrid).
   *
   * Declaring it here rather than in a list inside the grid is what makes a new
   * numeric tracker a first-class outcome with no code change: the grid reads
   * this field, so the registry is the only place that has to know.
   *
   * `higherIsBetter: null` means NEUTRAL — the delta is reported with its
   * direction and no value judgement. Calories, temperature and workout length
   * are all "more is not better"; the old model, which only had a boolean,
   * would have had to lie about one of them.
   */
  outcome?: { higherIsBetter: boolean | null };
  input: TrackerInput;
};

export type TrackerValue =
  | { kind: "checkbox"; value: boolean }
  | { kind: "slider"; value: number }
  | { kind: "text"; value: string }
  | { kind: "number"; value: number | null }
  | { kind: "select"; value: string }
  | { kind: "flags"; value: Record<string, boolean> };

export type TrackerState = { [trackerId: string]: TrackerValue };

/** Free-text trackers are truncated to this, on write and on load alike. */
export const MAX_TEXT_LENGTH = 200;

export const DEFAULT_ENABLED_TRACKERS = ["sleep", "symptoms"];

export const TRACKERS: TrackerDef[] = [
  {
    id: "sleep",
    icon: "😴",
    label: "Alvás",
    hint: "Aludtál éjjel (óra)",
    input: { kind: "slider", min: 0, max: 14, step: 0.5, unit: "óra" },
  },
  {
    id: "symptoms",
    icon: "🩺",
    label: "Tünetek",
    hint: "Jelentkezett-e tünet ma?",
    input: { kind: "checkbox" },
  },
  {
    id: "vitamins",
    icon: "💊",
    label: "Vitaminok",
    hint: "Bevetted a napi vitamint?",
    input: { kind: "checkbox" },
  },

  /* ----------------------------- Időjárás ---------------------------- *
   * `weather` keeps its id, its kind and its stored bytes. Only its LABEL
   * changed, to say what the free-text box is for now that a select sits next
   * to it. Every entry written before Batch 7e keeps its text and gains the
   * two new fields beside it — which is the point of not restructuring this
   * value into something a keyword migration would have had to guess at.
   *
   * This group is declared FOURTH, which is where `weather` always was. The
   * order of this array is the order of the Settings card, and the only thing
   * that should have moved on that card is what was added — so the new groups
   * were appended after the two that were already there, not interleaved.
   */
  {
    id: "weather-condition",
    icon: "⛅",
    label: "Időjárás",
    hint: "Milyen volt kint? Nem kötelező.",
    input: {
      kind: "select",
      options: [
        { id: "", label: "— nem tudom —" },
        { id: "sunny", label: "napsütéses" },
        { id: "cloudy", label: "felhős" },
        { id: "rainy", label: "esős" },
        { id: "snowy", label: "havazás" },
        { id: "foggy", label: "ködös" },
      ],
    },
  },
  {
    id: "weather",
    icon: "⛅",
    label: "Időjárás — szabad szöveg",
    group: "weather-condition",
    hint: "Ha van mondandó.",
    input: { kind: "text", placeholder: "pl. napos, hűvös" },
  },
  {
    id: "weather-temp",
    icon: "🌡️",
    label: "Hőmérséklet",
    group: "weather-condition",
    hint: "Becsült érték. Nem kötelező.",
    input: { kind: "number", min: -50, max: 60, step: 1, unit: "°C" },
    outcome: { higherIsBetter: null },
  },

  /* ----------------------------- Étkezés ----------------------------- *
   * `nutrition` keeps its id, its shape and its correlation column EXACTLY as
   * they shipped in Batch 1. It is the group head, and the three additions
   * hang under it. Building the extra fields as a composite value instead
   * would have been a different batch: it changes the stored shape of a value
   * real users already have, and `tests/batch4.test.ts` pins that shape.
   */
  {
    id: "nutrition",
    icon: "🥗",
    label: "Étkezés",
    hint: "Mennyire volt egészséges és kiegyensúlyozott a mai étkezés?",
    outcome: { higherIsBetter: true },
    input: { kind: "slider", min: 1, max: 10, step: 1 },
  },
  {
    id: "nutrition-note",
    icon: "🥗",
    label: "Mit ettél?",
    group: "nutrition",
    hint: "Röviden — bármi, ami eszedbe jut. Nem kötelező.",
    input: { kind: "text", placeholder: "pl. zabpepe, alma, csirke" },
  },
  {
    id: "nutrition-calories",
    icon: "🔥",
    label: "Kalória",
    group: "nutrition",
    hint: "Becsült érték — nem kell pontosnak lennie. Nem kötelező.",
    input: { kind: "number", min: 0, max: 10000, step: 10, unit: "kcal" },
    outcome: { higherIsBetter: null },
  },
  {
    id: "nutrition-flags",
    icon: "🥗",
    label: "Mit tartalmazott?",
    group: "nutrition",
    hint: "Amit ma ettél, azt alapul véve.",
    input: {
      kind: "flags",
      options: [
        { id: "veg", label: "zöldség / gyümölcs" },
        { id: "protein", label: "fehérje" },
        { id: "carb", label: "szénhidrát" },
        { id: "sweet", label: "édesség" },
        { id: "fast", label: "gyorsétel" },
      ],
    },
  },

  /* ------------------------------ Sport ------------------------------ */
  {
    id: "sport",
    icon: "🏃",
    label: "Sport",
    hint: "Milyen mozgás volt ma? Nem kötelező.",
    input: {
      kind: "select",
      options: [
        // The synthetic first option is the load-bearing part: it is what
        // makes "I did not choose" a VALUE rather than an absence, so the
        // default equals the absent meaning and no migration is needed.
        { id: "", label: "— nem sportoltam —" },
        { id: "walk", label: "séta" },
        { id: "run", label: "futás" },
        { id: "bike", label: "kerékpár" },
        { id: "swim", label: "úszás" },
        { id: "gym", label: "edzőterem" },
        { id: "yoga", label: "jóga" },
        { id: "other", label: "egyéb" },
      ],
    },
  },
  {
    id: "sport-duration",
    icon: "🏃",
    label: "Sport időtartama",
    group: "sport",
    hint: "Hány perc? Nem kötelező.",
    input: { kind: "number", min: 0, max: 600, step: 5, unit: "perc" },
    outcome: { higherIsBetter: null },
  },

  /* ---------------------------- Lépésszám ---------------------------- */
  {
    id: "steps",
    icon: "👟",
    label: "Lépésszám",
    hint: "Nézd meg a telefonon vagy az órán, és írd be. Nem kötelező.",
    input: { kind: "number", min: 0, max: 30000, step: 100, unit: "lépés" },
    outcome: { higherIsBetter: true },
  },
];

/** Enabled check; undefined means "use the defaults". */
export function isTrackerEnabled(enabledIds: string[] | undefined, id: string): boolean {
  return (enabledIds ?? DEFAULT_ENABLED_TRACKERS).includes(id);
}

/* ------------------------------ groups ------------------------------ */

/** The tracker a def is filed under: its group head, or itself. */
export function groupHeadId(def: TrackerDef): string {
  return def.group ?? def.id;
}

/**
 * Every built-in def filed under `headId`, in REGISTRY ORDER.
 *
 * The head comes first because a registry declares a head before its children;
 * a test pins that, because the daily card draws this list in order and a
 * registry that declared them the other way round would draw a group headed by
 * a field.
 */
export function trackerGroupMembers(headId: string): TrackerDef[] {
  return TRACKERS.filter((d) => groupHeadId(d) === headId);
}

/** The distinct group heads, in registry order. One Settings toggle each. */
export function trackerGroupHeads(): TrackerDef[] {
  const seen = new Set<string>();
  const out: TrackerDef[] = [];
  for (const def of TRACKERS) {
    const head = groupHeadId(def);
    if (seen.has(head)) continue;
    seen.add(head);
    out.push(def);
  }
  return out;
}

/**
 * Is this tracker's GROUP switched on?
 *
 * A group is on when ANY of its members is in `enabledIds`, and then all of
 * its members render. That is not tidiness — it is the only reading consistent
 * with what onboarding writes. `ONBOARDING_TRACKER_CHOICES` offers the id
 * "weather", which after Batch 7e is a CHILD of the weather group, so a
 * per-id filter would show the free-text box and hide the select the user
 * thinks they turned on.
 *
 * `isTrackerEnabled` keeps its own per-id meaning, untouched, for callers that
 * genuinely want one field.
 */
export function isTrackerGroupEnabled(enabledIds: string[] | undefined, def: TrackerDef): boolean {
  // One expression for all three cases, and the shape of it matters: the
  // lookup goes through `groupHeadId`, so asking about the HEAD, asking about
  // a MEMBER and asking about a SINGLETON all resolve to the same member list.
  //
  // Asking the head by its own id is the case that goes wrong if it is
  // special-cased. A head has no `group` field — it IS the head — so a
  // `if (!def.group) return isTrackerEnabled(enabledIds, def.id)` shortcut
  // asks the per-id question about `weather-condition`, which is false for a
  // user who enabled `weather`, and the whole group silently disappears. That
  // is the exact scenario this function exists for.
  return trackerGroupMembers(groupHeadId(def)).some((d) =>
    isTrackerEnabled(enabledIds, d.id),
  );
}

/* ------------------------------ values ------------------------------ */

/** A sensible starting value for a tracker input. */
export function defaultTrackerValue(def: TrackerDef): TrackerValue {
  switch (def.input.kind) {
    case "checkbox":
      return { kind: "checkbox", value: false };
    case "slider": {
      const mid = def.input.min + (def.input.max - def.input.min) / 2;
      const stepped = Math.round(mid / (def.input.step ?? 1)) * (def.input.step ?? 1);
      return { kind: "slider", value: stepped };
    }
    case "text":
      return { kind: "text", value: "" };
    case "number":
      // See the header: 0 here would be a claim the user never made.
      return { kind: "number", value: null };
    case "select":
      return { kind: "select", value: "" };
    case "flags":
      return {
        kind: "flags",
        value: Object.fromEntries(def.input.options.map((o) => [o.id, false])) as Record<
          string,
          boolean
        >,
      };
  }
}

/** Starting state for the enabled trackers (used on fresh entries). */
export function defaultTrackerState(enabledIds: string[] | undefined): TrackerState {
  const out: TrackerState = {};
  for (const def of TRACKERS) {
    if (isTrackerGroupEnabled(enabledIds, def)) out[def.id] = defaultTrackerValue(def);
  }
  return out;
}

/**
 * A number, or null for every "not a number" — including a blank field, which
 * is what an empty `<input type="number">` reports.
 *
 * Only real numbers and numeric strings are accepted. `Number(true)` is 1 and
 * `Number([])` is 0, so a boolean or an array reaching here from a hand-edited
 * export would otherwise be recorded as a measurement.
 */
function finiteNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function clampNumber(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/**
 * Round onto the declared `step`, counted from `min` rather than from zero.
 *
 * This is the ONE place that enforces `step`, which is why the input and the
 * stored value cannot disagree: a typed 7234 reads back as 7200 everywhere.
 * `toFixed` is there because a 0.1 step would otherwise leave 7300.000000000001
 * in the JSON the user can see in their own export.
 */
function snapToStep(n: number, min: number, step: number): number {
  if (!Number.isFinite(step) || step <= 0) return n;
  return Number((min + Math.round((n - min) / step) * step).toFixed(4));
}

/**
 * Validate one value against one built-in def, or `null` when it is not a
 * value that def can hold and should be dropped entirely.
 *
 * A value written for a DIFFERENT kind is dropped, not reinterpreted. Six kinds
 * now share one `trackerValues` map, and guessing which of them the author
 * meant is precisely how a stored entry gets quietly corrupted.
 *
 * The three new kinds COERCE rather than drop, because each of them has a
 * meaningful empty answer: a number becomes `null`, a select becomes `""`, and
 * a flags map is rebuilt from the def's own option list so it can never be
 * short and can never carry an id the registry does not know.
 */
export function sanitizeTrackerValue(def: TrackerDef, raw: unknown): TrackerValue | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as { kind?: unknown; value?: unknown };
  if (candidate.kind !== def.input.kind) return null;

  switch (def.input.kind) {
    case "checkbox":
      return typeof candidate.value === "boolean"
        ? { kind: "checkbox", value: candidate.value }
        : null;
    case "slider": {
      // Clamping only, and deliberately NOT snapped to `step`. This branch is
      // the pre-Batch-7e one, byte for byte: a stored 7.3 hours of sleep is
      // somebody's real number, and rounding it would be a change to existing
      // data dressed up as a tidy-up.
      if (typeof candidate.value !== "number" || !Number.isFinite(candidate.value)) return null;
      return { kind: "slider", value: clampNumber(candidate.value, def.input.min, def.input.max) };
    }
    case "text":
      return typeof candidate.value === "string"
        ? { kind: "text", value: candidate.value.slice(0, MAX_TEXT_LENGTH) }
        : null;
    case "number": {
      const n = finiteNumber(candidate.value);
      if (n === null) return { kind: "number", value: null };
      return {
        kind: "number",
        value: snapToStep(clampNumber(n, def.input.min, def.input.max), def.input.min, def.input.step),
      };
    }
    case "select": {
      if (typeof candidate.value !== "string") return { kind: "select", value: "" };
      const known = def.input.options.some((o) => o.id === candidate.value);
      return { kind: "select", value: known ? candidate.value : "" };
    }
    case "flags": {
      const stored =
        candidate.value && typeof candidate.value === "object"
          ? (candidate.value as Record<string, unknown>)
          : {};
      const out: Record<string, boolean> = {};
      for (const o of def.input.options) out[o.id] = stored[o.id] === true;
      return { kind: "flags", value: out };
    }
  }
}

/**
 * Validate/normalize unknown data (from storage or imports) into a safe
 * TrackerState containing only known trackers with correctly typed values.
 *
 * NOT WIRED INTO `lib/store`'s load path, and it must not be. This walks
 * `TRACKERS` only, so running it over a whole entry at load time would delete
 * every CUSTOM tracker's values — custom ids are not in this registry. Batch 7e
 * relies on that: nothing on disk is rewritten until the user saves, and a
 * pre-7e blob is valid as it stands.
 */
export function sanitizeTrackerState(raw: unknown): TrackerState {
  const out: TrackerState = {};
  if (!raw || typeof raw !== "object") return out;
  const source = raw as Record<string, unknown>;
  for (const def of TRACKERS) {
    const safe = sanitizeTrackerValue(def, source[def.id]);
    if (safe) out[def.id] = safe;
  }
  return out;
}

/**
 * Built-in defs + user-defined ones (Batch 2, P2 integration). Custom trackers
 * are always "enabled" — they are managed by add/delete, not by the toggle
 * list — and keep a reference to their own def so callers can sanitize values.
 */
export type MergedTrackerDef = TrackerDef & {
  custom?: boolean;
  customDef?: CustomTrackerDef;
};

export function getTrackerDefs(customDefs: CustomTrackerDef[]): MergedTrackerDef[] {
  return [
    ...TRACKERS,
    ...customDefs.map((c): MergedTrackerDef => ({
      id: c.id,
      icon: c.icon,
      label: c.label,
      hint: "Saját nyomonkövető",
      custom: true,
      customDef: c,
      input:
        c.kind === "checkbox"
          ? { kind: "checkbox" }
          : c.kind === "text"
            ? { kind: "text", placeholder: "…" }
            : { kind: "slider", min: c.min ?? 1, max: c.max ?? 10, step: 1 },
    })),
  ];
}
