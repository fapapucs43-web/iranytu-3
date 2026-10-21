/**
 * Auto-hiding bottom navigation (Batch 7d) — the React half.
 *
 * Ten lines of glue over `lib/navAutoHide`, which is where the listener, the
 * remembered position and every rule actually live. The split is not ceremony:
 * the controller can be tested against a two-line fake window, and this file
 * cannot be, because `renderToStaticMarkup` does not run effects and a
 * scroll test that needs a real DOM is a scroll test nobody runs.
 *
 * The one thing that belongs here and nowhere else is the reduced-motion
 * preference, because it is a live subscription rather than a value: a user can
 * change it in their operating system while the app is open, and the honest
 * behaviour is to stop moving things immediately rather than at next launch.
 */
import { useEffect, useState } from "react";
import { createAutoHide } from "../lib/navAutoHide";
import { PREFERS_REDUCED_MOTION, matchesMediaQuery, subscribeToMediaQuery } from "../lib/media";

/** True when the OS asks for reduced motion. Safe on a server and in Bun. */
export function prefersReducedMotion(): boolean {
  return matchesMediaQuery(PREFERS_REDUCED_MOTION);
}

/**
 * @param enabled the user's setting; false attaches no listener at all.
 * @returns whether the nav should currently be hidden.
 */
export function useAutoHideNav(enabled: boolean): boolean {
  const [hidden, setHidden] = useState(false);
  // Lazy initialiser: React calls this once, on mount.
  const [reduced, setReduced] = useState(prefersReducedMotion);

  // Track the preference whether or not the feature is on, so switching it on
  // mid-session starts from the right answer instead of a stale `false`.
  // `lib/media` owns the subscription because the older `addListener` spelling
  // is the only one Safari 13 and iOS 13 have, and a direct
  // `mq.addEventListener?.("change", …)` here was a silent no-op on exactly the
  // devices that ask for reduced motion most.
  useEffect(() => subscribeToMediaQuery(PREFERS_REDUCED_MOTION, setReduced), []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const controller = createAutoHide(window, {
      enabled,
      reducedMotion: reduced,
      onChange: setHidden,
    });
    controller.start();
    return () => controller.stop();
  }, [enabled, reduced]);

  return hidden;
}
