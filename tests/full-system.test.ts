/**
 * The full-system suite — fifteen journeys, end to end.
 *
 * Every other file in `tests/` asks a question about ONE module. This one asks
 * the question a user actually asks: *if I do this, does the whole app agree?*
 * Each scenario starts at a boundary a person can reach — tapping Save,
 * picking a theme, saying no to notifications — and follows the result through
 * the real store, the real views, and the real analytics, then asserts that
 * every layer tells the same story. The failure this catches is the one no
 * unit test can: a summary that says "7 óra" above a card whose body holds 6.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS FAKED, AND WHAT THAT MEANS
 * ---------------------------------------------------------------------------
 * Three behaviours, and nothing else:
 *
 *   1. `fetch`          — the weather integration is the only thing in the app
 *                         that talks to a network, so it is the only thing that
 *                         needs one faked.
 *   2. `matchMedia`     — the `auto` theme and the auto-hiding nav both ask the
 *                         OS a question a browser answers and bun cannot.
 *   3. notifications    — `Notification`, its permission, and what it was asked
 *                         to show.
 *
 * Plus one substrate rather than one behaviour: `localStorage`, because bun
 * has none and this app is entirely about what it keeps. It is a plain
 * `Record` behind the three interface methods — no ordering tricks, no quota,
 * no eviction, and every scenario starts from an empty one.
 *
 * NOT faked, deliberately, because faking any of them would make the suite
 * test the fake:
 *   - `Date`. Nothing here freezes the clock. Every date-sensitive assertion is
 *     written against the real current date, which is the mistake this
 *     repository already made once: `batch3.test.ts` compared `getDate()` for a
 *     dose that wraps past midnight and expired on the 30th of a month, in a
 *     file nobody had touched. A frozen clock would have hidden that.
 *   - `crypto.randomUUID`. Real ids, so entry identity is exercised.
 *   - Any module. There is no `mock.module`, no spy on an internal. If a
 *     scenario can only pass with something stubbed, it is not a scenario.
 *
 * ---------------------------------------------------------------------------
 * WHAT "END TO END" DOES NOT MEAN HERE, STATED PLAINLY
 * ---------------------------------------------------------------------------
 * There is no jsdom in this suite and there is not going to be one: it is a
 * dependency, and the app's own promise is that everything ships as a handful
 * of vendored files. So the renderer is `renderToStaticMarkup`, which runs no
 * EFFECTS and therefore has no click to simulate.
 *
 * The consequence is honest and worth naming: where a user journey's next step
 * is a click, this suite performs the same state transition through the same
 * exported function the click handler calls — `saveEntry`, `setSettings`,
 * `setCardCollapsed` — and then renders. That covers everything a click
 * reaches except the click itself and the DOM event plumbing above it.
 * `tests/batch11-collapse.test.ts` and the mounting assertions in this file
 * exist precisely because the rest of the suite cannot see that layer.
 *
 * The upside is that what IS covered is covered for real: real provider stack,
 * real views, real registry-derived wording, real derived numbers.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT FOUND, AND HOW IT WAS PROVEN
 * ---------------------------------------------------------------------------
 * Two real defects, both now fixed and both pinned by a scenario:
 *
 *   - `lib/weather.ts` cached a geocoding MISS and then refused to read it
 *     back, so the promise in its own doc comment — "a typo the user typed
 *     once should not cost a network round trip every time they open the
 *     form" — was not kept. S13 counts the requests and caught it.
 *   - `lib/themes.ts` writes `--ring-ok` / `--ring-warn` / `--ring-bad` on
 *     every theme switch and nothing anywhere reads them. NOT fixed: it is a
 *     three-line deletion in an app that ships as static files, and it is
 *     called out where it is checked (S07) rather than done silently in a
 *     commit about tests. Anyone who wires the aliases up deletes the
 *     exemption and the reason with it.
 *
 * A suite this size proves nothing by passing. Each of the five mutations
 * below was applied to the app, the suite run, and the change reverted; each
 * was caught by exactly one scenario — the one whose subject it is:
 *
 *   `store.ts` mergeEntry loop removed      -> S03
 *   `analysis.ts` yesterday-streak fallback -> S04
 *   `themes.ts` color-scheme line removed  -> S07
 *   `weather.ts` geocode cache ignored      -> S13
 *   `ui.tsx` stored card state ignored      -> S10
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import App from "../src/App";
import TodayView from "../src/views/TodayView";
import JournalView from "../src/views/JournalView";
import InsightsView from "../src/views/InsightsView";
import SettingsView from "../src/views/SettingsView";

import { AppProvider } from "../src/state/AppContext";
import { ThemeProvider } from "../src/state/ThemeContext";
import { FontProvider } from "../src/state/FontContext";
import { IconSetProvider } from "../src/state/IconSetContext";

import * as store from "../src/lib/store";
import { avgMoodScore, balanceScore, currentStreak, personalInsights } from "../src/lib/analysis";
import { moodByLevel } from "../src/lib/mood";
import { csvToEntries, entriesToCsv } from "../src/lib/csv";
import { THEMES, applyThemeTokens, resolveTheme } from "../src/lib/themes";
import { PREFERS_DARK, PREFERS_REDUCED_MOTION, matchesMediaQuery, subscribeToMediaQuery } from "../src/lib/media";
import { fetchWeatherFor, resetWeatherCacheForTests, weatherValuesFrom, wmoCondition } from "../src/lib/weather";
import { resetCardStatesForTests, setCardCollapsed } from "../src/lib/cardStates";
import { decideDoseFire, doseFiredKey, markDoseFired, firedKeysFor } from "../src/lib/medReminders";
import { needsOnboarding } from "../src/lib/onboarding";
import { DEFAULT_ENABLED_TRACKERS, TRACKERS, trackerGroupHeads } from "../src/lib/trackers";
import { todayISO, addDays, formatHuman } from "../src/lib/dates";
import type { Entry } from "../src/types";

/* ============================== the substrate ========================== */

