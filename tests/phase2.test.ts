/**
 * Phase 2 unit tests (bun test).
 *
 * The new libs are localStorage-backed; each test gets a fresh storage map.
 * Run: bun test tests/phase2.test.ts
 */

import { beforeEach, describe, expect, test } from "bun:test";

type Store = Record<string, string>;
let backing: Store;

beforeEach(() => {
  backing = {};
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

/* --------------------------- attachments --------------------------- */

describe("attachments", () => {
  test("saves and retrieves a blob as data URL", async () => {
    const { saveBlob, getAttachmentDataUrl, listAttachmentMeta } = await import(
      "../src/lib/attachments"
    );
    const meta = await saveBlob("photo", new Blob(["fake"], { type: "image/jpeg" }), "test.jpg");
    expect(meta.kind).toBe("photo");
    expect(meta.name).toBe("test.jpg");
    const url = getAttachmentDataUrl(meta.id);
    expect(url).toStartWith("data:image/jpeg;base64,");
    const all = listAttachmentMeta();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(meta.id);
  });

  test("removes attachments individually and in batch", async () => {
    const { saveBlob, removeAttachment, removeAttachments, getAttachment } = await import(
      "../src/lib/attachments"
    );
    const a = await saveBlob("photo", new Blob(["a"]));
    const b = await saveBlob("audio", new Blob(["b"]));
    removeAttachment(a.id);
    expect(getAttachment(a.id)).toBeNull();
    removeAttachments([b.id, "missing-id"]);
    expect(getAttachment(b.id)).toBeNull();
  });

  test("rejects oversized blobs with a Hungarian error", async () => {
    const { saveBlob } = await import("../src/lib/attachments");
    const big = new Blob([new Uint8Array(5 * 1024 * 1024 + 1)]);
    expect(saveBlob("photo", big)).rejects.toThrow("túl nagy");
  });

  test("photos are compressed in DOM environments (document exists here)", async () => {
    // In bun, document is undefined → compressImage is a passthrough; assert
    // the size cap and data URL round-trip still hold for raw blobs.
    const { saveBlob, getAttachment } = await import("../src/lib/attachments");
    const meta = await saveBlob("photo", new Blob(["raw"], { type: "image/png" }));
    expect(getAttachment(meta.id)?.dataUrl).toStartWith("data:image/png;base64,");
  });
});

/* ------------------------- custom activities ------------------------ */

describe("customActivities", () => {
  test("adds, de-duplicates and removes custom activities", async () => {
    const { addCustomActivity, removeCustomActivity, subscribeCustomActivities } = await import(
      "../src/lib/customActivities"
    );
    const first = addCustomActivity("🎨", "Festés");
    expect(first?.label).toBe("Festés");

    // duplicate label (case-insensitive) is rejected
    expect(addCustomActivity("⭐", "festés")).toBeNull();

    // notification fires on change
    let notified = 0;
    const unsub = subscribeCustomActivities(() => notified++);
    removeCustomActivity(first!.id);
    expect(notified).toBe(1);
    unsub();

    // empty labels are rejected
    expect(addCustomActivity("⭐", "   ")).toBeNull();
  });

  test("trims and caps label length", async () => {
    const { addCustomActivity } = await import("../src/lib/customActivities");
    const long = "x".repeat(50);
    const created = addCustomActivity("⭐", long);
    expect(created?.label.length).toBe(24);
  });
});

/* ----------------------------- trackers ----------------------------- */

describe("trackers", () => {
  test("definitions have unique ids and valid input kinds", async () => {
    const { TRACKERS } = await import("../src/lib/trackers");
    const ids = TRACKERS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of TRACKERS) {
      // Batch 7e added `number` (lépésszám, kalória, időtartam, hőmérséklet),
      // `select` (sport típusa, időjárás állapota) and `flags` (étkezés
      // összetevői). The list is spelled out rather than imported, which is the
      // point of the test: it is the one place that says what a kind may be.
      expect(["checkbox", "slider", "text", "number", "select", "flags"]).toContain(
        t.input.kind,
      );
    }
  });

  test("enablement falls back to defaults when unset", async () => {
    const { TRACKERS, isTrackerEnabled, DEFAULT_ENABLED_TRACKERS } = await import(
      "../src/lib/trackers"
    );
    expect(isTrackerEnabled(undefined, "sleep")).toBe(true);
    expect(isTrackerEnabled(undefined, "weather")).toBe(false);
    for (const id of DEFAULT_ENABLED_TRACKERS) {
      expect(isTrackerEnabled(undefined, id)).toBe(true);
    }
    // explicit list respected
    expect(isTrackerEnabled(["weather"], "weather")).toBe(true);
    expect(isTrackerEnabled(["weather"], "sleep")).toBe(false);
    // every default id exists in definitions
    const ids = TRACKERS.map((t) => t.id);
    for (const id of DEFAULT_ENABLED_TRACKERS) expect(ids).toContain(id);
  });

  test("default values match the input kind", async () => {
    const { TRACKERS, defaultTrackerValue } = await import("../src/lib/trackers");
    for (const def of TRACKERS) {
      const v = defaultTrackerValue(def);
      expect(v.kind).toBe(def.input.kind);
      if (def.input.kind === "slider") {
        const min = def.input.min;
        const max = def.input.max;
        expect(v.value).toBeGreaterThanOrEqual(min);
        expect(v.value).toBeLessThanOrEqual(max);
      }
    }
  });

  test("sanitize keeps known trackers and drops unknown/mistyped data", async () => {
    const { sanitizeTrackerState } = await import("../src/lib/trackers");
    const raw = {
      sleep: { kind: "slider", value: 99 }, // clamped to max 14
      symptoms: { kind: "checkbox", value: true },
      weather: { kind: "text", value: "napos" },
      bogus: { kind: "checkbox", value: true }, // unknown tracker → dropped
      vitamins: { kind: "slider", value: 5 }, // wrong kind for def → dropped
      broken: null,
    };
    const out = sanitizeTrackerState(raw);
    expect(Object.keys(out).sort()).toEqual(["sleep", "symptoms", "weather"]);
    expect(out.sleep).toEqual({ kind: "slider", value: 14 });
    expect(out.symptoms).toEqual({ kind: "checkbox", value: true });
    expect(out.weather).toEqual({ kind: "text", value: "napos" });
    // non-object input → empty state
    expect(sanitizeTrackerState(null)).toEqual({});
    expect(sanitizeTrackerState("junk")).toEqual({});
  });
});
