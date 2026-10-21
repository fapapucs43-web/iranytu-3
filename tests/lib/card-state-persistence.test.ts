/**
 * Phase 2 of `fix/card-state-and-full-audit` — the persistence contract, pinned
 * from both ends: the SOURCE of the two paths a reload depends on, and the
 * BEHAVIOUR of the storage they touch.
 *
 * THE REPORT THIS FILE ANSWERS
 * A reader opened a tile, closed the app or refreshed, and every tile came
 * back collapsed. The walk found the mechanism already correct — one
 * `belso-iranytu:cardStates` key, `{ "card-id": collapsed }`, read lazily on
 * every mount and written through on every toggle — but found NO test that
 * would notice if either half disappeared: `batch11-collapse` drives the
 * storage helpers directly (so a component that stopped CALLING them stays
 * green) and its source guard only checks that the names are imported. The
 * mutation proof at the bottom of this file is why both halves are now
 * source-sliced from `ui.tsx` and asserted as code that must run.
 *
 * THE STORED BOOLEAN, STATED ONCE
 * `true` = collapsed, `false` = open, absent = collapsed (`!== false` is the
 * whole rule). The shape the request describes — one boolean per card id —
 * matches; the polarity is this repository's documented convention and is
 * pinned here rather than flipped, because flipping would silently invert
 * every existing reader's arrangement unless the blob were migrated, for no
 * observable gain: the contract under test is "the tile keeps its LAST state",
 * which holds either way.
 *
 * HOW THE MUTATIONS WERE PROVEN
 * Each mutation was applied to `src/components/ui/ui.tsx`, this file run, the
 * change reverted: M-A deletes `setCardCollapsed(id, next)` from `toggle`
 * (only the source-slice below notices — every behavioural test calls the
 * helper itself), M-B replaces the `useState` initialiser so the card never
 * reads storage (the mount tests go red). Both runs are recorded in the
 * batch's final report; the assertions here are what makes them red.
 *
 * No jsdom: renders are `renderToStaticMarkup`, the click is exercised
 * through the same exported helper the handler calls, and the SOURCE is the
 * half that proves the handler calls it.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CollapsibleCard } from "../../src/components/ui/ui";
import { AppProvider } from "../../src/state/AppContext";
import {
  CARD_STATES_KEY,
  loadCardStates,
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
  resetCardStatesForTests();
});

afterEach(() => {
  for (const k of Object.keys(backing)) delete backing[k];
  resetCardStatesForTests();
});

/** A page of cards, through the real provider the app mounts. */
function renderCards(...ids: string[]): string {
  return renderToStaticMarkup(
    createElement(
      AppProvider,
      null,
      null,
      ...ids.map((id) =>
        createElement(
          CollapsibleCard,
          { id, title: `kártya ${id}`, icon: null, summary: "összegzés" },
          createElement("p", null, "tartalom"),
        ),
      ),
    ),
  );
}

function isOpen(html: string, id: string): boolean {
  const marker = `aria-controls="card-body-${id}"`;
  const attr = html.indexOf(marker);
  if (attr < 0) throw new Error(`no card "${id}" in this markup`);
  const head = html.lastIndexOf("<button", attr);
  return html.slice(head, attr).includes('aria-expanded="true"');
}

/* ----------------------- the two source paths ------------------------ */

const UI_SOURCE = readFileSync(new URL("../../src/components/ui/ui.tsx", import.meta.url), "utf8");

/** The whole `toggle` closure — from its declaration to the first close. */
function toggleSource(): string {
  const start = UI_SOURCE.indexOf("const toggle = () => {");
  expect(start, "CollapsibleCard must declare its toggle").toBeGreaterThan(-1);
  const ret = UI_SOURCE.indexOf("return next;", start);
  expect(ret, "toggle must return the flipped state").toBeGreaterThan(start);
  // Inclusive of the marker: the ordering assertion below compares the write
  // against the RETURN, so the slice has to contain both.
  return UI_SOURCE.slice(start, ret + "return next;".length);
}

