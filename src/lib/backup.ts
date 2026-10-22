/**
 * The orchestration of opt-in encrypted cloud backup: what goes into the
 * bundle, how it comes back, how a file is rotated, and what this device
 * remembers about its own backup.
 *
 * THE SCOPE IS AN ALLOW-LIST, AND THE LINE IS A RULE
 * Eighteen storage keys travel in a backup; nine named ones never do, and
 * nothing else does either — the collector asks for the nineteen by name and
 * never enumerates the rest. The rule behind the split: the reader's content,
 * progress and preferences go in; secrets, binaries, and device- or
 * session-scoped state stay out. So the journal, the food log and the
 * reader's own foods, the workout plans and log, the chosen diet, the custom
 * emotion vocabulary, trackers, activities, assessments, experiments, habits,
 * gratitude and thought records travel; the OpenAI key (a secret that must
 * never enter a cloud file), the attachment blobs and the background image
 * (bulky binaries, and the settings copy names them), the PIN, the unlock
 * session, the card layout, and the one-day notification bookkeeping all stay
 * on the device that wrote them. The food and the training halves were added
 * after this list's first shape, because a restore used to bring back the
 * moods, the trackers and the habits and leave every meal and every session
 * of the same journal empty. The v1 leftovers (`belso-iranytu-data`,
 * `belso-iranytu-profile`, `daily-goals`) are not in the allow-list either:
 * restoring them would offer a migrated store to the migrator a second time.
 *
 * HOW EACH KEY COMES BACK
 * The restore path is per owner, not one blanket write:
 *   - the store is LIVE state, so a raw localStorage write would not reach
 *     the running UI; its timeline merges through `importEntries` (days the
 *     file does not know survive; a day both sides have takes the file's
 *     version) and its singular fields — settings, profile, goals,
 *     medications, the check map, the daily question — go through the
 *     store's own setters;
 *   - the self-assessment log merges through `importAssessments`, the
 *     module's designated import door, for the same id-keyed reason;
 *   - every other included key is written back verbatim. Those owners repair
 *     corruption on read — the repository's established trust boundary — so
 *     the restore layer does not duplicate a dozen private validators.
 * Reporting is a count, not a promise: entries imported, assessments
 * imported, keys replaced, and the keys the file carried that could not be
 * used at all.
 *
 * ROTATION IS PROOF, THEN A NEW FILE
 * A rotated file is a fresh file — new DEK, new salt, new wraps — built from
 * the bundle that one still-valid secret just opened. Nothing is re-wrapped
 * in place, because the DEK is deliberately non-extractable and cannot be;
 * and nothing rotates without proof, because `rotateBackup` opens the old
 * file first and returns `null` when that fails. Dropping an unwelcome
 * unlock is therefore just not enrolling it again.
 *
 * WHAT THIS DEVICE REMEMBERS
 * `belso-iranytu-backup-state` holds only what the UI and the daemon need to
 * know before the first unlock of a session: whether backup is on, the
 * passkey's credential id (device-local state, useless anywhere else), when
 * the file was last written, and how many times this device has written it.
 * The counter is the one field that may be absent — a state key written
 * before it existed still loads, counting from zero — because a missing
 * counter is a display detail and a missing credential id would be a broken
 * unlock. It is not a secret and deliberately not one of the nineteen — a
 * restored device starts with backup OFF until its owner enrolls there, and
 * therefore with a count of zero. No KEK and no DEK ever touches this key or
 * any other.
 */
import {
  createBackupFile,
  generateBackupSalt,
  readBackupFile,
  type BackupFile,
  type BackupKeks,
  type BackupWrapKind,
  type CreatedBackup,
} from "./backupStorage";
import { importAssessments } from "./assessmentStore";
import {
  importEntries,
  setDailyQuestion,
  setGoals,
  setMedicationChecks,
  setMedications,
  setProfile,
  setSettings,
} from "./store";
import type { DailyQuestion, Entry, Goal, Medication, Profile, Settings } from "../types";

export const BACKUP_BUNDLE_VERSION = 1;
export const BACKUP_BUNDLE_APP = "belso-iranytu";
export const BACKUP_STATE_KEY = "belso-iranytu-backup-state";

const STORE_KEY = "belso-iranytu-data-v2";
const ASSESSMENTS_KEY = "belso-iranytu-assessments-v1";

/**
 * The nineteen keys a backup carries, in the order the bundle writes them.
 * Written as literals rather than imports because most owners keep their key
 * private; the few that export one are pinned against these lists by the
 * tests, so the two cannot drift apart quietly.
 */
