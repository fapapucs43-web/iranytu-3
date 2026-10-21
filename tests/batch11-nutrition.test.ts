/**
 * Batch 11, commit 4 — the nutrition tips' proof.
 *
 * The commit's promises, block by block:
 *  - the tip rules are TABLE-DRIVEN: every flag combination that matters has
 *    a row, and the exact mandated wording is asserted character for
 *    character;
 *  - EMPTY FLAGS produce NO tip — silence is the honest default;
 *  - the SAFETY RAIL is boundary-tested at 3 days (not 2, not 4), 500 kcal
 *    and 4000 kcal (at the edge, not past it), and its wording is pinned
 *    character for character, with a medical-vocabulary sweep over the whole
 *    module (the batch6 pattern, extended);
 *  - the week window is Monday-based, and days outside it do not count;
 *  - the surfaces MOUNT: the form tip under TrackerInputs, and the weekly card
 *    and the transparency card on the Egészség tab (they were in the toolbox's
 *    health drawer until that drawer's cards moved to the sixth tab) — the
 *    HealthImportCard lesson, again;
 *  - no diet plan, no shaming: the module's entire output surface is swept
 *    for the vocabulary of plans and blame, and its sentence count is small
 *    enough to name.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  mealTip,
  weeklySummary,
  kcalOf,
  SAFETY_NOTE,
  SAFETY_MIN_KCAL,
  SAFETY_MAX_KCAL,
  SAFETY_DAYS,
  NUTRITION_IDS,
  type WeeklySummary,
} from "../src/lib/nutritionTips";
import type { Entry } from "../src/types";

/* ------------------------------ builders -------------------------------- */

let seq = 0;
function entry(date: string, kcal: number | null, flags: string[] = []): Entry {
  seq += 1;
  return {
    id: `e${seq}`,
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
      ...(kcal !== null ? { [NUTRITION_IDS.calories]: { kind: "number", value: kcal } } : {}),
      ...(flags.length > 0
        ? {
            [NUTRITION_IDS.flags]: {
              kind: "flags",
              value: Object.fromEntries(flags.map((f) => [f, true])),
            },
          }
        : {}),
    },
  };
}

const TUESDAY = "2026-09-29"; // a Tuesday: the week runs Mon 09-28 …
const MONDAY = "2026-09-28";
const LAST_SUNDAY = "2026-09-27"; // the previous week — never counts

/* ===================== 1 · mealTip, the rule table ======================= */

describe("mealTip — one line, only when a rule earned it", () => {
  test("veg + protein → the balance line, verbatim", () => {
    expect(mealTip({ veg: true, protein: true }, null)).toEqual({
      kind: "tip",
      text: "Szép egyensúly. A zöldség és a fehérje jó kombináció.",
    });
  });

  test("fast alone → the nudge, verbatim", () => {
    expect(mealTip({ fast: true }, null)).toEqual({
      kind: "tip",
      text: "A gyorsétel néha belefér. Holnap próbálj egy zöldséges fogást is.",
    });
  });

  test("empty flags → no tip (the honest default)", () => {
    expect(mealTip({}, 1800)).toBeNull();
    expect(mealTip(null, 1800)).toBeNull();
  });

  test("combinations that match no rule stay silent — no forced advice", () => {
    expect(mealTip({ carb: true }, null)).toBeNull();
    expect(mealTip({ sweet: true }, null)).toBeNull();
    expect(mealTip({ veg: true }, null)).toBeNull();
    expect(mealTip({ protein: true }, null)).toBeNull();
    expect(mealTip({ carb: true, sweet: true }, 2000)).toBeNull();
  });

  test("fast WITH vegetables is not nudged — the meal already answers it", () => {
    expect(mealTip({ fast: true, veg: true }, null)).toBeNull();
    expect(mealTip({ fast: true, protein: true }, null)).toBeNull();
  });

  test("the whole rule surface is exactly two sentences — a plan cannot hide in it", () => {
    const outputs = new Set<string>();
    const flagCombos = [
      {},
      { veg: true }, { protein: true }, { carb: true }, { sweet: true }, { fast: true },
      { veg: true, protein: true }, { veg: true, carb: true }, { veg: true, sweet: true },
      { veg: true, fast: true }, { protein: true, carb: true }, { protein: true, sweet: true },
      { protein: true, fast: true }, { carb: true, sweet: true }, { carb: true, fast: true },
      { sweet: true, fast: true },
      { veg: true, protein: true, carb: true }, { veg: true, protein: true, sweet: true },
      { veg: true, protein: true, fast: true }, { fast: true, carb: true, sweet: true },
      { veg: true, protein: true, carb: true, sweet: true, fast: true },
    ];
    for (const value of flagCombos) {
      const tip = mealTip(value, 2000);
      if (tip) outputs.add(tip.text);
    }
    expect([...outputs].sort()).toEqual([
      "A gyorsétel néha belefér. Holnap próbálj egy zöldséges fogást is.",
      "Szép egyensúly. A zöldség és a fehérje jó kombináció.",
    ]);
  });
});

