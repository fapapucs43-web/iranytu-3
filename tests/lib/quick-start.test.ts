/**
 * THE DEEP LINK SYSTEM — `?quick=`, the manifest's shortcuts, and the
 * reminder's click, all one vocabulary.
 *
 * WHY THIS FILE EXISTS as its own file beside `ios-install.test.ts`: that one
 * guards the three iOS tags and the single historical `mood` link; this one
 * guards the SYSTEM the widget batch built on top — nine parameters, each a
 * (tab, anchor) pair, the pure mapping behind them, the in-app bridge a
 * tapped notification publishes through, and the manifest's four shortcuts
 * checked against the same table the app reads. One vocabulary, so a URL the
 * docs promise, the manifest advertises and the app honours cannot drift apart
 * without one of these assertions failing.
 *
 * Globals: every case that needs `window`, `document`, `requestAnimationFrame`
 * or `Notification` installs its own double and RESTORES it. This file shares
 * a process with every other test file — a leftover `window` would be a lie
 * the rest of the suite believes (that exact bug shipped once, and
 * `ios-install.test.ts`'s helper is the shape that fixed it).
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  QUICK_VALUES,
  cleanQuickParam,
  consumeQuickStart,
  consumeQuickTarget,
  emitQuickStart,
  quickTargetFor,
  scrollToQuickAnchor,
  subscribeQuickStart,
} from "../../src/lib/quickStart";
import { showReminder } from "../../src/lib/notifications";

type Globals = Record<string, unknown>;

/** Install `window` (or remove it) for the duration of `body`, then restore. */
function withWindow<T>(href: string | null, body: () => T): T {
  const g = globalThis as Globals;
  const had = "window" in g;
  const prev = g.window;
  if (href === null) delete g.window;
  else
    g.window = {
      location: { href, search: href.includes("?") ? href.slice(href.indexOf("?")) : "" },
      history: { replaceState: () => undefined },
    };
  try {
    return body();
  } finally {
    if (had) g.window = prev;
    else delete g.window;
  }
}

const URL_BASE = "https://iranytu2.freebuff.app/";

const MANIFEST = JSON.parse(
  readFileSync(new URL("../../public/manifest.webmanifest", import.meta.url), "utf8"),
) as {
  shortcuts: {
    name: string;
    short_name: string;
    description: string;
    url: string;
    icons: { src: string; sizes: string; type: string }[];
  }[];
};

describe("the vocabulary: nine values, each a (tab, anchor) pair", () => {
  test("the vocabulary is exactly the nine documented values", () => {
    // Sorted, so an added or dropped parameter is a deliberate diff against
    // this line — the same pin style the icon and quadrant registries use.
    expect(QUICK_VALUES).toEqual([
      "breath",
      "entry",
      "insights",
      "journal",
      "meditate",
      "mood",
      "settings",
      "today",
      "tools",
    ]);
  });

  test("the four widget destinations land where the guides promise", () => {
    expect(quickTargetFor("mood")).toEqual({ tab: "today", anchor: "today-mood" });
    expect(quickTargetFor("entry")).toEqual({ tab: "today", anchor: "today-mood" });
    expect(quickTargetFor("breath")).toEqual({ tab: "tools", anchor: "tools-therapy" });
    expect(quickTargetFor("meditate")).toEqual({ tab: "tools", anchor: "tools-therapy" });
  });

  test("the tab-only values carry no anchor", () => {
    for (const value of ["today", "tools", "journal", "insights", "settings"]) {
      expect(quickTargetFor(value)).toEqual({ tab: value, anchor: null });
    }
  });

  test("an unknown or empty value is no instruction, never a guess", () => {
    expect(quickTargetFor("nonsense")).toBeNull();
    expect(quickTargetFor("")).toBeNull();
    expect(quickTargetFor(null)).toBeNull();
    expect(quickTargetFor(undefined)).toBeNull();
    // Case matters: a typo'd `Mood` must not silently work either.
    expect(quickTargetFor("Mood")).toBeNull();
  });

  test("every anchor the vocabulary names exists in the views that paint it", () => {
    // The anchors are element ids in the tree. If a view renames one, the
    // deep link would scroll to nothing for every reader — so the claim is
    // checked against the source, the same way the inventory's anchors are.
    const today = readFileSync(new URL("../../src/views/TodayView.tsx", import.meta.url), "utf8");
    const tools = readFileSync(new URL("../../src/views/ToolsView.tsx", import.meta.url), "utf8");
    expect(today).toContain('id="today-mood"');
    expect(tools).toContain('id="tools-therapy"');
  });
});

