/**
 * Gentle daily reminder (Phase 4).
 *
 * A single soft reminder per day at the user's chosen time. Scheduling uses a
 * setTimeout aligned to the next occurrence; a small wake-check on visibility
 * change re-aligns if the device slept. Notification permission is requested
 * only when the user enables reminders. No push, no service worker, no spam —
 * if the app is closed the reminder simply waits for the next open.
 */

import { toISODate } from "./dates";
import { t } from "./i18n";
import { emitQuickStart } from "./quickStart";

export type ReminderPlan = {
  enabled: boolean;
  /** "HH:mm" */
  time: string;
  message: string;
};

/**
 * The three messages a reader chooses between (round 17 moved them here).
 *
 * They are RESOLVED AT MODULE SCOPE and stay plain strings, which is the shape
 * `ReminderCard` renders and `saveReminderMessage` stores: the choice the
 * reader made is the sentence they read, and a key stored instead would need
 * every reader's blob migrated to keep the pill selected. The round's own
 * contract test pins each value against the catalogue.
 */
export const REMINDER_MESSAGES = [
  t("reminder.messageMood"),
  t("reminder.messageRecord"),
  t("reminder.messageTwoMinutes"),
];

export function defaultReminderPlan(): ReminderPlan {
  return {
    enabled: false,
    time: "20:00",
    message: REMINDER_MESSAGES[0],
  };
}

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function permissionState(): NotificationPermission | "unsupported" {
  return notificationsSupported() ? Notification.permission : "unsupported";
}

/** Request permission (call only from a user gesture). */
export async function requestPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!notificationsSupported()) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

/** Next occurrence of "HH:mm" from now, in ms (>= 60s away). */
export function msUntilNext(time: string, now: Date = new Date()): number {
  const [h, m] = time.split(":").map(Number);
  const next = new Date(now);
  next.setHours(h || 0, m || 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  const ms = next.getTime() - now.getTime();
  return Math.max(60_000, ms);
}

export function shouldFireToday(
  plan: ReminderPlan,
  lastFiredDate: string | undefined,
  now: Date = new Date(),
): boolean {
  if (!plan.enabled) return false;
  // Local date, matching the local "HH:mm" the user set. Using the UTC date
  // here would misfire between local midnight and the UTC rollover.
  const today = toISODate(now);
  if (lastFiredDate === today) return false;
  const [h, m] = plan.time.split(":").map(Number);
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  return minutesNow >= (h || 0) * 60 + (m || 0);
}

export function showReminder(message: string): boolean {
  if (!notificationsSupported() || Notification.permission !== "granted") return false;
  try {
    const reminder = new Notification(t("app.name"), { body: message, tag: "daily-reminder" });
    /*
     * THE REMINDER'S CLICK IS A DEEP LINK — `?quick=mood`, the same
     * instruction the widget and the manifest shortcut send.
     *
     * A local `Notification` (this is not the Push API: no server, no
     * subscription — see the module header) can only fire while the page is
     * alive, so "opening the app" here means FOCUSING the one already running
     * and publishing the instruction through `subscribeQuickStart`: `Shell`
     * switches to the Ma tab and scrolls to the mood card without navigating.
     * No reload on purpose — a reload would discard the half-written entry the
     * reader may be in the middle of.
     */
    reminder.onclick = () => {
      try {
        window.focus();
      } catch {
        /* focus is best-effort; the jump below is the point */
      }
      emitQuickStart("mood");
    };
    return true;
  } catch {
    return false;
  }
}

/**
 * Batch 3 (P5): per-dose notification. Tagged by time slot so two doses in the
 * same hour do not silently replace each other.
 */
export function showDoseReminder(name: string, dose: string, time: string): boolean {
  if (!notificationsSupported() || Notification.permission !== "granted") return false;
  try {
    new Notification(`${t("app.name")} 💊`, {
      body: dose ? `${name} — ${dose}` : name,
      tag: `dose-${time}`,
    });
    return true;
  } catch {
    return false;
  }
}

/* ---------------------- message choice (own storage) ---------------------- */

const MESSAGE_KEY = "belso-iranytu-reminder-message";

/** Chosen reminder message; kept here so existing Settings type stays untouched. */
export function loadReminderMessage(): string {
  try {
    const v = localStorage.getItem(MESSAGE_KEY);
    return v && REMINDER_MESSAGES.includes(v) ? v : REMINDER_MESSAGES[0];
  } catch {
    return REMINDER_MESSAGES[0];
  }
}

export function saveReminderMessage(message: string) {
  if (!REMINDER_MESSAGES.includes(message)) return;
  try {
    localStorage.setItem(MESSAGE_KEY, message);
  } catch {
    /* in-memory only */
  }
}

/** Clear the reminder message; called from the settings' "delete everything" flow. */
export function resetReminderMessage(): void {
  try {
    localStorage.removeItem(MESSAGE_KEY);
  } catch {
    /* noop */
  }
}
