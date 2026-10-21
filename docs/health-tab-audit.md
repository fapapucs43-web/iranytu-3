# Az Egészség fül szakmai auditja

**Dátum:** 2026-10-20
**Hatókör:** a hatodik fül (`Egészség`) teljes tartalma — Táplálkozás, Edzés, Egyéb — a hozzá tartozó
modulokkal (`lib/nutrition`, `lib/diets`, `lib/weeklyMenus`, `lib/nutritionTips`, `lib/sportTips`,
`lib/fitness`, `lib/habits`, `lib/assessments`, `lib/gad7`, `lib/medReminders`).
**Módszer:** forrásolvasás és a rendelt markupek újraszámolása; a fül viselkedését a meglévő
tesztek (3683 → 3691 eset) és a statikus render igazolja. Böngészős, élő kipróbálás nem történt.

> **A dokumentum nem diagnózis és nem orvosi tanács.** Az itt leírt megállapítások az app
> szövegeire és adatszerkezetére vonatkoznak, nem a felhasználó egészségére. Egészségügyi kérdésben
> minden esetben orvos, dietetikus, gyógyszerész vagy más szakember a mérvadó; sürgős esetben a
> 112 hívandó. A fül minden kártyája ezt az elvet követi, és a jelenlegi szövegek egyike sem
> állítja magáról az ellenkezőjét.

---

## 1. A fül jelenlegi tartalma

A fül három szekcióból áll, a sorrendet a felhasználó állítja (`SectionList` + `settings.sectionOrder`).
A szekciók a kártyákat **mozgatással** kapták meg: a korábbi Felfedezés → Egészség fiók megszűnt,
a kártyák azonos `id`-vel költöztek át, így a korábban kinyitott kártya itt is nyitva marad.

### 1.1 Táplálkozás

| Kártya | `id` | Mit tesz | Hol |
|---|---|---|---|
| Étkezés napló | `nutrition-log` | 4 étkezéstípus, 65 regisztrált étel adagokkal, saját ételek, napi összeg (kcal, fehérje, szénhidrát, zsír), 12 étrend-választó, heti menü, allergén-figyelmeztetés, napi egy mondat (`mealIdea`) | `components/NutritionCard.tsx`, `lib/nutrition.ts`, `lib/diets.ts`, `lib/weeklyMenus.ts` |
| Étkezés fotó → becslés | `food-photo` | fotóból becsült értékek, **szerkeszthető**, csak hozzájárulás (`foodAiEnabled`) esetén jelenik meg | `components/FoodPhotoCapture.tsx`, `lib/foodAi.ts` |
| Heti összegzés | `tools-weekly-nutrition` | 3 becsült nap után heti átlag + egy mondat; biztonsági sáv 500 / 4000 kcal | `components/HealthModules.tsx`, `lib/nutritionTips.ts` |
| Táplálkozási tippek (átláthatóság) | `settings-nutrition-tips` | honnan jön a mondat, két példa, a biztonsági mondat | `views/HealthView.tsx` |

### 1.2 Edzés

