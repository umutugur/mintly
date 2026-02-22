import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { AppIconName } from './AppIcon';
import { AppIcon } from './AppIcon';
import { radius, spacing, typography, useTheme } from '@shared/theme';

interface ExpenseRowProps {
  title: string;
  subtitle: string;
  amount: string;
  indicator: string;
  indicatorTone: 'positive' | 'negative' | 'neutral';
  iconName: AppIconName;
  iconTone?: 'primary' | 'muted' | 'text' | 'income' | 'expense' | 'inverse';
  onPress?: () => void;
}

function toneColor(
  tone: 'positive' | 'negative' | 'neutral',
  colors: {
    income: string;
    expense: string;
    textMuted: string;
  },
): string {
  if (tone === 'positive') {
    return colors.income;
  }
  if (tone === 'negative') {
    return colors.expense;
  }
  return colors.textMuted;
}

export function ExpenseRow({
  title,
  subtitle,
  amount,
  indicator,
  indicatorTone,
  iconName,
  iconTone = 'primary',
  onPress,
}: ExpenseRowProps) {
  const { theme, mode } = useTheme();
  const dark = mode === 'dark';

  const inner = (
    <View
      style={[
        styles.row,
        {
          backgroundColor: dark ? '#141E33' : '#FFFFFF',
          borderColor: dark ? 'rgba(255,255,255,0.10)' : '#E2E9F5',
        },
      ]}
    >
      <View style={styles.leftWrap}>
        <View
          style={[
            styles.iconWrap,
            {
              backgroundColor: dark ? 'rgba(47,107,255,0.20)' : '#ECF1FF',
            },
          ]}
        >
          <AppIcon name={iconName} size="sm" tone={iconTone} />
        </View>

        <View style={styles.metaWrap}>
          <Text numberOfLines={1} style={[styles.title, { color: theme.colors.text }]}>
            {title}
          </Text>
          <Text numberOfLines={1} style={[styles.subtitle, { color: theme.colors.textMuted }]}>
            {subtitle}
          </Text>
        </View>
      </View>

      <View style={styles.rightWrap}>
        <Text numberOfLines={1} style={[styles.amount, { color: theme.colors.text }]}>
          {amount}
        </Text>
        <Text
          numberOfLines={1}
          style={[
            styles.indicator,
            { color: toneColor(indicatorTone, theme.colors) },
          ]}
        >
          {indicator}
        </Text>
      </View>
    </View>
  );

  if (!onPress) {
    return inner;
  }

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [pressed && styles.pressed]}>
      {inner}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  pressed: {
    opacity: 0.86,
  },
  leftWrap: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minWidth: 0,
  },
  iconWrap: {
    alignItems: 'center',
    borderRadius: radius.sm,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  metaWrap: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  title: {
    ...typography.body,
    fontWeight: '700',
  },
  subtitle: {
    ...typography.caption,
    fontSize: 11,
  },
  rightWrap: {
    alignItems: 'flex-end',
    marginLeft: spacing.sm,
  },
  amount: {
    ...typography.subheading,
    fontSize: 15,
    fontWeight: '700',
  },
  indicator: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: '700',
  },
});
