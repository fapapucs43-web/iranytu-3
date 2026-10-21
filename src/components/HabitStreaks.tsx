import { useEffect, useState } from "react";
import { todayISO, formatShort, toISODate } from "../lib/dates";
import { t } from "../lib/i18n";
import { CollapsibleCard } from "./ui/ui";
import { Plus, X } from "../lib/icons";
import ContentIcon from "./ContentIcon";
import {
  addHabit,
  deleteHabit,
  getHabits,
  habitStreak,
  isDone,
  subscribeHabits,
  toggleHabitDate,
  weeklyCount,
  HABIT_LIMIT,
} from "../lib/habits";
import { GlyphIcon } from "../state/IconSetContext";

const ICONS = ["💧", "🚶", "🧘", "😴", "🥗", "📚", "🚭", "☀️"];

/**
 * Daily habits with streaks and a weekly grid (Phase 3). Additive component;
 * storage lives in lib/habits.ts (own key), nothing existing changes.
 */
export default function HabitStreaks() {
  const today = todayISO();
  const [store, setStore] = useState(() => getHabits());
  const [icon, setIcon] = useState(ICONS[0]);
  const [label, setLabel] = useState("");
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => subscribeHabits(() => setStore(getHabits())), []);

  // Grid keys must be LOCAL dates — they are compared against habit checks,
  // which are stored with the same local dates (see lib/habits).
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today + "T12:00:00");
    d.setDate(d.getDate() - (6 - i));
    return toISODate(d);
  });

  function add() {
    const created = addHabit(icon, label);
    if (!created) {
      setNote(
        label.trim()
          ? t("tools.habits.dupOrLimit", { limit: HABIT_LIMIT })
          : t("tools.habits.needName"),
      );
      return;
    }
    setNote(t("tools.habits.added", { icon: created.icon, label: created.label }));
    setLabel("");
  }

  return (
    <CollapsibleCard
      id="tools-habits"
      title={t("tools.habits.title")}
      icon={<ContentIcon name="Flame" />}
      summary={t("tools.habits.intro")}
    >
      <p className="muted-note">{t("tools.habits.intro")}</p>

      <ul className="habit-list">
        {store.habits.map((h) => {
          const streak = habitStreak(h.id, today);
          return (
            <li key={h.id} className="habit-row">
              <div className="habit-info">
                <strong>
                  <GlyphIcon glyph={h.icon} /> {h.label}
                </strong>
                <small className="muted-note">
                  {streak > 0 ? t("tools.habits.streakDays", { days: streak }) : t("tools.habits.streakStart")} · {weeklyCount(h.id, today)}{t("tools.habits.weeklySuffix")}
                </small>
              </div>
              <div className="habit-week" role="group" aria-label={t("tools.habits.weekLabel", { label: h.label })}>
                {last7.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={`habit-day ${isDone(h.id, d) ? "habit-day-on" : ""}`}
                    aria-pressed={isDone(h.id, d)}
                    aria-label={`${h.label} — ${formatShort(d)}`}
                    title={formatShort(d)}
                    onClick={() => toggleHabitDate(h.id, d)}
                  >
                    {isDone(h.id, d) ? "✓" : ""}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="icon-btn"
                aria-label={t("tools.habits.removeLabel", { label: h.label })}
                onClick={() => deleteHabit(h.id)}
              >
                <X size="1.1em" />
              </button>
            </li>
          );
        })}
      </ul>

      <div className="pill-cloud" role="radiogroup" aria-label={t("tools.habits.iconGroup")}>
        {ICONS.map((choice) => (
          <button
            key={choice}
            type="button"
            aria-pressed={icon === choice}
            className={`pill ${icon === choice ? "pill-selected" : ""}`}
            onClick={() => setIcon(choice)}
          >
            {choice}
          </button>
        ))}
      </div>
      <div className="add-row">
        <input
          className="text-input"
          aria-label={t("tools.habits.nameLabel")}
          placeholder={t("tools.habits.placeholder")}
          value={label}
          maxLength={24}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <button type="button" className="btn btn-soft" onClick={add}>
          <Plus size="1.1em" /> {t("tools.habits.add")}
        </button>
      </div>
      {note && <p className="muted-note">{note}</p>}
    </CollapsibleCard>
  );
}
