import { useMemo } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import type { GroupExpense } from '@mintly/shared';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@core/api/client';
import { financeQueryKeys } from '@core/api/queryKeys';
import { useAuth } from '@app/providers/AuthProvider';
import { AppIcon, Card, ExpenseRow, GradientCard, MemberChip, ScreenContainer } from '@shared/ui';
import { useI18n } from '@shared/i18n';
import type { TransactionsStackParamList } from '@core/navigation/stacks/TransactionsStack';
import { radius, spacing, typography, useTheme } from '@shared/theme';
import { apiErrorText } from '@shared/utils/apiErrorText';

function buildBalanceMap(expenses: GroupExpense[]) {
  const map = new Map<string, number>();

  for (const expense of expenses) {
    map.set(expense.paidByMemberId, (map.get(expense.paidByMemberId) ?? 0) + expense.amount);

    for (const split of expense.splits) {
      map.set(split.memberId, (map.get(split.memberId) ?? 0) - split.amount);
    }
  }

  return map;
}

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

  return date.toLocaleDateString(locale, {
    day: '2-digit',
    month: 'short',
  });
}

function iconForExpense(title: string): Parameters<typeof AppIcon>[0]['name'] {
  const normalized = title.toLowerCase();

  if (normalized.includes('market') || normalized.includes('grocery')) {
    return 'cart-outline';
  }

  if (normalized.includes('transport') || normalized.includes('taxi') || normalized.includes('fuel')) {
    return 'car-sport-outline';
  }

  if (normalized.includes('rent') || normalized.includes('home')) {
    return 'home-outline';
  }

  if (normalized.includes('bill') || normalized.includes('invoice')) {
    return 'receipt-outline';
  }

  return 'card-outline';
}

