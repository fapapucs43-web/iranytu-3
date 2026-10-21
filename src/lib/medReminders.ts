/**
 * Per-medication dose reminders (Batch 3, P5).
 *
 * Pure scheduling over the data the app ALREADY has: `Medication.times` holds
 * per-medication "HH:mm" times and `MedicationCheck[date][medId]` records what
 * was taken — so no entry shape or store migration changes. The only new state
 * is the "already reminded today" bookkeeping, in its own key (same pattern as
 * the other libs). No new dependencies.
 */
import type { Medication, MedicationCheck } from "../types";
import { toISODate } from "./dates";

/** Medication + the optional per-med reminder switch (types.ts gains it in the integration diff). */
export type MedWithRemind = Medication & { remind?: boolean };

export type Dose = {
  medId: string;
  name: string;
  dose: string;
  /** "HH:mm" */
  time: string;
};

export const MAX_TIMES_PER_MED = 6;
export const FIRED_KEY = "belso-iranytu-med-reminders-fired";

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTime(value: string): boolean {
  return typeof value === "string" && TIME_RE.test(value);
}

/** Minutes since midnight; NaN for malformed input. */
export function minutesOf(time: string): number {
  const m = TIME_RE.exec(time);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

/** Reminders default to ON; a medication turns them off with remind === false. */
function wantsReminder(med: MedWithRemind): boolean {
  return med.remind !== false;
}

function minutesOfNow(now: Date): number {
  return now.getHours() * 60 + now.getMinutes();
}

function isoOf(now: Date): string {
  return toISODate(now);
}

/**
 * Every (medication, time) pair: invalid or duplicate times dropped, capped
 * per medication, sorted by time of day.
 */
export function medDoseTimes(meds: MedWithRemind[]): Dose[] {
  const out: Dose[] = [];
  for (const med of meds) {
    if (!wantsReminder(med)) continue;
    const seen = new Set<string>();
    let count = 0;
    for (const time of med.times ?? []) {
      if (count >= MAX_TIMES_PER_MED) break;
      if (!isValidTime(time) || seen.has(time)) continue;
      seen.add(time);
      count += 1;
      out.push({ medId: med.id, name: med.name, dose: med.dose, time });
    }
  }
  return out.sort(
    (a, b) => minutesOf(a.time) - minutesOf(b.time) || a.name.localeCompare(b.name, "hu"),
  );
}

/** Stable id for one (medication, time, day) reminder. */
export function doseFiredKey(medId: string, time: string, dateIso: string): string {
  return `${dateIso}|${medId}|${time}`;
}

function isTaken(checks: MedicationCheck | undefined, dateIso: string, medId: string): boolean {
  return Boolean(checks?.[dateIso]?.[medId]);
}

/**
 * Doses that are due: time has arrived today, not marked as taken, and not
 * already reminded.
 */
export function dueDoses(
  meds: MedWithRemind[],
  checks: MedicationCheck | undefined,
  now: Date,
  firedKeys: readonly string[] = [],
): Dose[] {
  const dateIso = isoOf(now);
  const nowMin = minutesOfNow(now);
  const fired = new Set(firedKeys);
  return medDoseTimes(meds).filter((d) => {
    if (minutesOf(d.time) > nowMin) return false;
    if (isTaken(checks, dateIso, d.medId)) return false;
    return !fired.has(doseFiredKey(d.medId, d.time, dateIso));
  });
}

export type NextDose = { dose: Dose; at: Date; msUntil: number };

/** Next upcoming dose; wraps to tomorrow once today's times have passed. */
export function nextDose(meds: MedWithRemind[], now: Date): NextDose | null {
  const doses = medDoseTimes(meds);
  if (doses.length === 0) return null;
  const nowMin = minutesOfNow(now);
  const candidates = doses.map((d) => {
    const m = minutesOf(d.time);
    const at = new Date(now);
    at.setDate(at.getDate() + (m >= nowMin ? 0 : 1));
    at.setHours(Math.floor(m / 60), m % 60, 0, 0);
    return { dose: d, at };
  });
  candidates.sort((a, b) => a.at.getTime() - b.at.getTime());
  const best = candidates[0];
  return { dose: best.dose, at: best.at, msUntil: Math.max(0, best.at.getTime() - now.getTime()) };
}

export type FireDecision =
  | { action: "fire"; dose: Dose }
  | { action: "skip"; reason: "module-off" | "no-meds" | "no-permission" | "none-due" };

/**
 * Gate mirroring lib/reminderDaemon's decideFire, extended per dose:
 * module off → no times → no permission → nothing due.
 */
export function decideDoseFire(input: {
  /** settings.medsModule */
  enabled: boolean;
  meds: MedWithRemind[];
  checks?: MedicationCheck;
  now: Date;
  /** Notification.permission */
  permission: string;
  firedKeys?: readonly string[];
}): FireDecision {
  if (!input.enabled) return { action: "skip", reason: "module-off" };
  if (medDoseTimes(input.meds).length === 0) return { action: "skip", reason: "no-meds" };
  if (input.permission !== "granted") return { action: "skip", reason: "no-permission" };
  const due = dueDoses(input.meds, input.checks, input.now, input.firedKeys ?? []);
  if (due.length === 0) return { action: "skip", reason: "none-due" };
  return { action: "fire", dose: due[0] };
}

/* --------------------- fired bookkeeping (own key) --------------------- */

type FiredStore = Record<string, string[]>; // dateIso -> fired keys

function readFired(): FiredStore {
  try {
    const raw = localStorage.getItem(FIRED_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: FiredStore = {};
    for (const [date, keys] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(keys)) out[date] = keys.filter((k): k is string => typeof k === "string");
    }
    return out;
  } catch {
    return {};
  }
}

export function firedKeysFor(dateIso: string): string[] {
  return readFired()[dateIso] ?? [];
}

/** Remember that this dose already reminded today (keeps the last 7 days only). */
export function markDoseFired(dateIso: string, key: string): void {
  const store = readFired();
  const list = new Set(store[dateIso] ?? []);
  list.add(key);
  store[dateIso] = [...list];
  const trimmed = Object.fromEntries(
    Object.keys(store)
      .sort()
      .slice(-7)
      .map((d) => [d, store[d]]),
  );
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify(trimmed));
  } catch {
    /* in-memory only */
  }
}

export function resetFired(): void {
  try {
    localStorage.removeItem(FIRED_KEY);
  } catch {
    /* noop */
  }
}
