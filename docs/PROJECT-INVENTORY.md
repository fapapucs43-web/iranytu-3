# Project inventory — Belső iránytű

This is a map of the repository as it actually is, not as it was meant to be.
Every `path:line` claim below is machine-checked by
`tests/batch13-inventory.test.ts`, which reads this file, extracts each claim,
and asserts three things: the file exists, the line exists, and that line
contains the quoted anchor. The measured-counts block in §1 is recomputed from
the filesystem, and §10's table is recomputed against the tree, by the same
test. If a claim drifts, the suite goes red — which is the only property that
makes a document like this worth anything six months from now.

**How to read a claim.** A claim is a code span naming a file and a line, an em
dash, and a second span quoting what that line says — for instance
`src/lib/store.ts:30` — `const KEY = "belso-iranytu-data-v2";`, meaning the
25th line of that file contains that text. The separator is part of the format,
not decoration: a pointer without it is a failure, because a line carrying two
claims has two possible anchors and no way to tell which one went stale.

**Tree at the time of writing** — the same numbers §1's guard recomputes:

```json
{
    "srcTsFiles": 187,
    "srcTsLines": 49726,
    "srcCssFiles": 1,
    "srcCssLines": 5511,
    "libFiles": 96,
    "libLines": 30671,
    "componentFiles": 75,
    "componentLines": 13942,
    "viewFiles": 6,
    "viewLines": 2865,
    "stateFiles": 5,
    "stateLines": 1272,
    "testFiles": 131,
    "testLines": 50754,
    "scriptFiles": 6,
    "publicFontWoff2": 24,
    "publicFontLicences": 10,
    "publicPdfFontFiles": 3,
    "publicIconFiles": 3,
    "storageKeys": 45,
    "fontFamilies": 12,
    "fontFiles": 24,
    "iconSets": 3,
    "glyphs": 43,
    "badges": 27,
    "trackerGroups": 7,
    "themeTokens": 14,
    "navIcons": 6
}
```

## 1. What this is, and the shape of the tree

| Path | What lives there |
| --- | --- |
| `src/` | the application — 169 `.ts`/`.tsx` files and one stylesheet |
| `tests/` | 123 files, 48 898 lines, run by `bun test` |
| `scripts/` | four one-shot vendoring/subsetting tools and one build step, none shipped |
| `public/` | bytes copied verbatim into `dist/`: fonts, icons, the service worker |
| `docs/` | audits and batch write-ups; never bundled |

- The journal record shape is one type: `src/types.ts:44` — `export type Entry = {`
- Settings are one type and one default object: `src/types.ts:209` — `export type Settings = {`
- The defaults are declared once: `src/types.ts:497` — `export const DEFAULT_SETTINGS: Settings = {`
- Everything persistent hangs off one envelope: `src/types.ts:536` — `export type AppData = {`
- The tabs are a union, not a route table: `src/types.ts:531` — `export type TabId = "today" | "tools" | "journal" | "insights" | "health" | "settings";`

## 2. Build, run, and the shipped shell

- Dev server host is fixed in config, not in a flag: `vite.config.ts:30` — `"0.0.0.0",`
- The port comes from the environment: `vite.config.ts:31` — `port: Number(process.env.PORT) || 3000,`
- One warning threshold, raised deliberately: `vite.config.ts:35` — `chunkSizeWarningLimit: 900,`
- HMR is off on this host and the config says so: `vite.config.ts:4` — `// NOTE: Freebuff requires HMR to stay disabled — do not add hmr settings here.`

- The mount point is the only element in `<body>`: `index.html:55` — `<div id="root"></div>`
- The script tag is the app, module-loaded: `index.html:56` — `<script type="module" src="/src/index.tsx"></script>`
- The icon is inline SVG data, not a request: `index.html:51` — `<link rel="icon" href="data:image/svg+xml,`

- The cache filter is a prefix allow-list: `public/sw.js:127` — `.filter((n) => n.startsWith("belso-iranytu-") && n !== CACHE)`

- The list is generated, never authored: `scripts/precache-manifest.mjs:52` — `export function shouldPrecache(path) {`
- It is injected between two markers that must appear exactly once: `public/sw.js:82` — `const PRECACHE = [];`
- The build runs it: `package.json:8` — `"build": "vite build && node scripts/precache-manifest.mjs",`

- The fill, and the guard that follows it: `public/sw.js:115` — `await cache.addAll(PRECACHE.map(under));`
- `skipWaiting` is inside the same `waitUntil`, after the fill: `public/sw.js:116` — `await self.skipWaiting();`

### The stuck worker: the address no cache can answer

The report this section closes: incognito shows the new app, the normal profile
keeps the old one, and the update button does not help. That is a service worker
from an earlier build in charge of the page — `reload()` re-requests the very url
its precache and the HTTP cache are keyed by, and a stored document can still be
fresh under the policy of the deploy that stored it.

- The reset, six steps in this order: `src/lib/pwa.ts:228` — `export async function forceAppUpdate(): Promise<boolean> {`
- Unregister first, so a live worker cannot rebuild what it just lost: `src/lib/pwa.ts:233` — `for (const registration of registrations) await registration.unregister();`
- Then every cache: `src/lib/pwa.ts:242` — `for (const name of names) await caches.delete(name);`
- The marker for the load that follows: `src/lib/pwa.ts:121` — `export function consumeForceReset(): boolean {`
- THE STEP THAT FIXES IT — a url nobody has ever requested, so neither the precache nor the HTTP cache can answer it from storage: `src/lib/pwa.ts:155` — `export function resetUrl(pathname: string, stamp: number): string {`
- Navigated, not reloaded, and `replace` so Back cannot return to the stuck page: `src/lib/pwa.ts:271` — `window.location.replace(resetUrl(window.location.pathname, Date.now()));`
- The stamp comes back out of the bar once the fresh document is up: `src/lib/pwa.ts:169` — `export function cleanResetParam(): void {`
- Called on mount, so no bookmark carries it: `src/App.tsx:137` — `cleanResetParam();`
- The detector: the controller's own `scriptURL` against this bundle's hash: `src/lib/pwa.ts:295` — `export function controllerIsStale(`
- A `waiting` worker is asked to take over, which is what ends the stuck state: `src/lib/pwa.ts:361` — `function askWaitingToSkip(registration: ServiceWorkerRegistration): void {`
- The worker side of that message, and the only verb it accepts: `public/sw.js:154` — `if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();`
- A swap the page asked for reloads at once; a deploy that arrives quietly keeps its deferral: `src/lib/pwa.ts:423` — `if (skipRequested) {`
- The banner that says the page is not the deploy, and offers the same six steps: `src/components/StaleWorkerNotice.tsx:37` — `export function StaleWorkerBanner({`
- Mounted in the shell, above the content: `src/App.tsx:356` — `<StaleWorkerNotice />`
- Both marker names are in the wipe, because the older button wrote the older key: `src/lib/storageKeys.ts:133` — `"belso-iranytu-force-reset",`
- The devtools route that always works, written for the reader: `docs/stuck-service-worker.md:1` — `# Beragadt service worker — a végső útmutató`

- The workflow needs history to work at all: `.github/workflows/ci.yml:55` — `fetch-depth: 0`
- The suite is the second gate, after typecheck: `.github/workflows/ci.yml:97` — `run: npm test`
- The production build is last, so a behavioural failure is reported first: `.github/workflows/ci.yml:102` — `run: npm run build`

### Two lockfiles, one tree

| Surface | Package manager | Lockfile | Commands |
|---|---|---|---|
| **Local development** | bun | `bun.lock` | `bun test`, `bun run dev`, `bun run build` |
| **CI and hosting** | npm | `package-lock.json` | `npm test`, `npm ci`, `npm run build` |

## 3. Bootstrap: the entry point, the providers, the shell

- The one stylesheet import: `src/index.tsx:4` — `import "./styles.css";`
- React is mounted in StrictMode: `src/index.tsx:9` — `ReactDOM.createRoot(rootElement).render(`

- The outermost provider holds the data: `src/App.tsx:368` — `<AppProvider>`
- The innermost is the icon set: `src/App.tsx:371` — `<IconSetProvider>`
- Theme reaches the document as an attribute: `src/App.tsx:265` — `data-theme={theme}`

- Tab state, typed by the union, seeded from the deep link: `src/App.tsx:112` — `const [tab, setTab] = useState<TabId>(() => consumeQuickStart() ?? "today")`
- The nav receives it and gives it back: `src/App.tsx:351` — `<BottomNav active={tab} onChange={setTab} />`
- Today is the first branch, not a default: `src/App.tsx:333` — `{tab === "today" && <TodayView />}`

## 4. The five views

| View | File | What it is |
| --- | --- | --- |
| Ma | `src/views/TodayView.tsx:52` — `export default function TodayView() {` | the entry form: mood, trackers, activities, goals, the week's reflection |
| Felfedezés | `src/views/ToolsView.tsx:183` — `export default function ToolsView() {` | the tools the day does not need, in four drawers — see `docs/tools-tab.md` |
| Egészség | `src/views/HealthView.tsx:172` — `export default function HealthView() {` | the body's records: food, workouts, vitals, habits and the check-ins, in three sections |
| Napló | `src/views/JournalView.tsx:25` — `export default function JournalView({ onGoToday }` | calendar, real streak, search, entry edit and delete |
| Elemzés | `src/views/InsightsView.tsx:61` — `export default function InsightsView({ onGoToday }` | correlations, lag analysis, exports, monthly/yearly stats, achievements, pattern insights |
| Beállítások | `src/views/SettingsView.tsx:233` — `export default function SettingsView({` | every preference, the data section, and the two integrations |

- `src/components/CorrelationGrid.tsx:20` — `export default function CorrelationGrid() {`
- `src/components/LagAnalysisCard.tsx:12` — `export default function LagAnalysisCard() {`
- `src/components/ReportExport.tsx:35` — `export default function ReportExport() {`
- `src/components/MonthlyYearlyStats.tsx:29` — `export default function MonthlyYearlyStats() {`
- `src/components/AchievementsCard.tsx:25` — `export default function AchievementsCard() {`

- The last of the five, in the view's own JSX: `src/views/InsightsView.tsx:327` — `<CorrelationGrid />`

## 5. State and persistence

| Context | Provider | Hook | Owns |
| --- | --- | --- | --- |
| data | `src/state/AppContext.tsx:43` — `export function AppProvider(` | `src/state/AppContext.tsx:87` — `export function useApp()` | entries, settings, profile, toasts |
| theme | `src/state/ThemeContext.tsx:27` — `export function ThemeProvider(` | `src/state/ThemeContext.tsx:85` — `export function useTheme()` | theme name, resolved tokens, `auto` subscription |
| fonts | `src/state/FontContext.tsx:89` — `export function FontProvider(` | `src/state/FontContext.tsx:236` — `export function useFont()` | typeface, handwriting face, preload state |
| icons | `src/state/IconSetContext.tsx:62` — `export function IconSetProvider(` | `src/state/IconSetContext.tsx:110` — `export function useIconSet()` | icon set, glyph and inline artwork |

