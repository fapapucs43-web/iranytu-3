import { useEffect, useState } from "react";
import { CollapsibleCard } from "./ui/ui";
import ContentIcon from "./ContentIcon";
import { t } from "../lib/i18n";
import { formatShort, todayISO } from "../lib/dates";
import {
  MAX_PLANS,
  PLAN_TEMPLATES,
  addExercise,
  addPlanDay,
  adoptTemplate,
  createPlan,
  deletePlan,
  getFitness,
  logWorkout,
  parseRepsTarget,
  progressionFor,
  progressionsFor,
  progressSeries,
  recentWorkouts,
  removeExercise,
  removePlanDay,
  removeWorkout,
  sessionVolume,
  subscribeFitness,
  suggestNextReps,
  suggestNextWeight,
  todaysSuggestion,
  toggleRestDay,
  workoutIdea,
  type PlanDay,
  type WorkoutPlan,
  type WorkoutType,
} from "../lib/fitness";

/**
 * The SVG geometry for a progression series, in a 320×120 box.
 *
 * A plain `<svg>` rather than a recharts chart on purpose: the charting family
 * is imported by exactly one file and reached through `lazy()`, so that it
 * cannot land in the entry chunk (`tests/views/insights-split.test.ts` pins
 * that structure). A trend line is a polyline; the dependency is not worth the
 * invariant.
 */
function chartGeometry(points: { date: string; value: number }[]) {
  const width = 320;
  const height = 120;
  const pad = 12;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;
  const coords = points.map((p, i) => ({
    ...p,
    x: pad + i * step,
    y: height - pad - ((p.value - min) / span) * (height - pad * 2),
  }));
  return {
    width,
    height,
    coords,
    polyline: coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" "),
  };
}

/**
 * Plans, the builder, and the log (Batch 15, Phase 2 commit 3).
 *
 * THREE PANELS, ONE CARD, AND THE ORDER IS THE ARGUMENT
 * The templates come first because a reader with no plan needs one in one tap,
 * the plans they own come second because that is what they will open most days,
 * and the log comes last because it is a record rather than a control. The
 * builder sits INSIDE a selected plan's day block — adding an exercise is only
 * ever a question about a day.
 *
 * WHY "LOG TODAY" IS PER DAY AND NOT PER PLAN
 * A workout is a day: what was performed is one day's exercises, and logging a
 * whole plan would have to ask which day it was anyway. One button per day, one
 * entry in the log, and the exercise doses come from the plan with their reps
 * parsed to a number — the reader can change any of them in a later batch's
 * edit surface, which this card deliberately does not build.
 *
 * TYPES AND REST DAYS ARE LABELS AND A ROTATION RULE
 * Six types name what a plan or a recorded session is — strength, cardio,
 * mobility, HIIT, yoga, a walk — and the card prints the label wherever the
 * thing itself is listed, so the reader can see what their week is made of. A
 * rest day is a plan day with the work turned off; the card draws it as rest,
 * offers the toggle instead of a log button, and the suggestion's rotation skips
 * it, because a day that is never trained would otherwise always be the least
 * recently trained one.
 *
 * THE SUGGESTION IS THE READER'S OWN DATA, AND IT SAYS WHY
 * At the top sits one line built by `todaysSuggestion`: the plan day the log has
 * trained least recently, or the first day of the first plan when there is no
 * log yet, and the next weights the one progression rule has earned. A session
 * already logged today turns it into "rest, and next time this" — which is the
 * honest reading of a log that says the work is done. One button logs the
 * suggested day as it stands; the line never says the reader should do anything.
 *
 * THE PROGRESS PANEL IS THE WHOLE LOG, NOT ONE PLAN
 * Inside a plan, each exercise already carries its own line (sessions, best,
 * what to try next). The panel below the log answers the same question for a
 * reader who has no plan open — or none at all: every exercise the log has seen,
 * most recently practised first, with its own progression and the same
 * suggestion. Both read `progressionFor`, so a plan row and a panel row cannot
 * disagree about the same name.
 *
 * BODYWEIGHT COUNTS TOO, AND THE CHART DRAWS IT
 * A loaded exercise has the weight rule and a kilograms line; a bodyweight one
 * has no weight to add, so the same progression now carries a rep count and the
 * twin rule turns the same reps twice into one more rep — or five more seconds
 * for a hold, which the log records as such when the dose said so. The chart
 * under the panel plots the most recently practised exercise's own history,
 * kilograms for a loaded one and reps (or seconds) for the bodyweight kind, so
 * the yoga and mobility templates stop being a session count with no trend.
 *
 * NOTHING HERE IS ADVICE
 * The sentences come from `lib/fitness.workoutIdea` and `suggestNextWeight`,
 * both of which say what they read: the week's count, and the same weight twice.
 * No plan is personalised, no number is a target, and the card's note says the
 * templates are movement shapes rather than a medical training programme.
 */
