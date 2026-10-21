/**
 * Batch 15, Phase 2 commit 4 — plans, the log, and the one rule that reads it.
 *
 * THE PROPERTY THE WHOLE FILE IS BUILT AROUND: adopting a template COPIES it.
 * That is asserted from the side where it would break — after adopting, the
 * plan is edited (a day removed, an exercise added) and the TEMPLATE is
 * re-read to prove it did not move. A store that handed back the template's own
 * arrays would pass every test about "the plan has the days" and fail this one,
 * and the reader would discover it by editing one plan and losing another.
 *
 * THE LOG IS A RECORD, so the test that matters is the one about editability:
 * an entry stores what was done, and a later plan edit cannot change it. The
 * rest of the file is the arithmetic nobody can check by eye — volume,
 * `sessionsThisWeek` across a week boundary, `daysSinceLastWorkout` with a
 * future-dated entry in the blob, the repeated-weight rule that turns into a
 * 2.5 kg suggestion, and its bodyweight twin — the same reps twice, one more
 * rep, or five more seconds when the log recorded the dose as a hold.
 *
 * Progression matches by NAME (case-insensitively) rather than by id, and that
 * is pinned: two plans that both contain "Guggolás" share one history, which is
 * the answer a lifter expects and the one a reader of the log would give.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  MAX_EXERCISES_PER_DAY,
  MAX_PLAN_DAYS,
  HOLD_STEP_SECONDS,
  MAX_PLANS,
  PLAN_TEMPLATES,
  REP_STEP,
  WEIGHT_STEP_KG,
  WORKOUT_TYPES,
  addExercise,
  addPlanDay,
  adoptTemplate,
  createPlan,
  daysSinceLastWorkout,
  deletePlan,
  getFitness,
  logWorkout,
  parseRepsTarget,
  progressionFor,
  progressionsFor,
  progressSeries,
  recentWorkouts,
  removeExercise,
  removePlanDay,
  removeWorkout,
  resetFitness,
  sessionVolume,
  sessionsThisWeek,
  subscribeFitness,
  isWorkoutType,
  todaysSuggestion,
  toggleRestDay,
  suggestNextReps,
  suggestNextWeight,
  templateById,
  workoutIdea,
  type WorkoutEntry,
} from "../../src/lib/fitness";

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

const KEY = "belso-iranytu-fitness-v1";
const TODAY = "2026-10-07";
const YESTERDAY = "2026-10-06";
const LAST_WEEK = "2026-09-30";

beforeEach(() => {
  for (const k of Object.keys(backing)) delete backing[k];
  resetFitness();
});
afterEach(() => {
  for (const k of Object.keys(backing)) delete backing[k];
  resetFitness();
});

/* ------------------------------ the templates ---------------------------- */

describe("the twelve templates are shapes a reader can start from", () => {
  test("the twelve, with unique ids and at least one day each", () => {
    expect(PLAN_TEMPLATES.map((t) => t.id)).toEqual([
      "beginner",
      "advanced",
      "home",
      "gym",
      "three-day",
      "five-day",
      "cardio",
      "strength",
      "mobility",
      "hiit",
      "yoga",
      "walking",
    ]);
    for (const tpl of PLAN_TEMPLATES) {
      expect(tpl.days.length, tpl.id).toBeGreaterThan(0);
      expect(tpl.focus.trim(), tpl.id).not.toBe("");
      for (const day of tpl.days) {
        expect(day.label.trim(), tpl.id).not.toBe("");
        expect(day.exercises.length, `${tpl.id}/${day.label}`).toBeGreaterThan(0);
        for (const ex of day.exercises) {
          expect(ex.name.trim()).not.toBe("");
          expect(ex.sets).toBeGreaterThan(0);
          expect(ex.reps.trim()).not.toBe("");
        }
      }
    }
    expect(new Set(PLAN_TEMPLATES.map((t) => t.id)).size).toBe(PLAN_TEMPLATES.length);
    expect(templateById("nope")).toBeUndefined();
    expect(templateById("cardio")?.name).toContain("Kardió");
  });

  test("every template carries one of the six movement types, and the new four carry their own", () => {
    for (const tpl of PLAN_TEMPLATES) {
      expect(WORKOUT_TYPES, tpl.id).toContain(tpl.type);
    }
    expect(templateById("mobility")?.type).toBe("mobility");
    expect(templateById("hiit")?.type).toBe("hiit");
    expect(templateById("yoga")?.type).toBe("yoga");
    expect(templateById("walking")?.type).toBe("walking");
    expect(templateById("cardio")?.type).toBe("cardio");
    expect(templateById("beginner")?.type).toBe("strength");
    // And every type the app can name is actually reachable from a template:
    // a sixth type nothing carries would be a label with no content.
    expect(new Set(PLAN_TEMPLATES.map((t) => t.type))).toEqual(new Set(WORKOUT_TYPES));
  });
});

