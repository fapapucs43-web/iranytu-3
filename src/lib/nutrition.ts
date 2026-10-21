/**
 * The food list, the allergy rule, and the meal log (Batch 15, Phase 2 commit 1).
 *
 * WHAT THIS MODULE IS FOR
 * The app already records a day's nutrition as FOUR tracker values — a quality
 * slider, five flags, a note and an optional calorie estimate — and Batch 11
 * reads those back as one weekly sentence. That is a judgement about the day.
 * This module is the other half a reader asked for: what they actually ATE, so
 * the number stops being an estimate they typed and becomes a list they can
 * check. Four meals, named foods with a portion and its macros, and one key
 * holding the days.
 *
 * WHY A SECOND STORAGE KEY AND NOT A FIELD IN THE STORE
 * The store's blob is exported, re-imported, and merged day-by-day; a meal log
 * is a growing list with its own shape, exactly like `lib/habits` and
 * `lib/gratitude`, and both of those own a key for the same reason. It also
 * keeps this additive: nothing about `Entry` changes, and a reader who never
 * opens the card has no new key in storage at all.
 *
 * THE ALLERGY RULE IS A SUBSTRING RULE, ON PURPOSE, AND IT SAYS SO
 * The reader marks an allergen and any food whose NAME contains one of that
 * allergen's keywords is marked in the list. It is deliberately not a hidden
 * ingredients database: the app cannot know what was in a restaurant dish, and
 * a warning that implied it knew would be worse than none. So the rule is the
 * honest one — "this dish's name mentions milk" — it is shown next to the dish
 * itself, and the card's own note says what it can and cannot catch. An
 * allergen the reader has not marked produces nothing at all.
 *
 * AND A FOOD THE READER TYPED THEMSELVES
 * The registry is forty-odd everyday foods and it cannot hold every plate. So an
 * item may carry a NAME instead of a registry row (`CUSTOM_FOOD_ID`, the
 * `customName` field), stored and shown exactly as the reader wrote it. It is a
 * name and nothing else: no portion, no calories, no macros, because there are
 * none the app could know, and the one thing this card must never do is print a
 * number it made up. `dayTotals` therefore COUNTS the item — a day of custom
 * foods is not an empty day — and adds nothing to the numbers, and the card
 * says which half of the totals the reader's own foods are missing from.
 *
 * PURE EXCEPT FOR STORAGE: the maths (`totalsOf`, `dayTotals`, `allergyHits`)
 * are functions over values, so every number below is reachable from a test
 * without a browser. The store half is the same shape `lib/habits` uses — one
 * module-level state, a subscribe set, write-through persistence — because two
 * mechanisms for the same job would be a second thing to keep in step.
 */

/** One food: what a portion is, and what that portion carries. */
export type FoodDef = {
  id: string;
  /** The name the reader sees, and what the allergy rule reads. */
  name: string;
  /** The portion the numbers describe, in the reader's words. */
  portion: string;
  kcal: number;
  /** Grams of protein per portion. */
  protein: number;
  /** Grams of carbohydrate per portion. */
  carb: number;
  /** Grams of fat per portion. */
  fat: number;
};

/**
 * Ten allergens, in the order the reader meets them.
 *
 * The ids are stable and stored; the labels are copy and live in the catalogue
 * (`lib/i18n`, the `nutrition.allergen.*` block), so the settings card is the
 * only place they are written and a translation can carry them.
 *
 * The keyword lists are Hungarian stems, matched against the food's NAME only.
 * They are deliberately generous — `tej` also catches tejföl, túró, sajt and
 * joghurt by their own entries — and they are visible here so a reader can see
 * exactly what a marking means.
 */
export type AllergenId =
  | "peanut"
  | "nut"
  | "milk"
  | "egg"
  | "gluten"
  | "soy"
  | "fish"
  | "shellfish"
  | "sesame"
  | "sulphite";

export type AllergenDef = {
  id: AllergenId;
  keywords: string[];
};

