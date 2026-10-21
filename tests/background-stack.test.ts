/**
 * The background layer's PAINT STACK, and the card fade's one writer.
 *
 * WHY A DEDICATED FILE. The three neighbouring guards each own a piece and
 * none of them owns the seam between the pieces:
 *
 *  - `tests/lib/image-background.test.ts` measures the maths and the stored
 *    values, which do not know what paints them;
 *  - `tests/components/BackgroundImagePicker.test.tsx` reads the rendered
 *    markup, which does not know what the stylesheet does with the class it
 *    finds there;
 *  - `tests/card-contrast.test.ts` composites the colours and reads the
 *    declarations' TEXT, which says what a rule contains and never WHERE the
 *    rule sits in the cascade.
 *
 * The seam is where the two fixes in this series actually meet the browser:
 * which layer paints over which, which slider reaches which layer, and — the
 * one this file was written and then found a real defect with — which element a
 * custom property's `var()` references are resolved on.
 *
 * THE DEFECT THIS FILE CAUGHT, recorded because the failure mode is worth
 * knowing. `--app-surface` was declared at `:root` as
 * `color-mix(… var(--app-card-transparency) …)`, and `App.tsx` writes
 * `--app-card-transparency` on `.app` as an inline style. A custom property
 * substitutes its `var()`s at computed-value time ON THE ELEMENT IT IS DECLARED
 * ON, and the substituted value is what inherits (CSS Variables 1, §2.3). So
 * the mix read the `:root` default of 0, baked in "opaque", and handed that
 * down to every card: the slider moved, the scrim compensation raised the veil,
 * and no card ever faded. The Settings preview, whose mix is declared on the
 * element that uses it, faded correctly — the preview was right and the app was
 * wrong, which is the pair of lies this file exists to rule out. No test above
 * could see it: every one of them asserted the rule's text, and the text was
 * textually correct. The fix is one selector, and the guard below pins it.
 *
 * WHAT IS ASSERTED HERE IS THE SHAPE, NOT THE COLOURS. The colours are
 * `card-contrast.test.ts`'s business and the numbers are `image-background`'s.
 * This file asks only: do the layers stack in the order the maths assumes, does
 * each control reach the layer it is supposed to, and is the reader's number
 * read on the element that carries it.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import BackgroundImagePicker from "../src/components/BackgroundImagePicker";
import { AppProvider } from "../src/state/AppContext";
import { ThemeProvider } from "../src/state/ThemeContext";
import {
  SOFT_FILL_BLUR_PX,
  fitCss,
  pickBackgroundImage,
} from "../src/lib/imageBackground";

const styles = readFileSync("src/styles.css", "utf8");
const appSource = readFileSync("src/App.tsx", "utf8");

/*
 * THE PAGE BACKDROP, which is a third thing besides the theme and the picture.
 *
 * Five presets ship a CSS picture of colour as their page background. It is
 * neither a token (`--bg` stays the palette's flat ground) nor a photograph
 * (this stack never sees it), so the seam worth pinning is where each of the
 * three is allowed to show:
 *
 *  - `body` reads `--app-page` — the picture where the preset has one, the flat
 *    ground otherwise — which is what puts it on the page WITHOUT entering this
 *    stack: no new layer, no new z-index, no change to the order above;
 *  - under `.has-bg` the app root paints `--app-page-flat`, so the picture the
 *    ink decision was measured against stays flat even when the reader's
 *    photograph leaves the bands of a `contain` empty;
 *  - and `--app-page-flat` is declared at `:root` precisely so the contrast-high
 *    `--bg` override inside `.app` cannot turn that ground white.
 *
 * A custom property substitutes its `var()`s where it is DECLARED (the same
 * rule the `--app-surface` defect above was caught by), so the root declaration
 * is load-bearing rather than tidy: declared one level down it would resolve to
 * contrast-high's white and quietly repaint a reader's picture bands.
 */
