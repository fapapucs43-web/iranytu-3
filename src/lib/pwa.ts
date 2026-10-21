/**
 * PWA install + service-worker registration (Batch 2, P9).
 *
 * GUARDRAILS (user-approved):
 * - The service worker registers ONLY in production builds
 *   (`import.meta.env.PROD`) so local dev/HMR is never intercepted.
 * - The registration URL carries the containing bundle's content hash as the
 *   version (`/sw.js?v=<hash>`); sw.js names its cache after it, so every new
 *   deploy gets a fresh cache and old ones are deleted on activate.
 * - A deploy must REACH the reader: the worker script is never satisfied from
 *   the HTTP cache, every open asks for an update check, and a worker that
 *   takes over an open page rebuilds it once the reader is not looking. Those
 *   three are one mechanism and `registerPwa` says why each is load-bearing —
 *   the reported failure was a deployed app the browser kept serving the old
 *   copy of, and a versioned cache name alone cannot fix that, because a
 *   versioned cache is only consulted by a worker the browser has already
 *   replaced.
 */
import { useEffect, useState, useSyncExternalStore } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

function onBeforeInstallPrompt(e: Event) {
  e.preventDefault();
  deferredPrompt = e as BeforeInstallPromptEvent;
  emit();
}

/**
 * Content hash of the bundle this module ships in (Vite names chunks
 * `name-<8-char-hash>.js`). Used as the SW cache version so a cache is tied
 * to one build. Falls back to a static tag if the pattern ever changes.
 *
 * EXPORTED because a second question needs the same answer: whether the worker
 * IN CHARGE of this page came from this build (see `controllerIsStale`). Asking
 * that with a different version string would be a second answer to one question,
 * and the two would drift apart the day the registration URL changes.
 */
export function bundleVersion(): string {
  try {
    const m = import.meta.url.match(/-([A-Za-z0-9_-]{8})\.js(?:$|\?)/);
    if (m?.[1]) return m[1];
  } catch {
    /* noop */
  }
  return "stable";
}

/**
 * True once this page has asked to be moved onto a newer worker.
 *
 * Module-level rather than local to the listener, because `controllerchange`
 * can fire more than once while one page is open: a flag that came back with
 * the handler would turn a deploy into a reload loop, which is a worse failure
 * than the stale copy it was fixing.
 */
let reloadedForUpdate = false;

/**
 * THE REQUEST A FORCED RESET LEAVES BEHIND, for the load that follows it.
 *
 * A marker rather than a preference: it says "the document being built right
 * now was fetched after every cache was cleared and every worker was dropped",
 * which is the one fact the next load needs and cannot otherwise know. Stored
 * under the app's own prefix so the wipe (Settings → all data) takes it with
 * everything else.
 */
export const FORCE_RESET_KEY = "belso-iranytu-force-reset";

/**
 * The marker's OLD name, still read and still in the wipe list.
 *
 * The button wrote this key before the reset grew its query-string navigation.
 * A reader who pressed that older button and then closed the tab mid-reload has
 * it set with nothing to consume it — and a marker nobody reads is a marker
 * nobody removes. Both names are consumed, and the registry in
 * `lib/storageKeys` keeps both in the wipe.
 */
const LEGACY_RESET_KEY = "belso-iranytu-update-requested";

/** Whether this load is the one a forced reset asked for, and forget it. */
export function consumeForceReset(): boolean {
  try {
    const asked =
      localStorage.getItem(FORCE_RESET_KEY) !== null ||
      localStorage.getItem(LEGACY_RESET_KEY) !== null;
    if (asked) {
      localStorage.removeItem(FORCE_RESET_KEY);
      localStorage.removeItem(LEGACY_RESET_KEY);
    }
    return asked;
  } catch {
    return false;
  }
}

/**
 * THE URL A RESET NAVIGATES TO — the step that makes it work at all.
 *
 * `location.reload()` re-requests the SAME url, and everything that can answer
 * it wrongly gets another chance: the worker's precache is keyed by request, the
 * browser's HTTP cache is keyed by url, and a stored `index.html` from a deploy
 * that shipped before the `max-age=0` header was in place is *fresh* under its
 * own old policy — a header cannot retroactively expire an entry the browser
 * already stored. A url with a stamp in it has never been requested by anyone:
 * no cache has it, no precache listed it, no HTTP entry exists for it, so the
 * navigation can only be answered by the network. That is the whole trick, and
 * it is why this is a `replace` and not a `reload`.
 *
 * `location.replace` rather than `assign`, so the stuck url does not stay in
 * history: pressing Back after a reset must not put the reader back on the
 * broken page. The pathname keeps the app at the same route (this app has one),
 * and the stamp is dropped again by `cleanResetParam` as soon as the fresh
 * document is up.
 */
