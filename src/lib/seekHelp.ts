/**
 * "Mikor kérj segítséget?" — an interactive guide, not an instrument.
 *
 * WHAT THIS IS NOT
 * It is not a screening questionnaire, it does not score anything, and it never
 * names a condition. The three questions exist to organise what the reader
 * already knows about their own weeks into one of four next steps, and every
 * step is a suggestion about WHO to talk to rather than a statement about what
 * is wrong. `tests/lib/seek-help.test.ts` pins that wording rule, and the card
 * renders the same non-medical disclaimer the questionnaire result carries.
 *
 * WHY THE DECISION LIVES IN A LIB AND NOT IN THE COMPONENT
 * The tree is the part that could hurt somebody if it were wrong — a risk
 * answer that fails to reach the urgent branch is not a layout bug. Keeping the
 * rules pure makes every path testable without rendering, and keeps the copy
 * and the conditions in one file where they can be read together.
 *
 * THE ORDER OF THE RULES IS THE SAFETY PROPERTY
 * Risk first, unconditionally: nothing a reader says about duration or impact
 * may downgrade an answer about self-harm. Then duration and impact, and only
 * then the quiet default. A future edit that reorders these changes what the
 * app tells someone in danger, which is why the order is a test as well as a
 * paragraph.
 */

/** Answers are tri-state: `null` means the question has not been answered. */
export type SeekHelpAnswers = {
  duration: "days" | "weeks" | "months" | null;
  impact: "mild" | "moderate" | "severe" | null;
  risk: "no" | "yes" | null;
};

export const EMPTY_SEEK_HELP_ANSWERS: SeekHelpAnswers = {
  duration: null,
  impact: null,
  risk: null,
};

export type SeekHelpLevel = "monitor" | "talk" | "professional" | "urgent";

export type SeekHelpOption<T extends string> = { value: T; label: string };

export const DURATION_OPTIONS: readonly SeekHelpOption<NonNullable<SeekHelpAnswers["duration"]>>[] = [
  { value: "days", label: "Néhány napja" },
  { value: "weeks", label: "Egy-két hete" },
  { value: "months", label: "Több mint két hete" },
];

export const IMPACT_OPTIONS: readonly SeekHelpOption<NonNullable<SeekHelpAnswers["impact"]>>[] = [
  { value: "mild", label: "Alig zavar" },
  { value: "moderate", label: "Naponta érzem, de megy" },
  { value: "severe", label: "A mindennapokat is nehezíti" },
];

export const RISK_OPTIONS: readonly SeekHelpOption<NonNullable<SeekHelpAnswers["risk"]>>[] = [
  { value: "no", label: "Nincs" },
  { value: "yes", label: "Igen, van" },
];

export const SEEK_HELP_QUESTIONS = [
  {
    key: "duration" as const,
    question: "Mennyi ideje tart ez az állapot?",
    options: DURATION_OPTIONS,
  },
  {
    key: "impact" as const,
    question: "Mennyire hat a mindennapjaidra?",
    options: IMPACT_OPTIONS,
  },
  {
    key: "risk" as const,
    question: "Vannak most olyan gondolataid, hogy ártanál magadnak?",
    options: RISK_OPTIONS,
  },
] as const;

export type SeekHelpResult = {
  level: SeekHelpLevel;
  title: string;
  body: string;
  /** The next small step, phrased as an action rather than an instruction. */
  next: string;
};

/** Everything answered? The result is only shown once it is. */
export function seekHelpAnswered(answers: SeekHelpAnswers): boolean {
  return answers.duration !== null && answers.impact !== null && answers.risk !== null;
}

/**
 * The tree. Risk is checked before anything else and cannot be overridden.
 *
 * The thresholds are deliberately conservative in the direction of asking for
 * help: two weeks of something that already interferes with daily life is
 * enough to suggest a professional, and the app never argues somebody out of
 * seeking support.
 */
export function seekHelpResult(answers: SeekHelpAnswers): SeekHelpResult | null {
  if (!seekHelpAnswered(answers)) return null;

  if (answers.risk === "yes") {
    return {
      level: "urgent",
      title: "Kérj segítséget most.",
      body:
        "Amit leírtál, az olyan, amivel nem kell egyedül maradnod, és nem kell megvárnod a holnapot. Ez nem azt jelenti, hogy baj van veled — azt jelenti, hogy most ember kell melléd.",
      // No number is written here: the component renders the same
      // `CrisisStrip` the questionnaire result uses, so there is exactly one
      // copy of the list in the app and this sentence cannot go stale.
      next:
        "Hívd az alábbi számok egyikét — ingyenesek és éjjel-nappal elérhetők. Ha tudsz, szólj valakinek, aki közel van hozzád.",
    };
  }

  if (answers.duration === "months" || answers.impact === "severe") {
    return {
      level: "professional",
      title: "Érdemes szakemberhez fordulni.",
      body:
        "A válaszaid szerint ez hetek óta veled van, vagy a mindennapjaidat is nehezíti. Ilyenkor egy háziorvos, pszichológus vagy mentálhigiénés szakember tud segíteni — nem azért, mert „komolyabb” baj lenne, hanem mert egyedül lassabb.",
      next:
        "Egy háziorvosi időpont vagy egy első beszélgetés elég kezdésnek. A háziorvos tud továbbküldeni ahhoz, aki a legjobban tud segíteni.",
    };
  }

  if (answers.duration === "weeks" || answers.impact === "moderate") {
    return {
      level: "talk",
      title: "Beszélj valakivel, akiben megbízol.",
      body:
        "Nem kell szakemberhez fordulnod ahhoz, hogy ne legyen egyedül. Egy barát, egy családtag vagy egy kolléga, aki meghallgat, már változtat azon, hogy mennyire nehéz.",
      next:
        "Válassz egy embert, és mondd el neki egy mondatban, ami most a legnehezebb. Ha két hét múlva sem enyhül, nézd meg újra ezt az oldalt.",
    };
  }

  return {
    level: "monitor",
    title: "Egyelőre elég, ha figyelsz magadra.",
    body:
      "Amit leírtál, az néhány napja tart, és még nem nehezíti el a napjaidat. Ez nem azt jelenti, hogy nincs benne semmi — csak azt, hogy most nem kell nagy lépést tenned.",
    next:
      "Jegyezd fel pár napig, hogyan alakul. Ha két hét után sem enyhül, vagy rosszabb lesz, nézd meg újra ezt az oldalt.",
  };
}
