/**
 * WCAG AA, COMPUTED from the palette rather than read off a table of numbers.
 *
 * Every other guard in this repository asserts that a specific token has a
 * specific value, because those are facts a designer chose. Contrast is not
 * like that: it is arithmetic on two chosen values, and a table of ratios goes
 * stale the instant either one moves, silently, while still reading as
 * evidence. So nothing here is a hardcoded ratio for a pair that ought to pass.
 * The palette is read live out of `THEMES`, the foregrounds are produced by
 * running the real `applyThemeTokens`, and the ratio is computed here.
 *
 * The one exception is `KNOWN_SHORTFALLS`, which is a list of measured floors
 * rather than target values — see the comment on it for why a floor is still a
 * guard rather than a concession.
 *
 * WHAT IS AND IS NOT HERE. The pairs asserted below are the ones a rule in
 * `styles.css` actually creates, not a cross-product of every token against
 * every ground. Of the 120 combinations of six text tokens against five grounds
 * across four themes, 22 fall short of 4.5 — but most are pairings nothing
 * draws, such as `--ok` text sitting on a `--brand-soft` background, which
 * `.disclaimer-block` never does because it sets `--brand-strong`. Asserting
 * them would demand palette changes to fix colours that are never combined, and
 * would bury the pairs that are real. The rule this file follows instead is
 * that a pair earns an assertion when a stylesheet rule puts that foreground on
 * that ground, and earns a floor when that pairing is short.
 */
import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { applyThemeTokens, isLight, mixHex, THEMES } from "../src/lib/themes";
import { WCAG_NON_TEXT, WCAG_TEXT, contrastRatio, parseHexRgb } from "../src/lib/contrast";
import type { CustomThemeKey, ThemeTokens } from "../src/types";

/**
 * The thresholds are imported, not restated, and so is the arithmetic.
 *
 * `lib/contrast` grew out of the card-transparency work, which needed the same
 * measurement this file makes and must not be allowed to make it differently:
 * a ceiling computed one way and verified another is two opinions that happen
 * to agree today. `tests/card-contrast.test.ts` drives both the ceiling and its
 * own guard through that module, so this one does too.
 */
const TEXT = WCAG_TEXT;
const NON_TEXT = WCAG_NON_TEXT;

/**
 * The hex-string wrapper over `lib/contrast`'s triple arithmetic.
 *
 * This file works in palette tokens, which are hex; the module works in
 * triples, which is what compositing needs. Rather than restate the luminance
 * maths, the conversion happens here and the ratio does not.
 *
 * AN UNPARSEABLE COLOUR THROWS rather than defaulting to black. Every call
 * site below passes a token from `THEMES` or a value `applyThemeTokens`
 * derived, so a parse failure is a real defect — and defaulting it to black
 * would report a dark-on-dark pairing as high contrast, which is the exact
 * inversion of what this file exists to catch.
 */
function contrast(a: string, b: string): number {
  const [x, y] = [parseHexRgb(a), parseHexRgb(b)];
  if (!x || !y) throw new Error(`not a colour: ${x ? b : a}`);
  return contrastRatio(x, y);
}

/**
 * A colour drawn at `alpha` over a ground, as the browser composites it.
 *
 * REMOVED. It existed for one assertion — the achievement badge, whose element
 * `opacity` dragged its border under 3:1 — and it went with the defect. It is
 * named here because the lesson it encodes is the one worth keeping in the
 * file: `opacity` on an element composites the WHOLE element toward what is
 * behind it, borders included, so a guard that computes a token's contrast
 * against a palette CANNOT see that failure. It took a source check to catch it.
 */

/** The foreground `applyThemeTokens` derives for a filled token. */
const DARK_INK = "#16211d";

const THEME_NAMES = Object.keys(THEMES) as (keyof typeof THEMES)[];
const tokensOf = (name: string): ThemeTokens => THEMES[name as keyof typeof THEMES];

/**
 * What `applyThemeTokens` writes for a palette, read back off a fake root.
 *
 * Driven through the real function rather than through the palette directly:
 * the thing that has to be true is not "the palette could produce a readable
 * foreground" but "the value the browser is actually given is readable".
 */
function painted(name: string): Map<string, string> {
  const written = new Map<string, string>();
  applyThemeTokens(tokensOf(name), {
    style: { setProperty: (key: string, value: string) => void written.set(key, value) },
  } as unknown as HTMLElement);
  return written;
}

