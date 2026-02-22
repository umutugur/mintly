import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

import { useTheme } from '@shared/theme';

export type AppIconName = ComponentProps<typeof Ionicons>['name'];

type AppIconTone = 'primary' | 'muted' | 'text' | 'income' | 'expense' | 'inverse';
type AppIconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;

interface AppIconProps {
  name: AppIconName;
  size?: AppIconSize;
  tone?: AppIconTone;
  color?: string;
}

const SIZE_MAP: Record<Exclude<AppIconSize, number>, number> = {
  xs: 12,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 28,
};

const FALLBACK_ICON: AppIconName = 'ellipse-outline';
const GLYPH_MAP: Record<string, number> =
  ((Ionicons as unknown as { glyphMap?: Record<string, number> }).glyphMap ?? {});

export function AppIcon({ name, size = 'md', tone = 'muted', color }: AppIconProps) {
  const { theme } = useTheme();

  const resolvedSize = typeof size === 'number' ? size : SIZE_MAP[size];
  const resolvedColor =
    color ??
    {
      primary: theme.colors.primary,
      muted: theme.colors.textMuted,
      text: theme.colors.text,
      income: theme.colors.income,
      expense: theme.colors.expense,
      inverse: theme.colors.buttonPrimaryText,
    }[tone];

  const resolvedName: AppIconName = Object.prototype.hasOwnProperty.call(GLYPH_MAP, name)
    ? name
    : FALLBACK_ICON;

  return <Ionicons name={resolvedName} size={resolvedSize} color={resolvedColor} />;
}
