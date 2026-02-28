import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import { transferCreateInputSchema } from '@mintly/shared';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { useAuth } from '@app/providers/AuthProvider';
import { apiClient } from '@core/api/client';
import { financeQueryKeys } from '@core/api/queryKeys';
import type { TransferScreenParams } from '@core/navigation/stacks/AddStack';
import type { RootTabParamList } from '@core/navigation/types';
import { Card, Chip, PrimaryButton, ScreenContainer, Section, showAlert } from '@shared/ui';
import { useI18n } from '@shared/i18n';
import { colors, radius, spacing, typography } from '@shared/theme';
import { apiErrorText } from '@shared/utils/apiErrorText';

const transferFormSchema = z
  .object({
    fromAccountId: z.string().trim().min(1, 'errors.validation.selectSourceAccount'),
    toAccountId: z.string().trim().min(1, 'errors.validation.selectDestinationAccount'),
    amount: z
      .string()
      .trim()
      .min(1, 'errors.validation.amountRequired')
      .refine((value) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed > 0;
      }, 'errors.validation.amountPositive'),
    occurredAt: z
      .string()
      .trim()
      .min(1, 'errors.validation.dateTimeRequired')
      .refine((value) => !Number.isNaN(Date.parse(value)), 'errors.validation.invalidIsoDateTime'),
    description: z.string().trim().max(500).optional(),
  })
  .refine((value) => value.fromAccountId !== value.toAccountId, {
    path: ['toAccountId'],
    message: 'errors.sameAccount',
  });

type TransferFormValues = z.infer<typeof transferFormSchema>;

