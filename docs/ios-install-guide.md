# Belső Iránytű — telepítés iPhone-ra és iPadra

A Belső Iránytű egy **PWA** (Progressive Web App): Safari nélkül, saját ikonnal a
főképernyőről indul, teljes képernyőn, offline. App Store-ból nem kell letölteni —
Safariból telepítődik.

## 1. Telepítés iPhone-ra

1. Nyisd meg **Safariban**:
   <https://iranytu2.freebuff.app>
2. Koppints a **Megosztás** gombra (a négyzet felfelé nyíllal, alul)
3. Görgess le a megosztási lapon: **„Főképernyőhöz adás"**
4. Koppints rá, majd a jobb felső sarokban: **„Hozzáadás"**
5. Kész — a **Belső Iránytű** ikon megjelenik a főképernyődön, és önálló appként
   nyílik meg (címsor és böngészősáv nélkül).

> **Fontos:** Safari kell hozzá, nem a Chrome vagy más böngésző — az iOS csak a
> Safariból „telepíthető" PWA-kat ismeri el. A *Megosztás* gomb más alkalmazásokban
> is megvan, de a **„Főképernyőhöz adás"** opció csak a Safariban jelenik meg.

## 2. Telepítés iPadre

Ugyanaz a folyamat, ugyanazokkal a lépésekkel:

1. Safari → <https://iranytu2.freebuff.app>
2. **Megosztás** gomb (a Split View esetén felül, a címsor mellett)
3. **„Főképernyőhöz adás"**
4. **„Hozzáadás"**

iPaden nagyobb a főképernyő, ezért a klasszikus widget-kiosztás is természetesebb
ott — a főképernyőre rendezett alkalmazásikon mellett a lenti
[ios-shortcut-widget.md](./ios-shortcut-widget.md) útmutatóval „widget-icont" is
kapsz.

## 3. Mit tud az iOS PWA?

| | |
| --- | --- |
| **Offline működés** | Igen. A service worker mindent előtölt (`/sw.js`), az adatok a saját készülékeden (localStorage) tárolódnak — repülőn, metrón, térerő nélkül is használható. |
| **Értesítések** | Igen, **iOS 16.4+** és csak **telepített** PWA-ként (főképernyőről indulva). Engedélyezés: Beállítások → Értesítések az app oldalán. |
| **Teljes képernyős mód** | Igen. `apple-mobile-web-app-capable` + `display: standalone` — nincs Safari-címsor, nincs böngésző UI. |
| **Saját ikon a főképernyőn** | Igen, deklarált 192×192-es PNG-ből (iOS egyedi lekerekítést és ragyogást rajzol rá). |
| **Mentés a főképernyőre** | Igen, a fenti lépésekkel. |
| **Frissítés** | Automatikus: a következő megnyitáskor a service worker betölti az új verziót, és a régi gyorsítótárat törli. |

## 4. Mit NEM tud az iOS PWA?

Őszintén, ezek a korlátok:

- **Nincs natív widget.** Az iOS nem enged PWA-ból kis alkalmazás-widgetet a
  Főképernyő oldalára. Megoldás: [ios-shortcut-widget.md](./ios-shortcut-widget.md)
  (Shortcuts-alapú „widget").
- **Nincs Bluetooth.** A Web Bluetooth API a Safariban nem elérhető.
- **Nincs háttérben futás.** Ha bezárod, megáll; nincs helyszín-követés, nincs
  háttér-szinkronizálás.
- **Nincs App Store-megjelenés.** Se ikon, se keresés, se frissítés-bolt — csak a
  főképernyőről.
- **Nincs automatikus értesítés iOS 16.4 alatt**, és értesítés csak akkor, ha a
  telepített verzióból engedélyezted.

## 5. Gyakori kérdések

**„Nem jelenik meg a Főképernyőhöz adás opció."**
A Chrome/Firefox/Edge nem tudja — csak Safari. Ellenőrizd, hogy a címsorban
`iranytu2.freebuff.app` áll, és hogy valóban a Safariból nyitottad meg.

**„Nem teljes képernyős, ott a Safari-címsor."**
Valószínűleg könyvjelzőből vagy másik böngészőből nyílt meg. Töröld a
főképernyő-ikont, és a fenti lépésekkel telepítsd újra Safariból.

**„Régi verziót mutat."**
Zárd be teljesen az appot (App Switcher → simítás felfelé), és nyisd újra: a
service worker a hálózatról frissül. Ha nem segít, a Beállítások → Frissítés
kártya egy kattintással kikényszeríti.

**„Törölni szeretném."**
Hosszú koppintás az ikonra → „App eltávolítása". Ez **nem törli az adataidat**
a készülékről, ha később újratelepíted, ott lesznek; a teljes adattörlés a
Beállítások → *Minden adat törlése* alatt van.
