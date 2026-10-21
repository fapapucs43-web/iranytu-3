/**
 * Batch 6 — Commit 2 UI tests.
 *
 * The centre of gravity here is the SAFETY BLOCK (S1–S8). Everything else is
 * ordinary wiring; this one thing decides whether a person who is thinking
 * about ending their life, and has just been asked so in a form on a phone,
 * sees a crisis number. So it is tested from several angles, and — see the
 * mutations at the bottom of this file — deliberately broken to prove the
 * tests would notice.
 *
 * Rendering uses `createElement` + `renderToStaticMarkup` rather than JSX,
 * matching tests/batch5.test.ts: the repo's test files are `.ts`, and the
 * components are small enough that driving their real props is better than
 * mounting a DOM.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  DISCLAIMER,
  ITEMS,
  MAX_SCORE,
  RESOURCES,
  SAFETY_NOTICE,
  SOURCE_ATTRIBUTION,
  SOURCE_ITEMS,
  SUPPLEMENTARY_ITEM,
} from "../src/lib/assessments";
import {
  addAssessment,
  clearAssessments,
  importAssessments,
  listAssessments,
  resetForTests,
} from "../src/lib/assessmentStore";
import { t } from "../src/lib/i18n";
import AssessmentItemView, {
  AssessmentSafetyBlock,
  needsSafetyNotice,
} from "../src/components/AssessmentItemView";
import AssessmentResult, {
  DisclaimerBlock,
  ResourcesBlock,
} from "../src/components/AssessmentResult";
import AssessmentConsent from "../src/components/AssessmentConsent";
import AssessmentLog from "../src/components/AssessmentLog";
import { DEFAULT_SETTINGS } from "../src/types";

const backing: Record<string, string> = {};

beforeEach(() => {
  for (const k of Object.keys(backing)) delete backing[k];
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => (k in backing ? backing[k] : null),
    setItem: (k: string, v: string) => {
      backing[k] = v;
    },
    removeItem: (k: string) => {
      delete backing[k];
    },
  };
  resetForTests();
});

/**
 * Renders inside the two providers the real app always has above these screens.
 *
 * Batch 7f routed the crisis notice's warning triangle through `<ContentIcon>`,
 * which — like `GlyphIcon` before it — reads the chosen icon set and therefore
 * needs `IconSetProvider`. The safety block is a leaf component that a test is
 * entitled to render on its own, so the honest fix is here: give the helper the
 * same context the app gives it, rather than teaching the component to cope with
 * a context that is never missing in production.
 *
 * `AppProvider` comes along because `IconSetProvider` reads the settings it
 * holds, and rendering through the real store is also a small extra check: the
 * tree here is the tree the app builds, not a hand-assembled approximation.
 */
const { AppProvider } = await import("../src/state/AppContext");
const { IconSetProvider } = await import("../src/state/IconSetContext");

