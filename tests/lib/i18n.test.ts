/**
 * Mega batch, commit 4 — the staged i18n framework.
 *
 * The framework is deliberately small, so most of these tests are about the
 * three properties that make a partial catalogue safe to ship:
 *
 *  1. IT CANNOT RENDER A BLANK. `t()` falls back twice — the requested locale,
 *     then Hungarian, then the key itself. A missing translation shows
 *     Hungarian; an unknown key shows its own name. Neither is an empty box,
 *     and both are asserted here because that is the whole failure mode.
 *  2. NOTHING READS THE BROWSER YET. `t()` defaults to Hungarian even when
 *     nothing else is wired, because English and German are partial on purpose
 *     and a half-translated card is worse than a Hungarian one. A test that
 *     pinned the default would stop the next batch from quietly turning this on
 *     without noticing.
 *  3. NO CATALOGUE ENTRY IS DEAD. A key nobody looks up is a translation that
 *     was paid for and never seen, and it costs a reviewer's time forever. The
 *     test scans `src/` for a call site per key, so a key that loses its only
 *     usage fails here rather than surviving as furniture.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DEFAULT_LOCALE,
  MESSAGES,
  SUPPORTED_LOCALES,
  hasTranslation,
  isLocale,
  localeCoverage,
  missingKeys,
  resolveLocale,
  t,
  translatedKeys,
  translationKeys,
  type Locale,
  type TranslationKey,
} from "../../src/lib/i18n";
import { clinicalHit, therapeuticClaimHit } from "../../src/lib/articleBlocklist";
import { formalAddressHit } from "../../src/lib/tegezoRule";
import { readFileSync } from "node:fs";
import MeditationPicker from "../../src/components/MeditationPicker";

const KEYS = translationKeys();

/**
 * The locales whose catalogue is finished.
 *
 * NAMED rather than derived, and that is the point: "this language is done" is
 * a decision a reviewer watches change, not a tautology that follows from
 * whatever the file happens to hold. While a translation is in flight the
 * locale is partial, and the two properties below are the ones a partial
 * catalogue has to keep — it makes progress, and it does NOT look finished.
 * Each locale moves here in the commit that finishes it.
 */
const COMPLETE_LOCALES: readonly Locale[] = ["en", "de"];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = `${dir}/${entry}`;
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (path.endsWith(".ts") || path.endsWith(".tsx")) out.push(path);
  }
  return out;
}

const SRC_FILES = walk("src");

/**
 * The strings the clinical-vocabulary sweep cannot judge.
 *
 * `CLINICAL_VOCABULARY` exists so the app's PROSE never reads as medical, and it
 * is aimed at the articles, the meditations and the tip sentences — sentences
 * the app writes ABOUT the reader's state. Every key below is the other thing:
 * the NAME of a feature the reader switches on. A switch that ticks off
 * medication times is called "Gyógyszerek", and renaming it to avoid the word
 * would make it describe something that is not there.
 *
 * The list is small, it is the only place the rule bends, and it is pinned to
 * the one WORD rather than to the keys. The test below compares the sweep's
 * hit against it, so editing any of these to reach for a second banned word
 * fails, and editing the word away fails too — a companion test says so. The
 * other two sweeps, no therapeutic promise and no formal address, still run on
 * every one of them: the allowance buys a noun and nothing else.
 */
