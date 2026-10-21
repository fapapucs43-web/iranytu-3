/**
 * The `sectionOrder` repair, at the storage boundary.
 *
 * `settings.tabOrder` is one array, so its repair is one `Array.isArray` check.
 * `sectionOrder` is a MAP of arrays, which means it can be wrong in two ways at
 * once, and the first repair cannot see either of them: an array passes
 * `Array.isArray` and is not a map, and a map whose per-tab value is a string
 * passes the field-level check whole.
 *
 * Why this matters and is not a defensive nicety: `sectionOrder` crosses the
 * import boundary like every other field, and the thing it feeds
 * (`orderSections`) is total by contract — it will not throw on a string, it
 * will fall back to the default. So the symptom of getting this wrong is not a
 * crash. It is a reader who rearranges a tab, exports, re-imports on another
 * device, and finds the arrangement silently gone — with nothing to indicate
 * that anything was ever stored.
 *
 * The store repairs it so the field that survives the read is always something
 * `orderSections` can be handed without a guard at the call site, which is
 * where a second answer to "what is an arrangement" would otherwise grow.
 */
import { describe, expect, test, beforeEach } from "bun:test";

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

const KEY = "belso-iranytu-data-v2";

/**
 * Seed the blob, then import a fresh copy of the store so it reads it.
 *
 * `read()` runs on first access, so the storage has to be in place BEFORE the
 * module body is evaluated — which is why the import is dynamic and inside the
 * helper rather than at the top of the file.
 */
async function readSettings(sectionOrder: unknown): Promise<Record<string, unknown>> {
  backing[KEY] = JSON.stringify({
    version: 2,
    entries: [],
    settings: { sectionOrder },
  });
  const store = await import(`../../src/lib/store?t=${Object.keys(backing).length}-${Math.random()}`);
  return (store.getState().settings as unknown as Record<string, unknown>);
}

beforeEach(() => {
  for (const k of Object.keys(backing)) delete backing[k];
});

describe("a sectionOrder that is not a map of arrangements is dropped", () => {
  test("an array is not a map, however array-shaped it is", async () => {
    // Asserted on its own because it is the case the neighbouring repair cannot
    // see, and it is what a hand-edited export would most plausibly contain.
    const settings = await readSettings(["mood", "balance"]);
    expect("sectionOrder" in settings).toBe(false);
  });

  test("a string, a number, a boolean and null all lose the field", async () => {
    for (const junk of ["mood,balance", 42, true, null]) {
      const settings = await readSettings(junk);
      expect("sectionOrder" in settings, `for ${JSON.stringify(junk)}`).toBe(false);
    }
  });

  test("absence is left alone — that is the default order, not corruption", async () => {
    const settings = await readSettings(undefined);
    expect("sectionOrder" in settings).toBe(false);
  });
});

describe("a map with a bad tab loses only that tab", async () => {
  test("the good tabs survive, the bad one goes", async () => {
    const settings = await readSettings({
      today: ["lessons", "mood"],
      journal: "nincs ilyen",
      insights: ["grid", "trends"],
      settings: 7,
    });
    expect(settings.sectionOrder).toEqual({
      today: ["lessons", "mood"],
      insights: ["grid", "trends"],
    });
  });

  test("a tab whose value is null is dropped too", async () => {
    // `??` would not catch this, and a null array reaches `orderSections` as
    // something that is not an array — tolerated, but never what was meant.
    const settings = await readSettings({ today: null, journal: ["a", "b"] });
    expect(settings.sectionOrder).toEqual({ journal: ["a", "b"] });
  });

  test("a well-formed map is left exactly as stored", async () => {
    const stored = { today: ["b", "a"], journal: ["c"] };
    const settings = await readSettings(stored);
    expect(settings.sectionOrder).toEqual(stored);
  });

  test("the store does not invent tabs or rewrite the arrays inside them", async () => {
    // `orderSections` owns what a stored id MEANS — an unknown id is dropped
    // and a missing one put back. The store only owns whether the shape is an
    // arrangement at all, so it must not pre-empt that with a second opinion.
    const settings = await readSettings({
      today: ["ghost", "mood"],
      nonsense: ["whatever"],
    });
    expect(settings.sectionOrder).toEqual({ today: ["ghost", "mood"], nonsense: ["whatever"] });
  });
});