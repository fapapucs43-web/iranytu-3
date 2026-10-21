# Belső Iránytű — teljes appaudit (2026-10)

Dátum: 2026-10-12
Ág: `feature/audit-collapsible-themes` (main-től frissitve)
Módszer: minden fül olvasva fájlonként (TSX + CSS + i18n-katalógus + SW), a kulcstartó- és inputlista-konvenciók után.
Csak olvasás: ennél a dokumentumnál nincs kódvaltozás.

---

## 1. Összefoglaló

| Kategória | Darab |
| --- | --- |
| P1 hiba (akadály / tartalmi pontosság / elérhetetlen funkció) | 8 |
| P2 hiba (kell javítani, nem vitatja fel a használatot) | 11 |
| P3 / enyhe konzisztencia-visszajelzés | 6 |
| Anomália (nem baj, de magáras) | 9 |
| Javasolt javítás / kiegészítés | 14 |

A lista nem szerkezeti átírás, csak jelenlegi állapot leírása.

---

## 2. Vizuális / CSS / elhelyezkedés

### P1-1 — Appearance → Ködintenzitás vs kontraszt-nyílászáró felirat
Csak a ködkártya nyílászarája van leírva, élesfokozat nélkül. Ha a felhasználó most魚yいったi動 to ami fogja állítani a vehemény élesítést, ott a kontraszt/élesítésestichetőséget others nơi nélkül. Javaslat: a nyílászáró felirat bővítése, vagy a kártya tetején egy rövid hivatkozás a kontrasztra.

### P2-1 — SettingsView `<Card action>` sorrend (szerkezet)
A SettingsView több kártyánál a `<Card>` csempékben a gomb(action) és a cím(title) egymás mellett vannak, de a reszponzív elrendezés attól függ, mennyi hely van. Ha reszponzívabbá tesszük, a gombok jobbra vagy alá kerülnek ugyanúgy, mert a CSS{cell} alapján működik. Érdemes ellenőrizni az `<Card action>` pozicionálást reszponzív nézetben. (Ez inkább konzisztencia-jelzés, mert a kártya komponens támogatja, de a bekötések egyenetlenek.)

### P2-2 — WeeklyReflectionCard/EducationLibraryCard/CrisisCard méretcselekvés
Ezeknél a csempéknél a belső tartalom árnyéka/kitérések ritkán egyeznek a szomszédos csempéknél (pl. padding 16 vs 12, border-radius eltérés). Nem hibás, csak nem egységes. Javaslat: egyedi kitérések dokumentálása vagy egységesítés.

### P2-3 — CustomThemeEditor alap ablak szín (színátmenet)
Az alap ablak háttérszín alapértelmezett és nincs kapcsolva a saját témához a színválasztó régebben: ez F4 feladat. Ez az auditból származik, nem a current state hibája. (Lásd F4 javaslat.)

### P2-4 — I18N-függő szöveghossz-eltérések
A magyar szövegek a katalógusben bizonyos csomópontokon hosszabbak, mint az angol alapok, és ez néhány kártya címe/felirata elcsúszhat a szélességtől függően (pl. Hellyezés, Beállításaik). Nem hibás, de érdemes ellenőrizni a `Card` és `Collapsible` címeinek behúzódását hosszú szöveggel.

---

## 3. Funkcionális hibák / nem mentődő állapot / nem működő elemek

### P1-2 — SettingsView `resetCardStates` hívása a „minden adat törlése” után
A kártyák fejléce (`CollapsibleCard`) a `belso-iranytu:cardStates` kulcsot használják. Ha a felhasználó törli az összes adatot, a kulcs is törölve lesz, de a törlés után a Cards még mindig a régi állapotukra nyílnak be, mert a perzisztálás nem frissül. Javaslat: a törlés után explicit `resetCardStates()` hívása (vagy a törlő funkció része). Ez F2 kapcsolódó pont.

