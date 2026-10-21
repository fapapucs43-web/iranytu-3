/**
 * A tab's sections, in the reader's order.
 *
 * Two modes out of one component, and the difference between them is the whole
 * design:
 *
 *  - ORDERED (the default) the list is a FRAGMENT. Not a wrapper element, not a
 *    `div`, not a `li` — nothing. Every section renders exactly where it would
 *    have rendered without this component, so wiring it in changes no layout
 *    and adds no node for a stylesheet to trip over. It is also what keeps the
 *    `CollapsibleCard`s safe: a wrapper around a card would put the reorder
 *    row inside the thing being reordered, and the Settings tab's thirteen
 *    collapsible cards would then be reachable by two different affordances at
 *    once. A fragment cannot nest anything.
 *
 *  - REARRANGING the list is a numbered panel of up/down rows, which is the
 *    same UI the bottom bar's tab order already uses (SettingsView, the
 *    `tab-order-row` classes), so this app now has one way to reorder something
 *    rather than two. The arrows carry the pattern that pattern already got
 *    right: an `aria-label` that NAMES the row AND its position, so the reason
 *    an edge arrow is disabled is inside the label rather than nowhere.
 *
 * The component never reads or writes storage. It is handed a value and hands
 * back the next one; the view decides which tab's slot in `settings.sectionOrder`
 * that is. That is why there is no `TabId` prop.
 */
import { Fragment, type ReactNode } from "react";
import { moveSection, orderSections, sameOrder, withoutTabOrder } from "../lib/sectionOrder";
import { t } from "../lib/i18n";
import type { SectionId, TabId } from "../types";
import { useApp } from "../state/AppContext";

export type SectionSpec<ID extends SectionId = SectionId> = {
  /** Must be stable: it is what gets stored, and what a rename loses. */
  id: ID;
  /** The row's name in the rearrange panel — what the arrows announce. */
  label: string;
  render: () => ReactNode;
};

export type SectionListProps<ID extends SectionId = SectionId> = {
  sections: readonly SectionSpec<ID>[];
  /** The stored arrangement for THIS tab, or undefined. Never trusted. */
  value: unknown;
  onChange: (next: SectionId[]) => void;
  onReset: () => void;
  /**
   * Optional overrides. The defaults come from the catalogue so a view that has
   * no better wording does not have to invent one — and so these two keys have
   * a call site without any view having to pass a string it just translated.
   */
  title?: string;
  note?: string;
  /** True renders the panel; false (the default) renders the sections. */
  rearranging?: boolean;
};

export default function SectionList<ID extends SectionId = SectionId>({
  sections,
  value,
  onChange,
  onReset,
  title,
  note,
  rearranging = false,
}: SectionListProps<ID>) {
  const defaults = sections.map((s) => s.id);
  const order = orderSections(defaults, value);

  if (!rearranging) {
    const byId = new Map<SectionId, SectionSpec<ID>>(sections.map((s) => [s.id, s] as const));
    return (
      <>
        {order.map((id) => {
          const section = byId.get(id);
          return section ? <Fragment key={id}>{section.render()}</Fragment> : null;
        })}
      </>
    );
  }

  const byId = new Map<SectionId, SectionSpec<ID>>(sections.map((s) => [s.id, s] as const));
  const heading = title ?? t("settings.sections.orderTitle");

  /** Re-normalised on the way out, exactly as `moveTab` does for the bar. */
  const move = (i: number, step: -1 | 1) =>
    onChange(orderSections(defaults, moveSection(order, i, step)));

  // The `tab-order*` classes and this markup are the bar's own, reused rather
  // than restyled: the app then has exactly one way to reorder something, and
  // no second set of rules to keep in step. `<div>` and not `<ol>` for the same
  // reason — the row already prints its own position.
  return (
    <div className="tab-order" role="group" aria-label={heading}>
      <span className="field-label">{heading}</span>
      <p className="muted-note">{note ?? t("settings.sections.orderNote")}</p>

      {order.map((id, i) => {
        const section = byId.get(id);
        if (!section) return null;
        return (
          <div key={id} className="tab-order-row">
            <span className="tab-order-label">
              {i + 1}. {section.label}
            </span>
            <span className="tab-order-controls">
              <button
                type="button"
                className="btn btn-ghost"
                aria-label={t("settings.sections.moveUp", {
                  n: i + 1,
                  name: section.label,
                })}
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                aria-label={t("settings.sections.moveDown", {
                  n: i + 1,
                  name: section.label,
                })}
                disabled={i === order.length - 1}
                onClick={() => move(i, 1)}
              >
                ↓
              </button>
            </span>
          </div>
        );
      })}

      <button
        type="button"
        className="btn btn-soft"
        onClick={onReset}
        // Disabled when there is nothing to undo. A reset that is already in
        // effect is not an action, and offering it would be the second thing
        // in this app to show a button that does nothing when pressed.
        disabled={sameOrder(order, defaults)}
      >
        {t("settings.sections.reset")}
      </button>
    </div>
  );
}

/**
 * The button that opens and closes a tab's rearrange panel.
 *
 * A component and not a button written out five times, for the same reason the
 * `sections` arrays are: the five tabs have to agree. It carries `aria-pressed`,
 * so whether the panel is open is in the accessibility tree and not only in the
 * two words it swaps between.
 *
 * IT IS RENDERED BELOW THE LIST IT OPENS, ON EVERY TAB, AND THAT IS THE
 * CONTRACT. The panel replaces the list in place, so a control above the list
 * would move out from under the reader's finger the moment it is pressed — and
 * on a long tab it would be the one control nobody ever scrolls back to. Below
 * the list it stays exactly where it was put, in both modes: the cards above it
 * when the panel is shut, the panel above it when it is open. All five views are
 * audited for this — source order and rendered byte order — in
 * `tests/views/section-reorder-integration.test.tsx`.
 */
export function ReorderToggle({
  active,
  onToggle,
}: {
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="btn btn-ghost"
      aria-pressed={active}
      onClick={onToggle}
    >
      {active ? t("settings.sections.stop") : t("settings.sections.start")}
    </button>
  );
}

/**
 * This tab's slot in `settings.sectionOrder`, with the two writes the panel needs.
 *
 * Reads and writes exactly one key and leaves every other tab's arrangement
 * alone — which is why this takes a `TabId` where `orderSections` deliberately
 * does not: this is the view's half of the contract, not the rule.
 *
 * `reset` deletes the key rather than writing the default order back; see
 * `withoutTabOrder` for why that is the better half of the same idea.
 */
export function useSectionOrder(tab: TabId) {
  const { data, setSettings, notify } = useApp();
  const settings = data.settings;

  return {
    /** `unknown`, not `SectionId[]`: what is stored has crossed a JSON boundary. */
    stored: settings.sectionOrder?.[tab] as unknown,
    setOrder: (next: SectionId[]) =>
      setSettings({
        ...settings,
        sectionOrder: { ...(settings.sectionOrder ?? {}), [tab]: next },
      }),
    reset: () => {
      setSettings({
        ...settings,
        sectionOrder: withoutTabOrder(settings.sectionOrder, tab),
      });
      notify(t("settings.sections.resetDone"));
    },
  };
}