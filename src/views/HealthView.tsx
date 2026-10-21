/**
 * The Egészség tab — the health half of the record, one tap from anywhere.
 *
 * WHY THIS TAB EXISTS
 * Food, workouts, vitals and the check-ins used to live three taps deep inside
 * Felfedezés's drawer, behind a tab named for browsing (`docs/nav-rethink.md`,
 * P1/P4). The drawer was the first slice of the re-cut: a sixth nav slot with
 * its three sections, shipping with their titles and summaries and a sentence
 * of copy each. This is the second slice — the cards themselves moved in, and
 * Felfedezés no longer has a health drawer at all. A record that lives in two
 * places is a record a reader stops trusting.
 *
 * WHY THE SECTION TITLES ARE STILL PLAIN TEXT
 * The three section heads ("Táplálkozás", "Edzés", "Egyéb") are literal
 * Hungarian, exactly as they were in the first slice, so the view cannot fail
 * on a missing catalogue key. Everything INSIDE them — every card's title,
 * summary and sentence — goes through `t()`, because those strings already had
 * keys while the cards lived in the toolbox. Moving the containers into the
 * catalogue is still a mechanical swap.
 *
 * WHAT WENT WHERE
 *   Táplálkozás — the food log, the photo capture, the week's summary and the
 *                 nutrition transparency card.
 *   Edzés       — the workout programmes, the plans-and-log card, and the sport
 *                 transparency card.
 *   Egyéb       — vitals, medication, habits, the PHQ-8 assessment and the
 *                 GAD-7 check-in.
 * The gates travel with the cards: `vitalsModule`, `medsModule` and
 * `assessmentsEnabled` silence the same mounts here that they silenced in the
 * drawer. `Gad7Card` stays UNGATED — see the note at its mount.
 *
 * THE REORDER WIRING IS THE SAME CONTRACT EVERY OTHER TAB HAS
 * Three sections declared as data, rendered through `SectionList`, and the
 * `ReorderToggle` BELOW it — the source order
 * `tests/views/section-reorder-integration.test.tsx` audits on every tab.
 */
import { useMemo, useState } from "react";
import SectionList, {
  ReorderToggle,
  useSectionOrder,
  type SectionSpec,
} from "../components/SectionList";
import { CollapsibleCard, SectionTitle } from "../components/ui/ui";
import ContentIcon from "../components/ContentIcon";
import { useApp } from "../state/AppContext";
import { t } from "../lib/i18n";
import { SAFETY_NOTE } from "../lib/nutritionTips";
import { REST_NUDGE } from "../lib/sportTips";
import { Activity, Dumbbell, Salad } from "../lib/icons";
import NutritionCard from "../components/NutritionCard";
import FoodPhotoCapture from "../components/FoodPhotoCapture";
import WorkoutPrograms from "../components/WorkoutPrograms";
import FitnessCard from "../components/FitnessCard";
import HabitStreaks from "../components/HabitStreaks";
import SleepLogCard from "../components/SleepLogCard";
import AssessmentModule from "../components/AssessmentModule";
import Gad7Card from "../components/Gad7Card";
import { MiniVitals, MiniMeds, WeeklyNutritionCard } from "../components/HealthModules";
import type { AppData } from "../types";

export const HEALTH_SECTION_IDS = ["nutrition", "training", "general"] as const;

export type HealthSectionId = (typeof HEALTH_SECTION_IDS)[number];

/** The three settings gates the health cards honoured in the toolbox. */
type HealthFlags = Pick<
  AppData["settings"],
  "vitalsModule" | "medsModule" | "assessmentsEnabled"
>;

