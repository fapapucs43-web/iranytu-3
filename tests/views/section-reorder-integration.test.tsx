/**
 * Phase 3c — the six tabs, wired to their own sections.
 *
 * 3a gave sections an order, 3b named three tabs' sections and 3b2 named the
 * fourth's. None of those changed the page. This file is about the commit that
 * does: every tab draws a toggle, the toggle opens a panel, the panel's arrows
 * and its reset write `settings.sectionOrder`, and the cards move.
 *
 * WHY EVERYTHING HERE READS MARKUP, AND WHICH MARKUP
 * No jsdom, like the rest of this suite, and not for lack of wanting one: the
 * point of these tests is what a reader ends up looking at, and a DOM built by
 * a test renderer still has to be interrogated by selectors. So each section is
 * pinned to a string it actually renders — `activities-card`, `entry-list`,
 * `class="settings-group" role="group" aria-label="Személyes"` — and the
 * assertions are about the ORDER of those strings. That is the whole feature:
 * which card comes first.
 *
 * Two lessons from the first attempt are baked in, because both produced tests
 * that passed for the wrong reason or failed for a silly one:
 *
 *  1. A `Collapsible` renders NO children when closed. The Eszköztár toolbox, the
 *     search panel and half the Settings groups are collapsibles, so a marker
 *     taken from inside one is simply not in the markup — `indexOf` returns -1,
 *     -1 sorts first, and the test "proves" a reordering that never happened.
 *     Every marker below is one that renders with the panel shut.
 *
 *  2. Nothing here waits for a click, because nothing here can: `react-dom/
 *     server` produces one immutable snapshot. So the callbacks `useSectionOrder`
 *     hands the panel are captured from a REAL render — a probe component inside
 *     the real `AppProvider` — and then called from the test. That is exactly
 *     what pressing the reset button does, minus the button. The assertion that
 *     follows is on `store.getState()`: the thing the reader would see on the
 *     next render, which is the only honest witness to a write.
 *
 * The store is seeded with a fortnight of entries first. Without it Elemzés
 * returns early on its empty state — correctly, it has no toggle to offer — and
 * a test that only ever saw the empty state would have been measuring that.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SectionList, { ReorderToggle, useSectionOrder } from "../../src/components/SectionList";
import { withoutTabOrder } from "../../src/lib/sectionOrder";
import { t, translationKeys } from "../../src/lib/i18n";
import { todayISO } from "../../src/lib/dates";
import type { AppData, MoodLevel, TabId } from "../../src/types";

const { defaultToolSections } = await import("../../src/views/ToolsView");

const store = await import("../../src/lib/store");
const { AppProvider } = await import("../../src/state/AppContext");
const { IconSetProvider } = await import("../../src/state/IconSetContext");
const { ThemeProvider } = await import("../../src/state/ThemeContext");
const { FontProvider } = await import("../../src/state/FontContext");
const TodayView = (await import("../../src/views/TodayView")).default;
const ToolsView = (await import("../../src/views/ToolsView")).default;
const JournalView = (await import("../../src/views/JournalView")).default;
const InsightsView = (await import("../../src/views/InsightsView")).default;
const SettingsView = (await import("../../src/views/SettingsView")).default;
const HealthView = (await import("../../src/views/HealthView")).default;

/** The provider stack the real App mounts. */
function stack(el: unknown): string {
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
          createElement(IconSetProvider, null, el),
        ),
      ),
    ),
  );
}

const VIEWS = {
  today: TodayView,
  tools: ToolsView,
  journal: JournalView,
  insights: InsightsView,
  health: HealthView,
  settings: SettingsView,
} as const;

type Tab = keyof typeof VIEWS;

function render(tab: Tab): string {
  return stack(createElement(VIEWS[tab] as never));
}

/**
 * A fortnight of entries, so no tab is sitting on its empty state.
 *
 * The empty state is not a bug and it is not what this file is about; a view
 * that returns early renders nothing to reorder, and the test would be measuring
 * the early return rather than the wiring.
 */
