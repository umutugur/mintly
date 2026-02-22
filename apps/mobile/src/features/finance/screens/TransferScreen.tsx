import { useMemo } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import { transferCreateInputSchema } from '@mintly/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { useAuth } from '@app/providers/AuthProvider';
import { apiClient } from '@core/api/client';
import { financeQueryKeys } from '@core/api/queryKeys';
import { Card, Chip, PrimaryButton, ScreenContainer, Section } from '@shared/ui';
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

export function TransferScreen() {
  const { withAuth } = useAuth();
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const accountsQuery = useQuery({
    queryKey: financeQueryKeys.accounts.list(),
    queryFn: () => withAuth((token) => apiClient.getAccounts(token)),
  });

  const form = useForm<TransferFormValues>({
    resolver: zodResolver(transferFormSchema),
    defaultValues: {
      fromAccountId: '',
      toAccountId: '',
      amount: '',
      occurredAt: new Date().toISOString(),
      description: '',
    },
  });

  const accounts = accountsQuery.data?.accounts ?? [];
  const accountById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );

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

      form.reset({
        fromAccountId: '',
        toAccountId: '',
        amount: '',
        occurredAt: new Date().toISOString(),
        description: '',
      });
      Alert.alert(t('transfers.successTitle'), t('success.transferCreated'));
    },
    onError: (error) => {
      Alert.alert(t('errors.transfer.createFailedTitle'), apiErrorText(error));
    },
  });

  const submitTransfer = form.handleSubmit((values) => {
    const fromAccount = accountById.get(values.fromAccountId);
    const toAccount = accountById.get(values.toAccountId);

    if (fromAccount && toAccount && fromAccount.currency !== toAccount.currency) {
      form.setError('toAccountId', { type: 'validate', message: 'errors.currencyMismatch' });
      return;
    }

    createTransferMutation.mutate(values);
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

  if (accounts.length < 2) {
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
          <Text style={styles.fieldLabel}>{t('add.transfer.fromAccount')}</Text>
          <Controller
            control={form.control}
            name="fromAccountId"
            render={({ field: { value, onChange } }) => (
              <View style={styles.chipWrap}>
                {accounts.map((account) => (
                  <Pressable key={`from-${account.id}`} onPress={() => onChange(account.id)}>
                    <Chip
                      label={`${account.name} (${account.currency})`}
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

          <Text style={styles.fieldLabel}>{t('add.transfer.toAccount')}</Text>
          <Controller
            control={form.control}
            name="toAccountId"
            render={({ field: { value, onChange } }) => (
              <View style={styles.chipWrap}>
                {accounts.map((account) => (
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
