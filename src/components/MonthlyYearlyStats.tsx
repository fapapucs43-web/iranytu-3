import { useMemo, useState } from "react";
import { useApp } from "../state/AppContext";
import { CollapsibleCard } from "./ui/ui";
import { Calendar } from "../lib/icons";
import {
  monthStat,
  yearStat,
  availableMonths,
  availableYears,
  type PeriodStat,
} from "../lib/statsAgg";
import { t } from "../lib/i18n";

/**
 * Monthly/yearly statistics (Batch 2, P4 — Daylio/Moodfit parity).
 *
 * Pure aggregations from lib/statsAgg over the user's entries; a month and a
 * year selector browse history. Uses only existing style classes.
 */
function statBoxes(s: PeriodStat) {
  return [
    { value: s.daysLogged, label: "naplózott nap" },
    { value: s.avgMood ?? "—", label: t("stats.avgMoodScale") },
    { value: s.avgStress ?? "—", label: t("stats.avgStressScale") },
    { value: s.avgEnergy ?? "—", label: t("stats.avgEnergyScale") },
  ];
}

export default function MonthlyYearlyStats() {
  const { data } = useApp();
  const entries = data.entries;
  const [month, setMonth] = useState<string | null>(null);
  const [year, setYear] = useState<string | null>(null);

  const months = useMemo(() => availableMonths(entries), [entries]);
  const years = useMemo(() => availableYears(entries), [entries]);
  const activeMonth = month ?? months[0];
  const activeYear = year ?? years[0];

  const stat = useMemo(() => monthStat(entries, activeMonth), [entries, activeMonth]);
  const yearStatForActive = useMemo(
    () => yearStat(entries, activeYear),
    [entries, activeYear],
  );

  return (
    <CollapsibleCard
      id="insights-monthly-yearly"
      title={t("settings.sections.stats")}
      icon={<Calendar />}
      // Period plus the count, which is the summary the audit named as this
      // card's natural one: a collapsed card whose selector is hidden still has
      // to say WHICH period is selected, or the card is a label with no content.
      summary={t("stats.summary", { period: stat.label, count: stat.daysLogged })}
    >
      <div className="add-row">
        <label className="field-label" style={{ flex: 1 }} htmlFor="mys-month">
          {t("stats.monthLabel")}
          <select
            id="mys-month"
            className="text-input"
            value={activeMonth}
            onChange={(e) => setMonth(e.target.value)}
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {monthStat(entries, m).label}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label" style={{ flex: 1 }} htmlFor="mys-year">
          {t("stats.yearLabel")}
          <select
            id="mys-year"
            className="text-input"
            value={activeYear}
            onChange={(e) => setYear(e.target.value)}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="stat-grid">
        {statBoxes(stat).map((b) => (
          <div key={b.label} className="stat-box">
            <span className="stat-value">{b.value}</span>
            <span className="stat-label">{b.label}</span>
          </div>
        ))}
      </div>
      {stat.bestDay && stat.worstDay && (
        <p className="muted-note">
          Legjobb nap: {stat.bestDay.date} ({stat.bestDay.mood} pont) · Legnehezebb nap:{" "}
          {stat.worstDay.date} ({stat.worstDay.mood} pont)
        </p>
      )}

      <div className="stat-grid">
        <div className="stat-box">
          <span className="stat-value">{yearStatForActive.avgMood ?? "—"}</span>
          <span className="stat-label">{t("stats.yearAvgMood", { year: activeYear })}</span>
        </div>
        <div className="stat-box">
          <span className="stat-value">{yearStatForActive.daysLogged}</span>
          <span className="stat-label">{t("stats.yearDaysTotal", { year: activeYear })}</span>
        </div>
      </div>
    </CollapsibleCard>
  );
}
