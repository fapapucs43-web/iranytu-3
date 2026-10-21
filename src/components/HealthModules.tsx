/**
 * The health-module cards that used to be defined inline in `ToolsView`.
 *
 * They moved here when the health half of the record left Felfedezés's drawer
 * for the Egészség tab: the three of them are the modules' own cards — vitals,
 * medication, the week's nutrition — and they are mounted by `HealthView` now.
 * The ids (`tools-vitals`, `tools-meds`, `tools-weekly-nutrition`) keep their
 * names on purpose: they are storage keys, so a reader who left one open finds
 * it open on the new tab. The `tools.` prefix is historical now, exactly as
 * `settings-nutrition-tips` is on the cards beside them — an id is a contract
 * with the reader's stored state, not a description of where the card lives.
 */
import { useMemo, useState } from "react";
import { useApp, useTodayEntry } from "../state/AppContext";
import { CollapsibleCard } from "./ui/ui";
import ContentIcon from "./ContentIcon";
import { t } from "../lib/i18n";
import { nextDose, medDoseTimes } from "../lib/medReminders";
import { weeklySummary, SAFETY_NOTE } from "../lib/nutritionTips";
import { todayISO } from "../lib/dates";
import { Clock } from "../lib/icons";

/* --------------------------- MiniVitals --------------------------- */

export function MiniVitals() {
  const { today, saveEntry, notify } = useApp();
  const existing = useTodayEntry();
  const [sleep, setSleep] = useState(existing?.vitals.sleepHours?.toString() ?? "");
  const [hr, setHr] = useState(existing?.vitals.restingHr?.toString() ?? "");
  const [hrv, setHrv] = useState(existing?.vitals.hrv?.toString() ?? "");

  function save() {
    // Only vitals — merged onto the existing day, nothing else is overwritten.
    saveEntry({
      date: today,
      vitals: {
        sleepHours: sleep ? Number(sleep) : null,
        restingHr: hr ? Number(hr) : null,
        hrv: hrv ? Number(hrv) : null,
      },
    });
    notify(t("today.vitals.saved"));
  }

  // "x/3 érték rögzítve" — from the LIVE form state, so the collapsed line
  // always matches the boxes above it, saved or not.
  const filled = [sleep, hr, hrv].filter((v) => v.trim() !== "").length;

  return (
    <CollapsibleCard
      id="tools-vitals"
      title={t("today.vitals.title")}
      icon={<ContentIcon name="Bed" />}
      summary={t("today.vitals.summary", { n: filled })}
    >
      <label className="field-label" htmlFor="vit-sleep">{t("today.vitals.sleep")}</label>
      <input
        id="vit-sleep"
        className="text-input"
        type="number"
        min={0}
        max={24}
        step={0.5}
        value={sleep}
        onChange={(e) => setSleep(e.target.value)}
      />
      <label className="field-label" htmlFor="vit-hr">{t("today.vitals.restingHr")}</label>
      <input
        id="vit-hr"
        className="text-input"
        type="number"
        min={30}
        max={220}
        value={hr}
        onChange={(e) => setHr(e.target.value)}
      />
      <label className="field-label" htmlFor="vit-hrv">{t("today.vitals.hrv")}</label>
      <input
        id="vit-hrv"
        className="text-input"
        type="number"
        min={5}
        max={200}
        value={hrv}
        onChange={(e) => setHrv(e.target.value)}
      />
      <button type="button" className="btn btn-soft btn-block" onClick={save}>
        {t("today.vitals.save")}
      </button>
      <p className="muted-note">{t("today.vitals.note")}</p>
    </CollapsibleCard>
  );
}

/* ---------------------------- MiniMeds ---------------------------- */

