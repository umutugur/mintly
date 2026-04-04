import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, InteractionManager, Keyboard, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import { transactionCreateInputSchema, type TransactionType } from '@mintly/shared';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { useAuth } from '@app/providers/AuthProvider';
import { apiClient } from '@core/api/client';
import { financeQueryKeys } from '@core/api/queryKeys';
import type { AddStackParamList } from '@core/navigation/stacks/AddStack';
import { listCategories } from '@features/finance/categories/categoryCatalog';
import { AppIcon, Card, PrimaryButton, ScreenContainer, TextField, showAlert } from '@shared/ui';
import { useI18n } from '@shared/i18n';
import { radius, spacing, typography, useTheme } from '@shared/theme';
import { apiErrorText } from '@shared/utils/apiErrorText';
import { monthFromIsoString } from '@shared/utils/month';

// stitch asset: stitch/export/stitch_ana_ekran_dashboard/grup_harcaması_ekle_(dark)/screen.png
// no touch/keyboard behavior changed by this PR.

const typeOptions: TransactionType[] = ['income', 'expense'];
const CURRENCY_SYMBOL_BY_CODE: Record<string, string> = {
  TRY: '₺',
  USD: '$',
  EUR: '€',
  GBP: '£',
  STG: '£',
};

function resolveCurrencySymbol(currencyCode: string): string {
  const normalized = currencyCode.trim().toUpperCase();
  return CURRENCY_SYMBOL_BY_CODE[normalized] ?? normalized;
}

