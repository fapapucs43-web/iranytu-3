# UX audit, Phase 4 — a szövegek

Az első három fázis a képernyőket rendezte el. Ez a fázis azt vizsgálja, amit
az olvasó tényleg elolvas: **minden szöveget, amit lát, hall vagy gépel**.

Ez a dokumentum **csak lista és javaslat**. Egyetlen `src/`-fájlt sem módosít.
Az átírás a jóváhagyás után, külön committal történik.

---

## 0. Módszer, és egy javított szám

A leltár géppel készült: minden nyers (nem `t()`-hívás) magyar literál a
`src/**` fában, JSX szövegcsomópontként vagy `title=` / `placeholder=` /
`summary=` / `aria-label=` / `label=` / `hint=` / `badge=` / `alt=` attribútumként.
A magyar karakterek a jelölő — ők választják el a másolatot a kódtól.

**A korábban széles körben terjesztett „36 gombfelirat 17 fájlból, 13
kártyacím" becslés már nem igaz.** 3a és 3b után a nézetek gombfeliratai a
katalógusba kerültek, így a nyers maradék feleződött. A mért számok:

> **Pontosítás (Phase 4, alkalmazás közben).** Az első gomb-kivonatolóm
> alul számolt: a szabályos kifejezés a gombok egymást követő részét
> összevágta, így 22-t írt 29 helyett. A javított szám — **29 gombfelirat 15
> fájlban** — a lentiekben szereplő.

> **Pontosítás, záró.** Az alábbi táblázat 102-t ír, és az alkalmazás UTÁN
> mért érték **74** — a tizenegy katalógusba emelt kártya- és dialóguscím
> eltűnt innen. A táblázat szándékosan a *felmérés* állapota marad, hogy a
> különbség látszódjon; a definíció és a záró szám a `docs/final-audit-v4.md`
> -ban van rögzítve. Külön tanulság: a kivonatolók 102 / 90 / 74-et adtak
> ugyanarra a fára, tehát mérés előtt definiálni kell, mit számolunk.

| | becslés | **mért** | fájl |
| --- | --- | --- | --- |
| Nyers gombfelirat | 36 | **29** | 15 |
| Nyers `title=` literál | 13 | **31** | 21 |
| Nyers `aria-label` | — | **22** | 15 |
| Nyers `placeholder` | — | **8** | 5 |
| Nyers `hint` / magyarázó sor | — | **8** | 5 |
| Nyers `label` (kapcsoló felirata) | — | **6** | 4 |
| Nyers `summary` (kártya-összegző) | — | **3** | 3 |
| Nyers `alt` | — | **2** | 2 |
| **Összes nyers literál** | — | **102** | **30** |

A 31 `title=` literál 28 különböző szöveg, 21 fájlból. Ebből **19 kártyacím**
(`Mérföldkövek`, `Hatásmátrix`, `Saját téma szerkesztése`, `Mai célok`,
`Okosóra import`, `Késleltetett hatások (lag elemzés)`, `Napi emlékeztető`,
`Hangulat-naptár` …), **2 megerősítő-dialógus címe** (`Törlöd a
nyomonkövetőt?`, `Biztosan törlöd?`), **4 tengely-cím** a lag-kártyán
(`A tevékenység napján`, `A következő napon`, `Két nappal később`, `Egyéb napok
átlaga`), **2 üres-állapot címe** (`Még nincs elég adat`) és **1 alcím** az
appfejlécben (`Egymás utáni napok naplózással`). A fennmaradó három duplikáció
(`Alkalmazásként`, `Gyógyszeridőpontok`, `Még nincs elég adat`) ugyanaz a
szöveg kétszer, két helyen.

A másik fele a katalógus: **521 kulcs** a `src/lib/i18n.ts`-ben. Ezt nem
szövegszövegben, hanem szűréssel auditáltam — minden kulcs végigment a
riasztó-egészségügyi, a regiszter-egyenetlenségi és az olvashatósági szűrőn
(§4).

---

## 1. A megállapítások, sorrendben

### P1 — `crisis.disclaimer`: az egyetlen formális mondat az egész katalógusban

```
crisis.disclaimer   Ez nem diagnózis. Önreflexiós összegzés. Ha aggodalomra
                    ad okot, forduljon szakemberhez.
```

Ez **521 kulcsból az egyetlen**, amely „Ön" címezésű. Minden más mondat
te-formájú: *„kérdezd meg orvosodat"*, *„Írhatsz egy-két mondatot"*,
*„Rögzíts ugyanazt"*, *„Bármikor kikapcsolhatod"*.

Ez a kártya — `Ha segítségre van szükséged` — a segélyhívásokat tartalmazza.
Pont az az a hely, ahol a távolság a legkárosabb: aki éppen a legrosszabb
napját éli, annak a legkevésbé kellene hivatalosnak éreznie az appot. A
„forduljon szakemberhez" egyben gyengébb is: a magyarban a „forduljon valaki
hez" orvosi/hatósági ügyintézést jelent, nem odafigyelést.

