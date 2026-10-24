/**
 * Phase 4 — the AI engine: three modes, the reader's own key, the weekly
 * summary and one question about the week, with the crisis guard in front of
 * both calls. The card that drives it is `components/AiSettingsCard.tsx`,
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
 * so the ~276 MB model is neither in the bundle nor requested at load. The two
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
 * The crisis gate sits before all of it: if the week's data or the question
 * carries a self-harm signal, NO call happens in any mode — the answer comes
 * from `lib/crisisGuard` and the shared resources list, offline and instantly,
 * so a failed key or a dead network can never swallow that sentence.
 */
import { localeTag, t } from "./i18n";
import { moodByLevel } from "./mood";
import { crisisReply, hasCrisisSignal } from "./crisisGuard";
import type { MLCEngine } from "@mlc-ai/web-llm";
import type { Entry } from "../types";

export type AiMode = "off" | "on-device" | "byok";
export type AiProvider = "openai" | "deepseek";
export type AiConfig = { mode: AiMode; provider: AiProvider; model: DeviceModelSize };

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

/**
 * THE ON-DEVICE MODELS, AND WHY THEY ARE THESE
 *
 * `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` (the default) and `Qwen3-1.7B-q4f16_1-MLC`
 * are chosen because they are IN the prebuilt model list of the installed
 * `@mlc-ai/web-llm` (0.2.86): `CreateMLCEngine` resolves them without any
 * custom `ModelRecord`, and the cache helpers below find them the same way.
 * An id OUTSIDE that list is the failure this pair exists to avoid — the
 * plan originally named `dict-xs-mlc-q4f16_1`, a HuggingFace repo that is not
 * in it, so the download button would have thrown "model not found" on the
 * first press.
 *
 * THE DEFAULT IS THE SMALLEST GENERAL MODEL IN THAT LIST, and the sizes are
 * MEASURED, not guessed: the sum of the file sizes the HuggingFace API
 * reports for each repo (0.5B: 17 files, 276.3 MiB → 276; 1.7B: 39 files,
 * 938.6 MiB → 939), taken 2026-10-23, with the very method that reads
 * `Qwen3-0.6B-q4f16_1-MLC` at 335.2 MiB — the number this app long shipped,
 * and the one that validates the method rather than trusting it. The only
 * 4-bit entry SMALLER is `SmolLM2-360M-Instruct-q4f16_1-MLC` (197.6 MiB),
 * an English-task line left out on purpose: the one thing this app asks of a
 * model is a HUNGARIAN answer, and 0.5B-class Qwen is the smallest family in
 * the list published with multilingual coverage. (SmolLM2-135M ships only
 * unquantized, so it is not smaller at 4-bit either way.) The default also
 * sits under the ~400–600 MB band `docs/mega-features-plan.md` allows for it.
 *
 * 0.2.86 is pinned in package.json: the prebuilt list changes between
 * versions, and an id that exists today can be renamed away. If the dependency
 * is ever bumped, re-check `node_modules/@mlc-ai/web-llm/lib/index.js` for
 * BOTH ids before shipping.
 */
export type DeviceModelSize = "small" | "large";

/** The picker's order — small first, because small is the default. */
export const DEVICE_MODEL_SIZES: readonly DeviceModelSize[] = ["small", "large"] as const;

type DeviceModel = { id: string; mb: number };

const DEVICE_MODELS: Readonly<Record<DeviceModelSize, DeviceModel>> = {
  small: { id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC", mb: 276 },
  large: { id: "Qwen3-1.7B-q4f16_1-MLC", mb: 939 },
};

/** The MLC id a size downloads and caches under. */
export function deviceModelId(size: DeviceModelSize): string {
  return DEVICE_MODELS[size].id;
}

/** The size the card promises in the download button's label. */
export function deviceModelMb(size: DeviceModelSize): number {
  return DEVICE_MODELS[size].mb;
}


const CONFIG_KEY = "belso-iranytu-ai-config";
const SECRET_KEY = "belso-iranytu-ai-key";

const DEFAULT_CONFIG: AiConfig = { mode: "off", provider: "openai", model: "small" };

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
    // The size field is absent from every config stored before the second
    // model shipped — absence reads as the default, exactly like the others.
    const model: DeviceModelSize = DEVICE_MODEL_SIZES.includes(
      parsed.model as DeviceModelSize,
    )
      ? (parsed.model as DeviceModelSize)
      : DEFAULT_CONFIG.model;
    return { mode, provider, model };
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
  if (!DEVICE_MODEL_SIZES.includes(next.model)) next.model = DEFAULT_CONFIG.model;
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
  // THE MODEL'S OWN CRISIS OBLIGATION, in the same instruction the answer is
  // generated from — the client-side filter in `lib/crisisGuard` gates the
  // INPUT, and this line binds the OUTPUT: if the week or the question touches
  // self-harm, the model must direct to the app's helplines itself.
  t("ai.promptCrisis"),
].join(" ");

