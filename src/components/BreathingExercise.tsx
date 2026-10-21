import { useEffect, useRef, useState } from "react";
import { CollapsibleCard, Segmented } from "./ui/ui";
import { Settings, Wind } from "../lib/icons";
import { PREFERS_REDUCED_MOTION, matchesMediaQuery } from "../lib/media";
import { todayISO } from "../lib/dates";
import { recordCompanionActivity } from "../lib/companion";
import { t } from "../lib/i18n";
import {
  BREATH_PATTERNS,
  buildCustomPattern,
  currentPhase,
  engineStarted,
  phaseMotion,
  startEngine,
  stepEngine,
  type BreathPattern,
} from "../lib/breathing";

/**
 * What quick mode runs. Resolved once at module load rather than inside the
 * component, so a missing preset fails here — at import, loudly — instead of
 * rendering an undefined pattern and throwing on the first tick.
 */
const QUICK_PATTERN = BREATH_PATTERNS.find((p) => p.id === "444")!;

/**
 * The one breathing tool (Batch 13, commit 11).
 *
 * WHY THERE IS ONE TOOL AND NOT TWO. Two breathing cards sat in the toolbox, and
 * they were not two ways to breathe — they were one tool and a worse copy of
 * it. This one is backed by the pure engine in `lib/breathing`; the other had
 * its own phase table, its own interval, and advanced the phase by calling a
 * setter from INSIDE another setter's updater, which React may run twice and
 * which read a stale closure. The engine exists precisely so that does not
 * happen. The deleted file's identifiers are not named anywhere in this file,
 * comments included, because tests/lib/breathing-consolidation.test.ts scans
 * this source for them.
 *
 * WHAT QUICK MODE IS. `Breathwork` was, in effect, one tap and a running 4-4-4
 * with no ceremony. That is a real need — most times somebody opens a breathing
 * tool they want to breathe, not to choose a pattern — so it survives as a MODE
 * on the one tool rather than as a second card. Turning quick mode on pins the
 * 4-4-4 (now a real preset, so the pattern is not lost by the merge) and hides
 * the picker; turning it off restores whatever was selected before, so the mode
 * is non-destructive in both directions.
 *
 * The toggle is DISABLED while a session is running. Swapping the pattern
 * mid-session would restart the count under somebody who is already breathing
 * to it, which is the least useful thing this card could do.
 */
