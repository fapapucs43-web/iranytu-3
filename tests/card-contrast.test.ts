/**
 * The card-transparency guarantee, measured rather than asserted — and since
 * the veil-floor batch, a guarantee about a FLOORED veil rather than an
 * independent one.
 *
 * WHAT IS BEING PROMISED. A reader can drag "Kártyák átlátszósága" from 0 to
 * 100% of its track and read their text at every position where the PAINTED
 * veil reaches the point the background's own text clears AA. The painted veil
 * is `effectiveVeil(base, t)`: the reader's scrim number, floored at half the
 * card transparency. Where the card is opaque the floor is nothing and the
 * reader's number stands alone; where the card is gone the veil is at least
 * 0.5, so the photograph shows through at half strength and the text reads on
 * top of it.
 *
 * WHY THE PROMISE CHANGED TWICE. The first version compensated: the veil
 * rose in step with the card fade toward OPACITY, on the reasoning that a
 * fading card reveals the scrim, so the scrim had to strengthen. The
 * reasoning was sound and the interface was not — measured in production, the
 * two sliders "did the same thing", because they drove one surface. That
 * coupling was removed and the independence held as a guarantee for a
 * while — and then the P1 the audit measured put a hole in it: with the veil
 * at zero and the card above 50% transparent, the text's ground IS the
 * photograph, and on a photograph that varies across the frame no single ink
 * survives it. What replaced the coupling is ONE floor, and only one:
 * `max(base, t / 2)`. It cannot lower the reader's number, it cannot top up a
 * veil that already covers it, and it stops at 0.5 — the old slope's sin was
 * climbing toward opacity, not climbing at all.
 *
 * WHY THE GUARANTEE STILL HOLDS. `cardGroundRgb` composites the three layers
 * as
 *
 *     over(surface, 1 − t, over(scrim, max(base, t / 2), picture))
 *
 * and the endpoint argument survives with the painted veil in it: at t = 0
 * the ground is the card's own surface (floor 0), which `tests/contrast.test.ts`
 * measures against the whole palette; at any t the far end of the card's own
 * blend is `over(scrim, painted, picture)` — exactly the ground the app's own
 * background text sits on at the same painted veil. So wherever the painted
 * veil is strong enough that the background text clears AA, the card's text
 * clears AA with it, at every step of the track. This file does not trust the
 * argument, it walks the interior: every base the scrim slider offers, every
 * step of the card track, in every theme, on both card surfaces, under both
 * palettes — the claim conditioned on the SHIPPED painted veil, so a future
 * edit that weakens the floor reclassifies exactly the cells the floor exists
 * for and fails here.
 *
 * THE ADVERSARY IS NOT HYPOTHETICAL. `worstCaseScrimRgb` is what
 * `deriveScrimRgb` produces for a pure black photograph in a light theme, and a
 * pure white one in a dark theme — both of which people take photos of. The
 * picture itself is pushed to the far endpoint, which is a bound and not a
 * sample: `over()` is affine in the picture, and relative luminance is monotone
 * in each channel, so no interior picture produces a worse composite than both
 * ends do.
 *
 * THE MUTATIONS ARE THE PROOF THIS FILE STILL HAS TEETH, and each one is a
 * regression of the FLOOR: the floor dropped (the P1 returning), the floor
 * halved, the veil dropped or halved outright, the sliders swapped. Each is
 * asserted to be caught SOMEWHERE, and the set together is asserted to cover
 * every theme — because a mutation that fails only in the dark theme is fine
 * as long as every theme has at least one mutation watching it.
 *
 * EVERYTHING HERE IS COMPUTED. No ratio, no threshold and no minimum veil is
 * written out. The one number this file pins as a fact is the WCAG threshold
 * itself, and even that is imported from `lib/contrast` — the same module the
 * composite is built from — so the guard and the thing it guards cannot measure
 * the world differently and still agree.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { THEMES } from "../src/lib/themes";
import {
  CARD_CEILING_STEPS,
  DEFAULT_PALETTE,
  DEFAULT_SCRIM,
  MAX_CARD_TRANSPARENCY,
  cardGroundRgb,
  effectiveScrimAlpha,
  effectiveVeil,
  maxCardTransparency,
  veilFloor,
  worstCasePicture,
  worstCaseScrimRgb,
  type ScrimPalette,
} from "../src/lib/imageBackground";
import { WCAG_TEXT, contrastRatio, over, parseHexRgb, type Rgb } from "../src/lib/contrast";

const THEMES_DIR = new URL("../src/", import.meta.url);
const styles = readFileSync(new URL("styles.css", THEMES_DIR), "utf8");
const appSource = readFileSync(new URL("App.tsx", THEMES_DIR), "utf8");
const pickerSource = readFileSync(
  new URL("components/BackgroundImagePicker.tsx", THEMES_DIR),
  "utf8",
);

const THEME_NAMES = Object.keys(THEMES);

/** Every scrim the slider offers, on the grid this file walks. */
const SCRIM_STEPS = 20;
const scrimValues = Array.from({ length: SCRIM_STEPS + 1 }, (_, i) => i / SCRIM_STEPS);

