/**
 * Round 18's sweep of the second walk, pinned as a contract.
 *
 * THE ROUND, AND WHY IT IS THIRTEEN FILES AND NOT TWELVE
 * `docs/i18n-sweep-list.md`'s second walk measures what Hungarian text a `.ts`
 * module holds at all, and classifies each module by a decision written into
 * `scripts/extract-raw-strings.mjs`. Round 17 took the five the audit named by
 * hand. Round 18 takes the thirteen the table still marked `chrome — a round is
 * owed` — and twelve of them moved copy. The thirteenth, `lib/csv.ts`, turned
 * out to be the OTHER family: its six Hungarian strings are the header aliases
 * the CSV importer MATCHES on, so they are ids and translating one would stop a
 * file the app itself exported from being read back. It moved family, not
 * string, and the third block below is the pin for that decision.
 *
 * WHY THE PINS ARE ON EXPORTS AND ON COMPOSED SENTENCES
 * Nine of these modules resolve their copy at module scope, so there is nothing
 * to render and nothing to wait for: `FIT_CHOICES` IS what the picker draws the
 * moment it imports the module, and asserting on it is asserting on the screen.
 * The sentences are a different shape — `personalInsights` composes its numbers
 * into the value at call time — so those are asserted as the WHOLE sentence with
 * a real number in it, because a placeholder that never resolves and a sentence
 * that silently dropped its clause are both invisible per-key.
 *
 * THE SIX CLAIMS, EACH FALSIFIABLE ALONE
 *  1. every key this round added exists in the catalogue, and there are 81;
 *  2. every key the thirteen files reach through `t()` exists — a miss renders
 *     the key itself as visible copy;
 *  3. every round-18 key is reached by one of the thirteen files — the
 *     catalogue's dead-key test reads `src/` as a whole, and this says which
 *     round put the key there;
 *  4. every exported registry is the catalogue's value, byte for byte;
 *  5. the composed sentences still compose — the whole sentence, with numbers;
 *  6. no string in the twelve swept files carries a Hungarian accented
 *     character, and `lib/csv.ts`'s six do — all of them inside an `idx(…)`
 *     alias list, which is the property that makes them ids.
 *
 * NO jsdom and no rendering: `lib/reportPdf` is not imported here at all (it
 * pulls jsPDF), so the report's twenty-one keys are pinned through the
 * catalogue and their call sites are pinned by `tests/batch7h.test.ts`.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { personalInsights } from "../src/lib/analysis";
import { PIN_MAX, PIN_MIN, setPin, verifyPin } from "../src/lib/appLock";
import { BACKUP_DUE_NOTE } from "../src/lib/backupDaemon";
import { NO_DATA_SUMMARY } from "../src/lib/cardStates";
import { BUILT_IN_OUTCOMES } from "../src/lib/correlationGrid";
import { WEEKDAYS_SHORT } from "../src/lib/dates";
import { t, translationKeys, type TranslationKey } from "../src/lib/i18n";
import { FIT_CHOICES, PALETTE_CHOICES } from "../src/lib/imageBackground";
import { moodByLevel } from "../src/lib/mood";
import { MONTH_ABBREVIATIONS } from "../src/lib/yearInPixels";
import type { Entry } from "../src/types";

const FILES = [
  "src/lib/imageBackground.ts",
  "src/lib/voice.ts",
  "src/lib/reportPdf.ts",
  "src/lib/dates.ts",
  "src/lib/yearInPixels.ts",
  "src/lib/correlationGrid.ts",
  "src/lib/attachments.ts",
  "src/lib/analysis.ts",
  "src/lib/appLock.ts",
  "src/lib/backupDaemon.ts",
  "src/lib/backupStorage.ts",
  "src/lib/cardStates.ts",
  "src/lib/csv.ts",
] as const;

/** The twelve that moved copy. `lib/csv.ts` is the thirteenth and is not here. */
const SWEPT_FILES = FILES.filter((f) => f !== "src/lib/csv.ts");

