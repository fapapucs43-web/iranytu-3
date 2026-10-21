# Belső Iránytű — widget iOS-on: Shortcuts + Siri, lépésről lépésre

> **Ez NEM natív widget.** Az iOS nem engedi, hogy egy PWA natív kis widgetet
> rakjon a Főképernyő oldalára — ez hardver/rendszer-szintű korlát, nem hiba.
> A megoldás, ami itt le van írva: **Shortcuts-alapú widget** + a manifest
> **`shortcuts`** menüje + **Siri** hangparancsok. Ugyanez az öt deep link
> működik mindenhol, mert mind ugyanazt a `?quick=` szótárat használja:
>
> | Cél | URL | Amit nyit |
> |---|---|---|
> | Mai hangulat | `https://iranytu2.freebuff.app/?quick=mood` | Ma fül, hangulat-kártya |
> | Új bejegyzés | `https://iranytu2.freebuff.app/?quick=entry` | Ma fül, hangulat-kártya |
> | Légzés | `https://iranytu2.freebuff.app/?quick=breath` | Felfedezés → Terápia fiók |
> | Meditáció | `https://iranytu2.freebuff.app/?quick=meditate` | Felfedezés → Terápia fiók |
> | Napló | `https://iranytu2.freebuff.app/?quick=journal` | Napló fül |
>
> **Előfeltétel:** a PWA telepítve legyen a Főképernyőre
> ([ios-install-guide.md](./ios-install-guide.md)). Csak így nyílik appként,
> nem a Safari címsorával együtt.

---

## 1. Egy Shortcut létrehozása — az 5 akció

Csináld végig egyszer, és kész: öt kis shortcut, mindegyik egy URL.

1. Nyisd meg a **Shortcuts** appot (gyári minden iPhone-on).
2. Koppints felül az **+** gombra (új shortcut).
3. Koppints a **„Add Action" / „Akció hozzáadása"** gombra.
4. Keresd meg az **„Open URL"** akciót (magyar rendszeren: *URL megnyitása*), és koppints rá, hogy bekerüljön.
5. Koppints a **URL mezőre**, és írd be az első linket:

   ```
   https://iranytu2.freebuff.app/?quick=mood
   ```

6. Nevezd el a shortcutot: koppints a felül lévő névre (a „New Shortcut"
   szövegre) → **Rename** → írd be: **Hangulat**.
7. Kész az első. **Ismételd a 2–6. lépést** a többi négyhez:

   | Shortcut neve | URL |
   |---|---|
   | Hangulat | `https://iranytu2.freebuff.app/?quick=mood` |
   | Bejegyzés | `https://iranytu2.freebuff.app/?quick=entry` |
   | Légzés | `https://iranytu2.freebuff.app/?quick=breath` |
   | Meditáció | `https://iranytu2.freebuff.app/?quick=meditate` |
   | Napló | `https://iranytu2.freebuff.app/?quick=journal` |

