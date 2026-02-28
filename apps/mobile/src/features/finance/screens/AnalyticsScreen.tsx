import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { CategoryType, Transaction } from '@mintly/shared';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@app/providers/AuthProvider';
import { apiClient } from '@core/api/client';
import { financeQueryKeys } from '@core/api/queryKeys';
import { AdBanner } from '@core/ads/AdBanner';
import type { RootTabParamList } from '@core/navigation/types';
import { getCategoryLabel } from '@features/finance/categories/categoryCatalog';
import {
  AppIcon,
  Card,
  PrimaryButton,
  ScreenContainer,
  Section,
  StatCard,
} from '@shared/ui';
import { useI18n } from '@shared/i18n';
import { radius, spacing, typography, useTheme } from '@shared/theme';
import { apiErrorText } from '@shared/utils/apiErrorText';
import { getCurrentMonthString, shiftMonth } from '@shared/utils/month';

// stitch asset: stitch/export/stitch_ana_ekran_dashboard/harcama_analizi_(koyu_mod)_2/screen.png
// no touch/keyboard behavior changed by this PR.

type TrendRangeKey = '7d' | '30d' | '90d';

interface TrendRangeOption {
  key: TrendRangeKey;
  days: number;
  labelKey: string;
}

interface TrendRangeBounds {
  start: Date;
  end: Date;
  fromIso: string;
  toIso: string;
}

interface TrendBucket {
  key: string;
  label: string;
  income: number;
  expense: number;
  total: number;
}

const TREND_RANGE_OPTIONS: TrendRangeOption[] = [
  { key: '7d', days: 7, labelKey: 'analytics.trend.range.7d' },
  { key: '30d', days: 30, labelKey: 'analytics.trend.range.30d' },
  { key: '90d', days: 90, labelKey: 'analytics.trend.range.90d' },
];

const CATEGORY_ICONS: Array<Parameters<typeof AppIcon>[0]['name']> = [
  'restaurant-outline',
  'car-outline',
  'home-outline',
  'cart-outline',
  'wallet-outline',
  'pulse-outline',
];

