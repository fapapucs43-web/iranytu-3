/**
 * Batch 7g — the Year in Pixels card, which had a title nobody wanted, a month
 * row nobody could read, and no stylesheet at all.
 *
 * THE COMPLAINT WAS MOSTLY NOT ABOUT COPY
 * The old title is a literal translation of "puppets", and it is one string in
 * one file. But the month row was unreadable and the legend needed scrolling
 * to find for a different reason: the card referenced six `.yip-*` class names
 * that existed in no rule anywhere. The grid was a div of inline-background
 * spans wrapping by text flow, so a "pixel" had no height. Fixing the words
 * without adding the rules would have left both complaints standing.
 *
 * WHAT IS PINNED HERE, AND WHY IT IS A FACT RATHER THAN A TASTE
 *   - The title, exactly. "Consistently" has to mean the whole repo, so the
 *     sweep below searches `src`, `tests` and `public` rather than one string.
 *     The needle is assembled from two halves so that this file, which is
 *     inside one of the three directories, does not match itself.
 *   - The month abbreviations are pairwise unambiguous, including after accent
 *     stripping, because that is what the one-letter initials were not.
 *   - Every class the card uses has a rule, and no `.yip-*` rule is orphaned.
 *     Both directions: a used name with no rule is what shipped, and a rule
 *     with no name is a dead branch nobody notices.
 *   - The colours the new rules read are ones the high-contrast theme
 *     overrides. `applyThemeTokens` writes --brand, --brand-strong,
 *     --brand-soft, --accent, --danger and --ok from the chosen palette, so
 *     under `.app.contrast-high` they still hold a value picked for that
 *     palette and not for contrast. That is why the selection ring is --ink.
 *   - The shared segmented control is untouched. `.segmented` has three other
 *     call sites, and the fix for a twelve-item month row must not be a rule
 *     that changes all of them.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { t } from "../src/lib/i18n";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const COMPONENT = join(ROOT, "src/components/YearInPixels.tsx");
const LIB = join(ROOT, "src/lib/yearInPixels.ts");
const CSS = join(ROOT, "src/styles.css");

const component = readFileSync(COMPONENT, "utf8");
const lib = readFileSync(LIB, "utf8");

/**
 * The stylesheet with its comments removed.
 *
 * Every CSS guard in this repo strips comments first, and this batch is the
 * case that makes the reason concrete: the new block's own prose mentions
 * `.segment-active` and `.segmented` while explaining why it does not use
 * them. A selector quoted in a comment is not a selector.
 */
const css = readFileSync(CSS, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * Selector (one per comma-separated part) → every body that selector appears
 * in, concatenated.
 *
 * Concatenated, not overwritten: a selector can be declared more than once —
 * `.yip-years` shares one rule with `.yip-months` and then declares its own
 * `grid-template-columns` — and a guard that kept only the last body would
 * report the shared declarations as missing.
 */
function rules(): Map<string, string> {
  const map = new Map<string, string>();
  for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const part of selector.split(",")) {
      const key = part.trim();
      map.set(key, (map.get(key) ?? "") + body);
    }
  }
  return map;
}

const RULE = rules();

/**
 * Every comma-separated selector part in the file, duplicates included.
 *
 * `rules()` is keyed by selector, so it cannot see a second rule for a
 * selector it already has — which is precisely what a mutation that adds
 * `.segment { … }` looks like. The list is built separately so that "declared
 * exactly once" is a claim this file can actually make.
 */
function selectorParts(): string[] {
  const out: string[] = [];
  for (const [, selector] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const part of selector.split(",")) out.push(part.trim());
  }
  return out;
}

/** Tokens written as `--name:` inside one block, e.g. `.app.contrast-high`. */
function declares(selector: string): string[] {
  return [...(RULE.get(selector) ?? "").matchAll(/(--[\w-]+)\s*:/g)].map(([, n]) => n);
}

/** Every file under `dir`, recursively, as a path. */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

/**
 * The class names the card uses, read out of its `className` attributes.
 *
 * Only from `className`, and only the string and template literals inside one.
 * Scanning every literal in the file instead picks up the Hungarian copy —
 * "nincs", "egy", "napot" all look like class names — while missing `yip-tile`
 * altogether, because that one is the untagged head of a template literal.
 * Both happened, which is why this reads the attribute rather than guessing.
 *
 * The attribute value is matched by counting braces, so a nested object or a
 * template's own `${…}` cannot end the scan early.
 */
