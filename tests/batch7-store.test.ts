/**
 * Batch 7 — the store's load-time handling of `iconSet`.
 *
 * This lives in its OWN FILE, and that is not tidiness. `lib/store` reads
 * localStorage once, at module-evaluation time, and `bun test` shares a module
 * cache across files — so a test that seeds storage at the top level and then
 * imports the store passes in isolation and asserts nothing in a full run. The
 * fix is a cache-busted import after the seed, so a genuinely fresh
 * evaluation happens and the load path is really executed.
 *
 * Batch 5's equivalent test (tests/batch5-typography.test.ts) does NOT do
 * this: it seeds, then calls `setSettings` with an already-valid value, and
 * asserts on the result. That is a test of `setSettings`, wearing the costume
 * of a test of `normalizeSettings`, and it would pass if the load-time
 * coercion were deleted outright. This file tests the load.
 */
import { describe, expect, test } from "bun:test";
import { ICON_SET_IDS } from "../src/lib/iconsets";

const backing: Record<string, string> = {};
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => (k in backing ? backing[k] : null),
  setItem: (k: string, v: string) => {
    backing[k] = v;
  },
  removeItem: (k: string) => {
    delete backing[k];
  },
};

const payload = (settings: Record<string, unknown>) =>
  JSON.stringify({
    version: 2,
    entries: [],
    goals: [],
    dailyQuestion: null,
    medications: [],
    medicationChecks: {},
    profile: { name: "Teszt", goal: "" },
    settings,
  });

/**
 * Evaluate a fresh copy of the store against a seeded blob.
 *
 * The query string defeats the shared module cache, so `read()` — and with it
 * `normalizeSettings` — runs again against exactly the settings given here.
 */
async function loadWith(settings: Record<string, unknown>) {
  for (const k of Object.keys(backing)) delete backing[k];
  backing["belso-iranytu-data-v2"] = payload(settings);
  const mod = await import(`../src/lib/store?load=${Math.random()}`);
  return mod;
}

describe("a pre-Batch-7 settings blob", () => {
  test("loads with no iconSet at all, and stays that way", async () => {
    // The promise the whole batch rests on: an existing user's blob has no
    // iconSet key, and the app must render exactly as it did before.
    const { getState } = await loadWith({ textSize: "normal", theme: "light" });
    const s = getState().settings;
    expect(s.iconSet).toBeUndefined();
    expect("iconSet" in s).toBe(false);
    // ...and the rest of their settings survived untouched.
    expect(s.theme).toBe("light");
    expect(s.assessmentsEnabled).toBe(false);
  });

  test("the profile is not disturbed either", async () => {
    const { getState } = await loadWith({ theme: "dark" });
    expect(getState().profile.name).toBe("Teszt");
  });
});

describe("a valid stored choice survives", () => {
  test("each of the three ids round-trips", async () => {
    // Every id the registry offers, taken from the registry rather than copied,
    // so a fourth set added later is covered without editing this line.
    for (const id of ICON_SET_IDS) {
      const { getState } = await loadWith({ iconSet: id, theme: "light" });
      expect(getState().settings.iconSet, id).toBe(id);
      expect(getState().settings.theme, id).toBe("light");
    }
  });
});

describe("a withdrawn set is moved, not dropped", () => {
  test("a stored twemoji becomes fluent, and says so once", async () => {
    // The whole point of migrating rather than deleting: the user chose a 3D
    // look, and deleting the field would put them back on the pre-Batch-7
    // appearance with no explanation. `fluent` is the honest successor — the
    // only other 3D set, and MIT where Twemoji was CC-BY.
    const mod = await loadWith({ iconSet: "twemoji", theme: "light" });
    expect(mod.getState().settings.iconSet).toBe("fluent");
    expect(mod.consumeRetiredIconSetNotice()).toBe("twemoji");
    // Read-and-cleared: a second read must not re-announce, or the toast would
    // follow the user around for the rest of the session.
    expect(mod.consumeRetiredIconSetNotice()).toBeNull();
  });

  test("the migration is announced, never persisted", async () => {
    // The pending notice is module state, not a settings field. Writing it
    // into the blob would put an internal marker in exported user data.
    const mod = await loadWith({ iconSet: "twemoji" });
    mod.setProfile({ name: "Teszt", goal: "" }); // any save writes the blob
    const written = JSON.parse(backing["belso-iranytu-data-v2"]!);
    expect(written.settings.iconSet).toBe("fluent");
    const body = JSON.stringify(written);
    expect(body).not.toMatch(/pendingIconSetNotice|retiredIconSet/i);
  });

  test("a valid set leaves nothing pending", async () => {
    for (const id of ICON_SET_IDS) {
      const mod = await loadWith({ iconSet: id });
      expect(mod.consumeRetiredIconSetNotice(), id).toBeNull();
    }
  });

  test("junk is still dropped, and announces nothing", async () => {
    // Retirement is not a general amnesty: `TWEMOJI` in the wrong case was
    // never a stored id, so it stays junk rather than becoming a "retired" one.
    for (const junk of ["noto-3d", "3dicons", "TWEMOJI", "Twemoji", 42, null]) {
      const mod = await loadWith({ iconSet: junk });
      expect("iconSet" in mod.getState().settings, String(junk)).toBe(false);
      expect(mod.consumeRetiredIconSetNotice(), String(junk)).toBeNull();
    }
  });
});

describe("a corrupt stored choice is dropped, not rendered", () => {
  test("junk values are removed at load, and never become a default", async () => {
    // "Coerced to lucide" would be wrong here in a subtle way: writing
    // lucide would opt the user into a set they never chose, which is the
    // exact thing the absent-value design exists to prevent. Dropping the
    // key returns them to the untouched state instead.
    for (const junk of ["noto-3d", "3dicons", "TWEMOJI", 42, null, true, {}, [], ""]) {
      const { getState } = await loadWith({ iconSet: junk, theme: "light" });
      const s = getState().settings;
      expect(s.iconSet, `junk: ${JSON.stringify(junk)}`).toBeUndefined();
      expect("iconSet" in s, `junk leaked: ${JSON.stringify(junk)}`).toBe(false);
      // The other settings are still there — this is a targeted repair, not
      // a reset of the user's configuration.
      expect(s.theme).toBe("light");
    }
  });

  test("a prototype key cannot smuggle a set through", async () => {
    for (const key of ["toString", "constructor", "__proto__", "hasOwnProperty"]) {
      const { getState } = await loadWith({ iconSet: key });
      expect(getState().settings.iconSet).toBeUndefined();
    }
  });

  test("the repaired value is what gets written back on the next save", async () => {
    // So the corruption does not linger in storage, waiting to be read again.
    const { getState, setProfile } = await loadWith({ iconSet: "noto-3d" });
    expect(getState().settings.iconSet).toBeUndefined();
    setProfile({ name: "Teszt", goal: "" }); // any save goes through commit → write
    const written = JSON.parse(backing["belso-iranytu-data-v2"]!);
    expect("iconSet" in written.settings).toBe(false);
  });
});
