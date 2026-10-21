/**
 * Feszültség és aggodalom — the instrument's own proof.
 *
 * The module is user-facing content (seven items, four bands) plus the
 * arithmetic that turns answers into one of them, so the tests read it the way
 * a reviewer would: the shape (seven items in order, four bands over 0–21), the
 * language (non-clinical, informal, Hungarian, and silent about its own
 * instrument name), the arithmetic (exhaustively, because it is four small
 * functions and nothing else in the app reads them), and the two structural
 * claims the module's header makes in prose — it imports NOTHING, and it is
 * deliberately absent from the assessment log.
 *
 * WHY THE LANGUAGE SWEEPS LIVE HERE
 * The rules themselves live in `lib/articleBlocklist.ts` and `lib/tegezoRule.ts`,
 * never in a test, so the same regexes hold this content to the same standard as
 * the education articles and the meditations without a copy of the rule. This
 * file therefore tests the CONTENT; the card that renders it is tested with the
 * views.
 *
 * WHY EVERY SCORE IS WALKED
 * `bandFor` is a lookup over four ranges, and the interesting failures are at
 * the seams (4/5, 9/10, 14/15) and at the ends (0 and 21). A handful of spot
 * checks would miss a band that overlaps its neighbour in the middle, so the
 * suite walks all 22 totals and, separately, all 4^7 = 16384 answer sheets —
 * cheap, deterministic, and it is the strongest statement the arithmetic allows:
 * every sheet a person can produce lands in a band that contains its own score.
 *
 * NOTE: `tsconfig.json` is `include: ["src"]`, so NO test in this suite is
 * typechecked. `bun test` is the only thing standing between a typo in these
 * assertions and a silently weakened check.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  BANDS,
  INSTRUCTION,
  ITEM_COUNT,
  ITEMS,
  MAX_SCORE,
  bandFor,
  isComplete,
  isValidAnswer,
  score,
  summarize,
  type Gad7Item,
} from "../../src/lib/gad7";
import { clinicalHit } from "../../src/lib/articleBlocklist";
import { formalAddressHit, hasHungarianDiacritics } from "../../src/lib/tegezoRule";
import { DISCLAIMER, RESOURCES_TITLE } from "../../src/lib/assessments";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SOURCE = readFileSync(`${ROOT}src/lib/gad7.ts`, "utf8");
const STORE_SOURCE = readFileSync(`${ROOT}src/lib/assessmentStore.ts`, "utf8");

/**
 * The module's CODE, with its comments removed.
 *
 * The structural claims below are about what the module DOES, and the header
 * discusses exactly the things they forbid — it names `./assessmentStore` to
 * explain why this instrument is not in it, and it prints the word "diagnózis"
 * while ruling clinical vocabulary out. A sweep that could not tell prose from
 * code would fail this module for describing the rule it follows.
 */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Everything a reader can see of one item, as one searchable string. */
const itemProse = (item: Gad7Item) => `${item.text}`;
/** Everything a reader can see of one band, as one searchable string. */
const bandProse = (band: (typeof BANDS)[number]) => `${band.label} ${band.note}`;
/** Every string the module shows, in one list. */
const ALL_PROSE = [INSTRUCTION, ...ITEMS.map(itemProse), ...BANDS.map(bandProse)];

/** All 4^7 answer sheets, each as a plain array of the four allowed values. */
function everyAnswerSheet(): number[][] {
  const sheets: number[][] = [];
  const walk = (prefix: number[]) => {
    if (prefix.length === ITEM_COUNT) {
      sheets.push([...prefix]);
      return;
    }
    for (let v = 0; v <= 3; v++) walk([...prefix, v]);
  };
  walk([]);
  return sheets;
}

