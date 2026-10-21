/**
 * Batch A — the context panel's registries and helpers, tested against the
 * batch's pinned option lists.
 */
import { describe, expect, test } from "bun:test";
import {
  CONTEXT_DIMENSIONS,
  CONTEXT_DIMENSION_LABELS,
  CONTEXT_OPTIONS,
  contextHasSelection,
  contextLabelsFor,
  contextOptionsFor,
} from "../../src/lib/contextOptions";

/** The batch's pinned options, transcribed verbatim. */
const PINNED = {
  withWhom: ["alone", "family", "friends", "colleagues", "strangers", "partner"],
  where: ["home", "work", "school", "outdoors", "commuting", "shop"],
  doing: ["resting", "working", "sports", "socializing", "sleeping", "eating"],
};

describe("context — the pinned dimensions", () => {
  test("the three dimensions carry exactly the spec's options, in order", () => {
    for (const dim of CONTEXT_DIMENSIONS) {
      expect(CONTEXT_OPTIONS[dim].map((o) => o.id)).toEqual(PINNED[dim]);
    }
  });

  test("dimension order is withWhom, where, doing", () => {
    expect([...CONTEXT_DIMENSIONS]).toEqual(["withWhom", "where", "doing"]);
  });

  test("every dimension has a Hungarian heading", () => {
    for (const dim of CONTEXT_DIMENSIONS) {
      expect(CONTEXT_DIMENSION_LABELS[dim].length).toBeGreaterThan(0);
    }
  });

  test("every option has a Hungarian label, unique within its dimension", () => {
    for (const dim of CONTEXT_DIMENSIONS) {
      const labels = CONTEXT_OPTIONS[dim].map((o) => o.label);
      for (const label of labels) expect(label.length).toBeGreaterThan(0);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });

  test("contextOptionsFor mirrors the registry", () => {
    expect(contextOptionsFor("where")).toEqual(CONTEXT_OPTIONS.where);
  });
});

describe("context — label mapping", () => {
  test("ids map to their Hungarian labels", () => {
    expect(contextLabelsFor("where", ["home", "school"])).toEqual(["Otthon", "Iskola"]);
  });

  test("unknown ids pass through only when they are non-empty strings", () => {
    expect(contextLabelsFor("where", ["buli", ""])).toEqual(["buli"]);
    expect(contextLabelsFor("where", [42 as unknown as string, null as unknown as string])).toEqual([]);
  });

  test("an empty selection maps to an empty list", () => {
    expect(contextLabelsFor("doing", [])).toEqual([]);
  });
});

describe("context — selection helper", () => {
  test("any dimension with a selection counts", () => {
    expect(contextHasSelection({ withWhom: ["Egyedül"] })).toBe(true);
    expect(contextHasSelection({ where: ["Otthon"], doing: [] })).toBe(true);
    expect(contextHasSelection({ doing: ["Pihenés"] })).toBe(true);
  });

  test("empty, missing and undefined contexts all read as empty", () => {
    expect(contextHasSelection({})).toBe(false);
    expect(contextHasSelection({ withWhom: [], where: [], doing: [] })).toBe(false);
    expect(contextHasSelection(undefined)).toBe(false);
  });
});
