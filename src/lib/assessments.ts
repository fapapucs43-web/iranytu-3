/**
 * Önreflexiós kérdőív — the instrument definition and scoring (Batch 6).
 *
 * WHAT THIS IS
 * A self-reflection checklist. It is NOT a screening tool and it produces NO
 * diagnosis. Every screen that shows a result must show `DISCLAIMER` and the
 * `RESOURCES` list next to it — that is a hard requirement of this module, not
 * a style preference, and tests/batch6.test.ts asserts it per surface.
 *
 * PROVENANCE — read this before changing any string
 * Items 1–8 are the HUNGARIAN PHQ-8, transcribed verbatim from the MAPI
 * (Multicultural Mental Health Research Centre) translation:
 *
 *   "Hungarian version of the PHQ-9", file phq-9hunq.doc, 19/12/2005,
 *   document code EPI0905.PHQ9P,
 *   "Copyright © 2005 Pfizer Inc. A dokumentum felhasználása a
 *    Pfizer Inc. engedélyével történt." (used with Pfizer's permission)
 *
 * That source contains EIGHT items — it omits the ninth (thoughts of death or
 * self-harm) entirely. So this is a PHQ-8, not a PHQ-9, and it is labelled as
 * one. Pfizer placed the PHQ/GAD family in the public domain in 2010, so
 * reproduction and translation need no permission.
 *
 * TWO DELIBERATE DEVIATIONS FROM THE SOURCE, both owner-approved:
 *
 * 1. Item 1 reads "Kevés érdeklődés vagy örömérzés…". The source document
 *    contains a typo — its raw bytes spell "érdekldés", missing the ő. We ship
 *    the corrected spelling. A transcription that preserves a typo in a
 *    user's own language looks like carelessness; a one-character correction
 *    to a diacritic does not change what the item measures.
 *
 * 2. Item 9 is NOT in the source. It is an owner-supplied addition, clearly
 *    separated (see `isSupplementary`) and labelled "kiegészítő kérdés"
 *    everywhere it appears. It is included because it is the one question that
 *    gives someone with such thoughts a route to help — but it must never be
 *    passed off as part of the validated instrument. `SAFETY_NOTICE` is
 *    displayed verbatim while this item is on screen.
 *
 * The questionnaire's on-screen NAME is "Önreflexiós kérdőív". The strings
 * "PHQ-9" and "PHQ-8" appear nowhere in user-facing copy — only in
 * `SOURCE_ATTRIBUTION`, which is shown on the consent screen and in the PDF
 * export footer. Naming a validated instrument in the UI lends it a clinical
 * authority this app has not earned and does not want.
 *
 * This module is deliberately PURE: no React, no DOM, no localStorage. It is
 * data and arithmetic, so it can be tested exhaustively without a browser, and
 * so nothing in the storage layer can ever reach back up here.
 *
 * It has exactly one import, `t` from `./i18n`, and that is worth being precise
 * about rather than repeating "no imports": the catalogue imports nothing at
 * all — no React, no DOM, no storage — so this module is still pure by every
 * reason the rule existed, and the reason the rule is stated that way (testable
 * without a browser; unreachable from storage) is still enforced by tests. What
 * moved is ownership of two sentences, not this module's dependence on the
 * world.
 */

import { t } from "./i18n";

/* ------------------------------------------------------------------ */
/* Verbatim source text                                                */
/* ------------------------------------------------------------------ */

/** Instruction line, verbatim from the source document. */
export const INSTRUCTION =
  "Az elmúlt 2 hétben milyen gyakran okoztak Önnek gondot az alábbi panaszok?";

/** On-screen name. Deliberately NOT the instrument's name. */
export const TITLE = "Önreflexiós kérdőív";

/** Provenance, shown on the consent screen and in the PDF export footer only. */
export const SOURCE_ATTRIBUTION = "PHQ-8 magyar fordítása, Pfizer/MAPI 2005";

