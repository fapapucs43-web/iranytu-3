/**
 * Batch B, step 1 — the micro-lesson registry and its rotation.
 *
 * The registry is user-facing therapeutic content, so the tests here read it
 * the way a reviewer would: the shape (24 lessons, 6 per quadrant, Hungarian
 * prose), the mapping (a quadrant must never surface another quadrant's
 * lesson), the rotation (unseen first, random when exhausted) and the
 * persistence (its own key, tolerant of a corrupt blob).
 *
 * There is no need to cache-bust a module here: `micro-lessons.ts` is
 * stateless — it reads localStorage on every call, exactly as the
 * achievements seen-flags do — so a fresh registry import sees whatever this
 * file writes. Only a `window` stub is installed, for parity with the
 * browser, and it is removed afterwards so the rest of the suite is unaffected.
 */
import { describe, expect, test, afterEach } from "bun:test";
import {
  MICRO_LESSONS,
  lessonsForQuadrant,
  pickLesson,
  loadSeenLessons,
  markLessonSeen,
  resetSeenLessons,
} from "../../src/lib/micro-lessons";
import { QUADRANTS } from "../../src/lib/quadrant";

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

/* ----------------------------- the registry ----------------------------- */

describe("micro-lessons — registry integrity", () => {
  test("there are exactly 24 lessons", () => {
    expect(MICRO_LESSONS.length).toBe(24);
  });

  test("every quadrant carries exactly 6 lessons", () => {
    for (const quadrant of QUADRANTS) {
      expect(lessonsForQuadrant(quadrant).length, quadrant).toBe(6);
    }
  });

  test("the registry maps onto the quadrant model with nothing left over", () => {
    const mapped = MICRO_LESSONS.flatMap((l) => lessonsForQuadrant(l.quadrant));
    expect(new Set(mapped.map((l) => l.id)).size).toBe(24);
  });

  test("ids are unique and carry their quadrant as a prefix", () => {
    const ids = MICRO_LESSONS.map((l) => l.id);
    expect(new Set(ids).size).toBe(24);
    for (const lesson of MICRO_LESSONS) {
      const prefix = lesson.id.split("-")[0]!;
      const expected = { "high-neg": "hn", "high-pos": "hp", "low-neg": "ln", "low-pos": "lp" }[
        lesson.quadrant
      ]!;
      expect(prefix, lesson.id).toBe(expected);
    }
  });

  test("every lesson is 2-3 sentences of real prose", () => {
    for (const lesson of MICRO_LESSONS) {
      const sentences = lesson.text.split(/[.!?]+\s?/).filter((s) => s.trim().length > 0);
      expect(sentences.length, lesson.id).toBeGreaterThanOrEqual(2);
      expect(sentences.length, lesson.id).toBeLessThanOrEqual(3);
    }
  });

  test("every lesson is Hungarian prose a reviewer can edit, no empty strings", () => {
    for (const lesson of MICRO_LESSONS) {
      // Hungarian-specific letters that must appear across the registry.
      expect(lesson.text.trim().length, lesson.id).toBeGreaterThan(60);
      expect(lesson.text, lesson.id).toMatch(/[őűáéíóöúü]/);
      expect(lesson.text.startsWith(" ") || lesson.text.endsWith(" "), lesson.id).toBe(false);
      expect(lesson.text, lesson.id).not.toContain("TODO");
    }
  });

  test("no lesson prescribes, diagnoses or mentions the app's data model", () => {
    for (const lesson of MICRO_LESSONS) {
      expect(lesson.text, lesson.id).not.toMatch(/diagnózis|betegség|gyógyszer|quadrant|blob/i);
    }
  });

  test("high-neg works on parasympathetic activation, grounding and breath", () => {
    const words = lessonsForQuadrant("high-neg").map((l) => l.text).join(" ");
    for (const topic of ["kilégzés", "figyelmed", "feszítsd"]) {
      expect(words.toLowerCase(), topic).toContain(topic);
    }
  });

  test("low-neg works on self-compassion, gentle activation and rest", () => {
    const words = lessonsForQuadrant("low-neg").map((l) => l.text).join(" ");
    for (const topic of ["magadnak", "két perc", "pihenő"]) {
      expect(words.toLowerCase(), topic).toContain(topic);
    }
  });

  test("high-pos works on savoring, sharing and gratitude", () => {
    const words = lessonsForQuadrant("high-pos").map((l) => l.text).join(" ");
    for (const topic of ["fotós", "megoszt", "hála"]) {
      expect(words.toLowerCase(), topic).toContain(topic);
    }
  });

  test("low-pos works on body awareness, presence and safety", () => {
    const words = lessonsForQuadrant("low-pos").map((l) => l.text).join(" ");
    for (const topic of ["tested", "lassan", "biztonságban"]) {
      expect(words.toLowerCase(), topic).toContain(topic);
    }
  });
});

/* ------------------------------ the mapping ------------------------------ */

