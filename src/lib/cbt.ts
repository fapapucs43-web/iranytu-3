/**
 * CBT thought records (Phase 3, Moodfit-style).
 *
 * A guided record follows the classic cognitive restructuring flow:
 * situation → automatic thought → emotion → evidence → balanced thought →
 * re-rated distress. Stored under its own localStorage key with the same
 * subscribe pattern as the other Phase 2/3 libs, so no existing store changes.
 */

export type CbtRecord = {
  id: string;
  /** ISO date the record belongs to. */
  date: string;
  situation: string;
  automaticThought: string;
  /** Primary emotion label (free text, e.g. "szorongás"). */
  emotion: string;
  /** Distress 0–10 before the exercise. */
  distressBefore: number;
  evidenceFor: string;
  evidenceAgainst: string;
  balancedThought: string;
  /** Distress 0–10 after the balanced thought. */
  distressAfter: number;
  createdAt: number;
};

import { toISODate } from "./dates";

const KEY = "belso-iranytu-cbt-records";
const MAX_RECORDS = 200;

let state: CbtRecord[] = load();
const listeners = new Set<() => void>();

function clamp10(n: unknown, fallback: number): number {
  const num = typeof n === "number" ? n : Number(n);
  if (Number.isNaN(num)) return fallback;
  return Math.min(10, Math.max(0, Math.round(num)));
}

function load(): CbtRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(sanitizeRecord)
      .filter((r): r is CbtRecord => r !== null)
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

function sanitizeRecord(raw: unknown): CbtRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<CbtRecord>;
  if (typeof r.automaticThought !== "string" || !r.automaticThought.trim()) return null;
  const text = (v: unknown) => (typeof v === "string" ? v.slice(0, 2000) : "");
  return {
    id: typeof r.id === "string" && r.id ? r.id : crypto.randomUUID(),
    date: typeof r.date === "string" ? r.date : toISODate(),
    situation: text(r.situation),
    automaticThought: text(r.automaticThought),
    emotion: text(r.emotion).slice(0, 60),
    distressBefore: clamp10(r.distressBefore, 5),
    evidenceFor: text(r.evidenceFor),
    evidenceAgainst: text(r.evidenceAgainst),
    balancedThought: text(r.balancedThought),
    distressAfter: clamp10(r.distressAfter, 5),
    createdAt: typeof r.createdAt === "number" ? r.createdAt : Date.now(),
  };
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage full/unavailable — in-memory only */
  }
}

function emit() {
  listeners.forEach((fn) => fn());
}

export function subscribeCbt(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getCbtRecords(): CbtRecord[] {
  return state;
}

export function addCbtRecord(
  input: Omit<CbtRecord, "id" | "createdAt">,
): CbtRecord {
  const record: CbtRecord = {
    ...sanitizeRecord({ ...input, id: crypto.randomUUID(), createdAt: Date.now() })!,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };
  state = [record, ...state].slice(0, MAX_RECORDS);
  persist();
  emit();
  return record;
}

export function deleteCbtRecord(id: string) {
  const next = state.filter((r) => r.id !== id);
  if (next.length === state.length) return;
  state = next;
  persist();
  emit();
}

/** How much distress dropped (positive = improvement), 0–10. */
export function moodShift(record: CbtRecord): number {
  return record.distressBefore - record.distressAfter;
}

/** Average shift across records; null when there is no data yet. */
export function averageShift(records: CbtRecord[]): number | null {
  if (records.length === 0) return null;
  return (
    Math.round((records.reduce((s, r) => s + moodShift(r), 0) / records.length) * 10) / 10
  );
}

/** Safe parse for imports/external data. */
export function sanitizeCbtRecords(raw: unknown): CbtRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(sanitizeRecord).filter((r): r is CbtRecord => r !== null);
}

/**
 * The production reset, called by the wipe (`lib/storageKeys.ts`).
 *
 * A thought record is the most personal thing this module holds, and the key
 * registry removing `belso-iranytu-cbt-records` was not enough on its own: the
 * records were already in `state` from the import, so the running session kept
 * showing them after the reader deleted everything. Clearing the array is what
 * an import with no key gives, and the notify comes last so the record list
 * re-renders empty without a reload.
 */
export function resetCbtRecords(): void {
  state = [];
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* no storage — the in-memory copy above is still the reset */
  }
  emit();
}
