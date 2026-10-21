/**
 * Commit 4 — pattern insights.
 *
 * These are the tests for the four engines and the wording rule. The shape of
 * the suite follows the repo's: no jsdom (the card is covered separately by
 * `renderToStaticMarkup`, and several batch tests say in so many words that
 * there is not going to be one), and every number in a sentence is asserted
 * against a dataset built to produce exactly that number, so a test cannot pass
 * by the engine returning something plausible.
 */
import { describe, expect, it } from "bun:test";
import {
  CAUSAL_LANGUAGE,
  INSUFFICIENT_DATA_HINT,
  INSUFFICIENT_DATA_TITLE,
  MIN_ENTRIES,
  causalHit,
  confidenceFor,
  generateInsights,
  type PatternInsight,
} from "../../src/lib/patternInsights";
import { WEEKDAYS_SHORT, fromISODate } from "../../src/lib/dates";
import type { Entry } from "../../src/types";

/** 2026-01-05 is a Monday, so `day(0)` is one and the sweep below is readable. */
const MONDAY = Date.UTC(2026, 0, 5);
const day = (n: number): string => new Date(MONDAY + n * 86_400_000).toISOString().slice(0, 10);

type Over = Partial<Entry>;

/**
 * One entry per day, all fields explicit, in the SHAPE `Entry` really has.
 *
 * That last part is not ceremony. Sleep lives under `vitals`, and an earlier
 * version of the sleep engine read it flat off the entry — a field that does not
 * exist. It passed every test in this file, because the test helper invented the
 * same flat field, and it would have returned `null` on every real record in the
 * app. The typechecker caught it; a green suite did not. So the helper below
 * mirrors the real type, and the sleep tests pass `vitals` rather than a
 * convenient flat number.
 */
const entry = (n: number, over: Over = {}): Entry =>
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

/** Shorthand for the common case: an entry that recorded `hours` of sleep. */
const slept = (n: number, hours: number, over: Over = {}): Entry =>
  entry(n, { ...over, vitals: { restingHr: null, hrv: null, sleepHours: hours } });

/** An entry whose sleep was never recorded. */
const noSleep = (n: number, over: Over = {}): Entry =>
  entry(n, { ...over, vitals: { restingHr: null, hrv: null, sleepHours: null } });

const ids = (insights: PatternInsight[]): string[] => insights.map((i) => i.id);
const find = (insights: PatternInsight[], id: string): PatternInsight | undefined =>
  insights.find((i) => i.id === id);

/** Four whole weeks of the same daily mood, so every weekday has four samples. */
const weeksOf = (moodFor: (weekday: number) => number): Entry[] => {
  const out: Entry[] = [];
  for (let w = 0; w < 4; w++) {
    for (let d = 0; d < 7; d++) out.push(entry(w * 7 + d, { mood: moodFor(d) }));
  }
  return out;
};

describe("generateInsights — the minimum", () => {
  it("says nothing at all below MIN_ENTRIES, and does not apologise", () => {
    // The empty state is the card's job. Returning prose here would mean the
    // card has to decide what to do with a refusal, so the answer is an array.
    const almost = weeksOf(() => 3).slice(0, MIN_ENTRIES - 1);
    expect(generateInsights(almost)).toEqual([]);
  });

  it("speaks at exactly MIN_ENTRIES when a pattern supports it", () => {
    // The boundary is asserted on both sides, not just the permissive one, so a
    // change to MIN_ENTRIES cannot quietly move the floor.
    //
    // Built from the stress engine rather than the weekday one deliberately: a
    // weekday pattern needs three samples of the SAME weekday, so it cannot
    // exist inside a single seven-day prefix, while a stress pattern can — four
    // high-stress days against three low-stress ones is exactly seven entries
    // and a large enough difference to clear the floor.
    const stress: Entry[] = [
      ...Array.from({ length: 4 }, (_, n) => entry(n, { mood: 5, stress: 9 })),
      ...Array.from({ length: 3 }, (_, n) => entry(n + 4, { mood: 1, stress: 2 })),
    ];
    expect(generateInsights(stress.slice(0, MIN_ENTRIES - 1))).toEqual([]);
    expect(find(generateInsights(stress), "pattern-stress")).toBeDefined();
  });

  it("survives an empty list and an unparseable date", () => {
    // `fromISODate` is fed whatever the store holds. A bad date that made this
    // throw would take the whole analysis tab down with it.
    expect(generateInsights([])).toEqual([]);
    expect(generateInsights([entry(0, { date: "not-a-date" })])).toEqual([]);
  });

  it("ignores entries that carry no mood rather than counting them as zero", () => {
    // A zero is a real mood and a `null` is a missing one. Treating the second
    // as the first would pull every average down and invent patterns.
    const withHoles = [
      ...weeksOf((d) => (d === 0 ? 5 : 2)),
      ...[0, 1, 2].map((n) => entry(100 + n, { mood: null as unknown as number })),
    ];
    const clean = generateInsights(weeksOf((d) => (d === 0 ? 5 : 2)));
    expect(ids(generateInsights(withHoles))).toEqual(ids(clean));
  });

  it("caps the list so a long dataset cannot bury the card", () => {
    // Twelve tags, each with a large effect, so the cap is what is under test
    // rather than the number of engines.
    const many: Entry[] = [];
    for (let n = 0; n < 40; n++) {
      const tag = `T${Math.floor(n / 2)}`;
      many.push(entry(n, { activities: [tag], mood: n % 2 === 0 ? 5 : 1 }));
    }
    expect(generateInsights(many).length).toBeLessThanOrEqual(10);
  });
});

