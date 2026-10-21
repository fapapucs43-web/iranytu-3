/**
 * The crypto core of opt-in encrypted cloud backup.
 *
 * Pure, DOM-free and storage-free: bytes in, bytes or CryptoKeys out. That is
 * not an aesthetic choice — it is why the whole module is testable under
 * `bun test` with no browser, no mocks and no fixtures, and why every commit
 * that follows this one can stay thin.
 *
 * THE SHAPE OF THE SECRET ("wrapped key", user-approved)
 * One random data key (DEK) encrypts the backup. The file carries the DEK
 * TWICE-WRAPPED: once under a key derived from the passkey's PRF output, once
 * under a key derived from the 12-word recovery code. Restoring therefore
 * needs the file PLUS either secret — the recovery code is not a wrapper
 * around the passkey and the passkey is not a wrapper around the code, so
 * either one opens the backup, and losing both loses it. That trade is the
 * whole design, and it is written down because it is the one thing a reader
 * cannot infer from the code below.
 *
 * NON-EXTRACTABLE, AND WHERE THE ONE EXCEPTION IS
 * Both KEKs are derived with `extractable: false`, so their raw bytes cannot
 * leave the WebCrypto boundary: no code path, this module included, can print
 * them or persist them. The DEK is the deliberate exception, and only because
 * `wrapKey` has to read its bytes to seal them. The orchestration that lands
 * with Commit 3 generates the DEK extractable, wraps it under both KEKs, and
 * then re-imports the unwrapped bytes as a SECOND key with `extractable:
 * false`; the key that actually encrypts entries is the non-extractable one,
 * and the extractable instance is dropped. `unwrapKey` here always returns
 * that non-extractable form.
 *
 * DOMAIN SEPARATION
 * `deriveKeyFromPasskey` and `deriveKeyFromRecovery` share one HKDF core and
 * differ only in the caller's `info`. Callers MUST pass different strings
 * (the orchestration uses `iranytu-backup/passkey/v1` and
 * `iranytu-backup/recovery/v1`), and the tests prove that identical input
 * bytes under different `info` produce keys that cannot open each other's
 * payloads.
 *
 * THE RECOVERY CODE'S ARITHMETIC, SPELLED OUT
 * The wordlist is 1024 entries, so an index is 10 bits, and twelve words are
 * 120 bits. The last four bits are a checksum, so 116 bits are secret — far
 * past brute force. The checksum is a typo-catcher, not integrity: a mistyped
 * word is refused before HKDF ever runs, and AES-GCM is what protects the
 * file itself. "Canonical entropy" is fifteen bytes whose final nibble is
 * reserved and zero; `entropyToWords` ignores the nibble it is given,
 * `wordsToEntropy` returns it zeroed, and `deriveKeyFromRecovery` normalises
 * it again, so all three agree about which 116 bits the code names.
 *
 * NOTHING THROWS
 * Wrong key, tampered ciphertext, truncated envelope, unknown version, bad
 * hex, wrong word count, unknown word: every one of them is a `null`, never
 * an exception. That is the same contract appLock.ts follows for the PIN, and
 * for the same reason — a backup that half-succeeds is worse than one that
 * cleanly refuses.
 */
import { BACKUP_WORDS, BACKUP_WORD_COUNT } from "./backupWordlist";

export type EncryptedPayload = {
  /** envelope version — bump only with a migration, never as a silent change */
  v: 1;
  /** the AES-GCM nonce, 12 bytes, hex */
  iv: string;
  /** ciphertext including its 16-byte GCM tag, hex */
  ciphertext: string;
};

const HKDF_HASH = "SHA-256";
const KEY_BITS = 256;
const IV_BYTES = 12;

/** 15 bytes = 120 bits = twelve 10-bit words: 116 secret bits + a 4-bit checksum. */
const ENTROPY_BYTES = 15;
const WORD_COUNT = 12;
const BITS_PER_WORD = 10;
const CHECKSUM_BITS = 4;

/* ------------------------------- hex ---------------------------------- */

function toHex(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out = "";
  for (const b of view) out += b.toString(16).padStart(2, "0");
  return out;
}

