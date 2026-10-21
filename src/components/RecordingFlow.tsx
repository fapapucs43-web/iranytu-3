/**
 * Batch A — Recording 2.0: the three-step mood recording flow.
 *
 * Step 1 is the Mood Meter: a 10 × 10 grid on the four quadrants where the
 * user marks a POINT, not just a quadrant. Step 2 floats in that quadrant's
 * emotion bubbles (size = intensity) with an "Egyéb" custom option. Step 3
 * is the context panel: three horizontally scrollable multi-select rows.
 * Old five-level recording stays available; Settings decides which one the
 * Today card opens (Batch A step 5 wires that switch).
 *
 * A11Y CONTRACT
 * The meter is `role="slider"` with the two axes flattened into one value
 * stream: ArrowUp/Down move ENERGY, ArrowLeft/Right move PLEASANTNESS, one
 * grid cell per press (Home/End jump to the axis ends). `aria-valuetext`
 * names both axes in Hungarian so the position is meaningful without
 * sight. The bubble cloud and context rows are plain button groups with
 * `aria-pressed`; nothing depends on hover, and every animated transition
 * is disabled under reduced motion (CSS plus the `motionSafe` check that
 * skips the step transition entirely). The media-query literal comes from
 * `lib/media`, the one owner of it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PREFERS_REDUCED_MOTION, matchesMediaQuery } from "../lib/media";
import type { EntryContext, MoodQuadrant } from "../types";
import {
  QUADRANT_COLORS,
  QUADRANT_HINTS,
  QUADRANT_LABELS,
  QUADRANTS,
  quadrantFromCoords,
} from "../lib/quadrant";
import { emotionsForQuadrant, type EmotionOption } from "../lib/emotion-vocab";
import {
  CONTEXT_DIMENSIONS,
  CONTEXT_DIMENSION_LABELS,
  contextOptionsFor,
} from "../lib/contextOptions";
import { t } from "../lib/i18n";

export type RecordingResult = {
  moodEnergy: number;
  pleasantness: number;
  quadrant: MoodQuadrant;
  emotion?: string;
  emotionIntensity?: number;
  context?: EntryContext;
};

type Props = {
  /** Custom emotion labels from the store (belso-iranytu-emotion-vocab). */
  customEmotions: string[];
  /** Persist a newly added custom emotion (the store merges and saves). */
  onAddCustomEmotion: (label: string) => void;
  /** Save button (step 3 or Skip on steps 2/3): receives everything chosen. */
  onFinish: (result: RecordingResult) => void;
  /** Back on step 1: leave without saving anything. */
  onCancel: () => void;
  /** Pre-filled state when re-recording into an existing entry. */
  initial?: Partial<RecordingResult>;
  announce?: (message: string) => void;
};

const MIN = 1;
const MAX = 10;

function clamp10(n: number): number {
  return Math.min(MAX, Math.max(MIN, Math.round(n)));
}

/**
 * A press inside the meter, in viewport pixels, is two numbers.
 *
 * The meter's own box maps 1:1 onto the 1..10 axes: pleasantness runs left to
 * right, energy runs BOTTOM to top (the meter's own caption says so, and the
 * point's CSS positions it that way). Exported because the arithmetic is the
 * part worth testing without a browser, and because the pointer handler and the
 * keyboard handler must agree about where a value lives — two implementations
 * of the same geometry would drift, and the drift would only show up as a
 * reader's press landing on the wrong tile.
 *
 * A degenerate box (a layout that has not happened yet, or a hidden meter)
 * divides by one rather than by zero, so a press in that state cannot produce
 * a NaN coordinate that would then be stored as a mood.
 */
export function coordsFromPoint(
  rect: { left: number; top: number; width: number; height: number },
  clientX: number,
  clientY: number,
): { energy: number; pleasantness: number } {
  const w = rect.width > 0 ? rect.width : 1;
  const h = rect.height > 0 ? rect.height : 1;
  const fx = Math.min(1, Math.max(0, (clientX - rect.left) / w));
  const fy = Math.min(1, Math.max(0, (clientY - rect.top) / h));
  return {
    pleasantness: clamp10(MIN + fx * (MAX - MIN)),
    energy: clamp10(MAX - fy * (MAX - MIN)),
  };
}