describe("the page backdrop and the picture's ground are two things", () => {
  test("body reads the preset's backdrop, with the flat colour as first frame", () => {
    expect(styles).toContain("background: var(--app-page, var(--bg));");
    // Several `body {` blocks exist (theme-token overrides above), so the
    // assertion is on the one that PAINTS — exactly one may, and it carries the
    // first-frame fallback: before `applyThemeTokens` runs, the page must be
    // what it was before this property existed.
    const painting = [...styles.matchAll(/\nbody \{[^}]*\}/g)]
      .map((m) => m[0])
      .filter((block) => block.includes("background:"));
    expect(painting, "exactly one body rule may paint a background").toHaveLength(1);
    expect(painting[0]).toContain("var(--app-page, var(--bg))");
  });

  test("the flat ground is declared at :root, above any override that could reach it", () => {
    const at = styles.indexOf("--app-page-flat: var(--bg);");
    expect(at, "--app-page-flat is not declared").toBeGreaterThan(-1);
    expect(enclosingSelector("--app-page-flat: var(--bg);")).toBe(":root");
  });

  test("under a picture the root paints that flat ground, not the preset's picture", () => {
    const block = /\.app\.has-bg \{\n  position: relative;[\s\S]*?\}/.exec(styles)?.[0] ?? "";
    expect(block, ".app.has-bg block not found").toBeTruthy();
    expect(block).toContain("isolation: isolate");
    expect(block).toContain("background: var(--app-page-flat);");
  });

  test("one writer paints --app-page, and it is the theme function", () => {
    // The same shape as the card-transparency guard above: a property with two
    // writers has two answers, and the second one wins by accident of order.
    // The scan is textual on the SET call — `var(--app-page` in the stylesheet
    // is a read, not a write — so only a `setProperty` can match.
    const writers: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(entry.name)) {
          const text = readFileSync(path, "utf8");
          if (text.includes('("--app-page", ')) writers.push(path);
        }
      }
    };
    walk("src");
    expect(writers).toEqual(["src/lib/themes.ts"]);
  });
});

/**
 * The declarations of a single-brace rule whose selector is `selector`.
 *
 * Deliberately naive: it stops at the first `}`, which is exactly right for the
 * flat rules it is pointed at and would be wrong for a nested one. The nested
 * case is handled by `enclosingSelector` below instead — a parser that guessed
 * at nesting would be more code than the rule it reads.
 */
