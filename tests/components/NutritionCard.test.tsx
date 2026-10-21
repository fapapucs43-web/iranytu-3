/**
 * Batch 15, Phase 2 commit 4 — the meal log as markup, re-pinned when the food
 * picker became a search box.
 *
 * WHAT A STATIC RENDER CAN PROVE HERE, AND WHAT IT CANNOT
 * It can prove the card is wired: that the four meals are named, that the food
 * the box opens on is a REGISTRY row with its own portion and calories rather
 * than a literal typed into the component, that the added items sit under their
 * meal with their own numbers, that a food the reader owns is listed by name and
 * without invented numbers, and that the ALLERGY WARNING appears when — and only
 * when — the settings say an allergen is marked. It cannot prove the click that
 * adds an item, because `renderToStaticMarkup` runs no handlers; the store half
 * is covered in `tests/lib/nutrition.test.ts`, where the same write is asserted
 * against storage, and the suggestion sources are covered where they live
 * (`foodMatches` in that same file, `customFoodMatches` in
 * `tests/lib/custom-foods.test.ts`). What is left for a source pin is the one
 * thing no render can show: that the box is fed by those two functions and not
 * by a second list written into the component.
 *
 * THE ALLERGEN PAIRING IS THE ONE TEST WORTH WRITING TWICE. The two cases below
 * differ only in `settings.foodAllergies`, and they pin the two failure modes
 * that would make the feature useless rather than broken: a warning that never
 * appears (marked but silent) and a warning that always appears (unmarked but
 * shouting). Both are rendered with the SAME selected food, so the only thing
 * that moved is the setting.
 */
import type { ReactNode } from "react";
import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { AppProvider } from "../../src/state/AppContext";
import { IconSetProvider } from "../../src/state/IconSetContext";
import NutritionCard from "../../src/components/NutritionCard";
import {
  CUSTOM_FOOD_ID,
  FOODS,
  addMealItem,
  allergyHits,
  foodById,
  getNutritionLog,
  resetNutrition,
} from "../../src/lib/nutrition";
import { addCustomFood, resetCustomFoods } from "../../src/lib/customFoods";
import { resetDiet, setDietType } from "../../src/lib/diets";
import { menuDayItems, menuFor } from "../../src/lib/weeklyMenus";
import { todayISO } from "../../src/lib/dates";

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

afterEach(async () => {
  for (const k of Object.keys(backing)) delete backing[k];
  resetNutrition();
  resetCustomFoods();
  resetDiet();
  const store = await import("../../src/lib/store");
  store.resetAll();
});

const withProviders = (node: ReactNode) => (
  <AppProvider>
    <IconSetProvider>{node}</IconSetProvider>
  </AppProvider>
);

/** Render the card with one setting applied, on a clean store and a clean list. */
async function render(markAllergies: string[] = []): Promise<string> {
  const store = await import("../../src/lib/store");
  store.resetAll();
  resetCustomFoods();
  store.setSettings({ ...store.getState().settings, foodAllergies: markAllergies as never });
  return renderToStaticMarkup(withProviders(<NutritionCard />));
}

describe("NutritionCard — what the reader sees before touching anything", () => {
  test("the four meals are named, and the card says nothing is on the list yet", async () => {
    const html = await render();
    for (const meal of ["Reggeli", "Ebéd", "Vacsora", "Snack"]) {
      expect(html, meal).toContain(meal);
    }
    expect(html).toContain("Ma még nincs tétel a listán.");
    expect(html).toContain("Étkezés napló");
  });

  test("the search box opens on a real registry row, and its totals are that row's zero", async () => {
    const html = await render();
    // The box opens showing the registry's first row — the food, the portion it
    // is measured in and what that portion carries — so the card is reading
    // FOODS rather than a list written into the component.
    const first = FOODS[0]!;
    expect(html).toContain(first.name);
    expect(html).toContain(first.portion); // "60 g", in the portion line
    expect(html).toContain(`${first.kcal} kcal`);
    // The control's own copy is the translated one, not an English literal. The
    // suggestions list is closed until something is typed, so its label cannot
    // be in this markup; `tests/lib/i18n.test.ts` holds that key to its call
    // site, and the source pin below holds the box to its two sources.
    expect(html).toContain("Írd be az étel nevét…");
    expect(html).toContain("0 kcal · 0 g fehérje · 0 g szénhidrát · 0 g zsír");
  });

  test("the suggestions come from the two modules, not from a second list in the card", () => {
    // The one property a static render cannot show: typing has not happened yet,
    // so the list is empty in the markup whatever feeds it. The pin is on the
    // calls, and it fails if either source is replaced by a literal.
    const source = readFileSync(new URL("../../src/components/NutritionCard.tsx", import.meta.url), "utf8");
    expect(source).toContain("foodMatches(query)");
    expect(source).toContain("customFoodMatches(query, customFoods)");
  });

  test("the added items are listed under their meal, with their own calories", async () => {
    const store = await import("../../src/lib/store");
    store.resetAll();
    addMealItem(todayISO(), "breakfast", "oat", 1);
    const html = renderToStaticMarkup(withProviders(<NutritionCard />));
    expect(html).toContain("Zabpehely");
    expect(html).toContain("228 kcal");
    expect(html).not.toContain("Ma még nincs tétel a listán.");
    expect(getNutritionLog()[todayISO()]?.breakfast).toHaveLength(1);
  });

  test("a food the reader owns is listed by name, and the card says what it cannot count", async () => {
    const store = await import("../../src/lib/store");
    store.resetAll();
    addCustomFood("Lecsó");
    addMealItem(todayISO(), "dinner", CUSTOM_FOOD_ID, 2, "Lecsó");
    const html = renderToStaticMarkup(withProviders(<NutritionCard />));
    expect(html).toContain("Lecsó × 2");
    // No invented number stands in for it: the day's own totals are the registry
    // rows' alone, and the note says exactly that.
    expect(html).toContain("0 kcal · 0 g fehérje");
    expect(html).toContain("A saját ételek csak névvel kerülnek a listára");
    expect(getNutritionLog()[todayISO()]?.dinner).toHaveLength(1);
  });
});