describe("every filled surface carries text at AA", () => {
  for (const name of THEME_NAMES) {
    test(`${name}`, () => {
      const written = painted(name);

      for (const key of ["brand", "danger", "ok", "accent"] as const) {
        const background = tokensOf(name)[key];
        const foreground = written.get(`--on-${key}`);
        expect(foreground, `--on-${key} was not written for ${name}`).toBeTruthy();
        // The wiring: the derived foreground is the rule, not a constant.
        expect(foreground, `${name}/--on-${key} does not follow the rule`).toBe(
          isLight(background) ? DARK_INK : "#ffffff",
        );
        // And the reason the rule exists.
        expect(
          contrast(foreground!, background),
          `${name}/--on-${key}: ${foreground} on ${background}`,
        ).toBeGreaterThanOrEqual(TEXT);
      }
    });
  }
});

/**
 * Text on the ground a rule actually puts it on.
 *
 * Each entry is `[foreground, ground]`, and the reason that pairing exists is in
 * `WHERE` rather than in a comment per line, because a table of six rows with
 * one sentence above it is easier to keep honest than a table of forty.
 */
const TEXT_PAIRS: [CustomThemeKey, CustomThemeKey][] = [
  ["ink", "bg"],
  ["ink", "surface"],
  ["ink", "surface2"],
  ["ink", "brandSoft"],
  ["inkSoft", "bg"],
  ["inkSoft", "bgSoft"],
  ["inkSoft", "surface"],
  ["inkSoft", "surface2"],
  ["brand", "bg"],
  ["brand", "surface"],
  ["brand", "surface2"],
  ["brandStrong", "bg"],
  ["brandStrong", "surface"],
  ["brandStrong", "brandSoft"],
  ["danger", "surface"],
  ["danger", "surface2"],
  ["ok", "bg"],
  ["ok", "surface"],
  ["ok", "surface2"],
];

const WHERE =
  "ink is body text on the page, in a card, in a nested surface and inside the " +
  "brand-tinted disclaimer block; ink-soft is the de-emphasised tier over the " +
  "first three plus bg-soft, which the muted stat chip sets as its own ground; " +
  "brand and brand-strong are headings and links, brand is also the app title " +
  "on the bare page, the meditation chip and the font-option badge on " +
  "surface-2, and brand-strong is what the disclaimer block sets on brand-soft; " +
  "danger is error text inside cards, and on surface-2 it is the PIN lock " +
  "screen's error line; ok is the confidence and read-state label inside a card.";

describe("body text clears AA on every ground it is used on", () => {
  for (const name of THEME_NAMES) {
    test(`${name}`, () => {
      const tokens = tokensOf(name);
      for (const [fg, bg] of TEXT_PAIRS) {
        expect(
          contrast(tokens[fg], tokens[bg]),
          `${name}: --${fg} ${tokens[fg]} on --${bg} ${tokens[bg]}`,
        ).toBeGreaterThanOrEqual(TEXT);
      }
    });
  }
});

/**
 * Pairings that are real and short, pinned at their MEASURED floor.
 *
 * A floor is a guard, not a concession, because of the two assertions it comes
 * with. `ratio >= floor` means a future edit cannot quietly make an existing
 * defect worse. `ratio < TEXT` means that when a palette change DOES fix one of
 * these, this test goes red and the entry has to be promoted into `TEXT_PAIRS`
 * by hand. A list that quietly accepted a passing value would stop being a
 * record of what is broken and become a place where fixes are forgotten.
 *
 * The list is EMPTY, and that is the goal state rather than an accident.
 *
 * Four pairs have been promoted out of it across two palette passes: warm
 * `--ink-soft` on `--bg-soft` 4.16, warm `--brand` on `--bg` 4.42, warm
 * `--brand` on `--surface-2` 4.39 and vibrant `--danger` on `--surface-2` 4.15.
 * Every one of them was fixed by darkening the smallest possible amount and then
 * moved up here as a real assertion, which is the promotion the two-sided
 * assertion exists to force. Vibrant `--danger` was the last one standing, and
 * it was the reason `--danger`/`--surface-2` could not simply join
 * `TEXT_PAIRS`: that list is theme-agnostic, so one entry asks 4.5 of the pair
 * in all four palettes, and this was the one palette that could not pay.
 * With it promoted, the pair asserts at 4.5 everywhere and the asymmetry the
 * file used to have to explain is gone.
 *
 * An empty list is exactly the state where the tests below stop proving
 * anything, so `PINNED_HISTORY` and the "empty only because nothing is short"
 * test exist to make it non-vacuous: they walk the same four pairs in all four
 * palettes and require that anything below 4.5 be named in `KNOWN_SHORTFALLS`.
 * Deleting a pin without promoting it is therefore a failure, which is the bug
 * this file was found to have had once already.
 */
