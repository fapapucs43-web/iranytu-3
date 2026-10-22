/**
 * Batch 14, commit 3 — the Eszköztár tab's own proof.
 *
 * WHY THIS FILE EXISTS AT ALL
 * The first two commits moved thirteen cards into a tab of their own and then
 * regrouped them into five drawers. Both are structural claims, and both were
 * verified by rendering — but a drawer is a `Collapsible`, and a closed
 * `Collapsible` renders no children: a card that moved into a drawer is
 * invisible to every server render in this suite, and so is a card that was
 * silently dropped on the way. That gap is what this file closes, and it was
 * found by mutation rather than by reading: deleting `<MiniMeds />` from the
 * health drawer left the whole suite green.
 *
 * WHY SOURCE AND NOT MARKUP
 * The render-level half is already pinned where it can be: the five drawer
 * heads by `tests/views/section-reorder-integration.test.tsx` (through their
 * `>title<` markers) and the two transparency cards by `batch11-collapse`. What
 * no render can reach is a drawer BODY, so the bodies are read as source, and
 * the claim being made is the modest one that is actually true: the line that
 * mounts each card is inside the drawer that card belongs to, it is there
 * exactly once, and it is nowhere on the Ma tab any more. A file that no longer
 * mentions a card cannot be the file that lost it.
 *
 * WHY THE TABLE IS THE POINT
 * The list of cards is written out here a second time, by hand, in the drawer
 * each one belongs to. Deriving it from the view's own structure would compare
 * the code to itself — the mistake the reorder panel's rows were already caught
 * making once. A card that changes drawer has to be changed here too, and that
 * friction is the feature — which is how the health drawer's eleven cards left
 * this table (and this tab) without a single one of them going missing.
 *
 * WHERE THE HEALTH CARDS WENT
 * The fifth drawer moved to the sixth tab and its cards moved with it, so the
 * other half of this audit is `tests/views/health-cards.test.ts`: same rule,
 * same kind of table, the Egészség tab's three sections instead of the drawers.
 * A card that leaves the union of the two tables is a card that was dropped,
 * and neither file can hide that on its own.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { MESSAGES, t } from "../../src/lib/i18n";
import { NAV_ICONS } from "../../src/lib/nav-icons";
import { TOOLS_SECTION_IDS, type ToolsSectionId } from "../../src/views/ToolsView";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (p: string): string => readFileSync(join(ROOT, p), "utf8");

const TOOLS = read("src/views/ToolsView.tsx");
const TODAY = read("src/views/TodayView.tsx");

/**
 * Batch 14's SECOND batch of work added one card to the health drawer — the
 * seven-question check-in, which is the first card here that a LATER commit
 * put in a drawer this file already knew about. The table is the reason that is
 * a one-line change and not a silent one.
 *
 * Each drawer's source: from its section row to the next one.
 *
 * The section rows are the only `id: "…"` strings in the file, which is what
 * makes this a split and not a guess — the same reason the health-drawer
 * assertion in `batch11-collapse` can slice on them.
 */
function drawerBodies(): Map<string, string> {
  const out = new Map<string, string>();
  const marks = [...TOOLS.matchAll(/id: "([a-z]+)",/g)];
  expect(marks.length, "the tab must declare its sections as `id: \"…\"` rows").toBe(
    TOOLS_SECTION_IDS.length,
  );
  marks.forEach((m, i) => {
    const from = m.index!;
    const to = i + 1 < marks.length ? marks[i + 1]!.index! : TOOLS.length;
    out.set(m[1]!, TOOLS.slice(from, to));
  });
  return out;
}

const DRAWERS = drawerBodies();

/** Which drawer the i18n key of each section is, so the two cannot drift. */
const SECTION_KEYS: Record<ToolsSectionId, string> = {
  therapy: "tools.therapy.title",
  self: "tools.self.title",
  experiments: "tools.experiments.title",
  education: "tools.learning.title",
};

