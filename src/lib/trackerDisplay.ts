/**
 * Tracker display rules (Batch 7h).
 *
 * WHY THIS FILE EXISTS AT ALL
 * Batch 7e gave the app eight trackers and, with them, six value kinds. Four
 * things could already read a value: the correlation grid counts samples, the
 * CSV exports and imports them, the store persists them, and the daily card
 * draws the inputs. Nothing rendered one. A step count was written, exported
 * and correlated, and never shown to the person who typed it.
 *
 * Two renderers now need to describe the same value — the entry detail and the
 * PDF report — and they do not want the same thing: one shows a single reading,
 * the other summarises thirty of them. So the SHARED half lives here, and it
 * is the half that can be wrong quietly: which values count as recorded, how a
 * group is put together, and what a number reads as. Those answers are
 * identical in both places, and a component that re-derives them will one day
 * disagree with the other.
 *
 * WHAT "RECORDED" MEANS, AND WHY IT IS NOT "THE TRACKER IS ENABLED"
 * The keys in `trackerValues` are written from `defaultTrackerState`, which
 * populates every ENABLED tracker — so their presence says what the settings
 * said that day, not what the user filled in. Reading the settings now, as the
 * daily card does, would show a tracker on an entry from a year before the user
 * had ever heard of it, and would hide a tracker they recorded and have since
 * switched off. Neither is true of the entry. So this module reads the entry
 * and nothing else.
 *
 * Each kind then has its own idea of a blank, taken from the registry rather
 * than invented here:
 *   number  `null` is the absent meaning — `trackers.ts` says so in its header,
 *           and `0` is a measurement somebody actually made.
 *   text    an empty string carries nothing.
 *   flags   no option set is no answer.
 *   select  `""` is the synthetic FIRST OPTION, a real answer with a real
 *           label. Treating it as blank would invent a category.
 *   checkbox and slider  both are always an answer. An unticked box is a "no",
 *           and the stored data cannot tell "ticked and left off" from "never
 *           touched" — so hiding it would hide a real no.
 */
import { groupHeadId, getTrackerDefs, type MergedTrackerDef } from "./trackers";
import { localeTag } from "./i18n";
import type { CustomTrackerDef } from "./customTrackers";
import type { Entry, TrackerValue } from "../types";

/** One recorded value and the definition that gives it a name. */
export type RecordedTracker = {
  def: MergedTrackerDef;
  value: TrackerValue;
};

/** The defs that were recorded on one entry, filed under their group head. */
export type RecordedGroup = {
  /** The head, for the group heading. Its own def when it is a singleton. */
  head: MergedTrackerDef;
  members: RecordedTracker[];
};

/** What a renderer should draw. Flags are separate because they are chips. */
export type FormattedValue =
  | { kind: "text"; text: string }
  | { kind: "flags"; labels: string[] };

/**
 * Numbers in the app's language: `7,5` and `10 000` in Hungarian, `7.5` and
 * `10,000` in English.
 *
 * The tag follows the locale in force, and that is a real part of the switch
 * rather than a flourish: `10 000` is what a Hungarian reader expects and what
 * an English one reads as a typo, and a translated screen still printing
 * Hungarian numbers is the same half-translated state as a translated month
 * name over Hungarian weekday initials.
 *
 * Built once, at import — a formatter is not React state, so the picker's
 * reload is what gives it the new locale. See `lib/i18n`'s header.
 */
const NUMBER_FORMAT = new Intl.NumberFormat(localeTag());

export function formatNumber(n: number): string {
  return NUMBER_FORMAT.format(n);
}

/**
 * Was anything actually recorded for this def?
 *
 * A value whose KIND disagrees with the def is not recorded, and is not
 * reinterpreted either — the same rule `sanitizeTrackerValue` applies on the
 * way in, applied here on the way out. Six kinds share one map, and guessing
 * which of them the author meant is how a stored entry gets quietly corrupted.
 */
export function isRecorded(def: MergedTrackerDef, value: TrackerValue): boolean {
  if (value.kind !== def.input.kind) return false;
  switch (def.input.kind) {
    case "checkbox":
    case "slider":
    case "select":
      return true;
    case "number":
      return (value as Extract<TrackerValue, { kind: "number" }>).value !== null;
    case "text":
      return (value as Extract<TrackerValue, { kind: "text" }>).value.trim() !== "";
    case "flags":
      return Object.values((value as Extract<TrackerValue, { kind: "flags" }>).value).some(
        (on) => on === true,
      );
  }
}

/**
 * The recorded defs on one entry, grouped, in REGISTRY ORDER.
 *
 * Registry order is the same order the daily card and the Settings list draw,
 * and it is why a head is always first in its own member list: the registry
 * declares heads before their children, and a test pins that. Nothing here
 * sorts, so nothing here can disagree with the card the user filled in.
 *
 * Custom trackers have no `group`, so `groupHeadId` makes each its own head
 * and it renders as a singleton. A user's own tracker is a real tracker and is
 * never dropped for not being in the built-in registry.
 */
export function recordedGroups(
  values: Entry["trackerValues"],
  defs: MergedTrackerDef[] = getTrackerDefs([]),
): RecordedGroup[] {
  const groups: RecordedGroup[] = [];
  const byHead = new Map<string, RecordedGroup>();
  for (const def of defs) {
    const value = values?.[def.id];
    if (value === undefined || !isRecorded(def, value)) continue;
    const headId = groupHeadId(def);
    let group = byHead.get(headId);
    if (!group) {
      group = { head: defs.find((d) => d.id === headId) ?? def, members: [] };
      byHead.set(headId, group);
      groups.push(group);
    }
    group.members.push({ def, value });
  }
  return groups;
}

