/**
 * The crypto core's own tests: what each derivation can open, what a single
 * mistyped recovery word does, and why every failure is a `null` instead of
 * an exception.
 *
 * Everything here runs DOM-free — no localStorage, no mocks — because
 * `src/lib/backupCrypto.ts` is storage-free by design. The plaintexts are
 * deliberately Hungarian, with an emoji, so the round trip proves UTF-8
 * handling rather than assuming it.
 *
 * The guards here are the ones the rest of the feature leans on: if the
 * checksum ever stops catching typos or the two derivations ever stop being
 * domain-separated, the failure has to be loud in this file, not silent in a
 * user's restore.
 */
import { describe, expect, test } from "bun:test";
import {
  decrypt,
  deriveKeyFromPasskey,
  deriveKeyFromRecovery,
  encrypt,
  entropyToWords,
  generateRecoveryEntropy,
  unwrapKey,
  wordsToEntropy,
  wrapKey,
  type EncryptedPayload,
} from "../../src/lib/backupCrypto";
import { BACKUP_WORDS } from "../../src/lib/backupWordlist";

const SALT = new Uint8Array(16).fill(7);
const PASSKEY_INFO = "iranytu-backup/passkey/v1";
const RECOVERY_INFO = "iranytu-backup/recovery/v1";
const PRF_OUTPUT = new Uint8Array(32).fill(3);
const SECRET = "Árvíztűrő tükörfúrógép — hangulatnapló 🌙";

async function passkeyKey(): Promise<CryptoKey> {
  const key = await deriveKeyFromPasskey(PRF_OUTPUT, SALT, PASSKEY_INFO);
  if (!key) throw new Error("the passkey derivation refused fixed inputs");
  return key;
}

async function recoveryKey(): Promise<CryptoKey> {
  const key = await deriveKeyFromRecovery(generateRecoveryEntropy(), SALT, RECOVERY_INFO);
  if (!key) throw new Error("the recovery derivation refused fresh entropy");
  return key;
}

const strip = (word: string): string => word.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

describe("the envelope — encrypt, decrypt, and refuse", () => {
  test("a Hungarian sentence survives the round trip, envelope and all", async () => {
    const key = await passkeyKey();
    const payload: EncryptedPayload | null = await encrypt(SECRET, key);
    expect(payload).not.toBeNull();
    expect(payload!.v).toBe(1);
    expect(payload!.iv).toHaveLength(24); // 12 bytes, hex
    expect(payload!.ciphertext.length).toBeGreaterThanOrEqual(32); // the GCM tag alone
    expect(await decrypt(payload, key)).toBe(SECRET);
  });

  test("an encrypted empty string is still a success", async () => {
    const key = await passkeyKey();
    const payload = await encrypt("", key);
    expect(payload).not.toBeNull();
    expect(await decrypt(payload, key)).toBe("");
  });

  test("a different key opens nothing", async () => {
    const payload = await encrypt(SECRET, await passkeyKey());
    expect(await decrypt(payload, await recoveryKey())).toBeNull();
  });

  test("a single flipped hex digit in the ciphertext is rejected", async () => {
    const key = await passkeyKey();
    const payload = await encrypt(SECRET, key);
    const ciphertext = payload!.ciphertext;
    const flipped = (ciphertext[0] === "0" ? "1" : "0") + ciphertext.slice(1);
    expect(await decrypt({ ...payload, ciphertext: flipped }, key)).toBeNull();
  });

  test("the envelope version is checked, not ignored", async () => {
    const key = await passkeyKey();
    const payload = await encrypt(SECRET, key);
    expect(await decrypt({ ...payload, v: 2 }, key)).toBeNull();
    expect(await decrypt({ ...payload, v: "1" }, key)).toBeNull();
  });

  test("malformed envelopes are refused before any crypto runs", async () => {
    const key = await passkeyKey();
    expect(await decrypt(null, key)).toBeNull();
    expect(await decrypt("a payload", key)).toBeNull();
    expect(await decrypt({}, key)).toBeNull();
    // wrong IV width, non-hex IV, odd-length ciphertext, ciphertext too short to hold a tag
    expect(await decrypt({ v: 1, iv: "ab", ciphertext: "00".repeat(16) }, key)).toBeNull();
    expect(await decrypt({ v: 1, iv: "zz".repeat(12), ciphertext: "00".repeat(16) }, key)).toBeNull();
    expect(await decrypt({ v: 1, iv: "ab".repeat(12), ciphertext: "0" }, key)).toBeNull();
    expect(await decrypt({ v: 1, iv: "ab".repeat(12), ciphertext: "00".repeat(15) }, key)).toBeNull();
  });

  test("every encryption gets a fresh IV, and both still decrypt", async () => {
    const key = await passkeyKey();
    const first = await encrypt(SECRET, key);
    const second = await encrypt(SECRET, key);
    expect(first!.iv).not.toBe(second!.iv);
    expect(first!.ciphertext).not.toBe(second!.ciphertext);
    expect(await decrypt(first, key)).toBe(SECRET);
    expect(await decrypt(second, key)).toBe(SECRET);
  });
});

