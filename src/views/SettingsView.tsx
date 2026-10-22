import ContentIcon from "../components/ContentIcon";
import { NAV_ICONS } from "../lib/nav-icons";
import SectionList, {
  ReorderToggle,
  useSectionOrder,
  type SectionSpec,
} from "../components/SectionList";
import { useRef, useState, type ReactNode } from "react";
import { useApp } from "../state/AppContext";
import { useTheme } from "../state/ThemeContext";
import {
  CollapsibleCard,
  ConfirmDialog,
  SectionTitle,
  Segmented,
  Toggle,
} from "../components/ui/ui";
import { entriesToCsv, csvToEntries } from "../lib/csv";
import { orderedTabs } from "../lib/navVisibility";
import { isLlmAvailable, parseVoiceMetrics } from "../lib/voice";
import { coerceLocale, SUPPORTED_LOCALES, localeTag, t, type Locale } from "../lib/i18n";
import { downloadText } from "../lib/download";
import { themeMeta } from "../lib/themes";
import { fontDef, handFontDef, HAND_FONTS } from "../lib/fonts";
import { iconSetDef } from "../lib/iconsets";
import type { Settings } from "../types";
import {
  DEFAULT_ENABLED_TRACKERS,
  isTrackerGroupEnabled,
  trackerGroupHeads,
  trackerGroupMembers,
} from "../lib/trackers";
import ReminderCard from "../components/ReminderCard";
import BackgroundImagePicker from "../components/BackgroundImagePicker";
import { resetBackgroundImage } from "../lib/imageBackground";
import { resetCardStates } from "../lib/cardStates";
import { resetDiet } from "../lib/diets";
import { resetNutrition } from "../lib/nutrition";
import { resetCustomFoods } from "../lib/customFoods";
import { resetFitness } from "../lib/fitness";
import { resetExperiments } from "../lib/experiments";
import { resetSeenBadges } from "../lib/achievements";
import { resetEventFeatures } from "../lib/featureFlags";
import CustomThemeEditor from "../components/CustomThemeEditor";
import CustomTrackerManager from "../components/CustomTrackerManager";
import CustomActivityManager from "../components/CustomActivityManager";
import MedicationTimesCard from "../components/MedicationTimesCard";
import AllergySettingsCard from "../components/AllergySettingsCard";
import PinLockSettings from "../components/PinLockSettings";
import BackupSettingsCard from "../components/BackupSettingsCard";
import { clearLock } from "../lib/appLock";
import { resetFired } from "../lib/medReminders";
import { resetReadArticles } from "../lib/education";
import { resetSeenLessons } from "../lib/micro-lessons";
import { resetWeeklyAnswers, resetWeeklySkips } from "../lib/weeklyReflection";
import { wipeAppStorage } from "../lib/storageKeys";
import { InstallCard } from "../components/InstallPrompt";
import AppUpdateCard from "../components/AppUpdateCard";
import FontPicker from "../components/FontPicker";
import IconSetPicker from "../components/IconSetPicker";
import CompanionSettingsCard from "../components/CompanionSettingsCard";
import { GlyphIcon } from "../state/IconSetContext";
import AssessmentConsent from "../components/AssessmentConsent";
import WeatherApiCard from "../components/WeatherApiCard";
import FoodAiSettingsCard from "../components/FoodAiSettingsCard";
import HealthImportCard from "../components/HealthImportCard";
import AiSettingsCard from "../components/AiSettingsCard";
import CrisisCard from "../components/CrisisCard";
import { clearAssessments, importAssessments, listAssessments } from "../lib/assessmentStore";
import { DISCLAIMER } from "../lib/assessments";
import {
  Ban,
  ClipboardList,
  Download,
  Eye,
  LayoutGrid,
  LockIcon,
  MapPin,
  Mic,
  Image,
  MessageCircle,
  Palette,
  Radio,
  Save,
  Smile,
  // Aliased for the same reason `LockIcon` is: the `Settings` TYPE is in scope
  // in this file since Batch 13 (the collapsible summaries are written against
  // it), and a type and a component cannot share a name.
  Settings as SettingsIcon,
  Square,
  Trash,
  Type,
  Upload,
} from "../lib/icons";

/**
 * The three text sizes, in one place.
 *
 * They were an inline array inside the card body until Batch 13, when the card
 * became collapsible and its summary line had to say which size is chosen. Two
 * copies of these labels would be two things to keep in step, and the copy that
 * drifts is the one a COLLAPSED card shows — the one nobody looks at until they
 * open it and find a different word on the button than the summary promised.
 *
 * The values stay here because they are the STORED field's own three states; the
 * WORDS moved to the catalogue, because that is what a language owns. The
 * summary adds the noun and the button reads the same word, and both now come
 * from the one key, so they cannot drift apart in a translation either.
 */
const TEXT_SIZES = ["normal", "large", "xlarge"] as const satisfies readonly Settings["textSize"][];

/** The size's own word, in the catalogue rather than beside the value. */
function textSizeLabel(value: Settings["textSize"]): string {
  if (value === "normal") return t("settings.size.normal");
  if (value === "large") return t("settings.size.large");
  return t("settings.size.xlarge");
}

