/**
 * Batch 9, commit 5 — the import surface: preview, apply, merge semantics.
 *
 * The parser files (appleHealth.ts / googleFit.ts) are data readers. This
 * card is where the user's decisions live:
 *  - nothing is applied before the user sees what will change (the preview
 *    renders BEFORE the Apply button exists),
 *  - fill-existing-by-date only (stub creation is an explicit opt-in, and
 *    the user has twice declined to flip that default),
 *  - the two new smartwatch trackers (heart rate, SpO2) are OFF by default;
 *    the card never turns them on as a side effect — its one toggle flips
 *    both ids together, and turning the import off removes them again.
 *
 * Manual use stays first-class: a user without a smartwatch never sees a
 * blocker, only one line saying the card is optional.
 */
import { useCallback, useState } from "react";
import { useApp } from "../state/AppContext";
import { CollapsibleCard, TextInput, Toggle } from "./ui/ui";
import ContentIcon from "./ContentIcon";
import { parseAppleHealthBlob } from "../lib/healthImport/appleHealth";
import { markEventFeature } from "../lib/featureFlags";
import { parseGoogleFitText, assertParseableSize } from "../lib/healthImport/googleFit";
import {
  previewImport,
  applyImport,
  countChanged,
  SERIES_TRACKER,
  type ImportPreview,
} from "../lib/healthImport/merge";
import type { HealthImportResult } from "../lib/healthImport/types";
import type { Entry, TrackerState, TrackerValue } from "../types";
import { t } from "../lib/i18n";

/** Files this card accepts, for the input's accept attribute. */
const ACCEPT = ".xml,.json";

function isEmptyValue(v: unknown): boolean {
  return v === null || v === undefined || v === "";
}

