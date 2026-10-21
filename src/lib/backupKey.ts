/**
 * The passkey layer of opt-in encrypted cloud backup.
 *
 * WHY A PASSKEY HERE IS A KEY SOURCE, NOT A LOGIN
 * A WebAuthn "PRF" (pseudo-random function) extension makes the authenticator
 * evaluate a secret over an app-supplied salt, and the result is stable for
 * that credential — a 32-byte secret that never leaves the device. There is
 * no server to log into; the passkey's only job is to produce that secret,
 * and `backupCrypto`'s HKDF turns it into the key that wraps the backup's
 * data key. Enrolling is two ceremonies on purpose: `create()` only reports
 * whether PRF is available (`prf.enabled`), while an assertion is what
 * actually carries the output (`prf.results.first`), so registration follows
 * create with a get.
 *
 * THE PASSWORD FALLBACK
 * Not every authenticator implements PRF, and a user without one still needs
 * a way back into their own backup. The fallback runs PBKDF2-SHA256 over the
 * password (600 000 iterations over a random per-account salt) and feeds the
 * result through the same HKDF core with a different `info`, so a password
 * KEK and a passkey KEK are different keys even if their input bytes matched.
 *
 * WHAT IS FIXED, AND WHY THE TESTS PIN IT
 * `PRF_SALT` and the three `info` strings are constants — not secrets, but the
 * domain this app's keys live in. Changing any of them changes every derived
 * key, which would make every existing backup unreadable, so the test suite
 * pins all four byte for byte rather than trusting anyone's memory.
 *
 * WHAT THIS MODULE DOES NOT DO
 * It stores nothing: the credential id it returns is device-local state, and
 * persisting it is the orchestration's job. Nothing here touches
 * localStorage, IndexedDB or the network. The ceremonies are deliberately
 * thin — build the options, call the surface, read the result — and the
 * options builders and result readers are pure, so the parts that carry
 * decisions are driven directly by the tests. The WebAuthn surface is a
 * parameter with the real `navigator.credentials` as its default, which is
 * how a DOM-free test can exercise registration, unlock and every refusal
 * without patching globals.
 *
 * TypeScript 5.6's `lib.dom` predates the PRF extension types, so the two
 * `extensions` objects are cast at the one place they are built. A global
 * augmentation would collide the day lib.dom catches up; the cast will be
 * removable then, and this note is why it will be easy to find.
 *
 * Errors are Hungarian because they surface in the UI, and results are
 * discriminated unions because that is the house style (appLock's PinResult);
 * no ceremony failure ever throws.
 */
import { deriveKeyFromPasskey, deriveKeyFromRecovery } from "./backupCrypto";
import { t } from "./i18n";

export const PASSKEY_INFO = "iranytu-backup/passkey/v1";
export const PASSWORD_INFO = "iranytu-backup/password/v1";
export const RECOVERY_INFO = "iranytu-backup/recovery/v1";
export const PASSWORD_ITERATIONS = 600_000;

/**
 * The app's PRF salt. A constant rather than a per-account secret because
 * WebAuthn already scopes the credential to this origin — another site
 * cannot ask this authenticator for this evaluation — and a constant needs
 * no local state, which keeps restore's whole input to "the file plus the
 * authenticator". Its exact bytes are pinned by the tests.
 */
export const PRF_SALT = new TextEncoder().encode("iranytu-backup-prf-salt-v1------");

/** PRF output is 32 bytes by definition; anything else is not a PRF output. */
const PRF_OUTPUT_BYTES = 32;
/**
 * The password floor, exported because the settings card shows it as the
 * field's placeholder. A second copy of the number in the UI would be a rule
 * that can disagree with this one — and would disagree by lying, since the
 * card is the only place the user reads it before typing.
 */
export const PASSWORD_MIN_LENGTH = 10;
const CEREMONY_TIMEOUT_MS = 60_000;

// The twelve user-facing sentences this module used to own as module constants
// now live in the catalogue, as `backup.passkey*`, `backup.passwordTooSimple`
// and `backup.passwordTooShort`. They were the last strings in this file, and
// they were the reason it was listed as unextracted: they are returned from
// inside a WebAuthn ceremony or a password check, not rendered by a card, so
// no component could reach them.
//
// `t()` runs at module load, as it did for the constants before it, rather than
// at each use site. That is a fair trade while `t()` defaults to Hungarian and
// nothing reads the browser: the value is identical, and if a locale ever does
// reach this layer, these five become function calls — five lines, in this one
// file.
//
// What did NOT move: PASSKEY_INFO, PASSWORD_INFO, RECOVERY_INFO and PRF_SALT
// are HKDF context strings and key-material labels. They are bytes, not prose,
// and translating them would change derived keys.
const RP_NAME = t("backup.passkeyRpName");
const UNSUPPORTED = t("backup.passkeyUnsupported");
const NO_PRF = t("backup.passkeyNoPrf");
const CREATE_FAILED = t("backup.passkeyCreateFailed");
const INVALID_ID = t("backup.passkeyInvalidId");

