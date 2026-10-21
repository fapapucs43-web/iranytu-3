/**
 * Batch 3 unit tests (bun test).
 * Per-medication dose reminders (P5) · on-device PIN lock (P8a).
 */
import { beforeEach, describe, expect, test } from "bun:test";
import type { MedicationCheck } from "../src/types";
import { toISODate } from "../src/lib/dates";

const backing: Record<string, string> = {};
const sessionBacking: Record<string, string> = {};

beforeEach(() => {
  for (const k of Object.keys(backing)) delete backing[k];
  for (const k of Object.keys(sessionBacking)) delete sessionBacking[k];
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => (k in backing ? backing[k] : null),
    setItem: (k: string, v: string) => {
      backing[k] = v;
    },
    removeItem: (k: string) => {
      delete backing[k];
    },
  };
  (globalThis as unknown as { sessionStorage: unknown }).sessionStorage = {
    getItem: (k: string) => (k in sessionBacking ? sessionBacking[k] : null),
    setItem: (k: string, v: string) => {
      sessionBacking[k] = v;
    },
    removeItem: (k: string) => {
      delete sessionBacking[k];
    },
  };
});

/** Local-time Date at a given "HH:mm" on today's calendar date. */
function at(hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d;
}

type Med = import("../src/lib/medReminders").MedWithRemind;

function med(id: string, times: string[], over: Partial<Med> = {}): Med {
  return { id, name: `Gyógyszer ${id}`, dose: "1 tabletta", times, ...over };
}

/* ------------------------- medReminders: times ------------------------- */

describe("medReminders · time validation", () => {
  test("isValidTime accepts HH:mm only, rejects malformed and out-of-range", async () => {
    const { isValidTime } = await import("../src/lib/medReminders");
    expect(isValidTime("00:00")).toBe(true);
    expect(isValidTime("08:30")).toBe(true);
    expect(isValidTime("23:59")).toBe(true);
    expect(isValidTime("24:00")).toBe(false);
    expect(isValidTime("8:30")).toBe(false);
    expect(isValidTime("08:60")).toBe(false);
    expect(isValidTime("0800")).toBe(false);
    expect(isValidTime("")).toBe(false);
  });

  test("medDoseTimes drops invalid + duplicate times and sorts by time of day", async () => {
    const { medDoseTimes } = await import("../src/lib/medReminders");
    const doses = medDoseTimes([
      med("b", ["20:00", "07:15", "07:15", "nope", "25:00"]),
      med("a", ["12:00"]),
    ]);
    expect(doses.map((d) => `${d.time}`)).toEqual(["07:15", "12:00", "20:00"]);
    expect(doses[0]?.medId).toBe("b");
  });

  test("medDoseTimes caps at MAX_TIMES_PER_MED per medication", async () => {
    const { medDoseTimes, MAX_TIMES_PER_MED } = await import("../src/lib/medReminders");
    expect(MAX_TIMES_PER_MED).toBe(6);
    const many = Array.from({ length: 9 }, (_, i) =>
      `${String(i).padStart(2, "0")}:00`,
    );
    expect(medDoseTimes([med("a", many)])).toHaveLength(6);
  });

  test("medDoseTimes skips medications with remind === false, keeps the rest", async () => {
    const { medDoseTimes } = await import("../src/lib/medReminders");
    const doses = medDoseTimes([
      med("off", ["09:00"], { remind: false }),
      med("on", ["10:00"]),
      med("undef", ["11:00"]),
    ]);
    expect(doses.map((d) => d.medId)).toEqual(["on", "undef"]);
  });
});

/* --------------------------- medReminders: due -------------------------- */

