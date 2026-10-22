/**
 * The orchestration's tests: the scope is exactly the nineteen keys, a
 * restore puts each of them back through the door its owner accepts, rotation
 * is a proof before it is a new file, and the device state is mundane by
 * design.
 *
 * The store is a singleton across this whole test run and Bun has no
 * localStorage, so every test starts from `resetAll()` with an empty backing
 * map and leaves it that way — the same storage double
 * tests/lib/store-import-repair.test.ts installs, for the same reason: the
 * store reads localStorage when it is first evaluated.
 */
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import {
  BACKUP_BUNDLE_APP,
  BACKUP_BUNDLE_VERSION,
  BACKUP_EXCLUDED_KEYS,
  BACKUP_INCLUDED_KEYS,
  BACKUP_STATE_KEY,
  collectBackupBundle,
  forgetBackupState,
  loadBackupState,
  restoreBackupBundle,
  rotateBackup,
  saveBackupState,
} from "../../src/lib/backup";
import { getState, resetAll, saveEntry } from "../../src/lib/store";
import { t } from "../../src/lib/i18n";
import {
  addAssessment,
  listAssessments,
  resetForTests as resetAssessments,
  STORAGE_KEY as ASSESSMENTS_KEY,
} from "../../src/lib/assessmentStore";
import { ITEM_COUNT } from "../../src/lib/assessments";
import { LOCK_KEY } from "../../src/lib/appLock";
import { CARD_STATES_KEY } from "../../src/lib/cardStates";
import { FIRED_KEY } from "../../src/lib/medReminders";
import { createBackupFile, readBackupFile } from "../../src/lib/backupStorage";
import {
  deriveKeyFromPasskey,
  deriveKeyFromRecovery,
  generateRecoveryEntropy,
} from "../../src/lib/backupCrypto";
import { PASSKEY_INFO } from "../../src/lib/backupKey";

/* --------------------------- the storage double ------------------------ */

const backing: Record<string, string> = {};
const withStorage = globalThis as unknown as { localStorage?: unknown };
withStorage.localStorage = {
  getItem: (k: string) => (k in backing ? backing[k] : null),
  setItem: (k: string, v: string) => {
    backing[k] = v;
  },
  removeItem: (k: string) => {
    delete backing[k];
  },
};

function clearStorage(): void {
  for (const key of Object.keys(backing)) delete backing[key];
}

beforeEach(() => {
  clearStorage();
  resetAll();
  resetAssessments();
});

afterAll(() => {
  resetAll();
  resetAssessments();
  forgetBackupState();
  clearStorage();
  // Put the environment back the way the rest of the run found it.
  delete withStorage.localStorage;
});

/* ------------------------------- fixtures ------------------------------ */

const NOW = 1_700_000_000_000;
const SALT = new Uint8Array(32).fill(0x33);
const RECOVERY_INFO = "iranytu-backup/recovery/v1";

/**
 * The four keys this batch moved onto the included side: the food log and the
 * reader's own foods, the training plans and log, and the chosen diet. They
 * are not exported by their owners, so they are named here the same way the
 * older, unexported members of the list are.
 */
const FOOD_TRAINING_KEYS = [
  "belso-iranytu-nutrition-log-v1",
  "belso-iranytu-custom-foods-v1",
  "belso-iranytu-fitness-v1",
  "belso-iranytu-diet-v1",
] as const;

function bundleText(keys: Record<string, string>, now = NOW): string {
  return JSON.stringify({ v: BACKUP_BUNDLE_VERSION, app: BACKUP_BUNDLE_APP, exportedAt: now, keys });
}

function dataV2(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    version: 2,
    entries: [],
    goals: [],
    dailyQuestion: null,
    medications: [],
    medicationChecks: {},
    profile: { name: "", goal: "" },
    settings: {},
    ...over,
  });
}

/** A real stored log, written by the module that owns the format. */
function storedAssessmentLog(): string {
  const record = addAssessment({ date: "2026-09-01", answers: new Array(ITEM_COUNT).fill(0) });
  if (!record) throw new Error("the assessment fixture was refused");
  const raw = backing[ASSESSMENTS_KEY];
  if (typeof raw !== "string") throw new Error("the assessment fixture did not persist");
  return raw;
}

async function passkeyKek(prf = new Uint8Array(32).fill(9)): Promise<CryptoKey> {
  const key = await deriveKeyFromPasskey(prf, SALT, PASSKEY_INFO);
  if (!key) throw new Error("the passkey derivation refused fixed inputs");
  return key;
}

