import { useMemo, useState } from "react";
import { useApp } from "../state/AppContext";
import { CollapsibleCard } from "./ui/ui";
import {
  addCbtRecord,
  averageShift,
  deleteCbtRecord,
  getCbtRecords,
  moodShift,
  subscribeCbt,
} from "../lib/cbt";
import { useEffect } from "react";
import { t } from "../lib/i18n";
import { LayoutGrid, X } from "../lib/icons";
import ContentIcon from "./ContentIcon";

/**
 * Guided CBT thought record (Phase 3). Additive component — mounted in the
 * toolbox after approval. One card: the form, then past records with the
 * before→after distress shift.
 */
export default function CbtForm() {
  const { today, notify } = useApp();
  const [records, setRecords] = useState(() => getCbtRecords());

  useEffect(() => subscribeCbt(() => setRecords(getCbtRecords())), []);

  const [step, setStep] = useState(0);
  const [situation, setSituation] = useState("");
  const [automaticThought, setAutomaticThought] = useState("");
  const [emotion, setEmotion] = useState("");
  const [distressBefore, setDistressBefore] = useState(6);
  const [evidenceFor, setEvidenceFor] = useState("");
  const [evidenceAgainst, setEvidenceAgainst] = useState("");
  const [balancedThought, setBalancedThought] = useState("");
  const [distressAfter, setDistressAfter] = useState(4);

  const steps = useMemo(
    () => [
      t("tools.cbt.stepSituation"),
      t("tools.cbt.stepThought"),
      t("tools.cbt.stepEmotion"),
      t("tools.cbt.stepFor"),
      t("tools.cbt.stepAgainst"),
      t("tools.cbt.stepBalanced"),
      t("tools.cbt.stepAfter"),
    ],
    [],
  );

  function canAdvance(): boolean {
    if (step === 0) return situation.trim().length > 0;
    if (step === 1) return automaticThought.trim().length > 0;
    return true;
  }

  function save() {
    addCbtRecord({
      date: today,
      situation,
      automaticThought,
      emotion,
      distressBefore,
      evidenceFor,
      evidenceAgainst,
      balancedThought,
      distressAfter,
    });
    notify("Gondolatrecord elmentve 🧠");
    // reset
    setStep(0);
    setSituation("");
    setAutomaticThought("");
    setEmotion("");
    setDistressBefore(6);
    setEvidenceFor("");
    setEvidenceAgainst("");
    setBalancedThought("");
    setDistressAfter(4);
  }

  const avg = averageShift(records);

  return (
    <CollapsibleCard
      id="tools-cbt"
      title={t("tools.cbt.title")}
      icon={<LayoutGrid />}
      summary={t("tools.cbt.summary")}
    >
      <div className="cbt-steps" aria-label={t("tools.cbt.progressGroup")}>
        {steps.map((_, i) => (
          <span key={i} className={`cbt-dot ${i <= step ? "cbt-dot-on" : ""}`} />
        ))}
      </div>
      <p className="question-text">
        {step + 1}. {steps[step]}
      </p>

      {step === 0 && (
        <textarea
          className="text-area"
          rows={3}
          value={situation}
          onChange={(e) => setSituation(e.target.value)}
          aria-label={t("tools.cbt.situationLabel")}
          placeholder={t("tools.cbt.situationPlaceholder")}
        />
      )}
      {step === 1 && (
        <textarea
          className="text-area"
          rows={3}value={automaticThought}
            onChange={(e) => setAutomaticThought(e.target.value)}
            aria-label={t("tools.cbt.thoughtLabel")}
            placeholder={t("tools.cbt.thoughtPlaceholder")}
        />
      )}
      {step === 2 && (
        <>
          <input
            className="text-input"
            aria-label={t("tools.cbt.emotionLabel")}
            placeholder={t("tools.cbt.emotionPlaceholder")}
            value={emotion}
            maxLength={60}
            onChange={(e) => setEmotion(e.target.value)}
          />
          <label className="field-label" htmlFor="cbt-before">
            {t("tools.cbt.distressBefore")} <strong>{distressBefore}/10</strong>
          </label>
          <input
            id="cbt-before"
            type="range"
            min={0}
            max={10}
            value={distressBefore}
            className="slider slider-rose"
            onChange={(e) => setDistressBefore(Number(e.target.value))}
          />
        </>
      )}
      {step === 3 && (
        <textarea
          className="text-area"
          rows={3}value={evidenceFor}
            onChange={(e) => setEvidenceFor(e.target.value)}
            aria-label={t("tools.cbt.forLabel")}
            placeholder={t("tools.cbt.forPlaceholder")}
        />
      )}
      {step === 4 && (
        <textarea
          className="text-area"
          rows={3}value={evidenceAgainst}
            onChange={(e) => setEvidenceAgainst(e.target.value)}
            aria-label={t("tools.cbt.againstLabel")}
            placeholder={t("tools.cbt.againstPlaceholder")}
        />
      )}
      {step === 5 && (
        <textarea
          className="text-area"
          rows={3}value={balancedThought}
            onChange={(e) => setBalancedThought(e.target.value)}
            aria-label={t("tools.cbt.balancedLabel")}
            placeholder={t("tools.cbt.balancedPlaceholder")}
        />
      )}
      {step === 6 && (
        <>
          <label className="field-label" htmlFor="cbt-after">
            {t("tools.cbt.distressAfter")} <strong>{distressAfter}/10</strong>
          </label>
          <input
            id="cbt-after"
            type="range"
            min={0}
            max={10}
            value={distressAfter}
            className="slider slider-rose"
            onChange={(e) => setDistressAfter(Number(e.target.value))}
          />
          <p className="muted-note">
            {t("tools.cbt.shiftBefore", {
              before: distressBefore,
              after: distressAfter,
            })}
            {" "}
            {distressBefore - distressAfter > 0
              ? t("tools.cbt.shiftBetter", {
                  points: distressBefore - distressAfter,
                })
              : t("tools.cbt.shiftSame")}
          </p>
        </>
      )}

      <div className="dialog-actions">
        {step > 0 && (
          <button type="button" className="btn btn-ghost" onClick={() => setStep(step - 1)}>
            {t("tools.cbt.back")}
          </button>
        )}
        {step < 6 ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canAdvance()}
            onClick={() => setStep(step + 1)}
          >
            {t("tools.cbt.next")}
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={save}>
            <ContentIcon name="Brain" size="1.1em" /> {t("tools.cbt.save")}
          </button>
        )}
      </div>

      {records.length > 0 && (
        <>
          <p className="muted-note">
            {avg === null
              ? t("tools.cbt.records", { count: records.length })
              : t("tools.cbt.recordsWithAvg", {
                  count: records.length,
                  avg,
                })}
          </p>
          <ul className="goal-list">
            {records.slice(0, 5).map((r) => (
              <li key={r.id} className="goal-row cbt-row">
                <span className="cbt-record">
                  <strong>{r.automaticThought.slice(0, 60)}</strong>
                  <small>
                    {r.distressBefore}→{r.distressAfter} ({moodShift(r) >= 0 ? "−" : "+"}
                    {Math.abs(moodShift(r))})
                  </small>
                </span>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={t("tools.cbt.deleteLabel")}
                  onClick={() => deleteCbtRecord(r.id)}
                >
                  <X size="1.1em" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </CollapsibleCard>
  );
}
