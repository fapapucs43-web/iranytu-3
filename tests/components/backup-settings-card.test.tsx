/**
 * Commit 5 — the backup settings card: its four states, and the flows behind
 * them.
 *
 * THIS FILE SPLITS IN TWO, ON PURPOSE.
 *
 * 1. THE MARKUP (`renderToStaticMarkup`, no jsdom, no effects). The states
 *    are separate exported views precisely so this half can render every one
 *    of them: a card that only ever renders OFF would pass a single container
 *    test and nothing else. Each state is asserted for the promises it makes
 *    rather than for its class names — the warnings first, because a backup
 *    card that quietly omits "you can lose this" is the failure that costs
 *    somebody their journal.
 *
 * 2. THE FLOWS, which are exported functions taking their WebAuthn surface
 *    and file surface as parameters — the shape `backupKey` and
 *    `backupStorage` already use. Real crypto, faked browser: an enrollment
 *    is exercised end to end, from the ceremony to twelve words reopening a
 *    file on a bare device, because that is the only way to prove the card
 *    wires the slots together rather than merely offering them.
 *
 * THE TWO PROMISES THIS FILE EXISTS TO PROTECT
 *   - A file is written only after the twelve words have been acknowledged,
 *     and a cancelled save leaves the feature switched OFF.
 *   - No secret reaches the DOM. Every field is uncontrolled, so the markup
 *     carries no `value` attribute; the words are in the tree on purpose and
 *     are the single exception.
 *
 * The store is a singleton across the run and Bun has no localStorage, so the
 * double is installed at module scope (the store reads localStorage when it is
 * first evaluated) and taken away in `afterAll`, the same pattern
 * `tests/lib/store-import-repair.test.ts` and `tests/lib/backup.test.ts` use.
 */
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import BackupSettingsCard, {
  BackupActiveView,
  BackupErrorView,
  BackupOffView,
  BackupRecoveryView,
  BackupSetupView,
  chooseBackupFile,
  formatSaved,
  prepareBackupWithPasskey,
  prepareBackupWithPassword,
  restoreBackupFile,
  restoreSummary,
  saveBackupNow,
  writePreparedBackup,
  type BackupDeps,
  type PrepareResult,
  type PreparedBackup,
} from "../../src/components/BackupSettingsCard";
import { AppProvider } from "../../src/state/AppContext";
import { t } from "../../src/lib/i18n";
import {
  BACKUP_STATE_KEY,
  forgetBackupState,
  loadBackupState,
} from "../../src/lib/backup";
import { availableWraps, parseBackupFile, readBackupFile } from "../../src/lib/backupStorage";
import {
  PASSWORD_MIN_LENGTH,
  deriveBackupKekFromPassword,
  deriveBackupKekFromPrf,
  deriveBackupKekFromRecovery,
  passwordProblem,
  type WebAuthnSurface,
} from "../../src/lib/backupKey";
import { wordsToEntropy } from "../../src/lib/backupCrypto";
import { BACKUP_WORDS } from "../../src/lib/backupWordlist";

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

const store = await import("../../src/lib/store");
const { resetForTests: resetAssessments } = await import("../../src/lib/assessmentStore");

beforeEach(() => {
  clearStorage();
  store.resetAll();
  resetAssessments();
  forgetBackupState();
});

afterAll(() => {
  store.resetAll();
  resetAssessments();
  clearStorage();
  delete withStorage.localStorage;
});

/* -------------------------------- fixtures ------------------------------ */

// These three are the WORDS the card used to declare as module constants. They
// live here as literal expectations on purpose: a test that compared the card
// against `t("backup.cloudNote")` would pass even if the catalogue changed the
// sentence, which is exactly the regression these assertions exist to catch.
const NOW = 1_700_000_000_000;
const CLOUD_NOTE = "A mentés a te felhődbe kerül. Mi soha nem látjuk.";
const LOSS_NOTE =
  "Ha elveszíted a jelszót vagy a 12 szavas kódot, a mentés visszaállíthatatlan.";
