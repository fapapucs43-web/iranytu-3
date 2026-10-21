/**
 * Batch 11, commit 2 — the reorderable tabs' proof.
 *
 * The commit promised six things, and each block here pins one:
 *  - DEFAULT UNCHANGED: an absent `tabOrder` draws the registry's order, and
 *    `orderedTabs` is the identity on a clean permutation — reversal
 *    included, because a function that "fixes" a legal order is a second
 *    opinion about the user's choice;
 *  - REORDER PERSISTS: a move writes `settings.tabOrder` through the store,
 *    and a COLD module graph (Bun's `?query` import — the trick batch7d
 *    established for fresh store instances) reading the same storage draws
 *    the new order: the reload the user will actually do;
 *  - the NAV REFLECTS the order, with four buttons, the registry's labels,
 *    and `aria-current` following the active tab wherever it now sits;
 *  - RESET returns the default by REMOVING the field, so "never rearranged"
 *    and "put it back" are the same stored state;
 *  - the ARIA LABELS carry position and direction (`3. Elemzés előre`);
 *  - ID TOLERANCE: unknown ids dropped, duplicates collapsed, missing ids
 *    appended in default order, non-array blobs dropped by the store.
 *
 * The provider-wrapped static render is batch7d's pattern, reused so this
 * file proves the same bar that production mounts.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { NAV_ICONS } from "../src/lib/nav-icons";
import { bottomNavClass, orderedTabs } from "../src/lib/navVisibility";
import { DEFAULT_SETTINGS, type TabId } from "../src/types";

/* --------------------- the storage shim, house shape --------------------- */

const backing: Record<string, string> = {};
const KEY = "belso-iranytu-data-v2";

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
});

// Batch 15, Phase 1: the bar's default moved `Felfedezés` down beside
// `Beállítások`, so the two surfaces a reader visits to CHANGE something sit
// together at the end. The default lives in `NAV_ICONS` (that is what the
// "derives the universe from the registry" test below pins), and this literal
// is that order written out so every expectation here is readable.
const DEFAULT_ORDER: TabId[] = ["today", "journal", "insights", "health", "tools", "settings"];

/* ===================== 1 · default unchanged ============================ */