async function recoveryKek(): Promise<CryptoKey> {
  const key = await deriveKeyFromRecovery(generateRecoveryEntropy(), SALT, RECOVERY_INFO);
  if (!key) throw new Error("the recovery derivation refused fresh entropy");
  return key;
}

describe("the scope", () => {
  test("the nineteen included keys are pinned, in order", () => {
    expect([...BACKUP_INCLUDED_KEYS]).toEqual([
      "belso-iranytu-data-v2",
      "belso-iranytu-emotion-vocab",
      "belso-iranytu-custom-trackers",
      "belso-iranytu-custom-activities",
      "belso-iranytu-assessments-v1",
      "belso-iranytu-experiments-v1",
      "belso-iranytu-habits-v1",
      "belso-iranytu-gratitude",
      "belso-iranytu-cbt-records",
      "belso-iranytu-onboarding",
      "belso-iranytu-feature-flags-v1",
      "belso-iranytu-achievements-seen",
      "belso-iranytu-seen-lessons",
      "belso-iranytu-reminder-message",
      "belso-iranytu-nutrition-log-v1",
      "belso-iranytu-custom-foods-v1",
      "belso-iranytu-fitness-v1",
      "belso-iranytu-diet-v1",
      // Phase 5's support wall — the nineteenth, and the reason the name
      // above changed: it is the reader's own writing, which is the rule
      // this side of the line exists to protect.
      "belso-iranytu-support-wall",
    ]);
  });

  test("the food, food-name, training and diet keys travel, named one by one", () => {
    // The completeness rule for this batch: every key a reader's own data
    // lives in is on the included side by name. Remove one from
    // BACKUP_INCLUDED_KEYS and this test names it — the same mutation the
    // pinned list above catches, restated as a property rather than a count.
    const included: readonly string[] = BACKUP_INCLUDED_KEYS;
    const excluded: readonly string[] = BACKUP_EXCLUDED_KEYS;
    for (const key of FOOD_TRAINING_KEYS) {
      expect(included, `${key} does not travel in a backup`).toContain(key);
      expect(excluded, `${key} is named as an exclusion`).not.toContain(key);
    }
  });

  test("the nine named exclusions are pinned", () => {
    expect([...BACKUP_EXCLUDED_KEYS]).toEqual([
      "belso-iranytu-attachments",
      "belso-iranytu-background",
      "belso-iranytu:openai-key",
      "belso-iranytu-app-lock",
      "belso-iranytu-app-lock-session",
      "belso-iranytu:cardStates",
      "belso-iranytu-med-reminders-fired",
      "belso-iranytu-reminder-last",
      "belso-iranytu-install-banner-dismissed",
    ]);
  });

  test("the exported key constants land on the right side of the line", () => {
    expect(BACKUP_INCLUDED_KEYS as readonly string[]).toContain(ASSESSMENTS_KEY);
    expect(BACKUP_EXCLUDED_KEYS as readonly string[]).toContain(LOCK_KEY);
    expect(BACKUP_EXCLUDED_KEYS as readonly string[]).toContain(CARD_STATES_KEY);
    expect(BACKUP_EXCLUDED_KEYS as readonly string[]).toContain(FIRED_KEY);
  });

  test("the lists are disjoint, namespaced, and never contain the state key", () => {
    const included: readonly string[] = BACKUP_INCLUDED_KEYS;
    const excluded: readonly string[] = BACKUP_EXCLUDED_KEYS;
    expect(included.filter((key) => excluded.includes(key))).toEqual([]);
    for (const key of [...included, ...excluded]) expect(key.startsWith("belso-iranytu")).toBe(true);
    expect(included).not.toContain(BACKUP_STATE_KEY);
  });

  test("the scope note is the sentence the card shows", () => {
    // It used to be `BACKUP_SCOPE_NOTE` exported from this module. It is
    // `backup.scopeNote` in the catalogue now, because this card was its only
    // reader — but the assertion is unchanged: the words are the contract, not
    // the constant that once held them.
    expect(t("backup.scopeNote")).toBe(
      "A csatolmányok, a háttérkép, a megadott API-kulcs, a képernyőzár, a kártyaelrendezés és az értesítési nyomok nem kerülnek a mentésbe. Azok az eszközön maradnak.",
    );
  });
});

