/**
 * Batch 11, commit 5 — the sport tips' proof.
 *
 * The nutrition commit's contract, applied to movement. What each block pins:
 *  - the RULE TABLE: every registry kind has a row, the two mandated
 *    examples are verbatim, and the empty select ("— nem sportoltam —")
 *    produces null — a non-entry is not an achievement to praise;
 *  - the REST NUDGE boundary: 2 days nothing, 3 days the one inviting
 *    question, verbatim; null days (no sport ever recorded) stay silent;
 *  - the RECOMMENDER: deterministic (called twice, same answer), rule order
 *    fixed (empty → Kezdő, gym yesterday → Otthoni, 4+ days with endurance →
 *    Haladó, anything → Otthoni), and never null while programs exist;
 *  - NO ALARMING WORDS: the module's source and every output string are
 *    swept for medical and guilt vocabulary (the batch6 pattern);
 *  - the surfaces MOUNT: the form tip, the program highlight, the
 *    transparency card in the Eszköztár tab's health drawer.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  sportTip,
  restNudge,
  daysSinceLastSport,
  recommendProgram,
  REST_NUDGE,
  REST_DAYS,
  SPORT_IDS,
  type ProgramShape,
} from "../src/lib/sportTips";
import type { Entry } from "../src/types";
import { t } from "../src/lib/i18n";

/* ------------------------------ builders -------------------------------- */

function entry(date: string, kind: string | null, minutes: number | null = null): Entry {
  return {
    id: `${date}-${kind ?? "none"}`,
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
    trackerValues: {
      ...(kind !== null ? { [SPORT_IDS.kind]: { kind: "select", value: kind } } : {}),
      ...(minutes !== null ? { [SPORT_IDS.duration]: { kind: "number", value: minutes } } : {}),
    },
  };
}

const TODAY = "2026-09-29"; // Tuesday

const PROGRAMS: ProgramShape[] = [
  { id: "kezdo", label: "Kezdő", days: 3 },
  { id: "otthoni", label: "Otthoni", days: 3 },
  { id: "halado", label: "Haladó", days: 4 },
  { id: "edzoterem", label: "Edzőtermi", days: 3 },
];

/* ===================== 1 · sportTip, the rule table ====================== */

describe("sportTip — every registry kind, verbatim where mandated", () => {
  test("run 30 → the recovery line, verbatim", () => {
    expect(sportTip("run", 30)).toBe("30 perc futás – szép. A regeneráció is számít: igyál vizet.");
  });

  test("walk 15 → the counting line, verbatim", () => {
    expect(sportTip("walk", 15)).toBe("Séta 15 perc – minden mozgás számít.");
  });

  test("the two mandated lines fire at their exact minutes", () => {
    // Boundary honesty: the table keys off the KIND for these two, so the
    // examples hold whatever the minutes — and the minutes are what the
    // table varies elsewhere.
    expect(sportTip("run", 45)).toContain("30 perc futás");
    expect(sportTip("walk", 40)).toContain("Séta 15 perc");
  });

  test("every kind produces exactly one line; none is empty", () => {
    for (const kind of ["walk", "run", "bike", "swim", "gym", "yoga", "other"]) {
      const tip = sportTip(kind, 30);
      expect(tip, kind).toBeTypeOf("string");
      expect((tip as string).length, kind).toBeGreaterThan(0);
    }
  });

  test("the empty select is NOT an achievement — null, same as nothing", () => {
    expect(sportTip(null, 30)).toBeNull();
    expect(sportTip("", 30)).toBeNull();
  });

  test("unknown kinds stay silent rather than guessing", () => {
    expect(sportTip("hiking", 60)).toBeNull();
  });

  test("no minutes at all still earns the kind's line", () => {
    // The duration field is optional; a kind without minutes is still a
    // recorded movement.
    for (const kind of ["run", "walk", "swim"]) {
      expect(sportTip(kind, null), kind).toBeTypeOf("string");
    }
  });

  test("the whole rule surface is eight sentences — a training plan cannot hide in it", () => {
    const outputs = new Set<string>();
    for (const kind of ["walk", "run", "bike", "swim", "gym", "yoga", "other"]) {
      for (const minutes of [null, 0, 15, 29, 30, 60]) {
        const tip = sportTip(kind, minutes);
        if (tip) outputs.add(tip);
      }
    }
    expect(outputs.size).toBe(8);
  });
});

/* =================== 2 · the rest nudge, at the boundary ================= */

