# Final audit v6 — Belső Iránytű

The complete feature, storage and test inventory of the app on
`feature/final-audit-complete` (main `48489f5` plus six commits). Every number
was measured on the tree this document ships with; nothing is quoted from
memory.

## 1. Feature inventory

### Core journaling
- **Ma (Today)** — 5-level mood picker with emoji registry (5 moods), stress
  and energy sliders, daily goals, balance score, quadrant recorder
  (Érzés és kontextus), note, activities (default + custom), emotions
  (default + custom vocabulary), attachments (photo/video), tracker inputs
  (built-in + custom), voice recording (offline Hungarian keyword parser,
  optional OpenAI `gpt-4o-mini` JSON mode with offline fallback), weather
  tracker group (manual + API), gratitude journal.
- **Napló (Journal)** — month calendar with mood colours, real streak,
  search, mood filter, entry detail with edit/delete, year-in-pixels view.
- **Elemzés (Insights)** — weekly summary, mood curve with period switcher,
  activity–mood correlation, monthly/yearly stats, correlation grid
  (built-in outcomes + custom numeric tracker columns), lag analysis
  (24h/48h), pattern insights, quadrant insight cards, habit streaks,
  achievements (milestones), experiments.
- **Beállítások (Settings)** — name/goal, module on/off, reminders, text size
  (normal/large/x-large), high contrast, theme (auto/light/dark/warm/
  vibrant/custom editor), font picker (10 UI faces + handwriting, grouped by
  category, honest byte cost), icon set picker (lucide/system/fluent, CC-BY
  attribution, retired-set repair), background image (3 fits, blur, scrim,
  card transparency — the two sliders independent by design), tab & section
  reordering (all four tabs), tracker on/off, PIN lock, backup & export,
  health import, food AI key management, install prompt.

### Speciality modules
- **CBT** — thought record (situation → automatic thought → emotion →
  distress before/after → evidence for/against → balanced thought), mood
  shift computed per record and averaged, 200-record cap.
- **Breathing** — 4-7-8 and three siblings, engine with pause/resume, custom
  patterns; **Meditation** — ten practices built on the same engine.
- **Habits** — custom habits, per-day toggle, streak & weekly count.
- **Medication** — med list with per-med times and reminder switch, dose
  gate (module → meds → permission → due), fired-key dedup, scheduler card.
- **PHQ-8 self-assessment** — 9 items + supplementary functional-impact
  question, consent screen with source attribution, score → band (never a
  diagnosis), needs-support flag, log, disclaimer everywhere.
- **Encrypted backup** — one file, three wrap slots (passkey / password /
  12-word recovery code with checksum), AES-GCM 256 + HKDF, restore report,
  rotation, daemon reminders.
- **App lock** — 4–6 digit PIN, PBKDF2 150k, weak-PIN refusal, attempt
  cooldown, session lock.
- **Food AI** — photo → calories/macros via OpenAI (key stays local), result
  → tracker values, offline refusal ladder.
- **Health import** — Apple Health (stream + DOM fallback) and Google Fit,
  preview (applies/preserves/skips) then additive merge, optional entry
  stubs.
- **Weather** — manual city or GPS, open-meteo geocode + forecast, WMO
  condition in Hungarian, cache (today fresh, past immutable).
- **PWA** — offline service worker, precache 39 entries, install prompt,
  offline-first storage.
- **Crisis support** — always-available crisis card with Hungarian
  resources, disclaimer copy shared through the catalogue.

### Platform
- React 18 + TypeScript + Vite, no backend, no account, no tracking; all
  data `localStorage`/OPFS; i18n framework staged (934 keys, Hungarian
  source of truth, en/de catalogues partial by design); self-hosted fonts
  (OFL, subsetted, ő/ű verified from the bytes); icon policy (content vs
  chrome) documented and shown in Settings.

## 2. Storage keys (complete)

Thirty-two keys are written or read as complete literals in `src/` and
`public/sw.js` — that is the inventory guard's own count, and this list is
checked against it. The names below are complete keys; attachments are the
exception and are called out, because a reader hunting for a per-blob key
would otherwise go looking for one that does not exist.