describe("activity engine", () => {
  it("names the tag and its effect when one activity really moves the mood", () => {
    const data: Entry[] = [];
    for (let n = 0; n < 8; n++) data.push(entry(n, { mood: 5, activities: ["Futás"] }));
    for (let n = 8; n < 16; n++) data.push(entry(n, { mood: 3 }));
    const insight = find(generateInsights(data), "pattern-activity");
    expect(insight).toBeDefined();
    expect(insight!.text).toContain("Futás");
    // The tag is quoted with Hungarian quotes, not ASCII ones.
    expect(insight!.text).toContain("„Futás”");
  });

  it("stays quiet on an effect too small to be worth a sentence", () => {
    // `tagCorrelations` needs |delta| >= 5 on its own weekly scale. A tag that
    // barely moves anything must not become a sentence.
    const data: Entry[] = [];
    for (let n = 0; n < 8; n++) data.push(entry(n, { mood: 3, activities: ["Olvasás"] }));
    for (let n = 8; n < 16; n++) data.push(entry(n, { mood: 3 }));
    expect(find(generateInsights(data), "pattern-activity")).toBeUndefined();
  });

  it("needs three days carrying the tag, not two", () => {
    const data: Entry[] = [];
    for (let n = 0; n < 2; n++) data.push(entry(n, { mood: 5, activities: ["Futás"] }));
    for (let n = 2; n < 16; n++) data.push(entry(n, { mood: 3 }));
    expect(find(generateInsights(data), "pattern-activity")).toBeUndefined();
  });
});

describe("sleep engine", () => {
  it("reports both the mood and the stress half of a short-sleep pattern", () => {
    const short: Entry[] = [];
    const long: Entry[] = [];
    for (let n = 0; n < 8; n++) short.push(slept(n, 5, { mood: 5, stress: 3 }));
    for (let n = 8; n < 16; n++) long.push(slept(n, 8, { mood: 2, stress: 7 }));
    const insight = find(generateInsights([...short, ...long]), "pattern-sleep");
    expect(insight).toBeDefined();
    // The 7-hour line is part of the sentence, so a reader knows the rule.
    expect(insight!.text).toContain("7 óránál rövidebb");
    expect(insight!.text).toContain("hangulatod");
    expect(insight!.text).toContain("stresszed");
    expect(insight!.sample).toBe(16);
  });

  it("reads sleep from `vitals`, the field that actually exists", () => {
    // REGRESSION. The engine once read a flat `entry.sleepHours`, which is
    // `undefined` on every real record — so it would have been silent in the app
    // forever while passing here, because the helper invented the same field.
    // This asserts the engine still speaks when sleep is recorded the real way.
    const data = [
      ...Array.from({ length: 8 }, (_, n) => slept(n, 5, { mood: 5, stress: 3 })),
      ...Array.from({ length: 8 }, (_, n) => slept(n + 8, 8, { mood: 2, stress: 7 })),
    ];
    expect(find(generateInsights(data), "pattern-sleep")).toBeDefined();
  });

  it("treats an unrecorded night as missing, not as zero hours of sleep", () => {
    // `null` is "nobody filled this in". Counting it as a short night would put
    // every unlogged evening on the "short sleep" side and invent a pattern out
    // of absent data.
    const data = [
      ...Array.from({ length: 8 }, (_, n) => slept(n, 5, { mood: 5, stress: 3 })),
      ...Array.from({ length: 8 }, (_, n) => noSleep(n + 8, { mood: 2, stress: 7 })),
    ];
    // The "long sleep" side is now empty, so there is nothing to compare.
    expect(find(generateInsights(data), "pattern-sleep")).toBeUndefined();
  });

  it("says nothing when every night is short, because there is no comparison", () => {
    // The whole point of the engine is a two-sided difference. Uniformly short
    // sleep is a different (and unsupported) claim, so it is not made.
    const allShort = Array.from({ length: 16 }, (_, n) => slept(n, 5));
    expect(find(generateInsights(allShort), "pattern-sleep")).toBeUndefined();
  });

  it("says nothing when no night was recorded at all", () => {
    const never = Array.from({ length: 16 }, (_, n) => noSleep(n));
    expect(find(generateInsights(never), "pattern-sleep")).toBeUndefined();
  });
});

