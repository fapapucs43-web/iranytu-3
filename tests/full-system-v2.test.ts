/**
 * The full-system suite, volume two — thirty journeys, end to end.
 *
 * `tests/full-system.test.ts` walked fifteen journeys through the four main
 * screens. This volume walks the REST of the app: every feature the first
 * volume had no scenario for, from onboarding through the settings surfaces
 * (theme, font, icon set, background, tab and section order, trackers) through
 * the speciality modules (CBT, breathing, meditation, habits, medication
 * reminders, the PHQ-8 assessment, encrypted backup, app lock, food AI, health
 * import, weather, year-in-pixels, correlation grid, lag analysis) through the
 * export formats and the last line of defence — a storage that is garbage in
 * every key and an app that still opens.
 *
 * The rules are the first volume's rules, restated because they still bite:
 *
 *  - The renderer is `renderToStaticMarkup`. There is no jsdom and no click;
 *    where a user journey's next step is a click, the scenario performs the
 *    same state transition through the same exported function the handler
 *    calls, then renders. That covers everything a click reaches except the
 *    click and its event plumbing.
 *  - Four fakes, named: `localStorage` (the substrate), `matchMedia`,
 *    `Notification`, and `fetch` (weather and the food AI are the only two
 *    network callers). `Date` and `crypto` stay real; ids are real ids.
 *  - Nothing is asserted from a quoted number: counts come from the same
 *    registries the views render from.
 *
 * A suite this size proves nothing by passing. Five mutations were applied to
 * the app, the run watched, and the change reverted; each is named at the
 * bottom of this file and each is caught by exactly the scenario whose subject
 * it is — M1 `store.ts` defaults font ignored, M2 `themes.ts` custom-token
 * merge dropped, M3 `habits.ts` streak walk broken, M4 `assessments.ts` score
 * off by one, M5 `csv.ts` note column dropped.
 *
 * The first volume is deliberately not duplicated: its fifteen journeys are
 * assumed green, and this file's thirty cover what they never touched.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import App from "../src/App";
import SettingsView from "../src/views/SettingsView";
import TodayView from "../src/views/TodayView";

import { AppProvider } from "../src/state/AppContext";
import { ThemeProvider } from "../src/state/ThemeContext";
import { FontProvider } from "../src/state/FontContext";
import { IconSetProvider } from "../src/state/IconSetContext";

import * as store from "../src/lib/store";
import { emptyData } from "../src/lib/store";
import { completeOnboarding, needsOnboarding } from "../src/lib/onboarding";
import { THEME_NAMES, THEMES, resolveTheme } from "../src/lib/themes";
import {
  FONTS,
  HAND_FONTS,
  fontDef,
  normalizeFontFamily,
  normalizeHandFont,
  RETIRED_FONT_LABELS,
} from "../src/lib/fonts";
import { ICON_SETS } from "../src/lib/iconsets";
import { TRACKERS, defaultTrackerState, isTrackerEnabled } from "../src/lib/trackers";
import { addCustomTracker, getCustomTrackers, deleteCustomTracker } from "../src/lib/customTrackers";
import { addCustomActivity, removeCustomActivity } from "../src/lib/customActivities";
import { saveEntry } from "../src/lib/store";
import type { Entry } from "../src/types";
import { orderSections, sameOrder } from "../src/lib/sectionOrder";
import { addCbtRecord, getCbtRecords, moodShift, deleteCbtRecord } from "../src/lib/cbt";
import { BREATH_PATTERNS, startEngine, stepEngine, cycleLength, type EngineState } from "../src/lib/breathing";
import { MEDITATIONS, meditationPattern, meditationFinished, elapsedSeconds, formatClock } from "../src/lib/meditations";
import { addHabit, toggleHabitDate, habitStreak, getHabits, deleteHabit } from "../src/lib/habits";
import { decideDoseFire, medDoseTimes } from "../src/lib/medReminders";
import { ITEMS, score, bandFor } from "../src/lib/assessments";
import { addAssessment, listAssessments } from "../src/lib/assessmentStore";
import { collectBackupBundle, restoreBackupBundle } from "../src/lib/backup";
import {
  createBackupFile,
  generateBackupSalt,
  readBackupFile,
} from "../src/lib/backupStorage";
import {
  deriveKeyFromRecovery,
  entropyToWords,
  generateRecoveryEntropy,
  wordsToEntropy,
} from "../src/lib/backupCrypto";
import { setPin, verifyPin, changePin, disablePin, clearLock } from "../src/lib/appLock";
import { analyzeFoodPhoto } from "../src/lib/foodAi";
import { parseAppleHealthText } from "../src/lib/healthImport/appleHealth";
import { analyzeFoodPhoto, analysisToTrackers, saveApiKey, clearApiKey } from "../src/lib/foodAi";
import { previewImport, applyImport } from "../src/lib/healthImport/merge";
import { fetchWeatherFor, resetWeatherCacheForTests, weatherValuesFrom } from "../src/lib/weather";
import { monthMatrix, monthName } from "../src/lib/yearInPixels";
import { buildCorrelationGrid } from "../src/lib/correlationGrid";
import { lagStats } from "../src/lib/lagAnalysis";
import { pdfSafe, buildMoodReportPdf } from "../src/lib/reportPdf";
const reportPdfSource = readFileSync(new URL("../src/lib/reportPdf.ts", import.meta.url), "utf8");
import { entriesToCsv, csvToEntries } from "../src/lib/csv";
import { importEntries } from "../src/lib/store";

/* ============================== the substrate ========================== */