const FEATURE_NAME_ALLOWANCE: Readonly<Record<string, string>> = {
  "settings.modules.medsHint": "gyógyszer",
  "today.meds.empty": "gyógyszer",
  "today.meds.nameLabel": "gyógyszer",
  "today.meds.placeholderMore": "gyógyszer",
  // The next three are the SAME feature, and for two years nobody had allowed
  // them: they were not passing the sweep, they were invisible to it. Hungarian
  // capitalises a sentence's first word and every title, so "Gyógyszerek",
  // "Gyógyszer hozzáadva" and "Gyógyszer-emlékeztető" never matched a
  // lowercase-only pattern. That is the whole reason they are listed here rather
  // than trusted: a word list that cannot see its own word is not a stricter
  // list, it is a shorter one. `CLINICAL_VOCABULARY` now carries the `i` flag,
  // and these three are what it found the moment it could look.
  //
  // The allowed fragment is pinned WITH its capital, because `clinicalHit`
  // returns the matched text as written. That is deliberate: it means renaming
  // the word to lowercase fails here rather than passing unnoticed.
  "settings.modules.medsLabel": "Gyógyszer",
  "today.meds.added": "Gyógyszer",
  "today.meds.title": "Gyógyszer",
  // Round 9, `components/MedicationTimesCard.tsx`: the same feature reached
  // through the third file that names it. The rule exists so the app never reads
  // as if it DIAGNOSES or TREATS — a medication timesheet is the app reporting
  // what the reader entered, and the key says the card's name, which is the
  // feature the reader turned on. Two of the three match lowercase and one
  // matches capitalised, exactly like the pair above; the capital is pinned on
  // each so lowercasing the title fails here instead of passing unnoticed.
  "meds.times.title": "Gyógyszer",
  "meds.times.empty": "gyógyszer",
  "meds.times.reminderHint": "gyógyszer",
  // The fifth is a different case and the STRONGEST of them: this is the one
  // line in the app that names a diagnosis in order to say it is not offering
  // one. The rule forbids the app from reading as medical; this sentence is the
  // app declining to. Deleting the word would leave "nem orvosi tanács és nem",
  // which claims the exact thing it exists to disclaim.
  "insights.more.disclaimer": "diagnózis",
  // Round 13, `components/PatternInsightsCard.tsx`: the FIFTH refusal, and the
  // only one that opens by making the distinction the reader is being asked to
  // hold — these are relationships in their own data, not causes. Take the word
  // out and it becomes "these are relationships, not causes. Not medical advice"
  // — a sentence about causation with nothing left to disclaim.
  "insights.patterns.disclaimer": "diagnózis",
  // The same refusal, said twice more. The library says what it is not beside
  // the thing readers click, and the workout card hands the decision to a doctor
  // in the one sentence where a chronic illness is the reason to stop and ask.
  // Both would read as an incomplete thought with the word taken out.
  "tools.library.intro": "diagnózis",
  "tools.workouts.disclaimer": "beteg",
  // The strongest of them, because it is the whole point of the screen: this is
  // the consent a reader gives before turning a clinical questionnaire ON, and
  // what they are agreeing to is precisely that it diagnoses nothing. The
  // sentence exists to decline; take the word out and it stops declining.
  "assessment.consentBody": "diagnózis",
  // The FOURTH refusal to name a diagnosis, and the only one of the four that
  // is a MANDATED WORDING rather than a sentence the app chose to write. Five
  // surfaces render it — the crisis card, the PHQ-8 result, the consent screen,
  // the entry-detail footer and the PDF export — and it opens by naming the
  // thing it refuses to do. Remove the word and what is left is "this is not a
  // …", a sentence denying a category it never named, which is worse than no
  // sentence at all.
  //
  // This entry arrived with the move into the catalogue. Before that the same
  // sentence sat in `lib/assessments.ts`, where the clinical sweep does not
  // look, so it was never on this list — not because it needed no exemption, but
  // because it was in a place the exemption list cannot see. That is the same
  // blind spot the medication capitals had, and it is why this is listed rather
  // than trusted.
  "crisis.disclaimer": "diagnózis",
  // Round 17, `lib/onboarding.ts`: the tracker pill a reader ticks to start
  // logging symptoms. It is the NAME of a feature the reader switches on — the
  // same case as the medication rows above and the reason the word is allowed
  // there — and the alternative is a screen that offers a switch it cannot
  // name. The allowance buys the noun and nothing else: `tünet` is still banned
  // in every other key, and the flag is pinned WITH its capital exactly as
  // `clinicalHit` returns it, so lowercasing the label fails here.
  "onboarding.trackerSymptoms": "Tünet",
  // Round 18, `lib/reportPdf.ts`: the sixth refusal, and the one that travels
  // furthest from the app — it is printed at the foot of the PDF a reader hands
  // to a professional, and it says in one breath whose data the report is and
  // what it is not. It is the same refusal `crisis.disclaimer` makes in the
  // crisis card, worded for the page it lands on rather than copied from the
  // screen, so it is its own key and its own allowance.
  "report.footer": "diagnózis",
};

describe("Hungarian is the default", () => {
  test("it is the declared default, and it is in the supported list", () => {
    expect(DEFAULT_LOCALE).toBe("hu");
    expect(SUPPORTED_LOCALES).toContain(DEFAULT_LOCALE);
    expect(SUPPORTED_LOCALES.length).toBe(3);
  });

  test("a bare lookup is Hungarian", () => {
    // The staged guarantee: nothing here reads navigator.language, so an
    // English browser and a Hungarian one see the same card today.
    expect(t("meditation.title")).toBe("Meditációk");
    expect(t("meditation.title")).toBe(MESSAGES.hu["meditation.title"]);
  });

  test("every key resolves to a non-empty string", () => {
    expect(KEYS.length).toBeGreaterThan(0);
    for (const key of KEYS) {
      expect(t(key), key).not.toBe("");
      expect(t(key), key).toBe(t(key, undefined, DEFAULT_LOCALE));
    }
  });

  test("the key list has no duplicates and covers the catalogue", () => {
    expect(new Set(KEYS).size).toBe(KEYS.length);
    expect(Object.keys(MESSAGES.hu).sort()).toEqual([...KEYS].sort());
  });
});

