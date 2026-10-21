/**
 * The self-experiment card (Batch 13, commit 7).
 *
 * Three states, and the transitions between them are the whole feature:
 *
 *   IDLE    — the reader writes one change they want to test.
 *   LIVE    — three days, one rating per day, day N of 3 shown plainly.
 *   CLOSED  — a verdict the reader typed, kept in the history below.
 *
 * The start form is not rendered at all while an experiment is live, rather
 * than being rendered disabled. The rule that only one may run is enforced in
 * `lib/experiments` (a disabled button is a request, not a guarantee), but
 * hiding the form means the screen does not offer an action the store would
 * refuse — and a card that visibly offers something impossible is worse than a
 * card that does not mention it.
 *
 * The day counter is deliberately the loudest thing on the card. The failure
 * this guards against is the reader forgetting what they started and why.
 */
import { useEffect, useState } from "react";
import { CollapsibleCard } from "./ui/ui";
import { Lightbulb, Sprout, X } from "../lib/icons";
import {
  EXPERIMENT_DAYS,
  RATING_MAX,
  RATING_MIN,
  abandonExperiment,
  activeExperiment,
  averageRating,
  canRate,
  dayNumber,
  deleteExperiment,
  finishExperiment,
  getExperiments,
  rateExperiment,
  startExperiment,
  subscribeExperiments,
  type Experiment,
} from "../lib/experiments";
import { formatShort, todayISO } from "../lib/dates";
import { t } from "../lib/i18n";

function RatingRow({
  exp,
  iso,
}: {
  exp: Experiment;
  iso: string;
}) {
  const [rating, setRating] = useState(RATING_MIN);
  const [note, setNote] = useState("");

  if (!canRate(exp, iso)) return null;

  return (
    <div className="exp-rate">
      <span className="field-label">
        {t("tools.experiment.ratingQuestion", { min: RATING_MIN, max: RATING_MAX })}
      </span>
      <input
        className="slider slider-amber"
        type="range"
        min={RATING_MIN}
        max={RATING_MAX}
        value={rating}
        onChange={(e) => setRating(Number(e.target.value))}
        aria-label={t("tools.experiment.ratingGroup", { min: RATING_MIN, max: RATING_MAX })}
      />
      <label className="field-label" htmlFor={`exp-note-${exp.id}`}>
        {t("tools.experiment.noteLabel")}
      </label>
      <textarea
        id={`exp-note-${exp.id}`}
        className="text-area"
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t("tools.experiment.notePlaceholder")}
      />
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => {
          rateExperiment(exp.id, iso, rating, note);
          setNote("");
        }}
      >
        <Sprout size="1.1em" /> {t("tools.experiment.savedToday")}
      </button>
    </div>
  );
}

function LiveExperiment({ exp, iso }: { exp: Experiment; iso: string }) {
  const day = dayNumber(exp, iso);
  const avg = averageRating(exp);

  return (
    <div className="exp-live">
      <p className="exp-day">
        <strong>{day ?? "?"}. nap / {EXPERIMENT_DAYS}</strong>
        {avg !== null && (
          <span className="exp-avg">{" "}{t("tools.experiment.avgSuffix", { avg })}</span>
        )}
      </p>
      <p className="exp-window">
        {formatShort(exp.startDate)} – {formatShort(exp.endDate)}
      </p>
      <RatingRow exp={exp} iso={iso} />

      <div className="exp-checks">
        {exp.checks.map((c) => (
          <span key={c.date} className="exp-check">
            {formatShort(c.date)}: <strong>{c.rating}</strong>
            {c.note ? ` — ${c.note}` : ""}
          </span>
        ))}
      </div>

      {/* Two different endings, because they are different things the reader
          knows: finishing means they concluded something, abandoning means the
          experiment stopped without one.

          The two notes handed to `finishExperiment` are the only Hungarian left
          in this file, and on purpose. They are written into `verdict.note` and
          nothing ever reads that field back — the history list below renders
          from `verdict.worked`. So they are a record rather than copy, and a
          language switch must not rewrite what a reader already closed. Every
          word this file SHOWS is a `t()` key. */}
      <div className="exp-actions">
        <button
          type="button"
          className="btn btn-soft"
          onClick={() => finishExperiment(exp.id, true, " bevált")}
        >
          <Sprout size="1.1em" /> {t("tools.experiment.workedButton")}
        </button>
        <button
          type="button"
          className="btn btn-soft"
          onClick={() => finishExperiment(exp.id, false, " nem bevált")}
        >
          {t("tools.experiment.notWorkedButton")}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => abandonExperiment(exp.id)}
        >
          <X size="1.1em" /> {t("tools.experiment.abandon")}
        </button>
      </div>
    </div>
  );
}

export default function ExperimentCard() {
  const iso = todayISO();
  const [experiments, setExperiments] = useState(() => getExperiments());
  useEffect(() => subscribeExperiments(() => setExperiments(getExperiments())), []);

  const live = activeExperiment(iso);
  const finished = experiments.filter((e) => e.verdict !== null);

  const [what, setWhat] = useState("");
  const [why, setWhy] = useState("");

  return (
    <CollapsibleCard
      id="tools-experiment"
      title={t("tools.experiment.title")}
      icon={<Lightbulb />}
      summary={t("tools.experiment.intro")}
    >
      {live ? (
        <LiveExperiment exp={live} iso={iso} />
      ) : (
        <div className="exp-start">
          <p className="muted-note">{t("tools.experiment.intro")}</p>
          <label className="field-label" htmlFor="exp-what">
            {t("tools.experiment.whatLabel")}
          </label>
          <input
            id="exp-what"
            className="text-input"
            value={what}
            onChange={(e) => setWhat(e.target.value)}
            placeholder={t("tools.experiment.whatPlaceholder")}
          />
          <label className="field-label" htmlFor="exp-why">
            {t("tools.experiment.whyLabel")}
          </label>
          <textarea
            id="exp-why"
            className="text-area"
            rows={2}
            value={why}
            onChange={(e) => setWhy(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={what.trim().length === 0}
            onClick={() => {
              startExperiment({ what, why, date: iso });
              setWhat("");
              setWhy("");
            }}
          >
            <Lightbulb size="1.1em" /> {t("tools.experiment.start")}
          </button>
        </div>
      )}

      {finished.length > 0 && (
        <div className="exp-history">
          <h4 className="exp-history-title">{t("tools.experiment.historyTitle")}</h4>
          <ul className="exp-history-list">
            {finished.map((e) => (
              <li key={e.id} className="exp-history-row">
                <span className="exp-history-what">{e.what}</span>
                <span className={`exp-verdict ${e.verdict?.worked ? "exp-yes" : "exp-no"}`}>
                  {e.verdict?.worked ? t("tools.experiment.verdictYes") : t("tools.experiment.verdictNo")}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => deleteExperiment(e.id)}
                  aria-label={t("tools.experiment.deleteLabel", { what: e.what })}
                >
                  <X size="1em" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </CollapsibleCard>
  );
}