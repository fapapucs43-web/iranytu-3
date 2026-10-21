/**
 * Phase 6, commit 2 — the memory half of "Minden adat törlése", and the proof
 * that the app is clean without a reload.
 *
 * THE DEFECT THIS FILE PINS
 * The key registry emptied the next load and left the running one alone. The
 * habits, the gratitude notes, the thought records, the custom trackers and the
 * activity labels are each read into a module-level variable when their module
 * is imported, so a reader who deleted everything stayed in a session that still
 * showed what they had just deleted: the keys were gone and the screen was not.
 * The commit before this one gives every one of those modules the production
 * reset it was missing and runs them from `RESET_FUNCTIONS` inside
 * `wipeAppStorage`; this file is the proof, and the reason the two lists cannot
 * drift apart again.
 *
 * WHY THE IMPORTS ARE DYNAMIC
 * These modules read storage ONCE, at import, and the subject of this file is
 * what that copy does when the wipe runs. So the storage double has to exist
 * before the import happens: a static import evaluates before the first line of
 * this file, the modules would start empty, and every assertion below would pass
 * while proving nothing. `await import(...)` after the shim is the whole trick,
 * and the seeded blobs are what the running session is holding when the wipe is
 * asked to clear it.
 *
 * WHY A FRESH IMPORT IS THE "NO RELOAD" PROOF
 * `?after-the-wipe` re-evaluates a module inside the same process, which is what
 * a reload would show — its state comes from storage as it stands at that
 * moment. Comparing the live module against that copy is the difference between
 * "the key was removed" (which the registry's own test already pin) and "the
 * reader's screen is now what a reload would give them". The second is what the
 * button promises, and it is the assertion the mutation — dropping a module from
 * `RESET_FUNCTIONS` — turns red.
 *
 * THE SEED GOES THROUGH THE MODULES' OWN DOOR
 * A test cannot put a record back into a module that has already started by
 * writing the key: the blob is read once. So `seedOldRecords` re-seeds storage
 * for the records that are read per call, and the five that keep a copy are
 * re-seeded through their own write path (`addHabit`, `addGratitude`, …), which
 * is the only door there is.
 *
 * AND EACH ONE IS EMPTIED FIRST, OR THE SEED IS NOT A SEED
 * Those write paths refuse rather than throw when they do not like the record:
 * a gratitude entry for a day that already has one, a habit or a tracker or an
 * activity at its cap or under a label that is already taken — each returns
 * null and writes nothing. Bun runs every file in the suite in one process, so
 * an earlier file can leave one of these modules holding a record of its own,
 * and an emptiness test then measures that file's leftovers rather than this
 * file's premise. That is not hypothetical: it is the only test here to fail in
 * CI while passing locally, and the difference was exactly one custom activity
 * another file had added. Each module is now reset through its own production
 * reset before its record is written back, so the seed opens the door it is
 * about to walk through — which is what makes every test here independent of
 * the order it runs in, a property a wipe this destructive cannot otherwise
 * promise.
 *
 * A SOURCE SCAN, FOR THE ONE CLAIM BEHAVIOUR CANNOT SEE
 * The order of the wipe's three steps is deliberate (see `RESET_FUNCTIONS`), and
 * no assertion about its result can tell the orders apart — the end state is the
 * same. So the order is checked where it is written, the way Phase 5 checks the
 * chain, rather than left as a sentence in a docblock.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

// The key list the mutation proof mirrors by hand, taken from the real registry.
const { WIPE_KEYS } = await import("../../src/lib/storageKeys");

/* --------------------------- the storage double ------------------------ */

const local: Record<string, string> = {};
const session: Record<string, string> = {};
const globals = globalThis as unknown as { localStorage?: unknown; sessionStorage?: unknown };

function makeStore(backing: Record<string, string>) {
  return {
    getItem: (k: string) => (k in backing ? backing[k]! : null),
    setItem: (k: string, v: string) => {
      backing[k] = v;
    },
    removeItem: (k: string) => {
      delete backing[k];
    },
  };
}

globals.localStorage = makeStore(local);
globals.sessionStorage = makeStore(session);

/**
 * The two the seed itself needs, imported before it runs.
 *
 * `ITEM_COUNT` is the length a stored answer set must have to be accepted at
 * all, and `REMINDER_MESSAGES` is what makes the reminder mirror's seeded value
 * a legal one — so both have to be in scope before `seedStorage` is called, and
 * both are read-only registries with nothing of their own in storage.
 */
