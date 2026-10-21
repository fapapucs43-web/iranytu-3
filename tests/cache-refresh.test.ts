/**
 * THE FOUR LAYERS OF "A DEPLOY MUST REACH THE READER".
 *
 * The report was a laptop that kept showing an older app after Ctrl+Shift+R, so
 * what is pinned here is every layer that can answer a request for the current
 * version, one per describe block:
 *
 *  1. the service worker's cache NAME — a deploy must never be served out of a
 *     cache built for a different one, and the fallback that used to be the word
 *     "stable" was a cache name shared by every build there has ever been;
 *  2. the registration URL and `updateViaCache`, pinned as source text because
 *     the whole function sits behind Vite's build-time PROD flag and cannot be
 *     reached from `bun test`;
 *  3. the document's own three `<meta http-equiv>` tags, for the caches that
 *     read the markup and never see a header;
 *  4. the reader's own button, which is exercised for REAL — it is plain async
 *     code over `caches`, `navigator.serviceWorker`, `sessionStorage`,
 *     `localStorage` and `location.replace`, so it runs here against doubles, and
 *     the order of its six steps is asserted rather than described. The step that
 *     actually fixes the reported case is the LAST one: a navigation to a url
 *     nobody has ever requested, which no cache and no precache can answer from
 *     storage (see `resetUrl`).
 *
 * No jsdom, deliberately: nothing in this file renders, and the one component
 * it mentions is checked through its source, its markup and the catalogue.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildId, injectBuildVersion, VERSION_END, VERSION_START } from "../scripts/precache-manifest.mjs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AppUpdateCard from "../src/components/AppUpdateCard";
import { FORCE_RESET_KEY, consumeForceReset, forceAppUpdate } from "../src/lib/pwa";
import { MESSAGES, SUPPORTED_LOCALES, type TranslationKey } from "../src/lib/i18n";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SW = readFileSync(join(ROOT, "public/sw.js"), "utf8");
const PWA = readFileSync(join(ROOT, "src/lib/pwa.ts"), "utf8");
const APP = readFileSync(join(ROOT, "src/App.tsx"), "utf8");
const HTML = readFileSync(join(ROOT, "index.html"), "utf8");
const CARD = readFileSync(join(ROOT, "src/components/AppUpdateCard.tsx"), "utf8");
const SETTINGS = readFileSync(join(ROOT, "src/views/SettingsView.tsx"), "utf8");
const STYLES = readFileSync(join(ROOT, "src/styles.css"), "utf8");

/**
 * A miniature of the browser surface `forceAppUpdate` walks, with a LOG.
 *
 * The log is the point: "clears the caches, unregisters the workers, marks the
 * load and reloads" is a claim about ORDER as much as about the four calls, and
 * a version that reloaded first would still call all four. Everything is
 * undoable, because these are process-wide globals and a leak would be a lie
 * every later file believes.
 */
function withBrowser(
  opts: {
    caches?: "ok" | "absent" | "throws";
    registrations?: boolean;
    controller?: boolean;
    session?: boolean;
  } = {},
) {
  const globals = globalThis as unknown as Record<string, unknown>;
  const log: string[] = [];
  const kept = new Map<string, unknown>();
  for (const key of ["caches", "navigator", "localStorage", "sessionStorage", "window"]) {
    kept.set(key, globals[key]);
  }
  const store = new Map<string, string>();

  if (opts.caches !== "absent") {
    globals["caches"] = {
      keys: () => {
        if (opts.caches === "throws") throw new Error("no cache storage");
        log.push("caches.keys");
        return Promise.resolve(["belso-iranytu-abc", "belso-iranytu-old", "workbox"]);
      },
      delete: (name: string) => {
        log.push(`caches.delete:${name}`);
        return Promise.resolve(true);
      },
    };
  }
  globals["navigator"] = {
    serviceWorker: {
      controller: opts.controller ? { scriptURL: "https://x/sw.js?v=otherbuild" } : null,
      getRegistrations: () => {
        log.push("getRegistrations");
        return Promise.resolve(
          opts.registrations === false
            ? []
            : [
                {
                  unregister: () => {
                    log.push("unregister");
                    return Promise.resolve(true);
                  },
                },
                {
                  unregister: () => {
                    log.push("unregister");
                    return Promise.resolve(true);
                  },
                },
              ],
        );
      },
    },
  };
  globals["localStorage"] = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      log.push(`setItem:${k}`);
      store.set(k, v);
    },
    removeItem: (k: string) => {
      log.push(`removeItem:${k}`);
      store.delete(k);
    },
  };
  if (opts.session !== false) {
    globals["sessionStorage"] = {
      clear: () => {
        log.push("sessionStorage.clear");
      },
    };
  }
  globals["window"] = {
    location: {
      pathname: "/",
      replace: (url: string) => {
        log.push(`replace:${url}`);
      },
      reload: () => {
        log.push("reload");
      },
    },
    history: {
      replaceState: (_state: unknown, _title: string, url: string) => {
        log.push(`replaceState:${url}`);
      },
    },
    locationHref: undefined,
  };

  return {
    log,
    store,
    restore: () => {
      for (const [key, value] of kept) {
        if (value === undefined) delete globals[key];
        else globals[key] = value;
      }
    },
  };
}