describe("the default order is unchanged when nothing was stored", () => {
  test("orderedTabs is the identity on absent, null and non-array input", () => {
    for (const garbage of [undefined, null, "insights", 42, { today: 1 }]) {
      expect(orderedTabs(garbage as never), String(garbage)).toEqual(DEFAULT_ORDER);
    }
  });

  test("orderedTabs is the identity on a clean permutation — full reversal included", () => {
    const reversed = [...DEFAULT_ORDER].reverse();
    expect(orderedTabs(reversed)).toEqual(reversed);
    // A four-row arrangement of an older bar is still a valid answer: the
    // missing tabs append in default order, at the end — Egészség first,
    // then the toolbox, which stays last.
    expect(orderedTabs(["insights", "today", "journal", "settings"])).toEqual([
      "insights",
      "today",
      "journal",
      "settings",
      "health",
      "tools",
    ]);
  });

  test("the function derives the universe from NAV_ICONS, not a private list", () => {
    // The pin that keeps a future fifth tab landing in the default order
    // without an edit here: the function's answer IS the registry's order.
    expect(orderedTabs(undefined)).toEqual(NAV_ICONS.map((n) => n.tab));
    expect(orderedTabs([])).toEqual(NAV_ICONS.map((n) => n.tab));
  });

  test("an empty array is 'never arranged', not 'no tabs' — the bar keeps six buttons", () => {
    expect(orderedTabs([])).toEqual(DEFAULT_ORDER);
  });

  test("the Settings field is optional and has no shipped default", () => {
    const types = readFileSync(new URL("../src/types.ts", import.meta.url), "utf8");
    expect(types).toMatch(/tabOrder\?: TabId\[\]/);
    expect(types).not.toMatch(/tabOrder: \[/); // never a default literal
    expect("tabOrder" in DEFAULT_SETTINGS).toBe(false);
  });
});

/* =================== 2 · reorder persists through the store ============== */

describe("a reorder persists, and a cold module graph sees it", () => {
  // One test, one story: write → storage → a FRESH module graph reads the
  // same storage. Bun treats a `?query` import as a new module instance (the
  // trick batch7d's normalizeSettings tests established), so the cold read's
  // module-level `read()` runs against the SAME storage the write landed in.
  // This is the reload the user will actually do — and it must be one test,
  // because beforeEach wipes the shim between tests.
  test("setSettings writes tabOrder; a cold module graph reads it back", async () => {
    const store = await import("../src/lib/store");
    store.resetAll();
    store.setSettings({
      ...store.getState().settings,
      tabOrder: ["insights", "today", "journal", "settings"],
    });
    expect(backing[KEY]).toContain('"tabOrder"');
    // Stored VERBATIM — the normalisation happens at the draw, not the write:
    // a four-row arrangement is a user's answer, not a malformed blob.
    expect(JSON.parse(backing[KEY]!).settings.tabOrder).toEqual([
      "insights",
      "today",
      "journal",
      "settings",
    ]);
    const cold = await import("../src/lib/store?batch11-tabs-reload");
    expect(cold.getState().settings.tabOrder).toEqual([
      "insights",
      "today",
      "journal",
      "settings",
    ]);
  });

  test("reset: writing the field off removes it from storage — back to never-arranged", async () => {
    const store = await import("../src/lib/store?batch11-tabs-reset");
    store.resetAll();
    store.setSettings({ ...store.getState().settings, tabOrder: ["journal", "today", "insights", "settings"] });
    expect(backing[KEY]).toContain('"tabOrder"');
    // What the reset button does: the field leaves the settings object.
    store.setSettings({ ...store.getState().settings, tabOrder: undefined });
    expect(backing[KEY]).not.toContain('"tabOrder"');
    // `JSON.stringify` drops a key whose value is `undefined`, so the stored
    // blob is clean rather than null-typed; the live state says so too.
    expect(store.getState().settings.tabOrder).toBeUndefined();
    const cold = await import("../src/lib/store?batch11-tabs-reset-cold");
    expect(cold.getState().settings.tabOrder).toBeUndefined();
  });

  test("a non-array tabOrder blob is dropped at load, not passed through", async () => {
    backing[KEY] = JSON.stringify({
      version: 2,
      entries: [],
      goals: [],
      dailyQuestion: null,
      medications: [],
      medicationChecks: {},
      profile: { name: "", goal: "" },
      settings: { autoHideNav: false, tabOrder: "insights" },
    });
    const cold = await import("../src/lib/store?batch11-tabs-garbage");
    expect(cold.getState().settings.tabOrder).toBeUndefined();
    // And the read is safe even before the next save repairs the blob.
    expect(orderedTabs(cold.getState().settings.tabOrder)).toEqual(DEFAULT_ORDER);
  });
});

/* =================== 3 · the nav draws the stored order ================== */

async function renderNav(settings: Record<string, unknown>): Promise<string> {
  // ONE store instance for render: AppContext binds to whichever store module
  // was imported first in this process, so the settings a test writes MUST go
  // through that same instance — a `?query` twin would be written while the
  // bar reads the original. resetAll() gives each render a clean slate.
  const store = await import("../src/lib/store");
  store.resetAll();
  store.setSettings({ ...store.getState().settings, ...settings } as never);
  const { AppProvider } = await import("../src/state/AppContext");
  const { IconSetProvider } = await import("../src/state/IconSetContext");
  const BottomNav = (await import("../src/components/BottomNav")).default;
  return renderToStaticMarkup(
    createElement(
      AppProvider,
      null,
      createElement(IconSetProvider, null, createElement(BottomNav, { active: "today" as TabId, onChange: () => {} })),
    ),
  );
}

/** The `<button`…`</button>` chunks of the bar, in drawn order. */
function buttons(html: string): string[] {
  return html
    .split(/<button[ >]/)
    .slice(1)
    .map((chunk) => chunk.slice(0, chunk.indexOf("</button>")));
}

describe("the bottom nav reflects the order", () => {
  test("default settings draw the registry order — the pre-Batch-11 bar", async () => {
    const html = await renderNav({});
    const positions = DEFAULT_ORDER.map((t) => html.indexOf(`data-tab="${t}"`));
    // The component does not emit data-tab today; what it does emit is the
    // label, so assert label order — and the count of buttons.
    expect((html.match(/<button/g) ?? []).length).toBe(6);
    let last = -1;
    for (const label of ["Ma", "Napló", "Elemzés", "Egészség", "Felfedezés", "Beállítás"]) {
      const at = html.indexOf(`>${label}</span>`, last + 1);
      expect(at, `${label} appears after the previous tab`).toBeGreaterThan(last);
      last = at;
    }
    expect(html).toContain('aria-label="Fő navigáció"');
  });

  test("a stored reorder draws the bar in the new order", async () => {
    const html = await renderNav({ tabOrder: ["insights", "today", "journal", "settings"] });
    const insights = html.indexOf(">Elemzés</span>");
    const today = html.indexOf(">Ma</span>");
    const journal = html.indexOf(">Napló</span>");
    const settings = html.indexOf(">Beállítás</span>");
    expect(insights).toBeGreaterThan(-1);
    expect(insights).toBeLessThan(today);
    expect(today).toBeLessThan(journal);
    expect(journal).toBeLessThan(settings);
    // Four stored rows, six buttons: Egészség and the toolbox are missing
    // from the arrangement and land in default order at the end — the default
    // order appends missing ids AFTER the stored ones, so the last two
    // buttons are those two, in registry order (Egészség, then Felfedezés).
    expect((html.match(/<button/g) ?? []).length).toBe(6);
  });

  test("aria-current follows the active tab wherever it now sits", async () => {
    const html = await renderNav({ tabOrder: ["insights", "today", "journal", "settings"] });
    const rows = buttons(html);
    expect(rows.length).toBe(6);
    const withCurrent = rows.filter((b) => b.includes('aria-current="page"'));
    expect(withCurrent.length).toBe(1);
    // Ma is second now, and its button — not Elemzés's — carries aria-current.
    expect(rows[0]).toContain("Elemzés");
    expect(rows[0]).not.toContain('aria-current="page"');
    expect(rows[1]).toContain(">Ma</span>");
    expect(withCurrent[0]).toContain(">Ma</span>");
  });

  test("the component still delegates every decision — class to the pure function", async () => {
    const src = readFileSync(new URL("../src/components/BottomNav.tsx", import.meta.url), "utf8");
    expect(src).toContain("orderedTabs(");
    expect(src).toContain("bottomNavClass(");
    expect(src).toContain("useAutoHideNav(");
    expect(src).not.toContain("addEventListener");
    // The order comes from the setting, not a second source of truth.
    expect(src).toMatch(/data\.settings\.tabOrder/);
    // The labels come from the registry rows, not re-typed strings.
    expect(src).toContain("NAV_ICONS.find");
  });

  test("bottomNavClass is untouched — the auto-hide decision is not this commit's", () => {
    expect(bottomNavClass(false)).toBe("bottom-nav");
    expect(bottomNavClass(true)).toBe("bottom-nav bottom-nav-hidden");
  });
});

/* =================== 4 · the Settings card =============================== */

describe("the 'Fülek sorrendje' card exists, moves and resets", () => {
  const src = readFileSync(new URL("../src/views/SettingsView.tsx", import.meta.url), "utf8");
  const catalogue = readFileSync(new URL("../src/lib/i18n.ts", import.meta.url), "utf8");

  test("the card is mounted inside the Navigáció card, with its group label", () => {
    // Since the Phase 3 i18n extraction the two labels are catalogue keys and
    // the view reads them by name. The structural claim — the tab-order group
    // sits INSIDE the Navigáció card, not beside it — still reads off the view,
    // because that is where the card boundaries are.
    expect(src).toContain('t("settings.nav.tabOrderGroup")');
    expect(src).toContain('t("settings.nav.tabOrderTitle")');
    const navCard = src.indexOf('t("settings.nav.title")');
    const tabOrder = src.indexOf('t("settings.nav.tabOrderGroup")');
    expect(navCard).toBeGreaterThan(-1);
    expect(tabOrder).toBeGreaterThan(navCard);
    expect(catalogue).toContain('"settings.nav.tabOrderGroup": "Fülek sorrendje"');
    expect(catalogue).toContain('"settings.nav.tabOrderTitle": "Fülek sorrendje"');
  });

  test("every move button names its row's position and direction", () => {
    // One template, two directions — asserted as the source the four rows
    // render from, position included so a screen reader says "3. Elemzés".
    // The row number and the tab name go in as VALUES now; the wording that
    // wraps them is the catalogue's, and `tests/lib/i18n.test.ts` asserts it
    // renders "3. Elemzés előre" from those two values.
    expect(src).toContain('t("settings.nav.tabUp", { n: i + 1, name: def.label })');
    expect(src).toContain('t("settings.nav.tabDown", { n: i + 1, name: def.label })');
    // The visible row carries the same numbering.
    expect(src).toMatch(/\{i \+ 1\}\. \{def\.label\}/);
  });

  test("the ends are disabled, not absent — you can see where the row is", () => {
    expect(src).toMatch(/disabled=\{i === 0\}/);
    expect(src).toMatch(/disabled=\{i === all\.length - 1\}/);
  });

  test("the reset button exists with the agreed wording, and removes the field", () => {
    expect(src).toContain('t("settings.nav.reset")');
    expect(catalogue).toContain('"settings.nav.reset": "Alapértelmezett sorrend visszaállítása"');
    expect(src).toMatch(/tabOrder: undefined/);
    // Offered only when there is something to reset.
    expect(src).toMatch(/data\.settings\.tabOrder !== undefined/);
  });

  test("the card computes rows through orderedTabs — no second normaliser", () => {
    expect(src).toContain("orderedTabs(data.settings.tabOrder)");
    // And the move writes a normalised permutation back.
    expect(src).toMatch(/tabOrder: orderedTabs\(next\)/);
  });
});

/* =================== 5 · id tolerance, the full table ==================== */

describe("orderedTabs tolerates every malformed order a blob can carry", () => {
  test("unknown ids are dropped — there is no such tab to draw", () => {
    // "toolbox" is STILL not a tab id — the tab is "tools", and the old
    // section id stays an unknown id exactly as "news" is. The example is the
    // regression test for a hand-edited blob from before Batch 14.
    expect(orderedTabs(["toolbox", "insights", "today"])).toEqual([
      "insights",
      "today",
      "journal",
      "health",
      "tools",
      "settings",
    ]);
    expect(orderedTabs(["news", "weather", "journal"])).toEqual([
      "journal",
      "today",
      "insights",
      "health",
      "tools",
      "settings",
    ]);
  });

  test("duplicates collapse to the first occurrence", () => {
    expect(orderedTabs(["settings", "journal", "insights", "today", "settings"])).toEqual([
      "settings",
      "journal",
      "insights",
      "today",
      "health",
      "tools",
    ]);
    expect(orderedTabs(["today", "today", "today"])).toEqual(DEFAULT_ORDER);
  });

  test("missing ids are appended in DEFAULT order, never dropped", () => {
    expect(orderedTabs(["settings"])).toEqual(["settings", "today", "journal", "insights", "health", "tools"]);
    expect(orderedTabs(["insights", "today"])).toEqual([
      "insights",
      "today",
      "journal",
      "health",
      "tools",
      "settings",
    ]);
    expect(orderedTabs([])).toEqual(DEFAULT_ORDER);
  });

  test("the output is always a permutation of the six tabs", () => {
    const inputs: unknown[][] = [
      [],
      ["today"],
      ["settings", "insights"],
      ["x", "journal", "today"],
      ["today", "today", "journal", "journal", "insights", "settings"],
      ["settings", "settings", "settings", "today"],
      [3, null, undefined, "journal"],
    ];
    for (const input of inputs) {
      const out = orderedTabs(input);
      expect([...out].sort()).toEqual([...DEFAULT_ORDER].sort());
      expect(new Set(out).size).toBe(6);
    }
  });

  test("id checks are strict — a near-miss is an unknown id", () => {
    // Case and whitespace differences must not silently match: a hand-edited
    // "Today" is not the tab, and fuzzy matching would hide real typos.
    expect(orderedTabs(["Today", "TODAY", " today"])).toEqual(DEFAULT_ORDER);
  });
});

/* =================== 6 · the mount proof ================================= */

describe("the surfaces are still mounted — the HealthImportCard lesson", () => {
  test("BottomNav and SettingsView keep their mounts in App", async () => {
    const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
    expect(app).toContain("<BottomNav");
    expect(app).toContain("<SettingsView");
    // Batch 14 gave the toolbox a tab of its own, so the mount proof names the
    // view the fifth button has to reach. The exact line, not the bare name:
    // an import that is never rendered would satisfy a `toContain("ToolsView")`.
    expect(app).toContain('{tab === "tools" && <ToolsView />}');
  });

  test("the Settings card renders inside the view the router mounts", () => {
    // Structural: the tab-order block is in the returned JSX, not a stray
    // string or an unmounted helper.
    const src = readFileSync(new URL("../src/views/SettingsView.tsx", import.meta.url), "utf8");
    const returnIdx = src.indexOf("  return (");
    expect(returnIdx).toBeGreaterThan(-1);
    expect(src.indexOf('t("settings.nav.tabOrderGroup")')).toBeGreaterThan(returnIdx);
  });

  test("types.ts keeps the optional-fields pattern: optional, no default", () => {
    const src = readFileSync(new URL("../src/types.ts", import.meta.url), "utf8");
    const field = src.indexOf("tabOrder?: TabId[];");
    const doc = src.lastIndexOf("/**", field);
    expect(doc).toBeGreaterThan(-1);
    expect(src.slice(doc, field)).toContain("OPTIONAL");
  });
});