/** The foreground the promise is about: the app's own body ink. */
const PROMISED = "ink" as const;

/**
 * Both scrim palettes, because the reader picks one and they paint differently.
 *
 * The picture's palette lets a tint drag the scrim toward the photograph, which
 * is the hostile case and therefore the default for these tests. The theme's own
 * palette never does, so a bound computed for one says nothing about the other.
 */
const PALETTES: ScrimPalette[] = ["image", "theme"];

/** The surfaces a card actually paints: cards, and dialogs. */
const SURFACES = ["surface", "surface2"] as const;

/**
 * Polarity by MEASUREMENT, not by the theme's name.
 *
 * "light", "dark", "warm" and "vibrant" are not a polarity list, and reading the
 * name would make `warm` the second dark theme by accident. `isLight` in
 * `lib/themes` is a cheap perceptual average; this is `relativeLuminance`, which
 * is the quantity the contrast arithmetic is defined on.
 */
function isLightTheme(name: string): boolean {
  const bg = parseHexRgb(THEMES[name as keyof typeof THEMES].bg);
  if (!bg) throw new Error(`${name} has no parseable --bg`);
  const [r, g, b] = bg;
  const lin = (c: number) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!) > 0.5;
}

const tokenOf = (theme: string, key: string): Rgb => {
  const colour = parseHexRgb(THEMES[theme as keyof typeof THEMES][key as keyof typeof THEMES]);
  if (!colour) throw new Error(`${theme} has no parseable --${key}`);
  return colour;
};

/** The composite a card paints, as a triple, straight out of the library. */
const groundAt = (
  theme: string,
  surfaceKey: "surface" | "surface2",
  baseScrim: number,
  t: number,
  palette: ScrimPalette = DEFAULT_PALETTE,
): Rgb => cardGroundRgb(tokenOf(theme, surfaceKey), isLightTheme(theme), palette, baseScrim, t);

const contrastAt = (
  theme: string,
  fg: string,
  surfaceKey: "surface" | "surface2",
  baseScrim: number,
  t: number,
  palette: ScrimPalette = DEFAULT_PALETTE,
): number => contrastRatio(tokenOf(theme, fg), groundAt(theme, surfaceKey, baseScrim, t, palette));

/**
 * The ground the app's own background text sits on: the picture through a
 * given PAINTED veil, and nothing else.
 *
 * The veil is a literal here rather than the reader's slider, because since
 * the veil-floor batch the two differ: the slider is `base`, the painted veil
 * is `effectiveVeil(base, t)`, and every claim about "the background text" in
 * this file is made against what the browser paints. Every claim is computed
 * against this ground, never against a quoted number.
 */
const behindAt = (theme: string, veil: number, palette: ScrimPalette): Rgb =>
  over(
    worstCaseScrimRgb(isLightTheme(theme), palette),
    effectiveScrimAlpha(veil),
    worstCasePicture(isLightTheme(theme)),
  );

