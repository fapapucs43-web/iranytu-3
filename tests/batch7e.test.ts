/**
 * Batch 7e — more trackers. Manual only, no network, no sensors.
 *
 * EIGHT new built-in trackers, THREE new value kinds, and one property that
 * every other line in this file is downstream of:
 *
 *   absent value === default value, so nothing needs migrating.
 *
 * That is not automatic. It holds for booleans and for selects, and it holds
 * for numbers ONLY because the number kind is `number | null` with a `null`
 * default. A `0` default would have claimed that a day nobody filled in had
 * zero steps, zero calories and — because 0 °C is a real temperature — zero
 * degrees, and the correlation grid COUNTS SAMPLES, so it would have built
 * patterns out of forgetting. So the invariant is asserted here directly,
 * against the defaults themselves, rather than being left to a comment.
 *
 * WHY THE SANITIZER IS GUARDED AS A TABLE AND NOT AS EXAMPLES
 * Six kinds now share one `trackerValues` map, and each of the three new ones
 * has a meaningful EMPTY answer (null, "", all-false). That is what lets them
 * coerce instead of dropping — and it is also what makes them dangerous: a
 * coercion that is one step too eager invents a measurement. Every row below
 * is a case where the honest answer is "no value", including the ones that look
 * like numbers.
 *
 * WHY THE GROUPS GET THEIR OWN SECTION
 * `isTrackerGroupEnabled` had a real bug while this batch was being written: a
 * head has no `group` field — it IS the head — so a `if (!def.group)` shortcut
 * asked the per-id question about the head's own id, which is false for a user
 * who enabled one of its members, and the whole group vanished. No existing
 * test caught it because groups did not exist. The matrix below is the shape
 * that bug lived in.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { t } from "../src/lib/i18n";
import {
  DEFAULT_ENABLED_TRACKERS,
  MAX_TEXT_LENGTH,
  TRACKERS,
  defaultTrackerState,
  defaultTrackerValue,
  groupHeadId,
  isTrackerEnabled,
  isTrackerGroupEnabled,
  sanitizeTrackerState,
  sanitizeTrackerValue,
  trackerGroupHeads,
  trackerGroupMembers,
  type TrackerDef,
} from "../src/lib/trackers";
import { BUILT_IN_OUTCOMES, MIN_SAMPLES, buildCorrelationGrid, cellTone, type OutcomeDef } from "../src/lib/correlationGrid";
import { entriesToCsv, csvToEntries } from "../src/lib/csv";
import { GLYPHS, glyphDef, setStems } from "../src/lib/iconsets";
import { FLUENT_ARTWORK, FLUENT_ARTWORK_COUNT, fluentArtwork } from "../src/lib/iconsets/fluent-artwork";
import { NAV_ICONS } from "../src/lib/nav-icons";
import { getIcon } from "../src/lib/icons";
import { CHROME_ICON_NAMES } from "../src/lib/icon-policy";
import { DEFAULT_SETTINGS } from "../src/types";
import type { Entry, TrackerValue } from "../src/types";

/** The eight ids this batch added, so no section has to re-type them. */
const NEW_IDS = [
  "nutrition-note",
  "nutrition-calories",
  "nutrition-flags",
  "sport",
  "sport-duration",
  "steps",
  "weather-condition",
  "weather-temp",
] as const;

/** The five that shipped before it, in their original order. */
const PRE_7E_IDS = ["sleep", "symptoms", "vitamins", "weather", "nutrition"] as const;

function def(id: string): TrackerDef {
  const found = TRACKERS.find((t) => t.id === id);
  if (!found) throw new Error(`no such tracker: ${id}`);
  return found;
}

/** Narrow a def to its `number` input, or fail loudly in the test. */
function numberDef(id: string) {
  const d = def(id);
  if (d.input.kind !== "number") throw new Error(`${id} is not a number tracker`);
  return d;
}

function selectDef(id: string) {
  const d = def(id);
  if (d.input.kind !== "select") throw new Error(`${id} is not a select tracker`);
  return d;
}

function flagsDef(id: string) {
  const d = def(id);
  if (d.input.kind !== "flags") throw new Error(`${id} is not a flags tracker`);
  return d;
}

const ALL_NUMERIC = ["steps", "nutrition-calories", "sport-duration", "weather-temp"] as const;
const ALL_SELECTS = ["sport", "weather-condition"] as const;

/** Sanitize and require a result, so a test fails on null rather than on a cast. */
function safe(d: TrackerDef, raw: unknown): TrackerValue {
  const out = sanitizeTrackerValue(d, raw);
  if (out === null) throw new Error(`${d.id} dropped ${JSON.stringify(raw)}`);
  return out;
}

/** Assert a value is DROPPED. The mirror of `safe`, for the negative rows. */
function drops(d: TrackerDef, raw: unknown): void {
  expect(sanitizeTrackerValue(d, raw), `${d.id} ← ${JSON.stringify(raw)}`).toBeNull();
}