export function resetUrl(pathname: string, stamp: number): string {
  const path = pathname && pathname.startsWith("/") ? pathname : "/";
  return `${path}?nocache=${stamp}`;
}

/**
 * Take the reset's stamp back out of the address bar.
 *
 * The stamp is a one-shot key, not a route: left in place it would be copied
 * into a bookmark, pasted into a message, and — worst — used as the url the
 * reader returns to, where every visitor would request a fresh url and lose
 * their HTTP cache for nothing. `replaceState` keeps the reader on the page they
 * are already looking at, so nothing re-requests anything.
 */
export function cleanResetParam(): void {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("nocache")) return;
    url.searchParams.delete("nocache");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    /* A browser that refuses history still shows the app; the stamp is cosmetic. */
  }
}

/**
 * THE READER'S OWN LEVER — the update that cannot be stuck.
 *
 * WHY THIS EXISTS AT ALL, given everything the automatic path already does.
 * `registerPwa` covers the three honest ways a deploy goes unnoticed: the
 * worker script is taken out of the HTTP cache (`updateViaCache: "none"`), an
 * update check is asked for on every open (`registration.update()`), and a
 * worker that takes over an open page rebuilds that page once the reader is not
 * looking. What it cannot cover is a worker that never finishes installing — an
 * interrupted download, a flaky network during the precache `addAll`, a browser
 * holding an old controller — and in that state there is no lever in the reader's
 * hands at all. Every automatic mechanism is a request the browser may decline;
 * this is the one that says "drop everything and fetch it again".
 *
 * THE SIX STEPS, in this order, and why each is load-bearing:
 *
 *  1. `getRegistrations()` + unregister, FIRST. A worker that is stuck
 *     mid-install is not replaced by asking it again — it is replaced by ceasing
 *     to exist. Doing this before the caches matters because the registration is
 *     the thing that can put the caches back: a live worker re-populates its
 *     precache on the next install, and an unhandled rejection in the cache
 *     sweep must not be able to leave the worker in charge.
 *  2. `caches.keys()` + delete every one. The precache holds the OLD asset urls
 *     under the old cache name, and a stale `index.html` inside a cache can still
 *     answer a navigation that arrives while the worker is not (the offline
 *     branch reads it back by name).
 *  3. `sessionStorage.clear()`. The session-scoped state the app keeps — the
 *     install banner's dismissal — describes a session that is over.
 *  4. The marker, so the document that comes up knows it is the one this reset
 *     produced (and so the update check below can stand down).
 *  5. `location.replace(resetUrl(...))` — a url nobody has ever requested, which
 *     is the only form of navigation that no cache can answer from storage. See
 *     `resetUrl`: this step, not the clearing, is what fixes the reported case.
 *  6. The controller check, ANSWERED TO THE CALLER: if a worker is still in
 *     charge after all of that, the reader is told to close every tab — the one
 *     thing a page cannot do for them.
 *
 * EVERY STEP IS OPTIONAL AND NONE IS FATAL. A browser with no `caches`, no
 * service worker, or a storage that throws still gets to the navigation: the
 * point of the button is that it always works, and a lever that can fail because
 * one engine lacks one API would be the same trap in a new place.
 *
 * THE RETURN VALUE IS THE ANSWER TO STEP 6, read BEFORE the navigation is asked
 * for — after it the page may be gone, and an answer produced after a page is
 * unloaded is not an answer. `true` means "a worker was still in charge when the
 * reset ran", which is the only thing this code can honestly report about the
 * stuck case.
 */
export async function forceAppUpdate(): Promise<boolean> {
  // 1. The registrations, first.
  try {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) await registration.unregister();
    }
  } catch {
    /* A registration that refuses to go cannot hold the navigation. */
  }
  // 2. Every cache, whatever it is named.
  try {
    if (typeof caches !== "undefined") {
      const names = await caches.keys();
      for (const name of names) await caches.delete(name);
    }
  } catch {
    /* The navigation below is still the fix the reader asked for. */
  }
  // 3. The session's own leftovers.
  try {
    sessionStorage.clear();
  } catch {
    /* No session storage, or none allowed: nothing to clear. */
  }
  // 4. The marker for the load that is about to start.
  try {
    localStorage.setItem(FORCE_RESET_KEY, "1");
  } catch {
    /* A browser that refuses storage still gets the navigation. */
  }
  // 5. The controller, read before the page can go away (step 6's answer).
  const stillControlled = controllerIsStale(
    typeof navigator !== "undefined" && "serviceWorker" in navigator
      ? navigator.serviceWorker.controller?.scriptURL
      : null,
    // An empty version would make every controller "stale" — this flag is about
    // whether a worker is in charge at all, so `bundleVersion()` is only asked
    // to make the comparison meaningful, not to fail the reset.
    bundleVersion(),
  );
  // 6. The navigation, to a url no cache has ever seen.
  try {
    window.location.replace(resetUrl(window.location.pathname, Date.now()));
  } catch {
    window.location.reload();
  }
  return stillControlled;
}

