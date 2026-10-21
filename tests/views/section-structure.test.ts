/**
 * The views' sections, declared.
 *
 * Phase 3b turned three tabs' inline JSX into `{id, label, render}` arrays. The
 * promise of that commit was ZERO VISIBLE CHANGE, which is a claim about the
 * rendered page and was proved by rendering the page before and after and
 * comparing the bytes. This file guards the thing that survives afterwards: the
 * declaration itself.
 *
 * Why the ids are checked against the source rather than the DOM. With no
 * entries in the store, most of these sections render nothing at all — the
 * balance card, the micro-lesson and the whole year grid all return null — so a
 * DOM assertion would silently pass against three visible sections and call it
 * twelve. The declared list is what the reorder panel will show, so that is
 * what gets pinned: every id declared exactly once, in the exported order, and
 * every entry carrying a label.
 *
 * SettingsView is deliberately absent, and `PENDING` says why: its 26 blocks
 * include a modal and a conditional card, whose place in a movable list is a
 * decision, not a mechanical slice.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  INSIGHTS_SECTION_IDS,
} from "../../src/views/InsightsView";
import { JOURNAL_SECTION_IDS } from "../../src/views/JournalView";
import { TODAY_SECTION_IDS } from "../../src/views/TodayView";

const VIEWS = [
  {
    name: "TodayView",
    file: "src/views/TodayView.tsx",
    ids: TODAY_SECTION_IDS,
  },
  {
    name: "JournalView",
    file: "src/views/JournalView.tsx",
    ids: JOURNAL_SECTION_IDS,
  },
  {
    name: "InsightsView",
    file: "src/views/InsightsView.tsx",
    ids: INSIGHTS_SECTION_IDS,
  },
] as const;

function source(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

/** The ids the array actually declares, in the order it declares them. */
function declaredIds(src: string): string[] {
  return [...src.matchAll(/\bid:\s*"([a-z0-9-]+)"\s+as\s+\w+SectionId\b/g)].map(
    (m) => m[1],
  );
}

describe.each(VIEWS)("$name's sections", ({ file, ids }) => {
  const src = source(file);
  const declared = declaredIds(src);

  test("the declared array and the exported list are the same list", () => {
    expect(declared).toEqual([...ids]);
  });

  test("every id is declared exactly once", () => {
    // A duplicate would render one section twice and quietly drop the other;
    // nothing about the rendered page would look wrong.
    const seen = new Set(declared);
    expect(seen.size).toBe(declared.length);
  });

  test("every declared section carries a label", () => {
    // The label is what the reorder panel will speak and display. A section
    // that renders but has nothing to call itself would appear as a blank row.
    const entries = [...src.matchAll(/\bid:\s*"([a-z0-9-]+)"[^}]*label:\s*([^,]+),/g)];
    expect(entries.length).toBe(declared.length);
    for (const [, id, label] of entries) {
      expect(String(label).trim(), `label for ${id}`).not.toBe("");
      expect(String(label).trim(), `label for ${id}`).toMatch(/^(t\(|monthLabel\()/);
    }
  });

  test("each render is a function, so the content stays lazy", () => {
    const renders = [...src.matchAll(/\bid:\s*"([a-z0-9-]+)"[^}]*render:\s*\(\)\s*=>/g)];
    expect(renders.length).toBe(declared.length);
  });
});

describe("what Phase 3b did not do", () => {
  test("all four tabs now declare their sections, and Settings has eight", () => {
    // This test used to assert the opposite — that SettingsView was NOT yet a
    // section list — so that landing would fail something rather than go
    // unnoticed. Phase 3b2 landed it; the assertion is now the other way.
    const ids = declaredIds(source("src/views/SettingsView.tsx"));
    expect(ids).toEqual([
      "personal",
      "appearance",
      "navigation",
      "tracking",
      "reminders",
      "security",
      "data",
      "misc",
    ]);
  });

  test("the crisis card is not one of them", () => {
    // It is pinned above the list, so a group that swallowed it would move the
    // single most important thing on the tab into a movable position.
    const src = source("src/views/SettingsView.tsx");
    const pinned = src.slice(src.indexOf("<CrisisCard"));
    expect(pinned.length).toBeGreaterThan(0);
    expect(declaredIds(pinned)).toEqual([]);
  });

  test("every tab now renders its sections through SectionList", () => {
    // This test used to assert the opposite — that no view rendered
    // `SectionList` — so that 3c landing would fail something rather than go
    // unnoticed. 3b and 3b2 declared the sections and deliberately left them
    // unrendered, because a panel that offers an arrangement with no way to
    // save it is worse than no panel. The assertion is now the other way, and
    // it wants BOTH halves in every tab: the toggle that opens the panel and
    // the list that renders the sections (or the panel).
    for (const view of [...VIEWS, { file: "src/views/SettingsView.tsx" }]) {
      const src = source(view.file);
      expect(src).toContain("<ReorderToggle");
      expect(src).toContain("<SectionList");
      expect(src).toContain("setReordering");
    }
  });
});