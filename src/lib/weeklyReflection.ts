/**
 * Mega Batch, commit 3 — the weekly reflection.
 *
 * One question a week. Not a streak, not a score, not a reminder to feel bad
 * on a Tuesday: a single prompt that comes back once every seven days, which
 * is often enough to notice a pattern and rare enough to still be worth
 * answering.
 *
 * WHY THE WEEK KEY IS BUILT ON `startOfWeek` RATHER THAN COMPUTED HERE
 * `dates.ts` already owns "which Monday is this", and it is already used by
 * the calendar. A second Monday calculation in a third file is a second thing
 * to forget, and the two would disagree at exactly one moment — the Sunday
 * night rollover — which is the moment a user is most likely to notice. So the
 * key DERIVES from `startOfWeek` and adds only the part `startOfWeek` does not
 * know: ISO's rule that a week belongs to the year of its Thursday.
 *
 * WHY THURSDAY, AND WHY IT MATTERS
 * ISO-8601 says week 1 is the week containing the first Thursday of the year.
 * That rule is what makes `2025-12-29` the start of `2026-W01` and `2021-01-01`
 * fall inside `2020-W53`. A calendar that just numbered weeks from Jan 1 would
 * put those dates somewhere else, and a prompt that changed identity on the
 * 31st of December is a prompt that repeats or skips.
 *
 * THE PROMPTS OBEY THE SAME TWO CONTENT RULES AS THE EDUCATION LIBRARY
 * `articleBlocklist.ts` and `tegezoRule.ts` own them, and this module is
 * deliberately NOT imported by them — it does not need to be, to be held to
 * them. The tests sweep every question through both modules. There is no
 * exception list here on purpose: the crisis article already exists, and this
 * card must never become the place a reader is pointed at a helpline they did
 * not ask for.
 */
import { addDays, startOfWeek } from "./dates";

export interface WeeklyPrompt {
  readonly id: string;
  readonly theme: string;
  readonly question: string;
  readonly hint?: string;
}

/* ------------------------------------------------------------------ prompts */

