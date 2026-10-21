/**
 * THE INK THAT FOLLOWS THE PICTURE.
 *
 * The app paints three translucent layers — the picture, the reader's veil and
 * the card — and the text sits on whatever comes out. Until now the ink was
 * whatever the theme said, which is correct on a solid surface and a coin flip
 * on a photograph. This module answers one question: given the ground under the
 * text, which ink should be used?
 *
 * THREE PARTS, AND THE ORDER THEY ARE USED IN MATTERS.
 *
 *  1. `averageRelativeLuminance` — the picture's own brightness, measured once
 *     from sampled pixels. It is a TYPICAL value, not a bound: a photograph is
 *     not obliged to be one colour, and an average of a half-white image is
 *     grey. So it is used to choose, never to promise.
 *
 *  2. `dynamicInkCandidates` — the four inks a ground can be read against, in
 *     preference order: the theme's own ink (so a reader with no picture, or a
 *     picture that happens to suit the theme, sees no change at all), then the
 *     theme's page background (the other end of the same palette), then pure
 *     black and pure white.
 *
 *  3. `pickDynamicInk` — the first candidate that clears WCAG AA against EVERY
 *     ground it is given. Black and white are in the list for a reason that is
 *     arithmetic rather than taste: for any ground, at least one of them clears
 *     4.5:1, because the contrast of white against a ground of luminance L is
 *     1.05/(L+0.05) and of black 21× that, and their geometric mean is 4.58. So
 *     the guarantee this function makes is not "usually readable" — it is that
 *     an ink exists which reads, and the caller gets one.
 *
 * WHY THE CALLER PASSES SEVERAL GROUNDS. The card fades, so the ground under
 * the text moves with the slider, and the veil moves it again. A function that
 * took the average and answered would be right once per photograph and wrong
 * for the rest of the track. `pickDynamicInk` is therefore given the whole set
 * — the measured picture, and the two extremes a hostile photo could be — and
 * answers for all of them at once.
 */
import { WCAG_TEXT, contrastRatio, relativeLuminance, type Rgb } from "./contrast";

/** Sample at most this many pixels per side; a big photo is not a big average. */
export const LUMINANCE_SAMPLE = 32;

/**
 * HOW FINELY THE EXTREMES ARE MEASURED — and why the average is not measured
 * here at all.
 *
 * The extremes are the bound the whole feature rests on, and a bound measured
 * on a coarse grid is not a bound. `LUMINANCE_SAMPLE`'s 32 cells are an honest
 * AVERAGE — that is what an average is for — but as a worst case each cell
 * stands for whatever a hostile photograph could be hiding inside it, and one
 * cell is `viewport / 32` of the screen: about 44 px on a 1400 px window, which
 * is larger than a line of text. A bright detail three lines tall could sit
 * inside one cell average and be invisible to the grid that promised to find
 * the brightest thing in the picture.
 *
 * At 96 cells the same arithmetic gives `viewport / 96`, about 15 px on that
 * same window — no larger than the text it is protecting, and smaller than it
 * on a phone. It is also the grid the bands below are cut from: 96 rows divide
 * into the 32 bands exactly, so the scroll listener's slice is measured on the
 * same pixels the whole-picture bound is.
 *
 * The resolution of the drawing is not the resolution of the file: the browser
 * is asked to draw the already-decoded image smaller, which is one more
 * `drawImage` of an `Image` the browser is holding, not a second decode of the
 * reader's 8 MB data URL.
 */
export const EXTREME_SAMPLE = 96;

/**
 * HOW MANY BANDS the picture's height is cut into for the scroll listener.
 *
 * iOS Safari drops `background-attachment: fixed`, so there the picture travels
 * with the page and the viewport shows a horizontal SLICE of it that changes as
 * the reader scrolls. The decision has to be able to name that slice without
 * decoding anything again — so the sample keeps 32 rows of summary, each with
 * its own average and its own extremes, and the listener re-asks the decision
 * about the rows it can see. 32 bands over a phone screen is a band every 20 px
 * or so, which is finer than the movement between two frames of a flick.
 */
export const PICTURE_BANDS = 32;

const linearise = (channel: number): number => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/**
 * Relative luminance of ONE pixel's colour, by the WCAG weights.
 *
 * Alpha is ignored on purpose, as in the average below: a photograph is
 * composited onto the veil, and what matters is its colour, not how opaque the
 * decoder said it was. It is a separate export because the sampler needs the
 * luminance of EACH pixel now, not only their mean — the worst region is found
 * by comparing these numbers, and a second copy of the weights would be a
 * second thing that could drift away from the average it must agree with.
 */
