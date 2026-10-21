/**
 * The "Háttérkép" control — the reader chooses a picture for the app's backdrop.
 *
 * WHAT THIS IS, AND WHAT IT IS NOT. It is a LAYER, not a seventh theme. The
 * theme picker still decides the ink; this decides the backdrop. That is why it
 * lives in its own card below the theme grid rather than inside it: a background
 * image and a dark theme are not alternatives, and a reader who wants both
 * should not have to choose.
 *
 * THE FILE INPUT IS A REAL `<input type="file">` UNDER A `<label>`, not a
 * `<button>` that calls `input.click()`. The label form is the one that keeps the
 * native picker — which is what knows about the user's camera roll, cloud drives
 * and format support — and it stays keyboard-reachable for free.
 *
 * The reader is shown the result immediately: picking a picture saves it, and
 * the preview here is the same bytes the whole app will now paint behind itself,
 * with the same blur and the same scrim over it. There is no separate "apply"
 * step, because there is nothing to get wrong — removing it is one tap and one
 * click on the original file.
 *
 * WHERE THE PALETTE CHOICE LIVES, and why it is here rather than in the
 * custom-theme editor. The question the choice answers — my palette or the
 * picture's, when I have both — is asked by every reader who sets a picture, not
 * only the ones who hand-edited thirteen hex values, and the custom-theme editor
 * renders nothing at all unless `theme === "custom"`. Putting it here also puts
 * it next to the slider it modifies, which is the scrim: one control surface
 * that decides what the scrim is made of and how much of it there is.
 *
 * THE CARD TRANSPARENCY SLIDER, and why it sits next to the scrim. The two
 * controls are two surfaces, and each owns one: this one fades the app's own
 * cards, the scrim slider decides how much of the picture reaches the reader.
 * They used to be coupled — fading a card RAISED THE VEIL toward opacity, so
 * the transparency felt exactly like the letakarás and no picture ever showed
 * through. That slope is gone; what replaced it in the veil-floor batch is one
 * FLOOR, not a coupling: a card above 0% transparency guarantees at least
 * `t / 2` of veil behind the text, so a reader who fades their cards to the
 * end still reads on a 50% veil while the photograph shows through at half
 * strength. Readability where the card is gone is still the scrim slider's
 * job, which is why the two still sit side by side.
 *
 * WHY THE PREVIEW ALSO DRAWS A CARD. It is the one thing this file could do
 * that would be a lie. Every other control here changes the picture or the veil
 * over it, and the preview shows both, so moving a slider visibly moves
 * something. A card transparency moved with no card on screen would show the
 * scrim changing and nothing else — the reader would conclude the control does
 * something small and unexplained. The sample card uses the same mix the app
 * does, off the same custom property.
 *
 * WHAT IS NOT HERE YET. No per-pixel contrast: the scrim's POLARITY is the
 * theme's and cannot be overridden, and the picture only tints within it. See
 * `lib/imageBackground` for the seam the real engine plugs into.
 */
import { useState } from "react";
import { Segmented } from "./ui/ui";
import { useTheme } from "../state/ThemeContext";
import {
  DEFAULT_BLUR,
  DEFAULT_CARD_TRANSPARENCY,
  DEFAULT_FIT,
  DEFAULT_PALETTE,
  FIT_CHOICES,
  MAX_BLUR,
  MAX_CARD_TRANSPARENCY,
  MAX_SCRIM,
  MIN_BLUR,
  MIN_CARD_TRANSPARENCY,
  MIN_SCRIM,
  PALETTE_CHOICES,
  SOFT_FILL_BLUR_PX,
  SOFT_FILL_OPACITY,
  SOFT_FILL_SCALE,
  blurPx,
  clampCardTransparency,
  effectiveVeil,
  fitCss,
  normalizeFit,
  clampBlur,
  clampScrim,
  clearBackgroundImage,
  deriveScrimRgb,
  loadBackgroundImage,
  parseTint,
  pickBackgroundImage,
  sampleTint,
  type BackgroundFit,
  type ScrimPalette,
} from "../lib/imageBackground";
import { isLight } from "../lib/themes";
import { t } from "../lib/i18n";

