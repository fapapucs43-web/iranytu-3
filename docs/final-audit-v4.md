# Final audit v4 — Belső Iránytű

Az utolsó záró audit. Előzménye: `final-audit-v3.md` (`main @ bd57244`), amelyet
szándékosan **nem** módosítottam — az a commit állapota, nem a mostani fa.
Ez a dokumentum a jelenlegi fát méri újra, és a UX audit négy fázisát zárja.

Minden szám újramérvebb, nem átvéve.

| | v3 (`bd57244`) | **v4 (`cc1b4c9`)** |
| --- | --- | --- |
| `src/` `.ts`/`.tsx` fájl | 146 (31 268 sor) | **148 (32 210 sor)** |
| tesztfájl | 90 (32 327 sor) | **91 (32 800 sor)** |
| teszt | 2 781 | **2 801** |
| i18n kulcs | 491 | **524** |
| precache | 39 entry / 2 921 415 B | **39 entry / 2 924 640 B** |
| runtime függőség | 10 | **10** (változatlan) |

Tíz függőség, és a Phase 1–4 alatt **egy sem jött be**. Nincs router, nincs
állapottároló, nincs tesztkeretrendszer: a `bun test` a bun saját futtatója.

---

## 1. Mi épült az UX auditban

Az audit négy fázisban futott, és mindegyik külön visszafordítható. A lényeg,
hogy **nem egy nagy átírás** volt: minden lépés megmutatta, mit nem csinált.

### Fázis 1–2 — szerkezet (`07de037`, `1deb295`, `7250262`, `2bbef6d`, `3cf7e92`)

- Az időzített gyakorlatok kapnak **szünetet**: a leállítás eddig eldobta a
  munkát.
- A PIN-zárolás számlálója **egyszer szólal meg** egy `aria-live` régióban,
  nem hatvan percenként egy `aria-live` szövegváltozás. A teszt mindkét
  irányban fut: a csapda bevezetése és az eredeti csend visszaállítása is
  megbuktatja.
- A futó zárolás túléli az újratöltést.
- Két leltár: `docs/ux-audit-phase1.md` (menük, fülek) és
  `docs/ux-audit-phase2.md` (279 interaktív elem, 46 fájl).

### Fázis 3 — sorrend (`7796ea2`, `c5c69eb`, `0875a49`, `6dd1b14`)

Ez a fázis adta az alkalmazás „**a kártyáim olyan sorrendben vannak, ahogy
nekem tetszik**" funkcióját.

- `lib/sectionOrder.ts` — az `orderedTabs` szabály alkalmazva a fülek saját
  kártyáira, **ugyanaz az öt szabály**, mert aki az egyiket ismeri, a másikat
  is.
- Mind a négy fül `ReorderToggle`-ot rajzol, és a kártyáit `SectionList`-
  adja át. **Rendezett módban `SectionList` egy töredék** — nincs burkoló
  elem, mert a burkoló a Beállítások tizenhárom összecsukható kártyáját
  kettő befogással elérhetővé tenné.
- A `settings.sectionOrder` **a `belso-iranytu-data-v2` blobon belül** él, nem
  mellette, így a mentés és az export is viszi. Egy önálló kulcs szebb lett
  volna, és minden exportkor csendben elveszítette volna az elrendezést.
- A visszaállítás **törli a kulcsot**, nem visszaírja az alapértéket: így ledob
  egy kézzel szerkesztett slotot, és ez teszi lehetővéé, hogy a gomb utána
  saját magát letiltja.
- Az Elemzés üres állapota **nem rajzol kapcsolót** — nincs mit átrendezni.

### Fázis 4 — szövegek (`102a931`, `cc1b4c9`)

Az első három fázis a képernyőket rendezte. Ez azt vizsgálta, amit az olvasó
elolvas.

- A leltár géppel készült, és **cáfolta** a korábbi becslést: **74 nyers
  magyar literál 23 fájlban**, 524 katalóguskulcs mellett. A definíció: az a
  magyar szöveg, ami JSX-csomópontként vagy `title=` / `placeholder=` /
  `summary=` / `aria-label=` / `label=` / `badge=` / `alt=` attribútumként
  nyersen szerepel a `src/`-ben — gomb törzsében csak akkor számít, ha nem
  tartalmaz JS-kifejezést. Ugyanezzel a definícióval a Phase 4 előtt **85** volt;
  a tizenegy katalógusba emelt cím az, ami köztük különbség.
- Három valódi hiba, nem ízléskérdés:
  - a `crisis.disclaimer` az **egyetlen** mondat 524 kulcsból, amely „Ön"-nek
    szól — és pont a segélyhívások kártyáján állt;
  - `készülékedön` `készülékeden` helyett, **négyszer**, mindegyik az adatvédelmi
    ígéret mondatában — a negyedik a telepítő-sáv élő szövegében volt, ahová az
    első audit csak a katalógust nézve nem jutott el;
  - a `tools.workouts.disclaimer` olyan mondatot épített, amelyet a
    nyelvtan nem bír: „Sérülés, krónikus betegség vagy terhesség esetén" azt
    tette sérültté, amit az általános életmód-javaslat ajánl.
- Kilenc kártyacím a **már létező** kulcsát kapta: a 3b ugyanazt a szót írta
  kettő helyre — egyszer az átrendezési panel címébe, egyszer nyers literálként
  a JSX-be. A nyelvváltó mostantól ugyanazt a szót váltja mindkét helyen.

---

## 2. Teljes funkció-leltár

**Naplózás magja.** Hangulat-mékoordináták, szabad szöveg, tevékenységek és
nyomonkövető-értékek, mellékletek; CSV- és JSON-export, import egyetlen ajtóval
és ott javítással.