const KNOWN_SHORTFALLS: {
  theme: string;
  fg: CustomThemeKey;
  bg: CustomThemeKey;
  floor: number;
  where: string;
}[] = [];

/**
 * Every pair this file has ever pinned, kept after the fact.
 *
 * This is the record the empty list above would otherwise lose. It is not an
 * assertion — `TEXT_PAIRS` already demands 4.5 of these four pairs in all four
 * palettes — it is the input to the completeness test, so that a pair which
 * falls short again has somewhere to be pinned and is not quietly ignored.
 */
const PINNED_HISTORY: [CustomThemeKey, CustomThemeKey][] = [
  ["inkSoft", "bgSoft"],
  ["brand", "bg"],
  ["brand", "surface2"],
  ["danger", "surface2"],
];

describe("known text shortfalls are pinned, not drifting", () => {
  for (const entry of KNOWN_SHORTFALLS) {
    const label = `${entry.theme}: --${entry.fg} on --${entry.bg} — ${entry.where}`;
    test(label, () => {
      const tokens = tokensOf(entry.theme);
      const ratio = contrast(tokens[entry.fg], tokens[entry.bg]);
      // Fixed? Promote it into TEXT_PAIRS and delete this entry.
      expect(ratio, `${label} now passes AA — promote it into TEXT_PAIRS`).toBeLessThan(TEXT);
      // Worse? The floor says so, and says by how much.
      expect(ratio, `${label} fell below its recorded floor of ${entry.floor}`).toBeGreaterThanOrEqual(
        entry.floor - 0.005,
      );
    });
  }

  test("no entry duplicates an asserted pair, and none is measured twice", () => {
    const asserted = new Set(TEXT_PAIRS.map(([fg, bg]) => `${fg}/${bg}`));
    const seen = new Set<string>();
    for (const entry of KNOWN_SHORTFALLS) {
      const key = `${entry.theme}/${entry.fg}/${entry.bg}`;
      expect(seen.has(key), `${key} is listed twice`).toBe(false);
      seen.add(key);
      expect(
        asserted.has(`${entry.fg}/${entry.bg}`),
        `${key} is pinned as a shortfall but TEXT_PAIRS already demands ${TEXT} of it`,
      ).toBe(false);
    }
    // And every listed floor is the real current ratio, so a stale number in
    // this file cannot quietly raise or lower what it claims to protect.
    for (const entry of KNOWN_SHORTFALLS) {
      const tokens = tokensOf(entry.theme);
      expect(
        contrast(tokens[entry.fg], tokens[entry.bg]),
        `${entry.theme}/${entry.fg}/${entry.bg}: the recorded floor is not the measured ratio`,
      ).toBeCloseTo(entry.floor, 2);
    }
  });

  test("the list is empty only because nothing is short", () => {
    // The completeness half. With `KNOWN_SHORTFALLS` empty, the two tests above
    // pass on an empty array and prove nothing, so this one carries the weight
    // instead: walk every pair this file has ever pinned, in every palette, and
    // require that anything below AA be named in the list. A pair that regresses
    // therefore fails here rather than sitting short and unmentioned, and a pin
    // that is deleted without its pair being promoted fails the same way.
    for (const name of THEME_NAMES) {
      const tokens = tokensOf(name);
      for (const [fg, bg] of PINNED_HISTORY) {
        const ratio = contrast(tokens[fg], tokens[bg]);
        const pinned = KNOWN_SHORTFALLS.some(
          (e) => e.theme === name && e.fg === fg && e.bg === bg,
        );
        expect(
          ratio < TEXT ? pinned : true,
          `${name}: --${fg} ${tokens[fg]} on --${bg} ${tokens[bg]} = ${ratio.toFixed(2)}, ` +
            `which is ${ratio < TEXT ? "below AA and NOT in KNOWN_SHORTFALLS" : "fine"}`,
        ).toBe(true);
      }
    }
  });
});

/**
 * Non-text UI: §1.4.11 wants 3:1 for the parts of a control you have to be able
 * to see to use it. The same floor discipline applies, for the same reason.
 *
 * `--line` is still in this list and still short, because it is still doing a
 * DIFFERENT job. It is the hairline that separates panels, where staying quiet
 * is the point and §1.4.11 does not apply — darkening it to reach 3:1 would
 * have restyled all thirty-four hairlines in the stylesheet along with the
 * seven control borders that used to share it. It used to be the control border
 * too, which is why it is measured rather than quietly deleted: seven rules
 * moved off it, and this number is what they moved off TO measuring.
 *
 * The control borders are in the next block, on `--control-line`.
 */
