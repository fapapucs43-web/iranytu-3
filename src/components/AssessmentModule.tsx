/**
 * The single Önreflexiós kérdőív entry in the Eszköztár (Batch 6).
 *
 * One `.toolbox-item` holding runner | result | log, so the toolbox gains
 * one entry rather than three. Mounted only when `assessmentsEnabled` is
 * true — the flag is checked by the parent, because the consent screen in
 * Settings is the only way to turn it on.
 */
import { useState } from "react";
import { formatHuman, todayISO } from "../lib/dates";
import { addAssessment, listAssessments, type AssessmentRecord } from "../lib/assessmentStore";
import AssessmentRunner from "./AssessmentRunner";
import AssessmentResult from "./AssessmentResult";
import AssessmentLog from "./AssessmentLog";
import { CollapsibleCard } from "./ui/ui";
import { t } from "../lib/i18n";
import { ClipboardList } from "../lib/icons";

type View = { kind: "log" } | { kind: "runner" } | { kind: "result"; record: AssessmentRecord };

export default function AssessmentModule() {
  const [view, setView] = useState<View>({ kind: "log" });

  function complete(payload: { date: string; answers: number[]; impact: number | null }) {
    const record = addAssessment(payload);
    if (record) setView({ kind: "result", record });
  }

  function start() {
    setView({ kind: "runner" });
  }

  // The collapsed line names the LAST run from the log itself — the append-only
  // record, never a component state — so a reader can tell an answered
  // questionnaire from an untouched one without opening the card.
  const records = listAssessments();
  const last = records.length > 0 ? records[records.length - 1] : null;

  return (
    <CollapsibleCard
      id="tools-assessment"
      title={t("assessment.moduleTitle")}
      icon={<ClipboardList />}
      className="assessment-module"
      summary={
        last
          ? t("assessment.summaryLast", { date: formatHuman(last.date), score: last.score })
          : t("assessment.summaryEmpty")
      }
    >
      {view.kind === "log" && (
        <>
          <div className="assessment-head">
            <button type="button" className="btn btn-soft" onClick={start}>
              {t("assessment.moduleStart")}
            </button>
          </div>
          <AssessmentLog onAgain={start} />
        </>
      )}

      {view.kind === "runner" && (
        <AssessmentRunner
          today={todayISO()}
          onDone={complete}
          onCancel={() => setView({ kind: "log" })}
        />
      )}

      {view.kind === "result" && (
        <>
          <AssessmentResult
            record={view.record}
            onAgain={() => setView({ kind: "runner" })}
          />
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setView({ kind: "log" })}
          >
            {t("assessment.moduleBack")}
          </button>
        </>
      )}
    </CollapsibleCard>
  );
}
