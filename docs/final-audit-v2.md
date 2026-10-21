# Final audit v2 — Belső Iránytű (`main @ 9007014`, pre-wrap-up)

Audit date: 2026-09-29 · Branch `feature/final-wrapup` from `origin/main @ 9007014`
· **Report only, no code changed in this commit.**

Method: every claim below was checked against the working tree — by reading the
code, by running throwaway probes against the real modules, and by running the
gates: `bun run typecheck` clean, `bun test` **1755 pass / 0 fail** across 34
files (17 909 `expect()` calls), `npm run build` green (`index-CWnCSBTh.js`,
1 356 963 B; `index-DVmk3rZL.css`, 37 306 B). Nothing here is carried over from
memory or from a previous document; where this audit contradicts
`docs/final-audit.md`, the contradiction is stated explicitly and the current
tree wins.

Tree at audit time: 112 `.ts`/`.tsx` files in `src/` (20 605 lines), one
stylesheet of 3 006 lines, 16 048 lines of tests, 38 files in `public/`, zero
new runtime dependencies since the project started.

**What changed since `docs/final-audit.md`:** Batch 11 landed (collapsible cards,
reorderable tabs, CSS polish, nutrition and sport tips, recomputed mood palette)
and this audit re-ran every sweep against the result. Two of the old document's
open items turned out to be **stale** (§2.4, §4.3) and one **new real defect
surfaced** (§4.3). §6 (UX debt) and §8 (test-coverage gaps) are new sections that
the first audit did not have.

---

## 1. Feature inventory (what exists, verified)

### Journaling core
- **Mood logging**, 5 levels, one tap from `TodayView`; stress + energy sliders; note.
- **Daily reflection** (`reflection.feeling/stressReason/need`), separate daily question card.
- **Tags, emotions, activities** incl. **custom activities** (`customActivities.ts`, de-dup, cap 24).
- **Attachments** per entry: photo (client-compressed JPEG), audio (recorded or file), video (accept `video/*`, size-capped, no transcoding — `attachments.ts`).
- **Voice intake** (`voice.ts`): browser speech-to-text → parsed metrics; optional LLM path gated by `isLlmAvailable()`.
- **Onboarding flow** (`OnboardingFlow.tsx`): welcome → trackers → theme → tutorial, once (`belso-iranytu-onboarding`). Its `theme` field is **validated on read** (a corrupt value falls back to `light`, pinned by `phase4.test.ts:50`).

### Modular trackers (`lib/trackers.ts` registry, 6 input kinds)
- Built-in groups: sleep (0–14 h slider), symptoms, vitamins, weather, nutrition (quality + note + calories + flags), sport (select + duration), steps.
- **Custom trackers** (`customTrackers.ts`, `CustomTrackerManager.tsx`), sanitized values.
- `smartwatch-hr` / `smartwatch-spo2` values exist but deliberately have **no registry rows** (asserted in `batch9.test.ts`) — import-only unless the setting is on.
- `null` means "not recorded" for numeric trackers — the load-bearing default documented in `trackers.ts`'s header.
- **All seven groups draw as `CollapsibleCard`s** (`tracker-<headId>` ids), collapsed by default, summarised from the same `describeValue` the entry detail reads.

### Insights
- Weekly stats + mood chart; **correlations grid** (`correlationGrid.ts`); **lag analysis** (`lagAnalysis.ts`, +1/+2-day deltas vs baseline) — beyond all three reference apps.
- **Year in Pixels** (`yearInPixels.ts`), deliberately 2nd in `InsightsView` (Batch 7k).
- Monthly/yearly aggregates (`statsAgg.ts` → `MonthlyYearlyStats`), habit streaks, achievements, balance ring.
- **Two earned tip surfaces** (Batch 11): `nutritionTips.ts` (per-day sentence, Monday-based weekly summary gated at three days, safety rail) and `sportTips.ts` (per-kind line, rest nudge at 3+ days, deterministic `recommendProgram`), each with a Settings transparency card.

