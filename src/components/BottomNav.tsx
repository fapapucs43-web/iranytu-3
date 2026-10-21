import { NAV_ICONS } from "../lib/nav-icons";
import { bottomNavClass, orderedTabs } from "../lib/navVisibility";
import { useApp } from "../state/AppContext";
import NavIcon from "./NavIcon";
import { useAutoHideNav } from "./useAutoHideNav";
import type { TabId } from "../types";
import { t } from "../lib/i18n";

/**
 * Bottom navigation (Batch 7b: draws through the chosen icon set).
 *
 * The icons are no longer hard-coded Lucide components. Each row names a tab
 * and nothing else; `NavIcon` decides, per item, whether that row draws a 3D
 * glyph, a literal character, or the Lucide icon it has always drawn.
 *
 * The bar stays a labelled bar. Every tab keeps its visible text and the icon
 * stays `aria-hidden`, exactly as before — this is a look change, and the
 * accessibility surface is deliberately untouched by it.
 *
 * AUTO-HIDING IS A CLASS AND NOTHING ELSE
 * This component holds no scroll logic, no listeners and no thresholds. It
 * reads one boolean from the hook and puts one class name on the element, and
 * `styles.css` decides what that class means — including, crucially, that it
 * means nothing at all above the desktop breakpoint, where this bar is a
 * sticky header at the top of the document rather than a bar at the bottom.
 * Keeping that decision in CSS is what makes "the desktop bar cannot be
 * hidden" structural instead of a branch somebody has to remember to write.
 *
 * The bar is also never removed from the DOM or made unfocusable when hidden;
 * it is moved out of view. A control that cannot be tabbed to is a different
 * feature, and a worse one.
 */
export default function BottomNav({
  active,
  onChange,
}: {
  active: TabId;
  onChange: (tab: TabId) => void;
}) {
  const { data } = useApp();
  const hidden = useAutoHideNav(data.settings.autoHideNav);

  // Batch 11: the user's arrangement wins, the default order survives every
  // malformed blob. Row lookup stays registry-driven so the labels/icons can
  // never drift from the ids being ordered.
  const rows = orderedTabs(data.settings.tabOrder).map(
    (tab) => NAV_ICONS.find((n) => n.tab === tab)!,
  );

  return (
    <nav className={bottomNavClass(hidden)} aria-label={t("app.navLabel")}>
      {rows.map((row) => (
        <button
          key={row.tab}
          type="button"
          className={`nav-btn ${active === row.tab ? "nav-btn-active" : ""}`}
          aria-current={active === row.tab ? "page" : undefined}
          onClick={() => onChange(row.tab)}
        >
          <span className="nav-icon" aria-hidden="true">
            <NavIcon tab={row.tab} />
          </span>
          <span className="nav-label">{row.label}</span>
        </button>
      ))}
    </nav>
  );
}
