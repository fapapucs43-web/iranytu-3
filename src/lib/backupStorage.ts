/**
 * The storage layer of opt-in encrypted cloud backup: the shape of the file,
 * the life of its data key, and the ways the file leaves and returns.
 *
 * THE FILE, FIELD BY FIELD
 * `v` is the format version. `createdAt`/`updatedAt` are plain epoch
 * milliseconds, deliberately readable without unlocking — a person looking at
 * a folder of copies can see which one is newer. `salt` is the per-account
 * KDF salt (32 bytes, hex), the one piece of non-secret state every non-PRF
 * derivation needs: the password path runs PBKDF2 over it and the recovery
 * code runs HKDF against it. The passkey path needs no stored salt, because
 * its salt is the constant `PRF_SALT` in backupKey — a constant is not a
 * secret and does not belong in a file. `wraps` holds the same data key
 * sealed under each enrolled KEK — any subset of passkey/password/recovery,
 * at least one — and `payload` is the bundle itself. Nothing here is
 * confidential: the file is meant to be dropped into any cloud drive.
 *
 * WHY `wraps` IS A SET OF NAMED SLOTS
 * The feature has three ways in — a passkey, a password, a recovery code —
 * and a file may be written with any subset of them: a browser without PRF
 * enrolls with a password, a passkey user gets the 12-word code as the
 * deliberate way back, and a cautious user may enroll both. One slot per
 * path lets a restore say exactly which secrets this file accepts
 * (`availableWraps`) instead of guessing, and adding a fourth path later is
 * an addition, not a migration. A reader ignores slot names it does not
 * know, so a newer file with a new kind still opens through the old ones.
 *
 * THE DATA KEY'S SHORT EXTRACTABLE LIFE
 * `sealBackupDek` generates the DEK extractable ONLY because `wrapKey` has
 * to read its bytes; it wraps that one instance under every KEK and then
 * re-imports the bytes through `unwrapKey`, which backupCrypto documents as
 * always returning a non-extractable key. The extractable instance is
 * dropped inside this module, so the key that encrypts bundles can never
 * leave the WebCrypto boundary — and the tests prove it by trying to export
 * the returned key and expecting the rejection.
 *
 * FOUR WAYS OUT, IN ORDER OF PREFERENCE
 * `saveBackupText` walks a chain the detected surface provides: (1) a File
 * System Access handle remembered from the last save, so a routine save does
 * not ask again; (2) the save picker; (3) the share sheet, which is how a
 * file reaches Files or Drive on iOS, where no picker exists; (4) an anchor
 * download, which works everywhere else. The chain distinguishes decisions
 * from accidents: a cancelled picker or a dismissed share sheet is the
 * user saying no and stops the chain, while a forgotten or failed handle
 * falls through to a fresh pick — the difference between "no" and "that
 * shortcut is gone". Tests drive the whole chain through the injected
 * surface; the real surface is thin, guarded, and never throws.
 *
 * WHAT THIS MODULE DOES NOT DO
 * It does not derive KEKs (backupKey and backupCrypto own that), it does not
 * decide what goes into the bundle, and it does not care how a KEK was
 * obtained. It receives keys, returns bytes, and every failure is a `null`
 * or a refusal value — the same contract as the modules under it. The one
 * piece of state it remembers (the File System Access handle, in IndexedDB)
 * is a convenience: losing it costs one extra picker, never a backup.
 */
import {
  decrypt,
  encrypt,
  isPayload,
  unwrapKey,
  wrapKey,
  type EncryptedPayload,
} from "./backupCrypto";
import { toISODate } from "./dates";
import { t } from "./i18n";

export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_FILE_PREFIX = "belso-iranytu-mentes";
export const BACKUP_FILE_MIME = "application/json";

const SALT_BYTES = 32;
const DEK_BITS = 256;

/** The unlock paths a file can carry. Order is the order of the format. */
export const BACKUP_WRAP_KINDS = ["passkey", "password", "recovery"] as const;
export type BackupWrapKind = (typeof BACKUP_WRAP_KINDS)[number];

/** One sealed copy of the data key per enrolled path; at least one is required. */
export type BackupWraps = Partial<Record<BackupWrapKind, EncryptedPayload>>;

export type BackupFile = {
  v: typeof BACKUP_FORMAT_VERSION;
  createdAt: number;
  updatedAt: number;
  /** PBKDF2/HKDF salt, `SALT_BYTES` bytes as hex — never a secret */
  salt: string;
  wraps: BackupWraps;
  /** the encrypted bundle */
  payload: EncryptedPayload;
};

