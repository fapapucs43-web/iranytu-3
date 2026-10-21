/**
 * The background-image picker, rendered.
 *
 * No jsdom, so these are assertions on MARKUP. What is worth pinning is the
 * WIRING rather than the styling:
 *
 *  - the empty state offers the picker and nothing else, so a reader cannot be
 *    shown a scrim slider for a background that does not exist;
 *  - the preview is composed from the SAME CSS custom property the app uses, so
 *    "what I saw in Settings" and "what the app looks like" cannot diverge;
 *  - the real `<input type="file">` is present, with `accept="image/*"`, under
 *    the styled label — the thing that keeps the browser's own picker and the
 *    keyboard route.
 *
 * The storage and maths are covered in `tests/lib/image-background.test.ts`
 * against the real attachments store.
 */
import { describe, expect, test, beforeEach } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import BackgroundImagePicker from "../../src/components/BackgroundImagePicker";
import { AppProvider } from "../../src/state/AppContext";
import { ThemeProvider } from "../../src/state/ThemeContext";
import {
  SOFT_FILL_BLUR_PX,
  SOFT_FILL_OPACITY,
  SOFT_FILL_SCALE,
  pickBackgroundImage,
  type BackgroundFit,
} from "../../src/lib/imageBackground";

const backing: Record<string, string> = {};
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => (k in backing ? backing[k] : null),
  setItem: (k: string, v: string) => {
    backing[k] = v;
  },
  removeItem: (k: string) => {
    delete backing[k];
  },
};

beforeEach(() => {
  for (const k of Object.keys(backing)) delete backing[k];
});

const render = (props: {
  imageId?: string;
  scrim?: number;
  blur?: number;
  palette?: "image" | "theme";
  fit?: BackgroundFit;
  cardTransparency?: number;
  tint?: string;
  highContrast?: boolean;
  inkMeetsAA?: boolean;
  inkVeil?: number;
  onImageChange?: (id: string | undefined) => void;
  onScrimChange?: (alpha: number) => void;
}) =>
  renderToStaticMarkup(
    // The REAL providers, because the control now asks the theme which way round
    // the scrim goes — `useTheme`, not a prop — and a test that stubbed that
    // answer would be testing a different component from the one Settings
    // renders. `AppProvider` comes first because `ThemeProvider` reads the
    // settings out of it.
    createElement(
      AppProvider,
      null,
      createElement(
        ThemeProvider,
        null,
        createElement(BackgroundImagePicker, {
          imageId: props.imageId,
          scrim: props.scrim,
          blur: props.blur,
          palette: props.palette,
          fit: props.fit,
          cardTransparency: props.cardTransparency,
          tint: props.tint,
          highContrast: props.highContrast,
          inkMeetsAA: props.inkMeetsAA,
          inkVeil: props.inkVeil,
          onImageChange: props.onImageChange ?? (() => {}),
          onScrimChange: props.onScrimChange ?? (() => {}),
          onBlurChange: () => {},
          onPaletteChange: () => {},
          onFitChange: () => {},
          onCardTransparencyChange: () => {},
          onTintChange: () => {},
        }),
      ),
    ),
  );

/** A real stored image, so the preview goes through the real loader. */
const storedImage = async () =>
  pickBackgroundImage(new File(["bytes"], "wall.png", { type: "image/png" }));

describe("BackgroundImagePicker — no image", () => {
  test("offers the picker and nothing else", () => {
    const html = render({});
    expect(html).toContain("Kép kiválasztása");
    // No slider and no remove button for a background that does not exist.
    expect(html).not.toContain('type="range"');
    expect(html).not.toContain("Kép eltávolítása");
    expect(html).not.toContain("Háttérletakarás");
    // And no palette choice either: with no picture there is nothing for it to
    // change, and an inert control reads as a broken one.
    expect(html).not.toContain("A képből");
  });

  test("says plainly that the image stays on the device", () => {
    // The app's whole promise is "offline, adatvédett". A picture is the most
    // personal thing anyone would put in here, so the promise is stated here
    // rather than assumed from the settings screen.
    const html = render({});
    expect(html).toContain("csak ezen az eszközön marad");
  });

  test("the file input is a real one, with the image filter", () => {
    const html = render({});
    expect(html).toContain('type="file"');
    expect(html).toContain('accept="image/*"');
  });
});

