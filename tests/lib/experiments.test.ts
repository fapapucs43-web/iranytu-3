/**
 * Batch 13, commit 7 — self-experiments.
 *
 * The centre of gravity here is the two GUARDS, because they are the feature
 * and the rest is a form:
 *
 *   THE THREE-DAY WINDOW. `endDate` is computed from the start date and is
 *   never an argument. That is asserted structurally — there is no `endDate`
 *   parameter to pass — and then behaviourally, by checking that a rating on
 *   day four is refused. A store that merely computed it correctly but still
 *   accepted a longer window would pass the first and fail the second.
 *
 *   AT MOST ONE AT A TIME. `startExperiment` returns null and writes nothing
 *   while another is live. This is asserted by counting the stored records
 *   after the refused call, not just by the return value: a function that
 *   returns null AFTER writing is a different bug, and it is the one that
 *   would leave a reader with two overlapping experiments and no idea why.
 *
 * The window is tested across a month boundary and a leap day, because
 * `addDays` goes through `Date.setDate` and those are the two places an
 * off-by-one hides.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { addDays } from "../../src/lib/dates";
import {
  EXPERIMENT_DAYS,
  EXPERIMENT_LIMIT,
  RATING_MAX,
  RATING_MIN,
  STORAGE_KEY,
  abandonExperiment,
  activeExperiment,
  averageRating,
  canRate,
  checkOn,
  dayNumber,
  deleteExperiment,
  finishExperiment,
  getExperiments,
  isLive,
  rateExperiment,
  resetExperiments,
  sanitizeExperiment,
  startExperiment,
  subscribeExperiments,
} from "../../src/lib/experiments";

const D1 = "2026-10-05";
const D2 = "2026-10-06";
const D3 = "2026-10-07";
const D4 = "2026-10-08";

beforeEach(() => resetExperiments());
afterEach(() => resetExperiments());

describe("the shape of the store", () => {
  test("it has its own key and starts empty", () => {
    expect(STORAGE_KEY).toBe("belso-iranytu-experiments-v1");
    expect(getExperiments()).toEqual([]);
  });

  test("subscribe returns an unsubscribe that actually unsubscribes", () => {
    let calls = 0;
    const off = subscribeExperiments(() => {
      calls += 1;
    });
    startExperiment({ what: "x", date: D1 });
    const afterStart = calls;
    off();
    startExperiment({ what: "y", date: D1 });
    expect(calls).toBe(afterStart);
  });
});

describe("the three-day guard", () => {
  test("the window is exactly three days", () => {
    expect(EXPERIMENT_DAYS).toBe(3);
    const exp = startExperiment({ what: "korábban feküdöm", date: D1 })!;
    expect(exp.startDate).toBe(D1);
    expect(exp.endDate).toBe(D3);
    expect(isLive(exp, D1)).toBe(true);
    expect(isLive(exp, D3)).toBe(true);
    expect(isLive(exp, D4)).toBe(false);
  });

  test("the day counter runs 1..3 and stops", () => {
    const exp = startExperiment({ what: "x", date: D1 })!;
    expect(dayNumber(exp, D1)).toBe(1);
    expect(dayNumber(exp, D2)).toBe(2);
    expect(dayNumber(exp, D3)).toBe(3);
    expect(dayNumber(exp, D4)).toBeNull();
  });

  test("there is no endDate parameter to widen the window", () => {
    // Structural, not behavioural: the guard is that the caller cannot express
    // a longer experiment at all.
    expect(startExperiment.length).toBe(1);
  });

  test("a rating on day four is refused", () => {
    const exp = startExperiment({ what: "x", date: D1 })!;
    expect(rateExperiment(exp.id, D4, 7)).toBe(false);
    expect(checkOn(exp, D4)).toBeNull();
    expect(exp.checks).toEqual([]);
  });

  test("a rating before the start is refused", () => {
    const exp = startExperiment({ what: "x", date: D1 })!;
    expect(rateExperiment(exp.id, "2026-10-01", 7)).toBe(false);
  });

  test("the window survives a month boundary and a leap day", () => {
    const month = startExperiment({ what: "x", date: "2026-10-30" })!;
    expect(month.endDate).toBe("2026-11-01");
    // 2028 is a leap year, so +2 lands ON the 29th. This is the case where a
    // window computed in milliseconds rather than through `addDays` drifts.
    const leap = startExperiment({ what: "y", date: "2028-02-27" })!;
    expect(leap.endDate).toBe("2028-02-29");
  });
});

describe("at most one at a time", () => {
  test("the limit is one", () => {
    expect(EXPERIMENT_LIMIT).toBe(1);
  });

  test("a second start is refused AND writes nothing", () => {
    const first = startExperiment({ what: "első", date: D1 })!;
    const second = startExperiment({ what: "második", date: D1 });
    expect(second).toBeNull();
    expect(getExperiments().length).toBe(1);
    expect(getExperiments()[0]!.id).toBe(first.id);
  });

  test("the first one is still live after the refusal", () => {
    startExperiment({ what: "első", date: D1 });
    startExperiment({ what: "második", date: D1 });
    const live = activeExperiment(D2);
    expect(live).not.toBeNull();
    expect(live!.what).toBe("első");
  });

  test("a new one is allowed once the window has passed", () => {
    startExperiment({ what: "első", date: D1 });
    expect(startExperiment({ what: "második", date: D4 })).not.toBeNull();
    expect(getExperiments().length).toBe(2);
  });

  test("abandoning frees the slot immediately", () => {
    const first = startExperiment({ what: "első", date: D1 })!;
    expect(abandonExperiment(first.id)).toBe(true);
    expect(startExperiment({ what: "második", date: D1 })).not.toBeNull();
  });

  test("finishing frees the slot immediately", () => {
    const first = startExperiment({ what: "első", date: D1 })!;
    expect(finishExperiment(first.id, true, " jó")).toBe(true);
    expect(startExperiment({ what: "második", date: D1 })).not.toBeNull();
  });
});

describe("rating", () => {
  test("one rating per day", () => {
    const exp = startExperiment({ what: "x", date: D1 })!;
    expect(canRate(exp, D1)).toBe(true);
    expect(rateExperiment(exp.id, D1, 5, "első")).toBe(true);
    // Read the record back rather than reusing `exp`: `startExperiment` hands
    // back a snapshot, and every write replaces the stored array rather than
    // mutating it. `canRate` answers about the record it is GIVEN, so a stale
    // one gives a stale answer — the store is the only source of truth. See
    // the note on `canRate` in lib/experiments.
    const fresh = getExperiments()[0]!;
    expect(canRate(fresh, D1)).toBe(false);
    expect(rateExperiment(exp.id, D1, 9)).toBe(false);
    expect(getExperiments()[0]!.checks.length).toBe(1);
    expect(getExperiments()[0]!.checks[0]!.note).toBe("első");
  });

  test("a stale record reports stale answers, and nothing writes through it", () => {
    const stale = startExperiment({ what: "x", date: D1 })!;
    rateExperiment(stale.id, D1, 5, "");
    // The same question, asked of the pre-write snapshot and of the store.
    expect(canRate(stale, D1)).toBe(true);
    expect(canRate(getExperiments()[0]!, D1)).toBe(false);
  });

  test("the rating is clamped to the stated scale, not trusted", () => {
    const exp = startExperiment({ what: "x", date: D1 })!;
    rateExperiment(exp.id, D1, 999);
    expect(getExperiments()[0]!.checks[0]!.rating).toBe(RATING_MAX);
    rateExperiment(exp.id, D2, -5);
    expect(getExperiments()[0]!.checks[1]!.rating).toBe(RATING_MIN);
  });

  test("a malformed rating is coerced, not dropped — the day still counts", () => {
    // The reader pressed a slider; there is no such thing as a missing day
    // rating, so the worst case is a wrong one, and dropping the day would
    // quietly change the average.
    const exp = startExperiment({ what: "x", date: D1 })!;
    rateExperiment(exp.id, D1, Number.NaN);
    expect(getExperiments()[0]!.checks.length).toBe(1);
  });

  test("rating an unknown id is refused", () => {
    expect(rateExperiment("nope", D1, 5)).toBe(false);
  });

  test("the average is over the days actually rated", () => {
    const exp = startExperiment({ what: "x", date: D1 })!;
    expect(averageRating(exp)).toBeNull();
    rateExperiment(exp.id, D1, 4);
    rateExperiment(exp.id, D2, 6);
    expect(averageRating(getExperiments()[0]!)).toBe(5);
  });
});

describe("closing", () => {
  test("a verdict is written once and only once", () => {
    const exp = startExperiment({ what: "x", date: D1 })!;
    expect(finishExperiment(exp.id, true, " bevált")).toBe(true);
    expect(getExperiments()[0]!.verdict).toEqual({ worked: true, note: " bevált" });
    expect(finishExperiment(exp.id, false, " fordult")).toBe(false);
    expect(getExperiments()[0]!.verdict!.worked).toBe(true);
  });

  test("abandoning removes it rather than closing it", () => {
    const exp = startExperiment({ what: "x", date: D1 })!;
    expect(abandonExperiment(exp.id)).toBe(true);
    expect(getExperiments()).toEqual([]);
  });

  test("a finished experiment is no longer live", () => {
    const exp = startExperiment({ what: "x", date: D1 })!;
    finishExperiment(exp.id, true, "");
    expect(isLive(getExperiments()[0]!, D1)).toBe(false);
    expect(activeExperiment(D1)).toBeNull();
  });

  test("deleting from the history works and reports honestly", () => {
    const exp = startExperiment({ what: "x", date: D1 })!;
    finishExperiment(exp.id, true, "");
    expect(deleteExperiment(exp.id)).toBe(true);
    expect(deleteExperiment(exp.id)).toBe(false);
    expect(getExperiments()).toEqual([]);
  });
});

describe("what is accepted from storage", () => {
  test("a record with no text is refused", () => {
    expect(sanitizeExperiment({ id: "a", startDate: D1, endDate: D3, what: "  " })).toBeNull();
  });

  test("a record with a malformed date is refused", () => {
    expect(sanitizeExperiment({ id: "a", startDate: "05/10", endDate: D3, what: "x" })).toBeNull();
    expect(sanitizeExperiment({ id: "a", startDate: D1, endDate: "2026-10-08T00:00", what: "x" })).toBeNull();
  });

  test("a half-written verdict becomes null rather than a truthy lie", () => {
    const clean = sanitizeExperiment({
      id: "a",
      startDate: D1,
      endDate: D3,
      what: "x",
      verdict: { worked: "igen" },
    });
    expect(clean!.verdict).toBeNull();
  });

  test("a corrupt check is dropped and the rest survives", () => {
    const clean = sanitizeExperiment({
      id: "a",
      startDate: D1,
      endDate: D3,
      what: "x",
      checks: [{ date: "nope", rating: 5 }, { date: D2, rating: 8 }],
    });
    expect(clean!.checks.length).toBe(1);
    expect(clean!.checks[0]!.date).toBe(D2);
  });

  test("start refuses empty text without writing", () => {
    expect(startExperiment({ what: "   ", date: D1 })).toBeNull();
    expect(getExperiments()).toEqual([]);
  });
});

describe("the dates it depends on", () => {
  test("the window is addDays(start, DAYS - 1), not addDays(start, DAYS)", () => {
    // The inclusive-both-ends off-by-one, pinned where it would otherwise
    // hide. `addDays(start, 3)` is day FOUR, so an experiment written that way
    // is four days long while its own constant says three.
    expect(addDays(D1, EXPERIMENT_DAYS)).toBe(D4);
    expect(addDays(D1, EXPERIMENT_DAYS - 1)).toBe(D3);
    expect(startExperiment({ what: "x", date: D1 })!.endDate).toBe(D3);
  });
});