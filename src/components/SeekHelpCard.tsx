/**
 * "Mikor kérj segítséget?" — three questions and one next step.
 *
 * This is the app's only interactive surface whose wrong answer can matter
 * outside the screen, so the rules live in `lib/seekHelp.ts` as a pure
 * function and this file draws them. The one thing the component adds is that
 * the urgent result renders the SAME `CrisisStrip` the questionnaire result
 * uses: the numbers have one source, and a reader in a bad moment does not
 * have to trust a sentence typed into a second place.
 *
 * The disclaimer is imported, never re-typed — the repo's help surface is
 * single-source by design and `tests/lib/crisis-card.test.tsx` enforces it.
 */
import { useState } from "react";
import { CollapsibleCard, Segmented } from "./ui/ui";
import ContentIcon from "./ContentIcon";
import { CrisisStrip } from "./CrisisCard";
import { DISCLAIMER } from "../lib/assessments";
import {
  EMPTY_SEEK_HELP_ANSWERS,
  SEEK_HELP_QUESTIONS,
  seekHelpAnswered,
  seekHelpResult,
  type SeekHelpAnswers,
  type SeekHelpLevel,
} from "../lib/seekHelp";

/**
 * The level's class, spelled out rather than interpolated.
 *
 * `seek-help-${level}` would render the same markup, but the stylesheet's
 * reachability guard reads SOURCE for class names: an interpolated one leaves
 * the urgent rule looking unreachable, and the guard is right to complain — a
 * class nobody can find in the tree is a class that may as well not exist.
 */
const LEVEL_CLASS: Record<SeekHelpLevel, string> = {
  monitor: "seek-help-monitor",
  talk: "seek-help-talk",
  professional: "seek-help-professional",
  urgent: "seek-help-urgent",
};

export default function SeekHelpCard() {
  const [answers, setAnswers] = useState<SeekHelpAnswers>({ ...EMPTY_SEEK_HELP_ANSWERS });

  const result = seekHelpResult(answers);
  const answered = seekHelpAnswered(answers);

  function choose<K extends keyof SeekHelpAnswers>(key: K, value: NonNullable<SeekHelpAnswers[K]>) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <CollapsibleCard
      id="tools-seek-help"
      title="Mikor kérj segítséget?"
      icon={<ContentIcon name="ShieldAlert" />}
      summary={result ? result.title : "Három kérdés, egy következő lépés"}
    >
      <p className="muted-note">
        Ez nem teszt és nem diagnózis. Három kérdés segít eldönteni, hogy most elég-e
        figyelned magadra, vagy érdemes valakivel beszélned.
      </p>

      {SEEK_HELP_QUESTIONS.map((q, i) => (
        <div key={q.key} className="seek-help-question">
          <p className="field-label">
            {i + 1}. {q.question}
          </p>
          <Segmented
            ariaLabel={q.question}
            options={q.options}
            value={answers[q.key] ?? ""}
            onChange={(value) => choose(q.key, value as NonNullable<SeekHelpAnswers[typeof q.key]>)}
          />
        </div>
      ))}

      {result ? (
        <div className={`seek-help-result ${LEVEL_CLASS[result.level]}`} role="status">
          <h3>{result.title}</h3>
          <p>{result.body}</p>
          <p>
            <strong>Következő lépés:</strong> {result.next}
          </p>
          {result.level === "urgent" ? <CrisisStrip /> : null}
        </div>
      ) : (
        <p className="muted-note">
          {answered ? "" : "Válaszolj mindhárom kérdésre, és itt megjelenik a következő lépés."}
        </p>
      )}

      {answered ? (
        <button
          type="button"
          className="btn btn-ghost btn-block"
          onClick={() => setAnswers({ ...EMPTY_SEEK_HELP_ANSWERS })}
        >
          Újra kezdem
        </button>
      ) : null}

      <p className="disclaimer">{DISCLAIMER}</p>
    </CollapsibleCard>
  );
}