describe("the worker's cache name is this build's, and never the word \"stable\"", () => {
  test("the version comes from the query string, and the build id is the fallback", () => {
    // The version the registration passes is the first source and the baked-out
    // build id is the second, because the browser also asks for a worker with
    // no query string at all — and the old answer to that case was "stable",
    // i.e. one cache name for every build ever deployed, which is a cache that
    // survives the deploy it was meant to be replaced by.
    expect(SW).toContain('const QUERY_VERSION = new URLSearchParams(self.location.search).get("v");');
    expect(SW).toContain("const VERSION = QUERY_VERSION || BUILD_VERSION;");
    expect(SW).toContain("const CACHE = `belso-iranytu-${VERSION}`;");
    expect(SW).not.toContain('|| "stable"');
  });

  test("the template carries the marker pair exactly once, or the build refuses", () => {
    expect(SW.split(VERSION_START).length - 1).toBe(1);
    expect(SW.split(VERSION_END).length - 1).toBe(1);
    expect(injectBuildVersion(SW, "deadbeefcafe")).toContain(
      `const BUILD_VERSION = "deadbeefcafe";`,
    );
    // A template that lost its markers must fail the build rather than ship a
    // worker whose fallback version is the placeholder.
    expect(() => injectBuildVersion("const VERSION = 1;", "deadbeefcafe")).toThrow();
    expect(() =>
      injectBuildVersion(`${VERSION_START}\n${VERSION_START}\n${VERSION_END}`, "x"),
    ).toThrow();
    // …and the rest of the worker is untouched by the write.
    expect(injectBuildVersion(SW, "deadbeefcafe")).toContain("self.skipWaiting()");
  });

  test("the id is the build's own, and it is stable for an unchanged build", () => {
    const dir = mkdtempSync(join(tmpdir(), "build-id-"));
    try {
      writeFileSync(join(dir, "index.html"), "<div id=\"root\"></div><script src=/assets/a-12345678.js>");
      const first = buildId(dir);
      expect(first).toMatch(/^[0-9a-f]{12}$/);
      // Same tree, same id: a rebuild of an unchanged commit must not look like
      // a new deploy to a browser that already has it.
      expect(buildId(dir)).toBe(first);
      // A different build — which is exactly what a new asset filename in
      // index.html means — is a different id.
      writeFileSync(join(dir, "index.html"), "<div id=\"root\"></div><script src=/assets/a-abcdef01.js>");
      expect(buildId(dir)).not.toBe(first);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("the registration asks for the worker by version, out of the HTTP cache", () => {
  test("the URL carries the bundle hash and the script is not answered from cache", () => {
    expect(PWA).toContain("/sw.js?v=${encodeURIComponent(bundleVersion())}");
    expect(PWA).toContain('updateViaCache: "none"');
    // The check is asked for on every open, and NOT on the load a forced reset
    // asked for — there is nothing newer to find there, and asking would put the
    // freshly unregistered worker straight back into an update search.
    expect(PWA).toContain("if (forced) return undefined;");
    expect(PWA).toContain("return registration.update();");
    expect(PWA).not.toContain("(forced ? registration : registration.update())");
  });
});

describe("the document says out loud that it must not be kept", () => {
  test("all three meta tags are in index.html", () => {
    expect(HTML).toContain(
      '<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />',
    );
    expect(HTML).toContain('<meta http-equiv="Pragma" content="no-cache" />');
    expect(HTML).toContain('<meta http-equiv="Expires" content="0" />');
    // In the head, before the module script: a cache that reads the document
    // reads it in order, and a tag after the script is a tag after the request
    // that mattered.
    expect(HTML.indexOf("http-equiv=\"Cache-Control\"")).toBeLessThan(
      HTML.indexOf("<script type=\"module\""),
    );
  });
});

describe("the reader's own button: four steps, in the order that works", () => {
  test("the six steps run in this order: unregister, caches, session, marker, navigate, and the answer", async () => {
    const browser = withBrowser({ controller: true });
    try {
      const stillControlled = await forceAppUpdate();
      const navigate = browser.log[browser.log.length - 1]!;
      // Every step, in order — the unregistrations BEFORE the caches, which is
      // the order that matters: a live worker rebuilds the caches it just lost.
      expect(browser.log).toEqual([
        "getRegistrations",
        "unregister",
        "unregister",
        "caches.keys",
        "caches.delete:belso-iranytu-abc",
        "caches.delete:belso-iranytu-old",
        "caches.delete:workbox",
        "sessionStorage.clear",
        "setItem:" + FORCE_RESET_KEY,
        navigate,
      ]);
      // …and the navigation is a `replace` to a url nobody has ever requested,
      // never a reload of the stuck one.
      expect(navigate).toMatch(/^replace:\/\?nocache=\d+$/);
      expect(browser.log).not.toContain("reload");
      // The marker is what the NEXT load reads to know it is already fresh.
      expect(browser.store.get(FORCE_RESET_KEY)).toBe("1");
      // Step six, answered to the caller: a worker was still in charge.
      expect(stillControlled).toBe(true);
    } finally {
      browser.restore();
    }
  });

  test("the marker is consumed once — the next load knows, the one after it does not", () => {
    const browser = withBrowser();
    try {
      browser.store.set(FORCE_RESET_KEY, "1");
      expect(consumeForceReset()).toBe(true);
      expect(consumeForceReset()).toBe(false);
    } finally {
      browser.restore();
    }
  });

  test("a browser missing one API still navigates — the lever cannot be stuck", async () => {
    // Each of these is a real engine shape: no Cache Storage (an old browser, a
    // private window), no registrations to drop, no session storage to clear. The
    // navigation is the step the reader asked for and the only one that must
    // happen — and with no controller in charge the answer is `false`, which is
    // the card's cue to stay quiet about the manual route.
    for (const opts of [
      { caches: "absent" as const },
      { caches: "throws" as const },
      { registrations: false },
      { session: false },
    ]) {
      const browser = withBrowser(opts);
      try {
        const stillControlled = await forceAppUpdate();
        expect(browser.log[browser.log.length - 1], JSON.stringify(opts)).toMatch(/^replace:\/\?nocache=\d+$/);
        expect(stillControlled, JSON.stringify(opts)).toBe(false);
      } finally {
        browser.restore();
      }
    }
  });
});

describe("the card that offers it, and the words it uses", () => {
  test("it is rendered in Settings, under the install card, and it runs the six-step reset", () => {
    // The answer feeds the card's own fallback: `true` means a worker was still
    // in charge, which is the case a second press cannot fix.
    expect(CARD).toContain("setStuck(await forceAppUpdate());");
    expect(CARD).toContain('t("update.stuckGuide")');
    expect(CARD).toContain('t("update.cardTitle")');
    expect(CARD).toContain('t("update.action")');
    // Placed by the install card, the other half of "which copy am I using?".
    const installed = SETTINGS.indexOf("<InstallCard />");
    const updater = SETTINGS.indexOf("<AppUpdateCard />");
    expect(installed).toBeGreaterThan(-1);
    expect(updater).toBeGreaterThan(installed);
    expect(SETTINGS).toContain('import AppUpdateCard from "../components/AppUpdateCard";');
  });

  test("it renders: the button is there, with the words the catalogue promises", () => {
    // Rendered, not only read: a card that threw on render (a bad import, a
    // missing key) would pass every source pin above and be invisible to the
    // reader the button exists for. `renderToStaticMarkup` is the same tool the
    // rest of this repo's markup suites use — no jsdom, no click.
    const html = renderToStaticMarkup(createElement(AppUpdateCard));
    expect(html).toContain('type="button"');
    // The two labels, spelled out: the card says what it does ("cache clear and
    // reload") and the BUTTON is the action the reader is looking for by name
    // ("update the app").
    expect(html).toContain("Alkalmazás frissítése");
    expect(html).toContain("Cache törlése és újratöltés");
    expect(html).toMatch(/<button[^>]*>.*Alkalmazás frissítése/s);
    // The note says what pressing it costs BEFORE it is pressed.
    expect(html).toContain("újratölti az oldalt");
    // …and the card renders no failure line until there is one.
    expect(html).not.toContain("bg-pick-error");
  });

  test("the button is a real button, and it cannot be pressed twice at once", () => {
    expect(CARD).toContain('type="button"');
    expect(CARD).toContain("disabled={busy}");
    expect(CARD).toContain("aria-busy={busy}");
    // A failure has to be SAID: the reader's next move differs from a retry.
    expect(CARD).toContain("setFailed(true)");
    expect(STYLES).toContain(".bg-pick-error");
  });

  test("every locale has all five keys — a missing one shows a key, not a sentence", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const catalogue = MESSAGES[locale] as Record<string, string>;
      for (const key of [
        "update.cardTitle",
        "update.note",
        "update.action",
        "update.busy",
        "update.failed",
        "update.stuckGuide",
        "stale.title",
        "stale.body",
      ]) {
        expect(catalogue[key as TranslationKey], `${locale}/${key}`).toBeTruthy();
      }
    }
  });
});
