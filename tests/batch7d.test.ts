/**
 * Batch 7d — auto-hiding bottom navigation.
 *
 * Three things are worth guarding, and they are guarded in three different
 * ways because they fail in three different ways.
 *
 * THE RULES are pure arithmetic over five values, so they are a table of
 * literals — exhaustively, including the cases that are easy to get wrong and
 * hard to notice: a slow scroll that must accumulate, a rubber-banded negative
 * offset, a threshold that must not fire on one pixel, and a "hold" that must
 * not rebase the remembered position.
 *
 * THE LISTENER is tested against a two-line fake window, because "off attaches
 * nothing" is a promise about the DOM and cannot be checked by reading the
 * decision function. This is why the controller is a separate module from the
 * hook: `renderToStaticMarkup` does not run effects, so a test of the hook
 * would assert nothing at all.
 *
 * THE SCOPE is tested against the source and against the real store, for the
 * two ways this feature can betray someone who never asked for it: a settings
 * blob that turns it on by accident, and a stylesheet that hides the bar at a
 * width where the bar is a top-of-page navigation rather than a bottom bar.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  NAV_DESKTOP_BREAKPOINT_PX,
  NAV_SCROLL_THRESHOLD,
  bottomNavClass,
  decideNav,
} from "../src/lib/navVisibility";
import { createAutoHide, type ScrollTarget } from "../src/lib/navAutoHide";
import { DEFAULT_SETTINGS } from "../src/types";

/* ------------------------------------------------------------------ */
/* 2. The listener                                                    */
/* ------------------------------------------------------------------ */

/** A window, as much of one as this feature uses. */
function fakeWindow(scrollY = 0) {
  const handlers: (() => void)[] = [];
  const win = {
    scrollY,
    added: 0,
    removed: 0,
    passive: [] as (boolean | undefined)[],
    addEventListener(_type: "scroll", h: () => void, o?: { passive?: boolean }) {
      handlers.push(h);
      win.added++;
      win.passive.push(o?.passive);
    },
    removeEventListener(_type: "scroll", h: () => void) {
      const i = handlers.indexOf(h);
      if (i >= 0) handlers.splice(i, 1);
      win.removed++;
    },
    /** Pretend the reader scrolled to y, and let the listener see it. */
    scrollTo(y: number) {
      win.scrollY = y;
      for (const h of [...handlers]) h();
    },
    get handlerCount() {
      return handlers.length;
    },
  };
  return win;
}

function harness(
  win: ReturnType<typeof fakeWindow>,
  options: { enabled?: boolean; reducedMotion?: boolean } = {},
) {
  const changes: boolean[] = [];
  const controller = createAutoHide(win as unknown as ScrollTarget, {
    enabled: options.enabled ?? true,
    reducedMotion: options.reducedMotion ?? false,
    onChange: (h) => changes.push(h),
  });
  return { controller, changes };
}

describe("off means no listener, not a listener that does nothing", () => {
  test("disabled attaches nothing and stays visible through a full scroll", () => {
    const win = fakeWindow();
    const { controller, changes } = harness(win, { enabled: false });
    controller.start();
    expect(controller.attached).toBe(false);
    expect(win.added).toBe(0);
    for (const y of [50, 200, 900, 20, 0]) win.scrollTo(y);
    expect(changes).toEqual([]);
    expect(controller.attached).toBe(false);
  });

  test("reduced motion attaches nothing either", () => {
    // The decision function answers "visible" under reduced motion, so
    // attaching a listener would be work for nothing — on exactly the devices
    // that asked for less work.
    const win = fakeWindow();
    const { controller, changes } = harness(win, { reducedMotion: true });
    controller.start();
    expect(controller.attached).toBe(false);
    expect(win.added).toBe(0);
    win.scrollTo(900);
    expect(changes).toEqual([]);
  });

  test("enabled attaches exactly one passive listener", () => {
    const win = fakeWindow();
    const { controller } = harness(win);
    controller.start();
    expect(controller.attached).toBe(true);
    expect(win.added).toBe(1);
    // Passive keeps scrolling on the compositor thread; the handler never
    // calls preventDefault, so promising it is free.
    expect(win.passive).toEqual([true]);
  });

  test("starting twice does not attach twice", () => {
    const win = fakeWindow();
    const { controller } = harness(win);
    controller.start();
    controller.start();
    expect(win.added).toBe(1);
    expect(win.handlerCount).toBe(1);
  });

  test("stopping detaches, and stopping twice is harmless", () => {
    const win = fakeWindow();
    const { controller, changes } = harness(win);
    controller.start();
    controller.stop();
    expect(controller.attached).toBe(false);
    expect(win.handlerCount).toBe(0);
    controller.stop();
    // A second stop must not remove a listener someone else has added.
    expect(win.removed).toBe(1);
    // And a detached nav must not move.
    win.scrollTo(900);
    expect(changes).toEqual([]);
  });
});