/* -------------------------- adopting and editing -------------------------- */

describe("a template is copied, and the copy is the reader's", () => {
  test("adopting mints its own ids rather than sharing the template's arrays", () => {
    const plan = adoptTemplate("beginner")!;
    expect(plan.templateId).toBe("beginner");
    expect(plan.days).toHaveLength(2);
    expect(plan.days[0]!.exercises.length).toBeGreaterThan(0);
    // A fresh id every time, so two adoptions of one template are two plans.
    const second = adoptTemplate("beginner")!;
    expect(second.id).not.toBe(plan.id);
    expect(second.days[0]!.id).not.toBe(plan.days[0]!.id);
  });

  test("editing the copy cannot move the template it came from", () => {
    const before = JSON.stringify(templateById("beginner"));
    const plan = adoptTemplate("beginner")!;
    removePlanDay(plan.id, plan.days[0]!.id);
    addPlanDay(plan.id, "Saját nap");
    addExercise(plan.id, plan.days[0]!.id, { name: "Húzódzkodás" });
    expect(JSON.stringify(templateById("beginner"))).toBe(before);
    expect(getFitness().plans.find((p) => p.id === plan.id)!.days).toHaveLength(2);
  });

  test("a plan can be built from nothing, and a blank name is refused", () => {
    expect(createPlan("   ")).toBeNull();
    const plan = createPlan("Reggeli kör")!;
    expect(plan.days).toEqual([]);
    const day = addPlanDay(plan.id, "")!;
    expect(day.label).toBe("Nap");
    expect(addExercise(plan.id, day.id, { name: "  " })).toBeNull();
    expect(addExercise(plan.id, day.id, { name: "Guggolás" })!.sets).toBe(3);
  });

  test("the caps hold: plans, days per plan, exercises per day", () => {
    for (let i = 0; i < MAX_PLANS; i++) expect(createPlan(`Terv ${i}`)).not.toBeNull();
    expect(createPlan("Egy terv túl sok")).toBeNull();
    const plan = getFitness().plans[0]!;
    for (let i = 0; i < MAX_PLAN_DAYS; i++) expect(addPlanDay(plan.id, `Nap ${i}`)).not.toBeNull();
    expect(addPlanDay(plan.id, "Túl sok")).toBeNull();
    const day = getFitness().plans[0]!.days[0]!;
    for (let i = 0; i < MAX_EXERCISES_PER_DAY; i++) {
      expect(addExercise(plan.id, day.id, { name: `Gyakorlat ${i}` })).not.toBeNull();
    }
    expect(addExercise(plan.id, day.id, { name: "Túl sok" })).toBeNull();
  });

  test("removing a plan removes exactly one, and a plan nobody knows is a no-op", () => {
    const a = createPlan("A")!;
    createPlan("B");
    deletePlan(a.id);
    expect(getFitness().plans.map((p) => p.name)).toEqual(["B"]);
    deletePlan("nope");
    expect(getFitness().plans).toHaveLength(1);
  });

  test("an exercise can be removed from its day and nowhere else", () => {
    const plan = adoptTemplate("three-day")!;
    const day = plan.days[0]!;
    const target = day.exercises[0]!;
    const otherDayCount = plan.days[1]!.exercises.length;
    removeExercise(plan.id, day.id, target.id);
    const after = getFitness().plans.find((p) => p.id === plan.id)!;
    expect(after.days[0]!.exercises.map((e) => e.id)).not.toContain(target.id);
    expect(after.days[1]!.exercises).toHaveLength(otherDayCount);
  });
});

