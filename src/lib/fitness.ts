/**
 * Workout plans, the log, and progression (Batch 15, Phase 2 commit 2).
 *
 * WHAT THE APP ALREADY HAD, AND WHAT THIS ADDS
 * `components/WorkoutPrograms.tsx` holds four programs as EDITORIAL reading —
 * names, days, doses and a nutrition note beside each — and it keeps them. This
 * module is the other shape a reader asked for: plans they can OWN. A plan is
 * days, a day is exercises, an exercise is sets and reps and a weight, and the
 * log records what actually happened. The two sit next to each other on purpose:
 * the editorial programs answer "what could I do", this answers "what am I
 * doing", and neither is asked to do the other's job.
 *
 * THE TWELVE TEMPLATES ARE STARTING POINTS, NOT PRESCRIPTIONS
 * Beginner, advanced, home, gym, a three-day and a five-day split, cardio and
 * strength, and — since Phase 3's third commit — mobility, HIIT, yoga and a
 * walk. Each carries one of six `WORKOUT_TYPES`, so a template is not only a
 * shape but a KIND of movement: that is what the badge next to its name prints.
 * One list, every entry loadable into the reader's own plans with
 * one tap and editable afterwards. Adopting a template COPIES it: the reader
 * can rename it, drop a day, change a dose, and the template they copied stays
 * what it was. Nothing here is a training programme in the medical sense and
 * the module never claims to personalise anything — the card's own note says so.
 *
 * WHY THE LOG STORES WHAT WAS DONE, NOT WHAT WAS PLANNED
 * An entry carries the exercise names, sets, reps and weights AS RECORDED, and
 * only a `planId` for provenance. Reading the plan back at render time would
 * make yesterday's session change when today's plan is edited, which is the one
 * thing a log must never do. The cost is a few duplicated strings; the benefit
 * is that the log is a record.
 *
 * PROGRESSION IS COMPUTED, NEVER STORED
 * `progressionFor` walks the entries and returns the best weight, the sessions
 * that used the exercise and the trend between the last two of them, so a
 * reader can see "you lifted 40 kg twice" without the app keeping a counter.
 * `suggestNextWeight` is the one rule that reads it: same weight twice, then
 * 2.5 kg — and it says WHY, because a number with no reason behind it is
 * indistinguishable from a random one. A bodyweight exercise has no weight to
 * add and used to get nothing at all from that rule, which left the four
 * templates that are entirely bodyweight — mobility, HIIT, yoga and a walk —
 * with a session count and no trend. `suggestNextReps` is the twin: the same
 * reps twice, then one more rep, or five more seconds when the plan's dose says
 * the position is a HOLD rather than a count.
 *
 * PURE EXCEPT FOR STORAGE — the same split `lib/nutrition` and `lib/habits`
 * keep: the maths are functions over values, the store half is one module-level
 * state with a subscribe set and write-through persistence.
 */

/** One exercise inside a plan day. */
export type PlanExercise = {
  id: string;
  name: string;
  /** How many sets. 1–10. */
  sets: number;
  /** The rep target as the reader wrote it — "8", "8–10", "30 másodperc". */
  reps: string;
  /** Working weight in kg, or null for bodyweight. */
  weight: number | null;
};

/**
 * The kinds of movement a plan or a session can be (Phase 3, commit 3).
 *
 * Six, and the list is the content decision: the two the app already shipped
 * shapes for — strength and cardio — plus the three a reader asked for that are
 * movement without load (mobility, HIIT's short intervals, yoga) and the oldest
 * one of all (a walk). The label lives in the catalogue; the id is stored.
 */
export const WORKOUT_TYPES = ["strength", "cardio", "mobility", "hiit", "yoga", "walking"] as const;
export type WorkoutType = (typeof WORKOUT_TYPES)[number];

/** Narrowing guard for a value coming from storage or from outside the app. */
export function isWorkoutType(value: unknown): value is WorkoutType {
  return typeof value === "string" && (WORKOUT_TYPES as readonly string[]).includes(value);
}

/** One training day of a plan. */
export type PlanDay = {
  id: string;
  label: string;
  exercises: PlanExercise[];
  /**
   * True when the day is a REST day: a real day of the plan with nothing to do.
   *
   * It is a property of the day rather than a separate kind of day so that a
   * reader can turn training off and on again without losing the exercises they
   * had written; the rotation in `todaysSuggestion` skips rest days, because a
   * day that is never trained would otherwise always be the "least recently
   * trained" one and every suggestion would be a rest day.
   */
  isRest?: boolean;
};

/** A plan the reader owns: copied from a template or built from nothing. */
export type WorkoutPlan = {
  id: string;
  name: string;
  /** Which template it was copied from, for provenance. Absent when custom. */
  templateId?: string;
  days: PlanDay[];
  /** What kind of movement the plan is, copied from the template it came from. */
  type?: WorkoutType;
};

/** One exercise as it was actually performed. */
export type LogExercise = {
  name: string;
  sets: number;
  reps: number;
  weight: number | null;
  /**
   * True when the dose is a HOLD — the reps number is seconds, not a count.
   *
   * Recorded rather than left to the plan, because a number cannot say which
   * it is and a plan the reader later edits or deletes would change the unit
   * of a session that has already happened. Absent means a count, which is
   * also what every entry written before this field existed meant.
   */
  hold?: boolean;
};

/** One recorded session. */
export type WorkoutEntry = {
  id: string;
  date: string;
  /** The plan it came from, or null for a one-off. */
  planId: string | null;
  name: string;
  exercises: LogExercise[];
  /** What kind of movement the session was, when the plan it came from knew. */
  type?: WorkoutType;
};

