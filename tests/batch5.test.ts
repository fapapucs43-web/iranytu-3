/**
 * Batch 5 tests — vendored Lucide icon set (P10a) + emoji data integrity.
 *
 * TWO JOBS, both load-bearing:
 *
 * 1. THE ICON SET CONTRACT. src/lib/icons.tsx is hand-vendored path data, so
 *    nothing stops a future edit from breaking it silently. These tests pin
 *    the rules the whole UI now depends on: every icon is real 24×24 SVG
 *    markup, ONE stroke width, `currentColor`, `1em` default (so icons grow
 *    with the --font-scale accessibility setting), and decorative-by-default
 *    (aria-hidden) unless the caller passes an explicit `label`.
 *
 * 2. THE EMOJI DATA INTEGRITY GUARD. Batch 5 moved UI chrome off emoji, and
 *    the single easiest way to wreck every existing user is to "tidy up" an
 *    emoji that is actually part of the stored data. `DEFAULT_ACTIVITIES`
 *    labels like "🚶 Mozgás" are written verbatim into each entry's
 *    `activities` array, and correlationGrid matches rows by EXACT string
 *    equality. Change one byte of those labels and the whole Hatásmátrix
 *    silently empties for everyone who already has a journal — with no error,
 *    no migration failure, nothing but a blank screen.
 *    The "PRE-BATCH-5 STORED ENTRY" tests below freeze that contract: they
 *    feed in entries whose `activities` arrays were written by the shipped
 *    pre-Batch-5 build and assert the correlation rows still light up.
 */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import {
  DEFAULT_SIZE,
  ICONS,
  STROKE,
  getIcon,
  type IconName,
  type IconProps,
} from "../src/lib/icons";
import { DEFAULT_ACTIVITIES, DEFAULT_EMOTIONS } from "../src/lib/store";
import { buildCorrelationGrid, MIN_SAMPLES } from "../src/lib/correlationGrid";
import { tagCorrelations } from "../src/lib/analysis";
import { MOODS } from "../src/lib/mood";
import { BADGES } from "../src/lib/achievements";
import { GLYPHS } from "../src/lib/iconsets";
import { TRACKERS } from "../src/lib/trackers";
import { glyphDef } from "../src/lib/iconsets";
import { ONBOARDING_TRACKER_CHOICES } from "../src/lib/onboarding";
import type { Entry } from "../src/types";

/* ------------------------------------------------------------------ */
/* 1. The icon set contract                                            */
/* ------------------------------------------------------------------ */

/** Render an icon through React so the assertions see real emitted markup. */
function render(name: IconName, props: IconProps = {}): string {
  const el = ICONS[name](props) as unknown as ReactElement;
  expect(el).toBeTruthy();
  return renderToStaticMarkup(el);
}

/** Every intrinsic drawing node in the markup: path/circle/rect/… */
function shapes(markup: string): string[] {
  return [...markup.matchAll(/<(path|circle|rect|line|polyline|polygon|ellipse)[\s/>]/g)].map((m) => m[1]!);
}

/** Value of an attribute in the opening <svg …> tag, or undefined. */
function attr(markup: string, name: string): string | undefined {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(markup.split(">", 1)[0]!)?.[1];
}