function classLiterals(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(/className(\s*=\s*)(["'{])/g)) {
    const start = m.index! + m[0].length;
    const quote = m[2];
    if (quote !== "{") {
      out.push(source.slice(start, source.indexOf(quote, start)));
      continue;
    }
    let depth = 0;
    let end = start;
    for (; end < source.length; end++) {
      if (source[end] === "{") depth++;
      else if (source[end] === "}" && --depth === 0) break;
    }
    const expr = source.slice(start, end);
    for (const lit of expr.matchAll(/"([^"]*)"|'([^']*)'|`([^`$]*)(?:\$|\{)/g)) {
      out.push(lit[1] ?? lit[2] ?? lit[3] ?? "");
    }
  }
  return out;
}

function classesUsed(): string[] {
  const found = new Set<string>();
  for (const literal of classLiterals(component)) {
    for (const token of literal.split(/\s+/)) {
      if (/^[a-z][a-z0-9-]*$/.test(token)) found.add(token);
    }
  }
  return [...found].sort();
}

/** Fold accents the way a reader who cannot see them would lose them. */
function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

const ABBREVIATIONS = [
  "jan", "feb", "márc", "ápr", "máj", "jún", "júl", "aug", "szept", "okt", "nov", "dec",
];

describe("the title is the word the card means", () => {
  test("the card title is exactly Hangulat-naptár", () => {
    // The parenthetical went with it. The old title already carried its own
    // correction as a tail, which is why it read as a bad joke rather than as
    // a name.
    // The title is now read from the catalogue, so the assertion follows it there
    // rather than pinning a literal that the language switch could never reach.
    // The claim is unchanged: the rendered title is exactly this, with no
    // parenthetical tail.
    expect(component).toContain('title={t("settings.sections.year")}');
    expect(t("settings.sections.year")).toBe("Hangulat-naptár");
    expect(lib).toContain("monthName");
  });

  test("the old title is gone from src, tests and public alike", () => {
    // "Consistently" has to mean the whole repo. Grepping one file would pass
    // while a help string or a licence kept the old name. The needle is built
    // from two halves because this file is inside one of the three trees.
    const needle = ["Év báb", "jai"].join("");
    expect(component).not.toContain(needle);
    let checked = 0;
    for (const dir of ["src", "tests", "public"]) {
      for (const path of walk(join(ROOT, dir))) {
        if (!/\.(ts|tsx|css|html|md|json)$/.test(path)) continue;
        checked++;
        expect(readFileSync(path, "utf8"), `${path} still has it`).not.toContain(needle);
      }
    }
    expect(checked).toBeGreaterThan(30);
  });
});

describe("the month row says which month it means", () => {
  test("the abbreviations are the agreed twelve, in order", async () => {
    const { MONTH_ABBREVIATIONS } = await import("../src/lib/yearInPixels");
    expect(MONTH_ABBREVIATIONS).toEqual(ABBREVIATIONS);
    expect(MONTH_ABBREVIATIONS).toHaveLength(12);
    for (const a of MONTH_ABBREVIATIONS) expect(a).toBe(a.toLowerCase());
    expect(new Set(MONTH_ABBREVIATIONS).size).toBe(12);
  });

  test("no two abbreviations collide once accents or initials are ignored", async () => {
    // The one-letter row this replaces was ambiguous in three places: J was
    // január, június and július, M was március and május, and a lone "A" for
    // augusztus read as a typo. Every check below fails on that row.
    //
    // Each pair is walked once, by index, and an identical pair is a collision
    // rather than something to skip: skipping equal entries is exactly how a
    // duplicated "jún" would slip through the check that exists to catch one.
    const { MONTH_ABBREVIATIONS } = await import("../src/lib/yearInPixels");
    for (let i = 0; i < MONTH_ABBREVIATIONS.length; i++) {
      for (let j = i + 1; j < MONTH_ABBREVIATIONS.length; j++) {
        const a = MONTH_ABBREVIATIONS[i];
        const b = MONTH_ABBREVIATIONS[j];
        expect(a, `${a} is used twice`).not.toBe(b);
        expect(fold(a), `${a} and ${b} differ only by an accent`).not.toBe(fold(b));
        expect(a.length === 1 && b.length === 1 && a[0] === b[0]).toBe(false);
      }
    }
  });

  test("the component renders the shared list, not a list of its own", () => {
    // Two lists of month names is two lists to keep in step, and the old one
    // is the reason the card was wrong.
    expect(component).toContain("MONTH_ABBREVIATIONS.map(");
    expect(component).not.toMatch(/\[\s*"J"\s*,\s*"F"/);
    expect(component).not.toContain('"Sz"');
  });

  test("monthName is the month word of monthLabel, lower-case", async () => {
    // The card shows `matrix.label` and labels its month buttons `monthName`,
    // so the two have to agree about the word itself. The year in the label is
    // noise in a button label, which is the only reason the second function
    // exists — and if a locale ever started capitalising the month, the
    // sentence-style copy would need folding and this would say so.
    const { monthName } = await import("../src/lib/yearInPixels");
    const { monthLabel, WEEKDAYS_SHORT } = await import("../src/lib/dates");
    for (let month = 0; month < 12; month++) {
      const word = monthName(month);
      expect(word).toBe(monthLabel(2026, month).split(". ")[1]);
      expect(word.charAt(0)).toBe(word.charAt(0).toLowerCase());
    }
    expect(monthName(8)).toBe("szeptember");
    // Seven, Monday first, Hungarian short forms — the row the grid needs.
    expect(WEEKDAYS_SHORT).toEqual(["Hé", "Ke", "Sze", "Cs", "Pé", "Szo", "Vas"]);
    expect(component).toContain("WEEKDAYS_SHORT.map(");
  });
});

describe("the card has a stylesheet", () => {
  test("every class it uses has a rule, and no rule is left orphaned", () => {
    const used = classesUsed();
    expect(used).toEqual([
      "cal-day",
      "cal-grid",
      "cal-num",
      "cal-outside",
      "cal-weekday",
      "yip-cell",
      "yip-cell-selected",
      "yip-detail",
      "yip-legend",
      "yip-legend-item",
      "yip-legend-swatch",
      "yip-months",
      "yip-mood",
      "yip-subtitle",
      "yip-tile",
      "yip-tile-active",
      "yip-years",
    ]);
    for (const name of used) {
      expect(RULE.has(`.${name}`), `.${name} is used but has no rule`).toBe(true);
    }
    // The other direction. A `.yip-*` rule the card stopped using is dead CSS
    // that a later edit can "fix" by matching against nothing.
    for (const selector of RULE.keys()) {
      if (!selector.startsWith(".yip-")) continue;
      const [owner] = selector.split(/[\s>:+~]/);
      expect(used, `${selector} styles a class the card never renders`).toContain(
        owner.slice(1),
      );
    }
  });

  test("the colours it reads are ones the high-contrast theme overrides", () => {
    // `applyThemeTokens` writes --brand, --brand-strong, --brand-soft,
    // --accent, --danger and --ok from the chosen palette, straight onto
    // documentElement. `.app.contrast-high` does not redefine them, so under
    // the high-contrast theme they still hold a value picked for the palette —
    // the vibrant accent is a hot pink, and nothing ever contrast-checked it
    // against these surfaces. The tokens the theme DOES redefine are the
    // surface and ink family, which is what the new rules are allowed to use.
    const themed = new Set(declares(".app.contrast-high"));
    const notColour = new Set(["--font-scale", "--radius"]);
    const used = new Set<string>();
    for (const [selector, body] of RULE) {
      if (!selector.includes(".yip-")) continue;
      for (const [, token] of body.matchAll(/var\((--[\w-]+)\)/g)) used.add(token);
    }
    expect(used.size).toBeGreaterThan(0);
    for (const token of used) {
      expect(
        themed.has(token) || notColour.has(token),
        `${token} is not one the high-contrast theme redefines`,
      ).toBe(true);
    }
    // Named rather than implied, because this is the exact mistake the plan
    // caught: both are defined, both exist in every theme, and neither was
    // checked against the high-contrast surfaces.
    expect(used.has("--brand-strong")).toBe(false);
    expect(used.has("--accent")).toBe(false);
  });

  test("the cell does not restate the calendar's geometry", () => {
    // The journal calendar and this one draw the same 7-column month. A second
    // copy of aspect-ratio, min-height, border or padding is a second thing to
    // keep in step, and `.cal-day` already owns all of it.
    const owned = [
      "aspect-ratio",
      "min-height",
      "display",
      "flex-direction",
      "align-items",
      "justify-content",
      "border",
      "border-radius",
      "cursor",
      "font",
      "padding",
    ];
    const body = RULE.get(".yip-cell") ?? "";
    expect(body, ".yip-cell has no rule at all").not.toBe("");
    for (const property of owned) {
      expect(body, `.yip-cell restates ${property}`).not.toMatch(
        new RegExp(`(^|;)\\s*${property}\\s*:`),
      );
    }
  });

  test("the two control rows size themselves, and the shared one is untouched", () => {
    // `.segmented` is a flex row whose items are `flex: 1`, which is right for
    // the two- and three-item rows the rest of the app uses and wrong for
    // twelve: it squeezed every month to a twelfth of the card. So the card
    // gets its own auto-fitting grids — no column count, so "szept" cannot be
    // clipped on a narrow screen — and `.segmented` is left exactly as it was.
    for (const row of [".yip-years", ".yip-months"]) {
      const body = RULE.get(row) ?? "";
      expect(body, `${row} does not lay itself out`).toMatch(/display:\s*grid/);
      expect(body, `${row} pins a column count`).toMatch(
        /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(/,
      );
    }
    // Counted, not deduplicated: a second `.segment` rule anywhere in the file
    // — including inside a media query — changes all three of those call
    // sites, and a set of names would not notice.
    //
    // Batch 11 commit 3 adds one deliberate member: the press feedback block
    // at the end of the file scales a segment while it is held, from a rule
    // that must live inside `prefers-reduced-motion: no-preference` like the
    // other press states. A bare `.segment:active` would have been a FOURTH
    // unconditional definition of the component — which is exactly what this
    // count exists to catch — so the new rule is `.segmented .segment:active`,
    // scoped under the media query and to the real control. Four, named, with
    // the reason — the same "tolerated, not hidden" shape this file asked of
    // every earlier list.
    const declared = selectorParts()
      .filter((s) => /\.segment(?:ed|-active)?\b/.test(s))
      .sort();
    expect(declared).toEqual([
      ".segment",
      ".segment-active",
      ".segmented",
      ".segmented .segment:active",
    ]);
  });
});

describe("a day can be picked, and it is announced", () => {
  test("the grid is a group of labelled days, not one opaque picture", () => {
    // role="img" had to come off. A container exposed as a single image is one
    // node to a screen reader, so every focusable child inside it disappears —
    // and the day cells are focusable now.
    expect(component).toContain('role="group"');
    expect(component).not.toContain('role="img"');
    // Batch A: the day's label names the quadrant when the new recorder
    // wrote one, and falls back to the level wording otherwise.
    expect(component).toContain("aria-label={describe(c.date, c.level, c.quadrant)}");
    expect(component).toContain("aria-label={monthName(i)}");
    // An empty or undefined label is worse than none: it names a control
    // without saying what it is. (A computed `aria-label={` is fine — that is
    // the grid's own caption.)
    expect(component).not.toMatch(/aria-label=""|aria-label=\{(""|undefined|\{\})/);
    // Both label sites are fed from the cell's own date and mood, and the
    // missing-entry wording is the journal calendar's, not a new string.
    //
    // Round 14 moved that wording into the catalogue, so the guard reads it
    // from there and asserts the wiring instead of the copy — which is what it
    // was checking all along: that a day with no entry says so, rather than
    // saying nothing.
    expect(t("yearInPixels.noEntry")).toBe("nincs bejegyzés");
    expect(component).toContain('t("yearInPixels.noEntry")');
    expect(component).toContain("moodLabel(level)");
    // The leading and trailing days of a 7-column month belong to the
    // neighbouring ones, and this is the same expression JournalView uses, so
    // the two calendars dim the same days for the same reason.
    expect(component).toContain("Number(c.date.slice(5, 7)) - 1 === month");
    expect(component).toContain("cal-outside");
  });

  test("the picked day is held in one place and cleared on navigation", () => {
    // A picked day belongs to the month that was on screen when it was picked.
    // Left alone, changing month leaves the line under the grid describing a
    // day that is no longer in it.
    expect(component.match(/= useState/g) ?? []).toHaveLength(3);
    expect(component).toContain("useState<string | null>(null)");
    const picks = component.match(/const pick(?:Year|Month) = [\s\S]*?\n  };/g) ?? [];
    expect(picks).toHaveLength(2);
    for (const pick of picks) expect(pick).toContain("setSelected(null)");
  });

  test("the detail line says which day, is announced, and moves nothing", () => {
    expect(component).toContain("formatHuman(picked.date)");
    expect(component).toContain("moodLabel(picked.level)");
    expect(component).toContain('aria-live="polite"');
    expect(RULE.get(".yip-detail") ?? "").toMatch(/min-height:/);
    // The ring is the state indicator, so it is checked here rather than in
    // the stylesheet test: the ink SLOT for the high-contrast reason AND for the
    // picture's, inset so that marking a day changes no geometry, and instant,
    // because it tracks the keyboard and the focus outline beside it is instant
    // too. It was the raw `--ink`, which answers both questions only while the
    // raw token means the theme's own ink — the picture's decision is written
    // into the slots instead (see the slot block in `src/styles.css`), so this
    // is the name the rule has to read.
    const ring = RULE.get(".yip-cell-selected") ?? "";
    expect(ring).toContain("var(--app-ink)");
    expect(ring).toMatch(/box-shadow:\s*inset/);
    for (const [selector, body] of RULE) {
      if (!selector.includes(".yip-")) continue;
      expect(body, `${selector} animates`).not.toMatch(/transition|animation/);
    }
  });
});

describe("nothing about the data moved", () => {
  test("the matrix still computes the same month, and the cell gained a date", async () => {
    const { monthMatrix, availableYears } = await import("../src/lib/yearInPixels");
    const { moodByLevel } = await import("../src/lib/mood");
    const entry = (date: string, mood: 1 | 2 | 3 | 4 | 5) =>
      ({
        id: date,
        date,
        mood,
        stress: 5,
        energy: 5,
        note: "",
        tags: [],
        emotions: [],
        activities: [],
        reflection: { feeling: "", stressReason: "", need: "" },
        vitals: { restingHr: null, hrv: null, sleepHours: null },
        source: "manual",
        createdAt: 0,
        updatedAt: 0,
      }) as never;
    const m = monthMatrix(2026, 8, [entry("2026-09-15", 5), entry("2026-09-16", 1)]);
    expect(m.cells).toHaveLength(35);
    expect(m.label).toBe("2026. szeptember");
    expect(m.cells.filter((c) => c.level === null)).toHaveLength(33);
    // Batch 11 commit 3 recomputed the mood hexes against every theme
    // background (WCAG AA); level 5 moved from #0d5c4d to #1e8662. The
    // matrix's job is unchanged — it copies `moodByLevel(...).color` — so the
    // pin follows the palette, computed live rather than a second literal.
    expect(m.cells.find((c) => c.day === 15)?.color).toBe(moodByLevel(5).color);
    expect(m.cells.find((c) => c.day === 16)?.color).toBe(moodByLevel(1).color);
    // The only addition: the ISO date the cell was already building.
    expect(m.cells[0].date).toBe("2026-08-31");
    expect(m.cells.at(-1)?.date).toBe("2026-10-04");
    // Batch A added `quadrant` alongside `date`; old entries keep null.
    expect(Object.keys(m.cells[0]).sort()).toEqual(["color", "date", "day", "level", "quadrant"]);
    expect(availableYears([entry("2025-01-01", 3)])).toContain(2025);
  });

  test("the component picks no colour and maps no mood of its own", () => {
    // The bar is the colour the matrix computed for that day. A hex literal or
    // a mood lookup here would be a second source of truth for the palette.
    expect(component).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(component).not.toContain("moodByLevel");
    expect(component).toContain("style={c.color ? { background: c.color } : undefined}");
  });

  test("the batch is claimed by the scoping guard", () => {
    const list = readFileSync(join(ROOT, "tests/batch7.test.ts"), "utf8");
    expect(list).toContain('"src/lib/yearInPixels.ts"');
    expect(list).toContain('"tests/batch7g.test.ts"');
  });
});