const { ITEM_COUNT } = await import("../../src/lib/assessments");
const { REMINDER_MESSAGES, loadReminderMessage } = await import("../../src/lib/notifications");

/**
 * The record every wipe test starts from.
 *
 * Written before the dynamic imports below, because that is when the modules
 * read it, and the ids are fixed strings rather than generated ones so a failure
 * names the record it is about.
 */
const OLD_DATE = "2026-01-02";
const HABITS_KEY = "belso-iranytu-habits-v1";
const GRATITUDE_KEY = "belso-iranytu-gratitude";
const CBT_KEY = "belso-iranytu-cbt-records";
const TRACKERS_KEY = "belso-iranytu-custom-trackers";
const ACTIVITIES_KEY = "belso-iranytu-custom-activities";
const CARD_STATES_KEY = "belso-iranytu:cardStates";
const ASSESSMENTS_KEY = "belso-iranytu-assessments-v1";
const ONBOARDING_KEY = "belso-iranytu-onboarding";
const REMINDER_KEY = "belso-iranytu-reminder-message";
const VOCAB_KEY = "belso-iranytu-emotion-vocab";
const LOCK_SESSION_KEY = "belso-iranytu-app-lock-session";

function seedStorage(): void {
  local[HABITS_KEY] = JSON.stringify({
    habits: [{ id: "h-old", icon: "💧", label: "Régi szokás" }],
    checks: { "h-old": [OLD_DATE] },
  });
  local[GRATITUDE_KEY] = JSON.stringify([
    { id: "g-old", date: OLD_DATE, text: "Régi hála", createdAt: 1 },
  ]);
  local[CBT_KEY] = JSON.stringify([
    {
      id: "c-old",
      date: OLD_DATE,
      situation: "Régi helyzet",
      automaticThought: "Régi gondolat",
      emotion: "szorongás",
      distressBefore: 8,
      evidenceFor: "",
      evidenceAgainst: "",
      balancedThought: "",
      distressAfter: 4,
      createdAt: 1,
    },
  ]);
  local[TRACKERS_KEY] = JSON.stringify([
    { id: "t-old", icon: "⭐", label: "Régi tracker", kind: "slider", min: 1, max: 10 },
  ]);
  local[ACTIVITIES_KEY] = JSON.stringify([{ id: "a-old", icon: "🏃", label: "Régi aktivitás" }]);
  local[CARD_STATES_KEY] = JSON.stringify({ "settings-data": true });
  // The questionnaire payload is written in the shape `lib/assessmentStore`
  // accepts — a full answer set, because a half-written run is dropped rather
  // than scored into a band.
  local[ASSESSMENTS_KEY] = JSON.stringify({
    version: 1,
    items: [
      { id: "as-old", date: OLD_DATE, answers: Array.from({ length: ITEM_COUNT }, () => 0), impact: null },
    ],
  });
  local[ONBOARDING_KEY] = JSON.stringify({ completed: true, trackers: ["sleep"], theme: "dark" });
  local[REMINDER_KEY] = REMINDER_MESSAGES[1]!;
  local[VOCAB_KEY] = JSON.stringify(["Egyedi érzelem"]);
  // One key that lives in `sessionStorage` only: the wipe has to reach both.
  session[LOCK_SESSION_KEY] = "unlocked";
  // A key of another app and the store's dormant v1 name: the wipe is scoped to
  // the registry, not a blanket clear.
  local["daily-goals"] = "v1 maradék";
  local["mas-app-kulcs"] = "nem a miénk";
}

seedStorage();

/* ------------------- the modules, imported on top of it ----------------- */

const habits = await import("../../src/lib/habits");
const gratitude = await import("../../src/lib/gratitude");
const cbt = await import("../../src/lib/cbt");
const trackers = await import("../../src/lib/customTrackers");
const activities = await import("../../src/lib/customActivities");
const cardStates = await import("../../src/lib/cardStates");
const assessmentStore = await import("../../src/lib/assessmentStore");
const onboarding = await import("../../src/lib/onboarding");
const store = await import("../../src/lib/store");
const { RESET_FUNCTIONS, wipeAppStorage } = await import("../../src/lib/storageKeys");

afterAll(() => {
  delete globals.localStorage;
  delete globals.sessionStorage;
});

/* ------------------------------- helpers ------------------------------- */