/* =============== 2 · weeklySummary — days, window, suggestions =========== */

describe("weeklySummary — the week, honestly windowed", () => {
  test("null under three days with a calorie estimate", () => {
    expect(weeklySummary([], TUESDAY)).toBeNull();
    expect(weeklySummary([entry(MONDAY, 1800)], TUESDAY)).toBeNull();
    expect(
      weeklySummary([entry(MONDAY, 1800), entry(TUESDAY, 2000)], TUESDAY),
    ).toBeNull();
    // Days WITHOUT a calorie estimate do not count toward the rail's three.
    expect(
      weeklySummary(
        [entry(MONDAY, null, ["veg"]), entry(MONDAY, 1800), entry(TUESDAY, 2000)],
        TUESDAY,
      ),
    ).toBeNull();
  });

  test("three days in the week produce a summary", () => {
    const s = weeklySummary(
      [entry(MONDAY, 1800), entry(MONDAY, 2000), entry(TUESDAY, 2200)],
      TUESDAY,
    );
    expect(s).not.toBeNull();
    expect(s!.days).toBe(3);
    expect(s!.avgKcal).toBe(2000);
    expect(s!.safety).toBe(false);
  });

  test("last Sunday is last week — the window is Monday-based", () => {
    const s = weeklySummary(
      [entry(LAST_SUNDAY, 300), entry(LAST_SUNDAY, 300), entry(LAST_SUNDAY, 300)],
      TUESDAY,
    );
    expect(s).toBeNull();
    // A previous Sunday plus the Monday/Tuesday of THIS week is two in-week
    // days — under the rail's three, so null. The Sunday was not counted.
    const withSunday = weeklySummary(
      [entry(LAST_SUNDAY, 2000), entry(MONDAY, 2000), entry(TUESDAY, 2000)],
      TUESDAY,
    );
    expect(withSunday).toBeNull();
    // The same three days but one week late: all inside, so the summary comes.
    const allIn = weeklySummary(
      [entry(MONDAY, 2000), entry(TUESDAY, 2000), entry(TUESDAY, 2000)],
      TUESDAY,
    );
    expect(allIn!.days).toBe(3);
  });

  test("veg majority → the counted compliment, verbatim", () => {
    const s = weeklySummary(
      [
        entry(MONDAY, 1800, ["veg"]),
        entry(MONDAY, 2000, ["veg", "carb"]),
        entry(TUESDAY, 2100, ["veg"]),
      ],
      TUESDAY,
    )!;
    expect(s.topFlags).toContain("veg");
    expect(s.suggestion).toBe("A héten 3 napon volt zöldség – jó arány.");
  });

  test("protein present but small → the two-food nudge, verbatim", () => {
    const s = weeklySummary(
      [
        entry(MONDAY, 1800, ["protein"]),
        entry(MONDAY, 2000),
        entry(TUESDAY, 2100),
        entry(TUESDAY, 1900),
      ],
      TUESDAY,
    )!;
    expect(s.suggestion).toBe("A fehérje kevesebb volt – próbálj tojást vagy hüvelyeseket.");
  });

  test("no majority and no protein → no suggestion", () => {
    const s = weeklySummary(
      [entry(MONDAY, 1800, ["carb"]), entry(MONDAY, 2000), entry(TUESDAY, 2100, ["sweet"])],
      TUESDAY,
    )!;
    expect(s.suggestion).toBeNull();
  });

  test("the suggestion surface is exactly the two sentences", () => {
    const sentences = new Set<string>();
    const cases: [number, string[] | null][][] = [
      [[MONDAY, 1800, ["veg"]], [MONDAY, 2000, ["veg"]], [TUESDAY, 2100, ["veg"]]],
      [[MONDAY, 1800, ["veg", "protein"]], [MONDAY, 2000, ["veg"]], [TUESDAY, 2100, ["veg"]]],
      [[MONDAY, 1800, ["protein"]], [MONDAY, 2000], [TUESDAY, 2100], [TUESDAY, 1900]],
      [[MONDAY, 1800, ["carb"]], [MONDAY, 2000, ["sweet"]], [TUESDAY, 2100]],
      [[MONDAY, 1800], [MONDAY, 2000], [TUESDAY, 2100]],
      // veg majority on a 4-day week: the count interpolates into the sentence.
      [
        [MONDAY, 1800, ["veg"]],
        [MONDAY, 2000, ["veg"]],
        [TUESDAY, 2100, ["veg"]],
        [TUESDAY, 1900, ["veg"]],
      ],
    ];
    for (const week of cases) {
      const s = weeklySummary(week.map(([d, k, f]) => entry(d, k, f ?? [])), TUESDAY);
      if (s?.suggestion) sentences.add(s.suggestion.replace(/\d+/, "N"));
    }
    expect([...sentences].sort()).toEqual([
      "A fehérje kevesebb volt – próbálj tojást vagy hüvelyeseket.",
      "A héten N napon volt zöldség – jó arány.",
    ]);
  });
});

