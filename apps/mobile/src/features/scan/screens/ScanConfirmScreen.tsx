import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  recurringCreateInputSchema,
  transactionCreateInputSchema,
  upcomingPaymentCreateInputSchema,
  type UpcomingPaymentType,
} from '@mintly/shared';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@app/providers/AuthProvider';
import { apiClient } from '@core/api/client';
import { financeQueryKeys } from '@core/api/queryKeys';
import type { TransactionsStackParamList } from '@core/navigation/stacks/TransactionsStack';
import {
  listCategories,
  type ExpenseCategoryKey,
  type ListedCategory,
} from '@features/finance/categories/categoryCatalog';
import {
  rescheduleUpcomingPaymentNotifications,
} from '@features/finance/utils/notificationsForUpcomingPayment';
import {
  setUpcomingPaymentPreferredAccount,
} from '@features/finance/utils/upcomingPaymentAccountPreference';
import {
  AppIcon,
  Card,
  PrimaryButton,
  ScreenContainer,
  TextField,
} from '@shared/ui';
import { useI18n } from '@shared/i18n';
import { radius, spacing, typography, useTheme } from '@shared/theme';
import { apiErrorText } from '@shared/utils/apiErrorText';

import type { ParsedReceiptDraft, ScanCategoryHint, ScanClassification } from '../lib/ocrParsing';

const UPCOMING_TYPE_OPTIONS: UpcomingPaymentType[] = ['bill', 'rent', 'subscription', 'debt', 'other'];
const CLASSIFICATION_OPTIONS: Array<{ value: ScanClassification; labelKey: string }> = [
  { value: 'expense', labelKey: 'scan.confirm.classification.expense' },
  { value: 'bill', labelKey: 'scan.confirm.classification.bill' },
  { value: 'recurring', labelKey: 'scan.confirm.classification.recurring' },
];
const RECURRING_CADENCE_OPTIONS: Array<{ value: 'weekly' | 'monthly'; labelKey: string }> = [
  { value: 'weekly', labelKey: 'recurring.cadence.weekly' },
  { value: 'monthly', labelKey: 'recurring.cadence.monthly' },
];

type ExpenseCategoryOption = ListedCategory<ExpenseCategoryKey>;

function parseAmountInput(value: string): number | null {
  const normalized = value.replace(/\s+/g, '').replace(',', '.');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function toIsoAtNoon(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const iso = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(iso.getTime())) {
    return null;
  }

  return iso.toISOString();
}

function toIsoAtNoonOrNow(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    return new Date().toISOString();
  }

  return toIsoAtNoon(normalized) ?? new Date().toISOString();
}

function initialTitle(draft: ParsedReceiptDraft, fallback: string): string {
  if (draft.title.trim().length > 0) {
    return draft.title;
  }

  return fallback;
}

function includesAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

function normalizeCategoryText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9а-яё]+/giu, ' ')
    .trim();
}

function resolveCategoryDefaultValue(params: {
  options: ExpenseCategoryOption[];
  hint: ScanCategoryHint;
  paymentType: UpcomingPaymentType;
  rawText: string;
}): string {
  const { options, hint, paymentType, rawText } = params;

  if (options.length === 0) {
    return '';
  }

  const normalizedRawText = normalizeCategoryText(rawText);
  const available = new Set<ExpenseCategoryKey>(options.map((option) => option.key));

  const firstAvailable = (keys: ExpenseCategoryKey[]): ExpenseCategoryKey | null => {
    for (const key of keys) {
      if (available.has(key)) {
        return key;
      }
    }
    return null;
  };

  if (paymentType === 'rent') {
    return firstAvailable(['rent', 'other_expense']) ?? '';
  }
  if (paymentType === 'subscription') {
    return firstAvailable(['subscriptions', 'other_expense']) ?? '';
  }
  if (paymentType === 'debt') {
    return firstAvailable(['debt', 'other_expense']) ?? '';
  }
  if (hint === 'fuel') {
    return firstAvailable(['transport', 'other_expense']) ?? '';
  }
  if (hint === 'grocery') {
    return firstAvailable(['groceries', 'other_expense']) ?? '';
  }

  if (includesAny(normalizedRawText, ['rent', 'kira', 'аренд'])) {
    return firstAvailable(['rent', 'other_expense']) ?? '';
  }
  if (includesAny(normalizedRawText, ['fuel', 'akaryakit', 'benzin', 'diesel', 'transport', 'ulasim'])) {
    return firstAvailable(['transport', 'other_expense']) ?? '';
  }
  if (includesAny(normalizedRawText, ['market', 'grocery', 'food', 'gida', 'yemek', 'продукт'])) {
    return firstAvailable(['groceries', 'dining', 'other_expense']) ?? '';
  }
  if (includesAny(normalizedRawText, ['subscription', 'abonelik', 'netflix', 'spotify'])) {
    return firstAvailable(['subscriptions', 'other_expense']) ?? '';
  }

  return firstAvailable(['other_expense']) ?? options[0]?.key ?? '';
}

