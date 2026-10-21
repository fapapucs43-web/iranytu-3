/**
 * Open-Meteo, as an opt-in convenience beside the manual weather fields.
 *
 * THE CONTRACT WITH THE USER
 * Weather is the one tracker where the app could go and get the answer
 * instead of asking, and that is exactly why it is the one place where the
 * privacy promise could be broken by a helpful feature. So the promise is
 * written as settings rather than as behaviour:
 *
 *   - OFF. No request leaves the device until the user turns the module on.
 *     Not "off by default with a dialog", off: there is nothing to dismiss,
 *     because a mood journal that starts asking a third party where you live
 *     the first time you open Settings is not a journal that keeps its word.
 *   - A CITY the user types is the only location. `weatherCity` defaults to
 *     empty and the API is keyed by its coordinates once geocoded; the app
 *     never sends anything more precise than a city name the user chose.
 *   - BROWSER GEOLOCATION IS A SECOND OPT-IN. Two settings, not one, and the
 *     second exists only after the first: `weatherUseGps` is unreadable while
 *     `weatherApiEnabled` is false. The browser's own permission dialog is not
 *     consent on this app's behalf — the user decides here, in Hungarian,
 *     before any API is called.
 *
 * THE API
 * open-meteo.com: free, keyless, and paid for by its own API-key products, so
 * there is nothing to provision and no secret to keep out of the bundle. The
 * forecast endpoint takes coordinates and a list of daily variables; the
 * geocoding endpoint takes a name and returns ranked candidates. Both are
 * called with native `fetch`, and the only new dependency is the URL.
 *
 * THE CACHE IS THE FEATURE, NOT AN OPTIMISATION
 * Per `(location, day)`, in localStorage, with a TTL — because a day's weather
 * does not change after the day, and an app that refetches on every render of
 * the entry form would be making a network request a journal does not need.
 * The key is the resolved location and the ISO day, so two cities never share
 * an entry and yesterday's row is fetched once and never again. The TTL keeps
 * a "today" row honest for six hours, after which it is re-fetched if it is
 * still today and served as final if it is not.
 *
 * DEGRADATION IS THE OTHER FEATURE
 * Every failure path returns a value, never throws: offline, a 500, a city
 * the geocoder has never heard of, a response with the wrong shape. The UI's
 * job is to fill the two manual fields with a best guess and say quietly, in
 * one line, where the numbers came from. There is no error dialog, no toast,
 * no spinner that can hang, and no path that can block a save — the save
 * writes whatever is in the boxes, API or no API.
 *
 * WHY THE FETCH IS INJECTED
 * The same reason as `pdfFonts.ts`: verification logic that cannot be pointed
 * at a stub is verification logic nobody runs, and a weather module that can
 * only be tested against the real network is a weather module that will be
 * tested by users.
 */
import { t } from "./i18n";
import type { TrackerValue } from "./trackers";

/** The API, versioned like every other URL the app pins. */
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";

/** A "today" cache entry is re-fetched after this long. Past days never are. */
const TODAY_TTL_MS = 6 * 60 * 60 * 1000;

/** The localStorage key. One JSON array, oldest evicted first. */
const CACHE_KEY = "belso-iranytu/weather-cache/v1";

/** The cache holds this many rows. A year of days is 365; this is headroom. */
const CACHE_MAX_ROWS = 400;

/** One cached day, for one place. */
export type WeatherCacheRow = {
  /** Resolved location key — see `locationKeyOf`. */
  locationKey: string;
  /** ISO date the row is for. */
  date: string;
  /** WMO weather code, translated by `wmoCondition`. Empty when unknown. */
  condition: string;
  /** Daily mean temperature, °C, rounded to a whole degree. */
  temp: number | null;
  /** When the row was fetched. The TTL reads this. */
  fetchedAt: number;
};

/**
 * Where a request is for, in the two forms the user can express.
 *
 * A GPS location carries no coordinates: the module resolves them through the
 * browser at fetch time, because the coordinates are the thing being asked
 * for and never a stored value. A city location carries the name the user
 * typed, which IS stored — that asymmetry is the privacy model, in a type.
 */
export type WeatherLocation = { source: "city"; name: string } | { source: "gps" };

/**
 * What the geocoder resolved, or why it could not.
 *
 * `denied` is a geolocation reason, not a geocoding one, but it travels in the
 * same union on purpose: the caller asks one question — "where is this for?" —
 * and gets one answer shape back, whichever of the two services answered.
 */
export type WeatherPlace =
  | { ok: true; lat: number; lon: number; label: string }
  | { ok: false; reason: "network" | "http" | "not-found" | "bad-shape" | "denied" };

/** One day's answer. `ok: false` is a normal value, not an error to catch. */
export type WeatherDay =
  | { ok: true; condition: string; temp: number | null; fromCache: boolean }
  | {
      ok: false;
      reason: "no-location" | "network" | "http" | "bad-shape" | "denied" | "not-found";
    };

