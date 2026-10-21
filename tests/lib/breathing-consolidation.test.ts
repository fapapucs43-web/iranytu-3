/**
 * Batch 13, commit 11 — one breathing tool, with quick mode.
 *
 * The commit deletes a component, so these tests are mostly about what must
 * SURVIVE the deletion, because that is the part a merge can quietly break:
 *
 *  - The 4-4-4. `Breathwork` offered a three-phase 4-4-4 that was not a preset
 *    — `box` is 4-4-4-**4**, a different shape. Deleting the component without
 *    adding the preset would have removed a pattern a reader can reach today,
 *    with no test failing, because the pattern lived in the deleted file.
 *  - The other three presets, their order, and their phase labels. phase3 pins
 *    BREATH_PATTERNS[0] and [1] BY INDEX, so the new pattern is appended
 *    rather than inserted; this file checks that assumption explicitly instead
 *    of trusting it.
 *  - One mount, not two.
 *
 * And one thing about quick mode that is easy to get wrong: turning it off must
 * restore the pattern that was selected BEFORE, not reset to the default. A
 * reader who picked "saját", switched to quick to breathe, and switched back
 * should find their own pattern still there.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BREATH_PATTERNS,
  buildCustomPattern,
  cycleLength,
  currentPhase,
  engineStarted,
  phaseMotion,
  startEngine,
  stepEngine,
} from "../../src/lib/breathing";
import BreathingExercise from "../../src/components/BreathingExercise";

const TODAY_SRC = readFileSync("src/views/TodayView.tsx", "utf8");
// Batch 14 moved the toolbox — and with it this card — to the Eszköztár tab.
const TOOLS_SRC = readFileSync("src/views/ToolsView.tsx", "utf8");
const EXERCISE_SRC = readFileSync("src/components/BreathingExercise.tsx", "utf8");
const CSS = readFileSync("src/styles.css", "utf8");

function html(): string {
  // renderToStaticMarkup runs no effects, so this proves the IDLE render: the
  // mode control, the circle and the start button.
  return renderToStaticMarkup(createElement(BreathingExercise));
}

describe("the 4-4-4 survived the merge", () => {
  test("it is a real preset now, not a component-local array", () => {
    const p = BREATH_PATTERNS.find((x) => x.id === "444");
    expect(p).toBeDefined();
    expect(p!.phases.map((ph) => ph.label)).toEqual([
      "Lélegezz be",
      "Tartsd meg",
      "Fújd ki",
    ]);
    expect(p!.phases.map((ph) => ph.seconds)).toEqual([4, 4, 4]);
  });

  test("it is three phases, which is what distinguishes it from box", () => {
    // `box` is 4-4-4-4. If the 4-4-4 were folded into it, a reader who used the
    // shorter pattern would silently get a closing hold they never asked for.
    const box = BREATH_PATTERNS.find((x) => x.id === "box")!;
    const quick = BREATH_PATTERNS.find((x) => x.id === "444")!;
    expect(box.phases.length).toBe(4);
    expect(quick.phases.length).toBe(3);
    expect(cycleLength(box)).toBe(16);
    expect(cycleLength(quick)).toBe(12);
  });

  test("it is appended, so the index-based tests still point where they did", () => {
    expect(BREATH_PATTERNS[0]!.id).toBe("478");
    expect(BREATH_PATTERNS[1]!.id).toBe("box");
    expect(BREATH_PATTERNS[BREATH_PATTERNS.length - 1]!.id).toBe("444");
  });

  test("it runs: the engine steps a whole 4-4-4 cycle", () => {
    const p = BREATH_PATTERNS.find((x) => x.id === "444")!;
    let s = startEngine(p);
    expect(currentPhase(p, s).label).toBe("Lélegezz be");
    s = stepEngine(p, s, 4);
    expect(currentPhase(p, s).label).toBe("Tartsd meg");
    s = stepEngine(p, s, 4);
    expect(currentPhase(p, s).label).toBe("Fújd ki");
    s = stepEngine(p, s, 4);
    expect(currentPhase(p, s).label).toBe("Lélegezz be");
    expect(s.cycles).toBe(1);
  });

  test("phaseMotion classifies all three of its phases", () => {
    const p = BREATH_PATTERNS.find((x) => x.id === "444")!;
    expect(phaseMotion(p.phases[0]!)).toBe(1);
    expect(phaseMotion(p.phases[1]!)).toBe(0);
    expect(phaseMotion(p.phases[2]!)).toBe(-1);
  });
});

describe("there is one tool, not two", () => {
  test("the duplicate component is gone from the tree", () => {
    // `Breathwork` had its own PHASES array, its own setInterval, and a
    // setPhaseIdx call made INSIDE a setRemaining updater — a side effect in a
    // reducer position, which React may run twice and which read a stale
    // closure. The pure engine exists so that does not have to happen.
    expect(() => readFileSync("src/components/Breathwork.tsx", "utf8")).toThrow();
  });

  test("the Eszköztár tab mounts the survivor exactly once", () => {
    expect(TOOLS_SRC.includes("<BreathingExercise />")).toBe(true);
    expect((TOOLS_SRC.match(/<BreathingExercise \/>/g) ?? []).length).toBe(1);
    // ...and the tab it left draws it nowhere, so "exactly once" is about the
    // app and not only about the file the card now lives in.
    expect(TODAY_SRC.includes("<BreathingExercise />")).toBe(false);
    expect(TOOLS_SRC.includes("Breathwork")).toBe(false);
  });

  test("the component no longer has its own phase table", () => {
    // A second copy of the timings is exactly what the merge removed.
    expect(EXERCISE_SRC.includes("const PHASES")).toBe(false);
    expect(EXERCISE_SRC.includes('setPhaseIdx')).toBe(false);
  });

  test("the CSS the duplicate owned is gone with it", () => {
    // batch12-css already fails on an orphaned class; this says WHY those three
    // were allowed to disappear rather than leaving a reader to guess.
    expect(CSS.includes(".breathwork")).toBe(false);
    expect(CSS.includes(".breath-in")).toBe(false);
    expect(CSS.includes(".breath-out")).toBe(false);
    // The circle itself is shared and stays.
    expect(CSS.includes(".breath-circle")).toBe(true);
  });

  test("no state update happens inside a state updater", () => {
    // The defect the consolidation deletes. A setX call nested in the callback
    // of setY is a side effect in a position React may invoke twice.
    expect(EXERCISE_SRC).not.toMatch(/setState\(\(s\) =>[^}]*\bset[A-Z]\w*\(/);
    expect(EXERCISE_SRC).not.toMatch(/setRemaining\(\(r\) =>[^}]*\bset[A-Z]\w*\(/);
  });
});

describe("quick mode", () => {
  test("it offers both modes and starts in the full one", () => {
    const out = html();
    expect(out.includes("Gyors mód")).toBe(true);
    expect(out.includes("Minta választás")).toBe(true);
    // Idle render shows the pattern picker — quick mode is opt-in.
    expect(out.includes("pill-cloud")).toBe(true);
  });

  test("quick mode pins the 4-4-4 by id", () => {
    expect(EXERCISE_SRC).toContain('BREATH_PATTERNS.find((p) => p.id === "444")');
  });

  test("switching mode resets the engine rather than carrying it over", () => {
    // The engine counts seconds in ONE pattern's phases; carrying it across
    // would open the session claiming a cycle it is not in.
    expect(EXERCISE_SRC).toContain("setState(startEngine(nextQuick ? QUICK_PATTERN : pattern))");
    expect(EXERCISE_SRC).toContain("setRunning(false)");
  });

  test("the picker is hidden in quick mode, not disabled", () => {
    // A visible-but-inert control advertises a choice that is not there.
    expect(EXERCISE_SRC).toContain("{!quick && (");
  });

  test("the custom builder is untouched and still reachable in full mode", () => {
    expect(html().includes("Saját")).toBe(true);
    expect(EXERCISE_SRC).toContain('htmlFor="br-in"');
    expect(EXERCISE_SRC).toContain("buildCustomPattern");
  });

  test("quick mode still describes what is running", () => {
    // Quiet mode is not a silent one: the note under the circle names the
    // pattern and its hint instead of the raw phase lengths.
    expect(EXERCISE_SRC).toContain("active.label");
    expect(EXERCISE_SRC).toContain("active.hint");
  });
});

describe("the presets that were already there", () => {
  test("there are four now and none lost a phase", () => {
    expect(BREATH_PATTERNS.length).toBe(4);
    for (const p of BREATH_PATTERNS) {
      expect(p.phases.length, p.id).toBeGreaterThan(1);
      for (const ph of p.phases) {
        expect(ph.label, p.id).not.toContain("kiure");
        expect(ph.label.trim(), p.id).toBe(ph.label);
      }
    }
  });

  test("a custom pattern is still buildable and still skips zero-length phases", () => {
    expect(buildCustomPattern(4, 0, 6, 0).phases.map((p) => p.label)).toEqual([
      "Lélegezz be",
      "Fújd ki",
    ]);
  });
});

/* ================================================================== */
/* engineStarted — the predicate the pause control stands on          */
/* ================================================================== */

