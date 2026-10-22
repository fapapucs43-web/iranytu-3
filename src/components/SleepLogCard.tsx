/**
 * The sleep log, in the Egészség tab's "Egyéb" section.
 *
 * WHY IT IS NOT A TRACKER ROW
 * A tracker asks one number. A night is a pair of times plus a feeling, and
 * the pair is what lets the correlation on the Elemzés tab exist at all. The
 * card keeps the reader's own entries visible underneath the form — a log
 * nobody can read back is a form, not a record.
 */
import { useEffect, useState } from "react";
import { CollapsibleCard } from "./ui/ui";
import ContentIcon from "./ContentIcon";
import { todayISO, formatHuman } from "../lib/dates";
import { useApp } from "../state/AppContext";
import {
  SLEEP_QUALITY_LABELS,
  deleteSleepRecord,
  describeDuration,
  loadSleepLog,
  saveSleepRecord,
  subscribeSleepLog,
  type SleepQuality,
  type SleepRecord,
} from "../lib/sleepLog";

const QUALITIES: SleepQuality[] = [1, 2, 3, 4, 5];

export default function SleepLogCard() {
  const { notify } = useApp();
  const [records, setRecords] = useState<SleepRecord[]>(() => loadSleepLog());
  const [date, setDate] = useState(todayISO());
  const [bedTime, setBedTime] = useState("23:00");
  const [wakeTime, setWakeTime] = useState("07:00");
  const [quality, setQuality] = useState<SleepQuality>(3);

  useEffect(() => subscribeSleepLog(setRecords), []);

  const latest = records[0];
  const summary = latest
    ? `${latest.quality}/5 · ${describeDuration(latest) ?? "—"}`
    : "Lefekvés, ébredés és alvásminőség";

  function save() {
    const next = saveSleepRecord({ date, bedTime, wakeTime, quality });
    setRecords(next);
    notify("Alvásnapló mentve.");
  }

  // `Bed` is the registry's own sleep glyph (😴), not `Moon`: `Moon` is a
  // CHROME name in `lib/icon-policy.ts`, and `ContentIcon` only draws a
  // picture the reader's chosen set actually switches.
  return (
    <CollapsibleCard
      id="health-sleep-log"
      title="Alvásnapló"
      icon={<ContentIcon name="Bed" />}
      summary={summary}
    >
      <p className="muted-note">
        Nem az órák száma a lényeg, hanem hogy mikor aludtál és hogyan érezted magad
        utána. A napló az ébredés napjára kerül.
      </p>

      <label className="field-label" htmlFor="sleep-date">
        Ébredés napja
      </label>
      <input
        id="sleep-date"
        className="text-input"
        type="date"
        value={date}
        max={todayISO()}
        onChange={(e) => setDate(e.target.value)}
      />

      <div className="sleep-times">
        <label className="field-label" htmlFor="sleep-bed">
          Lefekvés
          <input
            id="sleep-bed"
            className="text-input"
            type="time"
            value={bedTime}
            onChange={(e) => setBedTime(e.target.value)}
          />
        </label>
        <label className="field-label" htmlFor="sleep-wake">
          Ébredés
          <input
            id="sleep-wake"
            className="text-input"
            type="time"
            value={wakeTime}
            onChange={(e) => setWakeTime(e.target.value)}
          />
        </label>
      </div>
      <p className="muted-note">{describeDuration({ bedTime, wakeTime }) ?? "—"}</p>

      <p className="field-label">Milyen volt az alvás?</p>
      <div className="sleep-quality" role="group" aria-label="Alvásminőség">
        {QUALITIES.map((q) => (
          <button
            key={q}
            type="button"
            className={`sleep-quality-btn${quality === q ? " sleep-quality-on" : ""}`}
            aria-pressed={quality === q}
            onClick={() => setQuality(q)}
          >
            <strong>{q}</strong>
            <small>{SLEEP_QUALITY_LABELS[q]}</small>
          </button>
        ))}
      </div>

      <button type="button" className="btn btn-soft btn-block" onClick={save}>
        Mentés
      </button>

      {records.length > 0 ? (
        <>
          <h3 className="sleep-log-title">Korábbi éjszakák</h3>
          <ul className="sleep-log-list">
            {records.slice(0, 7).map((r) => (
              <li key={r.date} className="sleep-log-row">
                <span>
                  <strong>{formatHuman(r.date)}</strong>{" "}
                  <span className="muted-note">
                    {r.bedTime}–{r.wakeTime} · {describeDuration(r) ?? "—"} · {r.quality}/5
                  </span>
                </span>
                <button
                  type="button"
                  className="btn btn-ghost"
                  aria-label={`${formatHuman(r.date)} éjszakájának törlése`}
                  onClick={() => setRecords(deleteSleepRecord(r.date))}
                >
                  Törlés
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </CollapsibleCard>
  );
}
