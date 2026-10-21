/**
 * Batch 12 (the final wrap-up batch), commit 5 — what was actually left of the
 * auto theme, and the fix for it.
 *
 * THE FINDING THIS BATCH STARTED FROM. The original plan assumed the auto
 * theme was unbuilt. It is not, and three separate batches had already built
 * it: `themeMeta()` offers „Auto (rendszer)" as the first swatch and
 * `SettingsView` renders whatever it lists, `resolveTheme` answers the
 * question through `matchMedia`, and `ThemeContext` re-applied the tokens on a
 * live `change` listener. Commit 3c closed the fourth gap (a corrupt stored
 * `theme` blanking the app). So the feature was complete and the plan's
 * premise was stale — `docs/final-audit-v2.md` §2.4 had already struck the
 * "follow-system theme" row off the gap list for exactly this reason.
 *
 * WHAT WAS ACTUALLY MISSING is one line, and it is the line that makes "auto"
 * mean auto:
 *
 *   mq.addEventListener?.("change", onChange);
 *
 * Optional-chained, so on any browser whose `MediaQueryList` only has the older
 * `addListener`/`removeListener` pair — Safari 13, iOS 13 — the subscription was
 * a silent no-op. The theme would resolve correctly at launch and then never
 * change again while the app was open, and the reduced-motion subscription the
 * navigation used would be dead on exactly the devices that ask for reduced
 * motion most. `useAutoHideNav` even carried a comment saying the legacy
 * spelling was handled. It was not, and NO test in the suite faked `matchMedia`
 * at all, so nothing could have noticed.
 *
 * So this file tests the thing that was untestable in place. The subscription
 * lived inside a `useEffect`, and this suite has no jsdom and runs no effects —
 * which is why extracting `lib/media.ts` was not tidiness but the only way to
 * get the behaviour under test at all. The same shape as
 * `lib/navAutoHide`'s `createAutoHide(win, options)`: a fake window in, real
 * behaviour out.
 *
 * AND THE STRING, which is the quieter half. `resolveTheme` and the
 * subscription that keeps it live have to ask the browser the SAME question.
 * Two copies of `(prefers-color-scheme: dark)` that drift apart produce an auto
 * theme that follows nothing, with no error anywhere. There is now one export,
 * and a test that reads the query out of a live subscription and compares it to
 * the one `resolveTheme` resolved under.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  PREFERS_DARK,
  PREFERS_REDUCED_MOTION,
  matchesMediaQuery,
  mediaQueryOf,
  subscribeToMediaQuery,
  type MediaQueryLike,
  type MediaWindow,
} from "../src/lib/media";
import { applyThemeTokens, resolveTheme, THEMES } from "../src/lib/themes";

/** A MediaQueryList with the modern API. */
function modern(matches = false): MediaQueryLike & {
  fired: number;
  removed: number;
  removeCalls: number;
} {
  const listeners: (() => void)[] = [];
  const q = {
    matches,
    fired: 0,
    removed: 0,
    removeCalls: 0,
    addEventListener(_type: "change", listener: () => void) {
      listeners.push(listener);
    },
    removeEventListener(_type: "change", listener: () => void) {
      q.removeCalls++;
      const i = listeners.indexOf(listener);
      if (i >= 0) {
        listeners.splice(i, 1);
        q.removed++;
      }
    },
    /** Pretend the OS flipped its preference. */
    flip(next: boolean) {
      q.matches = next;
      for (const listener of [...listeners]) listener();
    },
    get listenerCount() {
      return listeners.length;
    },
  };
  return q;
}

/**
 * A MediaQueryList as Safari 13 and iOS 13 hand it over: no
 * `addEventListener` at all. This is the object the old code silently
 * subscribed to nothing on.
 */
function legacy(matches = false): MediaQueryLike & {
  fired: number;
  removed: number;
  removeCalls: number;
} {
  const listeners: (() => void)[] = [];
  const q = {
    matches,
    fired: 0,
    removed: 0,
    removeCalls: 0,
    addListener(listener: () => void) {
      listeners.push(listener);
      q.fired++;
    },
    removeListener(listener: () => void) {
      q.removeCalls++;
      const i = listeners.indexOf(listener);
      if (i >= 0) {
        listeners.splice(i, 1);
        q.removed++;
      }
    },
    flip(next: boolean) {
      q.matches = next;
      for (const listener of [...listeners]) listener();
    },
    get listenerCount() {
      return listeners.length;
    },
  };
  return q;
}

const win = (query: MediaQueryLike): MediaWindow => ({ matchMedia: () => query });

