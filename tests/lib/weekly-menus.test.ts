/**
 * The weekly menu — the module that turns a diet choice into seven days.
 *
 * WHAT THIS FILE PROVES, AND WHY EACH PROPERTY IS HERE
 * The menu's whole value is that it is REAL: every item is a registry id, every
 * number is that row's number, and a diet never shows a food it excludes. All
 * three are properties of composed data, so all three are testable without a
 * browser — and the last one is the one a hand-written menu could not promise.
 * The determinism test is what makes the card safe to render beside a stored
 * choice (no clock, no randomness), and the "not one day repeated" test is the
 * difference between a menu and a single meal printed seven times.
 */
import { describe, expect, test } from "bun:test";
import { DIET_TYPES } from "../../src/lib/diets";
import { FOODS, foodById, totalsOf } from "../../src/lib/nutrition";
import {
  DIET_EXCLUDES,
  MENU_DIETS,
  MENU_SLOTS,
  dietPool,
  menuDayItems,
  menuDayTotals,
  menuFor,
} from "../../src/lib/weeklyMenus";

describe("who gets a menu, and who does not", () => {
  test("the eleven named diets have seven days each; other and no choice have none", () => {
    expect(MENU_DIETS).toHaveLength(11);
    expect(MENU_DIETS).not.toContain("other");
    for (const diet of MENU_DIETS) {
      expect(menuFor(diet), diet).toHaveLength(7);
      expect(menuFor(diet)!.map((d) => d.index), diet).toEqual([0, 1, 2, 3, 4, 5, 6]);
    }
    expect(menuFor("other")).toBeNull();
    expect(menuFor(null)).toBeNull();
  });

  test("every diet in the picker is either a menu diet or 'other'", () => {
    expect(DIET_TYPES.filter((d) => d !== "other").sort()).toEqual([...MENU_DIETS].sort());
  });

  test("every exclusion names a real registry row, so a typo cannot exclude nothing", () => {
    for (const [diet, ids] of Object.entries(DIET_EXCLUDES)) {
      for (const id of ids) {
        expect(foodById(id), `${diet} excludes ${id}`).toBeDefined();
      }
    }
  });
});

describe("the days are real, and they are the diet's own", () => {
  test("every item of every day is a registry row", () => {
    for (const diet of MENU_DIETS) {
      for (const day of menuFor(diet)!) {
        for (const { foodId } of menuDayItems(day)) {
          expect(foodById(foodId), `${diet} day ${day.index}: ${foodId}`).toBeDefined();
        }
      }
    }
  });

  test("no excluded food ever appears — an item is in the diet's pool by construction", () => {
    for (const diet of MENU_DIETS) {
      const pool = new Set(dietPool(diet));
      for (const day of menuFor(diet)!) {
        for (const { foodId } of menuDayItems(day)) {
          expect(pool.has(foodId), `${diet} day ${day.index}: ${foodId} is excluded`).toBe(true);
        }
      }
    }
  });

  test("every day has all six items, in meal order, and no repeated food inside a meal", () => {
    for (const diet of MENU_DIETS) {
      for (const day of menuFor(diet)!) {
        const items = menuDayItems(day);
        expect(items.map((i) => i.meal), `${diet} day ${day.index}`).toEqual([
          "breakfast",
          "breakfast",
          "lunch",
          "lunch",
          "dinner",
          "dinner",
        ]);
        for (const meal of MENU_SLOTS) {
          const ids = day.meals.find((m) => m.meal === meal.meal)!.items.map((i) => i.foodId);
          expect(new Set(ids).size, `${diet} day ${day.index} ${meal.meal}: ${ids.join(",")}`).toBe(2);
        }
      }
    }
  });

  test("the same diet composes the same week on every call", () => {
    expect(JSON.stringify(menuFor("keto"))).toBe(JSON.stringify(menuFor("keto")));
    expect(JSON.stringify(menuFor("vegan"))).toBe(JSON.stringify(menuFor("vegan")));
  });

  test("the week is a week, not one day printed seven times", () => {
    for (const diet of MENU_DIETS) {
      const signatures = new Set(
        menuFor(diet)!.map((day) => menuDayItems(day).map((i) => i.foodId).join(",")),
      );
      expect(signatures.size, `${diet} repeats the same day`).toBeGreaterThanOrEqual(4);
    }
  });

  test("the diet intent is legible: paleo has no bread or pasta, vegan no meat or egg, raw no cooked row", () => {
    const paleo = new Set(dietPool("paleo"));
    for (const id of ["bread-whole", "pasta", "rice", "milk", "lentil"]) {
      expect(paleo.has(id), `paleo keeps ${id}`).toBe(false);
    }
    const vegan = new Set(dietPool("vegan"));
    for (const id of ["chicken", "salmon", "egg", "milk", "honey"]) {
      expect(vegan.has(id), `vegan keeps ${id}`).toBe(false);
    }
    const raw = new Set(dietPool("raw"));
    for (const id of ["rice", "chicken", "lentil", "bread-whole", "potato"]) {
      expect(raw.has(id), `raw keeps ${id}`).toBe(false);
    }
    // And the pools are not merely empty: a diet with nothing to eat would pass
    // every exclusion assertion above.
    for (const diet of MENU_DIETS) expect(dietPool(diet).length, diet).toBeGreaterThan(8);
  });
});

describe("the numbers come from the registry, not from the menu", () => {
  test("a day's totals are the sum of its own rows, in the registry's units", () => {
    for (const diet of MENU_DIETS) {
      for (const day of menuFor(diet)!) {
        const expected = { kcal: 0, protein: 0, carb: 0, fat: 0 };
        for (const { foodId, servings } of menuDayItems(day)) {
          const t = totalsOf(foodById(foodId)!, servings);
          expected.kcal += t.kcal;
          expected.protein += t.protein;
          expected.carb += t.carb;
          expected.fat += t.fat;
        }
        expect(menuDayTotals(day), `${diet} day ${day.index}`).toEqual(expected);
      }
    }
  });

  test("a menu day looks like a day: three meals, and a plausible calorie total", () => {
    for (const diet of MENU_DIETS) {
      const totals = menuFor(diet)!.map((d) => menuDayTotals(d).kcal);
      for (const kcal of totals) {
        expect(kcal, diet).toBeGreaterThan(300);
        expect(kcal, diet).toBeLessThan(2000);
      }
    }
  });

  test("an id the app does not know gets no menu, not an exception", () => {
    // The registry's own rows back every menu; FOODS is never empty, and this
    // pins the assumption menuFor makes before it returns a week.
    expect(FOODS.length).toBeGreaterThan(20);
    const unknown = "primal" as Parameters<typeof menuFor>[0];
    expect(() => menuFor(unknown)).not.toThrow();
    expect(menuFor(unknown)).toBeNull();
  });
});
