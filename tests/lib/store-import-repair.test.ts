/**
 * The import path, at the storage boundary.
 *
 * FOUND BY FUZZING, NOT BY A FAILING TEST. Every entry reaches the app through
 * one of four doors — `read()` on load, `migrateLegacy`, `upsertEntry` on save,
 * and `importEntries` — and the first three all ran the entry through
 * `normalizeEntry`. The fourth did not. So a JSON file with a hand-edited (or
 * simply foreign) field was the one way to put junk in front of the whole app,
 * and the three symptoms were all reproducible:
 *
 *   - `mood: "rossz"` reached `mean()` as itself, and the analysis screen
 *     rendered the sentence "NaN ponttal magasabb volt a hangulatod" to the
 *     reader. Not a crash — a wrong sentence, which is worse in a mood app
 *     because nothing looks broken.
 *   - `activities: null` (or any non-iterable) threw inside
 *     `for (const tag of entry.activities)` and took the view down.
 *   - `date: ""` or `date: "x"` survived `?? todayISO()` — `??` only catches
 *     null and undefined — and threw inside `fromISODate`.
 *
 * So the assertions below are made against what the READER WOULD SEE wherever a
 * stored field can reach a sentence. Asserting only that the store holds a
 * number would have passed while the NaN was still on screen.
 *
 * Fresh, cache-busted store copies per scenario, because the store reads
 * localStorage once at module-evaluation time.
 */
import { describe, expect, test } from "bun:test";
import { generateInsights } from "../../src/lib/patternInsights";
import { tagCorrelations } from "../../src/lib/analysis";
import type { Entry } from "../../src/types";

const backing: Record<string, string> = {};
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => (k in backing ? backing[k] : null),
  setItem: (k: string, v: string) => {
    backing[k] = v;
  },
  removeItem: (k: string) => {
    delete backing[k];
  },
};

function clear() {
  for (const k of Object.keys(backing)) delete backing[k];
}

async function freshStore() {
  return import(`../../src/lib/store?import-repair=${Math.random()}`);
}

