/**
 * Per-medication dose times editor (Batch 3, P5), shown in Settings.
 *
 * Writes straight through setMedications, so it reuses the existing store
 * path. Times are validated and capped by lib/medReminders, which is the same
 * code the scheduler reads from — the editor can never produce a value the
 * scheduler would reject.
 */
import { useState } from "react";
import { useApp } from "../state/AppContext";
import { CollapsibleCard, Toggle } from "./ui/ui";
import { MAX_TIMES_PER_MED, isValidTime, minutesOf } from "../lib/medReminders";
import { Clock } from "../lib/icons";
import { t } from "../lib/i18n";

export default function MedicationTimesCard() {
  const { data, setMedications, notify } = useApp();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const meds = data.medications;

  function update(id: string, patch: Partial<(typeof meds)[number]>) {
    setMedications(meds.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }

  function addTime(id: string) {
    const value = (draft[id] ?? "").trim();
    const med = meds.find((m) => m.id === id);
    if (!med) return;
    if (!isValidTime(value)) {
      notify("Érvényes idő kell, pl. 08:00", "warn");
      return;
    }
    if (med.times.length >= MAX_TIMES_PER_MED) {
      notify(`Legfeljebb ${MAX_TIMES_PER_MED} időpont adható meg.`, "warn");
      return;
    }
    // Normalise here rather than via medDoseTimes: that helper also drops
    // medications whose reminder is off, which would delete the times we just
    // added. The rule we need is only "valid, unique, sorted, capped".
    const next = [...med.times.filter((t) => t !== value), value]
      .sort((a, b) => minutesOf(a) - minutesOf(b));
    update(id, { times: next });
    setDraft((d) => ({ ...d, [id]: "" }));
    notify("Időpont hozzáadva ⏰");
  }

  function removeTime(id: string, time: string) {
    const med = meds.find((m) => m.id === id);
    if (!med) return;
    update(id, { times: med.times.filter((t) => t !== time) });
  }

  // One mount, not two: the empty note and the editors are branches of the
  // same card, so they share one id in the collapse map. The inner block keeps
  // its original indentation — the wrap changed the nesting, not a single
  // line of the content.
  return (
    <CollapsibleCard
      id="settings-med-times"
      title={t("meds.times.title")}
      icon={<Clock />}
      summary={meds.length === 0 ? t("meds.times.empty") : t("meds.times.reminderNote")}
    >
      {meds.length === 0 ? (
        <p className="muted-note">{t("meds.times.empty")}</p>
      ) : (
        <>
      <p className="muted-note">{t("meds.times.reminderNote")}</p>

      {meds.map((med) => {
        // Show the medication's own times. medDoseTimes would hide them for a
        // medication whose reminder is off, which reads as data loss.
        const normalized = med.times
          .filter(isValidTime)
          .sort((a, b) => minutesOf(a) - minutesOf(b));
        const full = med.times.length >= MAX_TIMES_PER_MED;
        return (
          <div key={med.id} className="med-time-row">
            <div className="med-time-head">
              <strong>
                {med.name}
                {med.dose ? ` — ${med.dose}` : ""}
              </strong>
              <span className="muted-note">
                {t("meds.times.count", { count: med.times.length, max: MAX_TIMES_PER_MED })}
              </span>
            </div>

            {normalized.length > 0 ? (
              <div className="med-chip-list">
                {normalized.map((time) => (
                  <span key={time} className="med-chip">
                    {time}
                    <button
                      type="button"
                      className="med-chip-x"
                      aria-label={`${time} időpont törlése`}
                      onClick={() => removeTime(med.id, time)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="muted-note">{t("meds.times.none")}</p>
            )}

            <div className="add-row">
              <input
                className="text-input"
                type="time"
                aria-label={`${med.name} időpont hozzáadása`}
                value={draft[med.id] ?? ""}
                disabled={full}
                onChange={(e) => setDraft((d) => ({ ...d, [med.id]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTime(med.id);
                  }
                }}
              />
              <button
                type="button"
                className="btn btn-soft"
                disabled={full || !(draft[med.id] ?? "").trim()}
                onClick={() => addTime(med.id)}
              >
                {t("meds.times.add")}
              </button>
            </div>
            {full && (
              <p className="muted-note">{t("meds.times.maxReached", { max: MAX_TIMES_PER_MED })}</p>
            )}

            <Toggle
              label={t("meds.times.reminderLabel", { name: med.name })}
              hint={t("meds.times.reminderHint")}
              checked={med.remind !== false}
              onChange={(v) => update(med.id, { remind: v })}
            />
          </div>
        );
      })}
        </>
      )}
    </CollapsibleCard>
  );
}