describe("engineStarted says whether a session has actually begun", () => {
  const box = BREATH_PATTERNS[0]!;

  test("a fresh engine has not started", () => {
    expect(engineStarted(box, startEngine(box))).toBe(false);
  });

  test("one tick of the first phase counts as started", () => {
    // The case the naive `cycles > 0` predicate gets wrong: a 7-second first
    // phase is still phaseIndex 0 with cycles 0 after a second.
    const one = stepEngine(box, startEngine(box), 1);
    expect(one.phaseIndex).toBe(0);
    expect(one.cycles).toBe(0);
    expect(engineStarted(box, one)).toBe(true);
  });

  test("a whole cycle counts as started", () => {
    let s = startEngine(box);
    for (let i = 0; i < cycleLength(box); i += 1) s = stepEngine(box, s, 1);
    expect(engineStarted(box, s)).toBe(true);
  });

  test("restarting it is the only way back to false", () => {
    let s = startEngine(box);
    for (let i = 0; i < 3; i += 1) s = stepEngine(box, s, 1);
    expect(engineStarted(box, s)).toBe(true);
    expect(engineStarted(box, startEngine(box))).toBe(false);
  });

  test("it holds for every preset, not just the first", () => {
    for (const p of BREATH_PATTERNS) {
      expect(engineStarted(p, startEngine(p)), p.id).toBe(false);
      expect(engineStarted(p, stepEngine(p, startEngine(p), 1)), p.id).toBe(true);
    }
  });
});


