/**
 * Batch 13, commit 10 — the `--ring-*` aliases, finally read.
 *
 * Three properties that `applyThemeTokens` wrote on every theme switch and
 * that nothing read: the balance ring and the mood curve each carried a
 * hand-picked hex instead, so both kept painting one theme's palette after the
 * reader switched. Batch 13 commit 5 found this and exempted the three by name
 * in tests/full-system.test.ts; this commit wires them up and deletes the
 * exemption.
 *
 * WHAT IS WORTH TESTING HERE, and it is not "the ring has a colour".
 *
 *  1. THE MECHANISM. `var()` is not valid in an SVG presentation attribute.
 *     `stroke="var(--ring-ok)"` resolves to nothing and paints black, so the
 *     obvious implementation looks like it works and does not. The working
 *     mechanism is `currentColor` plus a CSS `color` on a tone class. If a
 *     future edit swaps one for the other, the ring silently disappears — and
 *     nothing in a markup-only test can see that. So the mechanism is pinned
 *     directly.
 *
 *  2. THE PALETTE IS GONE FROM JS. The real fix is not substituting a token
 *     for a hex, it is that no component decides a colour any more. A source
 *     scan for the old literals is the only assertion that catches a
 *     reintroduced palette, because the rendered markup is identical either
 *     way once the class is there.
 *
 *  3. EVERY ALIAS IS READ AND DEFAULTED. The `body` block now declares all
 *     three beside the `--on-*` defaults, so the first frame — before
 *     `applyThemeTokens` has run — has a value rather than an undefined one.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import BalanceRing from "../../src/components/BalanceRing";
import { THEMES } from "../../src/lib/themes";

const CSS = readFileSync("src/styles.css", "utf8");
const THEMES_SRC = readFileSync("src/lib/themes.ts", "utf8");
const RING_SRC = readFileSync("src/components/BalanceRing.tsx", "utf8");
const INSIGHTS_SRC = readFileSync("src/views/InsightsView.tsx", "utf8");

const ALIASES = ["--ring-ok", "--ring-warn", "--ring-bad"] as const;

function ringHtml(value: number): string {
  return renderToStaticMarkup(createElement(BalanceRing, { value }));
}

describe("every alias is declared with a default", () => {
  test("each one has a `--name:` declaration in the stylesheet", () => {
    // This is the assertion tests/full-system.test.ts makes for all twenty-one
    // written properties, restated here so the reason survives on its own.
    for (const a of ALIASES) expect(CSS, a).toContain(`${a}:`);
  });

  test("the default is the LIGHT palette, so it matches the rest of the block", () => {
    // `body` already defaults the `--on-*` foregrounds and the scrim from the
    // light palette; a ring default from a different theme would be the one
    // thing on screen before the first theme switch, and would be wrong.
    expect(CSS).toContain(`--ring-ok: ${THEMES.light.brand};`);
    expect(CSS).toContain(`--ring-warn: ${THEMES.light.accent};`);
    expect(CSS).toContain(`--ring-bad: ${THEMES.light.danger};`);
  });

  test("each one is actually READ, not merely declared", () => {
    // The declaration above is half the obligation. This is the half that was
    // missing for two batches.
    for (const a of ALIASES) expect(CSS, a).toContain(`var(${a})`);
  });
});

describe("the balance ring", () => {
  test("it carries a tone and no colour", () => {
    const html = ringHtml(80);
    expect(html.includes("ring-value-ok")).toBe(true);
    // No `stroke=` on the value circle at all: `var()` is not valid in an SVG
    // presentation attribute, so an inline colour there would either be a
    // frozen hex (the bug) or an unresolvable `var()` (silence).
    expect(html.includes("stroke=")).toBe(false);
  });

  test("the tone thresholds are unchanged — they are meaning, not colour", () => {
    expect(ringHtml(100).includes("ring-value-ok")).toBe(true);
    expect(ringHtml(70).includes("ring-value-ok")).toBe(true);
    expect(ringHtml(69).includes("ring-value-warn")).toBe(true);
    expect(ringHtml(45).includes("ring-value-warn")).toBe(true);
    expect(ringHtml(44).includes("ring-value-bad")).toBe(true);
    expect(ringHtml(0).includes("ring-value-bad")).toBe(true);
  });

  test("out-of-range values clamp rather than fall off the end", () => {
    expect(ringHtml(500).includes("ring-value-ok")).toBe(true);
    expect(ringHtml(-20).includes("ring-value-bad")).toBe(true);
  });

  test("the palette is gone from the component's source", () => {
    // The hexes that used to live here. `#c0455a` did not match ANY theme's
    // danger — light is `#b3424f`, dark `#e07a86` — so it had already drifted
    // from the palette entirely, and no theme switch would ever have fixed it.
    for (const hex of ["#0d5c4d", "#d97706", "#c0455a"]) {
      expect(RING_SRC.includes(hex), hex).toBe(false);
    }
    expect(RING_SRC.includes("stroke={color}")).toBe(false);
  });

  test("every tone class the component can emit exists in the stylesheet", () => {
    // Written out in `TONE_CLASS` rather than built from a template, so both
    // halves of this can be checked literally.
    for (const tone of ["ok", "warn", "bad"]) {
      expect(RING_SRC.includes(`ring-value-${tone}`), tone).toBe(true);
      expect(CSS, tone).toContain(`.ring-value-${tone} {`);
    }
  });
});

describe("the mood curve", () => {
  test("its three series paint from currentColor, not from literals", () => {
    // Exactly THREE `currentColor` lines and exactly one remaining literal
    // hex, which is the sleep series — asserted separately below, because
    // "no hexes at all" would be a test that cannot be true yet and would
    // therefore be weakened or ignored when it needed to change.
    const series = INSIGHTS_SRC.match(/stroke="currentColor"/g) ?? [];
    expect(series.length).toBe(3);
    const hexes = INSIGHTS_SRC.match(/stroke="#[0-9a-f]{3,8}"/g) ?? [];
    expect(hexes).toEqual(['stroke="#4c7fb0"']);
  });

  test("the light palette literals are gone from the view", () => {
    for (const hex of ["#0d5c4d", "#c0455a", "#d97706", "#e4e0d6"]) {
      expect(INSIGHTS_SRC.includes(hex), hex).toBe(false);
    }
  });

  test("the grid and the tooltip read --line instead of a near-miss hex", () => {
    // `#e4e0d6` was close to --line (#dcd6c6) and not equal to it, so the
    // grid stayed light-theme even when the card around it did not.
    expect(INSIGHTS_SRC).toContain("var(--line)");
    expect(INSIGHTS_SRC.includes("#e4e0d6")).toBe(false);
  });

  test("each series class exists in the stylesheet and maps to an alias", () => {
    for (const [cls, alias] of [
      ["chart-series-ok", "--ring-ok"],
      ["chart-series-warn", "--ring-warn"],
      ["chart-series-bad", "--ring-bad"],
    ] as const) {
      expect(CSS, cls).toContain(`.${cls} {`);
      expect(CSS.includes(`.${cls} {\n  color: var(${alias});`), `${cls} → ${alias}`).toBe(true);
      expect(INSIGHTS_SRC.includes(cls), cls).toBe(true);
    }
  });

  test("the selector binds to our own class, not to recharts internals", () => {
    // Matching `.recharts-*` would tie this stylesheet to a dependency's DOM:
    // a version bump would repaint the chart with no compile error and no
    // failing test. Comments are stripped first, because the note explaining
    // this very rule names the thing it forbids.
    const css = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css.includes(".recharts")).toBe(false);
  });

  test("the sleep series keeps its literal, and says so", () => {
    // There is no alias for a fourth series, and minting one would move the
    // twenty-one written properties and the DERIVED_PROPERTIES list. Left
    // visible rather than quietly absorbed — and this test is what will fail
    // if somebody removes the comment explaining why.
    expect(INSIGHTS_SRC.includes('stroke="#4c7fb0"')).toBe(true);
    expect(INSIGHTS_SRC).toContain("no `--ring-*` alias for a");
  });
});

describe("the whole surface, across every theme", () => {
  test("no theme needs a JS colour, because JS has none", () => {
    for (const name of Object.keys(THEMES)) {
      const html = ringHtml(50);
      expect(html.includes("ring-value-warn"), name).toBe(true);
      expect(html.includes("stroke="), name).toBe(false);
    }
  });
});

/**
 * The two places a reader would expect a `--ring-*` alias, and the answer.
 *
 * The question this batch had to answer was "wire the three aliases into
 * validation states and the focus ring, or delete them". The answer is that
 * both places already resolve through the PALETTE, and through the same
 * tokens the aliases are written from — `applyThemeTokens` sets `--ring-warn`
 * from `tokens.accent` and `--ring-bad` from `tokens.danger`, while the focus
 * ring reads `var(--accent)` and the validation tone reads `var(--danger)`.
 *
 * So rewiring them would change no pixel while binding two generic UI states
 * to aliases whose names promise a specific tone: a focus ring that turned
 * "bad" would read as an error, which it is not. That is a design judgement,
 * and a judgement is exactly what a test cannot make — so what these assert is
 * the FACT the judgement rests on, which will fail loudly if either side
 * changes: a palette token swapped for a literal, or an alias pointed at a
 * different token than the UI state that shares its name.
 */