/**
 * The `useState` initialiser that decides a card's state on mount.
 *
 * A BLOCK rather than a line, since `defaultOpen`: the decision is three lines
 * now — read the stored entry, and fall back to the card's own default when it
 * has never been touched. A one-line search would find either nothing or a
 * half-sentence, so the slice runs from the `useState(() => {` to its `});`.
 */
function mountReadBlock(): string {
  const start = UI_SOURCE.indexOf("const [collapsed, setCollapsed] = useState(() => {");
  expect(start, "the card must read storage in its useState initialiser").toBeGreaterThan(-1);
  const end = UI_SOURCE.indexOf("});", start);
  expect(end, "the initialiser must close").toBeGreaterThan(start);
  return UI_SOURCE.slice(start, end + "});".length);
}

describe("the save path: every toggle writes through, immediately", () => {
  test("the component's own toggle calls setCardCollapsed — not just imports it", () => {
    // Does: slice the `toggle` closure out of ui.tsx.
    // Expects: the body calls `setCardCollapsed(id, next)` — the write-through
    //   that makes "open a tile, close the app, reopen" keep the tile open.
    // Actual: same. batch11's guard only proves the NAME is imported; this is
    //   the assertion that a deleted call cannot survive.
    const slice = toggleSource();
    expect(slice).toContain("setCardCollapsed(id, next)");
  });

  test("the write is synchronous — no debounce, no timer, no unmount flush", () => {
    // Does: scan the same slice for the deferral idioms that would break a
    //   close-the-app-before-the-timer-fires reader.
    // Expects: zero occurrences of setTimeout / debounce / idle / microtask
    //   scheduling between the click and the write.
    // Actual: same — the helper runs inline in the state updater.
    const slice = toggleSource();
    for (const deferral of ["setTimeout", "debounce", "requestIdleCallback", "queueMicrotask", "Promise."]) {
      expect(slice, `${deferral} must not sit between the toggle and its write`).not.toContain(
        deferral,
      );
    }
    // The write happens BEFORE the updater returns, i.e. inside the click:
    expect(slice.indexOf("setCardCollapsed")).toBeLessThan(slice.indexOf("return next;"));
  });

  test("a click-shaped write is in storage before any render or reload", () => {
    // Does: flip one card through the same helper the onClick calls, then
    //   read the RAW bytes — no cache, no re-render in between.
    // Expects: the backing store already holds the new value synchronously
    //   (the spec's "Toggle → azonnali localStorage write").
    // Actual: same.
    setCardCollapsed("tile-a", false);
    expect(backing[CARD_STATES_KEY]).toBe('{"tile-a":false}');
    setCardCollapsed("tile-a", true);
    expect(backing[CARD_STATES_KEY]).toBe('{"tile-a":true}');
  });
});