describe("the controller answers the way the rules say it should", () => {
  test("down hides, up shows, and it reports only the changes", () => {
    const win = fakeWindow();
    const { controller, changes } = harness(win);
    controller.start();
    win.scrollTo(3);
    win.scrollTo(6);
    win.scrollTo(40);
    win.scrollTo(41);
    win.scrollTo(300);
    win.scrollTo(20);
    win.scrollTo(0);
    win.scrollTo(400);
    expect(changes).toEqual([true, false, true]);
    controller.stop();
  });

  test("the remembered position is taken from the window at start", () => {
    // Mounting halfway down a page must not treat the first gesture as a jump
    // from zero. Two steps, because the threshold is eight pixels: a
    // five-pixel nudge is not a direction, a ten-pixel one is.
    const win = fakeWindow(5000);
    const { controller, changes } = harness(win);
    controller.start();
    win.scrollTo(5005);
    expect(changes).toEqual([]);
    win.scrollTo(5100);
    expect(changes).toEqual([true]);
    controller.stop();
  });

  test("restarting brings the bar back rather than resuming it hidden", () => {
    // A restart happens when the setting or the motion preference changes.
    // Re-attaching while the bar is hidden would leave the user with no
    // navigation and no gesture to summon it, so `start` re-anchors to the
    // current position AND publishes the visible state.
    const win = fakeWindow(1000);
    const { controller, changes } = harness(win);
    controller.start();
    win.scrollTo(2000);
    expect(changes).toEqual([true]);
    controller.stop();
    controller.start();
    expect(changes).toEqual([true, false]);
    // And it re-anchored, so a small nudge from here is not a decision.
    win.scrollTo(2005);
    expect(changes).toEqual([true, false]);
    win.scrollTo(2100);
    expect(changes).toEqual([true, false, true]);
    controller.stop();
  });
});

/* ------------------------------------------------------------------ */
/* 3. The promises to the user who never asked for this               */

/* 1. The rules                                                       */
/* ------------------------------------------------------------------ */

const base = {
  enabled: true,
  reducedMotion: false,
  hidden: false,
  threshold: 8,
};

