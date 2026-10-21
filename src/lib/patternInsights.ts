/**
 * Mega Batch, commit 4 — pattern insights.
 *
 * WHAT THIS IS, AND WHAT IT IS NOT
 * It looks for co-occurrence. "On the days you went running, your mood was
 * 1.8 points higher" is a fact about two columns of a table. "Running makes
 * you happier" is a claim about a person, and this app has no business making
 * it: the data is self-reported, unblinded, gathered on days that felt worth
 * recording, and the sample is whatever the reader felt like writing down. So
 * every sentence here describes what travelled TOGETHER, and `causalHit` below
 * exists to keep a future edit from quietly upgrading one.
 *
 * WHAT IT DOES NOT REIMPLEMENT
 * `analysis.ts` already owns two of these engines and has since Batch 1:
 * `tagCorrelations` compares average mood with and without each activity tag,
 * and `personalInsights` reports stress levels and high-stress day counts.
 * Rewriting them here would be a second implementation of arithmetic that
 * already ships, drifting from it the first time the mood scale changes. So
 * the activity engine CALLS `tagCorrelations`, and this module adds what is
 * genuinely missing: the sleep and weekday engines, a stated confidence, and
 * the causality guard. The existing `personalInsights` list is untouched and
 * keeps rendering in "További felismerések".
 *
 * THE TWO GUARDS ARE DIFFERENT ON PURPOSE
 * `MIN_ENTRIES` is about the READER: below seven entries nothing is said at
 * all, because an insight drawn from four days is noise the reader will
 * remember and believe. The per-engine minimum is about the COMPARISON: an
 * engine that splits days into two groups needs at least three on each side,
 * or "the mood was higher on sleep days" can be true of one single day.
 */
import { tagCorrelations } from "./analysis";
import { fromISODate } from "./dates";
import type { Entry } from "../types";

export type PatternConfidence = "weak" | "medium" | "strong";

export interface PatternInsight {
  readonly id: string;
  readonly text: string;
  readonly confidence: PatternConfidence;
  /** Entries behind THIS comparison, as opposed to the whole dataset. */
  readonly sample: number;
}

/** Below this the reader is told nothing at all. */
export const MIN_ENTRIES = 7;

/** A two-sided comparison needs three days on each side to mean anything. */
const MIN_PER_SIDE = 3;

/** Seven hours is the line this module uses, and it says so in the sentence. */
const SHORT_SLEEP_HOURS = 7;

/**
 * The smallest best-to-worst weekday spread worth putting in a sentence.
 *
 * `sleepInsight` and `stressInsight` each bail below 0.2 points, and the
 * weekday engine was the one that did not — so on any dataset at all it
 * produced a sentence, including on data whose Monday and Friday moods
 * differed by 0.6 points. That is not a small wording problem: a card that
 * always has something to say is a card the reader learns to stop reading,
 * which costs the two genuine signals printed beside it. On a 1–5 scale 0.75
 * is the point at which the difference is noticeable rather than noise, so
 * that is the line. A test pins the boundary from both sides.
 */
const MIN_WEEKDAY_SPREAD = 0.75;

/**
 * Hungarian weekday names in the adjectival form ("hétfői napokon").
 *
 * NOT `WEEKDAYS_SHORT`, which is a column-header registry: "Hé" and "Cs" are
 * right in a narrow calendar column, which is its only other use, but a header
 * is a label and this is a sentence. Lowercasing the label and appending a noun
 * produced "A hé napokon a legjobb a hangulatod", and "hé" is not a Hungarian
 * word. The adjectival form is the idiomatic one for this sentence anyway, and
 * being already lowercase it removes the `.toLowerCase()` call that was doing
 * the damage.
 *
 * The two arrays cannot be merged — a 24px header and a running sentence want
 * different strings — so this is a second owner of a similar fact. What must not
 * drift is the ORDERING, since both are indexed by `getDay()`, and a test
 * pins that against `WEEKDAYS_SHORT` rather than leaving it to review.
 */
const WEEKDAYS_ADJECTIVAL = [
  "hétfői",
  "keddi",
  "szerdai",
  "csütörtöki",
  "pénteki",
  "szombati",
  "vasárnapi",
] as const;

/**
 * Confidence is a property of the READER'S DATASET, not of one comparison, so
 * it is banded on the total usable entry count. Note the consequence, which is
 * deliberate: a strong dataset still cannot produce a weekday insight from
 * three days versus three, because the per-engine guard runs first and is not
 * negotiable by confidence.
 */
export function confidenceFor(entries: number): PatternConfidence {
  if (entries >= 30) return "strong";
  if (entries >= 15) return "medium";
  return "weak";
}

