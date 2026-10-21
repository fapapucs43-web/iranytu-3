/**
 * Mega Batch, commit 3 — the weekly reflection card, mounted on Today.
 *
 * ONE PROMPT A WEEK, AND NO PRESSURE
 * The card is offer-shaped, not task-shaped. It does not nag, it does not
 * count streaks, and it disappears the moment it is answered or skipped — the
 * same reasoning as the micro-lesson card: on a mental-health app, a prompt
 * that reappears after being answered reads as a demand.
 *
 * WHAT PERSISTS
 *   - the ANSWER, under its own sidecar key, one string per week key;
 *   - the SKIP, also under its own key, because "I don't want to answer this
 *     week" is a real answer and re-offering the same prompt would ignore it;
 *   - a MIRROR of the answer appended to that day's journal note, so the words
 *     are findable next to everything else the user wrote that day.
 *
 * WHAT DOES NOT
 * The note mirror is the one operation here that could lose data, because
 * `store.ts`'s `mergeEntry` overwrites any field a patch supplies. The
 * safeguarding is a PURE function (`buildNoteWithReflection`) rather than
 * something hidden in this file, so it can be tested directly — a test that
 * had to click a button to check this would never be written.
 */
import { useState } from "react";
import { CollapsibleCard } from "./ui/ui";
import { Calendar } from "../lib/icons";
import { t } from "../lib/i18n";
import {
  buildNoteWithReflection,
  getWeeklyAnswer,
  isWeekSkipped,
  markWeekSkipped,
  promptForWeekKey,
  saveWeeklyAnswer,
  weekKeyOf,
} from "../lib/weeklyReflection";
import { useApp } from "../state/AppContext";

export default function WeeklyReflectionCard() {
  const { data, today, saveEntry, notify } = useApp();
  const [text, setText] = useState("");

  const key = weekKeyOf(today);
  const prompt = promptForWeekKey(key);
  const saved = getWeeklyAnswer(key);
  const skipped = isWeekSkipped(key);

  const done = saved !== null || skipped;

  function save() {
    const answer = text.trim();
    if (!answer) return;
    saveWeeklyAnswer(key, answer);
    // The mirror goes through the pure builder, so the user's own note for the
    // day is preserved and a previous block is replaced rather than stacked.
    const existing = data.entries.find((e) => e.date === today)?.note ?? "";
    saveEntry({ date: today, note: buildNoteWithReflection(existing, prompt.question, answer) });
    setText("");
    notify("Heti reflektálás elmentve 🌿");
  }

  return (
    <CollapsibleCard
      id="today-weekly-reflection"
      title={t("settings.sections.reflection")}
      icon={<Calendar />}
      summary={done
        ? skipped
          ? "E heti kérdés kihagyva."
          : "Eheti reflektálás: ✅ elmentve"
        : prompt.theme}
    >
      {done ? (
        // One line, and no way back in: answering or skipping ends the week.
        <p className="muted-note">
          {skipped ? "E heti kérdés kihagyva." : "Eheti reflektálás: ✅ elmentve"}
        </p>
      ) : (
        <>
          <p className="week-theme">{prompt.theme}</p>
          <p className="week-question">{prompt.question}</p>
          {prompt.hint && <p className="muted-note">{prompt.hint}</p>}

          <textarea
            className="text-area"
            rows={3}
            maxLength={1000}
            placeholder={t("week.textPlaceholder")}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label={t("week.textLabel")}
          />

          <div className="week-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={text.trim().length === 0}
              onClick={save}
            >
              {t("week.save")}
            </button>
            <button type="button" className="btn btn-soft" onClick={() => markWeekSkipped(key)}>
              {t("week.skip")}
            </button>
          </div>
        </>
      )}
    </CollapsibleCard>
  );
}