describe("the load path: every mount reads storage, absent means collapsed", () => {
  test("the component's mount reads storage through loadCardStates, tolerant of absence", () => {
    // Does: slice the `useState` initialiser.
    // Expects: it reads `loadCardStates()[id]` for the entry, and decides the
    //   absent case from the card's own default — `stored === undefined ?
    //   !defaultOpen : stored`. An explicit stored `false` still opens and an
    //   explicit `true` still closes, so no reader's stored choice changes.
    // Actual: same. The default only governs the state BEFORE the reader has
    //   said anything, which is why the ordinary card (defaultOpen absent)
    //   still mounts collapsed — the assertion below renders one to prove it.
    const block = mountReadBlock();
    expect(block).toContain("loadCardStates()[id]");
    expect(block).toContain("stored === undefined ? !defaultOpen : stored");
    expect(block).not.toContain("sessionStorage");
  });

  test("`defaultOpen` decides only the untouched case, and storage still wins", () => {
    // Does: render one card with `defaultOpen` and one without, on fresh
    //   storage; then store `true` for the first and render again.
    // Expects: the default-open card is open and the ordinary card is
    //   collapsed; a stored `true` closes the default-open card, because the
    //   reader's own choice always beats the default.
    // Actual: same. `TrackerInputs` is the one caller — the Ma tab's tracker
    //   frame, whose body is the daily work and would be hidden by a shut card.
    const fresh = renderToStaticMarkup(
      createElement(
        AppProvider,
        null,
        null,
        createElement(
          CollapsibleCard,
          { id: "default-open", title: "kártya", icon: null, summary: "összegzés", defaultOpen: true },
          createElement("p", null, "tartalom"),
        ),
        createElement(
          CollapsibleCard,
          { id: "ordinary", title: "kártya", icon: null, summary: "összegzés" },
          createElement("p", null, "tartalom"),
        ),
      ),
    );
    expect(isOpen(fresh, "default-open"), "defaultOpen starts open").toBe(true);
    expect(isOpen(fresh, "ordinary"), "the default stays collapsed").toBe(false);

    setCardCollapsed("default-open", true);
    resetCardStatesForTests();
    const closed = renderToStaticMarkup(
      createElement(
        AppProvider,
        null,
        null,
        createElement(
          CollapsibleCard,
          { id: "default-open", title: "kártya", icon: null, summary: "összegzés", defaultOpen: true },
          createElement("p", null, "tartalom"),
        ),
      ),
    );
    expect(isOpen(closed, "default-open"), "a stored choice beats the default").toBe(false);
  });

  test("storage is localStorage-shaped, never sessionStorage", () => {
    // Does: read the storage module for the substrate it touches.
    // Expects: `localStorage` present, `sessionStorage` absent — a session
    //   store is exactly the "close the app, everything collapsed" bug.
    // Actual: same (batch11 pins the component half: ui.tsx must not touch
    //   localStorage itself, only the helper).
    const src = readFileSync(new URL("../../src/lib/cardStates.ts", import.meta.url), "utf8");
    expect(src).toContain("localStorage.getItem(CARD_STATES_KEY)");
    expect(src).toContain("localStorage.setItem(CARD_STATES_KEY,");
    expect(src).not.toContain("sessionStorage");
  });

  test("fresh storage: the card mounts collapsed — the default the report wants", () => {
    // Does: render a card with an empty backing store.
    // Expects: `aria-expanded="false"`, body hidden (absent id = collapsed).
    // Actual: same.
    const html = renderCards("fresh");
    expect(isOpen(html, "fresh")).toBe(false);
    expect(html).toContain('aria-controls="card-body-fresh"');
    expect(html).toContain('hidden=""');
  });

  test("a stored open state reaches the very first render (load runs per mount)", () => {
    // Does: write open WITHOUT going through the component, drop the module
    //   cache (what a reload does), render.
    // Expects: `aria-expanded="true"` on that card — proof the read happens
    //   at mount, not lazily on some later interaction.
    // Actual: same.
    setCardCollapsed("warm", false);
    resetCardStatesForTests();
    const html = renderCards("warm");
    expect(isOpen(html, "warm")).toBe(true);
    expect(html).not.toContain('aria-controls="card-body-warm" hidden=""');
  });

  test("corrupt storage: every card still mounts, every card collapsed, no throw", () => {
    // Does: hand the module a blob that is not JSON, then an array, then a
    //   boolean map with wrong value types.
    // Expects: each render succeeds; the garbage ids read as collapsed
    //   (`parseCardStates` keeps only valid entries — "if the key is broken:
    //   default collapsed, never crash").
    // Actual: same.
    for (const garbage of ["{not json", "[1,2,3]", '"open"', '{"x":"open","y":1}']) {
      backing[CARD_STATES_KEY] = garbage;
      resetCardStatesForTests();
      const html = renderCards("x", "y");
      expect(isOpen(html, "x"), `garbage ${JSON.stringify(garbage)} must not open x`).toBe(false);
      expect(isOpen(html, "y"), `garbage ${JSON.stringify(garbage)} must not open y`).toBe(false);
    }
  });
});

/* ---------------- the lifecycle the reader actually reported ----------- */