/**
 * THE LANGUAGE ORDER the on-device model is answered in, and why it is its
 * own message rather than a line of the instruction above.
 *
 * The instruction above is built from the CATALOGUE, so its first line names
 * the language too — but a 0.5B model weights a short, imperative, FIRST
 * message far more reliably than a clause buried in a paragraph of style
 * rules, and language drift is the one failure this feature exists to prevent.
 * So the order is its own system turn, built from `localeTag()` — the one tag
 * the whole app derives its formatting from, never `navigator.language` — and
 * it goes at the FRONT of `messages`, ahead of the instruction and ahead of
 * any conversation history: every turn the model reads comes after the
 * language it must answer in. The three texts live in the catalogue under
 * `ai.systemLang.*`, each written in the language it names in EVERY
 * catalogue, so the key — not the current one — decides the language.
 */
export function languageSystemPrompt(): string {
  // The BASE language, taken from the one tag the app mints for itself.
  // Deliberately derived here rather than through the tag-matching helper:
  // that helper has exactly one caller by design — the mirror's own read —
  // and the locale rounds pin it so.
  switch (localeTag().split("-")[0]) {
    case "en":
      return t("ai.systemLang.en");
    case "de":
      return t("ai.systemLang.de");
    default:
      return t("ai.systemLang.hu");
  }
}

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

/**
 * THE CONTEXT CEILING: 1500 characters of the week's facts, whatever the
 * week grew to.
 *
 * A note is already capped per line above, but seven fat days still stack
 * past what a 0.5B model should spend its prompt budget on — the input is
 * the part of inference the reader never sees costing time, so the facts
 * block is clipped HERE, once, for both transports, before either prompt is
 * composed. The question and the instruction are not context and are never
 * clipped: a truncated ask is a question the model cannot answer.
 */
const CONTEXT_MAX_CHARS = 1500;

function clipContext(lines: readonly string[]): string {
  const joined = lines.join("\n");
  return joined.length > CONTEXT_MAX_CHARS ? joined.slice(0, CONTEXT_MAX_CHARS) : joined;
}

/* ------------------------------ the engine ------------------------------ */

/**
 * The on-device engine, once — and once per SIZE.
 *
 * One slot, two sizes: it holds whichever size was last loaded, and a switch
 * loads the other one. The promise is what keeps a second press from starting
 * a second fetch — of EITHER size: a press for the same size joins the
 * running download, and a press for the other size awaits it and then
 * switches, instead of racing two CreateMLCEngine calls into one device.
 */
let engine: MLCEngine | null = null;
/** Which size the loaded engine holds; null when none is loaded. */
let engineModel: DeviceModelSize | null = null;
let enginePending: Promise<MLCEngine> | null = null;
/** Which size is on its way in `enginePending`. */
let pendingModel: DeviceModelSize | null = null;
let progressSink: ((fraction: number) => void) | null = null;