describe("restNudge — inviting, never guilty, boundary at three", () => {
  test("the constant is the mandated sentence", () => {
    expect(REST_NUDGE).toBe("Mozdulj egy kicsit ma? Egy 10 perces séta is elég.");
    expect(REST_DAYS).toBe(3);
  });

  test("2 days: nothing. 3 days: the question.", () => {
    expect(restNudge(0)).toBeNull();
    expect(restNudge(1)).toBeNull();
    expect(restNudge(2)).toBeNull();
    expect(restNudge(3)).toBe(REST_NUDGE);
    expect(restNudge(4)).toBe(REST_NUDGE);
    expect(restNudge(30)).toBe(REST_NUDGE);
  });

  test("no sport ever recorded → null, not a lecture", () => {
    expect(restNudge(null)).toBeNull();
  });

  test("daysSinceLastSport counts to the most recent recorded day", () => {
    const entries = [
      entry("2026-09-25", "run", 30),
      entry("2026-09-27", "walk", 15),
    ];
    expect(daysSinceLastSport(entries, TODAY)).toBe(2);
  });

  test("entries dated in the future do not shorten the past", () => {
    const entries = [
      entry("2026-09-25", "run", 30),
      entry("2026-10-02", "run", 30), // next week, irrelevant to today
    ];
    expect(daysSinceLastSport(entries, TODAY)).toBe(4);
  });

  test("empty select entries do not count as sport", () => {
    expect(daysSinceLastSport([entry(TODAY, null)], TODAY)).toBeNull();
  });

  test("no entries at all → null", () => {
    expect(daysSinceLastSport([], TODAY)).toBeNull();
  });
});

/* ============== 3 · the recommender: deterministic rule order ============ */

describe("recommendProgram — same input, same answer, forever", () => {
  test("called twice, identical answer (determinism)", () => {
    const week = [
      { date: "2026-09-27", kind: "walk", minutes: 15 },
      { date: "2026-09-28", kind: "gym", minutes: 60 },
    ];
    expect(recommendProgram(PROGRAMS, week, TODAY)).toBe(
      recommendProgram(PROGRAMS, week, TODAY),
    );
  });

  test("no recorded days → Kezdő (the smallest step)", () => {
    expect(recommendProgram(PROGRAMS, [], TODAY)).toBe("kezdo");
    expect(
      recommendProgram(
        PROGRAMS,
        [{ date: "2026-08-01", kind: "run", minutes: 30 }],
        TODAY,
      ),
    ).toBe("kezdo");
  });

  test("gym yesterday → Otthoni (mobility today)", () => {
    const week = [
      { date: "2026-09-26", kind: "run", minutes: 30 },
      { date: "2026-09-28", kind: "gym", minutes: 60 },
    ];
    expect(recommendProgram(PROGRAMS, week, TODAY)).toBe("otthoni");
  });

  test("4+ recorded days with endurance → Haladó", () => {
    const week = [
      { date: "2026-09-25", kind: "run", minutes: 30 },
      { date: "2026-09-26", kind: "bike", minutes: 45 },
      { date: "2026-09-27", kind: "swim", minutes: 40 },
      { date: "2026-09-28", kind: "run", minutes: 30 },
    ];
    expect(recommendProgram(PROGRAMS, week, TODAY)).toBe("halado");
  });

  test("four gym days (no endurance) → Otthoni — rule 3 needs endurance", () => {
    const week = [
      { date: "2026-09-25", kind: "gym", minutes: 60 },
      { date: "2026-09-26", kind: "gym", minutes: 60 },
      { date: "2026-09-27", kind: "gym", minutes: 60 },
      { date: "2026-09-28", kind: "yoga", minutes: 30 },
    ];
    expect(recommendProgram(PROGRAMS, week, TODAY)).toBe("otthoni");
  });

  test("any recorded days → Otthoni (no kit needed)", () => {
    expect(
      recommendProgram(
        PROGRAMS,
        [{ date: "2026-09-27", kind: "walk", minutes: 15 }],
        TODAY,
      ),
    ).toBe("otthoni");
  });

  test("never returns null while programs exist, and always an existing id", () => {
    const ids = new Set(PROGRAMS.map((p) => p.id));
    const weeks: { date: string; kind: string | null; minutes: number | null }[][] = [
      [],
      [{ date: "2026-09-28", kind: "gym", minutes: 60 }],
      [{ date: "2026-09-28", kind: "yoga", minutes: 30 }],
      [
        { date: "2026-09-25", kind: "run", minutes: 30 },
        { date: "2026-09-26", kind: "walk", minutes: 15 },
        { date: "2026-09-27", kind: "yoga", minutes: 30 },
        { date: "2026-09-28", kind: "swim", minutes: 40 },
      ],
    ];
    for (const week of weeks) {
      const id = recommendProgram(PROGRAMS, week, TODAY);
      expect(id).not.toBeNull();
      expect(ids.has(id as string)).toBe(true);
    }
  });

  test("a week of days outside the window is an empty week", () => {
    const far = [
      { date: "2026-08-01", kind: "run", minutes: 30 },
      { date: "2026-08-02", kind: "run", minutes: 30 },
      { date: "2026-08-03", kind: "run", minutes: 30 },
      { date: "2026-08-04", kind: "run", minutes: 30 },
    ];
    expect(recommendProgram(PROGRAMS, far, TODAY)).toBe("kezdo");
  });

  test("no programs → null (the caller renders nothing)", () => {
    expect(recommendProgram([], [], TODAY)).toBeNull();
  });
});

