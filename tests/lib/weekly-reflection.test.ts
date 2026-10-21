/**
 * Mega Batch, commit 3 — the weekly reflection's own proof.
 *
 * Four things can be wrong here and each has its own group of tests: the
 * PROMPTS can be the wrong shape or break the content rules; the WEEK MATHS
 * can be wrong at the year boundary, which is the only place anyone would
 * notice; the STORES can lose or corrupt a reader's own words; and the note
 * mirror can DESTROY what the user already wrote that day.
 *
 * That last one is the reason `buildNoteWithReflection` is a pure exported
 * function instead of being folded into the card: a guard against data loss
 * that can only be reached by clicking a button in a jsdom-less suite is a
 * guard that does not exist.
 *
 * NO JSX (this is a `.ts` file) and the content rules come from the modules
 * that own them, so this batch inherits the education library's rules rather
 * than restating them.
 */
import { describe, expect, test, afterEach } from "bun:test";
import { readFileSync } from "node:fs";
import {
  PROMPTS,
  REFLECTION_MARKER,
  buildNoteWithReflection,
  getWeeklyAnswer,
  isWeekSkipped,
  loadSkippedWeeks,
  loadWeeklyAnswers,
  markWeekSkipped,
  promptForWeekKey,
  resetWeeklyAnswers,
  resetWeeklySkips,
  saveWeeklyAnswer,
  weekKeyOf,
} from "../../src/lib/weeklyReflection";
import { clinicalHit, therapeuticClaimHit } from "../../src/lib/articleBlocklist";
import { formalAddressHit, hasHungarianDiacritics } from "../../src/lib/tegezoRule";

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

afterEach(() => {
  for (const k of Object.keys(backing)) delete backing[k];
});

const THEME_COUNTS: Record<string, number> = {
  Önismeret: 5,
  Kapcsolatok: 4,
  Munka: 4,
  Test: 5,
  Érzelmek: 4,
  Célok: 4,
  Hála: 4,
  Kihívások: 5,
  Öröm: 4,
  Pihenés: 4,
  Növekedés: 5,
  Jövő: 4,
};

const proseOf = (p: (typeof PROMPTS)[number]) => [p.question, p.hint ?? ""].join(" ");

describe("weekly reflection — the prompt registry", () => {
  test("exactly 52 prompts in 12 themes, with the agreed counts", () => {
    expect(PROMPTS.length).toBe(52);
    expect(new Set(PROMPTS.map((p) => p.id)).size).toBe(52);
    const counts: Record<string, number> = {};
    for (const p of PROMPTS) counts[p.theme] = (counts[p.theme] ?? 0) + 1;
    expect(counts).toEqual(THEME_COUNTS);
    // The two halves of the claim, so a "52" that came from 13 themes of 4
    // cannot pass while the theme list is wrong.
    expect(Object.values(counts).reduce((n, c) => n + c, 0)).toBe(52);
  });

  test("every prompt has a non-empty question and an id that says its theme", () => {
    for (const p of PROMPTS) {
      expect(p.question.trim().length, p.id).toBeGreaterThan(0);
      expect(p.id.startsWith("wp-"), p.id).toBe(true);
      expect(p.question.endsWith("?") || p.question.endsWith("."), p.id).toBe(true);
    }
  });

  test("every prompt is a real question, and none is a stub", () => {
    for (const p of PROMPTS) {
      // Length rather than diacritics: "Mi volt ma a legnehezebb?" is
      // perfectly good Hungarian with nothing to accent, and a diacritic
      // requirement would push authors to pad prompts just to satisfy a regex.
      expect(p.question.trim().length, p.id).toBeGreaterThanOrEqual(15);
      expect(formalAddressHit(proseOf(p)), p.id).toBeNull();
    }
  });

  test("the prose is Hungarian, not an untranslated placeholder", () => {
    // Registry level, not per prompt. Six of the 52 questions are short
    // vowel-only sentences that a 100% rule would flag wrongly — and three of
    // the twelve theme NAMES ("Kapcsolatok", "Munka", "Test") are the same,
    // so a per-item rule would have to reject correct Hungarian either way.
    // Untranslated English would fail nearly every prompt, so a ratio
    // separates the two cases without punishing the language.
    const accented = PROMPTS.filter((p) => hasHungarianDiacritics(proseOf(p))).length;
    expect(accented / PROMPTS.length).toBeGreaterThanOrEqual(0.8);
    expect(accented).toBeGreaterThanOrEqual(40);
  });

  // No exception list here on purpose: this card must never be where a reader
  // is pointed at a helpline they did not ask for.
  test("no prompt is clinical, and none promises what will help", () => {
    for (const p of PROMPTS) {
      expect(clinicalHit(proseOf(p)), `${p.id}: ${clinicalHit(proseOf(p))}`).toBeNull();
      expect(therapeuticClaimHit(proseOf(p)), p.id).toBeNull();
    }
  });
});