describe("stress engine", () => {
  it("contrasts high-stress days with low-stress ones", () => {
    const high: Entry[] = [];
    const low: Entry[] = [];
    for (let n = 0; n < 8; n++) high.push(entry(n, { mood: 2, stress: 9 }));
    for (let n = 8; n < 16; n++) low.push(entry(n, { mood: 5, stress: 2 }));
    const insight = find(generateInsights([...high, ...low]), "pattern-stress");
    expect(insight).toBeDefined();
    // The sign must follow the data, not a fixed wording: high stress, lower mood.
    expect(insight!.text).toContain("alacsonyabb volt a hangulatod");
    expect(insight!.sample).toBe(16);
  });

  it("reads the other way round when the data does", () => {
    // The same engine must not have a preferred direction baked into the verb.
    const high: Entry[] = [];
    const low: Entry[] = [];
    for (let n = 0; n < 8; n++) high.push(entry(n, { mood: 5, stress: 9 }));
    for (let n = 8; n < 16; n++) low.push(entry(n, { mood: 2, stress: 2 }));
    const insight = find(generateInsights([...high, ...low]), "pattern-stress");
    expect(insight!.text).toContain("magasabb volt a hangulatod");
  });

  it("stays quiet when the two groups feel the same", () => {
    const flat = Array.from({ length: 16 }, (_, n) => entry(n, { mood: 3, stress: n < 8 ? 9 : 2 }));
    expect(find(generateInsights(flat), "pattern-stress")).toBeUndefined();
  });
});

