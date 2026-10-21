/**
 * Phase 3 unit tests (bun test) — pure lib logic, storage-backed libs get a
 * fresh localStorage stub per test.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import type { Entry } from "../src/types";

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

/* --------------------------------- CBT --------------------------------- */

describe("cbt", () => {
  test("adds, lists and deletes records; computes mood shift", async () => {
    const { addCbtRecord, getCbtRecords, deleteCbtRecord, moodShift, averageShift } = await import(
      "../src/lib/cbt"
    );
    const r1 = addCbtRecord({
      date: "2026-09-27",
      situation: "megbeszélés",
      automaticThought: "Mindenki azt fogja gondolni, hogy alkalmatlan vagyok",
      emotion: "szorongás",
      distressBefore: 8,
      evidenceFor: "hibáztam tavaly",
      evidenceAgainst: "kétszer előléptettek",
      balancedThought: "Egy hiba nem határoz meg",
      distressAfter: 4,
    });
    expect(getCbtRecords()).toHaveLength(1);
    expect(moodShift(r1)).toBe(4);
    expect(averageShift(getCbtRecords())).toBe(4);

    addCbtRecord({
      date: "2026-09-27",
      situation: "s",
      automaticThought: "t2",
      emotion: "düh",
      distressBefore: 5,
      distressAfter: 5,
      evidenceFor: "",
      evidenceAgainst: "",
      balancedThought: "b",
    });
    expect(averageShift(getCbtRecords())).toBe(2); // (4+0)/2

    deleteCbtRecord(r1.id);
    expect(getCbtRecords()).toHaveLength(1);
    expect(averageShift(getCbtRecords())).toBe(0);
  });

  test("records are persisted to storage on add (reload-safe)", async () => {
    // Module state is shared within the file (bun caches imports), so instead
    // of simulating a reload we assert the persistence write happens.
    const { addCbtRecord } = await import("../src/lib/cbt");
    const before = addCbtRecord({
      date: "2026-09-27",
      automaticThought: "proba",
      situation: "s",
      emotion: "e",
      distressBefore: 3,
      distressAfter: 2,
      evidenceFor: "",
      evidenceAgainst: "",
      balancedThought: "b",
    });
    const raw = backing["belso-iranytu-cbt-records"];
    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw!);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.some((r: { id: string }) => r.id === before.id)).toBe(true);
  });

  test("sanitizer drops broken rows and clamps distress", async () => {
    const { sanitizeCbtRecords } = await import("../src/lib/cbt");
    const out = sanitizeCbtRecords([
      { automaticThought: "ok", distressBefore: 42, distressAfter: -3 },
      { automaticThought: "" }, // invalid
      null,
      "junk",
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].distressBefore).toBe(10);
    expect(out[0].distressAfter).toBe(0);
    expect(sanitizeCbtRecords(null)).toEqual([]);
  });
});

/* ------------------------------ breathing ------------------------------ */

describe("breathing", () => {
  test("cycle length sums phases", async () => {
    const { BREATH_PATTERNS, cycleLength } = await import("../src/lib/breathing");
    expect(cycleLength(BREATH_PATTERNS[0])).toBe(19); // 4+7+8
    expect(cycleLength(BREATH_PATTERNS[1])).toBe(16); // box
  });

  test("engine steps through phases and counts cycles", async () => {
    const { BREATH_PATTERNS, startEngine, stepEngine, currentPhase } = await import(
      "../src/lib/breathing"
    );
    const box = BREATH_PATTERNS[1];
    let s = startEngine(box);
    expect(currentPhase(box, s).label).toBe("Lélegezz be");
    s = stepEngine(box, s, 4); // inhale done
    expect(currentPhase(box, s).label).toBe("Tartsd meg");
    s = stepEngine(box, s, 12); // rest of box cycle (4+4+4)
    expect(currentPhase(box, s).label).toBe("Lélegezz be"); // wrapped
    expect(s.cycles).toBe(1);
    expect(s.remaining).toBe(4);
  });

  test("motion mapping: in=+1, out=-1, hold=0; custom builder skips zeros", async () => {
    const { phaseMotion, buildCustomPattern } = await import("../src/lib/breathing");
    expect(phaseMotion({ label: "Lélegezz be", seconds: 4 })).toBe(1);
    expect(phaseMotion({ label: "Fújd ki", seconds: 4 })).toBe(-1);
    expect(phaseMotion({ label: "Tartsd meg", seconds: 4 })).toBe(0);
    const custom = buildCustomPattern(4, 0, 6, 0);
    expect(custom.phases.map((p) => p.label)).toEqual(["Lélegezz be", "Fújd ki"]);
    expect(custom.phases[1].seconds).toBe(6);
  });
});

/* ------------------------------- habits -------------------------------- */

