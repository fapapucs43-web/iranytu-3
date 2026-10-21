/**
 * Round 19 — the language switcher, pinned at each seam it has.
 *
 * WHAT SHIPPED, AND WHY THE PINS ARE WHERE THEY ARE
 * Eighteen rounds put every string a reader sees into `src/lib/i18n.ts`. This
 * round opens the door the catalogue had been waiting for: `settings.locale`,
 * a three-button picker at the top of Settings' appearance group, and the
 * follow-through every other module needs to actually change language — the
 * `Intl` tag for the long dates and the numbers, the weekday initials, the
 * recogniser's grammar, and `<html lang>`.
 *
 * THE THREE SHAPES OF TEST IN HERE, and each answers a different failure:
 *  1. REGISTRY — `SUPPORTED_LOCALES`, `isLocale`, `coerceLocale`, `localeTag`.
 *     Pure functions, so these are direct assertions.
 *  2. THE MIRROR — `t()`'s default is the locale IN FORCE, and the modules that
 *     build constants at import read it from `belso-iranytu-locale`. A fresh,
 *     cache-busted import of `lib/i18n` is the only honest way to test what a
 *     reload sees, because a module reads that key once, as it initialises.
 *  3. THE STORE AND THE PICKER — `lib/store` owns the choice (the load path
 *     validates it and writes the mirror), and `SettingsView` is the only door
 *     into it. The store half is again a cache-busted import seeded with a real
 *     blob; the picker half is a static render plus a source pin for the two
 *     things a static render cannot show (the reload, and the fact that nothing
 *     else in `src/` so much as asks the browser what language it speaks).
 *
 * WHY BOTH DIRECTIONS OF THE CORRUPTION CASE
 * The locale is written into the blob by the store and can also arrive in a
 * restored backup file, which the store passes straight through. So the tests
 * below check the load path's DELETION of an unknown value AND the picker's
 * rendering of one, because only the first is `normalizeSettings`'s job: the
 * failure the second would produce is `undefined felület` over three unpressed
 * buttons, which is a rendering bug, not a storage bug.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  coerceLocale,
  hasTranslation,
  isLocale,
  localeTag,
  resolveLocale,
  setActiveLocale,
  t,
  translationKeys,
  type Locale,
} from "../src/lib/i18n";
import { resetCardStatesForTests, setCardCollapsed } from "../src/lib/cardStates";
import { DEFAULT_SETTINGS } from "../src/types";

const ts = createRequire(import.meta.url)("typescript") as typeof import("typescript");

/** The key the chosen locale is mirrored under, by name: a storage contract. */
const MIRROR_KEY = "belso-iranytu-locale";
/** The key the journal's own blob lives under, for the store-side tests. */
const BLOB_KEY = "belso-iranytu-data-v2";

/* --------------------- the storage shim, house shape --------------------- */

const backing: Record<string, string> = {};

beforeEach(() => {
  for (const k of Object.keys(backing)) delete backing[k];
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => (k in backing ? backing[k] : null),
    setItem: (k: string, v: string) => {
      backing[k] = v;
    },
    removeItem: (k: string) => {
      delete backing[k];
    },
  };
  // The catalogue is a module singleton shared with every other test file in
  // the process, so "what the process had before" is not a fixture: it is put
  // back to Hungarian here and after each test, and the mirror is cleared so a
  // fresh import below reads a known state.
  setActiveLocale(DEFAULT_LOCALE);
  delete backing[MIRROR_KEY];
});

afterEach(() => {
  setActiveLocale(DEFAULT_LOCALE);
  delete backing[MIRROR_KEY];
});

/* ---------------------------- source helpers ---------------------------- */

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const SRC = walk("src").filter((f) => /\.tsx?$/.test(f));
const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

/**
 * Does this file READ `navigator.language`?
 *
 * A parser rather than a regex, for the reason the sweep list's own header
 * argues: `lib/i18n`'s header SAYS `navigator.language` in prose, and a text
 * scan cannot tell that sentence from a lookup. This walks the AST and answers
 * only for property ACCESS on `navigator`.
 */
/** Every string literal in a file, quotes stripped — comments are not strings. */
function stringLiterals(source: string, file: string): string[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) out.push(node.text);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