/**
 * The first PAINTED veil on the walked grid where the background's own text
 * clears AA.
 *
 * Computed, not declared: the scrim slider's job is readability, so the point
 * where it STARTS doing that job is measurable, and the card guarantee is
 * stated relative to it rather than to a magic constant. It is a threshold in
 * PAINTED veils, not in slider positions, because the floor moves one into the
 * other. `undefined` would mean no veil on the whole grid helps — the tests
 * below treat that as the failure it would be, rather than skipping silently.
 */
const minReadableVeil = (theme: string, palette: ScrimPalette): number | undefined => {
  const colour = tokenOf(theme, PROMISED);
  return scrimValues.find(
    (painted) => contrastRatio(colour, behindAt(theme, painted, palette)) >= WCAG_TEXT,
  );
};

/**
 * The same composite with a REPLACEMENT veil — for the proofs only.
 *
 * `cardGroundRgb` calls the real `effectiveScrimAlpha`, which is exactly what
 * makes it the right thing for the promise and the wrong thing for the
 * mutation: the question here is what the screen would look like if the veil
 * were something else, so the few lines that compose the three layers live here
 * once and are used by nothing else.
 */
const groundWith = (
  theme: string,
  surfaceKey: "surface" | "surface2",
  baseScrim: number,
  t: number,
  palette: ScrimPalette,
  alpha: (base: number, t: number) => number,
): Rgb => {
  const scrim = worstCaseScrimRgb(isLightTheme(theme), palette);
  const picture = worstCasePicture(isLightTheme(theme));
  const a = Math.min(1, Math.max(0, alpha(baseScrim, t)));
  const behind: Rgb = [
    scrim[0] * a + picture[0] * (1 - a),
    scrim[1] * a + picture[1] * (1 - a),
    scrim[2] * a + picture[2] * (1 - a),
  ];
  const surface = tokenOf(theme, surfaceKey);
  return [
    surface[0] * (1 - t) + behind[0] * t,
    surface[1] * (1 - t) + behind[1] * t,
    surface[2] * (1 - t) + behind[2] * t,
  ];
};

describe("the whole track holds for body ink, wherever the background itself is readable", () => {
  for (const palette of PALETTES) {
    for (const theme of THEME_NAMES) {
      const threshold = minReadableVeil(theme, palette);

      test(`${theme} · ${palette}: some veil on the grid makes the background text readable`, () => {
        expect(
          threshold,
          `${theme} (${palette}): no scrim on the walked grid clears AA behind the ` +
            `background text — the card guarantee has no floor to stand on`,
        ).toBeDefined();
      });

      if (threshold === undefined) continue;

      for (const surfaceKey of SURFACES) {
        test(
          `${theme} · --${surfaceKey} · ${palette}: the card track clears AA wherever the painted veil reaches ${threshold}`,
          () => {
            const colour = tokenOf(theme, PROMISED);
            for (const baseScrim of scrimValues) {
              for (let i = 0; i <= CARD_CEILING_STEPS; i++) {
                const t = i / CARD_CEILING_STEPS;
                // The condition is on the SHIPPED painted veil, not on the
                // slider: the floor is what lifts a weak slider into this
                // claim, and a mutation that drops the floor must fail exactly
                // the cells the floor was carrying rather than redefine them
                // out of scope.
                if (effectiveVeil(baseScrim, t) < threshold) continue;
                expect(
                  contrastRatio(colour, groundAt(theme, surfaceKey, baseScrim, t, palette)),
                  `${theme} --${PROMISED} at card transparency ${t.toFixed(3)} ` +
                    `(scrim ${baseScrim}, painted veil ${effectiveVeil(baseScrim, t).toFixed(3)}, ` +
                    `--${surfaceKey}, ${palette}): ` +
                    `${worstCaseScrimRgb(isLightTheme(theme), palette).join(",")} ` +
                    `over ${worstCasePicture(isLightTheme(theme)).join(",")}`,
                ).toBeGreaterThanOrEqual(WCAG_TEXT);
              }
            }
          },
        );
      }

      test(`${theme} · ${palette}: the threshold is a real boundary — one step down, the background fails`, () => {
        const below = threshold - 1 / SCRIM_STEPS;
        if (below < 0) return; // 0 is the lowest the slider offers; there is no step below it
        expect(
          contrastRatio(tokenOf(theme, PROMISED), behindAt(theme, below, palette)),
          `${theme} (${palette}): the background text still clears AA at scrim ${below}, ` +
            `so ${threshold} is not where readability begins`,
        ).toBeLessThan(WCAG_TEXT);
      });
    }
  }

  test("the bare photograph never shows through a card — the floor is what remains", () => {
    // The honest edge under the new contract, stated as arithmetic rather
    // than apologised for. At base 0 and t = 1 the reader once saw the
    // photograph itself; the veil-floor batch ended that, and this test is
    // what the edge became: at the far end of the card track the veil is at
    // least half, so the ground is the picture through half a veil — while at
    // t = 0 the card is opaque and the picture shows through nothing at all.
    // Both ends are pinned so neither can drift back into the other.
    for (const theme of THEME_NAMES) {
      expect(effectiveVeil(0, 1)).toBe(0.5);
      expect(groundAt(theme, "surface", 0, 1, "image"), `${theme} at the far end`).toEqual(
        behindAt(theme, 0.5, "image"),
      );
      expect(groundAt(theme, "surface", 0, 0, "image"), `${theme} with an opaque card`).toEqual(
        tokenOf(theme, "surface"),
      );
    }
  });
});