export const BACKUP_INCLUDED_KEYS = [
  STORE_KEY,
  "belso-iranytu-emotion-vocab",
  "belso-iranytu-custom-trackers",
  "belso-iranytu-custom-activities",
  ASSESSMENTS_KEY,
  "belso-iranytu-experiments-v1",
  "belso-iranytu-habits-v1",
  "belso-iranytu-gratitude",
  "belso-iranytu-cbt-records",
  "belso-iranytu-onboarding",
  "belso-iranytu-feature-flags-v1",
  "belso-iranytu-achievements-seen",
  "belso-iranytu-seen-lessons",
  "belso-iranytu-reminder-message",
  // The food, food-name, training and diet halves of the same journal. They
  // are logs and a preference, not device state, so the rule above puts them
  // on this side of the line; only the settings copy used to say otherwise.
  "belso-iranytu-nutrition-log-v1",
  "belso-iranytu-custom-foods-v1",
  "belso-iranytu-fitness-v1",
  "belso-iranytu-diet-v1",
  // Phase 5's support wall: the reader's own notes, written to themselves.
  // Nothing but their words, which is exactly what the side of the line this
  // list marks is for — a reader restoring a backup expects their own writing
  // to come back with the rest of it.
  "belso-iranytu-support-wall",
] as const;

/** The nine named exclusions; the rule behind them lives in the docblock. */
export const BACKUP_EXCLUDED_KEYS = [
  "belso-iranytu-attachments",
  "belso-iranytu-background",
  "belso-iranytu:openai-key",
  "belso-iranytu-app-lock",
  "belso-iranytu-app-lock-session",
  "belso-iranytu:cardStates",
  "belso-iranytu-med-reminders-fired",
  "belso-iranytu-reminder-last",
  "belso-iranytu-install-banner-dismissed",
] as const;

/**
 * The sentence the settings card shows beside the backup switch.
 *
 * It used to live here and was moved to `lib/i18n.ts` as `backup.scopeNote`,
 * because this card was its ONLY reader: a constant with one consumer is the
 * surface's copy, not the module's, and leaving it here would have meant the
 * backup panel still kept a private Hungarian sentence. Nothing else in this
 * module is user-facing copy.
 */

/* ------------------------------ the bundle ----------------------------- */

export type BackupBundle = {
  v: typeof BACKUP_BUNDLE_VERSION;
  app: typeof BACKUP_BUNDLE_APP;
  /** epoch ms, for a human reading the decrypted JSON */
  exportedAt: number;
  /** raw localStorage values, only for included keys that existed */
  keys: Record<string, string>;
};

function readKey(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    // no storage, or a blocked one — a key that cannot be read is absent
    return null;
  }
}

function writeKey(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read the included keys into bundle text. Never throws: a key whose read
 * fails is simply absent, exactly as it is on a device that never wrote it,
 * so a backup of a half-broken storage is still a backup of what is there.
 */
export function collectBackupBundle(now = Date.now()): string {
  const keys: Record<string, string> = {};
  for (const key of BACKUP_INCLUDED_KEYS) {
    const value = readKey(key);
    if (typeof value === "string") keys[key] = value;
  }
  const bundle: BackupBundle = {
    v: BACKUP_BUNDLE_VERSION,
    app: BACKUP_BUNDLE_APP,
    exportedAt: now,
    keys,
  };
  return JSON.stringify(bundle);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseBundle(text: unknown): BackupBundle | null {
  if (typeof text !== "string") return null;
  const raw = asObject(parseJson(text));
  if (!raw) return null;
  if (raw.v !== BACKUP_BUNDLE_VERSION) return null;
  if (raw.app !== BACKUP_BUNDLE_APP) return null;
  if (typeof raw.exportedAt !== "number" || !Number.isFinite(raw.exportedAt)) return null;
  const source = asObject(raw.keys);
  if (!source) return null;
  const keys: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value !== "string") return null;
    keys[key] = value;
  }
  return {
    v: BACKUP_BUNDLE_VERSION,
    app: BACKUP_BUNDLE_APP,
    exportedAt: raw.exportedAt,
    keys,
  };
}

/* ------------------------------ the restore ---------------------------- */

export type RestoreReport = {
  entriesImported: number;
  assessmentsImported: number;
  /** included keys replaced verbatim */
  keysRestored: number;
  /** included keys the file carried that could not be used at all */
  skipped: string[];
};

/**
 * File data handed to an API that expects the app's own type. Every consumer
 * here validates: `importEntries` normalizes every record, `importAssessments`
 * drops what fails validation, and the raw keys are re-read defensively by
 * their owners. This is the same boundary the JSON import has always crossed.
 */
function fromFile<T>(value: unknown): T {
  return value as T;
}

