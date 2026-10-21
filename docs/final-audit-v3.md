# Final audit v3 — Belső Iránytű (`main @ bd57244`)

Audit date: 2026-10-03 · Branch `docs/final-audit-v3` from `origin/main @ bd57244`
· **Report only, no application code changed in these commits.**

Method: every number below was recomputed from the tree, not carried over from a
previous document. `bun run typecheck` clean, `bun test` **2 781 pass / 0 fail**
across 90 files (33 615 `expect()` calls), `bun run build` green. Where this
audit contradicts `docs/final-audit-v2.md`, the contradiction is stated and the
current tree wins.

This document exists because v2 has twenty sections and stops at `--danger-soft`.
Everything since then — the encrypted backup, the two palette passes, the i18n
extraction, the test inventory and the clinical-sweep repair — had no closing
audit at all. §19 below is that closing, written after the fact and measured the
same way v2 was.

---

## 1. The tree, as measured

| | v2 (`9007014`) | now (`bd57244`) |
| --- | --- | --- |
| `.ts`/`.tsx` in `src/` | 112 (20 605 lines) | **146 (31 268)** |
| stylesheet | 1 (3 006 lines) | 1 (**4 159**) |
| test files | 34 (16 048 lines) | **90 (32 327)** |
| tests | 1 755 | **2 781** |
| runtime dependencies | 10 | **10** (unchanged) |
| `dist/` files | — | 52, precache 2 921 415 B |

The dependency list is still the ten it has always been. `openai` and `jspdf`
are there; the two libraries a mood journal could most easily do without — a
router and a state container — are still absent, and `src/types.ts` still
declares the four tabs as a union rather than a route table.

## 2. Feature inventory

**The four views** are `TodayView`, `JournalView`, `InsightsView`,
`SettingsView`; the tab set is `src/types.ts:432`.

### Journaling core
- Entries with mood coordinates, free text, activity and tracker values,
  attachments; CSV and JSON export, import with repair at one door.
- Mood is a coordinate, not a level: `src/lib/quadrant.ts` maps it to a quadrant,
  and `tests/migration/mood-v2.test.ts` (20 tests) pins the level → coordinates
  table.
- Reminders: daily message, per-medication dose times, per-session latches, and
  the midnight wrap.

### The two surfaces added since v2
- **Opt-in encrypted backup** (`src/lib/backup.ts`, `backupCrypto.ts`,
  `backupKey.ts`, `backupStorage.ts`, `backupWordlist.ts`, `backupDaemon.ts`).
  A passphrase, a passkey or twelve recovery words each derive a different key;
  the wordlist is 1 024 entries — ten bits per word — and the sampler does not repeat. The daemon
  *asks* and cannot act: `enabled`, both time boundaries and the fold are pinned.
- **Crisis help** (`src/components/CrisisCard.tsx`, `src/lib/assessments.ts`).
  One resource list, five surfaces, a helpline on the ninth PHQ-8 question.

### Registries, counted not estimated
| Registry | Count |
| --- | --- |
| i18n catalogue keys | **491** (hu 491/491, en 3/491, de 2/491) |
| education articles | 15 |
| badges | 27 |
| icon sets / glyphs | 3 / 43 |
| font families | 12 |
| theme tokens | 14, across 4 palettes (light, dark, warm, vibrant) |
| storage keys | 32 |
| nav icons | 4 |
| tracker groups | 7 |

## 3. What each phase since v2 actually built

### 3.1 The backup (`feature/encrypted-cloud-backup`)
Six lib modules and one 982-line card. The card has five exported views, each
covered by a byte-identity render diff. The decision that mattered: the
orchestration **refuses rather than answers** — a missing key or an unwritable
file produces a value, never a throw.

### 3.2 The warm and vibrant passes
Two contrast passes over the same four palettes, and the rule that came out of
them: contrast is **computed from the palette**, not read off a table.
`tests/contrast.test.ts` (33 tests) runs the real `applyThemeTokens` and its
`KNOWN_SHORTFALLS` list is now **empty**.

### 3.3 `--danger-soft` became a token
`--danger-soft = mixHex(--danger, --surface, 88%)` — the fourteenth token, derived
rather than hand-picked. The dark palette had been painting *light pink* error
chips because the shared `:root` hex was light; the token fixed a visual bug that
happened to fail a ratio too.

### 3.4 The i18n extraction (PR #29, then PR #30)
**491 keys.** The first commit moved Settings and Ma/Napló; the second phase moved
the toolbox, the welcome wizard, the questionnaire, the backup card and the help
card. Ten namespaces: `settings` 130, `tools` 128, `today` 65, `backup` 65,
`crisis` 3, `insights` 26, `onboarding` 23, `journal` 22, `assessment` 20, `meditation` 9.

Every extraction was checked three ways, and all three earned their keep:
- a **byte-identity render diff** of the view before and after;
- a **forward scan** proving no Hungarian survived in the file;
- a **backward scan** asserting each new catalogue value byte-for-byte against
  the pre-extraction source.

The third one earned its place by catching a typo that every other check passed:
`felhasználthatatlan adat` — one extra `t`. A whole string can be present and
still be misspelled.

### 3.5 The test inventory (PR #31)
`docs/PROJECT-INVENTORY.md` §10 named **36 of 85** test files. §1 said 85 and was
never wrong about it, which is exactly why the gap survived: nothing checked
*which*. §10 now lists all 85, grouped by what each pins, and a new guard walks
the tree and fails on a missing row, a stale row, a duplicate or a lying count.

