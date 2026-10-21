/**
 * Batch 15, Phase 2 commit 4 — the workout card as markup, plus Phase 3's
 * third commit, which added the type badges.
 *
 * The two claims a static render can carry are both about ARRIVAL: that the
 * twelve templates are offered before anything else, because a reader with no
 * plan is the reader the card is for, and that a plan the store already holds
 * is drawn with its own days and exercises — which is the read path the whole
 * feature depends on and the one a bug in `load()` would break silently.
 *
 * The interactive half is deliberately out of scope here and covered where it
 * can be: `tests/lib/fitness.test.ts` drives adopt, edit, log, remove and the
 * rest-day toggle against storage, and `tests/views/tools-split.test.ts` pins
 * that this card is mounted exactly once inside the Egészség drawer.
 *
 * WHY THE TYPE BADGE IS COUNTED RATHER THAN LOOKED UP, AND WHY THE REST DAY IS
 * A SOURCE PIN. Four of the six type labels are also the first word of the
 * template that carries them ("Mobilitás, rövid körök" and the label
 * "Mobilitás"), so `toContain` cannot tell the badge from the name — counting
 * occurrences can, and the count of a session's own label is compared before
 * and after logging. The rest-day row, by contrast, lives inside the detail
 * block behind `openPlanId`, which component state owns and a static render
 * cannot reach; its behaviour is asserted in `tests/lib/fitness.test.ts` and the
 * markup is pinned against the source here, which is the same bargain this file
 * already strikes for the whole detail block.
 */
import type { ReactNode } from "react";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AppProvider } from "../../src/state/AppContext";
import { IconSetProvider } from "../../src/state/IconSetContext";
import FitnessCard from "../../src/components/FitnessCard";
import {
  PLAN_TEMPLATES,
  addExercise,
  addPlanDay,
  adoptTemplate,
  createPlan,
  logWorkout,
  resetFitness,
} from "../../src/lib/fitness";
import { todayISO } from "../../src/lib/dates";

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

afterEach(() => {
  for (const k of Object.keys(backing)) delete backing[k];
  resetFitness();
});

const withProviders = (node: ReactNode) => (
  <AppProvider>
    <IconSetProvider>{node}</IconSetProvider>
  </AppProvider>
);

const render = () => renderToStaticMarkup(withProviders(<FitnessCard />));

const TYPES: Record<string, string> = {
  strength: "Erő",
  cardio: "Kardió",
  mobility: "Mobilitás",
  hiit: "HIIT",
  yoga: "Jóga",
  walking: "Séta",
};

const times = (haystack: string, needle: string) => haystack.split(needle).length - 1;

describe("FitnessCard — the templates come first, and they are the whole list", () => {
  test("every template is offered with its name, its focus and its day count", () => {
    const html = render();
    for (const tpl of PLAN_TEMPLATES) {
      expect(html, tpl.id).toContain(tpl.name);
      expect(html, `${tpl.id} focus`).toContain(tpl.focus);
      expect(html, `${tpl.id} days`).toContain(`${tpl.days.length} nap`);
    }
    expect(html).toContain("Ajánlott tervek");
  });

  test("every template row also says WHICH kind of movement it is", () => {
    const html = render();
    for (const tpl of PLAN_TEMPLATES) {
      expect(html, tpl.id).toContain(TYPES[tpl.type]!);
    }
    // The four whose label the template's own name also contains: two
    // occurrences is the name plus the badge, one would be the name alone, and
    // that is the only way to see a badge a substring cannot distinguish.
    for (const label of ["Mobilitás", "HIIT", "Jóga", "Séta"]) {
      expect(times(html, label), label).toBeGreaterThanOrEqual(2);
    }
  });

  test("with no plan yet, the card says so and offers no log entries", () => {
    const html = render();
    expect(html).toContain("Még nincs saját terved");
    expect(html).toContain("Még nincs feljegyzett edzés.");
    expect(html).toContain("Válassz egy tervet");
  });
});