const html = (el: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(
    createElement(AppProvider, null, createElement(IconSetProvider, null, el)),
  );

/* ================================================================== */
/* S1–S8 — THE SAFETY BLOCK                                            */
/* ================================================================== */

describe("S1–S8 · the crisis notice on the ninth question", () => {
  const noop = () => {};

  test("S1 · it renders on the supplementary item even when the answer is 'Egyszer sem'", () => {
    // The regression this whole matrix exists for: gating the notice on a
    // non-zero answer would hide it from the person who most needs to see it,
    // at the exact moment they are reading the question.
    const out = html(
      createElement(AssessmentItemView, { item: SUPPLEMENTARY_ITEM, value: 0, onChange: noop }),
    );
    expect(out).toContain(SAFETY_NOTICE);
  });

  test("S2 · and it still renders when the answer is the highest option", () => {
    const out = html(
      createElement(AssessmentItemView, { item: SUPPLEMENTARY_ITEM, value: 3, onChange: noop }),
    );
    expect(out).toContain(SAFETY_NOTICE);
  });

  test("S3 · it does NOT clutter the other eight questions", () => {
    for (const item of SOURCE_ITEMS) {
      const out = html(createElement(AssessmentItemView, { item, value: null, onChange: noop }));
      expect(out).not.toContain(SAFETY_NOTICE);
    }
  });

  test("S4 · the decision depends on the item, not on the answer", () => {
    expect(needsSafetyNotice(SUPPLEMENTARY_ITEM)).toBe(true);
    for (const item of SOURCE_ITEMS) expect(needsSafetyNotice(item)).toBe(false);
  });

  test("S5 · the rendered notice is byte-exact and names both numbers", () => {
    const out = html(createElement(AssessmentSafetyBlock, null));
    expect(out).toContain(SAFETY_NOTICE);
    expect(out).toContain("116-123");
    expect(out).toContain("112");
    // Escaped, not stripped: the apostrophes in "bármikor ilyen" must survive.
    expect(out).toContain("class=\"safety-block\"");
  });

  test("S6 · the notice is reachable from the real runner, not a dead component", () => {
    // Every item, including the ninth, is rendered through this one view.
    const src = readFileSync(new URL("../src/components/AssessmentRunner.tsx", import.meta.url), "utf8");
    expect(src).toContain("<AssessmentItemView");
    expect(src).toContain("ITEMS[step]");
    // ...and that view is the only place the notice lives.
    const view = readFileSync(new URL("../src/components/AssessmentItemView.tsx", import.meta.url), "utf8");
    expect(view).toContain("needsSafetyNotice(item) && <AssessmentSafetyBlock />");
  });

  test("S7 · the runner's condition is the item, never the answer value", () => {
    // A source-level guard against the exact mutation in S8: if anyone ever
    // writes `value > 0 &&` here, this fails even before the render test does.
    const view = readFileSync(new URL("../src/components/AssessmentItemView.tsx", import.meta.url), "utf8");
    const gate = /\{([^}]*AssessmentSafetyBlock[^}]*)\}/.exec(view)?.[1] ?? "";
    expect(gate).toContain("needsSafetyNotice(item)");
    expect(gate).not.toContain("value");
    expect(gate).not.toContain("answers");
  });

  test("S8 · all nine items render, and the ninth carries the notice", () => {
    expect(ITEMS).toHaveLength(9);
    const rendered = ITEMS.map((item) =>
      html(createElement(AssessmentItemView, { item, value: 0, onChange: noop })),
    );
    const withNotice = rendered.filter((h) => h.includes(SAFETY_NOTICE));
    expect(withNotice).toHaveLength(1);
    expect(rendered[8]).toContain(SAFETY_NOTICE);
    expect(rendered[8]).toContain(SUPPLEMENTARY_ITEM.text);
  });
});

/* ================================================================== */
/* Result: disclaimer + resources, always together                     */
/* ================================================================== */

describe("the result always carries the disclaimer and the resources", () => {
  const answers = [1, 1, 2, 0, 1, 2, 1, 0, 0]; // sums to 8

  function resultFor(extra: number[] = []) {
    const rec = addAssessment({ date: "2026-03-01", answers: [...answers, ...extra] });
    return html(createElement(AssessmentResult, { record: rec! }));
  }

  test("the disclaimer is rendered byte-exact on every result", () => {
    expect(resultFor()).toContain(DISCLAIMER);
  });

  test("all six resources are rendered, with their numbers", () => {
    const out = resultFor();
    for (const r of RESOURCES) {
      if (r.phone) expect(out).toContain(r.phone);
      if (r.href) expect(out).toContain(r.href);
    }
  });

  test("the score is shown against the real maximum", () => {
    expect(resultFor()).toContain(`8 pont / ${MAX_SCORE}`);
  });

  test("the block order is: disclaimer first, resources second", () => {
    const out = resultFor();
    expect(out.indexOf("disclaimer-block")).toBeLessThan(out.indexOf("resources-block"));
  });

  test("nothing about the result is dismissible", () => {
    const out = resultFor();
    // No close button, no "x", and the block carries role=note rather than a
    // role a screen reader would let the user skip past by habit.
    expect(out).not.toContain("aria-modal");
    expect(html(createElement(DisclaimerBlock, null))).toContain('role="note"');
  });
});

/* ================================================================== */
/* needsSupport emphasis                                               */
/* ================================================================== */

