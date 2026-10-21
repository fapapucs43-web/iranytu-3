/**
 * Batch 15, Phase 2 commit 4 — the meal log's three halves, tested where each
 * can actually fail.
 *
 *   THE REGISTRY is content, so what is worth pinning is not the food names but
 *   the ARITHMETIC that has to agree across sixty rows: unique ids, a portion
 *   for every entry, and a calorie figure that is within a rounding error of
 *   4/4/9 over the macros. A row whose numbers disagree with its own kcal is a
 *   row that makes the daily total lie, and nothing else in the app would
 *   notice.
 *
 *   THE ALLERGY RULE is the feature the batch was asked for, and its whole
 *   behaviour is a substring match — so it is tested at the edges that matter:
 *   an allergen nobody marked warns about nothing, a keyword inside a longer
 *   word still matches (`tej` in `Tejföl`), case does not decide anything, and
 *   the answer comes back in `ALLERGENS` order so two calls cannot print two
 *   different sentences.
 *
 *   THE STORE is where corruption arrives. `localStorage` is user-shaped data,
 *   so the load path is tested with a food id the registry no longer has, a
 *   meal that is not an array, a day key that is not a date and a blob that is
 *   not an object at all — each of which must leave a usable log rather than a
 *   throw at boot. The shim below is the repo's own pattern (recording-storage
 *   and batch7-store both do this): a plain object with three methods, so the
 *   module's writes are observable without a browser.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  ALLERGENS,
  ALLERGEN_IDS,
  CUSTOM_FOOD_ID,
  FOODS,
  MEAL_TYPES,
  addMealItem,
  addMealItems,
  allergyHits,
  dayItems,
  dayTotals,
  foodById,
  foodFromName,
  foodMatches,
  getNutritionLog,
  mealTotals,
  removeMealItem,
  resetNutrition,
  subscribeNutrition,
  totalsOf,
  type AllergenId,
} from "../../src/lib/nutrition";
import { mealIdea } from "../../src/lib/nutritionTips";

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

const KEY = "belso-iranytu-nutrition-log-v1";
const D1 = "2026-10-05";
const D2 = "2026-10-06";

beforeEach(() => {
  for (const k of Object.keys(backing)) delete backing[k];
  resetNutrition();
});
afterEach(() => {
  for (const k of Object.keys(backing)) delete backing[k];
  resetNutrition();
});

/* ------------------------------ the registry ----------------------------- */

describe("the food registry is arithmetic that agrees with itself", () => {
  test("every id is unique, and every row has a portion and a positive name", () => {
    const ids = FOODS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(FOODS.length).toBeGreaterThanOrEqual(40);
    for (const f of FOODS) {
      expect(f.name.trim(), f.id).not.toBe("");
      expect(f.portion.trim(), f.id).not.toBe("");
    }
  });

  test("no row's kcal disagrees with its own macros, except the two a drink explains", () => {
    // 4/4/9 is the standard factor table, and a food whose printed calories are
    // inconsistent with its printed macros would make `dayTotals` a guess about
    // which number to believe. Two exemptions, and both are facts about food
    // rather than slack in the test:
    //
    //  - a row under 50 kcal is dominated by rounding (a tomato is 27 kcal and
    //    its macros round to 32), so the ratio is noise there;
    //  - alcohol is 7 kcal/g and is not one of the three macros, so a DRINK's
    //    printed calories must sit ABOVE what its macros explain. That is a
    //    direction to assert, not a gap to tolerate: a beer row that agreed
    //    with 4/4/9 would be a row whose alcohol had gone missing.
    const ALCOHOL = new Set(["beer", "wine"]);
    const off: string[] = [];
    for (const f of FOODS) {
      if (f.kcal < 50) continue;
      const fromMacros = 4 * f.protein + 4 * f.carb + 9 * f.fat;
      const ratio = (f.kcal - fromMacros) / f.kcal;
      if (ALCOHOL.has(f.id)) {
        expect(ratio, f.id).toBeGreaterThan(0.2);
        continue;
      }
      if (Math.abs(ratio) > 0.15) {
        off.push(`${f.id}: kcal ${f.kcal} vs macros ${Math.round(fromMacros)}`);
      }
    }
    expect(off).toEqual([]);
  });

  test("looking up an id the registry does not have answers undefined", () => {
    expect(foodById("nope")).toBeUndefined();
    expect(foodById("oat")?.portion).toBe("60 g");
  });

  test("the catalogue suggests a row by any part of its name, and nothing for an empty query", () => {
    // The catalogue half of the meal log's autocomplete. The two cases that
    // must not be answered with the WHOLE registry are the empty box and the
    // blank one: a list that opens on sixty rows is not a suggestion.
    expect(foodMatches("zabpehely").map((f) => f.id)).toEqual(["oat"]);
    expect(foodMatches("ZABP").map((f) => f.id)).toEqual(["oat"]);
    expect(foodMatches("kenyér").map((f) => f.id)).toEqual(["bread-whole", "bread-white"]);
    expect(foodMatches("")).toEqual([]);
    expect(foodMatches("   ")).toEqual([]);
    expect(foodMatches("nem-letezik")).toEqual([]);
  });
});

