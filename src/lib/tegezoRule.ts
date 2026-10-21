/**
 * Mega Batch, commit 2 — the one owner of the register rule.
 *
 * The app speaks to its reader as a peer ("jegyezd le", "próbáld ki"), never
 * as an authority ("vegye figyelembe"). That is a deliberate choice about a
 * mental-health app: formal address puts the writer above the reader, and the
 * reader came here precisely because something felt out of reach. Mixed
 * register inside one screen is worse than either on its own — a form note in
 * tegeződés reads as a cold patch — so this is a rule, not a style preference.
 *
 * WHY THERE IS NO `\b` IN THIS REGEX, AND WHY IT MUST NEVER COME BACK
 * JavaScript defines `\w` as ASCII-only `[A-Za-z0-9_]`, so every accented
 * Hungarian letter is a NON-word character as far as `\b` is concerned. Two
 * consequences, both of which bit this file:
 *
 *   - `\bön\b` MATCHES INSIDE "jön". The position between `j` (a word char)
 *     and `ö` (not) is a boundary, so the sweep flagged `ed-alvas` for saying
 *     "ha az alvás nem jön be". A word that merely CONTAINS "ön" is not
 *     formal address, and the rule must not care about it.
 *   - `\bÖn\b` happens NOT to match "Önértékelés" — but only by accident of
 *     the start-of-string case, not by design.
 *
 * So the boundary is spelled out explicitly instead: a lookbehind and a
 * lookahead over the actual Hungarian letter set. `tests/lib/education.test.ts`
 * asserts all three of these cases (the two `Ön-` category names, and "jön"),
 * which is what stops a future edit from "simplifying" this back to `\b`.
 *
 * `i` MATTERS HERE TOO, and it was a real bug: Hungarian capitalises only the
 * first word of a sentence, so "vegye figyelembe" almost always appears
 * lowercase mid-sentence. A case-sensitive rule therefore passes on an article
 * set that happens not to use the word, and fails on the next batch that does.
 * The flag has no effect on `lastIndex`, so the regex stays stateless.
 */
export const FORMAL_ADDRESS =
  /(?<![a-záéíóöőúüű])(Vegye|Ön|Önnek|Önhöz|Öntől|Köszönjük)(?![a-záéíóöőúüű])/i;

/**
 * One Hungarian accented vowel or its uppercase. Named `..._CLASS` rather than
 * `HUNGARIAN_DIACRITICS` on purpose: an identically named constant used to
 * live in `font-cmap.ts`, was removed as dead, and
 * `tests/batch12-dead-export.test.ts` now asserts that it is GONE.
 * Reintroducing that exact name would collide with a guard, and a collision
 * here would be indistinguishable from the dead copy coming back.
 */
export const HUNGARIAN_DIACRITIC_CLASS = /[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/;

/** The formal word found, or null — so a failure can print which one it was. */
export function formalAddressHit(text: string): string | null {
  return FORMAL_ADDRESS.exec(text)?.[0] ?? null;
}

/** True when the text addresses the reader formally. */
export function speaksFormally(text: string): boolean {
  return FORMAL_ADDRESS.test(text);
}

/** True when the text carries accented Hungarian letters. */
export function hasHungarianDiacritics(text: string): boolean {
  return HUNGARIAN_DIACRITIC_CLASS.test(text);
}