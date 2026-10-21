/**
 * Every raw Hungarian string a reader can see, found by parsing rather than
 * by guessing.
 *
 * WHY A PARSER AND NOT A PATTERN
 * The previous three attempts at this count were regexes, and they disagreed
 * with each other badly: 14, 22, 29, 74, 102 and 800 from six passes over the
 * same files. Each failed the same way. A `<button …>` paired with the next
 * `</button>` swallows its neighbours; stripping `{…}` to get at the text
 * throws away the labels that sit next to an expression; and a rule loose
 * enough to catch a Hungarian sentence also catches an object literal in
 * `lib/` and a Hungarian word inside a comment. None of those numbers was
 * wrong about a file; they were answering different questions.
 *
 * So this walks the AST. `JSXText` is text a reader sees; a string-literal
 * attribute is a string a reader sees; a comment is a trivia node the parser
 * does not even hand back as text; and an object literal in `lib/` is not
 * JSX, so it cannot appear at all. The four things regex could not tell apart
 * are four different node kinds, and this counts each one on purpose.
 *
 * WHAT COUNTS AS A STRING HERE
 *  - `JSXText` with a Hungarian letter in it, that is not inside a `t()` call
 *  - `title=` / `placeholder=` / `aria-label=` / `label=` / `summary=` /
 *    `badge=` / `alt=` attributes whose value is a plain string literal
 *  - the same attributes whose value is `{t("…")}` — reported separately,
 *    because those are the ones that are already in the catalogue
 *
 * WHAT DOES NOT COUNT
 *  - comments (trivia, never a node we visit)
 *  - `lib/**` data modules: a prompt string in `lib/weeklyReflection.ts` is
 *    reader-visible but it is content, not chrome, and it has its own shape
 *  - identifiers, class names, imports
 *
 * RUN: `bun scripts/extract-raw-strings.mjs`
 *      `bun scripts/extract-raw-strings.mjs --json`
 *      `bun scripts/extract-raw-strings.mjs --md`   (rewrites the sweep list)
 */
import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

/** A Hungarian letter is what separates copy from code in this codebase. */
const HUN = /[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/;

/** Attributes whose string value a screen reader or a reader sees. */
const COPY_ATTRS = new Set([
  "title",
  "placeholder",
  "aria-label",
  "label",
  "summary",
  "badge",
  "alt",
]);

/**
 * Every source file under `src/`, `.tsx` and `.ts` alike.
 *
 * `.ts` is here because the ROUND TABLE can now name a `.ts` file — rounds 15
 * and 16 hold `lib/icon-policy.ts` and `lib/fonts.ts`, which the measurement
 * below never visits. Without it, `assignRounds()` would report both as "not a
 * file in src/", which is the check that exists to catch a RENAMED or deleted
 * file saying something false.
 *
 * The measurement itself filters this to `.tsx` at the call site, so widening
 * the walk does not widen the count. That separation is deliberate: the walk
 * answers "does this file exist?", the scan answers "does it have literals?",
 * and only the second one is about `.tsx`.
 */
function walkDir(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walkDir(p, out);
    else if (p.endsWith(".tsx") || p.endsWith(".ts")) out.push(p);
  }
  return out;
}

/** The files the QUEUE measurement reads: `.tsx` only, as it has always been. */
function walkTsx(dir, out = []) {
  return walkDir(dir, out).filter((p) => p.endsWith(".tsx"));
}

/** The files the INVENTORY measurement reads: the `.ts` modules, no `.tsx`. */
function walkTs(dir, out = []) {
  return walkDir(dir, out).filter((p) => p.endsWith(".ts"));
}

/** Collapse JSX whitespace the way a browser would render it. */
function tidy(raw) {
  return raw.replace(/\s+/g, " ").trim();
}

const raw = [];
const catalogued = [];