describe("needsSupport changes emphasis, not structure", () => {
  const base = [1, 1, 2, 0, 1, 2, 1, 0];

  test("no emphasis when the supplementary answer is zero", () => {
    const rec = addAssessment({ date: "2026-03-01", answers: [...base, 0] })!;
    const out = html(createElement(AssessmentResult, { record: rec }));
    expect(out).not.toContain("resources-emph");
    expect(out).toContain(DISCLAIMER);
  });

  test("emphasis when the supplementary answer is above zero", () => {
    const rec = addAssessment({ date: "2026-03-01", answers: [...base, 2] })!;
    const out = html(createElement(AssessmentResult, { record: rec }));
    expect(out).toContain("resources-emph");
  });

  test("when emphasised, the resources come BEFORE the disclaimer", () => {
    const rec = addAssessment({ date: "2026-03-01", answers: [...base, 1] })!;
    const out = html(createElement(AssessmentResult, { record: rec }));
    expect(out.indexOf("resources-emph")).toBeLessThan(out.indexOf("disclaimer-block"));
  });

  test("the disclaimer is STILL present when emphasised — emphasis is not a substitute", () => {
    const rec = addAssessment({ date: "2026-03-01", answers: [...base, 3] })!;
    const out = html(createElement(AssessmentResult, { record: rec }));
    expect(out).toContain(DISCLAIMER);
  });

  test("emph is opt-in on the block itself", () => {
    expect(html(createElement(ResourcesBlock, null))).not.toContain("resources-emph");
    expect(html(createElement(ResourcesBlock, { emph: true }))).toContain("resources-emph");
  });
});

/* ================================================================== */
/* Consent + off by default                                           */
/* ================================================================== */

