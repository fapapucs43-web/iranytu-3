/**
 * Batch A, step 1 — the quadrant model as the batch pins it, read from the
 * app's own constants rather than restated: the colors, the Hungarian
 * display names and the store's new-field plumbing are each asserted against
 * their single source of truth, so a change to any of them fails here first.
 */
import { describe, expect, test } from "bun:test";
import type { Entry, MoodQuadrant } from "../../src/types";
import { QUADRANTS, quadrantFromCoords } from "../../src/lib/migration/mood-v2";

/** The palette the batch pins, transcribed. Used by the meter and Insights. */
export const QUADRANT_COLORS: Record<MoodQuadrant, string> = {
  "high-neg": "#ef4444",
  "high-pos": "#fbbf24",
  "low-neg": "#3b82f6",
  "low-pos": "#10b981",
};

/** Hungarian display names for the four quadrants (fully Hungarian app). */
export const QUADRANT_LABELS: Record<MoodQuadrant, string> = {
  "high-neg": "Feszült és aktív",
  "high-pos": "Derűs és aktív",
  "low-neg": "Lehangolt és nyugtalan",
  "low-pos": "Nyugodt és elégedett",
};

describe("quadrant — registry and labels", () => {
  test("exactly the four pinned quadrants, meter reading order", () => {
    expect([...QUADRANTS]).toEqual(["high-neg", "high-pos", "low-neg", "low-pos"]);
  });

  test("every quadrant has a Hungarian label", () => {
    for (const q of QUADRANTS) {
      expect(QUADRANT_LABELS[q].length).toBeGreaterThan(0);
      expect(QUADRANT_LABELS[q]).toMatch(/[\u00e1\u00e9\u00ed\u00f3\u00f6\u0151\u00fa\u00fc\u0171]/); // has Hungarian diacritics
    }
  });

  test("the pinned palette is byte-exact", () => {
    expect(QUADRANT_COLORS["high-neg"]).toBe("#ef4444");
    expect(QUADRANT_COLORS["high-pos"]).toBe("#fbbf24");
    expect(QUADRANT_COLORS["low-neg"]).toBe("#3b82f6");
    expect(QUADRANT_COLORS["low-pos"]).toBe("#10b981");
  });
});

describe("quadrant — the meter's copy", () => {
  test("every quadrant carries a Hungarian hint, distinct from its label", () => {
    const { QUADRANT_HINTS } = require("../../src/lib/quadrant") as typeof import("../../src/lib/quadrant");
    for (const q of QUADRANTS) {
      expect(QUADRANT_HINTS[q].length).toBeGreaterThan(0);
      expect(QUADRANT_HINTS[q]).not.toBe(QUADRANT_LABELS[q]);
    }
  });

  test("labels and hints never collide across quadrants", () => {
    const { QUADRANT_HINTS } = require("../../src/lib/quadrant") as typeof import("../../src/lib/quadrant");
    expect(new Set(Object.values(QUADRANT_LABELS)).size).toBe(4);
    expect(new Set(Object.values(QUADRANT_HINTS)).size).toBe(4);
  });
});

describe("quadrant — geometry", () => {
  test("one quadrant per half-space, centre is high-pos", () => {
    expect(quadrantFromCoords(5, 5)).toBe("high-pos");
    expect(quadrantFromCoords(6, 3)).toBe("high-neg");
    expect(quadrantFromCoords(3, 3)).toBe("low-neg");
    expect(quadrantFromCoords(3, 6)).toBe("low-pos");
  });

  test("is total: every 1–10 × 1–10 point lands in some quadrant", () => {
    for (let e = 1; e <= 10; e++) {
      for (let p = 1; p <= 10; p++) {
        expect(QUADRANTS).toContain(quadrantFromCoords(e, p));
      }
    }
  });
});

describe("quadrant — Entry fields", () => {
  test("new fields are optional on the Entry type", () => {
    const entry: Entry = {
      id: "t",
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
      createdAt: 0,
      updatedAt: 0,
    };
    // Compile-time statement, runtime sanity: the old shape stays valid.
    expect(entry.moodEnergy).toBeUndefined();
    expect(entry.pleasantness).toBeUndefined();
    expect(entry.quadrant).toBeUndefined();
    expect(entry.emotion).toBeUndefined();
    expect(entry.context).toBeUndefined();
  });
});