/**
 * The mandated disclaimer. Single source of truth: every surface imports this
 * exact string, and a test asserts it appears on the result, the history
 * detail, the consent screen and the export. It is never paraphrased.
 *
 * The wording now lives in the catalogue as `crisis.disclaimer`; this constant
 * is the name the five surfaces import. Nothing about the contract changed —
 * a surface that reads `DISCLAIMER` still reads the mandated sentence, and
 * there is still exactly one copy of it in the app, only the owner moved.
 */
export const DISCLAIMER = t("crisis.disclaimer");

/* ------------------------------------------------------------------ */
/* Response scale — verbatim                                           */
/* ------------------------------------------------------------------ */

/** Answer options, verbatim. Index IS the score. */
export const RESPONSE_OPTIONS = [
  "Egyszer sem",
  "Néhány napon",
  "A napok több mint felében",
  "Majd-nem minden nap",
] as const;

export type ResponseValue = 0 | 1 | 2 | 3;

/* ------------------------------------------------------------------ */
/* Items                                                               */
/* ------------------------------------------------------------------ */

export type AssessmentItem = {
  /** 1-based, matching the source document's numbering. */
  index: number;
  text: string;
  /**
   * True for the added ninth item, which is NOT part of the validated
   * source. Drives the "kiegészítő kérdés" label and the safety notice.
   */
  isSupplementary: boolean;
};

/** The eight items of the validated Hungarian source, verbatim (item 1 corrected). */
export const SOURCE_ITEMS: readonly AssessmentItem[] = [
  { index: 1, isSupplementary: false, text: "Kevés érdeklődés vagy örömérzés tevékenységei során" },
  { index: 2, isSupplementary: false, text: "Szomorúság, lehangoltság vagy reménytelenség" },
  { index: 3, isSupplementary: false, text: "Nehezen tud elaludni, éjszaka könnyen felébred, vagy túl sokat alszik" },
  { index: 4, isSupplementary: false, text: "Fáradtság vagy kevés energia" },
  { index: 5, isSupplementary: false, text: "Rossz étvágy vagy túlzott evés" },
  {
    index: 6,
    isSupplementary: false,
    text: "Rossz érzések saját magával kapcsolatban, vagy olyan gondolatok, hogy Ön sikertelen, vagy csalódást okozott önmaga vagy családja számára",
  },
  { index: 7, isSupplementary: false, text: "Koncentrálási nehézségek, pl. újságolvasás vagy tévénézés közben" },
  {
    index: 8,
    isSupplementary: false,
    text: "Mozgása vagy beszéde annyira lelassult, hogy mások is észrevehették, vagy ellenkezleg, olyan nyugtalan, hogy a szokásosnál sokkal többet mozgott",
  },
] as const;

/**
 * Item 9 — added by the owner, NOT in the validated Hungarian source.
 * Kept last, flagged, and always accompanied by `SAFETY_NOTICE`.
 */
export const SUPPLEMENTARY_ITEM: AssessmentItem = {
  index: 9,
  isSupplementary: true,
  text: "Az elmúlt 2 hétben milyen gyakran gondolta, hogy jobb lenne, ha meghalna, vagy hogy bántania kellene magát?",
};

/** Every scored question, in order. Nine, maximum 27. */
export const ITEMS: readonly AssessmentItem[] = [...SOURCE_ITEMS, SUPPLEMENTARY_ITEM];

/** How the user is told the added question is not part of the standard form. */
export const SUPPLEMENTARY_LABEL = "kiegészítő kérdés";

/**
 * Shown verbatim whenever the supplementary item is on screen, and surfaced
 * again on the result. Deliberately unconditional: it does not wait for an
 * answer, because someone reading the question may need the number before
 * they have decided what to answer.
 */
export const SAFETY_NOTICE =
  "Ha bármikor ilyen gondolatai vannak, azonnal hívja a 116-123-at (éjjel-nappal, ingyenes) vagy 112-t életveszély esetén.";

