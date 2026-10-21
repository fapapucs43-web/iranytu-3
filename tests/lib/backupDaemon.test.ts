/**
 * Commit 6 — the backup scheduler: when the app is allowed to ask.
 *
 * WHAT THIS FILE IS FOR
 * A private journal does not get nagged because a timer fired. The scheduler
 * has exactly three reasons to speak and three to stay quiet, and the quiet ones
 * are the dangerous half: a device with backup switched off, a read-only visit
 * to the app, and the five minutes of quiet a burst of writing has to earn are
 * all cases where the easy implementation talks and a reader's trust in the
 * word "backed up" dies quietly.
 *
 * WHY EVERYTHING HERE IS A PLAIN FUNCTION
 * `shouldBackupNow` and `backupRound` are pure, and the hook in
 * `src/lib/backupDaemon.ts` is a handful of lines over them. That is not
 * minimalism for its own sake: it means the rules that decide whether to
 * interrupt somebody are called directly by these tests, with a clock the test
 * owns, instead of being reached through a mounted component and a faked
 * timer. No jsdom, no effects, no waiting.
 *
 * THE LIMIT IS PART OF THE SPEC, SO IT IS PART OF THE FILE
 * The scheduler can only run while the app is running, and a browser cannot
 * write a file without a gesture. Neither is a detail of the implementation —
 * it is the promise the card makes — so the card is checked for saying so, and
 * the module is checked for never calling a writer.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  BACKUP_DEBOUNCE_MS,
  BACKUP_DUE_NOTE,
  BACKUP_INTERVAL_MS,
  BACKUP_TICK_MS,
  backupRound,
  newBackupWatch,
  shouldBackupNow,
  type BackupWatch,
} from "../../src/lib/backupDaemon";
import type { BackupDeviceState } from "../../src/lib/backup";
import { t } from "../../src/lib/i18n";

const ROOT = new URL("../../", import.meta.url);
const DAEMON_SRC = readFileSync(new URL("src/lib/backupDaemon.ts", ROOT), "utf8");
const APP_SRC = readFileSync(new URL("src/App.tsx", ROOT), "utf8");
const CARD_SRC = readFileSync(new URL("src/components/BackupSettingsCard.tsx", ROOT), "utf8");

const NOW = 1_700_000_000_000;
const MINUTE = 60_000;

/** A device that has set backup up and saved at `savedAgo` ms ago. */
function device(savedAgo: number | null, over: Partial<BackupDeviceState> = {}): BackupDeviceState {
  return {
    v: 1,
    enabled: true,
    credentialId: "ab12",
    lastSavedAt: savedAgo === null ? null : NOW - savedAgo,
    saveCount: 3,
    ...over,
  };
}

/** A watch as the hook holds it: a pending change `changedAgo` ms old. */
function watching(changedAgo: number | null, over: Partial<BackupWatch> = {}): BackupWatch {
  return {
    seenSavedAt: NOW - 60_000,
    changedAt: changedAgo === null ? null : NOW - changedAgo,
    told: false,
    ...over,
  };
}

/* ============================ the trigger ============================== */

describe("when the app asks for a backup", () => {
  test("a device nobody set up is never asked", () => {
    // The most common case in the whole app: no state at all.
    expect(shouldBackupNow({ state: null, changedAt: null, now: NOW })).toEqual({
      action: "skip",
      reason: "disabled",
    });
  });

  test("a device that switched it off is never asked", () => {
    // Not just absent — present, valid, and explicitly off. This is what the
    // card's "kikapcsolás" leaves behind, and it must read exactly like an
    // absent device, or turning backup off would only half work.
    expect(
      shouldBackupNow({ state: device(MINUTE, { enabled: false }), changedAt: null, now: NOW }),
    ).toEqual({ action: "skip", reason: "disabled" });
  });

  test("an enabled device that changed nothing is not asked on open", () => {
    expect(
      shouldBackupNow({ state: device(MINUTE), changedAt: null, now: NOW }),
    ).toEqual({ action: "skip", reason: "clean" });
  });

  test("enrolled but never written is asked at once, with nothing changed", () => {
    // Reached when the card's first write was cancelled or the file vanished
    // behind the app's back. The promise is unmade, so waiting for a change
    // would leave it unmade forever on a read-only device.
    expect(shouldBackupNow({ state: device(null), changedAt: null, now: NOW })).toEqual({
      action: "ask",
      reason: "never-saved",
    });
  });
});