describe("the nav hides when the reader scrolls down, and only then", () => {
  test("a decisive scroll down hides it", () => {
    expect(decideNav({ ...base, y: 500, lastY: 0 })).toEqual({ hidden: true, lastY: 500 });
  });

  test("a decisive scroll up shows it again", () => {
    expect(decideNav({ ...base, y: 300, lastY: 500, hidden: true })).toEqual({
      hidden: false,
      lastY: 300,
    });
  });

  test("one pixel of movement changes nothing", () => {
    // Touchpads, momentum and rubber-banding all emit deltas this small.
    // Reacting to them makes the bar flicker, which reads as a bug.
    expect(decideNav({ ...base, y: 400, lastY: 399 })).toEqual({ hidden: false, lastY: 399 });
    expect(decideNav({ ...base, y: 399, lastY: 400, hidden: true })).toEqual({
      hidden: true,
      lastY: 400,
    });
  });

  test("movement just under the threshold is held, and does NOT rebase", () => {
    // The rebase half is the subtle one. If `lastY` moved here, the threshold
    // would measure one event instead of the distance travelled, and a slow
    // three-pixels-per-event scroll could never add up to it.
    const held = decideNav({ ...base, y: 407, lastY: 400 });
    expect(held).toEqual({ hidden: false, lastY: 400 });
  });

  test("a slow scroll accumulates until it crosses the threshold", () => {
    // The regression this whole `lastY` rule exists to prevent: rebasing on
    // every event means a deliberate, unhurried reader never triggers it,
    // because no single three-pixel event is ever eight pixels.
    let lastY = 0;
    let hidden = false;
    const fired: number[] = [];
    for (let y = 3; y <= 60; y += 3) {
      const d = decideNav({ ...base, y, lastY, hidden });
      lastY = d.lastY;
      if (d.hidden !== hidden) {
        hidden = d.hidden;
        fired.push(y);
      }
    }
    // Fires once, at 15 — not at 9. The top rule re-anchors `lastY` for every
    // position inside the threshold, so accumulation starts from the last
    // position at or above 8px rather than from zero. That is the top rule
    // being in charge near the top, which is the point of it having priority.
    expect(fired).toEqual([15]);
  });

  test("past the top zone, the same slow scroll fires as soon as it should", () => {
    // The complementary case, so the re-anchoring above cannot be mistaken for
    // a general lag: start well down the page and three pixels at a time
    // crosses the threshold on the third event.
    let lastY = 1000;
    let hidden = false;
    const fired: number[] = [];
    for (const y of [1003, 1006, 1009]) {
      const d = decideNav({ ...base, y, lastY, hidden });
      lastY = d.lastY;
      if (d.hidden !== hidden) {
        hidden = d.hidden;
        fired.push(y);
      }
    }
    expect(fired).toEqual([1009]);
  });

  test("the threshold is a number, and a test can move it", () => {
    expect(NAV_SCROLL_THRESHOLD).toBeGreaterThan(0);
    // Proves the rule reads the parameter rather than a constant, which is
    // what makes the threshold testable at all.
    expect(decideNav({ ...base, threshold: 1, y: 3, lastY: 0 }).hidden).toBe(true);
  });
});

describe("the top of the document is always a way back", () => {
  test("scrolled to the top, it shows even if the state says hidden", () => {
    // A nav that stays hidden at the top is a trap: the way out is to scroll,
    // and scrolling is what hid it.
    expect(decideNav({ ...base, y: 0, lastY: 900, hidden: true })).toEqual({
      hidden: false,
      lastY: 0,
    });
  });

  test("the threshold zone counts as the top", () => {
    expect(decideNav({ ...base, y: NAV_SCROLL_THRESHOLD, lastY: 900, hidden: true }).hidden).toBe(
      false,
    );
  });

  test("a negative offset, which iOS reports while rubber-banding, is the top", () => {
    expect(decideNav({ ...base, y: -40, lastY: 0, hidden: true })).toEqual({
      hidden: false,
      lastY: -40,
    });
  });

  test("scrolling back up from the top re-hides only after a real descent", () => {
    // Leaving the top must not immediately re-hide, or a bounce at y=0 would
    // flicker the bar.
    const first = decideNav({ ...base, y: 0, lastY: -5, hidden: true });
    expect(first).toEqual({ hidden: false, lastY: 0 });
    const second = decideNav({ ...base, y: 20, lastY: 0, hidden: false });
    expect(second).toEqual({ hidden: true, lastY: 20 });
  });
});

describe("off by default, and off means visible whatever the scroll does", () => {
  test("disabled ignores a long descent", () => {
    expect(decideNav({ ...base, enabled: false, y: 5000, lastY: 0 })).toEqual({
      hidden: false,
      lastY: 5000,
    });
  });

  test("disabled wins over a state that says hidden", () => {
    // Switching the setting off mid-scroll must take effect at once, not on
    // the next gesture — otherwise the user is left with no navigation and no
    // way to know why.
    expect(decideNav({ ...base, enabled: false, y: 900, lastY: 0, hidden: true }).hidden).toBe(
      false,
    );
  });

  test("and it is checked before reduced motion and before the top rule", () => {
    // Priority is part of the contract. If the order changed, a disabled
    // setting could start leaking the remembered position.
    const d = decideNav({ enabled: false, reducedMotion: true, y: 900, lastY: 0, hidden: true });
    expect(d).toEqual({ hidden: false, lastY: 900 });
  });
});

