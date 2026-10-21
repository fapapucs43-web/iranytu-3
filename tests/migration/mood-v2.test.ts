/**
 * Batch A, step 1 — the mood-v2 migration, tested as the batch pins it.
 *
 * The migration is the one piece of Batch A that touches EXISTING user data,
 * so it gets the strictest tests: the exact table (byte-checked against the
 * batch spec), idempotence, defensive behaviour on garbage, and the runner's
 * write-at-most-once contract.
 */
import { describe, expect, test } from "bun:test";
import type { Entry, MoodLevel } from "../../src/types";
import {
  MOOD_LEVEL_COORDINATES,
  QUADRANTS,
  coordinatesForMoodLevel,
  isQuadrant,
  migrateMoodData,
  quadrantFromCoords,
  runMoodV2Migration,
} from "../../src/lib/migration/mood-v2";

/** A minimal legacy entry: only the fields the migration must not disturb. */
function legacyEntry(overrides: Partial<Entry> & { mood?: MoodLevel }): Entry {
  return {
    id: "e1",
    date: "2026-09-01",
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

describe("mood-v2 — the level → coordinates table", () => {
  // The batch pins this table verbatim. These expectations are the spec,
  // transcribed: if a future edit "fixes" a value, this test fails first.
  test("maps every level to exactly the pinned coordinates", () => {
    expect(MOOD_LEVEL_COORDINATES[1]).toEqual({ moodEnergy: 3, pleasantness: 1 });
    expect(MOOD_LEVEL_COORDINATES[2]).toEqual({ moodEnergy: 4, pleasantness: 3 });
    expect(MOOD_LEVEL_COORDINATES[3]).toEqual({ moodEnergy: 5, pleasantness: 5 });
    expect(MOOD_LEVEL_COORDINATES[4]).toEqual({ moodEnergy: 6, pleasantness: 7 });
    expect(MOOD_LEVEL_COORDINATES[5]).toEqual({ moodEnergy: 8, pleasantness: 9 });
  });

  test("the table covers exactly levels 1–5", () => {
    expect(Object.keys(MOOD_LEVEL_COORDINATES).sort()).toEqual(["1", "2", "3", "4", "5"]);
  });

  test("coordinatesForMoodLevel mirrors the table", () => {
    for (const level of [1, 2, 3, 4, 5] as MoodLevel[]) {
      expect(coordinatesForMoodLevel(level)).toEqual(MOOD_LEVEL_COORDINATES[level]);
    }
  });

  test("a level that is not 1–5 is not guessed", () => {
    expect(coordinatesForMoodLevel(0)).toBeNull();
    expect(coordinatesForMoodLevel(6)).toBeNull();
    expect(coordinatesForMoodLevel(2.5)).toBeNull();
    expect(coordinatesForMoodLevel("3")).toBeNull();
    expect(coordinatesForMoodLevel(null)).toBeNull();
    expect(coordinatesForMoodLevel(undefined)).toBeNull();
    expect(coordinatesForMoodLevel(NaN)).toBeNull();
    expect(coordinatesForMoodLevel(true)).toBeNull();
    expect(coordinatesForMoodLevel({})).toBeNull();
    expect(coordinatesForMoodLevel([3])).toBeNull();
  });
});

describe("mood-v2 — quadrantFromCoords", () => {
  // The boundary rule is inclusive-on-high for both axes; the centre point
  // (5,5) is high-pos, because a neutral day must not file as negative.
  test("matches the batch-pinned rule on every half-space corner", () => {
    expect(quadrantFromCoords(7, 2)).toBe("high-neg");
    expect(quadrantFromCoords(7, 7)).toBe("high-pos");
    expect(quadrantFromCoords(2, 2)).toBe("low-neg");
    expect(quadrantFromCoords(2, 7)).toBe("low-pos");
  });

  test("the centre and the axis thresholds follow the >= 5 rule", () => {
    expect(quadrantFromCoords(5, 5)).toBe("high-pos");
    expect(quadrantFromCoords(5, 4)).toBe("high-neg");
    expect(quadrantFromCoords(5, 6)).toBe("high-pos");
    expect(quadrantFromCoords(4, 4)).toBe("low-neg");
    expect(quadrantFromCoords(4, 5)).toBe("low-pos");
    expect(quadrantFromCoords(10, 10)).toBe("high-pos");
    expect(quadrantFromCoords(1, 1)).toBe("low-neg");
    expect(quadrantFromCoords(10, 1)).toBe("high-neg");
    expect(quadrantFromCoords(1, 10)).toBe("low-pos");
  });
});

describe("mood-v2 — migrateMoodData", () => {
  test("adds coordinates and quadrant to a legacy entry, keeps everything else", () => {
    const before = legacyEntry({ mood: 5 });
    const { entries, changed } = migrateMoodData([before]);
    expect(changed).toBe(1);
    expect(entries[0]).toEqual({
      ...before,
      moodEnergy: 8,
      pleasantness: 9,
      quadrant: "high-pos",
    });
  });

  test("preserves the daily-energy slider (no collision with moodEnergy)", () => {
    const before = legacyEntry({ mood: 1, energy: 9 });
    const { entries } = migrateMoodData([before]);
    expect(entries[0]!.energy).toBe(9);
    expect(entries[0]!.moodEnergy).toBe(3);
  });

  test("is idempotent: entries with both coordinates are skipped", () => {
    const already = legacyEntry({ mood: 2, moodEnergy: 4, pleasantness: 3, quadrant: "high-neg" });
    const { entries, changed } = migrateMoodData([already]);
    expect(changed).toBe(0);
    expect(entries[0]).toBe(already);
  });

  test("a single coordinate alone does NOT count as migrated", () => {
    const half = legacyEntry({ mood: 4, pleasantness: 7 });
    const { entries, changed } = migrateMoodData([half]);
    expect(changed).toBe(1);
    expect(entries[0]!.moodEnergy).toBe(6);
  });

  test("corrupt rows are skipped in place, valid rows still migrate", () => {
    const garbageA = null;
    const garbageB = "not an entry";
    const good = legacyEntry({ mood: 3 });
    const { entries, changed } = migrateMoodData([garbageA, garbageB, good] as unknown as Entry[]);
    expect(changed).toBe(1);
    expect(entries[0]).toBeNull();
    expect(entries[1]).toBe("not an entry");
    expect(entries[2]!.moodEnergy).toBe(5);
  });

  test("a level the table does not know is left untouched", () => {
    const weird = legacyEntry({ mood: 7 as unknown as MoodLevel });
    const { entries, changed } = migrateMoodData([weird]);
    expect(changed).toBe(0);
    expect(entries[0]).toBe(weird);
  });

  test("returns the same array when nothing changed", () => {
    const entries = [legacyEntry({ mood: 2, moodEnergy: 4, pleasantness: 3 })];
    expect(migrateMoodData(entries).entries).toBe(entries);
  });

  test("a non-array input passes through unchanged", () => {
    const notArray = "nope" as unknown as Entry[];
    expect(migrateMoodData(notArray)).toEqual({ entries: notArray, changed: 0 });
  });
});

describe("mood-v2 — the runner is defensive", () => {
  test("writes at most once, only when something changed", () => {
    let writes = 0;
    const entries = [legacyEntry({ mood: 1 }), legacyEntry({ mood: 5 })];
    runMoodV2Migration(entries, () => {
      writes += 1;
    });
    expect(writes).toBe(1);
  });

  test("a no-op migration never writes", () => {
    let writes = 0;
    runMoodV2Migration([legacyEntry({ mood: 2, moodEnergy: 4, pleasantness: 3 })], () => {
      writes += 1;
    });
    expect(writes).toBe(0);
  });

  test("an error inside migrate is logged and swallowed, data untouched", () => {
    const warnings: unknown[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args);
    };
    try {
      // A REAL array (so the Array.isArray guard lets it through) whose map
      // explodes — the path the catch exists for.
      const exploding: Entry[] = [];
      (exploding as { map: unknown }).map = () => {
        throw new Error("boom");
      };
      runMoodV2Migration(exploding, () => {
        throw new Error("should not be reached");
      });
    } finally {
      console.warn = originalWarn;
    }
    expect(warnings.length).toBe(1);
    expect(String(warnings[0])).toContain("mood-v2");
  });

  test("an error inside the write callback is also swallowed", () => {
    expect(() =>
      runMoodV2Migration([legacyEntry({ mood: 4 })], () => {
        throw new Error("storage full");
      }),
    ).not.toThrow();
  });
});

describe("mood-v2 — quadrant registry", () => {
  test("exposes exactly the four pinned quadrant ids", () => {
    expect([...QUADRANTS]).toEqual(["high-neg", "high-pos", "low-neg", "low-pos"]);
  });

  test("isQuadrant accepts only the four ids", () => {
    for (const q of QUADRANTS) expect(isQuadrant(q)).toBe(true);
    expect(isQuadrant("high")).toBe(false);
    expect(isQuadrant("HIGH-NEG")).toBe(false);
    expect(isQuadrant("")).toBe(false);
    expect(isQuadrant(5)).toBe(false);
    expect(isQuadrant(null)).toBe(false);
  });
});
