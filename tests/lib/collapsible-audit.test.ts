/**
 * Phase 5, commit 1 — the state audit, and the guard it leaves behind.
 *
 * WHAT WAS AUDITED, AND WHY IT IS ONE FILE
 * Two questions, and the corpus they share: what the app remembers about the
 * reader that is NOT the journal, and whether "Minden adat törlése" actually
 * removes it. The collapse map is the case the phase is named for — it is
 * view state, deliberately out of the backup bundle, and it was the one key the
 * wipe chain had never been taught — but the same walk found seven more records
 * whose modules export a reset that the chain never called, two of them with
 * docblocks that already claimed it did (`resetExperiments`,
 * `resetEventFeatures`). Fixing only the collapsed-card half would have left
 * the reader's food log, workout log, chosen diet and custom foods on the
 * device after a delete-everything, so the commit fixes the class and this file
 * is the proof for the class.
 *
 * WHY THE COLLAPSE HOOK IS SOURCE-LEVEL
 * `renderToStaticMarkup` runs no effects and the detail blocks sit behind
 * component state, so a render can see neither the ids nor the toggles. The
 * checks here are therefore about the TREE: which cards remember, under which
 * ids, and whether those ids can collide. That is the same bargain
 * `tests/views/tools-split.test.ts` strikes for the toolbox, and it catches the
 * two failures this inventory is actually exposed to — a duplicated id (one
 * card's toggle moving another's) and a renamed id (a reader's stored
 * arrangement dropped silently).
 *
 * THE ID LIST IS FROZEN ON PURPOSE
 * `id` is the vocabulary of `belso-iranytu:cardStates` and of a reader's
 * arrangement, so an id is not an internal name: renaming one loses whatever
 * that reader had open, and the loss is invisible. The list below is therefore
 * pinned as an equality rather than sampled, so a rename shows up as a failing
 * test that names both the old and the new id instead of as a diff nobody
 * reads. Adding a card is one row; renaming one is a decision.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CARD_STATES_KEY,
  loadCardStates,
  resetCardStates,
  resetCardStatesForTests,
  setCardCollapsed,
} from "../../src/lib/cardStates";
import { BACKUP_EXCLUDED_KEYS, BACKUP_INCLUDED_KEYS } from "../../src/lib/backup";
import { RESET_FUNCTIONS } from "../../src/lib/storageKeys";
import { trackerGroupHeads } from "../../src/lib/trackers";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

/* ------------------------- the tree, read once ------------------------- */

function walk(dir: string, match: RegExp): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path, match));
    else if (match.test(path)) out.push(path);
  }
  return out;
}

const SRC_FILES = walk(join(ROOT, "src"), /\.tsx$/);

type Mount = {
  /** Path relative to the repository root, so the failure messages are copyable. */
  file: string;
  line: number;
  /** The literal id, or the one dynamic pattern the tree uses. */
  raw: string;
  /** Whether the mount passes a `summary`, which is what a collapsed card shows. */
  summary: boolean;
};

/**
 * Every `CollapsibleCard` mount. The id and the summary are read out of a
 * window after the opening tag, because both are usually on their own line.
 */
