import type { CustomTheme, CustomThemeKey, ThemeName } from "../types";
import { matchesMediaQuery, type MediaWindow } from "./media";
import { PREFERS_DARK } from "./media";

/**
 * The sixteen entries the picker offers, in the order it offers them: fourteen
 * concrete palettes (nine flat, five carrying their own page backdrop) plus the
 * two special modes (follow the OS, edit your own).
 *
 * This is the list `lib/store` validates a stored `settings.theme` against,
 * so it lives next to the tokens rather than in the store: a theme that is not
 * in here does not exist, and the two places that have to agree can only
 * disagree if one of them is edited alone.
 */
export const THEME_NAMES = [
  "auto",
  "light",
  "dark",
  "warm",
  "vibrant",
  "cool",
  "graphite",
  "lavender",
  "coconut",
  "karma",
  "sunset",
  "forest",
  "sea",
  "lilac",
  "gold",
  "custom",
] as const;

/** True for a value the picker can produce, and for nothing else. */
export function isThemeName(value: unknown): value is ThemeName {
  return typeof value === "string" && (THEME_NAMES as readonly string[]).includes(value);
}

/**
 * Design tokens for the whole app. Each theme is a flat set of CSS custom
 * property names → values; switching a theme swaps the variables on the app
 * root, so every screen updates instantly without a restart.
 *
 * `gradient` is the one key that is NOT one of the fourteen colour tokens: it
 * is an optional CSS image the preset owns as its page backdrop, and it is part
 * of the token record on purpose — `applyThemeTokens` receives nothing but the
 * resolved tokens, so a backdrop that lived beside this record would have to be
 * looked up by theme NAME, and `auto` and `custom` arrive here with no name that
 * identifies a palette. Writing it from the tokens means every paint path the
 * app has (the provider, the OS subscription, the editor's live preview, the
 * reset) carries the backdrop with them for free, and a theme without one is
 * the ordinary flat page: `tokens.gradient` is `undefined`, `--app-page` falls
 * back to `var(--bg)`, and nothing about the flat themes changes.
 *
 * It is deliberately NOT a `CustomThemeKey`: the backdrop is authored with the
 * palette (its stops are asserted against this palette's own inks in
 * `tests/contrast.test.ts`), so the custom editor — which offers the colour
 * tokens alone — cannot end up promising a picture nobody measured.
 */
export type ThemeTokens = Record<CustomThemeKey, string> & { gradient?: string };

