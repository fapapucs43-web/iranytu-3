/**
 * On-device PIN lock (Batch 3, P8a).
 *
 * Privacy-first: nothing leaves the device and the PIN itself is NEVER stored.
 * Only a PBKDF2-SHA256 hash (random 32-byte salt, 150k iterations) lives in
 * this module's own localStorage key.
 *
 * Honest scope: this is a convenience/privacy screen, not encryption — the
 * journal data itself stays plaintext in the app's own store, so anyone with
 * devtools or physical access can read it. It prevents casual snooping.
 *
 * Session rules (user-approved): unlocking lasts for the browser session, but
 * re-locks after 15 idle minutes or when the calendar day changes. WebCrypto
 * only — no new dependencies.
 */
import { toISODate } from "./dates";
import { t } from "./i18n";

export const LOCK_KEY = "belso-iranytu-app-lock";
const SESSION_KEY = "belso-iranytu-app-lock-session";

export const PIN_MIN = 4;
export const PIN_MAX = 6;
export const PBKDF2_ITERATIONS = 150_000;
export const MAX_ATTEMPTS_BEFORE_COOLDOWN = 5;
export const COOLDOWN_BASE_MS = 60_000;
export const COOLDOWN_MAX_MS = 30 * 60_000;
export const SESSION_IDLE_MS = 15 * 60_000;

type LockRecord = {
  /** hex */
  salt: string;
  /** hex */
  hash: string;
  iterations: number;
  failedAttempts: number;
  /** epoch ms until which verification is refused */
  lockedUntil: number;
  updatedAt: number;
};

