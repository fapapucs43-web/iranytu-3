import SectionList, {
  ReorderToggle,
  useSectionOrder,
  type SectionSpec,
} from "../components/SectionList";
import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useApp } from "../state/AppContext";
import {
  avg,
  avgMoodScore,
  personalInsights,
  tagCorrelations,
} from "../lib/analysis";
import { moodByLevel } from "../lib/mood";
import { addDays, formatShort, startOfWeek, todayISO } from "../lib/dates";
import { Collapsible, CollapsibleCard, EmptyState, SectionTitle, Segmented } from "../components/ui/ui";
import YearInPixels from "../components/YearInPixels";
import LagAnalysisCard from "../components/LagAnalysisCard";
import ReportExport from "../components/ReportExport";
import MonthlyYearlyStats from "../components/MonthlyYearlyStats";
import AchievementsCard from "../components/AchievementsCard";
import { GlyphIcon } from "../state/IconSetContext";
import CorrelationGrid from "../components/CorrelationGrid";
import QuadrantInsightCards from "../components/QuadrantInsightCards";
import PatternInsightsCard from "../components/PatternInsightsCard";
import { BarChart, Lightbulb, Link } from "../lib/icons";
import ContentIcon from "../components/ContentIcon";
import { t } from "../lib/i18n";

type Range = "week" | "month" | "all";

export const INSIGHTS_SECTION_IDS = [
  "week",
  "year",
  "trend",
  "correlation",
  "lag",
  "quadrants",
  "export",
  "stats",
  "achievements",
  "grid",
  "patterns",
  "more",
] as const;

export type InsightsSectionId = (typeof INSIGHTS_SECTION_IDS)[number];

