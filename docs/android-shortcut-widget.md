# Belső Iránytű — Android: telepítés és „widget"

## 1. PWA telepítés Androidra (Chrome)

Chrome Android **olvassa a manifesztet**, ezért itt egyszerűbb az iOS-nál:

1. Nyisd meg a Chrome-ban: <https://iranytu2.freebuff.app>
2. Koppints a **⋯** menüre → **Telepítés az alkalmazáshoz** / **Add to Home screen**
   (magyar Chrome-ban: *Alkalmazás telepítése*).
3. Koppints a **Telepítés** gombra.

Az app saját ikonnal jelenik meg a főképernyőn, **teljes képernyőn**, sáv nélkül.
A Chrome a `display: standalone` manifesztbeállítást és a 192/512-es ikonokat is
használja — nincs születő oldalsáv.

Vagy: a Chrome menüjéből → **Add to Home screen** ugyanezt csinálja, csak a
főképernyő-ikon adatait testre szabhatod (pl. rövidebb név).

## 2. Miért nincs natív widget?

- **Chrome Android:** a PWA-khoz **nincs** natív widget-támogatás — a Web Widget
  API-t a Chrome nem valósította meg.
- A **Google Play-alkalmazás-widget** (amit a bolt-alkalmazások használnak) egy
  SwiftUI/Android-View felület, tehát szintén nem érhető el egy webalkalmazásnak.

Amit viszont Androidon **meg lehet csinálni**, az a rövidítés-alapú „widget":

## 3. Shortcuts-alapú megoldás: főképernyő-rövidítés URL-lel

Ugyanaz a horgony működik, mint iOS-on: a `?quick=mood` paraméter megnyitáskor a
**Ma fülre** ugratja az appot (és utána ki is törlődik a címsorból).

1. A főképernyőn koppints hosszan egy **üres helyre** → **Widgets** vagy
   **Rövidítések / Shortcut** (a gyártó eltérően nevezi: Samsungon *Widgetek*,
   Pixelen *Widgets*).
2. A Chrome-ból vagy a telepített PWA-ból válaszd a **URL-rövidítés** / *Add link
   to Home screen* opciót, és add meg:

   ```
   Név:  Belső Iránytű – Mai hangulat
   URL:  https://iranytu2.freebuff.app/?quick=mood
   ```

3. A rövidítés ikonja a főképernyőre kerül, koppintásra az app **a Ma fülen**
   nyílik meg.

### Alternatíva A: telepített app rövidítései

Ha a PWA már telepítve van, **hosszú koppintás az app ikonjára** → a rendszer
megjeleníti a manifesztben deklarált *shortcutokat*. A Belső Iránytű manifesztje
tartalmazza is:

| Rövidítés neve | URL |
| --- | --- |
| Mai naplózás (Ma) | `/?quick=mood` |

Ez a legtisztább Android-megoldás: egy hosszú koppintás, és már nyílik is a Ma
fül — akár a rövidítést a dockba húzod, akár widgetként használod.

### Alternatíva B: launcher-widget (Nova, Smart Launcher stb.)

Ha a launcherod támogatja az *URL-widgeteket* (Nova Launcher, Smart Launcher,
Niagara stb.), ugyanazzal a névvel és URL-lel egy koppintásra induló widgetet
kapsz. Ez a launcher beállítása, nem az appé — a link ugyanaz:

```
https://iranytu2.freebuff.app/?quick=mood
```

## 4. Mit tud / mit nem Androidon

| | |
| --- | --- |
| Telepítés főképernyőre | ✅ Chrome (manifeszt: `standalone`, saját ikonok) |
| Offline működés | ✅ service worker + helyi tárolás |
| Értesítések | ✅ a telepített PWA-ban (Chrome támogatja) |
| Natív widget élő adatokkal | ❌ — PWA-ból nem lehetséges |
| Rövidítés a Ma fülre | ✅ manifeszt-`shortcuts` + `?quick=mood` |
| Háttérben futás | ❌ — bezárás után megáll |

## 5. Hibakeresés

- **„Nem jelenik meg a Telepítés opció"** — csak Chrome (vagy Edge) tudja; más
  böngészőben nem.
- **„Appként nyílik, de nem a Ma fülön"** — a rövidítés URL-jéből hiányzik a
  `?quick=mood`; szerkeszd a főképernyős rövidítést.
- **„A manifeszt-rövidítés nem jelenik meg"** — hosszú koppintás az ikonra a
  *telepített* appnál (nem a Chrome ikonra).