export function ScanConfirmScreen() {
  const route = useRoute<RouteProp<TransactionsStackParamList, 'ScanConfirm'>>();
  const { withAuth, user } = useAuth();
  const queryClient = useQueryClient();
  const { theme, mode } = useTheme();
  const { t, locale } = useI18n();

  const [title, setTitle] = useState(initialTitle(route.params.draft, t('scan.confirm.defaults.title')));
  const [amount, setAmount] = useState(route.params.draft.amount);
  const [occurredDate, setOccurredDate] = useState(route.params.draft.occurredDate);
  const [dueDate, setDueDate] = useState(route.params.draft.dueDate ?? '');
  const [classification, setClassification] = useState<ScanClassification>(route.params.draft.classificationHint);
  const [paymentType, setPaymentType] = useState<UpcomingPaymentType>(route.params.draft.upcomingType);
  const [recurringCadence, setRecurringCadence] = useState<'weekly' | 'monthly'>(
    route.params.draft.upcomingType === 'subscription' || route.params.draft.upcomingType === 'rent'
      ? 'monthly'
      : 'weekly',
  );
  const [recurringStartDate, setRecurringStartDate] = useState(route.params.draft.dueDate ?? route.params.draft.occurredDate);
  const [recurringEndDate, setRecurringEndDate] = useState('');
  const [accountId, setAccountId] = useState('');
  const [categoryValue, setCategoryValue] = useState('');
  const [categoryTouched, setCategoryTouched] = useState(false);

  const dark = mode === 'dark';
  const baseCurrency = user?.baseCurrency ?? 'TRY';

  const accountsQuery = useQuery({
    queryKey: financeQueryKeys.accounts.list(),
    queryFn: () => withAuth((token) => apiClient.getAccounts(token)),
  });

  const categoryOptions = useMemo(
    () => listCategories('expense', locale),
    [locale],
  );

  const selectedCategoryOption = useMemo(
    () => categoryOptions.find((item) => item.key === categoryValue) ?? null,
    [categoryOptions, categoryValue],
  );

  useEffect(() => {
    if (accountId) {
      return;
    }

    const firstAccount = accountsQuery.data?.accounts[0];
    if (firstAccount) {
      setAccountId(firstAccount.id);
    }
  }, [accountId, accountsQuery.data?.accounts]);

  useEffect(() => {
    if (categoryOptions.length === 0) {
      return;
    }

    if (categoryTouched && categoryValue) {
      return;
    }

    const nextValue = resolveCategoryDefaultValue({
      options: categoryOptions,
      hint: route.params.draft.categoryHint,
      paymentType,
      rawText: route.params.rawText,
    });

    if (nextValue && nextValue !== categoryValue) {
      setCategoryValue(nextValue);
    }
  }, [
    categoryOptions,
    categoryTouched,
    categoryValue,
    paymentType,
    route.params.draft.categoryHint,
    route.params.rawText,
  ]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const parsedAmount = parseAmountInput(amount);
      if (!parsedAmount) {
        throw new Error('errors.scan.invalidAmount');
      }

      if (!accountId) {
        throw new Error('errors.validation.selectAccount');
      }

      const cleanTitle = title.trim().length > 0 ? title.trim() : t('scan.confirm.defaults.title');

      if (classification === 'bill') {
        const dueDateIso = toIsoAtNoon(dueDate);
        if (!dueDateIso) {
          throw new Error('errors.scan.invalidDueDate');
        }

        const createdUpcomingPayment = await withAuth((token) =>
          apiClient.createUpcomingPayment(
            upcomingPaymentCreateInputSchema.parse({
              title: cleanTitle,
              type: paymentType,
              amount: parsedAmount,
              currency: baseCurrency,
              dueDate: dueDateIso,
              source: 'ocr',
              meta: {
                rawText: route.params.rawText,
                detectedCurrency: route.params.draft.detectedCurrency ?? undefined,
              },
            }),
            token,
          ),
        );

        await setUpcomingPaymentPreferredAccount(createdUpcomingPayment.id, accountId);

        await rescheduleUpcomingPaymentNotifications({
          upcomingPaymentId: createdUpcomingPayment.id,
          title: createdUpcomingPayment.title,
          dueDateIso: createdUpcomingPayment.dueDate,
          amount: createdUpcomingPayment.amount,
          currency: createdUpcomingPayment.currency,
          locale,
        });

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: financeQueryKeys.upcomingPayments.all() }),
          queryClient.invalidateQueries({ queryKey: financeQueryKeys.dashboard.recent() }),
        ]);

        return {
          mode: 'upcoming' as const,
        };
      }

      if (!selectedCategoryOption) {
        throw new Error('errors.validation.selectCategory');
      }

      if (classification === 'recurring') {
        const startAtIso = toIsoAtNoon(recurringStartDate);
        if (!startAtIso) {
          throw new Error('errors.scan.invalidDate');
        }

        const startAtDate = new Date(startAtIso);
        const endAtIso = recurringEndDate.trim().length > 0 ? toIsoAtNoon(recurringEndDate) : null;

        if (recurringEndDate.trim().length > 0 && !endAtIso) {
          throw new Error('errors.scan.invalidDueDate');
        }

        if (endAtIso && new Date(endAtIso).getTime() < startAtDate.getTime()) {
          throw new Error('errors.scan.invalidDueDate');
        }

        const recurringPayload = recurringCreateInputSchema.parse({
          kind: 'normal',
          type: 'expense',
          accountId,
          categoryKey: selectedCategoryOption.key,
          amount: parsedAmount,
          cadence: recurringCadence,
          dayOfWeek: recurringCadence === 'weekly' ? startAtDate.getUTCDay() : undefined,
          dayOfMonth: recurringCadence === 'monthly' ? Math.min(28, startAtDate.getUTCDate()) : undefined,
          startAt: startAtIso,
          endAt: endAtIso ?? undefined,
          description: cleanTitle,
        });

        await withAuth((token) => apiClient.createRecurring(recurringPayload, token));

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: financeQueryKeys.recurring.all() }),
          queryClient.invalidateQueries({ queryKey: financeQueryKeys.dashboard.recent() }),
          queryClient.invalidateQueries({ queryKey: financeQueryKeys.transactions.all() }),
        ]);

        return {
          mode: 'recurring' as const,
        };
      }

      const occurredAtIso = toIsoAtNoonOrNow(occurredDate);

      await withAuth((token) =>
        apiClient.createTransaction(
          transactionCreateInputSchema.parse({
            accountId,
            categoryKey: selectedCategoryOption.key,
            type: 'expense',
            amount: parsedAmount,
            currency: baseCurrency,
            description: cleanTitle,
            occurredAt: occurredAtIso,
          }),
          token,
        ),
      );

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: financeQueryKeys.transactions.all() }),
        queryClient.invalidateQueries({ queryKey: financeQueryKeys.dashboard.recent() }),
        queryClient.invalidateQueries({ queryKey: financeQueryKeys.analytics.all() }),
        queryClient.invalidateQueries({ queryKey: financeQueryKeys.budgets.all() }),
      ]);

      return {
        mode: 'transaction' as const,
      };
    },
    onSuccess: (result) => {
      Alert.alert(t('scan.confirm.success.title'), t(`scan.confirm.success.${result.mode}`));
    },
    onError: (error) => {
      const normalized = error instanceof Error ? error.message : '';
      if (normalized.startsWith('errors.')) {
        Alert.alert(t('common.error'), t(normalized));
        return;
      }

      Alert.alert(t('common.error'), apiErrorText(error));
    },
  });

  if (accountsQuery.isLoading) {
    return (
      <ScreenContainer dark={dark}>
        <Card dark={dark} style={styles.stateCard}>
          <ActivityIndicator color={theme.colors.primary} size="large" />
          <Text style={[styles.stateText, { color: theme.colors.textMuted }]}>
            {t('scan.confirm.state.loading')}
          </Text>
        </Card>
      </ScreenContainer>
    );
  }

  if (accountsQuery.isError) {
    const error = accountsQuery.error;

    return (
      <ScreenContainer dark={dark}>
        <Card dark={dark} style={styles.errorCard}>
          <Text style={[styles.errorTitle, { color: theme.colors.text }]}>{t('scan.confirm.state.loadErrorTitle')}</Text>
          <Text style={[styles.errorText, { color: theme.colors.expense }]}>{apiErrorText(error)}</Text>
          <PrimaryButton
            label={t('common.retry')}
            onPress={() => {
              void accountsQuery.refetch();
            }}
          />
        </Card>
      </ScreenContainer>
    );
  }

  const submitLabelKey =
    classification === 'bill'
      ? 'scan.confirm.actions.createUpcoming'
      : classification === 'recurring'
        ? 'scan.confirm.actions.createRecurring'
        : 'scan.confirm.actions.createTransaction';

  return (
    <ScreenContainer dark={dark}>
      <View style={styles.container}>
        <Card dark={dark} style={styles.previewCard}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{t('scan.confirm.previewTitle')}</Text>
          <Image source={{ uri: route.params.photoUri }} style={styles.previewImage} />

          {route.params.draft.currencyWarning ? (
            <View
              style={[
                styles.warningBox,
                {
                  backgroundColor: dark ? 'rgba(251, 146, 60, 0.15)' : '#FFF7ED',
                  borderColor: dark ? 'rgba(251, 146, 60, 0.35)' : '#FDBA74',
                },
              ]}
            >
              <Text style={[styles.warningText, { color: dark ? '#FDBA74' : '#C2410C' }]}> 
                {t('scan.confirm.currencyWarning', {
                  detected: route.params.draft.detectedCurrency ?? '-',
                  base: baseCurrency,
                })}
              </Text>
            </View>
          ) : null}

          {__DEV__ ? (
            <Text style={[styles.modeText, { color: theme.colors.textMuted }]}> 
              {t(`scan.confirm.ocrMode.${route.params.ocrMode}`)}
            </Text>
          ) : null}
        </Card>

        <Card dark={dark} style={styles.formCard}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{t('scan.confirm.formTitle')}</Text>

          <View style={styles.classificationWrap}>
            <Text style={[styles.fieldLabel, { color: theme.colors.labelMuted }]}>
              {t('scan.confirm.fields.classification')}
            </Text>
            <View style={styles.classificationRow}>
              {CLASSIFICATION_OPTIONS.map((option) => {
                const selected = classification === option.value;

                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="button"
                    onPress={() => setClassification(option.value)}
                    style={[
                      styles.classificationChip,
                      {
                        borderColor: selected ? theme.colors.primary : theme.colors.border,
                        backgroundColor: selected
                          ? dark
                            ? 'rgba(47, 107, 255, 0.20)'
                            : '#EAF0FF'
                          : dark
                            ? '#121826'
                            : '#FFFFFF',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.classificationChipLabel,
                        { color: selected ? theme.colors.primary : theme.colors.textMuted },
                      ]}
                    >
                      {t(option.labelKey)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <TextField
            label={t('scan.confirm.fields.title')}
            value={title}
            onChangeText={setTitle}
            placeholder={t('scan.confirm.fields.titlePlaceholder')}
            autoCapitalize="words"
          />

          <TextField
            label={t('scan.confirm.fields.amount')}
            value={amount}
            onChangeText={setAmount}
            placeholder={t('scan.confirm.fields.amountPlaceholder')}
            keyboardType="decimal-pad"
          />

          {classification === 'expense' ? (
            <TextField
              label={t('scan.confirm.fields.date')}
              value={occurredDate}
              onChangeText={setOccurredDate}
              placeholder={t('scan.confirm.fields.datePlaceholder')}
              autoCapitalize="none"
            />
          ) : null}

          {classification === 'bill' ? (
            <>
              <TextField
                label={t('scan.confirm.fields.dueDate')}
                value={dueDate}
                onChangeText={setDueDate}
                placeholder={t('scan.confirm.fields.dueDatePlaceholder')}
                autoCapitalize="none"
              />

              <View style={styles.typeRowWrap}>
                <Text style={[styles.fieldLabel, { color: theme.colors.labelMuted }]}> 
                  {t('scan.confirm.fields.type')}
                </Text>
                <View style={styles.typeRow}>
                  {UPCOMING_TYPE_OPTIONS.map((option) => {
                    const selected = option === paymentType;

                    return (
                      <Pressable
                        key={`bill-${option}`}
                        accessibilityRole="button"
                        onPress={() => setPaymentType(option)}
                        style={[
                          styles.typeChip,
                          {
                            borderColor: selected ? theme.colors.primary : theme.colors.border,
                            backgroundColor: selected
                              ? dark
                                ? 'rgba(47, 107, 255, 0.20)'
                                : '#EAF0FF'
                              : dark
                                ? '#121826'
                                : '#FFFFFF',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.typeChipLabel,
                            { color: selected ? theme.colors.primary : theme.colors.textMuted },
                          ]}
                        >
                          {t(`scan.confirm.types.${option}`)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </>
          ) : null}

          {classification === 'recurring' ? (
            <>
              <View style={styles.typeRowWrap}>
                <Text style={[styles.fieldLabel, { color: theme.colors.labelMuted }]}> 
                  {t('scan.confirm.fields.type')}
                </Text>
                <View style={styles.typeRow}>
                  {UPCOMING_TYPE_OPTIONS.map((option) => {
                    const selected = option === paymentType;

                    return (
                      <Pressable
                        key={`recurring-type-${option}`}
                        accessibilityRole="button"
                        onPress={() => setPaymentType(option)}
                        style={[
                          styles.typeChip,
                          {
                            borderColor: selected ? theme.colors.primary : theme.colors.border,
                            backgroundColor: selected
                              ? dark
                                ? 'rgba(47, 107, 255, 0.20)'
                                : '#EAF0FF'
                              : dark
                                ? '#121826'
                                : '#FFFFFF',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.typeChipLabel,
                            { color: selected ? theme.colors.primary : theme.colors.textMuted },
                          ]}
                        >
                          {t(`scan.confirm.types.${option}`)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.typeRowWrap}>
                <Text style={[styles.fieldLabel, { color: theme.colors.labelMuted }]}>
                  {t('scan.confirm.fields.frequency')}
                </Text>
                <View style={styles.typeRow}>
                  {RECURRING_CADENCE_OPTIONS.map((option) => {
                    const selected = option.value === recurringCadence;

                    return (
                      <Pressable
                        key={option.value}
                        accessibilityRole="button"
                        onPress={() => setRecurringCadence(option.value)}
                        style={[
                          styles.typeChip,
                          {
                            borderColor: selected ? theme.colors.primary : theme.colors.border,
                            backgroundColor: selected
                              ? dark
                                ? 'rgba(47, 107, 255, 0.20)'
                                : '#EAF0FF'
                              : dark
                                ? '#121826'
                                : '#FFFFFF',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.typeChipLabel,
                            { color: selected ? theme.colors.primary : theme.colors.textMuted },
                          ]}
                        >
                          {t(option.labelKey)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <TextField
                label={t('scan.confirm.fields.startDate')}
                value={recurringStartDate}
                onChangeText={setRecurringStartDate}
                placeholder={t('scan.confirm.fields.startDatePlaceholder')}
                autoCapitalize="none"
              />

              <TextField
                label={t('scan.confirm.fields.endDate')}
                value={recurringEndDate}
                onChangeText={setRecurringEndDate}
                placeholder={t('scan.confirm.fields.endDatePlaceholder')}
                autoCapitalize="none"
              />
            </>
          ) : null}

          <View style={styles.accountWrap}>
            <Text style={[styles.fieldLabel, { color: theme.colors.labelMuted }]}> 
              {t('scan.confirm.fields.account')}
            </Text>
            <View style={styles.accountRow}>
              {(accountsQuery.data?.accounts ?? []).map((account) => {
                const selected = accountId === account.id;

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
                          ? dark
                            ? 'rgba(47, 107, 255, 0.20)'
                            : '#EAF0FF'
                          : dark
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
          </View>

          <View style={styles.accountWrap}>
            <Text style={[styles.fieldLabel, { color: theme.colors.labelMuted }]}> 
              {t('scan.confirm.fields.category')}
            </Text>
            <View style={styles.accountRow}>
              {categoryOptions.map((category) => {
                const selected = categoryValue === category.key;

                return (
                  <Pressable
                    key={category.key}
                    accessibilityRole="button"
                    onPress={() => {
                      setCategoryTouched(true);
                      setCategoryValue(category.key);
                    }}
                    style={[
                      styles.categoryChip,
                      {
                        borderColor: selected ? theme.colors.primary : theme.colors.border,
                        backgroundColor: selected
                          ? dark
                            ? 'rgba(47, 107, 255, 0.20)'
                            : '#EAF0FF'
                          : dark
                            ? '#121826'
                            : '#FFFFFF',
                      },
                    ]}
                  >
                    <AppIcon name={category.icon} size="sm" tone={selected ? 'primary' : 'muted'} />
                    <Text style={[styles.categoryChipLabel, { color: selected ? theme.colors.primary : theme.colors.text }]}> 
                      {category.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View
            style={[
              styles.currencyField,
              {
                borderColor: theme.colors.border,
                backgroundColor: dark ? '#121826' : '#F8FAFF',
              },
            ]}
          >
            <Text style={[styles.currencyLabel, { color: theme.colors.labelMuted }]}> 
              {t('scan.confirm.fields.currency')}
            </Text>
            <Text style={[styles.currencyValue, { color: theme.colors.text }]}>{baseCurrency}</Text>
          </View>

          <PrimaryButton
            disabled={submitMutation.isPending}
            label={t(submitLabelKey)}
            loading={submitMutation.isPending}
            onPress={() => {
              void submitMutation.mutateAsync();
            }}
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
  previewCard: {
    gap: spacing.xs,
  },
  formCard: {
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.subheading,
    fontSize: 18,
    fontWeight: '700',
  },
  previewImage: {
    borderRadius: radius.md,
    height: 200,
    width: '100%',
  },
  warningBox: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  warningText: {
    ...typography.caption,
    fontSize: 12,
  },
  modeText: {
    ...typography.caption,
    fontSize: 11,
  },
  fieldLabel: {
    ...typography.caption,
    fontWeight: '700',
    marginBottom: spacing.xxs,
  },
  classificationWrap: {
    gap: spacing.xxs,
  },
  classificationRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  classificationChip: {
    borderRadius: radius.md,
    borderWidth: 1,
    minHeight: 36,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  classificationChipLabel: {
    ...typography.caption,
    fontWeight: '700',
  },
  typeRowWrap: {
    gap: spacing.xxs,
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  typeChip: {
    borderRadius: radius.md,
    borderWidth: 1,
    minHeight: 36,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  typeChipLabel: {
    ...typography.caption,
    fontWeight: '700',
  },
  accountWrap: {
    gap: spacing.xxs,
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
  categoryChip: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xxs,
    minHeight: 36,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  categoryChipLabel: {
    ...typography.caption,
    fontWeight: '700',
  },
  currencyField: {
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  currencyLabel: {
    ...typography.caption,
    fontSize: 11,
  },
  currencyValue: {
    ...typography.subheading,
    fontSize: 16,
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
});