export const THEMES: Record<Exclude<ThemeName, "custom" | "auto">, ThemeTokens> = {
  light: {
    bg: "#f4f1e8",
    bgSoft: "#ece7da",
    surface: "#fffdf7",
    surface2: "#f7f4ec",
    ink: "#24312d",
    inkSoft: "#5b6660",
    line: "#dcd6c6",
    brand: "#0d5c4d",
    brandStrong: "#08453a",
    brandSoft: "#e3efeb",
    accent: "#d97706",
    danger: "#b3424f",
    dangerSoft: "#f6e7e3",
    ok: "#2e7950",
  },
  dark: {
    bg: "#101614",
    bgSoft: "#18211d",
    surface: "#1b2420",
    surface2: "#232e29",
    ink: "#e8ece9",
    inkSoft: "#9fb0a8",
    line: "#34423b",
    brand: "#5ec3a6",
    brandStrong: "#8adcc4",
    brandSoft: "#1f3a32",
    accent: "#f0a84b",
    danger: "#e07a86",
    dangerSoft: "#332e2c",
    ok: "#6fce97",
  },
  warm: {
    bg: "#f8f0e3",
    bgSoft: "#f2e4cf",
    surface: "#fffaf1",
    surface2: "#f9efe0",
    ink: "#3a2d22",
    inkSoft: "#746453",
    line: "#e4d5bd",
    brand: "#af531e",
    brandStrong: "#8f3f13",
    brandSoft: "#f7e6d8",
    accent: "#b88a04",
    danger: "#af4637",
    dangerSoft: "#f5e4db",
    ok: "#4e7533",
  },
  vibrant: {
    bg: "#f3f1fd",
    bgSoft: "#e9e5fb",
    surface: "#ffffff",
    surface2: "#f4f1ff",
    ink: "#221a3a",
    inkSoft: "#625c86",
    line: "#d8d2f0",
    brand: "#5b3df5",
    brandStrong: "#3f28c9",
    brandSoft: "#e9e3ff",
    accent: "#a31e72",
    danger: "#bd3065",
    dangerSoft: "#f7e6ed",
    ok: "#20763f",
  },
  //
  // The five palettes below widened the picker from four presets to nine. Each
  // was built by the same rule as the original four — pick the hues, then
  // DERIVE nothing by hand that a test will recompute: the 19 text pairs, the
  // control border, the badge floors and the merged foreground are all
  // asserted against these hexes before the palette is allowed to stand. Each
  // one also owns a background and a `dangerSoft` no other theme uses, so the
  // uniqueness guards in `tests/contrast.test.ts` hold.
  cool: {
    // A slate-blue light palette: the cool counterpart to `warm`, same
    // structural lightness, hue swung from sand to blue-grey.
    bg: "#eef3f7",
    bgSoft: "#e3eaf1",
    surface: "#fbfdff",
    surface2: "#f2f6fa",
    ink: "#1d2a33",
    inkSoft: "#5b6b77",
    line: "#cfd9e1",
    brand: "#1d5f8c",
    brandStrong: "#124666",
    brandSoft: "#e2edf5",
    accent: "#0e7490",
    danger: "#a93d48",
    dangerSoft: "#f6e7ea",
    ok: "#2e7a52",
  },
  graphite: {
    // True dark grey rather than `dark`'s green-black: the near-monochrome
    // preset, neutral surfaces and a bright near-white brand so the accent
    // does the colour work by itself.
    bg: "#17171a",
    bgSoft: "#1f1f23",
    surface: "#242428",
    surface2: "#2c2c31",
    ink: "#e9e9ec",
    inkSoft: "#a4a4ad",
    line: "#3c3c43",
    brand: "#9d9da8",
    brandStrong: "#c4c4cd",
    brandSoft: "#33333a",
    accent: "#e0b64f",
    danger: "#e58b8b",
    dangerSoft: "#372b2b",
    ok: "#7fc98f",
  },
  lavender: {
    // Deeper and less saturated than `vibrant`'s violet: a soft dusk palette
    // where the ink is a dark plum instead of near-black.
    bg: "#f4f1f7",
    bgSoft: "#ebe6f1",
    surface: "#fdfcff",
    surface2: "#f6f3fa",
    ink: "#2b2440",
    inkSoft: "#635b7d",
    line: "#dbd4e7",
    brand: "#6a4fb6",
    brandStrong: "#4f3892",
    brandSoft: "#ece6fa",
    accent: "#8c3e78",
    danger: "#a83a55",
    dangerSoft: "#f7e6ec",
    ok: "#2c7d52",
  },
  coconut: {
    // The near-white preset: every surface above pure white, so cards read as
    // paper laid on paper. Brand is a deep teal-green for a crisp accent.
    bg: "#f9fbfa",
    bgSoft: "#f0f4f2",
    surface: "#ffffff",
    surface2: "#f5f8f7",
    ink: "#1a2622",
    inkSoft: "#5c6a65",
    line: "#d3dbd7",
    brand: "#12695a",
    brandStrong: "#0b4c41",
    brandSoft: "#e2f0ec",
    accent: "#a8540a",
    danger: "#b23f4a",
    dangerSoft: "#f7e7e8",
    ok: "#2e8052",
  },
  karma: {
    // The dark warm preset: a near-black brown ground that `dark`'s green
    // cannot cover, with terracotta as the brand — the same role `warm`
    // plays on light, at night.
    bg: "#191411",
    bgSoft: "#221b17",
    surface: "#27201b",
    surface2: "#302721",
    ink: "#efe7e0",
    inkSoft: "#b3a59a",
    line: "#453830",
    brand: "#e0955c",
    brandStrong: "#f0b587",
    brandSoft: "#3a2a1f",
    accent: "#d9b44a",
    danger: "#e88b83",
    dangerSoft: "#3b2c29",
    ok: "#8cc98f",
  },
  //
  // The five presets below are the ones readers asked for by name, and they
  // differ from every palette above in ONE way: each carries its own page
  // backdrop as a CSS `gradient` — a picture made of colour, shipped in the
  // token record (see the type above for why it lives there), never a photograph.
  //
  // THE STOPS ARE PALE ON PURPOSE, and that is a contrast requirement rather
  // than a taste one. The backdrop is where section headings, links, chips and
  // — at full card transparency — every card's own words stand, so each stop
  // must clear AA against this palette's inks AND every interpolated colour
  // between the stops must too: `tests/contrast.test.ts` samples each gradient
  // at 21 points per segment and asserts the whole run, including the two
  // inks `.app.contrast-high` swaps in. Keeping the stops in the 0.75+ luminance
  // band while letting their HUES travel (orange→rose→lilac, green→brown,
  // aqua→blue, lilac→pink, champagne→gold) is what makes the backdrop visible
  // without ever putting a word on a ground that cannot carry it.
  //
  // Every other number here follows the same rule as the nine above: nothing
  // was derived by hand that the guards recompute — the 19 text pairs, the
  // control border, the badge floors, the merged foregrounds and the
  // color-scheme verdict are all asserted against these hexes, and
  // `contrast.test.ts` holds the gradient stops to AA as well.
  sunset: {
    // Naplemente — warm orange→rose→lilac, the sky in three bands. Light
    // polarity like `warm`, the ink a dark plum-brown, the brand a coral-red.
    bg: "#fdf0e7",
    bgSoft: "#f9e5da",
    surface: "#fffaf7",
    surface2: "#fceee6",
    ink: "#3d2733",
    inkSoft: "#71566a",
    line: "#ead0c0",
    brand: "#a53d3e",
    brandStrong: "#8f3231",
    brandSoft: "#fae6e2",
    accent: "#b8860b",
    danger: "#a93742",
    dangerSoft: "#f9e7e6",
    ok: "#1f6844",
    gradient: "linear-gradient(165deg, #fdeade 0%, #fce3da 48%, #f5e0f2 100%)",
  },
  forest: {
    // Erdő — mossy green on a brown-tinted cream: the forest floor rather
    // than the canopy. Bronze accent, deep-green brand.
    bg: "#eff1e4",
    bgSoft: "#e5e9d6",
    surface: "#fbfcf6",
    surface2: "#f2f5ea",
    ink: "#26301f",
    inkSoft: "#55614a",
    line: "#d3dac3",
    brand: "#1f6b3d",
    brandStrong: "#14512e",
    brandSoft: "#e3efe3",
    accent: "#8a5a1e",
    danger: "#b0393f",
    dangerSoft: "#f7e7e2",
    ok: "#35703a",
    gradient: "linear-gradient(170deg, #f1f3e4 0%, #e6eed8 45%, #eee7d3 100%)",
  },
  sea: {
    // Tenger — fresh aqua→turquoise: the cool family's clarity with a
    // teal brand and the sea's own blue for the accent.
    bg: "#eaf4f5",
    bgSoft: "#dfeef0",
    surface: "#f8fdfd",
    surface2: "#eef7f8",
    ink: "#17303a",
    inkSoft: "#4e6a74",
    line: "#c4d9de",
    brand: "#0e6b80",
    brandStrong: "#0a5163",
    brandSoft: "#dfeef2",
    accent: "#0e7490",
    danger: "#ae3d4e",
    dangerSoft: "#f8eaeb",
    ok: "#1f6a55",
    gradient: "linear-gradient(160deg, #e9f5f5 0%, #dceef4 55%, #d6ecf3 100%)",
  },
  lilac: {
    // Levendula, lágy változat — softer and pinker than the deeper `lavender`
    // above: a rose-tinted lilac where that one is a dusk plum. The two sit
    // next to each other in the picker with distinct labels for that reason.
    bg: "#f7f1f8",
    bgSoft: "#efe7f2",
    surface: "#fdfbff",
    surface2: "#f7f2fb",
    ink: "#2f2545",
    inkSoft: "#655b80",
    line: "#ddd3ea",
    brand: "#704da6",
    brandStrong: "#553a8c",
    brandSoft: "#efe7fb",
    accent: "#a8477c",
    danger: "#9f3450",
    dangerSoft: "#f8e9ee",
    ok: "#1e6648",
    gradient: "linear-gradient(160deg, #f8eff9 0%, #f3e7f6 50%, #f8e6f1 100%)",
  },
  gold: {
    // Arany — champagne paper with a brown-gold brand: the elegant light
    // counterpart to `karma`, gold as the accent rather than the ground.
    bg: "#faf5e8",
    bgSoft: "#f3ecd9",
    surface: "#fffdf6",
    surface2: "#f8f3e4",
    ink: "#33291a",
    inkSoft: "#6b5f45",
    line: "#e3d7b4",
    brand: "#7d5f10",
    brandStrong: "#5f4a0b",
    brandSoft: "#f2ead2",
    accent: "#b58a12",
    danger: "#a8453a",
    dangerSoft: "#faece1",
    ok: "#3a6a22",
    gradient: "linear-gradient(165deg, #faf4e4 0%, #f6ecd2 50%, #f1e7c9 100%)",
  },
};

