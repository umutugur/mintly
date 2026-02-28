import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { AdvisorBudgetStatus } from '@mintly/shared';

import { useAuth } from '@app/providers/AuthProvider';
import { getAdvisorUsageDayKey, hasUsedDailyAdvisorFreeUsage } from '@core/ads/RewardedManager';
import { apiClient } from '@core/api/client';
import { mobileEnv } from '@core/config/env';
import { financeQueryKeys } from '@core/api/queryKeys';
import { useAdvisorInsights } from '@features/advisor/hooks/useAdvisorInsights';
import { useAdvisorInsightRegenerateWithRewarded } from '@features/advisor/hooks/useAdvisorInsightRegenerateWithRewarded';
import { logAdvisorReq, useAdvisorDebugEvents } from '@features/advisor/utils/advisorDiagnostics';
import { useI18n } from '@shared/i18n';
import { AppIcon, Card, Chip, PrimaryButton, ScreenContainer, Section, StatCard, TextField, showAlert } from '@shared/ui';
import { radius, spacing, typography, useTheme } from '@shared/theme';
import { apiErrorText } from '@shared/utils/apiErrorText';
import { normalizeApiErrorForUi } from '@shared/utils/normalizeApiError';
import { getCurrentMonthString, shiftMonth } from '@shared/utils/month';

type AdvisorTab = 'summary' | 'savings' | 'investment' | 'tips';
type OverviewCardTone = 'income' | 'expense' | 'primary' | 'neutral';
type AdvisorActionModal = 'budget' | 'recurring' | 'transfer' | null;

interface OverviewCardItem {
  key: string;
  label: string;
  value: string;
  tone: OverviewCardTone;
}

const TAB_OPTIONS: Array<{ key: AdvisorTab; labelKey: string }> = [
  { key: 'summary', labelKey: 'aiAdvisor.tabs.summary' },
  { key: 'savings', labelKey: 'aiAdvisor.tabs.savings' },
  { key: 'investment', labelKey: 'aiAdvisor.tabs.investment' },
  { key: 'tips', labelKey: 'aiAdvisor.tabs.tips' },
];

const BUDGET_STATUS_LABEL_KEY: Record<AdvisorBudgetStatus, string> = {
  on_track: 'aiAdvisor.budget.status.onTrack',
  near_limit: 'aiAdvisor.budget.status.nearLimit',
  over_limit: 'aiAdvisor.budget.status.overLimit',
};

const FALLBACK_REASON_TRANSLATION_KEYS: Record<string, string> = {
  missing_api_key: 'aiAdvisor.fallback.reason.missing_api_key',
  provider_timeout: 'aiAdvisor.fallback.reason.provider_timeout',
  provider_http_error: 'aiAdvisor.fallback.reason.provider_http_error',
  provider_parse_error: 'aiAdvisor.fallback.reason.provider_parse_error',
  provider_validation_error: 'aiAdvisor.fallback.reason.provider_validation_error',
  provider_unknown_error: 'aiAdvisor.fallback.reason.provider_unknown_error',
};

