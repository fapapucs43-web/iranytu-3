/**
 * Batch 2 unit tests (bun test).
 * Custom trackers · month/year aggregations · badge rules ·
 * correlation grid math · PWA/SW contract rules.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { buildFeatureUse } from "../src/lib/featureUse";

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
});

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function mkEntry(over: Partial<import("../src/types").Entry> & { date: string }): import("../src/types").Entry {
  return {
    id: over.date,
    mood: 3,
    stress: 5,
    energy: 5,
    note: "",
    tags: [],
    emotions: [],
    activities: [],
    reflection: { feeling: "", stressReason: "", need: "" },
    vitals: { restingHr: null, hrv: null, sleepHours: null },
    source: "manual",
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

/* --------------------------- custom trackers --------------------------- */

describe("customTrackers", () => {
  test("add: trims label, dedups case-insensitive, clamps slider range", async () => {
    const { addCustomTracker, getCustomTrackers } = await import("../src/lib/customTrackers");
    const def = addCustomTracker({ icon: "💧", label: "  Víz mennyiség  ", kind: "slider", min: 50, max: 5 });
    expect(def).not.toBeNull();
    expect(def!.label).toBe("Víz mennyiség");
    // lo >= hi falls back to the 1–10 default
    expect(def!.min).toBe(1);
    expect(def!.max).toBe(10);
    // same label, different case → rejected
    expect(addCustomTracker({ icon: "💧", label: "víz MENNYISÉG", kind: "slider" })).toBeNull();
    expect(getCustomTrackers()).toHaveLength(1);
  });

  test("sanitizeCustomTrackerValue: clamps sliders, accepts checkbox/text, rejects junk", async () => {
    const { addCustomTracker, sanitizeCustomTrackerValue } = await import("../src/lib/customTrackers");
    const slider = addCustomTracker({ icon: "💊", label: "Adag", kind: "slider", min: 1, max: 10 })!;
    expect(sanitizeCustomTrackerValue(slider, { kind: "slider", value: 99 })).toEqual({ kind: "slider", value: 10 });
    expect(sanitizeCustomTrackerValue(slider, { kind: "slider", value: 0.4 })).toEqual({ kind: "slider", value: 1 });
    const check = addCustomTracker({ icon: "✅", label: "Szedtem", kind: "checkbox" })!;
    expect(sanitizeCustomTrackerValue(check, { kind: "checkbox", value: true })).toEqual({ kind: "checkbox", value: true });
    const text = addCustomTracker({ icon: "📝", label: "Megjegyzés", kind: "text" })!;
    expect(sanitizeCustomTrackerValue(text, { kind: "text", value: "x".repeat(500) }).value).toHaveLength(200);
    expect(sanitizeCustomTrackerValue(slider, { kind: "checkbox", value: true })).toBeNull();
    expect(sanitizeCustomTrackerValue(slider, "junk")).toBeNull();
  });
});

/* ------------------------------ statsAgg ------------------------------- */

describe("statsAgg", () => {
  const entries = [
    mkEntry({ date: "2026-09-01", mood: 5, stress: 8, energy: 3 }),
    mkEntry({ date: "2026-09-02", mood: 1, stress: 2, energy: 9 }),
    mkEntry({ date: "2026-09-03", mood: 3, stress: 5, energy: 5 }),
    mkEntry({ date: "2025-06-15", mood: 4, stress: 3, energy: 7 }),
  ];

  test("monthStat: averages, best/worst day, empty months are null-safe", async () => {
    const { monthStat } = await import("../src/lib/statsAgg");
    const s = monthStat(entries, "2026-09");
    // mood scores: 95 + 10 + 50 → avg 51.67 → 52
    expect(s.avgMood).toBe(52);
    expect(s.daysLogged).toBe(3);
    expect(s.avgStress).toBe(5);
    expect(s.avgEnergy).toBeCloseTo(5.7, 1);
    expect(s.bestDay).toEqual({ date: "2026-09-01", mood: 95 });
    expect(s.worstDay).toEqual({ date: "2026-09-02", mood: 10 });
    const empty = monthStat(entries, "2026-01");
    expect(empty.avgMood).toBeNull();
    expect(empty.daysLogged).toBe(0);
    expect(empty.bestDay).toBeNull();
  });

  test("yearStat + availableMonths/availableYears: keys, ordering, current period", async () => {
    const { yearStat, availableMonths, availableYears } = await import("../src/lib/statsAgg");
    const y = yearStat(entries, "2026");
    expect(y.daysLogged).toBe(3);
    expect(y.label).toBe("2026");
    const months = availableMonths(entries);
    expect(months[0]).toBe(new Date().toISOString().slice(0, 7)); // newest first
    expect(months).toContain("2026-09");
    expect(months).toContain("2025-06");
    const years = availableYears(entries);
    expect(years[0]).toBe(String(new Date().getFullYear()));
    expect(years).toContain("2025");
  });
});

