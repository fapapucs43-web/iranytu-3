# The background-image fixes — five reports, one stack, and the defects the guards found

The record of one piece of work in three commits — the card transparency slider
running the whole 0–100% track, the `Lágy kitöltés` fit, and the verification
commit that wrote the guards, then found a real browser defect they had been
blind to — followed by three more that a reader could only report by looking at
the running app: a hover that un-faded the card it was fading, a set of small
menus the fade could not reach, and text that stayed the colour the theme chose
no matter what was behind it. The code is in
`src/lib/imageBackground.ts`, `src/lib/dynamicInk.ts`, `src/state/useDynamicInk.ts`,
`src/App.tsx`, `src/components/BackgroundImagePicker.tsx` and `src/styles.css`;
the guards are in `tests/card-contrast.test.ts`,
`tests/lib/image-background.test.ts`, `tests/lib/background-app.test.ts`,
`tests/lib/dynamic-ink.test.ts`,
`tests/components/BackgroundImagePicker.test.tsx` and
`tests/background-stack.test.ts`.

Every number below is recomputable: the maths lives in `lib/imageBackground`
and `lib/dynamicInk`, the palettes in `lib/themes`, and the contrast formulas in
`lib/contrast`.

## What was reported

1. **The transparency slider stopped short of its end.** It did: the track was
   capped at a measured ceiling of 8–21%, because a card faded past its own
   surface handed its text to a mid-tone while the scrim was too weak to fix it.
2. **A sharp photograph arrived looking soft.** It did: `background-size:
   cover` magnifies a 2000 px photo until it fills the viewport, and the
   enlargement *is* the softening. The first fix was `contain` — whole and
   sharp, but on a phone it leaves bare bands beside the picture, which the
   reader called "a little strip".
3. **Hovering a faded card made it opaque again.** It did: nine hover rules
   painted `--surface-2`, `--brand-soft` or `--danger-soft` directly, and a
   hover is the one moment the reader is looking hardest at the card — so the
   fix was measured at the moment it could least afford to be wrong. Fix 4.
4. **Small menus were still solid.** They were: the fade was written for two
   selectors, `.card` and `.dialog`, and thirty other surfaces painted a theme
   token directly. Fix 5.
5. **The text never changed colour for the picture.** It did not: `--ink` is a
   theme token, chosen for a flat surface, and a bright photograph behind it is
   a different surface. Fix 6.

## Fix 1 — two sliders, one veil each

The first version of this fix answered the report with a compensation:
`effectiveScrimAlpha(base, t)` raised the veil in step with the card fade, on
the reasoning that a fading card reveals the scrim, so the scrim had to
strengthen to keep the text off the photograph. The reasoning was sound and the
interface was not. Measured in production, the report this rewrite answers is
that the two sliders "did the same thing" — because they drove one surface: at
the default veil of 0.55 a half-faded card still painted a 90% scrim under it,
and no photograph ever showed through a card at any position a reader could
name. The coupling WAS the bug, and this rewrite removes it.

The slider is the reader's again, and each slider owns one layer.
`effectiveScrimAlpha(baseScrim)` takes one argument and is the clamp it always
was — the veil is the number the Háttérletakarás slider holds, at every
position of the other one. `cardGroundRgb` composites the three layers the
stylesheet stacks, in the order it stacks them:

```
over(surface, 1 − t, over(scrim, base, picture))     // t = card transparency, base = the reader's scrim
```

which is AFFINE in `t` with a veil that does not move: a card's ground is a
straight blend between its own surface and the background's own ground, so its
worst point is an endpoint — and the guard walks the interior anyway. At
`t = 0` the ground is the card's surface exactly (a reader who never touches
the slider gets byte-identical card behaviour), and at `t = 1` it is
`over(scrim, base, picture)` — precisely the ground the app's own background
text sits on. A faded card can therefore never read worse than the
background's own text at the same veil. The first version's measured table —
10 731 ink failures for the literal slope, 256 for what had shipped, 0 for the
compensation — belongs to that superseded question, and its guarantee went
with it.

