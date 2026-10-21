/**
 * Batch 10, commit 8 — the capture UI: photo → compressed JPEG → one AI call
 * → editable result → the user writes it into the day's nutrition fields.
 *
 * THE EDIT STEP IS THE FEATURE, NOT A COURTESY
 * The model's numbers are a guess made from one photo. They are rendered as
 * editable inputs labelled "becsült", and the save button writes nothing
 * until the user has seen them. Every field can be changed before it lands
 * in the journal — or the whole result can be discarded with one tap.
 *
 * THE IMAGE IS COMPRESSED BEFORE IT EXISTS AS A STRING
 * The photo is drawn onto a canvas with its long edge clamped to 1024 px and
 * re-encoded as JPEG (quality 0.8) before any base64 conversion, so the
 * payload is bounded by the canvas, not by the camera. `detail: "low"` on
 * the API side keeps the cost at the promised cent-scale.
 *
 * THE CONSENT GATE IS RENDER-CONDITIONAL
 * `foodAiEnabled === true` decides whether this component renders at all.
 * There is no disabled state, no "unlock by toggling" hint on the entry
 * form: without consent the button does not exist, exactly as specified.
 *
 * FAILURES ARE LINES, NOT DIALOGS
 * Every failure reason maps to one sentence from `failureMessage`, shown
 * inline. Nothing blocks the entry form; the manual nutrition fields work
 * with or without this card, and the copy says so on failure.
 */
import { useCallback, useRef, useState } from "react";
import { CollapsibleCard } from "./ui/ui";
import { analyzeFoodPhoto, analysisToTrackers, failureMessage, type FoodAnalysis } from "../lib/foodAi";
import { markEventFeature } from "../lib/featureFlags";
import { t } from "../lib/i18n";
import { useApp } from "../state/AppContext";
import type { TrackerState } from "../types";

/** The long-edge clamp. The payload cannot exceed this no matter the camera. */
const MAX_EDGE = 1024;
const JPEG_QUALITY = 0.8;

export default function FoodPhotoCapture() {
  const { data, today, saveEntry, notify } = useApp();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState<FoodAnalysis | null>(null);
  const [saved, setSaved] = useState(false);

  const enabled = data.settings.foodAiEnabled === true;
  const existing = data.entries.find((e) => e.date === today);

  /** Photo → canvas → JPEG ≤1024 px → base64 → the AI call. */
  const onPhoto = useCallback(async (file: File) => {
    setError("");
    setAnalysis(null);
    setSaved(false);
    setBusy(true);
    try {
      const bitmap = await loadImage(file);
      const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
      const w = Math.round(bitmap.width * scale);
      const h = Math.round(bitmap.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no-canvas");
      ctx.drawImage(bitmap, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      const result = await analyzeFoodPhoto(base64);
      if (!result.ok) setError(failureMessage(result.reason));
      else setAnalysis(result.analysis);
    } catch {
      setError(t("tools.foodPhoto.error"));
    } finally {
      setBusy(false);
    }
  }, []);

  /** Write the (possibly edited) values onto today's entry. Manual fields win. */
  function save() {
    if (!analysis) return;
    const cells = analysisToTrackers(analysis) as TrackerState;
    // Fill-only, the same semantics the import uses: a value the user has
    // already written is never overwritten by the estimate.
    const tv: TrackerState = { ...(existing?.trackerValues ?? {}) };
    for (const [key, cell] of Object.entries(cells)) {
      const was = tv[key];
      if (!was || was.value === null || was.value === "") tv[key] = cell;
    }
    saveEntry({ date: today, trackerValues: tv });
    // Marked HERE, where the estimate actually reaches the journal — not when
    // the analysis came back. An estimate the reader looked at and discarded
    // did not analyse anything.
    markEventFeature("foodAi");
    notify(t("tools.foodPhoto.written"));
    setSaved(true);
    setAnalysis(null);
  }

  if (!enabled) return null; // the structural consent gate

  return (
    <CollapsibleCard
      id="food-photo"
      title={t("tools.foodPhoto.title")}
      icon={<CameraGlyph />}
      summary={t("tools.foodPhoto.summary")}
    >
      <p className="muted-note">
        {t("tools.foodPhoto.explainer")}
      </p>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onPhoto(f);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        className="btn"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        aria-label={t("tools.foodPhoto.captureLabel")}
      >
        {busy ? t("tools.foodPhoto.analyzing") : t("tools.foodPhoto.takePhoto")}
      </button>
      {error ? (
        <p className="muted-note" role="alert">
          {error} {t("tools.foodPhoto.manualStillWorks")}
        </p>
      ) : null}
      {analysis ? (
        <div className="food-ai-result">
          <p className="muted-note">{analysis.description}</p>
          <label className="field-label">
            {t("tools.foodPhoto.calories")}
            <input
              className="number-input"
              type="number"
              min={0}
              max={10000}
              value={Number.isFinite(analysis.calories) ? Math.round(analysis.calories) : ""}
              onChange={(e) => setAnalysis({ ...analysis, calories: Number(e.target.value) })}
            />
          </label>
          <label className="field-label">
            {t("tools.foodPhoto.protein")}
            <input
              className="number-input"
              type="number"
              min={0}
              max={1000}
              value={Number.isFinite(analysis.protein) ? Math.round(analysis.protein) : ""}
              onChange={(e) => setAnalysis({ ...analysis, protein: Number(e.target.value) })}
            />
          </label>
          <label className="field-label">
            {t("tools.foodPhoto.carb")}
            <input
              className="number-input"
              type="number"
              min={0}
              max={1000}
              value={Number.isFinite(analysis.carbs) ? Math.round(analysis.carbs) : ""}
              onChange={(e) => setAnalysis({ ...analysis, carbs: Number(e.target.value) })}
            />
          </label>
          <label className="field-label">
            {t("tools.foodPhoto.fat")}
            <input
              className="number-input"
              type="number"
              min={0}
              max={1000}
              value={Number.isFinite(analysis.fat) ? Math.round(analysis.fat) : ""}
              onChange={(e) => setAnalysis({ ...analysis, fat: Number(e.target.value) })}
            />
          </label>
          <div className="weather-try">
            <button type="button" className="btn" onClick={save} disabled={saved}>
              {t("tools.foodPhoto.writeToJournal")}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setAnalysis(null);
                setSaved(false);
              }}
            >
              {t("tools.foodPhoto.discard")}
            </button>
          </div>
        </div>
      ) : null}
    </CollapsibleCard>
  );
}

/** Load a File into an HTMLImageElement (decoded, ready to draw). */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode"));
    };
    img.src = url;
  });
}

/** 📸 is the nutrition group's camera glyph; drawn as text, not a component. */
function CameraGlyph() {
  return <span aria-hidden="true">📸</span>;
}