type Props = {
  /** The stored background id, or undefined for "no image". */
  imageId: string | undefined;
  /** The reader's scrim opacity, 0–1. */
  scrim: number | undefined;
  /** How far the picture is softened, 0–1. */
  blur: number | undefined;
  /** How far the app's own cards fade over the backdrop, 0–1. */
  cardTransparency: number | undefined;
  /** Which palette the scrim is mixed from. */
  palette: ScrimPalette | undefined;
  /** How the picture is fitted to the viewport. */
  fit: BackgroundFit | undefined;
  /** The picture's average colour, as `"r, g, b"`. */
  tint: string | undefined;
  /**
   * Whether the reader has asked for high contrast.
   *
   * A PROP and not a `useApp()` read, because this is the one setting that
   * overrides everything the other controls here do. The preview has to honour
   * it — it is what the app will paint — and threading it in keeps this a
   * control that takes values rather than one that reaches into the store to
   * find them.
   */
  highContrast: boolean | undefined;
  /** Write a new selection (id) or, with undefined, remove it. */
  onImageChange: (id: string | undefined) => void;
  /** Write the scrim opacity. */
  onScrimChange: (alpha: number) => void;
  /** Write the blur fraction. */
  onBlurChange: (fraction: number) => void;
  /** Write how far the cards fade. */
  onCardTransparencyChange: (fraction: number) => void;
  /** Write the palette. */
  onPaletteChange: (palette: ScrimPalette) => void;
  /** Write how the picture is fitted. */
  onFitChange: (fit: BackgroundFit) => void;
  /** Write the sampled tint, or clear it with undefined. */
  onTintChange: (tint: string | undefined) => void;
  /**
   * The ink decision's own report about the ground the reader is looking at,
   * or `undefined` when there is no decision to report (no picture, no
   * canvas). `false` renders the AA warning; `true` renders nothing.
   */
  inkMeetsAA?: boolean | undefined;
  /**
   * The veil the app is painting for this picture, when the ink needed a
   * stronger one than the sliders produce. The preview shows the STRONGER of the
   * two, because it is a preview of the app's surface and the app's surface is
   * whatever the decision had to paint — a preview showing the softer number
   * would promise a surface the reader will not get.
   */
  inkVeil?: number | undefined;
};

/**
 * The scrim triple as a CSS `rgba()` argument.
 *
 * Read from `var(--app-bg-scrim-rgb)` rather than recomputed from the theme,
 * and that is the point: the preview and the whole app paint the same scrim
 * because they read the same custom property, which `applyThemeTokens` writes
 * from the resolved tokens. A second implementation of "is this theme light"
 * here would be one more place to disagree — and the disagreement would be
 * invisible until a reader saw a light scrim under a dark theme.
 */
const SCRIM_RGB = "var(--app-bg-scrim-rgb, 0, 0, 0)";

/**
 * What the input accepts — the HTML image media-type wildcard, built from two
 * halves rather than written out.
 *
 * The split is not fussiness. A literal slash-star at the end of that string
 * reads as a block-comment OPENER to any tool that strips comments by pattern,
 * so writing it whole pairs with the next real comment closer and swallows the
 * code in between. That is not hypothetical: this component's class names were
 * exactly what got swallowed, and `tests/batch12-css.test.ts` duly reported two
 * of them as unreachable CSS because its scanner could not see past its own
 * heuristic. `HealthImportCard` escapes it only because its filter has no
 * wildcard in it.
 *
 * So the two characters are never adjacent anywhere in this file, which leaves
 * the opener and closer counts balanced and every class name visible.
 */
const ACCEPT = ["image", "*"].join("/");

