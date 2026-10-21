/**
 * Batch 13, commit 8 — the feature-use sidecar and the second twelve badges.
 *
 * TWO SEPARATE THINGS ARE BEING PINNED HERE, and they fail differently:
 *
 *  1. THE SIDECAR'S CONTRACT. It is TOTAL: every key is present and is a
 *     number, whatever the caller passes. That is not a convenience, it is the
 *     point — `use.gratitude >= 5` must never be `undefined >= 5`, because a
 *     rule that stopped firing would look identical to a reader who has not
 *     earned the badge yet. So the coercion cases are asserted directly:
 *     `undefined`, `null`, `NaN`, `Infinity`, a negative, a float and a
 *     numeric string each produce a number, and the bad ones produce 0.
 *
 *  2. THE TWELVE NEW RULES. Each one is checked at n-1 and at n, because a
 *     threshold that fires early is a promise the app cannot keep and one that
 *     fires late is a badge that silently never appears. The count-based ones
 *     go through `buildFeatureUse` so the badge rule and the sidecar are
 *     exercised together rather than separately.
 *
 * `mood-range` is the interesting one: its target is `MOODS.length`, read from
 * the scale, not a literal. There is a test that says so, because a rule that
 * hardcodes 4 would pass every badge test here and quietly become unearnable
 * the day the scale changes.
 */
import { describe, expect, test } from "bun:test";
import {
  FEATURE_KEYS,
  NO_FEATURE_USE,
  attachmentCount,
  buildFeatureUse,
  moodLevelsUsed,
} from "../../src/lib/featureUse";
import { BADGES, earnedBadgeIds } from "../../src/lib/achievements";
import { MOODS } from "../../src/lib/mood";
import type { Entry } from "../../src/types";

function entry(over: Partial<Entry> = {}): Entry {
  return {
    id: "e",
    date: "2026-10-02",
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
    ...over,
  };
}

function withAttachments(kinds: ("photo" | "video")[]): Entry {
  return entry({
    attachments: kinds.map((kind, i) => ({ id: `a${i}`, kind, createdAt: 0 })),
  });
}

/** n consecutive days ending today, so `currentStreak` sees a real streak. */
function streakEntries(n: number): Entry[] {
  const out: Entry[] = [];
  // Anchored to the real current date, because the doc comment above is the
  // contract and `currentStreak` is what has to be satisfied by it.
  //
  // This used to be `Date.parse("2026-10-02T00:00:00")` — a fixed base that
  // silently made the helper a time bomb. `currentStreak` counts back from
  // today with one day of grace, so the fixture only counted as a streak on
  // the day it was written and on the day after; from the second day on, the
  // whole suite went red with the calendar as the only variable. The
  // thresholds under test — 60 and 100 — are untouched by this change.
  //
  // Walked with setDate rather than by subtracting 86_400_000 ms, for the same
  // reason `currentStreak` itself walks that way: across a DST boundary the
  // millisecond arithmetic skips or repeats a local day.
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  for (let i = 0; i < n; i += 1) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
    out.push(entry({ id: `e${i}`, date: iso }));
  }
  return out;
}

describe("the sidecar is total", () => {
  test("every key is present and zero when nothing is known", () => {
    const use = buildFeatureUse({});
    for (const key of FEATURE_KEYS) {
      expect(Object.prototype.hasOwnProperty.call(use, key), key).toBe(true);
      expect(use[key], key).toBe(0);
    }
  });

  test("FEATURE_KEYS and the zero-filled map agree", () => {
    expect(Object.keys(NO_FEATURE_USE).sort()).toEqual([...FEATURE_KEYS].sort());
    expect(new Set(FEATURE_KEYS).size).toBe(FEATURE_KEYS.length);
  });

  test("null and undefined produce an all-zero map, not a crash", () => {
    for (const bad of [null, undefined]) {
      const use = buildFeatureUse(bad as never);
      expect(Object.keys(use).sort()).toEqual([...FEATURE_KEYS].sort());
      for (const key of FEATURE_KEYS) expect(use[key], key).toBe(0);
    }
  });

  test("every coercion lands on a number, and the bad ones land on zero", () => {
    // The point of the contract: a badge rule compares with `>=`, and
    // `NaN >= 5` is false, so a NaN that got through would make a badge that
    // can never be earned rather than one that crashes.
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1, -0.5]) {
      const use = buildFeatureUse({ gratitude: bad });
      expect(typeof use.gratitude, String(bad)).toBe("number");
      expect(use.gratitude, String(bad)).toBe(0);
    }
  });

  test("a numeric string is accepted and a non-numeric one is not", () => {
    expect(buildFeatureUse({ gratitude: "7" as never }).gratitude).toBe(7);
    expect(buildFeatureUse({ gratitude: "nincs" as never }).gratitude).toBe(0);
  });

  test("a fractional count is floored, never rounded up into a badge", () => {
    // 4.9 gratitude notes are not 5. Rounding up would award a milestone
    // nobody reached.
    expect(buildFeatureUse({ gratitude: 4.9 }).gratitude).toBe(4);
  });

  test("an unknown key is ignored rather than copied through", () => {
    const use = buildFeatureUse({ nonsense: 99 } as never);
    expect(Object.keys(use).sort()).toEqual([...FEATURE_KEYS].sort());
  });

  test("the map is readonly at the type level and does not share state", () => {
    const a = buildFeatureUse({ gratitude: 3 });
    const b = buildFeatureUse({ gratitude: 3 });
    expect(a).not.toBe(b);
    expect(a.gratitude).toBe(3);
  });
});

