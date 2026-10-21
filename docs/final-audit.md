# Final audit — Belső Iránytű (feature/continuation-all, pre-merge)

Audit date: 2026-09-28 · Report only, no code changed.
Method: every claim verified against the working tree by reading the code and
running the suites (`tsc -b --noEmit` clean, `bun test` 1620 pass / 0 fail,
`vite build` green) — not from memory, not from prior docs.

This supersedes `docs/feature-parity-audit-v1.0.0.md` (2026-09-27), which
audited `main @ 1bfd4b7`. The deltas since then are large: its P1–P14
proposal table is now mostly shipped. Section 5 lists what is still open.

---

## 1. Feature inventory (what exists, verified)

### Journaling core
- **Mood logging**, 5 levels, one tap from `TodayView`; stress + energy sliders; note.
- **Daily reflection** (`reflection.feeling/stressReason/need`), separate daily question card.
- **Tags, emotions, activities** incl. **custom activities** (`customActivities.ts`, de-dup, cap 24).
- **Attachments** per entry: photo (client-compressed JPEG), audio (recorded or file), video (accept `video/*`, size-capped, no transcoding — `attachments.ts`).
- **Voice intake** (`voice.ts`): browser speech-to-text → parsed metrics; optional LLM path gated by `isLlmAvailable()` (used in `SettingsView`).
- **Onboarding flow** (`OnboardingFlow.tsx`): welcome → trackers → theme → tutorial, runs once (`belso-iranytu-onboarding`).

### Modular trackers (`lib/trackers.ts` registry, 6 input kinds)
- Built-in groups: sleep (0–14 h slider), symptoms, vitamins, weather (condition select + free text + temp), nutrition (quality slider + note + calories + flags), sport (select + duration), steps.
- **Custom trackers** (`customTrackers.ts`, `CustomTrackerManager.tsx`): user-defined, sanitized values.
- `smartwatch-hr` / `smartwatch-spo2` values exist but deliberately have **no registry rows** (asserted in `batch9.test.ts`) — written by the import only, surfaced when settings enable them.
- `null` means "not recorded" for numeric trackers — the load-bearing default documented in `trackers.ts`'s header.

### Insights
- Weekly stats + mood chart; **correlations grid** (`correlationGrid.ts`) — multi-outcome matrix with sample-size guards and honest "none" cells.
- **Lag analysis** (+1/+2-day deltas vs baseline, `lagAnalysis.ts`) — beyond all three reference apps.
- **Year in Pixels** (`yearInPixels.ts`), placed 2nd in InsightsView (Batch 7k).
- Monthly/yearly aggregates (`statsAgg.ts` → `MonthlyYearlyStats`).
- Habit streaks (un-checked-today tolerant), achievements (`achievements.ts`), balance ring.

### Tools (Eszköztár)
- CBT thought record (7-step, re-rating, history); breathwork (3 presets + custom builder) + breathing exercise; gratitude journal (standalone, `belso-iranytu-gratitude`); daily goals; medication check-off (`setMedications`/`toggleMedication` via context); **workout programs** (4 static programs, Batch 8b).

### Assessments (opt-in, consent-gated)
- Owner-supplied instrument (PHQ-9-derived, 9 items + supplementary item), stored in its own key (`belso-iranytu-assessments-v1`), append-only, score/band derived never persisted, off-switch deletes data — all pinned by `batch6.test.ts`.

### Data: import/export
- JSON backup/restore (`belso-iranytu-mentes.json`); CSV export; PDF report via jsPDF with the app's **own subsetted Noto Sans** (`public/pdf-fonts/`, sha256-pinned vendoring, `ToUnicode` CMap correct — the report can spell its own title without the `pdfSafe` fold, which survives only as the offline fallback).
- **Health import** (Batch 9): Apple Health (`Export.xml` — stream parser, DOMParser fallback for broken line shape, 400 MB guard) and Google Fit (JSON, pre-parse 120 MB guard); preview before apply; **fill-existing-by-date only**, user's value always wins; stubs strictly opt-in (`healthImportStubs`, default absent = off).
- **Weather auto-fill** (Batch 8b): Open-Meteo, two opt-ins (city first, GPS second), per-(location,day) cache with TTL, silent degradation to manual fields.
- **Food photo AI** (Batch 10): BYOK, key in its own localStorage name (never the app blob), consent is structural (render-conditional), photo compressed to ≤1024 px JPEG before base64, direct fetch to api.openai.com, 30 s timeout, range-checked parsing (no fabricated zeros), editable result, fill-only save. **Found-and-fixed during this batch:** the JSON parse originally sat inside the fetch's try, mapping a garbage model answer to "network"; now it reports `bad-response`.

