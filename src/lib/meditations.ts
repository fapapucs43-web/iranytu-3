/**
 * The guided-practice library: ten short, text-only sessions.
 *
 * WHY TEXT AND NOT AUDIO
 * An offline, data-private journal that grew a media player would have to
 * answer three questions it currently cannot: where the bytes live, what they
 * cost the reader to download, and what happens to a session when the file is
 * not there. A step list with a clock answers the same need in a few hundred
 * bytes, and it is readable at any font size — which is the one thing audio
 * cannot do.
 *
 * WHY THE TIMING LIVES HERE AND NOT IN A COMPONENT
 * Every number a reader is shown comes from this file. A duration that drifted
 * between a component and its data would not throw; it would simply promise
 * three minutes and take five, which is the kind of small lie that makes a
 * practice feel broken the first time somebody relies on it.
 *
 * WHY `minutes` IS AN INVARIANT AND NOT A LABEL
 * It is redundant with the steps on purpose. `meditationSeconds` derives the
 * real length from the steps, and the test asserts the two agree for all ten
 * records, so a table edited without its duration fails loudly instead of
 * quietly disagreeing with itself.
 *
 * The wording obeys the same non-clinical rule as the education library — the
 * one owner is `lib/articleBlocklist.ts`, and `tests/lib/meditations.test.ts`
 * runs its sweep over this file, comments included.
 */
import { cycleLength, type BreathPattern, type EngineState } from "./breathing";

/** One instruction the reader follows for a fixed number of seconds. */
export type MeditationStep = {
  label: string;
  seconds: number;
};

/** One complete practice. */
export type Meditation = {
  id: string;
  title: string;
  /** Whole minutes. Must equal the summed length of `steps` — see the header. */
  minutes: number;
  intro: string;
  steps: MeditationStep[];
};

/** Shortest and longest session the library offers, in minutes. */
export const MEDITATION_MIN = 3;
export const MEDITATION_MAX = 5;

/** The shortest a single step may be. A one-second step is a flicker, not a practice. */
export const MEDITATION_STEP_MIN = 5;