/* ------------------------------- the rule -------------------------------- */

describe("the allergy rule is a substring rule over the food's NAME", () => {
  const food = (id: string) => foodById(id)!;

  test("an allergen nobody marked warns about nothing, even on an obvious dish", () => {
    expect(allergyHits(food("peanut"), [])).toEqual([]);
    expect(allergyHits(food("milk"), [])).toEqual([]);
  });

  test("a keyword inside a longer word still matches — tej in Tejföl", () => {
    expect(allergyHits(food("sour-cream"), ["milk"])).toEqual(["milk"]);
    expect(allergyHits(food("greek-yoghurt"), ["milk"])).toEqual(["milk"]);
  });

  test("a marked allergen the name does not mention stays quiet", () => {
    expect(allergyHits(food("water"), ["milk", "gluten", "fish"])).toEqual([]);
  });

  test("the answer is in ALLERGENS order, not in the marked order", () => {
    // Tahini's name hits both `nut` (its keyword list) and `sesame`; the order
    // must come from the registry so the printed sentence is stable whatever
    // order the reader marked them in.
    const marked: AllergenId[] = ["sesame", "nut"];
    expect(allergyHits(food("tahini"), marked)).toEqual(["nut", "sesame"]);
    expect(allergyHits(food("tahini"), [...marked].reverse())).toEqual(["nut", "sesame"]);
  });

  test("matching is case-insensitive on both sides", () => {
    expect(allergyHits({ ...food("salmon"), name: "LAZAC filé" }, ["fish"])).toEqual(["fish"]);
  });

  test("the ten allergens the batch named are the ten the module has, in order", () => {
    expect(ALLERGENS.map((a) => a.id)).toEqual([
      "peanut",
      "nut",
      "milk",
      "egg",
      "gluten",
      "soy",
      "fish",
      "shellfish",
      "sesame",
      "sulphite",
    ]);
    // The store repairs a stored list against this set, so it has to be the
    // same ten ids the rule knows.
    expect([...ALLERGEN_IDS].sort()).toEqual(ALLERGENS.map((a) => a.id).sort());
    for (const a of ALLERGENS) expect(a.keywords.length, a.id).toBeGreaterThan(0);
  });
});

/* ------------------------------- the maths ------------------------------- */

describe("the totals add up the way a reader would add them up", () => {
  test("one portion is the registry row, and half a portion is half of it", () => {
    const oat = foodById("oat")!;
    expect(totalsOf(oat, 1)).toEqual({ kcal: 228, protein: 8, carb: 39, fat: 5 });
    expect(totalsOf(oat, 2).kcal).toBe(456);
    expect(totalsOf(oat, 0.5).kcal).toBe(114);
  });

  test("a nonsense serving count contributes nothing rather than NaN", () => {
    const oat = foodById("oat")!;
    for (const bad of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(totalsOf(oat, bad)).toEqual({ kcal: 0, protein: 0, carb: 0, fat: 0 });
    }
  });

  test("a day's totals are the sum of its items, and the meals agree with them", () => {
    addMealItem(D1, "breakfast", "oat", 1);
    addMealItem(D1, "lunch", "chicken", 1);
    addMealItem(D1, "lunch", "rice", 2);
    const day = dayTotals(getNutritionLog(), D1);
    const meals = MEAL_TYPES.map((m) => mealTotals(getNutritionLog(), D1, m));
    expect(day.items).toBe(3);
    expect(day.kcal).toBe(meals.reduce((n, m) => n + m.kcal, 0));
    expect(day.protein).toBe(meals.reduce((n, m) => n + m.protein, 0));
  });

  test("an untouched day is zero and empty, not null and not a throw", () => {
    expect(dayTotals(getNutritionLog(), "2030-01-01")).toEqual({
      kcal: 0,
      protein: 0,
      carb: 0,
      fat: 0,
      items: 0,
    });
    expect(dayItems(getNutritionLog(), "2030-01-01")).toEqual([]);
  });
});

