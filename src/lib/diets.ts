/**
 * The twelve diet types (Phase 2, commit 2; health audit, 2026-10-20) — the
 * choice the weekly menu hangs on.
 *
 * WHAT THIS MODULE IS, AND WHAT IT REFUSES TO BE
 * A picker, and nothing more: twelve names the reader can choose between, one
 * of which may be in force — the nine the first slice shipped, plus the three
 * the health-tab audit asked for because they are the ones a reader is most
 * often told to follow by somebody else: gluten-free, lactose-free, and
 * pescatarian. It is deliberately NOT a nutrition engine. There is no
 * scoring, no allowed/forbidden food list, no calculated target and no advice —
 * a diet type is a preference the reader holds, not a claim the app makes, and
 * a module that "checked" the day against Paleo would be inventing a rule book
 * nobody agreed to. What the choice is FOR is one thing: the weekly menu and
 * the allergy warnings can read it, so the app can offer something closer to
 * what the reader actually eats without ever saying what they should eat.
 *
 * WHY ONE ID ON ITS OWN KEY
 * The same shape `lib/customFoods` keeps, for the same reason: a single value
 * with its own storage key is additive — nothing about `Settings`, `Entry` or
 * the store's blob changes, a reader who never picks a diet has no new key at
 * all, and a value that goes stale or foreign is repaired at the one door this
 * module owns. The alternative, a field inside the store's `settings` blob,
 * would put a second owner on the same object for one string.
 *
 * WHY `null` IS A REAL STATE
 * "No diet chosen" is not "Other". `Other` is a choice the reader made — a diet
 * this list does not name — and it is stored like any other; `null` is the
 * state before any choice, and the picker says so in words. The distinction
 * matters downstream: a menu can be offered to someone who chose `Other` and
 * declined to someone who has chosen nothing, and a single "other" default
 * would erase that.
 *
 * A DIET THE APP NO LONGER KNOWS
 * A stored id that is not one of the twelve (a hand-edited blob, a value from a
 * future version) loads as `null` rather than as that value: the picker would
 * otherwise render twelve unpressed buttons beside a summary naming a diet it
 * cannot print.
 */

/**
 * The twelve, in the order the picker shows them.
 *
 * The order is a plain one — the named diets first, "Other" last — and not a
 * ranking: nothing here is healthier than anything else, and the picker says
 * so by rendering them as one row of equal buttons.
 *
 * WHY THE THREE NEW ONES SIT BEFORE "OTHER"
 * Gluten-free, lactose-free and pescatarian are not new ideas in the list's
 * register — they are the eating patterns a reader is most likely to have been
 * given by a doctor or a dietitian rather than to have picked from a menu.
 * Adding them is additive in every direction that matters: the ids are new, a
 * stored choice keeps its id, and nothing that already had a menu loses one.
 */
export const DIET_TYPES = [
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
] as const;

export type DietId = (typeof DIET_TYPES)[number];

/**
 * The ids the load path accepts, as a set.
 *
 * Exported so the repair below and any other caller read the SAME source the
 * picker renders: a second hand-written list is a second thing to forget, and
 * the failure it would cause — an id the card draws and the loader rejects —
 * is exactly the one this module exists to avoid.
 */
export const DIET_IDS: ReadonlySet<string> = new Set(DIET_TYPES);

/** Narrowing guard for a value coming from storage or from outside the app. */
export function isDietId(value: unknown): value is DietId {
  return typeof value === "string" && DIET_IDS.has(value);
}

/**
 * The one sentence a diet may say about itself, and the only place this app
 * writes anything that sounds like guidance.
 *
 * WHY IT EXISTS
 * The health-tab audit's finding was that the picker asked a reader to choose a
 * way of eating and then said nothing about the cost of that choice. Three of
 * the twelve are not preferences at all — a reader may be following one because
 * a doctor said so — and the two that remove a whole food group (vegan,
 * gluten-free) have a nutrient question attached that a silent picker implies
 * does not exist.
 *
 * WHAT IT REFUSES TO BE
 * Not a plan, not a target, and not a diagnosis. Every note below names a
 * QUESTION and, where one applies, a professional to ask it of; none states a
 * dose, a limit, a permitted food or a substituted nutrient as an instruction.
 * The note is keyed by diet and rendered only while that diet is in force, so a
 * reader who has chosen nothing is told nothing — the same silence the tips
 * modules keep.
 *
 * `other` and the diets whose only content is a preference (`low-carb`,
 * `high-protein`, `mediterranean`, `paleo`) have no note: there is no fact about
 * them this app can state without pretending to a knowledge it does not have.
 */
