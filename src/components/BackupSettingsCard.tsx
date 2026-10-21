/**
 * Commit 5 — the settings surface of opt-in encrypted cloud backup, and the
 * only place in the app that ever holds a secret the user typed.
 *
 * FOUR STATES, BECAUSE FOUR PROMISES ARE DIFFERENT
 * OFF says what the feature is and offers it. SETUP collects the first secret
 * and shows a password form, or the passkey ceremony. RECOVERY shows the
 * twelve words ONCE and refuses to continue until they are acknowledged.
 * ACTIVE is the steady state: last write, how many, and the two ways back
 * into a file. ERROR is a state rather than a toast because every failure
 * here — a refused ceremony, a mistyped password, a file that is not ours —
 * is something the user has to be able to read again and act on, and a toast
 * disappears before they do.
 *
 * THE TWELVE WORDS ARE SHOWN BEFORE THE FILE IS WRITTEN
 * `prepareBackup*` seals the file in memory and hands back the words that
 * were generated for it; nothing has been written anywhere yet. The user
 * acknowledges them, and only then does `writePreparedBackup` open the save
 * chain. Reversing that order would mean a file existing whose other key the
 * user never saw. A cancelled save is a decision, not a reason to carry on:
 * the file is dropped and the card says so, because "enabled" with no file
 * is the one state this feature must never sit in.
 *
 * NO SECRET EVER REACHES THE DOM
 * Every field that holds a password, or the recovery code, is UNCONTROLLED:
 * the markup carries no `value` attribute, so nothing this card types can be
 * read back out of the rendered tree, and the container keeps the value in
 * React state only. The fields are cleared by remounting them (a nonce in the
 * `key`), which is the honest way to clear an uncontrolled input. The twelve
 * words are the single exception, and they are in the DOM on purpose: they
 * are the thing the user has to write down.
 *
 * THE STYLES
 * A plain `Card`, not one of the settings page's collapsible rows, for the
 * reason the PIN card is plain: this is a data-protection control, not an
 * option behind a tap, and the collapsible-head count on that page is pinned
 * by tests that have no reason to move. The three new classes (`.backup-words`,
 * `.backup-word`, `.backup-status`) are the only styling this feature owns,
 * and they exist so the recovery code reads as a list of words rather than a
 * paragraph of them.
 *
 * TESTABILITY, AND WHY THE VIEWS ARE EXPORTS
 * This suite has no jsdom and no effects: rendering is
 * `renderToStaticMarkup`, so a test can only see markup, never a click. The
 * four states are therefore separate exported views that take their state as
 * props, and the flows are exported functions that take their WebAuthn
 * surface and file surface as parameters — the same injectable shape
 * `backupKey` and `backupStorage` already use for their own tests.
 */
import { useState } from "react";
import { useApp } from "../state/AppContext";
import { CollapsibleCard, TextInput, Toggle } from "./ui/ui";
import { Save } from "../lib/icons";
import { formatHuman, toISODate } from "../lib/dates";
import { t } from "../lib/i18n";
import {
  collectBackupBundle,
  forgetBackupState,
  loadBackupState,
  restoreBackupBundle,
  saveBackupState,
  type BackupDeviceState,
  type RestoreReport,
} from "../lib/backup";
import {
  availableWraps,
  backupFileName,
  createBackupFile,
  generateBackupSalt,
  openBackupText,
  parseBackupFile,
  readBackupFile,
  saveBackupText,
  serializeBackupFile,
  updateBackupFile,
  type BackupFile,
  type BackupIo,
  type BackupKeks,
  type BackupWrapKind,
  type SaveOutcome,
} from "../lib/backupStorage";
import {
  createBackupPasskey,
  deriveBackupKekFromPassword,
  deriveBackupKekFromPrf,
  deriveBackupKekFromRecovery,
  detectWebAuthnSurface,
  isPasskeySupported,
  PASSWORD_MIN_LENGTH,
  passwordProblem,
  unlockWithPasskey,
  type WebAuthnSurface,
} from "../lib/backupKey";
import {
  entropyToWords,
  generateRecoveryEntropy,
  wordsToEntropy,
} from "../lib/backupCrypto";