for (const file of walkTsx("src").sort()) {
  const source = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const line = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

  const insideT = (node) => {
    let p = node.parent;
    while (p) {
      if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && p.expression.text === "t") return true;
      p = p.parent;
    }
    return false;
  };

  const visit = (node) => {
    // --- JSX text: the label between > and <
    if (ts.isJsxText(node)) {
      const text = tidy(node.text);
      if (text.length >= 2 && HUN.test(text) && !insideT(node)) {
        raw.push({ file, line: line(node), kind: "jsx-text", text });
      }
    }
    // --- string-literal attributes
    if (ts.isJsxAttribute(node) && COPY_ATTRS.has(node.name.text)) {
      const init = node.initializer;
      if (init && ts.isStringLiteral(init)) {
        if (init.text.length >= 2 && HUN.test(init.text)) {
          raw.push({ file, line: line(node), kind: node.name.text, text: init.text });
        }
      } else if (init && ts.isJsxExpression(init) && init.expression && ts.isCallExpression(init.expression)) {
        const call = init.expression;
        if (ts.isIdentifier(call.expression) && call.expression.text === "t") {
          catalogued.push({ file, line: line(node), kind: node.name.text, key: call.arguments[0]?.text });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

const seen = new Set();
const unique = raw.filter((r) => {
  const k = `${r.file}|${r.line}|${r.kind}|${r.text}`;
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});

/* --------------------- the `.ts` modules, measured ---------------------- */

/**
 * A second measurement, and a different QUESTION.
 *
 * The queue above asks "what chrome is left in the components". This one asks
 * "what Hungarian text does a `.ts` module still hold at all" — because for
 * years the answer was unmeasurable, and a round that cannot be measured reads
 * as a round that cannot be finished. The two are kept apart on purpose: this
 * count never enters `byFile`, never enters the round table, and never becomes
 * a work queue. `src/lib/i18n.ts` is skipped because the catalogue is where
 * Hungarian strings are SUPPOSED to live; counting it would report the sweep's
 * success as its backlog.
 */
const tsRows = [];
const tsCatalogued = [];
for (const file of walkTs("src").sort()) {
  if (file === "src/lib/i18n.ts") continue;
  const source = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const insideT = (node) => {
    let p = node.parent;
    while (p) {
      if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && p.expression.text === "t") return true;
      p = p.parent;
    }
    return false;
  };
  let count = 0;
  let reached = 0;
  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (node.text.length >= 2 && HUN.test(node.text)) {
        if (insideT(node)) reached++;
        else count++;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (count || reached) tsRows.push({ file, literals: count, reached });
  tsCatalogued.push(reached);
}

/**
 * What each `.ts` module's Hungarian text IS, in the repository's own terms.
 *
 * The `.tsx` walk can tell chrome from content by node kind — `JSXText` is a
 * label, an object literal in `lib/` is not JSX at all. A `.ts` module offers
 * no such handle: `reason: "…"` in `icon-policy` and the prompt in a
 * `weeklyReflection` registry are the same syntax. So the CLASSIFICATION here
 * is a decision, written down, and only the counts are measured — the same
 * bargain the round table already makes, where `TS_ROUND_CONTENTS` says in
 * words what the walk cannot count.
 *
 * Both directions are checked below, like `assignRounds()`: a measured module
 * with no family is refused (nobody decided), and a family naming a module that
 * is not in `src/` is refused (a renamed or deleted file would otherwise keep
 * its verdict forever).
 */
const TS_FAMILIES = [
  {
    kind: "chrome — swept",
    why: "Reader-facing copy that reached the catalogue: rounds 15 and 16 (the two `.ts` files the `.tsx` walk cannot read), round 17 (the five modules the audit named by hand), and round 18 (the twelve modules this table still owed). Round 18's thirteenth candidate is the row below, and it is the interesting one: `lib/csv.ts` turned out not to be copy.",
    files: [
      "src/lib/icon-policy.ts",
      "src/lib/fonts.ts",
      "src/lib/onboarding.ts",
      "src/lib/weather.ts",
      "src/lib/notifications.ts",
      "src/lib/foodAi.ts",
      "src/lib/healthImport/merge.ts",
      // Round 18.
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
    ],
  },
  {
    kind: "ids — Hungarian on purpose",
    why: "Structural ids a lookup matches on. Translating one would break the match, so `chromeByGroup()` keeps them and the DISPLAY name is the key. `lib/csv.ts` joined in round 18 for the same reason and it is worth reading before anyone deletes it: its six Hungarian strings are the header aliases the importer MATCHES on (`idx(\"date\", \"dátum\", …)`), so translating one would stop a CSV the app itself exported from being read back — and translating them at request time would make one file readable in one language and unreadable in another.",
    files: ["src/lib/icon-policy.ts", "src/lib/csv.ts"],
  },
  // ROUND 18 EMPTIED `chrome — a round is owed`, so the family is gone rather
  // than left as a heading with no members. What it said is worth keeping, and
  // it is kept where the work is: the second walk now has no module it cannot
  // classify, and a thirteenth candidate that turned out to be an id is named in
  // the `ids` family above instead of sitting here looking like debt.
  {
    kind: "registry — the module owns its copy",
    why: "A list the module OWNS, with readers on other pages too. The inventory's own rule: a registry gets its own namespace when it is extracted, not before.",
    files: [
      "src/lib/mood.ts",
      "src/lib/trackers.ts",
      "src/lib/habits.ts",
      "src/lib/emotion-vocab.ts",
      "src/lib/contextOptions.ts",
      "src/lib/achievements.ts",
      "src/lib/breathing.ts",
      "src/lib/customTheme.ts",
      "src/lib/themes.ts",
      "src/lib/iconsets.ts",
      "src/lib/nav-icons.ts",
      "src/lib/quadrant.ts",
      "src/lib/statsAgg.ts",
      "src/lib/store.ts",
    ],
  },
  {
    kind: "content — prose the module owns",
    why: "Passages, not controls. A meditation or an article needs its own extraction, its own review and its own translator; the questionnaire's crisis NUMBERS are data, and a second copy of them is the one duplication that could hurt somebody.",
    files: [
      "src/lib/education.ts",
      "src/lib/weeklyReflection.ts",
      "src/lib/meditations.ts",
      "src/lib/micro-lessons.ts",
      "src/lib/patternInsights.ts",
      "src/lib/nutritionTips.ts",
      "src/lib/sportTips.ts",
      "src/lib/assessments.ts",
      "src/lib/gad7.ts",
      // Batch 15's two content registries, classified the same way for the same
      // reason: a food's name and a template's exercise are read by the reader
      // but OWED by the module, next to the numbers and the rule that adopt
      // them. Translating a food name without its portion and its macros would
      // be a translated label on an untranslated fact, which is worse than an
      // honest Hungarian one.
      "src/lib/nutrition.ts",
      "src/lib/fitness.ts",
      // The health-tab audit's `DIET_NOTES`: one sentence per diet, and every
      // one of them names a question to ask a professional. It is prose the
      // module owns for the same reason the tips beside it are — a translator
      // has to read it against what the diet IS, not against a screen's width.
      "src/lib/diets.ts",
    ],
  },
  {
    kind: "data — not copy at all",
    why: "Not something a reader reads: a recovery wordlist, a file name, a storage key. Translating any of it would be wrong.",
    files: ["src/lib/backupWordlist.ts"],
  },
];

/** family -> file, and the two directions `assignRounds()` checks. */
const tsFamilyOf = new Map();
for (const family of TS_FAMILIES) {
  for (const file of family.files) {
    // A module may sit in two families on purpose — `icon-policy.ts` holds
    // swept copy AND the Hungarian ids that stayed — so this collects rather
    // than refuses, and the table prints both.
    if (!tsFamilyOf.has(file)) tsFamilyOf.set(file, []);
    tsFamilyOf.get(file).push(family);
  }
}
const measuredTs = new Set(tsRows.map((r) => r.file));
// Collected, then reported together: a maintainer adding one module should see
// every file that needs a decision in one run, not discover them one throw at
// a time — the same reason `batch13-inventory` gathers its failures first.
const unclassified = [...measuredTs].filter((f) => !tsFamilyOf.has(f)).sort();
if (unclassified.length) {
  const detail = unclassified
    .map((f) => `${f} (${tsRows.find((r) => r.file === f).literals})`)
    .join(", ");
  throw new Error(`no .ts family holds ${detail} — classify them or this table is a shrug`);
}
const inTree = new Set(walkDir("src"));
for (const file of tsFamilyOf.keys()) {
  if (!inTree.has(file)) throw new Error(`a .ts family names ${file}, which is not a file in src/`);
}
// A catalogue key is an identifier. A Hungarian letter inside `t()` means the
// key is prose, and prose is not something `MESSAGES.hu` can be indexed by —
// the lookup falls through to the key itself and the reader sees the key.
const badKeys = tsRows.filter((r) => r.reached > 0);
if (badKeys.length) {
  throw new Error(
    `non-ASCII t() keys: ${badKeys.map((r) => `${r.file} (${r.reached})`).join(", ")} — a key is an id`,
  );
}

const byFile = new Map();
for (const r of unique) {
  if (!byFile.has(r.file)) byFile.set(r.file, []);
  byFile.get(r.file).push(r);
}

/* ---------------------------- the work queue ---------------------------- */

/**
 * The sweep, as rounds. Each round names FILES, never a count.
 *
 * A literal count written into this table would be a claim about a tree that
 * the first round changes, and a claim about a changing tree is exactly what
 * this repository has been bitten by six times over: six regex passes over
 * these same files answered 14 / 22 / 29 / 74 / 102 / 800, and every one of
 * them was a number written down before anybody checked what it counted. So
 * the counts in the generated document are COMPUTED from the measurement
 * above, this table carries none, and the checks at the bottom refuse to
 * generate a document that has drifted from the tree.
 *
 * Rounds 1-10 are the plan as given. Rounds 11-14 exist because those ten
 * named fifteen files and the measurement says the tree holds thirty-one:
 * the sixteen files below held 68 literals that no round had claimed. Listing
 * them here is how that gap stops being invisible.
 */
/**
 * What each `.ts` round held, in words, because the walk cannot count it.
 * Written here rather than inferred: an empty cell would read as "nothing
 * there", which is the mistake the section exists to prevent.
 */
const TS_ROUND_CONTENTS = {
  15: "48 reader-facing `reason:` strings and four group headings, shown in the Settings disclosure",
  16: "a category label and note per group, and a `label`/`hint` pair for every face in the registry",
  17: "the three reminder messages and the two notification titles, the GPS place label, the food-AI prompt (five parts) and its six failures, the macros line and the masked-key line the walk cannot see, the four health-import series names, and the four onboarding tracker pills — 28 strings moved, of which the walk counts 25",
  18: "the whole second walk: eight background labels and failures, the model prompt and six activity tags, the report's twenty headings and quadrant names, nine insight sentences, seven weekday initials, twelve month abbreviations, four outcome names, the empty-card line, three lock messages, three attachment failures, the backup due note and six file-surface strings — 55 measured literals across thirteen modules became 80 keys, because a `.ts` module's unaccented words, its template expressions and the tags only a regex reaches are strings this measurement cannot see",
};

/** A round holding a `.ts` file: the walk cannot report on it, done or not. */
const isUnmeasurable = (r) => r.files.some((f) => f.endsWith(".ts"));

const ROUNDS = [
  { n: 1, files: ["src/components/PinLockSettings.tsx"] },
  { n: 2, files: ["src/components/AttachmentPicker.tsx"] },
  { n: 3, files: ["src/components/EntryDetail.tsx"] },
  { n: 4, files: ["src/components/RecordingFlow.tsx"] },
  { n: 5, files: ["src/components/MicroLessonCard.tsx", "src/components/CustomThemeEditor.tsx"] },
  { n: 6, files: ["src/components/CustomTrackerManager.tsx", "src/components/DailyGoals.tsx"] },
  { n: 7, files: ["src/components/FoodAiSettingsCard.tsx", "src/components/HealthImportCard.tsx"] },
  { n: 8, files: ["src/components/IconSetPicker.tsx", "src/components/InstallPrompt.tsx"] },
  { n: 9, files: ["src/components/MedicationTimesCard.tsx", "src/components/PinLockGate.tsx"] },
  { n: 10, files: ["src/components/WeeklyReflectionCard.tsx"] },
  { n: 11, files: ["src/components/LagAnalysisCard.tsx", "src/components/ReportExport.tsx"] },
  { n: 12, files: ["src/components/FontPicker.tsx", "src/components/WeatherApiCard.tsx", "src/components/ReminderCard.tsx"] },
  { n: 13, files: ["src/components/QuadrantInsightCards.tsx", "src/components/PatternInsightsCard.tsx", "src/components/CorrelationGrid.tsx", "src/components/BackgroundImagePicker.tsx"] },
  { n: 14, files: ["src/components/MonthlyYearlyStats.tsx", "src/components/YearInPixels.tsx", "src/components/AppHeader.tsx", "src/App.tsx", "src/components/TrackerInputs.tsx", "src/components/BottomNav.tsx", "src/components/AchievementsCard.tsx"] },
  // Rounds 15 and 16 are the two `.ts` files this measurement CANNOT see.
  //
  // They are listed here for a reason that has nothing to do with the count:
  // a round that exists in this table is a scope somebody committed to, and a
  // scope that is only described in a comment in `src/lib/i18n.ts` is a scope
  // the next person has to rediscover. Their counts read 0 because the walk is
  // `.tsx`-only — not because there was nothing there. `lib/icon-policy.ts`
  // held 48 reader-facing `reason:` strings and four group headings;
  // `lib/fonts.ts` holds a category label, a category note and a `label`/`hint`
  // pair for every face in the registry.
  //
  // `assignRounds()` checks the existence list with `walkDir("src")` and not
  // with `allTsx`, precisely so these rows are legal: a `.ts` file that was
  // renamed or deleted still fails the generator, which is the property that
  // makes a row in this table worth anything.
  { n: 15, files: ["src/lib/icon-policy.ts"] },
  { n: 16, files: ["src/lib/fonts.ts"] },
  // Round 17 is the first `.ts` round that is FIVE modules rather than one, and
  // it is one round rather than five for the reason the ceiling exists: 27
  // literals is a reviewable diff and five one-module rounds would be five
  // reviews of the same shape. The list is the audit's own candidates.
  {
    n: 17,
    files: [
      "src/lib/onboarding.ts",
      "src/lib/weather.ts",
      "src/lib/notifications.ts",
      "src/lib/foodAi.ts",
      "src/lib/healthImport/merge.ts",
    ],
  },
  // Round 18 closes the second walk: the thirteen modules the `.ts` table named
  // as owing a round. Twelve became keys and `lib/csv.ts` moved to the `ids`
  // family with its strings untouched, which is why this row lists thirteen
  // files and the doc says twelve moved copy. One round rather than thirteen for
  // the ceiling's reason — 55 measured literals in one diff of one shape — and
  // the row is here rather than in a comment because a round in this table is a
  // scope somebody committed to, and `assignRounds()` will now refuse a renamed
  // or deleted member by name.
  {
    n: 18,
    files: [
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
    ],
  },
  // Round 19: the Egészség tab. `HealthView` ships its three card titles,
  // summaries and body sentences as literal Hungarian — deliberately, so the
  // view cannot fail on a catalogue key while it is being brought up — which
  // makes it a `.tsx` file the walk FINDS and therefore one that must have an
  // owning round. One file, one shape, well under the ceiling.
  { n: 19, files: ["src/views/HealthView.tsx"] },
];

/**
 * The ceiling. One round has to stay reviewable as a diff, and a round that
 * moves 17 literals in one file is a different thing to review than one that
 * moves 3.
 */
const ROUND_CEILING = 25;

/**
 * Which round, if any, holds each file — and a hard error when the two disagree.
 *
 * THE EXISTENCE CHECK LOOKS AT `allTsx`, NOT AT `byFile`, and round 1 is why.
 * `byFile` holds only files that still have something to sweep, so checking
 * membership there meant a round could never FINISH: the moment its last
 * literal was catalogued the file left `byFile` and the generator refused to
 * emit the document that recorded the round as done. A guard that forbids the
 * state the work is trying to reach is not a guard, it is a wall — and this
 * one shipped in ROUND 0 and only showed up when a round actually completed.
 *
 * A round naming a file that `src/` does not contain is still an error, because
 * that is a renamed or deleted file and the round's work would be invisible.
 * A round naming a file with nothing left in it is the normal end state.
 */
function assignRounds() {
  const owner = new Map();
  const exists = new Set(walkDir("src"));
  for (const round of ROUNDS) {
    for (const file of round.files) {
      if (owner.has(file)) {
        throw new Error(`round ${owner.get(file)} and round ${round.n} both claim ${file}`);
      }
      if (!exists.has(file)) {
        throw new Error(`round ${round.n} names ${file}, which is not a file in src/`);
      }
      owner.set(file, round.n);
    }
  }
  const unassigned = [...byFile.keys()].filter((f) => !owner.has(f));
  if (unassigned.length) {
    throw new Error(`no round holds ${unassigned.join(", ")} — add them or they will never be swept`);
  }
  return owner;
}

const owner = assignRounds();
const counts = new Map([...byFile].map(([f, rows]) => [f, rows.length]));
// `?? 0`, because a file a round has already swept is absent from `counts`.
// Without it a round holding one swept file and one live file sums to NaN, and
// `NaN > 0` is false — so that round would drop out of the queue while still
// having work left in it. The round would look finished and would not be.
const roundCount = (round) => round.files.reduce((n, f) => n + (counts.get(f) ?? 0), 0);

const oversized = ROUNDS.filter((r) => roundCount(r) > ROUND_CEILING);
if (oversized.length) {
  const detail = oversized.map((r) => `round ${r.n} is ${roundCount(r)}`).join(", ");
  throw new Error(`past the ${ROUND_CEILING}-literal ceiling: ${detail} — split it`);
}

/**
 * Where `--md` writes. Overridable so the guard can generate into a scratch
 * file and compare it against the committed one — a test that regenerated the
 * document in place would be comparing the file to itself and always green,
 * which is the shape of a guard that cannot fail.
 */
const DOC_PATH = process.env.I18N_SWEEP_DOC ?? "docs/i18n-sweep-list.md";

function markdown() {
  const out = [];
  const remaining = ROUNDS.filter((r) => roundCount(r) > 0);
  // A round holding a `.ts` file is never measurable by this walk, so its count
  // is 0 for a reason that has nothing to do with the work. Listing it under
  // "Already swept" would be a document asserting a round is done because a
  // scanner never looked at it — which is the exact mistake this generator
  // exists to stop making. Such rounds get their own section, and they are
  // listed there whether or not anyone has done the work.
  const unmeasurable = ROUNDS.filter(isUnmeasurable);
  const swept = ROUNDS.filter((r) => roundCount(r) === 0 && !isUnmeasurable(r));

  out.push("# The i18n sweep list");
  out.push("");
  out.push(
    "**Generated file — do not edit by hand.** Run `bun scripts/extract-raw-strings.mjs --md`",
    "and commit the result. `tests/i18n-sweep-list.test.ts` fails if this file and the tree ever",
    "disagree, so a hand-edit is not a shortcut, it is a future red build.",
  );
  out.push("");
  out.push("## What this counts, and what it does not");
  out.push("");
  out.push(
    `The measurement walks \`src/**/*.tsx\` and visits the AST. It reads two kinds of node and no`,
    `others: \`JSXText\` (the label between \`>\` and \`<\`) and a string-literal \`title\` /`,
    `\`placeholder\` / \`aria-label\` / \`label\` / \`summary\` / \`badge\` / \`alt\` attribute. A comment is`,
    "trivia the parser never hands back, and an object literal in `lib/` is not JSX, so neither can",
    "reach this count — which is why the number is reproducible where six regex passes were not.",
  );
  out.push("");
  out.push(
    "It is a count of **chrome**, not of every Hungarian word in the app. Two families sit outside it",
    "on purpose, and both are argued in their own files: the reflection prompts in",
    "`src/lib/weeklyReflection.ts` are reader-facing prose that is content rather than chrome, and the",
    "inline workout PROGRAMS in `WorkoutPrograms` are a 76-line content block. A literal that is not",
    "JSX and not a copy attribute — a template literal in a helper, a string handed to `notify()` —",
    "is also outside it. That is the shape of the rule, not an oversight in it.",
  );
  out.push("");
  out.push("## The numbers");
  out.push("");
  out.push("| | count |");
  out.push("| --- | --- |");
  out.push(`| raw literals still to sweep | **${unique.length}** |`);
  out.push(`| files holding them | **${byFile.size}** |`);
  // The label, and why it is this long: this counts the `t()` calls the walk
  // SAW, not the keys that exist. Rounds 15 and 16 added 69 keys called from
  // `.ts` files, which this walk never reads, so the two numbers parted and a
  // bare "already catalogued through `t()`" would have been read as "every key
  // is reachable" — which is the claim it cannot make.
  out.push(`| \`t()\` call sites this walk saw | ${catalogued.length} |`);
  // `${measurable}` rather than `ROUNDS.length`: a `.ts` round has no work this
  // walk can report on, so counting it in "with work left" would be a claim
  // about a number nobody measured. It is counted, and named, below.
  const measurable = ROUNDS.length - unmeasurable.length;
  out.push(
    `| rounds | ${ROUNDS.length} (${measurable} measurable, ${remaining.length} with work left) |`,
  );
  out.push("");
  out.push("## The rounds");
  out.push("");
  out.push(
    "Every count below is computed from the measurement, never written down. The ceiling is",
    `${ROUND_CEILING} literals per round, and this script refuses to generate the document if a round`,
    "is over it, if a round names a file `src/` does not contain, if two rounds claim one file, or",
    "if any file with literals is left unclaimed. Those four checks are the reason the table below",
    "can be trusted to still be true next round. A round whose files have nothing left in them is",
    "not an error — it is the end state the sweep is for, and it is listed under **Already swept**.",
  );
  out.push("");
  out.push("| round | files | literals | largest file |");
  out.push("| --- | --- | --- | --- |");
  for (const round of remaining) {
    const rows = round.files.map((f) => `\`${f.replace(/^src\//, "")}\``).join("<br>");
    const biggest = [...round.files].sort((a, b) => counts.get(b) - counts.get(a))[0];
    out.push(
      `| ${round.n} | ${rows} | ${roundCount(round)} | \`${biggest.replace(/^src\//, "")}\` (${counts.get(biggest)}) |`,
    );
  }
  if (swept.length) {
    out.push("");
    out.push(
      `**Already swept:** ${swept.map((r) => `round ${r.n}`).join(", ")}.`,
    );
  }
  // A `.ts` row cannot say "done" on this walk's authority, so it says what it
  // is instead. Said here rather than in a comment in a file the reader may not
  // open, because the failure mode is a reader believing a number.
  if (unmeasurable.length) {
    out.push("");
    out.push(
      `**Rounds ${unmeasurable.map((r) => r.n).join(", ")} hold \`.ts\` files.** This walk is \`.tsx\`-only,`,
    );
    out.push(
      "so it cannot say whether they are done — it never reads them. Their counts above are 0 for",
    );
    out.push(
      "that reason alone, which is why they are not in the **Already swept** line. What each carried:",
    );
    for (const r of unmeasurable) {
      const what = TS_ROUND_CONTENTS[r.n];
      out.push("");
      out.push(`- **Round ${r.n}** — ${r.files.map((f) => `\`${f}\``).join(", ")}${what ? `: ${what}` : "."}`);
    }
  }
  out.push("");
  out.push("## The `.ts` modules, measured");
  out.push("");
  out.push(
    "A second walk, asking a different question: not *what chrome is left* but",
    "*what Hungarian text does a module still hold at all*. It never enters the round table above",
    "— these counts are not a work queue — and `src/lib/i18n.ts` is skipped, because the catalogue",
    "is where Hungarian strings are supposed to live.",
  );
  out.push("");
  out.push(
    "The COUNT is measured. The FAMILY is a decision, written into the script, and both directions",
    "are checked: a measured module with no family refuses to generate, and a family naming a file",
    "`src/` does not contain refuses too. A `.tsx` file can tell chrome from content by node kind;",
    "a `.ts` module cannot — `reason: \"…\"` in `icon-policy` and a reflection prompt are the same",
    "syntax — so this table is a record of what was decided, over numbers that were not.",
  );
  out.push("");
  out.push("| module | literals | non-ASCII `t()` keys | family |");
  out.push("| --- | --- | --- | --- |");
  for (const row of tsRows) {
    const kinds = (tsFamilyOf.get(row.file) ?? [])
      .map((f) => `\`${f.kind}\``)
      .join("<br>");
    out.push(
      `| \`${row.file.replace(/^src\//, "")}\` | ${row.literals} | ${row.reached} | ${kinds} |`,
    );
  }
  out.push("");
  out.push(`Total: ${tsRows.reduce((n, r) => n + r.literals, 0)} literals across ${tsRows.length} modules.`);
  out.push("");
  out.push(
    "The third column is a number that must be **0**, and the generator refuses to write this",
    "document if it is not: a catalogue key is an identifier, never prose, so a Hungarian letter",
    "inside `t()` is a key nobody can look up. Zero in every row is the result, stated rather than",
    "assumed.",
  );
  out.push("");
  for (const family of TS_FAMILIES) {
    out.push(`- **${family.kind}** — ${family.why}`);
  }
  out.push("");
  out.push("## The literals");
  out.push("");
  out.push(
    "Grouped by file, ordered by round so the list is worked top to bottom. `kind` is the node the",
    "string came out of: `jsx-text` is a label, and the rest are the attribute it was written on.",
  );
  out.push("");
  const sortedFiles = [...byFile.keys()].sort(
    (a, b) => owner.get(a) - owner.get(b) || counts.get(b) - counts.get(a) || a.localeCompare(b),
  );
  for (const file of sortedFiles) {
    out.push(`### ${file} — round ${owner.get(file)}, ${counts.get(file)}`);
    out.push("");
    out.push("```");
    const n = counts.get(file);
    out.push(`${String(n).padStart(3)} ${n === 1 ? "line" : "lines"}`);
    for (const r of byFile.get(file)) {
      out.push(`${String(r.line).padStart(4)}  ${r.kind.padEnd(13)}  ${JSON.stringify(r.text)}`);
    }
    out.push("```");
    out.push("");
  }
  out.push("---");
  out.push("");
  out.push(
    `Summed: ${remaining.reduce((n, r) => n + roundCount(r), 0)} literals across`,
    `${new Set(remaining.flatMap((r) => r.files)).size} files, in ${remaining.length} rounds.`,
  );
  out.push("");
  return out.join("\n");
}

if (process.argv.includes("--md")) {
  mkdirSync(dirname(DOC_PATH), { recursive: true });
  writeFileSync(DOC_PATH, markdown(), "utf8");
  console.log(`wrote ${DOC_PATH}`);
  for (const round of ROUNDS) {
    // `  —` instead of `  0` for a round this walk cannot measure. A console
    // line reading "round 16   0 literals" is a claim, and it would be a false
    // one; the blank says the honest thing in the same width.
    const n = isUnmeasurable(round) ? "—" : String(roundCount(round)).padStart(3);
    console.log(`  round ${String(round.n).padStart(2)}  ${n} literals  ${round.files.map((f) => f.replace(/^src\//, "")).join(", ")}`);
  }
  console.log(`  total  ${unique.length} literals in ${byFile.size} files`);
} else if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ raw: unique, catalogued }, null, 1));
} else {
  console.log(`RAW user-facing Hungarian literals : ${unique.length}`);
  console.log(`  files                            : ${byFile.size}`);
  console.log(`  already catalogued (t() attrs)   : ${catalogued.length}`);
  console.log("");
  for (const [file, rows] of [...byFile].sort()) {
    console.log(`## ${file}  (${rows.length})`);
    for (const r of rows) {
      console.log(`   ${String(r.line).padStart(4)}  ${r.kind.padEnd(13)}  "${r.text}"`);
    }
  }
}