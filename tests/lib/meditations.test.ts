/**
 * Mega batch, commit 3 — the guided-practice library.
 *
 * Four things are being pinned, and only one of them is about the data.
 *
 *  1. THE DURATIONS ARE REAL. `minutes` is redundant with the steps on
 *     purpose, so the two are asserted equal for every record. Without this a
 *     step table edited without its header would promise three minutes and
 *     take five — no throw, no test, just a practice that lies.
 *  2. THE TIMER IS THE EXISTING ENGINE. The card must drive `stepEngine`
 *     rather than growing its own arithmetic, so the source is scanned for a
 *     single interval and for the absence of a second stepping loop.
 *  3. THE WORDING FOLLOWS THE REPO'S OWN RULES, not a private list. The
 *     non-clinical sweep and the register sweep are imported from the two
 *     modules that own them, which is the whole point of having put them
 *     there. The clinical sweep also runs over the module's raw source,
 *     comments included: a rule that exempted comments is a rule the next
 *     content batch quietly talks its way around.
 *  4. THE LIBRARY IS TEXT. A reader asking for a practice should get steps,
 *     not a player — and an app with no media cannot have grown an audio
 *     element without someone noticing in the diff.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  MEDITATIONS,
  MEDITATION_MAX,
  MEDITATION_MIN,
  MEDITATION_STEP_MIN,
  elapsedSeconds,
  formatClock,
  meditationFinished,
  meditationPattern,
  meditationSeconds,
} from "../../src/lib/meditations";
import { startEngine, stepEngine, currentPhase } from "../../src/lib/breathing";
import { clinicalHit, therapeuticClaimHit } from "../../src/lib/articleBlocklist";
import { formalAddressHit } from "../../src/lib/tegezoRule";
import MeditationPicker from "../../src/components/MeditationPicker";

const LIB_SRC = readFileSync("src/lib/meditations.ts", "utf8");
const PICKER_SRC = readFileSync("src/components/MeditationPicker.tsx", "utf8");
const TODAY_SRC = readFileSync("src/views/TodayView.tsx", "utf8");
// Batch 14 moved the toolbox — and with it this card — to the Eszköztár tab.
const TOOLS_SRC = readFileSync("src/views/ToolsView.tsx", "utf8");

/** Everything a reader is shown, joined for the wording sweeps. */
function proseOf(m: (typeof MEDITATIONS)[number]): string {
  return [m.title, m.intro, ...m.steps.map((s) => s.label)].join(" ");
}

describe("the library", () => {
  test("there are ten, with unique ids and unique titles", () => {
    expect(MEDITATIONS.length).toBe(10);
    expect(new Set(MEDITATIONS.map((m) => m.id)).size).toBe(10);
    expect(new Set(MEDITATIONS.map((m) => m.title)).size).toBe(10);
  });

  test("they are the ten the library promised", () => {
    expect(MEDITATIONS.map((m) => m.id)).toEqual([
      "testscan",
      "breath",
      "kindness",
      "bodyscan",
      "grounding",
      "sleep",
      "focus",
      "gratitude",
      "letting-go",
      "morning",
    ]);
  });

  test("every practice sits between three and five minutes", () => {
    for (const m of MEDITATIONS) {
      expect(m.minutes, m.id).toBeGreaterThanOrEqual(MEDITATION_MIN);
      expect(m.minutes, m.id).toBeLessThanOrEqual(MEDITATION_MAX);
    }
  });

  test("the declared minutes agree with the steps", () => {
    // The redundancy is the guard. If a step table is edited without its
    // header, this fails instead of the reader discovering it.
    for (const m of MEDITATIONS) {
      expect(meditationSeconds(m), m.id).toBe(m.minutes * 60);
    }
  });

  test("no step is shorter than the floor, and none is a zero-length stall", () => {
    // A zero-second phase would make the engine's while-loop spin without
    // advancing, so the floor is load-bearing and not cosmetic.
    for (const m of MEDITATIONS) {
      expect(m.steps.length, m.id).toBeGreaterThanOrEqual(3);
      for (const s of m.steps) {
        expect(s.seconds, `${m.id}: ${s.label}`).toBeGreaterThanOrEqual(MEDITATION_STEP_MIN);
      }
    }
  });

  test("every title and intro is present and trimmed", () => {
    for (const m of MEDITATIONS) {
      expect(m.title.trim(), m.id).toBe(m.title);
      expect(m.title.length, m.id).toBeGreaterThan(0);
      expect(m.intro.trim(), m.id).toBe(m.intro);
      expect(m.intro.length, m.id).toBeGreaterThan(0);
      for (const s of m.steps) expect(s.label.trim(), m.id).toBe(s.label);
    }
  });
});

