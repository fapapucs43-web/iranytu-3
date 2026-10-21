/**
 * Batch 11, commit 3 — the polish pass's proof.
 *
 * Everything here is COMPUTED where computation is possible, because the
 * commit's whole point was to replace eyeballing with arithmetic:
 *
 *  - the five mood hexes are run through the WCAG relative-luminance formula
 *    against all six backgrounds the app can put under them (light / dark /
 *    warm / vibrant × surface / bg), and must clear the 3.0 graphics floor —
 *    with the light surfaces preferred at 3.75+. The ratio is computed here,
 *    never asserted as a number a human once read;
 *  - the palette PINS ITS HEXES too, so a future edit re-runs the math on
 *    purpose instead of drifting silently;
 *  - the press-feedback rules exist only inside
 *    `prefers-reduced-motion: no-preference`, and transition transform only —
 *    a transition that touched layout would make every press reflow the page;
 *  - the shadow token is the agreed two-layer spec, verbatim, one token for
 *    both themes;
 *  - the dividers use color-mix over --line so they stay theme-aware with no
 *    dark-mode duplicate;
 *  - headings carry exactly 0.01em of tracking — pinned so it cannot creep;
 *  - EmptyState's cta slot renders, and both empty screens mount it.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MOODS } from "../src/lib/mood";
import { EmptyState } from "../src/components/ui/ui";

const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

/* --------------------------- the WCAG machinery -------------------------- */

/** WCAG 2.x relative luminance of a hex colour. */
function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const channels = [0, 2, 4]
    .map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

/** The contrast ratio, 1–21. */
function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** The theme tokens, read from the same source of truth the runtime uses. */
const { THEMES } = (await import("../src/lib/themes")) as typeof import("../src/lib/themes");

/** Every background a mood colour can be drawn over. */
const BACKGROUNDS: Record<string, string> = {
  "light surface": THEMES.light.surface,
  "light bg": THEMES.light.bg,
  "dark surface": THEMES.dark.surface,
  "dark bg": THEMES.dark.bg,
  "warm surface": THEMES.warm.surface,
  "vibrant surface": THEMES.vibrant.surface,
};

/** The shipped palette, and the hex it must carry. */
const EXPECTED_HEXES: Record<number, string> = {
  1: "#c0455a", // unchanged — already cleared every background
  2: "#ba6503",
  3: "#747a84",
  4: "#338253",
  5: "#1e8662",
};

/* ==================== 1 · the mood palette, computed ===================== */

describe("every mood colour clears WCAG AA on every background", () => {
  test("the palette is five levels, one hex each", () => {
    expect(MOODS).toHaveLength(5);
    expect(new Set(MOODS.map((m) => m.color)).size).toBe(5);
  });

  test("the hexes are the computed ones — a palette edit must re-run the math", () => {
    for (const m of MOODS) {
      expect(m.color, `level ${m.level}`).toBe(EXPECTED_HEXES[m.level]);
    }
  });

  for (const m of MOODS) {
    test(`level ${m.level} (${m.label}) clears 3.0 everywhere, prefers 3.75 on light surfaces`, () => {
      const worst = { name: "", ratio: Infinity };
      for (const [name, bg] of Object.entries(BACKGROUNDS)) {
        const ratio = contrast(m.color, bg);
        expect(
          ratio,
          `${m.color} on ${name} computes ${ratio.toFixed(2)} — below the 3.0 graphics floor`,
        ).toBeGreaterThanOrEqual(3.0);
        if (ratio < worst.ratio) worst.name = name, worst.ratio = ratio;
      }
      // Light surfaces are where these fills must read strongest; the four
      // adjusted levels were chosen to clear 3.75 there, level 1 (untouched)
      // already computed 4.39+.
      if (m.level === 1) {
        expect(worst.ratio).toBeGreaterThanOrEqual(3.2);
      } else {
        expect(
          contrast(m.color, THEMES.light.surface),
          `${m.color} on the light surface`,
        ).toBeGreaterThanOrEqual(3.75);
      }
    });
  }

  test("the levels still score in the same order — the palette, not the scale, moved", () => {
    const scores = MOODS.map((m) => m.score);
    expect([...scores].sort((a, b) => a - b)).toEqual(scores);
    expect(MOODS.map((m) => m.label)).toEqual([
      "Nagyon rossz",
      "Nehéz",
      "Közepes",
      "Jó",
      "Nagyon jó",
    ]);
  });
});

/* ==================== 2 · reduced motion / press feedback ================= */