export type FitnessStore = {
  plans: WorkoutPlan[];
  log: WorkoutEntry[];
};

/** Caps, so one key cannot grow forever. The log holds a bit over a year. */
export const MAX_PLANS = 20;
export const MAX_PLAN_DAYS = 14;
export const MAX_EXERCISES_PER_DAY = 20;
export const MAX_LOG_ENTRIES = 400;

/* ---------------------------- the templates ---------------------------- */

/** A template day, before ids exist — they are minted when it is adopted. */
type TemplateDay = { label: string; exercises: { name: string; sets: number; reps: string; weight: number | null }[] };

export type PlanTemplate = {
  id: string;
  name: string;
  /** Who it is for, in one line. Shown under the name in the picker. */
  focus: string;
  /** What kind of movement it is — one of the six `WORKOUT_TYPES`. */
  type: WorkoutType;
  days: TemplateDay[];
};

/**
 * The eight templates, and each one is a SHAPE rather than a schedule: the
 * days are labelled by what they train, not by weekdays, so a reader who trains
 * Tuesday–Thursday–Saturday adopts the three-day split and loses nothing.
 */
export const PLAN_TEMPLATES: PlanTemplate[] = [
  {
    id: "beginner",
    type: "strength",
    name: "Kezdő, heti 3 nap",
    focus: "Ha most kezded: teljes testes körök, egyszerű mozdulatokkal.",
    days: [
      {
        label: "A nap — egész test",
        exercises: [
          { name: "Guggolás saját súllyal", sets: 3, reps: "10", weight: null },
          { name: "Fekvőtámasz (térdre is)", sets: 3, reps: "6–10", weight: null },
          { name: "Evezés gumiszalaggal", sets: 3, reps: "10", weight: null },
          { name: "Plank", sets: 3, reps: "20 másodperc", weight: null },
        ],
      },
      {
        label: "B nap — egész test",
        exercises: [
          { name: "Kitörés váltott lábbal", sets: 3, reps: "8/láb", weight: null },
          { name: "Híd a hátadon", sets: 3, reps: "12", weight: null },
          { name: "Vállból nyomás", sets: 3, reps: "10", weight: 5 },
          { name: "Borjúemelés", sets: 2, reps: "15", weight: null },
        ],
      },
    ],
  },
  {
    id: "advanced",
    type: "strength",
    name: "Haladó, heti 4 nap",
    focus: "Rutinos edzőknek: nagyobb terhelés, felső-alsó bontásban.",
    days: [
      {
        label: "Alsó test — erő",
        exercises: [
          { name: "Guggolás rúddal", sets: 5, reps: "5", weight: 60 },
          { name: "Román felhúzás", sets: 4, reps: "8", weight: 70 },
          { name: "Kitörés", sets: 3, reps: "10/láb", weight: 20 },
          { name: "Vádli", sets: 4, reps: "12", weight: 40 },
        ],
      },
      {
        label: "Felső test — tolás",
        exercises: [
          { name: "Fekvenyomás", sets: 5, reps: "5", weight: 50 },
          { name: "Vállból nyomás", sets: 4, reps: "8", weight: 30 },
          { name: "Tárogatás", sets: 3, reps: "12", weight: 10 },
          { name: "Dipsz", sets: 3, reps: "8", weight: null },
        ],
      },
      {
        label: "Felső test — húzás",
        exercises: [
          { name: "Húzódzkodás", sets: 4, reps: "6", weight: null },
          { name: "Evezés rúddal", sets: 4, reps: "8", weight: 45 },
          { name: "Bicepsz", sets: 3, reps: "12", weight: 15 },
          { name: "Face pull", sets: 3, reps: "15", weight: 20 },
        ],
      },
      {
        label: "Alsó test — volumen",
        exercises: [
          { name: "Guggolás", sets: 4, reps: "10", weight: 50 },
          { name: "Hidraulikus gépi lábnyomás", sets: 4, reps: "12", weight: 80 },
          { name: "Csípőemelés", sets: 3, reps: "12", weight: 40 },
          { name: "Törzs", sets: 3, reps: "20", weight: null },
        ],
      },
    ],
  },
  {
    id: "home",
    type: "strength",
    name: "Otthoni, eszköz nélkül",
    focus: "Semmi felszerelés: saját testsúly, szék és fal.",
    days: [
      {
        label: "Otthon A",
        exercises: [
          { name: "Guggolás", sets: 3, reps: "15", weight: null },
          { name: "Fekvőtámasz", sets: 4, reps: "8–12", weight: null },
          { name: "Székes tricepsz", sets: 3, reps: "12", weight: null },
          { name: "Plank", sets: 3, reps: "30 másodperc", weight: null },
        ],
      },
      {
        label: "Otthon B",
        exercises: [
          { name: "Kitörés hátra", sets: 3, reps: "10/láb", weight: null },
          { name: "Híd", sets: 3, reps: "15", weight: null },
          { name: "Falnál guggolás", sets: 3, reps: "30 másodperc", weight: null },
          { name: "Superman", sets: 3, reps: "12", weight: null },
        ],
      },
    ],
  },
  {
    id: "gym",
    type: "strength",
    name: "Edzőtermi, heti 3 nap",
    focus: "Gépes és szabad súlyos kör: minden csoport hetente egyszer.",
    days: [
      {
        label: "Nap 1 — tolás",
        exercises: [
          { name: "Fekvenyomás", sets: 4, reps: "8", weight: 40 },
          { name: "Gépi vállnyomás", sets: 3, reps: "10", weight: 25 },
          { name: "Lábnyomás", sets: 4, reps: "10", weight: 80 },
          { name: "Tricepsz kötélen", sets: 3, reps: "12", weight: 20 },
        ],
      },
      {
        label: "Nap 2 — húzás",
        exercises: [
          { name: "Lehúzás gépen", sets: 4, reps: "10", weight: 45 },
          { name: "Evezés gépen", sets: 4, reps: "10", weight: 40 },
          { name: "Román felhúzás", sets: 3, reps: "8", weight: 50 },
          { name: "Bicepsz rúddal", sets: 3, reps: "12", weight: 15 },
        ],
      },
      {
        label: "Nap 3 — teljes test",
        exercises: [
          { name: "Guggolás", sets: 4, reps: "8", weight: 40 },
          { name: "Fekvenyomás", sets: 3, reps: "8", weight: 40 },
          { name: "Evezés", sets: 3, reps: "10", weight: 35 },
          { name: "Törzs", sets: 3, reps: "15", weight: null },
        ],
      },
    ],
  },
  {
    id: "three-day",
    type: "strength",
    name: "Heti 3 napos bontás",
    focus: "Alsó–felső–teljes test: heti három rövid, fókuszált edzés.",
    days: [
      {
        label: "Alsó test",
        exercises: [
          { name: "Guggolás", sets: 4, reps: "8", weight: 40 },
          { name: "Román felhúzás", sets: 3, reps: "10", weight: 40 },
          { name: "Kitörés", sets: 3, reps: "10/láb", weight: 10 },
        ],
      },
      {
        label: "Felső test",
        exercises: [
          { name: "Fekvenyomás", sets: 4, reps: "8", weight: 35 },
          { name: "Evezés", sets: 4, reps: "10", weight: 35 },
          { name: "Vállból nyomás", sets: 3, reps: "10", weight: 20 },
        ],
      },
      {
        label: "Teljes test",
        exercises: [
          { name: "Guggolás", sets: 3, reps: "10", weight: 35 },
          { name: "Fekvőtámasz", sets: 3, reps: "12", weight: null },
          { name: "Evezés", sets: 3, reps: "12", weight: 30 },
          { name: "Plank", sets: 3, reps: "40 másodperc", weight: null },
        ],
      },
    ],
  },
  {
    id: "five-day",
    type: "strength",
    name: "Heti 5 napos bontás",
    focus: "Egy izomcsoport naponta, több pihenővel a napok között.",
    days: [
      { label: "Mell", exercises: [{ name: "Fekvenyomás", sets: 4, reps: "8", weight: 40 }, { name: "Tárogatás", sets: 3, reps: "12", weight: 10 }, { name: "Dipsz", sets: 3, reps: "8", weight: null }] },
      { label: "Hát", exercises: [{ name: "Húzódzkodás", sets: 4, reps: "6", weight: null }, { name: "Evezés", sets: 4, reps: "10", weight: 40 }, { name: "Lehúzás", sets: 3, reps: "12", weight: 40 }] },
      { label: "Láb", exercises: [{ name: "Guggolás", sets: 4, reps: "8", weight: 45 }, { name: "Lábnyomás", sets: 4, reps: "12", weight: 80 }, { name: "Vádli", sets: 4, reps: "15", weight: 40 }] },
      { label: "Váll", exercises: [{ name: "Vállból nyomás", sets: 4, reps: "10", weight: 20 }, { name: "Oldalemelés", sets: 3, reps: "15", weight: 8 }, { name: "Face pull", sets: 3, reps: "15", weight: 20 }] },
      { label: "Kar és törzs", exercises: [{ name: "Bicepsz", sets: 3, reps: "12", weight: 15 }, { name: "Tricepsz", sets: 3, reps: "12", weight: 20 }, { name: "Törzs", sets: 3, reps: "20", weight: null }] },
    ],
  },
  {
    id: "cardio",
    type: "cardio",
    name: "Kardió, heti 3 nap",
    focus: "Szív-légzés körök: séta, kocogás és kerékpár, tempó szerint.",
    days: [
      {
        label: "Könnyű kör",
        exercises: [
          { name: "Séta", sets: 1, reps: "30 perc", weight: null },
          { name: "Nyújtás", sets: 1, reps: "5 perc", weight: null },
        ],
      },
      {
        label: "Tempós kör",
        exercises: [
          { name: "Kocogás", sets: 6, reps: "2 perc", weight: null },
          { name: "Séta pihenő", sets: 6, reps: "1 perc", weight: null },
        ],
      },
      {
        label: "Hosszú kör",
        exercises: [
          { name: "Kerékpár", sets: 1, reps: "45 perc", weight: null },
          { name: "Nyújtás", sets: 1, reps: "5 perc", weight: null },
        ],
      },
    ],
  },
  {
    id: "strength",
    type: "strength",
    name: "Erő, heti 3 nap",
    focus: "Kevés ismétlés, nagy súly: a három alapmozdulat körül.",
    days: [
      { label: "Guggolás nap", exercises: [{ name: "Guggolás", sets: 5, reps: "5", weight: 60 }, { name: "Kiegészítő láb", sets: 3, reps: "10", weight: 40 }] },
      { label: "Nyomás nap", exercises: [{ name: "Fekvenyomás", sets: 5, reps: "5", weight: 50 }, { name: "Vállból nyomás", sets: 3, reps: "8", weight: 25 }] },
      { label: "Húzás nap", exercises: [{ name: "Felhúzás", sets: 5, reps: "3", weight: 80 }, { name: "Evezés", sets: 4, reps: "8", weight: 45 }] },
    ],
  },
  // The four types this commit adds, and each is a SHAPE like the rest: days
  // labelled by what they work, not by weekdays.
  {
    id: "mobility",
    type: "mobility",
    name: "Mobilitás, rövid körök",
    focus: "Csípő, váll és gerinc — tíz perc, terhelés nélkül.",
    days: [
      { label: "Csípő", exercises: [{ name: "Guggolás tartásban", sets: 2, reps: "30 másodperc", weight: null }, { name: "Kilépő nyújtás", sets: 2, reps: "8 oldalanként", weight: null }] },
      { label: "Váll", exercises: [{ name: "Vállkörzés", sets: 2, reps: "10", weight: null }, { name: "Falnál nyomás", sets: 2, reps: "8", weight: null }] },
      { label: "Gerinc", exercises: [{ name: "Macska–tehén", sets: 2, reps: "10", weight: null }, { name: "Csavarodás ülésben", sets: 2, reps: "8 oldalanként", weight: null }] },
    ],
  },
  {
    id: "hiit",
    type: "hiit",
    name: "HIIT, rövid körök",
    focus: "Húsz perc saját súllyal — rövid munka, rövid szünet.",
    days: [
      { label: "Kör A", exercises: [{ name: "Guggolás ugrással", sets: 4, reps: "30 másodperc", weight: null }, { name: "Hegymászó", sets: 4, reps: "30 másodperc", weight: null }, { name: "Fekvőtámasz", sets: 4, reps: "30 másodperc", weight: null }] },
      { label: "Kör B", exercises: [{ name: "Kitörés váltva", sets: 4, reps: "30 másodperc", weight: null }, { name: "Plank", sets: 4, reps: "30 másodperc", weight: null }, { name: "Guggolás tartásban", sets: 4, reps: "30 másodperc", weight: null }] },
    ],
  },
  {
    id: "yoga",
    type: "yoga",
    name: "Jóga, nyugodt folyam",
    focus: "Lassú, tartott helyzetek — légzés és egyensúly.",
    days: [
      { label: "Reggeli folyam", exercises: [{ name: "Napköszöntő", sets: 3, reps: "5 kör", weight: null }, { name: "Harcos póz", sets: 2, reps: "30 másodperc oldalanként", weight: null }] },
      { label: "Esti folyam", exercises: [{ name: "Gyermekpóz", sets: 2, reps: "1 perc", weight: null }, { name: "Láb a falon", sets: 1, reps: "3 perc", weight: null }] },
      { label: "Egyensúly", exercises: [{ name: "Fa póz", sets: 2, reps: "30 másodperc oldalanként", weight: null }, { name: "Deszka tartás", sets: 2, reps: "30 másodperc", weight: null }] },
    ],
  },
  {
    id: "walking",
    type: "walking",
    name: "Séta, minden nap",
    focus: "Napi mozgás tempó nélkül — a legegyszerűbb kör.",
    days: [
      { label: "Rövid séta", exercises: [{ name: "Séta", sets: 1, reps: "20 perc", weight: null }] },
      { label: "Hosszú séta", exercises: [{ name: "Séta", sets: 1, reps: "45 perc", weight: null }] },
      { label: "Lépcsőzés", exercises: [{ name: "Lépcsőzés", sets: 5, reps: "2 perc", weight: null }] },
    ],
  },
];

