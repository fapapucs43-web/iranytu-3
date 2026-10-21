/**
 * Round 16's sweep of `lib/fonts.ts`, pinned as a contract — including its
 * finishing touch.
 *
 * THE ROUND'S SHAPE, AND WHY A TEST FILE WAS STILL MISSING
 * Round 16 moved twenty-one reader-facing strings into the Hungarian
 * catalogue: five category notes, twelve hints, the two Hungarian labels
 * ("Rendszer", "Kikapcsolva") — and, in this branch, the two retired-family
 * reasons that round 16's own comment forgot to list under "deliberately NOT
 * a key" because they are not deliberate: `RETIRED_FONT_REASONS` held two
 * copies of a full Hungarian sentence as raw literals, reader-facing through
 * the FontContext toast. They are keys now, byte-identical values.
 *
 * What stays OUT of the catalogue, on the record: the ten family names and the
 * two retired labels are proper nouns — translating "Inter" renames a
 * typeface — and the five category headings are the international typographic
 * terms every font tool shows. `tests/i18n-sweep-list.test.ts` cannot arbitrate
 * any of this: its walk is `.tsx`-only and says so about `.ts` rounds.
 *
 * THE FOUR CLAIMS HERE, EACH FALSIFIABLE ALONE:
 *  1. every `font.*` key the two consumer files use exists — `t()` answers the
 *     key itself on a miss, which would render "font.kbSize" as visible copy;
 *  2. every `font.*` key in the catalogue is used by one of them — no dead key;
 *  3. every hint, category note, state label and retired reason the module
 *     exports is byte-identical to a catalogue value, and every family label
 *     is either that or exactly its own family name — the two halves the
 *     round's comment draws;
 *  4. no string literal in `lib/fonts.ts` carries a Hungarian accented
 *     character — the shape of a revert, regardless of which string it is.
 *
 * NO jsdom and no rendering: the registries are computed at import time from
 * `t()`, so asserting on them is asserting on what the picker renders.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  FONTS,
  FONT_CATEGORY_NOTES,
  HAND_FONTS,
  RETIRED_FONT_REASONS,
  type FontDef,
  type HandFontDef,
} from "../src/lib/fonts";
import { t, translationKeys } from "../src/lib/i18n";

const fontsSource = readFileSync(new URL("../src/lib/fonts.ts", import.meta.url), "utf8");
const pickerSource = readFileSync(
  new URL("../src/components/FontPicker.tsx", import.meta.url),
  "utf8",
);

/** Every key the two consumer files reach through `t()`, as written.
 *
 * The lookbehind keeps `format("woff2")` and friends out — anything ending in
 * `t` plus a quoted argument is not a translation call — and the `[),]`
 * admits `t("font.kbSize", { kb })`, whose argument the naive `t\("…"\)`
 * shape missed and whose key then read as dead.
 */
const usedKeys = new Set(
  [
    ...fontsSource.matchAll(/(?<=[^a-zA-Z_$])t\("([^"]+)"[),]/g),
    ...pickerSource.matchAll(/(?<=[^a-zA-Z_$])t\("([^"]+)"[),]/g),
  ].map((m) => m[1]!),
);

/** The catalogue's half: every key under the `font.` namespace. */
const catalogueKeys = translationKeys().filter((k) => k.startsWith("font."));
const catalogueValues = new Set(catalogueKeys.map((k) => t(k)));

describe("round 16 — the key set is closed in both directions", () => {
  test("the catalogue holds all twenty-one round-16 keys plus the picker's", () => {
    // 21 from lib/fonts.ts (5 notes + 12 hints + 2 labels + 2 retired reasons),
    // 11 from FontPicker. A floor, not a ceiling: a new face's hint grows this
    // and must grow a consumer with it, or the dead-key test below turns red.
    expect(catalogueKeys.length).toBeGreaterThanOrEqual(32);
  });

  test("every key the consumers use exists — no silent key fallback", () => {
    const unknown = [...usedKeys].filter((k) => !translationKeys().includes(k as never));
    expect(unknown, `t() would render these keys literally: ${unknown.join(", ")}`).toEqual([]);
  });

  test("every catalogue key is used by a consumer — no dead key", () => {
    const dead = catalogueKeys.filter((k) => !usedKeys.has(k));
    expect(dead, `keys nothing reaches: ${dead.join(", ")}`).toEqual([]);
  });
});

describe("round 16 — what the registries export is what the catalogue holds", () => {
  /** A label is either catalogue copy or exactly the proper noun it names. */
  const labelOk = (def: FontDef | HandFontDef): boolean =>
    (def.family !== null && def.label === def.family) || catalogueValues.has(def.label);

  test("every family label is its own proper noun or catalogue copy", () => {
    for (const def of FONTS) expect(labelOk(def), `${def.id}: label drifted`).toBe(true);
    for (const def of HAND_FONTS) expect(labelOk(def), `${def.id}: label drifted`).toBe(true);
  });

  test("every hint is byte-identical to a catalogue value", () => {
    for (const def of FONTS) {
      expect(def.hint.length, `${def.id}: empty hint`).toBeGreaterThan(0);
      expect(catalogueValues.has(def.hint), `${def.id}: hint is not a catalogue value`).toBe(true);
    }
    for (const def of HAND_FONTS) {
      expect(catalogueValues.has(def.hint), `${def.id}: hint is not a catalogue value`).toBe(true);
    }
  });

  test("the five category notes and the two state labels are catalogue values too", () => {
    for (const note of Object.values(FONT_CATEGORY_NOTES)) {
      expect(note.length).toBeGreaterThan(0);
      expect(catalogueValues.has(note), `category note is not a catalogue value`).toBe(true);
    }
    expect(FONTS[0]!.label).toBe(t("font.systemLabel"));
    expect(HAND_FONTS[0]!.label).toBe(t("font.handOffLabel"));
  });

  test("the retired-family reasons are keyed, byte-identical, and still per id", () => {
    // The batch8/batch12 pins (truthy reason per retired id; lato absent) read
    // the map after this resolves, so the toast contract holds unchanged —
    // what changed is only where the sentence lives.
    for (const [id, reason] of Object.entries(RETIRED_FONT_REASONS)) {
      expect(reason.length, `${id}: empty reason`).toBeGreaterThan(0);
      expect(catalogueValues.has(reason), `${id}: reason is not a catalogue value`).toBe(true);
    }
  });
});

describe("round 16 — the sweep cannot be quietly reverted", () => {
  test("no string literal in lib/fonts.ts carries a Hungarian accented character", () => {
    // Comments stripped first: the file's prose quotes "Rendszer" and
    // "Kikapcsolva" on purpose and is read by nobody's screen. Code is what
    // ships, and shipped literals must travel through the catalogue.
    const code = fontsSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    const raw = [...code.matchAll(/"[^"\n]*[áéíóöőúüűÁÉÍÓÖŐÚÜŰ][^"\n]*"/g)].map((m) => m[0]!);
    expect(raw, `raw Hungarian literals: ${raw.join(" | ")}`).toEqual([]);
  });

  test("the retired reasons reach the catalogue by key, not by value", () => {
    expect(fontsSource).toContain('t("font.retiredReason.manrope")');
    expect(fontsSource).toContain('t("font.retiredReason.plusJakartaSans")');
  });
});
