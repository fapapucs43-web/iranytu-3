/**
 * Font selection context (Batch 5, P10b → revised in Batch 8).
 *
 * Mirrors how ThemeContext is wired — the choice lives in the existing
 * `Settings` blob, so it persists through the same store, the same JSON
 * export, and the same "Minden adat törlése" wipe, with no new storage key and
 * nothing for the data model to migrate.
 *
 * The provider does four things on selection:
 *   1. preload a hint for each selected family (so the fetch starts earlier),
 *   2. load each family that is a web font (nothing for `system`/`none`),
 *   3. only then write `--app-font` and `--hand-font`, so the swap is atomic
 *      and the user never sees a half-applied face,
 *   4. remember which families are ready, so the picker can preview them.
 *
 * The two families are warmed independently on purpose. If a single slow
 * network request held up the other, a user on a train would see their notes
 * stuck in the previous face because the script file had not arrived — the
 * notes are the one thing that must never be left mid-swap.
 *
 * AND IT SAYS SO WHEN A FAMILY IS WITHDRAWN
 * A retired family is moved to its successor in `lib/store` at load time, before
 * anything renders, so the app never breaks on an id it no longer knows. But a
 * setting that quietly becomes a different typeface looks exactly like a bug,
 * and a user who deliberately chose a face deserves to know it is gone and why.
 * So the move is announced once, in the user's own terms, with the reason —
 * which for Lato is the honest one: the file could not spell Hungarian.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useApp } from "./AppContext";
import {
  DEFAULT_HAND_FONT,
  RETIRED_FONT_LABELS,
  RETIRED_FONT_REASONS,
  RETIRED_FONT_REPLACEMENT,
  fontDef,
  fontStack,
  isHandFontId,
  normalizeFontFamily,
  type FontId,
  type HandFontId,
} from "../lib/fonts";
import { consumeRetiredFontNotice } from "../lib/store";
import {
  applyFontStack,
  applyHandStack,
  isFontReady,
  isHandFontReady,
  loadFont,
  loadHandFont,
  preloadFont,
  preloadHandFont,
} from "../lib/fonts-runtime";
import { PRELOAD_FONT_IDS } from "../lib/fonts";
import { createIdleWarmer, decidePreload } from "../lib/font-preload";

type FontContextValue = {
  /** The effective, validated selection. Never an unknown id. */
  fontId: FontId;
  /** True once the family is registered and applied. */
  ready: boolean;
  setFont: (id: FontId) => void;
  /** The handwriting face for the user's own words, or `none`. */
  handFontId: HandFontId;
  /** True once the handwriting family is registered, or was never needed. */
  handReady: boolean;
  setHandFont: (id: HandFontId) => void;
  /**
   * Load a family without selecting it, so the picker can show a real sample
   * on hover/focus before the user commits to it.
   */
  loadForPreview: (id: FontId) => void;
  /** The same, for a handwriting face. */
  loadHandForPreview: (id: HandFontId) => void;
  /** Changes when a family finishes applying; consumers can key samples on it. */
  appliedAt: number;
};

const FontContext = createContext<FontContextValue | null>(null);

