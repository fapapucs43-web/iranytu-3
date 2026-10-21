import { useEffect, useRef, useState } from "react";
import {
  EXTREME_SAMPLE,
  LUMINANCE_SAMPLE,
  PICTURE_BANDS,
  averageRelativeLuminance,
  dynamicInkCandidates,
  inkToCss,
  pickDynamicInk,
  pixelLuminance,
  prefersDarkInk,
  readableBrand,
  slicePicture,
  softInk,
  visibleBands,
  visibleCrop,
  worstRegion,
  type PictureBand,
  type PictureSample,
  type SampledRegion,
} from "../lib/dynamicInk";
import {
  effectiveVeil,
  followsDocumentBackdrop,
  groundWithPicture,
  normalizePalette,
  pageGroundRgb,
  veilForAA,
  worstCaseScrimRgb,
  type ScrimPalette,
} from "../lib/imageBackground";
import { isLight } from "../lib/themes";
import { parseHexRgb, type Rgb } from "../lib/contrast";

/** What one ink decision hands back, in the colours the stylesheet needs. */
export type DynamicInk = {
  /** The ink for body text — already the CSS hex the decision produced. */
  primary: string;
  /** A quieter version of the primary, or the primary itself if quiet would fail AA. */
  soft: string;
  /** The theme's `--brand` where it still reads on the ground, otherwise the primary. */
  brand: string;
  /** The theme's `--brand-strong`, measured the same way — the two paints differ. */
  brandStrong: string;
  /** Whether the primary cleared AA on the ground the reader is actually looking at. */
  meetsAA: boolean;
  /**
   * The veil this decision was made at, and the veil the app must paint.
   *
   * The reader's own number wherever it already works — and a stronger one
   * where no ink can read on both grounds at the reader's number, which is what
   * `veilForAA` exists for. It is returned rather than recomputed by the root
   * so the painted veil and the measured veil cannot be two different numbers:
   * a guarantee checked at one veil and painted at another is the class of bug
   * this whole feature keeps finding.
   */
  veil: number;
};

const EMPTY_REGION: SampledRegion = { rgb: [0, 0, 0], luminance: Infinity };
const NEGATIVE_REGION: SampledRegion = { rgb: [0, 0, 0], luminance: -1 };

/**
 * The worst case in a pixel buffer, and the same fact band by band.
 *
 * Two readings of one buffer, in one pass: the pixel that fights hardest
 * anywhere in the picture, and — for the scroll listener — the same answer for
 * each of `PICTURE_BANDS` horizontal strips of it.
 *
 * `row` is the buffer's width in pixels, and it is the only geometry this needs:
 * a band is `rows / PICTURE_BANDS` whole rows, so a buffer that arrived shorter
 * than one band per band (a canvas double in a test, a browser that handed back
 * fewer pixels than it was asked for) produces NO bands rather than a band list
 * that claims a geometry it does not have — and the listener falls back to the
 * whole picture, which is the decision that shipped before it existed.
 *
 * The extremes start beyond either end of the range on purpose, so the FIRST
 * pixel replaces them whatever it is — no seed pixel, no branch.
 */
function readPicture(data: ArrayLike<number>, row: number): {
  min: SampledRegion;
  max: SampledRegion;
  bands: PictureBand[];
} {
  const count = Math.floor(data.length / 4);
  let min: SampledRegion = EMPTY_REGION;
  let max: SampledRegion = NEGATIVE_REGION;
  const rows = row > 0 ? Math.floor(count / row) : 0;
  const perBand = rows >= PICTURE_BANDS ? Math.floor(rows / PICTURE_BANDS) : 0;
  const bands: PictureBand[] = [];
  const sums = Array.from({ length: perBand > 0 ? PICTURE_BANDS : 0 }, () => ({
    r: 0,
    g: 0,
    b: 0,
    luminance: 0,
    pixels: 0,
    min: EMPTY_REGION,
    max: NEGATIVE_REGION,
  }));

  for (let i = 0; i < count; i++) {
    const o = i * 4;
    const pr = data[o] ?? 0;
    const pg = data[o + 1] ?? 0;
    const pb = data[o + 2] ?? 0;
    const luminance = pixelLuminance(pr, pg, pb);
    if (luminance < min.luminance) min = { rgb: [pr, pg, pb], luminance };
    if (luminance > max.luminance) max = { rgb: [pr, pg, pb], luminance };
    if (sums.length > 0) {
      // The last band absorbs the remainder rows, so no pixel is counted twice
      // and none is dropped — which is what makes the bands' means average back
      // to the picture's own mean.
      const band = Math.min(PICTURE_BANDS - 1, Math.floor(Math.floor(i / row) / perBand));
      const sum = sums[band]!;
      sum.r += pr;
      sum.g += pg;
      sum.b += pb;
      sum.luminance += luminance;
      sum.pixels += 1;
      if (luminance < sum.min.luminance) sum.min = { rgb: [pr, pg, pb], luminance };
      if (luminance > sum.max.luminance) sum.max = { rgb: [pr, pg, pb], luminance };
    }
  }

  for (const sum of sums) {
    if (sum.pixels === 0) continue;
    bands.push({
      rgb: [
        Math.round(sum.r / sum.pixels),
        Math.round(sum.g / sum.pixels),
        Math.round(sum.b / sum.pixels),
      ],
      luminance: sum.luminance / sum.pixels,
      min: sum.min,
      max: sum.max,
    });
  }
  return { min, max, bands };
}

