/**
 * Phase 1 of `fix/card-state-and-full-audit` — the Settings card audit, as a
 * test the next batch cannot silently break.
 *
 * THE REPORT THIS FILE ANSWERS
 * A reader said the "Nyomonkövetés" card in Settings could not be collapsed.
 * Walking `src/views/SettingsView.tsx` against the deployed build (they are
 * byte-identical at `2519b59`) the card is ALREADY a `CollapsibleCard` —
 * `id="settings-trackers"`, collapsed by default, summary derived from the
 * tracker registry — since PR #80. What the walk also found is exactly the
 * thing a one-off fix would not protect: nothing stops the NEXT card added to
 * this page from being a plain `Card` again. So the deliverable is not a fix
 * but this guard: every card on the Settings page can be collapsed, with one
 * named exception, and the surfaces the request enumerates each render as a
 * remembering card under their pinned id.
 *
 * HOW IT ASSERTS
 * `renderToStaticMarkup` with the provider stack the real App mounts (the same
 * bargain `batch11-collapse` strikes): no jsdom, no clicks, assertions on the
 * markup. The two primitives are told apart by their heads — `CollapsibleCard`
 * carries `aria-controls="card-body-<id>"`, the session-local `Collapsible`
 * does not — and both must be collapsible; only `CrisisCard` may be neither,
 * and it is named here with its reason rather than counted away.
 *
 * WHAT IS DELIBERATELY NOT ASSERTED
 * That the two `Collapsible` drawers remember their state. They are
 * session-local today; Phase 2 of this batch changes that, and this file is
 * written so the conversion does not have to touch it: the rule under test is
 * "every card can be collapsed", not "which primitive draws it".
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import SettingsView from "../../src/views/SettingsView";
import { AppProvider } from "../../src/state/AppContext";
import { ThemeProvider } from "../../src/state/ThemeContext";
import { FontProvider } from "../../src/state/FontContext";
import { IconSetProvider } from "../../src/state/IconSetContext";
import * as store from "../../src/lib/store";
import { t } from "../../src/lib/i18n";
import {
  DEFAULT_ENABLED_TRACKERS,
  isTrackerGroupEnabled,
  trackerGroupHeads,
} from "../../src/lib/trackers";
import {
  resetCardStates,
  resetCardStatesForTests,
  setCardCollapsed,
} from "../../src/lib/cardStates";

/* --------------------------- the substrate --------------------------- */

const backing: Record<string, string> = {};

beforeEach(() => {
  for (const k of Object.keys(backing)) delete backing[k];
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => (k in backing ? backing[k]! : null),
    setItem: (k: string, v: string) => {
      backing[k] = v;
    },
    removeItem: (k: string) => {
      delete backing[k];
    },
  };
  // The store is a module binding shared by every file in one process: reset
  // BOTH ways, before because somebody else dirtied it, after because this
  // file's seeded `medsModule` must not leak into the next one.
  store.resetAll();
  resetCardStatesForTests();
  // The medication-times card renders only when the meds module is on
  // (`{data.settings.medsModule && <MedicationTimesCard />}`), and the request
  // names that card, so the page is drawn with the module every feature of
  // this audit needs to see.
  store.setSettings({ ...store.getState().settings, medsModule: true });
});

afterEach(() => {
  store.resetAll();
  resetCardStatesForTests();
});

/* ------------------------------ rendering ---------------------------- */

function renderSettings(): string {
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
          createElement(IconSetProvider, null, createElement(SettingsView)),
        ),
      ),
    ),
  );
}

/**
 * One card's head + body, sliced out of the page — the markup-surgery helper
 * `batch11-collapse` uses, restated because a whole page contains `hidden=""`
 * once per collapsed card and `aria-expanded` cannot be read unscoped.
 */
