# Belső Iránytű — Android: telepítés, shortcut-widgetok, Assistant

> **Androidon sincs natív PWA-widget.** A Chrome nem valósított meg widget
> API-t a webalkalmazásoknak — a Google Play-alkalmazás-widgetje (ami a boltos
> appoknál látszik) Android-nézetet igényel, tehát PWA-ből nem elérhető. Amit
> viszont Android **enged**, az több, mint iOS: a **manifest `shortcuts`
> menüje** gyári, egy hosszú koppintásból nyílik, és nem kell hozzá sem
> Shortcuts-app, sem Tasker.
>
> Ugyanaz a `?quick=` szótár működik itt és iOS-on:
>
> | Cél | URL | Amit nyit |
> |---|---|---|
> | Mai hangulat | `https://iranytu2.freebuff.app/?quick=mood` | Ma fül, hangulat-kártya |
> | Új bejegyzés | `https://iranytu2.freebuff.app/?quick=entry` | Ma fül, hangulat-kártya |
> | Légzés | `https://iranytu2.freebuff.app/?quick=breath` | Felfedezés → Terápia fiók |
> | Meditáció | `https://iranytu2.freebuff.app/?quick=meditate` | Felfedezés → Terápia fiók |
> | Napló | `https://iranytu2.freebuff.app/?quick=journal` | Napló fül |

---

## 1. PWA telepítés (Chrome)

1. Nyisd meg a **Chrome**-ban:
   <https://iranytu2.freebuff.app>
2. Koppints a **⋯** menüre (jobb felső sarok) → **Telepítés az alkalmazáshoz**
   / *Alkalmazás telepítése*.
3. Erősítsd meg a **Telepítés** gombbal.

Az app saját ikonnal a főképernyőre kerül, **teljes képernyőn** nyílik (nincs
címsor), és offline is működik. A Chrome a manifesztet olvassa, tehát a
192/512-es ikonok, a `standalone` felület és a **shortcutok** mind beépülnek.

---

## 2. Manifest shortcuts — a gyári hosszú koppintásos menü

Ez Android elsődleges „widgetje": **nincs hozzá külön app, se beállítás**.

1. **Hosszú koppintás** a főképernyőn a **Belső Iránytű ikonjára**.
2. Megjelenik egy kis menü — benne a manifeszt négy shortcutja:

   | Menüben megjelenő név | Akció |
   |---|---|
   | **Mai hangulat** | Megnyitja a Ma fület a hangulat-kártyánál (`?quick=mood`) |
   | **Új bejegyzés** | Új bejegyzés a Ma fülön (`?quick=entry`) |
   | **Légzésgyakorlat** | Felfedezés → Terápia fiók, légzés (`?quick=breath`) |
   | **Meditáció** | Felfedezés → Terápia fiók, meditáció (`?quick=meditate`) |

3. Koppints rá — az app megnyílik a kért helyen.

**Tippek:**

- A menüből **húzhatsz ki egy shortcutot a főképernyőre** (hosszú nyomás a
  menüponton → *Hozzáadás a kezdőképernyőhöz*) — így lesz belőle egy
  külön ikon, ami widget-szerűen használható.
- A Chrome (nem a telepített app!) ikonjára hosszú koppintva **nem** ezek
  jelennek meg — a manifeszt-kötött menü a **telepített PWA** ikonjához
  tartozik.
- A négy név a `manifest.webmanifest` `shortcuts` tömbjéből jön; ha
  módosítod a fent lévő URL-eket, a menü is frissül a következő
  telepítéskor.

---

## 3. Alternatíva: launcher-widget (Tasker / MacroDroid / Nova)

Ha **élő widgetet** akarsz a kezdőképernyőre (gomb- vagy dátum-widgetet, nem
csak menüt), külső eszköz kell. Mind ugyanazt a linket használja:

```
https://iranytu2.freebuff.app/?quick=mood
```

### Tasker

