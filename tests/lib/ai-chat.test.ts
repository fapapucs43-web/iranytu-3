/**
 * Phase 2 (AI depth) — the model sizes, the question path ("Kérdezz a
 * hetedről") and the crisis gate that stands in front of BOTH calls.
 *
 * WHY THIS FILE NEVER LOADS A MODEL
 * Everything asserted here happens BEFORE the engine: the gates are ordered
 * promises (off → facts → crisis → key → transport), the transport is
 * injectable, and the sizes are data. The one call that would reach
 * `@mlc-ai/web-llm` — on-device WITHOUT a crisis — is deliberately not made:
 * a unit suite must not fetch 335 MB. The on-device CRISIS path IS tested,
 * precisely because a correct gate returns before the dynamic import runs;
 * if the gate ever regresses, that test hangs into its timeout instead of
 * passing, which is the loud failure this ordering deserves.
 *
 * The storage double is the same shape `tests/lib/support-wall.test.ts`
 * installs: an object over a plain record on `globalThis`, because the suite
 * ships no jsdom and does not want one. Config is read through `localStore()`
 * at call time, so installing it before the calls — not before the import —
 * is enough.
 */
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import {
  DEVICE_MODEL_SIZES,
  askAboutWeek,
  deviceModelId,
  deviceModelMb,
  generateWeeklySummary,
  getAiConfig,
  saveAiKey,
  setAiConfig,
} from "../../src/lib/ai";
import { crisisReply, hasCrisisSignal } from "../../src/lib/crisisGuard";
import { t } from "../../src/lib/i18n";
import type { Entry } from "../../src/types";

/* --------------------------- the storage double ------------------------ */

const backing: Record<string, string> = {};
const globals = globalThis as unknown as { localStorage?: unknown };
const saved = globalThis.localStorage;

function makeStore() {
  return {
    getItem: (k: string) => (k in backing ? backing[k]! : null),
    setItem: (k: string, v: string) => {
      backing[k] = v;
    },
    removeItem: (k: string) => {
      delete backing[k];
    },
  };
}

function clearAll(): void {
  for (const k of Object.keys(backing)) delete backing[k];
  globals.localStorage = makeStore();
}

beforeEach(clearAll);
afterAll(() => {
  clearAll();
  if (saved === undefined) delete globals.localStorage;
  else globals.localStorage = saved;
});

/* ------------------------------- helpers ------------------------------- */

let seq = 0;
function entry(note: string): Entry {
  seq += 1;
  return {
    id: `e${seq}`,
    date: "2026-10-19",
    mood: 3,
    stress: 5,
    energy: 5,
    note,
    tags: [],
    emotions: [],
    activities: [],
    reflection: { feeling: "", stressReason: "", need: "" },
    vitals: { restingHr: null, hrv: null, sleepHours: null },
    source: "manual",
    createdAt: 0,
    updatedAt: 0,
  };
}

const NORMAL = () => [entry("Jó nap volt, sétáltam a parkban.")];
const CRISIS_WEEK = () => [entry("Ma az öngyilkosságon gondolkodom.")];

function jsonRes(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as unknown as Response;
}

/** A fetch double that records the call and replies with `content`. */
function captureFetch(content: string) {
  const seen: { url?: string; init?: RequestInit } = {};
  const doFetch = (url: string, init: RequestInit): Promise<Response> => {
    seen.url = url;
    seen.init = init;
    return Promise.resolve(jsonRes(200, { choices: [{ message: { content } }] }));
  };
  return { seen, doFetch };
}

function sentBody(seen: { init?: RequestInit }): {
  messages: Array<{ role: string; content: string }>;
} {
  return JSON.parse(String(seen.init?.body)) as {
    messages: Array<{ role: string; content: string }>;
  };
}

/* ==================== 1 · the two device model sizes ==================== */

describe("device model sizes", () => {
  test("the two prebuilt ids carry their measured sizes", () => {
    expect(deviceModelId("small")).toBe("Qwen3-0.6B-q4f16_1-MLC");
    expect(deviceModelId("large")).toBe("Qwen3-1.7B-q4f16_1-MLC");
    expect(deviceModelMb("small")).toBe(335);
    expect(deviceModelMb("large")).toBe(939);
  });

  test("small is first in the picker and is the default", () => {
    expect([...DEVICE_MODEL_SIZES]).toEqual(["small", "large"]);
    expect(getAiConfig().model).toBe("small");
  });

  test("a config stored before the second model shipped reads as small", () => {
    // The upgrade path every existing reader takes: their stored config has
    // no `model` field at all, and absence must read as the default rather
    // than as an invalid value the card cannot render.
    setAiConfig({ mode: "byok" });
    const raw = JSON.parse(backing["belso-iranytu-ai-config"]!) as Record<string, unknown>;
    delete raw.model;
    backing["belso-iranytu-ai-config"] = JSON.stringify(raw);
    expect(getAiConfig().model).toBe("small");
  });

  test("an unknown size falls back to small on write and on read", () => {
    const written = setAiConfig({ model: "huge" as never });
    expect(written.model).toBe("small");
    expect(getAiConfig().model).toBe("small");
  });
});

/* ======================== 2 · the crisis gate =========================== */

