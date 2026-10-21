/**
 * Batch A — the recording flow's end-to-end data contract.
 *
 * The three steps are one conversation: a meter point, one emotion with an
 * intensity, any number of context selections — flattened into the exact
 * fields `saveEntry` stores. The store is evaluated FRESH per scenario
 * (cache-busted import, after seeding localStorage), which is the same
 * discipline tests/batch7-store.ts uses: `lib/store` reads localStorage once
 * at module-evaluation time, so a shared module cache would make these tests
 * pass without ever running the load path.
 *
 * Each fresh evaluation also runs the mood-v2 migration on the seeded
 * entries — so these tests exercise migration and the new flow against the
 * same store instance, which is the integration the batch asks for.
 */
import { describe, expect, test } from "bun:test";
import type { Entry, EntryContext, MoodQuadrant } from "../../src/types";
import { quadrantFromCoords } from "../../src/lib/quadrant";
import { emotionsForQuadrant } from "../../src/lib/emotion-vocab";
import { contextLabelsFor } from "../../src/lib/contextOptions";

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

function seed(entries: unknown[] = [], extra: Record<string, string> = {}) {
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
  for (const [k, v] of Object.entries(extra)) backing[k] = v;
}

/** A fresh store evaluation against exactly what was seeded. */
async function loadStore() {
  return import(`../../src/lib/store?flow=${Math.random()}`);
}

/** A minimal pre-Batch-A entry (mood only, no coordinates). */
function legacyEntry(mood: 1 | 2 | 3 | 4 | 5, date: string) {
  return {
    id: `e-${date}-${mood}`,
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
    createdAt: 1,
    updatedAt: 1,
  };
}

/** The exact shape RecordingFlow holds when its Save button fires. */
type FlowResult = {
  moodEnergy: number;
  pleasantness: number;
  quadrant: MoodQuadrant;
  emotion?: string;
  emotionIntensity?: number;
  context?: EntryContext;
};

/** The save payload the flow's onFinish produces, as TodayView will send it. */
function payloadFrom(result: FlowResult, date: string) {
  return {
    date,
    mood: 3 as const, // the fallback field stays written (old recorder default)
    moodEnergy: result.moodEnergy,
    pleasantness: result.pleasantness,
    quadrant: result.quadrant,
    emotion: result.emotion,
    emotionIntensity: result.emotionIntensity,
    context: result.context,
  };
}

describe("recording flow — step 1 to coordinates", () => {
  test("a marked point becomes the entry's coordinate pair and quadrant", async () => {
    seed();
    const { saveEntry, getState } = await loadStore();
    const result: FlowResult = { moodEnergy: 8, pleasantness: 7, quadrant: quadrantFromCoords(8, 7) };
    expect(result.quadrant).toBe("high-pos");
    saveEntry(payloadFrom(result, "2026-09-30"));
    const entry = getState().entries.find((e) => e.date === "2026-09-30");
    expect(entry?.moodEnergy).toBe(8);
    expect(entry?.pleasantness).toBe(7);
    expect(entry?.quadrant).toBe("high-pos");
  });

  test("each corner of the meter lands in its own quadrant", () => {
    expect(quadrantFromCoords(9, 2)).toBe("high-neg");
    expect(quadrantFromCoords(9, 9)).toBe("high-pos");
    expect(quadrantFromCoords(2, 2)).toBe("low-neg");
    expect(quadrantFromCoords(2, 9)).toBe("low-pos");
  });
});

describe("recording flow — step 2 emotion into the entry", () => {
  test("a default emotion and its intensity are stored", async () => {
    seed();
    const { saveEntry, getState } = await loadStore();
    const chosen = emotionsForQuadrant("low-neg", []).find((o) => o.id === "sad")!;
    saveEntry(
      payloadFrom(
        { moodEnergy: 3, pleasantness: 2, quadrant: "low-neg", emotion: chosen.label, emotionIntensity: 7 },
        "2026-09-30",
      ),
    );
    const entry = getState().entries.find((e) => e.date === "2026-09-30");
    expect(entry?.emotion).toBe("Szomorú");
    expect(entry?.emotionIntensity).toBe(7);
  });

  test("a custom emotion persists to the vocabulary and enters the cloud", async () => {
    seed();
    const { saveCustomEmotions, loadCustomEmotions, saveEntry, getState } = await loadStore();
    saveCustomEmotions([...loadCustomEmotions(), "kutyáim"]);
    expect(emotionsForQuadrant("low-pos", loadCustomEmotions()).some((o) => o.id === "kutyáim")).toBe(true);
    saveEntry(
      payloadFrom(
        { moodEnergy: 2, pleasantness: 8, quadrant: "low-pos", emotion: "kutyáim", emotionIntensity: 9 },
        "2026-09-30",
      ),
    );
    const entry = getState().entries.find((e) => e.date === "2026-09-30");
    expect(entry?.emotion).toBe("kutyáim");
    expect(JSON.parse(backing["belso-iranytu-emotion-vocab"])).toContain("kutyáim");
  });

  test("skip on step 2 leaves emotion fields absent, not empty strings", async () => {
    seed();
    const { saveEntry, getState } = await loadStore();
    saveEntry(payloadFrom({ moodEnergy: 5, pleasantness: 5, quadrant: "high-pos" }, "2026-09-30"));
    const entry = getState().entries.find((e) => e.date === "2026-09-30") as Entry;
    expect(entry.emotion).toBeUndefined();
    expect(entry.emotionIntensity).toBeUndefined();
  });
});