**What the reader buys, and where.** The guarantee is stated relative to the
point where the scrim slider starts doing its job — `minReadableScrim`, the
first value on the guard's 0.05 grid where the background's own text clears AA
on the worst-case composite. Measured, theme × palette: 0.55–0.6 under the
theme palette, 0.8–0.9 under the picture's. From that veil upward the whole
card track clears AA for body ink, on both card surfaces, in every theme.
Below it the walk does not go, because there the background's own text is
below AA already and the picture showing through a card is what the reader
asked for when they dragged the veil down. The two accessibility modes still
paint the card opaque: `.contrast-high` and `prefers-reduced-transparency`
force `--surface`, because a faded card is exactly what both of those settings
say they do not want.

**What the old ceiling was actually measuring.** The same instrument
(`maxCardTransparency`) asked where each foreground stops, at the default veil
of 0.55:

| Theme | `--ink` + `--ink-soft` | `--ink` alone |
| --- | --- | --- |
| light | 0.155 | **1.000** |
| dark | 0.240 | **1.000** |
| warm | 0.080 | **1.000** |
| vibrant | 0.175 | **1.000** |

Body ink holds the whole track; the muted foreground is what stopped at 8–24%,
and it still does. The app no longer enforces that stopping point — the slider
is the reader's, the veil is the other slider's, and the guard *reports* where
muted ink stops instead of hiding the end of the track.
`maxCardTransparency` survives as the instrument the guard measures with, not
as app logic.

**The guard.** `tests/card-contrast.test.ts` now guards INDEPENDENCE rather
than compensation: it walks every step of the track from the measured
threshold upward — every theme, both card surfaces, both palettes; the
interior of the track must equal the blend between the two endpoint grounds,
which catches a re-coupled veil that a walk alone could miss; the veil is
pinned to the reader's own number on the whole grid the slider can point at;
and five in-file mutations — the veil following the fade again, the old
slope, the veil dropped, the veil halved, the sliders swapped — are each
asserted to be caught, with every theme covered by at least one of them.

## Fix 2 — `Lágy kitöltés`, the soft fill

One image, three layers, and the stylesheet owns the paint:

| Layer | What it is |
| --- | --- |
| `.app-bg-fill` (`z-index: -2`) | the same picture, `cover`-sized, `blur(40px)`, `opacity: 0.6`, `scale(1.1)` — the recipe, as `SOFT_FILL_*` in `lib/imageBackground` |
| `.app.has-bg::before` (`z-index: -1`) | the whole picture, `contain`, sharp; the reader's blur slider still lands here |
| `.app.has-bg::after` (`z-index: -1`, later in source) | the scrim, tinted or flat |

The fill is a real div rather than a third pseudo-element — CSS has two, and
`filter: blur()` is per-element, so folding both copies into one element would
blur the sharp copy too. The sharp layer drops its 6% magnification in this
mode: that scale exists to hide a blurred edge, and here the edge lands on the
fill, which is the same picture already blurred — while at `contain` it would
crop the very edges the mode promises to show whole.

`soft` is the **default**, because it is the only one of the three answers that
carries both halves of the report. The retired `auto` (intrinsic size, no
fitting) is not a fourth state: it was a sharper `cover`, not an alternative to
it, and a stored one is repaired to the default by the same branch that repairs
any unknown value.

## Fix 3 — the defect the guards found

The verification commit wrote `tests/background-stack.test.ts` — and the second
test in it, aimed at the paint stack, caught something no earlier guard could
see.

**The defect.** `--app-surface`, the token `.card` and `.dialog` paint, was
declared at `:root` as
`color-mix(… var(--app-card-transparency) …)`, while `App.tsx` writes
`--app-card-transparency` on `.app` as an inline style. A custom property
substitutes its `var()`s **where it is declared**, and the substituted value is
what inherits — CSS Variables 1: custom properties "resolve any var() functions
in their values at computed-value time, which occurs before the value is
inherited". So the mix read the `:root` default of 0, baked in *opaque*, and
handed that down to every card. In a conforming browser the slider moved, the
veil compensation raised the scrim, and **no card ever faded**. Worse, the
Settings preview — whose `color-mix()` is declared on the element that uses it —
faded correctly, so the preview was right and the app was wrong: the exact pair
of lies that control exists to prevent.

**Why nothing saw it.** Every existing assertion checked the declaration's
*text*, and the text was correct. What was wrong was the declaration's *place*,
which is a property of the cascade — and the suite renders markup, not layout.