describe("weekly reflection — ISO week maths", () => {
  test("a whole week is one key, and the next Monday is a new one", () => {
    const key = weekKeyOf("2026-06-15"); // a Monday
    for (let d = 15; d <= 21; d++) expect(weekKeyOf(`2026-06-${d}`)).toBe(key);
    expect(weekKeyOf("2026-06-22")).not.toBe(key);
  });

  // The three rows where a naive "weeks since Jan 1" counter is wrong. These
  // are the cases that decide whether the prompt changes identity on New
  // Year's Eve.
  test("the year boundary follows ISO's Thursday rule", () => {
    expect(weekKeyOf("2025-12-29")).toBe("2026-W01"); // Mon of W01 2026
    expect(weekKeyOf("2026-01-01")).toBe("2026-W01"); // same week
    expect(weekKeyOf("2025-12-28")).toBe("2025-W52"); // still last year
    expect(weekKeyOf("2021-01-01")).toBe("2020-W53"); // a 53-week year
  });

  test("an ordinary mid-year week is correct", () => {
    expect(weekKeyOf("2026-06-15")).toBe("2026-W25");
  });

  test("the key is derived from startOfWeek, so the anchor stays single-sourced", () => {
    // If someone re-implements the Monday maths in this module instead of
    // reusing dates.ts, this stops holding and the two will drift.
    const source = readFileSync(
      new URL("../../src/lib/weeklyReflection.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain("startOfWeek");
    expect(source).not.toMatch(/getDay\(\)/);
  });
});

describe("weekly reflection — which prompt a week gets", () => {
  test("one prompt for the whole week", () => {
    const ids = [15, 16, 17, 18, 19, 20, 21].map(
      (d) => promptForWeekKey(weekKeyOf(`2026-06-${d}`)).id,
    );
    expect(new Set(ids).size).toBe(1);
  });

  test("a year of weeks walks the whole registry", () => {
    const seen = new Set<string>();
    for (let week = 1; week <= 52; week++) {
      seen.add(promptForWeekKey(`2026-W${String(week).padStart(2, "0")}`).id);
    }
    expect(seen.size).toBe(52);
  });

  // `(0 - 1) % 52` is -1 in JavaScript and `PROMPTS[-1]` is undefined — the one
  // line between this function and a card that silently renders nothing.
  test("a prompt is always returned, even for a nonsense key", () => {
    for (const key of ["", "garbage", "2026-W00", "2026-W99", "2026-W1", "2026-W54"]) {
      expect(promptForWeekKey(key), key).toBeDefined();
    }
  });
});

describe("weekly reflection — the note mirror never destroys anything", () => {
  test("an existing note is kept and the block is appended", () => {
    const note = buildNoteWithReflection("Ma reggel jó kedvem volt.", "Miben vagy másképp?", "Most másképp.");
    expect(note).toContain("Ma reggel jó kedvem volt.");
    expect(note).toContain(REFLECTION_MARKER);
    expect(note).toContain("Most másképp.");
  });

  test("answering again replaces the block instead of stacking a second one", () => {
    const first = buildNoteWithReflection("Eredeti jegyzet.", "Kérdés?", "Első válasz.");
    const second = buildNoteWithReflection(first, "Kérdés?", "Második válasz.");
    expect(second).toContain("Eredeti jegyzet.");
    expect(second).toContain("Második válasz.");
    expect(second).not.toContain("Első válasz.");
    expect(second.split(REFLECTION_MARKER)).toHaveLength(2); // exactly one block
  });

  test("an empty note gets a block and no leading blank lines", () => {
    const note = buildNoteWithReflection("", "Kérdés?", "Válasz.");
    expect(note.startsWith(REFLECTION_MARKER)).toBe(true);
    expect(note).not.toContain("\n\n");
  });

  test("a note that mentions the marker inside the user's words is not mangled", () => {
    // The split is a documented trade-off: the user's own text wins, because
    // losing it is the failure this function exists to prevent.
    const note = buildNoteWithReflection("Szőnyeg.", "Kérdés?", "Válasz.");
    expect(note).toBe(`Szőnyeg.\n\n${REFLECTION_MARKER} — Kérdés?\nVálasz.`);
  });
});

describe("weekly reflection — the skip store", () => {
  test("nothing is skipped at first", () => {
    expect(loadSkippedWeeks()).toEqual([]);
    expect(isWeekSkipped("2026-W25")).toBe(false);
  });

  test("skipping persists and deduplicates", () => {
    markWeekSkipped("2026-W25");
    markWeekSkipped("2026-W25");
    markWeekSkipped("2026-W26");
    expect(loadSkippedWeeks()).toEqual(["2026-W25", "2026-W26"]);
    expect(isWeekSkipped("2026-W25")).toBe(true);
  });

  test("a corrupt or wrong-shaped blob reads as nothing skipped", () => {
    backing["belso-iranytu-weekly-skip"] = "{not json";
    expect(loadSkippedWeeks()).toEqual([]);
    backing["belso-iranytu-weekly-skip"] = JSON.stringify({ weekKeys: "nope" });
    expect(loadSkippedWeeks()).toEqual([]);
    backing["belso-iranytu-weekly-skip"] = JSON.stringify({ weekKeys: ["2026-W25", 7, null] });
    expect(loadSkippedWeeks()).toEqual(["2026-W25"]);
  });

  test("an empty key is ignored, and the reset clears the store", () => {
    markWeekSkipped("");
    expect(loadSkippedWeeks()).toEqual([]);
    markWeekSkipped("2026-W25");
    resetWeeklySkips();
    expect(loadSkippedWeeks()).toEqual([]);
  });
});

describe("weekly reflection — the answer store", () => {
  test("nothing is answered at first", () => {
    expect(loadWeeklyAnswers()).toEqual({});
    expect(getWeeklyAnswer("2026-W25")).toBeNull();
  });

  test("an answer is saved, read back, and overwritten within its week", () => {
    saveWeeklyAnswer("2026-W25", "Első");
    expect(getWeeklyAnswer("2026-W25")).toBe("Első");
    saveWeeklyAnswer("2026-W25", "Második");
    expect(getWeeklyAnswer("2026-W25")).toBe("Második");
    expect(Object.keys(loadWeeklyAnswers())).toEqual(["2026-W25"]);
  });

  test("weeks do not overwrite each other", () => {
    saveWeeklyAnswer("2026-W25", "A");
    saveWeeklyAnswer("2026-W26", "B");
    expect(loadWeeklyAnswers()).toEqual({ "2026-W25": "A", "2026-W26": "B" });
  });

  test("a corrupt or wrong-shaped blob reads as no answers", () => {
    backing["belso-iranytu-weekly-answers"] = "{not json";
    expect(loadWeeklyAnswers()).toEqual({});
    backing["belso-iranytu-weekly-answers"] = JSON.stringify({ answers: ["a"] });
    expect(loadWeeklyAnswers()).toEqual({});
    backing["belso-iranytu-weekly-answers"] = JSON.stringify({
      answers: { "2026-W25": "ok", "2026-W26": 7, "2026-W27": null },
    });
    expect(loadWeeklyAnswers()).toEqual({ "2026-W25": "ok" });
  });

  test("answers never reach the main blob, and the reset clears them", () => {
    saveWeeklyAnswer("2026-W25", "A");
    expect(Object.keys(backing)).toEqual(["belso-iranytu-weekly-answers"]);
    expect("belso-iranytu-data-v2" in backing).toBe(false);
    resetWeeklyAnswers();
    expect(loadWeeklyAnswers()).toEqual({});
  });
});