function formatOccurredAt(isoString: string, locale: string): string {
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return isoString;
  const lang = locale === 'tr' ? 'tr-TR' : locale === 'ru' ? 'ru-RU' : 'en-US';
  return d.toLocaleString(lang, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function dismissKeyboardSafely(): void {
  Keyboard.dismiss();
  InteractionManager.runAfterInteractions(() => {
    Keyboard.dismiss();
  });
  setTimeout(() => {
    Keyboard.dismiss();
  }, 0);
}

function toTimeInput(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function buildIsoFromCal(year: number, month: number, day: number, timePart: string): string | null {
  const tp = timePart.trim() || '00:00';
  const tParts = tp.split(':');
  const hour = Number(tParts[0] ?? 0);
  const minute = Number(tParts[1] ?? 0);
  if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  const d = new Date(year, month, day, hour, minute, 0, 0);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

function buildCalendarWeeks(year: number, month: number): (number | null)[][] {
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // 0=Mon
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

const transactionFormSchema = z.object({
  type: z.enum(typeOptions),
  accountId: z.string().trim().min(1, 'errors.validation.selectAccount'),
  categoryKey: z.string().trim().min(1, 'errors.validation.selectCategory'),
  amount: z
    .string()
    .trim()
    .min(1, 'errors.validation.amountRequired')
    .refine((value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0;
    }, 'errors.validation.amountPositive'),
  description: z.string().trim().max(500).optional(),
  occurredAt: z
    .string()
    .trim()
    .min(1, 'errors.validation.dateTimeRequired')
    .refine((value) => !Number.isNaN(Date.parse(value)), 'errors.validation.invalidIsoDateTime'),
});

type TransactionFormValues = z.infer<typeof transactionFormSchema>;

export function AddTransactionScreen() {
  const { withAuth } = useAuth();
  const { theme, mode } = useTheme();
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const route = useRoute<RouteProp<AddStackParamList, 'AddTransaction'>>();
  const navigation = useNavigation();
  const lastPrefillSignatureRef = useRef('');
  const [dateModalVisible, setDateModalVisible] = useState(false);
  const [calViewYear, setCalViewYear] = useState(() => new Date().getFullYear());
  const [calViewMonthIdx, setCalViewMonthIdx] = useState(() => new Date().getMonth());
  const [calSelectedDay, setCalSelectedDay] = useState<number | null>(null);
  const [modalTimeInput, setModalTimeInput] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);

  const accountsQuery = useQuery({
    queryKey: financeQueryKeys.accounts.list(),
    queryFn: () => withAuth((token) => apiClient.getAccounts(token)),
  });

  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: {
      type: 'income',
      accountId: '',
      categoryKey: '',
      amount: '',
      description: '',
      occurredAt: new Date().toISOString(),
    },
  });

  const selectedType = form.watch('type');
  const selectedAccountId = form.watch('accountId');
  const selectedCategoryValue = form.watch('categoryKey');

  const selectedAccount = useMemo(
    () =>
      accountsQuery.data?.accounts.find(
        (account) => account.id === selectedAccountId && account.type !== 'loan',
      ) ?? null,
    [accountsQuery.data?.accounts, selectedAccountId],
  );

  const categoryOptions = useMemo(
    () => listCategories(selectedType, locale),
    [locale, selectedType],
  );

  const selectedCategory = useMemo(
    () => categoryOptions.find((option) => option.key === selectedCategoryValue) ?? null,
    [categoryOptions, selectedCategoryValue],
  );
  const selectedCurrency = selectedAccount?.currency?.toUpperCase() ?? null;

  useEffect(() => {
    if (!selectedCategoryValue) {
      return;
    }

    const exists = categoryOptions.some((category) => category.key === selectedCategoryValue);
    if (!exists) {
      form.setValue('categoryKey', '');
    }
  }, [categoryOptions, form, selectedCategoryValue]);

  useEffect(() => {
    const prefill = route.params?.prefill;
    if (!prefill) {
      return;
    }

    const signature = `${prefill.amount ?? ''}|${prefill.description ?? ''}|${prefill.occurredAt ?? ''}`;
    if (lastPrefillSignatureRef.current === signature) {
      return;
    }

    if (prefill.amount) {
      form.setValue('amount', prefill.amount, { shouldValidate: true });
    }
    if (prefill.description) {
      form.setValue('description', prefill.description);
    }
    if (prefill.occurredAt) {
      form.setValue('occurredAt', prefill.occurredAt, { shouldValidate: true });
    }

    lastPrefillSignatureRef.current = signature;
    (navigation as { setParams?: (params: AddStackParamList['AddTransaction']) => void }).setParams?.({
      prefill: undefined,
    });
  }, [form, navigation, route.params?.prefill]);

  const createTransactionMutation = useMutation({
    mutationFn: (values: TransactionFormValues) => {
      const amount = Number(values.amount);
      const occurredAt = new Date(values.occurredAt).toISOString();
      const categoryKey = selectedCategory?.key ?? values.categoryKey;

      if (!categoryKey) {
        throw new Error(t('errors.validation.selectCategory'));
      }

      const payload = transactionCreateInputSchema.parse({
        type: values.type,
        accountId: values.accountId,
        categoryKey,
        amount,
        currency: selectedAccount?.currency ?? 'TRY',
        description: values.description?.trim() || undefined,
        occurredAt,
      });

      return withAuth((token) =>
        apiClient.createTransaction(payload, token),
      );
    },
    onSuccess: async (_, values) => {
      const transactionMonth = monthFromIsoString(values.occurredAt);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: financeQueryKeys.transactions.all() }),
        queryClient.invalidateQueries({ queryKey: financeQueryKeys.budgets.month(transactionMonth) }),
        queryClient.invalidateQueries({ queryKey: financeQueryKeys.analytics.month(transactionMonth) }),
        queryClient.invalidateQueries({ queryKey: financeQueryKeys.dashboard.recent() }),
      ]);

      dismissKeyboardSafely();

      form.reset({
        type: 'expense',
        accountId: '',
        categoryKey: '',
        amount: '',
        description: '',
        occurredAt: new Date().toISOString(),
      });

      await showAlert(t('transactions.create.successTitle'), t('transactions.create.successMessage'));
      dismissKeyboardSafely();
    },
    onError: (error) => {
      showAlert(t('errors.transaction.createFailedTitle'), apiErrorText(error));
    },
  });

  if (accountsQuery.isLoading) {
    return (
      <ScreenContainer
        dark={mode === 'dark'}
        safeAreaEdges={['left', 'right']}
        contentStyle={styles.screenContent}
      >
        <Card dark={mode === 'dark'} style={styles.stateCard}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={[styles.stateText, { color: theme.colors.textMuted }]}>
            {t('transactions.create.state.loading')}
          </Text>
        </Card>
      </ScreenContainer>
    );
  }

  if (accountsQuery.isError) {
    const error = accountsQuery.error;

    return (
      <ScreenContainer
        dark={mode === 'dark'}
        safeAreaEdges={['left', 'right']}
        contentStyle={styles.screenContent}
      >
        <Card dark={mode === 'dark'} style={styles.errorCard}>
          <Text style={[styles.errorTitle, { color: theme.colors.text }]}>
            {t('transactions.create.state.loadErrorTitle')}
          </Text>
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

  const dark = mode === 'dark';
  const accounts = (accountsQuery.data?.accounts ?? []).filter((account) => account.type !== 'loan');
  const panelBg = dark ? '#121826' : theme.colors.surface;
  const panelBorder = dark ? '#27344F' : theme.colors.border;
  const localeStr = locale === 'tr' ? 'tr-TR' : locale === 'ru' ? 'ru-RU' : 'en-US';
  const calDayNames = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(localeStr, { weekday: 'short' }).format(new Date(2026, 0, 5 + i)),
  );
  const calWeeks = buildCalendarWeeks(calViewYear, calViewMonthIdx);
  const todayStr = new Date().toDateString();

  return (
    <ScreenContainer dark={dark} safeAreaEdges={['left', 'right']} contentStyle={styles.screenContent}>
      <View style={styles.container}>
        <Card
          dark={dark}
          style={[
            styles.heroCard,
            {
              backgroundColor: panelBg,
              borderColor: panelBorder,
            },
          ]}
        >
          <Text style={[styles.heroTitle, { color: theme.colors.text }]}>{t('transactions.create.title')}</Text>
          <Text style={[styles.heroSubtitle, { color: theme.colors.textMuted }]}>
            {t('transactions.create.subtitle')}
          </Text>

          <View style={styles.segmentWrap}>
            <Controller
              control={form.control}
              name="type"
              render={({ field: { value, onChange } }) => (
                <View style={[styles.segment, { backgroundColor: dark ? '#0E1523' : '#EEF3FB' }]}>
                  {typeOptions.map((option) => {
                    const active = option === value;
                    const tone = option === 'income' ? '#17B26A' : '#F04438';

                    return (
                      <Pressable
                        key={option}
                        accessibilityRole="button"
                        onPress={() => onChange(option)}
                        style={[
                          styles.segmentButton,
                          active
                            ? {
                                backgroundColor: dark ? '#1A2336' : '#FFFFFF',
                                borderColor: tone,
                              }
                            : null,
                        ]}
                      >
                        <Text
                          style={[
                            styles.segmentButtonText,
                            { color: active ? tone : theme.colors.textMuted },
                          ]}
                        >
                          {option === 'income' ? t('analytics.income') : t('analytics.expense')}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            />
          </View>
        </Card>

        <Card
          dark={dark}
          style={[
            styles.formCard,
            {
              backgroundColor: panelBg,
              borderColor: panelBorder,
            },
          ]}
        >
          <View style={styles.sectionHead}>
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
              {t('transactions.create.sections.details')}
            </Text>
            <Text style={[styles.sectionSubtitle, { color: theme.colors.textMuted }]}>
              {t('transactions.create.sections.step')}
            </Text>
          </View>

          <Text style={[styles.fieldLabel, { color: theme.colors.labelMuted }]}>
            {t('transactions.create.fields.account')}
          </Text>
          <Controller
            control={form.control}
            name="accountId"
            render={({ field: { value, onChange } }) => (
              <View style={styles.choiceWrap}>
                {accounts.map((account) => {
                  const selected = value === account.id;

                  return (
                    <Pressable
                      key={account.id}
                      accessibilityRole="button"
                      onPress={() => onChange(account.id)}
                      style={[
                        styles.choiceChip,
                        {
                          borderColor: selected ? theme.colors.primary : panelBorder,
                          backgroundColor: selected
                            ? dark
                              ? 'rgba(47, 107, 255, 0.20)'
                              : '#EAF0FF'
                            : dark
                              ? '#0E1523'
                              : '#F8FBFF',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.choiceChipLabel,
                          { color: selected ? theme.colors.primary : theme.colors.textMuted },
                        ]}
                      >
                        {account.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          />
          {form.formState.errors.accountId ? (
            <Text style={[styles.inlineError, { color: theme.colors.expense }]}>
              {t(form.formState.errors.accountId.message ?? '')}
            </Text>
          ) : null}

          <Text style={[styles.fieldLabel, { color: theme.colors.labelMuted }]}>
            {t('transactions.create.fields.category')}
          </Text>
          <Controller
            control={form.control}
            name="categoryKey"
            render={({ field: { value, onChange } }) => (
              <View style={styles.categoryGrid}>
                {categoryOptions.map((category) => {
                  const selected = value === category.key;

                  return (
                    <Pressable
                      key={category.key}
                      accessibilityRole="button"
                      onPress={() => onChange(category.key)}
                      style={[
                        styles.categoryChip,
                        {
                          borderColor: selected ? theme.colors.primary : panelBorder,
                          backgroundColor: selected
                            ? dark
                              ? 'rgba(47, 107, 255, 0.20)'
                              : '#EAF0FF'
                            : dark
                              ? '#0E1523'
                              : '#F8FBFF',
                        },
                      ]}
                    >
                      <AppIcon
                        name={category.icon}
                        size="md"
                        color={selected ? theme.colors.primary : theme.colors.textMuted}
                      />
                      <Text
                        numberOfLines={2}
                        style={[
                          styles.categoryChipLabel,
                          { color: selected ? theme.colors.primary : theme.colors.textMuted },
                        ]}
                      >
                        {category.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          />
          {form.formState.errors.categoryKey ? (
            <Text style={[styles.inlineError, { color: theme.colors.expense }]}>
              {t(form.formState.errors.categoryKey.message ?? '')}
            </Text>
          ) : null}

          <Controller
            control={form.control}
            name="amount"
            render={({ field: { value, onChange, onBlur } }) => (
              <TextField
                autoCapitalize="none"
                error={form.formState.errors.amount?.message ? t(form.formState.errors.amount.message) : undefined}
                keyboardType="decimal-pad"
                label={t('transactions.create.fields.amount')}
                leftAdornment={
                  <View style={styles.amountAdornmentWrap}>
                    <Text style={[styles.adornmentText, { color: theme.colors.textMuted }]}>
                      {selectedCurrency ? resolveCurrencySymbol(selectedCurrency) : '—'}
                    </Text>
                  </View>
                }
                rightAdornment={
                  selectedCurrency ? (
                    <Text style={[styles.amountCurrencyCode, { color: theme.colors.textMuted }]}>
                      {selectedCurrency}
                    </Text>
                  ) : undefined
                }
                onBlur={onBlur}
                onChangeText={onChange}
                placeholder={t('transactions.create.fields.amountPlaceholder')}
                value={value}
              />
            )}
          />

          <Controller
            control={form.control}
            name="description"
            render={({ field: { value, onChange, onBlur } }) => (
              <TextField
                autoCapitalize="sentences"
                label={t('transactions.create.fields.description')}
                onBlur={onBlur}
                onChangeText={onChange}
                placeholder={t('transactions.create.fields.descriptionPlaceholder')}
                value={value ?? ''}
              />
            )}
          />

          <Controller
            control={form.control}
            name="occurredAt"
            render={({ field: { value, onChange } }) => (
              <>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    const d = new Date(value);
                    const validD = isNaN(d.getTime()) ? new Date() : d;
                    setCalViewYear(validD.getFullYear());
                    setCalViewMonthIdx(validD.getMonth());
                    setCalSelectedDay(validD.getDate());
                    setModalTimeInput(toTimeInput(validD.toISOString()));
                    setModalError(null);
                    setDateModalVisible(true);
                  }}
                  style={[
                    styles.datePickerRow,
                    {
                      borderColor: form.formState.errors.occurredAt ? theme.colors.expense : panelBorder,
                      backgroundColor: dark ? '#0E1523' : '#F8FBFF',
                    },
                  ]}
                >
                  <View style={styles.datePickerLeft}>
                    <Text style={[styles.datePickerLabel, { color: theme.colors.labelMuted }]}>
                      {t('transactions.create.fields.occurredAt')}
                    </Text>
                    <Text style={[styles.datePickerValue, { color: theme.colors.text }]}>
                      {formatOccurredAt(value, locale)}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() => onChange(new Date().toISOString())}
                    style={styles.nowButton}
                  >
                    <Text style={[styles.nowButtonText, { color: theme.colors.primary }]}>
                      {t('common.now')}
                    </Text>
                  </Pressable>
                </Pressable>

                <Modal
                  animationType="slide"
                  transparent
                  visible={dateModalVisible}
                  onRequestClose={() => setDateModalVisible(false)}
                >
                  <Pressable
                    style={styles.dateModalOverlay}
                    onPress={() => setDateModalVisible(false)}
                  >
                    <Pressable style={[styles.dateModalCard, { backgroundColor: dark ? '#1A1F33' : '#FFFFFF' }]}>
                      <Text style={[styles.dateModalTitle, { color: theme.colors.text }]}>
                        {t('transactions.create.fields.occurredAt')}
                      </Text>

                      {/* Calendar month navigation */}
                      <View style={styles.calMonthHeader}>
                        <Pressable
                          hitSlop={12}
                          onPress={() => {
                            if (calViewMonthIdx === 0) { setCalViewYear(y => y - 1); setCalViewMonthIdx(11); }
                            else setCalViewMonthIdx(m => m - 1);
                          }}
                          style={styles.calNavBtn}
                        >
                          <Text style={[styles.calNavText, { color: theme.colors.primary }]}>‹</Text>
                        </Pressable>
                        <Text style={[styles.calMonthTitle, { color: theme.colors.text }]}>
                          {new Date(calViewYear, calViewMonthIdx).toLocaleString(localeStr, { month: 'long', year: 'numeric' })}
                        </Text>
                        <Pressable
                          hitSlop={12}
                          onPress={() => {
                            if (calViewMonthIdx === 11) { setCalViewYear(y => y + 1); setCalViewMonthIdx(0); }
                            else setCalViewMonthIdx(m => m + 1);
                          }}
                          style={styles.calNavBtn}
                        >
                          <Text style={[styles.calNavText, { color: theme.colors.primary }]}>›</Text>
                        </Pressable>
                      </View>

                      {/* Day name headers */}
                      <View style={styles.calDayNamesRow}>
                        {calDayNames.map((name, i) => (
                          <Text key={i} style={[styles.calDayName, { color: theme.colors.textMuted }]}>{name}</Text>
                        ))}
                      </View>

                      {/* Calendar day grid */}
                      {calWeeks.map((week, wi) => (
                        <View key={wi} style={styles.calWeekRow}>
                          {week.map((day, di) => {
                            const isSelected = day !== null && day === calSelectedDay;
                            const isToday = day !== null &&
                              new Date(calViewYear, calViewMonthIdx, day).toDateString() === todayStr;
                            return (
                              <Pressable
                                key={di}
                                onPress={() => { if (day !== null) setCalSelectedDay(day); }}
                                style={[
                                  styles.calDayCell,
                                  isSelected && { backgroundColor: theme.colors.primary, borderRadius: 22 },
                                ]}
                              >
                                <Text style={[
                                  styles.calDayText,
                                  {
                                    color: day === null
                                      ? 'transparent'
                                      : isSelected
                                        ? '#FFFFFF'
                                        : isToday
                                          ? theme.colors.primary
                                          : theme.colors.text,
                                    fontWeight: isToday && !isSelected ? '800' : '400',
                                  },
                                ]}>
                                  {day ?? '.'}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      ))}

                      {/* Divider */}
                      <View style={[styles.calDivider, { backgroundColor: panelBorder }]} />

                      {/* Time input */}
                      <View style={styles.calTimeRow}>
                        <Text style={[styles.dateModalFieldLabel, { color: theme.colors.textMuted }]}>
                          {t('transactions.create.fields.datePickerTimeLabel')}
                        </Text>
                        <TextInput
                          keyboardType="numbers-and-punctuation"
                          maxLength={5}
                          onChangeText={(v) => { setModalTimeInput(v); setModalError(null); }}
                          placeholder="HH:MM"
                          placeholderTextColor={theme.colors.textMuted}
                          style={[styles.calTimeInput, { color: theme.colors.text, borderColor: panelBorder, backgroundColor: dark ? '#0E1523' : '#F4F7FF' }]}
                          value={modalTimeInput}
                        />
                      </View>

                      {modalError ? (
                        <Text style={[styles.dateModalError, { color: theme.colors.expense }]}>{modalError}</Text>
                      ) : null}

                      <Pressable
                        onPress={() => {
                          const now = new Date();
                          setCalViewYear(now.getFullYear());
                          setCalViewMonthIdx(now.getMonth());
                          setCalSelectedDay(now.getDate());
                          setModalTimeInput(toTimeInput(now.toISOString()));
                          setModalError(null);
                        }}
                        style={styles.dateModalNowButton}
                      >
                        <Text style={[styles.dateModalNowText, { color: theme.colors.primary }]}>
                          ⚡ {t('common.now')}
                        </Text>
                      </Pressable>

                      <View style={styles.dateModalActions}>
                        <Pressable
                          onPress={() => setDateModalVisible(false)}
                          style={[styles.dateModalCancel, { borderColor: panelBorder }]}
                        >
                          <Text style={[styles.dateModalCancelText, { color: theme.colors.textMuted }]}>
                            {t('common.cancel')}
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            if (calSelectedDay === null) {
                              setModalError(t('errors.validation.invalidIsoDateTime'));
                              return;
                            }
                            const iso = buildIsoFromCal(calViewYear, calViewMonthIdx, calSelectedDay, modalTimeInput);
                            if (!iso) {
                              setModalError(t('errors.validation.invalidIsoDateTime'));
                              return;
                            }
                            onChange(iso);
                            setDateModalVisible(false);
                          }}
                          style={[styles.dateModalConfirm, { backgroundColor: theme.colors.primary }]}
                        >
                          <Text style={styles.dateModalConfirmText}>{t('common.confirm')}</Text>
                        </Pressable>
                      </View>
                    </Pressable>
                  </Pressable>
                </Modal>
              </>
            )}
          />

          <View
            style={[
              styles.currencyRow,
              {
                borderColor: panelBorder,
                backgroundColor: dark ? '#0E1523' : '#F8FBFF',
              },
            ]}
          >
            <Text style={[styles.currencyLabel, { color: theme.colors.textMuted }]}>
              {t('transactions.create.fields.currency')}
            </Text>
            <Text style={[styles.currencyValue, { color: theme.colors.text }]}> 
              {selectedAccount?.currency ?? t('transactions.create.selectAccountFirst')}
            </Text>
          </View>

          <PrimaryButton
            disabled={createTransactionMutation.isPending}
            label={createTransactionMutation.isPending ? t('common.saving') : t('transactions.create.submit')}
            onPress={form.handleSubmit((values) => {
              dismissKeyboardSafely();
              createTransactionMutation.mutate(values);
            })}
          />
        </Card>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    paddingTop: 0,
    paddingBottom: 0,
  },
  container: {
    gap: spacing.sm,
  },
  heroCard: {
    gap: spacing.sm,
  },
  heroTitle: {
    ...typography.heading,
    fontSize: 22,
    fontWeight: '700',
  },
  heroSubtitle: {
    ...typography.body,
    fontSize: 14,
  },
  segmentWrap: {
    marginTop: spacing.xxs,
  },
  segment: {
    borderRadius: radius.full,
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.xxs,
  },
  segmentButton: {
    alignItems: 'center',
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'transparent',
    flex: 1,
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  segmentButtonText: {
    ...typography.caption,
    fontWeight: '700',
  },
  formCard: {
    gap: spacing.sm,
  },
  sectionHead: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    ...typography.subheading,
    fontSize: 17,
    fontWeight: '700',
  },
  sectionSubtitle: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  fieldLabel: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '700',
  },
  choiceWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    justifyContent: 'center',
  },
  choiceChip: {
    alignItems: 'center',
    borderRadius: radius.full,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xxs,
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  choiceChipLabel: {
    ...typography.caption,
    fontWeight: '700',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'flex-start',
  },
  categoryChip: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'column',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 82,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
    width: '30.5%',
  },
  categoryChipLabel: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  inlineError: {
    ...typography.caption,
    fontSize: 12,
  },
  adornmentText: {
    ...typography.subheading,
    fontSize: 16,
    fontWeight: '700',
  },
  amountAdornmentWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 20,
  },
  amountCurrencyCode: {
    ...typography.caption,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  nowButton: {
    paddingHorizontal: spacing.xxs,
    paddingVertical: 2,
  },
  nowButtonText: {
    ...typography.caption,
    fontWeight: '700',
  },
  currencyRow: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  currencyLabel: {
    ...typography.caption,
    fontSize: 12,
  },
  currencyValue: {
    ...typography.caption,
    fontWeight: '700',
    textAlign: 'right',
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
    ...typography.caption,
  },
  datePickerRow: {
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    minHeight: 56,
  },
  datePickerLeft: {
    flex: 1,
    gap: 2,
  },
  datePickerLabel: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '700',
  },
  datePickerValue: {
    ...typography.body,
    fontSize: 15,
  },
  dateModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  dateModalCard: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    gap: spacing.sm,
    paddingBottom: 36,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  dateModalTitle: {
    ...typography.subheading,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  dateModalRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  dateModalField: {
    flex: 1,
    gap: spacing.xxs,
  },
  dateModalFieldLabel: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '600',
  },
  dateModalInput: {
    borderRadius: radius.md,
    borderWidth: 1,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: spacing.sm,
    textAlign: 'center',
  },
  dateModalError: {
    ...typography.caption,
    fontSize: 12,
    textAlign: 'center',
  },
  dateModalNowButton: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  dateModalNowText: {
    ...typography.body,
    fontWeight: '700',
    fontSize: 15,
  },
  dateModalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  dateModalCancel: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  dateModalCancelText: {
    ...typography.body,
    fontWeight: '700',
  },
  dateModalConfirm: {
    alignItems: 'center',
    borderRadius: radius.md,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  dateModalConfirmText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  calMonthHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  calNavBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  calNavText: {
    fontSize: 26,
    fontWeight: '700',
    lineHeight: 30,
  },
  calMonthTitle: {
    ...typography.body,
    fontWeight: '700',
    fontSize: 15,
    textTransform: 'capitalize',
    textAlign: 'center',
    flex: 1,
  },
  calDayNamesRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  calDayName: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  calWeekRow: {
    flexDirection: 'row',
  },
  calDayCell: {
    alignItems: 'center',
    flex: 1,
    height: 40,
    justifyContent: 'center',
  },
  calDayText: {
    fontSize: 14,
  },
  calDivider: {
    height: 1,
    marginVertical: 8,
  },
  calTimeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  calTimeInput: {
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 16,
    minWidth: 90,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlign: 'center',
  },
});
