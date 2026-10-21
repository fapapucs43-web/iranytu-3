/**
 * The custom background image — its own store, its own cap, and the pure
 * functions the scrim is built from.
 *
 * WHY IT IS NOT A SEVENTH THEME
 *
 * The picker offers `auto | light | dark | warm | vibrant | custom`, and a
 * background image that arrived as a seventh option would take the choice away:
 * the user could have a picture OR a dark theme, never both. So this is a LAYER
 * that sits under whichever theme is active and never replaces it. The theme
 * still decides the ink; the picture decides the backdrop; the scrim is what
 * keeps the first readable over the second.
 *
 * WHY THE BYTES GET THEIR OWN KEY, AND NOT THE ATTACHMENT STORE
 *
 * `belso-iranytu-background`, separate from `belso-iranytu-attachments`. Two
 * reasons, and the second is the real one:
 *
 *  - A backdrop is ONE picture that is painted behind every screen, so it has a
 *    real claim on the quota and its own cap. Sharing the 5 MB attachment cap
 *    made a 6 MB wallpaper a hard failure for a reason that has nothing to do
 *    with the journal — a journal photo is shown at card size, a backdrop is
 *    shown at window size, and those are not the same picture.
 *  - "Delete everything" has to be able to free it without touching the
 *    journal's photos. On a shared key that was only true because
 *    `clearBackgroundImage` deleted exactly one id and trusted the caller; the
 *    key is where the coupling lived. Its own key is where the reset lives.
 *
 * `settings.backgroundImage` still holds an id rather than a data URL, for the
 * reason it did before: `AppData` is exported and re-imported as JSON, so a
 * data URL in it would ride out in every export and back in on every import,
 * and the import path has a quota this setting does not.
 *
 * WHY THE SCRIM IS BUILT IN TYPESCRIPT AND NOT SAMPLED PER PIXEL
 *
 * The picture's own AVERAGE colour is read once, when it is picked, and stored
 * as a tint; the scrim is then that tint pushed onto the polarity the theme
 * needs. Two properties come out of that and both are pinned by tests:
 *
 *  - The polarity is NEVER the picture's to choose. The theme's background
 *    decides whether the scrim is light or dark, so "dark ink on a light scrim"
 *    holds for every picture including a pathological one. Letting the picture
 *    pick the polarity would put a pale scrim under pale text the moment
 *    somebody set a light photo on a dark theme.
 *  - The tint is a BLEND toward that polarity, never a replacement for it: the
 *    furthest a tint can drag the scrim is a third of the way, which leaves it
 *    firmly on the ink's side of the line. `deriveScrimRgb`'s tests assert
 *    exactly that with the most hostile tint there is, pure black and pure
 *    white.
 *
 * WHAT COMES NEXT. This averages the whole picture in one pass, which is
 * enough to make the scrim belong to the image and not enough to guarantee
 * anything about a bright patch in one corner of it. `lib/contrast.ts` will
 * replace `deriveScrimRgb` with a real contrast measurement and keep writing the
 * same `--app-bg-*` properties, so nothing here and no component changes when
 * it lands.
 */
import { compressImage } from "./attachments";
import {
  WCAG_TEXT,
  contrastRatio,
  over,
  parseHexRgb,
  type Rgb,
} from "./contrast";
import { pickDynamicInk } from "./dynamicInk";
import { t } from "./i18n";

/** Where the bytes live. Its own key, so the reset chain can free it alone. */
const KEY = "belso-iranytu-background";

/**
 * The scrim opacity used when the setting is absent.
 *
 * Matches `DEFAULT_SETTINGS.backgroundScrim`. Both exist because they are read
 * by different code: the default is what the store merges into a blob, this is
 * what a component falls back to when it holds a partial `Settings`.
 */
export const DEFAULT_SCRIM = 0.55;

/** The lowest and highest the slider offers. 0 is deliberately allowed. */
export const MIN_SCRIM = 0;
export const MAX_SCRIM = 1;

/**
 * A scrim opacity as a real number in range.
 *
 * A number out of range, `NaN`, or anything that is not a number at all falls
 * back to the default rather than being passed through — the value is composed
 * into an `rgba()` string, and an invalid one is dropped by the browser without
 * a word, leaving the reader a photo with no scrim and unreadable text. The
 * store already repairs the stored blob, but this is the boundary that the value
 * crosses, and a component can be handed a partial settings object.
 */
export function clampScrim(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_SCRIM;
  if (value < MIN_SCRIM) return MIN_SCRIM;
  if (value > MAX_SCRIM) return MAX_SCRIM;
  return value;
}

/**
 * The cap for one backdrop, deliberately NOT the attachment store's 5 MB.
 *
 * Bigger, because a backdrop is painted behind the whole app and a phone
 * renders a window three times that wide; 5 MB is a generous budget for a
 * journal photo and a tight one for the one picture that is on screen at all
 * times. It is still a cap, and still far under what `localStorage` will hold
 * in total, so a reader with a full quota gets the quota message rather than a
 * silent truncation.
 */
export const BACKGROUND_MAX_BYTES = 8 * 1024 * 1024;

