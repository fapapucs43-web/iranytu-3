/**
 * Assessment storage (Batch 6).
 *
 * WHY A SEPARATE localStorage KEY
 * The main app blob (`belso-iranytu-data-v2`) holds `profile` and `entries`.
 * Putting assessments in there would make it POSSIBLE for the analysis
 * engine, a badge rule, a streak, or a future profile panel to read them — and
 * a mood journal that slowly accumulates a "condition" attached to a person is
 * precisely the pattern this feature must not become. A separate key makes
 * that structural rather than a promise: there is no field to read, so nothing
 * downstream can pick it up by accident.
 *
 * ONLY RAW ANSWERS ARE STORED. Score and band are DERIVED on read, from
 * `lib/assessments`, for one reason: if the band definitions are ever revised,
 * a stored score would disagree with the stored answers and the log would show
 * two different truths. Deriving means the raw data is the single record, and
 * history is always readable and always consistent with today's wording.
 *
 * This is an APPEND-ONLY, DATED LOG. There is no "current state", no "latest
 * result" that overwrites the last one, and nothing that reads a previous run
 * to comment on this one. `listAssessments` is a history and nothing more.
 */
import { ITEM_COUNT, isComplete, summarize, type Band } from "./assessments";

const KEY = "belso-iranytu-assessments-v1";
const VERSION = 1;

/** What is actually persisted: raw answers and a date. No derived score. */
export type StoredAssessment = {
  id: string;
  /** Local calendar date, `YYYY-MM-DD` — same keying as journal entries. */
  date: string;
  answers: number[];
  /** Optional functional-impact answer, or null when the step was skipped. */
  impact: number | null;
};

/** A stored record plus everything derived from it at read time. */
export type AssessmentRecord = StoredAssessment & {
  score: number;
  band: Band;
  /** The supplementary item was answered above "Egyszer sem" on this run. */
  needsSupport: boolean;
};

type Payload = { version: number; items: StoredAssessment[] };

/**
 * In-memory fallback, used when localStorage is unavailable or full. The rest
 * of the app does the same: a private-browsing session that cannot write
 * storage still works, it just forgets on reload.
 */
let memory: StoredAssessment[] = [];
let memoryOnly = false;

function storage(): Storage | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const probe = "__belso_probe__";
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

function normalize(raw: unknown): StoredAssessment | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !r.id) return null;
  if (typeof r.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) return null;
  if (!Array.isArray(r.answers)) return null;
  const answers = r.answers.map(Number);
  // A half-written or tampered record is dropped, not coerced: a partial run
  // scored into a band is the one thing this feature must never do.
  if (!isComplete({ answers })) return null;
  const impactRaw = r.impact;
  const impact =
    impactRaw === null || impactRaw === undefined ? null : Number(impactRaw);
  return {
    id: r.id,
    date: r.date,
    answers,
    impact: impact === null || Number.isNaN(impact) ? null : impact,
  };
}

function read(): StoredAssessment[] {
  const s = storage();
  if (!s) return memory;
  try {
    const raw = s.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<Payload>;
    if (!parsed || !Array.isArray(parsed.items)) return [];
    return parsed.items.map(normalize).filter((x): x is StoredAssessment => x !== null);
  } catch {
    // Corrupt JSON must never take the app down; it behaves as "no log yet".
    return [];
  }
}

function write(items: StoredAssessment[]): void {
  memory = items;
  const s = storage();
  if (!s) {
    memoryOnly = true;
    return;
  }
  try {
    s.setItem(KEY, JSON.stringify({ version: VERSION, items } satisfies Payload));
    memoryOnly = false;
  } catch {
    // Storage full or unavailable — the UI keeps working from memory.
    memoryOnly = true;
  }
}

/** True when the last write could not reach localStorage. */
export function isMemoryOnly(): boolean {
  return memoryOnly;
}

/** The dated log, newest first. Derived fields are attached here, nowhere else. */
export function listAssessments(): AssessmentRecord[] {
  return read()
    .map((item) => {
      const { score: total, band } = summarize({ answers: item.answers, impact: item.impact });
      const supplementary = item.answers[ITEM_COUNT - 1] ?? 0;
      return { ...item, score: total, band, needsSupport: supplementary > 0 };
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function getAssessment(id: string): AssessmentRecord | null {
  return listAssessments().find((a) => a.id === id) ?? null;
}

/**
 * Append one completed run. Returns the stored record, or null if the answers
 * were incomplete — there is deliberately no "save partial" path.
 */
export function addAssessment(input: {
  date: string;
  answers: number[];
  impact?: number | null;
}): AssessmentRecord | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return null;
  if (!isComplete({ answers: input.answers })) return null;
  const item: StoredAssessment = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `a-${input.date}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    date: input.date,
    answers: [...input.answers],
    impact: input.impact ?? null,
  };
  write([...read(), item]);
  const record = getAssessment(item.id);
  return record;
}

export function removeAssessment(id: string): void {
  write(read().filter((a) => a.id !== id));
}

/**
 * Replace the log with the contents of an export, preserving ids and dates so
 * an export → import → export round trip is byte-identical.
 *
 * The JSON export carries `assessmentLog`; if the import path ignored it, a
 * user restoring a backup would silently lose every self-assessment in it,
 * with no error and no visible sign. Records that fail validation are
 * dropped rather than coerced, exactly as on a normal read.
 */
export function importAssessments(incoming: unknown): number {
  if (!incoming || typeof incoming !== "object") return 0;
  const items = (incoming as { items?: unknown }).items;
  if (!Array.isArray(items)) return 0;
  const clean = items.map(normalize).filter((x): x is StoredAssessment => x !== null);
  if (clean.length === 0) return 0;
  // Merge on id, so re-importing the same file does not duplicate anything.
  const byId = new Map<string, StoredAssessment>();
  for (const item of read()) byId.set(item.id, item);
  for (const item of clean) byId.set(item.id, item);
  write([...byId.values()]);
  return clean.length;
}

/**
 * Delete every stored run. Called when the user turns the module OFF, so that
 * disabling it actually removes the data — the consent screen promises this,
 * and a test asserts it.
 */
export function clearAssessments(): void {
  memory = [];
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(KEY);
    memoryOnly = false;
  } catch {
    memoryOnly = true;
  }
}

/** Test seam. */
export function resetForTests(): void {
  memory = [];
  memoryOnly = false;
  const s = storage();
  try {
    s?.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export const STORAGE_KEY = KEY;