### P1-3 — `SectionList` reszponzív / reszponzív reszponzív szerkezet
A `SectionList` (Today, Journal, Insights, Tools) a `stored` tömböt használja és `onChange` eseményt használ. A reorder togglenál a `rearranging` flag be van állítva, de a mozgatóelem (drag) reszponzív viselkedése nincs leírva; ha mobilon próbálják meg, a drag reszponzív igazítása szükséges lehet. (Érdemes ellenőrizni touch-drag viselkedést.) Ez inkább a szerkezet commentje, de a felhasználói élmény fordulhat hibává.

### P1-4 — Start után frissítés (PWA) esetén a `forceAppUpdate` előzménye
A PWA regisztrációja és a `forceAppUpdate` létezik, de a felhasználói felületen nincs sietős frissítési gomb, csak a `StaleWorkerNotice` (lásd alá). A felhasználó számára azonnali frissítés csak a bannerben jelezhető. Ha a felhasználó szeretné manuálisan frissíteni, nincsen erre gomb a Settingsben. Javaslat: egy „Frissítés” gomb a Settingsben, ami `forceAppUpdate`-ot hív.

### P2-5 — `StaleWorkerNotice` megjelenésének feltételei
A banner újraindítja az oldalt a `controllerchange`-nél, ha korábban kérte a frissítést, de ha nem kérte, csak megjeleníti. Ha a felhasználó rákattint a bannerre, nincs egyértelmű action, csak az szöveg. Javaslat: banneron egy „Felülírás most” vagy „Megértettem, később” gomb.

### P2-6 — `BackgroundImagePicker` állapotmentése
A háttérképválasztásnál a felrakott kép adat_url-ben marad, de nem ellenőrizhető, hogy a kitöltés (crop/focal) változik-e, és ha a kép törölve van, nincs explicit „hozzáadás” újra gomb egyértelműen látható. Ez inkább a képkezelő átalakítás javaslat.

### P2-7 — TrackerInputs reszponzív/érintési viselkedés
A TrackerInputs több nyílászáró és elem, amelyek reszponzív elemek (checkbox/slider/select). Ha a reszponzív kijelzőn próbálják meg, a közöttük lévő távolságok eltérhetnek. Javaslat: reszponzív elleni touch target ellenőrzés.
 
### P2-8 — Csatatároló mentési megerősítés
Nincs „mentve” jelzés explicit minden mentés után (pl. bejegyzés,-Counter, Tracker). A `notify(t(“today.saved”))` létezik, de a Settings oldalon sehol nincs explicit visszajelzés. Javaslat: mentési megerősítés vagy badge.

### P3-1 — PWA `promptInstall()` állapot
A `useInstallable` hook létezik, a `InstallBanner` is, de a banner időzítése / újra megjelenítésének szabályai nem teljesen le vannak írva. Javaslat: banner viselkedésének tesztje ill. a felhasználónak egyértelmű „slippjegy” görgetése.

---

## 4. Anomáliák / nem oda tartozó elemek / hiányzó elemek

### A1 — I18N kulcsok számosság
A katalógusban ~száznyi kulcs van, de a `AppHeader` és `BottomNav` gyakran `ContentIcon name=...` használ a cím helyett. Ez nem hiba, de a cím/ikon párosítás kiszámítható vagy sem. Javaslat: áttérni a tiszta cím+ikon párosításra, ha το layout változik.

### A2 — `HealthImport` imports mindkét oldalán
Apple Health és Google Fit importok vannak, de nincs megjelenített „import státusz” oldal; a beállításokban csak a kapcsolók vannak. Javaslat: egy kapcsolódó státusz kártya vagy értesítés az import esetleges sikertelenségéről.

### A3 — Kényszeres elemek eloszlása
Néhány modul kapcsolója megjelenik a Settingsben (pl. `moodFlow`, `highContrast`), de a megjelenésük / elhelyezkedésük egyenetlen. Javaslat: modul kapcsolók csoportosítása settings tetején.

### A4 — `ReminderScheduler` / `MedicationReminderScheduler` együttes megjelenése
Mindkettő az App.jsben van, de a hasznosságuk override-jeink nélkül ütközhetnek, mert mindkettő időzítést szeretne. Nem hiba, csak potenciális overlap. Javaslat: együttes kezelés vagy prioritás.

