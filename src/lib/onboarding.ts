/**
 * Onboarding state (Phase 4).
 *
 * Own storage key; tracks whether the guided intro was completed so it shows
 * exactly once. The chosen trackers/theme are applied through the existing
 * settings by the integration diff — this module only persists the state.
 */

import { t } from "./i18n";

export type OnboardingState = {
  completed: boolean;
  /** Tracker ids picked during onboarding. */
  trackers: string[];
  /** Theme picked during onboarding ("light" default). */
  theme: "light" | "dark" | "warm" | "vibrant";
};

const KEY = "belso-iranytu-onboarding";

/**
 * The four tracker pills the intro offers, with their labels out of the
 * catalogue (round 17).
 *
 * The labels resolve HERE, at module scope, and the shape does not move: the `id`
 * is what onboarding writes into settings and `OnboardingFlow` renders `label`
 * directly, so the pill keeps rendering a string and the stored state keeps
 * naming the same ids. The one decision this file makes about language is that
 * all four labels travel — including `Vitaminok`, which the sweep cannot see
 * because it carries no accented letter, and which would otherwise be the one
 * Hungarian pill left on an English screen.
 *
 * `Tünetek` names a feature rather than a medical claim, and the clinical sweep
 * allows exactly that noun — the allowance lives beside the medication names in
 * `tests/lib/i18n.test.ts`.
 */
export const ONBOARDING_TRACKER_CHOICES = [
  { id: "sleep", icon: "😴", label: t("onboarding.trackerSleep") },
  { id: "symptoms", icon: "🩺", label: t("onboarding.trackerSymptoms") },
  { id: "vitamins", icon: "💊", label: t("onboarding.trackerVitamins") },
  { id: "weather", icon: "⛅", label: t("onboarding.trackerWeather") },
];

const DEFAULT_STATE: OnboardingState = {
  completed: false,
  trackers: ["sleep", "symptoms"],
  theme: "light",
};

export function loadOnboarding(): OnboardingState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw) as Partial<OnboardingState>;
    return {
      completed: Boolean(parsed.completed),
      trackers: Array.isArray(parsed.trackers)
        ? parsed.trackers.filter((t): t is string => typeof t === "string")
        : DEFAULT_STATE.trackers,
      theme:
        parsed.theme === "dark" || parsed.theme === "warm" || parsed.theme === "vibrant"
          ? parsed.theme
          : "light",
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function saveOnboarding(state: OnboardingState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* in-memory only */
  }
}

/** Mark done and persist. */
export function completeOnboarding(state: OnboardingState) {
  saveOnboarding({ ...state, completed: true });
}

/** True when this browser has never finished the intro. */
export function needsOnboarding(): boolean {
  return !loadOnboarding().completed;
}
