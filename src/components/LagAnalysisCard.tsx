import { useMemo } from "react";
import { useApp } from "../state/AppContext";
import { CollapsibleCard } from "./ui/ui";
import { deltaLabel, lagStats } from "../lib/lagAnalysis";
import { Hourglass } from "../lib/icons";
import { t } from "../lib/i18n";

/**
 * Lag analysis card (Phase 3): shows how mood tends to look on the tagged day,
 * the day after and two days after — versus untagged baseline days.
 */
export default function LagAnalysisCard() {
  const { data } = useApp();
  const stats = useMemo(() => lagStats(data.entries), [data.entries]);

  return (
    <CollapsibleCard
      id="insights-lag"
      title={t("settings.sections.lag")}
      icon={<Hourglass />}
      summary={
        stats.length === 0
          ? t("lag.summaryEmpty")
          : t("lag.summaryFilled", { count: stats.length })
      }
    >
      <p className="muted-note">{t("lag.intro")}</p>

      {stats.length === 0 ? (
        <p className="muted-note">{t("lag.needsData")}</p>
      ) : (
        <ul className="lag-list">
          {stats.map((s) => {
            const d0 = deltaLabel(s.sameDay, s.baseline);
            const d1 = deltaLabel(s.nextDay, s.baseline);
            const d2 = deltaLabel(s.dayAfter, s.baseline);
            return (
              <li key={s.tag} className="lag-row">
                <div className="lag-tag">
                  <strong>{s.tag}</strong>
                  <small className="muted-note">{t("lag.daysLabel", { count: s.count })}</small>
                </div>
                <div className="lag-deltas">
                  <span className="lag-cell" title={t("lag.titleDay0")}>
                    {t("lag.cellDay0")} <strong>{d0 ?? "—"}</strong>
                  </span>
                  <span className="lag-cell" title={t("lag.titleDay1")}>
                    {t("lag.cellDay1")} <strong>{d1 ?? "—"}</strong>
                  </span>
                  <span className="lag-cell" title={t("lag.titleDay2")}>
                    {t("lag.cellDay2")} <strong>{d2 ?? "—"}</strong>
                  </span>
                  <span className="lag-cell lag-base" title={t("lag.titleBaseline")}>
                    {t("lag.cellBaseline")} <strong>{Math.round(s.baseline)}</strong>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="disclaimer">{t("lag.disclaimer")}</p>
    </CollapsibleCard>
  );
}