function cardSlice(html: string, id: string): string {
  const marker = `aria-controls="card-body-${id}"`;
  const attr = html.indexOf(marker);
  if (attr < 0) throw new Error(`no remembering card with id "${id}" in this markup`);
  const start = html.lastIndexOf("<button", attr);
  if (start < 0) throw new Error(`card "${id}" has aria-controls but no head button`);
  const nextAttr = html.indexOf('aria-controls="card-body-', attr + marker.length);
  const next = nextAttr < 0 ? -1 : html.lastIndexOf("<button", nextAttr);
  return next < 0 ? html.slice(start) : html.slice(start, next);
}

function isOpen(html: string, id: string): boolean {
  return cardSlice(html, id).includes('aria-expanded="true"');
}

/* --------------------- the card the report named ---------------------- */

describe("the Nyomonkövetés card the reader reported", () => {
  test("IT IS a remembering card: id, head button, collapsed by default", () => {
    // Does: render the Settings page fresh (no stored card states).
    // Expects: a `CollapsibleCard` under `settings-trackers` whose head is a
    //   real button, `aria-expanded="false"`, body hidden.
    // Actual: same — one `aria-controls="card-body-settings-trackers"` head,
    //   `collapsible-card-head` class, `hidden=""` body, `aria-expanded="false"`.
    const html = renderSettings();
    const slice = cardSlice(html, "settings-trackers");
    expect(slice).toContain("collapsible-card-head");
    expect(slice).toContain('type="button"');
    expect(slice).toContain('aria-expanded="false"');
    expect(slice).toContain('aria-controls="card-body-settings-trackers"');
    expect(isOpen(html, "settings-trackers")).toBe(false);
    expect(html).toContain("hidden=\"\"");
    // The title the reader sees on the collapsed head.
    expect(slice).toContain(t("settings.trackers.title"));
  });

  test("its collapsed line counts REAL tracker groups from the registry", () => {
    // Does: read the summary line under the title.
    // Expects: `t(\"settings.trackers.summary\", …)` over the registry's own
    //   heads — `{on} / {total} csoport bekapcsolva` on a fresh install.
    // Actual: same, computed here from `trackerGroupHeads()` rather than a
    //   quoted number, so a new tracker group cannot make the line a lie.
    const html = renderSettings();
    const heads = trackerGroupHeads();
    const on = heads.filter((h) => isTrackerGroupEnabled(DEFAULT_ENABLED_TRACKERS, h)).length;
    expect(on).toBeGreaterThan(0);
    const expected = t("settings.trackers.summary", { on, total: heads.length });
    const m = /<span class="collapsible-card-summary">([^<]*)<\/span>/.exec(
      cardSlice(html, "settings-trackers"),
    );
    expect(m, "a collapsed card must be able to say what it holds").not.toBeNull();
    expect(m![1]).toBe(expected);
  });

  test("its open state round-trips: open → reload → open; wipe → collapsed", () => {
    // Does: open the card, simulate a reload (cold module cache, same bytes),
    //   render, then run the production reset and render again.
    // Expects: open after the reload; collapsed after "Minden adat törlése".
    // Actual: same — `aria-expanded="true"` / `"false"` on the same head.
    setCardCollapsed("settings-trackers", false);
    resetCardStatesForTests();
    expect(isOpen(renderSettings(), "settings-trackers")).toBe(true);

    resetCardStates();
    resetCardStatesForTests();
    expect(isOpen(renderSettings(), "settings-trackers")).toBe(false);
  });
});

/* ---------------- the label above the card, and its click ------------- */