describe("the other catalogues carry what they claim to, and the fallbacks hold", () => {
  test("each locale defines exactly what its status says it does", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const defined = Object.keys(MESSAGES[locale]).length;
      if (locale === DEFAULT_LOCALE || COMPLETE_LOCALES.includes(locale)) {
        expect(defined, `${locale} is complete`).toBe(KEYS.length);
      } else {
        expect(defined, locale).toBeGreaterThan(0);
        // A locale still being translated must stay visibly partial: a
        // half-translated language that LOOKS finished is the one state the
        // per-key fallback cannot save the reader from.
        expect(defined, `${locale} must stay partial for now`).toBeLessThan(KEYS.length);
      }
    }
  });

  test("every translated value is a non-empty string", () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const [key, value] of Object.entries(MESSAGES[locale])) {
        expect(typeof value, `${locale}.${key}`).toBe("string");
        expect((value as string).trim(), `${locale}.${key}`).toBe(value);
        expect((value as string).length, `${locale}.${key}`).toBeGreaterThan(0);
      }
    }
  });

  test("a key the locale lacks resolves to Hungarian, never to nothing", () => {
    // With complete catalogues no key is missing in normal operation, so the
    // one state that still reaches this fallback is the one it exists for: a
    // key added to `HU` before its translation lands. Removing one for the
    // duration of the test reproduces that state exactly, and restoring it in
    // `finally` leaves the shared catalogue as it was for the files after this
    // one — `bun test` evaluates every file in one process.
    const key = KEYS[0]!;
    const savedEn = MESSAGES.en[key];
    const savedDe = MESSAGES.de[key];
    delete (MESSAGES.en as Record<string, string | undefined>)[key];
    delete (MESSAGES.de as Record<string, string | undefined>)[key];
    try {
      expect(t(key, undefined, "en"), key).toBe(t(key));
      expect(t(key, undefined, "de"), key).toBe(t(key));
    } finally {
      (MESSAGES.en as Record<string, string | undefined>)[key] = savedEn;
      (MESSAGES.de as Record<string, string | undefined>)[key] = savedDe;
    }
    expect(hasTranslation("en", key)).toBe(true);
    expect(hasTranslation("de", key)).toBe(true);
  });

  test("a key the locale does have is actually used", () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const [key, value] of Object.entries(MESSAGES[locale])) {
        expect(t(key as TranslationKey, undefined, locale), `${locale}.${key}`).toBe(value);
      }
    }
  });

  test("an unknown key at runtime returns its own name, not undefined", () => {
    // The compile-time union already forbids this; the cast is here because the
    // failure this guards is a blank box in production, and that one is
    // reachable by a stale bundle or a hand-edited catalogue.
    const bogus = "meditation.nope" as TranslationKey;
    expect(t(bogus)).toBe("meditation.nope");
    expect(t(bogus, undefined, "de")).toBe("meditation.nope");
  });
});

describe("locale resolution", () => {
  test("a base language is matched, whatever the region", () => {
    expect(resolveLocale("hu")).toBe("hu");
    expect(resolveLocale("hu-HU")).toBe("hu");
    expect(resolveLocale("en")).toBe("en");
    expect(resolveLocale("en-GB")).toBe("en");
    expect(resolveLocale("de")).toBe("de");
    expect(resolveLocale("de-AT")).toBe("de");
  });

  test("case and separator do not matter", () => {
    expect(resolveLocale("DE")).toBe("de");
    expect(resolveLocale("de_at")).toBe("de");
    expect(resolveLocale("  en-US  ")).toBe("en");
  });

  test("anything unsupported is Hungarian, including nothing at all", () => {
    expect(resolveLocale("fr")).toBe("hu");
    expect(resolveLocale("xx-YY")).toBe("hu");
    expect(resolveLocale("")).toBe("hu");
    expect(resolveLocale("   ")).toBe("hu");
    expect(resolveLocale(null)).toBe("hu");
    expect(resolveLocale(undefined)).toBe("hu");
  });

  test("the narrowing guard accepts exactly the supported set", () => {
    for (const locale of SUPPORTED_LOCALES) expect(isLocale(locale)).toBe(true);
    for (const other of ["fr", "HU", "", null, 3, undefined]) {
      expect(isLocale(other), String(other)).toBe(false);
    }
  });
});

