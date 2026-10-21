/**
 * Batch B, step 1 — the micro-lesson registry and its rotation.
 *
 * After a recording completes, the app offers ONE short therapeutic exercise
 * matched to the quadrant the recording landed in. The content lives here as
 * plain data for two reasons: a lesson is prose a reviewer can read and fix
 * without touching any component, and the rotation over it is a pure function
 * that a test can drive with a deterministic rng.
 *
 * SEPARATE STORAGE, DELIBERATELY. Which lessons the user has already seen
 * goes under its own key, `belso-iranytu-seen-lessons`, in the same shape the
 * custom emotions use — never inside the main data blob. The main blob has an
 * exporter, a schema and a migration history; a lesson-visibility flag has
 * none of those jobs and must not inherit them. The key is cleared by the
 * settings' data reset, which is where every other sidecar key is cleared too.
 *
 * The lessons themselves are 2–3 sentences, Hungarian, informal (tegeződés),
 * CBT-informed, and each gives ONE thing the user can actually do in the next
 * few minutes: high-neg works on parasympathetic activation, grounding and
 * breath; low-neg on self-compassion, gentle activation and rest; high-pos on
 * savoring, sharing and gratitude; low-pos on body awareness and presence.
 * Nothing here diagnoses, nothing here promises a cure, and nothing here
 * names a feeling the user did not just record themselves.
 */

import type { MoodQuadrant } from "../types";

/** A single micro-lesson, shown once per recording by the therapeutic card. */
export type MicroLesson = {
  /** Stable and unique; the quadrant prefix makes a bad mapping read wrong at a glance. */
  id: string;
  quadrant: MoodQuadrant;
  /** The lesson itself: 2–3 sentences, empathetic, one concrete action. */
  text: string;
};

