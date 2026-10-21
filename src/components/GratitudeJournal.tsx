import { useEffect, useState } from "react";
import { useApp } from "../state/AppContext";
import { CollapsibleCard } from "./ui/ui";
import { formatHuman } from "../lib/dates";
import { t } from "../lib/i18n";
import { CalendarDays, X } from "../lib/icons";
import ContentIcon from "./ContentIcon";
import {
  addGratitude,
  deleteGratitude,
  getGratitudeEntries,
  getGratitudeForDate,
  subscribeGratitude,
} from "../lib/gratitude";

/**
 * Standalone gratitude journal (Batch 1, P11). One mindful entry per day;
 * history below. Mounted in the Eszköztár.
 */
export default function GratitudeJournal() {
  const { today, notify } = useApp();
  const [entries, setEntries] = useState(() => getGratitudeEntries());
  const [text, setText] = useState("");
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => subscribeGratitude(() => setEntries(getGratitudeEntries())), []);

  const todayEntry = getGratitudeForDate(today);

  function add() {
    const created = addGratitude(text, today);
    if (!created) {
      setNote(todayEntry ? t("tools.gratitude.alreadyToday") : t("tools.gratitude.needText"));
      return;
    }
    setText("");
    setNote(null);
    notify(t("tools.gratitude.saved"));
  }

  return (
    <CollapsibleCard
      id="tools-gratitude"
      title={t("tools.gratitude.title")}
      icon={<ContentIcon name="Heart" />}
      summary={t("tools.gratitude.intro")}
    >
      <p className="muted-note">{t("tools.gratitude.intro")}</p>

      {todayEntry ? (
        <p className="detail-note"><ContentIcon name="Heart" size="1.1em" /> {todayEntry.text}</p>
      ) : (
        <>
          <textarea
            className="text-area"
            rows={2}
            maxLength={500}
            aria-label={t("tools.gratitude.textareaLabel")}
            placeholder={t("tools.gratitude.placeholder")}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button type="button" className="btn btn-primary" onClick={add}>
            <ContentIcon name="Heart" size="1.1em" /> {t("tools.gratitude.saveButton")}
          </button>
        </>
      )}

      {note && <p className="muted-note">{note}</p>}

      {entries.length > 0 && (
        <>
          <p className="muted-note">{t("tools.gratitude.total", { count: entries.length })}</p>
          <ul className="goal-list">
            {entries.slice(0, 7).map((g) => (
              <li key={g.id} className="goal-row">
                <span className={g.date === today ? "" : "goal-done"}>
                  {g.date === today ? <ContentIcon name="Heart" size="1.1em" /> : <CalendarDays size="1.1em" />}
                  {g.text}
                  <small className="muted-note"> · {formatHuman(g.date)}</small>
                </span>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={t("tools.gratitude.deleteLabel")}
                  onClick={() => deleteGratitude(g.id)}
                >
                  <X size="1.1em" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </CollapsibleCard>
  );
}
