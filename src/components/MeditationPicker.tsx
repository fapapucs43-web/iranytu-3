/**
 * The library's reader, mounted in the Eszköztár beside the breathing tool.
 *
 * WHY IT REUSES THE PHASE ENGINE
 * `lib/meditations.ts` turns a practice's steps into a breathing pattern, so
 * the ticking here is `startEngine` / `stepEngine` — the same pair the
 * breathing card uses — driven by one interval. A second stepping routine
 * would be a second thing to get right about seconds, and this batch deleted
 * exactly that duplication a commit ago.
 *
 * WHY THE PATTERN IS MEMOISED
 * `meditationPattern` builds a fresh object, and the interval effect depends on
 * it. Without `useMemo` the dependency would change identity on every render,
 * so the interval would be torn down and rebuilt once a second and the practice
 * would drift. The memo is what keeps a stable pattern in the dependency list.
 *
 * WHY A PLAIN CARD AND NOT A COLLAPSIBLE
 * The Eszköztár is itself the collapsible, and every other entry in it is a
 * plain card. A nested header would add a row for a list most readers reach
 * once, and it would move the card-head count the collapse guard pins.
 *
 * WHY THE CLOCK IS NOT IN A LIVE REGION
 * A live region that changes every second is noise: a screen reader would
 * announce each tick. The region below announces the STEP, which is the thing
 * that actually needs telling someone, and the remaining time sits beside it as
 * ordinary text.
 *
 * WHY THE CHROME GOES THROUGH `t()` AND THE PRACTICES DO NOT
 * This is the one surface the staged i18n framework is wired to. The words AROUND
 * the practice are chrome and are looked up; the practice itself — its title,
 * intro and steps — is Hungarian content and stays in `lib/meditations.ts`.
 * With no locale chosen anywhere yet, `t()` resolves to Hungarian and the card
 * renders byte-for-byte what it rendered before this framework existed.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { CollapsibleCard } from "./ui/ui";
import { Hourglass } from "../lib/icons";
import {
  MEDITATIONS,
  elapsedSeconds,
  formatClock,
  meditationFinished,
  meditationPattern,
  meditationSeconds,
  type Meditation,
} from "../lib/meditations";
import { startEngine, stepEngine } from "../lib/breathing";
import { t } from "../lib/i18n";

export default function MeditationPicker() {
  const [selected, setSelected] = useState(MEDITATIONS[0]!.id);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [state, setState] = useState(() => startEngine(meditationPattern(MEDITATIONS[0]!)));
  const timer = useRef<number | null>(null);

  const current = MEDITATIONS.find((m) => m.id === selected) ?? MEDITATIONS[0]!;
  const pattern = useMemo(() => meditationPattern(current), [current]);
  const total = meditationSeconds(current);
  const elapsed = elapsedSeconds(pattern, state);
  const remaining = Math.max(0, total - elapsed);
  // Paused is not a fourth piece of state: it is "not running, not finished,
  // and the engine is somewhere it was not at the start". A session stopped
  // in its first second has not moved, so it reads as idle and offers start.
  const paused = !running && !finished && elapsed > 0;
  const stepIndex = running || finished || paused ? state.phaseIndex : -1;
  const percent = total > 0 ? Math.min(100, Math.round((elapsed / total) * 100)) : 0;

  useEffect(() => {
    if (!running) return;
    timer.current = window.setInterval(() => {
      setState((s) => stepEngine(pattern, s, 1));
    }, 1000);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [running, pattern]);

  // The engine wraps; the first wrap means every step has been shown once.
  useEffect(() => {
    if (!running || !meditationFinished(state)) return;
    setRunning(false);
    setFinished(true);
  }, [running, state]);

  /**
   * Choosing another practice restarts the count. Carrying elapsed time across
   * would open a session in the middle of a practice nobody started there.
   */
  function select(m: Meditation) {
    setSelected(m.id);
    setState(startEngine(meditationPattern(m)));
    setRunning(false);
    setFinished(false);
  }

  function restart() {
    setState(startEngine(pattern));
    setFinished(false);
    setRunning(true);
  }

  return (
    <CollapsibleCard
      id="tools-meditation"
      title={t("meditation.title")}
      icon={<Hourglass />}
      summary={t("tools.meditation.summary")}
    >
      <div className="pill-cloud" role="radiogroup" aria-label={t("meditation.group")}>
        {MEDITATIONS.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={m.id === selected}
            className={`pill ${m.id === selected ? "pill-selected" : ""}`}
            onClick={() => select(m)}
          >
            {m.title}
          </button>
        ))}
      </div>

      <p className="muted-note">{current.intro}</p>

      <ol className="meditation-list">
        {current.steps.map((s, i) => {
          const done = stepIndex > i;
          const active = stepIndex === i;
          return (
            <li
              key={s.label}
              className={`meditation-step${done ? " meditation-done" : ""}${active ? " meditation-current" : ""}`}
              aria-current={active ? "step" : undefined}
            >
              <span>{s.label}</span>
              <span className="meditation-clock">{formatClock(s.seconds)}</span>
            </li>
          );
        })}
      </ol>

      {running && (
        <div
          className="meditation-bar"
          role="progressbar"
          aria-label={t("meditation.progress")}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={elapsed}
        >
          <span style={{ width: `${percent}%` }} />
        </div>
      )}

      {/* Announces the step, never the second — see the header. */}
      <p className="meditation-status" aria-live="polite">
        {finished
          ? t("meditation.complete")
          : running
            ? current.steps[stepIndex]?.label
            : t("meditation.summary", { minutes: current.minutes, total: formatClock(total) })}
      </p>

      {running ? (
        <button
          type="button"
          className="btn btn-soft btn-block"
          onClick={() => setRunning(false)}
        >
          {t("meditation.pause")}
        </button>
      ) : finished ? (
        <button type="button" className="btn btn-primary btn-block" onClick={restart}>
          {t("meditation.restart")}
        </button>
      ) : paused ? (
        <>
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={() => setRunning(true)}
          >
            {t("meditation.resume")}
          </button>
          <button
            type="button"
            className="btn btn-soft btn-block"
            onClick={() => setState(startEngine(pattern))}
          >
            {t("meditation.finish")}
          </button>
        </>
      ) : (
        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={() => setRunning(true)}
        >
          {t("meditation.start")}
        </button>
      )}

      {(running || paused) && (
        <p className="muted-note">{t("meditation.remaining", { time: formatClock(remaining) })}</p>
      )}
    </CollapsibleCard>
  );
}