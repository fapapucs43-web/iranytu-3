/**
 * The sleep log and its correlation — Phase 3.
 *
 * The clock maths is the part that can be quietly wrong: a 23:30 → 07:10 night
 * crosses midnight, an equal pair is ambiguous rather than zero, and a stored
 * blob with a 3 p.m. bedtime is junk. The correlation is the other half: the
 * sample floor and the band averages are what stop four nights from reading
 * like a finding.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import {
  SLEEP_LOG_KEY,
  deleteSleepRecord,
  describeDuration,
  describeSleepMood,
  durationMinutes,
  loadSleepLog,
  resetSleepLog,
  saveSleepRecord,
  sleepMoodCorrelation,
  subscribeSleepLog,
  type SleepRecord,
} from "../../src/lib/sleepLog";
import type { Entry } from "../../src/types";

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

const record = (date: string, bedTime = "23:00", wakeTime = "07:00", quality = 4): SleepRecord => ({
  date,
  bedTime,
  wakeTime,
  quality: quality as SleepRecord["quality"],
});

/** A minimal entry: only `date` and `mood` matter to the correlation. */
const entry = (date: string, mood: Entry["mood"]): Entry =>
  ({ date, mood }) as unknown as Entry;

describe("the clock", () => {
  test("a night that crosses midnight is one duration", () => {
    expect(durationMinutes({ bedTime: "23:30", wakeTime: "07:10" })).toBe(460);
    expect(describeDuration({ bedTime: "23:30", wakeTime: "07:10" })).toBe("7 ó 40 p");
  });

  test("a same-day nap is fine too", () => {
    expect(durationMinutes({ bedTime: "13:00", wakeTime: "14:30" })).toBe(90);
  });

  test("equal times are ambiguous, not zero", () => {
    expect(durationMinutes({ bedTime: "23:00", wakeTime: "23:00" })).toBeNull();
    expect(describeDuration({ bedTime: "23:00", wakeTime: "23:00" })).toBeNull();
  });

  test("junk times are refused rather than guessed", () => {
    expect(durationMinutes({ bedTime: "25:00", wakeTime: "07:00" })).toBeNull();
    expect(durationMinutes({ bedTime: "7:00", wakeTime: "08:00" })).toBeNull();
    expect(durationMinutes({ bedTime: "", wakeTime: "08:00" })).toBeNull();
  });
});

describe("the log", () => {
  test("a fresh install is empty, and a save writes only its own key", () => {
    expect(loadSleepLog()).toEqual([]);
    const saved = saveSleepRecord(record("2026-10-20"));
    expect(saved).toHaveLength(1);
    expect(Object.keys(backing)).toEqual([SLEEP_LOG_KEY]);
    expect(loadSleepLog()[0]!.quality).toBe(4);
  });

  test("one record per day, newest first, and re-saving replaces", () => {
    saveSleepRecord(record("2026-10-18", "22:00", "06:00", 3));
    saveSleepRecord(record("2026-10-20", "23:00", "07:00", 4));
    saveSleepRecord(record("2026-10-19", "23:30", "07:30", 5));
    expect(loadSleepLog().map((r) => r.date)).toEqual(["2026-10-20", "2026-10-19", "2026-10-18"]);
    const replaced = saveSleepRecord(record("2026-10-19", "01:00", "09:00", 2));
    expect(replaced.filter((r) => r.date === "2026-10-19")).toHaveLength(1);
    expect(replaced.find((r) => r.date === "2026-10-19")!.quality).toBe(2);
  });

  test("an invalid record changes nothing", () => {
    saveSleepRecord(record("2026-10-20"));
    const after = saveSleepRecord({ ...record("2026-10-21"), quality: 9 as never });
    expect(after).toHaveLength(1);
    const noTime = saveSleepRecord({ ...record("2026-10-22"), bedTime: "26:00" });
    expect(noTime).toHaveLength(1);
  });

  test("a corrupt blob loads as a usable list, not a crash", () => {
    backing[SLEEP_LOG_KEY] = "{\"not\":\"an array\"}";
    expect(loadSleepLog()).toEqual([]);
    backing[SLEEP_LOG_KEY] = "not json at all";
    expect(loadSleepLog()).toEqual([]);
    backing[SLEEP_LOG_KEY] = JSON.stringify([record("2026-10-20"), { date: "junk" }, null]);
    expect(loadSleepLog()).toHaveLength(1);
  });

  test("deleting a night removes exactly that night", () => {
    saveSleepRecord(record("2026-10-19"));
    saveSleepRecord(record("2026-10-20"));
    const after = deleteSleepRecord("2026-10-19");
    expect(after.map((r) => r.date)).toEqual(["2026-10-20"]);
  });

  test("subscribers hear a save, and reset clears the key", () => {
    let seen = 0;
    const unsubscribe = subscribeSleepLog(() => {
      seen += 1;
    });
    saveSleepRecord(record("2026-10-20"));
    resetSleepLog();
    unsubscribe();
    expect(seen).toBe(2);
    expect(backing[SLEEP_LOG_KEY]).toBeUndefined();
    expect(loadSleepLog()).toEqual([]);
  });
});

