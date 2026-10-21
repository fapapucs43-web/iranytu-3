/**
 * Phase 6, commit 2 — the storage-key registry, and the wipe that reads it.
 *
 * THE QUESTION THIS FILE ANSWERS
 * "Minden adat törlése" grew one call per batch and never learned the keys no
 * module owns a reset for: eighteen of them, counted by Phase 5's audit and
 * left as a table in `docs/collapsible-audit.md` §5. The fix is a list the wipe
 * is derived from — `lib/storageKeys` — and this is the proof of the list.
 *
 * WHY A SOURCE SCAN AND NOT A HAND-COUNT
 * A registry asserted only against itself proves nothing; a reader can add a
 * key to a module and forget the registry, and the wipe keeps passing. So the
 * completeness test reads every `belso-iranytu*` string literal out of `src/`
 * and requires each to be in exactly one of the two lists: the keys the wipe
 * removes, or the names that look like a key and are not (the bundle's app
 * marker, the backup file and database names, the download filenames). A new
 * module that writes a key without registering it is red, by name.
 *
 * COMMENTS ARE STRIPPED FIRST, ON PURPOSE
 * Two `belso-iranytu*` names in the tree are prose rather than keys — the
 * `belso-iranytu:` house convention in `lib/cardStates` and a hypothetical
 * `belso-iranytu-mood-v2-done` flag the migration explains it did NOT add. A
 * scan that counted comments would demand they be classified as keys. Stripping
 * the block comments and full-line `//` comments leaves the literals the code
 * actually writes, which is the set the registry is about.
 */
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  APP_KEY_PREFIX,
  NON_STORAGE_NAMES,
  WIPE_KEYS,
  wipeAppStorage,
} from "../../src/lib/storageKeys";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

/* --------------------------- the storage double ------------------------ */

const local: Record<string, string> = {};
const session: Record<string, string> = {};
const globals = globalThis as unknown as { localStorage?: unknown; sessionStorage?: unknown };

function makeStore(backing: Record<string, string>) {
  return {
    getItem: (k: string) => (k in backing ? backing[k]! : null),
    setItem: (k: string, v: string) => {
      backing[k] = v;
    },
    removeItem: (k: string) => {
      delete backing[k];
    },
  };
}

globals.localStorage = makeStore(local);
globals.sessionStorage = makeStore(session);

function clearStores(): void {
  for (const k of Object.keys(local)) delete local[k];
  for (const k of Object.keys(session)) delete session[k];
}

beforeEach(clearStores);

afterAll(() => {
  clearStores();
  delete globals.localStorage;
  delete globals.sessionStorage;
});

/* ------------------------- the source, read once ----------------------- */

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(path)) out.push(path);
  }
  return out;
}

