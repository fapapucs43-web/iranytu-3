/**
 * Breathing patterns and a pure phase engine (Phase 3).
 *
 * The engine is driven by elapsed seconds rather than setInterval ticks so it
 * stays accurate when a timer is throttled; the component only animates.
 */

export type BreathPhase = {
  label: string;
  seconds: number;
};

export type BreathPattern = {
  id: string;
  label: string;
  hint: string;
  phases: BreathPhase[];
};

export const BREATH_PATTERNS: BreathPattern[] = [
  {
    id: "478",
    label: "4-7-8",
    hint: "Megnyugtató, elalvás előtt is jó.",
    phases: [
      { label: "Lélegezz be", seconds: 4 },
      { label: "Tartsd meg", seconds: 7 },
      { label: "Fújd ki", seconds: 8 },
    ],
  },
  {
    id: "box",
    label: "Doboz (4-4-4-4)",
    hint: "Kiegyensúlyoz, fókuszál.",
    phases: [
      { label: "Lélegezz be", seconds: 4 },
      { label: "Tartsd meg", seconds: 4 },
      { label: "Fújd ki", seconds: 4 },
      { label: "Tartsd ki", seconds: 4 },
    ],
  },
  {
    id: "coherent",
    label: "5-5 (koherens)",
    hint: "Szívritmus-összhang, 5-5 ritmus.",
    phases: [
      { label: "Lélegezz be", seconds: 5 },
      { label: "Fújd ki", seconds: 5 },
    ],
  },
  /* --- Batch 13, commit 11: the 4-4-4, kept as a PRESET rather than as a
     second component. `Breathwork` offered a three-phase 4-4-4 — box without
     the closing hold — as its own toolbox entry, with its own hand-rolled
     timer. Consolidating the two tools without this would have quietly dropped
     a breathing pattern a reader could reach today, and "box" is not it.
     APPENDED, not inserted: phase3 pins BREATH_PATTERNS[0] and [1] by index,
     and box4 is found by id, so only a prepend would have moved them. */
  {
    id: "444",
    label: "4-4-4 (nyugtató)",
    hint: "Belégzés, tartás, kilégzés — a legrövidebb belépő.",
    phases: [
      { label: "Lélegezz be", seconds: 4 },
      { label: "Tartsd meg", seconds: 4 },
      { label: "Fújd ki", seconds: 4 },
    ],
  },
];

/** Total length of one full cycle, in seconds. */
export function cycleLength(pattern: BreathPattern): number {
  return pattern.phases.reduce((s, p) => s + p.seconds, 0);
}

export type EngineState = {
  phaseIndex: number;
  /** Seconds remaining in the current phase (integer). */
  remaining: number;
  /** Completed cycles since start. */
  cycles: number;
};

/** Initial engine state for a pattern. */
export function startEngine(pattern: BreathPattern): EngineState {
  return {
    phaseIndex: 0,
    remaining: pattern.phases[0]?.seconds ?? 1,
    cycles: 0,
  };
}

/**
 * Has this session actually begun?
 *
 * The predicate the pause control needs, and the reason it lives here rather
 * than in the component: a session that has been started and stopped within its
 * first second has made no progress, and calling that "paused" would show a
 * resume button over an engine sitting exactly where it started. Comparing
 * against `startEngine` says the true thing in every case, including the one
 * where nothing has happened yet.
 */
export function engineStarted(pattern: BreathPattern, state: EngineState): boolean {
  const fresh = startEngine(pattern);
  return (
    state.phaseIndex !== fresh.phaseIndex ||
    state.remaining !== fresh.remaining ||
    state.cycles !== fresh.cycles
  );
}

/**
 * Advance the engine by `elapsedSeconds` (call every second with 1).
 * Pure: returns the next state without mutating.
 */
export function stepEngine(
  pattern: BreathPattern,
  state: EngineState,
  elapsedSeconds: number,
): EngineState {
  let { phaseIndex, remaining, cycles } = state;
  let t = Math.max(0, Math.floor(elapsedSeconds));

  while (t > 0) {
    if (remaining > t) {
      remaining -= t;
      t = 0;
    } else {
      t -= remaining;
      phaseIndex = (phaseIndex + 1) % pattern.phases.length;
      if (phaseIndex === 0) cycles += 1;
      remaining = pattern.phases[phaseIndex].seconds;
    }
  }
  return { phaseIndex, remaining, cycles };
}

/** Current phase object. */
export function currentPhase(pattern: BreathPattern, state: EngineState): BreathPhase {
  return pattern.phases[state.phaseIndex] ?? pattern.phases[0];
}

/**
 * Animation guidance for the circle: -1 (shrinking), 0 (hold), +1 (growing),
 * derived from the phase label — keeps the component dumb and testable.
 */
export function phaseMotion(phase: BreathPhase): -1 | 0 | 1 {
  if (phase.label.startsWith("Lélegezz be")) return 1;
  if (phase.label.startsWith("Fújd ki")) return -1;
  return 0;
}

/** Build a custom pattern from per-phase seconds (0 = phase skipped). */
export function buildCustomPattern(
  inhale: number,
  holdIn: number,
  exhale: number,
  holdOut: number,
): BreathPattern {
  const phases: BreathPhase[] = [];
  const push = (label: string, s: number) => {
    if (s > 0) phases.push({ label, seconds: Math.min(30, Math.round(s)) });
  };
  push("Lélegezz be", inhale);
  push("Tartsd meg", holdIn);
  push("Fújd ki", exhale);
  push("Tartsd ki", holdOut);
  if (phases.length === 0) {
    phases.push({ label: "Lélegezz be", seconds: 4 }, { label: "Fújd ki", seconds: 4 });
  }
  return { id: "custom", label: "Saját minta", hint: "Saját beállítású ritmus.", phases };
}
