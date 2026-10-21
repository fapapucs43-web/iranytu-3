/**
 * The storage layer's tests: the file's shape, the data key's one-way trip
 * out of extractability, and the ways a save can travel — all driven
 * DOM-free through the injected surface.
 *
 * The file format is forever: a field renamed here is a backup restored
 * nowhere. So the tests pin the serialized shape field by field, refuse
 * everything that is not unmistakably this format, and prove the property
 * the whole design rests on — either enrolled secret opens the SAME bundle,
 * and the working key can never leave WebCrypto — with real keys, not
 * doubles. The save chain is exercised through fakes for the same reason
 * backupKey's ceremonies are: the decisions are the product, and a browser
 * cannot be asked to make them here.
 */
import { describe, expect, test } from "bun:test";
import {
  BACKUP_FILE_MIME,
  BACKUP_FORMAT_VERSION,
  availableWraps,
  backupFileName,
  createBackupFile,
  detectBackupIo,
  generateBackupSalt,
  openBackupText,
  parseBackupFile,
  readBackupFile,
  saveBackupText,
  sealBackupDek,
  serializeBackupFile,
  updateBackupFile,
  type BackupFile,
  type BackupIo,
  type BackupSink,
  type OpenOutcome,
  type SaveOutcome,
} from "../../src/lib/backupStorage";
import {
  deriveKeyFromPasskey,
  deriveKeyFromRecovery,
  generateRecoveryEntropy,
} from "../../src/lib/backupCrypto";
import { PASSKEY_INFO, deriveBackupKekFromPassword } from "../../src/lib/backupKey";

// 0xab rather than a digits-only fill, so the uppercase-hex refusal below
// has an actual letter to refuse.
const SALT = new Uint8Array(32).fill(0xab);
const PRF = new Uint8Array(32).fill(9);
const RECOVERY_INFO = "iranytu-backup/recovery/v1";
const PASSWORD = "nagy titkos jelszavam";
const BUNDLE = '{"v":1,"entries":[{"note":"Árvíztűrő tükörfúrógép 🌙"}]}';
const NEXT_BUNDLE = '{"v":1,"entries":[]}';

async function passkeyKek(): Promise<CryptoKey> {
  const key = await deriveKeyFromPasskey(PRF, SALT, PASSKEY_INFO);
  if (!key) throw new Error("the passkey derivation refused fixed inputs");
  return key;
}

let cachedPasswordKek: Promise<CryptoKey> | null = null;

function passwordKek(): Promise<CryptoKey> {
  cachedPasswordKek ??= (async () => {
    const key = await deriveBackupKekFromPassword(PASSWORD, SALT);
    if (!key) throw new Error("the password derivation refused a valid password");
    return key;
  })();
  return cachedPasswordKek;
}

async function recoveryKek(): Promise<CryptoKey> {
  const key = await deriveKeyFromRecovery(generateRecoveryEntropy(), SALT, RECOVERY_INFO);
  if (!key) throw new Error("the recovery derivation refused fresh entropy");
  return key;
}

async function seedFile(keks?: { passkey?: CryptoKey; password?: CryptoKey; recovery?: CryptoKey }) {
  const created = await createBackupFile({
    bundle: BUNDLE,
    keks: keks ?? { passkey: await passkeyKek(), recovery: await recoveryKek() },
    salt: SALT,
    now: 1_700_000_000_000,
  });
  if (!created) throw new Error("the fixture file refused to be created");
  return created;
}

function flip(hex: string): string {
  return (hex[0] === "0" ? "1" : "0") + hex.slice(1);
}

function failed<T extends { ok: boolean }>(outcome: T): Extract<T, { ok: false }> {
  expect(outcome.ok).toBe(false);
  return outcome as Extract<T, { ok: false }>;
}

function fakeIo(parts: Partial<BackupIo> = {}): BackupIo {
  return {
    rememberedSink: null,
    chooseSink: null,
    chooseSource: null,
    share: null,
    download: () => {},
    ...parts,
  };
}

function recordingSink(log: string[]): BackupSink {
  return {
    write: async (text) => {
      log.push(text);
      return true;
    },
  };
}

