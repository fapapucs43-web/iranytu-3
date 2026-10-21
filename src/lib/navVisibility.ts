import { NAV_ICONS } from "./nav-icons";
import type { TabId } from "../types";

/**
 * Should the bottom navigation be on screen? (Batch 7d)
 *
 * PURE — no React, no DOM, no `window`, no timers. The whole behaviour of the
 * auto-hiding nav is one pure function over five values, so every rule below is
 * reachable from a test without a browser, a fake scroller, or a timer. The
 * hook in `components/useAutoHideNav.ts` is the only thing that knows where
 * scroll events come from, and it does nothing but call this.
 *
 * Batch 11 commit 2 adds the tabs' ORDER to the same module — the other
 * decision about the bar that is one pure function over a stored value. The
 * import of the registry is type-free of React and keeps the file testable in
 * Bun without a DOM.
 *
 * WHY IT IS A SEPARATE MODULE AND NOT A HOOK
 * Scroll behaviour is the most bug-prone code in an app: it fires constantly,
 * it fires off a threshold, and it carries a state machine — the last position
 * a decision was made at — that is easy to get subtly wrong. None of that
 * difficulty is about React, and testing it through a component means fake
 * timers, a fake window and a rerender per event. Kept pure, the interesting
 * cases are a table of literals.
 *
 * WHY ONE FUNCTION THAT RETURNS BOTH ANSWERS
 * The caller needs two things after a scroll: whether the bar is hidden, and
 * what to compare the next scroll against. Those two are not independent, and
 * deciding them separately is how a scroll handler ends up with the threshold
 * quietly measuring the wrong distance.
 *
 * The tempting alternative is to update the remembered position on every
 * event. That is wrong, and the failure is invisible: a touchpad or a phone
 * that emits a three-pixel delta per event never accumulates to the threshold
 * in any single event, so the bar would never hide for a slow, deliberate
 * reader — the exact person it is for. Rebasing only on a decision makes the
 * threshold measure "distance travelled since we last acted", which ignores
 * one-pixel jitter and still fires for a slow scroller a moment later.
 */

/** Pixels of movement, since the last decision, before a scroll counts. */
export const NAV_SCROLL_THRESHOLD = 8;

/**
 * Where the bottom navigation stops being a bottom bar.
 *
 * Above this width the nav is a sticky bar at the TOP of the document (see the
 * Desktop block in `styles.css`), and hiding it would take the primary
 * navigation away from someone who is reading. The feature therefore only
 * exists below this width, and the stylesheet scopes the hidden state to the
 * same boundary. The number lives here so a test can hold the two together: a
 * CSS `max-width` that drifted to or above the desktop `min-width` would hide
 * the desktop bar, and nothing else would notice.
 */
export const NAV_DESKTOP_BREAKPOINT_PX = 760;

export type NavVisibility = "visible" | "hidden";

export type NavDecisionInput = {
  /** The user's setting. False for everyone who has never opened Settings. */
  enabled: boolean;
  /** `prefers-reduced-motion: reduce`, read live rather than once at mount. */
  reducedMotion: boolean;
  /** Current scroll offset, in px. May be negative during iOS rubber-banding. */
  y: number;
  /** The offset at the previous DECISION, in px. Not the previous event. */
  lastY: number;
  /** What the nav is doing right now, so "no change" is expressible. */
  hidden: boolean;
  /** Overridable so a test can prove the threshold is load-bearing. */
  threshold?: number;
};

export type NavDecision = {
  /** The visibility to render. */
  hidden: boolean;
  /**
   * The position to compare the next scroll against.
   *
   * Advanced only when this call actually consumed the delta. A call that hit
   * the threshold rule returns `lastY` unchanged, which is what makes movement
   * accumulate instead of being measured per event.
   */
  lastY: number;
};

