/**
 * Batch A — the two new insight cards.
 *
 * Phase 2b: both are `CollapsibleCard`s now (the phase converts every tile on
 * every tab), so each carries an id in the `belso-iranytu:cardStates`
 * vocabulary and a summary taken from its own list label — the collapsed line
 * is the question the list answers. They still render empty-state lines when
 * the data cannot answer, in the app's usual voice.
 */
import { useMemo } from "react";
import { useApp } from "../state/AppContext";
import { CollapsibleCard, EmptyState } from "./ui/ui";
import { QUADRANT_COLORS, QUADRANT_LABELS, QUADRANTS } from "../lib/quadrant";
import {
  emotionContextRows,
  quadrantSleepRows,
} from "../lib/quadrantCorrelations";
import { Moon } from "../lib/icons";
import { t } from "../lib/i18n";
import ContentIcon from "./ContentIcon";

export function EmotionContextCard() {
  const { data } = useApp();
  const rows = useMemo(() => emotionContextRows(data.entries), [data.entries]);

  return (
    <CollapsibleCard
      id="insights-emotion-context"
      title={t("settings.sections.quadrants")}
      icon={<ContentIcon name="Users" />}
      summary={t("quadrants.emotion.listLabel")}
    >
      {rows.length === 0 ? (
        <EmptyState
          icon="🫂"
          title={t("insights.notEnoughData")}
          hint={t("quadrants.emotion.emptyHint")}
        />
      ) : (
        <ul className="insight-list" aria-label={t("quadrants.emotion.listLabel")}>
          {rows.slice(0, 8).map((row) => (
            <li key={`${row.emotion}-${row.contextLabel}`} className="insight-row">
              <span aria-hidden="true">🫂</span>{" "}
              {t("quadrants.emotion.row", {
                emotion: row.emotion,
                context: row.contextLabel,
                together: row.together,
                days: row.emotionDays,
                // The key carries the `%`, so the number goes in bare. Passing
                // `${row.percent}%` here renders "60%%" — and nothing else in the
                // suite sees it, because the key is used, the raw string is gone
                // and the sweep guard is green. The wiring is asserted in
                // `tests/lib/i18n.test.ts`.
                // The key carries the `%`, so the number goes in bare. Passing
                // `${row.percent}%` renders "60%%" — and nothing else in the
                // suite sees that, because the key is used, the raw string is
                // gone and the sweep guard is green. The wiring is asserted in
                // `tests/lib/i18n.test.ts`.
                //
                // `?? ""` and not a `0`: the type allows null, and the JSX this
                // replaced rendered a null as NOTHING — an empty bracket pair,
                // not a zero. A silent "0%" would be a claim the data never
                // made.
                percent: row.percent ?? "",
              })}
            </li>
          ))}
        </ul>
      )}
    </CollapsibleCard>
  );
}

export function QuadrantSleepCard() {
  const { data } = useApp();
  const rows = useMemo(() => quadrantSleepRows(data.entries), [data.entries]);
  const answered = rows.filter((r) => r.avgSleep !== null);

  return (
    <CollapsibleCard
      id="insights-quadrant-sleep"
      title={t("quadrants.sleepTitle")}
      icon={<Moon />}
      summary={t("quadrants.sleep.listLabel")}
    >
      {answered.length === 0 ? (
        <EmptyState
          icon="😴"
          title={t("insights.notEnoughData")}
          hint={t("quadrants.sleep.emptyHint")}
        />
      ) : (
        <ul className="insight-list" aria-label={t("quadrants.sleep.listLabel")}>
          {rows.map((row) => (
            <li key={row.quadrant} className="insight-row">
              <span
                aria-hidden="true"
                style={{ display: "inline-block", width: "0.8em", height: "0.8em", borderRadius: "50%", background: QUADRANT_COLORS[row.quadrant] }}
              />{" "}
              <strong>{QUADRANT_LABELS[row.quadrant]}</strong>:{" "}
              {row.avgSleep === null
                ? t("quadrants.sleep.fewData")
                : t("quadrants.sleep.hours", { hours: row.avgSleep }) +
                  (row.delta !== null
                    ? " " +
                      t("quadrants.sleep.delta", {
                        sign: row.delta > 0 ? "+" : "",
                        delta: row.delta,
                      })
                    : "")}
            </li>
          ))}
        </ul>
      )}
      <p className="disclaimer">{t("insights.more.disclaimer")}</p>
    </CollapsibleCard>
  );
}

/** Both cards, in the order the batch lists them. */
export default function QuadrantInsightCards() {
  return (
    <>
      <EmotionContextCard />
      <QuadrantSleepCard />
    </>
  );
}

/** Kept for tests: the quadrant order the sleep card renders. */
export const SLEEP_CARD_ORDER = QUADRANTS;
