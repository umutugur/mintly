export type ThemeMode = 'light' | 'dark';
export type ThemePreference = 'system' | ThemeMode;

export interface ThemeColors {
  primary: string;
  primaryMuted: string;
  income: string;
  expense: string;
  background: string;
  surface: string;
  border: string;
  text: string;
  textMuted: string;
  cardBackground: string;
  cardBorder: string;
  buttonPrimaryBackground: string;
  buttonPrimaryText: string;
  inputBackground: string;
  inputBorder: string;
  inputBorderFocused: string;
  inputBorderError: string;
  inputText: string;
  inputPlaceholder: string;
  inputIcon: string;
  label: string;
  labelMuted: string;
  authGlowTop: string;
  authGlowBottom: string;
}

export interface AppTheme {
  mode: ThemeMode;
  colors: ThemeColors;
  shadows: {
    card: {
      shadowColor: string;
      shadowOpacity: number;
      shadowRadius: number;
      shadowOffset: { width: number; height: number };
      elevation: number;
    };
  };
}
