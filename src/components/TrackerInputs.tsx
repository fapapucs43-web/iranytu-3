import {
  getTrackerDefs,
  defaultTrackerValue,
  isTrackerGroupEnabled,
  trackerGroupHeads,
  trackerGroupMembers,
  sanitizeTrackerValue,
  MAX_TEXT_LENGTH,
  type MergedTrackerDef,
  type TrackerState,
  type TrackerValue,
} from "../lib/trackers";
import { sanitizeCustomTrackerValue, useCustomTrackers } from "../lib/customTrackers";
import { trackerGroupSummary } from "../lib/cardStates";
import { ClipboardList } from "../lib/icons";
import { GlyphIcon } from "../state/IconSetContext";
import { CollapsibleCard } from "./ui/ui";
import { t } from "../lib/i18n";

/**
 * Modular tracker inputs for the daily entry.
 *
 * Controlled: `values` is the entry's tracker state; `onChange` receives the
 * whole next state. Custom trackers always render; a built-in renders when its
 * GROUP is enabled, and a group is enabled when any of its members is — which
 * is the only reading consistent with what onboarding writes, since
 * `ONBOARDING_TRACKER_CHOICES` offers the id "weather" and that is now a
 * child of the weather group rather than its head.
 *
 * Values are normalised on the way in AND on the way out: a stored value whose
 * `kind` no longer matches its def degrades to the default here rather than
 * rendering a control that cannot represent it. Nothing is written back to
 * storage until the user saves, so a pre-Batch-7e entry is never rewritten
 * behind their back.
 */

