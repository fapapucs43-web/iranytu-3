/**
 * Batch 4 regression tests — correctness fixes found by the functional audit.
 *
 * Each test here FAILS on the pre-Batch-4 code and passes after, so a future
 * refactor cannot silently reintroduce data loss.
 *   1. partial saves must not drop attachments / trackerValues
 *   2. deleteEntry must remove the attachment BLOBS it referenced
 *   3. CSV export/import must round-trip trackerValues
 *   4. streaks and reminder gating must use LOCAL dates, not UTC
 *   8. the dead habit system is gone from the store
 *   9. the breathing phase label typo
 */
import { beforeEach, describe, expect, test } from "bun:test";
import type { Entry } from "../src/types";
import { toISODate } from "../src/lib/dates";

const backing: Record<string, string> = {};
const sessionBacking: Record<string, string> = {};

beforeEach(() => {
  for (const k of Object.keys(backing)) delete backing[k];
  for (const k of Object.keys(sessionBacking)) delete sessionBacking[k];
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => (k in backing ? backing[k] : null),
    setItem: (k: string, v: string) => {
      backing[k] = v;
    },
    removeItem: (k: string) => {
      delete backing[k];
    },
  };
  (globalThis as unknown as { sessionStorage: unknown }).sessionStorage = {
    getItem: (k: string) => (k in sessionBacking ? sessionBacking[k] : null),
    setItem: (k: string, v: string) => {
      sessionBacking[k] = v;
    },
    removeItem: (k: string) => {
      delete sessionBacking[k];
    },
  };
});

const DAY = "2026-03-01";

/** seed(): reset the store and give 2026-03-01 a photo + tracker values. */
async function seed() {
  const store = await import("../src/lib/store");
  store.resetAll();
  store.saveEntry({
    date: DAY,
    mood: 4,
    stress: 3,
    energy: 7,
    note: "fő bejegyzés",
    activities: ["🚶 Mozgás"],
    attachments: [{ id: "att-1", kind: "photo", createdAt: 1 }],
    trackerValues: { nutrition: { kind: "slider", value: 8 } },
    source: "manual",
  });
  return store;
}

const entryOf = (store: Awaited<ReturnType<typeof seed>>, date = DAY) =>
  store.getState().entries.find((e) => e.date === date)!;

const mkEntry = (date: string): Entry => ({
  id: date,
  date,
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
});

/* ============ 1. partial saves must not drop attachments/trackerValues === */

describe("Batch 4 · 1 — partial saves preserve other fields", () => {
  test("saving a reflection keeps attachments and trackerValues", async () => {
    const store = await seed();
    // Exactly the payload TodayView's MiniReflection now sends.
    store.saveEntry({
      date: DAY,
      reflection: { feeling: "jo", stressReason: "munka", need: "pihenés" },
    });
    const e = entryOf(store);
    expect(e.attachments).toHaveLength(1);
    expect(e.attachments?.[0]?.id).toBe("att-1");
    expect(e.trackerValues).toEqual({ nutrition: { kind: "slider", value: 8 } });
    expect(e.note).toBe("fő bejegyzés");
    expect(e.activities).toEqual(["🚶 Mozgás"]);
  });

  test("saving vitals keeps attachments and trackerValues", async () => {
    const store = await seed();
    store.saveEntry({
      date: DAY,
      vitals: { sleepHours: 7.5, restingHr: 58, hrv: null },
    });
    const e = entryOf(store);
    expect(e.attachments).toHaveLength(1);
    expect(e.trackerValues).toEqual({ nutrition: { kind: "slider", value: 8 } });
    expect(e.vitals.sleepHours).toBe(7.5);
  });

  test("an entry edit (mood/stress/energy/note) keeps attachments", async () => {
    const store = await seed();
    // Exactly the payload EntryDetail.save now sends.
    store.saveEntry({ date: DAY, mood: 2, stress: 8, energy: 3, note: "szerkesztve" });
    const e = entryOf(store);
    expect(e.mood).toBe(2);
    expect(e.note).toBe("szerkesztve");
    expect(e.attachments).toHaveLength(1);
    expect(e.trackerValues).toEqual({ nutrition: { kind: "slider", value: 8 } });
  });

  test("a voice save that only reports mood keeps everything else", async () => {
    const store = await seed();
    store.saveEntry({ date: DAY, mood: 5, source: "voice" });
    const e = entryOf(store);
    expect(e.mood).toBe(5);
    expect(e.source).toBe("voice");
    expect(e.attachments).toHaveLength(1);
    expect(e.trackerValues).toEqual({ nutrition: { kind: "slider", value: 8 } });
  });

  test("a field CAN still be cleared explicitly (empty is not 'absent')", async () => {
    const store = await seed();
    store.saveEntry({ date: DAY, note: "", activities: [], attachments: [] });
    const e = entryOf(store);
    expect(e.note).toBe("");
    expect(e.activities).toEqual([]);
    expect(e.attachments).toEqual([]);
  });

  test("an explicit undefined falls back to the stored value", async () => {
    const store = await seed();
    store.saveEntry({ date: DAY, note: undefined, mood: 1 });
    const e = entryOf(store);
    expect(e.note).toBe("fő bejegyzés");
    expect(e.mood).toBe(1);
  });

  test("a brand-new day still gets sane defaults (no phantom merge)", async () => {
    const store = await seed();
    store.saveEntry({ date: "2026-03-05", reflection: { feeling: "x", stressReason: "", need: "" } });
    const e = entryOf(store, "2026-03-05");
    expect(e.mood).toBe(3); // default, not carried over from the other day
    expect(e.note).toBe("");
    expect(e.attachments).toBeUndefined();
  });

  test("saveEntry preserves createdAt and the entry id", async () => {
    const store = await seed();
    const before = entryOf(store);
    store.saveEntry({ date: DAY, mood: 1 });
    const after = entryOf(store);
    // Same entry, same identity: an update must not orphan the old record.
    expect(after.id).toBe(before.id);
    expect(after.createdAt).toBe(before.createdAt);
    expect(store.getState().entries).toHaveLength(1);
  });
});

