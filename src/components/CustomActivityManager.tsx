import { useState } from "react";
import { addCustomActivity, removeCustomActivity, useCustomActivities } from "../lib/customActivities";
import { Plus, X } from "../lib/icons";
import { CollapsibleCard } from "./ui/ui";
import { t } from "../lib/i18n";
import { GlyphIcon } from "../state/IconSetContext";

const ICON_CHOICES = ["⭐", "🎨", "🐾", "☕", "🛠", "🎮", "📖", "🚗"];

/**
 * Manage user-defined activities (add/remove). Rendered inside the logging
 * flow's toolbox. Purely additive component — not yet mounted anywhere.
 */
export default function CustomActivityManager() {
  const activities = useCustomActivities();
  const [icon, setIcon] = useState(ICON_CHOICES[0]);
  const [label, setLabel] = useState("");
  const [note, setNote] = useState<string | null>(null);

  function add() {
    const created = addCustomActivity(icon, label);
    if (!created) {
      setNote(
        label.trim()
          ? t("tools.activity.dupOrLimit")
          : t("tools.activity.needName"),
      );
      return;
    }
    setNote(t("tools.activity.added", { icon: created.icon, label: created.label }));
    setLabel("");
  }

  return (
    <CollapsibleCard
      id="settings-custom-activities"
      title={t("tools.activity.title")}
      icon={<Plus />}
      summary={
        activities.length > 0
          ? t("tools.activity.summary", { n: activities.length })
          : t("tools.activity.summaryEmpty")
      }
    >
      <p className="muted-note">{t("tools.activity.intro")}</p>

      <div className="pill-cloud" role="radiogroup" aria-label={t("tools.activity.iconGroup")}>
        {ICON_CHOICES.map((choice) => (
          <button
            key={choice}
            type="button"
            role="radio"
            aria-checked={icon === choice}
            className={`pill ${icon === choice ? "pill-selected" : ""}`}
            onClick={() => setIcon(choice)}
          >
            {choice}
          </button>
        ))}
      </div>

      <input
        className="text-input"
        aria-label={t("tools.activity.nameLabel")}
        placeholder={t("tools.activity.placeholder")}
        value={label}
        maxLength={24}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
      />
      <button type="button" className="btn btn-soft" onClick={add}>
        {t("tools.activity.add")}
      </button>

      {note && <p className="muted-note">{note}</p>}

      {activities.length > 0 && (
        <ul className="goal-list">
          {activities.map((a) => (
            <li key={a.id} className="goal-row">
              <span>
                <GlyphIcon glyph={a.icon} /> {a.label}
              </span>
              <button
                type="button"
                className="icon-btn"
                aria-label={t("tools.activity.removeLabel", { label: a.label })}
                onClick={() => removeCustomActivity(a.id)}
              >
                <X size="1.1em" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </CollapsibleCard>
  );
}