/** The template with this id, or undefined. */
export function templateById(id: string): PlanTemplate | undefined {
  return PLAN_TEMPLATES.find((t) => t.id === id);
}

/* ------------------------------- the store ----------------------------- */

const KEY = "belso-iranytu-fitness-v1";

let state: FitnessStore = load();
const listeners = new Set<() => void>();

function newId(): string {
  return crypto.randomUUID();
}

function clampInt(n: unknown, min: number, max: number, fallback: number): number {
  return typeof n === "number" && Number.isFinite(n)
    ? Math.min(max, Math.max(min, Math.round(n)))
    : fallback;
}

/** One plan id plus one day label become a day with minted ids. */
function dayFromTemplate(day: TemplateDay): PlanDay {
  return {
    id: newId(),
    label: day.label.trim().slice(0, 30) || "Nap",
    exercises: day.exercises.slice(0, MAX_EXERCISES_PER_DAY).map((ex) => ({
      id: newId(),
      name: ex.name.slice(0, 40),
      sets: clampInt(ex.sets, 1, 10, 3),
      reps: ex.reps.slice(0, 20),
      weight: ex.weight === null ? null : clampInt(ex.weight, 0, 500, 0),
    })),
  };
}

function load(): FitnessStore {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { plans: [], log: [] };
    const parsed = JSON.parse(raw) as Partial<FitnessStore>;
    const plans: WorkoutPlan[] = Array.isArray(parsed.plans)
      ? parsed.plans
          .filter((p): p is WorkoutPlan => !!p && typeof p.name === "string" && Array.isArray(p.days))
          .slice(0, MAX_PLANS)
          .map((p) => ({
            id: typeof p.id === "string" ? p.id : newId(),
            name: p.name.slice(0, 40),
            ...(typeof p.templateId === "string" ? { templateId: p.templateId } : {}),
            ...(isWorkoutType(p.type) ? { type: p.type } : {}),
            days: p.days
              .filter((d): d is PlanDay => !!d && Array.isArray(d.exercises))
              .slice(0, MAX_PLAN_DAYS)
              .map((d) => ({
                id: typeof d.id === "string" ? d.id : newId(),
                label: String(d.label ?? "Nap").slice(0, 30),
                ...(d.isRest === true ? { isRest: true } : {}),
                exercises: d.exercises
                  .filter((e): e is PlanExercise => !!e && typeof e.name === "string")
                  .slice(0, MAX_EXERCISES_PER_DAY)
                  .map((e) => ({
                    id: typeof e.id === "string" ? e.id : newId(),
                    name: e.name.slice(0, 40),
                    sets: clampInt(e.sets, 1, 10, 3),
                    reps: String(e.reps ?? "").slice(0, 20),
                    weight: e.weight === null || e.weight === undefined ? null : clampInt(e.weight, 0, 500, 0),
                  })),
              })),
          }))
      : [];
    const log: WorkoutEntry[] = Array.isArray(parsed.log)
      ? parsed.log
          .filter((e): e is WorkoutEntry => !!e && typeof e.date === "string" && typeof e.name === "string")
          .slice(-MAX_LOG_ENTRIES)
          .map((e) => ({
            id: typeof e.id === "string" ? e.id : newId(),
            date: e.date,
            planId: typeof e.planId === "string" ? e.planId : null,
            ...(isWorkoutType(e.type) ? { type: e.type } : {}),
            name: e.name.slice(0, 40),
            exercises: Array.isArray(e.exercises)
              ? e.exercises
                  .filter((x): x is LogExercise => !!x && typeof x.name === "string")
                  .slice(0, MAX_EXERCISES_PER_DAY)
                  .map((x) => ({
                    name: x.name.slice(0, 40),
                    sets: clampInt(x.sets, 1, 20, 1),
                    reps: clampInt(x.reps, 0, 1000, 0),
                    weight: x.weight === null || x.weight === undefined ? null : clampInt(x.weight, 0, 500, 0),
                    ...(x.hold === true ? { hold: true } : {}),
                  }))
              : [],
          }))
      : [];
    return { plans, log };
  } catch {
    return { plans: [], log: [] };
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* in-memory only */
  }
}