/* --------------------------------- copy -------------------------------- */

/**
 * WHAT IS NOT HERE, AND WHY
 * This card used to hold its copy as eleven module constants at the top of the
 * file. They are gone: every sentence is `t("backup.*")` now, called at the
 * point of use rather than frozen into a `const` at import, so that a locale
 * switch would move the error messages along with everything else instead of
 * leaving them behind in Hungarian.
 *
 * Three neighbouring strings deliberately did not move. `lib/backupKey.ts`
 * keeps the password POLICY and its own twelve strings, and half of a policy
 * module is worse than none of it. `RESOURCES`, `RESOURCES_TITLE` and
 * `DISCLAIMER` stay in `lib/assessments.ts` because five surfaces read them,
 * the PDF export among them — moving those is a cross-surface change, not this
 * card's business. `RESOURCES` is data in any case: helpline names, numbers
 * and hours, and a second list of crisis numbers is the one duplication in this
 * codebase that could actually hurt somebody.
 */

/* --------------------------------- flows -------------------------------- */

/** A sealed file nobody has been asked to store yet. */
export type PreparedBackup = {
  file: BackupFile;
  /** the same data key the file's wraps open; kept only for this session */
  dek: CryptoKey;
  /** the twelve words, shown once and then gone from the UI */
  words: string[];
  /** the passkey's credential id, or null for a password-only file */
  credentialId: string | null;
};

export type PrepareResult =
  | { ok: true; prepared: PreparedBackup }
  | { ok: false; error: string };

/** One unlock path, named the way the file names its slots. */
export type BackupSecret =
  | { kind: "passkey"; credentialId: string }
  | { kind: "password"; password: string }
  | { kind: "recovery"; words: string[] };

export type BackupDeps = {
  /** the WebAuthn surface; omitted means the browser's own */
  surface?: WebAuthnSurface | null;
  /** the file surface; omitted means whatever `detectBackupIo` builds */
  io?: BackupIo;
  /** epoch ms the file is stamped with; omitted means the clock's */
  now?: number;
};

/** A file the user has chosen, with the secrets it will actually accept. */
export type PendingRestore = {
  file: BackupFile;
  name: string | null;
  wraps: BackupWrapKind[];
};

/** The file's hex salt as bytes; null for a header that should not exist. */
function fileSalt(file: BackupFile): Uint8Array | null {
  if (typeof file?.salt !== "string" || file.salt.length === 0 || file.salt.length % 2 !== 0) {
    return null;
  }
  const bytes = new Uint8Array(file.salt.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const byte = Number.parseInt(file.salt.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) return null;
    bytes[i] = byte;
  }
  return bytes;
}

/**
 * The second key every new file carries: a fresh code, its words, and the KEK
 * that seals the data key under it. The code is generated here and nowhere
 * else, so "the words on screen" and "the wrap in the file" cannot be two
 * different codes.
 */
async function recoverySlot(
  salt: Uint8Array,
): Promise<{ kek: CryptoKey; words: string[] } | null> {
  const entropy = generateRecoveryEntropy();
  const words = entropyToWords(entropy);
  if (!words) return null;
  const kek = await deriveBackupKekFromRecovery(entropy, salt);
  return kek ? { kek, words } : null;
}

async function sealBundle(
  keks: BackupKeks,
  salt: Uint8Array,
  words: string[],
  credentialId: string | null,
  now: number | undefined,
): Promise<PrepareResult> {
  const created = await createBackupFile({ bundle: collectBackupBundle(now), keks, salt, now });
  if (!created) return { ok: false, error: t("backup.fileFailed") };
  return { ok: true, prepared: { file: created.file, dek: created.dek, words, credentialId } };
}