describe("the crisis gate, before key, host and model", () => {
  test("mode off refuses before the gate — no call, no message", () => {
    // The documented order: `off` first. Without a call there is nothing to
    // guard, and the card's own note (not this engine) is where an AI-off
    // reader is pointed.
    setAiConfig({ mode: "off" });
    return generateWeeklySummary(CRISIS_WEEK()).then((r) => {
      expect(r).toEqual({ ok: false, reason: "off" });
    });
  });

  test("a crisis week is answered with the resource list before any key", async () => {
    setAiConfig({ mode: "byok" }); // no key saved
    const r = await generateWeeklySummary(CRISIS_WEEK());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text.startsWith(t("ai.crisisReply"))).toBe(true);
      expect(r.text).toContain("116-123");
      expect(r.text).toContain("112");
      expect(r.text).toContain("116-111");
    }
  });

  test("a crisis question is answered before any key", async () => {
    setAiConfig({ mode: "byok" }); // no key saved
    const r = await askAboutWeek("Meg akarok halni.", NORMAL());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toContain("116-123");
  });

  test("on-device answers a crisis week without loading a model", async () => {
    // The gate runs before `ensureEngine`, so the dynamic import of
    // `@mlc-ai/web-llm` is never reached. A regression here does not fail an
    // assertion — it starts toward a 335 MB download, and the race below
    // turns that hang into a named failure instead of a silent stall.
    setAiConfig({ mode: "on-device" });
    const wouldLoadModel = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error("the crisis gate did not answer before the engine would load")),
        4_500,
      );
    });
    const r = await Promise.race([generateWeeklySummary(CRISIS_WEEK()), wouldLoadModel]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toContain("116-123");
  });

  test("a non-crisis question still waits for the key", async () => {
    setAiConfig({ mode: "byok" }); // no key saved
    const r = await askAboutWeek("Hogy volt kedd?", NORMAL());
    expect(r).toEqual({ ok: false, reason: "no-key" });
  });

  test("the reply is the shared list, not a copy of its numbers", () => {
    // Same formatter the gate returns, so a crisis answer can never drift
    // from what the crisis card shows.
    expect(crisisReply().startsWith(t("ai.crisisReply"))).toBe(true);
    expect(hasCrisisSignal("I want to die")).toBe(true);
  });
});

/* ==================== 3 · askAboutWeek, the transport =================== */

describe("askAboutWeek — question, facts, transport", () => {
  test("an empty question is refused before anything is read", async () => {
    setAiConfig({ mode: "byok" });
    const r = await askAboutWeek("    ", NORMAL());
    expect(r).toEqual({ ok: false, reason: "bad-response" });
  });

  test("the question travels inside the user turn, with the week's facts", async () => {
    setAiConfig({ mode: "byok" });
    saveAiKey("sk-test-123");
    const { seen, doFetch } = captureFetch("Kedden volt a legjobb hangulatod.");
    const r = await askAboutWeek("Milyen volt kedd?", NORMAL(), { doFetch });
    expect(r).toEqual({ ok: true, text: "Kedden volt a legjobb hangulatod." });

    const body = sentBody(seen);
    expect(body.messages).toHaveLength(2);
    // The system message carries the model's own crisis obligation…
    expect(body.messages[0]!.content).toContain(t("ai.promptCrisis"));
    // …and the user turn carries the context header, the facts and the
    // reader's question, in that order.
    const user = body.messages[1]!.content;
    expect(user).toContain(t("ai.chatContext"));
    expect(user).toContain("date=2026-10-19");
    expect(user).toContain("Milyen volt kedd?");
    expect(user.indexOf("date=")).toBeLessThan(user.indexOf("Milyen volt kedd?"));
  });

  test("an answer that touches the topic gains the helpline block", async () => {
    setAiConfig({ mode: "byok" });
    saveAiKey("sk-test-123");
    const { doFetch } = captureFetch("Az öngyilkosság nehéz téma, de beszélni kell róla.");
    const r = await askAboutWeek("Miért fontos erről beszélni?", NORMAL(), { doFetch });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text).toContain("Az öngyilkosság nehéz téma");
      // Appended by the engine, not by the model — the numbers cannot depend
      // on the model having obeyed the system prompt.
      expect(r.text).toContain("116-123");
      expect(r.text).toContain("112");
    }
  });

  test("an empty model answer stays a failure, never a blank paragraph", async () => {
    setAiConfig({ mode: "byok" });
    saveAiKey("sk-test-123");
    const { doFetch } = captureFetch("   ");
    const r = await askAboutWeek("Összefoglaló?", NORMAL(), { doFetch });
    expect(r).toEqual({ ok: false, reason: "bad-response" });
  });

  test("the summary gate appends the block to a summary too", async () => {
    // generateWeeklySummary and askAboutWeek share `finish` — one code path
    // for both surfaces of the card, asserted from both ends.
    setAiConfig({ mode: "byok" });
    saveAiKey("sk-test-123");
    const { doFetch } = captureFetch("Ma minden rendben volt.");
    const okRun = await generateWeeklySummary(NORMAL(), { doFetch });
    expect(okRun).toEqual({ ok: true, text: "Ma minden rendben volt." });

    const crisisRun = await generateWeeklySummary(CRISIS_WEEK(), { doFetch });
    expect(crisisRun.ok).toBe(true);
    if (crisisRun.ok) expect(crisisRun.text.startsWith(t("ai.crisisReply"))).toBe(true);
  });
});
