/**
 * Batch 12 (the final wrap-up batch), commit 3a — CSS housekeeping.
 *
 * What this commit changed in `src/styles.css`, and what each block here pins:
 *
 *  - `.iconset-warn` (was 591–598) is GONE. It was an orphan: nothing in
 *    `src/`, `tests/` or `scripts/` ever named it, and no template literal can
 *    produce it (the only dynamic family in that neighbourhood is
 *    `iconset-${…}`, whose three members are all still declared). The
 *    "no unreachable class" guard below is what makes that claim permanent.
 *  - `.toast-ok` / `.toast-warn` are declared ONCE, together, with the tone's
 *    background AND the `--on-*` foreground. They used to be two pairs of
 *    rules 2100 lines apart, and the colour pair was silently dead: `.toast` is
 *    a single-class selector too, so it won the specificity tie by being later
 *    in the file and every toast drew `#fff`. In the dark theme that is 1.92:1
 *    on `--ok` and 2.02:1 on `--accent`; with the merge it is 8.63:1 and
 *    8.20:1. Nothing else moved.
 *
 * KNOWN, DELIBERATELY UNCHANGED, AND NOW HISTORICAL: when this batch landed the
 * amber accent was still below 4.5:1 in the light (3.19), warm (2.65) and
 * vibrant (4.02) themes, because the foreground there was white both before and
 * after that commit. That was a palette question, not a housekeeping one, so it
 * was pinned as "never worse than the `#fff` it replaces" rather than silently
 * re-designed. A later commit answered it properly — `isLight`'s line moved to
 * 0.5, which hands the light and warm accents the dark ink, and the vibrant
 * pink was darkened to `#ca338c` because no threshold could have fixed it. All
 * sixteen filled-surface pairs now clear 4.5, and `tests/contrast.test.ts`
 * computes every one of them. The "never worse than `#fff`" assertion below is
 * kept because it is the weaker, more general claim, and it holds regardless of
 * which side of the line a colour lands on.
 *
 * THE GUARD, and why it needs an allowlist at all: a class name built at
 * runtime (`corr-${tone}`, `toast-${t.tone}`) appears in no string literal
 * anywhere, so a naive "is this class used?" sweep reports it as dead and the
 * next person deletes the rule. `ALIVE_BY_CONSTRUCTION` below is the explicit,
 * named exception list — three entries, each with the exact file and the exact
 * expression that produces it, and each checked at runtime so the entry cannot
 * rot: if the producer is renamed, this file goes red instead of quietly
 * allowing a dead class.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { THEMES, isLight } from "../src/lib/themes";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CSS = join(ROOT, "src/styles.css");

/** The stylesheet with its comments removed — a selector quoted in prose is not a selector. */
const css = readFileSync(CSS, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Every `src/` TypeScript/TSX file, so the guard cannot be narrowed to one directory. */
function srcFiles(dir = join(ROOT, "src")): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...srcFiles(path));
    else if (/\.tsx?$/.test(path)) out.push(path);
  }
  return out;
}

/** Class name → every selector that declares it. */
function declaredClasses(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const [, selector] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const part of selector.split(",")) {
      const key = part.trim();
      for (const [, cls] of key.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
        const list = map.get(cls) ?? [];
        list.push(key);
        map.set(cls, list);
      }
    }
  }
  return map;
}

/** Body of every rule for one exact selector, concatenated (a class may be declared twice). */
function bodies(selector: string): string[] {
  const out: string[] = [];
  for (const [, sel, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (sel.split(",").some((part) => part.trim() === selector)) out.push(body);
  }
  return out;
}

/**
 * Every token that appears in a string or template literal in `src/`, with
 * comments stripped first.
 *
 * Deliberately a SUPERSET: import paths, test ids and Hungarian copy all end
 * up in the set. A sweep that can only produce false alarms is the right bias
 * for a deletion guard — the cost of a miss is a dead rule nobody notices,
 * while the cost of a false alarm is one line in this file.
 */
function literalTokens(): Set<string> {
  const tokens = new Set<string>();
  for (const file of srcFiles()) {
    const source = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    for (const match of source.matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)) {
      for (const token of (match[1] ?? match[2] ?? match[3] ?? "").split(/[^A-Za-z0-9_-]+/)) {
        if (/^[A-Za-z][A-Za-z0-9_-]*$/.test(token)) tokens.add(token);
      }
    }
  }
  return tokens;
}

/**
 * Classes that are built at runtime and therefore appear in no literal.
 *
 * EXACT class names, never a prefix: a `corr-*` pattern would also wave through
 * a `corr-sparkle` nobody ever renders, which is the failure this allowlist
 * exists to prevent. Each entry names the file, the expression that produces
 * it, and why the class is genuinely reachable.
 */