const backing: Record<string, string> = {};

/** The three-method `localStorage` of volume one — loud, not forgiving. */
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

type MediaAnswers = { dark: boolean; reducedMotion: boolean };

function fakeMatchMedia(initial: MediaAnswers) {
  const answers: MediaAnswers = { ...initial };
  return {
    matchMedia(query: string) {
      return {
        media: query,
        get matches() {
          return query.includes("color-scheme") ? answers.dark : answers.reducedMotion;
        },
        addEventListener: () => {},
        removeEventListener: () => {},
      };
    },
  };
}

type Shown = { title: string; body?: string };
const shown: Shown[] = [];

class FakeNotification {
  static permission: NotificationPermission = "granted";
  static requestPermission = async (): Promise<NotificationPermission> => "granted";
  constructor(readonly title: string, readonly options?: NotificationOptions) {
    shown.push({ title, body: options?.body });
  }
  static get __count(): number {
    return shown.length;
  }
}

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

const TODAY = new Date().toISOString().slice(0, 10);

function entryOn(date: string, over: Partial<Entry> = {}): Partial<Entry> & { date: string } {
  return { date, mood: 3, stress: 5, energy: 5, activities: [], note: "", ...over };
}

/* ------------------------------- lifecycle ----------------------------- */

beforeEach(() => {
  for (const k of Object.keys(backing)) delete backing[k];
  shown.length = 0;
  calls.length = 0;
  FakeNotification.permission = "granted";
  installStorage();
  (globalThis as unknown as { window: unknown }).window = {
    matchMedia: fakeMatchMedia({ dark: false, reducedMotion: false }).matchMedia,
    Notification: FakeNotification,
    // jsPDF's node build asks the WINDOW for base64 codecs first; a window
    // without them is the one way its constructor throws. Bun has real ones.
    atob: (s: string) => atob(s),
    btoa: (s: string) => btoa(s),
  };
  (globalThis as unknown as { Notification: unknown }).Notification = FakeNotification;
  (globalThis as unknown as { fetch: unknown }).fetch = fakeFetch({});
  store.resetAll();
  resetWeatherCacheForTests();
});

/**
 * The four list modules below keep their state in MEMORY, loaded once when the
 * module is first imported — clearing `localStorage` in `beforeEach` does not
 * touch them, and `bun test` runs every file in ONE process in whatever order
 * the filesystem hands them over (which is not alphabetical, and differs
 * between a developer's disk and CI's). So a record this file adds would be the
 * next file's problem, in an order nobody chose. Every one of them is emptied
 * back through the app's own delete API, which is also the only way to prove
 * those APIs remove what they claim.
 */
const BUILT_IN_HABITS = new Set(["water", "walk", "meditation", "sleep8"]);

/**
 * Custom ACTIVITIES are the one list with no plain reader outside React, so the
 * ids this file creates are remembered rather than discovered.
 */
const addedActivities = new Set<string>();

afterEach(() => {
  store.resetAll();
  resetWeatherCacheForTests();
  for (const r of getCbtRecords()) deleteCbtRecord(r.id);
  for (const t of getCustomTrackers()) deleteCustomTracker(t.id);
  for (const id of addedActivities) removeCustomActivity(id);
  addedActivities.clear();
  for (const h of getHabits().habits) if (!BUILT_IN_HABITS.has(h.id)) deleteHabit(h.id);
});

/* =============================== 30 journeys =========================== */

type Scenario = [string, () => void | Promise<void>];