### A5 — `PinLockGate` és `AppLock` két réteg
Az `AppLock` library van, a `PinLockGate` component pedig a megjelenítés. Ez OK, de ha új funkcionalitás (pl. Expresszbeállítás) jön, érdemes egy rétegben tartani.

### A6 — `useBackupScheduler` értesítés megjelenése
A backup-due értesítés `notify`-t használ, de a megjelenítés nem részletezve, hogy mikor jelenik meg pontosan (például csak app open kell). Javaslat: explicit időzítési viselkedés dokumentálása.

### A7 — `IconSetContext` és `FontContext` és `ThemeContext` három külön provider
OK, de a beállítások lapján a betűtípus és ikonhalmaz beállítása nem ugyanabban a kártyában van; könnyebb lenne egy „Appearance” kártya. Javaslat: együttes megjelenítés vagy index.

### A8 — `Recharts` importása csak az InsightsView-ben
Létezik `YearInPixels`, `CorrelationGrid`, de a Charts importja csak az InsightsView-ben van. Ha valaki más oldalon szeretne grafikont, újra kell importálni. Javaslat: közös Chart segédlet, ha többször használnák.

### A9 — `public/sw.js` és a precache-manifest külön
A sw.js és a `precache-manifest.mjs` script kézi lépést igényel a deploymenthez. Ez adott, de érdemes ellenőrizni, hogy a build után a `dist/sw.js` frissül-e a manifesztben. Javaslat: automatikus precache frissítés build lépésben (ha még nincs).

---

## 5. Elavult szövegek / i18n konzisztencia

### P1-5 — `settings.nutrition.*` és `settings.sport.*` kulcsok több helyen
A `NutritionTip` és `SportTip` szövegekSettingsView és ToolsView is használják, és a nyelv katalógusban van, de a szöveg konzisztenciája (pl. „napi” vs „napi cél”) függ a nyelvi fájloktól. Javaslat: frissíteni a katalógust, ha a szövegek változnak.

### P1-6 — `insights.more.title` és `insights.more.badge`
A `insights.more` Card badge és title kulcsai vannak, de a Badge szöveg (`“X új”`) a katalógusban kell, hogy legyen. Ellenőrizni, hogy a kulcs pontosan illeszkedik-e.

### P2-9 — `tools.learning.title` a ToolsView-ben „Tanulás” drawer
A drawer címe „Tanulás”? A kulcs `tools.learning.title` van. Ellenőrizni a fordításban szerepel-e a megfelelő név.

### P2-10 — `journal.results` LaTeX-szerű formázás hiánya
A `journal.results` szövegben a `found` és `total` paraméterek vannak, de a formázás egyszerű szöveg. Ha a szavak száma magas, a mondat hosszú lesz. Nem hiba, de érdemes ellenőrizni, hogy a broken strings ne törjenek.

### P2-11 — `today.question.*` szövegek
A napi kérdések kulcsai vannak, de ha a kérdések listája szeretnék bővíteni, a forgalmazás utilsban van (`QUESTIONS` tömb `useMemo`). Javaslat: ha új kérdések szeretnének, a kulcséváltoztatás után a tömb is frissülő.

### P3-2 — Érvényes i18n kulcs hiánya: `cardStates.noData` és `trackerGroupSummary` használata
A `cardStates.noData` kulcs van `cardStates.ts`-ben, és használt, de ha valaki expanding info-t szeretne, ehhez kulcs kell. Javaslat: ellenőrizni, hogy a kulcs minden nyelven van-e.

### P3-3 — Badge / „X új” fordítás
Ha az első Mood dátum nem utolsó, nincs „új” jelzés a badgeben, csak a `Collapsible` badge. Javaslat: egyértelmű Badge szöveg hozzáadása.

---

## 6. Elérhetetlen funkciók / funkciók, amiket nem látni

### P1-7 — Téma egyéni kijelölés a CustomThemeEditor nélkül
A Settingsben van „Saját téma” szerkesztő, de a színválasztás hex kódodulation. Fázis 3-ben kell ColorPicker. Említeni, hogy jelenleg egyéni szín beírása kell.