describe("placeholders", () => {
  test("named values are substituted", () => {
    expect(t("meditation.summary", { minutes: 3, total: "3:00" })).toBe("3 perc · 3:00 összesen");
    expect(t("meditation.remaining", { time: "1:05" })).toBe("Hátralévő: 1:05");
  });

  test("a value nobody supplied is left visible rather than erased", () => {
    // `{total}` becoming "" would produce "3 perc ·  összesen" — a typo that
    // renders as a broken sentence instead of an obviously incomplete one.
    expect(t("meditation.summary", { minutes: 3 })).toBe("3 perc · {total} összesen");
  });

  test("a key with no placeholders ignores the record", () => {
    expect(t("meditation.title", { anything: "x" })).toBe("Meditációk");
  });

  test("the settings page's composed strings carry their numbers and their words", () => {
    // These were template literals inside `SettingsView` until Phase 3 moved
    // them, and a template literal hands every language the Hungarian word
    // order. They are the reason the catalogue has placeholders at all, so they
    // are asserted here — where the placeholders live — rather than left to the
    // view tests to notice by accident.
    expect(t("settings.nav.tabUp", { n: 3, name: "Elemzés" })).toBe("3. Elemzés előre");
    expect(t("settings.nav.tabDown", { n: 3, name: "Elemzés" })).toBe("3. Elemzés hátra");
    expect(t("settings.accessibility.size", { size: "Nagy" })).toBe("Nagy betűméret");
    expect(t("settings.font.summary", { main: "Inter", hand: "Kézírás" })).toBe(
      "Inter · kézírás: Kézírás",
    );
    expect(t("settings.trackers.summary", { on: 2, total: 7 })).toBe("2 / 7 csoport bekapcsolva");
    expect(t("settings.modules.summary", { on: 2 })).toBe("2 / 5 modul bekapcsolva");
    expect(t("settings.data.imported", { count: 4 })).toBe("4 bejegyzés importálva ✅");
    expect(t("settings.data.jsonRestored", { entries: 12 })).toBe(
      "JSON visszatöltve: 12 bejegyzés ✅",
    );
    expect(t("settings.data.jsonRestoredWith", { entries: 12, assessments: 3 })).toBe(
      "JSON visszatöltve: 12 bejegyzés, 3 önértékelés ✅",
    );
  });

  test("round 17 keeps the sentences the five `.ts` modules compose", () => {
    // Round 17's own bug class, and it is the one the sweep cannot see: the
    // food-AI system prompt used to be five literals ending in spaces, and the
    // catalogue rejects a value with a trailing space, so the space moved into
    // the JOIN. Comparing the joined value to the sentence the module used to
    // hold is the only assertion that proves the move changed nothing — the
    // model would happily accept a prompt with two spaces or a missing one.
    expect(
      [
        t("foodAi.promptIntro"),
        t("foodAi.promptSchema"),
        t("foodAi.promptFields"),
        t("foodAi.promptDescription"),
        t("foodAi.promptNotFood"),
      ].join(" "),
    ).toBe(
      "Te egy táplálkozási elemző vagy. A képen egy étkezés látható. " +
        "Válaszolj kizárólag érvényes JSON-nal, ezzel a pontos mezőkészlettel: " +
        '{"calories": szám kcal, "protein": gramm, "carbs": gramm, "fat": gramm, ' +
        '"description": egy rövid magyar mondat arról, hogy mi látszik a képen}. ' +
        "Ha nem élelmiszer látszik, minden szám legyen 0 és a description jelezze ezt.",
    );
    // The macros line and the masked key are both template expressions — the
    // node kind the `.ts` walk cannot read — so they are pinned here as the
    // caller composes them, with the values `analysisToTrackers` and
    // `maskedKey` actually pass.
    expect(t("foodAi.macros", { protein: 28, carbs: 61, fat: 17 })).toBe(
      "Fehérje 28 g · Szénhidrát 61 g · Zsír 17 g",
    );
    expect(t("foodAi.maskedKey", { head: "sk-t", length: 31 })).toBe("sk-t…•••• (31 karakter)");
    // And the dose notification's title is the app's own name plus the pill —
    // not a second copy of the name in a key of its own.
    expect(`${t("app.name")} 💊`).toBe("Belső Iránytű 💊");
  });

  test("the two new surfaces' composed strings carry their numbers too", () => {
    // Same argument as the settings block above, for the same reason: each of
    // these was a template literal in its view until Phase 3 moved it, and a
    // template literal hands every language the Hungarian word order.
    expect(t("today.weeklyNutrition.summary", { days: 4, avg: 2100 })).toBe(
      "4 nap a héten, átlag 2100 kcal.",
    );
    expect(t("today.meds.nextDose", { time: "08:00", name: "D-vitamin" })).toBe(
      "Következő adag: 08:00 · D-vitamin",
    );
    expect(t("today.meds.nextDoseWithAmount", { time: "08:00", name: "D-vitamin", amount: "1 tabletta" })).toBe(
      "Következő adag: 08:00 · D-vitamin — 1 tabletta",
    );
    expect(t("journal.streak", { streak: 6 })).toBe("6 napos sorozat");
    expect(t("journal.results", { found: 3, total: 7 })).toBe("3 találat a(z) 7 bejegyzésből.");
    expect(t("journal.dayWithMood", { date: "2026. 10. 03.", mood: "Jó" })).toBe(
      "2026. 10. 03.: Jó",
    );
    expect(t("journal.dayEmpty", { date: "2026. 10. 03." })).toBe("2026. 10. 03.: nincs bejegyzés");
    expect(t("insights.correlation.row", { count: 4, avg: 4.2 })).toBe(
      "4 nap · átlag hangulat 4.2",
    );
    expect(t("insights.correlation.ariaUp", { delta: 0.7 })).toBe(
      "Átlagosan 0.7 ponttal jobb hangulat",
    );
    expect(t("insights.correlation.ariaDown", { delta: 0.7 })).toBe(
      "Átlagosan 0.7 ponttal rosszabb hangulat",
    );
  });

  test("rounds 12 and 13 compose to the sentences the page shipped", () => {
    // This exists because of a bug it caught, not as a summary of the rounds.
    // `quadrants.emotion.row` ends in `({percent}%)` — the `%` belongs to the
    // KEY — and the component was passing `${row.percent}%`, which renders
    // "60%%". Every other assertion in the suite passed: the key was used, the
    // source had no raw literal left, the sweep guard was green. A string that
    // is only ever assembled at runtime is checked by asserting the assembly.
    //
    // So: one expectation per composed string, with the values the caller
    // actually passes. Both branches of the sign, because `delta` is where the
    // two branches disagree.
    expect(
      t("quadrants.emotion.row", {
        emotion: "Öröm",
        context: "munkában",
        together: 3,
        days: 5,
        percent: 60,
      }),
    ).toBe("Öröm — munkában társaságában 3/5 napon (60%)");
    expect(t("quadrants.sleep.hours", { hours: 6.5 })).toBe("6.5 óra");
    expect(t("quadrants.sleep.delta", { sign: "+", delta: 4 })).toBe("(+4 a többihez képest)");
    expect(t("quadrants.sleep.delta", { sign: "", delta: 4 })).toBe("(4 a többihez képest)");
    expect(t("insights.patterns.count", { count: 3 })).toBe("3 mintázat");
    expect(t("insights.patterns.sample", { count: 7 })).toBe("7 nap alapján");
    expect(t("insights.patterns.basis", { count: 14 })).toBe(
      "A teljes naplódból, 14 bejegyzésből számítva — nem az above időszakból.",
    );
    expect(t("insights.grid.summary", { rows: 3, cols: 2 })).toBe(
      "3 tevékenység × 2 mérhető eredmény",
    );
    expect(t("insights.grid.tooFewSamples", { min: 2 })).toBe("Kevesebb mint 2 adat");
    expect(t("insights.grid.flat", { count: 7 })).toBe("Nincs érdemi különbség (7 nap)");
    // "e nélkül" is inside the key because it case-agrees with `{effect}`.
    expect(
      t("insights.grid.cellEffect", {
        label: "Alvás",
        delta: 4,
        effect: "ponttal jobb",
        count: 7,
      }),
    ).toBe("Alvás: 4 ponttal jobb e nélkül (7 nap)");
    expect(t("background.percent", { value: 55 })).toBe("55 százalék");
    expect(t("weather.probeCached", { value: "napsütéses, 18 °C" })).toBe(
      "Mai adat a gyorsítótárból: napsütéses, 18 °C.",
    );
    expect(t("weather.probeFresh", { value: "napsütéses, 18 °C" })).toBe(
      "Mai adat: napsütéses, 18 °C.",
    );
    expect(t("reminder.inHoursMinutes", { h: 1, m: 7 })).toBe("kb. 1 óra 7 perc");
    expect(t("reminder.inMinutes", { m: 7 })).toBe("kb. 7 perc");
    expect(t("reminder.nextAt", { when: "kb. 7 perc", time: "20:00" })).toBe(
      "Következő emlékeztető: kb. 7 perc (20:00)",
    );
    expect(t("app.greetingNamed", { part: "Jó reggelt", name: "Peti" })).toBe("Jó reggelt, Peti!");
    expect(t("app.greetingAnonymous", { part: "Szép napot" })).toBe("Szép napot!");
    expect(t("app.streakChip", { count: 7 })).toBe("7 nap");
    expect(t("stats.summary", { period: "2026. október", count: 12 })).toBe(
      "2026. október · 12 naplózott nap",
    );
    expect(t("stats.yearAvgMood", { year: 2026 })).toBe("2026 éves átlag hangulat");
    expect(t("stats.yearDaysTotal", { year: 2026 })).toBe("2026 naplózott nap összesen");
    expect(t("yearInPixels.gridLabel", { month: "2026. október" })).toBe(
      "2026. október hangulat-naptár",
    );
    expect(t("achievements.summary", { earned: 3, total: 27 })).toBe("3 / 27 kitüntetés");
    expect(t("achievements.keepGoing", { earned: 3 })).toBe(
      "3 kitüntetés megszerezve — folytasd, még több van!",
    );
  });

  test("the app's own name exists once, and the credential request agrees", () => {
    // Round 14 moved the header's "BelsőIranytű" into the catalogue, which
    // left the app's own name in two keys — the header and the WebAuthn
    // relying-party name. Two copies of the product's name is exactly the
    // drift a catalogue is supposed to stop, and it is invisible to every
    // guard that checks one key at a time.
    expect(t("app.name")).toBe("Belső Iránytű");
    expect(t("app.name")).toBe(t("backup.passkeyRpName"));
  });

  test("and the call sites pass the values those sentences assume", () => {
    // The expectations above pin the CATALOGUE. They cannot see the caller, and
    // the caller is where "60%%" happened: the key was used, the raw string was
    // gone, and every other guard was green. So the wiring is asserted here —
    // which is the same reason `batch7f` reads its copy out of the component.
    const quadrants = readFileSync(
      new URL("../../src/components/QuadrantInsightCards.tsx", import.meta.url),
      "utf8",
    );
    // `%` is the key's, not the caller's.
    expect(quadrants).toContain('percent: row.percent ?? "",');
    expect(quadrants).not.toContain("percent: `${row.percent}%`");
    expect(quadrants).toContain("together: row.together,");
    expect(quadrants).toContain("days: row.emotionDays,");
    // And the sign is a value the key interpolates, not a character glued on
    // here — `(+4 …)` and `(4 …)` are both reachable only if `sign` is passed.
    expect(quadrants).toContain('sign: row.delta > 0 ? "+" : ""');

    const grid = readFileSync(
      new URL("../../src/components/CorrelationGrid.tsx", import.meta.url),
      "utf8",
    );
    // "e nélkül" must never reappear in the component: it lives in the key,
    // because it case-agrees with `{effect}`.
    expect(grid).not.toContain("nélkül");
    expect(grid).toContain("effect,");
    expect(grid).toContain("delta: Math.abs(d),");
  });

  test("the weather line has four shapes, not one with a hole in it", () => {
    // The shipped text appended " (12 °C)" only when a temperature came back,
    // and ended the sentence either way. A single `{temp}` placeholder that is
    // sometimes empty would render "Időjárás betöltve ( °C)." — a reading that
    // claims a temperature rather than reporting its absence.
    expect(t("today.weather.live")).toBe("Időjárás betöltve.");
    expect(t("today.weather.liveTemp", { temp: 12 })).toBe("Időjárás betöltve (12 °C).");
    expect(t("today.weather.cached")).toBe("Időjárás a gyorsítótárból töltve.");
    expect(t("today.weather.cachedTemp", { temp: 12 })).toBe(
      "Időjárás a gyorsítótárból töltve (12 °C).",
    );
  });

  test("the voice note's two clauses join into the sentence the page shipped", () => {
    // Why this is pinned here rather than left to a render: `Collapsible` draws
    // its body only while it is open, and nothing opens it for the server
    // render, so a whole-page markup comparison never reaches this sentence.
    // It is the one place the settings page composes copy out of two keys, and
    // composition is exactly where a moved string goes quietly wrong.
    const note = (llm: boolean) =>
      `${t("settings.voice.note")} ${
        llm ? t("settings.voice.noteLlm") : t("settings.voice.noteOffline")
      }`;
    expect(note(true)).toBe(
      "Beszéld el a napod, és az app kinyeri belőle a hangulatot, stresszt, energiát és a tevékenységeket. A felismerés mesterséges intelligenciával történik.",
    );
    expect(note(false)).toBe(
      "Beszéld el a napod, és az app kinyeri belőle a hangulatot, stresszt, energiát és a tevékenységeket. Kulcs nélkül egyszerű, offline szövegelemzést használ.",
    );
  });
});