describe("the focus ring and the validation tone, measured", () => {
  /**
   * Anchored to the start of a line, and that anchor is load-bearing.
   *
   * The stylesheet has three `:focus-visible` rules — `.iconset-row:focus-visible`
   * comes first — and an unanchored pattern happily matches the `:focus-visible`
   * inside a longer selector. The helper would then report a compound rule's
   * body while the test believed it was reading the global focus ring, and a
   * hardcoded focus colour would pass. Found by mutation, not by reading.
   */
  const rule = (selector: string) => {
    const m = new RegExp(`^\\${selector}\\s*\\{([^}]*)\\}`, "m").exec(CSS);
    expect(m, `${selector} must have a rule`).not.toBeNull();
    return m![1]!;
  };

  test("the focus ring reads the palette, and --ring-warn is written from that same token", () => {
    expect(rule(":focus-visible")).toContain("var(--accent)");
    expect(rule(":focus-visible")).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    // Same source token, so the two cannot disagree on any theme.
    expect(THEMES_SRC).toContain('"--ring-warn", tokens.accent');
  });

  test("the validation tone reads --danger, and --ring-bad is written from that same token", () => {
    const down = rule(".corr-down");
    expect(down).toContain("var(--danger)");
    expect(down).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(THEMES_SRC).toContain('"--ring-bad", tokens.danger');
  });

  test("the three aliases still have real readers, so none of this needs deleting", () => {
    // The decision was "wire or delete"; the measured answer is "already
    // wired", and this is the assertion that keeps it true.
    for (const alias of ["--ring-ok", "--ring-warn", "--ring-bad"]) {
      const reads = [...CSS.matchAll(new RegExp(`var\\(${alias}\\)`, "g"))].length;
      expect(reads, `${alias} must be read somewhere in the stylesheet`).toBeGreaterThan(0);
    }
  });
});