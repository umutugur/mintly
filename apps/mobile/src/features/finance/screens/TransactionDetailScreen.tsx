import { useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { apiClient } from '@core/api/client';
import { financeQueryKeys } from '@core/api/queryKeys';
import { getCategoryLabel } from '@features/finance/categories/categoryCatalog';
import type { TransactionsStackParamList } from '@core/navigation/stacks/TransactionsStack';
import { useAuth } from '@app/providers/AuthProvider';
import { Card, ScreenContainer } from '@shared/ui';
import { useI18n } from '@shared/i18n';
import { radius, spacing, typography, useTheme } from '@shared/theme';
import { apiErrorText } from '@shared/utils/apiErrorText';

// stitch asset: stitch/export/stitch_ana_ekran_dashboard/i̇şlem_detayı_1/screen.png
// no touch/keyboard behavior changed by this PR.

type Props = NativeStackScreenProps<TransactionsStackParamList, 'TransactionDetail'>;

function formatCurrency(amount: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDateTime(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function TransactionDetailScreen({ navigation, route }: Props) {
  const { withAuth } = useAuth();
  const { theme, mode } = useTheme();
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const { transactionId } = route.params;

  const invalidateTransactionRelatedQueries = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: financeQueryKeys.transactions.all() }),
      queryClient.invalidateQueries({ queryKey: financeQueryKeys.dashboard.recent() }),
      queryClient.invalidateQueries({ queryKey: financeQueryKeys.analytics.all() }),
      queryClient.invalidateQueries({ queryKey: financeQueryKeys.budgets.all() }),
      queryClient.invalidateQueries({ queryKey: ['transactions', 'detail', transactionId] }),
    ]);
  }, [queryClient, transactionId]);

  const transactionQuery = useQuery({
    queryKey: ['transactions', 'detail', transactionId],
    queryFn: () => withAuth((token) => apiClient.getTransaction(transactionId, token)),
  });

  const accountsQuery = useQuery({
    queryKey: financeQueryKeys.accounts.list(),
    queryFn: () => withAuth((token) => apiClient.getAccounts(token)),
  });

  const deleteTransactionMutation = useMutation({
    mutationFn: () => withAuth((token) => apiClient.deleteTransaction(transactionId, token)),
    onSuccess: async () => {
      await invalidateTransactionRelatedQueries();
      Alert.alert(t('tx.delete.success'));
      navigation.goBack();
    },
    onError: (error) => {
      Alert.alert(t('common.error'), apiErrorText(error));
    },
  });

  const deleteTransferMutation = useMutation({
    mutationFn: (transferGroupId: string) =>
      withAuth((token) => apiClient.deleteTransfer(transferGroupId, token)),
    onSuccess: async () => {
      await invalidateTransactionRelatedQueries();
      Alert.alert(t('transfer.delete.success'));
      navigation.goBack();
    },
    onError: (error) => {
      Alert.alert(t('common.error'), apiErrorText(error));
    },
  });

  const accountNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const account of accountsQuery.data?.accounts ?? []) {
      map[account.id] = account.name;
    }
    return map;
  }, [accountsQuery.data?.accounts]);

  if (transactionQuery.isLoading) {
    return (
      <ScreenContainer dark={mode === 'dark'} scrollable={false} contentStyle={styles.containerContent}>
        <View style={styles.centerState}>
          <ActivityIndicator color={theme.colors.primary} size="large" />
          <Text style={[styles.stateText, { color: theme.colors.textMuted }]}>
            {t('transactionDetail.state.loading')}
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  if (transactionQuery.isError || !transactionQuery.data) {
    return (
      <ScreenContainer dark={mode === 'dark'} scrollable={false} contentStyle={styles.containerContent}>
        <View style={styles.centerState}>
          <Text style={[styles.errorTitle, { color: theme.colors.text }]}>
            {t('transactionDetail.state.loadErrorTitle')}
          </Text>
          <Text style={[styles.errorText, { color: theme.colors.expense }]}>{apiErrorText(transactionQuery.error)}</Text>
          <Pressable
            onPress={() => navigation.goBack()}
            style={[styles.backAction, { backgroundColor: theme.colors.buttonPrimaryBackground }]}
          >
            <Text style={[styles.backActionLabel, { color: theme.colors.buttonPrimaryText }]}>
              {t('common.goBack')}
            </Text>
          </Pressable>
        </View>
      </ScreenContainer>
    );
  }

  const transaction = transactionQuery.data;
  const amountText = `${transaction.type === 'income' ? '+' : '-'}${formatCurrency(transaction.amount, transaction.currency, locale)}`;
  const title =
    transaction.description?.trim() ||
    (transaction.type === 'income' ? t('transactions.row.incomeTitle') : t('transactions.row.expenseTitle'));
  const categoryLabel = transaction.kind === 'transfer'
    ? t('transactionDetail.fields.noCategory')
    : transaction.categoryKey
      ? getCategoryLabel(transaction.categoryKey, locale) || t('transactions.row.uncategorized')
      : t('transactions.row.uncategorized');
  const accountName = accountNameById[transaction.accountId] ?? t('transactions.accountFallback');
  const isTransfer = transaction.kind === 'transfer';

  const confirmDelete = () => {
    if (deleteTransactionMutation.isPending || deleteTransferMutation.isPending) {
      return;
    }
    if (isTransfer) {
      if (!transaction.transferGroupId) {
        Alert.alert(t('common.notAvailable'));
        return;
      }

      Alert.alert(
        t('transfer.delete.confirmTitle'),
        t('transfer.delete.confirmBody'),
        [
          {
            text: t('common.cancel'),
            style: 'cancel',
          },
          {
            text: t('common.delete'),
            style: 'destructive',
            onPress: () => {
              deleteTransferMutation.mutate(transaction.transferGroupId as string);
            },
          },
        ],
      );
      return;
    }

    Alert.alert(
      t('tx.delete.confirmTitle'),
      t('tx.delete.confirmBody', { title }),
      [
        {
          text: t('common.cancel'),
          style: 'cancel',
        },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            deleteTransactionMutation.mutate();
          },
        },
      ],
    );
  };

  return (
    <ScreenContainer dark={mode === 'dark'} scrollable={false} contentStyle={styles.containerContent}>
      <View style={styles.safe}>
        <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
          <Pressable onPress={() => navigation.goBack()} style={styles.headerIconButton}>
            <Text style={[styles.headerIcon, { color: theme.colors.text }]}>{'<'}</Text>
          </Pressable>

          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>{t('transactionDetail.title')}</Text>

          <Pressable
            onPress={() => {
              if (isTransfer) {
                Alert.alert(t('transfer.edit.title'), t('transfer.edit.recreateWarning'));
                return;
              }
              navigation.navigate('EditTransaction', { transactionId });
            }}
            style={styles.headerEditButton}
          >
            <Text
              style={[
                styles.headerEditText,
                { color: theme.colors.primary },
              ]}
            >
              {t('common.edit')}
            </Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.heroWrap}>
            <Text style={[styles.heroAmount, { color: transaction.type === 'income' ? theme.colors.income : theme.colors.expense }]}>
              {amountText}
            </Text>
            <Text style={[styles.heroTitle, { color: theme.colors.text }]}>{title}</Text>

            <View
              style={[
                styles.statusPill,
                {
                  backgroundColor: mode === 'dark' ? 'rgba(23,178,106,0.18)' : theme.colors.primaryMuted,
                },
              ]}
            >
              <View style={[styles.statusDot, { backgroundColor: theme.colors.income }]} />
              <Text style={[styles.statusLabel, { color: theme.colors.income }]}>
                {t('transactionDetail.status.completed')}
              </Text>
            </View>
          </View>

          <Card dark={mode === 'dark'} style={styles.metaCard}>
            <View style={styles.metaRow}>
              <View style={styles.metaLabelWrap}>
                <View style={[styles.metaIconBox, { backgroundColor: theme.colors.primaryMuted }]}>
                  <Text style={[styles.metaIcon, { color: theme.colors.primary }]}>▣</Text>
                </View>
                <Text style={[styles.metaLabel, { color: theme.colors.textMuted }]}>
                  {t('transactionDetail.fields.dateTime')}
                </Text>
              </View>
              <Text style={[styles.metaValue, { color: theme.colors.text }]}>
                {formatDateTime(transaction.occurredAt, locale)}
              </Text>
            </View>

            <View style={styles.metaRow}>
              <View style={styles.metaLabelWrap}>
                <View style={[styles.metaIconBox, { backgroundColor: theme.colors.primaryMuted }]}>
                  <Text style={[styles.metaIcon, { color: theme.colors.primary }]}>◉</Text>
                </View>
                <Text style={[styles.metaLabel, { color: theme.colors.textMuted }]}>
                  {t('transactionDetail.fields.category')}
                </Text>
              </View>
              <Text style={[styles.metaValue, { color: theme.colors.text }]}>
                {categoryLabel}
              </Text>
            </View>

            <View style={styles.metaRow}>
              <View style={styles.metaLabelWrap}>
                <View style={[styles.metaIconBox, { backgroundColor: theme.colors.primaryMuted }]}>
                  <Text style={[styles.metaIcon, { color: theme.colors.primary }]}>⌁</Text>
                </View>
                <Text style={[styles.metaLabel, { color: theme.colors.textMuted }]}>
                  {t('transactionDetail.fields.account')}
                </Text>
              </View>
              <Text style={[styles.metaValue, { color: theme.colors.text }]}>{accountName}</Text>
            </View>
          </Card>

          <Card dark={mode === 'dark'} style={styles.locationCard}>
            <View style={styles.locationHeader}>
              <View>
                <Text style={[styles.locationTitle, { color: theme.colors.text }]}>{accountName}</Text>
                <Text style={[styles.locationSubtitle, { color: theme.colors.textMuted }]}>
                  {t('transactionDetail.location.placeholder')}
                </Text>
              </View>
              <Text style={[styles.locationArrow, { color: theme.colors.textMuted }]}>{'>'}</Text>
            </View>

            <View
              style={[
                styles.mapPlaceholder,
                {
                  backgroundColor: mode === 'dark' ? theme.colors.surface : theme.colors.primaryMuted,
                },
              ]}
            >
              <View style={[styles.mapPin, { borderBottomColor: theme.colors.primary }]} />
            </View>
          </Card>

          <Card dark={mode === 'dark'} style={styles.notesCard}>
            <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>
              {t('transactionDetail.notes.title')}
            </Text>
            <Text style={[styles.notesText, { color: theme.colors.text }]}>
              "
              {transaction.description?.trim() || t('transactionDetail.notes.empty')}
              "
            </Text>
          </Card>

          <Card dark={mode === 'dark'} style={styles.receiptCard}>
            <View style={styles.receiptHeader}>
              <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>
                {t('transactionDetail.receipt.title')}
              </Text>
              <Pressable onPress={() => undefined}>
                <Text style={[styles.receiptAction, { color: theme.colors.primary }]}>{t('common.view')}</Text>
              </Pressable>
            </View>

            <View
              style={[
                styles.receiptPlaceholder,
                {
                  backgroundColor: mode === 'dark' ? theme.colors.surface : theme.colors.primaryMuted,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <View style={[styles.receiptPaper, { backgroundColor: theme.colors.surface }]}>
                <View style={[styles.receiptLine, { backgroundColor: theme.colors.border }]} />
                <View style={[styles.receiptLine, { backgroundColor: theme.colors.border }]} />
                <View style={[styles.receiptLine, { backgroundColor: theme.colors.border }]} />
                <View style={[styles.receiptLineShort, { backgroundColor: theme.colors.border }]} />
              </View>
            </View>
          </Card>
        </ScrollView>

        <View
          style={[
            styles.bottomActions,
            {
              backgroundColor: mode === 'dark' ? 'rgba(6,7,11,0.97)' : 'rgba(243,246,252,0.97)',
              borderTopColor: theme.colors.border,
            },
          ]}
        >
          <View style={styles.bottomButtonsRow}>
            <Pressable
              onPress={() => undefined}
              style={[
                styles.secondaryBottomButton,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <Text style={[styles.secondaryBottomLabel, { color: theme.colors.text }]}>
                {t('transactionDetail.actions.splitExpense')}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => undefined}
              style={[styles.primaryBottomButton, { backgroundColor: theme.colors.primary }]}
            >
              <Text style={[styles.primaryBottomLabel, { color: theme.colors.buttonPrimaryText }]}>
                {t('transactionDetail.actions.downloadReceipt')}
              </Text>
            </Pressable>
          </View>

          <Pressable
            disabled={deleteTransactionMutation.isPending || deleteTransferMutation.isPending}
            onPress={confirmDelete}
            style={styles.deleteAction}
          >
            <Text
              style={[
                styles.deleteActionLabel,
                { color: theme.colors.expense },
              ]}
            >
              {t('transactionDetail.actions.delete')}
            </Text>
          </Pressable>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  containerContent: {
    flex: 1,
    gap: 0,
    paddingBottom: 0,
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  safe: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerIconButton: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  headerIcon: {
    ...typography.subheading,
    fontSize: 20,
    fontWeight: '700',
  },
  headerTitle: {
    ...typography.subheading,
    fontSize: 20,
    fontWeight: '700',
  },
  headerEditButton: {
    alignItems: 'center',
    borderRadius: radius.sm,
    justifyContent: 'center',
    minWidth: 58,
    paddingVertical: spacing.xxs,
  },
  headerEditText: {
    ...typography.caption,
    fontWeight: '700',
  },
  scrollContent: {
    gap: spacing.sm,
    paddingBottom: 170,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  heroWrap: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  heroAmount: {
    ...typography.amount,
    fontSize: 54,
    fontWeight: '800',
    lineHeight: 60,
  },
  heroTitle: {
    ...typography.heading,
    fontSize: 31,
    lineHeight: 37,
  },
  statusPill: {
    alignItems: 'center',
    borderRadius: radius.full,
    flexDirection: 'row',
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  statusDot: {
    borderRadius: radius.full,
    height: 6,
    width: 6,
  },
  statusLabel: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '700',
  },
  metaCard: {
    gap: spacing.sm,
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaLabelWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  metaIconBox: {
    alignItems: 'center',
    borderRadius: radius.sm,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  metaIcon: {
    ...typography.caption,
    fontWeight: '700',
    fontSize: 12,
  },
  metaLabel: {
    ...typography.caption,
    fontSize: 13,
    fontWeight: '600',
  },
  metaValue: {
    ...typography.body,
    fontWeight: '600',
  },
  locationCard: {
    overflow: 'hidden',
    padding: 0,
  },
  locationHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  locationTitle: {
    ...typography.body,
    fontWeight: '700',
  },
  locationSubtitle: {
    ...typography.caption,
    fontSize: 11,
  },
  locationArrow: {
    ...typography.subheading,
    fontSize: 18,
  },
  mapPlaceholder: {
    height: 126,
    overflow: 'hidden',
    width: '100%',
  },
  mapPin: {
    alignSelf: 'center',
    borderBottomWidth: 18,
    borderLeftColor: 'transparent',
    borderLeftWidth: 11,
    borderRightColor: 'transparent',
    borderRightWidth: 11,
    borderTopWidth: 0,
    marginTop: 10,
    width: 0,
  },
  notesCard: {
    gap: spacing.xs,
  },
  sectionLabel: {
    ...typography.caption,
    fontSize: 13,
    fontWeight: '700',
  },
  notesText: {
    ...typography.body,
    fontStyle: 'italic',
    lineHeight: 21,
  },
  receiptCard: {
    gap: spacing.sm,
  },
  receiptHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  receiptAction: {
    ...typography.caption,
    fontWeight: '700',
  },
  receiptPlaceholder: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderStyle: 'dashed',
    borderWidth: 1,
    height: 240,
    justifyContent: 'center',
    overflow: 'hidden',
    width: '100%',
  },
  receiptPaper: {
    borderRadius: radius.sm,
    elevation: 4,
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    shadowColor: 'rgba(0,0,0,0.35)',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    width: 110,
  },
  receiptLine: {
    borderRadius: radius.sm,
    height: 4,
    width: '100%',
  },
  receiptLineShort: {
    borderRadius: radius.sm,
    height: 4,
    width: '60%',
  },
  bottomActions: {
    borderTopWidth: 1,
    bottom: 0,
    left: 0,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    position: 'absolute',
    right: 0,
  },
  bottomButtonsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  secondaryBottomButton: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: spacing.sm,
  },
  secondaryBottomLabel: {
    ...typography.caption,
    fontSize: 13,
    fontWeight: '700',
  },
  primaryBottomButton: {
    alignItems: 'center',
    borderRadius: radius.md,
    flex: 1,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: spacing.sm,
  },
  primaryBottomLabel: {
    ...typography.caption,
    fontSize: 13,
    fontWeight: '700',
  },
  deleteAction: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  deleteActionLabel: {
    ...typography.caption,
    fontSize: 13,
    fontWeight: '700',
  },
  centerState: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  stateText: {
    ...typography.body,
  },
  errorTitle: {
    ...typography.subheading,
    textAlign: 'center',
  },
  errorText: {
    ...typography.body,
    textAlign: 'center',
  },
  backAction: {
    alignItems: 'center',
    borderRadius: radius.md,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 120,
    paddingHorizontal: spacing.md,
  },
  backActionLabel: {
    ...typography.subheading,
    fontWeight: '700',
  },
});
