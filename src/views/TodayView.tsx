import SectionList, {
  ReorderToggle,
  useSectionOrder,
  type SectionSpec,
} from "../components/SectionList";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp, useTodayEntry } from "../state/AppContext";
import { MOODS } from "../lib/mood";
import { balanceScore } from "../lib/analysis";
import { DEFAULT_ACTIVITIES } from "../lib/store";
import { CollapsibleCard, Pill, SectionTitle, Slider } from "../components/ui/ui";
import BalanceRing from "../components/BalanceRing";
import DailyGoals from "../components/DailyGoals";
import WeeklyReflectionCard from "../components/WeeklyReflectionCard";
import TrackerInputs from "../components/TrackerInputs";
import AttachmentPicker from "../components/AttachmentPicker";
import { mealTip } from "../lib/nutritionTips";
import { sportTip } from "../lib/sportTips";
import { useCustomActivities } from "../lib/customActivities";
import { defaultTrackerState, type TrackerState, type TrackerValue } from "../lib/trackers";
import { fetchWeatherFor, weatherValuesFrom, type WeatherLocation } from "../lib/weather";
import type { AttachmentMeta } from "../lib/attachments";
import type { Entry, MoodLevel } from "../types";
import RecordingFlow, { type RecordingResult } from "../components/RecordingFlow";
import { loadCustomEmotions, saveCustomEmotions } from "../lib/store";
import { QUADRANT_COLORS, QUADRANT_LABELS } from "../lib/quadrant";
import MicroLessonCard from "../components/MicroLessonCard";
import CompanionCard from "../components/CompanionCard";
import { recordCompanionActivity } from "../lib/companion";
import { Scale, Target } from "../lib/icons";
import ContentIcon from "../components/ContentIcon";
import { GlyphIcon } from "../state/IconSetContext";
import { t } from "../lib/i18n";

/**
 * Today's section ids, in the order the tab draws them.
 *
 * Exported so a test can pin this list against what the rendered page actually
 * shows: an id that is renamed stops matching the DOM instead of quietly
 * becoming a second way to name the same card.
 */
export const TODAY_SECTION_IDS = [
  "mood",
  "balance",
  "lessons",
  "activities",
  "reflection",
] as const;

export type TodaySectionId = (typeof TODAY_SECTION_IDS)[number];

