/**
 * The seek-help tree — Phase 2, commit 2.
 *
 * This is the only decision tree in the app, and the failure that matters is
 * not cosmetic: an answer about self-harm must reach the urgent branch no
 * matter what else was answered, and the guide must never present itself as a
 * diagnosis. Both are asserted below, the first by walking every combination.
 */
import { describe, expect, test } from "bun:test";
import {
  DURATION_OPTIONS,
  EMPTY_SEEK_HELP_ANSWERS,
  IMPACT_OPTIONS,
  RISK_OPTIONS,
  SEEK_HELP_QUESTIONS,
  seekHelpAnswered,
  seekHelpResult,
  type SeekHelpAnswers,
} from "../../src/lib/seekHelp";

const DURATIONS = DURATION_OPTIONS.map((o) => o.value);
const IMPACTS = IMPACT_OPTIONS.map((o) => o.value);

describe("the questions", () => {
  test("there are exactly three, and the risk question is one of them", () => {
    expect(SEEK_HELP_QUESTIONS).toHaveLength(3);
    expect(SEEK_HELP_QUESTIONS.map((q) => q.key)).toEqual(["duration", "impact", "risk"]);
    expect(SEEK_HELP_QUESTIONS.every((q) => q.question.endsWith("?"))).toBe(true);
  });

  test("the risk question offers a plain yes and no, and no soft middle", () => {
    expect(RISK_OPTIONS.map((o) => o.value)).toEqual(["no", "yes"]);
  });

  test("nothing is answered on a fresh card, so no result is shown", () => {
    expect(seekHelpAnswered(EMPTY_SEEK_HELP_ANSWERS)).toBe(false);
    expect(seekHelpResult(EMPTY_SEEK_HELP_ANSWERS)).toBeNull();
  });
});

describe("the rules", () => {
  test("an answer about self-harm is always urgent, whatever else was said", () => {
    for (const duration of DURATIONS) {
      for (const impact of IMPACTS) {
        const answers: SeekHelpAnswers = { duration, impact, risk: "yes" };
        expect(seekHelpResult(answers)?.level, `${duration}/${impact}`).toBe("urgent");
      }
    }
  });

  test("two weeks or more, or a severe impact, points to a professional", () => {
    expect(
      seekHelpResult({ duration: "months", impact: "mild", risk: "no" })?.level,
    ).toBe("professional");
    expect(
      seekHelpResult({ duration: "days", impact: "severe", risk: "no" })?.level,
    ).toBe("professional");
    expect(
      seekHelpResult({ duration: "weeks", impact: "severe", risk: "no" })?.level,
    ).toBe("professional");
  });

  test("a couple of weeks, or a moderate daily impact, points to a conversation", () => {
    expect(seekHelpResult({ duration: "weeks", impact: "mild", risk: "no" })?.level).toBe("talk");
    expect(seekHelpResult({ duration: "days", impact: "moderate", risk: "no" })?.level).toBe("talk");
  });

  test("a few mild days is the quiet default, and it still says when to look again", () => {
    const result = seekHelpResult({ duration: "days", impact: "mild", risk: "no" });
    expect(result?.level).toBe("monitor");
    expect(result?.next).toContain("két hét");
  });

  test("every branch has a title, a body and a next step", () => {
    for (const duration of DURATIONS) {
      for (const impact of IMPACTS) {
        for (const risk of ["no", "yes"] as const) {
          const result = seekHelpResult({ duration, impact, risk });
          expect(result).not.toBeNull();
          expect(result!.title.length).toBeGreaterThan(5);
          expect(result!.body.length).toBeGreaterThan(30);
          expect(result!.next.length).toBeGreaterThan(20);
        }
      }
    }
  });

  test("the guide never names a condition or promises a cure", () => {
    const BANNED = /depresszi|szorongás\b|bipoláris|betegség|gyógy|diagnózis|zavar\b/i;
    for (const duration of DURATIONS) {
      for (const impact of IMPACTS) {
        for (const risk of ["no", "yes"] as const) {
          const result = seekHelpResult({ duration, impact, risk })!;
          const text = `${result.title} ${result.body} ${result.next}`;
          expect(text, `${duration}/${impact}/${risk}`).not.toMatch(BANNED);
        }
      }
    }
  });

  test("no phone number is written into the tree — the card renders the one list", () => {
    const text = [DURATION_OPTIONS, IMPACT_OPTIONS, RISK_OPTIONS]
      .flat()
      .map((o) => o.label)
      .join(" ");
    expect(text).not.toMatch(/\b\d{3,}/);
    for (const duration of DURATIONS) {
      const result = seekHelpResult({ duration, impact: "severe", risk: "yes" })!;
      expect(`${result.title} ${result.body} ${result.next}`).not.toMatch(/\b\d{3,}/);
    }
  });
});
