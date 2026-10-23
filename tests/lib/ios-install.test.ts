/**
 * iOS INSTALLABILITY + THE WIDGET DEEP LINK.
 *
 * WHAT THIS FILE KEEPS TRUE, in two halves that are one feature: a reader who
 * adds Belső Iránytű to their iPhone's Home Screen should get a full-screen app
 * with a real icon, and a one-tap widget/shortcut should open it on the Ma tab.
 *
 * The first half is the three iOS tags. Safari on iOS does not read
 * `manifest.webmanifest` for any of them — it has its own tags in the DOCUMENT
 * — so a manifest that is perfect and a document without these three lines is a
 * plain web-clip: Safari's own address bar stays around the page and the system
 * guesses an icon. That is the gap this file pins shut.
 *
 * The second half is `?quick=mood`. A widget, an iOS Shortcut and an Android
 * shortcut all open the app at a URL, and that URL has to actually DO something:
 * before this batch nothing in `src/` read any query parameter, so the
 * manifest's own `shortcuts` entry and every proposed widget URL were dead. The
 * mapping now lives in `lib/quickStart` and is exercised here for real. It reads
 * `window.location.search` itself, so each case below points a minimal `window`
 * double at the query string it is testing.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { consumeQuickStart } from "../../src/lib/quickStart";

const HTML = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const MANIFEST = JSON.parse(
  readFileSync(new URL("../../public/manifest.webmanifest", import.meta.url), "utf8"),
) as {
  icons: { src: string; sizes: string }[];
  shortcuts?: { url: string }[];
};

describe("the three iOS tags are in the document, where Safari looks", () => {
  test("apple-mobile-web-app-capable: yes — the full-screen standalone surface", () => {
    expect(HTML).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />');
  });

  test("status-bar style is declared, and the document runs under the bar", () => {
    expect(HTML).toContain(
      '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
    );
  });

  test("the touch icon points at the 192 PNG that is actually on disk", () => {
    expect(HTML).toContain('<link rel="apple-touch-icon" href="/icons/icon-192.png" />');
    // The declared icon must EXIST, or iOS silently falls back to a screenshot.
    expect(readFileSync(new URL("../../public/icons/icon-192.png", import.meta.url))).toBeTruthy();
  });

  test("the tags sit in the head, before the module script", () => {
    // A tag after the script is a tag after the request that mattered; the same
    // ordering rule `cache-refresh.test.ts` holds the http-equiv tags to.
    const capable = HTML.indexOf('name="apple-mobile-web-app-capable"');
    const script = HTML.indexOf('<script type="module"');
    expect(capable).toBeGreaterThan(-1);
    expect(capable).toBeLessThan(script);
  });
});

describe("the manifest agrees with the document about the icon and the app", () => {
  test("a 192x192 PNG icon is declared, matching the apple-touch-icon", () => {
    // The manifest's own src is RELATIVE ("./icons/…") so it resolves under
    // any deployment base; the DOCUMENT's tag is root-absolute in source and
    // Vite rewrites it with the base at build — two routes to the same file.
    const icon = MANIFEST.icons.find((i) => i.src === "./icons/icon-192.png");
    expect(icon).toBeDefined();
    expect(icon!.sizes).toBe("192x192");
    // Same file the iOS tag names — one icon, two declarations, no drift.
    expect(HTML).toContain('rel="apple-touch-icon" href="/icons/icon-192.png"');
  });

  test("the existing manifest shortcut points at the tab the deep link honours", () => {
    // The manifest already advertised `/?tab=today`; the app honours `?quick=`
    // instead, so the shortcut must use the parameter that actually works.
    // The URL is relative to the manifest so the launcher button stays on the
    // app's own base instead of jumping to the origin's root.
    const url = MANIFEST.shortcuts?.[0]?.url;
    expect(url).toBe("./?quick=mood");
  });
});

/**
 * Run `consumeQuickStart` against a given query string.
 *
 * The function reads `window.location.href` itself (so it is safe to call
 * during a server-side render, where there is no `window` at all, and safe
 * against a partial `window` some other file left behind — a missing `href`
 * throws inside the function's own try and reads as "no instruction"). That
 * means a test drives it by pointing `window.location` at a URL —
 * `globalThis.window` does not exist under `bun test`, so this creates a
 * minimal double, runs the body, and puts the previous value back. Restoring
 * matters: this file shares a process with every other test file, and a
 * leftover `window` would be a lie the rest of the suite believes.
 */
function withSearch<T>(search: string, body: () => T): T {
  const g = globalThis as unknown as Record<string, unknown>;
  const had = "window" in g;
  const prev = g["window"];
  g["window"] = { location: { href: `https://iranytu2.freebuff.app/${search}`, search } };
  try {
    return body();
  } finally {
    if (had) g["window"] = prev;
    else delete g["window"];
  }
}

describe("?quick= maps to a tab and falls back to the default", () => {
  test("mood → today (the daily entry the widget promises)", () => {
    expect(withSearch("?quick=mood", consumeQuickStart)).toBe("today");
  });

  test("no parameter → null, so the app keeps its default tab", () => {
    expect(withSearch("", consumeQuickStart)).toBeNull();
    expect(withSearch("?nocache=123", consumeQuickStart)).toBeNull();
  });

  test("an unknown value → null, never an unexpected navigation", () => {
    // A typo'd or future parameter must not send a reader somewhere they did
    // not ask to go; `null` means "no instruction, use the default".
    expect(withSearch("?quick=nonsense", consumeQuickStart)).toBeNull();
    expect(withSearch("?quick=", consumeQuickStart)).toBeNull();
  });

  test("the parameter is read alongside others without disturbing them", () => {
    expect(withSearch("?nocache=99&quick=mood&x=1", consumeQuickStart)).toBe("today");
  });

  test("no window at all (server-side render) → null, never a crash", () => {
    // The app renders to a string in several suites; the deep link must not be
    // the thing that breaks that environment.
    expect(consumeQuickStart()).toBeNull();
  });
});
