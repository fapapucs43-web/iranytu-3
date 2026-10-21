/**
 * When the app should ask for a backup (Commit 6).
 *
 * The shape is `lib/reminderDaemon`: the question is a pure function and
 * everything stateful is a handful of hook lines. Two pure functions here, and
 * the hook over them is short enough to read in one go — which is deliberate.
 * The rule that decides whether a private journal gets nagged about is the kind
 * of rule that has to be readable, not the kind that has to be mocked.
 *
 * THE LIMIT, STATED HONESTLY, IN THE UI AND HERE
 * Nothing in here runs when the app is closed: there is no background
 * execution of any kind, exactly as with the medication reminders, and the
 * card says so rather than implying a daemon this app does not have. There is
 * no server behind it, either. And there is a second, harder limit: a
 * browser cannot write a file to the user's cloud drive without a gesture,
 * because both the file picker and a WebAuthn assertion require
 * user activation. So this module NEVER writes a backup. It decides, it
 * says so once, and the save happens when the user presses the button in
 * the settings card. A scheduler that silently failed would be worse than
 * none: the user would believe their journal was safe when the last file
 * was a week old.
 *
 * WHY THE CHECKS ARE ORDERED THE WAY THEY ARE
 * Three reasons to speak, three to stay quiet, and the order is the design:
 *   1. not set up            -> say nothing at all (a disabled device that
 *                               nags about a backup it cannot make is noise)
 *   2. never written         -> ask, immediately, even with nothing changed
 *   3. older than a day      -> ask, on open, with no change needed: this is
 *                               the daily promise, and it cannot depend on a
 *                               store write that may happen tomorrow
 *   4. nothing changed       -> say nothing
 *   5. changed, still inside
 *      the debounce window   -> say nothing (see below)
 *   6. changed, quiet for
 *      five minutes          -> ask
 */
import { useEffect, useRef } from "react";
import { loadBackupState, type BackupDeviceState } from "./backup";
import { subscribe } from "./store";
import { t } from "./i18n";

/** How often the scheduler looks. Each look is two field reads and a compare. */
export const BACKUP_TICK_MS = 60_000;

/**
 * Quiet time after a store write before the app says anything about it.
 *
 * A journal gets written in bursts — four entries across a lunch break — and a
 * scheduler without this would ask after the first one and interrupt the third.
 */
export const BACKUP_DEBOUNCE_MS = 5 * 60_000;

/** How old a file may get before the app asks for a fresh one anyway. */
export const BACKUP_INTERVAL_MS = 24 * 60 * 60_000;

/**
 * What the app says when it decides the file is behind the journal.
 *
 * Round 18 moved the sentence into the catalogue. It is a DISPLAY string only —
 * nothing stores it and nothing matches on it — so unlike the reminder messages
 * round 17 keyed, a language switch cannot rewrite anything a reader wrote.
 * The path inside it ("Beállítások → …") is a UI path, not storage data.
 */
export const BACKUP_DUE_NOTE = t("backup.dueNote");

/** Why it is asking, so the tests and the code comment agree on the reasons. */
export type BackupDecision =
  | { action: "ask"; reason: "never-saved" | "stale" | "changed" }
  | { action: "skip"; reason: "disabled" | "clean" | "debouncing" };

export type BackupCheck = {
  /** what this device last did, or null when nothing is set up */
  state: BackupDeviceState | null;
  /** ms of the newest store write not yet in a file; null when nothing changed */
  changedAt: number | null;
  now: number;
  /** overridable so the tests do not have to wait a day for a stale file */
  intervalMs?: number;
  debounceMs?: number;
};

/** The scheduler's own memory, kept in a ref and never in storage. */
export type BackupWatch = {
  /** the file's stamp at the last look; a stamp that moved means a save */
  seenSavedAt: number | null;
  /** ms of the newest store write, or null when there is nothing pending */
  changedAt: number | null;
  /** the user has already been asked this session; one ask, not a stream */
  told: boolean;
};

/** The scheduler's memory as it starts, and as it comes back after a round. */
export function newBackupWatch(): BackupWatch {
  return { seenSavedAt: null, changedAt: null, told: false };
}

/**
 * One question, no side effects, no storage — the whole of the trigger.
 *
 * `changedAt` is passed in rather than read here so that the decision can be
 * asked about any moment in any session: a file that went stale overnight must
 * be caught on open, when there is nothing pending to wait for.
 */
