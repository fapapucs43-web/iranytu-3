import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { CustomTheme, ThemeName } from "../types";
import { applyThemeTokens, resolveTheme, THEMES } from "../lib/themes";
import { PREFERS_DARK, subscribeToMediaQuery } from "../lib/media";
import { useApp } from "./AppContext";

type ThemeContextValue = {
  theme: ThemeName;
  customTheme: CustomTheme;
  setTheme: (name: ThemeName) => void;
  setCustomColor: (key: keyof CustomTheme, value: string) => void;
  resetCustomTheme: () => void;
  /** Live resolved tokens — lets any component consume theme values. */
  tokens: Record<string, string>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { data, setSettings } = useApp();
  const theme = data.settings.theme;
  const customTheme = data.settings.customTheme;

  const [liveCustom, setLiveCustom] = useState<CustomTheme>(customTheme ?? {});

  // Keep the live editor state in sync when settings change elsewhere.
  useEffect(() => {
    setLiveCustom(customTheme ?? {});
  }, [customTheme]);

  // Apply instantly on every theme/custom-color change. While "auto" is
  // active, re-apply when the OS preference changes — which is the whole point
  // of the mode, and it is a live subscription rather than a value read at
  // launch. The query and the listener both come from `lib/media`, because the
  // older `addListener` spelling is the only one Safari 13 has and the direct
  // `addEventListener?.()` call this replaced was a silent no-op there.
  useEffect(() => {
    applyThemeTokens(resolveTheme(theme, liveCustom));
    if (theme !== "auto") return;
    return subscribeToMediaQuery(PREFERS_DARK, () => {
      applyThemeTokens(resolveTheme("auto", liveCustom));
    });
  }, [theme, liveCustom]);

  const setTheme = useCallback(
    (name: ThemeName) => setSettings({ ...data.settings, theme: name }),
    [data.settings, setSettings],
  );

  const setCustomColor = useCallback(
    (key: keyof CustomTheme, value: string) => {
      setLiveCustom((prev) => {
        const next = { ...prev, [key]: value };
        applyThemeTokens(resolveTheme("custom", next));
        return next;
      });
    },
    [],
  );

  const resetCustomTheme = useCallback(() => {
    setLiveCustom({});
    applyThemeTokens(resolveTheme("light", {}));
  }, []);

  const tokens = useMemo(() => resolveTheme(theme, liveCustom), [theme, liveCustom]);

  return (
    <ThemeContext.Provider
      value={{ theme, customTheme: liveCustom, setTheme, setCustomColor, resetCustomTheme, tokens }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}

/** Preset tokens, handy for swatches and the gallery. */
export { THEMES };