describe("the derivations — deterministic where they should be, separated where they must be", () => {
  test("HKDF is deterministic: two derivations of the same inputs agree", async () => {
    const first = await passkeyKey();
    const second = await passkeyKey();
    const payload = await encrypt(SECRET, first);
    expect(await decrypt(payload, second)).toBe(SECRET);
  });

  test("identical input bytes under different info cannot open each other's payloads", async () => {
    // The last byte's nibble is clear, so recovery's canonicalisation is a
    // no-op on this input and `info` is the only difference left between the
    // two derivations — exactly the property under test.
    const shared = new Uint8Array(15).fill(0x90);
    const passkeyLike = await deriveKeyFromPasskey(shared, SALT, PASSKEY_INFO);
    const recoveryLike = await deriveKeyFromRecovery(shared, SALT, RECOVERY_INFO);
    expect(passkeyLike).not.toBeNull();
    expect(recoveryLike).not.toBeNull();
    const payload = await encrypt(SECRET, recoveryLike!);
    expect(await decrypt(payload, passkeyLike!)).toBeNull();
  });

  test("a derivation refuses inputs it cannot mean: empty PRF output, wrong-size entropy", async () => {
    expect(await deriveKeyFromPasskey(new Uint8Array(0), SALT, PASSKEY_INFO)).toBeNull();
    expect(await deriveKeyFromRecovery(new Uint8Array(14), SALT, RECOVERY_INFO)).toBeNull();
    expect(await deriveKeyFromRecovery(new Uint8Array(16), SALT, RECOVERY_INFO)).toBeNull();
  });
});

describe("the recovery code — twelve words, 116 bits, one typo-catcher", () => {
  test("fresh entropy is 15 canonical bytes and different on every draw", () => {
    const first = generateRecoveryEntropy();
    const second = generateRecoveryEntropy();
    expect(first).toHaveLength(15);
    expect(first[14]! & 0x0f).toBe(0); // the checksum nibble is the encoder's to fill
    expect([...first]).not.toEqual([...second]);
  });

  test("entropy → twelve words → entropy round-trips exactly", () => {
    const entropy = generateRecoveryEntropy();
    const words = entropyToWords(entropy);
    expect(words).not.toBeNull();
    expect(words!).toHaveLength(12);
    for (const word of words!) expect(BACKUP_WORDS).toContain(word);
    const back = wordsToEntropy(words!);
    expect(back).not.toBeNull();
    expect([...back!]).toEqual([...entropy]);
  });

  test("the all-zero code is canonical, repeatable and accepted", () => {
    const words = entropyToWords(new Uint8Array(15));
    expect(words).not.toBeNull();
    expect(new Set(words!).size).toBe(1); // a zero bitstream names one word twelve times
    expect(words![0]).toBe(BACKUP_WORDS[0]);
    expect([...wordsToEntropy(words!)!]).toEqual(new Array(15).fill(0));
  });

  test("a single-word typo is caught by the checksum, not silently accepted", () => {
    // Deterministic input (all-zero entropy), so the rejection count below is
    // a fixed fact about the checksum rather than a lucky draw: of 1023 real
    // alternatives for the first word, the overwhelming majority must be
    // refused, and `kutya` — the word that was already there — must not.
    const words = entropyToWords(new Uint8Array(15))!;
    let rejected = 0;
    for (const alternative of BACKUP_WORDS) {
      const typo = [...words];
      typo[0] = alternative;
      if (wordsToEntropy(typo) === null) rejected += 1;
    }
    expect(rejected).toBeGreaterThan(800);
    expect(wordsToEntropy(words)).not.toBeNull();
  });

  test("word count and unknown words are refusals, never guesses", () => {
    const words = entropyToWords(generateRecoveryEntropy())!;
    expect(wordsToEntropy(words.slice(0, 11))).toBeNull();
    expect(wordsToEntropy([...words, words[0]!])).toBeNull();
    const unknown = [...words];
    unknown[3] = "televízió"; // a real Hungarian word — just not in this list
    expect(wordsToEntropy(unknown)).toBeNull();
  });

  test("case and accents fold: the code can be typed the way people type", () => {
    const entropy = generateRecoveryEntropy();
    const words = entropyToWords(entropy)!;
    const shouted = words.map((word) => word.toUpperCase());
    expect([...wordsToEntropy(shouted)!]).toEqual([...entropy]);

    // The accent half needs a phrase that actually carries an accent.
    let accented: string[] | null = null;
    for (let k = 0; k < 256 && !accented; k++) {
      const candidate = entropyToWords(new Uint8Array(15).fill(k));
      if (candidate && candidate.some((word) => strip(word) !== word)) accented = candidate;
    }
    expect(accented).not.toBeNull();
    const stripped = accented!.map(strip);
    const back = wordsToEntropy(stripped);
    expect(back).not.toBeNull();
    expect([...back!]).toEqual([...wordsToEntropy(accented!)!]);
  });
});

describe("key wrapping — the envelope the DEK travels in", () => {
  test("wrap → unwrap returns a non-extractable key that decrypts what the original encrypted", async () => {
    const kek = await passkeyKey();
    const dek = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    const wrapped = await wrapKey(dek, kek);
    expect(wrapped).not.toBeNull();
    expect(wrapped!.ciphertext.length).toBeGreaterThanOrEqual(32);
    const unwrapped = await unwrapKey(wrapped, kek);
    expect(unwrapped).not.toBeNull();
    expect(unwrapped!.extractable).toBe(false);
    const payload = await encrypt(SECRET, dek);
    expect(await decrypt(payload, unwrapped!)).toBe(SECRET);
  });

  test("unwrapping with the wrong wrapping key yields null, not a broken key", async () => {
    const dek = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    const wrapped = await wrapKey(dek, await passkeyKey());
    expect(await unwrapKey(wrapped, await recoveryKey())).toBeNull();
    const ct = wrapped!.ciphertext;
    const tampered = { ...wrapped!, ciphertext: (ct[0] === "0" ? "1" : "0") + ct.slice(1) };
    expect(await unwrapKey(tampered, await passkeyKey())).toBeNull();
  });

  test("a non-extractable key cannot be wrapped at all", async () => {
    // The KEKs are non-extractable; trying to wrap one must fail, because
    // exportKey is exactly what non-extractability forbids.
    const kek = await passkeyKey();
    expect(await wrapKey(kek, kek)).toBeNull();
  });
});