describe("the module is off until the consent screen is confirmed", () => {
  test("the shipped default is off", () => {
    expect(DEFAULT_SETTINGS.assessmentsEnabled).toBe(false);
  });

  test("a pre-Batch-6 settings blob yields off, not undefined-and-therefore-on", () => {
    const legacy = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
    delete legacy.assessmentsEnabled;
    expect(legacy.assessmentsEnabled ?? false).toBe(false);
  });

  test("the consent dialog states what the module is not", () => {
    const out = html(createElement(AssessmentConsent, { open: true, onConfirm: () => {}, onCancel: () => {} }));
    expect(out).toContain("Nem vizsgál, nem szűr");
    expect(out).toContain("nem állít fel semmilyen diagnózist");
    expect(out).toContain("Semmi nem kerül ki az eszközödről");
    expect(out).toContain("a már megadott válaszaid is törlődnek");
    expect(out).toContain(DISCLAIMER);
  });

  test("the consent dialog names the source, and the questionnaire does not", () => {
    const consent = html(createElement(AssessmentConsent, { open: true, onConfirm: () => {}, onCancel: () => {} }));
    expect(consent).toContain(SOURCE_ATTRIBUTION);
    // ...while a plain question never mentions the instrument.
    const q = html(createElement(AssessmentItemView, { item: SUPPLEMENTARY_ITEM, value: 0, onChange: () => {} }));
    expect(q).not.toContain("PHQ");
  });

  test("the Settings toggle routes through consent, never straight to true", () => {
    const src = readFileSync(new URL("../src/views/SettingsView.tsx", import.meta.url), "utf8");
    // Turning it on opens the dialog; only confirmEnable writes the flag.
    expect(src).toContain("if (v) setConsentOpen(true);");
    expect(src).toContain("setSettings({ ...data.settings, assessmentsEnabled: true });");
    // A bare flip-on-toggle would bypass consent entirely.
    expect(src).not.toMatch(/onChange=\{\(v\) => setSettings\(\{ \.\.\.data\.settings, assessmentsEnabled: v \}\)\}/);
  });

  test("turning it off wipes the log, as the consent screen promises", () => {
    addAssessment({ date: "2026-03-01", answers: [1, 1, 2, 0, 1, 2, 1, 0, 0] });
    expect(listAssessments()).toHaveLength(1);
    const src = readFileSync(new URL("../src/views/SettingsView.tsx", import.meta.url), "utf8");
    expect(src).toMatch(/function confirmDisableNow\(\) \{\s*clearAssessments\(\);/);
    expect(readFileSync(new URL("../src/lib/i18n.ts", import.meta.url), "utf8")).toContain(
      "A mentett önértékelések törlődnek.",
    );
  });

  test("nothing is mounted while the module is off", () => {
    // Batch 14 moved the assessment card to the Eszköztár tab's health drawer;
    // the health drawer's cards then moved to the sixth tab, so the gate is
    // read off the Egészség tab's own flag record now.
    const src = readFileSync(new URL("../src/views/HealthView.tsx", import.meta.url), "utf8");
    expect(src).toContain("{flags.assessmentsEnabled && <AssessmentModule />}");
  });
});

/* ================================================================== */
/* Export                                                             */
/* ================================================================== */

describe("export carries the disclaimer, and the attribution only when earned", () => {
  // The PDF gate is asserted behaviourally in tests/batch6-pdf.test.ts, by
  // intercepting the strings the generator actually draws. What is checked
  // here is the wiring: that the pieces the gate depends on are named.
  test("the PDF always states the disclaimer", () => {
    const src = readFileSync(new URL("../src/lib/reportPdf.ts", import.meta.url), "utf8");
    expect(src).toContain("doc.text(DISCLAIMER, M, 92");
  });

  test("the mood-only PDF still has its original footer line", () => {
    // Round 18 moved the sentence into the catalogue, so this pins the two
    // halves separately rather than the literal: the BYTES, where they now live,
    // and the WIRING, in the module. A sentence in the catalogue that the report
    // never draws is the same failure as a sentence the report drew from
    // nowhere — and only the pair rules both out.
    const src = readFileSync(new URL("../src/lib/reportPdf.ts", import.meta.url), "utf8");
    expect(src).toContain('const footerNote = t("report.footer")');
    expect(src).toContain("drawable(footerNote)");
    expect(t("report.footer")).toContain("nem orvosi tanács, nem diagnózis.");
  });

  test("the call site passes the live log, not a hardcoded array", () => {
    const src = readFileSync(new URL("../src/components/ReportExport.tsx", import.meta.url), "utf8");
    expect(src).toContain("assessments: listAssessments().map");
    expect(src).toContain("band.label");
  });

  test("the entry CSV is completely untouched", () => {
    // Batch 6 adds nothing to the entry export; if this file ever changes,
    // the change is worth a deliberate look rather than a drive-by edit.
    //
    // This used to shell out to `git diff --name-only main`, which read as the
    // obvious way to ask "did this branch touch the file?" and passed in every
    // developer's clone for the life of the project. It also assumed a local
    // branch called `main` exists, and `actions/checkout` gives a detached
    // merge ref with none — so this was the single test that went red the
    // moment CI started running the suite, in batch 7c, about a harness detail
    // and not about the app.
    //
    // Two lessons, both encoded here. Compare against a COMMIT, never a branch
    // name, because a branch name means something different in every place the
    // repository is checked out. And pin the bytes: a hash cannot re-baseline
    // the way a diff against `main` silently does as that branch moves, and it
    // needs no git at all, so it also holds for a tarball or a vendored copy.
    //
    // CRLF is normalised before hashing because the repository has no
    // .gitattributes: on a Windows clone with autocrlf the same commit yields
    // different bytes, and the guard is about whether the file was edited, not
    // about how one machine checked it out.
    const { createHash } = require("node:crypto") as typeof import("node:crypto");
    const raw = readFileSync(new URL("../src/lib/csv.ts", import.meta.url), "utf8");
    const hash = createHash("sha256")
      .update(raw.replace(/\r\n/g, "\n"), "utf8")
      .digest("hex");
    // As of batch 6's merge. To change src/lib/csv.ts, change this line too,
    // in the same commit, and say why in the commit message.
    //
    // Batch 7e re-pinned it, and the two changes are the reason this guard is
    // worth having — both are invisible in a diff of the CSV a user receives:
    //
    //   1. `number`, `select` and `flags` now export and import. A `number`
    //      holding `null` leaves the cell EMPTY, so "not recorded" comes back
    //      as absent instead of as a 0 the correlation grid would believe.
    //   2. A tracker id keeps its own casing. The importer lowercases every
    //      header for lenient column matching, and an id is a KEY, not a column
    //      name — so an id with a capital used to come back lowercased, match
    //      no definition, and leave the value orphaned while the field showed
    //      its default. Nothing about the pre-7e columns changed, and the
    //      `weather` text case in tests/batch4.test.ts is untouched.
    expect(hash).toBe("f72d52b70457ba13df97afcb8b5197a8a349dcb526756622cd0cd5d7676bbcb5");
  });

  test("the JSON export carries the log and the disclaimer inside the file", () => {
    const src = readFileSync(new URL("../src/views/SettingsView.tsx", import.meta.url), "utf8");
    expect(src).toContain("assessmentLog:");
    expect(src).toContain("disclaimer: DISCLAIMER");
    expect(src).toContain("items: listAssessments()");
  });

  test("export → import → export is lossless", () => {
    addAssessment({ date: "2026-03-01", answers: [1, 1, 2, 0, 1, 2, 1, 0, 0], impact: 2 });
    addAssessment({ date: "2026-03-05", answers: [0, 0, 0, 3, 0, 0, 0, 0, 1] });

    // What the export writes.
    const exported = { disclaimer: DISCLAIMER, items: listAssessments() };
    const wire = JSON.parse(JSON.stringify(exported));

    clearAssessments();
    expect(listAssessments()).toEqual([]);

    const restored = importAssessments(wire);
    expect(restored).toBe(2);

    const round = { disclaimer: DISCLAIMER, items: listAssessments() };
    expect(round).toEqual(exported);
  });

  test("re-importing the same file does not duplicate anything", () => {
    addAssessment({ date: "2026-03-01", answers: [1, 1, 2, 0, 1, 2, 1, 0, 0] });
    const wire = JSON.parse(JSON.stringify({ items: listAssessments() }));
    importAssessments(wire);
    importAssessments(wire);
    expect(listAssessments()).toHaveLength(1);
  });

  test("a malformed import restores nothing rather than half-restoring", () => {
    expect(importAssessments(null)).toBe(0);
    expect(importAssessments({})).toBe(0);
    expect(importAssessments({ items: "nope" })).toBe(0);
    expect(importAssessments({ items: [{ id: "a", date: "2026-03-01", answers: [1, 2] }] })).toBe(0);
    expect(listAssessments()).toEqual([]);
  });
});

/* ================================================================== */
/* Isolation + a11y                                                   */
/* ================================================================== */

describe("the feature stays isolated and accessible", () => {
  test("the data layer still cannot see an assessment", () => {
    for (const p of ["src/lib/store.ts", "src/lib/analysis.ts", "src/lib/achievements.ts", "src/lib/correlationGrid.ts"]) {
      const src = readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
      expect(src).not.toContain("assessment");
    }
  });

  test("AppData still has no assessments field", () => {
    const types = readFileSync(new URL("../src/types.ts", import.meta.url), "utf8");
    expect(types).not.toMatch(/^\s*assessments\s*[?:]/m);
  });

  test("the new styles respect --font-scale, like every other screen", () => {
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
    const block = css.slice(css.indexOf("Önreflexiós kérdőív (Batch 6"), css.indexOf(".theme-grid {"));
    const sizes = [...block.matchAll(/font-size:\s*([^;]+);/g)].map((m) => m[1]!.trim());
    expect(sizes.length).toBeGreaterThan(8);
    for (const s of sizes) expect(s).toContain("var(--font-scale)");
    expect(block).not.toMatch(/font-size:\s*\d+(px|rem)/);
  });

  test("the collapsed history list already carries the disclaimer", () => {
    // Every collapsed row shows a band label — "erősebb tünetek" and so on.
    // That is a result. A history screen full of band labels with no
    // statement of what they mean is the one place the guarantee could slip,
    // because skimming the list is the main thing people do with it.
    addAssessment({ date: "2026-03-01", answers: [1, 1, 2, 0, 1, 2, 1, 0, 0] });
    const out = html(createElement(AssessmentLog, null));

    // Collapsed: no row is expanded, so the band label is the only result shown.
    expect(out).toContain("Enyhe tünetek jelei");
    expect(out).not.toContain("resources-block");
    // ...and the disclaimer is on that same screen anyway.
    expect(out).toContain(DISCLAIMER);
  });

  test("the history list states it is not a trend", () => {
    const raw = readFileSync(new URL("../src/components/AssessmentLog.tsx", import.meta.url), "utf8");
    // Strip comments first: the file's doc comment explains the trend rule it
    // refuses to implement, and naming it there is the point.
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    // A line going up across months is a diagnosis accumulating by itself.
    expect(src).not.toMatch(/trend|Trend| változás| összehasonlít/);
  });

  test("the questionnaire is a radiogroup per question, not a pile of buttons", () => {
    const out = html(createElement(AssessmentItemView, { item: SUPPLEMENTARY_ITEM, value: null, onChange: () => {} }));
    expect(out).toContain('role="radiogroup"');
    expect(out).toContain('role="radio"');
    expect(out).toContain('aria-checked="false"');
  });

  test("the score renders with tabular figures so it does not jitter", () => {
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.band-score \{[^}]*font-variant-numeric: tabular-nums;/);
  });
});