describe("BackgroundImagePicker — with an image", () => {
  test("shows a preview, a scrim slider and a way out", async () => {
    const html = render({ imageId: await storedImage(), scrim: 0.6 });
    expect(html).toContain("bg-pick-preview");
    expect(html).toContain('type="range"');
    expect(html).toContain("Háttérletakarás");
    expect(html).toContain("Kép eltávolítása");
    expect(html).toContain("Kép cseréje");
  });

  test("the slider carries the stored opacity", async () => {
    const html = render({ imageId: await storedImage(), scrim: 0.75 });
    expect(html).toContain('value="0.75"');
    expect(html).toContain("75%");
  });

  test("an unset scrim falls back to the default rather than rendering nothing", async () => {
    // The component can be handed a partial Settings; the slider must still show
    // the value the app will actually use.
    const html = render({ imageId: await storedImage(), scrim: undefined });
    expect(html).toContain("55%");
  });

  test("the slider is labelled and announces a percentage", async () => {
    // A raw "0.6" is not what a screen reader should read for a visual control,
    // and a range input with no label is announced as a bare slider.
    const html = render({ imageId: await storedImage(), scrim: 0.6 });
    expect(html).toContain('for="bg-scrim"');
    expect(html).toContain('id="bg-scrim"');
    expect(html).toContain('aria-valuetext="60 százalék"');
  });

  test("the blur slider opens at 3 px, not at zero and not at 6", async () => {
    // The default is the feature. A backdrop at zero blur is a photograph
    // competing with the interface, so the slider opens where the picture is
    // already usable and the reader can drag it to sharp if that is what they
    // wanted.
    //
    // 0.125 of the 24 px scale is 3.0 px, and the slider prints the proportion
    // rather than the pixels — which rounds 12.5% to 13. That is the same
    // rounding every other proportion slider in this app does, and the two
    // numbers are the same number: 13% of 24 px is 3.0 px.
    const html = render({ imageId: await storedImage(), scrim: 0.6 });
    expect(html).toContain('for="bg-blur"');
    expect(html).toContain('id="bg-blur"');
    expect(html).toContain('aria-valuetext="13 százalék"');
    // And the preview is blurred by the same amount the app root will use —
    // an eighth of the 24 px scale, which is 3.0px.
    expect(html).toContain("blur(3.0px)");
  });

  test("the blur slider carries a stored value rather than falling back", async () => {
    const html = render({ imageId: await storedImage(), scrim: 0.6, blur: 0.5 });
    expect(html).toContain('aria-valuetext="50 százalék"');
    expect(html).toContain("blur(12.0px)");
  });

  test("both palettes are offered, with the picture's one marked as current", async () => {
    // The choice exists because a custom theme and a background image both want
    // to be the palette. Both are rendered as real buttons rather than as a
    // description, because the reader is being given a decision, not told one.
    const html = render({ imageId: await storedImage(), scrim: 0.6 });
    expect(html).toContain("A képből");
    expect(html).toContain("Saját témám");
    // The default is the picture's, so THAT is the pressed one — asserted on the
    // button's own markup rather than by comparing string offsets, which would
    // only be testing the order of attributes inside a tag.
    expect(html).toMatch(/class="segment segment-active" aria-pressed="true">A képből/);
    expect(html).toMatch(/class="segment " aria-pressed="false">Saját témám/);
  });

  test("choosing the theme's palette makes the preview flat, not tinted", async () => {
    // The tint is written into the markup as a literal triple, so "theme"
    // selected has to mean the CSS property instead — the same property the
    // pre-tint implementation read, and the one `applyThemeTokens` owns.
    //
    // The numbers are a LIGHT theme under a dark red tint: 255 + (200-255)/3 is
    // 237, and the same arithmetic on the other two channels gives 183. A light
    // scrim keeps dark ink, which is the guarantee the tint is not allowed to
    // break — `tests/lib/image-background.test.ts` pins that with hostile tints.
    const image = await storedImage();
    const tinted = render({ imageId: image, scrim: 0.5, tint: "200, 40, 40" });
    const flat = render({ imageId: image, scrim: 0.5, palette: "theme", tint: "200, 40, 40" });
    expect(tinted).toContain("237, 183, 183");
    expect(flat).toContain("var(--app-bg-scrim-rgb");
    expect(flat).not.toContain("237, 183, 183");
  });

  test("high contrast wins over the tint, and the preview says so", async () => {
    // The reader who turned on high contrast said legibility outranks
    // decoration. The app paints an opaque FLAT scrim for them, so a preview
    // still showing a translucent tinted one would be the exact lie this control
    // exists to avoid.
    const image = await storedImage();
    const html = render({
      imageId: image,
      scrim: 0.3,
      tint: "200, 40, 40",
      highContrast: true,
    });
    expect(html).toContain("var(--app-bg-scrim-rgb, 0, 0, 0), 1)");
    expect(html).not.toContain("237, 183, 183");
    expect(html).toContain("Nagy kontraszt bekapcsolva");
  });
});