describe("the pause control stops without resetting (regression guard)", () => {
  const SRC = "../../src/components/BreathingExercise.tsx";

  test("the pause button's handler is the stop and nothing else", () => {
    const src = readFileSync(new URL(SRC, import.meta.url), "utf8");
    // Scoped to the pause button rather than the whole file: `select` and
    // `setMode` stop AND reset, and they must — switching pattern or mode
    // carries a phase count that belongs to the old one. A whole-file regex
    // flags those two as if they were the bug.
    expect(src).toContain('className="btn btn-soft btn-block"\n          onClick={() => setRunning(false)}');
    expect(src).toContain('t("tools.breathing.pause")');
  });

  test("finish still discards, from the paused branch", () => {
    const src = readFileSync(new URL(SRC, import.meta.url), "utf8");
    expect(src).toContain('t("tools.breathing.resume")');
    expect(src).toMatch(/setState\(startEngine\(active\)\)\s*\}\s*>\s*\n\s*\{t\("tools\.breathing\.finish"\)/);
  });

  test("both timed cards were fixed the same way, not one of them", () => {
    // The two cards share a defect shape and were fixed together; a guard on
    // only one of them would have let the other drift back unnoticed.
    for (const [file, ns] of [
      ["../../src/components/BreathingExercise.tsx", "tools.breathing"],
      ["../../src/components/MeditationPicker.tsx", "meditation"],
    ] as const) {
      const src = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(src, file).toContain(`t("${ns}.pause")`);
      expect(src, file).toContain(`t("${ns}.resume")`);
    }
  });
});