| Kártya | `id` | Mit tesz | Hol |
|---|---|---|---|
| Edzésprogramok | `tools-workouts` | 6 statikus program (Kezdő, Otthoni, Haladó, Edzőtermi, **Mobilitás és regeneráció**, **Séta és állóképesség**), determinisztikus ajánló („Ma ez ajánlott"), pihenő-emlékeztető 3 nap után, piros-zászló sor | `components/WorkoutPrograms.tsx`, `lib/sportTips.ts` |
| Edzéstervek és napló | `fitness-plans` | 12 sablon, 6 mozgásfajta, saját tervek, edzésnapló, progresszió (súly és ismétlés), sorozatgráf | `components/FitnessCard.tsx`, `lib/fitness.ts` |
| Sport tipp (átláthatóság) | `settings-sport-tips` | honnan jön a sport-mondat, példák, pihenő-tipp | `views/HealthView.tsx` |

### 1.3 Egyéb

| Kártya | `id` | Mit tesz | Hol |
|---|---|---|---|
| Testi mutatók | `tools-vitals` | alvásóra, nyugalmi pulzus, HRV — napi 3 érték, összeg a fejlécben | `components/HealthModules.tsx` |
| Gyógyszerek | `tools-meds` | következő adag, aznapi időpontok, rögzítés | `components/HealthModules.tsx`, `lib/medReminders.ts` |
| Szokások | `tools-habits` | napi szokások, sorozatszám, heti rács | `components/HabitStreaks.tsx`, `lib/habits.ts` |
| Önreflexiós kérdőív | `tools-assessment` | 8 tételes önreflexiós lista + 1 kiegészítő kérdés, naplózott eredmény, disclaimer + segélyforrások | `lib/assessments.ts` |
| Feszültség és aggodalom | `tools-gad7` | 7 kérdés, pontszám és sáv, **nem tárol semmit** | `lib/gad7.ts`, `components/Gad7Card.tsx` |

**Kapcsolók:** `vitalsModule`, `medsModule`, `assessmentsEnabled`. A GAD-7 szándékosan kapcsoló
nélküli: nem ír tárolót, így nincs mihez hozzájárulni.

---

## 2. Szakmai értékelés

### 2.1 Ami helyes, és amit meg kell őrizni

1. **Nincs cél, nincs pontszám, nincs ítélet.** A napló számai a felhasználó saját feljegyzései;
   az app nem hasonlítja őket ajánláshoz, és nem minősíti a napot.
2. **A biztonsági sáv beszél, nem diagnosztizál.** 500 kcal alatt / 4000 kcal felett három becsült
   nap után egyetlen nyugodt mondat jelenik meg, és mellette semmi más. Ez helyes: a cél a
   beszélgetés felajánlása, nem a címkézés.
3. **Allergén-figyelmeztetés a regiszterből.** A jelzés a hozzáadás ELŐTT jelenik meg, és ugyanabból
   a forrásból (`allergyHits`), mint a listában látható jelölés — a kettő nem tud ellentmondani.
4. **Minden kérdőív mellett disclaimer és segélyforrás áll**, és a kérdőívek forrása dokumentált
   (PHQ-8 magyar fordítás + a kiegészítő kérdés külön jelölve; GAD-7 adaptáció).
5. **A fotó-becslés szerkeszthető, és csak hozzájárulás után létezik.** A modell tippje nem kerül
   a naplóba a felhasználó jóváhagyása nélkül.
6. **A dietetikai tanács csak akkor szólal meg, ha van mondanivalója** (egy mondat, és a legtöbb
   napon semmi) — ez a helyes irány, mert a csend nem hazudik.

### 2.2 Pontatlanságok és kockázatok (a batch előtti állapot)

| # | Hol | Mi a baj | Súly |
|---|---|---|---|
| 1 | `WorkoutPrograms` (Kezdő tipp) | „az izom reggel épül a legjobban" — nincs ilyen napszakos optimum; a napi összfehérje számít | közepes (tévhit) |
| 2 | `WorkoutPrograms` (Kezdő tipp) | „a fáradtság fele gyakran szomjúság" — túlzó, nem mérhető állítás | kicsi |
| 3 | `WorkoutPrograms` (Otthoni tipp) | „a nehéz tészta az alvást viszi el" — általánosítás, egyéni érzékenységtől függ | kicsi |
| 4 | `WorkoutPrograms` | helyesírási hibák és soft hyphens: `vizzel`, `suly`/`sulyok`, `Bulgár`, `tricepszés`, `Vádliprés`, `göngyölítés`, `Igyálvizet`, `test­súlyos` | kicsi, de látható |
| 5 | `lib/nutritionTips.mealIdea` | a 20 g-os napi fehérje-küszöb nem élettani határ, hanem „nagyon kevés" jelzés — félreértésre ad okot, ha valaki 25 g-nál azt hiszi, elég | közepes (a szöveg szerencsésen nem állítja, hogy elég) |
| 6 | `lib/nutritionTips.weeklySummary` | az 500/4000 kcal sáv önkényes, nem klinikai; helyes, hogy nem nevez meg állapotot, de a doksinak ki kell mondania, hogy nem szűrőeszköz | kicsi |
| 7 | `WorkoutPrograms` | nem volt „mikor állj le" sor: éles fájdalom, mellkasi nyomás, szédülés esetére semmi | **nagy** (biztonsági hiány) |
| 8 | `lib/diets` | az étrend-választó egy szót kért, és utána semmit nem mondott; a gluténmentes/laktózmentes étrendet sokan orvosi okból követik | **nagy** (hiányzó kontextus) |
| 9 | `WorkoutPrograms` | a 4 program mind azt feltételezte, hogy a felhasználó tud edzeni; regenerációra és kezdő sétára nem volt válasz | közepes |
| 10 | `MiniVitals` | alvás/pulzus/HRV magyarázat nélkül: a HRV-t sokan összehasonlítási alapnak hiszik, pedig a saját trendje számít | közepes |
| 11 | `MiniMeds` | nincs figyelmeztetés, hogy az adagolás orvosi kérdés, és nincs étkezés–gyógyszer kapcsolatra utaló sor | **nagy** (hiányzó biztonsági szöveg) |
| 12 | saját ételek | a felhasználó saját étele mellé nem jelenik meg allergén-jelzés (a regiszter nem ismeri az összetételt) | kicsi, de tudni kell róla |

### 2.3 Ami hiányzik (lefedettségi rés)

| Terület | Állapot | Megjegyzés |
|---|---|---|
| Alvásnapló | **részben**: `MiniVitals` napi óraszámot kér, heti képet nem ad | a napi szám megvan, a minta nem látszik |
| Tünetnapló | **nincs** | új adatséma kellene; nem diagnózis, hanem „mi történt ma" feljegyzés |
| Gyógyszer-interakciók | **nincs** | adatbázis és licence kellene; helyette a „mit kérdezz" megközelítés a biztonságos |
| Vérnyomás / vércukor | **nincs** | a `vitals` bővíthető, de új mezőkkel jár |
| Testtömeg-trend | **nincs** | az edzésnapló súlyt rögzít, testsúlyt nem |
| Ciklus / hormonális napló | **nincs** | érzékeny adat, külön döntés kell |
| Alkohol, dohányzás | **nincs** | a regiszterben csak sör/bor szerepel ételként |
| Edzés utáni regeneráció | **most**: új program + alvás-tipp | ez a batch pótolta |
| Étkezés–gyógyszer kapcsolat | **nincs** | orvosi tartalom, csak szakemberre mutató szöveggel érdemes |
| Vízhajtás / hidratáltság | **részben**: tippek említik, cél nincs | szándékosan nincs célérték |

---

## 3. Javaslatok, prioritás szerint

### P0 — biztonsági hiány, most pótolva

1. **Piros-zászló sor az edzésekhez.** „Ha éles fájdalmat, mellkasi nyomást, szédülést vagy
   légszomjat érzel, állj le — és ha nem múlik, kérj segítséget." A programok FÖLÖTT, mert aki
   segítségre szorul, az nem olvas a lista végéig.
2. **Az étrendválasztó mondjon valamit a választásról.** A gluténmentes/laktózmentes/peszkatariánus
   étrend bekerült a listába, és mindegyikhez egy mondat tartozik: mit érdemes kérdezni, és kitől.
   Mellette egy általános sor: a választás a felhasználóé, nem orvosi tanács.

### P1 — tartalmi hiány, most pótolva

3. **Három új étrend** (`gluten-free`, `lactose-free`, `pescatarian`) a maga menüjével, a meglévő
   kompozíciós motorral — kizárás-listával, nem kézzel írt ételekkel, így a menü nem tud tiltott
   ételt mutatni.
4. **Két új edzésprogram**: „Mobilitás és regeneráció" (terhelés nélküli, 10–15 perces körök) és
   „Séta és állóképesség" (alapépítés, tempós és hosszú kör). A négy régi program változatlan.
5. **A tévhitek és helyesírási hibák javítása** a programok szövegében (2.2, 1–4. sor).

### P2 — következő batch, most szándékosan NEM implementálva

6. **Alvásnapló kártya** (7 napos minta a meglévő `vitals.sleepHours`-ból). Additív, de új kártyát,
   i18n-kulcsokat és teszteket igényel — önálló szelet.
7. **Tünetnapló** (napi 1–3 sor: mi történt, mennyire zavart). Új tárolókulcs és WIPE/migráció
   szükséges hozzá; a `lib/habits` mintáját követheti.
8. **Gyógyszer-interakció „mit kérdezz" kártya.** Nem adatbázis, hanem 4–5 kérdés gyógyszerészhez
   (étkezés, egyéb gyógyszer, alkohol, vese/máj). Csak akkor, ha a `medsModule` be van kapcsolva.
9. **Testtömeg-trend** az edzésnaplóból — ha a felhasználó rögzít testsúlyt, a trend a naplóból
   számolható, nem kell új kártya.
10. **Saját ételek allergén-jelzése** — a felhasználó saját ételénél egy „nem tudjuk, mi van benne"
    jelzés, ami a jelenlegi csendnél őszintébb.

---

## 4. Amit ez a batch megvalósított

| Változás | Fájl | Additív? |
|---|---|---|
| 3 új étrend + menü-jogosultság | `lib/diets.ts`, `lib/weeklyMenus.ts` | igen — új id-k, meglévő étrend nem változott |
| Étrendi jegyzet + „nem orvosi tanács" sor | `lib/diets.ts` (`DIET_NOTES`), `components/NutritionCard.tsx`, `lib/i18n.ts` | igen — csak kiválasztott étrendnél jelenik meg |
| 2 új edzésprogram | `components/WorkoutPrograms.tsx` | igen — a régi négy program és az ajánló szabályai változatlanok |
| Piros-zászló sor | `components/WorkoutPrograms.tsx`, `lib/i18n.ts` | igen |
| Tévhit- és helyesírás-javítás | `components/WorkoutPrograms.tsx` | szövegjavítás, szerkezet nem változott |

**Amit az ajánló tesz az új programokkal:** semmit. A `recommendProgram` szabálytáblája továbbra is
a négy eredeti id-t (`kezdo`, `otthoni`, `halado`) nevezi meg — egy új id-t nem ismer, ezért a „Ma ez
ajánlott" jelzés viselkedése bájtra azonos a korábbival. Ez szándékos: az ajánló megváltoztatása a
meglévő felhasználók ajánlását írta volna át, ami nem additív.

**Amit az étrend-választó tesz a korábbi választással:** semmit. A tárolt érték továbbra is egy id a
`belso-iranytu-diet-v1` kulcson; a három új id mellett a kilenc régi változatlanul betölthető, és a
heti menü a meglévő kizárás-listából számol, nem kézzel írt ételekből.

---

## 5. Amit szándékosan nem tettünk meg

- **Nem adtunk kalória-, fehérje- vagy vízcélt.** Egy célérték ajánlás lenne, és a felhasználó
  testéről az app semmit nem tud.
- **Nem neveztünk meg betegséget.** A `DIET_NOTES` a kérdést nevezi meg („kalcium pótlása"), nem az
  állapotot, és minden esetben szakemberhez irányít.
- **Nem tettünk interakciós adatbázist.** Egy gyógyszer-interakciós lista orvosi állítás lenne,
  licence és felelősség nélkül nem vállalható; helyette a kérdés-listázó megközelítés javasolt (P2).
- **Nem nyúltunk a kérdőívek tartalmához.** A tételek forrása dokumentált és jóváhagyott; egy
  szakmai audit nem írhat át egy validált tételt.
- **Nem változtattuk meg a biztonsági sávot** (500/4000 kcal, 3 nap). A javaslat az, hogy maradjon,
  és a dokumentáció mondja ki, hogy nem szűrőeszköz.

---

## 6. Amikor szakember kell

Az app minden érintett felületén ezt a vonalat tartja, és ez a dokumentum sem mond mást:

- **Sürgős eset** (mellkasi nyomás, eszméletvesztés, erős fájdalom, nehézlégzés): 112.
- **Tartós vagy visszatérő tünet** (fogyás, étvágy, alvás, kedély, fájdalom): háziorvos.
- **Étrend kérdésében** (kihagyott élelmiszercsoport, hiánytünet, gyógyszer melletti étrend):
  dietetikus vagy orvos.
- **Gyógyszer kérdésében** (adag, időzítés, együtt szedett készítmények): gyógyszerész vagy a
  felíró orvos. Az app soha nem módosít adagot, és nem javasol abbahagyást.
- **Lelki krízis esetén** a Beállítások tetején álló krízis-kártya a helyi segélyvonalakat mutatja.

---

## 7. Ellenőrzés

| Kapu | Állapot |
|---|---|
| `npm run typecheck` | zöld |
| `npm run build` | zöld |
| `bun test` | 3691 eset (a batch előtt 3683), 0 bukás |
| Az új tartalom a fülön | `tests/views/health-cards.test.ts` — 12 étrend-pill, 6 program, piros-zászló sor |
| Az étrendi jegyzetek szabálya | `tests/lib/diets.test.ts` — szakembert nevez meg, nem diagnosztizál, „other" nélkül |
| Az új étrendek menüje | `tests/lib/weekly-menus.test.ts` — 11 menüs étrend, naponta 6 tétel, tiltott étel nélkül |

**Nyitott pont:** élő, böngészős kipróbálás (kártyák nyitása, étrend-váltás, menü megjelenítése)
ebben a környezetben nem történt meg — ezt a felhasználónak kell megerősítenie.