/**
 * The store a first-ever load produces, pinned by hand.
 *
 * `lib/habits` does not export its `DEFAULTS`, and importing a second copy of
 * the module to compare against would be a copy whose own storage read is not
 * the reader's — so the four starter habits are written out here. That is the
 * point of a pin: if the defaults change, this file has to say so.
 */
const FRESH_HABITS = {
  habits: [
    { id: "water", icon: "💧", label: "Víz" },
    { id: "walk", icon: "🚶", label: "Séta" },
    { id: "meditation", icon: "🧘", label: "Meditáció" },
    { id: "sleep8", icon: "😴", label: "8 óra alvás" },
  ],
  checks: {},
};

/** The old records: back in storage, and back in the memory that read it. */
function seedOldRecords(): void {
  seedStorage();
  // Each of the five clears its own module FIRST, then writes through its own
  // door. The clearing is what makes the seed independent of the order the
  // files run in: bun shares one module registry across the whole suite, so an
  // earlier file may have left its own habits, notes, labels or trackers in
  // these modules — and every one of the five write paths REFUSES a record it
  // does not want. `addGratitude` refuses a day that already has one, `addHabit`
  // and `addCustomTracker` and `addCustomActivity` all refuse at their cap or on
  // a duplicate label, and each of those returns null rather than throwing.
  //
  // Seeding behind a "the module is empty" test therefore made the seed depend
  // on what another file happened to leave behind: a module that was merely not
  // empty skipped the write, the premise below ran against a session that never
  // held the record, and the suite went red on a machine it passed on locally.
  // Clearing first means the write path is always open, so the seeded record is
  // always the one the module is holding.
  habits.resetHabits();
  gratitude.resetGratitude();
  cbt.resetCbtRecords();
  trackers.resetCustomTrackers();
  activities.resetCustomActivities();

  const habit = habits.addHabit("💧", "Régi szokás");
  if (habit) habits.toggleHabitDate(habit.id, OLD_DATE);
  gratitude.addGratitude("Régi hála", OLD_DATE);
  cbt.addCbtRecord({
    date: OLD_DATE,
    situation: "Régi helyzet",
    automaticThought: "Régi gondolat",
    emotion: "szorongás",
    distressBefore: 8,
    evidenceFor: "",
    evidenceAgainst: "",
    balancedThought: "",
    distressAfter: 4,
  });
  trackers.addCustomTracker({ icon: "⭐", label: "Régi tracker", kind: "slider", min: 1, max: 10 });
  activities.addCustomActivity("🏃", "Régi aktivitás");
}

/**
 * One module's reset, run the way the wipe runs it, and everything it owes.
 *
 * The three claims are the module's whole contract: the record it was holding is
 * gone, the key is gone, and the subscribers were told — the last one is what
 * re-renders a reader's card without a reload, so a reset that forgot to notify
 * would leave the fix half done and this is where that shows up.
 */
function resetOnce<T>(m: {
  name: string;
  key: string;
  reset: () => void;
  read: () => T;
  subscribe: (fn: () => void) => () => void;
  fresh: T;
}): void {
  let calls = 0;
  const off = m.subscribe(() => {
    calls += 1;
  });
  try {
    expect(m.read(), `${m.name} holds the old record before its reset`).not.toEqual(m.fresh);
    m.reset();
  } finally {
    off();
  }
  expect(m.read(), `${m.name} holds the fresh state after its reset`).toEqual(m.fresh);
  expect(local[m.key], `${m.name} removed its key`).toBeUndefined();
  expect(calls, `${m.name} told its subscribers`).toBeGreaterThan(0);
}

/* ------------------------------ the premise ---------------------------- */

describe("the running session is what the modules loaded, and the wipe must reach it", () => {
  test("the five modules that keep a copy are serving the seeded record", () => {
    seedOldRecords();
    // Without this the rest of the file could pass against modules that were
    // empty all along, which is the failure a green suite would not show.
    //
    // "Contains" rather than "equals" on purpose: bun runs every test file in
    // one process, so another file may have imported these modules first and
    // left its own records in them. What this file needs is that the SEEDED
    // record is in the running session, not that it is the only one.
    expect(habits.getHabits().habits.map((h) => h.label)).toContain("Régi szokás");
    const seededHabit = habits.getHabits().habits.find((h) => h.label === "Régi szokás")!;
    expect(habits.getHabits().checks[seededHabit.id]).toEqual([OLD_DATE]);
    expect(gratitude.getGratitudeEntries().some((g) => g.text === "Régi hála")).toBe(true);
    expect(cbt.getCbtRecords().some((r) => r.automaticThought === "Régi gondolat")).toBe(true);
    expect(trackers.getCustomTrackers().some((t) => t.label === "Régi tracker")).toBe(true);
    expect(activities.getCustomActivities().some((a) => a.label === "Régi aktivitás")).toBe(true);
    // And the keys are on the device, so the session and the storage agree.
    for (const key of [HABITS_KEY, GRATITUDE_KEY, CBT_KEY, TRACKERS_KEY, ACTIVITIES_KEY]) {
      expect(local[key], `${key} is seeded`).toBeDefined();
    }
  });
});

