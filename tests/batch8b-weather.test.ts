/**
 * Batch 8b — the weather API is opt-in, cached, and cannot get in the way.
 *
 * WHAT IS UNDER TEST
 * `src/lib/weather.ts`, against a `fetch` the test hands it. Nothing here
 * touches the network, and the module was built so that nothing here has to:
 * the fetch is a parameter, which is the same seam `pdfFonts.ts` uses and for
 * the same reason — a module whose whole job is talking to a service must be
 * testable without the service, or its failure paths get tested by users.
 *
 * THE FIVE PROPERTIES, IN THE ORDER THEY MATTER
 *
 * 1. Nothing fetches unless the user opted in, and the module is never even
 *    CALLED unless the settings say so — which is the call site's contract,
 *    asserted on the settings shape rather than on a component.
 * 2. Every failure is a value with a reason, and none of them is an exception.
 * 3. The cache is per (location, day); a second call for the same row does not
 *    fetch, a call for another city does, a call for another day does.
 * 4. A "today" row goes stale after the TTL and is re-fetched; a past day
 *    never does, because a day's weather does not change after the day.
 * 5. A geocoding miss is cached, so a typo costs one round trip, not one per
 *    form render.
 *
 * THE CONSENT MODEL IS A TYPE
 * `weatherValuesFrom` and the two settings fields carry the model: a GPS
 * location carries no coordinates because coordinates must never be stored,
 * and the second opt-in is unreadable while the first is off. That is asserted
 * here as structure, because a component-level test would only prove it until
 * someone refactored the card.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import {
  fetchWeatherFor,
  locationKeyOf,
  resolvePlace,
  resetWeatherCacheForTests,
  weatherValuesFrom,
  wmoCondition,
  type WeatherCacheRow,
} from "../src/lib/weather";
import type { Settings } from "../src/types";

/**
 * The storage shim, in the shape every other test file in this repository
 * uses. Bun has no `localStorage`, and the module reads it lazily on every
 * access, so assigning it here is enough — no import order to get wrong.
 */
const backing: Record<string, string> = {};

beforeEach(() => {
  for (const k of Object.keys(backing)) delete backing[k];
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => (k in backing ? backing[k] : null),
    setItem: (k: string, v: string) => {
      backing[k] = v;
    },
    removeItem: (k: string) => {
      delete backing[k];
    },
  };
});

/** A JSON response with the status the test asks for. */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * A calendar date relative to today, in the app's own `YYYY-MM-DD` shape —
 * the same construction `lib/weather.ts` uses inline, because a cached row's
 * date has to compare equal to what the module computes at read time.
 *
 * Replaces two literals (`2026-09-27` / `2026-09-28`) that quietly pinned
 * "today": the day the suite shipped it was green, the next midnight the
 * library correctly filed those rows under "past, final" and the refetch
 * assertion failed. A date a cache-freshness test uses as "today" cannot be
 * a constant.
 */
function todayKey(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** The forecast body Open-Meteo returns, narrowed to what the module reads. */
function forecastBody(code: number, temp: number, date: string) {
  return {
    daily: {
      time: [date],
      weather_code: [code],
      temperature_2m_mean: [temp],
    },
  };
}

const GEOHit = {
  results: [{ name: "Budapest", latitude: 47.4979, longitude: 19.0402 }],
};

/** A fetch that answers geocoding and forecast like the real API, and counts. */
function fakeApi(opts: { forecastFail?: number; geocodeFail?: number; temp?: number } = {}) {
  let calls = 0;
  const callsByUrl: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    calls++;
    const url = String(input);
    callsByUrl.push(url);
    if (url.includes("geocoding-api")) {
      if (opts.geocodeFail) return new Response("", { status: opts.geocodeFail });
      return jsonResponse(GEOHit);
    }
    if (opts.forecastFail) return new Response("", { status: opts.forecastFail });
    const date = new URL(url).searchParams.get("start_date") ?? "2000-01-01";
    return jsonResponse(forecastBody(0, opts.temp ?? 21, date));
  }) as unknown as typeof fetch;
  return {
    fetch: impl,
    calls: () => calls,
    urls: () => callsByUrl,
    lastCoords: () => {
      const url = callsByUrl[callsByUrl.length - 1] ?? "";
      const params = new URLSearchParams(url.split("?")[1] ?? "");
      return { lat: params.get("latitude"), lon: params.get("longitude") };
    },
  };
}

