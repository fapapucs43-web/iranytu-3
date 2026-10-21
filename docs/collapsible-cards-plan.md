# Collapsible kártyák – audit + konverziós terv (Fázis 2, Commit 1)

Dátum: 2026-10-12  
Ág: `feature/audit-collapsible-themes`  
Kapcsolódó dokumentum: `docs/app-audit-2026-10.md` (Fázis-1 audit), `src/lib/cardStates.ts` (Batch 11 állapotkezelés), `src/components/ui/ui.tsx` (`CollapsibleCard` definíció).  
Félkész: ez a dokumentum a Commit 1 tartalma. A kód nem változik.

---

## 1. Cel és követelmények (kb. a user specje)

- **Perzisztáló összecsukhatóság** minden fül belső csempéjeinél, ahol ezt a felhasználói élmény indokolja.
- Állapot kulcs: `belso-iranytu:cardStates` (egyesített kulcs, nem N kulcs).
- Alapértelmezett állapot: **collapsed** (nyitott csak akkor, ha a felhasználó kifejezetten nyitotta meg utoljára).
- A „Minden adat törlése” törölje a `cardStates` kulcsot is, hogy a törlés után a kártyák ne a régebben beállított nyitott/aktuális állapotban spawlnának.
- Additive only, 0 új runtime dependency.
- Gate: `typecheck + bun test + build` minden commit után.

---

## 2. Jelenlegi állapot – eszközök

### 2.1 `CollapsibleCard` (ui.tsx)
- Lazy + memoised állapotkezelés `loadCardStates()[id]` alapján.
- `id` **kötelező**; tárolási/ARIA-azonosító.
- `summary` egy sötétített sor a fejléc alatt; ha nincs, nincs is (nem őrzi a komponens).
- Közvetlen (write-through) `setCardCollapsed(id, next)` minden toggle-nél.
- CSS: `.collapsible-card-*` osztálycsalád, grid-row animáció.

### 2.2 `Collapsible` (ui.tsx)
- Session-local state (`useState(defaultOpen)`), `defaultOpen` alapból `false`.
- Egy `CollapsibleCardComponent` nem használja a perzisztált kulcsot.
- Főleg a ToolsView `ToolDrawer` és egyéb session-collapse-oknál használják.

### 2.3 `cardStates`
- Kulcs: `belso-iranytu:cardStates`, `{ id: collapsed }`.
- `resetCardStates()`: törlés (cache is, storage is), ez hivható a „minden adat törlése” után.
- `loadCardStates()` első read memoizes.

### 2.4 Félreérthetőségek / határok
- Nem minden `Card`-ra van értelme: pl. a pillangó/címformázású menüelemek, gombok, egy soros infóelemek.
- A tervben a *konvertálhatóság* kritériuma: tartalom mérete és felhasználtatlan betekinthetőség / összecsukható összefoglaló.

---

## 3. Fülről-fülre listázás (aktuális állapot)

### 3.1 Ma (TodayView)

| Kártya / elem | Szereplés | Jelenleg CollapsibleCard? | Kéne CollapsibleCard? | Megjegyzés (ha nem) |
| --- | --- | --- | --- | --- |
| Mood csempe | Card | Nem | Igen (összefoglaló + későbbi összetett mood flow) | `Card`; most egy rövid összefoglaló és a flow CTA van benne, de ha a lehetséges összetett vizualizáció eléri, össze lehetne szuktani |
| Balance csempe | Card | Nem | Nem (egyéb, és gyors láthatóság kell) | Egyszerű skóra; összecsukhatóra nincs szükség, mert a tartalom rövid |
| Activities csempe | Card | Nem | Nem (cím+névjegy) | Gyors pillango; összecsukható nem leginkább |
| TrackerInputs (beleértve a meal/sport tippeket) | Card nem, a Card-ban belül jelenik meg a beviteli tartalommal | Nem | Igen | Ez a „tevékenység/hangulat”-bevitel összecsukhatóvá téve tárterületet spórol, mert a TrackerInputs sok mezőt foglalt |
| DailyGoals | Card (komolyabb) | Nem | Igen | Célkártya, összecsukható |
| AttachmentPicker | Nem kártya | Nem | Nem (bevitel) | Kártya-viselkedésen kívül esik |
| WeeklyReflectionCard | Card jellegű (nem CollapsibleCard) | Nem | Igen | Csempe; összecsukható |
| NutritionTip / SportTip | Nem kártya (sörényes) | Nem | Nem | Jelenleg nem belső tartalomként |