export const PROMPTS: readonly WeeklyPrompt[] = [
  // Önismeret (5)
  {
    id: "wp-onismeret-1",
    theme: "Önismeret",
    question: "Miben vagy ma másképp, mint egy hete?",
    hint: "Egy apró különbség is számít.",
  },
  {
    id: "wp-onismeret-2",
    theme: "Önismeret",
    question: "Mi foglalkozott veled legtöbbet idén?",
  },
  {
    id: "wp-onismeret-3",
    theme: "Önismeret",
    question: "Melyik gondolatod tér vissza mostanában?",
    hint: "Nem kell megoldani, csak észrevenni.",
  },
  {
    id: "wp-onismeret-4",
    theme: "Önismeret",
    question: "Mit csináltál jól ma, akkor is, ha senki nem szólta?",
  },
  {
    id: "wp-onismeret-5",
    theme: "Önismeret",
    question: "Hol érzed magad ma a legkényelmesebben?",
  },

  // Kapcsolatok (4)
  {
    id: "wp-kapcsolatok-1",
    theme: "Kapcsolatok",
    question: "Kivel beszéltél ma a legtöbbet?",
  },
  {
    id: "wp-kapcsolatok-2",
    theme: "Kapcsolatok",
    question: "Ki volt ma veled kedves?",
    hint: "Illessz be egy pillanatot, amit nem írtál le.",
  },
  {
    id: "wp-kapcsolatok-3",
    theme: "Kapcsolatok",
    question: "Van valaki, akinek mondanál valamit, de nem mondtad el?",
  },
  {
    id: "wp-kapcsolatok-4",
    theme: "Kapcsolatok",
    question: "Mit adott neked ma egy ember?",
  },

  // Munka (4)
  {
    id: "wp-munka-1",
    theme: "Munka",
    question: "Mi ment könnyen a munkában ma?",
  },
  {
    id: "wp-munka-2",
    theme: "Munka",
    question: "Mi volt ma a legnehezebb feladat?",
  },
  {
    id: "wp-munka-3",
    theme: "Munka",
    question: "El tudod-e hagyni a munkát, amikor vége van?",
  },
  {
    id: "wp-munka-4",
    theme: "Munka",
    question: "Mit tanultál ma valamitől, amitől más?",
  },

  // Test (5)
  {
    id: "wp-test-1",
    theme: "Test",
    question: "Hogyan érezted ma a tested?",
  },
  {
    id: "wp-test-2",
    theme: "Test",
    question: "Milyen mozgás esett jól ma?",
  },
  {
    id: "wp-test-3",
    theme: "Test",
    question: "Hol feszül a tested most?",
  },
  {
    id: "wp-test-4",
    theme: "Test",
    question: "Keveset vagy sokat aludtál?",
  },
  {
    id: "wp-test-5",
    theme: "Test",
    question: "Mi segített ma a testnek?",
  },

  // Érzelmek (4)
  {
    id: "wp-erzelmek-1",
    theme: "Érzelmek",
    question: "Melyik érzés volt ma a legerősebb?",
  },
  {
    id: "wp-erzelmek-2",
    theme: "Érzelmek",
    question: "Könnyű volt kifejezni, amit érzettél?",
  },
  {
    id: "wp-erzelmek-3",
    theme: "Érzelmek",
    question: "Van érzés, amit nem neveztél meg?",
  },
  {
    id: "wp-erzelmek-4",
    theme: "Érzelmek",
    question: "Mikor volt ma egy kis öröm?",
  },

  // Célok (4)
  {
    id: "wp-celok-1",
    theme: "Célok",
    question: "Mi a legfontosabb dolog, amit ma meg akartál tenni?",
  },
  {
    id: "wp-celok-2",
    theme: "Célok",
    question: "Mennyiben vagy közelebb a célodhoz?",
  },
  {
    id: "wp-celok-3",
    theme: "Célok",
    question: "Mit engedtél el ma?",
    hint: "Az elengedés is döntés.",
  },
  {
    id: "wp-celok-4",
    theme: "Célok",
    question: "Mit érdemes legközelebb eldöntened?",
  },

  // Hála (4)
  {
    id: "wp-hala-1",
    theme: "Hála",
    question: "Miért vagy hálás ma?",
  },
  {
    id: "wp-hala-2",
    theme: "Hála",
    question: "Kiért vagy hálás ma?",
  },
  {
    id: "wp-hala-3",
    theme: "Hála",
    question: "Milyen apró dolog nehezített meg ma valamit?",
    hint: "Az is számít, ha nem volt kellemetlen.",
  },
  {
    id: "wp-hala-4",
    theme: "Hála",
    question: "Mit tartasz meg szívesen a napodból?",
  },

  // Kihívások (5)
  {
    id: "wp-kihivasok-1",
    theme: "Kihívások",
    question: "Mi volt ma a legnehezebb?",
  },
  {
    id: "wp-kihivasok-2",
    theme: "Kihívások",
    question: "Hogyan birkóztál meg vele?",
  },
  {
    id: "wp-kihivasok-3",
    theme: "Kihívások",
    question: "Mi segített, amikor nehéz volt?",
  },
  {
    id: "wp-kihivasok-4",
    theme: "Kihívások",
    question: "Van, ami még mindig nyomaszt?",
    hint: "Írhatsz róla úgy is, hogy nem akarsz megoldást.",
  },
  {
    id: "wp-kihivasok-5",
    theme: "Kihívások",
    question: "Mit tennél másképp, ha újra kellene?",
  },

  // Öröm (4)
  {
    id: "wp-orom-1",
    theme: "Öröm",
    question: "Mi volt a nap legszebb pillanata?",
  },
  {
    id: "wp-orom-2",
    theme: "Öröm",
    question: "Miért nevettél ma?",
  },
  {
    id: "wp-orom-3",
    theme: "Öröm",
    question: "Mit értékesítettél ma meg?",
  },
  {
    id: "wp-orom-4",
    theme: "Öröm",
    question: "Mire vagy ma büszke?",
  },

  // Pihenés (4)
  {
    id: "wp-pihenes-1",
    theme: "Pihenés",
    question: "Pihentél ma igazán?",
    hint: "A képernyő előtt eltöltött idő nem feltétlenül pihenés.",
  },
  {
    id: "wp-pihenes-2",
    theme: "Pihenés",
    question: "Mi segített feltölteni az akkudat?",
  },
  {
    id: "wp-pihenes-3",
    theme: "Pihenés",
    question: "Mit hagytál ma szándékosan kihagyni?",
  },
  {
    id: "wp-pihenes-4",
    theme: "Pihenés",
    question: "Mikor érezted, hogy elég a nap?",
  },

  // Növekedés (5)
  {
    id: "wp-novekedes-1",
    theme: "Növekedés",
    question: "Mit tanultál ma magadról?",
  },
  {
    id: "wp-novekedes-2",
    theme: "Növekedés",
    question: "Miben vagy egy hete jobb?",
  },
  {
    id: "wp-novekedes-3",
    theme: "Növekedés",
    question: "Mi az, amit ma már könnyebbnek értesz?",
  },
  {
    id: "wp-novekedes-4",
    theme: "Növekedés",
    question: "Melyik szokásod működik most?",
  },
  {
    id: "wp-novekedes-5",
    theme: "Növekedés",
    question: "Mit kezdtél el mostanában?",
  },

  // Jövő (4)
  {
    id: "wp-jovo-1",
    theme: "Jövő",
    question: "Mire vársz legközelebb?",
  },
  {
    id: "wp-jovo-2",
    theme: "Jövő",
    question: "Mi nyugtalanít most a jövőből?",
  },
  {
    id: "wp-jovo-3",
    theme: "Jövő",
    question: "Mit szeretnél másként egy év múlva?",
  },
  {
    id: "wp-jovo-4",
    theme: "Jövő",
    question: "Mi az egy dolog, amiben most biztos vagy?",
  },
];