/* ============================== staleness ============================== */

describe("the daily promise", () => {
  test("a file a day old is asked about with no store write at all", () => {
    // The trigger that has to survive a session where the user only LOOKED:
    // nobody wrote anything, and the file is still a day behind.
    expect(
      shouldBackupNow({ state: device(BACKUP_INTERVAL_MS), changedAt: null, now: NOW }),
    ).toEqual({ action: "ask", reason: "stale" });
  });

  test("a file older than a day is asked about too", () => {
    expect(
      shouldBackupNow({ state: device(BACKUP_INTERVAL_MS + 60 * MINUTE), changedAt: null, now: NOW }),
    ).toEqual({ action: "ask", reason: "stale" });
  });

  test("one millisecond short of a day is not stale", () => {
    // The boundary is where an off-by-one would hide, and it is the branch
    // that keeps the app from asking on every open for a file saved last night.
    expect(
      shouldBackupNow({ state: device(BACKUP_INTERVAL_MS - 1), changedAt: null, now: NOW }),
    ).toEqual({ action: "skip", reason: "clean" });
  });

  test("a settled change on a fresh file asks as a change, not as staleness", () => {
    // The two triggers stay distinguishable. Merged, a change could quietly
    // move the day-old promise earlier, and the promise the card makes in
    // words would no longer be the one the code keeps.
    expect(
      shouldBackupNow({ state: device(MINUTE), changedAt: NOW - 60 * MINUTE, now: NOW }),
    ).toEqual({ action: "ask", reason: "changed" });
  });
});

/* ============================== debounce =============================== */

describe("the five minutes of quiet", () => {
  test("a change one minute old is still inside the window", () => {
    expect(
      shouldBackupNow({ state: device(MINUTE), changedAt: NOW - MINUTE, now: NOW }),
    ).toEqual({ action: "skip", reason: "debouncing" });
  });

  test("a change exactly five minutes old has earned the question", () => {
    // `< debounce`, not `<=`: at the boundary the burst is over, and an
    // implementation that waits one more tick would say five minutes and mean six.
    expect(
      shouldBackupNow({ state: device(MINUTE), changedAt: NOW - BACKUP_DEBOUNCE_MS, now: NOW }),
    ).toEqual({ action: "ask", reason: "changed" });
  });

  test("a burst of writes is silent until the window closes, and then speaks once", () => {
    // Four entries across a lunch break. Every check inside the window is
    // silent; the first check after it is the one that speaks — and the one
    // after THAT says nothing again, which is the latch, not a second finding.
    const state = device(MINUTE);
    const reasons: string[] = [];
    let watch = watching(null);
    let asks = 0;
    for (const offset of [0, MINUTE, 3 * MINUTE, 4 * MINUTE, 5 * MINUTE, 11 * MINUTE]) {
      const decision = shouldBackupNow({ state, changedAt: NOW - offset, now: NOW });
      reasons.push(decision.reason);
      const round = backupRound({ ...watch, changedAt: NOW - offset }, state, NOW);
      watch = round.watch;
      if (round.ask) asks += 1;
    }
    expect(reasons).toEqual([
      "debouncing",
      "debouncing",
      "debouncing",
      "debouncing",
      "changed",
      "changed",
    ]);
    expect(asks).toBe(1);
  });

  test("the window and the tick are the numbers the plan promises", () => {
    // 5 minutes and 1 minute: the debounce is five ticks long, so the ask can
    // never land more than a minute after the promise says it should.
    expect(BACKUP_DEBOUNCE_MS).toBe(5 * MINUTE);
    expect(BACKUP_TICK_MS).toBe(MINUTE);
    expect(BACKUP_INTERVAL_MS).toBe(24 * 60 * MINUTE);
  });
});

/* ============================ the whole round =========================== */