function mkEntry(date: string, over: Partial<Entry> = {}): Entry {
  return {
    id: date,
    date,
    mood: 3,
    stress: 5,
    energy: 5,
    note: "",
    tags: [],
    emotions: [],
    activities: [],
    reflection: { feeling: "", stressReason: "", need: "" },
    vitals: { restingHr: null, hrv: null, sleepHours: null },
    source: "manual",
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

/* ================================================================== */
/* 1. The registry                                                    */
/* ================================================================== */

describe("eight trackers, and none of them is on for anybody", () => {
  test("every new id exists exactly once, and the old ones keep their order", () => {
    const ids = TRACKERS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of NEW_IDS) expect(ids, id).toContain(id);
    expect(ids).toHaveLength(PRE_7E_IDS.length + NEW_IDS.length);
    // The array order IS the Settings card order, so this is a claim about
    // what the user sees: the five that were already there are still in the
    // order they were in, and the three new groups were appended rather than
    // interleaved. The weather group sits where `weather` always was, which
    // is why the head was declared above its own children.
    expect(ids.filter((id) => (PRE_7E_IDS as readonly string[]).includes(id))).toEqual([
      ...PRE_7E_IDS,
    ]);
  });

  test("all eight are OFF by default, in both places a default lives", () => {
    // Two defaults, not one, and they are written down separately. Checking
    // only `DEFAULT_ENABLED_TRACKERS` would leave a fresh install showing
    // eight fields the user never asked for.
    for (const id of NEW_IDS) {
      expect(DEFAULT_ENABLED_TRACKERS, id).not.toContain(id);
      expect(DEFAULT_SETTINGS.enabledTrackers, id).not.toContain(id);
    }
    expect(DEFAULT_ENABLED_TRACKERS).toEqual(["sleep", "symptoms"]);
    expect(DEFAULT_SETTINGS.enabledTrackers).toEqual(["sleep", "symptoms"]);
  });

  test("the numeric ranges are the ones that were asked for", () => {
    const steps = numberDef("steps");
    expect(steps.input).toMatchObject({ min: 0, max: 30000, step: 100, unit: "lépés" });
    expect(numberDef("sport-duration").input).toMatchObject({ min: 0, max: 600, step: 5 });
    expect(numberDef("nutrition-calories").input).toMatchObject({ min: 0, max: 10000, step: 10 });
    // The one range that is not 0-based, and the reason `snapToStep` counts
    // from `min` rather than from zero: a negative floor is what makes
    // "counts from min" observable at all.
    expect(numberDef("weather-temp").input).toMatchObject({ min: -50, max: 60, step: 1 });
  });

  test("both selects LEAD with a synthetic empty option", () => {
    // The whole absent-means-default argument for a select rests on this one
    // line. If the first option were a real answer, the default would be an
    // answer, and a stored "never chose" would be indistinguishable from a
    // stored "chose the first thing".
    for (const id of ALL_SELECTS) {
      const options = selectDef(id).input.options;
      expect(options[0]!.id, id).toBe("");
      expect(options[0]!.label.trim(), id).not.toBe("");
      expect(new Set(options.map((o) => o.id)).size, `${id} has a duplicate id`).toBe(
        options.length,
      );
    }
    expect(selectDef("sport").input.options.map((o) => o.label)).toEqual([
      "— nem sportoltam —",
      "séta",
      "futás",
      "kerékpár",
      "úszás",
      "edzőterem",
      "jóga",
      "egyéb",
    ]);
    expect(selectDef("weather-condition").input.options.map((o) => o.label)).toEqual([
      "— nem tudom —",
      "napsütéses",
      "felhős",
      "esős",
      "havazás",
      "ködös",
    ]);
  });

  test("the five meal flags are the five that were asked for", () => {
    expect(flagsDef("nutrition-flags").input.options.map((o) => o.id)).toEqual([
      "veg",
      "protein",
      "carb",
      "sweet",
      "fast",
    ]);
  });

  test("the five pre-7e definitions are byte-identical, and weather kept its shape", () => {
    // The sharpest form of "additive": each of these is compared as a whole
    // literal, so a change to a range, a step, a unit or a placeholder fails
    // here rather than quietly altering somebody's stored data.
    expect(def("sleep").input).toEqual({ kind: "slider", min: 0, max: 14, step: 0.5, unit: "óra" });
    expect(def("symptoms").input).toEqual({ kind: "checkbox" });
    expect(def("vitamins").input).toEqual({ kind: "checkbox" });
    expect(def("weather").input).toEqual({ kind: "text", placeholder: "pl. napos, hűvös" });
    expect(def("nutrition").input).toEqual({ kind: "slider", min: 1, max: 10, step: 1 });
    // `weather` is a CHILD of a new group, and only its label moved. A user's
    // "napos, hűvös" is still a `{kind:"text"}` under the id `weather`.
    expect(def("weather").group).toBe("weather-condition");
    expect(def("weather").label).not.toBe("Időjárás");
  });
});

/* ================================================================== */
/* 2. absent === default, so no migration                              */
/* ================================================================== */

describe("absent means the default, so a pre-7e blob needs no migration", () => {
  test("a number's default is null — never 0, in any of the four", () => {
    for (const id of ALL_NUMERIC) {
      expect(defaultTrackerValue(numberDef(id)), id).toEqual({ kind: "number", value: null });
    }
    // Stated as its own assertion because it is the single most revertable
    // line in the batch: `value: 0` typechecks, passes every other test in
    // this file except the ones below, and is wrong.
    const steps = defaultTrackerValue(numberDef("steps")) as { value: number | null };
    expect(steps.value).not.toBe(0);
  });

  test("a select's default is the empty option, and the empty option is real", () => {
    for (const id of ALL_SELECTS) {
      const d = selectDef(id);
      const v = defaultTrackerValue(d);
      expect(v, id).toEqual({ kind: "select", value: "" });
      expect(d.input.options.map((o) => o.id), id).toContain((v as { value: string }).value);
    }
  });

  test("a flags' default is every option, present and false", () => {
    const d = flagsDef("nutrition-flags");
    const v = defaultTrackerValue(d) as { value: Record<string, boolean> };
    // Present, not merely false-by-absence: a flags map that is missing a key
    // is a different thing from one that says `false`, and only the second
    // one can be counted.
    expect(Object.keys(v.value).sort()).toEqual(["carb", "fast", "protein", "sweet", "veg"]);
    expect(Object.values(v.value).every((x) => x === false)).toBe(true);
  });

  test("a 0 that the user really typed is a measurement, and stays one", () => {
    // The other half of the null decision. If a recorded 0 also became null,
    // "I did not move" and "I did not record" would be the same value and the
    // whole distinction would buy nothing.
    expect(safe(numberDef("steps"), { kind: "number", value: 0 })).toEqual({
      kind: "number",
      value: 0,
    });
    expect(safe(numberDef("steps"), { kind: "number", value: null })).toEqual({
      kind: "number",
      value: null,
    });
  });

  test("a realistic pre-7e blob passes through with every value byte-identical", () => {
    // The migration claim, as a test. Nothing here is upgraded, dropped or
    // rounded — which is only possible because nothing is upgraded AT ALL.
    const PRE_7E = {
      sleep: { kind: "slider", value: 7.3 },
      symptoms: { kind: "checkbox", value: true },
      vitamins: { kind: "checkbox", value: false },
      weather: { kind: "text", value: "napos, hűvös" },
      nutrition: { kind: "slider", value: 8 },
      // A CUSTOM tracker, which `sanitizeTrackerState` knows nothing about.
      "b6f1c0de-0000-4000-8000-000000000000": { kind: "slider", value: 4 },
    };
    const out = sanitizeTrackerState(PRE_7E);
    // Every built-in kept, and the 7.3 hours of sleep was NOT snapped to the
    // 0.5 step: it is somebody's real number.
    expect(out.sleep).toEqual({ kind: "slider", value: 7.3 });
    expect(out.symptoms).toEqual({ kind: "checkbox", value: true });
    expect(out.vitamins).toEqual({ kind: "checkbox", value: false });
    expect(out.weather).toEqual({ kind: "text", value: "napos, hűvös" });
    expect(out.nutrition).toEqual({ kind: "slider", value: 8 });
    // And no new key appeared. A default injected into a pre-7e entry would
    // mean the app is writing to data the user never filled in.
    expect(Object.keys(out).sort()).toEqual([...PRE_7E_IDS].sort());
  });

  test("the two TrackerValue unions name the same six kinds", () => {
    // `types.ts` and `lib/trackers.ts` declare this union twice, on purpose —
    // Entry needs it, the components need the other one, and unifying them
    // would make `types` import a module that already refers back to it. A
    // duplication held together by nothing is a duplication that drifts, so it
    // is held together by this. Read out of the source because a type-only
    // export has no runtime presence to compare against.
    const src = readFileSync(new URL("../src/types.ts", import.meta.url), "utf8");
    const block = src.slice(src.indexOf("export type TrackerValue ="));
    expect(block.length).toBeGreaterThan(0);
    const inTypes = [...block.matchAll(/kind: "([a-z]+)"/g)].map((m) => m[1]!);
    const inRegistry = [...new Set(TRACKERS.map((t) => t.input.kind))].sort();
    expect(inTypes.slice().sort()).toEqual(inRegistry);
    expect(inRegistry).toEqual(["checkbox", "flags", "number", "select", "slider", "text"]);
  });
});

/* ================================================================== */
/* 3. the sanitizer table                                             */
/* ================================================================== */

describe("the sanitizer clamps, drops and refuses to guess", () => {
  test("a number is clamped to its range, then snapped onto its step", () => {
    const steps = numberDef("steps"); // 0…30000, step 100
    expect(safe(steps, { kind: "number", value: 8200 })).toEqual({ kind: "number", value: 8200 });
    expect(safe(steps, { kind: "number", value: -5 })).toEqual({ kind: "number", value: 0 });
    expect(safe(steps, { kind: "number", value: 999_999 })).toEqual({
      kind: "number",
      value: 30000,
    });
    // 7234 is not a step, and this is the ONE place `step` is enforced, so
    // the box and the stored value cannot disagree.
    expect(safe(steps, { kind: "number", value: 7234 })).toEqual({ kind: "number", value: 7200 });
  });

  test("a negative range snaps from its MINIMUM, not from zero", () => {
    // weather-temp is −50…60 by step 1. Counting from zero would be invisible
    // at step 1, so the range that proves it is the fractional one.
    const temp = numberDef("weather-temp");
    expect(safe(temp, { kind: "number", value: -3.6 })).toEqual({ kind: "number", value: -4 });
    expect(safe(temp, { kind: "number", value: -80 })).toEqual({ kind: "number", value: -50 });
    expect(safe(temp, { kind: "number", value: 90 })).toEqual({ kind: "number", value: 60 });
  });

  test("a fractional step survives the round-trip through JSON", () => {
    // `toFixed` is there because 0 + 0.1 * 3 is 0.30000000000000004, and that
    // is a number the user can read in their own export.
    const d: TrackerDef = {
      id: "tmp",
      icon: "⭐",
      label: "tmp",
      input: { kind: "number", min: 0, max: 1, step: 0.1 },
    };
    const v = safe(d, { kind: "number", value: 0.34 });
    expect(v).toEqual({ kind: "number", value: 0.3 });
    expect(JSON.stringify(v)).toBe('{"kind":"number","value":0.3}');
  });

  test("everything that is not a number becomes null, and nothing else does", () => {
    // The table. `Number(true)` is 1, `Number([])` is 0 and `Number(" ")` is 0,
    // so a boolean or an array arriving from a hand-edited export would
    // otherwise be recorded as a measurement.
    const steps = numberDef("steps");
    const NOT_A_NUMBER: unknown[] = [
      null,
      undefined,
      "",
      "   ",
      "abc",
      "8,200",
      true,
      false,
      [],
      [8000],
      {},
      NaN,
      Infinity,
      -Infinity,
    ];
    for (const raw of NOT_A_NUMBER) {
      expect(safe(steps, { kind: "number", value: raw }), JSON.stringify(raw)).toEqual({
        kind: "number",
        value: null,
      });
    }
    // A NUMERIC STRING is a number — the CSV importer hands these over, and
    // rejecting them would make every exported step count unreadable.
    expect(safe(steps, { kind: "number", value: " 8200 " })).toEqual({
      kind: "number",
      value: 8200,
    });
  });

  test("a select keeps a known id and refuses to invent one", () => {
    const sport = selectDef("sport");
    expect(safe(sport, { kind: "select", value: "swim" })).toEqual({
      kind: "select",
      value: "swim",
    });
    // Not a keyword match, not a prefix, not "close": the option list is the
    // only authority, and anything else is "nothing chosen".
    for (const raw of ["Swim", "SWIM", "úszás", "swimming", "other ", "walk ", 7, null, {}]) {
      expect(safe(sport, { kind: "select", value: raw }), JSON.stringify(raw)).toEqual({
        kind: "select",
        value: "",
      });
    }
  });

  test("a flags map is rebuilt from the def, so it can be neither short nor strange", () => {
    const d = flagsDef("nutrition-flags");
    // Missing keys arrive as false rather than absent.
    expect(safe(d, { kind: "flags", value: { sweet: true } })).toEqual({
      kind: "flags",
      value: { veg: false, protein: false, carb: false, sweet: true, fast: false },
    });
    // Unknown keys are dropped: this is the layer that decides, and it decides
    // from the registry, which is why `lib/csv` is free to carry them through.
    expect(safe(d, { kind: "flags", value: { ghost: true, veg: true } })).toEqual({
      kind: "flags",
      value: { veg: true, protein: false, carb: false, sweet: false, fast: false },
    });
    // Non-booleans are false, not truthy. "false" is a truthy string in
    // JavaScript, and a hand-edited export carrying one must not tick a box.
    expect(safe(d, { kind: "flags", value: { veg: "false", protein: 1, carb: 0 } })).toEqual({
      kind: "flags",
      value: { veg: false, protein: false, carb: false, sweet: false, fast: false },
    });
    // A value that is not an object at all is all-false rather than a drop:
    // an all-false map is the default, so nothing is invented.
    expect(safe(d, { kind: "flags", value: "veg=1" })).toEqual({
      kind: "flags",
      value: { veg: false, protein: false, carb: false, sweet: false, fast: false },
    });
  });

  test("a value written for a DIFFERENT kind is dropped, never reinterpreted", () => {
    // Six kinds share one map now. Guessing which of them an author meant is
    // how a stored entry gets quietly corrupted, so a mismatch loses the key
    // and the field falls back to its default.
    const cases: [string, unknown][] = [
      ["steps", { kind: "slider", value: 8000 }],
      ["steps", { kind: "text", value: "8000" }],
      ["steps", { kind: "select", value: "run" }],
      ["sport", { kind: "text", value: "futás" }],
      ["sport", { kind: "flags", value: { run: true } }],
      ["nutrition-flags", { kind: "checkbox", value: true }],
      ["nutrition-calories", { kind: "slider", value: 2000 }],
      // The pre-7e text tracker, handed a value shaped for the select that now
      // sits above it. The most likely real version of this mistake.
      ["weather", { kind: "select", value: "sunny" }],
    ];
    for (const [id, raw] of cases) drops(def(id), raw);
    // And the kind match alone is the whole test — a `number` for a tracker
    // whose def is also a `number` is correct, and nothing about the ids
    // cross-checks, which is exactly why `sanitizeTrackerState` walks a known
    // def rather than inspecting values.
    expect(safe(numberDef("steps"), { kind: "number", value: 100 })).toEqual({
      kind: "number",
      value: 100,
    });
  });

  test("a non-object, and an unknown tracker id, both lose the key", () => {
    expect(sanitizeTrackerState(null)).toEqual({});
    expect(sanitizeTrackerState("junk")).toEqual({});
    expect(sanitizeTrackerState(42)).toEqual({});
    expect(sanitizeTrackerState({ bogus: { kind: "checkbox", value: true } })).toEqual({});
    expect(sanitizeTrackerState({ steps: null, sport: "futás", nutrition: 5 })).toEqual({});
  });

  test("a SLIDER is still clamped but still NOT snapped", () => {
    // The deliberate non-change. Snapping was considered for `number` and
    // rejected here: a stored 7.3 hours of sleep is somebody's real number,
    // and rounding it is a change to existing data dressed up as a tidy-up.
    expect(safe(def("sleep"), { kind: "slider", value: 7.3 })).toEqual({
      kind: "slider",
      value: 7.3,
    });
    expect(safe(def("sleep"), { kind: "slider", value: 99 })).toEqual({ kind: "slider", value: 14 });
    expect(safe(def("nutrition"), { kind: "slider", value: 99 })).toEqual({
      kind: "slider",
      value: 10,
    });
    // The slider is the one kind that does NOT coerce: a number-shaped string
    // is a drop, where a `number` tracker would have accepted it. A slider
    // cannot arrive from a CSV cell as a string the way a hand-typed one can.
    drops(def("sleep"), { kind: "slider", value: "7" });
    drops(def("sleep"), { kind: "slider", value: NaN });
    drops(def("sleep"), { kind: "slider", value: Infinity });
    drops(def("sleep"), { kind: "slider", value: true });
  });

  test("text is still truncated to the one shared cap", () => {
    expect(MAX_TEXT_LENGTH).toBe(200);
    const long = "x".repeat(500);
    expect(safe(def("weather"), { kind: "text", value: long })).toEqual({
      kind: "text",
      value: "x".repeat(200),
    });
    drops(def("weather"), { kind: "text", value: 42 });
    drops(def("weather"), { kind: "text", value: null });
  });

  test("sanitizeTrackerState is BUILT-IN ONLY, which is why the store must not call it", () => {
    // THE trap this batch was written around. `sanitizeTrackerState` walks
    // `TRACKERS` and nothing else, so running it over a whole entry at load
    // time would delete every CUSTOM tracker's values — custom ids are not in
    // this registry. That is why `lib/store` passes `trackerValues` straight
    // through, and why nothing on disk is rewritten until the user saves.
    const out = sanitizeTrackerState({
      steps: { kind: "number", value: 5000 },
      "b6f1c0de-0000-4000-8000-000000000000": { kind: "slider", value: 4 },
    });
    expect(out).toEqual({ steps: { kind: "number", value: 5000 } });
    expect(out["b6f1c0de-0000-4000-8000-000000000000"]).toBeUndefined();
  });

  test("and `lib/store` really does not call it", () => {
    // The same claim from the other side, at the source, so the property
    // cannot be undone by an import that a behavioural test would not notice.
    const src = readFileSync(new URL("../src/lib/store.ts", import.meta.url), "utf8");
    expect(src).not.toContain("sanitizeTrackerState");
    expect(src).not.toContain("sanitizeTrackerValue");
  });
});

/* ================================================================== */
/* 4. groups                                                          */
/* ================================================================== */

describe("a group is on when ANY of its members is", () => {
  test("there are seven heads, and they are the seven rows Settings shows", () => {
    const heads = trackerGroupHeads().map((h) => h.id);
    expect(heads).toEqual([
      "sleep",
      "symptoms",
      "vitamins",
      "weather-condition",
      "nutrition",
      "sport",
      "steps",
    ]);
    // Every head is a real def, and a head has no `group` of its own — that is
    // what `groupHeadId` exists to resolve.
    for (const head of trackerGroupHeads()) expect(head.group).toBeUndefined();
  });

  test("the head comes FIRST in its own member list", () => {
    // Load-bearing, and invisible until the card draws a group headed by one
    // of its sub-fields. `trackerGroupMembers` is declaration order, so this
    // is a statement about the order of the registry.
    for (const head of trackerGroupHeads()) {
      const members = trackerGroupMembers(head.id);
      expect(members[0]!.id, head.id).toBe(head.id);
      for (const m of members) expect(groupHeadId(m), m.id).toBe(head.id);
    }
  });

  test("the members are the ones that were grouped, and nothing else moved", () => {
    expect(trackerGroupMembers("nutrition").map((m) => m.id)).toEqual([
      "nutrition",
      "nutrition-note",
      "nutrition-calories",
      "nutrition-flags",
    ]);
    expect(trackerGroupMembers("sport").map((m) => m.id)).toEqual(["sport", "sport-duration"]);
    // The weather group is the interesting one: `weather` is a PRE-7E id and
    // it is now a child, which is why the group rule has to exist at all.
    expect(trackerGroupMembers("weather-condition").map((m) => m.id)).toEqual([
      "weather-condition",
      "weather",
      "weather-temp",
    ]);
    expect(trackerGroupMembers("sleep").map((m) => m.id)).toEqual(["sleep"]);
  });

  test("THE BUG THIS SHAPE HID: the head must see its own members", () => {
    // `ONBOARDING_TRACKER_CHOICES` offers the id "weather", which is now a
    // CHILD. A user who picks it there has enabled the weather group, and a
    // per-id filter would show them a free-text box and hide the select they
    // think they turned on.
    expect(isTrackerGroupEnabled(["weather"], def("weather-condition"))).toBe(true);
    expect(isTrackerGroupEnabled(["weather"], def("weather"))).toBe(true);
    expect(isTrackerGroupEnabled(["weather"], def("weather-temp"))).toBe(true);
    // Asking about the head by its OWN id stays false: `isTrackerEnabled` is
    // per-id and was not redefined. The group view is the one that looks.
    expect(isTrackerEnabled(["weather"], "weather-condition")).toBe(false);
    expect(isTrackerEnabled(["weather"], "weather")).toBe(true);
  });

  test("the full matrix: head, member and singleton all resolve the same way", () => {
    const M: [string, string[]][] = [
      // [tracker id, enablement that must turn it on]
      ["weather-condition", ["weather"]],
      ["weather", ["weather"]],
      ["weather-temp", ["weather"]],
      ["weather-condition", ["weather-condition"]],
      ["weather", ["weather-temp"]],
      ["nutrition", ["nutrition-flags"]],
      ["nutrition-flags", ["nutrition"]],
      ["sport", ["sport-duration"]],
      ["sleep", ["sleep"]],
    ];
    for (const [id, enabled] of M) {
      expect(isTrackerGroupEnabled(enabled, def(id)), `${id} ← ${enabled}`).toBe(true);
    }
    // ...and the negative half, so a group cannot be switched on by accident.
    for (const id of [
      "weather-condition",
      "weather",
      "weather-temp",
      "nutrition",
      "nutrition-flags",
      "sport",
      "sport-duration",
      "steps",
    ]) {
      expect(isTrackerGroupEnabled(["sleep", "symptoms"], def(id)), id).toBe(false);
    }
  });

  test("undefined still means the defaults: sleep and symptoms, nothing else", () => {
    expect(Object.keys(defaultTrackerState(undefined))).toEqual(["sleep", "symptoms"]);
    // `isTrackerEnabled` keeps its fallback, and the group view inherits it.
    expect(isTrackerGroupEnabled(undefined, def("sleep"))).toBe(true);
    expect(isTrackerGroupEnabled(undefined, def("steps"))).toBe(false);
    expect(isTrackerGroupEnabled(undefined, def("nutrition"))).toBe(false);
  });

  test("a fresh entry gets every member of an enabled group, defaults and all", () => {
    expect(Object.keys(defaultTrackerState(["weather"]))).toEqual([
      "weather-condition",
      "weather",
      "weather-temp",
    ]);
    expect(Object.keys(defaultTrackerState(["sport"]))).toEqual(["sport", "sport-duration"]);
    const sport = defaultTrackerState(["sport"]);
    // The two empty answers, in the shapes the UI reads them.
    expect(sport.sport).toEqual({ kind: "select", value: "" });
    expect(sport["sport-duration"]).toEqual({ kind: "number", value: null });
  });

  test("an enabled group is seeded in registry order, not in the order it was enabled", () => {
    expect(Object.keys(defaultTrackerState(["sport-duration", "sport"]))).toEqual([
      "sport",
      "sport-duration",
    ]);
  });
});

/* ================================================================== */
/* 5. the grid reads the registry, and only real samples               */
/* ================================================================== */

describe("numeric outcomes come from the registry, gated on a real sample", () => {
  const grid = (entries: Entry[]) =>
    buildCorrelationGrid({ entries, customNumericTrackers: [], customActivities: [] });
  const columns = (entries: Entry[]) => grid(entries).outcomes.map((o) => o.id);
  /** An entry that has an activity, so the grid emits a row to read cells off. */
  let day = 0;
  const act = (trackerValues: NonNullable<Entry["trackerValues"]>) =>
    mkEntry(`2026-02-${String(++day).padStart(2, "0")}`, {
      activities: ["🚶 Mozgás"],
      trackerValues,
    });

  test("BUILT_IN_OUTCOMES is the four fixed scalars and nothing else", () => {
    // The proof that the outcome list is derived rather than written out:
    // the grid's only hand-written outcome data is the four metrics that are
    // not stored on `trackerValues` at all. `nutrition` used to be the fifth
    // entry here, which is exactly what had to change for `steps` to be a
    // column without touching this file again.
    expect(BUILT_IN_OUTCOMES.map((o) => o.id)).toEqual(["mood", "stress", "energy", "sleep"]);
  });

  test("with nothing recorded, only the four scalars are columns", () => {
    // Otherwise this batch would have arrived with four columns of dots in a
    // horizontally scrolling table, for everybody.
    expect(columns([mkEntry("2026-01-01"), mkEntry("2026-01-02")])).toEqual([
      "mood",
      "stress",
      "energy",
      "sleep",
    ]);
  });

  test("one sample is enough to earn a column, and only that column", () => {
    const entries = [
      mkEntry("2026-01-01", { trackerValues: { steps: { kind: "number", value: 8200 } } }),
      mkEntry("2026-01-02", { trackerValues: { steps: { kind: "number", value: 4000 } } }),
    ];
    expect(columns(entries)).toEqual(["mood", "stress", "energy", "sleep", "tracker:steps"]);
  });

  test("a `null` is not a sample; a recorded 0 is", () => {
    // THE load-bearing pair. A day with no steps recorded and a day with zero
    // steps are different facts, and the grid has to be able to tell them
    // apart or the baseline is wrong. Every entry carries the activity, because
    // a row with no activity occurrences is skipped entirely and there would
    // be nothing to read a cell off.
    const withNull = [
      act({ steps: { kind: "number", value: 8200 } }),
      act({ steps: { kind: "number", value: null } }),
    ];
    const withZero = [
      act({ steps: { kind: "number", value: 8200 } }),
      act({ steps: { kind: "number", value: 0 } }),
    ];
    // ...and with a real 0 the same grid has two samples.
    expect(grid(withNull).rows[0]!.cells["tracker:steps"].count).toBe(1);
    expect(grid(withZero).rows[0]!.cells["tracker:steps"].count).toBe(2);
    // A number under the wrong kind is not a sample either.
    const wrongKind = [act({ steps: { kind: "number", value: 8200 } }), act({ steps: { kind: "text", value: "8200" } })];
    expect(grid(wrongKind).rows[0]!.cells["tracker:steps"].count).toBe(1);
    // A recorded 0 is therefore a real measurement that moves the average,
    // not a hole in it. Two active days, two baseline days (no activity):
    // active (9000 + 0) / 2 = 4500, baseline (500 + 700) / 2 = 600, Δ 3900.
    const base = [
      mkEntry("2026-04-01", { trackerValues: { steps: { kind: "number", value: 500 } } }),
      mkEntry("2026-04-02", { trackerValues: { steps: { kind: "number", value: 700 } } }),
    ];
    const zeroed = grid([
      act({ steps: { kind: "number", value: 9000 } }),
      act({ steps: { kind: "number", value: 0 } }),
      ...base,
    ]);
    expect(zeroed.rows[0]!.cells["tracker:steps"].delta).toBe(3900);
    expect(zeroed.rows[0]!.cells["tracker:steps"].count).toBe(2);

    // A `null` in the same place is not a 0 with a different spelling. With two
    // active days and one of them unrecorded there is a single sample, so the
    // cell is EMPTY — an unrecorded day does not merely contribute nothing, it
    // can suppress the whole finding, which is the correct and conservative
    // outcome. Had `null` been 0 this would have read 3900 again.
    const forgotten = grid([
      act({ steps: { kind: "number", value: 9000 } }),
      act({ steps: { kind: "number", value: null } }),
      ...base,
    ]);
    expect(forgotten.rows[0]!.cells["tracker:steps"].count).toBe(1);
    expect(forgotten.rows[0]!.cells["tracker:steps"].delta).toBeNull();

    // With a third active day the guard is satisfied and the difference
    // becomes visible. `null` drops out and the average is unchanged: 3900.
    const dropped = grid([
      act({ steps: { kind: "number", value: 9000 } }),
      act({ steps: { kind: "number", value: 0 } }),
      act({ steps: { kind: "number", value: null } }),
      ...base,
    ]);
    expect(dropped.rows[0]!.cells["tracker:steps"].delta).toBe(3900);
    expect(dropped.rows[0]!.cells["tracker:steps"].count).toBe(2);
    // ...whereas a third real 0 changes it to (9000 + 0 + 0) / 3 = 3000 − 600.
    // Two different numbers for the same question, which is the whole point.
    const threeZeros = grid([
      act({ steps: { kind: "number", value: 9000 } }),
      act({ steps: { kind: "number", value: 0 } }),
      act({ steps: { kind: "number", value: 0 } }),
      ...base,
    ]);
    expect(threeZeros.rows[0]!.cells["tracker:steps"].delta).toBe(2400);
    expect(threeZeros.rows[0]!.cells["tracker:steps"].count).toBe(3);
  });

  test("the ACCEPTED CONSEQUENCE: the nutrition column is gated too", () => {
    // Batch 7e made `nutrition` a registry row, so it inherits the gate. A
    // user with entries but no nutrition records loses a column of dots. That
    // was the trade, and it is pinned here so nobody "fixes" it by accident
    // in either direction.
    const none = [mkEntry("2026-01-01"), mkEntry("2026-01-02")];
    expect(columns(none)).not.toContain("tracker:nutrition");
    const some = [
      mkEntry("2026-01-01", { trackerValues: { nutrition: { kind: "slider", value: 8 } } }),
      mkEntry("2026-01-02", { trackerValues: { nutrition: { kind: "slider", value: 6 } } }),
    ];
    expect(columns(some)).toContain("tracker:nutrition");
  });

  test("the four scalars are NEVER gated, even with no data at all", () => {
    // `sleep` has no samples in these entries and its column is still there,
    // because the four fixed metrics are the table's reason to exist.
    const g = grid([act({ steps: { kind: "number", value: 8000 } }), act({})]);
    expect(g.outcomes.map((o) => o.id)).toContain("sleep");
    expect(g.rows[0]!.cells["sleep"].count).toBe(0);
  });

  test("a custom numeric column keeps Batch 2's ungated behaviour", () => {
    // Deliberately NOT gated. Gating it would change a shipped feature, and
    // this batch's rule is that it is additive.
    const g = buildCorrelationGrid({
      entries: [mkEntry("2026-01-01"), mkEntry("2026-01-02")],
      customNumericTrackers: [{ id: "c1", icon: "⭐", label: "Adag" }],
      customActivities: [],
    });
    expect(g.outcomes.map((o) => o.id)).toContain("custom:c1");
  });

  test("a custom tracker id and a registry id cannot collide", () => {
    // The two prefixes are why the generic lookup can tell them apart, and a
    // custom tracker is free to be called anything.
    const g = buildCorrelationGrid({
      entries: [
        act({ steps: { kind: "number", value: 8000 } }),
        act({ steps: { kind: "number", value: 4000 }, c1: { kind: "slider", value: 2 } }),
        mkEntry("2026-03-01"),
        mkEntry("2026-03-02"),
      ],
      customNumericTrackers: [{ id: "c1", icon: "⭐", label: "Adag" }],
      customActivities: [],
    });
    const row = g.rows[0]!;
    expect(row.cells["tracker:steps"].count).toBe(2);
    expect(row.cells["custom:c1"].count).toBe(1);
  });

  test("the declared polarities are the ones the batch approved", () => {
    const byId = new Map(TRACKERS.filter((t) => t.outcome).map((t) => [t.id, t.outcome!]));
    expect(byId.get("steps")!.higherIsBetter).toBe(true);
    expect(byId.get("nutrition")!.higherIsBetter).toBe(true);
    for (const id of ["nutrition-calories", "sport-duration", "weather-temp"]) {
      expect(byId.get(id)!.higherIsBetter, id).toBeNull();
    }
    // Four registry outcomes, and `nutrition-flags` is not one of them: a
    // flags map is not a measurement.
    expect([...byId.keys()].sort()).toEqual([
      "nutrition",
      "nutrition-calories",
      "sport-duration",
      "steps",
      "weather-temp",
    ]);
  });
});

describe("a neutral outcome reports a direction and stops there", () => {
  const neutral: OutcomeDef = {
    id: "tracker:nutrition-calories",
    label: "Kalória",
    icon: "🔥",
    higherIsBetter: null,
  };
  const better: OutcomeDef = { ...neutral, higherIsBetter: true };
  const worse: OutcomeDef = { ...neutral, higherIsBetter: false };

  test("neutral keeps the sign and drops the judgement", () => {
    // The old model had only a boolean, so it would have had to call 2400 kcal
    // a better Tuesday than 1800. `null` is the third state that lets it say
    // "more" and stop.
    expect(cellTone({ delta: 5, count: 2 }, neutral)).toBe("up");
    expect(cellTone({ delta: -5, count: 2 }, neutral)).toBe("down");
    expect(cellTone({ delta: 0.2, count: 2 }, neutral)).toBe("flat");
    expect(cellTone({ delta: null, count: 0 }, neutral)).toBe("none");
  });

  test("the two judgements are exactly as they were", () => {
    expect(cellTone({ delta: 5, count: 2 }, better)).toBe("up");
    expect(cellTone({ delta: -5, count: 2 }, better)).toBe("down");
    expect(cellTone({ delta: -3, count: 2 }, worse)).toBe("up");
    expect(cellTone({ delta: 3, count: 2 }, worse)).toBe("down");
    expect(cellTone({ delta: 0.2, count: 2 }, better)).toBe("flat");
    expect(cellTone({ delta: null, count: 0 }, better)).toBe("none");
  });

  test("a neutral outcome is NEITHER better nor worse, in both directions", () => {
    // Symmetric on purpose: the temptation with a `null` is to fall through to
    // "more is better", and both halves of that mistake are wrong.
    expect(cellTone({ delta: 100, count: 2 }, neutral)).toBe("up");
    expect(cellTone({ delta: -100, count: 2 }, neutral)).toBe("down");
  });

  test("the flat and none guards fire before the polarity is consulted", () => {
    for (const o of [neutral, better, worse]) {
      expect(cellTone({ delta: 0.49, count: 2 }, o)).toBe("flat");
      expect(cellTone({ delta: -0.49, count: 2 }, o)).toBe("flat");
      expect(cellTone({ delta: null, count: 0 }, o)).toBe("none");
    }
  });

  test("the cell says which way it moved, and says nothing about worth", () => {
    // The rendered tooltip. Behaviourally this is a string in a component, so
    // it is checked at the source rather than by mounting the grid: rendering
    // `CorrelationGrid` means writing entries into the module-level store
    // singleton that three other suites share, which is a worse trade than
    // pinning four literals. The DECISION above is what the string reports,
    // and that is tested behaviourally.
    //
    // Round 13 moved the four effect words into the catalogue, so the guard
    // reads them from there and asserts the WIRING here — which is the part
    // that actually decides whether a neutral outcome gets judged: the
    // `higherIsBetter === null` branch must not reach the judged pair.
    const src = readFileSync(
      new URL("../src/components/CorrelationGrid.tsx", import.meta.url),
      "utf8",
    );
    expect(src).toContain("higherIsBetter === null");
    expect(t("insights.grid.effectLarger")).toBe("ponttal nagyobb");
    expect(t("insights.grid.effectSmaller")).toBe("ponttal kisebb");
    // The judged wording is still there, for the outcomes that have a verdict.
    expect(t("insights.grid.effectBetter")).toBe("ponttal jobb");
    expect(t("insights.grid.effectWorse")).toBe("ponttal rosszabb");
    // And the neutral branch is wired to the neutral pair, in that order.
    const branch = src.slice(src.indexOf("higherIsBetter === null"));
    expect(branch).toContain('t("insights.grid.effectLarger")');
    expect(branch).toContain('t("insights.grid.effectSmaller")');
    expect(branch.indexOf('t("insights.grid.effectLarger")')).toBeLessThan(
      branch.indexOf("insights.grid.effectBetter"),
    );
  });

  test("the sample guard still holds for a registry outcome", () => {
    // One active day is not a pattern. `MIN_SAMPLES` is unchanged; this says
    // the derived columns did not quietly opt out of it.
    const g = buildCorrelationGrid({
      entries: [
        mkEntry("2026-01-01", {
          activities: ["🚶 Mozgás"],
          trackerValues: { steps: { kind: "number", value: 8000 } },
        }),
        mkEntry("2026-01-02"),
        mkEntry("2026-01-03"),
      ],
      customNumericTrackers: [],
      customActivities: [],
    });
    expect(MIN_SAMPLES).toBe(2);
    expect(g.rows[0]!.cells["tracker:steps"].delta).toBeNull();
  });
});

/* ================================================================== */
/* 6. CSV                                                             */
/* ================================================================== */

describe("all six kinds survive export and import", () => {
  const roundTrip = (values: NonNullable<Entry["trackerValues"]>) =>
    csvToEntries(entriesToCsv([mkEntry("2026-03-01", { trackerValues: values })]))[0]!
      .trackerValues;

  test("the kind travels in the header, so nothing is inferred from a value", () => {
    // The mechanism, not the bytes: `tests/batch4.test.ts` owns the byte-level
    // round trips. This is the claim that a checkbox that is false and a
    // slider that is 0 can never be confused, extended to the new kinds.
    const csv = entriesToCsv([
      mkEntry("2026-03-01", {
        trackerValues: {
          steps: { kind: "number", value: 0 },
          "nutrition-flags": { kind: "flags", value: { veg: false } },
          sport: { kind: "select", value: "" },
        },
      }),
    ]);
    const header = csv.split("\n")[0]!;
    expect(header).toContain("tracker:steps:number");
    expect(header).toContain("tracker:nutrition-flags:flags");
    expect(header).toContain("tracker:sport:select");
  });

  test("a number round-trips, and 0 is not confused with absent", () => {
    expect(roundTrip({ steps: { kind: "number", value: 8200 } })).toEqual({
      steps: { kind: "number", value: 8200 },
    });
    // 0 in, 0 out. `Number("")` is 0, so a blank cell becoming a 0 is exactly
    // the bug the empty cell avoids.
    expect(roundTrip({ "sport-duration": { kind: "number", value: 0 } })).toEqual({
      "sport-duration": { kind: "number", value: 0 },
    });
  });

  test("an unrecorded number leaves an empty cell and comes back ABSENT", () => {
    const csv = entriesToCsv([
      mkEntry("2026-03-01", { trackerValues: { steps: { kind: "number", value: null } } }),
    ]);
    const row = csv.split("\n")[1]!;
    // The LAST cell is the steps column and it is genuinely empty — not "0",
    // not "null", not a quoted blank. Checked on the cell rather than on the
    // row, because the row also contains the date.
    expect(row.split(",").at(-1)).toBe("");
    // Absent, not `{value: null}` — and those mean the same thing, which is
    // what lets the CSV layer stay free of the default rules.
    expect(roundTrip({ steps: { kind: "number", value: null } })).toBeUndefined();
  });

  test("a cell of spaces is not a zero either", () => {
    // The shared blank check catches "", and `Number(" ")` is 0, so this is a
    // separate guard on the number branch.
    const csv = [
      "date,mood,stress,energy,tracker:steps:number",
      "2026-03-01,4,3,7, ",
    ].join("\n");
    expect(csvToEntries(csv)[0]!.trackerValues).toBeUndefined();
  });

  test("a select round-trips by option id, and unchosen stays unchosen", () => {
    expect(roundTrip({ sport: { kind: "select", value: "swim" } })).toEqual({
      sport: { kind: "select", value: "swim" },
    });
    // `""` comes back absent rather than as `""`, and those are the same
    // answer — a select's default IS "nothing chosen".
    expect(roundTrip({ sport: { kind: "select", value: "" } })).toBeUndefined();
  });

  test("flags travel as id=1 pairs, and the def is what makes them legal", () => {
    const back = roundTrip({
      "nutrition-flags": { kind: "flags", value: { veg: true, protein: true } },
    });
    // The CSV layer has no registry, so it carries what it was given and does
    // not fill the rest.
    expect(back?.["nutrition-flags"]).toEqual({
      kind: "flags",
      value: { veg: true, protein: true },
    });
    // ...and the one component allowed to decide what a flag is fills the
    // missing three as false and drops an id it does not know.
    expect(safe(flagsDef("nutrition-flags"), back!["nutrition-flags"])).toEqual({
      kind: "flags",
      value: { veg: true, protein: true, carb: false, sweet: false, fast: false },
    });
  });

  test("a foreign 'tracker' column is still not claimed", () => {
    // The importer only takes exact `tracker:<id>:<kind>` headers. A new kind
    // in that list must not have widened the claim.
    const csv = "date,mood,stress,energy,tracker\n2026-03-01,4,3,7,x";
    expect(csvToEntries(csv)[0]!.trackerValues).toBeUndefined();
  });

  test("the three pre-7e kinds are still in the header whitelist", () => {
    const csv = entriesToCsv([
      mkEntry("2026-03-01", {
        trackerValues: {
          sleep: { kind: "slider", value: 7.3 },
          symptoms: { kind: "checkbox", value: false },
          weather: { kind: "text", value: "napos, hűvös" },
        },
      }),
    ]);
    const header = csv.split("\n")[0]!;
    for (const kind of ["slider", "checkbox", "text"]) {
      expect(header).toContain(`:${kind}`);
    }
    // And a pre-7e export does not acquire a new kind on the way out.
    expect(header).not.toContain("number");
    expect(header).not.toContain("select");
    expect(header).not.toContain("flags");
  });
});

/* ================================================================== */
/* 7. the glyph total map                                             */
/* ================================================================== */

describe("the three new glyphs are in the map, and the map is total", () => {
  const NEW_GLYPHS = ["👟", "🏃", "🌡️"] as const;

  test("each is registered, drawn by a real Lucide icon, and names a real stem", () => {
    for (const glyph of NEW_GLYPHS) {
      const g = glyphDef(glyph);
      expect(g, `${glyph} is not in GLYPHS`).toBeDefined();
      expect(getIcon(g!.lucide), `${glyph} → ${g!.lucide}`).not.toBeNull();
      expect(g!.fluent, `${glyph} has no Fluent stem`).toBeTruthy();
      expect(g!.fluent).toMatch(/^[a-z0-9-]+$/);
      // The artwork is GENERATED from the registry, so a stem the registry
      // names and the module lacks is a stale re-vendor, not a fallback.
      expect(fluentArtwork(g!.fluent), `${glyph} → ${g!.fluent}`).toBeDefined();
    }
  });

  test("codepoints carry no variation selector", () => {
    // 🌡️ is U+1F321 U+FE0F as a character but "1f321" as a stem. The selector
    // would 404 against the upstream filenames, which is the whole reason the
    // field is written out rather than computed.
    for (const glyph of NEW_GLYPHS) {
      expect(glyphDef(glyph)!.codepoints, glyph).toMatch(/^[0-9a-f]+$/);
    }
    expect(glyphDef("🌡️")!.codepoints).toBe("1f321");
    expect(glyphDef("🏃")!.codepoints).toBe("1f3c3");
    expect(glyphDef("👟")!.codepoints).toBe("1f45f");
  });

  test("🏃 is a genderless figure in the default skin tone", () => {
    // The same rules 🚶 and 🧘 obey. `person-running-default` satisfies both;
    // a future edit to `man-running` would not, which is why it is asserted.
    const fluent = glyphDef("🏃")!.fluent!;
    expect(fluent).not.toMatch(/^(man|woman|male|female)-/);
    expect(fluent).toMatch(/^person-/);
    expect(fluent).toMatch(/-(default|medium|medium-dark|medium-light|dark|light)$/);
  });

  test("no new glyph borrows a CHROME name — the trap `Activity` was", () => {
    // `Activity` is one of the 46 documented chrome icons (group Mérőszámok,
    // reason "stressz"), and `tests/batch7f.test.ts` asserts that no chrome
    // name may also name a content glyph: a name that is both is a route that
    // cannot be audited. 🏃 could have taken it and would have failed there.
    for (const glyph of NEW_GLYPHS) {
      expect(CHROME_ICON_NAMES, `${glyph} → ${glyphDef(glyph)!.lucide}`).not.toContain(
        glyphDef(glyph)!.lucide,
      );
    }
    // Stated as its own test because the failure is silent: the icon would
    // render perfectly and only the audit would be wrong.
    expect(CHROME_ICON_NAMES).not.toContain("Thermometer");
    expect(CHROME_ICON_NAMES).toContain("Activity");
  });

  test("🌡️ vendors a Thermometer rather than reusing an icon that is close", () => {
    // `Sun` is the obvious neighbour in ICONS and reusing it would have cost
    // nothing. On a temperature field a sun is a wrong answer that looks
    // plausible, which is worse than an obvious substitute.
    expect(getIcon("Thermometer")).not.toBeNull();
  });

  test("the artwork module covers every stem and holds nothing else", () => {
    // The total map. Keys equal to stems, both ways, is what makes a stale
    // re-vendor fail here rather than shipping a glyph that cannot draw.
    //
    // The stem list is the one the vendor script derives: the content glyphs
    // PLUS the nav rows (`stemsFor`). The two sets were equal until Batch 14,
    // whose Eszköztár row is the first nav stem that is not also a content
    // glyph (`briefcase`), so the equality is now against the union.
    const stems = fluentStems();
    expect(Object.keys(FLUENT_ARTWORK).sort()).toEqual([...stems].sort());
    for (const s of NEW_GLYPHS) {
      const stem = glyphDef(s)!.fluent!;
      expect(stems, stem).toContain(stem);
      expect(FLUENT_ARTWORK[stem], stem).toBeDefined();
    }
  });

  test("the count in the module is the count in the module", () => {
    // Shown to the user on the licence screen, so a stale constant is a wrong
    // number on a page that is about being accurate.
    expect(FLUENT_ARTWORK_COUNT).toBe(Object.keys(FLUENT_ARTWORK).length);
    expect(FLUENT_ARTWORK_COUNT).toBe(fluentStems().length);
  });

  /** Every stem the vendor script draws: the content glyphs plus the nav rows. */
  function fluentStems(): string[] {
    return [...new Set([...setStems("fluent"), ...NAV_ICONS.map((row) => row.fluent)])];
  }

  test("every tracker icon is a registered glyph", () => {
    // The join between the two halves of this batch: a tracker icon that is
    // not in GLYPHS renders as a bare character under a chosen set, which is
    // the exact failure Batch 7 was built to end.
    for (const t of TRACKERS) {
      expect(glyphDef(t.icon), `${t.id} → ${t.icon}`).toBeDefined();
    }
  });

  test("the registry grew by three and lost nothing", () => {
    // Batch 7f made the "additive, nothing removed" claim; this keeps it true
    // across this batch too. 40 → 43, and no existing stem disappeared.
    expect(GLYPHS).toHaveLength(43);
    for (const old of ["sleeping-face", "stethoscope", "pill", "sun-behind-cloud", "green-salad"]) {
      expect(fluentArtwork(old), old).toBeDefined();
    }
  });
});
