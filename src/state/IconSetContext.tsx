/**
 * Icon set selection context (Batch 7, P12).
 *
 * Mirrors FontContext: the choice lives in the existing `Settings` blob, so
 * it persists through the same store, the same JSON export and the same
 * "Minden adat törlése" wipe — no new storage key, nothing to migrate.
 *
 * The provider does not write a default into settings, because an absent
 * `iconSet` is the pre-Batch-7 appearance and must stay that way.
 *
 * `GlyphIcon` is the single seam every icon surface goes through. It returns:
 *   - the literal character, when the user has not chosen a set (or chose the
 *     system set), or when the glyph is not one of ours;
 *   - a Lucide component, for the `lucide` set and for every fallback;
 *   - the inlined SVG, for the `fluent` set.
 *
 * So "Lucide" and "system emoji" are not special cases in the app — they are
 * the two degenerate answers of one function.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useApp } from "./AppContext";
import { getIcon } from "../lib/icons";
import {
  GLYPHS,
  RETIRED_ICON_SET_LABELS,
  RETIRED_ICON_SET_REPLACEMENT,
  coerceIconSetId,
  glyphArtwork,
  glyphDef,
  iconSetDef,
  loadFluentArtwork,
  renderModeFor,
  type IconSetId,
} from "../lib/iconsets";
import { consumeRetiredIconSetNotice } from "../lib/store";

type IconSetContextValue = {
  /**
   * The effective selection. `undefined` means the user has never chosen and
   * the app renders exactly as it did before Batch 7 — which is why this is
   * NOT `coerceIconSetId(undefined)`, which would answer "lucide" and
   * quietly opt every existing user into a set.
   */
  selected: IconSetId | undefined;
  /** Pick a set, or clear the choice by passing undefined. */
  setIconSet: (id: IconSetId | undefined) => void;
  /** Bumped when the active set finishes warming, so consumers re-render. */
  appliedAt: number;
};

const IconSetContext = createContext<IconSetContextValue | null>(null);

export function IconSetProvider({ children }: { children: ReactNode }) {
  const { data, setSettings, notify } = useApp();
  const selected = data.settings.iconSet;

  const [appliedAt, setAppliedAt] = useState(0);

  useEffect(() => {
    // Batched 7b removed the fetch. There is nothing to warm, nothing to hint,
    // nothing to retry and nothing that can fail, so this effect is now just
    // the one-time announcement below plus a stamp so a screen that keyed on
    // it re-renders once for a new selection, the way it always did.
    const retired = consumeRetiredIconSetNotice();
    if (retired) {
      // The name the user read in the picker, not the stored id: the toast is
      // the only place that tells them a choice of theirs was moved, so it has
      // to use the word that choice was made with.
      const name = RETIRED_ICON_SET_LABELS[retired] ?? retired;
      notify(
        `A(z) ${name} ikonokészlet már nem elérhető — a képei CC-BY 4.0 ` +
          `licenc alatt állnak, ami kötelező megjelölést jelentene. Helyette ` +
          `a ${iconSetDef(RETIRED_ICON_SET_REPLACEMENT).label} látszik, ami MIT ` +
          `licenc alatt áll. Válthatsz bármelyik másikra a Beállításokban.`,
      );
    }
    setAppliedAt(Date.now());
  }, [selected, notify]);

  const setIconSet = useCallback(
    (id: IconSetId | undefined) => {
      const next = { ...data.settings };
      if (id === undefined) delete next.iconSet;
      else next.iconSet = id;
      setSettings(next);
    },
    [data.settings, setSettings],
  );

  const value = useMemo<IconSetContextValue>(
    () => ({ selected, setIconSet, appliedAt }),
    // `appliedAt` is deliberate: it is what makes a screen re-render the
    // moment its set finishes loading, so the swap happens once and lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, appliedAt, setIconSet],
  );

  return <IconSetContext.Provider value={value}>{children}</IconSetContext.Provider>;
}

export function useIconSet(): IconSetContextValue {
  const ctx = useContext(IconSetContext);
  if (!ctx) throw new Error("useIconSet must be used inside <IconSetProvider>");
  return ctx;
}

/**
 * Ask for the artwork chunk once, so the next render can draw it.
 *
 * The artwork used to be in the entry bundle, which meant every icon drew its
 * real SVG on the first paint with nothing to warm. It is a separate chunk now,
 * so something has to request it — and until it arrives, `glyphArtwork` and
 * `fluentArtworkSync` answer `undefined` and every caller falls back to Lucide,
 * which is the pre-Batch-7 appearance the codebase already treats as correct.
 *
 * Call it unconditionally, at the top of a component, like any hook. It takes
 * no argument and returns nothing on purpose: there is no value here to depend
 * on, only a request to make, and the component draws icons as part of its tree,
 * so it re-renders when the module lands.
 */
export function useWarmFluentArtwork(): void {
  useEffect(() => {
    void loadFluentArtwork();
  }, []);
}

/** Props for <GlyphIcon>. */
export type GlyphIconProps = {
  /** The emoji as it appears in the data. */
  glyph: string;
  /** CSS class for the rendered element. */
  className?: string;
  /**
   * Accessible name. Omitted by default, so the icon is decorative and hidden
   * from assistive technology — correct for the common case where the glyph
   * sits beside a visible label. Every call site in this app is decorative.
   */
  label?: string;
};