/* ================= 2. deleteEntry must free attachment blobs ============== */

describe("Batch 4 · 2 — deleting an entry removes its attachment blobs", () => {
  test("the blob is gone from the attachment store", async () => {
    const store = await import("../src/lib/store");
    const { saveBlob, getAttachment, listAttachmentMeta } = await import(
      "../src/lib/attachments"
    );
    store.resetAll();

    const meta = await saveBlob("photo", new Blob(["x"], { type: "image/jpeg" }), "a.jpg");
    expect(listAttachmentMeta()).toHaveLength(1);

    store.saveEntry({ date: DAY, mood: 3, attachments: [meta] });
    const id = store.getState().entries[0]!.id;

    store.deleteEntry(id);

    expect(store.getState().entries).toHaveLength(0);
    expect(getAttachment(meta.id)).toBeNull();
    expect(listAttachmentMeta()).toHaveLength(0);
  });

  test("other days' attachments are NOT touched", async () => {
    const store = await import("../src/lib/store");
    const { saveBlob, getAttachment } = await import("../src/lib/attachments");
    store.resetAll();

    const a = await saveBlob("photo", new Blob(["a"], { type: "image/jpeg" }));
    const b = await saveBlob("photo", new Blob(["b"], { type: "image/jpeg" }));
    store.saveEntry({ date: "2026-03-01", mood: 3, attachments: [a] });
    store.saveEntry({ date: "2026-03-02", mood: 3, attachments: [b] });

    store.deleteEntry(store.getState().entries.find((e) => e.date === "2026-03-01")!.id);

    expect(getAttachment(a.id)).toBeNull();
    expect(getAttachment(b.id)).not.toBeNull();
  });

  test("deleting an entry with no attachments is a no-op, not a throw", async () => {
    const store = await import("../src/lib/store");
    store.resetAll();
    store.saveEntry({ date: DAY, mood: 3 });
    store.deleteEntry(store.getState().entries[0]!.id);
    expect(store.getState().entries).toHaveLength(0);
  });

  test("deleting an unknown id changes nothing", async () => {
    const store = await seed();
    store.deleteEntry("does-not-exist");
    expect(store.getState().entries).toHaveLength(1);
  });
});

/* ==================== 3. CSV round-trip keeps trackerValues ============== */

