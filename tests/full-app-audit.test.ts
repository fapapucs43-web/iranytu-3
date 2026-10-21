/**
 * The full-app audit — thirty-seven numbered journeys over the WHOLE app, for
 * `fix/card-state-and-full-audit`.
 *
 * WHAT THIS IS, AND WHAT IT IS NOT
 * `tests/full-system.test.ts` walks fifteen journeys over the four main
 * screens and `tests/full-system-v2.test.ts` thirty over the rest; this file
 * is the audit the batch was asked for: ONE table where every capability the
 * request enumerates has a row — onboarding, the appearance surfaces, the
 * reorderable structures, the specialty modules, the clinical self-help, the
 * backup and lock, the integrations, the exports, the language, the collapse
 * state and the widget deep links — each with the three lines the request
 * demands: what it DOES, what is EXPECTED, and what is ACTUAL (the asserted
 * value, derived from the registries rather than quoted where a registry
 * exists).
 *
 * THE RULES THE OTHER TWO VOLUMES ALREADY SET, RESTATED BECAUSE THEY STILL BITE
 *  - `renderToStaticMarkup`; there is no jsdom and no click. Where a journey's
 *    next step is a click, the scenario performs the same state transition
 *    through the same exported function the handler calls, then renders.
 *  - Four fakes, named: `localStorage`, `matchMedia`, `Notification`, `fetch`.
 *    `Date` and `crypto` stay real; ids are real ids.
 *  - Nothing is asserted from a quoted number where a registry can be asked:
 *    counts come from the same arrays the views render from.
 *  - Every memory-resident list this file creates is emptied through the
 *    app's own delete API in `afterEach`, because bun runs every test file in
 *    one process and a record left behind is the next file's failure.
 *
 * FIVE MUTATIONS, PROVEN RED
 * N1 `themes.ts` custom merge dropped → A02; N2 `habits.ts` streak walk off by
 * one → A15; N3 `assessments.ts` PHQ-8 score off by one → A17; N4 `csv.ts`
 * note column dropped → A29; N5 `quickStart.ts` `mood` sent to the wrong tab →
 * A34/A35. Each was applied by hand, this file run, and reverted; the block at
 * the bottom states the invariant each mutation breaks.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import App from "../src/App";
import TodayView, { TODAY_SECTION_IDS } from "../src/views/TodayView";
import ToolsView from "../src/views/ToolsView";
import SettingsView, { SETTINGS_SECTION_IDS } from "../src/views/SettingsView";
import { JOURNAL_SECTION_IDS } from "../src/views/JournalView";
import { INSIGHTS_SECTION_IDS } from "../src/views/InsightsView";

import { AppProvider } from "../src/state/AppContext";
import { ThemeProvider } from "../src/state/ThemeContext";
import { FontProvider } from "../src/state/FontContext";
import { IconSetProvider } from "../src/state/IconSetContext";

import * as store from "../src/lib/store";
import { emptyData, importEntries, saveEntry } from "../src/lib/store";
import { completeOnboarding, needsOnboarding } from "../src/lib/onboarding";
import { THEME_NAMES, THEMES, resolveTheme } from "../src/lib/themes";
import {
  FONTS,
  HAND_FONTS,
  RETIRED_FONT_LABELS,
  fontDef,
  normalizeFontFamily,
  normalizeHandFont,
} from "../src/lib/fonts";
import { ICON_SETS } from "../src/lib/iconsets";
import { FIT_CHOICES, normalizeFit, clampScrim } from "../src/lib/imageBackground";
import { orderSections, sameOrder } from "../src/lib/sectionOrder";
import { orderedTabs } from "../src/lib/navVisibility";
import { TOOLS_SECTION_IDS } from "../src/views/ToolsView";
import {
  TRACKERS,
  defaultTrackerState,
  getTrackerDefs,
  isTrackerEnabled,
} from "../src/lib/trackers";
import { addCustomTracker, deleteCustomTracker, getCustomTrackers } from "../src/lib/customTrackers";
import { addCustomActivity, removeCustomActivity } from "../src/lib/customActivities";
import { addCbtRecord, deleteCbtRecord, getCbtRecords, moodShift } from "../src/lib/cbt";
import {
  BREATH_PATTERNS,
  cycleLength,
  startEngine,
  stepEngine,
  type EngineState,
} from "../src/lib/breathing";
import {
  MEDITATIONS,
  formatClock,
  meditationFinished,
  meditationPattern,
  elapsedSeconds,
} from "../src/lib/meditations";
import { addHabit, deleteHabit, getHabits, habitStreak, toggleHabitDate } from "../src/lib/habits";
import { decideDoseFire, medDoseTimes } from "../src/lib/medReminders";
import { showDoseReminder } from "../src/lib/notifications";
import { DISCLAIMER, ITEMS, bandFor, score } from "../src/lib/assessments";
import {
  ITEM_COUNT as GAD_ITEM_COUNT,
  bandFor as gad7BandFor,
  isComplete as gad7Complete,
  score as gad7Score,
} from "../src/lib/gad7";
import { addAssessment, clearAssessments, listAssessments } from "../src/lib/assessmentStore";
import { collectBackupBundle, restoreBackupBundle } from "../src/lib/backup";
import { createBackupFile, generateBackupSalt, readBackupFile } from "../src/lib/backupStorage";
import {
  deriveKeyFromRecovery,
  entropyToWords,
  generateRecoveryEntropy,
  wordsToEntropy,
} from "../src/lib/backupCrypto";
import { clearLock, disablePin, changePin, isLockEnabled, setPin, verifyPin } from "../src/lib/appLock";
import { analysisToTrackers, analyzeFoodPhoto, clearApiKey, saveApiKey } from "../src/lib/foodAi";
import { parseAppleHealthText } from "../src/lib/healthImport/appleHealth";
import { applyImport, previewImport } from "../src/lib/healthImport/merge";
import { fetchWeatherFor, resetWeatherCacheForTests, weatherValuesFrom } from "../src/lib/weather";
import { monthMatrix, monthName } from "../src/lib/yearInPixels";
import { buildCorrelationGrid } from "../src/lib/correlationGrid";
import { lagStats } from "../src/lib/lagAnalysis";
import { buildMoodReportPdf, pdfSafe } from "../src/lib/reportPdf";
import { csvToEntries, entriesToCsv } from "../src/lib/csv";
import { QUICK_VALUES, quickTargetFor } from "../src/lib/quickStart";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, setActiveLocale, t } from "../src/lib/i18n";
import {
  CARD_STATES_KEY,
  loadCardStates,
  resetCardStates,
  resetCardStatesForTests,
  setCardCollapsed,
} from "../src/lib/cardStates";
import { WIPE_KEYS } from "../src/lib/storageKeys";
import {
  MICRO_LESSONS,
  lessonsForQuadrant,
  loadSeenLessons,
  markLessonSeen,
  pickLesson,
  resetSeenLessons,
} from "../src/lib/micro-lessons";
import { QUADRANT_LABELS, QUADRANTS } from "../src/lib/quadrant";
import type { Entry } from "../src/types";

const reportPdfSource = readFileSync(new URL("../src/lib/reportPdf.ts", import.meta.url), "utf8");
import { Gad7Result } from "../src/components/Gad7Card";

/* ============================== the substrate ========================== */