/** The option's Hungarian label, or the raw id when the id is unknown. */
function selectLabel(def: MergedTrackerDef, id: string): string {
  const options = def.input.kind === "select" ? def.input.options : [];
  return options.find((o) => o.id === id)?.label ?? id;
}

/**
 * One recorded value as a renderer should draw it.
 *
 * `null` means the value is not recorded, and a renderer must then draw
 * nothing at all — not a dash, not a zero, not an empty box. A dash says the
 * user left something out, and on a tracker that was never on their card that
 * is a false report about their day.
 */
export function describeValue(
  def: MergedTrackerDef,
  value: TrackerValue,
): FormattedValue | null {
  if (!isRecorded(def, value)) return null;
  const input = def.input;
  switch (input.kind) {
    case "checkbox":
      return {
        kind: "text",
        text: (value as Extract<TrackerValue, { kind: "checkbox" }>).value ? "igen" : "nem",
      };
    case "slider": {
      const n = (value as Extract<TrackerValue, { kind: "slider" }>).value;
      // A slider with a unit reads as a measurement; one without reads as a
      // position on a scale, because "7" alone does not say out of what.
      return {
        kind: "text",
        text: input.unit
          ? `${formatNumber(n)} ${input.unit}`
          : `${formatNumber(n)}/${formatNumber(input.max)}`,
      };
    }
    case "number": {
      const n = (value as Extract<TrackerValue, { kind: "number" }>).value as number;
      return { kind: "text", text: input.unit ? `${formatNumber(n)} ${input.unit}` : formatNumber(n) };
    }
    case "select":
      return { kind: "text", text: selectLabel(def, (value as Extract<TrackerValue, { kind: "select" }>).value) };
    case "text":
      return { kind: "text", text: (value as Extract<TrackerValue, { kind: "text" }>).value };
    case "flags":
      return {
        kind: "flags",
        labels: input.options
          .filter((o) => (value as Extract<TrackerValue, { kind: "flags" }>).value[o.id] === true)
          .map((o) => o.label),
      };
  }
}

/**
 * Many recorded values as ONE line, for the report.
 *
 * The denominator is `values.length` — the entries that carry this tracker at
 * all — and not the number of entries in the report. "12/30 nap" would say the
 * user forgot a step count on eighteen days that were recorded before they had
 * the tracker switched on, which is a claim the data does not support.
 *
 * A `text` tracker is summarised as a COUNT and never quoted. Thirty entries
 * of two hundred characters is not a summary, and the report has never carried
 * a note column: it is a summary document, and this keeps it one.
 *
 * Returns `""` for a tracker with nothing recorded, so a caller that forgets to
 * check draws no line rather than an empty one.
 */
export function summarise(def: MergedTrackerDef, values: TrackerValue[]): string {
  const recorded = values.filter((v) => isRecorded(def, v));
  if (recorded.length === 0) return "";
  const total = recorded.length;
  const input = def.input;
  switch (input.kind) {
    case "number":
    case "slider": {
      // Both kinds store a plain number in `value`; they differ only in
      // whether there is a unit to print after it.
      const nums = recorded
        .map((v) => (v as unknown as { value: unknown }).value)
        .filter((n): n is number => typeof n === "number");
      if (nums.length === 0) return "";
      // Rounded to one decimal, and no more: a mean of seven numbers does not
      // carry two.
      const mean = Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
      const unit = input.unit ? ` ${input.unit}` : "";
      return `átlag ${formatNumber(mean)}${unit} (${nums.length}/${total} nap)`;
    }
    case "checkbox": {
      const yes = recorded.filter((v) => (v as Extract<TrackerValue, { kind: "checkbox" }>).value)
        .length;
      return `igen ${yes}/${total} nap`;
    }
    case "select": {
      const counts = new Map<string, number>();
      for (const v of recorded) {
        const id = (v as Extract<TrackerValue, { kind: "select" }>).value;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      // Ties go to the option declared first, so the line does not change
      // because two options happened to tie on one report and not the next.
      const winner = input.options.reduce<string | null>((best, o) => {
        const n = counts.get(o.id) ?? 0;
        if (n === 0) return best;
        if (best === null) return o.id;
        return n > (counts.get(best) ?? 0) ? o.id : best;
      }, null);
      if (winner === null) return "";
      return `${selectLabel(def, winner)} (${counts.get(winner)}/${total} nap)`;
    }
    case "flags": {
      const parts = input.options
        .map((o) => ({
          label: o.label,
          n: recorded.filter(
            (v) => (v as Extract<TrackerValue, { kind: "flags" }>).value[o.id] === true,
          ).length,
        }))
        .filter((p) => p.n > 0)
        .map((p) => `${p.label} ${p.n}/${total}`);
      return parts.join(", ");
    }
    case "text": {
      const filled = recorded.filter(
        (v) => (v as Extract<TrackerValue, { kind: "text" }>).value.trim() !== "",
      ).length;
      return `${filled}/${total} napon kitöltve`;
    }
  }
}

/** The defs to display: the built-in registry plus the user's own. */
export function displayDefs(customDefs: CustomTrackerDef[]): MergedTrackerDef[] {
  return getTrackerDefs(customDefs);
}