export default function FitnessCard() {
  const [store, setStore] = useState(() => getFitness());
  useEffect(() => subscribeFitness(() => setStore(getFitness())), []);

  const today = todayISO();
  const [openPlanId, setOpenPlanId] = useState<string | null>(null);
  const [planName, setPlanName] = useState("");
  const [dayLabel, setDayLabel] = useState("");
  const [exerciseName, setExerciseName] = useState("");
  const [sets, setSets] = useState("3");
  const [reps, setReps] = useState("8–10");
  const [weight, setWeight] = useState("");

  /**
   * The six type names, one literal `t()` call each — the i18n test scans for
   * exactly that string, so a computed key would be a translation nobody could
   * find. The same shape the meal log's label maps keep.
   */
  const typeLabel: Record<WorkoutType, string> = {
    strength: t("tools.fitness.type.strength"),
    cardio: t("tools.fitness.type.cardio"),
    mobility: t("tools.fitness.type.mobility"),
    hiit: t("tools.fitness.type.hiit"),
    yoga: t("tools.fitness.type.yoga"),
    walking: t("tools.fitness.type.walking"),
  };

  const openPlan: WorkoutPlan | undefined = store.plans.find((p) => p.id === openPlanId);
  const idea = workoutIdea(store.log, today);
  const recent = recentWorkouts(store.log, 6);
  const progress = progressionsFor(store.log);
  const suggestion = todaysSuggestion(store, today);
  // The chart is the top row's history — the exercise the reader practised most
  // recently — so the panel's first line and its picture are about one name.
  const chart = progress.length > 0 ? progressSeries(store.log, progress[0]!.name) : null;
  const chartView =
    chart !== null && chart.points.length >= 2
      ? { chart, geometry: chartGeometry(chart.points) }
      : null;

  /** Record today's session from a plan day, doses read off the plan. */
  function logDay(plan: WorkoutPlan, day: PlanDay) {
    logWorkout({
      date: today,
      planId: plan.id,
      name: `${plan.name} — ${day.label}`,
      ...(plan.type ? { type: plan.type } : {}),
      exercises: day.exercises.map((ex) => {
        const dose = parseRepsTarget(ex.reps);
        return {
          name: ex.name,
          sets: ex.sets,
          reps: Number.parseInt(ex.reps, 10) || 0,
          weight: ex.weight,
          // The unit travels with the session: a "30 másodperc" hold is logged
          // as 30 SECONDS, so the progression line can say seconds later even
          // if the plan that wrote it is edited or deleted.
          ...(dose?.hold ? { hold: true } : {}),
        };
      }),
    });
  }

  return (
    <CollapsibleCard
      id="fitness-plans"
      title={t("tools.fitness.title")}
      icon={<ContentIcon name="TrendingUp" />}
      summary={t("tools.fitness.summary", {
        plans: store.plans.length,
        sessions: store.log.length,
      })}
    >
      <p className="muted-note">{t("tools.fitness.intro")}</p>

      <span className="field-label">{t("tools.fitness.suggestTitle")}</span>
      {suggestion === null ? (
        <p className="muted-note">{t("tools.fitness.suggestNone")}</p>
      ) : (
        <>
          <p className="muted-note">
            {suggestion.rest
              ? t("tools.fitness.suggestRest", {
                  plan: suggestion.planName,
                  day: suggestion.dayLabel,
                })
              : suggestion.reason === "first"
                ? t("tools.fitness.suggestFirst", {
                    plan: suggestion.planName,
                    day: suggestion.dayLabel,
                  })
                : t("tools.fitness.suggestTrain", {
                    days: suggestion.daysSince ?? 0,
                    plan: suggestion.planName,
                    day: suggestion.dayLabel,
                  })}
          </p>
          {suggestion.weights.map((w) => (
            <p key={w.name} className="muted-note">
              {w.name} — {t("tools.fitness.nextWeight", { kg: w.kg })}
            </p>
          ))}
          {suggestion.reps.map((r) => (
            <p key={r.name} className="muted-note">
              {r.name} —{" "}
              {r.hold
                ? t("tools.fitness.nextHold", { seconds: r.reps })
                : t("tools.fitness.nextReps", { reps: r.reps })}
            </p>
          ))}
          <button
            type="button"
            className="btn btn-soft"
            onClick={() => {
              const plan = store.plans.find((p) => p.id === suggestion.planId);
              const day = plan?.days.find((d) => d.id === suggestion.dayId);
              if (plan && day) logDay(plan, day);
            }}
          >
            {t("tools.fitness.logDay")}
          </button>
        </>
      )}

      <span className="field-label">{t("tools.fitness.templates")}</span>
      <ul className="template-list">
        {PLAN_TEMPLATES.map((tpl) => (
          <li key={tpl.id} className="template-row">
            <div className="template-info">
              <strong>{tpl.name}</strong>
              <small className="muted-note">{tpl.focus}</small>
              <small className="muted-note">{typeLabel[tpl.type]}</small>
              <small className="muted-note">
                {t("tools.fitness.templateDays", { days: tpl.days.length })}
              </small>
            </div>
            <button
              type="button"
              className="btn btn-soft"
              aria-label={t("tools.fitness.adoptLabel", { name: tpl.name })}
              disabled={store.plans.length >= MAX_PLANS}
              onClick={() => {
                const plan = adoptTemplate(tpl.id);
                if (plan) setOpenPlanId(plan.id);
              }}
            >
              {t("tools.fitness.adopt")}
            </button>
          </li>
        ))}
      </ul>

      <span className="field-label">{t("tools.fitness.myPlans")}</span>
      {store.plans.length === 0 ? (
        <p className="muted-note">{t("tools.fitness.noPlans")}</p>
      ) : (
        <ul className="plan-list">
          {store.plans.map((plan) => (
            <li key={plan.id} className="plan-row">
              <button
                type="button"
                className={`plan-name ${openPlanId === plan.id ? "plan-name-open" : ""}`}
                aria-expanded={openPlanId === plan.id}
                onClick={() => setOpenPlanId(openPlanId === plan.id ? null : plan.id)}
              >
                {plan.name}
                <small className="muted-note"> · {t("tools.fitness.planDays", { days: plan.days.length })}</small>
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label={t("tools.fitness.deletePlanLabel", { name: plan.name })}
                onClick={() => {
                  deletePlan(plan.id);
                  if (openPlanId === plan.id) setOpenPlanId(null);
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="add-row">
        <input
          className="text-input"
          aria-label={t("tools.fitness.newPlanLabel")}
          placeholder={t("tools.fitness.newPlanPlaceholder")}
          value={planName}
          maxLength={40}
          onChange={(e) => setPlanName(e.target.value)}
        />
        <button
          type="button"
          className="btn btn-soft"
          disabled={store.plans.length >= MAX_PLANS}
          onClick={() => {
            const plan = createPlan(planName);
            if (plan) {
              setPlanName("");
              setOpenPlanId(plan.id);
            }
          }}
        >
          {t("tools.fitness.create")}
        </button>
      </div>

      {openPlan && (
        <div className="plan-detail">
          {openPlan.days.length === 0 && <p className="muted-note">{t("tools.fitness.emptyPlan")}</p>}
          {openPlan.days.map((day) => (
            <div key={day.id} className="plan-day">
              <div className="plan-day-head">
                <strong>{day.label}</strong>
                {day.isRest && <span className="muted-note">{t("tools.fitness.restDay")}</span>}
                <span className="plan-day-actions">
                  {!day.isRest && (
                    <button
                      type="button"
                      className="btn btn-soft"
                      aria-label={t("tools.fitness.logDayLabel", { name: day.label })}
                      onClick={() => logDay(openPlan, day)}
                    >
                      {t("tools.fitness.logDay")}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-soft"
                    aria-label={
                      day.isRest
                        ? t("tools.fitness.unmarkRest")
                        : t("tools.fitness.markRest")
                    }
                    onClick={() => toggleRestDay(openPlan.id, day.id)}
                  >
                    {day.isRest ? t("tools.fitness.unmarkRest") : t("tools.fitness.markRest")}
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t("tools.fitness.removeDayLabel", { name: day.label })}
                    onClick={() => removePlanDay(openPlan.id, day.id)}
                  >
                    ×
                  </button>
                </span>
              </div>
              {day.isRest ? (
                <p className="muted-note">{t("tools.fitness.restNote")}</p>
              ) : (
                <>
                  <ul className="exercise-list">
                {day.exercises.map((ex) => {
                  const prog = progressionFor(store.log, ex.name);
                  const next = suggestNextWeight(prog);
                  const dose = parseRepsTarget(ex.reps);
                  const nextReps = suggestNextReps(prog, dose?.hold ?? prog.hold);
                  return (
                    <li key={ex.id} className="exercise-row">
                      <span>
                        {ex.name} — {ex.sets} × {ex.reps}
                        {ex.weight !== null ? ` · ${ex.weight} kg` : ""}
                      </span>
                      {prog.sessions > 0 && (
                        <small className="muted-note">
                          {prog.best !== null
                            ? t("tools.fitness.progressLine", {
                                name: ex.name,
                                sessions: prog.sessions,
                                best: prog.best,
                              })
                            : prog.bestReps !== null
                              ? (dose?.hold ?? prog.hold)
                                ? t("tools.fitness.progressHold", {
                                    name: ex.name,
                                    sessions: prog.sessions,
                                    best: prog.bestReps,
                                  })
                                : t("tools.fitness.progressReps", {
                                    name: ex.name,
                                    sessions: prog.sessions,
                                    best: prog.bestReps,
                                  })
                              : t("tools.fitness.progressBody", { name: ex.name, sessions: prog.sessions })}
                          {next !== null ? ` · ${t("tools.fitness.nextWeight", { kg: next })}` : ""}
                          {nextReps !== null
                            ? ` · ${
                                (dose?.hold ?? prog.hold)
                                  ? t("tools.fitness.nextHold", { seconds: nextReps })
                                  : t("tools.fitness.nextReps", { reps: nextReps })
                              }`
                            : ""}
                        </small>
                      )}
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={t("tools.fitness.removeExerciseLabel", { name: ex.name })}
                        onClick={() => removeExercise(openPlan.id, day.id, ex.id)}
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="add-row">
                <input
                  className="text-input"
                  aria-label={t("tools.fitness.exerciseName")}
                  placeholder={t("tools.fitness.exercisePlaceholder")}
                  value={exerciseName}
                  maxLength={40}
                  onChange={(e) => setExerciseName(e.target.value)}
                />
                <input
                  className="text-input fitness-number"
                  aria-label={t("tools.fitness.sets")}
                  type="number"
                  min="1"
                  max="10"
                  value={sets}
                  onChange={(e) => setSets(e.target.value)}
                />
                <input
                  className="text-input fitness-number"
                  aria-label={t("tools.fitness.reps")}
                  value={reps}
                  maxLength={20}
                  onChange={(e) => setReps(e.target.value)}
                />
                <input
                  className="text-input fitness-number"
                  aria-label={t("tools.fitness.weight")}
                  type="number"
                  min="0"
                  max="500"
                  step="2.5"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-soft"
                  onClick={() => {
                    if (
                      addExercise(openPlan.id, day.id, {
                        name: exerciseName,
                        sets: Number(sets),
                        reps,
                        weight: weight === "" ? null : Number(weight),
                      })
                    ) {
                      setExerciseName("");
                      setWeight("");
                    }
                  }}
                >
                  {t("tools.fitness.addExercise")}
                </button>
                  </div>
                </>
              )}
            </div>
          ))}
          <div className="add-row">
            <input
              className="text-input"
              aria-label={t("tools.fitness.newDayLabel")}
              placeholder={t("tools.fitness.newDayPlaceholder")}
              value={dayLabel}
              maxLength={30}
              onChange={(e) => setDayLabel(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-soft"
              onClick={() => {
                if (addPlanDay(openPlan.id, dayLabel)) setDayLabel("");
              }}
            >
              {t("tools.fitness.addDay")}
            </button>
          </div>
        </div>
      )}

      <span className="field-label">{t("tools.fitness.recent")}</span>
      {recent.length === 0 ? (
        <p className="muted-note">{t("tools.fitness.noLog")}</p>
      ) : (
        <ul className="log-list">
          {recent.map((entry) => (
            <li key={entry.id} className="log-row">
              <span>
                {formatShort(entry.date)} · {entry.name} ·{" "}
                {t("tools.fitness.exerciseSuffix", { n: entry.exercises.length })}
              </span>
              {entry.type && <small className="muted-note">{typeLabel[entry.type]}</small>}
              <small className="muted-note">
                {t("tools.fitness.volume", { volume: sessionVolume(entry) })}
              </small>
              <button
                type="button"
                className="icon-btn"
                aria-label={t("tools.fitness.removeLogLabel", { name: entry.name, date: entry.date })}
                onClick={() => removeWorkout(entry.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <span className="field-label">{t("tools.fitness.progressTitle")}</span>
      {progress.length === 0 ? (
        <p className="muted-note">{t("tools.fitness.progressNone")}</p>
      ) : (
        <>
          <ul className="log-list">
            {progress.map(({ name, progression }) => {
              const next = suggestNextWeight(progression);
              const nextReps = suggestNextReps(progression);
              return (
                <li key={name} className="log-row">
                  <span>
                    {progression.best !== null
                      ? t("tools.fitness.progressLine", {
                          name,
                          sessions: progression.sessions,
                          best: progression.best,
                        })
                      : progression.bestReps !== null
                        ? progression.hold
                          ? t("tools.fitness.progressHold", {
                              name,
                              sessions: progression.sessions,
                              best: progression.bestReps,
                            })
                          : t("tools.fitness.progressReps", {
                              name,
                              sessions: progression.sessions,
                              best: progression.bestReps,
                            })
                        : t("tools.fitness.progressBody", {
                            name,
                            sessions: progression.sessions,
                          })}
                  </span>
                  {next !== null && (
                    <small className="muted-note">{t("tools.fitness.nextWeight", { kg: next })}</small>
                  )}
                  {nextReps !== null && (
                    <small className="muted-note">
                      {progression.hold
                        ? t("tools.fitness.nextHold", { seconds: nextReps })
                        : t("tools.fitness.nextReps", { reps: nextReps })}
                    </small>
                  )}
                </li>
              );
            })}
          </ul>
          {chartView !== null && (
            <div className="chart-wrap">
              <span className="field-label">
                {t("tools.fitness.chartTitle", { name: progress[0]!.name })}
              </span>
              <svg
                className="fitness-chart"
                viewBox={`0 0 ${chartView.geometry.width} ${chartView.geometry.height}`}
                role="img"
                aria-label={t("tools.fitness.chartTitle", { name: progress[0]!.name })}
              >
                <polyline
                  className="fitness-chart-line"
                  points={chartView.geometry.polyline}
                />
                {chartView.geometry.coords.map((c) => (
                  <circle
                    key={`${c.date}-${c.value}`}
                    className="fitness-chart-dot"
                    cx={c.x}
                    cy={c.y}
                    r={3}
                  />
                ))}
              </svg>
              <p className="muted-note">
                {chartView.chart.unit === "kg"
                  ? t("tools.fitness.chartNoteKg")
                  : t("tools.fitness.chartNoteReps")}
              </p>
            </div>
          )}
        </>
      )}
      {idea && <p className="muted-note">{idea}</p>}
      <p className="muted-note">{t("tools.fitness.planNote")}</p>
    </CollapsibleCard>
  );
}
