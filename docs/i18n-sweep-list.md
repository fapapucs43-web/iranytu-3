# The i18n sweep list

**Generated file — do not edit by hand.** Run `bun scripts/extract-raw-strings.mjs --md`
and commit the result. `tests/i18n-sweep-list.test.ts` fails if this file and the tree ever
disagree, so a hand-edit is not a shortcut, it is a future red build.

## What this counts, and what it does not

The measurement walks `src/**/*.tsx` and visits the AST. It reads two kinds of node and no
others: `JSXText` (the label between `>` and `<`) and a string-literal `title` /
`placeholder` / `aria-label` / `label` / `summary` / `badge` / `alt` attribute. A comment is
trivia the parser never hands back, and an object literal in `lib/` is not JSX, so neither can
reach this count — which is why the number is reproducible where six regex passes were not.

It is a count of **chrome**, not of every Hungarian word in the app. Two families sit outside it
on purpose, and both are argued in their own files: the reflection prompts in
`src/lib/weeklyReflection.ts` are reader-facing prose that is content rather than chrome, and the
inline workout PROGRAMS in `WorkoutPrograms` are a 76-line content block. A literal that is not
JSX and not a copy attribute — a template literal in a helper, a string handed to `notify()` —
is also outside it. That is the shape of the rule, not an oversight in it.

## The numbers

| | count |
| --- | --- |
| raw literals still to sweep | **6** |
| files holding them | **1** |
| `t()` call sites this walk saw | 286 |
| rounds | 19 (15 measurable, 1 with work left) |

## The rounds

Every count below is computed from the measurement, never written down. The ceiling is
25 literals per round, and this script refuses to generate the document if a round
is over it, if a round names a file `src/` does not contain, if two rounds claim one file, or
if any file with literals is left unclaimed. Those four checks are the reason the table below
can be trusted to still be true next round. A round whose files have nothing left in them is
not an error — it is the end state the sweep is for, and it is listed under **Already swept**.

| round | files | literals | largest file |
| --- | --- | --- | --- |
| 19 | `views/HealthView.tsx` | 6 | `views/HealthView.tsx` (6) |

**Already swept:** round 1, round 2, round 3, round 4, round 5, round 6, round 7, round 8, round 9, round 10, round 11, round 12, round 13, round 14.

**Rounds 15, 16, 17, 18 hold `.ts` files.** This walk is `.tsx`-only,
so it cannot say whether they are done — it never reads them. Their counts above are 0 for
that reason alone, which is why they are not in the **Already swept** line. What each carried:

- **Round 15** — `src/lib/icon-policy.ts`: 48 reader-facing `reason:` strings and four group headings, shown in the Settings disclosure

- **Round 16** — `src/lib/fonts.ts`: a category label and note per group, and a `label`/`hint` pair for every face in the registry

- **Round 17** — `src/lib/onboarding.ts`, `src/lib/weather.ts`, `src/lib/notifications.ts`, `src/lib/foodAi.ts`, `src/lib/healthImport/merge.ts`: the three reminder messages and the two notification titles, the GPS place label, the food-AI prompt (five parts) and its six failures, the macros line and the masked-key line the walk cannot see, the four health-import series names, and the four onboarding tracker pills — 28 strings moved, of which the walk counts 25

- **Round 18** — `src/lib/imageBackground.ts`, `src/lib/voice.ts`, `src/lib/reportPdf.ts`, `src/lib/dates.ts`, `src/lib/yearInPixels.ts`, `src/lib/correlationGrid.ts`, `src/lib/attachments.ts`, `src/lib/analysis.ts`, `src/lib/appLock.ts`, `src/lib/backupDaemon.ts`, `src/lib/backupStorage.ts`, `src/lib/cardStates.ts`, `src/lib/csv.ts`: the whole second walk: eight background labels and failures, the model prompt and six activity tags, the report's twenty headings and quadrant names, nine insight sentences, seven weekday initials, twelve month abbreviations, four outcome names, the empty-card line, three lock messages, three attachment failures, the backup due note and six file-surface strings — 55 measured literals across thirteen modules became 80 keys, because a `.ts` module's unaccented words, its template expressions and the tags only a regex reaches are strings this measurement cannot see

## The `.ts` modules, measured

A second walk, asking a different question: not *what chrome is left* but
*what Hungarian text does a module still hold at all*. It never enters the round table above
— these counts are not a work queue — and `src/lib/i18n.ts` is skipped, because the catalogue
is where Hungarian strings are supposed to live.

The COUNT is measured. The FAMILY is a decision, written into the script, and both directions
are checked: a measured module with no family refuses to generate, and a family naming a file
`src/` does not contain refuses too. A `.tsx` file can tell chrome from content by node kind;
a `.ts` module cannot — `reason: "…"` in `icon-policy` and a reflection prompt are the same
syntax — so this table is a record of what was decided, over numbers that were not.