export const MICRO_LESSONS: readonly MicroLesson[] = [
  /* ------------------ high-neg: feszültség, düh, szorongás ------------------ */
  {
    id: "hn-legzes-46",
    quadrant: "high-neg",
    text: "Amikor a tested vészüzemben van, a hosszú kilégzés kapcsolja be a nyugalmat. Lélegezz be négy másodpercig, és fújd ki hatig, háromszor egymás után. Nem kell semmit megváltoztatnod, csak a levegő hosszát számolni.",
  },
  {
    id: "hn-foldozas-54321",
    quadrant: "high-neg",
    text: "A szorongás a jövőben él, a figyelmed viszont ide vissza tudod hozni. Nevezz meg öt dolgot, amit látsz, négyet, amit hallasz, és hármat, amit a bőrödön érzel. A jelenbe húzott figyelem a tested riadókészültségét is lejjebb viszi.",
  },
  {
    id: "hn-feszultseg-elengedese",
    quadrant: "high-neg",
    text: "Az izomfeszültség a düh és a szorongás testi közlekedési eszköze. Feszítsd meg ökölbe zárt kezedet öt másodpercig, majd engedd el hirtelen. Isméld meg a válladdal és az állkapcsoddal, mert a legtöbb feszültség ott rakodik le.",
  },
  {
    id: "hn-hideg-viz",
    quadrant: "high-neg",
    text: "A hirtelen hideg inger gyorsan lejjebb viszi a test riadókészültségét. Moss arcot hideg vízzel, vagy tarts a csuklódhoz egy hideg tárgyat. Harminc másodperc elég, hogy a tested újra azt üzenje, hogy most biztonságban vagy.",
  },
  {
    id: "hn-gondolat-nem-teny",
    quadrant: "high-neg",
    text: "A fejedben feltörő szigorú gondolat nem tény, csak egy gondolat, ami siet. Írd vagy mondd ki, hogy észreveszed magadat, és kérdezd meg: min alapul? A gondolat megnevezése már fél lépés a kevésbé feszült válasz felé.",
  },
  {
    id: "hn-mozgas-levezetes",
    quadrant: "high-neg",
    text: "A felgyülemlett feszültségnek útra van szüksége, és a leggyorsabb út a mozgás. Tíz guggolás, egy gyors séta vagy fél perc helyben futás is levezeti belőle a többletet. Figyeld meg utána, hogy a tested letett-e a vészüzemről.",
  },

  /* ---------------- low-neg: szomorúság, levertség, üresség ---------------- */
  {
    id: "ln-bara-onmagadhoz",
    quadrant: "low-neg",
    text: "Ha a legjobb barátod érezné ezt, valószínűleg nem szidnád, hanem átölelnéd. Mondd ki hangosan, amit neki mondanál, csak most magadnak. Az önegyüttérzés nem gyengeség, hanem a felépülés egyik leggyorsabb útja.",
  },
  {
    id: "ln-apro-lepes",
    quadrant: "low-neg",
    text: "Lehangolt állapotban a nagy célok túl messze vannak, és az elmaradásuk tovább nyom le. Válassz egy dolgot, ami két percbe telik, és csináld meg, akár a poharak elmosása. Az aktivitás gyakran az öröm előtt jön, nem utána.",
  },
  {
    id: "ln-pihenes-engedely",
    quadrant: "low-neg",
    text: "A levertség nem lustaság, hanem egy jel, hogy a tested pihenőt kér. Ma megadhatod neki: feküdj le tíz percre, és engedd meg magadnak, hogy most semmit ne kelljen. A pihenés nem időpazarlás, hanem a holnapi energiád alapja.",
  },
  {
    id: "ln-erzes-megnevezese",
    quadrant: "low-neg",
    text: "A nehezen megnevezett érzés bent hullámzik, a megnevezett viszont helyet kap. Kérdezd meg magadtól, hogy ez szomorúság, csalódás, üresség vagy valami más. A pontos név kevesebb nyomást jelent, mint a ködös súly.",
  },
  {
    id: "ln-egyszeru-kapcsolat",
    quadrant: "low-neg",
    text: "Az elzárkózás a lehangoltság egyik üzemanyaga, még ha menedéknek is tűnik. Küldj el egy üzenetet valakinek, akár csak annyit, hogy gondoltál rá. Nem kell beszélgetés, elég egy jel, hogy nem vagy egyedül.",
  },
  {
    id: "ln-kicsi-orom-eszrevesz",
    quadrant: "low-neg",
    text: "A lehangolt napokon az apró örömök pislákolnak, de nem tűntek el. Este gyűjts össze hármat, például egy kávé illatát, egy jó viccet vagy a napfényt a falon. Ezek az apróságok bizonyítékul szolgálnak, hogy a nap nem volt teljesen szürke.",
  },

  /* ------------------- high-pos: öröm, izgalom, felszárnyalás -------------- */
  {
    id: "hp-beeles-30mp",
    quadrant: "high-pos",
    text: "Az öröm gyakran elszalad mellettünk, mert a fejünk már a következő feladatnál jár. Állj meg harminc másodpercre, és nézd a pillanatot, mint egy fotós. A tudatos figyelem megnyújtja az élményt, és mélyebb nyomot hagy.",
  },
  {
    id: "hp-megosztas",
    quadrant: "high-pos",
    text: "Az öröm megosztva duplázódik, és emlékezetesebbé válik. Meséld el valakinek, mi történt ma, akár két mondatban. A másik öröme hozzáadódik a tiédhez, és így lesz a napból megmaradó emlék.",
  },
  {
    id: "hp-hala-harom-dolog",
    quadrant: "high-pos",
    text: "A hála nem a bajok tagadása, hanem a figyelem másik irányba fordítása. Írj le három dolgot, ami ma jól ment, és gondold meg, mi tette lehetővé. A miértre adott válasz a saját erőidet is felszínre hozza.",
  },
  {
    id: "hp-mentes-a-testbe",
    quadrant: "high-pos",
    text: "A jó pillanat megőrizhető a testben is, nem csak a fejben. Érezd meg, hol él most az öröm a testedben, a mellkasodban vagy a szívedben. Ha újra nehéz nap jön, erre a helyre vissza lehet térni.",
  },
  {
    id: "hp-mi-hozta",
    quadrant: "high-pos",
    text: "Az öröm ritkán véletlen, és a forrását érdemes felkutatni. Kérdezd meg magadtól, mi volt ma az, ami elindította ezt az érzést. Amire rájössz, holnap is meg tudod teremteni.",
  },
  {
    id: "hp-emlek-mentese",
    quadrant: "high-pos",
    text: "Az örömteli pillanatok elhalványulnak, ha nincs hová tenni őket. Írj róla egy sort, vagy készíts róla most egy képet. Hónapok múlva ez a sor vissza tudja hozni a nap hangulatát.",
  },

  /* ----------------- low-pos: nyugalom, megelégedettség, békés -------------- */
  {
    id: "lp-testpasztazas",
    quadrant: "low-pos",
    text: "A csendes jóllét a legkevésbé hangos érzés, ezért könnyen észrevétlen marad. Pásztázd végig a tested a fejtetődtől a talpadig, és vedd észre, hol van most kényelmes. A tudatos testi jelenlét a nyugalmat tartósabbá teszi.",
  },
  {
    id: "lp-lab-a-foldon",
    quadrant: "low-pos",
    text: "A megelégedettségnek helye van, és ez a hely most a tested. Ülj egyenesen, és érezd, hogyan támaszt a talaj a talpaid alatt. Egy percnyi ilyen földelés után a gondolatok is leülnek melléd.",
  },
  {
    id: "lp-biztonsag-eszrevesz",
    quadrant: "low-pos",
    text: "A nyugalom is adat, pontosan úgy, mint a feszültség, és érdemes észrevenni. Nevezz meg három jelet, hogy most biztonságban vagy, például egy meleg szobát vagy egy teli bögrét. Amit egyszer észreveszel, azt holnap könnyebb újra megtalálni.",
  },
  {
    id: "lp-lassu-talalkozas",
    quadrant: "low-pos",
    text: "A hétköznapok apró érzékszervi élményei ingyenes jelenlét-gyakorlatok. Igyál meg egy bögre italt nagyon lassan, és figyeld a hőjét, az illatát és az ízét. A lassúság az, ami a szokásosból különlegeset csinál.",
  },
  {
    id: "lp-rendezetseg-nyugalom",
    quadrant: "low-pos",
    text: "A külső rendezetlenség sokaknál belső zajként érződik. Válassz ki egy felületet, és öt percre rakd rendbe, csak azt. A rendezett sarok visszaigazolás, hogy ott is van irányításod, ahol éppen vagy.",
  },
  {
    id: "lp-legzes-harminc",
    quadrant: "low-pos",
    text: "A nyugodt pillanat meghosszabbítható, ha odafigyelsz rá. Harminc másodpercig csak figyeld a légzésedet, anélkül, hogy változtatnál rajta. Ez a csend tartalék, amire a nehéz napokon is vissza lehet támaszkodni.",
  },
];

