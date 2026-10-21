/**
 * Batch 10, commit 7 — the food-photo AI module: key storage, consent, the
 * one API call, and the result shape. The camera/compression UI lives in
 * FoodPhotoCapture.tsx; this file is everything that is not a component.
 *
 * BYOK, AND WHY THE KEY NEVER LEAVES localStorage
 * There is no server in this app — everything is local — so there is nowhere
 * to proxy the OpenAI call through and nothing to hold a shared key. The
 * user's own key is stored under its own localStorage key, never inside the
 * main app blob (so an export/copy of journal data never carries it), and is
 * returned ONLY as a masked form for display. Nothing in this module logs;
 * the codebase has no logging and a key must never become the first logged
 * secret.
 *
 * THE CONSENT IS STRUCTURAL, NOT A DIALOG
 * `foodAiEnabled` is read by the component, and the capture button is not
 * rendered without it. There is no default-on, no nudge, no re-ask: without
 * explicit consent the feature does not exist in the UI, which is the same
 * shape the weather module's two opt-ins use.
 *
 * THE COST SENTENCE IS A PROMISE, NOT A TOAST
 * The per-call cost is stated in the Settings card copy, before the first
 * call, in the same block that holds the key field. A warning shown after
 * the spend is not a warning.
 *
 * WHAT IS SENT, AND WHAT COMES BACK
 * One POST to api.openai.com with the compressed photo (long edge ≤ 1024 px,
 * JPEG) and a fixed Hungarian prompt asking for calories/protein/carbs/fat
 * and a one-line description. `response_format: json_object` so the answer
 * parses; every field is range-checked and missing fields mean failure, not
 * zeros — a fabricated 0 kcal would look like data in the correlation grid.
 */
import { t } from "./i18n";
import type { TrackerState } from "../types";

const STORAGE_KEY = "belso-iranytu:openai-key";

/** The model to use. Vision-capable, small, and cheap — the cost copy depends on it. */
export const FOOD_AI_MODEL = "gpt-4o-mini";

/** The endpoint, named in the Settings copy: "az OpenAI kapja meg a képet". */
export const FOOD_AI_ENDPOINT = "https://api.openai.com/v1/chat/completions";

export type FoodAnalysis = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  description: string;
};

export type FoodAiFailure =
  | "network"
  | "invalid-key"
  | "rate-limited"
  | "bad-response"
  | "no-key"
  | "timeout";

export type FoodAiResult =
  | { ok: true; analysis: FoodAnalysis }
  | { ok: false; reason: FoodAiFailure };

/* ------------------------------- the key -------------------------------- */

export function saveApiKey(key: string): void {
  try {
    if (key.trim() === "") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, key.trim());
  } catch {
    /* quota or privacy mode: the feature degrades, the journal does not */
  }
}

export function hasApiKey(): boolean {
  try {
    return (localStorage.getItem(STORAGE_KEY) ?? "").length > 0;
  } catch {
    return false;
  }
}

/** Clearable, as promised: one call, nothing left behind. */
export function clearApiKey(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to do */
  }
}

/**
 * The only form of the key anything may display: first four characters and a
 * length. Never the whole key — not here, not in a placeholder, nowhere.
 */
export function maskedKey(): string {
  try {
    const k = localStorage.getItem(STORAGE_KEY) ?? "";
    if (k.length <= 8) return "••••";
    return t("foodAi.maskedKey", { head: k.slice(0, 4), length: k.length });
  } catch {
    return "";
  }
}

