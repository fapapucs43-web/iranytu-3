import type OpenAI from "openai";
import { t } from "./i18n";

/**
 * Voice/natural-language intake → structured metrics.
 *
 * Primary path: OpenAI chat completions (JSON mode) using VITE_OPENAI_API_KEY.
 * Fallback path: an offline Hungarian keyword parser, so the feature still
 * works without a key and while offline.
 *
 * WHY THE SDK IS A DYNAMIC IMPORT (mega batch, commit 5)
 * It used to be a static import, and the SDK shipped in the main bundle in
 * exactly one situation: when a key was present at BUILD time. With no key,
 * Vite substitutes `undefined`, `if (!apiKey) return null` constant-folds, and
 * Rollup drops the import — so the reported bundle size was a fact about the
 * build environment rather than about the app. Measured: 1405.1 kB without a
 * key, 1505.9 kB with one, same source tree, no warning.
 *
 * The type-only import above is what makes this possible at zero cost: types
 * are erased before bundling, so the compiler still knows the shape of the
 * client while the code is split out of the main chunk. `client()` is therefore
 * async, and the awaiting sits INSIDE the try — a chunk that fails to load now
 * falls through to the offline parser, which is what this module has always
 * promised, rather than throwing on a static import.
 */

export type VoiceParseResult = {
  mood: number | null; // 1–5
  stress: number | null; // 1–10
  energy: number | null; // 1–10
  sleepHours: number | null;
  restingHr: number | null;
  activities: string[];
  note: string;
  source: "llm" | "offline";
};

/**
 * The model's instruction. Round 18 moved it into the catalogue verbatim: a
 * reader's note is read by a model that answers in the reader's language, so a
 * prompt that is fixed in Hungarian is the one part of the flow the language
 * switch could not reach.
 *
 * ONE value, not five like round 17's food-AI prompt: that one was a sentence
 * whose parts were joined with a space, this one is a paragraph, a schema and a
 * closing line the module already joined with newlines. `\n` is legal inside a
 * catalogue value; a leading or trailing space is not.
 */
const SYSTEM_PROMPT = t("voice.systemPrompt");

async function client(): Promise<OpenAI | null> {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
  if (!apiKey) return null;
  const { default: OpenAIClient } = await import("openai");
  return new OpenAIClient({
    apiKey,
    dangerouslyAllowBrowser: true,
    maxRetries: 1,
  });
}

export function isLlmAvailable(): boolean {
  return Boolean(import.meta.env.VITE_OPENAI_API_KEY);
}

export async function parseVoiceMetrics(text: string): Promise<VoiceParseResult> {
  try {
    const api = await client();
    if (api) {
      const model = import.meta.env.VITE_OPENAI_MODEL || "gpt-4o-mini";
      const res = await api.chat.completions.create({
        model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: text.slice(0, 4000) },
        ],
      });
      const raw = res.choices[0]?.message?.content;
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<VoiceParseResult>;
        return normalize(parsed, "llm");
      }
    }
  } catch {
    // Offline parsing below, including a chunk that failed to load.
  }
  return normalize(offlineParse(text), "offline");
}

function normalize(
  raw: Partial<VoiceParseResult>,
  source: VoiceParseResult["source"],
): VoiceParseResult {
  const clamp = (n: unknown, min: number, max: number) => {
    const num = typeof n === "string" ? Number(n) : n;
    if (typeof num !== "number" || Number.isNaN(num)) return null;
    return Math.min(max, Math.max(min, Math.round(num)));
  };
  return {
    mood: clamp(raw.mood, 1, 5),
    stress: clamp(raw.stress, 1, 10),
    energy: clamp(raw.energy, 1, 10),
    sleepHours: clamp(raw.sleepHours, 0, 24),
    restingHr: clamp(raw.restingHr, 30, 220),
    activities: (raw.activities ?? [])
      .filter((a): a is string => typeof a === "string")
      .map((a) => a.trim())
      .filter(Boolean)
      .slice(0, 4),
    note: typeof raw.note === "string" ? raw.note.slice(0, 500) : "",
    source,
  };
}

/* ---------- Offline fallback parser (Hungarian keywords) ---------- */

type Rule = {
  re: RegExp;
  mood?: number;
  stress?: number;
  energy?: number;
  activity?: string;
};

const RULES: Rule[] = [
  { re: /nagyon jó|nagyon boldog|csodás|fantasztikus|imádom/i, mood: 5 },
  { re: /jól |jó nap|boldog|vidám|örül|elégedett|hálás/i, mood: 4 },
  { re: /rossz|szomorú|unalmas|üres/i, mood: 2 },
  { re: /nagyon rossz|rettenetes|kiégett|katasztrófa|kétségbeesett/i, mood: 1 },
  { re: /nagyon stresszes|ideges|feszült|pánik/i, stress: 9 },
  { re: /stresszes|feszültség|nyomás|aggodalom|szorong/i, stress: 7 },
  { re: /nyugodt|nyugodtan|laza|kimért/i, stress: 3 },
  { re: /kipihent|energikus|teli energiával|friss/i, energy: 9 },
  { re: /fáradt|kimerült|kimerültem|elfáradtam/i, energy: 3 },
  // The six activity names are OUTPUT — they land as tags on the entry — while
  // the patterns around them stay Hungarian, because they match what the reader
  // typed. Round 18 keyed the names and left the patterns alone, which is the
  // distinction the second walk cannot make on its own.
  { re: /futás|futott|tornáztam|edzőterem|túra|kirándultam|bicikli|séta/i, activity: t("voice.activityExercise") },
  { re: /munka|munkát|dolgoztam|meeting|főnök/i, activity: t("voice.activityWork") },
  { re: /család|gyerek|szülő|anya|apa|nagymama|nagypapa/i, activity: t("voice.activityFamily") },
  { re: /barát|barátnő|társas|buli/i, activity: t("voice.activitySocial") },
  { re: /alvás|aludtam|pihen|pihentem/i, activity: t("voice.activityRest") },
  { re: /könyv|olvas|tanul|kurzus|iskola/i, activity: t("voice.activityStudy") },
];

function offlineParse(text: string): Partial<VoiceParseResult> {
  const result: Partial<VoiceParseResult> = {
    mood: null,
    stress: null,
    energy: null,
    sleepHours: null,
    restingHr: null,
    activities: [],
    note: text.slice(0, 200),
  };
  for (const rule of RULES) {
    if (rule.re.test(text)) {
      if (rule.mood !== undefined && result.mood === null) result.mood = rule.mood;
      if (rule.stress !== undefined && result.stress === null) result.stress = rule.stress;
      if (rule.energy !== undefined && result.energy === null) result.energy = rule.energy;
      if (rule.activity) result.activities!.push(rule.activity);
    }
  }
  const sleepMatch = text.match(/(\d+)\s*(?:órát?|h|óra)\s*(?:aludtam|altam)/i);
  if (sleepMatch) result.sleepHours = Number(sleepMatch[1]);
  const hrMatch = text.match(/pulzus(?:om)?\s*:?\s*(\d{2,3})/i);
  if (hrMatch) result.restingHr = Number(hrMatch[1]);
  return result;
}