describe("it runs on the engine that already exists", () => {
  test("a practice is a breathing pattern with its steps as phases", () => {
    const m = MEDITATIONS[0]!;
    const p = meditationPattern(m);
    expect(p.id).toBe(m.id);
    expect(p.label).toBe(m.title);
    expect(p.hint).toBe(m.intro);
    expect(p.phases).toEqual(m.steps);
  });

  test("a whole practice is exactly one wrap of the engine", () => {
    const m = MEDITATIONS[3]!;
    const p = meditationPattern(m);
    const total = meditationSeconds(m);
    let s = startEngine(p);
    expect(meditationFinished(s)).toBe(false);
    for (let i = 0; i < total; i += 1) s = stepEngine(p, s, 1);
    expect(s.cycles).toBe(1);
    expect(elapsedSeconds(p, s)).toBe(total);
    expect(meditationFinished(s)).toBe(true);
    // One second past the end it has begun a second lap, which is why the
    // card stops it rather than trusting the engine to stop itself.
    expect(stepEngine(p, s, 1).cycles).toBe(1);
  });

  test("elapsed advances with every second and never goes backwards", () => {
    const m = MEDITATIONS[6]!;
    const p = meditationPattern(m);
    const total = meditationSeconds(m);
    let s = startEngine(p);
    let last = 0;
    for (let i = 0; i < total; i += 1) {
      s = stepEngine(p, s, 1);
      const now = elapsedSeconds(p, s);
      expect(now, m.id).toBe(i + 1);
      expect(now, m.id).toBeGreaterThan(last);
      last = now;
    }
  });

  test("the step shown is the step being counted", () => {
    const m = MEDITATIONS[0]!;
    const p = meditationPattern(m);
    let s = startEngine(p);
    expect(currentPhase(p, s).label).toBe(m.steps[0]!.label);
    s = stepEngine(p, s, m.steps[0]!.seconds);
    expect(currentPhase(p, s).label).toBe(m.steps[1]!.label);
  });

  test("the clock reads as minutes and seconds", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(9)).toBe("0:09");
    expect(formatClock(60)).toBe("1:00");
    expect(formatClock(185)).toBe("3:05");
    expect(formatClock(-10)).toBe("0:00");
  });
});

describe("the wording obeys the repo's own rules", () => {
  test("no clinical vocabulary and no therapeutic promise", () => {
    for (const m of MEDITATIONS) {
      expect(clinicalHit(proseOf(m)), m.id).toBeNull();
      expect(therapeuticClaimHit(proseOf(m)), m.id).toBeNull();
    }
  });

  test("the module's own source is clean too, comments included", () => {
    // Exempting comments is how a rule stops being a rule.
    expect(clinicalHit(LIB_SRC)).toBeNull();
    expect(therapeuticClaimHit(LIB_SRC)).toBeNull();
  });

  test("the reader is addressed as a peer", () => {
    for (const m of MEDITATIONS) expect(formalAddressHit(proseOf(m)), m.id).toBeNull();
  });
});

describe("the card", () => {
  test("offers all ten practices as one radio group", () => {
    const out = renderToStaticMarkup(createElement(MeditationPicker));
    expect(out.includes('role="radiogroup"')).toBe(true);
    for (const m of MEDITATIONS) expect(out.includes(m.title), m.id).toBe(true);
    // Only the first is chosen before anything is pressed.
    expect((out.match(/aria-checked="true"/g) ?? []).length).toBe(1);
  });

  test("shows the selected practice's steps and its real length", () => {
    const out = renderToStaticMarkup(createElement(MeditationPicker));
    const first = MEDITATIONS[0]!;
    expect(out.includes(first.intro)).toBe(true);
    expect(out.includes(`${first.minutes} perc`)).toBe(true);
    for (const s of first.steps) expect(out.includes(s.label)).toBe(true);
  });

  test("ticks with the shared engine, once a second, and only once", () => {
    expect(PICKER_SRC).toContain("startEngine");
    expect(PICKER_SRC).toContain("stepEngine");
    expect((PICKER_SRC.match(/window\.setInterval/g) ?? []).length).toBe(1);
    // A second stepping routine would be a `while` or a modulo in this file.
    expect(PICKER_SRC).not.toMatch(/while\s*\(/);
    expect((PICKER_SRC.match(/modulo|%\s*pattern\.phases\.length/g) ?? []).length).toBe(0);
  });

  test("the pattern is memoised, so the interval is not rebuilt every render", () => {
    // `meditationPattern` returns a fresh object; without the memo the effect
    // dependency would change identity once a second and the practice would
    // drift. This is the one defect this card could have shipped with.
    expect(PICKER_SRC).toContain("useMemo");
    expect(PICKER_SRC).toContain("[current]");
  });

  test("stops on the first wrap instead of looping forever", () => {
    expect(PICKER_SRC).toContain("meditationFinished");
    expect(PICKER_SRC).toContain("setFinished(true)");
  });

  test("announces the step, not the second", () => {
    // A live region that changes every second is noise.
    expect(PICKER_SRC).toContain('aria-live="polite"');
    expect(PICKER_SRC).toContain('role="progressbar"');
  });

  test("no audio, and nothing is remembered", () => {
    expect(PICKER_SRC).not.toMatch(/<audio|autoplay|new Audio|AudioContext/);
    // Static content, so the library needs no storage key of its own.
    expect(LIB_SRC).not.toContain("localStorage");
    expect(LIB_SRC).not.toContain("belso-iranytu");
  });

  test("mounted exactly once in the Eszköztár", () => {
    expect(TOOLS_SRC.includes("<MeditationPicker />")).toBe(true);
    expect((TOOLS_SRC.match(/<MeditationPicker \/>/g) ?? []).length).toBe(1);
    expect(TODAY_SRC.includes("<MeditationPicker />")).toBe(false);
  });

  test("it is a remembering card — one drawer inside another is the phase's choice", () => {
    // It used to be a plain `<Card>` so that a drawer inside a drawer would
    // not move the count the collapse guard pins. Phase 2b deliberately made
    // every tile on every tab collapsible (the mood grid is the only
    // exception), a nested head included; what must not change is the id the
    // remembered state is stored under and the catalogue title above it.
    expect(PICKER_SRC).toContain('<CollapsibleCard');
    expect(PICKER_SRC).toContain('id="tools-meditation"');
    expect(PICKER_SRC).toContain('title={t("meditation.title")}');
    expect(TOOLS_SRC).not.toContain("<MeditationPicker collapsed");
  });
});