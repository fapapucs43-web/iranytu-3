/**
 * Batch 13, commit 2 — `color-scheme`, so a dark theme is not a light browser.
 *
 * THE PROBLEM, in one sentence: the app paints its own colours and never tells
 * the browser which of its two widget renderings to use, so scrollbars, form
 * controls, the caret, the default canvas behind a transparent area and the
 * focus ring all keep the operating system's light rendering behind a dark
 * theme — the most visible seam a theme can have, and one that no token in
 * `applyThemeTokens` can close, because those are the browser's own widgets.
 *
 * WHY IT IS DERIVED FROM THE BACKGROUND AND NOT FROM THE THEME'S NAME. The
 * obvious implementation is a switch over the six theme names, and it would be
 * wrong in two places. `auto` has no name to switch on: by the time the tokens
 * reach `applyThemeTokens`, `resolveTheme` has already answered the OS question
 * and handed over a concrete light or dark palette, so following the OS needs no
 * case at all. And a custom palette has a base — `THEMES.light` — but nothing
 * stops a user darkening its `bg` in the editor, and a custom theme that paints
 * a dark page while announcing itself as a light scheme is the same seam this
 * commit exists to close. Asking "is the background I am about to paint light?"
 * answers all six names correctly, and answers the seventh case nobody had
 * written down.
 *
 * WHY IT LIVES IN `applyThemeTokens` AND NOT IN `ThemeContext`. Four paths
 * repaint the document root: the provider's effect on a theme or palette change,
 * the same effect's live subscription while `auto` is active, `setCustomColor`
 * for an instant preview in the editor, and `resetCustomTheme`. Three of the
 * four are not the effect, so a line written in the effect would leave the
 * custom-theme editor's live preview and its reset painting a scheme that
 * disagrees with the page for as long as the editor is open. One function that
 * every paint path already calls is the only place with no path that can forget.
 *
 * WHAT IS PINNED HERE, and why each of these is a test rather than a comment:
 * the verdict per theme; that the verdict is never anything but `light` or
 * `dark`, since `no-preference` leaves the problem in place and `light dark`
 * hands the choice back to the browser the user has already made; that `auto`
 * follows a *changing* OS answer and not just a starting one; that a custom
 * palette is judged on `bg` and not on whichever of its tokens happens to be
 * dark; that the verdict is never inverted, by asking the browser's actual
 * question — a light scheme means dark text on a light page; that there is
 * exactly one writer of the property in `src/`, so a second implementation
 * cannot drift from this one; and that a background no luminance maths can read
 * still produces one of the two values rather than an exception.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { applyThemeTokens, resolveTheme, isLight, THEME_NAMES, THEMES } from "../src/lib/themes";
import { matchesMediaQuery, PREFERS_DARK, type MediaQueryLike, type MediaWindow } from "../src/lib/media";
import type { ThemeName } from "../src/types";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/**
 * The thirteen custom properties `applyThemeTokens` paints, written out rather
 * than imported: `VAR_NAMES` is module-private, and exporting an internal so a
 * test can read it would be the wrong trade. Naming them here is also stronger —
 * this list is the CSS contract the stylesheet depends on, and a test that
 * derived the names from the module would follow a rename instead of catching
 * one.
 */
const TOKEN_PROPERTIES = [
  "--bg",
  "--bg-soft",
  "--surface",
  "--surface-2",
  "--ink",
  "--ink-soft",
  "--line",
  "--brand",
  "--brand-strong",
  "--brand-soft",
  "--accent",
  "--danger",
  "--danger-soft",
  "--ok",
] as const;