describe("recording flow — step 3 context into the entry", () => {
  test("multi-select labels from all three dimensions are stored", async () => {
    seed();
    const { saveEntry, getState } = await loadStore();
    const context: EntryContext = {
      withWhom: contextLabelsFor("withWhom", ["alone", "family"]),
      where: contextLabelsFor("where", ["home"]),
      doing: contextLabelsFor("doing", ["resting", "eating"]),
    };
    saveEntry(payloadFrom({ moodEnergy: 4, pleasantness: 6, quadrant: "low-pos", context }, "2026-09-30"));
    const entry = getState().entries.find((e) => e.date === "2026-09-30");
    expect(entry?.context?.withWhom).toEqual(["Egyedül", "Család"]);
    expect(entry?.context?.where).toEqual(["Otthon"]);
    expect(entry?.context?.doing).toEqual(["Pihenés", "Étkezés"]);
  });

  test("skip saves without a context key at all", async () => {
    seed();
    const { saveEntry, getState } = await loadStore();
    saveEntry(payloadFrom({ moodEnergy: 6, pleasantness: 3, quadrant: "high-neg" }, "2026-09-30"));
    const entry = getState().entries.find((e) => e.date === "2026-09-30") as Entry;
    expect(entry.context).toBeUndefined();
  });
});

describe("recording flow — migration meets the new flow", () => {
  test("a pre-Batch-A day gains coordinates; the new day keeps its own", async () => {
    seed([legacyEntry(5, "2026-09-28"), legacyEntry(1, "2026-09-29")]);
    const { saveEntry, getState } = await loadStore();

    const old = getState().entries.find((e) => e.date === "2026-09-28")!;
    expect(old.moodEnergy).toBe(8);
    expect(old.pleasantness).toBe(9);
    expect(old.quadrant).toBe("high-pos");

    saveEntry(payloadFrom({ moodEnergy: 2, pleasantness: 3, quadrant: "low-neg" }, "2026-09-30"));
    const fresh = getState().entries.find((e) => e.date === "2026-09-30")!;
    expect(fresh.moodEnergy).toBe(2);
    expect(fresh.quadrant).toBe("low-neg");
    expect(fresh.mood).toBe(3); // fallback field still written
  });
});

describe("recording flow — the whole three-step conversation", () => {
  test("meter + emotion + context land in one entry, old fields intact", async () => {
    seed();
    const { saveEntry, getState } = await loadStore();
    const result: FlowResult = {
      moodEnergy: 9,
      pleasantness: 8,
      quadrant: quadrantFromCoords(9, 8),
      emotion: emotionsForQuadrant("high-pos", []).find((o) => o.id === "excited")!.label,
      emotionIntensity: 8,
      context: {
        withWhom: contextLabelsFor("withWhom", ["friends"]),
        where: contextLabelsFor("where", ["outdoors"]),
        doing: contextLabelsFor("doing", ["sports"]),
      },
    };
    saveEntry({ ...payloadFrom(result, "2026-09-30"), stress: 3, note: "futás után" });
    const entry = getState().entries.find((e) => e.date === "2026-09-30")!;
    expect(entry.quadrant).toBe("high-pos");
    expect(entry.emotion).toBe("Izgatott");
    expect(entry.emotionIntensity).toBe(8);
    expect(entry.context?.doing).toEqual(["Sport"]);
    expect(entry.mood).toBe(3);
    expect(entry.stress).toBe(3);
    expect(entry.note).toBe("futás után");
  });

  test("a re-recorded day keeps one entry, updated in place", async () => {
    seed();
    const { saveEntry, getState } = await loadStore();
    saveEntry(payloadFrom({ moodEnergy: 2, pleasantness: 2, quadrant: "low-neg" }, "2026-09-30"));
    saveEntry(payloadFrom({ moodEnergy: 8, pleasantness: 8, quadrant: "high-pos" }, "2026-09-30"));
    const todays = getState().entries.filter((e) => e.date === "2026-09-30");
    expect(todays.length).toBe(1);
    expect(todays[0]!.quadrant).toBe("high-pos");
  });
});