describe("the file format", () => {
  test("a created file survives JSON and the parse, and opens again", async () => {
    const pk = await passkeyKek();
    const created = await seedFile({ passkey: pk, recovery: await recoveryKek() });
    const parsed = parseBackupFile(serializeBackupFile(created.file));
    expect(parsed).toEqual(created.file);
    const opened = await readBackupFile(parsed!, "passkey", pk);
    expect(opened!.bundle).toBe(BUNDLE);
  });

  test("the serialized shape is the format: field order and all", async () => {
    const created = await seedFile();
    const text = serializeBackupFile(created.file);
    expect(
      text.startsWith(
        `{"v":1,"createdAt":${created.file.createdAt},"updatedAt":${created.file.updatedAt},"salt":"`,
      ),
    ).toBe(true);
    const raw = JSON.parse(text) as Record<string, unknown>;
    expect(Object.keys(raw)).toEqual(["v", "createdAt", "updatedAt", "salt", "wraps", "payload"]);
    expect(Object.keys(raw.wraps as object)).toEqual(["passkey", "recovery"]);
    expect(raw.v).toBe(BACKUP_FORMAT_VERSION);
  });

  test("everything that is not unmistakably this format is refused", async () => {
    const created = await seedFile();
    const raw = JSON.parse(serializeBackupFile(created.file)) as Record<string, unknown>;
    const cases: unknown[] = [
      null,
      42,
      "",
      "not json",
      "[]",
      "null",
      { ...raw, v: 2 },
      { ...raw, salt: "ab" },
      { ...raw, salt: (raw.salt as string).toUpperCase() },
      { ...raw, salt: `${raw.salt as string}00` },
      { ...raw, createdAt: "now" },
      { ...raw, updatedAt: -1 },
      { ...raw, wraps: {} },
      { ...raw, wraps: { passkey: { v: 1 } } },
      { ...raw, wraps: { passkey: { v: 1, iv: "00", ciphertext: "00" } } },
      { ...raw, payload: null },
    ];
    for (const value of cases) {
      const text = typeof value === "string" ? value : JSON.stringify(value);
      expect(parseBackupFile(text)).toBeNull();
    }
  });

  test("extra fields are tolerated, unknown wrap kinds are skipped", async () => {
    const created = await seedFile();
    const raw = JSON.parse(serializeBackupFile(created.file)) as Record<string, unknown>;
    const wraps = raw.wraps as Record<string, unknown>;
    const parsed = parseBackupFile(
      JSON.stringify({ ...raw, future: true, wraps: { ...wraps, biometric: wraps.passkey } }),
    );
    expect(parsed).not.toBeNull();
    expect(availableWraps(parsed!)).toEqual(["passkey", "recovery"]);
  });

  test("availableWraps reports the enrolled secrets in the format's order", async () => {
    const all = await seedFile({
      recovery: await recoveryKek(),
      passkey: await passkeyKek(),
      password: await passwordKek(),
    });
    expect(availableWraps(all.file)).toEqual(["passkey", "password", "recovery"]);
    const passwordOnly = await seedFile({ password: await passwordKek(), recovery: await recoveryKek() });
    expect(availableWraps(passwordOnly.file)).toEqual(["password", "recovery"]);
  });
});

describe("the data key", () => {
  test("the working key is non-extractable, and export is refused", async () => {
    const sealed = await sealBackupDek({ passkey: await passkeyKek(), recovery: await recoveryKek() });
    expect(sealed).not.toBeNull();
    expect(sealed!.dek.extractable).toBe(false);
    await expect(crypto.subtle.exportKey("raw", sealed!.dek)).rejects.toThrow();
  });

  test("sealing wraps under exactly the given KEKs, in the format's order", async () => {
    const sealed = await sealBackupDek({ recovery: await recoveryKek(), passkey: await passkeyKek() });
    expect(Object.keys(sealed!.wraps)).toEqual(["passkey", "recovery"]);
  });

  test("no KEK means no data key", async () => {
    expect(await sealBackupDek({})).toBeNull();
  });
});