function emit() {
  listeners.forEach((fn) => fn());
}

export function subscribeFitness(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getFitness(): FitnessStore {
  return state;
}

/* --------------------------- editing the plans -------------------------- */

/** Copy a template into the reader's own plans. Returns the new plan, or null. */
export function adoptTemplate(templateId: string): WorkoutPlan | null {
  const template = templateById(templateId);
  if (!template) return null;
  if (state.plans.length >= MAX_PLANS) return null;
  const plan: WorkoutPlan = {
    id: newId(),
    name: template.name.slice(0, 40),
    templateId: template.id,
    type: template.type,
    days: template.days.slice(0, MAX_PLAN_DAYS).map(dayFromTemplate),
  };
  state = { ...state, plans: [...state.plans, plan] };
  persist();
  emit();
  return plan;
}

/** An empty plan, for a reader building their own. */
export function createPlan(name: string): WorkoutPlan | null {
  const clean = name.trim().slice(0, 40);
  if (!clean) return null;
  if (state.plans.length >= MAX_PLANS) return null;
  const plan: WorkoutPlan = { id: newId(), name: clean, days: [] };
  state = { ...state, plans: [...state.plans, plan] };
  persist();
  emit();
  return plan;
}

export function deletePlan(planId: string) {
  const plans = state.plans.filter((p) => p.id !== planId);
  if (plans.length === state.plans.length) return;
  state = { ...state, plans };
  persist();
  emit();
}

function withPlan(planId: string, fn: (plan: WorkoutPlan) => WorkoutPlan) {
  const plans = state.plans.map((p) => (p.id === planId ? fn(p) : p));
  state = { ...state, plans };
  persist();
  emit();
}

/** Add a day to a plan. A blank label becomes "Nap". */
export function addPlanDay(planId: string, label: string): PlanDay | null {
  const plan = state.plans.find((p) => p.id === planId);
  if (!plan || plan.days.length >= MAX_PLAN_DAYS) return null;
  const day: PlanDay = { id: newId(), label: label.trim().slice(0, 30) || "Nap", exercises: [] };
  withPlan(planId, (p) => ({ ...p, days: [...p.days, day] }));
  return day;
}

export function removePlanDay(planId: string, dayId: string) {
  withPlan(planId, (p) => ({ ...p, days: p.days.filter((d) => d.id !== dayId) }));
}

/**
 * Mark a plan day as a rest day, or clear the mark. Returns the day, or null.
 *
 * Clearing DELETES the field rather than storing `false`, so the stored blob
 * holds only the days that are actually rest days — the same shape the loader's
 * repair expects, and the reason a hand-edited `isRest: "yes"` is dropped
 * instead of being believed. The exercises are untouched either way: a reader
 * who rests this week gets their day back exactly as they wrote it.
 */
export function toggleRestDay(planId: string, dayId: string): PlanDay | null {
  const current = state.plans.find((p) => p.id === planId)?.days.find((d) => d.id === dayId);
  if (!current) return null;
  const isRest = !current.isRest;
  withPlan(planId, (p) => ({
    ...p,
    days: p.days.map((d) => {
      if (d.id !== dayId) return d;
      if (isRest) return { ...d, isRest: true };
      const copy = { ...d };
      delete copy.isRest;
      return copy;
    }),
  }));
  return state.plans.find((p) => p.id === planId)?.days.find((d) => d.id === dayId) ?? null;
}

/** Add an exercise to a day. A blank name is refused rather than stored. */
export function addExercise(
  planId: string,
  dayId: string,
  input: { name: string; sets?: number; reps?: string; weight?: number | null },
): PlanExercise | null {
  const clean = input.name.trim().slice(0, 40);
  if (!clean) return null;
  const day = state.plans.find((p) => p.id === planId)?.days.find((d) => d.id === dayId);
  if (!day || day.exercises.length >= MAX_EXERCISES_PER_DAY) return null;
  const exercise: PlanExercise = {
    id: newId(),
    name: clean,
    sets: clampInt(input.sets ?? 3, 1, 10, 3),
    reps: (input.reps ?? "8–10").slice(0, 20),
    weight:
      input.weight === null || input.weight === undefined
        ? null
        : clampInt(input.weight, 0, 500, 0),
  };
  withPlan(planId, (p) => ({
    ...p,
    days: p.days.map((d) => (d.id === dayId ? { ...d, exercises: [...d.exercises, exercise] } : d)),
  }));
  return exercise;
}

export function removeExercise(planId: string, dayId: string, exerciseId: string) {
  withPlan(planId, (p) => ({
    ...p,
    days: p.days.map((d) =>
      d.id === dayId ? { ...d, exercises: d.exercises.filter((e) => e.id !== exerciseId) } : d,
    ),
  }));
}

/** Record a session: the exercises as performed, plus where they came from. */
export function logWorkout(entry: {
  date: string;
  planId: string | null;
  name: string;
  exercises: LogExercise[];
  type?: WorkoutType;
}): WorkoutEntry | null {
  if (!entry.exercises.length) return null;
  const recorded: WorkoutEntry = {
    id: newId(),
    date: entry.date,
    planId: entry.planId,
    ...(isWorkoutType(entry.type) ? { type: entry.type } : {}),
    name: entry.name.trim().slice(0, 40) || "Edzés",
    exercises: entry.exercises.slice(0, MAX_EXERCISES_PER_DAY),
  };
  const log = [...state.log, recorded].slice(-MAX_LOG_ENTRIES);
  state = { ...state, log };
  persist();
  emit();
  return recorded;
}

export function removeWorkout(entryId: string) {
  const log = state.log.filter((e) => e.id !== entryId);
  if (log.length === state.log.length) return;
  state = { ...state, log };
  persist();
  emit();
}

/* ------------------------------- the maths ----------------------------- */

/** One session's volume: sets × reps × weight, summed. Bodyweight counts 0. */
export function sessionVolume(entry: WorkoutEntry): number {
  return entry.exercises.reduce(
    (n, ex) => n + ex.sets * ex.reps * (ex.weight ?? 0),
    0,
  );
}

/** Sessions in the 7 days ending `todayIso`, inclusive. */
export function sessionsThisWeek(log: WorkoutEntry[], todayIso: string): number {
  const end = new Date(`${todayIso}T12:00:00`).getTime();
  if (Number.isNaN(end)) return 0;
  return log.filter((e) => {
    const at = new Date(`${e.date}T12:00:00`).getTime();
    if (Number.isNaN(at)) return false;
    const days = Math.round((end - at) / 86_400_000);
    return days >= 0 && days < 7;
  }).length;
}

/** Days since the most recent session, or null when there is none. */
export function daysSinceLastWorkout(log: WorkoutEntry[], todayIso: string): number | null {
  let best: number | null = null;
  const end = new Date(`${todayIso}T12:00:00`).getTime();
  for (const e of log) {
    const at = new Date(`${e.date}T12:00:00`).getTime();
    if (Number.isNaN(at) || at > end) continue;
    const days = Math.round((end - at) / 86_400_000);
    if (best === null || days < best) best = days;
  }
  return best;
}

export type Progression = {
  /** How many sessions recorded this exercise, by name. */
  sessions: number;
  /** The heaviest weight ever recorded for it, or null for bodyweight only. */
  best: number | null;
  /** The weight of the most recent session, null when it was bodyweight. */
  last: number | null;
  /** The reps of the most recent session. */
  lastReps: number | null;
  /** True when the last two sessions used the SAME weight. */
  repeated: boolean;
  /** The most reps ever recorded for it, or null when no session carried a count. */
  bestReps: number | null;
  /**
   * True when the last two sessions were BOTH bodyweight and used the SAME
   * reps — the state `suggestNextReps` reads. A weighted exercise never sets
   * it, because its own rule is about the weight and two rules firing at once
   * would be two answers to one question.
   */
  repeatedReps: boolean;
  /** Whether the most recent session recorded a HOLD (reps are seconds). */
  hold: boolean;
};

/**
 * What the log says about one exercise, matched by NAME (case-insensitive).
 *
 * Matching by name rather than by id is deliberate: an exercise id lives in one
 * plan, and the reader who renames a day or rebuilds a plan still means the
 * same lift. The cost is that two different exercises sharing a name share a
 * history — which is the right answer for "Guggolás".
 */
export function progressionFor(log: WorkoutEntry[], name: string): Progression {
  const wanted = name.trim().toLowerCase();
  const hits: LogExercise[] = [];
  for (const entry of log) {
    for (const ex of entry.exercises) {
      if (ex.name.trim().toLowerCase() === wanted) hits.push(ex);
    }
  }
  if (hits.length === 0) {
    return {
      sessions: 0,
      best: null,
      last: null,
      lastReps: null,
      repeated: false,
      bestReps: null,
      repeatedReps: false,
      hold: false,
    };
  }
  const weights = hits.map((h) => h.weight).filter((w): w is number => w !== null);
  const reps = hits
    .map((h) => h.reps)
    .filter((r): r is number => typeof r === "number" && Number.isFinite(r));
  const last = hits[hits.length - 1]!;
  const prev = hits[hits.length - 2];
  return {
    sessions: hits.length,
    best: weights.length ? Math.max(...weights) : null,
    last: last.weight,
    lastReps: last.reps,
    repeated: !!prev && prev.weight !== null && prev.weight === last.weight,
    bestReps: reps.length ? Math.max(...reps) : null,
    repeatedReps:
      !!prev &&
      prev.weight === null &&
      last.weight === null &&
      prev.reps === last.reps &&
      last.reps > 0,
    hold: last.hold === true,
  };
}

/**
 * Every exercise the log has seen, with its progression — the whole-log view.
 *
 * WHY THIS EXISTS BESIDE `progressionFor`
 * `progressionFor` answers about ONE name, which is what the plan builder needs
 * (it walks a plan's exercises). The reader who never opens a plan still wants
 * to know what they are progressing at, and the exercises they have actually
 * logged are the only honest answer: this walks the log newest-first, keeps the
 * FIRST spelling it met for each name (the one most recently written), and hands
 * back each name with its whole progression.
 *
 * The limit is a display cap, not a rule: a log with sixty exercises would
 * otherwise draw sixty rows, and the card wants the ones practised lately.
 * Order is by the most recent session that mentioned the exercise, so the top of
 * the list is what the reader touched last — not an alphabet nobody chose.
 */
export function progressionsFor(
  log: WorkoutEntry[],
  limit = 6,
): { name: string; progression: Progression }[] {
  const ordered = [...log].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const seen = new Map<string, string>();
  for (const entry of ordered) {
    for (const ex of entry.exercises) {
      const key = ex.name.trim().toLowerCase();
      if (key && !seen.has(key)) seen.set(key, ex.name.trim());
    }
  }
  return [...seen.values()]
    .slice(0, Math.max(0, Math.trunc(limit)))
    .map((name) => ({ name, progression: progressionFor(log, name) }));
}

/** How much weight the next session should add when the reps held. */
export const WEIGHT_STEP_KG = 2.5;

/**
 * The one progression rule: the same weight twice, then step up.
 *
 * Returns the weight to try next, or null when the log does not yet justify a
 * change — a first session, a bodyweight exercise, or a weight that has only
 * been used once. The rule is small on purpose: a bigger one would be a coach,
 * and this module deliberately is not one.
 */
export function suggestNextWeight(progression: Progression): number | null {
  if (!progression.repeated || progression.last === null) return null;
  return progression.last + WEIGHT_STEP_KG;
}

/** One more rep for a bodyweight exercise that held its reps twice. */
export const REP_STEP = 1;

/** Five more seconds for a hold that held twice — the same idea, a different unit. */
export const HOLD_STEP_SECONDS = 5;

/**
 * The reps twin of the rule above, for the exercises that carry no weight.
 *
 * Same reps twice, then one more rep — or five more seconds when the reader's
 * own dose says the exercise is a hold rather than a count. `hold` is the
 * caller's, because whether "30" means thirty reps or thirty seconds lives in
 * the PLAN's dose string, not in the log's number; a reader who typed
 * "30 másodperc" gets seconds and one who typed "30" gets reps. Returns null
 * for a weighted exercise, a first session, or a weight that never repeated —
 * the same "the log does not justify a change yet" answer as its twin.
 */
export function suggestNextReps(progression: Progression, hold = progression.hold): number | null {
  if (!progression.repeatedReps || progression.lastReps === null) return null;
  return progression.lastReps + (hold ? HOLD_STEP_SECONDS : REP_STEP);
}

/**
 * Read a dose string as the reader wrote it, into a number and whether it is a
 * hold.
 *
 * "8" and "8–10" are counts (the number is where the set STARTS, which is the
 * same reading `logDay` takes when it parses a dose to log it), "30 másodperc"
 * and "45 sec" are holds, and "10/láb" is a count of ten. Returns null for a
 * dose with no number in it, because the only honest next step for "amennyi
 * belefér" is none. The unit words cover the three languages the catalogue
 * ships, so a reader who wrote English does not get a rep count for a plank.
 */
export function parseRepsTarget(text: string): { hold: boolean; value: number } | null {
  const raw = text.trim().toLowerCase();
  if (!raw) return null;
  const match = /\d+(?:[.,]\d+)?/.exec(raw);
  if (!match) return null;
  const value = Number(match[0].replace(",", "."));
  if (!Number.isFinite(value) || value <= 0) return null;
  return { hold: /másodperc|perc|\bmp\b|\bsecs?\b|second|sekund/.test(raw), value };
}

/** What one exercise's history plots as: the unit, and the points, oldest first. */
export type ProgressSeries = {
  /** Kilograms for a loaded exercise, reps (or seconds) for a bodyweight one. */
  unit: "kg" | "reps";
  /** One point per session that recorded the exercise, oldest first. */
  points: { date: string; value: number }[];
};

/**
 * The chart series `progressionFor` describes in words.
 *
 * Same name matching, same newest-first log, one point per session — the
 * weight where the session had one, the rep count (or held seconds) where it
 * did not. The unit is decided by the MOST RECENT session, which is the one the
 * card's progression line is about; a log that changed from bodyweight to
 * loaded would then chart the later unit, which is the honest reading of a
 * change the reader made rather than a defect to hide.
 */
export function progressSeries(log: WorkoutEntry[], name: string): ProgressSeries {
  const wanted = name.trim().toLowerCase();
  const ordered = [...log].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const points: { date: string; value: number }[] = [];
  let lastWeighted = false;
  for (const entry of ordered) {
    for (const ex of entry.exercises) {
      if (ex.name.trim().toLowerCase() !== wanted) continue;
      const value = ex.weight ?? ex.reps;
      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) continue;
      points.push({ date: entry.date, value });
      lastWeighted = ex.weight !== null;
    }
  }
  return { unit: lastWeighted ? "kg" : "reps", points };
}