/**
 * MEASURE THE PICTURE ONCE, in a canvas nobody can see.
 *
 * The alternative — reading the stored data URL's brightness — is not possible
 * without decoding it, and decoding an 8 MB data URL on every render is the kind
 * of cost this app refuses everywhere else. The picture is drawn TWICE from the
 * one `Image` the browser has already decoded, and neither draw is a decode:
 *
 *  - `LUMINANCE_SAMPLE` for the AVERAGE, which is what an average wants — a
 *    coarse grid is a fine mean, and this number is the picture's own brightness
 *    rather than a bound on it;
 *  - `EXTREME_SAMPLE` for the EXACT pixels the bound is built from, because a
 *    bound measured on 32 cells is a bound that can miss a bright detail three
 *    lines tall, and the bands the scroll listener slices are cut from this same
 *    finer grid.
 *
 * Returns `null` wherever it cannot answer — no `document`, no `Image`, a
 * cross-origin source, a picture still decoding — and `null` is the caller's
 * instruction to write nothing at all, which is what a browser without a
 * canvas should get.
 *
 * It hands back the average colour, the average luminance, both extremes AND
 * the bands — each region with its own colour, not only its number. The
 * difference between the first two is deliberate: compositing needs channels,
 * because a veil is a `color-mix` and a mix of greys is not grey — so the colour
 * is what the stack below is built from, while the luminance is the single
 * number that says "this photograph is a bright one". The extremes exist because
 * the average can lie: a photograph that is half white and half black averages
 * to mid-grey, and the ink that reads on mid-grey is invisible on the picture's
 * own dark half. `worstRegion` decides which region the ground is built from;
 * the sampler's job is only to make sure every one of them is real pixels.
 */
/**
 * The box a `cover` picture is fitted to ON THIS PLATFORM, or `undefined`.
 *
 * `undefined` means "measure the whole file", and it is the right answer in two
 * different cases rather than one. Every fit except `cover` shows the whole
 * picture — `contain`, and `soft`, whose picture layer is `contain` too — so
 * there is nothing to cut off. And on the platform that ignores
 * `background-attachment: fixed` the picture is fitted to the DOCUMENT instead
 * of the window, where the visible slice is a function of the scroll position
 * and the bands already answer for exactly that.
 *
 * The box is the WINDOW, because that is the area `cover` is resolved against
 * once the backdrop is fixed, and it is read when the picture is measured. A
 * resize afterwards therefore keeps the decision made for the window it was
 * measured in — the sample is re-taken when the picture or the fit changes, or
 * on the next load, and it is never re-taken per frame, because a decode per
 * resize tick is a cost this hook exists to refuse.
 */
function coverBox(fit: string | undefined): { width: number; height: number } | undefined {
  if (fit !== "cover") return undefined;
  if (typeof window === "undefined") return undefined;
  if (typeof window.matchMedia !== "function") return undefined;
  if (followsDocumentBackdrop((query) => window.matchMedia(query).matches)) return undefined;
  return { width: window.innerWidth, height: window.innerHeight };
}

