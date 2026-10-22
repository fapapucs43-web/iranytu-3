# Belső Iránytű — Teljes szakmai audit és elemzés

*Dátum: 2026. 10. 22. · Kiállító: kódbázis- és piacelemzés (forrás: `src/lib`, `src/components`, `src/views`, `tests/`, publikus piaci adatok)*

> **Egy mondatban:** egy **zero-network, privacy-first hangulat- és közérzet-napló PWA**, amely mérnöki és etikai minőségben a piac felső ötödébe tartozik, tartalmi és AI-mélységben viszont még a középmezőnyben van — a legnagyobb különbség a versenytársakhoz képest az, hogy **itt tényleg nem hagyja el az eszközt az adat**, és ezt a konkurencia egyetlen főszereplője sem tudja letenni az asztalra.

---

## 0. Feladat — Online publikálás (GitHub Pages) — EREDMÉNY ✅

| Lépés | Állapot | Részlet |
|---|---|---|
| Repó nyilvánossá tétele | ✅ | `fapapucs43-web/iranytu-3` → `visibility: public` (API-n keresztül; nincs titkos kulcs a kódban — BYOK kulcsok a user `sessionStorage`-ában) |
| GitHub Pages engedélyezése | ✅ | `build_type: workflow` forrással → `https://fapapucs43-web.github.io/iranytu-3/` |
| Deploy workflow | ✅ | Az első futás a Pages bekapcsolás hiánya miatt megbukott; **újrafuttatás (attempt 2) `conclusion: success`** (2026-10-22 10:03 UTC) |
| CI | ✅ | A `ci.yml` futás ugyanezen commiton szintén zöld |
| Élő oldal ellenőrzése | ✅ | HTTP **200**, cím: *„Belső Iránytű — hangulat- és közérzet-napló"*, a buildelt assetek `/iranytu-3/` alatt hivatkozva (`base` beállítva) |
| Vercel alternatíva | nem kellett | az API engedte a láthatóságot |

**Működő URL: <https://fapapucs43-web.github.io/iranytu-3/>**

> **Ismert és szándékosan jelzett korlát:** a service worker regisztráció gyökér-path-on kéri a `/sw.js`-t (`src/lib/pwa.ts:409`), ami projekt-oldal (GitHub Pages) alatt 404 — ezért **a Pages-URL-n az offline PWA-réteg nem indul el** (a teljes app így is működik, hálózatról betöltve). Saját doménen, gyökérben ez továbbra is jó; a base-függő SW-path a `docs/AUDIT.md` fejlesztési listáján szerepel.

---

## A) Teljes topológia (fa struktúra)

A navigáció **6 fül**, felhasználó által átrendezhető sorrenddel (`tabOrder`), minden fülön belül szintén átrendezhető szekciókkal (`ReorderToggle`):