/**
 * What the reader's own data says today should be — a day, and why.
 *
 * THE WHOLE PERSONALISATION IS ONE ROTATION AND ONE RULE
 * There is no model here and nothing is inferred about the body: the suggestion
 * is the plan day the log has trained LEAST RECENTLY (or the first day of the
 * first plan when the log is empty), plus the one progression rule's next
 * weights for the exercises that have earned them. A day that was logged today
 * turns the suggestion into "rest" — the work is done — while still naming the
 * next rotation, because that is what the reader wants to see either way.
 *
 * WHY THE REASON IS STRUCTURED AND NOT A SENTENCE
 * `reason` is `first` or `rotation`, and `daysSince` is a number or null: the
 * card composes the sentence in the reader's language, and a module that baked
 * Hungarian prose would be a second place copy lives. The same split the rest of
 * this module keeps — the maths here, the words in the catalogue.
 *
 * Returning `null` is a real answer: with no plans, or with plans that hold no
 * days, there is nothing to suggest, and the card says that in its own line
 * rather than the module inventing a workout.
 */
export type TodaySuggestion = {
  planId: string;
  dayId: string;
  planName: string;
  dayLabel: string;
  /** Days since the last logged session, or null when nothing is logged yet. */
  daysSince: number | null;
  reason: "first" | "rotation";
  /** The exercises whose log justifies a next weight, in the day's own order. */
  weights: { name: string; kg: number }[];
  /**
   * The bodyweight exercises whose log justifies a next rep count, in the
   * day's own order — the twin list, so a day of mobility or yoga gets a next
   * step too. `hold` says whether the target counts reps or seconds, which it
   * reads from the plan's own dose string rather than from the log.
   */
  reps: { name: string; reps: number; hold: boolean }[];
  /** True when a session is already logged today — the day is done. */
  rest: boolean;
};