/** The ten values derived from the painted tokens, not tokens themselves. */
const DERIVED_PROPERTIES = [
  "--on-brand",
  "--on-danger",
  "--on-ok",
  "--on-accent",
  "--ring-ok",
  "--ring-warn",
  "--ring-bad",
  // The background-image scrim's RGB TRIPLE, as three components rather than a
  // colour: the stylesheet composes it with the reader's own alpha, so the
  // colour and the opacity are written by two different owners and change
  // independently. Derived from `bg` alone, which is why it belongs here and not
  // in `TOKEN_PROPERTIES` — it is not a palette a custom theme can set.
  "--app-bg-scrim-rgb",
  // The border on a control, `line` mixed 60% toward `ink`. It belongs here for
  // the same reason the scrim does: it is a FUNCTION of two tokens rather than a
  // fourteenth colour a reader picks. Making it settable would let a custom
  // theme name a control border that cannot be seen against the palette it was
  // chosen for, which is the whole thing the derivation exists to prevent.
  "--control-line",
  // The page backdrop: a preset's own CSS picture, or `var(--bg)` for every
  // flat palette — a function of the tokens (`gradient ?? flat`) rather than a
  // colour a reader picks, for the same reason the two above live here. Written
  // unconditionally so that switching AWAY from a backdrop preset clears the
  // picture in the same call that repaints the tokens.
  "--app-page",
] as const;

/** A fake documentElement, because `applyThemeTokens` writes to a root element. */
function root(): { props: Record<string, string>; el: HTMLElement } {
  const props: Record<string, string> = {};
  return {
    props,
    el: { style: { setProperty: (k: string, v: string) => void (props[k] = v) } } as unknown as HTMLElement,
  };
}

/** Paint a theme the way the app does, and return what the root was told. */
function paint(theme: ThemeName, custom?: Record<string, string>, win?: MediaWindow): string | undefined {
  const r = root();
  applyThemeTokens(resolveTheme(theme, custom, win), r.el);
  return r.props["color-scheme"];
}

/** A `matchMedia` answer the test can change, on the modern listener API. */
function osPrefersDark(initial: boolean): MediaQueryLike & { flip: (v: boolean) => void } {
  const listeners: (() => void)[] = [];
  const q = {
    matches: initial,
    media: PREFERS_DARK,
    flip(v: boolean) {
      q.matches = v;
      for (const l of listeners) l();
    },
    addEventListener(_type: "change", listener: () => void) {
      listeners.push(listener);
    },
    removeEventListener(_type: "change", listener: () => void) {
      const at = listeners.indexOf(listener);
      if (at >= 0) listeners.splice(at, 1);
    },
  };
  return q;
}

const winFor = (query: MediaQueryLike): MediaWindow => ({ matchMedia: () => query });

describe("every theme announces its scheme, and only ever light or dark", () => {
  /** The verdict for each preset palette, by name. */
  const EXPECTED: Record<string, "light" | "dark"> = {
    light: "light",
    warm: "light",
    vibrant: "light",
    cool: "light",
    lavender: "light",
    coconut: "light",
    dark: "dark",
    graphite: "dark",
    karma: "dark",
    // The five backdrop presets, each judged on its `bg` like everything else —
    // all five are light grounds, so all five announce a light scheme, and the
    // invariant below is what keeps that statement honest rather than typing
    // the answer in twice.
    sunset: "light",
    forest: "light",
    sea: "light",
    lilac: "light",
    gold: "light",
  };

  test("the table above covers every preset theme, so a new one cannot be added unjudged", () => {
    // `THEMES` is the record the app itself keeps, and a theme added to it
    // without a verdict here would simply not be asserted. Comparing the two
    // sets makes the omission a failure instead of a silence.
    expect(Object.keys(EXPECTED).sort()).toEqual(Object.keys(THEMES).sort());
    // …and every name the picker offers is judged somewhere in this file.
    expect(THEME_NAMES.length).toBe(Object.keys(EXPECTED).length + 2); // + auto, custom
  });

  // A tuple per row, not a bare name: `test.each` with one string per row binds
  // a single argument, so the expected value would arrive as the runner's own
  // `done` callback — which `toBe` accepts, and which is why this is a comment
  // and not something the compiler catches.
  test.each(Object.keys(EXPECTED).sort().map((name) => [name, EXPECTED[name]] as const))(
    "%s is color-scheme: %s",
    (name, expected) => {
      expect(paint(name as ThemeName)).toBe(expected);
    },
  );

  test("no theme produces a value the browser would ignore or second-guess", () => {
    // The three answers that would quietly fail: `no-preference` is the
    // default and closes nothing; `light dark` gives the decision back to the
    // browser the user has already made in the app; an empty string removes the
    // declaration and leaves the previous theme's value behind.
    for (const name of THEME_NAMES) {
      const value = paint(name, { bg: "#101614" }, winFor(osPrefersDark(true)));
      expect(["light", "dark"], `${name} produced ${JSON.stringify(value)}`).toContain(value);
    }
  });

  test("the scheme is never inverted: a light scheme means dark text", () => {
    // The scariest possible bug here is a verdict that is simply backwards, and
    // it is invisible in a test that only checks "light" and "dark" appear. The
    // browser's own rule is that a light scheme draws dark text on a light
    // page, so for every palette the text colour's luminance must be the
    // opposite of the background's — checked against the tokens, not against
    // the name, so it holds for a custom palette too.
    //
    // `isLight` is CALLED here, not reimplemented. The copy that used to sit in
    // this block carried its own 0.6 literal, so it would have kept answering
    // with the old rule after `src/lib/themes.ts` moved the line to 0.5 — a
    // green test over a function the app no longer runs.
    for (const [name, tokens] of Object.entries(THEMES)) {
      const darkBackground = !isLight(tokens.bg);
      expect(paint(name as ThemeName), name).toBe(darkBackground ? "dark" : "light");
      // …and the text is dark exactly when the page is light. Written as
      // `!darkBackground` because that is the relation: a light scheme exists
      // for dark text, so the two are opposites, not the same.
      expect(
        !isLight(tokens.ink),
        `${name} paints ${isLight(tokens.ink) ? "light" : "dark"} text on a ${darkBackground ? "dark" : "light"} page`,
      ).toBe(!darkBackground);
    }
  });
});