export const DIET_NOTES: Partial<Record<DietId, string>> = {
  "gluten-free":
    "A gluténmentes választás gyakran orvosi okból születik, és olyankor a szigorú betartás a kezelés része — ezt szakember állítja be. A boltban a gluténmentes jelölés számít, a zab pedig csak külön jelölt formában biztonságos. Ha nem tisztázott okból vágsz ki egy egész élelmiszercsoportot, érdemes dietetikussal vagy orvossal egyeztetni.",
  "lactose-free":
    "A laktózmentes étrendben a kalcium és a D-vitamin bevitele lehet kérdés, mert a tejtermékek a legkézenfekvőbb forrásai. Ha a tejterméket teljesen kihagyod, kérdezd meg dietetikustól, miből pótolható — és hogy valóban szükséges-e a teljes kihagyás.",
  pescatarian:
    "A peszkatariánus étrendben a fehérje főleg halból, tojásból és hüvelyesekből jön. A halfajtákat érdemes váltogatni, a nagy testű ragadozó halakat pedig ritkábban választani. Vashiány vagy más hiánytünet esetén vérvizsgálatot és szakembert érdemes kérni.",
  vegan:
    "A vegán étrendben a B12-vitamin bevitele külön figyelmet kér, mert növényi étrendben megbízható mennyiségben nem fordul elő; a vas, a cink és az omega-3 is szempont lehet. Ezek pótlásáról érdemes szakemberrel beszélni, mert a szükséges mennyiség egyéni.",
  keto:
    "A tartósan ketogén étrend komoly beállítást kér, és bizonyos állapotok vagy gyógyszerek mellett nem javasolt — ezt orvos tudja megítélni. Rövid, kipróbáló időszak és hosszú távú étrend nem ugyanaz a döntés.",
  raw:
    "A nyers étrendben a fehérje- és a B12-bevitel szűkülhet, a főtt ételek kihagyása pedig hosszú távon nehezen tartható. Ha huzamosabb ideig így étkezel, érdemes szakemberrel átbeszélni a pótlást.",
};

const KEY = "belso-iranytu-diet-v1";

let state: DietId | null = load();
const listeners = new Set<() => void>();

function load(): DietId | null {
  try {
    const raw = localStorage.getItem(KEY);
    return isDietId(raw) ? raw : null;
  } catch {
    return null;
  }
}

function persist() {
  try {
    if (state === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, state);
  } catch {
    /* in-memory only */
  }
}

function emit() {
  listeners.forEach((fn) => fn());
}

/**
 * The choice in force, or `null` before the reader has made one.
 *
 * A snapshot, not a subscription: the card that renders the picker takes one
 * when it mounts and subscribes below, so the read and the update cannot
 * disagree about what is stored.
 */
export function getDietType(): DietId | null {
  return state;
}

/**
 * Choose a diet, or clear the choice with `null`.
 *
 * Writes through to storage and notifies the subscribers, always: setting the
 * same id again is not an error, and a picker that pressed its own button twice
 * would otherwise leave the card unchanged for reasons the reader cannot see.
 */
export function setDietType(value: DietId | null) {
  if (value !== null && !isDietId(value)) return;
  state = value;
  persist();
  emit();
}

/** The subscribe half of the pair `getDietType` reads. */
export function subscribeDiet(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Forget the choice, in memory and in storage.
 *
 * The tests need this for the same reason `lib/customFoods` needs its own
 * reset: the state is a module binding shared by every file in one `bun test`
 * run, and a file that picked a diet would otherwise hand it to the next file's
 * reads. The card's own "clear" path is `setDietType(null)`, which is a reader
 * action rather than a test hook.
 */
export function resetDiet() {
  state = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* no storage */
  }
  emit();
}
