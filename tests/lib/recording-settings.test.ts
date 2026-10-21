/**
 * Batch A — settings normalization and migration invariants.
 *
 * The first half tests the recorder switch at the storage boundary (fresh,
 * cache-busted store per scenario, as in batch7-store). The second half
 * pins the INVARIANT that ties the migration table to the quadrant
 * geometry: the level table's coordinates must land in the quadrants a
 * Hungarian speaker would name for that level — the table and the
 * boundary rule are two expressions of one design, and this is the file
 * that notices if they drift apart.
 */
import { describe, expect, test } from "bun:test";
import { QUADRANTS, quadrantFromCoords } from "../../src/lib/quadrant";
import {
  MOOD_LEVEL_COORDINATES,
  migrateMoodData,
} from "../../src/lib/migration/mood-v2";

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

async function loadStoreWithSettings(settings: Record<string, unknown>) {
  for (const k of Object.keys(backing)) delete backing[k];
  backing["belso-iranytu-data-v2"] = JSON.stringify({
    version: 2,
    entries: [],
    goals: [],
    dailyQuestion: null,
    medications: [],
    medicationChecks: {},
    profile: { name: "Teszt", goal: "" },
    settings,
  });
  return import(`../../src/lib/store?settings=${Math.random()}`);
}

describe("settings — the moodFlow recorder switch", () => {
  test("absence is the new-flow default and stays absent", async () => {
    const { getState } = await loadStoreWithSettings({ textSize: "normal", theme: "light" });
    const s = getState().settings;
    expect(s.moodFlow).toBeUndefined();
    expect("moodFlow" in s).toBe(false);
  });

  test("an explicit old choice survives the round trip", async () => {
    const { getState, setSettings } = await loadStoreWithSettings({ theme: "light" });
    setSettings({ ...getState().settings, moodFlow: "old" });
    expect(getState().settings.moodFlow).toBe("old");
    expect(backing["belso-iranytu-data-v2"]).toContain('"moodFlow":"old"');
  });

  test("junk values are repaired to the default, not passed through", async () => {
    const { getState } = await loadStoreWithSettings({ moodFlow: "medium", theme: "light" });
    expect(getState().settings.moodFlow).toBeUndefined();
    const { getState: again } = await loadStoreWithSettings({ moodFlow: 7 });
    expect(again().settings.moodFlow).toBeUndefined();
  });

  test("the explicit new value is a legal stored choice", async () => {
    const { getState } = await loadStoreWithSettings({ moodFlow: "new", theme: "light" });
    expect(getState().settings.moodFlow).toBe("new");
  });
});

describe("migration invariants — table and geometry agree", () => {
  test("every level's coordinates land inside the quadrant the level means", () => {
    // Level 1 (Nagyon rossz) is low energy + unpleasant; level 5 the
    // opposite. The table must not file any level against its name.
    const expectedQuadrant = {
      1: "low-neg",
      2: "low-neg",
      3: "high-pos",
      4: "high-pos",
      5: "high-pos",
    } as const;
    for (const level of [1, 2, 3, 4, 5] as const) {
      const { moodEnergy, pleasantness } = MOOD_LEVEL_COORDINATES[level];
      expect(quadrantFromCoords(moodEnergy, pleasantness)).toBe(expectedQuadrant[level]);
    }
  });

  test("the table's intensity rises monotonically with the level", () => {
    let prevEnergy = 0;
    let prevPleasantness = 0;
    for (const level of [1, 2, 3, 4, 5] as const) {
      const { moodEnergy, pleasantness } = MOOD_LEVEL_COORDINATES[level];
      expect(moodEnergy).toBeGreaterThan(prevEnergy);
      expect(pleasantness).toBeGreaterThan(prevPleasantness);
      prevEnergy = moodEnergy;
      prevPleasantness = pleasantness;
    }
  });

  test("the migration never places a point outside the 1–10 grid", () => {
    const entries = [1, 2, 3, 4, 5].map((mood) => ({
      id: `e${mood}`,
      date: `2026-09-0${mood}`,
      mood: mood as 1 | 2 | 3 | 4 | 5,
      stress: 5,
      energy: 5,
      note: "",
      tags: [],
      emotions: [],
      activities: [],
      reflection: { feeling: "", stressReason: "", need: "" },
      vitals: { restingHr: null, hrv: null, sleepHours: null },
      source: "manual" as const,
      createdAt: 1,
      updatedAt: 1,
    }));
    const { entries: migrated } = migrateMoodData(entries as never);
    for (const e of migrated) {
      expect(e.moodEnergy).toBeGreaterThanOrEqual(1);
      expect(e.moodEnergy).toBeLessThanOrEqual(10);
      expect(e.pleasantness).toBeGreaterThanOrEqual(1);
      expect(e.pleasantness).toBeLessThanOrEqual(10);
      expect(QUADRANTS).toContain(e.quadrant);
    }
  });
});