const ALIVE_BY_CONSTRUCTION: Record<string, { file: string; needle: string; why: string }> = {
  "corr-flat": {
    file: "src/components/CorrelationGrid.tsx",
    needle: "corr-${tone}",
    why: "cellTone() returns \"up\" | \"down\" | \"flat\" | \"none\"; the cell writes `corr-cell corr-${tone}` and the arrow glyph is drawn for a flat delta too (CorrelationGrid.tsx:101-106), so the flat cell is rendered, not theoretical.",
  },
  "toast-ok": {
    file: "src/components/ui/ui.tsx",
    needle: "toast-${t.tone}",
    why: "The Toast type is `tone: \"ok\" | \"warn\"`, so the union guarantees both members are produced (ui.tsx:228).",
  },
  "toast-warn": {
    file: "src/components/ui/ui.tsx",
    needle: "toast-${t.tone}",
    why: "The other half of the same union; a warning toast (assessment consent, failed import) takes this branch.",
  },
};

describe("no class in the stylesheet is unreachable", () => {
  const declared = declaredClasses();
  const tokens = literalTokens();
  const orphans = [...declared.keys()]
    .filter((cls) => !tokens.has(cls) && !(cls in ALIVE_BY_CONSTRUCTION))
    .sort();

  test("every declared class is used, or is a named exception", () => {
    expect(orphans, `unreachable class(es): ${orphans.join(", ")}`).toEqual([]);
  });

  test("the sweep actually reads the whole stylesheet", () => {
    // A guard that silently matched nothing would pass the test above forever.
    expect(declared.size).toBeGreaterThan(250);
    expect(tokens.has("collapsible-card-head")).toBe(true);
  });

  test("the orphan this commit removed is gone, with no family left behind", () => {
    expect(css).not.toContain(".iconset-warn");
    // The two custom properties it fell back to were only ever referenced by
    // that rule; nothing else in the sheet asked for them.
    expect(css).not.toContain("--warn-line");
    expect(css).not.toContain("--warn-bg");
    // ...and the `iconset-` family it belonged to is otherwise intact. The
    // names are the ones actually declared around where it used to sit.
    for (const cls of ["iconset-blurb", "iconset-licences", "iconset-picker", "iconset-chrome", "iconset-badge"]) {
      expect(declared.has(cls), `${cls} went missing`).toBe(true);
    }
  });

  test("each exception is still declared, and its producer still exists", () => {
    for (const [cls, entry] of Object.entries(ALIVE_BY_CONSTRUCTION)) {
      expect(declared.has(cls), `${cls} is allowlisted but no longer in styles.css`).toBe(true);
      const producer = readFileSync(join(ROOT, entry.file), "utf8");
      expect(producer, `${cls}'s producer (${entry.file}) no longer contains \`${entry.needle}\``).toContain(
        entry.needle,
      );
    }
  });
});

describe("the toast tones are declared once, and mean what they say", () => {
  test("each tone has exactly one rule, carrying both halves of the pair", () => {
    for (const tone of ["ok", "warn"]) {
      const rules = bodies(`.toast-${tone}`);
      expect(rules.length, `.toast-${tone} is declared ${rules.length} times`).toBe(1);
      expect(rules[0]).toMatch(/background:/);
      expect(rules[0], `.toast-${tone} has no foreground — this is the duplicate that was merged`).toMatch(/color:/);
    }
  });

  test("the foreground is the --on-* counterpart of the background", () => {
    // A tone whose text colour came from a different token would still look
    // fine in one theme and be unreadable in another, which is exactly what the
    // old split pair did.
    expect(bodies(".toast-ok")[0]).toContain("var(--ok)");
    expect(bodies(".toast-ok")[0]).toContain("var(--on-ok)");
    expect(bodies(".toast-warn")[0]).toContain("var(--accent)");
    expect(bodies(".toast-warn")[0]).toContain("var(--on-accent)");
  });

  test("the tone colour is never worse than the #fff it replaced", () => {
    const luminance = (hex: string): number => {
      const h = hex.replace("#", "");
      const channels = [0, 2, 4]
        .map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
        .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
      return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
    };
    const contrast = (a: string, b: string): number => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    // The same rule `applyThemeTokens` uses to compute every `--on-*` value,
    // CALLED rather than reimplemented. This used to be a copy of the formula
    // with its own 0.6 literal in it, which is the shape of an assertion that
    // goes quietly wrong: when the threshold moved in `src/lib/themes.ts` this
    // copy would have kept deciding the old way and reported a passing suite
    // over a rule nobody was running any more.
    const on = (hex: string): string => (isLight(hex) ? "#16211d" : "#ffffff");
    for (const [name, theme] of Object.entries(THEMES)) {
      for (const [tone, background] of [
        ["ok", theme.ok],
        ["warn", theme.accent],
      ] as const) {
        const merged = contrast(on(background), background);
        const before = contrast("#ffffff", background);
        expect(merged, `${name}/${tone}: merged ${merged.toFixed(2)} < #fff ${before.toFixed(2)}`).toBeGreaterThanOrEqual(
          before,
        );
      }
    }
    // ...and the case that was actually broken: white on the dark theme's
    // light surfaces. This assertion fails if anyone re-splits the pair.
    expect(contrast(on(THEMES.dark.ok), THEMES.dark.ok)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(on(THEMES.dark.accent), THEMES.dark.accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#ffffff", THEMES.dark.ok)).toBeLessThan(3);
  });
});