describe("gad7 — the instrument", () => {
  test("seven items, numbered 1..7 in the order they are asked", () => {
    expect(ITEMS.length).toBe(7);
    expect(ITEMS.map((i) => i.index)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  test("ITEM_COUNT is the length of the list, not a second number", () => {
    expect(ITEM_COUNT).toBe(ITEMS.length);
    expect(ITEM_COUNT).toBe(7);
  });

  test("MAX_SCORE is seven items × the three-point top of the scale", () => {
    expect(MAX_SCORE).toBe(ITEM_COUNT * 3);
    expect(MAX_SCORE).toBe(21);
  });

  test("no item is blank, and none is asked twice", () => {
    for (const item of ITEMS) {
      expect(item.text.trim(), `item ${item.index} is blank`).not.toBe("");
    }
    const texts = ITEMS.map((i) => i.text);
    expect(new Set(texts).size).toBe(texts.length);
  });

  test("the stem names the last two weeks and asks a question", () => {
    expect(INSTRUCTION).toContain("2 hét");
    expect(INSTRUCTION.endsWith("?")).toBe(true);
  });

  test("every item is in the app's own register — tegeződés", () => {
    for (const item of ITEMS) {
      const hit = formalAddressHit(itemProse(item));
      expect(hit, `item ${item.index} says "${hit}"`).toBeNull();
    }
    expect(formalAddressHit(INSTRUCTION)).toBeNull();
  });

  test("no item says anything clinical", () => {
    for (const item of ITEMS) {
      const hit = clinicalHit(itemProse(item));
      expect(hit, `item ${item.index} contains "${hit}"`).toBeNull();
    }
    expect(clinicalHit(INSTRUCTION)).toBeNull();
  });

  test("every item is Hungarian, diacritics and all", () => {
    for (const item of ITEMS) {
      expect(hasHungarianDiacritics(item.text), `item ${item.index}`).toBe(true);
    }
    expect(hasHungarianDiacritics(INSTRUCTION)).toBe(true);
  });

  test("no item names the instrument it was adapted from", () => {
    // "GAD-7"/"GAD" belong in exactly one place: the provenance line the card
    // prints. Putting either on an item would lend clinical authority the app
    // has not earned — the same trade `./assessments` makes with PHQ-8.
    // Word-bounded: "magad" contains the letters, and a substring sweep would
    // flag six of the seven items for saying "yourself".
    const names = /(^|[^A-Za-z])GAD(-?\d)?([^A-Za-z]|$)/;
    for (const text of ALL_PROSE) {
      expect(text, text).not.toMatch(names);
    }
    // And the pattern really does catch the name it is looking for.
    expect("GAD-7").toMatch(names);
    expect("magad").not.toMatch(names);
  });
});

describe("gad7 — the bands", () => {
  test("four bands cover 0..21 with no gap, no overlap and nothing left over", () => {
    expect(BANDS.length).toBe(4);
    expect(BANDS[0]!.min).toBe(0);
    expect(BANDS[BANDS.length - 1]!.max).toBe(MAX_SCORE);
    for (let i = 1; i < BANDS.length; i++) {
      expect(BANDS[i]!.min, `band ${i} starts where the previous ended`).toBe(BANDS[i - 1]!.max + 1);
    }
  });

  test("the cut points are the conventional 0/5/10/15", () => {
    expect(BANDS.map((b) => b.min)).toEqual([0, 5, 10, 15]);
  });

  test("each band carries a label and a note, and they are not boilerplate", () => {
    for (const band of BANDS) {
      expect(band.label.trim(), `${band.label}`).not.toBe("");
      expect(band.note.trim(), `${band.label} has no note`).not.toBe("");
    }
    expect(new Set(BANDS.map((b) => b.label)).size).toBe(BANDS.length);
    expect(new Set(BANDS.map((b) => b.note)).size).toBe(BANDS.length);
  });

  test("no band label or note says anything clinical", () => {
    for (const band of BANDS) {
      const hit = clinicalHit(bandProse(band));
      expect(hit, `band "${band.label}" contains "${hit}"`).toBeNull();
    }
  });

  test("no band label names a disorder — the labels describe, they do not diagnose", () => {
    for (const band of BANDS) {
      expect(band.label, band.label).not.toMatch(/szorongászavar|depresszió|zavar|diagnózis/i);
    }
  });

  test("every band note is in the app's own register — tegeződés", () => {
    for (const band of BANDS) {
      const hit = formalAddressHit(bandProse(band));
      expect(hit, `band "${band.label}" says "${hit}"`).toBeNull();
    }
  });

  test("the cut points are inclusive on both sides", () => {
    expect(bandFor(4).label).toBe("Nyugodt időszak");
    expect(bandFor(5).label).toBe("Enyhe feszültség");
    expect(bandFor(9).label).toBe("Enyhe feszültség");
    expect(bandFor(10).label).toBe("Közepes feszültség");
    expect(bandFor(14).label).toBe("Közepes feszültség");
    expect(bandFor(15).label).toBe("Erős feszültség");
  });
});

describe("gad7 — the arithmetic", () => {
  test("isValidAnswer accepts exactly the four values the scale allows", () => {
    for (const v of [0, 1, 2, 3]) expect(isValidAnswer(v), String(v)).toBe(true);
    for (const v of [-1, 4, 3.5, NaN, Number.MAX_SAFE_INTEGER]) {
      expect(isValidAnswer(v), String(v)).toBe(false);
    }
  });

  test("the four allowed values are the only thing the arithmetic can add up", () => {
    // The type guard is what makes `score`'s reduce safe, so the two must agree.
    for (const sheet of everyAnswerSheet().slice(0, 64)) {
      expect(sheet.every(isValidAnswer)).toBe(true);
    }
  });

  test("isComplete is true only for seven valid answers", () => {
    expect(isComplete([0, 1, 2, 3, 0, 1, 2])).toBe(true);
    expect(isComplete([3, 3, 3, 3, 3, 3, 3])).toBe(true);
    expect(isComplete([0, 0, 0, 0, 0, 0])).toBe(false);
    expect(isComplete([0, 0, 0, 0, 0, 0, 0, 0])).toBe(false);
    expect(isComplete([0, 0, 0, 0, 0, 0, 4])).toBe(false);
  });

  test("score adds the seven answers: the floor is 0 and the ceiling is 21", () => {
    expect(score([0, 0, 0, 0, 0, 0, 0])).toBe(0);
    expect(score([3, 3, 3, 3, 3, 3, 3])).toBe(MAX_SCORE);
    expect(score([1, 2, 3, 0, 1, 2, 3])).toBe(12);
  });

  test("score refuses a partial run instead of scoring five of seven answers", () => {
    expect(() => score([1, 2, 3])).toThrow();
    expect(() => score([1, 2, 3, 0, 1, 2, 3, 0])).toThrow();
    let message = "";
    try {
      score([1, 2, 3]);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("7");
    expect(message).toContain("0–3");
  });

  test("every score 0..21 lands in exactly one band", () => {
    for (let total = 0; total <= MAX_SCORE; total++) {
      const holders = BANDS.filter((b) => total >= b.min && total <= b.max);
      expect(holders.length, `${total} points has ${holders.length} bands`).toBe(1);
      expect(bandFor(total)).toBe(holders[0]);
    }
  });

  test("bandFor refuses a total the instrument cannot produce", () => {
    expect(() => bandFor(MAX_SCORE + 1)).toThrow();
    expect(() => bandFor(-1)).toThrow();
    let message = "";
    try {
      bandFor(MAX_SCORE + 1);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain(String(MAX_SCORE + 1));
  });

  test("summarize agrees with score and bandFor for all 16384 answer sheets", () => {
    const sheets = everyAnswerSheet();
    expect(sheets.length).toBe(4 ** ITEM_COUNT);
    for (const sheet of sheets) {
      const total = score(sheet);
      const band = bandFor(total);
      expect(summarize(sheet)).toEqual({ score: total, band });
    }
  });

  test("summarize gives back a band that contains the score it just computed", () => {
    const { score: total, band } = summarize([2, 2, 2, 2, 2, 0, 0]);
    expect(total).toBe(10);
    expect(total).toBeGreaterThanOrEqual(band.min);
    expect(total).toBeLessThanOrEqual(band.max);
    expect(band.label).toBe("Közepes feszültség");
  });
});

describe("gad7 — what the module does not do", () => {
  test("it imports nothing at all — no React, no DOM, no catalogue, no storage", () => {
    expect(SOURCE).not.toMatch(/^import\s/m);
    expect(SOURCE).not.toMatch(/\bfrom\s+"/);
  });

  test("it never touches the browser or the store", () => {
    expect(CODE).not.toMatch(/localStorage|sessionStorage|indexedDB|window\.|document\./);
    expect(CODE).not.toMatch(/assessmentStore/);
    expect(STORE_SOURCE).not.toMatch(/gad7/);
  });

  test("it does not copy the disclaimer or the resource list assessments owns", () => {
    // One owner per sentence: the card imports both from `./assessments`, so a
    // second copy here would be the first thing to drift out of date.
    expect(CODE).not.toContain(DISCLAIMER);
    expect(CODE).not.toContain(RESOURCES_TITLE);
    expect(CODE).not.toMatch(/diagnózis|beteg|gyógyszer|kezelés|tünet/i);
  });
});
