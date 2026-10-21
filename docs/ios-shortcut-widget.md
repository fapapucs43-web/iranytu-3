# Belső Iránytű — „widget" iOS-ra, Shortcuts-szal

## Miért nem natív widget?

Az iOS **nem engedi**, hogy egy PWA (vagy egy weboldal) natív kis widgetet rakjon a
Főképernyő oldalára — a widget-kit a SwiftUI-ből épül, és ahhoz App Store-alkalmazás
kellene. Viszont a **Shortcuts** app ugyanazt a felületet adja: a főképernyőre
kitett shortcut ikonja egy koppintásra indul, és a Főképernyő widgetje is
megjelenítheti a nevét.

A Belső Iránytű ehhez a szükséges horgonyt is adja: a
`https://iranytu2.freebuff.app/?quick=mood` URL-t az app megnyitáskor **a Ma fülre**
ugratja (`?quick=mood` → `today`), aztán a paramétert ki is törli a címsorból, hogy
ne ragadjon meg könyvjelzőkben.

## 1. A Shortcut létrehozása

1. Nyisd meg a **Shortcuts** appot (előre telepítve van minden iPhone-on).
2. Koppints a **+** (új shortcut) gombra.
3. Keress rá az **„Open URL"** műveletre, és add hozzá.
4. Az URL mezőbe írd be pontosan:

   ```
   https://iranytu2.freebuff.app/?quick=mood
   ```

5. Koppints a shortcut nevére (felül), és nevezd el:

   ```
   Belső Iránytű – Mai hangulat
   ```

6. Koppints a **…** gombra → **Add to Home Screen** (Főképernyőhöz adás).
7. Adhatsz neki saját ikont és színt, majd **Add** (Hozzáadás).

Kész — a főképernyődön ott egy „widget-ikon", a neve: *Belső Iránytű – Mai
hangulat*. Koppintásra a Shortcuts lefuttatja a lépést, és az app **a Ma fülen**
nyílik meg.

> A shortcut neve jelenik meg a főképernyő-ikonon és a widgeten is, ezért érdemes
> rövidnek és beszédesnek hagyni.

## 2. Widget a Főképernyőn (Shortcuts widget)

A Shortcuts saját widgetet is tud, ami a shortcut **nevét** jeleníti meg:

1. Hosszú koppintás egy üres helyre a Főképernyőn → **Widget hozzáadása**.
2. Keresd meg a **Shortcuts** appot.
3. Válaszd ki a méretet (kicsi/közepes/nagy), és koppints a **Hozzáadás** gombra.
4. A widgeten megjelenik a *Belső Iránytű – Mai hangulat* név — koppintásra
   lefut, és nyílik az app a Ma fülön.

Így a Főképernyőd bal oldali „oldalán" is ott a bejegyzés-indító.

## 3. Alternatíva: „Open App" művelet

Ha a shortcutnak nem URL-t, hanem közvetlenül az appot akarod megnyitni:

1. Új shortcut → keresd az **„Open App"** műveletet.
2. Válaszd ki a **Belső Iránytű** alkalmazást (csak telepítve, főképernyőről
   induló PWA-ként jelenik meg a listában).
3. Ugyanúgy: **Add to Home Screen**.

Ez egy koppintással nyitja meg az appot — de **nem** a Ma fülre, hanem ahonnan
utoljára bezártad. Ha a napi bejegyzést szeretnéd egy koppintással, az URL-s
változat (1. pont) a jó, mert a `?quick=mood` mindig a Ma fülre visz.

## 4. Hibakeresés

| Tünet | Ok | Megoldás |
| --- | --- | --- |
| Safari-ban nyílik meg, nem appként | A PWA nincs telepítve a főképernyőre | [ios-install-guide.md](./ios-install-guide.md) szerint telepítsd Safariból |
| Megnyílik, de nem a Ma fülön | Elírt URL (pl. `?quick=mood` hiányzik) | Nyisd meg a Shortcuts szerkesztőjében, és pontosítsd a URL-t |
| A widgeten nincs név | Üres nevű shortcut | A Shortcuts szerkesztőjében adj nevet a shortcutnak |

## 5. Ami ezután jön

Ez a megoldás **kompromisszum**: a widgeten a shortcut neve látszik, nem élő
adat (pl. mai hangulat). Élő adatokat csak natív widget tudna megjeleníteni, ami
App Store-alkalmazást igényel — ez a PWA határa, lásd az
[ios-install-guide.md](./ios-install-guide.md) „Mit NEM tud" szakaszát.