**Javaslat:**

> Ez nem diagnózis, hanem összegzés arról, amit írtál be. Ha valami aggaszt,
> érdemes szakemberrel beszélni.

Három dolgot csinál egyszerre: kiesik az „Önreflexiós" (irodalmi, ma már
idegen), kiesik a passzív „forduljon" (te-formával él a telefon), és a
szakemberhez fordulás tanács, nem utasítás.

### P2 — `készülékedön`: elírás az adatvédelmi ígéretekben, négyszer

```
settings.privacy.local     Minden adat a saját készülékedön tárolódik (böngésző-tároló).
onboarding.intro           Egy hangulatnapló, ami percek alatt megtanulja, mi emeli vagy rontja a
                           közérzetedet. Minden adat a készülékedön marad.
assessment.consentBody     … Az eredményeid a készülékedön maradnak. …
```

A helyes alak **`készülékeden`** (rövid `ö` a szuffixben). Mindhárom előfordulás
az *„adataid a te készülékeden maradnak"* ígéret mondatában — vagyis pont
abban a három mondatban, amelyben az alkalmazás a leginkább fogad ígéretet. Egy
nyelvhelyességi hiba itt nem esztétikai: azt sugallja, hogy a szöveget senki
nem olvasta el, aki érti a magyar adatvédelmi nyelvezetét.

**Javaslat:** mind a négy helyen `készülékedön` → `készülékeden`. Négy karakter,
és a bizalomra vonatkozó állítások lesznek tisztán.

> **Pontosítás (Phase 4, alkalmazás közben).** Ez a finding első írásakor három
> előfordulást számolt, mert csak a `src/lib/i18n.ts`-t nézte. Egy negyedik
> élve volt az `InstallPrompt.tsx` telepítő-sávjában — nem kommentben, hanem
> egy `<p>`-ben, amit az olvasó lát. Egy adatvédelmi ígéret sem lehet kivétel
> attól, hogy „nincs katalógusban".

### P3 — `tools.workouts.disclaimer`: hibás mondatszerkezet, egészségügyi szövegben

```
tools.workouts.disclaimer  Ezek általános életmód-javaslatok — nem orvosi tanács.
                           Sérülés, krónikus betegség vagy terhesség esetén kérdezd meg
                           orvosodat, mielőtt elkezded.
```

A „Sérülés, krónikus betegség vagy terhesség esetén" felsorolás nem
grammatikus ilyen formában: a „sérülés" nem olyan, mint a másik kettő — egy
állapot, amit *az embernek van*, nem betegség, amit *a tanács* említ. Ez a
mondat jelenleg annyit mond, hogy *az általános életmód-javaslatok* esnek
sérülés esetén.

**Javaslat:**

> Ezek általános életmód-javaslatok, nem orvosi tanács. Ha sérülésed van,
> krónikus betegséged, vagy terhes vagy, előbb kérdezd meg orvosodat.

### P4 — a gyógyszer-hang: „pipáld"

```
today.meds.empty            Add hozzá a gyógyszereid, és naponta pipáld, ha bevetted őket.
settings.modules.medsHint   Naponta pipálható gyógyszerlista.
```

A „pipál" triviális, gyerekes hang. Ez az egyetlen képernyő, ahol a felhasználó
a saját gyógyszeres kezelését követi — az adagolás beírása ott nem triviális
cselekedés. Az „emlékeztető", „bevetted", „kipótolt" register passzol; a
„pipál" egy külső, gyerekes szó, és pont az az a képernyő, ahol az
ellenkezőjét várjuk.

**Javaslat:**

| most | javaslat |
| --- | --- |
| `Naponta pipálható gyógyszerlista.` | `Azok a gyógyszerek, amelyeket naponta kell bevenned.` |
| `Add hozzá a gyógyszereid, és naponta pipáld, ha bevetted őket.` | `Add hozzá a gyógyszereid, és jelöld be, ha bevetted őket.` |

### P5 — `tools.library.intro`: „ha valami nem üres"

```
tools.library.intro  Rövid, hétköznapi szövegek arról, ami a naplóban felmerül.
                     Nem diagnózis, csak magyarázat — ha valami nem üres,
                     érdemes szakrendelt megkérdezni.
```

A „nem üres" az adat- és fájlvilág nyelve. Az olvasó nem adatot tölt fel, hanem
érzést él: nála az üres helyre *rossz érzés* kerül. A mondat így az ellenkezőjét
mondja annak, amit szeretne — aki rosszul érzi magát, nem azt érti, hogy
„nem üres" a naplója.

**Javaslat:** … *„ha valami aggaszt, érdemes szakemberrel beszélni"* — a P1
képletével összhangban, hogy az app egy hangon szóljon arról, mihez érdemes
mást hívni.

### P6 — két törlés-megerősítés, két mintázat

