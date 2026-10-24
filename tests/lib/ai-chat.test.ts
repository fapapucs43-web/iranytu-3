/**
 * Phase 2 (AI depth) — the model sizes, the question path ("Kérdezz a
 * hetedről") and the crisis gate that stands in front of BOTH calls.
 *
 * WHY THIS FILE NEVER LOADS A MODEL
 * Everything asserted here happens BEFORE the engine: the gates are ordered
 * promises (off → facts → crisis → key → transport), the transport is
 * injectable, and the sizes are data. The one call that would reach
 * `@mlc-ai/web-llm` — on-device WITHOUT a crisis — is deliberately not made:
 * a unit suite must not fetch the model. The on-device CRISIS path IS tested,
 * precisely because a correct gate returns before the dynamic import runs;
 * if the gate ever regresses, that test hangs into its timeout instead of
 * passing, which is the loud failure this ordering deserves.
 *
 * The storage double is the same shape `tests/lib/support-wall.test.ts`
 * installs — an object over a plain record on `globalThis`, because the suite
 * ships no jsdom and does not want one — and it covers BOTH storages: the
 * config lives in `localStorage`, the key itself in `sessionStorage`. No
 * runner provides `sessionStorage` under `bun test`; this file used to pass
 * only by inheriting another file's leaked double, and file order differs
 * between machines (it failed on Linux CI with `no-key` while staying green
 * on Windows), so both doubles are installed here. The storages are read at
 * call time, so installing them in `beforeEach` — not before the import —
 * is enough.
 */
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  DEVICE_MODEL_SIZES,
  askAboutWeek,
  deviceModelId,
  deviceModelMb,
  generateWeeklySummary,
  getAiConfig,
  languageSystemPrompt,
  saveAiKey,
  setAiConfig,
} from "../../src/lib/ai";
import { crisisReply, hasCrisisSignal } from "../../src/lib/crisisGuard";
import { setActiveLocale, t } from "../../src/lib/i18n";
import type { Entry } from "../../src/types";

/* --------------------------- the storage double ------------------------ */

const backing: Record<string, string> = {};
const sessionBacking: Record<string, string> = {};
const globals = globalThis as unknown as { localStorage?: unknown; sessionStorage?: unknown };
const saved = globalThis.localStorage;
const savedSession = globalThis.sessionStorage;

function makeStore(b: Record<string, string>) {
  return {
    getItem: (k: string) => (k in b ? b[k]! : null),
    setItem: (k: string, v: string) => {
      b[k] = v;
    },
    removeItem: (k: string) => {
      delete b[k];
    },
  };
}

function clearAll(): void {
  for (const k of Object.keys(backing)) delete backing[k];
  for (const k of Object.keys(sessionBacking)) delete sessionBacking[k];
  globals.localStorage = makeStore(backing);
  globals.sessionStorage = makeStore(sessionBacking);
}

