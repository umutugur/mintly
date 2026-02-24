import { memo, useCallback, useMemo } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { DashboardRecentResponse } from '@mintly/shared';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@core/api/client';
import { financeQueryKeys } from '@core/api/queryKeys';
import { useAuth } from '@app/providers/AuthProvider';
import { useI18n } from '@shared/i18n';
import { Card, PrimaryButton, ScreenContainer } from '@shared/ui';
import type { AnalyticsStackParamList } from '@core/navigation/stacks/AnalyticsStack';
import type { TransactionsStackParamList } from '@core/navigation/stacks/TransactionsStack';
import type { RootTabParamList } from '@core/navigation/types';
import { radius, spacing, typography, useTheme } from '@shared/theme';
import type { ThemeMode } from '@shared/theme';
import { apiErrorText } from '@shared/utils/apiErrorText';
import { MintlyLogo } from '../../../components/brand/MintlyLogo';

// stitch asset: stitch/export/stitch_ana_ekran_dashboard/ana_ekran_(dashboard)_1/screen.png
// no touch/keyboard behavior changed by this PR.

type DashboardTransaction = DashboardRecentResponse['recentTransactions'][number];
type DashboardUpcomingPayment = DashboardRecentResponse['upcomingPaymentsDueSoon'][number];

interface RecentTransactionRowProps {
  amount: string;
  mode: ThemeMode;
  subtitle: string;
  title: string;
  type: 'income' | 'expense';
  kind: 'normal' | 'transfer';
}

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

function formatOccurredAt(
  value: string,
  locale: string,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));
  const time = date.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (diffDays === 0) {
    return t('dashboard.time.today', { time });
  }

  if (diffDays === 1) {
    return t('dashboard.time.yesterday', { time });
  }

  const dayMonth = date.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
  });

  return t('dashboard.time.dayWithTime', { day: dayMonth, time });
}

function formatDueDateLabel(
  value: string,
  locale: string,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return t('dashboard.upcoming.today');
  }

  if (diffDays === 1) {
    return t('dashboard.upcoming.tomorrow');
  }

  return date.toLocaleDateString(locale, {
    day: '2-digit',
    month: 'short',
  });
}