/* ------------------------------- the store ------------------------------- */

describe("the log survives being written, read back and corrupted", () => {
  test("an item is added, persisted, and read back through the same day", () => {
    const item = addMealItem(D1, "dinner", "salmon", 1);
    expect(item).not.toBeNull();
    const stored = JSON.parse(backing[KEY]!);
    expect(stored[D1].dinner[0].foodId).toBe("salmon");
    expect(dayItems(getNutritionLog(), D1)).toHaveLength(1);
    expect(dayItems(getNutritionLog(), D2)).toHaveLength(0);
  });

  test("an id the registry does not have is refused before it is written", () => {
    expect(addMealItem(D1, "lunch", "unicorn", 1)).toBeNull();
    expect(backing[KEY]).toBeUndefined();
  });

  test("a serving count is clamped to something a plate could hold", () => {
    const item = addMealItem(D1, "lunch", "rice", 99)!;
    expect(item.servings).toBe(10);
    expect(addMealItem(D1, "lunch", "rice", -1)!.servings).toBe(1);
  });

  test("removing the last item of a day leaves the day — and the log — empty", () => {
    const item = addMealItem(D1, "snack", "apple", 1)!;
    removeMealItem(D1, "snack", item.id);
    expect(getNutritionLog()[D1]).toBeUndefined();
    expect(backing[KEY]).toBe("{}");
  });

  test("subscribers hear about a write and a removal, and stop when they unsubscribe", () => {
    let heard = 0;
    const off = subscribeNutrition(() => {
      heard += 1;
    });
    const item = addMealItem(D1, "lunch", "apple", 1)!;
    removeMealItem(D1, "lunch", item.id);
    expect(heard).toBe(2);
    off();
    addMealItem(D1, "lunch", "apple", 1);
    expect(heard).toBe(2);
  });

  test("a blob full of nonsense loads as an empty log rather than throwing", async () => {
    for (const blob of ["not json", '"a string"', "[1,2,3]", "null"]) {
      backing[KEY] = blob;
      const cold = await import(`../../src/lib/nutrition?repair-${encodeURIComponent(blob)}`);
      expect(cold.getNutritionLog(), blob).toEqual({});
    }
  });

  test("a repairable blob keeps what it can and drops what it cannot", async () => {
    backing[KEY] = JSON.stringify({
      [D1]: {
        lunch: [
          { id: "a", foodId: "oat", servings: 1 },
          { id: "b", foodId: "gone-from-the-registry", servings: 1 },
          { id: "c", servings: 1 },
        ],
        bogusMeal: [{ id: "d", foodId: "oat", servings: 1 }],
      },
      "not-a-date": { lunch: [{ id: "e", foodId: "oat", servings: 1 }] },
      [D2]: "not an object",
    });
    const cold = await import("../../src/lib/nutrition?repair-partial");
    const log = cold.getNutritionLog();
    expect(Object.keys(log)).toEqual([D1]);
    expect(log[D1].lunch).toHaveLength(1);
    expect(log[D1].lunch[0].foodId).toBe("oat");
    expect(log[D1].bogusMeal).toBeUndefined();
    expect(log[D2]).toBeUndefined();
  });
});

/* -------------------- a food the reader typed themselves ----------------- */

