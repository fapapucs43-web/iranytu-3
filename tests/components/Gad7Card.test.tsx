/**
 * Batch 14, the check-in — the card, rendered.
 *
 * WHY THIS FILE CAN RENDER IT AND `tools-split` CANNOT
 * The card lives inside a drawer, and a closed `Collapsible` renders no
 * children — so no render of the tab will ever see a single line of it. Here
 * the card is rendered on its own, which is also why it needs NO PROVIDER: it
 * reads no store, draws no `ContentIcon` (its heading is a chrome `Wind`, like
 * the Settings tab's own header), and its whole state is one `useState`. That
 * absence is the feature — a check-in that cannot reach storage cannot leave
 * anything behind — and the last describe block pins it rather than assuming
 * it.
 *
 * WHY `Gad7Result` IS RENDERED DIRECTLY
 * The result exists only after seven answers and `bun test` has no click. A
 * static render of the card therefore proves the QUESTION, not the summary, and
 * a suite that stopped there would be pinning the half of the card nobody
 * worries about. The panel is rendered with totals and bands chosen here, which
 * is the same reason `DisclaimerBlock` is an export.
 *
 * `tsconfig.json` is `include: ["src"]`, so no test in this suite is
 * typechecked: a typo here fails `bun test`, not `bun run typecheck`.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Gad7Card, { Gad7Result } from "../../src/components/Gad7Card";
import {
  DISCLAIMER,
  RESOURCES,
  RESOURCES_TITLE,
  RESPONSE_OPTIONS,
} from "../../src/lib/assessments";
// `MAX_SCORE` comes from the CHECK-IN, which is 21, and the questionnaire has
// one of its own that is 27. Reading the wrong one here is the exact mistake
// this file exists to catch, so the import is named once and used everywhere.
import { BANDS, ITEMS, INSTRUCTION, MAX_SCORE, bandFor } from "../../src/lib/gad7";
import { t } from "../../src/lib/i18n";

const html = renderToStaticMarkup(createElement(Gad7Card));
const resultHtml = (score: number) =>
  renderToStaticMarkup(
    createElement(Gad7Result, { score, band: bandFor(score), onAgain: () => {} }),
  );

/** The card's own source, comments stripped — the pins below are about code. */
const SOURCE = readFileSync(new URL("../../src/components/Gad7Card.tsx", import.meta.url), "utf8");
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("Gad7Card — the seven questions, on one screen", () => {
  test("its name is the app's own, and the instrument is named once", () => {
    expect(t("gad7.title")).toBe("Feszültség és aggodalom");
    expect(html).toContain(t("gad7.title"));
    // The ONE provenance line is the only place the adapted instrument is
    // named. Twice would mean a second sentence had picked the name up.
    expect(html.split("GAD-7").length - 1).toBe(1);
    expect(html).toContain(t("gad7.provenance"));
  });

  test("all seven items are on screen, in the module's order", () => {
    let last = -1;
    for (const item of ITEMS) {
      const at = html.indexOf(`${item.index}. ${item.text}`);
      expect(at, `item ${item.index} is missing`).toBeGreaterThan(-1);
      expect(at, `item ${item.index} is out of order`).toBeGreaterThan(last);
      last = at;
    }
    expect(html).toContain(INSTRUCTION);
  });

  test("every item carries the questionnaire's own four options", () => {
    // The scale is imported, not retyped: seven copies of each of the four.
    for (const label of RESPONSE_OPTIONS) {
      expect(html.split(`>${label}<`).length - 1, label).toBe(ITEMS.length);
    }
  });

  test("seven radiogroups, each named after the question it holds", () => {
    expect(html.split('role="radiogroup"').length - 1).toBe(ITEMS.length);
    for (const item of ITEMS) {
      expect(html, `group for ${item.index}`).toContain(
        `aria-label="${t("gad7.itemGroup", { index: item.index })}"`,
      );
    }
  });

  test("nothing is picked yet, so no option claims to be chosen", () => {
    expect(html.split('role="radio"').length - 1).toBe(ITEMS.length * RESPONSE_OPTIONS.length);
    expect(html.split('aria-checked="true"').length - 1).toBe(0);
    expect(html.split('aria-checked="false"').length - 1).toBe(
      ITEMS.length * RESPONSE_OPTIONS.length,
    );
  });

  test("the summary button is disabled until all seven are answered", () => {
    expect(html).toContain(t("gad7.incomplete"));
    expect(html).toContain(t("gad7.submit"));
    expect(html).toMatch(new RegExp(`<button[^>]*disabled[^>]*>${t("gad7.submit")}`));
    // And it says 21, from the questionnaire's own key rather than a copy.
    expect(html).toContain(t("assessment.maxScore", { max: MAX_SCORE }));
  });

  test("it says, before the first tap, that nothing is saved", () => {
    expect(html).toContain(t("gad7.intro"));
    expect(t("gad7.intro")).toContain("mentésre");
  });

  test("no score, no band and no crisis sentence exists before a run", () => {
    // The disclaimer and the numbers belong to a RESULT. A card that printed
    // them beside a blank form would be alarming a reader who has answered
    // nothing, and it would make the pair look like decoration.
    expect(html).not.toContain(DISCLAIMER);
    expect(html).not.toContain(RESOURCES_TITLE);
    expect(html).not.toContain("116-123");
    for (const band of BANDS) expect(html, band.label).not.toContain(band.label);
  });

  test("the items and the options come from their owners, never from a literal", () => {
    expect(CODE).toContain("ITEMS.map(");
    expect(CODE).toContain("RESPONSE_OPTIONS.map(");
    // A quoted Hungarian sentence here would be a second copy of content the
    // module owns — the exact drift this card is shaped to make impossible.
    for (const item of ITEMS) expect(CODE, `item ${item.index}`).not.toContain(item.text);
    for (const band of BANDS) expect(CODE, band.label).not.toContain(band.note);
  });
});