describe("weekday engine", () => {
  it("speaks in Hungarian weekday words, not column-header labels", () => {
    // REGRESSION. This engine used `WEEKDAYS_SHORT` — the calendar header
    // registry — and lowercased it, so it produced "A hé napokon a legjobb a
    // hangulatod". "Hé" is a two-letter column header; it is not a word, and
    // neither "Cs" nor "Pé" is one either. The sentence is the defect, and it
    // is the one a reviewer reading Hungarian would catch first.
    const data = weeksOf((d) => (d === 0 ? 5 : d === 4 ? 1 : 3));
    const insight = find(generateInsights(data), "pattern-weekday");
    expect(insight).toBeDefined();
    expect(insight!.text).toContain("hétfői napokon");
    expect(insight!.text).toContain("pénteki napokon");

    // And explicitly: no header label may fill the slot before "napokon". A
    // plain substring check would be wrong here — "hétfői" CONTAINS the header
    // "Hé" and "pénteki" contains "Pé", so the defect's exact shape is the
    // two-word sequence "<label> napokon", and that is what is forbidden.
    for (const label of WEEKDAYS_SHORT) {
      expect(insight!.text).not.toMatch(new RegExp(`${label} napokon`, "i"));
    }
  });

  it("aligns with the weekday order the app already uses", () => {
    // Two arrays now hold weekday names — the headers and the prose forms — and
    // both are indexed by `getDay()`. The strings must differ; the ORDER must
    // not. A swap here would make every sentence name the wrong day, silently.
    //
    // The dataset gives Monday a UNIQUE best and Sunday a UNIQUE worst (every
    // other day sits in the middle), so the sentence names exactly two days and
    // a reordering of either array cannot hide behind a tie.
    const data = weeksOf((d) => (d === 0 ? 5 : d === 6 ? 1 : 3));
    const text = find(generateInsights(data), "pattern-weekday")!.text;
    expect(text).toContain("A hétfői napokon a legjobb a hangulatod");
    expect(text).toContain("a vasárnapi napokon a leggyengébb");

    // Seven names in both arrays, or one of them could be short and the
    // indexing would read past its end on the missing days.
    const byIndex = ["hétfői", "keddi", "szerdai", "csütörtöki", "pénteki", "szombati", "vasárnapi"];
    expect(byIndex).toHaveLength(7);
    expect(WEEKDAYS_SHORT).toHaveLength(7);
    // The date helper is the shared source of the index, so the bucket cannot
    // drift from the app's notion of "Monday" either.
    expect(fromISODate(day(0)).getDay()).toBe(1);
    expect(fromISODate(day(6)).getDay()).toBe(0);
  });

  it("stays silent when the spread is noise", () => {
    // REGRESSION, and the more serious of the two. This engine was the only one
    // without an effect-size floor, so it produced a sentence from ANY dataset
    // — including one whose best and worst weekdays differed by 0.6 points on a
    // 1–5 scale. A card that always speaks teaches the reader to stop reading
    // it, which costs the genuine signals printed beside it.
    const noisy = weeksOf((d) => (d === 0 ? 3.0 : 3.6));
    expect(find(generateInsights(noisy), "pattern-weekday")).toBeUndefined();
  });

  it("speaks once the spread is real", () => {
    const real = weeksOf((d) => (d === 0 ? 5 : 1));
    expect(find(generateInsights(real), "pattern-weekday")).toBeDefined();
  });

  it("needs three samples on a weekday before it compares", () => {
    // Two Mondays is a coincidence; the per-side floor is what makes twelve
    // worth saying, so a dataset with only two samples of the best day must say
    // nothing rather than generalise from them.
    const sparse = [...weeksOf(() => 3), entry(60, { mood: 5 }), entry(67, { mood: 5 })];
    expect(find(generateInsights(sparse), "pattern-weekday")).toBeUndefined();
  });
});

describe("confidence", () => {
  it("bands on the size of the whole dataset, not one comparison", () => {
    // Asserted on the boundaries themselves: 14/15 and 29/30 are where the band
    // changes, so moving a threshold cannot pass unnoticed.
    expect(confidenceFor(0)).toBe("weak");
    expect(confidenceFor(MIN_ENTRIES)).toBe("weak");
    expect(confidenceFor(14)).toBe("weak");
    expect(confidenceFor(15)).toBe("medium");
    expect(confidenceFor(29)).toBe("medium");
    expect(confidenceFor(30)).toBe("strong");
    expect(confidenceFor(400)).toBe("strong");
  });

  it("reports the confidence of the dataset it was actually given", () => {
    const data = weeksOf((d) => (d === 0 ? 5 : 1)); // 28 entries
    expect(find(generateInsights(data), "pattern-weekday")!.confidence).toBe("medium");
  });
});