const NON_TEXT_PAIRS: [CustomThemeKey, CustomThemeKey][] = [
  ["brand", "surface"],
  ["ok", "surface"],
  ["danger", "surface"],
  ["accent", "surface"],
  ["line", "surface"],
];

describe("non-text UI is either at 3:1 or pinned to its floor", () => {
  for (const name of THEME_NAMES) {
    test(`${name}`, () => {
      const tokens = tokensOf(name);
      for (const [fg, bg] of NON_TEXT_PAIRS) {
        const ratio = contrast(tokens[fg], tokens[bg]);
        const label = `${name}: --${fg} ${tokens[fg]} on --${bg} ${tokens[bg]} = ${ratio.toFixed(2)}`;
        if (fg === "line") {
          // Every theme is short here, so there is nothing to promote to. This
          // is the hairline's real, unchanged number: it is meant to be quiet,
          // and no control is painted with it any more.
          expect(ratio, `${label} — the line token has no floor recorded`).toBeLessThan(NON_TEXT);
          expect(ratio, `${label} fell below its recorded floor of 1.39`).toBeGreaterThanOrEqual(1.385);
        } else {
          expect(ratio, label).toBeGreaterThanOrEqual(NON_TEXT);
        }
      }
    });
  }
});

/**
 * `--danger` on `--danger-soft`, the one pair a cross-token matrix cannot see.
 *
 * WHY IT IS ITS OWN BLOCK. `TEXT_PAIRS` is typed `[CustomThemeKey, CustomThemeKey]`
 * so that every ground it names is a ground the palette supplies. `--danger-soft`
 * only joined that set when it became a themed token itself; before that the
 * stylesheet declared one hand-written `:root` hex for all four palettes, the
 * dark theme painted a LIGHT `#e07a86` onto a LIGHT pink, and no matrix built
 * from the palette could contain the pair at all — it was unguarded in every
 * theme, not merely wrong in one.
 *
 * WHAT PAINTS ON IT. Two rules and no others: `.corr-down`, a correlation chip,
 * and `.med-chip-x:hover`. Both set `color: var(--danger)`, so this is a TEXT
 * pairing at WCAG 1.4.3 and the bar is 4.5. There is no non-text pairing here —
 * nothing draws a border or an icon on this ground — so nothing is asserted
 * against the 3:1 rule, and inventing one to fill the matrix would be asserting
 * a combination no rule creates.
 *
 * The `:root` default stays, and it is the LIGHT palette's value. Not for
 * contrast: `applyThemeTokens` sets every token including this one before the
 * first paint that matters. It is there because `applyThemeTokens` has not run
 * on the very first frame, and an undefined `var()` falls back to
 * `currentColor` — a chip would flash in the colour of the text inside it. The
 * same hazard the `--control-line` defaults exist for.
 */
