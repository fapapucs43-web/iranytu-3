/**
 * The one place in this app that talks to `window.matchMedia`.
 *
 * WHY THIS FILE EXISTS
 * Two features read a media query and stay subscribed to it: the „Auto
 * (rendszer)" theme, which has to repaint when the operating system's
 * light/dark preference changes while the app is open, and the auto-hiding
 * navigation, which has to stop moving things the moment the user turns
 * reduced motion on. Both had the same two lines, and both lines were this:
 *
 *   mq.addEventListener?.("change", onChange);
 *
 * which is a silent no-op on any browser that only has the older
 * `addListener`/`removeListener` pair — Safari 13 and iOS 13, which is exactly
 * the population most likely to want reduced motion honoured and is still
 * alive in the field. `useAutoHideNav` even carried a comment claiming the
 * legacy spelling was handled; it was not, and nothing tested it either, so the
 * claim and the code disagreed quietly for four batches.
 *
 * So the two lines became a module, which is the only way to get them tested:
 * `ThemeContext`'s subscription lives inside a `useEffect`, and this suite has
 * no jsdom and runs no effects, so a test that wanted to prove "the theme
 * follows the OS" had nothing it could drive. Here the same behaviour is a
 * function that takes a fake window, exactly like `lib/navAutoHide`'s
 * `createAutoHide(win, options)`.
 *
 * WHAT IT GUARANTEES
 *  - the current answer is delivered once on subscribe, so a caller never has
 *    to read the value separately to avoid acting on a stale one;
 *  - the modern API is used when it exists and the legacy one when it does not,
 *    and the unsubscribe calls whichever pair was used to subscribe;
 *  - a browser with no `matchMedia` at all gets `false` and a no-op
 *    unsubscribe, never a throw — a theme is not worth a blank app.
 *
 * The query strings are exported rather than written at each call site, because
 * `resolveTheme` and the subscription that keeps it live have to ask the
 * browser the SAME question. Two copies of `(prefers-color-scheme: dark)` that
 * drift apart produce an auto theme that follows nothing, silently.
 */

/** The OS light/dark preference. Used by the theme, in two places that must agree. */
export const PREFERS_DARK = "(prefers-color-scheme: dark)";

/** The OS reduced-motion preference. Used by the auto-hiding navigation. */
export const PREFERS_REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/**
 * The slice of `MediaQueryList` this module uses.
 *
 * Deliberately not the DOM's `MediaQueryList`: a test has to be able to hand in
 * an object that has ONLY the legacy pair, which the real type does not allow
 * you to express.
 */
export type MediaQueryLike = {
  matches: boolean;
  addEventListener?: (type: "change", listener: () => void) => void;
  removeEventListener?: (type: "change", listener: () => void) => void;
  /** Safari ≤ 13, iOS ≤ 13. Deprecated, and the only spelling they have. */
  addListener?: (listener: () => void) => void;
  removeListener?: (listener: () => void) => void;
};

/** The slice of `window` this module uses, so a fake is two lines long. */
export type MediaWindow = {
  matchMedia?: (query: string) => MediaQueryLike;
};

function defaultWindow(): MediaWindow | undefined {
  return typeof window === "undefined" ? undefined : (window as unknown as MediaWindow);
}

/** The live query object, or null when this browser cannot answer the question. */
export function mediaQueryOf(query: string, win: MediaWindow | undefined = defaultWindow()): MediaQueryLike | null {
  if (!win || typeof win.matchMedia !== "function") return null;
  try {
    return win.matchMedia(query) ?? null;
  } catch {
    // A `matchMedia` that throws is a browser we do not understand. Answering
    // "no preference" is the same as not having one.
    return null;
  }
}

/** True when the query currently matches, or false when the browser cannot say. */
export function matchesMediaQuery(query: string, win?: MediaWindow): boolean {
  return mediaQueryOf(query, win)?.matches === true;
}

/**
 * Subscribe to a query until the returned function is called.
 *
 * The handler is called once immediately with the current answer, and then on
 * every change. Passing the value rather than the event keeps the handler from
 * having to reach back for the query object, which is what let the two call
 * sites drift apart in the first place.
 */
export function subscribeToMediaQuery(
  query: string,
  onChange: (matches: boolean) => void,
  win?: MediaWindow,
): () => void {
  const mq = mediaQueryOf(query, win);
  if (!mq) {
    onChange(false);
    return () => {};
  }
  const handler = () => onChange(mq.matches);
  handler();
  if (typeof mq.addEventListener === "function") {
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }
  if (typeof mq.addListener === "function") {
    mq.addListener(handler);
    return () => mq.removeListener?.(handler);
  }
  // A query object that cannot be subscribed to. The value was just delivered,
  // so the caller is correct right now and will not hear about a later change.
  return () => {};
}