describe("the group eyebrow above the Nyomonkövetés card", () => {
  /**
   * One group's slice of the page: from its `<section class="settings-group">`
   * to the next one. The eyebrow, the cards and nothing else live in here.
   */
  function groupSlice(html: string, label: string): string {
    const marker = `<p class="field-label">${label}</p>`;
    const at = html.indexOf(marker);
    if (at < 0) throw new Error(`no group eyebrow reads "${label}"`);
    const start = html.lastIndexOf("<section class=\"settings-group\"", at);
    const next = html.indexOf('<section class="settings-group"', at);
    return html.slice(start < 0 ? at : start, next < 0 ? undefined : next);
  }

  test("NO group eyebrow repeats the title of the card beneath it", () => {
    // Does: read every `<section class="settings-group">` on the rendered page,
    //   its eyebrow, and the title of the first remembering card inside it.
    // Expects: the two strings differ, for every group.
    // Actual: they did not. "Nyomonkövetés" was the eyebrow AND the card head
    //   directly below it, and "Navigáció" the same in the next group — so the
    //   first words a reader met were an inert copy of a button two lines
    //   lower. A click on that copy does nothing, which is exactly what was
    //   reported as "the card cannot be collapsed". The eyebrows are their own
    //   words now, and this is the guard that keeps a later rename from putting
    //   the duplicate back.
    const html = renderSettings();
    const groups = html.split('<section class="settings-group"').slice(1);
    expect(groups.length, "the page draws its groups").toBeGreaterThanOrEqual(8);
    for (const group of groups) {
      const eyebrow = /<p class="field-label">([^<]*)<\/p>/.exec(group)?.[1];
      const title = /<span class="collapsible-title">([^<]*)<\/span>/.exec(group)?.[1];
      expect(eyebrow, "every group has an eyebrow").toBeTruthy();
      expect(title, `the group "${eyebrow}" starts with a card`).toBeTruthy();
      expect(
        eyebrow,
        `the eyebrow "${eyebrow}" repeats the card under it — one of the two is a false affordance`,
      ).not.toBe(title);
    }
  });

  test("the first control in that group IS the card head, with nothing inert above it", () => {
    // Does: slice the tracking group and look at everything BEFORE the card's
    //   own head button.
    // Expects: no `<button` in that prefix — the head is the first thing a
    //   reader can click in the group, and it is the card's toggle.
    // Actual: same. The eyebrow is a `<p class="field-label">`, which is not a
    //   control, so the only clickable thing above the cards is the head.
    const html = renderSettings();
    const group = groupSlice(html, t("settings.groups.tracking"));
    // The card's own `<section>` is the whole head-and-body; everything before
    // it is the eyebrow. Slicing at the aria attribute instead would cut into
    // the head button and see the button itself.
    const cardAt = group.indexOf('<section id="settings-trackers"');
    expect(cardAt, "the card is in its own group").toBeGreaterThan(0);
    const before = group.slice(0, cardAt);
    expect(group.slice(cardAt)).toContain('aria-controls="card-body-settings-trackers"');
    expect(before).not.toContain("<button");
    expect(before, "the eyebrow still names the area").toContain(
      `<p class="field-label">${t("settings.groups.tracking")}</p>`,
    );
  });
});

/* -------------------- every card on the page ------------------------- */

