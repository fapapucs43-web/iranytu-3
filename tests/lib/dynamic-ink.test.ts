/**
 * THE INK THAT FOLLOWS THE PICTURE — computed, not asserted.
 *
 * The claim a reader makes about this feature is "the text stays readable, and
 * it changes when the picture needs it to". Both halves are numbers, so both are
 * measured here rather than eyeballed in a screenshot:
 *
 *  - every theme × every veil × every card transparency × a bright and a dark
 *    picture, with the ground composed by the SAME `groundWithPicture` the app
 *    composites with, and the ink chosen by the same `pickDynamicInk`;
 *  - the chosen ink is the one with the highest WORST-case contrast, which is a
 *    property that holds even when AA is out of reach, so the suite can state
 *    the guarantee precisely instead of rounding it up;
 *  - and where AA IS reachable — the picture in front of the reader, on its
 *    own — it is reached.
 *
 * The last pair is the interesting one, and it is why `pickDynamicInk` returns
 * `meetsAA` instead of hiding it. One ink cannot be readable over a photograph
 * that contains both a true black and a true white: the veil is the reader's
 * control for that, and a test that promised otherwise would be promising
 * something arithmetic refuses.
 *
 * No canvas here, by the repository's standing rule — so the SAMPLING is pinned
 * as wiring (it is a DOM API, and a markup-only test cannot see it), while every
 * decision it feeds is exercised for real.
 *
 * THE EXCEPTION, AND WHY IT EXISTS. A mutation proof over this feature put a
 * constant in where the hook hands `averageRelativeLuminance` its pixels, and
 * the whole suite stayed green: every pin above survives that, because the pin
 * is on the CANVAS and not on the number that comes out of it. So the sampling
 * itself is now exercised against a canvas double — no jsdom, no dependency, six
 * lines of stand-in — and the pixels decide the answer rather than the source
 * text. The pins stay: they still catch the decode being dropped.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  HOSTILE_LUMINANCES,
  PICTURE_BANDS,
  WORST_REGION_RANGE,
  averageRelativeLuminance,
  dynamicInkCandidates,
  groundsFor,
  inkToCss,
  pickDynamicInk,
  pixelLuminance,
  prefersDarkInk,
  readableBrand,
  LUMINANCE_SAMPLE,
  slicePicture,
  softInk,
  visibleBands,
  visibleCrop,
  worstContrast,
  worstRegion,
  type PictureSample,
  type SampledRegion,
} from "../../src/lib/dynamicInk";
import {
  VEIL_AA_STEPS,
  cardGroundRgb,
  effectiveVeil,
  followsDocumentBackdrop,
  groundWithPicture,
  pageGroundRgb,
  veilForAA,
  worstCasePicture,
  worstCaseScrimRgb,
  type ScrimPalette,
} from "../../src/lib/imageBackground";
import { THEMES, isLight } from "../../src/lib/themes";
import { decideDynamicInk, measurePicture } from "../../src/state/useDynamicInk";
import { WCAG_TEXT, contrastRatio, parseHexRgb, relativeLuminance, type Rgb } from "../../src/lib/contrast";

const HOOK_SRC = readFileSync("src/state/useDynamicInk.ts", "utf8");
const APP_SRC = readFileSync("src/App.tsx", "utf8");
const STYLES_SRC = readFileSync("src/styles.css", "utf8");
const PICKER_SRC = readFileSync("src/components/BackgroundImagePicker.tsx", "utf8");
const SETTINGS_SRC = readFileSync("src/views/SettingsView.tsx", "utf8");

const THEME_NAMES = Object.keys(THEMES);
const PALETTES: ScrimPalette[] = ["image", "theme"];
const STEPS = 20;
const veils = Array.from({ length: STEPS + 1 }, (_, i) => i / STEPS);
const transparencies = Array.from({ length: STEPS + 1 }, (_, i) => i / STEPS);

/** Solid colours, so the polarity tests say "bright" and mean it. */
const BRIGHT: Rgb = [244, 244, 240];
const DARK: Rgb = [18, 20, 24];

const token = (theme: string, key: string): Rgb => {
  const colour = parseHexRgb(THEMES[theme as keyof typeof THEMES][key as keyof typeof THEMES]);
  if (!colour) throw new Error(`${theme} has no parseable --${key}`);
  return colour;
};

/** An RGBA buffer of one flat colour, as `getImageData` would hand it over. */
const pixelsOf = (rgb: Rgb): number[] => [rgb[0], rgb[1], rgb[2], 255];

/**
 * A canvas double, so `measurePicture` can be exercised without a DOM.
 *
 * Deliberately thin — a canvas with `getContext`, a context with `drawImage`
 * and `getImageData`, an `Image` whose `src` fires `onload` — and it hands
 * back pixels the test chooses, so the assertion is about the arithmetic and
 * not about the browser. It lives at module scope because two suites now read
 * pixels through it: the sampling's own, and the worst-region P1 below, whose
 * whole point is that DIFFERENT pixels produce a different decision.
 *
 * `measurePicture` guards on `typeof document` and `typeof Image`, so both
 * globals have to exist and both are restored afterwards: the globals are
 * process-wide, and a leaked fake canvas would be a lie every later file
 * believes.
 */
const withFakeCanvas = (rgba: number[], noContext = false): (() => void) => {
  const globals = globalThis as unknown as Record<string, unknown>;
  const hadDocument = "document" in globals;
  const hadImage = "Image" in globals;
  const previousDocument = globals["document"];
  const previousImage = globals["Image"];

  globals["document"] = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () =>
        noContext
          ? null
          : {
              drawImage: () => {},
              getImageData: () => ({ data: new Uint8ClampedArray(rgba) }),
            },
    }),
  };
  globals["Image"] = class {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) {
      // A microtask, not a direct call: the hook assigns `onload` before it
      // assigns `src`, and a synchronous fire would race that ordering.
      queueMicrotask(() => this.onload?.());
    }
  };

  return () => {
    if (hadDocument) globals["document"] = previousDocument;
    else delete globals["document"];
    if (hadImage) globals["Image"] = previousImage;
    else delete globals["Image"];
  };
};

/**
 * The decision the app makes, rebuilt from the exported parts.
 *
 * TWO grounds, and the veil is SEARCHED rather than assumed: the decision is
 * handed the card's composite and the page's — the two places words are painted —
 * and `veilForAA` finds the first veil at which some ink reads on both. The
 * reader's own number is kept whenever it already works, which is why the
 * helper starts at `effectiveVeil` rather than at zero.
 *
 * `extraGrounds` adds the app's adversarial picture back, for the test below
 * that measures what a third ground would do to the reader's own two.
 */
function decide(
  theme: string,
  picture: Rgb,
  veil: unknown,
  t: number,
  palette: ScrimPalette,
  extraGrounds = false,
) {
  const light = isLight(THEMES[theme as keyof typeof THEMES].bg);
  const scrim = worstCaseScrimRgb(light, palette);
  const surface = token(theme, "surface");
  const candidates = dynamicInkCandidates(
    token(theme, "ink"),
    token(theme, "bg"),
    prefersDarkInk(averageRelativeLuminance(pixelsOf(picture))),
  );
  // The FLOORED veil, because the root paints `effectiveVeil` — a helper that
  // composed the reader's raw slider would describe a surface the browser
  // stopped painting in the veil-floor batch — and then the AA floor on top of
  // it, which is the veil the app actually paints.
  const painted = veilForAA({
    candidates,
    surface,
    scrim,
    picture,
    cardTransparency: t,
    base: effectiveVeil(veil, t),
  });
  const grounds: Rgb[] = [
    groundWithPicture(surface, scrim, painted, picture, t),
    pageGroundRgb(surface, scrim, painted, picture),
  ];
  if (extraGrounds) {
    grounds.push(groundWithPicture(surface, scrim, painted, worstCasePicture(light), t));
  }
  const decision = pickDynamicInk(candidates, grounds);
  if (!decision) throw new Error("no ink at all");
  return { ...decision, candidates, grounds, veil: painted };
}

describe("the picture's own brightness, measured", () => {
  test("a white picture measures near 1 and a black one near 0", () => {
    expect(averageRelativeLuminance(pixelsOf([255, 255, 255]))).toBeCloseTo(1, 5);
    expect(averageRelativeLuminance(pixelsOf([0, 0, 0]))).toBeCloseTo(0, 5);
  });

  test("it is an AVERAGE, so a half-and-half picture lands in between", () => {
    const half = [...pixelsOf([255, 255, 255]), ...pixelsOf([0, 0, 0])];
    const mean = averageRelativeLuminance(half);
    expect(mean).toBeGreaterThan(0.2);
    expect(mean).toBeLessThan(0.8);
  });

  test("a real pixel buffer is read in order, not sampled by stride", () => {
    // Two pixels, one red and one blue, in that order. A stride bug would
    // report only the first, and the average would be red.
    const buffer = [255, 0, 0, 255, 0, 0, 255, 255];
    const mean = averageRelativeLuminance(buffer);
    const expected =
      (0.2126 * 1 + 0.7152 * 0 + 0.0722 * 0 + (0.2126 * 0 + 0.7152 * 0 + 0.0722 * 1)) / 2;
    expect(mean).toBeCloseTo(expected, 6);
  });

  test("an empty or short buffer answers 0, never NaN", () => {
    // The failure this guards: NaN reaching a CSS colour, which paints as black
    // and leaves a reader with black text on their own photograph.
    expect(averageRelativeLuminance([])).toBe(0);
    expect(averageRelativeLuminance([255, 255])).toBe(0);
    expect(Number.isNaN(averageRelativeLuminance([]))).toBe(false);
  });

  test("the grounds a decision must survive are the measurement and the extremes", () => {
    expect(groundsFor(0.42)).toEqual([0.42, ...HOSTILE_LUMINANCES]);
  });

  test("the polarity threshold belongs to the bright side, and is pinned", () => {
    // It was a comparison inside the hook until a mutation flipped it and every
    // test stayed green — each test had been rebuilding its own copy of the
    // decision. It is a function now, so both the threshold and the call to it
    // are visible to a test.
    expect(prefersDarkInk(0.49)).toBe(false);
    expect(prefersDarkInk(0.5)).toBe(true);
    expect(prefersDarkInk(0.51)).toBe(true);
    expect(prefersDarkInk(0)).toBe(false);
    expect(prefersDarkInk(1)).toBe(true);
  });
});