/** CSS variable names emitted by `applyTheme`. */
const VAR_NAMES: Record<CustomThemeKey, string> = {
  bg: "--bg",
  bgSoft: "--bg-soft",
  surface: "--surface",
  surface2: "--surface-2",
  ink: "--ink",
  inkSoft: "--ink-soft",
  line: "--line",
  brand: "--brand",
  brandStrong: "--brand-strong",
  brandSoft: "--brand-soft",
  accent: "--accent",
  danger: "--danger",
  dangerSoft: "--danger-soft",
  ok: "--ok",
};

/** Resolve the tokens for a theme, merging user overrides for "custom".
 *  "auto" follows the system light/dark preference.
 *
 *  `win` exists so the auto branch can be tested against a fake window, the
 *  same way `lib/navAutoHide`'s `createAutoHide(win, options)` is. Omitted, it
 *  is the real one; nothing in the app passes it. */
export function resolveTheme(
  name: ThemeName,
  custom: CustomTheme | undefined,
  win?: MediaWindow,
): ThemeTokens {
  if (name === "auto") {
    // The same query string, and the same reader, as the subscription that
    // keeps this answer live — see `lib/media` for why there is only one copy.
    return { ...THEMES[matchesMediaQuery(PREFERS_DARK, win) ? "dark" : "light"] };
  }
  const base = name === "custom" ? THEMES.light : THEMES[name];
  if (name !== "custom" || !custom) return { ...base };
  return { ...base, ...custom };
}