describe("one round of the scheduler", () => {
  test("a disabled device never asks, however long the session runs", () => {
    // The whole round, not one call: the loop that could leak an ask is the
    // one that survives many ticks, so the sweep is over times and not just a
    // pair of them.
    const state = device(MINUTE, { enabled: false });
    let watch = newBackupWatch();
    let asks = 0;
    for (let minute = 0; minute < 30; minute++) {
      watch = { ...watch, changedAt: NOW - minute * MINUTE };
      const round = backupRound(watch, state, NOW + minute * MINUTE);
      watch = round.watch;
      if (round.ask) asks += 1;
    }
    expect(asks).toBe(0);
    // Nothing was recorded that could become a question later: a disabled
    // device leaves the file's stamp and an unspoken reminder, and nothing
    // the session in which the user finally switches it on can inherit.
    expect(watch.told).toBe(false);
  });

  test("an absent state is as quiet as a switched-off one", () => {
    const round = backupRound(watching(MINUTE), null, NOW);
    expect(round.ask).toBe(false);
  });

  test("the user is asked once per session, not once per minute", () => {
    const state = device(MINUTE);
    let watch = watching(MINUTE);
    let asks = 0;
    for (let tick = 0; tick < 10; tick++) {
      const round = backupRound(watch, state, NOW + tick * MINUTE);
      watch = round.watch;
      if (round.ask) asks += 1;
    }
    expect(asks).toBe(1);
    expect(watch.told).toBe(true);
  });

  test("a new change after the ask does not start another one", () => {
    // One ask per session is the promise. A writer who keeps going after the
    // app spoke stays quiet until the file moves.
    const state = device(MINUTE);
    const first = backupRound(watching(10 * MINUTE), state, NOW);
    expect(first.ask).toBe(true);
    const second = backupRound({ ...first.watch, changedAt: NOW }, state, NOW + 10 * MINUTE);
    expect(second.ask).toBe(false);
  });

  test("a save clears the pending change and earns the next question", () => {
    // The card wrote the stamp, not this module, so a stamp that moved is the
    // signal: what the scheduler was holding is inside the file now.
    const state = device(MINUTE);
    const before = backupRound(watching(60 * MINUTE), state, NOW);
    expect(before.ask).toBe(true);

    const saved = device(0); // the card just wrote it
    const afterSave = backupRound(before.watch, saved, NOW + MINUTE);
    expect(afterSave.ask).toBe(false); // clean, and already told
    expect(afterSave.watch).toEqual({ seenSavedAt: saved.lastSavedAt, changedAt: null, told: false });

    // The next burst of writing gets its own question.
    const later = backupRound(
      { ...afterSave.watch, changedAt: NOW + MINUTE },
      saved,
      NOW + 10 * MINUTE,
    );
    expect(later.ask).toBe(true);
    expect(later.watch.told).toBe(true);
  });

  test("an unchanged round hands back the very same watch", () => {
    // Nothing happened, so the round must not manufacture a new object: the
    // hook stores this on every tick, and a fresh object per minute would make
    // "did anything change" impossible to read.
    const watch = watching(MINUTE, { told: true });
    const round = backupRound(watch, device(MINUTE), NOW);
    expect(round.watch).toBe(watch);
  });

  test("a stale file is caught on open with no write at all", () => {
    // The app-open path the plan asks for, as a round rather than a call: an
    // untouched session, a day-old file, and the app says so once.
    const round = backupRound(newBackupWatch(), device(BACKUP_INTERVAL_MS + MINUTE), NOW);
    expect(round.ask).toBe(true);
    expect(round.watch).toEqual({
      seenSavedAt: NOW - BACKUP_INTERVAL_MS - MINUTE,
      changedAt: null,
      told: true,
    });
  });

  test("switching the device off and on again forgets the old question", () => {
    // The stamp goes away with the state, so a device that was switched off
    // and set up again does not inherit an already-answered ask.
    const enabled = watching(MINUTE);
    const off = backupRound(enabled, device(MINUTE, { enabled: false }), NOW);
    const back = backupRound(off.watch, device(30 * MINUTE), NOW + MINUTE);
    expect(back.watch.seenSavedAt).toBe(NOW - 30 * MINUTE);
    expect(back.ask).toBe(false); // nothing changed since it was set up again
  });

  test("the test-only overrides reach both layers", () => {
    // The interval is a day, which is untestable in real time; the option has
    // to reach the round, not stop at the decision.
    const round = backupRound(newBackupWatch(), device(MINUTE), NOW, { intervalMs: 1 });
    expect(round.ask).toBe(true);
    const waiting = backupRound(watching(MINUTE), device(MINUTE), NOW, { debounceMs: 10 * MINUTE });
    expect(waiting.ask).toBe(false);
  });
});