/**
 * Which typeface is chosen, in the words the picker uses.
 *
 * The handwriting face is named only when it is not the default, because it is
 * an OPT-IN: its control in `FontPicker` is a toggle with a default state, and a
 * summary that always carried it would tell a user who never touched it that
 * they had chosen something.
 *
 * The typeface names themselves belong to `lib/fonts` and are deliberately not
 * extracted yet — the summary is the one caller here, and that registry has
 * readers on the Today and Journal pages too.
 */
function fontSummary(settings: Settings): string {
  const main = fontDef(settings.fontFamily).label;
  const hand = handFontDef(settings.handFont);
  if (hand.id === HAND_FONTS[0]!.id) return main;
  return t("settings.font.summary", { main, hand: hand.label });
}

/**
 * The three languages, as the switcher offers them.
 *
 * The VALUES are the `Locale` codes the store keeps. The LABELS are autonyms —
 * `Magyar`, `English`, `Deutsch` — and they are the same three strings wherever
 * they appear on purpose: a reader looking for their own language has to be able
 * to recognise it, and `Német` beside `Deutsch` would be exactly the trade a
 * picker must not make. `LOCALE_LABEL` is total over `Locale`, so a fourth
 * language cannot be added to `SUPPORTED_LOCALES` and forgotten here — it would
 * be a compile error rather than a missing button.
 */
const LOCALE_LABEL: Readonly<Record<Locale, string>> = {
  hu: t("language.hu"),
  en: t("language.en"),
  de: t("language.de"),
};

/** The picker's buttons, in `SUPPORTED_LOCALES`' own order. */
const LOCALES: readonly { value: Locale; label: string }[] = SUPPORTED_LOCALES.map((code) => ({
  value: code,
  label: LOCALE_LABEL[code],
}));

/**
 * The chosen language's own name, in the sentence the collapsed card shows.
 *
 * `coerceLocale` rather than a bare `?? DEFAULT_LOCALE`: the load path deletes a
 * locale this build does not have, but a RESTORED BACKUP writes its settings
 * straight through the store, so for one session a `locale` can be a string no
 * catalogue answers to. `LOCALE_LABEL[that]` is `undefined`, and the summary
 * would read `undefined felület` over three unpressed buttons. The registry's
 * own guard turns it back into Hungarian, which is what the app would render
 * anyway.
 */
function languageSummary(settings: Settings): string {
  return t("settings.language.summary", {
    language: LOCALE_LABEL[coerceLocale(settings.locale)],
  });
}

/**
 * Which recognition engine is in play, in one clause.
 *
 * The sentence is a SEPARATE key from the note it follows rather than the tail
 * of it, for two reasons: the note is shared, and a catalogue value that exists
 * only to be glued onto another one carries its join — and its space — into the
 * data, where neither is visible. The caller joins, so the join is visible.
 */
function recognitionNote(): string {
  return isLlmAvailable() ? t("settings.voice.noteLlm") : t("settings.voice.noteOffline");
}

/**
 * The Settings tab's eight groups, in the order it draws them.
 *
 * `CrisisCard` is deliberately absent: it is pinned above the list, because a
 * path to help one tap away is not a help path (Phase 1).
 */
function SettingsGroup({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <section className="settings-group" role="group" aria-label={heading}>
      <p className="field-label">{heading}</p>
      {children}
    </section>
  );
}

export const SETTINGS_SECTION_IDS = [
  "personal",
  "appearance",
  "navigation",
  "tracking",
  "reminders",
  "security",
  "data",
  "misc",
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTION_IDS)[number];

/**
 * `inkMeetsAA` and `inkVeil` are the ink decision's own answer, threaded down
 * from the app root rather than re-measured: a second `useDynamicInk` here would
 * be a second canvas decode and a second chance to disagree with what the app
 * paints. The veil travels with the report because it is part of the same
 * decision — where no ink reads on both grounds at the reader's own number the
 * app paints a stronger veil, and a preview left on the reader's number would be
 * showing a surface the app does not paint.
 */
