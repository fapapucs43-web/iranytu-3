/**
 * Round 15's sweep of `lib/icon-policy.ts`, pinned as a contract.
 *
 * WHY THIS FILE EXISTS AFTER THE SWEEP LANDED
 * Round 15 moved the 48 chrome reasons and the four group headings into the
 * Hungarian catalogue — 50 keys, 52 `t()` calls, because `ChevronRight` shares
 * `ChevronDown`'s sentence and `Radio` shares `Ban`'s. Nothing before this file
 * pinned any of it: `tests/batch7f.test.ts` pins what the reasons SAY (non-
 * empty, distinct, rendered), and the sweep-list guard regenerates a document
 * that by its own admission "cannot say whether [the `.ts` rounds] are done",
 * because its walk is `.tsx`-only. So the sweep could be quietly reverted —
 * the reasons hardcoded back, the keys left dead in the catalogue — and every
 * existing guard would stay green. These tests are the part of the sweep that
 * makes reverting it a red build.
 *
 * THREE CLAIMS, EACH INDEPENDENTLY FALSIFIABLE:
 *  1. every `iconPolicy.*` key in the catalogue is used by the module, and
 *     every key the module uses exists — so no dead key and no silent fallback
 *     (`t()` answers the key itself when both catalogue and locale miss it,
 *     which would render the literal "iconPolicy.reason.plus" on screen);
 *  2. every reason and every group label the module exports is byte-identical
 *     to a catalogue value — the reader sees exactly what the catalogue holds;
 *  3. no raw `reason: "…"` literal survives in the source — a new chrome icon
 *     added with a hardcoded Hungarian sentence fails here, not in review.
 *
 * NO jsdom and no rendering: the module's arrays are computed at import time
 * from `t()`, so asserting on them IS asserting on what Settings renders.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { CHROME_GROUP_LABEL, CHROME_ICONS } from "../src/lib/icon-policy";
import { t, translationKeys } from "../src/lib/i18n";

const source = readFileSync(new URL("../src/lib/icon-policy.ts", import.meta.url), "utf8");

/** Every key the module reaches through `t()`, as written in the source. */
const usedKeys = new Set([...source.matchAll(/t\("([^"]+)"\)/g)].map((m) => m[1]!));

/** The catalogue's half of the contract: every key under the `iconPolicy.` namespace. */
const catalogueKeys = new Set(translationKeys().filter((k) => k.startsWith("iconPolicy.")));

/** The catalogue's values for those keys — what the reader must see. */
const catalogueValues = new Set(catalogueKeys.values().toArray().map((k) => t(k as never)));

describe("round 15 — every iconPolicy key is used, and nothing used is missing", () => {
  test("the catalogue holds at least the 48 reasons and 4 group headings", () => {
    // 50 is the floor, not the ceiling: a future group or shared reason adds a
    // key without breaking this, while deleting any of the 50 breaks the next
    // test — so the pair tolerates growth and forbids loss.
    expect(catalogueKeys.size).toBeGreaterThanOrEqual(50);
  });

  test("every key the module uses exists in the catalogue — no silent key fallback", () => {
    const unknown = [...usedKeys].filter((k) => !translationKeys().includes(k as never));
    expect(unknown, `t() would render these keys literally: ${unknown.join(", ")}`).toEqual([]);
  });

  test("every catalogue key is used by the module — no dead key", () => {
    const dead = [...catalogueKeys].filter((k) => !usedKeys.has(k));
    expect(dead, `keys nothing reaches: ${dead.join(", ")}`).toEqual([]);
  });
});

describe("round 15 — what the module exports is what the catalogue holds", () => {
  test("all 48 reasons are non-empty and byte-identical to catalogue values", () => {
    expect(CHROME_ICONS.length).toBe(48);
    for (const c of CHROME_ICONS) {
      expect(c.reason.length, `${c.name} has an empty reason`).toBeGreaterThan(0);
      expect(
        catalogueValues.has(c.reason),
        `${c.name}: reason is not any iconPolicy catalogue value — a raw literal survived`,
      ).toBe(true);
    }
  });

  test("the four group labels are byte-identical to catalogue values too", () => {
    for (const group of Object.keys(CHROME_GROUP_LABEL) as (keyof typeof CHROME_GROUP_LABEL)[]) {
      const label = CHROME_GROUP_LABEL[group];
      expect(label.length, `${group} has an empty label`).toBeGreaterThan(0);
      expect(catalogueValues.has(label), `${group}: label is not a catalogue value`).toBe(true);
    }
  });
});

describe("round 15 — the sweep cannot be quietly reverted", () => {
  test("no raw reason literal survives in the source", () => {
    // `reason: t("…")` is the swept shape; `reason: "…"` is the revert. The
    // regex cannot hit a comment: the type declares `reason: string;` and no
    // prose in the file writes `reason:` followed by a quote.
    expect(/reason:\s*"/.test(source), "a reason is hardcoded again").toBe(false);
  });

  test("the group labels are not hardcoded back either", () => {
    // The pre-sweep shape was `Gombok: "Gombok"` — a literal whose key it once
    // named. Keyed by the group name, which is an ID, this stays false however
    // the labels are translated.
    expect(/"[^"]*":\s*"/.test(source.replace(/t\("[^"]+"\)/g, 't("")')), "a label is hardcoded again").toBe(false);
  });
});
