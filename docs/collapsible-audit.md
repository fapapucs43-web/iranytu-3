# Collapsible cards and the state they keep — Phase 5's audit

One question, asked of the whole tree: **what does this app remember about the
reader that is not the journal, and does *Minden adat törlése* remove it?**

The collapse map is the case the phase is named for — cards that remember
whether they were open are the first place view state became storage — but the
walk that answered it found a larger hole beside it, so this record covers both:
what was audited, what the audit found, what this commit fixed, and the part it
deliberately did not touch.

The guard that keeps the answers true is `tests/lib/collapsible-audit.test.ts`;
the two code changes are `src/lib/cardStates.ts` (a production reset) and the
delete-all chain in `src/views/SettingsView.tsx`.

## Method

Four passes, all of them over the tree rather than over a running app:

1. **The collapsible mounts.** Every `<CollapsibleCard …>` in `src/**/*.tsx`,
   with the `id` it passes and whether it passes a `summary`. The one dynamic id
   (`tracker-${head.id}`) is expanded through `trackerGroupHeads()`, because a
   pattern that hides seven ids is exactly where a collision would hide.
2. **The other primitive.** Every `<Collapsible …>` — the session-local drawer —
   because the interesting question about a remembering card is which cards were
   deliberately NOT given the remembering primitive.
3. **The storage keys.** Every `belso-iranytu*` key a `src/lib` module assigns
   to a constant, next to every `export function reset…` that module exports.
4. **The wipe.** The confirm handler of *Minden adat törlése* in
   `SettingsView.tsx`, sliced out as source and compared against pass 3: which
   resets it calls, and which exported resets it never does.

Passes 1–2 are what a render cannot see (`renderToStaticMarkup` runs no effects
and the detail blocks sit behind component state), and pass 3 is why nothing in
this audit is asserted from memory.

## 1. The inventory

**27 remembering mounts, 33 ids, in 15 files.** Every id is unique, and every
mount passes a summary.

| Surface | Mounts | Ids |
| --- | --- | --- |
| `views/SettingsView.tsx` — the twelve settings rows | 12 | `settings-profile`, `settings-language`, `settings-accessibility`, `settings-font`, `settings-iconset`, `settings-theme`, `settings-background`, `settings-navigation`, `settings-trackers`, `settings-modules`, `settings-privacy`, `settings-mood-flow` |
| `views/ToolsView.tsx` — the two transparency cards | 2 | `settings-nutrition-tips`, `settings-sport-tips` |
| `components/TrackerInputs.tsx` — one mount, seven groups | 1 → 7 ids | `tracker-nutrition`, `tracker-sleep`, `tracker-sport`, `tracker-steps`, `tracker-symptoms`, `tracker-vitamins`, `tracker-weather-condition` |
| `components/` — one card each | 12 | `fitness-plans`, `nutrition-log`, `food-photo`, `food-ai-settings`, `health-import`, `weather-api`, `settings-allergies`, `insights-achievements`, `insights-correlation`, `insights-lag`, `insights-monthly-yearly`, `insights-report-export` |

Fifteen ids carry a `settings-` prefix while only twelve of them are drawn by
the Settings tab: `settings-allergies` belongs to a card mounted from Settings
but declared in its own component, and the two transparency cards moved to the
toolbox in Phase 1 of the tools split and kept their ids. That is deliberate —
an id is the vocabulary of the state key, so renaming one to match a move drops
the state of every reader who had that card open — and it is now pinned in one
place so the next reader does not "fix" it.

## 2. The four rules the inventory is held to

1. **Every remembering card carries an id**, and no two mounts share one. A
   shared id is one stored boolean driving two buttons: collapsing the food log
   would collapse whatever else claimed `nutrition-log`, and the reader would
   report a card that "sometimes jumps".
2. **Every remembering card can say what it holds while collapsed.** The
   summary is why remembering is allowed at all: a card that remembers being
   closed without a summary is a title and a chevron, and a reader cannot tell
   an empty one from a full one. All 27 pass one.