function navigatorLanguageReads(source: string, file: string): string[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "navigator" &&
      (node.name.text === "language" || node.name.text === "languages")
    ) {
      out.push(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** A real journal blob, as the store's own `write` would have produced it. */
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
 * Evaluate a FRESH copy of a module against exactly this storage.
 *
 * The query string defeats the shared module cache, which is the whole point:
 * `lib/store`'s `read()` and `lib/i18n`'s `readMirroredLocale()` both run once,
 * at import, and a test that seeds storage after import asserts nothing about
 * either. Same technique as `tests/batch7-store.test.ts`.
 */
function fresh(module: string) {
  return import(`../src/lib/${module}?fresh=${Math.random()}`);
}

/* ================= 1 · the registry is closed ================= */

describe("round 19 — the locale registry is closed", () => {
  test("three locales, and Hungarian is the default one", () => {
    expect([...SUPPORTED_LOCALES]).toEqual(["hu", "en", "de"]);
    expect(DEFAULT_LOCALE).toBe("hu");
    expect(isLocale(DEFAULT_LOCALE)).toBe(true);
  });

  test("the narrowing guard accepts the three and nothing else", () => {
    for (const code of SUPPORTED_LOCALES) expect(isLocale(code)).toBe(true);
    // A tag with a region is not a locale (that is `resolveLocale`'s job), and
    // neither is a language the app cannot speak.
    for (const v of ["fr", "EN", "en-GB", "de_AT", "", null, undefined, 3, {}]) {
      expect(isLocale(v), String(v)).toBe(false);
    }
  });

  test("coerceLocale answers Hungarian for anything the build cannot render", () => {
    // The load path deletes an unknown locale; a restored backup can still hand
    // one to a render, which is what this function exists for.
    expect(coerceLocale("de")).toBe("de");
    for (const v of ["fr", "en-GB", "", null, undefined, 3, {}]) {
      expect(coerceLocale(v), String(v)).toBe(DEFAULT_LOCALE);
    }
  });

  test("every locale has its own BCP 47 tag, and the unknown falls back", () => {
    expect(localeTag("hu")).toBe("hu-HU");
    expect(localeTag("en")).toBe("en-GB");
    expect(localeTag("de")).toBe("de-DE");
    // An explicit argument, so this reads the table rather than whatever the
    // process's active locale happens to be.
    expect(new Set(SUPPORTED_LOCALES.map((l) => localeTag(l))).size).toBe(SUPPORTED_LOCALES.length);
    expect(localeTag("nope" as Locale)).toBe("hu-HU");
  });

  test("the picker's three names are in the catalogue, not in the view", () => {
    const keys = translationKeys();
    for (const code of SUPPORTED_LOCALES) {
      expect(keys, `language.${code} must exist`).toContain(`language.${code}` as never);
      expect(t(`language.${code}` as never).length).toBeGreaterThan(0);
    }
    // Autonyms: the word for a language is the same word in every language, so
    // a reader who cannot read the page still recognises their own. Asserted in
    // all three, which currently resolves through the Hungarian fallback for
    // `en`/`de` — that fallback IS the property being pinned.
    for (const locale of SUPPORTED_LOCALES) {
      expect(t("language.hu", undefined, locale)).toBe("Magyar");
      expect(t("language.en", undefined, locale)).toBe("English");
      expect(t("language.de", undefined, locale)).toBe("Deutsch");
    }
    expect(new Set(["Magyar", "English", "Deutsch"]).size).toBe(3);
  });

  test("a browser tag is matched on its base language, and unknown tags are Hungarian", () => {
    expect(resolveLocale("de-AT")).toBe("de");
    expect(resolveLocale("EN")).toBe("en");
    expect(resolveLocale("hu_HU")).toBe("hu");
    for (const v of ["fr", "", null, undefined, "  "]) expect(resolveLocale(v)).toBe("hu");
  });

  test("the coverage measurement can see the switch's own keys", () => {
    // The switcher's four chrome keys are in the default catalogue complete
    // with everything else; the other two catalogues are still nearly empty,
    // and `localeCoverage` is what says so rather than a sentence in a doc.
    for (const key of ["settings.language.title", "settings.language.summary", "settings.language.note", "settings.language.group"]) {
      expect(hasTranslation("hu", key as never), key).toBe(true);
    }
    expect(hasTranslation("hu", "language.de")).toBe(true);
  });
});

/* ============ 2 · the tag is minted once, and never asked of a browser ==== */

describe("round 19 — the tag comes from the registry, and never from the browser", () => {
  test("no module spells a locale tag of its own", () => {
    // `hu-HU` used to be written into `dates`, `trackerDisplay`, `yearInPixels`
    // and `reportPdf` — four copies of one decision, and every one of them a
    // formatter that would have kept printing Hungarian dates on an English
    // page. One table answers now, and this is the pin that says so.
    //
    // A STRING LITERAL, not a substring: `lib/csv.ts` parses `2026.05.03.` and
    // says `hu-HU` in the comment above that parser, and a text scan would
    // count that sentence as a second table.
    const holders = SRC.filter((f) => stringLiterals(read(f), f).includes("hu-HU"));
    expect(holders).toEqual(["src/lib/i18n.ts"]);
  });

  test("every formatter in that family takes its tag from `localeTag`", () => {
    for (const file of [
      "src/lib/dates.ts",
      "src/lib/trackerDisplay.ts",
      "src/lib/yearInPixels.ts",
      "src/lib/reportPdf.ts",
    ]) {
      const src = read(file);
      expect(src, file).toContain("localeTag");
      // The one import shape the family uses, so a rename has to travel.
      expect(src, file).toMatch(/import \{[^}]*localeTag[^}]*\} from "\.\/i18n";/);
    }
  });

  test("the dictation grammar and `<html lang>` follow the switch too", () => {
    // The recogniser is told which words to expect: an English reader
    // dictating into a Hungarian grammar would get nonsense back, so this is
    // not decoration.
    expect(read("src/views/SettingsView.tsx")).toContain("rec.lang = localeTag();");
    // The document's own language, which is the one a screen reader
    // pronounces the page from.
    const app = read("src/App.tsx");
    expect(app).toContain("document.documentElement.lang = localeTag();");
    expect(app).toContain("}, [data.settings.locale]);");
  });

  test("nothing in the app asks the browser what language it speaks", () => {
    // The deliberate omission this whole feature rests on: a reader whose
    // phone is in German but who has used the app in Hungarian since it was
    // Hungarian-only must not have it change under them because a format
    // detector guessed. The Settings picker is the only door.
    const offenders = SRC.flatMap((f) => navigatorLanguageReads(read(f), f));
    expect(offenders).toEqual([]);
  });
});