/**
 * Every card the tab mounts, and the drawer it belongs to.
 *
 * The eight that stayed when the health drawer moved out, plus Phase 5's
 * support wall — a NINTH card, which is why this table rather than a count:
 * the wall arrived a phase after the split and its drawer is a row here, not
 * a surprise in someone else's assertion. `MiniReflection` and
 * `DailyQuestionCard` are defined further down this same file, which is why
 * they are named as components and not as files.
 */
const CARDS: readonly (readonly [string, ToolsSectionId])[] = [
  ["<BreathingExercise />", "therapy"],
  ["<MeditationPicker />", "therapy"],
  ["<CbtForm />", "therapy"],
  ["<MiniReflection />", "self"],
  ["<GratitudeJournal />", "self"],
  ["<DailyQuestionCard />", "self"],
  ["<SupportWallCard />", "self"],
  ["<ExperimentCard />", "experiments"],
  ["<EducationLibraryCard />", "education"],
];

/** The one settings gate the tab still honours, and the card it silences. */
const GATES: readonly (readonly [string, ToolsSectionId])[] = [
  ["{flags.reflectionModule && <MiniReflection />}", "self"],
];

describe("the cards are in their drawers, once each", () => {
  test("every card is mounted exactly once in the tab", () => {
    // Exactly once, not at least once: a card that is also drawn somewhere else
    // in the view is a card a reader meets twice on the same page.
    for (const [card] of CARDS) {
      const times = TOOLS.split(card).length - 1;
      expect(times, `${card} is mounted ${times} times`).toBe(1);
    }
  });

  test("and it is inside the drawer this file says it belongs to", () => {
    for (const [card, drawer] of CARDS) {
      const body = DRAWERS.get(drawer);
      expect(body, `${drawer} has no section`).toBeDefined();
      expect(body!, `${card} is not in the ${drawer} drawer`).toContain(card);
    }
  });

  test("a card is in exactly one drawer", () => {
    // The other direction: `toContain` on the right drawer says nothing about a
    // copy in a second one.
    for (const [card] of CARDS) {
      const holders = [...DRAWERS.entries()]
        .filter(([, body]) => body.includes(card))
        .map(([id]) => id);
      expect(holders, card).toHaveLength(1);
    }
  });

  test("none of them is still on the Ma tab", () => {
    // The move, asserted from the side that would quietly undo it. The two
    // inline cards the Ma view still defines — `NutritionTip` and `SportTip` —
    // are NOT in the table: they read the form's live state and never left.
    const moved = new Set(CARDS.map(([card]) => card));
    const stragglers = [...moved].filter((card) => TODAY.includes(card));
    expect(stragglers, "these cards are still mounted on Ma").toEqual([]);
    expect(TODAY).toContain("<NutritionTip");
    expect(TODAY).toContain("<SportTip");
  });
});

describe("a module switched off draws nothing", () => {
  test("each gate is on the card's own line, in the drawer it lives in", () => {
    // Four of the tab's thirteen cards are behind a setting. The gates cannot be
    // seen by a render — they are inside a closed drawer — so they are pinned
    // where they are: at the mount, not somewhere near it.
    for (const [gate, drawer] of GATES) {
      expect(DRAWERS.get(drawer)!, `${gate} is not in the ${drawer} drawer`).toContain(gate);
      // Ungated, the card would draw with its module off, which is the failure
      // this pins: the gated form must not also exist ungated anywhere.
      const card = gate.slice(gate.indexOf("<"));
      const ungated = TOOLS.split(card).length - 1 - 1;
      expect(ungated, `${card} is also mounted ungated`).toBe(0);
    }
  });

  test("the flag comes from the store, not from a prop of its own", () => {
    // Three of the four gates this file used to enumerate travelled to the
    // Egészség tab with their cards; `health-cards` pins those. This is the one
    // the toolbox still owns.
    expect(TOOLS).toContain("reflectionModule: data.settings.reflectionModule }");
    for (const gone of ["vitalsModule", "medsModule", "assessmentsEnabled"]) {
      expect(TOOLS, `${gone} must have moved with its cards`).not.toContain(gone);
    }
  });
});

