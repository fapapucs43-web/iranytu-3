/**
 * Phase 3, commit 1 — the colour picker that never says "hex".
 *
 * WHY THIS EXISTS
 * The custom theme editor used to offer four `type="color"` inputs, which
 * means the reader's vocabulary for "I want a calmer blue" is the browser's
 * native swatch dialog and, underneath it, an six-digit code. That is the
 * wrong instrument for this app: the reader this app is built for picks
 * colours the way they pick a mood — by looking at a small, named set and
 * pointing. So this picker is a closed palette: ten families, five shades
 * each, light to dark, and nothing else can be selected. There is no hex
 * field, no RGB slider, and no free text on purpose — the closed set is the
 * feature, and a value outside it can only arrive from a legacy blob, which
 * the preview reports honestly rather than silently snapping.
 *
 * ONE COMPONENT, TWO HALVES
 * The preview chip on top always shows the CURRENT value (whatever it is),
 * with its family and shade named when the value is one of ours; below it,
 * one row per family, each row a radiogroup of five swatches. Selection is
 * `aria-checked` on a real `role="radio"` button, so the picker is operable
 * from the keyboard and announces what it holds — the same contract
 * `Gad7Card`'s options keep.
 *
 * WHERE THE WORDS LIVE
 * Every visible string is a catalogue key (`colorPicker.*`), never a literal:
 * the hu/en/de family names and the five shade names travel with the app's
 * other copy, and `tests/i18n-sweep-list` stays at zero raw literals.
 *
 * THE SHADES ARE DATA, NOT LOGIC
 * The fifty hexes are a pinned table (`COLOR_FAMILIES`), not a computed ramp:
 * a generated ramp is a ramp nobody has looked at, and these are UI colours
 * that have to sit next to the app's existing tokens. `findSwatch` is the
 * only lookup, and it is exact-match — the picker never "improves" a value
 * it was handed.
 */
import { t } from "../lib/i18n";

/**
 * The labels, resolved per render rather than at module scope: the app can
 * switch language while it is open, and a module-level `t()` would freeze the
 * first locale into every swatch's name. The literal keys here are also what
 * `tests/lib/i18n.test.ts`'s "every key has a call site" guard reads.
 */
function colorLabels() {
  const families: Record<string, string> = {
    red: t("colorPicker.family.red"),
    orange: t("colorPicker.family.orange"),
    yellow: t("colorPicker.family.yellow"),
    green: t("colorPicker.family.green"),
    blue: t("colorPicker.family.blue"),
    purple: t("colorPicker.family.purple"),
    pink: t("colorPicker.family.pink"),
    brown: t("colorPicker.family.brown"),
    gray: t("colorPicker.family.gray"),
    black: t("colorPicker.family.black"),
  };
  const shades: readonly string[] = [
    t("colorPicker.shade.light"),
    t("colorPicker.shade.pale"),
    t("colorPicker.shade.medium"),
    t("colorPicker.shade.dark"),
    t("colorPicker.shade.darkest"),
  ];
  return { families, shades };
}

/** One row of the picker: five shades, light → dark. */
export type ColorFamily = {
  id: string;
  shades: readonly string[];
};

/**
 * The whole palette. Ten families × five shades, every hex a real, looked-at
 * UI colour (light → dark within a family). Editing a hex here is a design
 * decision, not a refactor: the tests and the preview both read this table.
 */
export const COLOR_FAMILIES: readonly ColorFamily[] = [
  { id: "red", shades: ["#fca5a5", "#f87171", "#ef4444", "#b91c1c", "#7f1d1d"] },
  { id: "orange", shades: ["#fed7aa", "#fb923c", "#f97316", "#c2410c", "#7c2d12"] },
  { id: "yellow", shades: ["#fef08a", "#fde047", "#eab308", "#a16207", "#713f12"] },
  { id: "green", shades: ["#bbf7d0", "#4ade80", "#16a34a", "#15803d", "#14532d"] },
  { id: "blue", shades: ["#bfdbfe", "#60a5fa", "#2563eb", "#1d4ed8", "#1e3a8a"] },
  { id: "purple", shades: ["#ddd6fe", "#a78bfa", "#7c3aed", "#6d28d9", "#4c1d95"] },
  { id: "pink", shades: ["#fbcfe8", "#f472b6", "#ec4899", "#be185d", "#831843"] },
  { id: "brown", shades: ["#f0d9c0", "#d3a278", "#a16207", "#78350f", "#3b2314"] },
  { id: "gray", shades: ["#f1f5f9", "#cbd5e1", "#94a3b8", "#475569", "#1e293b"] },
  { id: "black", shades: ["#d4d4d8", "#a1a1aa", "#52525b", "#27272a", "#0a0a0a"] },
];

/** Where a hex sits in the palette, or null when it is not one of ours. */
export function findSwatch(
  hex: string,
): { family: ColorFamily; index: number } | null {
  const value = hex.trim().toLowerCase();
  for (const family of COLOR_FAMILIES) {
    const index = family.shades.indexOf(value);
    if (index >= 0) return { family, index };
  }
  return null;
}

/**
 * The picker. Controlled: the caller owns the value and persists it.
 *
 * `value` is shown as-is, even when it is not a palette colour (a theme saved
 * by the old hex editor, for instance): the preview chip shows the colour it
 * was given and says it is a custom one, and no swatch claims the selection.
 */
export default function ColorPicker({
  label,
  value,
  onChange,
}: {
  /** The field's visible label; the caller owns the wording. */
  label: string;
  /** The current colour, any CSS colour. Palette members are matched exactly. */
  value: string;
  /** Called with a palette hex on every pick. */
  onChange: (hex: string) => void;
}) {
  const selected = findSwatch(value);
  const labels = colorLabels();

  return (
    <div className="color-picker">
      <span className="field-label color-picker-label">{label}</span>

      <div className="color-preview" role="status">
        <span
          className="color-preview-chip"
          style={{ background: value }}
          aria-hidden="true"
        />
        <span className="color-preview-label">
          {selected
            ? `${labels.families[selected.family.id]} · ${labels.shades[selected.index]}`
            : t("colorPicker.custom")}
        </span>
      </div>

      {COLOR_FAMILIES.map((family) => {
        const familyLabel = labels.families[family.id]!;
        return (
          <div
            key={family.id}
            className="color-row"
            role="radiogroup"
            aria-label={familyLabel}
          >
            <span className="color-row-label">{familyLabel}</span>
            <div className="color-shades">
              {family.shades.map((hex, index) => (
                <button
                  key={hex}
                  type="button"
                  role="radio"
                  aria-checked={selected?.family.id === family.id && selected.index === index}
                  aria-label={`${familyLabel} ${labels.shades[index]}`}
                  className={`color-swatch${
                    selected?.family.id === family.id && selected.index === index
                      ? " color-swatch-active"
                      : ""
                  }`}
                  style={{ background: hex }}
                  onClick={() => onChange(hex)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