```
Belső Iránytű (PWA, alapértelmezett fül: Ma)
│
├── 1. MA (today) ─────────────── "Mai check-in", 5 szekció
│   ├── Hogy vagy ma? (Hangulatkártya)
│   │   ├── Új 3 lépéses rögzítőfolyamat (RecordingFlow):
│   │   │   hangulat×energia tengely + kellemesség → NÉGYDANZIÓS kvadráns,
│   │   │   érzelem + intenzitás + kontextus (egyéni érzelmekkel bővíthető)
│   │   ├── Stressz csúszka (1–10) + Energia csúszka (1–10, kapcsolható)
│   │   ├── Jegyzet + mellékletek (fotó/videó)
│   │   └── Kísérő kártya (CompanionCard) — Phase 1: állat/növény/fény/
│   │       szimbólum/absztrakt kísérő, 5 szín, állapotok, tevékenység-horgony
│   ├── Egyensúly pontszám (BalanceRing) — 0–100: hangulat 40% + stressz 30%
│   │   + energia 30%, három sávval (magas/közepes/alacsony)
│   ├── Mikro-lecke — a mai kvadránshoz választott egyperces oktatás
│   ├── Mi hatott rád ma? (Tevékenységek)
│   │   ├── Tevékenység-pill-felhő (beépített + saját címkék)
│   │   ├── Moduláris trackerek (időjárás, táplálkozás-jelzők, kalória,
│   │   │   sport + időtartam, lépésszám … egyedi tracker-ekkel bővíthető)
│   │   ├── Időjárás-kitöltés (opt-in, open-meteo, kulcs nélkül, 6h TTL,
│   │   │   csak ÜRES mezőket tölt, soha nem blokkolja a mentést)
│   │   ├── Táplálkozási tipp + Sport tipp (1-1 sor, csak ha szabály "megérdemli")
│   │   └── Napi célok (DailyGoals)
│   └── Heti reflektálás (WeeklyReflectionCard) — heti egy kérdés,
│       megválaszolható vagy kihagyható, nincs nyomás
│
├── 2. NAPLÓ (journal) ───────────────────────────── 3 szekció + banner
│   ├── Streak banner — a MAI nap még nem töri meg a sorozatot
│   ├── Naptár — havi nézet, naponta egy hangulat-négyzet, kattintás → részlet
│   ├── Keresés és szűrés — szabad szöveg + hangulat-pill szűrők
│   └── Bejegyzések — lista (alvás-óra jelzéssel), EntryDetail részlet-overlay
│
├── 3. ELEMZÉS (insights) ─────────────────────────── 13 szekció (lusta chunk)
│   ├── Ez a hét — 4 statisztika (átlag hangulat, napok, stressz, energia)
│   ├── AI heti összefoglaló (WeeklyAiSummaryCard) — ki/be kapcsolható
│   ├── Hangulat-naptár (YearInPixels) — az év egy pixel-mátrixban
│   ├── Hogyan alakult? — vonaldiagram (hangulat/stressz/energia/alvás),
│   │   hét/hónap/összes időtáv
│   ├── Mi hat rád? — tevékenység-korrelációk (▲/▼, delta + mintaszám)
│   │   + Alvás–hangulat kártya (Pearson-r, 3 sáv, őszinte szöveg)
│   ├── Melyik tevékenység jött vissza később? (lag-elemzés)
│   ├── Érzés és kontextus — kvadráns-insightok
│   ├── Jelentés export — PDF (helyi betűtípus-letöltéssel, hash-ellenőrzött)
│   │   + CSV
│   ├── Havi és éves statisztikák
│   ├── Mérföldkövek — 27 badge, tisztán származtatott szabályok
│   ├── Hatásmátrix (correlationGrid) — tevékenység × kimenet mátrix,
│   │   HRV/pulzus oszlopokkal (SEMMLEGES megítéléssel)
│   ├── Minták a naplóidban (patternInsights)
│   └── További felismerések + kötelező diszclaimer
│
├── 4. EGÉSZSÉG (health) ──────────────────────────── 3 szekció
│   ├── Táplálkozás — ételnapló, fotós étel-elemzés (BYOK),
│   │   heti táplálkozási összegzés, átláthatósági kártya (szabályok + biztonsági megjegyzés)
│   ├── Edzés — edzőprogramok, edzésterv + napló, sport-átláthatósági kártya
│   └── Egyéb — Vittek (MiniVitals, kapcsoló), Gyógyszer-emlékeztető (kapcsoló),
│       Szokások (HabitStreaks), Alvásnapló (fekvés/felkelés/minőség, éjfél-átlépéssel),
│       Önértékelő kérdőív (PHQ-8 + hozzájárulási képernyő + naplózás),
│       GAD-7 check-in (szándékosan NEM naplózott, kapcsoló nélkül)
│
├── 5. FELFEDEZÉS (tools) ─────────────────────────── 4 fiók
│   ├── Terápia — Légzésgyakorlat (animált vezetett), Meditációválasztó
│   │   (10 meditáció), Gondolatnapló (CBT: szituáció → automatikus gondolat →
│   │   érzelem → bizonyíték mellette/ellene → kiegyensúlyozott gondolat →
│   │   distressz újraértékelés), Programok (6 hetes „Hat hét magaddal"),
│   │   Segítségkérés (SeekHelpCard — mikor NEM a felszíni eszközök a válasz)
│   ├── Önismeret — Mini reflektálás (3 mező, kapcsolható), Hálanapló,
│   │   Napi kérdés (6 kérdés forgója), Bátorítások fala (Phase 5: saját magadnak
│   │   írt 280 karakteres üzenetek, alapból KI, 280/200 limit, pin-védelem)
│   ├── Kísérletek — ExperimentCard: egy változtatás szándékosan, lezárással
│   └── Tanulás — EducationLibraryCard (oktatóanyag-gyűjtemény) + mikroleckék
│
└── 6. BEÁLLÍTÁSOK (settings) ─────────────────────── 8 csoport, ~25 kártya
    ├── Személyes — Profil
    ├── Megjelenés — Nyelv (hu/en/de), Akadálymentesség, Betűtípus, Ikonkészlet,
    │   Téma + egyedi téma szerkesztő, Háttérkép (illesztés/fátyol/tint,
    │   DINAMIKUS TINTA: szöveg kontrasztja mérve AA-ra a választott képre),
    │   Kísérő beállítás
    ├── Menüsor — fül-sorrend + automatikus rejtés
    ├── Követett adatok — tracker-kezelő + egyedi trackerek + egyedi tevékenységek,
    │   Modulok (kapcsolók: energia, reflektálás, kérdőívek, vittek, gyógyszer …),
    │   Allergia, Gyógyszeridők
    ├── Emlékeztetők — ReminderCard (napirendi emlékeztetők)
    ├── Biztonság — PIN-zár
    ├── Mentés és export — Titkosított fájlmentés (lib/backupCrypto), Adatok,
    │   Adatvédelem (átláthatósági kártyák)
    └── Egyéb — Időjárás-API, Étel-AI beállítás, AI beállítás (mód + szolgáltató +
        kulcs), Egészségimport (Apple Health / Google Fit fájl, helyi feldolgozás),
        Hangulat-rögzítés módja (új/öreg folyamat), Kérdőív-hozzájárulás,
        Telepítés, Alkalmazás-frissítés, Hang, Kríziskártya
```