describe("the reader's own food is a name, and the numbers stay honest", () => {
  test("only a custom item with a real name is accepted; an unknown id still is not", () => {
    expect(addMealItem(D1, "lunch", "unicorn", 1)).toBeNull();
    // `unicorn` is not the custom id, so a name cannot smuggle it in either.
    expect(addMealItem(D1, "lunch", "unicorn", 1, "Lecsó")).toBeNull();
    expect(addMealItem(D1, "lunch", CUSTOM_FOOD_ID, 1)).toBeNull();
    expect(addMealItem(D1, "lunch", CUSTOM_FOOD_ID, 1, "   ")).toBeNull();
    expect(backing[KEY]).toBeUndefined();

    const item = addMealItem(D1, "lunch", CUSTOM_FOOD_ID, 1, "  Lecsó  ")!;
    expect(item).not.toBeNull();
    expect(item.customName).toBe("Lecsó");
    expect(item.foodId).toBe(CUSTOM_FOOD_ID);
  });

  test("a custom food counts as an item and contributes no numbers", () => {
    addMealItem(D1, "lunch", "oat", 1);
    addMealItem(D1, "lunch", CUSTOM_FOOD_ID, 1, "Lecsó");
    const day = dayTotals(getNutritionLog(), D1);
    // The ITEM is on the list — a day of the reader's own foods is not empty —
    // and the macros are the registry row's alone, because zero is a number
    // somebody would believe and there is no number to print.
    expect(day.items).toBe(2);
    expect(day.kcal).toBe(228);
    expect(day.protein).toBe(8);
    // The meal head reads `mealTotals`; a custom item must not pull it to zero
    // without saying so, which is what `mealTotals` answering 0 lets the card's
    // own `hasNumbers` guard handle.
    expect(mealTotals(getNutritionLog(), D1, "lunch")).toEqual({
      kcal: 228,
      protein: 8,
      carb: 39,
      fat: 5,
    });
    expect(mealTotals(getNutritionLog(), D1, "snack").kcal).toBe(0);
  });

  test("the item hands back no registry row, so no caller can add invented numbers", () => {
    addMealItem(D1, "dinner", CUSTOM_FOOD_ID, 1, "Lecsó");
    const [entry] = dayItems(getNutritionLog(), D1);
    expect(entry!.item.customName).toBe("Lecsó");
    expect(entry!.food).toBeUndefined();
    // The definition the card draws the name from is the zero-value one, and it
    // is a separate function so the allergy rule can read the name.
    const named = foodFromName("Lecsó");
    expect(named).toEqual({
      id: CUSTOM_FOOD_ID,
      name: "Lecsó",
      portion: "",
      kcal: 0,
      protein: 0,
      carb: 0,
      fat: 0,
    });
    expect(allergyHits(foodFromName("Tejes lecsó"), ["milk"])).toEqual(["milk"]);
  });

  test("a stored custom item survives a reload; one without a name is dropped", async () => {
    backing[KEY] = JSON.stringify({
      [D1]: {
        lunch: [
          { id: "a", foodId: CUSTOM_FOOD_ID, servings: 2, customName: "Lecsó" },
          { id: "b", foodId: CUSTOM_FOOD_ID, servings: 1 },
          { id: "c", foodId: "gone-from-the-registry", servings: 1 },
        ],
      },
    });
    const cold = await import("../../src/lib/nutrition?repair=custom-items");
    const kept = cold.getNutritionLog()[D1].lunch;
    expect(kept).toHaveLength(1);
    expect(kept[0].customName).toBe("Lecsó");
    expect(cold.dayTotals(cold.getNutritionLog(), D1).items).toBe(1);
  });
});

/* --------------------------- the suggestion line ------------------------- */

describe("the meal idea speaks only when the day gives it something true", () => {
  test("an empty day says nothing", () => {
    expect(mealIdea({ kcal: 0, protein: 0, carb: 0, fat: 0 }, 0, [])).toBeNull();
  });

  test("a low-protein day names two foods the reader is not allergic to", () => {
    const text = mealIdea({ kcal: 900, protein: 8, carb: 120, fat: 20 }, 3, [])!;
    expect(text).toContain("lencse");
    expect(text).toContain("csirkemell");
  });

  test("marking an allergen takes that food out of the suggestion", () => {
    const noEgg = mealIdea({ kcal: 900, protein: 8, carb: 120, fat: 20 }, 3, ["egg"])!;
    expect(noEgg).not.toContain("tojás");
    const noMilkEither = mealIdea({ kcal: 900, protein: 8, carb: 120, fat: 20 }, 3, [
      "egg",
      "milk",
      "soy",
    ])!;
    expect(noMilkEither).not.toContain("joghurt");
    expect(noMilkEither).not.toContain("tofu");
  });

  test("a day with enough protein and enough meals gets the compliment, not a nudge", () => {
    const text = mealIdea({ kcal: 1800, protein: 90, carb: 180, fat: 60 }, 4, [])!;
    expect(text).toContain("jó ritmus");
  });

  test("a day that is neither is left alone", () => {
    expect(mealIdea({ kcal: 1200, protein: 25, carb: 100, fat: 40 }, 1, [])).toBeNull();
  });
});