const backing: Record<string, string> = {};

/**
 * A `localStorage` with the three methods the app uses and nothing else — no
 * `length`, no `key()`, no iteration. If a module ever started reaching for
 * one of those, this would throw rather than quietly return `undefined`, which
 * is the behaviour a test wants: loud, and pointing at the missing method.
 */
function installStorage(): void {
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => (k in backing ? backing[k]! : null),
    setItem: (k: string, v: string) => {
      backing[k] = v;
    },
    removeItem: (k: string) => {
      delete backing[k];
    },
  };
}

/* ============================ the three fakes ========================== */

/** Fake #2 — `matchMedia`, with answers that can change while the app runs. */
type MediaAnswers = { dark: boolean; reducedMotion: boolean };

function fakeMatchMedia(initial: MediaAnswers) {
  const answers: MediaAnswers = { ...initial };
  // Keyed by QUERY, not just by callback. A browser fires a
  // `prefers-color-scheme` listener when the colour scheme changes and not
  // when reduced motion changes; a fake that woke every listener on every
  // change would let a scenario pass with three delivered values where a real
  // browser delivers two, and would hide a subscriber attached to the wrong
  // query.
  const listeners = new Map<() => void, keyof MediaAnswers>();
  const win = {
    matchMedia(query: string) {
      const key: keyof MediaAnswers = query.includes("color-scheme") ? "dark" : "reducedMotion";
      return {
        media: query,
        get matches() {
          return answers[key];
        },
        // The modern pair. `lib/media` falls back to the legacy `addListener`
        // pair when this is absent, and that fallback is its own subject —
        // this fake provides the modern one so a scenario cannot accidentally
        // pass because it exercised the older branch.
        addEventListener: (_type: string, fn: () => void) => {
          listeners.set(fn, key);
        },
        removeEventListener: (_type: string, fn: () => void) => {
          listeners.delete(fn);
        },
      };
    },
  };
  return {
    win,
    /** Change the OS answer and tell only the subscribers of what changed. */
    set(next: Partial<MediaAnswers>) {
      const changed = (Object.keys(next) as (keyof MediaAnswers)[]).filter((k) => answers[k] !== next[k]);
      Object.assign(answers, next);
      for (const [fn, key] of listeners) if (changed.includes(key)) fn();
    },
    subscriberCount: () => listeners.size,
  };
}

/** Fake #3 — `Notification`, recording what it was asked to show. */
type Shown = { title: string; body?: string; tag?: string };
const shown: Shown[] = [];

class FakeNotification {
  static permission: NotificationPermission = "default";
  /** What `requestPermission()` resolves to — granted, denied, whatever. */
  static grantTo: NotificationPermission = "granted";
  static requestPermission = async (): Promise<NotificationPermission> => {
    FakeNotification.permission = FakeNotification.grantTo;
    return FakeNotification.permission;
  };
  constructor(
    readonly title: string,
    readonly options?: NotificationOptions,
  ) {
    shown.push({ title, body: options?.body as string | undefined, tag: options?.tag as string | undefined });
  }
}

/** Fake #1 — `fetch`, routed by URL substring, counting every call. */
type Routes = Record<string, unknown>;
const calls: string[] = [];

function fakeFetch(routes: Routes): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (key === undefined) throw new Error(`fake fetch: no route for ${url}`);
    return { ok: true, json: async () => routes[key] } as Response;
  }) as unknown as typeof fetch;
}

/* ------------------------------ rendering ------------------------------ */

/**
 * The provider stack `App` mounts, around a view.
 *
 * The view is passed to `createElement` and rendered BY REACT, not called
 * here. Calling `TodayView()` to get an element runs its hooks outside a
 * component, which React answers with "Invalid hook call" and a null
 * dispatcher — a failure that looks like a version mismatch and is really a
 * test calling the component instead of rendering it.
 */
function renderView(view: React.ComponentType): string {
  return renderToStaticMarkup(
    createElement(
      AppProvider,
      null,
      createElement(
        ThemeProvider,
        null,
        createElement(FontProvider, null, createElement(IconSetProvider, null, createElement(view))),
      ),
    ),
  );
}

/**
 * `markup.includes(needle)` as an assertion.
 *
 * A failing `expect(markup).not.toContain(needle)` prints the whole rendered
 * view — four thousand characters of SVG for TodayView — and the one thing
 * being looked for is not in it. Comparing two booleans keeps the report to
 * `Expected: false / Received: true` and puts the explanation in the message,
 * where it belongs.
 */
function has(markup: string, needle: string): boolean {
  return markup.includes(needle);
}

/**
 * The two halves of one `CollapsibleCard` out of a rendered view.
 *
 * Sliced by SEARCHING BACKWARDS from the `aria-controls` for the button's
 * opening tag, because `CollapsibleCard` writes `aria-expanded` BEFORE
 * `aria-controls`; a slice that starts at `aria-controls` silently drops the
 * one attribute this is trying to read, and every card then looks open. The
 * body's opening tag is read up to its own `>` so `hidden` is judged as an
 * attribute of that element rather than as a substring of the whole view.
 */
