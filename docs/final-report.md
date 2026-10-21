# Final report — Belső Iránytű

Written at the close of the Batch 14 work, on `main` at **`aab35fe`** (the merge
of PR #56; its predecessor is `4bddcee`, the merge of PR #55). Date: 2026-10-07.
App version `2.0.1`.

This is the one document a future session can read first and from which it can
plan. Every number below was measured on this tree; where a number is *also*
guarded by a test, the guard is named, because a number that nothing re-measures
is a memory rather than a fact. The deeper records are
`docs/PROJECT-INVENTORY.md` (the annotated map of the tree, whose claims are
re-read by `tests/batch13-inventory.test.ts`), `docs/final-audit-v6.md` (the
audit this report succeeds) and one `docs/*.md` record per batch.

## 0. The state of the tree

| | |
| --- | --- |
| Branch | `main` @ `aab35fe` (PR #56 merged, `348adaa` + `49275af` inside it) |
| Version | `2.0.1`, `package.json` (no test framework, no runtime dependency added since v2) |
| Production | `https://iranytu2.freebuff.app`, deployment state `active`, 0 unresolved build errors |
| Byte-verify | a fresh `bun run build` of this commit emits `index-7-uOyf9j.js` (`sha256 7dad63eb…d81ab`) and `index-BWFV_f0_.css` (`sha256 6232456b…86f61`) — both **byte-identical to what production serves** |
| Source | 155 files under `src/`, of which 81 are modules in `src/lib/` with no React import except `icons.tsx` |
| Tests | **102 files, 3089 tests, 186 058 `expect()` calls** — green |
| i18n | `src/lib/i18n.ts`, **948 keys**, Hungarian is the source of truth |
| Gates per commit | `bun run typecheck` (`tsc -b --noEmit`), `bun test`, `bun run build` |

History: Batches 1–12, A/B/C and 13–14, each landed as its own PR with a
`docs/` record and, where the batch renamed or moved something, a re-measured
inventory in the same commit.

## 1. Feature list (complete)

### The five views

The tab bar holds five tabs and one `useState`; the order is the reader's
(`settings.tabOrder`), and every tab's *sections* are reorderable too.

- **Ma (Today)** — 5-level mood picker with the emoji registry, stress and
  energy sliders, daily goals, balance score, the quadrant recorder (Érzés és
  kontextus), note, activities (built-in + custom), emotions (default + custom
  vocabulary), attachments (photo/video/audio), tracker inputs (built-in +
  custom), voice recording (offline Hungarian keyword parser; optional OpenAI
  `gpt-4o-mini` JSON path with offline fallback), the weather tracker group
  (manual or API), and the gratitude journal.
- **Napló (Journal)** — month calendar with mood colours, real streak, search,
  mood filter, entry detail with edit and delete, and the Year-in-Pixels view.
- **Elemzés (Insights)** — weekly summary, mood curve with a period switcher,
  activity–mood correlation, monthly/yearly stats, the correlation grid
  (built-in outcomes + custom numeric tracker columns), lag analysis (24h/48h),
  pattern insights, quadrant insight cards, habit streaks, achievements, and
  self-experiments.
- **Felfedezés (Discovery)** — the tab is named `Felfedezés` (Batch 14 renamed
  it from `Eszköztár`; the catalogue key moved with the name, from
  `today.toolbox.title` to `tools.title`). Five drawers, named for the work
  rather than for the components, and the drawer *ids* (`therapy`, `self`,
  `health`, `experiments`, `education`) stay the vocabulary a stored
  arrangement names:
  - **Terápia** — CBT thought record, the breathing exercise (4-4-4 plus
    siblings), the ten guided meditations, the crisis card.
  - **Önismeret** — gratitude, habits, the weekly reflection, emotion and
    context work.
  - **Egészség** — the vitals form (sleep, pulse, HRV), the medication list and
    its times, and the **seven-question check-in** ("Feszültség és aggodalom").
  - **Kísérletek** — self-experiments: the reader's own hypothesis and its
    three-day verdict.
  - **Tanulás** — the education library (fifteen articles, with read markers)
    and the micro-lessons the recording flow hands out.
- **Beállítások (Settings)** — name and goal, module on/off, reminders, text
  size (normal/large/x-large), high contrast, theme (auto/light/dark/warm/
  vibrant/custom editor), the font picker (10 UI faces + handwriting, grouped,
  with the honest byte cost), the icon-set picker (lucide/system/fluent, with
  attribution and retired-set repair), the background image (3 fits, blur,
  scrim, card transparency — the two sliders independent by design), tab and
  section reordering on all five tabs, tracker on/off, PIN lock, encrypted
  backup and export, health import, the food-AI key management, and the install
  prompt.

### Speciality modules

- **CBT** — thought record (situation → automatic thought → emotion → distress
  before/after → evidence for and against → balanced thought), the mood shift
  computed per record and averaged, a 200-record cap.
- **Breathing** — one paced engine (start/pause/resume) behind the 4-4-4 and its
  siblings plus custom patterns; **Meditation** — ten text-only practices on the
  same engine.
- **Habits** — custom habits, per-day toggle, streak and weekly count.
- **Medication** — the med list with per-med times and a reminder switch, the
  dose gate (module → meds → permission → due), fired-key dedup, scheduler card.
- **PHQ-8 self-assessment** — 9 items plus the functional-impact question, a
  consent screen with source attribution, score → band (never a diagnosis), a
  needs-support flag, a log, disclaimers everywhere.
- **GAD-7 check-in (Batch 14)** — seven items sharing the questionnaire's own
  response scale and maximum, all on one screen, with a score, four descriptive
  bands and both the pre-run and post-run sentences saying that **nothing is
  stored**. It is deliberately **not gated**: it writes nothing, so a consent
  gate would guard nothing; a reader who wants a log uses the PHQ-8/GAD-7
  questionnaire, which does store. The instrument is named in exactly one
  user-facing sentence, shared by the result panel's disclaimer and the crisis
  list: `crisis.disclaimer`, the single source of every crisis number.
- **Encrypted backup** — one file, three wrap slots (passkey / password /
  12-word recovery code with checksum), AES-GCM 256 + HKDF, per-path HKDF info
  strings, a restore report, rotation, and daemon reminders. The bundle is an
  allow-list of fourteen keys, asked for by name, never an enumeration.
- **App lock** — a 4–6 digit PIN, PBKDF2, weak-PIN refusal, attempt cooldown,
  session lock.
- **Food AI** — photo → calories/macros through OpenAI, the key stored locally
  and never bundled, the result written into tracker values, an offline refusal
  ladder.
- **Health import** — Apple Health (stream, with a DOM fallback) and Google Fit,
  a preview (applies/preserves/skips) and then an additive merge, with optional
  entry stubs.
- **Weather** — a manual city or GPS, open-meteo geocode and forecast, the WMO
  condition in Hungarian, a cache that keeps today fresh and the past immutable.
- **Crisis support** — an always-available crisis card with Hungarian resources,
  reached from four places and resting on one list.
- **PWA** — an offline service worker with a 39-entry precache, an install
  prompt, offline-first storage.

### Platform

React 18 + TypeScript + Vite, no backend, no account, no analytics, no ads, no
router. Four React contexts, each with a single writer. All data is
`localStorage` plus the IndexedDB/OPFS handles behind the backup picker.
Self-hosted OFL fonts, subsetted, with `ő`/`ű` verified *from the bytes*
(`src/lib/font-cmap.ts` reads the real `cmap`, and it is the one module that is
deliberately absent from the shipped bundle). A staged i18n framework: 948 keys,
Hungarian source, partial `en`/`de` by design, `t()` falling back twice
(requested locale → Hungarian → the key itself, so a missing key is visibly
broken rather than invisible). An icon policy that separates content icons from
chrome icons, shown in Settings. The PDF report behind a dynamic import, on its
own subsetted typeface.

## 2. Storage keys (complete)

**Thirty-two real keys, in three shapes.** Twenty-nine carry the
`belso-iranytu-` / `belso-iranytu:` shape — the inventory's §5 table, and the
shape the inventory guard's own regex counts. Two more sit under a **slash**
namespace that regex cannot see, which is why they are not in that table and
why they are named here: `belso-iranytu/weather-cache/v1` (the forecast cache —
a "today" row is re-fetched after six hours, a past day never is) and
`belso-iranytu/weather-places/v1` (a place name resolved once, misses included).
The last one is prefixless and belongs to v1: `daily-goals`.

The guard's `storageKeys` is 32, and three of the 32 are namespaced identifiers
rather than keys — it counts every string matching `belso-iranytu` in `src/` and
`public/sw.js`, including comments, so the number is honestly a count of
*namespaced identifiers*: `belso-iranytu-mentes` (a backup file-name prefix),
`belso-iranytu-backup` (an IndexedDB database name) and
`belso-iranytu-mood-v2-done` (written nowhere — it survives only inside a
comment, which the guard counts and cannot tell apart). The table below is
`docs/PROJECT-INVENTORY.md` §5, which is what that guard re-reads — plus the two
slash keys and `daily-goals` named above.

| Key | Owner | Role |
| --- | --- | --- |
| `belso-iranytu-data-v2` | `src/lib/store.ts` | the journal: entries, settings, profile, goals, medications, `tabOrder`, `sectionOrder` |
| `belso-iranytu-emotion-vocab` | `src/lib/store.ts` | the reader's own emotion words |
| `belso-iranytu:cardStates` | `src/lib/cardStates.ts` | which collapsible cards the user left open |
| `belso-iranytu-attachments` | `src/lib/attachments.ts` | photo, audio and video blobs (every blob lives *inside* this one key, indexed by id — there is no per-blob key) |
| `belso-iranytu-background` | `src/lib/imageBackground.ts` | the one backdrop, with its own 8 MB cap |
| `belso-iranytu-custom-trackers` | `src/lib/customTrackers.ts` | user-defined trackers |
| `belso-iranytu-custom-activities` | `src/lib/customActivities.ts` | user-defined activities |
| `belso-iranytu-assessments-v1` | `src/lib/assessmentStore.ts` | self-assessment results |
| `belso-iranytu-experiments-v1` | `src/lib/experiments.ts` | self-experiments |
| `belso-iranytu-feature-flags-v1` | `src/lib/featureFlags.ts` | "has done this at least once", for the three actions that leave no record |
| `belso-iranytu-habits-v1` | `src/lib/habits.ts` | habit streaks |
| `belso-iranytu-gratitude` | `src/lib/gratitude.ts` | gratitude entries |
| `belso-iranytu-cbt-records` | `src/lib/cbt.ts` | thought records |
| `belso-iranytu-app-lock` | `src/lib/appLock.ts` | the PIN, as a hash |
| `belso-iranytu-app-lock-session` | `src/lib/appLock.ts` | unlock state for this session (sessionStorage) |
| `belso-iranytu-onboarding` | `src/lib/onboarding.ts` | which onboarding steps are done |
| `belso-iranytu-achievements-seen` | `src/lib/achievements.ts` | badges already announced |
| `belso-iranytu-med-reminders-fired` | `src/lib/medReminders.ts` | doses already notified today |
| `belso-iranytu-reminder-last` | `src/lib/reminderDaemon.ts` | the daily nudge's last fire time |
| `belso-iranytu-reminder-message` | `src/lib/notifications.ts` | which reminder wording is in use |
| `belso-iranytu-install-banner-dismissed` | `src/components/InstallPrompt.tsx` | do not show the install banner again |
| `belso-iranytu:openai-key` | `src/lib/foodAi.ts` | an optional user-supplied key, stored locally only |
| `belso-iranytu-seen-lessons` | `src/lib/micro-lessons.ts` | the micro-lessons already offered |
| `belso-iranytu-backup-state` | `src/lib/backup.ts` | what this device knows about its own backup — nothing secret |
| `belso-iranytu-education-read` | `src/lib/education.ts` | which of the fifteen articles have been opened |
| `belso-iranytu-weekly-answers` | `src/lib/weeklyReflection.ts` | the weekly reflection's answer mirror |
| `belso-iranytu-weekly-skip` | `src/lib/weeklyReflection.ts` | which weeks were skipped rather than answered |
| `belso-iranytu/weather-cache/v1` | `src/lib/weather.ts` | the forecast cache: one JSON array, oldest evicted first, today re-fetched after six hours and a past day never |
| `belso-iranytu/weather-places/v1` | `src/lib/weather.ts` | a place name resolved once per name, with its misses cached too |
| `belso-iranytu-data` | `src/lib/store.ts` | v1 journal, read-only, migrated on load |
| `belso-iranytu-profile` | `src/lib/store.ts` | v1 profile, read-only |
| `daily-goals` | `src/lib/store.ts` | v1 goals, read-only, no prefix |

**The backup allow-list — fourteen keys, asked for by name**
(`src/lib/backup.ts`, `BACKUP_INCLUDED_KEYS`): the store, the emotion
vocabulary, custom trackers, custom activities, the assessments, the
experiments, the habits, gratitude, the CBT records, onboarding, the feature
flags, the seen badges, the seen lessons and the reminder wording.

**The nine exclusions, each a decision rather than an oversight**
(`BACKUP_EXCLUDED_KEYS`): the attachments, the background image (bulky
binaries, and the settings copy names them anyway), the OpenAI key (a secret
that must never enter a cloud file), the PIN and its unlock session, the card
layout, the fired-dose bookkeeping, the daily-nudge timestamp, the install
banner's dismissal — and the v1 leftovers, because restoring those would offer
an already-migrated store to the migrator a second time.

Not `localStorage`, and worth naming so nobody goes looking: the backup file
handle and its blobs live in IndexedDB/OPFS behind `src/lib/backupStorage.ts`,
the download artefacts (`belso-iranytu-export.csv`, `belso-iranytu-mentes…`)
are file names rather than keys, and the bare `belso-iranytu` is the bundle's
own `app` marker (`BACKUP_BUNDLE_APP`) — the string a restore reads to know the
file is this app's before it touches a single key.

## 3. Tests (measured)

**102 files, 3089 tests, 186 058 `expect()` calls, 38 414 lines** — all green,
and the per-file counts below are re-measured on every run by
`tests/batch13-inventory.test.ts`, which reads the same table in
`docs/PROJECT-INVENTORY.md` §10. The runner is bun's own; no test framework is a
dependency.

| Group | Files | Tests |
| --- | --- | --- |
| `tests/` — guards and cross-cutting invariants | 50 | 2142 |
| `tests/lib/` — one file per library module | 36 | 689 |
| `tests/components/` — rendered markup | 9 | 155 |
| `tests/views/` — the five views as structures | 5 | 73 |
| `tests/integration/` + `tests/migration/` | 2 | 30 |

| File | Tests |
| --- | --- |
| `tests/background-stack.test.ts` | 24 |
| `tests/batch-C.test.ts` | 67 |
| `tests/batch1.test.ts` | 10 |
| `tests/batch10.test.ts` | 18 |
| `tests/batch11-collapse.test.ts` | 41 |
| `tests/batch11-nutrition.test.ts` | 29 |
| `tests/batch11-polish.test.ts` | 24 |
| `tests/batch11-sport.test.ts` | 30 |
| `tests/batch11-tabs.test.ts` | 26 |
| `tests/batch12-css.test.ts` | 7 |
| `tests/batch12-dead-export.test.ts` | 9 |
| `tests/batch12-lato.test.ts` | 18 |
| `tests/batch12-media.test.ts` | 17 |
| `tests/batch12-theme.test.ts` | 19 |
| `tests/batch13-cmap.test.ts` | 41 |
| `tests/batch13-color-scheme.test.ts` | 25 |
| `tests/batch13-inventory.test.ts` | 16 |
| `tests/batch2.test.ts` | 12 |
| `tests/batch3.test.ts` | 38 |
| `tests/batch4.test.ts` | 44 |
| `tests/batch5-legacy-store.test.ts` | 12 |
| `tests/batch5-typography.test.ts` | 65 |
| `tests/batch5.test.ts` | 654 |
| `tests/batch6-pdf.test.ts` | 6 |
| `tests/batch6-ui.test.ts` | 40 |
| `tests/batch6.test.ts` | 67 |
| `tests/batch7-store.test.ts` | 10 |
| `tests/batch7-ui.test.ts` | 37 |
| `tests/batch7.test.ts` | 41 |
| `tests/batch7b.test.ts` | 37 |
| `tests/batch7d.test.ts` | 36 |
| `tests/batch7e.test.ts` | 64 |
| `tests/batch7f.test.ts` | 143 |
| `tests/batch7g.test.ts` | 16 |
| `tests/batch7h.test.ts` | 26 |
| `tests/batch7i-ui-fonts.test.ts` | 71 |
| `tests/batch7i.test.ts` | 20 |
| `tests/batch8-typography.test.ts` | 46 |
| `tests/batch8b-weather.test.ts` | 17 |
| `tests/batch9.test.ts` | 21 |
| `tests/card-contrast.test.ts` | 62 |
| `tests/contrast.test.ts` | 34 |
| `tests/full-system.test.ts` | 16 |
| `tests/full-system-v2.test.ts` | 36 |
| `tests/fonts-i18n.test.ts` | 9 |
| `tests/icon-policy-i18n.test.ts` | 7 |
| `tests/i18n-sweep-list.test.ts` | 5 |
| `tests/phase2.test.ts` | 10 |
| `tests/phase3.test.ts` | 12 |
| `tests/phase4.test.ts` | 7 |
| `tests/lib/image-background.test.ts` | 54 |
| `tests/lib/backupStorage.test.ts` | 34 |
| `tests/lib/i18n.test.ts` | 36 |
| `tests/lib/experiments.test.ts` | 30 |
| `tests/lib/backupDaemon.test.ts` | 29 |
| `tests/lib/section-order.test.ts` | 16 |
| `tests/lib/pattern-insights.test.ts` | 29 |
| `tests/lib/backupKey.test.ts` | 28 |
| `tests/lib/micro-lessons.test.ts` | 26 |
| `tests/lib/weekly-reflection.test.ts` | 25 |
| `tests/lib/feature-use.test.ts` | 24 |
| `tests/lib/meditations.test.ts` | 23 |
| `tests/lib/backup.test.ts` | 22 |
| `tests/lib/education.test.ts` | 20 |
| `tests/lib/gad7.test.ts` | 28 |
| `tests/lib/feature-flags.test.ts` | 20 |
| `tests/lib/dynamic-ink.test.ts` | 30 |
| `tests/lib/backupCrypto.test.ts` | 19 |
| `tests/lib/precache.test.ts` | 19 |
| `tests/lib/breathing-consolidation.test.ts` | 26 |
| `tests/lib/crisis-card.test.tsx` | 18 |
| `tests/lib/ring-tokens.test.ts` | 18 |
| `tests/lib/artwork-split.test.ts` | 11 |
| `tests/lib/store-import-repair.test.ts` | 11 |
| `tests/lib/store-section-order-repair.test.ts` | 7 |
| `tests/lib/background-app.test.ts` | 11 |
| `tests/lib/context.test.ts` | 10 |
| `tests/lib/emotion-vocab.test.ts` | 9 |
| `tests/lib/quadrant-correlations.test.ts` | 9 |
| `tests/lib/recording-storage.test.ts` | 9 |
| `tests/lib/voice-bundle.test.ts` | 9 |
| `tests/lib/quadrant.test.ts` | 8 |
| `tests/lib/recording-settings.test.ts` | 7 |
| `tests/lib/year-in-pixels-quadrant.test.ts` | 6 |
| `tests/lib/a11y-names.test.ts` | 4 |
| `tests/lib/backupWordlist.test.ts` | 4 |
| `tests/components/backup-settings-card.test.tsx` | 50 |
| `tests/components/BackgroundImagePicker.test.tsx` | 26 |
| `tests/components/MicroLessonCard.test.tsx` | 10 |
| `tests/components/section-list.test.tsx` | 12 |
| `tests/components/PatternInsightsCard.test.tsx` | 9 |
| `tests/components/recording-flow-ui.test.ts` | 18 |
| `tests/components/pin-lock-gate-cooldown.test.ts` | 10 |
| `tests/components/Gad7Card.test.tsx` | 15 |
| `tests/components/EducationLibraryCard.test.tsx` | 5 |
| `tests/views/section-structure.test.ts` | 15 |
| `tests/views/insights-split.test.ts` | 9 |
| `tests/views/coverage-guard.test.ts` | 13 |
| `tests/views/section-reorder-integration.test.tsx` | 26 |
| `tests/views/tools-split.test.ts` | 13 |
| `tests/integration/recording-flow.test.ts` | 10 |
| `tests/migration/mood-v2.test.ts` | 20 |

What the suite is *for*, beyond the count: it proves a component is mounted (the
assertions run on real markup from `renderToStaticMarkup` under the real
providers), it refuses to let a file escape its batch (the scope guard diffs the
tree), and it fences other tests' state (the store is a module binding shared
across the whole run). The two `full-system` files are the only whole-app
witnesses — fifteen journeys over a thin fake window and thirty more over the
real modules, each carrying the mutations it exists to catch.

## 4. Open items

Everything known open, grouped by kind so that none of it reads as a defect
that is being quietly tolerated.

### Known limits (constraints by design, not defects)

- **No browser in CI.** There is no DOM in the suite, by design:
  `renderToStaticMarkup` proves wiring, not pixels. Visual and interactive
  verification is manual, and the batch work has now and then paid for that —
  the check-in card lives in a *closed* drawer, so the tab's own render never
  sees it (its mount is proven at source level, in `tests/views/tools-split.test.ts`).
- **The check-in's `finish()` early return** (`if (!complete) return;`) is not
  directly exercised: the button's disabled state and the second-gate sentence
  are pinned, and the safety net is the module's own throw on an incomplete
  answer sheet, which is tested.
- **Contrast numbers are worst-case composites** over an adversarial picture and
  the most hostile tint — a bound, not a promise per photograph.
- **Muted ink stops early** on a hostile backdrop (a measured 8–24% ceiling);
  the card slider itself runs the whole 0–100%.
- **The `en`/`de` catalogues are complete** — 1 137 keys each, every placeholder
  preserved and no value with a leading or trailing space. They landed staged:
  three keys and two keys against 1 137, so that the per-key fallback to
  Hungarian was exercised by the shipped app rather than only by a test, and
  then the rest in rounds 20a and 20b. `COMPLETE_LOCALES` in
  `tests/lib/i18n.test.ts` names them, so "this language is done" is a decision
  a reviewer sees rather than something the file infers about itself.
- **Weather and food AI need the network**; everything else is fully offline.
  The food-AI key leaves the device only for OpenAI over TLS.
- **The PDF fold** is the offline path, because jsPDF's built-ins cannot draw
  `ő`/`ű`; the embedded subsetted font is the normal path and is proven in a
  subprocess against the real library.
- **Voice parsing** is keyword-based offline; accents and free phrasing degrade
  it, by design rather than by oversight.

### Open items (work that is owed)

- **The i18n `.ts` rounds are CLOSED.** The `.tsx` sweep reads 0 raw literals
  across eighteen rounds, and rounds 15–18 took every `.ts` module the second
  walk named. Round 18 emptied the `chrome — a round is owed` family outright,
  so the generator no longer writes that heading — what remains in the table is
  14 `registry — the module owns its copy`, 9 `content — prose the module
  owns`, and 1 `data — not copy at all`, each a deliberate classification rather
  than debt. The list is re-derived by `bun scripts/extract-raw-strings.mjs
  --md` and `tests/i18n-sweep-list.test.ts` compares the committed document to
  it byte for byte, so the generated file is the authority, not this paragraph.
  A separate "thirteen modules are still owed" list was checked against it —
  see §5.1; the finding is recorded there because the answer is "none of them
  is", not "here is the new work queue".
- **The retired-icon-set notice copy** lives in the icon-set module in
  Hungarian; it is keyed like the font reasons when that round lands.
- **The preview vs app parity for the background picker** rests on the same
  one-argument veil; a visual pass on a real device is still owed.
- **The browser walkthrough.** No session has driven the built app in a real
  browser; each batch verified its claims through the suite, a build and a
  byte-compare of the shipped artefacts, which is not the same claim as "a
  person opened it".

### Ops note from this session

- The remote branch `feature/new-tab-dynamic-ink` is **deleted** (local and
  remote), after confirming the branch carried no commit that `origin/main` did
  not (`git log origin/main..feature/...` was empty) and that the merge tree and
  the branch tip were the same content. The local `main` was fast-forwarded to
  `aab35fe` in the same step, so the working tree never regressed.
- **Freebuff's managed GitHub credential flapped once**, as
  `Could not mint the managed credential` on `gh`/`git fetch` and then as
  `Repository not found`. It recovered on its own within the same session: the
  `git push --delete`, the `git fetch --prune` and `gh pr view 56` all succeeded
  afterwards. Nothing in the repository had to be changed for it and no manual
  credential was used. **Recorded here so a future session recognises it as
  transient rather than as a misconfigured remote**, and knows to retry before
  suspecting the repository or the tooling.

## 5. The next development project — starting point

### What is closed, so the next reader does not re-plan it

- **GAD-7** (roadmap item 1 of `docs/final-audit-v6.md`) — shipped in Batch 14
  as the seven-question check-in, with the questionnaire's own scale, four
  descriptive bands, 16 384 answer sheets walked by the test, and no storage.
- **The tab rename** (`Eszköztár` → `Felfedezés`) and **the fifth drawer's
  rename** (`Oktatás` → `Tanulás`), both with the catalogue keys moved rather
  than duplicated, and the stored arrangement's *ids* left alone on purpose.
- The ring aliases (consumed and now measured), and the `.tsx` inventory sweep
  (16 rounds, zero literals left).
- The UX-debt card list from `docs/final-audit-v2.md` §6, closed by Batch 13.
- **The thirteen-module check.** A hand-off list named thirteen `.ts` modules as
  "still owed a sweep": `lib/iconsets.ts`, `lib/backup.ts`, `lib/backupCrypto.ts`,
  `lib/backupKey.ts`, `lib/backupStorage.ts`, `lib/backupDaemon.ts`,
  `lib/experiments.ts`, `lib/achievements.ts`, `lib/habits.ts`, `lib/gad7.ts`,
  `lib/assessments.ts`, `lib/mood.ts`, `lib/streak.ts`. Each was measured against
  the generated authority, and **none is owed**. The result, so the check is not
  run twice:

  | module | generated status | why it is not owed |
  | --- | --- | --- |
  | `lib/iconsets.ts` | `registry` | a display registry the module owns; its activity labels get a namespace when the registry is extracted |
  | `lib/achievements.ts` | `registry` | badge names and hints, same rule |
  | `lib/habits.ts` | `registry` | the four default habit labels, same rule |
  | `lib/mood.ts` | `registry` | the five mood words, same rule |
  | `lib/gad7.ts` | `content` | the seven instrument items and four bands are prose the module owns |
  | `lib/assessments.ts` | `content` | the PHQ-8 items, bands and crisis numbers, same rule |
  | `lib/backupStorage.ts` | `chrome — swept` | already in the catalogue as `backup.*` (round 18) |
  | `lib/backupDaemon.ts` | `chrome — swept` | already in the catalogue as `backup.dueNote` (round 18) |
  | `lib/backup.ts` | not measured | holds no Hungarian string literal |
  | `lib/backupCrypto.ts` | not measured | holds no Hungarian string literal |
  | `lib/backupKey.ts` | not measured | holds no Hungarian string literal |
  | `lib/experiments.ts` | not measured | pure logic; its reader-facing copy is in the card that renders it |
  | `lib/streak.ts` | does not exist | streak arithmetic lives in `lib/habits.ts` and `lib/analysis.ts` |

  The verification changed no source file: the sweep list regenerated
  byte-identical, which is the same statement.

### The recommended next batch: finish i18n

It is the only remaining item that has both a measured backlog and a wired seam:

1. **Commit 1 — the 18 owed `.ts` modules, five at a time.** DONE, in rounds
   15–18. Each round lifted the module's copy into `src/lib/i18n.ts` under a
   namespace the module already suggested, kept the module's exported names, and
   landed with the sweep list regenerated by
   `bun scripts/extract-raw-strings.mjs --md`. Round 18 also reclassified one
   module rather than translating it: `lib/csv.ts`'s six Hungarian strings are
   the header aliases the importer MATCHES on, so they are ids. The second walk
   now names no module owing a round, and the `.tsx` walk has read 0 literals
   for eighteen rounds.
2. **Commit 2 — the language switcher.** DONE, as round 19. `settings.locale`
   is the choice, the Settings appearance group leads with a three-button picker,
   and `lib/i18n` mirrors the choice under `belso-iranytu-locale` for every
   module that builds its copy at import: the `Intl` tags behind the long dates,
   the weekday initials, the number formatter, the recogniser's grammar and
   `<html lang>`. The switch reloads, because a `const` cannot be rebuilt — the
   note under the control says so in all three languages. The app still
   deliberately ignores `navigator.language`; `tests/i18n-round19.test.ts` pins
   that from the AST, and pins the store's load path in both directions.
3. **Commit 3 — `en`/`de` to 100%.** DONE, in rounds 20a and 20b. `1 137`
   keys each; `en` and `de` are both complete, and `COMPLETE_LOCALES` in
   `tests/lib/i18n.test.ts` names them. The two assertions that pinned the
   partial state — "defines some keys and not all of them", "must stay partial
   for now" — now read that list, so a locale either owes nothing or stays
   visibly partial. The fallback test could no longer find a missing key by
   looking, so it removes one for the duration of the test and restores it in
   `finally`: the state it proves is the one the fallback exists for, a key
   added to `HU` before its translation lands. Each round's commit is green on
   its own, and the inventory's recomputed line counts moved with the file.

### Then, in the order the audits already argued

1. **Backup hardening UX** — the recovery-code rehearsal flow (a dry-run
   restore), which is the one backup gap with a real failure mode behind it.
2. **Data depth** — year-over-year comparison in Insights, and a CSV
   column-documentation page so a spreadsheet round-trip is documented rather
   than discovered.
3. **Store hygiene** — attachment data URLs → OPFS blobs for large media, which
   is also the direction the backup file handle already points.
4. **The manual items** — one browser walkthrough of the shipped build, one
   visual pass on the background picker on a real device.

### The conventions that make each of those safe

- **Gates per commit**: `bun run typecheck` + `bun test` + `bun run build`, and
  the exit status preserved when the output is filtered.
- **Delivery**: work on a branch, open a PR, wait for CI, merge it yourself —
  never touch `main` any other way — then deploy and **byte-verify** the shipped
  entry JS and CSS against a fresh build of the merge commit.
- **Every moved number is re-measured in the same commit.** The inventory's §1
  counts, §4's `file:line` claims, §10's per-file table and the sweep list are
  all machine-checked; a batch that changes a count and does not re-measure
  turns the guard red, which is the intended experience.
- **Additive only, 0 new runtime dependencies.** The dependency block has ten
  entries and none of them is a test tool; the runner is bun's own.
- **One `docs/*.md` record per batch**, written for the next reader rather than
  for the diff.
