/**
 * Custom theme editor metadata (Batch 1, P3).
 *
 * The theme ENGINE (lib/themes.ts) already supports custom palettes; this
 * module adds the editor-facing structure: validated hex input and the 13
 * tokens grouped into labeled sections.
 */

export const CUSTOM_TOKEN_SECTIONS: {
  label: string;
  tokens: { key: string; label: string; hint?: string }[];
}[] = [
  {
    label: "Háttér",
    tokens: [
      { key: "bg", label: "Oldal háttere" },
      { key: "bgSoft", label: "Halvány sávok" },
      { key: "surface", label: "Kártyák" },
      { key: "surface2", label: "Kártya belső" },
    ],
  },
  {
    label: "Szöveg",
    tokens: [
      { key: "ink", label: "Fő szöveg" },
      { key: "inkSoft", label: "Másodlagos szöveg" },
      { key: "line", label: "Elválasztók" },
    ],
  },
  {
    label: "Márka",
    tokens: [
      { key: "brand", label: "Fő szín" },
      { key: "brandStrong", label: "Fő szín (sötét)" },
      { key: "brandSoft", label: "Fő szín (halvány)" },
      { key: "accent", label: "Kiemelő szín" },
    ],
  },
  {
    label: "Állapotok",
    tokens: [
      { key: "danger", label: "Hiba / veszély" },
      { key: "ok", label: "Siker" },
    ],
  },
];

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** True when the string is a 3- or 6-digit hex color. */
export function isValidHex(value: string): boolean {
  return HEX_RE.test(value.trim());
}

/** Normalize to 6-digit lowercase hex ("#ABC" → "#aabbcc"). Returns null if invalid. */
export function normalizeHex(value: string): string | null {
  const v = value.trim();
  if (!isValidHex(v)) return null;
  if (v.length === 4) {
    const [r, g, b] = v.slice(1).split("");
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return v.toLowerCase();
}

/** Keys accepted in a custom palette (mirrors CustomTheme). */
export const CUSTOM_TOKEN_KEYS = CUSTOM_TOKEN_SECTIONS.flatMap((s) =>
  s.tokens.map((t) => t.key),
);