/**
 * The blur, as a fraction the reader drags, and the pixel length it becomes.
 *
 * A fraction rather than pixels because the slider is a proportion and every
 * other slider in this app is too, and because the two ends are the meaningful
 * ones: 0 is the picture exactly as picked, and the maximum is soft enough that
 * the picture reads as colour rather than as a photograph. 24 px is the top
 * because past that it is the app's flat background with extra work on the
 * compositor, not a picture.
 */
export const MIN_BLUR = 0;
export const MAX_BLUR = 1;
/**
 * 3 px of 24, where it used to be 6.
 *
 * The old default was chosen for a picture that was always magnified to `cover`
 * the viewport, where a large photo is blown up well past its own resolution
 * and needs the softening to stop looking like a mistake. Now that `contain` is
 * the default fit, the picture is shown at its own size instead of being
 * upscaled — so the same 6 px is not softening a blurry enlargement any more,
 * it is blurring a sharp photograph for no reason the reader asked for. 3 px
 * still separates the backdrop from the content; 6 read as a smudge.
 *
 * Existing readers keep whatever they had stored, because `normalizeSettings`
 * repairs a value rather than replacing a valid one. Only a fresh install, or a
 * corrupt value, lands on the new default.
 */
export const DEFAULT_BLUR = 0.125;
export const MAX_BLUR_PX = 24;

/**
 * A blur as a real fraction in range.
 *
 * Same contract as `clampScrim` and for the same reason: the value is composed
 * into a CSS length, and an invalid one is dropped by the browser without a
 * word, leaving the reader with a sharp picture and no way to know why.
 */
export function clampBlur(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_BLUR;
  if (value < MIN_BLUR) return MIN_BLUR;
  if (value > MAX_BLUR) return MAX_BLUR;
  return value;
}

/**
 * A blur fraction as the CSS length the stylesheet paints with.
 *
 * Rounded to one decimal because the scale is 24 px across 100 steps, so
 * anything finer is a number the reader cannot see a difference between.
 */
export function blurPx(value: unknown): string {
  return `${(clampBlur(value) * MAX_BLUR_PX).toFixed(1)}px`;
}

/** Which of the two palettes the scrim is mixed from. */
export type ScrimPalette = "image" | "theme";

/**
 * How the picture is fitted to the viewport.
 *
 * Three answers, and the third is the default:
 *
 *  - `cover` magnifies the picture until it fills the viewport. This is what
 *    the feature shipped with, and it is the reason a sharp photograph arrived
 *    looking soft: a 2000 px image is scaled up until both axes are covered,
 *    and the enlargement IS the blur the reader reported.
 *  - `contain` shows the whole picture at its own size, sharp, with the bands
 *    beside it left empty. Whole and sharp, and on a phone the bands are two
 *    bare strips of the app's own surface — the reader called them "a little
 *    strip".
 *  - `soft` is both at once: the whole picture, sharp, over a blurred and
 *    enlarged copy of THE SAME image filling the bands behind it. One image,
 *    two layers, and the stylesheet owns the paint — `SOFT_FILL_*` below is the
 *    recipe both it and the Settings preview read.
 *
 * `auto` was withdrawn in the same commit that added `soft`. It drew the
 * picture at its intrinsic size with no fitting at all, which for a 1280 px
 * backdrop is a centre crop of a photo far too large for the screen — a sharper
 * `cover`, not an alternative to it. A stored `auto` repairs to the default,
 * which is at least the thing a reader who wanted "don't magnify it" asked for.
 */
export type BackgroundFit = "cover" | "contain" | "soft";

/**
 * `soft`, because it is the only one of the three that answers both halves of
 * the complaint: `contain` alone leaves the bands, `cover` alone magnifies. The
 * other two are still one tap away, so nothing is taken from a reader who wants
 * either end.
 */
export const DEFAULT_FIT: BackgroundFit = "soft";

/**
 * The fill layer's recipe, as constants rather than as literals in two places.
 *
 * The stylesheet paints this layer and the Settings preview has to paint the
 * same one, so the numbers live here and both read them: the stylesheet as the
 * declarations it must carry (a test pins them against these values) and the
 * preview as inline style. A preview whose fill was 24 px while the app's was
 * 40 is the kind of lie this control exists not to tell.
 */
export const SOFT_FILL_BLUR_PX = 40;
export const SOFT_FILL_OPACITY = 0.6;
export const SOFT_FILL_SCALE = 1.1;

/**
 * The reader's three ways to fit the picture, in the order they are offered.
 *
 * The DEFAULT first, for the same reason the palette choices put theirs first:
 * the control's first position is also its most common value, and `soft` is
 * the shipped default — a reader opening this control for the first time
 * should land on the answer the app already chose for them.
 *
 * The labels used to be Hungarian literals here, on the argument that this file
 * is a data module and the sweep that catalogues copy walks components. Round
 * 18 moved them: the sweep's second walk reads `.ts` modules too, and a caption
 * inside a button is copy wherever it is written. The EXPLANATION under each
 * control stays a card key (`background.fitSoft` and friends) — a sentence and a
 * caption read differently and are allowed to translate differently.
 */
export const FIT_CHOICES: { value: BackgroundFit; label: string }[] = [
  { value: "soft", label: t("background.fitChoiceSoft") },
  { value: "cover", label: t("background.fitChoiceCover") },
  { value: "contain", label: t("background.fitChoiceContain") },
];

