# Teljes összecsukható-audit — minden fül, minden kártya (2026-10)

Ez a dokumentum a felhasználói jelzésre (`„vannak még csempék, amik nem összecsukhatók"`)
adott válasz: **bejárja az összes fület és minden kártyát/csempét**, és minden
egynél eldönti: összecsukható-e ma, és kellene-e lennie.

**Módszer:** forrás-szintű bejárás (nem renderelt DOM) — minden `<CollapsibleCard>`
mount `file:line`-al, minden `toolbox-item`/`card` osztályú, nem emlékező csempe,
minden session-lokális `<Collapsible>` drawer, minden dialógus/lépés. A guard
(`tests/lib/collapsible-audit.test.ts`) a 64 id-t, az egyedi mounts-zámt és a
wipe-láncot rögzíti; ez a dokumentum a *teljes* felület-kép, amire a Phase 2
átalakítás épül. **Ez a fázis read-only: egy sor kód sem változik.**

**Kétféle összecsukható primitive létezik** (`src/components/ui/ui.tsx`):
`CollapsibleCard` — emlékező, tárolt állapot (`belso-iranytu:cardStates`),
alapértelmezett összecsukva, summary sorral — és `Collapsible` — session-lokális
drawer, szándékosan nem emlékező (a korábbi audit döntése: amit az olvasó
egyszer kinyit és bezár, azt rosszabb élmény lenne megjegyeztetni).

A `file:line` hivatkozások a jelen főág (`376164e`) állapotát rögzítik.

## 1. Ma fül (`src/views/TodayView.tsx`)