export function pixelLuminance(r: number, g: number, b: number): number {
  return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b);
}

/**
 * Relative luminance of the average of these RGBA pixels — the WCAG definition,
 * averaged rather than computed at one point.
 *
 * `pixels` is an RGBA buffer in any order; only every fourth byte is read, and
 * alpha is ignored on purpose: a photograph is composited onto the veil, and
 * what matters is its colour, not how opaque the decoder said it was.
 *
 * An empty buffer answers 0 rather than `NaN`, because a caller that gets
 * `NaN` here will write `NaN` into a CSS colour and the whole app falls back to
 * black text on a white photograph — the one outcome this module exists to
 * prevent.
 */
export function averageRelativeLuminance(pixels: ArrayLike<number>): number {
  const count = Math.floor(pixels.length / 4);
  if (count <= 0) return 0;
  let sum = 0;
  for (let i = 0; i < count; i++) {
    const o = i * 4;
    sum += pixelLuminance(pixels[o] ?? 0, pixels[o + 1] ?? 0, pixels[o + 2] ?? 0);
  }
  return sum / count;
}

/** The two extremes a hostile photograph could be, as luminances. */
export const HOSTILE_LUMINANCES = [0, 1] as const;

/**
 * Whether a picture of this luminance wants a DARK ink.
 *
 * The threshold is the middle of the range rather than anything clever, and the
 * boundary belongs to the bright side: a picture exactly at 0.5 is mid-grey, and
 * mid-grey reads with either end. It is a separate function because it is a
 * DECISION the tests can pin — the first version of this feature computed it
 * inline in the hook, where a mutation flipped it and no test noticed, since
 * every test rebuilt its own copy of the decision.
 */
export function prefersDarkInk(pictureLuminance: number): boolean {
  return pictureLuminance >= 0.5;
}

/**
 * HOW FAR APART THE SAMPLED LUMINANCES MUST BE before the average stops being
 * an honest description of the picture.
 *
 * The audit measured the failure this constant exists for: a photograph that
 * is half white and half black has an average of mid-grey, and the ink that
 * reads on mid-grey is black — which is invisible on the picture's own black
 * half, at a card transparency above 50% and the veil at zero, while the
 * decision still reported `meetsAA`. At 0.4 of range the veil cannot compress
 * the two ends far enough apart for one ink to serve both, so above it the
 * decision stops asking the average and asks the worst region instead.
 */
export const WORST_REGION_RANGE = 0.4;

/** One region of a sampled picture: its own colour and its own luminance. */
export type SampledRegion = { rgb: Rgb; luminance: number };

/**
 * One horizontal band of the sample: its own average, and its own extremes.
 *
 * A slice of the picture has to be a PICTURE SAMPLE in its own right, not an
 * average with two extremes bolted on: `worstRegion` reads the sample's own
 * average to decide the polarity, and a slice handed the whole picture's
 * average would answer a question about pixels that are not on screen. So each
 * band carries everything a `PictureSample` does, and `slicePicture` folds the
 * visible ones into one.
 */
export type PictureBand = SampledRegion & { min: SampledRegion; max: SampledRegion };

/**
 * What the sampler knows about a picture: the average, both extremes, and — for
 * the scroll listener — the same three facts per band.
 *
 * `bands` is OPTIONAL, and that is not a convenience: the arithmetic tests build
 * samples by hand (a flat one, a half-and-half one) and an optional field keeps
 * "this picture was measured with bands" a fact the sampler states rather than a
 * shape every caller has to satisfy. Everything that reads bands falls back to
 * the whole-picture numbers when they are absent, which is exactly the decision
 * that shipped before the listener existed.
 */
export type PictureSample = SampledRegion & {
  min: SampledRegion;
  max: SampledRegion;
  bands?: PictureBand[];
};

/**
 * THE REGION THE INK DECISION MUST SURVIVE — the average, until it lies.
 *
 * While the sampled luminances stay within `WORST_REGION_RANGE` of each other,
 * the average is a fair description and the decision keeps standing on it: a
 * reader whose photo is one soft gradient sees no change from the version that
 * shipped.
 *
 * Above that range the average is the one ground the ink is guaranteed NOT to
 * be chosen for, so the decision moves to the extreme that fights the polarity
 * — and which extreme that is follows from the same arithmetic as the whole
 * module: a DARK ink loses contrast on the DARKEST ground, a LIGHT ink on the
 * BRIGHTEST. `prefersDarkInk` still reads the AVERAGE, because "this is a
 * bright picture" describes the picture as a whole; the region handed to the
 * decision is the one that ink cannot read, which is the region where the
 * invisible text used to be.
 */
