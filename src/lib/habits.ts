/**
 * Daily habits with streaks (Phase 3).
 *
 * Own storage key + subscribe pattern (same as the other Phase 2/3 libs).
 * A habit is a label + emoji; completions are checked dates, so streaks and
 * weekly stats are recomputable without storing derived numbers.
 */

/**
 * Daily habits with streaks (Phase 3).
 *
 * Own storage key + subscribe pattern (same as the other Phase 2/3 libs).
 * A habit is a label + emoji; completions are checked dates, so streaks and
 * weekly stats are recomputable without storing derived numbers.
 */
import { toISODate } from "./dates";

export type HabitDef = {
  id: string;
  icon: string;
  label: string;
};

export type HabitStore = {
  habits: HabitDef[];
  /** habitId -> sorted array of ISO dates (ascending). */
  checks: { [habitId: string]: string[] };
};

const KEY = "belso-iranytu-habits-v1";
const MAX_HABITS = 12;

const DEFAULTS: HabitDef[] = [
  { id: "water", icon: "💧", label: "Víz" },
  { id: "walk", icon: "🚶", label: "Séta" },
  { id: "meditation", icon: "🧘", label: "Meditáció" },
  { id: "sleep8", icon: "😴", label: "8 óra alvás" },
];

let state: HabitStore = load();
const listeners = new Set<() => void>();

/**
 * The store as a first-ever load has it: the four starter habits, nothing checked.
 *
 * `load()` returns this when its key is absent and `resetHabits` restores it,
 * which is why it is one function rather than two copies of the literal: a reset
 * that emptied the habit list would show a state the app can never otherwise
 * reach, and the wipe would stop meaning "what a reload would give you".
 */
function freshStore(): HabitStore {
  return { habits: DEFAULTS, checks: {} };
}

function load(): HabitStore {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return freshStore();
    const parsed = JSON.parse(raw) as Partial<HabitStore>;
    const habits = Array.isArray(parsed.habits)
      ? parsed.habits
          .filter((h): h is HabitDef => !!h && typeof (h as HabitDef).label === "string")
          .slice(0, MAX_HABITS)
      : DEFAULTS;
    const checks: HabitStore["checks"] = {};
    if (parsed.checks && typeof parsed.checks === "object") {
      for (const [id, dates] of Object.entries(parsed.checks)) {
        if (Array.isArray(dates)) {
          checks[id] = [...new Set(dates.filter((d) => typeof d === "string"))].sort();
        }
      }
    }
    return { habits, checks };
  } catch {
    return freshStore();
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* in-memory only */
  }
}

function emit() {
  listeners.forEach((fn) => fn());
}

export function subscribeHabits(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getHabits(): HabitStore {
  return state;
}

export function addHabit(icon: string, label: string): HabitDef | null {
  const clean = label.trim().slice(0, 24);
  if (!clean) return null;
  if (state.habits.length >= MAX_HABITS) return null;
  if (state.habits.some((h) => h.label.toLowerCase() === clean.toLowerCase())) return null;
  const habit: HabitDef = {
    id: crypto.randomUUID(),
    icon: (icon.trim() || "⭐").slice(0, 4),
    label: clean,
  };
  state = { ...state, habits: [...state.habits, habit] };
  persist();
  emit();
  return habit;
}

export function deleteHabit(id: string) {
  const habits = state.habits.filter((h) => h.id !== id);
  if (habits.length === state.habits.length) return;
  const checks = { ...state.checks };
  delete checks[id];
  state = { habits, checks };
  persist();
  emit();
}

/** Toggle completion for a date (ISO). */
export function toggleHabitDate(habitId: string, date: string) {
  const done = state.checks[habitId] ?? [];
  const next = done.includes(date)
    ? done.filter((d) => d !== date)
    : [...done, date].sort();
  state = { ...state, checks: { ...state.checks, [habitId]: next } };
  persist();
  emit();
}

export function isDone(habitId: string, date: string): boolean {
  return (state.checks[habitId] ?? []).includes(date);
}

/**
 * Current streak: consecutive days ending today (or yesterday — the streak
 * isn't "broken" just because today isn't checked yet).
 */
export function habitStreak(habitId: string, todayIso: string): number {
  const done = new Set(state.checks[habitId] ?? []);
  // Noon anchor avoids DST edges; toISODate keeps the comparison in LOCAL
  // time so a midnight-to-02:00 check still lands on the right day.
  const day = new Date(todayIso + "T12:00:00");
  if (!done.has(todayIso)) day.setDate(day.getDate() - 1);
  let streak = 0;
  for (;;) {
    if (!done.has(toISODate(day))) break;
    streak += 1;
    day.setDate(day.getDate() - 1);
  }
  return streak;
}

/** Completions in the 7 days ending `todayIso` (inclusive). */
export function weeklyCount(habitId: string, todayIso: string): number {
  const done = new Set(state.checks[habitId] ?? []);
  const day = new Date(todayIso + "T12:00:00");
  let count = 0;
  for (let i = 0; i < 7; i++) {
    if (done.has(toISODate(day))) count += 1;
    day.setDate(day.getDate() - 1);
  }
  return count;
}

export const HABIT_LIMIT = MAX_HABITS;

/**
 * The production reset, called by the wipe (`lib/storageKeys.ts`).
 *
 * The key registry deletes `belso-iranytu-habits-v1`, and that empties the NEXT
 * load — but this module read its record into `state` when it was imported, so
 * without this function the running session kept showing the habits and the
 * checks the reader had just deleted, until they reloaded. The reset puts the
 * module back where an import with no key would put it (see `freshStore`),
 * removes the key, and notifies the subscribers last: that notification is what
 * re-renders the habit card, so the reader sees the fresh state now rather than
 * after a reload.
 */
export function resetHabits(): void {
  state = freshStore();
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* no storage — the in-memory copy above is still the reset */
  }
  emit();
}