/* ------------------------------- the log --------------------------------- */

describe("the log records what was done, and reads it back as numbers", () => {
  test("a session is stored whole, with its provenance and its doses", () => {
    const plan = adoptTemplate("strength")!;
    const entry = logWorkout({
      date: TODAY,
      planId: plan.id,
      name: "Erő — Guggolás nap",
      exercises: [{ name: "Guggolás", sets: 5, reps: 5, weight: 60 }],
    })!;
    const stored = JSON.parse(backing[KEY]!);
    expect(stored.log).toHaveLength(1);
    expect(stored.log[0].id).toBe(entry.id);
    expect(stored.log[0].weight).toBeUndefined();
    expect(stored.log[0].exercises[0].weight).toBe(60);
  });

  test("an empty session is refused rather than logged as a day off", () => {
    expect(logWorkout({ date: TODAY, planId: null, name: "Semmi", exercises: [] })).toBeNull();
    expect(getFitness().log).toHaveLength(0);
  });

  test("a logged session is not changed by a later plan edit", () => {
    const plan = createPlan("Saját")!;
    const day = addPlanDay(plan.id, "A nap")!;
    addExercise(plan.id, day.id, { name: "Guggolás", weight: 40 });
    logWorkout({
      date: TODAY,
      planId: plan.id,
      name: "Saját — A nap",
      exercises: [{ name: "Guggolás", sets: 3, reps: 8, weight: 40 }],
    });
    removePlanDay(plan.id, day.id);
    expect(getFitness().log[0]!.exercises).toHaveLength(1);
    expect(getFitness().log[0]!.exercises[0]!.weight).toBe(40);
  });

  test("volume is sets × reps × weight, and a bodyweight session is worth zero", () => {
    const withWeight: WorkoutEntry = {
      id: "1",
      date: TODAY,
      planId: null,
      name: "A",
      exercises: [
        { name: "Guggolás", sets: 3, reps: 10, weight: 40 },
        { name: "Plank", sets: 3, reps: 30, weight: null },
      ],
    };
    expect(sessionVolume(withWeight)).toBe(1200);
  });

  test("the recent list is newest first and stops at the limit", () => {
    for (const date of [LAST_WEEK, TODAY, YESTERDAY]) {
      logWorkout({ date, planId: null, name: date, exercises: [{ name: "Séta", sets: 1, reps: 30, weight: null }] });
    }
    expect(recentWorkouts(getFitness().log, 2).map((e) => e.date)).toEqual([TODAY, YESTERDAY]);
  });

  test("removing a session leaves the others, and subscribers hear both writes", () => {
    let heard = 0;
    const off = subscribeFitness(() => {
      heard += 1;
    });
    const first = logWorkout({
      date: TODAY,
      planId: null,
      name: "A",
      exercises: [{ name: "Séta", sets: 1, reps: 20, weight: null }],
    })!;
    logWorkout({
      date: YESTERDAY,
      planId: null,
      name: "B",
      exercises: [{ name: "Séta", sets: 1, reps: 20, weight: null }],
    });
    removeWorkout(first.id);
    expect(getFitness().log.map((e) => e.name)).toEqual(["B"]);
    expect(heard).toBe(3);
    off();
    removeWorkout("nope");
    expect(heard).toBe(3);
  });

  test("the week counter stops at seven days and ignores a future date", () => {
    const entries: WorkoutEntry[] = [
      { id: "1", date: TODAY, planId: null, name: "a", exercises: [] },
      { id: "2", date: YESTERDAY, planId: null, name: "b", exercises: [] },
      { id: "3", date: LAST_WEEK, planId: null, name: "c", exercises: [] },
      { id: "4", date: "2026-10-20", planId: null, name: "future", exercises: [] },
    ];
    expect(sessionsThisWeek(entries, TODAY)).toBe(2);
    expect(daysSinceLastWorkout(entries, TODAY)).toBe(0);
    expect(daysSinceLastWorkout([], TODAY)).toBeNull();
  });
});

/* ----------------------------- progression ------------------------------ */

