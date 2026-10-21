# Final audit v5 — Belső Irrigation

A záró batch auditja. Előzmény: `final-audit-v4.md` (`cc1b4c9`) és
`final-audit-v3.md` (`bd57244`) — **mindkettő érintetlen**, az a commit
állapota, nem a mostani fa. Ez újraméri a jelenlegit.

Minden szám újramérvebb.

| | v4 (`cc1b4c9`) | **v5 (`eaaa8e3`)** |
| --- | --- | --- |
| tesztfájl | 91 | **92** |
| teszt | 2 801 | **2 815** |
| i18n kulcs | 524 | **932** |
| nyers magyar literál | 74 egy definícióval | **196** az elején, **0** ma (AST-tel mérve) |
| runtime függőség | 10 | **10** (változatlan) |
| precache | 39 entry / 2 924 640 B | **39 entry / 2 924 639 B** |

Tíz függőség. A teljes UX audit — négy fázis és a záró batch — alatt **egy sem
jött be**.

---

## 1. Mi épült ebben a batchben

### A mérés maga volt a munka nagy része

A batch „29 nyers gombfelirattal" indult. **Ez a szám nem létezett.** Hat
regex-passzus ugyanarra a fára 14 / 22 / 29 / 74 / 102 / 800 eredményt adott,
és mindegyik más kérdést回答olt. A legveszélyesebb az volt, hogy **alul
számoltak**: egy 29-re szabott katalógus-söprés 167 stringet érintetlenül
hagyott volna, késznek látszóva.

A megoldás `scripts/extract-raw-strings.mjs` — a projektben lévő `typescript`-
tel parse-ol, **0 új függőség**. A négy dolog, amit a regex nem tudott
szétválasztani, négy node-fajta: `JSXText`, string literálú attribútum, trivia,
és nem-JSX literál. A **196** így mérhető, és a definíció a fájlban van.

### `--danger-soft`: a kérés premisszáa téves volt

A feladat leírása szerint a `--danger-soft` kézzel írt `:root` hex volt, és
témánkénti értéket kellett volna adni neki. **Mérés szerint nem így állt:**
`themes.ts` mind a négy palettán hordozta, a `VAR_NAMES` továbbította, az
`applyThemeTokens` beállította, és mindhárom CSS-használat `var()`-t olvasott.
Egyetlen új színértéket nem találtam ki, mert nem volt mit pótolni.

| Téma | `--danger` | `--danger-soft` | Kontraszt |
| --- | --- | --- | --- |
| light | `#b3424f` | `#f6e7e3` | **4.58** |
| dark | `#e07a86` | `#332e2c` | **4.65** |
| warm | `#af4637` | `#f5e4db` | **4.53** |
| vibrant | `#bd3065` | `#f7e6ed` | **4.64** |

Ami valóban rossz volt, a **guard saját dokumentációja**, háromféleképpen:
azt állította, hogy a token „NEM téma-token", hogy a `:root` kézzel deklarálja
(`#f6e3e5`, ami a valós `#f6e7e3` transzponáltja), és hogy „a helyes megoldás a
`--danger-soft` téma-tokenné tétele, ami külön változtatás". Mindhárom az
ellenkezője volt annak, ami ugyanabban a fájlban alatta állt. **Egy őrző, amely
azt írja le, hogy a hiba még fennáll, miközben a hiba alatta már javítva van,
 alaposan felszólítja a következő olvasót.**

A pinelt kétoldali érték (`DANGER_SOFT_FLOOR = "#f6e7e3"`, a light érték második
példánya) eltűnt, és a guard többé nem lehet vakuum: **a saját mutációját
futtatja a suite-ben.** Visszaváltva a darkot a light értékre, ugyanazt az
állítást követeli és **követeli a bukását**. Ez a mutáció 3 tesztet vörösített.

### Coverage-padló a négy nézetre

`tests/views/coverage-guard.test.ts` — 13 teszt. A `src/lib`-re már létezett
dead-export őrző; a négy nézetre nem, és az aszimmetria valós: ők az app
legnagyobb fájljai (~500 és ~700 sor), és minden funkció először oda kerül.

A szabály **az első futáson hibás volt, és a javítás a lényeg.** Ha `name(`-t
követelt, a SettingsView-ban **8 „holt" függvényt** jelzett — `VoiceIntake`,
`DataSection`, `confirmEnable`, `exportCsv` és további négy —, mind
`<Component />`-ként vagy propként átadva. **Egy nézet fele hivatkozással
fogy.** A szabály most elérhetőséget kér, nem hívási szintaxist.

Mutation proof: egy nem használt import a `TodayView`-ban a guardot vörösítette,
**a fájlt és az azonosítót is megnevezve**.

---

## 2. Teljes funkció-leltár

**Naplózás magja.** Hangulat-mékoordináták, szabad szöveg, tevékenységek,
nyomonkövető-értékek, mellékletek; CSV- és JSON-export, import egyetlen ajtóval
és ott javítással.

**Hangulat koordináta.** 0–10 × 0–10, ebből négy kvadráns. Nem öt szint.