const entry = (over: Record<string, unknown>, index: number): Record<string, unknown> => ({
  id: `e${index}`,
  date: `2026-07-${String(1 + index).padStart(2, "0")}`,
  mood: index % 2 === 0 ? 5 : 1,
  stress: index % 2 === 0 ? 2 : 9,
  energy: 3,
  note: "",
  tags: [],
  emotions: [],
  activities: index % 2 === 0 ? ["Futás"] : [],
  reflection: { feeling: "", stressReason: "", need: "" },
  vitals: { restingHr: null, hrv: null, sleepHours: index % 2 === 0 ? 8 : 5 },
  source: "manual",
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

/** A realistic backdrop: fourteen clean days, so the engines have something to say. */
const cleanDays = (): Record<string, unknown>[] =>
  Array.from({ length: 14 }, (_, i) => entry({}, 10 + i));

/** The check that matters: nothing a reader could be shown contains NaN. */
function sentences(entries: Entry[]): string[] {
  return generateInsights(entries).map((i) => i.text);
}

describe("import — a mood that is not a number", () => {
  test("renders no NaN in any sentence", async () => {
    clear();
    const { importEntries, getState } = await freshStore();
    importEntries([
      entry({ date: "2026-07-20", mood: "rossz" }, 0),
      ...cleanDays(),
    ] as unknown as Entry[]);

    const texts = sentences(getState().entries);
    expect(texts.length).toBeGreaterThan(0);
    for (const text of texts) expect(text).not.toContain("NaN");
  });

  test("an object in mood is repaired rather than propagated", async () => {
    clear();
    const { importEntries, getState } = await freshStore();
    importEntries([entry({ date: "2026-07-20", mood: {} }, 0)] as unknown as Entry[]);
    const stored = getState().entries.find((e) => e.date === "2026-07-20");
    // Not merely "not NaN" — a number the rest of the app can arithmetic on.
    expect(typeof stored?.mood).toBe("number");
    expect(Number.isFinite(stored?.mood)).toBe(true);
  });

  test("a legacy emoji mood is read, not discarded", async () => {
    // `mapLegacyMood` exists for exactly this vocabulary and was already
    // imported for `migrateLegacy`. A v1-style row arriving through the import
    // should come out as a level, not fall to the neutral 3.
    clear();
    const { importEntries, getState } = await freshStore();
    importEntries([entry({ date: "2026-07-20", mood: "😄" }, 0)] as unknown as Entry[]);
    const stored = getState().entries.find((e) => e.date === "2026-07-20");
    expect(stored?.mood).toBe(5);
  });

  test("an off-grid NUMBER still survives, because the migration depends on it", async () => {
    // The counter-test to the one above, and the reason this fix is narrow.
    // `tests/lib/recording-storage.test.ts` documents a row whose level is out
    // of range: the migration cannot re-derive its coordinates from it, and one
    // coordinate is meant to survive as itself. Repairing every off-grid number
    // to 3 here would make that documented branch unreachable — this test is what
    // stopped the wider fix.
    clear();
    const { importEntries, getState } = await freshStore();
    importEntries([entry({ date: "2026-07-20", mood: 7 }, 0)] as unknown as Entry[]);
    const stored = getState().entries.find((e) => e.date === "2026-07-20");
    expect(stored?.mood).toBe(7);
  });
});

describe("import — the array fields", () => {
  test("a non-array activities does not throw and does not vanish", async () => {
    // Two separate failures lived here. `null` THREW at
    // `for (const tag of entry.activities)`. A STRING did not throw but
    // iterated as characters, so every character scored `count: 1` and the
    // engine's own floor dropped the day — the activity silently disappeared
    // from the analysis, which is a quieter loss than the crash.
    clear();
    const { importEntries, getState } = await freshStore();
    importEntries([
      entry({ date: "2026-07-20", activities: "Futás" }, 0),
      entry({ date: "2026-07-19", activities: null }, 1),
      entry({ date: "2026-07-18", activities: 42 }, 2),
      ...cleanDays(),
    ] as unknown as Entry[]);

    const state = getState();
    expect(() => generateInsights(state.entries)).not.toThrow();
    const stats = tagCorrelations(state.entries);
    // The clean days carry "Futás" on their even-numbered days — seven of the
    // fourteen. The string row must not have been filed under F-u-t-á-s, and the
    // null and number rows must not have counted at all.
    const futas = stats.find((s) => s.tag === "Futás");
    expect(futas?.count).toBe(7);
    expect(stats.some((s) => s.tag.length === 1)).toBe(false);
  });

  test("tags and emotions get the same treatment", async () => {
    clear();
    const { importEntries, getState } = await freshStore();
    importEntries([entry({ date: "2026-07-20", tags: "x", emotions: 7 }, 0)] as unknown as Entry[]);
    const stored = getState().entries.find((e) => e.date === "2026-07-20");
    expect(stored?.tags).toEqual([]);
    expect(stored?.emotions).toEqual([]);
  });
});

describe("import — the date", () => {
  test("an empty or malformed date is repaired instead of throwing", async () => {
    // `?? todayISO()` cannot catch `""` — only null and undefined — so these
    // passed through and blew up later inside `fromISODate`.
    for (const bad of ["", "x", "2026-13-45"]) {
      clear();
      const { importEntries, getState } = await freshStore();
      importEntries([entry({ date: bad }, 0), ...cleanDays()] as unknown as Entry[]);
      const stored = getState().entries.find((e) => e.id === "e0");
      expect(typeof stored?.date).toBe("string");
      expect(stored?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(() => generateInsights(getState().entries)).not.toThrow();
    }
  });

  test("a non-string date is repaired too", async () => {
    for (const bad of [42, {}, null, undefined]) {
      clear();
      const { importEntries, getState } = await freshStore();
      importEntries([entry({ date: bad }, 0)] as unknown as Entry[]);
      expect(() => generateInsights(getState().entries)).not.toThrow();
    }
  });

  test("an entry is filed under the SAME date it carries", async () => {
    // The subtlety inside the fix. Keying the merge map on the RAW date while
    // storing the NORMALISED one would file a repaired entry under `""` while
    // its own `date` said today — and `upsertEntry` finds by date, so that entry
    // could never be updated again. A repaired entry that cannot be edited is a
    // new bug made while fixing the first one, so it gets its own test.
    clear();
    const { importEntries, getState } = await freshStore();
    importEntries([entry({ date: "x" }, 0)] as unknown as Entry[]);
    const state = getState();
    expect(state.entries).toHaveLength(1);
    const stored = state.entries[0]!;
    expect(stored.date).not.toBe("");
    expect(stored.date).not.toBe("x");
    // No entry disagrees with its own key, and none is unreachable by date.
    const byDate = state.entries.filter((e) => e.date === stored.date);
    expect(byDate).toHaveLength(1);
  });

  test("a valid ISO date is left exactly as it was", async () => {
    clear();
    const { importEntries, getState } = await freshStore();
    importEntries([entry({ date: "2026-07-20" }, 0)] as unknown as Entry[]);
    expect(getState().entries.find((e) => e.id === "e0")?.date).toBe("2026-07-20");
  });
});

describe("import — the root cause", () => {
  test("importEntries routes through the same normaliser as every other door", async () => {
    // Stated directly, so the suite fails if someone "optimises" the call away.
    // The symptom tests above are all downstream of this one line.
    const source = await Bun.file("src/lib/store.ts").text();
    const body = source.slice(source.indexOf("export function importEntries"));
    const block = body.slice(0, body.indexOf("\n}"));
    expect(block).toContain("normalizeEntry");
  });
});