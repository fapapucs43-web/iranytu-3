/**
 * The scroll listener behind the auto-hiding navigation (Batch 7d).
 *
 * This is the DOM half of the feature and `lib/navVisibility` is the pure half.
 * The split mirrors the one the repository already draws for typefaces —
 * `fonts.ts` decides, `fonts-runtime.ts` touches the browser — and it exists
 * for the same reason: the decision is worth testing exhaustively, and the
 * wiring is worth testing exactly once, against a fake window, instead of
 * through a component and a fake timer.
 *
 * Everything a test needs to observe is here and none of it needs React: what
 * gets attached, what gets called, and what the answer is afterwards.
 */
import { decideNav } from "./navVisibility";

/**
 * The slice of `window` this module uses. Narrow on purpose: it makes a fake
 * two lines long, and it means this file cannot grow an accidental dependency
 * on something else global.
 */
export type ScrollTarget = {
  scrollY: number;
  addEventListener: (
    type: "scroll",
    handler: () => void,
    options?: { passive?: boolean },
  ) => void;
  removeEventListener: (type: "scroll", handler: () => void) => void;
};

export type AutoHideOptions = {
  /** The user's setting. When false, nothing is attached. */
  enabled: boolean;
  /** `prefers-reduced-motion: reduce`, read live. */
  reducedMotion: boolean;
  /** Called only when the answer changes. */
  onChange: (hidden: boolean) => void;
};

export type AutoHide = {
  /** Begin listening. Safe to call when already started. */
  start: () => void;
  /** Stop listening and forget the remembered position. */
  stop: () => void;
  /** Run one scroll decision. Exposed so a test can drive it directly. */
  scroll: () => void;
  /** Whether a scroll listener is currently attached. */
  readonly attached: boolean;
};

export function createAutoHide(win: ScrollTarget, options: AutoHideOptions): AutoHide {
  // Where the last decision was made, and what it was. Not component state:
  // this changes on every pixel of a gesture, and nothing renders from it
  // directly — the React wrapper is a separate file for that reason.
  let lastY = win.scrollY;
  let hidden = false;
  let attached = false;

  const publish = (next: boolean) => {
    // Only on a change. `onChange` is a setState in the React wrapper, and
    // calling it unconditionally on every scroll event would be a render
    // sixty times a second even where React would bail out of the work.
    if (next === hidden) return;
    hidden = next;
    options.onChange(next);
  };

  const reset = () => {
    lastY = win.scrollY;
    // Turning the setting off — or reduced motion arriving — must take effect
    // NOW, not on the next scroll. Otherwise someone who switches it off while
    // the bar is hidden would be looking at a missing navigation, and no amount
    // of scrolling would bring it back until the next gesture.
    publish(false);
  };

  const onScroll = () => {
    const y = win.scrollY;
    const decision = decideNav({
      enabled: true,
      reducedMotion: options.reducedMotion,
      y,
      lastY,
      hidden,
    });
    lastY = decision.lastY;
    publish(decision.hidden);
  };

  return {
    start() {
      reset();
      if (attached) return;
      // Off means off, and so does reduced motion. No listener, no handler, no
      // per-frame work — a stronger promise than "the bar stays visible",
      // because with nothing attached the feature cannot cost a frame or fire
      // after being switched off.
      //
      // Reduced motion is checked here as well as in `decideNav` on purpose.
      // The decision function still has to answer correctly, because it is the
      // documented contract and it is what the tests hold; but a listener that
      // can only ever return "visible" is work for nothing, and leaving one
      // attached would mean the feature costs frames on exactly the devices
      // that asked for it to cost less.
      if (!options.enabled || options.reducedMotion) return;
      // Passive: this handler never calls preventDefault, and saying so lets
      // the browser keep scrolling on the compositor thread.
      win.addEventListener("scroll", onScroll, { passive: true });
      attached = true;
    },
    stop() {
      if (attached) {
        win.removeEventListener("scroll", onScroll);
        attached = false;
      }
      lastY = win.scrollY;
    },
    scroll: onScroll,
    get attached() {
      return attached;
    },
  };
}