describe("medReminders · dueDoses", () => {
  test("only fires for times that have already arrived", async () => {
    const { dueDoses } = await import("../src/lib/medReminders");
    const meds = [med("a", ["08:00", "22:00"])];
    const early = dueDoses(meds, undefined, at("07:59"));
    expect(early).toHaveLength(0);
    const late = dueDoses(meds, undefined, at("08:00"));
    expect(late.map((d) => d.time)).toEqual(["08:00"]);
    const later = dueDoses(meds, undefined, at("21:00"));
    expect(later.map((d) => d.time)).toEqual(["08:00"]);
  });

  test("a medication already checked as taken is not due again", async () => {
    const { dueDoses } = await import("../src/lib/medReminders");
    const today = toISODate(new Date());
    const checks: MedicationCheck = { [today]: { a: true } };
    expect(dueDoses([med("a", ["08:00"])], checks, at("08:30"))).toHaveLength(0);
  });

  test("checks are per-day: yesterday's check does not silence today", async () => {
    const { dueDoses } = await import("../src/lib/medReminders");
    const yesterday = toISODate(new Date(at("12:00").getTime() - 86_400_000));
    const checks: MedicationCheck = { [yesterday]: { a: true } };
    expect(dueDoses([med("a", ["08:00"])], checks, at("08:30"))).toHaveLength(1);
  });

  test("already-fired keys suppress duplicates and a different day does not", async () => {
    const { dueDoses, doseFiredKey } = await import("../src/lib/medReminders");
    const today = toISODate(new Date());
    const meds = [med("a", ["08:00"])];
    const key = doseFiredKey("a", "08:00", today);
    expect(dueDoses(meds, undefined, at("08:30"), [key])).toHaveLength(0);
    const tomorrow = toISODate(new Date(at("12:00").getTime() + 86_400_000));
    expect(dueDoses(meds, undefined, at("08:30"), [doseFiredKey("a", "08:00", tomorrow)])).toHaveLength(1);
  });

  test("medications are isolated: one taken med does not silence another", async () => {
    const { dueDoses } = await import("../src/lib/medReminders");
    const today = toISODate(new Date());
    const checks: MedicationCheck = { [today]: { a: true } };
    const due = dueDoses([med("a", ["08:00"]), med("b", ["08:00"])], checks, at("08:30"));
    expect(due.map((d) => d.medId)).toEqual(["b"]);
  });

  test("doseFiredKey is stable and date-scoped", async () => {
    const { doseFiredKey } = await import("../src/lib/medReminders");
    expect(doseFiredKey("m1", "08:00", "2026-01-02")).toBe("2026-01-02|m1|08:00");
    expect(doseFiredKey("m1", "08:00", "2026-01-02")).toBe(
      doseFiredKey("m1", "08:00", "2026-01-02"),
    );
    expect(doseFiredKey("m1", "08:00", "2026-01-02")).not.toBe(
      doseFiredKey("m1", "08:00", "2026-01-03"),
    );
  });
});

/* -------------------------- medReminders: next ------------------------- */

describe("medReminders · nextDose", () => {
  test("returns today's upcoming dose with a positive delay", async () => {
    const { nextDose } = await import("../src/lib/medReminders");
    const next = nextDose([med("a", ["22:00"])], at("08:00"));
    expect(next?.dose.time).toBe("22:00");
    expect(next?.msUntil).toBeGreaterThan(0);
    expect(next?.at.getHours()).toBe(22);
  });

  test("wraps to tomorrow once every time has passed", async () => {
    const { nextDose } = await import("../src/lib/medReminders");
    const now = at("23:30");
    const next = nextDose([med("a", ["08:00"])], now);
    expect(next?.dose.time).toBe("08:00");
    // The WHOLE local date, not `getDate()`.
    //
    // This dose wraps across midnight, so on the last day of a month the
    // day-of-month goes 30 → 1 and `getDate() + 1` asks for 31 — reading a
    // CORRECT answer as a failure. It did exactly that on the 30th, in a
    // test nobody had touched and nobody could have predicted would expire:
    // the assertion was about the month, and only the day was ever compared.
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(next?.at.getFullYear()).toBe(tomorrow.getFullYear());
    expect(next?.at.getMonth()).toBe(tomorrow.getMonth());
    expect(next?.at.getDate()).toBe(tomorrow.getDate());
    // And the clock: wrapping must not drag the dose time along with it.
    expect(next?.at.getHours()).toBe(8);
  });

  test("picks the earliest of several medications, ignoring remind === false", async () => {
    const { nextDose } = await import("../src/lib/medReminders");
    const next = nextDose(
      [med("a", ["14:00"]), med("b", ["09:30"]), med("c", ["07:00"], { remind: false })],
      at("08:00"),
    );
    expect(next?.dose.medId).toBe("b");
  });

  test("returns null when there is nothing scheduled", async () => {
    const { nextDose } = await import("../src/lib/medReminders");
    expect(nextDose([], at("08:00"))).toBeNull();
    expect(nextDose([med("a", [])], at("08:00"))).toBeNull();
    expect(nextDose([med("a", ["08:00"], { remind: false })], at("08:00"))).toBeNull();
  });
});

