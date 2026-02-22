import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@shared/i18n';
import { radius, spacing, typography, useTheme } from '@shared/theme';

interface MemberChipProps {
  name: string;
  balance?: number;
  currency?: string;
  selected?: boolean;
  onPress?: () => void;
  showBalance?: boolean;
}

function toInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return '?';
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

function formatMoney(amount: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function MemberChip({
  name,
  balance = 0,
  currency = 'TRY',
  selected = false,
  onPress,
  showBalance = false,
}: MemberChipProps) {
  const { theme, mode } = useTheme();
  const { locale, t } = useI18n();
  const dark = mode === 'dark';

  const subtitle = showBalance
    ? balance > 0
      ? t('split.groupDetail.member.creditor')
      : balance < 0
        ? t('split.groupDetail.member.debtor')
        : t('split.groupDetail.member.balanced')
    : null;

  const baseStyle = [
    styles.wrap,
    {
      backgroundColor: selected
        ? dark
          ? 'rgba(47,107,255,0.24)'
          : '#EAF0FF'
        : dark
          ? '#111A30'
          : '#FFFFFF',
      borderColor: selected
        ? theme.colors.primary
        : dark
          ? 'rgba(255,255,255,0.12)'
          : '#DFE7F4',
    },
  ];

  const content = (
    <>
      <View
        style={[
          styles.avatar,
          {
            backgroundColor: dark ? 'rgba(83,102,145,0.32)' : '#E9EEFA',
          },
        ]}
      >
        <Text style={[styles.avatarText, { color: theme.colors.text }]}>{toInitials(name)}</Text>
      </View>

      <View style={styles.textWrap}>
        <Text numberOfLines={1} style={[styles.name, { color: theme.colors.text }]}>
          {name}
        </Text>
        {showBalance ? (
          <Text
            numberOfLines={1}
            style={[
              styles.balance,
              {
                color: balance > 0 ? theme.colors.income : balance < 0 ? theme.colors.expense : theme.colors.textMuted,
              },
            ]}
          >
            {balance > 0 ? '+' : balance < 0 ? '-' : ''}
            {formatMoney(Math.abs(balance), currency, locale)}
          </Text>
        ) : null}
        {subtitle ? (
          <Text numberOfLines={1} style={[styles.subtitle, { color: theme.colors.textMuted }]}> 
            {subtitle}
          </Text>
        ) : null}
      </View>

      {selected ? (
        <View style={[styles.check, { backgroundColor: theme.colors.primary }]}> 
          <Text style={styles.checkText}>✓</Text>
        </View>
      ) : null}
    </>
  );

  if (!onPress) {
    return <View style={baseStyle}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [baseStyle, pressed ? styles.pressed : null]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minWidth: 138,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    position: 'relative',
  },
  pressed: {
    opacity: 0.86,
  },
  avatar: {
    alignItems: 'center',
    borderRadius: radius.full,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  avatarText: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  textWrap: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  name: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '700',
  },
  balance: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '700',
  },
  subtitle: {
    ...typography.caption,
    fontSize: 10,
  },
  check: {
    alignItems: 'center',
    borderRadius: radius.full,
    height: 16,
    justifyContent: 'center',
    position: 'absolute',
    right: 6,
    top: 6,
    width: 16,
  },
  checkText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 12,
  },
});