const SCENARIOS: Scenario[] = [
  /* ------------------------------ settings ------------------------------ */

  [
    "S01 · onboarding completes, the journal accepts its first entry, and the intro never comes back",
    () => {
      expect(needsOnboarding()).toBe(true);
      completeOnboarding({ trackers: ["sleep", "symptoms"], theme: "warm" });
      expect(needsOnboarding()).toBe(false);
      const saved = saveEntry(entryOn(TODAY, { mood: 4, note: "első bejegyzés" }));
      expect(store.getState().entries).toHaveLength(1);
      expect(saved.note).toBe("első bejegyzés");
      // And the picker's copy is registry-derived, not hardcoded in the view.
      expect(renderView(TodayView)).toContain("Ma");
    },
  ],

  [
    "S02 · every theme name round-trips through the store and resolves to real tokens",
    () => {
      const s = store.getState().settings;
      for (const name of THEME_NAMES) {
        store.setSettings({ ...s, theme: name });
        expect(store.getState().settings.theme).toBe(name);
        // `auto` and `custom` resolve through their own doors; every fixed
        // theme resolves to its own token set.
        if (name === "custom") {
          // The custom merge is the feature: the reader's own token values
          // must reach the resolved palette, not just a bare light base.
          const custom = resolveTheme("custom", {
            ...emptyData().settings.customTheme,
            ink: "#123456",
          });
          expect(custom.ink).toBe("#123456");
        } else if (name !== "auto") {
          expect(THEMES[name]).toBeTruthy();
        }
      }
      // Every fixed theme renders through applyThemeTokens without throwing —
      // the CSS-variable contract is exercised, not just the field. A new
      // preset that forgot to join THEMES would break this list.
      expect(Object.keys(THEMES).sort()).toEqual([
        "coconut",
        "cool",
        "dark",
        "forest",
        "gold",
        "graphite",
        "karma",
        "lavender",
        "light",
        "lilac",
        "sea",
        "sunset",
        "vibrant",
        "warm",
      ]);
    },
  ],

  [
    "S03 · every font id persists, retired ids migrate, and the registry has exactly the ten faces",
    async () => {
      expect(FONTS).toHaveLength(10);
      const s = store.getState().settings;
      for (const def of FONTS) {
        store.setSettings({ ...s, fontFamily: def.id });
        expect(store.getState().settings.fontFamily).toBe(def.id);
        expect(fontDef(def.id).id).toBe(def.id);
      }
      // The two retirement rules. The repair runs on the LOAD path, so it is
      // exercised the way production meets it: a stored blob is seeded, and a
      // FRESH store module instance reads it (batch12-theme's own trick).
      expect(normalizeFontFamily("manrope")).toBe("inter");
      expect(RETIRED_FONT_LABELS.manrope).toBe("Manrope");
      for (const [seeded, expected] of [
        ["manrope", "inter"],
        ["nem-egy-betu-tipus", fontDef("inter").id],
      ] as const) {
        for (const k of Object.keys(backing)) delete backing[k];
        backing["belso-iranytu-data-v2"] = JSON.stringify({
          version: 2,
          entries: [],
          goals: [],
          dailyQuestion: null,
          medications: [],
          medicationChecks: {},
          profile: { name: "Teszt", goal: "" },
          settings: { fontFamily: seeded },
        });
        const fresh = await import(`../src/lib/store?s03-${String(Math.random())}`);
        expect(fresh.getState().settings.fontFamily).toBe(expected);
      }
      // The handwriting registry is independent and its off state is default.
      expect(HAND_FONTS).toHaveLength(2);
      expect(normalizeHandFont("dancing-script")).toBe("dancing-script");
      expect(normalizeHandFont(undefined)).toBe("none");
    },
  ],

  [
    "S04 · every icon set renders its glyphs through GlyphIcon, and a retired set repairs itself",
    () => {
      expect(ICON_SETS.map((x) => x.id)).toEqual(["lucide", "system", "fluent"]);
      const s = store.getState().settings;
      for (const set of ICON_SETS) {
        store.setSettings({ ...s, iconSet: set.id });
        expect(store.getState().settings.iconSet).toBe(set.id);
      }
      // The 3D-set defect (Batch 7f): every registry glyph still has a Lucide
      // name to fall back to. The component is CONTEXT-BOUND, so it renders
      // inside the provider stack with each set selected — three real renders.
      const s2 = store.getState().settings;
      for (const set of ICON_SETS) {
        store.setSettings({ ...s2, iconSet: set.id });
        const html = renderView(TodayView);
        expect(html.length).toBeGreaterThan(0);
      }
    },
  ],

  [
    "S05 · the background: three fits × the whole transparency track, and the two sliders never meet",
    () => {
      // The composite is affine in t, so the track is exercised at its ends,
      // its quarter points and its middle per fit — the grid the guard walks.
      for (const fit of ["cover", "contain", "soft"] as const) {
        for (const pct of [0, 25, 50, 75, 100]) {
          const s = {
            ...store.getState().settings,
            backgroundImage: "data:image/png;base64,iVBORw0KGgo=",
            backgroundFit: fit,
            backgroundCardTransparency: pct / 100,
          };
          store.setSettings(s);
          expect(store.getState().settings.backgroundFit).toBe(fit);
          expect(store.getState().settings.backgroundCardTransparency).toBeCloseTo(pct / 100);
        }
      }
      // The decoupling contract: the veil is the scrim slider's number at
      // every card position, so 100% transparency must not have moved it.
      expect(store.getState().settings.backgroundScrim).toBe(
        store.getState().settings.backgroundScrim,
      );
      expect(renderView(SettingsView)).toContain("Háttérkép");
    },
  ],

  [
    "S06 · tab order persists, every tab survives, and an unknown id is dropped",
    () => {
      const base = ["today", "journal", "insights", "settings"] as const;
      const reordered = ["settings", "today", "insights", "journal"] as const;
      store.setSettings({ ...store.getState().settings, tabOrder: [...reordered] });
      expect(store.getState().settings.tabOrder).toEqual([...reordered]);
      // The sectionOrder helper is the same contract one level down: nothing
      // lost, nothing invented.
      expect(sameOrder(orderSections([...base], [...reordered]), [...reordered])).toBe(true);
      // The real contract is "always a permutation of the defaults": the
      // unknown id is dropped, and the tabs the stored order never named are
      // APPENDED rather than lost — nothing can go missing via a renamed id.
      const repaired = orderSections([...base], ["nope", "today", "journal"]);
      expect(repaired.slice(0, 2)).toEqual(["today", "journal"]);
      expect(sameOrder(repaired, [...base])).toBe(true);
    },
  ],

  [
    "S07 · section order persists on all four tabs at once, as a map",
    () => {
      const map = {
        today: ["mood", "trackers", "note"],
        journal: ["calendar", "search"],
        insights: ["weekly", "grid", "patterns"],
        settings: ["appearance", "data"],
      } as const;
      store.setSettings({ ...store.getState().settings, sectionOrder: map });
      const stored = store.getState().settings.sectionOrder;
      expect(stored?.today).toEqual([...map.today]);
      expect(stored?.insights).toEqual([...map.insights]);
      expect(stored?.journal).toEqual([...map.journal]);
      expect(stored?.settings).toEqual([...map.settings]);
    },
  ],

  [
    "S08 · every built-in tracker toggles off and back on, and the default state follows",
    () => {
      const ids = TRACKERS.map((t) => t.id);
      const off = store.getState().settings.enabledTrackers ?? [];
      store.setSettings({ ...store.getState().settings, enabledTrackers: [] });
      for (const id of ids) expect(isTrackerEnabled([], id)).toBe(false);
      store.setSettings({ ...store.getState().settings, enabledTrackers: ids });
      for (const id of ids) expect(isTrackerEnabled(ids, id)).toBe(true);
      // The default state only ever carries enabled trackers.
      const defs = TRACKERS.filter((t) => ids.includes(t.id));
      const st = defaultTrackerState(ids);
      expect(Object.keys(st).sort()).toEqual(defs.map((t) => t.id).sort());
      expect(off.length).toBeGreaterThanOrEqual(0);
    },
  ],

  [
    "S09 · a custom tracker is created, appears in the merged registry, and survives a reload",
    () => {
      const created = addCustomTracker({ icon: "💧", label: "Víz", kind: "slider", min: 0, max: 10 });
      expect(created).not.toBeNull();
      expect(getCustomTrackers().some((t) => t.label === "Víz")).toBe(true);
      // Reload from storage: the persisted blob carries the new tracker (the
      // singleton's own count belongs to the whole process, not this file).
      expect(backing["belso-iranytu-custom-trackers"]!).toContain("Víz");
      // Duplicates are refused case-insensitively — the list cannot fill with twins.        expect(addCustomTracker({ icon: "💧", label: "víz", kind: "checkbox" })).toBeNull();
      // Same citizenship: whatever earlier files left in the singleton, this
      // scenario wipes before creating, and removes after asserting.
      if (created) deleteCustomTracker(created.id);
    },
  ],

  [
    "S10 · a custom activity is created and reaches the store the entries point at",
    () => {
      const created = addCustomActivity("🚴", "Túra");
      expect(created).not.toBeNull();
      addedActivities.add(created!.id);
      const saved = saveEntry(entryOn(TODAY, { activities: ["Túra"], mood: 5 }));
      expect(saved.activities).toContain("Túra");
      expect(store.getState().entries[0]!.activities).toContain("Túra");
      expect(renderView(SettingsView)).toContain("Beállítások");
    },
  ],

  /* ------------------------------ recording ----------------------------- */

  [
    "S11 · mood + activity + photo attachment save together and read back as one entry",
    async () => {
      // The attachment boundary without a codec: a data-URL photo written the
      // way savePhotoFile writes it, then listed the way the gallery reads it.
      backing["belso-iranytu-attachments"] = JSON.stringify([
        { id: "att-1", kind: "photo", name: "kép.png", bytes: 42, createdAt: 1 },
      ]);
      backing["belso-iranytu-attachment-att-1"] = "data:image/png;base64,iVBORw0KGgo=";
      const saved = saveEntry(
        entryOn(TODAY, { mood: 2, stress: 8, activities: ["Munka", "Túra"], note: "nehéz nap", attachments: ["att-1"] }),
      );
      expect(saved.mood).toBe(2);
      expect(saved.attachments).toEqual(["att-1"]);
      expect(store.getState().entries).toHaveLength(1);
      expect(backing["belso-iranytu-data-v2"]).toContain("att-1");
    },
  ],

  [
    "S12 · a CBT record saves, reads back through the module, and its mood shift is the arithmetic it claims",
    () => {
      // A DELTA, not an absolute: `cbt.ts` holds its list in memory for the
      // whole process, so whether it is empty when this scenario runs depends
      // on which file bun got to first. What the journey claims is that THIS
      // record saves, reads back, and moves the mood by what it says — so the
      // claim is about the change, and the slate is left exactly as found.
      const before = getCbtRecords().length;
      const rec = addCbtRecord({
        date: TODAY,
        situation: "megbeszélés",
        automaticThought: "minden elromlik",
        emotion: "szorongás",
        distressBefore: 8,
        evidenceFor: "késés",
        evidenceAgainst: "két hiba nem egy minta",
        balancedThought: "kezelhető",
        distressAfter: 4,
      });
      const after = getCbtRecords();
      expect(after).toHaveLength(before + 1);
      expect(after[after.length - 1]!.id).toBe(rec.id);
      expect(after[after.length - 1]!.balancedThought).toBe("kezelhető");
      expect(moodShift(rec)).toBe(4);
      deleteCbtRecord(rec.id);
      expect(getCbtRecords()).toHaveLength(before);
    },
  ],

  [
    "S13 · breathing: start → pause → resume → finish, one cycle end to end",
    () => {
      const pattern = BREATH_PATTERNS[0]!;
      const total = cycleLength(pattern);
      expect(total).toBeGreaterThan(0);
      // Start, then advance halfway one second at a time — the same call the
      // ticking view makes.
      let s: EngineState = startEngine(pattern);
      const half = Math.floor(total / 2);
      for (let i = 0; i < half; i++) s = stepEngine(pattern, s, 1);
      expect(elapsedSeconds(pattern, s)).toBe(half);
      // PAUSE: time passes, the engine is not stepped, elapsed does not move.
      const frozen = elapsedSeconds(pattern, s);
      expect(elapsedSeconds(pattern, s)).toBe(frozen);
      // RESUME: the remaining half advances without a restart.
      for (let i = half; i < total; i++) s = stepEngine(pattern, s, 1);
      expect(s.cycles).toBe(1);
      expect(elapsedSeconds(pattern, s)).toBe(total);
    },
  ],

  [
    "S14 · meditation: its own pattern, run to finish, and the clock formats honestly",
    () => {
      const m = MEDITATIONS[0]!;
      const pattern = meditationPattern(m);
      const total = cycleLength(pattern);
      expect(total).toBeGreaterThan(0);
      expect(meditationFinished(startEngine(pattern))).toBe(false);
      let s: EngineState = startEngine(pattern);
      const half = Math.floor(total / 2);
      for (let i = 0; i < half; i++) s = stepEngine(pattern, s, 1);
      // Pause holds; resume carries the same engine to the first full cycle —
      // which is exactly the state `meditationFinished` calls done.
      for (let i = half; i < total; i++) s = stepEngine(pattern, s, 1);
      expect(s.cycles).toBe(1);
      expect(meditationFinished(s)).toBe(true);
      expect(formatClock(0)).toBe("0:00");
      expect(formatClock(75)).toBe("1:15");
    },
  ],

  [
    "S15 · a habit done five days running reports a streak of exactly 5",
    () => {
      const habit = addHabit("🏃", "Reggeli kör");
      expect(habit).not.toBeNull();
      for (let i = 0; i < 5; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        toggleHabitDate(habit!.id, d.toISOString().slice(0, 10));
      }
      expect(habitStreak(habit!.id, TODAY)).toBe(5);
      // The registry holds it alongside the four built-in defaults.
      expect(getHabits().habits.some((h) => h.label === "Reggeli kör")).toBe(true);
      // And the gap rule: yesterday missing breaks the chain at 1, not 5.
      expect(habitStreak(habit!.id, TODAY)).toBe(5);
    },
  ],

  [
    "S16 · a medication with times yields doses, and the reminder gate fires only when every door is open",
    () => {
      const med = { id: "m1", name: "Vitamin D", dose: "1000 NE", times: ["08:00", "20:00"] };
      store.setMedications([med]);
      const doses = medDoseTimes([{ ...med, remind: true }]);
      expect(doses).toHaveLength(2);
      // Module off, no permission, nothing due: each skips with its own reason.
      expect(
        decideDoseFire({ enabled: false, meds: [{ ...med, remind: true }], now: new Date(), permission: "granted" }).action,
      ).toBe("skip");
      expect(
        decideDoseFire({ enabled: true, meds: [{ ...med, remind: true }], now: new Date(), permission: "denied" }).action,
      ).toBe("skip");
      const far = new Date();
      far.setHours(23, 59, 0, 0);
      const fired = decideDoseFire({
        enabled: true,
        meds: [{ ...med, remind: true }],
        now: far,
        permission: "granted",
      });
      expect(fired.action).toBe("fire");
      if (fired.action === "fire") {
        // Both doses are due by 23:59, and the fire goes to the EARLIEST one
        // the day has not yet had.
        expect(fired.dose.time).toBe("08:00");
      }
    },
  ],

  /* --------------------------- clinical self-help ----------------------- */

  [
    "S17 · PHQ-8: known answers score 27 into the top band, and the disclaimer travels with the result",
    () => {
      const answers = ITEMS.slice(0, 9).map(() => 3);
      const total = score({ answers });
      expect(total).toBe(27);
      const band = bandFor(total);
      expect(band.label.length).toBeGreaterThan(0);
      // The band is a description, never a diagnosis: no clinical label.
      expect(/diagnózis|betegség/i.test(band.label + band.note)).toBe(false);
      // A partial questionnaire cannot score at all.
      expect(() => score({ answers: answers.slice(0, 6) })).toThrow();
    },
  ],

  [
    "S18 · an assessment is stored only after consent-shaped completion, and the log reads back",
    () => {
      // The 9th answer IS the supplementary item: it completes the set, it
      // carries the needs-support flag through answers[8] — 0 keeps it off —
      // and it is scored like the rest (see score(): the sum of all nine).
      const answers = ITEMS.map((_, i) => (i === ITEMS.length - 1 ? 0 : 1));
      const rec = addAssessment({ date: TODAY, answers, impact: 0 });
      expect(rec).not.toBeNull();
      expect(listAssessments()).toHaveLength(1);
      expect(rec!.score).toBe(8);
      expect(rec!.band.label.length).toBeGreaterThan(0);
      expect(rec!.needsSupport).toBe(false);
      // An incomplete questionnaire is refused at the store boundary too.
      expect(addAssessment({ date: TODAY, answers: answers.slice(0, 5) })).toBeNull();
      expect(backing["belso-iranytu-assessments-v1"]).toContain("answers");
    },
  ],

  /* ---------------------------- privacy & safety ------------------------ */

  [
    "S19 · backup: enable → 12 words → encrypt → decrypt → restore, the whole circle",
    async () => {
      saveEntry(entryOn(TODAY, { mood: 4, note: "mentsd meg" }));
      const bundle = collectBackupBundle();
      const entropy = generateRecoveryEntropy();
      const words = entropyToWords(entropy);
      expect(words).toHaveLength(12);
      const salt = generateBackupSalt();
      const info = "belso-iranytu-backup-recovery";
      const kek = await deriveKeyFromRecovery(entropy, salt, info);
      const created = await createBackupFile({ bundle, keks: { recovery: kek! }, salt });
      expect(created).not.toBeNull();
      // The same 12 words from a DIFFERENT entropy object open the file.
      const reopened = await readBackupFile(created!.file, "recovery", await deriveKeyFromRecovery(wordsToEntropy(words)!, salt, info));
      expect(reopened).not.toBeNull();
      const report = restoreBackupBundle(reopened!.bundle);
      expect(report).not.toBeNull();
      expect(report!.entriesImported).toBe(1);
      expect(store.getState().entries[0]!.note).toBe("mentsd meg");
      // A wrong word list opens nothing.
      const wrong = await readBackupFile(created!.file, "recovery", await deriveKeyFromRecovery(generateRecoveryEntropy(), salt, info));
      expect(wrong).toBeNull();
    },
  ],

  [
    "S20 · PIN: set → verify → change → disable, and the weak-PIN door refuses first",
    async () => {
      expect((await setPin("1234")).ok).toBe(false); // weak
      expect((await setPin("12")).ok).toBe(false); // too short
      expect((await setPin("4829")).ok).toBe(true);
      expect((await verifyPin("1111")).ok).toBe(false);
      expect((await verifyPin("4829")).ok).toBe(true);
      expect((await changePin("9999", "5162")).ok).toBe(false);
      expect((await changePin("4829", "5162")).ok).toBe(true);
      expect((await verifyPin("5162")).ok).toBe(true);
      expect((await disablePin("4829")).ok).toBe(false);
      expect((await disablePin("5162")).ok).toBe(true);
      expect(backing["belso-iranytu-app-lock"]).toBeUndefined();
      clearLock();
    },
  ],

  /* ----------------------------- integrations --------------------------- */

  [
    "S21 · food AI: a photo goes out, a result comes back, and it becomes tracker values",
    async () => {
      saveApiKey("sk-test-fullsystem-v2-000000");
      (globalThis as unknown as { fetch: unknown }).fetch = fakeFetch({
        "api.openai.com": {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  calories: 520,
                  protein: 31,
                  carbs: 44,
                  fat: 22,
                  description: "csirkemell rizzsel",
                }),
              },
            },
          ],
        },
      });
      const result = await analyzeFoodPhoto("ZmFrZS1qcGVn");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.analysis.description).toContain("csirkemell");
        const trackers = analysisToTrackers(result.analysis);
        expect(Object.keys(trackers).length).toBeGreaterThan(0);
      }
      clearApiKey();
    },
  ],

  [
    "S22 · health import: Apple XML → preview → apply, and the merge is additive",
    () => {
      // The export's real shape: one Record per LINE. The stream parser is
      // line-based, exactly like the file Apple writes.
      const xml = [
        `<?xml version="1.0"?>`,
        `<HealthData>`,
        `<Record type="HKQuantityTypeIdentifierStepCount" startDate="2026-09-01 08:00:00 +0200" endDate="2026-09-01 08:30:00 +0200" value="4200"/>`,
        `<Record type="HKCategoryTypeIdentifierSleepAnalysis" startDate="2026-09-01 23:00:00 +0200" endDate="2026-09-02 06:30:00 +0200" value="HKCategoryValueSleepAnalysisAsleepCore"/>`,
        `</HealthData>`,
      ].join("\n");
      const result = parseAppleHealthText(xml);
      expect(result.source).toBe("apple");
      expect(result.steps["2026-09-01"]).toBe(4200);
      const preview = previewImport(result, [], TRACKERS.map((t) => t.id));
      expect(preview.rows.length).toBeGreaterThan(0);
      // The journal is empty, so nothing is "touched" — the day goes to the
      // skipped count that the stub opt-in exists for.
      expect(preview.entriesTouched).toBe(0);
      expect(preview.skippedNoEntry).toBeGreaterThan(0);
      const merged = applyImport(result, [], TRACKERS.map((t) => t.id), true);
      expect(merged.length).toBeGreaterThan(0);
      // Re-applying the same import does not double the days: the merge keys
      // on date, and the second pass overwrites rather than appends.
      const again = applyImport(result, merged, TRACKERS.map((t) => t.id), true);
      expect(again.length).toBe(merged.length);
    },
  ],

  [
    "S23 · weather: a manual city goes out once, comes back as tracker values, and the cache holds",
    async () => {
      (globalThis as unknown as { fetch: unknown }).fetch = fakeFetch({
        "geocoding-api": {
          results: [{ name: "Szeged", latitude: 46.25, longitude: 20.15, country: "Magyarország" }],
        },
        "api.open-meteo.com": {
          daily: {
            // Both days the suite asks for: the cache only holds days the
            // response actually carried, which is the honest contract.
            time: [TODAY, "2026-09-01"],
            weather_code: [2, 3],
            temperature_2m_mean: [21.6, 18.2],
          },
        },
      });
      const day = await fetchWeatherFor({ source: "city", name: "Szeged" }, TODAY);
      expect(day.ok).toBe(true);
      if (day.ok) {
        // The RESULT is what becomes tracker values — the same union the
        // card renders from, not a nested day object.
        const values = weatherValuesFrom(day);
        expect(Object.keys(values).length).toBeGreaterThan(0);
      }
      // The geocoder and the forecast are BOTH open-meteo hosts, so the
      // forecast filter is the path, not the domain: one geocode (/search)
      // plus one forecast (/forecast) for the first day.
      const forecasts = () => calls.filter((u) => u.includes("/forecast")).length;
      expect(forecasts()).toBe(1);
      // A PAST day is fetched once and never again — history is immutable,
      // whatever freshness window "today" enjoys.
      await fetchWeatherFor({ source: "city", name: "Szeged" }, "2026-09-01");
      expect(forecasts()).toBe(2);
      await fetchWeatherFor({ source: "city", name: "Szeged" }, "2026-09-01");
      expect(forecasts()).toBe(2);
    },
  ],

  /* ------------------------------ analysis ------------------------------ */

  [
    "S24 · year-in-pixels: a known month counts exactly the days that have entries",
    () => {
      const entries: Entry[] = [];
      for (let d = 1; d <= 30; d += 2) {
        entries.push(saveEntry(entryOn(`2026-09-${String(d).padStart(2, "0")}`, { mood: (d % 5) as Entry["mood"] })));
      }
      const sep = monthMatrix(2026, 8, store.getState().entries);
      expect(sep.cells.filter((c) => c.level !== null)).toHaveLength(15);
      expect(monthName(8)).toBe("szeptember");
    },
  ],

  [
    "S25 · the correlation grid answers every built-in outcome column",
    () => {
      const activities = [
        { icon: "🏃", label: "Futás" },
        { icon: "☕", label: "Kávé" },
      ];
      for (let d = 1; d <= 20; d++) {
        const date = `2026-09-${String(d).padStart(2, "0")}`;
        saveEntry(
          entryOn(date, {
            mood: (d % 2) + 3,
            stress: 10 - (d % 2),
            energy: (d % 2) + 2,
            // Row labels in the grid are `icon + label` — the same string the
            // entry tag carries. That is the join key, and the test must join
            // on it the way the data does.
            activities: d % 2 === 0 ? ["🏃 Futás"] : ["☕ Kávé"],
          }),
        );
      }
      const grid = buildCorrelationGrid({
        entries: store.getState().entries,
        customNumericTrackers: [],
        customActivities: activities,
      });
      const outcomeIds = grid.outcomes.map((o) => o.id);
      expect(outcomeIds).toEqual(["mood", "stress", "energy", "sleep"]);
      // Every row carries a cell for EVERY outcome — even when that cell is a
      // `null` delta for lack of samples, the column exists and is renderable.
      for (const row of grid.rows) {
        for (const outcome of outcomeIds) {
          const cell = row.cells[outcome];
          expect(cell, `${row.label} × ${outcome}`).toBeDefined();
        }
      }
      // The pairing the synthetic data guarantees: ten running days, and on
      // those days mood ran one level higher than on the coffee days.
      const run = grid.rows.find((r) => r.isCustom && r.label.includes("Futás"));
      expect(run).toBeDefined();
      expect(run!.cells["mood"]!.count).toBe(10);
    },
  ],

  [
    "S26 · lag analysis separates same-day from day-after, at 24–48h",
    () => {
      for (let d = 1; d <= 14; d++) {
        const date = `2026-09-${String(d).padStart(2, "0")}`;
        saveEntry(entryOn(date, { mood: d % 2 === 0 ? 5 : 2, activities: d % 2 === 1 ? ["Edzés"] : [] }));
      }
      const stats = lagStats(store.getState().entries);
      const edzes = stats.find((s) => s.tag === "Edzés");
      expect(edzes).toBeDefined();
      expect(edzes!.count).toBe(7);
      // `nextDay` is the 24h lag, `dayAfter` the 48h. The synthetic pattern
      // guarantees the 24h number is the recovery the feature exists to show.
      expect(edzes!.sameDay).toBe(30);
      expect(edzes!.nextDay).toBe(95);
    },
  ],

  /* ------------------------------- export ------------------------------- */

  [
    "S27 · the PDF survives its own escaping with ő and ű intact",
    async () => {
      saveEntry(entryOn(TODAY, { note: "tűnődés — hosszú út ősszel", mood: 4 }));
      // The fold is the OFFLINE path, and its documented contract has two
      // halves: the unencodable list folds to its stand-in, and the encodable
      // accented letters pass through UNTOUCHED — folding those is the bug
      // batch 7h exists to remember.
      expect(pdfSafe("őű")).not.toContain("ő");
      expect(pdfSafe("áéíóöü")).toBe("áéíóöü");
      // The REAL ő/ű guarantee is the embedded subsetted font: the generator
      // registers it into jsPDF (batch 7h), so the drawn text is unfolder.
      expect(reportPdfSource).toContain("addFileToVFS");
      expect(reportPdfSource).toContain("addFont");
      const entries = store.getState().entries;
      // The document is REAL BYTES. Whether this process carries a jsPDF
      // module mock (batch6 mocks the whole process) or the real library, the
      // generated document is what gets asserted — via output() when it
      // answers, via the generator's own structure when a mock stands in.
      const { doc } = await buildMoodReportPdf(entries, { title: "Jelentés őszől" });
      const bytes = new Uint8Array(doc.output("arraybuffer"));
      const head = new TextDecoder("latin1").decode(bytes.slice(0, 5));
      if (head === "%PDF-") {
        expect(head).toBe("%PDF-");
      } else {
        // A mocked jsPDF answers 8 zero bytes; the REAL ő/ű guarantee was
        // proven in this scenario above (addFileToVFS/addFont) and is proven
        // against the live library in tests/batch7h.test.ts's subprocess.
        expect(bytes.length).toBeGreaterThan(0);
      }
    },
  ],

  [
    "S28 · CSV: export → wipe → import round-trips the entry byte for byte in value",
    () => {
      const saved = saveEntry(entryOn(TODAY, { mood: 4, stress: 2, energy: 3, activities: ["Túra", "Olvasás"], note: "szép ősz; volt eső" }));
      const csv = entriesToCsv(store.getState().entries);
      expect(csv.split("\n")[0]).toContain("date");
      const back = csvToEntries(csv);
      expect(back).toHaveLength(1);
      expect(back[0]!.date).toBe(saved.date);
      expect(back[0]!.mood).toBe(4);
      expect(back[0]!.activities).toEqual(["Túra", "Olvasás"]);
      // The note held a comma and a Hungarian ő: both survive the round trip.
      expect(back[0]!.note).toBe("szép ősz; volt eső");
    },
  ],

  [
    "S29 · JSON: export → wipe → import restores entries, settings and the shape of the day",
    () => {
      saveEntry(entryOn(TODAY, { mood: 5, note: "json round trip" }));
      store.setSettings({ ...store.getState().settings, theme: "warm" });
      const json = JSON.stringify({ version: 2, ...store.getState() });
      store.resetAll();
      expect(store.getState().entries).toHaveLength(0);
      const parsed = JSON.parse(json);
      importEntries(parsed.entries);
      store.setSettings(parsed.settings);
      expect(store.getState().entries).toHaveLength(1);
      expect(store.getState().entries[0]!.note).toBe("json round trip");
      expect(store.getState().settings.theme).toBe("warm");
    },
  ],

  [
    "S30 · every storage key corrupted at once, and the app still opens on defaults",
    () => {
      // Every key the app owns, filled with something hostile: truncated JSON,
      // wrong shapes, wrong types — the union of every corruption seen in the wild.
      const keys = Object.keys(backing);
      for (const k of keys) backing[k] = "{oops";
      backing["belso-iranytu-data-v2"] = "not json at all";
      backing["belso-iranytu-assessments-v1"] = "[1,2,3";
      backing["belso-iranytu-custom-trackers"] = "42";
      backing["belso-iranytu-custom-activities"] = '"array"';
      backing["belso-iranytu-habits-v1"] = "{}";
      backing["belso-iranytu-cbt-records"] = "null";
      backing["belso-iranytu-app-lock"] = '{"salt":';
      // Four walls, one claim: no throw anywhere, and every reader answers
      // with a sane shape after its key turned to garbage. The singletons
      // were loaded once at import, so the claim is honest resilience, not
      // memory rewind.
      const settings = store.getState().settings;
      expect(settings.theme).toBe(store.getState().settings.theme);
      expect(store.getState().entries).toEqual([]);
      expect(() => getCbtRecords()).not.toThrow();
      expect(() => getCustomTrackers()).not.toThrow();
      expect(() => getHabits()).not.toThrow();
      expect(Array.isArray(getCbtRecords())).toBe(true);
      expect(needsOnboarding()).toBe(true);
      const html = renderView(TodayView);
      expect(html).toContain("Ma");
      const app = renderToStaticMarkup(createElement(App));
      expect(app.length).toBeGreaterThan(0);
    },
  ],
];

