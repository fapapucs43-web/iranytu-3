/**
 * The weekly menu (Phase 2, commit 3) — seven days composed from the registry,
 * per diet type.
 *
 * WHAT THIS IS, AND WHAT IT REFUSES TO BE
 * A suggestion of WHAT COULD BE EATEN, built out of the same forty-odd registry
 * rows the meal log adds from. Every item is a `FOODS` id, so every number the
 * card prints beside a menu day is a registry number times a serving — the menu
 * never invents a dish, a portion or a calorie, and there is no hidden content
 * table here. It is not a prescription either: no target, no score, no "you
 * should", and the card's own note says it is a suggestion. The one thing a
 * menu may do that a recipe may not is change its mind, which is why it is
 * COMPOSED rather than authored.
 *
 * WHY COMPOSED, NOT AUTHORED
 * Eleven diets × seven days × three meals × two items is 462 hand-written food
 * ids, and every one of them would be a copy of a registry row that can drift
 * from it. Instead each diet declares a POOL — the registry minus what it
 * avoids — and the week is a deterministic rotation over the pool through three
 * meal shapes (a main and a side for breakfast, lunch and dinner). The result is
 * stable (the same diet always yields the same week, so a test can pin it),
 * diet-legal BY CONSTRUCTION (an excluded food cannot appear, because the pool
 * is the only source), and short enough to read in one sitting.
 *
 * The failure this design has to survive is an EMPTY POOL: a meal shape whose
 * candidates are all excluded on some diet would leave a day half-empty. When a
 * shape's own candidates are all out of the pool, the picker falls back to the
 * pool itself, so a day is never short an item — and the test asserts every day
 * has all six items on every diet, which is what would fail if that fallback
 * ever stopped working.
 *
 * "OTHER" HAS NO MENU, AND THAT IS THE HONEST ANSWER
 * The list knows twelve names. Eleven of them it can describe in registry foods;
 * the ninth is the reader saying their way of eating is not one of these, and a
 * menu generated for it would be the app guessing at rules it was never told.
 * `menuFor` returns nothing for it, and the card says why in one line.
 */
import { FOODS, MEAL_TYPES, totalsOf, type FoodDef, type MealType, type Totals } from "./nutrition";
import { DIET_TYPES, isDietId, type DietId } from "./diets";

/**
 * What each diet avoids, as registry ids.
 *
 * Written as the EXCLUSION rather than the pool on purpose: a food added to the
 * registry later joins every diet that does not name it, which is the forgiving
 * direction. The strict direction — a new food belongs to no diet until somebody
 * lists it eight times — would make every future registry row silently vanish
 * from every menu, and the failure would look like an empty suggestion rather
 * than a missing line.
 *
 * These are broad strokes, not clinical rules: they encode what a reader who
 * picked the name would expect to see and not see, and the module's own doc
 * block says so. `other` is listed empty because it has no menu at all.
 */