function toInitials(value: string | null | undefined, fallback: string): string {
  if (!value) {
    return fallback;
  }

  const words = value
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return fallback;
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0] ?? ''}${words[1][0] ?? ''}`.toUpperCase();
}

function deriveTrendText(
  incomeTotal: number,
  expenseTotal: number,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (incomeTotal <= 0) {
    return t('dashboard.trend.stable');
  }

  const ratio = ((incomeTotal - expenseTotal) / incomeTotal) * 100;
  const absolute = Math.abs(ratio).toFixed(1);
  return ratio >= 0
    ? t('dashboard.trend.increase', { percent: absolute })
    : t('dashboard.trend.decrease', { percent: absolute });
}

function deriveInsight(incomeTotal: number, expenseTotal: number): {
  highlight: string;
  message: string;
  noHighlightText?: string;
} {
  if (incomeTotal <= 0) {
    return {
      highlight: '%0',
      message: 'dashboard.insight.noSavingsMessage',
      noHighlightText: 'dashboard.insight.noSavingsHighlight',
    };
  }

  const savingsPercent = Math.max(0, Math.round(((incomeTotal - expenseTotal) / incomeTotal) * 100));
  return {
    highlight: `%${savingsPercent}`,
    message: 'dashboard.insight.savingsMessage',
  };
}

function formatAccountType(
  accountType: string,
  accountName: string,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const normalizedName = accountName
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');

  if (
    normalizedName.includes('saving') ||
    normalizedName.includes('savings') ||
    normalizedName.includes('birikim') ||
    normalizedName.includes('tasarruf')
  ) {
    const savings = t('accounts.accountType.savings');
    if (savings) {
      return savings;
    }
  }

  const key = `dashboard.accountTypes.${accountType.toLowerCase()}`;
  const translated = t(key);
  if (!translated || translated === key) {
    return accountType;
  }

  return translated;
}

const INCOME_BARS = [0.38, 0.58, 0.36, 0.88];
const EXPENSE_BARS = [0.7, 0.45, 0.8, 0.32];

function MiniStatCard({
  label,
  value,
  tone,
  mode,
}: {
  label: string;
  value: string;
  tone: 'income' | 'expense';
  mode: ThemeMode;
}) {
  const bars = tone === 'income' ? INCOME_BARS : EXPENSE_BARS;
  const valueColor = tone === 'income' ? '#16A965' : '#EA3F63';
  const mutedBarColor = tone === 'income' ? '#CDEFE0' : '#F9D9DE';
  const activeBarColor = tone === 'income' ? '#19B16E' : '#EF3F64';

  return (
    <View
      style={[
        styles.statCard,
        {
          backgroundColor: mode === 'dark' ? '#171A22' : '#FFFFFF',
          borderColor: mode === 'dark' ? 'rgba(255,255,255,0.10)' : '#EEF2F8',
        },
      ]}
    >
      <Text style={[styles.statLabel, { color: mode === 'dark' ? '#96A2B7' : '#6B7280' }]}>{label}</Text>
      <Text style={[styles.statValue, { color: valueColor }]}>{value}</Text>

      <View style={styles.statBars}>
        {bars.map((bar, index) => (
          <View
            key={`${tone}-bar-${index}`}
            style={[
              styles.statBar,
              {
                backgroundColor: index === bars.length - 1 ? activeBarColor : mutedBarColor,
                height: 42 * bar,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

function AccountCard({
  name,
  accountType,
  amount,
  mode,
}: {
  name: string;
  accountType: string;
  amount: string;
  mode: ThemeMode;
}) {
  return (
    <View
      style={[
        styles.accountCard,
        {
          backgroundColor: mode === 'dark' ? '#171A22' : '#FFFFFF',
          borderColor: mode === 'dark' ? 'rgba(255,255,255,0.10)' : '#EAF0FA',
        },
      ]}
    >
      <Text numberOfLines={1} style={[styles.accountName, { color: mode === 'dark' ? '#F3F7FF' : '#1D2433' }]}>
        {name}
      </Text>
      <Text style={[styles.accountMeta, { color: mode === 'dark' ? '#98A5BA' : '#74839C' }]}>{accountType}</Text>
      <Text numberOfLines={1} style={[styles.accountAmount, { color: mode === 'dark' ? '#AFC6FF' : '#2F6BFF' }]}>
        {amount}
      </Text>
    </View>
  );
}

const RecentTransactionRow = memo(function RecentTransactionRow({
  amount,
  mode,
  subtitle,
  title,
  type,
  kind,
}: RecentTransactionRowProps) {
  const palette = getTransactionPalette(type, kind, mode);

  return (
    <View
      style={[
        styles.transactionCard,
        {
          backgroundColor: mode === 'dark' ? '#161A22' : '#FFFFFF',
          borderColor: mode === 'dark' ? 'rgba(255,255,255,0.08)' : '#EDF2FA',
        },
      ]}
    >
      <View style={[styles.transactionIconWrap, { backgroundColor: palette.iconBg }]}>
        <Text style={[styles.transactionIcon, { color: palette.iconText }]}>{palette.icon}</Text>
      </View>

      <View style={styles.transactionMeta}>
        <Text numberOfLines={1} style={[styles.transactionTitle, { color: mode === 'dark' ? '#F3F7FF' : '#1F293B' }]}>
          {title}
        </Text>
        <Text numberOfLines={1} style={[styles.transactionSubtitle, { color: mode === 'dark' ? '#90A0B7' : '#8A97AD' }]}>
          {subtitle}
        </Text>
      </View>

      <Text style={[styles.transactionAmount, { color: palette.amount }]}>{amount}</Text>
    </View>
  );
});

function getTransactionPalette(
  type: 'income' | 'expense',
  kind: 'normal' | 'transfer',
  mode: ThemeMode,
): {
  amount: string;
  icon: string;
  iconBg: string;
  iconText: string;
} {
  if (kind === 'transfer') {
    return {
      amount: type === 'income' ? '#16A965' : '#EA3F63',
      icon: '↔',
      iconBg: mode === 'dark' ? 'rgba(95,134,255,0.20)' : '#EAF0FF',
      iconText: '#2F6BFF',
    };
  }

  if (type === 'income') {
    return {
      amount: '#16A965',
      icon: '+',
      iconBg: mode === 'dark' ? 'rgba(22,169,101,0.22)' : '#E8F9F0',
      iconText: '#16A965',
    };
  }

  return {
    amount: '#EA3F63',
    icon: '-',
    iconBg: mode === 'dark' ? 'rgba(234,63,99,0.20)' : '#FEECEF',
    iconText: '#EA3F63',
  };
}

function DashboardSkeleton({ mode }: { mode: ThemeMode }) {
  const block = mode === 'dark' ? '#1A202A' : '#E6EDF8';

  return (
    <View style={styles.skeletonWrap}>
      <View style={[styles.skeletonHeader, { backgroundColor: block }]} />
      <View style={[styles.skeletonHero, { backgroundColor: block }]} />
      <View style={styles.skeletonRow}>
        <View style={[styles.skeletonStat, { backgroundColor: block }]} />
        <View style={[styles.skeletonStat, { backgroundColor: block }]} />
      </View>
      <View style={[styles.skeletonInsight, { backgroundColor: block }]} />
      <View style={styles.skeletonRow}>
        <View style={[styles.skeletonQuick, { backgroundColor: block }]} />
        <View style={[styles.skeletonQuick, { backgroundColor: block }]} />
        <View style={[styles.skeletonQuick, { backgroundColor: block }]} />
      </View>
      <View style={[styles.skeletonTx, { backgroundColor: block }]} />
      <View style={[styles.skeletonTx, { backgroundColor: block }]} />
      <View style={[styles.skeletonTx, { backgroundColor: block }]} />
    </View>
  );
}

export function DashboardScreen() {
  const navigation = useNavigation<any>();
  const { withAuth, user } = useAuth();
  const { theme, mode } = useTheme();
  const { locale, t } = useI18n();

  const dashboardQuery = useQuery({
    queryKey: financeQueryKeys.dashboard.recent(),
    queryFn: () => withAuth((token) => apiClient.getDashboardRecent(token)),
  });

  const currency = useMemo(() => {
    if (dashboardQuery.data?.balances[0]?.currency) {
      return dashboardQuery.data.balances[0].currency;
    }

    return user?.baseCurrency ?? 'TRY';
  }, [dashboardQuery.data?.balances, user?.baseCurrency]);

  const accountNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const balance of dashboardQuery.data?.balances ?? []) {
      map[balance.accountId] = balance.name;
    }
    return map;
  }, [dashboardQuery.data?.balances]);

  const profileName = useMemo(() => {
    if (user?.name?.trim()) {
      return user.name.trim();
    }

    if (user?.email) {
      return user.email.split('@')[0];
    }

    return t('common.appName');
  }, [t, user?.email, user?.name]);

  const recentTotals = useMemo(() => {
    let incomeTotal = 0;
    let expenseTotal = 0;

    for (const transaction of dashboardQuery.data?.recentTransactions ?? []) {
      if (transaction.kind === 'transfer') {
        continue;
      }

      if (transaction.type === 'income') {
        incomeTotal += transaction.amount;
      } else {
        expenseTotal += transaction.amount;
      }
    }

    return { expenseTotal, incomeTotal };
  }, [dashboardQuery.data?.recentTransactions]);

  const trendLabel = useMemo(
    () => deriveTrendText(recentTotals.incomeTotal, recentTotals.expenseTotal, t),
    [recentTotals.expenseTotal, recentTotals.incomeTotal, t],
  );

  const insight = useMemo(
    () => deriveInsight(recentTotals.incomeTotal, recentTotals.expenseTotal),
    [recentTotals.expenseTotal, recentTotals.incomeTotal],
  );

  const goToAnalyticsScreen = useCallback(
    (screen: keyof AnalyticsStackParamList) => {
      const parent = navigation.getParent?.();
      const root = parent?.getParent?.();
      const target = (root ?? parent ?? navigation) as {
        navigate: (
          routeName: keyof RootTabParamList,
          params?: RootTabParamList['AnalyticsTab'],
        ) => void;
      };

      target.navigate('AnalyticsTab', { screen });
    },
    [navigation],
  );

  const goToAddTab = useCallback(() => {
    const parent = navigation.getParent?.();
    const root = parent?.getParent?.();
    const target = (root ?? parent ?? navigation) as {
      navigate: (routeName: keyof RootTabParamList, params?: RootTabParamList['AddTab']) => void;
    };

    target.navigate('AddTab');
  }, [navigation]);

  const goToAccountsScreen = useCallback(() => {
    const parent = navigation.getParent?.();
    const root = parent?.getParent?.();
    const target = (root ?? parent ?? navigation) as {
      navigate: (
        routeName: keyof RootTabParamList,
        params?: RootTabParamList['ProfileTab']
      ) => void;
    };

    target.navigate('ProfileTab', { screen: 'Accounts' });
  }, [navigation]);

  const goToTransactionsScreen = useCallback(
    (
      screen: keyof TransactionsStackParamList,
      params?: TransactionsStackParamList[keyof TransactionsStackParamList],
    ) => {
      const parent = navigation.getParent?.();
      const root = parent?.getParent?.();
      const target = (root ?? parent ?? navigation) as {
        navigate: (
          routeName: keyof RootTabParamList,
          params?: RootTabParamList['TransactionsTab'],
        ) => void;
      };

      target.navigate(
        'TransactionsTab',
        {
          screen,
          params,
        } as RootTabParamList['TransactionsTab'],
      );
    },
    [navigation],
  );

  const renderTransaction = useCallback(
    ({ item }: { item: DashboardTransaction }) => {
      const accountName = accountNameById[item.accountId] ?? t('dashboard.accountFallback');
      const relatedName = item.relatedAccountId ? accountNameById[item.relatedAccountId] : null;

      let context = accountName;
      if (item.kind === 'transfer') {
        if (item.transferDirection === 'out' && relatedName) {
          context = `${accountName} -> ${relatedName}`;
        } else if (item.transferDirection === 'in' && relatedName) {
          context = `${relatedName} -> ${accountName}`;
        } else {
          context = t('dashboard.transaction.transferContext');
        }
      }

      const title =
        item.description?.trim() ||
        (item.kind === 'transfer'
          ? t('dashboard.transaction.transferTitle')
          : item.type === 'income'
            ? t('dashboard.transaction.incomeTitle')
            : t('dashboard.transaction.expenseTitle'));

      const subtitle = `${formatOccurredAt(item.occurredAt, locale, t)} • ${context}`;

      return (
        <RecentTransactionRow
          amount={formatSignedAmount(item.amount, item.currency, item.type, locale)}
          kind={item.kind}
          mode={mode}
          subtitle={subtitle}
          title={title}
          type={item.type}
        />
      );
    },
    [accountNameById, locale, mode, t],
  );

  if (dashboardQuery.isLoading) {
    return (
      <ScreenContainer scrollable={false} contentStyle={styles.containerContent}>
        <View style={styles.loadingStateWrap}>
          <DashboardSkeleton mode={mode} />
          <Text style={[styles.loadingStateText, { color: theme.colors.textMuted }]}>
            {t('dashboard.state.loading')}
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  if (dashboardQuery.isError) {
    return (
      <ScreenContainer>
        <Card style={styles.errorCard}>
          <Text style={[styles.errorTitle, { color: theme.colors.text }]}>{t('dashboard.state.errorTitle')}</Text>
          <Text style={[styles.errorText, { color: theme.colors.expense }]}>{apiErrorText(dashboardQuery.error)}</Text>
          <PrimaryButton label={t('common.retry')} onPress={() => void dashboardQuery.refetch()} />
        </Card>
      </ScreenContainer>
    );
  }

  const data = dashboardQuery.data;

  if (!data) {
    return (
      <ScreenContainer>
        <Card>
          <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>{t('dashboard.state.noData')}</Text>
        </Card>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scrollable={false} contentStyle={styles.containerContent}>
      <FlatList
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        contentContainerStyle={styles.listContent}
        data={data.recentTransactions}
        ItemSeparatorComponent={() => <View style={styles.transactionSeparator} />}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <Card>
            <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>{t('dashboard.state.noTransactions')}</Text>
          </Card>
        }
        ListHeaderComponent={
          <View style={styles.headerWrap}>
            <View style={styles.topRow}>
              <View style={styles.profileRow}>
                <View
                  style={[
                    styles.avatar,
                    {
                      backgroundColor: mode === 'dark' ? '#25363A' : '#DFECDD',
                      borderColor: mode === 'dark' ? '#36585C' : '#D2E2CF',
                    },
                  ]}
                >
                  <Text style={[styles.avatarText, { color: mode === 'dark' ? '#C3EFE2' : '#5A6A58' }]}>
                    {toInitials(profileName, t('common.appInitials'))}
                  </Text>
                </View>

                <View>
                  <Text style={[styles.greetingText, { color: theme.colors.textMuted }]}>{t('dashboard.greeting')}</Text>
                  <Text numberOfLines={1} style={[styles.profileName, { color: theme.colors.primary }]}>
                    {profileName}
                  </Text>
                </View>
              </View>

              <View
                style={styles.topRowRight}
              >
                <View
                  style={[
                    styles.statusPill,
                    {
                      backgroundColor: mode === 'dark' ? 'rgba(47,107,255,0.20)' : '#F1F5FF',
                      borderColor: mode === 'dark' ? 'rgba(47,107,255,0.34)' : '#D8E4FF',
                    },
                  ]}
                >
                  <View style={styles.statusDot} />
                  <Text numberOfLines={1} style={[styles.statusLabel, { color: theme.colors.primary }]}>
                    {t('dashboard.aiActive')}
                  </Text>
                </View>
                <MintlyLogo
                  height={24}
                  style={styles.brandMark}
                  variant="mark"
                  width={44}
                />
              </View>
            </View>

            <View style={styles.balanceCard}>
              <Text style={styles.balanceLabel}>{t('dashboard.currentBalance')}</Text>
              <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={styles.balanceAmount}>
                {formatCurrency(data.totalBalance, currency, locale)}
              </Text>

              <View style={styles.balanceTrendPill}>
                <Text style={styles.balanceTrendArrow}>↗</Text>
                <Text numberOfLines={2} style={styles.balanceTrendText}>
                  {trendLabel}
                </Text>
              </View>
            </View>

            <View style={styles.statRow}>
              <MiniStatCard
                label={t('dashboard.income')}
                mode={mode}
                tone="income"
                value={formatCurrency(recentTotals.incomeTotal, currency, locale)}
              />
              <MiniStatCard
                label={t('dashboard.expense')}
                mode={mode}
                tone="expense"
                value={formatCurrency(recentTotals.expenseTotal, currency, locale)}
              />
            </View>

            {data.balances.length > 0 ? (
              <View style={styles.sectionWrap}>
                <View style={styles.sectionHeaderRow}>
                  <Text
                    numberOfLines={2}
                    style={[styles.sectionTitle, { color: mode === 'dark' ? '#F3F7FF' : '#1B2437' }]}
                  >
                    {t('dashboard.accounts')}
                  </Text>
                </View>
                <View style={styles.accountsGrid}>
                  {data.balances.map((balance) => (
                    <AccountCard
                      key={balance.accountId}
                      accountType={formatAccountType(balance.type, balance.name, t)}
                      amount={formatCurrency(balance.balance, balance.currency, locale)}
                      mode={mode}
                      name={balance.name}
                    />
                  ))}
                </View>
              </View>
            ) : (
              <Card style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl }}>
                <Text style={[styles.emptyText, { color: theme.colors.textMuted, textAlign: 'center' }]}>
                  {t('dashboard.state.noAccounts')}
                </Text>
                <PrimaryButton
                  label={t('dashboard.state.createAccount')}
                  onPress={goToAccountsScreen}
                  iconName="add-circle-outline"
                />
              </Card>
            )}

            <View
              style={[
                styles.insightCard,
                {
                  backgroundColor: mode === 'dark' ? '#171A22' : '#F4F6FD',
                  borderColor: mode === 'dark' ? 'rgba(47,107,255,0.28)' : '#CDD9F2',
                },
              ]}
            >
              <View style={styles.insightIconBox}>
                <Text style={styles.insightIcon}>✦</Text>
              </View>

              <View style={styles.insightContent}>
                <Text style={[styles.insightTitle, { color: theme.colors.primary }]}>{t('dashboard.aiAnalysisTitle')}</Text>
                <Text style={[styles.insightText, { color: mode === 'dark' ? '#A8B3C7' : '#52607A' }]}>
                  {insight.noHighlightText ? (
                    <>
                      {t(insight.noHighlightText)} <Text style={styles.insightHighlight}>{insight.highlight}</Text> {t(insight.message)}
                    </>
                  ) : (
                    <>
                      {t('dashboard.insight.thisMonth')} <Text style={styles.insightHighlight}>{insight.highlight}</Text> {t(insight.message)}
                    </>
                  )}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => goToAnalyticsScreen('AiAdvisor')}
                  style={({ pressed }) => [styles.insightAction, pressed && styles.insightActionPressed]}
                >
                  <Text style={styles.insightActionText}>{t('dashboard.aiAction')}</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.sectionWrap}>
              <Text style={[styles.sectionTitle, { color: mode === 'dark' ? '#F3F7FF' : '#1B2437' }]}>
                {t('dashboard.premiumSection')}
              </Text>
              <View style={styles.quickActionsRow}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => goToAnalyticsScreen('AiAdvisor')}
                  style={({ pressed }) => [
                    styles.quickTile,
                    {
                      backgroundColor: mode === 'dark' ? '#171A22' : '#FFFFFF',
                      borderColor: mode === 'dark' ? 'rgba(255,255,255,0.10)' : '#EEF2F8',
                    },
                    pressed && styles.quickTilePressed,
                  ]}
                >
                  <View style={[styles.quickIconWrap, { backgroundColor: mode === 'dark' ? '#293065' : '#EEF1FF' }]}>
                    <Text style={[styles.quickIcon, { color: '#5961E9' }]}>✦</Text>
                  </View>
                  <Text style={[styles.quickLabel, { color: mode === 'dark' ? '#C0CCDF' : '#4A556D' }]}>
                    {t('dashboard.aiAdvisor')}
                  </Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  onPress={() => goToAnalyticsScreen('WeeklyReport')}
                  style={({ pressed }) => [
                    styles.quickTile,
                    {
                      backgroundColor: mode === 'dark' ? '#171A22' : '#FFFFFF',
                      borderColor: mode === 'dark' ? 'rgba(255,255,255,0.10)' : '#EEF2F8',
                    },
                    pressed && styles.quickTilePressed,
                  ]}
                >
                  <View style={[styles.quickIconWrap, { backgroundColor: mode === 'dark' ? '#1C4A36' : '#EAF9F0' }]}>
                    <Text style={[styles.quickIcon, { color: '#17B26A' }]}>◔</Text>
                  </View>
                  <Text numberOfLines={2} style={[styles.quickLabel, { color: mode === 'dark' ? '#C0CCDF' : '#4A556D' }]}>
                    {t('dashboard.weeklyReport')}
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.sectionWrap}>
              <Text style={[styles.sectionTitle, { color: mode === 'dark' ? '#F3F7FF' : '#1B2437' }]}>{t('dashboard.quickActions')}</Text>
              <View style={styles.quickActionsRow}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => goToTransactionsScreen('ScanReceipt')}
                  style={({ pressed }) => [
                    styles.quickTile,
                    {
                      backgroundColor: mode === 'dark' ? '#171A22' : '#FFFFFF',
                      borderColor: mode === 'dark' ? 'rgba(255,255,255,0.10)' : '#EEF2F8',
                    },
                    pressed && styles.quickTilePressed,
                  ]}
                >
                  <View style={[styles.quickIconWrap, { backgroundColor: mode === 'dark' ? '#293065' : '#EEF1FF' }]}>
                    <Text style={[styles.quickIcon, { color: '#5961E9' }]}>▦</Text>
                  </View>
                  <Text numberOfLines={2} style={[styles.quickLabel, { color: mode === 'dark' ? '#C0CCDF' : '#4A556D' }]}>
                    {t('dashboard.scanReceipt')}
                  </Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  onPress={goToAddTab}
                  style={({ pressed }) => [
                    styles.quickTile,
                    {
                      backgroundColor: mode === 'dark' ? '#171A22' : '#FFFFFF',
                      borderColor: mode === 'dark' ? 'rgba(255,255,255,0.10)' : '#EEF2F8',
                    },
                    pressed && styles.quickTilePressed,
                  ]}
                >
                  <View style={[styles.quickIconWrap, { backgroundColor: mode === 'dark' ? '#1C4A36' : '#EAF9F0' }]}>
                    <Text style={[styles.quickIcon, { color: '#17B26A' }]}>+</Text>
                  </View>
                  <Text numberOfLines={2} style={[styles.quickLabel, { color: mode === 'dark' ? '#C0CCDF' : '#4A556D' }]}>
                    {t('dashboard.addIncome')}
                  </Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  onPress={goToAddTab}
                  style={({ pressed }) => [
                    styles.quickTile,
                    {
                      backgroundColor: mode === 'dark' ? '#171A22' : '#FFFFFF',
                      borderColor: mode === 'dark' ? 'rgba(255,255,255,0.10)' : '#EEF2F8',
                    },
                    pressed && styles.quickTilePressed,
                  ]}
                >
                  <View style={[styles.quickIconWrap, { backgroundColor: mode === 'dark' ? '#522635' : '#FEECEF' }]}>
                    <Text style={[styles.quickIcon, { color: '#F04438' }]}>-</Text>
                  </View>
                  <Text numberOfLines={2} style={[styles.quickLabel, { color: mode === 'dark' ? '#C0CCDF' : '#4A556D' }]}>
                    {t('dashboard.addExpense')}
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.sectionWrap}>
              <View style={styles.transactionsHeader}>
                <Text style={[styles.sectionTitle, { color: mode === 'dark' ? '#F3F7FF' : '#1B2437' }]}>
                  {t('dashboard.upcoming.title')}
                </Text>
                <Pressable onPress={() => goToTransactionsScreen('UpcomingPayments')}>
                  <Text style={[styles.actionText, { color: theme.colors.primary }]}>{t('dashboard.viewAll')}</Text>
                </Pressable>
              </View>

              {data.upcomingPaymentsDueSoon.length === 0 ? (
                <Card>
                  <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
                    {t('dashboard.upcoming.empty')}
                  </Text>
                </Card>
              ) : (
                data.upcomingPaymentsDueSoon.map((payment: DashboardUpcomingPayment) => (
                  <Pressable
                    key={payment.id}
                    accessibilityRole="button"
                    onPress={() =>
                      goToTransactionsScreen('UpcomingPaymentDetail', {
                        paymentId: payment.id,
                      })
                    }
                    style={({ pressed }) => [styles.upcomingRowPressable, pressed && styles.quickTilePressed]}
                  >
                    <View
                      style={[
                        styles.upcomingRow,
                        {
                          backgroundColor: mode === 'dark' ? '#171A22' : '#FFFFFF',
                          borderColor: mode === 'dark' ? 'rgba(255,255,255,0.10)' : '#EEF2F8',
                        },
                      ]}
                    >
                      <View style={styles.upcomingRowMeta}>
                        <Text numberOfLines={1} style={[styles.upcomingTitle, { color: theme.colors.text }]}>
                          {payment.title}
                        </Text>
                        <Text style={[styles.upcomingSubtitle, { color: theme.colors.textMuted }]}>
                          {t('dashboard.upcoming.dueValue', {
                            date: formatDueDateLabel(payment.dueDate, locale, t),
                          })}
                        </Text>
                      </View>
                      <Text style={[styles.upcomingAmount, { color: theme.colors.expense }]}>
                        {formatCurrency(payment.amount, payment.currency, locale)}
                      </Text>
                    </View>
                  </Pressable>
                ))
              )}
            </View>

            <View style={styles.transactionsHeader}>
              <Text style={[styles.sectionTitle, { color: mode === 'dark' ? '#F3F7FF' : '#1B2437' }]}>{t('dashboard.recentTransactions')}</Text>
              <Pressable onPress={() => goToTransactionsScreen('Transactions')}>
                <Text style={[styles.actionText, { color: theme.colors.primary }]}>{t('dashboard.viewAll')}</Text>
              </Pressable>
            </View>
          </View>
        }
        refreshControl={
          <RefreshControl
            onRefresh={() => {
              void dashboardQuery.refetch();
            }}
            refreshing={dashboardQuery.isRefetching}
            tintColor={theme.colors.primary}
          />
        }
        removeClippedSubviews
        renderItem={renderTransaction}
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
  loadingStateWrap: {
    gap: spacing.sm,
  },
  loadingStateText: {
    ...typography.body,
    textAlign: 'center',
  },
  listContent: {
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  headerWrap: {
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  profileRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minWidth: 0,
  },
  topRowRight: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  brandMark: {
    opacity: 0.92,
  },
  avatar: {
    alignItems: 'center',
    borderRadius: radius.full,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  avatarText: {
    ...typography.caption,
    fontWeight: '700',
  },
  greetingText: {
    ...typography.caption,
    fontSize: 11,
  },
  profileName: {
    ...typography.subheading,
    fontSize: 17,
    lineHeight: 22,
    maxWidth: 180,
  },
  statusPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radius.full,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    maxWidth: 120,
  },
  statusDot: {
    backgroundColor: '#22C55E',
    borderRadius: radius.full,
    height: 7,
    width: 7,
  },
  statusLabel: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  balanceCard: {
    backgroundColor: '#2F6BFF',
    borderRadius: radius.lg,
    minHeight: 124,
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  balanceLabel: {
    ...typography.body,
    color: '#DCE6FF',
    fontSize: 14,
    fontWeight: '500',
  },
  balanceAmount: {
    ...typography.amount,
    color: '#FFFFFF',
    fontSize: 43,
    fontWeight: '800',
    lineHeight: 52,
    marginTop: 2,
  },
  balanceTrendPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: radius.sm,
    flexDirection: 'row',
    gap: spacing.xxs,
    marginTop: spacing.xs,
    maxWidth: '100%',
    paddingHorizontal: spacing.xs,
    paddingVertical: 5,
  },
  balanceTrendArrow: {
    ...typography.caption,
    color: '#E7EEFF',
    fontSize: 10,
    fontWeight: '700',
  },
  balanceTrendText: {
    ...typography.caption,
    color: '#E7EEFF',
    fontSize: 11,
    flexShrink: 1,
  },
  statRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    minWidth: 130,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  statLabel: {
    ...typography.caption,
    fontSize: 12,
  },
  statValue: {
    ...typography.subheading,
    fontSize: 33,
    lineHeight: 38,
    marginTop: 2,
  },
  statBars: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: spacing.xxs,
    height: 44,
    marginTop: spacing.sm,
    paddingHorizontal: 2,
  },
  statBar: {
    borderRadius: radius.sm,
    flex: 1,
    minWidth: 12,
  },
  sectionWrap: {
    gap: spacing.sm,
  },
  sectionHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    ...typography.subheading,
    fontSize: 20,
    fontWeight: '700',
    flexShrink: 1,
  },
  accountsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  accountCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    minWidth: 132,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    width: '48%',
  },
  accountName: {
    ...typography.body,
    fontSize: 14,
    fontWeight: '700',
  },
  accountMeta: {
    ...typography.caption,
    fontSize: 11,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  accountAmount: {
    ...typography.subheading,
    fontSize: 16,
    marginTop: spacing.xs,
  },
  insightCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  insightIconBox: {
    alignItems: 'center',
    backgroundColor: '#2F6BFF',
    borderRadius: radius.sm,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  insightIcon: {
    ...typography.subheading,
    color: '#FFFFFF',
    fontSize: 18,
  },
  insightContent: {
    flex: 1,
    gap: spacing.xxs,
  },
  insightTitle: {
    ...typography.subheading,
    fontSize: 18,
    fontWeight: '700',
  },
  insightText: {
    ...typography.body,
    fontSize: 16,
    lineHeight: 24,
  },
  insightHighlight: {
    color: '#18B86A',
    fontWeight: '700',
  },
  insightAction: {
    alignSelf: 'flex-start',
    backgroundColor: '#2F6BFF',
    borderRadius: radius.sm,
    marginTop: spacing.sm,
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  insightActionPressed: {
    opacity: 0.86,
  },
  insightActionText: {
    ...typography.caption,
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  quickTile: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    gap: spacing.xs,
    minHeight: 86,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
  },
  quickTilePressed: {
    opacity: 0.86,
  },
  quickIconWrap: {
    alignItems: 'center',
    borderRadius: radius.full,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  quickIcon: {
    ...typography.caption,
    fontSize: 14,
    fontWeight: '700',
  },
  quickLabel: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.15,
    textAlign: 'center',
  },
  transactionsHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  upcomingRowPressable: {
    borderRadius: radius.md,
  },
  upcomingRow: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  upcomingRowMeta: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  upcomingTitle: {
    ...typography.subheading,
    fontSize: 15,
    fontWeight: '700',
  },
  upcomingSubtitle: {
    ...typography.caption,
    fontSize: 12,
  },
  upcomingAmount: {
    ...typography.subheading,
    fontSize: 15,
    fontWeight: '700',
  },
  actionText: {
    ...typography.caption,
    fontWeight: '700',
  },
  transactionSeparator: {
    height: spacing.sm,
  },
  transactionCard: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  transactionIconWrap: {
    alignItems: 'center',
    borderRadius: radius.sm,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  transactionIcon: {
    ...typography.caption,
    fontWeight: '800',
  },
  transactionMeta: {
    flex: 1,
    gap: 2,
  },
  transactionTitle: {
    ...typography.subheading,
    fontSize: 17,
    fontWeight: '700',
  },
  transactionSubtitle: {
    ...typography.caption,
    fontSize: 11,
  },
  transactionAmount: {
    ...typography.subheading,
    fontSize: 24,
    fontWeight: '700',
  },
  skeletonWrap: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  skeletonHeader: {
    borderRadius: radius.md,
    height: 36,
    width: '70%',
  },
  skeletonHero: {
    borderRadius: radius.lg,
    height: 140,
    width: '100%',
  },
  skeletonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  skeletonStat: {
    borderRadius: radius.md,
    flex: 1,
    height: 120,
  },
  skeletonInsight: {
    borderRadius: radius.md,
    height: 120,
    width: '100%',
  },
  skeletonQuick: {
    borderRadius: radius.md,
    flex: 1,
    height: 82,
  },
  skeletonTx: {
    borderRadius: radius.md,
    height: 72,
    width: '100%',
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