describe("danger text on the danger-soft ground, in every palette", () => {
  test("`:root` declares the LIGHT palette's value, for the first frame", () => {
    expect(css).toContain(`--danger-soft: ${THEMES.light.dangerSoft};`);
  });

  // Two rules paint here — `.corr-down`, a correlation chip, and
  // `.med-chip-x:hover` — and both set `color: var(--danger)`. While the ground
  // was a hand-written `:root` hex shared by all four palettes, this pairing was
  // unreachable: dark painted a LIGHT `#e07a86` onto a LIGHT pink at 2.33:1, and
  // no 13x13 token matrix could even contain the pair. With `--danger-soft` a
  // token, every palette carries its own ground and the whole matrix is visible.
  for (const name of THEME_NAMES) {
    test(`${name}`, () => {
      const tokens = THEMES[name as keyof typeof THEMES];
      expect(
        contrast(tokens.danger, tokens.dangerSoft),
        `${name}: --danger ${tokens.danger} on --danger-soft ${tokens.dangerSoft}`,
      ).toBeGreaterThanOrEqual(TEXT);
    });
  }

  test("each ground really is its palette's own, not one shared hex", () => {
    // The property that makes the block above mean anything. Four copies of the
    // same value would pass every ratio assertion while dark was still painting
    // light pink, which is precisely the defect this token change removed.
    const grounds = THEME_NAMES.map((n) => THEMES[n as keyof typeof THEMES].dangerSoft);
    expect(new Set(grounds).size, `the four grounds are ${grounds.join(" ")}`).toBe(
      THEME_NAMES.length,
    );
  });

  /**
   * THE MUTATION PROOF, as an executable non-vacuity check.
   *
   * A guard that only ever sees the fixed palette proves nothing: it passes on
   * the defect it was written for just as happily as on the fix. So this takes
   * the exact mutation that caused the bug — dark reverted to the light
   * palette's ground — runs the SAME assertion against it, and requires that
   * assertion to FAIL.
   *
   * The old colours, recomputed live rather than typed in: with dark's ground
   * reset to light's, `--danger #e07a86` on `#f6e7e3` lands at 2.33:1, which is
   * the 2.33 this file's own history recorded for the broken state. If a future
   * palette change ever made that combination pass, this test goes red and says
   * the proof has expired — which is the point. A proof that cannot expire is
   * not a proof.
   */
  test("the guard above is not vacuous: reverting dark to a shared ground fails it", () => {
    const dark = THEMES.dark;
    const reverted = contrast(dark.danger, THEMES.light.dangerSoft);
    expect(reverted, "the mutated pairing").toBeLessThan(TEXT);
    // And the same mutated ground is what the per-theme test would then see.
    expect(contrast(dark.danger, dark.dangerSoft)).toBeGreaterThanOrEqual(TEXT);
  });
});

/**
 * The control border, computed through the real function.
 *
 * `--line` used to paint the border on the text field, the toggle track, the
 * five mood buttons, the font and theme pickers, the tag pills and the
 * mood-flow options. Measured against the ground each of those rules actually
 * sits on — which is not `--surface` for most of them — that ran 1.15 to 1.33
 * across the four presets, so the border identified nothing at all.
 *
 * So this is the block that matters for §1.4.11, and it is computed the same way
 * as everything above: `applyThemeTokens` is run, the value it writes is read
 * back, and the ratio against every ground a control sits on is calculated here.
 */
describe("the control border identifies a control in every palette", () => {
  for (const name of THEME_NAMES) {
    test(`${name}`, () => {
      const tokens = tokensOf(name);
      const border = painted(name).get("--control-line");
      expect(border, `--control-line was not written for ${name}`).toBeTruthy();
      // The derivation is the rule, not a stored hex per palette. This is what
      // lets a custom theme the reader builds in Settings get a border that
      // follows their own --line and --ink instead of the light theme's.
      expect(border, `${name}: --control-line does not follow the rule`).toBe(
        mixHex(tokens.line, tokens.ink, 60),
      );
      for (const ground of ["bg", "bgSoft", "surface", "surface2"] as const) {
        expect(
          contrast(border!, tokens[ground]),
          `${name}: control border ${border} on --${ground} ${tokens[ground]}`,
        ).toBeGreaterThanOrEqual(NON_TEXT);
      }
    });
  }
});

/**
 * The two hand-written `--control-line` defaults in `styles.css`.
 *
 * They are the one arrangement in this file that can rot silently: they
 * duplicate a derived value, so nothing anywhere would fail if `:root` said
 * `#123456`. They exist because `applyThemeTokens` has not run on the first
 * frame, and an undefined `var()` falls back to `currentColor` — so without
 * them a control's border would flash in the colour of the text inside it.
 *
 * So they are held to the same rule rather than trusted. `.app.contrast-high`
 * matters most of the two: it re-declares `--line` and `--ink` without going
 * through the function at all, so nothing else in the app would notice if its
 * border default went stale. Each is checked against the palette it declares,
 * read out of that same block — not against a copy of those values.
 */
/** The stylesheet itself, read once. Several blocks below assert on its source. */
const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