export const DIET_EXCLUDES: Record<DietId, string[]> = {
  paleo: [
    "oat", "bread-whole", "bread-white", "roll", "kifli", "rice", "brown-rice", "pasta",
    "milk", "yoghurt", "greek-yoghurt", "cheese", "cottage", "butter", "sour-cream",
    "lentil", "chickpea", "tofu", "soy-granulate", "white-bean",
    "potato", "biscuit", "cake", "pizza", "hamburger", "fries", "shake", "beer",
  ],
  keto: [
    "oat", "bread-whole", "bread-white", "roll", "kifli", "rice", "brown-rice", "pasta",
    "potato", "sweet-potato", "honey", "chocolate", "biscuit", "cake", "pizza",
    "hamburger", "fries", "shake", "banana", "orange", "berries", "raisin", "prune",
    "lentil", "chickpea", "white-bean", "beer", "wine",
  ],
  mediterranean: ["pizza", "hamburger", "fries", "cake", "biscuit", "chocolate", "shake"],
  vegetarian: [
    "chicken", "turkey", "pork", "beef", "salmon", "tuna", "shrimp", "meat-soup", "hamburger",
  ],
  vegan: [
    "chicken", "turkey", "pork", "beef", "salmon", "tuna", "shrimp", "meat-soup", "hamburger",
    "egg", "scrambled", "milk", "yoghurt", "greek-yoghurt", "cheese", "cottage", "butter",
    "sour-cream", "honey", "shake", "coffee-milk", "cake", "biscuit",
  ],
  raw: [
    "oat", "bread-whole", "bread-white", "roll", "kifli", "egg", "scrambled", "milk",
    "yoghurt", "greek-yoghurt", "cheese", "cottage", "butter", "sour-cream",
    "chicken", "turkey", "pork", "beef", "salmon", "tuna", "shrimp",
    "rice", "brown-rice", "potato", "sweet-potato", "pasta",
    "lentil", "chickpea", "tofu", "soy-granulate", "white-bean",
    "broccoli", "spinach", "meat-soup", "veg-soup", "shake", "coffee-milk", "green-tea",
    "chocolate", "biscuit", "cake", "pizza", "hamburger", "fries", "honey",
  ],
  "low-carb": [
    "oat", "bread-whole", "bread-white", "roll", "kifli", "rice", "brown-rice", "pasta",
    "potato", "sweet-potato", "honey", "chocolate", "biscuit", "cake", "pizza",
    "hamburger", "fries", "shake", "banana", "orange", "berries", "raisin", "prune",
    "lentil", "chickpea", "white-bean", "beer",
  ],
  "high-protein": ["cake", "biscuit", "chocolate", "pizza", "hamburger", "fries", "shake", "beer"],
  // The three the health-tab audit added. Each list is the registry's answer to
  // the name, not a clinical rule book: gluten-free drops every wheat row (and
  // the plain oat, which is only safe when it is certified), lactose-free drops
  // the dairy rows and the dishes built on them — the Greek salad included, its
  // feta is the point of it — and pescatarian drops the four meats, the meat
  // soup and the hamburger, and keeps every fish.
  "gluten-free": [
    "oat", "bread-whole", "bread-white", "roll", "kifli", "pasta", "biscuit", "cake",
    "pizza", "hamburger", "beer", "meat-soup",
  ],
  "lactose-free": [
    "milk", "yoghurt", "greek-yoghurt", "cheese", "cottage", "butter", "sour-cream",
    "shake", "coffee-milk", "cake", "biscuit", "chocolate", "pizza", "greek-salad",
  ],
  pescatarian: ["chicken", "turkey", "pork", "beef", "meat-soup", "hamburger"],
  other: [],
};

/**
 * The three meal shapes, as candidates.
 *
 * A shape is what a meal of that name usually looks like in this registry — a
 * main and a side — and the diet's pool decides which of the candidates can
 * actually be used. The order inside each list is the rotation order, so the
 * same diet always composes the same week.
 */
export const MENU_SLOTS: { meal: MealType; mains: string[]; sides: string[] }[] = [
  {
    meal: "breakfast",
    mains: ["oat", "scrambled", "yoghurt", "egg", "bread-whole", "cottage", "berries", "banana"],
    sides: ["banana", "honey", "apple", "tomato", "almond", "berries", "pepper", "orange"],
  },
  {
    meal: "lunch",
    mains: ["chicken", "lentil", "salmon", "greek-salad", "chickpea", "tuna", "tofu", "white-bean"],
    sides: ["rice", "broccoli", "cucumber", "carrot", "pepper", "olive-oil", "tomato", "spinach"],
  },
  {
    meal: "dinner",
    mains: ["turkey", "tofu", "veg-soup", "white-bean", "pork", "tahini", "chickpea", "cottage"],
    sides: ["brown-rice", "spinach", "sweet-potato", "tomato", "pepper", "cucumber", "carrot", "peanut-butter"],
  },
];

/** One item of a menu meal: a registry row, and how many portions of it. */
export type MenuItem = { foodId: string; servings: number };

/** One meal of one menu day. */
export type MenuMeal = { meal: MealType; items: MenuItem[] };