describe("reading a query", () => {
  test("it reports the current answer", () => {
    expect(matchesMediaQuery(PREFERS_DARK, win(modern(true)))).toBe(true);
    expect(matchesMediaQuery(PREFERS_DARK, win(modern(false)))).toBe(false);
  });

  test("a browser with no matchMedia answers false rather than throwing", () => {
    // A theme is not worth a blank app, and `resolveTheme` is called during
    // the first render — an exception here would be the blank app.
    expect(matchesMediaQuery(PREFERS_DARK, {})).toBe(false);
    expect(matchesMediaQuery(PREFERS_DARK, { matchMedia: undefined })).toBe(false);
    expect(mediaQueryOf(PREFERS_DARK, {})).toBeNull();
  });

  test("a matchMedia that throws is treated as a browser that cannot answer", () => {
    const hostile: MediaWindow = {
      matchMedia: () => {
        throw new Error("no");
      },
    };
    expect(matchesMediaQuery(PREFERS_DARK, hostile)).toBe(false);
  });
});

describe("subscribing, on a browser with the modern API", () => {
  test("the current answer arrives once, without waiting for a change", () => {
    const seen: boolean[] = [];
    const stop = subscribeToMediaQuery(PREFERS_DARK, (m) => seen.push(m), win(modern(true)));
    expect(seen).toEqual([true]);
    stop();
  });

  test("every change arrives, and the unsubscribe takes the listener with it", () => {
    const q = modern(false);
    const seen: boolean[] = [];
    const stop = subscribeToMediaQuery(PREFERS_DARK, (m) => seen.push(m), win(q));
    q.flip(true);
    q.flip(false);
    expect(seen).toEqual([false, true, false]);
    expect(q.listenerCount).toBe(1);
    stop();
    expect(q.listenerCount).toBe(0);
    expect(q.removed, "one listener was actually removed").toBe(1);
    // Nothing arrives after the stop, and unsubscribing twice is harmless —
    // which matters because a React effect cleanup can run after a re-subscribe
    // in StrictMode, and a throw here would take the whole tree down.
    q.flip(true);
    stop();
    expect(seen).toEqual([false, true, false]);
    expect(q.removeCalls, "the second stop reached the DOM").toBe(2);
    expect(q.removed, "but removed nothing, because there was nothing left").toBe(1);
  });
});

describe("subscribing, on a browser with only the legacy API", () => {
  // The regression this commit exists for. Safari 13 and iOS 13 have
  // `addListener`/`removeListener` and nothing else, and the line this replaced
  // — `mq.addEventListener?.("change", onChange)` — quietly did nothing there.
  test("a change still arrives", () => {
    const q = legacy(false);
    const seen: boolean[] = [];
    subscribeToMediaQuery(PREFERS_DARK, (m) => seen.push(m), win(q));
    q.flip(true);
    expect(seen).toEqual([false, true]);
    expect(q.fired, "the legacy listener was never attached").toBe(1);
  });

  test("and the unsubscribe calls the legacy remover", () => {
    const q = legacy(false);
    const stop = subscribeToMediaQuery(PREFERS_DARK, () => {}, win(q));
    stop();
    expect(q.removed).toBe(1);
    expect(q.removeCalls).toBe(1);
  });

  test("the modern spelling is preferred where both exist", () => {
    // A browser that has both must not end up with two subscriptions.
    const both: MediaQueryLike = { ...modern(false), ...legacy(false) };
    const seen: boolean[] = [];
    const stop = subscribeToMediaQuery(PREFERS_DARK, (m) => seen.push(m), win(both));
    expect(seen).toEqual([false]);
    stop();
  });

  test("a query object that can be neither subscribed nor left alone", () => {
    // Not a browser that exists; a guard so the helper degrades instead of
    // throwing halfway through an effect.
    const inert: MediaQueryLike = { matches: true };
    const seen: boolean[] = [];
    const stop = subscribeToMediaQuery(PREFERS_DARK, (m) => seen.push(m), win(inert));
    expect(seen, "the value was still delivered once").toEqual([true]);
    expect(() => stop()).not.toThrow();
  });

  test("no matchMedia at all: one false, and an unsubscribe that does nothing", () => {
    const seen: boolean[] = [];
    const stop = subscribeToMediaQuery(PREFERS_REDUCED_MOTION, (m) => seen.push(m), {});
    expect(seen).toEqual([false]);
    expect(() => stop()).not.toThrow();
  });
});