export default function RecordingFlow({
  customEmotions,
  onAddCustomEmotion,
  onFinish,
  onCancel,
  initial,
  announce,
}: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [energy, setEnergy] = useState<number>(clamp10(initial?.moodEnergy ?? 5));
  const [pleasantness, setPleasantness] = useState<number>(clamp10(initial?.pleasantness ?? 5));
  const [emotionId, setEmotionId] = useState<string | null>(initial?.emotion ?? null);
  const [emotionIntensity, setEmotionIntensity] = useState<number>(initial?.emotionIntensity ?? 5);
  const [customText, setCustomText] = useState("");
  const [context, setContext] = useState<EntryContext>(initial?.context ?? {});
  const dialogRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef<HTMLParagraphElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  /** True while a press is being held, so a drag keeps painting. */
  const pressedRef = useRef(false);

  const quadrant = quadrantFromCoords(energy, pleasantness);
  const motionSafe = useMemo(() => !matchesMediaQuery(PREFERS_REDUCED_MOTION), []);

  useEffect(() => {
    // Focus lands on the dialog so keyboard users are inside the flow
    // immediately, and Escape always means "leave without saving".
    dialogRef.current?.focus();
  }, []);

  const onKey = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }
      // Focus inside the flow's own range input: the browser's native handling
      // OWNS the arrow keys for that control, so the meter's shortcut must
      // stand aside rather than fight it for the same press — otherwise
      // Left/Right on the energy slider would move PLEASANTNESS, which is the
      // one thing a reader would never expect a numeric slider to do. Escape
      // is already handled above, so leaving the flow still works from there.
      if (event.target instanceof HTMLInputElement) return;
      if (step !== 1) return;
      const map: Record<string, [number, number]> = {
        ArrowUp: [1, 0],
        ArrowDown: [-1, 0],
        ArrowRight: [0, 1],
        ArrowLeft: [0, -1],
      };
      const delta = map[event.key];
      if (!delta) {
        if (event.key === "Home") {
          event.preventDefault();
          setEnergy(MIN);
        } else if (event.key === "End") {
          event.preventDefault();
          setEnergy(MAX);
        }
        return;
      }
      event.preventDefault();
      setEnergy((e) => clamp10(e + delta[0]));
      setPleasantness((p) => clamp10(p + delta[1]));
    },
    [step, onCancel],
  );

  function chooseEmotion(option: EmotionOption | null) {
    setEmotionId(option ? option.label : null);
  }

  /* --------------------------- the meter answers ------------------------ */

  /**
   * One press, one coordinate pair. The frame owns the geometry, so this is
   * the only place that reads a rectangle.
   */
  function paintAt(clientX: number, clientY: number) {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    const point = coordsFromPoint(rect, clientX, clientY);
    setEnergy(point.energy);
    setPleasantness(point.pleasantness);
  }

  function onFramePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    // A secondary mouse button is a context menu, not a mood.
    if (event.pointerType === "mouse" && event.button !== 0) return;
    pressedRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    paintAt(event.clientX, event.clientY);
    event.preventDefault();
  }

  function onFramePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!pressedRef.current) return;
    paintAt(event.clientX, event.clientY);
  }

  function endPress(event: React.PointerEvent<HTMLDivElement>) {
    if (!pressedRef.current) return;
    pressedRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function addCustomEmotion() {
    const label = customText.trim();
    if (!label) return;
    onAddCustomEmotion(label);
    setEmotionId(label);
    setCustomText("");
    announce?.(t("recording.added", { label }));
  }

  function toggleContext(dim: (typeof CONTEXT_DIMENSIONS)[number], label: string) {
    setContext((prev) => {
      const current = prev[dim] ?? [];
      const next = current.includes(label)
        ? current.filter((v) => v !== label)
        : [...current, label];
      return { ...prev, [dim]: next };
    });
  }

  const bubbles = useMemo(() => emotionsForQuadrant(quadrant, customEmotions), [quadrant, customEmotions]);

  return (
    <div
      className="rec-flow"
      role="dialog"
      aria-modal="true"
      aria-label={t("recording.aria")}
      tabIndex={-1}
      ref={dialogRef}
      onKeyDown={onKey}
    >
      <p className="visually-hidden" aria-live="polite" ref={liveRef}>
        {step === 1
          ? t("recording.liveStep1", { energy, pleasantness })
          : step === 2
            ? t("recording.liveStep2")
            : t("recording.liveStep3")}
      </p>

      <header className="rec-flow-head">
        <span className="rec-flow-steps" aria-hidden="true">
          {[1, 2, 3].map((n) => (
            <i key={n} className={n === step ? "rec-dot rec-dot-on" : "rec-dot"} />
          ))}
        </span>
        <h2 className="rec-flow-title">
          {step === 1 ? t("recording.step1Title") : step === 2 ? t("recording.step2Title") : t("recording.step3Title")}
        </h2>
        {step === 1 && <p className="rec-flow-sub">{t("recording.step1Sub")}</p>}
        {step === 2 && (
          <p className="rec-flow-sub" style={{ color: QUADRANT_COLORS[quadrant] }}>
            {QUADRANT_LABELS[quadrant]} · {QUADRANT_HINTS[quadrant]}
          </p>
        )}
        {step === 3 && <p className="rec-flow-sub">{t("recording.step3Sub")}</p>}
      </header>

      {/* Step 1: the Mood Meter */}
      {step === 1 && (
        <div className={`rec-meter-wrap ${motionSafe ? "rec-enter" : ""}`}>
          <div className="rec-axis rec-axis-y">{t("recording.energyAxis")}</div>
          <div
            className="rec-meter-frame"
            ref={frameRef}
            onPointerDown={onFramePointerDown}
            onPointerMove={onFramePointerMove}
            onPointerUp={endPress}
            onPointerCancel={endPress}
          >
            <div className="rec-meter" aria-hidden="true">
              {QUADRANTS.map((q) => (
                <div
                  key={q}
                  className={`rec-quad rec-quad-${q} ${q === quadrant ? "rec-quad-active" : ""}`}
                  style={{ backgroundColor: QUADRANT_COLORS[q] }}
                >
                  <span className="rec-quad-label">{QUADRANT_LABELS[q]}</span>
                </div>
              ))}
              {/* The marked point: 10 × 10 grid, % positioning. */}
              <span
                className="rec-point"
                style={{
                  left: `${((pleasantness - 1) / (MAX - MIN)) * 100}%`,
                  bottom: `${((energy - 1) / (MAX - MIN)) * 100}%`,
                  backgroundColor: QUADRANT_COLORS[quadrant],
                }}
              />
            </div>
            <div
              className="rec-slider"
              role="slider"
              tabIndex={0}
              aria-label={t("recording.meterAria")}
              aria-valuemin={MIN}
              aria-valuemax={MAX * MAX}
              aria-valuenow={(energy - 1) * MAX + pleasantness}
              aria-valuetext={t("recording.meterValueText", {
                energy,
                pleasantness,
                quadrant: QUADRANT_LABELS[quadrant],
              })}
              aria-orientation="vertical"
            />
          </div>
          <div className="rec-axis rec-axis-x">{t("recording.pleasantnessAxis")}</div>

          {/* The energy slider — BESIDE the meter, not instead of it.

              The meter answers "where on both axes at once" by aiming at a
              point; this answers "what energy, exactly" without aiming, which
              is the one value a reader may want to set as a number (and the
              only way to set energy when the point is off-screen on a short
              display). It writes the SAME `energy` state the meter writes, so
              the two cannot disagree: moving this moves the point, and the
              meter's own keys move this.

              Deliberately NOT gated by the Today card's `energyModule` toggle.
              That toggle is about the Ma card's module; this is the recorder's
              own field, and the meter it stands beside is not gated either. A
              flow whose energy control could be switched off elsewhere could
              not record the energy the entry is already required to have. */}
          <div className="rec-energy">
            <div className="rec-energy-head">
              <label className="rec-energy-label" htmlFor="rec-energy-range">
                {t("today.slider.energy")}
              </label>
              <span className="rec-energy-value">{energy}</span>
            </div>
            <input
              id="rec-energy-range"
              className="rec-energy-range"
              type="range"
              min={MIN}
              max={MAX}
              step={1}
              value={energy}
              onChange={(e) => setEnergy(clamp10(Number(e.target.value)))}
            />
          </div>

          <div className="rec-flow-actions">
            <button type="button" className="btn" onClick={onCancel}>
              {t("recording.back")}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setStep(2)}>
              {t("recording.next")}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: the emotion bubble cloud */}
      {step === 2 && (
        <div className={`rec-bubbles ${motionSafe ? "rec-enter" : ""}`}>
          <div className="rec-bubble-cloud" role="group" aria-label={t("recording.emotionsAria")}>
            {bubbles.map((o, index) => {
              // Size encodes the currently chosen intensity; the defaults
              // spread across three sizes so the cloud reads as a cloud.
              const sizeClass = index % 3 === 0 ? "rec-bubble-lg" : index % 3 === 1 ? "rec-bubble-md" : "rec-bubble-sm";
              return (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={emotionId === o.label}
                  className={`rec-bubble ${sizeClass} ${emotionId === o.label ? "rec-bubble-on" : ""}`}
                  style={{ borderColor: QUADRANT_COLORS[quadrant] }}
                  onClick={() => chooseEmotion(o)}
                >
                  {o.label}
                </button>
              );
            })}
          </div>

          <div className="rec-custom">
            <label className="field-label" htmlFor="rec-custom-input">
              {t("recording.other")}
            </label>
            <div className="rec-custom-row">
              <input
                id="rec-custom-input"
                className="text-input"
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomEmotion();
                  }
                }}
                placeholder={t("recording.customPlaceholder")}
              />
              <button type="button" className="btn" onClick={addCustomEmotion} disabled={!customText.trim()}>
                {t("recording.add")}
              </button>
            </div>
          </div>

          {emotionId && (
            <div className="rec-intensity">
              <label className="field-label" htmlFor="rec-intensity-range">
                {t("recording.intensityLabel", { value: emotionIntensity })}
              </label>
              <input
                id="rec-intensity-range"
                type="range"
                min={1}
                max={10}
                value={emotionIntensity}
                onChange={(e) => setEmotionIntensity(clamp10(Number(e.target.value)))}
                style={{ accentColor: QUADRANT_COLORS[quadrant] }}
              />
            </div>
          )}

          <div className="rec-flow-actions">
            <button type="button" className="btn" onClick={() => setStep(1)}>
              {t("recording.back")}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setStep(3)}>
              {emotionId ? t("recording.next") : t("recording.skip")}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: the context panel */}
      {step === 3 && (
        <div className={`rec-context ${motionSafe ? "rec-enter" : ""}`}>
          {CONTEXT_DIMENSIONS.map((dim) => (
            <section key={dim} className="rec-context-dim" aria-label={CONTEXT_DIMENSION_LABELS[dim]}>
              <h3 className="rec-context-h">{CONTEXT_DIMENSION_LABELS[dim]}</h3>
              <div className="rec-chip-row" role="group">
                {contextOptionsFor(dim).map((o) => {
                  const on = (context[dim] ?? []).includes(o.label);
                  return (
                    <button
                      key={o.id}
                      type="button"
                      aria-pressed={on}
                      className={`rec-chip ${on ? "rec-chip-on" : ""}`}
                      style={on ? { borderColor: QUADRANT_COLORS[quadrant] } : undefined}
                      onClick={() => toggleContext(dim, o.label)}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
          <div className="rec-flow-actions">
            <button type="button" className="btn" onClick={() => setStep(2)}>
              {t("recording.back")}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() =>
                onFinish({
                  moodEnergy: energy,
                  pleasantness,
                  quadrant,
                  emotion: emotionId ?? undefined,
                  emotionIntensity: emotionId ? emotionIntensity : undefined,
                })
              }
            >
              {t("recording.saveWithoutContext")}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() =>
                onFinish({
                  moodEnergy: energy,
                  pleasantness,
                  quadrant,
                  emotion: emotionId ?? undefined,
                  emotionIntensity: emotionId ? emotionIntensity : undefined,
                  context,
                })
              }
            >
              {t("recording.save")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
