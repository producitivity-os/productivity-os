/* eslint-disable react-refresh/only-export-components */
import * as React from "react";

type Theme = "dark" | "light" | "system";
type ResolvedTheme = Exclude<Theme, "system">;

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeContextValue = {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme(theme: Theme): void;
};

const ThemeContext = React.createContext<ThemeContextValue | undefined>(
  undefined,
);
const colorSchemeQuery = "(prefers-color-scheme: dark)";

function isTheme(value: string | null): value is Theme {
  return value === "dark" || value === "light" || value === "system";
}

function systemTheme(): ResolvedTheme {
  return window.matchMedia(colorSchemeQuery).matches ? "dark" : "light";
}

function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "app-theme",
}: ThemeProviderProps) {
  const [theme, setThemeState] = React.useState<Theme>(() => {
    const stored = window.localStorage.getItem(storageKey);
    return isTheme(stored) ? stored : defaultTheme;
  });
  const [resolvedTheme, setResolvedTheme] = React.useState<ResolvedTheme>(() =>
    theme === "system" ? systemTheme() : theme,
  );

  const setTheme = React.useCallback(
    (nextTheme: Theme) => {
      window.localStorage.setItem(storageKey, nextTheme);
      setThemeState(nextTheme);
      window.dispatchEvent(
        new CustomEvent("shared-ui:theme-change", {
          detail: { storageKey, theme: nextTheme },
        }),
      );
    },
    [storageKey],
  );

  React.useLayoutEffect(() => {
    const media = window.matchMedia(colorSchemeQuery);
    const apply = () => {
      const resolved = theme === "system" ? systemTheme() : theme;
      document.documentElement.classList.remove("light", "dark");
      document.documentElement.classList.add(resolved);
      document.documentElement.style.colorScheme = resolved;
      setResolvedTheme(resolved);
    };
    apply();
    if (theme !== "system") return undefined;
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);

  React.useEffect(() => {
    const applyStoredTheme = (value: string | null) => {
      if (isTheme(value)) setThemeState(value);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey) applyStoredTheme(event.newValue);
    };
    const onLocalChange = (event: Event) => {
      const detail = (
        event as CustomEvent<{ storageKey?: string; theme?: string }>
      ).detail;
      if (detail?.storageKey === storageKey)
        applyStoredTheme(detail.theme ?? null);
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("shared-ui:theme-change", onLocalChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("shared-ui:theme-change", onLocalChange);
    };
  }, [storageKey]);

  const value = React.useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );
  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

function useTheme() {
  const context = React.useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within a ThemeProvider");
  return context;
}

export { ThemeProvider, useTheme };
export type { Theme, ThemeProviderProps };