export function todaysSuggestion(store: FitnessStore, todayIso: string): TodaySuggestion | null {
  if (store.plans.length === 0) return null;
  const rest = store.log.some((e) => e.date === todayIso);
  // Rotation by the day's COMPOSED name, which is what `logDay` writes — the
  // only reliable link between a log entry and the day it came from, since the
  // entry deliberately stores what was done rather than a day id.
  let best: { planId: string; dayId: string; planName: string; dayLabel: string; last: string } | null =
    null;
  for (const plan of store.plans) {
    for (const day of plan.days) {
      // A rest day is a real day of the plan and never a suggestion: it cannot
      // be trained, so it can never stop being the least recently trained day.
      if (day.isRest) continue;
      const name = `${plan.name} — ${day.label}`;
      let last = "";
      for (const entry of store.log) {
        if (entry.name === name && entry.date > last) last = entry.date;
      }
      if (!best || last < best.last) {
        best = {
          planId: plan.id,
          dayId: day.id,
          planName: plan.name,
          dayLabel: day.label,
          last,
        };
      }
    }
  }
  if (!best) return null;
  const day = store.plans
    .find((p) => p.id === best!.planId)!
    .days.find((d) => d.id === best!.dayId)!;
  // One pass over the day's exercises, and the two rules take one side each:
  // an exercise the weight rule speaks about gets a kilogram target, and the
  // one it has nothing to say about (bodyweight) gets a rep or second target
  // instead. Never both, so the line under the day's name is one answer.
  const weights: { name: string; kg: number }[] = [];
  const reps: { name: string; reps: number; hold: boolean }[] = [];
  for (const ex of day.exercises) {
    const prog = progressionFor(store.log, ex.name);
    const kg = suggestNextWeight(prog);
    if (kg !== null) {
      weights.push({ name: ex.name, kg });
      continue;
    }
    const dose = parseRepsTarget(ex.reps);
    const nextReps = suggestNextReps(prog, dose?.hold ?? prog.hold);
    if (nextReps !== null) reps.push({ name: ex.name, reps: nextReps, hold: dose?.hold ?? prog.hold });
  }
  return {
    planId: best.planId,
    dayId: best.dayId,
    planName: best.planName,
    dayLabel: best.dayLabel,
    daysSince: daysSinceLastWorkout(store.log, todayIso),
    reason: store.log.length === 0 ? "first" : "rotation",
    weights,
    reps,
    rest,
  };
}