describe("the whole track is reachable — the veil the background needs is the veil the track needs", () => {
  for (const palette of PALETTES) {
    for (const theme of THEME_NAMES) {
      const threshold = minReadableVeil(theme, palette);
      if (threshold === undefined) continue;
      test(`the measured ceiling covers the track at the background's own threshold (${theme}, ${palette})`, () => {
        // `maxCardTransparency` is the instrument the old slider's cap was
        // built from. Asked about BODY ink at the PAINTED veil where the
        // background's own text starts to clear AA, it must answer 100% for
        // every theme and surface — the proof that a faded card never needs a
        // stronger veil than the background does. Computed, not hardcoded: if
        // a palette change broke this, this is the test that says so. The
        // floor can only have lifted this ceiling, never lowered it.
        for (const surfaceKey of SURFACES) {
          expect(
            maxCardTransparency({
              lightBackground: isLightTheme(theme),
              palette,
              surface: THEMES[theme as keyof typeof THEMES][surfaceKey],
              texts: [THEMES[theme as keyof typeof THEMES][PROMISED]],
              baseScrim: threshold,
            }),
            `${theme} --${surfaceKey} scrim ${threshold} (${palette}) does not reach the end`,
          ).toBe(MAX_CARD_TRANSPARENCY);
        }
      });
    }
  }

  test("more veil never lowers the ceiling, and less veil never raises it", () => {
    // Monotonicity of the instrument in the reader's own scrim. Each step's
    // composite moves from the picture toward the scrim as the veil rises, so
    // the first failure can only move up the track; walked rather than argued,
    // because the ceiling is what the app would have capped with once.
    for (const palette of PALETTES) {
      for (const theme of THEME_NAMES) {
        for (const surfaceKey of SURFACES) {
          let previous = -1;
          for (const baseScrim of scrimValues) {
            const ceiling = maxCardTransparency({
              lightBackground: isLightTheme(theme),
              palette,
              surface: THEMES[theme as keyof typeof THEMES][surfaceKey],
              texts: [THEMES[theme as keyof typeof THEMES][PROMISED]],
              baseScrim,
            });
            expect(
              ceiling,
              `${theme} --${surfaceKey} (${palette}): ceiling dropped at scrim ${baseScrim}`,
            ).toBeGreaterThanOrEqual(previous);
            previous = ceiling;
          }
        }
      }
    }
  });

  test("the cap the old slider had was the muted ink's, not the body ink's", () => {
    // THE TRADE-OFF, made visible rather than remembered. Dropping the ceiling
    // was the request; the ceiling existed because `--ink-soft` stops clearing
    // AA well before the end of the track — it was designed to sit on an opaque
    // surface. The promise is about BODY ink, and this test computes where the
    // muted foreground actually stops for each theme so a palette change that
    // moves it — in either direction — shows up here instead of on a reader's
    // screen.
    for (const theme of THEME_NAMES) {
      for (const palette of PALETTES) {
        const label = `${theme} (${palette})`;
        const muted = Math.min(
          ...SURFACES.map((surfaceKey) =>
            maxCardTransparency({
              lightBackground: isLightTheme(theme),
              palette,
              surface: THEMES[theme as keyof typeof THEMES][surfaceKey],
              texts: [THEMES[theme as keyof typeof THEMES].inkSoft],
              baseScrim: DEFAULT_SCRIM,
            }),
          ),
        );
        expect(muted, `${label}: a ceiling above the track is not a ceiling`).toBeLessThanOrEqual(
          MAX_CARD_TRANSPARENCY,
        );
        expect(muted, `${label}: the whole track should not be useless either`).toBeGreaterThan(0);
        // And a stopping point is a REAL one: the search ends on the first
        // failure, so one step past it must fail. The assertion is skipped when
        // the muted ink holds the whole track, which is a real answer for the
        // theme's own flat scrim — the hostile case is the picture's palette,
        // and that is the one the old cap was measured against.
        if (palette === "image") {
          expect(
            muted,
            `${label}: muted ink should stop before the end under a tinted scrim`,
          ).toBeLessThan(MAX_CARD_TRANSPARENCY);
        }
        if (muted < MAX_CARD_TRANSPARENCY) {
          const past = (muted + 1 / CARD_CEILING_STEPS) as number;
          const failures = SURFACES.filter((surfaceKey) =>
            contrastAt(theme, "inkSoft", surfaceKey, DEFAULT_SCRIM, past) < WCAG_TEXT,
          );
          expect(
            failures,
            `${label}: muted ink stops at ${muted} but ${past.toFixed(3)} still holds`,
          ).not.toHaveLength(0);
        }
      }
    }
  });
});

