import { useEffect, useState } from "react";
import { useApp } from "../state/AppContext";
import { CollapsibleCard, Toggle } from "./ui/ui";
import { Bell } from "../lib/icons";
import {
  defaultReminderPlan,
  loadReminderMessage,
  msUntilNext,
  permissionState,
  REMINDER_MESSAGES,
  requestPermission,
  saveReminderMessage,
} from "../lib/notifications";
import { t } from "../lib/i18n";

/**
 * Gentle daily reminder settings (Phase 4). Permission is requested only when
 * the user turns reminders on; the app schedules one soft notification per
 * day while running. The message choice lives in lib/notifications storage so
 * the existing Settings type stays untouched.
 */
export default function ReminderCard() {
  const { data, setSettings, notify } = useApp();
  const base = data.settings.reminder ?? defaultReminderPlan();
  const [message, setMessage] = useState(() => loadReminderMessage());
  const [permission, setPermission] = useState(() => permissionState());
  const [nextIn, setNextIn] = useState<string | null>(null);

  useEffect(() => {
    if (!base.enabled) {
      setNextIn(null);
      return;
    }
    const fmt = () => {
      const ms = msUntilNext(base.time);
      const h = Math.floor(ms / 3_600_000);
      const m = Math.round((ms % 3_600_000) / 60_000);
      setNextIn(
        h > 0
          ? t("reminder.inHoursMinutes", { h, m })
          : t("reminder.inMinutes", { m }),
      );
    };
    fmt();
    const id = window.setInterval(fmt, 60_000);
    return () => window.clearInterval(id);
  }, [base.enabled, base.time]);

  async function enable(v: boolean) {
    if (!v) {
      setSettings({ ...data.settings, reminder: { ...base, enabled: false } });
      return;
    }
    const result = await requestPermission();
    setPermission(result);
    if (result !== "granted") {
      notify(t("reminder.permissionDenied"), "warn");
    }
    setSettings({ ...data.settings, reminder: { ...base, enabled: true } });
  }

  function pickMessage(m: string) {
    setMessage(m);
    saveReminderMessage(m);
  }

  return (
    <CollapsibleCard
      id="settings-reminder"
      title={t("reminder.title")}
      icon={<Bell />}
      summary={t("reminder.intro")}
    >
      <p className="muted-note">{t("reminder.intro")}</p>
      <Toggle
        label={t("reminder.toggleLabel")}
        hint={
          permission === "granted"
            ? t("reminder.stateGranted")
            : permission === "denied"
              ? t("reminder.stateBlocked")
              : permission === "unsupported"
                ? t("reminder.stateUnsupported")
                : t("reminder.stateAsk")
        }
        checked={base.enabled}
        onChange={(v) => void enable(v)}
      />
      <label className="field-label" htmlFor="rem-time">
        {t("reminder.timeLabel")}
        <input
          id="rem-time"
          type="time"
          className="text-input"
          value={base.time}
          onChange={(e) =>
            setSettings({ ...data.settings, reminder: { ...base, time: e.target.value } })
          }
        />
      </label>
      <div className="pill-cloud" role="radiogroup" aria-label={t("reminder.messageLabel")}>
        {REMINDER_MESSAGES.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={message === m}
            className={`pill ${message === m ? "pill-selected" : ""}`}
            onClick={() => pickMessage(m)}
          >
            {m}
          </button>
        ))}
      </div>
      {base.enabled && nextIn && (
        <p className="muted-note">{t("reminder.nextAt", { when: nextIn, time: base.time })}</p>
      )}
    </CollapsibleCard>
  );
}