describe("micro-lessons — lessonsForQuadrant", () => {
  test("a quadrant never receives another quadrant's lesson", () => {
    for (const quadrant of QUADRANTS) {
      for (const lesson of lessonsForQuadrant(quadrant)) {
        expect(lesson.quadrant, lesson.id).toBe(quadrant);
      }
    }
  });

  test("an unknown quadrant yields nothing rather than a crash", () => {
    const rogue = "no-such-quadrant" as unknown as Parameters<typeof lessonsForQuadrant>[0];
    expect(lessonsForQuadrant(rogue)).toEqual([]);
    expect(pickLesson(rogue, [])).toBeNull();
  });
});

/* ------------------------------ the rotation ----------------------------- */

describe("micro-lessons — pickLesson rotation", () => {
  test("with nothing seen, the deterministic rng drives the pick", () => {
    const pick = pickLesson("high-neg", [], () => 0);
    expect(pick?.id).toBe("hn-legzes-46");
  });

  test("a seen lesson is never picked while unseen ones remain", () => {
    const rng = () => 0; // would pick the first lesson if the pool were not filtered
    const pick = pickLesson("high-neg", ["hn-legzes-46"], rng);
    expect(pick).not.toBeNull();
    expect(pick!.id).not.toBe("hn-legzes-46");
    expect(lessonsForQuadrant("high-neg")).toContain(pick!);
  });

  test("the rotation walks the unseen pool in order, then starts over", () => {
    const rng = () => 0;
    const seen: string[] = [];
    const order: string[] = [];
    for (let i = 0; i < 6; i++) {
      const pick = pickLesson("high-neg", seen, rng);
      expect(pick).not.toBeNull();
      order.push(pick!.id);
      seen.push(pick!.id);
    }
    // Six distinct lessons before anything repeats.
    expect(new Set(order).size).toBe(6);
    const seventh = pickLesson("high-neg", seen, rng);
    expect(seventh!.id).toBe(order[0]!);
  });

  test("when every lesson is seen, a random one is returned — never null", () => {
    const all = lessonsForQuadrant("low-pos").map((l) => l.id);
    const pick = pickLesson("low-pos", all, () => 0.999);
    expect(pick).not.toBeNull();
    expect(all).toContain(pick!.id);
  });

  test("ids the registry no longer knows do not break the rotation", () => {
    const pick = pickLesson("high-pos", ["retired-lesson-id", "retired-too"], () => 0);
    expect(pick).not.toBeNull();
    expect(lessonsForQuadrant("high-pos")).toContain(pick!);
  });
});

/* -------------------------- the seen-lesson store ------------------------ */

describe("micro-lessons — seen-lesson storage", () => {
  test("an empty device reports no seen lessons", () => {
    expect(loadSeenLessons()).toEqual([]);
  });

  test("markLessonSeen persists under its own key in the agreed shape", () => {
    markLessonSeen("hn-legzes-46");
    expect(Object.keys(backing)).toEqual(["belso-iranytu-seen-lessons"]);
    expect(JSON.parse(backing["belso-iranytu-seen-lessons"]!)).toEqual({
      lessonIds: ["hn-legzes-46"],
    });
    expect(loadSeenLessons()).toEqual(["hn-legzes-46"]);
  });

  test("marking twice does not duplicate, and several lessons accumulate", () => {
    markLessonSeen("hn-legzes-46");
    markLessonSeen("hn-legzes-46");
    markLessonSeen("ln-bara-onmagadhoz");
    const seen = loadSeenLessons();
    expect(seen.filter((id) => id === "hn-legzes-46").length).toBe(1);
    expect(seen).toContain("ln-bara-onmagadhoz");
  });

  test("a corrupt blob reads as empty instead of throwing", () => {
    backing["belso-iranytu-seen-lessons"] = "{not json";
    expect(loadSeenLessons()).toEqual([]);
  });

  test("a well-formed blob with the wrong shape reads as empty", () => {
    backing["belso-iranytu-seen-lessons"] = JSON.stringify(["hn-legzes-46"]);
    expect(loadSeenLessons()).toEqual([]);
    backing["belso-iranytu-seen-lessons"] = JSON.stringify({ lessonIds: "hn-legzes-46" });
    expect(loadSeenLessons()).toEqual([]);
  });

  test("junk rows inside lessonIds are dropped, good ones survive", () => {
    backing["belso-iranytu-seen-lessons"] = JSON.stringify({
      lessonIds: ["hn-legzes-46", 42, null, { bad: true }],
    });
    expect(loadSeenLessons()).toEqual(["hn-legzes-46"]);
  });

  test("markLessonSeen ignores an empty id", () => {
    markLessonSeen("");
    expect(loadSeenLessons()).toEqual([]);
  });

  test("resetSeenLessons clears the key entirely", () => {
    markLessonSeen("hp-beeles-30mp");
    expect(loadSeenLessons()).toEqual(["hp-beeles-30mp"]);
    resetSeenLessons();
    expect(loadSeenLessons()).toEqual([]);
    expect(backing["belso-iranytu-seen-lessons"]).toBeUndefined();
  });
});