/* ----------------------------- achievements ---------------------------- */

describe("achievements", () => {
  // Since Batch 13 commit 8 the per-feature counts are not fields of their own
  // but keys in the `featureUse` sidecar, which is why these call sites pass a
  // built map rather than `gratitudeCount` / `cbtCount`.
  const use = (over: Record<string, number> = {}) => buildFeatureUse(over);

  test("streak and entry-count thresholds (3/7, 10)", async () => {
    const { earnedBadgeIds } = await import("../src/lib/achievements");
    const threeDays = [0, 1, 2].map((n) => mkEntry({ date: isoDaysAgo(n) }));
    const earned3 = earnedBadgeIds({ entries: threeDays, maxHabitStreak: 0, featureUse: use() });
    expect(earned3.has("streak-3")).toBe(true);
    expect(earned3.has("streak-7")).toBe(false);
    expect(earned3.has("entries-10")).toBe(false);
    const sevenDays = [0, 1, 2, 3, 4, 5, 6].map((n) => mkEntry({ date: isoDaysAgo(n) }));
    const earned7 = earnedBadgeIds({ entries: sevenDays, maxHabitStreak: 0, featureUse: use() });
    expect(earned7.has("streak-7")).toBe(true);
    expect(earned7.has("streak-14")).toBe(false);
    const ten = [...sevenDays, ...[7, 8, 9].map((n) => mkEntry({ date: isoDaysAgo(n) }))];
    const earned10 = earnedBadgeIds({ entries: ten, maxHabitStreak: 0, featureUse: use() });
    expect(earned10.has("entries-10")).toBe(true);
    expect(earned10.has("entries-50")).toBe(false);
  });

  test("first photo/video, gratitude, CBT and habit badges", async () => {
    const { earnedBadgeIds } = await import("../src/lib/achievements");
    const base = { maxHabitStreak: 0, featureUse: use() };
    const none = earnedBadgeIds({ entries: [mkEntry({ date: isoDaysAgo(0) })], ...base });
    expect(none.has("first-photo")).toBe(false);
    expect(none.has("first-video")).toBe(false);
    const withPhoto = earnedBadgeIds({
      entries: [mkEntry({ date: isoDaysAgo(0), attachments: [{ id: "a1", kind: "photo", createdAt: 1 }] })],
      ...base,
    });
    expect(withPhoto.has("first-photo")).toBe(true);
    const withVideo = earnedBadgeIds({
      entries: [mkEntry({ date: isoDaysAgo(0), attachments: [{ id: "v1", kind: "video", createdAt: 1 }] })],
      ...base,
    });
    expect(withVideo.has("first-video")).toBe(true);
    const tools = earnedBadgeIds({
      entries: [],
      maxHabitStreak: 7,
      featureUse: use({ gratitude: 5, cbt: 6 }),
    });
    expect(tools.has("gratitude-5")).toBe(true);
    expect(tools.has("cbt-5")).toBe(true);
    expect(tools.has("habit-7")).toBe(true);
    const notYet = earnedBadgeIds({
      entries: [],
      maxHabitStreak: 6,
      featureUse: use({ gratitude: 4, cbt: 4 }),
    });
    expect(notYet.has("gratitude-5")).toBe(false);
    expect(notYet.has("cbt-5")).toBe(false);
    expect(notYet.has("habit-7")).toBe(false);
  });

  test("seen flags round-trip through their own storage key", async () => {
    const { markBadgesSeen, getSeenBadgeIds, resetSeenBadges } = await import("../src/lib/achievements");
    expect(getSeenBadgeIds().size).toBe(0);
    markBadgesSeen(["streak-3"]);
    markBadgesSeen(["streak-3", "first-photo"]);
    expect(getSeenBadgeIds().has("streak-3")).toBe(true);
    expect(getSeenBadgeIds().has("first-photo")).toBe(true);
    expect(Object.keys(backing).some((k) => k.startsWith("belso-iranytu-achievements"))).toBe(true);
    resetSeenBadges();
    expect(getSeenBadgeIds().size).toBe(0);
  });
});

