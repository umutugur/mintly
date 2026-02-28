import { StyleSheet, Text, View } from 'react-native';

import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '@core/api/client';
import { financeQueryKeys } from '@core/api/queryKeys';
import { useAuth } from '@app/providers/AuthProvider';
import { AppIcon, Card, PrimaryButton, ScreenContainer, showAlert } from '@shared/ui';
import { useI18n } from '@shared/i18n';
import type { TransactionsStackParamList } from '@core/navigation/stacks/TransactionsStack';
import { spacing, typography, useTheme } from '@shared/theme';
import { apiErrorText } from '@shared/utils/apiErrorText';

function formatMoney(amount: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function SettleUpScreen() {
  const route = useRoute<RouteProp<TransactionsStackParamList, 'SettleUp'>>();
  const navigation = useNavigation<NativeStackNavigationProp<TransactionsStackParamList>>();
  const queryClient = useQueryClient();
  const { withAuth } = useAuth();
  const { theme, mode } = useTheme();
  const { locale, t } = useI18n();

  const expensesQuery = useQuery({
    queryKey: financeQueryKeys.groups.expenses(route.params.groupId),
    queryFn: () => withAuth((token) => apiClient.getGroupExpenses(route.params.groupId, token)),
  });

  const settleMutation = useMutation({
    mutationFn: () => withAuth((token) => apiClient.settleGroup(route.params.groupId, token)),
    onSuccess: async (response) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: financeQueryKeys.groups.expenses(route.params.groupId) }),
        queryClient.invalidateQueries({ queryKey: financeQueryKeys.groups.detail(route.params.groupId) }),
        queryClient.invalidateQueries({ queryKey: financeQueryKeys.groups.list() }),
      ]);

      showAlert(
        t('groups.settle.successTitle'),
        t('groups.settle.successMessage', { count: response.settledCount }),
      );
      navigation.goBack();
    },
    onError: (error) => {
      showAlert(t('groups.settle.errorTitle'), apiErrorText(error));
    },
  });

  if (expensesQuery.isLoading) {
    return (
      <ScreenContainer dark={mode === 'dark'}>
        <Card dark={mode === 'dark'} style={styles.feedbackCard}>
          <AppIcon name="time-outline" size="lg" tone="primary" />
          <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>{t('groups.settle.loading')}</Text>
        </Card>
      </ScreenContainer>
    );
  }

  if (expensesQuery.isError || !expensesQuery.data) {
    return (
      <ScreenContainer dark={mode === 'dark'}>
        <Card dark={mode === 'dark'} style={styles.feedbackCard}>
          <AppIcon name="alert-circle-outline" size="lg" tone="expense" />
          <Text style={[styles.errorTitle, { color: theme.colors.text }]}>{t('groups.settle.loadErrorTitle')}</Text>
          <Text style={[styles.errorText, { color: theme.colors.expense }]}>{apiErrorText(expensesQuery.error)}</Text>
          <PrimaryButton iconName="refresh" label={t('common.retry')} onPress={() => void expensesQuery.refetch()} />
        </Card>
      </ScreenContainer>
    );
  }

  const unsettled = expensesQuery.data.expenses.filter((expense) => !expense.settledAt);
  const unsettledTotal = unsettled.reduce((sum, expense) => sum + expense.amount, 0);
  const currency = unsettled[0]?.currency ?? 'TRY';

  return (
    <ScreenContainer dark={mode === 'dark'}>
      <View style={styles.container}>
        <Card dark={mode === 'dark'} style={styles.card}>
          <View style={styles.headerRow}>
            <AppIcon name="wallet-outline" size="md" tone="primary" />
            <Text style={[styles.title, { color: theme.colors.text }]}>{t('groups.settle.title')}</Text>
          </View>
          <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>{t('groups.settle.subtitle')}</Text>

          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: theme.colors.textMuted }]}>{t('groups.settle.openExpenses')}</Text>
            <Text style={[styles.summaryValue, { color: theme.colors.text }]}>{String(unsettled.length)}</Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: theme.colors.textMuted }]}>{t('groups.settle.openAmount')}</Text>
            <Text style={[styles.summaryValue, { color: theme.colors.text }]}> 
              {formatMoney(unsettledTotal, currency, locale)}
            </Text>
          </View>

          <PrimaryButton
            iconName={settleMutation.isPending ? 'hourglass-outline' : 'checkmark-circle-outline'}
            disabled={settleMutation.isPending || unsettled.length === 0}
            label={settleMutation.isPending ? t('groups.settle.actions.settling') : t('groups.settle.actions.markSettled')}
            onPress={() => settleMutation.mutate()}
          />
        </Card>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  card: {
    gap: spacing.sm,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  title: {
    ...typography.heading,
    fontSize: 24,
  },
  subtitle: {
    ...typography.body,
  },
  summaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryLabel: {
    ...typography.body,
  },
  summaryValue: {
    ...typography.subheading,
    fontWeight: '700',
  },
  helperText: {
    ...typography.body,
    textAlign: 'center',
  },
  feedbackCard: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  errorTitle: {
    ...typography.subheading,
    fontWeight: '700',
    textAlign: 'center',
  },
  errorText: {
    ...typography.body,
    textAlign: 'center',
  },
});