/** Read the key for the fetch. Internal — not exported to the UI layer. */
function readKey(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

/* ------------------------------ the prompt ------------------------------- */

/**
 * The instruction the model reads, out of the catalogue (round 17).
 *
 * JOINED, not concatenated with literal spaces: the five values are stored
 * trimmed because a catalogue value that ends in a space is invisible in a diff
 * and rejected by `tests/lib/i18n.test.ts`, so the single space between the
 * parts belongs to the join. The sentence the model receives is byte-identical
 * to the one this constant used to hold, and the round's contract test asserts
 * that on the joined value rather than trusting the shape.
 */
const SYSTEM_PROMPT = [
  t("foodAi.promptIntro"),
  t("foodAi.promptSchema"),
  t("foodAi.promptFields"),
  t("foodAi.promptDescription"),
  t("foodAi.promptNotFood"),
].join(" ");

/* --------------------------- the analysis call --------------------------- */

/** The fetch the call uses. Injectable for tests; default is the real one. */
type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** Abort the request after this long. A photo analysis is seconds, not minutes. */
const TIMEOUT_MS = 30_000;

/**
 * Analyse one photo (already compressed by the caller to ≤1024 px JPEG).
 * `doFetch` is injectable so tests can drive every branch without network.
 */
export async function analyzeFoodPhoto(base64Jpeg: string, doFetch?: FetchLike): Promise<FoodAiResult> {
  const key = readKey();
  if (key === "") return { ok: false, reason: "no-key" };

  const fetchImpl: FetchLike = doFetch ?? ((url, init) => fetch(url, init));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  // The fetch gets its own try: a transport failure is network/timeout. The
  // PARSE must not be inside this block — a garbage model answer throwing
  // JSON.parse would otherwise surface as "network", which would be a lie
  // the retry loop believes. (Found by the batch's own tests.)
  let res: Response;
  try {
    res = await fetchImpl(FOOD_AI_ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: FOOD_AI_MODEL,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: t("foodAi.promptQuestion") },
              {
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${base64Jpeg}`, detail: "low" },
              },
            ],
          },
        ],
        max_tokens: 300,
      }),
    });
  } catch (e) {
    // An abort from the timer and a dead network look the same to the user:
    // "most nem sikerült". The distinction stays internal on purpose.
    if (e instanceof Error && e.name === "AbortError") return { ok: false, reason: "timeout" };
    return { ok: false, reason: "network" };
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401) return { ok: false, reason: "invalid-key" };
  if (res.status === 429) return { ok: false, reason: "rate-limited" };
  if (!res.ok) return { ok: false, reason: "bad-response" };

  let payload: { choices?: Array<{ message?: { content?: string } }> };
  try {
    payload = (await res.json()) as typeof payload;
  } catch {
    return { ok: false, reason: "bad-response" };
  }
  const content = payload.choices?.[0]?.message?.content ?? "";
  try {
    return { ok: true, analysis: parseAnalysis(content) };
  } catch {
    // Unusable or absurd model output: failure, never fabricated zeros.
    return { ok: false, reason: "bad-response" };
  }
}

/** JSON out of the model's answer, range-checked. Throws on unusable content. */
function parseAnalysis(content: string): FoodAnalysis {
  const cleaned = content.trim().replace(/^```json\s*/i, "").replace(/```\s*$/, "");
  const raw = JSON.parse(cleaned) as Record<string, unknown>;
  const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number.NaN);
  const calories = num(raw.calories);
  const protein = num(raw.protein);
  const carbs = num(raw.carbs);
  const fat = num(raw.fat);
  const description = typeof raw.description === "string" ? raw.description : "";
  if (!Number.isFinite(calories) || calories < 0 || calories > 10_000) throw new Error("calories");
  if (!Number.isFinite(protein) || protein < 0 || protein > 1000) throw new Error("protein");
  if (!Number.isFinite(carbs) || carbs < 0 || carbs > 1000) throw new Error("carbs");
  if (!Number.isFinite(fat) || fat < 0 || fat > 1000) throw new Error("fat");
  return { calories, protein, carbs, fat, description };
}

/**
 * Map an analysis onto the nutrition trackers the app already has. Returns
 * the tracker cells for `nutrition-calories` and a summary line for
 * `nutrition-note` — the app's own fields, no new storage shape. The caller
 * decides when (or whether) to write them; the user edits FIRST.
 */
export function analysisToTrackers(analysis: FoodAnalysis): TrackerState {
  const macros = t("foodAi.macros", {
    protein: Math.round(analysis.protein),
    carbs: Math.round(analysis.carbs),
    fat: Math.round(analysis.fat),
  });
  return {
    "nutrition-calories": { kind: "number", value: Math.round(analysis.calories) },
    "nutrition-note": { kind: "text", value: `${analysis.description} (${macros})`.trim() },
  };
}

/** The failure reasons in the reader's language, one sentence each (round 17). */
export function failureMessage(reason: FoodAiFailure): string {
  switch (reason) {
    case "no-key":
      return t("foodAi.errorNoKey");
    case "invalid-key":
      return t("foodAi.errorInvalidKey");
    case "rate-limited":
      return t("foodAi.errorRateLimited");
    case "timeout":
      return t("foodAi.errorTimeout");
    case "network":
      return t("foodAi.errorNetwork");
    case "bad-response":
      return t("foodAi.errorBadResponse");
  }
}
