/**
 * THE STUCK SERVICE WORKER — detection, the address that escapes it, and the
 * message that asks a waiting worker to take over.
 *
 * The reported state: incognito works, the normal profile does not, and the
 * update button does not help either. That is a worker from another build in
 * charge of the page — it cannot be replaced by asking again, only by ceasing to
 * exist plus a navigation to an address no cache has ever seen. This file pins
 * the four parts of that:
 *
 *  1. `controllerIsStale` — the detector, as a pure comparison against the build
 *     hash the registration url carries, conservative about every unknown;
 *  2. `resetUrl` / `cleanResetParam` — the escape address, and taking the stamp
 *     back out of the bar once the fresh document is up;
 *  3. `SW` — the `SKIP_WAITING` message listener, with no other verb accepted;
 *  4. `PWA` / `APP` / the banner — the wiring: the page asks a waiting worker to
 *     skip, reloads at once for a swap it asked for, keeps the quiet deferral for
 *     one it did not, and shows the banner when a foreign worker is in charge.
 *
 * No jsdom, deliberately: the detector is pure, the banner is rendered with
 * `renderToStaticMarkup`, and everything else is source text or a document read.
 */
import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { StaleWorkerBanner } from "../src/components/StaleWorkerNotice";
import { controllerIsStale, resetUrl } from "../src/lib/pwa";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PWA = readFileSync(join(ROOT, "src/lib/pwa.ts"), "utf8");
const APP = readFileSync(join(ROOT, "src/App.tsx"), "utf8");
const SW = readFileSync(join(ROOT, "public/sw.js"), "utf8");
const STYLES = readFileSync(join(ROOT, "src/styles.css"), "utf8");
const DOC = readFileSync(join(ROOT, "docs/stuck-service-worker.md"), "utf8");
const KEYS = readFileSync(join(ROOT, "src/lib/storageKeys.ts"), "utf8");
const BANNER = readFileSync(join(ROOT, "src/components/StaleWorkerNotice.tsx"), "utf8");

describe("the detector: a controller whose url is not this build's", () => {
  test("the hash in the registration url is what decides", () => {
    // The registration passes `?v=<bundle hash>`, and `ServiceWorker.scriptURL`
    // is the url it was registered with — so this is a string comparison, not a
    // guess, and it needs no state of its own.
    expect(controllerIsStale("/sw.js?v=abc12345", "abc12345")).toBe(false);
    expect(controllerIsStale("/sw.js?v=abc12345", "def67890")).toBe(true);
    // A worker registered WITHOUT a version is from a build that predates the
    // query string — the definition of stale.
    expect(controllerIsStale("/sw.js", "abc12345")).toBe(true);
  });

  test("and it is conservative about every unknown", () => {
    // No controller is not a stuck controller: it is a first visit, or a browser
    // without workers. Guessing \"stale\" here would put a warning in front of
    // readers whose install is perfectly current, which is how a warning becomes
    // noise.
    expect(controllerIsStale(null, "abc12345")).toBe(false);
    expect(controllerIsStale(undefined, "abc12345")).toBe(false);
    expect(controllerIsStale("", "abc12345")).toBe(false);
    // An empty version can compare nothing, so it claims nothing — `false`
    // rather than calling every worker in existence stale.
    expect(controllerIsStale("/sw.js?v=abc12345", "")).toBe(false);
  });

  test("the page answers the detector with its own bundle's hash", () => {
    // The one place the two halves meet: `staleController` is the detector fed
    // by `bundleVersion()`, which is exported for exactly this reason.
    expect(PWA).toContain("export function bundleVersion(): string {");
    expect(PWA).toContain("return controllerIsStale(navigator.serviceWorker.controller?.scriptURL, bundleVersion());");
    expect(PWA).toContain("export function useStaleWorker(): boolean {");
    expect(PWA).toContain('navigator.serviceWorker.addEventListener("controllerchange", update);');
  });
});

describe("the address that escapes the cache", () => {
  test("a stamp in the url is the whole trick", () => {
    // `location.reload()` re-requests the SAME url, and everything that can answer
    // it wrongly gets another chance — including a stored `index.html` that is
    // still fresh under the caching policy of the deploy that stored it. A url
    // with a stamp has never been requested by anyone.
    expect(resetUrl("/", 1700000000000)).toBe("/?nocache=1700000000000");
    expect(resetUrl("/today", 42)).toBe("/today?nocache=42");
    // A path that is not rooted cannot be navigated to as given: `?nocache=` alone
    // would be a relative url and land on a directory listing.
    expect(resetUrl("", 42)).toBe("/?nocache=42");
    expect(resetUrl("today", 42)).toBe("/?nocache=42");
  });

  test("the reset navigates rather than reloading, and never leaves history behind", () => {
    expect(PWA).toContain("window.location.replace(resetUrl(window.location.pathname, Date.now()));");
    // The fallback is a reload, and only for a browser that refuses `replace`.
    expect(PWA).toContain("window.location.reload();");
    // `replace`, not `assign`: Back must not put the reader on the stuck page.
    expect(PWA).not.toContain("location.assign(");
  });

  test("the stamp is taken back out of the address bar", () => {
    // Left in place it would be bookmarked, pasted, and paid for on every later
    // visit — a cache miss handed to the reader's next session.
    expect(PWA).toContain('if (!url.searchParams.has("nocache")) return;');
    expect(PWA).toContain('url.searchParams.delete("nocache");');
    expect(PWA).toContain("window.history.replaceState(null, \"\", `${url.pathname}${url.search}${url.hash}`);");
    // And the app calls it on mount, so the bar is clean as soon as the fresh
    // document is up.
    expect(APP).toContain("cleanResetParam();");
  });
});