1. Telepítsd a **Tasker**t.
2. **Task → + → New Task** → nevezd el (pl. *„Belső Iránytű – Hangulat”*).
3. **Action → + → App → Open Link** (vagy *Browse URL*).
4. **URL** mező: `https://iranytu2.freebuff.app/?quick=mood`
5. Kész a task. **Widget hozzáadása:** a kezdőképernyőn *Widgets → Tasker →
   Task Shortcut* → válaszd ki a taskot → a widgetre koppintva nyílik az app
   a Ma fülön.

### MacroDroid

1. **MacroDroid → Makrók → + → Makró létrehozása**.
2. *Művelet hozzáadása → Link megnyitása* → a fenti URL.
3. *Widget hozzáadása* → válaszd a makrót → kész.

### Nova Launcher (vagy bármilyen, URL-widgetet tudó launcher)

*Widgets → Nova → URL Widget* → URL: a fenti link → a widget szövegének neve
add meg, amit látni akarsz (pl. *„Hangulat”*).

> A Tasker/MacroDroid megoldás **nem az app része**: azok az eszköz
> automatizálási alkalmazások, és külön telepítést igényelnek. Ha csak napi
> egy-két bejegyzést rögzítesz, a 2. pont (gyári shortcut-menü) elég, és nem
> kell semmit telepíteni.

---

## 4. Google Assistant

Az Assistant ugyanazt a bejegyzés-eszközt tudja, mint a Google Routines:

### Egyszerű megnyitás

- **„Hey Google, nyisd meg a Belső Iránytűt”** — a telepített PWA-t nyitja
  meg (alapbejegyzés a főképernyőről).

### Reggeli rutin (Assistant Routines)

1. Nyisd meg az **Assistants → Routines / Rutinok** menüt
   (*Settings → Google Assistant → Routines*).
2. Koppints egy meglévő rutinra (pl. *„Jó reggelt”*) vagy hozz létre újat.
3. **Add actions / Akciók hozzáadása → Összetett műveletek → Szöveg
   beírása**: írd be:

   ```
   https://iranytu2.freebuff.app/?quick=mood
   ```

   (Ahol a rutin szövegként kezeli, ott a link megnyílik a rendes
   böngészőből is; ahol a telepített alkalmazás nyitja meg, ott appként.)
4. A rutin futtatásakor — pl. a reggeli „Jó reggelt” után — a hangulat
   rögzítésére visz.

> **Őszinte korlát:** a Assistant nem indít direktben URL-t a telepített
> PWA-ban minden Android-verzión; ahol nem teszi, ott a link böngészőben
> nyílik, de az `?quick=` akkor is érvényes — a böngészőből ugyanoda visz,
> csak nincs teljes képernyő. A biztos app-os megnyitás a 2. pont
> (hosszú koppintásos menü).

---

## 5. Értesítések Androidon

A PWA-tól kapott **napi emlékeztető** ugyanúgy működik, mint iOS-en: a
Beállításokban engedélyezve, a megadott időben jelenik meg, és
**koppintásra a Ma fülre visz** (`?quick=mood`). Részletek és korlátok:
[ios-widget-guide.md](./ios-widget-guide.md) és a Beállítások → Emlékeztető
kártya.

---

## 6. Hibakeresés

| Tünet | Ok | Megoldás |
|---|---|---|
| Nincs „Telepítés az alkalmazáshoz” | Nem Chrome, vagy nem támogatott verzió | Chrome (vagy Edge) + Android 5+ |
| Nincs shortcut-menü az ikonon | A PWA nincs telepítve, a Chrome ikonját nyomod | Telepítsd a 1. pont szerint, és a **telepített** ikonra koppints |
| A shortcut Safari-szerű nézetben nyílik | Szokásos böngészőből indult | Telepítés után appként nyílik; töröld a régi főképernyős ikont |
| A Tasker widget nem nyitja az appot | A linkben elírás | Pontosan a táblázat szerinti URL kell |
| Nem frissül a shortcut-menú | A manifeszt régi | Távolítsd el és telepítsd újra a PWA-t |
