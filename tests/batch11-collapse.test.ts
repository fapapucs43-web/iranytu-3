/**
 * Batch 11, commit 1 — the collapsible cards' proof.
 *
 * What the commit promised, and what each block here pins:
 *  - a card is COLLAPSED BY DEFAULT and stores that under ONE key,
 *    `belso-iranytu:cardStates`, as `{ id: collapsed }`;
 *  - toggling flips the card and writes through, so a reload (a fresh module
 *    graph, a fresh shim) reopens exactly the cards the user left open;
 *  - the collapsed line is derived from the SAME `describeValue` the entry
 *    detail reads, so the summary and the journal cannot disagree — asserted
 *    per value KIND, table-driven, from the registry's own defs;
 *  - `prefers-reduced-motion: reduce` disables the height animation, pinned
 *    against styles.css as text (the same house pattern batch5-typography
 *    uses for CSS it cannot compute);
 *  - the four feature cards and the seven tracker groups are genuinely
 *    MOUNTED on CollapsibleCard — the HealthImportCard lesson: a component
 *    that compiles but is never rendered passes every unit test.
 *
 * AND, since Batch 13, commit 3, the SEVENTEEN the audit named as strong
 * candidates — twelve Settings rows and five Insights cards — are pinned the
 * same way. Phase 2's language switcher and this batch's two converted
 * drawers joined them, so the count below is twenty now; the properties the
 * set is pinned by are unchanged, and they are
 * two the first four cards never had to carry:
 *  - each one's SUMMARY LINE, read out of the rendered markup and compared
 *    against the registry that owns its wording, so a collapsed card cannot
 *    promise something the body would contradict;
 *  - each one's state round-tripping through `belso-iranytu:cardStates` and
 *    back, which is the property that makes collapsing them worth doing.
 *
 * Rendering uses `createElement` + `renderToStaticMarkup` with the real
 * providers (AppContext, IconSetContext), exactly as batch6-ui does; there
 * is no jsdom in this suite, so assertions run on markup, not on DOM events.
 * `renderToStaticMarkup` also runs no EFFECTS, which is why the
 * data-driven summaries are proven by seeding the store module before the
 * render rather than by clicking anything.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { t } from "../src/lib/i18n";
import CorrelationGrid from "../src/components/CorrelationGrid";
import LagAnalysisCard from "../src/components/LagAnalysisCard";
import ReportExport from "../src/components/ReportExport";
import MonthlyYearlyStats from "../src/components/MonthlyYearlyStats";
import AchievementsCard from "../src/components/AchievementsCard";
import Gad7Card from "../src/components/Gad7Card";
import CustomActivityManager from "../src/components/CustomActivityManager";
import AssessmentModule from "../src/components/AssessmentModule";
import SettingsView from "../src/views/SettingsView";
import TodayView from "../src/views/TodayView";
import { BADGES } from "../src/lib/achievements";
import { fontDef, handFontDef, HAND_FONTS } from "../src/lib/fonts";
import { iconSetDef } from "../src/lib/iconsets";
import { themeMeta } from "../src/lib/themes";
import { availableMonths, monthStat } from "../src/lib/statsAgg";
import { buildCorrelationGrid } from "../src/lib/correlationGrid";
import { DEFAULT_SETTINGS } from "../src/types";
import {
  CARD_STATES_KEY,
  NO_DATA_SUMMARY,
  loadCardStates,
  parseCardStates,
  resetCardStates,
  resetCardStatesForTests,
  setCardCollapsed,
  trackerGroupSummary,
} from "../src/lib/cardStates";
import {
  DEFAULT_ENABLED_TRACKERS,
  defaultTrackerValue,
  getTrackerDefs,
  isTrackerGroupEnabled,
  trackerGroupHeads,
  trackerGroupMembers,
} from "../src/lib/trackers";
import type { MergedTrackerDef } from "../src/lib/trackers";
import type { TrackerValue } from "../src/types";

/* --------------------- the storage shim, house shape --------------------- */

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
  resetCardStatesForTests();
});

/* ------------------------------- helpers -------------------------------- */

const { AppProvider } = await import("../src/state/AppContext");
const { IconSetProvider } = await import("../src/state/IconSetContext");
const { ThemeProvider } = await import("../src/state/ThemeContext");
const { FontProvider } = await import("../src/state/FontContext");
// The store module, not the context: its state is a module-level binding, so a
// seeded test can set it BEFORE the provider's `useState(store.getState())`
// ever runs. Going through `useApp().setSettings` inside the tree would not
// reach a static render — the provider's subscription lives in an effect, and
// a static render runs no effects.
const store = await import("../src/lib/store");

async function renderWithProviders(el: React.ReactElement): Promise<string> {
  const { CollapsibleCard } = await import("../src/components/ui/ui");
  return renderToStaticMarkup(
    createElement(AppProvider, null, createElement(IconSetProvider, null, el)),
  );
}

/** The provider stack the real App mounts, for views that need all four. */
function fullStack(el: React.ReactElement): string {
  return renderToStaticMarkup(
    createElement(
      AppProvider,
      null,
      createElement(ThemeProvider, null, createElement(FontProvider, null, createElement(IconSetProvider, null, el))),
    ),
  );
}

async function freshCard(id: string, title: string, summary?: string): Promise<string> {
  const { CollapsibleCard } = await import("../src/components/ui/ui");
  return renderWithProviders(
    createElement(
      CollapsibleCard,
      { id, title, icon: null, summary },
      createElement("p", null, "body"),
    ),
  );
}

function freshRead(id: string): boolean | undefined {
  resetCardStatesForTests(); // drop the module cache, keep the storage
  return loadCardStates()[id];
}

/** A group's values as the DAILY CARD holds them: each def at its default. */
function defaultsFor(ids: string[]): TrackerValue[] {
  return ids.map((id) => defaultTrackerValue(defsById.get(id)!));
}

const defsById = new Map(getTrackerDefs([]).map((d) => [d.id, d]));

/** Zip members and values the way trackerGroupSummary consumes them. */
function zip(ids: string[], values: TrackerValue[]) {
  return ids.map((id, i) => ({ def: defsById.get(id)!, value: values[i]! }));
}

/* =============== 1 · storage: one key, atomic, tolerant ================== */

