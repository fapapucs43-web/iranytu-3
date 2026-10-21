/**
 * Feszültség és aggodalom — a seven-question check-in, and its arithmetic.
 *
 * WHAT THIS IS
 * Seven questions about the last two weeks, each answered on the same four-step
 * frequency scale the Önreflexiós kérdőív uses, summed to a 0–21 total and read
 * back as one descriptive band. It is NOT a screening tool, it produces NO
 * diagnosis, and nothing here is stored — see "WHY NOTHING IS SAVED" below.
 * Every surface that shows a result shows `DISCLAIMER` and `RESOURCES` beside
 * it, both imported from `./assessments`, which owns the only copy of either.
 *
 * PROVENANCE — read this before changing a string
 * The instrument is the GAD-7 (Spitzer, Kroenke, Williams & Löwe, 2006). Pfizer
 * placed the PHQ/GAD family in the public domain in 2010, so reproducing and
 * adapting it needs no permission — the same reason `./assessments` carries its
 * PHQ-8 without one. What is here is an ADAPTATION, not a transcription:
 *
 *   1. It is in the app's OWN register. The app speaks to its reader as a peer
 *      ("érezted", "tudtál"), and `lib/tegezoRule` exists because mixed register
 *      inside one screen reads as a cold patch. The published Hungarian
 *      translation is formal; this one is not, and the screen says so plainly
 *      rather than borrowing the authority of the original wording.
 *   2. The seven items ask about the SAME seven things in the same order. They
 *      are phrased as statements a person can recognise ("Idegesnek, feszültnek
 *      vagy nyugtalannak érezted magad") rather than as clinical interrogatives.
 *
 * The questionnaire's on-screen NAME is "Feszültség és aggodalom". The strings
 * "GAD-7" and "GAD" appear nowhere in user-facing copy except the one provenance
 * line the card prints — the same trade `./assessments` makes, for the same
 * reason: naming a validated instrument lends clinical authority this app has
 * not earned and does not want.
 *
 * WHY NOTHING IS SAVED
 * The Önreflexiós kérdőív keeps a dated log, because its whole point is a
 * history of the same nine questions. This one does not: it is a check-in you
 * can take in the moment, and a score written into storage is a score that a
 * later surprise could read. `./assessmentStore` is deliberately shaped around
 * ONE instrument (`ITEM_COUNT`, `summarize`), so leaving this module out of it
 * is a structural fact rather than a promise — there is no field to read and no
 * key to find, and a test asserts the card writes nothing at all.
 *
 * WHY IT IS PURE
 * Data and arithmetic only: no React, no DOM, no storage, and — unlike
 * `./assessments`, which reads two sentences from the catalogue — no imports at
 * all. The component that renders it takes every sentence it says from
 * `./i18n`, and this module keeps the two things that are CONTENT rather than
 * chrome: the seven items and the four bands, in the app's own voice.
 */

/* ------------------------------------------------------------------ */
/* The instrument                                                      */
/* ------------------------------------------------------------------ */

/** The stem every question hangs from. Informal, present-perfect, two weeks. */
export const INSTRUCTION = "Az elmúlt 2 hétben mennyire voltak jellemzőek rád az alábbiak?";

/**
 * On-screen name, `gad7.title` in the catalogue — deliberately NOT the
 * instrument's own name. It is not a constant here because a constant would be
 * a second copy of a string the card already reads by key.
 */

export type Gad7Item = {
  /** 1-based, in the instrument's own order. */
  index: number;
  text: string;
};

/**
 * The seven items, in the instrument's order.
 *
 * Written as statements ("Idegesnek… érezted magad") because that is what the
 * original asks and because a reader answers a description more honestly than
 * an accusation. No item is optional, none is supplementary: unlike the
 * Önreflexiós kérdőív there is nothing here that needed adding, so there is no
 * safety notice and no impact follow-up.
 */