function mounts(): Mount[] {
  const out: Mount[] = [];
  for (const abs of SRC_FILES) {
    const file = abs.slice(ROOT.length).replace(/\\/g, "/");
    const lines = readFileSync(abs, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (!/<CollapsibleCard\b/.test(line)) return;
      const window = lines.slice(i, i + 8).join("\n");
      const literal = /id="([^"]+)"/.exec(window);
      const dynamic = /id=\{`([^`]+)`\}/.exec(window);
      out.push({
        file,
        line: i + 1,
        raw: literal?.[1] ?? dynamic?.[1] ?? "(no id)",
        summary: /summary=/.test(window),
      });
    });
  }
  return out;
}

const MOUNTS = mounts();

/** The one dynamic id pattern, expanded through the registry that owns the ids. */
const TRACKER_PATTERN = "tracker-${head.id}";

const IDS = MOUNTS.flatMap((m) =>
  m.raw === TRACKER_PATTERN ? trackerGroupHeads().map((h) => `tracker-${h.id}`) : [m.raw],
).sort();

const BACKING: Record<string, string> = {};
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => (k in BACKING ? BACKING[k] : null),
  setItem: (k: string, v: string) => {
    BACKING[k] = v;
  },
  removeItem: (k: string) => {
    delete BACKING[k];
  },
};

beforeEach(() => {
  for (const k of Object.keys(BACKING)) delete BACKING[k];
  resetCardStatesForTests();
});

afterEach(() => {
  for (const k of Object.keys(BACKING)) delete BACKING[k];
  resetCardStatesForTests();
});

/* --------------------------- the inventory --------------------------- */

describe("the collapsible cards' inventory, read out of the tree", () => {
  test("every remembering card carries an id, and no two cards share one", () => {
    expect(MOUNTS.length).toBeGreaterThan(0);
    const missing = MOUNTS.filter((m) => m.raw === "(no id)").map((m) => `${m.file}:${m.line}`);
    expect(missing, "a mount with no id cannot be given one at runtime").toEqual([]);

    const byId = new Map<string, string[]>();
    for (const m of MOUNTS) {
      const ids = m.raw === TRACKER_PATTERN ? trackerGroupHeads().map((h) => `tracker-${h.id}`) : [m.raw];
      for (const id of ids) byId.set(id, [...(byId.get(id) ?? []), `${m.file}:${m.line}`]);
    }
    // A shared id is one stored boolean serving two buttons: collapsing the
    // food log would collapse the tracker card with it, and the reader would
    // report it as a card that "sometimes jumps".
    const shared = [...byId].filter(([, where]) => where.length > 1);
    expect(shared, "ids used by more than one mount").toEqual([]);
  });

  test("every remembering card can say what it holds while collapsed", () => {
    // The summary is the whole reason a card is allowed to remember being
    // closed: without it a collapsed card is a title, and a reader has no way
    // to tell an empty one from a full one.
    const silent = MOUNTS.filter((m) => !m.summary).map((m) => `${m.file}:${m.line} (${m.raw})`);
    expect(silent).toEqual([]);
  });

  test("the id vocabulary is the pinned one — a rename is a decision, not a refactor", () => {
    expect(IDS).toEqual([
      "fitness-plans",
      "food-ai-settings",
      "food-photo",
      "health-general",
      "health-import",
      "health-nutrition",
      "health-training",
      "insights-achievements",
      "insights-activity-correlation",
      "insights-correlation",
      "insights-emotion-context",
      "insights-lag",
      "insights-monthly-yearly",
      "insights-patterns",
      "insights-quadrant-sleep",
      "insights-report-export",
      "insights-trend",
      "insights-week",
      "insights-year",
      "journal-calendar",
      "journal-entries",
      "nutrition-log",
      "settings-accessibility",
      "settings-allergies",
      "settings-background",
      "settings-backup",
      "settings-custom-activities",
      "settings-custom-theme",
      "settings-custom-trackers",
      "settings-data",
      "settings-font",
      "settings-iconset",
      "settings-install",
      "settings-language",
      "settings-med-times",
      "settings-modules",
      "settings-mood-flow",
      "settings-navigation",
      "settings-nutrition-tips",
      "settings-pin",
      "settings-privacy",
      "settings-profile",
      "settings-reminder",
      "settings-sport-tips",
      "settings-theme",
      "settings-trackers",
      "settings-update",
      "settings-voice",
      "today-activities",
      "today-balance",
      "today-daily-goals",
      "today-lesson",
      "today-mood",
      "today-weekly-reflection",
      "tools-assessment",
      "tools-breathing",
      "tools-cbt",
      "tools-experiment",
      "tools-gad7",
      "tools-gratitude",
      "tools-habits",
      "tools-library",
      "tools-meditation",
      "tools-meds",
      "tools-question",
      "tools-reflection",
      "tools-vitals",
      "tools-weekly-nutrition",
      "tools-workouts",
      // The Ma tab's tracker frame. It joined the vocabulary when the plain
      // `<div class="card-head">` it used to wear was replaced: a head with a
      // title and an icon and no chevron was a control that looked like one,
      // which is exactly what a reader reported as "the card cannot be
      // collapsed". Its id is the frame's, not a group's, so it cannot collide
      // with the `tracker-*` ids the registry expands below it.
      "tracker-frame",
      "tracker-nutrition",
      "tracker-sleep",
      "tracker-sport",
      "tracker-steps",
      "tracker-symptoms",
      "tracker-vitamins",
      "tracker-weather-condition",
      "weather-api",
    ]);
  });

  test("the remembering cards are exactly the surfaces the audit lists, once each", () => {
    // Phase 2b grew the list from nineteen files to forty: every tile on every
    // tab is a remembering card now (the one exception is the mood flow's
    // 2×2 grid, which is a recorder rather than a tile). Two files carry MORE
    // than one mount on purpose — `QuadrantInsightCards` draws two sibling
    // cards, and `TodayView` draws three of its own — and the rest draw one.
    //
    // The 2026-10 completion audit (`docs/collapsible-complete-audit.md`)
    // found the eight stragglers Batch 14's drawer move and Batch 6 had left
    // as plain `toolbox-item` tiles and converted them: five live inside
    // `ToolsView`'s own local components, and three are whole files that had
    // never carried a mount. The health drawer's move split that five: two
    // stayed in `ToolsView` (reflection, question) and three are
    // `HealthModules.tsx` now, which is why the toolbox's count is two and the
    // health tab — three section cards plus the two cards it mounts directly —
    // is five.
    const perFile = new Map<string, number>();
    for (const m of MOUNTS) perFile.set(m.file, (perFile.get(m.file) ?? 0) + 1);
    expect([...perFile].sort()).toEqual([
      ["src/components/AchievementsCard.tsx", 1],
      ["src/components/AllergySettingsCard.tsx", 1],
      ["src/components/AppUpdateCard.tsx", 1],
      ["src/components/AssessmentModule.tsx", 1],
      ["src/components/BackupSettingsCard.tsx", 1],
      ["src/components/BreathingExercise.tsx", 1],
      ["src/components/CbtForm.tsx", 1],
      ["src/components/CorrelationGrid.tsx", 1],
      ["src/components/CustomActivityManager.tsx", 1],
      ["src/components/CustomThemeEditor.tsx", 1],
      ["src/components/CustomTrackerManager.tsx", 1],
      ["src/components/DailyGoals.tsx", 1],
      ["src/components/EducationLibraryCard.tsx", 1],
      ["src/components/ExperimentCard.tsx", 1],
      ["src/components/FitnessCard.tsx", 1],
      ["src/components/FoodAiSettingsCard.tsx", 1],
      ["src/components/FoodPhotoCapture.tsx", 1],
      ["src/components/Gad7Card.tsx", 1],
      ["src/components/GratitudeJournal.tsx", 1],
      ["src/components/HabitStreaks.tsx", 1],
      ["src/components/HealthImportCard.tsx", 1],
      ["src/components/HealthModules.tsx", 3],
      ["src/components/InstallPrompt.tsx", 1],
      ["src/components/LagAnalysisCard.tsx", 1],
      ["src/components/MedicationTimesCard.tsx", 1],
      ["src/components/MeditationPicker.tsx", 1],
      ["src/components/MicroLessonCard.tsx", 1],
      ["src/components/MonthlyYearlyStats.tsx", 1],
      ["src/components/NutritionCard.tsx", 1],
      ["src/components/PatternInsightsCard.tsx", 1],
      ["src/components/PinLockSettings.tsx", 1],
      ["src/components/QuadrantInsightCards.tsx", 2],
      ["src/components/ReminderCard.tsx", 1],
      ["src/components/ReportExport.tsx", 1],
      // Two mounts, not one: the frame itself, plus the dynamic
      // `tracker-${head.id}` the groups expand to.
      ["src/components/TrackerInputs.tsx", 2],
      ["src/components/WeatherApiCard.tsx", 1],
      ["src/components/WeeklyReflectionCard.tsx", 1],
      ["src/components/WorkoutPrograms.tsx", 1],
      ["src/components/YearInPixels.tsx", 1],
      ["src/views/HealthView.tsx", 5],
      ["src/views/InsightsView.tsx", 3],
      ["src/views/JournalView.tsx", 2],
      ["src/views/SettingsView.tsx", 14],
      ["src/views/TodayView.tsx", 3],
      ["src/views/ToolsView.tsx", 2],
    ]);
  });

  test("the two transparency cards keep their `settings-` ids while living on the toolbox tab", () => {
    // The one id in the vocabulary whose prefix names a tab it is not on, and
    // it is deliberate: the ids are the vocabulary of the state key, so
    // renaming them to match the move would drop the state of every reader who
    // had one open. `views/ToolsView.tsx` carries the same note at the mount.
    expect(IDS).toContain("settings-nutrition-tips");
    expect(IDS).toContain("settings-sport-tips");
    // Twenty-six ids carry the prefix: the twelve rows Settings draws
    // itself, the allergy card, the eight settings cards Phase 2b made
    // collapsible (backup, pin, reminder, update, install, custom theme,
    // custom trackers, med times), the custom-ACTIVITY manager the 2026-10
    // completion converted — its twin, the tracker manager, had carried a
    // `settings-` id since Phase 1 — the two transparency cards, where the
    // last two are the ones living on the toolbox tab, and — since
    // fix/card-state-and-full-audit — the two drawers that used to be
    // session-local `Collapsible`s (settings-data, settings-voice), whose
    // whole point of joining the vocabulary is that their state now
    // survives a reload.
    expect(MOUNTS.filter((m) => m.raw.startsWith("settings-")).length).toBe(26);
  });

  test("only the cards that promise to remember use the remembering primitive", () => {
    // The session-local `Collapsible` is not a lesser version of
    // `CollapsibleCard`: it is the right primitive for a drawer a reader opens
    // to do one thing and closes again, where remembering would only make the
    // next visit start with a fling-open panel. The pin is that the two sets do
    // not silently swap places.
    const perFile = new Map<string, number>();
    for (const abs of SRC_FILES) {
      const file = abs.slice(ROOT.length).replace(/\\/g, "/");
      const hits = readFileSync(abs, "utf8")
        .split("\n")
        // `Collapsible` and not `CollapsibleCard`: the opening tag may end the
        // line, so the negative lookahead is what separates the two primitives.
        .filter((line) => /<Collapsible(?!Card)\b/.test(line)).length;
      if (hits > 0) perFile.set(file, hits);
    }
    expect([...perFile].sort()).toEqual([
      ["src/components/WorkoutPrograms.tsx", 1],
      ["src/views/InsightsView.tsx", 1],
      ["src/views/JournalView.tsx", 1],
      ["src/views/ToolsView.tsx", 1],
    ]);
  });
});

/* --------------------- where collapse state lives --------------------- */

describe("collapse state is one key, in the backup's exclusions, and cleared by the wipe", () => {
  test("it is written to one key, read back lazily, and never stored twice", () => {
    expect(setCardCollapsed("fitness-plans", true)).toEqual({ "fitness-plans": true });
    expect(JSON.parse(BACKING[CARD_STATES_KEY]!)).toEqual({ "fitness-plans": true });
    resetCardStatesForTests();
    expect(loadCardStates()).toEqual({ "fitness-plans": true });
    expect(Object.keys(BACKING)).toEqual([CARD_STATES_KEY]);
  });

  test("the backup bundle excludes it on purpose, and cannot include it by accident", () => {
    // The boundary the audit looked at first: collapse state is view state, so
    // it does not travel in an encrypted backup — a restore on another device
    // would otherwise rearrange a reader's cards from a file they copied for
    // their DATA. It is named in the exclusion list rather than merely absent,
    // which is what makes the decision reviewable.
    expect(BACKUP_EXCLUDED_KEYS as readonly string[]).toContain(CARD_STATES_KEY);
    expect(BACKUP_INCLUDED_KEYS as readonly string[]).not.toContain(CARD_STATES_KEY);
  });

  test("the production reset deletes the blob and the cache; the test seam keeps the blob", () => {
    setCardCollapsed("nutrition-log", true);
    setCardCollapsed("weather-api", false);
    expect(Object.keys(BACKING)).toEqual([CARD_STATES_KEY]);

    // The seam is a cache forget: the stored map is still there, which is what
    // makes a write → reload round trip testable.
    resetCardStatesForTests();
    expect(BACKING[CARD_STATES_KEY]).toBeDefined();
    expect(loadCardStates()).toEqual({ "nutrition-log": true, "weather-api": false });

    // The production reset is the wipe's: nothing left in storage, and the
    // next read rebuilds an empty map rather than resurrecting the cache.
    resetCardStates();
    expect(BACKING[CARD_STATES_KEY]).toBeUndefined();
    expect(loadCardStates()).toEqual({});
    setCardCollapsed("nutrition-log", true);
    expect(JSON.parse(BACKING[CARD_STATES_KEY]!)).toEqual({ "nutrition-log": true });
  });
});

/* ----------------------- the delete-all chain ----------------------- */

/**
 * Exported resets that are NOT the wipe's business, each with the reason.
 *
 * Kept as a list rather than a pattern because the point of the guard is that
 * every new one is a decision somebody writes down.
 */
const NOT_DATA = new Set([
  // A session cache of which font files the browser has registered. Nothing is
  // stored; the reader's chosen family lives in settings, which `resetAll`
  // empties, and the next render re-registers whatever that setting now names.
  "resetFontCache",
  // A url BUILDER, and it stores nothing at all: `resetUrl` returns the address
  // the stuck-worker button navigates to (`/?nocache=<stamp>`) so that no cache
  // can answer the request from storage. The name is the honest description of
  // what the address is for, and the key that reset DOES write
  // (`belso-iranytu-force-reset`) is in `WIPE_KEYS`, which is the list this guard
  // is really about.
  "resetUrl",
]);

/**
 * The second call site a reset may live in, and it is the same wipe.
 *
 * Phase 5's rule was "the chain calls it", because the chain was the only place
 * a reset ran. Phase 6 added `RESET_FUNCTIONS` to the key registry for the
 * modules that read their record into memory at import, and `wipeAppStorage` —
 * which the chain calls before it returns — is what runs them. Both places are
 * on the wipe path, so the rule below accepts either; what it does not accept is
 * a reset nobody calls. The names are taken off the functions themselves rather
 * than from a second list of strings, so the guard cannot pass against a list
 * that has drifted from what the wipe runs.
 */
const REGISTRY_RESETS = new Set<string>(RESET_FUNCTIONS.map((fn) => fn.name));

const CHAIN_START = 'onConfirm={() => {';

function wipeChain(): string {
  const source = readFileSync(join(ROOT, "src/views/SettingsView.tsx"), "utf8");
  const start = source.indexOf(CHAIN_START);
  expect(start, "the delete-all handler must exist in SettingsView").toBeGreaterThan(0);
  const end = source.indexOf('notify(t("settings.data.resetDone"))', start);
  expect(end, "the handler must end at its confirmation toast").toBeGreaterThan(start);
  return source.slice(start, end);
}

/** Every `export function reset…` in `src/lib`, minus the test seams. */
function exportedResets(): Map<string, string> {
  const out = new Map<string, string>();
  for (const abs of walk(join(ROOT, "src/lib"), /\.tsx?$/)) {
    const file = abs.slice(ROOT.length).replace(/\\/g, "/");
    const text = readFileSync(abs, "utf8");
    for (const m of text.matchAll(/^export function (reset\w+|clearAssessments)/gm)) {
      const name = m[1]!;
      if (name.endsWith("ForTests")) continue;
      out.set(name, file);
    }
  }
  return out;
}

describe("Minden adat törlése really means every record", () => {
  test("the guard can see the chain, and the resets it scans", () => {
    // Self-check: an empty corpus or a mis-sliced handler would make every
    // assertion below vacuously true, which is the failure mode a source-level
    // guard has to prove it does not have.
    expect(wipeChain()).toContain("resetAll()");
    const resets = exportedResets();
    expect(resets.size).toBeGreaterThan(8);
    expect(resets.get("resetNutrition")).toBe("src/lib/nutrition.ts");
    expect(resets.has("resetForTests")).toBe(false);
    // The registry's names are compared as strings below, so two entries sharing
    // one would let the other hide behind it — and every name has to be a real
    // lib reset, or the wipe would be calling into nothing.
    expect(REGISTRY_RESETS.size).toBe(RESET_FUNCTIONS.length);
    for (const name of REGISTRY_RESETS) {
      expect(resets.has(name), `${name} is in RESET_FUNCTIONS but is not a lib reset`).toBe(true);
    }
  });

  test("every data record's reset is called, and the exemptions are named", () => {
    const chain = wipeChain();
    // The registry half is only reached because the chain calls the wipe that
    // runs it, so the rule below must not be satisfiable by a list nothing calls.
    expect(chain).toContain("wipeAppStorage()");
    const missing = [...exportedResets()]
      .filter(([name]) => !NOT_DATA.has(name))
      .filter(([name]) => !chain.includes(`${name}(`) && !REGISTRY_RESETS.has(name))
      .map(([name, file]) => `${name} (${file})`);
    expect(
      missing,
      "a module that owns a stored record exports a reset, and the wipe must call it — from the " +
        "chain in views/SettingsView.tsx, or from RESET_FUNCTIONS in src/lib/storageKeys.ts — or " +
        "the name must be added to NOT_DATA in this file with a reason",
    ).toEqual([]);
  });

  test("the registry's resets are the modules that hold their record in memory", () => {
    // Named as well as derived: the rule above says every reset has a call site,
    // this one says which records Phase 6's memory half is responsible for, so a
    // future commit that empties a module's memory without resetting it has to
    // answer to a test rather than to a docblock.
    expect([...REGISTRY_RESETS].sort()).toEqual([
      "clearAssessments",
      "resetCardStates",
      "resetCbtRecords",
      "resetCustomActivities",
      "resetCustomTrackers",
      "resetGratitude",
      "resetHabits",
      "resetReminderMessage",
      "resetSeenBadges",
      "resetSeenLessons",
      "resetWeeklyAnswers",
      "resetWeeklySkips",
    ]);
  });

  test("the seven the audit found are called, by name", () => {
    // Named individually as well as by the rule above: the rule closes the
    // class, this test says which commit closed this instance of it.
    const chain = wipeChain();
    for (const name of [
      "resetNutrition",
      "resetCustomFoods",
      "resetDiet",
      "resetFitness",
      "resetExperiments",
      "resetEventFeatures",
    ]) {
      expect(chain, name).toContain(`${name}(`);
    }
  });
});
