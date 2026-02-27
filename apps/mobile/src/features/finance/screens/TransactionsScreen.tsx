import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { Transaction } from '@mintly/shared';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';

import { apiClient } from '@core/api/client';
import { financeQueryKeys } from '@core/api/queryKeys';
import { useAuth } from '@app/providers/AuthProvider';
import { getCategoryIcon, getCategoryLabel } from '@features/finance/categories/categoryCatalog';
import { AppIcon, Card, PrimaryButton, ScreenContainer, TransactionRow } from '@shared/ui';
import { useI18n } from '@shared/i18n';
import type { RootTabParamList } from '@core/navigation/types';
import type { TransactionsStackParamList } from '@core/navigation/stacks/TransactionsStack';
import { radius, spacing, typography, useTheme } from '@shared/theme';
import { apiErrorText } from '@shared/utils/apiErrorText';

// stitch asset: stitch/export/stitch_ana_ekran_dashboard/güncel_i̇şlem_geçmişi_(borç_kapama_dahil)/screen.png
// no touch/keyboard behavior changed by this PR.

type TypeFilter = 'all' | 'income' | 'expense';

type ListItem =
  | { id: string; kind: 'header'; title: string }
  | { id: string; kind: 'transaction'; transaction: Transaction };

function formatCurrency(amount: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatSignedAmount(
  amount: number,
  currency: string,
  type: 'income' | 'expense',
  locale: string,
): string {
  const value = formatCurrency(amount, currency, locale);
  return `${type === 'income' ? '+' : '-'}${value}`;
}

function formatTime(dateIso: string, locale: string): string {
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) {
    return '--:--';
  }

  return date.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getDayKey(dateIso: string): string {
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) {
    return 'unknown';
  }

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDayLabel(dayKey: string, t: (key: string) => string, locale: string): string {
  if (dayKey === 'unknown') {
    return t('transactions.group.other');
  }

  const [year, month, day] = dayKey.split('-').map(Number);
  const target = new Date(year, (month ?? 1) - 1, day ?? 1);
  if (Number.isNaN(target.getTime())) {
    return t('transactions.group.other');
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return t('transactions.group.today');
  }

  if (diffDays === 1) {
    return t('transactions.group.yesterday');
  }

  return target
    .toLocaleDateString(locale, {
      day: 'numeric',
      month: 'long',
    })
    .toLocaleUpperCase(locale);
}

function buildListItems(transactions: Transaction[], t: (key: string) => string, locale: string): ListItem[] {
  const groups = new Map<string, Transaction[]>();

  for (const transaction of transactions) {
    const dayKey = getDayKey(transaction.occurredAt);
    const existing = groups.get(dayKey) ?? [];
    existing.push(transaction);
    groups.set(dayKey, existing);
  }

  const sortedDayKeys = [...groups.keys()].sort((a, b) => {
    if (a === 'unknown') {
      return 1;
    }
    if (b === 'unknown') {
      return -1;
    }
    return a < b ? 1 : -1;
  });

  const items: ListItem[] = [];

  for (const dayKey of sortedDayKeys) {
    items.push({
      id: `header-${dayKey}`,
      kind: 'header',
      title: getDayLabel(dayKey, t, locale),
    });

    const groupTransactions = groups.get(dayKey) ?? [];
    for (const transaction of groupTransactions) {
      items.push({
        id: `tx-${transaction.id}`,
        kind: 'transaction',
        transaction,
      });
    }
  }

  return items;
}

function getTransactionCategoryLabel(
  transaction: Transaction,
  locale: string,
  t: (key: string) => string,
): string {
  if (transaction.kind === 'transfer') {
    return t('transactions.row.transferTitle');
  }

  if (!transaction.categoryKey) {
    return '';
  }

  return getCategoryLabel(transaction.categoryKey, locale);
}

function getTransactionCategoryLabelOrFallback(
  transaction: Transaction,
  locale: string,
  t: (key: string) => string,
): string {
  return getTransactionCategoryLabel(transaction, locale, t) || t('transactions.row.uncategorized');
}

function getTransactionTitle(
  transaction: Transaction,
  locale: string,
  t: (key: string) => string,
): string {
  if (transaction.description?.trim()) {
    return transaction.description.trim();
  }

  if (transaction.kind === 'transfer') {
    return t('transactions.row.transferTitle');
  }

  const categoryLabel = getTransactionCategoryLabel(transaction, locale, t);
  if (categoryLabel) {
    return categoryLabel;
  }

  return transaction.type === 'income' ? t('transactions.row.incomeTitle') : t('transactions.row.expenseTitle');
}

function getCategoryHint(
  transaction: Transaction,
  categoryLabel: string,
  t: (key: string, params?: Record<string, string | number>) => string,
  locale: string,
): string {
  if (transaction.kind === 'transfer') {
    return t('transactions.row.transferHint', { time: formatTime(transaction.occurredAt, locale) });
  }

  return t('transactions.row.categoryHint', {
    category: categoryLabel,
    time: formatTime(transaction.occurredAt, locale),
  });
}

function getCategoryIconName(
  transaction: Transaction,
): Parameters<typeof AppIcon>[0]['name'] {
  if (transaction.kind === 'transfer') {
    return 'swap-horizontal-outline';
  }

  if (transaction.categoryKey) {
    return getCategoryIcon(transaction.categoryKey);
  }

  return transaction.type === 'income' ? 'arrow-down-circle-outline' : 'receipt-outline';
}

function LoadingSkeleton() {
  return (
    <View style={styles.skeletonWrap}>
      <View style={styles.skeletonHeader} />
      <View style={styles.skeletonSearch} />
      <View style={styles.skeletonChips}>
        <View style={styles.skeletonChip} />
        <View style={styles.skeletonChip} />
        <View style={styles.skeletonChip} />
      </View>
      <View style={styles.skeletonSummaryRow}>
        <View style={styles.skeletonSummary} />
        <View style={styles.skeletonSummary} />
      </View>
      <View style={styles.skeletonItem} />
      <View style={styles.skeletonItem} />
      <View style={styles.skeletonItem} />
    </View>
  );
}

export function TransactionsScreen() {
  const { withAuth, user } = useAuth();
  const { theme, mode } = useTheme();
  const { t, locale } = useI18n();
  const navigation = useNavigation<NativeStackNavigationProp<TransactionsStackParamList>>();
  const queryClient = useQueryClient();

  const [draftSearch, setDraftSearch] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  const queryFilters = useMemo(
    () => ({
      search: activeSearch.trim() || undefined,
      type: typeFilter === 'all' ? undefined : typeFilter,
    }),
    [activeSearch, typeFilter],
  );
  const hasActiveFilters = typeFilter !== 'all' || draftSearch.trim().length > 0 || activeSearch.trim().length > 0;

  const invalidateTransactionRelatedQueries = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: financeQueryKeys.transactions.all() }),
      queryClient.invalidateQueries({ queryKey: financeQueryKeys.dashboard.recent() }),
      queryClient.invalidateQueries({ queryKey: financeQueryKeys.analytics.all() }),
      queryClient.invalidateQueries({ queryKey: financeQueryKeys.budgets.all() }),
    ]);
  }, [queryClient]);

  const openAddTransaction = useCallback(() => {
    const parent = navigation.getParent?.();
    if (parent && 'navigate' in parent) {
      (parent as {
        navigate: (name: keyof RootTabParamList, params?: RootTabParamList['AddTab']) => void;
      }).navigate('AddTab', { screen: 'AddTransaction' });
    }
  }, [navigation]);

  const deleteTransactionMutation = useMutation({
    mutationFn: (transactionId: string) =>
      withAuth((token) => apiClient.deleteTransaction(transactionId, token)),
    onSuccess: async () => {
      await invalidateTransactionRelatedQueries();
      Alert.alert(t('tx.delete.success'));
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
    },
    onError: (error) => {
      Alert.alert(t('common.error'), apiErrorText(error));
    },
  });

  const confirmDeleteTransaction = useCallback(
    (transaction: Transaction) => {
      if (deleteTransactionMutation.isPending) {
        return;
      }
      if (transaction.kind === 'transfer') {
        Alert.alert(t('common.notAvailable'));
        return;
      }

      Alert.alert(
        t('tx.delete.confirmTitle'),
        t('tx.delete.confirmBody', { title: getTransactionTitle(transaction, locale, t) }),
        [
          {
            text: t('common.cancel'),
            style: 'cancel',
          },
          {
            text: t('common.delete'),
            style: 'destructive',
            onPress: () => {
              deleteTransactionMutation.mutate(transaction.id);
            },
          },
        ],
      );
    },
    [deleteTransactionMutation, locale, t],
  );

  const confirmDeleteTransfer = useCallback(
    (transaction: Transaction) => {
      if (deleteTransferMutation.isPending) {
        return;
      }

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
    },
    [deleteTransferMutation, t],
  );

  const onTransactionRowLongPress = useCallback(
    (transaction: Transaction) => {
      if (transaction.kind === 'transfer') {
        confirmDeleteTransfer(transaction);
        return;
      }

      confirmDeleteTransaction(transaction);
    },
    [confirmDeleteTransaction, confirmDeleteTransfer],
  );

  const transactionsQuery = useInfiniteQuery({
    queryKey: financeQueryKeys.transactions.list(queryFilters),
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      withAuth((token) =>
        apiClient.listTransactions(
          {
            ...queryFilters,
            page: pageParam,
            limit: 20,
          },
          token,
        ),
      ),
    getNextPageParam: (lastPage) => {
      if (lastPage.pagination.page >= lastPage.pagination.totalPages) {
        return undefined;
      }

      return lastPage.pagination.page + 1;
    },
  });

  const transactions = useMemo(
    () => transactionsQuery.data?.pages.flatMap((page) => page.transactions) ?? [],
    [transactionsQuery.data?.pages],
  );

  useEffect(() => {
    if (!__DEV__ || transactions.length === 0) {
      return;
    }

    const first = transactions[0];
    console.info('[transactions][dev-category-roundtrip]', {
      count: transactions.length,
      firstTransactionId: first?.id ?? null,
      firstCategoryKeyPresent: Boolean(first?.categoryKey),
    });
  }, [transactions]);

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;

    for (const transaction of transactions) {
      if (transaction.kind === 'transfer') {
        continue;
      }

      if (transaction.type === 'income') {
        income += transaction.amount;
      } else {
        expense += transaction.amount;
      }
    }

    return {
      income,
      expense,
    };
  }, [transactions]);

  const summaryCurrency = useMemo(
    () => transactions[0]?.currency ?? user?.baseCurrency ?? 'TRY',
    [transactions, user?.baseCurrency],
  );

  const listItems = useMemo(() => buildListItems(transactions, t, locale), [locale, t, transactions]);

  const renderListItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (item.kind === 'header') {
        return <Text style={[styles.groupHeader, { color: theme.colors.textMuted }]}>{item.title}</Text>;
      }

      const transaction = item.transaction;
      const categoryLabel = getTransactionCategoryLabelOrFallback(transaction, locale, t);

      return (
        <TransactionRow
          amount={formatSignedAmount(transaction.amount, transaction.currency, transaction.type, locale)}
          categoryIconName={getCategoryIconName(transaction)}
          date={getCategoryHint(transaction, categoryLabel, t, locale)}
          dark={mode === 'dark'}
          kind={transaction.kind}
          isDeleted={!!transaction.deletedAt}
          onLongPress={() => onTransactionRowLongPress(transaction)}
          onPress={() =>
            transaction.kind === 'transfer'
              ? navigation.navigate('TransactionDetail', { transactionId: transaction.id })
              : navigation.navigate('EditTransaction', { transactionId: transaction.id })
          }
          title={getTransactionTitle(transaction, locale, t)}
          type={transaction.type}
        />
      );
    },
    [locale, mode, navigation, onTransactionRowLongPress, t, theme.colors.textMuted],
  );

  if (transactionsQuery.isLoading) {
    return (
      <ScreenContainer scrollable={false} contentStyle={styles.containerContent}>
        <View style={styles.loadingStateWrap}>
          <LoadingSkeleton />
          <Text style={[styles.loadingStateText, { color: theme.colors.textMuted }]}>
            {t('common.loadingShort')}
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  if (transactionsQuery.isError) {
    return (
      <ScreenContainer>
        <Card style={styles.errorCard}>
          <Text style={[styles.errorTitle, { color: theme.colors.text }]}>{t('transactions.state.loadErrorTitle')}</Text>
          <Text style={[styles.errorText, { color: theme.colors.expense }]}>{apiErrorText(transactionsQuery.error)}</Text>
          <PrimaryButton label={t('common.retry')} onPress={() => void transactionsQuery.refetch()} />
        </Card>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scrollable={false} contentStyle={styles.containerContent}>
      <FlatList
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={9}
        contentContainerStyle={styles.listContent}
        data={listItems}
        ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <Card style={styles.emptyCard}>
            <AppIcon name="file-tray-outline" size="lg" tone="muted" />
            <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>{t('transactions.state.empty')}</Text>
            <PrimaryButton
              iconName={hasActiveFilters ? 'funnel-outline' : 'add-circle-outline'}
              label={hasActiveFilters ? t('transactions.filters.all') : t('common.navigation.tabs.add.label')}
              onPress={() => {
                if (hasActiveFilters) {
                  setTypeFilter('all');
                  setDraftSearch('');
                  setActiveSearch('');
                  return;
                }

                openAddTransaction();
              }}
            />
          </Card>
        }
        ListFooterComponent={
          transactionsQuery.hasNextPage ? (
            <View style={styles.footerLoaderWrap}>
              {transactionsQuery.isFetchingNextPage ? (
                <>
                  <ActivityIndicator color={theme.colors.primary} size="small" />
                  <Text style={[styles.footerLoaderText, { color: theme.colors.textMuted }]}>
                    {t('transactions.state.loadingMore')}
                  </Text>
                </>
              ) : (
                <PrimaryButton
                  label={t('transactions.actions.loadMore')}
                  onPress={() => {
                    void transactionsQuery.fetchNextPage();
                  }}
                />
              )}
            </View>
          ) : (
            <View style={styles.footerSpacer} />
          )
        }
        ListHeaderComponent={
          <View style={styles.headerWrap}>
            <View style={styles.topBar}>
              <Pressable
                accessibilityLabel={t('common.goBack')}
                accessibilityRole="button"
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  }
                }}
                style={[styles.iconButton, { backgroundColor: mode === 'dark' ? '#121A2E' : '#EDF2FB' }]}
              >
                <AppIcon name="chevron-back" size="md" tone="text" />
              </Pressable>

              <Text
                adjustsFontSizeToFit
                numberOfLines={1}
                style={[styles.screenTitle, { color: theme.colors.text }]}
              >
                {t('transactions.title')}
              </Text>

              <Pressable
                accessibilityLabel={t('common.navigation.stacks.transfer.header.title')}
                accessibilityRole="button"
                onPress={() => navigation.navigate('Transfer')}
                style={[styles.iconButton, { backgroundColor: mode === 'dark' ? '#121A2E' : '#EDF2FB' }]}
              >
                <AppIcon name="swap-horizontal-outline" size="md" tone="text" />
              </Pressable>
            </View>

            <View
              style={[
                styles.searchWrap,
                {
                  backgroundColor: mode === 'dark' ? '#111A2E' : '#EEF2FA',
                },
              ]}
            >
              <View pointerEvents="none" style={styles.searchIconWrap}>
                <AppIcon name="search" size="sm" color={mode === 'dark' ? '#5C79C8' : '#6A84CB'} />
              </View>
              <TextInput
                autoCapitalize="none"
                onChangeText={setDraftSearch}
                onSubmitEditing={() => setActiveSearch(draftSearch)}
                placeholder={t('transactions.searchPlaceholder')}
                placeholderTextColor={theme.colors.textMuted}
                returnKeyType="search"
                style={[styles.searchInput, { color: theme.colors.text }]}
                value={draftSearch}
              />
            </View>

            <View style={styles.filterChipRow}>
              {(['all', 'income', 'expense'] as const).map((filter) => {
                const isActive = typeFilter === filter;
                const label =
                  filter === 'all' ? t('transactions.filters.all') : filter === 'income' ? t('analytics.income') : t('analytics.expense');

                return (
                  <Pressable
                    key={filter}
                    accessibilityRole="button"
                    onPress={() => setTypeFilter(filter)}
                    style={[
                      styles.filterChip,
                      {
                        backgroundColor: isActive
                          ? theme.colors.primary
                          : mode === 'dark'
                            ? 'rgba(47,107,255,0.20)'
                            : '#EAF0FF',
                      },
                    ]}
                  >
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.filterChipText,
                        {
                          color: isActive
                            ? '#FFFFFF'
                            : theme.colors.primary,
                        },
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}

              <Pressable
                accessibilityRole="button"
                onPress={() => setActiveSearch(draftSearch)}
                style={[
                  styles.filterApplyButton,
                  {
                    borderColor: mode === 'dark' ? 'rgba(255,255,255,0.12)' : '#D8E0EE',
                    backgroundColor: mode === 'dark' ? '#151D2E' : '#FFFFFF',
                  },
                ]}
              >
                <AppIcon name="search" size="xs" tone="muted" />
                <Text numberOfLines={1} style={[styles.filterApplyText, { color: theme.colors.textMuted }]}>
                  {t('transactions.actions.search')}
                </Text>
              </Pressable>
            </View>

            <View style={styles.summaryRow}>
              <View
                style={[
                  styles.summaryCard,
                  {
                    backgroundColor: mode === 'dark' ? '#171F33' : '#FFFFFF',
                    borderColor: mode === 'dark' ? 'rgba(255,255,255,0.10)' : '#EAF0FA',
                  },
                ]}
              >
                <Text numberOfLines={1} style={[styles.summaryLabel, { color: theme.colors.textMuted }]}>
                  {t('transactions.summary.totalIncome')}
                </Text>
                <Text adjustsFontSizeToFit numberOfLines={1} style={styles.summaryIncome}>
                  {formatCurrency(totals.income, summaryCurrency, locale)}
                </Text>
              </View>

              <View
                style={[
                  styles.summaryCard,
                  {
                    backgroundColor: mode === 'dark' ? '#171F33' : '#FFFFFF',
                    borderColor: mode === 'dark' ? 'rgba(255,255,255,0.10)' : '#EAF0FA',
                  },
                ]}
              >
                <Text numberOfLines={1} style={[styles.summaryLabel, { color: theme.colors.textMuted }]}>
                  {t('transactions.summary.totalExpense')}
                </Text>
                <Text adjustsFontSizeToFit numberOfLines={1} style={styles.summaryExpense}>
                  {formatCurrency(totals.expense, summaryCurrency, locale)}
                </Text>
              </View>
            </View>

            <View style={styles.quickActionsRow}>
              <Pressable
                accessibilityRole="button"
                onPress={() => navigation.navigate('ScanReceipt')}
                style={[
                  styles.quickActionButton,
                  {
                    backgroundColor: mode === 'dark' ? '#151E33' : '#EAF0FF',
                    borderColor: mode === 'dark' ? 'rgba(255,255,255,0.12)' : '#D4E2FF',
                  },
                ]}
              >
                <AppIcon name="scan-outline" size="sm" tone="primary" />
                <Text numberOfLines={2} style={[styles.quickActionTitle, { color: theme.colors.primary }]}>
                  {t('transactions.quickActions.scanTitle')}
                </Text>
                <Text numberOfLines={2} style={[styles.quickActionSubtitle, { color: theme.colors.textMuted }]}>
                  {t('transactions.quickActions.scanSubtitle')}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={() => navigation.navigate('Groups')}
                style={[
                  styles.quickActionButton,
                  {
                    backgroundColor: mode === 'dark' ? '#141C2B' : '#EAF9F0',
                    borderColor: mode === 'dark' ? 'rgba(255,255,255,0.12)' : '#CDEBD8',
                  },
                ]}
              >
                <AppIcon name="people-outline" size="sm" tone="income" />
                <Text numberOfLines={2} style={[styles.quickActionTitle, { color: theme.colors.income }]}>
                  {t('transactions.quickActions.splitTitle')}
                </Text>
                <Text numberOfLines={2} style={[styles.quickActionSubtitle, { color: theme.colors.textMuted }]}>
                  {t('transactions.quickActions.splitSubtitle')}
                </Text>
              </Pressable>
            </View>
          </View>
        }
        refreshControl={
          <RefreshControl
            onRefresh={() => {
              void transactionsQuery.refetch();
            }}
            refreshing={transactionsQuery.isRefetching && !transactionsQuery.isFetchingNextPage}
            tintColor={theme.colors.primary}
          />
        }
        removeClippedSubviews
        renderItem={renderListItem}
        showsVerticalScrollIndicator={false}
      />
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
  listContent: {
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  loadingStateWrap: {
    gap: spacing.sm,
  },
  loadingStateText: {
    ...typography.body,
    textAlign: 'center',
  },
  headerWrap: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  iconButton: {
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: radius.full,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  screenTitle: {
    ...typography.subheading,
    fontSize: 21,
    fontWeight: '700',
  },
  searchWrap: {
    alignItems: 'center',
    borderRadius: radius.md,
    flexDirection: 'row',
    height: 46,
    paddingHorizontal: spacing.xs,
  },
  searchIconWrap: {
    alignItems: 'center',
    height: 20,
    justifyContent: 'center',
    marginLeft: spacing.xs,
    width: 20,
  },
  searchInput: {
    ...typography.body,
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: spacing.xs,
    paddingVertical: 0,
  },
  filterChipRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  filterChip: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  filterChipText: {
    ...typography.caption,
    fontWeight: '700',
  },
  filterApplyButton: {
    alignItems: 'center',
    borderRadius: radius.full,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xxs,
    marginLeft: 0,
    minHeight: 32,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  filterApplyText: {
    ...typography.caption,
    fontWeight: '700',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  quickActionButton: {
    alignItems: 'flex-start',
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    gap: spacing.xxs,
    minHeight: 76,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  quickActionTitle: {
    ...typography.subheading,
    fontSize: 16,
    fontWeight: '700',
  },
  quickActionSubtitle: {
    ...typography.caption,
    fontSize: 11,
  },
  summaryCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  summaryLabel: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: spacing.xxs,
  },
  summaryIncome: {
    ...typography.subheading,
    color: '#17B26A',
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    flexShrink: 1,
  },
  summaryExpense: {
    ...typography.subheading,
    color: '#F04438',
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    flexShrink: 1,
  },
  groupHeader: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: spacing.sm,
    textTransform: 'uppercase',
  },
  itemSeparator: {
    height: spacing.xs,
  },
  emptyCard: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  footerLoaderWrap: {
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  footerLoaderText: {
    ...typography.caption,
    fontSize: 12,
  },
  footerSpacer: {
    height: spacing.xl,
  },
  emptyText: {
    ...typography.body,
    textAlign: 'center',
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
  skeletonWrap: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  skeletonHeader: {
    borderRadius: radius.md,
    height: 30,
    width: '45%',
  },
  skeletonSearch: {
    borderRadius: radius.md,
    height: 46,
    width: '100%',
  },
  skeletonChips: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  skeletonChip: {
    borderRadius: radius.full,
    height: 34,
    width: 90,
  },
  skeletonSummaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  skeletonSummary: {
    borderRadius: radius.md,
    flex: 1,
    height: 84,
  },
  skeletonItem: {
    borderRadius: radius.md,
    height: 66,
    width: '100%',
  },
});