### 3.2 Napló (JournalView)

| Kártya / elem | Szereplés | Jelenleg CollapsibleCard? | Kéne CollapsibleCard? | Megjegyzés (ha nem) |
| --- | --- | --- | --- | --- |
| Calendar Card (havi naptár) | Card | Nem | Nem (szemléltetés) | A vizualitás központi, és kell lennie a labirintusban |
| Search `Collapsible` | Collapsible | Nem (session) | Nem (session, nincs perzisztálás szükséges) | A keresés felülete mejor sessionba, összecsukható van, de ha a felhasználó mindig nyitotta, érdemes a perzisztálásnál vizsgálni |
| Entries Card (lista) | Card | Nem | Igen | Összecsukható; a lista hossza miatt tér-takarékosság |
| EntryDetail | Nem kártya (overlay) | Nem | Nem | Overlay, nem a collapsible-osztályban |

### 3.3 Elemzés (InsightsView)

| Kártya / elem | Szereplés | Jelenleg CollapsibleCard? | Kéne CollapsibleCard? | Megjegyzés (ha nem) |
| --- | --- | --- | --- | --- |
| Week Card (statisztikák) | Card | Nem | Nem (gyors áttekintés) | Rövid összefoglalás |
| YearInPixels | Card | Nem | Nem (vizualitás) | Az egész időszak vizualizációja; nem kell összecsukni |
| Trend Card (grafikon) | Card | Nem | Nem (grafikon látszódjon) | Grafikon és rája írt elemzés; letakarásnál elveszik az információ |
| Correlation Card | Card | Nem | Nem (egyéb) | Rövid lista |
| LagAnalysisCard | Card | Nem | Igen (ha van benne összesítés) | Vizsgálni, hogy a tartalom ideális-e |
| QuadrantInsightCards | Card | Nem | Nem (kis kártyák) | Különálló elemek |
| ReportExport | Card | Nem | Nem (műveletjelleg) | Export gombok; összecsukható nem kell |
| MonthlyYearlyStats | Card | Nem | Nem (táblázat-os) | Statisztikák összegezése |
| AchievementsCard | Card | Nem | Nem (táblázat) | Értékelések listája |
| CorrelationGrid | Card | Nem | Nem (rács) | Rács megjelenítése; összecsukható nem |
| PatternInsightsCard | Card | Nem | Nem (rövid lista) | Mintázatok |
| More `Collapsible` | Collapsible | Nem (session) | Nem (van, session) | Van `Collapsible`; a perzisztálás opcionális, a spec szerint |
| Collapse háttér (ha van) | - | - | - | Látható a „tudatossági” összefoglaló; itt a CollapsibleCard profitálhat |

### 3.4 Felfedezés (ToolsView)

| Kártya / elem | Szereplés | Jelenleg CollapsibleCard? | Kéne CollapsibleCard? | Megjegyzés (ha nem) |
| --- | --- | --- | --- | --- |
| BreathingExercise | ToolDrawer belső (nem kártya, nem Card) | Nem | Nem (egyik modul, nem össze-vagy) | A ToolDrawer egyálló elem |
| MeditationPicker | ToolDrawer belső | Nem | Nem | Modul |
| CbtForm | ToolDrawer belső | Nem | Nem | Modul |
| MiniReflection | ToolDrawer belső | Nem | Nem (form) | Form |
| GratitudeJournal | ToolDrawer belső | Nem | Nem | Naplómodul |
| DailyQuestionCard | ToolDrawer belső | Nem | Nem (napi kérdés) | Napi elem |
| MiniVitals | ToolDrawer belső | Nem | Nem (bevitel) | Beállítás |
| MiniMeds | ToolDrawer belső | Nem | Nem (lista) | Gyógyszerek |
| WorkoutPrograms | ToolDrawer belső | Nem | Nem (programok) | Programok |
| FitnessCard | ToolDrawer belső | Nem | Nem (komplex) | Fitness kártya |
| FoodPhotoCapture | ToolDrawer belső | Nem | Nem (tárolás) | Fénykép rögzítés |
| NutritionCard | ToolDrawer belső | Nem | Nem (kártya) | Táplálkozás |
| HabitStreaks | ToolDrawer belső | Nem | Nem (tömb) | Szokások |
| AssessmentModule | ToolDrawer belső | Nem | Nem (kifejezés) | Kifejezés |
| Gad7Card | ToolDrawer belső | Nem | Nem (kártya) | GAD7 kártya |
| settings-nutrition-tips (`CollapsibleCard`) | CollapsibleCard | **Igen** | Igen (már CollapsibleCard, spec szerint collapsed) | Megfelel a spec-nek; ez a `CollapsibleCard` használat példája |
| settings-sport-tips (`CollapsibleCard`) | CollapsibleCard | **Igen** | Igen | Hasonló, már összecsuklós |
| EducationLibraryCard | ToolDrawer belső | Nem | Nem (táblázat) | Tankönyvek |
| ExperimentCard | ToolDrawer belső | Nem | Nem (kísérlet) | Kísérletek |

