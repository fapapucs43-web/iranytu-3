/**
 * "Programok" — the structured, six-week practice, in the therapy drawer.
 *
 * WHY IT SITS BESIDE BREATHING AND CBT
 * A program is not a different kind of thing from the tools around it: each
 * week just points at one of them (a breathing pause, a meditation, a journal
 * prompt). Putting it in the drawer next to those tools is what makes the
 * weekly practice feel like a continuation rather than a course with homework.
 *
 * THE CARD NEVER RUSHES
 * No countdown, no "week 3 of 6 is overdue", no lock on the next theme. The
 * summary line is the whole status, and finishing a week is a button the
 * reader can press whenever they actually did the practice — including twice
 * on the same day if that is what happened.
 */
import { useEffect, useState } from "react";
import { CollapsibleCard } from "./ui/ui";
import ContentIcon from "./ContentIcon";
import { todayISO } from "../lib/dates";
import { recordCompanionActivity } from "../lib/companion";
import {
  PROGRAMS,
  PROGRAM_THEME_LABELS,
  activeProgram,
  completeCurrentWeek,
  currentWeek,
  currentWeekNumber,
  isProgramComplete,
  loadProgramState,
  startProgram,
  subscribePrograms,
  type ProgramState,
} from "../lib/programs";

const PROGRAM = PROGRAMS[0]!;

export default function ProgramCard() {
  const [state, setState] = useState<ProgramState>(() => loadProgramState());

  useEffect(() => subscribePrograms(setState), []);

  const program = activeProgram(state);
  const week = program ? currentWeek(state, program) : undefined;
  const done = program ? state.completed.length : 0;
  const finished = program ? isProgramComplete(state, program) : false;

  const summary = !program
    ? "Hat hét, heti egy téma"
    : finished
      ? `Kész · ${done}/${program.weeks.length} hét`
      : `${done}/${program.weeks.length} hét · ${PROGRAM_THEME_LABELS[week?.theme ?? "body"]}`;

  function start() {
    setState(startProgram(PROGRAM.id, todayISO()));
  }

  function finishWeek() {
    const next = completeCurrentWeek(todayISO());
    setState(next);
    // XP is awarded through the companion's own counter, and only when the
    // week actually advanced — pressing "done" on a finished program must not
    // pay out twice.
    if (next.completed.length > state.completed.length) {
      recordCompanionActivity("program", todayISO());
    }
  }

  return (
    <CollapsibleCard
      id="tools-programs"
      title="Programok"
      icon={<ContentIcon name="Compass" />}
      summary={summary}
    >
      {!program ? (
        <>
          <p className="muted-note">
            {PROGRAM.title} — {PROGRAM.subtitle.toLowerCase()}. Heti egy téma, egy kis gyakorlat és egy
            kérdés, amire naplózhatsz. Nincs határidő: akkor haladsz, amikor van kedved.
          </p>
          <button type="button" className="btn btn-soft btn-block" onClick={start}>
            Elindítom
          </button>
        </>
      ) : finished ? (
        <>
          <p className="muted-note">{program.closing}</p>
          <button type="button" className="btn btn-soft btn-block" onClick={start}>
            Újra kezdem
          </button>
        </>
      ) : week ? (
        <>
          <div className="program-progress" aria-hidden="true">
            {program.weeks.map((w) => (
              <span
                key={w.week}
                className={`program-dot${state.completed.includes(w.week) ? " program-dot-done" : ""}${
                  w.week === week.week ? " program-dot-current" : ""
                }`}
              />
            ))}
          </div>
          <p className="muted-note">
            {week.week}. hét · {PROGRAM_THEME_LABELS[week.theme]} · kb. {week.minutes} perc
          </p>
          <h3 className="program-week-title">{week.title}</h3>
          <p className="muted-note">{week.intro}</p>
          <p className="program-practice">{week.practice}</p>
          <p className="program-prompt">
            <strong>Kérdés a hétre:</strong> {week.prompt}
          </p>
          <button type="button" className="btn btn-soft btn-block" onClick={finishWeek}>
            Megvan a heti gyakorlat
          </button>
          <p className="muted-note">
            A {currentWeekNumber(state, program)}. hétnél tartasz. Ha kimarad egy hét, az nem baj — a
            program ott folytatódik, ahol abbahagytad.
          </p>
        </>
      ) : null}
    </CollapsibleCard>
  );
}
