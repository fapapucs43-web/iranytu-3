import { useEffect, useState } from "react";
import { CollapsibleCard } from "./ui/ui";
import ContentIcon from "./ContentIcon";
import { t } from "../lib/i18n";
import { WEEKDAYS_SHORT, todayISO } from "../lib/dates";
import { useApp } from "../state/AppContext";
import {
  CUSTOM_FOOD_ID,
  FOODS,
  MEAL_TYPES,
  addMealItem,
  addMealItems,
  allergyHits,
  dayTotals,
  foodById,
  foodFromName,
  foodMatches,
  getNutritionLog,
  mealTotals,
  removeMealItem,
  subscribeNutrition,
  totalsOf,
  type AllergenId,
  type FoodDef,
  type MealType,
} from "../lib/nutrition";
import { mealIdea } from "../lib/nutritionTips";
import {
  addCustomFood,
  customFoodMatches,
  getCustomFoods,
  removeCustomFood,
  type CustomFood,
} from "../lib/customFoods";
import {
  DIET_NOTES,
  DIET_TYPES,
  getDietType,
  setDietType,
  subscribeDiet,
  type DietId,
} from "../lib/diets";
import { menuDayItems, menuDayTotals, menuFor } from "../lib/weeklyMenus";

/**
 * The meal log (Batch 15, Phase 2 commit 3) — the card the food list lives in.
 *
 * WHAT IT IS, AND WHAT IT IS NOT
 * Four meals, the foods the reader actually ate, and one line of totals. It is
 * not a diet screen: there is no goal, no target and no score, and the numbers
 * are described as estimates in the card's own note rather than dressed up as
 * measurements. The one sentence it offers comes from `mealIdea`, which speaks
 * only when the day's own list gives it something true to say.
 *
 * WHY THE ALLERGY WARNING IS IN TWO PLACES
 * Under the food the reader is about to add — so the warning arrives BEFORE the
 * item does, which is the only moment it can change a decision — and beside the
 * item in the list, so a day's list can be read back with the same marks. Both
 * read `allergyHits`, so the two can never disagree, and both are silent when
 * the reader has marked nothing.
 *
 * THE MEAL IS A PILL ROW AND NOT FOUR FORMS
 * One add form, with the meal chosen above it, keeps the card one screen tall
 * on a phone; four selects would be four lists of sixty options. The four meal
 * sections below are then purely reading — what went where, and what it cost.
 *
 * THE FOOD BOX IS A SEARCH, AND THE SELECTION IS ITS HONEST READING
 * What the reader reads in the box is what the card will add. An exact name
 * puts that registry row in play (so the portions, the numbers and the allergy
 * rule all come from the catalogue); any other non-blank text is the reader's
 * own food; and an emptied box falls back to the row they last chose, which is
 * what the select this replaced always showed. The suggestions merge two
 * sources — the reader's own foods first, because a name they typed is the one
 * the registry cannot offer back, then the catalogue rows whose name contains
 * what they typed — and the list is capped, so a common letter cannot open a
 * sixty-row menu on a phone.
 *
 * THE DIET PICKER IS A PREFERENCE, NOT A JUDGEMENT
 * Nine diet types, one row of equal pills and one stored id (`lib/diets`).
 * Choosing one is the reader saying what they eat; nothing in this card checks
 * the day against it, scores it, or tells them what to eat. What it changes is
 * what the card can OFFER — from Phase 2 commit 3 on, the weekly menu follows
 * the chosen type — and the picker itself stays a choice anybody can undo, in
 * one press, at any time. "No diet chosen" is its own state and is not the same
 * as "Other": one is a reader who has not picked, the other a reader who has.
 *
 * THE MENU RESPECTS THE MARKED ALLERGENS, AND SAYS WHAT IT LEFT OUT
 * A menu day is twenty foods the reader did not pick one by one, so there the
 * allergy rule stops warning and starts deciding: `addMealItems` holds back any
 * item whose registry row hits a marked allergen and hands the card the list it
 * held back, which the card prints in one line. The marks also ride the preview:
 * a meal line that contains a marked food carries the same warning the logged
 * item does, so the reader can see the clash BEFORE pressing the button. With
 * nothing marked, none of it happens — the rule is silent when it has nothing to
 * go on, everywhere in this card.
 *
 * THE WEEKLY MENU IS COMPOSED, AND IT SAYS SO
 * Seven days belong to whatever diet is in force, and the days are composed by
 * `lib/weeklyMenus` from the same registry rows the add box draws on — so a
 * menu line and a log line print the same numbers for the same food. Nothing
 * here frames the menu as a plan to follow: the title, the hint and the note
 * call it a suggestion, and one press turns a whole day into today's log for a
 * reader who wants exactly that. "Other" gets no menu rather than a guess, and
 * the card says which of the two empty states the reader is looking at: no
 * choice yet, or a choice this list cannot describe.
 *
 * A CUSTOM FOOD IS A NAME, NOT A NUMBER
 * A food the reader owns is remembered in its own storage key (`lib/customFoods`)
 * and an item that carries it stores the name and nothing else. There is no
 * portion and no calorie figure, because the app has none it could honestly
 * print, so the row shows the name and the totals count the ITEM without adding
 * to the numbers — and the card says so, in the note that appears only when the
 * day actually holds one of them. Forgetting a food removes it from the
 * suggestions; the days it was already logged in keep their names.
 */