function seedFortnight(): void {
  const start = Date.parse(`${todayISO()}T00:00:00Z`);
  for (let back = 0; back < 14; back++) {
    store.saveEntry({
      date: new Date(start - back * 86400000).toISOString().slice(0, 10),
      mood: ((back % 5) + 1) as MoodLevel,
      stress: 2 + (back % 6),
      energy: 1 + (back % 5),
      note: `nap ${back}`,
      tags: ["teszt"],
      activities: ["futás"],
      // Today's entry needs a quadrant or the micro-lesson card has nothing to
      // pick and renders nothing at all — a section that draws nothing is a
      // section with no marker, which is the trap this file is written around.
      quadrant: "low-neg",
    });
  }
}

function seedSectionOrder(map: Record<string, string[]>): void {
  store.setSettings({
    ...store.getState().settings,
    sectionOrder: map as never,
  });
}

/** The one Settings group marker, built from the group heading itself. */
function settingsGroup(key: Parameters<typeof t>[0]): string {
  return `class="settings-group" role="group" aria-label="${t(key)}"`;
}

/**
 * One string per section, each of which renders with every panel shut.
 *
 * See the file header for why these and not something prettier.
 */
const MARKERS: Record<Tab, Record<string, string>> = {
  today: {
    mood: "mood-flow-cta",
    balance: "balance-card",
    activities: "activities-card",
    lessons: "lesson-card",
    reflection: `collapsible-title\">${t("settings.sections.reflection")}<`,
  },
  tools: {
    // Markers that render with every drawer SHUT (the file-header rule):
    // each drawer's own Collapsible head title. The drawers are the sections;
    // what sits inside them is the cards' own business.
    //
    // Four categories, not the cards' own names: a card's `<h3>` sits inside a
    // closed drawer and renders nothing, so the head is the only marker here.
    // The fifth drawer (Egészség) moved to the sixth tab and its cards went
    // with it, so it is not in this set any more — a marker that no longer
    // renders is exactly what `orderOf` refuses to sort to -1.
    therapy: `>${t("tools.therapy.title")}</`,
    self: `>${t("tools.self.title")}</`,
    experiments: `>${t("tools.experiments.title")}</`,
    education: `>${t("tools.learning.title")}</`,
    // The id is `education` and the name is "Tanulás", on purpose: the arrow
    // tests move a stored ARRANGEMENT (ids), the markers are read off the screen
    // (names), and the rename moved only one of the two.
  },
  journal: {
    calendar: "cal-grid",
    search: `collapsible-title">${t("journal.search.title")}<`,
    entries: "entry-list",
  },
  insights: {
    week: "stat-grid",
    year: "yip-years",
    achievements: "badge-shelf",
  },
  settings: {
    personal: settingsGroup("settings.groups.personal"),
    navigation: settingsGroup("settings.groups.navigation"),
    security: settingsGroup("settings.groups.security"),
    data: settingsGroup("settings.groups.data"),
  },
  health: {
    // Plain-text titles on this tab (HealthView ships without `t()` calls),
    // read off the CollapsibleCard heads — they render with the body shut.
    nutrition: 'collapsible-title">Táplálkozás<',
    training: 'collapsible-title">Edzés<',
    general: 'collapsible-title">Egyéb<',
  },
};

/**
 * The sections in the order the reader would scroll past them.
 *
 * A marker that is not in the markup fails HERE rather than quietly sorting to
 * -1 and reading as "it came first". That mistake is the whole reason this
 * helper exists.
 */
function orderOf(tab: Tab, html: string): string[] {
  const missing = Object.entries(MARKERS[tab])
    .filter(([, marker]) => !html.includes(marker))
    .map(([id]) => id);
  if (missing.length > 0) {
    throw new Error(`${tab} did not render: ${missing.join(", ")}`);
  }
  return Object.entries(MARKERS[tab])
    .map(([id, marker]) => ({ id, at: html.indexOf(marker) }))
    .sort((a, b) => a.at - b.at)
    .map((x) => x.id);
}

/** The toggle as it appears in the markup: pressed or not, with its label. */
function toggleIn(html: string, label: string): number {
  return html.match(
    new RegExp(`<button[^>]*aria-pressed="(?:true|false)"[^>]*>${label}</button>`),
  )?.length ?? 0;
}

/* ------------------------------------------------------------------ */

beforeEach(() => {
  store.resetAll();
  seedFortnight();
});

afterEach(() => {
  store.resetAll();
});

