/**
 * Batch 5 — a pre-Batch-5 localStorage payload, driven through the REAL store.
 *
 * This is the highest-consequence regression guard in the icon batch. Batch 5
 * replaced UI-chrome emoji with vendored SVG. If anyone "tidied up" an emoji
 * that is actually part of the persisted data — most likely DEFAULT_ACTIVITIES,
 * whose labels like "🚶 Mozgás" are written verbatim into every entry's
 * `activities` array and matched by exact string in correlationGrid — then
 * every user who already had a journal would silently lose their whole
 * Hatásmátrix. No error, no failed migration, just an empty screen.
 *
 * WHY THE PAYLOAD IS FED IN THROUGH importEntries RATHER THAN BY SEEDING
 * localStorage AND RELOADING: `lib/store` reads localStorage exactly once, at
 * module-evaluation time, and `bun test` runs every test file in one process
 * with a shared module cache. A test file that seeds storage at top level and
 * then imports the store works in isolation but silently asserts nothing once
 * any other test file has already pulled `lib/store` in. That is a test that
 * only passes when run alone — worse than no test at all.
 *
 * So this file instead pushes a byte-exact legacy payload through the real
 * `importEntries` → `normalizeEntry` → `write` path and asserts on the RAW
 * PERSISTED BYTES. That is order-independent, and it still exercises exactly
 * the code that would corrupt the data: the normalizer and the serializer.
 */
import { beforeEach, describe, expect, test } from "bun:test";

const backing: Record<string, string> = {};

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
});

import { getState, importEntries, resetAll, saveEntry } from "../src/lib/store";
import { buildCorrelationGrid } from "../src/lib/correlationGrid";
import { tagCorrelations } from "../src/lib/analysis";

/**
 * A literal v2 export, byte-for-byte as the shipped pre-Batch-5 build would
 * have left it in localStorage — including a few fields this build no longer
 * writes, so the normalizer's job of preserving them is covered too.
 */
const LEGACY_ENTRIES = [
  {
    id: "a1b2c3",
    date: "2026-03-01",
    mood: 5,
    stress: 3,
    energy: 8,
    note: "Kirándultam a Pilisbe.",
    tags: ["hétvég"],
    emotions: ["Öröm", "Hála"],
    activities: ["🚶 Mozgás", "🌿 Természet"],
    reflection: { feeling: "jól éreztem magam", stressReason: "", need: "pihenés" },
    vitals: { restingHr: 58, hrv: null, sleepHours: 8 },
    source: "manual",
    createdAt: 1772323200000,
    updatedAt: 1772323200000,
  },
  {
    id: "d4e5f6",
    date: "2026-03-04",
    mood: 2,
    stress: 8,
    energy: 3,
    note: "",
    tags: [],
    emotions: ["Aggodalom"],
    activities: [],
    reflection: { feeling: "", stressReason: "", need: "" },
    vitals: { restingHr: null, hrv: null, sleepHours: 4 },
    source: "manual",
    createdAt: 1772582400000,
    updatedAt: 1772582400000,
  },
] as unknown as Parameters<typeof importEntries>[0];

/** Load the legacy payload the way an upgrade would: straight from disk. */
function loadLegacy(): void {
  backing["belso-iranytu-data-v2"] = JSON.stringify({
    version: 2,
    entries: LEGACY_ENTRIES,
    settings: { textSize: "normal", theme: "light" },
    goals: [],
  });
  importEntries(LEGACY_ENTRIES);
}

/** The raw string actually sitting in localStorage. */
function persisted(): string {
  return backing["belso-iranytu-data-v2"]!;
}