/* ------------------------------- hex ----------------------------------- */

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

function isHex(value: unknown, bytes: number): value is string {
  return (
    typeof value === "string" &&
    value.length === bytes * 2 &&
    /^[0-9a-f]+$/.test(value)
  );
}

function isTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/* --------------------------- name and salt ----------------------------- */

/** A fresh per-account KDF salt for a new file. */
export function generateBackupSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_BYTES));
}

/**
 * The suggested filename: stable per day, so a routine re-save replaces the
 * day's copy instead of littering the folder with near-duplicates. The date
 * is local, from the same helper the rest of the app uses.
 */
export function backupFileName(now: Date = new Date()): string {
  return `${BACKUP_FILE_PREFIX}-${toISODate(now)}.json`;
}

/* --------------------------- serialize / parse ------------------------- */

export function serializeBackupFile(file: BackupFile): string {
  return JSON.stringify(file);
}

/**
 * Read a file back, or refuse it. Everything that is not unmistakably this
 * format in this version is a `null`: no guessing at half a header, because
 * a restore that half-succeeds is worse than one that cleanly refuses.
 * Unknown EXTRA fields are tolerated — a file written by a later minor
 * version must not be locked out by an older reader — but unknown wrap
 * kinds are skipped rather than rejected, and at least one known good wrap
 * must remain.
 */
export function parseBackupFile(text: unknown): BackupFile | null {
  if (typeof text !== "string") return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const candidate = raw as Record<string, unknown>;
  if (candidate.v !== BACKUP_FORMAT_VERSION) return null;
  if (!isTimestamp(candidate.createdAt) || !isTimestamp(candidate.updatedAt)) return null;
  if (!isHex(candidate.salt, SALT_BYTES)) return null;
  if (typeof candidate.wraps !== "object" || candidate.wraps === null) return null;
  const slots = candidate.wraps as Record<string, unknown>;
  const wraps: BackupWraps = {};
  for (const kind of BACKUP_WRAP_KINDS) {
    const wrapped = slots[kind];
    if (wrapped === undefined) continue;
    if (!isPayload(wrapped)) return null;
    wraps[kind] = wrapped;
  }
  if (Object.keys(wraps).length === 0) return null;
  if (!isPayload(candidate.payload)) return null;
  return {
    v: BACKUP_FORMAT_VERSION,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
    salt: candidate.salt,
    wraps,
    payload: candidate.payload,
  };
}

/** Which secrets this file accepts, in the format's stable order. */
export function availableWraps(file: BackupFile): BackupWrapKind[] {
  const wraps = file?.wraps;
  if (!wraps) return [];
  return BACKUP_WRAP_KINDS.filter((kind) => isPayload(wraps[kind]));
}

/* ----------------------------- the data key ---------------------------- */

export type BackupKeks = {
  passkey?: CryptoKey;
  password?: CryptoKey;
  recovery?: CryptoKey;
};

export type SealedBackup = { dek: CryptoKey; wraps: BackupWraps };

/**
 * Generate one data key, seal it under every KEK it was handed, and return
 * the non-extractable instance the caller will actually encrypt with. The
 * same instance is wrapped under each KEK, so every enrolled secret opens
 * the same bundle; the extractable original is never returned.
 */
export async function sealBackupDek(keks: BackupKeks): Promise<SealedBackup | null> {
  const kinds = BACKUP_WRAP_KINDS.filter((kind) => keks[kind] !== undefined);
  if (kinds.length === 0) return null;
  try {
    const extractable = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: DEK_BITS },
      true,
      ["encrypt", "decrypt"],
    );
    const wraps: BackupWraps = {};
    for (const kind of kinds) {
      const kek = keks[kind];
      if (!kek) return null;
      const wrapped = await wrapKey(extractable, kek);
      if (!wrapped) return null;
      wraps[kind] = wrapped;
    }
    const firstKek = keks[kinds[0]];
    if (!firstKek) return null;
    const dek = await unwrapKey(wraps[kinds[0]], firstKek);
    if (!dek) return null;
    return { dek, wraps };
  } catch {
    return null;
  }
}

/* --------------------------- create / read / update -------------------- */

export type CreatedBackup = { file: BackupFile; dek: CryptoKey };
export type OpenedBackup = { dek: CryptoKey; bundle: string };