function formatCurrency(amount: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function TransferScreen() {
  const { withAuth } = useAuth();
  const { t, locale } = useI18n();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<{ Transfer: TransferScreenParams | undefined }, 'Transfer'>>();
  const queryClient = useQueryClient();

  const deleteFlowSourceAccountId = route.params?.deleteSourceAccountId?.trim() ?? '';
  const deleteFlowSourceAccountName = route.params?.deleteSourceAccountName?.trim() ?? '';
  const deleteFlowSourceBalance = route.params?.deleteSourceBalance ?? 0;
  const isDeleteFlow =
    deleteFlowSourceAccountId.length > 0
    && Number.isFinite(deleteFlowSourceBalance)
    && deleteFlowSourceBalance > 0;

  const accountsQuery = useQuery({
    queryKey: financeQueryKeys.accounts.list(),
    queryFn: () => withAuth((token) => apiClient.getAccounts(token)),
  });

  const form = useForm<TransferFormValues>({
    resolver: zodResolver(transferFormSchema),
    defaultValues: {
      fromAccountId: isDeleteFlow ? deleteFlowSourceAccountId : '',
      toAccountId: '',
      amount: isDeleteFlow ? deleteFlowSourceBalance.toFixed(2) : '',
      occurredAt: new Date().toISOString(),
      description: '',
    },
  });

  const accounts = accountsQuery.data?.accounts ?? [];
  const destinationAccounts = useMemo(
    () =>
      isDeleteFlow
        ? accounts.filter((account) => account.id !== deleteFlowSourceAccountId)
        : accounts,
    [accounts, deleteFlowSourceAccountId, isDeleteFlow],
  );

  const accountById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );

  const deleteSourceAccount = accountById.get(deleteFlowSourceAccountId);
  const deleteFlowAmountLabel = useMemo(() => {
    if (!isDeleteFlow) {
      return '';
    }

    return formatCurrency(deleteFlowSourceBalance, deleteSourceAccount?.currency ?? 'TRY', locale);
  }, [deleteFlowSourceBalance, deleteSourceAccount?.currency, isDeleteFlow, locale]);

  useEffect(() => {
    if (!isDeleteFlow) {
      return;
    }

    form.setValue('fromAccountId', deleteFlowSourceAccountId, { shouldValidate: true });
    form.setValue('amount', deleteFlowSourceBalance.toFixed(2), { shouldValidate: true });

    const selectedToAccount = form.getValues('toAccountId');
    if (
      (!selectedToAccount || selectedToAccount === deleteFlowSourceAccountId)
      && destinationAccounts[0]
    ) {
      form.setValue('toAccountId', destinationAccounts[0].id, { shouldValidate: true });
    }
  }, [
    deleteFlowSourceAccountId,
    deleteFlowSourceBalance,
    destinationAccounts,
    form,
    isDeleteFlow,
  ]);

  const createTransferMutation = useMutation({
    mutationFn: (values: TransferFormValues) =>
      withAuth((token) =>
        apiClient.createTransfer(
          transferCreateInputSchema.parse({
            fromAccountId: values.fromAccountId,
            toAccountId: values.toAccountId,
            amount: Number(values.amount),
            occurredAt: new Date(values.occurredAt).toISOString(),
            description: values.description?.trim() || undefined,
          }),
          token,
        ),
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: financeQueryKeys.accounts.all() }),
        queryClient.invalidateQueries({ queryKey: financeQueryKeys.transactions.all() }),
        queryClient.invalidateQueries({ queryKey: financeQueryKeys.dashboard.recent() }),
        queryClient.invalidateQueries({ queryKey: financeQueryKeys.analytics.all() }),
      ]);

      if (isDeleteFlow && deleteFlowSourceAccountId) {
        try {
          await withAuth((token) => apiClient.deleteAccount(deleteFlowSourceAccountId, token));
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: financeQueryKeys.accounts.all() }),
            queryClient.invalidateQueries({ queryKey: financeQueryKeys.transactions.all() }),
            queryClient.invalidateQueries({ queryKey: financeQueryKeys.dashboard.recent() }),
            queryClient.invalidateQueries({ queryKey: financeQueryKeys.analytics.all() }),
          ]);

          showAlert(t('accounts.delete.success'));
          const parent = navigation.getParent?.();
          if (parent && 'navigate' in parent) {
            (parent as {
              navigate: (name: keyof RootTabParamList, params?: RootTabParamList['ProfileTab']) => void;
            }).navigate('ProfileTab', { screen: 'Accounts' });
          } else {
            navigation.goBack();
          }
        } catch (error) {
          showAlert(t('errors.account.deleteFailedTitle'), apiErrorText(error));
        }
        return;
      }

      form.reset({
        fromAccountId: '',
        toAccountId: '',
        amount: '',
        occurredAt: new Date().toISOString(),
        description: '',
      });
      showAlert(t('transfers.successTitle'), t('success.transferCreated'));
    },
    onError: (error) => {
      showAlert(t('errors.transfer.createFailedTitle'), apiErrorText(error));
    },
  });

  const submitTransfer = form.handleSubmit((values) => {
    const valuesToSubmit = isDeleteFlow
      ? {
          ...values,
          fromAccountId: deleteFlowSourceAccountId,
          amount: deleteFlowSourceBalance.toFixed(2),
        }
      : values;

    const fromAccount = accountById.get(valuesToSubmit.fromAccountId);
    const toAccount = accountById.get(valuesToSubmit.toAccountId);

    if (fromAccount && toAccount && fromAccount.currency !== toAccount.currency) {
      form.setError('toAccountId', { type: 'validate', message: 'errors.currencyMismatch' });
      return;
    }

    createTransferMutation.mutate(valuesToSubmit);
  });

  if (accountsQuery.isLoading) {
    return (
      <ScreenContainer>
        <Card style={styles.stateCard}>
          <Text style={styles.helperText}>{t('add.transfer.state.loadingAccounts')}</Text>
        </Card>
      </ScreenContainer>
    );
  }

  if (accountsQuery.isError) {
    return (
      <ScreenContainer>
        <Card style={styles.stateCard}>
          <Text style={styles.errorText}>{apiErrorText(accountsQuery.error)}</Text>
          <PrimaryButton label={t('common.retry')} onPress={() => void accountsQuery.refetch()} />
        </Card>
      </ScreenContainer>
    );
  }

  if (accounts.length < 2 || destinationAccounts.length === 0) {
    return (
      <ScreenContainer>
        <Section title={t('add.transfer.title')}>
          <Card style={styles.stateCard}>
            <Text style={styles.helperText}>{t('add.transfer.state.needTwoAccounts')}</Text>
          </Card>
        </Section>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <Section title={t('add.transfer.title')} subtitle={t('add.transfer.subtitle')}>
        <Card style={styles.formCard}>
          {isDeleteFlow ? (
            <View style={styles.readOnlyGroup}>
              <Text style={styles.fieldLabel}>{t('add.transfer.deleteFlow.balanceLabel')}</Text>
              <Text style={styles.readOnlyValue}>
                {t('add.transfer.deleteFlow.balanceValue', {
                  amount: deleteFlowAmountLabel,
                  account: deleteSourceAccount?.name ?? deleteFlowSourceAccountName,
                })}
              </Text>
            </View>
          ) : null}

          <Text style={styles.fieldLabel}>{t('add.transfer.fromAccount')}</Text>
          <Controller
            control={form.control}
            name="fromAccountId"
            render={({ field: { value, onChange } }) => (
              <View style={styles.chipWrap}>
                {isDeleteFlow ? (
                  <Chip
                    label={`${deleteSourceAccount?.name ?? deleteFlowSourceAccountName} (${deleteSourceAccount?.currency ?? ''})`}
                    tone="expense"
                  />
                ) : (
                  accounts.map((account) => (
                    <Pressable key={`from-${account.id}`} onPress={() => onChange(account.id)}>
                      <Chip
                        label={`${account.name} (${account.currency})`}
                        tone={value === account.id ? 'expense' : 'default'}
                      />
                    </Pressable>
                  ))
                )}
              </View>
            )}
          />
          {form.formState.errors.fromAccountId ? (
            <Text style={styles.errorText}>{t(form.formState.errors.fromAccountId.message ?? '')}</Text>
          ) : null}

          <Text style={styles.fieldLabel}>{t('add.transfer.toAccount')}</Text>
          <Controller
            control={form.control}
            name="toAccountId"
            render={({ field: { value, onChange } }) => (
              <View style={styles.chipWrap}>
                {destinationAccounts.map((account) => (
                  <Pressable key={`to-${account.id}`} onPress={() => onChange(account.id)}>
                    <Chip
                      label={`${account.name} (${account.currency})`}
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

          <Text style={styles.fieldLabel}>{t('add.transfer.amount')}</Text>
          {isDeleteFlow ? (
            <View style={styles.readOnlyInput}>
              <Text style={styles.readOnlyValue}>{deleteFlowAmountLabel}</Text>
            </View>
          ) : (
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
                  placeholder={t('add.transfer.amountPlaceholder')}
                  placeholderTextColor={colors.textMuted}
                />
              )}
            />
          )}
          {form.formState.errors.amount ? (
            <Text style={styles.errorText}>{t(form.formState.errors.amount.message ?? '')}</Text>
          ) : null}

          <Text style={styles.fieldLabel}>{t('add.transfer.date')}</Text>
          <Controller
            control={form.control}
            name="occurredAt"
            render={({ field: { value, onChange, onBlur } }) => (
              <TextInput
                style={styles.input}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                autoCapitalize="none"
                placeholder={t('add.transfer.datePlaceholder')}
                placeholderTextColor={colors.textMuted}
              />
            )}
          />
          {form.formState.errors.occurredAt ? (
            <Text style={styles.errorText}>{t(form.formState.errors.occurredAt.message ?? '')}</Text>
          ) : null}

          <Text style={styles.fieldLabel}>{t('add.transfer.note')}</Text>
          <Controller
            control={form.control}
            name="description"
            render={({ field: { value, onChange, onBlur } }) => (
              <TextInput
                style={styles.input}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                placeholder={t('add.transfer.notePlaceholder')}
                placeholderTextColor={colors.textMuted}
              />
            )}
          />

          <PrimaryButton
            label={createTransferMutation.isPending ? t('common.saving') : t('add.transfer.submit')}
            onPress={submitTransfer}
          />
        </Card>
      </Section>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  formCard: {
    gap: spacing.sm,
  },
  stateCard: {
    gap: spacing.sm,
  },
  readOnlyGroup: {
    gap: spacing.xxs,
  },
  readOnlyInput: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  readOnlyValue: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
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
  errorText: {
    ...typography.caption,
    color: colors.expense,
  },
});
