/**
 * Batch 13, commit 9 — the three deferred badges, and the flags they need.
 *
 * These three are the reason commit 8 existed, and they are also the three
 * that commit 8 could NOT have handled alone. The finding this file records:
 *
 *   - `entry.source` is `"import"` for a health import, a CSV import AND the
 *     v1 migration, so counting that field would award the badge to anyone who
 *     ever imported a spreadsheet;
 *   - a food-AI analysis writes tracker values indistinguishable from any
 *     other tracker entry;
 *   - a PDF export writes a file and nothing else.
 *
 * So they are EVENTS and have to be remembered. `tests/lib/feature-use.test.ts`
 * already pins that the sidecar treats them as ordinary counts; what is checked
 * here is that the store behind those counts behaves, and that the badge fires
 * on one flag and not on zero.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  EVENT_FEATURE_KEYS,
  EVENT_FLAGS_KEY,
  eventFeatureCounts,
  markEventFeature,
  resetEventFeatures,
  seenEventFeatures,
  subscribeEventFeatures,
} from "../../src/lib/featureFlags";
import { BADGES, earnedBadgeIds } from "../../src/lib/achievements";
import { FEATURE_KEYS, buildFeatureUse } from "../../src/lib/featureUse";
import { GLYPHS } from "../../src/lib/iconsets";

const backing: Record<string, string> = {};
const original = (globalThis as { localStorage?: unknown }).localStorage;

beforeEach(() => {
  for (const k of Object.keys(backing)) delete backing[k];
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => (k in backing ? backing[k] : null),
    setItem: (k: string, v: string) => {
      backing[k] = v;
    },
    removeItem: (k: string) => {
      delete backing[k];
    },
  };
  resetEventFeatures();
});

afterEach(() => {
  (globalThis as unknown as { localStorage: unknown }).localStorage = original;
  resetEventFeatures();
});

describe("the flag store", () => {
  test("it has its own key and starts empty", () => {
    expect(EVENT_FLAGS_KEY).toBe("belso-iranytu-feature-flags-v1");
    expect([...seenEventFeatures()]).toEqual([]);
  });

  test("the key list is closed and unique", () => {
    expect(new Set(EVENT_FEATURE_KEYS).size).toBe(EVENT_FEATURE_KEYS.length);
    expect([...EVENT_FEATURE_KEYS]).toEqual(["healthImport", "foodAi", "pdfExport"]);
  });

  test("marking is idempotent and does not grow the record", () => {
    markEventFeature("pdfExport");
    const afterFirst = backing[EVENT_FLAGS_KEY];
    markEventFeature("pdfExport");
    markEventFeature("pdfExport");
    expect(backing[EVENT_FLAGS_KEY]).toBe(afterFirst);
    expect(seenEventFeatures().size).toBe(1);
  });

  test("three marks are three flags and no more", () => {
    for (const k of EVENT_FEATURE_KEYS) markEventFeature(k);
    expect(seenEventFeatures().size).toBe(3);
  });

  test("an unknown name is refused rather than stored", () => {
    // A typo must not become a permanent flag nothing ever reads.
    markEventFeature("halthImport" as never);
    expect(seenEventFeatures().size).toBe(0);
    expect(backing[EVENT_FLAGS_KEY]).toBeUndefined();
  });

  test("corrupt JSON reads as none-seen instead of taking the shelf down", () => {
    backing[EVENT_FLAGS_KEY] = "{not json";
    expect([...seenEventFeatures()]).toEqual([]);
    backing[EVENT_FLAGS_KEY] = '{"not":"an array"}';
    expect([...seenEventFeatures()]).toEqual([]);
  });

  test("an unknown name already in storage is dropped on read", () => {
    backing[EVENT_FLAGS_KEY] = JSON.stringify(["foodAi", "somethingElse", 42]);
    expect([...seenEventFeatures()]).toEqual(["foodAi"]);
  });

  test("a storage write that throws does not propagate", () => {
    // The flag is marked on the export button. Throwing there would break the
    // export the reader actually came for.
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("full");
      },
      removeItem: () => {},
    };
    expect(() => markEventFeature("pdfExport")).not.toThrow();
    expect(seenEventFeatures().size).toBe(0);
  });

  test("subscribe fires on a real change and stops after unsubscribe", () => {
    let calls = 0;
    const off = subscribeEventFeatures(() => {
      calls += 1;
    });
    markEventFeature("foodAi");
    expect(calls).toBe(1);
    off();
    markEventFeature("pdfExport");
    expect(calls).toBe(1);
  });

  test("a redundant mark does not wake subscribers", () => {
    markEventFeature("foodAi");
    let calls = 0;
    const off = subscribeEventFeatures(() => {
      calls += 1;
    });
    markEventFeature("foodAi");
    expect(calls).toBe(0);
    off();
  });
});

describe("the two halves meet in one place", () => {
  test("counts are 0/1 per event and match the flags exactly", () => {
    expect(eventFeatureCounts()).toEqual({ healthImport: 0, foodAi: 0, pdfExport: 0 });
    markEventFeature("foodAi");
    expect(eventFeatureCounts()).toEqual({ healthImport: 0, foodAi: 1, pdfExport: 0 });
  });

  test("the sidecar accepts the counts as ordinary keys", () => {
    markEventFeature("healthImport");
    const use = buildFeatureUse(eventFeatureCounts());
    expect(use.healthImport).toBe(1);
    expect(use.foodAi).toBe(0);
    // The union grew; a key nobody zeroes would break the totality contract.
    for (const key of FEATURE_KEYS) expect(typeof use[key], key).toBe("number");
  });

  test("every event feature has a sidecar key, by construction", () => {
    for (const key of EVENT_FEATURE_KEYS) {
      expect(FEATURE_KEYS.includes(key), key).toBe(true);
    }
  });
});

describe("the three deferred badges", () => {
  test("there are twenty-seven now, and these are the last three", () => {
    expect(BADGES.length).toBe(27);
    expect(BADGES.slice(24).map((b) => b.id)).toEqual([
      "first-health-import",
      "first-food-ai",
      "first-pdf-export",
    ]);
  });

  test("every one of their icons is a glyph the app already ships", () => {
    // 🖨 (printer) is NOT in GLYPHS; ⬇️ is, and it also reads better for
    // "exported". The glyph set stays closed at 43 - commit 9 added badges,
    // not pictures.
    const shipped = new Set(GLYPHS.map((g) => g.glyph));
    for (const id of ["first-health-import", "first-food-ai", "first-pdf-export"]) {
      const badge = BADGES.find((b) => b.id === id)!;
      expect(shipped.has(badge.icon), `${id} ${badge.icon}`).toBe(true);
    }
  });

  test("the glyph set did not grow", () => {
    expect(GLYPHS.length).toBe(43);
  });

  test("each fires on its flag and not on zero", () => {
    for (const [key, id] of [
      ["healthImport", "first-health-import"],
      ["foodAi", "first-food-ai"],
      ["pdfExport", "first-pdf-export"],
    ] as const) {
      expect(earnedBadgeIds({ entries: [], maxHabitStreak: 0, featureUse: buildFeatureUse({}) }).has(id), id).toBe(false);
      markEventFeature(key);
      const got = earnedBadgeIds({
        entries: [],
        maxHabitStreak: 0,
        featureUse: buildFeatureUse(eventFeatureCounts()),
      });
      expect(got.has(id), id).toBe(true);
      resetEventFeatures();
    }
  });

  test("the badges are independent — one flag earns exactly one badge", () => {
    markEventFeature("pdfExport");
    const got = earnedBadgeIds({
      entries: [],
      maxHabitStreak: 0,
      featureUse: buildFeatureUse(eventFeatureCounts()),
    });
    expect([...got]).toEqual(["first-pdf-export"]);
  });

  test("clearing the flags takes the badges away again", () => {
    markEventFeature("healthImport");
    resetEventFeatures();
    const got = earnedBadgeIds({
      entries: [],
      maxHabitStreak: 0,
      featureUse: buildFeatureUse(eventFeatureCounts()),
    });
    expect(got.has("first-health-import")).toBe(false);
  });

  test("a CSV import does NOT earn the health-import badge", () => {
    // The whole reason these are flags. An entry with source "import" says
    // nothing about where it came from, so the badge must not be derivable
    // from entries at all.
    const fromCsv = {
      id: "e",
      date: "2026-10-02",
      mood: 3 as const,
      stress: 5,
      energy: 5,
      note: "",
      tags: [],
      emotions: [],
      activities: [],
      reflection: { feeling: "", stressReason: "", need: "" },
      vitals: { restingHr: null, hrv: null, sleepHours: null },
      source: "import" as const,
      createdAt: 0,
      updatedAt: 0,
    };
    const got = earnedBadgeIds({
      entries: [fromCsv],
      maxHabitStreak: 0,
      featureUse: buildFeatureUse(eventFeatureCounts()),
    });
    expect(got.has("first-health-import")).toBe(false);
  });
});