import { colors, shadows } from '../colors';
import type { AppTheme } from '../types';

export const darkTheme: AppTheme = {
  mode: 'dark',
  colors: {
    primary: colors.primary,
    primaryMuted: '#173065',
    income: colors.income,
    expense: colors.expense,
    background: '#06070B',
    surface: '#121317',
    border: 'rgba(255, 255, 255, 0.08)',
    text: '#F8FAFF',
    textMuted: '#94A0B6',
    cardBackground: 'rgba(18, 19, 23, 0.92)',
    cardBorder: 'rgba(255, 255, 255, 0.08)',
    buttonPrimaryBackground: colors.primary,
    buttonPrimaryText: '#FFFFFF',
    inputBackground: '#0D0F14',
    inputBorder: 'rgba(255,255,255,0.06)',
    inputBorderFocused: colors.primary,
    inputBorderError: colors.expense,
    inputText: '#F8FAFF',
    inputPlaceholder: '#5B6478',
    inputIcon: '#7B8498',
    label: '#E5EBF7',
    labelMuted: '#9EA7BC',
    authGlowTop: 'rgba(47, 107, 255, 0.18)',
    authGlowBottom: 'rgba(47, 107, 255, 0.12)',
  },
  shadows: {
    card: {
      ...shadows.card,
      shadowColor: '#000000',
      shadowOpacity: 0.35,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 16 },
      elevation: 12,
    },
  },
};