/**
 * The ONE string in the extracted views the no-Hungarian sweep cannot judge,
 * named rather than waved through.
 *
 * `dataKey="Alvás"` is a `recharts` key into the `chartData` object — the same
 * kind of thing as the `Hangulat`, `Stressz` and `Energia` keys beside it,
 * which the sweep cannot even SEE because those are written as object property
 * names. The chart draws no legend, so no reader ever sees any of them, and
 * translating one would mean translating a property name the library reads. It
 * is data wearing a Hungarian coat, and it gets the same treatment as the
 * medication allowance above: named, pinned, and asserted to still be there.
 */
const DATA_KEY_ALLOWANCE: Readonly<Record<string, string>> = {
  "src/views/InsightsView.tsx": "Alvás",
};

describe("the catalogue is not furniture", () => {
  test("every key has a call site in src", () => {
    const corpus = SRC_FILES.map((f) => readFileSync(f, "utf8")).join("\n");
    for (const key of KEYS) {
      expect(corpus.includes(`t("${key}"`), `${key} has no call site`).toBe(true);
    }
  });

  test("the extracted views carry no Hungarian of their own", () => {
    // The scan above proves every key is USED. This proves the other
    // direction: the views Phase 3 went through hold no copy of their own, so
    // the next person to add a label to one of them cannot slip past the
    // catalogue — which is the only way this work keeps being worth anything
    // once the diff stops being reviewed.
    //
    // Crude on purpose: any quoted run carrying a Hungarian accented vowel is
    // a finding, apart from the one data key named above. These have no
    // legitimate literals left — their registries (`lib/mood`, `lib/dates`,
    // `lib/trackers`, `lib/themes`, `lib/iconsets`, `lib/fonts`, `lib/quadrant`,
    // `lib/education`, `lib/onboarding`, the workout PROGRAMS and
    // `SOURCE_ATTRIBUTION`) live elsewhere, and the " · " and " — " they join
    // with are punctuation.
    //
    // WorkoutPrograms and ExperimentCard are NOT in this list, and the reason is
    // written down rather than left to be rediscovered: one keeps 76 lines of
    // program content inline, the other writes two notes into storage that
    // nothing reads back. Both are argued in their own files.
    const HUNGARIAN_VOWEL = /[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/;
    for (const file of [
      "src/views/SettingsView.tsx",
      "src/views/TodayView.tsx",
      // Batch 14 split the toolbox out of the Ma fül into a tab of its own;
      // the new view is a catalogue caller like every other one here.
      "src/views/ToolsView.tsx",
      "src/views/JournalView.tsx",
      "src/views/InsightsView.tsx",
      "src/components/CustomActivityManager.tsx",
      "src/components/BreathingExercise.tsx",
      "src/components/HabitStreaks.tsx",
      "src/components/CbtForm.tsx",
      "src/components/EducationLibraryCard.tsx",
      "src/components/GratitudeJournal.tsx",
      "src/components/FoodPhotoCapture.tsx",
      "src/components/OnboardingFlow.tsx",
      "src/components/AssessmentModule.tsx",
      "src/components/AssessmentConsent.tsx",
      "src/components/AssessmentItemView.tsx",
      "src/components/AssessmentLog.tsx",
      "src/components/AssessmentResult.tsx",
      "src/components/AssessmentRunner.tsx",
      // Batch 14's check-in is on the same footing as the questionnaire it
      // sits beside, and it is on this list for the reason the sweep exists:
      // its seven items and four bands are content the MODULE owns, imported
      // rather than spelled here, and every sentence it draws itself is a
      // catalogue key. A quoted Hungarian line in this file would be a second
      // copy of something a reader will see twice.
      "src/components/Gad7Card.tsx",
      "src/components/BackupSettingsCard.tsx",
      "src/components/CrisisCard.tsx",
    ]) {
      const src = readFileSync(file, "utf8")
        .replace(/\/\*(?=[ \t*])[\s\S]*?\*\//g, " ")
        .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
      const found = [...src.matchAll(/(["'`])((?:\\.|(?!\1)[^\\])*)\1/g)]
        .map((m) => m[2] as string)
        .filter((v) => HUNGARIAN_VOWEL.test(v) && v !== DATA_KEY_ALLOWANCE[file]);
      expect(found, file).toEqual([]);
    }
  });

  test("the data-key allowance still has a reason to exist", () => {
    // Otherwise the one exception quietly becomes a habit and the sweep stops
    // meaning anything on this file.
    for (const [file, allowed] of Object.entries(DATA_KEY_ALLOWANCE)) {
      const src = readFileSync(file, "utf8");
      expect(src.includes(`dataKey="${allowed}"`), `${file}: ${allowed}`).toBe(true);
    }
  });

  test("the sweeps see a word that opens a sentence", () => {
    // The bug this pins: Hungarian capitalises the first word of a sentence and
    // every title, label and heading, so a case-sensitive word list is blind in
    // exactly the places a reader looks hardest. It passed for two years —
    // "Gyógyszerek", "Gyógyszer hozzáadva" and "Gyógyszer-emlékeztető" were
    // never on the allowance, because no sweep had ever reported them.
    //
    // Asserted on the DETECTOR, not on the catalogue, so the test still means
    // something if the next edit changes which strings carry the word.
    for (const word of ["diagnózis", "beteg", "gyógyszer", "kezelés", "tünet"]) {
      for (const form of [word, word[0]!.toUpperCase() + word.slice(1), word.toUpperCase()]) {
        expect(clinicalHit(form), `clinical: ${form}`).not.toBeNull();
      }
    }
    for (const promise of ["gyógyítja a szorongásod", "Gyógyítja a szorongásod"]) {
      expect(therapeuticClaimHit(promise), `promise: ${promise}`).not.toBeNull();
    }
  });

  test("the reader-facing words obey the repo's own rules", () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const [key, value] of Object.entries(MESSAGES[locale])) {
        // The rules are Hungarian sweeps, so they bite where they can: the
        // default catalogue is what every reader sees today.
        if (locale !== DEFAULT_LOCALE) continue;
        // Compared rather than skipped: an unlisted key is held to null, and a
        // listed one to the exact word the allowance names. A blanket exemption
        // would let the next edit reach for a second banned word unnoticed.
        expect(clinicalHit(value as string), key).toBe(FEATURE_NAME_ALLOWANCE[key] ?? null);
        expect(therapeuticClaimHit(value as string), key).toBeNull();
        expect(formalAddressHit(value as string), key).toBeNull();
      }
    }
  });

  test("every allowance is still needed, so none can rot into a habit", () => {
    // If the word is ever edited out of the hint, this fails and the allowance
    // goes with it — rather than sitting in the file looking deliberate and
    // quietly widening the next key somebody adds to the table.
    const stillNeeded = Object.keys(FEATURE_NAME_ALLOWANCE).filter(
      (key) => clinicalHit(MESSAGES.hu[key as TranslationKey] as string) !== null,
    );
    expect(stillNeeded.sort()).toEqual(Object.keys(FEATURE_NAME_ALLOWANCE).sort());
  });
});

describe("coverage is a measurement, not a claim", () => {
  test("the two lists partition the catalogue exactly", () => {
    // The property that makes the work queue trustworthy: if `missing` and
    // `translated` ever overlapped or lost a key between them, a translator
    // following the queue would skip a string without being told.
    for (const locale of SUPPORTED_LOCALES) {
      const have = translatedKeys(locale);
      const lack = missingKeys(locale);
      expect(have.length + lack.length, `${locale}: sizes`).toBe(KEYS.length);
      expect(new Set([...have, ...lack]).size, `${locale}: overlaps`).toBe(KEYS.length);
      expect([...have, ...lack].sort(), `${locale}: same keys`).toEqual([...KEYS].sort());
    }
  });

  test("every key listed as missing really is missing, and every one listed as translated really resolves", () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const key of missingKeys(locale)) {
        expect(hasTranslation(locale, key), `${locale}: ${key} is listed as missing`).toBe(false);
        // And the promise the whole design rests on: it still renders Hungarian.
        expect(t(key, undefined, locale), `${locale}: ${key} falls back`).toBe(t(key));
      }
      for (const key of translatedKeys(locale)) {
        expect(hasTranslation(locale, key), `${locale}: ${key} is listed as translated`).toBe(true);
      }
    }
  });

  test("completeness is reported honestly for every locale", () => {
    // If the default ever stopped being complete, `t()`'s last real fallback
    // would be gone and a missing key would render as its own dotted name.
    expect(localeCoverage(DEFAULT_LOCALE).complete, DEFAULT_LOCALE).toBe(true);
    expect(missingKeys(DEFAULT_LOCALE)).toEqual([]);
    // And the others: a locale listed as complete owes nothing, and one still
    // in flight has to say so. `translatedKeys` and `missingKeys` partition
    // the catalogue either way — the test above already proves that — so the
    // question here is only which half is empty.
    for (const locale of SUPPORTED_LOCALES.filter((l) => l !== DEFAULT_LOCALE)) {
      expect(translatedKeys(locale).length, `${locale} should have made progress`).toBeGreaterThan(0);
      if (COMPLETE_LOCALES.includes(locale)) {
        expect(localeCoverage(locale).complete, `${locale} is complete`).toBe(true);
        expect(missingKeys(locale), `${locale} owes nothing`).toEqual([]);
      } else {
        expect(localeCoverage(locale).complete, `${locale} must stay partial for now`).toBe(false);
        expect(missingKeys(locale).length, `${locale} still owes keys`).toBeGreaterThan(0);
      }
    }
  });

  test("the counts agree with the catalogues they describe", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const { translated, total, complete } = localeCoverage(locale);
      expect(translated, `${locale}: translated count`).toBe(Object.keys(MESSAGES[locale]).length);
      expect(total, `${locale}: total`).toBe(KEYS.length);
      expect(complete, `${locale}: complete flag`).toBe(translated === total);
    }
  });

  test("an unsupported locale is a type error, not a runtime surprise", () => {
    // `localeCoverage` is typed on `Locale`, so a locale that is not in
    // `SUPPORTED_LOCALES` cannot reach it without a cast. This asserts the
    // cast would not help, which is the property that makes the type worth
    // having: an unknown locale reads as zero translated rather than throwing.
    const bogus = "fr" as Locale;
    expect(localeCoverage(bogus)).toEqual({ translated: 0, total: KEYS.length, complete: false });
    expect(missingKeys(bogus)).toEqual(KEYS);
  });
});

describe("no regression", () => {
  test("the card still renders the same Hungarian words", () => {
    const out = renderToStaticMarkup(createElement(MeditationPicker));
    for (const locale of SUPPORTED_LOCALES) {
      if (locale === DEFAULT_LOCALE) continue;
      // Nothing from a partial catalogue may leak into a Hungarian render.
      for (const [key, value] of Object.entries(MESSAGES[locale])) {
        if (MESSAGES.hu[key as TranslationKey] === value) continue;
        expect(out.includes(value as string), `${value} leaked`).toBe(false);
      }
    }
  });

  test("the title, the group label and the start button all still read correctly", () => {
    const out = renderToStaticMarkup(createElement(MeditationPicker));
    expect(out.includes("Meditációk")).toBe(true);
    expect(out.includes('aria-label="Gyakorlat"')).toBe(true);
    expect(out.includes("Indítás")).toBe(true);
    expect(out.includes("3 perc · 3:00 összesen")).toBe(true);
  });
});