/* --------------------------- correlation grid --------------------------- */

describe("correlationGrid", () => {
  test("delta vs baseline, sample guard, custom numeric outcome column", async () => {
    const { buildCorrelationGrid } = await import("../src/lib/correlationGrid");
    const customId = "c1";
    const withAct = (over: Partial<import("../src/types").Entry> & { date: string }) =>
      mkEntry({ ...over, activities: ["🚶 Mozgás"] });
    const entries = [
      withAct({ date: "2026-09-01", mood: 5, stress: 2, energy: 9, trackerValues: { [customId]: { kind: "slider", value: 8 } } }),
      withAct({ date: "2026-09-02", mood: 4, stress: 3, energy: 8, trackerValues: { [customId]: { kind: "slider", value: 6 } } }),
      mkEntry({ date: "2026-09-03", mood: 1, stress: 9, energy: 2 }),
      mkEntry({ date: "2026-09-04", mood: 2, stress: 8, energy: 3 }),
    ];
    const grid = buildCorrelationGrid({
      entries,
      customNumericTrackers: [{ id: customId, icon: "💊", label: "Adag" }],
      customActivities: [],
    });
    const row = grid.rows.find((r) => r.label === "🚶 Mozgás")!;
    expect(row).toBeDefined();
    const mood = grid.outcomes.find((o) => o.id === "mood")!;
    const stress = grid.outcomes.find((o) => o.id === "stress")!;
    const custom = grid.outcomes.find((o) => o.id === `custom:${customId}`)!;
    // active moods 95,75 → 85; baseline 10,30 → 20 → +65
    expect(row.cells["mood"].delta).toBe(65);
    expect(row.cells["mood"].count).toBe(2);
    // stress active 2.5, baseline 8.5 → −6
    expect(row.cells["stress"].delta).toBe(-6);
    // custom: active 7, baseline has no values → null
    expect(row.cells[`custom:${customId}`].delta).toBeNull();
    expect(row.cells[`custom:${customId}`].count).toBe(2);
    expect(custom.label).toBe("Adag");
    // one occurrence only → sample guard kicks in
    const tiny = buildCorrelationGrid({
      entries: [withAct({ date: "2026-09-01", mood: 5 }), mkEntry({ date: "2026-09-02", mood: 1 })],
      customNumericTrackers: [],
      customActivities: [],
    });
    expect(tiny.rows[0].cells["mood"].delta).toBeNull();
  });

  test("custom activity rows are matched by their full tag label", async () => {
    const { buildCorrelationGrid } = await import("../src/lib/correlationGrid");
    const entries = [
      mkEntry({ date: "2026-09-01", mood: 5, activities: ["🎸 Gitározás"] }),
      mkEntry({ date: "2026-09-02", mood: 4, activities: ["🎸 Gitározás"] }),
      mkEntry({ date: "2026-09-03", mood: 2 }),
      mkEntry({ date: "2026-09-04", mood: 3 }),
    ];
    const grid = buildCorrelationGrid({
      entries,
      customNumericTrackers: [],
      customActivities: [{ icon: "🎸", label: "Gitározás" }],
    });
    const row = grid.rows.find((r) => r.label === "🎸 Gitározás");
    expect(row).toBeDefined();
    expect(row!.isCustom).toBe(true);
    // active 95,75 → 85; baseline 30,50 → 40 → +45
    expect(row!.cells["mood"].delta).toBe(45);
  });

  test("cellTone respects 'higher is better' per outcome", async () => {
    const { cellTone, BUILT_IN_OUTCOMES } = await import("../src/lib/correlationGrid");
    const mood = BUILT_IN_OUTCOMES.find((o) => o.id === "mood")!;
    const stress = BUILT_IN_OUTCOMES.find((o) => o.id === "stress")!;
    expect(cellTone({ delta: 5, count: 2 }, mood)).toBe("up");
    expect(cellTone({ delta: -5, count: 2 }, mood)).toBe("down");
    expect(cellTone({ delta: -3, count: 2 }, stress)).toBe("up"); // less stress = good
    expect(cellTone({ delta: 3, count: 2 }, stress)).toBe("down");
    expect(cellTone({ delta: 0.2, count: 2 }, mood)).toBe("flat");
    expect(cellTone({ delta: null, count: 0 }, mood)).toBe("none");
  });
});