- `src/state/AppContext.tsx:94` — `export function useTodayEntry()`

### Every storage key, and who writes it

| Name | What it actually is | Anchor |
| --- | --- | --- |
| `belso-iranytu-mentes` | the **file name** prefix of an exported backup | `src/lib/backupStorage.ts:69` — `export const BACKUP_FILE_PREFIX = "belso-iranytu-mentes";` |
| `belso-iranytu-backup` | the IndexedDB **database** name | `src/lib/backupStorage.ts:427` — `const IDB_NAME = "belso-iranytu-backup";` |
| `belso-iranytu-mood-v2-done` | **written nowhere** — it exists only inside a comment | `src/lib/migration/mood-v2.ts:18` — `flag is one more thing that can disagree` |

| Key | Owner | Role |
| --- | --- | --- |
| `belso-iranytu-data-v2` | `src/lib/store.ts:30` — `const KEY = "belso-iranytu-data-v2";` | the journal: entries, settings, profile, goals, medications |
| `belso-iranytu:cardStates` | `src/lib/cardStates.ts:32` — `export const CARD_STATES_KEY = "belso-iranytu:cardStates";` | which collapsible cards the user left open |
| `belso-iranytu-attachments` | `src/lib/attachments.ts:17` — `const KEY = "belso-iranytu-attachments";` | photo, audio and video blobs |
| `belso-iranytu-background` | `src/lib/imageBackground.ts:70` — `const KEY = "belso-iranytu-background";` | the one backdrop, with its own 8 MB cap |
| `belso-iranytu-custom-trackers` | `src/lib/customTrackers.ts:24` — `const KEY = "belso-iranytu-custom-trackers";` | user-defined trackers |
| `belso-iranytu-custom-activities` | `src/lib/customActivities.ts:17` — `const KEY = "belso-iranytu-custom-activities";` | user-defined activities |
| `belso-iranytu-assessments-v1` | `src/lib/assessmentStore.ts:25` — `const KEY = "belso-iranytu-assessments-v1";` | self-assessment results |
| `belso-iranytu-experiments-v1` | `src/lib/experiments.ts:64` — `const KEY = "belso-iranytu-experiments-v1";` | self-experiments: the reader's own hypothesis and its three-day verdict |
| `belso-iranytu-feature-flags-v1` | `src/lib/featureFlags.ts:45` — `const KEY = "belso-iranytu-feature-flags-v1";` | "has done this at least once", for the three actions that leave no record |
| `belso-iranytu-habits-v1` | `src/lib/habits.ts:30` — `const KEY = "belso-iranytu-habits-v1";` | habit streaks |
| `belso-iranytu-gratitude` | `src/lib/gratitude.ts:20` — `const KEY = "belso-iranytu-gratitude";` | gratitude entries |
| `belso-iranytu-cbt-records` | `src/lib/cbt.ts:30` — `const KEY = "belso-iranytu-cbt-records";` | thought records |
| `belso-iranytu-app-lock` | `src/lib/appLock.ts:19` — `export const LOCK_KEY = "belso-iranytu-app-lock";` | the PIN, as a hash |
| `belso-iranytu-app-lock-session` | `src/lib/appLock.ts:20` — `const SESSION_KEY = "belso-iranytu-app-lock-session";` | unlock state for this session |
| `belso-iranytu-onboarding` | `src/lib/onboarding.ts:19` — `const KEY = "belso-iranytu-onboarding";` | which onboarding steps are done |
| `belso-iranytu-achievements-seen` | `src/lib/achievements.ts:195` — `const SEEN_KEY = "belso-iranytu-achievements-seen";` | badges already announced |
| `belso-iranytu-med-reminders-fired` | `src/lib/medReminders.ts:25` — `export const FIRED_KEY = "belso-iranytu-med-reminders-fired";` | doses already notified today |
| `belso-iranytu-reminder-last` | `src/lib/reminderDaemon.ts:15` — `const LAST_KEY = "belso-iranytu-reminder-last";` | the daily nudge's last fire time |
| `belso-iranytu-reminder-message` | `src/lib/notifications.ts:138` — `const MESSAGE_KEY = "belso-iranytu-reminder-message";` | which reminder wording is in use |
| `belso-iranytu-install-banner-dismissed` | `src/components/InstallPrompt.tsx:8` — `const BANNER_KEY = "belso-iranytu-install-banner-dismissed";` | do not show the install banner again |
| `belso-iranytu:openai-key` | `src/lib/foodAi.ts:36` — `const STORAGE_KEY = "belso-iranytu:openai-key";` | an optional user-supplied key, stored locally only |
| `belso-iranytu-seen-lessons` | `src/lib/micro-lessons.ts:196` — `const SEEN_LESSONS_KEY = "belso-iranytu-seen-lessons";` | the micro-lessons the user has already been offered (Batch B) |
| `belso-iranytu-backup-state` | `src/lib/backup.ts:86` — `export const BACKUP_STATE_KEY = "belso-iranytu-backup-state";` | what this device knows about its own encrypted backup — nothing secret |
| `belso-iranytu-education-read` | `src/lib/education.ts:224` — `const READ_KEY = "belso-iranytu-education-read";` | which of the fifteen articles have been opened |
| `belso-iranytu-emotion-vocab` | `src/lib/store.ts:82` — `"belso-iranytu-emotion-vocab",` | the reader's own emotion words, persisted by `saveCustomEmotions` |
| `belso-iranytu-locale` | `src/lib/i18n.ts:74` — `const LOCALE_STORAGE_KEY = "belso-iranytu-locale";` | the chosen language, mirrored for the modules that read it at import — see §6 |
| `belso-iranytu-nutrition-log-v1` | `src/lib/nutrition.ts:330` — `const KEY = "belso-iranytu-nutrition-log-v1";` | what the reader ate, by day and by meal (Batch 15) |
| `belso-iranytu-custom-foods-v1` | `src/lib/customFoods.ts:30` — `const KEY = "belso-iranytu-custom-foods-v1";` | the reader's own food names, offered back by the meal log's search box (Batch 15) |
| `belso-iranytu-fitness-v1` | `src/lib/fitness.ts:437` — `const KEY = "belso-iranytu-fitness-v1";` | the workout plans the reader owns and the log of what they did (Batch 15) |
| `belso-iranytu-weekly-answers` | `src/lib/weeklyReflection.ts:459` — `const ANSWER_KEY = "belso-iranytu-weekly-answers";` | the weekly reflection's answer mirror |
| `belso-iranytu-weekly-skip` | `src/lib/weeklyReflection.ts:416` — `const SKIP_KEY = "belso-iranytu-weekly-skip";` | which weeks were skipped rather than answered |
| `belso-iranytu-data` | `src/lib/store.ts:454` — `const legacy = localStorage.getItem("belso-iranytu-data");` | v1 journal, read-only, migrated on load |
| `belso-iranytu-profile` | `src/lib/store.ts:473` — `const legacyProfile = localStorage.getItem("belso-iranytu-profile");` | v1 profile, read-only |

- The read: `src/lib/store.ts:547` — `export function getState(): AppData {`
- The one write path for a day: `src/lib/store.ts:594` — `export function saveEntry(input: Partial<Entry> & { date: string }): Entry {`
- Settings are replaced wholesale: `src/lib/store.ts:669` — `export function setSettings(settings: Settings) {`

- `src/lib/store.ts:156` — `const retiredFont =`

### The encrypted backup: scope, keys, and the way back

- `src/lib/backup.ts:97` — `export const BACKUP_INCLUDED_KEYS = [`
- `src/lib/backup.ts:127` — `export const BACKUP_EXCLUDED_KEYS = [`

- `src/lib/backupKey.ts:51` — `export const PASSKEY_INFO = "iranytu-backup/passkey/v1";`
- `src/lib/backupKey.ts:52` — `export const PASSWORD_INFO = "iranytu-backup/password/v1";`
- `src/lib/backupKey.ts:53` — `export const RECOVERY_INFO = "iranytu-backup/recovery/v1";`

- `src/lib/backupDaemon.ts:51` — `export const BACKUP_DEBOUNCE_MS = 5 * 60_000;`
- `src/lib/backupDaemon.ts:54` — `export const BACKUP_INTERVAL_MS = 24 * 60 * 60_000;`
- `src/lib/backupDaemon.ts:104` — `export function shouldBackupNow(check: BackupCheck): BackupDecision {`

## 6. The domain library

### Data and storage

| Module | Lines | Owns |
| --- | --- | --- |
| `store.ts` | 661 | the journal envelope, v1 migration, settings normalisation |
| `cardStates.ts` | 126 | which collapsible cards are open, and tracker summaries |
| `attachments.ts` | 162 | blob storage and quota-safe deletion |
| `imageBackground.ts` | 786 | the custom background layer: its own key, the scrim, the blur, the tint |
| `assessmentStore.ts` | 221 | self-assessment persistence |
| `assessments.ts` | 362 | the questionnaire itself, and — since commit 6 — the single source of every crisis number |
| `experiments.ts` | 314 | self-experiments: a computed three-day window and a one-at-a-time guard (Batch 13, commit 7) |
| `customTrackers.ts` | 154 | user-defined trackers |
| `customActivities.ts` | 101 | user-defined activities |
| `customFoods.ts` | 139 | the reader's own food names, remembered for the meal log's search box |
| `gratitude.ts` | 118 | gratitude entries |
| `cbt.ts` | 137 | thought records |
| `habits.ts` | 160 | habit streaks |
| `micro-lessons.ts` | 237 | the post-recording micro-lessons, their rotation and seen-flags (Batch B) |
| `appLock.ts` | 274 | the PIN gate |
| `onboarding.ts` | 86 | first-run progress |
| `reminderDaemon.ts` | 60 | when the daily nudge fires |
| `notifications.ts` | 136 | permission, wording, scheduling |
| `medReminders.ts` | 197 | next dose calculation |
| `pwa.ts` | 87 | service-worker registration |
| `backup.ts` | 378 | the orchestration: prepare, save, restore — and the refusal that replaces a throw |
| `backupCrypto.ts` | 318 | real HKDF and PBKDF2, and the work factor a passphrase cannot be brute-forced silently through |
| `backupKey.ts` | 354 | the three ways in — passphrase, passkey, twelve recovery words — each deriving a different key |
| `backupStorage.ts` | 678 | the File System Access surface and the IndexedDB handle, with the pinned read allow-list |
| `backupWordlist.ts` | 187 | 1 024 Hungarian words, ten bits per word |
| `backupDaemon.ts` | 204 | the scheduler that asks and cannot act: the gate, both boundaries, the fold, the latch |

### Analysis

