/**
 * Batch 10, commit 7 — the food AI's Settings card. Where the consent, the
 * key and the warnings live.
 *
 * THE ORDER IS THE CONSENT
 * The toggle comes first; the key field and the try-it control are rendered
 * only while it is on. That is the structural gate the batch specified:
 * without explicit consent the feature has no surface at all. The two
 * sentences under the toggle say exactly what happens — which host receives
 * the photo, and what it costs — before any of that can happen.
 *
 * THE KEY IS HANDLED BY foodAi.ts ALONE
 * This card never holds the key in state beyond the input's own lifetime,
 * never echoes it back (only the masked form), and offers one-button
 * clearing. The cost warning is part of the permanent copy, not a
 * one-time banner, because the spend recurs.
 */
import { useState } from "react";
import { useApp } from "../state/AppContext";
import { CollapsibleCard, TextInput, Toggle } from "./ui/ui";
import ContentIcon from "./ContentIcon";
import {
  saveApiKey,
  clearApiKey,
  hasApiKey,
  maskedKey,
  FOOD_AI_MODEL,
} from "../lib/foodAi";
import { t } from "../lib/i18n";

/** The host the photo and the key are sent to, named in the copy itself. */
const HOST = "api.openai.com";

export default function FoodAiSettingsCard() {
  const { data, setSettings } = useApp();
  const s = data.settings;
  const on = s.foodAiEnabled === true;
  const [keyInput, setKeyInput] = useState("");
  const [stored, setStored] = useState(hasApiKey());

  function patch(next: Partial<typeof s>) {
    setSettings({ ...s, ...next });
  }

  return (
    <CollapsibleCard
      id="food-ai-settings"
      title={t("foodAi.title")}
      icon={<ContentIcon name="Camera" />}
      summary={t("foodAi.summary")}
    >
      <Toggle
        label={t("foodAi.toggleLabel")}
        hint={t("foodAi.toggleHint")}
        checked={on}
        onChange={(v) => {
          patch({ foodAiEnabled: v });
        }}
      />
      {on && (
        <>
          <p className="muted-note">
            {t("foodAi.dataBefore", { host: "" })}
            <strong>{HOST}</strong>
            {t("foodAi.dataAfter")}
          </p>
          <p className="muted-note">
            <strong>{t("foodAi.costLabel")}</strong>
            {t("foodAi.costBody", { model: FOOD_AI_MODEL })}
          </p>
          <label className="field-label" htmlFor="food-ai-key">
            {t("foodAi.keyLabel")}
            <TextInput
              id="food-ai-key"
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
              onClick={() => {
                saveApiKey(keyInput);
                setKeyInput("");
                setStored(hasApiKey());
              }}
              disabled={keyInput.trim() === ""}
            >
              {t("foodAi.saveKey")}
            </button>
            {stored && (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  clearApiKey();
                  setStored(false);
                }}
              >
                {t("foodAi.clearKey")}
              </button>
            )}
            {stored && (
              <small className="muted-note" role="status">
                {t("foodAi.savedKey", { key: maskedKey() })}
              </small>
            )}
          </div>
        </>
      )}
    </CollapsibleCard>
  );
}