describe("BackgroundImagePicker — the preview cannot lie", () => {
  test("composes the scrim from the same CSS property the app reads", async () => {
    // THE test that matters for this control. The preview is built from
    // `var(--app-bg-scrim-rgb)`, which `applyThemeTokens` writes from the active
    // theme. If the preview instead computed "is this theme light" itself, the
    // two would be two implementations that agree until the day they do not —
    // and the disagreement would be a light scrim under a dark theme, visible
    // only to the reader who picked the picture.
    const html = render({ imageId: await storedImage(), scrim: 0.5 });
    expect(html).toContain("bg-pick-preview-image");
    expect(html).toContain("bg-pick-preview-scrim");
    expect(html).toContain("var(--app-bg-scrim-rgb");
    expect(html).toContain("url(&quot;data:image/");
  });

  test("uses no gradient anywhere — this stylesheet's identity forbids them", async () => {
    // The first version tinted the preview with a `linear-gradient`, which is the
    // obvious recipe and the one the app's own identity forbids: the stylesheet
    // has no gradients and `tests/batch11-polish.test.ts` pins the count so the
    // next commit cannot quietly introduce one. The preview and the app root both
    // use two elements for that reason, and this is the test that says so.
    //
    // The slice is BOUNDED to the two blocks this feature owns. An unbounded
    // `slice(indexOf(".app.has-bg"))` runs to the end of the file, where the
    // pre-existing `.progress-fill` and `.streak-banner` rules live — which is
    // not this test's business, and would have made it fail for a rule nobody
    // wrote. Bounding to `.app-main`, the very next selector, keeps the assertion
    // about this feature's own paint.
    const css = require("node:fs").readFileSync("src/styles.css", "utf8");
    const start = css.indexOf(".app.has-bg");
    expect(start).toBeGreaterThan(-1);
    const block = css.slice(start, css.indexOf(".app-main", start));
    expect(block).toContain("::before");
    expect(block).toContain("::after");
    expect(block).not.toMatch(/linear-gradient|radial-gradient|conic-gradient/);

    // And the picker's own rules, for the same reason: two divs, not one tinted
    // div. Read as its own slice because it lives at the end of the file, where
    // there is no following selector to bound it by.
    const picker = css.slice(css.indexOf(".bg-picker"));
    expect(picker).toContain(".bg-pick-preview-image");
    expect(picker).toContain(".bg-pick-preview-scrim");
    expect(picker).not.toMatch(/linear-gradient|radial-gradient|conic-gradient/);

    // Last, the thing the two halves of the feature share: the component's own
    // markup composes no CSS-image paint either, so a future inline-style tint
    // cannot reintroduce the thing the stylesheet is forbidden to write.
    const html = render({ imageId: await storedImage(), scrim: 0.5 });
    expect(html).not.toMatch(/linear-gradient|radial-gradient|conic-gradient/);
  });

  test("the stylesheet defines every class the component renders", () => {
    // A class renamed in one place and not the other is invisible until the
    // screen looks plain. Same guard shape as the theme-class check in
    // full-system.test.ts.
    const css = require("node:fs").readFileSync("src/styles.css", "utf8");
    for (const cls of [
      ".bg-picker",
      ".bg-pick-button",
      ".bg-pick-input",
      ".bg-pick-error",
      ".bg-pick-preview",
      ".bg-pick-preview-image",
      ".bg-pick-preview-fill",
      ".bg-pick-preview-scrim",
      ".bg-pick-row",
      ".bg-pick-scrim-label",
      ".bg-pick-scrim-value",
      ".bg-pick-ink-warning",
      ".bg-pick-palette",
      ".bg-pick-palette-label",
      ".bg-pick-hint",
      ".app.has-bg",
    ]) {
      expect(css, `${cls} is rendered but not defined`).toContain(cls);
    }
  });

  test("the hidden file input is not display:none, which would kill the label", () => {
    // `display: none` removes the input from the tab order, and the label stops
    // being operable at all — the classic way a styled file button ends up
    // keyboard-dead. The clip-based hiding keeps it focusable.
    const css = require("node:fs").readFileSync("src/styles.css", "utf8");
    const block = css.slice(css.indexOf(".bg-pick-input {"));
    const rule = block.slice(0, block.indexOf("}"));
    expect(rule).not.toContain("display: none");
    expect(rule).toContain("clip");
  });
});