export default function InsightsView({ onGoToday }: { onGoToday?: () => void }) {
  const { data } = useApp();
  const [range, setRange] = useState<Range>("week");

  const cutoff = useMemo(() => {
    if (range === "week") return addDays(todayISO(), -7);
    if (range === "month") return addDays(todayISO(), -30);
    return "0000-01-01";
  }, [range]);

  const entries = useMemo(
    () => data.entries.filter((e) => e.date >= cutoff),
    [data.entries, cutoff],
  );

  const chartData = useMemo(
    () =>
      [...entries]
        .reverse()
        .map((e) => ({
          day: formatShort(e.date),
          Hangulat: moodByLevel(e.mood).score,
          Stressz: e.stress * 10,
          Energia: e.energy * 10,
          ...(data.settings.vitalsModule && e.vitals.sleepHours != null
            ? { Alvás: e.vitals.sleepHours * 10 }
            : {}),
        })),
    [entries, data.settings.vitalsModule],
  );

  const correlations = useMemo(() => tagCorrelations(entries), [entries]);
  const insights = personalInsights(entries);

  const weekStart = startOfWeek(todayISO());
  const weekEntries = data.entries.filter((e) => e.date >= weekStart);

  if (data.entries.length === 0) {
    return (
      <div className="view">
        <SectionTitle icon={<ContentIcon name="Brain" />} title={t("insights.title")} hint={t("insights.hintEmpty")} />
        <EmptyState
          icon={<ContentIcon name="Compass" />}
          title={t("insights.empty.title")}
          hint={t("insights.empty.hint")}
          cta={
            <button type="button" className="btn btn-primary" onClick={onGoToday}>
              {t("insights.empty.cta")}
            </button>
          }
        />
      </div>
    );
  }


  /*
   * The tab's sections, as data (Phase 3b). Twelve of them, in the
   * order they were written: the three chart cards, the seven standalone
   * analysis cards, and the insight list at the bottom. Nothing moves in this
   * commit — the array renders in written order and the page is unchanged.
   */
  const sections: SectionSpec[] = [
    { id: "week" as InsightsSectionId, label: t("insights.week.title"), render: () => (
      <>
          <CollapsibleCard
            id="insights-week"
            title={t("insights.week.title")}
            icon={<BarChart />}
            summary={t("insights.week.summary", {
              score: Math.round(avgMoodScore(weekEntries)),
              days: weekEntries.length,
            })}
          >
            <div className="stat-grid">
              <div className="stat-box">
                <span className="stat-value">{Math.round(avgMoodScore(weekEntries))}</span>
                <span className="stat-label">{t("insights.week.avgMood")}</span>
              </div>
              <div className="stat-box">
                <span className="stat-value">{weekEntries.length}</span>
                <span className="stat-label">{t("insights.week.days")}</span>
              </div>
              <div className="stat-box">
                <span className="stat-value">{Math.round(avg(weekEntries, "stress") * 10) / 10}</span>
                <span className="stat-label">{t("insights.week.avgStress")}</span>
              </div>
              <div className="stat-box">
                <span className="stat-value">{Math.round(avg(weekEntries, "energy") * 10) / 10}</span>
                <span className="stat-label">{t("insights.week.avgEnergy")}</span>
              </div>
            </div>
          </CollapsibleCard>
      </>
    ) },
    { id: "year" as InsightsSectionId, label: t("settings.sections.year"), render: () => (
      <>
          {/* Batch 7k: the year grid is second, not fourth. The week's numbers are a
              glance; the year is the payoff of having journaled at all, and the one
              view a returning user scrolls for. It sat below two charts it does not
              depend on. */}
          <YearInPixels />
      </>
    ) },
    { id: "trend" as InsightsSectionId, label: t("insights.trend.title"), render: () => (
      <>
          <CollapsibleCard
            id="insights-trend"
            title={t("insights.trend.title")}
            icon={<ContentIcon name="TrendingUp" />}
            summary={t("insights.trend.summary")}
          >
            <Segmented
              ariaLabel={t("insights.trend.rangeGroup")}
              options={[
                { value: "week", label: t("insights.trend.rangeWeek") },
                { value: "month", label: t("insights.trend.rangeMonth") },
                { value: "all", label: t("insights.trend.rangeAll") },
              ]}
              value={range}
              onChange={setRange}
            />
            {chartData.length < 2 ? (
              <p className="muted-note">{t("insights.trend.tooFew")}</p>
            ) : (
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                    <XAxis dataKey="day" tick={{ fontSize: 12 }} interval="preserveStartEnd" />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: "1px solid var(--line)", fontSize: 14 }}
                      formatter={(value: number | string) => value as number}
                    />
                    {/* `currentColor`, not the palette. These three lines carried a
                        frozen copy of the LIGHT theme's brand / danger / accent, so
                        they kept painting it after a switch to dark, warm or
                        vibrant. The tone class puts the right colour on `color`
                        and the line inherits it — see the note in styles.css for
                        why `var()` cannot be used here. */}
                    <Line
                      type="monotone"
                      dataKey="Hangulat"
                      className="chart-series chart-series-ok"
                      stroke="currentColor"
                      strokeWidth={3}
                      dot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="Stressz"
                      className="chart-series chart-series-bad"
                      stroke="currentColor"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="Energia"
                      className="chart-series chart-series-warn"
                      stroke="currentColor"
                      strokeWidth={2}
                      dot={false}
                    />
                    {/* Sleep keeps its literal: there is no `--ring-*` alias for a
                        fourth series, and minting one would change the twenty-one
                        custom properties and the DERIVED_PROPERTIES list in
                        tests/batch13-color-scheme. That is a bigger decision than
                        this commit, so it is left visible rather than quietly
                        absorbed. */}
                    {data.settings.vitalsModule && (
                      <Line type="monotone" dataKey="Alvás" stroke="#4c7fb0" strokeWidth={2} strokeDasharray="6 4" dot={false} />
                    )}
                  </LineChart>
                </ResponsiveContainer>
                <p className="muted-note">{t("insights.trend.scaleNote")}</p>
              </div>
            )}
          </CollapsibleCard>
      </>
    ) },
    { id: "correlation" as InsightsSectionId, label: t("insights.correlation.title"), render: () => (
      <>
          <CollapsibleCard
            id="insights-activity-correlation"
            title={t("insights.correlation.title")}
            icon={<Link />}
            summary={t("insights.correlation.summary")}
          >
            {correlations.length === 0 ? (
              <p className="muted-note">
                {t("insights.correlation.empty")}
              </p>
            ) : (
              <ul className="corr-list">
                {correlations.map((c) => (
                  <li key={c.tag} className="corr-row">
                    <div className="corr-info">
                      <strong>{c.tag}</strong>
                      <span>{t("insights.correlation.row", { count: c.count, avg: c.avgMood })}</span>
                    </div>
                    <span
                      className={`corr-delta ${c.delta >= 0 ? "corr-up" : "corr-down"}`}
                      aria-label={
                        c.delta >= 0
                          ? t("insights.correlation.ariaUp", { delta: Math.abs(c.delta) })
                          : t("insights.correlation.ariaDown", { delta: Math.abs(c.delta) })
                      }
                    >
                      {c.delta >= 0 ? "▲" : "▼"} {Math.abs(c.delta)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CollapsibleCard>
      </>
    ) },
    { id: "lag" as InsightsSectionId, label: t("settings.sections.lag"), render: () => (
      <>
          <LagAnalysisCard />
      </>
    ) },
    { id: "quadrants" as InsightsSectionId, label: t("settings.sections.quadrants"), render: () => (
      <>
          {/* Batch A — the two quadrant-era cards, between the lag analysis and
              the export: they read the same entries and answer different
              questions, so they sit with the other analysis cards. */}
          <QuadrantInsightCards />
      </>
    ) },
    { id: "export" as InsightsSectionId, label: t("settings.sections.export"), render: () => (
      <>
          <ReportExport />
      </>
    ) },
    { id: "stats" as InsightsSectionId, label: t("settings.sections.stats"), render: () => (
      <>
          <MonthlyYearlyStats />
      </>
    ) },
    { id: "achievements" as InsightsSectionId, label: t("settings.sections.achievements"), render: () => (
      <>
          <AchievementsCard />
      </>
    ) },
    { id: "grid" as InsightsSectionId, label: t("settings.sections.grid"), render: () => (
      <>
          <CorrelationGrid />
      </>
    ) },
    { id: "patterns" as InsightsSectionId, label: t("settings.sections.patterns"), render: () => (
      <>
          {/* Batch B, commit 4 — the pattern list. Given `data.entries` whole, not
              the range-filtered `entries`: a pattern needs more history than a
              window can hold, and the card's own hint says which set it used. */}
          <PatternInsightsCard entries={data.entries} />
      </>
    ) },
    { id: "more" as InsightsSectionId, label: t("insights.more.title"), render: () => (
      <>
          <Collapsible title={t("insights.more.title")} icon={<Lightbulb />} badge={t("insights.more.badge")}>
            <ul className="insight-list">
              {insights.map((item, i) => (
                <li key={i} className="insight-row">
                  <span aria-hidden="true"><GlyphIcon glyph={item.icon} /></span> {item.text}
                </li>
              ))}
            </ul>
            <p className="disclaimer">
              {t("insights.more.disclaimer")}
            </p>
          </Collapsible>
      </>
    ) },
  ];

  const [reordering, setReordering] = useState(false);
  const order = useSectionOrder("insights");

  return (
    <div className="view">
          <SectionTitle icon={<ContentIcon name="Brain" />} title={t("insights.title")} hint={t("insights.hintFull")} />

      <SectionList
        sections={sections}
        value={order.stored}
        onChange={order.setOrder}
        onReset={order.reset}
        rearranging={reordering}
      />
      <ReorderToggle active={reordering} onToggle={() => setReordering((v) => !v)} />
    </div>
  );
}
