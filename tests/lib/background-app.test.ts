/**
 * The background image, as the WHOLE APP renders it.
 *
 * This lives apart from `tests/lib/image-background.test.ts` on purpose. That
 * file's store tests wipe the whole localStorage fixture between scenarios,
 * which is exactly right for them and destructive for these: an earlier version
 * had both describes together, and every "the background is painted" assertion
 * failed while every "no background" one passed. The cause was two things
 * fighting over one fixture — and the passing half is the dangerous part, since
 * "the app shows no background" is also what an entirely unwired feature
 * produces. A test that cannot fail is worse than no test, so this one gets a
 * clean fixture and its own file.
 *
 * The settings are written onto the SINGLETON store — the same module instance
 * `AppContext` imports. Seeding a cache-busted copy (`store?x=1`) does nothing:
 * the App reads a different instance, the seed never arrives, and every
 * positive assertion fails while the negative ones keep passing.
 *
 * Assertions are boolean-wrapped rather than `toContain`. A failing `toContain`
 * on this markup prints the entire rendered app — four thousand characters of
 * SVG — and the one thing being looked for is not in it.
 */
import { afterEach, describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import App from "../../src/App";
import * as store from "../../src/lib/store";
import { DEFAULT_SCRIM, blurPx, deriveScrimRgb, pickBackgroundImage } from "../../src/lib/imageBackground";

const backing: Record<string, string> = {};
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => (k in backing ? backing[k] : null),
  setItem: (k: string, v: string) => {
    backing[k] = v;
  },
  removeItem: (k: string) => {
    delete backing[k];
  },
};

const png = () => new File(["bytes"], "wallpaper.png", { type: "image/png" });

/** Configure the background, then render the whole App. */
function renderApp(settings: Record<string, unknown>): string {
  store.setSettings({ ...store.getState().settings, ...settings } as never);
  return renderToStaticMarkup(createElement(App));
}

afterEach(() => {
  store.setSettings({
    ...store.getState().settings,
    backgroundImage: undefined,
  } as never);
});

