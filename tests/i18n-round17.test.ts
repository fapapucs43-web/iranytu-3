/**
 * Round 17's sweep of five `.ts` modules, pinned as a contract.
 *
 * THE ROUND'S SHAPE, AND WHY IT IS FIVE FILES AND ONE TEST
 * The `.tsx` sweep finished at round 16, and the second walk in
 * `docs/i18n-sweep-list.md` named eighteen modules still holding copy that no
 * round had claimed. This round is the five the audit named by hand:
 * `weather.ts` (the GPS place label), `notifications.ts` (the three reminder
 * messages and two notification titles), `foodAi.ts` (the model prompt, its one
 * user message, the macros line, the masked-key line and six failures),
 * `healthImport/merge.ts` (the four series names the preview prints) and
 * `onboarding.ts` (the four tracker pills). Twenty-eight strings moved and
 * became twenty-six keys — the two notification titles are one key already in
 * the catalogue (`app.name`) plus an emoji — and the walk counted 25 of the 28,
 * because the macros line, the masked-key line and `Vitaminok` are a template
 * expression and a word with no accented letter.
 *
 * WHY THE CONTRACTS ARE PER-VALUE HERE AND PER-KEY IN `fonts-i18n`
 * Round 16 resolved its values into an exported registry, so that test could
 * compare the REGISTRY against the catalogue. This round had to preserve three
 * shapes it does not own: `REMINDER_MESSAGES` is what `ReminderCard` renders
 * AND what `saveReminderMessage` stores, so it has to stay a list of the
 * sentences themselves; `ImportPreviewRow.label` is a plain string the card
 * renders outside every key and `tests/batch9.test.ts` finds its rows by; and
 * `ONBOARDING_TRACKER_CHOICES` is rendered as `t.label` by the flow. So the pins
 * here are on the EXPORTS — the same values the components and the older tests
 * read — rather than on a new shape invented for the round.
 *
 * THE FIVE CLAIMS, EACH FALSIFIABLE ALONE
 *  1. every key the five files reach through `t()` exists — a miss renders the
 *     key itself as visible copy;
 *  2. every key this round added is reached by one of the five files — the
 *     catalogue's dead-key test reads `src/` as a whole, and this says which
 *     round put the key there;
 *  3. every exported value is byte-identical to the catalogue value it came
 *     from — the reminder list, the pills, the preview labels, the six failure
 *     sentences, the macros line;
 *  4. the composed sentences still compose — the system prompt is asserted as
 *     the JOINED sentence, because the spaces moved out of the values;
 *  5. no string in any of the five files carries a Hungarian accented
 *     character — the shape of a revert, comments excluded.
 *
 * NO jsdom and no rendering: the two module-scope records resolve at import
 * time from `t()`, so asserting on them is asserting on what the card shows.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { analysisToTrackers, failureMessage, type FoodAiFailure } from "../src/lib/foodAi";
import { previewImport } from "../src/lib/healthImport/merge";
import type { HealthImportResult } from "../src/lib/healthImport/types";
import { t, translationKeys, type TranslationKey } from "../src/lib/i18n";
import { REMINDER_MESSAGES } from "../src/lib/notifications";
import { ONBOARDING_TRACKER_CHOICES } from "../src/lib/onboarding";

const FILES = [
  "src/lib/weather.ts",
  "src/lib/notifications.ts",
  "src/lib/foodAi.ts",
  "src/lib/healthImport/merge.ts",
  "src/lib/onboarding.ts",
] as const;

const sources = new Map<string, string>(
  FILES.map((f) => [f, readFileSync(new URL(`../${f}`, import.meta.url), "utf8")]),
);

/** Every key the five files reach, as written — `t("x")` and `t("x", …)` alike. */
const usedKeys = new Set<string>();
for (const src of sources.values()) {
  for (const m of src.matchAll(/(?<=[^a-zA-Z_$])t\("([^"]+)"[,)]/g)) usedKeys.add(m[1]!);
}

/** The keys this round added, pinned as a list rather than counted. */
const ROUND_KEYS = [
  "weather.placeGps",
  "reminder.messageMood",
  "reminder.messageRecord",
  "reminder.messageTwoMinutes",
  "foodAi.promptIntro",
  "foodAi.promptSchema",
  "foodAi.promptFields",
  "foodAi.promptDescription",
  "foodAi.promptNotFood",
  "foodAi.promptQuestion",
  "foodAi.macros",
  "foodAi.maskedKey",
  "foodAi.errorNoKey",
  "foodAi.errorInvalidKey",
  "foodAi.errorRateLimited",
  "foodAi.errorTimeout",
  "foodAi.errorNetwork",
  "foodAi.errorBadResponse",
  "healthImport.seriesHr",
  "healthImport.seriesSpo2",
  "healthImport.seriesSleep",
  "healthImport.seriesSteps",
  "onboarding.trackerSleep",
  "onboarding.trackerSymptoms",
  "onboarding.trackerVitamins",
  "onboarding.trackerWeather",
] as const;

/** Comments out, then every quoted run — all three quote kinds — in order. */
function stringsIn(source: string): string[] {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
  const out: string[] = [];
  let i = 0;
  while (i < code.length) {
    const ch = code[i]!;
    if (ch !== '"' && ch !== "'" && ch !== "`") {
      i++;
      continue;
    }
    let text = "";
    i++;
    while (i < code.length && code[i] !== ch) {
      if (code[i] === "\\") {
        text += code[i + 1] ?? "";
        i += 2;
        continue;
      }
      text += code[i];
      i++;
    }
    i++; // closing quote
    out.push(text);
  }
  return out;
}

const bareResult: HealthImportResult = {
  source: "apple",
  recordsSeen: 0,
  hr: [],
  spo2: [],
  steps: {},
  sleep: {},
  workouts: [],
};

describe("round 17 — the key set is closed in both directions", () => {
  test("the catalogue holds all twenty-six round-17 keys", () => {
    const keys = translationKeys();
    const missing = ROUND_KEYS.filter((k) => !keys.includes(k as never));
    expect(missing, `not in the catalogue: ${missing.join(", ")}`).toEqual([]);
    // A floor, not a ceiling: a round that grew would grow this list, which is
    // the point of pinning names rather than a count. 26 is 28 moved strings
    // minus the two notification titles, which share the existing `app.name`.
    expect(ROUND_KEYS.length).toBe(26);
  });

  test("every key the five files use exists — no silent key fallback", () => {
    const keys = translationKeys();
    const unknown = [...usedKeys].filter((k) => !keys.includes(k as never));
    expect(unknown, `t() would render these keys literally: ${unknown.join(", ")}`).toEqual([]);
  });

  test("every round-17 key is reached by one of the five files — no furniture", () => {
    const dead = ROUND_KEYS.filter((k) => !usedKeys.has(k));
    expect(dead, `keys no module reaches: ${dead.join(", ")}`).toEqual([]);
  });
});

describe("round 17 — what the modules export is what the catalogue holds", () => {
  test("the three reminder messages are the catalogue values, in order", () => {
    // `saveReminderMessage` stores one of these strings and
    // `loadReminderMessage` accepts one back, so this list is a STORED format
    // as much as a display one; the order is the order the pills render in.
    expect(REMINDER_MESSAGES).toEqual([
      t("reminder.messageMood"),
      t("reminder.messageRecord"),
      t("reminder.messageTwoMinutes"),
    ]);
  });

  test("the four onboarding pills carry the catalogue's labels", () => {
    expect(ONBOARDING_TRACKER_CHOICES.map((c) => [c.id, c.label])).toEqual([
      ["sleep", t("onboarding.trackerSleep")],
      ["symptoms", t("onboarding.trackerSymptoms")],
      ["vitamins", t("onboarding.trackerVitamins")],
      ["weather", t("onboarding.trackerWeather")],
    ]);
  });

  test("the health preview prints the catalogue's series names, in order", () => {
    // `[]` for entries and for enabled trackers: the labels exist before any
    // data does, which is exactly when a reader reads them.
    //
    // The HRV row joined in phase 3 and is the one label here that is NOT a
    // catalogue value: `HRV` and `ms` are the same in every supported
    // language, and minting a key would have handed a fourth language an
    // untranslated unit. It sits second, after pulse, because that is the
    // order of the watch series the import writes.
    const rows = previewImport(bareResult, [], []).rows;
    expect(rows.map((r) => r.label)).toEqual([
      t("healthImport.seriesHr"),
      "HRV (ms)",
      t("healthImport.seriesSpo2"),
      t("healthImport.seriesSleep"),
      t("healthImport.seriesSteps"),
    ]);
  });

  test("all six failure sentences are catalogue values, one per reason", () => {
    const expected: Record<FoodAiFailure, TranslationKey> = {
      "no-key": "foodAi.errorNoKey",
      "invalid-key": "foodAi.errorInvalidKey",
      "rate-limited": "foodAi.errorRateLimited",
      timeout: "foodAi.errorTimeout",
      network: "foodAi.errorNetwork",
      "bad-response": "foodAi.errorBadResponse",
    };
    for (const [reason, key] of Object.entries(expected) as Array<[FoodAiFailure, TranslationKey]>) {
      expect(failureMessage(reason), reason).toBe(t(key));
    }
  });

  test("the macros line the tracker note carries is the catalogue value", () => {
    const trackers = analysisToTrackers({
      calories: 520.4,
      protein: 28.2,
      carbs: 61.3,
      fat: 17.1,
      description: "Csirkemell rizzsel.",
    });
    const note = trackers["nutrition-note"];
    expect(note && note.kind === "text" ? note.value : "").toBe(
      `Csirkemell rizzsel. (${t("foodAi.macros", { protein: 28, carbs: 61, fat: 17 })})`,
    );
  });
});

describe("round 17 — the sentences still compose, and the sweep cannot be reverted", () => {
  test("the system prompt is the joined sentence, byte for byte", () => {
    // The five values are stored trimmed and joined with one space, so what the
    // model reads is only correct if the join is right. Asserted as the whole
    // sentence rather than as five lookups: a doubled or missing space is
    // invisible per-value and would change the prompt the model answers to.
    const prompt = [
      t("foodAi.promptIntro"),
      t("foodAi.promptSchema"),
      t("foodAi.promptFields"),
      t("foodAi.promptDescription"),
      t("foodAi.promptNotFood"),
    ].join(" ");
    expect(prompt).toBe(
      "Te egy táplálkozási elemző vagy. A képen egy étkezés látható. " +
        "Válaszolj kizárólag érvényes JSON-nal, ezzel a pontos mezőkészlettel: " +
        '{"calories": szám kcal, "protein": gramm, "carbs": gramm, "fat": gramm, ' +
        '"description": egy rövid magyar mondat arról, hogy mi látszik a képen}. ' +
        "Ha nem élelmiszer látszik, minden szám legyen 0 és a description jelezze ezt.",
    );
    expect(prompt).not.toContain("  ");
  });

  test("the notification title is the app's own name, not a second copy of it", () => {
    const notifications = sources.get("src/lib/notifications.ts")!;
    expect(notifications).toContain('new Notification(t("app.name")');
    expect(notifications).toContain('new Notification(`${t("app.name")} 💊`');
  });

  test("the two values the walk cannot see are keyed anyway", () => {
    // A template expression is not a node the measurement reads, so these two
    // would have stayed Hungarian through any number of green regenerations.
    const foodAi = sources.get("src/lib/foodAi.ts")!;
    expect(foodAi).toContain('t("foodAi.macros"');
    expect(foodAi).toContain('t("foodAi.maskedKey"');
    // The unaccented pill: `Vitaminok` carries no letter the sweep looks for.
    expect(sources.get("src/lib/onboarding.ts")).toContain('t("onboarding.trackerVitamins")');
  });

  test("no string in the five files carries a Hungarian accented character", () => {
    // Comments are stripped first: these files argue their decisions in prose
    // that quotes Hungarian on purpose and is read by nobody's screen. What is
    // left is code, and code that renders copy goes through the catalogue.
    const offenders: string[] = [];
    const ACCENTED = /[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/;
    for (const [file, src] of sources) {
      for (const text of stringsIn(src)) {
        if (ACCENTED.test(text)) offenders.push(`${file}: ${JSON.stringify(text)}`);
      }
    }
    expect(offenders, `raw Hungarian strings: ${offenders.join(" | ")}`).toEqual([]);
  });
});
