/**
 * Batch A — Recording 2.0: the context panel's three dimensions.
 *
 * Each dimension is a fixed registry of icon-able options; an entry stores
 * the LABELS the user selected (Hungarian, as displayed) in `Entry.context`.
 * Labels are the storage unit for the same reason the emotion step stores
 * its label: exports and PDFs read like the UI, and the id exists so tests
 * can pin the spec's canonical list without coupling to translation edits.
 */
import type { EntryContext } from "../types";

export type ContextOption = {
  /** Pinned, spec-canonical word; stable across translations. */
  id: string;
  /** What the chip shows (Hungarian). */
  label: string;
};

export const CONTEXT_OPTIONS: {
  withWhom: ContextOption[];
  where: ContextOption[];
  doing: ContextOption[];
} = {
  withWhom: [
    { id: "alone", label: "Egyedül" },
    { id: "family", label: "Család" },
    { id: "friends", label: "Barátok" },
    { id: "colleagues", label: "Kollégák" },
    { id: "strangers", label: "Idegenek" },
    { id: "partner", label: "Párkapcsolat" },
  ],
  where: [
    { id: "home", label: "Otthon" },
    { id: "work", label: "Munka" },
    { id: "school", label: "Iskola" },
    { id: "outdoors", label: "Szabadtér" },
    { id: "commuting", label: "Ingázás" },
    { id: "shop", label: "Bolt" },
  ],
  doing: [
    { id: "resting", label: "Pihenés" },
    { id: "working", label: "Dolgozás" },
    { id: "sports", label: "Sport" },
    { id: "socializing", label: "Társasági" },
    { id: "sleeping", label: "Alvás" },
    { id: "eating", label: "Étkezés" },
  ],
};

/** The three dimension keys, in panel order. */
export const CONTEXT_DIMENSIONS = ["withWhom", "where", "doing"] as const;
export type ContextDimension = (typeof CONTEXT_DIMENSIONS)[number];

/** Hungarian headings for the three dimensions. */
export const CONTEXT_DIMENSION_LABELS: Record<ContextDimension, string> = {
  withWhom: "Kivel?",
  where: "Hol?",
  doing: "Mit csináltál?",
};

export function contextOptionsFor(dimension: ContextDimension): ContextOption[] {
  return CONTEXT_OPTIONS[dimension];
}

/** Hungarian labels for one dimension's ids, skipping unknown ids. */
export function contextLabelsFor(dimension: ContextDimension, ids: string[]): string[] {
  const byId = new Map(CONTEXT_OPTIONS[dimension].map((o) => [o.id, o.label]));
  return ids
    .map((id) => (typeof id === "string" ? byId.get(id) ?? (id.trim() || null) : null))
    .filter((v): v is string => v !== null);
}

/** True when `context` carries at least one selection in any dimension. */
export function contextHasSelection(context: EntryContext | undefined): boolean {
  if (!context) return false;
  return CONTEXT_DIMENSIONS.some((d) => (context[d] ?? []).length > 0);
}
