import { useEffect } from "react";
import { useApp } from "../state/AppContext";
import {
  loadReminderMessage,
  msUntilNext,
  permissionState,
  showReminder,
} from "../lib/notifications";
import { decideFire, loadLastFired, saveLastFired } from "../lib/reminderDaemon";
import { toISODate } from "../lib/dates";

/**
 * Headless daily-reminder scheduler (Batch 1, P1). Renders nothing.
 *
 * Checks on: app open, a timer aligned to the next occurrence, and
 * visibilitychange (device woke / user returned). The last-fired gate in
 * lib/reminderDaemon guarantees at most one notification per day.
 */
export default function ReminderScheduler() {
  const { data } = useApp();

  useEffect(() => {
    const base = data.settings.reminder;
    if (!base?.enabled) return;
    const plan = { ...base, message: loadReminderMessage() };

    const check = () => {
      const decision = decideFire(plan, new Date(), permissionState(), loadLastFired());
      if (decision.action === "fire") {
        const fired = showReminder(loadReminderMessage());
        // Must be the LOCAL date: decideFire compares lastFired against
        // toISODate(now). Stamping UTC here made the two disagree between
        // local midnight and the UTC rollover, which let the reminder fire
        // twice in one day.
        if (fired) saveLastFired(toISODate(new Date()));
      }
    };

    check();
    const timer = window.setTimeout(check, msUntilNext(plan.time));
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [data.settings.reminder]);

  return null;
}