/* ------------------------- medReminders: gating ------------------------ */

describe("medReminders · decideDoseFire", () => {
  const base = {
    enabled: true,
    meds: [med("a", ["08:00"])],
    now: at("08:30"),
    permission: "granted",
  };

  test("fires the first due dose when everything is in order", async () => {
    const { decideDoseFire } = await import("../src/lib/medReminders");
    const d = decideDoseFire(base);
    expect(d.action).toBe("fire");
    if (d.action === "fire") expect(d.dose.time).toBe("08:00");
  });

  test("skips with a reason for each gate", async () => {
    const { decideDoseFire } = await import("../src/lib/medReminders");
    const off = decideDoseFire({ ...base, enabled: false });
    expect(off).toEqual({ action: "skip", reason: "module-off" });

    const empty = decideDoseFire({ ...base, meds: [] });
    expect(empty).toEqual({ action: "skip", reason: "no-meds" });

    const denied = decideDoseFire({ ...base, permission: "denied" });
    expect(denied).toEqual({ action: "skip", reason: "no-permission" });

    const notYet = decideDoseFire({ ...base, now: at("07:00") });
    expect(notYet).toEqual({ action: "skip", reason: "none-due" });
  });

  test("an already-fired dose is not fired twice", async () => {
    const { decideDoseFire, doseFiredKey } = await import("../src/lib/medReminders");
    const today = toISODate(new Date());
    const d = decideDoseFire({
      ...base,
      firedKeys: [doseFiredKey("a", "08:00", today)],
    });
    expect(d).toEqual({ action: "skip", reason: "none-due" });
  });
});

/* ---------------------- medReminders: fired storage -------------------- */

describe("medReminders · fired bookkeeping", () => {
  test("markDoseFired persists and dedups; resetFired clears", async () => {
    const { markDoseFired, firedKeysFor, resetFired, FIRED_KEY } = await import(
      "../src/lib/medReminders"
    );
    const today = toISODate(new Date());
    markDoseFired(today, "k1");
    markDoseFired(today, "k1");
    markDoseFired(today, "k2");
    expect(firedKeysFor(today).sort()).toEqual(["k1", "k2"]);
    expect(backing[FIRED_KEY]).toContain("k1");
    resetFired();
    expect(firedKeysFor(today)).toEqual([]);
  });

  test("only the last 7 days of history are kept", async () => {
    const { markDoseFired, firedKeysFor, FIRED_KEY } = await import("../src/lib/medReminders");
    for (let i = 20; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      markDoseFired(toISODate(d), `key-${i}`);
    }
    const stored = JSON.parse(backing[FIRED_KEY] ?? "{}") as Record<string, string[]>;
    expect(Object.keys(stored).length).toBeLessThanOrEqual(7);
    expect(firedKeysFor(toISODate(new Date()))).toEqual(["key-0"]);
  });

  test("corrupt storage degrades to an empty list instead of throwing", async () => {
    const { FIRED_KEY, firedKeysFor, markDoseFired } = await import("../src/lib/medReminders");
    backing[FIRED_KEY] = "{not json";
    expect(firedKeysFor(toISODate(new Date()))).toEqual([]);
    markDoseFired(toISODate(new Date()), "k");
    expect(firedKeysFor(toISODate(new Date()))).toEqual(["k"]);
  });
});

