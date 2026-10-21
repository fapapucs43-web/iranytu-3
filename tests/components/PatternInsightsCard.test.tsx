/**
 * Batch B, commit 4 — the pattern-insights card, rendered.
 *
 * Same constraints as the other component tests: no jsdom, so assertions run on
 * MARKUP, and `renderToStaticMarkup` runs no effects. None of that matters for
 * this card — it has no state and no effect, it just renders what the module
 * returns — so the whole of its behaviour is reachable from here, and the
 * arithmetic behind it is pinned separately in `tests/lib/pattern-insights.test.ts`.
 *
 * What these tests are really for is the WIRING: that the card is given the
 * whole journal, that its empty state is the module's own copy rather than a
 * second set of words, and that the sentence on screen is never a causal claim.
 */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AppProvider } from "../../src/state/AppContext";
import { IconSetProvider } from "../../src/state/IconSetContext";
import PatternInsightsCard from "../../src/components/PatternInsightsCard";
import {
  INSUFFICIENT_DATA_HINT,
  INSUFFICIENT_DATA_TITLE,
  causalHit,
  generateInsights,
} from "../../src/lib/patternInsights";
import type { Entry } from "../../src/types";

const MONDAY = Date.UTC(2026, 0, 5);
const day = (n: number): string => new Date(MONDAY + n * 86_400_000).toISOString().slice(0, 10);

const entry = (n: number, over: Partial<Entry> = {}): Entry =>
  ({
    id: `e${n}`,
    date: day(n),
    mood: 3,
    stress: 5,
    energy: 3,
    activities: [],
    note: "",
    tags: [],
    emotions: [],
    reflection: { feeling: "", stressReason: "", need: "" },
    vitals: { restingHr: null, hrv: null, sleepHours: 8 },
    source: "manual",
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }) as Entry;

/** `ContentIcon` needs both providers; they are harmless otherwise. */
const render = (node: React.ReactNode) =>
  renderToStaticMarkup(
    <AppProvider>
      <IconSetProvider>{node}</IconSetProvider>
    </AppProvider>,
  );

const card = (entries: Entry[]) => render(<PatternInsightsCard entries={entries} />);

describe("PatternInsightsCard — the empty state", () => {
  test("an empty journal shows the module's own copy, not a second wording", () => {
    // The card must not carry its own "not enough data" sentence. The module
    // knows MIN_ENTRIES; a second copy of the number beside it would be a second
    // place for both to be wrong.
    const html = card([]);
    expect(html).toContain(INSUFFICIENT_DATA_TITLE);
    expect(html).toContain(INSUFFICIENT_DATA_HINT);
    expect(html).toContain("Minták a naplóidban");
  });

  test("too few entries reads the same as none", () => {
    const html = card([entry(0), entry(1), entry(2)]);
    expect(html).toContain(INSUFFICIENT_DATA_TITLE);
  });
});

describe("PatternInsightsCard — a populated list", () => {
  /** Four weeks, Mondays high, Sundays low, everything else in between. */
  const patterned: Entry[] = (() => {
    const out: Entry[] = [];
    for (let w = 0; w < 4; w++) {
      for (let d = 0; d < 7; d++) {
        out.push(entry(w * 7 + d, { mood: d === 0 ? 5 : d === 6 ? 1 : 3 }));
      }
    }
    return out;
  })();

  test("lists what the module found, in the module's order", () => {
    const html = card(patterned);
    const found = generateInsights(patterned);
    expect(found.length).toBeGreaterThan(0);
    for (const insight of found) expect(html).toContain(insight.text);
  });

  test("shows the confidence word and the sample behind it", () => {
    // The sample is the honest half of a confidence label. A reader who sees
    // "strong" and "3 nap" has been given the evidence, not just the verdict.
    const html = card(patterned);
    expect(html).toContain("nap alapján");
    expect(html).toMatch(/erős jel|közepes jel|gyenge jel/);
    expect(html).toContain('data-level="medium"');
  });

  test("says which set of entries it used", () => {
    // The card is given the whole journal while the charts beside it honour the
    // range selector, so a reader could otherwise be guessing. The hint settles
    // it, and the count it quotes is the count it was given.
    const html = card(patterned);
    expect(html).toContain("A teljes naplódból");
    expect(html).toContain(`${patterned.length} bejegyzésből`);
  });

  test("counts the patterns in the header", () => {
    const html = card(patterned);
    const found = generateInsights(patterned);
    expect(html).toContain(`${found.length} mintázat`);
  });

  test("renders no empty state once there is something to say", () => {
    expect(card(patterned)).not.toContain(INSUFFICIENT_DATA_TITLE);
  });
});

describe("PatternInsightsCard — the wording on screen", () => {
  test("no sentence it can render states a cause", () => {
    // The rendered markup, not the module's return value: this is what a reader
    // actually sees, and it is the last place a causal claim could get in.
    const datasets: Entry[][] = [
      (() => {
        const a: Entry[] = [];
        for (let n = 0; n < 8; n++) a.push(entry(n, { mood: 5, activities: ["Futás"] }));
        for (let n = 8; n < 16; n++) a.push(entry(n, { mood: 3 }));
        return a;
      })(),
      (() => {
        const a: Entry[] = [];
        for (let n = 0; n < 8; n++) a.push(entry(n, { mood: 2, stress: 9 }));
        for (let n = 8; n < 16; n++) a.push(entry(n, { mood: 5, stress: 2 }));
        return a;
      })(),
    ];
    for (const data of datasets) {
      const html = card(data);
      // The text nodes, with tags stripped, so the markup itself is not scanned
      // for the word "okoz" appearing in some attribute.
      const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
      expect(text.length).toBeGreaterThan(0);
      expect(causalHit(text)).toBeNull();
    }
  });

  test("keeps the disclaimer that these are correlations, not causes", () => {
    // Not decoration. This app reads a mental-health journal, and "here is a
    // pattern" must never read as "here is a diagnosis".
    const html = card(
      (() => {
        const a: Entry[] = [];
        for (let n = 0; n < 8; n++) a.push(entry(n, { mood: 5, activities: ["Futás"] }));
        for (let n = 8; n < 16; n++) a.push(entry(n, { mood: 3 }));
        return a;
      })(),
    );
    expect(html).toContain("összefüggések");
    expect(html).toContain("nem okok");
    expect(html).toContain("nem diagnózis");
  });
});