export const ALLERGENS: AllergenDef[] = [
  { id: "peanut", keywords: ["mogyoró"] },
  { id: "nut", keywords: ["dió", "mandula", "kesu", "mogyoróvaj", "tahini"] },
  { id: "milk", keywords: ["tej", "sajt", "joghurt", "túró", "vaj", "kefir", "tejszín"] },
  { id: "egg", keywords: ["tojás"] },
  {
    id: "gluten",
    keywords: ["búza", "liszt", "kenyér", "zsemle", "kifli", "tészta", "pizza", "sütemény", "keksz", "zab"],
  },
  { id: "soy", keywords: ["szója", "tofu"] },
  { id: "fish", keywords: ["hal", "lazac", "tonhal", "szardínia"] },
  { id: "shellfish", keywords: ["rák", "garnéla", "kagyló", "homár"] },
  { id: "sesame", keywords: ["szezám", "tahini"] },
  { id: "sulphite", keywords: ["bor", "aszalt", "mazsola", "szárított"] },
];

/**
 * The ids the store accepts, as a set.
 *
 * Exported so `lib/store` can repair the stored list against the SAME source
 * the rule uses — a hand-edited or older blob cannot smuggle in an allergen id
 * that would mark nothing and warn about nothing.
 */
export const ALLERGEN_IDS: ReadonlySet<string> = new Set(ALLERGENS.map((a) => a.id));

/** The four meals, in the order a day happens. */
export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
export type MealType = (typeof MEAL_TYPES)[number];

/**
 * The foods, and this list is the batch's whole content decision.
 *
 * Sixty everyday Hungarian foods across the ten groups a day actually uses —
 * grains, dairy, meat, fish, plant protein, vegetables, fruit, nuts, oils and
 * sweets, plus drinks and the two dishes the app's own tips name by name. The
 * numbers are per PORTION, not per 100 g, because the reader adds "one portion
 * of this" and a per-100 g table would make them do arithmetic the app can do.
 *
 * They are approximate values from standard tables, rounded to whole grams and
 * whole calories: this is a journal, not a laboratory, and a number that looks
 * more precise than it is would be a worse lie than an honest round one.
 */