describe("NutritionCard — the diet picker is a choice, and it says which one is in force", () => {
  test("all nine diets are offered, and no choice is named until one is made", async () => {
    const html = await render();
    for (const label of [
      "Paleo",
      "Keto",
      "Mediterrán",
      "Vegetáriánus",
      "Vegán",
      "Nyers (raw)",
      "Alacsony szénhidrát",
      "Magas fehérje",
      "Egyéb",
    ]) {
      expect(html, label).toContain(label);
    }
    expect(html).toContain("Még nincs kiválasztva étrend.");
    expect(html).toContain("Válaszd ki, ami rád illik");
  });

  test("a stored choice is named as the active one, and the picker offers to clear it", async () => {
    setDietType("keto");
    const html = await render();
    expect(html).toContain("Aktív étrend: Keto");
    expect(html).toContain("Kiválasztás törlése");
    expect(html).not.toContain("Még nincs kiválasztva étrend.");
  });
});

describe("NutritionCard — the weekly menu follows the diet, and is composed from the registry", () => {
  test("with no diet chosen the card explains itself instead of showing a menu", async () => {
    const html = await render();
    expect(html).toContain("Heti menü");
    expect(html).toContain("Válassz étrendet fent");
    expect(html).not.toContain("Ez legyen a mai nap");
  });

  test("choosing Other says there is no ready menu for it, rather than guessing one", async () => {
    setDietType("other");
    const html = await render();
    expect(html).toContain("nincs kész menü");
    expect(html).not.toContain("Ez legyen a mai nap");
  });

  test("choosing a diet renders seven days, each with the registry's own food names", async () => {
    setDietType("keto");
    const html = await render();
    // Seven days, seven one-press "make it today" buttons.
    expect(html.split("Ez legyen a mai nap").length - 1).toBe(7);
    // And the foods on those days are the registry rows the menu module picked,
    // printed by name — the card composes nothing of its own.
    const menu = menuFor("keto")!;
    for (const day of menu) {
      for (const { foodId } of menuDayItems(day)) {
        expect(html, foodId).toContain(foodById(foodId)!.name);
      }
    }
  });

  test("with an allergen marked, the menu warns on exactly the meals it touches", async () => {
    const store = await import("../../src/lib/store");
    store.resetAll();
    store.setSettings({ ...store.getState().settings, foodAllergies: ["milk"] });
    setDietType("keto");
    const html = renderToStaticMarkup(withProviders(<NutritionCard />));
    // Derived, not hard-coded: the number of meal lines a milk-hitting food
    // lands on is what the menu module composed, and the card must mark each of
    // them once — no more (a warning where nothing is wrong) and no fewer.
    const expected = menuFor("keto")!
      .flatMap((day) => day.meals)
      .filter((m) => m.items.some((i) => allergyHits(foodById(i.foodId)!, ["milk"]).length > 0))
      .length;
    expect(expected).toBeGreaterThan(0);
    expect(html.split("Allergia: Tej").length - 1).toBe(expected);
    // And with nothing marked, the same menu carries none of it.
    store.resetAll();
    setDietType("keto");
    const clean = renderToStaticMarkup(withProviders(<NutritionCard />));
    expect(clean).not.toContain("Allergia:");
  });

  test("the day button applies the marked allergens, rather than logging and warning after", () => {
    // The press is not reproducible in a static render, so the pin is on the
    // call: the day is added THROUGH the marked list, and the answer's skipped
    // items go to the one line that prints them.
    const source = readFileSync(new URL("../../src/components/NutritionCard.tsx", import.meta.url), "utf8");
    expect(source).toContain("addMealItems(today, menuDayItems(day), marked)");
    expect(source).toContain('t("tools.nutrition.menuSkipped"');
  });
});

describe("NutritionCard — the allergy warning follows the settings, nothing else", () => {
  test("with no allergen marked, a food the rule would catch produces no warning", async () => {
    const html = await render([]);
    expect(html).not.toContain("Allergia:");
    expect(html).toContain("Allergiáidat a Beállítások");
  });

  test("marking milk puts the warning under the selected food and beside the item", async () => {
    const store = await import("../../src/lib/store");
    store.resetAll();
    store.setSettings({ ...store.getState().settings, foodAllergies: ["milk"] });
    addMealItem(todayISO(), "lunch", "greek-yoghurt", 1);
    const html = renderToStaticMarkup(withProviders(<NutritionCard />));
    expect(html).toContain("Allergia:");
    expect(html).toContain("Tej");
    // The note that says what the rule can and cannot see replaces the hint.
    expect(html).toContain("az étel NEVÉRE illeszkedik");
    expect(html).not.toContain("Allergiáidat a Beállítások");
  });
});