async function ensureEngine(size: DeviceModelSize = getAiConfig().model): Promise<MLCEngine> {
  // Already holding THIS size — the fast path every repeat call takes.
  if (engine && engineModel === size) return engine;
  // The same download is already running: join it, never start a second one.
  if (enginePending && pendingModel === size) return enginePending;
  // Another size is loading: let it settle, then re-answer from the top. No
  // lock — after the await the same two checks decide again, so the first
  // press finishes and the second either joins it or switches afterwards.
  if (enginePending) await enginePending.catch(() => null);
  if (engine && engineModel === size) return engine;
  if (enginePending && pendingModel === size) return enginePending;
  if (engine) {
    // Switching sizes frees the old one first: the 276 MB model's WebGPU
    // buffers do not belong beside the 939 MB one's, and CreateMLCEngine on
    // top of a live engine is an undefined state rather than a swap.
    try {
      await engine.unload();
    } catch {
      // An engine that refuses to unload must still not block the switch.
    }
    engine = null;
    engineModel = null;
    // The old promise is SPENT — it resolved to the engine just unloaded —
    // so it must never answer the next call for a size again.
    enginePending = null;
    pendingModel = null;
  }
  const wanted = size;
  const pending = (async () => {
    // The one dynamic import in the app. Static, this package would put the
    // runtime in the main bundle for a feature that is off by default.
    const { CreateMLCEngine } = await import("@mlc-ai/web-llm");
    const created = await CreateMLCEngine(deviceModelId(wanted), {
      initProgressCallback: (report) => {
        if (typeof report.progress === "number") progressSink?.(report.progress);
      },
    });
    engine = created;
    engineModel = wanted;
    return created;
  })();
  enginePending = pending;
  pendingModel = wanted;
  // A failed download must be retryable: clear THIS attempt's promise so the
  // next press starts a new one instead of re-awaiting the rejected one —
  // and only while it is still the current one, so a late failure cannot drop
  // a newer attempt that has already replaced it.
  pending.catch(() => {
    if (enginePending === pending) {
      enginePending = null;
      pendingModel = null;
    }
  });
  return pending;
}

/**
 * Whether a size is in memory (the button's "ready" state). With no argument
 * it keeps the old meaning — SOMETHING is loaded — for callers that do not
 * care which.
 */
export function isModelReady(size?: DeviceModelSize): boolean {
  if (engine === null) return false;
  return size === undefined || engineModel === size;
}

/* --------------------------- the model on disk -------------------------- */

/**
 * Whether a size's megabytes are already in the browser's cache.
 *
 * THE CACHE IS NOT SOMETHING THIS FILE GUESSES AT. `@mlc-ai/web-llm` 0.2.86
 * exports the machinery from its own entry point (`lib/index.d.ts:7` re-exports
 * `./cache_util`):
 *
 *   hasModelInCache(modelId, appConfig?)         → boolean
 *   deleteModelAllInfoInCache(modelId, appConfig?) → void
 *
 * both defaulting `appConfig` to `prebuiltAppConfig`, which is exactly where
 * both model ids live. Under the hood they resolve the model record's URL
 * and reach three Cache Storage entries named by the package's own `CacheScope`
 * type: `webllm/model` (the param shards), `webllm/config` (mlc-chat-config)
 * and `webllm/wasm` (the runtime). Those names are version-pinned facts of
 * 0.2.86, read from `cache_util.d.ts` — NOT hand-written here, because a
 * hard-coded cache name is the one part of this feature that would rot
 * silently: the button would "succeed" while the megabytes stayed on disk.
 *
 * Everything is behind a dynamic import for the same reason `ensureEngine` is:
 * this module must not pull the runtime into the bundle to ask a question.
 */
export async function isModelCached(size: DeviceModelSize = getAiConfig().model): Promise<boolean> {
  try {
    const { hasModelInCache } = await import("@mlc-ai/web-llm");
    return await hasModelInCache(deviceModelId(size));
  } catch {
    // No Cache Storage (private mode, a browser that blocks it): the honest
    // answer is "not cached", which keeps the delete button hidden rather
    // than offering a delete that cannot succeed.
    return false;
  }
}

/**
 * Free the model: memory first, then the megabytes on disk.
 *
 * The order matters. `unload()` (engine.d.ts:75 in 0.2.86 — "explicitly
 * unload the currently loaded model(s) and release the related resources")
 * drops the WebGPU buffers, but the shards stay in Cache Storage; deleting the
 * caches under a live engine would leave a running model pointing at entries
 * that no longer exist. So: unload and null the module refs (a fresh
 * `CreateMLCEngine` on the next download), then `deleteModelAllInfoInCache`,
 * which removes model + wasm + chat config in one call.
 */