export const FOODS: FoodDef[] = [
  { id: "oat", name: "Zabpehely", portion: "60 g", kcal: 228, protein: 8, carb: 39, fat: 4.5 },
  { id: "bread-whole", name: "Teljes kiőrlésű kenyér", portion: "2 szelet (60 g)", kcal: 150, protein: 6, carb: 28, fat: 1.6 },
  { id: "bread-white", name: "Fehér kenyér", portion: "2 szelet (60 g)", kcal: 160, protein: 5, carb: 31, fat: 1.2 },
  { id: "roll", name: "Zsemle", portion: "1 db (60 g)", kcal: 165, protein: 5, carb: 32, fat: 1.5 },
  { id: "kifli", name: "Kifli", portion: "1 db (50 g)", kcal: 140, protein: 4, carb: 27, fat: 1.1 },
  { id: "egg", name: "Tojás", portion: "2 db", kcal: 140, protein: 12, carb: 1, fat: 10 },
  { id: "scrambled", name: "Rántotta", portion: "2 tojásból", kcal: 190, protein: 13, carb: 1.5, fat: 15 },
  { id: "milk", name: "Tej", portion: "2 dl", kcal: 94, protein: 6.6, carb: 9.5, fat: 3.4 },
  { id: "yoghurt", name: "Joghurt", portion: "175 g", kcal: 110, protein: 6, carb: 14, fat: 3.5 },
  { id: "greek-yoghurt", name: "Görög joghurt", portion: "170 g", kcal: 130, protein: 15, carb: 6, fat: 4 },
  { id: "cheese", name: "Sajt (trappista)", portion: "30 g", kcal: 120, protein: 8, carb: 0, fat: 9.5 },
  { id: "cottage", name: "Túró", portion: "100 g", kcal: 105, protein: 13, carb: 4, fat: 4.5 },
  { id: "butter", name: "Vaj", portion: "10 g", kcal: 74, protein: 0, carb: 0, fat: 8 },
  { id: "sour-cream", name: "Tejföl", portion: "2 evőkanál (30 g)", kcal: 60, protein: 0.9, carb: 1, fat: 5.8 },
  { id: "chicken", name: "Csirkemell", portion: "150 g", kcal: 250, protein: 46, carb: 0, fat: 5.4 },
  { id: "turkey", name: "Pulykahús", portion: "150 g", kcal: 220, protein: 44, carb: 0, fat: 3.6 },
  { id: "pork", name: "Sertéskaraj", portion: "150 g", kcal: 330, protein: 40, carb: 0, fat: 18 },
  { id: "beef", name: "Marhahús", portion: "150 g", kcal: 320, protein: 42, carb: 0, fat: 16 },
  { id: "salmon", name: "Lazac", portion: "150 g", kcal: 310, protein: 34, carb: 0, fat: 19 },
  { id: "tuna", name: "Tonhal konzerv", portion: "1 doboz (120 g)", kcal: 130, protein: 29, carb: 0, fat: 1.5 },
  { id: "shrimp", name: "Garnéla", portion: "150 g", kcal: 150, protein: 30, carb: 1, fat: 2 },
  { id: "rice", name: "Rizs (főtt)", portion: "200 g", kcal: 260, protein: 5, carb: 58, fat: 0.4 },
  { id: "brown-rice", name: "Barna rizs (főtt)", portion: "200 g", kcal: 250, protein: 5.5, carb: 52, fat: 1.8 },
  { id: "potato", name: "Burgonya (főtt)", portion: "250 g", kcal: 215, protein: 5, carb: 50, fat: 0.3 },
  { id: "sweet-potato", name: "Édesburgonya", portion: "200 g", kcal: 180, protein: 3, carb: 40, fat: 0.2 },
  { id: "pasta", name: "Tészta (főtt)", portion: "200 g", kcal: 280, protein: 10, carb: 56, fat: 1.6 },
  { id: "lentil", name: "Lencse (főtt)", portion: "200 g", kcal: 230, protein: 18, carb: 40, fat: 0.8 },
  { id: "chickpea", name: "Csicseriborsó (főtt)", portion: "180 g", kcal: 260, protein: 14, carb: 40, fat: 4 },
  { id: "tofu", name: "Tofu", portion: "150 g", kcal: 180, protein: 18, carb: 4, fat: 11 },
  { id: "soy-granulate", name: "Szója granulátum", portion: "60 g", kcal: 210, protein: 30, carb: 9, fat: 6 },
  { id: "white-bean", name: "Fehérbab (főtt)", portion: "180 g", kcal: 230, protein: 15, carb: 40, fat: 1 },
  { id: "broccoli", name: "Brokkoli", portion: "200 g", kcal: 70, protein: 5, carb: 10, fat: 0.7 },
  { id: "spinach", name: "Spenót", portion: "150 g", kcal: 35, protein: 4.5, carb: 4, fat: 0.6 },
  { id: "tomato", name: "Paradicsom", portion: "150 g", kcal: 27, protein: 1.3, carb: 6, fat: 0.3 },
  { id: "cucumber", name: "Uborka", portion: "150 g", kcal: 21, protein: 1, carb: 4.5, fat: 0.2 },
  { id: "pepper", name: "Paprika", portion: "150 g", kcal: 40, protein: 1.5, carb: 9, fat: 0.4 },
  { id: "carrot", name: "Sárgarépa", portion: "150 g", kcal: 50, protein: 1, carb: 12, fat: 0.3 },
  { id: "apple", name: "Alma", portion: "1 közepes (180 g)", kcal: 95, protein: 0.5, carb: 25, fat: 0.3 },
  { id: "banana", name: "Banán", portion: "1 közepes (120 g)", kcal: 105, protein: 1.3, carb: 27, fat: 0.4 },
  { id: "orange", name: "Narancs", portion: "1 db (150 g)", kcal: 70, protein: 1.4, carb: 17, fat: 0.2 },
  { id: "berries", name: "Bogyós gyümölcs", portion: "100 g", kcal: 57, protein: 0.7, carb: 14, fat: 0.3 },
  { id: "almond", name: "Mandula", portion: "30 g", kcal: 175, protein: 6, carb: 6, fat: 15 },
  { id: "peanut", name: "Mogyoró", portion: "30 g", kcal: 180, protein: 4.5, carb: 5, fat: 15.5 },
  { id: "cashew", name: "Kesudió", portion: "30 g", kcal: 165, protein: 5, carb: 9, fat: 13 },
  { id: "peanut-butter", name: "Mogyoróvaj", portion: "2 evőkanál (32 g)", kcal: 190, protein: 8, carb: 6, fat: 16 },
  { id: "tahini", name: "Tahini", portion: "1 evőkanál (15 g)", kcal: 90, protein: 2.5, carb: 3, fat: 8 },
  { id: "olive-oil", name: "Olívaolaj", portion: "1 evőkanál (15 ml)", kcal: 119, protein: 0, carb: 0, fat: 13.5 },
  { id: "honey", name: "Méz", portion: "1 evőkanál (20 g)", kcal: 60, protein: 0, carb: 17, fat: 0 },
  { id: "chocolate", name: "Étcsokoládé", portion: "30 g", kcal: 165, protein: 2, carb: 15, fat: 11 },
  { id: "biscuit", name: "Keksz", portion: "3 db", kcal: 160, protein: 2, carb: 22, fat: 7 },
  { id: "cake", name: "Sütemény", portion: "1 szelet", kcal: 320, protein: 4, carb: 45, fat: 14 },
  { id: "pizza", name: "Pizza", portion: "1 szelet", kcal: 285, protein: 12, carb: 36, fat: 10 },
  { id: "hamburger", name: "Hamburger", portion: "1 db", kcal: 550, protein: 25, carb: 45, fat: 28 },
  { id: "fries", name: "Sültkrumpli (gyorsétel)", portion: "közepes", kcal: 340, protein: 4, carb: 43, fat: 17 },
  { id: "greek-salad", name: "Görög saláta", portion: "1 adag", kcal: 230, protein: 6, carb: 12, fat: 18 },
  { id: "veg-soup", name: "Zöldségleves", portion: "1 tál", kcal: 90, protein: 3, carb: 14, fat: 2 },
  { id: "meat-soup", name: "Húsleves", portion: "1 tál", kcal: 60, protein: 4, carb: 3, fat: 3 },
  { id: "shake", name: "Banánturmix tejjel", portion: "3 dl", kcal: 210, protein: 8, carb: 35, fat: 4 },
  { id: "coffee-milk", name: "Kávé tejjel", portion: "2 dl", kcal: 60, protein: 3, carb: 5, fat: 2.5 },
  { id: "green-tea", name: "Zöldtea", portion: "3 dl", kcal: 2, protein: 0, carb: 0.5, fat: 0 },
  { id: "water", name: "Víz", portion: "5 dl", kcal: 0, protein: 0, carb: 0, fat: 0 },
  { id: "beer", name: "Sör", portion: "5 dl", kcal: 210, protein: 1.5, carb: 17, fat: 0 },
  { id: "wine", name: "Bor (száraz)", portion: "1.5 dl", kcal: 120, protein: 0, carb: 3, fat: 0 },
  { id: "raisin", name: "Mazsola", portion: "30 g", kcal: 90, protein: 1, carb: 22, fat: 0.1 },
  { id: "prune", name: "Aszalt szilva", portion: "40 g", kcal: 100, protein: 0.9, carb: 26, fat: 0.2 },
];