/** The bit the UI reads to decide whether a row may still be served. */
function isFresh(row: WeatherCacheRow, now: number): boolean {
  if (row.date < todayISO()) return true; // a past day's weather is final
  return now - row.fetchedAt < TODAY_TTL_MS;
}

/** Today, in the app's own date format. Inline so the module has no imports. */
function todayISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** The cache row's other half of the key: coordinates, rounded to ~1 km. */
export function locationKeyOf(place: { lat: number; lon: number }): string {
  // Three decimals is ~110 m — finer than a city, coarser than a street, and
  // stable across two devices of the same user, which a raw float is not.
  return `${place.lat.toFixed(3)},${place.lon.toFixed(3)}`;
}

function readCache(): WeatherCacheRow[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is WeatherCacheRow =>
        row !== null &&
        typeof row === "object" &&
        typeof (row as WeatherCacheRow).locationKey === "string" &&
        typeof (row as WeatherCacheRow).date === "string",
    );
  } catch {
    return [];
  }
}

function writeCache(rows: WeatherCacheRow[]): void {
  try {
    // Oldest out first, and the cap keeps the key from growing for ever —
    // a journal that fills the storage it runs in is a journal that crashes
    // quietly one day and takes its settings with it.
    localStorage.setItem(CACHE_KEY, JSON.stringify(rows.slice(-CACHE_MAX_ROWS)));
  } catch {
    // Quota or privacy mode. The cache is a convenience; losing it is not an
    // error to report.
  }
}

function cacheGet(locationKey: string, date: string): WeatherCacheRow | null {
  const row = readCache().find((r) => r.locationKey === locationKey && r.date === date);
  return row ?? null;
}

function cachePut(row: WeatherCacheRow): void {
  const rows = readCache().filter(
    (r) => !(r.locationKey === row.locationKey && r.date === row.date),
  );
  rows.push(row);
  writeCache(rows);
}

/**
 * WMO weather-interpretation codes, translated to the app's own five answers.
 *
 * The select the API fills has six options and the first is "— nem tudom —";
 * a code this map does not know lands on the empty option, which is the one
 * the user would have picked for "I do not know" — honest, rather than a
 * confident wrong guess between felhős and ködös.
 */
const WMO_CONDITION: Record<number, string> = {
  0: "sunny",
  1: "sunny",
  2: "cloudy",
  3: "cloudy",
  45: "foggy",
  48: "foggy",
  51: "rainy",
  53: "rainy",
  55: "rainy",
  56: "rainy",
  57: "rainy",
  61: "rainy",
  63: "rainy",
  65: "rainy",
  66: "rainy",
  67: "rainy",
  71: "snowy",
  73: "snowy",
  75: "snowy",
  77: "snowy",
  80: "rainy",
  81: "rainy",
  82: "rainy",
  85: "snowy",
  86: "snowy",
  95: "rainy",
  96: "rainy",
  99: "rainy",
};

export function wmoCondition(code: number | null | undefined): string {
  if (typeof code !== "number" || !Number.isFinite(code)) return "";
  return WMO_CONDITION[code] ?? "";
}

/** A city name, resolved once per (name) and cached in the same storage. */
const GEOCACHE_KEY = "belso-iranytu/weather-places/v1";

/**
 * A place this device has already asked about — a RESOLUTION or a MISS.
 *
 * Both halves are served, and that is what the cache is for: the miss is
 * cached deliberately (see `resolvePlace`), so reading it back is the only
 * way that promise is kept. Accepting any stored object rather than only an
 * `ok: true` one is safe by construction, not by hope: `placeCachePut` is
 * called from exactly two branches — a well-formed first result and an empty
 * result list — so every stored value is a `WeatherPlace` and `ok` is the
 * field that tells the two apart.
 */
function placeCacheGet(name: string): WeatherPlace | null {
  try {
    const raw = localStorage.getItem(GEOCACHE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, unknown>;
    const hit = map[name.toLowerCase()];
    if (hit && typeof hit === "object" && typeof (hit as { ok?: unknown }).ok === "boolean") {
      return hit as WeatherPlace;
    }
    return null;
  } catch {
    return null;
  }
}

function placeCachePut(name: string, place: WeatherPlace): void {
  try {
    const raw = localStorage.getItem(GEOCACHE_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    map[name.toLowerCase()] = place;
    localStorage.setItem(GEOCACHE_KEY, JSON.stringify(map));
  } catch {
    // As above: a lost convenience cache is not a reportable failure.
  }
}

/**
 * Resolve a city name to coordinates, through the geocoder, with a cache.
 *
 * A name that resolves to nothing is cached too — a typo the user typed once
 * should not cost a network round trip every time they open the form. The
 * cache is keyed lowercased, because "Budapest" and "budapest" are the same
 * place and the API's ranking is not.
 */
export async function resolvePlace(
  name: string,
  doFetch: typeof fetch = globalThis.fetch,
): Promise<WeatherPlace> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, reason: "not-found" };
  const cached = placeCacheGet(trimmed);
  if (cached) return cached;

  let res: Response;
  try {
    res = await doFetch(
      `${GEOCODE_URL}?name=${encodeURIComponent(trimmed)}&count=1&language=hu&format=json`,
    );
  } catch {
    return { ok: false, reason: "network" };
  }
  if (!res.ok) return { ok: false, reason: "http" };

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, reason: "bad-shape" };
  }
  const results = (body as { results?: unknown })?.results;
  if (!Array.isArray(results) || results.length === 0) {
    // Cache the miss: a name with no result will not grow one later.
    const miss: WeatherPlace = { ok: false, reason: "not-found" };
    placeCachePut(trimmed, miss);
    return miss;
  }
  const first = results[0] as { latitude?: unknown; longitude?: unknown; name?: unknown };
  if (
    typeof first.latitude !== "number" ||
    typeof first.longitude !== "number" ||
    !Number.isFinite(first.latitude) ||
    !Number.isFinite(first.longitude)
  ) {
    return { ok: false, reason: "bad-shape" };
  }
  const place: WeatherPlace = {
    ok: true,
    lat: first.latitude,
    lon: first.longitude,
    label: typeof first.name === "string" ? first.name : trimmed,
  };
  placeCachePut(trimmed, place);
  return place;
}