describe("creating and opening", () => {
  test("either enrolled secret opens the same bundle", async () => {
    const pk = await passkeyKek();
    const rk = await recoveryKek();
    const created = await seedFile({ passkey: pk, recovery: rk });
    const viaPasskey = await readBackupFile(created.file, "passkey", pk);
    const viaRecovery = await readBackupFile(created.file, "recovery", rk);
    expect(viaPasskey!.bundle).toBe(BUNDLE);
    expect(viaRecovery!.bundle).toBe(BUNDLE);
    await expect(crypto.subtle.exportKey("raw", viaPasskey!.dek)).rejects.toThrow();
  });

  test("the password slot opens the same file it was sealed with", async () => {
    const pw = await passwordKek();
    const rk = await recoveryKek();
    const created = await seedFile({ password: pw, recovery: rk });
    expect((await readBackupFile(created.file, "password", pw))!.bundle).toBe(BUNDLE);
    expect((await readBackupFile(created.file, "recovery", rk))!.bundle).toBe(BUNDLE);
  });

  test("a wrong secret, an unenrolled slot and an absent secret are all refusals", async () => {
    const created = await seedFile();
    const other = await deriveKeyFromPasskey(new Uint8Array(32).fill(8), SALT, PASSKEY_INFO);
    expect(await readBackupFile(created.file, "passkey", other)).toBeNull();
    expect(await readBackupFile(created.file, "password", await passwordKek())).toBeNull();
    expect(await readBackupFile(created.file, "passkey", null)).toBeNull();
  });

  test("a tampered payload or a tampered wrap is refused", async () => {
    const pk = await passkeyKek();
    const created = await seedFile({ passkey: pk, recovery: await recoveryKek() });
    const tamperedPayload: BackupFile = {
      ...created.file,
      payload: { ...created.file.payload, ciphertext: flip(created.file.payload.ciphertext) },
    };
    expect(await readBackupFile(tamperedPayload, "passkey", pk)).toBeNull();
    const tamperedWrap: BackupFile = {
      ...created.file,
      wraps: {
        ...created.file.wraps,
        passkey: { ...created.file.wraps.passkey!, ciphertext: flip(created.file.wraps.passkey!.ciphertext) },
      },
    };
    expect(await readBackupFile(tamperedWrap, "passkey", pk)).toBeNull();
  });

  test("create refuses a salt that is not the format's, and a bundle that is not text", async () => {
    const pk = await passkeyKek();
    expect(await createBackupFile({ bundle: BUNDLE, keks: { passkey: pk }, salt: new Uint8Array(16) })).toBeNull();
    expect(await createBackupFile({ bundle: BUNDLE, keks: {}, salt: SALT })).toBeNull();
    expect(
      await createBackupFile({ bundle: 42 as unknown as string, keks: { passkey: pk }, salt: SALT }),
    ).toBeNull();
  });

  test("an empty bundle is still a bundle", async () => {
    const pk = await passkeyKek();
    const created = await createBackupFile({ bundle: "", keks: { passkey: pk }, salt: SALT });
    expect(created).not.toBeNull();
    expect((await readBackupFile(created!.file, "passkey", pk))!.bundle).toBe("");
  });
});

describe("updating", () => {
  test("an update re-seals the payload, bumps updatedAt, and keeps the header", async () => {
    const pk = await passkeyKek();
    const created = await seedFile({ passkey: pk, recovery: await recoveryKek() });
    const updated = await updateBackupFile(created.file, created.dek, NEXT_BUNDLE, 2_000);
    expect(updated!.createdAt).toBe(created.file.createdAt);
    expect(updated!.updatedAt).toBe(2_000);
    expect(updated!.salt).toBe(created.file.salt);
    expect(updated!.wraps).toEqual(created.file.wraps);
    expect(updated!.payload.ciphertext).not.toBe(created.file.payload.ciphertext);
    expect((await readBackupFile(updated!, "passkey", pk))!.bundle).toBe(NEXT_BUNDLE);
  });
});

describe("the name and the salt", () => {
  test("the suggested name is the prefix and the local day", () => {
    expect(backupFileName(new Date(2026, 9, 3))).toBe("belso-iranytu-mentes-2026-10-03.json");
    expect(BACKUP_FILE_MIME).toBe("application/json");
  });

  test("a fresh salt is 32 bytes and does not repeat", () => {
    const first = generateBackupSalt();
    const second = generateBackupSalt();
    expect(first.length).toBe(32);
    expect([...first]).not.toEqual([...second]);
  });
});

