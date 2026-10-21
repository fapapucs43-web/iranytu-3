import { useEffect, useMemo, useState } from "react";
import { useApp } from "../state/AppContext";
import { CollapsibleCard } from "./ui/ui";
import { BADGES, earnedBadgeIds, getSeenBadgeIds, markBadgesSeen } from "../lib/achievements";
import { getGratitudeEntries, subscribeGratitude } from "../lib/gratitude";
import { getCbtRecords, subscribeCbt } from "../lib/cbt";
import { getHabits, habitStreak, subscribeHabits } from "../lib/habits";
import { listAssessments } from "../lib/assessmentStore";
import { getExperiments, subscribeExperiments } from "../lib/experiments";
import { buildFeatureUse } from "../lib/featureUse";
import { eventFeatureCounts, seenEventFeatures, subscribeEventFeatures } from "../lib/featureFlags";
import { todayISO } from "../lib/dates";
import { t } from "../lib/i18n";
import ContentIcon from "./ContentIcon";
import { GlyphIcon } from "../state/IconSetContext";

/**
 * Badge shelf (Batch 2, P6).
 *
 * Derived badge rules from lib/achievements over the existing stores
 * (gratitude, CBT, habits — each with its own subscribe pattern). Earned
 * badges are colored; upcoming ones stay dimmed with their target. New badges
 * pulse with an "ÚJ" marker until seen (flags in lib/achievements' own key).
 */
export default function AchievementsCard() {
  const { data } = useApp();
  const entries = data.entries;

  const [gratitudeCount, setGratitudeCount] = useState(() => getGratitudeEntries().length);
  const [cbtCount, setCbtCount] = useState(() => getCbtRecords().length);
  const [assessmentCount, setAssessmentCount] = useState(() => listAssessments().length);
  const [experimentCount, setExperimentCount] = useState(0);
  const [closedExperiments, setClosedExperiments] = useState(0);
  const [eventFlags, setEventFlags] = useState(() => seenEventFeatures());
  const [maxHabitStreak, setMaxHabitStreak] = useState(0);
  const [seen, setSeen] = useState<Set<string>>(() => getSeenBadgeIds());

  // Gratitude + CBT live in their own stores: re-count when they change.
  useEffect(() => {
    const sync = () => {
      setGratitudeCount(getGratitudeEntries().length);
      setCbtCount(getCbtRecords().length);
      // The questionnaire is consent-gated and off by default, but its store
      // is readable either way — reading an empty log is how "never used it"
      // stays distinguishable from "used it and deleted it".
      setAssessmentCount(listAssessments().length);
    };
    sync();
    const un1 = subscribeGratitude(sync);
    const un2 = subscribeCbt(sync);
    return () => {
      un1();
      un2();
    };
  }, []);

  // Experiments live in their own store too, and their two badges want two
  // different numbers: how many were STARTED, and how many reached a verdict.
  // A started-but-abandoned experiment counts for the first and not the second,
  // which is the whole difference between "tried something" and "concluded
  // something".
  useEffect(() => {
    const sync = () => {
      const all = getExperiments();
      setExperimentCount(all.length);
      setClosedExperiments(all.filter((e) => e.verdict !== null).length);
    };
    sync();
    return subscribeExperiments(sync);
  }, []);

  // Habit streaks come from the habits store.
  useEffect(() => {
    const sync = () => {
      const habits = getHabits();
      const today = todayISO();
      setMaxHabitStreak(
        habits.habits.reduce((max, h) => Math.max(max, habitStreak(h.id, today)), 0),
      );
    };
    sync();
    return subscribeHabits(sync);
  }, []);

  const earned = useMemo(
    () =>
      earnedBadgeIds({
        entries,
        maxHabitStreak,
        // Built here, from the stores, rather than stored. A sidecar that
        // writes nothing cannot go stale and cannot be left behind by a
        // "delete everything" that forgot to reach it.
        featureUse: buildFeatureUse({
          gratitude: gratitudeCount,
          cbt: cbtCount,
          reflection: assessmentCount,
          experiment: experimentCount,
          experimentClosed: closedExperiments,
          // The three events, as 0/1. `eventFeatureCounts` is the only place
          // the flag store and the sidecar meet, so the badge rules above still
          // know nothing about flags existing.
          ...eventFeatureCounts(),
        }),
      }),
    [entries, gratitudeCount, cbtCount, assessmentCount, experimentCount, closedExperiments, eventFlags, maxHabitStreak],
  );

  // Re-read when another surface marks a flag. The badge for "first export"
  // has to appear for the person who just hit Export on the Insights screen,
  // not only on the next reload.
  useEffect(() => subscribeEventFeatures(() => setEventFlags(seenEventFeatures())), []);

  // Mark newly earned badges as seen after a short delay, so the "ÚJ" pulse
  // is noticeable but doesn't nag forever.
  useEffect(() => {
    const unseen = [...earned].filter((id) => !seen.has(id));
    if (unseen.length === 0) return;
    const t = window.setTimeout(() => {
      markBadgesSeen(unseen);
      setSeen(getSeenBadgeIds());
    }, 4000);
    return () => window.clearTimeout(t);
  }, [earned, seen]);

  const earnedCount = earned.size;

  return (
    <CollapsibleCard
      id="insights-achievements"
      title={t("settings.sections.achievements")}
      icon={<ContentIcon name="Award" />}
      summary={t("achievements.summary", { earned: earnedCount, total: BADGES.length })}
    >
      <p className="muted-note">
        {earnedCount === 0
          ? t("achievements.emptyTitle")
          : t("achievements.keepGoing", { earned: earnedCount })}
      </p>
      <div className="badge-shelf">
        {BADGES.map((badge) => {
          const isEarned = earned.has(badge.id);
          const isNew = isEarned && !seen.has(badge.id);
          return (
            <div
              key={badge.id}
              className={`badge-cell${isEarned ? " badge-earned" : ""}${isNew ? " badge-new" : ""}`}
              title={`${badge.label} — ${badge.hint}`}
            >
              <span className="badge-icon" aria-hidden="true">
                <GlyphIcon glyph={badge.icon} />
              </span>
              <span className="badge-label">{badge.label}</span>
              {isNew && <span className="badge-new-flag">{t("achievements.newBadge")}</span>}
            </div>
          );
        })}
      </div>
    </CollapsibleCard>
  );
}