**Hangulat koordináta.** A mérőpontszerű (`mood-v2`) modell: 0–10 × 0–10, és
ebből kvadráns. Nem öt szint, hanem két dimenzió — ezért van négy kvadráns és
nem öt „hangulat".

**Négy fül.** Ma · Napló · Elemzés · Beállítások — `src/types.ts` deklarálja
unióként, nem útvonaltáblázatként.

**Ma.** Hangulat, stressz, energia, napló, aktivitáscímkék, heti reflektálás,
és a **12 elemes Eszköztár**: légzés, meditációk, CBT-űrlap, mikro-lecke,
kísérlet, szokásstreakok, hál gratitude, időjárás, edzésprogramok,
táplálkozási tippek, sporttippek, okosóra-import.

**Napló.** Naptár valós streakkel, keresés és szűrők, bejegyzés-szerkesztés
és -törlés, részletező dialógus.

**Elemzés.** Hetes számok,év-naptár, trend, korrelációs mátrix, késleltetett
hatások, kvadráns-összefüggések, export, havi/éves statisztika, mérföldkövek,
minták.

**Beállítások.** Nyolc csoport: Személyes · Megjelenés · Navigáció ·
Nyomonkövetés · Emlékeztetők · Biztonság · Mentés és export · Egyéb. A krízis-
kártya **pinelt**, felette mindennek.

**Adatvédelem és hálózatalom.** Nincs fiók, nincs szerver. A titkosított
biztonsági mentés a készüléken marad; az időjárás és az étkezés-AI csak akkor
működik, ha a kapcsoló be van kapcsolva és a kulcs be van írva.

**Nyelv.** Magyar a forrás, `en`/`de` részleges katalógussal és mérhető
lefedettséggel.

---

## 3. Ismert korlátok

**A „késleltetett hatások" kártya statisztikailag laza.** Négy bejegyzés és két
azonos tevékenység a küszöb, és ez nem elég ahhoz, hogy bármit bizonyítson. A
kártya kimondja ezt a küszöböt; nem állít többet.

**A kvadráns-nézletek üres állapotban üresek.** Két nap azonos kontextussal
kell. Ez őszinte, de az „Érzés és kontextus" a negyedik fülön jelenik meg,
nem ott, ahol az adat keletkezik — a felhasználó nem látja, hol kellene
gyűjtenie.

**Nincs visszaállítás egy törölt bejegyzésre.** A megerősítő dialógus igen, a
visszavonás nem.

**Az `en`/`de` katalógusok részlegesek.** 524 kulcsból az angol három, a német
kettő. Ez szándékos és mérhető, nem hiba — de „le van fordítva" állítást nem
lehet mondani róla.

**A nyers literálok töredéke még mindig nyers.** A megmaradt 74-ből kilenc
kártyacím és két dialóguscím került katalógusba ebben a körben. A maradék —
a gombfeliratok, az `aria-label`-ök, a placeholder-ek — a következő lépés.
Szándékosan nem félkészen: egy kulcs `t()` hívás nélkül a saját visszafelé
olvasó ellenőrzését buktatja.

**A mérés maga is tanulság.** Három különböző kivonatoló ugyanarra a fára három
különböző számot adott (102, 90, 74), mert más-más tekintette gombnak a
`<button>` blokkot, és az egyik a `hint=` sorokat nem számolta. Ezért van
fent rögzítve a definíció: számot lehet ellenőrizni, definiálatlan számot nem.

**A service worker gyorsítótárazása a build kimenetét szolgálja ki.** Egy új
build után a régi gyorsítótárazás a régi fájlokat tartja, amíg a SW nem
frissül. Ez PWA-expected, de offline tesztelésnél zavaró.

---

## 4. Mi jön következőnek

**A Phase 4 maradéka** — a gombfeliratok és az `aria-label`-ök katalógusba
emelése. Nem nyelvészeti munka, hanem mechanikus, és a sorrend számít:
előbb a gombfelirat, utána a `hint`. Egy `hint` `label` nélkül elveszíti a
hozzáférési nevet; egy gombfelirat nélkül nincs mit megnyomni.

**A 29 maradék nyers gombfelirat** két hullámban: ahol már van kulcs
(`tools.cbt.save`, `backup.cancel`, `tools.habits.add`, `settings.sections.stop`),
ott azokat használjuk — nem vezetünk be párhuzamos `common.*` nemteret, mert
az épp az a duplikáció lenne, amit ez az audit takarít.

**Bejegyzés-visszavonás.** A törölés ma végleges; egy 30 másodperces
visszavonás a legkisebb ráfordítású biztonsági háló.

**A `zh`/`de` katalógus kiegészítése**, ha valódi igény merül fel — ne
fordítási kedvért.

**A kvadráns-nézletek felvitele az adatrögzítés oldalára.** A négy adathoz
kellő kvadráns ott keletkezik, ahol az érzés; a magyarázat pedig ott kellene,
nem a negyedik fülön.

---

## 5. Amit ez az audit nem állít

- **Nem mért használhatóságot.** Ez szerkezeti és nyelvi elemzés. Senki nem
  tesztelt valós olvasóval.
- **Nem állítja, hogy az alkalmazás kész.** Egy offline hangulatnapló sok
  embert sokáig nem érdekel. Ez a dokumentum azt mondja meg, mi van benne
  és mi nincs — nem azt, hogy ez elég.
- **A „mérhető lefedettség" a kulcsszámokra vonatkozik**, nem a jó
  fordításra. Egy kulcs lefordítva még rossz is lehet.