export type PasskeyResult =
  | { ok: true; credentialId: string; prfOutput: Uint8Array }
  | { ok: false; error: string };

/**
 * The part of `navigator.credentials` this module uses, as a value. The real
 * one is the default of every ceremony; tests pass fakes.
 */
export type WebAuthnSurface = {
  create: (options: CredentialCreationOptions) => Promise<unknown>;
  get: (options: CredentialRequestOptions) => Promise<unknown>;
};

/* ------------------------------ hex utils ------------------------------ */

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

function fromHex(hex: string): Uint8Array | null {
  if (hex.length === 0 || hex.length % 2 !== 0) return null;
  if (!/^[0-9a-f]*$/.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/* ----------------------------- capability ------------------------------ */

/** The real WebAuthn surface, or null where the browser does not have one. */
export function detectWebAuthnSurface(): WebAuthnSurface | null {
  if (typeof navigator === "undefined") return null;
  const credentials = navigator.credentials;
  if (!credentials || typeof credentials.create !== "function" || typeof credentials.get !== "function") return null;
  if (typeof PublicKeyCredential === "undefined") return null;
  return {
    create: (options) => credentials.create(options),
    get: (options) => credentials.get(options),
  };
}

/** Whether the passkey path can be offered at all (the password path always can). */
export function isPasskeySupported(): boolean {
  return detectWebAuthnSurface() !== null;
}

/* --------------------------- option builders --------------------------- */

export function buildCreationOptions(
  userId: Uint8Array,
  userName: string,
  challenge: Uint8Array,
): PublicKeyCredentialCreationOptions {
  return {
    challenge,
    rp: { name: RP_NAME }, // rp.id is left to the origin: localhost and the deployed domain differ
    user: { id: userId, name: userName, displayName: userName },
    pubKeyCredParams: [
      { type: "public-key", alg: -7 }, // ES256
      { type: "public-key", alg: -257 }, // RS256
    ],
    authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
    attestation: "none",
    timeout: CEREMONY_TIMEOUT_MS,
    extensions: { prf: {} } as AuthenticationExtensionsClientInputs,
  };
}

/** Null for a credential id that is not hex of at least one byte. */
export function buildRequestOptions(
  credentialIdHex: string,
  challenge: Uint8Array,
): PublicKeyCredentialRequestOptions | null {
  const id = fromHex(credentialIdHex);
  if (!id) return null;
  return {
    challenge,
    allowCredentials: [{ type: "public-key", id }],
    userVerification: "required",
    timeout: CEREMONY_TIMEOUT_MS,
    extensions: { prf: { eval: { first: PRF_SALT } } } as AuthenticationExtensionsClientInputs,
  };
}

/* --------------------------- result readers ---------------------------- */

/** The credential's raw id as hex, or null for anything that is not one. */
export function readCredentialId(credential: unknown): string | null {
  const raw = (credential as { rawId?: unknown } | null)?.rawId;
  if (raw instanceof Uint8Array && raw.length > 0) return toHex(raw);
  if (raw instanceof ArrayBuffer && raw.byteLength > 0) return toHex(new Uint8Array(raw));
  return null;
}

/**
 * The PRF output from an assertion, or null. Exact-length is deliberate: a
 * truncated or padded result is not something to feed into HKDF and hope.
 * The returned array is a copy — the caller's buffer is never aliased.
 */
export function readPrfOutput(credential: unknown): Uint8Array | null {
  const holder = credential as { getClientExtensionResults?: unknown } | null;
  if (typeof holder?.getClientExtensionResults !== "function") return null;
  let results: unknown;
  try {
    results = (holder.getClientExtensionResults as () => unknown).call(credential);
  } catch {
    return null;
  }
  const first =
    (results as { prf?: { results?: { first?: unknown } } } | null)?.prf?.results?.first;
  const bytes = first instanceof Uint8Array ? first : first instanceof ArrayBuffer ? new Uint8Array(first) : null;
  if (!bytes || bytes.length !== PRF_OUTPUT_BYTES) return null;
  return new Uint8Array(bytes);
}

/* ------------------------------ ceremonies ----------------------------- */

function ceremonyError(error: unknown): string {
  const name =
    typeof DOMException !== "undefined" && error instanceof DOMException
      ? error.name
      : (error as { name?: string } | null)?.name;
  switch (name) {
    case "NotAllowedError":
      return t("backup.passkeyAborted");
    case "NotSupportedError":
      return t("backup.passkeyUnsupportedDevice");
    case "InvalidStateError":
      return t("backup.passkeyAlreadyRegistered");
    case "SecurityError":
      return t("backup.passkeyInsecureContext");
    default:
      return t("backup.passkeyFailed");
  }
}

async function requestPrfOutput(credentialIdHex: string, surface: WebAuthnSurface): Promise<PasskeyResult> {
  const options = buildRequestOptions(credentialIdHex, crypto.getRandomValues(new Uint8Array(32)));
  if (!options) return { ok: false, error: INVALID_ID };
  try {
    const assertion = await surface.get({ publicKey: options });
    const prfOutput = readPrfOutput(assertion);
    if (!prfOutput) return { ok: false, error: NO_PRF };
    return { ok: true, credentialId: readCredentialId(assertion) ?? credentialIdHex, prfOutput };
  } catch (error) {
    return { ok: false, error: ceremonyError(error) };
  }
}

/**
 * Register a new passkey and bring back its PRF output. The user id is fresh
 * per registration on purpose: a random one cannot replace an existing
 * credential, and nothing needs it afterwards — unlock addresses the
 * credential by its id.
 */
export async function createBackupPasskey(
  userName: string,
  surface: WebAuthnSurface | null = detectWebAuthnSurface(),
): Promise<PasskeyResult> {
  if (!surface) return { ok: false, error: UNSUPPORTED };
  const name = userName.trim() || RP_NAME;
  try {
    const credential = await surface.create({
      publicKey: buildCreationOptions(
        crypto.getRandomValues(new Uint8Array(16)),
        name,
        crypto.getRandomValues(new Uint8Array(32)),
      ),
    });
    const credentialId = readCredentialId(credential);
    if (!credentialId) return { ok: false, error: CREATE_FAILED };
    return await requestPrfOutput(credentialId, surface);
  } catch (error) {
    return { ok: false, error: ceremonyError(error) };
  }
}

/** The unlock half: a fresh assertion for a known credential, yielding the same PRF output. */
export async function unlockWithPasskey(
  credentialIdHex: string,
  surface: WebAuthnSurface | null = detectWebAuthnSurface(),
): Promise<PasskeyResult> {
  if (!surface) return { ok: false, error: UNSUPPORTED };
  return requestPrfOutput(credentialIdHex, surface);
}

/* ----------------------------- derivations ----------------------------- */

/** The password policy, as a message or null — the UI decides how to show it. */
export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return t("backup.passwordTooShort", { min: PASSWORD_MIN_LENGTH });
  }
  if (new Set(password).size === 1) return t("backup.passwordTooSimple");
  return null;
}