describe("the toggle is on every tab", () => {
  test("Ma, Napló and Beállítások each draw exactly one, pressed OFF", () => {
    for (const tab of ["today", "journal", "settings"] as const) {
      const html = render(tab);
      expect(toggleIn(html, t("settings.sections.start")), `${tab} toggle`).toBe(1);
      expect(html.includes('aria-pressed="false"'), `${tab} pressed off`).toBe(true);
    }
  });

  test("Elemzés draws one too — but only once there is something to analyse", () => {
    // Both halves, because either alone is a test that cannot fail: with an
    // empty journal Elemzés returns early and draws no toggle at all, which is
    // correct, and a test that only saw that would be pinning the early return.
    store.resetAll();
    expect(render("insights")).not.toContain(t("settings.sections.start"));
    seedFortnight();
    expect(toggleIn(render("insights"), t("settings.sections.start"))).toBe(1);
  });

  test("the button names what pressing it will do, not what it did", () => {
    const closed = renderToStaticMarkup(
      createElement(ReorderToggle, { active: false, onToggle: () => {} }),
    );
    const open = renderToStaticMarkup(
      createElement(ReorderToggle, { active: true, onToggle: () => {} }),
    );
    expect(closed).toContain('aria-pressed="false"');
    expect(open).toContain('aria-pressed="true"');
    expect(closed).toContain(t("settings.sections.start"));
    expect(open).toContain(t("settings.sections.stop"));
    // The two words are the difference, so they may not collapse into one.
    expect(t("settings.sections.start")).not.toBe(t("settings.sections.stop"));
  });
});

describe("the panel stays shut until the toggle is pressed", () => {
  test("no tab draws the reorder panel, so no tab offers an undo that does nothing", () => {
    for (const tab of Object.keys(VIEWS) as Tab[]) {
      const html = render(tab);
      // The panel's own heading is `settings.sections.orderTitle`. Settings has
      // a SECOND reorder panel — the bottom bar's — with a different label, and
      // this marker is chosen to tell the two apart.
      expect(html.includes(`aria-label="${t("settings.sections.orderTitle")}"`), tab).toBe(false);
      expect(toggleIn(html, t("settings.sections.start")), tab).toBe(1);
    }
  });

  test("and the reset button goes with it", () => {
    for (const tab of Object.keys(VIEWS) as Tab[]) {
      expect(render(tab).includes(t("settings.sections.reset")), tab).toBe(false);
    }
  });
});

describe("the panel names the sections it moves", () => {
  /**
   * The panel's rows, read straight out of a rearranging `SectionList`.
   *
   * The other way to ask is `sections.map((s) => s.label)`, and that is the
   * version that cannot fail: it compares the table to itself, so a row whose
   * label was swapped for another section's passes. These five strings are the
   * catalogue, written once more on purpose.
   */
  function panelRows(sections: ReturnType<typeof defaultToolSections>): string[] {
    const html = renderToStaticMarkup(
      createElement(SectionList, {
        sections,
        value: undefined,
        onChange: () => {},
        onReset: () => {},
        rearranging: true,
      }),
    );
    return [...html.matchAll(/<span class="tab-order-label">\d+\. ([^<]*)<\/span>/g)].map(
      (m) => m[1]!,
    );
  }

  const flags: Pick<
    AppData["settings"],
    "reflectionModule" | "vitalsModule" | "medsModule" | "assessmentsEnabled"
  > = {
    reflectionModule: true,
    vitalsModule: true,
    medsModule: true,
    assessmentsEnabled: true,
  };

  test("Felfedezés: four rows, one per drawer, named the same as the heads", () => {
    // The heads are pinned by MARKERS.tools (the rendered `>title<`); this is
    // the other half — the names the arrows announce, which no reader sees
    // until they open the panel and which nothing else checks.
    expect(panelRows(defaultToolSections(flags))).toEqual([
      t("tools.therapy.title"),
      t("tools.self.title"),
      t("tools.experiments.title"),
      t("tools.learning.title"),
    ]);
  });

  test("and a stored order is what the rows come out in", () => {
    const sections = defaultToolSections(flags);
    const html = renderToStaticMarkup(
      createElement(SectionList, {
        sections,
        value: ["education", "experiments"],
        onChange: () => {},
        onReset: () => {},
        rearranging: true,
      }),
    );
    const rows = [...html.matchAll(/<span class="tab-order-label">\d+\. ([^<]*)<\/span>/g)].map(
      (m) => m[1]!,
    );
    expect(rows).toEqual([
      t("tools.learning.title"),
      t("tools.experiments.title"),
      t("tools.therapy.title"),
      t("tools.self.title"),
    ]);
  });
});

