import { colors, shadows } from '../colors';
import type { AppTheme } from '../types';

export const lightTheme: AppTheme = {
  mode: 'light',
  colors: {
    primary: colors.primary,
    primaryMuted: colors.primaryMuted,
    income: colors.income,
    expense: colors.expense,
    background: colors.background,
    surface: colors.surface,
    border: colors.border,
    text: colors.text,
    textMuted: colors.textMuted,
    cardBackground: colors.surface,
    cardBorder: colors.border,
    buttonPrimaryBackground: colors.primary,
    buttonPrimaryText: '#FFFFFF',
    inputBackground: colors.surface,
    inputBorder: colors.border,
    inputBorderFocused: colors.primary,
    inputBorderError: colors.expense,
    inputText: colors.text,
    inputPlaceholder: colors.textMuted,
    inputIcon: colors.textMuted,
    label: colors.text,
    labelMuted: colors.textMuted,
    authGlowTop: 'rgba(47, 107, 255, 0.18)',
    authGlowBottom: 'rgba(47, 107, 255, 0.12)',
  },
  shadows,
};
