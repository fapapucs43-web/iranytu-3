/**
 * Feszültség és aggodalom — the seven-question check-in (Batch 14).
 *
 * WHAT IT IS, AND WHAT IT IS NOT
 * A card in the Eszköztár's Egészség drawer that walks the seven items in
 * `lib/gad7`, shows all seven on ONE screen, and turns the seven answers into a
 * total and one descriptive band. It is not a second questionnaire: there is no
 * consent screen, no dated log, no PDF, and no draft. The Önreflexiós kérdőív
 * next to it keeps a history because its whole point is the same nine questions
 * over time; this is a check-in you take in the moment, and the module says so
 * in its own header.
 *
 * WHY ONE SCREEN AND NOT ONE ITEM AT A TIME
 * The questionnaire shows a single item per step because a nine-item form with a
 * safety notice deserves the reader's whole attention. Seven short statements
 * do not: a check-in that takes seven taps and one press is the shape the card
 * is named after, and the four options are the SAME four the questionnaire uses
 * — imported from `lib/assessments`, never retyped.
 *
 * WHY IT IS NOT BEHIND `assessmentsEnabled`
 * The parent mounts it ungated, deliberately, and the flag is not an oversight.
 * That flag exists because the questionnaire WRITES: it keeps a dated log, and
 * the consent screen in Settings is where a reader agrees to that. This card
 * writes nothing — the answers live in `useState` and unmount with the drawer —
 * so there is nothing to consent to, and hiding a check-in behind a consent
 * about storage would be a gate with no reason behind it. The one rule that does
 * apply is applied: a result never renders without the disclaimer and the
 * resources, both imported from `./AssessmentResult`, which own the only copy of
 * either sentence.
 *
 * WHY `Gad7Result` IS AN EXPORT
 * The result only exists after seven answers, and `bun test` has no click: a
 * static render can never reach the branch. Exporting the panel lets the suite
 * render it with a score and a band of its own choosing — the same reason
 * `DisclaimerBlock` is exported rather than inlined — and the branch that
 * chooses it stays three lines long and is pinned as wiring.
 *
 * The band label and the band note are CONTENT and come from the module, not
 * from the catalogue: they are the instrument's own words, the same way the
 * seven items are. Every other sentence on this card is chrome and comes from
 * the catalogue.
 */
import { useState } from "react";
import { INSTRUCTION, ITEMS, MAX_SCORE, summarize, type Band } from "../lib/gad7";
import { RESPONSE_OPTIONS } from "../lib/assessments";
import { DisclaimerBlock, ResourcesBlock } from "./AssessmentResult";
import { CollapsibleCard } from "./ui/ui";
import { t } from "../lib/i18n";
import { Wind } from "../lib/icons";

/** One answer per item, `null` until the reader picks. Nothing else is kept. */
type Answers = readonly (number | null)[];

/** Seven blanks, built from the module so the two cannot disagree. */
const BLANK: Answers = ITEMS.map(() => null);

export default function Gad7Card() {
  const [answers, setAnswers] = useState<Answers>(BLANK);
  const [result, setResult] = useState<{ score: number; band: Band } | null>(null);

  const complete = answers.every((a) => a !== null);

  function pick(index: number, value: number) {
    setAnswers((prev) => prev.map((old, i) => (i === index ? value : old)));
  }

  function finish() {
    // The one place the module's arithmetic is read, and it is read whole:
    // `summarize` refuses a partial run, so a total can never be shown for
    // fewer than seven answers even if the button were reached some other way.
    if (!complete) return;
    setResult(summarize(answers as number[]));
  }

  // The collapsed line counts the answered items — and once the run is
  // finished it states the total instead, so the card's promise and its body
  // can never disagree about how far the reader got.
  const answered = answers.filter((a) => a !== null).length;

  return (
    <CollapsibleCard
      id="tools-gad7"
      title={t("gad7.title")}
      icon={<Wind />}
      summary={
        result
          ? t("gad7.score", { score: result.score, max: MAX_SCORE })
          : t("gad7.summary", { n: answered })
      }
    >
      <p className="muted-note">{t("gad7.intro")}</p>

      {result ? (
        <Gad7Result
          score={result.score}
          band={result.band}
          onAgain={() => {
            setAnswers(BLANK);
            setResult(null);
          }}
        />
      ) : (
        <>
          <p className="muted-note">{INSTRUCTION}</p>
          {ITEMS.map((item, i) => (
            <fieldset key={item.index} className="assessment-item">
              <legend className="assessment-legend">
                <span className="assessment-legend-text">
                  {item.index}. {item.text}
                </span>
              </legend>
              <div
                className="pill-cloud"
                role="radiogroup"
                aria-label={t("gad7.itemGroup", { index: item.index })}
              >
                {RESPONSE_OPTIONS.map((label, value) => (
                  <button
                    key={label}
                    type="button"
                    role="radio"
                    aria-checked={answers[i] === value}
                    className={`pill ${answers[i] === value ? "pill-selected" : ""}`}
                    onClick={() => pick(i, value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
          ))}
          <p className="muted-note assessment-max">
            {t("assessment.maxScore", { max: MAX_SCORE })}
          </p>
          {!complete && <p className="muted-note">{t("gad7.incomplete")}</p>}
          <button
            type="button"
            className="btn btn-primary btn-block"
            disabled={!complete}
            onClick={finish}
          >
            {t("gad7.submit")}
          </button>
        </>
      )}

      {/* Printed in both states: it is a fact about the instrument, not about
          the run, and `gad7.provenance` is the ONE place the app names it. */}
      <p className="muted-note">{t("gad7.provenance")}</p>
    </CollapsibleCard>
  );
}

/**
 * One completed run: the total, the band it fell into, and the two sentences
 * that must never be missing from a result.
 *
 * Exported for the reason in the file header — and because the disclaimer block
 * and the resource list are the questionnaire's own components, this panel
 * cannot show a result without them. That is the point: there is no branch here
 * that renders a score alone.
 */
export function Gad7Result({
  score,
  band,
  onAgain,
}: {
  score: number;
  band: Band;
  onAgain: () => void;
}) {
  return (
    <div className="assessment-result">
      <p className="band-score">{t("gad7.score", { score, max: MAX_SCORE })}</p>
      <p className="band-label">{band.label}</p>
      <p className="band-note">{band.note}</p>
      <p className="muted-note">{t("gad7.resultNote")}</p>
      <DisclaimerBlock />
      <ResourcesBlock />
      <div className="assessment-result-actions">
        <button type="button" className="btn btn-soft" onClick={onAgain}>
          {t("gad7.again")}
        </button>
      </div>
    </div>
  );
}