export function worstRegion(sample: PictureSample): SampledRegion {
  const range = sample.max.luminance - sample.min.luminance;
  if (range <= WORST_REGION_RANGE) return { rgb: sample.rgb, luminance: sample.luminance };
  return prefersDarkInk(sample.luminance) ? sample.min : sample.max;
}

/**
 * The inks a ground may be read against, best first.
 *
 * `preferDark` is the PICTURE's polarity, not the theme's: a bright photograph
 * wants a dark ink and a dark one wants a light ink, so the palette's own two
 * ends are offered in that order and black and white follow as the floor. The
 * theme's own ink is inside that pair, so "unchanged unless the picture makes it
 * necessary" still holds — a light theme with a bright photo is offered its own
 * dark ink first, and a light theme with a dark photo is offered its page
 * background, which is the app's own light end.
 *
 * Black and white are not part of any theme. They are here because the
 * arithmetic has to close: for any ground, at least one of them clears 4.5:1,
 * since the contrast of white against a ground of luminance L is `1.05/(L+0.05)`
 * and black's is 21× that.
 */
export function dynamicInkCandidates(themeInk: Rgb, themeBg: Rgb, preferDark: boolean): Rgb[] {
  const darkEnd = relativeLuminance(themeInk) <= relativeLuminance(themeBg) ? themeInk : themeBg;
  const lightEnd = darkEnd === themeInk ? themeBg : themeInk;
  const palette = preferDark ? [darkEnd, lightEnd] : [lightEnd, darkEnd];
  const extremes: Rgb[] = preferDark
    ? [
        [0, 0, 0],
        [255, 255, 255],
      ]
    : [
        [255, 255, 255],
        [0, 0, 0],
      ];
  return [...palette, ...extremes];
}

/** The worst contrast one ink manages across every ground it must survive. */
export function worstContrast(ink: Rgb, grounds: readonly Rgb[]): number {
  let worst = Infinity;
  for (const ground of grounds) worst = Math.min(worst, contrastRatio(ink, ground));
  return Number.isFinite(worst) ? worst : 0;
}

/**
 * The best ink for these grounds, and whether it is actually readable.
 *
 * A candidate that clears AA on EVERY ground wins outright, in preference
 * order. When none does, the answer is still an ink — the one with the highest
 * WORST-case contrast — and `meetsAA` says `false`, because that second case is
 * real and must not be dressed up: one ink cannot be readable over a photograph
 * that contains both a true black and a true white, and no amount of choosing
 * well changes that. The veil is the reader's control for exactly that case, so
 * the honest report is "this is the best single ink, and it is not enough" —
 * which is also what lets the tests state the guarantee precisely instead of
 * promising AA over something no ink can deliver.
 *
 * `undefined` means there were no candidates at all, and the caller writes
 * nothing.
 */
export function pickDynamicInk(
  candidates: readonly Rgb[],
  grounds: readonly Rgb[],
  minimum: number = WCAG_TEXT,
): { ink: Rgb; contrast: number; meetsAA: boolean } | undefined {
  if (candidates.length === 0 || grounds.length === 0) return undefined;
  let best: { ink: Rgb; contrast: number; meetsAA: boolean } | undefined;
  for (const ink of candidates) {
    const contrast = worstContrast(ink, grounds);
    const meetsAA = contrast >= minimum;
    if (meetsAA) return { ink, contrast, meetsAA: true };
    if (!best || contrast > best.contrast) best = { ink, contrast, meetsAA: false };
  }
  return best;
}

/**
 * An ink as `#rrggbb`, for a CSS custom property.
 *
 * Rounded rather than truncated: truncation biases every channel downward, which
 * is why a truncated dark ink measures one step lighter than it paints — and a
 * guarantee that is off by one in the reader's favour is not a guarantee.
 */