export function defaultHealthSections(flags: HealthFlags): SectionSpec<HealthSectionId>[] {
  return [
    {
      id: "nutrition" as HealthSectionId,
      label: "Táplálkozás",
      render: () => (
        <CollapsibleCard
          id="health-nutrition"
          title="Táplálkozás"
          icon={<Salad />}
          summary="Ételek, italok és tápanyagok"
        >
          <NutritionCard />
          <FoodPhotoCapture />
          <WeeklyNutritionCard />
          {/* The transparency card rides with the food cards it explains: a
              reader who meets a nutrition tip should not have to leave the tab
              to learn where the sentence came from. The id keeps its
              `settings.` prefix — it is a storage key, and a reader who had the
              card open in Felfedezés finds it open here. */}
          <CollapsibleCard
            id="settings-nutrition-tips"
            title={t("settings.nutrition.title")}
            icon={<ContentIcon name="Salad" />}
            summary={t("settings.nutrition.summary")}
          >
            <p className="muted-note">{t("settings.nutrition.note")}</p>
            <ul className="tips-list">
              <li>{t("settings.nutrition.example1")}</li>
              <li>{t("settings.nutrition.example2")}</li>
            </ul>
            <p className="muted-note">{t("settings.nutrition.weekNote")}</p>
            <p className="muted-note">{SAFETY_NOTE}</p>
          </CollapsibleCard>
        </CollapsibleCard>
      ),
    },
    {
      id: "training" as HealthSectionId,
      label: "Edzés",
      render: () => (
        <CollapsibleCard
          id="health-training"
          title="Edzés"
          icon={<Dumbbell />}
          summary="Mozgás, programok és teljesítmény"
        >
          <WorkoutPrograms />
          <FitnessCard />
          <CollapsibleCard
            id="settings-sport-tips"
            title={t("settings.sport.title")}
            icon={<ContentIcon name="TrendingUp" />}
            summary={t("settings.sport.summary")}
          >
            <p className="muted-note">{t("settings.sport.note")}</p>
            <ul className="tips-list">
              <li>{t("settings.sport.example1")}</li>
              <li>{t("settings.sport.example2")}</li>
              <li>{REST_NUDGE}</li>
            </ul>
            <p className="muted-note">{t("settings.sport.programsNote")}</p>
          </CollapsibleCard>
        </CollapsibleCard>
      ),
    },
    {
      id: "general" as HealthSectionId,
      label: "Egyéb",
      render: () => (
        <CollapsibleCard
          id="health-general"
          title="Egyéb"
          icon={<Activity />}
          summary="Vittek, szokások és kérdőívek"
        >
          {flags.vitalsModule && <MiniVitals />}
          {flags.medsModule && <MiniMeds />}
          <HabitStreaks />
          {/* The night, next to the habits and above the questionnaires: it is a
              record the reader keeps, not an instrument somebody scores. */}
          <SleepLogCard />
          {flags.assessmentsEnabled && <AssessmentModule />}
          {/* Ungated on purpose, and it is the only health card that is: the
              flag above guards a questionnaire that KEEPS A LOG, and the
              consent screen in Settings is where a reader agrees to that. The
              check-in writes nothing — its answers live in component state and
              leave with the card — so there is no storage to consent to, and a
              gate here would be guarding nothing. Its own intro says so. */}
          <Gad7Card />
        </CollapsibleCard>
      ),
    },
  ];
}

export default function HealthView() {
  const { data } = useApp();
  const [reordering, setReordering] = useState(false);
  const order = useSectionOrder("health");

  const flags = {
    vitalsModule: data.settings.vitalsModule,
    medsModule: data.settings.medsModule,
    assessmentsEnabled: data.settings.assessmentsEnabled,
  };
  // Rebuilt when a gate toggles elsewhere, like the toolbox's list: the
  // sections are cheap and the state is not theirs.
  const sections = useMemo(() => defaultHealthSections(flags), [
    flags.vitalsModule,
    flags.medsModule,
    flags.assessmentsEnabled,
  ]);

  return (
    <div className="view">
      <SectionTitle
        // `Activity` is chrome, not content — the nav's own row is where the
        // tab's Fluent artwork lives, exactly like the toolbox header's
        // `Briefcase`. The title comes from the catalogue key the nav row and
        // the drawer head used before the move, so the tab is named the same
        // thing everywhere a reader meets it.
        icon={<Activity />}
        title={t("tools.health.title")}
      />
      <SectionList
        sections={sections}
        value={order.stored}
        onChange={order.setOrder}
        onReset={order.reset}
        rearranging={reordering}
      />
      <ReorderToggle active={reordering} onToggle={() => setReordering((v) => !v)} />
    </div>
  );
}