describe("collecting", () => {
  test("only the included keys travel, raw, in the list's order, and nothing else", () => {
    backing["belso-iranytu-data-v2"] = dataV2();
    backing["belso-iranytu-habits-v1"] = '{"h":true}';
    backing["belso-iranytu-achievements-seen"] = '["b1"]';
    backing["belso-iranytu-background"] = "NAGY_BLOB";
    backing["belso-iranytu:openai-key"] = "sk-titkos";
    backing[BACKUP_STATE_KEY] = JSON.stringify({ v: 1, enabled: true, credentialId: null, lastSavedAt: null });
    backing["daily-goals"] = "v1 maradék";
    const bundle = JSON.parse(collectBackupBundle(NOW)) as { keys: Record<string, string> };
    expect(Object.keys(bundle.keys)).toEqual([
      "belso-iranytu-data-v2",
      "belso-iranytu-habits-v1",
      "belso-iranytu-achievements-seen",
    ]);
    expect(bundle.keys["belso-iranytu-habits-v1"]).toBe('{"h":true}');
    expect(bundle.keys["belso-iranytu-background"]).toBeUndefined();
    expect(bundle.keys["belso-iranytu:openai-key"]).toBeUndefined();
    expect(bundle.keys[BACKUP_STATE_KEY]).toBeUndefined();
    expect(bundle.keys["daily-goals"]).toBeUndefined();
  });

  test("the header is the bundle format", () => {
    const bundle = JSON.parse(collectBackupBundle(123)) as Record<string, unknown>;
    expect(bundle.v).toBe(BACKUP_BUNDLE_VERSION);
    expect(bundle.app).toBe(BACKUP_BUNDLE_APP);
    expect(bundle.exportedAt).toBe(123);
  });

  test("a device that has never written still yields a valid, empty bundle", () => {
    // `resetAll()` above is itself a write; a truly fresh device has no keys
    // at all, because the store only writes once something changes.
    clearStorage();
    const bundle = JSON.parse(collectBackupBundle(NOW)) as Record<string, unknown>;
    expect(bundle.keys).toEqual({});
    expect(restoreBackupBundle(JSON.stringify(bundle))).toEqual({
      entriesImported: 0,
      assessmentsImported: 0,
      keysRestored: 0,
      skipped: [],
    });
  });
});

