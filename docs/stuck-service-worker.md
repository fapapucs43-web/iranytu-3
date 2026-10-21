# Beragadt service worker — a végső útmutató

Ez a lap arra az esetre való, amikor az alkalmazás **egy régi verziót mutat**, és
az „Alkalmazás frissítése" gomb sem segít. Ilyenkor egy régi service worker
(`sw.js`) van a böngészőben `active` vagy `waiting` állapotban, és az szolgálja ki
a régi `index.html`-t.

Az alkalmazás mindent megtesz, amit egy oldal megtehet (lásd lent), de a
böngészőben maradt workert **csak a felhasználó tudja eltávolítani**. Az alábbi
két útvonal bármelyike működik, minden böngészőben.

## 1. útvonal — Fejlesztői eszközök (Chrome, Edge, Brave, Opera)

1. `F12` — fejlesztői eszközök megnyitása.
2. **Application** (Chrome) / **Anwendung** (Edge) fül.
3. Bal oldalon: **Service Workers**.
4. A listában szereplő bejegyzés mellett: **Unregister**.
5. Ugyanezen a lapon: **Storage** → **Clear site data**.
6. Zárd be a fejlesztői eszközöket, majd **Ctrl+Shift+R** (kemény újratöltés).

## 2. útvonal — A böngésző belső lapja (a leggyorsabb)

1. Írd be a címsávba: `chrome://serviceworker-internals/`
   (Edge: `edge://serviceworker-internals/`).
2. Keresd meg az `iranytu2.freebuff.app` bejegyzést.
3. **Unregister** (ha van „Stop", előbb azt).
4. **Ctrl+Shift+R**.

## 3. útvonal — Ha minden más csődöt mond

1. Böngésző beállításai → **Adatvédelem és biztonság** → **Webhelyadatok**.
2. Keresd meg az `iranytu2.freebuff.app`-ot → **Törlés**.
   (Ez minden helyi adatot is töröl, ezért előtte exportáld a naplót:
   Beállítások → Adatok és biztonság.)
3. Az oldal újratöltése.

## Amit az alkalmazás magától megtesz

- a service worker a build hash-ével regisztrál (`/sw.js?v=<hash>`), és a cache-t
  arról nevezi el;
- minden megnyitáskor kér egy frissítés-ellenőrzést (`registration.update()`),
  és a worker scriptet soha nem veszi ki a HTTP-cache-ből
  (`updateViaCache: "none"`);
- egy `waiting` állapotú workert `SKIP_WAITING` üzenettel kér meg az átvételre,
  és az átvételkor újratölti az oldalt;
- **Alkalmazás frissítése** gomb (Beállítások → Egyéb): kijelentkezteti az összes
  regisztrációt, töröl minden cache-t, üríti a `sessionStorage`-ot, megjelöli a
  következő betöltést, majd **egy új címre** navigál (`?nocache=<időbélyeg>`),
  amit egyetlen cache sem tud kiszolgálni;
- ha a lapon **még mindig** egy idegen build workere az úr, sárga figyelmeztetést
  mutat („Ez a lap régi verziót futtat"), és ugyanezt a hat lépést kínálja fel.

## Miért nem elég a Ctrl+Shift+R

A kemény újratöltés ugyanazt az URL-t kéri újra. A böngésző HTTP-cache-e URL-re
kulcsolt, és egy régi deploy alatt eltárolt `index.html` a **saját régi
szabálya szerint** továbbra is friss lehet — a szerver új fejléce
(`max-age=0, must-revalidate`) nem tud visszamenőleg lejáratni egy már eltárolt
bejegyzést. Ezért navigál a gomb egy **soha nem kért** címre: azt sem a HTTP-cache,
sem a worker precache-e nem tudja kiszolgálni, csak a hálózat.