const NOT_OURS = "Ez nem a Belső Iránytű titkosított mentése.";
const OPEN_FAILED = "A mentés nem nyitható meg ezzel a titokkal.";
const MISMATCH = "A két jelszó nem egyezik.";
const PASSWORD = "nagyon titkos jelszavam";
const FILE_NAME = "belso-iranytu-mentes-2026-10-03.json";
const CREDENTIAL_ID = "0102030405060708";
const PRF_BYTES = new Uint8Array(32).fill(7);
const TWELVE_WORDS = [
  "alma", "körte", "szilva", "barack", "ribizli", "málna",
  "szeder", "eper", "dinnye", "füge", "ribizke", "szőlő",
];

const CARD_SRC = readFileSync("src/components/BackupSettingsCard.tsx", "utf8");
const CSS = readFileSync("src/styles.css", "utf8");

/** A credential carrying a PRF result — the answer to either ceremony. */
function fakeCredential() {
  return {
    rawId: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
    getClientExtensionResults: () => ({ prf: { results: { first: PRF_BYTES } } }),
  };
}

function fakeSurface(credential: unknown = fakeCredential()): WebAuthnSurface {
  return {
    create: async () => credential,
    get: async () => credential,
  };
}

/** One file on disk, written and read through the real save/open chains. */
function fakeDrive(initial: string | null = null) {
  const drive: { text: string | null } = { text: initial };
  const io = {
    rememberedSink: null,
    chooseSink: async () => ({
      write: async (text: string) => {
        drive.text = text;
        return true;
      },
    }),
    chooseSource: async () =>
      drive.text === null
        ? null
        : { read: async () => drive.text as string, name: FILE_NAME },
    share: null,
    download: (_name: string, text: string) => {
      drive.text = text;
    },
  };
  return { io, drive };
}

/** A browser that says no to everything: every picker was cancelled. */
const refusingDrive = {
  rememberedSink: null,
  chooseSink: async () => null,
  chooseSource: async () => null,
  share: null,
  download: () => {},
};

function bytesOf(hex: string): Uint8Array {
  return new Uint8Array((hex.match(/../g) ?? []).map((pair) => parseInt(pair, 16)));
}

async function passwordKek(password: string, saltHex: string): Promise<CryptoKey> {
  const kek = await deriveBackupKekFromPassword(password, bytesOf(saltHex));
  if (!kek) throw new Error("the password derivation refused a file this card wrote");
  return kek;
}

/** The KEK the fake authenticator's PRF output derives, for assertions. */
async function passkeyKek(): Promise<CryptoKey> {
  const kek = await deriveBackupKekFromPrf(PRF_BYTES);
  if (!kek) throw new Error("the passkey derivation refused fixed PRF bytes");
  return kek;
}

/** A password-protected file, sealed and ready, words and all. */
async function enroll(now = NOW): Promise<PreparedBackup> {
  const result = await prepareBackupWithPassword(PASSWORD, PASSWORD, { now });
  if (!result.ok) throw new Error(`enrollment was refused: ${result.error}`);
  return result.prepared;
}

function expectPrepared(result: PrepareResult): PreparedBackup {
  if (!result.ok) throw new Error(`enrollment failed: ${result.error}`);
  return result.prepared;
}

/* --------------------------------- markup ------------------------------- */

const noop = () => {};
const render = (node: ReactNode) =>
  renderToStaticMarkup(<AppProvider>{node}</AppProvider>);

const active = (over: Partial<Parameters<typeof BackupActiveView>[0]> = {}) =>
  render(
    <BackupActiveView
      lastSavedAt={NOW}
      saveCount={2}
      hasPasskey={false}
      pending={null}
      status=""
      busy={false}
      onSaveWithPasskey={noop}
      onSaveWithPassword={noop}
      onChooseFile={noop}
      onRestoreWithPasskey={noop}
      onRestoreWithPassword={noop}
      onRestoreWithWords={noop}
      onDisable={noop}
      {...over}
    />,
  );

const setup = (over: Partial<Parameters<typeof BackupSetupView>[0]> = {}) =>
  render(
    <BackupSetupView
      passkeyOk={false}
      error=""
      busy={false}
      onPasskey={noop}
      onPassword={noop}
      onCancel={noop}
      {...over}
    />,
  );

const recovery = (over: Partial<Parameters<typeof BackupRecoveryView>[0]> = {}) =>
  render(
    <BackupRecoveryView
      words={TWELVE_WORDS}
      acknowledged={false}
      error=""
      busy={false}
      onToggleAck={noop}
      onConfirm={noop}
      onCancel={noop}
      {...over}
    />,
  );

