import { useState } from "react";
import { useApp } from "../state/AppContext";
import { CollapsibleCard } from "./ui/ui";
import { exportMoodReportPdf } from "../lib/reportPdf";
import { markEventFeature } from "../lib/featureFlags";
import { entriesToCsv } from "../lib/csv";
import { downloadText } from "../lib/download";
import { BarChart, FileText } from "../lib/icons";
import { listAssessments } from "../lib/assessmentStore";
import { t } from "../lib/i18n";

/**
 * Therapist-ready export (Phase 3): PDF with summary + chart + table, and the
 * existing CSV. jsPDF loads dynamically only when exporting.
 *
 * THE PDF BUTTON SAYS WHAT IT COSTS, AND WHY THAT IS NEW
 * A user asked why something still downloaded, and the honest answer turned out
 * to be this button: the jsPDF chunk is 391 kB raw / 131 kB over the wire,
 * which is MORE than every typeface in the app put together, and it was
 * fetching silently on the first tap. The dynamic import is the right design —
 * 131 kB is far too much to hand a user who never exports a report — but
 * "dynamic" only means "not on page load", not "free", and a button that costs
 * a quarter of a megabyte on first use should say so.
 *
 * The figure is measured, not estimated, against the 7d production build. It is
 * a constant rather than something computed because the app cannot know its own
 * chunk sizes at runtime without fetching the manifest it is trying to avoid
 * fetching. `tests/batch7f.test.ts` pins that the import is still dynamic and
 * still out of the main bundle, so if a jsPDF upgrade changes the number by a
 * lot, the stale label is at least noticed in review.
 */
const PDF_DOWNLOAD_KB = 131;
const PDF_RAW_KB = 391;

export default function ReportExport() {
  const { data, notify } = useApp();
  const [busy, setBusy] = useState(false);

  async function makePdf() {
    if (data.entries.length === 0) {
      notify("Előbb rögzíts pár napot a jelentéshez.", "warn");
      return;
    }
    setBusy(true);
    try {
      const name = await exportMoodReportPdf(data.entries, {
        userName: data.profile.name || undefined,
        // Only passed when there IS a log; an empty array would make the
        // report cite an instrument the user never filled in.
        assessments: listAssessments().map((a) => ({
          date: a.date,
          score: a.score,
          bandLabel: a.band.label,
        })),
      });
      notify(`PDF letöltve: ${name}`);
      // Only after the export RESOLVED: the badge is for a file that exists,
      // not for a button that was pressed.
      markEventFeature("pdfExport");
    } catch {
      notify("A PDF készítése nem sikerült.", "warn");
    } finally {
      setBusy(false);
    }
  }

  function makeCsv() {
    if (data.entries.length === 0) {
      notify("Nincs exportálható adat.", "warn");
      return;
    }
    downloadText("belso-iranytu-export.csv", entriesToCsv(data.entries), "text/csv;charset=utf-8");
    notify("CSV letöltve 📤");
  }

  return (
    <CollapsibleCard
      id="insights-report-export"
      title={t("settings.sections.export")}
      icon={<FileText />}
      summary={
        data.entries.length === 0
          ? "Nincs exportálható adat"
          : t("export.summary", { count: data.entries.length })
      }
    >
      <p className="muted-note">{t("export.intro")}</p>
      <div className="btn-grid">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={makePdf}>
          {busy ? <>{t("export.busy")}</> : <><FileText size="1.1em" /> {t("export.pdfAction")}</>}
        </button>
        <button type="button" className="btn btn-soft" onClick={makeCsv}>
          <BarChart size="1.1em" /> {t("export.csvAction")}
        </button>
      </div>
      <p className="muted-note export-cost">
        {t("export.cost", { compressed: PDF_DOWNLOAD_KB, raw: PDF_RAW_KB })}
      </p>
      <p className="disclaimer">{t("export.disclaimer")}</p>
    </CollapsibleCard>
  );
}