describe("the stylesheet's control-border defaults cannot drift", () => {
  const blockFor = (selector: string): string =>
    new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";
  /** A declared colour inside a block — anchored so `--ink` cannot match `--ink-soft`. */
  const valueIn = (block: string, prop: string): string | undefined =>
    new RegExp(`(?:^|\\s)${prop}:\\s*(#[0-9a-f]{6})\\s*;`, "i").exec(block)?.[1];

  for (const [label, selector] of [
    [":root", ":root"],
    [".app.contrast-high", ".app.contrast-high"],
  ] as const) {
    test(`${label} derives its border from its own line and ink`, () => {
      const block = blockFor(selector);
      const line = valueIn(block, "--line");
      const ink = valueIn(block, "--ink");
      expect(line, `${label} declares no --line`).toBeTruthy();
      expect(ink, `${label} declares no --ink`).toBeTruthy();
      expect(valueIn(block, "--control-line"), `${label} declares no --control-line`).toBe(
        mixHex(line!, ink!, 60),
      );
    });
  }

  test("the heavy borders are split, and split the right way round", () => {
    // The two tokens are not interchangeable, so neither may stand in for the
    // other. A `var(--line)` left on a control is the defect this block exists to
    // fix; a `var(--control-line)` on a hairline is the same visual mistake in
    // the opposite direction, and just as easy to write by accident.
    //
    // Counted rather than pattern-matched per rule, because both directions of
    // drift matter and a count catches an addition as well as a deletion.
    // Phase 3 added the eleventh: the colour picker's swatch, a round button
    // and therefore a control — on `--control-line` like the nine.
    const heavy = [
      ...css.matchAll(
        /([.#][A-Za-z0-9_-]+)[^{}]*\{[^{}]*?\bborder:\s*([23])px solid var\(--(line|control-line)\);/g,
      ),
    ];
    expect(heavy, "no heavy borders found — the pattern is stale, not the CSS").toHaveLength(11);

    expect(heavy.filter(([, , , token]) => token === "control-line")).toHaveLength(10);

    // The tenth is the meal log's suggestion popup: it is the input it hangs
    // from, continued — same weight, same token — so an open list still reads
    // as part of the box rather than as a panel that arrived from elsewhere.
    //
    // The only heavy border still on `--line`: `.pin-box` is a container around
    // a PIN field rather than a control.
    expect(heavy.filter(([, , , token]) => token === "line").map(([, selector]) => selector)).toEqual([
      ".pin-box",
    ]);
  });
});

/**
 * The achievement badge, whose border is painted by the element itself.
 *
 * This one was measured as a shortfall for a while, and the reason was not the
 * token. `.badge-cell` carried `opacity: 0.55` ON THE ELEMENT, and element
 * opacity composites the BORDER toward the background as well as the content —
 * so the strongest border the palette can produce read at 2.03 to 2.79 once
 * painted, and no value of `--control-line` could have reached 3:1 while that
 * was there.
 *
 * So the dimming moved down to the three children, which is where a "not yet
 * earned" badge should have been showing it anyway, and the border came up to
 * `--control-line`. The floors below are the real measured ratios, so a palette
 * change cannot quietly make this one worse.
 */
const BADGE_FLOORS = {
  light: 4.419,
  dark: 5.771,
  warm: 4.218,
  vibrant: 4.998,
  cool: 4.676,
  graphite: 5.592,
  lavender: 4.673,
  coconut: 4.937,
  karma: 5.77,
  sunset: 4.341,
  forest: 4.428,
  sea: 4.546,
  lilac: 4.525,
  gold: 4.478,
} as const;

describe("the achievement badge's border identifies it, faded content or not", () => {
  for (const name of THEME_NAMES) {
    test(`${name}`, () => {
      const tokens = tokensOf(name);
      const ground = tokens.surface2; // .badge-cell's own background
      const border = mixHex(tokens.line, tokens.ink, 60);
      const ratio = contrast(border, ground);
      // The derivation is the rule, not a hex typed in here — and it is the
      // value the browser is actually given, read back off the real function.
      expect(border, `${name}: the badge does not follow the derivation`).toBe(
        painted(name).get("--control-line"),
      );
      expect(
        ratio,
        `${name}: badge border ${border} on --surface-2 ${ground} = ${ratio.toFixed(2)}`,
      ).toBeGreaterThanOrEqual(NON_TEXT);
      expect(
        ratio,
        `${name}: fell below its measured ${BADGE_FLOORS[name as keyof typeof BADGE_FLOORS]}`,
      ).toBeGreaterThanOrEqual(BADGE_FLOORS[name as keyof typeof BADGE_FLOORS] - 0.005);
    });
  }

  test("the cell itself carries no opacity, because that was the whole defect", () => {
    // The token guard above would stay green if somebody put `opacity` back on
    // `.badge-cell`: the derivation and the ratio are both computed from the
    // palette, and neither knows what the stylesheet does with the value. Only a
    // source check catches the regression this fix actually removed.
    const block = /\.badge-cell\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(block, ".badge-cell rule not found — the pattern is stale, not the CSS").toBeTruthy();
    expect(block).not.toMatch(/opacity\s*:/);
    expect(block).toContain("var(--control-line)");
    // And the dimming did not simply disappear: it is on the three children.
    // Anchored to a line start so this matches the base rule and not the
    // `.badge-earned .badge-…` override, whose last item ends in the same name.
    for (const child of [".badge-icon", ".badge-label", ".badge-new-flag"]) {
      const rule = new RegExp(`^\\s*\\${child}\\s*\\{([^}]*)\\}`, "m").exec(css)?.[1] ?? "";
      expect(rule, `${child} rule not found`).toMatch(/opacity:\s*0\.55/);
    }
    // And an earned badge is brighter than an unearned one, which it would not
    // be if `opacity: 1` had stayed on the cell while the dimming moved down.
    const earned = /\.badge-earned \.badge-icon,\s*\.badge-earned \.badge-label,\s*\.badge-earned \.badge-new-flag\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(earned, "no earned-badge override for the three children").toMatch(/opacity:\s*1/);
  });
});

describe("the palette cannot drift away from the numbers above", () => {
  test("isLight still agrees with what these ratios imply", () => {
    // The guard is only meaningful if the derived foregrounds come from the one
    // function the app uses. If someone reimplements the choice in a test
    // (which two of these guards used to do, with their own copy of the
    // threshold), the ratios below can stay green while the app ships
    // something else. So the rule is restated here against the real export.
    for (const name of THEME_NAMES) {
      const tokens = tokensOf(name);
      for (const key of ["brand", "danger", "ok", "accent"] as const) {
        const background = tokens[key];
        const chosen = isLight(background) ? DARK_INK : "#ffffff";
        const other = chosen === DARK_INK ? "#ffffff" : DARK_INK;
        expect(
          contrast(chosen, background),
          `${name}/${key}: the chosen foreground is worse than the alternative`,
        ).toBeGreaterThanOrEqual(contrast(other, background));
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/* The presets that ship a PAGE BACKDROP (a CSS picture of colour)     */
/* ------------------------------------------------------------------ */

/**
 * A backdrop is a second ground the palette does not name.
 *
 * Every assertion so far measures tokens against tokens, and for the nine flat
 * presets that is the whole page: `body` paints `--bg` and the tokens are the
 * grounds. The five backdrop presets paint a CSS image instead, so the ground
 * under a heading — and, at full card transparency, under every card's words —
 * is a COLOUR RUN, not a token, and the run's darkest point is what has to pay
 * for AA.
 *
 * WHY SAMPLING RATHER THAN THE STOPS. A gradient interpolates in gamma-encoded
 * space, so an in-between colour is not a blend of the stops' luminances: a
 * segment can sit below both endpoints. The stops are therefore checked AND so
 * is every colour between them — 21 per segment, the same arithmetic the
 * browser performs (straight channel lerp), at the same 4.5 the token pairs are
 * held to. Nothing here trusts the stop list either: the shape of the value is
 * asserted (a plain `linear-gradient(Ndeg, #hex P%, …)` with ascending
 * positions spanning 0…100), because a backdrop that grew a `radial-gradient`
 * or a colour the parser cannot read would otherwise skip its own guard.
 *
 * WHICH WORDS, and the rule is the file's existing one: assert what the
 * stylesheet actually puts there. Body text, the brand tier, the error chip and
 * the confidence label all inherit onto the page; the control border is the
 * §1.4.11 case; and `.app.contrast-high` swaps the inks and the border for its
 * own — those two hexes are read out of the stylesheet rather than typed here,
 * because a value that exists in two places must be checked where it lives.
 * `accent` is a fill, not a word on the page, so it is not in the list — the
 * same reason `TEXT_PAIRS` above leaves it out of every other ground too.
 */
const BACKDROP_THEMES = ["sunset", "forest", "sea", "lilac", "gold"] as const;

describe("a preset's backdrop carries every word standing on it", () => {
  /** A declared `#rrggbb` inside a stylesheet block. */
  const hexIn = (block: string, prop: string): string | undefined =>
    new RegExp(`(?:^|\\s)${prop}:\\s*(#[0-9a-f]{6})\\s*;`, "i").exec(block)?.[1];

  const contrastHigh = /\.app\.contrast-high\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";

  /** Parse the value as the shape the guard above promises, stops included. */
  function stopsOf(gradient: string): { hex: string; at: number }[] {
    const m = /^linear-gradient\((\d+)deg,\s*(.+)\)$/.exec(gradient);
    if (!m) throw new Error(`not a plain hex-stop linear-gradient: ${gradient}`);
    const stops = m[2]!.split(",").map((part) => {
      const [hex, pct] = part.trim().split(/\s+/);
      if (!hex || !/^#[0-9a-f]{6}$/.test(hex)) throw new Error(`stop is not a hex colour: ${part}`);
      if (!pct || !/^\d+%$/.test(pct)) throw new Error(`stop has no position: ${part}`);
      return { hex, at: Number(pct.slice(0, -1)) };
    });
    if (stops.length < 2) throw new Error(`a run needs at least two stops: ${gradient}`);
    if (stops[0]!.at !== 0 || stops.at(-1)!.at !== 100)
      throw new Error(`the run must span 0%…100%: ${gradient}`);
    for (let i = 1; i < stops.length; i++) {
      if (stops[i]!.at <= stops[i - 1]!.at) throw new Error(`stops must ascend: ${gradient}`);
    }
    return stops;
  }

  /** The browser's interpolation: a straight lerp of the gamma-encoded channels. */
  const lerpHex = (a: string, b: string, t: number): string => {
    const ch = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const [x, y] = [ch(a), ch(b)];
    return (
      "#" +
      x.map((v, i) => Math.round(v + (y[i]! - v) * t).toString(16).padStart(2, "0")).join("")
    );
  };

  test("the five requested presets are exactly the ones carrying a backdrop", () => {
    // Both directions, and it is the non-vacuity half of this block: a palette
    // added with a backdrop but not to this list would never be measured, and
    // one that LOST its backdrop would silently leave the list while its
    // gradient-owning test kept passing on `undefined`.
    const carrying = THEME_NAMES.filter((name) => Boolean(tokensOf(name).gradient)).sort();
    expect([...BACKDROP_THEMES].sort()).toEqual(carrying);
    for (const name of BACKDROP_THEMES) {
      expect(tokensOf(name).gradient, `${name} lost its backdrop`).toBeTruthy();
    }
  });

  for (const name of BACKDROP_THEMES) {
    test(`${name}: every sampled colour clears AA under the words that land on it`, () => {
      const tokens = tokensOf(name);
      const gradient = tokens.gradient!;
      const stops = stopsOf(gradient);
      // The derived control border — the same value the block above reads off
      // the fake root, so the border measured here is the browser's.
      const border = painted(name).get("--control-line")!;
      // contrast-high's own pair, read where it is declared.
      const chInk = hexIn(contrastHigh, "--ink");
      const chInkSoft = hexIn(contrastHigh, "--ink-soft");
      const chLine = hexIn(contrastHigh, "--line");
      expect(chInk, "the contrast-high block declares no --ink").toBeTruthy();
      expect(chInkSoft, "the contrast-high block declares no --ink-soft").toBeTruthy();
      expect(chLine, "the contrast-high block declares no --line").toBeTruthy();
      const chBorder = mixHex(chLine!, chInk!, 60);

      const text = ["ink", "inkSoft", "brand", "brandStrong", "danger", "ok"] as const;
      for (let i = 0; i < stops.length - 1; i++) {
        const [from, to] = [stops[i]!, stops[i + 1]!];
        const span = to.at - from.at;
        for (let k = 0; k <= 20; k++) {
          const at = from.at + (span * k) / 20;
          const hex = lerpHex(from.hex, to.hex, k / 20);
          const where = `${hex} at ${at.toFixed(1)}% of ${name}`;
          // Polarity first: the backdrop is judged light by `color-scheme` and
          // the theme's dark inks are chosen against that verdict, so a dark
          // band in a light preset would break the page's own contract.
          expect(isLight(hex), `${where} is not light-polarity`).toBe(true);
          for (const key of text) {
            expect(
              contrast(tokens[key], hex),
              `${where}: --${key} ${tokens[key]}`,
            ).toBeGreaterThanOrEqual(TEXT);
          }
          expect(contrast(border, hex), `${where}: the control border ${border}`).toBeGreaterThanOrEqual(
            NON_TEXT,
          );
          expect(contrast(chInk!, hex), `${where}: contrast-high ink ${chInk}`).toBeGreaterThanOrEqual(
            TEXT,
          );
          expect(
            contrast(chInkSoft!, hex),
            `${where}: contrast-high ink-soft ${chInkSoft}`,
          ).toBeGreaterThanOrEqual(TEXT);
          expect(
            contrast(chBorder, hex),
            `${where}: contrast-high control border ${chBorder}`,
          ).toBeGreaterThanOrEqual(NON_TEXT);
        }
      }
    });
  }
});