/** The food with this id, or undefined for an id the registry no longer has. */
export function foodById(id: string): FoodDef | undefined {
  return FOODS.find((f) => f.id === id);
}

/**
 * The catalogue rows whose name contains the query, case-insensitively.
 *
 * The catalogue half of the meal log's autocomplete, and deliberately only
 * half: the reader's own foods live in `lib/customFoods`, which owns that key,
 * and the card merges the two lists. The merge is the card's job because the
 * ORDER is a UI decision — the reader's own names lead — while the matching
 * rules here and there are the same one-line rule and each module keeps its
 * own. An empty query matches nothing rather than everything: opening a box is
 * not a request for sixty rows.
 */
export function foodMatches(query: string): FoodDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return FOODS.filter((f) => f.name.toLowerCase().includes(q));
}

/* ------------------------------- the rule ------------------------------ */

/**
 * The allergens a food's NAME mentions, given the reader's marked list.
 *
 * Substring, case-insensitive, Hungarian letters folded the simple way (no
 * accent stripping: the keywords are written with the accents the names use),
 * and every keyword of every marked allergen is tried. The result is the
 * allergens to warn about, in `ALLERGENS` order, so two calls cannot disagree
 * about which warning prints first.
 *
 * An empty or absent marked list returns nothing — this never warns about an
 * allergen the reader did not mark.
 */
