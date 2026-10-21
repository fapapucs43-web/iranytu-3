/**
 * WCAG contrast, computed rather than tabulated.
 *
 * WHY THIS IS A MODULE AND NOT A TEST HELPER. Two things now need the same
 * arithmetic and must not be allowed to disagree: `lib/imageBackground`, which
 * has to decide how far a card may fade before its own text stops being
 * readable, and `tests/contrast.test.ts`, which has to prove it. A ceiling
 * computed by one implementation and checked by another is not a guarantee, it
 * is two opinions — and the failure mode is silent, because a guard that
 * measures slightly differently from the thing it guards still passes.
 *
 * So the measurement lives here, once, and both import it. The test file keeps
 * its own `TEXT`/`NON_TEXT` names as aliases of the constants below rather than
 * restating the numbers, so a threshold change is one edit.
 *
 * THE ARITHMETIC IS sRGB THROUGHOUT, which is a deliberate mismatch with the
 * spec and worth being explicit about. WCAG's ratios are defined on LINEAR
 * light, and `relativeLuminance` below linearises each channel first, as it
 * must. Compositing, however, is NOT linear light: CSS composites in the
 * encoding the author wrote, so `rgba()` over a backdrop and `color-mix()` in
 * `srgb` both average 8-bit sRGB values. `over` therefore averages in sRGB,
 * which is what the browser does, and only the resulting colour is handed to
 * the linearising step. Compositing in linear light would be "more correct"
 * physics and would not describe any screen.
 */

/** An sRGB triple, 0–255 per channel. */
export type Rgb = readonly [number, number, number];

/** WCAG 2.2 §1.4.3 for body text. */
export const WCAG_TEXT = 4.5;

/** WCAG 2.2 §1.4.11 for icons, borders and other non-text UI. */
export const WCAG_NON_TEXT = 3;

/**
 * `#rrggbb` to a triple. Anything else — a named colour, a `rgb()` string, a
 * number — comes back as `null` rather than as a plausible-looking zero.
 *
 * A silent fallback to black would be the worst possible failure here: the
 * functions below are about deciding whether text is readable, and an
 * unparseable colour that quietly becomes the darkest thing in the palette
 * makes a failing case look like a passing one.
 */
export function parseHexRgb(hex: unknown): Rgb | null {
  if (typeof hex !== "string") return null;
  const body = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(body)) return null;
  return [
    parseInt(body.slice(0, 2), 16),
    parseInt(body.slice(2, 4), 16),
    parseInt(body.slice(4, 6), 16),
  ];
}

/** One sRGB channel, linearised. The 0.04045 break is the WCAG-specified one. */
function linearise(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/**
 * Relative luminance, sRGB, per WCAG 2.2.
 *
 * Not the same as `isLight` in `lib/themes`, and the two must not be merged.
 * `isLight` is a cheap perceptual average whose job is picking a foreground;
 * this is the quantity WCAG defines a ratio on, and averaging un-linearised
 * channels is exactly the mistake that makes a hand-rolled checker disagree
 * with a real screen.
 */
export function relativeLuminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map(linearise);
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/**
 * The contrast ratio between two colours, order-independent.
 *
 * WCAG's `(L1 + 0.05) / (L2 + 0.05)` with the lighter colour on top, which is
 * what makes a ratio comparable between a dark-on-light and a light-on-dark
 * pair. Anything at or above 1 is a valid ratio; the sort is not a
 * correctness detail, it is what lets a caller pass the two colours in either
 * order.
 */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * `rgba(front, alpha)` painted over `back`, as the browser composites it.
 *
 * SOURCE-ALPHA COMPOSITING, in the 8-bit sRGB space the declaration was
 * written in. There is no alpha < 1 on `back` here and that is deliberate:
 * every call site passes a ground that is already opaque, because a translucent
 * backdrop means the composite is not a function of these two colours alone and
 * the caller would be guessing at the rest.
 */
export function over(front: Rgb, alpha: number, back: Rgb): Rgb {
  const a = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
  return [
    front[0] * a + back[0] * (1 - a),
    front[1] * a + back[1] * (1 - a),
    front[2] * a + back[2] * (1 - a),
  ];
}