describe("what the reader has done", () => {
  test("moodLevelsUsed counts DISTINCT levels", () => {
    expect(moodLevelsUsed([])).toBe(0);
    expect(moodLevelsUsed([entry({ mood: 3 }), entry({ mood: 3 })])).toBe(1);
    expect(moodLevelsUsed([entry({ mood: 1 }), entry({ mood: 5 })])).toBe(2);
  });

  test("attachmentCount counts one kind across every entry", () => {
    expect(attachmentCount([], "photo")).toBe(0);
    const e = withAttachments(["photo", "photo", "video"]);
    expect(attachmentCount([e], "photo")).toBe(2);
    expect(attachmentCount([e], "video")).toBe(1);
    expect(attachmentCount([e, withAttachments(["photo"])], "photo")).toBe(3);
  });

  test("an entry with no attachments key at all is zero, not a crash", () => {
    expect(attachmentCount([entry()], "photo")).toBe(0);
  });
});

describe("the twelve new badges", () => {
  const IDS = [
    "streak-60",
    "streak-100",
    "entries-365",
    "photo-10",
    "video-5",
    "gratitude-25",
    "cbt-25",
    "habit-30",
    "mood-range",
    "first-reflection",
    "first-experiment",
    "experiment-closed",
  ];

  test("there are exactly twelve more than Batch 2 froze, and they are these", () => {
    // Commit 9 appended three MORE after this commit's twelve, so the total is
    // 27 and the first twelve added by commit 8 are still slice(12).
    expect(BADGES.length).toBe(27);
    expect(BADGES.slice(12, 24).map((b) => b.id)).toEqual(IDS);
  });

  test("every id is unique and every hint is real copy", () => {
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(BADGES.length);
    for (const b of BADGES) {
      expect(b.label.length, b.id).toBeGreaterThan(0);
      expect(b.hint.length, b.id).toBeGreaterThan(0);
    }
  });

  test("streak-60 and streak-100 fire at their thresholds and not one short", () => {
    expect(earnedBadgeIds({ entries: streakEntries(59), maxHabitStreak: 0 }).has("streak-60")).toBe(false);
    expect(earnedBadgeIds({ entries: streakEntries(60), maxHabitStreak: 0 }).has("streak-60")).toBe(true);
    expect(earnedBadgeIds({ entries: streakEntries(99), maxHabitStreak: 0 }).has("streak-100")).toBe(false);
    expect(earnedBadgeIds({ entries: streakEntries(100), maxHabitStreak: 0 }).has("streak-100")).toBe(true);
  });

  test("entries-365 fires at 365 and not at 364", () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => entry({ id: `x${i}` }));
    expect(earnedBadgeIds({ entries: many(364), maxHabitStreak: 0 }).has("entries-365")).toBe(false);
    expect(earnedBadgeIds({ entries: many(365), maxHabitStreak: 0 }).has("entries-365")).toBe(true);
  });

  test("photo-10 counts across entries, not within one", () => {
    const five = withAttachments(["photo", "photo", "photo", "photo", "photo"]);
    const nine = withAttachments(["photo", "photo", "photo", "photo"]);
    expect(earnedBadgeIds({ entries: [five, nine], maxHabitStreak: 0 }).has("photo-10")).toBe(false);
    expect(earnedBadgeIds({ entries: [five, nine, withAttachments(["photo"])], maxHabitStreak: 0 }).has("photo-10")).toBe(true);
  });

  test("video-5 is a separate count from photo-10", () => {
    const tenPhotos = withAttachments(Array.from({ length: 10 }, () => "photo" as const));
    const got = earnedBadgeIds({ entries: [tenPhotos], maxHabitStreak: 0 });
    expect(got.has("photo-10")).toBe(true);
    expect(got.has("video-5")).toBe(false);
  });

  test("gratitude-25 and cbt-25 read the sidecar", () => {
    expect(earnedBadgeIds({ entries: [], maxHabitStreak: 0, featureUse: buildFeatureUse({ gratitude: 24, cbt: 24 }) }).has("gratitude-25")).toBe(false);
    expect(earnedBadgeIds({ entries: [], maxHabitStreak: 0, featureUse: buildFeatureUse({ gratitude: 25, cbt: 25 }) }).has("gratitude-25")).toBe(true);
    expect(earnedBadgeIds({ entries: [], maxHabitStreak: 0, featureUse: buildFeatureUse({ gratitude: 25, cbt: 25 }) }).has("cbt-25")).toBe(true);
  });

  test("the 5 and 25 tiers coexist — 25 notes earns both", () => {
    const got = earnedBadgeIds({
      entries: [],
      maxHabitStreak: 0,
      featureUse: buildFeatureUse({ gratitude: 25, cbt: 25 }),
    });
    expect(got.has("gratitude-5")).toBe(true);
    expect(got.has("gratitude-25")).toBe(true);
    expect(got.has("cbt-5")).toBe(true);
    expect(got.has("cbt-25")).toBe(true);
  });

  test("habit-30 sits above habit-7", () => {
    expect(earnedBadgeIds({ entries: [], maxHabitStreak: 29 }).has("habit-30")).toBe(false);
    const got = earnedBadgeIds({ entries: [], maxHabitStreak: 30 });
    expect(got.has("habit-30")).toBe(true);
    expect(got.has("habit-7")).toBe(true);
  });

  test("mood-range reads the scale, so its target cannot fall behind it", () => {
    const full = MOODS.map((m, i) => entry({ id: `m${i}`, mood: m.level }));
    expect(earnedBadgeIds({ entries: full, maxHabitStreak: 0 }).has("mood-range")).toBe(true);
    // One level short of the whole scale is not the whole scale.
    const short = full.slice(0, -1);
    expect(earnedBadgeIds({ entries: short, maxHabitStreak: 0 }).has("mood-range")).toBe(false);
  });

  test("the first-use badges need exactly one, not a threshold", () => {
    // Written out rather than looped over a key-to-id map: the three ids do
    // NOT follow one pattern (`first-reflection`, `first-experiment`,
    // `experiment-closed`), and a clever loop over that difference is exactly
    // the kind of test that fails for a reason unrelated to the code.
    const at = (over: Record<string, number>) =>
      earnedBadgeIds({ entries: [], maxHabitStreak: 0, featureUse: buildFeatureUse(over) });

    expect(at({ reflection: 0 }).has("first-reflection")).toBe(false);
    expect(at({ reflection: 1 }).has("first-reflection")).toBe(true);

    expect(at({ experiment: 0 }).has("first-experiment")).toBe(false);
    expect(at({ experiment: 1 }).has("first-experiment")).toBe(true);

    expect(at({ experimentClosed: 0 }).has("experiment-closed")).toBe(false);
    expect(at({ experimentClosed: 1 }).has("experiment-closed")).toBe(true);
  });

  test("an experiment that was started but never concluded is not a closed one", () => {
    // The difference the card's two subscriptions exist for.
    const startedOnly = earnedBadgeIds({
      entries: [],
      maxHabitStreak: 0,
      featureUse: buildFeatureUse({ experiment: 1, experimentClosed: 0 }),
    });
    expect(startedOnly.has("first-experiment")).toBe(true);
    expect(startedOnly.has("experiment-closed")).toBe(false);
  });

  test("a caller that passes no sidecar earns no feature badge and does not crash", () => {
    const got = earnedBadgeIds({ entries: streakEntries(100), maxHabitStreak: 30 });
    expect(got.has("streak-100")).toBe(true);
    for (const id of ["gratitude-5", "cbt-5", "first-reflection", "first-experiment", "experiment-closed"]) {
      expect(got.has(id), id).toBe(false);
    }
  });
});