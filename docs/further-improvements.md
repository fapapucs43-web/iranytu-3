# Further improvements — after the diet, movement, navigation and state passes

**This file supersedes `docs/final-report.md` §5.** That section's recommended
next batch was to finish i18n, and it did finish: `en` and `de` are complete,
the language switcher shipped, and the `.ts` sweep is closed. This batch then
added the diet type and weekly menus, allergen marking, the movement work
(progression, suggestions, workout types, rest days), a navigation proposal and
the state audit — and each of those five moved the order below.

## 0. How to read this list

Every item is one of three kinds, and the kind decides what "done" means:

- **Defect** — the app says or does something untrue, and a reader loses
  something. Fix it; the item names the guard it would extend.
- **Debt** — the shape is defensible but the decision is owed. Decide first, then
  build; the item names the document that argues it.
- **Feature** — new surface over data that already exists. Schedule it.

Evidence is `file:line` or a number recomputable from the tree. Nothing here is
a roadmap: no dates, no owners, and no claim that an item is safe without its own
tests.

The three defects are ordered by consequence rather than effort: the first loses
the reader's data on a restore, the third misleads them about their own progress,
and the second is a residue.

## 1. Defects

**Closed.** All three were fixed together: §1.1 by putting the food, food-name,
training and diet keys on the included side of the allow-list and correcting the
scope note, §1.2 by the key registry in `src/lib/storageKeys.ts` that
"delete everything" is now derived from, and §1.3 by the reps-and-hold twin of
the weight rule and the trend the card draws from it. The subsections below are
left as they were written — they are the record of the state they describe, and
deleting them would lose the argument that made each fix worth doing. Read them
as history, not as a work queue.

### 1.1 The encrypted backup does not carry the food or the workout data

`BACKUP_INCLUDED_KEYS` (`src/lib/backup.ts`) is fourteen keys, and none of them
is any key this batch's earlier phases write:

| Key | Written by | What a restore loses |
| --- | --- | --- |
| `belso-iranytu-nutrition-log-v1` | `lib/nutrition.ts:330` | every meal and every glass of water |
| `belso-iranytu-custom-foods-v1` | `lib/customFoods.ts:30` | the reader's own food names |
| `belso-iranytu-fitness-v1` | `lib/fitness.ts:423` | every plan and the whole workout log |
| `belso-iranytu-diet-v1` | `lib/diets.ts:73` | the chosen diet |

The first three are LOGS. A reader who restores their backup on a new device
gets their moods, their trackers and their habits back and finds the food and
training halves of the same journal empty — and there is no second copy, because
the bundle is the app's only export of the modules that write them.

**And the app currently says otherwise.** `backup.scopeNote`
(`src/lib/i18n.ts:1698`, `:3094`, `:4276`) reads *"Attachments and the background
image don't go into the backup. They stay on the device."* — which was true when
it was written and is now a scope note for a bundle that omits four more keys,
two of them records the reader cannot rebuild.

**Mechanism:** add the three log keys to `BACKUP_INCLUDED_KEYS`, decide the diet
choice separately (it is a preference rather than a record — the same question
as the locale in §1.2, and the two should be answered together), extend
`backup.scopeNote` in all three locales to name what is excluded, and let the
existing tests that pin both lists carry the change — they already name the
count, so the commit is small and loud. This is one commit, and it is the
highest-value item in this file.

### 1.2 "Minden adat törlése" still leaves eighteen keys

Phase 5's audit closed the class it could see: the eight modules whose exported
reset the wipe never called are called now, and a rule in
`tests/lib/collapsible-audit.test.ts` keeps that class closed. What remains is
the keys with **no reset function at all** — the table in
`docs/collapsible-audit.md` §5, eighteen keys across sixteen module files:
habits, gratitude, CBT records, custom trackers, custom activity labels,
attachments, the emotion vocabulary, onboarding, the locale mirror, the reminder
mirror and its last-fired time, the OpenAI key, the questionnaire log, the two
backup keys and their state, the dormant v1 profile, and the dismissed install
banner. The audit's own count was two short when this file was written; the
literal scan that corrected it is described in that table's introduction,
which is the argument for §1.2's registry rather than one more hand-count.

**Mechanism:** one registry, the shape `lib/backup.ts` already uses for the same
question in the other direction. Each module exports the key it owns and a
reset; the registry asserts that every key the tree writes appears in exactly one
of "cleared by the wipe" and "deliberately kept", and the wipe is derived from
the first list rather than accumulated by memory. Effort: sixteen modules and
their tests, one commit if the registry lands first.

**Two decisions inside it, which is why it is not purely mechanical:** the
**locale** mirror is a preference the reader set, and the app's privacy promise
is about their data — keeping it is defensible and should be written down; the
**OpenAI key** is a secret they pasted, so "delete everything" leaving it on the
device needs a decision either way.