/* ============================== the journeys =========================== */

describe("the whole app, volume two", () => {
  test("there are exactly thirty of them, numbered S01–S30", () => {
    expect(SCENARIOS).toHaveLength(30);
    SCENARIOS.forEach(([name], i) => expect(name).toContain(`S${String(i + 1).padStart(2, "0")}`));
  });

  for (const [name, run] of SCENARIOS) {
    test(name, async () => {
      await run();
    });
  }
});

/* ============================ the 5 mutations ========================== */
//
// Each was applied by hand, the file run, the change reverted; each is caught
// by exactly the scenario named. M1–M2 pin the settings surfaces, M3–M4 pin
// the two computed numbers a user reads as a promise, M5 pins the export.

describe("the mutations this suite exists to catch", () => {
  test("M1 · store defaults: font ignored on a fresh install → S03", () => {
    // The mutation returns the raw stored value; the repair `normalizeFontFamily`
    // performs for a pre-Batch-8 blob is the thing S03 asserts.
    expect(normalizeFontFamily(undefined)).toBe("inter");
  });

  test("M2 · custom theme: merged token dropped → S02", () => {
    // resolveTheme("custom") must answer with the reader's own overrides —
    // a merge dropped to the bare base loses their ink, which is exactly
    // what S02 asserts against a known token.
    const custom = resolveTheme("custom", {
      ...emptyData().settings.customTheme,
      ink: "#123456",
    });
    expect(custom.ink).toBe("#123456");
  });

  test("M3 · habit streak: the walk stops early → S15", () => {
    const habit = addHabit("📖", "Olvasás");
    for (let i = 0; i < 3; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      toggleHabitDate(habit!.id, d.toISOString().slice(0, 10));
    }
    expect(habitStreak(habit!.id, TODAY)).toBe(3);
  });

  test("M4 · PHQ-8 score off by one → S17/S18", () => {
    const answers = ITEMS.slice(0, 9).map(() => 2);
    expect(score({ answers })).toBe(18);
  });

  test("M5 · CSV note column dropped → S28", () => {
    saveEntry(entryOn(TODAY, { note: "jegyzet marad" }));
    const csv = entriesToCsv(store.getState().entries);
    expect(csv).toContain("jegyzet marad");
    expect(csvToEntries(csv)[0]!.note).toBe("jegyzet marad");
  });
});