export function GroupDetailScreen() {
  const route = useRoute<RouteProp<TransactionsStackParamList, 'GroupDetail'>>();
  const navigation = useNavigation<NativeStackNavigationProp<TransactionsStackParamList>>();
  const { withAuth, user } = useAuth();
  const { theme, mode } = useTheme();
  const { locale, t } = useI18n();

  const groupQuery = useQuery({
    queryKey: financeQueryKeys.groups.detail(route.params.groupId),
    queryFn: () => withAuth((token) => apiClient.getGroup(route.params.groupId, token)),
  });

  const expensesQuery = useQuery({
    queryKey: financeQueryKeys.groups.expenses(route.params.groupId),
    queryFn: () => withAuth((token) => apiClient.getGroupExpenses(route.params.groupId, token)),
  });

  const group = groupQuery.data;
  const expenses = expensesQuery.data?.expenses ?? [];

  const balanceMap = useMemo(() => buildBalanceMap(expenses), [expenses]);

  const currentMember = useMemo(
    () =>
      group?.members.find((member) => {
        if (!user) {
          return false;
        }

        return member.userId === user.id || member.email.toLowerCase() === user.email.toLowerCase();
      }) ?? null,
    [group?.members, user],
  );

  const currency = expenses[0]?.currency ?? user?.baseCurrency ?? 'TRY';

  const userBalance = currentMember ? balanceMap.get(currentMember.id) ?? 0 : 0;
  const groupTotal = expenses.reduce((sum, item) => sum + item.amount, 0);

  const userBalanceLabel =
    userBalance > 0
      ? t('split.groupDetail.balanceState.creditor')
      : userBalance < 0
        ? t('split.groupDetail.balanceState.debtor')
        : t('split.groupDetail.balanceState.settled');

  const sortedExpenses = useMemo(
    () => [...expenses].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [expenses],
  );

  const memberRows = useMemo(
    () =>
      (group?.members ?? []).map((member) => ({
        member,
        balance: balanceMap.get(member.id) ?? 0,
      })),
    [balanceMap, group?.members],
  );

  if (groupQuery.isLoading || expensesQuery.isLoading) {
    return (
      <ScreenContainer dark={mode === 'dark'}>
        <Card dark={mode === 'dark'} style={styles.loadingCard}>
          <AppIcon name="people-outline" size="xl" tone="primary" />
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>{t('split.groupDetail.loading')}</Text>
        </Card>
      </ScreenContainer>
    );
  }

  if (groupQuery.isError || expensesQuery.isError || !groupQuery.data || !expensesQuery.data) {
    const error = groupQuery.error ?? expensesQuery.error;

    return (
      <ScreenContainer dark={mode === 'dark'}>
        <Card dark={mode === 'dark'} style={styles.errorCard}>
          <AppIcon name="alert-circle-outline" size="lg" tone="expense" />
          <Text style={[styles.errorTitle, { color: theme.colors.text }]}>{t('split.groupDetail.loadErrorTitle')}</Text>
          <Text style={[styles.errorText, { color: theme.colors.expense }]}>{apiErrorText(error)}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void groupQuery.refetch();
              void expensesQuery.refetch();
            }}
            style={({ pressed }) => [
              styles.retryButton,
              {
                backgroundColor: theme.colors.primary,
              },
              pressed ? styles.buttonPressed : null,
            ]}
          >
            <View style={styles.retryInner}>
              <AppIcon name="refresh" size="sm" tone="inverse" />
              <Text style={styles.retryLabel}>{t('split.groupDetail.retry')}</Text>
            </View>
          </Pressable>
        </Card>
      </ScreenContainer>
    );
  }

  const groupData = groupQuery.data;

  return (
    <ScreenContainer dark={mode === 'dark'} scrollable={false} contentStyle={styles.containerContent}>
      <View style={styles.screenWrap}>
        <FlatList
          contentContainerStyle={styles.content}
          data={sortedExpenses}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            <View style={styles.headerWrap}>
              <GradientCard>
                <Text style={styles.summaryLabel}>{t('split.groupDetail.summaryTitle')}</Text>
                <Text style={styles.summaryTitle}>{groupData.name}</Text>
                <Text style={styles.summarySub}>{t('split.groupDetail.summarySubtitle')}</Text>

                <View style={styles.summaryMetrics}>
                  <View style={styles.metricBlock}>
                    <Text style={styles.metricLabel}>{t('split.groupDetail.totalSpending')}</Text>
                    <Text style={styles.metricValue}>{formatMoney(groupTotal, currency, locale)}</Text>
                  </View>

                  <View style={styles.metricBlock}>
                    <Text style={styles.metricLabel}>{t('split.groupDetail.yourBalance')}</Text>
                    <Text
                      style={[
                        styles.metricValue,
                        {
                          color:
                            userBalance > 0 ? '#B3FFD9' : userBalance < 0 ? '#FFD2CF' : '#E4ECFF',
                        },
                      ]}
                    >
                      {userBalance > 0 ? '+' : userBalance < 0 ? '-' : ''}
                      {formatMoney(Math.abs(userBalance), currency, locale)}
                    </Text>
                    <View style={styles.balanceTag}>
                      <Text style={styles.balanceTagText}>{userBalanceLabel}</Text>
                    </View>
                  </View>
                </View>
              </GradientCard>

              <View style={styles.sectionWrap}>
                <View style={styles.sectionHeader}>
                  <AppIcon name="people-outline" size="sm" tone="primary" />
                  <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{t('split.groupDetail.membersTitle')}</Text>
                </View>
                <FlatList
                  data={memberRows}
                  horizontal
                  keyExtractor={(item) => item.member.id}
                  renderItem={({ item }) => (
                    <View style={styles.memberItemWrap}>
                      <MemberChip
                        name={item.member.name}
                        balance={item.balance}
                        currency={currency}
                        showBalance
                        selected={currentMember?.id === item.member.id}
                      />
                    </View>
                  )}
                  showsHorizontalScrollIndicator={false}
                />
              </View>

              <View style={styles.sectionHeader}>
                <AppIcon name="receipt-outline" size="sm" tone="primary" />
                <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{t('split.groupDetail.recentExpenses')}</Text>
              </View>
            </View>
          }
          ListEmptyComponent={
            <Card dark={mode === 'dark'} style={styles.emptyCard}>
              <AppIcon name="file-tray-outline" size="lg" tone="muted" />
              <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>{t('split.groupDetail.noExpenses')}</Text>
            </Card>
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => {
            const paidBy =
              groupData.members.find((member) => member.id === item.paidByMemberId)?.name ??
              t('split.common.unknownMember');
            const yourShare =
              currentMember ? item.splits.find((split) => split.memberId === currentMember.id)?.amount ?? 0 : 0;

            const net = currentMember
              ? item.paidByMemberId === currentMember.id
                ? item.amount - yourShare
                : -yourShare
              : 0;

            const indicatorTone: 'positive' | 'negative' | 'neutral' =
              item.settledAt || net === 0 ? 'neutral' : net > 0 ? 'positive' : 'negative';

            const indicatorLabel = item.settledAt
              ? t('split.groupDetail.indicator.settled')
              : currentMember
                ? net > 0
                  ? t('split.groupDetail.indicator.youGet', {
                      amount: formatMoney(Math.abs(net), item.currency, locale),
                    })
                  : net < 0
                    ? t('split.groupDetail.indicator.youOwe', {
                        amount: formatMoney(Math.abs(net), item.currency, locale),
                      })
                    : t('split.groupDetail.indicator.noShare')
                : t('split.groupDetail.indicator.unknownShare');

            return (
              <ExpenseRow
                iconName={iconForExpense(item.title)}
                title={item.title}
                subtitle={t('split.groupDetail.expenseSubtitle', {
                  payer: paidBy,
                  date: formatDate(item.createdAt, locale),
                })}
                amount={formatMoney(item.amount, item.currency, locale)}
                indicator={indicatorLabel}
                indicatorTone={indicatorTone}
              />
            );
          }}
          showsVerticalScrollIndicator={false}
        />

        <View
          style={[
            styles.actionRow,
            {
              borderTopColor: mode === 'dark' ? 'rgba(255,255,255,0.08)' : '#DFE7F4',
              backgroundColor: theme.colors.background,
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.navigate('SettleUp', { groupId: groupData.id })}
            style={({ pressed }) => [
              styles.outlineButton,
              {
                borderColor: theme.colors.primary,
                backgroundColor: mode === 'dark' ? 'rgba(47,107,255,0.12)' : '#FFFFFF',
              },
              pressed ? styles.buttonPressed : null,
            ]}
          >
            <View style={styles.buttonInner}>
              <AppIcon name="wallet-outline" size="sm" tone="primary" />
              <Text style={[styles.outlineLabel, { color: theme.colors.primary }]}>
                {t('split.groupDetail.actions.settleUp')}
              </Text>
            </View>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.navigate('AddGroupExpense', { groupId: groupData.id })}
            style={({ pressed }) => [
              styles.primaryButton,
              {
                backgroundColor: theme.colors.primary,
              },
              pressed ? styles.buttonPressed : null,
            ]}
          >
            <View style={styles.buttonInner}>
              <AppIcon name="add-circle-outline" size="sm" tone="inverse" />
              <Text style={[styles.primaryLabel, { color: theme.colors.buttonPrimaryText }]}>
                {t('split.groupDetail.actions.addExpense')}
              </Text>
            </View>
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
  screenWrap: {
    flex: 1,
  },
  content: {
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  headerWrap: {
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  summaryLabel: {
    ...typography.caption,
    color: '#D4E4FF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  summaryTitle: {
    ...typography.heading,
    color: '#FFFFFF',
    fontSize: 28,
    lineHeight: 34,
  },
  summarySub: {
    ...typography.caption,
    color: '#E4ECFF',
    fontSize: 12,
  },
  summaryMetrics: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  metricBlock: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: radius.md,
    flex: 1,
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  metricLabel: {
    ...typography.caption,
    color: '#DCE7FF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  metricValue: {
    ...typography.subheading,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  balanceTag: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(7, 18, 48, 0.35)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  balanceTagText: {
    ...typography.caption,
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  sectionWrap: {
    gap: spacing.xs,
  },
  sectionTitle: {
    ...typography.subheading,
    fontSize: 18,
    fontWeight: '700',
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  memberItemWrap: {
    marginRight: spacing.xs,
  },
  separator: {
    height: spacing.xs,
  },
  actionRow: {
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  outlineButton: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: spacing.md,
  },
  outlineLabel: {
    ...typography.subheading,
    fontSize: 14,
    fontWeight: '700',
  },
  buttonInner: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
  },
  primaryButton: {
    alignItems: 'center',
    borderRadius: radius.md,
    flex: 1,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: spacing.md,
  },
  primaryLabel: {
    ...typography.subheading,
    fontSize: 14,
    fontWeight: '700',
  },
  emptyCard: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  helperText: {
    ...typography.body,
  },
  loadingCard: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  errorCard: {
    gap: spacing.sm,
  },
  errorTitle: {
    ...typography.subheading,
    fontWeight: '700',
  },
  errorText: {
    ...typography.body,
  },
  retryButton: {
    alignItems: 'center',
    borderRadius: radius.md,
    justifyContent: 'center',
    minHeight: 44,
  },
  retryLabel: {
    ...typography.subheading,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  retryInner: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
  },
  buttonPressed: {
    opacity: 0.86,
  },
});