/**
 * WHETHER THE WORKER IN CHARGE CAME FROM THIS BUILD — the stuck-worker detector.
 *
 * The registration url carries the bundle's content hash (`/sw.js?v=<hash>`), and
 * a `ServiceWorker` exposes the url it was registered with as `scriptURL`. So the
 * comparison is direct and needs no state of its own: a controller whose url does
 * not mention the version THIS document was built with is a controller from some
 * other build — the definition of a stuck worker, and the one case where a
 * correct deploy still shows the reader the old app.
 *
 * Deliberately conservative about the unknown: no controller at all means nothing
 * is in charge (a first visit, or a browser without workers) and answers `false`,
 * and an empty version answers `false` rather than calling every worker stale.
 * The alternative — guessing "stale" — would put a warning banner in front of
 * readers whose install is perfectly current, which is how a warning becomes
 * noise nobody reads.
 */
export function controllerIsStale(
  scriptURL: string | null | undefined,
  version: string,
): boolean {
  if (!scriptURL || !version) return false;
  return !scriptURL.includes(version);
}

/** The detector, against the worker this page actually got. */
export function staleController(): boolean {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return false;
  return controllerIsStale(navigator.serviceWorker.controller?.scriptURL, bundleVersion());
}

/**
 * Put the reader on the deployed bundle — without yanking the page out from
 * under their hands.
 *
 * WHY A RELOAD IS NEEDED AT ALL. `sw.js` calls `skipWaiting()` and
 * `clients.claim()`, so a new worker does take over an OPEN page. Nothing
 * re-runs that page's JavaScript, though: the reader keeps typing into a
 * document built by the previous bundle, and the swap they were supposed to get
 * is invisible until they happen to reload. That is the report this closes — a
 * deployed app a browser kept serving the old copy of.
 *
 * WHY "WHEN HIDDEN" RATHER THAN IMMEDIATELY. Deferring to the next time the
 * reader leaves the tab is what keeps the fix from costing them anything: no
 * screen changes mid-sentence, the swap is already paid for (the new bundle is
 * precached by the time the worker claims the page, so the reload is a cache
 * hit), and they meet the deployed app the moment they come back. A page that
 * is ALREADY hidden — a background tab, an installed app the reader swiped away
 * from — reloads at once, because there is nobody there to interrupt.
 */
function applyUpdateWhenHidden(): void {
  if (reloadedForUpdate) return;
  reloadedForUpdate = true;
  const reload = () => window.location.reload();
  if (document.visibilityState === "hidden") {
    reload();
    return;
  }
  const onHidden = () => {
    if (document.visibilityState !== "hidden") return;
    document.removeEventListener("visibilitychange", onHidden);
    reload();
  };
  document.addEventListener("visibilitychange", onHidden);
}

/**
 * Ask the worker that is WAITING to take over now.
 *
 * THE STUCK CASE, as a sentence. A browser keeps at most one worker active and
 * parks every other installed version in `waiting` until no client of the old
 * one is left — and "left" means every tab closed, which a reader with one tab
 * open never does. So the new worker installs, sits in `waiting`, and the old one
 * keeps answering: the deploy is on the disk and not on the screen. `skipWaiting`
 * is the worker's own escape hatch and this is the message that pulls it (see the
 * `message` listener in `public/sw.js`), because only the page knows the reader is
 * looking at a stale app.
 *
 * The page asks in two places because the waiting worker can predate this page:
 * at registration time (the previous visit left it waiting) and on `updatefound`
 * once a newly installed worker reaches `installed` with a controller already in
 * place, which is the definition of `waiting`.
 */
function askWaitingToSkip(registration: ServiceWorkerRegistration): void {
  skipRequested = true;
  registration.waiting?.postMessage({ type: "SKIP_WAITING" });
  registration.addEventListener("updatefound", () => {
    const installing = registration.installing;
    if (!installing) return;
    installing.addEventListener("statechange", () => {
      if (installing.state === "installed" && navigator.serviceWorker.controller) {
        installing.postMessage({ type: "SKIP_WAITING" });
      }
    });
  });
}