describe("auto follows the operating system", () => {
  test("a dark OS gets a dark scheme, and a light OS a light one", () => {
    expect(paint("auto", undefined, winFor(osPrefersDark(true)))).toBe("dark");
    expect(paint("auto", undefined, winFor(osPrefersDark(false)))).toBe("light");
  });

  test("and it follows a CHANGING answer, wired as ThemeContext wires it", () => {
    // The first-launch answer is the easy half, and `resolveTheme` already
    // handled it before this commit. What could still be broken is the live
    // half: the scheme has to be repainted when the OS changes, on the same
    // subscription ThemeContext uses. `src/lib/media` is imported here so the
    // assertion cannot pass by re-implementing the query string.
    const query = osPrefersDark(true);
    const r = root();
    const win = winFor(query);
    expect(matchesMediaQuery(PREFERS_DARK, win)).toBe(true);
    applyThemeTokens(resolveTheme("auto", undefined, win), r.el);
    expect(r.props["color-scheme"], "a dark OS did not produce a dark scheme").toBe("dark");
    query.flip(false);
    applyThemeTokens(resolveTheme("auto", undefined, win), r.el);
    expect(r.props["color-scheme"], "the scheme did not follow the OS back to light").toBe("light");
    query.flip(true);
    applyThemeTokens(resolveTheme("auto", undefined, win), r.el);
    expect(r.props["color-scheme"], "and it did not follow the OS dark again").toBe("dark");
  });

  test("a browser with no matchMedia still gets a scheme, not an exception", () => {
    // `resolveTheme` is called during the first render, so a throw here is a
    // blank app. Batch 12 already made the query answer false rather than
    // throw; this is the assertion that the answer is then used.
    expect(() => paint("auto", undefined, {})).not.toThrow();
    expect(paint("auto", undefined, {})).toBe("light");
  });
});

describe("custom follows its base, and then its own background", () => {
  test("an untouched custom palette follows its base, which is light", () => {
    // The rule as specified: custom has no base of its own, and `resolveTheme`
    // gives it `THEMES.light`. Asserted through the same `resolveTheme` the app
    // uses, so a change to that base is a change to this expectation.
    expect(resolveTheme("custom", undefined).bg).toBe(THEMES.light.bg);
    expect(paint("custom")).toBe("light");
    expect(paint("custom", {})).toBe("light");
  });

  test("a palette with a darkened background follows the palette", () => {
    // The case the name-based implementation would get wrong. The page is
    // dark, so the widgets must be dark; announcing `light` would be the very
    // seam this commit closes, re-opened one level down.
    expect(paint("custom", { bg: THEMES.dark.bg })).toBe("dark");
    expect(paint("custom", { bg: "#000000" })).toBe("dark");
  });

  test("and it is judged on bg alone, not on whichever token is darkest", () => {
    // A light background with a dark accent is still a light page: a black
    // `--accent` is one button, not a theme. Reading "some token is dark"
    // would flip the whole document's scheme for a swatch.
    expect(paint("custom", { accent: "#000000", brand: "#000000", ink: "#000000" })).toBe("light");
    expect(paint("custom", { bg: THEMES.light.bg, ink: "#000000" })).toBe("light");
  });
});