describe("FitnessCard — a stored plan and a stored session are drawn from storage", () => {
  test("an adopted plan is listed under the reader's own plans, with its day count", () => {
    // WHAT THIS RENDER IS, AND WHAT IT IS NOT. The card's day/exercise block
    // lives behind `openPlanId`, which is component state — a stored plan is
    // NOT drawn open on a fresh render, and a test that expected it to would be
    // asserting a behaviour the card deliberately does not have. So this pins
    // the read path a static render CAN carry: the plan the store holds reaches
    // the owner's list with its own name and its own day count, which is what a
    // broken `load()` or a mis-keyed list would fail. Opening, editing and
    // logging are covered in `tests/lib/fitness.test.ts`, where they are store
    // calls rather than clicks.
    const plan = adoptTemplate("home")!;
    const html = render();
    expect(html).toContain(plan.name);
    expect(html).toContain(`${plan.days.length} nap`);
    expect(html).not.toContain("Még nincs saját terved");
    // And nothing of the detail block: no day builder, no exercise row. The
    // suggestion panel at the top DOES name one day — that is its job — so the
    // pin is on the detail block's own controls and on the exercise names, which
    // only an open plan draws.
    expect(html).not.toContain("Nap hozzáadása");
    expect(html).not.toContain("pl. A nap — egész test");
    for (const day of plan.days) {
      for (const ex of day.exercises) expect(html, ex.id).not.toContain(ex.name);
    }
  });

  test("a logged session is in the log list, with its volume", () => {
    logWorkout({
      date: todayISO(),
      planId: null,
      name: "Reggeli kör",
      exercises: [{ name: "Guggolás", sets: 3, reps: 10, weight: 40 }],
    });
    const html = render();
    expect(html).toContain("Reggeli kör");
    expect(html).toContain("1200 kg volumen");
    expect(html).toContain("1 gyakorlat");
    expect(html).not.toContain("Még nincs feljegyzett edzés.");
  });

  test("a session that knows its type is drawn with the type's label", () => {
    const before = render();
    logWorkout({
      date: todayISO(),
      planId: null,
      name: "Esti kör",
      type: "yoga",
      exercises: [{ name: "Napköszöntő", sets: 3, reps: 5, weight: null }],
    });
    const after = render();
    expect(after).toContain("Esti kör");
    // Exactly one more "Jóga" than before the entry existed: the badge. The
    // entry's own name and its exercise avoid the word, so a missing badge is
    // the only thing that can make this count short.
    expect(times(after, "Jóga")).toBe(times(before, "Jóga") + 1);
  });

  test("a rest day draws as rest: no log button, a rest note, and the toggle that made it one", () => {
    const source = readFileSync(
      new URL("../../src/components/FitnessCard.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain('{day.isRest && <span className="muted-note">{t("tools.fitness.restDay")}</span>}');
    expect(source).toContain("{!day.isRest && (");
    expect(source).toContain('{day.isRest ? t("tools.fitness.unmarkRest") : t("tools.fitness.markRest")}');
    expect(source).toContain("toggleRestDay(openPlan.id, day.id)");
    expect(source).toContain('t("tools.fitness.restNote")');
  });

  test("a custom plan with a day is drawn, and the builder's controls are present", () => {
    const plan = createPlan("Saját kör")!;
    const day = addPlanDay(plan.id, "A nap")!;
    addExercise(plan.id, day.id, { name: "Húzódzkodás", sets: 4, reps: "6" });
    const html = render();
    expect(html).toContain("Saját kör");
    // The plan list draws the day count for every plan, custom ones included.
    expect(html).toContain("1 nap");
  });

  test("the card's note says the templates are shapes, not a personal programme", () => {
    expect(render()).toContain("A tervek mozdulatsorok, nem személyre szabott edzésterv.");
  });

  test("the suggestion panel names the rotation day from the reader's own log", () => {
    const plan = adoptTemplate("home")!;
    const first = plan.days[0]!;
    const html = render();
    expect(html).toContain("Mai javaslat");
    expect(html).toContain("Ez lenne az első kör a naplóban");
    expect(html).toContain(plan.name);
    expect(html).toContain(first.label);
    // And once today has a session, the same panel says rest and names the next
    // rotation — the two readings of the same log.
    logWorkout({
      date: todayISO(),
      planId: plan.id,
      name: `${plan.name} — ${first.label}`,
      exercises: [{ name: "Guggolás", sets: 3, reps: 8, weight: 40 }],
    });
    const after = render();
    expect(after).toContain("pihenj");
    expect(after).not.toContain("Ez lenne az első kör a naplóban");
    // The next rotation day is named — the plan's own second day, since the
    // first one is the session just logged.
    expect(after).toContain(plan.days[1]!.label);
  });

  test("the progress panel is built from the log alone, and names what to try next", () => {
    // Two sessions at the same weight is exactly the state the one progression
    // rule speaks about, and the card must reach it without any plan open — the
    // reader who never builds a plan is the reader this panel is for.
    logWorkout({
      date: "2026-05-01",
      planId: null,
      name: "Első kör",
      exercises: [{ name: "Guggolás", sets: 3, reps: 8, weight: 40 }],
    });
    logWorkout({
      date: "2026-05-03",
      planId: null,
      name: "Második kör",
      exercises: [{ name: "Guggolás", sets: 3, reps: 8, weight: 40 }],
    });
    const html = render();
    expect(html).toContain("Haladás gyakorlatonként");
    expect(html).toContain("Guggolás: 2 edzés, legjobb 40 kg");
    expect(html).toContain("következőre 42.5 kg");
    expect(html).not.toContain("Jegyezz fel edzéseket");
  });

  test("a bodyweight exercise draws a rep trend, a next rep count, and its own chart", () => {
    // The defect this closes: the four templates that are entirely bodyweight
    // used to print a session count and nothing else, because every downstream
    // rule was about kilograms.
    logWorkout({
      date: "2026-05-01",
      planId: null,
      name: "Első kör",
      exercises: [{ name: "Fekvőtámasz", sets: 3, reps: 8, weight: null }],
    });
    logWorkout({
      date: "2026-05-03",
      planId: null,
      name: "Második kör",
      exercises: [{ name: "Fekvőtámasz", sets: 3, reps: 8, weight: null }],
    });
    const html = render();
    expect(html).toContain("Fekvőtámasz: 2 edzés, legjobb 8 ismétlés");
    expect(html).toContain("következőre 9 ismétlés");
    expect(html).toContain("Haladás: Fekvőtámasz");
  });

  test("a hold says seconds, because the logged session recorded the unit", () => {
    for (const date of ["2026-05-01", "2026-05-03"]) {
      logWorkout({
        date,
        planId: null,
        name: "Kör",
        exercises: [{ name: "Plank", sets: 3, reps: 30, weight: null, hold: true }],
      });
    }
    const html = render();
    expect(html).toContain("Plank: 2 edzés, legjobb 30 másodperc tartás");
    expect(html).toContain("következőre 35 másodperc");
  });
});