describe("the restore", () => {
  test("entries merge: a shared day takes the file's version, a local day it never knew survives", () => {
    saveEntry({ date: "2026-09-01", mood: 2, note: "helyi" });
    saveEntry({ date: "2026-09-02", mood: 3, note: "csak helyi" });
    const report = restoreBackupBundle(
      bundleText({
        "belso-iranytu-data-v2": dataV2({
          entries: [
            { date: "2026-09-01", mood: 5, note: "fájlból" },
            { date: "2026-09-03", mood: 4, note: "új nap" },
          ],
        }),
      }),
    )!;
    expect(report.entriesImported).toBe(2);
    const byDate = new Map(getState().entries.map((e) => [e.date, e]));
    expect(byDate.get("2026-09-01")!.note).toBe("fájlból");
    expect(byDate.get("2026-09-01")!.mood).toBe(5);
    expect(byDate.get("2026-09-02")!.note).toBe("csak helyi");
    expect(byDate.get("2026-09-03")!.mood).toBe(4);
  });

  test("the store's singular fields come back through the store's own setters", () => {
    const report = restoreBackupBundle(
      bundleText({
        "belso-iranytu-data-v2": dataV2({
          profile: { name: "Anna", goal: "nyugalom" },
          settings: { textSize: "xlarge" },
          goals: [{ id: "g1", text: "séta", done: false, date: "2026-09-01" }],
          medications: [{ id: "m1", name: "A", dose: "1", times: ["08:00"] }],
          medicationChecks: { "2026-09-01": { m1: true } },
          dailyQuestion: { date: "2026-09-01", question: "Mi esett jól?", answer: "a séta" },
        }),
      }),
    )!;
    expect(report.skipped).toEqual([]);
    const state = getState();
    expect(state.profile).toEqual({ name: "Anna", goal: "nyugalom" });
    expect(state.settings.textSize).toBe("xlarge");
    expect(state.goals).toHaveLength(1);
    expect(state.medications[0]!.name).toBe("A");
    expect(state.medicationChecks["2026-09-01"]!.m1).toBe(true);
    expect(state.dailyQuestion?.answer).toBe("a séta");
  });

  test("the assessment log is carried across a wipe, and re-restoring does not duplicate it", () => {
    const stored = storedAssessmentLog();
    resetAssessments();
    expect(listAssessments()).toHaveLength(0);
    const report = restoreBackupBundle(bundleText({ [ASSESSMENTS_KEY]: stored }))!;
    expect(report.assessmentsImported).toBe(1);
    expect(listAssessments()).toHaveLength(1);
    const second = restoreBackupBundle(bundleText({ [ASSESSMENTS_KEY]: stored }))!;
    expect(second.assessmentsImported).toBe(1);
    expect(listAssessments()).toHaveLength(1); // id-keyed, so nothing duplicated
  });

  test("raw keys replace, and only the ones the file carries", () => {
    backing["belso-iranytu-habits-v1"] = "régi";
    backing["belso-iranytu-gratitude"] = "helyi";
    const report = restoreBackupBundle(bundleText({ "belso-iranytu-habits-v1": "fájlból" }))!;
    expect(report.keysRestored).toBe(1);
    expect(backing["belso-iranytu-habits-v1"]).toBe("fájlból");
    expect(backing["belso-iranytu-gratitude"]).toBe("helyi");
  });

  test("a crafted file cannot smuggle a write past the allow-list", () => {
    backing["belso-iranytu-background"] = "helyi háttér";
    const report = restoreBackupBundle(
      bundleText({
        "belso-iranytu-background": "csapda",
        "belso-iranytu-future-v9": "ismeretlen",
        "belso-iranytu-habits-v1": "ok",
      }),
    )!;
    expect(report.keysRestored).toBe(1);
    expect(report.skipped).toEqual([]);
    expect(backing["belso-iranytu-background"]).toBe("helyi háttér");
    expect(backing["belso-iranytu-future-v9"]).toBeUndefined();
    expect(backing["belso-iranytu-habits-v1"]).toBe("ok");
  });

  test("an unusable value is named in the report, and the rest still restores", () => {
    const report = restoreBackupBundle(
      bundleText({
        "belso-iranytu-data-v2": "nem json",
        [ASSESSMENTS_KEY]: "[1,2]",
        "belso-iranytu-habits-v1": "ok",
      }),
    )!;
    expect(report.skipped).toEqual(["belso-iranytu-data-v2", ASSESSMENTS_KEY]);
    expect(report.entriesImported).toBe(0);
    expect(report.assessmentsImported).toBe(0);
    expect(report.keysRestored).toBe(1);
    expect(backing["belso-iranytu-habits-v1"]).toBe("ok");
  });

  test("text that is not this format is refused, and nothing half-applied", () => {
    const valid = JSON.parse(bundleText({ "belso-iranytu-habits-v1": "ok" })) as Record<string, unknown>;
    const cases: unknown[] = [
      null,
      42,
      "",
      "nem json",
      "[]",
      "null",
      { ...valid, v: 2 },
      { ...valid, app: "mas-app" },
      { ...valid, exportedAt: "ma" },
      { ...valid, keys: { "belso-iranytu-habits-v1": 7 } },
    ];
    for (const value of cases) {
      const text = typeof value === "string" ? value : JSON.stringify(value);
      expect(restoreBackupBundle(text)).toBeNull();
    }
    expect(backing["belso-iranytu-habits-v1"]).toBeUndefined();
  });

  test("the food, food-name, training and diet halves come back on a restore", () => {
    // The defect this batch fixes, end to end: the four logs travel and a
    // restore writes each of them back, verbatim and through no special door.
    backing["belso-iranytu-nutrition-log-v1"] =
      '{"2026-09-01":{"breakfast":[{"id":"m1","foodId":"oats","servings":1}]}}';
    backing["belso-iranytu-custom-foods-v1"] = '[{"id":"c1","name":"Anyu levese","addedAt":1}]';
    backing["belso-iranytu-fitness-v1"] =
      '{"plans":[],"log":[{"id":"w1","date":"2026-09-01","name":"Napköszöntő","exercises":[]}]}';
    backing["belso-iranytu-diet-v1"] = "mediterranean";
    const text = collectBackupBundle(NOW);
    const bundle = JSON.parse(text) as { keys: Record<string, string> };
    for (const key of FOOD_TRAINING_KEYS) expect(bundle.keys[key]).toBe(backing[key]);
    clearStorage();
    resetAll();
    resetAssessments();
    const report = restoreBackupBundle(text)!;
    expect(report.skipped).toEqual([]);
    expect(report.keysRestored).toBe(FOOD_TRAINING_KEYS.length);
    for (const key of FOOD_TRAINING_KEYS) expect(backing[key]).toBe(bundle.keys[key]);
  });

  test("a full circle: collect from a stuffed device, wipe, restore, same content", () => {
    backing["belso-iranytu-habits-v1"] = '{"h":1}';
    backing["belso-iranytu-emotion-vocab"] = '["csodálat"]';
    saveEntry({ date: "2026-09-05", mood: 4, note: "kör" });
    const text = collectBackupBundle(NOW);
    clearStorage();
    resetAll();
    resetAssessments();
    const report = restoreBackupBundle(text)!;
    expect(report.keysRestored).toBe(2);
    expect(backing["belso-iranytu-habits-v1"]).toBe('{"h":1}');
    expect(backing["belso-iranytu-emotion-vocab"]).toBe('["csodálat"]');
    expect(getState().entries.find((e) => e.date === "2026-09-05")!.note).toBe("kör");
  });
});

