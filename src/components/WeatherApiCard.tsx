/**
 * The weather API's settings card.
 *
 * WHERE THE CONSENT LIVES
 * The toggles on this card are the consent. There is no dialog on the entry
 * form, no "allow this site" banner at fetch time, no nudge anywhere — the
 * user reads two sentences in Hungarian on the Settings tab and decides
 * there. That is the whole model, and it is why the card explains WHAT leaves
 * the device rather than burying it in a hint: the first toggle sends a city
 * name to open-meteo.com; the second sends the device's coordinates to the
 * same API. Nothing else is sent, nothing is stored beyond the cached day.
 *
 * WHY THE SECOND TOGGLE IS RENDER-CONDITIONAL, NOT DISABLED
 * A disabled control still advertises the feature; a control that is not
 * there until the first one is on does not. `weatherUseGps` is only readable
 * after `weatherApiEnabled`, which is the two-step shape the batch was
 * specified with — manual city first, geolocation as a deliberate second
 * yes.
 *
 * WHY "Kipróbálás" EXISTS
 * The entry form fills itself the next time the user opens it, which is
 * correct and also invisible: turning the module on and then seeing nothing
 * happen reads as "it does not work". The button fetches today's weather
 * right here and says so in one line — including when it fails, where the
 * failure line is the honest one ("most nem sikerült lekérni") rather than
 * an error dialog. The button never blocks anything and never opens anything.
 */
import { useState } from "react";
import { useApp } from "../state/AppContext";
import { CollapsibleCard, TextInput, Toggle } from "./ui/ui";
import ContentIcon from "./ContentIcon";
import { fetchWeatherFor, type WeatherDay } from "../lib/weather";
import { t } from "../lib/i18n";

/**
 * The geocoder and the forecast API are two different hosts. Naming both in
 * the copy is the honest version of "your city name leaves the device" — and
 * it is ONE key in the catalogue, whole sentence, so a reviewer can read
 * exactly what the user was told. It used to be a concatenation of two
 * literals here, which is the one shape that could hide half the promise.
 */
const WHAT_LEAVES = t("weather.whatLeaves");

export default function WeatherApiCard() {
  const { data, setSettings } = useApp();
  const s = data.settings;
  const [city, setCity] = useState(s.weatherCity ?? "");
  const [probe, setProbe] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);

  const on = s.weatherApiEnabled === true;
  const gpsOn = s.weatherUseGps === true;

  function patch(next: Partial<typeof s>) {
    setSettings({ ...s, ...next });
  }

  /** Turning the module off also turns the GPS half off, in the same write. */
  function setEnabled(v: boolean) {
    patch(v ? { weatherApiEnabled: true } : { weatherApiEnabled: false, weatherUseGps: false });
    setProbe(null);
  }

  async function tryNow() {
    setProbing(true);
    setProbe(null);
    const location = gpsOn
      ? ({ source: "gps" } as const)
      : city.trim()
        ? ({ source: "city", name: city.trim() } as const)
        : null;
    const day: WeatherDay = await fetchWeatherFor(location, todayISO());
    setProbing(false);
    if (!day.ok) {
      // The honest line, not a dialog. Every failure reason maps to one
      // sentence, and the manual fields still work — which the line says.
      setProbe(
        day.reason === "no-location"
          ? t("weather.errorNoLocation")
          : day.reason === "denied"
            ? t("weather.errorDenied")
            : t("weather.errorFetch"),
      );
      return;
    }
    setProbe(
      day.fromCache
        ? t("weather.probeCached", { value: describe(day) })
        : t("weather.probeFresh", { value: describe(day) }),
    );
  }

  return (
    // `CloudSun` and not `Sun`: every ContentIcon name must have artwork in
    // at least one set (`tests/batch7f.test.ts` counts and checks the call
    // sites), and `sun-behind-cloud` is in the fluent set while a bare sun is
    // not. It is also the more accurate picture for a weather module.
    <CollapsibleCard
      id="weather-api"
      title={t("weather.title")}
      icon={<ContentIcon name="CloudSun" />}
      summary={t("weather.summary")}
    >
      <p className="muted-note">{WHAT_LEAVES}</p>
      <Toggle
        label={t("weather.toggleLabel")}
        hint={t("weather.toggleHint")}
        checked={on}
        onChange={setEnabled}
      />
      {on && (
        <>
          <label className="field-label" htmlFor="weather-city">
            {t("weather.cityLabel")}
            <TextInput
              id="weather-city"
              type="text"
              placeholder={t("weather.cityPlaceholder")}
              maxLength={80}
              value={city}
              onChange={(e) => {
                setCity(e.target.value);
                patch({ weatherCity: e.target.value });
              }}
            />
            <small className="muted-note">{t("weather.cityNote")}</small>
          </label>
          <Toggle
            label={t("weather.gpsLabel")}
            hint={t("weather.gpsHint")}
            checked={gpsOn}
            onChange={(v) => patch({ weatherUseGps: v })}
          />
          <div className="weather-try">
            <button
              type="button"
              className="btn"
              onClick={tryNow}
              disabled={probing || (!gpsOn && city.trim() === "")}
            >
              {probing ? t("weather.tryBusy") : t("weather.tryNow")}
            </button>
            {probe && (
              <small className="muted-note" role="status">
                {probe}
              </small>
            )}
          </div>
        </>
      )}
    </CollapsibleCard>
  );
}

function describe(day: Extract<WeatherDay, { ok: true }>): string {
  const parts: string[] = [];
  if (day.condition) parts.push(CONDITION_HU[day.condition] ?? day.condition);
  if (day.temp !== null) parts.push(`${day.temp} °C`);
  return parts.length > 0 ? parts.join(", ") : t("weather.noReadableValue");
}

/**
 * The provider's condition codes as Hungarian words, resolved through the
 * catalogue. An unknown code falls through to the raw code rather than to an
 * empty cell, which is why the record is keyed by code instead of listed as an
 * array the caller has to index safely.
 */
const CONDITION_HU: Record<string, string> = {
  sunny: t("weather.conditionSunny"),
  cloudy: t("weather.conditionCloudy"),
  rainy: t("weather.conditionRainy"),
  snowy: t("weather.conditionSnowy"),
  foggy: t("weather.conditionFoggy"),
};

/** Today, in the app's date format — the same string the entry form keys by. */
function todayISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
