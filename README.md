# 🧭 Belső Iránytű — hangulat- és közérzet-napló

Egy **offline, adatvédett** hangulatnapló, amit minden generáció kényelmesen tud használni:
nagy gombok, tiszta nyelv, közérthető elemzés — a támogatott appok inspirációival
(Daylio, Moodfit, Bearable), de minden adat a saját készülékedön marad.

## Fő funkciók

| Modul | Mit tud |
| --- | --- |
| **Ma** | 5-fokos hangulat-választó, stressz- és energia-csúszka, tevékenység-címkék, napi célok, egyensúly-pontszám |
| **Felfedezés** | Rövid önreflexió, testi mutatók (alvás, pulzus, HRV), gyógyszer-lista, vezetett 4-4-4 légzés, napi kérdés |
| **Napló** | Havi hangulat-naptár, valós sorozat (streak), keresés és hangulat-szűrés, bejegyzés szerkesztése/törlése |
| **Elemzés** | Heti összegzés, hangulat-görbe (időszakváltóval), tevékenység–hangulat korreláció, személyes felismerések |
| **Beállítások** | Név/cél, modulok ki-be, napi emlékeztető, **betűméret és nagy kontraszt**, hangból bejegyzés, CSV/JSON import-export, minden adat törlése |

## Fejlesztés

```bash
bun install        # vagy npm install
bun run dev        # fejlesztői szerver (0.0.0.0:3000)
bun run typecheck  # TypeScript ellenőrzés
bun run build      # produkciós build a dist/ mappába
```

## Technikai váz

- **React 18 + TypeScript + Vite** (a korábbi CRA-setup kiváltva)
- **Recharts** a grafikonokhoz
- Adattárolás: `localStorage` (`belso-iranytu-data-v2`), automatikus **v1 → v2 migrációval**
  (a régi dátum- és hangulatformátumok megmaradnak)
- Nincs backend, nincs fiók: minden adat helyben marad

## Hangból bejegyzés (MI, opcionális)

A diktálás a böngésző beépített beszédfelismerését használja; a szöveg feldolgozása:

- kulcs nélkül: beépített, **offline** magyar kulcsszó-elemző,
- `VITE_OPENAI_API_KEY` megadásával (Settings → Environment / `.env`): **OpenAI**
  `gpt-4o-mini` JSON-módú feldolgozás, hiba esetén automatikusan offline módra vált.

## Adatvédelem

Nincs fiók, nincs szerver, nincs követés. Exportálhatsz CSV-t/JSON-t, és egy
kattintással törölhetsz minden adatot.