const sources = new Map<string, string>(
  FILES.map((f) => [f, readFileSync(new URL(`../${f}`, import.meta.url), "utf8")]),
);

/** Every key the thirteen files reach, as written — `t("x")` and `t("x", …)` alike. */
const usedKeys = new Set<string>();
for (const src of sources.values()) {
  for (const m of src.matchAll(/(?<=[^a-zA-Z_$])t\("([^"]+)"[,)]/g)) usedKeys.add(m[1]!);
}

/** The keys this round added, pinned as a list rather than counted. */
const ROUND_KEYS = [
  "background.fitChoiceSoft",
  "background.fitChoiceCover",
  "background.fitChoiceContain",
  "background.paletteChoiceImage",
  "background.paletteChoiceTheme",
  "background.errorStorage",
  "background.errorType",
  "background.errorTooLarge",
  "voice.systemPrompt",
  "voice.activityExercise",
  "voice.activityWork",
  "voice.activityFamily",
  "voice.activitySocial",
  "voice.activityRest",
  "voice.activityStudy",
  "report.title",
  "report.made",
  "report.summary",
  "report.days",
  "report.avgMood",
  "report.avgStress",
  "report.avgEnergy",
  "report.quadrantDays",
  "report.moodChart",
  "report.recent",
  "report.colDate",
  "report.colMood",
  "report.colStress",
  "report.colEnergy",
  "report.trackers",
  "report.assessments",
  "report.footer",
  "report.quadrantHighNeg",
  "report.quadrantHighPos",
  "report.quadrantLowNeg",
  "report.quadrantLowPos",
  "analysis.needMore",
  "analysis.highStress",
  "analysis.lowStress",
  "analysis.lowEnergy",
  "analysis.sameMood",
  "analysis.bestTag",
  "analysis.worstTag",
  "analysis.stressDays",
  "analysis.balanced",
  "dates.weekdayMon",
  "dates.weekdayTue",
  "dates.weekdayWed",
  "dates.weekdayThu",
  "dates.weekdayFri",
  "dates.weekdaySat",
  "dates.weekdaySun",
  "yearInPixels.monthJan",
  "yearInPixels.monthFeb",
  "yearInPixels.monthMar",
  "yearInPixels.monthApr",
  "yearInPixels.monthMay",
  "yearInPixels.monthJun",
  "yearInPixels.monthJul",
  "yearInPixels.monthAug",
  "yearInPixels.monthSep",
  "yearInPixels.monthOct",
  "yearInPixels.monthNov",
  "yearInPixels.monthDec",
  "correlation.mood",
  "correlation.stress",
  "correlation.energy",
  "correlation.sleep",
  "cardStates.noData",
  "lock.noPin",
  "lock.tooManyAttempts",
  "lock.wrongPin",
  "attachments.errorStorage",
  "attachments.errorTooLarge",
  "attachments.errorVideoType",
  "backup.dueNote",
  "backup.writeFailed",
  "backup.pickerMissing",
  "backup.notAllowed",
  "backup.ioFailed",
  "backup.pickerDescription",
] as const;

const ts = createRequire(import.meta.url)("typescript") as typeof import("typescript");

/**
 * Every string a reader could be shown, read from the AST rather than guessed.
 *
 * WHY A PARSER HERE AND NOT THE QUOTE SCANNER ROUND 17 USED
 * Round 17's scanner walked quoted runs in the text, and on five modules it was
 * right. Round 18 has `lib/csv.ts` in its list, and that file contains the regex
 * `/["\n\r,]/` — a double quote inside a regex literal — which desynchronises a
 * text scanner and made the file measure ZERO accented strings while holding
 * six. The module that owns this repo's own sweep already argues the case: a
 * regex answered 14 / 22 / 29 / 74 / 102 / 800 for one question, and a parser
 * answered it once. Comments are trivia the parser never hands back, which is
 * what the scanner was approximating.
 *
 * A template's literal parts are collected too, not just plain strings: in a
 * `.ts` module a template is where a fragment like ` pont)` hides.
 */
function stringsIn(source: string, file: string): { text: string; line: number }[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const line = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const out: { text: string; line: number }[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      out.push({ text: node.text, line: line(node) });
    } else if (ts.isTemplateExpression(node)) {
      out.push({ text: node.head.text, line: line(node) });
      for (const span of node.templateSpans) out.push({ text: span.literal.text, line: line(span) });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** Is this string an argument of an `idx(…)` alias list, i.e. an id? */
function insideIdxCall(node: ts.StringLiteralLike): boolean {
  let p: ts.Node | undefined = node.parent;
  while (p) {
    if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && p.expression.text === "idx") {
      return true;
    }
    p = p.parent;
  }
  return false;
}

/** The four single characters the PDF's fold table maps, and nothing else. */
const FOLD_TABLE_LETTERS = ["ő", "ö", "ű", "ü"];

/** One entry with the fields the insight engine reads, and nothing else. */
function entryWith(date: string, over: Partial<Entry> = {}): Entry {
  return { id: date, date, mood: 3, stress: 5, energy: 5, activities: [], note: "", ...over } as Entry;
}

describe("round 18 — the key set is closed in both directions", () => {
  test("the catalogue holds all eighty-one round-18 keys", () => {
    const keys = translationKeys();
    const missing = ROUND_KEYS.filter((k) => !keys.includes(k as never));
    expect(missing, `not in the catalogue: ${missing.join(", ")}`).toEqual([]);
    // A floor, not a ceiling: a round that grew would grow this list.
    expect(ROUND_KEYS.length).toBe(81);
  });

  test("every key the thirteen files use exists — no silent key fallback", () => {
    const keys = translationKeys();
    const unknown = [...usedKeys].filter((k) => !keys.includes(k as never));
    expect(unknown, `t() would render these keys literally: ${unknown.join(", ")}`).toEqual([]);
  });

  test("every round-18 key is reached by one of the thirteen files — no furniture", () => {
    const dead = ROUND_KEYS.filter((k) => !usedKeys.has(k));
    expect(dead, `keys no module reaches: ${dead.join(", ")}`).toEqual([]);
  });

  test("the module's two PIN conditions reuse the card's keys rather than minting a pair", () => {
    // The one place this round did NOT add a key, and the reason it reads as a
    // test: a reader who picks a four-character PIN and a reader who picks 1234
    // hit the same two sentences whether the settings card or the module is
    // asked, so there is one key per condition rather than two.
    const appLock = sources.get("src/lib/appLock.ts")!;
    expect(appLock).toContain('t("settings.pin.lengthError", { min: PIN_MIN, max: PIN_MAX })');
    expect(appLock).toContain('t("settings.pin.weakError")');
    // And `backupStorage`'s unreadable-file sentence is the card's, not a copy.
    expect(sources.get("src/lib/backupStorage.ts")).toContain('const READ_FAILED = t("backup.noSource");');
  });
});

describe("round 18 — what the modules export is what the catalogue holds", () => {
  test("the two background controls draw the catalogue's captions", () => {
    expect(FIT_CHOICES.map((c) => [c.value, c.label])).toEqual([
      ["soft", t("background.fitChoiceSoft")],
      ["cover", t("background.fitChoiceCover")],
      ["contain", t("background.fitChoiceContain")],
    ]);
    expect(PALETTE_CHOICES.map((c) => [c.value, c.label])).toEqual([
      ["image", t("background.paletteChoiceImage")],
      ["theme", t("background.paletteChoiceTheme")],
    ]);
  });

  test("the correlation grid's four outcomes keep their ids and carry the catalogue's labels", () => {
    // The ids are what a stored result is matched on and must not move; the
    // labels are what the tag says and must.
    expect(BUILT_IN_OUTCOMES.map((o) => [o.id, o.label])).toEqual([
      ["mood", t("correlation.mood")],
      ["stress", t("correlation.stress")],
      ["energy", t("correlation.energy")],
      ["sleep", t("correlation.sleep")],
    ]);
  });

  test("the calendar's weekday initials are seven catalogue values, Monday first", () => {
    expect(WEEKDAYS_SHORT).toEqual([
      t("dates.weekdayMon"),
      t("dates.weekdayTue"),
      t("dates.weekdayWed"),
      t("dates.weekdayThu"),
      t("dates.weekdayFri"),
      t("dates.weekdaySat"),
      t("dates.weekdaySun"),
    ]);
    expect(WEEKDAYS_SHORT.length).toBe(7);
  });

  test("the year grid's twelve month abbreviations are catalogue values, in month order", () => {
    expect([...MONTH_ABBREVIATIONS]).toEqual([
      t("yearInPixels.monthJan"),
      t("yearInPixels.monthFeb"),
      t("yearInPixels.monthMar"),
      t("yearInPixels.monthApr"),
      t("yearInPixels.monthMay"),
      t("yearInPixels.monthJun"),
      t("yearInPixels.monthJul"),
      t("yearInPixels.monthAug"),
      t("yearInPixels.monthSep"),
      t("yearInPixels.monthOct"),
      t("yearInPixels.monthNov"),
      t("yearInPixels.monthDec"),
    ]);
    expect(MONTH_ABBREVIATIONS.length).toBe(12);
  });

  test("the collapsed card's empty line and the backup note are the catalogue values", () => {
    expect(NO_DATA_SUMMARY).toBe(t("cardStates.noData"));
    expect(BACKUP_DUE_NOTE).toBe(t("backup.dueNote"));
  });

  test("the three lock sentences are the catalogue values, through the API that returns them", () => {
    // `setPin` refuses on format and on weakness before it touches crypto, and
    // `verifyPin` with no record never reads one — so all three of these are
    // reachable in a test with no storage shim and no WebCrypto.
    expect(verifyPin("1234")).resolves.toEqual({ ok: false, error: t("lock.noPin") });
    expect(setPin("12")).resolves.toEqual({
      ok: false,
      error: t("settings.pin.lengthError", { min: PIN_MIN, max: PIN_MAX }),
    });
    expect(setPin("1234")).resolves.toEqual({ ok: false, error: t("settings.pin.weakError") });
    // The fourth is only reachable with a stored record and a real PBKDF2 run,
    // so it is pinned at its call site rather than through a fake the module
    // would never see.
    expect(sources.get("src/lib/appLock.ts")).toContain('t("lock.wrongPin")');
  });

  test("the voice module's prompt is the catalogue value, and its tags are the six keys", () => {
    // The prompt is a module-local const, so the call site is the pin — the same
    // shape round 17 used for the two values its own walk could not see.
    const voice = sources.get("src/lib/voice.ts")!;
    expect(voice).toContain('const SYSTEM_PROMPT = t("voice.systemPrompt");');
    for (const key of [
      "voice.activityExercise",
      "voice.activityWork",
      "voice.activityFamily",
      "voice.activitySocial",
      "voice.activityRest",
      "voice.activityStudy",
    ]) {
      expect(voice).toContain(`activity: t("${key}")`);
    }
    // The patterns stay Hungarian: they match what the reader typed.
    expect(voice).toContain("re: /futás|futott|tornáztam|edzőterem|túra|kirándultam|bicikli|séta/i");
    expect(voice).toContain("re: /könyv|olvas|tanul|kurzus|iskola/i");
  });
});

describe("round 18 — the sentences still compose", () => {
  test("the insight engine's nine sentences are the catalogue's, numbers and all", () => {
    // Asserted as whole sentences rather than as lookups: the placeholders are
    // the only thing standing between a moved sentence and a sentence that
    // renders `{stress}` to a reader, and the punctuation around them (`„…"`,
    // the em dash, the `(…)`) is not something a key-by-key check can see.
    expect(t("analysis.needMore")).toBe(
      "Még pár bejegyzés kell, hogy felismeréseket adjak — három után indul az elemzés.",
    );
    expect(t("analysis.highStress", { stress: "8.4" })).toBe(
      "Az átlagos stressz-ed magas (8.4/10). Nézd meg, mely tevékenységek vagy napok húzzák fel.",
    );
    expect(t("analysis.lowStress", { stress: "3.2" })).toBe(
      "Alacsony az átlag stressz-ed (3.2/10) — jó irány.",
    );
    expect(t("analysis.lowEnergy")).toBe(
      "Az energiád gyakran alacsony. Több pihenés vagy mozgás segíthet.",
    );
    expect(t("analysis.sameMood", { mood: moodByLevel(3).label })).toBe(
      `Az utolsó 3 bejegyzésed hangulata ugyanaz (${moodByLevel(3).label}).`,
    );
    expect(t("analysis.bestTag", { tag: "Futás", delta: 12 })).toBe(
      '„Futás" napjaidon átlagosan 12 ponttal jobb a hangulatod.',
    );
    expect(t("analysis.worstTag", { tag: "Munka", delta: 9 })).toBe(
      '„Munka" után rendszerint 9 ponttal rosszabb a hangulatod.',
    );
    expect(t("analysis.stressDays", { days: 4 })).toBe(
      "4 napon jelzettél 8-as vagy magasabb stresszt.",
    );
    expect(t("analysis.balanced")).toBe(
      "Kiegyensúlyozott időszakot látsz — figyeld tovább a mintákat.",
    );
  });

  test("the engine returns those sentences, composed — not the raw keys", () => {
    // The cold deck: fewer than three entries answers with one line, and that
    // line is the catalogue value rather than the key.
    expect(personalInsights([]).map((i) => i.text)).toEqual([t("analysis.needMore")]);
    // Three calm entries with different moods: no stress floor, no energy floor,
    // no repeated mood, nothing to correlate — so the balanced line is the one
    // that answers, which is also the proof that the fallback is still reachable.
    const calm = personalInsights([
      entryWith("2026-05-03", { mood: 3, stress: 5, energy: 6 }),
      entryWith("2026-05-02", { mood: 4, stress: 5, energy: 6 }),
      entryWith("2026-05-01", { mood: 2, stress: 5, energy: 6 }),
    ]);
    expect(calm.map((i) => i.text)).toEqual([t("analysis.balanced")]);
    // And a stressed deck prints the number it computed, formatted the way the
    // module formats it, inside the sentence the catalogue holds.
    const stressed = personalInsights([
      entryWith("2026-05-03", { mood: 3, stress: 8, energy: 3 }),
      entryWith("2026-05-02", { mood: 4, stress: 8, energy: 3 }),
      entryWith("2026-05-01", { mood: 2, stress: 8, energy: 3 }),
    ]);
    expect(stressed.map((i) => i.text)).toContain(t("analysis.highStress", { stress: "8.0" }));
    expect(stressed.map((i) => i.text)).toContain(t("analysis.lowEnergy"));
    expect(stressed.map((i) => i.text)).toContain(t("analysis.stressDays", { days: 3 }));
  });

  test("the report's summary lines and quadrant names are single values, not fragments", () => {
    // The report itself is not imported here — it pulls jsPDF — so what is
    // pinned is the set of values the builder reads, each as the whole line it
    // draws. A value that lost its label would print `4` alone on the page.
    expect(t("report.days", { count: 30 })).toBe("Napok száma: 30");
    expect(t("report.avgMood", { value: 71 })).toBe("Átlag hangulat (0–100): 71");
    expect(t("report.avgStress", { value: "—" })).toBe("Átlag stressz (1–10): —");
    expect(t("report.avgEnergy", { value: 4.5 })).toBe("Átlag energia (1–10): 4.5");
    expect(t("report.quadrantDays", { list: "feszult-aktív 3, derus-aktiv 1" })).toBe(
      "4-kvadrans napok: feszult-aktív 3, derus-aktiv 1",
    );
    expect(t("report.made", { date: "2026. 05. 03." })).toBe("Készült: 2026. 05. 03.");
  });
});

describe("round 18 — the sweep cannot be reverted, and csv.ts is the exception", () => {
  test("no string in the twelve swept files carries a Hungarian accented character", () => {
    // Comments are trivia and never reach this list: these modules argue their
    // decisions in prose that quotes Hungarian deliberately and is read by
    // nobody's screen.
    //
    // ONE EXEMPTION, NAMED RATHER THAN ASSUMED. `lib/reportPdf.ts` keeps the PDF
    // fold table, whose keys and values are single CHARACTERS (`ő` becomes `ö`)
    // — the one place in the app where a Hungarian letter is data rather than
    // copy. A length check rather than a whitelist, so a sentence cannot slip
    // into the exemption, and the letters themselves are pinned below.
    const offenders: { file: string; text: string; line: number }[] = [];
    const singleChars: string[] = [];
    const ACCENTED = /[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/;
    for (const file of SWEPT_FILES) {
      for (const { text, line } of stringsIn(sources.get(file)!, file)) {
        if (!ACCENTED.test(text)) continue;
        if (text.length === 1) singleChars.push(text);
        else offenders.push({ file, text, line });
      }
    }
    expect(
      offenders.map((o) => `${o.file}:${o.line} ${JSON.stringify(o.text)}`),
      "raw Hungarian strings",
    ).toEqual([]);
    expect(singleChars.sort()).toEqual(["ö", "ő", "ü", "ű"].sort());
    // And those four really are the fold table, so deleting the table would take
    // the exemption with it instead of leaving it free for the next file. The
    // two NAMES are the two letters jsPDF cannot draw (`ő` and `ű`); the other
    // two are what they fold TO, which is why `ö` and `ü` are in the set at all.
    const report = sources.get("src/lib/reportPdf.ts")!;
    expect(report).toContain('"ő": "ö"');
    expect(report).toContain('"ű": "ü"');
    expect(FOLD_TABLE_LETTERS.length).toBe(4);
  });

  test("and lib/csv.ts's six Hungarian strings are ids, every one of them an alias", () => {
    // The other half of the decision. A sweep that quietly skipped this file
    // would look identical to one that classified it, so the classification is
    // asserted: six accented strings, and every one of them an argument of an
    // `idx(…)` call — read from the AST, so moving one out of an alias list
    // fails here even though the string itself is unchanged.
    const csv = sources.get("src/lib/csv.ts")!;
    const sf = ts.createSourceFile("csv.ts", csv, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const ACCENTED = /[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/;
    const accented: string[] = [];
    const outside: string[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isStringLiteral(node) && ACCENTED.test(node.text)) {
        accented.push(node.text);
        if (!insideIdxCall(node)) outside.push(node.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    expect(accented.sort(), `accented strings: ${accented.join(", ")}`).toEqual([
      "alvás",
      "címke",
      "dátum",
      "tevékenység",
      "érzelmek",
      "érzés",
    ]);
    expect(outside, `not an alias: ${outside.join(", ")}`).toEqual([]);
    // And the exporter's own headers are ASCII, which is why they are not in
    // this set at all: a file it writes is read back through these aliases.
    expect(csv).toContain('const iEmo = idx("emotions", "emotion_list", "érzelmek", "feelings");');
  });

  test("the sweep document names the round, and the family it emptied is gone", () => {
    // Cheap, and it is the document a reader trusts: round 18 must be in the
    // `.ts` list with its own sentence, and `chrome — a round is owed` must no
    // longer exist as a heading with nothing under it.
    const doc = readFileSync(new URL("../docs/i18n-sweep-list.md", import.meta.url), "utf8");
    expect(doc).toContain("- **Round 18** — ");
    expect(doc).toContain("lib/csv.ts");
    expect(doc).not.toContain("chrome — a round is owed");
    // The twelve swept modules are gone from the table entirely: a module with
    // nothing left to measure has no row, which is the state the sweep is for.
    for (const file of SWEPT_FILES) {
      expect(doc.includes(`| \`${file.replace(/^src\//, "")}\` |`), `${file} still has a row`).toBe(false);
    }
  });
});

/** A compile-time guard: the keys above are real keys, not strings that look like them. */
const _typed: TranslationKey[] = [...ROUND_KEYS];
void _typed;
