/**
 * Phase 2 (AI depth) — the crisis guard: the keyword list in front of every
 * AI call, and the reply it builds from the app's own resource list.
 *
 * WHY THIS FILE IS PURE
 * `lib/crisisGuard.ts` reads two catalogues (its own signals and
 * `assessments.RESOURCES`) and formats one of them; it touches no storage, no
 * DOM and no network, so the assertions run without jsdom — the same bargain
 * `tests/lib/support-wall.test.ts` makes. The guard is safety-relevant, so
 * the assertions that matter are the ones a keyword list usually fails
 * silently: a signal that stopped matching, an ordinary-grief false positive
 * that trains the reader to ignore the line, or a reply that lost a number
 * because a second list appeared somewhere else.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * The engine-side gate (crisis before key, before host, before model) is an
 * ordering promise about `lib/ai.ts` and lives with the engine's behaviour in
 * `tests/lib/ai-chat.test.ts`. This file pins the filter and the formatted
 * reply, nothing more.
 */
import { describe, expect, test } from "bun:test";
import { RESOURCES } from "../../src/lib/assessments";
import { crisisReply, hasCrisisSignal } from "../../src/lib/crisisGuard";
import { t } from "../../src/lib/i18n";

/* ------------------------- the Hungarian stems ------------------------ */

describe("hasCrisisSignal — Hungarian", () => {
  test.each([
    "Ma az öngyilkosságon gondolkodom.",
    "ÖNGYILKOS lennék, ha így folytatnám.",
    "Nem akarok többé élni.",
    "szeretnék meghalni",
    "Véget vetnék az életemnek.",
    "Megölöm magamat.",
    "Meg akarok halni.",
    "Önkárosításról olvastam.",
    "Bántani akarom magam.",
    "Kárt teszek magamban.",
    // The stem rule, accepted knowingly: prevention copy carrying `öngyilk`
    // also matches. A false positive that still points at help is the cost
    // of a stem that cannot be prefixed away — asserting it HERE is what
    // keeps the tradeoff deliberate instead of accidental.
    "Öngyilkosság-megelőzési konferencia jön jövőre.",
  ])("signal: %s", (text) => {
    expect(hasCrisisSignal(text)).toBe(true);
  });

  test.each([
    "",
    "   ",
    "Meghalt a kutyám, és nagyon fáj.",
    "A regényben egy gyilkosság volt a csúcspont.",
    "Inkább a történelem érdekel, mint a bűnügyi regények.",
  ])("no signal: %s", (text) => {
    // The crying-wolf line: bare death and bare murder must not match, or
    // every bereavement note in the journal would fire the guard.
    expect(hasCrisisSignal(text)).toBe(false);
  });
});

/* -------------------------- the English phrases ----------------------- */

describe("hasCrisisSignal — English", () => {
  test.each([
    "I want to die.",
    "I wish to die.",
    "Sometimes I want to kill myself.",
    "This is a suicide note in the making.",
    "The self-harm stopped after therapy.",
    "I will end my life if this continues.",
    "I'd rather be dead.",
    "Rather be dead than alone.",
  ])("signal: %s", (text) => {
    expect(hasCrisisSignal(text)).toBe(true);
  });

  test.each([
    "Kill the lights, please.",
    "I could die of laughter.",
    "Die Hitze war unerträglich.",
    "self-care is important",
    "the story ends badly",
  ])("no signal: %s", (text) => {
    expect(hasCrisisSignal(text)).toBe(false);
  });
});

/* --------------------------- the formatted reply ---------------------- */

describe("crisisReply", () => {
  test("opens with the catalogue sentence, not a sentence of its own", () => {
    expect(crisisReply().startsWith(t("ai.crisisReply"))).toBe(true);
  });

  test("names every phone number the shared resource list carries", () => {
    // The one-source rule, asserted from the consumer side: if RESOURCES
    // grows a number and this formatter drops it, the reply is where a
    // reader in crisis would look first.
    const reply = crisisReply();
    for (const r of RESOURCES) {
      if (r.phone) expect(reply).toContain(r.phone);
      expect(reply).toContain(r.label);
    }
    expect(reply).toContain("116-123");
    expect(reply).toContain("112");
    expect(reply).toContain("116-111");
  });

  test("is a sentence plus bullet lines, never a paragraph", () => {
    const lines = crisisReply().split("\n");
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.slice(1).every((l) => l.startsWith("• "))).toBe(true);
  });
});
