/**
 * Structured self-reflection programs — the toolbox's "Programok" card.
 *
 * WHY A PROGRAM AND NOT ANOTHER CARD
 * Every tool this app already has is a single sitting: breathe for four
 * minutes, write one gratitude line, answer one question. A reader who wants
 * to work on something for a month had no shape to hang it on — only the
 * vague advice to "keep journaling". A program is that shape: one theme a
 * week, one practice and one prompt per theme, six weeks long.
 *
 * THE RULE THAT MAKES IT SURVIVABLE
 * Nothing here has a deadline, a penalty or a lock. A week can be finished
 * today, next Tuesday, or three weeks from now; skipping a week does not
 * restart the program and does not hide the next theme. The only thing the
 * module refuses is finishing a week that is not the current one, because a
 * reader tapping "done" on week five while on week two would make the progress
 * line a lie about their own work.
 *
 * PROGRESS IS ITS OWN RECORD
 * `belso-iranytu-program` holds the reader's place and nothing else. It is not
 * part of the journal bundle: a program is a practice, not a diary entry, and
 * a corrupt progress blob must never be able to take an entry down. It is in
 * the wipe's key list and it has a reset, like every other record this app
 * writes.
 *
 * CONTENT LIVES HERE, CHROME LIVES IN THE COMPONENT
 * The weekly themes are Hungarian content, in the same sense as the ten
 * meditations in `lib/meditations.ts`: the words are the feature. The card
 * around them owns layout and state, and calls the functions below.
 */
import { todayISO } from "./dates";

export type ProgramTheme = "body" | "thoughts" | "emotions" | "relationships" | "boundaries" | "review";

export type ProgramWeek = {
  /** 1-based, and the number the stored progress names. */
  week: number;
  theme: ProgramTheme;
  title: string;
  /** Two sentences at most: why this week exists. */
  intro: string;
  /** The one thing to do this week, small enough to actually do. */
  practice: string;
  /** The question the week's journaling answers. */
  prompt: string;
  /** Which existing tool the practice leans on, for the card's shortcut. */
  tool: "breathing" | "meditation" | "journal" | "none";
  minutes: number;
};

export type Program = {
  id: string;
  title: string;
  subtitle: string;
  weeks: readonly ProgramWeek[];
  /** Shown once every week is done — a closing, not a certificate. */
  closing: string;
};

export const PROGRAM_STORAGE_KEY = "belso-iranytu-program";

/**
 * One program, six weeks. The order is the order of the work: the body first
 * because it is the easiest place to notice something, thoughts next because
 * they are what the body is reacting to, and relationships last because they
 * are the hardest to look at honestly and the easiest to avoid.
 */
export const PROGRAMS: readonly Program[] = [
  {
    id: "hat-het-magaddal",
    title: "Hat hét magaddal",
    subtitle: "Heti egy téma, egy gyakorlat és egy kérdés",
    closing:
      "Végigcsináltad. Nem kell, hogy bármi megváltozzon tőle — elég, hogy hat hétig figyeltél magadra. Ha szeretnéd, kezdheted újra; a második kör más lesz.",
    weeks: [
      {
        week: 1,
        theme: "body",
        title: "Test és lélegzet",
        intro:
          "A test hamarabb jelez, mint a gondolat. Ezen a héten nem értelmezni kell, csak észrevenni.",
        practice:
          "Naponta egyszer állj meg egy percre, és vedd észre, hol feszült a tested. Ne lazítsd el — csak nézd meg.",
        prompt: "Hol érezted ma a feszültséget a testedben, és mi történt éppen?",
        tool: "breathing",
        minutes: 3,
      },
      {
        week: 2,
        theme: "thoughts",
        title: "Gondolatok",
        intro:
          "A legtöbb nehéz érzés mögött egy mondat van, amit igaznak hiszünk. Ezen a héten ezt a mondatot keressük.",
        practice:
          "Ha rosszul érzed magad, írd le egy mondatban, mit mondott közben a fejed. Ne vitatkozz vele.",
        prompt: "Melyik gondolat tért vissza hozzád a legtöbbször ezen a héten?",
        tool: "journal",
        minutes: 5,
      },
      {
        week: 3,
        theme: "emotions",
        title: "Érzelmek",
        intro:
          "Az érzelem nem feladat, és nem is hiba. Ezen a héten nevezni gyakoroljuk, ítélet nélkül.",
        practice:
          "Naponta egyszer mondd ki magadban: „most ez van, és ez rendben van”. A név pontossága számít, a nagysága nem.",
        prompt: "Melyik érzés volt a legnehezebb kimondani ezen a héten?",
        tool: "meditation",
        minutes: 5,
      },
      {
        week: 4,
        theme: "relationships",
        title: "Kapcsolatok",
        intro:
          "A másokkal töltött idő ugyanúgy hat ránk, mint az alvás. Ezen a héten azt nézzük meg, ki után érzed magad könnyebbnek.",
        practice:
          "Jegyezd fel, kivel töltöttél időt, és utána hogyan érezted magad. Nem kell következtetést levonni.",
        prompt: "Ki az, aki után könnyebbnek érzed magad, és ki az, aki után fáradtabbnak?",
        tool: "journal",
        minutes: 5,
      },
      {
        week: 5,
        theme: "boundaries",
        title: "Határok",
        intro:
          "A határ nem elutasítás, hanem információ. Ezen a héten egyetlen apró nemet gyakorolunk.",
        practice:
          "Válassz egy kérést, amire most igent szoktál mondani, és mondj rá egy udvarias nemet. Figyeld meg, mi történik.",
        prompt: "Mitől féltél, amikor nemet mondtál — és mi történt valójában?",
        tool: "journal",
        minutes: 5,
      },
      {
        week: 6,
        theme: "review",
        title: "Visszatekintés",
        intro:
          "Az utolsó hét nem új téma, hanem összegzés. Nézd meg, mi maradt meg az öt hétből.",
        practice:
          "Olvasd vissza az elmúlt hetek bejegyzéseit. Jelölj meg egy dolgot, amit meg akarsz tartani.",
        prompt: "Mi az az egy dolog, amit ebből a hat hétből magaddal viszel?",
        tool: "journal",
        minutes: 15,
      },
    ],
  },
] as const;