function declarations(selector: string): string[] {
  const start = styles.indexOf(selector);
  expect(start, `${selector} is not in the stylesheet`).toBeGreaterThan(-1);
  const open = styles.indexOf("{", start);
  const body = styles
    .slice(open + 1, styles.indexOf("}", open))
    // Comments first, and not for tidiness: the prose in these blocks uses
    // semicolons freely, and a splitter that runs before the strip reads half a
    // sentence as a declaration — which is exactly what happened the first time
    // this file was run.
    .replace(/\/\*[\s\S]*?\*\//g, "");
  return body
    .split(";")
    .map((d) => d.replace(/\s+/g, " ").trim())
    .filter((d) => d.length > 0);
}

/**
 * The innermost selector a declaration sits under, or "" if the sheet has no
 * rule open above it.
 *
 * Reads the text between the previous rule's closing brace (or the previous
 * declaration's semicolon) and the rule's own opening brace, then keeps the
 * last non-empty line — which is the selector itself, comments and `@supports`
 * preludes above it included and therefore harmless.
 */
function enclosingSelector(needle: string, sheet: string = styles): string {
  const at = sheet.indexOf(needle);
  expect(at, `${needle} is not in the stylesheet`).toBeGreaterThan(-1);
  const open = sheet.lastIndexOf("{", at);
  expect(open, `${needle} is not inside a rule`).toBeGreaterThan(-1);
  const prev = Math.max(sheet.lastIndexOf("}", open), sheet.lastIndexOf(";", open));
  return sheet
    .slice(prev + 1, open)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .pop()!;
}

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

const render = (fit: "cover" | "contain" | "soft", imageId: string) =>
  renderToStaticMarkup(
    createElement(
      AppProvider,
      null,
      createElement(
        ThemeProvider,
        null,
        createElement(BackgroundImagePicker, {
          imageId,
          fit,
          onImageChange: () => {},
          onScrimChange: () => {},
          onBlurChange: () => {},
          onPaletteChange: () => {},
          onFitChange: () => {},
          onCardTransparencyChange: () => {},
          onTintChange: () => {},
        }),
      ),
    ),
  );

describe("the background stack — one image, three layers, in a fixed order", () => {
  test("the fill paints under the picture, and the scrim over both", () => {
    // Source order decides paint order among equal `z-index` values, and the
    // two negative indexes are what put the whole stack under the content. If
    // the fill were ever declared after the picture it would cover the sharp
    // copy it exists to sit behind; if the scrim came before the picture the
    // photograph would be painted over the veil that makes it legible.
    const fill = styles.indexOf(".app-bg-fill {");
    const picture = styles.indexOf(".app.has-bg::before {");
    const scrim = styles.indexOf(".app.has-bg::after {");
    expect(fill).toBeGreaterThan(-1);
    expect(picture).toBeGreaterThan(fill);
    expect(scrim).toBeGreaterThan(picture);

    expect(declarations(".app-bg-fill {")).toContain("z-index: -2");
    expect(declarations(".app.has-bg::before {")).toContain("z-index: -1");
    expect(declarations(".app.has-bg::after {")).toContain("z-index: -1");
  });

  test("both copies of the picture read the one image property, and only the fill ignores the fit", () => {
    // One `--app-bg-image` written by the app root, two layers: the fill must
    // not grow a second source, and it must not read the fit either — its size
    // is the fixed `cover` recipe, while the picture layer is the one the
    // reader's `Kép mérete` choice reaches.
    expect(declarations(".app-bg-fill {")).toContain(
      "background-image: var(--app-bg-image)",
    );
    expect(declarations(".app.has-bg::before {")).toContain(
      "background-image: var(--app-bg-image)",
    );
    expect(declarations(".app-bg-fill {")).toContain("background-size: cover");
    expect(declarations(".app-bg-fill {")).not.toContain(
      "background-size: var(--app-bg-size, contain)",
    );
  });

  test("the picture layer's fallback is the whole picture, and `soft` never reaches CSS", () => {
    // The fallback matters for the frame before the root's inline block exists,
    // and the keyword matters because there is no `background-size: soft`: the
    // mapping is `fitCss`'s job, and CSS must never be handed the stored value.
    expect(declarations(".app.has-bg::before {")).toContain(
      "background-size: var(--app-bg-size, contain)",
    );
    expect(fitCss("soft")).toBe("contain");
    expect(styles).not.toContain("background-size: soft");
    expect(styles).not.toContain("--app-bg-size: soft");
  });

  test("the blur slider reaches the picture layer, and the fill keeps its own fixed blur", () => {
    // The division of the mode: the fill is blurred by the recipe, the sharp
    // copy is blurred by the reader. A fill reading `--app-bg-blur` would make
    // the slider move the wrong layer, and a picture reading nothing would make
    // it inert.
    const picture = declarations(".app.has-bg::before {").join("; ");
    const fill = declarations(".app-bg-fill {").join("; ");
    expect(picture).toContain("filter: blur(var(--app-bg-blur, 6px))");
    expect(fill).not.toContain("--app-bg-blur");
    expect(fill).toContain(`filter: blur(${SOFT_FILL_BLUR_PX}px)`);
  });

  test("the soft override is exactly the magnification going away", () => {
    // The block is an override, so a declaration added to it silently changes
    // the mode everywhere — the blur, the size, the position. Its whole job is
    // the one line, and this asserts it is the whole block rather than trusting
    // a reader to notice a second line arriving.
    expect(declarations(".app.has-bg.bg-fit-soft::before {")).toEqual([
      "transform: none",
    ]);
  });

  test("the preview paints its layers in the app's own order", async () => {
    // DOM order is what stacks the preview's absolutely-positioned layers, so
    // the markup has to say "fill, picture, scrim, card" — the same order the
    // stylesheet says, or the preview is a picture of a different app.
    const backingId = await pickBackgroundImage(
      new File(["bytes"], "stack.png", { type: "image/png" }),
    );
    const soft = render("soft", backingId);
    const order = ["bg-pick-preview-fill", "bg-pick-preview-image", "bg-pick-preview-scrim", "bg-pick-preview-card"].map(
      (cls) => soft.indexOf(cls),
    );
    for (const [i, at] of order.entries()) {
      expect(at, `layer ${i} is not in the preview`).toBeGreaterThan(-1);
      if (i > 0) expect(at, `layer ${i} is out of paint order`).toBeGreaterThan(order[i - 1]!);
    }

    // And the two-layer fits stay two layers, in the order they shipped with.
    const contain = render("contain", backingId);
    expect(contain).not.toContain("bg-pick-preview-fill");
    expect(contain.indexOf("bg-pick-preview-image")).toBeLessThan(
      contain.indexOf("bg-pick-preview-scrim"),
    );
  });
});

describe("the card fade — one writer, read where the reader's number lives", () => {
  test("exactly one file writes the reader's number, and it is the app root", () => {
    // A second writer is the classic way a settings slider becomes a lie: two
    // places that both look authoritative and one of which wins by accident of
    // ordering. The scan is over the whole of `src/`, so a future component
    // cannot quietly join in.
    const writers: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(path)) {
          if (readFileSync(path, "utf8").includes('"--app-card-transparency":')) writers.push(path);
        }
      }
    };
    walk("src");
    expect(writers).toEqual(["src/App.tsx"]);
    expect(appSource).toContain('"--app-card-transparency": String(transparency)');
  });

  test("the mix is declared on `.app`, where the reader's number is written", () => {
    // THE guard for the defect this file caught. The default lives at `:root`
    // and the mix must not: a custom property resolves its `var()`s where it is
    // declared, so a mix at `:root` reads 0 and bakes in an opaque card.
    expect(enclosingSelector("--app-surface: color-mix(")).toBe(".app");
    expect(enclosingSelector("--app-surface-2: color-mix(")).toBe(".app");

    // The pair of facts that make it a trap rather than a typo: the number the
    // mix wants is declared one level ABOVE it, with the exact value the mix
    // would silently bake in.
    const declarationAt = styles.indexOf("--app-card-transparency: 0;");
    expect(declarationAt, "the default is not declared in the stylesheet").toBeGreaterThan(-1);
    expect(enclosingSelector("--app-card-transparency: 0;")).toBe(":root");

    // And the fallback for a browser without `color-mix()` is still the plain
    // surface, where the same rule can be resolved without reading a number at
    // all.
    expect(styles).toContain("--app-surface: var(--surface);");
  });

  test("the selector reader reports `:root` when it should — the guard's own mutation", () => {
    // A guard that reads the selector has to be shown capable of reading the
    // WRONG selector, or "it said `.app`" says nothing. The mutation is the
    // exact regression: the same mix, one level up.
    const regressed = styles.replace(
      ".app {\n    --app-surface: color-mix(",
      ":root {\n    --app-surface: color-mix(",
    );
    expect(regressed).not.toBe(styles);
    expect(enclosingSelector("--app-surface: color-mix(", regressed)).toBe(":root");
  });
});