describe("habits", () => {
  test("toggle, streak tolerates missing today, weekly count", async () => {
    const { toggleHabitDate, habitStreak, weeklyCount, isDone, addHabit } = await import(
      "../src/lib/habits"
    );
    const h = addHabit("💧", "Vízteszt");
    expect(h).not.toBeNull();
    const today = "2026-09-27";
    const mk = (offset: number) => {
      const d = new Date(today + "T12:00:00");
      d.setDate(d.getDate() - offset);
      return d.toISOString().slice(0, 10);
    };
    toggleHabitDate(h!.id, mk(1));
    toggleHabitDate(h!.id, mk(2));
    toggleHabitDate(h!.id, mk(3));
    // today not done yet → streak should still be 3
    expect(habitStreak(h!.id, today)).toBe(3);
    expect(weeklyCount(h!.id, today)).toBe(3);
    toggleHabitDate(h!.id, today);
    expect(habitStreak(h!.id, today)).toBe(4);
    expect(isDone(h!.id, today)).toBe(true);
    // untoggle works
    toggleHabitDate(h!.id, today);
    expect(habitStreak(h!.id, today)).toBe(3);
  });

  test("add de-duplicates, caps length; delete removes checks", async () => {
    const { addHabit, deleteHabit, getHabits, toggleHabitDate } = await import("../src/lib/habits");
    const a = addHabit("🥗", "Saláta");
    expect(addHabit("🥗", "saláta")).toBeNull(); // duplicate
    toggleHabitDate(a!.id, "2026-09-26");
    deleteHabit(a!.id);
    expect(getHabits().habits.find((h) => h.id === a!.id)).toBeUndefined();
    expect(getHabits().checks[a!.id]).toBeUndefined();
    expect(addHabit("⭐", "   ")).toBeNull();
  });
});

/* ---------------------------- year in pixels --------------------------- */

describe("yearInPixels", () => {
  function mkEntry(date: string, mood: 1 | 2 | 3 | 4 | 5): Entry {
    return {
      id: crypto.randomUUID(),
      date,
      mood,
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
  }

  test("matrix maps moods to colors and empty days to null", async () => {
    const { monthMatrix } = await import("../src/lib/yearInPixels");
    const { moodByLevel } = await import("../src/lib/mood");
    const entries = [mkEntry("2026-09-15", 5), mkEntry("2026-09-16", 1)];
    const m = monthMatrix(2026, 8, entries); // September 2026
    expect(m.cells).toHaveLength(35); // Sep 2026: Tue start, 30 days → 5 weeks
    const d15 = m.cells.find((c) => c.day === 15)!;
    const d16 = m.cells.find((c) => c.day === 16)!;
    expect(d15.level).toBe(5);
    // Batch 11 commit 3 recomputed the mood hexes for WCAG AA over every
    // theme background; the pin follows the palette instead of a literal,
    // so the matrix's contract ("copy moodByLevel's color") stays the thing
    // under test no matter which hex the palette carries.
    expect(d15.color).toBe(moodByLevel(5).color);
    expect(d16.level).toBe(1);
    expect(d16.color).toBe(moodByLevel(1).color);
    expect(m.cells.filter((c) => c.level === null).length).toBe(33);
  });

  test("availableYears includes data years plus current year, sorted desc", async () => {
    const { availableYears } = await import("../src/lib/yearInPixels");
    const years = availableYears([mkEntry("2025-01-01", 3), mkEntry("2026-02-02", 4)]);
    // `availableYears` reads the current year off the real clock, so pinning
    // it to a literal here was a bomb with a fuse set for 2027-01-01: the
    // assertion was about the calendar, not about the function. These four
    // assert the contract the test name actually claims — data years present,
    // current year present, newest first, newest at the head — so it holds on
    // any date, and covers more than the two assertions it replaces.
    expect(years).toContain(2025);
    expect(years).toContain(2026);
    expect(years).toContain(new Date().getFullYear());
    expect(years).toEqual([...years].sort((a, b) => b - a));
    expect(years[0]).toBe(Math.max(...years));
  });
});

/* ----------------------------- lag analysis ---------------------------- */

describe("lagAnalysis", () => {
  function mkEntry(date: string, mood: 1 | 2 | 3 | 4 | 5, activities: string[]): Entry {
    return {
      id: crypto.randomUUID(),
      date,
      mood,
      stress: 5,
      energy: 5,
      note: "",
      tags: [],
      emotions: [],
      activities,
      reflection: { feeling: "", stressReason: "", need: "" },
      vitals: { restingHr: null, hrv: null, sleepHours: null },
      source: "manual",
      createdAt: 0,
      updatedAt: 0,
    };
  }

  test("detects next-day mood drop after tagged days vs baseline", async () => {
    const { lagStats, deltaLabel } = await import("../src/lib/lagAnalysis");
    const entries = [
      mkEntry("2026-09-20", 5, ["Sports"]),
      mkEntry("2026-09-21", 2, []), // day after sport: low
      mkEntry("2026-09-23", 4, []), // baseline day (not tagged, not after)
      mkEntry("2026-09-24", 5, ["Sports"]),
      mkEntry("2026-09-25", 2, []),
      mkEntry("2026-09-27", 4, []), // baseline day
    ];
    const stats = lagStats(entries);
    const sport = stats.find((s) => s.tag === "Sports")!;
    expect(sport).toBeDefined();
    expect(sport.nextDay).not.toBeNull();
    expect(sport.nextDay!).toBeLessThan(sport.baseline);
    expect(deltaLabel(sport.nextDay, sport.baseline)).toBe(sport.nextDay! - sport.baseline >= 0 ? `+${sport.nextDay! - sport.baseline}` : String(sport.nextDay! - sport.baseline));
  });

  test("skips tags with fewer than 2 occurrences and tiny datasets", async () => {
    const { lagStats } = await import("../src/lib/lagAnalysis");
    expect(lagStats([mkEntry("2026-09-26", 3, ["Solo"])])) .toEqual([]);
    const stats = lagStats([
      mkEntry("2026-09-20", 4, ["Once"]),
      mkEntry("2026-09-21", 4, []),
      mkEntry("2026-09-26", 3, ["Twice"]),
      mkEntry("2026-09-27", 3, ["Twice"]),
    ]);
    expect(stats.find((s) => s.tag === "Once")).toBeUndefined();
    expect(stats.find((s) => s.tag === "Twice")).toBeDefined();
  });
});