export default function BackgroundImagePicker({
  imageId,
  scrim,
  blur,
  palette,
  fit,
  cardTransparency,
  tint,
  highContrast: highContrastProp,
  onImageChange,
  onScrimChange,
  onBlurChange,
  onCardTransparencyChange,
  onPaletteChange,
  onFitChange,
  onTintChange,
  inkMeetsAA,
  inkVeil,
}: Props) {
  const { tokens } = useTheme();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Read through the loader rather than keeping our own copy, so the preview
  // cannot disagree with what the app paints: one source of truth, the store.
  const preview = loadBackgroundImage(imageId);
  const alpha = clampScrim(scrim);
  const softened = clampBlur(blur ?? DEFAULT_BLUR);
  const chosen = palette ?? DEFAULT_PALETTE;
  const sizing = normalizeFit(fit ?? DEFAULT_FIT);
  // The default is read HERE rather than in the prop signature, so a settings
  // blob written before this control existed — which is every stored install
  // today — renders as 0% instead of as an empty range input with the thumb at
  // the wrong end. `undefined` is a real stored value, not a mistake.
  //
  // The WHOLE 0–100% range is the reader's, and it is a plain clamp: the value
  // fades the card and nothing else directly. From the veil-floor batch on it
  // also FLOORS the veil at `t / 2` — the one coupling the old slope was
  // replaced by — and what the reader sees through a faded card is the picture
  // behind at least half a veil, more if the scrim slider says so.
  const faded = clampCardTransparency(cardTransparency ?? DEFAULT_CARD_TRANSPARENCY);
  // The theme's polarity — `isLight(tokens.bg)`, the same one call
  // `applyThemeTokens` makes and the same one the scrim's floor is derived
  // from.
  const lightBackground = isLight(tokens.bg ?? "#ffffff");

  // The SAME derivation the app root runs, from the SAME two inputs — the
  // theme's own background and the sampled tint. Two implementations of this
  // would be two previews, and only one of them would be the app.
  //
  // And the same high-contrast override the stylesheet applies there, because a
  // preview that showed a tinted, translucent scrim while the app painted an
  // opaque flat one would be a preview that lies — which is the one thing this
  // control exists to avoid.
  //
  // The third case is the one that is easy to get wrong: with no tint — no
  // picture yet, or a colour the device could not read — the answer is not
  // "a literal triple the picker computed" but the CSS PROPERTY, because that is
  // what the app paints, and a change to what `applyThemeTokens` writes for the
  // flat scrim has to reach this preview without anyone editing a component.
  const highContrast = highContrastProp === true;
  const hasTint = chosen === "image" && parseTint(tint) !== null;
  const painted = highContrast || !hasTint ? SCRIM_RGB : deriveScrimRgb(tint, lightBackground);
  // The reader's own alpha — the veil does not move when the card slider
  // does, so the preview and the app paint the same number for the same reason
  // the rest of this preview agrees with the app. High contrast still wins
  // outright — it is an opaque flat scrim and no slider overrides it, which is
  // the same precedence the stylesheet gives it at `.app.contrast-high`.
  // The veil the preview paints, with the card floor the root paints —
  // `effectiveVeil`, the same function, the same two inputs. High contrast
  // still wins outright: it is an opaque flat scrim and no slider overrides
  // it, which is the same precedence the stylesheet gives it at
  // `.app.contrast-high`. Without the floor this preview would show a veil the
  // app does not paint, at exactly the card positions the floor exists for.
  // The reader's own veil, and the veil the app actually paints: the floor can
  // only ever RAISE what the sliders compose, so these two differing is a fact
  // about this picture and is announced as one below.
  const ownVeil = effectiveVeil(alpha, faded);
  const paintedAlpha = highContrast ? 1 : Math.max(ownVeil, inkVeil ?? 0);
  /*
   * WHETHER THE INK DECISION HAD TO STRENGTHEN THE VEIL.
   *
   * `undefined` — no picture, or no canvas to measure one — means there is no
   * decision and nothing to announce; high contrast pins the veil opaque
   * whatever the sliders say, so there is nothing to announce there either. And
   * the comparison is against the reader's OWN composition rather than against
   * zero: a floor that lands exactly on the slider asks for nothing the reader
   * did not already ask for, and a notice there would be noise on every picture
   * that happens to suit its theme.
   */
  const lifted = !highContrast && inkVeil !== undefined && inkVeil > ownVeil + Number.EPSILON;

  async function onPick(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const id = await pickBackgroundImage(file);
      // Sample BEFORE replacing the reference, from the bytes we just stored.
      // A null sample is a real answer — no canvas, a decode that failed — and it
      // clears the stale tint rather than leaving the previous picture's colour
      // behind to tint a backdrop the reader has already thrown away.
      const sampled = await sampleTint(loadBackgroundImage(id) ?? "");
      onTintChange(sampled ?? undefined);
      // Replace, don't stack: the old picture's bytes go now, while we still
      // know its id. Setting the new id first would orphan them.
      const previous = imageId;
      onImageChange(id);
      clearBackgroundImage(previous);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("background.errorLoad"));
    } finally {
      setBusy(false);
    }
  }

  function onRemove() {
    clearBackgroundImage(imageId);
    onImageChange(undefined);
    // The tint goes with the picture. Left behind it would keep painting a
    // colour derived from bytes that are no longer on the device, and the next
    // picture would inherit it until its own sample landed.
    onTintChange(undefined);
    setError(null);
  }

  return (
    <div className="bg-picker">
      <p className="muted-note">{t("background.emptyHint")}</p>

      <label className={`btn btn-soft bg-pick-button ${busy ? "bg-pick-busy" : ""}`}>
        <input
          type="file"
          accept={ACCEPT}
          className="bg-pick-input"
          disabled={busy}
          onChange={(e) => {
            void onPick(e.target.files?.[0]);
            // Clearing the input lets the SAME file be picked again after a
            // removal; without it the change event never fires a second time.
            e.target.value = "";
          }}
        />
        {busy ? t("background.busy") : preview ? t("background.replace") : t("background.choose")}
      </label>

      {error ? (
        <p className="bg-pick-error" role="alert">
          {error}
        </p>
      ) : null}

      {preview ? (
        <div className="bg-pick-preview-wrap">
          {/* The picture, the soft fill under it when the fit asks for one, the
              flat tint over both and the sample card on top — the SAME recipe
              the app root uses, so the preview is not a simplification of the
              thing it previews. The tint's colour comes from the shared CSS
              property rather than from a second "is this theme light" here, the
              blur comes from the same `blurPx` the app root writes into its
              inline style, and the picture layer's size comes from the same
              `fitCss` — which is `contain` for both `contain` and `soft`. */}
          <div className="bg-pick-preview">
            {sizing === "soft" ? (
              // The third layer, painted exactly as `.app-bg-fill` is: the same
              // picture, cover-sized, behind the sharp copy and under the scrim.
              // The numbers are the shared `SOFT_FILL_*` constants rather than
              // literals, because a preview whose fill was fainter or softer
              // than the app's is the one lie this control must not tell.
              <div
                className="bg-pick-preview-fill"
                aria-hidden="true"
                style={{
                  backgroundImage: `url("${preview}")`,
                  backgroundSize: "cover",
                  filter: `blur(${SOFT_FILL_BLUR_PX}px)`,
                  opacity: SOFT_FILL_OPACITY,
                  transform: `scale(${SOFT_FILL_SCALE})`,
                }}
              />
            ) : null}
            <div
              className="bg-pick-preview-image"
              style={{
                backgroundImage: `url("${preview}")`,
                backgroundSize: fitCss(sizing),
                filter: `blur(${blurPx(softened)})`,
                // `soft` promises the whole picture, so the 6% magnification
                // the stylesheet gives this layer goes — it would crop the very
                // edges the mode exists to show.
                transform: sizing === "soft" ? "none" : undefined,
              }}
            />
            <div
              className="bg-pick-preview-scrim"
              style={{ background: `rgba(${painted}, ${paintedAlpha})` }}
            />
            {/* The sample card, painted with `--app-card-transparency` rather than
                a value of its own, so it is the same declaration the app's cards
                resolve. The line of text is here to show that the TEXT stays
                readable at the faded end, which is the promise this control
                makes and the thing a bare swatch could not demonstrate.

                ONE string rather than a title and a body: `BackgroundImagePicker`
                is in i18n round 13, which was already at the 25-literal ceiling,
                and a heading that says nothing would have cost a sweep round to
                avoid. */}
            <div className="bg-pick-preview-card">{t("background.sampleCard")}</div>
          </div>

          <div className="bg-pick-row">
            <label className="bg-pick-scrim-label" htmlFor="bg-scrim">
              {t("background.scrimLabel")}
            </label>
            {/* The existing `.slider` class rather than a new one, so the thumb
                and track are the app's own rather than a second look. NOT the
                `Slider` COMPONENT: that one wants emoji ends and steps by 1,
                and this runs 0–100% in steps of 5. `aria-valuetext` carries the
                percentage, because a raw "0.55" is not what a screen reader
                should read out for a visual control. */}
            <input
              id="bg-scrim"
              type="range"
              min={MIN_SCRIM}
              max={MAX_SCRIM}
              step={0.05}
              value={alpha}
              aria-valuetext={t("background.percent", { value: Math.round(alpha * 100) })}
              className="slider"
              onChange={(e) => onScrimChange(clampScrim(Number(e.target.value)))}
            />
            <span className="bg-pick-scrim-value">{Math.round(alpha * 100)}%</span>
          </div>

          {/*
              THE HONEST REPORT, when the app's own ink decision says the
              current settings do not reach WCAG AA. `meetsAA` is the hook's
              answer about the ground the reader is actually looking at, and
              this is the one place it is shown rather than only computed.

              `=== false` rather than a falsy check: `undefined` means there is
              no decision to report — no picture yet, or a canvas the browser
              could not give — and "no answer" must not be dressed up as a
              warning. With today's single-ground decision the condition cannot
              fire (for any ground one of black and white clears 4.5:1), and
              the line is still here on purpose: `meetsAA` is the app's honest
              self-report, and a future change that can make it false — a
              second ground, a higher minimum — must reach the reader instead
              of only the devtools.

              `role="status"` because it appears without focus moving: a polite
              live region is how a change a reader did not trigger is announced. */}
          {inkMeetsAA === false ? (
            <p className="bg-pick-ink-warning" role="status">
              {t("settings.bg.inkWarning")}
            </p>
          ) : null}

          {/*
              THE VEIL THE READER DID NOT CHOOSE, announced rather than left to
              be noticed.

              The floor exists so the text stays readable over a picture that
              fights the theme, and it can land well above the slider's
              position: a reader who asks for 25% and receives 70% has a right
              to the reason, and the reason is not something they can act on by
              looking at the sliders — both of them already say what they said.

              It stands BESIDE the AA warning rather than instead of it, and the
              two are independent on purpose: where the floor did its job the
              warning is silent (`meetsAA` is `true`, the ink reads), which is
              exactly the case this notice exists for. A reader whose text is
              readable but whose picture is heavily veiled is the reader the
              old code left guessing.

              The number is the veil the app PAINTS, in the units of the slider
              directly above: percentages, so the notice and the control read as
              one story rather than two number systems.

              `role="status"` for the same reason the warning has it — the line
              appears without focus moving, and a polite live region is how a
              change the reader did not trigger is announced. */}
          {lifted ? (
            <p className="bg-pick-ink-lifted" role="status">
              {t("settings.bg.veilFloorNotice", { value: Math.round(paintedAlpha * 100) })}
            </p>
          ) : null}

          <div className="bg-pick-row">
            <label className="bg-pick-scrim-label" htmlFor="bg-card-alpha">
              {t("background.cardAlphaLabel")}
            </label>
            {/* Next to the scrim on purpose — but the opposite of what the old
                comment said: the two are INDEPENDENT dials over adjacent
                surfaces, and this one is what a reader reaches for when the
                cards sit too heavily on a picture. Where the card is gone the
                text stands on the veil the scrim slider set, and the hint
                below carries that, because "what holds the text up at 100%?"
                is the only follow-up question this control creates.

                The track is the whole 0–100%: at the far end the card is gone
                and the picture is exactly where the app's own background text
                sits. */}
            <input
              id="bg-card-alpha"
              type="range"
              min={MIN_CARD_TRANSPARENCY}
              max={MAX_CARD_TRANSPARENCY}
              step={0.05}
              value={faded}
              aria-valuetext={t("background.percent", { value: Math.round(faded * 100) })}
              className="slider"
              onChange={(e) =>
                onCardTransparencyChange(clampCardTransparency(Number(e.target.value)))
              }
            />
            <span className="bg-pick-scrim-value">{Math.round(faded * 100)}%</span>
          </div>

          <p className="bg-pick-hint">{t("background.cardAlphaHint")}</p>

          <div className="bg-pick-row">
            <label className="bg-pick-scrim-label" htmlFor="bg-blur">
              {t("background.blurLabel")}
            </label>
            {/* Same control and the same reason for not using `Slider`. The
                printed value is the fraction rather than the pixel length on
                purpose: 25% is a position the reader chose, "6.0px" is not, and
                the two would disagree about what the number means. */}
            <input
              id="bg-blur"
              type="range"
              min={MIN_BLUR}
              max={MAX_BLUR}
              step={0.05}
              value={softened}
              aria-valuetext={t("background.percent", { value: Math.round(softened * 100) })}
              className="slider"
              onChange={(e) => onBlurChange(clampBlur(Number(e.target.value)))}
            />
            <span className="bg-pick-scrim-value">{Math.round(softened * 100)}%</span>
          </div>

          {/* The fit, as the app's own radio-as-buttons, and rendered only once
              a picture exists for the same reason the palette choice is: with
              no picture there is nothing for the choice to change. It sits above
              the blur rather than below it because it decides how large the
              thing being blurred is drawn — which is what made the shipped
              default look soft in the first place. */}
          <div className="bg-pick-palette">
            <span className="bg-pick-palette-label">{t("background.fitLabel")}</span>
            <Segmented
              options={FIT_CHOICES}
              value={sizing}
              onChange={(next) => onFitChange(next)}
              ariaLabel={t("background.fitAria")}
            />
            <p className="bg-pick-hint">
              {sizing === "cover"
                ? t("background.fitCover")
                : sizing === "contain"
                  ? t("background.fitContain")
                  : t("background.fitSoft")}
            </p>
          </div>

          {/* The two palettes, as the app's own radio-as-buttons. Rendered only
              once a picture is set, because with no picture there is nothing
              for the choice to change and an inert control is worse than an
              absent one. */}
          <div className="bg-pick-palette">
            <span className="bg-pick-palette-label">{t("background.paletteLabel")}</span>
            <Segmented
              options={PALETTE_CHOICES}
              value={chosen}
              onChange={(next) => onPaletteChange(next)}
              ariaLabel={t("background.paletteAria")}
            />
            <p className="bg-pick-hint">
              {highContrast
                ? t("background.paletteHighContrast")
                : chosen === "image"
                  ? t("background.paletteImage")
                  : t("background.paletteTheme")}
            </p>
          </div>

          <button type="button" className="btn btn-ghost" onClick={onRemove}>
            {t("background.remove")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