### Platform
- PWA (manifest, `sw.js` with content-hash versioned cache; cache-first for `/assets/`, `/icons/`, `/fonts/`, `/pdf-fonts/`), install prompt + banner.
- Themes: 4 presets + full **custom theme editor**; icon sets (system emoji / fluent / retired-set migration); font registry (subsetted woff2, `bytes` in lockstep with disk — pinned by `batch-C.test.ts`) + hand-font; 3-step font scale; reduced-motion respected; auto-hide nav.
- PIN lock (`appLock.ts`, PBKDF2 via `crypto.subtle`), session-scoped unlock.
- Reminders: daily reminder + **medication-specific reminders**, both via headless schedulers mounted in `App.tsx` (fire on app open, visibilitychange, and an aligned timer; at-most-once-per-day gate).

---

## 2. Reference comparison (Daylio / Moodfit / Bearable)

Statuses are relative to the three apps as of the original audit's framing. The v1.0.0 audit's PARTIAL/MISSING rows have been re-adjudicated:

**Closed since v1.0.0 (was a gap, now shipped):**
- Custom trackers (was #23) → `customTrackers.ts`.
- Correlations grid, multi-outcome (was #28) → `CorrelationGrid` over the whole tracker registry.
- Monthly/yearly stats (was #4) → `statsAgg.ts` + `MonthlyYearlyStats`.
- Medication reminders (was #20/#25) → `MedicationReminderScheduler` + `medReminders.ts`.
- Achievements (was #5) → `achievements.ts` + `AchievementsCard`.
- Custom theme editor UI (was #34) → `CustomThemeEditor.tsx`.
- PWA install (was #30 partially) → manifest + `sw.js` + `InstallPrompt`.
- Video attachments (was #6) → `AttachmentPicker` accepts video, size-capped.
- Standalone gratitude journal (was #16) → `GratitudeJournal.tsx`.
- Nutrition tracking (was #19) → nutrition tracker group incl. calories/flags.
- PIN lock (was #11) → `PinLockGate`/`PinLockSettings` (local only).
- Assessments (was #21) → shipped with owner-permitted framing and non-clinical vocabulary, enforced by tests.
- Reminder scheduler wired on app open (was P1/#46) → `ReminderScheduler` mounted in `App.tsx`.

**Still different (deliberate, keep):**
- No conversational AI assistant (Daylio #8) — privacy-first; the scoped exception is the opt-in BYOK food-photo AI.
- No meditation library (Moodfit #15) — breathwork + reflection occupy the niche.
- No premium tiers; everything free.
- Hungarian-first copy — audience choice, not a gap.
- Lag analysis + balanced disclaimers — differentiators none of the three have.

**Still missing relative to Bearable/Daylio (real gaps, see §5):**
- OS home-screen widgets (native-only; PWA shortcuts are the ceiling for a web app).
- Structured "experiments" flow (try tactic N days → compare).
- Psychoeducation content library.
- Follow-system theme (`prefers-color-scheme`) auto mode.

---

## 3. Known limitations (honest constraints, not defects)

**Works only while the app is open:**
- All reminders (daily, medication) fire only when the tab/PWA is running. The scheduler checks on app open, visibilitychange and a timer; there is no push/service-worker notification path. Installing the PWA widens the window but does not remove the constraint.

**localStorage is the whole persistence layer:**
- Quota is small (~5 MB typical). Attachments are individually capped at 5 MB (write throws a Hungarian "no space" error — surfaced, never silent), but many large photos/videos can exhaust the quota. The 7j diagnosis and the store both document this; JSON export is the backup path.
- Clearing browser data destroys the journal. There is no cloud sync — **by design** (core promise; the old P8 "cloud backup" proposal was rejected for exactly this reason).
- Everything is on one origin: no account, no server, no telemetry.

**Privacy tradeoffs (all opt-in, all silent-degrading):**
- Weather: city name (or device coordinates, second opt-in) goes to `api.open-meteo.com`; coordinates are never stored; cache is per (location, day).
- Food AI: the photo and the user's own API key touch `api.openai.com`; the key lives in the browser ($0.01–0.02/call to the user's account); the consent toggle is structural and the key is clearable in one tap.
- Health import: files are read locally; nothing is sent anywhere.

**Import bounds:**
- Apple Health XML > 400 MB is parsed from the first 400 MB and returned with `error: "truncated"` (partial data, honestly labelled) rather than OOM-ing.
- Google Fit JSON > 120 MB is refused before parsing with a clean Hungarian message.

**Other:**
- Voice intake depends on browser speech recognition (Chromium best); without it the manual path remains.
- The PDF's Hungarian text needs the downloaded font files; offline, the `pdfSafe` fold degrades ő→ö **in the PDF output only** — never in storage (7j diagnosis, recommendation "leave it" accepted).

---

## 4. Broken or incomplete (nothing broken; two smells, one deliberate gap)

- **Nothing broken found.** Gates: `tsc -b --noEmit` clean, 1620 tests / 0 fail across 29 files (~16.9k assertions), production build green. The scoping guards (`batch6`/`batch7`) force every batch to claim its files, which is what caught the one real bug this batch introduced (food AI parse/fetch error-boundary confusion — fixed in the same batch, by its own tests).
- **Smell 1 — dead CSS block** (see §6): `.iconset-warn` (styles.css:580) is unreachable.
- **Smell 2 — duplicate `.toast-ok`/`.toast-warn` definitions** (styles.css lines ~93/97 set color, ~2149/2153 set background). Legal cascade, complementary properties, but two places to touch when changing toast styling.
- **Deliberate gap:** `smartwatch-hr`/`smartwatch-spo2` have no Settings/entry-form rows (values import-only unless enabled). This is asserted as *correct* by `batch9.test.ts`; anyone "fixing" it should read that test first.

---

## 5. Missing from the original master plan (not delivered)

1. **Lato's return.** The promise outstanding in `fonts.ts`'s header. Lato was withdrawn in Batch 6 (its Google subset cannot spell Hungarian); returning it means cutting from upstream TrueType. The infrastructure exists (`subset-ui-fonts.ts` `UPSTREAM_TTF` pins; Lato Regular/Bold measured at 656 568 / 656 544 B), but the work was explicitly deferred. `RETIRED_FONTS` still holds `"lato"`; zero Lato files on disk.
2. **Master-batch commits 6–15 as originally numbered.** The original 19-commit plan was truncated by approval; the delivered set is: fonts (C, 7i-era work), 7j diagnosis, health import (9), food AI (10), plus the previously merged 7k/8b. Numbering on `main` reflects the truncated plan.
3. **OS widgets** — native-only; not achievable in a pure web PWA beyond shortcuts.
4. **Follow-system theme auto mode** — still preset-only; small, open, cosmetic.
5. **Educational content library** (old P13) — no psychoeducation pages exist.
6. **Experiment flow** (Bearable-style) — never planned beyond the v1.0.0 audit note.

---

## 6. Dead code (verified by sweep, not guesswork)

Method: every exported symbol in `src/lib` cross-checked against all `src/` and `tests/` consumers; every top-level CSS class checked against static and template-literal `className` usage.

**Dead CSS (delete candidates, additive-only rules permitting):**
- `.iconset-warn` (styles.css ~580) — no static or dynamic (`iconset-${...}`) reference anywhere. Leftover of a withdrawn warning banner.

**Everything else the sweep flagged is alive via dynamic construction** — `.corr-flat` (built as `corr-${tone}` with tone `"flat"` from `cellTone`), `.toast-ok`/`.toast-warn` (`toast-${t.tone}`), `.nav-btn-active`, `.mood-btn-active`, `.yip-*`, `.cal-*`, `.tracker-*`, `.badge-earned`, etc. — or used from other modules (`resolveTheme`, `themeMeta`, `useInstallable`, `isLlmAvailable`, `parseVoiceMetrics`, `consumeRetiredFontNotice`, the store's setters).

**Wider-than-needed export surface (used, but only inside their own module — candidates for un-exporting, not deletion):**
- `store.ts` `emptyData` · `statsAgg.ts` `monthKey`, `yearKey` · `yearInPixels.ts` `yearMatrices` · `weather.ts` `currentPosition`.

**Housekeeping note:** the `.toast-ok`/`.toast-warn` selector pair appears twice in `styles.css` (color rules early, background rules late). Merging them is a two-line cleanup for whoever next touches toasts.

---

---

## 7. Batch 11 — UX modernization + content refresh (feature/ux-premium-refresh)

Audit date: 2026-09-29 · Branch `feature/ux-premium-refresh` from `main @ cb2bf3c`,
six sequential commits, gates after every one (`tsc -b --noEmit`, `bun test`,
`vite build`). Method as before: every claim below verified against the tree.

### What shipped, per commit

1. **CollapsibleCard** (`ui.tsx`) + `lib/cardStates.ts` — the seven tracker
   groups and the four feature cards (Okosóra import, Étkezés AI, Étkezés
   fotóból, Időjárás automatikusan) draw as collapsible cards, collapsed by
   default, one-line summaries derived from `describeValue` so a collapsed card
   and the entry detail can never disagree. State under ONE key
   (`belso-iranytu:cardStates` → `{id: collapsed}`, decision A), lazy single
   read, tolerant parser. 200 ms grid-row animation, off under reduced motion;
   heads ≥44 px. Mood picker, nav, Settings rows untouched (scope-guarded).
2. **Reorderable tabs** — `settings.tabOrder?` + pure `orderedTabs()` in
   `navVisibility.ts` (drop unknown, dedupe, append missing in default order;
   non-array blobs dropped at load). BottomNav renders the order; Settings
   "Fülek sorrendje" card with positional aria-labels and a reset that removes
   the field. Default order unchanged.
3. **CSS polish** — `--shadow` = `0 1px 3px rgba(0,0,0,0.04),
   0 4px 12px rgba(0,0,0,0.03)`, one token both themes (decision B); headings
   +0.01em tracking; per-block line-heights 1.55–1.65; hairline dividers via
   `color-mix(--line 50%)`; `:active` scale(0.98) transform-only transitions
   inside `prefers-reduced-motion: no-preference`; `EmptyState` cta slot wired
   to Insights/Journal. **Mood palette recomputed (decision C):** the test
   computes WCAG contrast of all five hexes against all six theme backgrounds;
   four levels moved (`#d97706→#ba6503`, `#8a8f98→#747a84`, `#3f9d63→#338253`,
   `#0d5c4d→#1e8662` — the old worst cases were 2.01–2.99), level 1 untouched
   (already ≥3.21). No gradient/backdrop-blur added — pinned.
4. **Nutrition tips** — pure `lib/nutritionTips.ts`: two earned per-day
   sentences (verbatim from the spec), a Monday-based weekly summary gated at
   three days with calorie estimates, and the safety rail (<500 / >4000 kcal
   average, inclusive boundaries) producing exactly the mandated sentence
   inline — never a modal. Surfaces: form tip from live state, "Heti
   összegzés" toolbox card, "Táplálkozási tippek" transparency card.
5. **Sport tips** — pure `lib/sportTips.ts`: per-kind lines (run/walk verbatim
   from the spec), rest nudge at 3+ days (2 days deliberately silent),
   deterministic `recommendProgram` rule table (no randomness/AI) driving the
   "Ma ez ajánlott" badge on WorkoutPrograms, plus the form tip and the
   "Sportolási tippek" transparency card.
6. **This section**; scoping guards re-pinned (batch7g selector count 3→4,
   batch7f ContentIcon 43→46, both with reasons at the pins); year-in-pixels
   palette pins moved to `moodByLevel` rather than duplicate literals.

### Verification state at audit time

- `tsc -b --noEmit` clean; `bun test` **1755 pass / 0 fail** across 34 files
  (~17.9k assertions); `vite build` green.
- New proof files: `batch11-collapse` (26), `batch11-tabs` (26),
  `batch11-polish` (24), `batch11-nutrition` (29), `batch11-sport` (30).
- House invariants kept: 0 new runtime dependencies; `backup/
  freebuff-before-upgrade` untouched at `690c14c`; ContentIcon call-site pin
  held (46, two `Salad` + one `TrendingUp` added by commits 4–5, all with
  artwork); medical/diet-plan vocabulary sweeps extended over both new content
  modules; the weather test's date time-bomb found and fixed (computed dates,
  proved failing on the pristine base first).
- §4's smells stand: `.iconset-warn` still orphaned, the `.toast-*` pair still
  duplicated — untouched by policy (additive-only batch), still two-line
  cleanups for a future housekeeping batch.

---

*Report only. No code changed in this commit. `backup/freebuff-before-upgrade` untouched at `690c14c`.*
