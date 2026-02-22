import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { UpcomingPayment } from '@mintly/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';

import { useAuth } from '@app/providers/AuthProvider';
import { apiClient } from '@core/api/client';
import { financeQueryKeys } from '@core/api/queryKeys';
import type { TransactionsStackParamList } from '@core/navigation/stacks/TransactionsStack';
import { Card, PrimaryButton, ScreenContainer } from '@shared/ui';
import { useI18n } from '@shared/i18n';
import { radius, spacing, typography, useTheme } from '@shared/theme';
import { apiErrorText } from '@shared/utils/apiErrorText';

import {
  getUpcomingPaymentPreferredAccount,
  removeUpcomingPaymentPreferredAccount,
} from '../utils/upcomingPaymentAccountPreference';
import { cancelUpcomingPaymentNotifications } from '../utils/notificationsForUpcomingPayment';

function formatMoney(amount: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function UpcomingPaymentDetailScreen() {
  const route = useRoute<RouteProp<TransactionsStackParamList, 'UpcomingPaymentDetail'>>();
  const navigation = useNavigation();
  const { withAuth } = useAuth();
  const queryClient = useQueryClient();
  const { theme, mode } = useTheme();
  const { t, locale } = useI18n();

  const [accountId, setAccountId] = useState('');

  const listFilter = useMemo(() => {
    const from = new Date();
    from.setDate(from.getDate() - 60);
    const to = new Date();
    to.setDate(to.getDate() + 400);

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
      limit: 200,
    };
  }, []);

  const upcomingQuery = useQuery({
    queryKey: financeQueryKeys.upcomingPayments.list(listFilter),
    queryFn: () => withAuth((token) => apiClient.listUpcomingPayments(listFilter, token)),
  });

  const accountsQuery = useQuery({
    queryKey: financeQueryKeys.accounts.list(),
    queryFn: () => withAuth((token) => apiClient.getAccounts(token)),
  });

  const payment: UpcomingPayment | null = useMemo(() => {
    return (
      upcomingQuery.data?.upcomingPayments.find((entry) => entry.id === route.params.paymentId) ?? null
    );
  }, [route.params.paymentId, upcomingQuery.data?.upcomingPayments]);

  useEffect(() => {
    let cancelled = false;

    async function resolveDefaultAccount(): Promise<void> {
      const preferredAccount = await getUpcomingPaymentPreferredAccount(route.params.paymentId);
      if (cancelled) {
        return;
      }

      if (preferredAccount) {
        setAccountId(preferredAccount);
        return;
      }

      const firstAccount = accountsQuery.data?.accounts[0];
      if (firstAccount) {
        setAccountId(firstAccount.id);
      }
    }

    void resolveDefaultAccount();

    return () => {
      cancelled = true;
    };
  }, [accountsQuery.data?.accounts, route.params.paymentId]);

  const markPaidMutation = useMutation({
    mutationFn: async () => {
      if (!accountId) {
        throw new Error('errors.validation.selectAccount');
      }

      return withAuth((token) =>
        apiClient.markUpcomingPaymentPaid(route.params.paymentId, { accountId }, token),
      );
    },
    onSuccess: async () => {
      await Promise.all([
        cancelUpcomingPaymentNotifications(route.params.paymentId),
        removeUpcomingPaymentPreferredAccount(route.params.paymentId),
        queryClient.invalidateQueries({ queryKey: financeQueryKeys.upcomingPayments.all() }),
        queryClient.invalidateQueries({ queryKey: financeQueryKeys.dashboard.recent() }),
        queryClient.invalidateQueries({ queryKey: financeQueryKeys.transactions.all() }),
        queryClient.invalidateQueries({ queryKey: financeQueryKeys.analytics.all() }),
        queryClient.invalidateQueries({ queryKey: financeQueryKeys.budgets.all() }),
      ]);

      Alert.alert(t('upcoming.detail.markPaid.successTitle'), t('upcoming.detail.markPaid.successMessage'));
      navigation.goBack();
    },
    onError: (error) => {
      if (error instanceof Error && error.message.startsWith('errors.')) {
        Alert.alert(t('common.error'), t(error.message));
        return;
      }

      Alert.alert(t('common.error'), apiErrorText(error));
    },
  });

  const markSkippedMutation = useMutation({
    mutationFn: () =>
      withAuth((token) =>
        apiClient.updateUpcomingPayment(route.params.paymentId, { status: 'skipped' }, token),
      ),
    onSuccess: async () => {
      await Promise.all([
        cancelUpcomingPaymentNotifications(route.params.paymentId),
        removeUpcomingPaymentPreferredAccount(route.params.paymentId),
        queryClient.invalidateQueries({ queryKey: financeQueryKeys.upcomingPayments.all() }),
        queryClient.invalidateQueries({ queryKey: financeQueryKeys.dashboard.recent() }),
      ]);

      Alert.alert(t('upcoming.detail.markSkipped.successTitle'), t('upcoming.detail.markSkipped.successMessage'));
      navigation.goBack();
    },
    onError: (error) => {
      Alert.alert(t('common.error'), apiErrorText(error));
    },
  });

  if (upcomingQuery.isLoading || accountsQuery.isLoading) {
    return (
      <ScreenContainer dark={mode === 'dark'}>
        <Card dark={mode === 'dark'} style={styles.stateCard}>
          <ActivityIndicator color={theme.colors.primary} size="large" />
          <Text style={[styles.stateText, { color: theme.colors.textMuted }]}>{t('upcoming.detail.state.loading')}</Text>
        </Card>
      </ScreenContainer>
    );
  }

  if (upcomingQuery.isError || accountsQuery.isError) {
    const error = upcomingQuery.error ?? accountsQuery.error;

    return (
      <ScreenContainer dark={mode === 'dark'}>
        <Card dark={mode === 'dark'} style={styles.errorCard}>
          <Text style={[styles.errorTitle, { color: theme.colors.text }]}>{t('upcoming.detail.state.errorTitle')}</Text>
          <Text style={[styles.errorText, { color: theme.colors.expense }]}>{apiErrorText(error)}</Text>
          <PrimaryButton
            label={t('common.retry')}
            onPress={() => {
              void upcomingQuery.refetch();
              void accountsQuery.refetch();
            }}
          />
        </Card>
      </ScreenContainer>
    );
  }

  if (!payment) {
    return (
      <ScreenContainer dark={mode === 'dark'}>
        <Card dark={mode === 'dark'}>
          <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>{t('upcoming.detail.state.notFound')}</Text>
        </Card>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer dark={mode === 'dark'}>
      <View style={styles.container}>
        <Card dark={mode === 'dark'} style={styles.summaryCard}>
          <Text style={[styles.title, { color: theme.colors.text }]}>{payment.title}</Text>
          <Text style={[styles.amount, { color: theme.colors.expense }]}>
            {formatMoney(payment.amount, payment.currency, locale)}
          </Text>
          <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
            {t('upcoming.detail.dueDateValue', { date: formatDate(payment.dueDate, locale) })}
          </Text>
        </Card>

        <Card dark={mode === 'dark'} style={styles.accountCard}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{t('upcoming.detail.accountTitle')}</Text>
          <View style={styles.accountRow}>
            {(accountsQuery.data?.accounts ?? []).map((account) => {
              const selected = account.id === accountId;

              return (
                <Pressable
                  key={account.id}
                  accessibilityRole="button"
                  onPress={() => setAccountId(account.id)}
                  style={[
                    styles.accountChip,
                    {
                      borderColor: selected ? theme.colors.primary : theme.colors.border,
                      backgroundColor: selected
                        ? mode === 'dark'
                          ? 'rgba(47,107,255,0.20)'
                          : '#EAF0FF'
                        : mode === 'dark'
                          ? '#121826'
                          : '#FFFFFF',
                    },
                  ]}
                >
                  <Text style={[styles.accountChipLabel, { color: selected ? theme.colors.primary : theme.colors.text }]}>
                    {account.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Card>

        <View style={styles.actionsRow}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void markSkippedMutation.mutateAsync();
            }}
            disabled={markSkippedMutation.isPending || markPaidMutation.isPending}
            style={({ pressed }) => [
              styles.skipButton,
              {
                borderColor: theme.colors.border,
                backgroundColor: mode === 'dark' ? '#121826' : '#FFFFFF',
              },
              (pressed || markSkippedMutation.isPending || markPaidMutation.isPending) && styles.skipButtonPressed,
            ]}
          >
            <Text style={[styles.skipButtonLabel, { color: theme.colors.textMuted }]}>
              {t('upcoming.detail.markSkipped.cta')}
            </Text>
          </Pressable>

          <View style={styles.markPaidWrap}>
            <PrimaryButton
              label={t('upcoming.detail.markPaid.cta')}
              loading={markPaidMutation.isPending}
              disabled={markPaidMutation.isPending || markSkippedMutation.isPending}
              onPress={() => {
                void markPaidMutation.mutateAsync();
              }}
            />
          </View>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  summaryCard: {
    gap: spacing.xs,
  },
  title: {
    ...typography.heading,
    fontSize: 24,
  },
  amount: {
    ...typography.amount,
    fontSize: 34,
  },
  meta: {
    ...typography.body,
  },
  accountCard: {
    gap: spacing.xs,
  },
  sectionTitle: {
    ...typography.subheading,
    fontSize: 16,
    fontWeight: '700',
  },
  accountRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  accountChip: {
    borderRadius: radius.md,
    borderWidth: 1,
    minHeight: 36,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  accountChipLabel: {
    ...typography.caption,
    fontWeight: '700',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  skipButton: {
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: spacing.md,
    width: 132,
  },
  skipButtonPressed: {
    opacity: 0.8,
  },
  skipButtonLabel: {
    ...typography.subheading,
    fontSize: 14,
    textAlign: 'center',
  },
  markPaidWrap: {
    flex: 1,
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
