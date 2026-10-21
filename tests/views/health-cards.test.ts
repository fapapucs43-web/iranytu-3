/**
 * The Egészség tab's own proof — the health drawer's cards really moved.
 *
 * WHY THIS FILE EXISTS
 * The reader's report was specific: on the sixth tab the workout plans and the
 * workout programmes were not there. They were not, and not because of a stale
 * deploy — the tab shipped with three titles and a sentence each, and the cards
 * were still three taps deep in Felfedezés's health drawer. This file is the
 * change that moved them, pinned from both ends:
 *
 *  - the SOURCE half is what no render can reach, because a `Collapsible` in
 *    the toolbox renders no children and the moved cards are behind gates;
 *  - the RENDER half is the claim the reader made — that `Edzésprogramok` and
 *    `Edzéstervek és napló` are actually on the page — asserted in the markup
 *    of the real view, not inferred from an import.
 *
 * WHY THE TABLE IS WRITTEN OUT BY HAND
 * Same reason `tools-split` writes its table out: deriving it from the view
 * would compare the code to itself. A card that changes section has to be
 * changed here too, and the union of this table and `tools-split`'s must still
 * hold every card exactly once — a card that leaves one table and does not
 * arrive in the other is a card that was dropped in the move.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import HealthView, {
  HEALTH_SECTION_IDS,
  defaultHealthSections,
  type HealthSectionId,
} from "../../src/views/HealthView";
import { AppProvider } from "../../src/state/AppContext";
import { ThemeProvider } from "../../src/state/ThemeContext";
import { FontProvider } from "../../src/state/FontContext";
import { IconSetProvider } from "../../src/state/IconSetContext";
import * as store from "../../src/lib/store";
import { t } from "../../src/lib/i18n";
import { DIET_TYPES } from "../../src/lib/diets";
import { MEAL_TYPES } from "../../src/lib/nutrition";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (p: string): string => readFileSync(join(ROOT, p), "utf8");

const HEALTH = read("src/views/HealthView.tsx");
const TOOLS = read("src/views/ToolsView.tsx");

/** The section rows, sliced the same way `tools-split` slices drawers. */
function sectionBodies(): Map<string, string> {
  const out = new Map<string, string>();
  const marks = [...HEALTH.matchAll(/id: "([a-z]+)" as HealthSectionId,/g)];
  expect(marks.length, "the tab must declare its sections as `id: \"…\" as HealthSectionId` rows").toBe(
    HEALTH_SECTION_IDS.length,
  );
  marks.forEach((m, i) => {
    const from = m.index!;
    const to = i + 1 < marks.length ? marks[i + 1]!.index! : HEALTH.length;
    out.set(m[1]!, HEALTH.slice(from, to));
  });
  return out;
}

const SECTIONS = sectionBodies();

/** Every card the tab mounts, and the section it belongs to. */
const CARDS: readonly (readonly [string, HealthSectionId])[] = [
  ["<NutritionCard />", "nutrition"],
  ["<FoodPhotoCapture />", "nutrition"],
  ["<WeeklyNutritionCard />", "nutrition"],
  ['id="settings-nutrition-tips"', "nutrition"],
  ["<WorkoutPrograms />", "training"],
  ["<FitnessCard />", "training"],
  ['id="settings-sport-tips"', "training"],
  ["<MiniVitals />", "general"],
  ["<MiniMeds />", "general"],
  ["<HabitStreaks />", "general"],
  ["<AssessmentModule />", "general"],
  ["<Gad7Card />", "general"],
];

/** The three gates, and the card each one silences — each on its own line. */
const GATES: readonly (readonly [string, HealthSectionId])[] = [
  ["{flags.vitalsModule && <MiniVitals />}", "general"],
  ["{flags.medsModule && <MiniMeds />}", "general"],
  ["{flags.assessmentsEnabled && <AssessmentModule />}", "general"],
];

beforeEach(() => {
  store.resetAll();
});

afterEach(() => {
  store.resetAll();
});