describe("reading the instruction from the URL", () => {
  test("mood → today (the widget's promise), alongside other parameters", () => {
    expect(withWindow(`${URL_BASE}?quick=mood`, consumeQuickStart)).toBe("today");
    expect(withWindow(`${URL_BASE}?nocache=99&quick=mood&x=1`, consumeQuickStart)).toBe("today");
    expect(withWindow(`${URL_BASE}?quick=breath`, consumeQuickStart)).toBe("tools");
  });

  test("the full target survives the read, anchor included", () => {
    expect(withWindow(`${URL_BASE}?quick=breath`, consumeQuickTarget)).toEqual({
      tab: "tools",
      anchor: "tools-therapy",
    });
    expect(withWindow(`${URL_BASE}?quick=journal`, consumeQuickTarget)).toEqual({
      tab: "journal",
      anchor: null,
    });
  });

  test("no parameter, unknown parameter, no window → null", () => {
    expect(withWindow(URL_BASE, consumeQuickStart)).toBeNull();
    expect(withWindow(`${URL_BASE}?nocache=1`, consumeQuickStart)).toBeNull();
    expect(withWindow(`${URL_BASE}?quick=nonsense`, consumeQuickTarget)).toBeNull();
    expect(withWindow(null, consumeQuickStart)).toBeNull();
    expect(withWindow(null, consumeQuickTarget)).toBeNull();
  });

  test("a partial window (location without href) reads as no instruction", () => {
    // The cross-file pollution bug: `typeof window` passed, `.href` threw, and
    // the throw escaped during render. The read is inside a try on purpose.
    const g = globalThis as Globals;
    const had = "window" in g;
    const prev = g.window;
    g.window = { location: {} };
    try {
      expect(consumeQuickStart()).toBeNull();
      expect(consumeQuickTarget()).toBeNull();
    } finally {
      if (had) g.window = prev;
      else delete g.window;
    }
  });

  test("cleanQuickParam scrubs the deep link and keeps everything else", () => {
    const g = globalThis as Globals;
    const had = "window" in g;
    const prev = g.window;
    let written: unknown = null;
    g.window = {
      location: { href: `${URL_BASE}?quick=breath&keep=1` },
      history: { replaceState: (_s: unknown, _t: unknown, url: string) => (written = url) },
    };
    try {
      cleanQuickParam();
      expect(written).toBe("/?keep=1");
    } finally {
      if (had) g.window = prev;
      else delete g.window;
    }
  });
});

describe("the manifest's four shortcuts are instructions the app honours", () => {
  test("exactly four, each complete, in the order the widget guide lists", () => {
    expect(MANIFEST.shortcuts).toHaveLength(4);
    expect(MANIFEST.shortcuts.map((s) => s.url)).toEqual([
      "/?quick=mood",
      "/?quick=entry",
      "/?quick=breath",
      "/?quick=meditate",
    ]);
    for (const shortcut of MANIFEST.shortcuts) {
      expect(shortcut.name.length).toBeGreaterThan(0);
      expect(shortcut.short_name.length).toBeGreaterThan(0);
      expect(shortcut.description.length).toBeGreaterThan(0);
      expect(shortcut.url.startsWith("/?quick=")).toBe(true);
    }
  });

  test("every shortcut's parameter is in the vocabulary, so the URL is live", () => {
    // The failure this guards against shipped once: the manifest advertised
    // `/?tab=today`, a parameter NOTHING read. A shortcut whose parameter the
    // app does not know is a dead button in the launcher's long-press menu.
    for (const shortcut of MANIFEST.shortcuts) {
      const value = shortcut.url.slice("/?quick=".length);
      expect(QUICK_VALUES).toContain(value);
      expect(quickTargetFor(value)).not.toBeNull();
    }
  });

  test("every shortcut icon is a declared PNG that exists on disk", () => {
    for (const shortcut of MANIFEST.shortcuts) {
      expect(shortcut.icons.length).toBeGreaterThan(0);
      for (const icon of shortcut.icons) {
        expect(icon.sizes).toBe("192x192");
        expect(icon.type).toBe("image/png");
        expect(readFileSync(new URL(`../../public${icon.src}`, import.meta.url))).toBeTruthy();
      }
    }
  });
});