**The fix** is one selector: the mix moved from `:root` to `.app`, the element
that carries the reader's number. The `:root` pair (`--app-surface:
var(--surface)`) stays as the fallback for a browser without `color-mix()`, so
the pre-`@supports` app is unchanged. The long comments at both sites now say
why, and the guard pins the selector rather than trusting them: it reads the
innermost selector out of the stylesheet, asserts `.app`, and contains its own
mutation — the same mix moved back to `:root` must be reported as `:root`. Live,
that mutation fails 2 tests.

**What `tests/background-stack.test.ts` pins** (9 tests):

- the three layers' source order and z-indexes: fill under picture under scrim;
- both picture layers read the one `--app-bg-image`, and only the picture layer
  reads the fit (`--app-bg-size`), with `contain` as the CSS fallback and the
  keyword `soft` never reaching a declaration;
- the blur slider reaches the picture layer; the fill keeps its own fixed blur;
- the `soft` override block is *exactly* `transform: none` — one line, asserted
  as the whole block;
- the preview's DOM order is the app's paint order (fill, picture, scrim,
  card), and the two-layer fits stay two layers;
- `--app-card-transparency` has exactly one writer in `src/` (`App.tsx`), and
  the fade mix is declared on `.app`.

## Fix 4 — the hover that un-faded the card

A reader reported the opposite of what the slider promises: dragging "Kártyák
átlátszósága" to 100% worked everywhere, except the moment the pointer was over
a row. Twelve hover rules painted a background, and nine of them painted
`--surface-2`, `--brand-soft` or `--danger-soft` — theme tokens, read at the
root, with no knowledge of the reader's number.

**The fix.** Four more tokens beside the surface pair, on the same weight and
the same declaration site: `--app-hover-fill`, `--app-accent-hover-fill`,
`--app-danger-hover-fill`. Nine rules now read one of them.

**And the second signal.** At 100% transparency a hover fill has no colour left
to tint with, so the hover would have become invisible — which is worse than the
regression. Every faded hover therefore also carries
`box-shadow: inset 0 0 0 1px var(--app-hover-ring)`, an ink hairline at 22%. An
inset ring cannot escape the element's own rounded corner, and a drop shadow on
a translucent row reads as dirt on the photograph.

**What stayed solid, and why.** `.btn-primary`, `.btn-soft` and `.btn-danger`
hover on purpose: a button whose whole identity is its fill cannot hover to
nothing. The three are named as exceptions in the guard so the exception list
cannot quietly grow.

## Fix 5 — the small menus the fade could not reach

The same reader, the same pass: the transparency was "roughly right", except
that inside some small menus something was still not transparent. The fade was
written for **two** selectors — `.card` and `.dialog` — and everything else in
the app painted a theme token directly, so no position of the slider could
reach it. The surfaces that read as a menu sitting on a card were the
segmented control (both halves), the pill clouds, the mood buttons, the
Settings radio pair, the three pickers, and about twenty panels, rows and notes.

**The rule.** A surface fades if it is a **container**; a surface stays solid
if it is a **control** whose fill is the affordance or whose contrast is the
reader's own safety net. Thirty selectors now read one of four tokens, all on
the same `calc((1 - var(--app-card-transparency)) * 100%)` weight and all
declared on `.app`, where the reader's number is written.

**What stayed solid, and why.** Three kinds, named one by one with their exact
declarations so "on purpose" is the only kind of exception that survives a later
batch: a fill whose colour *is* the meaning (`.cal-day`, the Year-in-Pixels
tiles, the theme swatches — a colour grid with no fills is not a quieter grid); a
filled selection carrying `--on-brand` text (`.pill-selected` — white on a
transparent brand is white on a photograph, the same call Fix 4 made for
`.btn-primary`); and the thin bars and chips whose own tint is the point.

**And the two accessibility modes re-pin all four tokens.** Restoring the card
while leaving the tile faded would have produced the one state neither mode is
about — an opaque card with a hole in it — and before this fix only the card
had been considered at all.

## Fix 6 — the ink that never changed colour

The reader's main report: the text is always the same colour, whatever is
behind it. It was. `--ink` is a theme token chosen for a flat surface, so a
bright photograph behind a dark theme put cream text on a bright photograph and
the reading order of a card became a matter of luck.

**The measurement.** The picture is drawn once into an offscreen 32×32 canvas
and read with `getImageData`; the RGBA buffer is averaged into a single
**relative luminance** using the WCAG definition (sRGB linearised per channel,
weighted 0.2126 / 0.7152 / 0.0722). Alpha is ignored on purpose: the photograph
is composited onto the veil, and what matters is its colour, not how opaque the
decoder said it was. Decoding is the expensive half, so the measurement is
re-used when only a slider moves and redone when the picture changes.

**The ground.** The card is translucent, so the text does not stand on the
picture — it stands on a *composite* that is a function of two sliders. That
composite is computed by `groundWithPicture`, the same function
`cardGroundRgb` already used for the card's own legibility guarantee, so the ink
cannot be decided against a different arithmetic than the one on screen.

**The choice.** Candidates are offered best-first: the picture's own polarity
first, then the palette's two ends, so a theme can keep its ink. The winner is
the **first candidate that clears AA across the whole track** — every veil and
every card fade the reader can reach with those controls — not the one that
reads best on the average photograph. If none clears AA, the best worst-case is
used and `meetsAA` says so.

**One ground, not two.** The obvious hardening is to also require the ink to
survive a worst-case picture of luminance 0 and 1, the way the card guarantee
walks an adversarial picture. It was tried, and it costs the reader: on the
tested band the measured ground lands at 4.33:1 — below AA — once the hostile
picture is folded in alongside it, because the two candidates disagree and the
worse one wins the argument. One honest ground beats two, one of which is
fiction. The extremes survive as a real assertion instead: at 0% transparency,
where the card is opaque, the theme's own ink wins, because there is nothing
behind it.

**What a reader without a picture gets.** Nothing. No picture, no measured
ground, and the hook returns `null`, so `App.tsx` writes no inline style at all
and `--ink` stays exactly what the theme set.

**The mutation proof, and the two that got away.** Seven mutations were written
against the ink — drop the 0.2126/0.7152/0.0722 weighting and keep one channel;
invert the polarity; take the best ground instead of the worst in
`worstContrast`; return the first candidate without checking AA; truncate the ink
instead of rounding it; replace `averageRelativeLuminance(data)` in the hook with
a constant; replace the composed ground with the bare card colour.

Five died immediately. **Two survived the whole suite, and both were real
holes rather than academic ones:**

- *Truncating the ink.* Every value in the rounding test was an integer, and an
  integer rounds and truncates to itself — so a test named "rounded not
  truncated" could not tell the two apart. The fix is two fractional channels,
  which is all the difference needed to separate `#123458` from `#113457`.