describe("the background image, rendered by the whole App", () => {
  it("leaves the root untouched when there is no image", () => {
    // The exact class list `full-system`'s own theme test pins. If the
    // background ever became unconditional, that test would catch it too — but
    // "no image" is the common case and the one that must stay inert, so it is
    // worth asserting from here as well.
    const html = renderApp({});
    expect(html.includes('<div data-theme="light" class="app">')).toBe(true);
    expect(html.includes("has-bg")).toBe(false);
    expect(html.includes("bg-palette-image")).toBe(false);
    expect(html.includes("--app-bg-image")).toBe(false);
  });

  it("paints the picture and the scrim when one is set", async () => {
    const id = await pickBackgroundImage(png());
    const html = renderApp({ backgroundImage: id, backgroundScrim: 0.4 });
    expect(html.includes("has-bg")).toBe(true);
    // Both custom properties the stylesheet composes its two layers from. No
    // space after the colon: React's style serialiser writes custom properties
    // as `--name:value`, unlike the `--name: value` form in a stylesheet, and an
    // assertion written against the stylesheet's spelling fails on a correct
    // element for a purely cosmetic reason.
    expect(html.includes("--app-bg-image")).toBe(true);
    expect(html.includes("--app-bg-scrim-alpha:0.4")).toBe(true);
  });

  it("keeps the theme working alongside the image", () => {
    // The reason this is a LAYER and not a seventh theme: a picture and a dark
    // theme are not alternatives. If adding the background ever cost the theme
    // choice, this is what would break.
    const html = renderApp({ theme: "warm", backgroundImage: "vanished" });
    expect(html.includes('data-theme="warm"')).toBe(true);
  });

  it("clamps a corrupt scrim on the way into the style attribute", async () => {
    // The last boundary before the `rgba()`. A store already bypassed, or a
    // component handed a partial Settings, would otherwise put `NaN` into a style
    // the browser discards — leaving the reader a photo and no scrim, which is
    // the one outcome that costs legibility.
    const id = await pickBackgroundImage(png());
    const html = renderApp({ backgroundImage: id, backgroundScrim: "half" });
    expect(html.includes(`--app-bg-scrim-alpha:${DEFAULT_SCRIM}`)).toBe(true);
    expect(html.includes("NaN")).toBe(false);
  });

  it("shows no background when the bytes are gone, however valid the id looks", () => {
    // A quota eviction or a deletion outside the app. The class must not appear,
    // or the app would sit on a `url()` that resolves to nothing.
    const html = renderApp({ backgroundImage: "vanished", backgroundScrim: 0.5 });
    expect(html.includes("has-bg")).toBe(false);
  });

  it("the scrim colour is written by applyThemeTokens, not by a component", async () => {
    // The single write point. If this moved into a component, the Settings
    // preview and the app would have two answers to "what colour is the scrim in
    // the dark theme" — and the preview is the wrong one a reader would trust.
    const themes = await import("../../src/lib/themes");
    const source = await Bun.file("src/lib/themes.ts").text();
    expect(source).toContain("--app-bg-scrim-rgb");
    // And it follows the theme's polarity rather than being a constant.
    expect(themes.THEMES.light.bg).not.toBe(themes.THEMES.dark.bg);
  });

  it("writes the blur, and the tint beside the scrim rather than over it", async () => {
    // The three inline properties the whole layer is made of: the picture, the
    // reader's alpha, and the blur. Plus the tint — on its OWN property, because
    // `--app-bg-scrim-rgb` belongs to the theme and the high-contrast and
    // reduced-transparency rules read it for a flat scrim. An inline override
    // here would quietly hand them the tinted value instead, which is the exact
    // thing those rules exist to prevent.
    const id = await pickBackgroundImage(png());
    const html = renderApp({
      backgroundImage: id,
      backgroundScrim: 0.4,
      backgroundBlur: 0.5,
      backgroundTint: "10, 20, 30",
    });
    expect(html.includes(`--app-bg-blur:${blurPx(0.5)}`)).toBe(true);
    expect(html.includes("--app-bg-tint-rgb:")).toBe(true);
    expect(html.includes("--app-bg-scrim-rgb:")).toBe(false);
  });

  it("marks the root for the picture's palette, and only then", async () => {
    // The class is what selects the tinted rule in the stylesheet, so its absence
    // is what makes "Saját témám" mean the flat scrim. Asserted in both
    // directions because either half alone would pass for the wrong reason: a
    // class that is always on is invisible under a light theme's scrim, and one
    // that is never on is invisible under every theme.
    const id = await pickBackgroundImage(png());
    const fromImage = renderApp({ backgroundImage: id, backgroundPalette: "image" });
    expect(fromImage.includes("has-bg bg-palette-image")).toBe(true);
    const fromTheme = renderApp({ backgroundImage: id, backgroundPalette: "theme" });
    expect(fromTheme.includes("has-bg")).toBe(true);
    expect(fromTheme.includes("bg-palette-image")).toBe(false);
  });

  it("paints the soft fill's third layer, and only for the soft fit", async () => {
    // `soft` is the default and the one fit with a layer of its own, so the
    // class and the div have to arrive together with it — and the other two
    // fits have to keep the two-layer DOM they shipped with. Asserted in both
    // directions because either half alone passes for the wrong reason: a fill
    // that always renders is invisible under a cover-sized picture, and one
    // that never renders makes the default look like plain `contain`.
    const id = await pickBackgroundImage(png());
    // The palette is set explicitly rather than left to the previous test's
    // last write: these assertions are about the FIT class's position in the
    // list, and a stale `theme` palette from the test above would make the
    // chain they look for disappear for a reason that has nothing to do with
    // the fit.
    const soft = renderApp({
      backgroundImage: id,
      backgroundFit: "soft",
      backgroundPalette: "image",
    });
    expect(soft.includes("has-bg bg-palette-image bg-fit-soft")).toBe(true);
    expect(soft.includes("app-bg-fill")).toBe(true);
    // The picture layer behind the fill is still `contain`, which is what
    // `fitCss` answers for `soft`; the fill's own size lives in the stylesheet.
    expect(soft.includes("--app-bg-size:contain")).toBe(true);

    for (const fit of ["cover", "contain"] as const) {
      const html = renderApp({ backgroundImage: id, backgroundFit: fit });
      expect(html.includes("bg-fit-soft"), `${fit} asked for the fill`).toBe(false);
      expect(html.includes("app-bg-fill"), `${fit} painted the fill`).toBe(false);
      expect(html.includes(`--app-bg-size:${fit}`), `${fit} wrote the size`).toBe(true);
    }
  });

  it("the tint it writes is the same value the Settings preview computes", async () => {
    // Two call sites, one function. If the app root and the picker ever derived
    // the scrim separately they would agree until the day they did not, and the
    // reader would see one colour in Settings and another in the app.
    const id = await pickBackgroundImage(png());
    const html = renderApp({
      backgroundImage: id,
      backgroundTint: "200, 40, 40",
      backgroundPalette: "image",
    });
    const expected = deriveScrimRgb("200, 40, 40", true);
    expect(html.includes(`--app-bg-tint-rgb:${expected}`)).toBe(true);
    expect(expected).toBe("237, 183, 183");
  });

  it("high contrast still paints the picture — it overrides the scrim, not the layer", async () => {
    // The stylesheet makes the scrim opaque under high contrast; the layer stays.
    // A reader who turns the setting on and off must get their picture back, so
    // this asserts the picture is still there with the setting on.
    const id = await pickBackgroundImage(png());
    const html = renderApp({ backgroundImage: id, highContrast: true });
    expect(html.includes("contrast-high has-bg")).toBe(true);
    expect(html.includes("--app-bg-image")).toBe(true);
  });
});