describe("the rotation", () => {
  test("no proof, no new file", async () => {
    const pk = await passkeyKek();
    const created = await createBackupFile({
      bundle: "TARTALOM",
      keks: { passkey: pk, recovery: await recoveryKek() },
      salt: SALT,
    });
    const wrong = await passkeyKek(new Uint8Array(32).fill(8));
    const rotated = await rotateBackup({
      file: created!.file,
      openKind: "passkey",
      openKek: wrong,
      nextKeks: { passkey: pk },
    });
    expect(rotated).toBeNull();
  });

  test("the new file carries the same bundle, drops the unwelcome unlock, and stays non-extractable", async () => {
    const pk = await passkeyKek();
    const rk = await recoveryKek();
    const created = await createBackupFile({
      bundle: "TARTALOM",
      keks: { passkey: pk, recovery: rk },
      salt: SALT,
    });
    const rotated = (await rotateBackup({
      file: created!.file,
      openKind: "passkey",
      openKek: pk,
      nextKeks: { recovery: rk },
      salt: new Uint8Array(32).fill(0x44),
      now: 5_000,
    }))!;
    expect(rotated.file.createdAt).toBe(5_000);
    expect(rotated.file.salt).not.toBe(created!.file.salt);
    expect((await readBackupFile(rotated.file, "recovery", rk))!.bundle).toBe("TARTALOM");
    expect(await readBackupFile(rotated.file, "passkey", pk)).toBeNull();
    await expect(crypto.subtle.exportKey("raw", rotated.dek)).rejects.toThrow();
  });

  test("without a salt one is generated, not reused", async () => {
    const pk = await passkeyKek();
    const created = await createBackupFile({ bundle: "TARTALOM", keks: { passkey: pk }, salt: SALT });
    const rotated = (await rotateBackup({
      file: created!.file,
      openKind: "passkey",
      openKek: pk,
      nextKeks: { passkey: pk },
    }))!;
    expect(rotated.file.salt).not.toBe(created!.file.salt);
    expect(rotated.file.salt).toHaveLength(64);
    expect((await readBackupFile(rotated.file, "passkey", pk))!.bundle).toBe("TARTALOM");
  });
});

describe("the device state", () => {
  test("absent, saved, forgotten", () => {
    expect(loadBackupState()).toBeNull();
    saveBackupState({
      v: 1,
      enabled: true,
      credentialId: "ab12",
      lastSavedAt: 1_000,
      saveCount: 3,
    });
    expect(loadBackupState()).toEqual({
      v: 1,
      enabled: true,
      credentialId: "ab12",
      lastSavedAt: 1_000,
      saveCount: 3,
    });
    forgetBackupState();
    expect(loadBackupState()).toBeNull();
  });

  test("the save counter counts, and a key without it counts from zero", () => {
    // Commit 5 added the counter, and the one field that may be MISSING: a
    // state key written before it existed has to keep working, because the
    // alternative is a feature that reads as switched off after an upgrade.
    // Present-but-not-a-number stays corruption, like every other field.
    backing[BACKUP_STATE_KEY] = JSON.stringify({
      v: 1,
      enabled: true,
      credentialId: null,
      lastSavedAt: 5,
    });
    expect(loadBackupState()).toEqual({
      v: 1,
      enabled: true,
      credentialId: null,
      lastSavedAt: 5,
      saveCount: 0,
    });
    backing[BACKUP_STATE_KEY] = JSON.stringify({
      v: 1,
      enabled: true,
      credentialId: null,
      lastSavedAt: null,
      saveCount: "sok",
    });
    expect(loadBackupState()).toBeNull();
  });

  test("a corrupt state reads as absent, never as enabled", () => {
    const raws = [
      "nem json",
      "{}",
      JSON.stringify({ v: 2, enabled: true, credentialId: null, lastSavedAt: null }),
      JSON.stringify({ v: 1, enabled: "igen", credentialId: null, lastSavedAt: null }),
      JSON.stringify({ v: 1, enabled: true, credentialId: 5, lastSavedAt: null }),
      JSON.stringify({ v: 1, enabled: true, credentialId: null, lastSavedAt: "ma" }),
    ];
    for (const raw of raws) {
      backing[BACKUP_STATE_KEY] = raw;
      expect(loadBackupState()).toBeNull();
    }
  });
});
