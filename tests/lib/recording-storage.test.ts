/**
 * Batch A — the store's own handling of the new fields, tested at the
 * storage boundary: what a corrupt blob, a hand-edited export or a bad
 * import can do to an entry, and why it cannot reach the UI.
 *
 * TWO layers act on a loaded entry, in order: the mood-v2 migration (which
 * re-derives coordinates for pre-Batch-A rows and refuses half pairs), then
 * normalizeEntry's clamping (which folds any surviving number into 1–10).
 * Each test below states which layer it exercises.
 *
 * This lives in its own file for the same reason batch7-store does: the
 * store reads localStorage once at module-evaluation time, so every scenario
 * evaluates a FRESH, cache-busted copy against exactly the blob it seeds.
 */
import { describe, expect, test } from "bun:test";
import type { Entry } from "../../src/types";
import { QUADRANTS, quadrantFromCoords } from "../../src/lib/quadrant";

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

function seedEntries(entries: unknown[]) {
  for (const k of Object.keys(backing)) delete backing[k];
  backing["belso-iranytu-data-v2"] = JSON.stringify({
    version: 2,
    entries,
    goals: [],
    dailyQuestion: null,
    medications: [],
    medicationChecks: {},
    profile: { name: "Teszt", goal: "" },
    settings: { textSize: "normal", theme: "light" },
  });
}

async function loadStore() {
  return import(`../../src/lib/store?storage=${Math.random()}`);
}

function baseEntry(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "e1",
    date: "2026-09-30",
    mood: 3,
    stress: 5,
    energy: 5,
    note: "",
    tags: [],
    emotions: [],
    activities: [],
    reflection: { feeling: "", stressReason: "", need: "" },
    vitals: { restingHr: null, hrv: null, sleepHours: null },
    source: "manual",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("storage — migration layer: legacy and corrupt rows", () => {
  test("a pre-Batch-A entry gains coordinates from its level (migration is mandatory)", async () => {
    seedEntries([baseEntry({})]);
    const { getState } = await loadStore();
    const entry = getState().entries[0] as Entry;
    expect(entry.moodEnergy).toBe(5);
    expect(entry.pleasantness).toBe(5);
    expect(entry.quadrant).toBe("high-pos");
    expect(entry.mood).toBe(3); // the level stays beside its coordinates
  });

  test("a corrupt coordinate is discarded and re-derived from the level, not kept", async () => {
    seedEntries([baseEntry({ moodEnergy: "nan" })]);
    const { getState } = await loadStore();
    const entry = getState().entries[0] as Entry;
    // Level 3 → (5,5): the migration replaces junk with its derivation.
    expect(entry.moodEnergy).toBe(5);
    expect(entry.pleasantness).toBe(5);
  });

  test("a stray coordinate on a non-level row is clamped, never guessed into a pair", async () => {
    // mood 7 is not a level, so the migration cannot re-derive; the single
    // number survives as itself and the missing half stays absent.
    seedEntries([baseEntry({ mood: 7 as unknown as 3, moodEnergy: 7 })]);
    const { getState } = await loadStore();
    const entry = getState().entries[0] as Entry;
    expect(entry.moodEnergy).toBe(7);
    expect(entry.pleasantness).toBeUndefined();
  });
});

describe("storage — clamp layer: entries the migration skips", () => {
  test("off-grid coordinates are clamped into 1–10 on load", async () => {
    seedEntries([baseEntry({ moodEnergy: 42, pleasantness: -3, mood: 9 as unknown as 3 })]);
    const { getState } = await loadStore();
    const entry = getState().entries[0] as Entry;
    expect(entry.moodEnergy).toBe(10);
    expect(entry.pleasantness).toBe(1);
  });

  test("emotion intensity is clamped like every other 1–10 field", async () => {
    seedEntries([baseEntry({ emotion: "Boldog", emotionIntensity: 99 })]);
    const { getState } = await loadStore();
    expect((getState().entries[0] as Entry).emotionIntensity).toBe(10);
  });

  test("the grid's own edges are the only unclamped values", async () => {
    seedEntries([
      baseEntry({ mood: 9 as unknown as 3, moodEnergy: 1, pleasantness: 1 }),
      baseEntry({ id: "e2", date: "2026-09-29", mood: 9 as unknown as 3, moodEnergy: 10, pleasantness: 10 }),
    ]);
    const { getState } = await loadStore();
    const [a, b] = getState().entries as Entry[];
    expect(a.moodEnergy).toBe(1);
    expect(a.pleasantness).toBe(1);
    expect(b.moodEnergy).toBe(10);
    expect(b.pleasantness).toBe(10);
  });

  test("a fractional coordinate is rounded to the grid, not dropped", async () => {
    seedEntries([baseEntry({ mood: 9 as unknown as 3, moodEnergy: 7.4, pleasantness: 2.6 })]);
    const { getState } = await loadStore();
    const entry = getState().entries[0] as Entry;
    expect(entry.moodEnergy).toBe(7);
    expect(entry.pleasantness).toBe(3);
  });

  test("clamping lands the point in a coherent quadrant — the geometry is truth", async () => {
    seedEntries([baseEntry({ moodEnergy: 42, pleasantness: -3, quadrant: "low-pos", mood: 9 as unknown as 3 })]);
    const { getState } = await loadStore();
    const entry = getState().entries[0] as Entry;
    const derived = quadrantFromCoords(entry.moodEnergy!, entry.pleasantness!);
    expect(QUADRANTS).toContain(derived);
    expect(derived).toBe("high-neg");
    expect(derived).not.toBe(entry.quadrant);
  });
});

describe("storage — passthrough of well-formed data", () => {
  test("a quadrant-era entry round-trips every new field", async () => {
    seedEntries([
      baseEntry({
        moodEnergy: 8,
        pleasantness: 7,
        quadrant: "high-pos",
        emotion: "Izgatott",
        emotionIntensity: 6,
        context: { withWhom: ["Barátok"], where: [], doing: ["Sport"] },
      }),
    ]);
    const { getState } = await loadStore();
    const entry = getState().entries[0] as Entry;
    expect(entry.moodEnergy).toBe(8);
    expect(entry.pleasantness).toBe(7);
    expect(entry.quadrant).toBe("high-pos");
    expect(entry.emotion).toBe("Izgatott");
    expect(entry.emotionIntensity).toBe(6);
    expect(entry.context?.withWhom).toEqual(["Barátok"]);
    expect(entry.context?.doing).toEqual(["Sport"]);
  });
});
