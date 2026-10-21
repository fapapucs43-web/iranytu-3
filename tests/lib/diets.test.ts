/**
 * The diet choice — the one value the weekly menu and the allergy warnings read.
 *
 * WHAT THIS FILE CAN PROVE, AND WHY IT IS SHAPED THIS WAY
 * `lib/diets` owns one storage key and one value, so everything worth pinning is
 * a property of that key: the registry is the nine declared ids in the declared
 * order, a choice survives a reload, `null` is a real state with its own storage
 * behaviour, an id the app does not know is refused rather than stored, and a
 * foreign blob loads as no choice at all.
 *
 * THE RESET IS NOT A CONVENIENCE
 * The state is a module binding shared by every file in one `bun test` run and
 * the module reads storage once, at import. Without `resetDiet()` between
 * tests, the first file to choose a diet would hand it to the next file's
 * `getDietType()` — the exact failure `lib/customFoods`'s test file documents.
 */
import type { DietId } from "../../src/lib/diets";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  DIET_IDS,
  DIET_NOTES,
  DIET_TYPES,
  getDietType,
  isDietId,
  resetDiet,
  setDietType,
  subscribeDiet,
} from "../../src/lib/diets";

const KEY = "belso-iranytu-diet-v1";

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

beforeEach(() => {
  for (const k of Object.keys(backing)) delete backing[k];
  resetDiet();
});

afterEach(() => {
  for (const k of Object.keys(backing)) delete backing[k];
  resetDiet();
});

describe("the twelve diets, as a registry", () => {
  test("the registry is exactly the twelve ids, in the order the picker shows them", () => {
    // The nine the first slice shipped, in their own order, plus the health-tab
    // audit's three — which sit BEFORE "other" on purpose: "Other" is the
    // reader saying none of these fit, so it stays the last button in the row.
    expect([...DIET_TYPES]).toEqual([
      "paleo",
      "keto",
      "mediterranean",
      "vegetarian",
      "vegan",
      "raw",
      "low-carb",
      "high-protein",
      "gluten-free",
      "lactose-free",
      "pescatarian",
      "other",
    ]);
    expect(new Set(DIET_TYPES).size).toBe(DIET_TYPES.length);
    expect(DIET_IDS.size).toBe(DIET_TYPES.length);
  });

  test("isDietId accepts exactly the registry and nothing else", () => {
    for (const id of DIET_TYPES) expect(isDietId(id), id).toBe(true);
    for (const junk of ["", "Paleo", "paleo ", "none", "other ", 42, null, undefined, {}]) {
      expect(isDietId(junk), String(junk)).toBe(false);
    }
  });
});

describe("one choice, on its own key", () => {
  test("starts with no choice made", () => {
    expect(getDietType()).toBeNull();
    expect(backing[KEY]).toBeUndefined();
  });

  test("persists a choice, and a fresh import of the module reads it back", async () => {
    setDietType("keto");
    expect(getDietType()).toBe("keto");
    expect(backing[KEY]).toBe("keto");
    // The load path, not the in-memory value: a cache-busted import is the only
    // honest way to ask what the next page load will see.
    const cold = await import(`../../src/lib/diets?reload=${Math.random()}`);
    expect(cold.getDietType()).toBe("keto");
  });

  test("clearing removes the key rather than storing a sentinel", () => {
    setDietType("vegan");
    setDietType(null);
    expect(getDietType()).toBeNull();
    expect(KEY in backing).toBe(false);
  });

  test("an id the app does not know is refused, and the stored choice stays", () => {
    setDietType("mediterranean");
    setDietType("carnivore" as DietId);
    setDietType("Paleo" as DietId);
    expect(getDietType()).toBe("mediterranean");
    expect(backing[KEY]).toBe("mediterranean");
  });

  test("choosing the same diet again is not an error and still notifies", () => {
    setDietType("raw");
    let calls = 0;
    const off = subscribeDiet(() => {
      calls += 1;
    });
    setDietType("raw");
    expect(calls).toBe(1);
    expect(getDietType()).toBe("raw");
    off();
  });

  test("a subscriber hears every change, and stops hearing after it unsubscribes", () => {
    const seen: (DietId | null)[] = [];
    const off = subscribeDiet(() => seen.push(getDietType()));
    setDietType("paleo");
    setDietType(null);
    off();
    setDietType("other");
    expect(seen).toEqual(["paleo", null]);
  });

  test("resetDiet forgets the choice in memory and in storage", () => {
    setDietType("high-protein");
    resetDiet();
    expect(getDietType()).toBeNull();
    expect(KEY in backing).toBe(false);
  });

  test("a corrupt or foreign blob loads as no choice rather than as a diet nobody can name", async () => {
    for (const blob of ["not json", '"Paleo"', '"carnivore"', "null", "{}", "3"]) {
      backing[KEY] = blob;
      const cold = await import(`../../src/lib/diets?repair=${encodeURIComponent(blob)}`);
      expect(cold.getDietType(), blob).toBeNull();
    }
  });
});

/**
 * The health audit's `DIET_NOTES` — the one sentence a chosen diet may say.
 *
 * The rule this guards is the app's own: an eating pattern may be named, a
 * question may be raised, and a professional may be pointed at. It may not be
 * diagnosed, and it may not be turned into a plan.
 */
describe("what a diet is allowed to say about itself", () => {
  test("only real diets carry a note, and the three the audit added carry one", () => {
    for (const id of Object.keys(DIET_NOTES)) {
      expect(isDietId(id), `${id} is not a diet id`).toBe(true);
    }
    for (const id of ["gluten-free", "lactose-free", "pescatarian"]) {
      expect(DIET_NOTES[id as DietId], `${id} has no note`).toBeTruthy();
    }
    // "Other" is the reader saying none of these fit: there is nothing to say.
    expect(DIET_NOTES.other).toBeUndefined();
  });

  test("every note points at a professional, and none of them diagnoses", () => {
    const PROFESSIONAL = ["szakember", "orvos", "dietetikus"];
    for (const [id, note] of Object.entries(DIET_NOTES)) {
      const hay = note!.toLowerCase();
      expect(
        PROFESSIONAL.some((word) => hay.includes(word)),
        `${id}'s note names no professional to ask`,
      ).toBe(true);
      expect(hay, `${id}'s note diagnoses`).not.toContain("diagnózis");
      expect(note!.length, `${id}'s note is a sentence, not a paragraph`).toBeLessThan(400);
    }
  });

  test("the notes are distinct — one text cannot stand in for another", () => {
    const texts = Object.values(DIET_NOTES);
    expect(new Set(texts).size).toBe(texts.length);
  });
});