/* --------------------------------------------------------------- week maths */

/** Days since 1 Jan of the same year, computed in UTC. */
function dayOfYear(iso: string): number {
  const year = Number(iso.slice(0, 4));
  const at = new Date(Date.UTC(year, Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))));
  const jan1 = new Date(Date.UTC(year, 0, 1));
  return Math.round((at.getTime() - jan1.getTime()) / 86_400_000) + 1;
}

/**
 * The ISO-8601 week key for a date, `YYYY-Www`.
 *
 * Built on `startOfWeek` (which already owns Monday) and adding only ISO's
 * own rule: a week belongs to the year of its THURSDAY. UTC is used for the
 * day-of-year count so a DST change inside the week cannot shift it.
 */
export function weekKeyOf(iso: string): string {
  const thursday = addDays(startOfWeek(iso), 3);
  const year = Number(thursday.slice(0, 4));
  const week = Math.floor((dayOfYear(thursday) - 1) / 7) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** Anything unparseable falls back to week 1, so a prompt is ALWAYS returned. */
function weekNumberOf(key: string): number {
  const match = /^(\d{4})-W(\d{1,2})$/.exec(key);
  if (!match) return 1;
  const week = Number(match[2]);
  return week >= 1 && week <= 53 ? week : 1;
}

/**
 * The prompt for an ISO week key.
 *
 * By WEEK NUMBER, not by a hash of the key: a hash would look equally stable
 * and would need no explanation, which is exactly why it is the wrong choice —
 * "this week has this question" is something a reader can be told and check,
 * and `PROMPTS[(week - 1) % 52]` can be checked. It advances one prompt per
 * week and cycles through all 52 across a year.
 *
 * The double modulo guards a negative remainder: `(0 - 1) % 52` is `-1` in
 * JavaScript, and `PROMPTS[-1]` is `undefined`. That is the one line between
 * this function and a card that renders nothing.
 */
export function promptForWeekKey(key: string): WeeklyPrompt {
  const index = (((weekNumberOf(key) - 1) % PROMPTS.length) + PROMPTS.length) % PROMPTS.length;
  return PROMPTS[index]!;
}

/* ------------------------------------------------------------ note mirroring */

/** The marker that makes a reflected block findable again inside a day's note. */
export const REFLECTION_MARKER = "Heti reflektálás";

/**
 * Append a reflection to a day's note WITHOUT touching the user's own words.
 *
 * `store.ts`'s `mergeEntry` overwrites any field the patch supplies, so
 * `saveEntry({ date, note: answer })` would destroy a note the user had already
 * written that day — silently, and with no test failing. The answer's real home
 * is the sidecar below; this mirror is a convenience, so it must never be the
 * thing that loses data.
 *
 * A previous block is STRIPPED before the new one is appended, so answering
 * again in the same week replaces the block instead of stacking a second one
 * under the same marker.
 */
export function buildNoteWithReflection(
  existingNote: string,
  question: string,
  answer: string,
): string {
  const base = existingNote.split(REFLECTION_MARKER)[0]!.trimEnd();
  const block = `${REFLECTION_MARKER} — ${question}\n${answer}`;
  return base ? `${base}\n\n${block}` : block;
}

/* ----------------------------------------------------------------- skip store */

const SKIP_KEY = "belso-iranytu-weekly-skip";

/** The week keys the reader chose to skip. Corrupt shape → empty, junk dropped. */
export function loadSkippedWeeks(): string[] {
  try {
    const raw = localStorage.getItem(SKIP_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return [];
    const keys = (parsed as { weekKeys?: unknown }).weekKeys;
    if (!Array.isArray(keys)) return [];
    return keys.filter((k): k is string => typeof k === "string");
  } catch {
    return [];
  }
}

export function isWeekSkipped(key: string): boolean {
  return loadSkippedWeeks().includes(key);
}

/** Skip this week (deduplicated). Persisted: a skipped week stays skipped. */
export function markWeekSkipped(key: string): void {
  if (!key) return;
  const merged = [...new Set([...loadSkippedWeeks(), key])];
  try {
    localStorage.setItem(SKIP_KEY, JSON.stringify({ weekKeys: merged }));
  } catch {
    // storage unavailable — the worst case is the prompt reappearing
  }
}

/** Clear the skipped weeks; called from the settings' "delete everything" flow. */
export function resetWeeklySkips(): void {
  try {
    localStorage.removeItem(SKIP_KEY);
  } catch {
    /* noop */
  }
}

/* --------------------------------------------------------------- answer store */

const ANSWER_KEY = "belso-iranytu-weekly-answers";

/** Every saved answer, as `weekKey → text`. Corrupt shape → empty. */
export function loadWeeklyAnswers(): Record<string, string> {
  try {
    const raw = localStorage.getItem(ANSWER_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const answers = (parsed as { answers?: unknown }).answers;
    if (!answers || typeof answers !== "object" || Array.isArray(answers)) return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(answers as Record<string, unknown>)) {
      if (typeof value === "string") out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

export function getWeeklyAnswer(key: string): string | null {
  return loadWeeklyAnswers()[key] ?? null;
}

/** Save this week's answer, overwriting this week's previous one. */
export function saveWeeklyAnswer(key: string, text: string): void {
  if (!key) return;
  const merged = { ...loadWeeklyAnswers(), [key]: text };
  try {
    localStorage.setItem(ANSWER_KEY, JSON.stringify({ answers: merged }));
  } catch {
    // storage unavailable — the answer simply is not kept
  }
}

/** Clear the answers; called from the settings' "delete everything" flow. */
export function resetWeeklyAnswers(): void {
  try {
    localStorage.removeItem(ANSWER_KEY);
  } catch {
    /* noop */
  }
}