function collapsible(markup: string, id: string): { head: string; bodyOpen: string } {
  const at = markup.indexOf(`aria-controls="card-body-${id}"`);
  if (at < 0) throw new Error(`no collapsible card with id ${id} in this view`);
  const head = markup.slice(markup.lastIndexOf("<button", at), markup.indexOf("</button>", at));
  const bodyAt = markup.indexOf(`id="card-body-${id}"`, at);
  const bodyOpen = markup.slice(bodyAt, markup.indexOf(">", bodyAt));
  return { head, bodyOpen };
}

const TODAY = todayISO();
const YESTERDAY = addDays(TODAY, -1);

/** An entry for `date`, with everything a scenario needs and nothing else. */
function entryOn(date: string, over: Partial<Entry> = {}): Partial<Entry> & { date: string } {
  return { date, mood: 3, stress: 5, energy: 5, activities: [], note: "", ...over };
}

/* ------------------------------- lifecycle ----------------------------- */

beforeEach(() => {
  for (const k of Object.keys(backing)) delete backing[k];
  shown.length = 0;
  calls.length = 0;
  FakeNotification.permission = "default";
  FakeNotification.grantTo = "granted";
  installStorage();
  // A `window` that can answer media questions and hold notifications. It is
  // installed rather than deleted because two modules ask "is there a window?"
  // first, and "no" is a legitimate answer this suite should not be testing.
  (globalThis as unknown as { window: unknown }).window = {
    matchMedia: fakeMatchMedia({ dark: false, reducedMotion: false }).win.matchMedia,
  };
  (globalThis as unknown as { window: Record<string, unknown> }).window.Notification = FakeNotification;
  (globalThis as unknown as { Notification: unknown }).Notification = FakeNotification;
  (globalThis as unknown as { fetch: unknown }).fetch = fakeFetch({});
  // The store is a MODULE binding shared with every other test file, so this
  // scenario list is a good citizen and resets it in both directions.
  store.resetAll();
  resetCardStatesForTests();
  resetWeatherCacheForTests();
});

afterEach(() => {
  store.resetAll();
  resetCardStatesForTests();
  resetWeatherCacheForTests();
});

/* =============================== 15 journeys ============================ */

type Scenario = [string, () => void | Promise<void>];