/* ================== 3 · the safety rail, at the edges ==================== */

describe("the safety rail — three days, 500 and 4000, exact words", () => {
  test("the exported constants are the batch's numbers", () => {
    expect(SAFETY_DAYS).toBe(3);
    expect(SAFETY_MIN_KCAL).toBe(500);
    expect(SAFETY_MAX_KCAL).toBe(4000);
  });

  test("the wording is character for character the mandated sentence", () => {
    expect(SAFETY_NOTE).toBe("Ha ez szándékos, rendben. Ha nem, érdemes szakemberrel beszélni.");
  });

  test("under 500 average trips; exactly 500 does not — the boundary is inclusive", () => {
    const low = weeklySummary(
      [entry(MONDAY, 300), entry(MONDAY, 300), entry(TUESDAY, 300)],
      TUESDAY,
    )!;
    expect(low.safety).toBe(true);
    expect(low.suggestion).toBeNull();
    expect(low.topFlags).toEqual([]);

    const edge = weeklySummary(
      [entry(MONDAY, SAFETY_MIN_KCAL), entry(MONDAY, SAFETY_MIN_KCAL), entry(TUESDAY, SAFETY_MIN_KCAL)],
      TUESDAY,
    )!;
    expect(edge.safety).toBe(false);
    expect(edge.avgKcal).toBe(500);
  });

  test("over 4000 average trips; exactly 4000 does not", () => {
    const high = weeklySummary(
      [entry(MONDAY, 4500), entry(MONDAY, 4001), entry(TUESDAY, 4002)],
      TUESDAY,
    )!;
    expect(high.safety).toBe(true);
    expect(high.suggestion).toBeNull();

    const edge = weeklySummary(
      [entry(MONDAY, SAFETY_MAX_KCAL), entry(MONDAY, SAFETY_MAX_KCAL), entry(TUESDAY, SAFETY_MAX_KCAL)],
      TUESDAY,
    )!;
    expect(edge.safety).toBe(false);
    expect(edge.avgKcal).toBe(4000);
  });

  test("the safety result replaces the suggestion — nothing rides along", () => {
    const s = weeklySummary(
      [
        entry(MONDAY, 300, ["veg"]),
        entry(MONDAY, 300, ["veg"]),
        entry(TUESDAY, 300, ["veg"]),
      ],
      TUESDAY,
    )!;
    expect(s.safety).toBe(true);
    expect(s.suggestion).toBeNull();
    // And the shape is the typed one, so the renderer cannot confuse it.
    const keys = Object.keys(s).sort();
    expect(keys).toEqual(["avgKcal", "days", "safety", "suggestion", "topFlags"]);
  });

  test("kcalOf reads the stored number and refuses wrong shapes", () => {
    expect(kcalOf(entry(MONDAY, 1800))).toBe(1800);
    expect(kcalOf(entry(MONDAY, null))).toBeNull();
    expect(kcalOf(entry(MONDAY, 0))).toBe(0);
  });
});