describe("BackgroundImagePicker — an id whose bytes are gone", () => {
  test("shows the empty state instead of a broken image", () => {
    // What a quota eviction or an outside deletion leaves behind. The reader sees
    // "choose a picture" again, which is true, rather than a torn background.
    const html = render({ imageId: "deleted-long-ago", scrim: 0.5 });
    expect(html).toContain("Kép kiválasztása");
    expect(html).not.toContain("bg-pick-preview");
  });
});

/**
 * The fit control's own slice of the markup.
 *
 * Scoped rather than searched whole, because `Segmented` renders the same
 * `segment-active` shape for the PALETTE choice two controls below — a
 * whole-document regex for "which fit is current" finds both and reports that
 * two things are selected, which is a true statement about the markup and a
 * useless one about the control.
 */
const fitBlock = (html: string): string => {
  const start = html.indexOf("Kép mérete");
  const end = html.indexOf("A takarás színe");
  expect(start, "the fit choice is not rendered").toBeGreaterThan(-1);
  expect(end, "the palette choice is not rendered").toBeGreaterThan(start);
  return html.slice(start, end);
};

/** The label of whichever fit option `Segmented` says is pressed. */
const currentFit = (html: string): string | undefined =>
  /aria-pressed="true">([^<]*)</.exec(fitBlock(html))?.[1];

