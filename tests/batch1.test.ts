/**
 * Batch 1 unit tests (bun test).
 * Reminder daemon gate · custom theme validation · gratitude store ·
 * nutrition tracker def · video attachments.
 */
import { beforeEach, describe, expect, test } from "bun:test";

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

/* --------------------------- reminder daemon --------------------------- */

describe("reminderDaemon", () => {
  test("decideFire: fires when enabled, past time, permission granted, not fired today", async () => {
    const { decideFire } = await import("../src/lib/reminderDaemon");
    const now = new Date("2026-09-27T21:00:00");
    const d = decideFire({ enabled: true, time: "20:00", message: "m" }, now, "granted", null);
    expect(d).toEqual({ action: "fire" });
  });

  test("decideFire: skips when already fired today (even if re-checked)", async () => {
    const { decideFire } = await import("../src/lib/reminderDaemon");
    const now = new Date("2026-09-27T21:00:00");
    const d = decideFire(
      { enabled: true, time: "20:00", message: "m" },
      now,
      "granted",
      "2026-09-27",
    );
    expect(d).toEqual({ action: "skip", reason: "already-fired" });
  });

  test("decideFire: skips without permission, before the time, or when disabled", async () => {
    const { decideFire } = await import("../src/lib/reminderDaemon");
    const evening = new Date("2026-09-27T21:00:00");
    expect(decideFire({ enabled: true, time: "20:00", message: "m" }, evening, "default", null)).toEqual({
      action: "skip",
      reason: "no-permission",
    });
    expect(decideFire({ enabled: true, time: "20:00", message: "m" }, new Date("2026-09-27T10:00:00"), "granted", null)).toEqual({
      action: "skip",
      reason: "too-early",
    });
    expect(decideFire({ enabled: false, time: "20:00", message: "m" }, evening, "granted", null)).toEqual({
      action: "skip",
      reason: "disabled",
    });
  });

  test("last-fired round-trips through storage and validates format", async () => {
    const { loadLastFired, saveLastFired } = await import("../src/lib/reminderDaemon");
    expect(loadLastFired()).toBeNull();
    saveLastFired("2026-09-27");
    expect(loadLastFired()).toBe("2026-09-27");
    backing["belso-iranytu-reminder-last"] = "garbage";
    expect(loadLastFired()).toBeNull(); // invalid format ignored
  });
});

/* ---------------------------- custom theme ----------------------------- */

describe("customTheme", () => {
  test("validates and normalizes hex colors", async () => {
    const { isValidHex, normalizeHex, CUSTOM_TOKEN_KEYS } = await import("../src/lib/customTheme");
    expect(isValidHex("#0d5c4d")).toBe(true);
    expect(isValidHex("#abc")).toBe(true);
    expect(isValidHex("red")).toBe(false);
    expect(isValidHex("#12345")).toBe(false);
    expect(normalizeHex("#ABC")).toBe("#aabbcc");
    expect(normalizeHex("#0D5C4D")).toBe("#0d5c4d");
    expect(normalizeHex("nope")).toBeNull();
    // 13 tokens grouped; keys unique
    expect(CUSTOM_TOKEN_KEYS).toHaveLength(13);
    expect(new Set(CUSTOM_TOKEN_KEYS).size).toBe(13);
  });
});

/* ------------------------------ gratitude ------------------------------ */

describe("gratitude", () => {
  test("adds once per day, deletes, and persists", async () => {
    const { addGratitude, getGratitudeEntries, getGratitudeForDate, deleteGratitude } = await import(
      "../src/lib/gratitude"
    );
    const created = addGratitude("  Kávé a napsütésben  ", "2026-09-27");
    expect(created?.text).toBe("Kávé a napsütésben");
    expect(getGratitudeForDate("2026-09-27")).not.toBeNull();
    expect(addGratitude("második a mai napra", "2026-09-27")).toBeNull(); // per-day limit
    expect(addGratitude("   ", "2026-09-26")).toBeNull(); // empty rejected
    expect(getGratitudeEntries()).toHaveLength(1);
    deleteGratitude(created!.id);
    expect(getGratitudeEntries()).toHaveLength(0);
  });

  test("sanitizer drops invalid rows; import de-duplicates", async () => {
    const { importGratitude, getGratitudeEntries } = await import("../src/lib/gratitude");
    expect(importGratitude([{ text: "első", date: "2026-09-01" }, null, { text: "" }, "junk"])).toBe(1);
    expect(importGratitude([{ text: "első", date: "2026-09-01" }])).toBe(0); // duplicate
    expect(getGratitudeEntries()).toHaveLength(1);
  });
});

/* ------------------------- nutrition tracker def ------------------------ */

describe("nutrition tracker", () => {
  test("is defined as a 1–10 slider and passes sanitizer round-trip", async () => {
    const { TRACKERS, defaultTrackerValue, sanitizeTrackerState } = await import(
      "../src/lib/trackers"
    );
    const def = TRACKERS.find((t) => t.id === "nutrition");
    expect(def).toBeDefined();
    expect(def!.input.kind).toBe("slider");
    if (def!.input.kind === "slider") {
      expect(def!.input.min).toBe(1);
      expect(def!.input.max).toBe(10);
    }
    // not enabled by default (opt-in)
    const { DEFAULT_ENABLED_TRACKERS } = await import("../src/lib/trackers");
    expect(DEFAULT_ENABLED_TRACKERS).not.toContain("nutrition");
    // values sanitize within range
    const out = sanitizeTrackerState({ nutrition: { kind: "slider", value: 99 } });
    expect(out.nutrition).toEqual({ kind: "slider", value: 10 });
    const dv = defaultTrackerValue(def!);
    expect(dv.kind).toBe("slider");
  });
});

/* --------------------------- video attachments -------------------------- */

describe("video attachments", () => {
  test("saves a small video blob and reads it back as video data URL", async () => {
    const { saveBlob, getAttachmentDataUrl } = await import("../src/lib/attachments");
    const meta = await saveBlob("video", new Blob(["vid"], { type: "video/webm" }), "klip.webm");
    expect(meta.kind).toBe("video");
    expect(getAttachmentDataUrl(meta.id)).toStartWith("data:video/webm;base64,");
  });

  test("rejects oversized video with the Hungarian size error", async () => {
    const { saveBlob } = await import("../src/lib/attachments");
    const big = new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: "video/mp4" });
    expect(saveBlob("video", big)).rejects.toThrow("túl nagy");
  });
});