/** One row: the label, the input, the hint. Six kinds, one shape. */
function TrackerRow({
  def,
  value,
  nested,
  onChange,
}: {
  def: MergedTrackerDef;
  value: TrackerValue;
  nested: boolean;
  onChange: (next: TrackerValue) => void;
}) {
  const rowClass = nested ? "tracker-row tracker-row-child" : "tracker-row";
  const glyph = <GlyphIcon glyph={def.icon} />;

  if (def.input.kind === "checkbox") {
    const on = value.kind === "checkbox" ? value.value : false;
    return (
      <label className={`check-row ${rowClass}`}>
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => onChange({ kind: "checkbox", value: e.target.checked })}
        />
        <span>
          <strong>
            {glyph} {def.label}
          </strong>
          {def.hint && <small className="muted-note">{def.hint}</small>}
        </span>
      </label>
    );
  }

  if (def.input.kind === "slider") {
    const num = value.kind === "slider" ? value.value : def.input.min;
    return (
      <div className={`slider-block ${rowClass}`}>
        <div className="slider-head">
          <label className="slider-label" htmlFor={`tracker-${def.id}`}>
            <strong>
              {glyph} {def.label}
            </strong>
            <span className="slider-value">
              {num}
              {def.input.unit ? ` ${def.input.unit}` : ""}
            </span>
          </label>
        </div>
        <input
          id={`tracker-${def.id}`}
          className="slider slider-amber"
          type="range"
          min={def.input.min}
          max={def.input.max}
          step={def.input.step ?? 1}
          value={num}
          onChange={(e) => onChange({ kind: "slider", value: Number(e.target.value) })}
        />
        {def.hint && <small className="muted-note">{def.hint}</small>}
      </div>
    );
  }

  if (def.input.kind === "number") {
    // The unit rides in the label rather than beside the box: a `<small>` under
    // a full-width input reads as a caption for the field, not as its unit, and
    // this needs no CSS to get right.
    const num = value.kind === "number" ? value.value : null;
    return (
      <div className={rowClass}>
        <label className="field-label" htmlFor={`tracker-${def.id}`}>
          {glyph} {def.label}
          {def.input.unit ? ` (${def.input.unit})` : ""}
          <input
            id={`tracker-${def.id}`}
            className="text-input"
            type="number"
            inputMode="numeric"
            min={def.input.min}
            max={def.input.max}
            step={def.input.step}
            // `null` is "not recorded", so it draws as an empty box rather than
            // a zero. Putting a 0 in that box would claim the user measured
            // zero, and the correlation grid would believe them.
            value={num === null ? "" : num}
            onChange={(e) => {
              const raw = e.target.value.trim();
              onChange({ kind: "number", value: raw === "" ? null : Number(raw) });
            }}
          />
        </label>
        {def.hint && <small className="muted-note">{def.hint}</small>}
      </div>
    );
  }

  if (def.input.kind === "select") {
    const chosen = value.kind === "select" ? value.value : "";
    return (
      <div className={rowClass}>
        <label className="field-label" htmlFor={`tracker-${def.id}`}>
          {glyph} {def.label}
          <select
            id={`tracker-${def.id}`}
            className="text-input"
            value={chosen}
            onChange={(e) => onChange({ kind: "select", value: e.target.value })}
          >
            {def.input.options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {def.hint && <small className="muted-note">{def.hint}</small>}
      </div>
    );
  }

  if (def.input.kind === "flags") {
    const flags = value.kind === "flags" ? value.value : {};
    return (
      <div className={rowClass}>
        <span className="field-label">
          {glyph} {def.label}
        </span>
        <div className="tracker-flags">
          {def.input.options.map((o) => (
            <label key={o.id} className="check-row">
              <input
                type="checkbox"
                checked={flags[o.id] === true}
                onChange={(e) =>
                  onChange({
                    kind: "flags",
                    value: { ...flags, [o.id]: e.target.checked },
                  })
                }
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
        {def.hint && <small className="muted-note">{def.hint}</small>}
      </div>
    );
  }

  return (
    <div className={rowClass}>
      <label className="field-label" htmlFor={`tracker-${def.id}`}>
        {glyph} {def.label}
      </label>
      <input
        id={`tracker-${def.id}`}
        className="text-input"
        type="text"
        maxLength={MAX_TEXT_LENGTH}
        placeholder={def.input.placeholder}
        value={value.kind === "text" ? value.value : ""}
        onChange={(e) => onChange({ kind: "text", value: e.target.value })}
      />
      {def.hint && <small className="muted-note">{def.hint}</small>}
    </div>
  );
}

/** The value a def can actually show, falling back to its default. */
function valueFor(def: MergedTrackerDef, raw: TrackerValue | undefined): TrackerValue {
  const fallback = defaultTrackerValue(def);
  if (!raw) return fallback;
  // Custom defs are validated by their own sanitizer against their own stored
  // range, so they are taken as they are — exactly as before this batch.
  if (def.custom) return raw;
  return sanitizeTrackerValue(def, raw) ?? fallback;
}

/**
 * Batch 11 — the tracker groups become collapsible cards.
 *
 * WHY A CARD PER GROUP, AND NOT ONE CARD FOR THE WHOLE SECTION
 * The groups are what a user fills or skips as a unit, so each one is its own
 * card: collapsing it hides exactly one topic and keeps its summary visible,
 * which is what the batch asked the collapse to buy — glanceability without a
 * scroll. The "Nyomonkövetés" frame above them is a card too (see the mount at
 * the bottom of this file): it starts OPEN, so the per-group cards are the
 * thing a reader meets, and a reader who wants the whole block out of the way
 * can now put it away with the same gesture as everything else.
 *
 * THE SUMMARY IS DERIVED, NEVER STORED
 * It is computed from `values` on every render, so a group can never say
 * '7/10' while its controls say 3 — the same rule the entry detail already
 * obeys by reading `describeValue`.
 */
function TrackerGroupCard({
  members,
  values,
  update,
}: {
  members: MergedTrackerDef[];
  values: TrackerState;
  update: (id: string, value: TrackerValue) => void;
}) {
  const head = members[0]!;
  const described = members.map((def) => ({ def, value: valueFor(def, values[def.id]) }));
  const summary = trackerGroupSummary(head, described);
  return (
    <CollapsibleCard id={`tracker-${head.id}`} title={head.label} icon={<GlyphIcon glyph={head.icon} />} summary={summary}>
      <div className={members.length > 1 ? "tracker-group" : "tracker-group tracker-group-solo"}>
        {described.map(({ def, value }, i) => (
          <TrackerRow
            key={def.id}
            def={def}
            value={value}
            nested={i > 0}
            onChange={(next) => update(def.id, next)}
          />
        ))}
      </div>
    </CollapsibleCard>
  );
}

export default function TrackerInputs({
  values,
  onChange,
  enabledIds,
}: {
  values: TrackerState;
  onChange: (next: TrackerState) => void;
  enabledIds?: string[];
}) {
  const customDefs = useCustomTrackers();
  const allDefs = getTrackerDefs(customDefs);

  const groups = trackerGroupHeads()
    .filter((head) => isTrackerGroupEnabled(enabledIds, head))
    .map((head) => trackerGroupMembers(head.id));
  const customs = allDefs.filter((d) => d.custom);
  if (groups.length === 0 && customs.length === 0) return null;

  function update(id: string, value: TrackerValue) {
    const def = allDefs.find((d) => d.id === id);
    const safe = def?.customDef
      ? sanitizeCustomTrackerValue(def.customDef, value) ?? value
      : def
        ? // Built-ins are sanitized on the way IN too, which is the same
          // pattern the custom branch has always used. It is what stops a
          // hand-edited value from reaching the grid unclamped.
          sanitizeTrackerValue(def, value) ?? value
        : value;
    onChange({ ...values, [id]: safe });
  }

  // The frame's collapsed line: WHAT IT HOLDS, counted. The count is the
  // groups plus the reader's own trackers — the things this card asks about —
  // and not a "filled" figure, deliberately: `isRecorded` counts a slider's
  // untouched default as a record (that is the journal's own rule), so a
  // "filled today" line here would claim 2 of 2 on a day nobody touched. A
  // number that cannot be wrong is worth more than one that can.
  const asks = groups.length + customs.length;

  return (
    /* The frame is a remembering card, like every card it holds.
     *
     * WHY IT IS ONE NOW
     * It used to be a plain `<section className="card">` with a `card-head`: a
     * title with an icon and NO chevron, and no `aria-expanded` at all. The
     * reader's report was exactly that — the group cards inside it ("Alvás",
     * "Tünetek", …) had arrows and collapsed, and the card holding them looked
     * like the same kind of thing but did nothing. A head that looks like a
     * control and is not one is the failure this file spent a batch removing
     * from the Settings page; the frame is the last one in the app.
     *
     * `defaultOpen` because this body is the daily work itself — ticking the
     * vitamins, recording sleep — and a frame that starts shut would hide the
     * reason the reader opened the app. The stored choice still wins: a reader
     * who collapses it finds it collapsed at the next launch too. */
    <CollapsibleCard
      id="tracker-frame"
      title={t("trackers.sectionTitle")}
      icon={<ClipboardList />}
      summary={t("trackers.frameSummary", { n: asks })}
      defaultOpen
    >
      <div className="tracker-list tracker-list-cards">
        {groups.map((members) => (
          <TrackerGroupCard
            key={members[0]!.id}
            members={members}
            values={values}
            update={update}
          />
        ))}
        {customs.map((def) => (
          <TrackerRow
            key={def.id}
            def={def}
            value={valueFor(def, values[def.id])}
            nested={false}
            onChange={(next) => update(def.id, next)}
          />
        ))}
      </div>
    </CollapsibleCard>
  );
}