/** The lessons matched to one quadrant, in registry order. */
export function lessonsForQuadrant(quadrant: MoodQuadrant): MicroLesson[] {
  return MICRO_LESSONS.filter((lesson) => lesson.quadrant === quadrant);
}

/**
 * Pick the lesson to show: prefer one the user has NOT seen yet, and fall
 * back to a random one from the quadrant once everything has been seen.
 *
 * `rng` is a parameter rather than a hidden `Math.random` call so a test can
 * pin the pick; production always omits it. A quadrant with no lessons (a
 * hand-mangled quadrant string reaching this far) yields `null`, which the
 * card will treat as "no lesson to show" rather than a crash.
 */
export function pickLesson(
  quadrant: MoodQuadrant,
  seenIds: readonly string[],
  rng: () => number = Math.random,
): MicroLesson | null {
  const pool = lessonsForQuadrant(quadrant);
  if (pool.length === 0) return null;
  const seen = new Set(seenIds);
  const unseen = pool.filter((lesson) => !seen.has(lesson.id));
  const candidates = unseen.length > 0 ? unseen : pool;
  return candidates[Math.floor(rng() * candidates.length)] ?? candidates[0]!;
}

/* -------------------- seen-lesson storage (own key) --------------------- */

const SEEN_LESSONS_KEY = "belso-iranytu-seen-lessons";

/**
 * The ids the user has already been offered, as strings. A corrupt blob is
 * treated as an empty one: the worst case is a lesson repeats, which is a far
 * smaller harm than refusing to show any lesson at all. Ids that are not in
 * the registry (a lesson retired in a later version) are kept — they are
 * inert, and deleting them would rewrite a file the user owns.
 */
export function loadSeenLessons(): string[] {
  try {
    const raw = localStorage.getItem(SEEN_LESSONS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return [];
    const ids = (parsed as { lessonIds?: unknown }).lessonIds;
    if (!Array.isArray(ids)) return [];
    return ids.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

/** Persist that the user has now been offered this lesson (deduplicated). */
export function markLessonSeen(id: string): void {
  if (!id) return;
  const merged = [...new Set([...loadSeenLessons(), id])];
  try {
    localStorage.setItem(SEEN_LESSONS_KEY, JSON.stringify({ lessonIds: merged }));
  } catch {
    // storage full or unavailable — the rotation simply repeats a lesson
  }
}

/** Clear the seen list; called from the settings' "delete everything" flow. */
export function resetSeenLessons(): void {
  try {
    localStorage.removeItem(SEEN_LESSONS_KEY);
  } catch {
    /* noop */
  }
}