/**
 * Enroll with a passkey: ceremony, PRF → KEK, a fresh recovery code, and a
 * file carrying BOTH slots. Nothing is written to disk here — see the
 * docblock.
 */
export async function prepareBackupWithPasskey(
  userName: string,
  deps: BackupDeps = {},
): Promise<PrepareResult> {
  const surface = deps.surface === undefined ? detectWebAuthnSurface() : deps.surface;
  const passkey = await createBackupPasskey(userName, surface);
  if (!passkey.ok) return { ok: false, error: passkey.error };
  const kek = await deriveBackupKekFromPrf(passkey.prfOutput);
  if (!kek) return { ok: false, error: t("backup.keyFailed") };
  const salt = generateBackupSalt();
  const recovery = await recoverySlot(salt);
  if (!recovery) return { ok: false, error: t("backup.keyFailed") };
  return sealBundle(
    { passkey: kek, recovery: recovery.kek },
    salt,
    recovery.words,
    passkey.credentialId,
    deps.now,
  );
}

/** The same, for a browser or authenticator that cannot do PRF. */
export async function prepareBackupWithPassword(
  password: string,
  repeat: string,
  deps: BackupDeps = {},
): Promise<PrepareResult> {
  // The policy is the module's, not this card's: `passwordProblem` is the only
  // statement of what a usable password is, and a second one here would be a
  // second rule that could disagree with it.
  const problem = passwordProblem(password);
  if (problem) return { ok: false, error: problem };
  if (password !== repeat) return { ok: false, error: t("backup.mismatch") };
  const salt = generateBackupSalt();
  const kek = await deriveBackupKekFromPassword(password, salt);
  if (!kek) return { ok: false, error: t("backup.keyFailed") };
  const recovery = await recoverySlot(salt);
  if (!recovery) return { ok: false, error: t("backup.keyFailed") };
  return sealBundle(
    { password: kek, recovery: recovery.kek },
    salt,
    recovery.words,
    null,
    deps.now,
  );
}

/**
 * Write a prepared file and only then mark backup as on. The device state is
 * the record that a file exists, so it moves in the same breath as the write —
 * a file the user cancelled must not leave the feature switched on.
 */
export async function writePreparedBackup(
  prepared: PreparedBackup,
  deps: BackupDeps = {},
): Promise<SaveOutcome> {
  const outcome = await saveBackupText(serializeBackupFile(prepared.file), backupFileName(), deps.io);
  if (!outcome.ok) return outcome;
  const previous = loadBackupState();
  saveBackupState({
    v: 1,
    enabled: true,
    credentialId: prepared.credentialId,
    lastSavedAt: prepared.file.updatedAt,
    saveCount: (previous?.saveCount ?? 0) + 1,
  });
  return outcome;
}

/**
 * One secret → the key that opens this file. Every route ends at a KEK the
 * caller cannot export, and a wrong one is a null rather than a throw, so the
 * card's only decision is "did it open or not". The surface is a parameter
 * because the passkey half runs a ceremony, and a ceremony that could only be
 * driven against the real browser would leave that path untested.
 */
export async function unlockBackupKek(
  secret: BackupSecret,
  file: BackupFile,
  deps: Pick<BackupDeps, "surface"> = {},
): Promise<CryptoKey | null> {
  if (secret.kind === "passkey") {
    const surface = deps.surface === undefined ? detectWebAuthnSurface() : deps.surface;
    const result = await unlockWithPasskey(secret.credentialId, surface);
    return result.ok ? deriveBackupKekFromPrf(result.prfOutput) : null;
  }
  const salt = fileSalt(file);
  if (!salt) return null;
  if (secret.kind === "password") return deriveBackupKekFromPassword(secret.password, salt);
  const entropy = wordsToEntropy(secret.words);
  return entropy ? deriveBackupKekFromRecovery(entropy, salt) : null;
}

