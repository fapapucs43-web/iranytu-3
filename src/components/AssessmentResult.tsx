/**
 * Result of one Önreflexiós kérdőív run (Batch 6).
 *
 * The disclaimer and the resources are not decoration and not optional:
 * they render on EVERY result, and on every row of the history log, from
 * the same imported constants. They are grouped so the two always travel
 * together — a result with a band but no way to get help is the failure
 * mode this whole feature is built to avoid.
 *
 * `needsSupport` gives the resources more prominence and moves them ABOVE
 * the disclaimer. It is derived per run in lib/assessments and is never
 * persisted, so it cannot become a standing label on the person.
 */
import { useState } from "react";
import {
  DISCLAIMER,
  MAX_SCORE,
  RESOURCES,
  RESOURCES_TITLE,
  RESPONSE_OPTIONS,
} from "../lib/assessments";
import type { AssessmentRecord } from "../lib/assessmentStore";
import { Phone, ShieldAlert } from "../lib/icons";
import { CrisisStrip } from "./CrisisCard";
import { t } from "../lib/i18n";

/** The mandated sentence. Never retyped, never paraphrased, never dismissed. */
export function DisclaimerBlock() {
  return (
    <div className="disclaimer-block" role="note">
      <p>{DISCLAIMER}</p>
    </div>
  );
}

export function ResourcesBlock({ emph = false }: { emph?: boolean }) {
  return (
    <div className={`resources-block ${emph ? "resources-emph" : ""}`} role="note">
      <h4 className="resources-title">
        <ShieldAlert size="1.1em" /> {RESOURCES_TITLE}
      </h4>
      <ul className="resources-list">
        {RESOURCES.map((r) => (
          <li key={r.phone ?? r.href}>
            {r.href ? (
              <a href={r.href} target="_blank" rel="noreferrer noopener">
                {r.label}
              </a>
            ) : (
              <>
                <a className="resources-phone" href={`tel:${r.phone?.replace(/-/g, "")}`}>
                  <Phone size="1em" /> {r.phone}
                </a>
                <span className="resources-detail">
                  {r.label}
                  {r.hours ? ` — ${r.hours}` : ""}
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AssessmentResult({
  record,
  onAgain,
}: {
  record: AssessmentRecord;
  onAgain?: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const { band, needsSupport } = record;

  return (
    <div className="assessment-result">
      {/* Mount point 2 of 4. Hoisted ABOVE the date and the score, and only
          when this run needs support, so the way to reach help is the first
          thing on screen rather than something below the result. On a run that
          does not need support the strip is absent: the resources still render
          further down, unchanged, for every result. */}
      {needsSupport && <CrisisStrip />}
      <h3 className="assessment-result-title">{record.date}</h3>
      <p className="band-score">
        {record.score} pont / {MAX_SCORE}
      </p>
      <p className="band-label">{band.label}</p>
      <p className="band-note">{band.note}</p>

      {/* Order matters: when this run needs support, the way to get help is
          the first thing on screen rather than the last. */}
      {needsSupport ? (
        <>
          <ResourcesBlock emph />
          <DisclaimerBlock />
        </>
      ) : (
        <>
          <DisclaimerBlock />
          <ResourcesBlock />
        </>
      )}

      <div className="assessment-result-actions">
        {onAgain && (
          <button type="button" className="btn btn-soft" onClick={onAgain}>
            {t("assessment.resultRetake")}
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
        >
          {showAll ? t("assessment.resultShowAll") : t("assessment.resultHideAll")}
        </button>
      </div>

      {showAll && (
        <ol className="assessment-answers">
          {record.answers.map((v, i) => (
            <li key={i}>
              {i + 1}. {RESPONSE_OPTIONS[v] ?? String(v)}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
