/**
 * Section order: the rule, not the content.
 *
 * `orderedTabs` (navVisibility) is the precedent this follows, and its own test
 * is the model — the value here is user-shaped data that crossed a JSON
 * boundary, so every rule exists to answer one question: what does a tab draw
 * when the blob says anything else?
 *
 * What is worth pinning, and why each of these would be a real defect if it
 * broke:
 *
 *  - a card can never go MISSING because a stored id was renamed, and can never
 *    appear TWICE because a hand-edited blob said so twice. Both are silent
 *    data loss in the UI, neither is an error, and neither throws.
 *  - a no-op move returns the SAME ARRAY REFERENCE. A caller that stores what
 *    it gets back must not write on every press of an edge arrow, and the only
 *    cheap way to be sure of that is to check identity rather than deep
 *    equality.
 */
import { describe, expect, test } from "bun:test";
import {
  moveSection,
  orderSections,
  sameOrder,
} from "../../src/lib/sectionOrder";

const DEFAULTS = ["mood", "balance", "lessons", "activities", "reflection"];

describe("orderSections", () => {
  test("no stored value means the view's own order, untouched", () => {
    expect(orderSections(DEFAULTS, undefined)).toEqual(DEFAULTS);
    expect(orderSections(DEFAULTS, null)).toEqual(DEFAULTS);
  });

  test("anything that is not an array is not an arrangement", () => {
    for (const junk of [
      "mood,balance",
      { mood: 1 },
      42,
      true,
      [Symbol("x")],
    ]) {
      expect(orderSections(DEFAULTS, junk)).toEqual(DEFAULTS);
    }
  });

  test("the user's order is honoured", () => {
    expect(orderSections(DEFAULTS, ["reflection", "mood"])).toEqual([
      "reflection",
      "mood",
      "balance",
      "lessons",
      "activities",
    ]);
  });

  test("an id no section answers to is dropped, not drawn", () => {
    // The rename case: the old name is still in the blob, the new one is not
    // there yet. Drawing the old name would render nothing at all for it.
    expect(orderSections(DEFAULTS, ["toolbox", "mood", "gone"])).toEqual([
      "mood",
      "balance",
      "lessons",
      "activities",
      "reflection",
    ]);
  });

  test("a duplicate collapses to its first occurrence", () => {
    expect(orderSections(DEFAULTS, ["reflection", "mood", "reflection"])).toEqual([
      "reflection",
      "mood",
      "balance",
      "lessons",
      "activities",
    ]);
  });

  test("missing ids are appended in default order, not left out", () => {
    // The partial-arrangement case: the reader moved two cards and the blob
    // says so. The three they did not touch keep the order the view declared.
    expect(orderSections(DEFAULTS, ["reflection", "lessons"])).toEqual([
      "reflection",
      "lessons",
      "mood",
      "balance",
      "activities",
    ]);
  });

  test("the output is always a permutation of the defaults", () => {
    // The property, over every shape of garbage. A shorter list means a card
    // the reader can no longer find; a longer one means the same card twice.
    const stored: unknown[] = [
      undefined,
      "nope",
      {},
      [],
      ["mood"],
      ["mood", "mood"],
      ["mood", "mood", "mood"],
      [...DEFAULTS].reverse(),
      [...DEFAULTS, ...DEFAULTS],
      [...DEFAULTS, "ghost", "ghost"],
      ["ghost"],
      [...DEFAULTS].reverse().slice(0, 3),
      [null, undefined, 7, {}],
      DEFAULTS.map((_, i) => i),
    ];
    for (const value of stored) {
      const out = orderSections(DEFAULTS, value);
      expect(out.length, `length for ${JSON.stringify(value)}`).toBe(
        DEFAULTS.length,
      );
      expect([...out].sort(), `contents for ${JSON.stringify(value)}`).toEqual(
        [...DEFAULTS].sort(),
      );
    }
  });

  test("it does not mutate the defaults it was handed", () => {
    const defaults = [...DEFAULTS];
    orderSections(defaults, ["reflection", "mood"]);
    expect(defaults).toEqual(DEFAULTS);
  });
});

describe("moveSection", () => {
  test("a step swaps with the neighbour", () => {
    expect(moveSection(DEFAULTS, 0, 1)).toEqual([
      "balance",
      "mood",
      "lessons",
      "activities",
      "reflection",
    ]);
    expect(moveSection(DEFAULTS, 4, -1)).toEqual([
      "mood",
      "balance",
      "lessons",
      "reflection",
      "activities",
    ]);
  });

  test("a move past either end returns THE SAME ARRAY", () => {
    // Not an equal copy: identity. A caller that stores what it gets back must
    // be able to skip the write, and that is only possible if the no-op is
    // detectable without comparing every element.
    expect(moveSection(DEFAULTS, 0, -1)).toBe(DEFAULTS);
    expect(moveSection(DEFAULTS, DEFAULTS.length - 1, 1)).toBe(DEFAULTS);
    // Out of range entirely, rather than merely at the edge.
    expect(moveSection(DEFAULTS, -1, -1)).toBe(DEFAULTS);
    expect(moveSection(DEFAULTS, 99, 1)).toBe(DEFAULTS);
  });

  test("it does not mutate the order it was handed", () => {
    const order = [...DEFAULTS];
    moveSection(order, 0, 1);
    expect(order).toEqual(DEFAULTS);
  });

  test("after re-normalising, a stored arrangement is always a permutation", () => {
    // The two functions are only useful together: the view swaps rows and
    // stores `orderSections(...)`, which is what `moveTab` does for the bar.
    let order = orderSections(DEFAULTS, ["reflection", "mood"]);
    order = orderSections(DEFAULTS, moveSection(order, 0, 1));
    expect(order.length).toBe(DEFAULTS.length);
    expect([...order].sort()).toEqual([...DEFAULTS].sort());
  });
});

describe("sameOrder", () => {
  test("an equal copy and the original are the same arrangement", () => {
    expect(sameOrder(DEFAULTS, [...DEFAULTS])).toBe(true);
    expect(sameOrder(DEFAULTS, DEFAULTS)).toBe(true);
  });

  test("any difference in any position is a difference", () => {
    expect(sameOrder(DEFAULTS, [...DEFAULTS].reverse())).toBe(false);
    expect(sameOrder(DEFAULTS, ["mood", "lessons", "balance", "activities", "reflection"])).toBe(
      false,
    );
    expect(sameOrder(DEFAULTS, DEFAULTS.slice(0, -1))).toBe(false);
    expect(sameOrder(DEFAULTS, [...DEFAULTS, "extra"])).toBe(false);
  });

  test("two empty arrangements agree", () => {
    expect(sameOrder([], [])).toBe(true);
  });

  test("it answers what the reset button needs to know", () => {
    // The button is disabled when the arrangement IS the default. An
    // arrangement produced by normalising the default must therefore compare
    // equal, or the button would light up on a tab nobody has ever touched.
    expect(sameOrder(orderSections(DEFAULTS, undefined), DEFAULTS)).toBe(true);
    expect(sameOrder(orderSections(DEFAULTS, ["ghost"]), DEFAULTS)).toBe(true);
  });
});