export type SaveNowResult =
  | { ok: true; savedAt: number }
  | { ok: false; cancelled: boolean; error?: string };

/**
 * Re-save the current journal over the file the user points at.
 *
 * PROOF FIRST, ALWAYS: the file is opened and decrypted before a single byte
 * is written, because that is the only way to learn (a) that the secret is
 * right and (b) which wraps the file already carries. A new file is NOT
 * written instead — a save that quietly replaced a two-key file with a
 * one-key file would drop the user's other way back in.
 */
export async function saveBackupNow(
  secret: BackupSecret,
  deps: BackupDeps = {},
): Promise<SaveNowResult> {
  const opened = await openBackupText(deps.io);
  if (!opened.ok) return { ok: false, cancelled: opened.cancelled, error: opened.error };
  const file = parseBackupFile(opened.text);
  if (!file) return { ok: false, cancelled: false, error: t("backup.notOurs") };
  const kek = await unlockBackupKek(secret, file, deps);
  if (!kek) return { ok: false, cancelled: false, error: t("backup.openFailed") };
  const proof = await readBackupFile(file, secret.kind, kek);
  if (!proof) return { ok: false, cancelled: false, error: t("backup.openFailed") };
  const updated = await updateBackupFile(file, proof.dek, collectBackupBundle(deps.now), deps.now);
  if (!updated) return { ok: false, cancelled: false, error: t("backup.fileFailed") };
  const outcome = await saveBackupText(serializeBackupFile(updated), backupFileName(), deps.io);
  if (!outcome.ok) return outcome;
  const previous = loadBackupState();
  saveBackupState({
    v: 1,
    enabled: true,
    credentialId: previous?.credentialId ?? null,
    lastSavedAt: updated.updatedAt,
    saveCount: (previous?.saveCount ?? 0) + 1,
  });
  return { ok: true, savedAt: updated.updatedAt };
}

/** Read a file the user picked, without decrypting anything yet. */
export async function chooseBackupFile(
  deps: BackupDeps = {},
): Promise<
  { ok: true; pending: PendingRestore } | { ok: false; cancelled: boolean; error?: string }
> {
  const opened = await openBackupText(deps.io);
  if (!opened.ok) return { ok: false, cancelled: opened.cancelled, error: opened.error };
  const file = parseBackupFile(opened.text);
  if (!file) return { ok: false, cancelled: false, error: t("backup.notOurs") };
  return { ok: true, pending: { file, name: opened.name, wraps: availableWraps(file) } };
}

export type RestoreResult = { ok: true; report: RestoreReport } | { ok: false; error: string };

/** Open a chosen file with one secret and merge what is inside. */
export async function restoreBackupFile(
  file: BackupFile,
  secret: BackupSecret,
  deps: Pick<BackupDeps, "surface"> = {},
): Promise<RestoreResult> {
  const kek = await unlockBackupKek(secret, file, deps);
  if (!kek) return { ok: false, error: t("backup.openFailed") };
  const opened = await readBackupFile(file, secret.kind, kek);
  if (!opened) return { ok: false, error: t("backup.openFailed") };
  const report = restoreBackupBundle(opened.bundle);
  if (!report) return { ok: false, error: t("backup.fileFailed") };
  return { ok: true, report };
}

/** What a restore did, in the counts the restore layer reports. */
export function restoreSummary(report: RestoreReport): string {
  // Two whole sentences rather than a base string and a parenthetical bolted
  // on: a translator cannot move a clause inside a template that is half an
  // expression, and the shapes are already different enough to deserve names.
  const counts = {
    entries: report.entriesImported,
    assessments: report.assessmentsImported,
    keys: report.keysRestored,
  };
  return report.skipped.length > 0
    ? t("backup.restoredSkipped", { ...counts, skipped: report.skipped.length })
    : t("backup.restored", counts);
}