/**
 * THE HOVER, which used to un-fade the card.
 *
 * A reader fades their cards to 100%, then moves the pointer across a row — and
 * the row snaps back to a solid `--surface-2` under the cursor while every
 * other pixel of it stays translucent. Eight rules did that: `nav-btn`,
 * `btn-ghost`, `icon-btn`, `pill`, `collapsible-head`, `entry-row` in
 * `--surface-2`, `mood-btn` and `cal-has-entry` in `--brand-soft`. The fill was
 * never a bug in isolation; it was a bug the moment the card underneath could
 * fade, and nothing here could see it because every guard above asks whether a
 * declaration is CORRECT and this one was — for a card that is opaque.
 *
 * What is asserted is the SHAPE (this file's job) and the ARITHMETIC of what a
 * hovered row composites to, because "it is transparent now" is not a claim
 * anyone can check by looking: at 100% the fill has no colour left, so the
 * hover needs a second signal or it becomes invisible. The colours themselves
 * are `card-contrast.test.ts`'s business; the numbers here are computed from
 * the same library, never quoted.
 */
describe("the hover fades with the card, and stays visible when it cannot", () => {
  /**
   * Every hover in the sheet that paints a background, and what it paints.
   *
   * The list is the contract rather than a set of separate assertions: a NEW
   * hover cannot appear without either naming its fill here or failing, and a
   * hover that goes back to a solid surface fails even if nobody remembers that
   * it used to fade. The three filled buttons are the deliberate exceptions —
   * a button whose whole identity is its fill cannot hover to nothing — and
   * they are listed with their exact declarations, so editing one is visible.
   */
  const HOVER_INVENTORY: Record<string, string> = {
    ".nav-btn:hover": "var(--app-hover-fill)",
    ".btn-primary:hover": "var(--brand-strong)",
    ".btn-soft:hover": "color-mix(in srgb, var(--brand-soft) 80%, var(--brand))",
    ".btn-ghost:hover": "var(--app-hover-fill)",
    ".btn-danger:hover": "color-mix(in srgb, var(--danger) 85%, black)",
    ".icon-btn:hover": "var(--app-hover-fill)",
    ".mood-btn:hover": "var(--app-accent-hover-fill)",
    ".pill:hover": "var(--app-hover-fill)",
    ".collapsible-head:hover": "var(--app-hover-fill)",
    ".cal-has-entry:not(:disabled):hover": "var(--app-accent-hover-fill)",
    ".entry-row:hover": "var(--app-hover-fill)",
    ".med-chip-x:hover": "var(--app-danger-hover-fill)",
    // The meal log's food box. A `:focus-visible` companion shares the rule, so
    // the key names both states — the keyboard reader gets the same row, and
    // the scan sees exactly what the sheet declares.
    ".autocomplete-choice:hover, .autocomplete-choice:focus-visible": "var(--app-hover-fill)",
  };

  /** Filled buttons keep a solid hover: their fill IS the component. */
  const SOLID_HOVERS = [".btn-primary:hover", ".btn-soft:hover", ".btn-danger:hover"];

  const HOVER_FILLS = [
    "--app-hover-fill",
    "--app-accent-hover-fill",
    "--app-danger-hover-fill",
  ];

  /** Every `:hover` rule that declares a background, read out of the sheet. */
  function hoverFills(sheet: string = styles.replace(/\/\*[\s\S]*?\*\//g, "")): Map<string, string> {
    const found = new Map<string, string>();
    for (const [, selector, body] of sheet.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const sel = selector.trim().replace(/\s+/g, " ");
      if (!/:hover/.test(sel)) continue;
      const fill = /background:\s*([^;]+);/.exec(body)?.[1]?.trim();
      if (fill) found.set(sel, fill);
    }
    return found;
  }

  test("the sheet's hover inventory is exactly the one this file lists", () => {
    const found = [...hoverFills()].map(([sel, fill]) => `${sel} → ${fill}`).sort();
    const said = Object.entries(HOVER_INVENTORY)
      .map(([sel, fill]) => `${sel} → ${fill}`)
      .sort();
    expect(found).toEqual(said);
  });

  test("no hover paints a solid surface — the exact regression, as a set", () => {
    const surfaces = ["--surface", "--surface-2", "--bg-soft", "--brand-soft", "--danger-soft"];
    const offenders = [...hoverFills()].filter(([, fill]) =>
      surfaces.some((token) => fill === `var(${token})`),
    );
    expect(offenders.map(([sel, fill]) => `${sel} → ${fill}`)).toEqual([]);
    // And the three exceptions are exceptions on purpose: each is a filled
    // control, checked here so "the exceptions" cannot quietly grow.
    for (const sel of SOLID_HOVERS) {
      expect(Object.keys(HOVER_INVENTORY)).toContain(sel);
    }
  });

  test("the hover fills read the reader's number, the same weight the card does", () => {
    // Not a fixed percentage: a token that hardcoded "60% transparent" would
    // fade the row to a constant no matter where the slider is, which is the
    // same class of lie as a mix declared at `:root`.
    for (const token of HOVER_FILLS) {
      expect(enclosingSelector(`${token}: color-mix(`)).toBe(".app");
      const at = styles.indexOf(`${token}: color-mix(`);
      // THIS declaration only, not the rule it sits in: the surface pair in the
      // same block carries the identical expression, so a rule-wide check would
      // pass a hover token whose weight had been replaced with a constant.
      const declaration = styles.slice(at, styles.indexOf(";", at));
      expect(declaration, `${token} must weight the colour by the reader's number`).toContain(
        "calc((1 - var(--app-card-transparency)) * 100%)",
      );
    }
    // The ring is a plain ink tint: it has no number to read, because it is the
    // signal that survives when the number reaches 1 and the fill is nothing.
    expect(enclosingSelector("--app-hover-ring: color-mix(")).toBe(".app");
  });

  test("the fallback for a browser without color-mix() is today's colour, not a new one", () => {
    expect(styles).toContain("--app-hover-fill: var(--surface-2);");
    expect(styles).toContain("--app-accent-hover-fill: var(--brand-soft);");
    expect(styles).toContain("--app-danger-hover-fill: var(--danger-soft);");
    expect(styles).toContain("--app-hover-ring: var(--line);");
  });

  test("hovering changes the row's tint by exactly (1 − transparency), and nothing else", () => {
    // The compositing a `color-mix(colour X%, transparent)` fill performs, as a
    // number rather than as a picture: the fill's own alpha IS the surviving
    // share, which is why the same expression serves both surfaces and hovers.
    const fillAlpha = (t: number) => 1 - t;
    expect(fillAlpha(0)).toBe(1);
    expect(fillAlpha(1)).toBe(0);
    // A reader at full transparency hovers into NOTHING: the fill cannot be
    // the affordance there, which is why the ring exists.
    expect(fillAlpha(1)).toBe(0);
    expect(styles).toContain("box-shadow: inset 0 0 0 1px var(--app-hover-ring);");
  });

  test("the ring's alpha is non-zero and the fill's reaches zero — read, not asserted", () => {
    // Parsed out of the declarations, so editing either number is a failing
    // test rather than a quieter hover.
    //
    // The ink SLOT, not the raw token: the ring belongs to the row's words and
    // follows them under a picture, which is what the slot carries. It read
    // `var(--ink)` while the picture's decision also overwrote `--ink`; now that
    // the raw token stays the theme's (the solid carriers re-pin from it), the
    // slot is the only name that answers both.
    const ring = /--app-hover-ring:\s*color-mix\(in srgb, var\(--app-ink\) (\d+)%, transparent\)/.exec(
      styles,
    );
    expect(ring, "the ring must state its alpha as a percentage of ink").not.toBeNull();
    const alpha = Number(ring![1]) / 100;
    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThanOrEqual(1);
    // An inset hairline, not a shadow: it cannot escape the rounded corner, and
    // a drop shadow on a translucent row reads as dirt on the photograph.
    for (const [, , body] of styles.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      if (!/var\(--app-hover-ring\)/.test(body)) continue;
      expect(body).toContain("box-shadow: inset 0 0 0 1px");
    }
  });

  test("the guard's own reader is shown capable of reading the wrong selector", () => {
    // Same mutation as above, on the hover token this time: the regression is
    // a rule moved up one level, and a reader that cannot see it is a guard
    // that would pass the next one too.
    const regressed = styles.replace(
      "  .app {\n    --app-surface: color-mix(",
      "  :root {\n    --app-surface: color-mix(",
    );
    expect(regressed).not.toBe(styles);
    expect(enclosingSelector("--app-surface: color-mix(", regressed)).toBe(":root");
  });
});

/*
 * THE SMALL MENUS, which is commit 3.
 *
 * Commit 1 faded the hover, and commit 2 made the ink follow the picture. Both
 * left the reader's actual complaint standing: they faded the cards, and then
 * the reader met a solid panel sitting on the faded card anyway. The fade was
 * written for TWO selectors — `.card` and `.dialog` — and every other surface
 * in the app paints a theme token directly, so no position of the slider could
 * reach the segmented control, the pill clouds, the mood buttons, the stat
 * tiles or the Settings radio pair. Those read as a small MENU sitting on a
 * card, which is where the report came from.
 *
 * The rule this file now holds them to: a surface fades if it is a CONTAINER,
 * and stays solid if it is a CONTROL whose fill is the affordance or whose
 * contrast is the reader's own safety net. The exceptions are listed below as
 * exact declarations, which is the only way "on purpose" survives a later
 * batch; the boundaries are discussed where they are listed.
 *
 * As in the block above, what is asserted here is SHAPE and ARITHMETIC. The
 * colours are `card-contrast.test.ts`'s, and this change moves no colour for
 * any reader who has not dragged the slider: at 0 the mixes resolve to exactly
 * the theme tokens they replaced.
 */
describe("the nested menus fade with the card they sit in", () => {
  /** Every rule in the sheet that paints a background, and what it paints. */
  function backgroundRules(
    sheet: string = styles.replace(/\/\*[\s\S]*?\*\//g, ""),
  ): Map<string, string> {
    const found = new Map<string, string>();
    for (const [, selector, body] of sheet.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const sel = selector.trim().replace(/\s+/g, " ");
      const fill = /background:\s*([^;]+);/.exec(body)?.[1]?.trim();
      if (fill) found.set(sel, fill);
    }
    return found;
  }

  /**
   * Every surface that must fade, and the token it must fade WITH.
   *
   * A list rather than a predicate, so that a surface joining the fade is a
   * line somebody wrote down and a surface leaving it is a line somebody
   * deleted — and so that the deliberate exceptions below can be read against
   * the rule rather than guessed at.
   */
  const FADES_WITH_THE_CARD: Record<string, string> = {
    // The segmented control: the container AND the chosen segment inside it,
    // because a menu whose active half is still solid is exactly the thing a
    // reader reports as "not fully transparent".
    ".segmented": "--app-soft-surface",
    ".segment-active": "--app-surface",
    // The pill clouds.
    ".pill": "--app-surface",
    // The mood menu, both halves.
    ".mood-btn": "--app-surface-2",
    ".mood-btn-active": "--app-accent-soft",
    // The Settings radio pair, both halves.
    ".mood-flow-option": "--app-surface",
    ".mood-flow-option-on": "--app-accent-soft",
    // The pickers.
    ".font-option": "--app-surface-2",
    ".font-option-active": "--app-accent-soft",
    ".theme-swatch": "--app-surface-2",
    ".iconset-row": "--app-surface",
    ".iconset-row-active": "--app-surface-2",
    // Phase 3's colour editor: the row naming the token the one picker edits.
    ".cte-row-active": "--app-surface-2",
    // Panels and rows.
    ".stat-box": "--app-surface-2",
    ".detail-note": "--app-surface-2",
    ".empty-state": "--app-surface-2",
    ".toolbox-item": "--app-surface-2",
    ".goal-row": "--app-surface-2",
    ".entry-row": "--app-surface",
    ".corr-row": "--app-surface-2",
    ".insight-row": "--app-surface-2",
    ".pattern-row": "--app-surface-2",
    ".assessment-log-item": "--app-surface",
    ".safety-block": "--app-surface",
    ".resources-block": "--app-surface-2",
    ".resources-emph": "--app-surface",
    ".crisis-strip": "--app-surface-2",
    ".exp-check": "--app-surface-2",
    ".pin-box": "--app-surface-2",
    ".backup-words": "--app-surface-2",
    ".backup-word": "--app-surface",
    // Controls whose bounds are carried by a border, so the fade costs them
    // nothing: the inputs, the icon button, and the switch.
    ".text-input, .text-area": "--app-surface",
    ".icon-btn": "--app-surface",
    ".toggle-ui": "--app-soft-surface",
    // The meal log's suggestion popup: it hangs over the card it belongs to, and
    // a list that stayed solid would be the one opaque rectangle on a picture.
    ".autocomplete-list": "--app-surface",
  };

  /**
   * The surfaces that stay solid, and why — a stated decision, not an oversight.
   *
   * Three kinds, and the kind is the argument:
   *  1. a FILL whose colour is the meaning: `.cal-day` and the Year-in-Pixels
   *     tiles are a colour grid, and a colour grid with no fills is not a
   *     quieter grid;
   *  2. a filled selection carrying `--on-brand` text: `.pill-selected` puts
   *     `#fff` on `--brand`, and white on a transparent brand is white on a
   *     photograph. Commit 1 made the same call for `.btn-primary` and this is
   *     the same call, reached the same way;
   *  3. a thin bar or a chip whose own tint is the point: the slider tracks,
   *     the progress track, the table header, the chips, and the theme swatch
   *     in the picker — a swatch that faded would no longer show its theme.
   *
   * …and, since the stuck-worker batch, a fourth: `.stale-worker-banner`, whose
   * ground is solid so that a warning about the WRONG CODE is readable on every
   * picture, including the ones that change the app's own ink.
   */
  const STAYS_SOLID: Record<string, string> = {
    ".pill-selected": "var(--brand)",
    ".yip-tile": "var(--bg-soft)",
    ".yip-tile-active": "var(--surface)",
    ".cal-day": "var(--surface-2)",
    // `.cte-swatch` left this list with Phase 3: the native colour input it
    // painted is gone, and its replacement (`.cte-row-active`) is a fading
    // surface rather than a solid one.
    ".tracker-chip": "var(--surface)",
    ".med-chip": "var(--surface-2)",
    ".iconset-badge": "var(--surface-2)",
    ".badge-cell": "var(--surface-2)",
    ".progress-track": "var(--bg-soft)",
    ".slider::-webkit-slider-runnable-track": "var(--bg-soft)",
    ".slider::-moz-range-track": "var(--bg-soft)",
    ".corr-matrix thead th": "var(--surface-2)",
    // The stuck-worker banner: a FOURTH kind, and the only one whose reason is
    // legibility rather than meaning. It reports that the page in front of the
    // reader is not the deployed one, so it has to be readable on any picture —
    // including the ones that make the app's own ink change. A solid ground of
    // its own is what makes that possible, and it is listed with the carriers in
    // `src/styles.css` so its words stay the theme's.
    ".stale-worker-banner": "var(--surface)",
  };

  /**
   * The filled surfaces, on the same terms, for the scan below.
   *
   * `--brand` is in the scan because `.pill-selected` is an exception for a
   * reason that has nothing to do with which token it used, and scanning only
   * the three container tints would have let it drift out of the list without a
   * line being deleted. The other six use it for the same reason it does:
   * a solid accent carrying text in a colour that was chosen against it.
   */
  const FILLED_BY_DESIGN: Record<string, string> = {
    ".nav-btn-active": "var(--brand)",
    ".btn-primary": "var(--brand)",
    ".slider::-webkit-slider-thumb": "var(--brand)",
    ".slider::-moz-range-thumb": "var(--brand)",
    ".meditation-bar span": "var(--brand)",
    ".toggle-input:checked + .toggle-ui": "var(--brand)",
  };

  /** The four tokens the fade is expressed in, and the theme token under each. */
  const FADE_TOKENS: Record<string, string> = {
    "--app-surface": "--surface",
    "--app-surface-2": "--surface-2",
    "--app-soft-surface": "--bg-soft",
    "--app-accent-soft": "--brand-soft",
  };

  test("the sheet's nested menus are exactly the ones this file lists", () => {
    // Both directions from the sheet: a surface that stopped fading without a
    // line here fails, and a line here that names a surface the sheet no longer
    // paints fails too.
    const fading = [...backgroundRules()]
      .filter(([, fill]) => /var\(--app-(?:surface|surface-2|soft-surface|accent-soft)\)/.test(fill))
      .map(([sel]) => sel);
    // The card pair is the fade's own rule, written as one grouped selector,
    // and each of them also carries its own base rule further up the sheet.
    const cards = [".card, .dialog", ".card", ".dialog"];
    expect(fading.filter((sel) => !cards.includes(sel)).sort()).toEqual(
      Object.keys(FADES_WITH_THE_CARD).sort(),
    );
  });

  test("every nested surface reads the token this file names for it", () => {
    for (const [sel, token] of Object.entries(FADES_WITH_THE_CARD)) {
      expect(backgroundRules().get(sel), `${sel} must fade with the card`).toBe(
        `var(${token})`,
      );
    }
  });

  test("the deliberate exceptions are still solid, and still only those", () => {
    // Read from the sheet as well as from the list, so the claim is not the
    // list agreeing with itself.
    for (const [sel, fill] of Object.entries(STAYS_SOLID)) {
      expect(backgroundRules().get(sel), `${sel} must keep its solid fill`).toBe(fill);
    }
    for (const [sel, fill] of Object.entries(FILLED_BY_DESIGN)) {
      expect(backgroundRules().get(sel), `${sel} must keep its solid fill`).toBe(fill);
    }
    const listed = [...Object.keys(STAYS_SOLID), ...Object.keys(FILLED_BY_DESIGN)].sort();
    const solidInSheet = [...backgroundRules()]
      .filter(([, fill]) => /^var\(--(surface-2|surface|bg-soft|brand)\)$/.test(fill))
      .map(([sel]) => sel)
      // The card pair and its base rules are overridden by the `--app-*` rule
      // further down; the two accessibility overrides are the point of the
      // previous test, not a third kind of surface; and the picker’s sample
      // card fades through its own mix. The `@media` key is this reader’s
      // known blind spot — it stops at the first `}`, which is exactly right
      // for the flat rules it is pointed at and wrong for a wrapped one, and
      // both of the rules it swallows are asserted by name above.
      .filter(
        (sel) =>
          ![
            ".card, .dialog",
            ".card",
            ".app.contrast-high .card",
            ".app.contrast-high .dialog",
            ".app.has-bg .dialog",
            ".app.has-bg .card",
            "@media (prefers-reduced-transparency: reduce)",
            ".bg-pick-preview-card",
          ].includes(sel),
      )
      .sort();
    expect(solidInSheet).toEqual(listed);
  });

  test("the nested tints read the reader's number, on .app, like the card", () => {
    for (const token of ["--app-soft-surface", "--app-accent-soft"]) {
      expect(enclosingSelector(`${token}: color-mix(`)).toBe(".app");
      const at = styles.indexOf(`${token}: color-mix(`);
      const declaration = styles.slice(at, styles.indexOf(";", at));
      expect(declaration, `${token} must weight the colour by the reader's number`).toContain(
        "calc((1 - var(--app-card-transparency)) * 100%)",
      );
    }
    // And each is a mix of the token it claims to replace, not of some other
    // surface — four tints that all happened to fade would pass the two tests
    // above and be wrong in the only way a reader would notice.
    for (const [token, themeToken] of Object.entries(FADE_TOKENS)) {
      const at = styles.indexOf(`${token}: color-mix(`);
      expect(styles.slice(at, styles.indexOf(";", at)), token).toContain(
        `var(${themeToken}) calc((1 - var(--app-card-transparency)) * 100%)`,
      );
    }
  });

  test("a browser without color-mix() gets today's colours, all four of them", () => {
    for (const [token, themeToken] of Object.entries(FADE_TOKENS)) {
      expect(styles, `${token} needs a :root fallback`).toContain(
        `  ${token}: var(${themeToken});`,
      );
    }
  });

  test("at 100% every one of them is nothing, and at 0% every one is the theme", () => {
    // The compositing a `color-mix(colour X%, transparent)` fill performs, as a
    // number rather than as a picture: the fill's own alpha IS the surviving
    // share, which is why one expression serves the card, the hover and all
    // thirty nested surfaces.
    const alpha = (t: number, percentage: number) => (percentage / 100) * (1 - t);
    const used = new Set(Object.values(FADES_WITH_THE_CARD));
    // Every token the nested surfaces read is one of the four, so a surface
    // cannot have found a fifth way to fade.
    for (const token of used) {
      expect(Object.keys(FADE_TOKENS), `${token} must be one of the four`).toContain(token);
    }
    for (const token of Object.keys(FADE_TOKENS)) {
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        expect(alpha(t, 100), `${token} at ${t}`).toBeCloseTo(1 - t, 10);
      }
    }
    // The reader's own claim, and the one this whole commit exists for: nothing
    // is left inside a card at the end of the track. The exceptions above are
    // the reader's other surfaces, not this one's leftovers.
    expect(alpha(1, 100)).toBe(0);
  });

  test("the two accessibility modes re-pin every token the fade touches", () => {
    // A mode that restores the card and leaves the tile faded has produced the
    // one state neither mode is about: an opaque card with a hole in it. Both
    // modes re-declare all four fade tokens (and the three hover fills, which
    // are the same promise in a different place) on the app root.
    for (const [block, needle] of [
      ["high contrast", ".app.contrast-high {\n  --app-surface: var(--surface);"],
      ["reduced transparency", ".app.has-bg {\n    --app-surface: var(--surface);"],
    ] as const) {
      const start = styles.indexOf(needle);
      expect(start, `${block} must re-pin the tokens`).toBeGreaterThan(-1);
      const body = styles.slice(start, styles.indexOf("}", start));
      for (const [token, themeToken] of Object.entries(FADE_TOKENS)) {
        expect(body, `${block} must restore ${token}`).toContain(`${token}: var(${themeToken});`);
      }
      expect(body, `${block} must restore the hover fills`).toContain(
        "--app-hover-fill: var(--surface-2);",
      );
    }
  });

  test("the guard's own reader is shown capable of reading a wrong token", () => {
    // The mutation that would undo this commit is a token pointing at the wrong
    // theme colour — every fade still happens, and every one of them is the
    // wrong wash. The inventory test above is what catches it, so it has to be
    // able to catch it.
    const regressed = styles.replace(
      "--app-accent-soft: color-mix(\n      in srgb,\n      var(--brand-soft)",
      "--app-accent-soft: color-mix(\n      in srgb,\n      var(--surface-2)",
    );
    expect(regressed).not.toBe(styles);
    const at = regressed.indexOf("--app-accent-soft: color-mix(");
    expect(regressed.slice(at, regressed.indexOf(";", at))).not.toContain("var(--brand-soft)");
    // And the sheet-level reader still sees the selector, so a rule moved up a
    // level is still visible from here.
    expect(enclosingSelector("--app-accent-soft: color-mix(")).toBe(".app");
  });
});
