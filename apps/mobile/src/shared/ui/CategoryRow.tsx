import { StyleSheet, Text, View } from 'react-native';

import { darkTheme, spacing, typography, useTheme, type AppTheme } from '@shared/theme';

import { Card } from './Card';

interface CategoryRowProps {
  title: string;
  subtitle: string;
  amount: string;
  amountTone?: 'income' | 'expense' | 'neutral';
  dark?: boolean;
}

export function CategoryRow({
  title,
  subtitle,
  amount,
  amountTone = 'neutral',
  dark = false,
}: CategoryRowProps) {
  const { theme } = useTheme();
  const activeTheme = dark ? darkTheme : theme;

  return (
    <Card dark={dark} style={styles.card}>
      <View style={styles.left}>
        <Text style={[styles.title, { color: activeTheme.colors.text }]}>{title}</Text>
        <Text style={[styles.subtitle, { color: activeTheme.colors.textMuted }]}>{subtitle}</Text>
      </View>
      <Text style={[styles.amount, { color: amountColor(amountTone, activeTheme) }]}>{amount}</Text>
    </Card>
  );
}

function amountColor(tone: 'income' | 'expense' | 'neutral', theme: AppTheme): string {
  if (tone === 'income') {
    return theme.colors.income;
  }

  if (tone === 'expense') {
    return theme.colors.expense;
  }

  return theme.colors.text;
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  left: {
    flex: 1,
    gap: spacing.xxs,
  },
  title: {
    ...typography.subheading,
  },
  subtitle: {
    ...typography.caption,
  },
  amount: {
    ...typography.subheading,
  },
});