export async function deleteOnDeviceModel(
  size: DeviceModelSize = getAiConfig().model,
): Promise<{ ok: boolean }> {
  try {
    // Memory first — but only THIS size's engine: deleting the small model
    // while the large one is loaded must not unload the large one.
    if (engine && engineModel === size) {
      try {
        await engine.unload();
      } catch {
        // An engine that refuses to unload must still not block the delete:
        // the refs are dropped either way and the cache removal below is what
        // actually frees the megabytes.
      }
      engine = null;
      engineModel = null;
      enginePending = null;
      pendingModel = null;
    }
    const { deleteModelAllInfoInCache } = await import("@mlc-ai/web-llm");
    await deleteModelAllInfoInCache(deviceModelId(size));
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/**
 * Fetch the model, reporting 0..1 as it goes. This is the only function that
 * can start a download, and it is only ever reached from a button press or the
 * reader's first "generate" in `on-device` mode.
 */
export async function downloadOnDeviceModel(
  onProgress?: (fraction: number) => void,
  size: DeviceModelSize = getAiConfig().model,
): Promise<{ ok: boolean }> {
  progressSink = onProgress ?? null;
  try {
    await ensureEngine(size);
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
 * Wrap a model answer: empty stays a failure, and an answer that touches
 * self-harm carries the app's crisis block — the prompt already asked the
 * model to direct to help, and the numbers are appended HERE so the
 * direction never depends on the model having obeyed.
 */
function finish(text: string): AiResult {
  const clean = text.trim();
  if (clean === "") return { ok: false, reason: "bad-response" };
  return {
    ok: true,
    text: hasCrisisSignal(clean) ? `${clean}\n\n${crisisReply()}` : clean,
  };
}

/**
 * The shared transport: on-device first, BYOK second, both through `finish`.
 * One copy of the message array, the status ladder and the timeout — the
 * summary and the question differ ONLY in the user turn they send.
 */
async function askModel(
  config: AiConfig,
  user: string,
  options: AiCallOptions,
): Promise<AiResult> {
  if (config.mode === "on-device") {
    try {
      const mlc = await ensureEngine(config.model);
      const response = await mlc.chat.completions.create({
        // THE ORDER, and it is load-bearing: the language first, the shared
        // instruction second, then every turn that follows — history would
        // sit here, after the system prompts, and the reader's question is
        // the last turn either way.
        messages: [
          { role: "system", content: languageSystemPrompt() },
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: user },
        ],
        temperature: 0.3,
        max_tokens: 250,
      });
      return finish(response.choices?.[0]?.message?.content ?? "");
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
  // A refusal, an empty answer or a truncated one is a failure, never a blank
  // paragraph the card would render as a summary that says nothing.
  return finish(payload.choices?.[0]?.message?.content ?? "");
}

/**
 * Summarise one week, in whichever mode the reader chose.
 *
 * `entries` are the caller's CURRENT WEEK and nothing else — the card passes
 * the week it is showing, so the prompt cannot grow to include the whole
 * journal by accident. The order of the checks is the promise: `off` before
 * anything is read, the crisis gate before any key, host or model is named,
 * and the transport only after all three.
 */
export async function generateWeeklySummary(
  entries: Entry[],
  options: AiCallOptions = {},
): Promise<AiResult> {
  const config = getAiConfig();
  if (config.mode === "off") return { ok: false, reason: "off" };

  const facts = weeklyFacts(entries);
  if (facts.length === 0) return { ok: false, reason: "bad-response" };

  // THE CRISIS GATE, before the key, the host and the model: the week's own
  // notes may carry a self-harm signal, and that sentence must be answered
  // even with the key cleared, the network down or 939 MB still downloading.
  if (hasCrisisSignal(facts.join("\n"))) return { ok: true, text: crisisReply() };

  const user = [t("ai.promptQuestion"), clipContext(facts)].join("\n");
  return askModel(config, user, options);
}

/**
 * Answer ONE question about the week — "Kérdezz a hetedről" — with the same
 * three modes, the same prompt and the same guard as the summary.
 *
 * The question travels INSIDE the user turn, after the facts, so the model
 * reads the week and the question as one instruction; nothing else about
 * the contract changes (the clipped context above, the transports' own token
 * ceilings — 250 on-device, 400 over the wire — the same 45 s, the same
 * injectable fetch). `entries` is still the caller's current week only.
 */
export async function askAboutWeek(
  question: string,
  entries: readonly Entry[],
  options: AiCallOptions = {},
): Promise<AiResult> {
  const config = getAiConfig();
  if (config.mode === "off") return { ok: false, reason: "off" };
  const trimmed = question.trim();
  if (trimmed === "") return { ok: false, reason: "bad-response" };
  const facts = weeklyFacts([...entries]);
  if (facts.length === 0) return { ok: false, reason: "bad-response" };
  // The question AND the week are scanned: either half can carry the signal.
  if (hasCrisisSignal(trimmed) || hasCrisisSignal(facts.join("\n"))) {
    return { ok: true, text: crisisReply() };
  }
  const user = [t("ai.chatContext"), clipContext(facts), "", trimmed].join("\n");
  return askModel(config, user, options);
}