/**
 * A stored fit that is one of the three, whatever else the blob claims.
 *
 * The same contract as `normalizePalette`, for the same reason: the value goes
 * straight into a CSS property, and a browser drops an invalid one silently —
 * leaving the reader with a picture scaled by nothing and no way to know why.
 * A retired value repairs to the default rather than to an error, which is what
 * makes retiring `auto` a migration rather than a broken blob.
 */
export function normalizeFit(value: unknown): BackgroundFit {
  return value === "cover" || value === "contain" || value === "soft" ? value : DEFAULT_FIT;
}

/**
 * The fit as the `background-size` the stylesheet's PICTURE layer reads.
 *
 * NOT the identity any more, and that is why it is a table: `soft` has no
 * `background-size` keyword of its own — its picture layer is `contain`, and
 * the filling behind it is the second layer, which the stylesheet draws from
 * the same `--app-bg-image` under the root's `bg-fit-soft` class.
 */
export function fitCss(value: unknown): "cover" | "contain" {
  return normalizeFit(value) === "cover" ? "cover" : "contain";
}

/**
 * How far the CARDS fade, 0–1, and 0 by default.
 *
 * Not the same knob as the scrim and not interchangeable with it: the scrim
 * decides how much of the PICTURE reaches the reader, and this decides how much
 * of the app's own card surface does. 0 leaves every card exactly as opaque as
 * it was, which is why it is the default — this is a thing a reader turns on,
 * not a thing that happens to them.
 */
export const MIN_CARD_TRANSPARENCY = 0;
export const MAX_CARD_TRANSPARENCY = 1;
export const DEFAULT_CARD_TRANSPARENCY = 0;

/**
 * A card transparency in range, for the reason every other clamp here exists.
 *
 * The value reaches a `calc()` inside `color-mix()`, and an invalid one there
 * is dropped by the browser without a word — leaving the reader with cards that
 * are neither opaque nor faded and no way to find out why.
 */
export function clampCardTransparency(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_CARD_TRANSPARENCY;
  return Math.min(MAX_CARD_TRANSPARENCY, Math.max(MIN_CARD_TRANSPARENCY, value));
}

/**
 * The scrim's alpha, and the whole story in one line: it is the READER'S OWN
 * NUMBER.
 *
 * This used to be a two-argument compensation — `max(base + t × 0.7, t / 0.6)`
 * — that raised the veil in step with the card slider, on the reasoning that a
 * fading card reveals the scrim, so the scrim had to strengthen to keep the
 * text off the photograph. The reasoning was sound and the interface was not:
 * the two sliders then drove one surface, "Kártyák átlátszósága" behaved
 * exactly like "Háttérletakarás", and no picture ever showed through a card at
 * any position a reader could name. Measured in production, that is the report
 * this rewrite answers.
 *
 * THE TWO KNOBS ARE NOW INDEPENDENT, and the guarantee lives on the composite
 * rather than on this function:
 *
 *  - The card slider fades the CARD — exactly what its label says — and never
 *    moves the veil. At every position of its track the ground under the text
 *    is `over(surface, 1 − t, over(scrim, base, picture))`, affine in `t`, so
 *    its contrast is monotone along the track and its worst point is an
 *    endpoint: the card's own surface at t = 0, or the background's own ground
 *    at t = 1. A faded card can therefore never read worse than the app's own
 *    background text at the same veil. That is `cardGroundRgb`, and
 *    `tests/card-contrast.test.ts` walks it.
 *  - The scrim slider owns readability, as its label has always said. When the
 *    veil is strong enough that the app's own background text clears AA, the
 *    whole card track clears AA too, because the track's worst point is its
 *    end. A reader who drags the veil down has asked to see the photograph,
 *    and the app shows it — the same answer the scrim slider has given since
 *    it shipped, now stated instead of smuggled.
 *
 * WHAT CHANGED IN THE VEIL-FLOOR BATCH, and why the coupling is back in a
 * different shape. The P1 the audit measured is real: with the veil at zero
 * and the card above 50% transparent, the text's ground IS the photograph,
 * and on a photograph that varies across the frame no single ink survives it
 * — the worst-region decision (commit 1) makes the choice honest, but honesty
 * cannot paint contrast that is not there. So the veil regained ONE coupling
 * with the card slider, and only one: `effectiveVeil` floors it at half the
 * card transparency. A reader who fades their cards to 95% gets at least a
 * 47.5% veil behind the text whether they touched the scrim slider or not;
 * a reader whose card is opaque gets exactly their own number, and a reader
 * whose veil is already above the floor gets exactly their own number too.
 * The old slope raised the veil toward OPACITY as the card faded — that is
 * what made the two sliders one surface — and this floor stops at 0.5, so the
 * photograph still shows through at half strength at the far end of the card
 * track. The identity above still holds for `effectiveScrimAlpha`; the floor
 * is a separate, named function that every composite site calls, so a reader
 * with no translucent card on screen cannot receive it.
 */
export function effectiveScrimAlpha(baseScrim: unknown): number {
  return clampScrim(baseScrim);
}