describe("progression is computed from the log, by name", () => {
  const log: WorkoutEntry[] = [
    {
      id: "1",
      date: LAST_WEEK,
      planId: null,
      name: "A",
      exercises: [{ name: "Guggolás", sets: 5, reps: 5, weight: 40 }],
    },
    {
      id: "2",
      date: YESTERDAY,
      planId: null,
      name: "B",
      exercises: [{ name: "guggolás", sets: 5, reps: 5, weight: 40 }],
    },
  ];

  test("the name is matched case-insensitively, across plans and sessions", () => {
    const p = progressionFor(log, "GUGGOLÁS");
    expect(p.sessions).toBe(2);
    expect(p.best).toBe(40);
    expect(p.last).toBe(40);
  });

  test("an exercise nobody has logged reports zero sessions and no best", () => {
    expect(progressionFor(log, "Felhúzás")).toEqual({
      sessions: 0,
      best: null,
      last: null,
      lastReps: null,
      repeated: false,
      bestReps: null,
      repeatedReps: false,
      hold: false,
    });
  });

  test("two sessions at one weight step up by 2.5 kg, one session does not", () => {
    expect(suggestNextWeight(progressionFor(log, "Guggolás"))).toBe(40 + WEIGHT_STEP_KG);
    expect(suggestNextWeight(progressionFor(log.slice(0, 1), "Guggolás"))).toBeNull();
  });

  test("a bodyweight exercise never suggests a weight, but it does keep a rep trend", () => {
    const bodyweight: WorkoutEntry[] = [
      { id: "1", date: TODAY, planId: null, name: "A", exercises: [{ name: "Plank", sets: 3, reps: 30, weight: null }] },
      { id: "2", date: TODAY, planId: null, name: "B", exercises: [{ name: "Plank", sets: 3, reps: 30, weight: null }] },
    ];
    const p = progressionFor(bodyweight, "Plank");
    expect(p.sessions).toBe(2);
    expect(p.best).toBeNull();
    expect(p.bestReps).toBe(30);
    expect(suggestNextWeight(p)).toBeNull();
  });

  test("the reps twin: the same reps twice steps up one rep, once does not", () => {
    const twice: WorkoutEntry[] = [
      { id: "1", date: LAST_WEEK, planId: null, name: "A", exercises: [{ name: "Fekvőtámasz", sets: 3, reps: 8, weight: null }] },
      { id: "2", date: YESTERDAY, planId: null, name: "B", exercises: [{ name: "Fekvőtámasz", sets: 3, reps: 8, weight: null }] },
    ];
    expect(suggestNextReps(progressionFor(twice, "Fekvőtámasz"))).toBe(8 + REP_STEP);
    expect(suggestNextReps(progressionFor(twice.slice(0, 1), "Fekvőtámasz"))).toBeNull();
    // Different reps is not the state the rule speaks about.
    const varied: WorkoutEntry[] = [
      { id: "1", date: LAST_WEEK, planId: null, name: "A", exercises: [{ name: "Fekvőtámasz", sets: 3, reps: 8, weight: null }] },
      { id: "2", date: YESTERDAY, planId: null, name: "B", exercises: [{ name: "Fekvőtámasz", sets: 3, reps: 10, weight: null }] },
    ];
    expect(suggestNextReps(progressionFor(varied, "Fekvőtámasz"))).toBeNull();
  });

  test("a weighted exercise is the weight rule's, and never the reps rule's", () => {
    const p = progressionFor(log, "Guggolás");
    expect(p.repeatedReps).toBe(false);
    expect(suggestNextReps(p)).toBeNull();
    expect(suggestNextWeight(p)).toBe(40 + WEIGHT_STEP_KG);
  });

  test("a hold adds five seconds, and the log is what says it is a hold", () => {
    const hold: WorkoutEntry[] = [
      { id: "1", date: LAST_WEEK, planId: null, name: "A", exercises: [{ name: "Plank", sets: 3, reps: 30, weight: null, hold: true }] },
      { id: "2", date: YESTERDAY, planId: null, name: "B", exercises: [{ name: "Plank", sets: 3, reps: 30, weight: null, hold: true }] },
    ];
    const p = progressionFor(hold, "Plank");
    expect(p.hold).toBe(true);
    expect(p.repeatedReps).toBe(true);
    // Default reads the log's own unit; an explicit override still wins.
    expect(suggestNextReps(p)).toBe(30 + HOLD_STEP_SECONDS);
    expect(suggestNextReps(p, false)).toBe(30 + REP_STEP);
    // The same numbers WITHOUT the flag are reps, and the entry without it
    // means a count — which is what every pre-existing log entry meant.
    const noFlag = hold.map((e) => ({
      ...e,
      exercises: e.exercises.map((ex) => ({ ...ex, hold: undefined })),
    }));
    expect(progressionFor(noFlag, "Plank").hold).toBe(false);
    expect(suggestNextReps(progressionFor(noFlag, "Plank"))).toBe(30 + REP_STEP);
  });
});

