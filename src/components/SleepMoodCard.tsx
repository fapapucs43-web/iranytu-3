/**
 * Alvásminőség × hangulat — the correlation the sleep log exists for.
 *
 * It sits in the Elemzés tab's correlation section, next to the activity
 * correlations and the grid, because it is the same kind of claim: two numbers
 * on the same days, averaged, with a sample count. The wording says "együtt
 * járás" and never "okozza", which is the rule every surface in this tab keeps.
 *
 * Below the app's own sample floor it shows the band averages and says plainly
 * that an r is not being reported yet — a reader with four nights learns more
 * from "the four good nights averaged 70" than from a refusal to say anything.
 */
import { useEffect, useState } from "react";
import { CollapsibleCard } from "./ui/ui";
import ContentIcon from "./ContentIcon";
import { useApp } from "../state/AppContext";
import {
  describeSleepMood,
  loadSleepLog,
  sleepMoodCorrelation,
  subscribeSleepLog,
  type SleepRecord,
} from "../lib/sleepLog";

export default function SleepMoodCard() {
  const { data } = useApp();
  const [records, setRecords] = useState<SleepRecord[]>(() => loadSleepLog());

  useEffect(() => subscribeSleepLog(setRecords), []);

  const result = sleepMoodCorrelation(records, data.entries);
  const summary =
    result.n === 0
      ? "Még nincs közös nap"
      : result.r === null
        ? `${result.n} közös nap`
        : `r = ${result.r.toFixed(2)} · ${result.n} nap`;

  return (
    <CollapsibleCard
      id="insights-sleep-mood"
      title="Alvásminőség × hangulat"
      icon={<ContentIcon name="Bed" />}
      summary={summary}
    >
      {records.length === 0 ? (
        <p className="muted-note">
          Vezess alvásnaplót az Egészség fülön, és itt megjelenik, hogy a jobb éjszakák
          után jobb-e a hangulatod.
        </p>
      ) : (
        <>
          <p className="muted-note">{describeSleepMood(result)}</p>
          <ul className="corr-list">
            {result.bands.map((band) => (
              <li key={band.id} className="corr-row">
                <div className="corr-info">
                  <strong>{band.label}</strong>
                  <span>{band.count} nap</span>
                </div>
                <span className="corr-delta">{band.avgMood ?? "—"}</span>
              </li>
            ))}
          </ul>
          <p className="muted-note">
            Az átlagok 0–100-as hangulatpontok. Az együtt járás nem bizonyíték arra, hogy
            az alvás okozza a hangulatot — vagy fordítva.
          </p>
        </>
      )}
    </CollapsibleCard>
  );
}