export function allergyHits(food: FoodDef, marked: readonly AllergenId[]): AllergenId[] {
  if (marked.length === 0) return [];
  const name = food.name.toLowerCase();
  return ALLERGENS.filter(
    (a) => marked.includes(a.id) && a.keywords.some((k) => name.includes(k)),
  ).map((a) => a.id);
}

/* ------------------------------- the maths ----------------------------- */

/** What a number of portions of one food carries. */
export type Totals = {
  kcal: number;
  protein: number;
  carb: number;
  fat: number;
};

const EMPTY: Totals = { kcal: 0, protein: 0, carb: 0, fat: 0 };

/** One portion's or several portions' numbers, rounded to whole grams. */
export function totalsOf(food: FoodDef, servings: number): Totals {
  const s = Number.isFinite(servings) && servings > 0 ? servings : 0;
  return {
    kcal: Math.round(food.kcal * s),
    protein: Math.round(food.protein * s),
    carb: Math.round(food.carb * s),
    fat: Math.round(food.fat * s),
  };
}

function add(a: Totals, b: Totals): Totals {
  return {
    kcal: a.kcal + b.kcal,
    protein: a.protein + b.protein,
    carb: a.carb + b.carb,
    fat: a.fat + b.fat,
  };
}

/* ------------------------------ the log -------------------------------- */

/**
 * The id a meal item carries when its food is one the reader typed themselves.
 *
 * A custom food has no row in the registry, so there is no id to look up: the
 * NAME is what the item carries (`customName`), and this constant is what makes
 * that item a legal one at the load path and in `addMealItem`. It is not a row
 * in `FOODS` and never becomes one — the registry is the app's content, the
 * reader's own foods are theirs.
 */
export const CUSTOM_FOOD_ID = "__custom__";

/**
 * The zero-value definition of a food the catalogue does not have.
 *
 * NOT a claim about the food: `kcal`, the macros and the portion are all empty,
 * and a caller uses this only to let the allergy rule and the "about to add"
 * line read the reader's own name — both are substring rules over a name, so a
 * name is all they need. It is never counted into a day's macros; `dayTotals`
 * counts the ITEM and adds no numbers, because there are none to add, and the
 * card says so in its own note.
 */
export function foodFromName(name: string): FoodDef {
  return {
    id: CUSTOM_FOOD_ID,
    name: name.trim(),
    portion: "",
    kcal: 0,
    protein: 0,
    carb: 0,
    fat: 0,
  };
}

/** One added item: which food, and how many portions. */
export type MealItem = {
  id: string;
  foodId: string;
  servings: number;
  /**
   * The reader's own name for a food outside the catalogue. Present only when
   * `foodId` is `CUSTOM_FOOD_ID`; absent on every catalogue item.
   */
  customName?: string;
};

/** A day's four meals. A missing meal is an empty meal. */
export type DayLog = Partial<Record<MealType, MealItem[]>>;

/** date → meals. Only days the reader added something to exist. */
export type NutritionLog = Record<string, DayLog>;