describe("OFF — the card asks, and says what it is", () => {
  test("it offers the feature and both standing promises", () => {
    const html = render(<BackupOffView onEnable={noop} />);
    expect(html).toContain("Titkosított mentés bekapcsolása");
    // The claim that makes this different from the plain export above it.
    expect(html).toContain(CLOUD_NOTE);
    // And the honest limit of what goes into the file.
    expect(html).toContain(t("backup.scopeNote"));
  });

  test("there is no loss warning yet, because there is nothing to lose", () => {
    // Not a rule, a consequence: no code exists at this point, so the
    // sentence would be a threat about nothing. It appears the moment the user
    // is about to create one.
    const html = render(<BackupOffView onEnable={noop} />);
    expect(html).not.toContain("visszaállíthatatlan");
  });

  test("the scope note is looked up, not restated", () => {
    // It used to be a constant imported from `lib/backup.ts`. One reader is not
    // a module's worth of shared copy, so it is `backup.scopeNote` now — and
    // the card still must not hold the sentence itself.
    expect(CARD_SRC).toContain('t("backup.scopeNote")');
    expect(CARD_SRC).not.toContain("A csatolmányok");
  });

  test("it is a remembering card — one of the settings page's collapsible rows", () => {
    // Phase 2b made every settings tile collapsible, this one included. The
    // Card is still the container's shape (a `section.card`), now wrapped by
    // the CollapsibleCard head, and the id — on the SECTION, where a `?quick=`
    // deep link can scroll to it — is the key its remembered open state is
    // stored under. The views are the body inside it.
    const html = render(<BackupSettingsCard />);
    expect(html).toMatch(/<section id="settings-backup" class="card collapsible/);
    expect(html).toContain('aria-controls="card-body-settings-backup"');
    expect(html).toContain("collapsible-card-head");
    expect(CARD_SRC).toContain("CollapsibleCard");
  });
});

describe("SETUP — two secrets, and the stakes stated before either", () => {
  test("a browser with PRF is offered the passkey", () => {
    expect(setup({ passkeyOk: true })).toContain("Passkey létrehozása");
  });

  test("a browser without PRF says so, and the password path stands", () => {
    const html = setup({ passkeyOk: false });
    expect(html).not.toContain("Passkey létrehozása");
    expect(html).toContain("(PRF)");
    expect(html).toContain("Jelszavas védelem");
  });

  test("both password fields are password fields, and say so to the browser", () => {
    const inputs = setup().match(/<input[^>]*>/g) ?? [];
    expect(inputs).toHaveLength(2);
    for (const input of inputs) {
      expect(input).toContain('type="password"');
      // Case-insensitively: the server renderer emits the JSX prop name
      // (`autoComplete`), the browser reports it lowercased, and the promise
      // being made here is about what the password manager is told.
      expect(input).toMatch(/autocomplete="new-password"/i);
    }
  });

  test("the loss warning is on screen before the user creates a code to lose", () => {
    expect(setup()).toContain(LOSS_NOTE);
  });

  test("the password floor is the module's number, not a second copy of it", () => {
    expect(setup()).toContain(`Legalább ${PASSWORD_MIN_LENGTH} karakter`);
    expect(CARD_SRC).toContain("PASSWORD_MIN_LENGTH");
    expect(CARD_SRC).not.toContain("10 karakter");
    // And the policy itself is delegated, so the two cannot disagree.
    expect(CARD_SRC).toContain("passwordProblem");
  });

  test("a refused password is announced, not swallowed", () => {
    const html = setup({ error: passwordProblem("rövid")! });
    expect(html).toContain('role="alert"');
    expect(html).toContain("A jelszó legalább");
  });
});

describe("RECOVERY — twelve words, once", () => {
  test("every word is on the screen, in order", () => {
    const spans = recovery().match(/<span class="backup-word"[^>]*>[^<]*<\/span>/g) ?? [];
    expect(spans).toHaveLength(TWELVE_WORDS.length);
    TWELVE_WORDS.forEach((word, index) => expect(spans[index]).toContain(`>${word}</span>`));
  });

  test("the save button is dead until the code is acknowledged", () => {
    expect(recovery({ acknowledged: false })).toMatch(/class="btn btn-primary" disabled=""/);
    expect(recovery({ acknowledged: true })).toMatch(/class="btn btn-primary">Mentés</);
  });

  test("the acknowledgement is a real control, and the loss warning repeats", () => {
    const html = recovery({ acknowledged: true });
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("Leírtam");
    expect(html).toContain(LOSS_NOTE);
  });
});

describe("ACTIVE — the steady state", () => {
  test("it says when, and how many times", () => {
    const html = active({ lastSavedAt: NOW, saveCount: 3 });
    expect(html).toContain("Utolsó mentés:");
    expect(html).toContain(formatSaved(NOW));
    expect(html).toContain("3 mentés eddig");
  });

  test("a device that has never written says so instead of inventing a date", () => {
    const html = active({ lastSavedAt: null, saveCount: 0 });
    expect(html).toContain("Még nem készült mentés.");
    expect(html).not.toContain("Utolsó mentés:");
    expect(html).not.toContain("mentés eddig");
  });

  test("without a passkey the primary save IS the password save", () => {
    const html = active({ hasPasskey: false });
    expect(html).toContain("Mentés most");
    expect(html).not.toContain("Mentés jelszóval");
  });

  test("with a passkey both ways in are offered, and labelled apart", () => {
    const html = active({ hasPasskey: true });
    expect(html).toContain("Mentés most");
    expect(html).toContain("Mentés jelszóval");
  });

  test("restore and switch-off are always reachable", () => {
    const html = active();
    expect(html).toContain("Visszaállítás fájlból");
    expect(html).toContain("Felhőmentés kikapcsolása");
    // The scope note travels with the feature, not only with its first screen.
    expect(html).toContain(CLOUD_NOTE);
    expect(html).toContain(t("backup.scopeNote"));
  });

  test("before a file is chosen there is nothing to unlock it with", () => {
    const html = active({ pending: null });
    expect(html).not.toContain("A 12 szavas kód");
    expect(html).not.toContain("Visszaállítás a kóddal");
  });

  test("a chosen file names itself and the secrets it accepts", () => {
    const html = active({
      saveCount: 1,
      pending: { name: FILE_NAME, wraps: ["recovery"] },
    });
    expect(html).toContain(FILE_NAME);
    expect(html).toContain("recovery");
    expect(html).toContain("Visszaállítás jelszóval");
    expect(html).toContain("Visszaállítás a kóddal");
    // A file with no passkey slot must not offer the passkey button, whatever
    // this device remembers: the FILE decides which secrets exist.
    expect(html).not.toContain("Visszaállítás passkey-jal");
  });

  test("with a passkey on the device, a file that has one offers the passkey restore", () => {
    const html = active({
      hasPasskey: true,
      pending: { name: FILE_NAME, wraps: ["passkey", "recovery"] },
    });
    expect(html).toContain("Visszaállítás passkey-jal");
  });

  test("a report is announced as status, not as an error", () => {
    const html = active({ status: "Visszaállítva: 3 bejegyzés." });
    expect(html).toContain('role="status"');
    expect(html).not.toContain('role="alert"');
  });
});

describe("ERROR — something went wrong, and there is a way back", () => {
  test("the message is announced, and the card offers a way out", () => {
    const html = render(<BackupErrorView message={OPEN_FAILED} onBack={noop} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain(OPEN_FAILED);
    expect(html).toContain("Vissza");
  });
});

describe("NO SECRET IN THE DOM — every state, rendered", () => {
  test("no input carries a value, so nothing typed here can be read back out", () => {
    const states = [
      render(<BackupOffView onEnable={noop} />),
      setup(),
      setup({ passkeyOk: true }),
      recovery(),
      recovery({ acknowledged: true }),
      active(),
      active({ hasPasskey: true }),
      active({ status: "Mentés készült." }),
      render(<BackupErrorView message={OPEN_FAILED} onBack={noop} />),
    ];
    for (const html of states) expect(html).not.toMatch(/value="/);
  });

  test("the card keeps no storage key of its own", () => {
    // Every read and write goes through `lib/backup`, which owns the list of
    // what a backup touches. A `localStorage` literal here would be a key
    // nobody put on that list.
    expect(CARD_SRC).not.toContain("localStorage");
  });
});

describe("the container — what it shows without being touched", () => {
  test("with no state key it is OFF", () => {
    const html = render(<BackupSettingsCard />);
    expect(html).toContain("Titkosított mentés bekapcsolása");
    expect(html).not.toContain("Mentés most");
  });

  test("a device that has backed up starts in ACTIVE, with its history", () => {
    backing[BACKUP_STATE_KEY] = JSON.stringify({
      v: 1,
      enabled: true,
      credentialId: null,
      lastSavedAt: NOW,
      saveCount: 5,
    });
    const html = render(<BackupSettingsCard />);
    expect(html).toContain("Utolsó mentés:");
    expect(html).toContain("5 mentés eddig");
    expect(html).toContain("Felhőmentés kikapcsolása");
  });

  test("a corrupt state key reads as OFF, never as ACTIVE", () => {
    backing[BACKUP_STATE_KEY] = JSON.stringify({ v: 1, enabled: "igen" });
    expect(render(<BackupSettingsCard />)).toContain("Titkosított mentés bekapcsolása");
  });

  test("a device that switched the feature OFF is offered it again", () => {
    // `forgetBackupState` removes the key, so `enabled: false` is not a state
    // this app writes — and a card that treats any state as ACTIVE would show
    // a user who turned it off a steady state they are not in.
    backing[BACKUP_STATE_KEY] = JSON.stringify({
      v: 1,
      enabled: false,
      credentialId: null,
      lastSavedAt: null,
      saveCount: 0,
    });
    const html = render(<BackupSettingsCard />);
    expect(html).toContain("Titkosított mentés bekapcsolása");
    expect(html).not.toContain("Utolsó mentés:");
  });

  test("an enrolled passkey is remembered, and offered", () => {
    backing[BACKUP_STATE_KEY] = JSON.stringify({
      v: 1,
      enabled: true,
      credentialId: CREDENTIAL_ID,
      lastSavedAt: NOW,
      saveCount: 1,
    });
    expect(render(<BackupSettingsCard />)).toContain("Mentés most");
  });
});

describe("enrolling — two slots or it is not a backup", () => {
  test("a weak password is refused by the module's own rule", async () => {
    expect(await prepareBackupWithPassword("rövid", "rövid")).toEqual({
      ok: false,
      error: passwordProblem("rövid")!,
    });
  });

  test("two different passwords are refused before any key is derived", async () => {
    const result = await prepareBackupWithPassword(PASSWORD, "más jelszó");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBe(MISMATCH);
  });

  test("a password file carries the password AND the recovery code", async () => {
    expect(availableWraps((await enroll()).file)).toEqual(["password", "recovery"]);
  });

  test("the words on screen are the words the file opens with", async () => {
    // THE promise of the recovery slot: a code nobody re-reads still opens the
    // file, on any device, because it is derived from the words and the salt
    // the file carries — nothing local.
    const built = await enroll();
    expect(built.words).toHaveLength(12);
    // Every word is a real dictionary entry — NOT "twelve distinct words",
    // which would be a flaky assertion: twelve draws from a 1024-entry list
    // collide about 6% of the time, and a test that fails once in twenty runs
    // is a test people stop reading.
    for (const word of built.words) expect(BACKUP_WORDS).toContain(word);
    const entropy = wordsToEntropy(built.words);
    expect(entropy).not.toBeNull();
    const kek = await deriveBackupKekFromRecovery(entropy!, bytesOf(built.file.salt));
    const bundle = (await readBackupFile(built.file, "recovery", kek))!.bundle;
    expect(bundle).toContain('"app":"belso-iranytu"');
  });

  test("a wrong password opens nothing, and a tampered word is refused", async () => {
    const built = await enroll();
    const wrong = await passwordKek("nem ez a jelszó", built.file.salt);
    expect(await readBackupFile(built.file, "password", wrong)).toBeNull();

    const tampered = [...built.words];
    tampered[3] = "nemlekétszó";
    expect(await restoreBackupFile(built.file, { kind: "recovery", words: tampered })).toEqual({
      ok: false,
      error: OPEN_FAILED,
    });
  });

  test("the passkey path keeps the credential id the file will need later", async () => {
    const built = expectPrepared(
      await prepareBackupWithPasskey("Teszt", { surface: fakeSurface(), now: NOW }),
    );
    expect(built.credentialId).toBe(CREDENTIAL_ID);
    expect(availableWraps(built.file)).toEqual(["passkey", "recovery"]);
  });

  test("an authenticator without PRF is refused in the module's own words", async () => {
    const result = await prepareBackupWithPasskey("Teszt", {
      surface: {
        create: async () => ({ rawId: new Uint8Array([1, 2, 3]) }),
        get: async () => ({ rawId: new Uint8Array([1, 2, 3]) }),
      },
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("PRF");
  });
});

describe("writing — the file and the switch move together", () => {
  test("writing marks the feature on, and counts the write", async () => {
    const drive = fakeDrive();
    const built = await enroll();
    expect(await writePreparedBackup(built, { io: drive.io, now: NOW })).toEqual({
      ok: true,
      via: "picker",
    });
    expect(loadBackupState()).toEqual({
      v: 1,
      enabled: true,
      credentialId: null,
      lastSavedAt: NOW,
      saveCount: 1,
    });
    expect((await writePreparedBackup(built, { io: drive.io, now: NOW + 1_000 })).ok).toBe(true);
    expect(loadBackupState()?.saveCount).toBe(2);
  });

  test("a cancelled save leaves the feature OFF — no file, no switch", async () => {
    const built = await enroll();
    expect(await writePreparedBackup(built, { io: refusingDrive, now: NOW })).toEqual({
      ok: false,
      cancelled: true,
    });
    expect(loadBackupState()).toBeNull();
  });
});

describe("re-saving — proof first, then the same file", () => {
  test("the journal on disk is the one the file now holds", async () => {
    const drive = fakeDrive();
    const built = await enroll();
    expect((await writePreparedBackup(built, { io: drive.io, now: NOW })).ok).toBe(true);

    // A day the first backup could not have known about.
    store.saveEntry({ date: "2026-10-03", mood: 4, stress: 2, energy: 3, note: "csak most írtam le" });
    const again = await saveBackupNow(
      { kind: "password", password: PASSWORD },
      { io: drive.io, now: NOW + 60_000 },
    );
    expect(again.ok).toBe(true);
    const rewritten = parseBackupFile(drive.drive.text ?? "");
    expect(rewritten).not.toBeNull();
    const bundle = (
      await readBackupFile(rewritten!, "password", await passwordKek(PASSWORD, rewritten!.salt))
    )!.bundle;
    expect(bundle).toContain("csak most írtam le");
    expect(loadBackupState()?.saveCount).toBe(2);
  });

  test("the re-save keeps the file's own header — same salt, same slots", async () => {
    const drive = fakeDrive();
    const built = await enroll();
    await writePreparedBackup(built, { io: drive.io, now: NOW });
    const first = parseBackupFile(drive.drive.text ?? "")!;
    const again = await saveBackupNow(
      { kind: "password", password: PASSWORD },
      { io: drive.io, now: NOW + 60_000 },
    );
    expect(again.ok).toBe(true);
    const second = parseBackupFile(drive.drive.text ?? "")!;
    expect(second.salt).toBe(first.salt);
    expect(second.createdAt).toBe(first.createdAt);
    expect(availableWraps(second)).toEqual(availableWraps(first));
    expect(second.updatedAt).toBeGreaterThan(first.updatedAt);
    // And a different payload, or the file would claim a re-save it never did.
    expect(second.payload.ciphertext).not.toBe(first.payload.ciphertext);
  });

  test("a wrong password writes NOTHING, and the card is told the file stayed shut", async () => {
    const drive = fakeDrive();
    const built = await enroll();
    await writePreparedBackup(built, { io: drive.io, now: NOW });
    const before = drive.drive.text;
    const result = await saveBackupNow(
      { kind: "password", password: "nem ez a jelszó" },
      { io: drive.io, now: NOW + 60_000 },
    );
    expect(result).toEqual({ ok: false, cancelled: false, error: OPEN_FAILED });
    expect(drive.drive.text).toBe(before);
  });

  test("a cancelled picker is an answer, not an error", async () => {
    const result = await saveBackupNow(
      { kind: "password", password: PASSWORD },
      { io: refusingDrive, now: NOW },
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.cancelled).toBe(true);
    expect(result.ok === false && result.error).toBeUndefined();
  });

  test("a passkey re-saves without ever touching the password", async () => {
    const drive = fakeDrive();
    const built = expectPrepared(
      await prepareBackupWithPasskey("Teszt", { surface: fakeSurface(), now: NOW }),
    );
    expect((await writePreparedBackup(built, { io: drive.io, now: NOW })).ok).toBe(true);
    store.saveEntry({ date: "2026-10-02", mood: 1, stress: 5, energy: 2, note: "nehezű hét" });
    const again = await saveBackupNow(
      { kind: "passkey", credentialId: CREDENTIAL_ID },
      { surface: fakeSurface(), io: drive.io, now: NOW + 60_000 },
    );
    expect(again.ok).toBe(true);
    const rewritten = parseBackupFile(drive.drive.text ?? "")!;
    const bundle = (
      await readBackupFile(
        rewritten,
        "passkey",
        await passkeyKek(),
      )
    )!.bundle;
    expect(bundle).toContain("nehezű hét");
  });

  test("a file that is not ours is refused by name", async () => {
    const chosen = await chooseBackupFile({ io: fakeDrive(JSON.stringify({ hello: "world" })).io });
    expect(chosen.ok).toBe(false);
    expect(chosen.ok === false && chosen.error).toBe(NOT_OURS);
  });

  test("a chosen file reports the secrets it accepts, in the format's order", async () => {
    const drive = fakeDrive();
    await writePreparedBackup(await enroll(), { io: drive.io, now: NOW });
    const chosen = await chooseBackupFile({ io: drive.io });
    expect(chosen.ok).toBe(true);
    expect(chosen.ok === true && chosen.pending.name).toBe(FILE_NAME);
    expect(chosen.ok === true && chosen.pending.wraps).toEqual(["password", "recovery"]);
  });
});

describe("restoring — the file comes back through its owner", () => {
  test("the recovery code brings the journal back onto a bare device", async () => {
    store.saveEntry({ date: "2026-09-30", mood: 2, stress: 4, energy: 1 });
    const built = await enroll();
    // A new device: nothing of the old one survives but the file.
    clearStorage();
    store.resetAll();
    expect(store.getState().entries).toHaveLength(0);

    const result = await restoreBackupFile(built.file, { kind: "recovery", words: built.words });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.report.entriesImported).toBe(1);
    expect(store.getState().entries.map((entry) => entry.date)).toContain("2026-09-30");
    expect(restoreSummary(result.report)).toContain("1 bejegyzés");
  });

  test("the password works on a new device too, and a wrong one restores nothing", async () => {
    store.saveEntry({ date: "2026-09-29", mood: 5, stress: 1, energy: 4 });
    const built = await enroll();
    clearStorage();
    store.resetAll();
    expect(await restoreBackupFile(built.file, { kind: "password", password: "téves" })).toEqual({
      ok: false,
      error: OPEN_FAILED,
    });
    expect(store.getState().entries).toHaveLength(0);
    expect((await restoreBackupFile(built.file, { kind: "password", password: PASSWORD })).ok).toBe(
      true,
    );
    expect(store.getState().entries).toHaveLength(1);
  });

  test("the passkey slot opens the file it was enrolled into", async () => {
    const drive = fakeDrive();
    const built = expectPrepared(
      await prepareBackupWithPasskey("Teszt", { surface: fakeSurface(), now: NOW }),
    );
    expect(await writePreparedBackup(built, { io: drive.io, now: NOW })).toEqual({
      ok: true,
      via: "picker",
    });
    const restored = await restoreBackupFile(
      built.file,
      { kind: "passkey", credentialId: CREDENTIAL_ID },
      { surface: fakeSurface() },
    );
    expect(restored.ok).toBe(true);
    expect(loadBackupState()?.credentialId).toBe(CREDENTIAL_ID);
  });
});

describe("the stylesheet and the markup cannot drift apart", () => {
  test("every class the card renders is one the stylesheet defines", () => {
    const used = new Set<string>();
    for (const match of CARD_SRC.matchAll(/className="([^"{}]+)"/g)) {
      for (const cls of match[1].split(/\s+/)) used.add(cls);
    }
    // A fixed list, so a class that quietly appears — or one that quietly
    // stops being rendered — both show up here instead of on screen.
    expect([...used].sort()).toEqual([
      "add-row",
      "backup-status",
      "backup-word",
      "backup-words",
      "btn",
      "btn-block",
      "btn-ghost",
      "btn-primary",
      "btn-soft",
      "field-label",
      "muted-note",
      "pin-error",
    ]);
    for (const cls of used) {
      expect(CSS, `${cls} is rendered but not defined`).toContain(`.${cls}`);
    }
  });
});