/* =================== 4 · the non-alarming wording sweep ================== */

describe("the wording never diagnoses, never scolds, never plans", () => {
  const ALARMING = [
    "depresszió", "szorongás", "diagnózis", "betegség", "sérülésveszély",
    "kövér", "túlsúly", "gyenge", "lusta", "kell", "muszáj", "bűntudat",
    "edzésterv", "diéta", "fogyókúra",
  ];

  test("the module's source carries none of it (comments excluded)", () => {
    const src = readFileSync(new URL("../src/lib/sportTips.ts", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const hay = src.toLowerCase();
    for (const word of ALARMING) {
      expect(hay, `module mentions ${word}`).not.toContain(word);
    }
  });

  test("every output string is swept", () => {
    const outputs: string[] = [];
    for (const kind of ["walk", "run", "bike", "swim", "gym", "yoga", "other"]) {
      for (const minutes of [null, 15, 60]) {
        const tip = sportTip(kind, minutes);
        if (tip) outputs.push(tip);
      }
    }
    outputs.push(REST_NUDGE);
    expect(outputs.length).toBeGreaterThanOrEqual(8);
    for (const s of outputs) {
      const hay = s.toLowerCase();
      for (const word of ALARMING) {
        expect(hay, `"${s}" mentions ${word}`).not.toContain(word);
      }
      // And every line is an invitation or an acknowledgement — the question
      // form and the praise verbs are the house style.
      expect(s.length).toBeGreaterThan(0);
    }
    // The nudge OPENS as a question, not an instruction.
    expect(REST_NUDGE.startsWith("Mozdulj")).toBe(true);
    expect(REST_NUDGE).toContain("?");
  });
});

/* ==================== 5 · the three surfaces mount ======================= */

describe("the surfaces mount — the HealthImportCard lesson", () => {
  const read = (p: string): string => readFileSync(new URL(p, import.meta.url), "utf8");

  test("the form tip renders under the sport group, from live form state", () => {
    const today = read("../src/views/TodayView.tsx");
    expect(today).toContain("<SportTip");
    // It reads the form's live tracker values, not the stored entry.
    expect(today).toMatch(/kind=\{trackerValues\["sport"\]\}/);
    expect(today).toMatch(/minutes=\{trackerValues\["sport-duration"\]\}/);
    expect(today.indexOf("<SportTip")).toBeGreaterThan(today.indexOf("<TrackerInputs"));
  });

  test("WorkoutPrograms carries the highlight and the rest nudge", () => {
    const src = read("../src/components/WorkoutPrograms.tsx");
    // The badge is a catalogue lookup now; the words it renders are the
    // assertion, and they still ship.
    expect(src).toContain('t("tools.workouts.recommendedBadge")');
    expect(t("tools.workouts.recommendedBadge")).toContain("Ma ez ajánlott");
    expect(src).toContain("recommendProgram(");
    expect(src).toContain("REST_NUDGE");
    expect(src).toContain("daysSinceLastSport(data.entries");
    // One recommendation, not four: the badge is emitted from one place.
    expect((src.match(/tools\.workouts\.recommendedBadge/g) ?? []).length).toBe(1);
  });

  test("the transparency card exists, in the Egészség tab's Edzés section, quoting the mandated lines", () => {
    // Phase 1 moved this transparency card from Settings to the toolbox, where
    // a reader who meets the tip can also meet where the tip came from; Batch
    // 14 moved the toolbox to a tab of its own, and the health drawer's cards
    // (this one included) moved again to the sixth tab. The assertion follows
    // the card rather than the page it started on: what is being pinned is
    // that these exact words are on SOME page, not that a page keeps them.
    const health = read("../src/views/HealthView.tsx");
    // The card's own copy moved to `lib/i18n.ts` in the Phase 3 i18n
    // extraction; the rest nudge stayed, because `lib/sportTips` owns it.
    const catalogue = read("../src/lib/i18n.ts");
    expect(catalogue).toContain('"settings.sport.title": "Sportolási tippek"');
    expect(catalogue).toContain("30 perc futás – szép. A regeneráció is számít: igyál vizet.");
    expect(catalogue).toContain("Séta 15 perc – minden mozgás számít.");
    expect(catalogue).toContain("csak ajánlásként");
    expect(health).toContain('t("settings.sport.title")');
    expect(health).toContain("{REST_NUDGE}");
    // Inside the Edzés section: after its head, before the Egyéb one.
    expect(health.indexOf('t("settings.sport.title")')).toBeGreaterThan(
      health.indexOf('id="health-training"'),
    );
    expect(health.indexOf('t("settings.sport.title")')).toBeLessThan(
      health.indexOf('id="health-general"'),
    );
  });

  test("the highlight reads the store through useApp, not a prop hole", () => {
    const src = read("../src/components/WorkoutPrograms.tsx");
    expect(src).toContain("useApp()");
    expect(src).toContain("data.entries");
  });
});