/* ================= 3 · the mirror is what a reload reads ================= */

describe("round 19 — the mirrored locale is what the modules hear", () => {
  test("a mirror of German makes a bare lookup German", async () => {
    backing[MIRROR_KEY] = "de";
    const fresh_i18n = await fresh("i18n");
    expect(fresh_i18n.t("meditation.title")).toBe("Meditationen");
    expect(fresh_i18n.localeTag()).toBe("de-DE");
  });

  test("a mirror with a region, or one this build dropped, still answers safely", async () => {
    backing[MIRROR_KEY] = "de-AT";
    expect((await fresh("i18n")).t("meditation.title")).toBe("Meditationen");
    for (const bad of ["fr", "", "xx-YY"]) {
      for (const k of Object.keys(backing)) delete backing[k];
      backing[MIRROR_KEY] = bad;
      const fresh_i18n = await fresh("i18n");
      expect(fresh_i18n.t("meditation.title"), bad).toBe(t("meditation.title", undefined, "hu"));
      expect(fresh_i18n.localeTag(), bad).toBe("hu-HU");
    }
  });

  test("an absent mirror is Hungarian, and is not written by the read", async () => {
    const fresh_i18n = await fresh("i18n");
    expect(fresh_i18n.t("meditation.title")).toBe(t("meditation.title", undefined, "hu"));
    expect(backing[MIRROR_KEY]).toBeUndefined();
  });

  test("`setActiveLocale` moves the lookup and writes the mirror once", () => {
    const writes: string[] = [];
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: (k: string) => (k in backing ? backing[k] : null),
      setItem: (k: string, v: string) => {
        writes.push(`${k}=${v}`);
        backing[k] = v;
      },
      removeItem: (k: string) => {
        delete backing[k];
      },
    };

    setActiveLocale("en");
    expect(backing[MIRROR_KEY]).toBe("en");
    // A bare lookup follows the choice without a reload, which is what the
    // picker's own reload is timed against: the flag is the state, the mirror
    // is the storage.
    expect(t("meditation.title")).toBe("Meditations");
    expect(localeTag()).toBe("en-GB");

    // The early return: a commit happens on every saved entry, and a write per
    // keystroke for a value that almost never changes is the cost it avoids.
    writes.length = 0;
    setActiveLocale("en");
    setActiveLocale("en");
    expect(writes).toEqual([]);

    setActiveLocale("de");
    expect(writes).toEqual([`${MIRROR_KEY}=de`]);
    expect(t("meditation.title")).toBe("Meditationen");
  });
});

