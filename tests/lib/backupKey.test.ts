/**
 * The passkey layer's tests, driven without a browser.
 *
 * The ceremonies take their WebAuthn surface as a parameter (defaulting to
 * the real `navigator.credentials`), so every path a user can hit is
 * exercised here against fakes: registration, the follow-up assertion that
 * actually carries the PRF output, a PRF-less authenticator, cancellation,
 * a null credential and an invalid stored credential id. What CANNOT be
 * tested without a real authenticator is the authenticator itself; what can
 * be tested is every decision this module makes around it, and that is what
 * these tests pin.
 *
 * The pure half — option builders, result readers, the password derivation —
 * is tested directly, and the four domain constants are pinned byte for
 * byte: changing `PRF_SALT`, `PASSKEY_INFO`, `PASSWORD_INFO` or
 * `RECOVERY_INFO` changes every derived key, which would silently make every
 * existing backup unreadable.
 */
import { describe, expect, test } from "bun:test";
import {
  decrypt,
  deriveKeyFromPasskey,
  encrypt,
  generateRecoveryEntropy,
} from "../../src/lib/backupCrypto";
import {
  PASSKEY_INFO,
  PASSWORD_INFO,
  PASSWORD_ITERATIONS,
  PRF_SALT,
  RECOVERY_INFO,
  buildCreationOptions,
  buildRequestOptions,
  createBackupPasskey,
  deriveBackupKekFromPassword,
  deriveBackupKekFromPrf,
  deriveBackupKekFromRecovery,
  isPasskeySupported,
  passwordProblem,
  readCredentialId,
  readPrfOutput,
  unlockWithPasskey,
  type PasskeyResult,
} from "../../src/lib/backupKey";

const SECRET = "Árvíztűrő tükörfúrógép — passkey-teszt 🌙";
const RAW_ID = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
const PRF_BYTES = new Uint8Array(32).fill(7);
const CHALLENGE = new Uint8Array(32).fill(6);

