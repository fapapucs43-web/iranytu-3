/**
 * Custom user-defined trackers (Batch 2, P2 — Bearable parity).
 *
 * Definitions live in their own store (same pattern as customActivities);
 * VALUES still live on entries via `trackerValues`, so nothing changes about
 * the entry shape or existing migrations. A custom tracker behaves like a
 * built-in one: checkbox, numeric slider (min/max) or free text — numeric
 * ones become first-class outcomes for the correlations grid (P7).
 */
import { useSyncExternalStore } from "react";

export type CustomTrackerKind = "checkbox" | "slider" | "text";

export type CustomTrackerDef = {
  id: string;
  icon: string;
  label: string;
  kind: CustomTrackerKind;
  /** slider only */
  min?: number;
  max?: number;
};

const KEY = "belso-iranytu-custom-trackers";
/**
 * The cap, exported because the Settings copy states it.
 *
 * It is a number the reader is shown AND a number the store enforces. Written
 * in two places it becomes two numbers the day one of them is edited, and the
 * copy is the one nobody tests — the manager would refuse the twenty-first
 * tracker while the sentence above it still said twenty were fine.
 */
export const MAX_COUNT = 20;

let state: CustomTrackerDef[] = load();
const listeners = new Set<() => void>();

function clampRange(min: unknown, max: unknown): { min: number; max: number } {
  const lo = typeof min === "number" && !Number.isNaN(min) ? Math.round(min) : 1;
  const hi = typeof max === "number" && !Number.isNaN(max) ? Math.round(max) : 10;
  return lo < hi ? { min: Math.max(0, lo), max: Math.min(1000, hi) } : { min: 1, max: 10 };
}

function load(): CustomTrackerDef[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((t): CustomTrackerDef | null => {
        if (!t || typeof t !== "object") return null;
        const d = t as Partial<CustomTrackerDef>;
        const label = typeof d.label === "string" ? d.label.trim().slice(0, 24) : "";
        if (!label) return null;
        const kind: CustomTrackerKind =
          d.kind === "checkbox" || d.kind === "text" ? d.kind : "slider";
        const base: CustomTrackerDef = {
          id: typeof d.id === "string" && d.id ? d.id : crypto.randomUUID(),
          icon: typeof d.icon === "string" && d.icon ? d.icon.slice(0, 4) : "⭐",
          label,
          kind,
        };
        if (kind === "slider") {
          const { min, max } = clampRange(d.min, d.max);
          return { ...base, min, max };
        }
        return base;
      })
      .filter((t): t is CustomTrackerDef => t !== null);
  } catch {
    return [];
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

export function subscribeCustomTrackers(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getCustomTrackers(): CustomTrackerDef[] {
  return state;
}

export function addCustomTracker(input: Omit<CustomTrackerDef, "id">): CustomTrackerDef | null {
  const label = input.label.trim().slice(0, 24);
  if (!label) return null;
  if (state.length >= MAX_COUNT) return null;
  if (state.some((t) => t.label.toLowerCase() === label.toLowerCase())) return null;
  const base: CustomTrackerDef = {
    id: crypto.randomUUID(),
    icon: (input.icon.trim() || "⭐").slice(0, 4),
    label,
    kind: input.kind,
  };
  const def: CustomTrackerDef =
    input.kind === "slider"
      ? { ...base, ...clampRange(input.min, input.max) }
      : base;
  state = [...state, def];
  persist();
  emit();
  return def;
}

export function deleteCustomTracker(id: string) {
  const next = state.filter((t) => t.id !== id);
  if (next.length === state.length) return;
  state = next;
  persist();
  emit();
}

function getSnapshot() {
  return state;
}

/** Live view of user-defined trackers. */
export function useCustomTrackers(): CustomTrackerDef[] {
  return useSyncExternalStore(subscribeCustomTrackers, getSnapshot, getSnapshot);
}

/** Validate a stored/entered value against a custom tracker def. */
export function sanitizeCustomTrackerValue(
  def: CustomTrackerDef,
  raw: unknown,
): import("../types").TrackerValue | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as { kind?: unknown; value?: unknown };
  if (def.kind === "checkbox" && v.kind === "checkbox" && typeof v.value === "boolean") {
    return { kind: "checkbox", value: v.value };
  }
  if (def.kind === "slider" && v.kind === "slider" && typeof v.value === "number") {
    const min = def.min ?? 1;
    const max = def.max ?? 10;
    return { kind: "slider", value: Math.min(max, Math.max(min, Math.round(v.value))) };
  }
  if (def.kind === "text" && v.kind === "text" && typeof v.value === "string") {
    return { kind: "text", value: v.value.slice(0, 200) };
  }
  return null;
}

/**
 * The production reset, called by the wipe (`lib/storageKeys.ts`).
 *
 * The definitions were loaded into `state` at import, so the key registry
 * deleting `belso-iranytu-custom-trackers` emptied the next load while the
 * running session kept the reader's tracker list — and every card built from
 * it. An empty array is the import-with-no-key state, the key goes with it, and
 * the notify is last so the live hooks (`useCustomTrackers`) re-render. The
 * VALUES these trackers were given live on journal entries and go with the main
 * store, which the chain resets.
 */
export function resetCustomTrackers(): void {
  state = [];
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* no storage — the in-memory copy above is still the reset */
  }
  emit();
}