- *Faking the measurement in the hook.* Every guard on the hook was a pin on
  the source text, and the pins were on the CANVAS — `LUMINANCE_SAMPLE`, the
  `getImageData` call, the `drawImage` call — so a hook that sampled the picture
  and then ignored the result was still perfectly green. The fix is a canvas
  double: a `getContext` that hands back pixels the test chooses, an `Image`
  whose `src` fires `onload`, and assertions that the luminance those pixels
  produce is the luminance that comes back. Six lines of stand-in, no jsdom, no
  dependency — and it is a measurement now, which is the thing the hook always
  was.

Both fixes are in `tests/lib/dynamic-ink.test.ts`; all seven mutations are
caught by that file alone, not by a neighbouring guard noticing that a line
number moved.

## What this record does not claim

- **No browser-engine measurement in CI.** The suite has no jsdom and no
  layout engine by design — `renderToStaticMarkup` proves wiring, not pixels.
  The Fix-3 rule is encoded from the CSS specification, not observed in a
  browser here; the browser check is manual. The one exception is the ink's
  sampling, which runs against a canvas double: that proves the arithmetic on
  given pixels, not that a real browser decodes a real photograph the same way.
- **The contrast numbers are worst-case composites**, over an adversarial
  picture and the most hostile tint, not a promise about every photograph.
- **Muted ink still stops early** on a hostile backdrop. That is a measurement,
  not a limit the control enforces: the reader's track is the whole 0–100%.
- **The dynamic ink is a whole-screen decision, not a per-card one.** It is
  computed for the picture, the veil and the fade, because those three are the
  only inputs the browser has. A card sitting on an unusually bright corner of a
  photograph is not separately re-decided, and the AA claim is measured over the
  composite, not over the picture.
- **The luminance is an average.** A photograph that is half white and half
  black measures mid-grey, and the ink is chosen for mid-grey. That is the
  honest summary of the picture, and it is the same trade the tint has always
  made; a per-pixel or per-region decision would need a different data
  structure and a different guarantee.