/* ============= 4 · the store owns the choice, load included ============= */

describe("round 19 — the store owns the choice", () => {
  test("a blob from before this round carries no locale, and none is invented", async () => {
    backing[BLOB_KEY] = payload({ textSize: "normal", theme: "light" });
    const store = await fresh("store");
    // ABSENT rather than `"hu"`, so "picked Hungarian" and "never opened the
    // picker" stay different facts at the storage layer.
    expect(store.getState().settings.locale).toBeUndefined();
    expect("locale" in DEFAULT_SETTINGS).toBe(false);
    // The MIRROR, on the other hand, is the language in force rather than the
    // choice that produced it, so a load records the default there the same way
    // a load records a pick. The two storage layers say two different true
    // things, which is why there are two of them.
    expect(backing[MIRROR_KEY]).toBe("hu");
  });

  test("a stored locale is honoured at load, and mirrored as it loads", async () => {
    backing[BLOB_KEY] = payload({ textSize: "normal", theme: "light", locale: "de" });
    const store = await fresh("store");
    expect(store.getState().settings.locale).toBe("de");
    expect(backing[MIRROR_KEY]).toBe("de");
    // The load is where the module constants get their language: no picker, no
    // reload, just a fresh process that read the mirror before React existed.
    expect(t("meditation.title")).toBe("Meditationen");
  });

  test("a locale this build cannot render is deleted, not kept and not invented", async () => {
    backing[BLOB_KEY] = payload({ textSize: "normal", theme: "light", locale: "fr" });
    const store = await fresh("store");
    expect(store.getState().settings.locale).toBeUndefined();
    expect(backing[MIRROR_KEY]).not.toBe("fr");
    expect(t("meditation.title")).toBe(t("meditation.title", undefined, "hu"));
  });

  test("the choice lives inside `settings`, and nothing is stored beside it", async () => {
    // The bug this pins was real: `read()` had been handed a top-level
    // `locale`, which `AppData` does not have, so the value was ignored by
    // every reader and the switcher appeared to forget its choice on reload.
    backing[BLOB_KEY] = payload({ textSize: "normal", theme: "light" });
    const store = await fresh("store");
    store.setSettings({ ...store.getState().settings, locale: "en" });

    const blob = JSON.parse(backing[BLOB_KEY] as string) as Record<string, unknown>;
    expect(blob.locale, "no locale belongs at the top level of the blob").toBeUndefined();
    expect((blob.settings as Record<string, unknown>).locale).toBe("en");
    expect(backing[MIRROR_KEY]).toBe("en");

    // And the reader who comes back gets it: a second fresh load of the blob
    // that was just written, with the mirror cleared so the load is what puts
    // it back.
    delete backing[MIRROR_KEY];
    const reloaded = await fresh("store");
    expect(reloaded.getState().settings.locale).toBe("en");
    expect(backing[MIRROR_KEY]).toBe("en");
    expect(t("meditation.title")).toBe("Meditations");
  });
});

/* =================== 5 · the picker is the only door ==================== */