describe("the ink follows the picture's polarity", () => {
  test("a bright picture is read with a dark ink, a dark one with a light ink", () => {
    for (const theme of THEME_NAMES) {
      const bright = decide(theme, BRIGHT, 0.55, 1, "image");
      const dark = decide(theme, DARK, 0.55, 1, "image");
      expect(relativeLuminance(bright.ink), `${theme}: bright picture`).toBeLessThan(
        relativeLuminance(dark.ink),
      );
    }
  });

  test("the dark candidates are offered first for a bright picture, and last for a dark one", () => {
    const ink = token("light", "ink");
    const bg = token("light", "bg");
    const forBright = dynamicInkCandidates(ink, bg, true);
    const forDark = dynamicInkCandidates(ink, bg, false);
    // Both contain the same four colours — only the ORDER is the picture's.
    expect([...forBright].sort()).toEqual([...forDark].sort());
    expect(relativeLuminance(forBright[0]!)).toBeLessThan(relativeLuminance(forBright[1]!));
    expect(relativeLuminance(forDark[0]!)).toBeGreaterThan(relativeLuminance(forDark[1]!));
  });

  test("the palette's own two ends are always offered, so a theme can keep its ink", () => {
    for (const theme of THEME_NAMES) {
      const offered = dynamicInkCandidates(token(theme, "ink"), token(theme, "bg"), true);
      expect(offered, theme).toContainEqual(token(theme, "ink"));
      expect(offered, theme).toContainEqual(token(theme, "bg"));
    }
  });
});

describe("the chosen ink is the best one available, everywhere on the track", () => {
  test("over every theme × veil × transparency × picture, the order's promise is kept", () => {
    // Two rules, and the decision obeys one of them:
    //  - if ANY candidate clears AA on every ground, the FIRST such candidate
    //    wins — preference order is part of the product, because the palette's
    //    own ink leads and a reader whose photo suits their theme must not have
    //    their text recoloured;
    //  - if none does, the winner is the highest worst-case contrast, and the
    //    decision reports that it did not reach AA rather than dressing it up.
    // Between them there is no third case, and this walks the whole product.
    let cleared = 0;
    for (const theme of THEME_NAMES) {
      for (const palette of PALETTES) {
        for (const veil of veils) {
          for (const t of transparencies) {
            for (const picture of [BRIGHT, DARK]) {
              const where = `${theme}/${palette}/veil ${veil}/t ${t}/${picture[0]}`;
              const { ink, contrast, candidates, grounds } = decide(theme, picture, veil, t, palette);
              expect(candidates).toContainEqual(ink);
              expect(contrast).toBeGreaterThan(0);
              const firstClearing = candidates.find((c) => worstContrast(c, grounds) >= WCAG_TEXT);
              expect(firstClearing, where).not.toBeUndefined();
              cleared++;
              expect(ink, where).toEqual(firstClearing);
              expect(contrast, where).toBeGreaterThanOrEqual(WCAG_TEXT);
            }
          }
        }
      }
    }
    expect(cleared).toBe(THEME_NAMES.length * PALETTES.length * (STEPS + 1) ** 2 * 2);
  });

  test("the ground the reader is looking at clears AA on the WHOLE track", () => {
    // THE promise, and it is unconditional: every theme, both palettes, every
    // veil from 0 to 1, every card transparency from 0 to 1, a bright and a
    // dark picture. The loop is the measurement — 11 088 decisions, each one
    // composed by the same function the browser's stack is described by.
    let checked = 0;
    for (const theme of THEME_NAMES) {
      for (const palette of PALETTES) {
        for (const veil of veils) {
          for (const t of transparencies) {
            for (const picture of [BRIGHT, DARK]) {
              const { ink, grounds } = decide(theme, picture, veil, t, palette);
              // BOTH grounds, and the loop is the measurement: the card's
              // composite and the page's, where the section headings and every
              // inherited word stand. The veil floor is what makes this
              // unconditional — over a photograph of the theme's opposite
              // polarity no ink reads on both grounds at the reader's own
              // number, and the app paints a stronger veil until one does.
              for (const ground of grounds) {
                expect(
                  contrastRatio(ink, ground),
                  `${theme}/${palette}/veil ${veil}/t ${t}/${picture[0]}`,
                ).toBeGreaterThanOrEqual(WCAG_TEXT);
              }
              checked++;
            }
          }
        }
      }
    }
    expect(checked).toBe(THEME_NAMES.length * PALETTES.length * (STEPS + 1) ** 2 * 2);
  });

  test("an opaque card keeps the palette's own ink wherever the picture does not fight it", () => {
    // At 0% card transparency the CARD's ground is the theme's surface whatever
    // the picture is — but the PAGE's ground is the picture, and
    // `.section-title h2` stands on it. So the promise narrows to the honest
    // one, and both halves are counted: the theme's own ink and the reader's own
    // veil survive wherever they read on both grounds, and where the photograph's
    // polarity is the theme's opposite the veil has to lift until they do. Fade
    // nothing and change nothing is still the rule for the pictures that suit
    // the theme — twelve of these twenty-four.
    let kept = 0;
    let lifted = 0;
    for (const theme of THEME_NAMES) {
      for (const palette of PALETTES) {
        for (const picture of [BRIGHT, DARK]) {
          const light = isLight(THEMES[theme as keyof typeof THEMES].bg);
          const fights = prefersDarkInk(averageRelativeLuminance(pixelsOf(picture))) !== light;
          const { ink, veil, meetsAA, grounds } = decide(theme, picture, 0, 0, palette);
          const where = `${theme}/${palette}/${picture[0]}`;
          expect(meetsAA, where).toBe(true);
          for (const ground of grounds) {
            expect(contrastRatio(ink, ground), where).toBeGreaterThanOrEqual(WCAG_TEXT);
          }
          if (!fights) {
            expect(ink, `${where}: the theme's own ink`).toEqual(token(theme, "ink"));
            expect(veil, `${where}: nothing to lift`).toBe(0);
            kept++;
            continue;
          }
          // The picture's polarity is the theme's opposite, so the reader's own
          // composition cannot carry the text on both grounds: the veil lifts.
          expect(veil, `${where}: the veil had to move`).toBeGreaterThan(0);
          lifted++;
        }
      }
    }
    expect(kept).toBe(THEME_NAMES.length * PALETTES.length);
    expect(lifted).toBe(THEME_NAMES.length * PALETTES.length);
  });

  test("the ground under the headings: the ONE-ground decision leaves them invisible", () => {
    // The mutation this batch removes, rebuilt from the same parts: the decision
    // the app shipped with, handed only the CARD's ground. It reads AA there —
    // that is how it shipped green — and the very same ink is measured against
    // the PAGE's ground, which is where `.section-title h2` and every inherited
    // word stand. Over a dark photograph in a light theme the two answers are
    // the theme's dark ink and the picture's own dark pixels.
    const theme = "light";
    const light = isLight(THEMES[theme as keyof typeof THEMES].bg);
    const scrim = worstCaseScrimRgb(light, "image");
    const surface = token(theme, "surface");
    const readerVeil = effectiveVeil(0, 0);
    const candidates = dynamicInkCandidates(
      token(theme, "ink"),
      token(theme, "bg"),
      prefersDarkInk(averageRelativeLuminance(pixelsOf(DARK))),
    );
    const cardOnly = pickDynamicInk(candidates, [
      groundWithPicture(surface, scrim, readerVeil, DARK, 0),
    ]);
    expect(cardOnly?.meetsAA, "the card's own ground reads").toBe(true);
    expect(cardOnly!.ink).toEqual(token(theme, "ink"));

    const painted = decideDynamicInk(
      {
        rgb: DARK,
        luminance: averageRelativeLuminance(pixelsOf(DARK)),
        min: { rgb: DARK, luminance: pixelLuminance(DARK[0], DARK[1], DARK[2]) },
        max: { rgb: DARK, luminance: pixelLuminance(DARK[0], DARK[1], DARK[2]) },
      },
      THEMES[theme as keyof typeof THEMES] as unknown as Record<string, string>,
      0,
      "image",
      0,
    );
    if (!painted) throw new Error("no ink at all");
    expect(
      contrastRatio(cardOnly!.ink, pageGroundRgb(surface, scrim, readerVeil, DARK)),
      "the one-ground ink, on the ground the heading stands on",
    ).toBeLessThan(WCAG_TEXT);
    // And the fixed decision, on that same pixel, at the veil it chose to paint.
    expect(
      contrastRatio(parseHexRgb(painted.primary)!, pageGroundRgb(surface, scrim, painted.veil, DARK)),
      "the fixed ink, on the same ground",
    ).toBeGreaterThanOrEqual(WCAG_TEXT);
    expect(painted.veil, "the veil is what moved").toBeGreaterThan(readerVeil);
  });

  test("with the app's own card guarantee unchanged, the two never disagree", () => {
    // `cardGroundRgb` is the adversarial ground the existing suite walks. The
    // dynamic ink has to clear AA there too, or it would make the app LESS
    // readable in exactly the case the earlier fix was written for.
    for (const theme of THEME_NAMES) {
      for (const palette of PALETTES) {
        const ground = cardGroundRgb(
          token(theme, "surface"),
          isLight(THEMES[theme as keyof typeof THEMES].bg),
          palette,
          0.55,
          1,
        );
        const decision = pickDynamicInk(
          dynamicInkCandidates(token(theme, "ink"), token(theme, "bg"), true),
          [ground],
        );
        expect(decision?.meetsAA, `${theme}/${palette}`).toBe(true);
      }
    }
  });
});