/**
 * PRF output → the passkey KEK. Exactly the PRF output size is accepted; the
 * fixed app salt and the passkey `info` are applied here so no caller has to
 * remember them.
 */
export async function deriveBackupKekFromPrf(prfOutput: Uint8Array): Promise<CryptoKey | null> {
  if (!(prfOutput instanceof Uint8Array) || prfOutput.length !== PRF_OUTPUT_BYTES) return null;
  return deriveKeyFromPasskey(prfOutput, PRF_SALT, PASSKEY_INFO);
}

/**
 * The twelve words → the recovery KEK, over the FILE's salt, exactly as the
 * password path is. That is what makes a restore on a device that has never
 * seen this account possible at all: the only inputs are the words and the
 * salt the file carries. Placed beside the other two derivations rather than
 * left to a caller, because `deriveKeyFromRecovery` takes an `info` argument
 * and a caller who reaches for the passkey one would silently open nothing —
 * domain separation by accident is indistinguishable from a wrong password.
 */
export async function deriveBackupKekFromRecovery(
  entropy: Uint8Array,
  salt: Uint8Array,
): Promise<CryptoKey | null> {
  if (!(entropy instanceof Uint8Array)) return null;
  if (!(salt instanceof Uint8Array) || salt.length === 0) return null;
  return deriveKeyFromRecovery(entropy, salt, RECOVERY_INFO);
}

/**
 * Password → the fallback KEK: PBKDF2-SHA256 over the account's random salt,
 * then the same HKDF core with the password `info`. The password itself is
 * never stored anywhere; only its derivation's salt belongs in the backup
 * file, and that is the orchestration's business.
 */
export async function deriveBackupKekFromPassword(
  password: string,
  salt: Uint8Array,
): Promise<CryptoKey | null> {
  if (password.length === 0) return null;
  if (!(salt instanceof Uint8Array) || salt.length === 0) return null;
  try {
    const material = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: PASSWORD_ITERATIONS, hash: "SHA-256" },
      material,
      256,
    );
    return await deriveKeyFromPasskey(new Uint8Array(bits), PRF_SALT, PASSWORD_INFO);
  } catch {
    return null;
  }
}