describe("the dose string says whether a number is reps or seconds", () => {
  test("a count is read as a count, the range at its start", () => {
    expect(parseRepsTarget("8")).toEqual({ hold: false, value: 8 });
    expect(parseRepsTarget("8–10")).toEqual({ hold: false, value: 8 });
    expect(parseRepsTarget("10/láb")).toEqual({ hold: false, value: 10 });
  });

  test("a hold is read as a hold, in the three languages the catalogue ships", () => {
    expect(parseRepsTarget("30 másodperc")).toEqual({ hold: true, value: 30 });
    expect(parseRepsTarget("45 sec")).toEqual({ hold: true, value: 45 });
    expect(parseRepsTarget("40 Sekunden")).toEqual({ hold: true, value: 40 });
  });

  test("a dose with no number is nothing, not zero", () => {
    expect(parseRepsTarget("")).toBeNull();
    expect(parseRepsTarget("amennyi belefér")).toBeNull();
    expect(parseRepsTarget("0")).toBeNull();
  });
});

describe("the chart series is the progression as points", () => {
  const rows: WorkoutEntry[] = [
    { id: "1", date: "2026-05-01", planId: null, name: "A", exercises: [{ name: "Guggolás", sets: 3, reps: 8, weight: 40 }] },
    { id: "2", date: "2026-05-03", planId: null, name: "B", exercises: [{ name: "Guggolás", sets: 3, reps: 8, weight: 42.5 }] },
  ];

  test("a loaded exercise plots its weights, oldest first, and the unit is kg", () => {
    expect(progressSeries(rows, "GUGGOLÁS")).toEqual({
      unit: "kg",
      points: [
        { date: "2026-05-01", value: 40 },
        { date: "2026-05-03", value: 42.5 },
      ],
    });
  });

  test("a bodyweight exercise plots its reps, and an unknown name plots nothing", () => {
    const bodyweight: WorkoutEntry[] = [
      { id: "1", date: "2026-05-01", planId: null, name: "A", exercises: [{ name: "Napköszöntő", sets: 3, reps: 5, weight: null }] },
      { id: "2", date: "2026-05-03", planId: null, name: "B", exercises: [{ name: "Napköszöntő", sets: 3, reps: 6, weight: null }] },
    ];
    expect(progressSeries(bodyweight, "Napköszöntő")).toEqual({
      unit: "reps",
      points: [
        { date: "2026-05-01", value: 5 },
        { date: "2026-05-03", value: 6 },
      ],
    });
    expect(progressSeries(bodyweight, "Nincs ilyen")).toEqual({ unit: "reps", points: [] });
  });
});

/* ---------------------------- the suggestion ---------------------------- */