describe("wording — correlational, never causal", () => {
  it("never states a cause, across every engine and every direction", () => {
    // The single most important property of this module. A mood diary cannot
    // establish causation, and a card that says "running caused this" is both
    // wrong and, for a mental-health app, potentially harmful. Every sentence
    // the module can produce is checked here.
    const datasets = [
      (() => {
        const a: Entry[] = [];
        for (let n = 0; n < 8; n++) a.push(entry(n, { mood: 5, activities: ["Futás"] }));
        for (let n = 8; n < 16; n++) a.push(entry(n, { mood: 3 }));
        return a;
      })(),
      weeksOf((d) => (d === 0 ? 5 : d === 4 ? 1 : 3)),
      (() => {
        const a: Entry[] = [];
        for (let n = 0; n < 8; n++) a.push(slept(n, 5, { mood: 5, stress: 3 }));
        for (let n = 8; n < 16; n++) a.push(slept(n, 8, { mood: 2, stress: 7 }));
        return a;
      })(),
      (() => {
        const a: Entry[] = [];
        for (let n = 0; n < 8; n++) a.push(entry(n, { mood: 2, stress: 9 }));
        for (let n = 8; n < 16; n++) a.push(entry(n, { mood: 5, stress: 2 }));
        return a;
      })(),
    ];
    const texts = datasets.flatMap((d) => generateInsights(d).map((i) => i.text));
    expect(texts.length).toBeGreaterThanOrEqual(4);
    for (const text of texts) expect(causalHit(text)).toBeNull();
  });

  it("rejects causal stems, including the inflected forms", () => {
    for (const bad of [
      "A futás okozta a jobb hangulatot.",
      "emiatt vagy sokkal jobban érezted magad",
      "Az alvás miatt javult a hangulatod",
      "A gyógyító hatás miatt",
    ]) {
      expect(causalHit(bad)).not.toBeNull();
    }
  });

  it("is scoped to generated sentences, NOT to content prose", () => {
    // WHY THIS TEST EXISTS. Checked against the 158 strings of shipped
    // Hungarian content, this rule fires once — on `ed-alvas`, "A kevés alvás
    // nemcsak fáradtságot okoz." That is physiology, not a claim about the
    // reader's own data, and rewording it would make the app worse. So the limit
    // is pinned here rather than left for the next person to discover by
    // pointing the rule at `ARTICLES` and hitting a failure.
    //
    // The rule guards the sentences this module composes. General health
    // education may state causes; a personal-data insight may not. The content
    // modules have their own, narrower guards: `articleBlocklist.ts` for medical
    // vocabulary, `tegezoRule.ts` for register.
    const generalFact = "A kevés alvás nemcsak fáradtságot okoz.";
    expect(causalHit(generalFact)).not.toBeNull();

    // And the same stem, used as the thing this rule exists to prevent: the
    // sentence this module would have produced if it mistook a co-occurrence
    // for a cause. That one must never ship.
    const personalClaim = "A futás okozta a hangulatod javulását.";
    expect(causalHit(personalClaim)).not.toBeNull();

    // Bluntness is intentional and is the safe direction: matching a stem is not
    // reading the sentence. These are false positives that cost a rewording,
    // where an under-flagging guard would let a real causal claim through.
    for (const overFlag of ["fejlesztő", "fejlesztés", "okozat", "eredményesség"]) {
      expect(causalHit(overFlag)).not.toBeNull();
    }
  });

  it("does not fire inside an unrelated word", () => {
    // The lookaround keeps a stem out of a longer Hungarian word. `\b` could not
    // do this job: JS treats every accented letter as a NON-word character, so
    // `\b` splits inside Hungarian words instead of at their edges.
    expect(CAUSAL_LANGUAGE.source).toContain("(?<![");
    for (const clean of [
      "Nincs itt ok- gond",
      "A hangulatod barátságos volt",
      "Ez egy hasznos tanács",
    ]) {
      expect(causalHit(clean)).toBeNull();
    }
  });
});

describe("numbers in the sentence", () => {
  it("writes the decimal comma Hungarian uses, and never a negative zero", () => {
    // Deliberately a NEGATIVE delta — the direction that produces the sign. The
    // magnitude is written as its size, because a "-0,0" in a mood app reads as
    // a bug to a Hungarian reader, and the direction is already carried by the
    // verb ("alacsonyabb") rather than by a minus sign.
    const stress: Entry[] = [];
    for (let n = 0; n < 8; n++) stress.push(entry(n, { mood: 3.2, stress: 9 }));
    for (let n = 8; n < 16; n++) stress.push(entry(n, { mood: 3.5, stress: 2 }));
    const text = find(generateInsights(stress), "pattern-stress")!.text;
    expect(text).toContain("0,3");
    expect(text).toContain("alacsonyabb");
    // No decimal POINT between digits (the full stop at the end of the sentence
    // is not a number) and no minus sign in front of a figure.
    expect(text).not.toMatch(/\d\.\d/);
    expect(text).not.toMatch(/-\d/);
  });
});

describe("the empty state", () => {
  it("exports its own copy, so the card and its test cannot disagree", () => {
    expect(INSUFFICIENT_DATA_TITLE).toBe("Még nincs elég adat");
    // The hint quotes MIN_ENTRIES rather than a number typed beside it.
    expect(INSUFFICIENT_DATA_HINT).toContain(String(MIN_ENTRIES));
  });
});