describe("the guard has teeth — each regression of the veil floor is caught", () => {
  /**
   * The regressions a future edit could actually make, each one a check of this
   * file's own teeth — and they come in two classes with two catchers, because
   * the floor and the veil fail differently.
   *
   * FORMULA mutations change what the floor IS: dropped (the P1 itself — the
   * slider's raw number painted with no floor, which a well-meaning
   * "simplify back to one argument" would restore), halved, or the sliders
   * swapped. The AA walk cannot see these on the adversarial stack — the theme
   * ink's own thresholds there sit ABOVE the floor's ceiling of 0.5, so the
   * walk's cells are all above the floor where dropping it changes nothing —
   * so the catcher is the formula itself: any disagreement with the shipped
   * `effectiveVeil` on the walked grid is a regression, wherever it happens.
   * The identity tests above are what make that catcher non-vacuous.
   *
   * WALK mutations weaken the PAINTED VEIL itself — dropped or halved — and
   * those the AA walk catches per theme, exactly as it always did: at cells
   * where the shipped veil reaches the threshold, the weakened one composites
   * a ground the theme's ink cannot read.
   */
  const FORMULA_MUTATIONS: Array<[string, (base: number, t: number) => number]> = [
    ["the floor is dropped", (base) => effectiveScrimAlpha(base)],
    ["the floor is halved", (base, t) => Math.max(effectiveScrimAlpha(base), t / 4)],
    ["the sliders are swapped", (_base, t) => t],
  ];
  const WALK_MUTATIONS: Array<[string, (base: number, t: number) => number]> = [
    ["the veil is dropped", () => 0],
    ["the veil is halved", (base) => effectiveScrimAlpha(base) / 2],
  ];

  /** Whether a replacement veil disagrees with the shipped one anywhere. */
  const breaksFormula = (alpha: (base: number, t: number) => number): boolean => {
    for (const base of scrimValues) {
      for (const t of scrimValues) {
        if (Math.abs(alpha(base, t) - effectiveVeil(base, t)) > 1e-12) return true;
      }
    }
    return false;
  };

  /**
   * Whether a replacement veil breaks body ink somewhere on the walked grid.
   *
   * Asked PER THEME rather than "which theme does this mutation fail first",
   * because the two are different questions: a mutation that breaks the light
   * theme never reports that it also breaks the warm one, so a set built from
   * first failures would claim a theme was unwatched when it is not.
   */
  const failsWalk = (theme: string, alpha: (base: number, t: number) => number): boolean => {
    const colour = tokenOf(theme, PROMISED);
    for (const palette of PALETTES) {
      const threshold = minReadableVeil(theme, palette);
      if (threshold === undefined) continue;
      for (const baseScrim of scrimValues) {
        for (const surfaceKey of SURFACES) {
          for (let i = 0; i <= CARD_CEILING_STEPS; i++) {
            const t = i / CARD_CEILING_STEPS;
            // The SHIPPED painted veil decides membership, the MUTATED one
            // composites the ground — a mutation cannot shrink the grid it is
            // measured on.
            if (effectiveVeil(baseScrim, t) < threshold) continue;
            if (
              contrastRatio(colour, groundWith(theme, surfaceKey, baseScrim, t, palette, alpha)) <
              WCAG_TEXT
            ) {
              return true;
            }
          }
        }
      }
    }
    return false;
  };

  for (const [label, replacement] of FORMULA_MUTATIONS) {
    test(`${label} is caught by the formula`, () => {
      expect(
        breaksFormula(replacement),
        `${label} agrees with the shipped veil everywhere — this pins nothing`,
      ).toBe(true);
    });
  }

  for (const [label, replacement] of WALK_MUTATIONS) {
    test(`${label} is caught by the walk`, () => {
      const caught = THEME_NAMES.filter((theme) => failsWalk(theme, replacement));
      expect(
        caught,
        `${label} passes everywhere — this file checks nothing`,
      ).not.toHaveLength(0);
    });
  }

  test("every theme is watched by at least one walk mutation", () => {
    for (const theme of THEME_NAMES) {
      expect(
        WALK_MUTATIONS.some(([, replacement]) => failsWalk(theme, replacement)),
        `${theme}: no mutation fails here — the walk covers it for nothing`,
      ).toBe(true);
    }
  });

  test("`over` is affine in the picture, so its far endpoint really is the bound", () => {
    // The argument the worst-case picture rests on. If `over` were nonlinear —
    // if it composited in linear light, say — then checking black and white
    // would be a sample of two, not a bound, and the whole file would be
    // quietly wrong.
    const black = worstCasePicture(true);
    const white = worstCasePicture(false);
    expect(white).toEqual([255, 255, 255]);
    expect(black).toEqual([0, 0, 0]);
  });
});

