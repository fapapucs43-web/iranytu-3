/**
 * The reader's own foods — the module the meal log's autocomplete leans on.
 *
 * WHAT THIS FILE CAN PROVE, AND WHY IT IS SHAPED THIS WAY
 * `lib/customFoods` owns one storage key and nothing else, so everything worth
 * pinning is a property of that key and of the list read back from it: a name
 * survives a reload, a blank one is refused, a duplicate is refused rather than
 * doubled, order is newest-first, matching is a case-insensitive substring, and
 * removal is by id. The corrupt-blob cases are here for the same reason they are
 * in `lib/nutrition`'s test: `localStorage` is user-shaped data, and a hand-
 * edited key must leave a usable list rather than throw at boot.
 *
 * THE RESET IS NOT A CONVENIENCE
 * The list is a module binding shared by every file in the run, and the module
 * reads storage once, at import. Without `resetCustomFoods()` between tests, the
 * first file to add a food would hand it to the next test's `getCustomFoods()`
 * and half of the assertions below would be about the previous case. That was
 * the state this file shipped in for one commit; the reset is the fix, and it
 * exists on the module for exactly this call.
 */
import type { CustomFood } from "../../src/lib/customFoods";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  addCustomFood,
  customFoodMatches,
  getCustomFoods,
  hasCustomFoodName,
  removeCustomFood,
  resetCustomFoods,
} from "../../src/lib/customFoods";

const KEY = "belso-iranytu-custom-foods-v1";

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
  resetCustomFoods();
});

afterEach(() => {
  for (const k of Object.keys(backing)) delete backing[k];
  resetCustomFoods();
});

function asNames(list: readonly CustomFood[]): string[] {
  return list.map((f) => f.name);
}

describe("custom foods", () => {
  test("starts empty", () => {
    expect(asNames(getCustomFoods())).toEqual([]);
  });

  test("persists a food, and a fresh import of the module reads it back", async () => {
    const a = addCustomFood("Lecsó");
    expect(a).not.toBeNull();
    expect(a!.name).toBe("Lecsó");
    expect((JSON.parse(backing[KEY]!) as CustomFood[])[0]!.name).toBe("Lecsó");
    // The load path, not the in-memory list: a cache-busted import is the only
    // honest way to ask what the next page load will see.
    const cold = await import(`../../src/lib/customFoods?reload=${Math.random()}`);
    expect(asNames(cold.getCustomFoods())).toEqual(["Lecsó"]);
  });

  test("rejects blank names", () => {
    expect(addCustomFood("   ")).toBeNull();
    expect(addCustomFood("")).toBeNull();
    expect(getCustomFoods()).toEqual([]);
  });

  test("rejects a duplicate name case-insensitively, and keeps the first spelling", () => {
    expect(addCustomFood("Lecsó")).not.toBeNull();
    expect(addCustomFood("lecsó")).toBeNull();
    expect(addCustomFood("LECSÓ")).toBeNull();
    expect(asNames(getCustomFoods())).toEqual(["Lecsó"]);
  });

  test("returns newest first", async () => {
    addCustomFood("A");
    await new Promise((r) => setTimeout(r, 30));
    addCustomFood("B");
    expect(asNames(getCustomFoods())).toEqual(["B", "A"]);
  });

  test("matches by substring, case-insensitive, and an empty query matches nothing", () => {
    addCustomFood("Uborka saláta");
    addCustomFood("Uborka");
    addCustomFood("Rántotta");
    expect(asNames(customFoodMatches("uborka"))).toEqual([
      "Uborka",
      "Uborka saláta",
    ]);
    // CAPITALS with their accents: the comparison lowercases, and it does not
    // strip diacritics — the same one-line rule the catalogue matcher uses.
    expect(asNames(customFoodMatches("SALÁTA"))).toEqual(["Uborka saláta"]);
    expect(asNames(customFoodMatches(""))).toEqual([]);
    expect(asNames(customFoodMatches("   "))).toEqual([]);
  });

  test("matches against a caller's snapshot when one is passed", () => {
    // The meal log renders from a snapshot it took when it opened; the list it
    // filters is the list it draws, so a stale module state cannot answer for it.
    const snapshot: CustomFood[] = [
      { id: "1", name: "Lecsó", addedAt: 1 },
      { id: "2", name: "Krumplipaprikás", addedAt: 2 },
    ];
    expect(asNames(customFoodMatches("krumpli", snapshot))).toEqual(["Krumplipaprikás"]);
    expect(asNames(customFoodMatches("lecsó", snapshot))).toEqual(["Lecsó"]);
    // And the snapshot is READ, not written: the module's own list is untouched.
    expect(getCustomFoods()).toEqual([]);
    expect(asNames(customFoodMatches("krumpli"))).toEqual([]);
  });

  test("hasCustomFoodName is case-insensitive", () => {
    addCustomFood("Görög saláta");
    expect(hasCustomFoodName("Görög saláta")).toBe(true);
    expect(hasCustomFoodName("görög SALÁTA")).toBe(true);
    expect(hasCustomFoodName("  GÖRÖG SALÁTA  ")).toBe(true);
    expect(hasCustomFoodName("Rántotta")).toBe(false);
  });

  test("remove deletes by id", () => {
    const a = addCustomFood("A");
    const b = addCustomFood("B");
    expect(removeCustomFood(a!.id)).toBe(true);
    expect(asNames(getCustomFoods())).toEqual(["B"]);
    expect(removeCustomFood(a!.id)).toBe(false);
    expect(removeCustomFood("no-such")).toBe(false);
  });

  test("a corrupt or foreign blob loads as an empty-ish list rather than throwing", async () => {
    for (const blob of ["not json", '"a string"', "[1,2,3]", "null", "{}"]) {
      backing[KEY] = blob;
      const cold = await import(
        `../../src/lib/customFoods?repair=${encodeURIComponent(blob)}`
      );
      expect(asNames(cold.getCustomFoods()), blob).toEqual([]);
    }

    backing[KEY] = JSON.stringify([
      { id: "keep", name: "  Lecsó  ", addedAt: 5 },
      { id: "no-name", name: "   ", addedAt: 5 },
      { id: "no-id", name: "Krumpli" },
      { name: "id-less", addedAt: 5 },
      "not an object",
    ]);
    const cold = await import("../../src/lib/customFoods?repair=partial");
    const kept = cold.getCustomFoods();
    expect(kept).toHaveLength(1);
    expect(kept[0]!.id).toBe("keep");
    expect(kept[0]!.name).toBe("Lecsó");
  });
});