export default function NutritionCard() {
  const { data } = useApp();
  const marked = data.settings.foodAllergies ?? [];

  const [log, setLog] = useState(() => getNutritionLog());
  useEffect(() => subscribeNutrition(() => setLog(getNutritionLog())), []);

  const today = todayISO();
  const [meal, setMeal] = useState<MealType>("breakfast");
  const [foodName, setFoodName] = useState("");
  const [picked, setPicked] = useState<string>(FOODS[0]!.id);
  const [servings, setServings] = useState("1");
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [customFoods, setCustomFoods] = useState<readonly CustomFood[]>(() => getCustomFoods());
  const [diet, setDiet] = useState<DietId | null>(() => getDietType());
  useEffect(() => subscribeDiet(() => setDiet(getDietType())), []);
  const [skippedNow, setSkippedNow] = useState<
    { food: FoodDef; allergens: AllergenId[] }[] | null
  >(null);

  const totals = dayTotals(log, today);
  const idea = mealIdea(totals, totals.items, marked);
  const menu = diet === null ? null : menuFor(diet);

  const typed = foodName.trim();
  const registryHit = typed
    ? FOODS.find((f) => f.name.toLowerCase() === typed.toLowerCase())
    : undefined;
  const selected: FoodDef =
    registryHit ?? (typed ? foodFromName(typed) : foodById(picked) ?? FOODS[0]!);
  const selectedIsCustom = registryHit === undefined && typed !== "";
  const selectedHits = allergyHits(selected, marked);

  type Completion =
    | { kind: "catalogue"; food: FoodDef }
    | { kind: "custom"; food: CustomFood };

  /** What the box offers for what is typed: the reader's foods, then the catalogue. */
  function completionsFor(query: string): Completion[] {
    const custom = customFoodMatches(query, customFoods).map(
      (f): Completion => ({ kind: "custom", food: f }),
    );
    const catalogue = foodMatches(query).map(
      (f): Completion => ({ kind: "catalogue", food: f }),
    );
    return [...custom, ...catalogue].slice(0, 8);
  }

  const completions = completionsFor(foodName);
  const showSuggestions = suggestOpen && completions.length > 0;

  function choose(c: Completion) {
    // The box is the state: writing the name into it is what selects the food,
    // and a catalogue pick also remembers the row an emptied box falls back to.
    setFoodName(c.food.name);
    if (c.kind === "catalogue") setPicked(c.food.id);
    setSuggestOpen(false);
  }

  function forget(id: string) {
    removeCustomFood(id);
    setCustomFoods(getCustomFoods());
  }

  function add() {
    const count = Number(servings) || 1;
    if (registryHit) {
      addMealItem(today, meal, registryHit.id, count);
    } else if (selectedIsCustom) {
      // Remembered once, however many times it is eaten: `addCustomFood` hands
      // back null for a name the reader already owns, and that is not an error.
      addCustomFood(typed);
      setCustomFoods(getCustomFoods());
      addMealItem(today, meal, CUSTOM_FOOD_ID, count, typed);
    } else {
      addMealItem(today, meal, picked, count);
    }
    setServings("1");
    setSuggestOpen(false);
  }

  /**
   * The allergen names, in the catalogue, one literal `t()` call each — the
   * i18n test scans for exactly that string, so a computed key would be a
   * translation nobody could find.
   */
  const allergenLabel: Record<AllergenId, string> = {
    peanut: t("nutrition.allergen.peanut"),
    nut: t("nutrition.allergen.nut"),
    milk: t("nutrition.allergen.milk"),
    egg: t("nutrition.allergen.egg"),
    gluten: t("nutrition.allergen.gluten"),
    soy: t("nutrition.allergen.soy"),
    fish: t("nutrition.allergen.fish"),
    shellfish: t("nutrition.allergen.shellfish"),
    sesame: t("nutrition.allergen.sesame"),
    sulphite: t("nutrition.allergen.sulphite"),
  };
  /**
   * The twelve diet names, one literal `t()` call each — the i18n test scans for
   * exactly that string, so a computed key would be a translation nobody could
   * find. The same shape the meal and allergen labels below keep.
   */
  const dietLabel: Record<DietId, string> = {
    paleo: t("tools.nutrition.diet.paleo"),
    keto: t("tools.nutrition.diet.keto"),
    mediterranean: t("tools.nutrition.diet.mediterranean"),
    vegetarian: t("tools.nutrition.diet.vegetarian"),
    vegan: t("tools.nutrition.diet.vegan"),
    raw: t("tools.nutrition.diet.raw"),
    "low-carb": t("tools.nutrition.diet.low-carb"),
    "high-protein": t("tools.nutrition.diet.high-protein"),
    "gluten-free": t("tools.nutrition.diet.gluten-free"),
    "lactose-free": t("tools.nutrition.diet.lactose-free"),
    pescatarian: t("tools.nutrition.diet.pescatarian"),
    other: t("tools.nutrition.diet.other"),
  };
  const mealLabel: Record<MealType, string> = {
    breakfast: t("nutrition.meal.breakfast"),
    lunch: t("nutrition.meal.lunch"),
    dinner: t("nutrition.meal.dinner"),
    snack: t("nutrition.meal.snack"),
  };
  const names = (hits: readonly AllergenId[]) => hits.map((h) => allergenLabel[h]).join(", ");

  /** The marked allergens a registry row hits — none for an id nobody knows. */
  function hitsFor(foodId: string): AllergenId[] {
    const food = foodById(foodId);
    return food ? allergyHits(food, marked) : [];
  }

  /** Whether the day holds a food of the reader's own, for the totals note. */
  const hasOwnFoods = MEAL_TYPES.some((m) =>
    (log[today]?.[m] ?? []).some((i) => foodById(i.foodId) === undefined),
  );

  return (
    <CollapsibleCard
      id="nutrition-log"
      title={t("tools.nutrition.title")}
      icon={<ContentIcon name="Salad" />}
      summary={t("tools.nutrition.summary", {
        kcal: totals.kcal,
        protein: totals.protein,
        carb: totals.carb,
        fat: totals.fat,
      })}
    >
      <p className="muted-note">{t("tools.nutrition.intro")}</p>

      <p className="muted-note">{t("tools.nutrition.dietHint")}</p>
      <div className="pill-cloud" role="radiogroup" aria-label={t("tools.nutrition.dietTitle")}>
        {DIET_TYPES.map((d) => (
          <button
            key={d}
            type="button"
            className={`pill ${diet === d ? "pill-selected" : ""}`}
            aria-pressed={diet === d}
            onClick={() => setDietType(d)}
          >
            {dietLabel[d]}
          </button>
        ))}
      </div>
      <p className="muted-note">
        {diet
          ? t("tools.nutrition.dietActive", { diet: dietLabel[diet] })
          : t("tools.nutrition.dietNone")}
      </p>
      {/* The health audit's one addition to this card: a chosen diet may carry a
          question with it, and `DIET_NOTES` is the only place this app answers
          one. It states what to ask and whom to ask — never a dose, a limit or
          a substitute — and it renders only while the choice is in force, so a
          reader who has picked nothing is told nothing. */}
      {diet && DIET_NOTES[diet] && (
        <p className="muted-note nutrition-diet-note">{DIET_NOTES[diet]}</p>
      )}
      {diet && <p className="muted-note">{t("tools.nutrition.dietNote")}</p>}
      {diet && (
        <button type="button" className="btn btn-soft" onClick={() => setDietType(null)}>
          {t("tools.nutrition.dietClear")}
        </button>
      )}

      <div className="pill-cloud" role="radiogroup" aria-label={t("tools.nutrition.mealGroup")}>
        {MEAL_TYPES.map((m) => (
          <button
            key={m}
            type="button"
            className={`pill ${meal === m ? "pill-selected" : ""}`}
            aria-pressed={meal === m}
            onClick={() => setMeal(m)}
          >
            {mealLabel[m]}
          </button>
        ))}
      </div>

      <div className="add-row">
        <div className="food-picker">
          <input
            className="text-input"
            aria-label={t("tools.nutrition.foodLabel")}
            placeholder={t("tools.nutrition.foodPlaceholder")}
            autoComplete="off"
            value={foodName}
            onChange={(e) => {
              setFoodName(e.target.value);
              setSuggestOpen(e.target.value.trim().length > 0);
            }}
            onFocus={() => setSuggestOpen(completions.length > 0)}
            onBlur={() => setSuggestOpen(false)}
          />
          {showSuggestions && (
            <ul className="autocomplete-list" aria-label={t("tools.nutrition.foodAutocomplete")}>
              {completions.map((c) => (
                <li
                  key={c.kind === "catalogue" ? c.food.id : `custom:${c.food.id}`}
                  className="autocomplete-item"
                >
                  <button
                    type="button"
                    className="autocomplete-choice"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(c)}
                  >
                    {c.kind === "catalogue"
                      ? `${c.food.name} — ${c.food.portion} — ${c.food.kcal} kcal`
                      : c.food.name}
                  </button>
                  {c.kind === "custom" && (
                    <button
                      type="button"
                      className="autocomplete-forget"
                      aria-label={t("tools.nutrition.forgetCustom", { name: c.food.name })}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => forget(c.food.id)}
                    >
                      ×
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <input
          className="text-input nutrition-servings"
          type="number"
          min="0.5"
          max="10"
          step="0.5"
          aria-label={t("tools.nutrition.servingsLabel", { name: selected.name })}
          value={servings}
          onChange={(e) => setServings(e.target.value)}
        />
        <button type="button" className="btn btn-soft" onClick={add}>
          {t("tools.nutrition.add")}
        </button>
      </div>
      <p className="muted-note">
        <strong>{selected.name}</strong>
        {selectedIsCustom
          ? ` · ${t("tools.nutrition.customPortion")}`
          : ` · ${t("tools.nutrition.portionLine", {
              portion: selected.portion,
              kcal: totalsOf(selected, Number(servings) || 0).kcal,
            })}`}
      </p>
      {selectedHits.length > 0 && (
        <p className="nutrition-allergy" role="status">
          {t("tools.nutrition.allergyWarn", {
            name: selected.name,
            allergens: names(selectedHits),
          })}
        </p>
      )}

      {MEAL_TYPES.map((m) => {
        const items = log[today]?.[m] ?? [];
        const sum = mealTotals(log, today, m);
        // A meal of custom foods has no numbers to print, and "0 kcal" is a
        // number a reader would believe. The dash is the honest row.
        const hasNumbers = items.some((i) => foodById(i.foodId) !== undefined);
        return (
          <div key={m} className="nutrition-meal">
            <div className="nutrition-meal-head">
              <strong>{mealLabel[m]}</strong>
              <span className="muted-note">
                {hasNumbers
                  ? t("tools.nutrition.mealKcal", { kcal: sum.kcal })
                  : t("tools.nutrition.mealEmpty")}
              </span>
            </div>
            {items.map((item) => {
              const food = foodById(item.foodId);
              const display = food ?? (item.customName ? foodFromName(item.customName) : undefined);
              if (!display) return null;
              const hits = allergyHits(display, marked);
              return (
                <div key={item.id} className="nutrition-item">
                  <span>
                    {display.name}
                    {item.servings !== 1 ? ` × ${item.servings}` : ""}
                    {food
                      ? ` · ${t("tools.nutrition.itemKcal", {
                          kcal: totalsOf(food, item.servings).kcal,
                        })}`
                      : ""}
                  </span>
                  {hits.length > 0 && (
                    <span className="nutrition-allergy">
                      {t("tools.nutrition.allergyMark", { allergens: names(hits) })}
                    </span>
                  )}
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t("tools.nutrition.removeLabel", { name: display.name })}
                    onClick={() => removeMealItem(today, m, item.id)}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        );
      })}

      <p className="muted-note">
        <strong>{t("tools.nutrition.menuTitle")}</strong>
      </p>
      {diet === null && <p className="muted-note">{t("tools.nutrition.menuNone")}</p>}
      {diet === "other" && <p className="muted-note">{t("tools.nutrition.menuOther")}</p>}
      {menu && (
        <>
          <p className="muted-note">{t("tools.nutrition.menuHint")}</p>
          {menu.map((day) => (
            <div key={day.index} className="nutrition-meal">
              <div className="nutrition-meal-head">
                <strong>{WEEKDAYS_SHORT[day.index]}</strong>
                <span className="muted-note">
                  {t("tools.nutrition.mealKcal", { kcal: menuDayTotals(day).kcal })}
                </span>
              </div>
              {day.meals.map((m) => {
                const hits = [...new Set(m.items.flatMap((i) => hitsFor(i.foodId)))];
                return (
                  <p key={m.meal} className="muted-note">
                    {mealLabel[m.meal]}:{" "}
                    {m.items
                      .map((i) => foodById(i.foodId)?.name ?? "")
                      .filter(Boolean)
                      .join(" + ")}
                    {hits.length > 0 && (
                      <span className="nutrition-allergy">
                        {" "}— {t("tools.nutrition.allergyMark", { allergens: names(hits) })}
                      </span>
                    )}
                  </p>
                );
              })}
              <button
                type="button"
                className="btn btn-soft"
                onClick={() => {
                  const result = addMealItems(today, menuDayItems(day), marked);
                  setSkippedNow(result.skipped.length > 0 ? result.skipped : null);
                }}
              >
                {t("tools.nutrition.menuAdd")}
              </button>
            </div>
          ))}
          {skippedNow && (
            <p className="nutrition-allergy" role="status">
              {t("tools.nutrition.menuSkipped", {
                items: skippedNow
                  .map((s) => `${s.food.name} (${names(s.allergens)})`)
                  .join(", "),
              })}
            </p>
          )}
          <p className="muted-note">{t("tools.nutrition.menuNote")}</p>
        </>
      )}

      {totals.items === 0 && <p className="muted-note">{t("tools.nutrition.empty")}</p>}
      {hasOwnFoods && <p className="muted-note">{t("tools.nutrition.customNote")}</p>}
      {idea && <p className="muted-note">{idea}</p>}
      <p className="muted-note">
        {marked.length ? t("tools.nutrition.allergyNote") : t("tools.nutrition.allergyHint")}
      </p>
      <p className="muted-note">{t("tools.nutrition.note")}</p>
    </CollapsibleCard>
  );
}