describe("vendored Lucide icon set", () => {
  const names = Object.keys(ICONS) as IconName[];

  test("the registry is populated", () => {
    expect(names.length).toBeGreaterThan(40);
    // Guard against an accidental duplicate that silently drops an icon.
    expect(new Set(names).size).toBe(names.length);
  });

  test.each(names)("%s renders a real 24x24 svg with currentColor stroke", (name) => {
    const svg = render(name);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(attr(svg, "viewBox")).toBe("0 0 24 24");
    expect(attr(svg, "fill")).toBe("none");
    expect(attr(svg, "stroke")).toBe("currentColor");
    expect(attr(svg, "stroke-linecap")).toBe("round");
    expect(attr(svg, "stroke-linejoin")).toBe("round");
    expect(attr(svg, "xmlns")).toBe("http://www.w3.org/2000/svg");
  });

  test.each(names)("%s uses the single shared stroke width", (name) => {
    expect(attr(render(name), "stroke-width")).toBe(String(STROKE));
  });

  test.each(names)("%s defaults to 1em so it inherits --font-scale", (name) => {
    const svg = render(name);
    expect(attr(svg, "width")).toBe(DEFAULT_SIZE);
    expect(attr(svg, "height")).toBe(DEFAULT_SIZE);
    expect(DEFAULT_SIZE).toBe("1em");
  });

  test.each(names)("%s honours an explicit size and className", (name) => {
    const svg = render(name, { size: "1.1em", className: "card-icon" });
    expect(attr(svg, "width")).toBe("1.1em");
    expect(attr(svg, "height")).toBe("1.1em");
    expect(attr(svg, "class")).toBe("icon card-icon");
  });

  test.each(names)("%s is decorative by default and readable when labelled", (name) => {
    const bare = render(name);
    expect(attr(bare, "aria-hidden")).toBe("true");
    expect(attr(bare, "role")).toBeUndefined();
    expect(bare).not.toContain("<title>");

    const labelled = render(name, { label: "Beállítások" });
    expect(attr(labelled, "aria-hidden")).toBeUndefined();
    expect(attr(labelled, "role")).toBe("img");
    expect(labelled).toContain("<title>Beállítások</title>");
  });

  test.each(names)("%s is never focusable and always carries the .icon class", (name) => {
    expect(attr(render(name), "focusable")).toBe("false");
    expect(attr(render(name), "class")).toBe("icon");
  });

  test.each(names)("%s actually draws something", (name) => {
    // An icon with no shape is an invisible hole where a glyph used to be.
    const drawn = shapes(render(name));
    expect(drawn.length).toBeGreaterThan(0);
    for (const tag of drawn) {
      expect(["path", "circle", "rect", "line", "polyline", "polygon", "ellipse"]).toContain(tag);
    }
  });

  test("an icon never leaks a hardcoded colour", () => {
    for (const name of names) {
      const svg = render(name);
      expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(svg).not.toMatch(/rgb\(/);
      expect(svg).not.toMatch(/style="/);
    }
  });

  test("getIcon resolves every registry key and rejects anything else", () => {
    for (const name of names) {
      expect(getIcon(name)).toBe(ICONS[name]);
    }
    expect(getIcon("definitely-not-an-icon")).toBeNull();
    expect(getIcon("")).toBeNull();
    // Prototype keys must not resolve to a component.
    expect(getIcon("constructor")).toBeNull();
    expect(getIcon("toString")).toBeNull();
  });

  test("getIcon is a lookup, not an eval of arbitrary input", () => {
    expect(getIcon("__proto__")).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* 2. Emoji data integrity — DO-NOT-TOUCH surface                     */
/* ------------------------------------------------------------------ */

/**
 * These are the exact strings shipped before Batch 5. They are duplicated here
 * on purpose: DEFAULT_ACTIVITIES could be "fixed" to a `{icon,label}` shape
 * and still look reasonable, and the correlation code would still compile.
 * Only a frozen copy of the old bytes catches that.
 */
const PRE_BATCH_5_ACTIVITIES = [
  "🚶 Mozgás",
  "👥 Társaság",
  "🧘 Relaxáció",
  "💻 Munka",
  "🏠 Otthon",
  "📚 Tanulás",
  "🎵 Zene",
  "🌿 Természet",
];

/** One entry as the pre-Batch-5 build would have written it to localStorage. */
function storedEntry(date: string, activities: string[], mood: number, stress: number, energy: number): Entry {
  return {
    id: `legacy-${date}`,
    date,
    mood: mood as Entry["mood"],
    stress,
    energy,
    note: "",
    tags: [],
    emotions: [],
    activities,
    reflection: { feeling: "", stressReason: "", need: "" },
    vitals: { restingHr: null, hrv: null, sleepHours: null },
    source: "manual",
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("DO NOT TOUCH — DEFAULT_ACTIVITIES labels are the correlation key", () => {
  test("byte-identical to the pre-Batch-5 list, same order, same length", () => {
    expect([...DEFAULT_ACTIVITIES]).toEqual(PRE_BATCH_5_ACTIVITIES);
  });

  test("every label is emoji-prefixed (the grid splits the icon off the label)", () => {
    // correlationGrid does `label.split(" ")[0]` to recover the icon glyph.
    // Drop the prefix and the row renders an empty icon box.
    for (const label of DEFAULT_ACTIVITIES) {
      const [icon, ...rest] = label.split(" ");
      expect(icon.length).toBeGreaterThan(0);
      // Surrogate-pair emoji (🌿) are 2 code units; a bare ASCII word is not.
      expect(icon.codePointAt(0)!).toBeGreaterThan(0x2000);
      expect(rest.join(" ").length).toBeGreaterThan(0);
    }
  });

  test("DEFAULT_EMOTIONS carry no emoji and are unchanged", () => {
    expect(DEFAULT_EMOTIONS).toEqual(["Öröm", "Nyugalom", "Hála", "Aggodalom", "Düh", "Szomorúság"]);
  });
});

describe("a PRE-BATCH-5 stored entry still correlates after the icon migration", () => {
  // 3 days tagged "🚶 Mozgás" (high mood) and 3 not tagged (low mood).
  const legacy: Entry[] = [
    storedEntry("2026-03-01", ["🚶 Mozgás", "💻 Munka"], 5, 3, 8),
    storedEntry("2026-03-02", ["🚶 Mozgás"], 4, 4, 7),
    storedEntry("2026-03-03", ["🚶 Mozgás", "🎵 Zene"], 5, 2, 9),
    storedEntry("2026-03-04", [], 2, 8, 3),
    storedEntry("2026-03-05", ["💻 Munka"], 2, 7, 4),
    storedEntry("2026-03-06", [], 3, 6, 5),
  ];

  test("buildCorrelationGrid matches the legacy activity by exact string", () => {
    const { rows } = buildCorrelationGrid({
      entries: legacy,
      customNumericTrackers: [],
      customActivities: [],
    });

    const walk = rows.find((r) => r.label === "🚶 Mozgás");
    expect(walk).toBeDefined();
    expect(walk!.isCustom).toBe(false);
    // Icon is recovered from the label prefix, unchanged from before.
    expect(walk!.icon).toBe("🚶");
    // Mood column: 3 tagged days (avg 75) vs 3 untagged (avg ~33) → clearly up.
    const mood = walk!.cells.mood;
    expect(mood.count).toBeGreaterThanOrEqual(MIN_SAMPLES);
    expect(mood.delta).toBeGreaterThan(0);
  });

  test("the grid emits rows only for activities actually present", () => {
    const { rows } = buildCorrelationGrid({
      entries: legacy,
      customNumericTrackers: [],
      customActivities: [],
    });
    const labels = rows.map((r) => r.label);
    expect(labels).toContain("🚶 Mozgás");
    expect(labels).toContain("💻 Munka");
    expect(labels).toContain("🎵 Zene");
    // Never tagged in this dataset → no row.
    expect(labels).not.toContain("🌿 Természet");
  });

  test("a label without the emoji prefix would NOT match — proving the guard bites", () => {
    // This is the failure mode the whole section exists to prevent: if
    // DEFAULT_ACTIVITIES had become `{icon,label}` pairs, the stored
    // "🚶 Mozgás" would silently match nothing and the matrix would empty.
    const stripped = ["Mozgás", "Munka", "Zene"];
    const { rows } = buildCorrelationGrid({
      entries: legacy.map((e) => ({ ...e, activities: stripped })),
      customNumericTrackers: [],
      customActivities: [],
    });
    expect(rows).toEqual([]);
  });

  test("tagCorrelations groups the legacy entries under the emoji label", () => {
    const stats = tagCorrelations(legacy);
    const walk = stats.find((s) => s.tag === "🚶 Mozgás");
    expect(walk).toBeDefined();
    expect(walk!.count).toBe(3);
    expect(walk!.delta).toBeGreaterThan(0);
    // The tag string handed to the UI is the full stored label, emoji included.
    expect(walk!.tag.startsWith("🚶 ")).toBe(true);
  });

  test("user-typed custom activity icons stay emoji and build their own rows", () => {
    const { rows } = buildCorrelationGrid({
      entries: legacy,
      customNumericTrackers: [],
      // A pre-Batch-5 custom activity, exactly as addCustomActivity stored it.
      customActivities: [{ icon: "🎨", label: "Kertészkedés" }],
    });
    // Untagged in the fixture, so it gets no row — but the label is composed
    // as `${icon} ${label}`, the same shape the store writes into entries.
    expect(rows.some((r) => r.label === "🎨 Kertészkedés")).toBe(false);

    const tagged = legacy.map((e) =>
      e.date === "2026-03-04" ? { ...e, activities: ["🎨 Kertészkedés"] } : e,
    );
    const withRow = buildCorrelationGrid({
      entries: tagged,
      customNumericTrackers: [],
      customActivities: [{ icon: "🎨", label: "Kertészkedés" }],
    });
    const row = withRow.rows.find((r) => r.label === "🎨 Kertészkedés");
    expect(row).toBeDefined();
    expect(row!.isCustom).toBe(true);
    expect(row!.icon).toBe("🎨");
  });
});

describe("DO NOT TOUCH — mood scale and achievement badge emoji", () => {
  test("mood scale emoji are unchanged and still one-per-level", () => {
    expect(MOODS.map((m) => m.emoji)).toEqual(["😖", "😕", "😐", "🙂", "😄"]);
    expect(MOODS.map((m) => m.level)).toEqual([1, 2, 3, 4, 5]);
  });

  test("mood emoji are the input to emojiToLevel, not to the icon set", () => {
    // The store persists the LEVEL NUMBER, so the glyphs are display-only —
    // but they must keep parsing, or imports/paste fall apart.
    const seen = MOODS.map((m) => m.emoji);
    for (const e of seen) expect(seen).toContain(e);
  });

  test("achievement badge icons are unchanged", () => {
    // The first twelve are the ones Batch 2 froze, and they are still the
    // first twelve in the same order. Batch 13, commit 8 APPENDED twelve more
    // rather than reordering or renaming any of these, which is what "additive"
    // has to mean for a frozen list to stay true.
    expect(BADGES.map((b) => b.id)).toEqual([
      "streak-3",
      "streak-7",
      "streak-14",
      "streak-30",
      "entries-10",
      "entries-50",
      "entries-100",
      "first-photo",
      "first-video",
      "gratitude-5",
      "cbt-5",
      "habit-7",
      "streak-60",
      "streak-100",
      "entries-365",
      "photo-10",
      "video-5",
      "gratitude-25",
      "cbt-25",
      "habit-30",
      "mood-range",
      "first-reflection",
      "first-experiment",
      "experiment-closed",
      "first-health-import",
      "first-food-ai",
      "first-pdf-export",
    ]);
    expect(BADGES.map((b) => b.icon)).toEqual([
      "🧭",
      "🔥",
      "🌿",
      "🏔️",
      "📓",
      "📚",
      "🏆",
      "📸",
      "🎬",
      "🙏",
      "🧠",
      "💧",
      "🏃",
      "⭐",
      "💙",
      "📸",
      "🎬",
      "🙏",
      "🧠",
      "👟",
      "🔁",
      "🧘",
      "🌱",
      "⬆️",
      "🩺",
      "🥗",
      "⬇️",
    ]);
  });

  test("every badge icon is one the app already ships as a glyph", () => {
    // Commit 8 added twelve badges and ZERO glyphs: a badge icon is
    // decoration, and adding twelve new emoji would have meant twelve new
    // GLYPHS entries with codepoint, Lucide and Fluent names to keep in step.
    // Reusing is what keeps the glyph set closed.
    for (const b of BADGES) {
      expect(GLYPHS.map((g) => g.glyph), b.id).toContain(b.icon);
    }
  });
});

describe("DO NOT TOUCH — user-typed icon pickers still offer emoji", () => {
  test("built-in trackers keep their emoji icons", () => {
    // By ID rather than by list position. The original assertion was
    // `toEqual` over the whole array, which also pinned the ORDER — and Batch
    // 7e has to move the weather group above its own members, so position is
    // no longer the thing being protected. What must not change is that no
    // tracker's picture changed underneath the user, and that is checkable
    // without a position. Display order is a question for `trackerGroupHeads`,
    // which is what Settings actually renders.
    const byId = new Map(TRACKERS.map((t) => [t.id, t.icon]));
    const PRE_7E: [string, string][] = [
      ["sleep", "😴"],
      ["symptoms", "🩺"],
      ["vitamins", "💊"],
      ["weather", "⛅"],
      ["nutrition", "🥗"],
    ];
    for (const [id, icon] of PRE_7E) expect(byId.get(id), id).toBe(icon);
    // What the eight added trackers have to satisfy instead: every icon a
    // tracker names is a REGISTERED glyph, so the chosen icon set can draw it.
    // Three new glyphs arrived with Batch 7e (🏃 👟 🌡️); 🔥 and 🥗 are reused.
    for (const t of TRACKERS) {
      expect(glyphDef(t.icon), `${t.id} → ${t.icon}`).toBeDefined();
    }
  });

  test("the habit icon picker still offers emoji choices", async () => {
    // ICONS lives in the component (not lib/habits) — the user picks from it and
    // the picked glyph is stored verbatim, exactly like a custom activity icon.
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../src/components/HabitStreaks.tsx", import.meta.url), "utf8");
    expect(src).toContain('const ICONS = ["💧", "🚶", "🧘", "😴", "🥗", "📚", "🚭", "☀️"]');
  });

  test("the custom-activity icon picker still offers emoji choices", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../src/components/CustomActivityManager.tsx", import.meta.url), "utf8");
    expect(src).toContain('const ICON_CHOICES = ["⭐", "🎨", "🐾", "☕", "🛠", "🎮", "📖", "🚗"]');
  });

  test("onboarding tracker choices keep their emoji icons", () => {
    expect(ONBOARDING_TRACKER_CHOICES.map((c) => c.icon)).toEqual(["😴", "🩺", "💊", "⛅"]);
  });
});

/* ------------------------------------------------------------------ */
/* 3. The UI-chrome split itself                                       */
/* ------------------------------------------------------------------ */

describe("UI chrome no longer comes from emoji", () => {
  // These are the exact files Batch 5 migrated. A regression that re-introduces
  // an emoji glyph in one of them should be caught by a human review, but the
  // cheap automated half is: the source must import from lib/icons.
  //
  // `BottomNav.tsx` is NOT in this list any more. Batch 7b moved its icon
  // decision into `NavIcon`, because the nav is the one chrome surface that
  // follows the user's chosen icon SET. It is covered by the test below, which
  // is stricter than the one it left: it asserts both that BottomNav delegates
  // and that BottomNav has no icon or emoji import of its own.
  const chromeFiles = [
    "src/components/AppHeader.tsx",
    "src/components/ui/ui.tsx",
    "src/views/TodayView.tsx",
    "src/views/JournalView.tsx",
    "src/views/InsightsView.tsx",
    "src/views/SettingsView.tsx",
    "src/components/EntryDetail.tsx",
    "src/components/CorrelationGrid.tsx",
    "src/components/AchievementsCard.tsx",
  ];

  test.each(chromeFiles)("%s draws its icons from the icon registry", async (path) => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
    // EITHER it imports the registry directly, OR it names its icons through
    // `ContentIcon`, which resolves the same registry and adds one thing: it
    // also consults the chosen icon set. Batch 7f is why the second arm exists.
    //
    // Two of these files stopped importing `lib/icons` outright — every icon in
    // `AppHeader` and in `AchievementsCard` turned out to be content, so all of
    // it went through `ContentIcon`. The guard's INTENT is "chrome draws from
    // the icon registry, never from an emoji", and both arms serve it: a bare
    // emoji in either file still fails the second `expect` below, and a
    // registry name still fails it if it is drawn by hand from a set's artwork.
    //
    // One level of delegation, same as the `NavIcon` case below. A second hop
    // would mean the chain had outgrown a check this cheap.
    //
    // It deliberately says nothing about literal emoji. Four of these files
    // hold emoji as DATA — `"🚶 Mozgás"` in `DEFAULT_ACTIVITIES`, `"⚙️"` in a
    // toast message, the mood strings themselves — and emoji in a data string
    // is exactly what the correlation grid matches on, so a blanket ban would
    // be banning the app. Whether a bare emoji ever reaches the screen as
    // chrome is checked where that question can be asked properly, by rendering
    // the component: see `tests/batch7-ui.test.ts`.
    expect(src).toMatch(
      /from "(?:\.{1,2}\/)+(?:lib\/icons|components\/ContentIcon|ContentIcon)"/,
    );
  });

  test("BottomNav may delegate to NavIcon, which is the one that imports it", async () => {
    // Batch 7b moved the bottom nav's icon decision into `NavIcon`, because the
    // nav is the one chrome surface that follows the user's chosen ICON SET and
    // so needs the set-aware branching that `GlyphIcon` deliberately does not
    // do. The guard above is still right about what it protects — chrome draws
    // from the icon registry, never from emoji — so it is generalised to follow
    // one level of delegation rather than deleted or weakened.
    //
    // One level only. A second hop would be a sign the chain had grown into
    // something this cheap check can no longer see, which is exactly when the
    // check should stop pretending it is still useful.
    const { readFileSync } = await import("node:fs");
    const bottomNav = readFileSync(
      new URL("../src/components/BottomNav.tsx", import.meta.url),
      "utf8",
    );
    expect(bottomNav).toMatch(/from "\.\/NavIcon"/);
    // It must not have grown its own emoji or icon imports on the side.
    expect(bottomNav).not.toMatch(/from "(\.\.\/)+lib\/icons"/);
    expect(bottomNav).not.toMatch(/[🌱📔🧠⚙]/u);

    const navIcon = readFileSync(
      new URL("../src/components/NavIcon.tsx", import.meta.url),
      "utf8",
    );
    expect(navIcon).toMatch(/from "\.\.\/lib\/icons"/);
  });

  test("the icon set is not referenced from the data layer", async () => {
    // lib/ has no JSX and no chrome. If icons.tsx ever leaked into the
    // correlation/analysis/store path, stored emoji could get "normalized".
    const { readFileSync } = await import("node:fs");
    for (const path of [
      "src/lib/store.ts",
      "src/lib/correlationGrid.ts",
      "src/lib/analysis.ts",
      "src/lib/mood.ts",
      "src/lib/achievements.ts",
    ]) {
      const src = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
      expect(src).not.toContain("lib/icons");
      expect(src).not.toContain('from "./icons"');
    }
  });
});

/* ------------------------------------------------------------------ */
/* 4. Note                                                            */
/* ------------------------------------------------------------------ */

/**
 * The "does a real pre-Batch-5 localStorage payload still load and re-save"
 * test lives in tests/batch5-legacy-store.test.ts, because lib/store reads
 * localStorage exactly once at module-evaluation time. Seeding it from the
 * same file that statically imports lib/store would be too late — the module
 * would already be cached and the test would silently assert nothing.
 */