describe("the wiring, which a markup test cannot see", () => {
  test("the picture is sampled once, in a canvas, and only on the picture", () => {
    expect(HOOK_SRC).toContain("canvas.width = LUMINANCE_SAMPLE");
    expect(HOOK_SRC).toContain("getImageData(0, 0, LUMINANCE_SAMPLE, LUMINANCE_SAMPLE)");
    expect(HOOK_SRC).toContain("drawImage(image, 0, 0, LUMINANCE_SAMPLE, LUMINANCE_SAMPLE)");
    // …AND THE CROP, where the platform fits `cover` to the window: the same
    // two draws, with the source rectangle the browser itself is using, so the
    // ink is decided on the pixels on screen rather than on the part of the
    // file that got cropped away. Both variants are pinned because both are
    // live code paths, and the eight-argument call is the one a mutation
    // dropping `visibleCrop` would delete.
    expect(HOOK_SRC).toContain("visibleCrop(image.naturalWidth, image.naturalHeight, box.width, box.height)");
    expect(HOOK_SRC).toContain("crop.sx,\n            crop.sy,");
    expect(HOOK_SRC).toContain("if (crop) {");
    // The dependency list is the promise that a slider move is arithmetic and
    // not a decode: re-measuring on `scrim` would decode the picture again.
    // `fit` IS in the list, and it is not a slider: it decides which pixels the
    // sample is taken from (cover measures the window's crop, contain the whole
    // file), so a fit change has to re-take it.
    const effect = /useEffect\(\(\) => \{[\s\S]*?\}, \[background, fit\]\);/.exec(HOOK_SRC);
    expect(effect, "the measuring effect must depend on the picture and the fit").not.toBeNull();
    expect(effect![0], "and never on the veil or the transparency").not.toContain("scrim");
  });

  test("no canvas means no ink, rather than a wrong one", () => {
    expect(HOOK_SRC).toContain('typeof document === "undefined" || typeof Image === "undefined"');
    expect(HOOK_SRC).toContain("return null;");
    expect(HOOK_SRC).toContain("catch {");
    // And `null` means "write nothing": the caller spreads it conditionally.
    expect(APP_SRC).toContain("...(dynamicInk");
  });

  test("four slot names are written, and the raw token is left to the theme", () => {
    expect(APP_SRC).toContain('"--app-dynamic-ink": dynamicInk.primary');
    expect(APP_SRC).toContain('"--app-dynamic-ink-soft": dynamicInk.soft');
    expect(APP_SRC).toContain('"--app-dynamic-brand": dynamicInk.brand');
    expect(APP_SRC).toContain('"--app-dynamic-brand-strong": dynamicInk.brandStrong');
    // AND NOT `--ink`. It used to be written here as well, on the reasoning that
    // it is the name the whole app reads. That is what broke the solid carriers:
    // `.app.has-bg .yip-tile`, `.rec-flow`, `.pin-overlay` and the badges all
    // re-pin with `--app-ink: var(--ink)`, so overwriting `--ink` with the
    // picture's decision handed those rules the decision back — light ink on a
    // light tile, the lock screen in the photograph's colours. The decision
    // belongs in the slots; `--ink` stays the theme's, which is what the pins
    // read.
    expect(APP_SRC).not.toContain('"--ink": dynamicInk.primary');
    expect(STYLES_SRC).toContain("--app-ink: var(--ink);\n  --app-ink-soft: var(--ink-soft);\n}");
    // The scroll listener writes the same names, so it is the same fix on both
    // paths rather than one path that keeps the bug.
    expect(HOOK_SRC).not.toContain('setProperty("--ink", next.primary)');
    // The style block is itself conditional on `background`, so a reader with
    // no picture cannot receive an ink at all — the app's colours are untouched.
    expect(APP_SRC).toMatch(/style=\{\s*background\s*\?/);
  });

  test("the veil the app paints is the veil the decision was measured at", () => {
    // The floor is only a guarantee if it reaches the paint. A decision that
    // reports a strengthened veil while the root keeps writing the reader's own
    // slider number would measure one surface and show another — the bug class
    // this feature keeps finding, one layer up from the arithmetic. The
    // fallback stays the reader's own number (a browser with no canvas paints
    // `effectiveVeil`, which `tests/lib/background-app.test.ts` already pins),
    // and the Settings preview takes the STRONGER of the two, because a preview
    // showing the softer number promises a surface the reader will not get.
    expect(APP_SRC).toContain("dynamicInk?.veil ?? effectiveVeil(");
    expect(SETTINGS_SRC).toContain("inkVeil={inkVeil}");
    expect(PICKER_SRC).toContain("const ownVeil = effectiveVeil(alpha, faded);");
    expect(PICKER_SRC).toContain("Math.max(ownVeil, inkVeil ?? 0)");
    // And the reader is TOLD when that number is not the one they set: the
    // notice's condition compares the painted veil against their own, which is
    // the only comparison that can tell "the floor did nothing" from "the floor
    // lifted a reader's 25% to 70%".
    expect(PICKER_SRC).toContain("inkVeil !== undefined && inkVeil > ownVeil + Number.EPSILON");
    expect(PICKER_SRC).toContain('t("settings.bg.veilFloorNotice", { value: Math.round(paintedAlpha * 100) })');
  });

  test("the ink reaches the stylesheet as a custom property, not a class", () => {
    // A class would need one rule per component; a property inherits, which is
    // why every word on every card is covered by one write.
    expect(APP_SRC).toContain('"--app-dynamic-ink"');
    expect(APP_SRC).not.toContain('className={dynamicInk');
  });

  test("the hook decides WITH the pinned helper, and hands back its ink", () => {
    // Three things a behaviour test cannot see because the hook needs a DOM:
    // that the polarity comes from the pinned function, that the ground is
    // composed WITH the reader's card transparency, and that the decision is
    // what is returned rather than the theme's ink. Each of these passed a
    // mutation while the arithmetic tests were green, which is the reason they
    // are pins and not a rendering.
    expect(HOOK_SRC).toContain("prefersDarkInk(visible.luminance)");
    expect(HOOK_SRC).toContain(
      "groundWithPicture(surface, scrimRgb, veil, region.rgb, cardTransparency)",
    );
    // The ground is the WORST REGION's, not the average's — the P1 an earlier
    // batch fixed — and the polarity comes from the sample the reader can SEE
    // rather than from the whole frame, which is the scroll listener's whole
    // reason for existing: a slice handed the frame's own average would be
    // decided with the mid-grey ink of a picture it is not looking at. Both
    // halves are pinned: the sampler must track each pixel's luminance (a hook
    // that only summed channels would still return two well-formed numbers and
    // never find an extreme), and the decision must be handed the region
    // `worstRegion` names.
    expect(HOOK_SRC).toContain("const visible = band ? slicePicture(measured, band.start, band.end) : measured;");
    expect(HOOK_SRC).toContain("worstRegion(visible)");
    expect(HOOK_SRC).toContain("pixelLuminance(pr, pg, pb)");
    // And the veil the decision composites with is the FLOORED one the root
    // paints — a decision against the reader's raw slider would reason about
    // a surface the browser stopped painting in the veil-floor batch.
    expect(HOOK_SRC).toContain("effectiveVeil(scrim, cardTransparency)");
    expect(HOOK_SRC).toContain("if (!decision) return null;");
    // One decision, four inks: the soft step and BOTH brand fallbacks are
    // computed FROM the decision's own answer, not by a second hook with a
    // second ground that could disagree with the first. And both brand paints
    // are parsed — a slot that answered for one with the other's number would
    // repaint the no-picture app as a side effect.
    expect(HOOK_SRC).toContain("softInk(decision.ink, ground)");
    expect(HOOK_SRC).toContain("readableBrand(brand, decision.ink, grounds)");
    expect(HOOK_SRC).toContain("readableBrand(brandStrong, decision.ink, grounds)");
    expect(HOOK_SRC).toContain("parseHexRgb(tokens.brand)");
    expect(HOOK_SRC).toContain("parseHexRgb(tokens.brandStrong)");
    // And the ground list is EXACTLY the reader's own two: the card's composite
    // and the page's. Both come from the measured region, so a hunch that adds
    // the app's adversarial picture back — which would decide the text against a
    // photograph nobody chose — is caught here rather than in a reader's reply.
    const grounds = /const grounds: Rgb\[\] = \[([\s\S]*?)\];/.exec(HOOK_SRC);
    expect(grounds, "the hook must build its grounds in one place").not.toBeNull();
    expect(grounds![1]!.split("\n").filter((l) => l.trim().length > 0)).toHaveLength(2);
    expect(grounds![1]).not.toContain("worstCasePicture");
    expect(grounds![1]).toContain("pageGroundRgb(surface, scrimRgb, veil, region.rgb)");
    // The veil in those grounds is the one the floor chose, and the floor is
    // searched before they are built: a decision measured at one veil and
    // painted at another is the bug class this whole feature keeps finding.
    expect(HOOK_SRC).toContain("const veil = veilForAA({");
    expect(HOOK_SRC).toContain("base: readerVeil,");
  });

  test("the CSS value is a hex the browser can parse, rounded not truncated", () => {
    expect(inkToCss([0, 0, 0])).toBe("#000000");
    expect(inkToCss([255, 255, 255])).toBe("#ffffff");
    expect(inkToCss([18, 52, 86])).toBe("#123456");
    // Rounded, so the measured ink and the painted ink are the same number.
    expect(inkToCss([18, 52, 87])).toBe("#123457");
    expect(inkToCss([-40, 300, 12])).toBe("#00ff0c");
    // The integer cases above cannot tell rounding from truncation — 87 rounds
    // and truncates to the same 87 — and a suite that cannot tell them apart
    // does not pin the difference its own comment claims. These do:
    // 17.6/52.4/87.6 rounds to #123458 and truncates to #113457.
    expect(inkToCss([17.6, 52.4, 87.6])).toBe("#123458");
    expect(inkToCss([0.4, 0.5, 254.9])).toBe("#0001ff");
  });
});

/**
 * THE SAMPLING, MEASURED.
 *
 * `measurePicture` is the one function here that touches a DOM. It is also the
 * one the feature rests on: everything downstream is arithmetic on the number it
 * returns, so a hook that reported a constant would be perfectly green on the
 * source-text pins above and perfectly wrong on screen.
 *
 * The double lives at module scope now, because the worst-region P1 below
 * reads pixels through it too — its whole point is that different pixels
 * produce a different decision.
 *
 * The double is deliberately thin — a canvas with `getContext`, a context with
 * `drawImage` and `getImageData`, an `Image` whose `src` fires `onload` — and it
 * hands back pixels the test chooses, so the assertion is about the arithmetic
 * and not about the browser. `measurePicture` guards on `typeof document` and
 * `typeof Image`, so both globals have to exist and both are restored afterwards:
 * the globals are process-wide, and a leaked fake canvas would be a lie every
 * later file believes.
 */
describe("the picture's pixels, actually read", () => {
  /** Four pixels of one colour, which is what a downscaled photo usually is. */
  const pixelsOf = (colour: number): number[] =>
    [colour, colour, colour, 255, colour, colour, colour, 255];

  test("a bright picture measures bright, a dark one measures dark", async () => {
    let restore = withFakeCanvas(pixelsOf(248));
    try {
      const bright = await measurePicture("data:image/png;base64,bright");
      expect(bright, "a picture that decoded must produce a measurement").not.toBeNull();
      expect(bright!.luminance).toBeGreaterThan(0.5);
      expect(bright!.rgb).toEqual([248, 248, 248]);
    } finally {
      restore();
    }

    restore = withFakeCanvas(pixelsOf(10));
    try {
      const dark = await measurePicture("data:image/png;base64,dark");
      expect(dark).not.toBeNull();
      expect(dark!.luminance).toBeLessThan(0.5);
      expect(dark!.rgb).toEqual([10, 10, 10]);
    } finally {
      restore();
    }
  });

  test("the luminance is the luminance of THESE pixels, not a number that was already there", async () => {
    // The same question asked of the averaging helper, through the hook, so the
    // hand-off between them is covered too: a hook that stopped averaging would
    // still return two well-formed numbers, and only the value gives it away.
    const measured = await (async () => {
      const restore = withFakeCanvas(pixelsOf(248));
      try {
        return await measurePicture("data:image/png;base64,bright");
      } finally {
        restore();
      }
    })();
    expect(measured!.luminance).toBeCloseTo(
      averageRelativeLuminance(new Uint8ClampedArray(pixelsOf(248))),
      10,
    );
  });

  test("a picture that will not decode answers null rather than a guess", async () => {
    // The image LOADS here — it is the canvas the browser refuses, so the null
    // comes from the read and not from the guard above it. A test that returned
    // null for the wrong reason would still pass, which is the point.
    const restore = withFakeCanvas([], true);
    try {
      expect(await measurePicture("data:image/png;base64,unreadable")).toBeNull();
    } finally {
      restore();
    }
  });
});

/*
 * THE INK THE WORDS ACTUALLY INHERIT.
 *
 * The first version of this feature changed `--ink` and nothing else, and the
 * reader's report was exact: on her photograph some words were readable and
 * some were not. The unreadable ones were the words that never read `--ink` —
 * the sixty-five muted rules, the headings that merely inherit, the svg
 * captions. The fix is a slot layer (`--app-ink`, `--app-ink-soft`) that the
 * decision fills and the text rules read, and these tests hold both ends of
 * it: the arithmetic the slots carry must stay AA on the ground the primary
 * cleared, and the sheet must route the real text rules through the slots.
 */
describe("the ink the words actually inherit", () => {
  test("the app paints its own ink, so text that merely inherits follows the decision", () => {
    expect(STYLES_SRC).toMatch(/\.app \{[^}]*color: var\(--app-ink\);/);
  });

  test("under a picture the slots read the decision, with the theme as the fallback", () => {
    expect(STYLES_SRC).toContain("--app-ink: var(--app-dynamic-ink, var(--ink))");
    expect(STYLES_SRC).toContain("--app-ink-soft: var(--app-dynamic-ink-soft, var(--ink-soft))");
    expect(STYLES_SRC).toContain("--app-dynamic-brand: var(--brand)");
    expect(STYLES_SRC).toContain("--app-dynamic-brand-strong: var(--brand-strong)");
    // The muted rules read the slot now, not the theme token — the count is
    // the reach, and a silent reversion to `var(--ink-soft)` would strand the
    // secondary text on the theme's tint over a photograph of the wrong
    // polarity. The DEFAULTS are anchored to the declarations they sit beside:
    // a pin that matched any `--app-dynamic-brand:` would also match the two
    // solid-mode re-pins and survive their removal, so the anchor is the
    // defaults block the slots are born in.
    const remapped = (STYLES_SRC.match(/var\(--app-ink-soft\)/g) ?? []).length;
    expect(remapped).toBeGreaterThanOrEqual(60);
    // …anchored to the shape ONLY the defaults block has: opened by a bare
    // `.app {`. The pin-overlay re-pin repeats the same four lines and would
    // answer for the defaults if the anchor were the lines alone — there are
    // two blocks with those lines, and only one of them is the default.
    expect(STYLES_SRC).toMatch(
      /\.app \{\n  --app-ink: var\(--ink\);\n  --app-ink-soft: var\(--ink-soft\);\n  --app-dynamic-brand: var\(--brand\);\n  --app-dynamic-brand-strong: var\(--brand-strong\);\n\}/,
    );
  });

  test("the solid carriers keep the theme's words, and the pin screen keeps all of them", () => {
    for (const selector of [
      ".yip-tile",
      ".yip-tile-active",
      ".yip-subtitle",
      ".med-chip-x",
      ".iconset-badge",
      ".badge-label",
      ".tracker-read-label",
      ".rec-quad-label",
    ]) {
      expect(STYLES_SRC, selector).toContain(`.app.has-bg ${selector}`);
    }
    expect(STYLES_SRC).toContain(".app.has-bg .pin-overlay {");
  });

  test("soft ink stays AA on the same ground, and is quieter wherever there is room", () => {
    // The whole track again, both pictures: the soft ink is mixed a third of
    // the way toward the ground the primary already cleared, so it may be
    // quieter but never unreadable — and where the primary's contrast leaves
    // room, the soft ink must actually BE softer, or the mix was never asked
    // for.
    let checked = 0;
    let quieter = 0;
    for (const theme of THEME_NAMES) {
      for (const palette of PALETTES) {
        for (const veil of veils) {
          for (const t of transparencies) {
            for (const picture of [BRIGHT, DARK]) {
              const { ink, grounds } = decide(theme, picture, veil, t, palette);
              const ground = grounds[0]!;
              const where = `${theme}/${palette}/veil ${veil}/t ${t}/${picture[0]}`;
              const soft = softInk(ink, ground);
              expect(contrastRatio(soft, ground), where).toBeGreaterThanOrEqual(WCAG_TEXT);
              expect(contrastRatio(soft, ground), where).toBeLessThanOrEqual(
                contrastRatio(ink, ground),
              );
              if (contrastRatio(ink, ground) > 6) {
                expect(soft, `quieter ${where}`).not.toEqual(ink);
                quieter++;
              }
              checked++;
            }
          }
        }
      }
    }
    expect(checked).toBe(THEME_NAMES.length * PALETTES.length * (STEPS + 1) ** 2 * 2);
    expect(quieter).toBeGreaterThan(0);
  });

  test("the brand text rules read the slots, and the fills keep the raw tokens", () => {
    // Six rules paint `--brand` text (the title, the stat values, the badge
    // chip, the dose note and the pin screen's two), six paint the strong
    // paint — and the pins are exact counts, because this is the boundary the
    // fill rules sit on: one more rule remapped and a button's own paint
    // starts answering to the picture; one fewer and a word is stranded on
    // the theme again.
    const brandText = (STYLES_SRC.match(/color: var\(--app-dynamic-brand\);/g) ?? []).length;
    const brandStrongText = (
      STYLES_SRC.match(/color: var\(--app-dynamic-brand-strong\);/g) ?? []
    ).length;
    expect(brandText).toBe(6);
    expect(brandStrongText).toBe(6);
    // The fills keep their own paint: a selected pill, the streak chip and the
    // crisis strips sit on solid brand ground and are backgrounds, not words.
    expect(STYLES_SRC).not.toMatch(/\.pill-selected \{[^}]*app-dynamic-brand/);
    expect(STYLES_SRC).not.toMatch(/\.streak-chip \{[^}]*app-dynamic-brand/);
    expect(STYLES_SRC).not.toMatch(/\.disclaimer-block \{[^}]*app-dynamic-brand/);
    // Solid-surface modes re-pin both brand slots: the decision reasons about
    // the composite, but a pinned-opaque surface is the ground the theme's
    // brand was chosen against.
    expect(STYLES_SRC).toMatch(/\.app\.contrast-high \{[^}]*--app-dynamic-brand: var\(--brand\);/);
    expect(STYLES_SRC).toMatch(
      /\.app\.contrast-high \{[^}]*--app-dynamic-brand-strong: var\(--brand-strong\);/,
    );
    expect(STYLES_SRC).toMatch(
      /@media \(prefers-reduced-transparency: reduce\) \{[\s\S]*?\.app\.has-bg \{[^}]*--app-dynamic-brand: var\(--brand\);/,
    );
  });

  test("both brand paints are measured separately, on their own names", () => {
    // Two paints, two answers: where `--brand` fails on the ground and
    // `--brand-strong` passes, the strong text keeps its colour and the plain
    // text hands over — or the reverse. A test that checked one paint would
    // pass a hook that measured the other twice.
    let plainSteppedStrongKept = 0;
    let bothKept = 0;
    for (const theme of THEME_NAMES) {
      for (const palette of PALETTES) {
        for (const veil of veils) {
          for (const t of transparencies) {
            for (const picture of [BRIGHT, DARK]) {
              const { ink, grounds } = decide(theme, picture, veil, t, palette);
              const where = `${theme}/${palette}/veil ${veil}/t ${t}/${picture[0]}`;
              const brand = token(theme, "brand");
              const brandStrong = token(theme, "brandStrong");
              const plain = readableBrand(brand, ink, grounds);
              const strong = readableBrand(brandStrong, ink, grounds);
              // Kept means it still reads on the ground it was measured
              // against; anything else is exactly the ink that won.
              if (plain === brand) {
                expect(worstContrast(brand, grounds), where).toBeGreaterThanOrEqual(WCAG_TEXT);
              } else {
                expect(plain, where).toEqual(ink);
              }
              if (strong === brandStrong) {
                expect(worstContrast(brandStrong, grounds), where).toBeGreaterThanOrEqual(
                  WCAG_TEXT,
                );
              } else {
                expect(strong, where).toEqual(ink);
              }
              if (plain !== brand && strong === brandStrong) {
                plainSteppedStrongKept++;
              }
              if (plain === brand && strong === brandStrong) {
                bothKept++;
              }
            }
          }
        }
      }
    }
    // Both directions have to be real, or the "separately" claim is not
    // measured either: there are cells where only the strong paint survives.
    expect(plainSteppedStrongKept).toBeGreaterThan(0);
    expect(bothKept).toBeGreaterThan(0);
  });

  test("the wiring, part 2: solid-surface modes collapse the ground to the surface", () => {
    // contrast-high is the reader's own switch and prefers-reduced-transparency
    // the OS's; both pin the card's paint opaque, so the decision is handed an
    // OPAQUE card and the theme's ink wins the scan — the dynamic decision
    // becomes a no-op exactly where the picture is no longer the ground.
    expect(APP_SRC).toContain("data.settings.highContrast || prefersSolidSurfaces");
    expect(APP_SRC).toContain("prefersSolidSurfaces ? 0 : transparency");
    expect(APP_SRC).toContain('window.matchMedia("(prefers-reduced-transparency: reduce)")');
  });
});

/*
 * THE WORST REGION — the P1 the audit found, as a decision with a name.
 *
 * The report was exact: at a card transparency above 50% with the veil at
 * zero, a photograph that varies across the frame defeats the average. The
 * average of a half-white / half-black picture is mid-grey; the ink that reads
 * on mid-grey is black; and black on the picture's own black half is 1.00:1 —
 * invisible — while the decision still reported `meetsAA = true`.
 *
 * The fix has two halves and these tests hold both: `worstRegion` must name
 * the region the polarity's ink CANNOT read (the darkest under a dark ink, the
 * brightest under a light one), and the decision built on it must clear AA
 * there. The last test is the mutation proof: the old average-based decision,
 * rebuilt from the same parts, reports `meetsAA = true` and measures under AA
 * on the very region the fix protects.
 */
describe("the worst region, decided", () => {
  const sample = (
    rgb: Rgb,
    luminance: number,
    min: SampledRegion,
    max: SampledRegion,
  ): PictureSample => ({ rgb, luminance, min, max });

  test("a flat picture decides on the average — its extremes ARE the average", () => {
    const flat = sample(
      [10, 20, 30],
      0.15,
      { rgb: [10, 20, 30], luminance: 0.15 },
      { rgb: [10, 20, 30], luminance: 0.15 },
    );
    expect(worstRegion(flat)).toEqual({ rgb: [10, 20, 30], luminance: 0.15 });
  });

  test("the range's boundary belongs to the flat side", () => {
    // Exactly at the threshold the average still describes the picture — the
    // boundary is not moved by a test that only tried values far from it.
    const at = sample(
      [128, 128, 128],
      0.5,
      { rgb: [0, 0, 0], luminance: 0.1 },
      { rgb: [255, 255, 255], luminance: 0.1 + WORST_REGION_RANGE },
    );
    expect(worstRegion(at)).toEqual({ rgb: [128, 128, 128], luminance: 0.5 });
    // One step over, and the average is out of the decision.
    const over = sample(
      [128, 128, 128],
      0.5,
      { rgb: [0, 0, 0], luminance: 0.1 - Number.EPSILON * 8 },
      { rgb: [255, 255, 255], luminance: 0.1 + WORST_REGION_RANGE },
    );
    expect(worstRegion(over).rgb).toEqual([0, 0, 0]);
  });

  test("the extreme that fights the polarity's ink is the worst region", () => {
    // A bright picture leads with a DARK ink, and a dark ink loses contrast on
    // the DARKEST ground — so the minimum is the region the decision must
    // survive, and handing it the maximum would guarantee the invisible text.
    const brightWithShadow = sample(
      [200, 200, 200],
      0.7,
      { rgb: [0, 0, 0], luminance: 0 },
      { rgb: [255, 255, 255], luminance: 1 },
    );
    expect(worstRegion(brightWithShadow)).toEqual({ rgb: [0, 0, 0], luminance: 0 });
    // A dark picture leads with a LIGHT ink, whose enemy is the BRIGHTEST ground.
    const darkWithGlare = sample(
      [40, 40, 40],
      0.02,
      { rgb: [0, 0, 0], luminance: 0 },
      { rgb: [255, 255, 255], luminance: 1 },
    );
    expect(worstRegion(darkWithGlare)).toEqual({ rgb: [255, 255, 255], luminance: 1 });
  });
});

describe("the P1 end to end: a picture the average cannot describe", () => {
  const WHITE: Rgb = [255, 255, 255];
  const BLACK: Rgb = [0, 0, 0];

  /**
   * The decision the APP makes, through its own function rather than a copy.
   *
   * This used to be rebuilt from the exported parts, and the rebuild is what
   * made the grounds and the veil floor invisible to this suite: a change here
   * that the app also made would have kept passing, and a change the app made
   * alone would have failed the app rather than the test. The band argument is
   * threaded through it for the scroll tests below.
   */
  function decideSampled(
    theme: string,
    measured: PictureSample,
    veil: number,
    t: number,
    palette: ScrimPalette,
    band?: { start: number; end: number },
  ) {
    const decision = decideDynamicInk(
      measured,
      THEMES[theme as keyof typeof THEMES] as unknown as Record<string, string>,
      veil,
      palette,
      t,
      band,
    );
    if (!decision) throw new Error("no ink at all");
    return decision;
  }

  /** The ground the text stands on over ONE pixel of the picture. */
  const groundOfPixel = (theme: string, pixel: Rgb, veil: number, t: number, palette: ScrimPalette): Rgb =>
    groundWithPicture(
      token(theme, "surface"),
      worstCaseScrimRgb(isLight(THEMES[theme as keyof typeof THEMES].bg), palette),
      effectiveVeil(veil, t),
      pixel,
      t,
    );

  /** The audit's own picture: half the sampled frame white, half black. */
  async function measureHalfAndHalf(): Promise<PictureSample> {
    const restore = withFakeCanvas([
      ...pixelsOf(WHITE),
      ...pixelsOf(WHITE),
      ...pixelsOf(BLACK),
      ...pixelsOf(BLACK),
    ]);
    try {
      const measured = await measurePicture("data:image/png;base64,half");
      if (!measured) throw new Error("the picture did not measure");
      return measured;
    } finally {
      restore();
    }
  }

  test("half bright / half dark: the worst region clears AA at the audit's own settings", async () => {
    const measured = await measureHalfAndHalf();
    // This IS the photograph the P1 describes: mid-grey average, full-scale
    // range — and the settings it named, veil slider at 0 and card
    // transparency at 0.95. The veil-floor batch paints 0.475 there rather
    // than 0, and the decision still has to clear AA on the worst region:
    // the floor raises the ground, it does not choose the ink.
    expect(measured.luminance).toBeCloseTo(0.5, 5);
    expect(measured.rgb).toEqual([128, 128, 128]);
    expect(measured.max.luminance - measured.min.luminance).toBeCloseTo(1, 5);
    expect(effectiveVeil(0, 0.95)).toBeCloseTo(0.475, 10);
    for (const theme of THEME_NAMES) {
      const decision = decideSampled(theme, measured, 0, 0.95, "image");
      // The region handed to the decision is the one the polarity's ink
      // cannot read — pinned here, because a `worstRegion` that answered with
      // the wrong extreme would still clear AA on ITS ground and pass.
      const worstPixel = prefersDarkInk(measured.luminance) ? measured.min.rgb : measured.max.rgb;
      expect(worstRegion(measured).rgb, `${theme}: the worst region`).toEqual(worstPixel);
      // And the ink reads on that pixel at the veil the decision CHOSE to paint:
      // the reader's own number plus the card floor, or a stronger one where
      // neither of those carried the text on both grounds.
      const worstGround = pageGroundRgb(
        token(theme, "surface"),
        worstCaseScrimRgb(isLight(THEMES[theme as keyof typeof THEMES].bg), "image"),
        decision.veil,
        worstPixel,
      );
      expect(
        contrastRatio(parseHexRgb(decision.primary)!, worstGround),
        `${theme}: the text's ground over the worst region`,
      ).toBeGreaterThanOrEqual(WCAG_TEXT);
      expect(decision.meetsAA, theme).toBe(true);
    }
  });

  test("the MUTATION the fix removes: the average reads AA and vanishes on the worst region", async () => {
    const measured = await measureHalfAndHalf();
    const worstPixel = prefersDarkInk(measured.luminance) ? measured.min.rgb : measured.max.rgb;
    // The P1 range of the card slider, WALKED rather than sampled at one t.
    // The veil floor grows with t, so at the far end (t = 0.95 → veil 0.475)
    // the floor alone can rescue the average-based ink too — the two fixes
    // compose, and this test states the handover instead of hiding it: over
    // the middle of the track the worst-region DECISION is what keeps the
    // text visible, and at every t the fixed decision clears AA on the worst
    // region. A mutation that hands the decision the average turns the last
    // assertion red exactly where the decision is load-bearing.
    const PTS = [0.5, 0.6, 0.7, 0.8, 0.95];
    let invisible = 0;
    let checked = 0;
    for (const theme of THEME_NAMES) {
      for (const t of PTS) {
        // The old decision, rebuilt: one ground composited over the picture's
        // AVERAGE colour at the veil the app actually paints. It clears AA on
        // ITS ground — that is exactly how it shipped green — and then the
        // same ink is measured over the pixel the reader is squinting at.
        const averageGround = groundOfPixel(theme, measured.rgb, 0, t, "image");
        const candidates = dynamicInkCandidates(
          token(theme, "ink"),
          token(theme, "bg"),
          prefersDarkInk(measured.luminance),
        );
        const mutated = pickDynamicInk(candidates, [averageGround]);
        expect(mutated?.meetsAA, `${theme} t=${t}: the average ground clears AA`).toBe(true);
        // The fixed decision, at the same settings — the assertion a
        // worstRegion returning the average fails. The ground is composited at
        // the veil the decision paints, which is the surface the reader gets:
        // where the reader's own number cannot carry the text the floor lifts
        // it, and measuring the fixed ink against the veil it did not use would
        // be measuring a surface nobody sees.
        const fixed = decideSampled(theme, measured, 0, t, "image");
        const painted = pageGroundRgb(
          token(theme, "surface"),
          worstCaseScrimRgb(isLight(THEMES[theme as keyof typeof THEMES].bg), "image"),
          fixed.veil,
          worstPixel,
        );
        expect(
          contrastRatio(parseHexRgb(fixed.primary)!, painted),
          `${theme} t=${t}: the fixed ink over the worst region`,
        ).toBeGreaterThanOrEqual(WCAG_TEXT);
        if (contrastRatio(mutated!.ink, painted) < WCAG_TEXT) invisible++;
        checked++;
      }
    }
    expect(checked).toBe(THEME_NAMES.length * PTS.length);
    // Invisible somewhere: at the middle of the track the average-based ink
    // measures under AA — in the worst cells 1.00:1, the text the same colour
    // as its ground. A suite that cannot state this number cannot tell the fix
    // from the bug, which is why the number lives here rather than in a comment.
    expect(invisible, "the average-based ink should be invisible somewhere").toBeGreaterThan(0);
  });

  test("a flat picture is untouched by the fix — the average is still its ground", async () => {
    // The other half of the promise: readers whose photograph is one soft
    // gradient keep the decision they shipped with. A flat sample's extremes
    // equal its average, so `worstRegion` cannot move the ground at all.
    const restore = withFakeCanvas(pixelsOf(BRIGHT));
    try {
      const measured = await measurePicture("data:image/png;base64,flat");
      expect(measured).not.toBeNull();
      expect(measured!.min.rgb).toEqual(measured!.rgb);
      expect(measured!.max.rgb).toEqual(measured!.rgb);
      const decision = decideSampled("light", measured!, 0.55, 0.5, "image");
      // A flat bright picture on a light theme: the region IS the average, so
      // the decision is the palette's own ink — the product promise, stated as
      // the colour the app ends up painting.
      expect(decision.primary).toBe(inkToCss(token("light", "ink")));
      expect(decision.veil, "and the reader's own veil is untouched").toBeCloseTo(
        effectiveVeil(0.55, 0.5),
        10,
      );
    } finally {
      restore();
    }
  });
});

describe("the band the reader can see: the iOS scroll path", () => {
  const region = (rgb: Rgb): SampledRegion => ({
    rgb,
    luminance: pixelLuminance(rgb[0], rgb[1], rgb[2]),
  });
  const DARK_BAND = region([10, 10, 10]);
  const BRIGHT_BAND = region([245, 245, 245]);

  /**
   * A bright field with a dark strip along the bottom.
   *
   * The shape is the one that makes the listener load-bearing, and it takes
   * exactly this arrangement to do it: the frame's AVERAGE is bright, so the
   * polarity is `prefersDarkInk` and the frame's range hands the decision the
   * DARK strip — which is right for the frame, because somewhere in it a dark
   * ink really does have to survive that strip. The reader scrolled up is
   * looking at nothing but the bright field, where that answer is a light ink on
   * a bright ground: 1.37:1, measured below, against the 8.73:1 of the answer
   * the slice produces.
   */
  const banded = (): PictureSample => {
    const colours: Rgb[] = [
      BRIGHT_BAND.rgb,
      BRIGHT_BAND.rgb,
      BRIGHT_BAND.rgb,
      DARK_BAND.rgb,
    ];
    const bands = colours.map((rgb) => {
      const band = region(rgb);
      return { ...band, min: band, max: band };
    });
    // The frame's own numbers are the FOLD of its bands, not decorations beside
    // them: a picture whose stated average disagreed with its own rows would let
    // the slice tests pass on arithmetic the sampler cannot produce.
    const mean = (pick: (band: (typeof bands)[number]) => number) =>
      bands.reduce((sum, band) => sum + pick(band), 0) / bands.length;
    return {
      rgb: [0, 1, 2].map((c) => Math.round(mean((band) => band.rgb[c]!))) as Rgb,
      luminance: mean((band) => band.luminance),
      min: DARK_BAND,
      max: BRIGHT_BAND,
      bands,
    };
  };

  test("a slice is a picture in its own right: its own average, its own extremes", () => {
    const whole = banded();
    const top = slicePicture(whole, 0, 1);
    const bottom = slicePicture(whole, 3, 3);
    expect(top.rgb).toEqual(BRIGHT_BAND.rgb);
    expect(top.luminance).toBeCloseTo(BRIGHT_BAND.luminance, 10);
    expect(top.min).toEqual(BRIGHT_BAND);
    expect(top.max).toEqual(BRIGHT_BAND);
    expect(bottom.rgb).toEqual(DARK_BAND.rgb);
    expect(bottom.min).toEqual(DARK_BAND);
    expect(bottom.max).toEqual(DARK_BAND);
    // Four equal bands: the mean of the means IS the mean of the pixels, which
    // is what makes the fold exact rather than a weighting nobody checked.
    const all = slicePicture(whole, 0, 3);
    expect(all.rgb).toEqual(whole.rgb);
    expect(all.luminance).toBeCloseTo(whole.luminance, 10);
    expect(all.min).toEqual(whole.min);
    expect(all.max).toEqual(whole.max);
  });

  test("an ask it cannot answer falls back to the whole picture, never to nothing", () => {
    const whole = banded();
    // Inverted, out of range, and a sample with no bands at all — the answer is
    // always the frame, because the frame is the conservative one: a slice can
    // only narrow the ground, and a fallback that widened it past the frame
    // would be the listener making the reader LESS safe than no listener.
    expect(slicePicture(whole, 3, 1)).toBe(whole);
    expect(slicePicture(whole, -40, 400)).not.toBe(whole);
    expect(slicePicture(whole, -40, 400).min).toEqual(whole.min);
    const { bands: _ignored, ...noBands } = whole;
    expect(slicePicture(noBands, 0, 1)).toBe(noBands);
  });

  test("the bands the viewport shows are a fraction of the page, clamped to the sample", () => {
    // At the top of a 4000 px page in a 800 px window: the first fifth. At the
    // bottom: the last fifth, and the last band is inclusive — a viewport that
    // ends mid-band still shows that band.
    expect(visibleBands(0, 4000, 800, 20)).toEqual({ start: 0, end: 3 });
    expect(visibleBands(3200, 4000, 800, 20)).toEqual({ start: 16, end: 19 });
    expect(visibleBands(2000, 4000, 800, 20)).toEqual({ start: 10, end: 13 });
    // A viewport taller than the page (a short document, a keyboard opening)
    // and a page with no height at all ask for bands that do not exist.
    expect(visibleBands(0, 300, 800, 20)).toEqual({ start: 0, end: 19 });
    expect(visibleBands(0, 0, 800, 20)).toEqual({ start: 0, end: 19 });
    expect(visibleBands(Number.NaN, Number.NaN, Number.NaN, 20)).toEqual({ start: 0, end: 19 });
    expect(PICTURE_BANDS).toBe(32);
  });

  test("scrolled to the field, the static decision is the one that vanishes", () => {
    const whole = banded();
    const theme = "light";
    const scrim = worstCaseScrimRgb(true, "image");
    const surface = token(theme, "surface");
    // The app's own function, at a fully faded card so the two grounds are one
    // and the veil floor is not what rescues the answer.
    const decideSlice = (band?: { start: number; end: number }) => {
      const decision = decideDynamicInk(
        whole,
        THEMES[theme as keyof typeof THEMES] as unknown as Record<string, string>,
        0,
        "image",
        1,
        band,
      );
      if (!decision) throw new Error("no ink at all");
      return decision;
    };
    // The static decision: the frame's own region, with no band at all — which
    // is what the app paints before the reader has scrolled anywhere.
    const static_ = decideSlice();
    const slice = decideSlice({ start: 0, end: 1 });
    const field = pageGroundRgb(surface, scrim, static_.veil, BRIGHT_BAND.rgb);
    expect(
      contrastRatio(parseHexRgb(static_.primary)!, field),
      "the frame's own decision, over the bright field the reader is looking at",
    ).toBeLessThan(WCAG_TEXT);
    const fieldAtPaint = pageGroundRgb(surface, scrim, slice.veil, BRIGHT_BAND.rgb);
    expect(
      contrastRatio(parseHexRgb(slice.primary)!, fieldAtPaint),
      "the slice's decision, over the same pixels",
    ).toBeGreaterThanOrEqual(WCAG_TEXT);
    expect(slice.meetsAA).toBe(true);
    // And the two answers are DIFFERENT colours, which is the whole point: a
    // listener that recomputed the frame's answer would pass everything above.
    expect(slice.primary).not.toBe(static_.primary);
  });

  test("the listener is passive, throttled, and never decodes anything again", () => {
    // What a behaviour test cannot see without a DOM: the listener's own shape.
    // Each of these is a way the fix could be defeated while every arithmetic
    // test above stayed green — a listener that re-measured would decode the
    // picture on every frame, one that re-rendered would rebuild the view, and
    // one that was not passive would sit on the scrolling path.
    expect(HOOK_SRC).toContain('window.addEventListener("scroll", onScroll, { passive: true })');
    expect(HOOK_SRC).toContain("frame = window.requestAnimationFrame(apply);");
    expect(HOOK_SRC).toContain('document.querySelector<HTMLElement>(".app")');
    expect(HOOK_SRC).toContain("const band = visibleBands(window.scrollY, page.scrollHeight, window.innerHeight);");
    expect(HOOK_SRC).toContain('if (root.style.getPropertyValue("--app-dynamic-ink") === next.primary) return false;');
    // The gate: only the platform that paints the backdrop against the document
    // AND only the fit whose box is the page's, because that is the one case
    // where a fraction of the page is a fraction of the picture.
    expect(HOOK_SRC).toContain("followsDocumentBackdrop((query) => window.matchMedia(query).matches)");
    expect(HOOK_SRC).toContain('if (!background || fit !== "cover") return;');
    // The profile itself is arithmetic in one place, not a query string spelled
    // out at the call site — the case the suite below walks is the reason.
    expect(HOOK_SRC).not.toContain('matchMedia("(hover: none)');
    // The recompute is arithmetic on the measurement in memory: the effect that
    // scrolls must not be able to reach the sampler at all.
    const apply = /const apply = \(\) => \{[\s\S]*?\n    \};/.exec(HOOK_SRC);
    expect(apply, "the listener's body must be one block").not.toBeNull();
    expect(apply![0]).toContain("decideDynamicInk(");
    expect(apply![0]).not.toContain("measurePicture");
    expect(apply![0]).not.toContain("new Image");
  });

  test("the gate is a pointer profile, and the profile arms where the backdrop scrolls", () => {
    const profile =
      (...queries: string[]) =>
      (query: string) =>
        queries.includes(query);
    // A phone, or a tablet with nothing attached to it.
    expect(followsDocumentBackdrop(profile("(hover: none) and (pointer: coarse)"))).toBe(true);
    // THE REFINEMENT: the same device with a trackpad or a stylus. Its PRIMARY
    // pointer reports `hover` and `fine`, so a query about the primary pointer
    // alone leaves the follower unarmed on an iPad with a Magic Keyboard — a
    // device whose backdrop still scrolls, which is the bug being fixed.
    expect(followsDocumentBackdrop(profile("(any-pointer: coarse)", "(hover: hover)"))).toBe(true);
    // A desktop: unarmed, because it honours `fixed` and the same pixels stay
    // behind the text at every scroll position.
    expect(followsDocumentBackdrop(profile("(hover: hover)", "(pointer: fine)"))).toBe(false);
    expect(followsDocumentBackdrop(profile())).toBe(false);
    // A touchscreen laptop also matches `any-pointer: coarse` and DOES honour
    // the property. The follower arms there too, and the next test is the price:
    // a stricter bound, never a looser one.
    expect(followsDocumentBackdrop(profile("(any-pointer: coarse)", "(hover: hover)"))).toBe(true);
    // And the first query is enough on its own — `any-pointer` is for the
    // devices the primary-pointer query cannot see, not a requirement.
    expect(followsDocumentBackdrop(profile("(hover: none) and (pointer: coarse)"))).toBe(true);
  });

  test("where the gate is wrong it is wrong CONSERVATIVELY: a slice only narrows the ground", () => {
    // The claim the wider query rests on, walked over EVERY range of the sample
    // rather than stated in prose: a slice is a subset of the frame, so its
    // extremes lie inside the frame's extremes and its own average lies between
    // them. A bound built from a subset can therefore be stricter than the
    // frame's and can never be looser — which is what makes arming the follower
    // on a device that did not need it a cost in veil, never in readability.
    const whole = banded();
    let ranges = 0;
    for (let start = 0; start <= 3; start++) {
      for (let end = start; end <= 3; end++) {
        const where = `${start}..${end}`;
        const slice = slicePicture(whole, start, end);
        expect(slice.min.luminance, `${where}: the floor of the bound`).toBeGreaterThanOrEqual(
          whole.min.luminance,
        );
        expect(slice.max.luminance, `${where}: the ceiling of the bound`).toBeLessThanOrEqual(
          whole.max.luminance,
        );
        expect(slice.luminance, `${where}: the slice's own average`).toBeGreaterThanOrEqual(
          whole.min.luminance,
        );
        expect(slice.luminance, `${where}: the slice's own average`).toBeLessThanOrEqual(
          whole.max.luminance,
        );
        ranges++;
      }
    }
    // Ten ranges over four bands, every one of them measured: a suite that
    // walked one slice could not tell "subset" from "one lucky pair".
    expect(ranges).toBe(10);
  });
});

/**
 * THE CROP THE WINDOW SHOWS — the desktop path, which is where the report came
 * from.
 *
 * The scroll path above answers for the platform that paints the backdrop
 * against the DOCUMENT. The platform that honours `background-attachment: fixed`
 * needs the opposite treatment: `cover` is resolved against the WINDOW, the
 * picture stays put, and the part of the file behind the text is a centred crop
 * of it whose aspect is the window's. Measuring the whole file then decides for
 * pixels that were cropped away, and `worstRegion` is exactly the wrong compass
 * for that: it deliberately walks to the extreme the polarity's ink cannot read,
 * and that extreme can be the part nobody can see.
 *
 * So this suite pins three things: cover's arithmetic, the wiring that feeds it
 * the window, and the one claim that makes the whole change worth making — that
 * a decision taken on the crop is a decision about pixels on screen.
 */
describe("the crop the window shows: the desktop path", () => {
  const WHITE: Rgb = [255, 255, 255];
  const BLACK: Rgb = [0, 0, 0];

  /**
   * A canvas double that RECORDS its draws, over an `Image` with real sizes.
   *
   * The module-scope double above is deliberately thinner — its `Image` has no
   * `naturalWidth`, which is what makes it the "browser did not tell us a size"
   * case, and the drawing arguments are exactly what this suite is about, so
   * they have to be visible here rather than swallowed.
   */
  const withRecordingCanvas = (rgba: number[], image: { w: number; h: number }) => {
    const globals = globalThis as unknown as Record<string, unknown>;
    const hadDocument = "document" in globals;
    const hadImage = "Image" in globals;
    const previousDocument = globals["document"];
    const previousImage = globals["Image"];
    const draws: unknown[][] = [];

    globals["document"] = {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({
          drawImage: (...args: unknown[]) => {
            draws.push(args);
          },
          getImageData: () => ({ data: new Uint8ClampedArray(rgba) }),
        }),
      }),
    };
    globals["Image"] = class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = image.w;
      naturalHeight = image.h;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    };

    return {
      draws,
      restore: () => {
        if (hadDocument) globals["document"] = previousDocument;
        else delete globals["document"];
        if (hadImage) globals["Image"] = previousImage;
        else delete globals["Image"];
      },
    };
  };

  /** The decision, through the app's own function. */
  function decide(theme: string, measured: PictureSample, veil: number, t: number) {
    const decision = decideDynamicInk(
      measured,
      THEMES[theme as keyof typeof THEMES] as unknown as Record<string, string>,
      veil,
      "image",
      t,
    );
    if (!decision) throw new Error("no ink at all");
    return decision;
  }

  test("cover's arithmetic, on both sides of the aspect ratio and at the boundary", () => {
    // A portrait photo in a landscape window — the ordinary case this exists
    // for. Cover binds on the WIDTH, so the crop is as wide as the file and as
    // tall as the window's aspect allows, centred: the top and bottom thirds are
    // what the reader does not get.
    const portrait = visibleCrop(1000, 2000, 1600, 900)!;
    expect(portrait.sw).toBeCloseTo(1000, 6);
    expect(portrait.sh).toBeCloseTo(562.5, 6);
    expect(portrait.sx).toBeCloseTo(0, 6);
    expect(portrait.sy).toBeCloseTo((2000 - 562.5) / 2, 6);

    // And the other side of the ratio: a landscape picture in a portrait box
    // binds on the height and is cropped left and right.
    const landscape = visibleCrop(2000, 1000, 900, 1600)!;
    expect(landscape.sw).toBeCloseTo(562.5, 6);
    expect(landscape.sh).toBeCloseTo(1000, 6);
    expect(landscape.sx).toBeCloseTo((2000 - 562.5) / 2, 6);
    expect(landscape.sy).toBeCloseTo(0, 6);

    // Matching aspects: nothing to crop, and the answer says so rather than
    // cropping by a rounding error.
    expect(visibleCrop(1000, 1000, 500, 500)).toEqual({ sx: 0, sy: 0, sw: 1000, sh: 1000 });
  });

  test("a size the browser has not given us yet answers null, never a guess", () => {
    // A picture that has not finished decoding reports 0×0, and a box can be
    // zero-area mid-layout. Every one of these has to come back null so the
    // caller measures the whole file — the behaviour that shipped before this
    // function — rather than drawing a crop from a zero.
    expect(visibleCrop(0, 2000, 1600, 900)).toBeNull();
    expect(visibleCrop(1000, 0, 1600, 900)).toBeNull();
    expect(visibleCrop(1000, 2000, 0, 900)).toBeNull();
    expect(visibleCrop(1000, 2000, 1600, 0)).toBeNull();
    expect(visibleCrop(NaN, 2000, 1600, 900)).toBeNull();
    expect(visibleCrop(1000, 2000, 1600, NaN)).toBeNull();
  });

  test("the crop is inside the file, keeps the window's aspect, and drops as little as cover allows", () => {
    // Walked over aspect pairs instead of stated: a rectangle that ran off the
    // file, or that covered it without matching the window, would still pass
    // every hand-written example above.
    const boxes: Array<[number, number, number, number]> = [
      [1000, 2000, 1600, 900],
      [2000, 1000, 900, 1600],
      [1024, 768, 1512, 982],
      [800, 600, 375, 812],
      [1000, 1000, 1000, 1000],
      [4000, 3000, 1440, 900],
    ];
    for (const [iw, ih, bw, bh] of boxes) {
      const crop = visibleCrop(iw, ih, bw, bh);
      const where = `${iw}x${ih} in ${bw}x${bh}`;
      expect(crop, where).not.toBeNull();
      expect(crop!.sx, where).toBeGreaterThanOrEqual(0);
      expect(crop!.sy, where).toBeGreaterThanOrEqual(0);
      expect(crop!.sw, where).toBeLessThanOrEqual(iw + 1e-9);
      expect(crop!.sh, where).toBeLessThanOrEqual(ih + 1e-9);
      // The window's aspect — the definition of cover, and the property that
      // makes the crop a faithful stand-in for what is on screen.
      expect(crop!.sw / crop!.sh, where).toBeCloseTo(bw / bh, 6);
      // And the side that does NOT bind keeps the whole file — one of the two
      // fractions is exactly 1 — so nothing was cut that did not have to be.
      expect(Math.max(crop!.sw / iw, crop!.sh / ih), where).toBeCloseTo(1, 9);
      // The other side is the one that had to give.
      expect(Math.min(crop!.sw / iw, crop!.sh / ih), where).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  test("the sample is taken from that rectangle, and from the whole file when there is no box", async () => {
    // The wiring, end to end through `measurePicture`: the eight-argument draw
    // is what makes the measurement about the visible pixels, and the two draws
    // (coarse and bounded) must agree about the rectangle.
    const recording = withRecordingCanvas(
      [128, 128, 128, 255, 128, 128, 128, 255],
      { w: 1000, h: 2000 },
    );
    try {
      const measured = await measurePicture("data:image/png;base64,portrait", {
        width: 1600,
        height: 900,
      });
      expect(measured).not.toBeNull();
      expect(recording.draws.length).toBe(2);
      const [coarse, bounded] = recording.draws;
      // image, source rect, destination rect — the source rect is `visibleCrop`'s.
      expect(coarse!.slice(1)).toEqual([
        0,
        718.75,
        1000,
        562.5,
        0,
        0,
        LUMINANCE_SAMPLE,
        LUMINANCE_SAMPLE,
      ]);
      expect(bounded!.slice(1, 5)).toEqual([0, 718.75, 1000, 562.5]);
    } finally {
      recording.restore();
    }

    const whole = withRecordingCanvas([128, 128, 128, 255], { w: 1000, h: 2000 });
    try {
      await measurePicture("data:image/png;base64,portrait");
      // Five arguments: the whole file, scaled into the sample grid — the
      // shipped behaviour, kept for every fit that shows the whole picture.
      expect(whole.draws[0]).toEqual([
        whole.draws[0]![0],
        0,
        0,
        LUMINANCE_SAMPLE,
        LUMINANCE_SAMPLE,
      ]);
      expect(whole.draws[0]!.length).toBe(5);
    } finally {
      whole.restore();
    }
  });

  test("the box is the window, and only where cover is fitted to it", () => {
    // The gate, as the hook writes it: every fit but `cover` shows the whole
    // picture (`contain`, and `soft`, whose picture layer is `contain`), and the
    // platform that paints the backdrop against the document is answered by the
    // bands instead — a window-sized crop there would be a crop of the wrong
    // box entirely.
    expect(HOOK_SRC).toContain('if (fit !== "cover") return undefined;');
    expect(HOOK_SRC).toContain("followsDocumentBackdrop((query) => window.matchMedia(query).matches)");
    expect(HOOK_SRC).toContain("return { width: window.innerWidth, height: window.innerHeight };");
    expect(HOOK_SRC).toContain("measurePicture(background, coverBox(fit))");
  });

  test("a decision taken on the crop is a decision about pixels the reader can see", () => {
    // The claim the whole change rests on, and the reason the arithmetic alone
    // is not enough. The frame is the audit's own half-and-half photograph: mid
    // grey average, full-scale range. The polarity reads the AVERAGE, so the
    // decision walks to the DARKEST extreme — the black half — and picks the
    // light ink that reads on it. If the reader's window shows the WHITE half,
    // that ink is invisible on every word on screen, and no amount of sampling
    // precision helps: the wrong pixels were measured.
    const frame: PictureSample = {
      rgb: [128, 128, 128],
      luminance: 0.5,
      min: { rgb: BLACK, luminance: 0 },
      max: { rgb: WHITE, luminance: 1 },
    };
    const visible: PictureSample = {
      rgb: WHITE,
      luminance: 1,
      min: { rgb: WHITE, luminance: 1 },
      max: { rgb: WHITE, luminance: 1 },
    };

    const theme = "light";
    const veil = 0;
    const transparency = 0.95;
    const painted = effectiveVeil(veil, transparency);
    const groundOnScreen = groundWithPicture(
      token(theme, "surface"),
      worstCaseScrimRgb(isLight(THEMES[theme as keyof typeof THEMES].bg), "image"),
      painted,
      WHITE,
      transparency,
    );

    const onFrame = decide(theme, frame, veil, transparency);
    const onCrop = decide(theme, visible, veil, transparency);

    // The frame's answer, over the pixels the reader is actually looking at.
    expect(
      contrastRatio(parseHexRgb(onFrame.primary)!, groundOnScreen),
      "the whole-frame decision, over the white half that is on screen",
    ).toBeLessThan(WCAG_TEXT);
    // The crop's answer, over the same pixels.
    expect(
      contrastRatio(parseHexRgb(onCrop.primary)!, groundOnScreen),
      "the crop's decision, over the same pixels",
    ).toBeGreaterThanOrEqual(WCAG_TEXT);
    expect(onCrop.meetsAA).toBe(true);
    // And they are different inks, which is the point: a hook that measured the
    // whole file and reported the crop's answer would pass everything else.
    expect(onCrop.primary).not.toBe(onFrame.primary);
  });
});
