/**
 * The tools tab — everything the day does not need, minus the body's records.
 *
 * This was the Today tab's own collapsible until Batch 14 moved it to a tab of
 * its own: twelve cards inside one closed drawer made the Ma fül heavy, and the
 * reader's report was that the day's work and the toolbox kept stealing each
 * other's scroll. The content was the same cards, in the same order, moved
 * rather than redesigned.
 *
 * WHY THERE ARE FOUR DRAWERS AND NOT FIVE
 * The fifth was Egészség — vitals, medication, workouts, food, habits and the
 * check-ins. It was the wrong home and the reader said so: the body's records
 * are opened every morning, and three taps inside a browsing tab is not a home.
 * The sixth nav slot (the Egészség tab) took them, and its three sections mount
 * exactly the cards that used to sit here — see `src/views/HealthView.tsx`. A
 * Felfedezés health drawer left behind would be the same card in two places,
 * which is the second entry collapsible-audit's id inventory refuses outright.
 *
 * WHAT IS LEFT, AND WHY THE DRAWERS ARE THE SECTIONS
 * One closed drawer holding twelve cards was the Ma fül's problem, so the fix
 * cannot be that same drawer under a new name. Each section renders its own
 * `Collapsible` instead: the four heads are the four things a reader scrolls
 * past, one tap opens exactly the one they want, and the reorder panel moves
 * those heads rather than a single opaque box. It is also the only shape that
 * a reorder test can see — a closed `Collapsible` renders no children, so the
 * only stable marker a section has is its own head.
 *
 * The four group by what a reader is doing, not by which component they open:
 * Terápia (guided practices — breathing, meditation, CBT), Önismeret (writing
 * about yourself — the reflection form, the gratitude journal, the daily
 * question), Kísérletek (one change, tried on purpose) and Tanulás (the library
 * and the micro-lessons).
 *
 * A STORED ARRANGEMENT FROM BEFORE THE MOVE STILL OPENS
 * `sectionOrder.tools` may still name `health`. `orderSections` drops an id it
 * does not know rather than throwing, so an arrangement written when the health
 * drawer existed renders the four remaining drawers in their stored relative
 * order and silently loses the fifth — which is the right behaviour for a
 * section that no longer exists.
 *
 * The sections are the view's own (`useSectionOrder("tools")`), which is what
 * makes the bar's reorder logic apply to a tab's cards at all: the ids are
 * stable strings a stored arrangement can name, and a section that is renamed
 * stops matching the DOM instead of quietly becoming a second way to draw the
 * same card.
 */
import SectionList, {
  ReorderToggle,
  useSectionOrder,
  type SectionSpec,
} from "../components/SectionList";
import { useMemo, useState, type ReactNode } from "react";
import { useApp, useTodayEntry } from "../state/AppContext";
import { Collapsible, CollapsibleCard, SectionTitle } from "../components/ui/ui";
import type { AppData } from "../types";
import CbtForm from "../components/CbtForm";
import ExperimentCard from "../components/ExperimentCard";
import EducationLibraryCard from "../components/EducationLibraryCard";
import BreathingExercise from "../components/BreathingExercise";
import MeditationPicker from "../components/MeditationPicker";
import GratitudeJournal from "../components/GratitudeJournal";
import ContentIcon from "../components/ContentIcon";
import { Briefcase, MessageCircle } from "../lib/icons";
import { t } from "../lib/i18n";

/** The one settings gate the toolbox still honours on the Today tab. */
type ToolboxFlags = Pick<AppData["settings"], "reflectionModule">;

/** The sections the tab draws, in the order it draws them. */
export const TOOLS_SECTION_IDS = ["therapy", "self", "experiments", "education"] as const;

export type ToolsSectionId = (typeof TOOLS_SECTION_IDS)[number];

/**
 * The four category drawers. The ids are the arrangement's vocabulary: a
 * stored list that names one of these moves that drawer, and one that names
 * nothing known is dropped exactly as the bar drops an unknown tab.
 *
 * Each `render` is a drawer rather than a bare fragment BECAUSE the section is
 * the drawer — see the header. The health drawer is gone: its cards, including
 * the two transparency cards, live on the Egészség tab with the sentences they
 * are transparency about.
 *
 * Every drawer head names its icon as a literal `<ContentIcon name="…" />`
 * rather than through a variable, so the call-site audit can still see which
 * names are on screen; a name that is right today is right because something
 * checks it.
 */
export function defaultToolSections(
  flags: ToolboxFlags,
): SectionSpec<ToolsSectionId>[] {
  return [
    {
      id: "therapy",
      label: t("tools.therapy.title"),
      render: () => (
        // `tools-therapy` is the scroll anchor `?quick=breath` and
        // `?quick=meditate` land on — named here, next to the drawer it
        // identifies, so renaming either breaks the deep-link test rather
        // than silently scrolling readers to nothing.
        <ToolDrawer
          id="tools-therapy"
          icon={<ContentIcon name="Brain" />}
          title={t("tools.therapy.title")}
        >
          <BreathingExercise />
          <MeditationPicker />
          <CbtForm />
        </ToolDrawer>
      ),
    },
    {
      id: "self",
      label: t("tools.self.title"),
      render: () => (
        <ToolDrawer icon={<ContentIcon name="NotebookPen" />} title={t("tools.self.title")}>
          {flags.reflectionModule && <MiniReflection />}
          <GratitudeJournal />
          <DailyQuestionCard />
        </ToolDrawer>
      ),
    },
    {
      id: "experiments",
      label: t("tools.experiments.title"),
      render: () => (
        <ToolDrawer icon={<ContentIcon name="Compass" />} title={t("tools.experiments.title")}>
          <ExperimentCard />
        </ToolDrawer>
      ),
    },
    {
      id: "education",
      label: t("tools.learning.title"),
      render: () => (
        <ToolDrawer icon={<ContentIcon name="BookOpen" />} title={t("tools.learning.title")}>
          <EducationLibraryCard />
        </ToolDrawer>
      ),
    },
  ];
}