### 3.5 Beállítások (SettingsView)

A SettingsView több kártyát tartalmaz, és ezekből sok `Card`, néhány `CollapsibleCard`. A részletes listázásra a SettingsView kódrészt kellene elemezni, mert itt a kártyák többségét nem kell „összecsukni”. A tervben a konvertálható kártyákat később feltüntetjük, ha a perzisztálás értelmét viszi.

---

## 4. Konverzió szabványok (milyen feltételek mellett alakítunk át)

- **Cél**: aggregálódó tartalom, nagyobb tér-foglalás, összefoglalóval jelenítve meg (pl. TrackerInputs, Entries, napi célok, weekly reflection, achivements listák).
- **Nem** konvertáljuk:
  - kizárólag vizualizációs / egy soros / gombos kártyákat, ahol a letakarás elveszítené az egyetlen információt;
  - session-only elemeket, ahol a perzisztálás nem szükséges (pl. a keresés `Collapsible`-e, a `More` collapsible-e — de a spec szerint a Perzisztálás a fenti `CollapsibleCard` típushoz kötődik);
  - formokat, ahol a bezárás frusztrálná a bevitelt.
- A konvertált kártyáknak **id**-je kell legyen (stabil string).
- A `summary` tartalma legyen konzisztens: összefoglalósor a kártya tetején, ahol van adat; ha nincs, a collapsible card-ben a `summary` nem jelenik meg (vagy összefoglaló nélküli default).
- A perzisztálás üzemmódja: `setCardCollapsed(id, next)` minden toggle-nél, tehát a állapot storage nélkül is friss, reload-nál pedig az `cardStates` állapota van.

---

## 5. Konverzió-terv (konkrét)

### 5.1 Ma – konvertálható kártyák
1. **TrackerInputs-kártya (beágyazva a `Card` jelenleg)** → `CollapsibleCard` típusra, `id="today-trackers"`, `summary` nélkül vagy rövid aktivitás-összefoglalóval.
2. **DailyGoals** → `CollapsibleCard`, `id="today-daily-goals"`, `summary` lehet a heti cél / napi cél összesítése.
3. **WeeklyReflectionCard** → `CollapsibleCard`, `id="today-weekly-reflection"`, `summary` lehet a kérdés / érték.
4. **Entries Card (lista)** → `CollapsibleCard`, `id="journal-entries"`, `summary` lehet a találatok száma.

### 5.2 Napló
- A **Search** és **More** `Collapsible` elemek perzisztációjával lehet később tárgyalni (ha a spec szerint kell), de a terv szerint itt nem tesszük fel a konverziót, mert a session collapse-ok jellege eltérő.

### 5.3 Elemzés
- **LagAnalysisCard** esetleges konvertálása `CollapsibleCard`-é, ha a tartalom tömöríthető, `id="insights-lag"`.
- **Correlation / stb.** a fenti listánév szerint nem kerül konvertálásra, mert a tartalom rövid / vizualitás.

