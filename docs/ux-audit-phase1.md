# UX audit, Phase 1 — menus and tabs

What every function is, where it lives today, and which of those places are wrong.

**Method: counting, not impression.** A card that claims to be a setting must
contain a control. So for every card on every tab this audit counted two things
mechanically — how many interactive elements (`button`, `input`, `select`,
`Toggle`, `Slider`, `Checkbox`) it renders, and how many child components it
mounts. A card with zero of both is not a setting; it is text wearing a
settings screen's chrome. Every finding below names the line range it was
measured on, so the number can be re-derived rather than believed.

This is an audit. It changes nothing.

---

## 1. Where everything is today

### Ma — 6 sections plus a 12-item toolbox

| Section | Source |
| --- | --- |
| Mood entry, attachments, voice capture | `TodayView.tsx:213` `today.mood.title` |
| Balance ring | `TodayView.tsx:321` `today.balance.title` |
| The quadrant's micro-lesson | `TodayView.tsx:346` `MicroLessonCard` |
| Activities, trackers, daily goals | `TodayView.tsx:349` `today.activities.title` |
| Weekly reflection | `TodayView.tsx:391` `WeeklyReflectionCard` |
| **Eszköztár** | `TodayView.tsx:404` `today.toolbox.title` |

The toolbox holds twelve: `CustomActivityManager`, `BreathingExercise`,
`MeditationPicker`, `WorkoutPrograms`, `FoodPhotoCapture`, `WeeklyNutritionCard`,
`HabitStreaks`, `CbtForm`, `ExperimentCard`, `EducationLibraryCard`,
`GratitudeJournal`, `DailyQuestionCard`.

None of the twelve writes a setting. The one that reads one, `FoodPhotoCapture`,
reads `settings.foodAiEnabled` to decide whether it is on, and writes none.

### Napló — 3 sections

Month calendar `JournalView.tsx:54` · search `JournalView.tsx:122` · the entries
list and its detail `JournalView.tsx:142`.

### Elemzés — 3 cards, 7 self-titling blocks, 1 collapsible

`insights.week` (YearInPixels) `InsightsView.tsx:95` · `insights.trend`
`InsightsView.tsx:122` · `insights.correlation` `InsightsView.tsx:192` ·
`LagAnalysisCard` · `QuadrantInsightCards` · `ReportExport` ·
`MonthlyYearlyStats` · `AchievementsCard` · `CorrelationGrid` ·
`PatternInsightsCard` · `insights.more` `InsightsView.tsx:236`.

The seven are not missing headings: each wraps itself in a `Card` or
`CollapsibleCard` and carries its own title.

### Beállítások — 16 collapsible sections plus the crisis card

| Section | Line | Controls | Child components |
| --- | --- | --- | --- |
| profil | 226 | 2 | — |
| akadálymentesség | 258 | 2 | — |
| betűtípus | 286 | 0 | `FontPicker` |
| ikonkészlet | 295 | 0 | `IconSetPicker` |
| navigáció | 304 | 4 | — |
| téma | 375 | 1 | — |
| háttérkép | 411 | 0 | `BackgroundImagePicker` |
| **táplálkozási tippek** | 436 | **0** | **none** |
| **sportolási tippek** | 454 | **0** | **none** |
| nyomonkövetés | 469 | 1 | `CustomTrackerManager` |
| modulok | 525 | 5 | `WeatherApiCard`, `FoodAiSettingsCard`, `HealthImportCard` |
| hangulat | 568 | 2 | `AssessmentConsent` |
| emlékeztetők | 617 | — | `ReminderCard` |
| gyógyszeridőpontok | 619 | — | `MedicationTimesCard` |
| telepítés | 621 | — | `InstallCard` |
| zárolás | 623 | — | `PinLockSettings` |
| mentés | 625 | — | `BackupSettingsCard` |
| hangból bejegyzés | 627 | — | `VoiceIntake` |
| adatok | 634 | — | `DataSection` |
| adatvédelem | 640 | 9 | — |

The three cards showing zero controls (betűtípus, ikonkészlet, háttérkép) are
correct: each mounts a real picker component and the controls live inside it.
Only two are genuinely empty, and they are the finding below.

---

## 2. Findings

### 2.1 Two content cards are living in the settings screen

`settings.nutrition` (436–453) and `settings.sport` (454–468) render **zero
interactive elements and zero child components** — an icon, some paragraphs and
two example lists each. There is nothing in them to configure.

They are also not the only place this content exists. `NutritionTip` and
`SportTip` already render the same guidance on the Ma tab, from the same
`lib/nutritionTips` and `lib/sportTips` modules. So the reader meets the same
two topics twice: once as content where the other tips live, and once inside
Beállítások, in a collapsible that opens onto paragraphs.

A settings screen is where you change how something behaves. These two change
nothing. They are reading, and reading already has a home.

### 2.2 Two parallel "your own vocabulary" screens, on two different tabs

| | Mounted in | Storage |
| --- | --- | --- |
| `CustomTrackerManager` | Beállítások, `settings.trackers` (469) | `belso-iranytu-custom-trackers` |
| `CustomActivityManager` | Ma, inside the toolbox (399) | `belso-iranytu-custom-activities` |