describe("the moved cards are in their sections, once each", () => {
  test("every card is mounted exactly once in the tab", () => {
    for (const [card] of CARDS) {
      const times = HEALTH.split(card).length - 1;
      expect(times, `${card} is mounted ${times} times`).toBe(1);
    }
  });

  test("and it is inside the section this file says it belongs to", () => {
    for (const [card, section] of CARDS) {
      const body = SECTIONS.get(section);
      expect(body, `${section} has no section`).toBeDefined();
      expect(body!, `${card} is not in the ${section} section`).toContain(card);
    }
  });

  test("a card is in exactly one section", () => {
    for (const [card] of CARDS) {
      const holders = [...SECTIONS.entries()]
        .filter(([, body]) => body.includes(card))
        .map(([id]) => id);
      expect(holders, card).toHaveLength(1);
    }
  });

  test("none of them is still in the toolbox", () => {
    // The other direction, and the one the reader's report was about: a card
    // left behind in Felfedezés is the same card in two places, which is both
    // a duplicated stored state and a record split across tabs.
    const moved = new Set(CARDS.map(([card]) => card));
    const stragglers = [...moved].filter((card) => TOOLS.includes(card));
    expect(stragglers, "these cards are still mounted in Felfedezés").toEqual([]);
  });
});

describe("a module switched off draws nothing", () => {
  test("each gate is on the card's own line, in the section it lives in", () => {
    for (const [gate, section] of GATES) {
      expect(SECTIONS.get(section)!, `${gate} is not in the ${section} section`).toContain(gate);
      // Ungated, the card would draw with its module off — the failure this
      // pins is the gated form existing a second time without its gate.
      const card = gate.slice(gate.indexOf("<"));
      const ungated = HEALTH.split(card).length - 1 - 1;
      expect(ungated, `${card} is also mounted ungated`).toBe(0);
    }
  });

  test("the check-in is mounted ungated, and no gate was added to it later", () => {
    // The one card behind no setting at all. The flag beside it guards a
    // questionnaire that KEEPS A LOG, and the consent screen is where a reader
    // agrees to that; the check-in writes nothing — its answers live in
    // component state and leave with the card — so a gate here would be
    // guarding nothing. A later commit that quietly put it behind
    // `assessmentsEnabled` would hide a card that stores nothing behind a
    // consent about storage, and this line is what refuses that.
    const body = SECTIONS.get("general")!;
    expect(body).toContain("<Gad7Card />");
    expect(body).not.toContain("&& <Gad7Card />");
  });

  test("the three flags come from the store, not from props of their own", () => {
    for (const key of ["vitalsModule", "medsModule", "assessmentsEnabled"]) {
      expect(HEALTH, key).toContain(`${key}: data.settings.${key},`);
    }
  });
});

describe("the tab a reader lands on really draws the cards", () => {
  function renderHealth(): string {
    return renderToStaticMarkup(
      createElement(
        AppProvider,
        null,
        createElement(
          ThemeProvider,
          null,
          createElement(
            FontProvider,
            null,
            createElement(IconSetProvider, null, createElement(HealthView)),
          ),
        ),
      ),
    );
  }

  test("the three section heads render, in the order the tab declares them", () => {
    const html = renderHealth();
    // The cards draw their own heads inside each section, so the three the tab
    // owns are read by position rather than by "the first three titles".
    const at = (name: string) => html.indexOf(`class="collapsible-title">${name}<`);
    for (const name of ["Táplálkozás", "Edzés", "Egyéb"]) {
      expect(at(name), `${name} did not render`).toBeGreaterThan(-1);
    }
    expect(at("Táplálkozás")).toBeLessThan(at("Edzés"));
    expect(at("Edzés")).toBeLessThan(at("Egyéb"));
    // And each section's cards sit between its own head and the next section's:
    // the training cards are inside Edzés, not after Egyéb.
    expect(at("Edzésprogramok")).toBeGreaterThan(at("Edzés"));
    expect(at("Edzésprogramok")).toBeLessThan(at("Egyéb"));
  });

  test("the workout programmes and the plans-and-log card are on the page", () => {
    // THE READER'S REPORT, as a test: these two sentences are what
    // `WorkoutPrograms` and `FitnessCard` render from the catalogue, and before
    // the move the sixth tab rendered neither.
    const html = renderHealth();
    expect(html).toContain("Edzésprogramok");
    expect(html).toContain("Edzéstervek és napló");
    expect(html).toContain("Ajánlott tervek");
    // And the food half came along: the log's own card, not only a sentence.
    expect(html).toContain("Étkezés");
  });

  test("the transparency cards still say their name after the move", () => {
    const html = renderHealth();
    expect(html).toContain('id="settings-nutrition-tips"');
    expect(html).toContain('id="settings-sport-tips"');
  });

  test("the sections are declared as data, in the declared order", () => {
    const labels = defaultHealthSections({
      vitalsModule: true,
      medsModule: true,
      assessmentsEnabled: true,
    }).map((s) => s.label);
    expect(labels).toEqual(["Táplálkozás", "Edzés", "Egyéb"]);
    expect([...HEALTH_SECTION_IDS]).toEqual(["nutrition", "training", "general"]);
  });
});