export default function HealthImportCard() {
  const { data, setSettings, saveEntry } = useApp();
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<HealthImportResult | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [applied, setApplied] = useState<string | null>(null);
  const [error, setError] = useState("");

  const s = data.settings;
  const stubsOn = s.healthImportStubs === true;
  const enabledTrackers = s.enabledTrackers ?? [];
  const hrOn = enabledTrackers.includes(SERIES_TRACKER.hr);

  function patch(next: Partial<typeof s>) {
    setSettings({ ...s, ...next });
  }

  /** Preview gate: nothing is parsed into state until the file reads clean. */
  const onFile = useCallback(
    (file: File) => {
      setError("");
      setResult(null);
      setPreview(null);
      setApplied(null);
      setFileName(file.name);
      const lower = file.name.toLowerCase();
      const finish = (r: HealthImportResult) => {
        if (r.error) {
          setError(
            r.error === "unparseable"
              ? t("healthImport.errorUnparseable")
              : r.error === "unrecognized"
                ? t("healthImport.errorUnrecognized")
                : t("healthImport.errorTooLarge"),
          );
          return;
        }
        setPreview(previewImport(r, data.entries, enabledTrackers));
        setResult(r);
      };
      try {
        if (lower.endsWith(".json")) {
          // Google Fit path — the size guard runs BEFORE the parse.
          assertParseableSize(file.size);
          void file.text().then((text) => finish(parseGoogleFitText(text)));
        } else {
          // Apple path — the blob entry streams and falls back to DOMParser
          // internally when the file's line shape is broken.
          void parseAppleHealthBlob(file).then(finish);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [data.entries, enabledTrackers],
  );

  function apply() {
    if (!result) return;
    const before: Entry[] = data.entries;
    const after = applyImport(result, before, enabledTrackers, stubsOn);
    const cells = countChanged(before, after);
    if (cells === 0) {
      setApplied(t("healthImport.nothingToWrite"));
      return;
    }
    for (const next of after) {
      const prev = before.find((e) => e.date === next.date);
      // Fill-only by construction: only cells that were empty before are
      // written, so mergeEntry keeps every field this import does not touch.
      const changedKeys = Object.keys(next.trackerValues ?? {}).filter((key) =>
        isEmptyValue(prev?.trackerValues?.[key]?.value),
      );
      if (changedKeys.length === 0) continue;
      const tv: TrackerState = { ...(prev?.trackerValues ?? {}) };
      for (const key of changedKeys) {
        const cell = (next.trackerValues ?? {})[key] as TrackerValue | undefined;
        if (cell) tv[key] = cell;
      }
      if (prev) saveEntry({ date: prev.date, trackerValues: tv });
      else saveEntry({ date: next.date, trackerValues: tv, source: "import" });
    }
    setApplied(`${cells} érték feltöltve.`);
    // Marked here, at the one place a preview can become an applied change.
    // Nothing else about a health import is durable — `entry.source` is
    // "import" for a CSV and a legacy migration too — so this flag is the only
    // record that it ever happened.
    markEventFeature("healthImport");
    setPreview(null);
    setResult(null);
  }

  return (
    <CollapsibleCard
      id="health-import"
      title={t("healthImport.title")}
      icon={<ContentIcon name="Heart" />}
      summary={t("healthImport.summary")}
    >
      <p className="muted-note">{t("healthImport.intro")}</p>

      <Toggle
        label={t("healthImport.hrLabel")}
        hint={t("healthImport.hrHint")}
        checked={hrOn}
        onChange={(v) => {
          // One toggle for the whole watch series: heart rate, SDNN, resting
          // bpm and SpO2 are the same consent — "read these numbers off my
          // watch" — and splitting it into four switches would ask the same
          // question four times. HRV joined the group in phase 3 and resting
          // heart rate in phase 4; an entry imported before either existed
          // simply gains nothing until the reader re-runs the import.
          const kept = enabledTrackers.filter(
            (id) =>
              id !== SERIES_TRACKER.hr &&
              id !== SERIES_TRACKER.hrv &&
              id !== SERIES_TRACKER.restingHr &&
              id !== SERIES_TRACKER.spo2,
          );
          patch({
            enabledTrackers: v
              ? [
                  ...kept,
                  SERIES_TRACKER.hr,
                  SERIES_TRACKER.hrv,
                  SERIES_TRACKER.restingHr,
                  SERIES_TRACKER.spo2,
                ]
              : kept,
          });
        }}
      />

      <Toggle
        label={t("healthImport.stubsLabel")}
        hint={t("healthImport.stubsHint")}
        checked={stubsOn}
        onChange={(v) => patch({ healthImportStubs: v })}
      />

      <label className="field-label" htmlFor="health-import-file">
        {t("healthImport.fileLabel")}
        <TextInput
          id="health-import-file"
          type="file"
          accept={ACCEPT}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
      </label>
      {fileName ? <p className="muted-note">{fileName}</p> : null}

      {error ? (
        <p className="muted-note" role="alert">
          {error}
        </p>
      ) : null}

      {preview ? (
        <div className="import-preview">
          <p>
            <strong>{t("healthImport.previewTitle")}</strong>
            {t("healthImport.previewLead")}
          </p>
          <ul>
            {preview.rows.map((row) => (
              <li key={row.label}>
                {/* The suffixes are APPENDED to the label, so the ", " lives in the
                    template here and NOT in the catalogue: a leading space in a
                    catalogue string is rejected by `tests/lib/i18n.test.ts`,
                    which is right — it is invisible in the source and changes
                    the output. `row.label` stays outside every key, because it
                    is a tracker name out of the data, not a sentence. */}
                {row.label}
                {t("healthImport.previewRow", { count: row.count })}
                {row.applies ? `, ${t("healthImport.previewApplies", { count: row.applies })}` : ""}
                {row.preserved
                  ? `, ${t("healthImport.previewPreserved", { count: row.preserved })}`
                  : ""}
              </li>
            ))}
          </ul>
          {preview.skippedNoEntry > 0 ? (
            <p className="muted-note">
              {stubsOn
                ? t("healthImport.skippedWillCreate", { count: preview.skippedNoEntry })
                : t("healthImport.skippedSkipped", { count: preview.skippedNoEntry })}
            </p>
          ) : null}
          {anyApplies(preview) ? (
            <button type="button" className="btn" onClick={apply}>
              {t("healthImport.apply")}
            </button>
          ) : (
            <p className="muted-note">{t("healthImport.nothingApplies")}</p>
          )}
        </div>
      ) : null}

      {applied ? (
        <p className="muted-note" role="status">
          {applied}
        </p>
      ) : null}

      <p className="muted-note">{t("healthImport.optionalFooter")}</p>
    </CollapsibleCard>
  );
}

/** A preview row counts as applicable when at least one cell can be filled. */
function anyApplies(p: ImportPreview): boolean {
  return p.rows.some((r) => r.applies > 0);
}
