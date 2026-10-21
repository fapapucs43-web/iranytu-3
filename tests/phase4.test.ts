/**
 * Phase 4 unit tests: onboarding state + reminder scheduling logic.
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

describe("onboarding", () => {
  test("defaults to not completed with sensible tracker picks", async () => {
    const { loadOnboarding, needsOnboarding } = await import("../src/lib/onboarding");
    const s = loadOnboarding();
    expect(s.completed).toBe(false);
    expect(needsOnboarding()).toBe(true);
    expect(s.trackers.length).toBeGreaterThan(0);
    expect(s.theme).toBe("light");
  });

  test("completing persists and flips needsOnboarding", async () => {
    const { loadOnboarding, completeOnboarding, needsOnboarding } = await import(
      "../src/lib/onboarding"
    );
    const s = loadOnboarding();
    completeOnboarding({ ...s, trackers: ["weather"], theme: "warm" });
    expect(needsOnboarding()).toBe(false);
    const reloaded = loadOnboarding();
    expect(reloaded.completed).toBe(true);
    expect(reloaded.theme).toBe("warm");
    expect(reloaded.trackers).toEqual(["weather"]);
  });

  test("corrupted storage falls back to defaults", async () => {
    backing["belso-iranytu-onboarding"] = "{not json";
    const { loadOnboarding } = await import("../src/lib/onboarding");
    expect(loadOnboarding().completed).toBe(false);
  });

  test("invalid theme value is normalized to light", async () => {
    backing["belso-iranytu-onboarding"] = JSON.stringify({
      completed: false,
      trackers: ["sleep"],
      theme: "neon",
    });
    const { loadOnboarding } = await import("../src/lib/onboarding");
    expect(loadOnboarding().theme).toBe("light");
  });
});

describe("notifications", () => {
  test("msUntilNext returns positive delay for later today", async () => {
    const { msUntilNext } = await import("../src/lib/notifications");
    const now = new Date("2026-09-27T10:00:00");
    expect(msUntilNext("20:00", now)).toBe(10 * 3_600_000);
  });

  test("rolls to tomorrow when the time already passed, with 60s floor", async () => {
    const { msUntilNext } = await import("../src/lib/notifications");
    const now = new Date("2026-09-27T22:00:00");
    const ms = msUntilNext("20:00", now);
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(26 * 3_600_000);
    // floor: never schedules sooner than a minute
    expect(msUntilNext("22:00", now)).toBeGreaterThanOrEqual(60_000);
  });

  test("shouldFireToday respects enabled flag, date and time gate", async () => {
    const { shouldFireToday } = await import("../src/lib/notifications");
    const now = new Date("2026-09-27T21:00:00");
    const plan = { enabled: true, time: "20:00", message: "m" };
    expect(shouldFireToday(plan, undefined, now)).toBe(true);
    expect(shouldFireToday(plan, "2026-09-27", now)).toBe(false); // already fired
    expect(shouldFireToday({ ...plan, enabled: false }, undefined, now)).toBe(false);
    // before the scheduled time → no
    expect(shouldFireToday(plan, undefined, new Date("2026-09-27T10:00:00"))).toBe(false);
  });
});