function fromHex(hex: unknown): Uint8Array | null {
  if (typeof hex !== "string" || hex.length % 2 !== 0) return null;
  if (!/^[0-9a-f]*$/.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/* --------------------------- key derivation --------------------------- */

/**
 * HKDF-SHA256 → a non-extractable AES-GCM-256 key. The one place key
 * material is made; both public derivations are this with a different `info`.
 */
async function deriveKek(ikm: Uint8Array, salt: Uint8Array, info: string): Promise<CryptoKey | null> {
  try {
    // importKey refuses an empty secret with a DataError; refuse it as data
    // instead, so the caller's failure is still a null and not an exception.
    if (ikm.length === 0) return null;
    const base = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveKey"]);
    return await crypto.subtle.deriveKey(
      { name: "HKDF", hash: HKDF_HASH, salt, info: new TextEncoder().encode(info) },
      base,
      { name: "AES-GCM", length: KEY_BITS },
      false,
      ["encrypt", "decrypt"],
    );
  } catch {
    return null;
  }
}

/** The wrapping key the passkey step's PRF output yields. */
export async function deriveKeyFromPasskey(
  prfOutput: Uint8Array,
  salt: Uint8Array,
  info: string,
): Promise<CryptoKey | null> {
  return deriveKek(prfOutput, salt, info);
}

/** The wrapping key the 12-word code yields. `entropy` comes from `wordsToEntropy` or `generateRecoveryEntropy`. */
export async function deriveKeyFromRecovery(
  entropy: Uint8Array,
  salt: Uint8Array,
  info: string,
): Promise<CryptoKey | null> {
  const canonical = canonicalEntropy(entropy);
  return canonical ? deriveKek(canonical, salt, info) : null;
}

/* ----------------------------- seal / open ----------------------------- */

async function seal(bytes: Uint8Array, key: CryptoKey): Promise<EncryptedPayload | null> {
  try {
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes);
    return { v: 1, iv: toHex(iv), ciphertext: toHex(ciphertext) };
  } catch {
    return null;
  }
}

/** Structural check of an envelope, before any crypto touches it. */
export function isPayload(payload: unknown): payload is EncryptedPayload {
  if (typeof payload !== "object" || payload === null) return false;
  const p = payload as Record<string, unknown>;
  if (p.v !== 1) return false;
  if (typeof p.iv !== "string" || p.iv.length !== IV_BYTES * 2) return false;
  // 16 bytes is the GCM tag alone; anything shorter cannot be a real envelope.
  if (typeof p.ciphertext !== "string" || p.ciphertext.length < 32) return false;
  return fromHex(p.iv) !== null && fromHex(p.ciphertext) !== null;
}

async function open(payload: unknown, key: CryptoKey): Promise<Uint8Array | null> {
  if (!isPayload(payload)) return null;
  const iv = fromHex(payload.iv);
  const ciphertext = fromHex(payload.ciphertext);
  if (!iv || !ciphertext) return null;
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext));
  } catch {
    return null; // wrong key, tampered bytes, a bad tag — all the same answer
  }
}

/** Encrypt a string with a fresh 12-byte IV per call. */
export async function encrypt(plaintext: string, key: CryptoKey): Promise<EncryptedPayload | null> {
  return seal(new TextEncoder().encode(plaintext), key);
}

/** Decrypt an envelope, or `null`. Never throws, whatever the payload is. */
export async function decrypt(payload: unknown, key: CryptoKey): Promise<string | null> {
  const bytes = await open(payload, key);
  // The emptiness check is on the Uint8Array, not its length: an encrypted
  // empty string decrypts to a zero-length buffer and is still a success.
  if (!bytes) return null;
  return new TextDecoder().decode(bytes);
}

/* ---------------------------- key wrapping ----------------------------- */

/**
 * Wrap a key under another key. The input must be extractable — the DEK is
 * the one that is, and only for as long as it takes to seal its bytes.
 */
export async function wrapKey(key: CryptoKey, wrappingKey: CryptoKey): Promise<EncryptedPayload | null> {
  try {
    const raw = await crypto.subtle.exportKey("raw", key);
    return await seal(new Uint8Array(raw), wrappingKey);
  } catch {
    return null; // non-extractable input, or an unusable wrapping key
  }
}

/** Unwrap into a fresh NON-extractable AES-GCM key, or `null`. */
export async function unwrapKey(wrapped: unknown, wrappingKey: CryptoKey): Promise<CryptoKey | null> {
  const raw = await open(wrapped, wrappingKey);
  if (!raw || raw.length !== KEY_BITS / 8) return null;
  try {
    return await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  } catch {
    return null;
  }
}

/* ---------------------------- recovery code ---------------------------- */

