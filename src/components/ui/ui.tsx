import {
  useEffect,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { Check, ChevronDown, ChevronRight } from "../../lib/icons";
import { loadCardStates, setCardCollapsed } from "../../lib/cardStates";
import ContentIcon from "../ContentIcon";

/* ------------------------------- Card ------------------------------- */

/**
 * `icon` accepts a string (legacy emoji, still used where the emoji is
 * user data) OR a ReactNode (the Batch 5 SVG icons). Batch 5 migrates the
 * decorative chrome to `<Icon />` while leaving data-driven emoji alone, so
 * both shapes have to render.
 */
export function Card({
  title,
  icon,
  children,
  className = "",
  action,
}: {
  title?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || icon || action) && (
        <div className="card-head">
          {icon && (
            <span className="card-icon" aria-hidden="true">
              {icon}
            </span>
          )}
          {title && <h2 className="card-title">{title}</h2>}
          {action && <div className="card-action">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/* --------------------------- SectionTitle --------------------------- */

export function SectionTitle({
  icon,
  title,
  hint,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="section-title">
      <span className="section-title-icon" aria-hidden="true">
        {icon}
      </span>
      <div>
        <h2>{title}</h2>
        {hint && <p>{hint}</p>}
      </div>
    </div>
  );
}

/* ------------------------------- Pill ------------------------------- */

export function Pill({
  selected,
  onClick,
  children,
  ariaLabel,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      className={`pill ${selected ? "pill-selected" : ""}`}
      aria-pressed={selected}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/* ------------------------------ Slider ------------------------------ */

export function Slider({
  label,
  emojiLow,
  emojiHigh,
  min,
  max,
  value,
  onChange,
  accent,
  hint,
}: {
  label: string;
  emojiLow: string;
  emojiHigh: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
  accent: "rose" | "amber";
  hint?: string;
}) {
  return (
    <div className="slider-block">
      <div className="slider-head">
        <span className="slider-emoji" aria-hidden="true">
          {emojiLow}
        </span>
        <label className="slider-label" htmlFor={`slider-${label}`}>
          <strong>{label}</strong>
          <span className="slider-value">{value}</span>
          {hint && <span className="slider-hint">{hint}</span>}
        </label>
        <span className="slider-emoji" aria-hidden="true">
          {emojiHigh}
        </span>
      </div>
      <input
        id={`slider-${label}`}
        className={`slider slider-${accent}`}
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

/* ------------------------------ Toggle ------------------------------ */

export function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: ReactNode;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="toggle-row">
      <span className="toggle-text">
        <strong>{label}</strong>
        {hint && <small>{hint}</small>}
      </span>
      <input
        type="checkbox"
        className="toggle-input"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="toggle-ui" aria-hidden="true" />
    </label>
  );
}

/* ---------------------------- EmptyState ---------------------------- */

export function EmptyState({
  icon,
  title,
  hint,
  cta,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
  /**
   * Batch 11, commit 3 — one action under the empty text, for the screens
   * where the way out is a single tap on another tab. Optional, and rendered
   * as-is, so the caller keeps the button styling (`.btn btn-primary`) and
   * this component keeps owning nothing but layout.
   */
  cta?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon" aria-hidden="true">
        {icon}
      </span>
      <h3>{title}</h3>
      {hint && <p>{hint}</p>}
      {cta && <div className="empty-state-cta">{cta}</div>}
    </div>
  );
}

/* ------------------------------ Toasts ------------------------------ */

export function Toasts({
  toasts,
  onDismiss,
}: {
  toasts: { id: number; message: string; tone: "ok" | "warn" }[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`toast toast-${t.tone}`}
          onClick={() => onDismiss(t.id)}
        >
          {t.tone === "ok" ? <Check size="1.1em" /> : <ContentIcon name="AlertTriangle" size="1.1em" />}
          {t.message}
        </button>
      ))}
    </div>
  );
}

/* --------------------------- ConfirmDialog -------------------------- */

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Igen, törlöm",
  cancelLabel = "Mégse",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  /**
   * `ReactNode` rather than `string`, since Batch 13 commit 6: the assessment
   * consent screen has to be able to put the crisis card inside this dialog,
   * and a dialog that can only say words in a paragraph cannot. Every existing
   * caller passes a string and is unaffected — `string` IS a `ReactNode`.
   *
   * That is also why the wrapper below is a `div` and not the `p` it used to
   * be: a `div` inside a `p` is invalid HTML nesting, and React would warn on
   * every render of the consent screen.
   */
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div className="overlay" role="presentation" onClick={onCancel}>
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>{title}</h2>
        <div className="dialog-message">{message}</div>
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------- Collapsible card ------------------------- */

export function Collapsible({
  id,
  title,
  icon,
  badge,
  children,
  defaultOpen = false,
  open,
  onToggle,
}: {
  /**
   * Optional DOM id on the section — a scroll anchor for a `?quick=` deep
   * link (e.g. `tools-therapy` on the toolbox's Terápia drawer). Omitted by
   * every existing caller, so the rendered markup for them is unchanged;
   * NOT a storage key: this primitive is session-local and remembers nothing.
   */
  id?: string;
  title: string;
  icon: ReactNode;
  badge?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onToggle?: () => void;
}) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen);
  const isOpen = open ?? uncontrolled;
  const toggle = () => {
    if (onToggle) onToggle();
    else setUncontrolled((v) => !v);
  };

  return (
    <section id={id} className={`card collapsible ${isOpen ? "collapsible-open" : ""}`}>
      <button
        type="button"
        className="collapsible-head"
        aria-expanded={isOpen}
        onClick={toggle}
      >
        <span className="card-icon" aria-hidden="true">
          {icon}
        </span>
        <span className="collapsible-title">{title}</span>
        {badge && <span className="badge badge-soft">{badge}</span>}
        <span className="chevron" aria-hidden="true">
          {isOpen ? <ChevronDown size="1em" /> : <ChevronRight size="1em" />}
        </span>
      </button>
      {isOpen && <div className="collapsible-body">{children}</div>}
    </section>
  );
}

/* ------------------ CollapsibleCard (Batch 11, commit 1) ------------- */

/**
 * A collapsible card that REMEMBERS, collapsed by default.
 *
 * WHY NOT `Collapsible`
 * `Collapsible` is the toolbox's primitive: session-local, opened by a
 * deliberate click, default closed because "more options" is the point. The
 * Batch 11 tracker and feature cards are the opposite trade — the summary
 * makes them glanceable while collapsed, and the user's last choice should
 * survive a reload, so the state has a home in storage (`lib/cardStates`, one
 * `belso-iranytu:cardStates` key) rather than in component state.
 *
 * CONTROLLED-ON-TOP-OF-LAZY
 * The first read goes through `loadCardStates()`, which memoises the one
 * `JSON.parse` per process — a page with seven cards parses the blob once,
 * not seven times. Writes go straight through `setCardCollapsed` (write-
 * through), so no effect ever has to sync state back to storage.
 *
 * THE SUMMARY IS THE PARENT'S JOB
 * This component renders `summary` as one muted line under the title and
 * owns nothing about its wording. Tracker groups build theirs from
 * `trackerGroupSummary` (which reuses `describeValue`, so a collapsed card
 * and the entry detail can never disagree); the four feature cards pass a
 * static sentence. A card with no summary simply renders none.
 *
 * THE ANIMATION IS A GRID ROW, NOT A HEIGHT
 * `grid-template-rows: 0fr → 1fr` animates to an unknown content height
 * without JS measurement and without `max-height`'s magic numbers. The body
 * is always in the tree (the head's summary aside), so the browser can
 * animate it, `prefers-reduced-motion: reduce` collapses the transition to
 * nothing (styles.css pins this), and the content stays findable by find-
 * in-page and assistive tech either way.
 */
export function CollapsibleCard({
  id,
  title,
  icon,
  summary,
  badge,
  className = "",
  defaultOpen = false,
  children,
}: {
  /**
   * Storage, aria AND scroll-anchor key: the id lands on the section itself,
   * which is what `scrollToQuickAnchor` looks up when a `?quick=` deep link
   * (`?quick=mood` → `today-mood`) scrolls the card into view. Stable across
   * reloads; never derived from a label.
   */
  id: string;
  title: string;
  icon: ReactNode;
  /** One muted line under the title; the collapsed card's whole story. */
  summary?: string;
  /**
   * Optional soft badge under the title. The two Settings drawers carried one
   * while they were session-local `Collapsible`s (`Részletek`, `Kísérleti`)
   * and keep it after the conversion — a status the reader could previously
   * see only while the drawer was open now labels the collapsed tile too.
   * `alignSelf` keeps the pill its own width inside the flex column of titles.
   */
  badge?: string;
  /**
   * Optional extra class on the section. Phase 2b carried three cards over
   * from `Card` that hung a layout/marker class off it (`balance-card`,
   * `activities-card`, `lesson-card`); the reorder tests pin two of those
   * strings as section markers, so the class has to survive the wrap.
   */
  /**
   * Optional extra class on the section — restored with `defaultOpen` in the
   * same edit, because the two props arrived together and losing this one is
   * exactly what the type checker caught: `TodayView` hangs a layout class off
   * two cards, and their markup is pinned by tests.
   */
  className?: string;
  /**
   * Whether the card is open on a device that has never touched it.
   *
   * Collapsed, for every card that was here before this prop: a card offering
   * "more options" should not push the page down on first sight. The exception
   * is the Ma tab's tracker frame (`TrackerInputs`), whose body IS the reader's
   * daily work — vitamins to tick, sleep to record — so a frame that started
   * shut would hide the thing they opened the app for. An explicit stored
   * choice always wins over this default, in both directions.
   */
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  // Lazy + memoised: the first card to render pays the single read. The map
  // holds "collapsed" (the batch's own shape), so ABSENCE must read as the
  // DEFAULT — collapsed, unless the card asked for `defaultOpen`. An explicit
  // `false` ("user left it open") opens, an explicit `true` closes, and the
  // default only decides the state before the reader has said anything.
  const [collapsed, setCollapsed] = useState(() => {
    const stored = loadCardStates()[id];
    return stored === undefined ? !defaultOpen : stored;
  });

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      setCardCollapsed(id, next);
      return next;
    });
  };

  return (
    <section id={id} className={`card collapsible ${className} ${collapsed ? "" : "collapsible-open"}`}>
      <button
        type="button"
        className="collapsible-head collapsible-card-head"
        aria-expanded={!collapsed}
        aria-controls={`card-body-${id}`}
        onClick={toggle}
      >
        <span className="card-icon" aria-hidden="true">
          {icon}
        </span>
        <span className="collapsible-card-titles">
          <span className="collapsible-title">{title}</span>
          {badge && (
            <span className="badge badge-soft" style={{ alignSelf: "flex-start" }}>
              {badge}
            </span>
          )}
          {summary && <span className="collapsible-card-summary">{summary}</span>}
        </span>
        <span className="chevron" aria-hidden="true">
          {collapsed ? <ChevronRight size="1em" /> : <ChevronDown size="1em" />}
        </span>
      </button>
      <div id={`card-body-${id}`} className="collapsible-card-body" hidden={collapsed}>
        <div className="collapsible-card-body-inner">{children}</div>
      </div>
    </section>
  );
}

/* ------------------------- Segmented control ------------------------ */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`segment ${value === opt.value ? "segment-active" : ""}`}
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/* --------------------------- TextInput ------------------------------ */

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="text-input" {...props} />;
}
