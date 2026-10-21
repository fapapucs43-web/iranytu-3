/**
 * Batch 12 (the final wrap-up batch), commit 3c — the corrupt-theme fix.
 *
 * THE DEFECT, in one sentence: `normalizeSettings` repaired `fontFamily`,
 * `autoHideNav`, `tabOrder` and `iconSet`, but not `theme`, so a stored value
 * outside the six the picker offers reached `resolveTheme`, which returned
 * `{}`, and `applyThemeTokens` then threw `undefined is not an object
 * (evaluating 'hex.replace')` inside ThemeProvider's effect — before the first
 * painted frame, with no UI left to fix it from.
 *
 * The same field in the other place it can live was already defended:
 * `onboarding.ts` coerces a corrupt theme to `light` and `phase4.test.ts:50`
 * pins it. This file is the settings-side twin of that test.
 *
 * WHY THE SEED/IMPORT SHAPE IS WHAT IT IS: `lib/store` reads localStorage at
 * module-evaluation time and `bun test` shares a module cache across files, so
 * a test that seeds at the top level and imports the store asserts nothing in a
 * full run. Seeding inside the test and cache-busting the import is the only
 * way to make `read()` — and with it `normalizeSettings` — actually run. This
 * is `batch7-store.test.ts`'s shape, for the same reason.
 *
 * Proven failing first: with the fix reverted, "a corrupt theme coerces to
 * light" fails for every corrupt shape, and "the app does not throw on the
 * result" throws.
 */
import { describe, expect, test } from "bun:test";
import { applyThemeTokens, resolveTheme, THEME_NAMES } from "../src/lib/themes";

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

async function loadWith(settings: Record<string, unknown>) {
  for (const k of Object.keys(backing)) delete backing[k];
  backing["belso-iranytu-data-v2"] = payload(settings);
  return await import(`../src/lib/store?theme=${Math.random()}`);
}

/** Everything a corrupt blob could plausibly carry. */
const CORRUPT: [string, unknown][] = [
  ["an unknown name", "neon"],
  ["a Hungarian label", "sötét"],
  ["a wrong-case name", "Dark"],
  ["null", null],
  ["a number", 42],
  ["an object", { name: "light" }],
  ["an array", ["light"]],
  ["an empty string", ""],
  ["true", true],
];

describe("a corrupt stored theme", () => {
  test.each(CORRUPT)("%s is coerced to light", async (_label, value) => {
    const { getState } = await loadWith({ theme: value });
    expect(getState().settings.theme).toBe("light");
  });

  test("the coercion is written through, not just held in memory", async () => {
    // Assigning (rather than deleting) is the house pattern for the other
    // four fields, and the reason is the same: the next save rewrites a clean
    // blob instead of re-reading the corruption forever.
    const { getState, setSettings } = await loadWith({ theme: "neon" });
    expect(getState().settings.theme).toBe("light");
    setSettings({ ...getState().settings, textSize: "large" });
    const stored = JSON.parse(backing["belso-iranytu-data-v2"]!);
    expect(stored.settings.theme).toBe("light");
  });

  test("the repaired settings actually paint — the app does not throw", async () => {
    // The end-to-end half, and the one that states WHY the field is defended:
    // before the fix this threw, in the provider's effect, before paint.
    const props: Record<string, string> = {};
    const root = {
      style: { setProperty: (key: string, value: string) => void (props[key] = value) },
    } as unknown as HTMLElement;
    for (const [, value] of CORRUPT) {
      const { getState } = await loadWith({ theme: value });
      const loaded = getState().settings;
      expect(() => applyThemeTokens(resolveTheme(loaded.theme, loaded.customTheme), root)).not.toThrow();
      expect(props["--bg"], `nothing was painted for ${String(value)}`).toBeTruthy();
    }
  });
});

describe("a valid theme is never touched", () => {
  test.each(THEME_NAMES)("%s survives a load unchanged", async (name) => {
    const { getState } = await loadWith({ theme: name });
    expect(getState().settings.theme).toBe(name);
  });

  test("the six names are exactly what the picker offers", async () => {
    // Two lists of the same six names, one of them a hand-written literal in
    // SettingsView's source of truth. This is the pin that catches either
    // side drifting — a theme added to the registry but not the picker, or a
    // picker entry the store would coerce away.
    const { themeMeta } = await import("../src/lib/themes");
    expect(themeMeta().map((t) => t.name).sort()).toEqual([...THEME_NAMES].sort());
  });
});

describe("the four repairs that were already there are still there", () => {
  // A guard against this commit's edit quietly disturbing the neighbours.
  test("fontFamily, autoHideNav, tabOrder and iconSet keep their behaviour", async () => {
    const corrupt = await loadWith({
      fontFamily: "comic-sans",
      autoHideNav: "false",
      tabOrder: "today,insights",
      iconSet: "not-a-set",
    });
    const settings = corrupt.getState().settings;
    expect(settings.fontFamily).toBe("inter");
    // The string "false" is truthy in JavaScript, so a hand-edited export would
    // otherwise switch a feature ON for someone who had turned it off.
    expect(settings.autoHideNav).toBe(false);
    expect(settings.tabOrder).toBeUndefined();
    expect(settings.iconSet).toBeUndefined();
  });
});
