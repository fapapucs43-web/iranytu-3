/**
 * Batch B, commit 1 — the micro-lesson card, rendered.
 *
 * WHAT THESE TESTS CAN AND CANNOT DO, and why the component is shaped the way
 * it is. This suite has no jsdom and is not going to get one (batch10,
 * batch11-collapse and full-system all say so in as many words), so:
 *
 *   - assertions run on MARKUP, not on DOM events;
 *   - `renderToStaticMarkup` runs no EFFECTS, so the `markLessonSeen` effect
 *     is not observable here — `tests/lib/micro-lessons.test.ts` already
 *     proves the store, and this file proves the card's CHOICES;
 *   - therefore the "trying it now" state is reached through the controlled
 *     `active` prop, the same controlled-or-uncontrolled shape `Collapsible`
 *     already uses for `open`.
 *
 * The one test that most deserves to exist is the last one. The design
 * decision — a dismissal is React state and disappears on reload — is only
 * protected if there is provably NOWHERE for it to be written, so that test
 * asserts the shape of the module's public API rather than pretending to
 * click a button.
 */
import { describe, expect, test, afterEach, beforeEach } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AppProvider } from "../../src/state/AppContext";
import { IconSetProvider } from "../../src/state/IconSetContext";
import MicroLessonCard from "../../src/components/MicroLessonCard";
import { QUADRANTS, QUADRANT_COLORS, QUADRANT_LABELS } from "../../src/lib/quadrant";
import * as microLessons from "../../src/lib/micro-lessons";
import type { MoodQuadrant } from "../../src/types";

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
afterEach(() => {
  for (const k of Object.keys(backing)) delete backing[k];
});

/** `ContentIcon` needs both providers: `useIconSet()` throws without them. */
const render = (node: React.ReactNode) =>
  renderToStaticMarkup(
    <AppProvider>
      <IconSetProvider>{node}</IconSetProvider>
    </AppProvider>,
  );

const card = (quadrant: MoodQuadrant | null, active = false) =>
  render(<MicroLessonCard quadrant={quadrant} active={active} />);

/** Seed the seen list so `pickLesson`'s pick is deterministic. */
function seedSeen(...ids: string[]) {
  backing["belso-iranytu-seen-lessons"] = JSON.stringify({ lessonIds: ids });
}

describe("MicroLessonCard — gating", () => {
  test("no quadrant means no card at all", () => {
    // The gate is the whole point: a day with a mood but no quadrant (energy
    // not yet recorded) must not show a lesson guessed from the mood.
    const html = card(null);
    expect(html).toBe("");
    expect(html).not.toContain("Mikro-lecke");
  });

  test("a quadrant shows exactly one lesson from that quadrant", () => {
    const quadrant: MoodQuadrant = "high-neg";
    const html = card(quadrant);
    expect(html).toContain("Mikro-lecke");

    const inQuadrant = microLessons
      .lessonsForQuadrant(quadrant)
      .map((l) => l.text);
    expect(inQuadrant.length).toBeGreaterThan(1);
    const shown = inQuadrant.filter((text) => html.includes(text));
    expect(shown).toHaveLength(1);
  });
});

describe("MicroLessonCard — the two stages", () => {
  test("the offered stage offers the two actions and shows no circle", () => {
    const html = card("low-pos");
    expect(html).toContain("Kipróbálom");
    expect(html).toContain("Kihagyom");
    expect(html).not.toContain("lesson-circle");
    expect(html).not.toContain("Kész");
  });

  test("the active stage shows the breathing circle and one way out", () => {
    const html = card("low-pos", true);
    expect(html).toContain("lesson-circle");
    expect(html).toContain("Kész");
    expect(html).not.toContain("Kipróbálom");
    expect(html).not.toContain("Kihagyom");
    // The circle is decorative: the instruction already lives in the prose, so
    // announcing it would be noise rather than information.
    expect(html).toMatch(/aria-hidden="true"/);
  });
});

describe("MicroLessonCard — the quadrant is named", () => {
  test("its Hungarian label and its colour are both present", () => {
    const quadrant: MoodQuadrant = "high-pos";
    const html = card(quadrant);
    expect(html).toContain(QUADRANT_LABELS[quadrant]);
    expect(html).toContain(QUADRANT_COLORS[quadrant]);
  });

  test("all four quadrants render, each with its own label", () => {
    for (const quadrant of QUADRANTS) {
      const html = card(quadrant);
      expect(html, quadrant).toContain("Mikro-lecke");
      expect(html, quadrant).toContain(QUADRANT_LABELS[quadrant]);
    }
    // Four quadrants, four distinct labels — a label map that collapsed would
    // otherwise pass four separate renders while telling the user nothing.
    expect(new Set(QUADRANTS.map((q) => QUADRANT_LABELS[q])).size).toBe(4);
  });
});

describe("MicroLessonCard — rotation", () => {
  test("a lesson already offered is not offered again", () => {
    const quadrant: MoodQuadrant = "low-neg";
    const pool = microLessons.lessonsForQuadrant(quadrant);
    const first = pool[0]!.id;
    // Marking all but one leaves exactly one candidate, so the pick is forced.
    seedSeen(...pool.slice(1).map((l) => l.id));
    const html = card(quadrant);
    expect(html).toContain(pool[0]!.text);
    expect(html).not.toContain(pool[1]!.text);
    expect(first).not.toBe(pool[1]!.id);
  });

  test("when every lesson is seen the card still offers one", () => {
    const quadrant: MoodQuadrant = "high-neg";
    const pool = microLessons.lessonsForQuadrant(quadrant);
    seedSeen(...pool.map((l) => l.id));
    // Exhaustion must fall back to the whole pool, NOT render an empty card:
    // an empty card would look like a broken feature.
    const html = card(quadrant);
    expect(html).toContain("Mikro-lecke");
    expect(pool.some((l) => html.includes(l.text))).toBe(true);
  });
});

describe("MicroLessonCard — the dismissal has nowhere to go", () => {
  test("the store module exposes no dismissal writer at all", () => {
    // This is the test that pins the design decision. If someone later
    // "improves" the card by persisting a dismissal, this fails by name.
    const names = Object.keys(microLessons);
    expect(names.some((n) => /dismiss/i.test(n))).toBe(false);
    expect(names).toContain("markLessonSeen");
    expect(names).toContain("resetSeenLessons");
  });

  test("the seen key holds offered lesson ids and nothing else", () => {
    const quadrant: MoodQuadrant = "low-pos";
    const pool = microLessons.lessonsForQuadrant(quadrant);
    seedSeen(pool[0]!.id);
    // Rendering writes nothing (no effects run), and the only writer the card
    // has appends a lesson id — so the blob cannot grow a "dismissed" record.
    card(quadrant);
    microLessons.markLessonSeen(pool[1]!.id);
    const blob: unknown = JSON.parse(backing["belso-iranytu-seen-lessons"]!);
    expect(Object.keys(blob as object)).toEqual(["lessonIds"]);
    expect((blob as { lessonIds: string[] }).lessonIds).toEqual([
      pool[0]!.id,
      pool[1]!.id,
    ]);
  });
});