describe("the whole log's progression view — names by recency, each with its own history", () => {
  const day = (d: string, exercises: { name: string; sets: number; reps: number; weight: number | null }[]) =>
    logWorkout({ date: d, planId: null, name: "Kör", exercises });

  test("an empty log has nothing to show, and that is not an error", () => {
    expect(progressionsFor([])).toEqual([]);
  });

  test("names come back most recently practised first, one row each, first spelling kept", () => {
    day("2026-05-01", [
      { name: "Guggolás", sets: 3, reps: 8, weight: 40 },
      { name: "Plank", sets: 3, reps: 1, weight: null },
    ]);
    day("2026-05-03", [{ name: "GUGGOLÁS", sets: 3, reps: 8, weight: 42.5 }]);
    const rows = progressionsFor(getFitness().log);
    // Guggolás was practised most recently, so it leads; Plank follows; and the
    // two spellings of the squat are ONE row, spelled as the latest session wrote
    // it, with both sessions in its history.
    expect(rows.map((r) => r.name)).toEqual(["GUGGOLÁS", "Plank"]);
    expect(rows[0]!.progression.sessions).toBe(2);
    expect(rows[0]!.progression.best).toBe(42.5);
  });

  test("each row is the same progression `progressionFor` gives that name", () => {
    day("2026-05-01", [{ name: "Evezés", sets: 3, reps: 10, weight: 30 }]);
    day("2026-05-02", [{ name: "Evezés", sets: 3, reps: 10, weight: 30 }]);
    const rows = progressionsFor(getFitness().log);
    expect(rows[0]!.progression).toEqual(progressionFor(getFitness().log, "Evezés"));
    expect(suggestNextWeight(rows[0]!.progression)).toBe(32.5);
  });

  test("the display cap holds, and a silly limit is not a crash", () => {
    for (let i = 0; i < 9; i += 1) {
      day(`2026-05-0${i + 1}`, [{ name: `Gyakorlat ${i}`, sets: 1, reps: 1, weight: 10 }]);
    }
    expect(progressionsFor(getFitness().log)).toHaveLength(6);
    expect(progressionsFor(getFitness().log, 3)).toHaveLength(3);
    expect(progressionsFor(getFitness().log, 0)).toEqual([]);
  });
});

describe("movement types and rest days", () => {
  test("a plan copies its template's type, a custom plan has none, and the log keeps what it is given", () => {
    const plan = adoptTemplate("yoga")!;
    expect(plan.type).toBe("yoga");
    expect(createPlan("Saját kör")!.type).toBeUndefined();
    const entry = logWorkout({
      date: "2026-05-04",
      planId: plan.id,
      name: `${plan.name} — ${plan.days[0]!.label}`,
      type: plan.type,
      exercises: [{ name: "Napköszöntő", sets: 3, reps: 5, weight: null }],
    })!;
    expect(entry.type).toBe("yoga");
    // An id the app does not know is dropped rather than stored (and the entry
    // itself is still recorded — the type is a label, not a rule).
    const odd = logWorkout({
      date: "2026-05-04",
      planId: null,
      name: "Vegyes",
      type: "zumba" as never,
      exercises: [{ name: "Séta", sets: 1, reps: 20, weight: null }],
    })!;
    expect(odd.type).toBeUndefined();
  });

  test("a rest day stays in the plan, keeps its exercises, and takes no part in the rotation", () => {
    const plan = adoptTemplate("home")!;
    const first = plan.days[0]!;
    const toggled = toggleRestDay(plan.id, first.id)!;
    expect(toggled.isRest).toBe(true);
    // The exercises are untouched: turning rest off again must restore the day
    // exactly as it was written.
    expect(toggled.exercises).toHaveLength(first.exercises.length);
    expect(getFitness().plans[0]!.days[0]!.isRest).toBe(true);
    // The rotation cannot pick a day that is never trained.
    const s = todaysSuggestion(getFitness(), "2026-05-04")!;
    expect(s.dayLabel).not.toBe(first.label);
    // Clearing deletes the field rather than storing false.
    const cleared = toggleRestDay(plan.id, first.id)!;
    expect(cleared.isRest).toBeUndefined();
    expect("isRest" in getFitness().plans[0]!.days[0]!).toBe(false);
    expect(toggleRestDay(plan.id, "no-such-day")).toBeNull();
  });

  test("the guard takes the six ids and nothing else", () => {
    for (const id of WORKOUT_TYPES) expect(isWorkoutType(id)).toBe(true);
    for (const value of ["zumba", "", "Strength", null, undefined, 5, {}]) {
      expect(isWorkoutType(value), String(value)).toBe(false);
    }
  });
});

