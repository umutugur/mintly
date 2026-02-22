import { StyleSheet, Text, View } from 'react-native';

import { darkTheme, radius, spacing, typography, useTheme, type AppTheme } from '@shared/theme';
import type { AppIconName } from './AppIcon';
import { AppIcon } from './AppIcon';

type ChipTone = 'default' | 'primary' | 'income' | 'expense';

interface ChipProps {
  label: string;
  tone?: ChipTone;
  dark?: boolean;
  selected?: boolean;
  iconName?: AppIconName;
}

export function Chip({
  label,
  tone = 'default',
  dark = false,
  selected = false,
  iconName,
}: ChipProps) {
  const { theme } = useTheme();
  const activeTheme = dark ? darkTheme : theme;
  const palette = getPalette(tone, activeTheme, selected);

  return (
    <View style={[styles.chip, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      {iconName ? <AppIcon name={iconName} size="xs" color={palette.text} /> : null}
      <Text ellipsizeMode="tail" numberOfLines={1} style={[styles.label, { color: palette.text }]}>
        {label}
      </Text>
    </View>
  );
}

function getPalette(tone: ChipTone, theme: AppTheme, selected: boolean) {
  if (selected && tone === 'default') {
    return {
      bg: theme.mode === 'dark' ? withAlpha(theme.colors.primary, 0.24) : theme.colors.primaryMuted,
      text: theme.colors.primary,
      border: theme.mode === 'dark' ? withAlpha(theme.colors.primary, 0.42) : withAlpha(theme.colors.primary, 0.22),
    };
  }

  if (tone === 'primary') {
    return {
      bg: theme.mode === 'dark' ? withAlpha(theme.colors.primary, 0.24) : theme.colors.primaryMuted,
      text: theme.colors.primary,
      border: theme.mode === 'dark' ? withAlpha(theme.colors.primary, 0.42) : withAlpha(theme.colors.primary, 0.22),
    };
  }

  if (tone === 'income') {
    return {
      bg: withAlpha(theme.colors.income, theme.mode === 'dark' ? 0.22 : 0.12),
      text: theme.colors.income,
      border: withAlpha(theme.colors.income, theme.mode === 'dark' ? 0.42 : 0.26),
    };
  }

  if (tone === 'expense') {
    return {
      bg: withAlpha(theme.colors.expense, theme.mode === 'dark' ? 0.2 : 0.12),
      text: theme.colors.expense,
      border: withAlpha(theme.colors.expense, theme.mode === 'dark' ? 0.4 : 0.24),
    };
  }

  return {
    bg: theme.mode === 'dark' ? withAlpha(theme.colors.text, 0.08) : withAlpha(theme.colors.textMuted, 0.12),
    text: theme.colors.textMuted,
    border: theme.colors.border,
  };
}

function withAlpha(hexColor: string, alpha: number): string {
  const color = hexColor.trim();
  const hex = color.startsWith('#') ? color.slice(1) : color;

  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    return color;
  }

  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(alpha, 1))})`;
}

const styles = StyleSheet.create({
  chip: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xxs,
    maxWidth: '100%',
    borderWidth: 1,
    borderRadius: radius.full,
    minHeight: 28,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    alignSelf: 'flex-start',
  },
  label: {
    ...typography.caption,
    fontWeight: '600',
    maxWidth: 140,
  },
});
