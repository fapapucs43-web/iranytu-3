import { CollapsibleCard, Toggle } from "./ui/ui";
import ContentIcon from "./ContentIcon";
import { t } from "../lib/i18n";
import { ALLERGENS, type AllergenId } from "../lib/nutrition";
import { useApp } from "../state/AppContext";

/**
 * Étrend és allergiák (Batch 15, Phase 2 commit 3) — where a reader marks what
 * the meal card must warn about.
 *
 * WHY IT IS A SETTINGS CARD AND NOT A CONTROL ON THE CARD
 * The marking is a fact about the reader, decided once, and the meal card is a
 * daily surface — a warning control in a day's list would be a switch that
 * changes the meaning of every past day's reading. So it lives here, beside the
 * tracker and module switches, and the meal card only reads it.
 *
 * WHAT A MARKING DOES, SAID PLAINLY ON THE CARD
 * It matches the food's NAME, not its ingredients, and the note says so. That
 * limit is the honest one: the app cannot know what was in a dish, and a
 * warning that implied otherwise would be worse than no warning at all. The
 * switch writes the whole list through `setSettings`, so an unmarking is one
 * write rather than a delete buried in a module.
 */
export default function AllergySettingsCard() {
  const { data, setSettings } = useApp();
  const marked = data.settings.foodAllergies ?? [];

  /** The labels, one literal `t()` call each — the sweep looks for the string. */
  const label: Record<AllergenId, string> = {
    peanut: t("nutrition.allergen.peanut"),
    nut: t("nutrition.allergen.nut"),
    milk: t("nutrition.allergen.milk"),
    egg: t("nutrition.allergen.egg"),
    gluten: t("nutrition.allergen.gluten"),
    soy: t("nutrition.allergen.soy"),
    fish: t("nutrition.allergen.fish"),
    shellfish: t("nutrition.allergen.shellfish"),
    sesame: t("nutrition.allergen.sesame"),
    sulphite: t("nutrition.allergen.sulphite"),
  };

  function toggle(allergen: AllergenId, on: boolean) {
    const next = on ? [...marked, allergen] : marked.filter((a) => a !== allergen);
    setSettings({ ...data.settings, foodAllergies: next });
  }

  return (
    <CollapsibleCard
      id="settings-allergies"
      title={t("settings.allergies.title")}
      icon={<ContentIcon name="Salad" />}
      summary={
        marked.length
          ? t("settings.allergies.summary", { on: marked.length, total: ALLERGENS.length })
          : t("settings.allergies.off")
      }
    >
      <p className="muted-note">{t("settings.allergies.note")}</p>
      <div role="group" aria-label={t("settings.allergies.legend")}>
        {ALLERGENS.map((a) => (
          <Toggle
            key={a.id}
            label={label[a.id]}
            checked={marked.includes(a.id)}
            onChange={(v) => toggle(a.id, v)}
          />
        ))}
      </div>
      <p className="muted-note">{t("settings.allergies.limit")}</p>
    </CollapsibleCard>
  );
}