describe("the reader's loop: open → close app → reopen; refresh; wipe", () => {
  test("app close/reopen: state survives a cold module graph over the same bytes", () => {
    // Does: open two of three tiles, drop the module cache (the whole app
    //   graph is new after a close), render all three again.
    // Expects: the two opened tiles come back open, the third stays closed —
    //   "close the app → reopen → the last state remains".
    // Actual: same.
    setCardCollapsed("a", false);
    setCardCollapsed("c", false);
    resetCardStatesForTests();
    const html = renderCards("a", "b", "c");
    expect(isOpen(html, "a")).toBe(true);
    expect(isOpen(html, "b")).toBe(false);
    expect(isOpen(html, "c")).toBe(true);
  });

  test("refresh mid-session: a second render of the same page agrees with storage", () => {
    // Does: render, "open" a tile through the helper (what the click does),
    //   render the page again without touching storage.
    // Expects: the second render shows the tile open — no unmount write, no
    //   effect, nothing that could be skipped on a refresh.
    // Actual: same.
    const first = renderCards("mid");
    expect(isOpen(first, "mid")).toBe(false);
    setCardCollapsed("mid", false);
    const second = renderCards("mid");
    expect(isOpen(second, "mid")).toBe(true);
  });

  test("several tiles at once: each keeps its own state, none follows another", () => {
    // Does: open two, close one, cold-read, render all.
    // Expects: exactly the two opened are open — the map is keyed per id and
    //   one card's toggle never rewrites another's entry.
    // Actual: same.
    for (const id of ["t1", "t2", "t3", "t4"]) setCardCollapsed(id, true);
    setCardCollapsed("t2", false);
    setCardCollapsed("t4", false);
    resetCardStatesForTests();
    const html = renderCards("t1", "t2", "t3", "t4");
    expect(isOpen(html, "t1")).toBe(false);
    expect(isOpen(html, "t2")).toBe(true);
    expect(isOpen(html, "t3")).toBe(false);
    expect(isOpen(html, "t4")).toBe(true);
    expect(Object.keys(loadCardStates())).toHaveLength(4);
  });

  test('"Minden adat törlése" clears every tile with everything else', () => {
    // Does: open four tiles, run the production reset the wipe chain calls,
    //   cold-read and render.
    // Expects: the key is gone from storage, the cache is empty, and every
    //   tile mounts collapsed again.
    // Actual: same.
    for (const id of ["w1", "w2", "w3", "w4"]) setCardCollapsed(id, false);
    expect(Object.keys(backing)).toEqual([CARD_STATES_KEY]);
    resetCardStates();
    expect(backing[CARD_STATES_KEY]).toBeUndefined();
    expect(loadCardStates()).toEqual({});
    resetCardStatesForTests();
    const html = renderCards("w1", "w2", "w3", "w4");
    for (const id of ["w1", "w2", "w3", "w4"]) expect(isOpen(html, id), id).toBe(false);
  });
});

/* ====================== the 2 required mutations ====================== */
//
// Applied by hand, this file run, reverted; each is caught by exactly the
// assertion named, and by nothing that merely imports the helper.
//
// M-A · ui.tsx: delete `setCardCollapsed(id, next);` from `toggle`.
//   Caught by: "the component's own toggle calls setCardCollapsed — not just
//   imports it" (the slice loses the call). Every behavioural test in this
//   file and in batch11 still passes, because they drive the helper — which
//   is precisely the gap this assertion closes.
//
// M-B · ui.tsx: replace the initialiser with `useState(true)` (a card that
//   never reads storage).
//   Caught by: "the component's mount reads storage through loadCardStates"
//   (the line is gone) AND the behavioural half — "a stored open state
//   reaches the very first render", "app close/reopen", "refresh mid-session"
//   and "several tiles at once" all render their open tiles as collapsed.
//
// (Five further mutations are applied to the app by Phase 3's
//  tests/full-app-audit.test.ts and recorded there.)

describe("the mutation guard itself cannot be satisfied vacuously", () => {
  test("the slices are real code from the shipped component", () => {
    // Self-check: an empty corpus would make every assertion above pass
    // against nothing. The slices must be substantial, and the component the
    // app renders must be the file they came from.
    const toggle = toggleSource();
    expect(toggle.length).toBeGreaterThan(40);
    expect(toggle).toContain("setCollapsed((prev)");
    expect(UI_SOURCE).toContain("export function CollapsibleCard");
    expect(mountReadBlock().length).toBeGreaterThan(20);
    // The helper the toggle writes through lives in the storage module, and
    // the component imports it from there — one implementation, not a copy.
    expect(UI_SOURCE).toContain('import { loadCardStates, setCardCollapsed } from "../../lib/cardStates"');
  });
});