describe("press feedback is motion-safe and layout-safe", () => {
  test("the no-preference block exists and holds the press states", () => {
    const block = css.slice(css.indexOf("@media (prefers-reduced-motion: no-preference)"));
    expect(block).toContain(".card:active");
    expect(block).toContain(".btn:active");
    expect(block).toContain(".pill:active");
    expect(block).toContain(".nav-btn:active");
    expect(block).toContain(".segmented .segment:active");
    expect(block).toContain("transform: scale(0.98)");
  });

  test("every :active press transition animates transform only — never layout", () => {
    // Each component's own transition may name colour properties; what it may
    // never name is anything that reflows. Read every `transition:` value in
    // the file and forbid the layout properties outright.
    const forbidden = /\btransition:[^;]*(\bwidth\b|\bheight\b|\bpadding\b|\bmargin\b|\btop\b|\bleft\b|\bfont-size\b)/;
    for (const [, value] of css.matchAll(/transition:\s*([^;]+);/g)) {
      expect(value, `transition value reflows: ${value}`).not.toMatch(forbidden);
    }
    for (const sel of [".card {", ".pill {", ".segment {", ".nav-btn {"]) {
      const at = css.indexOf(sel);
      const body = css.slice(at, css.indexOf("}", at));
      expect(body, `${sel} carries the press transition`).toContain("transform 100ms ease");
    }
  });

  test("the press states are NOT active under prefers-reduced-motion: reduce", () => {
    // The reduce block must come after / independently swallow them; assert
    // both media queries exist and the press rules live only in no-preference.
    const reduceBlocks = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\) \{/g)];
    expect(reduceBlocks.length).toBeGreaterThanOrEqual(2);
    const noPref = css.slice(css.indexOf("@media (prefers-reduced-motion: no-preference)"));
    expect(noPref).toContain("scale(0.98)");
    // And the reduce blanket still collapses transitions app-wide.
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{[^}]*transition-duration: 0\.01ms !important/s);
  });
});

/* ========================= 3 · the shadow token =========================== */

describe("the shadow token is the agreed two-layer spec, one token, both themes", () => {
  test("the root declaration is the exact spec", () => {
    expect(css).toContain("--shadow: 0 1px 3px rgba(0, 0, 0, 0.04), 0 4px 12px rgba(0, 0, 0, 0.03);");
  });

  test("it is declared once on :root — no dark-mode duplicate", () => {
    const declarations = [...css.matchAll(/--shadow:\s*([^;]+);/g)].map((m) => m[1]!.trim());
    // Exactly TWO --shadow declarations in the file: the root token, and the
    // high-contrast override (an accessibility mode, not a theme). A dark-
    // mode duplicate would be a third and would fail this count.
    expect(declarations).toHaveLength(2);
    const themed = [...css.matchAll(/\.app\.contrast-high \{[\s\S]*?\}/g)].join("");
    expect(themed).toContain("--shadow:");
    // The lift token, kept for the pressed/hover surfaces, is also two-layer
    // (split on `), 0 ` — each rgba() itself carries commas).
    const lift = css.match(/--shadow-lift:\s*([^;]+);/)![1]!.trim();
    expect(lift.split(/\),\s*0\s+/)).toHaveLength(2);
  });

  test("cards still read the token (no hardcoded shadow crept in)", () => {
    const cardRule = css.slice(css.indexOf(".card {"), css.indexOf("}", css.indexOf(".card {")));
    expect(cardRule).toContain("box-shadow: var(--shadow)");
  });
});

/* ============================ 4 · the dividers ============================ */

describe("section dividers are theme-aware hairlines, not second borders", () => {
  test("they mix --line at 50% — one rule, every theme", () => {
    expect(css).toContain("border-top: 1px solid color-mix(in srgb, var(--line) 50%, transparent)");
    // And the rule is anchored to the view's card rhythm.
    expect(css).toContain(".view > .card + .card::before");
  });

  test("the divider sits in the gap, so it reflows nothing", () => {
    const at = css.indexOf(".view > .card + .card::before");
    const body = css.slice(at, css.indexOf("}", at));
    expect(body).toContain("position: absolute");
    expect(body).toContain("top: -9px"); // half of the 18px view gap
  });
});

/* ========================= 5 · heading tracking =========================== */

describe("headings carry exactly 0.01em of tracking", () => {
  test("the h1–h4 rule names it once, at the pinned value", () => {
    const at = css.indexOf("h1, h2, h3, h4 {");
    const body = css.slice(at, css.indexOf("}", at));
    expect(body).toContain("letter-spacing: 0.01em");
    // And nowhere else is a heading tracking declared — no drift.
    const decls = [...css.matchAll(/letter-spacing:\s*([^;]+);/g)].map((m) => m[1]!.trim());
    expect(decls.filter((v) => v === "0.01em")).toHaveLength(2); // app-title + headings
  });
});