export default function BreathingExercise() {
  const [pattern, setPattern] = useState<BreathPattern>(BREATH_PATTERNS[0]);
  const [state, setState] = useState(() => startEngine(BREATH_PATTERNS[0]));
  const [running, setRunning] = useState(false);
  const [custom, setCustom] = useState(false);
  const [quick, setQuick] = useState(false);
  const [cIn, setCIn] = useState(4);
  const [cHold, setCHold] = useState(4);
  const [cOut, setCOut] = useState(4);
  const timer = useRef<number | null>(null);
  // One award per mounted session. Pausing and resuming is the same practice,
  // and starting a fresh session would be rewarded on the next mount anyway.
  const awarded = useRef(false);

  /** The pattern actually in force — quick mode pins it. */
  const active = quick ? QUICK_PATTERN : pattern;

  useEffect(() => {
    if (!running) return;
    timer.current = window.setInterval(() => {
      setState((s) => stepEngine(active, s, 1));
    }, 1000);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [running, active]);

  useEffect(() => {
    if (state.cycles > 0 && !awarded.current) {
      awarded.current = true;
      recordCompanionActivity("breathing", todayISO());
    }
  }, [state.cycles]);

  function select(p: BreathPattern) {
    setPattern(p);
    setState(startEngine(p));
    setRunning(false);
  }

  function applyCustom() {
    select(buildCustomPattern(cIn, cHold, cOut, 0));
  }

  /**
   * Switching mode resets the engine. It has to: the state counts seconds in a
   * particular pattern's phases, and carrying it across would open the session
   * claiming a cycle it is not in.
   */
  function setMode(nextQuick: boolean) {
    setQuick(nextQuick);
    setRunning(false);
    setState(startEngine(nextQuick ? QUICK_PATTERN : pattern));
  }

  // Same shape as the meditation card, and for the same reason: paused means
  // "stopped, and the engine is not where it started".
  const paused = !running && engineStarted(active, state);
  const phase = currentPhase(active, state);
  const motion = phaseMotion(phase);
  // A one-shot read rather than a subscription, but the query string still
  // belongs to `lib/media` — two copies of `(prefers-reduced-motion: reduce)`
  // in the app are two chances to edit one and not the other.
  const reduced = matchesMediaQuery(PREFERS_REDUCED_MOTION);
  const scale = !running ? 1 : motion === 1 ? (reduced ? 1.08 : 1.25) : motion === -1 ? (reduced ? 0.95 : 0.75) : 1;

  return (
    <CollapsibleCard
      id="tools-breathing"
      title={t("tools.breathing.title")}
      icon={<Wind />}
      summary={t("tools.breathing.summary")}
    >
      <Segmented
        ariaLabel={t("tools.breathing.modeGroup")}
        options={[
          { value: "quick", label: t("tools.breathing.quick") },
          { value: "full", label: t("tools.breathing.full") },
        ]}
        value={quick ? "quick" : "full"}
        onChange={(v) => setMode(v === "quick")}
      />

      {/* The picker is hidden rather than disabled in quick mode. A control
          that is visible but inert advertises a choice that is not there. */}
      {!quick && (
        <>
          <div className="pill-cloud" role="radiogroup" aria-label={t("tools.breathing.patternGroup")}>
            {BREATH_PATTERNS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={pattern.id === p.id && !custom}
                className={`pill ${pattern.id === p.id && !custom ? "pill-selected" : ""}`}
                onClick={() => {
                  setCustom(false);
                  select(p);
                }}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              role="radio"
              aria-checked={custom}
              className={`pill ${custom ? "pill-selected" : ""}`}
              onClick={() => setCustom(true)}
            >
              <Settings size="1.1em" /> {t("tools.breathing.custom")}
            </button>
          </div>

          {custom ? (
            <div className="breath-custom">
              <label className="field-label" htmlFor="br-in">{t("tools.breathing.inLabel")}</label>
              <input id="br-in" type="number" min={1} max={30} value={cIn} className="text-input" onChange={(e) => setCIn(Number(e.target.value))} />
              <label className="field-label" htmlFor="br-hold">{t("tools.breathing.holdLabel")}</label>
              <input id="br-hold" type="number" min={0} max={30} value={cHold} className="text-input" onChange={(e) => setCHold(Number(e.target.value))} />
              <label className="field-label" htmlFor="br-out">{t("tools.breathing.outLabel")}</label>
              <input id="br-out" type="number" min={1} max={30} value={cOut} className="text-input" onChange={(e) => setCOut(Number(e.target.value))} />
              <button type="button" className="btn btn-soft" onClick={applyCustom}>{t("tools.breathing.apply")}</button>
            </div>
          ) : (
            <p className="muted-note">{active.hint}</p>
          )}
        </>
      )}

      <div className="breath-circle" style={{ transform: `scale(${scale})` }}>
        {running ? (
          <>
            <strong>{phase.label}</strong>
            <span>{state.remaining}</span>
          </>
        ) : (
          <span aria-hidden="true"><Wind size="1.6em" /></span>
        )}
      </div>

      <p className="muted-note">
        {running || paused
          ? t("tools.breathing.roundDone", { count: state.cycles })
          : quick
            ? `${active.label} — ${active.hint}`
            : t("tools.breathing.length", {
                seconds: active.phases.map((p) => p.seconds).join("-"),
              })}
      </p>

      {running ? (
        <button
          type="button"
          className="btn btn-soft btn-block"
          onClick={() => setRunning(false)}
        >
          {t("tools.breathing.pause")}
        </button>
      ) : paused ? (
        <>
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={() => setRunning(true)}
          >
            {t("tools.breathing.resume")}
          </button>
          <button
            type="button"
            className="btn btn-soft btn-block"
            onClick={() => setState(startEngine(active))}
          >
            {t("tools.breathing.finish")}
          </button>
        </>
      ) : (
        <button type="button" className="btn btn-primary btn-block" onClick={() => setRunning(true)}>
          {t("tools.breathing.start")}
        </button>
      )}
    </CollapsibleCard>
  );
}