### 5.4 Felfedezés
- A `settings-nutrition-tips` és `settings-sport-tips` már `CollapsibleCard`; ezeket **nem kell** konvertálni.
- Néhány több tartalmú kártya perzisztálhatóvá tehető lehet, pl. a `FitnessCard` és `NutritionCard` összecsukhatóvá téve, de ezeket a spec szerint az első körben nem feltétlenül kell megvalósítani; a terv szerint azokat későbbi iterációban tárgyaljuk, ha szükséges a felhasználói tér.
- A `WorkoutPrograms` / `Gad7Card` összecsukhatóságának biztosítása opcionális; azelőtt, hogy konvertálnánk, vizsgálni kell, hogy a `CollapsibleCard`-val megjelenő összefoglaló hasznos lenne-e.

### 5.5 Beállítások
- Itt a konvertálás célja: egyéni beállításokat igénylő, hosszabb kártyák perzisztálhatóvá tétele; ha van különálló beállítás-kártya, ami hosszabb tartalmat foglal, konvertálható.
- A konkrét listát a SettingsView kódrész élesítése adja; a tervben később felsoroljuk, ha tudjuk.

---

## 6. Perzisztálás és „Minden adat törlése”

### 6.1 `belso-iranytu:cardStates`
- Az állapotkezelésnek a meglévő kulcs (`cardStates`) mintájára kell működnie.
- Minden konvertált kártya `toggle` esetén `setCardCollapsed(id, next)` hívással ír a storage-be és cache-be.
- Az alapértelmezett állapot: collapsed (ha nincs adat a storage-ban, az állapot `collapsed`-ként kezelendő).

### 6.2 „Minden adat törlése” lépés
- A SettingsView törlő funkciója számára: a törlés végrehajtása után explicit `resetCardStates()` hívása (vagy hasonló mechanizmus).
- Ezzel határozzuk meg, hogy a perzisztált állapotok törlése a teljes törlés része.
- A teszt: a „everything delete” utána a cardStates storage kulcs nem marad meg; a rendszer újrakezdetben a collapsed alapállapotot használja.

---

## 7. Tesztelés (félreérthető, minden kártya)

- **CollapsibleCard használat**: minden konvertált kártya `id`-vel rendelkezik és a `CollapsibleCard`-t használ.
- **Perzisztálás**: állapot elmentése / visszaállítása reload szimulációval vagy cache-reset után.
- **Reset**: „minden adat törlése” után a `cardStates` kulcs hiányzik, a kártyák collapsed állapotban indulnak.
- **Kivételek**: olyan kártyák, amiket nem konvertáltunk, nem használják a perzisztált állapotot (ill. a `Collapsible`-e session, ez a terv szerint marad).

---

## 8. Ajánlott további lépések

1. **SettingsView kártya-listázás**: konkrét, elemezhető kártyák azonosítása a perzisztálható kártyák részére.
2. **CollapsibleCard konverzio az első körhöz**: TrackerInputs, DailyGoals, WeeklyReflection, Entries.
3. **Reset kezelés**: a „minden adat törlése” utána a `resetCardStates` hívás beépítése.
4. **Tesztelés**: a perzisztálás és reset működése; gate előtt.

---

## 9. Javaslat alternatív dokumentálásra

- Ha a konverzió lista hosszabb lesz, érdemes az összes konvertált kártyát a `docs/collapsible-cards-plan.md` fájlban tartani, a `docs/app-audit-2026-10.md` pedig csak az auditot.
- A fenti konkrét terv (Konverzió-terv, Perzisztálás és a „minden adat törlése” kezelés) felkerül a választott fájlhoz.

---

## 10. Kapu (gate)

- `bun typecheck` – tiszta.
- `bun test` – zöld.
- `bun run build` – zöld.
- Ezt a dokumentumot (vagy a választott fájlt) a Commit 1 tartalmazza.

---

**Megjegyzés**: Ez a dokumentum *terv*. A konkrét implementációt (Commit 2) **nem** tartalmazza, csak az auditot és a tervet a konverzióhoz, perzisztáláshoz és resethez.

---

## 11. Fázis 2b – végrehajtás (a terv felülvizsgálata után)