export function MiniMeds() {
  const { data, today, setMedications, toggleMedication, notify } = useApp();
  const meds = data.medications;
  const [newMed, setNewMed] = useState("");
  const checked = data.medicationChecks[today] ?? {};
  const next = useMemo(() => nextDose(meds, new Date()), [meds]);

  function add() {
    const name = newMed.trim();
    if (!name) return;
    setMedications([...meds, { id: crypto.randomUUID(), name, dose: "", times: [] }]);
    setNewMed("");
    notify(t("today.meds.added"));
  }

  // "x/y gyógyszer bevéve" — the daily tick-count the checkbox rows above
  // show, and the empty-list sentence when there is nothing to tick yet.
  const taken = meds.filter((m) => checked[m.id]).length;

  return (
    <CollapsibleCard
      id="tools-meds"
      title={t("today.meds.title")}
      icon={<Clock />}
      summary={
        meds.length === 0
          ? t("today.meds.empty")
          : t("today.meds.summary", { on: taken, total: meds.length })
      }
    >
      {meds.length === 0 && (
        <>
          <p className="muted-note">
            {t("today.meds.empty")}
          </p>
          <div className="add-row">
            <input
              className="text-input"
              aria-label={t("today.meds.nameLabel")}
              placeholder={t("today.meds.placeholderExample")}
              value={newMed}
              onChange={(e) => setNewMed(e.target.value)}
            />
            <button type="button" className="btn btn-soft" onClick={add}>
              {t("today.meds.add")}
            </button>
          </div>
        </>
      )}
      {meds.length > 0 && next && (
        <p className="next-dose-note">
          <Clock size="1.1em" />{" "}
          {next.dose.dose
            ? t("today.meds.nextDoseWithAmount", {
                time: next.dose.time,
                name: next.dose.name,
                amount: next.dose.dose,
              })
            : t("today.meds.nextDose", { time: next.dose.time, name: next.dose.name })}
        </p>
      )}
      {meds.map((med) => {
        const doses = medDoseTimes([med]);
        return doses.length > 0 ? (
          <div key={med.id} className="med-time-row">
            {doses.map((d) => (
              <label key={d.time} className="check-row">
                <input
                  type="checkbox"
                  checked={Boolean(checked[med.id])}
                  onChange={() => toggleMedication(today, med.id)}
                />
                <span>
                  <strong>{d.time}</strong> · {med.name}
                  {med.dose ? ` — ${med.dose}` : ""}
                </span>
              </label>
            ))}
          </div>
        ) : (
          <label key={med.id} className="check-row">
            <input
              type="checkbox"
              checked={Boolean(checked[med.id])}
              onChange={() => toggleMedication(today, med.id)}
            />
            <span>
              {med.name}
              {med.dose ? ` — ${med.dose}` : ""}
            </span>
          </label>
        );
      })}
      {meds.length > 0 && (
        <div className="add-row">
          <input
            className="text-input"
            aria-label={t("today.meds.nameLabel")}
            placeholder={t("today.meds.placeholderMore")}
            value={newMed}
            onChange={(e) => setNewMed(e.target.value)}
          />
          <button type="button" className="btn btn-soft" onClick={add}>
            {t("today.meds.add")}
          </button>
        </div>
      )}
    </CollapsibleCard>
  );
}

/* ------------------------- WeeklyNutritionCard --------------------- */

/**
 * The week's nutrition in one card. Null until three days in the week carry a
 * calorie estimate — the module's rule, applied before anything renders. The
 * safety result replaces the whole suggestion area when it trips: one calm
 * line, the exact mandated wording, and nothing riding along with it.
 */
export function WeeklyNutritionCard() {
  const { data } = useApp();
  const summary = weeklySummary(data.entries, todayISO());
  if (!summary) return null;
  return (
    <CollapsibleCard
      id="tools-weekly-nutrition"
      title={t("today.weeklyNutrition.title")}
      icon={<ContentIcon name="Salad" />}
      summary={
        summary.safety
          ? t("today.weeklyNutrition.summarySafety")
          : t("today.weeklyNutrition.summary", { days: summary.days, avg: summary.avgKcal ?? "" })
      }
    >
      {summary.safety ? (
        <p className="muted-note nutrition-safety">{SAFETY_NOTE}</p>
      ) : (
        <>
          <p className="muted-note">
            {t("today.weeklyNutrition.summary", { days: summary.days, avg: summary.avgKcal ?? "" })}
          </p>
          {summary.suggestion && <p className="muted-note">{summary.suggestion}</p>}
        </>
      )}
    </CollapsibleCard>
  );
}