/**
 * Four bits over 116, by XOR-folding every byte and then the fold's own two
 * nibbles. This is a transcription check, not a MAC: it exists so a single
 * mistyped word is refused before HKDF runs — a wrong word changes the fold
 * fifteen times out of sixteen — and the GCM tag is what makes the file
 * tamper-proof. It is computed over canonical entropy only, whose reserved
 * nibble is zero, so it is exactly a function of the 116 secret bits.
 */
function checksum4(canonical: Uint8Array): number {
  let fold = 0;
  for (const b of canonical) fold ^= b;
  return (fold ^ (fold >> 4)) & 0xf;
}

/**
 * A copy of `entropy` with the reserved nibble cleared, or null when the
 * buffer is not the one size this module understands. Copying is deliberate:
 * a caller's buffer is never mutated, and the returned value is always in
 * canonical form "the final nibble is zero".
 */
function canonicalEntropy(entropy: Uint8Array): Uint8Array | null {
  if (!(entropy instanceof Uint8Array) || entropy.length !== ENTROPY_BYTES) return null;
  const copy = new Uint8Array(entropy);
  copy[ENTROPY_BYTES - 1] &= 0xf0;
  return copy;
}

/** MSB-first bit reader over the 120-bit packing. */
function readBits(bytes: Uint8Array, start: number, count: number): number {
  let value = 0;
  for (let i = 0; i < count; i++) {
    const bit = start + i;
    value = (value << 1) | ((bytes[bit >> 3] >> (7 - (bit & 7))) & 1);
  }
  return value;
}

/** MSB-first bit writer; the top `count` bits of `value` are the ones kept. */
function writeBits(bytes: Uint8Array, start: number, count: number, value: number): void {
  for (let i = 0; i < count; i++) {
    const bit = start + i;
    const mask = 1 << (7 - (bit & 7));
    if ((value >> (count - 1 - i)) & 1) bytes[bit >> 3] |= mask;
    else bytes[bit >> 3] &= ~mask;
  }
}

/** What a fresh code is made of: 116 random bits in canonical form. */
export function generateRecoveryEntropy(): Uint8Array {
  const bytes = crypto.getRandomValues(new Uint8Array(ENTROPY_BYTES));
  bytes[ENTROPY_BYTES - 1] &= 0xf0;
  return bytes;
}

/**
 * Entropy → twelve words. A non-zero reserved nibble is ignored: those four
 * bits belong to the checksum, and this function is what fills them in.
 */
export function entropyToWords(entropy: Uint8Array): string[] | null {
  const canonical = canonicalEntropy(entropy);
  if (!canonical) return null;
  writeBits(canonical, WORD_COUNT * BITS_PER_WORD - CHECKSUM_BITS, CHECKSUM_BITS, checksum4(canonical));
  const words: string[] = [];
  for (let i = 0; i < WORD_COUNT; i++) {
    const index = readBits(canonical, i * BITS_PER_WORD, BITS_PER_WORD);
    if (index >= BACKUP_WORD_COUNT) return null; // the list shrank under us
    words.push(BACKUP_WORDS[index]);
  }
  return words;
}

/**
 * Accents are folded and case is dropped so somebody can type `arany` for
 * `arany` without hunting for the right key. The wordlist's own test proves
 * no two entries fold together, because if they did, a code containing
 * either would have two valid readings.
 */
function fold(word: string): string {
  return word
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Folded word → index, built once at module load. */
const WORD_INDEX: ReadonlyMap<string, number> = new Map(
  BACKUP_WORDS.map((word, index) => [fold(word), index]),
);

/** Twelve words → canonical entropy, or null for a wrong count, an unknown word or a failed checksum. */
export function wordsToEntropy(words: readonly string[]): Uint8Array | null {
  if (!Array.isArray(words) || words.length !== WORD_COUNT) return null;
  const packed = new Uint8Array(ENTROPY_BYTES);
  for (let i = 0; i < WORD_COUNT; i++) {
    const word = words[i];
    if (typeof word !== "string") return null;
    const index = WORD_INDEX.get(fold(word));
    if (index === undefined) return null;
    writeBits(packed, i * BITS_PER_WORD, BITS_PER_WORD, index);
  }
  const stored = readBits(packed, WORD_COUNT * BITS_PER_WORD - CHECKSUM_BITS, CHECKSUM_BITS);
  const canonical = canonicalEntropy(packed);
  if (!canonical || checksum4(canonical) !== stored) return null;
  return canonical;
}