function formatMoney(value: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercentFromRatio(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(value);
}

function formatReductionPercent(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function toMonthDate(month: string): Date {
  const [yearRaw, monthRaw] = month.split('-');
  const year = Number(yearRaw);
  const monthIndex = Number(monthRaw) - 1;
  return new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
}

function formatMonthLabel(month: string, locale: string): string {
  const date = toMonthDate(month);
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function formatDateTimeLabel(value: string, locale: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatDebugEventPayload(payload: Record<string, unknown>): string {
  const orderedKeys = [
    'requestId',
    'status',
    'durationMs',
    'mode',
    'modeReason',
    'provider',
    'providerStatus',
    'month',
    'language',
  ];
  const fragments: string[] = [];

  for (const key of orderedKeys) {
    if (!(key in payload)) {
      continue;
    }

    const value = payload[key];
    if (value === null || value === undefined) {
      continue;
    }

    fragments.push(`${key}=${String(value)}`);
  }

  return fragments.join(' · ');
}

function LoadingSkeleton({ dark }: { dark: boolean }) {
  const blockColor = dark ? '#1A2133' : '#E7EDF8';

  return (
    <View style={styles.skeletonWrap}>
      <View style={[styles.skeletonLarge, { backgroundColor: blockColor }]} />
      <View style={[styles.skeletonMedium, { backgroundColor: blockColor }]} />
      <View style={[styles.skeletonMedium, { backgroundColor: blockColor }]} />
      <View style={[styles.skeletonSmall, { backgroundColor: blockColor }]} />
    </View>
  );
}

function BulletList({
  items,
  tone,
}: {
  items: string[];
  tone: 'primary' | 'income' | 'expense' | 'muted';
}) {
  return (
    <View style={styles.listWrap}>
      {items.map((item, index) => (
        <View key={`${item}-${index}`} style={styles.listRow}>
          <AppIcon name="ellipse" size="xs" tone={tone} />
          <Text style={styles.listText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

export function AiAdvisorScreen() {
  const { withAuth, user } = useAuth();
  const { theme, mode } = useTheme();
  const { locale, t } = useI18n();
  const queryClient = useQueryClient();

  const [month, setMonth] = useState(getCurrentMonthString());
  const [activeTab, setActiveTab] = useState<AdvisorTab>('summary');
  const [showDetailedSections, setShowDetailedSections] = useState(false);
  const [actionModal, setActionModal] = useState<AdvisorActionModal>(null);
  const [budgetValues, setBudgetValues] = useState<Record<string, string>>({});
  const [recurringAmountText, setRecurringAmountText] = useState('');
  const [recurringCadence, setRecurringCadence] = useState<'weekly' | 'monthly'>('monthly');
  const [recurringDescription, setRecurringDescription] = useState('');
  const [recurringAccountId, setRecurringAccountId] = useState<string | null>(null);
  const [transferAmountText, setTransferAmountText] = useState('');
  const [transferDescription, setTransferDescription] = useState('');
  const [transferFromAccountId, setTransferFromAccountId] = useState<string | null>(null);
  const [transferToAccountId, setTransferToAccountId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [debugExpanded, setDebugExpanded] = useState(false);
  const responseDiagnosticsKeyRef = useRef<string | null>(null);
  const hasLoggedScreenMountRef = useRef(false);
  const advisorDebugEvents = useAdvisorDebugEvents();

  const currentMonth = useMemo(() => getCurrentMonthString(), []);
  const insightsQuery = useAdvisorInsights(month);
  const {
    regenerate: triggerRegenerate,
    isPending: isRegeneratePending,
    isInsightInFlight,
    error: regenerateError,
    clearError: clearRegenerateError,
  } = useAdvisorInsightRegenerateWithRewarded(month);
  const accountsQuery = useQuery({
    queryKey: financeQueryKeys.accounts.list(),
    queryFn: () => withAuth((token) => apiClient.getAccounts(token)),
  });

  const dark = mode === 'dark';
  const insights = insightsQuery.data ?? null;
  const currency = insights?.currency ?? user?.baseCurrency ?? 'TRY';
  const notAvailableLabel = t('common.notAvailable');
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim() || 'http://localhost:4000';
  const providerName = insights?.provider ?? notAvailableLabel;
  const hasAdviceSummary = Boolean(insights?.advice.summary?.trim());
  const hasAdviceContent = Boolean(
    insights && (
      hasAdviceSummary ||
      insights.advice.topFindings.length > 0 ||
      insights.advice.suggestedActions.length > 0 ||
      insights.advice.warnings.length > 0 ||
      insights.advice.tips.length > 0
    ),
  );

  useEffect(() => {
    if (hasLoggedScreenMountRef.current) {
      return;
    }

    hasLoggedScreenMountRef.current = true;
    logAdvisorReq('screen_mount', {
      month,
      language: locale,
    });
  }, [locale, month]);

  useEffect(() => {
    if (!insights) {
      return;
    }

    const nextBudgetValues: Record<string, string> = {};
    for (const item of insights.categoryBreakdown.slice(0, 3)) {
      const recommendedLimit = Math.max(0, Math.round(item.total * 1.1));
      nextBudgetValues[item.categoryId] = String(recommendedLimit);
    }
    setBudgetValues(nextBudgetValues);

    const recurringSeed = insights.categoryBreakdown[0]?.total ?? 0;
    setRecurringAmountText(String(Math.max(0, Math.round(recurringSeed))));
    setTransferAmountText(
      String(Math.max(0, Math.round(insights.advice.savings.monthlyTargetAmount))),
    );
  }, [insights]);

  useEffect(() => {
    const accounts = accountsQuery.data?.accounts ?? [];
    if (accounts.length < 2) {
      setRecurringAccountId(accounts[0]?.id ?? null);
      setTransferFromAccountId(null);
      setTransferToAccountId(null);
      return;
    }

    setRecurringAccountId((current) => current ?? accounts[0]?.id ?? null);
    setTransferFromAccountId((current) => current ?? accounts[0]?.id ?? null);
    setTransferToAccountId((current) => current ?? accounts[1]?.id ?? null);
  }, [accountsQuery.data]);

  useEffect(() => {
    if (!__DEV__ || !insights) {
      return;
    }

    console.info('[advisor][mobile-diagnostics]', {
      apiBaseUrl,
      requestMonth: month,
      provider: providerName,
      mode: insights.mode,
      modeReason: insights.modeReason,
      providerStatus: insights.providerStatus,
      requestTimeoutMs: mobileEnv.apiTimeoutMs,
    });
  }, [apiBaseUrl, insights, month, providerName]);

  useEffect(() => {
    if (!__DEV__ || !insights) {
      return;
    }

    const diagnosticsKey = `${insights.month}|${insights.generatedAt}`;
    if (responseDiagnosticsKeyRef.current === diagnosticsKey) {
      return;
    }

    responseDiagnosticsKeyRef.current = diagnosticsKey;
    console.info('[advisor][mobile-diagnostics][response]', {
      statusCode: 200,
      hasAdviceSummary,
    });
  }, [hasAdviceSummary, insights]);

  useEffect(() => {
    if (!__DEV__ || !insightsQuery.error) {
      return;
    }

    console.info('[advisor][mobile-diagnostics][error]', {
      month,
      error: normalizeApiErrorForUi(insightsQuery.error),
    });
  }, [insightsQuery.error, month]);

  const invalidateAfterAdvisorAction = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: financeQueryKeys.dashboard.recent() }),
      queryClient.invalidateQueries({ queryKey: financeQueryKeys.budgets.all() }),
      queryClient.invalidateQueries({ queryKey: financeQueryKeys.recurring.all() }),
      queryClient.invalidateQueries({ queryKey: financeQueryKeys.transactions.all() }),
      queryClient.invalidateQueries({ queryKey: financeQueryKeys.analytics.all() }),
      queryClient.invalidateQueries({ queryKey: financeQueryKeys.accounts.all() }),
      queryClient.invalidateQueries({ queryKey: financeQueryKeys.ai.all() }),
    ]);
  }, [queryClient]);

  const budgetActionMutation = useMutation({
    mutationFn: (payload: { month: string; items: Array<{ categoryId: string; limitAmount: number }> }) =>
      withAuth((token) => apiClient.createAdvisorBudgets(payload, token)),
    onSuccess: async () => {
      await invalidateAfterAdvisorAction();
      showAlert(t('advisor.actions.budgets.success'));
      setActionModal(null);
    },
  });

  const recurringActionMutation = useMutation({
    mutationFn: (payload: {
      accountId: string;
      categoryId: string;
      amount: number;
      cadence: 'weekly' | 'monthly';
      description?: string;
      dayOfWeek?: number;
      dayOfMonth?: number;
      startAt?: string;
      isPaused: boolean;
    }) => withAuth((token) => apiClient.createAdvisorRecurring(payload, token)),
    onSuccess: async () => {
      await invalidateAfterAdvisorAction();
      showAlert(t('advisor.actions.recurring.success'));
      setActionModal(null);
    },
  });

  const transferActionMutation = useMutation({
    mutationFn: (payload: {
      fromAccountId: string;
      toAccountId: string;
      amount: number;
      occurredAt: string;
      description?: string;
    }) => withAuth((token) => apiClient.createAdvisorTransfer(payload, token)),
    onSuccess: async () => {
      await invalidateAfterAdvisorAction();
      showAlert(t('advisor.actions.transfer.success'));
      setActionModal(null);
    },
  });

  const handleRetry = useCallback(() => {
    void insightsQuery.refetch();
  }, [insightsQuery]);

  const handleRegenerate = useCallback(() => {
    clearRegenerateError();
    void (async () => {
      let isFreeEligible = true;
      const userId = user?.id ?? null;

      if (userId) {
        try {
          const dayKey = getAdvisorUsageDayKey();
          const hasUsedFree = await hasUsedDailyAdvisorFreeUsage(userId, dayKey);
          isFreeEligible = !hasUsedFree;
        } catch {
          isFreeEligible = true;
        }
      }

      logAdvisorReq('regenerate_tap', {
        month,
        language: locale,
        isFreeEligible,
        willShowRewardedAd: !isFreeEligible,
      });

      triggerRegenerate();
    })();
  }, [clearRegenerateError, locale, month, triggerRegenerate, user?.id]);

  const handlePrevMonth = useCallback(() => {
    setMonth((prev) => shiftMonth(prev, -1));
  }, []);

  const handleNextMonth = useCallback(() => {
    setMonth((prev) => {
      const next = shiftMonth(prev, 1);
      return next > currentMonth ? prev : next;
    });
  }, [currentMonth]);

  const openActionModal = useCallback((modal: AdvisorActionModal) => {
    setActionError(null);
    setActionModal(modal);
  }, []);

  const closeActionModal = useCallback(() => {
    setActionError(null);
    setActionModal(null);
  }, []);

  const handleBudgetAction = useCallback(() => {
    if (!insights) {
      return;
    }

    const items = insights.categoryBreakdown
      .slice(0, 3)
      .map((item) => {
        const parsedAmount = Number(budgetValues[item.categoryId] ?? '');
        return {
          categoryId: item.categoryId,
          limitAmount: parsedAmount,
        };
      })
      .filter((item) => Number.isFinite(item.limitAmount) && item.limitAmount > 0);

    if (items.length === 0) {
      setActionError(t('advisor.actions.validation.budgetAmountRequired'));
      return;
    }

    setActionError(null);
    budgetActionMutation.mutate({ month, items });
  }, [budgetActionMutation, budgetValues, insights, month, t]);

  const handleRecurringAction = useCallback(() => {
    if (!insights) {
      return;
    }

    const accountId = recurringAccountId ?? accountsQuery.data?.accounts[0]?.id ?? null;
    if (!accountId) {
      setActionError(t('errors.validation.selectAccount'));
      return;
    }

    const categoryId = insights.categoryBreakdown[0]?.categoryId ?? null;
    if (!categoryId) {
      setActionError(t('errors.validation.selectCategory'));
      return;
    }

    const parsedAmount = Number(recurringAmountText.trim());
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setActionError(t('errors.validation.amountPositive'));
      return;
    }

    setActionError(null);
    recurringActionMutation.mutate({
      accountId,
      categoryId,
      amount: parsedAmount,
      cadence: recurringCadence,
      description: recurringDescription.trim() || undefined,
      dayOfWeek: recurringCadence === 'weekly' ? new Date().getUTCDay() : undefined,
      dayOfMonth: recurringCadence === 'monthly' ? Math.min(28, new Date().getUTCDate()) : undefined,
      startAt: new Date().toISOString(),
      isPaused: true,
    });
  }, [
    accountsQuery.data,
    insights,
    recurringActionMutation,
    recurringAccountId,
    recurringAmountText,
    recurringCadence,
    recurringDescription,
    t,
  ]);

  const handleTransferAction = useCallback(() => {
    const fromAccountId = transferFromAccountId;
    const toAccountId = transferToAccountId;

    if (!fromAccountId) {
      setActionError(t('errors.validation.selectSourceAccount'));
      return;
    }

    if (!toAccountId) {
      setActionError(t('errors.validation.selectDestinationAccount'));
      return;
    }

    if (fromAccountId === toAccountId) {
      setActionError(t('errors.sameAccount'));
      return;
    }

    const accounts = accountsQuery.data?.accounts ?? [];
    const fromAccount = accounts.find((item) => item.id === fromAccountId) ?? null;
    const toAccount = accounts.find((item) => item.id === toAccountId) ?? null;

    if (!fromAccount || !toAccount) {
      setActionError(t('errors.validation.selectAccount'));
      return;
    }

    if (fromAccount.currency !== toAccount.currency) {
      setActionError(t('errors.currencyMismatch'));
      return;
    }

    const parsedAmount = Number(transferAmountText.trim());
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setActionError(t('errors.validation.amountPositive'));
      return;
    }

    setActionError(null);
    transferActionMutation.mutate({
      fromAccountId,
      toAccountId,
      amount: parsedAmount,
      occurredAt: new Date().toISOString(),
      description: transferDescription.trim() || undefined,
    });
  }, [
    accountsQuery.data,
    t,
    transferActionMutation,
    transferAmountText,
    transferDescription,
    transferFromAccountId,
    transferToAccountId,
  ]);

  const money = useCallback((value: number) => formatMoney(value, currency, locale), [currency, locale]);

  const monthLabel = useMemo(() => formatMonthLabel(month, locale), [locale, month]);
  const generatedAtLabel = useMemo(
    () => (insights ? formatDateTimeLabel(insights.generatedAt, locale) : ''),
    [insights, locale],
  );

  const overviewCards = useMemo(() => {
    if (!insights) {
      return [] as OverviewCardItem[];
    }

    return [
      {
        key: 'last30Income',
        label: t('aiAdvisor.summary.cards.last30Income'),
        value: money(insights.overview.last30DaysIncome),
        tone: 'income' as const,
      },
      {
        key: 'last30Expense',
        label: t('aiAdvisor.summary.cards.last30Expense'),
        value: money(insights.overview.last30DaysExpense),
        tone: 'expense' as const,
      },
      {
        key: 'currentNet',
        label: t('aiAdvisor.summary.cards.currentMonthNet'),
        value: money(insights.overview.currentMonthNet),
        tone: (insights.overview.currentMonthNet >= 0 ? 'income' : 'expense') as OverviewCardTone,
      },
      {
        key: 'savingsRate',
        label: t('aiAdvisor.summary.cards.savingsRate'),
        value: formatPercentFromRatio(insights.overview.savingsRate, locale),
        tone: 'primary' as const,
      },
    ];
  }, [insights, locale, money, t]);

  const trendScale = useMemo(() => {
    if (!insights || insights.cashflowTrend.length === 0) {
      return 1;
    }

    const maxValue = Math.max(
      1,
      ...insights.cashflowTrend.flatMap((point) => [point.incomeTotal, point.expenseTotal]),
    );

    return maxValue;
  }, [insights]);

  const flags = useMemo(() => {
    if (!insights) {
      return [] as string[];
    }

    const items: string[] = [];

    if (insights.flags.negativeCashflow) {
      items.push(t('aiAdvisor.flags.negativeCashflow'));
    }

    if (insights.flags.lowSavingsRate) {
      items.push(t('aiAdvisor.flags.lowSavingsRate'));
    }

    if (insights.flags.irregularIncome) {
      items.push(t('aiAdvisor.flags.irregularIncome'));
    }

    if (insights.flags.overspendingCategoryNames.length > 0) {
      items.push(
        t('aiAdvisor.flags.overspendingCategories', {
          value: insights.flags.overspendingCategoryNames.join(', '),
        }),
      );
    }

    return items;
  }, [insights, t]);

  const warningItems = useMemo(() => {
    if (!insights) {
      return [] as string[];
    }

    const merged = [...insights.advice.warnings, ...flags];
    return Array.from(new Set(merged.map((item) => item.trim()).filter((item) => item.length > 0)));
  }, [flags, insights]);

  const normalizedAdvisorError = useMemo(
    () => (insightsQuery.error ? normalizeApiErrorForUi(insightsQuery.error) : null),
    [insightsQuery.error],
  );
  const advisorErrorMessage = useMemo(() => {
    if (!normalizedAdvisorError) {
      return '';
    }

    const normalized = normalizedAdvisorError;
    if (
      normalized.code === 'REQUEST_TIMEOUT' ||
      normalized.code === 'AI_PROVIDER_TIMEOUT' ||
      normalized.code === 'SERVER_UNREACHABLE'
    ) {
      return t('errors.advisor.timeout');
    }

    return apiErrorText(insightsQuery.error);
  }, [insightsQuery.error, normalizedAdvisorError, t]);
  const advisorErrorCode = normalizedAdvisorError?.code ?? '';
  const regenerateErrorMessage = useMemo(() => {
    if (!regenerateError) {
      return '';
    }

    return apiErrorText(regenerateError);
  }, [regenerateError]);

  const fallbackReasonMessage = useMemo(() => {
    if (!insights || insights.mode !== 'fallback') {
      return '';
    }

    const fallbackReasonKey = insights.modeReason
      ? FALLBACK_REASON_TRANSLATION_KEYS[insights.modeReason]
      : null;

    if (fallbackReasonKey) {
      return t(fallbackReasonKey);
    }

    return t('aiAdvisor.fallback.reason.provider_unknown_error');
  }, [insights, t]);
  const modeChipTone = insights?.mode === 'fallback'
    ? 'expense'
    : insights?.mode === 'manual'
      ? 'primary'
      : 'income';

  if (insightsQuery.isLoading && !insights) {
    return (
      <ScreenContainer dark={dark}>
        <LoadingSkeleton dark={dark} />
      </ScreenContainer>
    );
  }

  if (insightsQuery.isError && !insights) {
    return (
      <ScreenContainer dark={dark}>
        <Card dark={dark} style={styles.errorCard}>
          <AppIcon name="sparkles-outline" size="lg" tone="expense" />
          <Text style={[styles.errorTitle, { color: theme.colors.text }]}>{t('aiAdvisor.state.errorTitle')}</Text>
          <Text style={[styles.errorText, { color: theme.colors.expense }]}>{advisorErrorMessage}</Text>
          {advisorErrorCode ? (
            <Text style={[styles.errorText, { color: theme.colors.textMuted }]}>
              {`code=${advisorErrorCode}`}
            </Text>
          ) : null}
          <PrimaryButton
            label={t('common.retry')}
            iconName="refresh-outline"
            onPress={handleRetry}
          />
        </Card>
      </ScreenContainer>
    );
  }

  if (!insights) {
    return (
      <ScreenContainer dark={dark}>
        <Card dark={dark} style={styles.errorCard}>
          <Text style={[styles.errorText, { color: theme.colors.textMuted }]}>{t('aiAdvisor.state.noData')}</Text>
          <PrimaryButton
            label={t('common.retry')}
            iconName="refresh-outline"
            onPress={handleRetry}
          />
        </Card>
      </ScreenContainer>
    );
  }

  if (!hasAdviceContent) {
    return (
      <ScreenContainer dark={dark}>
        <Card dark={dark} style={styles.errorCard}>
          <Text style={[styles.errorText, { color: theme.colors.textMuted }]}>{t('aiAdvisor.state.noData')}</Text>
          <PrimaryButton
            label={t('common.retry')}
            iconName="refresh-outline"
            onPress={handleRetry}
          />
        </Card>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer dark={dark}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.colors.text }]}>{t('aiAdvisor.title')}</Text>
          <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>{t('aiAdvisor.subtitle')}</Text>
        </View>

        <Card dark={dark} style={styles.controlCard}>
          <View style={styles.monthControlRow}>
            <Text style={[styles.controlLabel, { color: theme.colors.textMuted }]}>{t('aiAdvisor.month.title')}</Text>
            <View style={styles.monthActions}>
              <Pressable
                accessibilityRole="button"
                onPress={handlePrevMonth}
                style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
              >
                <AppIcon name="chevron-back" size="sm" tone="text" />
              </Pressable>
              <Text style={[styles.monthText, { color: theme.colors.text }]}>{monthLabel}</Text>
              <Pressable
                accessibilityRole="button"
                disabled={month === currentMonth}
                onPress={handleNextMonth}
                style={({ pressed }) => [
                  styles.iconButton,
                  (pressed || month === currentMonth) && styles.iconButtonPressed,
                ]}
              >
                <AppIcon name="chevron-forward" size="sm" tone="text" />
              </Pressable>
            </View>
          </View>

          <View style={styles.generatedRow}>
            <Text style={[styles.generatedText, { color: theme.colors.textMuted }]}>
              {t('aiAdvisor.generatedAt', {
                value: generatedAtLabel || t('common.notAvailable'),
              })}
            </Text>
          </View>

          {insights.mode === 'fallback' ? (
            <View
              style={[
                styles.panelCard,
                styles.warningPanel,
                {
                  backgroundColor: dark ? 'rgba(245, 158, 11, 0.14)' : '#FFFBEB',
                  borderColor: dark ? 'rgba(245, 158, 11, 0.35)' : '#FCD34D',
                },
              ]}
            >
              <Text style={[styles.rowTitle, { color: theme.colors.text }]}>{t('aiAdvisor.fallback.useBasicAdvice')}</Text>
              <Text style={[styles.rowHint, { color: theme.colors.textMuted }]}>
                {fallbackReasonMessage || t('aiAdvisor.fallback.reason.provider_unknown_error')}
              </Text>
            </View>
          ) : null}

          {__DEV__ ? (
            <View style={styles.devModeWrap}>
              <View style={styles.devModeRow}>
                <Chip dark={dark} tone={modeChipTone} label={insights.mode} />
              </View>
              <Text style={[styles.devModeText, { color: theme.colors.textMuted }]}>
                {t('aiAdvisor.debug.apiBaseUrl', { value: apiBaseUrl })}
              </Text>
              <Text style={[styles.devModeText, { color: theme.colors.textMuted }]}>
                {t('aiAdvisor.debug.provider', { value: providerName })}
              </Text>
              <Text style={[styles.devModeText, { color: theme.colors.textMuted }]}>
                {t('aiAdvisor.debug.modeReason', { value: insights.modeReason ?? notAvailableLabel })}
              </Text>
              <Text style={[styles.devModeText, { color: theme.colors.textMuted }]}>
                {t('aiAdvisor.debug.providerStatus', { value: insights.providerStatus ?? notAvailableLabel })}
              </Text>
            </View>
          ) : null}

          {__DEV__ ? (
            <Card dark={dark} style={styles.debugCard}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setDebugExpanded((current) => !current)}
                style={styles.debugToggleRow}
              >
                <Text style={[styles.debugTitle, { color: theme.colors.text }]}>Advisor Debug</Text>
                <AppIcon name={debugExpanded ? 'chevron-up' : 'chevron-down'} size="sm" tone="text" />
              </Pressable>

              {debugExpanded ? (
                <View style={styles.debugEventsWrap}>
                  {advisorDebugEvents.length === 0 ? (
                    <Text style={[styles.debugLine, { color: theme.colors.textMuted }]}>No events yet.</Text>
                  ) : advisorDebugEvents.slice().reverse().map((eventItem) => (
                    <View key={`${eventItem.timestamp}-${eventItem.event}`} style={styles.debugEventRow}>
                      <Text style={[styles.debugLine, styles.debugEventName, { color: theme.colors.text }]}>
                        {`${eventItem.timestamp} · ${eventItem.event}`}
                      </Text>
                      <Text style={[styles.debugLine, { color: theme.colors.textMuted }]}>
                        {formatDebugEventPayload(eventItem.payload)}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </Card>
          ) : null}

          <PrimaryButton
            label={t('aiAdvisor.actions.regenerate')}
            iconName="sparkles-outline"
            loading={isRegeneratePending}
            onPress={handleRegenerate}
          />

          {regenerateErrorMessage ? (
            <Text style={[styles.errorText, { color: theme.colors.expense }]}>{regenerateErrorMessage}</Text>
          ) : null}

          {(insightsQuery.isFetching || isInsightInFlight) && !insightsQuery.isLoading ? (
            <View style={styles.inlineLoadingWrap}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text style={[styles.inlineLoadingText, { color: theme.colors.textMuted }]}>
                {t('aiAdvisor.state.loading')}
              </Text>
            </View>
          ) : null}
        </Card>

        <Section dark={dark} title={t('aiAdvisor.primary.keyInsights')}>
          <Card dark={dark} style={styles.panelCard}>
            <Text style={[styles.panelBodyText, { color: theme.colors.textMuted }]}>
              {insights.advice.summary}
            </Text>

            {insights.advice.topFindings.length > 0 ? (
              <BulletList items={insights.advice.topFindings} tone="primary" />
            ) : (
              <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
                {t('aiAdvisor.summary.emptyFlags')}
              </Text>
            )}
          </Card>
        </Section>

        <Section dark={dark} title={t('aiAdvisor.primary.actions')}>
          <Card dark={dark} style={styles.panelCard}>
            {insights.advice.suggestedActions.length > 0 ? (
              <View style={styles.listWrap}>
                {insights.advice.suggestedActions.map((item, index) => (
                  <View key={`${item}-${index}`} style={styles.listRow}>
                    <AppIcon name="checkmark-circle" size="sm" tone="income" />
                    <Text style={styles.listText}>{item}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
                {t('aiAdvisor.savings.emptyActions')}
              </Text>
            )}
          </Card>
        </Section>

        <Section dark={dark} title={t('aiAdvisor.primary.warnings')}>
          <Card
            dark={dark}
            style={[
              styles.panelCard,
              styles.warningPanel,
              {
                backgroundColor: dark ? 'rgba(239,68,68,0.12)' : '#FEF2F2',
                borderColor: dark ? 'rgba(248,113,113,0.4)' : '#FCA5A5',
              },
            ]}
          >
            {warningItems.length > 0 ? (
              <BulletList items={warningItems} tone="expense" />
            ) : (
              <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
                {t('aiAdvisor.primary.noWarnings')}
              </Text>
            )}
          </Card>
        </Section>

        <Card dark={dark} style={styles.detailsCard}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setShowDetailedSections((previous) => !previous)}
            style={styles.detailsToggle}
          >
            <Text style={[styles.detailsToggleLabel, { color: theme.colors.text }]}>
              {showDetailedSections ? t('aiAdvisor.primary.hideDetails') : t('aiAdvisor.primary.showDetails')}
            </Text>
            <AppIcon name={showDetailedSections ? 'chevron-up' : 'chevron-down'} size="sm" tone="text" />
          </Pressable>
        </Card>

        {showDetailedSections ? (
          <>
            <View style={styles.tabsRow}>
              {TAB_OPTIONS.map((tab) => {
                const selected = activeTab === tab.key;

                return (
                  <Pressable
                    key={tab.key}
                    accessibilityRole="button"
                    onPress={() => setActiveTab(tab.key)}
                    style={[
                      styles.tab,
                      {
                        backgroundColor: selected
                          ? theme.colors.primary
                          : dark
                            ? 'rgba(255,255,255,0.08)'
                            : '#EEF2FB',
                        borderColor: selected ? theme.colors.primary : theme.colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.tabLabel,
                        {
                          color: selected ? '#FFFFFF' : theme.colors.text,
                        },
                      ]}
                    >
                      {t(tab.labelKey)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {activeTab === 'summary' ? (
              <View style={styles.sectionWrap}>
                <Section dark={dark} title={t('aiAdvisor.summary.sections.overview')}>
                  <View style={styles.grid}>
                    {overviewCards.map((card) => (
                      <StatCard
                        key={card.key}
                        dark={dark}
                        label={card.label}
                        value={card.value}
                        tone={card.tone}
                      />
                    ))}
                  </View>
                </Section>

                <Section dark={dark} title={t('aiAdvisor.summary.sections.categoryBreakdown')}>
                  <Card dark={dark} style={styles.panelCard}>
                    {insights.categoryBreakdown.length > 0 ? (
                      <View style={styles.listWrap}>
                        {insights.categoryBreakdown.map((item) => (
                          <View key={item.categoryId} style={[styles.rowBetween, { borderColor: theme.colors.border }]}>
                            <View style={styles.rowLeft}>
                              <Text style={[styles.rowTitle, { color: theme.colors.text }]}>{item.name}</Text>
                              <Text style={[styles.rowHint, { color: theme.colors.textMuted }]}>
                                {t('aiAdvisor.summary.shareValue', {
                                  value: formatPercentFromRatio(item.sharePercent / 100, locale),
                                })}
                              </Text>
                            </View>
                            <Text style={[styles.rowValue, { color: theme.colors.text }]}>{money(item.total)}</Text>
                          </View>
                        ))}
                      </View>
                    ) : (
                      <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
                        {t('aiAdvisor.summary.emptyCategory')}
                      </Text>
                    )}
                  </Card>
                </Section>

                <Section dark={dark} title={t('aiAdvisor.summary.sections.cashflowTrend')}>
                  <Card dark={dark} style={styles.panelCard}>
                    {insights.cashflowTrend.length > 0 ? (
                      <View style={styles.trendWrap}>
                        {insights.cashflowTrend.map((point) => (
                          <View key={point.month} style={styles.trendItem}>
                            <Text style={[styles.trendMonth, { color: theme.colors.textMuted }]}>
                              {formatMonthLabel(point.month, locale)}
                            </Text>

                            <View style={[styles.trendBarTrack, { backgroundColor: dark ? 'rgba(255,255,255,0.08)' : '#EEF2FB' }]}>
                              <View
                                style={[
                                  styles.trendBarIncome,
                                  {
                                    width: `${Math.max(4, (point.incomeTotal / trendScale) * 100)}%`,
                                    backgroundColor: theme.colors.income,
                                  },
                                ]}
                              />
                            </View>

                            <View style={[styles.trendBarTrack, { backgroundColor: dark ? 'rgba(255,255,255,0.08)' : '#EEF2FB' }]}>
                              <View
                                style={[
                                  styles.trendBarExpense,
                                  {
                                    width: `${Math.max(4, (point.expenseTotal / trendScale) * 100)}%`,
                                    backgroundColor: theme.colors.expense,
                                  },
                                ]}
                              />
                            </View>

                            <View style={styles.trendAmountsRow}>
                              <Text style={[styles.trendAmountText, { color: theme.colors.income }]}>
                                {money(point.incomeTotal)}
                              </Text>
                              <Text style={[styles.trendAmountText, { color: theme.colors.expense }]}>
                                {money(point.expenseTotal)}
                              </Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    ) : (
                      <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
                        {t('aiAdvisor.summary.noTrend')}
                      </Text>
                    )}
                  </Card>
                </Section>

                <Section dark={dark} title={t('aiAdvisor.summary.sections.budgetAdherence')}>
                  <Card dark={dark} style={styles.panelCard}>
                    {insights.budgetAdherence.items.length > 0 ? (
                      <View style={styles.listWrap}>
                        {insights.budgetAdherence.items.map((item) => (
                          <View key={item.budgetId} style={[styles.rowBetween, { borderColor: theme.colors.border }]}>
                            <View style={styles.rowLeft}>
                              <Text style={[styles.rowTitle, { color: theme.colors.text }]}>{item.categoryName}</Text>
                              <Text style={[styles.rowHint, { color: theme.colors.textMuted }]}>
                                {t('aiAdvisor.budget.usageValue', {
                                  spent: money(item.spentAmount),
                                  limit: money(item.limitAmount),
                                })}
                              </Text>
                            </View>
                            <Chip
                              dark={dark}
                              tone={
                                item.status === 'on_track'
                                  ? 'income'
                                  : item.status === 'near_limit'
                                    ? 'primary'
                                    : 'expense'
                              }
                              label={t(BUDGET_STATUS_LABEL_KEY[item.status])}
                            />
                          </View>
                        ))}
                      </View>
                    ) : (
                      <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
                        {t('aiAdvisor.summary.emptyBudget')}
                      </Text>
                    )}
                  </Card>
                </Section>
              </View>
            ) : null}

            {activeTab === 'savings' ? (
              <View style={styles.sectionWrap}>
                <Section dark={dark} title={t('aiAdvisor.savings.title')}>
                  <View style={styles.grid}>
                    <StatCard
                      dark={dark}
                      label={t('aiAdvisor.savings.targetRate')}
                      value={formatPercentFromRatio(insights.advice.savings.targetRate, locale)}
                      tone="primary"
                    />
                    <StatCard
                      dark={dark}
                      label={t('aiAdvisor.savings.monthlyTargetAmount')}
                      value={money(insights.advice.savings.monthlyTargetAmount)}
                      tone="income"
                    />
                  </View>

                  <Card dark={dark} style={styles.panelCard}>
                    <Text style={[styles.panelTitle, { color: theme.colors.text }]}>{t('aiAdvisor.savings.next7Days')}</Text>
                    {insights.advice.savings.next7DaysActions.length > 0 ? (
                      <BulletList items={insights.advice.savings.next7DaysActions} tone="income" />
                    ) : (
                      <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
                        {t('aiAdvisor.savings.emptyActions')}
                      </Text>
                    )}
                  </Card>

                  <Card dark={dark} style={styles.panelCard}>
                    <Text style={[styles.panelTitle, { color: theme.colors.text }]}>{t('aiAdvisor.savings.autoTransferSuggestion')}</Text>
                    <Text style={[styles.panelBodyText, { color: theme.colors.textMuted }]}>
                      {insights.advice.savings.autoTransferSuggestion}
                    </Text>
                  </Card>
                </Section>
              </View>
            ) : null}

            {activeTab === 'investment' ? (
              <View style={styles.sectionWrap}>
                <Section dark={dark} title={t('aiAdvisor.investment.title')}>
                  <View style={styles.grid}>
                    <StatCard
                      dark={dark}
                      label={t('aiAdvisor.investment.emergencyFundCurrent')}
                      value={money(insights.advice.investment.emergencyFundCurrent)}
                      tone="primary"
                    />
                    <StatCard
                      dark={dark}
                      label={t('aiAdvisor.investment.emergencyFundTarget')}
                      value={money(insights.advice.investment.emergencyFundTarget)}
                      tone="expense"
                    />
                  </View>

                  <Card dark={dark} style={styles.panelCard}>
                    <Text style={[styles.panelTitle, { color: theme.colors.text }]}>{t('aiAdvisor.investment.emergencyFundStatus')}</Text>
                    <Chip
                      dark={dark}
                      tone={
                        insights.advice.investment.emergencyFundStatus === 'ready'
                          ? 'income'
                          : insights.advice.investment.emergencyFundStatus === 'building'
                            ? 'primary'
                            : 'expense'
                      }
                      label={t(`aiAdvisor.investment.status.${insights.advice.investment.emergencyFundStatus}`)}
                    />
                  </Card>

                  <Card dark={dark} style={styles.panelCard}>
                    <Text style={[styles.panelTitle, { color: theme.colors.text }]}>{t('aiAdvisor.investment.profiles')}</Text>
                    <View style={styles.listWrap}>
                      {insights.advice.investment.profiles.map((profile) => (
                        <View key={profile.level} style={[styles.profileCard, { borderColor: theme.colors.border }]}>
                          <View style={styles.profileHeader}>
                            <Chip dark={dark} tone="primary" label={t(`aiAdvisor.investment.risk.${profile.level}`)} />
                            <Text style={[styles.profileTitle, { color: theme.colors.text }]}>{profile.title}</Text>
                          </View>

                          <Text style={[styles.profileBody, { color: theme.colors.textMuted }]}>{profile.rationale}</Text>

                          <View style={styles.profileOptionsWrap}>
                            {profile.options.map((option, index) => (
                              <Text key={`${profile.level}-${index}`} style={[styles.profileOption, { color: theme.colors.textMuted }]}>
                                {option}
                              </Text>
                            ))}
                          </View>
                        </View>
                      ))}
                    </View>
                  </Card>

                  <Card dark={dark} style={styles.panelCard}>
                    <Text style={[styles.panelTitle, { color: theme.colors.text }]}>{t('aiAdvisor.investment.guidance')}</Text>
                    <BulletList items={insights.advice.investment.guidance} tone="primary" />
                  </Card>
                </Section>
              </View>
            ) : null}

            {activeTab === 'tips' ? (
              <View style={styles.sectionWrap}>
                <Section dark={dark} title={t('aiAdvisor.tips.title')}>
                  <Card dark={dark} style={styles.panelCard}>
                    <Text style={[styles.panelTitle, { color: theme.colors.text }]}>{t('aiAdvisor.tips.cutCandidates')}</Text>
                    <View style={styles.listWrap}>
                      {insights.advice.expenseOptimization.cutCandidates.map((item, index) => (
                        <View key={`${item.label}-${index}`} style={[styles.tipCard, { borderColor: theme.colors.border }]}>
                          <View style={styles.rowBetween}>
                            <Text style={[styles.rowTitle, { color: theme.colors.text }]}>{item.label}</Text>
                            <Text style={[styles.rowValue, { color: theme.colors.expense }]}>
                              {t('aiAdvisor.tips.reductionValue', {
                                value: formatReductionPercent(item.suggestedReductionPercent, locale),
                              })}
                            </Text>
                          </View>

                          <Text style={[styles.rowHint, { color: theme.colors.textMuted }]}>
                            {t('aiAdvisor.tips.currentAmountValue', {
                              value: money(item.currentAmount),
                            })}
                          </Text>

                          <Text style={[styles.panelBodyText, { color: theme.colors.textMuted }]}>
                            {item.alternativeAction}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </Card>

                  <Card dark={dark} style={styles.panelCard}>
                    <Text style={[styles.panelTitle, { color: theme.colors.text }]}>{t('aiAdvisor.tips.quickWins')}</Text>
                    <BulletList items={insights.advice.expenseOptimization.quickWins} tone="income" />
                  </Card>

                  <Card dark={dark} style={styles.panelCard}>
                    <Text style={[styles.panelTitle, { color: theme.colors.text }]}>{t('aiAdvisor.tips.generalTips')}</Text>
                    <BulletList items={insights.advice.tips} tone="primary" />
                  </Card>
                </Section>
              </View>
            ) : null}
          </>
        ) : null}

        <Section dark={dark} title={t('advisor.actions.title')} subtitle={t('advisor.actions.subtitle')}>
          <Card dark={dark} style={styles.actionCard}>
            <View style={styles.actionRow}>
              <View style={styles.actionTextWrap}>
                <Text style={[styles.actionTitle, { color: theme.colors.text }]}>{t('advisor.actions.budgets.title')}</Text>
                <Text style={[styles.actionSubtitle, { color: theme.colors.textMuted }]}>{t('advisor.actions.budgets.subtitle')}</Text>
              </View>
              <PrimaryButton label={t('advisor.actions.budgets.cta')} onPress={() => openActionModal('budget')} />
            </View>
            <View style={[styles.actionDivider, { backgroundColor: theme.colors.border }]} />
            <View style={styles.actionRow}>
              <View style={styles.actionTextWrap}>
                <Text style={[styles.actionTitle, { color: theme.colors.text }]}>{t('advisor.actions.recurring.title')}</Text>
                <Text style={[styles.actionSubtitle, { color: theme.colors.textMuted }]}>{t('advisor.actions.recurring.subtitle')}</Text>
              </View>
              <PrimaryButton label={t('advisor.actions.recurring.cta')} onPress={() => openActionModal('recurring')} />
            </View>
            <View style={[styles.actionDivider, { backgroundColor: theme.colors.border }]} />
            <View style={styles.actionRow}>
              <View style={styles.actionTextWrap}>
                <Text style={[styles.actionTitle, { color: theme.colors.text }]}>{t('advisor.actions.transfer.title')}</Text>
                <Text style={[styles.actionSubtitle, { color: theme.colors.textMuted }]}>{t('advisor.actions.transfer.subtitle')}</Text>
              </View>
              <PrimaryButton label={t('advisor.actions.transfer.cta')} onPress={() => openActionModal('transfer')} />
            </View>
          </Card>
        </Section>

        <Card dark={dark} style={styles.footerCard}>
          <Text style={[styles.disclaimer, { color: theme.colors.textMuted }]}>{t('aiAdvisor.disclaimer')}</Text>
        </Card>
      </View>

      <Modal
        animationType="slide"
        transparent
        visible={actionModal !== null}
        onRequestClose={closeActionModal}
      >
        <View style={styles.modalOverlay}>
          <Card dark={dark} style={styles.modalCard}>
            {actionModal === 'budget' ? (
              <View style={styles.modalContent}>
                <Text style={[styles.modalTitle, { color: theme.colors.text }]}>{t('advisor.actions.budgets.modalTitle')}</Text>
                {insights?.categoryBreakdown.slice(0, 3).map((item) => (
                  <TextField
                    key={item.categoryId}
                    keyboardType="numeric"
                    label={item.name}
                    onChangeText={(value) => {
                      setBudgetValues((previous) => ({
                        ...previous,
                        [item.categoryId]: value.replace(/[^0-9.]/g, ''),
                      }));
                      setActionError(null);
                    }}
                    placeholder={t('advisor.actions.common.amountPlaceholder')}
                    value={budgetValues[item.categoryId] ?? ''}
                  />
                ))}
                {actionError ? <Text style={[styles.errorText, { color: theme.colors.expense }]}>{actionError}</Text> : null}
                {budgetActionMutation.isError ? <Text style={[styles.errorText, { color: theme.colors.expense }]}>{apiErrorText(budgetActionMutation.error)}</Text> : null}
                <View style={styles.modalButtons}>
                  <PrimaryButton label={t('common.cancel')} onPress={closeActionModal} />
                  <PrimaryButton
                    label={budgetActionMutation.isPending ? t('common.loadingShort') : t('advisor.actions.budgets.submit')}
                    onPress={handleBudgetAction}
                    loading={budgetActionMutation.isPending}
                  />
                </View>
              </View>
            ) : null}

            {actionModal === 'recurring' ? (
              <View style={styles.modalContent}>
                <Text style={[styles.modalTitle, { color: theme.colors.text }]}>{t('advisor.actions.recurring.modalTitle')}</Text>

                <Text style={[styles.modalLabel, { color: theme.colors.textMuted }]}>{t('advisor.actions.recurring.account')}</Text>
                <View style={styles.modalChipRow}>
                  {(accountsQuery.data?.accounts ?? []).map((account) => (
                    <Pressable
                      key={`recurring-${account.id}`}
                      onPress={() => {
                        setRecurringAccountId(account.id);
                        setActionError(null);
                      }}
                    >
                      <Chip
                        dark={dark}
                        tone={recurringAccountId === account.id ? 'primary' : 'default'}
                        selected={recurringAccountId === account.id}
                        label={account.name}
                      />
                    </Pressable>
                  ))}
                </View>

                <TextField
                  keyboardType="numeric"
                  label={t('advisor.actions.common.amountLabel')}
                  onChangeText={(value) => {
                    setRecurringAmountText(value.replace(/[^0-9.]/g, ''));
                    setActionError(null);
                  }}
                  placeholder={t('advisor.actions.common.amountPlaceholder')}
                  value={recurringAmountText}
                />

                <TextField
                  label={t('advisor.actions.common.noteLabel')}
                  onChangeText={(value) => {
                    setRecurringDescription(value);
                    setActionError(null);
                  }}
                  placeholder={t('advisor.actions.common.notePlaceholder')}
                  value={recurringDescription}
                />

                <View style={styles.modalChipRow}>
                  <Pressable onPress={() => setRecurringCadence('weekly')}>
                    <Chip
                      dark={dark}
                      tone={recurringCadence === 'weekly' ? 'primary' : 'default'}
                      selected={recurringCadence === 'weekly'}
                      label={t('advisor.actions.recurring.weekly')}
                    />
                  </Pressable>
                  <Pressable onPress={() => setRecurringCadence('monthly')}>
                    <Chip
                      dark={dark}
                      tone={recurringCadence === 'monthly' ? 'primary' : 'default'}
                      selected={recurringCadence === 'monthly'}
                      label={t('advisor.actions.recurring.monthly')}
                    />
                  </Pressable>
                </View>

                {actionError ? <Text style={[styles.errorText, { color: theme.colors.expense }]}>{actionError}</Text> : null}
                {recurringActionMutation.isError ? <Text style={[styles.errorText, { color: theme.colors.expense }]}>{apiErrorText(recurringActionMutation.error)}</Text> : null}
                <View style={styles.modalButtons}>
                  <PrimaryButton label={t('common.cancel')} onPress={closeActionModal} />
                  <PrimaryButton
                    label={recurringActionMutation.isPending ? t('common.loadingShort') : t('advisor.actions.recurring.submit')}
                    onPress={handleRecurringAction}
                    loading={recurringActionMutation.isPending}
                  />
                </View>
              </View>
            ) : null}

            {actionModal === 'transfer' ? (
              <View style={styles.modalContent}>
                <Text style={[styles.modalTitle, { color: theme.colors.text }]}>{t('advisor.actions.transfer.modalTitle')}</Text>

                <Text style={[styles.modalLabel, { color: theme.colors.textMuted }]}>{t('advisor.actions.transfer.fromAccount')}</Text>
                <View style={styles.modalChipRow}>
                  {(accountsQuery.data?.accounts ?? []).map((account) => (
                    <Pressable
                      key={`from-${account.id}`}
                      onPress={() => {
                        setTransferFromAccountId(account.id);
                        setActionError(null);
                      }}
                    >
                      <Chip
                        dark={dark}
                        tone={transferFromAccountId === account.id ? 'primary' : 'default'}
                        selected={transferFromAccountId === account.id}
                        label={account.name}
                      />
                    </Pressable>
                  ))}
                </View>

                <Text style={[styles.modalLabel, { color: theme.colors.textMuted }]}>{t('advisor.actions.transfer.toAccount')}</Text>
                <View style={styles.modalChipRow}>
                  {(accountsQuery.data?.accounts ?? []).map((account) => (
                    <Pressable
                      key={`to-${account.id}`}
                      onPress={() => {
                        setTransferToAccountId(account.id);
                        setActionError(null);
                      }}
                    >
                      <Chip
                        dark={dark}
                        tone={transferToAccountId === account.id ? 'primary' : 'default'}
                        selected={transferToAccountId === account.id}
                        label={account.name}
                      />
                    </Pressable>
                  ))}
                </View>

                <TextField
                  keyboardType="numeric"
                  label={t('advisor.actions.common.amountLabel')}
                  onChangeText={(value) => {
                    setTransferAmountText(value.replace(/[^0-9.]/g, ''));
                    setActionError(null);
                  }}
                  placeholder={t('advisor.actions.common.amountPlaceholder')}
                  value={transferAmountText}
                />

                <TextField
                  label={t('advisor.actions.common.noteLabel')}
                  onChangeText={(value) => {
                    setTransferDescription(value);
                    setActionError(null);
                  }}
                  placeholder={t('advisor.actions.common.notePlaceholder')}
                  value={transferDescription}
                />

                {actionError ? <Text style={[styles.errorText, { color: theme.colors.expense }]}>{actionError}</Text> : null}
                {transferActionMutation.isError ? <Text style={[styles.errorText, { color: theme.colors.expense }]}>{apiErrorText(transferActionMutation.error)}</Text> : null}
                <View style={styles.modalButtons}>
                  <PrimaryButton label={t('common.cancel')} onPress={closeActionModal} />
                  <PrimaryButton
                    label={transferActionMutation.isPending ? t('common.loadingShort') : t('advisor.actions.transfer.submit')}
                    onPress={handleTransferAction}
                    loading={transferActionMutation.isPending}
                  />
                </View>
              </View>
            ) : null}
          </Card>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  header: {
    gap: spacing.xxs,
  },
  title: {
    ...typography.heading,
    fontSize: 28,
  },
  subtitle: {
    ...typography.body,
    fontSize: 14,
  },
  controlCard: {
    gap: spacing.sm,
  },
  monthControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  controlLabel: {
    ...typography.caption,
    fontSize: 12,
  },
  monthActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  monthText: {
    ...typography.subheading,
    fontSize: 15,
    minWidth: 136,
    textAlign: 'center',
  },
  iconButton: {
    borderRadius: radius.full,
    minHeight: 32,
    minWidth: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonPressed: {
    opacity: 0.7,
  },
  generatedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  generatedText: {
    ...typography.caption,
    fontSize: 11,
  },
  devModeWrap: {
    gap: spacing.xxs,
  },
  devModeRow: {
    alignItems: 'flex-start',
  },
  devModeText: {
    ...typography.caption,
    fontSize: 11,
  },
  debugCard: {
    gap: spacing.xs,
  },
  debugToggleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  debugTitle: {
    ...typography.subheading,
    fontSize: 14,
  },
  debugEventsWrap: {
    gap: spacing.xxs,
  },
  debugEventRow: {
    gap: 2,
  },
  debugEventName: {
    fontWeight: '700',
  },
  debugLine: {
    ...typography.caption,
    fontSize: 11,
  },
  tabsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  tab: {
    borderRadius: radius.full,
    borderWidth: 1,
    minHeight: 36,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabLabel: {
    ...typography.caption,
    fontWeight: '700',
  },
  sectionWrap: {
    gap: spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  panelCard: {
    gap: spacing.sm,
  },
  warningPanel: {
    borderWidth: 1,
  },
  detailsCard: {
    paddingVertical: spacing.xs,
  },
  detailsToggle: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  detailsToggleLabel: {
    ...typography.subheading,
    fontSize: 14,
  },
  panelTitle: {
    ...typography.subheading,
    fontSize: 14,
  },
  panelBodyText: {
    ...typography.body,
    lineHeight: 21,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderBottomWidth: 1,
    paddingBottom: spacing.xs,
  },
  rowLeft: {
    flex: 1,
    gap: spacing.xxs,
  },
  rowTitle: {
    ...typography.subheading,
    fontSize: 14,
  },
  rowHint: {
    ...typography.caption,
    fontSize: 11,
  },
  rowValue: {
    ...typography.subheading,
    fontSize: 14,
    textAlign: 'right',
  },
  trendWrap: {
    gap: spacing.sm,
  },
  trendItem: {
    gap: spacing.xxs,
  },
  trendMonth: {
    ...typography.caption,
    fontSize: 12,
  },
  trendBarTrack: {
    borderRadius: radius.full,
    height: 8,
    overflow: 'hidden',
  },
  trendBarIncome: {
    borderRadius: radius.full,
    height: 8,
  },
  trendBarExpense: {
    borderRadius: radius.full,
    height: 8,
  },
  trendAmountsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  trendAmountText: {
    ...typography.caption,
    fontWeight: '700',
  },
  profileCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  profileHeader: {
    gap: spacing.xs,
  },
  profileTitle: {
    ...typography.subheading,
    fontSize: 14,
  },
  profileBody: {
    ...typography.body,
    lineHeight: 20,
  },
  profileOptionsWrap: {
    gap: spacing.xxs,
  },
  profileOption: {
    ...typography.caption,
    lineHeight: 18,
  },
  tipCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  actionCard: {
    gap: spacing.sm,
  },
  actionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  actionTextWrap: {
    flex: 1,
    gap: spacing.xxs,
    paddingRight: spacing.sm,
  },
  actionTitle: {
    ...typography.subheading,
    fontSize: 14,
  },
  actionSubtitle: {
    ...typography.caption,
    fontSize: 12,
  },
  actionDivider: {
    height: 1,
  },
  footerCard: {
    paddingVertical: spacing.sm,
  },
  disclaimer: {
    ...typography.caption,
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
  },
  listWrap: {
    gap: spacing.sm,
  },
  listRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  listText: {
    ...typography.body,
    flex: 1,
    lineHeight: 21,
  },
  emptyText: {
    ...typography.body,
  },
  errorCard: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  errorTitle: {
    ...typography.subheading,
    textAlign: 'center',
  },
  errorText: {
    ...typography.body,
    textAlign: 'center',
  },
  inlineLoadingWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  inlineLoadingText: {
    ...typography.caption,
  },
  modalOverlay: {
    backgroundColor: 'rgba(0,0,0,0.42)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    gap: spacing.md,
    maxHeight: '86%',
    minHeight: '34%',
  },
  modalContent: {
    gap: spacing.sm,
  },
  modalTitle: {
    ...typography.subheading,
    fontSize: 18,
  },
  modalLabel: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  modalChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  modalButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  skeletonWrap: {
    gap: spacing.sm,
  },
  skeletonLarge: {
    borderRadius: radius.lg,
    height: 110,
  },
  skeletonMedium: {
    borderRadius: radius.lg,
    height: 92,
  },
  skeletonSmall: {
    borderRadius: radius.lg,
    height: 72,
  },
});