| # | Fül | Kártya | Fájl | Collapsible? | Kéne? | Indoklás |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Ma | Hangulatrögzítés (`today-mood`) | `src/views/TodayView.tsx:220` | igen | — | Már emlékező kártya; összecsukva a kvadráns-nevet/„miért jó" sort mutatja |
| 2 | Ma | Egyensúly-pontszám (`today-balance`) | `src/views/TodayView.tsx:335` | igen | — | Már emlékező; summary = magas/közepes/alacsony ítélet |
| 3 | Ma | Napi lecke (`today-lesson`) | `src/components/MicroLessonCard.tsx:90` | igen | — | Már emlékező |
| 4 | Ma | Tevékenység-címkék (`today-activities`) | `src/views/TodayView.tsx:371` | igen | — | Már emlékező |
| 5 | Ma | Táplálkozás tracker (`tracker-nutrition`) | `src/components/TrackerInputs.tsx:244` (dinamikus mount) | igen | — | 7 tracker-csoport egy mountból, mind emlékező, summary = rögzített érték |
| 6 | Ma | Alvás tracker (`tracker-sleep`) | `src/components/TrackerInputs.tsx:244` | igen | — | ugyanaz a mount |
| 7 | Ma | Sport tracker (`tracker-sport`) | `src/components/TrackerInputs.tsx:244` | igen | — | ugyanaz a mount |
| 8 | Ma | Lépések tracker (`tracker-steps`) | `src/components/TrackerInputs.tsx:244` | igen | — | ugyanaz a mount |
| 9 | Ma | Tünetek tracker (`tracker-symptoms`) | `src/components/TrackerInputs.tsx:244` | igen | — | ugyanaz a mount |
| 10 | Ma | Vitaminok tracker (`tracker-vitamins`) | `src/components/TrackerInputs.tsx:244` | igen | — | ugyanaz a mount |
| 11 | Ma | Időjárás tracker (`tracker-weather-condition`) | `src/components/TrackerInputs.tsx:244` | igen | — | ugyanaz a mount |
| 12 | Ma | Napi célok (`today-daily-goals`) | `src/components/DailyGoals.tsx:34` | igen | — | Már emlékező; summary = „x/y kész" |
| 13 | Ma | Heti tükör (`today-weekly-reflection`) | `src/components/WeeklyReflectionCard.tsx:63` | igen | — | Már emlékező |
| 14 | Ma | „Üres állapot" tracker-kártya (ha egy tracker sincs bekapcsolva) | `src/components/TrackerInputs.tsx:292` | nem | **nem** | Üres-állapot jelző egy sorban („kapcsolj be trackereket"), nem csempe: nincs mit rejtenie |
| 15 | Ma | Hero-hint (első használat) | `src/views/TodayView.tsx:446` | nem | **nem** | Egyszeri hint-doboz, nem kártya |
| 16 | Ma | NutritionTip / SportTip (egysoros tippek) | `src/views/TodayView.tsx:489,516` | nem | **nem** | `role="status"` egy soros tippek a tevékenység-kártya alatt, nem külön csempe |
| 17 | Ma | RecordingFlow (teljes képernyős rögzítő, 3 lépés) | `src/components/RecordingFlow.tsx:267,362,437` | nem | **nem** | Rögzítő-felület, nem tile: a guard kifejezett kivétele („a mood flow recorder, not a tile") |

## 2. Napló fül (`src/views/JournalView.tsx`)

| # | Fül | Kártya | Fájl | Collapsible? | Kéne? | Indoklás |
| --- | --- | --- | --- | --- | --- | --- |
| 18 | Napló | Streak-sáv („N napos sorozat") | `src/views/JournalView.tsx:217` | nem | **nem** | Státusz-sáv, egy sor: nincs elrejthető tartalma |
| 19 | Napló | Havi naptár (`journal-calendar`) | `src/views/JournalView.tsx:64` | igen | — | Már emlékező |
| 20 | Napló | Keresés/szűrő panel | `src/views/JournalView.tsx:140` | nem (session-lokális `Collapsible`) | **nem** | Szándékos: amit az olvasó egyszer kinyit, hogy keressen, azt nem kell megjegyezni |
| 21 | Napló | Bejegyzéslista (`journal-entries`) | `src/views/JournalView.tsx:163` | igen | — | Már emlékező; summary = találatok száma |
| 22 | Napló | Bejegyzés-részletező (overlay) | `src/views/JournalView.tsx:204` | nem | **nem** | Modális részlet-nézet, nem a lap csempe-sora |

## 3. Elemzés fül (`src/views/InsightsView.tsx` + komponensek)

| # | Fül | Kártya | Fájl | Collapsible? | Kéne? | Indoklás |
| --- | --- | --- | --- | --- | --- | --- |
| 23 | Elemzés | Heti összegzés (`insights-week`) | `src/views/InsightsView.tsx:123` | igen | — | Már emlékező |
| 24 | Elemzés | Év pixelekben (`insights-year`) | `src/components/YearInPixels.tsx:68` | igen | — | Már emlékező |
| 25 | Elemzés | Hangulatgörbe (`insights-trend`) | `src/views/InsightsView.tsx:164` | igen | — | Már emlékező |
| 26 | Elemzés | Tevékenység–hangulat korreláció (`insights-activity-correlation`) | `src/views/InsightsView.tsx:242` | igen | — | Már emlékező |
| 27 | Elemzés | Késleltetett hatás-elemzés (`insights-lag`) | `src/components/LagAnalysisCard.tsx:17` | igen | — | Már emlékező |
| 28 | Elemzés | Érzelem–kontextus kártya (`insights-emotion-context`) | `src/components/QuadrantInsightCards.tsx:27` | igen | — | Már emlékező |
| 29 | Elemzés | Kvadráns–alvás kártya (`insights-quadrant-sleep`) | `src/components/QuadrantInsightCards.tsx:80` | igen | — | Már emlékező |
| 30 | Elemzés | Jelentés / export (`insights-report-export`) | `src/components/ReportExport.tsx:77` | igen | — | Már emlékező |
| 31 | Elemzés | Havi és éves statisztika (`insights-monthly-yearly`) | `src/components/MonthlyYearlyStats.tsx:47` | igen | — | Már emlékező |
| 32 | Elemzés | Elismerések (`insights-achievements`) | `src/components/AchievementsCard.tsx:128` | igen | — | Már emlékező |
| 33 | Elemzés | Korrelációs rács (`insights-correlation`) | `src/components/CorrelationGrid.tsx:44` | igen | — | Már emlékező |
| 34 | Elemzés | Minták (`insights-patterns`) | `src/components/PatternInsightsCard.tsx:44` | igen | — | Már emlékező |
| 35 | Elemzés | Személyes felismerések panel | `src/views/InsightsView.tsx:320` | nem (session-lokális `Collapsible`) | **nem** | Szándékos drawer (korábbi audit) |

## 4. Felfedezés fül (`src/views/ToolsView.tsx`) — 5 drawer, azokban a kártyák

A öt drawer (`therapy`, `self`, `health`, `experiments`, `education`) session-lokális
`Collapsible` (`src/views/ToolsView.tsx:222`) — szándékos, a korábbi audit rögzíti.
A drawer-ek **bennük lévő** kártyái:

| # | Fül | Kártya | Fájl | Collapsible? | Kéne? | Indoklás |
| --- | --- | --- | --- | --- | --- | --- |
| 36 | Felfedezés/Terápia | Légzésgyakorlat (`tools-breathing`) | `src/components/BreathingExercise.tsx:106` | igen | — | Már emlékező |
| 37 | Felfedezés/Terápia | Meditáció-választó (`tools-meditation`) | `src/components/MeditationPicker.tsx:104` | igen | — | Már emlékező |
| 38 | Felfedezés/Terápia | CBT űrlap (`tools-cbt`) | `src/components/CbtForm.tsx:85` | igen | — | Már emlékező |
| 39 | Felfedezés/Önismeret | Rövid önreflexió (MiniReflection) | `src/views/ToolsView.tsx:289` | **nem** | **igen** | *Miért nem:* a Batch 14 költözés előtti `toolbox-item` forma kimaradt a Phase 2b-ből. *Miért kéne:* három input+gomb csempe; a fióktestvérei (CBT, hálanapló) emlékezők — az olvasó minden látogatáskor végiggörgeti |
| 40 | Felfedezés/Önismeret | Hálanapló (`tools-gratitude`) | `src/components/GratitudeJournal.tsx:42` | igen | — | Már emlékező |
| 41 | Felfedezés/Önismeret | Napi kérdés (DailyQuestionCard) | `src/views/ToolsView.tsx:549` | **nem** | **igen** | *Miért nem:* régi `toolbox-item`. *Miért kéne:* csempe kérdéssel + szövegdobozzal; a summary „megválaszolva / még nem" állapotot mutathat |
| 42 | Felfedezés/Egészség | Testi mutatók — alvás/pulzus/HRV (MiniVitals) | `src/views/ToolsView.tsx:344` | **nem** | **igen** | *Miért nem:* régi `toolbox-item`. *Miért kéne:* a README a fül egyik fő elemeként hirdeti; summary = „x/3 érték rögzítve" |
| 43 | Felfedezés/Egészség | Gyógyszer-lista és napi bevételek (MiniMeds) | `src/views/ToolsView.tsx:406,428` | **nem** | **igen** | *Miért nem:* régi `toolbox-item`. *Miért kéne:* summary = „x/y gyógyszer bevéve" — pontosan a felhasználói példa (`3/5 kész`) |
| 44 | Felfedezés/Egészség | Edzéstervek (`tools-workouts`) | `src/components/WorkoutPrograms.tsx:242` | igen | — | Már emlékező (+ programok session-lokális drawer `:253`) |
| 45 | Felfedezés/Egészség | Edzésnapló / fitnesz (`fitness-plans`) | `src/components/FitnessCard.tsx:188` | igen | — | Már emlékező |
| 46 | Felfedezés/Egészség | Étel fotó (`food-photo`) | `src/components/FoodPhotoCapture.tsx:103` | igen | — | Már emlékező |
| 47 | Felfedezés/Egészség | Heti táplálkozás-összegzés (WeeklyNutritionCard) | `src/views/ToolsView.tsx:503` | **nem** | **igen** | *Miért nem:* régi `toolbox-item`. *Miért kéne:* summary = „x nap · y kcal átlag"; biztonsági jelzésnél „jelzés aktív" |
| 48 | Felfedezés/Egészség | Étkezési napló (`nutrition-log`) | `src/components/NutritionCard.tsx:249` | igen | — | Már emlékező |
| 49 | Felfedezés/Egészség | Szokások (`tools-habits`) | `src/components/HabitStreaks.tsx:58` | igen | — | Már emlékező |
| 50 | Felfedezés/Egészség | Önreflexiós kérdőív (AssessmentModule) | `src/components/AssessmentModule.tsx:33` | **nem** | **igen** | *Miért nem:* Batch 6-os `toolbox-item`, megelőzte a Phase 2b. *Miért kéne:* napló+indító gomb csempe; summary = „legutóbb: dátum · pont" vagy „nincs még bejegyzés" |
| 51 | Felfedezés/Egészség | Feszültség és aggodalom — GAD-7 check-in (Gad7Card) | `src/components/Gad7Card.tsx:75` | **nem** | **igen** | *Miért nem:* Batch 14-es `toolbox-item`. *Miért kéne:* 7 kérdés egy képernyőn — a drawer legmagasabb kártyája; summary = „x/7 kitöltve" |
| 52 | Felfedezés/Egészség | Táplálkozási tippek (`settings-nutrition-tips`) | `src/views/ToolsView.tsx:153` | igen | — | Már emlékező (id a Settings-korszakból, szándékosan változatlan) |
| 53 | Felfedezés/Egészség | Sporttippek (`settings-sport-tips`) | `src/views/ToolsView.tsx:167` | igen | — | Már emlékező (id szintén történelmi) |
| 54 | Felfedezés/Kísérletek | Kísérlet kártya (`tools-experiment`) | `src/components/ExperimentCard.tsx:169` | igen | — | Már emlékező |
| 55 | Felfedezés/Tanulás | Oktatóanyag-könyvtár (`tools-library`) | `src/components/EducationLibraryCard.tsx:106` | igen | — | Már emlékező |

## 5. Beállítások fül (`src/views/SettingsView.tsx` + komponensek)

| # | Fül | Kártya | Fájl | Collapsible? | Kéne? | Indoklás |
| --- | --- | --- | --- | --- | --- | --- |
| 56 | Beállítások | Válság-segítség (CrisisCard, kijelölve a lista fölé) | `src/components/CrisisCard.tsx:101`, mount: `src/views/SettingsView.tsx:835` | nem | **nem** | *Szándékos döntés:* „a segítséghez vezető út egy koppintásra nem lehet egy koppintás mögött" — egyszerű kártya, soha nem összecsukható (konszenzus a guard-ban is) |
| 57 | Beállítások | Profil (`settings-profile`) | `src/views/SettingsView.tsx:361` | igen | — | Már emlékező |
| 58 | Beállítások | Nyelv (`settings-language`) | `src/views/SettingsView.tsx:404` | igen | — | Már emlékező |
| 59 | Beállítások | Hozzáférhetőség (`settings-accessibility`) | `src/views/SettingsView.tsx:419` | igen | — | Már emlékező |
| 60 | Beállítások | Betűtípus (`settings-font`) | `src/views/SettingsView.tsx:442` | igen | — | Már emlékező |
| 61 | Beállítások | Ikonkészlet (`settings-iconset`) | `src/views/SettingsView.tsx:451` | igen | — | Már emlékező |
| 62 | Beállítások | Téma (`settings-theme`) | `src/views/SettingsView.tsx:460` | igen | — | Már emlékező |
| 63 | Beállítások | Háttérkép (`settings-background`) | `src/views/SettingsView.tsx:496` | igen | — | Már emlékező |
| 64 | Beállítások | Saját téma (`settings-custom-theme`) | `src/components/CustomThemeEditor.tsx:86` | igen | — | Már emlékező |
| 65 | Beállítások | Navigáció (`settings-navigation`) | `src/views/SettingsView.tsx:531` | igen | — | Már emlékező |
| 66 | Beállítások | Trackerek (`settings-trackers`) | `src/views/SettingsView.tsx:606` | igen | — | Már emlékező |
| 67 | Beállítások | Saját trackerek (`settings-custom-trackers`) | `src/components/CustomTrackerManager.tsx:50` | igen | — | Már emlékező |
| 68 | Beállítások | Saját tevékenységek (CustomActivityManager) | `src/components/CustomActivityManager.tsx:34` | **nem** | **igen** | *Miért nem:* a `settings-custom-trackers` ikertestvére Phase 2-ben emlékező lett, ez a Phase 1-ben kimaradt. *Miért kéne:* ugyanaz a munka (saját címkék kezelése), ugyanazz a joggal; summary = „x saját címke" |
| 69 | Beállítások | Modulok (`settings-modules`) | `src/views/SettingsView.tsx:651` | igen | — | Már emlékező |
| 70 | Beállítások | Allergiák (`settings-allergies`) | `src/components/AllergySettingsCard.tsx:48` | igen | — | Már emlékező |
| 71 | Beállítások | Gyógyszeridőpontok (`settings-med-times`) | `src/components/MedicationTimesCard.tsx:58` | igen | — | Már emlékező |
| 72 | Beállítások | Emlékeztető (`settings-reminder`) | `src/components/ReminderCard.tsx:68` | igen | — | Már emlékező |
| 73 | Beállítások | PIN-zár (`settings-pin`) | `src/components/PinLockSettings.tsx:86` | igen | — | Már emlékező |
| 74 | Beállítások | Biztonsági mentés (`settings-backup`) | `src/components/BackupSettingsCard.tsx:922` | igen | — | Már emlékező |
| 75 | Beállítások | Adat (export/import/törlés) panel | `src/views/SettingsView.tsx:722` | nem (session-lokális `Collapsible`) | **nem** | Szándékos drawer (korábbi audit) |
| 76 | Beállítások | Adatvédelem (`settings-privacy`) | `src/views/SettingsView.tsx:725` | igen | — | Már emlékező |
| 77 | Beállítások | Időjárás-API (`weather-api`) | `src/components/WeatherApiCard.tsx:98` | igen | — | Már emlékező |
| 78 | Beállítások | Étel-MI (`food-ai-settings`) | `src/components/FoodAiSettingsCard.tsx:46` | igen | — | Már emlékező |
| 79 | Beállítások | Egészségügyi import (`health-import`) | `src/components/HealthImportCard.tsx:135` | igen | — | Már emlékező |
| 80 | Beállítások | Hangulatrögzítés módja (`settings-mood-flow`) | `src/views/SettingsView.tsx:760` | igen | — | Már emlékező |
| 81 | Beállítások | Kérdőív hozzájárulás (dialógus) | `src/views/SettingsView.tsx:795` | nem | **nem** | Modális consent-dialógus, nem lapcsempe |
| 82 | Beállítások | Telepítés (`settings-install`) | `src/components/InstallPrompt.tsx:73` | igen | — | Már emlékező |
| 83 | Beállítások | Frissítés (`settings-update`) | `src/components/AppUpdateCard.tsx:62` | igen | — | Már emlékező |
| 84 | Beállítások | Hangból bejegyzés panel | `src/views/SettingsView.tsx:808` | nem (session-lokális `Collapsible`) | **nem** | Szándékos drawer (korábbi audit) |

## 6. Onboarding (`src/components/OnboardingFlow.tsx`)

| # | Fül | Kártya | Fájl | Collapsible? | Kéne? | Indoklás |
| --- | --- | --- | --- | --- | --- | --- |
| 85 | Onboarding | 1. lépés — üdvözlés | `src/components/OnboardingFlow.tsx:69` | nem | **nem** | Varázslat-lépés dialógusban: egyszerre egy lépés látszik, nincs elrejthető tartalom |
| 86 | Onboarding | 2. lépés — trackerek kiválasztása | `src/components/OnboardingFlow.tsx:81` | nem | **nem** | ugyanaz |
| 87 | Onboarding | 3. lépés — téma választás élő előnézettel | `src/components/OnboardingFlow.tsx:106` | nem | **nem** | ugyanaz |
| 88 | Onboarding | 4. lépés — „hogyan működik" | `src/components/OnboardingFlow.tsx:137` | nem | **nem** | ugyanaz |

## 7. RecordingFlow (`src/components/RecordingFlow.tsx`)

| # | Fül | Kártya | Fájl | Collapsible? | Kéne? | Indoklás |
| --- | --- | --- | --- | --- | --- | --- |
| 89 | RecordingFlow | 1. lépés — Mood Meter (10×10 rács) | `src/components/RecordingFlow.tsx:267` | nem | **nem** | Teljes képernyős rögzítő — a guard kifejezett kivétele: „recorder, not a tile" |
| 90 | RecordingFlow | 2. lépés — érzelem-buborékok | `src/components/RecordingFlow.tsx:362` | nem | **nem** | ugyanaz |
| 91 | RecordingFlow | 3. lépés — kontextus-sorok + mentés | `src/components/RecordingFlow.tsx:437` | nem | **nem** | ugyanaz |

Egyéb, lapon kívüli felületek (nem csempe, nem kéne): `StaleWorkerNotice`
(`src/App.tsx:312`, értesítés-sáv), `MedicationReminderScheduler`
(`src/App.tsx:316`, háttér-ütemező, nincs felülete), `AttachmentPicker`
(`src/components/AttachmentPicker.tsx:118` — a `today-mood` kártya belsejében
sor, nem önálló csempe).

## Összesítés

| Felület | Csempe/kártya | Collapsible | Nem collapsible | Kéne |
| --- | --- | --- | --- | --- |
| Ma fül | 13 | 13 | 0 | 0 |
| Napló fül | 2 | 2 | 0 | 0 |
| Elemzés fül | 12 | 12 | 0 | 0 |
| Felfedezés fül (drawer-eken belül) | 20 | 13 | 7 | 7 |
| Beállítások fül | 25 | 24 | 1 | 1 |
| Onboarding (4 lépés) | 0 (varázslat) | 0 | — | 0 |
| RecordingFlow (3 lépés) | 0 (rögzítő) | 0 | — | 0 |
| **Összesen** | **72** | **64** | **8** | **8** |

**Megállapítás:** a felhasználói jelzés igaz, de szűkebb, mint amekkorának
hangzik: a 72 csempe közül 64 már emlékező (`CollapsibleCard`, 64 egyedi id,
`belso-iranytu:cardStates`), a 8 elmaradt **mind a Felfedezés/Beállítások
környékéről** jött — a Batch 14 költözés (`toolbox-item` → drawer) és a Batch 6
kérdőív olyan kártyákat hagytak a régi formában, amelyeket a Phase 2b nem ért
el. A Ma, Napló és Elemzés fülek teljesen lefedettek.

A 8 „kéne" kártya Phase 2-es átalakításához szükséges döntések:
- **Új id-k** (a szótár bővítése, egyik régi nem cserélhető): `tools-reflection`,
  `tools-vitals`, `tools-meds`, `tools-weekly-nutrition`, `tools-question`,
  `tools-assessment`, `tools-gad7`, `settings-custom-activities`.
- **Summary-k** élő állapotból (üres sor tiltva): „x/3 érték rögzítve",
  „x/y gyógyszer bevéve", „x/7 kitöltve", „legutóbb: dátum · pont",
  „megválaszolva / még nem", „x nap · y kcal", „x saját címke".
- **Reset:** a `belso-iranytu:cardStates` törlése a „Minden adat törlése" láncban
  már megvan (`resetCardStates()`, hívja a wipe — a guard rögzíti).
- **Guard-frissítés:** `tests/lib/collapsible-audit.test.ts` id-szótár és
  fájlonkénti mount-számok (ToolsView 2→7, Gad7Card/AssessmentModule/
  CustomActivityManager 0→1).
