/**
 * Reminder daemon helpers (Batch 1, P1).
 *
 * Pure decision logic + last-fired persistence so the React scheduler
 * component stays dumb. Composes the existing lib/notifications functions —
 * nothing there changes. One notification per day is guaranteed by the
 * lastFired gate, regardless of how often the check runs.
 */
import {
  shouldFireToday,
  type ReminderPlan,
} from "./notifications";
import { toISODate } from "./dates";

const LAST_KEY = "belso-iranytu-reminder-last";

/** ISO date of the last fired reminder, or null. */
export function loadLastFired(): string | null {
  try {
    const v = localStorage.getItem(LAST_KEY);
    return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

export function saveLastFired(dateIso: string) {
  try {
    localStorage.setItem(LAST_KEY, dateIso);
  } catch {
    /* in-memory only */
  }
}

export type FireDecision =
  | { action: "fire" }
  | { action: "skip"; reason: "disabled" | "already-fired" | "too-early" | "no-permission" };

/**
 * Decide whether the reminder should fire right now.
 * `permission` comes from Notification.permission ("granted" fires).
 */
export function decideFire(
  plan: ReminderPlan,
  now: Date = new Date(),
  permission: string = typeof Notification !== "undefined" ? Notification.permission : "unsupported",
  lastFired: string | null = loadLastFired(),
): FireDecision {
  if (permission !== "granted") return { action: "skip", reason: "no-permission" };
  if (!shouldFireToday(plan, lastFired ?? undefined, now)) {
    // Distinguish the reason for tests/telemetry without side effects.
    // Compare against the PASSED-IN lastFired, not storage, so callers that
    // preload the value (e.g. tests) get consistent reasons.
    if (lastFired === toISODate(now)) {
      return { action: "skip", reason: "already-fired" };
    }
    return plan.enabled ? { action: "skip", reason: "too-early" } : { action: "skip", reason: "disabled" };
  }
  return { action: "fire" };
}