`belso-iranytu-data-v2` (the store; legacy `belso-iranytu-data` + `belso-iranytu-profile` are read by the v1→v2 migration and removed),
`belso-iranytu-emotion-vocab`, `belso-iranytu-attachments` (every blob's data
URL lives INSIDE this one key, indexed by attachment id — there is no
per-blob key),
`belso-iranytu-assessments-v1`, `belso-iranytu-cbt-records`,
`belso-iranytu-habits-v1`, `belso-iranytu-custom-trackers`,
`belso-iranytu-custom-activities`, `belso-iranytu-onboarding`,
`belso-iranytu-app-lock`, `belso-iranytu-app-lock-session` (sessionStorage),
`belso-iranytu-backup`, `belso-iranytu-backup-state`,
`belso-iranytu-med-reminders-fired`, `belso-iranytu-reminder-last`,
`belso-iranytu-reminder-message`, `belso-iranytu-weekly-answers`,
`belso-iranytu-weekly-skip`, `belso-iranytu-gratitude`,
`belso-iranytu-education-read`, `belso-iranytu-seen-lessons`,
`belso-iranytu-achievements-seen`, `belso-iranytu-experiments-v1`,
`belso-iranytu-feature-flags-v1`, `belso-iranytu-background`,
`belso-iranytu-install-banner-dismissed`, `belso-iranytu/weather-cache/v1`,
`belso-iranytu/weather-places/v1`, `belso-iranytu:cardStates`,
`belso-iranytu:openai-key`, `belso-iranytu-export.csv` (download artefact),
`belso-iranytu-mentes(.json)` (backup file names), plus the OPFS/IndexedDB
handles behind the backup file picker.

## 3. Test inventory (measured)

- 98 test files, **2972 tests**, 91 213 expect() calls, all green — including
  the PROJECT-INVENTORY guard, which the branch's own commit 6 brought back by
  re-measuring every number this audit also quotes.
- Structure: 50 files in `tests/`, plus `tests/lib` (34), `tests/components`
  (8), `tests/views` (4) and `tests/integration` + `tests/migration` (2) —
  48 more.
- The suites: per-module units, the two full-system volumes (15 journeys and
  30, each accompanied by five mutations — volume one's applied and reverted by
  hand, volume two's automated as tests that turn red when the mutation is
  re-applied), the i18n sweep guards (generated document byte-identity), the
  contrast guards (card track walk, stack rules), the inventory guard (every
  number re-measured), accessibility names, typography, PDF (real-jsPDF
  subprocess probe), backup crypto vectors.
- Gates per commit: `tsc -b --noEmit` + `bun test` + `vite build`.

## 4. Known limits

- **No browser in CI.** No jsdom anywhere by design: `renderToStaticMarkup`
  proves wiring, not pixels. Visual/interactive testing is manual.
- **Contrast numbers are worst-case composites**, over an adversarial
  picture and the most hostile tint — a bound, not a promise per photograph.
- **Muted ink stops early** on a hostile backdrop (measured 8–24% ceiling);
  the card slider itself runs 0–100%.
- **en/de catalogues are partial**; `t()` falls back to Hungarian. No
  language switcher ships yet.
- **Weather/food AI need network**; everything else is fully offline. The
  food-AI key leaves the device only to OpenAI over TLS.
- **PDF fold** is the offline path (jsPDF built-ins cannot draw ő/ű); the
  embedded subsetted font is the normal path and is proven in a subprocess
  against the real library.
- **Voice parsing** is keyword-based offline; accents and free phrasing
  degrade it (by design, no network).

**Correction, measured after this audit was written:** the line above used to
say `--ring-ok/-warn/-bad` were written and unread. They are not — Batch 13
commit 10 consumed them (the balance ring's three tones, the three mood-curve
series), `tests/lib/ring-tokens.test.ts` guards both directions, and the
`full-system` exemption that named them is gone. The two places a reader would
expect a ring token are already palette-driven through `--accent` (the focus
ring) and `--danger` (the validation tone) — the very tokens
`applyThemeTokens` writes the ring aliases from, so rewiring them would change
no pixel while binding generic UI states to state-named aliases.

## 5. Open items

- The preview vs app parity for the background picker relies on the same
  one-argument veil; a visual pass on a real device is still the user's.
- en/de catalogue completion and the language switcher behind
  `resolveLocale`.
- Retired-icon-set notice copy lives in the icon set module (Hungarian,
  keyed like the fonts' when the icon sweep round lands).

## 6. Roadmap — what comes next

1. **GAD-7**, on the PHQ-8's scaffold — the user chose this for the next batch:
   consent → 7 items → 0–21 → descriptive bands → log → disclaimer, with a
   validated Hungarian source or, failing that, text the user signs off on.
2. **i18n round 17+**: the `.ts` modules the generated list now names under
   *chrome — a round is owed* (weather, the icon-set retirement notice, the
   onboarding tracker labels), then en/de to 100% and the switcher UI.
3. **Backup hardening UX**: recovery-code rehearsal flow (dry-run restore).
4. **Data depth**: year-over-year comparison in insights; CSV column
   documentation page for round-tripping into spreadsheets.
5. **Store hygiene**: attachment data URLs → OPFS blobs for large media
   (already the backup file handle direction).

Closed on this branch, so the next reader does not re-plan them: the ring
aliases (consumed, and now measured rather than asserted), and the `.ts`
inventory in `docs/i18n-sweep-list.md` (42 modules, 1298 literals, each one
classified).

Done on this branch, listed here so the next reader does not re-plan it: the
inventory re-measure (commit 6) and the two `.ts` i18n sweeps (commits 1–2).