/**
 * How much veil a translucent card drags in behind the text, as a floor.
 *
 * Half the card transparency, on the reader's own 0–1 scale: t = 0.5 lifts a
 * zero veil to 0.25, t = 0.95 to 0.475, and t = 1 stops at 0.5 — half the
 * photograph is always still there. The clamp is the same boundary guard the
 * card slider has everywhere: this value is composed into an alpha the browser
 * would silently drop if it were ever out of range.
 */
export const VEIL_FLOOR_RATIO = 0.5;

export function veilFloor(cardTransparency: unknown): number {
  return clampCardTransparency(cardTransparency) * VEIL_FLOOR_RATIO;
}

/**
 * The veil the app actually paints: the reader's number, floored by the card.
 *
 * This is the one function every composite site calls — the root's inline
 * style, the Settings preview, the ink decision, and `cardGroundRgb` — because
 * a floor applied in some of them would be a floor that lies: the decision
 * would reason about a veil the browser does not paint, which is exactly the
 * class of bug the worst-region batch fixed. `Math.max` rather than a sum or a
 * slope: the floor can only ever RAISE the reader's number, never lower it,
 * and never add anything on top of a veil that already covers the floor.
 */
export function effectiveVeil(baseScrim: unknown, cardTransparency: unknown): number {
  return Math.max(effectiveScrimAlpha(baseScrim), veilFloor(cardTransparency));
}

/**
 * WHETHER THIS PLATFORM PAINTS THE BACKDROP AGAINST THE DOCUMENT rather than
 * against the viewport — the one question the scroll follower's gate turns on.
 *
 * `background-attachment: fixed` is what the stylesheet asks for, and a browser
 * that honours it keeps the same pixels behind the text at every scroll
 * position. Safari on iOS is the measured exception: it ignores the property
 * (`.app.has-bg::before`'s own comment has said so since the backdrop shipped)
 * and positions the picture against the document box, so the visible slice —
 * and with it the ground under the reader's text — moves as they scroll.
 *
 * WHY IT IS A POINTER PROFILE AND NOT A USER-AGENT. Reading the platform's name
 * is the one way to be wrong on a browser that ships tomorrow, and the property
 * that actually matters is not the name but the input: the exception is a
 * touch-scrolling device. Two queries, and the second is the one a single query
 * misses:
 *
 *  - `(hover: none) and (pointer: coarse)` — a phone, or a tablet with no
 *    pointing device attached.
 *  - `(any-pointer: coarse)` with `(hover: hover)` — the SAME device with one
 *    attached: an iPad with a trackpad or a stylus, whose PRIMARY pointer
 *    reports `hover` and `fine`, so a query about the primary pointer alone
 *    leaves the listener unarmed on the very platform it exists for.
 *
 * WHAT THE WIDER QUERY COSTS, and why it is still the right trade. A touchscreen
 * laptop matches `any-pointer: coarse` too and DOES honour `fixed`, so its
 * follower arms and its ground narrows to the visible slice. That is a stricter
 * bound on a device that did not need one — a picture with a dark strip off
 * screen can lift its veil a step — and it is the direction this feature is
 * allowed to be wrong in: the worst case is a slightly stronger veil, never
 * text that cannot be read, because a slice is a SUBSET of the frame and a
 * subset's worst region can only be inside the frame's range. The alternative is
 * an unarmed listener on a device whose backdrop really does scroll, which is
 * the bug the follower was written for.
 *
 * The queries take a `match` function rather than reading `window` themselves,
 * so the profile is arithmetic the tests can walk — and so the caller has one
 * place to ask, instead of the string being spelled out at the call site where a
 * typo would silently disarm the whole path.
 */
export function followsDocumentBackdrop(match: (query: string) => boolean): boolean {
  if (match("(hover: none) and (pointer: coarse)")) return true;
  return match("(any-pointer: coarse)") && match("(hover: hover)");
}

/* ------------------- how far a card may actually fade ------------------- */

/**
 * The grid the ceiling is searched on, and the same grid the test walks.
 *
 * A grid rather than a bisection because the answer has to be reproducible
 * between the app and the guard, and a bisection returns whatever the last
 * midpoint happened to be — fine for a number, wrong for a claim a reviewer
 * will re-derive by hand. One step per 0.5% is finer than the slider's own
 * 5% step, so the slider can always land on a value the guarantee covers.
 */
export const CARD_CEILING_STEPS = 200;

/**
 * The most hostile scrim this reader's own settings can produce.
 *
 * DERIVED, NOT CONSTANT, and the derivation is the whole point: for the picture's
 * palette it is `deriveScrimRgb` handed the darkest possible photograph (for a
 * light theme) or the brightest (for a dark one), so the number moves if
 * `TINT_MIX` moves and cannot drift away from what the app actually paints.
 *
 * THE PALETTE IS AN ARGUMENT, and it is not a formality. A reader who chose the
 * theme's own flat scrim is never exposed to a tint at all, so the worst tint
 * is the worst case for a situation they are not in — and charging them for it
 * would put the same 14% ceiling on a backdrop that can carry far more. Asking
 * the function which palette it is defending is the difference between a bound
 * and a superstition.
 *
 * Calling `deriveScrimRgb` with `undefined` for the image palette would be a
 * mistake worth naming: that path returns the flat 255/0, the BEST case, and a
 * ceiling computed against the best case is not a ceiling at all.
 *
 * The tint is a whole-picture average, so a bright average says nothing about a
 * black corner. This is the average at its worst, which is the only honest
 * bound available before the picture's pixels have been read.
 */