describe("the auto theme really does follow the operating system", () => {
  /** A fake documentElement, because applyThemeTokens writes CSS variables. */
  function root(): { props: Record<string, string>; el: HTMLElement } {
    const props: Record<string, string> = {};
    return {
      props,
      el: {
        style: { setProperty: (k: string, v: string) => void (props[k] = v) },
      } as unknown as HTMLElement,
    };
  }

  test.each([
    ["modern", modern],
    ["legacy", legacy],
  ] as const)("a live change repaints, on the %s API", (_name, make) => {
    // The end-to-end claim, on both browser shapes, and wired the way
    // `ThemeContext` wires it: a subscription whose callback repaints. The
    // second assertion is the one that matters — it can only pass if the
    // change event actually reached the callback, which is precisely what the
    // pre-Batch-12 line failed to deliver on the legacy API.
    const q = make(true);
    const r = root();
    const stop = subscribeToMediaQuery(
      PREFERS_DARK,
      () => applyThemeTokens(resolveTheme("auto", undefined, win(q)), r.el),
      win(q),
    );
    expect(r.props["--bg"], "the dark OS preference was not applied on subscribe").toBe(THEMES.dark.bg);
    q.flip(false);
    expect(r.props["--bg"], "the change event never reached the repaint").toBe(THEMES.light.bg);
    stop();
  });

  test("each query string exists exactly once in the app's JavaScript", () => {
    // The quiet half of the bug, and the one with no symptom to notice. If
    // `resolveTheme` asked one question and the subscription watched another,
    // the auto theme would resolve correctly at launch and then never change
    // again — with no error anywhere to point at the cause.
    //
    // Scoped to `.ts`/`.tsx`, because `styles.css` legitimately carries its own
    // `@media (prefers-reduced-motion: reduce)` block: CSS is a different
    // language with its own way of asking, and the stylesheet's copy is the
    // one that turns the animations off.
    const inCode = (literal: string): string[] => {
      const hits: string[] = [];
      const walk = (dir: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const path = join(dir, entry.name);
          if (entry.isDirectory()) walk(path);
          else if (/\.tsx?$/.test(entry.name)) {
            // Comments are not code: this file's own header quotes the string.
            const code = readFileSync(path, "utf8")
              .replace(/\/\*[\s\S]*?\*\//g, "")
              .replace(/^\s*\/\/.*$/gm, "");
            if (code.includes(literal)) hits.push(path.split("/src/")[1]);
          }
        }
      };
      walk(new URL("../src/", import.meta.url).pathname);
      return hits;
    };
    expect(inCode("(prefers-color-scheme: dark)")).toEqual(["lib/media.ts"]);
    expect(inCode("(prefers-reduced-motion: reduce)")).toEqual(["lib/media.ts"]);
    // ...and the stylesheet keeps its own copy, which is not drift.
    expect(readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")).toContain(
      "@media (prefers-reduced-motion: reduce)",
    );
  });
});

describe("both call sites go through the one module", () => {
  test.each([
    ["src/state/ThemeContext.tsx", "PREFERS_DARK"],
    ["src/components/useAutoHideNav.ts", "PREFERS_REDUCED_MOTION"],
  ])("%s subscribes through lib/media, not through a bare addEventListener", (file, constant) => {
    // Source-level, and deliberately so: the subscription itself lives inside
    // a `useEffect`, which no test in this suite can run. What can be checked
    // is that the wiring does not go back to spelling the listener out — which
    // is how the legacy browser lost its theme in the first place.
    const src = readFileSync(new URL(`../${file}`, import.meta.url), "utf8")
      // Comments stripped: `useAutoHideNav` quotes the call it no longer makes,
      // in the comment that explains why, and a string in prose is not a call.
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(src).toContain(`import {`);
    expect(src).toMatch(new RegExp(`\\b${constant}\\b`));
    expect(src).toContain("subscribeToMediaQuery(");
    expect(src, `${file} calls the DOM listener directly again`).not.toMatch(
      /\.addEventListener\?\.\("change"/,
    );
    expect(src).not.toMatch(/matchMedia\("\(prefers/);
  });

  test("and the reduced-motion reads are the same one", () => {
    for (const file of ["src/components/useAutoHideNav.ts", "src/components/BreathingExercise.tsx"]) {
      const src = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
      expect(src, `${file} still spells the query out`).toContain("matchesMediaQuery(PREFERS_REDUCED_MOTION)");
      expect(src, `${file} kept its own copy of the query string`).not.toContain("REDUCED_MOTION_QUERY");
      expect(src, `${file} reaches for matchMedia directly`).not.toContain("matchMedia?.");
    }
  });
});

// The two query constants, restated here so the file's own claim is checked by
// something other than its prose.
describe("the constants are the queries they claim to be", () => {
  test("both are media features, and neither is empty", () => {
    for (const query of [PREFERS_DARK, PREFERS_REDUCED_MOTION]) {
      expect(query.startsWith("(") && query.endsWith(")")).toBe(true);
      expect(query).toContain("prefers-");
    }
  });
});