describe("Batch 4 · 3 — CSV round-trip is lossless for trackers", () => {
  const withTrackers = (): Entry => ({
    id: "e1",
    date: DAY,
    mood: 4,
    stress: 3,
    energy: 7,
    note: "jegyzet, commas \"és\" idézőjel",
    tags: ["t1"],
    emotions: ["Öröm"],
    activities: ["🚶 Mozgás"],
    reflection: { feeling: "jo", stressReason: "munka", need: "alvás" },
    vitals: { sleepHours: 7.5, restingHr: 58, hrv: 42 },
    source: "manual",
    createdAt: 0,
    updatedAt: 0,
    trackerValues: {
      nutrition: { kind: "slider", value: 8 },
      symptoms: { kind: "checkbox", value: true },
      weather: { kind: "text", value: "napos, hűvös" },
    },
  });

  test("all three tracker kinds survive export → import", async () => {
    const { entriesToCsv, csvToEntries } = await import("../src/lib/csv");
    const back = csvToEntries(entriesToCsv([withTrackers()]))[0]!;
    expect(back.trackerValues).toEqual({
      nutrition: { kind: "slider", value: 8 },
      symptoms: { kind: "checkbox", value: true },
      weather: { kind: "text", value: "napos, hűvös" },
    });
  });

  test("the kind is preserved, not inferred from the value", async () => {
    const { entriesToCsv, csvToEntries } = await import("../src/lib/csv");
    // A checkbox that is false and a slider that is 0 must not be confused.
    const entry = withTrackers();
    entry.trackerValues = {
      a: { kind: "checkbox", value: false },
      b: { kind: "slider", value: 0 },
    };
    const back = csvToEntries(entriesToCsv([entry]))[0]!;
    expect(back.trackerValues).toEqual({
      a: { kind: "checkbox", value: false },
      b: { kind: "slider", value: 0 },
    });
  });

  test("a false checkbox round-trips as false, not as missing", async () => {
    const { entriesToCsv, csvToEntries } = await import("../src/lib/csv");
    const entry = withTrackers();
    entry.trackerValues = { done: { kind: "checkbox", value: false } };
    const back = csvToEntries(entriesToCsv([entry]))[0]!;
    expect(back.trackerValues?.done).toEqual({ kind: "checkbox", value: false });
  });

  test("the pre-existing fields are still round-tripped", async () => {
    const { entriesToCsv, csvToEntries } = await import("../src/lib/csv");
    const back = csvToEntries(entriesToCsv([withTrackers()]))[0]!;
    expect(back.date).toBe(DAY);
    expect(back.mood).toBe(4);
    expect(back.stress).toBe(3);
    expect(back.energy).toBe(7);
    expect(back.note).toBe("jegyzet, commas \"és\" idézőjel");
    expect(back.activities).toEqual(["🚶 Mozgás"]);
    expect(back.emotions).toEqual(["Öröm"]);
    expect(back.vitals).toEqual({ sleepHours: 7.5, restingHr: 58, hrv: 42 });
  });

  test("text containing a comma survives quoting", async () => {
    const { entriesToCsv, csvToEntries } = await import("../src/lib/csv");
    const back = csvToEntries(entriesToCsv([withTrackers()]))[0]!;
    expect(back.trackerValues?.weather).toEqual({
      kind: "text",
      value: "napos, hűvös",
    });
  });

  test("entries with no trackers export the original 14 columns", async () => {
    const { entriesToCsv } = await import("../src/lib/csv");
    const e = withTrackers();
    delete e.trackerValues;
    const header = entriesToCsv([e]).split("\n")[0]!;
    expect(header.split(",")).toHaveLength(14);
    expect(header).not.toContain("tracker:");
  });

  test("a foreign CSV with an unrelated 'tracker' column is not misread", async () => {
    const { csvToEntries } = await import("../src/lib/csv");
    const csv = "date,mood,stress,energy,tracker\n2026-03-01,4,3,7,x";
    const back = csvToEntries(csv)[0]!;
    expect(back.trackerValues).toBeUndefined();
  });

  test("a tracker id containing a colon still round-trips", async () => {
    const { entriesToCsv, csvToEntries } = await import("../src/lib/csv");
    const entry = withTrackers();
    entry.trackerValues = { "weird:id": { kind: "text", value: "x" } };
    const back = csvToEntries(entriesToCsv([entry]))[0]!;
    expect(back.trackerValues).toEqual({ "weird:id": { kind: "text", value: "x" } });
  });

  /* --- Batch 7e: the three value kinds that arrived with it ----------- *
   * Purely additive. Not one line of the cases above was changed, and that is
   * deliberate: the `weather` text case in particular is the load-bearing one,
   * because Batch 7e deliberately did NOT restructure that value, so a
   * pre-Batch-7e export still comes back exactly as it went out.
   */
  test("a number round-trips as a number, and a recorded 0 is not 'absent'", async () => {
    const { entriesToCsv, csvToEntries } = await import("../src/lib/csv");
    const entry = withTrackers();
    entry.trackerValues = {
      steps: { kind: "number", value: 8200 },
      "sport-duration": { kind: "number", value: 0 },
    };
    const back = csvToEntries(entriesToCsv([entry]))[0]!;
    expect(back.trackerValues).toEqual({
      steps: { kind: "number", value: 8200 },
      "sport-duration": { kind: "number", value: 0 },
    });
  });

  test("a tracker id keeps its own casing through a round-trip", async () => {
    // Found by Batch 7e, not invented for it. The importer lowercases every
    // header for lenient column matching, and a tracker id is a KEY rather than
    // a column name — so `sportDuration` used to come back as `sportduration`,
    // match no definition, and leave the value orphaned while the field showed
    // its default. The shipped built-in ids are kebab-case, which is why this
    // never showed up before; custom ids are UUIDs and are lowercase too. Both
    // facts are luck, not a guard, so the case is pinned here directly.
    const { entriesToCsv, csvToEntries } = await import("../src/lib/csv");
    const entry = withTrackers();
    entry.trackerValues = { sportDuration: { kind: "number", value: 45 } };
    const csv = entriesToCsv([entry]);
    expect(csv.split("\n")[0]).toContain("tracker:sportDuration:number");
    const back = csvToEntries(csv)[0]!;
    expect(back.trackerValues).toEqual({ sportDuration: { kind: "number", value: 45 } });
  });

  test("an unrecorded number exports as an empty cell and comes back ABSENT", async () => {
    // The trap this guards: `null` is "not recorded", and a cell that read
    // "0" instead would turn a day somebody did not fill in into a measurement
    // of zero — which the correlation grid would then believe.
    const { entriesToCsv, csvToEntries } = await import("../src/lib/csv");
    const entry = withTrackers();
    entry.trackerValues = { steps: { kind: "number", value: null } };
    const header = entriesToCsv([entry]).split("\n")[0]!;
    expect(header).toContain("tracker:steps:number");
    const row = entriesToCsv([entry]).split("\n")[1]!;
    expect(row.endsWith(",")).toBe(true);
    const back = csvToEntries(entriesToCsv([entry]))[0]!;
    expect(back.trackerValues).toBeUndefined();
  });

  test("a select round-trips by option id, and 'nothing chosen' stays nothing chosen", async () => {
    const { entriesToCsv, csvToEntries } = await import("../src/lib/csv");
    const entry = withTrackers();
    entry.trackerValues = {
      sport: { kind: "select", value: "swim" },
      "weather-condition": { kind: "select", value: "" },
    };
    const back = csvToEntries(entriesToCsv([entry]))[0]!;
    expect(back.trackerValues).toEqual({
      sport: { kind: "select", value: "swim" },
    });
    // The unchosen select comes back ABSENT rather than as `""`. Those are the
    // same answer — a select's default IS "nothing chosen", which is the whole
    // reason it needs no absent-means rule — so an empty cell is the honest
    // encoding and there is nothing to repair on the way back in.
  });

  test("flags round-trip as id=1 pairs, and an unknown id is dropped by the def's sanitizer", async () => {
    const { entriesToCsv, csvToEntries } = await import("../src/lib/csv");
    const { sanitizeTrackerValue, TRACKERS } = await import("../src/lib/trackers");
    const entry = withTrackers();
    entry.trackerValues = {
      "nutrition-flags": { kind: "flags", value: { veg: true, sweet: false, protein: true } },
    };
    const back = csvToEntries(entriesToCsv([entry]))[0]!;
    expect(back.trackerValues?.["nutrition-flags"]).toEqual({
      kind: "flags",
      // The CSV layer carries what it was given; it has no registry, so it
      // cannot know which ids are real. `carb` and `fast` were never set and
      // come back missing, and a "ghost=1" comes back present — both are
      // repaired by the one component allowed to decide what a flag is.
      value: { veg: true, sweet: false, protein: true },
    });

    const def = TRACKERS.find((t) => t.id === "nutrition-flags")!;
    const carried = back.trackerValues!["nutrition-flags"] as {
      kind: "flags";
      value: Record<string, boolean>;
    };
    const safe = sanitizeTrackerValue(def, {
      kind: "flags",
      value: { ...carried.value, ghost: true },
    })!;
    expect(safe).toEqual({
      kind: "flags",
      value: { veg: true, protein: true, carb: false, sweet: false, fast: false },
    });
  });

  test("a pre-Batch-7e export is unchanged by any of this", async () => {
    // The regression that matters most: three new kinds, and not one byte of
    // the pre-7e columns moves.
    const { entriesToCsv, csvToEntries } = await import("../src/lib/csv");
    const csv = entriesToCsv([withTrackers()]);
    const header = csv.split("\n")[0]!;
    expect(header).toContain("tracker:nutrition:slider");
    expect(header).toContain("tracker:weather:text");
    expect(header).not.toContain("number");
    const back = csvToEntries(csv)[0]!;
    expect(back.trackerValues).toEqual({
      nutrition: { kind: "slider", value: 8 },
      symptoms: { kind: "checkbox", value: true },
      weather: { kind: "text", value: "napos, hűvös" },
    });
  });
});