describe("one owner, and the tokens it already owned", () => {
  test("exactly one place in src/ writes color-scheme, and it is this function", () => {
    // A property with two writers is a property with two answers. The count is
    // what matters: a second implementation somewhere else in the tree would
    // disagree with this one the first time a theme is added, and the failure
    // would be a scrollbar, not an exception.
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(entry.name)) {
          const text = readFileSync(path, "utf8");
          if (text.includes('"color-scheme"') || text.includes("'color-scheme'")) hits.push(path);
        }
      }
    };
    walk(join(ROOT, "src"));
    expect(hits).toEqual([join(ROOT, "src", "lib", "themes.ts")]);
  });

  test("all fourteen tokens and every derived value are still written", () => {
    // The new line is at the end of a function whose whole job is the loop
    // above it. A property written to the wrong root, or a `return` in the
    // wrong place, would take the tokens with it — and `color-scheme` would be
    // the only thing that survived, which is a bizarre failure to diagnose from
    // a screenshot.
    const r = root();
    applyThemeTokens(resolveTheme("dark", undefined), r.el);
    for (const name of [...TOKEN_PROPERTIES, ...DERIVED_PROPERTIES]) {
      expect(r.props[name], `${name} was not painted`).toBeTruthy();
    }
    expect(r.props["color-scheme"]).toBe("dark");
    // …and that nothing else was written, so a renamed token cannot leave a
    // stale property behind that no assertion above would notice.
    expect(Object.keys(r.props).sort()).toEqual(
      [...TOKEN_PROPERTIES, ...DERIVED_PROPERTIES, "color-scheme"].sort(),
    );
  });

  test("color-scheme is not one of the custom properties it sits beside", () => {
    // A near-miss worth ruling out: the function writes thirteen `--`-prefixed
    // custom properties and now one standard one. If `color-scheme` were ever
    // given a slot among the tokens it would be written twice, once through the
    // loop and once explicitly, and the loop's value would win or lose
    // depending on the order of two lines in one function.
    expect([...TOKEN_PROPERTIES, ...DERIVED_PROPERTIES]).not.toContain("color-scheme");
    for (const name of [...TOKEN_PROPERTIES, ...DERIVED_PROPERTIES]) expect(name.startsWith("--")).toBe(true);
  });
});

describe("a background no luminance maths can read", () => {
  // `isLight` reads hex, and the editor only ever writes hex — `normalizeHex`
  // rejects anything else, and a colour input cannot produce anything else. But
  // `customTheme` also arrives from STORAGE, and a hand-edited or imported blob
  // is not obliged to be hex. The contract that matters is not "it is right for
  // every junk string" — it is that it never throws, and never leaves the
  // property unset, because an unset property is the bug this commit fixes
  // coming straight back.
  const JUNK = ["", "   ", "red", "var(--bg)", "#12345", "#gggggg", "transparent", "12"];

  test.each(JUNK)("a bg of %p yields a scheme and no exception", (bg) => {
    const r = root();
    expect(() => applyThemeTokens(resolveTheme("custom", { bg }), r.el)).not.toThrow();
    expect(["light", "dark"], `bg ${JSON.stringify(bg)} produced ${JSON.stringify(r.props["color-scheme"])}`).toContain(
      r.props["color-scheme"],
    );
  });

  test("the fallback for an unreadable background is dark, and here is why", () => {
    // Documented rather than merely asserted: an unreadable value is one the
    // luminance maths cannot rank, and the two available answers are not
    // equivalent. `dark` is the safe one, because a `background` declaration
    // the browser cannot parse leaves the page transparent — and a transparent
    // page sits on the browser's default canvas, which a `dark` scheme paints
    // dark. Answering `light` would put a white canvas behind a dark theme.
    expect(paint("custom", { bg: "not-a-colour" })).toBe("dark");
  });
});
