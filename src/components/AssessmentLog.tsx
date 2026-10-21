/**
 * Dated history of Önreflexiós kérdőív runs (Batch 6).
 *
 * A history and nothing else. There is no "latest result" that overwrites
 * the last one, no comparison against a previous run, and no trend arrow —
 * a line going up across months would be a diagnosis accumulating by
 * itself, which is exactly what this feature refuses to do.
 *
 * Each row expands into the same <AssessmentResult>, so the disclaimer and
 * the resources travel with every historical result too.
 *
 * The collapsed list also shows a band label per row, which is a result —
 * so the disclaimer sits at the top of the list as well. A history screen
 * full of "erősebb tünetek" with no statement of what that means would be
 * the one place the guarantee is weakest, because reading it is the whole
 * point of the screen.
 */
import { useState } from "react";
import { listAssessments, type AssessmentRecord } from "../lib/assessmentStore";
import AssessmentResult, { DisclaimerBlock } from "./AssessmentResult";
import { History } from "../lib/icons";
import { t } from "../lib/i18n";

export default function AssessmentLog({ onAgain }: { onAgain?: () => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const items = listAssessments();

  if (items.length === 0) {
    return (
      <div className="assessment-log">
        <h3 className="assessment-log-title">
          <History size="1.1em" /> {t("assessment.logTitle")}
        </h3>
        <p className="muted-note">{t("assessment.logEmpty")}</p>
      </div>
    );
  }

  return (
    <div className="assessment-log">
      <h3 className="assessment-log-title">
        <History size="1.1em" /> {t("assessment.logTitle")}
      </h3>
      <DisclaimerBlock />
      <ul className="assessment-log-list">
        {items.map((r: AssessmentRecord) => {
          const open = openId === r.id;
          return (
            <li key={r.id} className="assessment-log-item">
              <button
                type="button"
                className="assessment-log-row"
                aria-expanded={open}
                onClick={() => setOpenId(open ? null : r.id)}
              >
                <span className="assessment-log-date">{r.date}</span>
                <span className="assessment-log-band">{r.band.label}</span>
              </button>
              {open && <AssessmentResult record={r} onAgain={onAgain} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