/**
 * Register the service worker — production builds only, never in dev.
 *
 * THE UPDATE PATH IS THE POINT, so it is worth saying what each piece buys. A
 * worker has to be FOUND again before it can be replaced, and that search is
 * answered by the browser's HTTP cache by default — which is how a deploy goes
 * unnoticed by a reader who is perfectly online:
 *
 *  - `updateViaCache: "none"` takes the worker SCRIPT out of the HTTP cache,
 *    so the check reaches the network rather than a copy of `sw.js` the browser
 *    kept for up to a day.
 *  - `registration.update()` asks for that check on EVERY open, rather than
 *    waiting for the browser's own navigation-triggered, 24-hour-throttled one.
 *    It earns its place even when the `?v=` hash is unchanged: the generator
 *    writes the build's asset filenames into `sw.js`, so a deploy always
 *    produces different worker BYTES, and those bytes are what the browser
 *    diffs. `tests/lib/precache.test.ts` pins the list's stability for exactly
 *    this reason.
 *  - The `controllerchange` handler is the last mile. A worker that has taken
 *    over an open page still leaves the OLD bundle running in it, so the reader
 *    is only on the deploy once the document has been rebuilt from the new one.
 *
 * The guard is `controlled` as this page FOUND it, not as it is by the time the
 * event fires. A first-ever install fires `controllerchange` for the same
 * reason a replacement does — `clients.claim()` is what causes the event — and
 * reloading there would replace a page that was never stale with itself,
 * spending a reader's first impression on nothing.
 *
 * AND WHY A RELOAD IS SOMETIMES IMMEDIATE. `applyUpdateWhenHidden` deliberately
 * waits for the reader to leave the tab, which is right for a deploy that
 * arrives while they are working. It is wrong for a swap THE READER ASKED FOR:
 * `skipRequested` is set only when this page told a waiting worker to take over
 * (the stuck case, or a press of "Alkalmazás frissítése"), and deferring there
 * would leave someone who just pressed a button looking at the same old screen —
 * the button would appear to do nothing, which is the report this closes. So the
 * swap the page requested is reloaded at once, and the ordinary one keeps its
 * quiet deferral.
 */
let skipRequested = false;

export function registerPwa(): void {
  if (!import.meta.env.PROD) return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);

  const controlled = navigator.serviceWorker.controller !== null;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!controlled) return;
    if (skipRequested) {
      window.location.reload();
      return;
    }
    applyUpdateWhenHidden();
  });

  // A load that a forced reset asked for is ALREADY on the deploy: the caches
  // were cleared and the registrations dropped before the navigation, so the
  // deferred "swap when the reader is not looking" has nothing left to swap and
  // would only cost a second reload. The marker is consumed here, whatever this
  // page's other answers turn out to be.
  const forced = consumeForceReset();

  navigator.serviceWorker
    .register(`/sw.js?v=${encodeURIComponent(bundleVersion())}`, { updateViaCache: "none" })
    .then((registration) => {
      // A worker left waiting by an earlier visit is the stuck case, and asking
      // it to skip is what moves the reader onto the deploy.
      if (registration.waiting && controlled) askWaitingToSkip(registration);
      // A load a forced reset produced already has the deploy, so the check is
      // deliberately NOT asked for there: there is nothing newer to find, and
      // asking would put the freshly unregistered worker straight back into an
      // update search.
      if (forced) return undefined;
      return registration.update();
    })
    .catch(() => {
      /* the app is offline-first anyway; SW is a progressive enhancement */
    });
}

function subscribeInstallable(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function isInstallable(): boolean {
  return deferredPrompt !== null;
}

/** Show the native install dialog. Returns true when the user accepted. */
export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;
  const prompt = deferredPrompt;
  deferredPrompt = null;
  emit();
  try {
    await prompt.prompt();
    const choice = await prompt.userChoice;
    return choice.outcome === "accepted";
  } catch {
    return false;
  }
}

const getSnapshot = isInstallable;

/** Live "installable?" view for the Settings card and dismissible banner. */
export function useInstallable(): boolean {
  return useSyncExternalStore(subscribeInstallable, getSnapshot, getSnapshot);
}

/**
 * Live "is a worker from another build in charge of this page?" view.
 *
 * Read on mount and again on every `controllerchange`, which is the only moment
 * the answer can change under a running page: a worker that takes over while the
 * reader is looking is either the current build (no banner) or another one (the
 * banner). `staleController` does the comparison; this only keeps it fresh and
 * gives the banner something to subscribe to.
 */
export function useStaleWorker(): boolean {
  const [stale, setStale] = useState(false);
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const update = () => setStale(staleController());
    update();
    navigator.serviceWorker.addEventListener("controllerchange", update);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", update);
  }, []);
  return stale;
}