export async function measurePicture(
  src: string,
  box?: { width: number; height: number } | undefined,
): Promise<PictureSample | null> {
  if (typeof document === "undefined" || typeof Image === "undefined") return null;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: PictureSample | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const image = new Image();
    // The stored picture is a data URL, so this cannot taint the canvas — but a
    // reader who somehow has a remote one would throw on `getImageData`, and a
    // broken ink must never be a thrown promise.
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = LUMINANCE_SAMPLE;
        canvas.height = LUMINANCE_SAMPLE;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return finish(null);
        /*
         * THE VISIBLE CROP, where there is one, and the whole file otherwise.
         * `image.naturalWidth`/`Height` are the decoder's own numbers — what the
         * browser is about to fit — so the rectangle is the browser's arithmetic
         * rather than a second copy of it. `null` from `visibleCrop` (a size the
         * decoder has not reported, a zero-area box) falls back to the whole
         * picture, which is what shipped before this and is never a guess.
         */
        const crop = box
          ? visibleCrop(image.naturalWidth, image.naturalHeight, box.width, box.height)
          : null;
        if (crop) {
          ctx.drawImage(
            image,
            crop.sx,
            crop.sy,
            crop.sw,
            crop.sh,
            0,
            0,
            LUMINANCE_SAMPLE,
            LUMINANCE_SAMPLE,
          );
        } else {
          ctx.drawImage(image, 0, 0, LUMINANCE_SAMPLE, LUMINANCE_SAMPLE);
        }
        const { data } = ctx.getImageData(0, 0, LUMINANCE_SAMPLE, LUMINANCE_SAMPLE);
        const pixels = Math.floor(data.length / 4);
        if (pixels <= 0) return finish(null);
        let r = 0;
        let g = 0;
        let b = 0;
        for (let i = 0; i < data.length; i += 4) {
          r += data[i] ?? 0;
          g += data[i + 1] ?? 0;
          b += data[i + 2] ?? 0;
        }
        const rgb: Rgb = [Math.round(r / pixels), Math.round(g / pixels), Math.round(b / pixels)];

        // The bounded pass: the same image, drawn finer, read for the worst
        // pixel rather than the typical one, and for the bands the scroll
        // listener slices. Its own `getImageData` is the second and last read.
        canvas.width = EXTREME_SAMPLE;
        canvas.height = EXTREME_SAMPLE;
        if (crop) {
          ctx.drawImage(
            image,
            crop.sx,
            crop.sy,
            crop.sw,
            crop.sh,
            0,
            0,
            EXTREME_SAMPLE,
            EXTREME_SAMPLE,
          );
        } else {
          ctx.drawImage(image, 0, 0, EXTREME_SAMPLE, EXTREME_SAMPLE);
        }
        const extremeData = ctx.getImageData(0, 0, EXTREME_SAMPLE, EXTREME_SAMPLE).data;
        const bounded = readPicture(extremeData, EXTREME_SAMPLE);
        // A browser that handed back less than the bounded pass asked for (or a
        // canvas double in a test) leaves the COARSE grid's own extremes in
        // place rather than nothing: the decision must never be handed an empty
        // range, and the fallback is the answer that shipped before this pass.
        const bounds = bounded.bands.length > 0 ? bounded : readPicture(data, LUMINANCE_SAMPLE);

        finish({
          rgb,
          luminance: averageRelativeLuminance(data),
          min: bounds.min,
          max: bounds.max,
          bands: bounded.bands,
        });
      } catch {
        finish(null);
      }
    };
    image.onerror = () => finish(null);
    image.src = src;
  });
}

/**
 * THE DECISION ITSELF, as a function rather than a hook body.
 *
 * The grounds are where the text stands, composed by the same `groundWithPicture`
 * the card guarantee composites with, so the ink cannot be decided against a
 * different arithmetic than the one on screen. There are TWO of them because
 * there are two places the words are painted: the CARD's ground, and the PAGE's —
 * the one with no surface between the text and the picture, which is where every
 * section heading and every inherited word stands. Handing the decision only the
 * card's ground left those words decided against a surface that is not under
 * them, and over a dark photograph in a light theme that is dark text on a dark
 * picture.
 *
 * The scrim is the SAME `worstCaseScrimRgb` the card guarantee uses, rather than
 * the tint this hook could compute itself: the browser paints whichever veil the
 * stylesheet resolves, and assuming the least helpful one is the only assumption
 * that cannot make the decision optimistic.
 *
 * POLARITY comes from the average luminance — "bright picture" describes the
 * picture as a whole — while the REGION handed to the decision is the one that
 * polarity's ink cannot read, which is where the invisible text used to be. When
 * a reader is scrolling a `cover` picture that the platform paints against the
 * document rather than the viewport (Safari on iOS), the sample is narrowed to
 * the BANDS the viewport shows first: the visible slice is a picture in its own
 * right, average and all, because a slice handed the whole frame's average would
 * answer about pixels that are not on screen — a dark sky would be decided with
 * the mid-grey ink of a half-sunlit frame and vanish.
 *
 * THE VEIL IS PART OF THE ANSWER. At the reader's own number there may be no ink
 * at all that reads on both grounds; `veilForAA` strengthens the veil until
 * there is, and the number it lands on is the one the caller must paint, so the
 * guarantee and the paint describe one surface.
 *
 * THE SAMPLE ITSELF IS SOMETIMES A CROP, and by the time the decision runs it
 * already is: `measurePicture` cuts the visible part out of the file where the
 * platform fits `cover` to the viewport (see `visibleCrop`). Everything below
 * this line therefore reasons about pixels on screen, which is the only sense
 * the guarantee has ever had.
 *
 * `null` means the theme's tokens could not be read, and the caller writes
 * nothing.
 */