**Minden szekció `SectionSpec`-ként deklarált, tesztekkel rögzített id-vel** (`TODAY_SECTION_IDS`, `JOURNAL_SECTION_IDS`, `INSIGHTS_SECTION_IDS`, `HEALTH_SECTION_IDS`, `TOOLS_SECTION_IDS`, `SETTINGS_SECTION_IDS`) — az átnevezés teszt-hibát okoz ahelyett, hogy csendben duplikálná a kártyát.

---

## B) Szakmai minőség audit (1–10-es skála)

### Értékelési táblázat

| Modul | Pont | Miért ennyi |
|---|---|---|
| **Önértékelés / kérdőívek (PHQ-8, GAD-7)** | **9** | A kérdőív **szó szerinti** MAPI/Pfizer-fordítás (forrásdokumentum kóddal), a modell tudja, hogy PHQ-**8**-ról van szó (a 9. tétel kiegészítő, megjelölve), nincs klinikai címke a felületen, a diszclaimert **teszt kényszeríti** minden felületen, a krízisszámok üzemeltetői oldalról ellenőrizve. Nem ad diagnózist, nem nevezi magát szűrőeszköznek — ez etikailag a piac legjobb gyakorlata. *Levonás:* önvalidáció nincs (nincs klinikai validációs tanulmány a saját felületen). |
| **Adatvédelem + mérnöki minőség** | **9** | Nincs analitika, nincs CDN, nincs Google Fonts (helyi betűtípus-szett), **3 hálózati kimenet, mind opt-in** (BYOK AI, étel-AI, időjárás), a API-kulcs `sessionStorage`-ban soha nem exportálható, `WIPE_KEYS` + titkosított mentés, 3769 teszt / 0 fail, typecheck+build CI-ban, i18n sweep (hu/en/de), akadálymentes, `prefers-reduced-transparency`-ig minden. *Levonás:* localStorage-t az OS törölheti (a mentés-felületet a backupDaemon csak nyitott appnál tudja kérni), és a fent említett SW-scope hiba a Pages-URL-n. |
| **Terápiás programok + CBT** | **7** | A gondolatnapló a **klasszikus kognitív restrukturálás hű folyamata** (szituáció → automatikus gondolat → érzelem → bizonyíték → kiegyensúlyozott gondolat → distressz 0–10 újra), a 6 hetes programnál **nincs határidő, büntetés, zár** — a kihagyás nem visszaállítás. *Levonás:* a program tartalma saját szerkesztésű, **nem validált protokoll** (pl. nem Beck-féle irányelvekkel igazolt), egyetlen program, nem adaptív; nem látszik szakmai lektorálás a tartalmon. |
| **Alvás / HRV** | **7** | Alvásnapló: fekvés+felkelés pár, éjfél-átlépés helyes kezelés, minőség 1–5 **szubjektívnak jelölve** (nincs kiszámolt „rossz éjszaka"), Pearson-r **n≥3 mintaszám-padlóval** és őszinta mondattal: *„Ez együtt járás, nem bizonyíték arra, hogy az alvás okozza."* HRV/pulzus a korrelációs mátrixban **semleges** (nincs „jobb/rosszabb" ítélet). *Levonás:* HRV csak fájlból importálható (nincs szenzor-olvasás PWA-ból), nincs referenciatartomány-értelmezés (pl. életkori RMSSD-sáv), az alvás sajátbevallású. |
| **Elemzések / korrelációk** | **7** | Mindenhol mintaszám-padló, semleges kimenetek a „több nem jobb" változóknál (kalória, pulzus), causality-óvatosság a szövegben, kvadráns-elemzés, lag-elemzés. *Levonás:* **az n≥2 padló statisztikailag túl alacsony** (2 megfigybelt bármilyen delta „megtámogat"), nincs szignifikancia vagy hatásméret, nincs több-összehasonlítás-korrekció — exploratív eszköznek jó, döntés-alapnak kevés. |
| **Gamifikáció** | **8** | 27 badge, **tisztán származtatott** szabályok (semmit nem tárol), **büntetés-veszteség teljesen hiányzik**: nincs megszakadt sorozat-büntetés (a mai nap nem töri meg a streaköt), nincs FOMO-push, nincs „lépj ma, különben…" Mechanizmus etikailag példás: a jutalom megjelenik, de nem vész el. *Levonás:* növekedési hurok gyenge — a badge-eken túl kevés a visszatérési ok, nincs haladás-ív (pl. szintek, rituálék), a megtartás-pozíció gyengébb, mint Finchnél. |
| **AI (Phase 4)** | **6** | Az **architektúra és az etika kiváló**: alapértelmezés „ki" (még kulcsot sem olvas), BYOK-kulcs csak sessionben, on-device Qwen3-0.6B (335 MB, letöltés csak gombnyomásra, törölhető), a prompt **kizárólag az aktuális hét adataiból** épül (max 200 karakter jegyzetenként), 45 s timeout, minden ág injektálható fetch-cel tesztelt. *Levonás:* a **termékérték vékony** — egyetlen heti összefoglaló, nincs beszélgetés, nincs támogató-jellegű dialógus; a 0,6B modell minősége korlátozott; a BYOK súrlódás (másolj be egy kulcsot); és a promptban **nincs krízis-őrszem** (egy elkeseredett bejegyzés-szöveg kapcsán a modellt nem vezérli válság-iránymutatás). |
| **Bátorítások fala (Support Wall, Phase 5)** | **6** | Technikailag tiszta: 280 karakter, 200 üzenet, a **pin-ígéret felülírja a sapkát** (ha minden hely rögzített, az *hozzáadás* tagadódik meg, nem a pin törlődik), alapból ki, sérült blob javítás, nulla hálózat, `WIPE_KEYS`-ben. *Levonás:* **nem közösségi** — saját magadnak írsz üzenetet; a „fal" szociális támogatás-mechanizmusa (mások szavai, szolidaritás) hiányzik belőle, mert nincs hálózat → egyelőre elegáns jegyzetblokk, nem közösség. |
| **Ma fül / rögzítés** | **8** | Kvadráns-modell (energia × kellemesség) + érzelem/intenzitás/kontextus — több dimenzió, mint a Daylio 5 szintje; 3 lépéses folyamat alacsony súrlódással; trackerek, célok, mikrolecke. *Levonás:* az öreg 5-gombsorral két rögzítési út él egymás mellett; az időjárás és a többi tracker keveredhet a fókuszból. |
| **Krízis-út (SeekHelp, CrisisCard, SAFETY_NOTICE)** | **9** | Egyetlen igazság-forrás a számokra (116-123 / 112 / Kék Vonal), minden kérdőív-eredmény mellett kötelezően megjelenik, a kiegészítő 9. tétel mellett **válasz nélkül is** biztonsági figyelmeztetés, a Segítségkérés kártya a terápia fiók **utolsó** eleme (előbb a csinálható eszközök). |

**Összítelképzett minőség: ~7,5/10** — orvosilag-etikailag a legjobb, statisztikailag és AI-ban középmezőny, mérnöki kivitelezésben újrahasznosított.

### A leggyengébb láncszemek (fejlesztendő, sorrendben)

1. **AI-termékérték (6)** — egy heti összefoglaló nem termék: nincs beszélgetés, nincs támogatás-hang, a 0,6B modell és a BYOK együtt kicsit ijesztő a célcsoportnak.
2. **Support Wall szociális hiánya (6)** — a neve közösséget ígér, a tartalma egyéni jegyzet.
3. **Statisztikai szigor** — `n≥2` padló, nincs szignifikancia/hatásméret: egy rosszul sikerült két nap „minta" már tanácsot formál.
4. **Adat-tartósság** — localStorage egy gépen él; a mentés kézzel/időszakosan történik, felhő-szinkron nincs (szándékosan), multi-eszköz nincs.
5. **Kontent-mélység** — 1 program (6 hét), 10 statikus meditáció, 3 nyelv; a versenytársak katalógusai 10–100× nagyobbak.
6. **Pages-deploy SW-scope** — az offline ígéret az átadott URL-n nem teljesül (lásd 0. szakasz).
7. **Nincs klinikai validáció / szakmai partnerek** — a legjobb kérdőív-kivitelezés mögött nincs publikáció vagy klinikai partnerség, ami az árat és a B2B-bizalmat megadná.

---

## C) Összehasonlítás a versenytársakkal (2026. október, kutatással)

### Versenytárs-táblázat

| App | Mechanizmus / célcsoport | Ingyenes + tipikus ár (USD) | Adatvédelem | Gyakori panasz |
|---|---|---|---|---|
| **Finch** | Gamifikált öngondoskodó háziállat; akiknek nehéz a rutint tartani | Alap ingyenes; Plus **$9,99/hó vagy $69,99/év** | **Szerveren tárolt** fiók-adatok; analitika + hirdető-partnerek a policyban (app hirdetés-mentes) | Az esemény-jutalmak túl fizetőfalasak |
| **Daylio** | Gyors hangulat+tevékenység napló, ikonokkal | Alap korlátlan; Premium **$4,99/hó vagy $35,99/év** | **Bejegyzések helyben**, opcionális Drive/iCloud mentés; analitika + Google reklám-ID Androidon | Túl egyszerű, kevés írás-terület |
| **Wysa** | AI chatbot + CBT/DBT gyakorlatok | Chat ingyenes; Premium **$99,99/év**, Premium Plus **$99,99/hó** | **Beszélgetések a szerverre mennek**,3. félyű LLM-ek; anonimizált chat-ek tanításra | Ismétlődő, félreértő válaszok |
| **Youper** | AI hangulat-check-in + CBT/ACT | Korlátozott ingyenes; ~$69,99/év (történeti) | **Megszűnt**: a szolgáltatás 2026. 09. 30-án leállt, fiókok törlése | AI monoton, kevés árnyalat |
| **Headspace** | Vezetett meditáció + alvás + AI kísérő (Ebb) | 14 nap próba; **$12,99/hó vagy $69,99/év** | Fiók/haszználat/egészség-adatok gyűjtése, US-ban tárolás, hirdetés-személyre szabás engedélyezve | Fizetőfal, lejátszási hibák, lemondási nehézségek |
| **Calm** | Alvástörténetek + meditáció-könyvtár | Válogatott ingyenes; **$79,99/év, $16,99/hó** | Check-in/hangulat-adatok gyűjtése, analitika + hirdető-partnerek (opt-out) | Megújítás/lemondás/ügyfélszolgálat |

**Privacy-first mezőny (a mi igazi kategóriánk):**
- **Mood Cairns** (nyílt forráskódú, Android/F-Droid): teljesen offline, **még a hálózati engedélyt sem kéri**, titkosított helyi tárolás.
- **Vibecheck** (nyílt forráskódú): 100% offline, nincs fiók/analytics/hirdetés, export-import.
- **Moodistory** (kereskedelmi): helyi napló, de a Play adat-biztonsági nyilatkozata szerint eszköz-adatok megosztása lehetséges → nem zero-network.
- **Daylio** a legközelebbi kereskedelmi helyi-tárolású, de analitikával és reklám-ID-val.

**Két piaci tény, ami nekünk dolgozik:** (1) a két tiszta zero-network példa **Android-exkluzív és minimális felület** — PWA-ban és magyar nyelven nincs versenytárs; (2) a **Youper szeptember végén megszűnt**, tehát az AI-terápiás szegmensből kiesett egy szereplő, miközben a felhasználói igény megmaradt.

### USP-táblázat — amit csak mi tudunk letenni

| Szempont | Belső Iránytű | Finch | Daylio | Wysa/Youper | Headspace/Calm |
|---|---|---|---|---|---|
| **Zero-network alapértelmezés** | ✅ **0 kimenet bekapcsolás nélkül** | ❌ szerver | ⚠️ alap helyben, de analytics | ❌ cloud AI | ❌ cloud |
| **Nincs fiók, nincs tracking, nincs hirdetés** | ✅ | ❌ | ⚠️ | ❌ | ❌ |
| **AI a választásunktól függ: ki / on-device / saját kulcs** | ✅ 3 mód | ❌ | ❌ | ❌ kényszer-cloud | ❌ |
| **Nyílt, ellenőrizhető kód (a repó publikus)** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Magyar nyelv + nagybetűs, közérthető felület** | ✅ hu/en/de | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| **Validált kérdőív-kivitelezés (PHQ-8, diszclaimer, krízisút)** | ✅ | ❌ | ❌ | ⚠️ | ❌ |
| **Büntetés-mentes gamifikáció** | ✅ | ⚠️ szezonális FOMO | ⚠️ | — | — |
| **Offline PWA (telepíthető, működik repó nélkül)** | ✅* | mobil-app | mobil-app | mobil-app | mobil-app |
| **Ár** | **0 Ft / adomány / license** | $69,99/év | $35,99/év | $99,99/év | $69,99–79,99/év |

\* a szolgáltatott GitHub Pages-URL-n a SW-scope miatt az offline réteg jelenleg nem indul (fejlesztési tétel).

**Az USP egy mondatban:** *„Egy olyan mentális-egészség napló, ami alapból nem küld sehova semmit — az AI-ot te választod (semmi / a gépeden / a saját kulcsoddal), és ha kikapcsolod, semmi sem hagyja el az eszközt."* Ezt egyetlen főszereplő versenytárs sem tudja mondani 2026-ban.

---

## D) Fejlesztési és monetizációs javaslatok

### D1 — Termékfejlesztés (prioritási sorrendben)

1. **AI-mélység növelése (a legnagyobb érték-rés)**
   - Nagyobb on-device modell választék (Qwen3-1.7B, kb. 1–2 GB, letöltés előtt méret-kijelzéssel + „kicsi/éles" kapcsoló), hogy a heti összefoglaló valóban jó legyen.
   - **Beszélgetéses mód** a heti összefoglaló mellett: „Kérdezz a hetedről" — a prompt ugyanabból a helyi adatból épül, off marad az alapértelmezés.
   - **Krízis-őrszem a promptban**: ha a bejegyzés vagy a válasz öngyilkosság/önártás témát érint, a modell kötelezően a 116-123/112 felé irányítson (szabály a rendszer-üzenetben + kliens-oldali szűrő), és ezt dokumentálni kell.
   - BYOK mellé „egy kattintásos" kulcs-bemásolás útmutató és DeepSeek-mintára költségbecslés (napi ~1 cent).
2. **Statistika-szigorítás (hitelesség)** — mintaszám-padló fel (n≥5 a tanácsadó mondatokhoz), hatásméret + egyszerű megbízhatósági sáv a korrelációkon, „elég adat" jelzés a mátrixban; a szöveg továbbra is együtt járás-nyelven.
3. **Adat-tartósság** — automatikus, **titkosított** helyi mentés a böngésző saját tárhelyére (OPFS) + heti emlékeztető; opcionálisan felhasználó által választott saját tárhely (WebDAV/fájl), ami megőrzi a zero-network ígéretet.
4. **Support Wall valódi közösséggé** — E2E titkosított, opt-in „világ-fal": a kliens generál kulcspárt, a szerver csak titkosított blobot lát; kurátori/automatikus tartalom-szűrés a kliensen; **ha ez túl nagy ugrás, maradjunk az egyéni falnál és ne ígérjünk többet a névnél.**
5. **Kontent-bővítés** — +2 program (szorongás-kezelés, alvás-higiéné), hangvezetett meditációk (helyi fájlok), további nyelv (német) a B2B-hez.
6. **Offline-ígéret javítása a weben** — SW-path a `BASE_URL`-hez igazítva (vagy saját domén), hogy a publikus URL-en is működjön az offline mód; ez a „zero-network" állítás látható bizonyítéka.
7. **Egészség-import automatizálás** — ismétlődő import-emlékeztető + CSV/Apple Health fájl legutolsó állapotának megjegyzése (PWA-ban background sync nincs, itt a őszinte megoldás a kézi ismétlés emlékeztetése).
8. **Klinikai/partner láb** — szakmai lektorálás megjelenítése a programokon, esetleg egyetemi/pszichológiai partnerség és egy kis felhasználói validációs felmérés (a PHQ-8 önértékelés esetén a legitimacy-t ez adja).

### D2 — Monetizáció (a zero-network pozícióból kiindulva)

| Ág | Modell | Részlet | Illeszkedés |
|---|---|---|---|
| **1. Freemium + örökös license** | Ingyenes teljes napló; **fizetett „Támogatói/Pro" license** (egyszeri díj, életre szóló fájl-license) | A offline appnál az előfizetés-ellenőrzés **hálózatot kérne** — ezért az **egyszeri, fájl-alapú license** az őszinte modell (aktiválás online, utána offline is él). Referencia-ár: Daylio $35/év → mi $19,99 egyszeri + $39,99 „örökre a családnak" | ✅ nem árul adatot, nem tör el offline |
| **2. Adomány / támogatás** | Buy Me a Coffee / PayPal, kulcsszó: „ha ingyenes marad, támogass" | A privacy-közösség fizet az ígéretért; nulla felület-költség | ✅ azonnal indítható |
| **3. B2B vállalati licenc** | **Zero-network = GDPR-álom**: nincs személyes adat a szerveren, nincs DPIA a naplóra, air-gapped eszközökön is fut, OPC-ben telepíthető | Herd/HR-wellbeing csomag ülőhelyenként (pl. $3–5/fő/év), pilot 50 főtől; eladási érv: *„a munkáltató semmit nem lát, a dolgozó eszköze elhagyása nélkül"* | ✅ **a legerősebb ág** — épp azért, mert nincs cloud |
| **4. Egészségügyi/szakmai licenc** | Terapeutáknak „várótermi verzió": kliens a saját eszközön tölti, a terapeuta csak exportált PDF-et kap (a páciens adja át) | Liszensz klinikáknak, magánrendelőknek; a PDF-export már megvan hozzá | ✅ a PHQ-8 kivitelezés itt az eladó |
| **5. Pályázatok** | EU digitális egészség / NKFIH / hazai egészségprevenciós pályázatok — a „privacy-first, offline, akadálymentes magyar app" pontokra jár | Nem termék-bevétel, de tartalmi-fejlesztési tőke (AI modell, kontent) | ✅ |
| **6. Store-port (opcionális)** | PWA → TWA/Capacitor átcsomagolás, IAP-pel | Csak akkor, ha a web-forgalom igazolja; a store-díj mellett a privacy-állítás auditálhatóvá válik | ⚠️ később |

**Amit nem csinálnék:** hirdetések, analitika-sdk, fiók-kötelező használat, vagy a napló adatainak bármilyen szerverre vitele — a USP pontosan ez, és a fenti B2B-ág ** csak addig eladó, amíg ez az ígéret sérthetetlen.**

---

## Módszertan és verifikáció

- **Forrás:** a jelentés minden állítása a commitolt kódból származik (`src/lib/*`, `src/views/*`, `src/components/*`), a versenyadatok 2026. 10. 22-i, hivatkozott piaci forrásokból (üzleti árak hivatalos oldalakról/áruházakból; magánélet-adatok a szolgáltatók saját policy-oldalairól).
- **Gate-ek a jelentés commitján:** `typecheck`, `bun/npm test` (3769 teszt), `build` — lásd a commit üzenetét.
- **Publikáció:** repó nyilvános, Pages `build_type=workflow`, deploy `conclusion: success`, élő URL HTTP 200 + helyes tartalom.