export const MEDITATIONS: Meditation[] = [
  {
    id: "testscan",
    title: "Testresz-vizsgálat",
    minutes: 3,
    intro: "Körbejárjuk a tested, részletek nélkül. Nem kell semmit megváltoztatnod.",
    steps: [
      { label: "Ülj kényelmesen, és engedd le a vállaid", seconds: 30 },
      { label: "Légzés figyelése, módosítás nélkül", seconds: 40 },
      { label: "Arc, állkapocs, nyak végigjárása", seconds: 40 },
      { label: "Vállak, karok, kezek érzete", seconds: 35 },
      { label: "Lábak, talaj, testsúly", seconds: 35 },
    ],
  },
  {
    id: "breath",
    title: "Lélegzés-tudatosság",
    minutes: 3,
    intro: "A lélegzésedhez tartozó figyelem. Nem kell lassítanod vagy szabályosítanod.",
    steps: [
      { label: "Ülj egyenesen, a nyelv a szájpadon", seconds: 25 },
      { label: "A légzés szokásos ritmusának figyelése", seconds: 50 },
      { label: "Egy belégzés észrevétele a végén", seconds: 35 },
      { label: "Egy kilégzés észrevétele a végén", seconds: 35 },
      { label: "Visszatérés a szokásos ritmushoz", seconds: 35 },
    ],
  },
  {
    id: "kindness",
    title: "Jószívűség",
    minutes: 4,
    intro: "Rövid jókívűség gondolatok, magadnak és két másiknak. Kihagyhatod, ami nem esik jól.",
    steps: [
      { label: "Kéz a szívre, és egy szándék kiválasztása", seconds: 30 },
      { label: "Magadnak szóló jókívűség", seconds: 45 },
      { label: "Egy közeli embernek szóló jókívűség", seconds: 45 },
      { label: "Egy távoli vagy nehéz embernek szóló jókívűség", seconds: 45 },
      { label: "A nehézség felismerése, ha jön", seconds: 40 },
      { label: "Visszatérés a szokásos légzéshez", seconds: 35 },
    ],
  },
  {
    id: "bodyscan",
    title: "Testscan",
    minutes: 5,
    intro: "A test hosszú, szakaszonkénti végigjárása. Ha valami fáj, ugorj át rajta.",
    steps: [
      { label: "Fej és arc", seconds: 50 },
      { label: "Nyak és vállak", seconds: 50 },
      { label: "Karok és kezek", seconds: 50 },
      { label: "Has és derék", seconds: 50 },
      { label: "Csípő és combok", seconds: 50 },
      { label: "Lábak és talaj", seconds: 50 },
    ],
  },
  {
    id: "grounding",
    title: "Talajhoz kötöttség",
    minutes: 3,
    intro: "A környezetedhez való visszakapcsolódás érzékszervekenként. Egy-két perc is elég belőle.",
    steps: [
      { label: "Talaj érzete a test alatt", seconds: 40 },
      { label: "A lábszárak és a pad kapcsolata", seconds: 35 },
      { label: "Körülnézés: öt dolog, amit látsz", seconds: 40 },
      { label: "Négy dolog, amit érinted", seconds: 35 },
      { label: "Három dolog, amit hallsz", seconds: 30 },
    ],
  },
  {
    id: "sleep",
    title: "Alvás előkészítése",
    minutes: 4,
    intro: "Ágy előtti gyakorlat. A célja nem az, hogy elaludj, hanem hogy átenged az álomnak.",
    steps: [
      { label: "Elengedés a napról", seconds: 40 },
      { label: "Légzés lassítása", seconds: 50 },
      { label: "A test súlyának érzete az ágyban", seconds: 50 },
      { label: "A gondolatok megfigyelése, megfogás nélkül", seconds: 60 },
      { label: "Az álom előhírnökei", seconds: 40 },
    ],
  },
  {
    id: "focus",
    title: "Fókusz-indítás",
    minutes: 3,
    intro: "Rövid belépés egyetlen szándokba. Munka előtt vagy tanulás után hasznos.",
    steps: [
      { label: "Egyetlen szándék megfogalmazása", seconds: 35 },
      { label: "Három lassú lélegzés", seconds: 45 },
      { label: "A figyelem felfelé állítása", seconds: 50 },
      { label: "A hangok szűrése, egyenként", seconds: 50 },
    ],
  },
  {
    id: "gratitude",
    title: "Hála",
    minutes: 3,
    intro: "Három dolog, ami ma jó volt, és egy ok, miért számít ma éppen ez.",
    steps: [
      { label: "Három dolog, ami ma kellemes volt", seconds: 50 },
      { label: "Egy ember, akinek megköszönted", seconds: 45 },
      { label: "Egy saját tulajdonságod", seconds: 45 },
      { label: "Miért számít ez ma", seconds: 40 },
    ],
  },
  {
    id: "letting-go",
    title: "Engedés",
    minutes: 4,
    intro: "Egy gondolat, ami ma beragadt. Nem kell megoldani — csak nem tartani.",
    steps: [
      { label: "Egy gondolat, ami ma beragadt", seconds: 40 },
      { label: "Láthatóság, nem javítás", seconds: 60 },
      { label: "A szorítás felismerése", seconds: 50 },
      { label: "A test válasza, amikor elengeded", seconds: 50 },
      { label: "Elengedés, újra és újra", seconds: 40 },
    ],
  },
  {
    id: "morning",
    title: "Reggeli kezdés",
    minutes: 3,
    intro: "A nap első öt perceje. Két szándék, és egy első lépés, amit nem kell megkezdened.",
    steps: [
      { label: "Ülő helyzet, két láb a talajon", seconds: 25 },
      { label: "Három szándék a napra", seconds: 45 },
      { label: "Mit szeretnél magaddal vinni", seconds: 45 },
      { label: "Mit hagynál ma hátra", seconds: 40 },
      { label: "Az első lépés megfogalmazása", seconds: 25 },
    ],
  },
];

/**
 * The library seen as a breathing pattern.
 *
 * This is the seam that lets a practice reuse the existing phase engine
 * instead of growing a second one. A step is a phase with a label and a
 * duration, which is exactly what a phase already is.
 */
export function meditationPattern(m: Meditation): BreathPattern {
  return { id: m.id, label: m.title, hint: m.intro, phases: m.steps };
}

/** Real length of one practice in seconds, derived from the steps. */
export function meditationSeconds(m: Meditation): number {
  return cycleLength(meditationPattern(m));
}

/**
 * Seconds consumed so far, for the progress bar.
 *
 * The engine counts cycles and a position inside one, so a reader's progress
 * is a sum of the same three things rather than a second counter the component
 * has to maintain. One source of elapsed time means the bar cannot disagree
 * with the clock beside it.
 */
export function elapsedSeconds(pattern: BreathPattern, state: EngineState): number {
  const total = cycleLength(pattern);
  let before = 0;
  for (let i = 0; i < state.phaseIndex; i += 1) {
    before += pattern.phases[i]?.seconds ?? 0;
  }
  const here = pattern.phases[state.phaseIndex]?.seconds ?? 0;
  return state.cycles * total + before + (here - state.remaining);
}

/**
 * Finished when the engine has gone all the way round once.
 *
 * The engine is a cycling one — it was built for breathing, which repeats — so
 * a practice that must run exactly once needs a stopping condition, and this
 * is it: the first wrap means every step has been shown once. The alternative,
 * a separate linear engine, is the duplication this commit exists to avoid.
 */
export function meditationFinished(state: EngineState): boolean {
  return state.cycles > 0;
}

/** Seconds as `m:ss`, which is what the reader is counting in. */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}