describe("cardStates storage — one key, one read, tolerant", () => {
  test("the key is `belso-iranytu:cardStates` and nothing else is ever written", () => {
    setCardCollapsed("sleep", true);
    setCardCollapsed("sport", false);
    expect(Object.keys(backing)).toEqual([CARD_STATES_KEY]);
    expect(backing[CARD_STATES_KEY]!).toBe('{"sleep":true,"sport":false}');
  });

  test("fresh storage reads as an empty map — collapsed by default", () => {
    expect(loadCardStates()).toEqual({});
    expect(loadCardStates()["sleep"]).toBeUndefined();
  });

  test("a stored map round-trips through a cold read", () => {
    backing[CARD_STATES_KEY] = '{"nutrition":true,"steps":true,"sport":false}';
    resetCardStatesForTests();
    expect(loadCardStates()).toEqual({ nutrition: true, steps: true, sport: false });
  });

  test("garbage never crashes the read: JSON, wrong shapes, wrong value types", () => {
    for (const raw of ["not json", "null", "[1,2]", '"str"', "42", '{"a":1}', '{"a":"yes"}']) {
      backing[CARD_STATES_KEY] = raw;
      resetCardStatesForTests();
      const map = loadCardStates();
      expect(typeof map).toBe("object");
      expect(Object.values(map).every((v) => typeof v === "boolean")).toBe(true);
    }
    // `{"a":1}` keeps nothing — a number is not a collapsed flag.
    expect(parseCardStates('{"a":1}')).toEqual({});
    // A valid pair inside a broken blob still survives the parse.
    expect(parseCardStates('{"nutrition":true,"b":"x"}')).toEqual({ nutrition: true });
    expect(parseCardStates(null)).toEqual({});
    expect(parseCardStates("")).toEqual({});
  });
});

/* ============ 2 · component: collapsed by default, toggle, persist ======= */

describe("CollapsibleCard — collapsed by default, opens on toggle", () => {
  test("a fresh card renders collapsed: aria-expanded=false, body hidden", async () => {
    const html = await freshCard("sleep", "Alvás");
    expect(html).toContain('aria-expanded="false"');
    // React renders the `hidden` attribute as `hidden=""` — precise, because
    // `aria-hidden="true"` on the icon span contains the bare word too.
    expect(html).toContain('hidden=""');
    expect(html).toContain("collapsible-card-head");
    // The title is there; the body content is not drawn open.
    expect(html).toContain("Alvás");
  });

  test("toggling writes through, and a fresh read sees the card open", async () => {
    // The toggle is a real browser event; the suite has no DOM, so the
    // write-through is driven through the same functions the onClick calls.
    setCardCollapsed("sleep", false);
    expect(backing[CARD_STATES_KEY]).toContain('"sleep":false');
    // A new module read (the card's first useState read) sees it OPEN.
    const html = await freshCard("sleep", "Alvás");
    expect(html).toContain('aria-expanded="true"');
    expect(html).not.toContain('hidden=""');
    expect(html).toContain("collapsible-open");
  });

  test("persistence round-trip: collapse → fresh shim → still collapsed", () => {
    setCardCollapsed("nutrition", true);
    // Simulate the reload: same backing storage, cold module cache.
    resetCardStatesForTests();
    expect(loadCardStates()["nutrition"]).toBe(true);
  });

  test("expanding one card never expands another — ids are independent", () => {
    setCardCollapsed("sleep", false);
    setCardCollapsed("sport", true);
    expect(loadCardStates()["sleep"]).toBe(false);
    expect(loadCardStates()["sport"]).toBe(true);
  });

  test("the head carries the accessible summary: title, aria-expanded, aria-controls", async () => {
    const html = await freshCard("sport", "Sport", "futás · 30 perc");
    expect(html).toContain('aria-controls="card-body-sport"');
    expect(html).toContain("Sport");
    expect(html).toContain("futás · 30 perc");
    expect(html).toContain("collapsible-card-summary");
  });
});

/* ============ 3 · summaries: every value kind, from the registry ========= */

describe("trackerGroupSummary — one line per value kind, via describeValue", () => {
  test("slider with unit (sleep): `7,5 óra`", () => {
    expect(trackerGroupSummary(defsById.get("sleep")!, zip(["sleep"], [{ kind: "slider", value: 7.5 }]))).toBe(
      "7,5 óra",
    );
  });

  test("checkbox (symptoms): igen / nem — a real answer, never blank", () => {
    for (const flag of [true, false]) {
      expect(trackerGroupSummary(defsById.get("symptoms")!, zip(["symptoms"], [{ kind: "checkbox", value: flag }]))).toBe(
        flag ? "igen" : "nem",
      );
    }
  });

  test("select (sport) + number child (sport-duration): `futás · 30 perc`", () => {
    expect(
      trackerGroupSummary(
        defsById.get("sport")!,
        zip(["sport", "sport-duration"], [
          { kind: "select", value: "run" },
          { kind: "number", value: 30 },
        ]),
      ),
    ).toBe("futás · 30 perc");
  });

  test("flags (nutrition-flags) render as their Hungarian labels", () => {
    const line = trackerGroupSummary(
      defsById.get("nutrition")!,
      zip(["nutrition", "nutrition-note", "nutrition-calories", "nutrition-flags"], [
        { kind: "slider", value: 7 },
        { kind: "text", value: "" },
        { kind: "number", value: 2400 },
        { kind: "flags", value: { veg: true, protein: true } },
      ]),
    );
    // 7/10 — the slider has no unit, so it reads as a position on the scale;
    // the spec's own example is `Étkezés: 7/10 · 2400 kcal`.
    expect(line).toContain("7/10");
    expect(line).toContain("2400 kcal");
    expect(line).toContain("zöldség / gyümölcs");
    expect(line).toContain("fehérje");
    // An empty text child never reaches the line.
    expect(line).not.toContain("Mit ettél");
  });

  test("number with unit (weather-temp): `22 °C` alongside the head's answer", () => {
    const line = trackerGroupSummary(
      defsById.get("weather-condition")!,
      zip(["weather-condition", "weather", "weather-temp"], [
        { kind: "select", value: "sunny" },
        { kind: "text", value: "" },
        { kind: "number", value: 22 },
      ]),
    );
    expect(line).toBe("napsütéses · 22 °C");
  });

  test("text child (weather free text) reaches the line when the head has an answer", () => {
    const line = trackerGroupSummary(
      defsById.get("weather-condition")!,
      zip(["weather-condition", "weather", "weather-temp"], [
        { kind: "select", value: "rainy" },
        { kind: "text", value: "napos, hűvös" },
        { kind: "number", value: null },
      ]),
    );
    expect(line).toContain("napos, hűvös");
    expect(line).toContain("esős");
  });

  test("the house truth, pinned: what `describeValue` counts as recorded", () => {
    // These are `describeValue`'s existing rules — the summary reuses them
    // rather than inventing a second opinion:
    //  - a select's "" IS a real answer (the — nem sportoltam — default);
    //  - a slider at its midpoint IS a real answer, and a checkbox's `false`
    //    is a real "nem" — three kinds can never be blank;
    //  - a number null, an empty text and an all-off flags set are NOT recorded.
    // The summary keeps them verbatim so a collapsed card and the entry
    // detail can never disagree.
    const sleepDefault = defaultsFor(["sleep"])[0]! as { kind: "slider"; value: number };
    expect(sleepDefault.value).toBe(7); // midpoint of 0–14, step 0.5
    expect(trackerGroupSummary(defsById.get("sleep")!, zip(["sleep"], [sleepDefault]))).toBe("7 óra");
    expect(
      trackerGroupSummary(defsById.get("sport")!, zip(["sport", "sport-duration"], defaultsFor(["sport", "sport-duration"]))),
    ).toBe("— nem sportoltam —");
    expect(trackerGroupSummary(defsById.get("symptoms")!, zip(["symptoms"], defaultsFor(["symptoms"])))).toBe("nem");
    expect(trackerGroupSummary(defsById.get("steps")!, zip(["steps"], defaultsFor(["steps"])))).toBe(NO_DATA_SUMMARY);
  });

  test("nothing recorded anywhere in the group → the honest empty line", () => {
    expect(NO_DATA_SUMMARY).toBe("— ma még nincs adat");
    // The real blank case in the registry: Lépésszám, typed but left empty.
    expect(trackerGroupSummary(defsById.get("steps")!, zip(["steps"], [{ kind: "number", value: null }]))).toBe(
      NO_DATA_SUMMARY,
    );
    // And the shape any future text/number-only group hits: every member
    // unrecorded. (A slider/checkbox/select group can never get here — those
    // kinds are always recorded, which the test above pins.)
    const textOnly = {
      id: "custom-x",
      icon: "✨",
      label: "Saját",
      input: { kind: "text", placeholder: "…" },
    } as MergedTrackerDef;
    expect(trackerGroupSummary(textOnly, [{ def: textOnly, value: { kind: "text", value: "" } }])).toBe(
      NO_DATA_SUMMARY,
    );
  });

  test("all seven built-in groups can produce a summary without throwing", () => {
    for (const head of trackerGroupHeads()) {
      const members = trackerGroupMembers(head.id);
      const line = trackerGroupSummary(head as MergedTrackerDef, zip(members.map((m) => m.id), defaultsFor(members.map((m) => m.id))));
      expect(typeof line).toBe("string");
      expect(line.length).toBeGreaterThan(0);
    }
  });
});