function formatMoney(amount: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function parseMonthParts(month: string): { year: number; monthIndex: number } {
  const [yearRaw, monthRaw] = month.split('-');
  return {
    year: Number(yearRaw),
    monthIndex: Number(monthRaw) - 1,
  };
}

function formatMonthLabel(month: string, locale: string): string {
  const { year, monthIndex } = parseMonthParts(month);
  const date = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));

  return date.toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function startOfUtcDay(value: Date): Date {
  return new Date(
    Date.UTC(
      value.getUTCFullYear(),
      value.getUTCMonth(),
      value.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  );
}

function endOfUtcDay(value: Date): Date {
  return new Date(
    Date.UTC(
      value.getUTCFullYear(),
      value.getUTCMonth(),
      value.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
}

function addUtcDays(value: Date, delta: number): Date {
  const moved = new Date(value);
  moved.setUTCDate(moved.getUTCDate() + delta);
  return moved;
}

function getTrendRangeBounds(days: number): TrendRangeBounds {
  const now = new Date();
  const end = endOfUtcDay(now);
  const start = startOfUtcDay(addUtcDays(end, -(days - 1)));

  return {
    start,
    end,
    fromIso: start.toISOString(),
    toIso: end.toISOString(),
  };
}

function getDayDiff(start: Date, end: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((end.getTime() - start.getTime()) / msPerDay);
}

function buildTrendBuckets(
  transactions: Transaction[],
  range: TrendRangeBounds,
  days: number,
  locale: string,
): TrendBucket[] {
  const bucketCount = days === 7 ? 7 : 10;
  const bucketSpan = days === 7 ? 1 : Math.ceil(days / bucketCount);

  const buckets: TrendBucket[] = Array.from({ length: bucketCount }, (_, index) => {
    const bucketStart = addUtcDays(range.start, index * bucketSpan);
    const bucketEnd =
      index === bucketCount - 1 ? range.end : endOfUtcDay(addUtcDays(bucketStart, bucketSpan - 1));

    const label =
      days === 7
        ? bucketStart.toLocaleDateString(locale, { weekday: 'short', timeZone: 'UTC' })
        : bucketStart.toLocaleDateString(locale, {
            day: 'numeric',
            month: 'short',
            timeZone: 'UTC',
          });

    return {
      key: `${bucketStart.toISOString()}-${bucketEnd.toISOString()}`,
      label,
      income: 0,
      expense: 0,
      total: 0,
    };
  });

  for (const transaction of transactions) {
    if (transaction.kind !== 'normal') {
      continue;
    }

    const occurredAt = new Date(transaction.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) {
      continue;
    }

    if (occurredAt < range.start || occurredAt > range.end) {
      continue;
    }

    const dayIndex = getDayDiff(range.start, startOfUtcDay(occurredAt));
    const bucketIndex = Math.min(Math.floor(dayIndex / bucketSpan), buckets.length - 1);
    const bucket = buckets[bucketIndex];

    if (transaction.type === 'income') {
      bucket.income += transaction.amount;
    } else {
      bucket.expense += transaction.amount;
    }

    bucket.total += transaction.amount;
  }

  return buckets;
}

function getMaxTrendValue(buckets: TrendBucket[]): number {
  const max = buckets.reduce((acc, bucket) => Math.max(acc, bucket.income, bucket.expense), 0);
  return max > 0 ? max : 1;
}

function clampPercent(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, value));
}

function resolveAnalyticsCategoryLabel(
  params: {
    categoryKey?: string | null;
    fallbackName?: string | null;
  },
  locale: string,
  uncategorizedLabel: string,
): string {
  if (params.categoryKey) {
    return getCategoryLabel(params.categoryKey, locale) || uncategorizedLabel;
  }

  const fallbackName = params.fallbackName?.trim();
  if (!fallbackName || fallbackName === 'uncategorized') {
    return uncategorizedLabel;
  }

  return fallbackName;
}

function LoadingSkeleton({ dark }: { dark: boolean }) {
  const block = dark ? '#181C2A' : '#E8EEF9';

  return (
    <View style={styles.skeletonWrap}>
      <View style={[styles.skeletonHeader, { backgroundColor: block }]} />
      <View style={[styles.skeletonMonth, { backgroundColor: block }]} />
      <View style={[styles.skeletonSection, { backgroundColor: block }]} />
      <View style={[styles.skeletonSection, { backgroundColor: block }]} />
      <View style={[styles.skeletonSection, { backgroundColor: block }]} />
    </View>
  );
}

export function AnalyticsScreen() {
  const navigation = useNavigation<any>();
  const { withAuth, user, isGuest, ensureSignedIn } = useAuth();
  const { theme, mode } = useTheme();
  const { locale, t } = useI18n();

  const [month, setMonth] = useState(getCurrentMonthString());
  const [categoryType, setCategoryType] = useState<CategoryType>('expense');
  const [trendRange, setTrendRange] = useState<TrendRangeKey>('30d');

  const trendOption = useMemo(
    () => TREND_RANGE_OPTIONS.find((item) => item.key === trendRange) ?? TREND_RANGE_OPTIONS[1],
    [trendRange],
  );

  const trendBounds = useMemo(() => getTrendRangeBounds(trendOption.days), [trendOption.days]);

  const summaryQuery = useQuery({
    queryKey: financeQueryKeys.analytics.summary(month),
    queryFn: () => withAuth((token) => apiClient.getAnalyticsSummary({ month }, token)),
    enabled: !isGuest,
  });

  const byCategoryQuery = useQuery({
    queryKey: financeQueryKeys.analytics.byCategory(month, categoryType),
    queryFn: () => withAuth((token) => apiClient.getAnalyticsByCategory({ month, type: categoryType }, token)),
    enabled: !isGuest,
  });

  const trendTransactionsQuery = useQuery({
    queryKey: ['analytics', 'trend-transactions', trendRange, trendBounds.fromIso, trendBounds.toIso],
    queryFn: () =>
      withAuth(async (token) => {
        const all: Transaction[] = [];
        const limit = 100;
        let page = 1;
        let totalPages = 1;

        do {
          const response = await apiClient.listTransactions(
            {
              from: trendBounds.fromIso,
              to: trendBounds.toIso,
              page,
              limit,
            },
            token,
          );

          all.push(...response.transactions);
          totalPages = response.pagination.totalPages;
          page += 1;
        } while (page <= totalPages && page <= 12);

        return all;
      }),
    enabled: !isGuest,
  });

  const openAddTransaction = useCallback(() => {
    void (async () => {
      if (!(await ensureSignedIn())) {
        return;
      }

      const parent = navigation.getParent?.();
      if (parent && 'navigate' in parent) {
        (parent as {
          navigate: (name: keyof RootTabParamList, params?: RootTabParamList['AddTab']) => void;
        }).navigate('AddTab', { screen: 'AddTransaction' });
      }
    })();
  }, [ensureSignedIn, navigation]);

  const openAiAdvisor = useCallback(() => {
    navigation.navigate('AiAdvisor');
  }, [navigation]);

  const openWeeklyReport = useCallback(() => {
    navigation.navigate('WeeklyReport');
  }, [navigation]);

  const dark = mode === 'dark';

  if (summaryQuery.isLoading && !summaryQuery.data) {
    return (
      <ScreenContainer scrollable={false} dark={dark} contentStyle={styles.containerContent}>
        <View style={styles.loadingStateWrap}>
          <LoadingSkeleton dark={dark} />
          <Text style={[styles.loadingStateText, { color: theme.colors.textMuted }]}>
            {t('common.loadingShort')}
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  if (summaryQuery.isError && !summaryQuery.data) {
    return (
      <ScreenContainer dark={dark}>
        <Card dark={dark} style={styles.stateCard}>
          <AppIcon name="alert-circle-outline" size="lg" tone="expense" />
          <Text style={[styles.errorTitle, { color: theme.colors.text }]}>{t('analytics.state.errorTitle')}</Text>
          <Text style={[styles.errorText, { color: theme.colors.expense }]}>{apiErrorText(summaryQuery.error)}</Text>
          <PrimaryButton label={t('common.retry')} iconName="refresh" onPress={() => void summaryQuery.refetch()} />
        </Card>
      </ScreenContainer>
    );
  }

  const summary = summaryQuery.data;
  if (!summary) {
    return (
      <ScreenContainer dark={dark}>
        <Card dark={dark} style={styles.stateCard}>
          <AppIcon name="analytics-outline" size="lg" tone="muted" />
          <Text style={[styles.errorText, { color: theme.colors.textMuted }]}>{t('analytics.state.noData')}</Text>
          <PrimaryButton
            label={isGuest ? t('auth.links.signIn') : t('common.retry')}
            iconName={isGuest ? 'log-in-outline' : 'refresh'}
            onPress={() => {
              if (isGuest) {
                void ensureSignedIn();
                return;
              }

              void summaryQuery.refetch();
            }}
          />
        </Card>
      </ScreenContainer>
    );
  }

  if (summary.transactionCount === 0) {
    return (
      <ScreenContainer dark={dark}>
        <Card dark={dark} style={styles.emptyStateCard}>
          <AppIcon name="analytics-outline" size="xl" tone="primary" />
          <Text style={[styles.emptyStateTitle, { color: theme.colors.text }]}>{t('analytics.state.emptyTitle')}</Text>
          <Text style={[styles.emptyStateBody, { color: theme.colors.textMuted }]}>{t('analytics.state.emptyBody')}</Text>
          <PrimaryButton label={t('analytics.state.emptyCta')} iconName="add-circle-outline" onPress={openAddTransaction} />
        </Card>
      </ScreenContainer>
    );
  }

  const currency = summary.currency ?? user?.baseCurrency ?? 'TRY';
  const topCategoryOverall = summary.topCategories[0];
  const uncategorizedLabel = t('transactions.row.uncategorized');

  const categoryItems = byCategoryQuery.data?.categories ?? [];
  const categoryTotal = Math.max(
    1,
    categoryItems.reduce((accumulator, item) => accumulator + item.total, 0),
  );

  const trendBuckets = buildTrendBuckets(
    trendTransactionsQuery.data ?? [],
    trendBounds,
    trendOption.days,
    locale,
  );

  const trendMax = getMaxTrendValue(trendBuckets);
  const trendIncomeTotal = trendBuckets.reduce((accumulator, item) => accumulator + item.income, 0);
  const trendExpenseTotal = trendBuckets.reduce((accumulator, item) => accumulator + item.expense, 0);

  const topCategoryShare = topCategoryOverall ? clampPercent(topCategoryOverall.percent) : 0;
  const netTone = summary.netTotal >= 0 ? 'income' : 'expense';

  const panelBorder = dark ? '#232A42' : '#DDE5F3';

  return (
    <ScreenContainer dark={dark}>
      <View style={styles.contentWrap}>
        <View style={styles.monthHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.goBack')}
            onPress={() => setMonth(shiftMonth(month, -1))}
            style={styles.monthArrowButton}
          >
            <AppIcon name="chevron-back" size="sm" tone="text" />
          </Pressable>

          <Text style={[styles.monthLabel, { color: theme.colors.text }]}>
            {formatMonthLabel(month, locale)}
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.continue')}
            onPress={() => setMonth(shiftMonth(month, 1))}
            style={styles.monthArrowButton}
          >
            <AppIcon name="chevron-forward" size="sm" tone="text" />
          </Pressable>
        </View>

        <Section
          dark={dark}
          title={t('analytics.summary.title')}
          subtitle={t('analytics.summary.subtitle')}
        >
          <View style={styles.summaryGridRow}>
            <StatCard
              dark={dark}
              detail={formatMoney(summary.incomeTotal, currency, locale)}
              iconName="trending-up-outline"
              iconTone="income"
              label={t('analytics.summary.totalIncome')}
              tone="income"
              value={formatMoney(summary.incomeTotal, currency, locale)}
            />
            <StatCard
              dark={dark}
              detail={formatMoney(summary.expenseTotal, currency, locale)}
              iconName="trending-down-outline"
              iconTone="expense"
              label={t('analytics.summary.totalExpense')}
              tone="expense"
              value={formatMoney(summary.expenseTotal, currency, locale)}
            />
          </View>

          <View style={styles.summaryGridRow}>
            <StatCard
              dark={dark}
              detail={t('analytics.transactionsCount', { count: summary.transactionCount })}
              iconName="stats-chart-outline"
              iconTone={netTone === 'income' ? 'income' : 'expense'}
              label={t('analytics.summary.net')}
              tone={netTone}
              value={formatMoney(summary.netTotal, currency, locale)}
            />
            <StatCard
              dark={dark}
              detail={
                topCategoryOverall
                  ? t('analytics.summary.share', { percent: topCategoryShare.toFixed(0) })
                  : t('analytics.summary.topCategoryFallback')
              }
              iconName="ribbon-outline"
              iconTone="primary"
              label={t('analytics.summary.topCategory')}
              tone="primary"
              value={
                topCategoryOverall
                  ? resolveAnalyticsCategoryLabel(
                      {
                        categoryKey: topCategoryOverall.categoryKey ?? topCategoryOverall.categoryId ?? null,
                        fallbackName: topCategoryOverall.name,
                      },
                      locale,
                      uncategorizedLabel,
                    )
                  : t('analytics.noCategory')
              }
            />
          </View>
        </Section>

        <Section
          dark={dark}
          title={t('analytics.aiSection.title')}
          subtitle={t('analytics.aiSection.subtitle')}
        >
          <View style={styles.aiEntryRow}>
            <Pressable
              accessibilityRole="button"
              onPress={openAiAdvisor}
              style={[
                styles.aiEntryCard,
                {
                  backgroundColor: dark ? '#141B2B' : '#F8FAFF',
                  borderColor: panelBorder,
                },
              ]}
            >
              <View style={[styles.aiIconWrap, { backgroundColor: dark ? '#2D3D76' : '#E9EFFF' }]}>
                <AppIcon name="sparkles-outline" size="md" tone="primary" />
              </View>
              <View style={styles.aiEntryBody}>
                <Text style={[styles.aiEntryTitle, { color: theme.colors.text }]}>
                  {t('analytics.aiAdvisor')}
                </Text>
                <Text style={[styles.aiEntrySubtitle, { color: theme.colors.textMuted }]}>
                  {t('analytics.aiAdvisorSubtitle')}
                </Text>
                <Text style={[styles.aiEntryCta, { color: theme.colors.primary }]}>
                  {t('analytics.aiAdvisorCta')}
                </Text>
              </View>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={openWeeklyReport}
              style={[
                styles.aiEntryCard,
                {
                  backgroundColor: dark ? '#141B2B' : '#F8FAFF',
                  borderColor: panelBorder,
                },
              ]}
            >
              <View style={[styles.aiIconWrap, { backgroundColor: dark ? '#1D4938' : '#E7F8EF' }]}>
                <AppIcon name="stats-chart-outline" size="md" tone="income" />
              </View>
              <View style={styles.aiEntryBody}>
                <Text style={[styles.aiEntryTitle, { color: theme.colors.text }]}>
                  {t('analytics.weeklyReport')}
                </Text>
                <Text style={[styles.aiEntrySubtitle, { color: theme.colors.textMuted }]}>
                  {t('analytics.weeklyReportSubtitle')}
                </Text>
                <Text style={[styles.aiEntryCta, { color: theme.colors.primary }]}>
                  {t('analytics.weeklyReportCta')}
                </Text>
              </View>
            </Pressable>
          </View>
        </Section>

        <AdBanner style={styles.adBanner} />

        <Section dark={dark} title={t('analytics.trend.title')} subtitle={t('analytics.trend.subtitle', { days: trendOption.days })}>
          <View style={styles.rangeChipRow}>
            {TREND_RANGE_OPTIONS.map((option) => {
              const active = option.key === trendRange;
              return (
                <Pressable
                  key={option.key}
                  accessibilityRole="button"
                  onPress={() => setTrendRange(option.key)}
                  style={[
                    styles.rangeChip,
                    {
                      backgroundColor: active
                        ? theme.colors.primary
                        : dark
                          ? 'rgba(255,255,255,0.07)'
                          : '#EEF2FA',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.rangeChipText,
                      { color: active ? '#FFFFFF' : theme.colors.textMuted },
                    ]}
                  >
                    {t(option.labelKey)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Card dark={dark} style={[styles.trendCard, { borderColor: panelBorder }]}>
            {trendTransactionsQuery.isLoading && !trendTransactionsQuery.data ? (
              <View style={styles.inlineLoadingWrap}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <Text style={[styles.inlineLoadingText, { color: theme.colors.textMuted }]}>
                  {t('common.loadingShort')}
                </Text>
              </View>
            ) : null}

            {trendTransactionsQuery.isError ? (
              <Text style={[styles.errorText, { color: theme.colors.expense }]}>{apiErrorText(trendTransactionsQuery.error)}</Text>
            ) : null}

            {!trendTransactionsQuery.isLoading && !trendTransactionsQuery.isError ? (
              <>
                <View style={styles.barBoard}>
                  {trendBuckets.map((bucket) => {
                    const incomeHeight = Math.max(6, Math.round((bucket.income / trendMax) * 110));
                    const expenseHeight = Math.max(6, Math.round((bucket.expense / trendMax) * 110));

                    return (
                      <View key={bucket.key} style={styles.barGroup}>
                        <View style={styles.barPair}>
                          <View style={[styles.bar, { height: incomeHeight, backgroundColor: theme.colors.income }]} />
                          <View style={[styles.bar, { height: expenseHeight, backgroundColor: theme.colors.expense }]} />
                        </View>
                        <Text numberOfLines={1} style={[styles.barLabel, { color: theme.colors.textMuted }]}>
                          {bucket.label}
                        </Text>
                      </View>
                    );
                  })}
                </View>

                <View style={styles.legendRow}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: theme.colors.income }]} />
                    <Text style={[styles.legendText, { color: theme.colors.textMuted }]}>{t('analytics.trend.legendIncome')}</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: theme.colors.expense }]} />
                    <Text style={[styles.legendText, { color: theme.colors.textMuted }]}>{t('analytics.trend.legendExpense')}</Text>
                  </View>
                </View>

                <View style={styles.trendTotalsRow}>
                  <Text style={[styles.trendTotalText, { color: theme.colors.income }]}>
                    {t('analytics.trend.totalIncome', {
                      amount: formatMoney(trendIncomeTotal, currency, locale),
                    })}
                  </Text>
                  <Text style={[styles.trendTotalText, { color: theme.colors.expense }]}>
                    {t('analytics.trend.totalExpense', {
                      amount: formatMoney(trendExpenseTotal, currency, locale),
                    })}
                  </Text>
                </View>
              </>
            ) : null}
          </Card>
        </Section>

        <Section
          dark={dark}
          title={t('analytics.categories.title')}
          subtitle={t('analytics.categories.subtitle')}
          actionLabel={categoryType === 'expense' ? t('analytics.expense') : t('analytics.income')}
          onActionPress={() => setCategoryType((current) => (current === 'expense' ? 'income' : 'expense'))}
        >
          <Card dark={dark} style={[styles.categoryContainerCard, { borderColor: panelBorder }]}>
            <View style={styles.donutWrap}>
              <View style={[styles.donutRing, { borderColor: dark ? '#2A3350' : '#DDE6F7' }]} />
              <View
                style={[
                  styles.donutAccent,
                  {
                    borderColor: categoryType === 'expense' ? theme.colors.expense : theme.colors.income,
                  },
                ]}
              />
              <View
                style={[
                  styles.donutCenter,
                  {
                    backgroundColor: dark ? '#0F1524' : '#F8FAFF',
                    borderColor: panelBorder,
                  },
                ]}
              >
                <AppIcon name="pie-chart-outline" size="sm" tone="primary" />
                <Text style={[styles.donutCenterLabel, { color: theme.colors.textMuted }]}>
                  {t('analytics.summary.topCategory')}
                </Text>
                <Text numberOfLines={2} style={[styles.donutCenterValue, { color: theme.colors.text }]}>
                  {categoryItems[0]
                    ? resolveAnalyticsCategoryLabel(
                        {
                          categoryKey: categoryItems[0].categoryKey ?? categoryItems[0].categoryId ?? null,
                          fallbackName: categoryItems[0].name,
                        },
                        locale,
                        uncategorizedLabel,
                      )
                    : t('analytics.noCategory')}
                </Text>
              </View>
            </View>

            {byCategoryQuery.isLoading && !byCategoryQuery.data ? (
              <View style={styles.inlineLoadingWrap}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <Text style={[styles.inlineLoadingText, { color: theme.colors.textMuted }]}>
                  {t('analytics.loadingCategories')}
                </Text>
              </View>
            ) : null}

            {byCategoryQuery.isError ? (
              <Text style={[styles.errorText, { color: theme.colors.expense }]}>{apiErrorText(byCategoryQuery.error)}</Text>
            ) : null}

            {!byCategoryQuery.isLoading && !byCategoryQuery.isError && categoryItems.length === 0 ? (
              <View style={styles.emptyCategoriesWrap}>
                <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>{t('analytics.categories.empty')}</Text>
                <PrimaryButton label={t('analytics.state.emptyCta')} iconName="add-circle-outline" onPress={openAddTransaction} />
              </View>
            ) : null}

            {categoryItems.slice(0, 6).map((item, index) => {
              const sharePercent = clampPercent((item.total / categoryTotal) * 100);

              return (
                <View
                  key={item.categoryKey ?? item.categoryId ?? `category-${index}`}
                  style={[
                    styles.categoryRow,
                    {
                      borderColor: panelBorder,
                      backgroundColor: dark ? '#12192C' : '#F8FAFF',
                    },
                  ]}
                >
                  <View style={styles.categoryLeft}>
                    <View
                      style={[
                        styles.categoryIconWrap,
                        {
                          backgroundColor:
                            categoryType === 'expense'
                              ? 'rgba(240,68,56,0.15)'
                              : 'rgba(23,178,106,0.15)',
                        },
                      ]}
                    >
                      <AppIcon
                        name={CATEGORY_ICONS[index % CATEGORY_ICONS.length]}
                        size="sm"
                        tone={categoryType === 'expense' ? 'expense' : 'income'}
                      />
                    </View>

                    <View style={styles.categoryTextWrap}>
                      <Text numberOfLines={1} style={[styles.categoryName, { color: theme.colors.text }]}>
                        {resolveAnalyticsCategoryLabel(
                          {
                            categoryKey: item.categoryKey ?? item.categoryId ?? null,
                            fallbackName: item.name,
                          },
                          locale,
                          uncategorizedLabel,
                        )}
                      </Text>
                      <Text numberOfLines={1} style={[styles.categoryMeta, { color: theme.colors.textMuted }]}> 
                        {t('analytics.transactionsCount', { count: item.count })}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.categoryRight}>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.categoryAmount,
                        {
                          color: categoryType === 'expense' ? theme.colors.expense : theme.colors.income,
                        },
                      ]}
                    >
                      {formatMoney(item.total, currency, locale)}
                    </Text>
                    <Text style={[styles.categoryMeta, { color: theme.colors.textMuted }]}> 
                      {t('analytics.percentOfTotal', { percent: sharePercent.toFixed(0) })}
                    </Text>
                  </View>
                </View>
              );
            })}
          </Card>
        </Section>
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
  contentWrap: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  adBanner: {
    marginVertical: spacing.xs,
  },
  monthHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  monthArrowButton: {
    alignItems: 'center',
    borderRadius: radius.full,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  monthLabel: {
    ...typography.subheading,
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    textTransform: 'capitalize',
  },
  summaryGridRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  aiEntryRow: {
    gap: spacing.sm,
  },
  aiEntryCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 96,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  aiIconWrap: {
    alignItems: 'center',
    borderRadius: radius.md,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  aiEntryBody: {
    flex: 1,
    gap: spacing.xxs,
  },
  aiEntryTitle: {
    ...typography.subheading,
    fontSize: 15,
  },
  aiEntrySubtitle: {
    ...typography.caption,
    lineHeight: 18,
  },
  aiEntryCta: {
    ...typography.caption,
    fontWeight: '700',
    marginTop: spacing.xxs,
  },
  rangeChipRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  rangeChip: {
    borderRadius: radius.full,
    minHeight: 32,
    minWidth: 64,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
  },
  rangeChipText: {
    ...typography.caption,
    fontWeight: '700',
    textAlign: 'center',
  },
  trendCard: {
    gap: spacing.sm,
  },
  barBoard: {
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 150,
  },
  barGroup: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
  },
  barPair: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 2,
    height: 116,
  },
  bar: {
    borderRadius: radius.sm,
    minHeight: 6,
    width: 8,
  },
  barLabel: {
    ...typography.caption,
    fontSize: 10,
    marginTop: spacing.xxs,
  },
  legendRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  legendItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xxs,
  },
  legendDot: {
    borderRadius: radius.full,
    height: 8,
    width: 8,
  },
  legendText: {
    ...typography.caption,
  },
  trendTotalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  trendTotalText: {
    ...typography.caption,
    fontWeight: '700',
  },
  categoryContainerCard: {
    gap: spacing.sm,
  },
  donutWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
    minHeight: 150,
  },
  donutRing: {
    borderRadius: radius.full,
    borderWidth: 12,
    height: 150,
    width: 150,
  },
  donutAccent: {
    borderColor: 'transparent',
    borderRadius: radius.full,
    borderTopColor: '#000000',
    borderRightColor: '#000000',
    borderWidth: 12,
    height: 150,
    position: 'absolute',
    transform: [{ rotate: '35deg' }],
    width: 150,
  },
  donutCenter: {
    alignItems: 'center',
    borderRadius: radius.full,
    borderWidth: 1,
    gap: 2,
    height: 106,
    justifyContent: 'center',
    position: 'absolute',
    width: 106,
  },
  donutCenterLabel: {
    ...typography.caption,
    fontSize: 10,
  },
  donutCenterValue: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  categoryRow: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  categoryLeft: {
    alignItems: 'center',
    flexDirection: 'row',
    flex: 1,
    gap: spacing.sm,
    minWidth: 0,
  },
  categoryIconWrap: {
    alignItems: 'center',
    borderRadius: radius.md,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  categoryTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  categoryName: {
    ...typography.body,
    fontWeight: '700',
  },
  categoryMeta: {
    ...typography.caption,
    fontSize: 11,
  },
  categoryRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  categoryAmount: {
    ...typography.subheading,
    fontWeight: '700',
  },
  emptyCategoriesWrap: {
    gap: spacing.sm,
  },
  emptyText: {
    ...typography.body,
  },
  inlineLoadingWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  inlineLoadingText: {
    ...typography.caption,
  },
  loadingStateWrap: {
    gap: spacing.sm,
  },
  loadingStateText: {
    ...typography.body,
    textAlign: 'center',
  },
  skeletonWrap: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  skeletonHeader: {
    borderRadius: radius.md,
    height: 36,
    width: '62%',
  },
  skeletonMonth: {
    borderRadius: radius.md,
    height: 34,
    width: '44%',
  },
  skeletonSection: {
    borderRadius: radius.lg,
    height: 180,
    width: '100%',
  },
  stateCard: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  errorTitle: {
    ...typography.subheading,
  },
  errorText: {
    ...typography.body,
  },
  emptyStateCard: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  emptyStateTitle: {
    ...typography.heading,
    fontSize: 20,
    textAlign: 'center',
  },
  emptyStateBody: {
    ...typography.body,
    textAlign: 'center',
  },
});