describe("choosing where the save goes", () => {
  test("a remembered handle is written through, and the picker is never shown", async () => {
    const log: string[] = [];
    let pickerCalls = 0;
    const outcome = await saveBackupText(
      "data",
      "n.json",
      fakeIo({
        rememberedSink: async () => recordingSink(log),
        chooseSink: async () => {
          pickerCalls += 1;
          return recordingSink([]);
        },
      }),
    );
    expect(outcome).toEqual({ ok: true, via: "handle" });
    expect(log).toEqual(["data"]);
    expect(pickerCalls).toBe(0);
  });

  test("a stale remembered handle falls through to the picker", async () => {
    const log: string[] = [];
    let rememberedCalls = 0;
    const outcome = await saveBackupText(
      "data",
      "n.json",
      fakeIo({
        rememberedSink: async () => {
          rememberedCalls += 1;
          return { write: async () => false };
        },
        chooseSink: async () => recordingSink(log),
      }),
    );
    expect(outcome).toEqual({ ok: true, via: "picker" });
    expect(log).toEqual(["data"]);
    expect(rememberedCalls).toBe(1);
  });

  test("a remembered lookup that throws is not fatal", async () => {
    const log: string[] = [];
    let rememberedCalls = 0;
    const outcome = await saveBackupText(
      "data",
      "n.json",
      fakeIo({
        rememberedSink: async () => {
          rememberedCalls += 1;
          throw new Error("gone");
        },
        chooseSink: async () => recordingSink(log),
      }),
    );
    expect(outcome).toEqual({ ok: true, via: "picker" });
    expect(rememberedCalls).toBe(1);
  });

  test("a cancelled picker is a decision, not a detour", async () => {
    let shares = 0;
    let downloads = 0;
    const outcome = await saveBackupText(
      "data",
      "n.json",
      fakeIo({
        chooseSink: async () => null,
        share: async () => {
          shares += 1;
          return true;
        },
        download: () => {
          downloads += 1;
        },
      }),
    );
    expect(outcome).toEqual({ ok: false, cancelled: true });
    expect(shares).toBe(0);
    expect(downloads).toBe(0);
  });

  test("a picker that cannot open reports prose, not a crash", async () => {
    const outcome = failed(
      await saveBackupText(
        "data",
        "n.json",
        fakeIo({
          chooseSink: async () => {
            throw new DOMException("nope", "SecurityError");
          },
        }),
      ) as SaveOutcome,
    );
    expect(outcome.cancelled).toBe(false);
    expect(outcome.error).toContain("engedélyezte");
  });

  test("without a picker the share sheet is next, and its success is the save", async () => {
    const outcome = await saveBackupText("data", "n.json", fakeIo({ share: async () => true }));
    expect(outcome).toEqual({ ok: true, via: "share" });
  });

  test("a dismissed share sheet is a cancellation, not a reason to download", async () => {
    let downloads = 0;
    const outcome = failed(
      await saveBackupText(
        "data",
        "n.json",
        fakeIo({
          share: async () => false,
          download: () => {
            downloads += 1;
          },
        }),
      ) as SaveOutcome,
    );
    expect(outcome.cancelled).toBe(true);
    expect(downloads).toBe(0);
  });

  test("with nothing else left, the download takes it", async () => {
    const seen: [string, string][] = [];
    const outcome = await saveBackupText(
      "data",
      "n.json",
      fakeIo({
        download: (name, text) => {
          seen.push([name, text]);
        },
      }),
    );
    expect(outcome).toEqual({ ok: true, via: "download" });
    expect(seen).toEqual([["n.json", "data"]]);
  });

  test("the detected surface in this DOM-free environment is the download, and nothing throws", async () => {
    const io = detectBackupIo();
    expect(io.rememberedSink).toBeNull();
    expect(io.chooseSink).toBeNull();
    expect(io.share).toBeNull();
    expect(await saveBackupText("data", "n.json", io)).toEqual({ ok: true, via: "download" });
  });
});

describe("bringing a backup back", () => {
  test("a chosen file is read whole, with its name", async () => {
    const outcome = await openBackupText(
      fakeIo({ chooseSource: async () => ({ name: "mentes.json", read: async () => "tartalom" }) }),
    );
    expect(outcome).toEqual({ ok: true, text: "tartalom", name: "mentes.json" });
  });

  test("a source without a name reports null", async () => {
    const outcome = await openBackupText(fakeIo({ chooseSource: async () => ({ read: async () => "x" }) }));
    expect(outcome).toEqual({ ok: true, text: "x", name: null });
  });

  test("a cancelled open is a cancellation", async () => {
    const outcome = failed(
      (await openBackupText(fakeIo({ chooseSource: async () => null }))) as OpenOutcome,
    );
    expect(outcome.cancelled).toBe(true);
  });

  test("a file that cannot be read is an error, not a cancellation", async () => {
    const outcome = failed(
      (await openBackupText(fakeIo({ chooseSource: async () => ({ read: async () => null }) }))) as OpenOutcome,
    );
    expect(outcome.cancelled).toBe(false);
    expect(outcome.error).toContain("olvasható");
  });

  test("a source that throws is prose too", async () => {
    const outcome = failed(
      (await openBackupText(
        fakeIo({
          chooseSource: async () => ({
            read: async () => {
              throw new Error("boom");
            },
          }),
        }),
      )) as OpenOutcome,
    );
    expect(outcome.error).toContain("nem sikerült");
  });

  test("a picker that cannot open reports the permission prose", async () => {
    const outcome = failed(
      (await openBackupText(
        fakeIo({
          chooseSource: async () => {
            throw new DOMException("nope", "NotAllowedError");
          },
        }),
      )) as OpenOutcome,
    );
    expect(outcome.error).toContain("engedélyezte");
  });

  test("with no way to pick at all the environment says so", async () => {
    const outcome = failed((await openBackupText(fakeIo())) as OpenOutcome);
    expect(outcome.cancelled).toBe(false);
    expect(outcome.error).toContain("nem tud fájlt");
  });

  test("the detected surface offers a file input that resolves to nothing here", async () => {
    const io = detectBackupIo();
    expect(io.chooseSource).not.toBeNull();
    const outcome = failed((await openBackupText(io)) as OpenOutcome);
    expect(outcome.cancelled).toBe(true);
  });
});