### 3.6 The clinical sweep repair (PR #32)
`CLINICAL_VOCABULARY` was lowercase-only. Hungarian capitalises the first word of
a sentence and every title, label and heading — so `"Gyógyszerek"`,
`"Gyógyszer hozzáadva"` and `"Gyógyszer-emlékeztető"` never reported, and the
inventory counted them clean. They were not allowed anywhere; they were unseen.
Both sweeps now carry `i`; the allowance was 11 entries after this phase and is
12 now, pinned to the **word** rather than to the keys.

## 4. Known limitations, stated plainly

These are constraints, not defects, and none is being chased:

1. **`en` and `de` are effectively empty** — 3 and 2 translated keys out of 491.
   `t()` falls back hu → hu → key, so an unsupported locale renders Hungarian
   rather than a blank, and **there is no language switcher in the UI**.
2. ~~**`lib/backupKey.ts` still holds 12 Hungarian strings**~~ — **closed.** All
   twelve are catalogue keys now (`backup.passkey*`, `backup.passwordTooSimple`,
   `backup.passwordTooShort`). The twelve was the count in this audit and it was
   right; a first grep found only eleven because the twelfth is a template
   literal, and searching for double-quoted strings walked past it. The reason
   for leaving them was real but was about the wrong object: the HKDF constants
   beside the prose, which are bytes and never moved.
3. ~~**`RESOURCES_TITLE` and `DISCLAIMER` are still module constants**~~ —
   **closed.** They are `crisis.resourcesTitle` and `crisis.disclaimer`. All five
   surfaces read them, and they read them through the exported names
   `assessments.ts` still carries, so single source of truth did not weaken — it
   gained an owner that can translate it. `RESOURCES` stayed put and should: it
   is data. Its first word makes it the twelfth entry on
   `FEATURE_NAME_ALLOWANCE` and the fourth of those that name a diagnosis, and it
   is the only one of the four that is a mandate rather than a sentence the app
   chose to write.
4. **The original flaky test is still unidentified** (v2 §19). 60 clean runs, one
   real hazard found and fixed, **no reproduction**. Closed by decision, not
   solved.
5. **`formalAddressHit` does not match „Önök"** — confirmed by probe in Phase 6,
   deliberately untouched: it is a register rule, not a clinical one.
6. ~~**Two CI annotations are pre-existing and unfixed**~~ — **closed.** Both
   `actions/checkout@v4` and `actions/setup-node@v4` run on a Node 20 runtime;
   both are now `@v5` with the toolchain on Node 22, verified on 22.23.2.
   `ubuntu-latest` is pinned to `ubuntu-24.04` ahead of its scheduled move to
   Ubuntu 26 on 2026-10-19. Working on the first of these surfaced something
   this audit had not recorded: **three tests were calendar-dependent and
   `main` had already gone red on 2026-10-04** — `currentStreak` counts back
   from today with a day of grace, `availableYears` reads the real year, and
   both fixtures pinned their own literal dates. All three are fixed and the
   whole suite now replays clean with the clock pinned into the future.
7. **No coverage configuration exists** — no threshold, no report. The suite is
   organised to answer three questions a percentage cannot (§10 of the
   inventory), but "coverage" as a number does not exist here.

## 5. Roadmap — where the next project starts

In the order the evidence suggests:

1. ~~**Finish the i18n boundary.**~~ **Partly done, and this entry was wrong
   about the rest.** The twelve keys in `backupKey.ts` and the two shared
   constants across five surfaces are in the catalogue. What this entry claimed
   next — that nothing else in `src/` speaks Hungarian outside the catalogue —
   was false, and a later audit counted the difference: **thirteen card titles and
   thirty-six button labels in seventeen files are raw literals**, including both
   exits of the recording wizard. They are listed in
   `docs/ux-audit-phase1.md` §2.3 and `docs/ux-audit-phase2.md` §4.3. What
   genuinely cannot be translated is the four HKDF constants, which are bytes,
   and `RESOURCES`, which is data.
2. **Decide what `en` and `de` are for.** Two translations and no switcher is
   worse than one locale: the catalogue carries the promise of a switcher it does
   not have. Either fill them or delete the namespaces and say so.
3. ~~**Node 22 and Ubuntu 26 in CI**~~ — **done, partly.** Node 22 and `@v5`
   actions are in, and the check run now reports **zero annotations**. The runner
   is pinned to `ubuntu-24.04` rather than 26.04: the 26.04 label could not be
   confirmed available, and an unavailable label fails the job rather than
   falling back. Reaching it is one line once that is settled.
4. **A real coverage floor.** The dead-export guard proves nothing in `src/lib` is
   unreachable; there is no equivalent for "no view is never rendered" across the
   four views.
5. **Re-run the flake harness if one ever surfaces.** The reproduction setup from
   v2 §19.1 still works and is the right thing to reach for first.

## 6. What this audit does not establish

- The **byte-identity render diffs cannot reach** `Collapsible` bodies, wizard
  steps 2–4, CBT steps 1–6, or the backup card's own phase machine. Those strings
  are covered by the roundtrip and the byte-value check instead.
- The accent-based Hungarian scanner is **blind to strings with no accented
  vowel** (`Kihagyom`, `Vissza`). Reading the file is still the last line.
- An allowance's *description* is prose, not a machine fact. The guards check the
  word a key carries; nobody verifies that the sentence around it says what this
  document says it says.