describe("a stored order moves the real cards", () => {
  test("Ma: activities before mood", () => {
    expect(orderOf("today", render("today"))).toEqual([
      "mood",
      "balance",
      "lessons",
      "activities",
      "reflection",
    ]);
    seedSectionOrder({ today: ["activities", "mood"] });
    expect(orderOf("today", render("today"))).toEqual([
      "activities",
      "mood",
      "balance",
      "lessons",
      "reflection",
    ]);
  });

  test("Felfedezés: the drawers move, each with its cards inside", () => {
    expect(orderOf("tools", render("tools"))).toEqual([
      "therapy",
      "self",
      "experiments",
      "education",
    ]);
    // The two smallest drawers named first: they keep their relative order, and
    // the two the reader did not name follow in the order they were before.
    seedSectionOrder({ tools: ["experiments", "education"] });
    expect(orderOf("tools", render("tools"))).toEqual([
      "experiments",
      "education",
      "therapy",
      "self",
    ]);
    // A stored arrangement from before the health drawer moved out still names
    // it. The unknown id is dropped and the four remaining drawers keep their
    // stored relative order — the same rule the tab bar applies to a tab that
    // no longer exists.
    seedSectionOrder({ tools: ["health", "experiments"] });
    expect(orderOf("tools", render("tools"))).toEqual([
      "experiments",
      "therapy",
      "self",
      "education",
    ]);
  });

  test("Napló: the entry list before the calendar", () => {
    expect(orderOf("journal", render("journal"))).toEqual([
      "calendar",
      "search",
      "entries",
    ]);
    // `search` is not in the stored arrangement, so it keeps its place at the
    // end rather than drifting to wherever the reader last had it.
    seedSectionOrder({ journal: ["entries", "calendar"] });
    expect(orderOf("journal", render("journal"))).toEqual([
      "entries",
      "calendar",
      "search",
    ]);
  });

  test("Elemzés: the year grid before the week", () => {
    seedSectionOrder({ insights: ["achievements", "year", "week"] });
    expect(orderOf("insights", render("insights"))).toEqual(["achievements", "year", "week"]);
  });

  test("Beállítások: the data group before the personal one", () => {
    expect(orderOf("settings", render("settings"))[0]).toBe("personal");
    seedSectionOrder({ settings: ["data", "security", "personal", "navigation"] });
    expect(orderOf("settings", render("settings"))).toEqual([
      "data",
      "security",
      "personal",
      "navigation",
    ]);
  });

  test("an id from a future version is dropped, and nothing is lost", () => {
    // The store is hand-editable and an id can be renamed in a later release.
    // A card may go missing from the list; it may never go missing from the
    // page, and it may never be drawn twice.
    seedSectionOrder({ today: ["ghost", "activities"] });
    const html = render("today");
    expect(orderOf("today", html)).toEqual([
      "activities",
      "mood",
      "balance",
      "lessons",
      "reflection",
    ]);
    for (const marker of Object.values(MARKERS.today)) {
      expect(html.split(marker).length - 1, marker).toBe(1);
    }
  });

  test("another tab's arrangement moves that tab and not this one", () => {
    seedSectionOrder({ journal: ["entries", "calendar"] });
    expect(orderOf("today", render("today"))).toEqual([
      "mood",
      "balance",
      "lessons",
      "activities",
      "reflection",
    ]);
    expect(orderOf("tools", render("tools"))).toEqual([
      "therapy",
      "self",
      "experiments",
      "education",
    ]);
    expect(orderOf("settings", render("settings"))[0]).toBe("personal");
  });
});