export function worstCaseScrimRgb(
  lightBackground: boolean,
  palette: ScrimPalette,
): Rgb {
  if (palette !== "image") return lightBackground ? [255, 255, 255] : [0, 0, 0];
  const extreme = lightBackground ? "0, 0, 0" : "255, 255, 255";
  const triple = deriveScrimRgb(extreme, lightBackground);
  const parsed = triple.split(",").map((c) => parseInt(c.trim(), 10));
  return [parsed[0]!, parsed[1]!, parsed[2]!];
}

/**
 * The one pixel that makes a scrim least able to hide the text on it.
 *
 * For a light theme the darkest possible pixel, because the ink is dark and it
 * needs a light ground; for a dark theme the lightest, by the same reasoning.
 * `over()` is affine in this value, so the far endpoint is a real bound rather
 * than a sample — there is no interior pixel that produces a worse composite
 * than both ends.
 */
export function worstCasePicture(lightBackground: boolean): Rgb {
  return lightBackground ? [0, 0, 0] : [255, 255, 255];
}

/**
 * The colour a card of `surface` actually shows at `cardTransparency`.
 *
 * The three layers the stylesheet stacks, in the order it stacks them: the
 * scrim over the picture, then the card over the scrim. `cardTransparency` is
 * the slider's own scale, so the card's contribution is `1 − t` — at 0 the card
 * is opaque and this returns `surface` unchanged, which is the property that
 * makes the 0% default a non-event.
 *
 * Exported so the guard composites with this rather than with its own copy.
 */
/**
 * The composite a stack of picture, veil and card actually produces — with the
 * PICTURE as a parameter rather than as an assumption.
 *
 * `cardGroundRgb` is this function with the adversarial picture the guarantee
 * tests use; the dynamic ink is this function with the picture the reader
 * actually chose. Sharing it is the point: two implementations of "what is
 * under the text" would drift, and the drift would only ever show up as a
 * reader's text passing the tests and failing on their photograph.
 */
export function groundWithPicture(
  surface: Rgb,
  scrim: Rgb,
  veilAlpha: number,
  picture: Rgb,
  cardTransparency: number,
): Rgb {
  const t = clampCardTransparency(cardTransparency);
  return over(surface, 1 - t, over(scrim, veilAlpha, picture));
}

export function cardGroundRgb(
  surface: Rgb,
  lightBackground: boolean,
  palette: ScrimPalette,
  baseScrim: unknown,
  cardTransparency: number,
): Rgb {
  return groundWithPicture(
    surface,
    worstCaseScrimRgb(lightBackground, palette),
    // The FLOORED veil, because this is the composite the browser paints: the
    // root writes `effectiveVeil` into `--app-bg-scrim-alpha`, so a ceiling or
    // a guarantee computed against the unfloored number would describe a
    // surface nobody sees.
    effectiveVeil(baseScrim, cardTransparency),
    worstCasePicture(lightBackground),
    cardTransparency,
  );
}

/**
 * The ground where NO card stands between the reader's text and the picture —
 * the section headings, and the words `.app` hands to whatever inherits.
 *
 * The card is the only layer between the two composites, so this is the SAME
 * function with the card fully faded: at `t = 1` the card contributes nothing
 * and `groundWithPicture` leaves `over(scrim, veil, picture)` untouched. It is
 * written as a call rather than as a second `over` chain on purpose — two
 * implementations of "what is under the text" would drift, and the drift would
 * only ever show up as a reader's heading passing the tests and vanishing on
 * their photograph.
 *
 * WHY THE DECISION NEEDS IT. The ink used to be chosen against the card's
 * composite alone, so every rule that paints on the page itself was decided
 * against a surface that is not under it: `.section-title h2` and `.app`'s own
 * inherited colour stand on the picture, and over a dark photograph in a light
 * theme the card's answer — light surface, dark ink — is dark text on a dark
 * picture. That is the same P1 the worst-region batch fixed one layer down, in
 * the layer nobody had named: the decision was honest about WHICH PIXELS, and
 * quiet about WHICH SURFACE they were seen through.
 */
export function pageGroundRgb(surface: Rgb, scrim: Rgb, veilAlpha: number, picture: Rgb): Rgb {
  return groundWithPicture(surface, scrim, veilAlpha, picture, MAX_CARD_TRANSPARENCY);
}

/**
 * HOW FINELY THE VEIL IS SEARCHED for a value an ink can read on.
 *
 * A grid rather than a bisection, for the reason the card ceiling is a grid: the
 * answer has to be reproducible between the app and the guard, and a bisection
 * returns whatever the last midpoint happened to be. 40 steps of the slider's
 * own 0–1 range is a 2.5% step — half the step the reader's control moves in —
 * so the floor can never land on a value the slider could not have reached, and
 * the picture is never hidden by more than a step more than it has to be.
 */
export const VEIL_AA_STEPS = 40;

