/**
 * Phase 4 — the AI's Settings card: the three modes, the BYOK key, and the
 * model download.
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
import { useState } from "react";
import { CollapsibleCard, Segmented, TextInput } from "./ui/ui";
import ContentIcon from "./ContentIcon";
import { t } from "../lib/i18n";
import {
  AI_HOSTS,
  AI_MODES,
  AI_PROVIDERS,
  ON_DEVICE_MODEL,
  ON_DEVICE_MODEL_MB,
  clearAiKey,
  downloadOnDeviceModel,
  getAiConfig,
  hasAiKey,
  isModelReady,
  maskedAiKey,
  saveAiKey,
  setAiConfig,
  type AiConfig,
  type AiMode,
  type AiProvider,
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
  const [ready, setReady] = useState(isModelReady());
  const [failed, setFailed] = useState(false);

  function patch(next: Partial<AiConfig>) {
    setConfig(setAiConfig(next));
  }

  async function startDownload() {
    if (downloading || ready) return;
    setDownloading(true);
    setFailed(false);
    setPercent(0);
    const result = await downloadOnDeviceModel((fraction) =>
      setPercent(Math.round(fraction * 100)),
    );
    setDownloading(false);
    setPercent(null);
    if (result.ok) setReady(true);
    else setFailed(true);
  }

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
          <div className="weather-try">
            <button
              type="button"
              className="btn"
              disabled={downloading || ready}
              onClick={() => void startDownload()}
            >
              {t("ai.download", { mb: ON_DEVICE_MODEL_MB })}
            </button>
            {downloading && percent !== null && (
              <small className="muted-note" role="status">
                {t("ai.downloading", { percent })}
              </small>
            )}
            {ready && !downloading && (
              <small className="muted-note" role="status">
                {t("ai.modelReady")}
              </small>
            )}
          </div>
          {failed && (
            <p className="muted-note" role="alert">
              {t("ai.errorModel")}
            </p>
          )}
          <p className="muted-note">
            <code>{ON_DEVICE_MODEL}</code>
          </p>
        </>
      )}
    </CollapsibleCard>
  );
}
