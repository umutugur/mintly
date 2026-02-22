import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';

import { darkTheme } from './themes/dark';
import { lightTheme } from './themes/light';
import type { AppTheme, ThemeMode, ThemePreference } from './types';

interface ThemeContextValue {
  preference: ThemePreference;
  mode: ThemeMode;
  theme: AppTheme;
  setPreference: (preference: ThemePreference) => void;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
}

interface ThemeProviderProps {
  children: ReactNode;
  mode?: ThemeMode;
  initialPreference?: ThemePreference;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveTheme(mode: ThemeMode): AppTheme {
  return mode === 'dark' ? darkTheme : lightTheme;
}

export function ThemeProvider({
  children,
  mode,
  initialPreference = 'light',
}: ThemeProviderProps) {
  const [preference, setInternalPreference] = useState<ThemePreference>(initialPreference);
  const systemMode = useColorScheme() === 'dark' ? 'dark' : 'light';
  const effectiveMode = mode ?? (preference === 'system' ? systemMode : preference);

  const setPreference = useCallback((nextPreference: ThemePreference) => {
    if (mode === undefined) {
      setInternalPreference(nextPreference);
    }
  }, [mode]);

  const setMode = useCallback(
    (nextMode: ThemeMode) => {
      setPreference(nextMode);
    },
    [setPreference],
  );

  const toggleMode = useCallback(() => {
    setMode(effectiveMode === 'light' ? 'dark' : 'light');
  }, [effectiveMode, setMode]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference: mode ? mode : preference,
      mode: effectiveMode,
      theme: resolveTheme(effectiveMode),
      setPreference,
      setMode,
      toggleMode,
    }),
    [effectiveMode, mode, preference, setMode, setPreference, toggleMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }

  return context;
}