/* -------------------------- the registry's list ------------------------ */

describe("RESET_FUNCTIONS is every module that owns a stored record", () => {
  test("it names every production reset the registry runs, in the documented order", () => {
    expect(RESET_FUNCTIONS.map((fn) => fn.name)).toEqual([
      "resetHabits",
      "resetGratitude",
      "resetCbtRecords",
      "resetCustomTrackers",
      "resetCustomActivities",
      "resetCardStates",
      "clearAssessments",
      "resetSeenBadges",
      "resetSeenLessons",
      "resetWeeklyAnswers",
      "resetWeeklySkips",
      "resetReminderMessage",
      "resetCompanion",
    ]);
    // The list is what `wipeAppStorage` runs, so an entry that is not a function
    // would be a hole the wipe cannot see.
    for (const fn of RESET_FUNCTIONS) expect(typeof fn).toBe("function");
  });

  test("each memory-holding reset empties its module, deletes its key and notifies its subscribers", () => {
    seedOldRecords();
    resetOnce({
      name: "resetHabits",
      key: HABITS_KEY,
      reset: habits.resetHabits,
      read: habits.getHabits,
      subscribe: habits.subscribeHabits,
      fresh: FRESH_HABITS,
    });
    resetOnce({
      name: "resetGratitude",
      key: GRATITUDE_KEY,
      reset: gratitude.resetGratitude,
      read: gratitude.getGratitudeEntries,
      subscribe: gratitude.subscribeGratitude,
      fresh: [],
    });
    resetOnce({
      name: "resetCbtRecords",
      key: CBT_KEY,
      reset: cbt.resetCbtRecords,
      read: cbt.getCbtRecords,
      subscribe: cbt.subscribeCbt,
      fresh: [],
    });
    resetOnce({
      name: "resetCustomTrackers",
      key: TRACKERS_KEY,
      reset: trackers.resetCustomTrackers,
      read: trackers.getCustomTrackers,
      subscribe: trackers.subscribeCustomTrackers,
      fresh: [],
    });
    resetOnce({
      name: "resetCustomActivities",
      key: ACTIVITIES_KEY,
      reset: activities.resetCustomActivities,
      read: activities.getCustomActivities,
      subscribe: activities.subscribeCustomActivities,
      fresh: [],
    });
  });

  test("mutation proof: dropping a module from RESET_FUNCTIONS leaves its memory intact", async () => {
    // The mutation is concrete, not inferred from prose: take a real RESET_FUNCTIONS
    // entry out and run the wipe the way the registry would if the entry were missing.
    // `resetCardStates` is the one with a per-process cache the key wipe can never
    // reach, so a registry that skipped it would leave the most visible residue.
    const cardStatesReset = RESET_FUNCTIONS.find((fn) => fn.name === "resetCardStates");
    expect(cardStatesReset).toBeDefined(); // the file stays honest about what it is mutating

    seedOldRecords();
    cardStates.setCardCollapsed("mutation-proof-card", true);
    expect(cardStates.loadCardStates()["mutation-proof-card"]).toBe(true);
    local[CARD_STATES_KEY] = JSON.stringify({ "mutation-proof-card": true });

    const reducedWipe = [
      ...RESET_FUNCTIONS.filter((fn) => fn !== cardStatesReset),
    ] as Array<() => void>;
    for (const reset of reducedWipe) {
      try {
        reset();
      } catch {
        /* same tolerance the real wipe has */
      }
    }
    // Key wipe: mirror the registry's localStorage loop by hand so the only
    // difference between this and a real wipe is the missing reset.
    for (const key of WIPE_KEYS) {
      try {
        delete local[key];
      } catch {
        /* no storage */
      }
    }
    for (const key of WIPE_KEYS) {
      try {
        delete session[key];
      } catch {
        /* no session storage */
      }
    }

    // Mutation proof: without resetCardStates the cache survives.
    // The real wipe clears it; the reduced wipe must not — otherwise the mutation
    // is not a mutation of the thing the file claims it is mutating.
    const cacheAfter = cardStates.loadCardStates();
    expect(Object.keys(cacheAfter)).toContain("mutation-proof-card");
    expect(cacheAfter["mutation-proof-card"]).toBe(true);
  });

  test("the no-memory resets only remove their key", async () => {
    seedOldRecords();
    // These read storage on every call, so the in-memory half is a no-op — the
    // key removal is the whole reset. Each one is still called by the wipe.
    expect(local[ASSESSMENTS_KEY]).toBeDefined();
    assessmentStore.clearAssessments();
    expect(local[ASSESSMENTS_KEY]).toBeUndefined();
  });
});