/** "2026. október 3., péntek, 14:05" — or the honest "not yet". */
export function formatSaved(at: number | null): string {
  if (at === null) return t("backup.savedAtNever");
  const when = new Date(at);
  const time = `${String(when.getHours()).padStart(2, "0")}:${String(when.getMinutes()).padStart(2, "0")}`;
  return `${formatHuman(toISODate(when))}, ${time}`;
}

/* --------------------------------- views -------------------------------- */

export function BackupOffView({ onEnable }: { onEnable: () => void }) {
  return (
    <>
      <p className="muted-note">{t("backup.offIntro")}</p>
      <p className="muted-note">{t("backup.cloudNote")}</p>
      <p className="muted-note">{t("backup.scopeNote")}</p>
      <button
        type="button"
        className="btn btn-primary btn-block"
        onClick={onEnable}
      >
        {t("backup.enable")}
      </button>
    </>
  );
}

export function BackupSetupView({
  passkeyOk,
  error,
  busy,
  onPasskey,
  onPassword,
  onCancel,
}: {
  passkeyOk: boolean;
  error: string;
  busy: boolean;
  onPasskey: () => void;
  onPassword: (password: string, repeat: string) => void;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [nonce, setNonce] = useState(0);

  function submit() {
    onPassword(password, repeat);
    // Uncontrolled inputs cannot be emptied by setting state — remounting them
    // is the clearing that actually happens in the DOM.
    setPassword("");
    setRepeat("");
    setNonce((n) => n + 1);
  }

  return (
    <>
      <p className="muted-note">{t("backup.setupIntro")}</p>
      <p className="muted-note">{t("backup.lossNote")}</p>
      {passkeyOk ? (
        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={onPasskey}
          disabled={busy}
        >
          {t("backup.setupPasskey")}
        </button>
      ) : (
        <p className="muted-note">{t("backup.noPrf")}</p>
      )}
      <label className="field-label" htmlFor={`backup-password-${nonce}`}>
        {t("backup.passwordLabel")}
        <TextInput
          key={`backup-password-${nonce}`}
          id={`backup-password-${nonce}`}
          type="password"
          autoComplete="new-password"
          placeholder={t("backup.passwordPlaceholder", { min: PASSWORD_MIN_LENGTH })}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <label className="field-label" htmlFor={`backup-password-again-${nonce}`}>
        {t("backup.passwordAgainLabel")}
        <TextInput
          key={`backup-password-again-${nonce}`}
          id={`backup-password-again-${nonce}`}
          type="password"
          autoComplete="new-password"
          onChange={(e) => setRepeat(e.target.value)}
        />
      </label>
      {error ? (
        <p className="pin-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="add-row">
        <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
          {t("backup.usePassword")}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          {t("backup.cancel")}
        </button>
      </div>
    </>
  );
}

export function BackupRecoveryView({
  words,
  acknowledged,
  error,
  busy,
  onToggleAck,
  onConfirm,
  onCancel,
}: {
  words: string[];
  acknowledged: boolean;
  error: string;
  busy: boolean;
  onToggleAck: (value: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <p>
        <strong>{t("backup.recoveryLead")}</strong> {t("backup.recoveryRest")}
      </p>
      <div className="backup-words">
        {words.map((word, index) => (
          <span className="backup-word" key={`${index}-${word}`}>
            {word}
          </span>
        ))}
      </div>
      <p className="muted-note">{t("backup.lossNote")}</p>
      <Toggle
        label={t("backup.ackLabel")}
        hint={t("backup.ackHint")}
        checked={acknowledged}
        onChange={onToggleAck}
      />
      {error ? (
        <p className="pin-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="add-row">
        <button
          type="button"
          className="btn btn-primary"
          onClick={onConfirm}
          disabled={!acknowledged || busy}
        >
          {t("backup.save")}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          {t("backup.cancel")}
        </button>
      </div>
    </>
  );
}

export function BackupActiveView({
  lastSavedAt,
  saveCount,
  hasPasskey,
  pending,
  status,
  busy,
  onSaveWithPasskey,
  onSaveWithPassword,
  onChooseFile,
  onRestoreWithPasskey,
  onRestoreWithPassword,
  onRestoreWithWords,
  onDisable,
}: {
  lastSavedAt: number | null;
  saveCount: number;
  hasPasskey: boolean;
  /**
   * Just what the panel shows. The file itself stays with the container: this
   * view cannot decrypt anything, and handing it a key-bearing object would be
   * an invitation to.
   */
  pending: Pick<PendingRestore, "name" | "wraps"> | null;
  status: string;
  busy: boolean;
  onSaveWithPasskey: () => void;
  onSaveWithPassword: (password: string) => void;
  onChooseFile: () => void;
  onRestoreWithPasskey: () => void;
  onRestoreWithPassword: (password: string) => void;
  onRestoreWithWords: (words: string) => void;
  onDisable: () => void;
}) {
  const [savePassword, setSavePassword] = useState("");
  const [restorePassword, setRestorePassword] = useState("");
  const [code, setCode] = useState("");
  const [nonce, setNonce] = useState(0);

  function clear() {
    setSavePassword("");
    setRestorePassword("");
    setCode("");
    setNonce((n) => n + 1);
  }

  return (
    <>
      <p className="muted-note">{t("backup.cloudNote")}</p>
      <p className="muted-note">{t("backup.scopeNote")}</p>
      <p className="muted-note">{t("backup.runningNote")}</p>
      <p className="muted-note">{t("backup.touchNote")}</p>
      <p className="backup-status">
        {lastSavedAt === null
          ? formatSaved(null)
          : t("backup.lastSaved", { when: formatSaved(lastSavedAt) })}
        {saveCount > 0 ? " " + t("backup.saveCount", { count: saveCount }) : ""}
      </p>

      {hasPasskey ? (
        <div className="add-row">
          <button
            type="button"
            className="btn btn-primary"
            onClick={onSaveWithPasskey}
            disabled={busy}
          >
            {t("backup.saveNow")}
          </button>
        </div>
      ) : null}
      <label className="field-label" htmlFor={`backup-save-password-${nonce}`}>
        {t("backup.savePasswordLabel")}
        <TextInput
          key={`backup-save-password-${nonce}`}
          id={`backup-save-password-${nonce}`}
          type="password"
          autoComplete="current-password"
          onChange={(e) => setSavePassword(e.target.value)}
        />
      </label>
      <div className="add-row">
        {/* ONE primary button, whichever secret this file actually has: the
            passkey where there is one, the typed password where there is not.
            Two buttons reading "Mentés most" would be a coin toss. */}
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            onSaveWithPassword(savePassword);
            clear();
          }}
          disabled={busy}
        >
          {hasPasskey ? t("backup.saveWithPassword") : t("backup.saveNow")}
        </button>
      </div>

      <div className="add-row">
        <button
          type="button"
          className="btn btn-soft"
          onClick={onChooseFile}
          disabled={busy}
        >
          {t("backup.restoreFromFile")}
        </button>
      </div>

      {pending ? (
        <>
          <p className="muted-note">
            {pending.name ? t("backup.fileLabel", { name: pending.name }) : t("backup.fileFallback")}{" "}
            {t("backup.openWith")} {pending.wraps.join(", ")}
          </p>
          {hasPasskey && pending.wraps.includes("passkey") ? (
            <div className="add-row">
              <button
                type="button"
                className="btn btn-primary"
                onClick={onRestoreWithPasskey}
                disabled={busy}
              >
                {t("backup.restorePasskey")}
              </button>
            </div>
          ) : null}
          <label className="field-label" htmlFor={`backup-restore-password-${nonce}`}>
            {t("backup.restorePasswordLabel")}
            <TextInput
              key={`backup-restore-password-${nonce}`}
              id={`backup-restore-password-${nonce}`}
              type="password"
              autoComplete="off"
              onChange={(e) => setRestorePassword(e.target.value)}
            />
          </label>
          <div className="add-row">
            <button
              type="button"
              className="btn btn-soft"
              onClick={() => {
                onRestoreWithPassword(restorePassword);
                clear();
              }}
              disabled={busy}
            >
              {t("backup.restorePassword")}
            </button>
          </div>
          <label className="field-label" htmlFor={`backup-restore-code-${nonce}`}>
            {t("backup.restoreCodeLabel")}
            <TextInput
              key={`backup-restore-code-${nonce}`}
              id={`backup-restore-code-${nonce}`}
              type="text"
              autoComplete="off"
              placeholder={t("backup.restoreCodePlaceholder")}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <div className="add-row">
            <button
              type="button"
              className="btn btn-soft"
              onClick={() => {
                onRestoreWithWords(code);
                clear();
              }}
              disabled={busy}
            >
              {t("backup.restoreCode")}
            </button>
          </div>
        </>
      ) : null}

      {status ? (
        <p className="muted-note" role="status">
          {status}
        </p>
      ) : null}

      <div className="add-row">
        <button
          type="button"
          className="btn btn-ghost btn-block"
          onClick={onDisable}
          disabled={busy}
        >
          {t("backup.disable")}
        </button>
      </div>
    </>
  );
}

export function BackupErrorView({
  message,
  onBack,
}: {
  message: string;
  onBack: () => void;
}) {
  return (
    <>
      <p className="pin-error" role="alert">
        {message || t("backup.noSource")}
      </p>
      <button type="button" className="btn btn-ghost btn-block" onClick={onBack}>
        {t("backup.back")}
      </button>
    </>
  );
}

/* ------------------------------- the card ------------------------------ */

type BackupPhase = "off" | "setup" | "recovery" | "active" | "error";

export default function BackupSettingsCard() {
  const { data, notify } = useApp();
  const [device, setDevice] = useState<BackupDeviceState | null>(() => loadBackupState());
  /** Non-null only while a flow has taken the card off its resting state. */
  const [override, setOverride] = useState<BackupPhase | null>(null);
  const [passkeyOk] = useState(() => isPasskeySupported());
  const [prepared, setPrepared] = useState<PreparedBackup | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [setupError, setSetupError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingRestore | null>(null);

  const phase: BackupPhase = override ?? (device?.enabled === true ? "active" : "off");

  /**
   * Every ceremony runs behind this, so a button is disabled while it is in
   * flight and the card cannot be asked to do two WebAuthn prompts at once.
   */
  async function working(work: () => Promise<void>): Promise<void> {
    setBusy(true);
    try {
      await work();
    } finally {
      setBusy(false);
    }
  }

  /** Storage is the record; the patched fields are the ones we just learned. */
  function remember(patch: Partial<BackupDeviceState>): void {
    const previous = loadBackupState();
    setDevice({
      v: 1,
      enabled: true,
      credentialId: previous?.credentialId ?? null,
      lastSavedAt: previous?.lastSavedAt ?? null,
      saveCount: previous?.saveCount ?? 0,
      ...patch,
    });
  }

  function startSetup() {
    setSetupError("");
    setMessage("");
    setOverride("setup");
  }

  function abandon() {
    setPrepared(null);
    setAcknowledged(false);
    setSetupError("");
    setOverride(null);
  }

  function fail(text: string): void {
    setMessage(text);
    setOverride("error");
  }

  function enableWithPasskey() {
    void working(async () => {
      setSetupError("");
      const result = await prepareBackupWithPasskey(data.profile.name);
      if (!result.ok) return setSetupError(result.error);
      setPrepared(result.prepared);
      setAcknowledged(false);
      setOverride("recovery");
    });
  }

  function enableWithPassword(password: string, repeat: string) {
    void working(async () => {
      setSetupError("");
      const result = await prepareBackupWithPassword(password, repeat);
      if (!result.ok) return setSetupError(result.error);
      setPrepared(result.prepared);
      setAcknowledged(false);
      setOverride("recovery");
    });
  }

  function confirmRecovery() {
    if (!prepared) return;
    void working(async () => {
      setSetupError("");
      const outcome = await writePreparedBackup(prepared);
      if (!outcome.ok) {
        return setSetupError(
          outcome.cancelled
            ? t("backup.cancelled")
            : (outcome.error ?? t("backup.fileFailed")),
        );
      }
      setPrepared(null);
      setAcknowledged(false);
      setOverride(null);
      remember({
        credentialId: prepared.credentialId,
        lastSavedAt: prepared.file.updatedAt,
      });
      notify(t("backup.ready"));
    });
  }

  function saveNow(secret: BackupSecret) {
    void working(async () => {
      const result = await saveBackupNow(secret);
      if (!result.ok) {
        // A cancelled picker is an answer, not a failure to report.
        if (result.cancelled) return;
        return fail(result.error ?? t("backup.fileFailed"));
      }
      remember({ lastSavedAt: result.savedAt });
      setMessage(t("backup.saved", { when: formatSaved(result.savedAt) }));
      notify(t("backup.savedNotify"));
    });
  }

  function chooseFile() {
    void working(async () => {
      setMessage("");
      const result = await chooseBackupFile();
      if (!result.ok) {
        if (result.cancelled) return;
        return fail(result.error ?? t("backup.fileFailed"));
      }
      setPending(result.pending);
    });
  }

  function restoreWith(secret: BackupSecret) {
    if (!pending) return;
    void working(async () => {
      const result = await restoreBackupFile(pending.file, secret);
      if (!result.ok) return fail(result.error);
      setPending(null);
      setMessage(restoreSummary(result.report));
      notify(t("backup.restoredNotify"));
    });
  }

  function disable() {
    forgetBackupState();
    setDevice(null);
    setPending(null);
    setMessage("");
    setOverride(null);
    notify(t("backup.disabled"), "warn");
  }

  return (
    <CollapsibleCard
      id="settings-backup"
      title={t("backup.title")}
      icon={<Save />}
      summary={t("backup.summary")}
    >
      {phase === "off" ? <BackupOffView onEnable={startSetup} /> : null}

      {phase === "setup" ? (
        <BackupSetupView
          passkeyOk={passkeyOk}
          error={setupError}
          busy={busy}
          onPasskey={enableWithPasskey}
          onPassword={enableWithPassword}
          onCancel={abandon}
        />
      ) : null}

      {phase === "recovery" && prepared ? (
        <BackupRecoveryView
          words={prepared.words}
          acknowledged={acknowledged}
          error={setupError}
          busy={busy}
          onToggleAck={setAcknowledged}
          onConfirm={confirmRecovery}
          onCancel={abandon}
        />
      ) : null}

      {phase === "active" && device ? (
        <BackupActiveView
          lastSavedAt={device.lastSavedAt}
          saveCount={device.saveCount}
          hasPasskey={device.credentialId !== null}
          pending={pending}
          status={message}
          busy={busy}
          onSaveWithPasskey={() => {
            if (device.credentialId) saveNow({ kind: "passkey", credentialId: device.credentialId });
          }}
          onSaveWithPassword={(password) => saveNow({ kind: "password", password })}
          onChooseFile={chooseFile}
          onRestoreWithPasskey={() => {
            if (device.credentialId) restoreWith({ kind: "passkey", credentialId: device.credentialId });
          }}
          onRestoreWithPassword={(password) => restoreWith({ kind: "password", password })}
          onRestoreWithWords={(words) =>
            restoreWith({ kind: "recovery", words: words.split(/\s+/).filter(Boolean) })
          }
          onDisable={disable}
        />
      ) : null}

      {phase === "error" ? (
        <BackupErrorView
          message={message}
          onBack={() => {
            setMessage("");
            setOverride(null);
          }}
        />
      ) : null}
    </CollapsibleCard>
  );
}