/* ============================== the wiring ============================== */

describe("the scheduler is actually mounted, and it can only ask", () => {
  test("the app shell runs it", () => {
    expect(APP_SRC).toContain("import { BACKUP_DUE_NOTE, useBackupScheduler } from \"./lib/backupDaemon\"");
    expect(APP_SRC).toContain("useBackupScheduler(() => notify(BACKUP_DUE_NOTE, \"warn\"))");
  });

  test("it is mounted once, beside the other two schedulers", () => {
    // Three schedulers, three mount sites. A second call would double every
    // toast and double every interval.
    expect(APP_SRC.match(/<ReminderScheduler \/>/g)).toHaveLength(1);
    expect(APP_SRC.match(/useBackupScheduler\(/g)).toHaveLength(1);
  });

  test("the hook asks; it never writes a file", () => {
    // The promise in the docblock above is only worth anything if this holds.
    // A scheduler that quietly called a writer would be the worst possible
    // outcome: a user told their journal is safe, and a file that is not there.
    expect(DAEMON_SRC).not.toContain("saveBackupNow");
    expect(DAEMON_SRC).not.toContain("writePreparedBackup");
    expect(DAEMON_SRC).not.toContain("saveBackupText");
    expect(DAEMON_SRC).not.toContain("collectBackupBundle");
    expect(DAEMON_SRC).not.toContain("fetch(");
  });

  test("it cleans up both its timer and its store subscription", () => {
    // A listener left behind outlives the app shell and keeps the watch alive.
    const cleanup = DAEMON_SRC.slice(DAEMON_SRC.indexOf("const unsubscribe"));
    expect(cleanup).toContain("window.clearInterval(timer)");
    expect(cleanup).toContain("unsubscribe()");
  });

  test("it reads the two things that can change under it", () => {
    expect(DAEMON_SRC).toContain("loadBackupState()");
    expect(DAEMON_SRC).toContain("subscribe(");
    // And it checks on open, not only on the first tick: a device that was
    // closed for a week must hear about a stale file the moment it is opened.
    const body = DAEMON_SRC.slice(DAEMON_SRC.indexOf("// APP OPEN"));
    expect(body).toContain("check();");
  });

  test("the note names the card the user has to open", () => {
    expect(BACKUP_DUE_NOTE).toContain("Titkosított felhőmentés");
    expect(APP_SRC).toContain("BACKUP_DUE_NOTE");
  });
});

describe("the limit is stated where the promise is made", () => {
  test("the card says the backup only happens while the app is open", () => {
    // The medication reminders made the same promise and were honest about it.
    // A backup card that implies a background daemon would be the more
    // expensive lie, because the user's file is the only copy they have.
    const view = CARD_SRC.slice(
      CARD_SRC.indexOf("export function BackupActiveView"),
      CARD_SRC.indexOf("export function BackupErrorView"),
    );
    expect(view).toContain('{t("backup.runningNote")}');
    expect(view).toContain('{t("backup.touchNote")}');
    // The words moved into the catalogue with the constants; the promise they
    // make is the assertion, so it is checked where it now lives rather than
    // dropped along with the old identifiers.
    expect(t("backup.runningNote")).toContain("Háttérben nem futunk");
    expect(t("backup.touchNote")).toContain("nem tud kattintás nélkül fájlt írni");
  });

  test("the module says the same thing in the code comment", () => {
    // The two are separate promises: one made to the reader, one made to the
    // next person to edit this file.
    expect(DAEMON_SRC).toContain("no background");
    expect(DAEMON_SRC).toContain("user activation");
  });
});