/**
 * Seal a bundle into a fresh file: a new DEK wrapped under the given KEKs,
 * a fresh salt, and the bundle encrypted under the DEK. This is both the
 * first save and the whole of a rotation — rotating means writing a new
 * file around the same bundle, never growing the old one a new secret.
 */
export async function createBackupFile(options: {
  bundle: string;
  keks: BackupKeks;
  salt: Uint8Array;
  now?: number;
}): Promise<CreatedBackup | null> {
  const { bundle, keks, salt } = options;
  const now = options.now ?? Date.now();
  if (typeof bundle !== "string") return null;
  if (!(salt instanceof Uint8Array) || salt.length !== SALT_BYTES) return null;
  const sealed = await sealBackupDek(keks);
  if (!sealed) return null;
  const payload = await encrypt(bundle, sealed.dek);
  if (!payload) return null;
  return {
    dek: sealed.dek,
    file: {
      v: BACKUP_FORMAT_VERSION,
      createdAt: now,
      updatedAt: now,
      salt: toHex(salt),
      wraps: sealed.wraps,
      payload,
    },
  };
}

/**
 * Open a file with one secret. The caller says which slot the secret
 * belongs to — the UI knows whether it collected a passkey, a password or
 * twelve words — and gets the bundle plus the working DEK, or a `null`.
 */
export async function readBackupFile(
  file: BackupFile,
  kind: BackupWrapKind,
  kek: CryptoKey | null,
): Promise<OpenedBackup | null> {
  if (!kek) return null;
  const wrapped = file?.wraps?.[kind];
  if (!isPayload(wrapped)) return null;
  const dek = await unwrapKey(wrapped, kek);
  if (!dek) return null;
  const bundle = await decrypt(file.payload, dek);
  if (bundle === null) return null;
  return { dek, bundle };
}

/**
 * Re-seal a changed bundle under the SAME header: the wraps, salt and
 * createdAt stay untouched, `updatedAt` moves, and a fresh IV makes the new
 * payload a different ciphertext from the old one.
 */
export async function updateBackupFile(
  file: BackupFile,
  dek: CryptoKey,
  bundle: string,
  now = Date.now(),
): Promise<BackupFile | null> {
  const payload = await encrypt(bundle, dek);
  if (!payload) return null;
  return { ...file, updatedAt: now, payload };
}

/* ------------------------------ the surface ---------------------------- */

/** A destination one save can be written through. */
export type BackupSink = { write: (text: string) => Promise<boolean> };

/** A chosen file one restore can be read through. */
export type BackupSource = { read: () => Promise<string | null>; name?: string | null };

/**
 * The narrow part of the browser this module uses, as a value. The real one
 * is what `detectBackupIo` builds; tests pass fakes, exactly as the WebAuthn
 * surface is faked in backupKey.
 */
export type BackupIo = {
  /** A destination remembered from a previous save (a File System handle). */
  rememberedSink: (() => Promise<BackupSink | null>) | null;
  /** A destination from the save picker; `null` means the user cancelled. */
  chooseSink: ((suggestedName: string) => Promise<BackupSink | null>) | null;
  /** A file from the open picker or a file input; `null` means cancelled. */
  chooseSource: (() => Promise<BackupSource | null>) | null;
  /** The share sheet; `false` means it could not or did not share. */
  share: ((name: string, text: string) => Promise<boolean>) | null;
  /** The last resort, always present: an anchor download. */
  download: (name: string, text: string) => void;
};

export type SaveVia = "handle" | "picker" | "share" | "download";
export type SaveOutcome =
  | { ok: true; via: SaveVia }
  | { ok: false; cancelled: boolean; error?: string };

export type OpenOutcome =
  | { ok: true; text: string; name: string | null }
  | { ok: false; cancelled: boolean; error?: string };

// Round 18 moved all four into the catalogue. `READ_FAILED` resolves to
// `backup.noSource` rather than to a key of its own: the backup card has shipped
// that exact sentence since the encrypted backup landed, and two keys holding
// one sentence is how a translation drifts apart from itself.
const WRITE_FAILED = t("backup.writeFailed");
const READ_FAILED = t("backup.noSource");
const NO_SOURCE = t("backup.pickerMissing");

function errorText(error: unknown): string {
  const name =
    typeof DOMException !== "undefined" && error instanceof DOMException
      ? error.name
      : (error as { name?: string } | null)?.name;
  if (name === "NotAllowedError" || name === "SecurityError") {
    return t("backup.notAllowed");
  }
  return t("backup.ioFailed");
}