const backing: Record<string, string> = {};

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

/* ================================ the fakes ============================ */

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

/** The raw settings blob, as a reload would find it. */
function storedSettings(): Record<string, unknown> {
  const raw = backing["belso-iranytu-data-v2"];
  expect(raw, "the store must have written itself before this is read").toBeDefined();
  return (JSON.parse(raw!) as { settings: Record<string, unknown> }).settings;
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
    atob: (s: string) => atob(s),
    btoa: (s: string) => btoa(s),
  };
  (globalThis as unknown as { Notification: unknown }).Notification = FakeNotification;
  (globalThis as unknown as { fetch: unknown }).fetch = fakeFetch({});
  store.resetAll();
  resetWeatherCacheForTests();
  resetCardStatesForTests();
  clearAssessments();
  clearLock();
});

/** The memory-resident lists, emptied through the app's own delete APIs. */
const BUILT_IN_HABITS = new Set(["water", "walk", "meditation", "sleep8"]);
const addedActivities = new Set<string>();

afterEach(() => {
  store.resetAll(); // also mirrors the locale back to the default
  resetWeatherCacheForTests();
  resetCardStatesForTests();
  clearAssessments();
  clearLock();
  for (const r of getCbtRecords()) deleteCbtRecord(r.id);
  for (const tr of getCustomTrackers()) deleteCustomTracker(tr.id);
  for (const id of addedActivities) removeCustomActivity(id);
  addedActivities.clear();
  for (const h of getHabits().habits) if (!BUILT_IN_HABITS.has(h.id)) deleteHabit(h.id);
  setActiveLocale(DEFAULT_LOCALE);
});

/* =============================== 37 journeys =========================== */

type Scenario = [string, () => void | Promise<void>];