export const ITEMS: readonly Gad7Item[] = [
  { index: 1, text: "Idegesnek, feszültnek vagy nyugtalannak érezted magad" },
  { index: 2, text: "Nem tudtad abbahagyni vagy kordában tartani az aggodalmaskodást" },
  { index: 3, text: "Túl sokat aggódtál különböző dolgok miatt" },
  { index: 4, text: "Nehezen tudtál megnyugodni" },
  { index: 5, text: "Olyan nyugtalan voltál, hogy nehezen tudtál egy helyben megülni" },
  { index: 6, text: "Könnyen bosszankodtál vagy ingerlékeny voltál" },
  { index: 7, text: "Féltél, mintha valami szörnyű dolog történhetett volna" },
] as const;

export const ITEM_COUNT = ITEMS.length;
/** Seven questions × max 3 = 21. */
export const MAX_SCORE = ITEM_COUNT * 3;

/* ------------------------------------------------------------------ */
/* Bands — descriptive only                                            */
/* ------------------------------------------------------------------ */

export type Band = {
  /** Inclusive lower bound. */
  min: number;
  /** Inclusive upper bound. */
  max: number;
  /**
   * What the reader reported, in the app's own voice. Never a clinical label:
   * no "szorongászavar", no "diagnózis", no "tünet". A test asserts the
   * vocabulary stays descriptive.
   */
  label: string;
  /** One or two plain sentences on what to do with the number. */
  note: string;
};

/**
 * The instrument's conventional cut points (5/10/15), on a 0–21 total.
 *
 * Unlike the PHQ-8 there is no added item here, so the maximum is the
 * instrument's own 21 and the top band is 15–21 — no rescaling, and no band
 * invented to cover a score the instrument cannot produce.
 */
export const BANDS: readonly Band[] = [
  {
    min: 0,
    max: 4,
    label: "Nyugodt időszak",
    note: "Az elmúlt két hétben alig jelöltél feszültséget. Ha mégis nehéz volt, a napló továbbra is jó hely erre.",
  },
  {
    min: 5,
    max: 9,
    label: "Enyhe feszültség",
    note: "Néhány napon megjelent a feszültség. Érdemes figyelni, hogyan alakul a következő napokban.",
  },
  {
    min: 10,
    max: 14,
    label: "Közepes feszültség",
    note: "A napok jelentős részében feszült lehettél. Érdemes beszélni róla valakivel, akiben megbízol.",
  },
  {
    min: 15,
    max: 21,
    label: "Erős feszültség",
    note: "Sok napon át erős feszültséget jelöltél. Jó ötlet szakemberrel beszélni róla.",
  },
] as const;

/* ------------------------------------------------------------------ */
/* Scoring — pure arithmetic                                           */
/* ------------------------------------------------------------------ */

/** True when the value is one of the four the scale allows. */
export function isValidAnswer(v: unknown): v is 0 | 1 | 2 | 3 {
  return v === 0 || v === 1 || v === 2 || v === 3;
}

/** True when all seven items carry a 0–3 answer. */
export function isComplete(answers: readonly number[]): boolean {
  return Array.isArray(answers) && answers.length === ITEM_COUNT && answers.every(isValidAnswer);
}

/**
 * Sum of the seven answers, 0–21.
 *
 * Throws on an incomplete run rather than quietly scoring a partial one — the
 * same rule `./assessments` enforces, for the same reason: a total built from
 * five of seven answers lands in a band that describes nobody.
 */
export function score(answers: readonly number[]): number {
  if (!isComplete(answers)) {
    throw new Error(`Hiányos válaszok: ${ITEM_COUNT} válasz szükséges, minden válasz 0–3 legyen.`);
  }
  return answers.reduce((sum, v) => sum + v, 0);
}

/** The band a total falls into. Every 0–21 score maps to exactly one. */
export function bandFor(total: number): Band {
  const hit = BANDS.find((b) => total >= b.min && total <= b.max);
  if (!hit) {
    // Unreachable for a valid score, but a blank band is worse than a throw.
    throw new Error(`Nincs sáv a(z) ${total} pontszámhoz.`);
  }
  return hit;
}

/** Score and band together — the only thing a result view should read. */
export function summarize(answers: readonly number[]): { score: number; band: Band } {
  const total = score(answers);
  return { score: total, band: bandFor(total) };
}