beforeEach(clearAll);
afterAll(() => {
  clearAll();
  if (saved === undefined) delete globals.localStorage;
  else globals.localStorage = saved;
  if (savedSession === undefined) delete globals.sessionStorage;
  else globals.sessionStorage = savedSession;
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
    // The default is the smallest general model of the prebuilt list, at its
    // measured MiB (HuggingFace API sum, 2026-10-23) — the header of `lib/ai`
    // keeps the method and the comparison against the previously shipped
    // 0.6B, which is what makes "smallest" a measurement rather than a claim.
    expect(deviceModelId("small")).toBe("Qwen2.5-0.5B-Instruct-q4f16_1-MLC");
    expect(deviceModelId("large")).toBe("Qwen3-1.7B-q4f16_1-MLC");
    expect(deviceModelMb("small")).toBe(276);
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
    // assertion — it starts toward a 276 MB download, and the race below
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

/* ========== 4 · the language order, and the parameters that follow ====== */

describe("the WebLLM call answers in the reader's language, briefly", () => {
  test("the three orders live in the catalogue, each written in its own language", () => {
    // The KEY names the language in every catalogue, so `t()` cannot swap
    // the text under a language switch — the value for `ai.systemLang.en`
    // is English whether the reader reads Hungarian or English.
    expect(t("ai.systemLang.hu")).toBe(
      "Te egy magyar nyelvű asszisztens vagy. Minden esetben KIZÁRÓLAG magyarul válaszolj. A válaszaid legyenek rövidek, tömörek és segítőkészek.",
    );
    expect(t("ai.systemLang.en")).toBe(
      "You are an English assistant. ALWAYS respond in English. Keep your answers short and helpful.",
    );
    expect(t("ai.systemLang.de")).toBe(
      "Du bist ein deutscher Assistent. Antworte IMMER auf Deutsch. Halte deine Antworten kurz und hilfreich.",
    );
  });

  test("the current locale picks one — Hungarian is the default", () => {
    // The locale is forced rather than assumed: this suite runs beside the
    // locale-switch rounds, and a leaked `setActiveLocale` from another file
    // must not turn this assertion into that file's state.
    setActiveLocale("hu");
    expect(languageSystemPrompt()).toBe(t("ai.systemLang.hu"));
  });

  test("the language is the FIRST system turn, the question the last turn", () => {
    // The on-device branch never runs in this suite (it would fetch the
    // model), so the array's ORDER is pinned where it is written. Language
    // first, instruction second, reader's turn last — a history, when the
    // chat ever grows one, sits between the instructions and the turns.
    const src = readFileSync(new URL("../../src/lib/ai.ts", import.meta.url), "utf8");
    const lang = src.indexOf("content: languageSystemPrompt()");
    const instruction = src.indexOf("content: SYSTEM_PROMPT");
    const reader = src.indexOf('role: "user", content: user');
    expect(lang, "the language message exists").toBeGreaterThan(-1);
    expect(lang).toBeLessThan(instruction);
    expect(instruction).toBeLessThan(reader);
  });

  test("the on-device inference answers fast and short", () => {
    // Both pinned on the source because the call itself is never made here:
    // a low temperature keeps a 0.5B model on the facts it was given, and a
    // 250-token ceiling turns "write me an essay" into the 3–5 sentences the
    // instruction already asks for.
    const src = readFileSync(new URL("../../src/lib/ai.ts", import.meta.url), "utf8");
    expect(src).toContain("temperature: 0.3");
    expect(src).toContain("max_tokens: 250");
  });
});

/* ================= 5 · the context ceiling ============================= */

describe("the week's facts reach the model within 1500 characters", () => {
  test("a fat week is clipped — and the reader's question arrives whole", async () => {
    setAiConfig({ mode: "byok" });
    saveAiKey("sk-test-123");
    const { seen, doFetch } = captureFetch("Rövid válasz a hétről.");
    // Eight 200-character notes: every line is inside the per-entry cap, and
    // the stack is well past the ceiling — which is exactly the week the
    // ceiling exists for.
    const fat = Array.from({ length: 8 }, () => entry("x".repeat(200)));
    const r = await askAboutWeek("Milyen volt ez a hét?", fat, { doFetch });
    expect(r.ok).toBe(true);

    // The user turn is `header \n facts \n\n question` — the facts block is
    // the clipped part, the question after it is not.
    const user = sentBody(seen).messages[1]!.content;
    const facts = user.slice(user.indexOf("\n") + 1, user.lastIndexOf("\n\n"));
    expect(facts.length).toBe(1500);
    expect(user.endsWith("Milyen volt ez a hét?")).toBe(true);
  });

  test("a short week is never touched", async () => {
    // The ceiling only ever shortens: with one quiet day the whole block
    // travels, question included, exactly as before.
    setAiConfig({ mode: "byok" });
    saveAiKey("sk-test-123");
    const { seen, doFetch } = captureFetch("Rendben volt.");
    await askAboutWeek("Hogy volt kedd?", NORMAL(), { doFetch });
    const user = sentBody(seen).messages[1]!.content;
    expect(user).toContain("date=2026-10-19");
    expect(user).toContain("Hogy volt kedd?");
    expect(user.length).toBeLessThan(1500);
  });
});

/* ========== 6 · the big slot warns, and the card shows the wait ========= */

describe("the picker warns before the big model, the card says it is thinking", () => {
  test("choosing the large slot is behind a warning in every language", () => {
    // The hint under the picker is not a description any more — it names the
    // cost in the reader's language before the megabytes are committed, and
    // the small slot stays the default beside it.
    expect(deviceModelMb("small")).toBeLessThan(deviceModelMb("large"));
    expect(t("ai.modelLargeHint")).toContain("Figyelmeztetés");
    expect(t("ai.modelLargeHint", undefined, "en")).toContain("Warning");
    expect(t("ai.modelLargeHint", undefined, "de")).toContain("Warnung");
  });

  test("while a call is open the card announces the wait", () => {
    // The first on-device press also downloads the model — minutes where a
    // disabled button would be the only feedback. The line covers the
    // summary and the question alike.
    expect(t("ai.thinking")).toBe("AI gondolkodik…");
    const card = readFileSync(
      new URL("../../src/components/WeeklyAiSummaryCard.tsx", import.meta.url),
      "utf8",
    );
    expect(card).toContain('{t("ai.thinking")}');
    expect(card).toContain('status === "busy" || chatBusy');
  });
});