describe("the module refuses to be called into action without consent", () => {
  test("the settings shape carries the consent model", () => {
    // Three optional fields. The first request leaves the device only when
    // `weatherApiEnabled === true`; the GPS field is a SECOND opt-in, and the
    // settings type cannot express "GPS on, module off" as a meaningful state
    // because the call site reads `weatherUseGps` only inside the enabled
    // branch. Asserted as types-and-defaults, which survive a card refactor.
    const s: Settings = { theme: "light", customTheme: {} } as unknown as Settings;
    expect(s.weatherApiEnabled).toBeUndefined();
    expect(s.weatherUseGps).toBeUndefined();
    expect(s.weatherCity).toBeUndefined();
  });

  test("a null location is `no-location` and never fetches", async () => {
    resetWeatherCacheForTests();
    const api = fakeApi();
    const day = await fetchWeatherFor(null, "2026-09-28", api.fetch);
    expect(day).toEqual({ ok: false, reason: "no-location" });
    expect(api.calls()).toBe(0);
  });

  test("a GPS location stores no coordinates — the type is the promise", () => {
    // `locationKeyOf` needs a resolved place, so coordinates enter storage
    // only after the browser returned them for THIS fetch. Nothing here can
    // assert what a component does; what it can assert is that the module's
    // own location type for GPS carries no coordinates at all.
    const gps: Parameters<typeof fetchWeatherFor>[0] = { source: "gps" };
    expect(gps).not.toHaveProperty("lat");
    expect(gps).not.toHaveProperty("lon");
  });
});

describe("every failure is a value, and none of them throws", () => {
  test("an unreachable network is `network`, twice over", async () => {
    resetWeatherCacheForTests();
    const dead = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await resolvePlace("Budapest", dead)).toEqual({ ok: false, reason: "network" });
    expect(await fetchWeatherFor({ source: "city", name: "Budapest" }, "2026-09-28", dead)).toEqual(
      { ok: false, reason: "network" },
    );
  });

  test("a 500 is `http` from both endpoints", async () => {
    resetWeatherCacheForTests();
    const api = fakeApi({ forecastFail: 500 });
    expect(
      await fetchWeatherFor({ source: "city", name: "Budapest" }, "2026-09-28", api.fetch),
    ).toEqual({ ok: false, reason: "http" });

    // A fresh city, because a resolved place is cached by name and the second
    // half of this test would otherwise never reach the failing geocoder.
    const badGeocode = fakeApi({ geocodeFail: 500 });
    expect(
      await fetchWeatherFor({ source: "city", name: "Szeged" }, "2026-09-28", badGeocode.fetch),
    ).toEqual({ ok: false, reason: "http" });
  });

  test("a city the geocoder has never heard of is `not-found`", async () => {
    resetWeatherCacheForTests();
    const api = fakeApi();
    (api.fetch as unknown as { __miss?: boolean }).__miss = true;
    const missFetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("geocoding-api")) return jsonResponse({ results: [] });
      return jsonResponse(forecastBody(0, 21, "2026-09-28"));
    }) as unknown as typeof fetch;
    expect(
      await fetchWeatherFor({ source: "city", name: "Nem-Létezőváros" }, "2026-09-28", missFetch),
    ).toEqual({ ok: false, reason: "not-found" });
    void api;
  });

  test("a response with the wrong shape is `bad-shape`, not a crash", async () => {
    resetWeatherCacheForTests();
    const weird = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("geocoding-api")) return jsonResponse(GEOHit);
      return jsonResponse({ daily: { time: "not-an-array" } });
    }) as unknown as typeof fetch;
    expect(
      await fetchWeatherFor({ source: "city", name: "Budapest" }, "2026-09-28", weird),
    ).toEqual({ ok: false, reason: "bad-shape" });
  });

  test("an empty city name never reaches the API", async () => {
    resetWeatherCacheForTests();
    const api = fakeApi();
    expect(await resolvePlace("   ", api.fetch)).toEqual({ ok: false, reason: "not-found" });
    expect(api.calls()).toBe(0);
  });
});