export const ITEM_COUNT = ITEMS.length;
/** Nine questions × max 3 = 27. */
export const MAX_SCORE = ITEM_COUNT * 3;

/* ------------------------------------------------------------------ */
/* Optional second step — verbatim, unscored                           */
/* ------------------------------------------------------------------ */

/**
 * The source document's follow-up question, verbatim. Optional, and it does
 * NOT contribute to the score: it asks about functional impact, not symptom
 * frequency, so folding it into the total would mix two different constructs.
 */
export const IMPACT_QUESTION =
  "Amennyiben bejelölt egy vagy több problémát, mekkora nehézséget okoztak ezek a problémák a munkahelyén, otthoni teendi ellátásában vagy más emberekkel való kapcsolatában?";

/** Impact answers, verbatim. Index is NOT a score component. */
export const IMPACT_OPTIONS = [
  "Egyáltalán nem okozott nehézséget",
  "Kis nehézséget okozott",
  "Nagy nehézséget okozott",
  "Kifejezetten nagy nehézséget okozott",
] as const;

/* ------------------------------------------------------------------ */
/* Bands — descriptive only                                            */
/* ------------------------------------------------------------------ */

export type Band = {
  /** Inclusive lower bound. */
  min: number;
  /** Inclusive upper bound. */
  max: number;
  /**
   * A description of what the user reported. Never a clinical label: no
   * "depresszió", no "szorongászavar", no "súlyos", no "betegség". A test
   * asserts the vocabulary stays descriptive.
   */
  label: string;
  /** One or two plain sentences on what to do with the number. */
  note: string;
};

/**
 * Cut points follow the PHQ convention (5/10/15/20). Because the ninth item
 * is included, the maximum is 27 and the top band runs 20–27 — the owner
 * explicitly rejected rescaling onto any other scale, since rescaling invents
 * precision the raw sum does not have.
 */
export const BANDS: readonly Band[] = [
  {
    min: 0,
    max: 4,
    label: "Nincs jellemző tünet",
    note: "Az elmúlt két hétben kevés vagy egyáltalán nem jeleztél tüneteket. Ha mégis érezted magad rosszul, a napló továbbra is jó hely erre.",
  },
  {
    min: 5,
    max: 9,
    label: "Enyhe tünetek jelei",
    note: "Jelentek meg enyhe tünetek. Érdemes figyelni, hogy a következő napokban maradnak-e, és hogy a naplóba leírtak segítenek-e.",
  },
  {
    min: 10,
    max: 14,
    label: "Közepes erősségű tünetek",
    note: "Több tünet együtt, közepes erősséggel. Érdemes beszélni róla valakivel, akiben megbízol.",
  },
  {
    min: 15,
    max: 19,
    label: "Erősebb tünetek",
    note: "Az elmúlt két hétben erősebb tüneteket írtál le. Jó ötlet szakemberrel beszélni róluk.",
  },
  {
    min: 20,
    max: 27,
    label: "Nagyon erős tünetek",
    note: "Sok tünet, nagy erősséggel. Kérlek, ne maradj egyedül vele — érdemes szakemberhez fordulni.",
  },
] as const;

/* ------------------------------------------------------------------ */
/* Resources                                                           */
/* ------------------------------------------------------------------ */

export type Resource = {
  /** What the user is shown. */
  label: string;
  /** Dialled number, when there is one. */
  phone?: string;
  /** Hours, stated plainly — a helpline that is quietly closed is useless. */
  hours?: string;
  href?: string;
};

/**
 * The heading that introduces `RESOURCES`.
 *
 * It used to be a bare JSX literal inside `components/AssessmentResult.tsx`,
 * which was true as long as the questionnaire was the only thing that could
 * show a crisis route. It no longer is (Batch 13, commit 6): the same list is
 * reachable from Settings, from the consent screen and from a journal entry,
 * and four places that each spell the sentence in their own JSX are four
 * places that can drift. One constant, next to the list it titles — which is
 * now a catalogue key, `crisis.resourcesTitle`, with this name kept as the
 * handle the surfaces already import.
 */
