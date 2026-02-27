import { useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  transactionUpdateInputSchema,
  type TransactionType,
} from '@mintly/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { useAuth } from '@app/providers/AuthProvider';
import { apiClient } from '@core/api/client';
import { financeQueryKeys } from '@core/api/queryKeys';
import type { TransactionsStackParamList } from '@core/navigation/stacks/TransactionsStack';
import { listCategories } from '@features/finance/categories/categoryCatalog';
import { AppIcon, Card, PrimaryButton, ScreenContainer, TextField } from '@shared/ui';
import { useI18n } from '@shared/i18n';
import { radius, spacing, typography, useTheme } from '@shared/theme';
import { apiErrorText } from '@shared/utils/apiErrorText';

// no touch/keyboard behavior changed by this PR.

const typeOptions: TransactionType[] = ['expense', 'income'];

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
type Props = NativeStackScreenProps<TransactionsStackParamList, 'EditTransaction'>;

export function EditTransactionScreen({ route, navigation }: Props) {
  const { withAuth } = useAuth();
  const { theme, mode } = useTheme();
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const initializedRef = useRef(false);

  const { transactionId } = route.params;

  const transactionQuery = useQuery({
    queryKey: ['transactions', 'detail', transactionId],
    queryFn: () => withAuth((token) => apiClient.getTransaction(transactionId, token)),
  });

  const accountsQuery = useQuery({
    queryKey: financeQueryKeys.accounts.list(),
    queryFn: () => withAuth((token) => apiClient.getAccounts(token)),
  });

  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: {
      type: 'expense',
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
    () => accountsQuery.data?.accounts.find((account) => account.id === selectedAccountId) ?? null,
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
    const transaction = transactionQuery.data;
    const accounts = accountsQuery.data?.accounts;

    if (!transaction || !accounts || initializedRef.current) {
      return;
    }

    form.reset({
      type: transaction.type,
      accountId: transaction.accountId,
      categoryKey: transaction.categoryKey ?? '',
      amount: String(transaction.amount),
      description: transaction.description ?? '',
      occurredAt: transaction.occurredAt,
    });

    initializedRef.current = true;
  }, [accountsQuery.data?.accounts, form, transactionQuery.data]);

  const updateTransactionMutation = useMutation({
    mutationFn: (values: TransactionFormValues) => {
      const amount = Number(values.amount);
      const occurredAt = new Date(values.occurredAt).toISOString();
      const categoryKey = selectedCategory?.key ?? values.categoryKey;

      if (!categoryKey) {
        throw new Error(t('errors.validation.selectCategory'));
      }

      return withAuth((token) =>
        apiClient.updateTransaction(
          transactionId,
          transactionUpdateInputSchema.parse({
            type: values.type,
            accountId: values.accountId,
            categoryKey,
            amount,
            currency: selectedAccount?.currency ?? transactionQuery.data?.currency ?? 'TRY',
            description: values.description?.trim() ? values.description.trim() : null,
            occurredAt,
          }),
          token,
        ),
      );
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: financeQueryKeys.transactions.all() }),
        queryClient.invalidateQueries({ queryKey: financeQueryKeys.dashboard.recent() }),
        queryClient.invalidateQueries({ queryKey: financeQueryKeys.analytics.all() }),
        queryClient.invalidateQueries({ queryKey: financeQueryKeys.budgets.all() }),
        queryClient.invalidateQueries({ queryKey: ['transactions', 'detail', transactionId] }),
      ]);

      Alert.alert(t('tx.edit.success'));
      navigation.goBack();
    },
    onError: (error) => {
      Alert.alert(t('tx.edit.errorTitle'), apiErrorText(error));
    },
  });

  if (transactionQuery.isLoading || accountsQuery.isLoading) {
    return (
      <ScreenContainer dark={mode === 'dark'}>
        <Card dark={mode === 'dark'} style={styles.stateCard}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={[styles.stateText, { color: theme.colors.textMuted }]}>{t('common.loading')}</Text>
        </Card>
      </ScreenContainer>
    );
  }

  if (transactionQuery.isError || accountsQuery.isError || !transactionQuery.data) {
    const error = transactionQuery.error ?? accountsQuery.error;

    return (
      <ScreenContainer dark={mode === 'dark'}>
        <Card dark={mode === 'dark'} style={styles.errorCard}>
          <Text style={[styles.errorTitle, { color: theme.colors.text }]}>{t('tx.edit.errorTitle')}</Text>
          <Text style={[styles.errorText, { color: theme.colors.expense }]}>{apiErrorText(error)}</Text>
          <PrimaryButton
            label={t('common.retry')}
            onPress={() => {
              void transactionQuery.refetch();
              void accountsQuery.refetch();
            }}
          />
        </Card>
      </ScreenContainer>
    );
  }

  if (transactionQuery.data.kind === 'transfer') {
    return (
      <ScreenContainer dark={mode === 'dark'}>
        <Card dark={mode === 'dark'} style={styles.errorCard}>
          <Text style={[styles.errorTitle, { color: theme.colors.text }]}>{t('tx.edit.title')}</Text>
          <Text style={[styles.errorText, { color: theme.colors.textMuted }]}>{t('tx.edit.transferReadOnly')}</Text>
          <PrimaryButton label={t('common.goBack')} onPress={() => navigation.goBack()} />
        </Card>
      </ScreenContainer>
    );
  }

  const dark = mode === 'dark';
  const accounts = accountsQuery.data?.accounts ?? [];
  const panelBg = dark ? '#121826' : theme.colors.surface;
  const panelBorder = dark ? '#27344F' : theme.colors.border;

  return (
    <ScreenContainer dark={dark}>
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
          <Text style={[styles.heroTitle, { color: theme.colors.text }]}>{t('tx.edit.title')}</Text>
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
              <View style={styles.choiceWrap}>
                {categoryOptions.map((category) => {
                  const selected = value === category.key;

                  return (
                    <Pressable
                      key={category.key}
                      accessibilityRole="button"
                      onPress={() => onChange(category.key)}
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
                      <AppIcon
                        name={category.icon}
                        size="sm"
                        color={selected ? theme.colors.primary : theme.colors.textMuted}
                      />
                      <Text
                        style={[
                          styles.choiceChipLabel,
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
                  <Text style={[styles.adornmentText, { color: theme.colors.textMuted }]}>₺</Text>
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
            render={({ field: { value, onChange, onBlur } }) => (
              <TextField
                autoCapitalize="none"
                error={form.formState.errors.occurredAt?.message ? t(form.formState.errors.occurredAt.message) : undefined}
                label={t('transactions.create.fields.occurredAt')}
                labelRight={
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => onChange(new Date().toISOString())}
                    style={styles.nowButton}
                  >
                    <Text style={[styles.nowButtonText, { color: theme.colors.primary }]}>
                      {t('common.now')}
                    </Text>
                  </Pressable>
                }
                onBlur={onBlur}
                onChangeText={onChange}
                placeholder={t('transactions.create.fields.occurredAtPlaceholder')}
                value={value}
              />
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
            disabled={updateTransactionMutation.isPending}
            label={updateTransactionMutation.isPending ? t('common.saving') : t('tx.form.save')}
            loading={updateTransactionMutation.isPending}
            onPress={form.handleSubmit((values) => {
              updateTransactionMutation.mutate(values);
            })}
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
  },
  choiceChip: {
    alignItems: 'center',
    borderRadius: radius.full,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xxs,
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  choiceChipLabel: {
    ...typography.caption,
    fontWeight: '700',
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
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
  currencyLabel: {
    ...typography.caption,
    fontSize: 12,
  },
  currencyValue: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '700',
  },
  stateCard: {
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 220,
  },
  stateText: {
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
});