### Tools (Eszköztár)
- CBT thought record (7-step, re-rating, history); breathwork + breathing exercise; gratitude journal; daily goals; medication check-off; **workout programs** (4 static programs + the Batch 11 „Ma ez ajánlott" recommendation badge).
- The whole toolbox sits in one already-collapsed `Collapsible` ("Eszköztár", `TodayView.tsx:296`), so its 13 items are one tap away and never in the entry form.

### Assessments (opt-in, consent-gated)
- Owner-supplied instrument (PHQ-9-derived, 9 items + supplementary), own storage key, append-only, score/band derived never persisted, off-switch deletes data — all pinned by `batch6.test.ts`.

### Data: import/export
- JSON backup/restore; CSV export (`csv.ts` → `downloadText`); PDF report via jsPDF with the app's **own subsetted Noto Sans** (`public/pdf-fonts/`, sha256-pinned, correct `ToUnicode` CMap).
- **Health import** (Batch 9): Apple Health (`Export.xml`, stream parser, DOMParser fallback, 400 MB guard) and Google Fit (JSON, 120 MB pre-parse guard); preview before apply; fill-existing-by-date only; stubs strictly opt-in.
- **Weather auto-fill** (Batch 8b): Open-Meteo, two opt-ins, per-(location, day) cache, silent degradation to manual fields.
- **Food photo AI** (Batch 10): BYOK, key in its own localStorage name, consent is structural (render-conditional), ≤1024 px JPEG before base64, 30 s timeout, range-checked parsing, editable result, fill-only save.

### Platform
- PWA (manifest, `sw.js` with content-hash versioned cache), install prompt + banner.
- Themes: **6 entries — `auto`, light, dark, warm, vibrant, custom** (`themeMeta()`, `themes.ts:133`) + custom theme editor. `resolveTheme` resolves `auto` through `matchMedia`, and `ThemeContext.tsx:40–48` re-applies the tokens on a live `change` listener while `auto` is selected.
- Icon sets (system emoji / fluent / retired-set migration), font registry (subsetted woff2 with `bytes` pinned against disk), hand-font, 3-step font scale, reduced-motion respected, auto-hide nav, PIN lock (PBKDF2 via `crypto.subtle`).
- Reminders: daily + medication-specific, headless schedulers mounted in `App.tsx`, at-most-once-per-day gate.
- **Batch 11 additions:** `CollapsibleCard` + `lib/cardStates.ts` (one key `belso-iranytu:cardStates`, lazy read, tolerant parser); `settings.tabOrder` + pure `orderedTabs()`; „Fülek sorrendje" card; two-layer `--shadow`; recomputed mood palette (four of five levels moved, L1 untouched at `#c0455a`).

---

## 2. Reference comparison (Daylio / Moodfit / Bearable)

Statuses are relative to the three apps as of the original audit's framing.

**Closed since the v1.0.0 audit:** custom trackers, multi-outcome correlations grid, monthly/yearly stats, medication reminders, achievements, custom theme editor, PWA install, video attachments, standalone gratitude journal, nutrition tracking, PIN lock, assessments, reminder scheduler on app open. All shipped and pinned by tests; none regressed in Batch 11.

**Still different (deliberate, keep):**
- No conversational AI assistant — privacy-first; the scoped exception is the opt-in BYOK food-photo AI.
- No meditation library — breathwork + reflection occupy the niche.
- No premium tiers; everything free.
- Hungarian-first copy — audience choice, not a gap.
- Lag analysis + balanced disclaimers — differentiators none of the three have.

**Still genuinely missing (real gaps, §5):**
- OS home-screen widgets (native-only; PWA shortcuts are the ceiling for a web app).
- Structured "experiments" flow (try tactic N days → compare).
- Psychoeducation content library.

**2.4 — one row in `docs/final-audit.md` is STALE.** Both the v1.0.0 audit and
`final-audit.md` §2/§5.4 list *"Follow-system theme (`prefers-color-scheme`) auto
mode"* as missing. **It is not missing.** Verified on the current tree:

- `ThemeName` includes `"auto"` (`src/types.ts:123`);
- `themeMeta()` lists it first, labelled „Auto (rendszer)" (`src/lib/themes.ts:135`);
- the Settings theme card maps over `themeMeta()` (`SettingsView.tsx:240`), so the
  swatch is reachable by a user with two taps;
- `resolveTheme` reads `matchMedia("(prefers-color-scheme: dark)")`
  (`src/lib/themes.ts:93–98`);
- and the **live** case is handled too: `ThemeContext.tsx:40–48` subscribes to the
  query's `change` event and re-applies the tokens while `auto` is selected, with
  the listener removed on cleanup.

The row should be struck from the feature-gap list. The only part of the auto-theme
story that is *not* finished is corruption handling, and that is a different
finding — see §4.3.

> **Status: both follow-ups closed by Batch 12.** §4.3 (a corrupt stored theme
> blanking the app) in commit 3c. And one thing this section did not catch,
> found while verifying what commit 5 had left to do: the *live* subscription
> was `mq.addEventListener?.("change", onChange)` — optional-chained, and
> therefore a silent no-op on any browser whose `MediaQueryList` only has the
> older `addListener`/`removeListener` pair (Safari 13, iOS 13). The theme would
> resolve correctly at launch and then never follow the OS again, on exactly the
> devices most likely to be running an old iOS. `useAutoHideNav` carried a
> comment claiming the legacy spelling was handled, and **no test in the suite
> faked `matchMedia` at all**, so nothing could have noticed. Commit 5 replaced
> both call sites with `src/lib/media.ts` — one module that owns `matchMedia`,
> falls back to the legacy pair, and exports the two query strings so the value
> and the subscription cannot ask the browser different questions.

---

## 3. Known limitations (honest constraints, not defects)

**Works only while the app is open.** All reminders (daily, medication) fire only
when the tab/PWA is running: on app open, `visibilitychange`, and an aligned
timer. There is no push or service-worker notification path. Installing the PWA
widens the window but does not remove the constraint.

**localStorage is the whole persistence layer.**
- Quota is small (~5 MB typical). Attachments are individually capped at 5 MB (a
  write throws a surfaced Hungarian "no space" error, never silent), but many
  large photos/videos can exhaust the quota. JSON export is the backup path.
- Clearing browser data destroys the journal. There is no cloud sync — **by
  design**; the old P8 "cloud backup" proposal was rejected for exactly this reason.
- Everything is on one origin: no account, no server, no telemetry.

**Privacy tradeoffs (all opt-in, all silent-degrading):**
- Weather: city name (or device coordinates, second opt-in) reaches
  `api.open-meteo.com`; coordinates are never stored; the cache is per (location, day).
- Food AI: the photo and the user's own API key reach `api.openai.com`; the key
  lives in the browser; consent is structural and the key is clearable in one tap.
- Health import: files are read locally; nothing is sent anywhere.

**Import bounds.** Apple Health XML over 400 MB is parsed from the first 400 MB
and returned labelled `error: "truncated"` rather than OOM-ing; Google Fit JSON
over 120 MB is refused before parsing with a clean Hungarian message.

**Other.**
- Voice intake depends on browser speech recognition (Chromium best); the manual
  path remains without it.
- The PDF's Hungarian text needs the downloaded font files; offline, the `pdfSafe`
  fold degrades ő→ö **in the PDF output only**, never in storage (7j diagnosis,
  recommendation "leave it" accepted; re-verified in the next commit).
- One 1.35 MB index chunk plus jsPDF/html2canvas/purify vendor chunks; Vite's
  900 kB chunk warning is expected and accepted (no code-splitting was agreed).

---

## 4. Broken or incomplete

### 4.1 Nothing is broken in the shipped behaviour
Gates green: typecheck clean, 1755 tests / 0 fail across 34 files, production
build green. The scoping guards (`batch6`/`batch7` file claims) have kept every
batch honest about what it actually mounted.

### 4.2 The two CSS smells, with current line numbers (Batch 11 did not touch them)
Both were reported in `docs/final-audit.md` §4; the line numbers moved because
Batch 11's CSS polish rewrote blocks above them, so here they are re-confirmed
against the current file (3 006 lines, line numbers inclusive):

- **Orphan rule — `.iconset-warn`, `src/styles.css:591–598`** (8 lines: margin,
  padding, radius, border, background, font-size). Referenced **nowhere**: no
  `src/` file, no test, no script — the string does not occur outside this
  stylesheet. A sweep for dynamic construction (`iconset-${…}`) finds no producer
  that can emit it. Leftover of a withdrawn warning banner.
- **Duplicated selector pair — `.toast-ok` / `.toast-warn`.** Two rule blocks:
  `src/styles.css:99–101` and `103–105` set `color` (`var(--on-ok)`,
  `var(--on-accent)`), while `src/styles.css:2174–2176` and `2178–2180` set
  `background` (`var(--ok)`, `var(--accent)`). The base `.toast` block
  (2160–2172) is the only other place either is involved. Legal cascade,
  complementary properties — but two places to touch when toast styling changes.
  The class IS alive: `ui.tsx:228` builds it as `` `toast toast-${t.tone}` `` from
  a `"ok" | "warn"` union, so both are reachable at runtime.

Both are *remove/merge* work, which the additive-only rule of the previous
batches forbade. That is why they are still here.

### 4.3 NEW — a corrupt stored `theme` crashes the app at boot (real defect, unfixed)
Found by this audit, reproduced against the real module, not inferred:

```
resolveTheme("sötét", undefined)  ->  {}          // THEMES[name] is undefined
applyThemeTokens({})             ->  TypeError: undefined is not an object
                                    (evaluating 'hex.replace')
```

The chain: `normalizeSettings` (`src/lib/store.ts:98–142`) repairs four kinds of
stored corruption — `fontFamily` (line 111), `autoHideNav` (122), a non-array
`tabOrder` (128–130) and an unknown `iconSet` (131–141) — but it **never validates
`theme`**. A settings blob carrying a value outside
`light | dark | warm | vibrant | custom | auto` (hand-edited export, bad merge,
older importer) reaches `resolveTheme`, which returns `{}`, and
`applyThemeTokens` then calls `isLight(undefined)` and throws. The throw happens
inside the `useEffect` in `ThemeProvider`, i.e. before the first painted frame —
the failure mode is a blank app, not a wrong colour.

The contrast is instructive: the **same field in the other place it can live is
already validated** — `onboarding.ts:42–44` coerces a corrupt onboarding theme to
`light`, and `phase4.test.ts:50` pins that. So the app has two storage paths for
one preference and only one of them defends itself.

Severity: low likelihood (it needs a corrupted blob), high blast radius (a blank
app, and the user has no UI left to fix it with — recovery means clearing
site data and losing the journal). **Not fixed in this commit** — report only; it
is the one code change this audit recommends, and it is scoped for a later batch
with a test that fails before it and passes after.

> **Status: fixed by Batch 12 commit 3c.** `THEME_NAMES` + `isThemeName` in
> `src/lib/themes.ts`, and one line in `normalizeSettings`
> (`src/lib/store.ts:131`) coercing an unknown value to `DEFAULT_SETTINGS.theme`
> — the same assign-don't-delete pattern as its four neighbours, so the next
> save rewrites a clean blob. `tests/batch12-theme.test.ts` is the proof, and it
> was proved failing first: with the line disabled, all nine corrupt shapes and
> the paint test fail; with it, 19 pass.

### 4.4 The deliberate gap (unchanged, still correct)
`smartwatch-hr` / `smartwatch-spo2` have no Settings or entry-form rows. Values
are import-only unless the setting is enabled. `batch9.test.ts` asserts this as
*correct*; anyone "fixing" it should read that test first.

---

## 5. Missing from the original master plan (not delivered)

1. **Lato's return.** The promise outstanding in `fonts.ts`'s header. Lato was
   withdrawn in Batch 6 because its Google subset cannot spell Hungarian;
   returning it means cutting from upstream TrueType. The infrastructure exists
   (`scripts/subset-ui-fonts.ts` `UPSTREAM_TTF` pins, Lato Regular/Bold measured
   at 656 568 / 656 544 B), but the work was explicitly deferred.
   `RETIRED_FONTS = ["manrope", "plus-jakarta-sans", "lato"]` still lists it and
   there are zero Lato files in `public/fonts/` (10 families × 2 subsets = 20
   woff2 files are on disk, none of them Lato).
2. **Master-batch commits 6–15 as originally numbered.** The original 19-commit
   plan was truncated by approval; the numbering on `main` reflects the truncated
   set. Not a gap in the product, a gap in the paperwork.
3. **OS widgets** — native-only; not achievable in a pure web PWA beyond shortcuts.
4. **Auto theme** — *strikes itself off this list.* Shipped, live, and reachable
   (§2.4). Both follow-ups are closed: the corruption repair in §4.3 (commit
   3c), and the legacy-browser subscription (commit 5, `src/lib/media.ts`).
5. **Psychoeducation content library** (old P13) — no such pages exist.
6. **Experiment flow** (Bearable-style) — never planned beyond the v1.0.0 note.

---

## 6. UX debt — cards that could be collapsible but are not (REPORT ONLY)

Batch 11 made eleven cards collapsible (seven tracker groups + four feature
cards). These are the ones that were **left open**, listed with the evidence for
each. **Nothing in this section is changed by this commit, and no card was made
collapsible while writing it.**

**How the candidates were picked.** A candidate needs at least two of: a body
long enough to cost a scroll (measured as the card's JSX span, given below), a
low visit frequency (settings-once, or a reference card the user reads once and
never returns to), and depth in a long page where it pushes the cards the user
*did* come for off the screen. A card that is the point of its view is not a
candidate, however long it is — that is why the mood card, the journal's month
picker and the week summary are explicitly excluded at the bottom.

### 6.1 Strong candidates — Settings (11 open cards, page has no collapsing layer)

| Card | Location | JSX span | Why |
|---|---|---|---|
| **Navigáció** | `SettingsView.tsx:170–235` | 66 lines | The largest Settings body: the Batch 11 tab-reorder list with up/down buttons, a reset and an aria label per row. Read once at setup, never again. |
| **Modulok** | `SettingsView.tsx:353–387` | 35 lines | Module toggles; a setup-time decision list. |
| **Nyomonkövetés** | `SettingsView.tsx:303–333` | 31 lines | Tracker toggles that duplicate what the Today form already shows. |
| **Téma** | `SettingsView.tsx:237–261` | 25 lines | Theme grid **plus** the custom-theme editor; swatches are glanceable, the editor is not. |
| **Betűtípus** | `SettingsView.tsx:162–164` | 3 lines wrapping `FontPicker` | Tiny JSX, large render (the font grid + hand-font picker). |
| **Ikonok és emoji** | `SettingsView.tsx:166–168` | 3 lines wrapping `IconSetPicker` | Same shape: a large picker behind a three-line wrapper. |
| **Táplálkozási tippek** | `SettingsView.tsx:267–282` | 16 lines | Static transparency text — the Batch 11 spec sentences, written once and never changing. The archetypal "collapse by default" content. |
| **Sportolási tippek** | `SettingsView.tsx:287–301` | 15 lines | Same, and the two cards read as a pair. |
| **Könnyebb használat** | `SettingsView.tsx:133–160` | 28 lines | Accessibility toggles (text size, high contrast, auto-hide nav): real settings, but nobody edits them daily. Weaker candidate than the eight above. |
| **Profil** | `SettingsView.tsx:110–131` | 22 lines | Name + goal. *Weaker still* — a two-field card is cheap to keep open, and it is the first thing on the page. |
| **Adatvédelem** | `SettingsView.tsx:428–435` | 8 lines | Four static bullets, no controls at all. Nothing to interact with means nothing is hidden by collapsing it. |

The page already collapses the two things that most needed it — voice intake
(`Collapsible`, `SettingsView.tsx:413`) and data/export (`:424`) — so the
remaining 11 are the residue, and it is residue of a consistent kind: **Settings
never got a collapsing layer of its own.**

### 6.2 Strong candidates — Insights (five cards below the fold, all open)

`InsightsView` renders, in order: „Ez a hét" → `YearInPixels` → „Hogyan alakult?" →
„Mi hat rád?" → **`LagAnalysisCard` → `ReportExport` → `MonthlyYearlyStats` →
`AchievementsCard` → `CorrelationGrid`** → an already-collapsed
„További felismerések". The five in bold are never opened by default and none is
the reason a user visits this tab:

- **Hatásmátrix** (`CorrelationGrid.tsx`, 118 lines) — a matrix whose row count
  grows with the enabled tracker count. The most likely to overflow a phone.
- **Jelentés export** (`ReportExport.tsx`, 96 lines) — an export action; used
  rarely by definition, and the report itself is a separate destination.
- **Havi és éves statisztikák** (`MonthlyYearlyStats.tsx`, 107 lines) — a period
  switcher over two tables; the only card here with a natural summary line
  (period + entries).
- **Mérföldkövek** (`AchievementsCard.tsx`, 104 lines) — a passive badge list.
  Glanceable, like `YearInPixels`, but with no payoff argument behind it.
- **Késleltetett hatások** (`LagAnalysisCard.tsx`, 63 lines) — the shortest of the
  five and the most statistical; the one card where "show me only if something
  changed" is a real improvement.

**Judgement call, flagged not recommended:** `YearInPixels` (142 lines, a
365-cell grid) is the largest card on the tab and a legitimate candidate — but
Batch 7k deliberately moved it to position 2 as *the payoff of having journaled at
all*. Reverting that on density grounds would undo a deliberate product decision.
Left to the user's judgement, not recommended here.

### 6.3 Weaker candidates — Today's toolbox, second level

The toolbox is already one tap away (`TodayView.tsx:296`), so a second collapse
level buys less. But inside it, three items are large and rarely used daily, and
they are the only cards in the app that are large *and* both nested and open:
`WorkoutPrograms` (273 lines), `CbtForm` (237 lines), `HabitStreaks` (132 lines),
`BreathingExercise` (132 lines), `GratitudeJournal` (96 lines).

### 6.4 Explicitly NOT candidates (with the reason, so this list is not re-litigated)

- **„Hogy vagy ma?"** (`TodayView.tsx:165`) — the primary action of the app.
- **„Egyensúly pontszám"** (`:231`) — one glanceable number; a summary line would
  say the same thing twice.
- **„Mi hatott rád ma?"** (`:244`) — the second primary action of the entry form.
- **The seven tracker groups and four feature cards** — already collapsible
  (Batch 11).
- **Journal month picker and „Bejegyzések"** (`JournalView.tsx:53`, `:141`) — they
  *are* the view.
- **„Ez a hét", „Hogyan alakult?", „Mi hat rád?"** (Insights) — the first screen
  of the tab, above the fold, and what the user came for.
- **Mai célok** (`DailyGoals.tsx`, 73 lines) — sits high on Today, small body.

### 6.5 What a future fix would cost (not done here)

For anyone who takes this section on: `CollapsibleCard` needs a **stable id** and
wants a **summary line**; a card with no honest summary should use the plain
`Collapsible` primitive instead (session-local, no storage). The sixteen strong candidates
(§6.1–6.2) would be sixteen new entries in the one `belso-iranytu:cardStates` blob
(twenty-one if the toolbox items in §6.3 are included), and the mounted-card
assertions in `tests/batch11-collapse.test.ts` plus the file claims in
`tests/batch7.test.ts` would need re-pinning. Every candidate above is a
behaviour change the user can see on first launch — which is why it is a
decision, not a cleanup.

---

## 7. Dead code (verified by sweep, not guesswork)

Method: every `export`ed symbol in `src/lib` cross-checked against every file in
`src/`, `tests/` and `scripts/`; every top-level CSS class checked against static
and template-literal `className` usage.

### 7.1 Dead CSS — one orphan rule
- `.iconset-warn` (`src/styles.css:591–598`). Detail and evidence in §4.2.

### 7.2 Genuinely dead exports — six, none in `src/` or `tests/`
Each has **zero** references outside its own declaration, verified by a scripted
sweep over `src/` + `tests/` + `scripts/`:

| Symbol | Location | Note |
|---|---|---|
| `diffDays` | `src/lib/dates.ts:43` | Not even used inside `dates.ts` (it calls the module's own `fromISODate`). |
| `yearMatrices` | `src/lib/yearInPixels.ts:70` | `YearInPixels.tsx` uses `monthMatrix`/`availableYears` directly. |
| `glyphStem` | `src/lib/iconsets.ts:414` | A neighbouring function builds the same (glyph, stem) pairs for whole sets. |
| `LEGACY_RENDER` | `src/lib/iconsets.ts:130` | A documented `"emoji"` marker constant with no reader. |
| `canInstall` | `src/lib/pwa.ts:68` | A one-line wrapper over the module's internal `isInstallable`; `InstallPrompt.tsx` uses `useInstallable`. |
| `HUNGARIAN_DIACRITICS` | `src/lib/font-cmap.ts:40` | The string-form twin of `HUNGARIAN_DIACRITIC_CODEPOINTS`, which the CMap tests do read. **This row is a correction, added by Batch 12 commit 3b:** the first pass swept constants and found it, then did not carry it into the list because its twin is used. It met the same standard as the five above — one occurrence in the whole repository — so it was removed with them. |

Reported, not removed — removal is a code change, and this commit is report-only.
(Batch 12 commits 3a–3c then removed all six, plus the orphan CSS rule, behind a
guard that re-runs this same sweep on every future commit.)

### 7.3 Wider-than-needed export surface (used, only inside their own module)
Un-exporting is a candidate, never deletion: `store.ts` `emptyData` ·
`statsAgg.ts` `monthKey`, `yearKey` · `weather.ts` `currentPosition` ·
`onboarding.ts` `saveOnboarding` · `sportTips.ts` `sportKindOf` ·
`customTrackers.ts` `subscribeCustomTrackers` · `csv.ts` `parseFlexibleDate` ·
`fonts.ts` `SUPERSEDED_SYSTEM_REPLACEMENT` · `appLock.ts` `hashPin` ·
`notifications.ts` `notificationsSupported`.

The sweep also flags ~80 exported **types** with no external consumer. Those are
not dead code — a type costs nothing at runtime, and several are the public shape
of a function's return. Listed here only so the next sweep does not re-report them
as findings.

### 7.4 Alive by dynamic construction — must NOT be swept
The sweep's false-positive list, recorded so the next housekeeping pass does not
"clean" a live class: `corr-${tone}` (`.corr-flat`), `toast-${tone}`
(`.toast-ok`, `.toast-warn`), `iconset-${…}`, `nav-btn-active`, `mood-btn-active`,
`badge-earned`, `yip-*`, `cal-*`, `tracker-*`. Same for the icon library:
`Sunrise`, `Minus` and `ChevronLeft` in `src/lib/icons.tsx` look unused by name but
are reachable through the registry object at `icons.tsx:1081/1127/1156` — a
text-sweep would wrongly delete them.

---

## 8. Test-coverage gaps

The suite is 34 files, 17 909 assertions, all green. It is also **logic-first**:
26 of the 34 files read source files as text (`readFileSync`) to pin things a
unit test cannot compute (CSS rules, pins, mounting), and there is no jsdom, so
rendering happens through `renderToStaticMarkup` and events are not simulated.

### 8.1 Library modules with no test importing them
Mapped `src/lib` module → test files that import it. Three modules have none:

- **`download.ts` — `downloadText` (1 function, 2 call sites: CSV export in
  `SettingsView.tsx:593`, JSON backup in `:609`, plus `ReportExport.tsx:67`).**
  Untested, and the cheapest real gap in the tree: it is a pure
  Blob/anchor/`URL.revokeObjectURL` wrapper, fully testable with a stubbed DOM.
- **`voice.ts` — `isLlmAvailable`, `parseVoiceMetrics`.** The network path is
  legitimately hard to test without a fetch seam; the *parsing* of the model's
  answer is not, and that is the part with the interesting failure modes.
- **`pwa.ts` — `registerPwa`/`canInstall`/`promptInstall`/`useInstallable`.**
  Indirectly covered: `batch2.test.ts:258–278` pins `sw.js` and the manifest as
  text and asserts PROD-only registration, but the functions themselves are never
  executed (`beforeinstallprompt` is a browser event).

### 8.2 Components never rendered by any test
13 of the 49 component and view files are not referenced by any test, not even by
name: `BalanceRing`, `BreathingExercise`, `Breathwork`, `CustomThemeEditor`,
`DailyGoals`, `InstallPrompt`, `LagAnalysisCard`, `MedicationReminderScheduler`,
`MedicationTimesCard`, `MonthlyYearlyStats`, `PinLockGate`, `PinLockSettings`,
`ReminderCard`.

Read honestly, that is **not** thirteen holes. Eleven of the thirteen have their
logic covered through the module underneath — `breathing.ts`, `customTheme.ts`,
`lagAnalysis.ts`, `medReminders.ts`, `statsAgg.ts`, `appLock.ts`,
`notifications.ts` all have direct tests; only the component shell is unrendered.
The two genuine gaps are `BalanceRing` (purely presentational, ring geometry and
its `aria` never asserted) and `InstallPrompt` (whose entire contract is a
browser event, so it is also the least testable thing in the list).

`HealthImportCard` is deliberately **not** in this list: Batch 11 caught that a
component can compile, pass every unit test, and never be mounted — that card is
now pinned as mounted by `batch11-collapse.test.ts`, and the same class of
assertion is what keeps the other four feature cards honest.

### 8.3 What the suite is good at
Worth stating, because §8.1–8.2 is a short list by design: the store's
normalisation contract, every pure content module (`nutritionTips`, `sportTips`,
`cardStates`, `trackerDisplay`), the icon policy, the font/CMAP machinery, the
PDF font embedding, the import merge rules and the scoping guards are all pinned
with table-driven tests at the level where a regression would actually hurt.

---

## 9. Honest assessment

**The app is in good shape and I would ship it as it stands.** Typecheck clean,
1755 tests green, production build green, and the last two batches were additive
and scoped — no migration, no new dependency, no change to a stored key's meaning.
The feature set is genuinely broader than the three apps this was measured against
(lag analysis, the modular tracker registry, a real assessments module with
consent as a structural property rather than a checkbox).

Three things I want on the record rather than buried:

1. **One real defect existed (§4.3), and it is now fixed.** A corrupt stored
   `theme` value threw at boot and left a blank app with no in-app way to
   recover. Low likelihood, bad blast radius, and — uncomfortably — the store
   already defended four neighbouring fields from exactly this. Batch 12 commit
   3c closed it with the same pattern and a test that fails without the fix.
2. **The documentation had drifted, and this audit is where it gets corrected
   (§2.4).** "Follow-system theme" was listed as a missing feature across two
   audit generations; it shipped. Any future gap list should be re-derived from
   the tree, the way this one was, rather than inherited.
3. **The remaining debt is mostly surface, not substance (§6, §7, §8).** One
   orphan CSS rule, one duplicated selector pair, five dead exports, two
   untestable-by-design library modules, and thirteen unrendered shells. None of it
   is load-bearing. The collapsible-card candidates in §6 — sixteen strong, five
   weaker — are the largest single UX improvement still on the table — and the reason it is not done here is that
   it changes what a first-time user sees, which is a product decision, not a
   cleanup.
4. **Batch 12 (§10) cleared the load-bearing items on that list** — the
   corrupt-theme defect, the orphan rule, the duplicated pair, six dead exports
   — and added the guard tests that keep them cleared. What it deliberately left
   behind is named in §10.3: one real parser defect, and one design decision
   that is not the auditor's to make.

---

## 10. Batch 12 — the final wrap-up (`feature/final-wrapup`)

Audit date: 2026-09-29 · Branch `feature/final-wrapup` from `main @ 9007014`, six
sequential commits, gates after every one (`tsc -b --noEmit`, `bun test`,
`vite build`). Method as before: every claim re-derived from the tree, with the
two §4/§7 findings that this batch *acted on* re-proved by mutation — putting
the broken line back and watching the test fail, before the fix was kept.

### 10.1 What shipped, per commit

1. **This document** (v2), read-only. Nine sections; §6, §7 and §8 are new.
2. **The 7j fold diagnosis, refreshed** rather than re-written. The write-path
   enumeration was re-run from scratch: 18 `setItem` sites in 17 files, five of
   them added since the first pass. `cardStates.ts` is the new one that looked
   riskiest and is safe structurally — a `Record<string, boolean>` whose parser
   keeps only boolean values. Verdict unchanged: **(a) leave it**.
3. **CSS housekeeping and the guards** (3a–3c). `.iconset-warn` removed;
   `.toast-ok`/`.toast-warn` merged, which turned out to be a *fix* rather than
   tidying — the colour half of that pair was dead, not complementary, because
   `.toast` won the specificity tie by being later in the file, and the dark
   theme was 1.92:1 on `--ok` where it is now 8.63:1. Six dead exports removed
   (five from §7.2 plus `HUNGARIAN_DIACRITICS`, which §7.2 itself misfiled and
   which is corrected in place). And the one real defect in this audit's §4.3:
   `normalizeSettings` now coerces a corrupt stored `theme`, with a test proved
   failing first.
4. **Lato comes back** — cut from the upstream TrueType pinned by URL, size and
   SHA-256 in `scripts/subset-ui-fonts.ts`, both digests re-verified live before
   anything was written. 88 kB for four files, not on the background preload
   list, and the retirement — registry, reason, label and all — is genuinely
   over. The proof aims at the original defect: substituting a Lato cut the way
   Google's Central-European subset is cut fails three assertions.
5. **The auto theme** — already built by three earlier batches, so the plan's
   premise was stale (§2.4). What was missing was one line: the live
   subscription was `mq.addEventListener?.("change", …)`, a silent no-op on
   Safari 13 and iOS 13, whose `MediaQueryList` only has `addListener`.
   `src/lib/media.ts` now owns `matchMedia` for the whole app, and the two
   query strings exist once each.
6. **This section**, plus the PR, the deploy and the production byte-compare.

### 10.2 Verification state at the end of the batch

- `tsc -b --noEmit` clean · `bun test` **1847 pass / 0 fail** across 39 files
  (19 502 `expect()` calls) · `vite build` green (`index-*.js` 1 357 386 B,
  `index-*.css` 37 090 B).
- New proof files: `batch12-css` (7), `batch12-dead-export` (9),
  `batch12-theme` (19), `batch12-lato` (18), `batch12-media` (17).
- Tree: 113 `.ts`/`.tsx` files in `src/` (20 778 lines), 49 modules in
  `src/lib` plus 5 in its two subdirectories, one 2 997-line stylesheet,
  17 388 lines of tests, 24 vendored font binaries totalling 503 kB, zero new
  runtime dependencies.
- House invariants held: `backup/freebuff-before-upgrade` untouched at
  `690c14c`; every moved count re-pinned with its reason at the pin (the
  retired-font list 3→2, the registry 9→10, the category order, the payload
  bound 450→512 kB, two vendoring tests now deriving their counts from the
  subsetter's own `stemOf` rather than assuming one owner); the scoping guards
  extended rather than weakened.

### 10.3 What this batch deliberately left behind

**`src/lib/font-cmap.ts` under-reports code points. A real defect, not fixed
here.** Asked about `public/fonts/inter-latin.woff2` it returns **190** code
points; the file really carries **211**. It misses `€`, `™` and ten of the
twelve typographic marks, and it does the same for the new Lato files — which
in fact carry **all twelve**. By that module's own standard — "a parser that
returns a confident wrong answer is worse than one that refuses" — this is a
bug, and two consequences follow:

- `tests/batch7i-ui-fonts.test.ts`'s "the uncovered set is exactly the twelve" is
  measuring the reader, not the fonts. The assertion still passes, and the
  header's claim that those marks are absent from every family is **not true of
  the files** — only of what the reader reports about them.
- The tests that carry the real weight are unaffected, because they are about
  **letters**, and the reader reports letters correctly. That is why Lato's
  return could be proved at all: both readers agree on ő, ű and every character
  of „Tűnődöm az őszön.".

It wants its own commit, with its own tests. It is a binary parser, and fixing
it in a batch whose subject was CSS, dead exports, a theme and a typeface would
have buried it.

**The app never sets CSS `color-scheme`.** The stylesheet paints a dark theme
by writing custom properties on the document element, and the browser is never
told, so scrollbars, form controls and the canvas behind the page keep the OS
light rendering. This is **not an auto-theme gap** and is not filed as one: a
user who picks „Sötét" by hand gets exactly the same effect, so it belongs to
the dark theme rather than to the mode that follows the OS. It is also a visible
design decision — how the app's own controls should look in dark mode — and not
an auditor's to make. Named here so the next person finds it in one place.

**The §6 collapsible-card candidates** (§6.1–6.3) remain report-only, as
instructed, and remain the largest UX improvement not taken.

## 11. Batch 13 — the instruments check themselves (`feature/final-polish-docs`)

Audit date: 2026-09-30 · Branch `feature/final-polish-docs` from `main @ 87b1df9`,
six sequential commits, gates after every one (`tsc -b --noEmit`, `bun test`,
`vite build`), then PR #27 (CI green: 1954 pass / 0 fail across 43 files),
squash-merged as `main @ 2906d67`. This section closes every finding Batch 12
named in §10.3.

### 11.1 What shipped, per commit

1. **`6246059` — the cmap reader reads the font.** §10.3's headline finding,
   fixed exactly as that section asked: "its own commit, with its own tests".
   `woff2Codepoints` now parses the `cmap` binary — format 4 and format 12,
   every subtable unioned, `MAX_MAPPED_CODEPOINTS` at `0x10000` — instead of
   probing `cp = 0..0x2FF` and calling the probe coverage. `inter-latin` reads
   **211**, not 190; the 21 formerly invisible code points are the en dash, the
   non-breaking space, `€`, `™`, `−` and the typographic marks. All 24
   committed fonts re-measured with the true reader; `tests/batch7i-ui-fonts`
   rewritten so its claim is about the fonts rather than the instrument.
   `tests/batch13-cmap.test.ts` (41 tests) builds synthetic tables, so a wrong
   answer about a fixture is possible and a wrong answer about `public/` is
   not. Note the reader is **build-time**: only `scripts/subset-ui-fonts.ts`
   and the tests import it (its one Node built-in is Brotli), so it ships in
   no bundle — verified in §11.3.
2. **`f60475e` — the browser is told.** §10.3's second finding, one line:
   `applyThemeTokens` now writes `color-scheme: light|dark`, derived from the
   **resolved background** rather than the theme's name. That derivation is
   what makes the `auto` theme follow the OS with no branch of its own, and a
   darkened custom palette follow the palette. It reuses the `isLight` the
   `--on-*` foregrounds use, so the app has one definition of "a light colour".
   The four preset backgrounds sit at 0.94 / 0.93 / 0.87 / 0.08 against the
   0.6 threshold — the nearest is 0.27 away. 25 tests.
3. **`5f78fef` — a test that expired on a date nobody scheduled.** One
   assertion in `batch3.test.ts` compared `getDate()` — the day *of the
   month* — for a dose that wraps past midnight, and was therefore
   red-or-green depending on the calendar. No `src/` change. Recorded here
   because it is the failure mode a frozen clock hides, and commit 6's suite
   deliberately never freezes one.
4. **`07c5ef4` — the sixteen strong cards collapse.** §6.1–6.3, report-only in
   Batch 10 and Batch 12, are now real: all sixteen cards are `CollapsibleCard`,
   and each **says what it is** while collapsed — the summary is derived from
   the registry that owns the card (`fontDef`, `iconSetDef`, `themeMeta`,
   `trackerGroupHeads`, `BADGES`, `monthStat`), never typed next to it, so a
   summary cannot disagree with the thing it summarises. Eleven live in
   `SettingsView`; the other five are components that render their own `Card`,
   so the edit landed where the card already was. `batch11-collapse` 25 → 40
   tests, five mutations, all caught.
5. **`fadbca3` — a map of the repository, with the map checking itself.**
   `docs/PROJECT-INVENTORY.md`: twelve sections, **123 `file:line` claims
   across 51 files**, each pointer an em dash and a quoted anchor — the em
   dash is load-bearing, because on a line with two claims there is no other
   way to tell which anchor went stale.
   `tests/batch13-inventory.test.ts` re-derives every claim (file exists, line
   exists, line says what the doc says) and recomputes the measured-counts
   block from the filesystem and the registries **in both directions**, so a
   stale number cannot hide behind a key that stopped being visited. Six
   mutations, all caught; the checker caught seven wrong anchors in its own
   author's draft, and the document's own `batch7.test.ts` pointers after a
   later commit moved them.
6. **`badb020` — fifteen journeys, asked the way a person asks them.**
   `tests/full-system.test.ts` (944 lines, 16 tests) is the §8 answer: an
   end-to-end suite that fakes **only** `fetch`, `matchMedia`,
   `Notification`, and `localStorage` as substrate — no frozen clock, no
   `mock.module`, no internal spies, and no jsdom, which stays out as a
   dependency. Rendering is `renderToStaticMarkup` under the real provider
   stack; where a journey's next step is a click, the suite performs the same
   state transition through the same exported function the handler calls, and
   the file says so in its header rather than leaving "end to end" to be
   discovered as an over-claim.

### 11.2 What the suite found

- **Fixed:** `src/lib/weather.ts` cached a geocoding **miss** and then refused
  to read it back — `placeCacheGet` only accepted an `ok: true` row — so the
  promise in its own comment ("a typo the user typed once should not cost a
  network round trip every time they open the form") was false,
  `tests/batch8b-weather.test.ts` named the behaviour in its title without
  being able to prove it (its stub cannot count), and every retry of a
  mistyped city went back over the network. S13 counts requests; two calls
  became one.
- **Documented, not fixed:** `applyThemeTokens` writes `--ring-ok`,
  `--ring-warn` and `--ring-bad` on every theme switch and **nothing reads
  them** — the charts and the balance ring paint from `--brand`, `--accent`
  and `--danger` directly. Three dead property writes per switch in a static
  bundle. S07 asserts every written custom property is read by the stylesheet
  and exempts the trio **by name, with the reason attached**, so the day
  someone wires them up the loop fails and the exemption can be deleted with
  it. Left standing because deleting them silently inside a commit about
  tests is the wrong trade.
- **Two places the app was right and the test was wrong** — recorded because a
  suite's first draft is exactly where these get lost. `personalInsights([])`
  returns one honest "not enough data yet" line rather than an empty array (an
  empty array renders as a card with a heading and nothing under it). And the
  dark theme's brand is a **light mint**, so its readable foreground is the
  dark ink, not `#ffffff` — `--on-*` derives from the filled colour while
  `color-scheme` derives from the background, and the two answers are supposed
  to disagree.

### 11.3 End-of-batch verification

- Local and CI identical: **1954 pass / 0 fail across 43 files**; typecheck
  clean; `vite build` green. No new dependencies.
- **Mutation proof** (each applied, run, reverted; each caught by exactly its
  subject): `mergeEntry` loop removed → S03; yesterday-streak fallback
  removed → S04; `color-scheme` line removed → S07; geocode cache ignored →
  S13; stored card state ignored → S10.
- **Production** (`iranytu.freebuff.app`, redeploy after the merge, state
  `active`, 0 unresolved build errors, 50 files): all 50 served files
  `sha256`- and `cmp`-identical to `dist/` under `Accept-Encoding: identity`.
  The served entry bundle is
  `17543813fb55dfdf53b0da2b22f4f46ff22456a902125e13f918c34d83ff77fd`
  (1 359 389 B). Negative control: a bogus asset path returns HTTP 200 and the
  byte-identical 902 B shell — recorded so no one later reads a 200 as proof.
  Content probes on the **served** bundle: `color-scheme` write present with
  the `--on-*` and `--ring-*` trio beside it (the shipped `themes.ts` is
  current); the weather place-cache key present; the eleven settings and five
  insights collapsible ids present; `Sötét`/`Világos` and `tab-order-row` (the
  Batch 11/12 surfaces) present. Absent, as they must be: `PROJECT-INVENTORY`,
  `full-system`, `batch13`, and every `cmap` string — the reader is build-time
  and ships in nothing.
- `docs/` and `tests/` reach no bundle, asserted by the inventory test itself.

### 11.4 What Batch 13 deliberately left behind

- **The `--ring-*` trio** (§11.2) — written, never read, now pinned by name.
  The fix is a three-line deletion whenever someone decides the aliases
  should be wired up or dropped; the test is already shaped for it.
- **§3's standing constraints** are unchanged by this batch: still no
  backend, still no sync, still localStorage-only, still no jsdom.
- The scoping-guard discipline held throughout: every file this branch
  touched was claimed in `BATCH_7_FILES` **before** the commit that touched
  it, because the guard diffs the working tree and passes vacuously on an
  untracked file. `tests/full-system.test.ts` was claimed pre-commit for
  exactly that reason.

*`backup/freebuff-before-upgrade` untouched at `690c14c`.*

---

## 12. Batch C — the help surface, and the values that were frozen (`feat/crisis-card`, PR #11)

Six commits, merged to `main` at `ea0f3ad`. The theme is **things that already
existed and could not be reached**, or existed but had drifted from the palette
they claimed to belong to.

### 12.1 What shipped, per commit

1. **`48d490d` — the help surface, decoupled from the feature that owned it.**
   `RESOURCES`, `DISCLAIMER` and the heading were already in
   `lib/assessments.ts`, but the questionnaire is consent-gated and
   `assessmentsEnabled` defaults to `false` — so the only route to a helpline
   number from inside this app required first agreeing to be assessed. That
   ordering is backwards. Four mounts, zero new literals: `SettingsView.tsx:179`
   (always), `AssessmentResult.tsx:83` (only when `needsSupport`, hoisted above
   the score), `AssessmentConsent.tsx:52` (**declining** must not cost the
   reader a phone number), `EntryDetail.tsx:235` (outside the editing ternary).
   Mount 1 is a plain `Card`, so the collapse counts held at 13/16. The test
   scans the component's **source** for any digit sequence, comments included,
   because a second list of crisis numbers would render correctly, pass every
   assertion, and hand over a decommissioned number.
2. **`69829d7` — self-experiments, and the three-day window nobody can widen.**
   The window is **computed, never supplied**: `endDate` is not a parameter, so
   `startExperiment.length === 1` is asserted as well as the dates. At most one
   active. The `-1` in `addDays(start, EXPERIMENT_DAYS - 1)` was a real bug
   found by the suite — inclusive ends had made it four days.
3. **`9b1f48a` — twelve more badges, and the sidecar that makes them cheap.**
   `AchievementInput` had grown one bespoke field per feature; that does not
   scale. `lib/featureUse.ts` replaces the sprawl with one total map keyed by a
   closed union, and the first mistake it caught was a **tautology** in my own
   `mood-range` rule (`moodLevelsUsed >= new Set(...).size` is true by
   definition), now reading `MOODS.length`.
4. **`3fb5152` — the three deferred badges, and the finding behind them.** They
   **cannot** be derived: `entry.source === "import"` is set by health import,
   CSV import *and* the v1 migration; the food-AI estimate writes a tracker
   indistinguishable from a manual one; PDF export writes nothing at all. So
   `lib/featureFlags.ts` remembers the events — a set of flags, no counters, no
   timestamps — marked at the moment of *commit* (preview applied, estimate
   reached the journal, export resolved), never at the moment of intent.
5. **`6e35cfb` — the three ring aliases, and the exemption that hid two bugs.**
   `--ring-ok/warn/bad` were written by `applyThemeTokens` and read by nothing,
   exempted by name in `full-system.test.ts` since commit 5. Deleting the
   exemption (rather than narrowing it) exposed **two** defects: `BalanceRing`
   painted a ternary of literal hexes — two of them the *light* theme's — and a
   third that matched no theme at all; `InsightsView` held a frozen light
   palette. `var()` is invalid in an SVG presentation attribute, so the three
   tones resolve through `currentColor` plus a CSS `color` on tone classes.
   It then failed again, because the assertion checks for a **declaration**:
   the trio also needed real defaults in `body`.
6. **`c6684e9` — one breathing tool, and the 4-4-4 that nearly died with the
   duplicate.** `Breathwork` had its own phase table, its own interval, and
   advanced the phase by calling a setter **inside another setter's updater**.
   Its real contribution was a three-phase 4-4-4, which is **not** `box`
   (4-4-4-**4**) — deleting it without rescuing the pattern would have removed a
   reachable feature with no test failing, because the pattern lived in the
   deleted file.

### 12.2 End-of-batch verification

**2377 pass / 0 fail across 70 files**; typecheck clean; build green; 50 served
files. No new dependencies, no new glyphs, no new chrome icons. The pinned
counts all held: 13 collapsible rows / 16 card heads, 48 chrome icons, 43
glyphs, 8 derived properties, 21 custom properties, 3 × `gradient` in
`styles.css`, and `BREATH_PATTERNS[0]` = `478` with `[1]` = `box` **by index** —
which is why the new `444` preset was appended rather than inserted.

---

## 13. The mega batch — practices, i18n, and two audits (`feature/mega-batch-final`)

Eight commits planned; four landed as `de5e227`, `2effe79`, `6579940`,
`9f11b53`. The first two are feature work and already merged as PR #12; the
second two are the audits, and they are the subject of this section.

### 13.1 What shipped, per commit

1. **`de5e227` — ten guided practices, on the engine that was already there.**
   `lib/meditations.ts` holds ten text-only practices of three to five minutes.
   `meditationPattern` maps a practice's steps onto a breathing pattern and the
   card drives the same `startEngine` / `stepEngine` pair from one interval, so
   the duplication commit `c6684e9` deleted is avoided here **at design time**.
   The engine cycles — it was built for breathing, which repeats — so the
   stopping condition is the engine's own wrap counter: the first wrap means
   every step has been shown once. `minutes` is redundant with the steps on
   purpose and a test asserts the two agree for all ten records, so a step table
   edited without its header fails loudly instead of quietly promising three
   minutes and taking five.
   One defect **avoided rather than fixed**: `meditationPattern` returns a fresh
   object and the interval effect depends on it, so an unmemoised pattern would
   rebuild the interval every second and the practice would drift. The `useMemo`
   is the fix and a test scans for it.
2. **`2effe79` — the i18n framework, staged, with one surface on it.** Hungarian
   is the source of truth (`TranslationKey` is derived from the `hu` catalogue, so
   a locale cannot define a key the default lacks — a compile error, not a
   review comment); `en` and `de` are typed `Partial`. `t()` falls back **twice**:
   the locale, then Hungarian, then the key itself, because neither a missing
   translation nor a typo may render as an empty box. **Nothing reads
   `navigator.language`, on purpose** — with partial catalogues an English
   browser would get a partly-English card, which is worse than a Hungarian one.
   `resolveLocale` is the seam a switcher will call; until then it is exercised
   by tests rather than by the app, and the inventory names the two stage-only
   exports. Chrome goes through `t()`, the ten practices stay Hungarian content.
3. **`6579940` — the OpenAI SDK stops riding on a secret.** §13.2.
4. **`9f11b53` — the accessibility audit, and the twelve names it found.** §13.3.

### 13.2 Performance audit — finding, and the one fix

**Method, because the numbers are the finding.** A sourcemap build into a
scratch outDir, then the mappings' VLQ decoded so **99.3% of the main chunk is
attributed to its original source file** — 9.1 kB of runtimes and helpers are the
only unattributed bytes.

| Contributor | kB | Share | Used by |
| --- | --- | --- | --- |
| `src/lib/iconsets/fluent-artwork.ts` | 548.6 | **39.0%** | the icon registry |
| the charting family (recharts + d3 + lodash + friends) | 373.7 | **26.6%** | **`InsightsView` only** |
| react-dom + react + scheduler | 137.9 | 9.8% | the app |
| everything else, ~120 files | ~271 | 19.3% | — |

**Two islands are 65.6% of the chunk.** There was no third.

**The finding that turned out to be a bug, not an optimisation.** `voice.ts`
imported the SDK **statically**, so it entered the main bundle in exactly one
situation: when `VITE_OPENAI_API_KEY` was set *at build time*. With no key, Vite
substituted `undefined`, `if (!apiKey) return null` constant-folded, and Rollup
dropped the import — so the reported bundle size was a fact about the build
environment rather than about the app. Measured on one tree:

| Build | before the fix | after the fix |
| --- | --- | --- |
| no key | 1405.1 kB / 353.75 kB gzip | 1431.9 kB / 353.72 kB gzip |
| **with a key** | **1505.9 kB / 381.28 kB gzip** | **1432.0 kB / 353.81 kB gzip** + a separate 102.4 kB SDK chunk |

The two builds now differ by **0.19 kB instead of 100.8**. The SDK is fetched
only when a key exists and somebody actually dictates; the offline Hungarian
parser — the path every keyless reader takes — loads none of it. The probe
asserts the **mechanism** rather than a size: "nothing in `src/` statically
imports the SDK". A build-size assertion would need a build before the tests and
would then measure the test machine's environment instead of the repository's
invariant, and it would catch a regression in the wrong file.

One behaviour change, and an improvement: the `await` sits **inside** the `try`,
so a chunk that fails to load falls through to the offline parser. A static
import threw at module load and took the feature with it, which is not what that
module has always promised.

**Three findings deliberately not acted on**, each blocked on the same missing
piece rather than on effort:

- Splitting `InsightsView` (374 kB) or the artwork (549 kB) out of the main
  chunk would make `public/sw.js` a liability. It caches `/assets/` **runtime
  cache-first with no precache list**, so a lazily-fetched chunk works only after
  it has been fetched once while online — an offline reader opening a tab they
  had never opened would get a hard failure that does not exist today, in an app
  whose premise is `README.md`'s "offline, adatvédett". Filed as **issue #13**
  with the evidence and acceptance criteria, to land as its own commit.
  `InsightsView`'s mount semantics are already safe — views are conditionally
  rendered — so the async fetch is the only obstacle.
- **The toast-driven context re-render.** One context value carries `data`,
  `toasts` and eleven actions, memoised on all four, across **48 `useApp()` call
  sites in 37 files** with **zero `React.memo`** opt-outs. Every confirmation
  toast therefore changes the value and re-renders every consumer, including
  those that never read `toasts`. The dependency chain is provable from source;
  the *cost* is not, because this repository deliberately ships no jsdom and
  renders through `renderToStaticMarkup`, which runs no effects. It needs a
  measurement story before it needs a code change.
- **jsPDF, html2canvas, canvg and purify were already correct** —
  `await import("jspdf")` in `reportPdf.ts:116`, with the rest arriving as
  jsPDF's own separate chunks. Verified, not assumed.

A **re-render survey** also checked the hot paths and found them in better
shape than the headline number suggests: `InsightsView` memoises `cutoff`,
`entries`, `chartData` and `tagCorrelations`; `YearInPixels` memoises `years` and
`matrix`; `useTodayEntry` memoises the lookup. No expensive unmemoised work was
found in a render body.

### 13.3 Accessibility audit — twelve names, and sixteen ratios left alone

**Fixed.** One button was announced as just "button" — the mood radio in the
entry editor, whose only content is an emoji marked `aria-hidden` — and eleven
controls had no accessible name at all: a placeholder, or a sibling
`<span class="field-label">`, which is not a label because a span associates
nothing. All twelve now carry an `aria-label`. Nothing else moved — no class, no
copy, no behaviour.

**The scan was wrong three times first, and that is the useful half.** Each
mistake is a mistake anyone writing this scan would make, and each is encoded in
`tests/lib/a11y-names.test.ts` so the next one is not repeated:

- `onChange={(e) => …}` contains a `>`, so a `[^>]*` attribute match stops at the
  arrow and **every** control with a callback reads as unlabelled. **Nineteen of
  the first twenty-three "findings" were this one bug.**
- Comments in this codebase quote markup, so counting `<label` raw made a
  genuinely wrapped control look unwrapped — which is why
  `BackgroundImagePicker` kept "failing" while documenting that its file input
  *is* under a label.
- `accept="image/*"` contains the two characters `/*`, so the block-comment
  stripper swallowed everything up to the next `*/` and reported a splice of
  unrelated code as a single finding.

I also added `aria-label`s to three controls that **already had one**, because I
trusted the first version of the scan. The compiler caught all three as duplicate
JSX attributes — the one place this class of mistake cannot hide.

**Contrast was measured, not assumed — and the first measurement was wrong
twice.** A ratio is only a fact once you know which pair actually ships, and the
first two answers were guesses that the audit itself then overturned:

- **`--accent` is never text in this stylesheet.** Every one of its sixteen uses
  is a border, an outline, a box-shadow, the `.safety-block-icon` glyph or the
  amber slider thumb — all non-text, so the bar is WCAG 1.4.11's **3:1**, not
  4.5:1. Against a card that measured **3.13 light / 2.55 warm** at the time.
  Reporting it as a text contrast would have put a 4.5 bar on a 3:1 rule and
  sent somebody to darken a colour that was never wrong for its job. The warm
  half of that 2.55 was a real shortfall and is now fixed — see §16.1.
- **The toast pairings are not `surface` on a fill.** `.toast-ok` and
  `.toast-warn` use `var(--on-ok)` and `var(--on-accent)` — the foregrounds
  `applyThemeTokens` derives. Computing `--surface` against those fills was
  measuring a pair the app does not render:

| Toast pair (needs 4.5) | light | dark | warm | vibrant |
| --- | --- | --- | --- | --- |
| `--on-brand` on `--brand` | 7.91 | 7.75 | 5.00 | 6.12 |
| `--on-danger` on `--danger` | 5.51 | 5.75 | 4.90 | 4.62 |
| `--on-ok` on `--ok` | 5.03 | 8.63 | **3.83** | **3.12** |
| `--on-accent` on `--accent` | **3.19** | 8.20 | **2.65** | **4.02** |

  This is the batch's sharpest contrast finding, and it is a **derivation bug,
  not a palette bug**. `isLight` is a single luminance threshold at 0.6; the
  mid-tone greens and ambers land just under it, so they are given **white**
  text where the derived dark `#16211d` would have produced roughly 5.5. §11.1
  commit 2 built that derivation to keep dark themes readable, and it picks the
  wrong side of the midpoint for the success and warning colours of three of the
  four palettes. Fixing it moves one constant and changes every palette — which
  is a design decision, and the table above is what makes it arguable.

  **Resolved in §13.6**: the threshold is 0.5, and all sixteen pairs now clear
  4.5. The table above is kept as the "before" it was argued from.

What survives both corrections as a genuine finding — two of the three since
**fixed in §13.6**, and the third deliberately not:

| Pairing | Rule | Measured | Where it ships | Now |
| --- | --- | --- | --- | --- |
| `--ok` as text | 4.5 | **3.68** warm, **3.12** vibrant | `.pattern-conf[data-level="strong"]`, `.edu-read` | **5.16 / 5.26** |
| `--accent` as icon / thumb | 3.0 | **2.55** warm (3.13 light) | `.safety-block-icon`, `.slider-amber::-webkit-range-thumb` | **fixed — 3.03 warm** |
| `--line` as the 2px input border | 3.0 | **1.39–1.51**, measured against `--surface` only | `.text-input` — and `--surface` sits only **1.09–1.15** from `--bg`, so the border is the *only* thing identifying the control | **fixed — 3.84 worst case** |

The `--line` row carried the wrong ground. `--surface` is where exactly one of
the seven rules painting a control border draws; the rest sit on `--bg`,
`--bg-soft` or `--surface-2`, and against those the real range is **1.15–1.33**.
The fix was a second token, `--control-line` (`--line` mixed 60% toward
`--ink`), because darkening `--line` would have restyled all thirty-four panel
hairlines with it. It clears 3:1 in all four presets and in
`.app.contrast-high`, worst case **3.84**. `.badge-cell` was left alone and is
pinned as a shortfall: its `opacity: 0.55` composites the border toward the
ground whatever colour the token holds, so no token value can reach it.

**Deliberately not fixed, at the time.** Darkening a token changes two themes at
once; moving `isLight` changes all four. Neither is provably safe, both need a
human eye on every palette, and both are recorded in the inventory with their
numbers so the decision is made against evidence rather than memory. The first
two rows were then decided, with the hexes approved against measured tables —
see §13.6. The third row was not, and is still open.

**Clean, with evidence.** No positive `tabindex` anywhere in `src/`. The three
`onClick`-on-a-`div` sites are a modal dialog (`role="alertdialog"`,
`aria-modal`, Escape-bound), its own click-stopper, and a click-outside backdrop
marked `role="presentation"`. Five `aria-live` regions, including the toast
stack's `role="status"`. Reduced motion is clamped globally by a `*` selector
over `animation-duration`, `animation-iteration-count` and `transition-duration`,
covering all 24 transitions and 7 animations — and there is no
`requestAnimationFrame` and no smooth scrolling anywhere in `src/` to slip past
it.

### 13.4 End-of-batch verification

- **2433 pass / 0 fail across 74 files**; `tsc -b` clean; `vite build` green in
  10.00 s. No new dependencies, no new storage keys, no new glyphs, no new
  chrome icons, no new CSS custom properties.
- **Bundles**: entry `index-CjIcGMYD.js` **1405.7 kB**, `sha256`
  `e92fa521658df7fbee774e599b584076cdf732163344ab51f2e702d44fdaf6f2`,
  **1 439 461 B**; jsPDF 381.4 kB, html2canvas 197.6 kB, canvg-family
  `index.es` 147.4 kB, purify 28.7 kB. **50 served files.** The entry chunk is
  0.6 kB larger than before this batch began — the two features plus the SDK fix
  together.
- **Inventory re-measured**, not edited: 139 TS files / 27 139 lines, 71 lib
  modules / 15 379 lines, 55 components / 8 382 lines, 4 views / 2 085 lines,
  74 test files / 26 777 lines, 4 077 CSS lines, 29 storage keys, 27 badges,
  43 glyphs, 48 chrome icons, 12 font families. Every `file:line` anchor in
  `docs/PROJECT-INVENTORY.md` re-checked; one moved (`EntryDetail.tsx:234` →
  `:235`, a line added above it) and was recomputed rather than nudged.
- **The fix is pinned by its mechanism, not its size** — a build-size assertion
  would measure the test machine's environment instead of the repository's
  invariant.
- **Production** (`iranytu2.freebuff.app`, after PR #14 merged as `17aedbe`,
  state `active`, **50 files**, 0 unresolved build errors, Vercel): all **50 of
  50** served files are byte-identical to `dist/` under `Accept-Encoding:
  identity` — compared with `cmp` per file, not by status code. The entry
  bundle is
  `e92fa521658df7fbee774e599b584076cdf732163344ab51f2e702d44fdaf6f2`
  (1 439 461 B), served and local agreeing exactly. **Negative control**: a
  bogus asset path returns **HTTP 200 with 902 bytes**, byte-identical to
  `index.html` — recorded so no one later reads a 200 as proof. `docs/`,
  `tests/`, `package.json` and `bun.lock` all return that same 902-byte shell,
  i.e. none of them is served. Content probes on the **served** bundle: the ten
  practice titles, `meditation.complete`, `4-4-4 (nyugtató)`, and both Batch C
  storage keys all present; `PROJECT-INVENTORY`, `full-system`, `a11y-names`,
  `batch13-inventory`, `breathing-consolidation` and `final-audit-v2` all
  absent; and `OpenAIError` **0** — §13.2's SDK fix confirmed in production
  rather than only in a local build.

### 13.4a The deploy failure that was not a code bug

The first three redeploy attempts failed with `state: error` and
`unresolvedBuildErrorCount: 0` — no build error at all, and a `statusText` frozen
at *"Installing dependencies and running build…"*. Two wrong hypotheses were
tested and disproved before the platform finally surfaced the real message,
`/bin/bash: line 1: vite: command not found`:

1. **"The Node-only builder cannot run bun."** Plausible, and the hosting image
   is documented as Node-only. Changing the install command to `npm ci`
   produced the identical failure — disproved.
2. **"The install step failed."** True but incomplete: the real chain was that
   `bun.lock` was **gitignored**, so hosting received a tree with no lockfile,
   `bun install --frozen-lockfile` had nothing to freeze against, the install
   died without an error, and the build then looked for a `vite` binary that
   had never been installed.

The fix was two commands, both kept: **`npm ci`** (the tracked lockfile, verified
byte-equivalent across all ten direct dependencies) and **`npm run build`** (npm
scripts put `node_modules/.bin` on `PATH`, so the build no longer depends on the
shell). `bun.lock` is now tracked too, so neither surface can drift from the
other — see `docs/PROJECT-INVENTORY.md`, "Two lockfiles, one tree".

The lesson worth keeping: **a deploy that fails with zero reported build errors
is not a build failure, and three retries will not turn one into information.**
The failure was visible in the repository the whole time, as a line in
`.gitignore`.

### 13.5 What this batch deliberately left behind

- **Issue #13 — the service-worker precache list.** The enabler for the two
  largest bundle wins, filed with evidence and acceptance criteria, not
  implemented here.
- **The below-AA contrast pairings.** Sixteen were listed at the end of this
  batch; §13.6 cleared the toast and `--ok`-as-text ones and pinned what is
  left. `--line` as the input border has since been fixed on a second token,
  `--control-line` (and since then `--accent` as the warm icon, which measured
  2.55 and is now **3.03**); still open: the faded `.badge-cell` (since fixed —
  it was 2.03–2.79 under element opacity, and is 4.22–5.77 now) and the
  `--danger`/`--danger-soft` pair, which is 4.47 light and **2.33 dark** because
  `--danger-soft` is a hand-written `:root` hex rather than a theme token. Warm
  (3.98 → 4.54) and vibrant (3.75 → 4.51) have since been fixed by darkening
  `--danger` in those palettes — see §16.1 and §17.
- **The toast-driven context re-render**, pending a measurement story this
  repository cannot provide without a DOM library.
- **§3's standing constraints are unchanged**: still no backend, still no sync,
  still localStorage-only, **still no jsdom** — which is why the re-render cost
  is reported as a mechanism and not as a number.

*`backup/freebuff-before-upgrade` does not exist in this tree. It was not
created, moved or deleted by any commit in this batch; the standing instruction
to leave it alone has been observed by not writing to the path at all.*

## 14. The contrast fix (`fix/contrast-aa`)

Two defects §13.3 measured and declined to fix, now decided and closed.

### 14.1 `isLight`'s line was on the wrong side of the midpoint

The threshold moved from **0.6 to 0.5**, and it is worth being precise about how
narrow that is: across all four palettes and all thirteen tokens, **exactly two
values change their answer** — the light theme's amber `#d97706` (luma 0.531)
and the warm theme's `#c99700` (0.583 — that token is now `#b88a04`; see §16.1,
and it is still on the same side of the line). Everything else sits at least 0.03 away
from either side, which is why no pair that passed before regressed: six pairs
moved, all six improved, none got worse.

The case for 0.5 being a *contrast* number rather than a taste one is that 0.5
is where the better foreground changes sides, not where a colour stops being
"light". A mid-tone amber wants dark text; calling it dark is what gave it
white.

### 14.2 Four token values, each the least change that works

No token was re-designed. Each value is the smallest hue-preserving darkening
that clears 4.5 against **all three** light grounds — `--bg`, `--surface` and
`--surface-2` — not just the one its rule sits on, so the token stays safe
wherever it is read.

| Token | Was | Now | Text ratio before → after |
| --- | --- | --- | --- |
| light `--ok` | `#2f7d52` | `#2e7950` | 5.03 → 5.29 |
| warm `--ok` | `#5f8f3e` | `#4e7533` | 3.83 → **5.36** |
| vibrant `--ok` | `#0ca678` | `#097b59` | 3.12 → **5.26** |
| vibrant `--accent` | `#e0399b` | `#ca338c` | 4.02 → **4.81** |

The dark theme is untouched: its `--ok` is a light green on a dark ground and
already measured 7.3–9.6.

**The vibrant pink needed a value change, and the direction is the interesting
part.** No threshold could fix it — white gives 4.02 and the dark ink gives
4.12, so the token was mid-toned enough that *neither* foreground reached the
bar. Lightening it until the dark ink works was tried first and **rejected**: it
crosses the 0.5 line by 0.001, so a rounding difference in the luminance
calculation flips it back to white and drops the ratio to 3.55. Darkening it
instead keeps white text and sits 0.083 from the line — a margin that means
something. It also raises the pink's own 3:1 non-text ratio from 4.02 to 4.81.

Six pairs moved, six improved, zero regressed:

| Pair | Before | After |
| --- | --- | --- |
| light/`--on-accent` | 3.19 | **5.19** |
| warm/`--on-accent` | 2.65 | **6.23** |
| vibrant/`--on-accent` | 4.02 | **4.81** |
| warm/`--on-ok` | 3.83 | **5.36** |
| vibrant/`--on-ok` | 3.12 | **5.26** |
| light/`--on-ok` | 5.03 | 5.29 |

Filled-surface pairs went from **five failures in sixteen to none**;
`--ok`-as-text went from **seven in twelve to none**.

### 14.3 The guard computes instead of remembering

`tests/contrast.test.ts` reads `THEMES` live, runs the real `applyThemeTokens`
into a fake root and computes WCAG ratios itself. **No colour and no ratio is
hardcoded for a pair that ought to pass** — a table of ratios goes stale the
moment a token moves and still reads as evidence, which is the failure mode this
file exists to avoid.

The pairs it asserts are the ones a rule in `styles.css` actually creates, not a
cross-product. That distinction matters: of the 120 combinations of six text
tokens against five grounds across four themes, **22 fall short** — but most are
pairings nothing draws, such as `--ok` text on a `--brand-soft` background, which
`.disclaimer-block` never does because it sets `--brand-strong`. Asserting them
would demand palette changes to fix colours that are never combined, and would
bury the pairs that are real.

**What was still short when this section was written, pinned at its measured
floor.** Four real pairings, none caused by this fix and none involving a token
it touched. **Three of the four were later fixed by darkening the warm palette
in §16.1** — the table is the historical record, superseded by the guard:

| Pairing | Then | Where it ships | Now |
| --- | --- | --- | --- |
| warm `--ink-soft` on `--bg-soft` | 4.16 | the muted stat chip, which sets both directly | **4.55 — promoted** |
| warm `--brand` on `--bg` | 4.42 | the app title, which inherits the bare page | **4.55 — promoted** |
| warm `--danger` on `--surface-2` | 4.31 | the PIN lock screen's error line | **4.91 — promoted** |
| vibrant `--danger` on `--surface-2` | 4.15 | the same line | **5.00 — promoted**, §17 |

They were all the warm theme's deliberately low-contrast palette, and clearing
them meant darkening its `--brand`, `--danger` **or** `--ink-soft` — which is
what §16.1 eventually did, having first established by exhaustive enumeration
which of the 13×5 combinations no rule in `styles.css` actually paints. One
entry survives, and it is the one warm could not reach. Each floor came with
**two** assertions, which is what made it a guard rather than a concession:
`ratio >= floor` so a later edit cannot make an existing defect worse, and
`ratio < 4.5` so that when a palette change *did* fix one, the test went red and
the entry had to be promoted by hand. That red is how the three promotions
happened rather than being silently absorbed. A list that quietly accepted a
passing value would stop being a record of what is broken.

`--line` as the input border was the sharpest of the non-text findings, and it is
now fixed rather than pinned. The fix was a second token, `--control-line`,
because the measurement underneath it was wrong in the conservative direction:
1.39–1.51 was `--line` against `--surface`, and against the ground each of the
seven control rules actually sits on it is **1.15–1.33**. `--control-line` is
`--line` mixed 60% toward `--ink`, so it DERIVES rather than storing a hex per
palette — a custom theme the reader builds in Settings gets a border following
their own two colours. Worst case across the four presets and high contrast is
**3.84**. `--line` keeps the thirty-four panel hairlines, where quiet is the
point, and its own 1.39 is still correct for what it now is.

### 14.4 Two tests were re-implementing the rule they claimed to check

`tests/batch12-css.test.ts` and `tests/batch13-color-scheme.test.ts` each
carried a private copy of the luminance formula **with its own `0.6` literal**.
Moving the threshold would have left both copies deciding the old way — green
tests over a function the app no longer runs. Both now import and call the real
`isLight`, which is the version of this test that cannot rot. A third file
(`tests/lib/image-background.test.ts`) only mentioned 0.6 in a comment, and
`src/lib/imageBackground.ts`'s `TINT_MIX` comment said the line was 0.6 with
"a third of the scale to spare either way" — at 0.5 the margins become
symmetric, 0.167 apart on each side, which the comment now says.

### 14.5 A latent bug found on the way, since fixed

`--muted` was used by three rules in `styles.css` and **defined nowhere** — not
in `THEMES`, not in `VAR_NAMES`, not in `:root`. `var(--muted)` with no fallback
is invalid at computed-value time, so `.iconset-chrome h5`, `.meditation-step`
and `.meditation-clock` silently inherited their colour instead of being
de-emphasised. `--ink-soft` is the token the rest of the stylesheet uses for
exactly that purpose, in sixty-two places.

**Fixed**, as three in-place substitutions. One detail the original note got
loose about: because `color` is an **inherited** property, an invalid `var()`
there does not fall back to the initial value — it inherits. So those three
rules were not rendering an unset colour, they were rendering `body`'s `--ink`
at full strength, and the fix is a visible de-emphasis rather than a no-op.

---

## 15. Opt-in encrypted cloud backup (`feature/encrypted-cloud-backup`)

Seven new modules under `src/lib/`, one new card in Settings, and **no new
runtime dependency**. This entry records what the feature guarantees, what it
refuses to promise, and which claims are guarded by a test that would fail if
the code stopped keeping them.

**It is a file, not a sync engine.** A reader who wants their journal off the
device gets one encrypted file written where they point it — Drive, iCloud, a
pendrive. There is no account, no server, no key that leaves the device, and
nothing runs until the reader asks for it. Everything the app knows is already
in `localStorage`; the whole feature is about getting a sealed copy of those
keys out of the browser and back again.

### 15.1 The scope is an allow-list, and the nine exclusions are decisions

The collector asks for **fourteen** keys by name and never enumerates storage.
Nine more are named as exclusions, and each is a judgement rather than an
omission:

| Excluded | Why |
| --- | --- |
| `belso-iranytu:openai-key` | a secret that must never reach a cloud file, even encrypted |
| `belso-iranytu-attachments`, `belso-iranytu-background` | bulky binaries, and the settings copy names them anyway |
| `belso-iranytu-app-lock`, `belso-iranytu-app-lock-session` | the PIN and this session's unlock state — device-scoped by nature |
| `belso-iranytu:cardStates` | which cards the reader left open; a layout, not their writing |
| `belso-iranytu-med-reminders-fired`, `belso-iranytu-reminder-last` | one-day notification bookkeeping that would be wrong on another device |
| `belso-iranytu-install-banner-dismissed` | the same, for the install prompt |
| the v1 leftovers (`belso-iranytu-data`, `belso-iranytu-profile`, `daily-goals`) | restoring them would offer a migrated store to the migrator a second time |

**The one key added for the feature holds nothing secret, and it does not
travel.** `saveCount`, `lastSavedAt`, `enabled` and the enrolled passkey's
credential id — the id is device-local and useless elsewhere — and none of them
are in the bundle, because the state key is absent from the included list rather
than excluded by name. That is deliberate: a restored device reports "backup:
off" and a count of zero, instead of implying a backup exists on a machine that
has never made one.

### 15.2 Three ways in, one data key out

Each unlock path derives its own wrapping key through HKDF-SHA256 with a
**distinct `info` string**, so a key derived one way cannot be mistaken for a key
derived another:

| Path | Derivation | Cost the reader pays |
| --- | --- | --- |
| Passkey | WebAuthn PRF output → HKDF | a device ceremony, no secret to remember |
| Password | PBKDF2-SHA256, 600 000 iterations, per-account salt → HKDF | a passphrase, and a floor of ten characters |
| Recovery code | twelve words → 120 bits (116 secret, 4 checksum) → HKDF | writing twelve words down, once |

The key that encrypts the journal is none of those. The file carries a 256-bit
**data key**, sealed once per enrolled path into named slots — which is what lets
a restore say exactly which secrets a file accepts instead of guessing, and what
makes a future fourth path an addition rather than a migration. That data key is
extractable for exactly as long as wrapping needs and is then re-imported
non-extractable; the instance capable of leaving the WebCrypto boundary is
dropped inside the module that created it, and the tests try to export it and
expect the rejection.

**Re-saving proves the old key first.** A save opens and decrypts the file
*before* writing a byte, because that is the only way to learn both that the
secret is right and which slots the file already carries. A new file is never
written in its place: a save that quietly replaced a two-key file with a one-key
file would drop the reader's other way back in.

### 15.3 Recovery is designed, not improvised

The code is **1024 Hungarian words this repository owns** — there is
deliberately no BIP39 list anywhere in the tree to be confused with it, since a
BIP39 mnemonic is not what unlocks anything here; HKDF over this list's own
output is. Ten bits per word, four of them a checksum.

Three decisions in the card exist only because of what happens when a reader
loses this:

- the twelve words are shown **before** the file is written, not after — a code
  revealed once, after the moment it became unrecoverable, is not a code;
- the save button stays dead until the reader says they have written them down;
- a cancelled save leaves the feature **off** rather than half-armed, which is
  also why the enable control is an action button and not a toggle: a toggle can
  sit "on" over an empty drive, and a reader told their journal is backed up
  when it is not is worse off than one who never switched it on.

### 15.4 The scheduler asks, and cannot act — on purpose

A background save is not available in a browser, and the reason is not this
app's architecture: **both the file picker and a WebAuthn assertion require user
activation**. There is no unattended path, so the scheduler
(`src/lib/backupDaemon.ts`) decides and says so once — it never writes. The
alternative, a timer firing silently into a gesture that never arrives, is the
worst outcome available: the reader believing their journal is backed up while
the file is a week old.

Six checks, in a fixed order: not set up → silent; never written → ask; older
than a day → ask (checked **before** the change gate, because it is the one
trigger that must survive a session in which the reader only looked); nothing
changed → silent; changed within five minutes → silent (a journal gets written
in bursts); changed and settled → ask. One ask per session, and only a **moved
file stamp** clears it — the card writes that stamp, so it is the one signal the
scheduler cannot mistake.

**Two limits are stated in the UI, not only in a comment**: nothing runs when the
app is closed — the same sentence the medication reminders carry — and a browser
cannot write a file without a press. Its memory is a ref; the app keeps no extra
state to honour it.

### 15.5 What is guarded, and what is deliberately not

Guard behaviour worth naming, because each is load-bearing rather than
decorative: the recovery code's twelve words are each asserted to be real entries
in the list (an earlier "twelve distinct words" assertion was a coin flip — two
draws from 1024 collide about 6% of runs); the storage-key list and the card's
rendered class list are pinned as fixed sets; the inventory's `file:line` claims
are verified by reading the named line; and the Settings page's collapsible-head
count is pinned, which is why this card is a plain `Card` rather than a
collapsible one.

Mutation testing is the measure that matters here, because a scheduler is mostly
comparisons: **eight deliberate defects in the scheduler alone produced sixteen
predicted failures and sixteen observed reds** — the `enabled` gate, both time
boundaries (`<` vs `<=` at the debounce edge, `>=` vs `>` at the day edge), the
once-per-session latch, the stamp that clears a pending change, the fold, the
check on app open, and the leaked store subscription. Earlier commits proved
their own gates the same way (6 mutants/13 reds for the card, and mutation-proved
suites for the crypto, key and storage layers).

**Honest limitations, in the spirit of §3:** this is not continuous backup and
cannot become one in a browser tab; the File System Access handle it remembers is
a convenience whose loss costs one extra picker and never a backup; losing both
the passphrase and the twelve words makes the file unrecoverable **by
construction**, which is the property the feature trades its convenience for; and
a file written on one device restores onto another as a merge, with days the file
does not know surviving alongside days both sides have.

## 16. The warm palette contrast pass (`fix/warm-contrast`)

§14.3 pinned four short pairings and said the honest reason they were still
short: clearing them meant darkening the warm theme's `--brand`, `--danger`
**or** `--ink-soft`, which was called a redesign rather than a fix. This
section is that redesign, done as four one-line token edits and nothing else.

### 16.1 What ships, and why each value is the smallest one that works

Every new value is `mixHex` of the old one toward the warm theme's own
`--ink` (`#3a2d22`), so the hue is preserved by construction and the palette
does not drift away from itself. Percentages were solved by sweep against the
real `mixHex`, then confirmed to reproduce the shipped hex exactly; the sweep
range below is the 8-bit rounding plateau, not a guess.

| Token | Was | Mix | Now | Hue |
| --- | --- | --- | --- | --- |
| warm `--ink-soft` | `#7a6a58` | 10% | `#746453` | 31.8° → 30.9° |
| warm `--brand` | `#b3541e` | 3% | `#af531e` | 21.7° → 21.9° |
| warm `--accent` | `#c99700` | 12% | `#b88a04` | 45.1° → 44.7° |
| warm `--danger` | `#c04a3a` | 13% | `#af4637` | 7.2° → 7.5° |

The largest hue movement is **0.9°**, on the token that moved furthest. What
changed visually is *depth*, not identity: the warm theme reads a shade more
serious, and its amber and its red stop being the two colours in the palette
that fail to hold up.

Six pairings moved, and every one improved:

| Pairing | Rule | Was | Now | Where it ships |
| --- | --- | --- | --- | --- |
| `--ink-soft` on `--bg-soft` | 4.5 | 4.16 | **4.55** | `.stat`, the muted stat chip |
| `--brand` on `--bg` | 4.5 | 4.42 | **4.55** | `.app-title`, on the bare page |
| `--danger` on `--surface-2` | 4.5 | 4.31 | **4.91** | the PIN lock screen's error line |
| `--brand` on `--surface-2` | 4.5 | 4.39 | **4.52** | `.med-chip`, `.font-option-badge` |
| `--danger` on `--danger-soft` | 4.5 | 3.98 | **4.54** | `.corr-down`, `.med-chip-x:hover` |
| `--accent` on `--surface` | 3.0 | 2.55 | **3.03** | `.safety-block-icon`, the amber slider thumb |

The last two are the ones §14.3 could not even see. `--brand`/`--surface-2` was
real but unlisted; `--danger`/`--danger-soft` is worse than unlisted, because
**`--danger-soft` is a hand-written `:root` hex in `styles.css`, not a theme
token**, so no 13×5 token matrix can contain that pair at all. Both are now
asserted (§16.2).

**Three things were deliberately NOT touched.** `--brand-strong` stays `#8f3f13`,
because no pair needed it and moving it would darken the disclaimer block for
nothing. `--ok` stays `#4e7533`, already fixed in §14.2. And the warm `--accent`
at 12% is a coupling worth naming: `--accent` approaches the `isLight` 0.5 line,
and at 12% it does **not** flip — `--on-accent` is still the dark `#16211d`, at
5.26. One more percent toward ink would cross the line, hand the amber its own
colour as a foreground, and drop that ratio to about 1.6. The margin is thin and
it is now guarded rather than assumed.

### 16.2 One new guard, and one pair still open

`--danger` on `--danger-soft` cannot be reached by darkening `--danger` alone,
because the dark theme's `--danger` is a light `#e07a86` on a light pink. It is
pinned per preset — light **4.47**, warm **4.54**, vibrant **3.75**, dark
**2.33** — with a two-sided assertion of its own: warm must clear 4.5, the other
three are floored two-sided, and one test asserts that `styles.css` still
declares `--danger-soft: #f6e3e5`, so the number cannot be moved underneath the
guard by editing a CSS comment. Fixing the remaining three properly means making
`--danger-soft` a themed token, which is a larger change than this pass.

`KNOWN_SHORTFALLS` held **one** entry at this point — vibrant `--danger` on
`--surface-2` at 4.15, the same PIN error line in the sibling palette, and the
last thing standing between that pair and a plain `TEXT_PAIRS` assertion. The
three warm entries were not deleted: they were promoted into `TEXT_PAIRS`, which
is what the `ratio < 4.5` half of each pin exists to force. A shortfall list
that quietly swallowed a passing value would stop recording what is broken. §17
is where the fourth promotion happened and the list became empty.

**Verification, and its limits.** Every ratio above is computed through the real
`applyThemeTokens` with the real `mixHex`/`isLight` and WCAG linearised
luminance — the same three functions `tests/contrast.test.ts` uses, so the
report and the guard cannot drift apart. Mutation-tested in two rounds, each
token reverted to the value it had at `main`: `--ink-soft` and `--brand` gave
**one** red between them (the promoted `TEXT_PAIRS` entries), `--accent` and
`--danger` gave **three** (`NON_TEXT_PAIRS`, the theme-scoped PIN-error block, and
the `--danger-soft` block) — **five reds for four mutations, and every token
watched.** That is what makes them guards rather than comments.

One honest note on how that was reached: the first round of mutation testing
found that `--ink-soft` produced **no** red at all. Three warm entries had been
removed from `KNOWN_SHORTFALLS` but only one of them had a replacement
assertion, so `--ink-soft`/`--bg-soft` and `--brand`/`--bg` were left guarding
nothing while still reading as guarded. That is the exact failure the promotion
is supposed to prevent, caught by the mutation round rather than by reading the
diff, and it is why §16.2's numbers are measured twice over.

What this section does **not** claim: that the palette was reviewed in a browser
by a person, and that the "nothing paints this pair" conclusion rests on
stylesheet resolution plus a ground audit rather than a DOM walk — 64 rules
inherit their ground from a component parent and cannot be settled from CSS
alone.

## 17. The vibrant pass, and the last pin (`fix/vibrant-contrast`)

§16 fixed four warm pairings. The vibrant palette needed **one** token, and the
reason it needed so much less is worth stating plainly: vibrant was already
accessibility-aware when §14 put it there. Measured through the real
`applyThemeTokens` with the real `mixHex`/`isLight` and linearised luminance,
before this pass:

| Token | Asserted pairs | Worst | Verdict |
| --- | --- | --- | --- |
| `--brand` | `bg` 5.48, `surface` 6.12, `surface-2` 5.50 | 5.48 | clears at 0% |
| `--ink-soft` | `bg` 5.54, `bg-soft` 5.03, `surface` 6.19, `surface-2` 5.56 | 5.03 | clears at 0% |
| `--accent` | `surface` 4.81 as non-text (bar 3) | 4.81 | clears at 0% |
| `--danger` | `surface` 4.62, **`surface-2` 4.15** | **4.15** | **short, twice** |

`mixHex` 14% of `--danger` toward the vibrant `--ink` (`#221a3a`) gives
`#bd3065`, which clears both short cells at once:

| Pairing | Was | Now |
| --- | --- | --- |
| `--danger` on `--surface-2` | 4.15 | **5.00** |
| `--danger` on `--danger-soft` | 3.75 | **4.51** |
| `--danger` on `--surface` | 4.62 | **5.56** |
| `--on-danger` on `--danger` | 4.62 | **5.56** |

13% gives `#bf3066` and misses `--danger-soft`, so 14% is the integer minimum
rather than a round number. Hue moves **1.6°** (339.0 → 337.4) and `isLight`
stays `false`, so `--on-danger` keeps its white foreground.

### 17.1 One token was darkened, and the reason the other three were not

The plan named four tokens. The measurement cleared three of them, and
darkening a token that already passes is a restyle of the user's screen bought
for nothing — so this pass darkened one line.

**`--accent` is the instructive one.** The solver would darken it to `#b73083` to
clear 4.5 on `--danger-soft`, and that would have been wrong. Only two rules in
the stylesheet paint on that ground — `.corr-down` and `.med-chip-x:hover` — and
both set `color: var(--danger)`. Nothing draws the accent there, so the pairing
is not real, and the change would have altered a colour no user sees in order to
satisfy a ratio no user meets. This is the same rule §14.3 stated: a pair earns
an assertion when a stylesheet rule puts that foreground on that ground.

### 17.2 The list is empty, and that needed a new test

Promoting vibrant `--danger`/`--surface-2` emptied `KNOWN_SHORTFALLS`, which
resolved the one asymmetry this file was carrying: `TEXT_PAIRS` is theme-agnostic,
so the pair could not be promoted while vibrant was the palette that could not
pay 4.5. All four now clear it (light 5.02, warm 4.91, vibrant 5.00, dark 4.88)
and the pair asserts outright. The block that existed to explain the asymmetry
was deleted rather than left describing a problem that no longer exists.

An empty list is exactly the state where the two tests built around it pass on
an empty array and prove nothing. So `PINNED_HISTORY` keeps the record of all
four pairs ever pinned, and one new test walks them in all four palettes
requiring that anything below 4.5 be named in `KNOWN_SHORTFALLS`. A pair that
regresses fails there instead of sitting short and unmentioned.

That test is not decoration. §16 was found to have had exactly the bug it
prevents — three shortfall entries deleted with one replacement assertion — and
the only reason it was caught before shipping was a mutation round that produced
no red where one was expected.

### 17.3 Mutation proof

Reverting `--danger` to `#d6336c` produced **three** reds against three predicted:
the promoted `TEXT_PAIRS` entry for vibrant, the `--danger-soft` assertion for
vibrant, and the new completeness test, which names the cell and its value
(`vibrant: --danger #d6336c on --surface2 #f4f1ff = 4.15, which is below AA and
NOT in KNOWN_SHORTFALLS`).

**Still open:** `--danger` on `--danger-soft` for light (4.47) and dark (2.33).
Neither is reachable by darkening `--danger`, because the dark palette paints a
light colour onto a light ground. Fixing them means making `--danger-soft` a
themed token — a stylesheet change, not a palette fix.

## 18. The closing state (`docs/final-audit`)

Everything above is the record of how the project got here. This section is
where it stands after the backup, warm, vibrant and i18n phases, what is
genuinely still open, and what comes next.

### 18.1 What shipped since §13

Four phases, six PRs, each merged as a true merge commit and each verified by
byte-comparing production against a local build rather than by trusting a 200.

| Phase | What it did | Merge |
| --- | --- | --- |
| Opt-in encrypted backup (§15) | passkey / passphrase / 12-word key hierarchy, three destinations, restore-as-merge, a scheduler that asks and cannot act | `7f0c8a3` |
| Warm contrast (§16) | four warm tokens darkened; five short pairings promoted; `--danger-soft` made guardable | `5ba7460` |
| Vibrant contrast (§17) | one vibrant token darkened; the last pin promoted; the shortfall list emptied | `caa8e51` |
| i18n scaffold | coverage made measurable; "how to add a language" written down | `531d0ab` |

**The backup feature is the substantive one.** Everything else in this series
is contrast arithmetic and documentation. It is also the one place the project
gained a capability it did not have: an encrypted, user-held backup that never
touches a server, with the scope an allow-list of nine explicit exclusions
rather than a denylist that could leak a key added next year.

**The contrast work is finished, not merely improved.** All three original
palettes now clear WCAG AA on every pair a stylesheet rule actually creates.
`KNOWN_SHORTFALLS` is empty, and the two remaining pins live somewhere the
palette cannot reach (see 18.3).

**The i18n phase shipped no runtime change.** The new coverage functions are
tree-shaken because nothing calls them yet — which is the correct consequence
of holding the phase at "framework, no string extraction", and worth stating
plainly rather than letting a green deploy imply otherwise.

### 18.2 Feature inventory, complete

Every area the app covers today, verified against the tree rather than memory:

**Journaling** — 5-level mood, stress/energy sliders, note, tags, emotions,
activities incl. custom; per-entry photo/audio/video attachments; voice intake
with an optional LLM path; onboarding.

**Trackers** — seven built-in groups (sleep, symptoms, vitamins, weather,
nutrition, sport, steps) plus custom trackers; `null` means "not recorded", and
that default is load-bearing.

**Insight** — weekly summary, mood curve with period switching, activity–mood
correlation, quadrant analysis, pattern insights, year-in-pixels.

**Practice and help** — ten guided practices, a breathing tool with a quick
mode, 4-4-4 breathing, a medication list, micro-lessons and an education
library, a crisis card, and a badge shelf.

**Settings and data** — name and goal, module toggles, daily and medication
reminders, font size and high contrast, four themes plus a custom theme
builder, CSV/JSON import and export, and delete-everything.

**Data protection** — an opt-in encrypted backup with three destinations
(passkey, passphrase, twelve recovery words), restore-as-merge, and an
allow-list scope.

**Accessibility** — computed WCAG AA guards across all four presets, large
touch targets, keyboard-reachable controls, and an `a11y-names` guard that
fails if any control loses its accessible name.

### 18.3 Known limitations, as they stand now

**Inherent to the architecture, and not defects.** Everything works only while
the tab is open — there is no push path, because a mood journal has no business
waking a device at 2am. `localStorage` is the whole persistence layer, roughly
5 MB, and clearing browser data destroys the journal. There is no account, no
server, and no telemetry, and the project considers all three correct.

**Two contrast pins remain, and neither is reachable by a palette change.**
`--danger` on `--danger-soft` is 4.47 in light and **2.33 in dark**, because
`--danger-soft: #f6e3e5` is a hand-written `:root` hex in `styles.css` rather
than a theme token, so the dark palette paints a light `#e07a86` onto a light
pink. No 13×5 token matrix can even see the pairing. Fixing it means promoting
`--danger-soft` to a themed token — a stylesheet change, deliberately a separate
project, because it touches a ground seven rules share.

**Honest limits of the verification itself.** The palettes have never been
reviewed by a person in a browser; they were computed, mutation-tested and
byte-compared, which is not the same as looked at. The "nothing paints this
pair" conclusion rests on stylesheet resolution plus a ground audit rather than
a DOM walk — 64 rules inherit their ground from a component parent and cannot
be settled from CSS alone. `bun test` shares one module registry, and one
run in this series showed a single failure that did not reproduce in twenty
subsequent runs or on CI; it was never identified, so it is reported rather
than dismissed.

**Coverage that is incomplete and named.** 51 of 85 test files are not
enumerated in `PROJECT-INVENTORY.md` — a pre-existing gap in that document,
not in the suite. And `i18n` covers nine keys on one surface: the framework
works, the translation does not, and any reader who switches locale today gets
Hungarian, which is the staging working as intended.

### 18.4 Roadmap, in the order it is worth doing

1. **Make `--danger-soft` a themed token.** The last two contrast pins, and the
   only thing standing between the palette and full AA coverage. Touches seven
   rules; mechanical, and `contrast.test.ts` would verify it.
2. **Look at the palettes in a browser.** Every number is right and nobody has
   seen them. This is the cheapest remaining risk-reduction in the project.
3. **Extract strings, or drop the i18n scaffold.** A framework with nine keys
   and no caller is furniture with good tests. Either the next extraction pass
   makes it real, or it should be deleted rather than left looking like a plan.
4. **Close the inventory's test-file gap** — enumerate all 85 suites, or state
   in §10 that it documents the notable ones and stop the number drifting.
5. **Finish the backup's ergonomics** — the File System Access handle is
   remembered but its loss costs a picker every time, and there is no
   "remind me if I have not backed up in 30 days" signal.
6. **Issue #13, the service-worker precache list.** The enabler for the two
   largest bundle wins, filed with evidence in §13.5 and still not implemented.

### 18.5 How this series was verified

Every commit gated: typecheck, the full suite with and without a `dist/`
present, and a production build. Every palette change mutation-tested — reverting
each token and requiring a red, which is how the warm pass discovered that two
of its own pairs were guarding nothing. Every production claim proved by sha256
**and** `cmp` under `Accept-Encoding: identity`, with a bogus path returning the
902-byte shell as a negative control, because in this project's hosting a 200
proves nothing at all.

## 19. The failure that was never identified (`fix/flaky-test`)

One full-suite run during the i18n phase reported **2694 pass / 1 fail**. The
name of the failing test was lost: the output had been piped through `tail -4`,
which discarded it. It did not recur in 20+ subsequent runs, nor on CI. This
section is the attempt to close that honestly rather than let it sit.

### 19.1 Sixty clean runs, and the harness that can catch the next one

Thirty consecutive full-suite runs before any change, thirty after. **60 of 60
clean, 2695 pass each.** Every run wrote its exit status, its pass and fail
counts, and — on failure — the failing test names and the error text to a file.
Nothing was filtered through `tail`, because `tail` is precisely what destroyed
the original evidence. The harness matters more than the count: a flake that
never fires is not "fixed", it is "unobserved", and the only way to tell those
apart is a reproduction setup that would survive it.

### 19.2 One real hazard, found and fixed

There is no global test setup — no `bunfig.toml`, no preload, no DOM shim. Each
of **39 test files installs its own `globalThis.localStorage` double at module
scope, and none of them removes it.** `bun test` shares one `globalThis` across
every file, so the last file to be installed owns the global for whatever runs
after it.

`tests/batch7f.test.ts` was the one with a genuinely dangerous shape, and it is
now scoped:

- It was the **only** file of the 39 to use `Object.defineProperty` rather than a
  plain assignment. The other 38 are overwritten by the next file's assignment,
  so their damage is bounded. Nothing after `batch7f` is guaranteed to assign.
- It was the **only** one to install the double and then `await import()` the
  app modules (`AppContext`, `IconSetContext`, `ContentIcon`, `NavIcon`, `store`)
  *after* installing it — so those modules began their lives bound to this
  double, and it was never put back.
- It had **no `afterAll`** at all.

It now captures the prior descriptor, restores it exactly in `afterAll`
(including the "there was no `localStorage`" case, which a bare `delete` would
get wrong), and its double implements the **full `Storage` surface** — `clear`,
`key`, `length` — rather than three of six methods.

That last part is worth its own sentence. Nothing in `src/` calls `clear()`,
`key()` or `.length` today, which was checked rather than assumed. A partial
double is not a bug until something calls a method it lacks, and then it is a
`TypeError` that appears only under whichever double happened to win the install
order — a failure with no obvious cause and no reliable reproduction.

### 19.3 What this does NOT establish, stated plainly

**The original failure remains unidentified.** During this investigation a
failure *was* produced — and it was not a flake:

```
error: inventory says testLines = 30828, tree says 30856
(fail) PROJECT-INVENTORY — the measured counts are the current tree
       > every declared number equals the recomputed one
 2694 pass
 1 fail
 24629 expect() calls
```

That is the inventory's measured-count guard doing its job: a test file had been
edited without re-measuring `testLines`, and the suite correctly refused to pass.
It has the same headline — **2694 pass / 1 fail** — as the original.

**It is nonetheless almost certainly not the original**, and the reason is
checkable rather than a guess. The reproduced failure logged **24629** expect()
calls; the original logged **24554**. Seventy-five apart. And at the moment the
original occurred, the counts were verifiably correct: the failing run followed
a commit whose `testLines` had been re-measured two commits earlier, and the
change in between touched only `docs/`, which is not counted.

So the leading candidate is *ruled out* rather than confirmed, which is a real
result — the question has narrowed — but it is not a solution. What is now on
record is: sixty clean runs, one hazard located and fixed, one candidate
eliminated with a numeric argument, and a reproduction harness that would
capture the next occurrence.

**The honest summary is that this suite may still contain an unobserved flake.**
Nothing found here proves otherwise, and the absence of a reproduction is not
evidence of correctness. The lesson is procedural and cheap: never filter a gate
whose failure you may need to diagnose.

## 20. `--danger-soft` became a token (`fix/danger-soft-token`)

The roadmap's first item, done. §18.3 recorded two contrast pins that "neither
is reachable by a palette change", because `--danger-soft: #f6e3e5` was a
hand-written `:root` hex rather than a theme token. It is the fourteenth token
now.

### 20.1 One rule, not four chosen numbers

`--danger-soft = mixHex(--danger, --surface, 88%)` — the smallest blend that
clears 4.5 in all four palettes. Deriving it from the palette's own `--danger`
and `--surface` is what makes it a *tint* rather than a colour picked beside the
palette, and it means a future palette gets a coherent chip without anybody
remembering to add one.

| Palette | Was | Now | Ratio |
| --- | --- | --- | --- |
| light | `#f6e3e5` | `#f6e7e3` | 4.47 → **4.58** |
| warm | `#f6e3e5` | `#f5e4db` | 4.54 → **4.53** |
| vibrant | `#f6e3e5` | `#f7e6ed` | 4.51 → **4.64** |
| dark | `#f6e3e5` | `#332e2c` | **2.33 → 4.65** |

### 20.2 The dark palette was painting a design bug, not just failing a ratio

The 2.33 was the visible symptom of something worse: a dark interface drawing
**light pink rectangles** for its error chips, because the shared `:root` hex
was light and `--danger` in the dark palette is a light rose. The fix is
therefore a visual correction in the right direction — dark's chips become a
muted dark warm ground under the same text — and the ratio follows rather than
being chased.

Light, warm and vibrant move by a hair each: light's fractionally toward its
own rose `#b3424f`, warm's toward its terracotta, vibrant's toward its magenta.
None is a change a reader would notice, which is the point of deriving rather
than choosing.

### 20.3 The pins are gone, and the guard is not just a ratio

The two two-sided pins for light and dark were deleted rather than re-numbered.
They were two-sided on purpose — a pin whose pair starts passing goes red and
must be deleted by hand — so leaving them at their old floors would have been
the one thing this change must not do.

Three guards replace them:

1. **All four palettes assert `--danger` on their own `--danger-soft` at 4.5.**
2. **The four grounds must be four DISTINCT values.** This is the one that
   matters most: four copies of the same hex would satisfy every ratio
   assertion while dark was still painting light pink — exactly the defect
   being removed.
3. **`:root` must declare `THEMES.light.dangerSoft`**, asserted against the
   palette rather than a literal, so the stylesheet's first-frame default and
   the token cannot drift apart.

### 20.4 Mutation proof

Reverting **dark only** to the shared hex: **1 red**, naming the exact pair and
its measured ratio — `dark: --danger #e07a86 on --danger-soft #f6e3e5`,
expected ≥ 4.5, received 2.33.

Reverting **all four** to the shared hex: **4 reds** — light's ratio (4.47),
dark's ratio (2.33), the distinctness guard, and the `:root`-default guard. The
distinctness guard is what a single-theme mutation cannot reach, and it is the
only one of the three that would have caught a whole-token revert rather than
one value drifting.
