/**
 * Mega Batch, commit 2 — the one owner of the non-clinical rule.
 *
 * WHY A MODULE AND NOT A REGEX IN THE TEST
 * This app writes therapeutic-adjacent prose in more than one place: fifteen
 * education articles here, ten meditations in commit 11, micro-lesson lines
 * that already exist. A rule typed into one test file is a rule the next
 * content batch does not know exists, and the failure is silent — the new
 * articles simply ship with a clinical sentence nobody looks for. Owning it
 * here means the next batch imports the rule instead of reinventing it, and
 * the exception list is a single readable list rather than a scattered set of
 * "…except for ed-krizis" comments.
 *
 * IT IS NOT IMPORTED BY `education.ts`, AND THAT IS THE POINT: the check is a
 * build-time fact about the content, not a runtime one, so shipping these
 * regexes inside the bundle would cost every user bytes for something no user
 * ever executes.
 *
 * NO `g` FLAG, ON PURPOSE
 * A global RegExp carries `lastIndex` between `.exec` calls, so a shared
 * global regex answers differently the second time it is used. Every regex
 * here is flagless and therefore stateless, which is what makes them safe to
 * share across two test files.
 */

/**
 * Words that would make this content read as medical rather than supportive:
 * naming a diagnosis, a condition, a drug, or treatment. A mood journal does
 * none of those and must not appear to.
 *
 * THE `i` FLAG IS LOAD-BEARING, NOT COSMETIC
 * Hungarian capitalises the first word of a sentence and every title, label and
 * heading, so the word this list exists to catch appears capitalised exactly
 * where a reader notices it most. Without `i` the pattern was blind to
 * "Gyógyszerek" and "Gyógyszer-emlékeztető" while seeing only the lowercase
 * "gyógyszerlista" — three catalogue values that nobody had allowed, simply
 * passed. A rule that is case-sensitive about a case the language guarantees is
 * not a stricter rule; it is a shorter one.
 *
 * The `i` flag does not disturb the statelessness argued above: `lastIndex`
 * belongs to the `g` flag only, and neither regex carries it.
 */
export const CLINICAL_VOCABULARY = /diagnózis|beteg|gyógyszer|kezelés|tünet/i;

/**
 * Claims about what will fix the reader. Distinct from CLINICAL_VOCABULARY:
 * "kezelés" is banned outright, "gyógyít" is banned only as a promise. Both
 * are swept, because a sentence that never names a condition can still
 * overreach ("ez kezeli a szorongásod") and pass the first sweep cleanly.
 *
 * `i` for the same reason as above: a promise is just as much a promise when it
 * opens a sentence, and "Gyógyítja a szorongásodat" would have shipped clean.
 */
export const THERAPEUTIC_CLAIMS = /gyógyít|gyógyítja|diagnosztikus|kezelésre/i;

/**
 * The ids allowed to name a professional. Exactly one: the crisis article,
 * whose purpose is to hand over a helpline number and a person. Adding an id
 * here is a deliberate act of widening the exception, which is why it is a
 * list a test prints when it fails.
 */
export const CLINICAL_EXCEPTIONS: readonly string[] = ["ed-krizis"];

/** The offending fragment, or null. Returns the match so a failure can name it. */
export function clinicalHit(text: string): string | null {
  return CLINICAL_VOCABULARY.exec(text)?.[0] ?? null;
}

/** The offending promise, or null. */
export function therapeuticClaimHit(text: string): string | null {
  return THERAPEUTIC_CLAIMS.exec(text)?.[0] ?? null;
}

/** May this article name a professional? */
export function isClinicalException(id: string): boolean {
  return CLINICAL_EXCEPTIONS.includes(id);
}