/**
 * Batch B, commit 1 — the micro-lesson card, shown on Today once the day has
 * a quadrant.
 *
 * The registry (`lib/micro-lessons.ts`) holds 24 lessons, six per quadrant,
 * and owns two things this card deliberately does NOT own: which quadrant a
 * lesson belongs to, and which ones this device has already been offered.
 * What lives here is only the decision about WHEN to show one and WHEN to
 * stop showing it.
 *
 * WHAT PERSISTS AND WHAT DOES NOT — the split is the whole design of this card
 *
 *   - `markLessonSeen` writes the offered lesson's id to its own sidecar, so
 *     tomorrow's card offers a DIFFERENT lesson. That is a rotation, not a
 *     record of the user's choices, and it is why "delete everything" has to
 *     clear it (see SettingsView).
 *   - the DISMISSAL ("Kihagyom") is React state only. It disappears on reload
 *     on purpose: a card that came back after the user dismissed it would be
 *     nagging, and nagging is the failure mode this app exists to avoid. The
 *     rotation already prevents the same text twice in a row, which is the
 *     only continuity this card needs.
 *
 * GATED ON THE QUADRANT, NOT THE MOOD
 * `pickLesson` needs a quadrant, and the quadrant is derived from mood AND
 * energy — so a mood alone would send us guessing. Passing `null` when there
 * is no quadrant is why the card can render nothing at all instead of showing
 * a lesson for the wrong state.
 *
 * REDUCED MOTION IS CSS, NOT JS
 * `lib/media` exists so JS never writes the media-query string, and it is the
 * right tool when JS has to know the answer. Here it does not: the only thing
 * to do about a keyframe animation is stop it, and CSS does that for the
 * animation and the compositor at once. A JS check here would be a second
 * place to keep in sync for no benefit.
 */
import { useEffect, useMemo, useState } from "react";
import { CollapsibleCard } from "./ui/ui";
import ContentIcon from "./ContentIcon";
import { QUADRANT_COLORS, QUADRANT_LABELS } from "../lib/quadrant";
import { loadSeenLessons, markLessonSeen, pickLesson } from "../lib/micro-lessons";
import type { MoodQuadrant } from "../types";
import { t } from "../lib/i18n";

export default function MicroLessonCard({
  quadrant,
  active: controlledActive,
  onActiveChange,
}: {
  quadrant: MoodQuadrant | null;
  /**
   * Controlled-or-uncontrolled, exactly as `Collapsible` does it with `open`.
   * This suite has no jsdom, so a test cannot click "Kipróbálom"; this prop is
   * what lets the breathing state be rendered and asserted at all. It is the
   * same pattern the repo already settled on, not a test-only escape hatch.
   */
  active?: boolean;
  onActiveChange?: (next: boolean) => void;
}) {
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const [uncontrolledActive, setUncontrolledActive] = useState(false);
  const active = controlledActive ?? uncontrolledActive;

  // Keyed on the quadrant ONLY. Re-picking on every render would rotate the
  // lesson out from under the reader mid-sentence, which is exactly the bug
  // a random-per-render picker causes in any "did you see?" UI.
  const lesson = useMemo(
    () => (quadrant ? pickLesson(quadrant, loadSeenLessons()) : null),
    [quadrant],
  );

  // Offered = seen. The registry defines its rotation in terms of "already
  // offered", so the mark belongs here and not on either button: marking on
  // dismissal instead would mean a lesson the reader chose to TRY was still
  // eligible again, and one they skipped would not be.
  useEffect(() => {
    if (lesson) markLessonSeen(lesson.id);
  }, [lesson]);

  // Every hook above runs unconditionally, before this early return.
  const setActive = (next: boolean) => {
    if (onActiveChange) onActiveChange(next);
    setUncontrolledActive(next);
  };

  if (!quadrant || !lesson || dismissedId === lesson.id) return null;

  const color = QUADRANT_COLORS[quadrant];

  return (
    <CollapsibleCard
      id="today-lesson"
      title={t("lesson.cardTitle")}
      icon={<ContentIcon name="Brain" />}
      className="lesson-card"
      summary={QUADRANT_LABELS[quadrant]}
    >
      <p className="lesson-head" style={{ color }}>
        <span
          className="lesson-dot"
          style={{ background: color }}
          aria-hidden="true"
        />
        <span className="lesson-label">{QUADRANT_LABELS[quadrant]}</span>
      </p>

      <p className="lesson-text">{lesson.text}</p>

      {/* Decorative: the instruction is already in the lesson text, so
          announcing an animation would be noise for a screen reader. */}
      {active && (
        <div style={{ color }} aria-hidden="true">
          <div className="lesson-circle" />
        </div>
      )}

      <div className="lesson-actions">
        {active ? (
          <button
            type="button"
            className="btn btn-soft"
            onClick={() => {
              setActive(false);
              setDismissedId(lesson.id);
            }}
          >
            {t("lesson.done")}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setActive(true)}
            >
              {t("lesson.try")}
            </button>
            <button
              type="button"
              className="btn btn-soft"
              onClick={() => setDismissedId(lesson.id)}
            >
              {t("lesson.dismiss")}
            </button>
          </>
        )}
      </div>
    </CollapsibleCard>
  );
}