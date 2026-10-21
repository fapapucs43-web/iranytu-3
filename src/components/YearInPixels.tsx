import { useMemo, useState } from "react";
import { useApp } from "../state/AppContext";
import { CollapsibleCard } from "./ui/ui";
import { MOODS, moodLabel } from "../lib/mood";
import { QUADRANT_COLORS, QUADRANT_LABELS } from "../lib/quadrant";
import {
  MONTH_ABBREVIATIONS,
  availableYears,
  monthMatrix,
  monthName,
} from "../lib/yearInPixels";
import { formatHuman, WEEKDAYS_SHORT } from "../lib/dates";
import { t } from "../lib/i18n";
import ContentIcon from "./ContentIcon";

/**
 * Year-in-Pixels mood calendar. One month at a time, each day a tile with its
 * number and a bar in the day's mood colour, and a line under the grid that
 * says which day was picked.
 *
 * The month names come from `MONTH_ABBREVIATIONS` and `monthName`, the weekday
 * names from `WEEKDAYS_SHORT`, the month caption from `monthLabel`, and the
 * cell geometry from the `.cal-*` rules the journal calendar already uses. The
 * colours are `matrix.cells[].color` and nothing else — this component picks
 * no colour of its own and maps no mood.
 */
export default function YearInPixels() {
  const { data } = useApp();
  const years = useMemo(() => availableYears(data.entries), [data.entries]);
  const [year, setYear] = useState(years[0]);
  const [month, setMonth] = useState(new Date().getMonth());
  const [selected, setSelected] = useState<string | null>(null);

  const matrix = useMemo(
    () => monthMatrix(year, month, data.entries),
    [year, month, data.entries],
  );

  // A picked day belongs to the month that was on screen when it was picked,
  // so changing month or year has to clear it — otherwise the line under the
  // grid describes a day that is no longer in the grid.
  const pickYear = (y: number) => {
    setYear(y);
    setSelected(null);
  };
  const pickMonth = (m: number) => {
    setMonth(m);
    setSelected(null);
  };

  const picked = selected ? matrix.cells.find((c) => c.date === selected) : undefined;
  const detail = picked
    ? `${formatHuman(picked.date)}: ${
        picked.quadrant
          ? QUADRANT_LABELS[picked.quadrant]
          : picked.level
            ? moodLabel(picked.level)
            : t("yearInPixels.noEntry")
      }`
    : t("yearInPixels.pickPrompt");

  const describe = (date: string, level: number | null, quadrant: string | null) =>
    `${formatHuman(date)}: ${
      quadrant ? QUADRANT_LABELS[quadrant as keyof typeof QUADRANT_LABELS] : level ? moodLabel(level) : t("yearInPixels.noEntry")
    }`;

  return (
    <CollapsibleCard
      id="insights-year"
      title={t("settings.sections.year")}
      icon={<ContentIcon name="Flower" />}
      summary={t("insights.year.summary")}
    >
      <div className="yip-years" role="group" aria-label={t("yearInPixels.yearLabel")}>
        {years.map((y) => (
          <button
            key={y}
            type="button"
            className={`yip-tile ${y === year ? "yip-tile-active" : ""}`}
            aria-pressed={y === year}
            onClick={() => pickYear(y)}
          >
            {y}
          </button>
        ))}
      </div>

      <div className="yip-months" role="group" aria-label={t("yearInPixels.monthLabel")}>
        {MONTH_ABBREVIATIONS.map((abbrev, i) => (
          <button
            key={abbrev}
            type="button"
            className={`yip-tile ${i === month ? "yip-tile-active" : ""}`}
            aria-label={monthName(i)}
            aria-pressed={i === month}
            onClick={() => pickMonth(i)}
          >
            {abbrev}
          </button>
        ))}
      </div>

      <p className="yip-subtitle">{matrix.label}</p>

      <div className="yip-legend">
        {/* Batch A: the four quadrant swatches lead the legend, because the
            quadrant days are the ones the new recorder produces. */}
        {(Object.keys(QUADRANT_COLORS) as (keyof typeof QUADRANT_COLORS)[]).map((q) => (
          <span key={q} className="yip-legend-item">
            <span
              className="yip-legend-swatch"
              style={{ background: QUADRANT_COLORS[q] }}
              aria-hidden="true"
            />
            {QUADRANT_LABELS[q]}
          </span>
        ))}
        {MOODS.map((m) => (
          <span key={m.level} className="yip-legend-item">
            <span
              className="yip-legend-swatch"
              style={{ background: m.color }}
              aria-hidden="true"
            />
            {m.label}
          </span>
        ))}
      </div>

      <div className="cal-grid" role="group" aria-label={t("yearInPixels.gridLabel", { month: matrix.label })}>
        {WEEKDAYS_SHORT.map((d) => (
          <span key={d} className="cal-weekday">
            {d}
          </span>
        ))}
        {matrix.cells.map((c) => (
          <button
            key={c.date}
            type="button"
            className={[
              "cal-day",
              "yip-cell",
              Number(c.date.slice(5, 7)) - 1 === month ? "" : "cal-outside",
              c.date === selected ? "yip-cell-selected" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-pressed={c.date === selected}
            aria-label={describe(c.date, c.level, c.quadrant)}
            onClick={() => setSelected(c.date === selected ? null : c.date)}
          >
            <span className="cal-num">{c.day}</span>
            <span
              className="yip-mood"
              style={c.color ? { background: c.color } : undefined}
              aria-hidden="true"
            />
          </button>
        ))}
      </div>

      <p className="yip-detail" aria-live="polite">
        {detail}
      </p>
    </CollapsibleCard>
  );
}