/**
 * Walk the save chain. A remembered handle is tried first; anything short of
 * a successful write there falls through to the picker, because a handle can
 * be stale and a stale shortcut must not sink the save. Once the picker or
 * the share sheet has been shown, its answer is final: a cancel is a
 * decision, not a reason to quietly download instead.
 */
export async function saveBackupText(
  text: string,
  name: string,
  io: BackupIo = detectBackupIo(),
): Promise<SaveOutcome> {
  if (io.rememberedSink) {
    try {
      const remembered = await io.rememberedSink();
      if (remembered && (await remembered.write(text))) return { ok: true, via: "handle" };
    } catch {
      /* the shortcut is gone; a fresh destination is the answer */
    }
  }
  if (io.chooseSink) {
    let sink: BackupSink | null = null;
    try {
      sink = await io.chooseSink(name);
    } catch (error) {
      return { ok: false, cancelled: false, error: errorText(error) };
    }
    if (!sink) return { ok: false, cancelled: true };
    try {
      return (await sink.write(text))
        ? { ok: true, via: "picker" }
        : { ok: false, cancelled: false, error: WRITE_FAILED };
    } catch {
      return { ok: false, cancelled: false, error: WRITE_FAILED };
    }
  }
  if (io.share) {
    try {
      return (await io.share(name, text))
        ? { ok: true, via: "share" }
        : { ok: false, cancelled: true };
    } catch {
      /* a share sheet that throws is a share sheet the user closed */
      return { ok: false, cancelled: true };
    }
  }
  io.download(name, text);
  return { ok: true, via: "download" };
}

/** Pick a file and read it whole. */
export async function openBackupText(io: BackupIo = detectBackupIo()): Promise<OpenOutcome> {
  if (!io.chooseSource) return { ok: false, cancelled: false, error: NO_SOURCE };
  let source: BackupSource | null = null;
  try {
    source = await io.chooseSource();
  } catch (error) {
    return { ok: false, cancelled: false, error: errorText(error) };
  }
  if (!source) return { ok: false, cancelled: true };
  try {
    const text = await source.read();
    if (typeof text !== "string") return { ok: false, cancelled: false, error: READ_FAILED };
    return { ok: true, text, name: source.name ?? null };
  } catch (error) {
    return { ok: false, cancelled: false, error: errorText(error) };
  }
}

/* --------------------------- the real surface -------------------------- */

const IDB_NAME = "belso-iranytu-backup";
const IDB_STORE = "handles";
const IDB_KEY = "last-save";

/**
 * The File System Access types are absent from TypeScript 5.6's lib.dom
 * (`showSaveFilePicker` appears zero times there), so the pickers arrive by
 * cast. The handle members come with them; `queryPermission` is deliberately
 * optional because it is the newest of the lot and an old browser exposing
 * the handle without it must still work.
 */
type FsaWritable = { write: (text: string) => Promise<void>; close: () => Promise<void> };
type FsaHandle = {
  name?: string;
  createWritable?: () => Promise<FsaWritable>;
  getFile?: () => Promise<{ text: () => Promise<string> }>;
  queryPermission?: (options: { mode: "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (options: { mode: "readwrite" }) => Promise<PermissionState>;
};
type FsaWindow = {
  showSaveFilePicker?: (options: Record<string, unknown>) => Promise<FsaHandle>;
  showOpenFilePicker?: (options: Record<string, unknown>) => Promise<FsaHandle[]>;
};

function openHandleDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const request = indexedDB.open(IDB_NAME, 1);
      request.onupgradeneeded = () => {
        try {
          request.result.createObjectStore(IDB_STORE);
        } catch {
          /* the store exists — a fresh open, not a first one */
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function withHandleStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return openHandleDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        const finish = (value: T | null) => {
          try {
            db.close();
          } catch {
            /* noop */
          }
          resolve(value);
        };
        try {
          const request = run(db.transaction(IDB_STORE, mode).objectStore(IDB_STORE));
          request.onsuccess = () => finish((request.result as T | undefined) ?? null);
          request.onerror = () => finish(null);
        } catch {
          finish(null);
        }
      }),
  );
}

