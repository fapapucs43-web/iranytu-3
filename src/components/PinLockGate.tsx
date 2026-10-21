/**
 * PIN lock screen (Batch 3, P8a).
 *
 * Renders nothing while the session is unlocked. When locked it covers the app
 * so the journal is not readable at a glance, and any interaction refreshes the
 * 15-minute idle window (user-approved rule) so an app that is actually being
 * used never re-locks on its own.
 *
 * Recovery, by user decision: there is none. The PIN is never stored, only a
 * PBKDF2 hash, so nobody — including us — can recover it. The copy below says
 * so plainly and points at export first.
 */
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { LockIcon } from "../lib/icons";
import {
  isLockEnabled,
  isUnlocked,
  needsUnlock,
  remainingLockoutSeconds,
  unlockSession,
  verifyPin,
} from "../lib/appLock";
import { t } from "../lib/i18n";

function remainingSeconds(lockedUntil: number, now: number): number {
  return Math.max(0, Math.ceil((lockedUntil - now) / 1000));
}

/**
 * The lockout sentence, as one pure function.
 *
 * It lives here rather than inline in the markup because the same words are
 * spoken by the live region and shown on screen, and two copies of a sentence a
 * screen reader has to agree with is one copy too many.
 */
export function formatCooldown(cooldown: number): string {
  const minutes = Math.floor(cooldown / 60);
  const seconds = cooldown % 60;
  return `Újra próbálhatod ${minutes > 0 ? `${minutes} perc ` : ""}${seconds} másodperc múlva.`;
}

/**
 * The lockout notice: said once, shown ticking.
 *
 * `announcement` is the countdown frozen at the moment the lockout began, and
 * it is the only part in a live region. The visible text deliberately is not
 * one: a polite live region re-announces every time its text changes, so
 * `aria-live` on a line that ticks down once a second would say the same
 * sentence sixty times a minute and bury anything else the app had to say.
 * Announcing the total once and leaving the countdown as ordinary readable
 * text gives both — the reader hears how long they are locked out, and can
 * still read the exact remaining time whenever they look for it.
 */
export function CooldownNotice({
  cooldown,
  announcement,
}: {
  cooldown: number;
  announcement: string;
}) {
  if (cooldown <= 0) return null;
  return (
    <>
      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>
      <p className="pin-error">{formatCooldown(cooldown)}</p>
    </>
  );
}

/**
 * What the gate should show on its very first render.
 *
 * Both numbers come from one read because they have to agree: if the countdown
 * were seeded separately from the sentence, the sentence could describe a
 * lockout the countdown is not showing. Initialising from the stored deadline
 * is also what makes a reload land on a counting-down screen instead of a
 * plain locked one.
 */
function initialLockout(): { cooldown: number; announcement: string } {
  const cooldown = remainingLockoutSeconds();
  return { cooldown, announcement: cooldown > 0 ? formatCooldown(cooldown) : "" };
}

export default function PinLockGate() {
  const [locked, setLocked] = useState(() => needsUnlock());
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [lockout] = useState(initialLockout);
  const [cooldown, setCooldown] = useState(lockout.cooldown);
  const [announcement, setAnnouncement] = useState(lockout.announcement);

  /* Re-evaluate on mount, on tab return, and on the idle deadline. */
  useEffect(() => {
    if (!isLockEnabled()) {
      setLocked(false);
      return;
    }
    const check = () => setLocked(needsUnlock());
    check();
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    const poll = window.setInterval(check, 15_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(poll);
    };
  }, []);

  /* Any interaction counts as activity: push the idle deadline forward. */
  const markActive = useCallback(() => {
    if (isLockEnabled() && isUnlocked()) unlockSession();
  }, []);

  useEffect(() => {
    if (locked) return;
    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "touchstart"];
    for (const ev of events) window.addEventListener(ev, markActive, { passive: true });
    return () => {
      for (const ev of events) window.removeEventListener(ev, markActive);
    };
  }, [locked, markActive]);

  /* Live countdown while throttled. */
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setInterval(
      () => setCooldown((c) => Math.max(0, c - 1)),
      1000,
    );
    return () => window.clearInterval(t);
  }, [cooldown > 0]);

  /*
   * Freeze the countdown the moment the lockout starts. The dependency is the
   * same boolean the ticker above uses, so this runs once when throttling
   * begins and never again while the number counts down.
   */
  useEffect(() => {
    setAnnouncement(cooldown > 0 ? formatCooldown(cooldown) : "");
  }, [cooldown > 0]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const result = await verifyPin(pin);
    if (result.ok) {
      setPin("");
      setLocked(false);
      return;
    }
    setPin("");
    setError(result.error);
    if (!result.ok && typeof result.lockedUntil === "number") {
      setCooldown(remainingSeconds(result.lockedUntil, Date.now()));
    }
  }

  if (!locked) return null;

  const throttled = cooldown > 0;

  return (
    <div className="pin-overlay" role="dialog" aria-modal="true" aria-label={t("pin.gate.label")}>
      <div className="pin-box">
        <span className="pin-lock-icon" aria-hidden="true">
          <LockIcon size="1.4em" />
        </span>
        <h1>{t("pin.gate.title")}</h1>
        <p className="muted-note">{t("pin.gate.body")}</p>

        <form onSubmit={submit} className="pin-form">
          <input
            className="text-input pin-input"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            value={pin}
            maxLength={6}
            disabled={throttled}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            aria-label="PIN"
            placeholder="••••"
          />
          {error && <p className="pin-error">{error}</p>}
          <CooldownNotice cooldown={cooldown} announcement={announcement} />
          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={throttled || pin.length < 4}
          >
            {t("pin.gate.submit")}
          </button>
        </form>

        <p className="pin-forgot">
          {t("pin.gate.forgotBefore")} <strong>{t("pin.gate.forgotEmphasis")}</strong>{" "}
          {t("pin.gate.forgotAfter")}
        </p>
      </div>
    </div>
  );
}