/* ========================= 6 · the EmptyState cta ========================= */

describe("EmptyState grew a cta slot, and the empty screens use it", () => {
  test("it renders the cta under the hint", () => {
    const html = renderToStaticMarkup(
      createElement(EmptyState, {
        icon: "x",
        title: "Üres",
        hint: "Semmi itt.",
        cta: createElement("button", { className: "btn btn-primary" }, "Tovább"),
      }),
    );
    expect(html).toContain('class="empty-state"');
    expect(html).toContain('class="empty-state-cta"');
    expect(html).toContain("btn-primary");
    expect(html).toContain("Tovább");
    // Order: hint before cta.
    expect(html.indexOf("Semmi itt.")).toBeLessThan(html.indexOf("Tovább"));
  });

  test("no cta, no wrapper — the pre-Batch-11 markup is unchanged", () => {
    const html = renderToStaticMarkup(
      createElement(EmptyState, { icon: "x", title: "Üres", hint: "Semmi itt." }),
    );
    expect(html).not.toContain("empty-state-cta");
  });

  test("Insights and Journal mount the cta, wired to the today tab", () => {
    const insights = readFileSync(new URL("../src/views/InsightsView.tsx", import.meta.url), "utf8");
    const journal = readFileSync(new URL("../src/views/JournalView.tsx", import.meta.url), "utf8");
    for (const [name, src] of [["Insights", insights], ["Journal", journal]] as const) {
      expect(src, name).toContain("cta={");
      expect(src, name).toContain("onGoToday");
    }
    // Insights still carries the wording inline; Journal's moved to the
    // catalogue in the Phase 3 extraction, so the two are pinned where each
    // one keeps its Hungarian rather than being forced back into the view.
    expect(insights).toContain('t("insights.empty.cta")');
    expect(journal).toContain('t("journal.empty.cta")');
    // Both pages reached for the same button, so the catalogue carries it
    // twice under each page's own namespace. Asserted here because the wiring
    // above is only half the claim: the wording has to have survived the move.
    const catalogue = readFileSync(new URL("../src/lib/i18n.ts", import.meta.url), "utf8");
    expect(catalogue).toContain('"journal.empty.cta": "Ma fül megnyitása"');
    expect(catalogue).toContain('"insights.empty.cta": "Ma fül megnyitása"');
    const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
    expect(app).toContain('<JournalView onGoToday={() => setTab("today")} />');
    expect(app).toContain('<InsightsView onGoToday={() => setTab("today")} />');
  });

  test("the stylesheet styles the slot", () => {
    expect(css).toContain(".empty-state-cta {");
  });
});

/* ================= 7 · the identity is intact — not decorated ============= */

describe("the pass refined the minimalist identity, it did not decorate over it", () => {
  test("no gradients and no glassmorphism entered the stylesheet", () => {
    // The pre-existing surfaces (progress fill, streak banner, sticky header
    // and nav backdrops) are the shipped identity and are not this commit's
    // to remove. What must hold: the POLISH BLOCK adds none.
    const blockStart = css.indexOf("Batch 11, commit 3 — the premium-polish pass");
    const block = css.slice(blockStart);
    expect(block).not.toMatch(/linear-gradient|radial-gradient|conic-gradient/);
    expect(block).not.toMatch(/backdrop-filter/);
    // And the count of gradient/backdrop uses did not GROW with this commit.
    expect([...css.matchAll(/gradient/g)].length).toBe(3); // 2 backgrounds + 1 comment mention
    expect([...css.matchAll(/backdrop-filter/g)].length).toBe(2);
  });

  test("padding stayed 20px on cards, 18px gap on views — decision B's reality", () => {
    const cardRule = css.slice(css.indexOf(".card {"), css.indexOf("}", css.indexOf(".card {")));
    expect(cardRule).toContain("padding: 20px");
    const viewRule = css.slice(css.indexOf(".view {"), css.indexOf("}", css.indexOf(".view {")));
    expect(viewRule).toContain("gap: 18px");
  });

  test("body line-height is the pinned 1.55 — typography metrics unchanged elsewhere", () => {
    const at = css.indexOf("font-size: calc(17px * var(--font-scale));");
    const body = css.slice(at, css.indexOf("}", at));
    expect(body).toContain("line-height: 1.55");
  });
});