describe("today's suggestion is the reader's own log, read back as one day", () => {
  const today = "2026-05-04";

  test("with no plans, or plans that hold no days, there is nothing to suggest", () => {
    expect(todaysSuggestion(getFitness(), today)).toBeNull();
    createPlan("Üres terv");
    expect(todaysSuggestion(getFitness(), today)).toBeNull();
  });

  test("an empty log suggests the first day of the first plan, and says it is the first", () => {
    const plan = adoptTemplate("home")!;
    const s = todaysSuggestion(getFitness(), today)!;
    expect(s.reason).toBe("first");
    expect(s.daysSince).toBeNull();
    expect(s.rest).toBe(false);
    expect(s.planId).toBe(plan.id);
    expect(s.planName).toBe(plan.name);
    expect(s.dayLabel).toBe(plan.days[0]!.label);
    expect(s.weights).toEqual([]);
  });

  test("the day trained least recently comes round again, by the composed name the log writes", () => {
    const plan = adoptTemplate("home")!;
    const first = plan.days[0]!;
    logWorkout({
      date: "2026-05-01",
      planId: plan.id,
      name: `${plan.name} — ${first.label}`,
      exercises: first.exercises.map((ex) => ({
        name: ex.name,
        sets: ex.sets,
        reps: 8,
        weight: ex.weight,
      })),
    });
    const s = todaysSuggestion(getFitness(), today)!;
    expect(s.reason).toBe("rotation");
    expect(s.dayLabel).not.toBe(first.label);
    expect(s.daysSince).toBe(3);
  });

  test("a session already logged today turns the suggestion into rest, and still names the next day", () => {
    const plan = adoptTemplate("home")!;
    const first = plan.days[0]!;
    logWorkout({
      date: today,
      planId: plan.id,
      name: `${plan.name} — ${first.label}`,
      exercises: [{ name: "Guggolás", sets: 3, reps: 8, weight: 40 }],
    });
    const s = todaysSuggestion(getFitness(), today)!;
    expect(s.rest).toBe(true);
    expect(s.daysSince).toBe(0);
    expect(s.dayLabel).not.toBe(first.label);
  });

  test("the suggested day carries a next weight only where the rule earns one", () => {
    const plan = createPlan("Egy nap")!;
    const day = addPlanDay(plan.id, "Erő")!;
    addExercise(plan.id, day.id, { name: "Guggolás", sets: 3, reps: "8", weight: 40 });
    addExercise(plan.id, day.id, { name: "Plank", sets: 3, reps: "60 mp", weight: null });
    for (const date of ["2026-05-01", "2026-05-02"]) {
      logWorkout({
        date,
        planId: plan.id,
        name: `${plan.name} — ${day.label}`,
        exercises: [
          { name: "Guggolás", sets: 3, reps: 8, weight: 40 },
          { name: "Plank", sets: 3, reps: 60, weight: null },
        ],
      });
    }
    const s = todaysSuggestion(getFitness(), today)!;
    expect(s.weights).toEqual([{ name: "Guggolás", kg: 42.5 }]);
    // The same day's bodyweight exercise earns the twin target, and the plan's
    // own dose says the unit: "60 mp" is a hold, so the next step is seconds.
    expect(s.reps).toEqual([{ name: "Plank", reps: 65, hold: true }]);
  });

  test("a bodyweight day carries a next rep count, with the plan's unit", () => {
    const plan = createPlan("Nap")!;
    const day = addPlanDay(plan.id, "Nap")!;
    addExercise(plan.id, day.id, { name: "Fekvőtámasz", sets: 3, reps: "8", weight: null });
    for (const date of ["2026-05-01", "2026-05-02"]) {
      logWorkout({
        date,
        planId: plan.id,
        name: `${plan.name} — ${day.label}`,
        exercises: [{ name: "Fekvőtámasz", sets: 3, reps: 8, weight: null }],
      });
    }
    const s = todaysSuggestion(getFitness(), today)!;
    expect(s.weights).toEqual([]);
    expect(s.reps).toEqual([{ name: "Fekvőtámasz", reps: 9, hold: false }]);
  });
});