function applyStore(data: Record<string, unknown>, report: RestoreReport): void {
  if (Array.isArray(data.entries)) {
    importEntries(fromFile<Entry[]>(data.entries));
    report.entriesImported = data.entries.length;
  }
  if (Array.isArray(data.goals)) setGoals(fromFile<Goal[]>(data.goals));
  if (data.dailyQuestion === null || asObject(data.dailyQuestion)) {
    setDailyQuestion(fromFile<DailyQuestion | null>(data.dailyQuestion));
  }
  if (Array.isArray(data.medications)) setMedications(fromFile<Medication[]>(data.medications));
  const checks = asObject(data.medicationChecks);
  if (checks) setMedicationChecks(fromFile<Record<string, Record<string, boolean>>>(checks));
  const profile = asObject(data.profile);
  if (profile) setProfile(fromFile<Profile>(profile));
  const settings = asObject(data.settings);
  if (settings) setSettings(fromFile<Settings>(settings));
}

/**
 * Put a bundle back. Unknown keys are ignored — a newer file may carry more —
 * and only the allow-list is ever written, so a hand-crafted file cannot
 * smuggle a write into an excluded key. `null` means the text is not this
 * format; a valid bundle with unusable values returns a report naming them.
 */
export function restoreBackupBundle(text: unknown): RestoreReport | null {
  const bundle = parseBundle(text);
  if (!bundle) return null;
  const report: RestoreReport = {
    entriesImported: 0,
    assessmentsImported: 0,
    keysRestored: 0,
    skipped: [],
  };

  const storeValue = bundle.keys[STORE_KEY];
  if (storeValue !== undefined) {
    const data = asObject(parseJson(storeValue));
    if (!data) report.skipped.push(STORE_KEY);
    else applyStore(data, report);
  }

  const assessmentsValue = bundle.keys[ASSESSMENTS_KEY];
  if (assessmentsValue !== undefined) {
    const parsed = parseJson(assessmentsValue);
    if (asObject(parsed) === null) report.skipped.push(ASSESSMENTS_KEY);
    else report.assessmentsImported = importAssessments(parsed);
  }

  for (const key of BACKUP_INCLUDED_KEYS) {
    if (key === STORE_KEY || key === ASSESSMENTS_KEY) continue;
    const value = bundle.keys[key];
    if (value === undefined) continue;
    if (writeKey(key, value)) report.keysRestored += 1;
    else report.skipped.push(key);
  }

  return report;
}

/* ------------------------------ the rotation --------------------------- */

export type RotateOptions = {
  /** the file as it stands — the rotation's proof requirement */
  file: BackupFile;
  /** which slot the freshly proven secret belongs to */
  openKind: BackupWrapKind;
  openKek: CryptoKey;
  /** the unlocks the NEW file should carry */
  nextKeks: BackupKeks;
  /** a fresh KDF salt; omitted means generated */
  salt?: Uint8Array;
  now?: number;
};

/**
 * Open the old file with a proven secret and build the new file around the
 * same bundle. `null` when the proof fails: rotation without a working
 * secret is exactly the operation the wraps exist to prevent.
 */
export async function rotateBackup(options: RotateOptions): Promise<CreatedBackup | null> {
  const opened = await readBackupFile(options.file, options.openKind, options.openKek);
  if (!opened) return null;
  return createBackupFile({
    bundle: opened.bundle,
    keks: options.nextKeks,
    salt: options.salt ?? generateBackupSalt(),
    now: options.now,
  });
}

/* --------------------------- what this device saw ---------------------- */

export type BackupDeviceState = {
  v: 1;
  enabled: boolean;
  /** the enrolled passkey's id, hex — device-local, useless elsewhere */
  credentialId: string | null;
  /** epoch ms of the last successful write */
  lastSavedAt: number | null;
  /** successful writes from this device; a state key without the field is 0 */
  saveCount: number;
};

/** The state, or `null` for absent or unreadable — never a half-trusted one. */
export function loadBackupState(): BackupDeviceState | null {
  const raw = readKey(BACKUP_STATE_KEY);
  if (raw === null) return null;
  const parsed = asObject(parseJson(raw));
  if (!parsed) return null;
  if (parsed.v !== 1) return null;
  if (typeof parsed.enabled !== "boolean") return null;
  if (parsed.credentialId !== null && typeof parsed.credentialId !== "string") return null;
  if (parsed.lastSavedAt !== null && typeof parsed.lastSavedAt !== "number") return null;
  // Absent is zero; present-but-not-a-number is corruption, like every other
  // field here. Only the one field gets a lenient default.
  if (parsed.saveCount !== undefined && typeof parsed.saveCount !== "number") return null;
  return {
    v: 1,
    enabled: parsed.enabled,
    credentialId: parsed.credentialId,
    lastSavedAt: parsed.lastSavedAt,
    saveCount: typeof parsed.saveCount === "number" ? parsed.saveCount : 0,
  };
}

export function saveBackupState(state: BackupDeviceState): void {
  try {
    localStorage.setItem(BACKUP_STATE_KEY, JSON.stringify(state));
  } catch {
    // the session keeps working without it; the next save tries again
  }
}

export function forgetBackupState(): void {
  try {
    localStorage.removeItem(BACKUP_STATE_KEY);
  } catch {
    /* noop */
  }
}