/** The browser's coordinates, or `denied`/`network` — never a throw. */
export function currentPosition(): Promise<WeatherPlace> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve({ ok: false, reason: "network" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          ok: true,
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          // The NAME a device fix produces. Round 17 moved it here; it is a
          // place label, not a place, so it travels with the reader's language.
          label: t("weather.placeGps"),
        }),
      () => resolve({ ok: false, reason: "denied" }),
      { timeout: 10_000, maximumAge: 30 * 60 * 1000 },
    );
  });
}

/**
 * One day's weather, from cache when it has it and from the API when it may.
 *
 * `doFetch` is injectable and looked up at the call, exactly as in
 * `pdfFonts.ts`. Every early return is a `WeatherDay` with a reason, so the
 * caller's degrade is a branch, not a try/catch.
 */
export async function fetchWeatherFor(
  location: WeatherLocation | null,
  date: string,
  doFetch: typeof fetch = globalThis.fetch,
): Promise<WeatherDay> {
  if (!location) return { ok: false, reason: "no-location" };

  let place: WeatherPlace;
  if (location.source === "gps") {
    place = await currentPosition();
  } else {
    place = await resolvePlace(location.name, doFetch);
  }
  if (!place.ok) {
    // Every reason means "use the manual boxes". `denied` is worth keeping
    // distinct — it is the one case where the user can fix it themselves in
    // the browser, so the UI's one-line note says so.
    return { ok: false, reason: place.reason };
  }

  const key = locationKeyOf(place);
  const cached = cacheGet(key, date);
  const now = Date.now();
  if (cached && isFresh(cached, now)) {
    return { ok: true, condition: cached.condition, temp: cached.temp, fromCache: true };
  }

  let res: Response;
  try {
    const params = new URLSearchParams({
      latitude: String(place.lat),
      longitude: String(place.lon),
      daily: "weather_code,temperature_2m_mean",
      timezone: "auto",
      start_date: date,
      end_date: date,
    });
    res = await doFetch(`${FORECAST_URL}?${params.toString()}`);
  } catch {
    return { ok: false, reason: "network" };
  }
  if (!res.ok) return { ok: false, reason: "http" };

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, reason: "bad-shape" };
  }
  const daily = (body as { daily?: unknown })?.daily as
    | { time?: unknown; weather_code?: unknown; temperature_2m_mean?: unknown }
    | undefined;
  if (
    !daily ||
    !Array.isArray(daily.time) ||
    !Array.isArray(daily.weather_code) ||
    !Array.isArray(daily.temperature_2m_mean)
  ) {
    return { ok: false, reason: "bad-shape" };
  }
  const i = daily.time.indexOf(date);
  if (i < 0) return { ok: false, reason: "bad-shape" };

  const code = daily.weather_code[i];
  const rawTemp = daily.temperature_2m_mean[i];
  const temp =
    typeof rawTemp === "number" && Number.isFinite(rawTemp) ? Math.round(rawTemp) : null;
  const row: WeatherCacheRow = {
    locationKey: key,
    date,
    condition: wmoCondition(typeof code === "number" ? code : null),
    temp,
    fetchedAt: now,
  };
  cachePut(row);
  return { ok: true, condition: row.condition, temp: row.temp, fromCache: false };
}

/** The two tracker values a successful fetch fills, in the registry's shape. */
export function weatherValuesFrom(day: WeatherDay): {
  "weather-condition"?: TrackerValue;
  "weather-temp"?: TrackerValue;
} {
  if (!day.ok) return {};
  return {
    ...(day.condition ? { "weather-condition": { kind: "select" as const, value: day.condition } } : {}),
    ...(day.temp !== null ? { "weather-temp": { kind: "number" as const, value: day.temp } } : {}),
  };
}

/** Test seam, same shape and same reason as `pdfFonts`' reset. */
export function resetWeatherCacheForTests(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(GEOCACHE_KEY);
  } catch {
    // Nothing to reset is nothing to fail on.
  }
}
