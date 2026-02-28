import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  recurringCreateInputSchema, type RecurringRule, } from '@mintly/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { useAuth } from '@app/providers/AuthProvider';
import { apiClient } from '@core/api/client';
import { financeQueryKeys } from '@core/api/queryKeys';
import {
  getCategoryLabel, listCategories, } from '@features/finance/categories/categoryCatalog';
import { Card, Chip, PrimaryButton, ScreenContainer, Section, showAlert } from '@shared/ui';
import { useI18n } from '@shared/i18n';
import { colors, radius, spacing, typography } from '@shared/theme';
import { apiErrorText } from '@shared/utils/apiErrorText';

const recurringFormSchema = z
  .object({
    kind: z.enum(['normal', 'transfer']),
    type: z.enum(['expense', 'income']),
    accountId: z.string().trim().optional(),
    categoryKey: z.string().trim().optional(),
    fromAccountId: z.string().trim().optional(),
    toAccountId: z.string().trim().optional(),
    amount: z
      .string()
      .trim()
      .min(1, 'errors.validation.amountRequired')
      .refine((value) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed > 0;
      }, 'errors.validation.amountPositive'),
    cadence: z.enum(['weekly', 'monthly']),
    dayOfWeek: z.string().trim().optional(),
    dayOfMonth: z.string().trim().optional(),
    startAt: z
      .string()
      .trim()
      .min(1, 'errors.validation.startDateTimeRequired')
      .refine((value) => !Number.isNaN(Date.parse(value)), 'errors.validation.invalidIsoDateTime'),
    description: z.string().trim().max(500).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.kind === 'normal') {
      if (!value.accountId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['accountId'],
          message: 'errors.validation.selectAccount',
        });
      }
      if (!value.categoryKey) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['categoryKey'],
          message: 'errors.validation.selectCategory',
        });
      }
    } else {
      if (!value.fromAccountId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['fromAccountId'],
          message: 'errors.validation.selectSourceAccount',
        });
      }
      if (!value.toAccountId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['toAccountId'],
          message: 'errors.validation.selectDestinationAccount',
        });
      }
      if (value.fromAccountId && value.toAccountId && value.fromAccountId === value.toAccountId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['toAccountId'],
          message: 'errors.validation.sourceDestinationDifferent',
        });
      }
    }

    if (value.cadence === 'weekly') {
      const parsed = Number(value.dayOfWeek);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 6) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['dayOfWeek'],
          message: 'errors.validation.dayOfWeekRange',
        });
      }
    }

    if (value.cadence === 'monthly') {
      const parsed = Number(value.dayOfMonth);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 28) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['dayOfMonth'],
          message: 'errors.validation.dayOfMonthRange',
        });
      }
    }
  });

type RecurringFormValues = z.infer<typeof recurringFormSchema>;

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