export function decideDynamicInk(
  measured: PictureSample,
  tokens: Record<string, string>,
  scrim: unknown,
  palette: string | undefined,
  cardTransparency: number,
  band?: { start: number; end: number } | undefined,
): DynamicInk | null {
  const ink = parseHexRgb(tokens.ink);
  const surface = parseHexRgb(tokens.surface);
  const page = parseHexRgb(tokens.bg);
  const brand = parseHexRgb(tokens.brand);
  const brandStrong = parseHexRgb(tokens.brandStrong);
  if (!ink || !surface || !page || !brand || !brandStrong) return null;

  const chosenPalette: ScrimPalette = normalizePalette(palette);
  // The FLOORED veil, the same `effectiveVeil` the root paints into
  // `--app-bg-scrim-alpha`: the decision must reason about the veil the
  // browser actually paints, and that veil is the reader's number with the
  // card transparency's `t / 2` floor under it.
  const readerVeil = effectiveVeil(scrim, cardTransparency);
  const scrimRgb = worstCaseScrimRgb(isLight(tokens.bg ?? "#ffffff"), chosenPalette);

  const visible = band ? slicePicture(measured, band.start, band.end) : measured;
  const region = worstRegion(visible);
  const candidates = dynamicInkCandidates(ink, page, prefersDarkInk(visible.luminance));
  /*
   * The veil the app paints: the reader's, unless no ink can read on both
   * grounds at it. The floor is searched AT the picture the decision stands on
   * and at the reader's own card transparency, so the two grounds the search
   * walks are the two grounds built below — the same calls, in the same order.
   */
  const veil = veilForAA({
    candidates,
    surface,
    scrim: scrimRgb,
    picture: region.rgb,
    cardTransparency,
    base: readerVeil,
  });
  const grounds: Rgb[] = [
    groundWithPicture(surface, scrimRgb, veil, region.rgb, cardTransparency),
    pageGroundRgb(surface, scrimRgb, veil, region.rgb),
  ];
  const decision = pickDynamicInk(candidates, grounds);
  if (!decision) return null;
  /*
   * Two grounds, four inks. `softInk` keeps secondary text quieter than the
   * primary without ever letting it fall under AA, and `readableBrand` lets the
   * theme's brand stand where it still reads and steps aside where it does not.
   * Both are computed from the decision above, so all of them answer for the
   * same pixels the reader is looking at.
   */
  const ground = grounds[0]!;
  const primary = inkToCss(decision.ink);
  return {
    primary,
    soft: inkToCss(softInk(decision.ink, ground)),
    // Two brand paints, measured separately: `--brand` and `--brand-strong` are
    // different colours in every theme, and a slot that answered for one with
    // the other's number would repaint the no-picture app as a side effect.
    brand: inkToCss(readableBrand(brand, decision.ink, grounds)),
    brandStrong: inkToCss(readableBrand(brandStrong, decision.ink, grounds)),
    meetsAA: decision.meetsAA,
    veil,
  };
}

/**
 * The five custom properties, written where the root writes them.
 *
 * A function rather than a part of the render because the scroll listener below
 * has to write the same names to the same element without a React render: the
 * listener runs on a platform where the reader's thumb moves the picture thirty
 * times a second, and a state update per frame would rebuild the whole view to
 * repaint a colour.
 *
 * FIVE SLOTS, AND NOT `--ink`. The slots are what every text rule reads, so one
 * write reaches every word; `--ink` is deliberately left alone because it is the
 * token the SOLID CARRIERS re-pin FROM (`.app.has-bg .yip-tile`, `.rec-flow`,
 * `.pin-overlay`… all declare `--app-ink: var(--ink)`). Writing the decision
 * there made those rules hand the picture's ink to text standing on a theme
 * surface — light ink on a light tile, and the lock screen in the photograph's
 * colours. The listener and the render therefore write the same five names, which
 * is also why the early return below compares only the primary.
 */