/**
 * THE LEAST VEIL AT WHICH SOME INK READS ON BOTH GROUNDS — the reader's own
 * number, or a stronger one when their number is not enough.
 *
 * WHAT IT IS FOR. The veil has always been the reader's control, and the
 * veil-floor batch made it the card's business too (`t / 2`). This is the third
 * case, and the only one the reader cannot be expected to solve: a photograph
 * whose own pixels fight the theme hard enough that NO single ink clears AA on
 * the card's ground and the page's ground at once. The reader chose the picture
 * and chose the veil; the app's job is to notice that the two of them together
 * leave a surface nothing can be read on and to strengthen the veil until that
 * stops being true. It is the answer the scrim slider has always given — a
 * stronger veil reads better — applied on the reader's behalf, and only as far
 * as it has to go.
 *
 * WHY IT CANNOT FAIL. At the top of the range the page ground IS the scrim's
 * own colour and the card ground is that colour seen through the surface, so
 * both ends of the composite are the polarity the theme was designed around,
 * where the theme's own ink is AA by construction (`contrast.test.ts` walks it).
 * The search therefore always has an answer; the worst it can do is hide the
 * picture, and it only goes there when there is nothing else left to try.
 *
 * A STEP, NOT A BISECTION, for a second reason beyond reproducibility: the
 * number this returns is a veil the decision was MEASURED AT, so the value the
 * app paints is a value the guarantee was checked against, on the same grounds
 * the browser paints.
 */
export function veilForAA(opts: {
  candidates: readonly Rgb[];
  surface: Rgb;
  scrim: Rgb;
  picture: Rgb;
  cardTransparency: number;
  base: number;
}): number {
  const base = Math.max(0, Math.min(1, opts.base));
  const step = (1 - base) / VEIL_AA_STEPS;
  for (let i = 0; i <= VEIL_AA_STEPS; i++) {
    const veil = i === VEIL_AA_STEPS ? 1 : base + i * step;
    const decision = pickDynamicInk(opts.candidates, [
      groundWithPicture(opts.surface, opts.scrim, veil, opts.picture, opts.cardTransparency),
      pageGroundRgb(opts.surface, opts.scrim, veil, opts.picture),
    ]);
    if (decision?.meetsAA) return veil;
  }
  return 1;
}

/**
 * HOW FAR A GIVEN SET OF FOREGROUNDS MAY FADE, on the composite the stylesheet
 * stacks.
 *
 * THE APP NO LONGER CONSULTS THIS, and that is the change it now documents.
 * The card slider runs the whole 0–100% track because `effectiveScrimAlpha`
 * carries `--ink` across it at every veil value; this is the INSTRUMENT that
 * proves it, kept exported so the guard can reach the exact search the slider
 * was once built from instead of re-implementing it. Two answers come out of
 * it, and `tests/card-contrast.test.ts` asserts both: with `--ink` alone the
 * ceiling is the whole track, and with `--ink-soft` included it is not — the
 * muted foreground is the one that stops early, and that stopping point is
 * exactly what the old slider's 8–21% was measuring.
 *
 * It is measured, not declared: every foreground the caller lists has to clear
 * `WCAG_TEXT` on the worst-case composite at that transparency.
 *
 * WHY MUTED INK STOPS EARLY AT ALL. Because the scrim has a FLOOR that no
 * alpha can lift: its own colour.
 * A light theme whose photograph is very dark gets a tinted scrim of 170, and
 * at full opacity that 170 is the ground the text sits on, where muted ink is
 * 2.6:1. More transparency cannot help, because the picture is already fully
 * hidden — what has to give is the card's own surface. Measured across the four
 * themes and the whole scrim range, muted ink has usable headroom for roughly
 * the first 9%–61% of the slider depending on the theme and the scrim, and the
 * range's upper half is unreadable in every one of them.
 *
 * WHAT "MAXIMUM" MEANS HERE, since it is not "the largest value that passes".
 * It is the largest value for which EVERY value from 0 up to it passes. The
 * composite is not monotone in the transparency — the card starts on its own
 * opaque surface, dips through a mid-grey trough while the veil is weak, and
 * ends on an opaque scrim — so a naive maximum hands back a number whose top
 * end is readable and whose middle is not. A slider has to be safe along its
 * whole length, not only at its ends, so the search stops at the first failure.
 *
 * THE ARGUMENTS, and why each is needed rather than convenient:
 *  - `lightBackground` is the theme's polarity, the one decision
 *    `applyThemeTokens` already makes, so the scrim's floor cannot be picked
 *    from the other end of the space.
 *  - `surface` is the CARD's own colour. Cards and dialogs paint different
 *    surfaces, so a caller that has both passes both and takes the lower
 *    answer — the stricter one governs, and one slider moves one number.
 *  - `baseScrim` is the reader's other slider. Lowering the veil lowers the
 *    ceiling, which is the correct coupling: the two settings describe one
 *    composite surface and neither is meaningful alone.
 *  - `texts` is every foreground that has to survive. Body ink alone would pass
 *    with 0.03:1 to spare, which is a guard that fails on the next palette
 *    tweak rather than one that says something.
 *
 * AN UNPARSEABLE COLOUR ANSWERS 0, NOT 1. A ceiling this function cannot
 * justify must not be spent: with no way to measure, the safe amount of fading
 * is none. That is also why this never throws — a malformed custom theme must
 * not be able to break a measurement the guard runs on every palette.
 */