/* ------------------------------ appLock: PIN ---------------------------- */

describe("appLock · PIN validation", () => {
  test("isValidPinFormat enforces 4–6 digits", async () => {
    const { isValidPinFormat, PIN_MIN, PIN_MAX } = await import("../src/lib/appLock");
    expect([PIN_MIN, PIN_MAX]).toEqual([4, 6]);
    expect(isValidPinFormat("123")).toBe(false);
    expect(isValidPinFormat("1379")).toBe(true);
    expect(isValidPinFormat("137946")).toBe(true);
    expect(isValidPinFormat("1379456")).toBe(false);
    expect(isValidPinFormat("13a9")).toBe(false);
    expect(isValidPinFormat("")).toBe(false);
  });

  test("isWeakPin rejects repeats and ascending/descending runs", async () => {
    const { isWeakPin } = await import("../src/lib/appLock");
    expect(isWeakPin("1111")).toBe(true);
    expect(isWeakPin("1234")).toBe(true);
    expect(isWeakPin("4321")).toBe(true);
    expect(isWeakPin("2345")).toBe(true);
    expect(isWeakPin("1357")).toBe(false);
    expect(isWeakPin("4817")).toBe(false);
  });
});

/* ------------------------- appLock: set / verify ------------------------ */

describe("appLock · setPin / verifyPin", () => {
  test("no lock until a PIN is set", async () => {
    const { isLockEnabled, clearLock, setPin } = await import("../src/lib/appLock");
    clearLock();
    expect(isLockEnabled()).toBe(false);
    await setPin("4817");
    expect(isLockEnabled()).toBe(true);
  });

  test("the stored record never contains the plaintext PIN", async () => {
    const { setPin, LOCK_KEY } = await import("../src/lib/appLock");
    await setPin("4817");
    const raw = backing[LOCK_KEY] ?? "";
    expect(raw).not.toContain("4817");
    const rec = JSON.parse(raw) as { salt: string; hash: string; iterations: number };
    expect(rec.salt).toHaveLength(64); // 32 bytes hex
    expect(rec.hash).toHaveLength(64); // SHA-256 hex
    expect(rec.iterations).toBe(150_000);
  });

  test("two identical PINs get different hashes (random salt)", async () => {
    const { setPin, LOCK_KEY } = await import("../src/lib/appLock");
    await setPin("4817");
    const first = JSON.parse(backing[LOCK_KEY] ?? "{}") as { salt: string; hash: string };
    await setPin("4817");
    const second = JSON.parse(backing[LOCK_KEY] ?? "{}") as { salt: string; hash: string };
    expect(second.salt).not.toBe(first.salt);
    expect(second.hash).not.toBe(first.hash);
  });

  test("setPin refuses bad format and weak PINs", async () => {
    const { setPin, isLockEnabled, clearLock } = await import("../src/lib/appLock");
    clearLock();
    expect((await setPin("123")).ok).toBe(false);
    expect((await setPin("1111")).ok).toBe(false);
    expect((await setPin("1234")).ok).toBe(false);
    expect(isLockEnabled()).toBe(false);
    expect((await setPin("4817")).ok).toBe(true);
  });

  test("verifyPin accepts the right PIN and rejects a wrong one", async () => {
    const { setPin, verifyPin, clearLock } = await import("../src/lib/appLock");
    clearLock();
    await setPin("4817");
    expect((await verifyPin("4817")).ok).toBe(true);
    const wrong = await verifyPin("1357");
    expect(wrong.ok).toBe(false);
    expect(wrong.ok === false && wrong.error.length).toBeGreaterThan(0);
  });

  test("verifying without a PIN set is refused", async () => {
    const { verifyPin, clearLock } = await import("../src/lib/appLock");
    clearLock();
    const res = await verifyPin("4817");
    expect(res.ok).toBe(false);
  });

  test("a successful verify resets the failed-attempt counter", async () => {
    const { setPin, verifyPin, clearLock, LOCK_KEY } = await import("../src/lib/appLock");
    clearLock();
    await setPin("4817");
    await verifyPin("0000");
    await verifyPin("0000");
    expect((JSON.parse(backing[LOCK_KEY]) as { failedAttempts: number }).failedAttempts).toBe(2);
    await verifyPin("4817");
    expect((JSON.parse(backing[LOCK_KEY]) as { failedAttempts: number }).failedAttempts).toBe(0);
  });
});

