/**
 * Programs — Phase 2, commit 1.
 *
 * The program is six weeks of content wrapped in a very small state machine,
 * and the state machine is what can go wrong: a stored gap, a second press of
 * "done", a completion after the last week, a restart that silently discards
 * progress. The content itself is pinned only where it is a promise — six
 * weeks, the three themes the batch named, one practice and one prompt each.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import {
  DEFAULT_PROGRAM_STATE,
  PROGRAMS,
  PROGRAM_STORAGE_KEY,
  activeProgram,
  completeCurrentWeek,
  currentWeek,
  currentWeekNumber,
  isProgramComplete,
  loadProgramState,
  resetPrograms,
  startProgram,
  subscribePrograms,
} from "../../src/lib/programs";

const backing: Record<string, string> = {};

beforeEach(() => {
  for (const key of Object.keys(backing)) delete backing[key];
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (key: string) => (key in backing ? backing[key]! : null),
    setItem: (key: string, value: string) => {
      backing[key] = value;
    },
    removeItem: (key: string) => {
      delete backing[key];
    },
  };
});

const PROGRAM = PROGRAMS[0]!;

describe("the program's content", () => {
  test("it is six weeks, numbered from one, with a theme, a practice and a prompt each", () => {
    expect(PROGRAM.weeks).toHaveLength(6);
    expect(PROGRAM.weeks.map((w) => w.week)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const week of PROGRAM.weeks) {
      expect(week.title.length).toBeGreaterThan(3);
      expect(week.intro.length).toBeGreaterThan(20);
      expect(week.practice.length).toBeGreaterThan(20);
      expect(week.prompt.endsWith("?")).toBe(true);
      expect(week.minutes).toBeGreaterThan(0);
    }
  });

  test("the themes the batch names are all there: body, thoughts, relationships", () => {
    const themes = PROGRAM.weeks.map((w) => w.theme);
    expect(themes).toContain("body");
    expect(themes).toContain("thoughts");
    expect(themes).toContain("relationships");
  });
});

describe("starting and advancing", () => {
  test("a fresh install has no program, and a start writes only its own key", () => {
    expect(loadProgramState()).toEqual(DEFAULT_PROGRAM_STATE);
    const state = startProgram(PROGRAM.id, "2026-10-01");
    expect(state.programId).toBe(PROGRAM.id);
    expect(state.startedOn).toBe("2026-10-01");
    expect(state.completed).toEqual([]);
    expect(Object.keys(backing)).toEqual([PROGRAM_STORAGE_KEY]);
    expect(activeProgram(state)?.id).toBe(PROGRAM.id);
    expect(currentWeekNumber(state, PROGRAM)).toBe(1);
    expect(currentWeek(state, PROGRAM)?.theme).toBe("body");
  });

  test("finishing a week advances exactly one week and records the day", () => {
    startProgram(PROGRAM.id, "2026-10-01");
    const state = completeCurrentWeek("2026-10-03");
    expect(state.completed).toEqual([1]);
    expect(state.lastCompletedOn).toBe("2026-10-03");
    expect(currentWeek(state, PROGRAM)?.week).toBe(2);
  });

  test("each press finishes exactly one week, never two", () => {
    startProgram(PROGRAM.id, "2026-10-01");
    completeCurrentWeek("2026-10-03");
    const again = completeCurrentWeek("2026-10-03");
    expect(again.completed).toEqual([1, 2]);
    // Two presses are two weeks, not one week twice: the button's label says
    // "the week's practice is done", and the list is the record of weeks.
    expect(currentWeek(again, PROGRAM)?.week).toBe(3);
  });

  test("a gap between weeks changes nothing", () => {
    startProgram(PROGRAM.id, "2026-10-01");
    completeCurrentWeek("2026-10-02");
    const late = completeCurrentWeek("2026-11-20");
    expect(late.completed).toEqual([1, 2]);
    expect(late.startedOn).toBe("2026-10-01");
  });

  test("the last week finishes the program, and finishing again is a no-op", () => {
    startProgram(PROGRAM.id, "2026-10-01");
    for (let i = 0; i < 6; i += 1) completeCurrentWeek("2026-10-10");
    const done = loadProgramState();
    expect(done.completed).toEqual([1, 2, 3, 4, 5, 6]);
    expect(isProgramComplete(done, PROGRAM)).toBe(true);
    expect(currentWeekNumber(done, PROGRAM)).toBe(PROGRAM.weeks.length + 1);
    expect(currentWeek(done, PROGRAM)).toBeUndefined();
    expect(completeCurrentWeek("2026-12-01").completed).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test("completing without a program does nothing", () => {
    expect(completeCurrentWeek("2026-10-01")).toEqual(DEFAULT_PROGRAM_STATE);
  });

  test("starting the same program again cannot lose the reader's place", () => {
    startProgram(PROGRAM.id, "2026-10-01");
    completeCurrentWeek("2026-10-02");
    const again = startProgram(PROGRAM.id, "2026-10-09");
    expect(again.startedOn).toBe("2026-10-01");
    expect(again.completed).toEqual([1]);
    expect(activeProgram(again)?.id).toBe(PROGRAM.id);
  });
});

describe("repair", () => {
  test("an unknown program id reads as no program", () => {
    backing[PROGRAM_STORAGE_KEY] = JSON.stringify({ ...DEFAULT_PROGRAM_STATE, programId: "mars" });
    expect(loadProgramState()).toEqual(DEFAULT_PROGRAM_STATE);
  });

  test("a gap in the completed list is dropped from the tail, not rendered as a hole", () => {
    backing[PROGRAM_STORAGE_KEY] = JSON.stringify({
      programId: PROGRAM.id,
      startedOn: "2026-10-01",
      completed: [1, 3],
      lastCompletedOn: "2026-10-05",
    });
    const state = loadProgramState();
    expect(state.completed).toEqual([1]);
    expect(currentWeek(state, PROGRAM)?.week).toBe(2);
  });

  test("junk weeks, negative numbers and duplicates are cleaned", () => {
    backing[PROGRAM_STORAGE_KEY] = JSON.stringify({
      programId: PROGRAM.id,
      startedOn: "nonsense",
      completed: [1, 1, 2, 2, 99, -1, "2"],
      lastCompletedOn: 42,
    });
    const state = loadProgramState();
    expect(state.completed).toEqual([1, 2]);
    expect(state.startedOn).toBe("");
    expect(state.lastCompletedOn).toBe("");
  });

  test("reset clears the key and tells subscribers", () => {
    startProgram(PROGRAM.id, "2026-10-01");
    let seen = 0;
    const unsubscribe = subscribePrograms(() => {
      seen += 1;
    });
    resetPrograms();
    unsubscribe();
    expect(seen).toBe(1);
    expect(backing[PROGRAM_STORAGE_KEY]).toBeUndefined();
    expect(loadProgramState()).toEqual(DEFAULT_PROGRAM_STATE);
  });
});
