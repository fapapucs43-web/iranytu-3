/**
 * Phase 4 — the AI's Settings card: the three modes, the BYOK key, and the
 * model download — both of them: the picker inside `on-device` offers the
 * 0.6B and the 1.7B prebuilt sizes with their measured megabytes in the
 * label, and every state on this card (ready, cached, delete) belongs to the
 * SELECTED size, not to the slot.
 *
 * THE MODE PICKER IS THE CONSENT, AND IT IS A RADIO TRIO
 * Not a toggle, because these are three named states rather than on/off — the
 * same reason the mood recorder's switch is a radio pair. `off` is offered
 * first and is the default, and choosing it does not "disable" anything: the
 * engine refuses before it looks at a key, a host or a model.
 *
 * EVERY MODE SAYS WHAT IT SENDS BEFORE IT CAN SEND IT
 * The line under the picker is not a tooltip and not a one-time banner: it is
 * the permanent description of the state the reader is in. In `byok` the host
 * is named outright, the way `FoodAiSettingsCard` names its own, and the key's
 * session lifetime is stated in the same block that holds the field — a
 * surprise about where a secret went is worse than never having stored it.
 *
 * THE KEY NEVER LEAVES lib/ai
 * This card holds the typed value only until Save is pressed, shows the masked
 * form afterwards, and offers one-button clearing. It cannot echo the key back
 * because it never reads it back.
 */
import { useEffect, useState } from "react";
import { CollapsibleCard, Segmented, TextInput } from "./ui/ui";
import ContentIcon from "./ContentIcon";
import { t } from "../lib/i18n";
import {
  AI_HOSTS,
  AI_MODES,
  AI_PROVIDERS,
  DEVICE_MODEL_SIZES,
  clearAiKey,
  deleteOnDeviceModel,
  deviceModelId,
  deviceModelMb,
  downloadOnDeviceModel,
  getAiConfig,
  hasAiKey,
  isModelCached,
  isModelReady,
  maskedAiKey,
  saveAiKey,
  setAiConfig,
  type AiConfig,
  type AiMode,
  type AiProvider,
  type DeviceModelSize,
} from "../lib/ai";

const MODE_LABEL: Record<AiMode, string> = {
  off: t("ai.modeOff"),
  "on-device": t("ai.modeOnDevice"),
  byok: t("ai.modeByok"),
};

const MODE_HINT: Record<AiMode, string> = {
  off: t("ai.modeOffHint"),
  "on-device": t("ai.modeOnDeviceHint"),
  byok: t("ai.modeByokHint"),
};

const PROVIDER_LABEL: Record<AiProvider, string> = {
  openai: t("ai.providerOpenai"),
  deepseek: t("ai.providerDeepseek"),
};