describe("asking a waiting worker to take over", () => {
  test("sw.js accepts exactly one verb, and it is the safe one", () => {
    expect(SW).toContain('self.addEventListener("message", (event) => {');
    expect(SW).toContain('if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();');
    // Nothing else is honoured over this channel: a message a page can send is a
    // message any script on the origin can send.
    expect(SW.match(/addEventListener\("message"/g)?.length).toBe(1);
  });

  test("the page asks in both places a waiting worker can appear", () => {
    // At registration time (a previous visit left it waiting) and on `updatefound`
    // once a newly installed worker reports `installed` while a controller is in
    // place — which is the definition of `waiting`.
    expect(PWA).toContain('registration.waiting?.postMessage({ type: "SKIP_WAITING" });');
    expect(PWA).toContain('registration.addEventListener("updatefound"');
    expect(PWA).toContain('if (installing.state === "installed" && navigator.serviceWorker.controller)');
    expect(PWA).toContain('if (registration.waiting && controlled) askWaitingToSkip(registration);');
  });

  test("a swap the page asked for reloads at once; a deploy that arrives quietly still waits", () => {
    // The reader who just pressed a button must not be left looking at the same
    // screen — that is the report this closes.
    expect(PWA).toContain("if (skipRequested) {");
    expect(PWA).toContain("window.location.reload();");
    // And the deferral an earlier batch built is untouched for the other case.
    expect(PWA).toContain("applyUpdateWhenHidden();");
    expect(PWA).toContain('document.addEventListener("visibilitychange", onHidden);');
    // The first-install guard stays: `clients.claim()` fires `controllerchange`
    // on a page that was never stale.
    expect(PWA).toContain("const controlled = navigator.serviceWorker.controller !== null;");
    expect(PWA).toContain("if (!controlled) return;");
  });

  test("the reset asks for the skip AFTER dropping the registrations, so nothing re-installs", () => {
    // Order, as source positions: the unregister loop precedes the caches and the
    // navigation, which `tests/cache-refresh.test.ts` walks step by step.
    const unregister = PWA.indexOf("for (const registration of registrations) await registration.unregister();");
    const caches = PWA.indexOf("for (const name of names) await caches.delete(name);");
    const navigate = PWA.indexOf("window.location.replace(resetUrl(");
    expect(unregister).toBeGreaterThan(-1);
    expect(caches).toBeGreaterThan(unregister);
    expect(navigate).toBeGreaterThan(caches);
  });
});

describe("the banner that says the page is not the deploy", () => {
  const render = (props: { show: boolean; busy?: boolean; stuck?: boolean }) =>
    renderToStaticMarkup(
      createElement(StaleWorkerBanner, {
        show: props.show,
        busy: props.busy ?? false,
        stuck: props.stuck ?? false,
        onUpdate: () => {},
      }),
    );

  test("nothing at all while no foreign worker is in charge", () => {
    expect(render({ show: false })).toBe("");
  });

  test("when one is: the warning, the button, and the amber rail", () => {
    const html = render({ show: true });
    expect(html).toContain("stale-worker-banner");
    expect(html).toContain("Ez a lap régi verziót futtat");
    expect(html).toContain("Alkalmazás frissítése");
    expect(html).toMatch(/<button[^>]*>.*Alkalmazás frissítése/s);
    // And it is the one banner that cannot be dismissed.
    expect(html).not.toContain("aria-label=\"Megjelenítés elrejtése\"");
    // The stylesheet defines the class, on a solid surface with the amber rail.
    expect(STYLES).toContain(".stale-worker-banner {");
    expect(STYLES).toContain("border-left: 3px solid var(--ring-warn);");
    // A solid carrier of its own, so it is listed with the others: the theme's
    // words on its own ground, never the photograph's.
    expect(STYLES).toContain(".app.has-bg .install-banner,\n.app.has-bg .stale-worker-banner,");
  });

  test("a reset that left a worker in charge hands over the manual route", () => {
    const html = render({ show: true, stuck: true });
    expect(html).toContain("Application → Service Workers → Unregister");
    expect(html).toContain("Clear site data");
    // The same key the Settings card uses, so the one text that matters cannot
    // drift between the two places that show it.
    expect(BANNER).toContain('t("update.stuckGuide")');
  });

  test("the button cannot be pressed twice while it works", () => {
    const html = render({ show: true, busy: true });
    expect(html).toContain("disabled");
    expect(html).toContain("aria-busy");
  });

  test("the app mounts it, and the marker key is in the wipe list", () => {
    expect(APP).toContain("import StaleWorkerNotice from \"./components/StaleWorkerNotice\";");
    expect(APP).toContain("<StaleWorkerNotice />");
    // Both marker names, because an install that pressed the OLD button still has
    // the old key set.
    expect(KEYS).toContain('"belso-iranytu-force-reset"');
    expect(KEYS).toContain('"belso-iranytu-update-requested"');
  });
});

describe("the guide a reader can follow when nothing else works", () => {
  test("both devtools routes are written down, and they are the ones that work", () => {
    expect(DOC).toContain("Application** (Chrome)");
    expect(DOC).toContain("Service Workers");
    expect(DOC).toContain("Unregister");
    expect(DOC).toContain("Clear site data");
    expect(DOC).toContain("Ctrl+Shift+R");
    expect(DOC).toContain("chrome://serviceworker-internals/");
  });

  test("and it says why the hard reload is not enough", () => {
    // The one thing a reader will otherwise not believe: that Ctrl+Shift+R
    // re-requests the same url, and a stored document can still be fresh under
    // the policy of the deploy that stored it.
    expect(DOC).toContain("max-age=0, must-revalidate");
    expect(DOC).toContain("soha nem kért");
  });
});