export function inkToCss(ink: Rgb): string {
  const channel = (c: number) =>
    Math.max(0, Math.min(255, Math.round(c)))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(ink[0])}${channel(ink[1])}${channel(ink[2])}`;
}

/**
 * HOW QUIET THE SOFT INK IS ALLOWED TO GET: 5.2:1, a step above AA.
 *
 * The soft ink exists to be quieter than the primary without ever failing AA,
 * so its target sits above the threshold with room for the rounding at the
 * end: the bisection below lands on this ratio in real contrast terms, and the
 * rounded answer is measured before it is handed over.
 */
export const SOFT_INK_RATIO = 5.2;

/**
 * The quieter companion of an ink that already cleared AA on this ground.
 *
 * Mixed TOWARD THE GROUND until its measured contrast reads `SOFT_INK_RATIO` —
 * found by bisection, and deliberately not by algebra: mixing in channel space
 * is not mixing in luminance space, and the closed form that assumes it is
 * quietly wrong exactly where an ink is furthest from its ground (a 13.5:1
 * white computed to stay above 4.5 lands at 2.5). The bisection asks the same
 * `contrastRatio` the guarantee is stated in, so the answer cannot disagree
 * with it; the final rounding is a real step, so the rounded candidate is
 * measured too, and an ink with no room to soften — or whose soft version lost
 * the threshold to rounding — comes back unchanged. Quieter is an ornament;
 * readable is the promise.
 */
export function softInk(ink: Rgb, ground: Rgb): Rgb {
  if (contrastRatio(ink, ground) <= SOFT_INK_RATIO) return ink;
  const mix = (s: number): Rgb => [
    ink[0]! + (ground[0]! - ink[0]!) * s,
    ink[1]! + (ground[1]! - ink[1]!) * s,
    ink[2]! + (ground[2]! - ink[2]!) * s,
  ];
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (contrastRatio(mix(mid), ground) >= SOFT_INK_RATIO) lo = mid;
    else hi = mid;
  }
  const s = (lo + hi) / 2;
  const rounded: Rgb = [
    Math.round(mix(s)[0]!),
    Math.round(mix(s)[1]!),
    Math.round(mix(s)[2]!),
  ];
  return contrastRatio(rounded, ground) >= WCAG_TEXT ? rounded : ink;
}

/**
 * The ink for the words that used to be the theme's brand colour.
 *
 * Titles, badges and stat values paint in `--brand-strong`, a colour no ink
 * decision owns — and on a photograph the theme's brand can sit exactly on the
 * hue beneath it. The rule is the same one the main ink obeys, one step less
 * strict: where the brand still clears WCAG AA (4.5:1, which is safe for every
 * size, not just the large titles it mostly paints) it keeps its colour, and
 * where it cannot read it hands the word to the ink that won. The brand is
 * worth keeping where it works — it is the app's voice — it just stops being
 * worth a reader's squint.
 */
export function readableBrand(
  brandStrong: Rgb,
  fallback: Rgb,
  grounds: readonly Rgb[],
): Rgb {
  return worstContrast(brandStrong, grounds) >= WCAG_TEXT ? brandStrong : fallback;
}

/**
 * The slice of a measured picture a reader can actually see, as a picture.
 *
 * WHY A SLICE IS A SAMPLE AND NOT JUST TWO EXTREMES. Handing `worstRegion` the
 * visible rows' extremes while leaving the WHOLE picture's average in place is
 * optimistic, and the case that shows it is not exotic: a photograph whose top
 * half is a dark sky and whose bottom half is a bright field. Scrolled to the
 * sky, the visible extremes are both dark — a range of zero — so `worstRegion`
 * would answer with the average it was given, mid-grey over the whole frame,
 * and pick the dark ink that reads on mid-grey and vanishes on the sky. The
 * polarity has to come from the pixels on screen too, which is why the fold
 * averages the bands rather than borrowing the frame's own number.
 *
 * The fold is over EQUAL-HEIGHT bands, so the mean of their means IS the mean
 * of the pixels — no weighting, no approximation. An empty or out-of-range ask
 * answers the whole picture, and so does a sample with no bands at all: the
 * fallback is always the answer that shipped before the listener, which is the
 * conservative one, because the listener can only ever narrow the ground.
 */
export function slicePicture(
  sample: PictureSample,
  start: number,
  end: number,
): PictureSample {
  const bands = sample.bands;
  if (!bands || bands.length === 0) return sample;
  const first = Math.max(0, Math.min(bands.length - 1, Math.floor(start)));
  const last = Math.max(0, Math.min(bands.length - 1, Math.floor(end)));
  if (!(last >= first)) return sample;
  let r = 0;
  let g = 0;
  let b = 0;
  let luminance = 0;
  let min = bands[first]!.min;
  let max = bands[first]!.max;
  for (let i = first; i <= last; i++) {
    const band = bands[i]!;
    r += band.rgb[0];
    g += band.rgb[1];
    b += band.rgb[2];
    luminance += band.luminance;
    if (band.min.luminance < min.luminance) min = band.min;
    if (band.max.luminance > max.luminance) max = band.max;
  }
  const count = last - first + 1;
  return {
    rgb: [Math.round(r / count), Math.round(g / count), Math.round(b / count)],
    luminance: luminance / count,
    min,
    max,
    bands,
  };
}

/**
 * The bands the viewport shows, when the backdrop scrolls with the page.
 *
 * iOS Safari ignores `background-attachment: fixed` and falls back to scrolling
 * — the pixel band behind the reader's text therefore moves as they scroll, and
 * the ground the ink was chosen against is no longer the ground the text is on.
 * The mapping is the plain one for the case the caller must be in to ask: a
 * `cover` picture's own box IS the page box (it is scaled until it covers it),
 * so the fraction of the page the viewport shows is the fraction of the picture
 * it shows, and `background-position: center` is a vertical identity — band `i`
 * is the same band at every scroll position. On the platform that honours
 * `fixed` this function is never consulted, which is why it does not try to be
 * right about a positioning area the stylesheet did not ask for.
 *
 * The answer is CLAMPED to the sample rather than trusted: a viewport taller
 * than the page (a short document, a mobile keyboard, a resize mid-frame) asks
 * for more bands than exist, and a band index outside the array would be read
 * by `slicePicture` as a fallback to the whole picture — a silent, and here
 * unnecessary, widening of the ground.
 */
export function visibleBands(
  scrollY: number,
  pageHeight: number,
  viewportHeight: number,
  bandCount: number = PICTURE_BANDS,
): { start: number; end: number } {
  const last = Math.max(0, bandCount - 1);
  if (!Number.isFinite(pageHeight) || pageHeight <= 0) return { start: 0, end: last };
  const top = Number.isFinite(scrollY) ? Math.max(0, scrollY) : 0;
  const height = Number.isFinite(viewportHeight) ? Math.max(0, viewportHeight) : 0;
  const start = Math.floor((top / pageHeight) * bandCount);
  const end = Math.ceil(((top + height) / pageHeight) * bandCount) - 1;
  return {
    start: Math.max(0, Math.min(last, start)),
    end: Math.max(0, Math.min(last, end)),
  };
}

/**
 * THE PICTURE THE VIEWPORT ACTUALLY SHOWS, as a source rectangle.
 *
 * WHY THE WHOLE FRAME IS THE WRONG THING TO MEASURE, on the platform that
 * honours `background-attachment: fixed`. There the stylesheet's
 * `background-size: cover` is resolved against the VIEWPORT, and `cover` means
 * "scale until both sides fill, crop the rest" — so the photo behind the text is
 * a CENTRED CROP of the file, and its aspect is the window's, not the file's. A
 * portrait phone photo on a laptop is the ordinary case and the extreme one:
 * cover scales it until its WIDTH fills a 16:9 window, which throws away
 * something like the top and bottom third. Measuring the whole file then decides
 * for pixels nobody is looking at, and the failure that follows is not subtle —
 * `worstRegion` deliberately walks to the extreme the chosen polarity cannot
 * read, and that extreme can be exactly the part that was cropped away, so the
 * ink that "reads on the picture" reads only on the part of it the reader cannot
 * see.
 *
 * The arithmetic is the one `background-size: cover` does, and `null` is the
 * honest answer when the browser has not given us a size yet (a picture still
 * decoding reports 0×0) or the box has no area. A `null` crop means the caller
 * measures the whole frame, which is the behaviour that shipped before this
 * function — never a crop built from a guess.
 */
export function visibleCrop(
  imageWidth: number,
  imageHeight: number,
  boxWidth: number,
  boxHeight: number,
): { sx: number; sy: number; sw: number; sh: number } | null {
  if (!(imageWidth > 0) || !(imageHeight > 0) || !(boxWidth > 0) || !(boxHeight > 0)) {
    return null;
  }
  const imageAspect = imageWidth / imageHeight;
  const boxAspect = boxWidth / boxHeight;
  // Which side overflows is what decides which side is cropped: a picture wider
  // than the box is scaled to the box's HEIGHT, and cropped left and right.
  const wide = imageAspect > boxAspect;
  const sw = wide ? imageHeight * boxAspect : imageWidth;
  const sh = wide ? imageHeight : imageWidth / boxAspect;
  return { sx: (imageWidth - sw) / 2, sy: (imageHeight - sh) / 2, sw, sh };
}

/**
 * The grounds a decision has to survive: the measured picture, and the two
 * extremes. Exported so the tests build the same set rather than a smaller one.
 */
export function groundsFor(pictureLuminance: number): number[] {
  return [pictureLuminance, ...HOSTILE_LUMINANCES];
}
