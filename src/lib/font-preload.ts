/**
 * Background font warming (Batch 7f).
 *
 * THE COMPLAINT
 * "Something still downloads." Measured, the honest answer was: picking a
 * typeface fetches 43–133 kB of woff2, every time, for a user who has never
 * chosen that typeface before. Everything else in the app is already free — the
 * icon artwork is inlined, so choosing a set costs nothing — and the fonts were
 * the last thing still making a selection wait.
 *
 * THREE WAYS TO FIX IT, AND WHY THIS ONE
 * A) Inline every family as a base64 data URI in the bundle. Measured: base64
 *    inside a brotli bundle costs 1.00x the raw woff2, because base64 of
 *    already-compressed bytes does not compress. So inlining all nine families
 *    moves 681 kB out of a separate request and into the main bundle, which
 *    then has to be parsed on every single load, for a user who will pick one.
 *    A user choosing one serif would download eight sans. It makes the common
 *    case worse to improve the rare one.
 * B) Preload in the background after load. Zero cost to the first paint, the
 *    bytes land in the HTTP cache and in the service worker's `/fonts/` rule,
 *    and a pick is instant because the file is already there. This module.
 * C) Subset the families to Latin plus the Hungarian alphabet, which would take
 *    681 kB down to 290 kB. That is the real fix and it is deliberately NOT
 *    here: it needs a subsetting step in the vendor script, which means a
 *    Python toolchain on a developer's machine. It is a separate batch.
 *
 * WHY A LIST AND NOT "EVERYTHING"
 * Warming all nine would be 681 kB of background traffic for a user who never
 * opens the picker. `PRELOAD_FONT_IDS` holds Inter — already in flight on the
 * first load, so warming it a moment later closes the window where a fast pick
 * outruns it — and the five families this batch added, which are the whole
 * reason a user opens the picker. Montserrat, Roboto and Dancing Script keep
 * the path they have always had: point at the row and the family loads.
 *
 * WHY IT IS TWO FILES' WORTH OF CODE AND NOT A LOOP
 * The decision and the scheduling are separated for the same reason 7d split
 * `navVisibility` from `navAutoHide`: the decision is a pure function over data
 * and can be tested exhaustively, while the scheduling is the part that talks to
 * a browser and is therefore the part worth keeping small. Nothing here is
 * exported that a caller does not need, and nothing here fetches anything —
 * `onWarm` is the caller's to define, so this module has no network code in it
 * at all and cannot grow any.
 */

/** The slice of `navigator.connection` this module reads. */
export type ConnectionLike = {
  saveData?: boolean;
  effectiveType?: string;
} | null | undefined;

/** Why the preload is on or off, for a test and for a log line. */
export type PreloadDecision = {
  /** The families to warm, in order. Empty when the decision is to wait. */
  warm: readonly string[];
  /** Why, or null when it is simply going ahead. */
  skipped: "save-data" | "slow-connection" | null;
};

/**
 * Whether to warm at all, given what the connection says.
 *
 * The one judgement in this module, and it is deliberately permissive in the
 * direction of warming. A browser with no Network Information — every Firefox
 * and Safari — reports nothing, and refusing to preload there would mean the
 * users on the slowest connections are the only ones who ever wait for a font.
 * So "we do not know" means yes. Only two explicit signals stop it: the user
 * asked us to save data, or the link is 2G.
 */
export function decidePreload(
  connection: ConnectionLike,
  ids: readonly string[],
): PreloadDecision {
  if (!connection) return { warm: ids, skipped: null };
  if (connection.saveData === true) return { warm: [], skipped: "save-data" };
  if (connection.effectiveType === "2g" || connection.effectiveType === "slow-2g") {
    return { warm: [], skipped: "slow-connection" };
  }
  return { warm: ids, skipped: null };
}

/** The part of `window` the warmer uses. Both members have a real fallback. */
export type IdleWindow = {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
  setTimeout: (cb: () => void, ms: number) => number;
};

export type IdleWarmer = {
  /** Begin. Idempotent — a second call does nothing. */
  start: () => void;
  /** Stop asking for idle slots. Anything not yet reached is simply not warmed. */
  cancel: () => void;
};

/**
 * One family per idle slot.
 *
 * NOT a loop inside one callback. Six families in one idle slot means six
 * requests issued at the same moment on a connection that was by definition
 * busy enough for the browser to call it idle — which is precisely the moment a
 * user is most likely to be scrolling, tapping, or typing a note. One at a time
 * means the browser can interleave them with real work, and a cancel takes
 * effect between families rather than after all six.
 *
 * The timeout is a backstop, not a schedule: without one, a browser that never
 * reports idle — a background tab, a busy main thread — would defer the preload
 * indefinitely, and a user who opens Settings in the first second would wait for
 * exactly the families this module exists to have ready. Four seconds is long
 * enough to stay out of the way and short enough to still be useful.
 */
export function createIdleWarmer(
  win: IdleWindow,
  { ids, onWarm }: { ids: readonly string[]; onWarm: (id: string) => void },
): IdleWarmer {
  const TIMEOUT_MS = 4000;
  let next = 0;
  let running = false;
  let handle: number | null = null;

  const schedule = () => {
    if (win.requestIdleCallback) {
      handle = win.requestIdleCallback(run, { timeout: TIMEOUT_MS });
    } else {
      // Safari has no requestIdleCallback. A timeout is not the same thing — it
      // does not know whether the main thread is busy — but "eventually, when
      // the browser next has room" is close enough, and the alternative is no
      // preload at all on those browsers.
      handle = win.setTimeout(run, 250);
    }
  };

  function run() {
    if (!running) return;
    if (next >= ids.length) return;
    const id = ids[next]!;
    next += 1;
    onWarm(id);
    // Ask for the next slot only after this one has done its work, so a cancel
    // between families is honoured.
    if (next < ids.length) schedule();
  }

  return {
    start() {
      if (running || ids.length === 0) return;
      running = true;
      schedule();
    },
    cancel() {
      running = false;
      if (handle === null) return;
      if (win.cancelIdleCallback) win.cancelIdleCallback(handle);
      else win.setTimeout(() => {}, 0);
      handle = null;
    },
  };
}
