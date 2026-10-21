/**
 * The pattern list, as a card on the analysis screen.
 *
 * WHY THE CARD READS THE WHOLE JOURNAL AND NOT THE SELECTED RANGE
 *
 * The range selector above governs the charts, which is a question about a
 * window. A pattern is not a question about a window: a weekday effect needs
 * several samples of that weekday, and a two-sided comparison needs three days
 * on each side, so the smallest thing this card can honestly report needs
 * roughly two weeks of history. Feeding it the range-filtered list would empty
 * the card for "ez a hét" and for "ez a hónap" — not because there is nothing
 * to say, but because a week cannot answer the question. So the card is given
 * `data.entries` whole, and its hint SAYS SO, because a reader who can see a
 * seven-day chart next to a card about their whole history should not have to
 * guess which one the card is using.
 *
 * The empty state is the module's own exported copy, not a second set of words
 * typed here: the module knows `MIN_ENTRIES`, so a card that repeated the
 * number would be a second place for it to be wrong.
 */
import { useMemo } from "react";
import { t } from "../lib/i18n";
import {
  INSUFFICIENT_DATA_HINT,
  INSUFFICIENT_DATA_TITLE,
  generateInsights,
  type PatternConfidence,
} from "../lib/patternInsights";
import type { Entry } from "../types";
import { CollapsibleCard, EmptyState } from "./ui/ui";
import { TrendingUp } from "../lib/icons";

/** Shown beside the confidence word. The sample is the honest part of it. */
const CONFIDENCE_LABEL: Record<PatternConfidence, string> = {
  strong: t("insights.patterns.confidenceStrong"),
  medium: t("insights.patterns.confidenceMedium"),
  weak: t("insights.patterns.confidenceWeak"),
};

export default function PatternInsightsCard({ entries }: { entries: Entry[] }) {
  const insights = useMemo(() => generateInsights(entries), [entries]);

  return (
    <CollapsibleCard
      id="insights-patterns"
      title={t("settings.sections.patterns")}
      icon={<TrendingUp />}
      // The count moves from the old `action` slot into the summary: a
      // collapsed card's only story is that one muted line, and "3 mintázat"
      // is exactly what a reader decides to open it for.
      summary={
        insights.length > 0
          ? t("insights.patterns.count", { count: insights.length })
          : t("insights.notEnoughData")
      }
    >
      {insights.length === 0 ? (
        <EmptyState
          icon={<TrendingUp />}
          title={INSUFFICIENT_DATA_TITLE}
          hint={INSUFFICIENT_DATA_HINT}
        />
      ) : (
        <>
          <p className="pattern-basis">{t("insights.patterns.basis", { count: entries.length })}</p>
          <ul className="pattern-list">
            {insights.map((insight) => (
              <li key={insight.id} className="pattern-row">
                <p className="pattern-text">{insight.text}</p>
                <p className="pattern-meta">
                  <span className="pattern-conf" data-level={insight.confidence}>
                    {CONFIDENCE_LABEL[insight.confidence]}
                  </span>
                  <span className="pattern-sample">{t("insights.patterns.sample", { count: insight.sample })}</span>
                </p>
              </li>
            ))}
          </ul>
          <p className="disclaimer">{t("insights.patterns.disclaimer")}</p>
        </>
      )}
    </CollapsibleCard>
  );
}