/* --------------- the content the health audit added ---------------- */

/**
 * The audit (`docs/health-tab-audit.md`) is a document; this is the half of it
 * that has to stay true. Three new diets, two new programmes and one red-flag
 * line, all of them ADDITIVE: nothing that was on the tab before this batch is
 * asserted away here, only that the additions are actually on the page.
 */
describe("the content the health audit added", () => {
  function renderHealth(): string {
    return renderToStaticMarkup(
      createElement(
        AppProvider,
        null,
        createElement(
          ThemeProvider,
          null,
          createElement(
            FontProvider,
            null,
            createElement(IconSetProvider, null, createElement(HealthView)),
          ),
        ),
      ),
    );
  }

  test("all twelve diets are pickable on the tab, the three new ones included", () => {
    // The picker is inside the food-log card's body, which `CollapsibleCard`
    // always renders (hidden with `hidden=""`, never unmounted), so a static
    // render can count the buttons. The three new labels come from the
    // catalogue, which is why this compares against `t()` and not a literal.
    const html = renderHealth();
    for (const key of [
      "tools.nutrition.diet.gluten-free",
      "tools.nutrition.diet.lactose-free",
      "tools.nutrition.diet.pescatarian",
    ]) {
      expect(html, `${key} is not on the tab`).toContain(t(key));
    }
    // The unselected class is rendered as `pill ` — the selected one as
    // `pill  pill-selected` — so the match is on the prefix, not the whole value.
    const pills = html.match(/class="pill[ "]/g) ?? [];
    // Twelve diets + four meals per meal-type row; the assertion that matters is
    // the floor, because a pill-cloud that lost a diet loses it silently.
    expect(pills.length).toBeGreaterThanOrEqual(DIET_TYPES.length + MEAL_TYPES.length);
  });

  test("the two new programmes are listed beside the original four", () => {
    const html = renderHealth();
    for (const label of ["Mobilitás és regeneráció", "Séta és állóképesség"]) {
      expect(html, `${label} is missing from Edzésprogramok`).toContain(label);
    }
    // The four that were there stay there — this batch is additive.
    for (const label of ["Kezdő", "Otthoni, eszköz nélkül", "Haladó", "Edzőtermi"]) {
      expect(html, `${label} disappeared`).toContain(label);
    }
  });

  test("the red-flag line is on the tab, and it names a professional path", () => {
    const html = renderHealth();
    expect(html).toContain(t("tools.workouts.safetyNote"));
    // The house rule for every health surface: say what to do, not what you
    // have. The line must send the reader somewhere, not diagnose them.
    expect(t("tools.workouts.safetyNote")).toContain("segítséget");
    expect(t("tools.workouts.safetyNote").toLowerCase()).not.toContain("diagnózis");
  });
});