export function shouldBackupNow(check: BackupCheck): BackupDecision {
  const { state, changedAt, now } = check;
  // An absent state and a switched-off one are the same answer, and both are
  // the answer this function gives most often: a device nobody asked to back up.
  if (!state || !state.enabled) return { action: "skip", reason: "disabled" };
  // Enrolled but never written. The card writes its first file during setup,
  // so reaching here means that write was cancelled or the file went missing
  // behind the app's back — either way the promise is unmade.
  if (state.lastSavedAt === null) return { action: "ask", reason: "never-saved" };
  // The daily promise, deliberately checked BEFORE the change gate: it is the
  // one trigger that must survive a session in which the user only looked.
  const interval = check.intervalMs ?? BACKUP_INTERVAL_MS;
  if (now - state.lastSavedAt >= interval) return { action: "ask", reason: "stale" };
  // A fresh file and no write since: nothing has happened, so there is nothing
  // to say. This is the branch that keeps a read-only visit silent.
  if (changedAt === null) return { action: "skip", reason: "clean" };
  const debounce = check.debounceMs ?? BACKUP_DEBOUNCE_MS;
  // `< debounce` and not `<=`: five minutes of quiet means the burst is over.
  if (now - changedAt < debounce) return { action: "skip", reason: "debouncing" };
  return { action: "ask", reason: "changed" };
}

/**
 * Fold the device state into what the scheduler remembers.
 *
 * The card writes `lastSavedAt`, not this module, so a stamp that moved is the
 * only trustworthy signal that the pending change is now inside the file. Both
 * memories clear together: the change is saved, and the user has earned the
 * right to be asked again.
 */
function foldSavedFile(watch: BackupWatch, state: BackupDeviceState | null): BackupWatch {
  const seen = state?.lastSavedAt ?? null;
  if (seen === watch.seenSavedAt) return watch;
  return { seenSavedAt: seen, changedAt: null, told: false };
}

export type BackupRound = {
  /** what the next round starts from */
  watch: BackupWatch;
  /** true exactly when the caller should tell the user */
  ask: boolean;
};

/**
 * One whole round of the scheduler, as a pure function.
 *
 * This is what the hook runs, so everything that decides anything lives here
 * and can be tested by calling it: the disabled device that never asks, the
 * single ask per session, the stamp that clears a pending change, and the
 * five minutes of quiet a burst of writing has to earn.
 */
export function backupRound(
  watch: BackupWatch,
  state: BackupDeviceState | null,
  now: number,
  opts: Pick<BackupCheck, "intervalMs" | "debounceMs"> = {},
): BackupRound {
  const folded = foldSavedFile(watch, state);
  const decision = shouldBackupNow({ state, changedAt: folded.changedAt, now, ...opts });
  if (decision.action !== "ask" || folded.told) return { watch: folded, ask: false };
  return { watch: { ...folded, told: true }, ask: true };
}

/**
 * The scheduler, mounted once by the app shell (Commit 6). Renders nothing and
 * writes nothing.
 *
 * Checks on app open, then once a minute — the minute is only a way to notice
 * that a burst of writing has gone quiet, because the debounce needs somebody
 * to look when it elapses. A tab that sleeps until tomorrow is exactly why the
 * promise this module keeps is "the app will notice", never "the app will do
 * it without you".
 */
export function useBackupScheduler(onDue: () => void): void {
  const askRef = useRef(onDue);
  const watchRef = useRef<BackupWatch>(newBackupWatch());

  // The caller's identity is a fresh arrow on every render of the shell, and a
  // timer torn down and rebuilt on every render would never fire. Held in a ref
  // instead, refreshed here and declared FIRST so the mount check below already
  // calls the function this render passed.
  useEffect(() => {
    askRef.current = onDue;
  }, [onDue]);

  useEffect(() => {
    const check = () => {
      const round = backupRound(watchRef.current, loadBackupState(), Date.now());
      watchRef.current = round.watch;
      if (round.ask) askRef.current();
    };

    // APP OPEN, before the first tick.
    check();

    const timer = window.setInterval(check, BACKUP_TICK_MS);
    // The store is the only thing that can tell this module something changed.
    // Its unsubscribe handle is what the cleanup below hands back, because a
    // listener left behind would keep the whole watch alive after unmount.
    const unsubscribe = subscribe(() => {
      watchRef.current = { ...watchRef.current, changedAt: Date.now() };
    });
    return () => {
      window.clearInterval(timer);
      unsubscribe();
    };
  }, []);
}