describe("round 19 — the picker is the only door", () => {
  const settingsView = read("src/views/SettingsView.tsx");

  test("the card exists, offers the registry's three languages, and leads the group", () => {
    expect(settingsView).toContain('id="settings-language"');
    expect(settingsView).toContain("options={LOCALES}");
    expect(settingsView).toContain("SUPPORTED_LOCALES.map((code) => (");
    expect(settingsView).toContain('t("settings.language.group")');
    expect(settingsView).toContain('t("settings.language.note")');
    // Above the accessibility card, because a reader who cannot read Hungarian
    // has to find this control before the four cards that are unreadable to
    // them — written down because it is the one thing about this card that a
    // later reordering would silently undo.
    expect(settingsView.indexOf('id="settings-language"')).toBeLessThan(
      settingsView.indexOf('id="settings-accessibility"'),
    );
  });

  test("the switch writes the store, then reloads — both halves are in the source", () => {
    expect(settingsView).toContain("setSettings({ ...data.settings, locale: next });");
    // Not a nicety: the weekday initials, the number formatter, the 48 icon
    // reasons and this file's own `LOCALES` are module constants built at
    // import, and no re-render can rebuild one.
    expect(settingsView).toContain("window.location.reload();");
    expect(settingsView).toContain("if (next === coerceLocale(data.settings.locale)) return;");
  });

  test("`resolveLocale` has exactly one caller, the mirror's own read", () => {
    const holders = SRC.filter((f) => read(f).includes("resolveLocale"));
    expect(holders).toEqual(["src/lib/i18n.ts"]);
  });
});

/* Module scope, not inside the `describe`: a `describe` callback is a function
 * body, and top-level `await` is only allowed at module scope. Same shape as
 * `tests/batch11-collapse.test.ts`, which needs the identical four providers. */
const { AppProvider } = await import("../src/state/AppContext");
const { ThemeProvider } = await import("../src/state/ThemeContext");
const { FontProvider } = await import("../src/state/FontContext");
const { IconSetProvider } = await import("../src/state/IconSetContext");
const store = await import("../src/lib/store");
const { default: SettingsView } = await import("../src/views/SettingsView");

describe("round 19 — what the opened card renders", () => {
  function fullStack(el: Parameters<typeof renderToStaticMarkup>[0]): string {
    return renderToStaticMarkup(
      createElement(
        AppProvider,
        null,
        createElement(
          ThemeProvider,
          null,
          createElement(FontProvider, null, createElement(IconSetProvider, null, el)),
        ),
      ),
    );
  }

  beforeEach(() => {
    store.resetAll(); // also puts the active locale back to Hungarian
    resetCardStatesForTests();
  });
  afterEach(() => {
    store.resetAll();
    resetCardStatesForTests();
  });

  test("the three autonyms are offered, in the registry's order, with one pressed", () => {
    setCardCollapsed("settings-language", false);
    const html = fullStack(createElement(SettingsView));

    expect(html).toContain('aria-label="A felület nyelve"');
    const order = ["Magyar", "English", "Deutsch"].map((n) => html.indexOf(`>${n}<`));
    expect(order.every((i) => i > -1), "all three languages are drawn").toBe(true);
    expect(order, "the buttons follow SUPPORTED_LOCALES").toEqual([...order].sort((a, b) => a - b));

    // Never chosen means Hungarian, and Hungarian is what the picker says is
    // in force — the app's own voice, not an unpressed row of buttons.
    expect(html).toContain('aria-pressed="true">Magyar<');
    expect(html).toContain('aria-pressed="false">English<');
    expect(html).toContain('aria-pressed="false">Deutsch<');
    // Exactly one pressed, counted INSIDE this group: the page has other
    // `aria-pressed` buttons (every card's toggle), so a page-wide count would
    // be measuring them.
    const group = html.slice(html.indexOf('aria-label="A felület nyelve"'));
    const end = group.indexOf("</div>");
    expect((group.slice(0, end).match(/aria-pressed="true"/g) ?? []).length).toBe(1);
    expect((group.slice(0, end).match(/aria-pressed="false"/g) ?? []).length).toBe(2);
    // The note says the reload is part of the switch, so nobody reads the page
    // blink as a bug.
    expect(html).toContain(t("settings.language.note"));
  });

  test("a locale no catalogue answers to renders Hungarian, never `undefined`", () => {
    // How that value can exist without the load path ever seeing it: a restored
    // backup file goes through `setSettings`, which does not normalise.
    store.setSettings({ ...store.getState().settings, locale: "fr" as Locale });
    setCardCollapsed("settings-language", false);
    const html = fullStack(createElement(SettingsView));
    // A narrowed count, so the assertion is about this card rather than about
    // `undefined` appearing anywhere in a 16-card page.
    expect(html).not.toContain("undefined");
    expect(html).toContain('aria-pressed="true">Magyar<');
  });
});
