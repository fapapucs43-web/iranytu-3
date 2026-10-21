/**
 * Section order: which of a tab's cards comes first.
 *
 * This is `orderedTabs` (lib/navVisibility) applied to a tab's own sections,
 * and it follows that function rather than inventing a second answer to "what
 * does a tab draw when the blob says anything else?". The five rules are the
 * same five rules, on purpose — a reader who knows one knows both.
 *
 * The one deliberate difference is where the DEFAULT comes from. The bar takes
 * its defaults from the `NAV_ICONS` registry, which this module can see, so
 * `orderedTabs` reads them itself. A view's sections are owned by the view:
 * putting forty-odd section names in a lib file would be a second list to keep
 * true, and the view would end up stating its own sections twice. So the
 * defaults arrive as an argument, this module owns the RULE and not the
 * CONTENT, and it does not take a `TabId` — the caller reads
 * `settings.sectionOrder[tab]` and hands both in.
 *
 * PURE, TOTAL, NEVER THROWS — same contract as `orderedTabs`, for the same
 * reason: the stored value is user-shaped data that crossed a JSON boundary and
 * may have been hand-edited.
 */

import type { SectionId } from "../types";

/**
 * The sections in display order: the user's arrangement, or the default.
 *
 *  - absent / not an array        → the view's own default order, untouched;
 *  - unknown ids                   → dropped: there is no such section to draw;
 *  - duplicates                    → collapsed to the first occurrence;
 *  - missing ids                   → appended at the end, in default order.
 *
 * The output is therefore ALWAYS a permutation of `defaults` — never a shorter
 * list, never a repeated card. A card cannot go missing because a stored id was
 * renamed, and cannot appear twice because a hand-edited blob listed it twice.
 */
export function orderSections(
  defaults: readonly SectionId[],
  stored: unknown,
): SectionId[] {
  const base = [...defaults];
  if (!Array.isArray(stored)) return base;

  const seen = new Set<SectionId>();
  const known: SectionId[] = [];
  for (const raw of stored) {
    const id = base.find((d) => d === raw);
    if (id && !seen.has(id)) {
      seen.add(id);
      known.push(id);
    }
  }
  for (const id of base) if (!seen.has(id)) known.push(id);
  return known;
}

/**
 * Swap one row with its neighbour, or nothing at all.
 *
 * A no-op returns THE SAME ARRAY REFERENCE rather than an equal copy, so a
 * caller that stores what it gets back writes nothing when the arrow was
 * already at the end of the list. `moveTab` in SettingsView gets that for free
 * because it re-normalises; a caller that does not would write on every press
 * of an edge button, and an identity check is cheaper than being sure.
 */
export function moveSection(
  order: readonly SectionId[],
  i: number,
  move: -1 | 1,
): readonly SectionId[] {
  const j = i + move;
  if (j < 0 || j >= order.length) return order;
  const next = [...order];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/**
 * Do two arrangements say the same thing?
 *
 * Element-wise, so an equal copy and the original are the same arrangement even
 * though they are not the same array. This is what the reset button disables
 * itself on: a reset that is already in effect should not be offered.
 */
export function sameOrder(
  a: readonly SectionId[],
  b: readonly SectionId[],
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((id, i) => id === b[i]);
}

/**
 * The map with ONE tab's arrangement taken out of it.
 *
 * The other half of `orderSections`: that one repairs a stored arrangement, this
 * one forgets one. Deleting the key rather than writing the default order back
 * is deliberate on both counts — it is what makes a reset button disable itself
 * afterwards (no stored order means the panel is already showing the defaults,
 * and `sameOrder` has nothing to undo), and it drops whatever was in the slot
 * instead of normalising junk into something that still looks user-chosen.
 *
 * Other tabs' arrangements are copied through untouched, and the input is never
 * mutated: `useSectionOrder` builds the whole `settings` object around what
 * this returns.
 *
 * NEVER THROWS, like the rest of the module — a hand-edited blob that is not an
 * object is not a reason to fail a render. It reads as "nothing is stored".
 */
export function withoutTabOrder<K extends string>(
  stored: unknown,
  tab: K,
): Partial<Record<K, SectionId[]>> {
  const source =
    stored && typeof stored === "object" && !Array.isArray(stored)
      ? (stored as Partial<Record<K, SectionId[]>>)
      : {};
  const rest: Partial<Record<K, SectionId[]>> = { ...source };
  delete rest[tab];
  return rest;
}