export default function SettingsView({
  inkMeetsAA,
  inkVeil,
}: {
  inkMeetsAA?: boolean | undefined;
  inkVeil?: number | undefined;
}) {
  const { data, setProfile, setSettings, notify } = useApp();
  const { setTheme } = useTheme();
  const [name, setName] = useState(data.profile.name);
  const [goal, setGoal] = useState(data.profile.goal);
  const [consentOpen, setConsentOpen] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);

  // The two counts the collapsed summaries state. Computed here rather than in
  // the JSX so the number in the summary and the number of rows in the body come
  // from one evaluation — a summary that said "3 / 7" above a body with four
  // switches on would be worse than no summary at all.
  const enabledTrackerGroups = trackerGroupHeads().filter((head) =>
    isTrackerGroupEnabled(data.settings.enabledTrackers, head),
  ).length;
  const enabledModuleCount = [
    data.settings.energyModule,
    data.settings.reflectionModule,
    data.settings.vitalsModule,
    data.settings.medsModule,
    data.settings.assessmentsEnabled ?? false,
  ].filter(Boolean).length;

  // Three of the summaries are a sentence plus an optional clause. They are
  // assembled here rather than inside a catalogue entry because the clause is
  // only sometimes true: a template that carried an empty `{clause}` would make
  // a translator arrange punctuation around a hole, and the " · " that joins the
  // two is punctuation, not a word anybody has to translate.
  const accessibilitySummary = [
    t("settings.accessibility.size", { size: textSizeLabel(data.settings.textSize) }),
    ...(data.settings.highContrast ? [t("settings.accessibility.contrastSummary")] : []),
  ].join(" · ");
  const navSummary = [
    data.settings.autoHideNav ? t("settings.nav.summaryAuto") : t("settings.nav.summaryFixed"),
    ...(data.settings.tabOrder === undefined ? [] : [t("settings.nav.summaryReordered")]),
  ].join(" · ");
  const moodSummary =
    (data.settings.moodFlow ?? "new") === "new"
      ? t("settings.mood.summaryNew")
      : t("settings.mood.summaryOld");

  /**
   * One language switch. Two writes, and both are needed.
   *
   * `setSettings` is what the reader has actually chosen — it is what survives
   * the reload below, and what the next session starts in. The RELOAD is the
   * other half: `dates.ts`'s weekday initials, `icon-policy.ts`'s 48 reasons,
   * `trackerDisplay`'s number formatter and this file's own `LOCALES` are
   * module constants built at import, so a re-render would translate the page
   * that is on screen and leave the calendar, the number format and the picker's
   * own labels in the old language. There is no way to rebuild a `const`, and a
   * "switch" that half-works is worse than one that says it reloads — which the
   * note under this control does, in all three languages.
   *
   * Re-picking the language already in force is a no-op, so the screen does not
   * blink for a tap that changed nothing.
   */
  function switchLanguage(next: Locale) {
    if (next === coerceLocale(data.settings.locale)) return;
    setSettings({ ...data.settings, locale: next });
    window.location.reload();
  }

  function saveProfile() {
    setProfile({ name: name.trim(), goal: goal.trim() });
    notify(t("settings.profile.saved"));
  }

  /**
   * The flag never flips directly. Turning it ON opens the consent screen and
   * writes nothing until it is confirmed; turning it OFF asks first, because
   * it deletes the log the consent screen promised would be deleted.
   */
  function onAssessmentsToggle(v: boolean) {
    if (v) setConsentOpen(true);
    else setConfirmDisable(true);
  }

  function confirmEnable() {
    setSettings({ ...data.settings, assessmentsEnabled: true });
    setConsentOpen(false);
  }

  function confirmDisableNow() {
    clearAssessments();
    setSettings({ ...data.settings, assessmentsEnabled: false });
    setConfirmDisable(false);
  }

  /**
   * Batch 11 — one swap in the tabs' order. The state lives in
   * `settings.tabOrder`, and the value written is `orderedTabs`' own
   * normalised output, so what is stored is always a clean permutation of
   * the four tabs — never something the nav would have to repair on read.
   * `move` is the direction; `i` the row's index in the CURRENT order.
   */
  function moveTab(i: number, move: -1 | 1) {
    const current = orderedTabs(data.settings.tabOrder);
    const j = i + move;
    if (j < 0 || j >= current.length) return;
    const next = [...current];
    [next[i], next[j]] = [next[j], next[i]];
    setSettings({ ...data.settings, tabOrder: orderedTabs(next) });
  }


  /*
   * The Settings tab's eight groups, as data.
   *
   * One level, deliberately: the READER moves groups, not the cards inside
   * them. The Phase 1 map this follows was a classification, not a sort, and a
   * second movable level would need a second stored dimension beside
   * `settings.sectionOrder` for no gain a reader would ask for.
   *
   * Every card keeps its own collapse; a group is a heading over cards that
   * happen to belong together, not a card that swallows them.
   *
   * `CrisisCard` is NOT one of these. It stays above the list, on the Phase 1
   * decision that a path to help one tap away is not a help path.
   */
  const sections: SectionSpec[] = [
    { id: "personal" as SettingsSectionId, label: t("settings.groups.personal"), render: () => (
      <SettingsGroup heading={t("settings.groups.personal")}>
          <CollapsibleCard
            id="settings-profile"
            title={t("settings.profile.title")}
            icon={<ContentIcon name="Smile" />}
            summary={name.trim() ? name.trim() : t("settings.profile.summary")}
          >
            <label className="field-label" htmlFor="profile-name">
              {t("settings.profile.nameLabel")}
            </label>
            <input
              id="profile-name"
              className="text-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("settings.profile.namePlaceholder")}
            />
            <label className="field-label" htmlFor="profile-goal">
              {t("settings.profile.goalLabel")}
            </label>
            <textarea
              id="profile-goal"
              className="text-area"
              rows={2}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder={t("settings.profile.goalPlaceholder")}
            />
            <button type="button" className="btn btn-primary" onClick={saveProfile}>
              <Save size="1.1em" /> {t("settings.profile.save")}
            </button>
          </CollapsibleCard>

      </SettingsGroup>
    ) },
    { id: "appearance" as SettingsSectionId, label: t("settings.groups.appearance"), render: () => (
      <SettingsGroup heading={t("settings.groups.appearance")}>
          {/*
            * The language leads this group rather than closing it, and the
            * reason is the reader this whole app is written for: somebody who
            * cannot read Hungarian needs to find this control before the four
            * cards below it, not after them. Everything else on this page is
            * unreadable to them until they do.
            */}
          <CollapsibleCard
            id="settings-language"
            title={t("settings.language.title")}
            icon={<MessageCircle />}
            summary={languageSummary(data.settings)}
          >
            <p className="muted-note">{t("settings.language.note")}</p>
            <Segmented
              ariaLabel={t("settings.language.group")}
              value={coerceLocale(data.settings.locale)}
              options={LOCALES}
              onChange={switchLanguage}
            />
          </CollapsibleCard>

          <CollapsibleCard
            id="settings-accessibility"
            title={t("settings.accessibility.title")}
            icon={<Eye />}
            summary={accessibilitySummary}
          >
            <p className="muted-note">{t("settings.accessibility.note")}</p>
            <Segmented
              ariaLabel={t("settings.accessibility.sizeGroup")}
              value={data.settings.textSize}
              options={TEXT_SIZES.map((opt) => {
                return { value: opt, label: textSizeLabel(opt) };
              })}
              onChange={(v) => setSettings({ ...data.settings, textSize: v })}
            />
            <Toggle
              label={t("settings.accessibility.contrastLabel")}
              hint={t("settings.accessibility.contrastHint")}
              checked={data.settings.highContrast}
              onChange={(v) => setSettings({ ...data.settings, highContrast: v })}
            />
          </CollapsibleCard>

          <CollapsibleCard
            id="settings-font"
            title={t("settings.font.title")}
            icon={<Type />}
            summary={fontSummary(data.settings)}
          >
            <FontPicker />
          </CollapsibleCard>

          <CollapsibleCard
            id="settings-iconset"
            title={t("settings.iconset.title")}
            icon={<ContentIcon name="Smile" />}
            summary={iconSetDef(data.settings.iconSet).label}
          >
            <IconSetPicker />
          </CollapsibleCard>

          <CompanionSettingsCard />

          <CollapsibleCard
            id="settings-theme"
            title={t("settings.theme.title")}
            icon={<Palette />}
            summary={themeMeta().find((t) => t.name === data.settings.theme)?.label ?? t("settings.theme.fallback")}
          >
            <p className="muted-note">{t("settings.theme.note")}</p>
            <div className="theme-grid" role="radiogroup" aria-label={t("settings.theme.group")}>
              {themeMeta().map((t) => {
                const active = data.settings.theme === t.name;
                return (
                  <button
                    key={t.name}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={`theme-swatch ${active ? "theme-swatch-active" : ""}`}
                    onClick={() => setTheme(t.name)}
                  >
                    <span className="theme-colors" aria-hidden="true">
                      <i style={{ background: t.swatch[0] }} />
                      <i style={{ background: t.swatch[1] }} />
                      <i style={{ background: t.swatch[2] }} />
                    </span>
                    <span className="theme-name">{t.label}</span>
                  </button>
                );
              })}
            </div>
          </CollapsibleCard>

          {/* A custom background IMAGE, deliberately NOT a seventh theme. The theme
              grid above still decides the ink; this decides the backdrop, and the
              scrim below is what keeps the two readable together. Its own card
              rather than a tile in that grid, because a picture and a dark theme are
              not alternatives and the reader can have both. */}
          <CollapsibleCard
            id="settings-background"
            title={t("settings.bg.title")}
            icon={<Image />}
            summary={data.settings.backgroundImage ? t("settings.bg.set") : t("settings.bg.unset")}
          >
            <BackgroundImagePicker
              imageId={data.settings.backgroundImage}
              scrim={data.settings.backgroundScrim}
              blur={data.settings.backgroundBlur}
              palette={data.settings.backgroundPalette}
              fit={data.settings.backgroundFit}
              cardTransparency={data.settings.backgroundCardTransparency}
              tint={data.settings.backgroundTint}
              highContrast={data.settings.highContrast}
              inkMeetsAA={inkMeetsAA}
              inkVeil={inkVeil}
              onImageChange={(id) => setSettings({ ...data.settings, backgroundImage: id })}
              onScrimChange={(alpha) => setSettings({ ...data.settings, backgroundScrim: alpha })}
              onBlurChange={(fraction) => setSettings({ ...data.settings, backgroundBlur: fraction })}
              onPaletteChange={(next) => setSettings({ ...data.settings, backgroundPalette: next })}
              onFitChange={(next) => setSettings({ ...data.settings, backgroundFit: next })}
              onCardTransparencyChange={(next) =>
                setSettings({ ...data.settings, backgroundCardTransparency: next })
              }
              onTintChange={(next) => setSettings({ ...data.settings, backgroundTint: next })}
            />
          </CollapsibleCard>

          <CustomThemeEditor />

      </SettingsGroup>
    ) },
    { id: "navigation" as SettingsSectionId, label: t("settings.groups.navigation"), render: () => (
      <SettingsGroup heading={t("settings.groups.navigation")}>
          <CollapsibleCard
            id="settings-navigation"
            title={t("settings.nav.title")}
            icon={<ContentIcon name="TrendingDown" />}
            summary={navSummary}
          >
            <p className="muted-note">{t("settings.nav.note")}</p>
            <Toggle
              label={t("settings.nav.hideLabel")}
              hint={t("settings.nav.hideHint")}
              checked={data.settings.autoHideNav}
              onChange={(v) => setSettings({ ...data.settings, autoHideNav: v })}
            />

            {/* Batch 11, commit 2 — the four tabs, in the order the bar draws
                them. Up/down moves one row one slot; the buttons are the whole
                interaction, with no drag-and-drop to discover or to fail. The
                reset returns the registry's default by REMOVING the setting, so
                "never rearranged" and "put it back" are the same stored state. */}
            <div
              className="tab-order"
              role="group"
              aria-label={t("settings.nav.tabOrderGroup")}
            >
              <span className="field-label">{t("settings.nav.tabOrderTitle")}</span>
              <p className="muted-note">{t("settings.nav.tabOrderNote")}</p>
              {orderedTabs(data.settings.tabOrder).map((tab, i, all) => {
                const def = NAV_ICONS.find((n) => n.tab === tab)!;
                return (
                  <div key={tab} className="tab-order-row">
                    <span className="tab-order-label">
                      {i + 1}. {def.label}
                    </span>
                    <span className="tab-order-controls">
                      <button
                        type="button"
                        className="btn btn-ghost"
                        aria-label={t("settings.nav.tabUp", { n: i + 1, name: def.label })}
                        disabled={i === 0}
                        onClick={() => moveTab(i, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        aria-label={t("settings.nav.tabDown", { n: i + 1, name: def.label })}
                        disabled={i === all.length - 1}
                        onClick={() => moveTab(i, 1)}
                      >
                        ↓
                      </button>
                    </span>
                  </div>
                );
              })}
              {data.settings.tabOrder !== undefined && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setSettings({ ...data.settings, tabOrder: undefined });
                    notify(t("settings.nav.resetNotify"));
                  }}
                >
                  {t("settings.nav.reset")}
                </button>
              )}
            </div>
          </CollapsibleCard>

      </SettingsGroup>
    ) },
    { id: "tracking" as SettingsSectionId, label: t("settings.groups.tracking"), render: () => (
      <SettingsGroup heading={t("settings.groups.tracking")}>
          <CollapsibleCard
            id="settings-trackers"
            title={t("settings.trackers.title")}
            icon={<ClipboardList />}
            summary={t("settings.trackers.summary", {
              on: enabledTrackerGroups,
              total: trackerGroupHeads().length,
            })}
          >
            <p className="muted-note">{t("settings.trackers.note")}</p>
            {trackerGroupHeads().map((head) => {
              const members = trackerGroupMembers(head.id);
              return (
                <Toggle
                  key={head.id}
                  label={
                    <>
                      <GlyphIcon glyph={head.icon} /> {head.label}
                    </>
                  }
                  hint={head.hint}
                  checked={isTrackerGroupEnabled(data.settings.enabledTrackers, head)}
                  onChange={(v) => {
                    const current = data.settings.enabledTrackers ?? DEFAULT_ENABLED_TRACKERS;
                    // Every member of the group moves together, so the card stays
                    // at seven rows instead of thirteen. Ids this batch does not
                    // know about are KEPT: a hand-edited blob carrying one is not
                    // this screen's to throw away.
                    const memberIds = members.map((m) => m.id);
                    const kept = current.filter((id) => !memberIds.includes(id));
                    const next = v ? [...kept, ...memberIds] : kept;
                    setSettings({ ...data.settings, enabledTrackers: next });
                  }}
                />
              );
            })}
          </CollapsibleCard>

          <CustomTrackerManager />
              {/* Its twin. Phase 1: a screen that creates a tracker and a screen
                  that creates an activity are one job, so they sit together —
                  and this one leaves the Ma toolbox, where it was the only
                  tool there you had to go to Settings to configure. */}
              <CustomActivityManager />

          <CollapsibleCard
            id="settings-modules"
            title={t("settings.modules.title")}
            icon={<LayoutGrid />}
            summary={t("settings.modules.summary", { on: enabledModuleCount })}
          >
            <p className="muted-note">{t("settings.modules.note")}</p>
            <Toggle
              label={t("settings.modules.energyLabel")}
              hint={t("settings.modules.energyHint")}
              checked={data.settings.energyModule}
              onChange={(v) => setSettings({ ...data.settings, energyModule: v })}
            />
            <Toggle
              label={t("settings.modules.reflectionLabel")}
              hint={t("settings.modules.reflectionHint")}
              checked={data.settings.reflectionModule}
              onChange={(v) => setSettings({ ...data.settings, reflectionModule: v })}
            />
            <Toggle
              label={t("settings.modules.vitalsLabel")}
              hint={t("settings.modules.vitalsHint")}
              checked={data.settings.vitalsModule}
              onChange={(v) => setSettings({ ...data.settings, vitalsModule: v })}
            />
            <Toggle
              label={t("settings.modules.medsLabel")}
              hint={t("settings.modules.medsHint")}
              checked={data.settings.medsModule}
              onChange={(v) => setSettings({ ...data.settings, medsModule: v })}
            />
            <Toggle
              label={t("settings.modules.assessLabel")}
              hint={t("settings.modules.assessHint")}
              checked={data.settings.assessmentsEnabled ?? false}
              onChange={onAssessmentsToggle}
            />
          </CollapsibleCard>

          <AllergySettingsCard />

          {data.settings.medsModule && <MedicationTimesCard />}

      </SettingsGroup>
    ) },
    { id: "reminders" as SettingsSectionId, label: t("settings.groups.reminders"), render: () => (
      <SettingsGroup heading={t("settings.groups.reminders")}>
          <ReminderCard />

      </SettingsGroup>
    ) },
    { id: "security" as SettingsSectionId, label: t("settings.groups.security"), render: () => (
      <SettingsGroup heading={t("settings.groups.security")}>
          <PinLockSettings />

      </SettingsGroup>
    ) },
    { id: "data" as SettingsSectionId, label: t("settings.groups.data"), render: () => (
      <SettingsGroup heading={t("settings.groups.data")}>
          <ConfirmDialog
            open={confirmDisable}
            title={t("settings.disable.title")}
            message={t("settings.disable.message")}
            confirmLabel={t("settings.disable.confirm")}
            cancelLabel={t("settings.disable.cancel")}
            onConfirm={confirmDisableNow}
            onCancel={() => setConfirmDisable(false)}
          />

          <BackupSettingsCard />

          {/* Phase 2 of fix/card-state-and-full-audit — this page's LAST
              session-local drawers become remembering cards. The reader's
              request is that EVERY tile keeps its last state across a reload,
              and `Collapsible` forgets by design (the toolbox drawers on
              Eszköztár rely on that, and stay as they were). The badge
              survives the move; the new summary is the collapsed tile's
              whole story. */}
          <CollapsibleCard
            id="settings-data"
            title={t("settings.data.title")}
            icon={<Save />}
            badge={t("settings.data.badge")}
            summary={t("settings.data.summary")}
          >
            <DataSection />
          </CollapsibleCard>
          <CollapsibleCard
            id="settings-privacy"
            title={t("settings.privacy.title")}
            icon={<LockIcon />}
            summary={t("settings.privacy.summary")}
          >
            <ul className="privacy-list">
              <li><MapPin size="1.1em" /> {t("settings.privacy.local")}</li>
              <li><Radio size="1.1em" /> {t("settings.privacy.noAccount")}</li>
              <li><Ban size="1.1em" /> {t("settings.privacy.noAds")}</li>
              <li><Upload size="1.1em" /> {t("settings.privacy.export")}</li>
            </ul>
          </CollapsibleCard>
      </SettingsGroup>
    ) },
    { id: "misc" as SettingsSectionId, label: t("settings.groups.misc"), render: () => (
      <SettingsGroup heading={t("settings.groups.misc")}>
          {/* Batch 8b — the weather API's consent lives here, not on the entry
              form: two toggles and a city field, with the GPS one rendered only
              after the module itself is on. */}
          <WeatherApiCard />

          {/* Batch 10 — the food AI's consent and BYOK key live here, in the
              same place the weather consent does: one card, warnings permanent,
              the feature invisible until the toggle says yes. */}
          <FoodAiSettingsCard />

          {/* Phase 4 — the general AI's three modes, beside the food AI's one
              toggle: same room, same shape, and `off` first. The key it takes
              is session-scoped in `lib/ai`, so this card can promise in copy
              what the storage layer actually does. */}
          <AiSettingsCard />

          {/* Batch 9 — the smartwatch import. Preview before apply, fill-only
              merge; the two new trackers are switched on from this card too. */}
          <HealthImportCard />

          {/* Batch A — the mood recorder switch. A radio pair, not a toggle,
              because both options are named states rather than on/off. Default
              is the new flow, and the default is stored as ABSENCE (see the
              settings field's note) so nobody is migrated into a choice. */}
          <CollapsibleCard
            id="settings-mood-flow"
            title={t("settings.mood.title")}
            icon={<Smile />}
            summary={moodSummary}
          >
            <p className="muted-note">{t("settings.mood.note")}</p>
            <div
              className="mood-flow-options"
              role="radiogroup"
              aria-label={t("settings.mood.group")}
            >
              <button
                type="button"
                role="radio"
                aria-checked={(data.settings.moodFlow ?? "new") === "new"}
                className={`mood-flow-option ${(data.settings.moodFlow ?? "new") === "new" ? "mood-flow-option-on" : ""}`}
                onClick={() => setSettings({ ...data.settings, moodFlow: "new" })}
              >
                <span className="mood-flow-name">{t("settings.mood.newName")}</span>
                <span className="mood-flow-desc">{t("settings.mood.newDesc")}</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={data.settings.moodFlow === "old"}
                className={`mood-flow-option ${data.settings.moodFlow === "old" ? "mood-flow-option-on" : ""}`}
                onClick={() => setSettings({ ...data.settings, moodFlow: "old" })}
              >
                <span className="mood-flow-name">{t("settings.mood.oldName")}</span>
                <span className="mood-flow-desc">{t("settings.mood.oldDesc")}</span>
              </button>
            </div>
          </CollapsibleCard>

          <AssessmentConsent
            open={consentOpen}
            onConfirm={confirmEnable}
            onCancel={() => setConsentOpen(false)}
          />

          <InstallCard />

          {/* The manual update, directly under the install card: both answer
              "which copy of this app am I using?", and this is the one lever a
              reader has when a deploy does not reach them. */}
          <AppUpdateCard />

          {/* Its twin — same conversion, same reason: the dictation panel
              remembers whether the reader left it open, instead of snapping
              shut on every visit. */}
          <CollapsibleCard
            id="settings-voice"
            title={t("settings.voice.title")}
            icon={<Mic />}
            badge={t("settings.voice.badge")}
            summary={t("settings.voice.summary")}
          >
            <p className="muted-note">
              {t("settings.voice.note")} {recognitionNote()}
            </p>
            <VoiceIntake />
          </CollapsibleCard>
      </SettingsGroup>
    ) },
  ];

  const [reordering, setReordering] = useState(false);
  const order = useSectionOrder("settings");

  return (
    <div className="view">
          <SectionTitle
            icon={<SettingsIcon />}
            title={t("settings.title")}
            hint={t("settings.hint")}
          />


          {/* Batch 13, commit 6 — mount point 1 of 4. First thing on the settings
              page, above even the profile card, because until commit 6 the crisis
              resources were only reachable by opting into the questionnaire first
              — which is backwards. A plain card and not a `CollapsibleCard`: a
              route to help behind a tap is not a route to help. */}
          <CrisisCard />

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

/* ---------------------------- VoiceIntake ---------------------------- */

function VoiceIntake() {
  const { today, saveEntry, notify } = useApp();
  const { data, setSettings } = useApp();
  const [listening, setListening] = useState(false);
  const [text, setText] = useState("");
  const [supported] = useState(
    typeof window !== "undefined" && "webkitSpeechRecognition" in window,
  );
  const recognitionRef = useRef<unknown>(null);

  function startListening() {
    const w = window as unknown as {
      webkitSpeechRecognition: new () => {
        lang: string;
        interimResults: boolean;
        onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
        onend: (() => void) | null;
        onerror: (() => void) | null;
        start: () => void;
        stop: () => void;
      };
    };
    const SpeechRecognitionImpl = w.webkitSpeechRecognition;
    const rec = new SpeechRecognitionImpl();
    // A BCP 47 tag handed to the browser's own recogniser, NOT copy: it selects
    // which grammar and vocabulary the engine transcribes with. It follows the
    // interface (`localeTag`) — a reader who switched to English is going to
    // dictate English, and a Hungarian grammar would transcribe it as nonsense —
    // but it is never a translation key.
    rec.lang = localeTag();
    rec.interimResults = false;
    rec.onresult = (e) => {
      const transcript = Array.from({ length: e.results.length }, (_, i) => e.results[i][0].transcript).join(" ");
      setText((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }

  function stopListening() {
    const rec = recognitionRef.current as { stop: () => void } | null;
    rec?.stop();
    setListening(false);
  }

  async function applyToEntry() {
    if (!text.trim()) {
      notify(t("settings.voice.emptyWarn"), "warn");
      return;
    }      const result = await parseVoiceMetrics(text);
      const existing = data.entries.find((e) => e.date === today);
      // Only the fields the dictation actually produced are sent; saveEntry
      // merges onto the existing day, so photos and tracker inputs survive.
      // Vitals is all-or-nothing (three required keys), so it is assembled once
      // from the existing values and only written when something changed.
      const baseVitals = existing?.vitals ?? { restingHr: null, hrv: null, sleepHours: null };
      const vitals =
        result.restingHr != null || result.sleepHours != null
          ? {
              restingHr: result.restingHr ?? baseVitals.restingHr,
              hrv: baseVitals.hrv,
              sleepHours: result.sleepHours ?? baseVitals.sleepHours,
            }
          : null;
      saveEntry({
        date: today,
        ...(result.mood != null
          ? { mood: result.mood as import("../types").MoodLevel }
          : {}),
        ...(result.stress != null ? { stress: result.stress } : {}),
        ...(result.energy != null ? { energy: result.energy } : {}),
        note: result.note || text,
        ...(result.activities.length > 0
          ? {
              activities: Array.from(
                new Set([...(existing?.activities ?? []), ...result.activities]),
              ),
            }
          : {}),
        ...(vitals ? { vitals } : {}),
        source: "voice",
      });
    notify(
      result.source === "llm"
        ? t("settings.voice.savedLlm")
        : t("settings.voice.savedOffline"),
    );
    setText("");
  }

  if (!supported) {
    return (
      <div className="toolbox-item">
        <p className="muted-note">{t("settings.voice.unsupported")}</p>
        <textarea
          className="text-area"
          rows={3}
          aria-label={t("settings.voice.textAreaLabel")}
          placeholder={t("settings.voice.placeholder")}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="button" className="btn btn-primary btn-block" onClick={applyToEntry}>
          {t("settings.voice.makeEntry")}
        </button>
      </div>
    );
  }

  return (
    <div className="toolbox-item">
      <div className="voice-controls">
        <button
          type="button"
          className={`btn btn-block ${listening ? "btn-danger" : "btn-primary"}`}
          onClick={listening ? stopListening : startListening}
        >
          {listening ? <><Square size="1.1em" /> {t("settings.voice.stop")}</> : <><Mic size="1.1em" /> {t("settings.voice.start")}</>}
        </button>
        {data.settings.vitalsModule && (
          <p className="muted-note">{t("settings.voice.vitalsNote")}</p>
        )}
      </div>
      <textarea
        className="text-area"
        rows={3}
        aria-label={t("settings.voice.resultLabel")}
        placeholder={t("settings.voice.resultPlaceholder")}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button type="button" className="btn btn-primary btn-block" onClick={applyToEntry}>
        {t("settings.voice.makeEntryFrom")}
      </button>
      <Toggle
        label={t("settings.voice.vitalsToggleLabel")}
        hint={t("settings.voice.vitalsToggleHint")}
        checked={data.settings.vitalsModule}
        onChange={(v) => setSettings({ ...data.settings, vitalsModule: v })}
      />
    </div>
  );
}

/* ----------------------------- DataSection --------------------------- */

function DataSection() {
  const { data, importEntries, resetAll, notify } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  function exportCsv() {
    downloadText("belso-iranytu-export.csv", entriesToCsv(data.entries), "text/csv;charset=utf-8");
    notify(t("settings.data.csvDone"));
  }

  function exportJson() {
    // The assessment log lives in its own key, so the export has to bring it
    // along explicitly — and carries the disclaimer inside the file, because
    // a file that can be opened months later on someone else's device should
    // still say what the numbers are not.
    const payload = {
      ...data,
      assessmentLog: {
        disclaimer: DISCLAIMER,
        items: listAssessments(),
      },
    };
    downloadText(
      "belso-iranytu-mentes.json",
      JSON.stringify(payload, null, 2),
      "application/json",
    );
    notify(t("settings.data.jsonDone"));
  }

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? "");
        if (file.name.endsWith(".json")) {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed.entries)) {
            importEntries(parsed.entries);
            // The export carries the self-assessment log; dropping it here
            // would lose data the user explicitly backed up.
            const restored = importAssessments(parsed.assessmentLog);
            notify(
              restored > 0
                ? t("settings.data.jsonRestoredWith", {
                    entries: parsed.entries.length,
                    assessments: restored,
                  })
                : t("settings.data.jsonRestored", { entries: parsed.entries.length }),
            );
          } else {
            notify(t("settings.data.jsonNoEntries"), "warn");
          }
          return;
        }
        const imported = csvToEntries(text);
        if (imported.length === 0) {
          notify(t("settings.data.importNone"), "warn");
          return;
        }
        importEntries(imported);
        notify(t("settings.data.imported", { count: imported.length }));
      } catch {
        notify(t("settings.data.importFailed"), "warn");
      }
    };
    reader.readAsText(file);
  }

  return (
    <>
      <div className="btn-grid">
        <button type="button" className="btn btn-soft" onClick={exportCsv}>
          <Upload size="1.1em" /> {t("settings.data.csvExport")}
        </button>
        <button type="button" className="btn btn-soft" onClick={exportJson}>
          <Save size="1.1em" /> {t("settings.data.jsonExport")}
        </button>
        <button type="button" className="btn btn-soft" onClick={() => fileRef.current?.click()}>
          <Download size="1.1em" /> {t("settings.data.fileImport")}
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.json,.txt"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
      <p className="muted-note">{t("settings.data.importNote")}</p>
      <button type="button" className="btn btn-danger btn-block" onClick={() => setConfirmReset(true)}>
        <Trash size="1.1em" /> {t("settings.data.deleteAll")}
      </button>
      <ConfirmDialog
        open={confirmReset}
        title={t("settings.data.resetTitle")}
        message={t("settings.data.resetMessage")}
        confirmLabel={t("settings.data.resetConfirm")}
        onConfirm={() => {
          // Batch 3: the PIN hash must go too, otherwise "delete everything"
          // would leave an unreachable PIN guarding an empty app.
          clearLock();
          resetFired();
          // Mega Batch: the education read markers belong to "delete everything" too.
          resetReadArticles();
          // Batch B: the seen-lesson sidecar is the same kind of record — which
          // lessons this device has been offered — so it goes with them.
          resetSeenLessons();
          // The audit's one entry with a second owner: the consent switch
          // clears the questionnaire log, and "delete everything" did not.
          clearAssessments();
          // Mega Batch commit 3: this week's prompt and every past answer are
          // the user's own words, so they go with everything else.
          resetWeeklySkips();
          resetWeeklyAnswers();
          // The background picture's BYTES live in their own key,
          // `belso-iranytu-background`, and `resetAll` does not touch it — so
          // without this line a reader who deletes everything would leave a photo
          // of their own wallpaper on the device. `resetAll` empties the
          // settings, which drops the reference; this drops the key. It takes no
          // id on purpose: the chain used to name the current one, which missed
          // a picture whose id had come back from an older export with no bytes
          // behind it.
          resetBackgroundImage();
          // Phase 5's state audit: this chain had grown one call per batch and
          // was missing every key the food, workout, diet, experiment and
          // badge modules own — including the two whose own docblocks already
          // claimed "delete everything" called them. The rule the audit left
          // behind is in `tests/lib/collapsible-audit.test.ts`: a module that
          // owns a stored record exports a reset, and the reset is called here.
          resetNutrition();
          resetCustomFoods();
          resetDiet();
          resetFitness();
          resetExperiments();
          resetSeenBadges();
          resetEventFeatures();
          // Collapse state is view state rather than data, which is why it is
          // out of the backup bundle (`lib/backup`) — but it is still a record
          // of what this device has shown the reader, so it goes with the rest.
          resetCardStates();
          resetAll();
          // The registry (`lib/storageKeys`) removes every key this app writes,
          // including the ones the chain above has no call for. It runs last
          // on purpose: `resetAll` writes an empty store blob, and this takes
          // that with it, so the wipe leaves no `belso-iranytu*` key behind at
          // all rather than an empty one.
          wipeAppStorage();
          setConfirmReset(false);
          notify(t("settings.data.resetDone"));
        }}
        onCancel={() => setConfirmReset(false)}
      />
    </>
  );
}