/** A quoted `belso-iranytu…` literal; the group allows `:`, `/` and `.`. */
const KEY_LITERAL = /["'`](belso-iranytu(?:[:\-/][A-Za-z0-9:/.$-]*)?)["'`]/g;

/** Every app literal in `src/`, with the first file that names it. */
function sourceKeys(): Map<string, string> {
  const found = new Map<string, string>();
  for (const abs of walk(join(ROOT, "src"))) {
    const code = readFileSync(abs, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    for (const m of code.matchAll(KEY_LITERAL)) {
      const key = m[1]!;
      if (!found.has(key)) found.set(key, abs.slice(ROOT.length).replace(/\\/g, "/"));
    }
  }
  return found;
}

/* ------------------------------ the registry --------------------------- */

describe("the storage-key registry is the whole set, read out of the tree", () => {
  test("every app literal is a wipe key or a named non-storage name", () => {
    const wipe = new Set<string>(WIPE_KEYS);
    const named = new Set<string>(NON_STORAGE_NAMES);
    const unclassified = [...sourceKeys()]
      .filter(([key]) => !wipe.has(key) && !named.has(key))
      .map(([key, file]) => `${key} (${file})`);
    expect(
      unclassified,
      "a key the app writes must be in WIPE_KEYS, or its name must be argued into " +
        "NON_STORAGE_NAMES in src/lib/storageKeys.ts",
    ).toEqual([]);
  });

  test("the scan found a real corpus, not two lucky literals", () => {
    // A scan that matched nothing would make the assertion above vacuous.
    expect(sourceKeys().size).toBeGreaterThan(30);
    expect([...sourceKeys().keys()]).toContain("belso-iranytu-data-v2");
    expect([...sourceKeys().keys()]).toContain("belso-iranytu:cardStates");
  });

  test("the two lists are disjoint, and neither carries a duplicate", () => {
    expect(WIPE_KEYS.length).toBe(new Set<string>(WIPE_KEYS).size);
    expect(NON_STORAGE_NAMES.length).toBe(new Set<string>(NON_STORAGE_NAMES).size);
    const wiped = new Set<string>(WIPE_KEYS);
    expect(NON_STORAGE_NAMES.filter((n) => wiped.has(n))).toEqual([]);
  });

  test("every wipe key is namespaced, and neither list is the prefix alone", () => {
    for (const key of WIPE_KEYS) expect(key.startsWith(APP_KEY_PREFIX)).toBe(true);
    expect(NON_STORAGE_NAMES as readonly string[]).toContain(APP_KEY_PREFIX);
  });

  test("the keys the old chain left behind, by the eighteen the audit named", () => {
    // Sampled by name as well as by the rule above, so the commit that closed
    // the residue says which keys it closed.
    for (const key of [
      "belso-iranytu-habits-v1",
      "belso-iranytu-gratitude",
      "belso-iranytu-cbt-records",
      "belso-iranytu-custom-trackers",
      "belso-iranytu-custom-activities",
      "belso-iranytu-attachments",
      "belso-iranytu-emotion-vocab",
      "belso-iranytu-onboarding",
      "belso-iranytu-locale",
      "belso-iranytu-reminder-last",
      "belso-iranytu-reminder-message",
      "belso-iranytu:openai-key",
      "belso-iranytu-assessments-v1",
      "belso-iranytu-backup-state",
      "belso-iranytu-profile",
      "belso-iranytu-install-banner-dismissed",
    ]) {
      expect(WIPE_KEYS as readonly string[], key).toContain(key);
    }
  });
});

/* ------------------------------- the wipe ------------------------------ */

describe("wipeAppStorage removes every registered key and nothing else", () => {
  test("after the wipe, no belso-iranytu key is left in either storage", () => {
    for (const key of WIPE_KEYS) {
      local[key] = "x";
      session[key] = "x";
    }
    // A key of another app, and the store's v1 goals name, prove the wipe is
    // scoped to the registry rather than a blanket clear.
    local["daily-goals"] = "v1 maradék";
    local["mas-app-kulcs"] = "nem a miénk";
    const before = Object.keys(local).filter((k) => k.startsWith(APP_KEY_PREFIX));
    expect(before.length).toBe(WIPE_KEYS.length);

    wipeAppStorage();

    const leftLocal = Object.keys(local).filter((k) => k.startsWith(APP_KEY_PREFIX));
    const leftSession = Object.keys(session).filter((k) => k.startsWith(APP_KEY_PREFIX));
    expect(leftLocal).toEqual([]);
    expect(leftSession).toEqual([]);
    expect(local["mas-app-kulcs"]).toBe("nem a miénk");
  });

  test("a storage that is not there is not an error", () => {
    const savedSession = globals.sessionStorage;
    delete globals.sessionStorage;
    for (const key of WIPE_KEYS) local[key] = "x";
    expect(() => wipeAppStorage()).not.toThrow();
    expect(Object.keys(local).filter((k) => k.startsWith(APP_KEY_PREFIX))).toEqual([]);
    globals.sessionStorage = savedSession;
  });
});

/* --------------------- the wipe chain reads the registry ---------------- */

describe("Minden adat törlése is derived from the registry", () => {
  function chain(): string {
    const source = readFileSync(join(ROOT, "src/views/SettingsView.tsx"), "utf8");
    const start = source.indexOf("onConfirm={() => {");
    expect(start, "the delete-all handler must exist in SettingsView").toBeGreaterThan(0);
    const end = source.indexOf('notify(t("settings.data.resetDone"))', start);
    expect(end, "the handler must end at its confirmation toast").toBeGreaterThan(start);
    return source.slice(start, end);
  }

  test("the chain calls wipeAppStorage, and calls it after resetAll", () => {
    const body = chain();
    expect(body).toContain("wipeAppStorage()");
    // Ordered on purpose: `resetAll` writes an empty store blob, so a registry
    // called before it would leave `belso-iranytu-data-v2` behind.
    expect(body.indexOf("wipeAppStorage()")).toBeGreaterThan(body.indexOf("resetAll()"));
  });
});