describe("reduced motion switches the feature off, not just its animation", () => {
  test("it never hides, at any scroll depth", () => {
    for (const y of [0, 50, 500, 5000]) {
      expect(decideNav({ ...base, reducedMotion: true, y, lastY: 0 }).hidden, `y=${y}`).toBe(
        false,
      );
    }
  });

  test("it overrides a state that says hidden", () => {
    expect(decideNav({ ...base, reducedMotion: true, y: 900, lastY: 0, hidden: true })).toEqual({
      hidden: false,
      lastY: 900,
    });
  });

  test("the decision survives a preference that arrives mid-scroll", () => {
    // The OS preference can change while the app is open, so the value is read
    // per event rather than once at mount.
    const before = decideNav({ ...base, y: 900, lastY: 0 });
    expect(before.hidden).toBe(true);
    const after = decideNav({ ...base, reducedMotion: true, y: 900, lastY: 0, hidden: true });
    expect(after.hidden).toBe(false);
  });
});

describe("the default is off, and the stored value cannot turn it on by accident", () => {
  test("DEFAULT_SETTINGS says false", () => {
    expect(DEFAULT_SETTINGS.autoHideNav).toBe(false);
  });

  test("the field is a plain boolean, not an optional one", () => {
    // Optional would mean `boolean | undefined` at every call site and a
    // second way for the value to be absent. Unlike `iconSet`, a boolean has
    // no third meaning worth protecting.
    const t = readFileSync(new URL("../src/types.ts", import.meta.url), "utf8");
    expect(t).toMatch(/autoHideNav: boolean;/);
    expect(t).not.toMatch(/autoHideNav\?:/);
  });

  test("a truthy string does not switch the feature on", async () => {
    // The bug this is really about: in JavaScript "false" is truthy. A blob
    // carrying the STRING "false" — from a hand-edited export, a bad merge or
    // an older importer — would switch the feature ON for someone who had
    // switched it off.
    const backing: Record<string, string> = {};
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: (k: string) => (k in backing ? backing[k] : null),
      setItem: (k: string, v: string) => {
        backing[k] = v;
      },
      removeItem: (k: string) => {
        delete backing[k];
      },
    };
    const payload = (settings: Record<string, unknown>) =>
      JSON.stringify({
        version: 2,
        entries: [],
        goals: [],
        dailyQuestion: null,
        medications: [],
        medicationChecks: {},
        profile: { name: "Teszt", goal: "" },
        settings,
      });
    for (const k of Object.keys(backing)) delete backing[k];
    backing["belso-iranytu-data-v2"] = payload({ autoHideNav: "false", theme: "dark" });
    const mod = await import("../src/lib/store?batch7d=truthy-string");
    const s = mod.getState().settings;
    expect(s.autoHideNav).toBe(false);
    expect(typeof s.autoHideNav).toBe("boolean");
    // A targeted repair, not a reset: the rest of their settings survive.
    expect(s.theme).toBe("dark");

    for (const k of Object.keys(backing)) delete backing[k];
    backing["belso-iranytu-data-v2"] = payload({ autoHideNav: true });
    const on = await import("../src/lib/store?batch7d=real-true");
    expect(on.getState().settings.autoHideNav).toBe(true);
  });

  test("a pre-7d blob, which has no such field, stays off", async () => {
    const backing: Record<string, string> = {};
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: (k: string) => (k in backing ? backing[k] : null),
      setItem: () => {},
      removeItem: () => {},
    };
    backing["belso-iranytu-data-v2"] = JSON.stringify({
      version: 2,
      entries: [],
      goals: [],
      dailyQuestion: null,
      medications: [],
      medicationChecks: {},
      profile: { name: "Teszt", goal: "" },
      settings: { theme: "light" },
    });
    const mod = await import("../src/lib/store?batch7d=absent");
    expect(mod.getState().settings.autoHideNav).toBe(false);
  });
});

/* ------------------------------------------------------------------ */