/** Persist the handle so tomorrow's save does not need the picker again. */
async function rememberHandle(handle: unknown): Promise<void> {
  try {
    await withHandleStore("readwrite", (store) => store.put(handle, IDB_KEY));
  } catch {
    /* remembering is a convenience, never a guarantee */
  }
}

async function loadHandle(): Promise<unknown | null> {
  try {
    return await withHandleStore<unknown>("readonly", (store) => store.get(IDB_KEY));
  } catch {
    return null;
  }
}

function sinkFor(handle: FsaHandle): BackupSink | null {
  const createWritable = handle?.createWritable;
  if (typeof createWritable !== "function") return null;
  return {
    write: async (text) => {
      try {
        const writable = await createWritable();
        await writable.write(text);
        await writable.close();
        await rememberHandle(handle);
        return true;
      } catch {
        return false;
      }
    },
  };
}

/**
 * The remembered handle, but only if the browser still lets this origin
 * write to it. `prompt` is not good enough to assume: it is asked for, and
 * a refusal is a `null` — the picker path will re-offer the same file.
 */
async function loadRememberedSink(): Promise<BackupSink | null> {
  const handle = (await loadHandle()) as FsaHandle | null;
  if (!handle) return null;
  try {
    if (typeof handle.queryPermission === "function") {
      const state = await handle.queryPermission({ mode: "readwrite" });
      if (state === "granted") return sinkFor(handle);
      if (state === "denied") return null;
    }
    if (typeof handle.requestPermission === "function") {
      const state = await handle.requestPermission({ mode: "readwrite" });
      if (state === "granted") return sinkFor(handle);
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * The fallback for browsers without the File System Access pickers — Safari
 * and Firefox have no `showOpenFilePicker`, but every browser has a file
 * input. Saving on those platforms goes through the share sheet or a
 * download; opening comes through here.
 */
function inputSource(): Promise<BackupSource | null> {
  if (typeof document === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,application/json";
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return resolve(null);
        resolve({
          name: file.name,
          read: async () => {
            try {
              return await file.text();
            } catch {
              return null;
            }
          },
        });
      };
      // `cancel` fires when the dialog is dismissed without a choice; it is
      // recent enough to attach defensively rather than assume.
      (input as unknown as { oncancel?: () => void }).oncancel = () => resolve(null);
      input.click();
    } catch {
      resolve(null);
    }
  });
}

function downloadText(name: string, text: string): void {
  if (typeof document === "undefined") return;
  try {
    const blob = new Blob([text], { type: BACKUP_FILE_MIME });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    // Revoking synchronously can cancel the download in some browsers; the
    // URL is small enough to let the deferred revoke be the last word.
    setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* noop */
      }
    }, 10_000);
  } catch {
    /* nothing left to try */
  }
}

const PICKER_TYPES = [
  { description: t("backup.pickerDescription"), accept: { "application/json": [".json"] } },
];

/** Build the surface every ceremony defaults to; tests pass fakes instead. */
export function detectBackupIo(): BackupIo {
  const win = typeof window !== "undefined" ? (window as unknown as FsaWindow) : null;
  const savePicker = typeof win?.showSaveFilePicker === "function" ? win.showSaveFilePicker : null;
  const openPicker = typeof win?.showOpenFilePicker === "function" ? win.showOpenFilePicker : null;
  const canShare =
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function";

  return {
    rememberedSink: savePicker ? loadRememberedSink : null,
    chooseSink: savePicker
      ? async (suggestedName) => {
          try {
            const handle = await savePicker({
              suggestedName,
              types: PICKER_TYPES,
            });
            return sinkFor(handle);
          } catch {
            return null; // a cancelled picker rejects; that is an answer
          }
        }
      : null,
    chooseSource: openPicker
      ? async () => {
          try {
            const handles = await openPicker({ multiple: false, types: PICKER_TYPES });
            const handle = handles?.[0];
            const getFile = handle?.getFile;
            if (!handle || typeof getFile !== "function") return null;
            return {
              name: handle.name ?? null,
              read: async () => {
                try {
                  return await (await getFile()).text();
                } catch {
                  return null;
                }
              },
            };
          } catch {
            return null;
          }
        }
      : inputSource,
    share: canShare
      ? async (name, text) => {
          try {
            const file = new File([text], name, { type: BACKUP_FILE_MIME });
            if (!navigator.canShare({ files: [file] })) return false;
            await navigator.share({ files: [file], title: name });
            return true;
          } catch {
            return false;
          }
        }
      : null,
    download: downloadText,
  };
}