### 1.3 Bodyweight progression is not computed, and the four new templates are entirely bodyweight

`progressionFor` (`src/lib/fitness.ts:747`) builds its best weight from the hits
whose weight is non-null, and `repeated` requires two equal non-null weights
(`:756`–`:765`). Everything downstream is built on those two fields, so for a
bodyweight exercise the card can print exactly one thing — the session count
(`tools.fitness.progressBody`, `src/lib/i18n.ts:2093`) — and
`suggestNextWeight` returns nothing, because the rule it implements is about
kilograms.

That was a fair trade when the twelve templates were mostly loaded. It stopped
being fair in this batch's own third movement commit: **mobility, HIIT, yoga and
walking are 21 exercises and every one of them is `weight: null`.** A reader who
takes the yoga plan, trains it for six weeks and opens the progress panel sees
`Napköszöntő: 9 edzés testsúllyal` and no trend at all.

**Mechanism:** a reps/hold-based twin of the existing rule — same reps twice →
one more rep (or five more seconds), which needs the same parse of the `reps`
string the plan builder already does for `"8–10"` and `"30 másodperc"` — plus a
second summary line in `views/FitnessCard.tsx` where the weight line is. Worth
doing together with a decision about whether bodyweight exercises should record
reps or a duration.

## 2. Debt — decide before building

### 2.1 The navigation (Phase 4)

`docs/nav-rethink.md` argues three options and applies none: a jump layer over
the app's 33 sections (C, cheapest, needs nothing to move), a centre recording
action in the bar (A, what a daily reader notices), and a re-cut around the six
jobs (B, highest cost, drops every stored arrangement). The order argued there is
C → A → B, and the decision owed is whether a centre action is wanted at all.

### 2.2 Two tabs long enough to need their own map

Elemzés has twelve sections and Beállítások eight, both reachable only by
scrolling. Option C exists for this and for nothing else; it can be justified on
these two numbers alone.

### 2.3 The menu composer's two open ends (Phase 2)

- The `other` diet composes **no week** — the card says so rather than inventing
  one (`lib/weeklyMenus.ts`, pinned in `tests/lib/weekly-menus.test.ts`). Whether
  `other` should compose from the whole registry (or offer a picker of the nine
  as a starting point) is a product decision, not a bug.
- Allergen marking holds items back and says what it held back, but the reader
  has no **swap** — the only next step is to compose again. A swap action is the
  natural completion of the warning, and it needs the same name-matching honesty
  the card already states.

### 2.4 Rest days are per plan day, not per week

A rest day is a flag on a day of a plan (`PlanDay.isRest`, Phase 3's third
commit). Nothing lets a reader say "Sunday is always rest", which is the shape
most training weeks actually have. This is a modelling decision first — a weekly
pattern is a second concept beside the plan's day list — and the suggestion
rotation already skips rest days, so it would work if it landed.

## 3. Features worth having

1. **Movement in the insights.** Every logged session carries a `type` since
   Phase 3, and nothing reads it: no chart says how a week was made of strength,
   cardio, mobility, yoga or walks. The data is already there and the tab already
   has the section machinery.
2. **A shopping list from a composed week.** The weekly menus produce seven days
   of named dishes; nothing turns them into a list to take to a shop.
3. **A fourth language is now cheap.** The locale picker needs no edit for a
   language beyond the three (`src/views/SettingsView.tsx:153` derives it from
   `SUPPORTED_LOCALES`), so the work is a catalogue plus a `COMPLETE_LOCALES`
   row — the shape rounds 19 and 20 established.
4. **Year-over-year in Elemzés and the CSV column documentation** — carried over
   from `docs/final-report.md` §5, still open, still argued there.

## 4. Owed verification, not features

1. **The browser walkthrough.** No session has driven the built app in a real
   browser, and this batch made that debt larger: four new templates, a diet
   picker, a seven-day menu composer, allergen warnings and a rest-day toggle
   are all verified through the suite and the typechecker, and none through a
   person opening the app.
2. **One visual pass at the reader's largest type size.** The diet rows, the
   menu day rows and the rest-day button are new hit targets, and the 44 px floor
   in `docs/ux-audit-phase1.md` has not been re-measured against them.

## 5. What this list is not

- **Not a claim that the app is unfinished.** The three defects are bounded and
  named; nothing in §2–§4 is required for the app to work.
- **Not a measurement of what readers want.** Nothing here counts usage, because
  the app keeps no such log by design. §2 and §3 are argued from the tree and
  from the audits, not from behaviour.
- **Not an audit of the audit.** Phase 5's method (read the tree, compare the key
  owners against the wipe) is repeatable and its guard is in the suite; a future
  pass can re-run it instead of re-reading that document.
