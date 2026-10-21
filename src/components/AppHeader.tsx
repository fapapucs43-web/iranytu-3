import { todayISO, formatShort } from "../lib/dates";
import ContentIcon from "./ContentIcon";
import { t } from "../lib/i18n";

export default function AppHeader({ name, streak }: { name: string; streak: number }) {
  const hour = new Date().getHours();
  // Four keys, not one with an hour range in it: a language does not have to
  // greet on the same hours, and a single "0-6 / 6-12 / 12-18 / 18-24" key
  // would put the app's clock in the translator's hands.
  const partOfDay =
    hour < 6
      ? t("app.greetingNight")
      : hour < 12
        ? t("app.greetingMorning")
        : hour < 18
          ? t("app.greetingDay")
          : t("app.greetingEvening");
  const greeting = name
    ? t("app.greetingNamed", { part: partOfDay, name })
    : t("app.greetingAnonymous", { part: partOfDay });

  return (
    <header className="app-header">
      <div className="app-header-brand">
        <span className="app-logo" aria-hidden="true">
          <ContentIcon name="Compass" size="1.4em" />
        </span>
        <div>
          <p className="app-greeting">{greeting}</p>
          <h1 className="app-title">{t("app.name")}</h1>
        </div>
      </div>
      <div className="app-header-side">
        {streak > 0 && (
          <span className="streak-chip" title={t("app.streakTitle")}>
            <ContentIcon name="Flame" size="1.1em" /> {t("app.streakChip", { count: streak })}
          </span>
        )}
        <span className="header-date">{formatShort(todayISO())}</span>
      </div>
    </header>
  );
}