export function maxCardTransparency(opts: {
  lightBackground: boolean;
  palette: ScrimPalette;
  surface: string | undefined;
  texts: readonly (string | undefined)[];
  baseScrim: unknown;
}): number {
  const surface = parseHexRgb(opts.surface);
  if (!surface) return 0;
  const texts = opts.texts.map((t) => parseHexRgb(t));
  if (texts.some((t) => !t)) return 0;

  const step = 1 / CARD_CEILING_STEPS;
  // SCAN UPWARD AND STOP AT THE FIRST FAILURE. The composite is AFFINE in the
  // transparency — the veil no longer moves with the slider — so its contrast
  // is monotone along the track and the worst point of any range is one of its
  // ends. The prefix scan returns the same answer a largest-passing search
  // would, and it stays correct if a future change ever makes the composite
  // non-monotone again, which is the shape of failure this instrument was
  // built to measure.
  //
  let lastPassing = 0;
  for (let i = 0; i <= CARD_CEILING_STEPS; i++) {
    const t = i * step;
    // The veil floors with `t` inside `cardGroundRgb` now, so a low scrim is
    // partly rescued toward the end of the track — the ceiling can only have
    // risen, and the prefix scan is still the right shape: it stops at the
    // first t the composite cannot justify, floored or not.
    const ground = cardGroundRgb(surface, opts.lightBackground, opts.palette, opts.baseScrim, t);
    const holds = texts.every((fg) => fg !== null && contrastRatio(fg, ground) >= WCAG_TEXT);
    if (!holds) return lastPassing;
    lastPassing = t;
  }
  return MAX_CARD_TRANSPARENCY;
}

/**
 * The image's palette wins by default.
 *
 * It is the better default because it is the one the reader cannot get wrong by
 * accident: a flat black scrim over a warm photograph looks like a bug, while a
 * scrim carrying the picture's own colour looks deliberate. It is also the
 * option that survives a theme change — the picture does not change, so neither
 * does the tint — which the other option cannot say.
 */
export const DEFAULT_PALETTE: ScrimPalette = "image";

/**
 * The two choices, in the order they are offered: the default first, so the
 * control's first position is also its most common value.
 *
 * `label` is a `Segmented` button caption, so it has to survive being read out
 * of context by a screen reader, which is why it does not say "palette" — the
 * `ariaLabel` on the group does that.
 */
export const PALETTE_CHOICES: { value: ScrimPalette; label: string }[] = [
  { value: "image", label: t("background.paletteChoiceImage") },
  { value: "theme", label: t("background.paletteChoiceTheme") },
];

/** A stored palette, or the default for anything that is not one of the two. */
export function normalizePalette(value: unknown): ScrimPalette {
  return value === "theme" ? "theme" : DEFAULT_PALETTE;
}

/**
 * How much of the picture survives into the scrim.
 *
 * A third, and the number is a legibility number rather than an aesthetic one:
 * this is the furthest a tint may drag the scrim before it stops being a scrim.
 * At a third, the brightest a dark scrim can get is 85 and the darkest a light
 * scrim can fall is 170 — and `isLight` draws its line at 0.5, which 85/255 and
 * 170/255 clear in opposite directions, 0.167 of the scale apart on each side,
 * which is as symmetric as the number allows. Half would be closer to the
 * picture, and would put a white photo's dark scrim at exactly 128, which is
 * the line itself.
 */
export const TINT_MIX = 1 / 3;

/** `"r, g, b"` as three channel values, or null for anything else. */
export function parseTint(value: unknown): [number, number, number] | null {
  if (typeof value !== "string") return null;
  const parts = value.split(",");
  if (parts.length !== 3) return null;
  const channels: number[] = [];
  for (const part of parts) {
    const text = part.trim();
    // The empty check is not redundant. `Number("")` is 0, so without it
    // `"0,,0"` parses as black — and a colour string with a hole in it is
    // exactly what a hand-edited blob or a truncated write looks like, and the
    // store uses this function to decide whether a stored tint is corruption.
    // Treating that as a colour would put a black scrim under a light theme's
    // dark ink, which reads as "the app is broken" rather than as bad data.
    if (text === "") return null;
    const n = Number(text);
    if (!Number.isFinite(n) || n < 0 || n > 255) return null;
    channels.push(Math.round(n));
  }
  return [channels[0]!, channels[1]!, channels[2]!];
}

/**
 * The scrim's RGB triple, from the picture's tint and the theme's polarity.
 *
 * `lightBackground` is the THEME's answer — `isLight(tokens.bg)`, the one
 * decision the codebase already makes in `applyThemeTokens` and `color-scheme`
 * — and it is the only thing that decides light or dark here. The tint decides
 * which colour inside that half of the space the scrim is, never which half.
 *
 * With no tint, or one that will not parse, the result is the flat polarity
 * triple. That is the same value `applyThemeTokens` writes as
 * `--app-bg-scrim-rgb`, so a picture whose colour could not be read degrades to
 * exactly the behaviour that shipped before tints existed, rather than to no
 * scrim at all.
 */