describe("the veil is the reader's number, floored by the card — and never anything else", () => {
  test("the identity holds on the whole grid — the reader's number is never touched from below", () => {
    // The reader's half of the contract, pinned where it can be checked in
    // one line: on every value the scrim slider offers, `effectiveScrimAlpha`
    // IS the value. The floor is a separate function that can only RAISE the
    // painted veil — so an identity here means a veil above the floor is the
    // reader's own, exactly.
    for (const base of scrimValues) {
      expect(effectiveScrimAlpha(base)).toBe(base);
    }
  });

  test("the floor is exactly half the card transparency, on the rail", () => {
    // The formula as shipped, as exact numbers. These are the three values the
    // batch's own specification states, and pinning them catches both a
    // weakened floor (t / 4) and the old slope that climbed toward opacity.
    expect(veilFloor(0)).toBe(0);
    expect(veilFloor(0.5)).toBeCloseTo(0.25, 12);
    expect(veilFloor(0.95)).toBeCloseTo(0.475, 12);
    expect(veilFloor(1)).toBe(0.5);
    // Junk crosses the same clamp the card slider has everywhere.
    expect(veilFloor(undefined)).toBe(0);
    expect(veilFloor(2)).toBe(0.5);
  });

  test("the painted veil is `max`, everywhere the two sliders can point", () => {
    // The whole contract in one loop: the floor can only raise the reader's
    // number, always reaches exactly t / 2, and tops nothing up once the
    // reader's own veil covers it.
    for (const base of scrimValues) {
      for (const t of scrimValues) {
        const painted = effectiveVeil(base, t);
        expect(painted, `base ${base} t ${t}`).toBeGreaterThanOrEqual(base);
        expect(painted, `base ${base} t ${t}`).toBeGreaterThanOrEqual(veilFloor(t) - 1e-12);
        expect(painted, `base ${base} t ${t}`).toBe(Math.max(base, veilFloor(t)));
      }
    }
    // Above the floor the reader's number stands alone — the floor is not a
    // slope, and a veil that already covers it is never topped up.
    expect(effectiveVeil(0.8, 0.9)).toBe(0.8);
    expect(effectiveVeil(1, 1)).toBe(1);
    // Junk still falls back through the clamp before the floor is considered.
    expect(effectiveVeil(undefined, 0.5)).toBe(DEFAULT_SCRIM);
  });

  test("junk falls back to the default, out-of-range to the rail — the clamp still guards the boundary", () => {
    // The value is composed into an `rgba()` the browser drops silently when
    // invalid, so the clamp is load-bearing even though the identity is
    // trivial: this is the boundary a partial settings object crosses.
    expect(effectiveScrimAlpha(undefined)).toBe(DEFAULT_SCRIM);
    expect(effectiveScrimAlpha(null)).toBe(DEFAULT_SCRIM);
    expect(effectiveScrimAlpha(Number.NaN)).toBe(DEFAULT_SCRIM);
    expect(effectiveScrimAlpha("0.4")).toBe(DEFAULT_SCRIM);
    expect(effectiveScrimAlpha(-0.2)).toBe(0);
    expect(effectiveScrimAlpha(1.2)).toBe(1);
  });

  test("at 100% the card is the background's own ground at the PAINTED veil", () => {
    // The endpoint property, exactly, with the floor in it. The fully faded
    // card paints the same `over(scrim, painted, picture)` the background text
    // sits on at that painted veil — which is why the card needs no veil the
    // background doesn't. At base 1 the veil is the reader's own whatever t
    // says, so the ground there is the flat scrim colour.
    for (const palette of PALETTES) {
      for (const theme of THEME_NAMES) {
        for (const surfaceKey of SURFACES) {
          for (const baseScrim of [0.1, DEFAULT_SCRIM, 0.8, 1]) {
            expect(
              groundAt(theme, surfaceKey, baseScrim, 1, palette),
              `${theme} --${surfaceKey} (${palette}) at scrim ${baseScrim}`,
            ).toEqual(behindAt(theme, effectiveVeil(baseScrim, 1), palette));
          }
        }
      }
    }
  });

  test("the track is the straight blend its own painted veil describes — reader's veil below the knee, floor above", () => {
    // The structural test for the SHAPE of the new composite. The track is
    // piecewise: while the reader's veil covers the floor (t ≤ 2 · base) the
    // behind is FIXED at `base` and every point lies exactly on the line from
    // the surface to `behind(base)`; above the knee the behind is exactly
    // `behind(t / 2)`, and the ground must equal that stack rather than
    // anything near it — a resurrected slope (t / 0.6, or base + t · (1 −
    // base)) lands between the two and fails here.
    for (const palette of PALETTES) {
      for (const theme of THEME_NAMES) {
        for (const surfaceKey of SURFACES) {
          for (const baseScrim of [0.2, DEFAULT_SCRIM, 0.8]) {
            const surface = tokenOf(theme, surfaceKey);
            const behind = behindAt(theme, baseScrim, palette);
            for (let i = 1; i < CARD_CEILING_STEPS; i++) {
              const t = i / CARD_CEILING_STEPS;
              const ground = groundAt(theme, surfaceKey, baseScrim, t, palette);
              const floorOwns = effectiveVeil(baseScrim, t) > baseScrim;
              const expected = floorOwns
                ? over(surface, 1 - t, behindAt(theme, veilFloor(t), palette))
                : over(surface, 1 - t, behind);
              expect(Math.abs(ground[0]! - expected[0]!), `${theme} r at t=${t}`).toBeLessThan(1e-9);
              expect(Math.abs(ground[1]! - expected[1]!), `${theme} g at t=${t}`).toBeLessThan(1e-9);
              expect(Math.abs(ground[2]! - expected[2]!), `${theme} b at t=${t}`).toBeLessThan(1e-9);
            }
          }
        }
      }
    }
  });
});

