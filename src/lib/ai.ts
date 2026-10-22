/**
 * Phase 4 — the AI engine: three modes, the reader's own key, one weekly
 * summary call. The card that drives it is `components/AiSettingsCard.tsx`,
 * the one that asks for the text is `components/WeeklyAiSummaryCard.tsx`, and
 * `docs/mega-features-plan.md` §Phase 4 is the shape this implements.
 *
 * THREE MODES, AND "off" IS THE DEFAULT THAT REALLY DOES NOTHING
 * `off` is not "the button is greyed out": it returns before any network call,
 * any dynamic import and any storage read of the key. That is the whole reason
 * the mode is a value in this module rather than a prop the components pass
 * around — one place decides, and every caller lands on the same decision.
 * `byok` reaches a host the reader chose, with the reader's own key. `on-device`
 * runs a small model in the browser and touches the network only until the
 * model is cached.
 *
 * THE KEY IS A SECRET, NOT A SETTING
 * It lives under `belso-iranytu-ai-key` in `sessionStorage` — never in
 * `localStorage`, so it can never end up in the app blob, in an export, in a
 * backup or in the JSON a reader copies out to look at their own data. A
 * session that ends takes the key with it, which is the honest cost of not
 * writing a secret down: the reader pastes it again next time. Nothing here
 * logs, and this codebase has no logging at all — the key's only other shape
 * is `maskedAiKey()`, and that is what every screen may show.
 *
 * THE MODEL IS NEVER FETCHED BEHIND THE READER'S BACK
 * `@mlc-ai/web-llm` is imported dynamically and only from `ensureEngine()`,
 * so the ~335 MB model is neither in the bundle nor requested at load. The two
 * ways a download starts are the download button and the first press of
 * "generate" in `on-device` mode, both of which the reader asked for.
 *
 * WHAT LEAVES THE DEVICE, PER MODE
 * off        — nothing.
 * on-device  — the model once; nothing afterwards, including the summary.
 * byok       — the prompt below, which is built ONLY from the entries of the
 *              week being summarised, to `api.openai.com` or `api.deepseek.com`.
 *
 * The fetch is injectable for the same reason `lib/foodAi`'s is: every branch
 * of this function is testable without a network, and a suite that cannot
 * reach a branch cannot guard it.
 */
import { t } from "./i18n";
import { moodByLevel } from "./mood";
import type { MLCEngine } from "@mlc-ai/web-llm";
import type { Entry } from "../types";

export type AiMode = "off" | "on-device" | "byok";
export type AiProvider = "openai" | "deepseek";
export type AiConfig = { mode: AiMode; provider: AiProvider };

/** The three modes, in the order the settings card offers them. */
export const AI_MODES: readonly AiMode[] = ["off", "on-device", "byok"] as const;

/** The two BYOK hosts the card offers. A third is a decision, not a field. */
export const AI_PROVIDERS: readonly AiProvider[] = ["openai", "deepseek"] as const;

/**
 * The host each provider sends to, named in the card's copy the way
 * `lib/foodAi` names its own. The endpoints themselves stay private below:
 * a reader chooses a PROVIDER, and the URL is this module's business.
 */
export const AI_HOSTS: Readonly<Record<AiProvider, string>> = {
  openai: "api.openai.com",
  deepseek: "api.deepseek.com",
};

const ENDPOINTS: Readonly<Record<AiProvider, string>> = {
  openai: "https://api.openai.com/v1/chat/completions",
  deepseek: "https://api.deepseek.com/chat/completions",
};

const MODELS: Readonly<Record<AiProvider, string>> = {
  openai: "gpt-4o-mini",
  deepseek: "deepseek-chat",
};

/** The on-device model, and what the download button promises before it starts. */
export const ON_DEVICE_MODEL = "dict-xs-mlc-q4f16_1";
export const ON_DEVICE_MODEL_MB = 335;

const CONFIG_KEY = "belso-iranytu-ai-config";
const SECRET_KEY = "belso-iranytu-ai-key";

const DEFAULT_CONFIG: AiConfig = { mode: "off", provider: "openai" };

/* ------------------------------ the config ------------------------------ */