/* ---------------------------- PWA/SW contract --------------------------- */

describe("pwa/sw contract", () => {
  test("sw.js: versioned cache from query param, network-first HTML, old-cache cleanup, skipWaiting", async () => {
    const sw = readFileSync("public/sw.js", "utf8");
    expect(sw).toContain('new URLSearchParams(self.location.search).get("v")');
    expect(sw).toContain("`belso-iranytu-${VERSION}`");
    expect(sw).toContain('req.mode === "navigate"'); // network-first for HTML
    expect(sw).toContain("caches.delete(n)"); // old versioned caches removed
    expect(sw).toContain("self.skipWaiting()");
    expect(sw).toContain("self.clients.claim()");
    // cache-first only for immutable hashed assets
    expect(sw).toContain('"/assets/"');
  });

  test("pwa.ts + manifest: PROD-only registration, standalone display, shortcut, icons on disk", async () => {
    const pwa = readFileSync("src/lib/pwa.ts", "utf8");
    expect(pwa).toContain("import.meta.env.PROD");
    const manifest = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8"));
    expect(manifest.display).toBe("standalone");
    expect(manifest.theme_color).toBe("#0d5c4d");
    // The widget batch renamed the first shortcut to "Mai hangulat" (the name
    // `docs/ios-widget-guide.md` tells readers to look for) and grew the array
    // to four; `tests/lib/quick-start.test.ts` pins the other three and every
    // url's destination, this pins the name and the display field beside it.
    expect(manifest.shortcuts[0].name).toBe("Mai hangulat");
    // RELATIVE, and the reason the install prompt works on GitHub Pages at
    // all: the app is served from a SUBPATH (/iranytu-3/), and a manifest
    // full of root-absolute URLs ("/icons/…", start_url "/") resolves them
    // against the origin — where they 404, taking Chrome's installability
    // (fetchable 192+ icons, a start_url inside the scope) with them. A
    // relative manifest URL resolves against the MANIFEST's own location, so
    // "./" is correct both at the root in dev and under any base in prod.
    expect(manifest.start_url).toBe("./");
    const iconNames = manifest.icons.map((i: { src: string }) => i.src);
    expect(iconNames).toContain("./icons/icon-192.png");
    expect(iconNames).toContain("./icons/icon-512.png");
    expect(iconNames).toContain("./icons/icon.svg");
    // committed icon files actually exist (the "./" stripped: the paths are
    // relative to the manifest, while the disk is relative to the repo)
    for (const src of iconNames) {
      readFileSync(`public/${src.replace(/^\.\//, "")}`);
    }
    readFileSync("public/icons/icon.svg");
  });

  test("pwa.ts: an update cannot be answered out of the browser's HTTP cache", async () => {
    // The reported failure — a deployed app a browser kept serving the old
    // copy of — stated as the three properties that fix it. None of the three
    // can be reached from `bun test`: the whole function sits behind Vite's
    // build-time PROD flag, so what is pinned here is the SOURCE, the same
    // treatment the PROD guard itself gets above.
    const pwa = readFileSync("src/lib/pwa.ts", "utf8");
    // The worker script is kept out of the HTTP cache, so the update check
    // reaches the network rather than a copy `sw.js` the browser kept a day.
    expect(pwa).toContain('updateViaCache: "none"');
    // …and the check is ASKED FOR on every open, instead of waiting for the
    // browser's own navigation-triggered, 24-hour-throttled one.
    expect(pwa).toContain("registration.update()");
    // A worker that takes over an open page still leaves the OLD bundle
    // running in it, so the last mile is a reload of that page…
    expect(pwa).toContain('addEventListener("controllerchange"');
    // …deferred until the reader is not looking, and performed at most once.
    expect(pwa).toContain("visibilitychange");
    expect(pwa).toContain("reloadedForUpdate");
  });
});