describe("the four drawers are the four a reader sees", () => {
  test("the section ids are the four, in the order the tab draws them", () => {
    expect([...TOOLS_SECTION_IDS]).toEqual([
      "therapy",
      "self",
      "experiments",
      "education",
    ]);
  });

  test("each drawer's head and its panel row are the same catalogue key", () => {
    // Both halves of a section's name, from one key: the head a reader opens and
    // the row the arrows announce. Two keys would be two things to keep in step,
    // and the panel row is invisible until the toggle is pressed — which is
    // exactly the kind of string that drifts.
    for (const id of TOOLS_SECTION_IDS) {
      const body = DRAWERS.get(id)!;
      expect(body, id).toContain(`label: t("${SECTION_KEYS[id]}")`);
      expect(body, id).toContain(`title={t("${SECTION_KEYS[id]}")}`);
    }
  });

  test("the tab's own title and hint come from the catalogue too", () => {
    expect(TOOLS).toContain('title={t("tools.title")}');
    expect(TOOLS).toContain('hint={t("tools.hint")}');
    // The name MOVED with the tab. `today.toolbox.title` was accurate while the
    // toolbox was a drawer at the bottom of the Ma fül; after the tab arrived,
    // and especially after the reader renamed it, the name belongs in the
    // tab's own namespace — the copy travels with the thing it names.
    expect(t("tools.title")).toBe("Felfedezés");
    // And it is said TWICE on screen: here, and in the bottom bar's row. Two
    // owners is one more than ideal, so the two are asserted equal rather than
    // trusted to be kept in step by hand.
    expect(NAV_ICONS.find((n) => n.tab === "tools")!.label).toBe(t("tools.title"));
  });

  test("the old name is gone from every sentence that used to point at the tab", () => {
    // A rename is not finished when the label changes; it is finished when the
    // OLD name has left the copy. Two sentences carried it — the icon-policy
    // list ("a „Felfedezés” fül doboza") and the medication card's empty state,
    // which sent the reader to "a Mai nap Eszköztárában", a place that stopped
    // existing when the toolbox left the Ma fül. Both were found by this sweep
    // rather than by reading, which is the reason it is a sweep and not a list
    // of two keys: a third copy would not be on the list.
    const stale = Object.entries(MESSAGES.hu)
      .filter(([, value]) => value.includes("Eszköztár"))
      .map(([key]) => key);
    expect(stale, `still naming the old tab: ${stale.join(", ")}`).toEqual([]);
  });

  test("the fifth drawer is named for the work, and its old key is gone", () => {
    // The drawer's NAME and the drawer's ID are two different things, and this
    // pins both ends: the reader reads "Tanulás" — the activity, which covers
    // the library and the micro-lessons the recording flow hands out — while the
    // stored arrangement keeps naming `education`, so a tab someone rearranged
    // before the rename still opens the way they left it. The value is the half
    // nothing else pins: the drawer markers in `section-reorder-integration`
    // read the catalogue, so they follow whatever word is in it, and a rename
    // that landed on the wrong one would pass there without a sound.
    expect(t("tools.learning.title")).toBe("Tanulás");
    expect(TOOLS_SECTION_IDS).toContain("education");
    // The id the drawer DECLARES, not the id the list above it happens to
    // name — the two being different is the failure this asserts against.
    expect(DRAWERS.has("education"), "the drawer's own id moved with its name").toBe(true);
    expect(Object.keys(MESSAGES.hu)).not.toContain("tools.education.title");
  });

  test("and the section list reads the tab's own slot, not another tab's", () => {
    expect(TOOLS).toContain('useSectionOrder("tools")');
  });
});
