/**
 * Batch 13, commit 6 — the crisis card.
 *
 * The feature is "make the help reachable". That is only true if two separate
 * properties hold, and this file splits them apart on purpose because they
 * fail in completely different ways:
 *
 *  1. THE LIST IS SINGLE-SOURCE. The component must render whatever
 *     `lib/assessments` says, and must not contain a phone number of its own.
 *     A duplicated list is the single worst failure available to this feature:
 *     it would look correct, pass every render test in the file above, and
 *     hand someone a number that has been decommissioned. So there is a source
 *     scan (`the component writes down no number of its own`) and not merely a
 *     markup assertion.
 *
 *  2. THE FOUR MOUNT POINTS ARE WIRED. A component that compiles and is never
 *     rendered passes every unit test — the HealthImportCard lesson, already
 *     paid for once in this repo. Each mount is proven by rendering its real
 *     parent, not by reading the parent's source.
 *
 * WHAT IS NOT TESTED HERE, AND WHY
 * There is no jsdom in this suite (three batch files say so deliberately), so
 * rendering is `renderToStaticMarkup` and no EFFECTS run. That is fine for
 * every claim below: the card holds no state, opens no dialog, and reads no
 * context, so there is nothing an effect could be doing that the markup does
 * not already show. Nothing here needs a click.
 *
 * The strip is asserted to be ABSENT on a result that does not need support.
 * That negative is the whole reason the mount is conditional: a permanent
 * alarm on every questionnaire result would train people to stop seeing it.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CrisisCard, { CrisisStrip } from "../../src/components/CrisisCard";
import AssessmentResult from "../../src/components/AssessmentResult";
import AssessmentConsent from "../../src/components/AssessmentConsent";
import EntryDetail from "../../src/components/EntryDetail";
import SettingsView from "../../src/views/SettingsView";
import { DISCLAIMER, RESOURCES, RESOURCES_TITLE } from "../../src/lib/assessments";
import type { AssessmentRecord } from "../../src/lib/assessmentStore";
import type { Entry } from "../../src/types";

const store = await import("../../src/lib/store");
const { AppProvider } = await import("../../src/state/AppContext");
const { IconSetProvider } = await import("../../src/state/IconSetContext");
const { ThemeProvider } = await import("../../src/state/ThemeContext");
const { FontProvider } = await import("../../src/state/FontContext");

/** The provider stack the real App mounts. */
function fullStack(el: React.ReactElement): string {
  return renderToStaticMarkup(
    createElement(
      AppProvider,
      null,
      createElement(
        ThemeProvider,
        null,
        createElement(FontProvider, null, createElement(IconSetProvider, null, el)),
      ),
    ),
  );
}

const CARD_SRC = readFileSync("src/components/CrisisCard.tsx", "utf8");

/** Every `href` in some markup, in document order. */
function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
}

function makeRecord(needsSupport: boolean): AssessmentRecord {
  // Nine answers, index 8 is the supplementary item, and `needsSupport` is
  // derived from it upstream — so to build a record that needs support the
  // answer there has to be above zero, exactly as assessmentStore derives it.
  const answers = new Array(9).fill(0);
  if (needsSupport) answers[8] = 2;
  return {
    id: "a-1",
    date: "2026-10-02",
    answers,
    impact: null,
    score: answers.reduce((a, b) => a + b, 0),
    band: {
      id: "low",
      label: "Alacsony",
      note: "n",
      min: 0,
      max: 4,
    },
    needsSupport,
  };
}