export function FontProvider({ children }: { children: ReactNode }) {
  const { data, setSettings, notify } = useApp();
  const stored = data.settings.fontFamily;
  // `normalizeFontFamily` rather than `isFontId ? … : DEFAULT_FONT`, because it
  // is the thing that knows a retired family (Manrope, Plus Jakarta Sans) has a
  // deliberate successor. A user who picked one keeps a face; a corrupt value
  // still costs nothing.
  const fontId: FontId = normalizeFontFamily(stored);
  const handFontId: HandFontId = isHandFontId(data.settings.handFont)
    ? data.settings.handFont
    : DEFAULT_HAND_FONT;

  // Bumped once a selected family is actually applied, so consumers that
  // render a sample (the picker) re-render in the new face.
  const [appliedAt, setAppliedAt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // The hint goes in immediately — it is only useful if it lands before the
    // download we are about to start.
    preloadFont(fontId);
    void loadFont(fontId).then(() => {
      if (cancelled) return;
      applyFontStack(fontId);
      setAppliedAt(Date.now());
    });
    return () => {
      cancelled = true;
    };
  }, [fontId]);

  useEffect(() => {
    let cancelled = false;
    preloadHandFont(handFontId);
    void loadHandFont(handFontId).then(() => {
      if (cancelled) return;
      applyHandStack(handFontId, fontId);
      setAppliedAt(Date.now());
    });
    return () => {
      cancelled = true;
    };
    // `fontId` is a dependency on purpose: with handwriting off, `--hand-font`
    // has to be re-written when the UI family changes, or the notes would keep
    // the previous family while everything else moved on.
  }, [handFontId, fontId]);

  // One-time, and deliberately keyed on nothing but `notify`: the announcement
  // is an EVENT. It must not reappear because the user changed families, and it
  // must not reappear on every re-render of a provider that re-mounts.
  useEffect(() => {
    const retired = consumeRetiredFontNotice();
    if (!retired) return;
    const reason = RETIRED_FONT_REASONS[retired] ?? "már nem elérhető";
    const was = RETIRED_FONT_LABELS[retired] ?? retired;
    notify(
      `A ${was} betűtípus már nem elérhető — ${reason}. ` +
        `Helyette mostantól a ${fontDef(RETIRED_FONT_REPLACEMENT).label} látszik, ` +
        `de bármelyiket visszaválaszthatod a Beállításokban.`,
    );
  }, [notify]);

  // WARM THE FAMILIES THE USER IS LIKELY TO PICK, IN THE BACKGROUND
  //
  // Mount-once, and never awaited by anything: the whole point is that the app
  // is usable and interactive while this happens. The decision is read once
  // here and handed to `createIdleWarmer`, which is where the connection
  // judgement and the scheduling live — this effect only supplies the window
  // and says what "warm one" means, which is the existing `loadFont`.
  //
  // The cleanup cancels rather than finishing the list. A user who closes the
  // tab mid-warm should not keep paying for five typefaces they will never look
  // at, and the picker loads any family on hover anyway.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const connection = (
      window.navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string };
      }
    ).connection;
    const { warm } = decidePreload(connection, PRELOAD_FONT_IDS);
    if (warm.length === 0) return;
    const warmer = createIdleWarmer(window, {
      ids: warm,
      onWarm: (id) => {
        // `loadFont` is idempotent and already knows how to register a family,
        // dedupe an in-flight request, and survive a file that will not load.
        // Reusing it is why the warmer needs no error handling of its own.
        void loadFont(id);
      },
    });
    warmer.start();
    return () => warmer.cancel();
  }, []);

  // One-time, and deliberately NOT keyed on anything: the announcement is an
  // event, so it must not reappear because the user changed families, and it
  // must not reappear on every render of a provider that re-mounts.
  useEffect(() => {
    const retired = consumeRetiredFontNotice();
    if (!retired) return;
    const reason = RETIRED_FONT_REASONS[retired];
    notify(
      `A ${fontDef(retired).label} betűtípus már nem elérhető — ${reason}. ` +
        `Helyette mostantól a(z) ${fontDef(RETIRED_FONT_REPLACEMENT).label} látszik. ` +
        `Bármelyiket visszaválaszthatod a Beállításokban.`,
    );
  }, [notify]);

  const setFont = useCallback(
    (id: FontId) => setSettings({ ...data.settings, fontFamily: id }),
    [data.settings, setSettings],
  );
  const setHandFont = useCallback(
    (id: HandFontId) => setSettings({ ...data.settings, handFont: id }),
    [data.settings, setSettings],
  );

  const loadForPreview = useCallback((id: FontId) => {
    void loadFont(id);
  }, []);

  const loadHandForPreview = useCallback((id: HandFontId) => {
    void loadHandFont(id);
  }, []);

  const value = useMemo<FontContextValue>(
    () => ({
      fontId,
      ready: isFontReady(fontId),
      setFont,
      handFontId,
      handReady: isHandFontReady(handFontId),
      setHandFont,
      loadForPreview,
      loadHandForPreview,
      appliedAt,
    }),
    // `appliedAt` is a deliberate dependency: it is what makes the picker
    // samples re-render in the newly loaded face.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fontId, handFontId, appliedAt, setFont, setHandFont, loadForPreview, loadHandForPreview],
  );

  return <FontContext.Provider value={value}>{children}</FontContext.Provider>;
}

export function useFont(): FontContextValue {
  const ctx = useContext(FontContext);
  if (!ctx) throw new Error("useFont must be used inside <FontProvider>");
  return ctx;
}

export { fontDef, fontStack };
export type { FontId, HandFontId };
