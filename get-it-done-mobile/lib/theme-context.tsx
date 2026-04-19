import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { themes, type ThemeName } from './theme';
import type { MD3Theme } from 'react-native-paper';

interface ThemeContextValue {
  themeName: ThemeName;
  theme: MD3Theme;
  setThemeName: (name: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeName, setThemeNameState] = useState<ThemeName>('focus');

  const setThemeName = useCallback((name: ThemeName) => {
    setThemeNameState(name);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ themeName, theme: themes[themeName], setThemeName }),
    [themeName, setThemeName]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useAppTheme must be used inside <ThemeProvider>');
  return ctx;
}
