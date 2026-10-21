import { useMemo } from "react";
import { useApp } from "../state/AppContext";
import { CollapsibleCard } from "./ui/ui";
import { useCustomTrackers } from "../lib/customTrackers";
import { useCustomActivities } from "../lib/customActivities";
import { buildCorrelationGrid, cellTone, MIN_SAMPLES } from "../lib/correlationGrid";
import { Table } from "../lib/icons";
import { ActivityLabel, GlyphIcon } from "../state/IconSetContext";
import { t } from "../lib/i18n";

/**
 * Correlation matrix (Batch 2, P7 — Bearable parity).
 *
 * Rows: activities (built-in + custom), columns: outcomes (mood, stress,
 * energy, sleep, plus every built-in numeric tracker that has been recorded
 * and every numeric custom tracker). Each cell shows the average difference vs
 * the days without that activity; cells with fewer than MIN_SAMPLES data points
 * stay empty to avoid noise.
 */
export default function CorrelationGrid() {
  const { data } = useApp();
  const customTrackers = useCustomTrackers();
  const customActivities = useCustomActivities();

  const numericTrackers = useMemo(
    () =>
      customTrackers
        .filter((t) => t.kind === "slider")
        .map((t) => ({ id: t.id, icon: t.icon, label: t.label })),
    [customTrackers],
  );

  const grid = useMemo(
    () =>
      buildCorrelationGrid({
        entries: data.entries,
        customNumericTrackers: numericTrackers,
        customActivities: customActivities.map((a) => ({ icon: a.icon, label: a.label })),
      }),
    [data.entries, numericTrackers, customActivities],
  );

  return (
    <CollapsibleCard
      id="insights-correlation"
      title={t("settings.sections.grid")}
      icon={<Table />}
      summary={
        grid.rows.length === 0
          ? t("insights.notEnoughData")
          : t("insights.grid.summary", { rows: grid.rows.length, cols: grid.outcomes.length })
      }
    >
      <p className="muted-note">{t("insights.grid.explain", { min: MIN_SAMPLES })}</p>
      {grid.rows.length === 0 ? (
        <p className="muted-note">{t("insights.grid.emptyHint")}</p>
      ) : (
        <div className="corr-matrix-wrap" role="region" aria-label={t("insights.grid.tableLabel")} tabIndex={0}>
          <table className="corr-matrix">
            <thead>
              <tr>
                <th scope="col">
                  <span className="visually-hidden">{t("insights.grid.rowHeader")}</span>
                </th>
                {grid.outcomes.map((o) => (
                  <th scope="col" key={o.id} title={o.label}>
                    <span aria-hidden="true"><GlyphIcon glyph={o.icon} /></span>
                    <span className="visually-hidden">{o.label}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.rows.map((row) => (
                <tr key={row.label}>
                  <th scope="row" title={row.label}>
                    <ActivityLabel label={row.label} />
                  </th>
                  {grid.outcomes.map((o) => {
                    const cell = row.cells[o.id];
                    if (!cell) return <td key={o.id}>—</td>;
                    const tone = cellTone(cell, o);
                    if (tone === "none") {
                      return (
                        <td key={o.id} className="corr-cell-empty" title={t("insights.grid.tooFewSamples", { min: MIN_SAMPLES })}>
                          ·
                        </td>
                      );
                    }
                    const d = cell.delta ?? 0;
                    const arrow = tone === "up" ? "▲" : tone === "down" ? "▼" : "•";
                    // A neutral outcome (calories, temperature, workout length)
                    // reports direction only. Saying "jobb" there would be the
                    // app deciding that more calories is a better day.
                    const effect =
                      o.higherIsBetter === null
                        ? d > 0
                          ? t("insights.grid.effectLarger")
                          : t("insights.grid.effectSmaller")
                        : tone === "up"
                          ? t("insights.grid.effectBetter")
                          : t("insights.grid.effectWorse");
                    const label =
                      tone === "flat"
                        ? t("insights.grid.flat", { count: cell.count })
                        : t("insights.grid.cellEffect", {
                            label: o.label,
                            delta: Math.abs(d),
                            effect,
                            count: cell.count,
                          });
                    return (
                      <td key={o.id} className={`corr-cell corr-${tone}`} title={label}>
                        {arrow} {tone === "flat" ? "0" : Math.abs(d)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CollapsibleCard>
  );
}