/* ------------------------------ hex utils ------------------------------ */

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(Math.floor(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/* ------------------------------ storage ------------------------------- */

function readRecord(): LockRecord | null {
  try {
    const raw = localStorage.getItem(LOCK_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as Partial<LockRecord>;
    if (typeof r.salt !== "string" || typeof r.hash !== "string") return null;
    return {
      salt: r.salt,
      hash: r.hash,
      iterations: typeof r.iterations === "number" ? r.iterations : PBKDF2_ITERATIONS,
      failedAttempts: typeof r.failedAttempts === "number" ? r.failedAttempts : 0,
      lockedUntil: typeof r.lockedUntil === "number" ? r.lockedUntil : 0,
      updatedAt: typeof r.updatedAt === "number" ? r.updatedAt : 0,
    };
  } catch {
    return null;
  }
}

function writeRecord(record: LockRecord): void {
  try {
    localStorage.setItem(LOCK_KEY, JSON.stringify(record));
  } catch {
    /* in-memory only */
  }
}

/** Is a PIN set up? */
export function isLockEnabled(): boolean {
  return readRecord() !== null;
}

/**
 * Seconds left on a lockout that is already running, 0 if there is none.
 *
 * Reading `lockedUntil` out of the record is what lets a reload carry the
 * countdown across: the deadline was stored the moment it was handed out, and
 * nothing needs to recompute it. A lockout that has already expired reads as 0
 * rather than a negative number, so callers can treat it as a plain count.
 */
export function remainingLockoutSeconds(now = Date.now()): number {
  const record = readRecord();
  if (!record) return 0;
  return Math.max(0, Math.ceil((record.lockedUntil - now) / 1000));
}

/* ----------------------------- validation ----------------------------- */

export function isValidPinFormat(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_MIN},${PIN_MAX}}$`).test(pin);
}

/** Reject trivially guessable PINs: repeated digits (1111) or runs (1234, 4321). */
export function isWeakPin(pin: string): boolean {
  const digits = pin.split("");
  if (new Set(digits).size === 1) return true;
  let ascending = true;
  let descending = true;
  for (let i = 1; i < digits.length; i++) {
    const d = Number(digits[i]) - Number(digits[i - 1]);
    if (d !== 1) ascending = false;
    if (d !== -1) descending = false;
  }
  return ascending || descending;
}

/* ------------------------------- hashing ------------------------------ */

export async function hashPin(
  pin: string,
  salt: Uint8Array,
  iterations = PBKDF2_ITERATIONS,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    256,
  );
  return toHex(bits);
}

/* -------------------------------- API --------------------------------- */

export type PinResult = { ok: true } | { ok: false; error: string };

/** Enable the lock with a new PIN (replaces any existing one). */
export async function setPin(pin: string): Promise<PinResult> {
  if (!isValidPinFormat(pin)) {
    // The card validates before it calls this, so the two sentences a reader can
    // see for one condition are the SAME key rather than two copies of one
    // sentence. Round 18 moved every message here into the catalogue and reused
    // the card's two (`settings.pin.lengthError`, `settings.pin.weakError`)
    // instead of minting a second pair.
    return { ok: false, error: t("settings.pin.lengthError", { min: PIN_MIN, max: PIN_MAX }) };
  }
  if (isWeakPin(pin)) {
    return { ok: false, error: t("settings.pin.weakError") };
  }
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const hash = await hashPin(pin, salt);
  writeRecord({
    salt: toHex(salt.buffer as ArrayBuffer),
    hash,
    iterations: PBKDF2_ITERATIONS,
    failedAttempts: 0,
    lockedUntil: 0,
    updatedAt: Date.now(),
  });
  return { ok: true };
}

export type VerifyResult = PinResult & { lockedUntil?: number };

/** Verify a PIN. On success the session is unlocked and attempts reset. */
export async function verifyPin(pin: string, now = Date.now()): Promise<VerifyResult> {
  const rec = readRecord();
  if (!rec) return { ok: false, error: t("lock.noPin") };
  if (rec.lockedUntil > now) {
    return { ok: false, error: t("lock.tooManyAttempts"), lockedUntil: rec.lockedUntil };
  }
  const hash = await hashPin(pin, fromHex(rec.salt), rec.iterations);
  if (hash === rec.hash) {
    writeRecord({ ...rec, failedAttempts: 0, lockedUntil: 0, updatedAt: now });
    unlockSession(now);
    return { ok: true };
  }
  const failedAttempts = rec.failedAttempts + 1;
  let lockedUntil = 0;
  if (failedAttempts >= MAX_ATTEMPTS_BEFORE_COOLDOWN) {
    const over = failedAttempts - MAX_ATTEMPTS_BEFORE_COOLDOWN;
    lockedUntil = now + Math.min(COOLDOWN_BASE_MS * 2 ** over, COOLDOWN_MAX_MS);
  }
  writeRecord({ ...rec, failedAttempts, lockedUntil, updatedAt: now });
  return { ok: false, error: t("lock.wrongPin") };
}

/** Change the PIN: current one must verify first. */
export async function changePin(current: string, next: string): Promise<PinResult> {
  const check = await verifyPin(current);
  if (!check.ok) return check;
  const saved = readRecord();
  if (saved) writeRecord({ ...saved, failedAttempts: 0, lockedUntil: 0, updatedAt: Date.now() });
  return setPin(next);
}

/** Turn the lock off (current PIN required). */
export async function disablePin(current: string): Promise<PinResult> {
  const check = await verifyPin(current);
  if (!check.ok) return check;
  clearLock();
  return { ok: true };
}

/** Wipe all lock state — used by "Minden adat törlése" and by tests. */
export function clearLock(): void {
  try {
    localStorage.removeItem(LOCK_KEY);
  } catch {
    /* noop */
  }
  lockSession();
}

/* --------------------------- session unlock --------------------------- */

type Session = { date: string; at: number };

/** Fallback for environments without sessionStorage (tests, private mode). */
let memorySession: Session | null = null;

function readSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return memorySession;
    const parsed = JSON.parse(raw) as Partial<Session>;
    if (typeof parsed.date !== "string" || typeof parsed.at !== "number") return null;
    return { date: parsed.date, at: parsed.at };
  } catch {
    return memorySession;
  }
}

export function unlockSession(now = Date.now()): void {
  const session: Session = { date: toISODate(new Date(now)), at: now };
  memorySession = session;
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* memory only */
  }
}

export function lockSession(): void {
  memorySession = null;
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* noop */
  }
}

/** Unlocked only within the same calendar day and 15 idle minutes. */
export function isUnlocked(now = Date.now()): boolean {
  const session = readSession();
  if (!session) return false;
  if (session.date !== toISODate(new Date(now))) return false;
  return now - session.at < SESSION_IDLE_MS;
}

/** True when the lock screen must be shown; clears stale sessions. */
export function needsUnlock(now = Date.now()): boolean {
  if (!isLockEnabled()) return false;
  if (isUnlocked(now)) return false;
  lockSession();
  return true;
}