| module | literals | non-ASCII `t()` keys | family |
| --- | --- | --- | --- |
| `lib/achievements.ts` | 47 | 0 | `registry — the module owns its copy` |
| `lib/assessments.ts` | 40 | 0 | `content — prose the module owns` |
| `lib/backupWordlist.ts` | 615 | 0 | `data — not copy at all` |
| `lib/breathing.ts` | 21 | 0 | `registry — the module owns its copy` |
| `lib/contextOptions.ts` | 13 | 0 | `registry — the module owns its copy` |
| `lib/csv.ts` | 6 | 0 | `ids — Hungarian on purpose` |
| `lib/customTheme.ts` | 16 | 0 | `registry — the module owns its copy` |
| `lib/diets.ts` | 6 | 0 | `content — prose the module owns` |
| `lib/education.ts` | 100 | 0 | `content — prose the module owns` |
| `lib/emotion-vocab.ts` | 23 | 0 | `registry — the module owns its copy` |
| `lib/fitness.ts` | 167 | 0 | `content — prose the module owns` |
| `lib/gad7.ts` | 16 | 0 | `content — prose the module owns` |
| `lib/habits.ts` | 4 | 0 | `registry — the module owns its copy` |
| `lib/icon-policy.ts` | 44 | 0 | `chrome — swept`<br>`ids — Hungarian on purpose` |
| `lib/iconsets.ts` | 11 | 0 | `registry — the module owns its copy` |
| `lib/meditations.ts` | 67 | 0 | `content — prose the module owns` |
| `lib/micro-lessons.ts` | 24 | 0 | `content — prose the module owns` |
| `lib/mood.ts` | 4 | 0 | `registry — the module owns its copy` |
| `lib/nav-icons.ts` | 6 | 0 | `registry — the module owns its copy` |
| `lib/nutrition.ts` | 70 | 0 | `content — prose the module owns` |
| `lib/nutritionTips.ts` | 5 | 0 | `content — prose the module owns` |
| `lib/patternInsights.ts` | 9 | 0 | `content — prose the module owns` |
| `lib/quadrant.ts` | 8 | 0 | `registry — the module owns its copy` |
| `lib/sportTips.ts` | 9 | 0 | `content — prose the module owns` |
| `lib/statsAgg.ts` | 8 | 0 | `registry — the module owns its copy` |
| `lib/store.ts` | 9 | 0 | `registry — the module owns its copy` |
| `lib/themes.ts` | 8 | 0 | `registry — the module owns its copy` |
| `lib/trackers.ts` | 43 | 0 | `registry — the module owns its copy` |
| `lib/weeklyReflection.ts` | 92 | 0 | `content — prose the module owns` |

Total: 1491 literals across 29 modules.

The third column is a number that must be **0**, and the generator refuses to write this
document if it is not: a catalogue key is an identifier, never prose, so a Hungarian letter
inside `t()` is a key nobody can look up. Zero in every row is the result, stated rather than
assumed.

- **chrome — swept** — Reader-facing copy that reached the catalogue: rounds 15 and 16 (the two `.ts` files the `.tsx` walk cannot read), round 17 (the five modules the audit named by hand), and round 18 (the twelve modules this table still owed). Round 18's thirteenth candidate is the row below, and it is the interesting one: `lib/csv.ts` turned out not to be copy.
- **ids — Hungarian on purpose** — Structural ids a lookup matches on. Translating one would break the match, so `chromeByGroup()` keeps them and the DISPLAY name is the key. `lib/csv.ts` joined in round 18 for the same reason and it is worth reading before anyone deletes it: its six Hungarian strings are the header aliases the importer MATCHES on (`idx("date", "dátum", …)`), so translating one would stop a CSV the app itself exported from being read back — and translating them at request time would make one file readable in one language and unreadable in another.
- **registry — the module owns its copy** — A list the module OWNS, with readers on other pages too. The inventory's own rule: a registry gets its own namespace when it is extracted, not before.
- **content — prose the module owns** — Passages, not controls. A meditation or an article needs its own extraction, its own review and its own translator; the questionnaire's crisis NUMBERS are data, and a second copy of them is the one duplication that could hurt somebody.
- **data — not copy at all** — Not something a reader reads: a recovery wordlist, a file name, a storage key. Translating any of it would be wrong.

## The literals

Grouped by file, ordered by round so the list is worked top to bottom. `kind` is the node the
string came out of: `jsx-text` is a label, and the rest are the attribute it was written on.

### src/views/HealthView.tsx — round 19, 6

```
  6 lines
  78  title          "Táplálkozás"
  80  summary        "Ételek, italok és tápanyagok"
 113  title          "Edzés"
 115  summary        "Mozgás, programok és teljesítmény"
 142  title          "Egyéb"
 144  summary        "Vittek, szokások és kérdőívek"
```

---

Summed: 6 literals across
1 files, in 1 rounds.