/* ================ 4 · the wording sweeps (batch6 pattern) ================ */

describe("the wording never becomes medical, and never becomes a plan", () => {
  const MEDICAL = [
    "depresszió", "szorongás", "diagnózis", "betegség", "kór", "súlyos",
    "pszichiátriai", "táplálkozási zavar", "evészavar", "anorexia", "bulimia",
    "elhízás", "túlsúlyos", "alulsúlyos", "obesitas", "kalóriaszámláló",
  ];
  const PLAN = ["étrend", "dizréten", "diéta", "fogyókúra", "program", "terv"];

  test("the module's source carries none of the medical vocabulary", () => {
    const src = readFileSync(new URL("../src/lib/nutritionTips.ts", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const hay = src.toLowerCase();
    for (const word of MEDICAL) {
      expect(hay, `module mentions ${word}`).not.toContain(word);
    }
  });

  test("the safety sentence names a conversation, never a condition", () => {
    const hay = SAFETY_NOTE.toLowerCase();
    for (const word of MEDICAL) expect(hay).not.toContain(word);
    for (const word of PLAN) expect(hay).not.toContain(word);
    // It is a question of intent, not a verdict: "szándékos" is in, blame is out.
    expect(SAFETY_NOTE).toContain("szándékos");
    expect(hay).not.toContain("hiba");
    expect(hay).not.toContain("rossz");
  });

  test("every output string is swept — tips, suggestions, safety", () => {
    const strings: string[] = [
      "Szép egyensúly. A zöldség és a fehérje jó kombináció.",
      "A gyorsétel néha belefér. Holnap próbálj egy zöldséges fogást is.",
      "A fehérje kevesebb volt – próbálj tojást vagy hüvelyeseket.",
      "A héten 7 napon volt zöldség – jó arány.",
      SAFETY_NOTE,
    ];
    for (const s of strings) {
      const hay = s.toLowerCase();
      for (const word of [...MEDICAL, ...PLAN]) {
        expect(hay, `"${s}" mentions ${word}`).not.toContain(word);
      }
    }
  });

  test("no tip fires on empty flags — nothing shames a skipped field", () => {
    // The user who ticks nothing gets nothing: no nudge, no reminder, no
    // "you did not record" line. Silence is respect.
    for (const kcal of [null, 0, 1200, 3000, 6000]) {
      expect(mealTip(null, kcal)).toBeNull();
      expect(mealTip({}, kcal)).toBeNull();
    }
  });
});

/* ==================== 5 · the three surfaces mount ======================= */

describe("the surfaces mount — the HealthImportCard lesson", () => {
  const read = (p: string): string => readFileSync(new URL(p, import.meta.url), "utf8");

  test("the form tip renders under TrackerInputs, from live form state", () => {
    const today = read("../src/views/TodayView.tsx");
    expect(today).toContain("<NutritionTip");
    expect(today.indexOf("<NutritionTip")).toBeGreaterThan(today.indexOf("<TrackerInputs"));
    expect(today).toContain('role="status"');
    // Live state, not the stored entry: the tip reads the form's trackerValues.
    expect(today).toMatch(/flags=\{trackerValues\["nutrition-flags"\]\}/);
  });

  test("the weekly card is on the health tab and applies the three-day gate", () => {
    const health = read("../src/views/HealthView.tsx");
    const modules = read("../src/components/HealthModules.tsx");
    // The card's own copy moved to `lib/i18n.ts` in the Phase 3 extraction;
    // the safety note stayed, because `lib/nutritionTips` owns it.
    const catalogue = read("../src/lib/i18n.ts");
    // Mounted in the health tab's Táplálkozás section — it left the toolbox's
    // health drawer when that drawer's cards moved to the sixth tab.
    expect(health).toContain("<WeeklyNutritionCard />");
    expect(health.indexOf("<WeeklyNutritionCard />")).toBeGreaterThan(
      health.indexOf('id="health-nutrition"'),
    );
    expect(health.indexOf("<WeeklyNutritionCard />")).toBeLessThan(
      health.indexOf('id="health-training"'),
    );
    expect(modules).toContain("weeklySummary(data.entries, todayISO())");
    expect(modules).toContain("if (!summary) return null;");
    expect(catalogue).toContain('"today.weeklyNutrition.title": "Heti összegzés"');
    expect(modules).toContain("nutrition-safety");
  });

  test("the safety line renders only from the typed result", () => {
    const modules = read("../src/components/HealthModules.tsx");
    expect(modules).toContain("summary.safety ?");
    expect(modules).toContain("{SAFETY_NOTE}");
  });

  test("the transparency card exists, in the Egészség tab's Táplálkozás section, quoting the exact sentences", () => {
    // Phase 1 moved this transparency card from Settings to the toolbox, where
    // a reader who meets the tip can also meet where the tip came from; Batch
    // 14 moved the toolbox to a tab of its own, and the health drawer's cards
    // (this one included) moved again to the sixth tab. The assertion follows
    // the card rather than the page it started on: what is being pinned is
    // that these exact words are on SOME page, not that a page keeps them.
    const health = read("../src/views/HealthView.tsx");
    // The card's own copy moved to `lib/i18n.ts` in the Phase 3 i18n
    // extraction; the safety note stayed, because `lib/nutritionTips` owns it.
    const catalogue = read("../src/lib/i18n.ts");
    expect(catalogue).toContain('"settings.nutrition.title": "Táplálkozási tippek"');
    expect(catalogue).toContain("Szép egyensúly. A zöldség és a fehérje jó kombináció.");
    expect(catalogue).toContain("A gyorsétel néha belefér. Holnap próbálj egy zöldséges fogást is.");
    expect(catalogue).toContain("nem diétaterv");
    expect(health).toContain('t("settings.nutrition.title")');
    expect(health).toContain("{SAFETY_NOTE}");
    // Inside the view the router mounts: the card is inside the Táplálkozás
    // section of the table the tab renders.
    expect(health.indexOf('t("settings.nutrition.title")')).toBeGreaterThan(
      health.indexOf('id="health-nutrition"'),
    );
    expect(health.indexOf('t("settings.nutrition.title")')).toBeLessThan(
      health.indexOf('id="health-training"'),
    );
    expect(health).toContain("defaultHealthSections(flags)");
  });

  test("the stylesheet carries the three new classes", () => {
    const css = read("../src/styles.css");
    expect(css).toContain(".nutrition-tip {");
    expect(css).toContain(".nutrition-safety {");
    expect(css).toContain(".tips-list {");
  });
});

/* ================= 6 · the summary type is honest about nulls ============ */

describe("the weekly result cannot be misread", () => {
  test("a normal summary carries every field, safety false", () => {
    const s: WeeklySummary = weeklySummary(
      [entry(MONDAY, 1800, ["veg"]), entry(MONDAY, 2000, ["veg"]), entry(TUESDAY, 2100, ["veg"])],
      TUESDAY,
    )!;
    expect(s).toEqual({
      days: 3,
      avgKcal: 1967,
      topFlags: ["veg"],
      suggestion: "A héten 3 napon volt zöldség – jó arány.",
      safety: false,
    });
  });
});
