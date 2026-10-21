import type { TabId } from "../types";

/**
 * THE DEEP LINKS A WIDGET, SHORTCUT OR REMINDER SENDS — `?quick=mood`.
 *
 * A Home Screen shortcut, an iOS Shortcut, an Android shortcut, a manifest
 * `shortcuts` entry and a tapped daily reminder all do the same thing: hand the
 * app a URL that is a one-shot instruction, not a route — `/?quick=breath`
 * means "take me to the toolbox's Terápia drawer", and after the app has read
 * it the parameter has done its job. Leaving it in the address bar would be
 * wrong for the same reason `?nocache=` is scrubbed by `cleanResetParam`: a
 * parameter that lingers gets copied into a bookmark, pasted into a message,
 * and becomes the URL a reader returns to — which would then re-fire the deep
 * link on every visit.
 *
 * WHY A SMALL VOCABULARY AND NOT TAB NAMES. The surfaces that build these URLs
 * are outside the app (an iOS Shortcut's text field, an Android intent, the
 * manifest's own `shortcuts` array, a notification body), so the parameter is a
 * stable, documentable vocabulary rather than the app's internal `TabId`
 * union — and it can carry MORE than a tab: an anchor to scroll to, because
 * "the breathing exercise" is a place inside a tab, not the tab itself.
 * Unknown values fall back to `null` (no instruction), so a typo'd or future
 * parameter can never navigate a reader somewhere unexpected.
 *
 * ONE INSTRUCTION, TWO HALVES. `tab` decides which view mounts; `anchor` is an
 * element id to scroll to once that view is on screen (or `null` — most
 * destinations are the tab itself). The anchor ids live in the views
 * themselves (`today-mood` in TodayView's mood card, `tools-therapy` on the
 * toolbox drawer), so a renamed element fails a test here rather than silently
 * scrolling nowhere for readers.
 */
export type QuickTarget = {
  tab: TabId;
  /** Element id to scroll to after the tab mounts; `null` = no scroll. */
  anchor: string | null;
};

/**
 * THE VOCABULARY. Every key is a value a `?quick=` URL may carry; every value
 * says where the app must land. Kept in one table so the manifest's shortcuts,
 * the docs' URLs and the app's behaviour cannot drift without this object
 * changing — and `QUICK_VALUES` below is the exported face of that table for
 * tests and audits.
 */
const QUICK_TARGETS: Record<string, QuickTarget> = {
  /** The daily mood entry — the one the widget and the reminder promise. */
  mood: { tab: "today", anchor: "today-mood" },
  /** A new entry starts at the same card; the synonym iOS Shortcuts use. */
  entry: { tab: "today", anchor: "today-mood" },
  /** The tab itself, no scroll. */
  today: { tab: "today", anchor: null },
  /** Felfedezés → Terápia → légzés (the drawer the breathing exercise lives in). */
  breath: { tab: "tools", anchor: "tools-therapy" },
  /** Felfedezés → Terápia → meditáció (same drawer). */
  meditate: { tab: "tools", anchor: "tools-therapy" },
  tools: { tab: "tools", anchor: null },
  journal: { tab: "journal", anchor: null },
  insights: { tab: "insights", anchor: null },
  settings: { tab: "settings", anchor: null },
};

/** Every supported `?quick=` value, sorted — the pin tests assert against. */
export const QUICK_VALUES: readonly string[] = Object.keys(QUICK_TARGETS).sort();

/** Pure mapping: a raw parameter value → where it sends the reader. */
export function quickTargetFor(value: string | null | undefined): QuickTarget | null {
  if (!value) return null;
  return QUICK_TARGETS[value] ?? null;
}

/**
 * Read `?quick=` from the current URL as a raw value.
 *
 * Reads the URL itself rather than taking a string, because the callers run
 * during render and during mount effects — environments where there may be no
 * `window` at all (a server-side render), or a partial `window` some test file
 * left behind. The read goes through `location.href` inside a `try`, the exact
 * shape `cleanQuickParam` below and `cleanResetParam` in `lib/pwa` already use,
 * so a missing `window`, a location without an `href`, or a broken URL object
 * is read as "no instruction" instead of being thrown out of render. Guarding
 * HERE keeps that safety a property of the module rather than a thing every
 * caller must remember.
 */
function readQuickValue(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return new URL(window.location.href).searchParams.get("quick");
  } catch {
    return null;
  }
}

/** The full instruction behind the current URL: tab + anchor, or `null`. */
export function consumeQuickTarget(): QuickTarget | null {
  return quickTargetFor(readQuickValue());
}

/**
 * The tab half of the instruction, for `Shell`'s starting-tab initializer.
 * Returns `null` when there is no `window`, no parameter, or a value outside
 * the vocabulary — every path that means "no instruction, use the default tab".
 */
export function consumeQuickStart(): TabId | null {
  return consumeQuickTarget()?.tab ?? null;
}

/* --------------------- the in-app half of a deep link --------------------- */

type QuickListener = (target: QuickTarget) => void;

/**
 * LISTENERS FOR A DEEP LINK THAT ARRIVES WHILE THE APP IS ALREADY RUNNING.
 *
 * The mount-time read above covers a cold start. A tapped daily reminder is
 * the other case: the app is open (a `setTimeout` reminder can only fire while
 * it is), the reader taps the notification, and the app must jump to the Ma
 * tab WITHOUT reloading — a reload would throw away whatever half-written
 * entry was in component state. So the click publishes the instruction through
 * this tiny set instead, and `Shell` subscribes: `setTab` + scroll, no
 * navigation, no data loss.
 */
const quickListeners = new Set<QuickListener>();

/** Subscribe; returns the unsubscribe function (for a `useEffect` cleanup). */
export function subscribeQuickStart(listener: QuickListener): () => void {
  quickListeners.add(listener);
  return () => {
    quickListeners.delete(listener);
  };
}

/**
 * Publish an instruction from inside the running app — a notification click.
 * Returns whether the value was a known instruction (an unknown one notifies
 * nobody, the same "no instruction" rule the URL read follows). A listener
 * that throws cannot stop the rest: each call is isolated.
 */
export function emitQuickStart(value: string): boolean {
  const target = quickTargetFor(value);
  if (!target) return false;
  for (const listener of [...quickListeners]) {
    try {
      listener(target);
    } catch {
      /* one broken subscriber must not silence the others */
    }
  }
  return true;
}

/**
 * Scroll an anchor's element into view, after the tab that owns it has
 * mounted. Deferred to the next frame because the caller runs from a `useEffect`
 * (post-commit, pre- or at-paint) and the view may still be laying out.
 * Entirely cosmetic: every failure path is swallowed, because a deep link that
 * lands on the right tab with no scroll is still the right link.
 */
export function scrollToQuickAnchor(anchor: string | null | undefined): void {
  if (!anchor || typeof document === "undefined") return;
  try {
    const el = document.getElementById(anchor);
    if (!el) return;
    const run = () => {
      try {
        el.scrollIntoView?.({ behavior: "smooth", block: "start" });
      } catch {
        /* cosmetic */
      }
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
    else run();
  } catch {
    /* cosmetic */
  }
}

/** Take `?quick=` back out of the address bar, keeping everything else. */
export function cleanQuickParam(): void {
  try {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("quick")) return;
    url.searchParams.delete("quick");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    /* A browser that refuses history still shows the app; the param is cosmetic. */
  }
}