export function deriveScrimRgb(tint: unknown, lightBackground: boolean): string {
  const base = lightBackground ? 255 : 0;
  const rgb = parseTint(tint);
  if (!rgb) return triple(base);
  const mixed = rgb.map((channel) => Math.round(base + (channel - base) * TINT_MIX));
  return triple(mixed[0]!, mixed[1]!, mixed[2]!);
}

/** A triple, in the comma form the stylesheet composes into an `rgba()`. */
function triple(r: number, g = r, b = r): string {
  return `${r}, ${g}, ${b}`;
}

/* ------------------------------- the store ------------------------------- */

type Stored = { [id: string]: { dataUrl: string } };

function read(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Stored;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function write(all: Stored) {
  try {
    // The key goes rather than an empty object, so "the reader has no backdrop"
    // and "there is an empty record of one" are the same state — the second is
    // a thing a crash mid-write can leave behind.
    if (Object.keys(all).length === 0) {
      localStorage.removeItem(KEY);
      return;
    }
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Storage full or unavailable — the caller shows this, the same way the
    // attachment store does.
    throw new Error(t("background.errorStorage"));
  }
}

/**
 * An id for the backdrop.
 *
 * Local rather than shared with `attachments`, so the two stores have no way to
 * mint the same id and no reason to change together. It is the same two-step
 * fallback the attachment store uses, for the same reason: `crypto` is absent
 * from an insecure origin in some browsers and present everywhere else.
 */
function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `bg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Base64 data URL from a Blob, without a FileReader so bun can run it. */
async function blobToDataUrl(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return `data:${blob.type || "application/octet-stream"};base64,${btoa(binary)}`;
}

/**
 * Store a picked picture and return its id.
 *
 * The type check is here rather than left to `<input accept>`: `accept` is a
 * filter the picker offers, not a promise the browser keeps, and an SVG or a
 * PDF arriving here would be stored and then painted as a background that never
 * loads. Rejects with a message the caller can show.
 *
 * The downscale is the journal photo's own — 1280 px, JPEG — and that is right
 * here for a reason the photo does not have: a blurred backdrop shows colour,
 * not detail, so the extra pixels would be bytes nobody can see. Anything past
 * `BACKGROUND_MAX_BYTES` after that is refused rather than stored, because the
 * cap is what keeps one picture from filling the origin's whole quota.
 */
export async function pickBackgroundImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error(t("background.errorType"));
  }
  const blob = await compressImage(file);
  if (blob.size > BACKGROUND_MAX_BYTES) {
    throw new Error(t("background.errorTooLarge"));
  }
  const id = newId();
  const all = read();
  for (const existing of Object.keys(all)) delete all[existing];
  all[id] = { dataUrl: await blobToDataUrl(blob) };
  write(all);
  return id;
}

/**
 * The data URL for a stored backdrop, or null.
 *
 * Null is the normal answer for a large share of calls — no image set, or an id
 * whose bytes are gone (the blob was cleared outside the app, or the origin's
 * quota evicted it). Both mean the same thing to every caller: show the empty
 * state.
 */
export function loadBackgroundImage(id: string | undefined): string | null {
  if (!id) return null;
  return read()[id]?.dataUrl ?? null;
}

/**
 * Delete one stored backdrop.
 *
 * Called when the reader removes the background. Without it the id would go and
 * the bytes would stay: a megabyte the reader believes they deleted, still on
 * the device. The caller clears `settings.backgroundImage`; this frees the blob
 * it pointed at.
 */
export function clearBackgroundImage(id: string | undefined): void {
  if (!id) return;
  const all = read();
  if (!(id in all)) return;
  delete all[id];
  write(all);
}

/**
 * Forget every backdrop, unconditionally.
 *
 * This is the one the "delete everything" chain calls, and it takes no id on
 * purpose. The chain used to be able to name the current id and nothing else,
 * which meant a backdrop set on a device that had since been restored from an
 * older export — where `settings.backgroundImage` names a blob that is not
 * there — would leave its bytes behind while the settings were emptied. Naming
 * nothing and dropping the key cannot be wrong in that case.
 */
export function resetBackgroundImage(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to do: a key that cannot be removed is a key that was not there.
  }
}

/* ------------------------------ the sample ------------------------------- */

/**
 * The picture's average colour, as `"r, g, b"`, or null.
 *
 * Read once, when the picture is picked, and stored — because the app root needs
 * the answer on every render and at every theme, and re-decoding a
 * full-screen JPEG to average it again would be the most expensive thing in the
 * app for the least visible result.
 *
 * The average is over a 16×16 downscale of the whole picture, which is what
 * makes it cheap: `drawImage` does the scaling and one `getImageData` on 256
 * pixels is a rounding error of work. Null is a real answer, not a failure to
 * try — no canvas (an insecure origin, or a test), a decode that failed, or a
 * `SecurityError` from a tainted surface all land here, and every one of them
 * means the same thing to the caller: use the theme's flat scrim.
 */
export async function sampleTint(dataUrl: string): Promise<string | null> {
  if (typeof document === "undefined") return null;
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("image decode failed"));
      el.src = dataUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0, 16, 16);
    const { data } = ctx.getImageData(0, 0, 16, 16);
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i] ?? 0;
      g += data[i + 1] ?? 0;
      b += data[i + 2] ?? 0;
    }
    const n = data.length / 4;
    return `${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)}`;
  } catch {
    return null;
  }
}