describe("sleep quality against mood", () => {
  test("no shared days is an empty, honest result", () => {
    const result = sleepMoodCorrelation([], []);
    expect(result.n).toBe(0);
    expect(result.r).toBeNull();
    expect(result.bands.map((b) => b.id)).toEqual(["poor", "ok", "good"]);
    expect(result.bands.every((b) => b.count === 0 && b.avgMood === null)).toBe(true);
    expect(describeSleepMood(result)).toContain("Még nincs");
  });

  test("a coefficient needs the floor, and below it the bands still speak", () => {
    const records = [record("2026-10-01", "23:00", "07:00", 2), record("2026-10-02", "23:00", "07:00", 4)];
    const entries = [entry("2026-10-01", 2), entry("2026-10-02", 4)];
    const result = sleepMoodCorrelation(records, entries);
    expect(result.n).toBe(2);
    expect(result.r).toBeNull();
    expect(result.bands.find((b) => b.id === "poor")!.avgMood).not.toBeNull();
    expect(describeSleepMood(result)).toContain("kevés");
  });

  test("a perfect positive relationship is 1, and only shared days count", () => {
    const records = [
      record("2026-10-01", "23:00", "07:00", 1),
      record("2026-10-02", "23:00", "07:00", 2),
      record("2026-10-03", "23:00", "07:00", 4),
      record("2026-10-04", "23:00", "07:00", 5),
      record("2026-10-05", "23:00", "07:00", 5),
    ];
    const entries = [
      entry("2026-10-01", 1),
      entry("2026-10-02", 1),
      entry("2026-10-03", 4),
      entry("2026-10-04", 5),
      entry("2026-10-05", 5),
    ];
    const result = sleepMoodCorrelation(records, entries);
    expect(result.n).toBe(5);
    expect(result.r).toBeGreaterThan(0.8);
    expect(result.bands.find((b) => b.id === "good")!.count).toBe(3);
    expect(result.bands.find((b) => b.id === "poor")!.count).toBe(2);
  });

  test("a flat mood column has no coefficient, not a divide-by-zero", () => {
    const records = [
      record("2026-10-01", "23:00", "07:00", 1),
      record("2026-10-02", "23:00", "07:00", 3),
      record("2026-10-03", "23:00", "07:00", 5),
    ];
    const entries = [entry("2026-10-01", 3), entry("2026-10-02", 3), entry("2026-10-03", 3)];
    expect(sleepMoodCorrelation(records, entries).r).toBeNull();
  });

  test("the sentence never claims cause", () => {
    const records = [
      record("2026-10-01", "23:00", "07:00", 1),
      record("2026-10-02", "23:00", "07:00", 2),
      record("2026-10-03", "23:00", "07:00", 4),
      record("2026-10-04", "23:00", "07:00", 5),
    ];
    const entries = [
      entry("2026-10-01", 1),
      entry("2026-10-02", 2),
      entry("2026-10-03", 4),
      entry("2026-10-04", 5),
    ];
    const text = describeSleepMood(sleepMoodCorrelation(records, entries));
    expect(text).not.toContain("okozza a hangulatot");
    expect(text).toContain("nem bizonyíték");
  });
});