```
EntryDetail.tsx:239        Biztosan törlöd?
CustomTrackerManager.tsx:139  Törlöd a nyomonkövetőt?
```

Mindkettő nyers literál (nem katalógusos), és nem ugyanaz a szabály: az egyik
cselekvést kérdez rá, a másik a dolgot nevezi meg. Két azonos súlyosságú
törlés a kétféle megfogalmazás miatt másnak érződik — a „Biztosan" változat
lágyabb, ahol a pusztító hatás ugyanakkora.

**Javaslat:** egységes **„Biztosan törlöd ezt a bejegyzést?"** / **„Biztosan
törlöd ezt a nyomonkövetőt?"** — a tárgy a második mondatban jön, így a
viselkedés azonos marad, a célpont mégis látszik. Mindkettő katalógusba kerül.

### P7 — szakzsargon egy kártyacímben

```
LagAnalysisCard.tsx:18   Késleltetett hatások (lag elemzés)
```

A zárójel *magyarázat helyett újra elnevezi* a dolgot: aki nem tudja, mi a
„lag", annak a „Késleltetett hatások" önmagában sem mond semmit; aki tudja,
annak a „lag" felesleges. A kártya valójában azt mutatja, hogy *melyik
tevékenység másnapra vagy két napra tünt fel*. Ez szó szerint leírható.

**Javaslat:** **`Melyik tevékenység jött vissza később?`** — a kérdés alakja
azt is jelzi, hogy ez egy kérdésre adott válasz, nem egy statisztikai
fogalom.

### P8 — 102 nyers literál: a katalógus megkerülése

Ez a legnagyobb tétel, de nem szövegbhiba: **a 102 nyers literál lefordíthatatlan.**
A `translationKeys()` minden kulcshoz kereshető katalógusbejegyzést vár; aki
`Kipróbálom`-ot ír kódba, annak a szövege az `en` és a `de` nyelven biztosan
ugyanaz marad, és egyik teszt sem fogja szólni.

Négy nagyobb tömeg, ha a jóváhagyás után erre sort kerítünk:

| Hol | Darab | Példa |
| --- | --- | --- |
| Biztonság (PIN, zárolás) | 11 | `PIN módosítása`, `Új PIN újra`, `Feloldás` |
| Kvadráns-nézletek | 8 | `Még nincs elég adat`, `Érzés és kontextus` |
| Import, időjárás, AI, telepítés | 20 | `Okosóra import`, `Étkezés AI — fotóelemzés` |
| Adatvédelem (jelölők) | 8 | `Szívritmus és vértelítettség`, `Készülék helymeghatározása` |

A sorrend fontos: **előbb a gombfeliratok, utána a kártyacímek, végül a
`hint`-ek.** A `hint` a legkevésbé sürgős — a `label` nélkül egy magyarázó sor
elveszti a hozzáférési nevet, de a gombfelirat nélkül nincs mit nyomni.

---

## 2. Ami rendben van, és nem nyúlok hozzá

- **A `Mentés` / `Mégse` / `Vissza` / `Kész` család konzisztens** a katalógusban
  és a nyers literálokban is. Tizenöt gomb, négy szó, nincs elcsúszás.
- **A krízis-kártya címe és súgója** (`Ha segítségre van szükséged`,
  `Ingyenes és éjjel-nappal elérhető. Nem kell előtte bejelentkezned.`)
  pontosan jó: meleg, konkrét, és kimondja, hogy nincs akadály. A P1 az
  *diszclaimert* bántja, ezt nem.
- **Az önkorlátozás tisztán kimondva.** `insights.more.disclaimer`
  („nem orvosi tanács és nem diagnózis") és `assessment.consentBody` („Nem
  vizsgál, nem szűr, és nem állít fel semmilyen diagnózist") — ez a két mondat
  jobb, mint amit az alkalmazások többsége ír. Ezeket változatlanul hagyom.
- **A kapcsolók „alapból kikapcsolva" mondatai** (`WeatherApiCard`,
  `FoodAiSettingsCard`, `HealthImportCard`) következetesen kimondják, hogy a
  ki- és bekapcsolás mit érint. Ez a legkevésbé magától értetődő
  beleegyezés-kezelés, és itt már jó.

---

## 3. Amit ez az audit nem állít

- **Nem mérte, hogy valaki rosszul olvassa-e.** Ez szövegelemzés; a
  megállapítások arról szólnak, mit mond a szöveg, nem arról, mit ért meg
  belőle.
- **A „modern" itt nem trendi stílus.** A te-formájú, rövid, konkrét mondat
  nem divat: a magyar egészségügyi és mentési alkalmazások nagy része a
  formális, irodalmi hangot használja, és az itt dokumentált problémák
  éppen abból erednek. A cél az, hogy a lehető legkevesebb olvasónak
  kelljen megállnia egy mondat közepén.
- **A P4 „pipáld" javaslata nem orvosi tanács.** Csak registerkérdés arról,
  milyen szóval beszélünk valakinek a saját gyógyszeres kezeléséről.