const toHex = (bytes: Uint8Array): string =>
  [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

/** A credential-shaped object, the way a browser hands one back. */
function credential(rawId: Uint8Array, prf: unknown): Record<string, unknown> {
  return { rawId, getClientExtensionResults: () => ({ prf }) };
}

/** Asserts the result is a refusal and returns its message. */
function failure(result: PasskeyResult): string {
  expect(result.ok).toBe(false);
  return result.ok ? "" : result.error;
}

describe("the browser gate", () => {
  test("isPasskeySupported is a boolean, and false in this DOM-free environment", () => {
    expect(typeof isPasskeySupported()).toBe("boolean");
    expect(isPasskeySupported()).toBe(false);
  });

  test("both ceremonies refuse cleanly, in prose, when there is no WebAuthn surface", async () => {
    expect(failure(await createBackupPasskey("Anna", null))).toContain("nem támogatja");
    expect(failure(await unlockWithPasskey("aabb", null))).toContain("nem támogatja");
  });
});

describe("the option builders", () => {
  test("creation options carry the user, the challenge and the PRF request", () => {
    const userId = new Uint8Array(16).fill(5);
    const options = buildCreationOptions(userId, "Anna", CHALLENGE);
    expect([...(options.challenge as Uint8Array)]).toEqual([...CHALLENGE]);
    expect([...(options.user.id as Uint8Array)]).toEqual([...userId]);
    expect(options.user.name).toBe("Anna");
    expect(options.user.displayName).toBe("Anna");
    expect(options.rp.name).toBe("Belső Iránytű");
    expect(options.pubKeyCredParams.map((p) => p.alg)).toEqual([-7, -257]);
    expect(options.authenticatorSelection?.userVerification).toBe("required");
    expect(options.authenticatorSelection?.residentKey).toBe("preferred");
    expect(options.attestation).toBe("none");
    expect(options.timeout).toBe(60_000);
    expect(options.extensions && "prf" in options.extensions).toBe(true);
  });

  test("request options carry the credential and the app's PRF salt", () => {
    const options = buildRequestOptions(toHex(RAW_ID), CHALLENGE);
    expect(options).not.toBeNull();
    expect([...(options!.challenge as Uint8Array)]).toEqual([...CHALLENGE]);
    expect(options!.allowCredentials).toHaveLength(1);
    expect(options!.allowCredentials![0]!.type).toBe("public-key");
    expect([...(options!.allowCredentials![0]!.id as Uint8Array)]).toEqual([...RAW_ID]);
    expect(options!.userVerification).toBe("required");
    expect((options!.extensions as { prf?: { eval?: { first?: unknown } } }).prf?.eval?.first).toEqual(PRF_SALT);
    expect(buildRequestOptions("zz", CHALLENGE)).toBeNull();
    expect(buildRequestOptions("", CHALLENGE)).toBeNull();
    expect(buildRequestOptions("abc", CHALLENGE)).toBeNull();
  });
});

describe("reading what the authenticator returned", () => {
  test("a credential id comes back as hex from either buffer form", () => {
    expect(readCredentialId({ rawId: RAW_ID })).toBe(toHex(RAW_ID));
    expect(readCredentialId({ rawId: RAW_ID.buffer })).toBe(toHex(RAW_ID));
  });

  test("anything that is not a credential id is null, not a guess", () => {
    expect(readCredentialId(null)).toBeNull();
    expect(readCredentialId({})).toBeNull();
    expect(readCredentialId({ rawId: new Uint8Array(0) })).toBeNull();
    expect(readCredentialId({ rawId: "x" })).toBeNull();
    expect(readCredentialId({ rawId: new ArrayBuffer(0) })).toBeNull();
  });

  test("a PRF output comes back as exactly 32 fresh bytes, from either buffer form", () => {
    const fromView = readPrfOutput(credential(RAW_ID, { results: { first: PRF_BYTES } }));
    expect(fromView).not.toBeNull();
    expect([...fromView!]).toEqual([...PRF_BYTES]);
    const fromBuffer = readPrfOutput(credential(RAW_ID, { results: { first: PRF_BYTES.buffer } }));
    expect([...fromBuffer!]).toEqual([...PRF_BYTES]);
    expect(fromView).not.toBe(fromBuffer); // copied, not aliased
  });

  test("anything that is not a 32-byte result is refused", () => {
    const cases: unknown[] = [
      null,
      {},
      { getClientExtensionResults: 42 },
      credential(RAW_ID, undefined),
      credential(RAW_ID, {}),
      credential(RAW_ID, { results: {} }),
      credential(RAW_ID, { results: { first: "not bytes" } }),
      credential(RAW_ID, { results: { first: new Uint8Array(16) } }),
      credential(RAW_ID, { results: { first: new Uint8Array(64) } }),
      { getClientExtensionResults: () => { throw new Error("boom"); } },
    ];
    for (const value of cases) expect(readPrfOutput(value)).toBeNull();
  });
});

describe("the ceremonies, driven by a fake authenticator", () => {
  test("registration creates, then asserts, and both calls carry the right options", async () => {
    const calls: { kind: string; publicKey: Record<string, unknown> }[] = [];
    const surface = {
      create: async (options: { publicKey: Record<string, unknown> }) => {
        calls.push({ kind: "create", publicKey: options.publicKey });
        return credential(RAW_ID, { enabled: true });
      },
      get: async (options: { publicKey: Record<string, unknown> }) => {
        calls.push({ kind: "get", publicKey: options.publicKey });
        return credential(RAW_ID, { results: { first: PRF_BYTES } });
      },
    };

    const result = await createBackupPasskey("Anna", surface);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.credentialId).toBe(toHex(RAW_ID));
    expect([...result.prfOutput]).toEqual([...PRF_BYTES]);

    const created = calls.find((c) => c.kind === "create")!;
    expect((created.publicKey.user as { name: string }).name).toBe("Anna");
    expect("prf" in (created.publicKey.extensions as object)).toBe(true);
    const fetched = calls.find((c) => c.kind === "get")!;
    const evalSalt = (fetched.publicKey.extensions as { prf: { eval: { first: unknown } } }).prf.eval.first;
    expect(evalSalt).toEqual(PRF_SALT);
    const allowed = (fetched.publicKey.allowCredentials as { id: unknown }[])[0]!.id;
    expect([...(allowed as Uint8Array)]).toEqual([...RAW_ID]);
  });

  test("a blank account name falls back to the app's name", async () => {
    let seen: { name?: string } = {};
    const surface = {
      create: async (options: { publicKey: { user: { name: string } } }) => {
        seen = options.publicKey.user;
        return credential(RAW_ID, { enabled: true });
      },
      get: async () => credential(RAW_ID, { results: { first: PRF_BYTES } }),
    };
    const result = await createBackupPasskey("   ", surface);
    expect(result.ok).toBe(true);
    expect(seen.name).toBe("Belső Iránytű");
  });

  test("a creation that yields no credential, or throws, is a refusal — never an exception", async () => {
    const noCredential = await createBackupPasskey("Anna", {
      create: async () => null,
      get: async () => null,
    });
    expect(failure(noCredential)).toContain("létrehozása");

    const cancelled = await createBackupPasskey("Anna", {
      create: async () => {
        throw new DOMException("user cancelled", "NotAllowedError");
      },
      get: async () => null,
    });
    expect(failure(cancelled)).toContain("megszakadt");
  });

  test("an authenticator without PRF produces the fallback message, not a key", async () => {
    const result = await createBackupPasskey("Anna", {
      create: async () => credential(RAW_ID, { enabled: false }),
      get: async () => credential(RAW_ID, {}),
    });
    expect(failure(result)).toContain("PRF");
  });

  test("unlock asks for the stored credential and returns its PRF output", async () => {
    const result = await unlockWithPasskey(toHex(RAW_ID), {
      create: async () => null,
      get: async () => credential(RAW_ID, { results: { first: PRF_BYTES } }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.credentialId).toBe(toHex(RAW_ID));
    expect([...result.prfOutput]).toEqual([...PRF_BYTES]);
  });

  test("unlock maps cancellation and unknown failures to distinct prose", async () => {
    const cancelled = await unlockWithPasskey(toHex(RAW_ID), {
      create: async () => null,
      get: async () => {
        throw new DOMException("timed out", "NotAllowedError");
      },
    });
    expect(failure(cancelled)).toContain("megszakadt");

    const failed = await unlockWithPasskey(toHex(RAW_ID), {
      create: async () => null,
      get: async () => {
        throw new Error("boom");
      },
    });
    expect(failure(failed)).toContain("nem sikerült");
  });

  test("an unreadable credential id never reaches the authenticator", async () => {
    let called = false;
    const result = await unlockWithPasskey("nem-hex", {
      create: async () => null,
      get: async () => {
        called = true;
        return null;
      },
    });
    expect(failure(result)).toContain("Érvénytelen");
    expect(called).toBe(false);
  });
});

describe("the password fallback", () => {
  const SALT_A = new Uint8Array(16).fill(3);
  const SALT_B = new Uint8Array(16).fill(4);
  const PASSWORD = "nagy titkos jelszavam";

  test("PBKDF2 is deterministic: the same password and salt derive the same key", async () => {
    const first = await deriveBackupKekFromPassword(PASSWORD, SALT_A);
    const second = await deriveBackupKekFromPassword(PASSWORD, SALT_A);
    expect(first).not.toBeNull();
    const payload = await encrypt(SECRET, first!);
    expect(await decrypt(payload, second!)).toBe(SECRET);
  });

  test("a different salt yields a key that cannot open the payload", async () => {
    const first = await deriveBackupKekFromPassword(PASSWORD, SALT_A);
    const other = await deriveBackupKekFromPassword(PASSWORD, SALT_B);
    const payload = await encrypt(SECRET, first!);
    expect(await decrypt(payload, other!)).toBeNull();
  });

  test("an empty password or salt is refused, not derived from", async () => {
    expect(await deriveBackupKekFromPassword("", SALT_A)).toBeNull();
    expect(await deriveBackupKekFromPassword(PASSWORD, new Uint8Array(0))).toBeNull();
  });

  test("the policy asks for length and variety, in Hungarian", () => {
    expect(passwordProblem("rövid")).toContain("10");
    expect(passwordProblem("aaaaaaaaaaaa")).toContain("könnyű");
    expect(passwordProblem("nagy titkos jelszavam")).toBeNull();
  });
});

describe("the domain constants and the PRF boundary", () => {
  test("the constants are pinned — changing one would silently orphan every backup", () => {
    expect(PASSKEY_INFO).toBe("iranytu-backup/passkey/v1");
    expect(PASSWORD_INFO).toBe("iranytu-backup/password/v1");
    expect(new TextDecoder().decode(PRF_SALT)).toBe("iranytu-backup-prf-salt-v1------");
    expect(PRF_SALT.length).toBe(32);
    expect(PASSWORD_ITERATIONS).toBe(600_000);
  });

  test("deriveBackupKekFromPrf refuses anything that is not exactly 32 bytes", async () => {
    expect(await deriveBackupKekFromPrf(new Uint8Array(0))).toBeNull();
    expect(await deriveBackupKekFromPrf(new Uint8Array(31).fill(9))).toBeNull();
    expect(await deriveBackupKekFromPrf(new Uint8Array(33).fill(9))).toBeNull();

    const bytes = new Uint8Array(32).fill(9);
    const key = await deriveBackupKekFromPrf(bytes);
    expect(key).not.toBeNull();
    const payload = await encrypt(SECRET, key!);
    expect(await decrypt(payload, await deriveBackupKekFromPrf(bytes))).toBe(SECRET);
  });

  test("the same bytes under the password info are a different key", async () => {
    const bytes = new Uint8Array(32).fill(9);
    const passkey = await deriveBackupKekFromPrf(bytes);
    const passwordDomain = await deriveKeyFromPasskey(bytes, PRF_SALT, PASSWORD_INFO);
    const payload = await encrypt(SECRET, passkey!);
    expect(await decrypt(payload, passwordDomain!)).toBeNull();
  });

  test("a different salt is a different key even with identical PRF bytes", async () => {
    const bytes = new Uint8Array(32).fill(9);
    const passkey = await deriveBackupKekFromPrf(bytes);
    const otherSalt = await deriveKeyFromPasskey(bytes, new Uint8Array(32).fill(1), PASSKEY_INFO);
    const payload = await encrypt(SECRET, passkey!);
    expect(await decrypt(payload, otherSalt!)).toBeNull();
  });
});

/**
 * Commit 5 added the recovery derivation, because this is the layer that owns
 * the domain constants and `deriveKeyFromRecovery` takes its `info` from the
 * caller — a caller reaching for the passkey one would get a key that opens
 * nothing, and would have no way to tell that from a mistyped word.
 */
describe("the recovery derivation", () => {
  const SALT = new Uint8Array(32).fill(0x5a);

  test("the third info string is pinned like the other two", () => {
    expect(RECOVERY_INFO).toBe("iranytu-backup/recovery/v1");
  });

  test("the words' entropy opens what it sealed", async () => {
    const entropy = generateRecoveryEntropy();
    const kek = await deriveBackupKekFromRecovery(entropy, SALT);
    expect(kek).not.toBeNull();
    const payload = await encrypt(SECRET, kek!);
    expect(await decrypt(payload, await deriveBackupKekFromRecovery(entropy, SALT))).toBe(SECRET);
  });

  test("the file's salt is part of it — the same words under another file open nothing", async () => {
    // The reason this derivation takes the salt at all: a restore on a device
    // that has never seen this account has the words and the file, nothing
    // else. That also means the salt cannot be a local secret.
    const kek = await deriveBackupKekFromRecovery(generateRecoveryEntropy(), SALT);
    const payload = await encrypt(SECRET, kek!);
    const other = await deriveBackupKekFromRecovery(generateRecoveryEntropy(), new Uint8Array(32).fill(1));
    expect(await decrypt(payload, other!)).toBeNull();
  });

  test("entropy that is not a recovery code, or a salt that is not one, is refused", async () => {
    expect(await deriveBackupKekFromRecovery(new Uint8Array(0), SALT)).toBeNull();
    expect(await deriveBackupKekFromRecovery(new Uint8Array(14), SALT)).toBeNull();
    expect(await deriveBackupKekFromRecovery(new Uint8Array(16), SALT)).toBeNull();
    expect(await deriveBackupKekFromRecovery(generateRecoveryEntropy(), new Uint8Array(0))).toBeNull();
  });

  test("the recovery KEK cannot open a passkey's payload", async () => {
    const passkey = await deriveBackupKekFromPrf(PRF_BYTES);
    const recovery = await deriveBackupKekFromRecovery(generateRecoveryEntropy(), SALT);
    const payload = await encrypt(SECRET, passkey!);
    expect(await decrypt(payload, recovery!)).toBeNull();
  });
});