describe("the menu path — several items, one press, one write", () => {
  test("writes every item under its own meal, and returns exactly those", () => {
    const { written, skipped } = addMealItems("2026-05-04", [
      { meal: "breakfast", foodId: "oat", servings: 1 },
      { meal: "lunch", foodId: "chicken", servings: 2 },
      { meal: "dinner", foodId: "broccoli", servings: 1 },
    ]);
    expect(written).toHaveLength(3);
    expect(skipped).toEqual([]);
    const day = getNutritionLog()["2026-05-04"]!;
    expect(day.breakfast?.map((i) => i.foodId)).toEqual(["oat"]);
    expect(day.lunch?.map((i) => i.foodId)).toEqual(["chicken"]);
    expect(day.lunch?.[0]!.servings).toBe(2);
    expect(day.dinner?.map((i) => i.foodId)).toEqual(["broccoli"]);
  });

  test("skips an id the registry does not have, and still writes the rest", () => {
    const { written, skipped } = addMealItems("2026-05-04", [
      { meal: "breakfast", foodId: "no-such-food", servings: 1 },
      { meal: "snack", foodId: "apple", servings: 1 },
    ]);
    expect(written).toHaveLength(1);
    expect(skipped).toEqual([]);
    expect(getNutritionLog()["2026-05-04"]!.snack?.map((i) => i.foodId)).toEqual(["apple"]);
    expect(getNutritionLog()["2026-05-04"]!.breakfast).toBeUndefined();
  });

  test("a call whose items are all unknown leaves the log untouched and says nothing", () => {
    let calls = 0;
    const off = subscribeNutrition(() => {
      calls += 1;
    });
    const { written, skipped } = addMealItems("2026-05-04", [
      { meal: "lunch", foodId: "ghost", servings: 1 },
    ]);
    off();
    expect(written).toEqual([]);
    expect(skipped).toEqual([]);
    expect(getNutritionLog()["2026-05-04"]).toBeUndefined();
    expect(calls).toBe(0);
  });

  test("the whole day is one notification, not one per item", () => {
    let calls = 0;
    const off = subscribeNutrition(() => {
      calls += 1;
    });
    addMealItems("2026-05-04", [
      { meal: "breakfast", foodId: "oat", servings: 1 },
      { meal: "lunch", foodId: "lentil", servings: 1 },
      { meal: "dinner", foodId: "spinach", servings: 1 },
      { meal: "snack", foodId: "apple", servings: 1 },
      { meal: "snack", foodId: "almond", servings: 1 },
    ]);
    off();
    expect(calls).toBe(1);
  });

  test("servings are clamped the same way the single-item path clamps them", () => {
    addMealItems("2026-05-04", [
      { meal: "breakfast", foodId: "oat", servings: 0 },
      { meal: "lunch", foodId: "rice", servings: Number.NaN },
      { meal: "dinner", foodId: "tofu", servings: 99 },
    ]);
    const day = getNutritionLog()["2026-05-04"]!;
    expect(day.breakfast?.[0]!.servings).toBe(1);
    expect(day.lunch?.[0]!.servings).toBe(1);
    expect(day.dinner?.[0]!.servings).toBe(10);
  });

  test("a marked allergen holds the whole-day add back, and the answer names what was held", () => {
    const { written, skipped } = addMealItems(
      "2026-05-04",
      [
        { meal: "breakfast", foodId: "yoghurt", servings: 1 },
        { meal: "lunch", foodId: "cheese", servings: 1 },
        { meal: "snack", foodId: "apple", servings: 1 },
      ],
      ["milk"],
    );
    // The yoghurt and the cheese are the app's own suggestion, so the rule
    // decides rather than warns: neither reaches the log.
    expect(written.map((i) => i.foodId)).toEqual(["apple"]);
    expect(skipped.map((s) => s.food.id)).toEqual(["yoghurt", "cheese"]);
    expect(skipped.every((s) => s.allergens.includes("milk"))).toBe(true);
    expect(getNutritionLog()["2026-05-04"]!.snack?.map((i) => i.foodId)).toEqual(["apple"]);
    expect(getNutritionLog()["2026-05-04"]!.breakfast).toBeUndefined();
  });

  test("with nothing marked, the same day goes in whole — the rule is silent, not eager", () => {
    const { written, skipped } = addMealItems(
      "2026-05-04",
      [
        { meal: "breakfast", foodId: "yoghurt", servings: 1 },
        { meal: "lunch", foodId: "cheese", servings: 1 },
      ],
      [],
    );
    expect(written).toHaveLength(2);
    expect(skipped).toEqual([]);
  });

  test("a day whose every item is held back writes nothing, says nothing, and still reports them", () => {
    let calls = 0;
    const off = subscribeNutrition(() => {
      calls += 1;
    });
    const { written, skipped } = addMealItems(
      "2026-05-04",
      [{ meal: "breakfast", foodId: "milk", servings: 1 }],
      ["milk"],
    );
    off();
    expect(written).toEqual([]);
    expect(skipped.map((s) => s.food.name)).toEqual(["Tej"]);
    expect(getNutritionLog()["2026-05-04"]).toBeUndefined();
    expect(calls).toBe(0);
  });
});