function paintInk(root: HTMLElement, next: DynamicInk): boolean {
  if (root.style.getPropertyValue("--app-dynamic-ink") === next.primary) return false;
  root.style.setProperty("--app-dynamic-ink", next.primary);
  root.style.setProperty("--app-dynamic-ink-soft", next.soft);
  root.style.setProperty("--app-dynamic-brand", next.brand);
  root.style.setProperty("--app-dynamic-brand-strong", next.brandStrong);
  root.style.setProperty("--app-bg-scrim-alpha", String(next.veil));
  return true;
}

/**
 * The ink for this picture, this veil and this card transparency — or `null`.
 *
 * The hook measures once per picture and RE-USES the measurement for everything
 * else: decoding is the expensive half, choosing an ink is arithmetic, and
 * re-decoding on every slider tick is the cost this avoids. The decision itself
 * lives in `decideDynamicInk` above, so the scroll listener can ask the same
 * question without a render — two implementations of "which ink" would drift
 * and the drift would only ever show up as text the reader cannot read.
 *
 * THE SCROLL LISTENER, AND WHY IT IS HERE. `background-attachment: fixed` is
 * what the stylesheet asks for and what every desktop browser honours: the
 * picture is positioned against the viewport, so the same pixels stay behind the
 * text and the decision never has to move. Safari on iOS drops the property and
 * falls back to `scroll`, and there the positioning area is the DOCUMENT — the
 * picture travels with the content, the visible slice changes with every flick,
 * and the ink was chosen for pixels the reader has scrolled away from. The
 * listener therefore re-asks the decision about the bands the viewport shows and
 * paints the answer straight onto the root element.
 *
 * WHY IT IS GATED. It is attached only where the platform is one that paints the
 * backdrop against the document — `followsDocumentBackdrop`, whose own comment
 * carries the reasoning and the refinement the pointer profile needs — and only
 * for a `cover` picture, whose box IS the page box, the one fit where a fraction
 * of the page is a fraction of the picture. Everywhere else
 * the static decision stands, and it stands CONSERVATIVELY: a narrower slice can
 * only narrow the ground, so a platform that honours `fixed` while matching the
 * touch test would get a bound that is stricter than it needs, never looser.
 * There is no state and no dependencies on scroll: the effect re-subscribes only
 * when the picture or the fit changes, `requestAnimationFrame` collapses a
 * flick's worth of events into one recompute, `passive` keeps the listener off
 * the scrolling path — and the arithmetic it runs is the same arithmetic the
 * render runs, on a measurement that is already in memory.
 */
export function useDynamicInk(
  background: string | undefined,
  tokens: Record<string, string>,
  scrim: unknown,
  palette: string | undefined,
  cardTransparency: number,
  fit?: string | undefined,
): DynamicInk | null {
  const [measured, setMeasured] = useState<(PictureSample & { src: string }) | null>(null);

  useEffect(() => {
    if (!background) {
      setMeasured(null);
      return;
    }
    let alive = true;
    // `fit` is a dependency because it decides WHICH PIXELS are measured: a
    // `cover` picture is measured as the crop the window shows, and switching to
    // `contain` (or back) has to re-take that sample or the ink would keep
    // answering for a crop nobody can see.
    void measurePicture(background, coverBox(fit)).then((result) => {
      if (!alive) return;
      setMeasured(result ? { src: background, ...result } : null);
    });
    return () => {
      alive = false;
    };
  }, [background, fit]);

  const live = measured && measured.src === background ? measured : null;
  const latest = useRef<{
    measured: PictureSample;
    tokens: Record<string, string>;
    scrim: unknown;
    palette: string | undefined;
    cardTransparency: number;
  } | null>(null);
  latest.current = live
    ? { measured: live, tokens, scrim, palette, cardTransparency }
    : null;

  useEffect(() => {
    if (!background || fit !== "cover") return;
    if (typeof document === "undefined" || typeof window === "undefined") return;
    if (typeof window.matchMedia !== "function") return;
    if (!followsDocumentBackdrop((query) => window.matchMedia(query).matches)) return;
    let frame = 0;
    const apply = () => {
      frame = 0;
      const args = latest.current;
      const root = document.querySelector<HTMLElement>(".app");
      if (!args || !root) return;
      const page = document.documentElement;
      const band = visibleBands(window.scrollY, page.scrollHeight, window.innerHeight);
      const next = decideDynamicInk(
        args.measured,
        args.tokens,
        args.scrim,
        args.palette,
        args.cardTransparency,
        band,
      );
      if (next) paintInk(root, next);
    };
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(apply);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [background, fit]);

  if (!live) return null;
  return decideDynamicInk(live, tokens, scrim, palette, cardTransparency);
}
