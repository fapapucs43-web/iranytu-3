/**
 * Headless per-dose reminder scheduler (Batch 3, P5). Renders nothing.
 *
 * Checks on: app open, a one-minute tick, and visibilitychange (device woke /
 * user came back). lib/medReminders guarantees at most one notification per
 * (medication, time, day) via the fired-key bookkeeping.
 *
 * Honest limit: there is no server behind this app, so a dose can only be
 * announced while the app (or the installed PWA) is actually running.
 */
import { useEffect } from "react";
import { useApp } from "../state/AppContext";
import { permissionState, showDoseReminder } from "../lib/notifications";
import {
  decideDoseFire,
  doseFiredKey,
  firedKeysFor,
  markDoseFired,
} from "../lib/medReminders";
import { toISODate } from "../lib/dates";

export default function MedicationReminderScheduler() {
  const { data } = useApp();

  useEffect(() => {
    if (!data.settings.medsModule) return;

    const check = () => {
      const now = new Date();
      const dateIso = toISODate(now);
      const decision = decideDoseFire({
        enabled: data.settings.medsModule,
        meds: data.medications,
        checks: data.medicationChecks,
        now,
        permission: permissionState(),
        firedKeys: firedKeysFor(dateIso),
      });
      if (decision.action !== "fire") return;
      const dose = decision.dose;
      if (showDoseReminder(dose.name, dose.dose, dose.time)) {
        markDoseFired(dateIso, doseFiredKey(dose.medId, dose.time, dateIso));
      }
    };

    check();
    const timer = window.setInterval(check, 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [data.settings.medsModule, data.medications, data.medicationChecks]);

  return null;
}