**Négy fül.** Ma · Napló · Elemzés · Beállítások — `src/types.ts` deklarálja
unióként, nem útvonaltáblázatként.

**Ma.** Hangulat, stressz, energia, napló, aktivitáscímkék, heti reflektálás,
és a **12 elemes Eszköztár**: légzés, meditációk, CBT-űrlap, mikro-lecke,
kísérlet, szokásstreakok, hál gratitude, időjárás, edzésprogramok,
táplálkozási tippek, sporttippek, okosóra-import.

**Napló.** Naptár valós streakkel, keresés és szűrők, bejegyzés-szerkesztés és
-törlés.

**Elemzés.** Hetes számok, év-naptár, trend, korrelációs mátrix, késleltetett
hatások, kvadráns-összefüggések, export, havi/éves statisztika, mérföldkövek,
minták.

**Beállítások.** Nyolc csoport: Személyes · Megjelenés · Navigáció ·
Nyomonkövetés · Emlékeztetők · Biztonság · Mentés és export · Egyéb. A krízis-
kártya pinelt, felette mindennek. A **kártyák sorrendje** olvasói döntés.

**Adatvédelem és hálózatalom.** Nincs fiók, nincs szerver. A titkosított
biztonsági mentés a készüléken marad.

**Nyelv.** Magyar a forrás (932 kulcs), `en` 3 kulcs, `de` 2 kulcs. Ez
szándékos és mérhető — de **„le van fordítva" állítást nem lehet mondani**.

---

## 3. Ismert korlátok

**A nyelvváltó továbbra sem működik.** Nem azért, mert a szövegek helyen
lennének — mind a 932 katalógus-kulcs a helyén van. Hanem azért, mert az
`en` és a `de` katalógus gyakorlatilag üres (3 és 2 fordított kulcs), és a mérés
nem ezért, hanem a szövegek helyéről szólt. Ez egy külön feladat.

**Az i18n-teszt visszafelé olvas.** Minden kulcsnak literális `t("KEY")`
hívásnak kell lennie a `src/`-ben. Ez helyes — de azt jelenti, hogy a
katalógus nem bővíthető felezve: egy bekötetlen kulcs azonnal piros fát ad.
Ezért nem lett félkész sweep. A söprés 14. köre után ez a visszafelé olvasás
kimutatott valamit, amit érdemes kimutatnia: a `tegezoRule` stílusőr, ami csak
a katalógust nézi, megtalálta a formális megszólítást, amit előtte egyetlen
guard sem tudott volna.

**A `lib/weeklyReflection.ts` kérdései** olvasónak szólnak, de nem JSX-ben
vannak, így a kivonatoló nem számolja őket. Szerkesztői döntés kell róluk.

**A késleltetett hatások küszöbe négy bejegyzés**, és ez nem elég semmilyen
következtetéshez. A kártya kimondja. Ugyanez a kvadráns-nézletekre: két nap
azonos kontextus kell, és a magyarázat a negyedik fülön jelenik meg, nem
ott, ahol az adat keletkezik.

**A törölt bejegyzés végleges.** Megerősítő dialógus igen, visszavonás nem.

**Nincs sorlefedettség-mérés.** A guard elérhetőséget kér, nem futási utat —
nincs futtató, ami a másodikra válaszolna.

---

## 4. A literál-söprés: mind a tizennégy kör kész

A 4. pont korábbi változata azt ígérte, hogy a söprés minden. Ez a frissítés
mérőszámmal és két olyan találattal jön, ami a mérésnél többet ért.

**Kész: mind a tizennégy kör.** 196 → **0 literál**, 31 → **0 fájl**. Minden
kör ugyanazokat a kapukon ment át: typecheck, a teljes tesztsor, a build, és
egy byte-szintű bizonyítás arra, hogy egyetlen magyar betű sem mozdult — kivéve
azokat, amelyeket a söprés láthatóvá tett, és amelyeket szándékosan javítottunk.
A katalógus 524 → **932 kulcs**. A `docs/i18n-sweep-list.md` „219"-et ír a
`t()`-n keresztül elért magyarról, és ez **nem ugyanaz a szám, mint amit elsőre
olvasásra érteni látszik**: az a walk által látott `t()` híváshelyek száma,
nem az összes kulcsé. A 15. és 16. kör után különbség keletkezett — 69 új
kulcs `lib/icon-policy.ts`-ben és `lib/fonts.ts`-ben hívódik, `.ts` fájlokban,
amiket a walk nem jár. Ezért a dokumentum **nem azt mondja, hogy minden
kulcs elérhető**, hanem azt, amit mérni tud — és a mérés korlátja most már
neve van a generátorban (`measurable` a headline-ban).

**A mérés, ami a listát adta, négyféle módon vak.** Ez a fontos rész, és az
196 nem a teljes szám — egy alsó becslés volt, négy okból:

1. **A `catch` blokkokban és a függvénytestekben lévő szöveget nem látja.**
   A PIN-kártyán öt mondat, a csatolmányoknál öt, az(entryDetail ban hat —
   mindegyik magyar, amit az olvasó olvas.
2. **Az ékezetes magánhangúz teszt kihagyja azokat a szavakat, amelyekben
   nincs ékezetes magánhangú.** `Stressz`, `Energia`, `Pulzus`, `Jegyzet`,
   `Vissza`, `Kihagyom`, `Mikro-lecke`, `Kontextus`. A bejegyzés-dialógus
   statisztikai sora NÉGY ilyen címkét tartalmazott — és egyik sem szerepelt a
   mérésben, pedig minden bejegyzés megnyitásakor látható.
3. **A címek, amelyek feltételes kifejezésben lévő literálok, nem JSX-szöveg.**
   A rögzítési folyamat három lépéscíme így rejtőzött.
4. **A sablonliterálok (`\`${label}\``) sem JSX-szövegek.** A rögzítési
   folyamat két `aria`-szövege — amit képernyőolvasó olvas fel — és az
   `announce` üzenet így volt teljesen kulcs nélkül.

Ezek együtt **a mért 196 helyett kb. 260 olvasott magyar** — a szám a becslés
alsó korlátja volt, nem a valóság. Ezt a kivonatolót egyébként most már
őrzi a `tests/i18n-sweep-list.test.ts`: újra generálja a listát egy scratch
fájlba, és bájtra összeveti a commitolt változattal.

**A guard, amit a söprés maga hozott létre.** Az első kör befejezésekor a
generátor összeomlott: a `byFile` csak a még mindig literálokat tartalmazó
fájlokat ismeri, szóval a kör-lettag ellenőrzés **letiltotta, hogy egy kör
egyáltalán befejeződjön**. Egy őrző, amely megtiltja a munka célállapotát, nem
őrző. Javítva — és ez a fajta hiba pontosan azért rejtőzhetett, mert a
söprés addig soha nem futott végig.

**Mi maradt a mérésen BELÜL.** Semmi — és ez a legfontosabb új tény. A
`docs/i18n-sweep-list.md` nullát mér, tizennégy körből tizennégyet „már
söpröt", és a `tests/i18n-sweep-list.test.ts` ezt bájtra ellenőrzi.

**De a mérés nullája nem azonos az alkalmazás nullájával, és ezt a különbséget
most már őrzi is valami.** A mérés `src/**/*.tsx` fájlokat jár és két csomópontot
olvas: `JSXText`-et és egy `title`/`placeholder`/`aria-label`/`label`/`summary`/
`badge`/`alt` attribútumot. Ami kimarad, az nem hiba, csak más fajta: egy
függvénytestben lévő szöveg, egy `object literal` a `lib/`-ben, egy
sablonliterál. A 14. kör byte-ellenőrzése pont ezt mérte fel — beolvasta mind a
hét fájl minden ékezetes literálját, és megkérdezte, melyik kulcs tartozik
hozzá. A válasz **újabb tizenegy felhasználó által olvasott mondat** volt, amiket
a mérés sosem látott: az év-naptár három skálája egy `map` törzsében, az
„Válassz egy napot a naptárban.", és a kitüntetések két összegző sora. Ezek
mind felvételek, nem maradékok.

**Két valódi hiba, amit a söprés láthatóvá tett, és amit a mérés sosem foghatott
volna meg:**
- „Miből **vegye** a háttértakarás a színét" — a formális megszólítás, amit a
  `lib/tegezoRule` mindenhol másutt tilt. Semmi nem látta, mert a szöveg egy
  komponensben élt, és a stílusőrök csak a katalóguson futnak.
- „a **takrás** átlátszatlan" — elírás, élő felületen.

A harmadik egy hiba, amit **én** követtem el, és a byte-ellenőrzés fogott meg:
a kvadráns-sor kulcsa `(percent}%)`-t tartalmaz, a komponens viszont
`${row.percent}%`-ot adott át, ami `60%%`-ot rendersz. Minden más őrző zöld volt.
Ezért létezik most két új teszt: az egyik azt állítja, amit az összeállított
mondatok renderelnek, a másik azt, hogy a hívó helyek azokat az értékeket
adják át, amiket a mondatok feltételeznek.

**Bejegyzés-visszavonás.** A törölés ma végleges; egy 30 másodperces visszavonás
a legkisebb ráfordítású biztonsági háló.

**A kvadráns-nézletek felvitele az adatrögzítés oldalára** — a négy adathoz
kellő kvadráns az érzésnél keletkezik, a magyarázatnak is ott kellene lennie.

---

## 5. Amit ez az audit nem állít

- **Nem mért használhatóságot.** Senki nem tesztelt valós olvasóval.
- **Nem állítja, hogy az alkalmazás kész.** Egy offline hangulatnapló sok
  embert sokáig nem érdekel.
- **A lefedettség-őrző nem bizonyít elérhetetlen kódot.** Megmondja, hogy egy
  név elérhető-e; nem azt, hogy lefut-e.
- **A „mérhető lefedettség" a kulcsszámokra vonatkozik**, nem a jó fordításra.
  Egy kulcs lefordítva még rossz is lehet — a 196 nyers literál bizonyítja,
  hogy a szám nem mond semmit a minőségről.