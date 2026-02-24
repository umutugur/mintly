import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@shared/i18n';
import { darkTheme, radius, spacing, typography, useTheme, type AppTheme } from '@shared/theme';
import type { AppIconName } from './AppIcon';
import { AppIcon } from './AppIcon';

import { Card } from './Card';

interface TransactionRowProps {
  title: string;
  date: string;
  amount: string;
  type: 'income' | 'expense';
  kind?: 'normal' | 'transfer';
  dark?: boolean;
  categoryIcon?: string;
  categoryIconName?: AppIconName;
  onPress?: () => void;
  onLongPress?: () => void;
  isDeleted?: boolean;
}

export function TransactionRow({
  title,
  date,
  amount,
  type,
  kind = 'normal',
  dark = false,
  categoryIcon = '•',
  categoryIconName,
  onPress,
  onLongPress,
  isDeleted = false,
}: TransactionRowProps) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const activeTheme = dark ? darkTheme : theme;
  const palette = getPalette(type, kind, activeTheme);

  return (
    <Pressable
      accessibilityRole="button"
      onLongPress={onLongPress}
      onPress={onPress}
      style={({ pressed }) => [pressed && styles.pressed, isDeleted && styles.deletedRow]}
    >
      <Card dark={dark} style={styles.card}>
        <View style={[styles.iconCircle, { backgroundColor: palette.iconBg }]}>
          {categoryIconName ? (
            <AppIcon name={categoryIconName} size="sm" color={palette.iconText} />
          ) : (
            <Text style={[styles.iconText, { color: palette.iconText }]}>{categoryIcon}</Text>
          )}
        </View>

        <View style={styles.meta}>
          <View style={styles.titleRow}>
            <Text numberOfLines={1} style={[styles.title, { color: activeTheme.colors.text }]}>
              {title}
            </Text>
            {kind === 'transfer' ? (
              <View
                style={[
                  styles.kindBadge,
                  {
                    backgroundColor:
                      activeTheme.mode === 'dark'
                        ? withAlpha(activeTheme.colors.primary, 0.24)
                        : activeTheme.colors.primaryMuted,
                  },
                ]}
              >
                <AppIcon name="swap-horizontal-outline" size="xs" color={activeTheme.colors.primary} />
                <Text
                  ellipsizeMode="tail"
                  numberOfLines={1}
                  style={[styles.kindBadgeText, { color: activeTheme.colors.primary }]}
                >
                  {t('transactions.row.transferBadge')}
                </Text>
              </View>
            ) : null}
            {isDeleted ? (
              <View
                style={[
                  styles.kindBadge,
                  {
                    backgroundColor: withAlpha(activeTheme.colors.expense, 0.12),
                  },
                ]}
              >
                <AppIcon name="trash-outline" size="xs" color={activeTheme.colors.expense} />
                <Text
                  ellipsizeMode="tail"
                  numberOfLines={1}
                  style={[styles.kindBadgeText, { color: activeTheme.colors.expense }]}
                >
                  {t('common.deleted', { defaultValue: 'Silindi' })}
                </Text>
              </View>
            ) : null}
          </View>
          <Text numberOfLines={1} style={[styles.date, { color: activeTheme.colors.textMuted }]}>
            {date}
          </Text>
        </View>

        <Text adjustsFontSizeToFit numberOfLines={1} style={[styles.amount, { color: palette.amount }]}>
          {amount}
        </Text>
      </Card>
    </Pressable>
  );
}

function getPalette(type: 'income' | 'expense', kind: 'normal' | 'transfer', theme: AppTheme) {
  if (kind === 'transfer') {
    return {
      iconBg: theme.mode === 'dark' ? withAlpha(theme.colors.primary, 0.2) : theme.colors.primaryMuted,
      iconText: theme.colors.primary,
      amount: type === 'income' ? theme.colors.income : theme.colors.expense,
    };
  }

  if (type === 'income') {
    return {
      iconBg: withAlpha(theme.colors.income, theme.mode === 'dark' ? 0.2 : 0.12),
      iconText: theme.colors.income,
      amount: theme.colors.income,
    };
  }

  return {
    iconBg: withAlpha(theme.colors.expense, theme.mode === 'dark' ? 0.18 : 0.12),
    iconText: theme.colors.expense,
    amount: theme.colors.expense,
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
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  deletedRow: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.92,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    ...typography.subheading,
    fontSize: 14,
    lineHeight: 16,
  },
  meta: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  title: {
    ...typography.body,
    fontWeight: '600',
    flexShrink: 1,
    fontSize: 15,
  },
  kindBadge: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xxs,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  kindBadgeText: {
    ...typography.caption,
    fontWeight: '700',
    fontSize: 10,
  },
  date: {
    ...typography.caption,
    fontSize: 11,
  },
  amount: {
    ...typography.subheading,
    fontWeight: '700',
  },
});
