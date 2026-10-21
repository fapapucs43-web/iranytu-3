# Ésszerűsítési javaslatok — 2026-10

Ez a dokumentum **read-only**: nem módosít kódot, és nem dönt el semmit — minden
javaslat a saját prioritásával és becsült munkájával szerepel, hogy a döntés
olvasható legyon belőle.

**Módszer:** (1) a teljes fa újra-bejárása az idei auditok nyomán
(`docs/collapsible-complete-audit.md`, `docs/ux-audit-phase2.md`,
`docs/further-improvements.md` — ez utóbbi nyitott tételeit ez a fájl nem
ismétli, hanem épít rá); (2) konkrét, fájl:sorral alátámasztott megállapítások
(az elavult onboarding-téma-lépés, a `?tab=` query halott kezelése, a
`ConfirmDialog` fókuszkezelésének hiánya stb. mind a fából származnak);
(3) versenytárs-összevetés a 2025–2026-os kínálatról (Daylio, Moodfit, Bearable,
Finch, Day One, Journey, Reflectly, Stoic — források a §6 végén).

**Prioritás:** P1 = valami nem igaz vagy nem működik; P2 = erős érték, mérsékelt
munka; P3 = érdemes, nem sürgős. **Illeszkedés:** a privacy-first, offline,
magyar alapelv — minden javaslatnál jelölve, hol áll hozzá a legközelebb.

---

## 1. Funkcionális ésszerűsítés

**1.1 Az onboarding téma-lépése négy témát kínál a tizenhatból, és magyar
literalokkal fordul — P1 · kicsi · illeszkedés: közvetlen (a fordítottság a
termék ígérete).**
`src/components/OnboardingFlow.tsx:106-134` négy rögzített témát kínál
(fény/sötét/meleg/vibráló), a `warm` címkéje kézzel írt (`:115` `l: "Meleg"`,
míg a társai `t()`-ből jönnek), és `:84` egy nyers magyar mondat áll
(`„A hangulat mindig ott lesz — ezeket is bekapcsolhatod."`). Ez utóbbi azért
csúszik ki, mert az `OnboardingFlow.tsx` NEM szerepel a `tests/lib/i18n.test.ts`
nyersliteral-listáján — a sweep szeme éppen a fájl mellett megy el. Egy
angol vagy német olvasó magyar szöveget kap az első percben, miközben a
katalógus mindhárom nyelven teljes. Mechanizmus: a lista + a katalógus
kiegészítése; a négy téma helyett a `themeMeta()` sorakoztatható.

**1.2 A GAD-7 check-in válaszai bezáráskor elvesznek — P2 · kicsi · illeszkedés:
erős (semmi nem hagyja el a készüléket).**
A `Gad7Card` válaszai `useState`-ben élnek, és a kártya a fiók összecsukásakor
is a fában marad ugyan (a `CollapsibleCard` testet nem unmountolja), de a
Felfedezés fül elhagyása az egész nézetet unmountolja (`src/App.tsx:290-296`
kondicionális render), így a félkész vagy lezárt check-in visszatérve
eltűnik. Ez szándékos volt („a válaszok a komponens állapotában élnek" — a
kártya saját docblockja), de a nap végén éppen az a lépés veszik el, amit a
felhasználó a legkevésbé akar újrakezdeni. Mechanizmus: session-szintű
megtartás (a fül unmountját túlélő moduláris cache), nem tárolt napló —
adatvédelmi kompromisszum nélkül.

**1.3 Két felület kezeli ugyanazt a gyógyszerlistát — P3 · kicsi · illeszkedés:
semleges.**
A `MiniMeds` (`src/views/ToolsView.tsx`, tools-meds) és a
`MedicationTimesCard` (`settings-med-times`) is hozzáad és töröl gyógyszereket
(`setMedications` mindkettőből). Két szerkesztő egy listára két külön
képernyőn: nem hiba, de a „hol tudom szerkeszteni?" kérdésre két helyes
válasz van. Mechanizmus: a lista egyetlen tulajdonosa a Beállítások legyen,
a fiókbeli kártya csak pipál — vagy fordítva, de döntés szüleddjék.

**1.4 Három alvás-beviteli út vezet két külön tárolt mezőbe — P2 · nagy ·
illeszkedés: közvetlen (adatok a készüléken maradnak, csak kevesebb helyen).**
`vitals.sleepHours` (MiniVitals + hangbevitel + időjárás-töltés) és a
`tracker-sleep` csoport (TrackerInputs) ugyanazt a valóságot rögzíti két
külön mezőben, és az Elemzés csak az egyiket látja. Mechanizmus: egységesítés
egy forrásra egy, a másikat kitöltő iránnyal + migrációval. Ez a lista
legnagyobb egyedi munkája; az első lépése lehet egy döntés a
`docs/further-improvements.md` §3.1 mozgás-insight tételével együtt.