/* -------------------------- appLock: cooldown -------------------------- */

describe("appLock · throttling", () => {
  test("after 5 wrong tries verification is refused until lockedUntil", async () => {
    const {
      setPin,
      verifyPin,
      clearLock,
      LOCK_KEY,
      MAX_ATTEMPTS_BEFORE_COOLDOWN,
      COOLDOWN_BASE_MS,
    } = await import("../src/lib/appLock");
    clearLock();
    await setPin("4817");
    const t0 = 1_700_000_000_000;
    for (let i = 0; i < MAX_ATTEMPTS_BEFORE_COOLDOWN - 1; i++) {
      expect((await verifyPin("0000", t0)).ok).toBe(false);
    }
    const last = await verifyPin("0000", t0);
    expect(last.ok).toBe(false);
    const rec = JSON.parse(backing[LOCK_KEY] ?? "{}") as { lockedUntil: number };
    expect(rec.lockedUntil).toBe(t0 + COOLDOWN_BASE_MS);

    // Even the CORRECT pin is refused during the cooldown…
    const blocked = await verifyPin("4817", t0 + 1000);
    expect(blocked.ok).toBe(false);
    expect(blocked.ok === false ? blocked.lockedUntil : 0).toBe(t0 + COOLDOWN_BASE_MS);
    // …and works again once it expires.
    expect((await verifyPin("4817", t0 + COOLDOWN_BASE_MS + 1)).ok).toBe(true);
  });

  test("the cooldown doubles per extra attempt and is capped at 30 minutes", async () => {
    const {
      setPin,
      verifyPin,
      clearLock,
      LOCK_KEY,
      COOLDOWN_BASE_MS,
      COOLDOWN_MAX_MS,
      MAX_ATTEMPTS_BEFORE_COOLDOWN,
    } = await import("../src/lib/appLock");
    clearLock();
    await setPin("4817");
    let now = 1_700_000_000_000;
    const record = () =>
      JSON.parse(backing[LOCK_KEY] ?? "{}") as { failedAttempts: number; lockedUntil: number };

    // Attempts 1..4 are refused but carry no cooldown yet.
    for (let i = 1; i < MAX_ATTEMPTS_BEFORE_COOLDOWN; i++) {
      await verifyPin("0000", now);
      expect(record().failedAttempts).toBe(i);
      expect(record().lockedUntil).toBe(0);
    }

    // Attempt 5 opens the first cooldown.
    await verifyPin("0000", now);
    expect(record().failedAttempts).toBe(5);
    expect(record().lockedUntil).toBe(now + COOLDOWN_BASE_MS);

    // Every further attempt doubles it: 2m, 4m, 8m, 16m, then capped at 30m.
    const expected = [2, 4, 8, 16, COOLDOWN_MAX_MS / 60_000, COOLDOWN_MAX_MS / 60_000];
    for (const minutes of expected) {
      now = record().lockedUntil + 1; // wait the cooldown out
      await verifyPin("0000", now);
      const want = Math.min(COOLDOWN_BASE_MS * minutes, COOLDOWN_MAX_MS);
      expect(record().lockedUntil - now).toBe(want);
    }
  });
});

/* ------------------- appLock: change / disable / clear ------------------ */