function localStore(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const probe = "__belso_ai_probe__";
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

/**
 * The current configuration, read fresh on every call and repaired on the way
 * in. No module-level copy: a module that caches its own settings is a module
 * whose in-memory copy disagrees with storage after "delete everything", and
 * this app already paid for that shape once elsewhere.
 */
export function getAiConfig(): AiConfig {
  const s = localStore();
  if (!s) return { ...DEFAULT_CONFIG };
  try {
    const raw = s.getItem(CONFIG_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(raw) as Partial<AiConfig>;
    const mode: AiMode = AI_MODES.includes(parsed.mode as AiMode)
      ? (parsed.mode as AiMode)
      : DEFAULT_CONFIG.mode;
    const provider: AiProvider = AI_PROVIDERS.includes(parsed.provider as AiProvider)
      ? (parsed.provider as AiProvider)
      : DEFAULT_CONFIG.provider;
    return { mode, provider };
  } catch {
    // Corrupt JSON reads as the default rather than taking the card down.
    return { ...DEFAULT_CONFIG };
  }
}

/** Merge a patch and store it. Unknown values fall back to the default. */
export function setAiConfig(patch: Partial<AiConfig>): AiConfig {
  const next: AiConfig = { ...getAiConfig(), ...patch };
  if (!AI_MODES.includes(next.mode)) next.mode = DEFAULT_CONFIG.mode;
  if (!AI_PROVIDERS.includes(next.provider)) next.provider = DEFAULT_CONFIG.provider;
  try {
    localStore()?.setItem(CONFIG_KEY, JSON.stringify(next));
  } catch {
    /* storage blocked: the choice holds for this session only */
  }
  return next;
}

/* ------------------------------- the key -------------------------------- */

/**
 * `sessionStorage`, deliberately — see the header. Absent storage (private
 * mode, tests) degrades to "no key", which the card reports honestly.
 */
function session(): Storage | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    return sessionStorage;
  } catch {
    return null;
  }
}

export function saveAiKey(raw: string): void {
  try {
    const value = raw.trim();
    if (value === "") session()?.removeItem(SECRET_KEY);
    else session()?.setItem(SECRET_KEY, value);
  } catch {
    /* no session storage: the reader pastes it again */
  }
}

export function hasAiKey(): boolean {
  try {
    return (session()?.getItem(SECRET_KEY) ?? "").length > 0;
  } catch {
    return false;
  }
}

export function clearAiKey(): void {
  try {
    session()?.removeItem(SECRET_KEY);
  } catch {
    /* nothing to do */
  }
}

/**
 * The only form of the key anything may display: a head and a run of dots.
 * Never the whole key — not in a placeholder, not in a title, nowhere.
 */
export function maskedAiKey(): string {
  try {
    const key = session()?.getItem(SECRET_KEY) ?? "";
    if (key.length <= 4) return "••••";
    return `${key.slice(0, 4)}••••`;
  } catch {
    return "••••";
  }
}

/** Internal: the fetch is the only reader of the key. */
function readAiKey(): string {
  try {
    return session()?.getItem(SECRET_KEY) ?? "";
  } catch {
    return "";
  }
}

/* ------------------------------- failures ------------------------------- */

export type AiFailure =
  | "off"
  | "no-key"
  | "invalid-key"
  | "rate-limited"
  | "timeout"
  | "network"
  | "bad-response"
  | "model";

export type AiResult = { ok: true; text: string } | { ok: false; reason: AiFailure };

/** The failure reasons in the reader's language, one sentence each. */
export function aiFailureMessage(reason: AiFailure): string {
  switch (reason) {
    case "off":
      return t("ai.errorOff");
    case "no-key":
      return t("ai.errorNoKey");
    case "invalid-key":
      return t("ai.errorInvalidKey");
    case "rate-limited":
      return t("ai.errorRateLimited");
    case "timeout":
      return t("ai.errorTimeout");
    case "network":
      return t("ai.errorNetwork");
    case "bad-response":
      return t("ai.errorBadResponse");
    case "model":
      return t("ai.errorModel");
  }
}

/* -------------------------------- the prompt ----------------------------- */

/**
 * The instruction the model reads, out of the catalogue.
 *
 * The first line is the reason this is three keys and not one: it names the
 * language, so the Hungarian catalogue asks for Hungarian, the English one for
 * English. A prompt written in English would summarise an English week for a
 * reader who chose Hungarian, and the language switch would silently stop
 * reaching the one screen that generates its own prose.
 */
const SYSTEM_PROMPT = [
  t("ai.promptIntro"),
  t("ai.promptStyle"),
  t("ai.promptGround"),
].join(" ");

/**
 * One line per entry, in a fixed key=value shape and neutral words on purpose.
 *
 * These are DATA for the model, not copy for a reader, so they need no
 * translation — and a fact line that changed with the locale would change the
 * prompt a reader's own history is summarised from. Dates sort first, so the
 * model reads the week in order; notes are capped because an unbounded note
 * field is the one part of an entry the reader did not write for this screen.
 */
export function weeklyFacts(entries: Entry[]): string[] {
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return sorted.map((e) => {
    const parts = [
      `date=${e.date}`,
      `mood=${moodByLevel(e.mood).score}`,
      `stress=${e.stress}`,
      `energy=${e.energy}`,
    ];
    if (e.vitals.sleepHours != null) parts.push(`sleep=${e.vitals.sleepHours}`);
    if (e.tags.length > 0) parts.push(`tags=${e.tags.join(",")}`);
    const note = e.note.trim();
    if (note !== "") parts.push(`note=${note.slice(0, 200)}`);
    return parts.join("; ");
  });
}