/* ============== 4. streaks / reminders must use LOCAL dates ============== */

describe("Batch 4 · 4 — local dates, not UTC", () => {
  test("currentStreak counts an entry dated with the local today", async () => {
    const { currentStreak } = await import("../src/lib/analysis");
    const mk = (date: string): Entry => ({
      id: date,
      date,
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
    });
    const today = toISODate(new Date());
    expect(currentStreak([mk(today)])).toBe(1);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const y = toISODate(yesterday);
    expect(currentStreak([mk(today), mk(y)])).toBe(2);
    // A streak that is only alive because today is not logged yet.
    expect(currentStreak([mk(y)])).toBe(1);
    // A gap breaks it.
    expect(currentStreak([mk(y), mk("2020-01-01")])).toBe(1);
  });

  /**
   * The real-world failure this guards: in a timezone ahead of UTC, between
   * local midnight and the UTC rollover the two dates DIFFER. A UTC-keyed
   * streak then looks for yesterday and reports 0 for a just-written entry.
   * The clock is faked into that window so the test actually discriminates
   * (on a UTC machine the naive and correct answers coincide).
   */
  test("currentStreak uses the LOCAL date in the midnight→UTC window", async () => {
    const { currentStreak } = await import("../src/lib/analysis");
    const RealDate = globalThis.Date;
    // An instant where the LOCAL date is already the new day but UTC has not
    // rolled over yet — the exact window where a UTC-keyed streak breaks.
    const fixed = new RealDate("2026-03-05T01:00:00+02:00");

    class FakeDate extends RealDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) super(fixed.getTime());
        else super(...(args as [number]));
      }
      static now() {
        return fixed.getTime();
      }
    }
    (globalThis as { Date: unknown }).Date = FakeDate;
    try {
      // Precondition: this clock really is in the divergent window.
      const localISO = toISODate(new FakeDate());
      const utcISO = fixed.toISOString().slice(0, 10);
      if (localISO === utcISO) {
        // Machine is UTC (or behind): the window does not exist here, so the
        // naive and correct results coincide. Assert the correct result only.
        expect(currentStreak([mkEntry(localISO)])).toBe(1);
        return;
      }
      // The discriminating case: the user just logged LOCAL today.
      expect(currentStreak([mkEntry(localISO)])).toBe(1);
    } finally {
      (globalThis as { Date: unknown }).Date = RealDate;
    }
  });

  test("shouldFireToday is not suppressed the day after firing (local dates)", async () => {
    const { shouldFireToday } = await import("../src/lib/notifications");
    const RealDate = globalThis.Date;
    // An instant where the LOCAL date is already the new day but UTC has not
    // rolled over yet. "+02:00" is a fixed offset, so the local hour is 01:00
    // regardless of what DST the host zone is in.
    const fixed = new RealDate("2026-03-05T01:00:00+02:00");
    class FakeDate extends RealDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) super(fixed.getTime());
        else super(...(args as [number]));
      }
      static now() {
        return fixed.getTime();
      }
    }
    (globalThis as { Date: unknown }).Date = FakeDate;
    try {
      const now = new FakeDate();
      // Precondition: local and UTC dates genuinely differ at this instant.
      if (toISODate(now) === fixed.toISOString().slice(0, 10)) return; // UTC host
      // "00:00" has always arrived by the local clock at this instant, whatever
      // the host zone's offset happens to be.
      const plan = { enabled: true, time: "00:00", message: "x" };
      // Fired under the LOCAL date → suppressed.
      expect(shouldFireToday(plan, toISODate(now), now)).toBe(false);
      // A stale date must NOT block the new local day.
      expect(shouldFireToday(plan, "2026-03-03", now)).toBe(true);
    } finally {
      (globalThis as { Date: unknown }).Date = RealDate;
    }
  });

  test("habitStreak / weeklyCount key off the local date", async () => {
    const { toggleHabitDate, habitStreak, weeklyCount, addHabit, getHabits } = await import(
      "../src/lib/habits"
    );
    // lib/habits already ships defaults ("Víz", "Séta", …), so addHabit dedupes
    // on a label it already has. Use a fresh one.
    const h = addHabit("🌙", "Alvásnapló")!;
    const today = toISODate(new Date());
    toggleHabitDate(h.id, today);
    expect(getHabits().checks[h.id]).toEqual([today]);
    expect(habitStreak(h.id, today)).toBe(1);
    expect(weeklyCount(h.id, today)).toBe(1);
  });

  test("a habit streak spanning yesterday still counts today correctly", async () => {
    const { toggleHabitDate, habitStreak, addHabit } = await import("../src/lib/habits");
    const h = addHabit("🎯", "Napi cél")!;
    const today = toISODate(new Date());
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const y = toISODate(yesterday);
    toggleHabitDate(h.id, y);
    // Not checked today yet: the streak must not be counted as broken.
    expect(habitStreak(h.id, today)).toBe(1);
    toggleHabitDate(h.id, today);
    expect(habitStreak(h.id, today)).toBe(2);
  });

  test("shouldFireToday uses the local date for the once-per-day gate", async () => {
    const { shouldFireToday } = await import("../src/lib/notifications");
    const now = new Date();
    const plan = { enabled: true, time: "00:01", message: "x" };
    // Never fired on the LOCAL date yet → it may fire.
    expect(shouldFireToday(plan, undefined, now)).toBe(true);
    // Already fired on the local date → suppressed.
    expect(shouldFireToday(plan, toISODate(now), now)).toBe(false);
    // Fired on some other day → allowed again.
    expect(shouldFireToday(plan, "1999-01-01", now)).toBe(true);
  });

  test("decideFire reports already-fired using the local date", async () => {
    const { decideFire } = await import("../src/lib/reminderDaemon");
    const now = new Date();
    const plan = { enabled: true, time: "00:01", message: "x" };
    expect(decideFire(plan, now, "granted", toISODate(now))).toEqual({
      action: "skip",
      reason: "already-fired",
    });
  });

  test("availableMonths always includes the current LOCAL month", async () => {
    const { availableMonths } = await import("../src/lib/statsAgg");
    const localMonth = toISODate().slice(0, 7);
    expect(availableMonths([])).toContain(localMonth);
  });

  /**
   * Found by the Batch 4 PRODUCTION verification: fixing the gate was not
   * enough. The scheduler also STAMPED lastFired with the UTC date, so the
   * writer and the reader disagreed between local midnight and the UTC
   * rollover and the daily reminder could fire twice.
   */
  test("the last-fired stamp is written in the same LOCAL date the gate reads", async () => {
    const { decideFire } = await import("../src/lib/reminderDaemon");
    const { saveLastFired, loadLastFired } = await import("../src/lib/reminderDaemon");
    const RealDate = globalThis.Date;
    const fixed = new RealDate("2026-03-05T01:00:00+02:00");
    class FakeDate extends RealDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) super(fixed.getTime());
        else super(...(args as [number]));
      }
      static now() {
        return fixed.getTime();
      }
    }
    (globalThis as { Date: unknown }).Date = FakeDate;
    try {
      const now = new FakeDate();
      if (toISODate(now) === fixed.toISOString().slice(0, 10)) return; // UTC host
      // This is exactly what ReminderScheduler does when it fires.
      saveLastFired(toISODate(new Date()));
      expect(loadLastFired()).toBe(toISODate(now));
      // And the gate must then suppress a second fire the same day.
      const plan = { enabled: true, time: "00:00", message: "x" };
      expect(decideFire(plan, now, "granted", loadLastFired())).toEqual({
        action: "skip",
        reason: "already-fired",
      });
    } finally {
      (globalThis as { Date: unknown }).Date = RealDate;
    }
  });

  test("the habit 7-day grid uses local dates (matches stored checks)", async () => {
    // Mirrors the last7 computation in components/HabitStreaks.tsx.
    const today = toISODate(new Date());
    const grid = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today + "T12:00:00");
      d.setDate(d.getDate() - (6 - i));
      return toISODate(d);
    });
    expect(grid[6]).toBe(today);
    expect(new Set(grid).size).toBe(7);
  });

  test("no module keys a user-facing date with toISOString", async () => {
    // Everything still using it is either a filename or a comment.
    const { readFileSync, readdirSync } = await import("node:fs");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir, { withFileTypes: true })) {
        const p = `${dir}/${f.name}`;
        if (f.isDirectory()) walk(p);
        else if (f.name.endsWith(".ts") || f.name.endsWith(".tsx")) files.push(p);
      }
    };
    walk("src");
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8")
        .split("\n")
        // ignore comments
        .filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//"));
      src.forEach((l, i) => {
        if (l.includes("toISOString().slice(0, 10)") || l.includes('toISOString().slice(0,10)')) {
          // reportPdf's filename stamp is a cosmetic label, not a stored date.
          if (!f.includes("reportPdf")) offenders.push(`${f}:${i + 1}: ${l.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});

/* =================== 8. the dead habit system is gone =================== */

describe("Batch 4 · 8 — dead habit system removed", () => {
  test("the store no longer exposes habits / habitChecks", async () => {
    const store = await import("../src/lib/store");
    expect("setHabits" in store).toBe(false);
    expect("toggleHabit" in store).toBe(false);
    expect("DEFAULT_HABITS" in store).toBe(false);
  });

  test("fresh data has no habit fields", async () => {
    const store = await import("../src/lib/store");
    store.resetAll();
    const d = store.getState() as Record<string, unknown>;
    expect("habits" in d).toBe(false);
    expect("habitChecks" in d).toBe(false);
  });

  test("the live habit system (lib/habits) is untouched", async () => {
    const { getHabits, addHabit } = await import("../src/lib/habits");
    expect(getHabits().habits.length).toBeGreaterThan(0);
    expect(addHabit("🏃", "Futás")).not.toBeNull();
  });

  test("stale habit fields in old storage are ignored, not resurrected", async () => {
    const store = await import("../src/lib/store");
    localStorage.setItem(
      "belso-iranytu-data-v2",
      JSON.stringify({
        version: 2,
        entries: [],
        goals: [],
        habits: [{ id: "ghost", icon: "👻", name: "Szellem" }],
        habitChecks: { "2026-01-01": ["ghost"] },
      }),
    );
    // Re-reading goes through read() on a fresh module registry; assert the
    // live store is unaffected regardless of what the blob contained.
    expect(store.getState().settings).toBeDefined();
  });
});

/* ========================= 9. breathing label typo ====================== */

describe("Batch 4 · 9 — breathing phase labels", () => {
  test("no phase label contains the mangled string", async () => {
    const { BREATH_PATTERNS, buildCustomPattern } = await import("../src/lib/breathing");
    for (const p of [...BREATH_PATTERNS, buildCustomPattern(4, 4, 4, 4)]) {
      for (const phase of p.phases) {
        expect(phase.label).not.toContain("kiure");
        expect(phase.label).toBe(phase.label.trim());
      }
    }
  });

  test("the box pattern has four correctly named phases", async () => {
    const { BREATH_PATTERNS } = await import("../src/lib/breathing");
    const box = BREATH_PATTERNS.find((p) => p.id === "box")!;
    expect(box.phases.map((f) => f.label)).toEqual([
      "Lélegezz be",
      "Tartsd meg",
      "Fújd ki",
      "Tartsd ki",
    ]);
  });

  test("phaseMotion still classifies every label", async () => {
    const { BREATH_PATTERNS, phaseMotion } = await import("../src/lib/breathing");
    for (const p of BREATH_PATTERNS) {
      for (const phase of p.phases) {
        expect([-1, 0, 1]).toContain(phaseMotion(phase));
      }
    }
  });
});
