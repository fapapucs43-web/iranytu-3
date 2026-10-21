/**
 * Standalone gratitude journal (Batch 1, P11).
 *
 * Own storage key + subscribe pattern (same as the other libs). Entries are
 * short notes tied to a day; one quick-add per day is enforced client-side to
 * keep the ritual meaningful, but the sanitizer accepts history without that
 * constraint (imports/legacy data).
 */

export type GratitudeEntry = {
  id: string;
  /** ISO date. */
  date: string;
  text: string;
  createdAt: number;
};

import { toISODate } from "./dates";

const KEY = "belso-iranytu-gratitude";
const MAX_ENTRIES = 200;

let state: GratitudeEntry[] = load();
const listeners = new Set<() => void>();

function load(): GratitudeEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return sanitize(parsed).sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

function sanitize(raw: unknown): GratitudeEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r): GratitudeEntry | null => {
      if (!r || typeof r !== "object") return null;
      const g = r as Partial<GratitudeEntry>;
      const text = typeof g.text === "string" ? g.text.trim().slice(0, 500) : "";
      if (!text) return null;
      return {
        id: typeof g.id === "string" && g.id ? g.id : crypto.randomUUID(),
        date: typeof g.date === "string" ? g.date : toISODate(),
        text,
        createdAt: typeof g.createdAt === "number" ? g.createdAt : Date.now(),
      };
    })
    .filter((g): g is GratitudeEntry => g !== null);
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

export function subscribeGratitude(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getGratitudeEntries(): GratitudeEntry[] {
  return state;
}

export function getGratitudeForDate(dateIso: string): GratitudeEntry | null {
  return state.find((g) => g.date === dateIso) ?? null;
}

/** Add today's gratitude. Returns null when today already has one. */
export function addGratitude(text: string, dateIso: string): GratitudeEntry | null {
  const clean = text.trim().slice(0, 500);
  if (!clean) return null;
  if (state.some((g) => g.date === dateIso)) return null;
  const entry: GratitudeEntry = {
    id: crypto.randomUUID(),
    date: dateIso,
    text: clean,
    createdAt: Date.now(),
  };
  state = [entry, ...state].slice(0, MAX_ENTRIES);
  persist();
  emit();
  return entry;
}

export function deleteGratitude(id: string) {
  const next = state.filter((g) => g.id !== id);
  if (next.length === state.length) return;
  state = next;
  persist();
  emit();
}

/** Accept history without the per-day limit (imports). */
export function importGratitude(raw: unknown): number {
  const items = sanitize(raw);
  const known = new Set(state.map((g) => `${g.date}|${g.text}`));
  const fresh = items.filter((g) => !known.has(`${g.date}|${g.text}`));
  if (fresh.length === 0) return 0;
  state = [...fresh, ...state]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_ENTRIES);
  persist();
  emit();
  return fresh.length;
}

/**
 * The production reset, called by the wipe (`lib/storageKeys.ts`).
 *
 * The registry deletes `belso-iranytu-gratitude`, which empties the next load;
 * this module had already read its entries into `state` when it was imported,
 * so the running session would have kept listing the notes the reader had just
 * deleted. An empty array is what an import with no key produces, the key goes
 * with it, and the notification is last so the journal re-renders empty now
 * instead of after a reload.
 */
export function resetGratitude(): void {
  state = [];
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* no storage — the in-memory copy above is still the reset */
  }
  emit();
}