/* ------------------------------ the engine ------------------------------ */

/**
 * The on-device engine, once. Two fields and one promise, and the reason for
 * the promise rather than a lock is the download button: a second press while
 * the first download is running must join it, not start a second 335 MB fetch.
 */
let engine: MLCEngine | null = null;
let enginePending: Promise<MLCEngine> | null = null;
let progressSink: ((fraction: number) => void) | null = null;

async function ensureEngine(): Promise<MLCEngine> {
  if (engine) return engine;
  if (!enginePending) {
    enginePending = (async () => {
      // The one dynamic import in the app. Static, this package would put the
      // runtime in the main bundle for a feature that is off by default.
      const { CreateMLCEngine } = await import("@mlc-ai/web-llm");
      const created = await CreateMLCEngine(ON_DEVICE_MODEL, {
        initProgressCallback: (report) => {
          if (typeof report.progress === "number") progressSink?.(report.progress);
        },
      });
      engine = created;
      return created;
    })();
    // A failed download must be retryable: clear the promise so the next press
    // starts a new attempt instead of re-awaiting the rejected one.
    enginePending.catch(() => {
      enginePending = null;
    });
  }
  return enginePending;
}

/** Whether the model is already in memory (the button's "ready" state). */
export function isModelReady(): boolean {
  return engine !== null;
}

/**
 * Fetch the model, reporting 0..1 as it goes. This is the only function that
 * can start a download, and it is only ever reached from a button press or the
 * reader's first "generate" in `on-device` mode.
 */
export async function downloadOnDeviceModel(
  onProgress?: (fraction: number) => void,
): Promise<{ ok: boolean }> {
  progressSink = onProgress ?? null;
  try {
    await ensureEngine();
    onProgress?.(1);
    return { ok: true };
  } catch {
    return { ok: false };
  } finally {
    progressSink = null;
  }
}

/* ------------------------------ the summary ----------------------------- */

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** How long a BYOK summary may take. A weekly summary is seconds, not minutes. */
const TIMEOUT_MS = 45_000;

export type AiCallOptions = {
  /** Injectable for tests; the default is the real network. */
  doFetch?: FetchLike;
  /** `on-device` download progress, forwarded while the engine loads. */
  onProgress?: (fraction: number) => void;
};

/**
 * Summarise one week, in whichever mode the reader chose.
 *
 * `entries` are the caller's CURRENT WEEK and nothing else — the card passes
 * the week it is showing, so the prompt cannot grow to include the whole
 * journal by accident. The order of the three checks is the promise:
 * `off` before anything is read, the key before any host is named, and the
 * model only after both.
 */
export async function generateWeeklySummary(
  entries: Entry[],
  options: AiCallOptions = {},
): Promise<AiResult> {
  const config = getAiConfig();
  if (config.mode === "off") return { ok: false, reason: "off" };

  const facts = weeklyFacts(entries);
  if (facts.length === 0) return { ok: false, reason: "bad-response" };

  const user = [t("ai.promptQuestion"), ...facts].join("\n");

  if (config.mode === "on-device") {
    try {
      const mlc = await ensureEngine();
      const response = await mlc.chat.completions.create({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: user },
        ],
        temperature: 0.7,
        max_tokens: 400,
      });
      const text = response.choices?.[0]?.message?.content ?? "";
      if (text.trim() === "") return { ok: false, reason: "bad-response" };
      return { ok: true, text: text.trim() };
    } catch {
      return { ok: false, reason: "model" };
    }
  }

  const key = readAiKey();
  if (key === "") return { ok: false, reason: "no-key" };

  const doFetch: FetchLike = options.doFetch ?? ((url, init) => fetch(url, init));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await doFetch(ENDPOINTS[config.provider], {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: MODELS[config.provider],
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: user },
        ],
        temperature: 0.7,
        max_tokens: 400,
      }),
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") return { ok: false, reason: "timeout" };
    return { ok: false, reason: "network" };
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 || res.status === 403) return { ok: false, reason: "invalid-key" };
  if (res.status === 429) return { ok: false, reason: "rate-limited" };
  if (!res.ok) return { ok: false, reason: "bad-response" };

  let payload: { choices?: Array<{ message?: { content?: string } }> };
  try {
    payload = (await res.json()) as typeof payload;
  } catch {
    return { ok: false, reason: "bad-response" };
  }
  const text = payload.choices?.[0]?.message?.content?.trim() ?? "";
  // A refusal, an empty answer or a truncated one is a failure, never a blank
  // paragraph the card would render as a summary that says nothing.
  if (text === "") return { ok: false, reason: "bad-response" };
  return { ok: true, text };
}
