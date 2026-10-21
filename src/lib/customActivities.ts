/**
 * User-defined activities (Phase 2).
 *
 * Kept in their own localStorage store with a tiny subscribe pattern so the
 * main data store and existing components stay untouched. The React hook
 * gives components a live view without prop drilling.
 */
import { useSyncExternalStore } from "react";

export type CustomActivity = {
  id: string;
  /** Emoji shown in front of the label. */
  icon: string;
  label: string;
};

const KEY = "belso-iranytu-custom-activities";
const MAX_COUNT = 24;

let state: CustomActivity[] = load();
const listeners = new Set<() => void>();

function load(): CustomActivity[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (a): a is CustomActivity =>
          a && typeof a === "object" && typeof (a as CustomActivity).label === "string",
      )
      .map((a) => ({
        id: String(a.id ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`),
        icon: String(a.icon ?? "⭐").slice(0, 4),
        label: String(a.label).slice(0, 24),
      }));
  } catch {
    return [];
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable — in-memory only */
  }
}

function emit() {
  listeners.forEach((fn) => fn());
}

/** Add a custom activity; de-duplicates by label (case-insensitive). */
export function addCustomActivity(icon: string, label: string): CustomActivity | null {
  const cleanLabel = label.trim().slice(0, 24);
  if (!cleanLabel) return null;
  const exists = state.some((a) => a.label.toLowerCase() === cleanLabel.toLowerCase());
  if (exists) return null;
  if (state.length >= MAX_COUNT) return null;
  const activity: CustomActivity = {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `c-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    icon: (icon.trim() || "⭐").slice(0, 4),
    label: cleanLabel,
  };
  state = [...state, activity];
  persist();
  emit();
  return activity;
}

export function removeCustomActivity(id: string) {
  const next = state.filter((a) => a.id !== id);
  if (next.length === state.length) return;
  state = next;
  persist();
  emit();
}

/** Subscribe to changes; returns an unsubscribe function. */
export function subscribeCustomActivities(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * The plain read of the store, beside the hook.
 *
 * A component uses `useCustomActivities`; this is the same snapshot without
 * React, which the wipe's own proof needs — the module's memory is asserted
 * directly rather than through a render — and which `lib/customTrackers`
 * already exposes as `getCustomTrackers`. The hook reads through it, so the two
 * answers cannot drift apart.
 */
export function getCustomActivities(): CustomActivity[] {
  return state;
}

function getSnapshot(): CustomActivity[] {
  return getCustomActivities();
}

function getServerSnapshot(): CustomActivity[] {
  return [];
}

/** Live view of the user's custom activities. */
export function useCustomActivities(): CustomActivity[] {
  return useSyncExternalStore(subscribeCustomActivities, getSnapshot, getServerSnapshot);
}

/**
 * The production reset, called by the wipe (`lib/storageKeys.ts`).
 *
 * Same residue as the custom trackers, one store over: the activity labels were
 * read into `state` at import, so deleting `belso-iranytu-custom-activities`
 * alone left the running session still offering them in the recorder. Clearing
 * the array, removing the key and notifying the subscribers last puts the live
 * hook (`useCustomActivities`) back on what a first-ever load would give.
 */
export function resetCustomActivities(): void {
  state = [];
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* no storage — the in-memory copy above is still the reset */
  }
  emit();
}