export default function TodayView() {
  const { data, today, saveEntry, notify } = useApp();
  const existing = useTodayEntry();

  const [mood, setMood] = useState<MoodLevel | null>(existing?.mood ?? null);
  const [stress, setStress] = useState(existing?.stress ?? 5);
  // THE ENERGY THE READER SEES, and the number two inputs disagree about.
  // The flow records its Y axis as `moodEnergy`; every consumer the reader
  // actually reads — the balance score, the correlation grid, the entry
  // detail, the PDF, the AI context — reads the legacy `energy` instead, and
  // until now only the old recorder ever wrote THAT. On a new-flow entry the
  // two were different numbers with the same name, which is why the field
  // looked stuck on 5. They are one number from this commit on (the save path
  // below writes both from the same result), so the coordinate wins the
  // pre-fill — it is the value the meter last showed — and `energy` answers
  // for rows the old recorder wrote before `moodEnergy` existed.
  const [energy, setEnergy] = useState(existing?.moodEnergy ?? existing?.energy ?? 5);
  const [note, setNote] = useState(existing?.note ?? "");
  const [activities, setActivities] = useState<string[]>(existing?.activities ?? []);
  const [attachments, setAttachments] = useState<AttachmentMeta[]>(existing?.attachments ?? []);
  const [trackerValues, setTrackerValues] = useState<TrackerState>(
    existing?.trackerValues ?? defaultTrackerState(data.settings.enabledTrackers),
  );
  const customActivities = useCustomActivities();
  const [saved, setSaved] = useState(false);
  const [weatherNote, setWeatherNote] = useState<string | null>(null);

  // Batch A — the 3-step recording flow. The default is the NEW flow, stored
  // as absence (see settings.moodFlow): only an explicit "old" opens the
  // five-level buttons. The flow holds its own state while it is open and
  // hands the finished result to saveEntry, which merges it into today's
  // entry without disturbing the fields the flow does not own.
  const newFlow = (data.settings.moodFlow ?? "new") === "new";
  const [flowOpen, setFlowOpen] = useState(false);
  const customEmotions = useMemo(() => loadCustomEmotions(), [flowOpen]);

  function applyFlowResult(result: RecordingResult) {
    saveEntry({
      date: today,
      // The same number under both names, written together. `moodEnergy` is
      // the meter's coordinate (the quadrant re-derives from it); `energy`
      // is the field the analysis, the correlation grid, the entry detail
      // and the report read. Saving only the coordinate left every one of
      // those readers on the field's default 5 — the flow's own Energia
      // slider seemed not to save.
      moodEnergy: result.moodEnergy,
      energy: result.moodEnergy,
      pleasantness: result.pleasantness,
      quadrant: result.quadrant,
      emotion: result.emotion,
      emotionIntensity: result.emotionIntensity,
      context: result.context,
      stress,
      note,
      activities,
      attachments,
      trackerValues,
      source: "manual",
    });
    // The card's slider shows the value just saved rather than the value it
    // held before the flow opened — the two are one number, so a stale read
    // here would be the same bug on screen instead of in storage.
    setEnergy(result.moodEnergy);
    setFlowOpen(false);
    recordCompanionActivity("journal", today);
    setSaved(true);
    notify(t("today.saved"));
    window.setTimeout(() => setSaved(false), 2400);
  }

  // Batch 8b — the weather API fills the two manual fields, on the user's
  // opt-in, once per day per open.
  //
  // THREE RULES, ALL ABOUT STAYING OUT OF THE WAY:
  //
  // 1. It only ever fills EMPTY fields. A value the user typed is never
  //    overwritten by a network answer — the API is a convenience beside the
  //    manual boxes, never a correction of them.
  // 2. It never blocks a save. There is no await in the save path, no state
  //    the save reads, and no failure that can produce a dialog: every fetch
  //    outcome is a value, and every failure writes a one-line note.
  // 3. It runs once per mount. The guard is a ref, not a dependency, so a
  //    re-render cannot re-fire it — and the fetch has no await the effect
  //    would need to clean up after.
  const weather = data.settings.weatherApiEnabled === true ? data.settings : null;
  const weatherRan = useRef(false);
  useEffect(() => {
    if (!weather || weatherRan.current) return;
    weatherRan.current = true;
    const enabled = data.settings.enabledTrackers ?? [];
    const weatherEnabled = enabled.includes("weather") || enabled.includes("weather-condition");
    const location: WeatherLocation | null = weather.weatherUseGps
      ? { source: "gps" }
      : weather.weatherCity?.trim()
        ? { source: "city", name: weather.weatherCity.trim() }
        : null;
    if (!weatherEnabled || !location) return;
    let live = true;
    fetchWeatherFor(location, today).then((day) => {
      if (!live) return;
      if (!day.ok) {
        // One line, never a dialog. `denied` is the case the user can fix,
        // so it says so; the rest are the API's weather, not the app's.
        setWeatherNote(
          day.reason === "denied"
            ? t("today.weather.denied")
            : t("today.weather.unavailable"),
        );
        return;
      }
      const filled = weatherValuesFrom(day);
      setTrackerValues((prev) => {
        // Rule 1, enforced where the data is: a field that already holds a
        // value keeps it, and only genuinely empty ones are filled.
        const next: TrackerState = { ...prev };
        for (const [id, value] of Object.entries(filled) as [string, TrackerValue][]) {
          const current = prev[id];
          const empty =
            current === undefined ||
            (current.kind === "select" && current.value === "") ||
            (current.kind === "number" && current.value === null) ||
            (current.kind === "text" && current.value === "");
          if (empty) next[id] = value;
        }
        return next;
      });
      // Four keys rather than one with a `{temp}` that is sometimes empty: an empty
      // placeholder would render "Időjárás betöltve ( °C).", which reads as a
      // broken reading rather than as "no temperature was reported".
      setWeatherNote(
        day.temp !== null
          ? day.fromCache
            ? t("today.weather.cachedTemp", { temp: day.temp })
            : t("today.weather.liveTemp", { temp: day.temp })
          : day.fromCache
            ? t("today.weather.cached")
            : t("today.weather.live"),
      );
    });
    return () => {
      live = false;
    };
    // `data.settings` is read once, on mount: a mid-session change to the
    // weather settings is next open's business, not this render's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleActivity(tag: string) {
    setActivities((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }

  function handleSave() {
    if (!mood) {
      notify(t("today.moodRequired"), "warn");
      return;
    }
    saveEntry({
      date: today,
      mood,
      stress,
      energy,
      note,
      activities,
      attachments,
      trackerValues,
      source: "manual",
    });
    recordCompanionActivity("journal", today);
    setSaved(true);
    notify(t("today.saved"));
    window.setTimeout(() => setSaved(false), 2400);
  }

  const score = existing ? balanceScore(existing) : null;

  /*
   * The tab's sections, as data. Phase 3b: declared, not yet rearranged —
   * the array renders in written order and the reader sees exactly what they
   * saw before. Reordering arrives with the panel that consumes it.
   *
   * Each `render` holds the JSX it held inline, unretouched, and returns a
   * FRAGMENT: a fragment draws no element, so the page comes out byte for
   * byte the same while every section is now something that can be named,
   * labelled and moved.
   */
  const sections: SectionSpec[] = [
  { id: "mood" as TodaySectionId, label: t("today.mood.title"), render: () => (
    <>
          {/* Step 1 — mood. Batch A: two recorders share this card. The new
              flow opens full-screen from its own button; the old five-level
              buttons are the fallback the Settings radio chooses. */}
          <CollapsibleCard
            id="today-mood"
            title={t("today.mood.title")}
            icon={<ContentIcon name="Smile" />}
            summary={existing?.quadrant ? QUADRANT_LABELS[existing.quadrant] : t("today.mood.prompt")}
          >
            {newFlow && (
              <div className="mood-flow-cta">
                {existing?.quadrant ? (
                  <p className="muted-note">
                    {t("today.mood.summaryLabel")}{" "}
                    <strong style={{ color: QUADRANT_COLORS[existing.quadrant] }}>{QUADRANT_LABELS[existing.quadrant]}</strong>
                    {existing.emotion ? ` · ${existing.emotion}` : ""}
                  </p>
                ) : (
                  <p className="muted-note">{t("today.mood.prompt")}</p>
                )}
                <button type="button" className="btn btn-primary btn-block" onClick={() => setFlowOpen(true)}>
                  {t("today.mood.record")}
                </button>
              </div>
            )}
            {!newFlow && (
            <div className="mood-row" role="radiogroup" aria-label={t("today.mood.group")}>
              {MOODS.map((m) => (
                <button
                  key={m.level}
                  type="button"
                  role="radio"
                  aria-checked={mood === m.level}
                  className={`mood-btn ${mood === m.level ? "mood-btn-active" : ""}`}
                  style={{ borderColor: mood === m.level ? m.color : undefined }}
                  onClick={() => setMood(m.level as MoodLevel)}
                >
                  <span className="mood-emoji" aria-hidden="true">
                    <GlyphIcon glyph={m.emoji} />
                  </span>
                  <span className="mood-label">{m.label}</span>
                </button>
              ))}
            </div>
            )}

            <div className="sliders">
              <Slider
                label={t("today.slider.stress")}
                emojiLow="😌"
                emojiHigh="😫"
                min={1}
                max={10}
                value={stress}
                onChange={setStress}
                accent="rose"
              />
              {data.settings.energyModule && (
                <Slider
                  label={t("today.slider.energy")}
                  emojiLow="🪫"
                  emojiHigh="🔋"
                  min={1}
                  max={10}
                  value={energy}
                  onChange={setEnergy}
                  accent="amber"
                />
              )}
            </div>

            <label className="field-label" htmlFor="today-note">
              {t("today.noteLabel")}
            </label>
            <textarea
              id="today-note"
              className="text-area journal-note"
              placeholder={t("today.notePlaceholder")}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
            />

            <AttachmentPicker value={attachments} onChange={setAttachments} />

            {!newFlow && (
              <button type="button" className="btn btn-primary btn-block" onClick={handleSave}>
                {saved ? <>{t("today.savedBadge")}</> : <>{t("today.save")}</>}
              </button>
            )}
          </CollapsibleCard>

          {/* Phase 1 — the companion sits directly under the mood card: the
              one place a reader already is when they have just recorded a day. */}
          <CompanionCard />

          {flowOpen && (
            <RecordingFlow
              customEmotions={customEmotions}
              onAddCustomEmotion={(label) => saveCustomEmotions([...loadCustomEmotions(), label])}
              onFinish={applyFlowResult}
              onCancel={() => setFlowOpen(false)}
              initial={
                existing?.quadrant
                  ? {
                      // From the CARD's energy state, not `existing.moodEnergy`
                      // directly: the state already starts as the stored
                      // coordinate, so a slider the reader moved before
                      // opening the flow seeds the meter instead of being
                      // silently dropped by the pre-fill.
                      moodEnergy: energy,
                      pleasantness: existing.pleasantness,
                      quadrant: existing.quadrant,
                      emotion: existing.emotion,
                      emotionIntensity: existing.emotionIntensity,
                      context: existing.context,
                    }
                  : { moodEnergy: energy }
              }
              announce={notify}
            />
          )}
    </>
  ) },
  { id: "balance" as TodaySectionId, label: t("today.balance.title"), render: () => (
    <>
          {/* Balance score for today */}
          {score !== null && (
            <CollapsibleCard
              id="today-balance"
              title={t("today.balance.title")}
              icon={<Scale />}
              className="balance-card"
              summary={
                score >= 70
                  ? t("today.balance.high")
                  : score >= 45
                    ? t("today.balance.mid")
                    : t("today.balance.low")
              }
            >
              <BalanceRing value={score} />
              <p className="balance-note">
                {score >= 70
                  ? t("today.balance.high")
                  : score >= 45
                    ? t("today.balance.mid")
                    : t("today.balance.low")}
              </p>
            </CollapsibleCard>
          )}
    </>
  ) },
  { id: "lessons" as TodaySectionId, label: t("settings.sections.lessons"), render: () => (
    <>
          {/* Batch B — the micro-lesson for today's quadrant. It gates on the
              quadrant rather than the mood: no quadrant means no lesson to pick,
              and the card renders nothing at all. */}
          <MicroLessonCard quadrant={existing?.quadrant ?? null} />
    </>
  ) },
  { id: "activities" as TodaySectionId, label: t("today.activities.title"), render: () => (
    <>
          {/* Step 2 — activities tag cloud */}
          <CollapsibleCard
            id="today-activities"
            title={t("today.activities.title")}
            icon={<Target />}
            className="activities-card"
            summary={t("today.activities.note")}
          >
            <div className="pill-cloud">
              {DEFAULT_ACTIVITIES.map((tag) => (
                <Pill
                  key={tag}
                  selected={activities.includes(tag)}
                  onClick={() => toggleActivity(tag)}
                >
                  {tag}
                </Pill>
              ))}
              {customActivities.map((a) => (
                <Pill
                  key={a.id}
                  selected={activities.includes(a.label)}
                  onClick={() => toggleActivity(a.label)}
                >
                  <GlyphIcon glyph={a.icon} /> {a.label}
                </Pill>
              ))}
            </div>
          </CollapsibleCard>

          {/* Step 2b — enabled modular trackers */}
          {weatherNote && (
            <small className="muted-note" role="status">
              {weatherNote}
            </small>
          )}
          <TrackerInputs
            values={trackerValues}
            onChange={setTrackerValues}
            enabledIds={data.settings.enabledTrackers}
          />

          {/* Batch 11, commit 4 — the nutrition tip. One line, only when a rule
              earned it, recomputed from the live form state so it can never
              disagree with what the user sees above it. role="status" so a screen
              reader hears the new line without focus moving. */}
          <NutritionTip flags={trackerValues["nutrition-flags"]} kcal={trackerValues["nutrition-calories"]} />

          {/* Batch 11, commit 5 — the sport tip, same contract as the nutrition
              one: one line from the live form state, only when a rule earned it. */}
          <SportTip kind={trackerValues["sport"]} minutes={trackerValues["sport-duration"]} />

          {/* Step 3 — daily goals */}
          <DailyGoals />
    </>
  ) },
  { id: "reflection" as TodaySectionId, label: t("settings.sections.reflection"), render: () => (
    <>
          {/* One prompt a week, and no pressure: answering or skipping ends it. */}
          <WeeklyReflectionCard />
    </>
  ) },
  ];

  const [reordering, setReordering] = useState(false);
  const order = useSectionOrder("today");

  return (
    <div className="view">
          <SectionTitle
            icon={<ContentIcon name="Sprout" />}
            title={t("today.title")}
            hint={t("today.hint")}
          />

          {!existing && (
            <div className="hero-hint">
              <span aria-hidden="true">👋</span>
              <p>{t("today.heroHint")}</p>
            </div>
          )}

      <SectionList
        sections={sections}
        value={order.stored}
        onChange={order.setOrder}
        onReset={order.reset}
        rearranging={reordering}
      />
      <ReorderToggle active={reordering} onToggle={() => setReordering((v) => !v)} />
    </div>
  );
}

/* ------------------------- NutritionTip --------------------------- */

/**
 * Batch 11, commit 4 — the one nutrition line.
 *
 * Drawn from the LIVE form state (not the stored entry), so it updates as
 * the user ticks flags and never contradicts the controls above it. The
 * safety sentence never appears here on purpose: one day's numbers are not
 * the rail's business, and a form is the wrong place for it — it lives on
 * the weekly card below, where three days of evidence exist.
 */
function NutritionTip({
  flags,
  kcal,
}: {
  flags: TrackerValue | undefined;
  kcal: TrackerValue | undefined;
}) {
  const flagRecord =
    flags && flags.kind === "flags"
      ? Object.values(flags.value).some(Boolean)
        ? flags.value
        : null
      : null;
  const kcalValue = kcal && kcal.kind === "number" ? kcal.value : null;
  const tip = mealTip(flagRecord, kcalValue);
  if (!tip) return null;
  return (
    <p className="nutrition-tip muted-note" role="status">
      {tip.text}
    </p>
  );
}

/* ----------------------------- SportTip ---------------------------- */

/**
 * Batch 11, commit 5 — the sport line, the nutrition tip's twin: live form
 * state, at most one sentence, role="status", and no rest nudge here (the
 * nudge needs the WEEK's evidence, which the program card computes).
 */
function SportTip({
  kind,
  minutes,
}: {
  kind: TrackerValue | undefined;
  minutes: TrackerValue | undefined;
}) {
  const kindValue = kind && kind.kind === "select" && kind.value !== "" ? kind.value : null;
  const mins = minutes && minutes.kind === "number" ? minutes.value : null;
  const tip = sportTip(kindValue, mins);
  if (!tip) return null;
  return (
    <p className="nutrition-tip muted-note" role="status">
      {tip}
    </p>
  );
}

export type { Entry };