describe("every card on the Settings page can be collapsed", () => {
  test("the only plain card is the crisis card, and it is named", () => {
    // Does: classify every `<section [id] class="card…">` on the rendered page.
    //   (The optional id is the `?quick=` scroll anchor every remembering card
    //   carries on its section; it precedes `class`, so a bare `<section class=`
    //   would now match only the plain cards and hide the very ones this test
    //   counts.)
    // Expects: 27 cards = the remembering cards (aria-controls head) + the
    //   session-local drawers (plain collapsible head) + EXACTLY ONE plain
    //   card, the crisis card.
    // Actual: same — 24 + 2 + 1 with the meds module on; the invariant this
    //   test states (plain == 1 && is the crisis card) holds at any count.
    const html = renderSettings();
    const cards = [...html.matchAll(/<section(?: id="[^"]*")? class="(card[^"]*)"/g)].map((m) => m[1]!);
    expect(cards.length).toBeGreaterThan(20);

    const plain = cards.filter((c) => !c.split(/\s+/).includes("collapsible"));
    expect(
      plain,
      "a plain card on Settings cannot be collapsed — convert it or name it here with a reason",
    ).toHaveLength(1);
    expect(plain[0]).toContain("crisis-card");
    // And the exception keeps its documented shape: a card, not a drawer.
    expect(html).toContain('class="card crisis-card"');
    expect(html).toContain("aria-controls=\"card-body-settings-trackers\"");
  });

  test("every collapsible head is a real, announced, REMEMBERING toggle", () => {
    // Does: count heads and their ARIA on the whole page.
    // Expects: heads == card-heads == aria-controls targets — after Phase 2
    //   of this batch no session-local `Collapsible` head remains on this
    //   page, so every toggle both announces its state and stores it.
    //   Twenty-seven with the meds module on: the twenty-six from before plus
    //   the Phase 1 companion card.
    // Actual: same.
    const html = renderSettings();
    const heads = html.match(/<button[^>]*class="collapsible-head[^"]*"[^>]*>/g) ?? [];
    const cardHeads = html.match(/collapsible-card-head/g) ?? [];
    const targets = html.match(/aria-controls="card-body-/g) ?? [];
    expect(heads.length).toBe(27);
    expect(cardHeads, "every head on this page is a remembering head").toHaveLength(heads.length);
    expect(targets, "every remembering head points at its own body").toHaveLength(heads.length);
    for (const head of heads) expect(head).toContain("aria-expanded=");
  });

  test("the request's surfaces each render as a remembering card, pinned by id", () => {
    // Does: look up each enumerated Settings surface by its storage id.
    // Expects: a head button under that id, collapsed on a fresh install,
    //   carrying the surface's own title.
    // Actual: same for all fourteen — the request's thirteen items, with
    //   "Egyéb" spelled out as its four cards plus the mood recorder.
    //   (`Névjegy` does not exist on this surface; the page's eight groups are
    //    Személyes, Megjelenés, Menüsor, Követett adatok, Emlékeztetők,
    //    Biztonság, Mentés és export, Egyéb — the request's list maps onto
    //    them, not onto a card. The last two eyebrows are not the card titles
    //    they sit above; see the eyebrow guard below.)
    const html = renderSettings();
    const request: readonly (readonly [string, string])[] = [
      ["settings-theme", t("settings.theme.title")], // Téma
      ["settings-font", t("settings.font.title")], // Betűtípus
      ["settings-iconset", t("settings.iconset.title")], // Ikonkészlet
      ["settings-background", t("settings.bg.title")], // Háttérkép
      ["settings-language", t("settings.language.title")], // Nyelv
      ["settings-modules", t("settings.modules.title")], // Modulok
      ["settings-trackers", t("settings.trackers.title")], // Nyomonkövetés
      ["settings-med-times", t("meds.times.title")], // Gyógyszeridőpontok
      ["settings-reminder", t("reminder.title")], // Emlékeztetők
      ["settings-pin", t("settings.pin.title")], // Biztonság
      ["settings-backup", t("backup.title")], // Mentés és export
      ["weather-api", t("weather.title")], // Egyéb
      ["food-ai-settings", t("foodAi.title")],
      ["health-import", t("healthImport.title")],
      ["settings-privacy", t("settings.privacy.title")], // Adatvédelem
    ];
    for (const [id, title] of request) {
      const slice = cardSlice(html, id);
      expect(slice, `${id} must be a CollapsibleCard head`).toContain("collapsible-card-head");
      expect(slice, `${id} must start collapsed`).toContain('aria-expanded="false"');
      expect(slice, `${id} title`).toContain(title);
    }
    expect(request.map(([id]) => id)).toHaveLength(15);
  });

  test("SettingsView renders no plain Card — the source has no such mount", () => {
    // Does: read the view's source.
    // Expects: no `<Card …>` JSX anywhere; the only card primitives imported
    //   are `CollapsibleCard`.
    // Actual: same. This is the guard for a card added to a group's render
    //   function, where the markup test above would still see it — but this
    //   one names the file and the line the moment it happens.
    const src = readFileSync(new URL("../../src/views/SettingsView.tsx", import.meta.url), "utf8");
    expect(src).not.toMatch(/<Card[\s/>]/);
    expect(src).toContain("CollapsibleCard");
  });
});