| Module | Lines | Owns |
| --- | --- | --- |
| `analysis.ts` | 171 | streaks, weekly summaries, tag correlations |
| `achievements.ts` | 230 | the 24 badge definitions and their rules, plus the seen flags |
| `featureUse.ts` | 120 | the feature-use sidecar: one total, uniform count map for badge rules |
| `featureFlags.ts` | 137 | remembered first-use flags for the three features that leave no residue |
| `correlationGrid.ts` | 199 | the activity × outcome matrix |
| `lagAnalysis.ts` | 83 | effects that appear one or two days late |
| `statsAgg.ts` | 102 | month and year aggregation |
| `yearInPixels.ts` | 88 | the year grid |
| `mood.ts` | 79 | the five-level scale and its 0–100 score |
| `quadrant.ts` | 37 | a façade, not an owner: it re-exports the four quadrants and the coordinate rule so no component imports from a migration module to paint a colour |
| `dates.ts` | 82 | local-date helpers, and no UTC drift |

### Content

| Module | Lines | Owns |
| --- | --- | --- |
| `trackers.ts` | 510 | the tracker registry: 13 definitions in 7 groups |
| `trackerDisplay.ts` | 264 | one place that turns a stored value into words |
| `nutritionTips.ts` | 238 | the sentences the journal may produce, and the safety wording |
| `sportTips.ts` | 203 | the same for movement entries |
| `voice.ts` | 166 | speech-to-text, with an offline parser and an optional LLM path |
| `foodAi.ts` | 266 | the optional photo-analysis path |
| `csv.ts` | 290 | CSV and JSON import and export |
| `reportPdf.ts` | 367 | the therapist PDF, behind a dynamic import |
| `weather.ts` | 447 | the optional weather integration |
| `healthImport/` | 782 | Apple Health and Google Fit parsers, and the merge |
| `education.ts` | 281 | the fifteen articles, their grouping and the read markers |
| `weeklyReflection.ts` | 501 | the weekly prompt registry, ISO week maths, and the answer/skip stores |
| `patternInsights.ts` | 294 | the four insight engines — activity, sleep, stress, weekday — and their wording rule |
| `quadrantCorrelations.ts` | 122 | emotion × context and quadrant × sleep, both behind a sample guard |
| `contextOptions.ts` | 77 | the pinned context dimensions and their labels |
| `emotion-vocab.ts` | 117 | the emotion vocabulary the reader can extend |
| `gad7.ts` | 187 | the seven-question check-in, its four descriptive bands, and the arithmetic that maps one to the other (Batch 14) |
| `articleBlocklist.ts` | 76 | the non-clinical rule, and the therapeutic-claim rule, in one place |
| `tegezoRule.ts` | 59 | the register rule: no formal address in anything a reader sees |

### Platform and appearance

| Module | Lines | Owns |
| --- | --- | --- |
| `themes.ts` | 567 | fourteen presets — nine flat, five carrying a CSS page backdrop — the fourteen colour tokens each, the derived document properties, and custom themes |
| `fonts.ts` | 877 | the typeface registry: 12 families, 24 files |
| `font-cmap.ts` | 438 | reading a font's real character map out of its `cmap` |
| `font-preload.ts` | 157 | warming a face before it is needed |
| `fonts-runtime.ts` | 187 | the `@font-face` declarations |
| `iconsets.ts` | 498 | three icon sets and 43 glyphs |
| `icons.tsx` | — | the hand-drawn control icons |
| `icon-policy.ts` | 202 | which controls stay line-art under every set |
| `nav-icons.ts` | 141 | the four tab icons |
| `navVisibility.ts` | 189 | the scroll rule for hiding the bottom bar |
| `sectionOrder.ts` | 121 | the same normalisation rule for a tab's own sections: the bar's order, applied to cards |
| `navAutoHide.ts` | 123 | the hook around that rule |
| `media.ts` | 120 | one spelling of `matchMedia`, and its subscription |
| `breathing.ts` | 171 | the four paced breathing patterns and the pure phase/cycle engine |
| `meditations.ts` | 235 | ten text-only practices, and the seam that adapts one to the phase engine |
| `i18n.ts` | 4691 | the translation framework: the Hungarian source catalogue, complete `en`/`de`, and the coverage measurement |
| `download.ts` | 11 | one helper that starts a file download |
| `customTheme.ts` | 69 | the custom-theme editor's state |
| `pdfFonts.ts` | 217 | the PDF's own subsetted typeface |

- `src/lib/trackers.ts:287` — `export function trackerGroupHeads(): TrackerDef[] {`
- `src/lib/cardStates.ts:137` — `export function trackerGroupSummary(`

- `src/lib/font-cmap.ts:371` — `export function woff2Codepoints(file: Uint8Array): CmapResult {`

- `src/lib/gad7.ts:55` — `export const INSTRUCTION = "Az elmúlt 2 hétben mennyire voltak jellemzőek rád az alábbiak?";`
- `src/lib/gad7.ts:174` — `export function bandFor(total: number): Band {`

## 7. The component library

| Primitive | Line | Note |
| --- | --- | --- |
| `Card` | `src/components/ui/ui.tsx:19` — `export function Card({` | the plain card |
| `SectionTitle` | `src/components/ui/ui.tsx:52` — `export function SectionTitle({` | screen heading |
| `Pill` | `src/components/ui/ui.tsx:76` — `export function Pill({` | small labelled chip |
| `Slider` | `src/components/ui/ui.tsx:102` — `export function Slider({` | the touch slider |
| `Toggle` | `src/components/ui/ui.tsx:154` — `export function Toggle({` | the switch, with its label row |
| `EmptyState` | `src/components/ui/ui.tsx:184` — `export function EmptyState({` | the honest "nothing yet" block |
| `Toasts` | `src/components/ui/ui.tsx:215` — `export function Toasts({` | the notification stack |
| `ConfirmDialog` | `src/components/ui/ui.tsx:241` — `export function ConfirmDialog({` | used before anything destructive |
| `Collapsible` | `src/components/ui/ui.tsx:304` — `export function Collapsible({` | session-local, closed by default |
| `CollapsibleCard` | `src/components/ui/ui.tsx:392` — `export function CollapsibleCard({` | collapsible, and it REMEMBERS |
| `Segmented` | `src/components/ui/ui.tsx:499` — `export function Segmented<T extends string>({` | the radio-as-buttons control |
| `TextInput` | `src/components/ui/ui.tsx:536` — `export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {` | the one text field |

### The four collapsible generations

| Generation | Cards | Storage | Collapsed by default |
| --- | --- | --- | --- |
| tracker groups | 7 | `belso-iranytu:cardStates` | yes |
| feature cards | 3 | same key | yes |
| Beállítások rows | 13 | same key | yes |
| Elemzés cards | 5 | same key | yes |