### P1-8 — Háttérkép beállítása anélkül, hogy a felhasználó látná a fel<|special_1653|>
A háttérkép beállítása van, de a színskála / árnyék / kondíciós beállításai csak a Settingsben (BackgroundImagePicker révén). Ha a felhasználó szeretné „próbálni” a színeket, nincs előnézet azonnal. Javaslat: előnézet a háttérbeállításnál.

### P2-12 — A „Minden adat törlése” után a kártyák nyílnak
Mag上で említettem (P1-2), de ez is elérhetetlen funkció: a törlés után a perzisztált nyíló állapotok elvesznek.

### P2-13 — Navigáció reszponzív reszponzív gombok
A BottomNav reszponzív, de a gombok reszponzív 목표는 meg kellene nézni, hogy az ikonok mérete megfelelő-e kisebb kijelzőn.

### P3-4 — A témabeállítások elválasztása „alap ablak szín” és „kártya szín”
Jelenleg a basic window szín fix. Ez F4. Javaslat: ötletsoros terv.

---

## 7. Konzisztencia-visszajelzések a kártyák használatában

| Hónap | Hol | Mit |
| --- | --- | --- |
| `CollapsibleCard` | ToolsView (`settings-nutrition-tips`, `settings-sport-tips`) | Perzisztál, collapsed alap |
| `Collapsible` | Journal (`search`), Insights (`more`) | Session locale, default false |
| `Card` | Szinte mindenhol | Nem collapsible, nincs állapot |

Tehát jelenleg:
- Ma: TrackerInputs, DailyGoals, WeeklyReflectionCard használják `Card` / nem collapsible.
- Napló: Calendar `Card`, Search `Collapsible`, Entries `Card`.
- Elemzés: Chart Cards `Card`, Lag `Card`, Quadrant `Card`, Export `Card`, Stats `Card`, Achievements `Card`, Grid `Card`, Patterns `Card`, More `Collapsible`.
- Felfedezés: Minden drawer `Collapsible` (ToolDrawer), de a belső kártyák `Card`.
- Beállítások: a Vizsgálat szükséges, de fent van, sok `Card`, néhány `CollapsibleCard` / `Collapsible` parciális.

---

## 8. Javasolt javítások (összefoglaló)

1. **ColorPicker komponens** (F3) — hex beírás helyett színskála, paletta, előnézet.
2. **Alap ablak szín a saját témához** (F4) — a Settingsben a témabeállítások mellé szín változtatható.
3. **5 háttérképes téma** (F5) — háttérkép + színpaletta, mindegyiknél a dinamikus szövegszín és kontraszt ellenőrizve.
4. **CollapsibleCard mindenhol** (F2) — Mai TrackerInputs, Reflections, Goals, Activities, Nutrition, Sport tipek, Settings Cards többsége, Napló Calendar/Entries, Elemzés Chartok, Lag, Quadrant, Export, Stats, Achievements, Grid, Patterns, Felfedezés belső kártyaként.
5. **Reset cardStates a törlésnél** — minden adat törlésekor a `belso-iranytu:cardStates` is törlésre kerül.
6. **Banneron action** — StaleWorkerNotice gomb.
7. **PWA frissítés gomb** — Settingsben.
8. **Mentési megerősítés Badge** — Settingsview-n.
9. **Egységes card kitérések** — P3.
10. **Reszponzív touch targetok ellenőrzése** — P2-7, Nav.
11. **i18n kulcsok ellenőrzése** — P3-2, P3-3.
12. **Beállítások modul kapcsolók csoportosítása** — A3.
13. **Appearance kártya egyesítés** — A7.
14. **Precache automatizálás buildben** — A9.

---

## 9. Kapuellenőrzés (gate)

- `bun typecheck` — clean
- `bun test` — zöld
- `bun run build` — zöld
- Eredeti ág: `feature/audit-collapsible-themes` (main-tól származik, nem módosult ezzel a dokumentummal)

A dokumentum nem tartalmaz kódváltoztatásokat, csupán auditot. A következő fáziák (2-től) végrehajtják a javaslatokat.