describe("the workout idea says one true thing about the week", () => {
  test("an empty log invites the first entry", () => {
    expect(workoutIdea([], TODAY)).toContain("első edzést");
  });

  test("a session within three days is acknowledged, with the week's count", () => {
    const one: WorkoutEntry[] = [
      { id: "1", date: YESTERDAY, planId: null, name: "a", exercises: [] },
    ];
    expect(workoutIdea(one, TODAY)).toContain("Szép munka");
    const three: WorkoutEntry[] = [TODAY, YESTERDAY, "2026-10-05"].map((date, i) => ({
      id: String(i),
      date,
      planId: null,
      name: "a",
      exercises: [],
    }));
    expect(workoutIdea(three, TODAY)).toContain("3 edzés");
  });

  test("a quiet week gets the gentle line and no count of days missed", () => {
    const old: WorkoutEntry[] = [
      { id: "1", date: LAST_WEEK, planId: null, name: "a", exercises: [] },
    ];
    const text = workoutIdea(old, TODAY)!;
    expect(text).toContain("Néhány nap kimaradt");
    expect(text).not.toContain("7");
  });
});

/* ------------------------------- the store ------------------------------- */

describe("the fitness blob survives being written, read back and corrupted", () => {
  test("a plan and a session persist together under one key", () => {
    const plan = adoptTemplate("home")!;
    logWorkout({
      date: TODAY,
      planId: plan.id,
      name: "Otthon A",
      exercises: [{ name: "Guggolás", sets: 3, reps: 15, weight: null }],
    });
    const stored = JSON.parse(backing[KEY]!);
    expect(stored.plans).toHaveLength(1);
    expect(stored.log).toHaveLength(1);
  });

  test("a blob that is not an object loads as an empty store", async () => {
    for (const blob of ["[]", '"x"', "3", "not json"]) {
      backing[KEY] = blob;
      const cold = await import(`../../src/lib/fitness?repair-${encodeURIComponent(blob)}`);
      expect(cold.getFitness()).toEqual({ plans: [], log: [] });
    }
  });

  test("a repairable blob keeps its plans, its days and its sessions", async () => {
    backing[KEY] = JSON.stringify({
      plans: [
        {
          id: "p1",
          name: "Saját",
          days: [
            {
              id: "d1",
              label: "A nap",
              exercises: [
                { id: "e1", name: "Guggolás", sets: "nonsense", reps: "8", weight: 40 },
                { id: "e2", name: 5 },
              ],
            },
            { id: "d2", exercises: "not an array" },
          ],
        },
        "not a plan",
      ],
      log: [
        { id: "l1", date: TODAY, name: "A", exercises: [{ name: "Guggolás", sets: 5, reps: 5, weight: 40 }] },
        { name: "no date" },
      ],
    });
    const cold = await import("../../src/lib/fitness?repair-partial");
    const store = cold.getFitness();
    expect(store.plans).toHaveLength(1);
    expect(store.plans[0].days).toHaveLength(1);
    expect(store.plans[0].days[0].exercises).toHaveLength(1);
    expect(store.plans[0].days[0].exercises[0].sets).toBe(3); // the fallback
    expect(store.log).toHaveLength(1);
    expect(store.log[0].planId).toBeNull();
  });

  test("a type the app does not know is dropped, a known one survives, and a rest mark is only ever `true`", async () => {
    // The shape a hand-edited key can take: an id that was never in
    // `WORKOUT_TYPES`, and the string "yes" where the code asks for a boolean.
    backing[KEY] = JSON.stringify({
      plans: [
        {
          id: "p1",
          name: "Idegen",
          type: "zumba",
          days: [{ id: "d1", label: "Nap", isRest: "yes", exercises: [] }],
        },
        {
          id: "p2",
          name: "Jóga",
          type: "yoga",
          days: [{ id: "d2", label: "Nap", isRest: true, exercises: [] }],
        },
      ],
      log: [
        { id: "l1", date: TODAY, name: "Vegyes", type: "zumba", exercises: [] },
        { id: "l2", date: TODAY, name: "Jóga", type: "yoga", exercises: [] },
      ],
    });
    const cold = await import("../../src/lib/fitness?repair-types");
    const store = cold.getFitness();
    // The unknown id is gone rather than stored as a string the card would then
    // try to look up in its label map.
    expect(store.plans[0]!.type).toBeUndefined();
    expect(store.plans[1]!.type).toBe("yoga");
    expect(store.plans[0]!.days[0]!.isRest).toBeUndefined();
    expect(store.plans[1]!.days[0]!.isRest).toBe(true);
    expect(store.log[0]!.type).toBeUndefined();
    expect(store.log[1]!.type).toBe("yoga");
  });
});
