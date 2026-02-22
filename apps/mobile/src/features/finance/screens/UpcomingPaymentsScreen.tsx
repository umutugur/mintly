import { useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { UpcomingPayment } from '@mintly/shared';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@app/providers/AuthProvider';
import { apiClient } from '@core/api/client';
import { financeQueryKeys } from '@core/api/queryKeys';
import type { TransactionsStackParamList } from '@core/navigation/stacks/TransactionsStack';
import { Card, PrimaryButton, ScreenContainer } from '@shared/ui';
import { useI18n } from '@shared/i18n';
import { radius, spacing, typography, useTheme } from '@shared/theme';
import { apiErrorText } from '@shared/utils/apiErrorText';

function formatMoney(amount: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDueDate(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function UpcomingPaymentsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<TransactionsStackParamList>>();
  const { withAuth } = useAuth();
  const { theme, mode } = useTheme();
  const { t, locale } = useI18n();

  const dateFilter = useMemo(() => {
    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + 45);

    const toDateOnly = (value: Date) => {
      const year = value.getUTCFullYear();
      const month = String(value.getUTCMonth() + 1).padStart(2, '0');
      const day = String(value.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    return {
      from: toDateOnly(from),
      to: toDateOnly(to),
      status: 'upcoming' as const,
      limit: 100,
    };
  }, []);

  const upcomingQuery = useQuery({
    queryKey: financeQueryKeys.upcomingPayments.list(dateFilter),
    queryFn: () => withAuth((token) => apiClient.listUpcomingPayments(dateFilter, token)),
  });

  if (upcomingQuery.isLoading) {
    return (
      <ScreenContainer dark={mode === 'dark'}>
        <Card dark={mode === 'dark'} style={styles.stateCard}>
          <ActivityIndicator color={theme.colors.primary} size="large" />
          <Text style={[styles.stateText, { color: theme.colors.textMuted }]}>{t('upcoming.list.state.loading')}</Text>
        </Card>
      </ScreenContainer>
    );
  }

  if (upcomingQuery.isError) {
    return (
      <ScreenContainer dark={mode === 'dark'}>
        <Card dark={mode === 'dark'} style={styles.errorCard}>
          <Text style={[styles.errorTitle, { color: theme.colors.text }]}>{t('upcoming.list.state.errorTitle')}</Text>
          <Text style={[styles.errorText, { color: theme.colors.expense }]}>{apiErrorText(upcomingQuery.error)}</Text>
          <PrimaryButton label={t('common.retry')} onPress={() => void upcomingQuery.refetch()} />
        </Card>
      </ScreenContainer>
    );
  }

  const items = upcomingQuery.data?.upcomingPayments ?? [];

  return (
    <ScreenContainer dark={mode === 'dark'} scrollable={false}>
      <FlatList
        contentContainerStyle={styles.listContent}
        data={items}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={upcomingQuery.isRefetching}
            onRefresh={() => {
              void upcomingQuery.refetch();
            }}
            tintColor={theme.colors.primary}
          />
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.navigate('UpcomingPaymentDetail', { paymentId: item.id })}
            style={({ pressed }) => [styles.rowPressable, pressed && styles.rowPressed]}
          >
            <UpcomingPaymentRow item={item} locale={locale} />
          </Pressable>
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <Card dark={mode === 'dark'}>
            <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>{t('upcoming.list.state.empty')}</Text>
          </Card>
        }
      />
    </ScreenContainer>
  );
}

function UpcomingPaymentRow({ item, locale }: { item: UpcomingPayment; locale: string }) {
  const { theme, mode } = useTheme();
  const { t } = useI18n();

  return (
    <Card
      dark={mode === 'dark'}
      style={[
        styles.rowCard,
        {
          borderColor: mode === 'dark' ? 'rgba(255,255,255,0.08)' : theme.colors.border,
          backgroundColor: mode === 'dark' ? '#121826' : '#FFFFFF',
        },
      ]}
    >
      <View style={styles.rowLeft}>
        <Text numberOfLines={1} style={[styles.rowTitle, { color: theme.colors.text }]}>
          {item.title}
        </Text>
        <Text style={[styles.rowMeta, { color: theme.colors.textMuted }]}>
          {t('upcoming.list.row.dueDate', { date: formatDueDate(item.dueDate, locale) })}
        </Text>
      </View>
      <Text style={[styles.rowAmount, { color: theme.colors.expense }]}>{formatMoney(item.amount, item.currency, locale)}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: spacing.lg,
  },
  rowPressable: {
    borderRadius: radius.md,
  },
  rowPressed: {
    opacity: 0.88,
  },
  rowCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  rowLeft: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    ...typography.subheading,
    fontSize: 16,
    fontWeight: '700',
  },
  rowMeta: {
    ...typography.caption,
    fontSize: 12,
    marginTop: 2,
  },
  rowAmount: {
    ...typography.subheading,
    fontSize: 16,
    fontWeight: '700',
  },
  separator: {
    height: spacing.sm,
  },
  stateCard: {
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 160,
  },
  stateText: {
    ...typography.body,
  },
  errorCard: {
    gap: spacing.sm,
  },
  errorTitle: {
    ...typography.subheading,
  },
  errorText: {
    ...typography.body,
  },
  emptyText: {
    ...typography.body,
    textAlign: 'center',
  },
});