export function RecurringScreen() {
  const { withAuth } = useAuth();
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();

  const recurringQuery = useQuery({
    queryKey: financeQueryKeys.recurring.list({}),
    queryFn: () => withAuth((token) => apiClient.listRecurring({}, token)),
  });

  const accountsQuery = useQuery({
    queryKey: financeQueryKeys.accounts.list(),
    queryFn: () => withAuth((token) => apiClient.getAccounts(token)),
  });

  const form = useForm<RecurringFormValues>({
    resolver: zodResolver(recurringFormSchema),
    defaultValues: {
      kind: 'normal',
      type: 'expense',
      accountId: '',
      categoryKey: '',
      fromAccountId: '',
      toAccountId: '',
      amount: '',
      cadence: 'monthly',
      dayOfWeek: '1',
      dayOfMonth: '1',
      startAt: new Date().toISOString(),
      description: '',
    },
  });

  const kind = form.watch('kind');
  const type = form.watch('type');
  const cadence = form.watch('cadence');
  const selectedCategoryValue = form.watch('categoryKey');

  const categoryOptions = useMemo(
    () => listCategories(type, locale),
    [locale, type],
  );

  const selectedCategoryOption = useMemo(
    () => categoryOptions.find((option) => option.key === selectedCategoryValue) ?? null,
    [categoryOptions, selectedCategoryValue],
  );

  const accounts = accountsQuery.data?.accounts ?? [];

  const accountNameById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account.name])),
    [accounts],
  );
  useEffect(() => {
    if (!selectedCategoryValue) {
      return;
    }

    const exists = categoryOptions.some((option) => option.key === selectedCategoryValue);
    if (!exists) {
      form.setValue('categoryKey', '');
    }
  }, [categoryOptions, form, selectedCategoryValue]);

  async function refreshRecurringList(): Promise<void> {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: financeQueryKeys.recurring.all() }),
      queryClient.invalidateQueries({ queryKey: financeQueryKeys.dashboard.recent() }),
    ]);
  }

  const createRecurringMutation = useMutation({
    mutationFn: (values: RecurringFormValues) =>
      withAuth((token) => {
        const amount = Number(values.amount);
        const basePayload = {
          kind: values.kind,
          amount,
          description: values.description?.trim() || undefined,
          cadence: values.cadence,
          startAt: new Date(values.startAt).toISOString(),
          ...(values.cadence === 'weekly'
            ? { dayOfWeek: Number(values.dayOfWeek) }
            : { dayOfMonth: Number(values.dayOfMonth) }),
        } as const;

        if (values.kind === 'normal') {
          const selectedOption =
            categoryOptions.find((option) => option.key === values.categoryKey) ??
            selectedCategoryOption;

          if (!selectedOption) {
            throw new Error(t('errors.validation.selectCategory'));
          }

          return apiClient.createRecurring(
            recurringCreateInputSchema.parse({
              ...basePayload,
              kind: 'normal',
              accountId: values.accountId ?? '',
              categoryKey: selectedOption.key,
              type: values.type,
            }),
            token,
          );
        }

        return apiClient.createRecurring(
          recurringCreateInputSchema.parse({
            ...basePayload,
            kind: 'transfer',
            fromAccountId: values.fromAccountId ?? '',
            toAccountId: values.toAccountId ?? '',
          }),
          token,
        );
      }),
    onSuccess: async () => {
      await refreshRecurringList();
      form.reset({
        kind: 'normal',
        type: 'expense',
        accountId: '',
        categoryKey: '',
        fromAccountId: '',
        toAccountId: '',
        amount: '',
        cadence: 'monthly',
        dayOfWeek: '1',
        dayOfMonth: '1',
        startAt: new Date().toISOString(),
        description: '',
      });
      showAlert(t('recurring.successTitle'), t('recurring.successMessage'));
    },
    onError: (error) => {
      showAlert(t('errors.recurring.createFailedTitle'), apiErrorText(error));
    },
  });

  const togglePausedMutation = useMutation({
    mutationFn: (rule: RecurringRule) =>
      withAuth((token) =>
        apiClient.updateRecurring(
          rule.id,
          {
            isPaused: !rule.isPaused,
          },
          token,
        ),
      ),
    onSuccess: refreshRecurringList,
    onError: (error) => {
      showAlert(t('errors.recurring.updateFailedTitle'), apiErrorText(error));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (ruleId: string) => withAuth((token) => apiClient.deleteRecurring(ruleId, token)),
    onSuccess: refreshRecurringList,
    onError: (error) => {
      showAlert(t('errors.recurring.deleteFailedTitle'), apiErrorText(error));
    },
  });

  if (recurringQuery.isLoading || accountsQuery.isLoading) {
    return (
      <ScreenContainer>
        <Card>
          <Text style={styles.helperText}>{t('recurring.state.loading')}</Text>
        </Card>
      </ScreenContainer>
    );
  }

  if (recurringQuery.isError || accountsQuery.isError) {
    const error = recurringQuery.error ?? accountsQuery.error;
    return (
      <ScreenContainer>
        <Card style={styles.errorCard}>
          <Text style={styles.errorText}>{apiErrorText(error)}</Text>
          <PrimaryButton
            label={t('common.retry')}
            onPress={() => {
              void recurringQuery.refetch();
              void accountsQuery.refetch();
            }}
          />
        </Card>
      </ScreenContainer>
    );
  }

  const rules = recurringQuery.data?.rules ?? [];

  return (
    <ScreenContainer>
      <Section title={t('recurring.title')} subtitle={t('recurring.subtitle')}>
        <Card style={styles.formCard}>
          <Text style={styles.fieldLabel}>{t('recurring.fields.kind')}</Text>
          <Controller
            control={form.control}
            name="kind"
            render={({ field: { value, onChange } }) => (
              <View style={styles.chipWrap}>
                <Pressable onPress={() => onChange('normal')}>
                  <Chip label={t('recurring.kind.normal')} tone={value === 'normal' ? 'primary' : 'default'} />
                </Pressable>
                <Pressable onPress={() => onChange('transfer')}>
                  <Chip label={t('recurring.kind.transfer')} tone={value === 'transfer' ? 'primary' : 'default'} />
                </Pressable>
              </View>
            )}
          />

          {kind === 'normal' ? (
            <>
              <Text style={styles.fieldLabel}>{t('recurring.fields.type')}</Text>
              <Controller
                control={form.control}
                name="type"
                render={({ field: { value, onChange } }) => (
                  <View style={styles.chipWrap}>
                    <Pressable onPress={() => onChange('expense')}>
                      <Chip label={t('analytics.expense')} tone={value === 'expense' ? 'expense' : 'default'} />
                    </Pressable>
                    <Pressable onPress={() => onChange('income')}>
                      <Chip label={t('analytics.income')} tone={value === 'income' ? 'income' : 'default'} />
                    </Pressable>
                  </View>
                )}
              />

              <Text style={styles.fieldLabel}>{t('recurring.fields.account')}</Text>
              <Controller
                control={form.control}
                name="accountId"
                render={({ field: { value, onChange } }) => (
                  <View style={styles.chipWrap}>
                    {accounts.map((account) => (
                      <Pressable key={account.id} onPress={() => onChange(account.id)}>
                        <Chip label={account.name} tone={value === account.id ? 'primary' : 'default'} />
                      </Pressable>
                    ))}
                  </View>
                )}
              />
              {form.formState.errors.accountId ? (
                <Text style={styles.errorText}>{t(form.formState.errors.accountId.message ?? '')}</Text>
              ) : null}

              <Text style={styles.fieldLabel}>{t('recurring.fields.categoryWithType', { type: t(`recurring.type.${type}`) })}</Text>
              <Controller
                control={form.control}
                name="categoryKey"
                render={({ field: { value, onChange } }) => (
                  <View style={styles.chipWrap}>
                    {categoryOptions.map((category) => (
                      <Pressable key={category.key} onPress={() => onChange(category.key)}>
                        <Chip
                          iconName={category.icon}
                          label={category.label}
                          tone={value === category.key ? 'primary' : 'default'}
                        />
                      </Pressable>
                    ))}
                  </View>
                )}
              />
              {form.formState.errors.categoryKey ? (
                <Text style={styles.errorText}>{t(form.formState.errors.categoryKey.message ?? '')}</Text>
              ) : null}
            </>
          ) : (
            <>
              <Text style={styles.fieldLabel}>{t('recurring.fields.fromAccount')}</Text>
              <Controller
                control={form.control}
                name="fromAccountId"
                render={({ field: { value, onChange } }) => (
                  <View style={styles.chipWrap}>
                    {accounts.map((account) => (
                      <Pressable key={`from-${account.id}`} onPress={() => onChange(account.id)}>
                        <Chip
                          label={account.name}
                          tone={value === account.id ? 'expense' : 'default'}
                        />
                      </Pressable>
                    ))}
                  </View>
                )}
              />
              {form.formState.errors.fromAccountId ? (
                <Text style={styles.errorText}>{t(form.formState.errors.fromAccountId.message ?? '')}</Text>
              ) : null}

              <Text style={styles.fieldLabel}>{t('recurring.fields.toAccount')}</Text>
              <Controller
                control={form.control}
                name="toAccountId"
                render={({ field: { value, onChange } }) => (
                  <View style={styles.chipWrap}>
                    {accounts.map((account) => (
                      <Pressable key={`to-${account.id}`} onPress={() => onChange(account.id)}>
                        <Chip
                          label={account.name}
                          tone={value === account.id ? 'income' : 'default'}
                        />
                      </Pressable>
                    ))}
                  </View>
                )}
              />
              {form.formState.errors.toAccountId ? (
                <Text style={styles.errorText}>{t(form.formState.errors.toAccountId.message ?? '')}</Text>
              ) : null}
            </>
          )}

          <Text style={styles.fieldLabel}>{t('recurring.fields.amount')}</Text>
          <Controller
            control={form.control}
            name="amount"
            render={({ field: { value, onChange, onBlur } }) => (
              <TextInput
                style={styles.input}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                keyboardType="decimal-pad"
                placeholder={t('recurring.fields.amountPlaceholder')}
                placeholderTextColor={colors.textMuted}
              />
            )}
          />
          {form.formState.errors.amount ? (
            <Text style={styles.errorText}>{t(form.formState.errors.amount.message ?? '')}</Text>
          ) : null}

          <Text style={styles.fieldLabel}>{t('recurring.fields.cadence')}</Text>
          <Controller
            control={form.control}
            name="cadence"
            render={({ field: { value, onChange } }) => (
              <View style={styles.chipWrap}>
                <Pressable onPress={() => onChange('weekly')}>
                  <Chip label={t('recurring.cadence.weekly')} tone={value === 'weekly' ? 'primary' : 'default'} />
                </Pressable>
                <Pressable onPress={() => onChange('monthly')}>
                  <Chip label={t('recurring.cadence.monthly')} tone={value === 'monthly' ? 'primary' : 'default'} />
                </Pressable>
              </View>
            )}
          />

          {cadence === 'weekly' ? (
            <>
              <Text style={styles.fieldLabel}>{t('recurring.fields.dayOfWeek')}</Text>
              <Controller
                control={form.control}
                name="dayOfWeek"
                render={({ field: { value, onChange, onBlur } }) => (
                  <TextInput
                    style={styles.input}
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    keyboardType="number-pad"
                    placeholder={t('recurring.fields.dayPlaceholder')}
                    placeholderTextColor={colors.textMuted}
                  />
                )}
              />
              {form.formState.errors.dayOfWeek ? (
                <Text style={styles.errorText}>{t(form.formState.errors.dayOfWeek.message ?? '')}</Text>
              ) : null}
            </>
          ) : (
            <>
              <Text style={styles.fieldLabel}>{t('recurring.fields.dayOfMonth')}</Text>
              <Controller
                control={form.control}
                name="dayOfMonth"
                render={({ field: { value, onChange, onBlur } }) => (
                  <TextInput
                    style={styles.input}
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    keyboardType="number-pad"
                    placeholder={t('recurring.fields.dayPlaceholder')}
                    placeholderTextColor={colors.textMuted}
                  />
                )}
              />
              {form.formState.errors.dayOfMonth ? (
                <Text style={styles.errorText}>{t(form.formState.errors.dayOfMonth.message ?? '')}</Text>
              ) : null}
            </>
          )}

          <Text style={styles.fieldLabel}>{t('recurring.fields.startAt')}</Text>
          <Controller
            control={form.control}
            name="startAt"
            render={({ field: { value, onChange, onBlur } }) => (
              <TextInput
                style={styles.input}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                autoCapitalize="none"
                placeholder={t('recurring.fields.startAtPlaceholder')}
                placeholderTextColor={colors.textMuted}
              />
            )}
          />
          {form.formState.errors.startAt ? (
            <Text style={styles.errorText}>{t(form.formState.errors.startAt.message ?? '')}</Text>
          ) : null}

          <Text style={styles.fieldLabel}>{t('recurring.fields.description')}</Text>
          <Controller
            control={form.control}
            name="description"
            render={({ field: { value, onChange, onBlur } }) => (
              <TextInput
                style={styles.input}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                placeholder={t('recurring.fields.descriptionPlaceholder')}
                placeholderTextColor={colors.textMuted}
              />
            )}
          />

          <PrimaryButton
            label={createRecurringMutation.isPending ? t('common.saving') : t('recurring.actions.create')}
            onPress={form.handleSubmit((values) => {
              createRecurringMutation.mutate(values);
            })}
          />
        </Card>
      </Section>

      <Section title={t('recurring.sections.existing')} subtitle={t('recurring.sections.totalRules', { count: rules.length })}>
        {rules.length === 0 ? (
          <Card>
            <Text style={styles.helperText}>{t('recurring.state.empty')}</Text>
          </Card>
        ) : null}

        {rules.map((rule) => (
          <Card key={rule.id} style={styles.ruleCard}>
            <View style={styles.ruleHeader}>
              <Text style={styles.ruleTitle}>
                {rule.kind === 'transfer' ? t('recurring.rule.transfer') : t('recurring.rule.normal')}
              </Text>
              <Chip
                label={rule.isPaused ? t('recurring.status.paused') : t('recurring.status.active')}
                tone={rule.isPaused ? 'default' : 'primary'}
              />
            </View>

            <Text style={styles.ruleText}>{t('recurring.rule.amount', { amount: String(rule.amount) })}</Text>
            <Text style={styles.ruleText}>{t('recurring.rule.cadence', { cadence: t(`recurring.cadence.${rule.cadence}`) })}</Text>
            <Text style={styles.ruleText}>{t('recurring.rule.nextRun', { date: formatDateTime(rule.nextRunAt) })}</Text>
            {rule.kind === 'normal' ? (
              <>
                <Text style={styles.ruleText}>{t('recurring.rule.type', { type: rule.type ? t(`recurring.type.${rule.type}`) : t('common.notAvailable') })}</Text>
                <Text style={styles.ruleText}>
                  {t('recurring.rule.account', {
                    account: rule.accountId ? accountNameById.get(rule.accountId) ?? rule.accountId : t('common.notAvailable'),
                  })}
                </Text>
                <Text style={styles.ruleText}>
                  {t('recurring.rule.category', {
                    category: rule.categoryKey
                      ? getCategoryLabel(rule.categoryKey, locale) || t('transactions.row.uncategorized')
                      : t('transactions.row.uncategorized'),
                  })}
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.ruleText}>
                  {t('recurring.rule.from', {
                    account: rule.fromAccountId
                      ? accountNameById.get(rule.fromAccountId) ?? rule.fromAccountId
                      : t('common.notAvailable'),
                  })}
                </Text>
                <Text style={styles.ruleText}>
                  {t('recurring.rule.to', {
                    account: rule.toAccountId ? accountNameById.get(rule.toAccountId) ?? rule.toAccountId : t('common.notAvailable'),
                  })}
                </Text>
              </>
            )}

            {rule.description ? <Text style={styles.ruleText}>{t('recurring.rule.note', { note: rule.description })}</Text> : null}

            <View style={styles.actionRow}>
              <Pressable
                onPress={() => {
                  togglePausedMutation.mutate(rule);
                }}
              >
                <Text style={styles.linkText}>{rule.isPaused ? t('common.resume') : t('common.pause')}</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  showAlert(t('recurring.delete.title'), t('recurring.delete.message'), [
                    { text: t('common.cancel'), style: 'cancel' },
                    {
                      text: t('common.delete'),
                      style: 'destructive',
                      onPress: () => {
                        deleteMutation.mutate(rule.id);
                      },
                    },
                  ]);
                }}
              >
                <Text style={styles.deleteText}>{t('common.delete')}</Text>
              </Pressable>
            </View>
          </Card>
        ))}
      </Section>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  formCard: {
    gap: spacing.sm,
  },
  fieldLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    color: colors.text,
    ...typography.body,
  },
  helperText: {
    ...typography.body,
    color: colors.textMuted,
  },
  errorCard: {
    gap: spacing.sm,
  },
  errorText: {
    ...typography.caption,
    color: colors.expense,
  },
  ruleCard: {
    gap: spacing.xs,
  },
  ruleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  ruleTitle: {
    ...typography.subheading,
    color: colors.text,
  },
  ruleText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  actionRow: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  linkText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
  },
  deleteText: {
    ...typography.caption,
    color: colors.expense,
    fontWeight: '600',
  },
});