describe("the panel's two writes", () => {
  type Order = ReturnType<typeof useSectionOrder>;

  beforeEach(() => {
    // `notify` clears its toast with `window.setTimeout`, and Bun has no
    // `window`. Only the reset path calls it, so the shim belongs here and not
    // in the file-wide setup; it is removed straight after, because `bun test`
    // shares one globalThis between every test file in the run.
    (globalThis as { window?: unknown }).window = { setTimeout: () => 0 };
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  /**
   * `useSectionOrder`, run by React inside the real `AppProvider`, and the
   * callbacks it returned kept for the test to call.
   *
   * A hook cannot be called outside a component, and there is no DOM to press a
   * button in. So the hook is rendered for real and its result captured; calling
   * `setOrder` or `reset` afterwards is precisely what the panel's arrow and
   * its reset button do. What lands in the store is the witness.
   */
  function capture(tab: TabId): Order {
    const box: { order: Order | null } = { order: null };
    function Probe() {
      box.order = useSectionOrder(tab);
      return null;
    }
    stack(createElement(Probe));
    if (box.order === null) throw new Error("the probe component never rendered");
    return box.order;
  }

  test("setOrder stores this tab's arrangement and touches nothing else", () => {
    seedSectionOrder({ journal: ["entries", "calendar"] });
    const before = store.getState().settings;
    capture("today").setOrder(["activities", "mood"]);
    const after = store.getState().settings;
    expect(after.sectionOrder?.today).toEqual(["activities", "mood"]);
    expect(after.sectionOrder?.journal).toEqual(["entries", "calendar"]);
    // Everything else about the settings object is carried, not rebuilt.
    expect(after.tabOrder).toEqual(before.tabOrder);
    expect(after.theme).toEqual(before.theme);
  });

  test("reset drops this tab's slot and keeps every other tab's", () => {
    // The heart of it: resetting Ma must not quietly reset the whole app.
    seedSectionOrder({
      today: ["activities", "mood"],
      journal: ["entries", "calendar"],
      settings: ["data", "personal"],
    });
    capture("today").reset();
    const stored = store.getState().settings.sectionOrder;
    expect(stored?.today).toBeUndefined();
    expect(stored?.journal).toEqual(["entries", "calendar"]);
    expect(stored?.settings).toEqual(["data", "personal"]);
  });

  test("reset on a tab that stored nothing is harmless", () => {
    seedSectionOrder({ journal: ["entries", "calendar"] });
    capture("insights").reset();
    expect(store.getState().settings.sectionOrder).toEqual({
      journal: ["entries", "calendar"],
    });
  });

  test("and the cards go back where they were", () => {
    // The whole loop, end to end and against rendered markup: write through the
    // hook the panel calls, see the page move, press reset, see it come back.
    const home = orderOf("today", render("today"));
    capture("today").setOrder(["activities", "mood"]);
    expect(orderOf("today", render("today"))[0]).toBe("activities");
    capture("today").reset();
    expect(orderOf("today", render("today"))).toEqual(home);
  });

  test("resetDone says the arrangement went back", () => {
    expect(translationKeys()).toContain("settings.sections.resetDone");
    expect(t("settings.sections.resetDone")).toBe(
      "Alapértelmezett sorrend visszaállítva.",
    );
    // What a reader is told, not what they are offered: the button says
    // `settings.sections.reset` ("… visszaállítása", an action) and this says
    // what already happened ("… visszaállítva.", a fact). The two namespaces
    // deliberately share a sentence — `settings.nav.resetNotify` is the bar's
    // own — so this asserts against the button instead, which must differ.
    expect(t("settings.sections.resetDone")).not.toBe(t("settings.sections.reset"));
    expect(t("settings.nav.resetNotify")).toBe(t("settings.sections.resetDone"));
  });
});

/**
 * Phase 3 — the toggle closes the list, on every tab.
 *
 * The commit that moved it said one thing: the button belongs at the BOTTOM of
 * the list it opens. That is a claim about two orders at once, and only one of
 * them is about the code:
 *
 *  - SOURCE ORDER, because the pair is a pair of siblings in the returned JSX
 *    and that is what decides where they render. One `<ReorderToggle` and one
 *    `<SectionList` per view, in that order, so a duplicate cannot satisfy the
 *    audit by accident.
 *  - RENDERED BYTE ORDER, because "below the list" is a fact about the page the
 *    reader gets. The five marker sets are the ones the rest of this file
 *    already trusts (they render with every panel shut), and the assertion is
 *    that the button's own markup comes after ALL of them — not after the
 *    first, and not merely present.
 *
 * The third test is the per-tab audit itself: five views, five `TabId`s, each
 * view opening the slot that is its own. A copy-paste that left two views
 * writing `"today"` would move the wrong tab's cards and nothing else here
 * would notice, because every rendered assertion works off one tab at a time.
 */
describe("the toggle closes the list on every tab", () => {
  const SOURCES: { tab: Tab; file: string }[] = [
    { tab: "today", file: "src/views/TodayView.tsx" },
    { tab: "journal", file: "src/views/JournalView.tsx" },
    { tab: "insights", file: "src/views/InsightsView.tsx" },
    { tab: "tools", file: "src/views/ToolsView.tsx" },
    { tab: "health", file: "src/views/HealthView.tsx" },
    { tab: "settings", file: "src/views/SettingsView.tsx" },
  ];

  const source = (file: string) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");

  test("every view renders its SectionList first and its toggle second", () => {
    for (const { tab, file } of SOURCES) {
      const src = source(file);
      const list = src.indexOf("<SectionList");
      const toggle = src.indexOf("<ReorderToggle");
      expect(list, `${tab} (${file}): no SectionList`).toBeGreaterThan(-1);
      expect(toggle, `${tab} (${file}): no ReorderToggle`).toBeGreaterThan(-1);
      expect(toggle, `${tab} (${file}): the toggle is above the list`).toBeGreaterThan(list);
      // One of each: "after the first" is not the claim, "after the only" is.
      expect(src.split("<SectionList").length - 1, `${tab}: lists`).toBe(1);
      expect(src.split("<ReorderToggle").length - 1, `${tab}: toggles`).toBe(1);
    }
  });

  test("and on the rendered page the button is below every one of the tab's cards", () => {
    for (const tab of Object.keys(VIEWS) as Tab[]) {
      const html = render(tab);
      // The label search that `toggleIn` uses, at the one position it can have.
      const at = html.indexOf(`>${t("settings.sections.start")}</button>`);
      expect(at, `${tab}: the toggle is not on the page`).toBeGreaterThan(-1);
      for (const marker of Object.values(MARKERS[tab])) {
        const markAt = html.indexOf(marker);
        expect(markAt, `${tab}: ${marker} did not render`).toBeGreaterThan(-1);
        expect(at, `${tab}: the toggle came before ${marker}`).toBeGreaterThan(markAt);
      }
    }
  });

  test("the six views are exactly the six tabs, each opening its own slot", () => {
    // The union is the source of truth (types.ts), the view list is the claim,
    // and the two have to be the same six — no tab without a view, no view
    // that borrows another tab's stored arrangement.
    const types = source("src/types.ts");
    const line = types.split("\n").find((l) => l.startsWith("export type TabId")) ?? "";
    const union = [...line.matchAll(/"([a-z]+)"/g)].map((m) => m[1]!);
    expect(union.length).toBe(6);
    expect(SOURCES.map((s) => s.tab).sort()).toEqual([...union].sort());
    for (const { tab, file } of SOURCES) {
      expect(source(file), `${file} does not open the ${tab} slot`).toContain(
        `useSectionOrder("${tab}")`,
      );
    }
  });
});

describe("withoutTabOrder, on its own", () => {
  test("it removes its own key and nothing else", () => {
    const map = { today: ["a"], journal: ["b"] };
    expect(withoutTabOrder(map, "today")).toEqual({ journal: ["b"] });
    expect(withoutTabOrder(map, "journal")).toEqual({ today: ["a"] });
  });

  test("it does not mutate what it was given", () => {
    const map = { today: ["a"], journal: ["b"] };
    withoutTabOrder(map, "today");
    expect(map).toEqual({ today: ["a"], journal: ["b"] });
  });

  test("a key that was never there costs nothing", () => {
    expect(withoutTabOrder({ journal: ["b"] }, "today")).toEqual({ journal: ["b"] });
    expect(withoutTabOrder({}, "today")).toEqual({});
  });

  test("a hand-edited blob that is not a map reads as nothing stored", () => {
    // Never throws, like `orderSections`: this value crossed a JSON boundary and
    // may have been edited by a person who did not know what it was.
    for (const junk of [null, 42, "nope", true, ["today"]]) {
      expect(withoutTabOrder(junk, "today")).toEqual({});
    }
  });
});