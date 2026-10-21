import { useState } from "react";
import { useApp } from "../state/AppContext";
import { CollapsibleCard } from "./ui/ui";
import { Plus, Target, X } from "../lib/icons";
import { t } from "../lib/i18n";

export default function DailyGoals() {
  const { data, today, setGoals, notify } = useApp();
  const [text, setText] = useState("");
  const todayGoals = data.goals.filter((g) => g.date === today);
  const done = todayGoals.filter((g) => g.done).length;
  const percent = todayGoals.length ? Math.round((done / todayGoals.length) * 100) : 0;

  function add() {
    // `value`, not `t`: `t` is the imported translation function, and a local of
    // that name inside a component that now calls `t(...)` eight lines later is
    // a shadow waiting for the next edit. `CustomTrackerManager` had the same
    // shadow on its `map` and `find` callbacks, renamed to `item` there.
    const value = text.trim();
    if (!value) return;
    setGoals([...data.goals, { id: crypto.randomUUID(), text: value, done: false, date: today }]);
    setText("");
  }

  function toggle(id: string) {
    setGoals(data.goals.map((g) => (g.id === id ? { ...g, done: !g.done } : g)));
  }

  function remove(id: string) {
    setGoals(data.goals.filter((g) => g.id !== id));
  }

  return (
    <CollapsibleCard
      id="today-daily-goals"
      title={t("goals.title")}
      icon={<Target />}
      summary={todayGoals.length === 0
        ? t("goals.empty")
        : t("goals.progress", { done, total: todayGoals.length, percent })}
    >
      {todayGoals.length > 0 && (
        <div className="progress-track" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
          <div className="progress-fill" style={{ width: `${percent}%` }} />
        </div>
      )}
      <ul className="goal-list">
        {todayGoals.map((goal) => (
          <li key={goal.id} className="goal-row">
            <label className="check-row">
              <input type="checkbox" checked={goal.done} onChange={() => toggle(goal.id)} />
              <span className={goal.done ? "goal-done" : ""}>{goal.text}</span>
            </label>
            <button
              type="button"
              className="icon-btn"
              aria-label={t("goals.deleteLabel", { text: goal.text })}
              onClick={() => remove(goal.id)}
            >
              <X size="1.1em" />
            </button>
          </li>
        ))}
      </ul>
      <div className="add-row">
        <input
          className="text-input"
          aria-label={t("goals.newLabel")}
          placeholder={t("goals.newPlaceholder")}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <button type="button" className="btn btn-soft" onClick={add}>
          <Plus size="1.1em" /> {t("common.add")}
        </button>
      </div>
      {notify === null && <span />}
    </CollapsibleCard>
  );
}