function makeEntry(): Entry {
  return {
    id: "e-1",
    date: "2026-10-02",
    mood: 1,
    stress: 9,
    energy: 2,
    note: "nehezéz nap",
    tags: [],
    emotions: [],
    activities: [],
    reflection: { feeling: "nehéz", stressReason: "", need: "" },
    vitals: { restingHr: null, hrv: null, sleepHours: null },
    source: "manual",
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("the crisis card — one list, imported", () => {
  test("the card shows every resource, and only from RESOURCES", () => {
    const html = renderToStaticMarkup(createElement(CrisisCard));
    for (const r of RESOURCES) {
      expect(html.includes(r.label), r.label).toBe(true);
      if (r.hours) expect(html.includes(r.hours), r.hours).toBe(true);
    }
    // Every dialled number is present AND dial-ready: `116-123` renders a
    // `tel:116123`, because `tel:116-123` is not a number a handset accepts.
    for (const r of RESOURCES) {
      if (!r.phone) continue;
      expect(html.includes(r.phone), r.phone).toBe(true);
      expect(hrefs(html).includes(`tel:${r.phone.replace(/-/g, "")}`), r.phone).toBe(true);
    }
    // Both web resources are reachable too — the full card is not phone-only.
    for (const r of RESOURCES) {
      if (r.href) expect(hrefs(html).includes(r.href), r.href).toBe(true);
    }
    expect(html.includes(RESOURCES_TITLE)).toBe(true);
    expect(html.includes(DISCLAIMER)).toBe(true);
  });

  test("the component writes down no number of its own", () => {
    // The guard this file exists for. A digit sequence in the component's
    // SOURCE — code OR comment — is how a second list starts, and every render
    // assertion above would still pass once it did. Comments are included on
    // purpose: this invariant is only worth having if it cannot be argued
    // around, and "it was only in a comment" is exactly the argument.
    const digits = CARD_SRC.match(/\b\d[\d-]{2,}\b/g) ?? [];
    expect(digits).toEqual([]);
  });

  test("the card imports its copy rather than restating it", () => {
    expect(CARD_SRC).toContain("from \"../lib/assessments\"");
    expect(CARD_SRC).toContain("RESOURCES_TITLE");
    expect(CARD_SRC).toContain("DISCLAIMER");
    expect(CARD_SRC).toContain("RESOURCES");
  });

  test("the card is a plain card, not a CollapsibleCard", () => {
    // A route to help behind a tap is not a route to help. Asserted on the
    // markup so a future refactor to a collapsible body fails here.
    const html = renderToStaticMarkup(createElement(CrisisCard));
    expect(html.includes("crisis-card")).toBe(true);
    expect(html.includes("collapsible-card-head")).toBe(false);
  });
});

describe("the strip — the compact form", () => {
  test("it carries the dialled numbers and the disclaimer", () => {
    const html = renderToStaticMarkup(createElement(CrisisStrip));
    const callable = RESOURCES.filter((r) => typeof r.phone === "string");
    expect(callable.length).toBeGreaterThan(0);
    for (const r of callable) {
      expect(html.includes(r.phone as string), r.phone).toBe(true);
      expect(hrefs(html).includes(`tel:${(r.phone as string).replace(/-/g, "")}`)).toBe(true);
    }
    expect(html.includes(RESOURCES_TITLE)).toBe(true);
    expect(html.includes(DISCLAIMER)).toBe(true);
  });

  test("it drops the web resources rather than pretending they are one tap away", () => {
    const html = renderToStaticMarkup(createElement(CrisisStrip));
    for (const r of RESOURCES) {
      if (r.href) expect(html.includes(r.href), r.href).toBe(false);
    }
  });
});

describe("mount point 1 — Settings, above everything else", () => {
  beforeEach(() => store.resetAll());
  afterEach(() => store.resetAll());

  test("the card is on the settings page", () => {
    const html = fullStack(createElement(SettingsView));
    expect(html.includes("crisis-card")).toBe(true);
  });

  test("it sits above the profile card, not at the bottom of the page", () => {
    const html = fullStack(createElement(SettingsView));
    expect(html.includes("crisis-card")).toBe(true);
    expect(html.indexOf("crisis-card")).toBeLessThan(html.indexOf("settings-profile"));
  });

  test("it does not become a collapsible row", () => {
    // Settings has twenty-two collapsible rows and that count is pinned by
    // tests/batch11-collapse. A crisis card added as a CollapsibleCard would
    // move it; this is the assertion that it did not, from the settings side
    // rather than from the count's side.
    //
    // It was sixteen until Phase 1 moved the two transparency cards to the Ma
    // toolbox, fifteen after Batch 15 added the allergen card, sixteen again
    // once the language switcher landed, twenty-two when Phase 2b made
    // eight more settings tiles collapsible, twenty-three when the 2026-10
    // completion converted the custom-ACTIVITY manager beside its twin, the
    // tracker manager, and twenty-five when fix/card-state-and-full-audit
    // converted the two data/voice drawers, and twenty-six once the mega
    // batch added the companion card. The point of this assertion is UNCHANGED
    // by any of them: whatever the number is, a crisis card must not be one of
    // them.
    const html = fullStack(createElement(SettingsView));
    expect((html.match(/collapsible-card-head/g) ?? []).length).toBe(26);
  });
});

describe("mount point 2 — the questionnaire result", () => {
  test("a run that needs support gets the strip ABOVE the score", () => {
    const html = renderToStaticMarkup(
      createElement(AssessmentResult, { record: makeRecord(true) }),
    );
    expect(html.includes("crisis-strip")).toBe(true);
    expect(html.indexOf("crisis-strip")).toBeLessThan(html.indexOf("band-score"));
  });

  test("a run that does not need support gets no strip", () => {
    // The negative matters as much as the positive: a permanent alarm on every
    // result would train people to stop reading it.
    const html = renderToStaticMarkup(
      createElement(AssessmentResult, { record: makeRecord(false) }),
    );
    expect(html.includes("crisis-strip")).toBe(false);
  });

  test("both runs still show the resources and the disclaimer underneath", () => {
    // The strip is an addition, never a replacement. A result that stopped
    // carrying the full list would be a regression hidden by the first test.
    for (const needsSupport of [true, false]) {
      const html = renderToStaticMarkup(
        createElement(AssessmentResult, { record: makeRecord(needsSupport) }),
      );
      expect(html.includes(DISCLAIMER)).toBe(true);
      for (const r of RESOURCES) {
        if (r.phone) expect(html.includes(r.phone), r.phone).toBe(true);
      }
    }
  });

  test("the heading moved out of JSX into the constant", () => {
    // The import swap from commit 6. If someone re-inlines the sentence the
    // two copies can drift, so the literal must not be back in the component.
    const src = readFileSync("src/components/AssessmentResult.tsx", "utf8");
    expect(src).toContain("RESOURCES_TITLE");
    expect(src.includes("Ha segítségre van szükséged")).toBe(false);
  });
});

describe("mount point 3 — the consent screen", () => {
  test("the card is inside the dialog", () => {
    const html = renderToStaticMarkup(
      createElement(AssessmentConsent, {
        open: true,
        onConfirm: () => {},
        onCancel: () => {},
      }),
    );
    expect(html.includes("crisis-card")).toBe(true);
    expect(html.includes("alertdialog")).toBe(true);
  });

  test("the disclaimer still reaches this screen, via the card", () => {
    // batch6-ui already pins that the consent screen carries DISCLAIMER. This
    // is the same promise from the other side: it is now rendered by
    // CrisisCard, so removing it from the prose must not have removed it from
    // the screen.
    const html = renderToStaticMarkup(
      createElement(AssessmentConsent, {
        open: true,
        onConfirm: () => {},
        onCancel: () => {},
      }),
    );
    expect(html.includes(DISCLAIMER)).toBe(true);
  });

  test("a closed dialog renders nothing at all", () => {
    const html = renderToStaticMarkup(
      createElement(AssessmentConsent, {
        open: false,
        onConfirm: () => {},
        onCancel: () => {},
      }),
    );
    expect(html.includes("crisis-card")).toBe(false);
  });
});

describe("mount point 4 — the journal entry", () => {
  beforeEach(() => store.resetAll());
  afterEach(() => store.resetAll());

  test("the strip is on an open entry", () => {
    const html = fullStack(createElement(EntryDetail, { entry: makeEntry(), onClose: () => {} }));
    expect(html.includes("crisis-strip")).toBe(true);
  });

  test("with no entry open it renders nothing, strip included", () => {
    // EntryDetail returns null when nothing is selected (`if (!entry) return
    // null`), so there is no surface here for the strip to sit on. This test
    // began by asserting the strip would still be present in that state; it
    // would not, and it should not — a crisis line floating in a dialog that
    // is not showing a dialog would be noise. Pinning the early return means
    // a future change that renders an EMPTY state has to decide, on the record,
    // whether the strip belongs in it.
    const html = fullStack(createElement(EntryDetail, { entry: null, onClose: () => {} }));
    expect(html).toBe("");
  });
});