/* ------------------------------ the wipe ------------------------------- */

describe("Minden adat törlése — after the wipe the app is clean without a reload", () => {
  test("wipeAppStorage runs the resets before it removes a key", () => {
    // The end state cannot tell the two orders apart, so the order is read where
    // it is written. A reset that ran after the key loops could leave a key
    // behind a wipe that had already passed it — the chain's `resetAll` writes —
    // and this is the line that keeps that from being reintroduced silently.
    const source = readFileSync(join(ROOT, "src/lib/storageKeys.ts"), "utf8");
    const start = source.indexOf("export function wipeAppStorage()");
    expect(start, "wipeAppStorage must exist in src/lib/storageKeys.ts").toBeGreaterThan(0);
    const body = source.slice(start, source.indexOf("\n}\n", start));
    const resets = body.indexOf("RESET_FUNCTIONS");
    const localLoop = body.indexOf("localStorage.removeItem");
    const sessionLoop = body.indexOf("sessionStorage.removeItem");
    expect(resets, "the wipe must run the registry's resets").toBeGreaterThan(-1);
    expect(localLoop, "the wipe must remove localStorage keys").toBeGreaterThan(resets);
    expect(sessionLoop, "sessionStorage is cleaned after localStorage").toBeGreaterThan(localLoop);
  });

  test("the five modules read back exactly what a first-ever import would give", async () => {
    seedOldRecords();
    wipeAppStorage();
    // The fresh copies are imported AFTER the wipe on purpose: they read storage
    // as it stands now, which is what a reload would hand the app.
    const freshHabits = await import("../../src/lib/habits?after-the-wipe");
    const freshGratitude = await import("../../src/lib/gratitude?after-the-wipe");
    const freshCbt = await import("../../src/lib/cbt?after-the-wipe");
    const freshTrackers = await import("../../src/lib/customTrackers?after-the-wipe");
    const freshActivities = await import("../../src/lib/customActivities?after-the-wipe");
    expect(habits.getHabits()).toEqual(freshHabits.getHabits());
    expect(gratitude.getGratitudeEntries()).toEqual(freshGratitude.getGratitudeEntries());
    expect(cbt.getCbtRecords()).toEqual(freshCbt.getCbtRecords());
    expect(trackers.getCustomTrackers()).toEqual(freshTrackers.getCustomTrackers());
    expect(activities.getCustomActivities()).toEqual(freshActivities.getCustomActivities());
    // And not vacuously: the fresh state is the empty one, not the seeded one.
    expect(habits.getHabits()).toEqual(FRESH_HABITS);
    expect(gratitude.getGratitudeEntries()).toEqual([]);
    expect(cbt.getCbtRecords()).toEqual([]);
    expect(trackers.getCustomTrackers()).toEqual([]);
    expect(activities.getCustomActivities()).toEqual([]);
  });

  test("the records that are read from storage on every call are empty too", () => {
    seedOldRecords();
    // Before: they are whatever the blob says, because there is no copy to go
    // stale — the other half of the same story.
    expect(store.loadCustomEmotions()).toEqual(["Egyedi érzelem"]);
    expect(loadReminderMessage()).toBe(REMINDER_MESSAGES[1]!);
    expect(onboarding.needsOnboarding()).toBe(false);
    expect(assessmentStore.listAssessments()).toHaveLength(1);

    wipeAppStorage();

    expect(store.loadCustomEmotions()).toEqual([]);
    expect(loadReminderMessage()).toBe(REMINDER_MESSAGES[0]!);
    expect(onboarding.needsOnboarding()).toBe(true);
    expect(assessmentStore.listAssessments()).toEqual([]);
  });

  test("the wipe leaves no belso-iranytu key in either storage, and other apps' alone", () => {
    seedOldRecords();
    wipeAppStorage();
    const appKeys = (backing: Record<string, string>) =>
      Object.keys(backing).filter((k) => k.startsWith("belso-iranytu"));
    expect(appKeys(local)).toEqual([]);
    expect(appKeys(session)).toEqual([]);
    // The scope is the registry, not a blanket clear.
    expect(local["daily-goals"]).toBe("v1 maradék");
    expect(local["mas-app-kulcs"]).toBe("nem a miénk");
  });

  test("a subscriber is told during the wipe, and reads an empty store at that moment", () => {
    seedOldRecords();
    // The notification IS the re-render: a reader who stays on Settings sees the
    // fresh state only because these fire, and they fire while the keys are
    // still on the device — which is why the wipe resets before it removes.
    const seen = new Map<string, unknown>();
    const offs = [
      habits.subscribeHabits(() => seen.set("habits", habits.getHabits())),
      gratitude.subscribeGratitude(() => seen.set("gratitude", gratitude.getGratitudeEntries())),
      cbt.subscribeCbt(() => seen.set("cbt", cbt.getCbtRecords())),
      trackers.subscribeCustomTrackers(() => seen.set("trackers", trackers.getCustomTrackers())),
      activities.subscribeCustomActivities(() =>
        seen.set("activities", activities.getCustomActivities()),
      ),
    ];
    try {
      wipeAppStorage();
    } finally {
      for (const off of offs) off();
    }
    expect([...seen.keys()].sort()).toEqual(["activities", "cbt", "gratitude", "habits", "trackers"]);
    expect(seen.get("habits")).toEqual(FRESH_HABITS);
    expect(seen.get("gratitude")).toEqual([]);
    expect(seen.get("cbt")).toEqual([]);
    expect(seen.get("trackers")).toEqual([]);
    expect(seen.get("activities")).toEqual([]);
  });

  test("a storage that is gone is not an error, and the memory is cleared anyway", () => {
    seedOldRecords();
    const savedLocal = globals.localStorage;
    const savedSession = globals.sessionStorage;
    delete globals.localStorage;
    delete globals.sessionStorage;
    try {
      expect(() => wipeAppStorage()).not.toThrow();
    } finally {
      globals.localStorage = savedLocal;
      globals.sessionStorage = savedSession;
    }
    // The reset does not depend on the removal succeeding: a private-mode
    // session that cannot write storage still clears what it is showing.
    expect(habits.getHabits()).toEqual(FRESH_HABITS);
    expect(cbt.getCbtRecords()).toEqual([]);
  });

  test("the wipe can run twice, and the second run changes nothing", () => {
    seedOldRecords();
    wipeAppStorage();
    const after = [
      habits.getHabits(),
      gratitude.getGratitudeEntries(),
      cbt.getCbtRecords(),
      trackers.getCustomTrackers(),
      activities.getCustomActivities(),
    ];
    expect(() => wipeAppStorage()).not.toThrow();
    expect([
      habits.getHabits(),
      gratitude.getGratitudeEntries(),
      cbt.getCbtRecords(),
      trackers.getCustomTrackers(),
      activities.getCustomActivities(),
    ]).toEqual(after);
  });
});

/* ------------------- the chain's half, for completeness ---------------- */

describe("the records the delete-all chain resets are memory-safe too", () => {
  test("the collapse map's cache and the questionnaire log both come back empty", () => {
    // These two are the other half of the same bargain: their resets live in the
    // chain, which runs before the registry. Asserted here so the file states the
    // whole wipe rather than only its newest part — card state is the one with a
    // cache the key registry can never reach.
    seedOldRecords();
    cardStates.setCardCollapsed("settings-data", true);
    expect(cardStates.loadCardStates()).toEqual({ "settings-data": true });
    cardStates.resetCardStates();
    expect(local[CARD_STATES_KEY]).toBeUndefined();
    expect(cardStates.loadCardStates()).toEqual({});
    assessmentStore.clearAssessments();
    expect(local[ASSESSMENTS_KEY]).toBeUndefined();
    expect(assessmentStore.listAssessments()).toEqual([]);
  });
});