> A rövid név számít: ez jelenik meg a widgeten és a Főképernyő-ikonon.
> A hosszabb leírásos név (pl. *„Hangulat – Belső Iránytű"*) a Settings →
> Shortcut-ok listájában látszik.

**Gyors ellenőrzés:** koppints a shortcut fején a **▶️** futtatás gombra —
meg kell nyílnia a telepített appnak a megfelelő fülön/fiókban. Ha Safari-ban
nyílik meg, a PWA nincs telepítve ([ios-install-guide.md](./ios-install-guide.md)).

---

## 2. Widget hozzáadása a főképernyőre

Ez teszi a shortcutokat „widgetté": egy 2×2-es négyzet, benne a kiválasztott
akciók nevei.

1. A Főképernyőn **hosszú koppintás** egy üres helyre (amíg az ikonok remegni nem kezdenek).
2. Koppints felül a **„+”** gombra (bal felső sarok).
3. Görgess a listában a **Shortcuts** alkalmazásig, és koppints rá.
4. Válaszd ki a **nagyobb méretet** — a 2×2-es, „4 akciós" nézetet
   (húzd jobbra/balra a méretek között), majd koppints a
   **„Add Widget / Hozzáadás"** gombra.
5. A widget ott van. Most szerkeszd: **hosszú koppintás a widgetre** →
   **„Edit Widget / Widget szerkesztése”**.
6. A **„Shortcut”** sorban jelöld ki azt a **négy shortcutot**, amelyiket
   látni akarod (a miénknél: Hangulat, Bejegyzés, Légzés, Meditáció — az
   ötödik, a Napló a listából választható, ha inkább azt akarod).
7. Koppints ki a szerkesztőt (a képernyő üres része) — kész.

**A widgeten megjelenik a shortcut neve**, koppintásra lefut, és az app a
megfelelő helyen nyílik meg. Élő adat (pl. mai hangulat) nem jelenik meg
rajta — ahhoz natív widget kellene, ami PWA-ből nem lehetséges.

---

## 3. Alternatíva: egyetlen Shortcut, ami megkérdezi

Ha nem akarsz öt külön shortcutot, csinálj **egyet menüvel** — ez is
widgetként tehető ki, és koppintásra öt lehetőséget kínál.

1. Shortcuts app → **+** (új).
2. Keresd az **„Choose from Menu / Válassz a menüből”** akciót, és add hozzá.
3. A menü fejlécébe írd be: **„Belső Iránytű”**, az első lehetőségnek nevezd
   **Hangulat**nak, és adj hozzá a **„+”** gombbal még négyet:
   **Bejegyzés**, **Légzés**, **Meditáció**, **Napló**.
4. A menü minden sora alá tegyél egy **„Open URL / URL megnyitása”** akciót, és
   a hozzá tartozó linket írd be a táblázatból (a `?quick=mood` a Hangulat
   sorához, `?quick=entry` a Bejegyzéshez, stb.).
5. Nevezd el (**Rename** → *„Belső Iránytű”*), és tedd ki a főképernyőre a
   2. pont lépéseivel.

Egy widget, öt akció, egy koppintás + egy választás.

---

## 4. Siri hangparancsok

Minden shortcut automatikusan Siri-parancsattá válik az **aliasa** alapján:

1. Nyisd meg a shortcutot a Shortcuts appban.
2. Koppints a **„…”** gombra → **Details / Részletek**.
3. Kapcsold be: **„Show in Siri / Megjelenítés Siriben”**, és írd be az
   **aliast** (a rövid nevet, amit mondani fogsz).

Ajánlott aliasok — ezt mondhatod:

| Amondat | Amit csinál |
|---|---|
| **„Hé Siri, hangulat”** | Megnyitja a Ma fület a hangulat-kártyánál |
| **„Hé Siri, bejegyzés”** | Új bejegyzés a Ma fülön |
| **„Hé Siri, légzés”** | Légzésgyakorlat a Terápia fiókban |
| **„Hé Siri, meditáció”** | Meditációválasztó a Terápia fiókban |
| **„Hé Siri, napló”** | A Napló fül |

> A Siri először megkérdezheti, hogy futtathatja-e a shortcutot — válaszolj
> **„Mindig”**, és legközelebb már egy mondatból nyílik.

**Shortcuts widget + Siri együtt:** a widget a szemnek, Siri a hangnak —
ugyanaz az öt URL mögötte, ezért amit az egyikben módosítasz, azt a másik is
ugyanúgy hajtja végre.

---

## 5. Hibakeresés

| Tünet | Ok | Megoldás |
|---|---|---|
| Safari-ban nyílik meg | A PWA nincs telepítve | [ios-install-guide.md](./ios-install-guide.md) |
| Megnyílik, de nem a kért helyen | Elírt URL — a `?quick=` értékét ellenőrizd | A táblázatban szereplő pontos érték kell: `mood`, `entry`, `breath`, `meditate`, `journal` |
| Nincs „Add to Home Screen” a Safariban | Más böngészőből nyitottad | Csak Safari tudja |
| A widget üres | Nincs kiválasztott shortcut | Hosszú koppintás → Edit Widget → Shortcut kiválasztása |
| A Siri nem érti | Nincs alias | Részletek → Show in Siri + alias |

**Érintetlenül marad:** az app adatai a készüléken vannak — a shortcut csak
ugyanannak a webalkalmazásnak egy másik bejárata, nem külön telepítés.