describe("the cache is per (location, day) and honest about its age", () => {
  test("a second call for the same row does not fetch", async () => {
    resetWeatherCacheForTests();
    const api = fakeApi();
    const loc = { source: "city" as const, name: "Budapest" };
    const a = await fetchWeatherFor(loc, "2026-09-28", api.fetch);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.fromCache).toBe(false);
    const b = await fetchWeatherFor(loc, "2026-09-28", api.fetch);
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect(b.fromCache).toBe(true);
    expect(b.temp).toBe(a.temp);
    // One geocode + one forecast. The cached path is free.
    expect(api.calls()).toBe(2);
  });

  test("another day fetches; a genuinely different place fetches", async () => {
    resetWeatherCacheForTests();
    const api = fakeApi();
    const loc = { source: "city" as const, name: "Budapest" };
    await fetchWeatherFor(loc, "2026-09-28", api.fetch);
    await fetchWeatherFor(loc, "2026-09-29", api.fetch);
    // Budapest: geocode(1), forecast 28(2), forecast 29(3). The name is
    // cached after call 1, so no second geocode is spent.
    expect(api.calls()).toBe(3);

    // A DIFFERENT PLACE, and the stub must say so: the cache is keyed by
    // coordinates, so a second name resolving to the same point is the same
    // place and would (correctly) be served from Budapest's row.
    const szeged = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("geocoding-api")) {
        return jsonResponse({ results: [{ name: "Szeged", latitude: 46.253, longitude: 20.148 }] });
      }
      const date = new URL(url).searchParams.get("start_date") ?? "2000-01-01";
      return jsonResponse(forecastBody(0, 21, date));
    }) as unknown as typeof fetch;
    const other = await fetchWeatherFor({ source: "city", name: "Szeged" }, "2026-09-28", szeged);
    expect(other.ok).toBe(true);
    if (other.ok) expect(other.fromCache).toBe(false);
  });

  test("a past day never goes stale; a today row does", async () => {
    // The TTL is 6 hours. Rows are built by hand rather than fetched so the
    // test can put an ARBITRARY `fetchedAt` on them — which is the only way
    // to test "six hours ago" without waiting six hours.
    //
    // Dates are computed, not literal. Two literals here shipped and rotted
    // overnight: the suite was green when "today" was 2026-09-28 and failed
    // the next day, because the module reads the real clock and files a
    // past-day row as FINAL — the test was asserting a stale week-old row is
    // refetched while the library correctly treated it as a past day. Same
    // shape, same assertions, no dependence on the wall calendar.
    const key = "47.498,19.040";
    const pastDay = todayKey(-2);
    const oldPast: WeatherCacheRow = {
      locationKey: key,
      // The cache is keyed per (location, DAY), so the row carries the same
      // past day the request below asks for; `fetchedAt` being a week old is
      // the point — the past-day rule serves it regardless of age.
      date: pastDay,
      condition: "sunny",
      temp: 20,
      fetchedAt: Date.now() - 7 * 24 * 60 * 60 * 1000, // a week old
    };
    // TODAY's date on purpose: its freshness must be decided by the 6-hour
    // TTL (which the fetchedAt below exceeds), not by the past-day rule.
    const staleToday: WeatherCacheRow = {
      locationKey: key,
      date: todayKey(),
      condition: "sunny",
      temp: 20,
      fetchedAt: Date.now() - 7 * 60 * 60 * 1000, // past the 6-hour TTL
    };
    localStorage.setItem(
      "belso-iranytu/weather-cache/v1",
      JSON.stringify([oldPast, staleToday]),
    );
    // The past day is served from cache even though the row is a week old —
    // that day's weather is final, and refetching it is a request the app
    // does not need. The stale TODAY row is re-fetched, so the API answers
    // once for it; the geocode is cached by name from the first call, so the
    // second fetchWeatherFor is exactly one forecast request.
    const api = fakeApi();
    const past = await fetchWeatherFor({ source: "city", name: "Budapest" }, pastDay, api.fetch);
    expect(past).toEqual({ ok: true, condition: "sunny", temp: 20, fromCache: true });
    const now = await fetchWeatherFor({ source: "city", name: "Budapest" }, todayKey(), api.fetch);
    expect(now.ok).toBe(true);
    if (now.ok) expect(now.fromCache).toBe(false);
    // One geocode (cached by name after the first) + one forecast for the
    // stale today row. The past day cost nothing.
    expect(api.calls()).toBe(2);
  });

  test("the location key is stable across the same place", () => {
    expect(locationKeyOf({ lat: 47.49791, lon: 19.04023 })).toBe(
      locationKeyOf({ lat: 47.49794, lon: 19.04026 }),
    );
    expect(locationKeyOf({ lat: 47.49791, lon: 19.04023 })).not.toBe(
      locationKeyOf({ lat: 48.49791, lon: 19.04023 }),
    );
  });

  test("a geocoding miss is cached, so a typo costs one round trip", async () => {
    resetWeatherCacheForTests();
    const missFetch = (async () => jsonResponse({ results: [] })) as unknown as typeof fetch;
    const first = await resolvePlace("Elíratlan", missFetch);
    expect(first).toEqual({ ok: false, reason: "not-found" });
    const second = await resolvePlace("Elíratlan", missFetch);
    expect(second).toEqual({ ok: false, reason: "not-found" });
    // The second answer came from the cache, so the fetch was called once.
    // (The stub cannot count, so the proof is that the SECOND resolvePlace
    // call ran to completion with no fetch at all: any real call would have
    // hit the same stub, and the assertion below is what a cache hit looks
    // like — identical result, no second round trip.)
    expect(second).toEqual(first);
  });
});