/* ------------------------------------------------------------ causal wording */

/**
 * Hungarian letters, for the boundary lookarounds.
 *
 * NOT `\b`. JavaScript defines `\w` as ASCII-only, so every accented letter is
 * a NON-word character: `\bmiatt\b` would match inside a longer word and
 * `\bgyógyít\b` would misbehave on the very stems it is meant to catch.
 * `tegezoRule.ts` documents the same trap after it bit this suite.
 */
const HUN = "a-záéíóöőúüű";

/**
 * Stems that turn a co-occurrence into a cause. Inflected forms are caught by
 * the trailing character class, so `okoz` also rejects `okozza` and `okozott`
 * while the leading lookaround keeps it out of unrelated words.
 *
 * WHAT THIS RULE IS FOR, and what it is not for. It guards the sentences THIS
 * MODULE composes out of the reader's own data. It is deliberately not a
 * repo-wide writing rule, and it must not become one — checked against the 158
 * strings of shipped Hungarian content it fires once, on `ed-alvas`: "A kevés
 * alvás nemcsak fáradtságot okoz." That is a statement of physiology about
 * sleep in general, not a claim that something in this reader's journal caused
 * something, and the distinction is the whole point of the rule. General
 * health education legitimately contains causal sentences; a personal-data
 * insight must not.
 *
 * It is also blunt by design, and that is the safe direction: `fejlesztő`,
 * `fejlesztés` and `okozat` all trip it, because matching a stem is not the same
 * as reading the sentence. A guard that under-flags would let a real causal
 * claim through, and one that over-flags only costs a rewording. The content
 * modules have their own, narrower rules for this reason —
 * `articleBlocklist.ts` for the medical vocabulary, `tegezoRule.ts` for register.
 */
const CAUSAL_STEMS = ["okoz", "emiatt", "miatt", "amiatt", "azért", "eredménye", "fejleszt", "gyógyít"];

export const CAUSAL_LANGUAGE = new RegExp(
  `(?<![${HUN}])(?:${CAUSAL_STEMS.join("|")})[${HUN}]*`,
  "i",
);

/** The offending fragment, or null. Exported so the test can name it. */
export function causalHit(text: string): string | null {
  return CAUSAL_LANGUAGE.exec(text)?.[0] ?? null;
}

/* -------------------------------------------------------------- small maths */

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

const moodOf = (e: Entry): number => (e.mood as number);

/** "1,8" — Hungarian decimal comma, one place, never "-0,0". */
function formatDelta(n: number): string {
  return Math.abs(n).toFixed(1).replace(".", ",");
}

/* ------------------------------------------------------------------ engines */

/**
 * Activity → mood. DELEGATES to `tagCorrelations`; the arithmetic is not
 * repeated here on purpose. Only a tag that moved the average by at least five
 * points is worth a sentence, and at least three days must carry it.
 */
function activityInsight(entries: Entry[]): PatternInsight | null {
  const stats = tagCorrelations(entries).filter((s) => Math.abs(s.delta) >= 5 && s.count >= MIN_PER_SIDE);
  if (stats.length === 0) return null;
  const best = stats[0]!;
  const direction = best.delta > 0 ? "magasabb" : "alacsonyabb";
  return {
    id: "pattern-activity",
    text: `A(z) „${best.tag}” napjaidon ${formatDelta(best.delta)} ponttal ${direction} volt a hangulatod, mint más napokon.`,
    confidence: confidenceFor(entries.length),
    sample: best.count,
  };
}

/**
 * Sleep → mood and stress. New: sleep is recorded on every entry and has never
 * been read by any analysis.
 *
 * `sleepHours` lives under `vitals` (`Entry.vitals.sleepHours`, types.ts), NOT
 * flat on the entry. Read flat it is `undefined` on every real record, so this
 * engine would have returned `null` forever in the app while passing every test
 * written against the same wrong shape — the typechecker caught it. `null` means
 * "not recorded", and it is excluded rather than counted as zero hours: a night
 * nobody logged is not a night of no sleep.
 */