**1.5 A három korrelációs kártya összefogása — P3 · közepes · illeszkedés:
semleges.**
`insights-activity-correlation`, `insights-correlation` (rács) és
`insights-patterns` ugyanazokon az `entries`-eken dolgoznak, három külön
kérdést feltenve. Egy „Minták" szekcióba vonva a három nézet megmaradhat
(különböző kérdéseket tesznek fel), de a görgetés és a sorrend egyszerűbb
lesz. Kapcsolódik a §2.4-hez.

**1.6 A manifest gyorsgombjának query-je halott — P3 · kicsi · illeszkedés:
semleges.**
A `public/manifest.webmanifest` „Mai naplózás" gyorsgombja `/?tab=today`-ra
mutat, de a `?tab=` paramétert semmi nem olvassa (`src/App.tsx` nem kezel
`searchParams`-t). Ma a dolog úgy működik, hogy az alapértelmezett fül éppen
a Ma — a szerencse tartja életben a mechanizmust. Vagy megvalósul a
parameter-olvasás (mély link a Naplóra is), vagy a query eltűnik.

## 2. UX-ésszerűsítés

**2.1 A tab-váltás elveszíti a keresést, a szűrőt és a kurzort — P2 · kicsi/közepes ·
illeszkedés: semleges.**
Minden fül unmountol a váltáskor (`src/App.tsx:290-304`), így a Napló
kereső-szövege, hangulat-szűrője és a nyitott hónap kurzora, valamint a
tevékenység-címkék válogatott állapota a Ma lapon visszatérve üresen jön
vissza. Egy olvasó, aki a Naplóban keres, majd a Ma lapon rögzít, majd
visszanéz — minden alkalommal újrakeres. Mechanizmus: a keresés állapota a
store-ba (vagy a nézetek életben tartása).

**2.2 Szünet nélküli légzés és meditáció — P2 · közepes · illeszkedés: erős
(a gyakorlat a felhasználó gépén fut).**
Átvezetve a nyitott `docs/ux-audit-phase2.md` §4.1 tételéből: a „Befejezés"
valójában „elvetés" — nincs szünet állapot, ahol az eltelt idő megmarad. A
két kártya ugyanazt a hibát osztja, egy javítás fedi mindkettőt.

**2.3 A PIN-visszaszámlálás nem hangzik el — P2 · kicsi · illeszkedés: erős
(a segítség a látássérült olvasónak jár).**
Átvezetve a nyitott `docs/ux-audit-phase2.md` §4.2 tételből.