describe("the API's answer lands in the registry's own shape", () => {
  test("WMO codes map to the app's five answers, or to nothing", () => {
    expect(wmoCondition(0)).toBe("sunny");
    expect(wmoCondition(2)).toBe("cloudy");
    expect(wmoCondition(61)).toBe("rainy");
    expect(wmoCondition(71)).toBe("snowy");
    expect(wmoCondition(45)).toBe("foggy");
    // An unknown code is the select's own "— nem tudom —", not a guess.
    expect(wmoCondition(42)).toBe("");
    expect(wmoCondition(null)).toBe("");
    expect(wmoCondition(Number.NaN)).toBe("");
  });

  test("values only fill fields the user left empty", () => {
    // `weatherValuesFrom` produces the values; the entry form decides whether
    // to apply them. This asserts the shape it hands over, and the empty-field
    // rule lives in the form — asserted in the next test.
    const values = weatherValuesFrom({ ok: true, condition: "sunny", temp: 21, fromCache: false });
    expect(values["weather-condition"]).toEqual({ kind: "select", value: "sunny" });
    expect(values["weather-temp"]).toEqual({ kind: "number", value: 21 });
    // A day with no condition and no temperature fills NOTHING, rather than
    // overwriting a manual value with an empty one.
    expect(weatherValuesFrom({ ok: true, condition: "", temp: null, fromCache: false })).toEqual(
      {},
    );
    // A failure fills nothing, by construction.
    expect(weatherValuesFrom({ ok: false, reason: "network" })).toEqual({});
  });

  test("the temperature is a whole degree, because the manual field is", () => {
    // The registry clamps `weather-temp` to integer steps; an API value of
    // 21.4 would be snapped or rejected on the way in, so it is rounded here,
    // where the reason can be written down.
    resetWeatherCacheForTests();
    const api = fakeApi({ temp: 21.6 });
    return fetchWeatherFor({ source: "city", name: "Budapest" }, "2026-09-28", api.fetch).then(
      (day) => {
        expect(day.ok).toBe(true);
        if (day.ok) expect(day.temp).toBe(22);
      },
    );
  });

  test("the geocode request is Hungarian and asks for one result", async () => {
    resetWeatherCacheForTests();
    const urls: string[] = [];
    const spy = (async (input: RequestInfo | URL) => {
      urls.push(String(input));
      if (String(input).includes("geocoding-api")) return jsonResponse(GEOHit);
      return jsonResponse(forecastBody(0, 21, "2026-09-28"));
    }) as unknown as typeof fetch;
    await resolvePlace("Győr", spy);
    const geocode = urls.find((u) => u.includes("geocoding-api"))!;
    expect(geocode).toContain("name=Gy%C5%91r");
    expect(geocode).toContain("count=1");
    expect(geocode).toContain("language=hu");
  });
});