- The lazy, memoised read: `src/lib/cardStates.ts:57` — `export function loadCardStates(): CardStateMap {`
- The write-through that follows a click: `src/lib/cardStates.ts:71` — `export function setCardCollapsed(id: string, collapsed: boolean): CardStateMap {`
- The line a collapsed group shows: `src/lib/cardStates.ts:126` — `export const NO_DATA_SUMMARY = t("cardStates.noData");` (the sentence itself has been the catalogue's `cardStates.noData` since round 18)

- The id is the storage key, the aria key, and the `?quick=` scroll anchor — it lands on the section itself, so `scrollToQuickAnchor` can find it: `src/components/ui/ui.tsx:403` — `Storage, aria AND scroll-anchor key: the id lands on the section itself,`

### The help surface

- The full card, `src/components/CrisisCard.tsx:99` — `export default function CrisisCard() {`. Everything in `RESOURCES`, web resources included, plus the disclaimer.
- The strip, `src/components/CrisisCard.tsx:67` — `export function CrisisStrip() {`. The four dialled numbers and the disclaimer, for surfaces that already have something on screen. It drops the web resources deliberately: a strip read in one glance has no room for a link that needs a browser, and calling it one tap away would be a lie.

| # | Mount | Renders when |
| --- | --- | --- |
| 1 | `src/views/SettingsView.tsx:866` — `<CrisisCard />` | always, above even the profile card |
| 2 | `src/components/AssessmentResult.tsx:84` — `{needsSupport && <CrisisStrip />}` | only when the run needs support, hoisted above the score |
| 3 | `src/components/AssessmentConsent.tsx:45` — `<CrisisCard />` | whenever the consent dialog is open |
| 4 | `src/components/EntryDetail.tsx:236` — `<CrisisStrip />` | on every open entry, outside the editing ternary |

### One breathing tool, with a quick mode

| | Before | After |
| --- | --- | --- |
| presets | 4-7-8, box 4-4-4-4, 5-5 | the same three **plus** a real 4-4-4 preset |
| cards | two | one, with a quick-mode toggle |

### The three ring aliases, finally read

| Site | Was | Now |
| --- | --- | --- |
| `BalanceRing.tsx` | a ternary of literal hexes | a tone class |
| `InsightsView.tsx` × 3 series | a frozen copy of the light palette | `currentColor` |
| `InsightsView.tsx` grid + tooltip | a near-miss hex for `--line` | `var(--line)` |

### Why `currentColor` and not `var()`

### The default that was missing too

### The feature-use sidecar

- The keys: `src/lib/featureUse.ts:61` — `export const FEATURE_KEYS: readonly FeatureKey[] = [`
- The builder: `src/lib/featureUse.ts:88` — `export function buildFeatureUse(raw: FeatureUseInput | null | undefined): FeatureUse {`

### The three that leave no residue

- `entry.source` is `"import"` for a **health import, a CSV import and the v1
- a **food-AI** analysis writes tracker values indistinguishable from any other
- a **PDF export** writes a file and nothing else.

| Marked at | Not marked at |
| --- | --- |
| `HealthImportCard.tsx` — when a preview is applied | when a file is merely parsed |
| `FoodPhotoCapture.tsx` — when the estimate reaches the journal | when the analysis came back |
| `ReportExport.tsx` — when the export resolves | when the button is pressed |

### The badge shelf, fifteen more

### Self-experiments

- **The window is computed, never supplied.** `src/lib/experiments.ts:219` — `export function startExperiment(input: {`. There is no `endDate` parameter a caller could widen, and no extend action, which is why `tests/lib/experiments.test.ts` asserts `startExperiment.length === 1` as well as checking the dates.
- **At most one at a time.** `startExperiment` returns `null` and writes nothing while another is live. The card does not merely disable its form — it does not render one, because a card that visibly offers something the store will refuse is worse than one that does not mention it.

### Ten guided practices, on the engine that was already there

### The seven-question check-in

- **The result cannot render without help.** `DisclaimerBlock` and
- **The scale and the ceiling are imported, not retyped.** Four options from
- **The instrument is named exactly once.** `gad7.provenance` is the only

### Staged i18n: the framework, and the surfaces it is landing on

**Round 18 closed the `.ts` walk.** `docs/i18n-sweep-list.md`'s second measurement
classifies every `.ts` module a reader sees copy from, and it had named thirteen
as owing a round. Twelve were copy and became eighty-one keys across
`lib/imageBackground.ts`, `lib/voice.ts`, `lib/reportPdf.ts`, `lib/dates.ts`,
`lib/yearInPixels.ts`, `lib/correlationGrid.ts`, `lib/attachments.ts`,
`lib/analysis.ts`, `lib/appLock.ts`, `lib/backupDaemon.ts`,
`lib/backupStorage.ts` and `lib/cardStates.ts`; two of the eighty-one are not new
keys at all, because the lock's two PIN refusals are the settings card's own
(`settings.pin.lengthError`, `settings.pin.weakError`). The thirteenth,
`lib/csv.ts`, turned out to be the `ids` family: its six Hungarian strings are
the CSV importer's header aliases, a lookup matches a file's columns on them, and
translating one would stop a CSV the app itself exported from being read back.
So it moved family with no byte changed, and `chrome — a round is owed` is gone
from the document rather than left as a heading with nothing under it.

- The lock's two shared refusals, asserted at the call site: `tests/i18n-round18.test.ts:225` — `describe("round 18 — the key set is closed in both directions", () => {`
- The wrapper that folds a catalogue value at the PDF seam: `src/lib/reportPdf.ts:360` — `const footerNote = t("report.footer");`

| Step | Result | Why it exists |
| --- | --- | --- |
| the requested locale | its own string | the normal path |
| Hungarian | the untranslated original | a partial catalogue must never render a blank |
| the key itself | `meditation.nope` | an unknown key must be visibly broken, not invisible |

- **Rendered but not owned.** `SAFETY_NOTE` and `REST_NUDGE` are the words of
- **Registries, not copy.** The tracker group labels, the tab names, the theme
- **The ten child components** the page mounts. Each owns its own copy and

- **No value starts or ends with a space.** Three shipped strings were fragments
- **Placeholders, not concatenation.** `{n}. {name} előre` rather than
- **No key is dead.** A test scans `src/` for a call site per key, so a key that
- **No view keeps a copy of its own.** The other direction, and the one that

- **A string with one reader belongs to the surface, not the module.** The backup

- The note that says why the four ids stayed Hungarian: `src/lib/i18n.ts:953` — `// resolved at the display site, so the id stays Hungarian and stable while`

- The two retired families' announcement: `src/lib/fonts.ts:290` — `export const RETIRED_FONT_REASONS: Readonly<Record<string, string>> = {`
- The key one of them reads: `src/lib/i18n.ts:1059` — `"font.retiredReason.manrope": "még mindig megtalálható a Google betűtípusai között",`

- `tests/icon-policy-i18n.test.ts:45` — `describe("round 15 — every iconPolicy key is used, and nothing used is missing", () => {`
- `tests/fonts-i18n.test.ts:70` — `describe("round 16 — the key set is closed in both directions", () => {`

- The flag on the rule: `src/lib/articleBlocklist.ts:43` — `export const CLINICAL_VOCABULARY = /diagnózis|beteg|gyógyszer|kezelés|tünet/i;`
- The allowance's seven medication entries: `tests/lib/i18n.test.ts:88` — `const FEATURE_NAME_ALLOWANCE: Readonly<Record<string, string>> = {`

- `src/components/WorkoutPrograms.tsx:44` — `WHY THE PROGRAMS STAY BELOW INSTEAD OF MOVING TO `lib/i18n.ts`` — the six programs are editorial content, the same kind of thing `lib/mood`'s labels are.
- `src/components/ExperimentCard.tsx:125` — `in this file, and on purpose. They are written into `verdict.note` and` — the two verdict notes are persisted and never read back, so translating them would let a language switch rewrite a reader's own history.

#### Coverage is measured, so "ready for English and German" is not a claim

Both are **complete as of round 20**: 1 137 keys each, `missingKeys` empty in
both directions, and `COMPLETE_LOCALES` in `tests/lib/i18n.test.ts` names them
rather than inferring it. What follows is the measurement that made the staged
landing safe while they were partial, and that a third language would use again.

| Function | Returns | For |
| --- | --- | --- |
| `missingKeys(locale)` | `TranslationKey[]` | the work queue, in catalogue order |
| `translatedKeys(locale)` | `TranslationKey[]` | what it has |
| `localeCoverage(locale)` | `{ translated, total, complete }` | progress as integers |
| `hasTranslation(locale, key)` | `boolean` | one key, without a lookup-then-check |

##### How to add a language

The procedure, in the order the guards will hold you to it. It is five edits and
no new machinery, which is the point of the framework rather than a claim about
it:

1. **Register the code.** Add it to `SUPPORTED_LOCALES` and give it a tag in
   `LOCALE_TAGS` (`lib/i18n.ts`). Both are typed by the `Locale` union, so a
   half-registration is a compile error rather than a language nobody can
   select.
2. **Add an empty catalogue.** `MESSAGES` is `Record<Locale, Catalogue>`, so
   the new locale needs its own entry, and it may be empty: the per-key fallback
   to Hungarian is what makes a partial catalogue safe, and it is also why the
   catalogue can land in pieces across rounds. This is how `en` and `de` landed —
   three keys and two keys against 1 137 — and both are now complete; the
   fallback is still the reason the NEXT language can start from nothing.
3. **Add the autonym.** One key, `language.<code>`, whose value is the
   language's OWN name for itself — `Deutsch`, not `Német` — and it belongs in
   every catalogue. The picker needs no edit: `LOCALES` is
   `SUPPORTED_LOCALES.map(…)` and `LOCALE_LABEL` is total over `Locale`, so a
   missing name does not compile.
4. **Translate, with `missingKeys(locale)` as the queue.** It returns the keys
   still owed in catalogue order; `localeCoverage(locale)` is the same fact as
   two integers, and `translatedKeys` is what a review reads. No screen has to
   be opened to find out what is left.
5. **Move the locale into `COMPLETE_LOCALES`** in `tests/lib/i18n.test.ts` when
   the queue is empty. The list is named rather than derived on purpose: "this
   language is done" is a decision a reviewer watches change, and while a locale
   is not on it the test insists the catalogue stays visibly partial instead of
   looking finished.
5. **Run the guards.** `tests/lib/i18n.test.ts` checks the key set in both
   directions and that no key is dead; `tests/fonts-i18n.test.ts` and
   `tests/icon-policy-i18n.test.ts` hold the registries to the catalogue; and
   `tests/i18n-round19.test.ts` holds the registry closed, the `hu-HU` tag
   minted once, and `navigator.language` unread.

One thing this cannot promise: that a shipped typeface can spell the new
language. The character-map checks in `tests/batch7i-ui-fonts.test.ts` were
written for Hungarian (`ő`, `ű`), and a language with letters no face carries is
a font problem that shows up there, not an i18n problem.

- The registry the first four steps edit: `src/lib/i18n.ts:55` — `export const SUPPORTED_LOCALES = ["hu", "en", "de"] as const;`
- The picker that needs no edit for a fourth language: `src/views/SettingsView.tsx:156` — `const LOCALES: readonly { value: Locale; label: string }[] = SUPPORTED_LOCALES.map((code) => ({`

### The backup card, and why it is deliberately not collapsible

### What the bundle is actually made of

| Contributor | kB | Share | Used by |
| --- | --- | --- | --- |
| `iconsets/fluent-artwork.ts` | 548.6 | 39.0% | the icon registry |
| the charting family (recharts + d3 + lodash + friends) | 373.7 | 26.6% | **`InsightsView` only** |
| react-dom + react + scheduler | 137.9 | 9.8% | the app |
| everything else, ~120 files | ~271 | 19.3% | — |

- Splitting the **artwork** (549 kB) out of the main chunk is still blocked on
- The toast-driven context re-render needs a measurement story first. This
- jsPDF, html2canvas, canvg and purify are **already** split, via

### The precache made the Insights split safe, and it is now done

| | before | after |
| --- | --- | --- |
| entry chunk | 1432.45 kB / 353.86 kB gzip | **1010.97 kB / 235.03 kB gzip** |
| `InsightsView` chunk | — | **421.80 kB / 119.12 kB gzip** |
| precache entries | 37 | **38** |

- The lazy binding, at module scope: `src/App.tsx:73` — `const InsightsView = lazy(() => import("./views/InsightsView"));`
- The mount, inside both boundaries: `src/App.tsx:337` — `{tab === "insights" && (`
- The two placeholder states: `src/styles.css:3210` — `.view-loading,`

And the same worker had to learn to say no to Phase 4's AI runtime. The WebLLM
runtime is ~6 MB, it serves a feature that is off by default, and its model —
335 MB, fetched on a button press — is never precached, so the runtime alone
would be useless offline. Precaching it would have spent every reader's
install bandwidth, including the readers who never turn AI on. The install is
now 39 entries / 3.28 MB, of which the AI runtime is exactly none (it was 40
entries / 9.42 MB before this rule).

- The exclusion, applied before the positive `/assets/` rule that would otherwise sweep the chunk in: `scripts/precache-manifest.mjs:85` — `if (path.startsWith(AI_RUNTIME_PREFIX)) return false;`
- The chunk name that rule reads — the only reason it can be a name and not a byte-sniff: `vite.config.ts:38` — `manualChunks(id: string) {`
- The backstop that fails the build if that name ever stops matching: `scripts/precache-manifest.mjs:207` — `export function verifyPrecacheSizes(list, distDir, maxBytes = MAX_PRECACHE_BYTES) {`

### The artwork split, and what it cost to do honestly

| | before | after |
| --- | --- | --- |
| entry chunk | 1010.97 kB / 235.03 kB gzip | **449.49 kB / 145.74 kB gzip** |
| `fluent-artwork` chunk | — | **561.83 kB / 88.28 kB gzip** |
| precache entries | 38 | **39** |

- The loader: `src/lib/iconsets.ts:86` — `export function loadFluentArtwork(): Promise<void> {`
- The sync accessor: `src/lib/iconsets.ts:102` — `export function fluentArtworkSync(stem: string | undefined): string | undefined {`
- The hook every consumer calls: `src/state/IconSetContext.tsx:130` — `export function useWarmFluentArtwork(): void {`

### The accessibility audit, and what it could not settle

- `onChange={(e) => …}` contains a `>`, so a `[^>]*` attribute match stopped at
- Comments here quote markup, so counting `<label` raw made a wrapped control
- `accept="image/*"` contains `/*`, so the block-comment stripper swallowed

- `--accent` is **never text** in this stylesheet. It appears as borders,
- The toast pairings are **not** `surface` on a fill. `.toast-ok` and

| Toast pair (needs 4.5) | light | dark | warm | vibrant |
| --- | --- | --- | --- | --- |
| `--on-brand` on `--brand` | 7.91 | 7.75 | 5.00 | 6.12 |
| `--on-danger` on `--danger` | 5.51 | 5.75 | 4.90 | 4.62 |
| `--on-ok` on `--ok` | 5.03 | 8.63 | **3.83** | **3.12** |
| `--on-accent` on `--accent` | **3.19** | 8.20 | **2.65** | **4.02** |

- **`--ok` as text** — `.pattern-conf[data-level="strong"]` and `.edu-read`:

| Control border (needs 3:1) | light | dark | warm | vibrant |
| --- | --- | --- | --- | --- |
| worst ground | **3.93** | **6.77** | **3.84** | **4.52** |

## 8. Design system

### Themes

- The presets: `src/lib/themes.ts:62` — `export const THEMES: Record<`
- Which preset applies, `auto` included: `src/lib/themes.ts:371` — `export function resolveTheme(`
- The one writer: `src/lib/themes.ts:456` — `export function applyThemeTokens(`
- Light or dark, decided from the background: `src/lib/themes.ts:413` — `export function isLight(hex: string): boolean {`

- `src/lib/themes.ts:538` — `root.style.setProperty("color-scheme", isLight(tokens.bg) ? "light" : "dark");`

### Typefaces

- The UI registry: `src/lib/fonts.ts:357` — `export const FONTS: FontDef[] = [`
- The handwriting registry, separate by construction: `src/lib/fonts.ts:645` — `export const HAND_FONTS: HandFontDef[] = [`
- Withdrawn families and their successors: `src/lib/fonts.ts:280` — `export const RETIRED_FONTS: readonly string[] = ["manrope", "plus-jakarta-sans"];`
- Where the app asks for them: `src/lib/fonts.ts:719` — `export const FONT_BASE = fontBase(deploymentBase());`

- The two characters that decide it: `src/lib/font-cmap.ts:75` — `export const HUNGARIAN_DIACRITIC_CODEPOINTS: readonly number[] = [0x151, 0x171];`

### Icon sets

- The three sets: `src/lib/iconsets.ts:299` — `export const ICON_SETS: readonly IconSetDef[] = [`
- What a user who never chose gets: `src/lib/iconsets.ts:345` — `export const DEFAULT_ICON_SET: IconSetId = "lucide";`
- A withdrawn set and its successor: `src/lib/iconsets.ts:41` — `export const RETIRED_ICON_SETS: readonly string[] = ["twemoji"];`
- The glyph table: `src/lib/iconsets.ts:206` — `export const GLYPHS: readonly GlyphDef[] = [`
- Which controls are exempt: `src/lib/icon-policy.ts:1` — `/**`

### The background image

- The scrim's bounds, as two constants and one clamp: `src/lib/imageBackground.ts:95` — `export function clampScrim(value: unknown): number {`
- The save path, over the shared image pipeline: `src/lib/imageBackground.ts:867` — `export async function pickBackgroundImage(file: File): Promise<string> {`
- The blur as a fraction, and the pixel length it becomes: `src/lib/imageBackground.ts:164` — `export function blurPx(value: unknown): string {`
- The tint and the theme's half of the decision, as one pure function: `src/lib/imageBackground.ts:783` — `export function deriveScrimRgb(tint: unknown, lightBackground: boolean): string {`
- The fit, repaired the same way the palette is: `src/lib/imageBackground.ts:248` — `export function normalizeFit(value: unknown): BackgroundFit {`
- The range measurement the cap was built from, now the guard's instrument: `src/lib/imageBackground.ts:668` — `export function maxCardTransparency(opts: {`
- The reset that takes no id, because an id can be wrong: `src/lib/imageBackground.ts:922` — `export function resetBackgroundImage(): void {`
- The control itself: `src/components/BackgroundImagePicker.tsx:176` — `export default function BackgroundImagePicker({`
- The layer on the app root: `src/styles.css:972` — `.app.has-bg {`
- The first property the root carries inline: `src/App.tsx:281` — `"--app-bg-image": `url("${background}")`,`

- The veil, exactly the reader's own number — the identity the floor builds on: `src/lib/imageBackground.ts:338` — `export function effectiveScrimAlpha(baseScrim: unknown): number {`
- The veil the app paints: that number, floored by half the card transparency: `src/lib/imageBackground.ts:368` — `export function effectiveVeil(baseScrim: unknown, cardTransparency: unknown): number {`
- The composite it measures, three layers in the order the stylesheet stacks them: `src/lib/imageBackground.ts:509` — `export function cardGroundRgb(`
- The scrim the picture's palette is worst-case for: `src/lib/imageBackground.ts:453` — `export function worstCaseScrimRgb(`
- The one shared contrast measurement: `src/lib/contrast.ts:85` — `export function contrastRatio(a: Rgb, b: Rgb): number {`
- The guarantee, computed in every combination: `tests/card-contrast.test.ts:224` — `describe("the whole track holds for body ink, wherever the background itself is readable", () => {`
- The cards re-pinned for the two accessibility modes: `src/styles.css:5120` — `.app.contrast-high .card {`

- The rule that selects the tinted scrim: `src/styles.css:1173` — `.app.has-bg.bg-palette-image::after {`
- High contrast winning over the picture: `src/styles.css:1200` — `.app.has-bg.contrast-high::after,`
- Reduced transparency answered with opacity: `src/styles.css:1221` — `@media (prefers-reduced-transparency: reduce) {`

### The ink that follows the picture

- The sample size, as one constant: `src/lib/dynamicInk.ts:41` — `export const LUMINANCE_SAMPLE = 32;`
- And the FINER grid the bound is measured on, because 32 cells is a fine mean and a coarse worst case: `src/lib/dynamicInk.ts:67` — `export const EXTREME_SAMPLE = 96;`
- The bands the iOS scroll path slices, cut from that same grid: `src/lib/dynamicInk.ts:80` — `export const PICTURE_BANDS = 32;`
- A slice, folded into a picture of its own — average, luminance and both extremes: `src/lib/dynamicInk.ts:383` — `export function slicePicture(`
- The bands the viewport shows, when the backdrop scrolls with the page: `src/lib/dynamicInk.ts:438` — `export function visibleBands(`
- The WCAG average, and why an empty buffer answers 0 rather than `NaN`: `src/lib/dynamicInk.ts:114` — `export function averageRelativeLuminance(pixels: ArrayLike<number>): number {`
- The polarity decision, pinned on its own: `src/lib/dynamicInk.ts:138` — `export function prefersDarkInk(pictureLuminance: number): boolean {`
- The range above which the average stops describing the picture: `src/lib/dynamicInk.ts:154` — `export const WORST_REGION_RANGE = 0.4;`
- The region the decision must survive when the picture varies: `src/lib/dynamicInk.ts:205` — `export function worstRegion(sample: PictureSample): SampledRegion {`
- The scan itself: `src/lib/dynamicInk.ts:266` — `export function pickDynamicInk(`
- The grounds a decision has to survive: `src/lib/dynamicInk.ts:502` — `export function groundsFor(pictureLuminance: number): number[] {`
- The softer companion, measured to a real 5.2:1: `src/lib/dynamicInk.ts:321` — `export function softInk(ink: Rgb, ground: Rgb): Rgb {`
- The brand paints, stepping aside where they fail: `src/lib/dynamicInk.ts:356` — `export function readableBrand(`
- The composite the ink is decided against: `src/lib/imageBackground.ts:498` — `export function groundWithPicture(`
- The second ground — the one with no card under the words, where every section heading stands: `src/lib/imageBackground.ts:550` — `export function pageGroundRgb(surface: Rgb, scrim: Rgb, veilAlpha: number, picture: Rgb): Rgb {`
- How finely the veil is searched, a 2.5% step of the reader's own slider: `src/lib/imageBackground.ts:564` — `export const VEIL_AA_STEPS = 40;`
- The least veil at which some ink reads on both grounds: `src/lib/imageBackground.ts:593` — `export function veilForAA(opts: {`
- The canvas, once, extremes included — and drawn from the part of the file the WINDOW shows when `cover` is fitted to it: `src/state/useDynamicInk.ts:199` — `export async function measurePicture(`
- The crop that says which part that is, in the browser's own arithmetic: `src/lib/dynamicInk.ts:479` — `export function visibleCrop(`
- And the gate that hands it a box only where the backdrop is fixed to the window: `src/state/useDynamicInk.ts:191` — `function coverBox(fit: string | undefined): { width: number; height: number } | undefined {`
- The decision as a function, so the scroll listener can ask it without a render: `src/state/useDynamicInk.ts:347` — `export function decideDynamicInk(`
- And the slice it is narrowed to when the platform paints the backdrop against the document: `src/state/useDynamicInk.ts:370` — `  const visible = band ? slicePicture(measured, band.start, band.end) : measured;`
- The properties, written straight onto the root by that listener: `src/state/useDynamicInk.ts:433` — `function paintInk(root: HTMLElement, next: DynamicInk): boolean {`
- The listener itself: passive, throttled, and armed only for a `cover` picture on a touch scroller: `src/state/useDynamicInk.ts:545` — `    window.addEventListener("scroll", onScroll, { passive: true });`
- The gate, as a POINTER PROFILE rather than a user-agent: `src/lib/imageBackground.ts:412` — `export function followsDocumentBackdrop(match: (query: string) => boolean): boolean {`
- Its one call site, so the query string is never spelled out where it is used: `src/state/useDynamicInk.ts:522` — `    if (!followsDocumentBackdrop((query) => window.matchMedia(query).matches)) return;`
- **The platform assumption, stated as one.** The profile is a proxy for "this browser has dropped `background-attachment: fixed`", and the two queries together are the widest honest reading of it: `(hover: none) and (pointer: coarse)` is a device with no pointing device, and `(any-pointer: coarse)` with `(hover: hover)` is the same device WITH one attached — an iPad whose trackpad is the primary pointer, where the primary-pointer query alone would leave the follower unarmed on the platform it exists for. A touchscreen laptop matches the wider clause and does honour the property, so its follower arms and its ground narrows to the visible slice: a stricter bound on a device that did not need one. That is the direction this can be wrong in and the reason it is acceptable, and the suite walks it rather than trusting it — the profile case by case: `tests/lib/dynamic-ink.test.ts:1285` — `  test("the gate is a pointer profile, and the profile arms where the backdrop scrolls", () => {`
- And the conservative claim over EVERY range of the sample, not one lucky pair: `tests/lib/dynamic-ink.test.ts:1310` — `  test("where the gate is wrong it is wrong CONSERVATIVELY: a slice only narrows the ground", () => {`
- The hook, re-deciding on a slider but not re-decoding: `src/state/useDynamicInk.ts:477` — `export function useDynamicInk(`
- Five names, written together: `src/App.tsx:315` — `"--app-dynamic-ink": dynamicInk.primary,`
- The quieter ink rides the same decision: `src/App.tsx:316` — `"--app-dynamic-ink-soft": dynamicInk.soft,`
- Both brand paints, each measured on its own name: `src/App.tsx:317` — `"--app-dynamic-brand": dynamicInk.brand,`
- And the raw `--ink`, which the decision deliberately does NOT write: it is the token the solid carriers re-pin FROM, so overwriting it handed them the photograph's ink: `src/App.tsx:308` — `// Overwriting the token broke exactly that promise: those rules`
- The carriers that pin, and would have been defeated: `src/styles.css:1018` — `  --app-ink: var(--ink);`
- The four slots, and why the raw tokens stay the theme's, argued where the slots are declared: `src/styles.css:903` — ` * THE RAW TOKENS STAY THE THEME'S, AND THAT IS LOAD-BEARING. The decision used`
- The two lines that used to ignore the picture while reporting on it, now reading the slot: `src/styles.css:4356` — `  color: var(--app-ink-soft);`
- The slot layer the inheriting words read: `src/styles.css:892` — `  color: var(--app-ink);`
- The slots themselves, theme by default: `src/styles.css:926` — `  --app-dynamic-brand: var(--brand);`
- The fade itself: `src/styles.css:5077` — `    transition: color 0.2s ease;`
- The guarantee, measured over 21 veils × 21 fades × 6 themes: `tests/lib/dynamic-ink.test.ts:317` — `  test("the ground the reader is looking at clears AA on the WHOLE track", () => {`
- The mutation the two grounds remove, rebuilt and measured: `tests/lib/dynamic-ink.test.ts:389` — `  test("the ground under the headings: the ONE-ground decision leaves them invisible", () => {`
- The scroll path, whole: a slice that decides like a picture, the bands a viewport shows, and the listener's own shape: `tests/lib/dynamic-ink.test.ts:1125` — `describe("the band the reader can see: the iOS scroll path", () => {`
- And the number that makes the listener load-bearing: the frame's own answer reads 1.37:1 on the field the reader is looking at: `tests/lib/dynamic-ink.test.ts:1218` — `  test("scrolled to the field, the static decision is the one that vanishes", () => {`

### The nested menus, and why they had a rule

- The two new tints, on the card's own weight: `src/styles.css:5011` — `    --app-soft-surface: color-mix(`
- The small menu that prompted it: `src/styles.css:2433` — `.segmented {`
- The mode re-pinning them: `src/styles.css:5144` — `.app.contrast-high {`
- The inventory, in both directions: `tests/background-stack.test.ts:549` — `describe("the nested menus fade with the card they sit in", () => {`

### The stylesheet

- Tokens start here: `src/styles.css:18` — `:root {`
- The card surface: `src/styles.css:1404` — `.card {`

## 9. Accessibility

- Large text: `src/styles.css:123` — `.app.text-large {`
- Extra-large text: `src/styles.css:126` — `.app.text-xlarge {`
- High contrast: `src/styles.css:129` — `.app.contrast-high {`

- The global clamp: `src/styles.css:3633` — `@media (prefers-reduced-motion: reduce) {`
- The card-specific cancellation: `src/styles.css:3633` — `@media (prefers-reduced-motion: reduce) {`

- `src/lib/themes.ts:538` — `root.style.setProperty("color-scheme", isLight(tokens.bg) ? "light" : "dark");`

- Text on a filled surface: `src/lib/themes.ts:461` — `const on = (hex: string) => (isLight(hex) ? "#16211d" : "#ffffff");`. The four `--on-*` foregrounds are **derived**, never constant, so a dark theme's mint button gets dark text automatically. All sixteen pairs clear 4.5.
- The line is at **0.5**: `src/lib/themes.ts:419` — `return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5;`. That is where the better foreground changes sides rather than where a colour stops being light — a mid-tone amber wants dark text, and calling it dark is what gave it white.

- Dark preference: `src/lib/media.ts:42` — `export const PREFERS_DARK = "(prefers-color-scheme: dark)";`
- Reduced motion, as a query string: `src/lib/media.ts:45` — `export const PREFERS_REDUCED_MOTION = "(prefers-reduced-motion: reduce)";`
- The read, with an injectable window: `src/lib/media.ts:85` — `export function matchesMediaQuery(query: string, win?: MediaWindow): boolean {`
- The subscription: `src/lib/media.ts:97` — `export function subscribeToMediaQuery(`

- `src/styles.css:3743` — `.collapsible-card-head {`

- The body is a grid row so it can animate to an unknown height: `src/styles.css:3762` — `.collapsible-card-body {`

- The one decision function: `src/lib/navVisibility.ts:109` — `export function decideNav(input: NavDecisionInput): NavDecision {`

## 10. The test suite

**131 files, 50 570 lines, 3 828 tests.** `bun test` — no test framework in the
dependency block; the runner is bun's own. This table is the second half of the
document's proof: its file count, its total and the five group sums are all
recomputed from the rows below, so a file that lands without a row, a row whose
file is gone, and a file listed twice each fail the suite rather than print a
number nobody re-reads.

The first fifty rows are the cross-cutting guards and batch suites: the
background-stack contract, the Batch 7 scope guard and the icon-set registry,
every batch's own file, the full-system journeys, the contrast track, the i18n
sweep, and the phase gates. Each one carries its own pins; the category is not
split into a separate table because it is the union of every other category, not
a fourth ground.

- The check that makes the table total, in both directions: `tests/batch13-inventory.test.ts:307` — `expect(new Set(rowLines).size).toBe(onDisk.length);`

**Guards and cross-cutting invariants** — 56 files, 2 464 tests

| File | Tests | Pins |
| --- | --- | --- |
| `tests/background-stack.test.ts` | 28 | the background layer's paint stack — the layers' order, which slider reaches which layer, the preview's own order, the one writer of the card fade, the hover states that used to un-fade it, the thirty nested menus the fade could not reach, and the page backdrop's seam under a picture |
| `tests/batch-C.test.ts` | 67 | that the UI font registry, the vendored bytes and the app's own Hungarian are one consistent set |
| `tests/batch1.test.ts` | 10 | the first unit batch: the reminder daemon, custom themes, gratitude, nutrition, video attachments |
| `tests/batch10.test.ts` | 18 | that the food-photo feature keeps every promise: no bundled key, the image payload, failure states, and a structural consent gate |
| `tests/batch11-collapse.test.ts` | 45 | collapsible cards: default, summary, persistence, motion, + the 2026-10 completion's eight |
| `tests/batch11-nutrition.test.ts` | 29 | that a meal tip appears only when a rule earned it, the week is honestly windowed, and the wording never becomes a plan |
| `tests/batch11-polish.test.ts` | 24 | that every mood colour clears WCAG AA on every background, and that `EmptyState` grew a `cta` slot the empty screens use |
| `tests/batch11-sport.test.ts` | 30 | that a sport tip is verbatim where the registry mandates it, and the rest nudge invites without ever guilt-tripping |
| `tests/batch11-tabs.test.ts` | 26 | that a reordered tab bar persists, survives a cold module graph, and tolerates every malformed order a blob can carry |
| `tests/batch12-css.test.ts` | 7 | that no class in the stylesheet is unreachable, and that the toast tones are declared once and mean what they say |
| `tests/batch12-dead-export.test.ts` | 9 | that no export in `src/lib` is unreachable |
| `tests/batch12-lato.test.ts` | 18 | that the upstream pin is a pin, and that Lato's retirement really is over |
| `tests/batch12-media.test.ts` | 17 | that the auto theme follows the operating system through the one module, on the modern and on the legacy API alike |
| `tests/batch12-theme.test.ts` | 29 | theme resolution and the corrupt-value repair |
| `tests/batch13-cmap.test.ts` | 41 | the character-map reader, against fonts it builds itself |
| `tests/batch13-color-scheme.test.ts` | 35 | that one function is the only theme writer |
| `tests/batch13-inventory.test.ts` | 16 | that this document's own claims are true, and its counts current |
| `tests/batch2.test.ts` | 13 | custom trackers, the month and year aggregations, badge rules, the correlation grid, the service-worker contract |
| `tests/batch3.test.ts` | 38 | reminder scheduling, including the midnight wrap |
| `tests/batch4.test.ts` | 44 | the export and import round trip |
| `tests/batch5-legacy-store.test.ts` | 12 | that a pre-Batch-5 payload keeps its emoji activity labels, and that a later save does not normalise them away |
| `tests/batch5-typography.test.ts` | 65 | the typeface registry against the vendored bytes |
| `tests/batch5.test.ts` | 654 | the registry-driven tables: moods, activities, trackers, badges |
| `tests/batch6-pdf.test.ts` | 6 | that the PDF footer carries the source attribution only when the report earned it |
| `tests/batch6-ui.test.ts` | 40 | the safety block S1–S8: the crisis notice on the ninth question, and a disclaimer that never leaves the result |
| `tests/batch6.test.ts` | 67 | the maths: streaks, correlations, aggregation |
| `tests/batch7-store.test.ts` | 10 | that a withdrawn icon set is moved rather than dropped, and a corrupt one is dropped rather than rendered |
| `tests/batch7-ui.test.ts` | 37 | that the untouched default is the default, and that there is no fallback left to get wrong |
| `tests/batch7.test.ts` | 41 | the Batch 7 scope guard and the icon-set registry |
| `tests/batch7b.test.ts` | 37 | the nav icon registry, that selecting a set costs no network request, and that the nav work left the content sets alone |
| `tests/batch7d.test.ts` | 36 | that the bottom bar hides for readers and not for everyone: off means no listener, and reduced motion means off |
| `tests/batch7e.test.ts` | 64 | the correlation matrix's sample guards |
| `tests/batch7f.test.ts` | 143 | that the PDF typeface cannot leak into the UI |
| `tests/batch7g.test.ts` | 16 | the Year in Pixels card: the title is the word the card means, and a day can be picked and is announced |
| `tests/batch7h.test.ts` | 26 | that tracker values are finally read, and that the PDF can spell Hungarian |
| `tests/batch7i-ui-fonts.test.ts` | 71 | that every shipped face can spell Hungarian |
| `tests/batch7i.test.ts` | 20 | that the report draws `ő` because the vendored subset has the glyph — on a device that has never been online too |
| `tests/batch8-typography.test.ts` | 46 | the eight-family refresh, and that the picker's sample sentence lives in the catalogue |
| `tests/batch8b-weather.test.ts` | 17 | that the weather API is opt-in, cached per (location, day), and every failure is a value rather than a throw |
| `tests/batch9.test.ts` | 21 | the smartwatch import: the Apple Health and Google Fit parsers, and the merge semantics |
| `tests/cache-refresh.test.ts` | 12 | the four layers of "a deploy must reach the reader": the worker's cache name is this build's (never the word `stable`), the registration asks for it by version out of the HTTP cache, the document's three `<meta http-equiv>` tags, and the reader's own button — exercised for real over doubles, four steps in the order that works, still reloading when an API is missing |
| `tests/card-contrast.test.ts` | 164 | that the whole track holds for body ink in all fourteen presets against an adversarial picture, wherever the PAINTED veil (the reader's number, floored by the card) reaches the measured threshold — and that dropping, halving or swapping the floor turns it red |
| `tests/contrast.test.ts` | 100 | WCAG AA computed from the palette rather than read off a table, with the known shortfalls pinned and now empty, and the backdrop presets' colour runs sampled stop to stop |
| `tests/full-app-audit.test.ts` | 43 | the thirty-seven journeys A01–A37 end to end — first entry to manifest shortcuts, every Settings tile, and the micro-lesson's rotation — plus the five mutations N1–N5 this file was written to catch |
| `tests/full-system.test.ts` | 16 | fifteen journeys end to end — the one file that asks whether the whole app agrees |
| `tests/full-system-v2.test.ts` | 36 | the other thirty, same substrate: onboarding to corrupt storage, with the five mutations this batch was written to catch |
| `tests/fonts-i18n.test.ts` | 9 | round 16: that the retired-font reasons are keys rather than literals, that the key set is closed both ways, and that the catalogue holds what the registries export |
| `tests/icon-policy-i18n.test.ts` | 7 | round 15: that every `iconPolicy` key has a caller and every caller has a key, and that the sweep cannot be quietly reverted |
| `tests/i18n-round17.test.ts` | 12 | round 17's five `.ts` modules: the keys close both ways, every exported value is byte-identical to the catalogue, the prompt still composes, and no accented string is left in the five files |
| `tests/i18n-round18.test.ts` | 17 | round 18's second walk: the eighty-one keys close both ways, the six registries and the lock return their catalogue values, the insight and report sentences still compose with their numbers in, and the thirteenth module (`lib/csv.ts`) is pinned as ids rather than copy — read from the AST, because a text scanner desynchronises on its regex |
| `tests/i18n-round19.test.ts` | 24 | the language switcher: the registry is closed, the `hu-HU` tag is minted once and no module reads `navigator.language`, the mirror is what a reload hears (through cache-busted imports of `lib/i18n` and `lib/store`), the store keeps the choice in `settings` and deletes one it cannot render, and the picker offers the three autonyms with exactly one pressed |
| `tests/i18n-sweep-list.test.ts` | 5 | that the generated sweep list is the current tree rather than a snapshot of an older one, and that its own three totals agree |
| `tests/phase2.test.ts` | 10 | attachments, custom activities, trackers |
| `tests/phase3.test.ts` | 12 | cbt, breathing, habits, Year-in-Pixels, lag analysis |
| `tests/phase4.test.ts` | 7 | onboarding state and reminder scheduling |
| `tests/stuck-worker.test.ts` | 17 | the stuck service worker: the detector (a controller url without this build's hash, conservative about every unknown), the escape address (`resetUrl` + taking the stamp back out), the `SKIP_WAITING` message on both sides, the immediate reload for a swap the page asked for, the banner's markup and its solid amber rail, and the reader's devtools guide |

**`tests/lib/` — one file per library module** — 55 files, 1 045 tests

| File | Tests | Pins |
| --- | --- | --- |
| `tests/lib/ai-chat.test.ts` | 15 | the model sizes (both prebuilt ids, their measured megabytes, the default, the legacy no-`model` config and the unknown-size fallback), the crisis gate's order on both calls (off → facts → crisis → key — with the on-device crisis path asserted to answer without ever reaching the engine), and the question path's transport (system prompt carries the crisis obligation, the user turn carries context header → facts → question in order, the helpline block is appended by the engine not the model, empty answers refused) |
| `tests/lib/crisis-guard.test.ts` | 32 | the keyword list itself: the Hungarian stems and English phrases that must fire, the grief/plot/decoy phrases that must not, the accepted `öngyilk` stem tradeoff pinned as a match so it stays deliberate, and the reply that opens with the catalogue sentence, names every phone number RESOURCES carries and stays a sentence plus bullet lines |
| `tests/lib/storage-keys.test.ts` | 8 | the registry as a whole set read out of the tree: every `belso-iranytu*` literal in `src/` is a wipe key or a named non-storage name, the lists are disjoint and namespaced, the eighteen keys the old chain left are in the wipe, and the wipe removes all of them from both storages and nothing else |
| `tests/lib/image-background.test.ts` | 54 | the background layer: scrim, blur, tint, the fit (including the soft fill's recipe) and the card fade, and its own key and cap |
| `tests/lib/backupStorage.test.ts` | 34 | that the storage-key list and the available wraps are pinned sets, and nothing outside the allow-list is read |
| `tests/lib/i18n.test.ts` | 37 | that a partial catalogue cannot render a blank, that no key is dead, that coverage is complete, that a moved sentence still composes to the bytes it used to, that the app's own name exists once, and that round 17's prompt, macros line and masked key compose to the sentences the modules shipped |
| `tests/lib/experiments.test.ts` | 30 | the three-day window and the one-at-a-time guard, both from the store |
| `tests/lib/backupDaemon.test.ts` | 29 | that the scheduler asks and cannot act: the `enabled` gate, both time boundaries, the once-per-session latch, the fold, and the leaked subscription |
| `tests/lib/section-order.test.ts` | 16 | that a stored order is always a permutation, that a no-op move is the same array, and what the reset compares |
| `tests/lib/pattern-insights.test.ts` | 29 | the four insight engines — activity, sleep, stress, weekday — their confidence, and the wording rule |
| `tests/lib/backupKey.test.ts` | 28 | that a passphrase, a passkey and twelve recovery words each derive a different key, and the twelve words are real entries |
| `tests/lib/micro-lessons.test.ts` | 26 | the micro-lesson registry, `lessonsForQuadrant`, `pickLesson` rotation, and seen-lesson storage |
| `tests/lib/weekly-reflection.test.ts` | 25 | the prompt registry, the ISO week maths, which prompt a week gets, the note mirror, and the skip and answer stores |
| `tests/lib/feature-use.test.ts` | 24 | that the sidecar is total, and that each new badge fires at n and not at n-1 |
| `tests/lib/meditations.test.ts` | 23 | that the durations are real, the timer is the existing engine, and the wording obeys the repo's own rules |
| `tests/lib/nutrition.test.ts` | 38 | that the food registry's calories agree with its own macros, that the allergen rule is a substring match over the NAME (silent when unmarked, stable in registry order), that the totals add up, that a corrupt blob loads as a usable log, and that a food the reader typed is a NAME — counted as an item, contributing no invented numbers, kept across a reload when it has one and dropped when it does not |
| `tests/lib/custom-foods.test.ts` | 10 | the reader's own foods: a name survives a reload, blanks and case-insensitive duplicates are refused, order is newest-first, matching is a substring over the name (and over a caller's snapshot when one is passed), removal is by id, and a corrupt blob loads as a usable list |
| `tests/lib/diets.test.ts` | 13 | the twelve diet ids in the order the picker shows them (the audit's gluten-free, lactose-free and pescatarian between high-protein and "other"), the one sentence a chosen diet may say about itself — a real professional to ask, no diagnosis, and no note on "other" — the narrowing guard accepting exactly the registry, and one stored choice: it survives a reload, clearing removes the key rather than storing a sentinel, an unknown id is refused, a subscriber hears every change, and a foreign blob loads as no choice at all |
| `tests/lib/collapsible-audit.test.ts` | 13 | the Phase 5 state audit: the 81 remembering mounts and their 87 ids read out of the tree with no duplicate and no missing summary, the frozen id vocabulary, the six session-local drawers pinned as a set, collapse state's one key and its place in the backup's exclusions, the production reset against the test seam, and the rule that every non-test `reset` export in `src/lib` is called by the wipe — from the delete-all chain or from `RESET_FUNCTIONS` in the key registry |
| `tests/lib/companion.test.ts` | 12 | the forgiving companion: the five shapes and five colours as total registries, XP and level derived rather than remembered, the streak's three cases (same day, exactly yesterday, any longer gap), and the one rule the module exists for — a gap dims the avatar and resets nothing else, with the state surviving a reload, a corrupt blob repaired, and the wipe clearing the key |
| `tests/lib/programs.test.ts` | 13 | the six-week program's state machine: a fresh install has none, a start writes only its own key, each press finishes exactly one week, a gap between weeks changes nothing, the last week finishes the program and finishing again is a no-op, restarting cannot lose the reader's place, and a stored gap or junk in the completed list is repaired rather than rendered |
| `tests/lib/seek-help.test.ts` | 10 | the non-diagnostic guide: three questions, an answer about self-harm reaching the urgent branch across every duration/impact combination, the two conservative thresholds, every branch carrying a title, a body and a next step, no condition named or cure promised in any of the twelve results, and no phone number written into the tree |
| `tests/lib/sleep-log.test.ts` | 15 | the sleep log: a night that crosses midnight is one duration, equal times are ambiguous rather than zero, junk times are refused, one record per day newest-first with a re-save replacing, a corrupt blob loads as a usable list, deletion is exact, subscribers hear a save and the reset clears the key — plus the correlation's floor, its band averages, a coefficient of 1 on a perfect relationship, no divide-by-zero on a flat mood column, and a sentence that never claims cause |
| `tests/lib/health-hrv.test.ts` | 20 | the wearable half of phase 3 and the deepening of phase 4: SDNN parsed into its own series and never into bpm, a zero and a sub-millisecond reading dropped, the merge writing `smartwatch-hrv` only behind the reader's own toggle, an HRV preview row that counts the days it could fill, the id staying out of the tracker registry, a neutral grid column that appears only once a sample exists — and the resting-heart-rate series the same way: its own lane (never in bpm, never in SDNN), a 25–150 bpm sanity window, its own merge id and preview row, and the registry free of it too — plus the summary card's engine: absent days counted as absent rather than zero, the averages over every sampled day, the two seven-day windows split TEMPORALLY (a value-sorted window would flatter a rising series and hide a falling one), the trend withheld until each window holds two days, and a one-millisecond gap read as flat |
| `tests/lib/support-wall.test.ts` | 17 | the Phase 5 wall: the 280-character cap accepted and refused at its edges, the 200-note cap spending the OLDEST UNPINNED note and refusing outright when every slot is pinned, pinned-before-newest display that leaves the stored order alone, delete and pin round-trips, off as the default, a corrupt or wrong-typed blob repaired rather than thrown — and the zero-network promise asserted on the SOURCE: neither the engine nor the card names fetch, XMLHttpRequest, sendBeacon, WebSocket, EventSource or navigator, so a future call added to either file fails here before it can ship |
| `tests/lib/weekly-menus.test.ts` | 12 | the composed week: the eleven named diets get seven days and `other` gets none, every item is a registry row in that diet's pool, no meal repeats a food, the same diet composes the same week, no diet prints one day seven times, every exclusion names a real food, and a day's total is the sum of its own rows |
| `tests/lib/fitness.test.ts` | 47 | that adopting a template COPIES it, that the caps hold, that the log is a record a later plan edit cannot change, that progression is computed by name — including the repeated-weight rule that becomes 2.5 kg and its bodyweight twin, one more rep or five more seconds — that the dose string says whether a number is reps or seconds, that the chart series is the progression as points, and, from Phase 3's third commit, that the twelve templates each carry one of the six movement types and that a rest day keeps its exercises while dropping out of the rotation |
| `tests/lib/backup.test.ts` | 24 | that the orchestration refuses rather than answers, and a restore is a merge |
| `tests/lib/education.test.ts` | 20 | that the education registry is registry-integr, non-clinical, and stays in the register |
| `tests/lib/gad7.test.ts` | 28 | that the seven items and the four bands are registry-integral, non-clinical and in the register, and that all 16 384 answer sheets land in a band that contains their own score |
| `tests/lib/feature-flags.test.ts` | 20 | the remembered flags behind the three badges that leave no residue |
| `tests/lib/dynamic-ink.test.ts` | 50 | that the ink the app picks for a picture clears AA across the whole band — 21 veils × 21 fades × 14 palettes × 2 pictures — that the decision survives the WORST REGION of a picture the average cannot describe, and that the reader still passes the measured ground, not a widened one |
| `tests/lib/backupCrypto.test.ts` | 19 | that the key hierarchy is real HKDF and that a passphrase cannot be brute-forced silently |
| `tests/lib/precache.test.ts` | 21 | what goes in the precache — including the AI runtime's exclusion and the size backstop — the marker contract with the generator, and a build-time guard that really refuses |
| `tests/lib/breathing-consolidation.test.ts` | 26 | that the 4-4-4 survived the merge, the duplicate stayed deleted, and `engineStarted` tells a started session from a fresh one |
| `tests/lib/crisis-card.test.tsx` | 18 | that the help is reachable from four places and rests on one list |
| `tests/lib/ring-tokens.test.ts` | 18 | that the ring aliases are read, defaulted, and that no palette survives in JS |
| `tests/lib/artwork-split.test.ts` | 11 | that the artwork chunk cannot collapse back into the entry bundle, and that the loader lands it once |
| `tests/lib/store-import-repair.test.ts` | 11 | that a hand-edited import is repaired at the one door every entry passes through |
| `tests/lib/store-section-order-repair.test.ts` | 7 | that a `sectionOrder` which is not a map of arrays loses the whole field, and that one bad tab loses only itself |
| `tests/lib/ios-install.test.ts` | 11 | the three iOS tags in the document where Safari looks, the manifest agreeing with them about the icon and the shortcut URL, and `?quick=` mapping to a tab — read defensively through `location.href` so a server-side render or a partial `window` reads as "no instruction" rather than crashing |
| `tests/lib/quick-start.test.ts` | 18 | the deep-link system the widget batch built: the nine-value vocabulary as a pinned set, each value's (tab, anchor) pair, the anchor ids existing in the views that paint them, the URL read surviving absent and partial `window`s, the scrub keeping other parameters, the manifest's four shortcuts each naming a live parameter and an icon on disk, the subscriber bridge (publish, unknown value, unsubscribe, a throwing listener), the reminder's click focusing and jumping to the Ma tab, and the scroll's own no-op paths |
| `tests/lib/background-app.test.ts` | 11 | that the app root actually paints the chosen image, including the soft fill's third layer |
| `tests/lib/context.test.ts` | 10 | the context panel's pinned dimensions, its label mapping, and the selection helper |
| `tests/lib/emotion-vocab.test.ts` | 9 | the pinned default emotion words asserted id-for-id, and the custom-emotion path |
| `tests/lib/quadrant-correlations.test.ts` | 9 | the emotion × context and quadrant × sleep maths, with the sample guard asserted from both directions |
| `tests/lib/recording-storage.test.ts` | 9 | the store's migration, clamp and passthrough layers for the new fields |
| `tests/lib/voice-bundle.test.ts` | 9 | that no module statically imports the OpenAI SDK, and that the no-key path is unchanged |
| `tests/lib/quadrant.test.ts` | 8 | the quadrant model's registry, its labels, the meter's copy and its geometry, read from the app's own constants |
| `tests/lib/recording-settings.test.ts` | 7 | that the `moodFlow` recorder switch normalises at the storage boundary, and that the migration table and geometry agree |
| `tests/lib/year-in-pixels-quadrant.test.ts` | 6 | that a quadrant day paints the quadrant colour, and that the PDF carries the new fields |
| `tests/lib/a11y-names.test.ts` | 4 | that every button, input, textarea and select carries an accessible name |
| `tests/lib/backupWordlist.test.ts` | 4 | that the wordlist is 1024 entries — ten bits per word — and the sampler does not repeat |
| `tests/lib/module-resets.test.ts` | 13 | the memory half of the wipe: that the five modules which read their record at import are serving it before a wipe and a first-ever state after one, that each reset clears the record, deletes its key and notifies its subscribers, that the resets run before the key loops, that the records read per call are empty too, and that a subscriber sees the empty store during the wipe |

**`tests/components/` — rendered markup** — 11 files, 191 tests

| File | Tests | Pins |
| --- | --- | --- |
| `tests/components/backup-settings-card.test.tsx` | 50 | that the card renders the real Hungarian copy, that its rendered class list is pinned, and that its control is a plain `Card` |
| `tests/components/BackgroundImagePicker.test.tsx` | 31 | the Háttérkép picker: preview, three sliders, the fit, the palette, the fade track staying the whole 0–100%, and the AA notice appearing when — and only when — the ink decision reports `meetsAA === false` |
| `tests/components/MicroLessonCard.test.tsx` | 10 | the micro-lesson card's gating, its two stages, the named quadrant, rotation, and where the dismissal goes |
| `tests/components/section-list.test.tsx` | 12 | that ordered mode adds no element to the page, and that each arrow names its row and its position |
| `tests/components/PatternInsightsCard.test.tsx` | 9 | the pattern-insights card's empty state, a populated list, and the wording on screen |
| `tests/components/recording-flow-ui.test.ts` | 22 | that the three recording steps are one dialog, that `TodayView` carries the recorder switch, and that the meter answers a press: all four tiles selectable, the chosen tile marked, the drag still painting, and that the energy slider stands beside the grid and reads the meter's own value |
| `tests/components/pin-lock-gate-cooldown.test.ts` | 10 | that the PIN lockout is announced once through a polite live region, and that the ticking line is not a live region itself |
| `tests/components/Gad7Card.test.tsx` | 15 | the check-in rendered: seven items in order on one screen, the imported scale on every one of them, no score or crisis word before a run, and a result panel that cannot draw a total without the disclaimer and the resource list |
| `tests/components/EducationLibraryCard.test.tsx` | 5 | the library's index and its article reading state, rendered |
| `tests/components/NutritionCard.test.tsx` | 14 | the meal log rendered: the four meals named, the search box opening on a real registry row with its own portion and calories, the suggestion sources pinned to the two modules, the summary carrying real numbers, a food the reader owns listed by name with the note that says what the totals cannot count, and the allergy warning appearing when — and only when — the settings mark one |
| `tests/components/FitnessCard.test.tsx` | 13 | the workout card rendered: every template offered with its focus, its day count and its movement type, a stored plan listed under the reader's own, a logged session with its volume, and a bodyweight exercise's own rep trend, next rep count and chart |

**`tests/views/`** — 7 files, 98 tests

| File | Tests | Pins |
| --- | --- | --- |
| `tests/views/section-structure.test.ts` | 15 | that every tab declares its sections once, that Settings declares eight, and that the list is rendered through `SectionList` |
| `tests/views/insights-split.test.ts` | 9 | that recharts is only reachable through a dynamic import |
| `tests/views/section-reorder-integration.test.tsx` | 26 | that all five tabs draw the reorder toggle, that a stored `sectionOrder` really moves the rendered cards, that the panel's rows name the sections they move, that a reset drops its own tab and no other, and that the button sits below the list it opens — in the source and in the rendered bytes, on every tab |
| `tests/views/tools-split.test.ts` | 12 | that the Felfedezés tab's eight cards are each in the drawer this file says they belong to, once, gated where it should be, gone from the Ma tab, that the tab's header and the bottom bar's row say the same name, that no catalogue sentence still names the old one, and that the renamed fifth drawer kept the id a stored arrangement names |
| `tests/views/health-cards.test.ts` | 14 | that the health drawer's twelve cards arrived on the Egészség tab, each in the section this file says it belongs to and in exactly one, that none of them is still in Felfedezés, that the three module gates are on the cards' own lines while the check-in is gated by nothing, that the rendered tab really draws the workout programmes and the plans-and-log card, and that the health audit's additions are on the page — the three new diets as pills, the two new programmes beside the original four, and the red-flag line that sends the reader to help rather than naming a condition |
| `tests/views/coverage-guard.test.ts` | 13 | that every public surface that renders a help row is named, and that the two hard surface split tests land where they land |
| `tests/lib/card-state-persistence.test.ts` | 14 | that CollapsibleCard's toggle calls `setCardCollapsed` synchronously (the write-through slice), that its mount reads `belso-iranytu:cardStates` tolerantly and never sessionStorage, that `defaultOpen` decides only the untouched case (a stored choice still wins, and an ordinary card still mounts shut), and that open → close app → reopen, refresh, several tiles at once and "Minden adat törlése" each round-trip through the rendered markup |
| `tests/views/settings-cards.test.ts` | 9 | that the Settings Nyomonkövetés card is a remembering card collapsed by default with a registry-derived summary that round-trips, that every card on the Settings page is collapsible with only the crisis card named as the plain exception, that the request's fifteen surfaces each render under their pinned id, that no group eyebrow repeats the title of the card directly beneath it (the duplicate that made the Nyomonkövetés card look unclickable), that the first control in that group is the card head, and that the view mounts no plain `Card` |

**`tests/integration/` and `tests/migration/`** — 2 files, 30 tests

| File | Tests | Pins |
| --- | --- | --- |
| `tests/integration/recording-flow.test.ts` | 10 | the recording flow end to end: coordinates, then emotion, then context, and the migration that meets it |
| `tests/migration/mood-v2.test.ts` | 20 | the level → coordinates table, `quadrantFromCoords`, and that the runner is defensive |

* * *

## 11. Scripts and vendored assets

| Script | Output | Rule |
| --- | --- | --- |
| `scripts/vendor-fonts.ts` | `public/fonts/` | fetches only immutable gstatic URLs and size-checks each |
| `scripts/subset-ui-fonts.ts` | `public/fonts/` | cuts each face to what the app can show, and refuses a cut that cannot spell Hungarian |
| `scripts/subset-pdf-font.ts` | `public/pdf-fonts/` | cuts the PDF's own faces from pinned SHA-256 upstreams |
| `scripts/vendor-fluent-artwork.ts` | inlines into `src/` | re-inlines the 3D icon artwork as source |

- The UI subsetter's output root: `scripts/subset-ui-fonts.ts:86` — `const OUT_ROOT = "public/fonts";`
- The vendoring script's output root: `scripts/vendor-fonts.ts:145` — `const OUT_ROOT = "public/fonts";`
- The PDF subsetter's output root: `scripts/subset-pdf-font.ts:89` — `const OUT_ROOT = "public/pdf-fonts";`

| Directory | Contents |
| --- | --- |
| `public/fonts/` | 24 `woff2` files and 10 OFL licence texts |
| `public/pdf-fonts/` | 3 subsetted TTFs and 1 OFL text |
| `public/icons/` | one SVG and two PNGs |
| `public/iconsets/` | one `LICENSES.md`; the artwork itself is inlined in source |
| `public/sw.js`, `public/manifest.webmanifest` | the installable shell |

## 12. What is deliberately not here

- `src/App.tsx:112` — `const [tab, setTab] = useState<TabId>(() => consumeQuickStart() ?? "today")`

- The five scripts, and the runner among them: `package.json:6` — `"scripts": {`
- The runner, declared once so CI and a laptop run the same thing: `package.json:11` — `"test": "bun test"`
- The dependency block, with nothing in it for testing: `package.json:13` — `"dependencies": {`

- `gitignore` — `.fontcache/`: `.gitignore:13` — `.fontcache/`