describe("appLock · changePin / disablePin / clearLock", () => {
  test("changePin requires the current PIN", async () => {
    const { setPin, changePin, verifyPin, clearLock } = await import("../src/lib/appLock");
    clearLock();
    await setPin("4817");
    expect((await changePin("0000", "1357")).ok).toBe(false);
    expect((await changePin("4817", "1111")).ok).toBe(false); // weak next PIN
    expect((await changePin("4817", "1357")).ok).toBe(true);
    expect((await verifyPin("1357")).ok).toBe(true);
    expect((await verifyPin("4817")).ok).toBe(false);
  });

  test("disablePin requires the current PIN and turns the lock off", async () => {
    const { setPin, disablePin, clearLock, isLockEnabled, needsUnlock } = await import(
      "../src/lib/appLock"
    );
    clearLock();
    await setPin("4817");
    expect((await disablePin("0000")).ok).toBe(false);
    expect(isLockEnabled()).toBe(true);
    expect((await disablePin("4817")).ok).toBe(true);
    expect(isLockEnabled()).toBe(false);
    expect(needsUnlock()).toBe(false);
  });

  test("clearLock removes the lock and re-locks any session", async () => {
    const { setPin, clearLock, isLockEnabled, isUnlocked, unlockSession } = await import(
      "../src/lib/appLock"
    );
    clearLock();
    await setPin("4817");
    unlockSession();
    expect(isUnlocked()).toBe(true);
    clearLock();
    expect(isLockEnabled()).toBe(false);
    expect(isUnlocked()).toBe(false);
  });
});

/* ------------------------- appLock: session rules ----------------------- */

describe("appLock · session unlock", () => {
  test("verifyPin unlocks the session for the day", async () => {
    const { setPin, verifyPin, clearLock, isUnlocked, needsUnlock, SESSION_IDLE_MS } = await import(
      "../src/lib/appLock"
    );
    clearLock();
    await setPin("4817");
    expect(isUnlocked()).toBe(false);
    expect(needsUnlock()).toBe(true);
    const t0 = 1_700_000_000_000;
    expect((await verifyPin("4817", t0)).ok).toBe(true);
    expect(isUnlocked(t0)).toBe(true);
    expect(needsUnlock(t0)).toBe(false);
    // Still unlocked after 14 idle minutes…
    expect(needsUnlock(t0 + SESSION_IDLE_MS - 1000)).toBe(false);
    // …and re-locks at 15.
    expect(needsUnlock(t0 + SESSION_IDLE_MS + 1)).toBe(true);
    expect(isUnlocked(t0 + SESSION_IDLE_MS + 1)).toBe(false);
  });

  test("the session never survives a calendar-day change", async () => {
    const { setPin, verifyPin, clearLock, isUnlocked, needsUnlock } = await import(
      "../src/lib/appLock"
    );
    clearLock();
    await setPin("4817");
    const t0 = new Date();
    t0.setHours(9, 0, 0, 0);
    await verifyPin("4817", t0.getTime());
    expect(needsUnlock(t0.getTime())).toBe(false);
    // 2 hours later, but tomorrow.
    const nextDay = new Date(t0);
    nextDay.setDate(nextDay.getDate() + 1);
    expect(isUnlocked(nextDay.getTime())).toBe(false);
    expect(needsUnlock(nextDay.getTime())).toBe(true);
  });

  test("needsUnlock is always false when no PIN is set", async () => {
    const { clearLock, needsUnlock, isUnlocked } = await import("../src/lib/appLock");
    clearLock();
    expect(needsUnlock()).toBe(false);
    expect(isUnlocked()).toBe(false);
  });

  test("lockSession drops the unlock state", async () => {
    const { setPin, clearLock, unlockSession, lockSession, isUnlocked } = await import(
      "../src/lib/appLock"
    );
    clearLock();
    await setPin("4817");
    unlockSession();
    expect(isUnlocked()).toBe(true);
    lockSession();
    expect(isUnlocked()).toBe(false);
  });
});