const KEY = "belso-iranytu-nutrition-log-v1";
/** The same cap the other list modules carry, so one key cannot grow forever. */
const MAX_DAYS = 400;

let state: NutritionLog = load();
const listeners = new Set<() => void>();

function load(): NutritionLog {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: NutritionLog = {};
    const days = Object.entries(parsed as Record<string, unknown>)
      .filter(([date]) => /^\d{4}-\d{2}-\d{2}$/.test(date))
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .slice(0, MAX_DAYS);
    for (const [date, dayRaw] of days) {
      if (!dayRaw || typeof dayRaw !== "object") continue;
      const day: DayLog = {};
      for (const meal of MEAL_TYPES) {
        const items = (dayRaw as Record<string, unknown>)[meal];
        if (!Array.isArray(items)) continue;
        const kept = items
          .filter((i): i is MealItem => {
            const item = i as Partial<MealItem> | null;
            return (
              !!item &&
              typeof item.id === "string" &&
              typeof item.foodId === "string" &&
              typeof item.servings === "number" &&
              (foodById(item.foodId) !== undefined ||
                (item.foodId === CUSTOM_FOOD_ID &&
                  typeof item.customName === "string" &&
                  item.customName.trim() !== ""))
            );
          })
          .slice(0, 40);
        if (kept.length) day[meal] = kept;
      }
      if (Object.keys(day).length) out[date] = day;
    }
    return out;
  } catch {
    return {};
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* in-memory only */
  }
}

function emit() {
  listeners.forEach((fn) => fn());
}

