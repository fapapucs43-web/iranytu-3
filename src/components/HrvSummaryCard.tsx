/**
 * HRV — the imported wearable series, summarised on the Egészség tab.
 *
 * WHY A CARD AND NOT A TRACKER ROW
 * The samples arrive only through the health import (a watch cannot be read
 * from a PWA), so there is no daily form to render and no reason to put an
 * editable number in front of the reader. What a reader wants from HRV is
 * the shape of their own data: how many nights, what average, which way the
 * recent week moved. That is a summary, and a summary is a card.
 *
 * NEUTRAL BY CONSTRUCTION
 * The engine returns numbers and a direction; this file turns them into
 * sentences and adds the one caveat every wearable surface in this app
 * carries — the numbers are the reader's own, an "együtt járás", and never
 * a verdict or a medical reading. There is no reference range here because
 * there is no honest one: RMSSD/SDNN bands depend on age and device, and a
 * PWA knows neither.
 *
 * The copy is Hungarian and owned by this component, like SleepMoodCard's
 * and SleepLogCard's — the staged i18n sweep visits these files by name.
 */
import { useApp } from "../state/AppContext";
import { CollapsibleCard } from "./ui/ui";
import ContentIcon from "./ContentIcon";
import { hrvSummary, type HrvTrend } from "../lib/hrvSummary";

const MS = "ms";

function fmt(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)} ${MS}`;
}

function trendSentence(trend: HrvTrend | null, delta: number | null): string {
  if (trend === null || delta === null) {
    return "Még túl kevés a rögzített éjszaka a tendenciához — a két átlagot látod, irányt még nem mondanak.";
  }
  const abs = Math.abs(delta).toFixed(1);
  if (trend === "up") return `Az utóbbi napok átlaga ${abs} ${MS}-rel magasabb, mint az azokat megelőzőké.`;
  if (trend === "down") return `Az utóbbi napok átlaga ${abs} ${MS}-rel alacsonyabb, mint az azokat megelőzőké.`;
  return "A két időszak átlaga közel azonos — nincs látható elmozdulás.";
}

export default function HrvSummaryCard() {
  const { data } = useApp();
  const summary = hrvSummary(data.entries);

  const delta =
    summary.recentAvg !== null && summary.priorAvg !== null
      ? Math.round((summary.recentAvg - summary.priorAvg) * 10) / 10
      : null;

  const line =
    summary.days === 0
      ? "Még nincs HRV-adat"
      : `${summary.days} nap · átlag ${fmt(summary.avg)}`;

  return (
    <CollapsibleCard
      id="health-hrv-summary"
      title="HRV"
      icon={<ContentIcon name="Heart" />}
      summary={line}
    >
      {summary.days === 0 ? (
        <p className="muted-note">
          A HRV-t az Apple Health-import hozza be (Beállítások → Importálás). Ha a
          telefonod vagy az órád vezeti, itt látod a saját átlagod és azt, merre halad
          az utóbbi hetekben.
        </p>
      ) : (
        <>
          <ul className="corr-list">
            <li className="corr-row">
              <div className="corr-info">
                <strong>Minden rögzített nap</strong>
                <span>{summary.days} nap</span>
              </div>
              <span className="corr-delta">{fmt(summary.avg)}</span>
            </li>
            <li className="corr-row">
              <div className="corr-info">
                <strong>Az utóbbi legfeljebb 7 nap</strong>
                <span>átlag</span>
              </div>
              <span className="corr-delta">{fmt(summary.recentAvg)}</span>
            </li>
            <li className="corr-row">
              <div className="corr-info">
                <strong>Azt megelőző legfeljebb 7 nap</strong>
                <span>átlag</span>
              </div>
              <span className="corr-delta">{fmt(summary.priorAvg)}</span>
            </li>
          </ul>
          <p className="muted-note">{trendSentence(summary.trend, delta)}</p>
          <p className="muted-note">
            A HRV egyik napról a másikra is ingadozik. Amit itt látsz, a saját rögzített
            mintáid leírása — nem orvosi értelmezés, és nem ok-okozati állítás semmilyen
            más dologra.
          </p>
        </>
      )}
    </CollapsibleCard>
  );
}