/**
 * Perceived luminance of a hex color — picks readable text on it.
 *
 * Exported, and that is the point rather than a convenience: "is this
 * background light" is a question the codebase must answer in ONE place, and
 * `lib/imageBackground` now asks it too, when it decides which half of the
 * scrim colour space the picture's tint is allowed to live in. A second copy
 * would agree with this one until the day it did not, and that day would be a
 * light scrim under dark text, or a `color-scheme` that disagreed with the
 * page. Everything else in here — the `--on-*` foregrounds, `color-scheme`, the
 * scrim polarity — keeps calling the same function.
 *
 * THE LINE IS AT 0.5, and that is a contrast number rather than a taste one.
 * The caller that matters is `on()` below, which picks `#16211d` or `#ffffff`
 * for text sitting on a filled token, so the line is exactly where the better
 * foreground changes sides. At 0.6 it put the amber accents on white text:
 * `#d97706` in the light theme measures 3.19 against white and 5.19 against the
 * dark ink, and the warm amber measured 2.65 and 6.23 when it was still
 * `#c99700`. Both ambers sat at 0.53 and 0.58 — mid-tone colours that are dark
 * enough to want dark text and light enough to be called dark. The warm one has
 * since been darkened to `#b88a04` for contrast of its own, and is now 5.26
 * against the dark ink; it is still on the same side of the line, which is the
 * margin worth having, because one more step toward ink would cross 0.5 and hand
 * the amber its own colour as a foreground. `tests/contrast.test.ts` computes
 * every pair this function produces and holds all sixteen of them at 4.5 or
 * better.
 */
export function isLight(hex: string): boolean {
  const m = hex.replace("#", "");
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5;
}

/**
 * Mix two hex colours in sRGB — the arithmetic CSS `color-mix()` performs.
 *
 * Exported for the same reason `isLight` above is, and it is the same hazard it
 * was written to prevent: the guard that checks `--control-line` clears 3:1 has
 * to be able to run this rather than trust a hex typed into a test file, and a
 * second copy of the mix would agree with this one until the day it did not.
 *
 * `pct` is how much of `b` lands in the result — 0 returns `a`, 100 returns `b`.
 * The channels are averaged WITHOUT gamma correction on purpose. Correct
 * perceptual mixing would look marginally better, but the one percentage that
 * uses this was measured against this arithmetic, and a guard cannot check a
 * rule it cannot reproduce.
 */