describe("a pre-Batch-5 payload keeps its emoji activity labels", () => {
  test("both entries survive the import", () => {
    loadLegacy();
    expect(getState().entries).toHaveLength(2);
  });

  test("activities are byte-identical to what was stored", () => {
    loadLegacy();
    const good = getState().entries.find((e) => e.date === "2026-03-01")!;
    const bad = getState().entries.find((e) => e.date === "2026-03-04")!;
    expect(good.activities).toEqual(["🚶 Mozgás", "🌿 Természet"]);
    expect(bad.activities).toEqual([]);
  });

  test("the emoji prefix survives — the grid splits the icon off the label", () => {
    loadLegacy();
    const label = getState().entries.find((e) => e.date === "2026-03-01")!.activities[0]!;
    expect(label).toBe("🚶 Mozgás");
    expect(label.split(" ")[0]).toBe("🚶");
  });

  test("the RAW persisted bytes carry the emoji, not an escape or a stripped label", () => {
    loadLegacy();
    expect(persisted()).toContain("🚶 Mozgás");
    expect(persisted()).toContain("🌿 Természet");
    // JSON.stringify does not escape non-ASCII by default — a regression that
    // started writing \uXXXX would still be valid JSON, so assert the literal.
    expect(persisted()).not.toContain("\\ud83d");
  });

  test("unrelated legacy fields are still preserved by the normalizer", () => {
    loadLegacy();
    const good = getState().entries.find((e) => e.date === "2026-03-01")!;
    expect(good.tags).toEqual(["hétvég"]);
    expect(good.emotions).toEqual(["Öröm", "Hála"]);
    expect(good.vitals.sleepHours).toBe(8);
    expect(good.id).toBe("a1b2c3");
  });
});

describe("a later save does not normalise the emoji away", () => {
  test("a partial (reflection-only) save preserves the activity strings", () => {
    loadLegacy();
    // The exact shape Batch 4 hardened: a surface that owns one field and
    // must not clobber the rest of the day.
    saveEntry({ date: "2026-03-01", reflection: { feeling: "még jobb", stressReason: "", need: "" } });
    const after = getState().entries.find((e) => e.date === "2026-03-01")!;
    expect(after.activities).toEqual(["🚶 Mozgás", "🌿 Természet"]);
    expect(after.reflection.feeling).toBe("még jobb");
    expect(persisted()).toContain("🚶 Mozgás");
  });

  test("a full JSON export → import cycle keeps the emoji activities", () => {
    loadLegacy();
    const round = JSON.parse(JSON.stringify(getState())).entries as typeof LEGACY_ENTRIES;
    resetAll();
    expect(getState().entries).toEqual([]);
    importEntries(round);
    const merged = getState().entries.find((e) => e.date === "2026-03-01")!;
    expect(merged.activities).toEqual(["🚶 Mozgás", "🌿 Természet"]);
  });
});

describe("the loaded legacy entries still drive correlation", () => {
  test("buildCorrelationGrid produces a row for the stored emoji label", () => {
    loadLegacy();
    const { rows } = buildCorrelationGrid({
      entries: getState().entries,
      customNumericTrackers: [],
      customActivities: [],
    });
    const walk = rows.find((r) => r.label === "🚶 Mozgás");
    expect(walk).toBeDefined();
    expect(walk!.icon).toBe("🚶");
    expect(walk!.isCustom).toBe(false);
  });

  test("tagCorrelations keys on the full emoji label", () => {
    loadLegacy();
    // One tagged day, below the 2-sample guard, so assert the grouping input
    // rather than a stat that legitimately would not be produced.
    const labels = getState().entries.flatMap((e) => e.activities);
    expect(labels).toContain("🚶 Mozgás");
    expect(Array.isArray(tagCorrelations(getState().entries))).toBe(true);
  });

  test("tagCorrelations does produce a stat once a second day is tagged", () => {
    loadLegacy();
    saveEntry({ date: "2026-03-04", activities: ["🚶 Mozgás", "💻 Munka"] });
    const walk = tagCorrelations(getState().entries).find((s) => s.tag === "🚶 Mozgás");
    expect(walk).toBeDefined();
    expect(walk!.count).toBe(2);
  });

  test("a label stripped of its emoji would match nothing — the guard bites", () => {
    loadLegacy();
    // Proof that matching is genuinely by the full string: replace the stored
    // activity with the bare word and the row disappears entirely.
    for (const e of getState().entries) {
      saveEntry({ date: e.date, activities: e.activities.map((a) => a.split(" ").slice(1).join(" ")) });
    }
    const { rows } = buildCorrelationGrid({
      entries: getState().entries,
      customNumericTrackers: [],
      customActivities: [],
    });
    expect(rows.find((r) => r.label === "🚶 Mozgás")).toBeUndefined();
  });
});

describe("wiping the journal leaves no emoji residue behind", () => {
  test("resetAll empties the payload entirely", () => {
    loadLegacy();
    resetAll();
    expect(getState().entries).toEqual([]);
    expect(persisted()).not.toContain("🚶 Mozgás");
  });
});