/** Sessions, newest first, as the log list draws them. */
export function recentWorkouts(log: WorkoutEntry[], limit = 8): WorkoutEntry[] {
  return [...log].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, limit);
}

/**
 * One sentence about the week, from the log alone — or nothing.
 *
 * The order is the rule, and the first matching line wins: no session yet gets
 * the invitation, a session in the last three days gets the acknowledgement,
 * and a week with none at all gets the gentle one. Nothing here counts calories,
 * prescribes a plan or implies a target; the same register `lib/sportTips`
 * keeps, in this module's own words.
 */
export function workoutIdea(log: WorkoutEntry[], todayIso: string): string | null {
  if (log.length === 0) {
    return "Válassz egy tervet, és jegyezd fel az első edzést — onnantól látod a haladást.";
  }
  const since = daysSinceLastWorkout(log, todayIso);
  if (since === null) return null;
  if (since <= 3) {
    const week = sessionsThisWeek(log, todayIso);
    return week >= 3
      ? `A héten ${week} edzés került a naplóba — szép ritmus.`
      : "Szép munka — a feljegyzésből látszik, hol tartasz.";
  }
  return "Néhány nap kimaradt. Egy könnyebb kör is felírható, és újraindítja a sorozatot.";
}

/**
 * Forget every plan and the whole log, in memory and in storage.
 *
 * Same reason `resetNutrition` exists: the store half of this module is a
 * module-level binding shared across a test run, and a file that adopts a plan
 * would otherwise hand it to the next file.
 */
export function resetFitness() {
  state = { plans: [], log: [] };
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* in-memory only */
  }
  emit();
}