export function subscribeNutrition(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getNutritionLog(): NutritionLog {
  return state;
}

/**
 * Add one portion (or a fraction) of a food to a meal. Returns the item, or null.
 *
 * Two kinds of food are accepted, and nothing else: a row of the registry, or
 * the reader's own food when `foodId` is `CUSTOM_FOOD_ID` and `customName` is a
 * non-blank name. An unknown id still writes nothing — the catalogue's entries
 * are the app's, and a typo in one must not become an item nobody can render.
 */
export function addMealItem(
  date: string,
  meal: MealType,
  foodId: string,
  servings = 1,
  customName?: string,
): MealItem | null {
  const known = foodById(foodId) !== undefined;
  const name = customName?.trim();
  if (!known && !(foodId === CUSTOM_FOOD_ID && name)) return null;
  const s = Number.isFinite(servings) && servings > 0 ? Math.min(servings, 10) : 1;
  const item: MealItem = known
    ? { id: crypto.randomUUID(), foodId, servings: s }
    : { id: crypto.randomUUID(), foodId, servings: s, customName: name };
  const day: DayLog = { ...(state[date] ?? {}) };
  day[meal] = [...(day[meal] ?? []), item];
  state = { ...state, [date]: day };
  persist();
  emit();
  return item;
}

/**
 * Add several items at once — the path a whole menu day takes.
 *
 * One write and one notify, because "let this be today's menu" is ONE action:
 * a loop of `addMealItem` calls would persist and re-render seven times for a
 * press the reader made once. Nothing here is a second acceptance rule — an id
 * the registry does not have is skipped exactly as `addMealItem` refuses it —
 * and a call whose items are all unknown leaves the log untouched rather than
 * writing an empty day.
 *
 * THE ALLERGY RULE IS APPLIED HERE, AND ONLY FOR A WHOLE-DAY ADD
 * A menu day can hold twenty foods the reader did not choose one by one, so the
 * rule stops being a warning and becomes a DECISION: an item whose registry row
 * hits a marked allergen is not written, and it comes back in `skipped` with the
 * allergens that stopped it. That is only honest because the menu is the app's
 * own suggestion — refusing to add a food the reader never picked cannot take
 * anything away from them — while the single-item path stays a warning, because
 * there the reader is the one choosing. Nothing is invisible: the caller gets
 * the skipped list and the card prints it. With nothing marked, nothing is ever
 * skipped, which is the same rule `allergyHits` has everywhere else.
 *
 * The return value is what actually happened: the items written and the ones
 * held back, so a caller can say both without recomputing either from the log.
 */
export type AddMenuDayResult = {
  written: MealItem[];
  skipped: { food: FoodDef; allergens: AllergenId[] }[];
};

export function addMealItems(
  date: string,
  items: readonly { meal: MealType; foodId: string; servings: number }[],
  marked: readonly AllergenId[] = [],
): AddMenuDayResult {
  const day: DayLog = { ...(state[date] ?? {}) };
  const written: MealItem[] = [];
  const skipped: { food: FoodDef; allergens: AllergenId[] }[] = [];
  for (const { meal, foodId, servings } of items) {
    const food = foodById(foodId);
    if (food === undefined) continue;
    const allergens = allergyHits(food, marked);
    if (allergens.length > 0) {
      skipped.push({ food, allergens });
      continue;
    }
    const s = Number.isFinite(servings) && servings > 0 ? Math.min(servings, 10) : 1;
    const item: MealItem = { id: crypto.randomUUID(), foodId, servings: s };
    day[meal] = [...(day[meal] ?? []), item];
    written.push(item);
  }
  if (written.length === 0) return { written, skipped };
  state = { ...state, [date]: day };
  persist();
  emit();
  return { written, skipped };
}

/** Remove one item. A day that becomes empty leaves the log entirely. */
export function removeMealItem(date: string, meal: MealType, itemId: string) {
  const day = state[date];
  if (!day) return;
  const items = (day[meal] ?? []).filter((i) => i.id !== itemId);
  const next: DayLog = { ...day };
  if (items.length) next[meal] = items;
  else delete next[meal];
  const log: NutritionLog = { ...state };
  if (Object.keys(next).length) log[date] = next;
  else delete log[date];
  state = log;
  persist();
  emit();
}

/**
 * Every item of one day, in meal order — the shape the totals walk.
 *
 * `food` is absent for an item the reader named themselves: there is no row to
 * hand back, and inventing one would be the one lie this card cannot afford.
 * Callers that only print the item read `item.customName`; callers that add
 * numbers skip the item when `food` is missing.
 */
export function dayItems(
  log: NutritionLog,
  date: string,
): { meal: MealType; item: MealItem; food?: FoodDef }[] {
  const day = log[date];
  if (!day) return [];
  const out: { meal: MealType; item: MealItem; food?: FoodDef }[] = [];
  for (const meal of MEAL_TYPES) {
    for (const item of day[meal] ?? []) {
      const food = foodById(item.foodId);
      out.push(food ? { meal, item, food } : { meal, item });
    }
  }
  return out;
}

/**
 * One day's totals, and how many items earned them.
 *
 * `items` counts every item on the list, the reader's own foods included — it is
 * what the card's "nothing on the list yet" line reads, and a day of custom
 * foods is not an empty day. The numbers are summed from the registry rows
 * alone: a custom food has no values, and counting a zero would be worse than
 * leaving it out, because zero is a number somebody would believe. The card
 * states the omission under the totals.
 */
export function dayTotals(log: NutritionLog, date: string): Totals & { items: number } {
  let totals = EMPTY;
  let items = 0;
  for (const { item, food } of dayItems(log, date)) {
    if (food) totals = add(totals, totalsOf(food, item.servings));
    items += 1;
  }
  return { ...totals, items };
}

/** One meal's totals, for the row's own line. */
export function mealTotals(log: NutritionLog, date: string, meal: MealType): Totals {
  let totals = EMPTY;
  for (const item of log[date]?.[meal] ?? []) {
    const food = foodById(item.foodId);
    if (food) totals = add(totals, totalsOf(food, item.servings));
  }
  return totals;
}

/**
 * Forget the whole log, in memory and in storage.
 *
 * The module has no other way to forget, and the tests need one: the state is a
 * module binding shared by the whole run, so a file that adds a meal would
 * otherwise leave it for the next file's totals.
 */
export function resetNutrition() {
  state = {};
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* no storage */
  }
  emit();
}