describe("the in-app half: a tapped notification's deep link", () => {
  test("emit publishes the target to subscribers; unknown values publish nothing", () => {
    const seen: unknown[] = [];
    const off = subscribeQuickStart((target) => seen.push(target));
    expect(emitQuickStart("mood")).toBe(true);
    expect(emitQuickStart("nonsense")).toBe(false);
    expect(seen).toEqual([{ tab: "today", anchor: "today-mood" }]);
    off();
    emitQuickStart("journal");
    expect(seen).toHaveLength(1); // unsubscribed: no more calls
  });

  test("one throwing subscriber cannot silence the others", () => {
    const seen: string[] = [];
    const offBad = subscribeQuickStart(() => {
      throw new Error("boom");
    });
    const offGood = subscribeQuickStart((target) => seen.push(target.tab));
    try {
      expect(emitQuickStart("insights")).toBe(true);
      expect(seen).toEqual(["insights"]);
    } finally {
      offBad();
      offGood();
    }
  });

  test("the daily reminder's notification carries a click that jumps to the Ma tab", () => {
    const g = globalThis as Globals;
    const hadWindow = "window" in g;
    const prevWindow = g.window;
    const hadNotif = "Notification" in g;
    const prevNotif = g.Notification;
    let focused = 0;
    class FakeNotification {
      static permission = "granted";
      onclick: (() => void) | null = null;
      constructor(
        public title: string,
        public options: { body: string; tag: string },
      ) {
        last = this;
      }
    }
    let last: InstanceType<typeof FakeNotification> | null = null;
    const Fake = FakeNotification as unknown as typeof Notification;
    g.Notification = Fake;
    g.window = { Notification: Fake, focus: () => (focused += 1) };
    const seen: unknown[] = [];
    const off = subscribeQuickStart((target) => seen.push(target));
    try {
      expect(showReminder("Ideje rögzíteni a hangulatodat")).toBe(true);
      expect(last).not.toBeNull();
      expect(last!.onclick).toBeTypeOf("function");
      last!.onclick!();
      expect(focused).toBe(1);
      expect(seen).toEqual([{ tab: "today", anchor: "today-mood" }]);
    } finally {
      off();
      if (hadWindow) g.window = prevWindow;
      else delete g.window;
      if (hadNotif) g.Notification = prevNotif;
      else delete g.Notification;
    }
  });
});

describe("the scroll: an anchor becomes the element on screen", () => {
  test("it looks the anchor up by id and scrolls it into view", () => {
    const g = globalThis as Globals;
    const hadDoc = "document" in g;
    const prevDoc = g.document;
    const hadRaf = "requestAnimationFrame" in g;
    const prevRaf = g.requestAnimationFrame;
    const asked: string[] = [];
    const scrolled: unknown[] = [];
    g.document = {
      getElementById: (id: string) => {
        asked.push(id);
        return { scrollIntoView: (opts: unknown) => scrolled.push(opts) };
      },
    };
    // Run the deferred frame synchronously so the assertion is deterministic
    // whether or not this runtime happens to ship rAF natively.
    g.requestAnimationFrame = (cb: () => void) => {
      cb();
      return 1;
    };
    try {
      scrollToQuickAnchor("tools-therapy");
      expect(asked).toEqual(["tools-therapy"]);
      expect(scrolled).toEqual([{ behavior: "smooth", block: "start" }]);
    } finally {
      if (hadDoc) g.document = prevDoc;
      else delete g.document;
      if (hadRaf) g.requestAnimationFrame = prevRaf;
      else delete g.requestAnimationFrame;
    }
  });

  test("no anchor, no document, or a missing element is a silent no-op", () => {
    const g = globalThis as Globals;
    const hadDoc = "document" in g;
    const prevDoc = g.document;
    try {
      expect(() => scrollToQuickAnchor(null)).not.toThrow();
      expect(() => scrollToQuickAnchor(undefined)).not.toThrow();
      g.document = { getElementById: () => null };
      expect(() => scrollToQuickAnchor("no-such-id")).not.toThrow();
      g.document = {
        getElementById: () => {
          throw new Error("detached");
        },
      };
      expect(() => scrollToQuickAnchor("tools-therapy")).not.toThrow();
    } finally {
      if (hadDoc) g.document = prevDoc;
      else delete g.document;
    }
  });
});