export default function AiSettingsCard() {
  const [config, setConfig] = useState<AiConfig>(getAiConfig());
  const [keyInput, setKeyInput] = useState("");
  const [stored, setStored] = useState(hasAiKey());
  const [downloading, setDownloading] = useState(false);
  const [percent, setPercent] = useState<number | null>(null);
  const [ready, setReady] = useState(isModelReady(config.model));
  const [failed, setFailed] = useState(false);
  // On disk, not in memory: the delete button is about the selected size's
  // megabytes in Cache Storage, which outlive the tab. Re-checked whenever
  // the picker changes size, because the only other writer is this card's own
  // download and delete.
  const [cached, setCached] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteState, setDeleteState] = useState<"idle" | "ok" | "error">("idle");

  // Every per-size state re-reads on a size change: ready is a module read,
  // cached is the slow Cache Storage probe, and the progress / error / delete
  // messages belong to the size that produced them — a leftover "deleted"
  // from the small model would be a lie under the large one.
  useEffect(() => {
    let alive = true;
    setReady(isModelReady(config.model));
    setPercent(null);
    setFailed(false);
    setDeleteState("idle");
    void isModelCached(config.model).then((v) => {
      if (alive) setCached(v);
    });
    return () => {
      alive = false;
    };
  }, [config.model]);

  function patch(next: Partial<AiConfig>) {
    setConfig(setAiConfig(next));
  }

  async function startDownload() {
    if (downloading || ready) return;
    setDownloading(true);
    setFailed(false);
    setDeleteState("idle");
    setPercent(0);
    const result = await downloadOnDeviceModel(
      (fraction) => setPercent(Math.round(fraction * 100)),
      config.model,
    );
    setDownloading(false);
    setPercent(null);
    if (result.ok) {
      setReady(true);
      setCached(true);
    } else {
      setFailed(true);
    }
  }

  async function removeModel() {
    if (deleting) return;
    // The one destructive action in this card gets the reader's word first —
    // the next use is a fresh download of the same size, and no undo exists.
    if (!window.confirm(t("ai.deleteConfirm"))) return;
    setDeleting(true);
    setDeleteState("idle");
    const result = await deleteOnDeviceModel(config.model);
    setDeleting(false);
    if (result.ok) {
      // All three states go back together: memory, disk and the button — a
      // half-reset card would offer "delete" for a model that is gone or
      // "download" while its megabytes still sit in the cache.
      setReady(false);
      setCached(false);
      setPercent(null);
      setFailed(false);
      setDeleteState("ok");
    } else {
      setDeleteState("error");
    }
  }

  // "Download" and "Delete" are the two faces of the same slot: the reader
  // can only want one of them at a time, and the second button appearing next
  // to a disabled first would be a question about which one matters.
  const modelPresent = ready || cached;

  return (
    <CollapsibleCard
      id="ai-settings"
      title={t("ai.title")}
      icon={<ContentIcon name="Laptop" />}
      summary={t("ai.summary")}
    >
      <div className="field-label" id="ai-mode-group">
        {t("ai.modeGroup")}
      </div>
      <Segmented<AiMode>
        ariaLabel={t("ai.modeGroup")}
        options={AI_MODES.map((mode) => ({ value: mode, label: MODE_LABEL[mode] }))}
        value={config.mode}
        onChange={(mode) => patch({ mode })}
      />
      <p className="muted-note" role="status">
        {MODE_HINT[config.mode]}
      </p>

      {config.mode === "byok" && (
        <>
          <div className="field-label" id="ai-provider-group">
            {t("ai.providerGroup")}
          </div>
          <Segmented<AiProvider>
            ariaLabel={t("ai.providerGroup")}
            options={AI_PROVIDERS.map((p) => ({ value: p, label: PROVIDER_LABEL[p] }))}
            value={config.provider}
            onChange={(provider) => patch({ provider })}
          />
          <p className="muted-note">{t("ai.hostNotice", { host: AI_HOSTS[config.provider] })}</p>
          <label className="field-label" htmlFor="ai-key">
            {t("ai.keyLabel")}
            <TextInput
              id="ai-key"
              type="password"
              placeholder="sk-…"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
            />
          </label>
          <div className="weather-try">
            <button
              type="button"
              className="btn"
              disabled={keyInput.trim() === ""}
              onClick={() => {
                saveAiKey(keyInput);
                setKeyInput("");
                setStored(hasAiKey());
              }}
            >
              {t("ai.saveKey")}
            </button>
            {stored && (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  clearAiKey();
                  setStored(false);
                }}
              >
                {t("ai.clearKey")}
              </button>
            )}
            {stored && (
              <small className="muted-note" role="status">
                {t("ai.keySaved", { masked: maskedAiKey() })}
              </small>
            )}
          </div>
          <p className="muted-note">{t("ai.keySessionNote")}</p>
        </>
      )}

      {config.mode === "on-device" && (
        <>
          <div className="field-label" id="ai-model-group">
            {t("ai.modelLabel")}
          </div>
          <Segmented<DeviceModelSize>
            ariaLabel={t("ai.modelLabel")}
            options={DEVICE_MODEL_SIZES.map((size) => ({
              value: size,
              label: `${size === "small" ? t("ai.modelSmall") : t("ai.modelLarge")} (${deviceModelMb(size)} MB)`,
            }))}
            value={config.model}
            onChange={(model) => patch({ model })}
          />
          <p className="muted-note" role="status">
            {config.model === "small" ? t("ai.modelSmallHint") : t("ai.modelLargeHint")}
          </p>
          {!downloading && !modelPresent && (
            <div className="weather-try">
              <button type="button" className="btn" onClick={() => void startDownload()}>
                {t("ai.download", { mb: deviceModelMb(config.model) })}
              </button>
            </div>
          )}
          {downloading && percent !== null && (
            <p className="muted-note" role="status">
              {t("ai.downloading", { percent })}
            </p>
          )}
          {!downloading && modelPresent && (
            <div className="weather-try">
              <button type="button" className="btn" disabled={deleting} onClick={() => void removeModel()}>
                {t("ai.delete")}
              </button>
              <small className="muted-note" role="status">
                {ready ? t("ai.modelReady") : t("ai.download", { mb: deviceModelMb(config.model) })}
              </small>
            </div>
          )}
          {deleteState === "ok" && (
            <p className="muted-note" role="status">
              {t("ai.deleted")}
            </p>
          )}
          {deleteState === "error" && (
            <p className="muted-note" role="alert">
              {t("ai.deleteError")}
            </p>
          )}
          {failed && (
            <p className="muted-note" role="alert">
              {t("ai.errorModel")}
            </p>
          )}
          <p className="muted-note">
            <code>{deviceModelId(config.model)}</code>
          </p>
        </>
      )}
    </CollapsibleCard>
  );
}