/* ================= 4 · reduced motion + animation shape ================== */

describe("the height animation is real, and reduced-motion turns it off", () => {
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

  test("the collapse animates a grid row, 200ms", () => {
    expect(css).toContain("grid-template-rows: 0fr");
    expect(css).toContain("grid-template-rows: 1fr");
    expect(css).toMatch(/transition:\s*grid-template-rows 200ms/);
  });

  test("prefers-reduced-motion: reduce disables the transition", () => {
    const block = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(block).toContain("transition: none");
  });

  test("the head clears the 44px tap target", () => {
    expect(css).toMatch(/\.collapsible-card-head\s*{[^}]*min-height: 44px/s);
  });
});

/* ========= 4b · the nested-card fix — the open state's scope ============ */

describe("an open card's rules reach only its own body", () => {
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  // Comments stripped first: the why-note above the block NAMES the
  // descendant form it removed, so a sweep that reads comments would fail on
  // the explanation of why the sweep exists.
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const openRules = [...rules.matchAll(/\.collapsible-open[^{};]*\{/g)].map((m) => m[0].trim());

  test("every .collapsible-open selector is a direct child, never a descendant", () => {
    // THE READER'S REPORT, as a test: the cards INSIDE the Ma tab's
    // "Nyomonkövetés" frame ("Alvás", "Tünetek") and inside the Egészség
    // tab's "Egyéb" section drew a chevron and did nothing when clicked.
    // The click was never lost — `aria-expanded` and `hidden` both flipped —
    // but `.collapsible-open .collapsible-card-body` is a DESCENDANT
    // selector: inside an OPEN outer card it out-specified the nested card's
    // own rules (0-2-0 against 0-1-0) and pinned every nested body to
    // `grid-template-rows: 1fr` + `visibility: visible`, so the collapsed
    // state existed in the DOM and not on the screen. At `>` scope a card's
    // open state is its own, and a nested card collapses like a top-level
    // one. The floor is what keeps the loop below from passing on an empty
    // sweep — deleting the rules entirely must not read as a passing guard.
    expect(openRules.length).toBeGreaterThanOrEqual(4);
    for (const sel of openRules) expect(sel).toMatch(/^\.collapsible-open\s*>/);
    expect(rules, "the descendant form must not come back").not.toContain(
      ".collapsible-open .",
    );
  });

  test("the rule the nesting broke is still there, at that scope", () => {
    // Guard against winning the scope war by deleting the rule: an open card
    // must still open its own body to `1fr`, which is the half of the
    // animation the direct-child scope has to preserve.
    expect(rules).toMatch(
      /\.collapsible-open > \.collapsible-card-body \{\s*grid-template-rows: 1fr;/,
    );
  });
});

/* ============ 5 · the mount proof — cards really wrapped, in place ======= */

describe("every specified card is mounted on CollapsibleCard", () => {
  const read = (p: string): string => readFileSync(new URL(p, import.meta.url), "utf8");

  test("the four feature cards render as CollapsibleCard, with ids and summaries", () => {
    // `title` may be a literal or a catalogue lookup, because the toolbox's
    // copy moved into `lib/i18n.ts`. What is asserted either way is the words:
    // whichever way the card names itself, it still names itself the same.
    const cards: [string, string, string][] = [
      ["src/components/HealthImportCard.tsx", "health-import", "Okosóra import"],
      ["src/components/FoodAiSettingsCard.tsx", "food-ai-settings", "Étkezés AI — fotóelemzés"],
      ["src/components/FoodPhotoCapture.tsx", "food-photo", "Étkezés fotóból"],
      ["src/components/WeatherApiCard.tsx", "weather-api", "Időjárás automatikusan"],
    ];
    for (const [path, id, title] of cards) {
      const src = read(`../${path}`);
      expect(src, path).toContain("<CollapsibleCard");
      expect(src, path).toContain(`id="${id}"`);
      // The title is either a literal or a catalogue lookup, and BOTH branches
      // are checked against the WORDS rather than against a list of approved
      // spellings of the mechanism. An earlier version allow-listed one exact
      // key string, which meant adding a second card that had been swept
      // turned this assertion red for the wrong reason — and the fix is to
      // resolve whatever key it finds.
      const literal = src.includes(`title="${title}"`);
      const key = /title=\{t\("([^"]+)"\)\}/.exec(src)?.[1];
      const looked = key !== undefined && t(key as never) === title;
      expect(literal || looked, `${path}: no title resolving to "${title}" (key: ${key})`).toBe(true);
      expect(src, path).toContain("summary=");
      // No stray Card usage left in the component's return.
      expect(src, path).not.toMatch(/<Card\s/);
    }
    // And the lookup really resolves to the words the test expects, so the
    // branch above cannot pass on a key that says something else.
    expect(t("tools.foodPhoto.title")).toBe("Étkezés fotóból");
  });

  test("TrackerInputs wraps each group: seven groups, ids derived from head ids", () => {
    const src = read("../src/components/TrackerInputs.tsx");
    expect(src).toContain("<CollapsibleCard");
    expect(src).toContain("tracker-${head.id}");
    // And the FRAME above them, which the reader reported as the card that
    // would not collapse: it used to be a `<section className="card">` with a
    // `<div className="card-head">` — a title, an icon, and no chevron or
    // `aria-expanded`, so it looked like the group cards it contained and did
    // nothing. A plain card head here is now a failure, and `defaultOpen` is
    // the half of the fix that keeps the day's work visible on first sight.
    expect(src, "the frame must not be a plain card head again").not.toContain(
      '<div className="card-head">',
    );
    expect(src).toContain('id="tracker-frame"');
    expect(src).toContain("defaultOpen");
    // The seven group heads the registry declares — one card each.
    expect(trackerGroupHeads().map((h) => h.id)).toEqual([
      "sleep",
      "symptoms",
      "vitamins",
      "weather-condition",
      "nutrition",
      "sport",
      "steps",
    ]);
  });

  test("the views still mount the components — the HealthImportCard lesson", () => {
    const settings = read("../src/views/SettingsView.tsx");
    expect(settings).toContain("<WeatherApiCard />");
    expect(settings).toContain("<FoodAiSettingsCard />");
    expect(settings).toContain("<HealthImportCard />");
    const today = read("../src/views/TodayView.tsx");
    expect(today).toContain("<TrackerInputs");
    // The food card went with the toolbox (Batch 14), and then with the health
    // half of the record to the sixth tab — the mount follows the card, not
    // the page it started on.
    const health = read("../src/views/HealthView.tsx");
    expect(health).toContain("<FoodPhotoCapture />");
  });

  test("the mood picker, the nav and the Settings rows are untouched", () => {
    // Scope guard: commit 1 wraps cards, nothing else. The mood picker has no
    // collapsible, the bottom nav imports nothing from cardStates, and the
    // Settings rows draw their own Toggles inside the wrapped cards only.
    const nav = read("../src/components/BottomNav.tsx");
    expect(nav).not.toContain("CollapsibleCard");
    expect(nav).not.toContain("cardStates");
    const today = read("../src/views/TodayView.tsx");
    expect(today).not.toContain("mood-picker-collapsible");
  });

  test("the storage shape stays in one house-convention key", () => {
    // A second key here would mean N reads on boot — the thing decision A
    // exists to prevent. The component's only storage call sites are the two
    // helpers, and the helpers write exactly one key.
    const ui = read("../src/components/ui/ui.tsx");
    expect(ui).toContain("loadCardStates");
    expect(ui).toContain("setCardCollapsed");
    expect(ui).not.toContain("localStorage");
  });
});

/* ====== 6 · Batch 13, commit 3 — the strong cards (18 after Phase 2) === */

/* ------------------------- markup surgery ---------------------------- */

/**
 * One card's own head and body, sliced out of a whole page's markup.
 *
 * Scoped rather than whole-page, because "is this card open?" cannot be
 * answered from the page: a page that has six collapsed cards contains
 * `hidden=""` six times. The slice runs from this card's HEAD BUTTON to the
 * next card's — `aria-controls="card-body-<id>"` appears exactly once per
 * CollapsibleCard, so it is both the anchor and the terminator, and it is the
 * same attribute the component's accessibility contract already states.
 *
 * The start is the `<button` that carries that attribute rather than the
 * attribute itself, because React emits `aria-expanded` BEFORE `aria-controls`
 * on the same element: anchoring on the attribute would cut the very
 * attribute an expanded card is asserted on. That mistake is silent — the
 * collapsed assertions keep passing, because the body's `hidden` attribute
 * comes later — so only the "is it open?" half of the suite goes red.
 */
function cardSlice(html: string, id: string): string {
  const marker = `aria-controls="card-body-${id}"`;
  const attr = html.indexOf(marker);
  if (attr < 0) throw new Error(`no collapsible card with id "${id}" in this markup`);
  const start = html.lastIndexOf("<button", attr);
  if (start < 0) throw new Error(`card "${id}" has an aria-controls but no head button`);
  const nextAttr = html.indexOf('aria-controls="card-body-', attr + marker.length);
  const next = nextAttr < 0 ? -1 : html.lastIndexOf("<button", nextAttr);
  return next < 0 ? html.slice(start) : html.slice(start, next);
}

/** The collapsed line under the title — the whole point of a collapsed card. */
function summaryOf(html: string, id: string): string {
  const m = /<span class="collapsible-card-summary">([^<]*)<\/span>/.exec(cardSlice(html, id));
  if (!m) throw new Error(`card "${id}" renders no summary line`);
  return m[1]!;
}

/** Collapsed means `hidden` on the BODY — the exact attribute pair React emits. */
function isCollapsed(html: string, id: string): boolean {
  return cardSlice(html, id).includes(`<div id="card-body-${id}" class="collapsible-card-body" hidden="">`);
}

function isOpen(html: string, id: string): boolean {
  return cardSlice(html, id).includes(`<div id="card-body-${id}" class="collapsible-card-body">`);
}

/**
 * The vacuity guard, once, so every table below is checked by the same rule.
 *
 * `expect(got).toBe(expected)` PASSES when `expected` happens to be a
 * function, because the matcher compares identity and nothing throws. A
 * table row written as `["id", "Title", someHelper()]` that forgot to
 * interpolate its value would therefore assert `Function === Function` and
 * prove nothing at all. Throwing here turns that silent pass into a failure
 * that names the mistake.
 */
function expectLine(value: unknown, what: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${what} is not a non-empty string — the expected-summary table is wrong, not the app`);
  }
  return value;
}

/* --------------------------- the tables ----------------------------- */

/**
 * What each collapsed card says on a FRESH install: id, title, summary.
 *
 * The eleven Settings rows the audit named, plus the five Insights cards.
 *
 * Every count and every label that a REGISTRY owns is read from that
 * registry rather than typed here — `fontDef`, `iconSetDef`, `themeMeta`,
 * `trackerGroupHeads`, `BADGES`, `availableMonths`/`monthStat`. Re-typing
 * them would be a second opinion that goes stale the moment somebody renames
 * a theme, and the cost of that is not a red test: it is a collapsed card
 * saying "Világos" over a body whose button says "Sötét". The WORDING is
 * still pinned — hardcoded below wherever it is the card's own voice — so
 * this table cannot drift into agreeing with a regression.
 */
/**
 * Phase 1 moved these two to the toolbox, where a reader who meets the tip can
 * also meet where the tip came from; Batch 14 moved the toolbox to a tab of its
 * own. They keep their card ids, so their remembered open state is untouched —
 * only the page that draws them changed, and every assertion below that used to
 * cover them now names ToolsView.
 */
const MOVED_TO_TODAY: readonly (readonly [string, string, string])[] = [
  ["settings-nutrition-tips", "Táplálkozási tippek", "Átláthatóság: mit írhat ki a napló?"],
  ["settings-sport-tips", "Sportolási tippek", "Átláthatóság: mit írhat ki a mozgásbejegyzés?"],
];

const SETTINGS_CARDS: readonly (readonly [string, string, string])[] = [
  ["settings-profile", "Profil", "Név és cél megadása"],
  // Phase 2 — the language switcher. It leads the appearance group, so it is
  // listed here in the order the page draws it: a collapsed row whose summary
  // names the language in force, which on a fresh install is Hungarian.
  ["settings-language", "Nyelv", "Magyar felület"],
  ["settings-accessibility", "Könnyebb használat", "Normál betűméret"],
  ["settings-font", "Betűtípus", fontDef(DEFAULT_SETTINGS.fontFamily ?? "inter").label],
  ["settings-iconset", "Ikonok és emoji", iconSetDef(DEFAULT_SETTINGS.iconSet).label],
  ["settings-navigation", "Navigáció", "Az alsó sáv mindig látszik"],
  [
    "settings-theme",
    "Téma",
    themeMeta().find((t) => t.name === DEFAULT_SETTINGS.theme)?.label ?? "Világos",
  ],
  // The background-image layer. A LAYER, not a seventh theme, so it is its own
  // row rather than a tile in the grid above — which is why the summary is a
  // plain present/absent sentence and the fresh-install value is "Nincs
  // beállítva". Derived from the same store field the picker writes, so the
  // collapsed line cannot promise a picture the body would refuse to show.
  ["settings-background", "Háttérkép", DEFAULT_SETTINGS.backgroundImage ? "Egyéni kép beállítva" : "Nincs beállítva"],
  [
    "settings-trackers",
    "Nyomonkövetés",
    `${trackerGroupHeads().filter((h) => isTrackerGroupEnabled(DEFAULT_ENABLED_TRACKERS, h)).length} / ${
      trackerGroupHeads().length
    } csoport bekapcsolva`,
  ],
  ["settings-modules", "Modulok", "2 / 5 modul bekapcsolva"],
  ["settings-privacy", "Adatvédelem", "Minden adat ezen a készüléken marad."],
  // Batch A — the mood recorder switch; the fresh-install summary is the
  // new flow, which is the default by absence.
  ["settings-mood-flow", "Hangulat rögzítése", "Új: 4-kvadráns"],
  // Batch 15 — the allergen list. The fresh-install summary is the OFF one,
  // because a reader who has marked nothing is the state every blob starts in.
  ["settings-allergies", "Étrend és allergiák", "Nincs megjelölt allergén"],
  // fix/card-state-and-full-audit, Phase 2 — the two drawers that used to be
  // session-local `Collapsible`s. The rows pin exactly what the conversion
  // promised: same id (a stored arrangement's vocabulary), same title, and a
  // summary line the collapsed tile shows — which is what makes remembering
  // them safe.
  ["settings-data", "Adatok és mentés", "Export, import és minden adat törlése"],
  [
    "settings-voice",
    "Hangból bejegyzés",
    "Hangból hangulat, stressz, energia és tevékenység",
  ],
];

const INSIGHTS_CARDS: readonly (readonly [string, string, string])[] = [
  ["insights-correlation", "Hatásmátrix", "Még nincs elég adat"],
  ["insights-lag", "Melyik tevékenység jött vissza később?", "Legalább 4 bejegyzés és 2 azonos tevékenység kell"],
  ["insights-report-export", "Jelentés export", "Nincs exportálható adat"],
  ["insights-achievements", "Mérföldkövek", `0 / ${BADGES.length} kitüntetés`],
];

const INSIGHT_COMPONENTS: Record<string, () => React.ReactElement> = {
  "insights-correlation": () => createElement(CorrelationGrid),
  "insights-lag": () => createElement(LagAnalysisCard),
  "insights-report-export": () => createElement(ReportExport),
  "insights-monthly-yearly": () => createElement(MonthlyYearlyStats),
  "insights-achievements": () => createElement(AchievementsCard),
};

/** The same five ids, as a set — the order in the map above is not the contract. */
const INSIGHT_IDS: readonly string[] = Object.keys(INSIGHT_COMPONENTS);

/**
 * Every id this commit added, in the order the audit listed them.
 *
 * The name is the Batch 13 audit's number, kept because it is the name four
 * tests and two doc blocks know this set by. Phase 2's `settings-language`
 * joined `SETTINGS_CARDS` above, and this batch's `settings-data` and
 * `settings-voice` followed it, so the ARRAY is twenty long while the
 * identifier still says seventeen — the count that matters is read off the
 * array, never off the name.
 */
const SEVENTEEN: readonly string[] = [
  ...SETTINGS_CARDS.map(([id]) => id),
  "insights-monthly-yearly",
  ...INSIGHTS_CARDS.map(([id]) => id),
];

describe("Batch 13, commit 3 — the strong cards (twenty since this batch)", () => {
  /**
   * The store is a MODULE binding, and bun runs every test file in one
   * process, so its state is shared across files. `batch7-store` and
   * `batch7-ui` both leave `settings.iconSet: "fluent"` behind (the retired-set
   * migration and `withSet`), and a summary test that inherits it fails with
   * "expected Lucide, received Fluent 3D" — a failure in a file that never
   * touched an icon set, and one that vanishes when the file is run alone.
   *
   * Resetting only AFTER each test would make this file a good citizen but
   * leave it a bad guest, so it resets BOTH ways: before, because somebody
   * else dirtied it; after, because the summaries this file reads are the ones
   * a later file would inherit.
   */
  beforeEach(() => {
    store.resetAll();
  });
  afterEach(() => {
    store.resetAll();
  });

  /* ---- mounted, collapsed by default ---- */

  test("all fifteen Settings rows are mounted, collapsed, and carry a summary", () => {
    const html = fullStack(createElement(SettingsView));
    // A whole-page count, because a table of `toContain` calls passes happily
    // if a card is really a plain `<Card>` further down and its id happens to
    // appear in a comment. The count is the array above (fifteen rows since
    // this batch converted the two data/voice drawers) plus the Batch 11
    // feature cards that already lived here.
    // Twenty-six: the sixteen Settings rows plus the Batch 11 feature cards
    // that already lived here (Batch 15 added the allergen list, Phase 2 the
    // language switcher), plus the eight cards Phase 2b made collapsible on
    // this page (backup, pin, reminder, update, install, custom theme, custom
    // trackers, med times) and the custom-ACTIVITY manager the 2026-10
    // completion converted beside its twin, the tracker manager. The two
    // transparency cards left for the toolbox and are covered by the ToolsView
    // assertion below. The last two of the twenty-six are the data/voice
    // drawers fix/card-state-and-full-audit converted from the session-local
    // `Collapsible` — with the meds module off, as here.
    expect((html.match(/collapsible-card-head/g) ?? []).length).toBe(26);
    for (const [id, title, summary] of SETTINGS_CARDS) {
      expect(html, id).toContain(`aria-controls="card-body-${id}"`);
      expect(isCollapsed(html, id), `${id} must be collapsed by default`).toBe(true);
      expect(summaryOf(html, id), `${id} summary`).toBe(expectLine(summary, id));
      const slice = cardSlice(html, id);
      expect(slice, `${id} title`).toContain(title);
      // The head is a real button, so it is reachable by keyboard and the
      // state is announced — a `<div onClick>` would say the same words.
      expect(slice, `${id} head`).toContain('type="button"');
      expect(slice, `${id} aria-expanded`).toContain('aria-expanded="false"');
    }
  });

  test("the two transparency cards moved on to the Egészség tab", () => {
    // Source-level on purpose. A toolbox drawer is a `Collapsible` with
    // `defaultOpen = false`, and it renders `{isOpen && children}` — so a
    // server render of the Felfedezés tab draws the four drawer heads and none
    // of their bodies. The cards left that drawer entirely with the health
    // half of the record, and they live in the sixth tab's sections now.
    //
    // So what can be asserted is where they live and under what key, which is
    // the half that would actually break: a card that had moved to no page at
    // all, or that drew its remembered state from a second key and came back
    // open for nobody.
    const src = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
    const health = src("../src/views/HealthView.tsx");
    const tools = src("../src/views/ToolsView.tsx");
    const settings = src("../src/views/SettingsView.tsx");
    // Each card sits inside the section that owns its subject: the nutrition
    // tips in Táplálkozás, the sport tips in Edzés.
    const nutrition = health.slice(
      health.indexOf('id="health-nutrition"'),
      health.indexOf('id="health-training"'),
    );
    const training = health.slice(
      health.indexOf('id="health-training"'),
      health.indexOf('id="health-general"'),
    );
    expect(nutrition, "settings-nutrition-tips must be in Táplálkozás").toContain(
      'id="settings-nutrition-tips"',
    );
    expect(training, "settings-sport-tips must be in Edzés").toContain(
      'id="settings-sport-tips"',
    );
    for (const [id] of MOVED_TO_TODAY) {
      // The id is the key their remembered open state is stored under; a
      // renamed id would silently reset that state for every reader.
      expect(health, `${id} must be on the health tab`).toContain(`id="${id}"`);
      expect(tools, `${id} must be gone from Felfedezés`).not.toContain(`id="${id}"`);
      expect(settings, `${id} must be gone from Settings`).not.toContain(`id="${id}"`);
    }
  });

  test("all five Insights cards are mounted, collapsed, and carry a summary", () => {
    for (const [id, title, summary] of INSIGHTS_CARDS) {
      const html = fullStack(INSIGHT_COMPONENTS[id]!());
      expect(html, id).toContain(`aria-controls="card-body-${id}"`);
      expect(isCollapsed(html, id), `${id} must be collapsed by default`).toBe(true);
      expect(summaryOf(html, id), `${id} summary`).toBe(expectLine(summary, id));
      expect(cardSlice(html, id), `${id} title`).toContain(title);
    }
  });

  test("the sixth Insights card names its PERIOD, not just a count", () => {
    const html = fullStack(INSIGHT_COMPONENTS["insights-monthly-yearly"]!());
    // With no entries `availableMonths` still offers the current month, so
    // this card's headline fact is WHICH period is selected. Deriving the
    // expected label from `statsAgg` rather than writing "Szeptember 2026"
    // is what keeps the test honest in October — and a hardcoded month name
    // would have failed every month but one, which is a test people learn to
    // re-record instead of read.
    const thisMonth = availableMonths([])[0];
    expect(thisMonth, "an empty journal still offers the current month").toMatch(/^\d{4}-\d{2}$/);
    const stat = monthStat([], thisMonth);
    expect(stat.daysLogged).toBe(0);
    expect(isCollapsed(html, "insights-monthly-yearly")).toBe(true);
    expect(summaryOf(html, "insights-monthly-yearly")).toBe(
      `${stat.label} · ${stat.daysLogged} naplózott nap`,
    );
  });

  /* ---- the summaries are DATA, not decoration ---- */

  test("the summaries read the store: a seeded install says something else", () => {
    const base = store.getState();
    store.setSettings({
      ...base.settings,
      theme: "dark",
      textSize: "xlarge",
      highContrast: true,
      autoHideNav: true,
      fontFamily: "lora",
      iconSet: "fluent",
      tabOrder: ["ma", "naplo"],
    });
    const html = fullStack(createElement(SettingsView));
    const dark = themeMeta().find((t) => t.name === "dark")!.label;
    expect(summaryOf(html, "settings-theme")).toBe(dark);
    expect(summaryOf(html, "settings-accessibility")).toBe("Nagyon nagy betűméret · nagy kontraszt");
    expect(summaryOf(html, "settings-navigation")).toBe("Az alsó sáv görgetésre elrejtődik · fülek átrendezve");
    expect(summaryOf(html, "settings-font")).toBe(fontDef("lora").label);
    expect(summaryOf(html, "settings-iconset")).toBe(iconSetDef("fluent").label);
    // A custom typeface is an OPT-IN, so it is named only when it is chosen;
    // this install still has the default and must not claim one.
    expect(summaryOf(html, "settings-font")).not.toContain("kézírás");
    expect(handFontDef(HAND_FONTS[0]!.id).id).toBe(HAND_FONTS[0]!.id);
  });

  test("a named typeface DOES reach the summary — the opt-in is visible", () => {
    store.setSettings({
      ...store.getState().settings,
      handFont: HAND_FONTS[1]!.id,
    });
    const html = fullStack(createElement(SettingsView));
    expect(summaryOf(html, "settings-font")).toBe(
      `${fontDef(DEFAULT_SETTINGS.fontFamily ?? "inter").label} · kézírás: ${HAND_FONTS[1]!.label}`,
    );
  });

  test("an Insights summary counts real entries instead of saying none", () => {
    const today = new Date().toISOString().slice(0, 10);
    store.saveEntry({ date: today, mood: 4, stress: 4, energy: 5, activities: ["🚶 Mozgás", "🎵 Zene"] });
    store.saveEntry({ date: "2026-09-01", mood: 5, stress: 3, energy: 6, activities: ["🚶 Mozgás"] });
    const exportHtml = fullStack(INSIGHT_COMPONENTS["insights-report-export"]!());
    expect(summaryOf(exportHtml, "insights-report-export")).toBe("PDF vagy CSV a(z) 2 bejegyzésből");
    // And the matrix, which counts ACTIVITIES rather than entries. The row
    // count is pinned — two activities across the two days, from the
    // built-in list, with no custom activity on either entry.
    const gridHtml = fullStack(INSIGHT_COMPONENTS["insights-correlation"]!());
    const grid = buildCorrelationGrid({
      entries: store.getState().entries,
      customActivities: [],
      customNumericTrackers: [],
    });
    expect(grid.rows.length).toBe(2);
    // The OUTCOME count is deliberately left as a pattern: the component
    // reads custom trackers from a module-level registry that another test
    // file can have populated, and a number there would measure that file's
    // leftovers rather than this one. The empty-state line is the thing that
    // must be gone, and it is checked exactly.
    expect(summaryOf(gridHtml, "insights-correlation")).not.toBe("Még nincs elég adat");
    expect(summaryOf(gridHtml, "insights-correlation")).toMatch(/^2 tevékenység × \d+ mérhető eredmény$/);
    // The month/year card's count moves with the same data.
    const period = availableMonths(store.getState().entries)[0];
    const stat = monthStat(store.getState().entries, period);
    const periodHtml = fullStack(INSIGHT_COMPONENTS["insights-monthly-yearly"]!());
    expect(summaryOf(periodHtml, "insights-monthly-yearly")).toBe(
      `${stat.label} · ${stat.daysLogged} naplózott nap`,
    );
  });

  /**
   * Rendered TOGETHER, because "one page, five cards" is the only rendering
   * in which a duplicated id can misbehave: rendered one at a time, two
   * cards claiming `insights-lag` would each look perfectly correct, and the
   * failure would only appear as a user opening the Elemzési fül and finding
   * two cards that expand and collapse in lockstep. `loadCardStates()[id]`
   * makes that failure free to write and invisible to review, so it is
   * pinned here on the real combined markup rather than assumed away.
   */
  function insightsPage(): string {
    return fullStack(
      createElement("div", null, ...Object.values(INSIGHT_COMPONENTS).map((render) => render())),
    );
  }

  test("the five Insights cards share a page and keep their own state", () => {
    const ids = [...insightsPage().matchAll(/aria-controls="card-body-([^"]+)"/g)].map((m) => m[1]!);
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size, "two cards on one page share a storage id").toBe(5);
    expect(ids.sort()).toEqual([...INSIGHT_IDS].sort());

    const collapsed = insightsPage();
    for (const id of ids) expect(isCollapsed(collapsed, id), `${id} default`).toBe(true);

    setCardCollapsed("insights-lag", false);
    resetCardStatesForTests();
    const opened = insightsPage();
    expect(isOpen(opened, "insights-lag")).toBe(true);
    for (const id of ids.filter((i) => i !== "insights-lag")) {
      expect(isCollapsed(opened, id), `${id} followed insights-lag`).toBe(true);
    }
  });

  /* ---- persistence: the reason to collapse at all ---- */

  test("all twenty come back OPEN after a reload that left them open", () => {
    // A DELTA, not a total: the store's own `belso-iranytu-data-v2` is
    // already in storage because the `beforeEach` above reset it. The claim
    // under test is that writing twenty card flags introduces exactly ONE
    // new key, which a before/after diff states precisely and a total cannot.
    const before = new Set(Object.keys(backing));
    for (const id of SEVENTEEN) setCardCollapsed(id, false);
    expect(Object.keys(backing).filter((k) => !before.has(k))).toEqual([CARD_STATES_KEY]);
    // The reload: same bytes in storage, cold module cache.
    resetCardStatesForTests();
    expect(Object.keys(loadCardStates())).toHaveLength(SETTINGS_CARDS.length + 5);

    const settingsHtml = fullStack(createElement(SettingsView));
    for (const [id] of SETTINGS_CARDS) {
      expect(isOpen(settingsHtml, id), `${id} should be open after the round trip`).toBe(true);
      expect(cardSlice(settingsHtml, id)).toContain('aria-expanded="true"');
    }
    for (const [id] of INSIGHTS_CARDS) {
      const html = fullStack(INSIGHT_COMPONENTS[id]!());
      expect(isOpen(html, id), `${id} should be open after the round trip`).toBe(true);
    }
    const periodHtml = fullStack(INSIGHT_COMPONENTS["insights-monthly-yearly"]!());
    expect(isOpen(periodHtml, "insights-monthly-yearly")).toBe(true);
  });

  test("opening one of the twenty leaves the other nineteen alone", () => {
    setCardCollapsed("settings-theme", false);
    resetCardStatesForTests();
    const html = fullStack(createElement(SettingsView));
    expect(isOpen(html, "settings-theme")).toBe(true);
    for (const [id] of SETTINGS_CARDS.filter(([id]) => id !== "settings-theme")) {
      expect(isCollapsed(html, id), `${id} must not follow ${"settings-theme"}`).toBe(true);
    }
    // The Batch 11 cards in the same view are untouched by a new id too.
    for (const id of ["weather-api", "food-ai-settings", "health-import"]) {
      expect(isCollapsed(html, id), `${id} must stay collapsed`).toBe(true);
    }
  });

  test("an ABSENT id is collapsed, and only an explicit false opens one", () => {
    // The store may hold other cards' flags without ever having seen these.
    setCardCollapsed("sleep", false);
    resetCardStatesForTests();
    const html = fullStack(createElement(SettingsView));
    for (const [id] of SETTINGS_CARDS) {
      expect(loadCardStates()[id], `${id} was never written`).toBeUndefined();
      expect(isCollapsed(html, id), `${id} absent must read as collapsed`).toBe(true);
    }
  });

  /* ---- reduced motion reaches the new cards ---- */

  test("the reduced-motion block names the body's three states, and comes last", () => {
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
    // TWO reduced-motion blocks exist: a global `transition-duration: 0.01ms`
    // one, and this card-specific `transition: none` one. The section-4 test
    // above slices from the FIRST, so it would be satisfied by the global
    // rule alone; this one locates the second and insists it names the
    // selectors. Same specificity, so source order is what decides — a block
    // moved above the transition it cancels would leave the animation running
    // for exactly the people who asked for it not to.
    const first = css.indexOf("@media (prefers-reduced-motion: reduce)");
    expect(first).toBeGreaterThan(-1);
    const second = css.indexOf("@media (prefers-reduced-motion: reduce)", first + 10);
    expect(second, "a second, card-specific reduced-motion block must exist").toBeGreaterThan(first);
    const block = css.slice(second, css.indexOf("\n}", second) + 2);
    expect(block).toContain(".collapsible-card-body,");
    expect(block).toContain(".collapsible-card-body[hidden],");
    // `>` rather than the descendant form: the open state's SCOPE is the
    // nested-card fix, and section 4b pins it for every rule.
    expect(block).toContain(".collapsible-open > .collapsible-card-body");
    expect(block).toContain("transition: none");
    expect(second).toBeGreaterThan(css.indexOf("transition: grid-template-rows 200ms"));
  });

  test("the new cards animate with the SHARED class, not a hand-rolled style", () => {
    // Reduced motion is a property of the CSS, so a card that carried its own
    // inline transition would quietly opt out of it — and nothing else in
    // this file could see that.
    const read = (p: string): string => readFileSync(new URL(p, import.meta.url), "utf8");
    const files = [
      "../src/views/SettingsView.tsx",
      "../src/components/CorrelationGrid.tsx",
      "../src/components/LagAnalysisCard.tsx",
      "../src/components/ReportExport.tsx",
      "../src/components/MonthlyYearlyStats.tsx",
      "../src/components/AchievementsCard.tsx",
    ];
    for (const file of files) {
      const src = read(file);
      expect(src, file).toContain("<CollapsibleCard");
      expect(src.match(/<CollapsibleCard/g)!.length, file).toBeGreaterThan(0);
      expect(src, file).not.toMatch(/<CollapsibleCard[^>]*\sstyle=/s);
      expect(src, file).not.toMatch(/<Card[\s>]/);
      expect(src, file).not.toContain("aria-expanded");
    }
  });

  /* ---- the HealthImportCard lesson, again ---- */

  test("InsightsView still mounts all five — a card nobody renders proves nothing", () => {
    const src = readFileSync(new URL("../src/views/InsightsView.tsx", import.meta.url), "utf8");
    for (const name of ["CorrelationGrid", "LagAnalysisCard", "ReportExport", "MonthlyYearlyStats", "AchievementsCard"]) {
      expect(src, name).toContain(`<${name} />`);
    }
    // SettingsView kept the three Batch 11 cards it always had.
    const settings = readFileSync(new URL("../src/views/SettingsView.tsx", import.meta.url), "utf8");
    for (const name of ["WeatherApiCard", "FoodAiSettingsCard", "HealthImportCard"]) {
      expect(settings, name).toContain(`<${name} />`);
    }
  });

  test("the twenty ids are distinct — CollapsibleCard keys its state BY ID", () => {
    // Two cards sharing an id would share one flag, and the first click would
    // open both. Cheap to check, and the failure is invisible in review.
    expect(new Set(SEVENTEEN).size).toBe(SEVENTEEN.length);
    // …and none of them collides with an id the app already uses.
    const existing = [
      ...["weather-api", "food-ai-settings", "food-photo", "health-import"],
      ...trackerGroupHeads().map((h) => `tracker-${h.id}`),
    ];
    for (const id of SEVENTEEN) expect(existing, `${id} is new`).not.toContain(id);
    for (const id of existing) expect(SEVENTEEN, `${id} already existed`).not.toContain(id);
  });
});

/* ========= the 2026-10 completion: the eight converted cards ========== */

/**
 * The audit `docs/collapsible-complete-audit.md` named eight stragglers and
 * Phase 2 converted them. What was NOT already covered by the generic
 * properties is pinned here: the eight exist as mounts (the audit's promise),
 * the three component files render COLLAPSED with a live summary (a summary
 * that could be blank was the failure mode the user actually reported), and a
 * remembered open state round-trips through storage into the next render.
 *
 * The five ToolsView-local cards are asserted at SOURCE level for the same
 * reason the transparency-card move is: a tools drawer is a session-local
 * `Collapsible` whose body renders only when open, so a static render of the
 * tab draws the five drawer heads and none of the cards inside them.
 */
describe("the completion's eight cards — collapsed, summarised, remembered", () => {
  test("the three component cards render collapsed by default, each with a live summary", () => {
    const gad = fullStack(createElement(Gad7Card));
    expect(gad, "gad7 must mount as a remembering card").toContain(
      'aria-controls="card-body-tools-gad7"',
    );
    expect(gad).toContain('aria-expanded="false"');
    // Precise, because `hidden` also appears inside `aria-hidden`.
    expect(gad).toContain('hidden=""');
    expect(summaryOf(gad, "tools-gad7")).toContain("0/7 kitöltve");

    const acts = fullStack(createElement(CustomActivityManager));
    expect(acts).toContain('aria-controls="card-body-settings-custom-activities"');
    expect(summaryOf(acts, "settings-custom-activities")).toContain("Nincs saját címke");

    const mod = fullStack(createElement(AssessmentModule));
    expect(mod).toContain('aria-controls="card-body-tools-assessment"');
    expect(summaryOf(mod, "tools-assessment")).toContain("Nincs még bejegyzés");
  });

  test("a remembered open state round-trips into the next render", () => {
    setCardCollapsed("tools-gad7", false);
    expect(backing[CARD_STATES_KEY]).toContain('"tools-gad7":false');
    const gad = fullStack(createElement(Gad7Card));
    expect(gad).toContain('aria-expanded="true"');
    expect(gad).not.toContain('hidden=""');
  });

  test("the wipe's reset clears the new cards with everything else", () => {
    setCardCollapsed("tools-reflection", true);
    setCardCollapsed("settings-custom-activities", true);
    expect(Object.keys(backing)).toEqual([CARD_STATES_KEY]);
    // The production reset — the one `Minden adat törlése`'s chain calls.
    resetCardStates();
    expect(backing[CARD_STATES_KEY]).toBeUndefined();
    expect(loadCardStates()).toEqual({});
  });

  test("the five local cards are mounted, each with a summary", () => {
    // Two still live in `ToolsView`; the three health modules moved to
    // `HealthModules.tsx` when the health drawer's cards went to the sixth tab.
    // Both files are read, because "which file" is not the claim — "mounted
    // once, with a summary" is.
    const tools = readFileSync(new URL("../src/views/ToolsView.tsx", import.meta.url), "utf8");
    const modules = readFileSync(
      new URL("../src/components/HealthModules.tsx", import.meta.url),
      "utf8",
    );
    const HOMES: readonly (readonly [string, string])[] = [
      ["tools-reflection", tools],
      ["tools-vitals", modules],
      ["tools-meds", modules],
      ["tools-question", tools],
      ["tools-weekly-nutrition", modules],
    ];
    for (const [id, src] of HOMES) {
      const at = src.indexOf(`id="${id}"`);
      expect(at, `${id} must be mounted`).toBeGreaterThan(-1);
      // The same window the source-level guard scans, widened for the summary
      // expressions this card computes above the mount.
      expect(src.slice(at, at + 500), `${id} must carry a summary`).toContain("summary=");
    }
  });
});
