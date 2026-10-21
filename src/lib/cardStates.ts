/**
 * Batch 11, commit 1 — where "collapsed" lives.
 *
 * ONE KEY, NOT N
 * The obvious implementation gives every collapsible card its own
 * `belso-iranytu:<id>` key. That is N keys to read on boot, N entries in a
 * backup, and N chances for two writers to disagree. This module keeps the
 * whole map under ONE key — `belso-iranytu:cardStates`, `{ id: collapsed }` —
 * which is read once, lazily, on the first card that asks, and written
 * atomically on every toggle.
 *
 * THE CACHE IS THE LAZY READ
 * A module-level variable is the memo: the first card that calls
 * `loadCardStates()` pays the `JSON.parse`, every later card gets the cached
 * map. There is no subscription and no invalidation on purpose — collapse
 * state is view state, not data; the app never writes it anywhere else, and
 * the page reload that would make the cache stale is the same reload that
 * re-reads it. `resetCardStatesForTests` is the one sanctioned way to clear
 * it mid-process, for the same reason `store.ts` has one.
 *
 * TOLERANT BY CONSTRUCTION
 * A hand-edited or future-shaped blob must never crash the app on boot. Every
 * read goes through `parseCardStates`, which accepts only a flat
 * string→boolean record and keeps the valid entries of anything else.
 */
import type { TrackerValue } from "../types";
import { describeValue } from "./trackerDisplay";
import type { MergedTrackerDef } from "./trackers";
import { t } from "./i18n";

/** The one key. House convention: every app-owned key starts `belso-iranytu:`. */
export const CARD_STATES_KEY = "belso-iranytu:cardStates";

/** The stored shape: card id → collapsed. */
export type CardStateMap = Record<string, boolean>;

let cache: CardStateMap | null = null;

/** The raw string → a valid map. Anything else degrades to `{}`. */
export function parseCardStates(raw: string | null): CardStateMap {
  if (raw === null || raw.trim() === "") return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const out: CardStateMap = {};
  for (const [id, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v === "boolean") out[id] = v;
  }
  return out;
}

/** Read the map (lazily, once per process) — never throws, never returns null. */
export function loadCardStates(): CardStateMap {
  if (cache) return cache;
  try {
    cache = parseCardStates(localStorage.getItem(CARD_STATES_KEY));
  } catch {
    cache = {};
  }
  return cache;
}

/**
 * Write one card's collapsed state, atomically, and keep the cache warm.
 * Returns the map actually stored, so a test can assert the round-trip.
 */
export function setCardCollapsed(id: string, collapsed: boolean): CardStateMap {
  const map = { ...loadCardStates(), [id]: collapsed };
  cache = map;
  try {
    localStorage.setItem(CARD_STATES_KEY, JSON.stringify(map));
  } catch {
    // Quota or a private-mode refusal: the UI still works, the state just
    // does not survive a reload. Exactly the trade the app makes everywhere.
  }
  return map;
}

/**
 * Test seam: forget the module cache. The STORED blob is deliberately left
 * alone — "reload the page" is a new module graph reading the SAME storage,
 * so the round-trip a test wants is (write → forget cache → read back).
 * Deleting the blob here would fake a factory reset, which is a different
 * test. Clear `backing` in the shim for that.
 */
export function resetCardStatesForTests(): void {
  cache = null;
}

/**
 * The production reset: forget the cache AND delete the blob.
 *
 * `resetCardStatesForTests` deliberately leaves the stored map alone, because a
 * test wants the write → reload round trip. "Minden adat törlése" wants the
 * opposite, and collapse state is a record of what this device has already
 * shown the reader even though it is not personal data — so the wipe clears it
 * with everything else. Phase 5's audit found the key was the one the chain
 * forgot: the map survived a delete-everything, and the reader's next visit to
 * Settings came back in the same open/collapsed arrangement. The audit is
 * `docs/collapsible-audit.md`; the call site is the confirm handler in
 * `views/SettingsView.tsx`.
 */
export function resetCardStates(): void {
  cache = null;
  try {
    localStorage.removeItem(CARD_STATES_KEY);
  } catch {
    // No storage: nothing was stored, so there is nothing to remove.
  }
}

/* ----------------------------- summaries ----------------------------- */

/**
 * What a collapsed tracker card says when nothing was recorded today.
 *
 * Round 18 moved the sentence into the catalogue and left the em dash where it
 * was: the card's collapsed line is a dash and a phrase, and the dash is what a
 * reader's eye lands on in a column of them. It is part of the value rather than
 * glued on in the component so the two cannot drift.
 */
export const NO_DATA_SUMMARY = t("cardStates.noData");

/**
 * The one-line summary a collapsed tracker-group card shows.
 *
 * Reuses `describeValue` — the same function the entry detail and the PDF
 * read — because a summary that disagrees with the journal is worse than no
 * summary. The head is described first; when it is blank, the first recorded
 * child speaks; when nothing in the group is recorded, the card says so
 * instead of drawing a dash that would claim a zero.
 */
export function trackerGroupSummary(
  head: MergedTrackerDef,
  members: { def: MergedTrackerDef; value: TrackerValue }[],
): string {
  const describeParts = (def: MergedTrackerDef, value: TrackerValue): string[] => {
    const shown = describeValue(def, value);
    if (!shown) return [];
    return shown.kind === "flags" ? shown.labels : [shown.text];
  };

  const headValue = members.find((m) => m.def.id === head.id)?.value;
  const parts: string[] = [];
  if (headValue) parts.push(...describeParts(head, headValue));
  for (const m of members) {
    if (m.def.id === head.id) continue;
    parts.push(...describeParts(m.def, m.value));
  }
  if (parts.length === 0) return NO_DATA_SUMMARY;
  return parts.join(" · ");
}