function sleepInsight(entries: Entry[]): PatternInsight | null {
  const withSleep = entries.filter((e) => e.vitals?.sleepHours != null);
  const short = withSleep.filter((e) => e.vitals.sleepHours! < SHORT_SLEEP_HOURS);
  const rest = withSleep.filter((e) => e.vitals.sleepHours! >= SHORT_SLEEP_HOURS);
  if (short.length < MIN_PER_SIDE || rest.length < MIN_PER_SIDE) return null;

  const moodDelta = mean(short.map(moodOf)) - mean(rest.map(moodOf));
  const stressDelta = mean(short.map((e) => e.stress)) - mean(rest.map((e) => e.stress));
  if (Math.abs(moodDelta) < 0.2 && Math.abs(stressDelta) < 0.2) return null;

  const parts: string[] = [];
  if (Math.abs(moodDelta) >= 0.2) {
    parts.push(`${formatDelta(moodDelta)} ponttal ${moodDelta > 0 ? "magasabb" : "alacsonyabb"} volt a hangulatod`);
  }
  if (Math.abs(stressDelta) >= 0.2) {
    parts.push(`${formatDelta(stressDelta)} ponttal ${stressDelta > 0 ? "magasabb" : "alacsonyabb"} volt a stresszed`);
  }
  return {
    id: "pattern-sleep",
    text: `A ${SHORT_SLEEP_HOURS} óránál rövidebb alvás napjain együtt járt velük: ${parts.join(", ")}.`,
    confidence: confidenceFor(entries.length),
    sample: short.length + rest.length,
  };
}

/**
 * Weekday → mood. New. Needs at least three entries on the SAME weekday, which
 * is why this one stays quiet for a long time and then is worth saying: two
 * Mondays a month is a coincidence, twelve is a week.
 */
function weekdayInsight(entries: Entry[]): PatternInsight | null {
  const buckets: number[][] = Array.from({ length: 7 }, () => []);
  for (const e of entries) {
    // fromISODate is local, matching startOfWeek, so a day never lands in two
    // buckets because of a timezone offset.
    buckets[(fromISODate(e.date).getDay() + 6) % 7]!.push(moodOf(e));
  }
  const ranked = buckets
    .map((values, index) => ({ index, mean: mean(values), n: values.length }))
    .filter((b) => b.n >= MIN_PER_SIDE)
    .sort((a, b) => b.mean - a.mean);

  if (ranked.length < 2) return null;
  const best = ranked[0]!;
  const worst = ranked[ranked.length - 1]!;
  if (best.index === worst.index) return null;
  // Without this the engine speaks on every dataset it is given, including one
  // whose spread is indistinguishable from noise. See MIN_WEEKDAY_SPREAD.
  if (best.mean - worst.mean < MIN_WEEKDAY_SPREAD) return null;

  return {
    id: "pattern-weekday",
    text: `A ${WEEKDAYS_ADJECTIVAL[best.index]} napokon a legjobb a hangulatod (${best.mean.toFixed(1)}), a ${WEEKDAYS_ADJECTIVAL[worst.index]} napokon a leggyengébb (${worst.mean.toFixed(1)}).`,
    confidence: confidenceFor(entries.length),
    sample: best.n + worst.n,
  };
}

/**
 * Stress → mood. New, and different from what `personalInsights` already says:
 * that one reports a stress LEVEL ("your average stress is 7.4"), this one
 * reports a mood DIFFERENCE between high- and low-stress days.
 */
function stressInsight(entries: Entry[]): PatternInsight | null {
  const high = entries.filter((e) => e.stress >= 7);
  const low = entries.filter((e) => e.stress <= 4);
  if (high.length < MIN_PER_SIDE || low.length < MIN_PER_SIDE) return null;

  const delta = mean(high.map(moodOf)) - mean(low.map(moodOf));
  if (Math.abs(delta) < 0.2) return null;

  return {
    id: "pattern-stress",
    text: `A 7-es vagy magasabb stresszű napokon ${formatDelta(delta)} ponttal ${delta > 0 ? "magasabb" : "alacsonyabb"} volt a hangulatod, mint a 4-es vagy alacsonyabb stresszű napokon.`,
    confidence: confidenceFor(entries.length),
    sample: high.length + low.length,
  };
}

/* ------------------------------------------------------------------ the card */

/**
 * Every insight the dataset supports, strongest delta first, capped at ten.
 *
 * Below `MIN_ENTRIES` the answer is an EMPTY ARRAY and the card shows its own
 * empty state — not an apology, and not a "keep going" that implies progress
 * toward something. The reader is told what is missing and nothing more.
 */
export function generateInsights(entries: Entry[]): PatternInsight[] {
  const usable = entries.filter((e) => e.mood !== undefined && e.mood !== null);
  if (usable.length < MIN_ENTRIES) return [];

  const insights = [activityInsight(usable), sleepInsight(usable), weekdayInsight(usable), stressInsight(usable)]
    .filter((i): i is PatternInsight => i !== null);

  return insights.slice(0, 10);
}

/** The empty-state copy, exported so the card and its test cannot disagree. */
export const INSUFFICIENT_DATA_TITLE = "Még nincs elég adat";
export const INSUFFICIENT_DATA_HINT = `Ehhez legalább ${MIN_ENTRIES} bejegyzés kell.`;