describe("the hidden state exists only where the bar is actually at the bottom", () => {
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

  test("the stylesheet turns it into a transform, not a removal", () => {
    // A control that cannot be tabbed to is a different, worse feature.
    expect(css).toMatch(/\.bottom-nav-hidden\s*\{\s*transform:\s*translateY\(100%\);\s*\}/);
    expect(css).not.toMatch(/\.bottom-nav-hidden[^{]*\{[^}]*display:\s*none/);
    expect(css).not.toMatch(/\.bottom-nav-hidden[^{]*\{[^}]*visibility:\s*hidden/);
  });

  test("that rule is inside a max-width query below the desktop breakpoint", () => {
    // Above 760px the Desktop block turns this element from a fixed bar at
    // the bottom into a sticky bar at the TOP of the document, where hiding it
    // would take the primary navigation away from someone reading. The rule
    // is scoped rather than relying on the desktop block coming later in the
    // file and winning on equal specificity — which is true today and is
    // exactly the kind of thing a future edit reorders silently.
    expect(NAV_DESKTOP_BREAKPOINT_PX).toBe(760);
    expect(css).toMatch(/@media \(min-width: 760px\)/);
    const scoped = /@media \(max-width: ([\d.]+)px\) \{\s*\.bottom-nav-hidden/.exec(css);
    expect(scoped, "the hidden rule is not inside a max-width query").not.toBeNull();
    // Strictly below the desktop breakpoint, so the two queries tile the range
    // with no width where both apply and none where neither does.
    expect(Number(scoped![1])).toBeLessThan(NAV_DESKTOP_BREAKPOINT_PX);
  });

  test("the bar keeps its room in the document while it is hidden", () => {
    // `.app-main` reserves space for the fixed bar. Reclaiming that space when
    // it hides would reflow the page on every gesture and shift content under
    // the reader's finger, which is worse than the blank strip it saves.
    expect(css).toMatch(/padding:\s*16px 16px calc\(96px \+ env\(safe-area-inset-bottom\)\)/);
  });
});

describe("the component adds a class and nothing else", () => {
  const src = readFileSync(new URL("../src/components/BottomNav.tsx", import.meta.url), "utf8");

  test("it holds no scroll logic of its own", () => {
    // The listener, the threshold and the direction belong to the controller.
    // A second copy in the component is a second thing to keep in step.
    for (const forbidden of ["addEventListener", "scrollY", "decideNav", "matchMedia"]) {
      expect(src, `BottomNav mentions ${forbidden}`).not.toContain(forbidden);
    }
    expect(src).toMatch(/useAutoHideNav/);
  });

  test("it reads the setting rather than a second source of truth", () => {
    expect(src).toMatch(/data\.settings\.autoHideNav/);
  });

  test("both class states are decided by a pure, tested function", () => {
    // Not by the component: a static render only ever shows the visible
    // state, so the hidden state's class would be asserted by nobody.
    expect(bottomNavClass(false)).toBe("bottom-nav");
    expect(bottomNavClass(true)).toBe("bottom-nav bottom-nav-hidden");
    // ...and the component uses that function rather than its own copy.
    expect(src).toMatch(/bottomNavClass\(/);
  });

  test("the visible bar is what it has always been: labelled, one button per tab", async () => {
    // Rendered, not simulated. `renderToStaticMarkup` runs no effects, so this
    // proves the markup of the state every user sees by default, which is the
    // one that must not have changed.
    const store = await import("../src/lib/store");
    const { AppProvider } = await import("../src/state/AppContext");
    const { IconSetProvider } = await import("../src/state/IconSetContext");
    const BottomNav = (await import("../src/components/BottomNav")).default;
    const settings = { ...store.getState().settings } as Record<string, unknown>;
    settings.autoHideNav = false;
    store.setSettings(settings as never);

    const html = renderToStaticMarkup(
      createElement(
        AppProvider,
        null,
        createElement(
          IconSetProvider,
          null,
          createElement(BottomNav, { active: "today" as const, onChange: () => {} }),
        ),
      ),
    );
    expect(html).toContain('class="bottom-nav"');
    expect(html).toContain('aria-label="Fő navigáció"');
    expect(html).not.toContain("bottom-nav-hidden");
    // Six since the Egészség tab was added: the bar keeps one button per tab
    // and the labels stay visible.
    expect((html.match(/<button/g) ?? []).length).toBe(6);
    // The tabs and their labels, read out of the registry rather than repeated.
    for (const label of ["Ma", "Egészség", "Felfedezés", "Napló", "Elemzés", "Beállítás"]) {
      expect(html, label).toContain(label);
    }
  });

});
