/**
 * The wordlist's invariants, checked as data rather than trusted as prose.
 *
 * The list's docblock makes three claims the code's correctness depends on:
 * exactly 1024 entries (the packing is ten bits per word), lowercase
 * Hungarian letters only, and — the load-bearing one — no two entries
 * collide once accents are folded. `wordsToEntropy` folds so somebody can
 * type `arany` for `arany` without hunting for the right key; if two entries
 * folded together, a code containing either would have two valid readings,
 * and the checksum would not catch it, because both readings really are
 * codes. That is why the collision check is not a nicety.
 *
 * This draft of the file is also the reason the bounds are 2-10 and not the
 * 4-8 the docblock first claimed: the claim was written by hand and the list
 * was written by hand, and they disagreed by 215 entries. A number in a
 * comment is worth exactly what a test makes it worth.
 */
import { describe, expect, test } from "bun:test";
import { BACKUP_WORDS, BACKUP_WORD_COUNT } from "../../src/lib/backupWordlist";

const fold = (word: string): string =>
  word
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const LETTERS = /^[a-záéíóöőúüű]+$/;

describe("the recovery wordlist is the list the code assumes", () => {
  test("exactly 1024 entries, and the exported count agrees", () => {
    expect(BACKUP_WORDS.length).toBe(1024);
    expect(BACKUP_WORD_COUNT).toBe(1024);
  });

  test("every entry is lowercase Hungarian letters, 2-10 of them", () => {
    const bad = BACKUP_WORDS.filter((word) => !LETTERS.test(word) || word.length < 2 || word.length > 10);
    expect(bad, `entries outside the list's own rule: ${bad.join(", ")}`).toEqual([]);
  });

  test("no entry appears twice", () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const word of BACKUP_WORDS) {
      if (seen.has(word)) duplicates.push(word);
      seen.add(word);
    }
    expect(duplicates).toEqual([]);
  });

  test("no two entries collide once accents are folded — the ambiguity guard", () => {
    const byFold = new Map<string, string[]>();
    for (const word of BACKUP_WORDS) {
      const key = fold(word);
      byFold.set(key, [...(byFold.get(key) ?? []), word]);
    }
    const collisions = [...byFold.entries()]
      .filter(([, words]) => words.length > 1)
      .map(([key, words]) => `${key}: ${words.join(" | ")}`);
    expect(collisions).toEqual([]);
  });
});