export function mixHex(a: string, b: string, pct: number): string {
  const channels = (hex: string) => {
    const m = hex.replace("#", "");
    return [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16) || 0);
  };
  const [x, y] = [channels(a), channels(b)];
  const t = pct / 100;
  return (
    "#" +
    x
      .map((v, i) =>
        Math.round(Math.min(255, Math.max(0, v * (1 - t) + y[i]! * t)))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

/** Map theme tokens to the CSS custom properties the stylesheet consumes. */
export function applyThemeTokens(tokens: ThemeTokens, root: HTMLElement = document.documentElement) {
  for (const key of Object.keys(VAR_NAMES) as CustomThemeKey[]) {
    root.style.setProperty(VAR_NAMES[key], tokens[key]);
  }
  // Readable foreground for each filled surface, so dark themes keep contrast.
  const on = (hex: string) => (isLight(hex) ? "#16211d" : "#ffffff");
  root.style.setProperty("--on-brand", on(tokens.brand));
  root.style.setProperty("--on-danger", on(tokens.danger));
  root.style.setProperty("--on-ok", on(tokens.ok));
  root.style.setProperty("--on-accent", on(tokens.accent));
  // Chart + ring colors read these too.
  root.style.setProperty("--ring-ok", tokens.brand);
  root.style.setProperty("--ring-warn", tokens.accent);
  root.style.setProperty("--ring-bad", tokens.danger);
  // The border on a control — a text field, the toggle track, a mood button —
  // which is a different job from `--line` and cannot share its colour.
  // `--line` is a hairline that SEPARATES PANELS and is meant to stay quiet;
  // a control border has to be visible enough to find and click a control,
  // which is WCAG 1.4.11's 3:1 and not a matter of taste. Measured against the
  // ground each of those rules actually sits on, `--line` runs 1.15 to 1.33
  // across the four presets, so the border identified nothing at all.
  //
  // Sixty percent toward `--ink` rather than a stored hex per palette, because
  // it DERIVES: a custom theme the reader builds in Settings gets a control
  // border following their own `--line` and `--ink` instead of inheriting the
  // light theme's. Both endpoints share a hue, so the mix keeps it. Across the
  // four presets and `.app.contrast-high` this lands between 3.84 and 9.35 —
  // `tests/contrast.test.ts` recomputes all of it rather than trusting the
  // number, and holds the stylesheet's two hand-written defaults to the same
  // rule so they cannot drift from this one.
  root.style.setProperty("--control-line", mixHex(tokens.line, tokens.ink, 60));
  // The PAGE BACKDROP, as a CSS image where the preset owns one and the flat
  // background everywhere else. `body` reads `var(--app-page, var(--bg))`, so
  // this one line is the whole delivery mechanism: a preset that carries a
  // backdrop arrives with its tokens, and every paint path the app has — the
  // provider's effect, the OS subscription under `auto`, the custom editor's
  // live preview, the reset — already runs through this function.
  //
  // `var(--bg)` rather than the hex, so a custom palette's edited background
  // (and the stylesheet's own first-frame default) reaches the page with no
  // second writer: flat themes paint exactly what they painted before this
  // property existed, which is the whole claim for them.
  //
  // What it deliberately does NOT do: paint anywhere near a photograph. Under
  // `.has-bg` the app root paints `--app-page-flat` (declared at `:root`), so
  // the picture keeps the flat ground its ink decision was measured against —
  // see `src/styles.css` where the two properties are declared.
  root.style.setProperty("--app-page", tokens.gradient ?? "var(--bg)");
  // The scrim that sits between a custom background IMAGE and the content, as
  // an RGB TRIPLE rather than a colour: the stylesheet composes it into two
  // `rgba(var(--app-bg-scrim-rgb), var(--app-bg-scrim-alpha))` layers, and the
  // alpha is the reader's own slider value, which changes without the theme.
  //
  // The triple takes the theme's POLARITY — white for a light theme, black for a
  // dark one — so a light theme gets a light scrim and keeps its dark ink, and a
  // dark theme gets a dark scrim and keeps its light ink. Those two cannot come
  // apart, which is the whole guarantee at this stage. What is deliberately NOT
  // here yet is the per-pixel part: nothing samples the picture, so the scrim is
  // strong enough for an average image and not guaranteed for a pathological
  // one. `lib/contrast.ts` replaces this one line when it lands.
  root.style.setProperty("--app-bg-scrim-rgb", isLight(tokens.bg) ? "255, 255, 255" : "0, 0, 0");
  // The one STANDARD property this function writes, and the one that closes the
  // most visible seam a theme can have: `color-scheme` is what tells the browser
  // which of its own two widget renderings to use, for scrollbars, form
  // controls, the caret, the default canvas behind a transparent area and the
  // focus ring. None of those are painted by a token above, so without this line
  // a dark theme is a dark page inside a light browser.
  //
  // It is derived from the RESOLVED background rather than from the theme's
  // name, which is what makes two of the cases correct for free. `auto` has
  // already been resolved to a concrete light or dark palette by `resolveTheme`
  // by the time it arrives here, so following the OS needs no case of its own;
  // and a custom palette whose `bg` the user darkened follows the palette,
  // which is the only answer that matches what is on screen. Deciding it by
  // name instead would need three branches to say what one comparison says.
  //
  // It reuses `isLight`, so the codebase has ONE definition of what "a light
  // colour" means, and the `--on-*` foregrounds above and the browser's own
  // widget rendering can never disagree about a background. The 0.5 threshold
  // is not a close call for any palette: the four preset backgrounds sit at
  // 0.94 (light), 0.93 (warm), 0.87 (vibrant) and 0.08 (dark) — the nearest is
  // 0.37 away from the line.
  root.style.setProperty("color-scheme", isLight(tokens.bg) ? "light" : "dark");
}

/** Static preview chips shown in the theme picker. */
export function themeMeta(): { name: ThemeName; label: string; swatch: string[] }[] {
  return [
    { name: "auto", label: "Auto (rendszer)", swatch: [THEMES.light.bg, THEMES.dark.surface, THEMES.dark.brand] },
    { name: "light", label: "Világos", swatch: [THEMES.light.bg, THEMES.light.surface, THEMES.light.brand] },
    { name: "dark", label: "Sötét", swatch: [THEMES.dark.bg, THEMES.dark.surface, THEMES.dark.brand] },
    { name: "warm", label: "Meleg", swatch: [THEMES.warm.bg, THEMES.warm.surface, THEMES.warm.brand] },
    { name: "vibrant", label: "Üde", swatch: [THEMES.vibrant.bg, THEMES.vibrant.surface, THEMES.vibrant.brand] },
    { name: "cool", label: "Hűvös", swatch: [THEMES.cool.bg, THEMES.cool.surface, THEMES.cool.brand] },
    { name: "graphite", label: "Grafit", swatch: [THEMES.graphite.bg, THEMES.graphite.surface, THEMES.graphite.brand] },
    { name: "lavender", label: "Levendula", swatch: [THEMES.lavender.bg, THEMES.lavender.surface, THEMES.lavender.brand] },
    { name: "coconut", label: "Kókusz", swatch: [THEMES.coconut.bg, THEMES.coconut.surface, THEMES.coconut.brand] },
    { name: "karma", label: "Karma", swatch: [THEMES.karma.bg, THEMES.karma.surface, THEMES.karma.brand] },
    // The five backdrop presets. The chips show the palette's own three colours
    // like every other row — the backdrop itself is the page you get after
    // picking one, not a thumbnail of it.
    { name: "sunset", label: "Naplemente", swatch: [THEMES.sunset.bg, THEMES.sunset.surface, THEMES.sunset.brand] },
    { name: "forest", label: "Erdő", swatch: [THEMES.forest.bg, THEMES.forest.surface, THEMES.forest.brand] },
    { name: "sea", label: "Tenger", swatch: [THEMES.sea.bg, THEMES.sea.surface, THEMES.sea.brand] },
    // "Levendula lágy" rather than a second "Levendula": the deeper preset
    // above already owns that name, and two chips with one label is a picker
    // that cannot be used. The descriptor is the one the request used.
    { name: "lilac", label: "Levendula lágy", swatch: [THEMES.lilac.bg, THEMES.lilac.surface, THEMES.lilac.brand] },
    { name: "gold", label: "Arany", swatch: [THEMES.gold.bg, THEMES.gold.surface, THEMES.gold.brand] },
    { name: "custom", label: "Saját", swatch: [THEMES.light.accent, THEMES.light.brand, THEMES.vibrant.brand] },
  ];
}