describe("BackgroundImagePicker — the fit, which is why the picture looked soft", () => {
  test("offers all three ways, and shows the stored one as current", async () => {
    // `cover` scales a picture until it fills the viewport and is what made a
    // sharp photograph look soft, so the control has to exist; `contain` shows
    // the whole picture and leaves bands; `soft` is the default that answers
    // both. The retired `auto` is not offered any more — a stored one is read
    // as the default rather than shown as a fourth option.
    const id = await storedImage();
    const html = render({ imageId: id, fit: "contain" });
    expect(html).toContain("Kép mérete");
    for (const label of ["Kitöltés", "Teljes kép", "Lágy kitöltés"]) {
      expect(html, `${label} is not offered`).toContain(label);
    }
    expect(html, "a withdrawn option is still offered").not.toContain("Illesztés");
    // `Segmented` speaks with `aria-pressed`, so the current option is the one
    // the assistive technology is told about rather than the one that happens
    // to carry a class.
    expect(currentFit(html)).toBe("Teljes kép");
  });

  test("an unset fit renders the DEFAULT, not an unselected control", async () => {
    // Every stored install predates this control, so `undefined` is the common
    // case rather than an edge one — and a segmented control with nothing
    // selected is a control that looks broken. The default is the soft fill.
    const id = await storedImage();
    expect(currentFit(render({ imageId: id }))).toBe("Lágy kitöltés");
  });

  test("a stored `cover` or `soft` is what is marked current, not the default", async () => {
    // The other direction: a reader who chose something keeps it. If the
    // component always rendered the default as current, the control would look
    // right and write the wrong value.
    const id = await storedImage();
    expect(currentFit(render({ imageId: id, fit: "cover" }))).toBe("Kitöltés");
    expect(currentFit(render({ imageId: id, fit: "soft" }))).toBe("Lágy kitöltés");
  });

  test("each choice explains itself, and the line changes with the selection", async () => {
    // A reader who has not opened the stylesheet needs to know that "cover"
    // enlarges and "contain" leaves bands — that difference is the whole reason
    // the control exists, and a bare set of three buttons does not convey it.
    const id = await storedImage();
    const hint = (fit: BackgroundFit) =>
      /bg-pick-hint">([^<]*)/.exec(fitBlock(render({ imageId: id, fit })))?.[1]?.trim() ?? "";
    const hints = (["cover", "contain", "soft"] as const).map(hint);
    expect(new Set(hints).size, "two choices describe themselves the same way").toBe(3);
    for (const h of hints) expect(h.length, "a choice has no explanation").toBeGreaterThan(0);
  });

  test("the preview paints the stored fit, so the picture on screen is the app", async () => {
    const id = await storedImage();
    expect(render({ imageId: id, fit: "cover" })).toContain("background-size:cover");
    expect(render({ imageId: id, fit: "contain" })).toContain("background-size:contain");
    // `soft` is `contain` PLUS the fill layer, and the fill repeats the same
    // recipe the stylesheet paints — the exported constants, not a second set of
    // numbers. `contain` alone must stay the two-layer preview it always was.
    const soft = render({ imageId: id, fit: "soft" });
    expect(soft).toContain("bg-pick-preview-fill");
    expect(soft).toContain("background-size:contain");
    expect(soft).toContain(`blur(${SOFT_FILL_BLUR_PX}px)`);
    expect(soft).toContain(`opacity:${SOFT_FILL_OPACITY}`);
    expect(soft).toContain(`scale(${SOFT_FILL_SCALE})`);
    expect(soft, "the sharp copy is still magnified").toContain("transform:none");
    expect(render({ imageId: id, fit: "contain" }), "contain grew a fill layer").not.toContain(
      "bg-pick-preview-fill",
    );
  });
});