**2.4 Két kártyát „Heti összegzés"-nek hívnak, és a streak két dolgot is
jelent — P3 · kicsi · illeszkedés: semleges.**
A `today.weeklyNutrition.title` („Heti összegzés") és az Elemzés heti kártyája
rokon címet visel; a Naplóbanner „sorozat"-ja (naplózott napok) és a
`tools-habits` „sorozat"-ja (szokások) két külön fogalom egy szóval. Egy-egy
jelző megkülönbözteti őket; a címek a katalógusban vannak, tehát a csere
olcsó.

**2.5 Az Elemzés „Továbbiak" doboza a lap alján van, pedig az egyik
legmagasabb értékű — P2 · kicsi · illeszkedés: semleges.**
A személyes felismerések (`insights-more`) zárják a tizenkét szekciót. A
rendezhetőség megoldás (a szekciók átrendezhetők), de az ALAPÉRTELMEZETT
sorrend az, amit az olvasó lát. Mechanizmus: a szekciók deklarált sorrendjén
egy helycsere; vagy a `docs/further-improvements.md` §2.2 ugrásrétege.

## 3. Vizuális ésszerűsítés

**3.1 Az „Alvás" sor a grafikonon literális színnel megy — P2 · kicsi ·
illeszkedés: erős (a téma-váltás ígérete).**
`src/views/InsightsView.tsx` — a negyedik sor `stroke="#4c7fb0"`, mert nincs
negyedik `--ring-*` alias; a saját kommentje kimondja, hogy a döntés ennél
nagyobb (a `tests/batch13-color-scheme` DERIVED_PROPERTIES listája bővülne).
Egy alias + tizenegy téma token — pontosan az a munka, amit az elmúlt hónap
már csinált a témáknál.

**3.2 Kétféle belső elrendezés él egymás mellett — P3 · kicsi · illeszkedés:
semleges.**
A `.toolbox-item` minta már csak négy helyen van (VoiceIntake két ága,
a `TrackerInputs` üres-állapot kártyája, az `AttachmentPicker` sora) —
mind a `today-mood` kártyán belül vagy egy `Collapsible` dobozban. A
maradék átmozgatása egységesíti a belső ritmust.

**3.3 Az onboarding létének és a CustomActivityManager docblockjának
karbantartása — P3 · kicsi · illeszkedés: semleges.**
A `CustomActivityManager.tsx:12` mai napig azt írja: „Purely additive
component — not yet mounted anywhere", miközben a Phase 1 óta a
Beállításokban van. Egy mondat, de éppen az a komment, amit a következő
olvasó ellenőrzésként használ.

**3.4 Ami rendben van, és ne nyúlj hozzá: a kontraszt és a betűméret mérve
van** (`tests/contrast.test.ts`, `tests/card-contrast.test.ts`, magas
kontraszt mód, dinamikus tinta) — a §3 nem talált hibát ebben a háromban.

## 4. Teljesítmény

**4.1 A CollapsibleCard testei mindig a fában vannak — P2 · közepes ·
illeszkedés: közvetlen (lassú telefon = kevesebb olvasó).**
`src/components/ui/ui.tsx` — a test `hidden` attribútummal záródik, nem
unmountol. Ez a `find-in-page` és akadálymentesség miatt tudatos döntés, de
az Elemzés tizenkét kártyája (Recharts görbe, Year-in-Pixels rács,
korrelációs rács) így mindig legyártódik, nyitott állapotban is. Mechanizmus:
első nyitásig nem renderelt test, a `cardStates`-ből olvasott kezdőállapot
mellett — a láthatósági ígéret (összecsukva is „látható" a summary) érintetlen.

**4.2 A fő bundle 797 kB (250 kB gzip) — P3 · közepes · illeszkedés: közvetlen.**
A Recharts (Elemzés, `React.lazy`) és a jsPDF (`await import` a
`reportPdf.ts`-ben) már külön töltődik — a maradék zöme a hat ikonkészlet
beépített SVG-grafikája és a három teljes katalógus. Az ikonkészlet-artwork
lustítása hozhat még egy jelentős sávot anélkül, hogy bármi láthatóan
változna.

**4.3 A betöltési lánc rendben van — nincs teendő.** A precache 39 tétel,
~3,2 MB; a betűk 30 woff2 fájlja a `FontProvider` révén lustán érkezik, és a
service worker verizója a build hashhez kötött.

## 5. Accessibility

**5.1 A `ConfirmDialog` nem viszi a fókuszt, és nincs fókuszt-csapda — P2 ·
kicsi/közepes · illeszkedés: erős (nagy betűs, idős olvasók a célközönség).**
`src/components/ui/ui.tsx` — a dialógus csak Escape-t kezel; a fókusz a
párbeszéd mögött marad, tehát a billentyűzet-felhasználó a „Mégse" gombot
körbejárva sem éri el, és tab közben a háttérben lapoz. Ugyanez az
`OnboardingFlow` és a `AssessmentConsent` dialógusára. A `RecordingFlow`
már csinálja jól (`dialogRef.current?.focus()`) — a minta megvan a fában,
csak át kell venni.

**5.2 Az ötfokozatú hangulatsor nem kezeli a nyilakat — P3 · kicsi ·
illeszkedés: semleges.**
A régi rögzítés (`role="radio"` gombok a Ma lapon) minden gomb külön
fókuszmegállítás; a RecordingFlow méterével ellentétben nincs roving
tabindex, tehát öt tab-lépés egy választásért. Csak akkor éles, ha a
felhasználó az „öreg" módot választotta.

**5.3 Ami rendben van, és ne nyúlj hozzá: a `CollapsibleCard` feje valódi
gomb `aria-expanded` + `aria-controls` párban, a mood-meter teljes
billentyűzet-szerződése megvan, a `role="status"` tippek bejelentik
magukat.**

## 6. Fejlesztési javaslatok a versenytársak alapján

A versenytárs-összevetésből azokat a mintákat emeltük ki, amelyek a
privacy-first, offline, magyar alapelvhez a legközelebb állnak. A
felhő-függő előnyökhöz (szinkron, megosztás, felhő-AI) nem nyúlunk: a
tanulság ott általában a MINTA, nem a megvalósítás — helyi személyre
szabás felhő-elemzés helyett.

**6.1 „Egy évvel ezelőtt" — helyi emlékeztető a Naplóban (Day One mintájára) —
P2 · közepes · illeszkedés: kiváló.**
A naptár és a keresés megvan, de semmi nem hozza vissza az archívumot magától.
Egy kikapcsolható, érzékeny bejegyzésekre kizárható kártya, ami helyben
számol — a szinkron nélküli „On This Day" a legtöbbet hozza abból, amit a
Day One felhő nélkül is adni tud. Adat: a bejegyzések már ott vannak.

**6.2 Reggeli szándék + esti „mi számított" (Stoic mintájára) — P2 · közepes ·
illeszkedés: erős.**
A napi kérdés forgó-készlete, a heti tükör és a rövid önreflexió már megvan;
a hiányzó darab az időzítés: ugyanaz a három űrlap reggel és este, a nap
ritmusához kötve. Nem új adat, hanem a meglévő promptok napirendje.

**6.3 Rugalmas célok, elfelejtett napok büntetés nélkül (Daylio mintájára) —
P3 · nagy · illeszkedés: erős.**
A napi célok (`today-daily-goals`) csak napiak. A Daylio heti célokat és
archiválást kínál; a lényeg a „megbocsátó" haladás-nézet, ami egy
mentális-egészség appban különösen fontos. Adat: a célok már tárolódnak, a
heti ritmus új dimenzió.

**6.4 Gyengéd jutalmazás, versengés nélkül (Finch mintájára) — P3 · nagy ·
illeszkedés: erős, de csapdás.**
A Finch lényege a motivációs burok, nem a tartalom. Egy opcionális, helyi,
nem megosztható, kihagyott napokat semlegesen kezelő jutalom-vonal
(`tools-habits` fölött) adható hozzá — a gamification az a hely, ahol ez az
alkalmazás tudatosan lassú akar maradni, szóval csak az olvasó kérésére.

**6.5 Gyors rögzítés — a manifest gyorsgomb életre keltése (1.6) + PWA widget
(Reflectly/Daylio mintájára) — P3 · kicsi/közepes · illeszkedés: erős.**
A két-koppintásos rögzítés a legnagyobb napi különbség a mezőn. A widget
platform-függő (Chromium), de a `?tab=` mély link minden platformon ingyenes.

**6.6 PHQ-9: SZÁNDÉKOSAN NEM.** A kérdőív a PHQ-8, a 9. tétel (önkárosodás)
teljesen kihagyva, dokumentálva (`src/lib/assessments.ts:11-20`). A Moodfit
kínál PHQ-9-et; itt ez tudatos döntés, és ez a bekezdés az, ami a következő
olvasónak megmondja, hogy nem felejtés.

**6.7 Ciklus- és bélmozgás-követés (Bearable mintájára) — P3 · nagy ·
illeszkedés: csak opt-in modulként elfogadható.**
A Bearable erőssége a kiterjesztett testi követés; a mi elvünk szerint ez
csak egy újabb, alapból KIKAPCSOLT tracker-csoportként jöhet — soha nem
kérdéses onboarding-lépésként, soha nem a napló részeként.

**6.8 Helyi sablonok, terápiára készülés (Journey/Stoic mintájára) — P3 ·
kicsi · illeszkedés: erős.**
A CBT-űrlap és a kérdőív mellett egy-egy előre írt jegyzet-sablon
(terápiára készülés, álomnapló) a meglévő szerkesztőn ül, helyben.

### A versenytárs-összevetés forrásai

- Daylio célok és funkciók: <https://daylio.net/>, <https://daylio.net/faq/docs/daylio-faq/tutorials/setting-up-goals/>
- Moodfit (PHQ-9, óránkénti nézet): <https://apps.apple.com/us/app/moodfit-mental-health-tools/id1054458809>, <https://www.cnet.com/health/mental/best-mental-health-apps/>
- Bearable (ingyenes/premium felosztás): <https://bearable.app/support/common-questions/bearable-free-vs-premium-features/>
- Finch: <https://play.google.com/store/apps/details?id=com.finch.finch>
- Day One: <https://dayoneapp.com/>
- Journey: <https://journey.cloud/>
- Reflectly: <https://apps.apple.com/us/app/reflectly-journal-ai-diary/id1241229134>
- Stoic: <https://play.google.com/store/apps/details?id=com.stoicroutine.stoic>

---

## 7. Ami nem ennek a dokumentumnak a dolga

- **Nem ütemezés.** Nincs dátum, nincs felelős, és egyetlen tétel sem állítja,
  hogy biztonságos lenne a saját tesztje nélkül.
- **Nem a `further-improvements.md` átírása.** A nyitott adósságai (a
  navigációs ugrásréteg, a hétvégi pihenőnap, a menü-csere, a mozgás-insight)
  élnek tovább; ez a fájl azokat építi, nem ismétli.
- **Nem mérés az olvasókról.** Az alkalmazás nem vezet használati naplót, és
  ez így van jól — minden itteni állítás a fából vagy a versenytársak
  nyilvános kínálatából származik.
