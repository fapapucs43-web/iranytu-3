import { useState } from "react";
import { useApp } from "../state/AppContext";
import { useTheme } from "../state/ThemeContext";
import { CollapsibleCard } from "./ui/ui";
import { CUSTOM_TOKEN_SECTIONS } from "../lib/customTheme";
import ColorPicker from "./ColorPicker";
import { Save, Sliders } from "../lib/icons";
import { t } from "../lib/i18n";
import type { CustomTheme } from "../types";

/**
 * Custom theme color editor (Batch 1, P3). Visible only when the active theme
 * is "custom". Every valid change applies instantly (existing setCustomColor)
 * AND persists via settings.customTheme — closing the session-only gap.
 *
 * Phase 3, commit 2 — the picker replaces the two inputs: a token row is a
 * radio selecting WHICH token the one ColorPicker underneath edits.
 *
 * Phase 4 — "Saját téma szín", the panel the reader asked for. The four
 * colours a reader actually NAMES (the window behind everything, the cards
 * on it, the text, the accent) each get their OWN always-open picker at the
 * top, above a live preview that paints them the moment a swatch is tapped —
 * because those four are the ones whose relationship matters (ink has to sit
 * on the card, the card on the background) and seeing them side by side IS
 * the editor. The other nine tokens stay below under one picker, reachable
 * but not in the way: they are refinements, not choices a first pass needs.
 *
 * The value every picker is handed is the LIVE token (`tokens`), not the raw
 * custom map: a token the reader has not touched yet shows the theme's
 * default, so a chip never lies about what is on screen, and no swatch claims
 * the selection until a palette colour is actually in force.
 */

/** The four named colours, each with its own picker. Order is the reader's. */
const PRIMARY_TOKENS: readonly { key: keyof CustomTheme }[] = [
  { key: "bg" },
  { key: "surface" },
  { key: "ink" },
  { key: "accent" },
];

/** Every token the four do not name, in the sections' own order. */
const DETAIL_TOKENS = CUSTOM_TOKEN_SECTIONS.flatMap((s) => s.tokens).filter(
  (token) => !PRIMARY_TOKENS.some((p) => p.key === token.key),
);

export default function CustomThemeEditor() {
  const { data, setSettings, notify } = useApp();
  const { theme, customTheme, tokens, setCustomColor, resetCustomTheme } = useTheme();
  // Which token the one DETAIL picker is editing. The first of the nine —
  // the soft background strip — because the four named colours above have
  // pickers of their own.
  const [activeKey, setActiveKey] = useState<string>(DETAIL_TOKENS[0]!.key);

  if (theme !== "custom") return null;

  const active = DETAIL_TOKENS.find((token) => token.key === activeKey) ?? DETAIL_TOKENS[0]!;

  // The four labels, resolved per render rather than at module scope: the app
  // can switch language while it is open, and a module-level `t()` would
  // freeze the first locale into every heading. The literal keys here are also
  // the call sites `tests/lib/i18n.test.ts` reads.
  const primaryLabels: Record<string, string> = {
    bg: t("theme.custom.primary.bg"),
    surface: t("theme.custom.primary.surface"),
    ink: t("theme.custom.primary.ink"),
    accent: t("theme.custom.primary.accent"),
  };

  function pickDetailColor(hex: string) {
    setCustomColor(active.key as never, hex);
  }

  function savePalette() {
    setSettings({ ...data.settings, theme: "custom", customTheme });
    notify(t("theme.custom.savedToast"));
  }

  function reset() {
    resetCustomTheme();
    setSettings({ ...data.settings, customTheme: {} });
    notify(t("theme.custom.resetToast"));
  }

  return (
    <CollapsibleCard
      id="settings-custom-theme"
      title={t("theme.custom.title")}
      icon={<Sliders />}
      summary={t("theme.custom.note")}
    >
      <p className="muted-note">{t("theme.custom.note")}</p>

      {/* The live preview: the same three layers the app draws — page, card,
          text — with the accent on a real heading. It repaints on every tap
          because `tokens` is the resolved, already-applied palette. */}
      <div className="cte-preview" style={{ background: tokens.bg }}>
        <div
          className="cte-preview-card"
          style={{ background: tokens.surface, color: tokens.ink }}
        >
          <strong style={{ color: tokens.accent }}>{t("theme.custom.previewTitle")}</strong>
          <span>{t("theme.custom.previewBody")}</span>
        </div>
      </div>

      <div className="cte-section">
        <h3>{t("theme.custom.sectionMain")}</h3>
        {PRIMARY_TOKENS.map((token) => (
          <ColorPicker
            key={token.key}
            label={primaryLabels[token.key]}
            value={tokens[token.key] ?? ""}
            onChange={(hex) => setCustomColor(token.key, hex)}
          />
        ))}
      </div>

      <div className="cte-section">
        <h3>{t("theme.custom.sectionDetail")}</h3>
        {CUSTOM_TOKEN_SECTIONS.map((section) => (
          <div
            key={section.label}
            className="cte-section"
            role="radiogroup"
            aria-label={section.label}
          >
            <h3>{section.label}</h3>
            {section.tokens
              .filter((token) => !PRIMARY_TOKENS.some((p) => p.key === token.key))
              .map((token) => {
                const isActive = token.key === active.key;
                return (
                  <button
                    key={token.key}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    className={`cte-row${isActive ? " cte-row-active" : ""}`}
                    onClick={() => setActiveKey(token.key)}
                  >
                    <span
                      className="cte-chip"
                      style={{ background: tokens[token.key] }}
                      aria-hidden="true"
                    />
                    <span className="cte-label">{token.label}</span>
                  </button>
                );
              })}
          </div>
        ))}
        <ColorPicker
          label={t("theme.custom.colorLabel", { label: active.label })}
          value={tokens[active.key] ?? ""}
          onChange={pickDetailColor}
        />
      </div>

      <div className="dialog-actions">
        <button type="button" className="btn btn-ghost" onClick={reset}>
          {t("theme.custom.reset")}
        </button>
        <button type="button" className="btn btn-primary" onClick={savePalette}>
          <Save size="1.1em" /> {t("theme.custom.save")}
        </button>
      </div>
    </CollapsibleCard>
  );
}