/**
 * WHY REDUCED MOTION MEANS "NEVER HIDE", NOT "HIDE WITHOUT ANIMATION"
 *
 * The stylesheet already has a blanket
 * `@media (prefers-reduced-motion: reduce)` that collapses every transition in
 * the app to 0.01ms. Taken alone that would be enough to make the animation
 * respect the preference: the bar would snap rather than slide.
 *
 * It is not enough, because the motion is not the whole feature — the feature
 * is the bar being *absent*. For someone reading a long journal entry, a
 * navigation that is sometimes simply not there is a layout that changes under
 * them, and the snapping version is the more startling of the two: content
 * that used to sit above the bar now runs to the bottom edge, and where the
 * controls went is not explained anywhere. A slide at least shows the bar
 * leaving.
 *
 * Someone who has asked their operating system for less motion is asking not
 * to be surprised by moving parts. So the whole behaviour is switched off, not
 * just its easing, and the nav does what it has always done. The setting can
 * still be on; it simply has no effect while the preference is set. That is
 * reversible at any time and needs no migration, because nothing is stored.
 */
export function decideNav(input: NavDecisionInput): NavDecision {
  const { enabled, reducedMotion, y, lastY, hidden } = input;
  const threshold = input.threshold ?? NAV_SCROLL_THRESHOLD;

  // 1. Off by default, and off means visible whatever the scroll position is.
  //    This has to come first: turning the setting off mid-scroll must take
  //    effect at once, not on the next gesture.
  if (!enabled) return { hidden: false, lastY: y };

  // 2. Reduced motion switches the feature off, not just its animation.
  if (reducedMotion) return { hidden: false, lastY: y };

  // 3. The top of the document is always a way back. A navigation that stays
  //    hidden when the reader has scrolled to the start is a trap: the way out
  //    is to scroll, and scrolling is what hid it. `y` can be negative while a
  //    touch screen is overscrolled, which is why this is `<=` and not `===`.
  if (y <= threshold) return { hidden: false, lastY: y };

  // 4. Not yet a deliberate movement. Hold, and DO NOT advance lastY — this
  //    is the line that makes slow scrolling accumulate.
  if (Math.abs(y - lastY) < threshold) return { hidden, lastY };

  // 5. The feature. Down hides, up brings it back.
  return { hidden: y > lastY, lastY: y };
}

/**
 * The class list for the bottom navigation.
 *
 * Pure, and therefore testable for BOTH states — which the component is not.
 * `renderToStaticMarkup` does not run effects, so a static render of the bar
 * can only ever show the visible state; a hook-driven class would leave the
 * hidden state asserted by nobody, which is precisely how a renamed class
 * would ship as a bar that never moves.
 */
export function bottomNavClass(hidden: boolean): string {
  return hidden ? "bottom-nav bottom-nav-hidden" : "bottom-nav";
}

/* ---------------------------------------------------------------------- */
/* Batch 11, commit 2 — the tabs' order                                     */
/* ---------------------------------------------------------------------- */

/**
 * The tabs in display order: the user's arrangement, or the default.
 *
 * PURE, TOTAL, NEVER THROWS — same contract as `decideNav`. The stored
 * `settings.tabOrder` is user-shaped data (it crossed a JSON boundary and may
 * have been hand-edited), so every rule here exists to answer one question:
 * what does a bar with FOUR slots draw when the blob says anything else?
 *
 *  - absent / not an array        → the registry's default, untouched;
 *  - unknown ids ("toolbox")      → dropped: there is no such tab to draw;
 *  - duplicates                   → collapsed to the first occurrence;
 *  - missing ids                  → appended at the end, in default order.
 *
 * The output is therefore ALWAYS a permutation of the four tabs — never a
 * shorter bar, never a repeated button. (The same normalisation philosophy
 * `enabledTrackers` follows, kept in a nav-adjacent module rather than a new
 * `tabOrder.ts` file: this module already owns the bar's other decisions.)
 *
 * The rows come from `NAV_ICONS` (the registry), not a local literal, so a
 * future fifth tab appears in the default order with no edit here — and a
 * test pins this function against `NAV_ICONS` to keep that true.
 */
export function orderedTabs(order: readonly unknown[] | undefined | null): TabId[] {
  const defaults = NAV_ICONS.map((n) => n.tab);
  if (!Array.isArray(order)) return [...defaults];

  const seen = new Set<TabId>();
  const known: TabId[] = [];
  for (const raw of order) {
    const tab = defaults.find((t) => t === raw);
    if (tab && !seen.has(tab)) {
      seen.add(tab);
      known.push(tab);
    }
  }
  for (const t of defaults) if (!seen.has(t)) known.push(t);
  return known;
}