const SCENARIOS: Scenario[] = [
  [
    "S01 · a fresh install is empty, and every screen admits it",
    () => {
      // Nothing saved. The temptation with a journal is to greet a new user
      // with fabricated history; the claim is that all four screens say
      // "nothing yet" in the app's own words instead.
      expect(store.getState().entries).toEqual([]);
      expect(needsOnboarding()).toBe(true);

      const today = renderView(TodayView);
      const journal = renderView(JournalView);
      const insights = renderView(InsightsView);
      const settings = renderView(SettingsView);

      // Each screen carries an empty state, not a blank one. The insights
      // screen replaces its whole body at zero entries rather than drawing
      // five cards that each say they have nothing — the copy promises
      // patterns after three days, and showing five "not enough data" cards
      // before then would be five ways of saying the same no.
      expect(journal).toContain("empty-state");
      expect(insights).toContain("empty-state");
      expect(insights).toContain("Még nincs adat");
      expect(today).toContain("view");
      // The settings cards state their defaults rather than showing nothing.
      expect(settings).toContain("Név és cél megadása");
      expect(settings).toContain("Az alsó sáv mindig látszik");
      // And the derived numbers agree with the absence of entries.
      expect(currentStreak([])).toBe(0);
      // The insight engine still ANSWERS at zero entries — one plain line
      // saying what it is waiting for, rather than an empty array. An empty
      // array would render as a card with a heading and nothing under it,
      // which is the "silently blank" failure this suite exists to catch.
      const cold = personalInsights([]);
      expect(cold).toHaveLength(1);
      expect(cold[0]!.text).toContain("három után indul az elemzés");
      expect(cold[0]!.icon).toBeTruthy();
    },
  ],

  [
    "S02 · saving one day moves every derived number at once",
    () => {
      // Batch A: the saved day carries the new flow's fields too, since that
      // is what the default recorder writes — the fallback `mood` level
      // stays alongside them for the old analytics.
      store.saveEntry(
        entryOn(TODAY, {
          mood: 4,
          stress: 3,
          energy: 7,
          activities: ["🚶 Mozgás"],
          moodEnergy: 8,
          pleasantness: 7,
          quadrant: "high-pos",
          emotion: "Boldog",
          emotionIntensity: 7,
        }),
      );
      const [saved] = store.getState().entries;
      expect(saved).toBeDefined();

      // The analytics read the store, so they cannot be a day behind it.
      expect(currentStreak(store.getState().entries)).toBe(1);
      expect(avgMoodScore(store.getState().entries)).toBe(moodByLevel(4).score);
      expect(balanceScore(saved!)).toBeGreaterThan(0);

      // …and the two screens that show today both show it: the quadrant
      // summary on the new-flow card, the level in the journal's records.
      const today = renderView(TodayView);
      expect(today).toContain("Derűs és aktív");
      expect(today).toContain("Boldog");
      const journal = renderView(JournalView);
      expect(journal).toContain(formatHuman(TODAY));
      // The journal is not showing a phantom second entry.
      expect(store.getState().entries).toHaveLength(1);
    },
  ],

  [
    "S03 · a second write to the same day updates it instead of duplicating it",
    () => {
      // This is what the reflection, vitals, voice and edit surfaces all do:
      // they own a PART of the day and save it without knowing what else is
      // on it. A store that replaced the entry would lose the morning's data
      // the first time somebody answered the evening question.
      store.saveEntry(
        entryOn(TODAY, {
          mood: 2,
          note: "reggel",
          attachments: [{ id: "keep-me", kind: "photo", name: "a.jpg", type: "image/jpeg", size: 1 }],
        } as Partial<Entry>),
      );
      // Deliberately NOT `entryOn(...)`: the evening reflection sends only
      // what it owns. Sending the helper's defaults here would carry `mood: 3`
      // into the patch and quietly overwrite the morning's answer — the very
      // bug this scenario exists to catch, hidden by a convenient helper.
      store.saveEntry({ date: TODAY, reflection: { feeling: "jobb", stressReason: "", need: "" } });

      const entries = store.getState().entries;
      expect(entries).toHaveLength(1);
      expect(entries[0]!.mood).toBe(2);
      // The part the second writer did not touch survived.
      expect(entries[0]!.note).toBe("reggel");
      expect(entries[0]!.attachments?.map((a) => a.id)).toEqual(["keep-me"]);
      expect(entries[0]!.reflection.feeling).toBe("jobb");
      // Still one day, so still one streak day — not two.
      expect(currentStreak(entries)).toBe(1);
    },
  ],

  [
    "S04 · deleting the day returns the app to where it started",
    () => {
      store.saveEntry(entryOn(TODAY, { mood: 5 }));
      store.saveEntry(entryOn(YESTERDAY, { mood: 4 }));
      expect(store.getState().entries).toHaveLength(2);
      expect(currentStreak(store.getState().entries)).toBe(2);

      const target = store.getState().entries.find((e) => e.date === TODAY)!;
      store.deleteEntry(target.id);

      expect(store.getState().entries.map((e) => e.date)).toEqual([YESTERDAY]);
      // The streak does NOT break: a day that has not been written yet is not
      // a missed day, and yesterday's entry still counts. This is the rule a
      // user meets every morning, so it is worth asserting rather than
      // assuming.
      expect(currentStreak(store.getState().entries)).toBe(1);
      // The storage blob was rewritten, not merely mutated in memory.
      expect(JSON.parse(backing["belso-iranytu-data-v2"]!).entries).toHaveLength(1);
      // …and the journal no longer lists the day that is gone.
      expect(renderView(JournalView)).not.toContain(`>${TODAY}<`);

      // Take the second day too and the streak is honestly zero — a streak is
      // consecutive days, not a count of days on file.
      store.deleteEntry(store.getState().entries[0]!.id);
      expect(store.getState().entries).toEqual([]);
      expect(currentStreak(store.getState().entries)).toBe(0);
      expect(renderView(JournalView)).toContain("empty-state");
    },
  ],

  [
    "S05 · what the user exports can be imported back, and means the same thing",
    () => {
      const original = [
        store.saveEntry(entryOn(TODAY, { mood: 4, stress: 2, energy: 8, activities: ["🚶 Mozgás", "🎵 Zene"], note: "szép nap" })),
        store.saveEntry(entryOn(YESTERDAY, { mood: 2, stress: 7, energy: 3, activities: ["💻 Munka"], tags: ["munka"] })),
      ];

      const csv = entriesToCsv(original);
      expect(csv.split("\n")[0]).toContain("date");

      const restored = csvToEntries(csv);
      expect(restored.map((e) => e.date).sort()).toEqual([YESTERDAY, TODAY].sort());
      expect(restored.map((e) => e.mood).sort()).toEqual([2, 4]);
      expect(restored.find((e) => e.date === TODAY)!.activities.sort()).toEqual(["🎵 Zene", "🚶 Mozgás"].sort());

      // The numbers a reader would recognise come back identical — this is the
      // claim the export button makes, checked through the analytics rather
      // than by eyeballing two tables.
      expect(currentStreak(restored)).toBe(currentStreak(original));
      expect(avgMoodScore(restored)).toBe(avgMoodScore(original));

      // And importing really does merge into the journal.
      store.importEntries(restored);
      expect(store.getState().entries).toHaveLength(2);
    },
  ],

  [
    "S06 · a v1 install is lifted into v2 rather than lost",
    async () => {
      // A genuinely fresh module evaluation, because `lib/store` reads
      // storage once at import and bun shares its module cache across files —
      // the same technique, and for the same reason, as `batch7-store.test.ts`.
      for (const k of Object.keys(backing)) delete backing[k];
      backing["belso-iranytu-data"] = JSON.stringify({
        version: 1,
        entries: [{ date: "2026. 05. 03.", mood: "3", tags: ["sport"] }],
      });
      backing["belso-iranytu-profile"] = JSON.stringify({ name: "Réka", goal: "nyugodtabb" });
      backing["belso-iranytu-data-v2"] = undefined as unknown as string;
      delete backing["belso-iranytu-data-v2"];

      const fresh = await import(`../src/lib/store?fullsystem=${Math.random()}`);
      const state = fresh.getState();

      expect(state.entries).toHaveLength(1);
      const lifted = state.entries[0]!;
      // The legacy date format is normalised…
      expect(lifted.date).toBe("2026-05-03");
      // …the legacy mood string became a real level…
      expect(lifted.mood).toBe(3);
      // …legacy tags became activities…
      expect(lifted.activities).toEqual(["sport"]);
      // …and it is marked as imported rather than hand-written.
      expect(lifted.source).toBe("import");
      expect(state.profile).toEqual({ name: "Réka", goal: "nyugodtabb" });

      // The v2 blob is now the source of truth…
      expect(JSON.parse(backing["belso-iranytu-data-v2"]!).entries).toHaveLength(1);
      // …and the v1 keys are left exactly where they were, untouched, so a
      // downgrade would still find them.
      expect(backing["belso-iranytu-data"]).toContain("2026. 05. 03.");
      expect(backing["belso-iranytu-profile"]).toContain("Réka");

      // It is a usable journal, not just a parsed blob: the lifted entry
      // exports like any other.
      expect(entriesToCsv(state.entries)).toContain("2026-05-03");
    },
  ],

  [
    "S07 · choosing a dark theme repaints the document and the summary together",
    () => {
      store.setSettings({ ...store.getState().settings, theme: "dark" });

      // The one function that writes to the document root, driven the way the
      // provider drives it — and a recording element instead of a real one.
      const written = new Map<string, string>();
      const root = { style: { setProperty: (k: string, v: string) => void written.set(k, v) } };
      const tokens = resolveTheme("dark", undefined);
      applyThemeTokens(tokens, root as unknown as HTMLElement);

      // Every token the theme declares reaches the document, under a name the
      // stylesheet already accounts for. The names are NOT `--` plus the token
      // key — `bgSoft` is written as `--bg-soft` and `surface2` as
      // `--surface-2` — so they are checked against the CSS rather than derived
      // by a rule, because a token written under a name nothing reads is a
      // theme that silently does not apply and no unit test would notice.
      //
      // WHAT THE CHECK IS ACTUALLY FOR, since it is easy to misread: the
      // assertion is `css` contains `--name:`, which matches a DECLARATION, so
      // it is really "every property this function writes also has a DEFAULT
      // declared in the stylesheet". That is what the `body` block is for: it
      // defaults `--on-*` and `--app-bg-scrim-rgb` so the first frame — before
      // `applyThemeTokens` has ever run — has a value rather than an undefined
      // one. The ring trio had no such default, which is a second, separate
      // reason they were exempt.
      //
      // Twenty-four, not fourteen: the fourteen theme tokens, four `--on-*`
      // foregrounds derived from them, three `--ring-*` aliases for the mood
      // curve and the balance ring, one `--app-bg-scrim-rgb` triple that
      // gives the custom-background tint the active theme's polarity, one
      // `--control-line` that gives a control's border enough contrast to be
      // identifiable, and one `--app-page` that carries a backdrop preset's
      // page picture — or `var(--bg)`, which is what keeps the flat themes
      // painting exactly what they painted before it existed. All twenty-four
      // are read by the stylesheet; none is exempted.
      //
      // The fourteenth token is `--danger-soft`, which used to be a
      // hand-written `:root` hex shared by all four palettes. It is a token
      // now, which is what lets the dark theme paint a dark chip under its own
      // light `--danger` instead of a light pink at 2.33:1.
      expect(Object.keys(THEMES.dark)).toHaveLength(14);
      const css = readFileLike("../src/styles.css");
      const customProps = [...written.keys()].filter((k) => k !== "color-scheme");
      expect(customProps).toHaveLength(24);
      //
      // FINDING (Batch 13, commit 5), RESOLVED (commit 10): `--ring-ok`,
      // `--ring-warn` and `--ring-bad` were the odd three out. `applyThemeTokens`
      // wrote them; nothing read them (the balance ring and the mood curve each
      // carried a hand-picked hex, so both kept painting one theme's palette
      // after a switch) AND nothing defaulted them (no `body` declaration, so
      // the first frame had no value at all). Commit 10 does both — it declares
      // them beside the `--on-*` defaults and reads them at `.ring-value-*` and
      // `.chart-series-*` through `currentColor` — and the exemption is GONE.
      //
      // The exemption was a `continue`, which is permissive: it would have
      // skipped these three whatever happened to them later, so the note beside
      // it ("the day a reader wires them up, this loop fails") described an
      // intent the code did not have. Deleting it is what makes that true. All
      // twenty-two now carry the same obligation as the other twenty-one.
      for (const prop of customProps) {
        expect(prop).toMatch(/^--[a-z0-9-]+$/);
        expect(written.get(prop), `${prop} has no value`).toBeTruthy();
        expect(css, `${prop} is written but the stylesheet never accounts for it`).toContain(`${prop}:`);
      }
      // Spot-check the two that carry the most visible meaning.
      expect(written.get("--bg")).toBe(THEMES.dark.bg);
      expect(written.get("--ink")).toBe(THEMES.dark.ink);
      // A derived foreground is the readability rule applied to the FILLED
      // token — not a constant, and not the theme's mood. The dark theme's
      // brand is a light mint, so the readable text on it is the dark ink;
      // running the same function over the light theme's dark green gives
      // white. Asserting `#ffffff` here would be asserting that this button
      // is unreadable.
      expect(written.get("--on-brand")).toBe("#16211d");
      const onLight = new Map<string, string>();
      applyThemeTokens(resolveTheme("light", undefined), {
        style: { setProperty: (k: string, v: string) => void onLight.set(k, v) },
      } as unknown as HTMLElement);
      expect(onLight.get("--on-brand")).toBe("#ffffff");
      // And the browser is told, which is what stops a dark theme being a dark
      // page with light scrollbars. Note that the two answers are computed
      // from DIFFERENT tokens on purpose: the foreground from the filled
      // colour, `color-scheme` from the background. On the dark theme they
      // disagree — light browser widgets, dark text on a mint button — and
      // that is the correct answer to two different questions.
      expect(written.get("color-scheme")).toBe("dark");
      expect(written.get("--on-brand")).not.toBe("#ffffff");

      // The collapsed settings card says so, in the picker's own words.
      const settings = renderView(SettingsView);
      const label = settings.match(/<span class="collapsible-card-summary">([^<]*)<\/span>/g)!.join("|");
      expect(label).toContain("Sötét");
      expect(label).not.toContain("Világos");
    },
  ],

  [
    "S08 · the `auto` theme follows the operating system, and keeps following it",
    () => {
      const media = fakeMatchMedia({ dark: true, reducedMotion: false });
      (globalThis as unknown as { window: Record<string, unknown> }).window.matchMedia = media.win.matchMedia;

      // The `auto` preset asks the OS rather than guessing.
      expect(matchesMediaQuery(PREFERS_DARK)).toBe(true);
      expect(resolveTheme("auto", undefined).bg).toBe(THEMES.dark.bg);

      // And the subscription that keeps it live while the app is open. The
      // first call is immediate, so a caller never reads a stale answer.
      const seen: boolean[] = [];
      const unsubscribe = subscribeToMediaQuery(PREFERS_DARK, (v) => seen.push(v), media.win);
      expect(seen).toEqual([true]);
      expect(media.subscriberCount()).toBe(1);

      // The user flips their OS theme while the app is open.
      media.set({ dark: false });
      expect(seen).toEqual([true, false]);
      expect(resolveTheme("auto", undefined, media.win).bg).toBe(THEMES.light.bg);

      // Reduced motion is the same question to a different consumer, and the
      // nav honours it rather than animating anyway. Changing it must NOT wake
      // the colour-scheme subscriber — a browser would not.
      media.set({ reducedMotion: true });
      expect(matchesMediaQuery(PREFERS_REDUCED_MOTION, media.win)).toBe(true);
      expect(seen).toEqual([true, false]);

      unsubscribe();
      expect(media.subscriberCount()).toBe(0);
      // After unsubscribing, a change reaches nobody — the guard exists so a
      // stale listener cannot keep a dead component alive.
      media.set({ dark: true });
      expect(seen).toEqual([true, false]);
    },
  ],

  [
    "S09 · text size and contrast reach the document shell",
    () => {
      // The whole `App` — providers, shell, nav, onboarding, schedulers and
      // the lock gate — not a stand-in for it.
      const plain = renderToStaticMarkup(createElement(App));
      expect(plain).toContain('<div data-theme="light" class="app">');

      store.setSettings({
        ...store.getState().settings,
        textSize: "xlarge",
        highContrast: true,
        theme: "warm",
      });
      const adjusted = renderToStaticMarkup(createElement(App));
      expect(adjusted).toContain('data-theme="warm"');
      expect(adjusted).toMatch(/class="app text-xlarge contrast-high"/);
      // The classes the stylesheet actually defines, so a rename in one place
      // cannot leave the other silently disagreeing.
      const css = readFileLike("../src/styles.css");
      for (const cls of [".app.text-large", ".app.text-xlarge", ".app.contrast-high"]) {
        expect(css, `${cls} is applied but not defined`).toContain(cls);
      }
    },
  ],

  [
    "S10 · eleven settings cards, three reopened, and a reload that remembers",
    () => {
      // Batch A adds the mood-recorder card; the count in the title is the
      // pre-Batch-A wording, kept so the scenario names stay stable.
      const ALL = [
        "settings-profile",
        // Phase 2 — the language switcher, collapsed like every other row and
        // never opened by this scenario.
        "settings-language",
        "settings-accessibility",
        "settings-font",
        "settings-iconset",
        "settings-navigation",
        "settings-theme",
        "settings-trackers",
        "settings-modules",
        "settings-privacy",
        "settings-mood-flow",
      ];
      // `settings-nutrition-tips` and `settings-sport-tips` are NOT in this
      // list. Phase 1 moved them to the Ma tab's toolbox, and the toolbox is a
      // `Collapsible` with `defaultOpen = false` that renders `{isOpen &&
      // children}` — so a server render of Ma draws neither of them, opened or
      // not. Their collapse contract is pinned where it can be observed:
      // tests/batch11-collapse asserts both live inside the Ma toolbox and are
      // gone from Settings. Listing them here would assert against markup no
      // page draws.
      const reopened = ["settings-theme", "settings-font", "settings-trackers"];

      for (const id of reopened) setCardCollapsed(id, false);
      // The reload: the bytes stay, the module cache goes.
      resetCardStatesForTests();

      const settings = renderView(SettingsView);
      for (const id of ALL) {
        const { head, bodyOpen } = collapsible(settings, id);
        if (reopened.includes(id)) {
          expect(head, `${id} should be open`).toContain('aria-expanded="true"');
          expect(bodyOpen, `${id} body should not be hidden`).not.toContain("hidden");
        } else {
          expect(head, `${id} should still be collapsed`).toContain('aria-expanded="false"');
          expect(bodyOpen, `${id} body should be hidden`).toContain('hidden=""');
        }
      }
      // Three flags, one key, and the three Batch 11 cards in the same view
      // never moved.
      expect(Object.keys(JSON.parse(backing["belso-iranytu:cardStates"]!))).toHaveLength(3);
      expect(settings).toContain('aria-controls="card-body-health-import"');
    },
  ],

  [
    "S11 · turning a tracker group on changes the summary AND the entry form",
    () => {
      // TrackerInputs renders only the ENABLED groups, so this is the one
      // journey where a setting and a screen are the same fact.
      expect(DEFAULT_ENABLED_TRACKERS).toHaveLength(2);
      expect(renderView(SettingsView)).toContain("2 / 7 csoport bekapcsolva");
      expect(renderView(TodayView)).not.toContain('aria-controls="card-body-tracker-steps"');

      store.setSettings({
        ...store.getState().settings,
        enabledTrackers: [...DEFAULT_ENABLED_TRACKERS, "steps"],
      });

      // The count the settings card shows…
      expect(renderView(SettingsView)).toContain("3 / 7 csoport bekapcsolva");
      // …and the form gained the group, collapsed and summarised like the rest.
      const today = renderView(TodayView);
      expect(today).toContain('aria-controls="card-body-tracker-steps"');
      expect(today).toContain("Lépésszám");
      // Steps is a typed number with no default, so its honest line is the
      // "nothing recorded yet" one rather than a fabricated zero.
      expect(today).toContain("— ma még nincs adat");
      // Still the same seven groups in the registry; only which are on changed.
      expect(trackerGroupHeads()).toHaveLength(7);
    },
  ],

  [
    "S12 · a module switched off removes its surface, and on brings it back",
    () => {
      // The modules card's summary is the SAME evaluation that decides what
      // the views draw (`SettingsView`'s `enabledModuleCount`), and a summary
      // is always in the head — so it is observable even while the card is
      // collapsed, which is how a user sees it before ever opening it.
      expect(renderView(SettingsView)).toContain("2 / 5 modul bekapcsolva");

      // Three different modules, three genuinely different surfaces, because
      // that is where each one happens to live: the energy slider is inline in
      // TodayView, the medication card is a top-level card in SettingsView,
      // and the vitals form is inside the Eszköztár disclosure — which is
      // CLOSED by design, so no cold render can see it. Asserting on a module
      // the user has not opened would be asserting on a renderer that runs
      // effects, and this suite has none.
      expect(renderView(TodayView)).toContain('id="slider-Energia"');
      expect(has(renderView(SettingsView), "Gyógyszeridőpontok"), "medsModule is off").toBe(false);

      store.setSettings({
        ...store.getState().settings,
        energyModule: false,
        medsModule: true,
        vitalsModule: true,
      });
      // Three modules gained and one lost, and the count follows the settings
      // rather than the other way round.
      expect(renderView(SettingsView)).toContain("3 / 5 modul bekapcsolva");
      // The surfaces came and went with them.
      expect(has(renderView(TodayView), 'id="slider-Energia"'), "energyModule is off").toBe(false);
      expect(renderView(SettingsView)).toContain("Gyógyszeridőpontok");

      // …and off again, so the switch is a switch and not a one-way door.
      store.setSettings({
        ...store.getState().settings,
        energyModule: true,
        medsModule: false,
        vitalsModule: false,
      });
      expect(renderView(SettingsView)).toContain("2 / 5 modul bekapcsolva");
      expect(has(renderView(SettingsView), "Gyógyszeridőpontok"), "medsModule is off again").toBe(false);
      expect(renderView(TodayView)).toContain('id="slider-Energia"');

      // The consent-gated assessment module is the same shape: a setting alone
      // is not consent, so the toggle opens a dialog rather than enabling
      // anything — which is what the summary count, still at 2, proves.
      store.setSettings({ ...store.getState().settings, assessmentsEnabled: true });
      expect(renderView(SettingsView)).toContain("3 / 5 modul bekapcsolva");
    },
  ],

  [
    "S13 · with no location chosen, the weather integration makes no request",
    async () => {
      // The promise the privacy copy makes — "the app sends data nowhere" —
      // stated as a counter, not as a sentence.
      (globalThis as unknown as { fetch: unknown }).fetch = fakeFetch({});
      const day = await fetchWeatherFor(null, TODAY);

      expect(day.ok).toBe(false);
      expect(day).toEqual({ ok: false, reason: "no-location" });
      expect(calls).toEqual([]);

      // A card that cannot fetch must still render an honest card.
      const settings = renderView(SettingsView);
      expect(settings).toContain('aria-controls="card-body-weather-api"');
      expect(settings).toContain("Időjárás automatikusan");

      // Even a city the geocoder has never heard of is one request, not a
      // retry storm — and a miss is cached, so reopening the form costs none.
      (globalThis as unknown as { fetch: unknown }).fetch = fakeFetch({ "geocoding-api": { results: [] } });
      const missed = await fetchWeatherFor({ source: "city", name: "Nowhereville" }, TODAY);
      expect(missed.ok).toBe(false);
      expect(calls).toHaveLength(1);
      const again = await fetchWeatherFor({ source: "city", name: "nowhereville" }, TODAY);
      expect(again.ok).toBe(false);
      // The second attempt never left the device: the cache is lowercased, so
      // "Nowhereville" and "nowhereville" are the same miss.
      expect(calls).toHaveLength(1);
    },
  ],

  [
    "S14 · a chosen city goes out through the network and comes back as tracker values",
    async () => {
      (globalThis as unknown as { fetch: unknown }).fetch = fakeFetch({
        "geocoding-api": { results: [{ latitude: 47.4979, longitude: 19.0402, name: "Budapest" }] },
        "api.open-meteo.com": {
          daily: { time: [TODAY], weather_code: [3], temperature_2m_mean: [21.6] },
        },
      });

      const day = await fetchWeatherFor({ source: "city", name: "Budapest" }, TODAY);
      expect(day.ok).toBe(true);
      if (day.ok) {
        // WMO 3 is "overcast", which the app speaks in Hungarian and not in
        // the API's own vocabulary.
        expect(day.condition).toBe(wmoCondition(3));
        expect(day.condition).not.toBe("");
        // The temperature is rounded to a whole degree for the slider.
        expect(day.temp).toBe(22);
      }
      expect(calls).toHaveLength(2); // one geocode, one forecast

      // The fetch only becomes data by being turned into the registry's own
      // value shape — which is what the tracker input can actually store.
      const values = weatherValuesFrom(day);
      expect(values["weather-condition"]).toEqual({ kind: "select", value: wmoCondition(3) });
      expect(values["weather-temp"]).toEqual({ kind: "number", value: 22 });

      // And storing them is what makes the collapsed card report the weather,
      // through the same summary every other tracker group uses — but only
      // once the user has asked for the group. Tracker values for a group
      // that is off are stored and ignored, exactly like the manual fields the
      // module was introduced to fill, so switching the group on first is part
      // of the journey rather than a detail.
      store.setSettings({
        ...store.getState().settings,
        enabledTrackers: [...DEFAULT_ENABLED_TRACKERS, "weather-condition"],
      });
      const saved = store.saveEntry(entryOn(TODAY, { trackerValues: values }));
      const { head } = collapsible(renderView(TodayView), "tracker-weather-condition");
      // What the card says is derived from the REGISTRY, not typed here: the
      // `cloudy` the API returned is a value, and what a user reads is the
      // registry's Hungarian label for it. A hard-coded "felhős" here would
      // pass on the day the registry's wording changed and the day it broke.
      const condDef = TRACKERS.find((d) => d.id === "weather-condition")!;
      const condLabel =
        condDef.input.kind === "select"
          ? (condDef.input.options.find((o) => o.id === day.condition)?.label ?? "")
          : "";
      expect(condLabel, "WMO 3 must have a label in the registry").not.toBe("");
      expect(head, "the collapsed weather card must say what was recorded").toContain(condLabel);
      expect(head, "…and the temperature it stored").toContain("22");
      expect(saved.trackerValues?.["weather-temp"]).toEqual({ kind: "number", value: 22 });
    },
  ],

  [
    "S15 · notifications: refused stays silent, granted fires exactly one dose",
    async () => {
      // Refused. Nothing is constructed, and the daemon says why.
      FakeNotification.permission = "denied";
      expect(shown).toEqual([]);
      const refused = decideDoseFire({
        enabled: true,
        meds: [{ id: "m1", name: "A", times: ["08:00"], remind: true }],
        now: new Date(),
        permission: "denied",
      });
      expect(refused).toEqual({ action: "skip", reason: "no-permission" });

      // Default, then granted through the real request path.
      FakeNotification.permission = "default";
      const granted = await import("../src/lib/notifications");
      expect(await granted.requestPermission()).toBe("granted");
      expect(granted.permissionState()).toBe("granted");

      // Granted. A dose that is due fires, with the medication's own wording.
      const now = new Date();
      now.setHours(9, 0, 0, 0);
      const due = decideDoseFire({
        enabled: true,
        meds: [{ id: "m1", name: "A", times: ["08:00"], remind: true }],
        now,
        permission: "granted",
      });
      expect(due.action).toBe("fire");
      expect(granted.showDoseReminder("A", "1 tabletta", "08:00")).toBe(true);
      expect(shown).toEqual([{ title: "Belső Iránytű 💊", body: "A — 1 tabletta", tag: "dose-08:00" }]);

      // The same dose must not fire twice: the daemon records it under the key
      // `doseFiredKey` builds — date, medication and time, not medication and
      // time — and the next decision says there is nothing due. The key is
      // DERIVED here rather than typed, so this cannot pass by writing a
      // plausible-looking string the scheduler would never have matched.
      markDoseFired(TODAY, doseFiredKey("m1", "08:00", TODAY));
      expect(firedKeysFor(TODAY)).toEqual([`${TODAY}|m1|08:00`]);
      const again = decideDoseFire({
        enabled: true,
        meds: [{ id: "m1", name: "A", times: ["08:00"], remind: true }],
        now,
        permission: "granted",
        firedKeys: firedKeysFor(TODAY),
      });
      expect(again).toEqual({ action: "skip", reason: "none-due" });
      expect(shown).toHaveLength(1);

      // And the module switch still wins over permission: a user who turned
      // medication reminders off hears nothing however granted we are.
      const off = decideDoseFire({
        enabled: false,
        meds: [{ id: "m1", name: "A", times: ["08:00"], remind: true }],
        now,
        permission: "granted",
      });
      expect(off).toEqual({ action: "skip", reason: "module-off" });
      expect(granted.showReminder("napi emlékeztető")).toBe(true);
      expect(shown).toHaveLength(2);
    },
  ],
];

/** Reads a repo file from disk, the way every other test in this suite does. */
function readFileLike(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("the whole app, end to end", () => {
  for (const [name, run] of SCENARIOS) test(name, run);

  test("there are exactly fifteen of them, and they are numbered S01–S15", () => {
    expect(SCENARIOS).toHaveLength(15);
    for (let i = 0; i < 15; i++) {
      expect(SCENARIOS[i]![0].slice(0, 3), `scenario ${i + 1} is out of order or unnumbered`).toBe(
        `S${String(i + 1).padStart(2, "0")}`,
      );
    }
    // Distinct names, so a copy-paste cannot quietly halve the coverage.
    expect(new Set(SCENARIOS.map(([n]) => n)).size).toBe(15);
  });
});
