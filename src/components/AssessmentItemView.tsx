/**
 * One question of the Önreflexiós kérdőív (Batch 6).
 *
 * The safety block is the most important thing in this file, so it is the
 * most carefully constrained thing in the app: the notice shows for the
 * supplementary ninth question, and for THAT question it shows
 * UNCONDITIONALLY — never gated on what the person answered, or on whether
 * they have answered at all.
 *
 * Why unconditional. Someone reading "…jobb lenne, ha meghalna…" may need
 * the crisis number BEFORE they have decided what to put in a button. A
 * block that appeared only after a non-zero answer would reach exactly the
 * people who left it at zero — and would tell a person who answered "néhány
 * napon" something they should have been shown on arrival.
 *
 * It shows for the ninth item ONLY. Printing it above the other eight would
 * both dilute it and alarm people about questions that do not concern them.
 */
import { SAFETY_NOTICE, SUPPLEMENTARY_LABEL, RESPONSE_OPTIONS, type AssessmentItem } from "../lib/assessments";
import ContentIcon from "./ContentIcon";
import { t } from "../lib/i18n";

/** True for the supplementary item, and only for it. */
export function needsSafetyNotice(item: AssessmentItem): boolean {
  return item.isSupplementary;
}

/** The crisis notice. Exported so tests can render it in isolation. */
export function AssessmentSafetyBlock() {
  return (
    <div className="safety-block" role="note">
      <span className="safety-block-icon" aria-hidden="true">
        <ContentIcon name="AlertTriangle" size="1.2em" />
      </span>
      <p>{SAFETY_NOTICE}</p>
    </div>
  );
}

export default function AssessmentItemView({
  item,
  value,
  onChange,
}: {
  item: AssessmentItem;
  /** null until the person picks an option. */
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <fieldset className="assessment-item">
      <legend className="assessment-legend">
        <span className="assessment-legend-text">
          {item.index}. {item.text}
        </span>
        {item.isSupplementary && <span className="badge badge-soft">{SUPPLEMENTARY_LABEL}</span>}
      </legend>

      {/* Depends on the ITEM, never on `value` — see the file header. */}
      {needsSafetyNotice(item) && <AssessmentSafetyBlock />}

      <div className="pill-cloud" role="radiogroup" aria-label={t("assessment.itemGroup", { index: item.index })}>
        {RESPONSE_OPTIONS.map((label, i) => (
          <button
            key={label}
            type="button"
            role="radio"
            aria-checked={value === i}
            className={`pill ${value === i ? "pill-selected" : ""}`}
            onClick={() => onChange(i)}
          >
            {label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
