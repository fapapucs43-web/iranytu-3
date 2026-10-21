/**
 * Batch A — the emotion vocabulary, tested against the batch's pinned list.
 * The default words are asserted id-for-id (the spec enumerates English ids),
 * while Hungarian labels are pinned where the spec fixes them (none) only as
 * "present, non-empty, unique" — the registry is the single source of truth.
 */
import { describe, expect, test } from "bun:test";
import {
  DEFAULT_EMOTION_VOCAB,
  defaultEmotionIds,
  emotionsForQuadrant,
  isDefaultEmotion,
} from "../../src/lib/emotion-vocab";
import { QUADRANTS } from "../../src/lib/migration/mood-v2";

/** The batch's pinned default ids, transcribed verbatim. */
const PINNED: Record<string, string[]> = {
  "high-neg": ["angry", "frustrated", "nervous", "anxious", "panicking", "hostile", "irritated", "overwhelmed"],
  "high-pos": ["excited", "thrilled", "energetic", "happy", "motivated", "inspired", "cheerful", "optimistic"],
  "low-neg": ["sad", "down", "lonely", "disappointed", "hopeless", "guilty", "ashamed", "empty"],
  "low-pos": ["calm", "content", "grateful", "peaceful", "comfortable", "relaxed", "safe", "loved"],
};

describe("emotion-vocab — the pinned defaults", () => {
  test("every quadrant carries exactly the spec's eight words, in order", () => {
    for (const q of QUADRANTS) {
      expect(DEFAULT_EMOTION_VOCAB[q].map((o) => o.id)).toEqual(PINNED[q]);
    }
  });

  test("every emotion has a Hungarian label, and labels are unique per quadrant", () => {
    for (const q of QUADRANTS) {
      const labels = DEFAULT_EMOTION_VOCAB[q].map((o) => o.label);
      for (const label of labels) expect(label.length).toBeGreaterThan(0);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });

  test("ids are globally unique across quadrants", () => {
    const all = [...defaultEmotionIds()];
    expect(all.length).toBe(32);
    expect(new Set(all).size).toBe(32);
  });

  test("isDefaultEmotion matches ids and Hungarian labels, case-insensitively", () => {
    expect(isDefaultEmotion("calm")).toBe(true);
    expect(isDefaultEmotion("Nyugodt")).toBe(true);
    expect(isDefaultEmotion("  SZOMORÚ  ")).toBe(true);
    expect(isDefaultEmotion("kutyáim")).toBe(false);
    expect(isDefaultEmotion("")).toBe(false);
  });
});

describe("emotion-vocab — custom emotions", () => {
  test("custom words are appended after the defaults, per quadrant", () => {
    const list = emotionsForQuadrant("low-pos", ["kutyáim", "kertészkedés"]);
    expect(list.slice(0, 8).map((o) => o.id)).toEqual(PINNED["low-pos"]);
    expect(list.slice(8).map((o) => o.id)).toEqual(["kutyáim", "kertészkedés"]);
    expect(list.length).toBe(10);
  });

  test("a custom word equal to a default id or label is dropped, not duplicated", () => {
    expect(emotionsForQuadrant("low-pos", ["calm", "Nyugodt"]).length).toBe(8);
    expect(emotionsForQuadrant("low-pos", ["calm"]).map((o) => o.id)).toEqual(PINNED["low-pos"]);
  });

  test("custom words are deduplicated and trimmed, junk dropped", () => {
    const list = emotionsForQuadrant("low-neg", ["  feszült  ", "feszült", "", "   ", 42 as unknown as string]);
    expect(list.slice(8).map((o) => o.id)).toEqual(["feszült"]);
  });

  test("the same custom word may appear in several quadrants", () => {
    expect(emotionsForQuadrant("low-pos", ["fésű"]).some((o) => o.id === "fésű")).toBe(true);
    expect(emotionsForQuadrant("high-neg", ["fésű"]).some((o) => o.id === "fésű")).toBe(true);
  });

  test("custom words carry id === label", () => {
    const custom = emotionsForQuadrant("low-pos", ["kertészkedés"]).find((o) => o.id === "kertészkedés");
    expect(custom).toEqual({ id: "kertészkedés", label: "kertészkedés" });
  });
});