A felhasználó kérése felülbírálta a 3. szakasz „kéne-e” oszlopát: **minden fül
minden kártyája összecsukható**, kivéve a hangulat-rögzítő (2×2-es rács), mert
interaktív. Az állapot mindenhol a `belso-iranytu:cardStates` kulcsban
perzisztál, alapértelmezett: collapsed.

### 11.1 Az új kártyák és azonosítóik

| Fül | Kártya | id | Összefoglaló |
| --- | --- | --- | --- |
| Ma | Egyensúly | `today-balance` | `today.balance.high/mid/low` |
| Ma | Tevékenységek | `today-activities` | `today.activities.note` |
| Ma | Mai mikrolecke | `today-lesson` | a kváns címkéje |
| Napló | Naptár | `journal-calendar` | `journal.calendar.summary` (új) |
| Elemzés | Hét | `insights-week` | `insights.week.summary` (új, {score}/{days}) |
| Elemzés | Év pixelekben | `insights-year` | `insights.year.summary` (új) |
| Elemzés | Görbe | `insights-trend` | `insights.trend.summary` (új) |
| Elemzés | Korreláció | `insights-activity-correlation` | `insights.correlation.summary` (új) |
| Elemzés | Érzés-kontextus | `insights-emotion-context` | `quadrants.emotion.listLabel` |
| Elemzés | Alvás kvadráns | `insights-quadrant-sleep` | `quadrants.sleep.listLabel` |
| Elemzés | Mintázatok | `insights-patterns` | `insights.patterns.count` / `insights.notEnoughData` |
| Felfedezés | Légzés | `tools-breathing` | `tools.breathing.summary` (új) |
| Felfedezés | Meditáció | `tools-meditation` | `tools.meditation.summary` (új) |
| Felfedezés | CBT | `tools-cbt` | `tools.cbt.summary` (új) |
| Felfedezés | Hálanapló | `tools-gratitude` | `tools.gratitude.intro` |
| Felfedezés | Szokások | `tools-habits` | `tools.habits.intro` |
| Felfedezés | Edzéstervek | `tools-workouts` | `tools.workouts.intro` |
| Felfedezés | Kísérlet | `tools-experiment` | `tools.experiment.intro` |
| Felfedezés | Tankönyvtár | `tools-library` | a nyitott cikk címe / `tools.library.intro` |
| Beállítások | Mentés | `settings-backup` | `backup.summary` (új) |
| Beállítások | PIN | `settings-pin` | `settings.pin.privacyNote` |
| Beállítások | Emlékeztető | `settings-reminder` | `reminder.intro` |
| Beállítások | Frissítés | `settings-update` | `update.note` |
| Beállítások | Telepítés | `settings-install` | `install.offered` / `install.notOffered` |
| Beállítások | Saját téma | `settings-custom-theme` | `theme.custom.note` |
| Beállítások | Saját trackerek | `settings-custom-trackers` | `customTrackers.intro` |
| Beállítások | Gyógyszeridők | `settings-med-times` | `meds.times.empty` / `meds.times.reminderNote` |

A 9 új kulcs mindhárom nyelven (hu/en/de) megvan; a teljes szókincs a
`tests/lib/collapsible-audit.test.ts` pin-elt listájában.

### 11.2 Egymást kizáró ágak, egy id

Három kártya két return-ponton élt (tankönyvtár: index vs. cikk; telepítés:
avan vagy nincs ajánlat; gyógyszeridők: üres vs. szerkesztő). Egymást
kizáró ágak, ugyanarról a kártyáról, ezért **egy** `CollapsibleCard`-ba
lettek vonva, egyetlen id-vel — két mount ugyanazzal az id-vel a guard
szerint egy két kártyát összevonó hiba lenne.

### 11.3 Ami szándékosan NEM változott

- A hangulat-rögzítő (2×2-es rács) a `today-mood` kártya belsejében maradt,
  ahogy a `RecordingFlow` telített képernyője is.
- A `CrisisCard` továbbra sem összecsukható: a segítség útjának egy kattintás
  mögé rejteni nem opció (`tests/lib/crisis-card.test.tsx` védi).
- A `Collapsible` (session-jellegű) elemek – Napló keresés, Elemzés „További
  felismerések”, az öt Eszköztár-drawer és az edzésprogramok belső blokkjai –
  szándékosan a régi primitíven maradtak.
