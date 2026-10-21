/**
 * The Önreflexiós kérdőív runner (Batch 6).
 *
 * Nine items, one at a time, with the safety block riding along on the
 * ninth via AssessmentItemView. The optional functional-impact step comes
 * after and is NOT scored — it asks a different question (how much did this
 * get in the way) than the items do (how often did this happen).
 *
 * NOTHING IS WRITTEN UNTIL THE RUN IS FINISHED. Closing the runner
 * mid-way persists nothing at all: there is no draft, no resume, no partial
 * save. A half-answered questionnaire that then produced a total would land
 * in a band it never earned.
 */
import { useState } from "react";

import {
  IMPACT_OPTIONS,
  IMPACT_QUESTION,
  INSTRUCTION,
  ITEMS,
  MAX_SCORE,
  TITLE,
} from "../lib/assessments";
import AssessmentItemView from "./AssessmentItemView";
import { t } from "../lib/i18n";
import { ClipboardList } from "../lib/icons";

export default function AssessmentRunner({
  today,
  onDone,
  onCancel,
}: {
  /** Local YYYY-MM-DD, stamped on the record when the run completes. */
  today: string;
  /** Receives a completed run ready to be stored. */
  onDone: (payload: { date: string; answers: number[]; impact: number | null }) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Array<number | null>>(() => ITEMS.map(() => null));
  const [impact, setImpact] = useState<number | null>(null);

  const total = ITEMS.length;
  const onImpact = step === total;
  const item = onImpact ? null : ITEMS[step]!;
  const answered = answers.filter((a) => a !== null).length;
  const ready = answered === total;

  function answer(v: number) {
    setAnswers((prev) => prev.map((old, i) => (i === step ? v : old)));
  }

  function finish() {
    if (!ready) return;
    onDone({ date: today, answers: answers as number[], impact });
  }

  return (
    <div className="assessment-runner">
      <h3 className="assessment-runner-title">
        <ClipboardList size="1.1em" /> {TITLE}
      </h3>
      <p className="muted-note">{INSTRUCTION}</p>
      <p className="assessment-progress" aria-live="polite">
        {onImpact ? `${total} / ${total}` : `${step + 1} / ${total}`}
      </p>

      {onImpact ? (
        <fieldset className="assessment-item">
          <legend className="assessment-legend">
            <span className="assessment-legend-text">{IMPACT_QUESTION}</span>
          </legend>
          <p className="muted-note">{t("assessment.notScored")}</p>
          <div className="pill-cloud" role="radiogroup" aria-label={t("assessment.impactGroup")}>
            {IMPACT_OPTIONS.map((label, i) => (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={impact === i}
                className={`pill ${impact === i ? "pill-selected" : ""}`}
                onClick={() => setImpact(i)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="btn-grid">
            <button type="button" className="btn btn-soft" onClick={() => setImpact(null)}>
              {t("assessment.skip")}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={finish}
              disabled={!ready}
            >
              {t("assessment.save")}
            </button>
          </div>
        </fieldset>
      ) : (
        <>
          <AssessmentItemView item={item!} value={answers[step] ?? null} onChange={answer} />
          <div className="btn-grid">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setStep((s) => Math.min(s + 1, total))}
              disabled={answers[step] === null}
            >
              {t("assessment.next")}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onCancel}>
              {t("assessment.exit")}
            </button>
          </div>
        </>
      )}

      <p className="muted-note assessment-max">
        {t("assessment.maxScore", { max: MAX_SCORE })}
      </p>
    </div>
  );
}