3. **The id vocabulary is frozen.** It is listed as an equality in the guard, so
   a rename fails a test that names both ids rather than silently returning a
   reader's Settings tab to its defaults.
4. **Only the cards that promise to remember use the remembering primitive.**
   The six session-local `Collapsible` mounts — the toolbox drawers
   (`views/ToolsView.tsx`), the search panel (`views/JournalView.tsx`), the
   "more" panel (`views/InsightsView.tsx`), the data and voice panels
   (`views/SettingsView.tsx`) and the editorial programs
   (`components/WorkoutPrograms.tsx`) — are pinned as a set, because a drawer a
   reader opens to do one thing and closes again is the case where remembering
   would be a worse experience, not a missing feature.

## 3. Where collapse state lives, and what was missing

The state is one key — `belso-iranytu:cardStates`, `{ id: collapsed }` — read
lazily once per process and written through on every toggle. Two boundaries
follow from that, and the audit checked both:

- **The backup bundle excludes it, by name.** It is in `BACKUP_EXCLUDED_KEYS`
  rather than merely absent from `BACKUP_INCLUDED_KEYS`, because a restore on
  another device must not rearrange a reader's cards from a file they copied for
  their *data*. Pinned both ways in the guard.
- **The wipe did not clear it.** *Minden adat törlése* had grown one call per
  batch — the PIN, the fired-reminder marks, the education read markers, the
  seen lessons, the weekly answers, the wallpaper — and the collapse map was
  never added. A reader who deleted everything came back to the same
  open/collapsed arrangement, which is a residue of what this device had shown
  them, even if it is not personal data.

**Fixed:** `cardStates.ts` now exports a production `resetCardStates()` — delete
the blob *and* forget the cache, as opposed to `resetCardStatesForTests`, which
deliberately leaves the blob so a write → reload round trip stays testable — and
the wipe calls it.

## 4. The larger finding: seven resets that existed and were never called

The same pass 3/4 comparison turned up something worse than the collapse map.
Seven modules own a stored record, export a reset that clears it in memory and
in storage and notifies their listeners, and the wipe never called any of them:

| Module | Key | What stayed on the device |
| --- | --- | --- |
| `lib/nutrition.ts` | `belso-iranytu-nutrition-log-v1` | every meal and water entry |
| `lib/customFoods.ts` | `belso-iranytu-custom-foods-v1` | the reader's own food names |
| `lib/diets.ts` | `belso-iranytu-diet-v1` | the chosen diet |
| `lib/fitness.ts` | `belso-iranytu-fitness-v1` | every plan and the whole workout log |
| `lib/experiments.ts` | `belso-iranytu-experiments-v1` | every experiment and its ratings |
| `lib/achievements.ts` | `belso-iranytu-achievements-seen` | which badges had been shown |
| `lib/featureFlags.ts` | `belso-iranytu-feature-flags-v1` | the one-off event flags |

Two of those docblocks already claimed the opposite:

- `resetExperiments()` — *"Test seam, and what the app's own 'delete everything'
  does for this key."*
- `resetEventFeatures()` — *"Forgets every flag. Used by the tests and by 'delete
  everything'."*

A comment that describes a call nobody makes is worse than a missing one,
because it is the thing a reader checks instead of the call site. All seven are
now called from the chain, alongside `resetCardStates()`, and the guard is
written as a rule rather than as a list: **every `export function reset…` in
`src/lib` that is not a `…ForTests` seam must appear in the wipe chain, unless it
is named in the guard's `NOT_DATA` set with a written reason.** The one entry
there today is `resetFontCache` — a session cache of which font files the browser
has registered, holding nothing stored; the reader's chosen family lives in
settings, which the wipe empties.

## 5. What this audit does NOT fix, and why it is written down

The keys with **no reset function at all** are outside this commit, and they are
the honest remainder of the question in the title. **Eighteen keys, across
sixteen module files** (two of them own two keys each) — counted by scanning
every `belso-iranytu*` string
literal in `src/**/*.ts(x)` and subtracting the ones the wipe now clears. The
count is prose rather than a guard because deriving it automatically means
knowing which reset clears which key, and that mapping is exactly what §1.2 of
`docs/further-improvements.md` proposes to build:

| Module | Key | Note |
| --- | --- | --- |
| `lib/habits.ts` | `belso-iranytu-habits-v1` | streaks and daily checks |
| `lib/gratitude.ts` | `belso-iranytu-gratitude` | the gratitude list |
| `lib/cbt.ts` | `belso-iranytu-cbt-records` | CBT worksheets |
| `lib/customTrackers.ts` | `belso-iranytu-custom-trackers` | the reader's own tracker definitions |
| `lib/customActivities.ts` | `belso-iranytu-custom-activities` | the reader's own activity labels |
| `lib/attachments.ts` | `belso-iranytu-attachments` | photo and file bytes |
| `lib/store.ts` | `belso-iranytu-emotion-vocab` | the reader's own emotion words (written by the store, read by the recording flow) |
| `lib/onboarding.ts` | `belso-iranytu-onboarding` | whether the tour was seen |
| `lib/i18n.ts` | `belso-iranytu-locale` | the chosen language — a preference, and the one key here that a wipe arguably *should* keep |
| `lib/reminderDaemon.ts` | `belso-iranytu-reminder-last` | when the daily nudge last fired |
| `lib/notifications.ts` | `belso-iranytu-reminder-message` | which reminder wording is in use |
| `lib/foodAi.ts` | `belso-iranytu:openai-key` | a user-supplied secret — the key a reader is most likely to expect a wipe to remove |
| `lib/assessmentStore.ts` | `belso-iranytu-assessments-v1` | the questionnaire log (PHQ-8 and the check-in that keeps one). The consent switch in Settings clears it, and delete-everything does not — the one entry here with a second owner |
| `lib/backupStorage.ts` | `belso-iranytu-mentes`, `belso-iranytu-backup` | the encrypted backup and its deriver |
| `lib/backup.ts` | `belso-iranytu-backup-state` | what this device knows about its own backup |
| `lib/store.ts` | `belso-iranytu-profile` | the v1 profile. Its sibling, the v1 journal, IS removed by `resetAll`; this one is left, and it is dormant rather than live because migration only runs when the v2 key is absent (`store.ts:108`) and the wipe writes an empty v2 blob |
| `components/InstallPrompt.tsx` | `belso-iranytu-install-banner-dismissed` | a dismissed banner; harmless, and left for the same reason as the locale |

The mechanism that would close this is a **key registry** — the shape
`lib/backup.ts` already uses for the same question in the other direction, with
`BACKUP_INCLUDED_KEYS` and `BACKUP_EXCLUDED_KEYS` asserted against the modules
that own the keys — so that "delete everything" is derived from a list rather
than accumulated by memory. That is a change to fourteen modules and their
tests, and it belongs in `docs/further-improvements.md` (Phase 6) as a named
follow-up with this table as its evidence, not in a commit about collapse state.

Two entries are decisions rather than omissions: the **locale** is a
preference the reader set deliberately, and the app's promise is about their
data; the **openai key** is a secret they pasted, and leaving a key on a device
after "delete everything" is a decision worth taking on purpose. Both are named
here so the next pass argues them instead of rediscovering them.

## 6. What this audit does not establish

- **No claim that every key is now cleared.** §5 is the list of what is not, and
  it is deliberately longer than the list of what this commit fixed.
- **No measurement of the maps' size.** Collapse state and the eight fixed
  modules are all bounded by their own ids or caps; the stale-id question (a card
  renamed in an old version leaving one orphan entry in the collapse map) is
  real, bounded by the app's own card count over its lifetime, and not worth a
  pruning pass that would have to know the mounted set at runtime.
- **No render of a collapsed card.** Every inventory claim is about the tree:
  which mounts remember, under which ids, with which summary. That a given card
  renders its summary correctly is pinned where a render can see it —
  `tests/batch11-collapse.test.ts`.
- **No change to what a backup carries.** The exclusion of collapse state is
  older than this audit; the audit pinned it rather than reconsidered it.