/**
 * Render one glyph according to the current selection.
 *
 * THIS IS A COMPONENT, NOT A HOOK, AND THAT IS LOAD-BEARING.
 * Most call sites are inside a `.map()` — a pill per activity, a badge per
 * achievement, a column per outcome. A hook called there would run a
 * different number of times on every render and break the rules of hooks.
 * A component is a legitimate child of a list, so `<GlyphIcon glyph={a.icon} />`
 * is safe in a map and is the ONLY form the call sites use.
 *
 * The fallback chain is: chosen set's asset → Lucide → literal character. A
 * user-typed custom emoji is not in the registry, so it takes the last branch
 * immediately and is rendered verbatim — which is correct, not a degraded
 * path: their emoji is theirs and no set should replace it.
 */
export function GlyphIcon({ glyph, className, label }: GlyphIconProps) {
  const { selected, appliedAt } = useIconSet();
  // Read so the component re-renders when a set finishes warming; the swap
  // then lands once, in one pass, rather than glyph by glyph as they scroll.
  void appliedAt;

  const mode = renderModeFor(selected, glyph);
  const def = glyphDef(glyph);

  if (!def) return <>{glyph}</>;
  if (mode === "emoji") return <>{glyph}</>;

  if (mode === "component") {
    const Comp = getIcon(def.lucide);
    return Comp ? <Comp className={className} label={label} /> : <>{glyph}</>;
  }

  if (mode === "inline") {
    const artwork = glyphArtwork(selected, glyph);
    if (!artwork) {
      // The stem is in the registry and the module is generated from the same
      // registry, so this cannot happen. If it ever does, the Lucide icon is a
      // perfectly good icon — the last branch of the chain.
      const Fallback = getIcon(def.lucide);
      return Fallback ? <Fallback className={className} label={label} /> : <>{glyph}</>;
    }
    return (
      <InlineArtwork
        svg={artwork}
        className={className}
        label={label}
      />
    );
  }

  // The last branch of the chain. Unreachable for every shipped set — each
  // one either names a component, draws a character, or has its artwork
  // inlined — but kept so a future set cannot render nothing at all.
  const Comp = getIcon(def.lucide);
  return Comp ? <Comp className={className} label={label} /> : <>{glyph}</>;
}

/** Re-exported so the picker does not have to reach into the registry. */
export { GLYPHS, coerceIconSetId, iconSetDef };

/**
 * One piece of inlined artwork.
 *
 * WHY `dangerouslySetInnerHTML` AND NOT A data URI
 * A data URI would have to percent-encode every `<`, `>`, `"` and `#` in the
 * fragment, which costs about a third again on top of bytes that are already
 * the single largest thing in the bundle. And there is nothing untrusted here:
 * the string is our own vendored MIT-licensed artwork, generated into the
 * source tree by `scripts/vendor-fluent-artwork.ts`, which refuses to write a
 * fragment that is not a well-formed `<svg>` with a `viewBox` and a drawing
 * element. No user input reaches this prop — a glyph the user typed that is not
 * in the registry never gets here, because `glyphDef` returns undefined for it
 * and `GlyphIcon` drew the character instead.
 *
 * The element is still `aria-hidden` by default and still sized in `em`, so it
 * behaves exactly like the `<img>` it replaces.
 */
export function InlineArtwork({
  svg,
  className,
  label,
  style,
}: {
  svg: string;
  className?: string;
  label?: string;
  /**
   * An explicit box for the artwork, used by `<ContentIcon>` to keep a routed
   * icon the same size the Lucide one it replaced was. Optional, so every
   * existing call site keeps `.iconset-inline`'s 1em box untouched.
   */
  style?: CSSProperties;
}) {
  return (
    <span
      className={className ? `iconset-inline ${className}` : "iconset-inline"}
      style={style}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
export type { IconSetId };

/**
 * Split a stored activity label into its leading emoji and the rest.
 *
 * `DEFAULT_ACTIVITIES` keeps the emoji INSIDE the label string ("🚶 Mozgás"),
 * because `correlationGrid` matches entries on that exact string. The data is
 * therefore never rewritten — this only reads the shape back apart so the
 * glyph can be drawn by the chosen set while the text stays the user's.
 *
 * A label with no leading emoji (a user-typed custom activity, or one whose
 * icon did not survive a bad import) comes back as all-text, and the caller
 * renders it unchanged. Nothing here throws or truncates.
 */
export function splitActivityLabel(label: string): { glyph?: string; text: string } {
  const m = label.match(/^(\S+)\s+([\s\S]+)$/);
  if (!m) return { text: label };
  const [, glyph, text] = m;
  // Only treat it as an icon if we actually know the glyph; otherwise the
  // first word is part of the label and must stay in the text.
  return glyphDef(glyph) ? { glyph, text } : { text: label };
}

/** Draw a stored activity label: the leading emoji via the set, the rest as text. */
export function ActivityLabel({ label }: { label: string }) {
  const { glyph, text } = splitActivityLabel(label);
  if (!glyph) return <>{text}</>;
  return (
    <>
      <GlyphIcon glyph={glyph} /> {text}
    </>
  );
}