export const RESOURCES_TITLE = t("crisis.resourcesTitle");

/**
 * Shown on EVERY result, always adjacent to the disclaimer. Numbers verified
 * against the operators' own sites, not recalled.
 *
 * This is the only place in the app a crisis phone number is written down.
 * The help surface that Batch 13, commit 6 adds outside the questionnaire
 * imports this array; it does not carry a list of its own.
 */
export const RESOURCES: readonly Resource[] = [
  {
    label: "Magyar Lelki Elsősegély Telefonszolgálatok Szövetsége",
    phone: "116-123",
    hours: "éjjel-nappal, ingyenes",
  },
  { label: "Életveszély esetén", phone: "112" },
  { label: "Kék Vonal — gyermekeknek és fiataloknak", phone: "116-111", hours: "éjjel-nappal, ingyenes" },
  { label: "Kék Vonal — szülőknek", phone: "116-000", hours: "éjjel-nappal, ingyenes" },
  { label: "Alapítvány az Öngyilkosság Ellen", href: "https://ongyilkossagmegelozes.hu" },
  { label: "Kormányi egészségvonal — lelki egészség", href: "https://egeszsegvonal.gov.hu" },
] as const;

/* ------------------------------------------------------------------ */
/* Scoring — pure arithmetic                                           */
/* ------------------------------------------------------------------ */

/** A completed run: one answer per item, plus the optional impact answer. */
export type AssessmentAnswers = {
  /** Length must equal `ITEM_COUNT`. Each entry 0–3. */
  answers: readonly number[];
  /** 0–3, or null when the optional second step was skipped. */
  impact?: number | null;
};

function isValidAnswer(v: unknown): v is ResponseValue {
  return v === 0 || v === 1 || v === 2 || v === 3;
}

/** True when every item has a 0–3 answer. */
export function isComplete(input: AssessmentAnswers): boolean {
  return (
    Array.isArray(input.answers) &&
    input.answers.length === ITEM_COUNT &&
    input.answers.every(isValidAnswer)
  );
}

/**
 * Sum of the item answers, 0–27.
 *
 * Throws on an incomplete run rather than quietly scoring a partial one: a
 * total built from 6 of 9 answers would land in a misleading band, which is
 * the exact failure mode this feature must not have.
 */
export function score(input: AssessmentAnswers): number {
  if (!isComplete(input)) {
    throw new Error(`Hiányos válaszok: ${ITEM_COUNT} válasz szükséges, minden válasz 0–3 legyen.`);
  }
  return input.answers.reduce((sum, v) => sum + v, 0);
}

/** The band a total falls into. Every 0–27 score maps to exactly one band. */
export function bandFor(total: number): Band {
  const hit = BANDS.find((b) => total >= b.min && total <= b.max);
  if (!hit) {
    // Unreachable for a valid score, but a blank band is worse than a throw.
    throw new Error(`Nincs sáv a(z) ${total} pontszámhoz.`);
  }
  return hit;
}

/** Score and band together — the only thing a result screen should read. */
export function summarize(input: AssessmentAnswers): { score: number; band: Band } {
  const total = score(input);
  return { score: total, band: bandFor(total) };
}

/** The impact answer, or null when the optional second step was skipped. */
export function impactOf(input: AssessmentAnswers): number | null {
  const v = input.impact;
  return v === undefined || v === null || !isValidAnswer(v) ? null : v;
}

/**
 * True when the supplementary item was answered above "Egyszer sem".
 *
 * Exposed so the result screen can give the resources more prominence on
 * that run. It is NOT a diagnosis, not a flag stored anywhere, and it is not
 * derivable by any other module — it exists only in this run's summary.
 */
export function needsSupport(input: AssessmentAnswers): boolean {
  const supplementary = input.answers[SUPPLEMENTARY_ITEM.index - 1];
  return isValidAnswer(supplementary) && supplementary > 0;
}
