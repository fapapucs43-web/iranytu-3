/**
 * Local custom foods, stored in the reader's browser only.
 *
 * WHAT THIS MODULE IS FOR
 * The meal log already knows how to add a named item to a day; what it does not
 * know is a reader's own foods that are not in the built-in catalogue. This
 * module owns exactly that list: free-text foods the reader has added, kept
 * under a private key, with no coupling to the `Entry` type, the tracker blob,
 * or the catalogue module (`lib/nutrition`/`FOODS`).
 *
 * WHY A SEPARATE MODULE AND NOT A FIELD IN THE STORE
 * Two reasons, both the same as the meal-log module's:
 *   - the list is append-only and grows with the reader, so it wants its own
 *     key rather than a flat field in a blob that is exported and merged;
 *   - a reader who never adds a custom food has no key in storage at all.
 *
 * SHAPE
 * One entry per custom food: a stable id, the name as the reader typed it, and
 * an added-at timestamp used only for ordering.
 */

export type CustomFood = {
  id: string;
  /** The name the reader typed. Stored and displayed exactly as typed. */
  name: string;
  /** Epoch ms, used only for ordering — newest-first in the list. */
  addedAt: number;
};

const KEY = "belso-iranytu-custom-foods-v1";
const MAX = 200;

let state: CustomFood[] = load();

function load(): CustomFood[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: CustomFood[] = [];
    for (const item of parsed) {
      if (
        !item ||
        typeof item !== "object" ||
        typeof item.id !== "string" ||
        typeof item.name !== "string" ||
        typeof item.addedAt !== "number"
      )
        continue;
      if (!item.name.trim()) continue;
      out.push({ id: item.id, name: item.name.trim(), addedAt: item.addedAt });
    }
    return out.slice(0, MAX);
  } catch {
    return [];
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* in-memory only */
  }
}

/** Every custom food, newest first. */
export function getCustomFoods(): readonly CustomFood[] {
  return state;
}

/** Whether a name is already in the custom list (case-insensitive). */
export function hasCustomFoodName(name: string): boolean {
  const key = name.trim().toLowerCase();
  if (!key) return false;
  return state.some((f) => f.name.toLowerCase() === key);
}

/**
 * Add a custom food. Normalises the name (trimmed). Returns the food, or null
 * if the name is blank or already exists.
 */
export function addCustomFood(name: string): CustomFood | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (hasCustomFoodName(trimmed)) return null;
  const food: CustomFood = {
    id: crypto.randomUUID(),
    name: trimmed,
    addedAt: Date.now(),
  };
  state = [food, ...state].slice(0, MAX);
  persist();
  return food;
}

/** Remove one custom food by id. */
export function removeCustomFood(id: string): boolean {
  const idx = state.findIndex((f) => f.id === id);
  if (idx < 0) return false;
  state = state.filter((f) => f.id !== id);
  persist();
  return true;
}

/**
 * Return custom foods whose name contains the query (case-insensitive), in
 * newest-first order. Empty query returns an empty list.
 *
 * `list` defaults to the module's own state; the meal log passes the snapshot
 * it renders from, so the box it draws and the matches it filters cannot
 * disagree about what the reader owns.
 */
export function customFoodMatches(
  query: string,
  list: readonly CustomFood[] = state,
): readonly CustomFood[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return list.filter((f) => f.name.toLowerCase().includes(q));
}

/**
 * Forget the whole list, in memory and in storage.
 *
 * The module has no other way to forget, and the tests need one: the state is a
 * module binding shared by the whole run, so a file that adds a food would
 * otherwise leave it for the next file's list. Same reason, and the same shape,
 * as `resetNutrition` in `lib/nutrition`.
 */
export function resetCustomFoods() {
  state = [];
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* no storage */
  }
}