Same shape: define your own list, stored under its own key, capped at the same
kind of limit, and neither writes a setting. One of them is filed as a setting,
the other as a tool. Nothing in either screen tells the reader that the other
exists, so which one you open is a coin flip.

The trackers are already in the card that also holds the activity manager in the
approved map, so after this change there is one place to look for both.

### 2.3 Thirteen card titles bypass the translation catalogue

Eleven components render their own `<Card title="…">` with a raw Hungarian
literal instead of a catalogue key. Only `BackupSettingsCard` uses `t()`.

| File | Raw title |
| --- | --- |
| `ReminderCard.tsx:63` | Napi emlékeztető |
| `MedicationTimesCard.tsx:54` | Gyógyszeridőpontok |
| `InstallPrompt.tsx:72` | Alkalmazásként |
| `PinLockSettings.tsx:83` | Zárolás |
| `CustomTrackerManager.tsx` | Saját nyomonkövetők |
| `CustomThemeEditor.tsx` | Saját téma szerkesztése |
| `DailyGoals.tsx` | Mai célok |
| `WeeklyReflectionCard.tsx` | Heti reflektálás |
| `YearInPixels.tsx` | Hangulat-naptár |
| `QuadrantInsightCards.tsx` | Érzés és kontextus |
| `QuadrantInsightCards.tsx` | Kvadráns és alvás |

Four of the five cards this audit proposes re-grouping are on that list, which
is why it belongs here rather than in Phase 4: the re-grouping gives each card a
name, and the name has to come from the catalogue or it cannot be translated.

---

## 3. A correction to the finding reported verbally

The walkthrough that preceded this document described a card titled
„Kikapcsolod?" holding six unrelated things. **That was wrong, and the count was
wrong too.**

There is no such card. `settings.disable.title` is the title of the
`ConfirmDialog` at `SettingsView.tsx:607` — the "are you leaving?" confirmation.
`ReminderCard`, `MedicationTimesCard`, `InstallCard`, `PinLockSettings` and
`BackupSettingsCard` each wrap themselves in their own `<Card>` and render as
five separate sections at lines 617–625.

The approved map still stands, and it turns out to be exactly right for the real
structure: these five need grouping and consistent naming, not extraction from a
mixed bag. What changed is the reason — not "one card holds six things", but
"five cards float between two sections with no common heading, and four of the
five name themselves in a way no translation can reach."

---

## 4. The target map, as approved

| Moves to | From | Why |
| --- | --- | --- |
| Ma → toolbox, beside `WorkoutPrograms` and the weekly nutrition card | Beállítások → táplálkozási tippek | zero controls; it is reading; the same content already ships on Ma |
| Ma → toolbox, beside `WorkoutPrograms` | Beállítások → sportolási tippek | the same |
| Beállítások → `settings.trackers`, beside `CustomTrackerManager` | Ma → toolbox → `CustomActivityManager` | same kind of screen, same kind of storage, two tabs apart |
| Beállítások → `settings.trackers` | the five floating cards → `MedicationTimesCard` | medication times are tracking, not leaving |
| Its own card, **Telepítés** | the five floating cards → `InstallCard` | a device concern with no other home |
| Its own card, **Biztonság** | the five floating cards → `PinLockSettings` | a setting that deserves a name of its own |
| Its own card, **Mentés és export** | the five floating cards → `BackupSettingsCard` | data, not exit |
| Its own card, **Emlékeztetők** | the five floating cards → `ReminderCard` | reminders are not about leaving |

Net effect in Beállítások: two cards removed, four added, one group absorbed,
nothing leaves the app.

Nothing moves out of the app. No feature is deleted, no screen is lost, and no
stored key changes — the moves are mount-point changes, not data migrations.

---

## 5. What this audit recommends leaving alone

**The crisis card at the top of Beállítások, above even the profile card.**
It looks like the clearest case of "not a setting in the settings screen", and it
is not. The comment above it says why, and the reason is right:

> a route to help behind a tap is not a route to help

It is reachable in four places — the full card in Beállítások and on the
consent screen, the compact `CrisisStrip` on a questionnaire result and on a
journal entry (`EntryDetail.tsx:13`, `AssessmentResult.tsx:24`,
`AssessmentConsent.tsx:45`, `SettingsView.tsx:222`). That reachability is the
point: until Batch 13 the resources were only reachable by opting into the
questionnaire first, which is backwards. Folding it into a collapsible would
bury the one card that must never be behind a tap.

Moving it would be optimising the appearance of the settings screen at the cost
of the app's only unconditional route to a crisis line. Not a trade worth
making.

---

## 6. What Phase 1 does not establish

- **Whether the reader actually gets lost.** This is a structural audit: it
  counts controls and mounts. A reader who finds the settings screen perfectly
  clear is not contradicted by any of this.
- **Whether the two prose cards are ever *opened*.** Nobody measured that. If
  they are read, they are read in the wrong place; if they are never opened,
  they are 36 lines of dead weight in a settings screen — which is the stronger
  argument for the same move.
- **The order of the sections.** Phase 3 makes order a reader decision; Phase 1
  only asks whether a section is in the right screen.