/**
 * One section's drawer: the head is the section, the body is its cards.
 *
 * Closed by default, like every other `Collapsible` in the app — "more options
 * is one tap away, never in the way" is the toolbox's own contract and moving
 * the toolbox did not change it.
 */
function ToolDrawer({
  id,
  icon,
  title,
  children,
}: {
  /** Scroll anchor id for a `?quick=` deep link; see the therapy section. */
  id?: string;
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <Collapsible id={id} title={title} icon={icon}>
      <div className="toolbox">{children}</div>
    </Collapsible>
  );
}

export default function ToolsView() {
  const { data } = useApp();
  const [reordering, setReordering] = useState(false);
  const order = useSectionOrder("tools");
  const flags = { reflectionModule: data.settings.reflectionModule };
  // Rebuilt on every render so a settings gate toggled elsewhere redraws the
  // same list the store holds; the sections are cheap, the state is not theirs.
  const sections = useMemo(() => defaultToolSections(flags), [flags.reflectionModule]);

  return (
    <div className="view">
      <SectionTitle
        // `Briefcase` is chrome, not content: no drawn set has a toolbox
        // picture, and the nav's own row is where its Fluent artwork lives.
        // Drawn directly, like the Settings tab's own header icon.
        icon={<Briefcase />}
        title={t("tools.title")}
        hint={t("tools.hint")}
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

/* ------------------------- MiniReflection ------------------------- */

function MiniReflection() {
  const { today, saveEntry, notify } = useApp();
  const existing = useTodayEntry();
  const [feeling, setFeeling] = useState(existing?.reflection.feeling ?? "");
  const [stressReason, setStressReason] = useState(existing?.reflection.stressReason ?? "");
  const [need, setNeed] = useState(existing?.reflection.need ?? "");
  const [done, setDone] = useState(false);

  function save() {
    // Only the reflection is passed: store.saveEntry merges onto the day's
    // existing entry, so mood/attachments/trackerValues are left untouched.
    saveEntry({ date: today, reflection: { feeling, stressReason, need } });
    setDone(true);
    notify(t("today.reflection.saved"));
    window.setTimeout(() => setDone(false), 2400);
  }

  // The collapsed line answers "is this worth opening?": a form with any
  // field filled says so; an untouched one says so too, never a blank.
  const filled = feeling.trim() !== "" || stressReason.trim() !== "" || need.trim() !== "";

  return (
    <CollapsibleCard
      id="tools-reflection"
      title={t("today.reflection.title")}
      icon={<ContentIcon name="NotebookPen" />}
      summary={filled ? t("today.reflection.summaryFilled") : t("today.reflection.summaryEmpty")}
    >
      <label className="field-label" htmlFor="ref-feeling">{t("today.reflection.feeling")}</label>
      <input
        id="ref-feeling"
        className="text-input"
        value={feeling}
        onChange={(e) => setFeeling(e.target.value)}
      />
      <label className="field-label" htmlFor="ref-reason">{t("today.reflection.stressReason")}</label>
      <input
        id="ref-reason"
        className="text-input"
        value={stressReason}
        onChange={(e) => setStressReason(e.target.value)}
      />
      <label className="field-label" htmlFor="ref-need">{t("today.reflection.need")}</label>
      <input
        id="ref-need"
        className="text-input"
        value={need}
        onChange={(e) => setNeed(e.target.value)}
      />
      <button type="button" className="btn btn-soft btn-block" onClick={save}>
        {done ? <>{t("today.savedBadge")}</> : <>{t("today.reflection.save")}</>}
      </button>
    </CollapsibleCard>
  );
}

/* ------------------------- DailyQuestionCard ---------------------- */

function DailyQuestionCard() {
  const { data, today, setDailyQuestion, notify } = useApp();
  // The rotation is positional: the day picks `QUESTIONS[today.length % 6]`, so
  // the ORDER is the behaviour and the keys are named after what each prompt
  // asks rather than after its position in the list.
  const QUESTIONS = useMemo(
    () => [
      t("today.question.bestMoment"),
      t("today.question.stress"),
      t("today.question.need"),
      t("today.question.learning"),
      t("today.question.energy"),
      t("today.question.gratitude"),
    ],
    [],
  );
  const q = data.dailyQuestion;
  const question = q && q.date === today ? q.question : QUESTIONS[today.length % QUESTIONS.length];
  const [answer, setAnswer] = useState(q && q.date === today ? q.answer : "");

  function save() {
    setDailyQuestion({ date: today, question, answer });
    notify(t("today.question.saved"));
  }

  // Answered means ANSWERED AND SAVED: a half-typed box that unmounts with
  // the drawer must not claim the question was dealt with.
  const answered = Boolean(q && q.date === today && answer.trim() !== "");

  return (
    <CollapsibleCard
      id="tools-question"
      title={t("today.question.title")}
      icon={<MessageCircle />}
      summary={answered ? t("today.question.summaryAnswered") : t("today.question.summaryOpen")}
    >
      <p className="question-text">{question}</p>
      <textarea
        className="text-area"
        rows={2}
        aria-label={t("today.question.answerLabel")}
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder={t("today.question.answerPlaceholder")}
      />
      <button type="button" className="btn btn-soft btn-block" onClick={save}>
        {t("today.question.save")}
      </button>
    </CollapsibleCard>
  );
}