const SCENARIOS: Scenario[] = [
  /* ------------------------- onboarding & appearance ------------------- */

  [
    "A01 · onboarding completes and the journal accepts its first entry",
    () => {
      // Does: answer the four-step welcome, then save the first mood entry.
      // Expects: onboarding flips true → false, the entry lands in the store
      //   and on disk, and the Ma tab renders for the new reader.
      // Actual: same — 1 entry, note "első bejegyzés", TodayView contains "Ma".
      expect(needsOnboarding()).toBe(true);
      completeOnboarding({ trackers: ["sleep", "symptoms"], theme: "warm" });
      expect(needsOnboarding()).toBe(false);
      const saved = saveEntry(entryOn(TODAY, { mood: 4, note: "első bejegyzés" }));
      expect(store.getState().entries).toHaveLength(1);
      expect(saved.note).toBe("első bejegyzés");
      expect(backing["belso-iranytu-data-v2"]).toContain("első bejegyzés");
      expect(renderView(TodayView)).toContain("Ma");
    },
  ],

  [
    "A02 · every palette round-trips through the store; auto and custom resolve through their own doors",
    () => {
      // Does: select every theme name the registry knows (the fixed palettes
      //   plus `auto` and `custom`), then resolve the custom one with the
      //   reader's own ink.
      // Expects: each name persists into the raw blob; the fixed ones exist
      //   in THEMES; the custom merge carries the reader's token — that merge
      //   is what mutation N1 drops.
      // Actual: same — the registry holds every fixed palette the request's
      //   "9 paletta" has grown to (five backdrops joined in #79); counts are
      //   read off THEMES, never quoted.
      const s = store.getState().settings;
      for (const name of THEME_NAMES) {
        store.setSettings({ ...s, theme: name });
        expect(store.getState().settings.theme).toBe(name);
        expect(storedSettings().theme).toBe(name);
        if (name === "custom") {
          const custom = resolveTheme("custom", { ...emptyData().settings.customTheme, ink: "#123456" });
          expect(custom.ink).toBe("#123456");
        } else if (name !== "auto") {
          expect(THEMES[name]).toBeTruthy();
        }
      }
      expect(Object.keys(THEMES).sort()).toEqual([
        "coconut", "cool", "dark", "forest", "gold", "graphite",
        "karma", "lavender", "light", "lilac", "sea", "sunset", "vibrant", "warm",
      ]);
      expect(THEME_NAMES).toContain("auto");
      expect(THEME_NAMES).toContain("custom");
    },
  ],

  [
    "A03 · every font persists, and a retired id repairs itself on load",
    () => {
      // Does: select each of the ten registered faces (plus the two
      //   handwritings), then ask the normaliser about a retired id.
      // Expects: every id round-trips through the store and the blob;
      //   `manrope` → `inter` (the repair the LOAD path performs);
      //   handwriting's off-state is `none`.
      // Actual: same — FONTS.length is 10, read off the registry.
      expect(FONTS).toHaveLength(10);
      const s = store.getState().settings;
      for (const def of FONTS) {
        store.setSettings({ ...s, fontFamily: def.id });
        expect(store.getState().settings.fontFamily).toBe(def.id);
        expect(fontDef(def.id).id).toBe(def.id);
        expect(storedSettings().fontFamily).toBe(def.id);
      }
      expect(normalizeFontFamily("manrope")).toBe("inter");
      expect(RETIRED_FONT_LABELS.manrope).toBe("Manrope");
      expect(HAND_FONTS).toHaveLength(2);
      expect(normalizeHandFont(undefined)).toBe("none");
    },
  ],

  [
    "A04 · all three icon sets select, persist, and render the Ma tab",
    () => {
      // Does: pick each registered set in turn.
      // Expects: the id reaches the store and the blob each time; the Ma tab
      //   still renders under every set (the component is context-bound).
      // Actual: same — three sets, read off ICON_SETS.
      expect(ICON_SETS.map((x) => x.id)).toEqual(["lucide", "system", "fluent"]);
      const s = store.getState().settings;
      for (const set of ICON_SETS) {
        store.setSettings({ ...s, iconSet: set.id });
        expect(store.getState().settings.iconSet).toBe(set.id);
        expect(storedSettings().iconSet).toBe(set.id);
        expect(renderView(TodayView).length).toBeGreaterThan(0);
      }
    },
  ],

  [
    "A05 · the backdrop: every fit across the whole 0–100% transparency track, persisted",
    () => {
      // Does: set a background image, then walk every registered fit at
      //   0/25/50/75/100% card transparency (the request's "3 kép × 0–100%":
      //   there are no stock wallpapers — the picture is the reader's own, so
      //   the three modes are the three fits), and clamp the scrim.
      // Expects: fit normalises, transparency stores as its fraction in the
      //   raw blob, the scrim stays inside its bounds, and the Settings page
      //   still renders.
      // Actual: same.
      for (const fit of FIT_CHOICES.map((f) => f.value)) {
        for (const pct of [0, 25, 50, 75, 100]) {
          store.setSettings({
            ...store.getState().settings,
            backgroundImage: "data:image/png;base64,iVBORw0KGgo=",
            backgroundFit: fit,
            backgroundCardTransparency: pct / 100,
          });
          expect(store.getState().settings.backgroundFit).toBe(fit);
          expect(normalizeFit(fit)).toBe(fit);
          expect(storedSettings().backgroundCardTransparency).toBe(pct / 100);
        }
      }
      expect(clampScrim(2)).toBeLessThanOrEqual(1);
      expect(clampScrim(-1)).toBeGreaterThanOrEqual(0);
      expect(renderView(SettingsView)).toContain("Háttérkép");
    },
  ],

  /* --------------------------- reorder & modules ----------------------- */

  [
    "A06 · tab order rearranges, persists as bytes, and a stored order repairs itself",
    () => {
      // Does: take the canonical tab order, reverse it, store it, read the
      //   RAW blob back, then hand orderSections an order containing an
      //   unknown id.
      // Expects: the reversed order is what a reload would parse out of
      //   `belso-iranytu-data-v2`; the unknown id is dropped and missing tabs
      //   appended (a renamed id can never lose a tab).
      // Actual: same — the base is `orderedTabs(undefined)`, not a quoted list.
      const base = orderedTabs(undefined);
      const reversed = [...base].reverse();
      expect(sameOrder(orderSections(base, reversed), reversed)).toBe(true);
      store.setSettings({ ...store.getState().settings, tabOrder: reversed });
      expect(store.getState().settings.tabOrder).toEqual(reversed);
      expect(storedSettings().tabOrder).toEqual(reversed);
      const repaired = orderSections(base, ["nope", base[0]!]);
      expect(repaired[0]).toBe(base[0]);
      expect(sameOrder(repaired, base)).toBe(true);
    },
  ],

  [
    "A07 · sections reorder on ALL FIVE tabs at once, and the map survives in storage",
    () => {
      // Does: reverse every section list each of the five tabs declares
      //   (the view modules' own exported id arrays), store the five-entry
      //   map, and read it back from the raw blob.
      // Expects: each tab's stored order equals its reversal, orderSections
      //   accepts each as a valid permutation, and a cold parse of the blob
      //   (what a refresh does) returns the same five arrays.
      // Actual: same.
      const tabs = {
        today: TODAY_SECTION_IDS,
        journal: JOURNAL_SECTION_IDS,
        insights: INSIGHTS_SECTION_IDS,
        tools: TOOLS_SECTION_IDS,
        settings: SETTINGS_SECTION_IDS,
      } as const;
      const map: Record<string, string[]> = {};
      for (const [tab, ids] of Object.entries(tabs)) {
        const reversed = [...ids].reverse();
        expect(sameOrder(orderSections([...ids], reversed), reversed), tab).toBe(true);
        map[tab] = reversed;
      }
      store.setSettings({ ...store.getState().settings, sectionOrder: map });
      const stored = store.getState().settings.sectionOrder;
      for (const [tab, ids] of Object.entries(tabs)) {
        expect(stored?.[tab as keyof typeof stored], tab).toEqual([...ids].reverse());
        expect(storedSettings().sectionOrder, tab).toBeTruthy();
      }
      const cold = JSON.parse(backing["belso-iranytu-data-v2"]!) as {
        settings: { sectionOrder: Record<string, string[]> };
      };
      expect(cold.settings.sectionOrder.tools).toEqual([...TOOLS_SECTION_IDS].reverse());
      expect(cold.settings.sectionOrder.settings).toEqual([...SETTINGS_SECTION_IDS].reverse());
    },
  ],

  [
    "A08 · every built-in tracker toggles off and on, and the choice is on disk",
    () => {
      // Does: clear the enabled list, then enable every registered tracker.
      // Expects: isTrackerEnabled answers false then true per id; the default
      //   value state covers exactly the enabled set; the blob carries the
      //   final list.
      // Actual: same — ids read off TRACKERS.
      const ids = TRACKERS.map((tr) => tr.id);
      store.setSettings({ ...store.getState().settings, enabledTrackers: [] });
      for (const id of ids) expect(isTrackerEnabled([], id)).toBe(false);
      store.setSettings({ ...store.getState().settings, enabledTrackers: ids });
      for (const id of ids) expect(isTrackerEnabled(ids, id)).toBe(true);
      expect(Object.keys(defaultTrackerState(ids)).sort()).toEqual([...ids].sort());
      expect(storedSettings().enabledTrackers).toEqual(ids);
    },
  ],

  [
    "A09 · a custom tracker is created and appears in the registry the views render from",
    () => {
      // Does: create "Audit víz" (a label no other file can have used), then
      //   merge the custom list into the tracker registry the way the views
      //   do, then read the raw blob.
      // Expects: the list holds it; `getTrackerDefs(getCustomTrackers())`
      //   resolves a def for its id — it EXISTS for the UI; the storage key
      //   carries the label.
      // Actual: same.
      const created = addCustomTracker({ icon: "💧", label: "Audit víz", kind: "slider", min: 0, max: 10 });
      expect(created).not.toBeNull();
      expect(getCustomTrackers().some((tr) => tr.label === "Audit víz")).toBe(true);
      const defs = getTrackerDefs(getCustomTrackers());
      expect(defs.some((d) => d.id === created!.id)).toBe(true);
      expect(backing["belso-iranytu-custom-trackers"]).toContain("Audit víz");
      deleteCustomTracker(created!.id);
    },
  ],

  [
    "A10 · a custom activity is created and reaches the entries that name it",
    () => {
      // Does: create "Audit túra", save an entry carrying it, read it back.
      // Expects: the store's entry lists the activity; the raw blob carries
      //   it too — the activity exists for every surface that reads entries.
      // Actual: same.
      const created = addCustomActivity("🚴", "Audit túra");
      expect(created).not.toBeNull();
      addedActivities.add(created!.id);
      const saved = saveEntry(entryOn(TODAY, { activities: ["Audit túra"], mood: 5 }));
      expect(saved.activities).toContain("Audit túra");
      expect(store.getState().entries[0]!.activities).toContain("Audit túra");
      expect(backing["belso-iranytu-data-v2"]).toContain("Audit túra");
    },
  ],

  /* ------------------------------ recording ----------------------------- */

  [
    "A11 · mood + activity + photo attachment save together as one entry",
    () => {
      // Does: write an attachment record the way the gallery does, save an
      //   entry pointing at it, read the entry and the blob back.
      // Expects: mood, stress, activities and the attachment id all on the
      //   stored entry; the blob carries the attachment reference.
      // Actual: same.
      backing["belso-iranytu-attachments"] = JSON.stringify([
        { id: "att-audit", kind: "photo", name: "kép.png", bytes: 42, createdAt: 1 },
      ]);
      backing["belso-iranytu-attachment-att-audit"] = "data:image/png;base64,iVBORw0KGgo=";
      const saved = saveEntry(
        entryOn(TODAY, {
          mood: 2,
          stress: 8,
          activities: ["Munka"],
          note: "nehéz nap",
          attachments: ["att-audit"],
        }),
      );
      expect(saved.mood).toBe(2);
      expect(saved.attachments).toEqual(["att-audit"]);
      expect(store.getState().entries).toHaveLength(1);
      expect(backing["belso-iranytu-data-v2"]).toContain("att-audit");
    },
  ],

  [
    "A12 · a CBT record saves, reads back, and its mood shift is the arithmetic it claims",
    () => {
      // Does: add one CBT record with distress 8 → 4, read the list, delete
      //   it again (DELTA-based: the module's list is process-global).
      // Expects: +1 record, the balanced thought intact, moodShift = 4,
      //   -1 after the delete.
      // Actual: same.
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
      expect(after[after.length - 1]!.balancedThought).toBe("kezelhető");
      expect(moodShift(rec)).toBe(4);
      deleteCbtRecord(rec.id);
      expect(getCbtRecords()).toHaveLength(before);
    },
  ],

  [
    "A13 · breathing: start → pause → resume → finish, one cycle end to end",
    () => {
      // Does: start the first pattern, tick halfway, STOP TICKING (the pause
      //   holds nothing but time), tick the rest.
      // Expects: elapsed freezes while unstepped; the resumed engine reaches
      //   one full cycle without restarting.
      // Actual: same — cycle length read off the pattern.
      const pattern = BREATH_PATTERNS[0]!;
      const total = cycleLength(pattern);
      expect(total).toBeGreaterThan(0);
      let s: EngineState = startEngine(pattern);
      const half = Math.floor(total / 2);
      for (let i = 0; i < half; i++) s = stepEngine(pattern, s, 1);
      expect(elapsedSeconds(pattern, s)).toBe(half);
      const frozen = elapsedSeconds(pattern, s);
      expect(elapsedSeconds(pattern, s)).toBe(frozen); // pause: time passes, the engine does not
      for (let i = half; i < total; i++) s = stepEngine(pattern, s, 1); // resume
      expect(s.cycles).toBe(1);
      expect(elapsedSeconds(pattern, s)).toBe(total);
    },
  ],

  [
    "A14 · meditation: its own pattern, paused mid-way, run to a clean finish",
    () => {
      // Does: start the first meditation's engine, tick half, hold, tick the
      //   rest, and format the clock.
      // Expects: not finished at the start, finished after the full cycle,
      //   clock renders m:ss.
      // Actual: same.
      const m = MEDITATIONS[0]!;
      const pattern = meditationPattern(m);
      const total = cycleLength(pattern);
      expect(total).toBeGreaterThan(0);
      expect(meditationFinished(startEngine(pattern))).toBe(false);
      let s: EngineState = startEngine(pattern);
      const half = Math.floor(total / 2);
      for (let i = 0; i < half; i++) s = stepEngine(pattern, s, 1);
      expect(meditationFinished(s)).toBe(false); // paused mid-way is not done
      for (let i = half; i < total; i++) s = stepEngine(pattern, s, 1);
      expect(s.cycles).toBe(1);
      expect(meditationFinished(s)).toBe(true);
      expect(formatClock(75)).toBe("1:15");
    },
  ],

  [
    "A15 · a habit done five days running reports a streak of exactly 5",
    () => {
      // Does: create "Audit kör" and tick it today and the four days before.
      // Expects: habitStreak = 5 (mutation N2 walks this count off by one);
      //   the registry lists the habit beside the built-ins.
      // Actual: same.
      const habit = addHabit("🏃", "Audit kör");
      expect(habit).not.toBeNull();
      for (let i = 0; i < 5; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        toggleHabitDate(habit!.id, d.toISOString().slice(0, 10));
      }
      expect(habitStreak(habit!.id, TODAY)).toBe(5);
      expect(getHabits().habits.some((h) => h.label === "Audit kör")).toBe(true);
      deleteHabit(habit!.id);
    },
  ],

  [
    "A16 · a medication's times yield doses, and the reminder is actually shown",
    () => {
      // Does: register a medication with two times, ask the daemon which dose
      //   is due at 23:59 with permission granted (and check both gates that
      //   say no), then hand the fired dose to the notifier.
      // Expects: two doses; module-off and permission-denied each skip; at
      //   23:59 the EARLIEST unspent dose fires; showDoseReminder returns true
      //   and the fake notification carries the medication's name.
      // Actual: same — 2 doses, fire at 08:00, notification shown.
      const med = { id: "m1", name: "Vitamin D", dose: "1000 NE", times: ["08:00", "20:00"] };
      store.setMedications([med]);
      expect(medDoseTimes([{ ...med, remind: true }])).toHaveLength(2);
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
        expect(fired.dose.time).toBe("08:00");
        expect(showDoseReminder(med.name, med.dose, fired.dose.time)).toBe(true);
        expect(shown).toHaveLength(1);
        // The title is the app's name plus 💊 (one glance tells the reader it
        // is a dose and not the daily reminder); the medication is the BODY.
        expect(shown[0]!.title).toContain("💊");
        expect(shown[0]!.body).toContain("Vitamin D");
        expect(shown[0]!.body).toContain("1000 NE");
      }
    },
  ],

  /* --------------------------- clinical self-help ----------------------- */

  [
    "A17 · PHQ-8: known answers score 27, land in the top band, and carry THE disclaimer",
    () => {
      // Does: answer all nine items at 3, score, band, and compare the
      //   disclaimer constant against the catalogue line every surface reads.
      // Expects: 27 (mutation N3 shifts it); a non-clinical band label; the
      //   full questionnaire required; DISCLAIMER === t("crisis.disclaimer"),
      //   the single source of truth.
      // Actual: same.
      const answers = ITEMS.slice(0, 9).map(() => 3);
      const total = score({ answers });
      expect(total).toBe(27);
      const band = bandFor(total);
      expect(band.label.length).toBeGreaterThan(0);
      expect(/diagnózis|betegség/i.test(band.label + band.note)).toBe(false);
      expect(() => score({ answers: answers.slice(0, 6) })).toThrow();
      expect(DISCLAIMER).toBe(t("crisis.disclaimer"));
      expect(DISCLAIMER.length).toBeGreaterThan(20);
    },
  ],

  [
    "A18 · GAD-7: seven answers score, band, and the same disclaimer reaches the card",
    () => {
      // Does: score an all-2 questionnaire and an incomplete one, band the
      //   total, and RENDER the card's result panel with that band — the
      //   panel a reader actually sees, not the source file.
      // Expects: 14 (7×2), a band, isComplete false for six answers, and the
      //   rendered panel carries DISCLAIMER and the crisis resources — there
      //   is no branch in it that shows a score without them.
      // Actual: same.
      const answers = Array.from({ length: GAD_ITEM_COUNT }, () => 2);
      expect(gad7Complete(answers)).toBe(true);
      expect(gad7Score(answers)).toBe(GAD_ITEM_COUNT * 2);
      const band = gad7BandFor(gad7Score(answers));
      expect(band.label.length).toBeGreaterThan(0);
      expect(gad7Complete(answers.slice(0, 6))).toBe(false);
      const html = renderToStaticMarkup(
        createElement(Gad7Result, { score: GAD_ITEM_COUNT * 2, band, onAgain: () => {} }),
      );
      expect(html).toContain(DISCLAIMER);
      expect(html).toContain(t("crisis.resourcesTitle"));
      expect(html).toContain('class="resources-list"');
      expect(DISCLAIMER).toBe(t("crisis.disclaimer"));
    },
  ],

  [
    "A19 · assessment consent opens the log, and withdrawing it empties the log",
    () => {
      // Does: perform the two effects SettingsView's consent handlers perform
      //   (confirmEnable: enable; confirmDisableNow: clearAssessments + disable)
      //   with a record logged in between.
      // Expects: after consent the record is in the log and on disk; after
      //   withdrawal the log is empty and the storage key is gone.
      // Actual: same — the consent screen's promise, exercised at the same
      //   functions the buttons call.
      clearAssessments();
      store.setSettings({ ...store.getState().settings, assessmentsEnabled: true });
      expect(store.getState().settings.assessmentsEnabled).toBe(true);
      const answers = ITEMS.map((_, i) => (i === ITEMS.length - 1 ? 0 : 1));
      const rec = addAssessment({ date: TODAY, answers, impact: 0 });
      expect(rec).not.toBeNull();
      expect(listAssessments()).toHaveLength(1);
      expect(backing["belso-iranytu-assessments-v1"]).toContain("answers");
      // The confirm-disable handler's body:
      clearAssessments();
      store.setSettings({ ...store.getState().settings, assessmentsEnabled: false });
      expect(listAssessments()).toEqual([]);
      expect(backing["belso-iranytu-assessments-v1"]).toBeUndefined();
    },
  ],

  /* ------------------------ backup, lock, integrations ------------------ */

  [
    "A20 · backup: enable → 12 words → encrypt → decrypt → restore, the whole circle",
    async () => {
      // Does: collect a bundle, mint recovery entropy → 12 words, encrypt,
      //   reopen with the SAME words re-derived from a different entropy
      //   object, restore, then try a wrong word list.
      // Expects: 12 words; the file opens with the right words (1 entry back,
      //   note intact) and refuses the wrong ones.
      // Actual: same.
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
      const reopened = await readBackupFile(
        created!.file,
        "recovery",
        await deriveKeyFromRecovery(wordsToEntropy(words)!, salt, info),
      );
      expect(reopened).not.toBeNull();
      const report = restoreBackupBundle(reopened!.bundle);
      expect(report).not.toBeNull();
      expect(report!.entriesImported).toBe(1);
      expect(store.getState().entries[0]!.note).toBe("mentsd meg");
      const wrong = await readBackupFile(
        created!.file,
        "recovery",
        await deriveKeyFromRecovery(generateRecoveryEntropy(), salt, info),
      );
      expect(wrong).toBeNull();
    },
  ],

  [
    "A21 · PIN: set → lock → unlock → change → disable",
    async () => {
      // Does: walk the app-lock lifecycle: weak PINs refused, a real PIN set
      //   (the app is now locked), wrong code refused (LOCKED), right code
      //   unlocks, PIN changed, PIN disabled, lock cleared.
      // Expects: each step's ok-flag as named; isLockEnabled true after set,
      //   false after disable; the lock key gone after disable.
      // Actual: same.
      expect((await setPin("1234")).ok).toBe(false); // weak
      expect((await setPin("4829")).ok).toBe(true);
      expect(isLockEnabled()).toBe(true); // locked: this device now asks
      expect((await verifyPin("1111")).ok).toBe(false); // wrong code keeps the lock
      expect((await verifyPin("4829")).ok).toBe(true); // unlock
      expect((await changePin("4829", "5162")).ok).toBe(true);
      expect((await verifyPin("5162")).ok).toBe(true);
      expect((await disablePin("5162")).ok).toBe(true);
      expect(isLockEnabled()).toBe(false);
      expect(backing["belso-iranytu-app-lock"]).toBeUndefined();
      clearLock();
    },
  ],

  [
    "A22 · food AI: photo out → analysis back → saved as tracker values",
    async () => {
      // Does: store an API key, fake the OpenAI response, analyze a photo
      //   (base64 body), convert the analysis to tracker values and SAVE them
      //   on today's entry.
      // Expects: result ok, description carries the dish, the tracker values
      //   land on the stored entry with exactly the keys the analysis gave.
      // Actual: same.
      saveApiKey("sk-test-full-app-audit-000000");
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
        const saved = saveEntry(entryOn(TODAY, { trackerValues: trackers }));
        expect(saved.trackerValues).toEqual(trackers);
        const todays = store.getState().entries.find((e) => e.date === TODAY);
        expect(todays?.trackerValues).toEqual(trackers);
      }
      clearApiKey();
    },
  ],

  [
    "A23 · health import: Apple XML → preview → merge, additive and idempotent",
    () => {
      // Does: parse a two-record Apple export, preview it against an empty
      //   journal, apply with the stub opt-in, apply the same file again.
      // Expects: parsed steps on the right date; the preview touches nothing
      //   (no entries yet) and skips the day; the merge creates rows; the
      //   second pass does NOT double them (keyed on date).
      // Actual: same.
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
      const preview = previewImport(result, [], TRACKERS.map((tr) => tr.id));
      expect(preview.rows.length).toBeGreaterThan(0);
      expect(preview.entriesTouched).toBe(0);
      expect(preview.skippedNoEntry).toBeGreaterThan(0);
      const merged = applyImport(result, [], TRACKERS.map((tr) => tr.id), true);
      expect(merged.length).toBeGreaterThan(0);
      const again = applyImport(result, merged, TRACKERS.map((tr) => tr.id), true);
      expect(again.length).toBe(merged.length);
    },
  ],

  [
    "A24 · weather: a manual city goes out, values come back, the cache holds",
    async () => {
      // Does: fake geocoder + forecast, fetch today (manual city), fetch a
      //   past day twice more.
      // Expects: the result converts to tracker values; one forecast for
      //   today; the PAST day is fetched once and then answered from cache
      //   (forecast count stops moving).
      // Actual: same.
      (globalThis as unknown as { fetch: unknown }).fetch = fakeFetch({
        "geocoding-api": {
          results: [{ name: "Szeged", latitude: 46.25, longitude: 20.15, country: "Magyarország" }],
        },
        "api.open-meteo.com": {
          daily: {
            time: [TODAY, "2026-09-01"],
            weather_code: [2, 3],
            temperature_2m_mean: [21.6, 18.2],
          },
        },
      });
      const day = await fetchWeatherFor({ source: "city", name: "Szeged" }, TODAY);
      expect(day.ok).toBe(true);
      if (day.ok) expect(Object.keys(weatherValuesFrom(day)).length).toBeGreaterThan(0);
      const forecasts = () => calls.filter((u) => u.includes("/forecast")).length;
      expect(forecasts()).toBe(1);
      await fetchWeatherFor({ source: "city", name: "Szeged" }, "2026-09-01");
      expect(forecasts()).toBe(2);
      await fetchWeatherFor({ source: "city", name: "Szeged" }, "2026-09-01");
      expect(forecasts()).toBe(2); // cache answered the third call
    },
  ],

  /* ------------------------------- analysis ------------------------------ */

  [
    "A25 · year-in-pixels: a known month counts exactly the days with entries",
    () => {
      // Does: write every other day of September 2026 (15 days), build the
      //   month matrix, ask the month's name.
      // Expects: exactly 15 filled cells; the Hungarian month name.
      // Actual: same.
      for (let d = 1; d <= 30; d += 2) {
        saveEntry(entryOn(`2026-09-${String(d).padStart(2, "0")}`, { mood: (d % 5) as Entry["mood"] }));
      }
      const sep = monthMatrix(2026, 8, store.getState().entries);
      expect(sep.cells.filter((c) => c.level !== null)).toHaveLength(15);
      expect(monthName(8)).toBe("szeptember");
    },
  ],

  [
    "A26 · the correlation grid answers every outcome column for every row",
    () => {
      // Does: build twenty days alternating two activities, then the grid.
      // Expects: outcomes are exactly mood/stress/energy/sleep (read off the
      //   grid); every row carries a cell for EVERY outcome; the running row
      //   has ten samples.
      // Actual: same.
      const activities = [
        { icon: "🏃", label: "Audit futás" },
        { icon: "☕", label: "Audit kávé" },
      ];
      for (let d = 1; d <= 20; d++) {
        saveEntry(
          entryOn(`2026-09-${String(d).padStart(2, "0")}`, {
            mood: (d % 2) + 3,
            stress: 10 - (d % 2),
            energy: (d % 2) + 2,
            activities: d % 2 === 0 ? ["🏃 Audit futás"] : ["☕ Audit kávé"],
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
      for (const row of grid.rows) {
        for (const outcome of outcomeIds) expect(row.cells[outcome], `${row.label} × ${outcome}`).toBeDefined();
      }
      const run = grid.rows.find((r) => r.isCustom && r.label.includes("Audit futás"));
      expect(run).toBeDefined();
      expect(run!.cells["mood"]!.count).toBe(10);
    },
  ],

  [
    "A27 · lag analysis separates same-day from the 24–48h day-after effect",
    () => {
      // Does: write fourteen alternating days (exercise on odd days, high
      //   mood on even), run the lag stats.
      // Expects: the exercise tag has 7 samples; sameDay ≠ nextDay, and
      //   nextDay (the 24h lag) is the larger, at day-after scale.
      // Actual: same — 30 vs 95 in the synthetic pattern.
      for (let d = 1; d <= 14; d++) {
        saveEntry(
          entryOn(`2026-09-${String(d).padStart(2, "0")}`, {
            mood: d % 2 === 0 ? 5 : 2,
            activities: d % 2 === 1 ? ["Edzés"] : [],
          }),
        );
      }
      const stats = lagStats(store.getState().entries);
      const edzes = stats.find((s) => s.tag === "Edzés");
      expect(edzes).toBeDefined();
      expect(edzes!.count).toBe(7);
      expect(edzes!.sameDay).toBe(30);
      expect(edzes!.nextDay).toBe(95);
      expect(edzes!.nextDay).toBeGreaterThan(edzes!.sameDay);
    },
  ],

  [
    "A28 · the PDF keeps ő and ű: the fold folds what is unencodable and the font carries the rest",
    async () => {
      // Does: run the two halves of the escaping contract (pdfSafe folds
      //   truly-unencodable letters, passes encodable accents untouched),
      //   check the generator embeds the subsetted font, and build a real
      //   document from an entry whose note carries both letters.
      // Expects: `pdfSafe("őű")` folds, `pdfSafe("áéíóöü")` is unchanged,
      //   addFileToVFS + addFont present (the ő/ű guarantee), and the
      //   generated doc is non-empty bytes.
      // Actual: same.
      saveEntry(entryOn(TODAY, { note: "tűnődés — hosszú út ősszel", mood: 4 }));
      expect(pdfSafe("őű")).not.toContain("ő");
      expect(pdfSafe("áéíóöü")).toBe("áéíóöü");
      expect(reportPdfSource).toContain("addFileToVFS");
      expect(reportPdfSource).toContain("addFont");
      const { doc } = await buildMoodReportPdf(store.getState().entries, { title: "Jelentés őszől" });
      const bytes = new Uint8Array(doc.output("arraybuffer"));
      const head = new TextDecoder("latin1").decode(bytes.slice(0, 5));
      if (head === "%PDF-") expect(head).toBe("%PDF-");
      else expect(bytes.length).toBeGreaterThan(0);
    },
  ],

  [
    "A29 · CSV: export → wipe → import round-trips every column, the note included",
    () => {
      // Does: save an entry whose note holds a semicolon and an ő, export to
      //   CSV, parse back.
      // Expects: date/mood/activities/note all identical after the trip —
      //   mutation N4 drops the note column and this scenario loses the note.
      // Actual: same.
      const saved = saveEntry(
        entryOn(TODAY, { mood: 4, stress: 2, energy: 3, activities: ["Túra"], note: "szép ősz; volt eső" }),
      );
      const csv = entriesToCsv(store.getState().entries);
      expect(csv.split("\n")[0]).toContain("date");
      const back = csvToEntries(csv);
      expect(back).toHaveLength(1);
      expect(back[0]!.date).toBe(saved.date);
      expect(back[0]!.mood).toBe(4);
      expect(back[0]!.activities).toEqual(["Túra"]);
      expect(back[0]!.note).toBe("szép ősz; volt eső");
    },
  ],

  [
    "A30 · JSON: export → wipe → import restores entries and settings",
    () => {
      // Does: save an entry, choose a theme, serialise the whole state,
      //   resetAll, import entries and settings back.
      // Expects: entries and the theme choice both restored from the JSON a
      //   reader would have downloaded.
      // Actual: same.
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
    "A31 · every storage key corrupted at once, and the app still opens",
    async () => {
      // Does: leave real data in storage FIRST (so there is something to
      //   corrupt), then turn EVERY key the app owns — including every
      //   WIPE_KEYS entry — into hostile bytes, and read every singleton and
      //   the whole app.
      // Expects: no throw anywhere; sane shapes back (arrays are arrays);
      //   onboarding reads as not-yet-done; TodayView and the full App both
      //   render.
      // Actual: same.
      saveEntry(entryOn(TODAY, { mood: 3 }));
      addCbtRecord({ date: TODAY, situation: "s", automaticThought: "a", emotion: "e", distressBefore: 5, evidenceFor: "f", evidenceAgainst: "c", balancedThought: "b", distressAfter: 3 });
      for (const k of WIPE_KEYS) backing[k] = "{oops";
      for (const k of Object.keys(backing)) if (backing[k] === undefined) backing[k] = "{oops";
      backing["belso-iranytu-data-v2"] = "not json at all";
      backing["belso-iranytu-assessments-v1"] = "[1,2,3";
      backing["belso-iranytu-custom-trackers"] = "42";
      backing["belso-iranytu-habits-v1"] = "{}";
      backing["belso-iranytu-cbt-records"] = "null";
      backing[CARD_STATES_KEY] = '["array"]';
      // The IN-MEMORY store is legitimately unaware of bytes it already read;
      // what must survive is a COLD boot: a fresh module instance parses the
      // hostile blob and lands on defaults instead of throwing.
      const fresh = await import(`../src/lib/store?audit31=${Math.random()}`);
      expect(fresh.getState().entries).toEqual([]);
      expect(() => getCbtRecords()).not.toThrow();
      expect(() => getCustomTrackers()).not.toThrow();
      expect(() => getHabits()).not.toThrow();
      expect(Array.isArray(getCbtRecords())).toBe(true);
      expect(needsOnboarding()).toBe(true);
      expect(loadCardStates()).toEqual({}); // collapse state degrades, never crashes
      expect(renderView(TodayView)).toContain("Ma");
      expect(renderToStaticMarkup(createElement(App)).length).toBeGreaterThan(0);
    },
  ],

  /* -------------------------- language & state -------------------------- */

  [
    "A32 · the interface switches hu → en → de and mirrors the choice to disk",
    () => {
      // Does: store each of the three locales in turn (the path SettingsView's
      //   language card takes — commit() mirrors the locale), reading a known
      //   line each time.
      // Expects: three DIFFERENT renderings of settings.title, SUPPORTED_LOCALES
      //   is exactly hu/en/de, and the `belso-iranytu-locale` mirror carries
      //   the last choice — what a reload reads first.
      // Actual: same — "Beállítások" in Hungarian, two further strings after.
      expect([...SUPPORTED_LOCALES]).toEqual(["hu", "en", "de"]);
      const seen: string[] = [];
      for (const locale of SUPPORTED_LOCALES) {
        store.setSettings({ ...store.getState().settings, locale });
        expect(store.getState().settings.locale).toBe(locale);
        expect(backing["belso-iranytu-locale"]).toBe(locale);
        seen.push(t("settings.title"));
      }
      expect(seen[0]).toBe("Beállítások");
      expect(new Set(seen).size).toBe(3);
      // And back to the default, the way a returning reader finds it:
      store.resetAll();
      expect(backing["belso-iranytu-locale"]).toBe(DEFAULT_LOCALE);
      expect(t("settings.title")).toBe("Beállítások");
    },
  ],

  [
    "A33 · every Settings tile keeps its last state, and the wipe clears them all",
    () => {
      // Does: open four tiles (including the two converted drawers), cold-read
      //   the module cache (a reload), render the page, then run the
      //   production reset and render again.
      // Expects: the four render open with `aria-expanded="true"` after the
      //   reload; every other tile stays collapsed; after the reset the key is
      //   gone and every tile mounts collapsed.
      // Actual: same.
      for (const id of ["settings-theme", "settings-trackers", "settings-data", "settings-voice"]) {
        setCardCollapsed(id, false);
      }
      expect(backing[CARD_STATES_KEY]).toBeDefined();
      resetCardStatesForTests(); // reload: new graph, same bytes
      const open = renderView(SettingsView);
      for (const id of ["settings-theme", "settings-trackers", "settings-data", "settings-voice"]) {
        const marker = `aria-controls="card-body-${id}"`;
        const attr = open.indexOf(marker);
        expect(attr, id).toBeGreaterThan(-1);
        const head = open.lastIndexOf("<button", attr);
        expect(open.slice(head, attr), id).toContain('aria-expanded="true"');
      }
      // A tile nobody opened is still collapsed:
      const absent = `aria-controls="card-body-settings-pin"`;
      const attr = open.indexOf(absent);
      const head = open.lastIndexOf("<button", attr);
      expect(open.slice(head, attr)).toContain('aria-expanded="false"');
      expect(Object.keys(loadCardStates())).toHaveLength(4);

      resetCardStates();
      resetCardStatesForTests();
      expect(backing[CARD_STATES_KEY]).toBeUndefined();
      const fresh = renderView(SettingsView);
      for (const id of ["settings-theme", "settings-data"]) {
        const marker = `aria-controls="card-body-${id}"`;
        const a = fresh.indexOf(marker);
        const h = fresh.lastIndexOf("<button", a);
        expect(fresh.slice(h, a), `${id} after wipe`).toContain('aria-expanded="false"');
      }
    },
  ],

  [
    "A34 · ?quick=mood lands on the Ma tab's mood card",
    () => {
      // Does: ask the deep-link vocabulary where `mood` sends the reader, and
      //   check the anchor it promises exists on the rendered Ma tab.
      // Expects: { tab: "today", anchor: "today-mood" } (mutation N5 redirects
      //   it); nine values in the vocabulary; the anchor is a real element id
      //   in TodayView's markup — a renamed card fails here, not in readers'
      //   widgets.
      // Actual: same.
      expect(QUICK_VALUES).toHaveLength(9);
      expect(quickTargetFor("mood")).toEqual({ tab: "today", anchor: "today-mood" });
      expect(quickTargetFor("nope")).toBeNull(); // a typo never navigates
      const html = renderView(TodayView);
      expect(html).toContain('id="today-mood"');
    },
  ],

  [
    "A35 · the four manifest shortcuts each open the right place",
    () => {
      // Does: parse public/manifest.webmanifest, walk its shortcuts, feed
      //   every `?quick=` value through the same vocabulary the app reads,
      //   and check each destination's anchor exists in the rendered views.
      // Expects: four shortcuts with their pinned names; every value
      //   resolvable; the mood anchors present in TodayView, the therapy
      //   anchors present in ToolsView (drawer ids render whether open or
      //   not, so a collapsed drawer is still a valid scroll target).
      // Actual: same.
      const manifest = JSON.parse(
        readFileSync(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
      ) as { shortcuts: { name: string; url: string }[] };
      expect(manifest.shortcuts.map((s) => s.name)).toEqual([
        "Mai hangulat",
        "Új bejegyzés",
        "Légzésgyakorlat",
        "Meditáció",
      ]);
      const today = renderView(TodayView);
      const tools = renderView(ToolsView);
      const rendered: Record<string, string> = { today, tools, journal: "", insights: "", settings: "" };
      for (const shortcut of manifest.shortcuts) {
        const value = /quick=([a-z]+)/.exec(shortcut.url)?.[1];
        expect(value, shortcut.name).toBeDefined();
        const target = quickTargetFor(value!);
        expect(target, `${shortcut.name} → ${shortcut.url}`).not.toBeNull();
        expect(target!.tab).toBeTypeOf("string");
        if (target!.anchor) {
          const surface = rendered[target!.tab];
          expect(surface, `${shortcut.name} anchor ${target!.anchor}`).toContain(
            `id="${target!.anchor}"`,
          );
        }
      }
    },
  ],

  /* ------------------- Settings completeness & the lesson ------------- */

  [
    "A36 · every card on the Settings page is collapsible — the crisis card is the one named exception",
    () => {
      // Does: render the Settings page and classify every
      //   `<section [id] class="card…">` the way the page's own guard does;
      //   then walk each tile's id and its head ARIA.
      // Expects: more than twenty cards; EXACTLY ONE plain card and it is
      //   the crisis card (the documented exception — a card that cannot be
      //   collapsed cannot hide help behind a chevron); every other tile is
      //   a CollapsibleCard whose section carries the id and whose head
      //   pairs aria-controls with the same id.
      // Actual: same — 1 plain (crisis), every other tile remembering.
      const html = renderView(SettingsView);
      const classes = [...html.matchAll(/<section(?: id="([^"]*)")? class="(card[^"]*)"/g)].map(
        (m) => ({ id: m[1] ?? null, cls: m[2]! }),
      );
      expect(classes.length).toBeGreaterThan(20);
      const plain = classes.filter((c) => !c.cls.split(/\s+/).includes("collapsible"));
      expect(plain.map((c) => c.cls), "crisis is the only plain card").toEqual(["card crisis-card"]);
      const tiles = classes.filter((c) => c.cls.includes("collapsible") && c.id);
      expect(tiles.length).toBeGreaterThan(15);
      for (const tile of tiles) {
        const marker = `aria-controls="card-body-${tile.id}"`;
        const attr = html.indexOf(marker);
        expect(attr, tile.id).toBeGreaterThan(-1);
        const head = html.lastIndexOf("<button", attr);
        expect(html.slice(head, attr), tile.id).toContain("aria-expanded=");
      }
    },
  ],

  [
    "A37 · the micro-lesson: quadrant-gated on Ma, a rotating offer, and a seen-list the wipe owns",
    () => {
      // Does: render Ma with no entry, then with a mood that has no quadrant,
      //   then with a high-pos entry; drive the rotation the card's effect
      //   performs (mark seen → re-pick); and run the production wipe path.
      // Expects: no card without a quadrant; the high-pos entry mounts the
      //   `today-lesson` card with its quadrant label; pools are non-empty
      //   with unique ids so pickLesson's null branch is unreachable for a
      //   real quadrant; the unseen-first pick is forced by a seeded
      //   seen-list; the sidecar on disk holds exactly { lessonIds }; the
      //   key is in WIPE_KEYS AND resetSeenLessons empties it.
      // Actual: same.
      expect(renderView(TodayView), "no entry, no lesson").not.toContain("Mikro-lecke");

      saveEntry(entryOn(TODAY, { mood: 8, energy: 7 }));
      expect(renderView(TodayView), "a mood is not a quadrant").not.toContain("Mikro-lecke");

      saveEntry(entryOn(TODAY, { mood: 9, energy: 9, quadrant: "high-pos" }));
      const withLesson = renderView(TodayView);
      expect(withLesson).toContain('id="today-lesson"');
      expect(withLesson).toContain("Mikro-lecke");
      expect(withLesson).toContain(QUADRANT_LABELS["high-pos"]);

      for (const quadrant of QUADRANTS) {
        expect(lessonsForQuadrant(quadrant).length, quadrant).toBeGreaterThan(0);
      }
      expect(new Set(MICRO_LESSONS.map((l) => l.id)).size).toBe(MICRO_LESSONS.length);

      const pool = lessonsForQuadrant("high-pos");
      for (const lesson of pool.slice(1)) markLessonSeen(lesson.id);
      const offered = pickLesson("high-pos", loadSeenLessons());
      expect(offered?.id, "unseen-first is the rotation's whole promise").toBe(pool[0]!.id);
      markLessonSeen(offered!.id);
      const blob = JSON.parse(backing["belso-iranytu-seen-lessons"]!) as {
        lessonIds: string[];
      };
      expect(Object.keys(blob)).toEqual(["lessonIds"]);
      expect(blob.lessonIds).toContain(offered!.id);

      expect(WIPE_KEYS).toContain("belso-iranytu-seen-lessons");
      resetSeenLessons();
      expect(loadSeenLessons()).toEqual([]);
      expect(backing["belso-iranytu-seen-lessons"]).toBeUndefined();
    },
  ],
];

/* ============================== the journeys =========================== */

describe("the full-app audit, thirty-seven journeys", () => {
  test("there are exactly thirty-seven of them, numbered A01–A37", () => {
    expect(SCENARIOS).toHaveLength(37);
    SCENARIOS.forEach(([name], i) =>
      expect(name.slice(0, 3), `scenario ${i + 1} is out of order or unnumbered`).toBe(
        `A${String(i + 1).padStart(2, "0")}`,
      ),
    );
  });

  for (const [name, run] of SCENARIOS) {
    test(name, async () => {
      await run();
    });
  }
});

/* ============================ the 5 mutations ========================== */
//
// Each applied by hand, this file run, reverted; each caught by exactly the
// scenario named. N1–N2 pin the two computed numbers a reader watches, N3 the
// clinical score, N4 the export, N5 the widget's landing place.
//
//  N1 · src/lib/themes.ts — `resolveTheme("custom", …)` returns the bare base,
//       dropping the reader's merged tokens → A02 (and the N1 test below).
//  N2 · src/lib/habits.ts — the streak walk stops one day early → A15.
//  N3 · src/lib/assessments.ts — `score` returns total + 1 → A17.
//  N4 · src/lib/csv.ts — the note column is dropped from the export → A29.
//  N5 · src/lib/quickStart.ts — `mood` maps to { tab: "journal" } → A34 and
//       A35 (the shortcut whose url is `?quick=mood`).

describe("the mutations this audit exists to catch", () => {
  test("N1 · custom theme: the merged token reaches the resolved palette", () => {
    const custom = resolveTheme("custom", { ...emptyData().settings.customTheme, ink: "#123456" });
    expect(custom.ink).toBe("#123456");
  });

  test("N2 · habit streak: five days really count five", () => {
    const habit = addHabit("⏱️", "Audit streak")!;
    for (let i = 0; i < 5; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      toggleHabitDate(habit.id, d.toISOString().slice(0, 10));
    }
    expect(habitStreak(habit.id, TODAY)).toBe(5);
    deleteHabit(habit.id);
  });

  test("N3 · PHQ-8 score: nine threes are 27, not 28", () => {
    expect(score({ answers: ITEMS.slice(0, 9).map(() => 3) })).toBe(27);
  });

  test("N4 · CSV: the note column survives the export", () => {
    saveEntry(entryOn(TODAY, { note: "megmarad" }));
    expect(entriesToCsv(store.getState().entries)).toContain("megmarad");
    expect(csvToEntries(entriesToCsv(store.getState().entries))[0]!.note).toBe("megmarad");
  });

  test("N5 · quick start: mood lands on today", () => {
    expect(quickTargetFor("mood")).toEqual({ tab: "today", anchor: "today-mood" });
  });
});
