/**
 * PIN lock settings (Batch 3, P8a), shown in Settings.
 *
 * Deliberately honest about the scope: this is a privacy screen against casual
 * snooping, not encryption. The journal itself stays plaintext in this app's
 * own storage, and a forgotten PIN cannot be recovered because the PIN is
 * never stored.
 */
import { useState } from "react";
import { useApp } from "../state/AppContext";
import { CollapsibleCard, TextInput } from "./ui/ui";
import { LockIcon } from "../lib/icons";
import { t } from "../lib/i18n";
import {
  PIN_MAX,
  PIN_MIN,
  changePin,
  disablePin,
  isLockEnabled,
  isValidPinFormat,
  isWeakPin,
  setPin,
} from "../lib/appLock";

type Mode = "off" | "set" | "change" | "disable";

export default function PinLockSettings() {
  const { notify } = useApp();
  const [enabled, setEnabled] = useState(() => isLockEnabled());
  const [mode, setMode] = useState<Mode>(() => (isLockEnabled() ? "change" : "off"));
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState("");

  function localPinError(pin: string): string | null {
    if (!isValidPinFormat(pin)) {
      return t("settings.pin.lengthError", { min: PIN_MIN, max: PIN_MAX });
    }
    if (isWeakPin(pin)) return t("settings.pin.weakError");
    return null;
  }

  function reset() {
    setCurrent("");
    setNext("");
    setRepeat("");
    setError("");
  }

  async function startSetup() {
    setError("");
    const problem = localPinError(next);
    if (problem) return setError(problem);
    if (next !== repeat) return setError(t("settings.pin.mismatchError"));
    const result = await setPin(next);
    if (!result.ok) return setError(result.error);
    setEnabled(true);
    setMode("change");
    reset();
    notify(t("settings.pin.setDone"));
  }

  async function saveChange() {
    setError("");
    const problem = localPinError(next);
    if (problem) return setError(problem);
    if (next !== repeat) return setError(t("settings.pin.mismatchError"));
    const result = await changePin(current, next);
    if (!result.ok) return setError(result.error);
    reset();
    notify(t("settings.pin.changedDone"));
  }

  async function turnOff() {
    setError("");
    const result = await disablePin(current);
    if (!result.ok) return setError(result.error);
    setEnabled(false);
    setMode("off");
    reset();
    notify(t("settings.pin.turnedOff"));
  }

  return (
    <CollapsibleCard
      id="settings-pin"
      title={t("settings.pin.title")}
      icon={<LockIcon />}
      summary={t("settings.pin.privacyNote")}
    >
      <p className="muted-note">{t("settings.pin.privacyNote")}</p>

      {!enabled && mode === "off" && (
        <button
          type="button"
          className="btn btn-soft btn-block"
          onClick={() => {
            setError("");
            setMode("set");
          }}
        >
          {t("settings.pin.start")}
        </button>
      )}

      {mode === "set" && (
        <div className="pin-form">
          <p className="muted-note">
            {t("settings.pin.chooseHint", { min: PIN_MIN, max: PIN_MAX })}
          </p>
          <TextInput
            type="password"
            inputMode="numeric"
            autoComplete="off"
            placeholder={t("settings.pin.newPlaceholder")}
            value={next}
            maxLength={PIN_MAX}
            onChange={(e) => setNext(e.target.value.replace(/\D/g, ""))}
          />
          <TextInput
            type="password"
            inputMode="numeric"
            autoComplete="off"
            placeholder={t("settings.pin.repeatPlaceholder")}
            value={repeat}
            maxLength={PIN_MAX}
            onChange={(e) => setRepeat(e.target.value.replace(/\D/g, ""))}
          />
          {error && <p className="pin-error">{error}</p>}
          <div className="add-row">
            <button type="button" className="btn btn-primary" onClick={startSetup}>
              {t("settings.pin.save")}
            </button>
            <button type="button" className="btn btn-ghost" onClick={reset}>
              {t("settings.pin.cancel")}
            </button>
          </div>
        </div>
      )}

      {enabled && mode === "change" && (
        <div className="pin-form">
          <TextInput
            type="password"
            inputMode="numeric"
            autoComplete="off"
            placeholder={t("settings.pin.currentPlaceholder")}
            value={current}
            maxLength={PIN_MAX}
            onChange={(e) => setCurrent(e.target.value.replace(/\D/g, ""))}
          />
          <TextInput
            type="password"
            inputMode="numeric"
            autoComplete="off"
            placeholder={t("settings.pin.newPlaceholder")}
            value={next}
            maxLength={PIN_MAX}
            onChange={(e) => setNext(e.target.value.replace(/\D/g, ""))}
          />
          <TextInput
            type="password"
            inputMode="numeric"
            autoComplete="off"
            placeholder={t("settings.pin.newRepeatPlaceholder")}
            value={repeat}
            maxLength={PIN_MAX}
            onChange={(e) => setRepeat(e.target.value.replace(/\D/g, ""))}
          />
          {error && <p className="pin-error">{error}</p>}
          <div className="add-row">
            <button type="button" className="btn btn-primary" onClick={saveChange}>
              {t("settings.pin.change")}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setError("");
                setMode("disable");
              }}
            >
              {t("settings.pin.turnOff")}
            </button>
          </div>
        </div>
      )}

      {enabled && mode === "disable" && (
        <div className="pin-form">
          <p className="muted-note">{t("settings.pin.turnOffNote")}</p>
          <TextInput
            type="password"
            inputMode="numeric"
            autoComplete="off"
            placeholder={t("settings.pin.currentPlaceholder")}
            value={current}
            maxLength={PIN_MAX}
            onChange={(e) => setCurrent(e.target.value.replace(/\D/g, ""))}
          />
          {error && <p className="pin-error">{error}</p>}
          <div className="add-row">
            <button type="button" className="btn btn-danger" onClick={turnOff}>
              {t("settings.pin.turnOffConfirm")}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setError("");
                setMode("change");
              }}
            >
              {t("settings.pin.cancel")}
            </button>
          </div>
        </div>
      )}

      <p className="muted-note">{t("settings.pin.sessionNote")}</p>
    </CollapsibleCard>
  );
}