export const PROGRAM_THEME_LABELS: Readonly<Record<ProgramTheme, string>> = {
  body: "Test",
  thoughts: "Gondolatok",
  emotions: "Érzelmek",
  relationships: "Kapcsolatok",
  boundaries: "Határok",
  review: "Visszatekintés",
};

export type ProgramState = {
  /** The program the reader is doing; null means none chosen. */
  programId: string | null;
  /** The day the program was started, ISO. Empty when not started. */
  startedOn: string;
  /** Completed week numbers, ascending. */
  completed: number[];
  /** The day the last week was finished, ISO. Empty when none has. */
  lastCompletedOn: string;
};

export const DEFAULT_PROGRAM_STATE: ProgramState = {
  programId: null,
  startedOn: "",
  completed: [],
  lastCompletedOn: "",
};

const listeners = new Set<(state: ProgramState) => void>();

export function getProgram(id: string): Program | undefined {
  return PROGRAMS.find((p) => p.id === id);
}

function isIsoDay(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value === "") return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/** Repair anything a hand-edited or half-written blob could hold. */
function normalise(raw: unknown): ProgramState {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PROGRAM_STATE };
  const value = raw as Partial<ProgramState>;
  const program = typeof value.programId === "string" ? getProgram(value.programId) : undefined;
  if (!program) return { ...DEFAULT_PROGRAM_STATE };
  const weeks = new Set(program.weeks.map((w) => w.week));
  const completed = Array.isArray(value.completed)
    ? [...new Set(value.completed)]
        .filter((n): n is number => typeof n === "number" && Number.isInteger(n) && weeks.has(n))
        .sort((a, b) => a - b)
    : [];
  // Progress is contiguous by construction: a stored gap (week 1 and 3, with 2
  // missing) would make "current week" ambiguous, so the tail is dropped rather
  // than rendered as a hole the reader cannot close.
  const contiguous: number[] = [];
  for (const n of completed) {
    if (n === contiguous.length + 1) contiguous.push(n);
    else break;
  }
  return {
    programId: program.id,
    startedOn: isIsoDay(value.startedOn) ? value.startedOn : "",
    completed: contiguous,
    lastCompletedOn: isIsoDay(value.lastCompletedOn) ? value.lastCompletedOn : "",
  };
}

function storage(): Storage | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const probe = "__belso_program_probe__";
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

export function loadProgramState(): ProgramState {
  const s = storage();
  if (!s) return { ...DEFAULT_PROGRAM_STATE };
  try {
    const raw = s.getItem(PROGRAM_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PROGRAM_STATE };
    return normalise(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_PROGRAM_STATE };
  }
}

function save(state: ProgramState): ProgramState {
  const clean = normalise(state);
  const s = storage();
  if (s) {
    try {
      s.setItem(PROGRAM_STORAGE_KEY, JSON.stringify(clean));
    } catch {
      // Storage unavailable: this session still sees the new state.
    }
  }
  for (const fn of listeners) fn(clean);
  return clean;
}

export function subscribePrograms(fn: (state: ProgramState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The program the reader is doing, or undefined when none is chosen. */
export function activeProgram(state: ProgramState): Program | undefined {
  return state.programId ? getProgram(state.programId) : undefined;
}

/**
 * The week the reader is on, 1-based; `weeks + 1` means finished.
 *
 * Derived from the completed list, never stored: a stored "current week" could
 * disagree with the list after a repair, and the list is the truth.
 */
export function currentWeekNumber(state: ProgramState, program: Program): number {
  return Math.min(state.completed.length + 1, program.weeks.length + 1);
}

export function currentWeek(state: ProgramState, program: Program): ProgramWeek | undefined {
  return program.weeks.find((w) => w.week === currentWeekNumber(state, program));
}

export function isProgramComplete(state: ProgramState, program: Program): boolean {
  return state.completed.length >= program.weeks.length;
}

/** Start (or restart) a program today. Completed weeks are kept until reset. */
export function startProgram(id: string, date: string = todayISO()): ProgramState {
  const program = getProgram(id);
  if (!program) return loadProgramState();
  const current = loadProgramState();
  // Restarting the same program twice is a no-op rather than a wipe: a reader
  // tapping the button again has not asked to lose their place.
  if (current.programId === id) return current;
  return save({ ...DEFAULT_PROGRAM_STATE, programId: id, startedOn: date });
}

/**
 * Finish the current week. Returns the NEW state; the caller decides whether
 * to award XP (the card does, once per completed week).
 *
 * Completing a program that is already finished, or one that is not started,
 * changes nothing — this is a button a reader can press twice.
 */
export function completeCurrentWeek(date: string = todayISO()): ProgramState {
  const current = loadProgramState();
  const program = activeProgram(current);
  if (!program || isProgramComplete(current, program)) return current;
  const week = currentWeekNumber(current, program);
  return save({
    ...current,
    completed: [...current.completed, week],
    lastCompletedOn: date,
  });
}

/** Wipe the record. Used by "Minden adat törlése" and the tests. */
export function resetPrograms(): void {
  try {
    storage()?.removeItem(PROGRAM_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  for (const fn of listeners) fn({ ...DEFAULT_PROGRAM_STATE });
}