/** One day of a menu. `index` is 0 for Monday … 6 for Sunday. */
export type MenuDay = { index: number; meals: MenuMeal[] };

/** The registry ids a diet may draw from — everything it does not exclude. */
export function dietPool(diet: DietId): string[] {
  const out = DIET_EXCLUDES[diet];
  return FOODS.filter((f) => !out.includes(f.id)).map((f) => f.id);
}

function pickFrom(
  candidates: readonly string[],
  pool: ReadonlySet<string>,
  offset: number,
  avoid?: string,
): string {
  const allowed = candidates.filter((id) => pool.has(id));
  // The fallback is the pool itself, and it is what keeps a raw week's dinner
  // from coming up empty; see the header. Registry order, because `pool` is a
  // set and an unordered pick would not be reproducible.
  const source = allowed.length > 0 ? allowed : FOODS.filter((f) => pool.has(f.id)).map((f) => f.id);
  // A meal is a main AND a side, and the same row twice is not a meal: the
  // first candidate that is not the main wins, and only a pool of one food
  // falls back to the repeat (the test below forbids that state for any diet).
  for (let i = 0; i < source.length; i += 1) {
    const pick = source[(offset + i) % source.length]!;
    if (pick !== avoid) return pick;
  }
  return source[offset % source.length]!;
}

/**
 * The seven days of a diet, or `null` for a diet with no menu.
 *
 * Deterministic by construction: the same diet composes the same week on every
 * call, which is what makes the menu safe to show beside a stored choice and
 * what lets the tests pin a day without freezing a clock. `null` comes back for
 * `other` and for no choice at all — the card tells those two apart with its own
 * copy, because they are different situations even though neither has a menu.
 */
export function menuFor(diet: DietId | null): MenuDay[] | null {
  // `isDietId` is not decoration: a value from outside the type system (a
  // restored backup, a stale key, a future version) must come back as "no menu"
  // rather than as an exception at the one call site that renders it.
  if (diet === null || diet === "other" || !isDietId(diet)) return null;
  const pool = new Set(dietPool(diet));
  if (pool.size === 0) return null;
  const days: MenuDay[] = [];
  for (let day = 0; day < 7; day += 1) {
    const meals: MenuMeal[] = MENU_SLOTS.map((slot, s) => {
      const main = pickFrom(slot.mains, pool, day + s);
      const side = pickFrom(slot.sides, pool, day * 2 + s + 1, main);
      return { meal: slot.meal, items: [{ foodId: main, servings: 1 }, { foodId: side, servings: 1 }] };
    });
    days.push({ index: day, meals });
  }
  return days;
}

/** Every item of a menu day, in meal order — the shape an add or a total walks. */
export function menuDayItems(day: MenuDay): { meal: MealType; foodId: string; servings: number }[] {
  const out: { meal: MealType; foodId: string; servings: number }[] = [];
  for (const meal of MEAL_TYPES) {
    for (const m of day.meals.filter((x) => x.meal === meal)) {
      for (const item of m.items) out.push({ meal, ...item });
    }
  }
  return out;
}

/** The food behind a menu item, or undefined for an id the registry lost. */
function menuFood(foodId: string): FoodDef | undefined {
  return FOODS.find((f) => f.id === foodId);
}

/** What one menu day carries, summed from the registry rows alone. */
export function menuDayTotals(day: MenuDay): Totals {
  let totals: Totals = { kcal: 0, protein: 0, carb: 0, fat: 0 };
  for (const { foodId, servings } of menuDayItems(day)) {
    const food = menuFood(foodId);
    if (!food) continue;
    const t = totalsOf(food, servings);
    totals = {
      kcal: totals.kcal + t.kcal,
      protein: totals.protein + t.protein,
      carb: totals.carb + t.carb,
      fat: totals.fat + t.fat,
    };
  }
  return totals;
}

/** The diets that have a menu, in the picker's order — `other` is not one. */
export const MENU_DIETS: DietId[] = DIET_TYPES.filter((d) => d !== "other");