describe("Gad7Result — one completed run", () => {
  test("shows the total out of 21, the band's label and the band's note", () => {
    const one = resultHtml(10);
    expect(one).toContain(t("gad7.score", { score: 10, max: MAX_SCORE }));
    expect(one).toContain("Közepes feszültség");
    expect(one).toContain(bandFor(10).note);
  });

  test("only the band it was handed is on screen", () => {
    const one = resultHtml(3);
    for (const band of BANDS) {
      if (band.label === bandFor(3).label) continue;
      expect(one, band.label).not.toContain(band.label);
    }
    expect(one).not.toContain(t("gad7.score", { score: 10, max: MAX_SCORE }));
  });

  test("the disclaimer and the resource list travel with every total", () => {
    // Four separate scores, including both ends and both sides of a cut point.
    for (const score of [0, 4, 15, MAX_SCORE]) {
      const one = resultHtml(score);
      expect(one, String(score)).toContain(DISCLAIMER);
      expect(one, String(score)).toContain(RESOURCES_TITLE);
      expect(one, String(score)).toContain("116-123");
    }
    // Every entry of the one list, in the one order, with its number dialable.
    const one = resultHtml(6);
    for (const r of RESOURCES) {
      expect(one, r.label).toContain(r.phone ?? r.href!);
    }
  });

  test("it says the total leaves no trace, and offers the form again", () => {
    const one = resultHtml(6);
    expect(one).toContain(t("gad7.resultNote"));
    expect(one).toContain(t("gad7.again"));
  });
});

describe("the check-in cannot write", () => {
  test("its answers live in component state and nowhere else", () => {
    expect(CODE).toContain("useState<Answers>(BLANK)");
    expect(SOURCE).not.toMatch(/localStorage|sessionStorage|indexedDB/);
    expect(CODE).not.toMatch(/assessmentStore|addAssessment|saveEntry|useApp/);
  });

  test("and the store has no field for it to reach", () => {
    // The structural half of the same claim: there is nothing to write INTO.
    // `assessmentStore` is shaped around the one instrument that keeps a log.
    const types = readFileSync(new URL("../../src/types.ts", import.meta.url), "utf8");
    const store = readFileSync(new URL("../../src/lib/assessmentStore.ts", import.meta.url), "utf8");
    expect(types).not.toMatch(/gad7|gadScore/i);
    expect(store).not.toMatch(/gad7/i);
  });
});
