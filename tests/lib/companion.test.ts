/**
 * Companion engine — Phase 1.
 *
 * The rules that matter are the forgiving ones: XP accumulates, levels are
 * derived, a gap resets the streak but never the companion, and a corrupt blob
 * is repaired rather than allowed to reach a render.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import {
  COMPANION_STORAGE_KEY,
  DEFAULT_COMPANION,
  companionPresence,
  levelProgress,
  loadCompanion,
  recordCompanionActivity,
  resetCompanion,
  subscribeCompanion,
  updateCompanionPreferences,
  xpToNextLevel,
} from "../../src/lib/companion";

const backing: Record<string, string> = {};

beforeEach(() => {
  for (const key of Object.keys(backing)) delete backing[key];
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (key: string) => (key in backing ? backing[key]! : null),
    setItem: (key: string, value: string) => {
      backing[key] = value;
    },
    removeItem: (key: string) => {
      delete backing[key];
    },
  };
});

describe("companion state", () => {
  test("a fresh install has a level-1 companion and no streak", () => {
    expect(loadCompanion()).toEqual(DEFAULT_COMPANION);
    expect(loadCompanion().level).toBe(1);
    expect(loadCompanion().lastActiveDate).toBe("");
  });

  test("an activity awards XP and stores only in the companion key", () => {
    const state = recordCompanionActivity("journal", "2026-10-01");
    expect(state.xp).toBe(20);
    expect(state.level).toBe(1);
    expect(state.streak).toBe(1);
    expect(state.lastActiveDate).toBe("2026-10-01");
    expect(Object.keys(backing)).toEqual([COMPANION_STORAGE_KEY]);
  });

  test("levels are derived from XP, and roll over at 100", () => {
    for (let i = 0; i < 5; i += 1) recordCompanionActivity("journal", "2026-10-01");
    const state = loadCompanion();
    expect(state.xp).toBe(100);
    expect(state.level).toBe(2);
    expect(levelProgress(100)).toBe(0);
    expect(xpToNextLevel(100)).toBe(100);
    expect(levelProgress(120)).toBe(20);
  });

  test("the same day earns XP again but does not inflate the streak", () => {
    recordCompanionActivity("breathing", "2026-10-01");
    const state = recordCompanionActivity("meditation", "2026-10-01");
    expect(state.streak).toBe(1);
    expect(state.xp).toBe(35);
  });

  test("consecutive days grow the streak", () => {
    recordCompanionActivity("journal", "2026-10-01");
    recordCompanionActivity("journal", "2026-10-02");
    const state = recordCompanionActivity("journal", "2026-10-03");
    expect(state.streak).toBe(3);
  });

  test("a missed day resets the streak, not the companion", () => {
    recordCompanionActivity("journal", "2026-10-01");
    recordCompanionActivity("journal", "2026-10-02");
    const state = recordCompanionActivity("journal", "2026-10-06");
    expect(state.streak).toBe(1);
    expect(state.xp).toBe(60);
    expect(state.level).toBe(1);
  });
});

describe("presence is forgiving", () => {
  test("today and yesterday are bright; older is only dimmed", () => {
    recordCompanionActivity("journal", "2026-10-01");
    const state = loadCompanion();
    expect(companionPresence(state, "2026-10-01")).toBe("bright");
    expect(companionPresence(state, "2026-10-02")).toBe("bright");
    expect(companionPresence(state, "2026-10-04")).toBe("dimmed");
    // Dwelling on the gap never removes the state.
    expect(loadCompanion().xp).toBe(20);
  });

  test("a never-used companion is new rather than dimmed", () => {
    expect(companionPresence(loadCompanion(), "2026-10-01")).toBe("new");
  });
});

describe("preferences and repair", () => {
  test("type and colour change without touching XP or streak", () => {
    recordCompanionActivity("journal", "2026-10-01");
    const before = loadCompanion();
    const after = updateCompanionPreferences({ type: "plant", color: "sage" });
    expect(after.type).toBe("plant");
    expect(after.color).toBe("sage");
    expect(after.xp).toBe(before.xp);
    expect(after.streak).toBe(before.streak);
  });

  test("a corrupt blob is repaired, not rendered", () => {
    backing[COMPANION_STORAGE_KEY] = JSON.stringify({
      type: "dragon",
      xp: "lots",
      streak: -4,
      lastActiveDate: "yesterday",
      color: "rainbow",
    });
    const state = loadCompanion();
    expect(state.type).toBe(DEFAULT_COMPANION.type);
    expect(state.xp).toBe(0);
    expect(state.streak).toBe(0);
    expect(state.lastActiveDate).toBe("");
    expect(state.color).toBe(DEFAULT_COMPANION.color);
  });

  test("a stored level cannot disagree with the XP", () => {
    backing[COMPANION_STORAGE_KEY] = JSON.stringify({
      ...DEFAULT_COMPANION,
      level: 99,
      xp: 20,
    });
    expect(loadCompanion().level).toBe(1);
  });

  test("reset removes the key and notifies subscribers", () => {
    recordCompanionActivity("journal", "2026-10-01");
    let seen = 0;
    const unsubscribe = subscribeCompanion(() => {
      seen += 1;
    });
    resetCompanion();
    unsubscribe();
    expect(seen).toBe(1);
    expect(backing[COMPANION_STORAGE_KEY]).toBeUndefined();
    expect(loadCompanion()).toEqual(DEFAULT_COMPANION);
  });
});
