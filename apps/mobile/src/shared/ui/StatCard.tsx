import { StyleSheet, Text, View } from 'react-native';

import { darkTheme, spacing, typography, useTheme, type AppTheme } from '@shared/theme';

import { Card } from './Card';
import { AppIcon, type AppIconName } from './AppIcon';

type StatTone = 'neutral' | 'income' | 'expense' | 'primary';

interface StatCardProps {
  label: string;
  value: string;
  detail?: string;
  tone?: StatTone;
  dark?: boolean;
  iconName?: AppIconName;
  iconTone?: 'primary' | 'muted' | 'text' | 'income' | 'expense' | 'inverse';
}

export function StatCard({
  label,
  value,
  detail,
  tone = 'neutral',
  dark = false,
  iconName,
  iconTone = 'muted',
}: StatCardProps) {
  const { theme } = useTheme();
  const activeTheme = dark ? darkTheme : theme;
  const valueColor = getValueColor(tone, activeTheme);

  return (
    <Card dark={dark} style={styles.card}>
      <View style={styles.labelRow}>
        {iconName ? <AppIcon name={iconName} size="xs" tone={iconTone} /> : null}
        <Text style={[styles.label, { color: activeTheme.colors.textMuted }]}>{label}</Text>
      </View>
      <Text style={[styles.value, { color: valueColor }]}>{value}</Text>
      {detail ? (
        <Text style={[styles.detail, { color: activeTheme.colors.textMuted }]}>{detail}</Text>
      ) : null}
    </Card>
  );
}

function getValueColor(tone: StatTone, theme: AppTheme): string {
  if (tone === 'income') {
    return theme.colors.income;
  }

  if (tone === 'expense') {
    return theme.colors.expense;
  }

  if (tone === 'primary') {
    return theme.colors.primary;
  }

  return theme.colors.text;
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 140,
    gap: spacing.xs,
  },
  labelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xxs,
  },
  label: {
    ...typography.caption,
  },
  value: {
    ...typography.amount,
  },
  detail: {
    ...typography.caption,
  },
});