/** The fade slider's own attributes, by name. */
const fadeSlider = (html: string): Record<string, string> =>
  Object.fromEntries(
    [...(/<input id="bg-card-alpha"[^>]*>/.exec(html)?.[0].matchAll(/([a-z-]+)="([^"]*)"/g) ?? [])]
      .filter((m) => m[1] !== "class" && m[1] !== "type" && m[1] !== "step")
      .map((m) => [m[1]!, m[2]!]),
  );

describe("BackgroundImagePicker — the card fade only exists when there is a picture", () => {
  test("no picture, no fade slider", () => {
    // The control fades a card so a picture shows through it. With no picture
    // there is nothing to show, so the control would be an inert dial that still
    // writes a setting — the thing the palette choice already avoids by
    // rendering only once an image is set.
    const html = render({ cardTransparency: 0.5 });
    expect(html).not.toContain("Kártyák átlátszósága");
    expect(html).not.toContain('id="bg-card-alpha"');
  });

  test("a picture brings it, and the track is the whole 0–100%", async () => {
    const id = await storedImage();
    const html = render({ imageId: id });
    expect(html).toContain("Kártyák átlátszósága");
    const slider = fadeSlider(html);
    // An unset value is every stored install today: zero fading, not "whatever
    // the browser puts on an empty range input".
    expect(slider.value).toBe("0");
    expect(slider["aria-valuetext"]).toBe("0 százalék");
    // The FULL range, not a measured prefix of it. The control used to end at a
    // ceiling of 8–21% because the composite dipped through a mid-tone, and the
    // first fix coupled the veil to this slider to carry the text — which made
    // the two sliders one surface, exactly what the report complained about.
    // Now the veil belongs to the scrim slider alone and this track has no
    // hidden end: the reader's own number is the one the app paints.
    expect(slider.min).toBe("0");
    expect(slider.max).toBe("1");
  });

  test("a stored value is what is painted — the control does not pull it down", async () => {
    // What the reader set is what is on screen: the value is clamped to the
    // range and to nothing else. A control that quietly capped a stored 90% for
    // any reason would be a control whose displayed value disagrees with the
    // setting behind it.
    const id = await storedImage();
    const slider = fadeSlider(render({ imageId: id, cardTransparency: 0.9 }));
    expect(slider.value).toBe("0.9");
    expect(slider["aria-valuetext"]).toBe("90 százalék");
  });

  test("the scrim does not shorten the track", async () => {
    // The old control's LENGTH was a function of the scrim, because the two
    // described one surface and a weaker veil lowered what the cards could
    // carry. The compensation moved that coupling into the alpha, so the track
    // is the same length whatever the veil is — and this is the assertion that
    // would catch the coupling creeping back into the `max`.
    const id = await storedImage();
    for (const scrim of [0, 0.55, 1]) {
      expect(fadeSlider(render({ imageId: id, scrim })).max, `scrim ${scrim}`).toBe("1");
    }
  });
});
/**
 * THE AA NOTICE — the one place `meetsAA` is shown rather than only computed.
 *
 * The hook has always calculated whether the chosen ink clears WCAG AA on the
 * ground the reader is looking at, and until this batch nothing read it. The
 * notice is the report: on the background card, under the two sliders that can
 * change the answer, and only when the answer is `false`.
 *
 * `false` and not "falsy" is the whole shape of the contract: `undefined`
 * means there is no decision to report — no picture, or a canvas the browser
 * could not hand over — and a missing answer must never be dressed up as a
 * warning.
 */
describe("BackgroundImagePicker — the AA notice", () => {
  const NOTICE = "nem érik el a WCAG AA kontrasztot";

  test("appears when the ink decision says the settings do not reach AA", async () => {
    const html = render({ imageId: await storedImage(), inkMeetsAA: false });
    expect(html).toContain("bg-pick-ink-warning");
    expect(html).toContain(NOTICE);
    // Both halves of the remedy, in the reader's own words: the veil slider is
    // directly above this line and the fade slider directly below it.
    expect(html).toContain("Növeld a fátylat vagy csökkentsd a kártyaátlátszóságot.");
    // A polite live region, because the line appears without focus moving —
    // the same announcement shape the PIN lockout uses.
    expect(html).toMatch(/<p class="bg-pick-ink-warning" role="status">/);
  });

  test("is absent when AA is met, and absent when there is no decision to report", async () => {
    const id = await storedImage();
    expect(render({ imageId: id, inkMeetsAA: true })).not.toContain(NOTICE);
    // `undefined` is the common case on the no-picture settings screen and on
    // a browser without a canvas; both must stay silent rather than warn.
    expect(render({ imageId: id })).not.toContain(NOTICE);
    expect(render({ imageId: id, inkMeetsAA: undefined })).not.toContain(NOTICE);
  });

  test("the report travels from the app's own decision — measured once, shown here", async () => {
    // The wiring a markup test cannot see: the flag is the ROOT's dynamic-ink
    // answer (`dynamicInk?.meetsAA`, `undefined` when there is no picture),
    // forwarded through SettingsView rather than re-measured — a second
    // `useDynamicInk` would be a second canvas decode and a second chance to
    // disagree with the ink the app actually paints. And the guard is exactly
    // `=== false`, so `undefined` cannot light it.
    const app = require("node:fs").readFileSync("src/App.tsx", "utf8");
    expect(app).toContain("inkMeetsAA={dynamicInk?.meetsAA}");
    const settings = require("node:fs").readFileSync("src/views/SettingsView.tsx", "utf8");
    expect(settings).toContain("inkMeetsAA={inkMeetsAA}");
    const picker = require("node:fs").readFileSync("src/components/BackgroundImagePicker.tsx", "utf8");
    expect(picker).toContain("inkMeetsAA === false");
    // And the words are the catalogue's, in every locale the app ships — a
    // raw string in the component would pass every render test above and
    // still break the language switch.
    const i18n = require("node:fs").readFileSync("src/lib/i18n.ts", "utf8");
    expect(i18n).toContain('"settings.bg.inkWarning"');
  });
});

/**
 * THE VEIL THE READER DID NOT CHOOSE, shown where they can see it.
 *
 * The floor exists so the text stays readable over a picture that fights the
 * theme, and it can land well above the slider's own position. The reader cannot
 * act on that by looking at the sliders — both already say what they said — so
 * the app says it.
 */
describe("BackgroundImagePicker — the veil the floor raised", () => {
  const LIFTED = "A háttérkép miatt a fátylat";

  test("appears when the decision needed a stronger veil than the sliders compose", async () => {
    const html = render({
      imageId: await storedImage(),
      scrim: 0.25,
      cardTransparency: 0,
      inkVeil: 0.7,
    });
    expect(html).toContain("bg-pick-ink-lifted");
    expect(html).toContain(LIFTED);
    // The number is the veil the app PAINTS, in the slider's own units: the
    // control immediately above this line reads out 25% while the app paints
    // 70%, and a notice in fractions would make the reader convert.
    expect(html).toContain("70%-ra emeltük");
    expect(html).toMatch(/<p class="bg-pick-ink-lifted" role="status">/);

    // WITH `meetsAA` TRUE — the case this line exists for, pinned as itself
    // rather than left to be inferred. The floor did its job, so the AA warning
    // is silent BY DESIGN, and the reader would otherwise be looking at a 70%
    // veil they never asked for with nothing on the card to explain it. The two
    // conditions are independent: the notice reads the veil, not the ink.
    const met = render({
      imageId: await storedImage(),
      scrim: 0.25,
      cardTransparency: 0,
      inkVeil: 0.7,
      inkMeetsAA: true,
    });
    expect(met).toContain(LIFTED);
    expect(met).not.toContain("bg-pick-ink-warning");

    // And the two CAN stand together when the ink genuinely cannot be rescued
    // on both grounds — a strengthened veil plus the honest report, rather than
    // one silencing the other.
    const both = render({
      imageId: await storedImage(),
      scrim: 0.25,
      cardTransparency: 0,
      inkVeil: 0.7,
      inkMeetsAA: false,
    });
    expect(both).toContain(LIFTED);
    expect(both).toContain("bg-pick-ink-warning");
  });

  test("is silent when the painted veil is the reader's own number", async () => {
    const id = await storedImage();
    // Equal: a floor that lands exactly on the slider asks for nothing the
    // reader did not ask for. Below: the slider is already stronger.
    expect(render({ imageId: id, scrim: 0.25, cardTransparency: 0, inkVeil: 0.25 })).not.toContain(LIFTED);
    expect(render({ imageId: id, scrim: 0.6, cardTransparency: 0, inkVeil: 0.25 })).not.toContain(LIFTED);
    // The card's own floor counts as the reader's composition: at a 50% card
    // the veil is already 0.25 before any picture is considered.
    expect(render({ imageId: id, scrim: 0, cardTransparency: 0.5, inkVeil: 0.25 })).not.toContain(LIFTED);
    // No picture, no canvas, no decision — nothing to announce.
    expect(render({ imageId: id, scrim: 0.25, cardTransparency: 0 })).not.toContain(LIFTED);
    expect(render({ imageId: id, scrim: 0.25, cardTransparency: 0, inkVeil: undefined })).not.toContain(LIFTED);
    // High contrast pins the veil opaque whatever the decision asked for, so a
    // stronger number is not a change the reader could see.
    expect(
      render({ imageId: id, scrim: 0.25, cardTransparency: 0, highContrast: true, inkVeil: 0.7 }),
    ).not.toContain(LIFTED);
  });
});