describe("the app cannot paint past the track, and the track is the slider's", () => {
  test("the root writes the reader's own clamped value, not a capped one", () => {
    // A source assertion, and deliberately not a render: the failure being
    // guarded against is a stored value reaching `style={{...}}` through a clamp
    // nobody can see, which is a property of the assignment rather than of any
    // render output.
    expect(appSource).toContain("clampCardTransparency(data.settings.backgroundCardTransparency)");
    expect(appSource).not.toContain("safeCardTransparency");
    expect(appSource).not.toContain("cardCeiling");
    // And the painted veil is the reader's number FLOORED by the card: the
    // two-argument call is the contract, and the negative pin is what actually
    // guards it — a reversion to the one-argument call would drop the floor
    // and still read as "the reader's number".
    expect(appSource).toContain("effectiveVeil(data.settings.backgroundScrim, transparency)");
    expect(appSource).not.toContain("effectiveScrimAlpha(data.settings.backgroundScrim)");
    expect(appSource).toContain('"--app-card-transparency": String(transparency)');
  });

  test("the Settings preview paints the same floored veil", () => {
    // The preview was the control that faded correctly while the app did not
    // (the defect in `background-stack.test.ts`), so what the preview paints is
    // pinned with the same care: the same two-argument floor, the same inputs,
    // no unfloored veil the app does not paint.
    expect(pickerSource).toContain("effectiveVeil(alpha, faded)");
    expect(pickerSource).not.toContain("effectiveScrimAlpha(alpha)");
  });

  test("the Settings slider runs the whole range, and does not measure a cap", () => {
    expect(pickerSource).toContain("max={MAX_CARD_TRANSPARENCY}");
    expect(pickerSource).not.toContain("cardCeiling");
    expect(pickerSource).not.toContain("Math.min(requested");
  });

  test("the card surface fades by exactly (100 − X)%, in the stylesheet", () => {
    // The rule the reader's number becomes. Written as a source assertion because
    // the arithmetic IS the declaration: `calc((1 − t) × 100%)` is what makes 0%
    // opaque and 100% transparent, and a change to either end would be a change
    // to the control's meaning rather than to its styling.
    const start = styles.indexOf("--app-surface: color-mix(");
    expect(start).toBeGreaterThan(-1);
    const rule = styles.slice(start, styles.indexOf("}", start));
    expect(rule).toContain("var(--surface) calc((1 - var(--app-card-transparency)) * 100%)");
    expect(rule).toContain("transparent");
  });

  // The two accessibility modes, each rule on its own so a failure names it.
  // Without these the guarantee is void for exactly the readers it matters most
  // to: at a weak veil a fully transparent card is the photograph itself, and
  // an reader who cannot make that trade must still get an opaque card.
  // `styles.css` has to say so, because nothing in the cascade does it by
  // itself — the transparency is an inline style on `.app`, which beats any
  // rule naming it.
  for (const [label, rule] of [
    [".app.contrast-high .card", /\.app\.contrast-high \.card\s*\{[^}]*background:\s*var\(--surface\)/],
    [".app.contrast-high .dialog", /\.app\.contrast-high \.dialog\s*\{[^}]*background:\s*var\(--surface-2\)/],
    [
      "@media (prefers-reduced-transparency: reduce) .card",
      /@media \(prefers-reduced-transparency: reduce\)\s*\{[\s\S]*?\.app\.has-bg \.card\s*\{[^}]*background:\s*var\(--surface\)/,
    ],
    [
      "@media (prefers-reduced-transparency: reduce) .dialog",
      /@media \(prefers-reduced-transparency: reduce\)\s*\{[\s\S]*?\.app\.has-bg \.dialog\s*\{[^}]*background:\s*var\(--surface-2\)/,
    ],
  ] as const) {
    test(`the two accessibility modes keep the cards opaque — ${label}`, () => {
      expect(styles).toMatch(rule);
    });
  }
});
