import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  accountTypeSchema, accountCreateInputSchema, type AccountType, type AccountUpdateInput, } from '@mintly/shared';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { z } from 'zod';

import { useAuth } from '@app/providers/AuthProvider';
import { apiClient } from '@core/api/client';
import { financeQueryKeys } from '@core/api/queryKeys';
import type { TransferScreenParams } from '@core/navigation/stacks/AddStack';
import type { ProfileStackParamList } from '@core/navigation/stacks/ProfileStack';
import type { RootTabParamList } from '@core/navigation/types';
import { Card, Chip, PrimaryButton, ScreenContainer, Section, showAlert } from '@shared/ui';
import { useI18n } from '@shared/i18n';
import { colors, radius, spacing, typography } from '@shared/theme';
import { apiErrorText } from '@shared/utils/apiErrorText';

const accountTypes: AccountType[] = ['cash', 'bank', 'credit', 'debt_lent', 'debt_borrowed'];
const LIABILITY_ACCOUNT_TYPES: AccountType[] = ['credit', 'debt_borrowed'];

function isLiabilityAccountType(type: AccountType): boolean {
  return LIABILITY_ACCOUNT_TYPES.includes(type);
}

function parseSignedAmount(value: string): number | null {
  const normalized = value.trim().replace(/,/g, '.');
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

function formatSignedBalance(amount: number, currency: string, locale: string): string {
  const formatted = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));

  if (amount > 0) {
    return `+${formatted}`;
  }

  if (amount < 0) {
    return `-${formatted}`;
  }

  return formatted;
}

const signedAmountInputSchema = z
  .string()
  .trim()
  .min(1, 'errors.validation.amountRequired')
  .refine((value) => parseSignedAmount(value) !== null, 'errors.validation.invalidSignedAmount');

const createAccountFormSchema = z.object({
  name: accountCreateInputSchema.shape.name,
  type: accountCreateInputSchema.shape.type,
  currency: accountCreateInputSchema.shape.currency,
  openingBalance: signedAmountInputSchema,
});

const editAccountFormSchema = z.object({
  name: z.string().trim().min(1, 'errors.validation.nameRequired').max(120),
  type: accountTypeSchema,
  openingBalance: signedAmountInputSchema,
});

type CreateAccountFormValues = z.infer<typeof createAccountFormSchema>;
type EditAccountFormValues = z.infer<typeof editAccountFormSchema>;
type FeedbackState = {
  tone: 'success' | 'error';
  message: string;
};

function getAccountTypeLabel(
  type: AccountType,
  t: (key: string, params?: Record<string, string | number>) => string,
  accountName?: string,
): string {
  const normalizedName = (accountName ?? '')
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

  const richKeyByType: Record<AccountType, string> = {
    bank: 'accounts.accountType.bankAccount',
    cash: 'accounts.accountType.cashWallet',
    credit: 'accounts.accountType.creditCard',
    debt_lent: 'accounts.accountType.debtLent',
    debt_borrowed: 'accounts.accountType.debtBorrowed',
  };

  const rich = t(richKeyByType[type]);
  if (rich) {
    return rich;
  }

  const primary = t(`accounts.accountType.${type}`);
  if (primary) {
    return primary;
  }

  const fallback = t(`dashboard.accountTypes.${type}`);
  if (fallback) {
    return fallback;
  }

  return type.toUpperCase();
}

export function AccountsScreen() {
  const { withAuth, user, refreshUser, logout } = useAuth();
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const queryClient = useQueryClient();
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);

  const baseCurrency = user?.baseCurrency ?? null;

  const accountsQuery = useQuery({
    queryKey: financeQueryKeys.accounts.list(),
    queryFn: () => withAuth((token) => apiClient.getAccounts(token)),
  });
  const dashboardQuery = useQuery({
    queryKey: financeQueryKeys.dashboard.recent(),
    queryFn: () => withAuth((token) => apiClient.getDashboardRecent(token)),
  });

  const createForm = useForm<CreateAccountFormValues>({
    resolver: zodResolver(createAccountFormSchema),
    defaultValues: {
      name: '',
      type: 'bank',
      currency: baseCurrency ?? 'USD',
      openingBalance: '0',
    },
  });

  const editForm = useForm<EditAccountFormValues>({
    resolver: zodResolver(editAccountFormSchema),
    defaultValues: {
      name: '',
      type: 'bank',
      openingBalance: '0',
    },
  });

  useEffect(() => {
    if (baseCurrency) {
      createForm.setValue('currency', baseCurrency, { shouldValidate: true });
    }
  }, [baseCurrency, createForm]);

  useEffect(() => {
    if (!feedback) {
      return;
    }

    const timeoutId = setTimeout(() => {
      setFeedback(null);
    }, 2500);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [feedback]);

  const invalidateAccountRelatedQueries = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: financeQueryKeys.accounts.all() }),
      queryClient.invalidateQueries({ queryKey: financeQueryKeys.dashboard.recent() }),
      queryClient.invalidateQueries({ queryKey: financeQueryKeys.analytics.all() }),
      queryClient.invalidateQueries({ queryKey: financeQueryKeys.transactions.all() }),
    ]);
  }, [queryClient]);

  const balanceByAccountId = useMemo(
    () => new Map((dashboardQuery.data?.balances ?? []).map((balance) => [balance.accountId, balance.balance])),
    [dashboardQuery.data?.balances],
  );

  const createSelectedType = createForm.watch('type');
  const createOpeningBalance = parseSignedAmount(createForm.watch('openingBalance') ?? '') ?? 0;
  const createLooksLiability = isLiabilityAccountType(createSelectedType) || createOpeningBalance < 0;
  const editSelectedType = editForm.watch('type');
  const editOpeningBalance = parseSignedAmount(editForm.watch('openingBalance') ?? '') ?? 0;
  const editLooksLiability = isLiabilityAccountType(editSelectedType) || editOpeningBalance < 0;

  const createAccountMutation = useMutation({
    mutationFn: (values: CreateAccountFormValues) => {
      const openingBalance = parseSignedAmount(values.openingBalance) ?? 0;
      return withAuth((token) =>
        apiClient.createAccount(
          {
            name: values.name.trim(),
            type: values.type,
            currency: (baseCurrency ?? values.currency).toUpperCase(),
            openingBalance,
          },
          token,
        ),
      );
    },
    onSuccess: async () => {
      await invalidateAccountRelatedQueries();

      if (!baseCurrency) {
        await refreshUser();
      }

      createForm.reset({
        name: '',
        type: 'bank',
        currency: baseCurrency ?? createForm.getValues('currency'),
        openingBalance: '0',
      });
      setFeedback({ tone: 'success', message: t('accounts.create.success') });
    },
    onError: (error) => {
      showAlert(t('errors.account.createFailedTitle'), apiErrorText(error));
      setFeedback({ tone: 'error', message: t('accounts.create.error') });
    },
  });

  const updateAccountMutation = useMutation({
    mutationFn: (params: { id: string; values: EditAccountFormValues }) => {
      const openingBalance = parseSignedAmount(params.values.openingBalance) ?? 0;
      return withAuth((token) =>
        apiClient.updateAccount(
          params.id,
          {
            name: params.values.name.trim(),
            type: params.values.type,
            openingBalance,
          } satisfies AccountUpdateInput,
          token,
        ),
      );
    },
    onSuccess: async () => {
      setEditingAccountId(null);
      await invalidateAccountRelatedQueries();
      setFeedback({ tone: 'success', message: t('accounts.update.success') });
    },
    onError: (error) => {
      const message = apiErrorText(error) || t('accounts.update.error');
      showAlert(t('errors.account.updateFailedTitle'), message);
      setFeedback({ tone: 'error', message: t('accounts.update.error') });
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: (accountId: string) =>
      withAuth((token) => apiClient.deleteAccount(accountId, token)),
    onSuccess: async (_, accountId) => {
      if (editingAccountId === accountId) {
        setEditingAccountId(null);
      }
      await invalidateAccountRelatedQueries();
      setFeedback({ tone: 'success', message: t('accounts.delete.success') });
    },
    onError: (error) => {
      const message = apiErrorText(error) || t('accounts.delete.error');
      showAlert(t('errors.account.deleteFailedTitle'), message);
      setFeedback({ tone: 'error', message: t('accounts.delete.error') });
    },
  });

  const editingAccount = useMemo(
    () => accountsQuery.data?.accounts.find((account) => account.id === editingAccountId) ?? null,
    [accountsQuery.data?.accounts, editingAccountId],
  );

  const handleLogout = useCallback(async () => {
    try {
      await logout();
    } catch (error) {
      showAlert(t('errors.auth.logoutFailedTitle'), apiErrorText(error));
    }
  }, [logout, t]);

  const openTransfer = useCallback((params?: TransferScreenParams) => {
    const parent = navigation.getParent?.();
    if (!parent || !('navigate' in parent)) {
      return;
    }

    (parent as {
      navigate: (routeName: keyof RootTabParamList, params?: RootTabParamList['AddTab']) => void;
    }).navigate('AddTab', {
      screen: 'Transfer',
      params,
    });
  }, [navigation]);

  const confirmDeleteAccount = useCallback(
    (accountId: string, accountName: string) => {
      if (deleteAccountMutation.isPending || updateAccountMutation.isPending) {
        return;
      }

      const accountBalance = balanceByAccountId.get(accountId) ?? 0;

      if (Math.abs(accountBalance) > 0.0001) {
        showAlert(
          t('accounts.delete.hasBalanceTitle', { defaultValue: 'Hesapta Bakiye Var' }),
          t('accounts.delete.hasBalanceBody', { defaultValue: 'Bu hesabı silmeden önce içindeki bakiyeyi başka bir hesaba aktarmanız gerekmektedir.' }),
          [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('add.hub.transferAction'),
              onPress: () =>
                openTransfer({
                  deleteSourceAccountId: accountId,
                  deleteSourceAccountName: accountName,
                  deleteSourceBalance: accountBalance,
                }),
            }
          ]
        );
        return;
      }

      showAlert(
        t('accounts.delete.confirmTitle'),
        t('accounts.delete.confirmBody', { name: accountName }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.delete'),
            style: 'destructive',
            onPress: () => {
              deleteAccountMutation.mutate(accountId);
            },
          },
        ],
      );
    },
    [balanceByAccountId, deleteAccountMutation, openTransfer, t, updateAccountMutation.isPending],
  );

  if (accountsQuery.isLoading) {
    return (
      <ScreenContainer safeAreaEdges={['left', 'right']} contentStyle={styles.screenContent}>
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.stateText}>{t('accounts.state.loading')}</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (accountsQuery.isError) {
    return (
      <ScreenContainer safeAreaEdges={['left', 'right']} contentStyle={styles.screenContent}>
        <Card style={styles.errorCard}>
          <Text style={styles.errorTitle}>{t('accounts.state.loadErrorTitle')}</Text>
          <Text style={styles.errorText}>{apiErrorText(accountsQuery.error)}</Text>
          <PrimaryButton label={t('common.retry')} onPress={() => void accountsQuery.refetch()} />
        </Card>
      </ScreenContainer>
    );
  }

  const accounts = accountsQuery.data?.accounts ?? [];

  return (
    <View style={styles.screenRoot}>
      <ScreenContainer safeAreaEdges={['left', 'right']} contentStyle={styles.screenContent}>
        <Section title={t('accounts.sections.baseCurrency.title')} subtitle={t('accounts.sections.baseCurrency.subtitle')}>
          <Card>
            <Text style={styles.baseCurrencyText}>
              {baseCurrency
                ? t('accounts.baseCurrency.value', { currency: baseCurrency })
                : t('accounts.baseCurrency.empty')}
            </Text>
          </Card>
        </Section>

        <Section title={t('accounts.sections.session.title')} subtitle={user?.email ?? t('accounts.session.signedIn')}>
          <Card style={styles.sessionCard}>
            <PrimaryButton
              iconName="swap-horizontal-outline"
              label={t('add.hub.transferAction')}
              onPress={openTransfer}
            />
            <PrimaryButton
              label={t('profile.logOut')}
              onPress={() => {
                void handleLogout();
              }}
            />
            <Pressable
              style={styles.secondaryAction}
              onPress={() => {
                void handleLogout();
              }}
            >
              <Text style={styles.secondaryActionText}>{t('profile.useDifferentAccount')}</Text>
            </Pressable>
          </Card>
        </Section>

        <Section title={t('accounts.sections.create.title')}>
          <Card style={styles.formCard}>
          <Text style={styles.fieldLabel}>{t('accounts.form.nameLabel')}</Text>
          <Controller
            control={createForm.control}
            name="name"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                style={styles.input}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                editable={!createAccountMutation.isPending}
                placeholder={t('accounts.form.namePlaceholder')}
                placeholderTextColor={colors.textMuted}
              />
            )}
          />
          {createForm.formState.errors.name ? (
            <Text style={styles.errorText}>{t(createForm.formState.errors.name.message ?? '')}</Text>
          ) : null}

          <Text style={styles.fieldLabel}>{t('accounts.form.typeLabel')}</Text>
          <Controller
            control={createForm.control}
            name="type"
            render={({ field: { onChange, value } }) => (
              <TypePicker
                selected={value}
                onSelect={onChange}
                disabled={createAccountMutation.isPending}
              />
            )}
          />

          <Text style={styles.fieldLabel}>{t('accounts.form.currencyLabel')}</Text>
          {baseCurrency ? (
            <Chip label={baseCurrency} tone="primary" />
          ) : (
            <Controller
              control={createForm.control}
              name="currency"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  style={styles.input}
                  value={value}
                  onChangeText={(next) => onChange(next.toUpperCase())}
                  onBlur={onBlur}
                  editable={!createAccountMutation.isPending}
                  placeholder={t('accounts.form.currencyPlaceholder')}
                  autoCapitalize="characters"
                  maxLength={3}
                  placeholderTextColor={colors.textMuted}
                />
              )}
            />
          )}
          {createForm.formState.errors.currency ? (
            <Text style={styles.errorText}>{t(createForm.formState.errors.currency.message ?? '')}</Text>
          ) : null}

          <Text style={styles.fieldLabel}>{t('accounts.form.openingBalanceLabel')}</Text>
          <Controller
            control={createForm.control}
            name="openingBalance"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                style={styles.input}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                editable={!createAccountMutation.isPending}
                placeholder={t('accounts.form.openingBalancePlaceholder')}
                keyboardType="numbers-and-punctuation"
                placeholderTextColor={colors.textMuted}
              />
            )}
          />
          {createForm.formState.errors.openingBalance ? (
            <Text style={styles.errorText}>{t(createForm.formState.errors.openingBalance.message ?? '')}</Text>
          ) : null}
          <Text style={styles.helperText}>
            {createLooksLiability ? t('accounts.form.liabilityHint') : t('accounts.form.assetHint')}
          </Text>

          <PrimaryButton
            label={createAccountMutation.isPending ? t('accounts.form.creating') : t('accounts.form.create')}
            loading={createAccountMutation.isPending}
            disabled={createAccountMutation.isPending}
            onPress={createForm.handleSubmit((values) => {
              createAccountMutation.mutate(values);
            })}
          />
          </Card>
        </Section>

        <Section title={t('accounts.sections.list.title')} subtitle={t('accounts.sections.list.total', { count: accounts.length })}>
          {accounts.length === 0 ? (
            <Card>
              <Text style={styles.emptyText}>{t('accounts.state.empty')}</Text>
            </Card>
          ) : null}

          {accounts.map((account) => {
            const accountBalance = balanceByAccountId.get(account.id) ?? account.openingBalance ?? 0;
            const accountRoleLabel = isLiabilityAccountType(account.type)
              ? t('accounts.balance.liabilityTag')
              : account.type === 'debt_lent'
                ? t('accounts.balance.assetTag')
                : null;

            return (
            <Card key={account.id} style={styles.accountCard}>
            <View style={styles.accountHeader}>
              <View style={styles.accountMeta}>
                <Text style={styles.accountName}>{account.name}</Text>
                <Text style={styles.accountSub}>{`${getAccountTypeLabel(account.type, t, account.name)} · ${account.currency}`}</Text>
                <Text
                  style={[
                    styles.accountBalance,
                    accountBalance > 0
                      ? styles.accountBalancePositive
                      : accountBalance < 0
                        ? styles.accountBalanceNegative
                        : styles.accountBalanceNeutral,
                  ]}
                >
                  {t('accounts.balance.value', {
                    value: formatSignedBalance(accountBalance, account.currency, locale),
                  })}
                </Text>
                {accountRoleLabel ? <Text style={styles.accountRole}>{accountRoleLabel}</Text> : null}
              </View>

              <View style={styles.accountActions}>
                <Pressable
                  disabled={updateAccountMutation.isPending || deleteAccountMutation.isPending}
                  onPress={() => {
                    setEditingAccountId(account.id);
                    editForm.reset({
                      name: account.name,
                      type: account.type,
                      openingBalance: String(account.openingBalance ?? 0),
                    });
                  }}
                >
                  <Text
                    style={[
                      styles.linkText,
                      updateAccountMutation.isPending || deleteAccountMutation.isPending
                        ? styles.disabledLinkText
                        : null,
                    ]}
                  >
                    {t('common.edit')}
                  </Text>
                </Pressable>

                <Pressable
                  disabled={updateAccountMutation.isPending || deleteAccountMutation.isPending}
                  onPress={() => {
                    confirmDeleteAccount(account.id, account.name);
                  }}
                >
                  <Text
                    style={[
                      styles.deleteLinkText,
                      updateAccountMutation.isPending || deleteAccountMutation.isPending
                        ? styles.disabledLinkText
                        : null,
                    ]}
                  >
                    {t('common.delete')}
                  </Text>
                </Pressable>
              </View>
            </View>

            {editingAccountId === account.id && editingAccount ? (
              <View style={styles.inlineEditor}>
                <Text style={styles.fieldLabel}>{t('accounts.form.nameLabel')}</Text>
                <Controller
                  control={editForm.control}
                  name="name"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      style={styles.input}
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      editable={!updateAccountMutation.isPending && !deleteAccountMutation.isPending}
                      placeholder={t('accounts.form.namePlaceholder')}
                      placeholderTextColor={colors.textMuted}
                    />
                  )}
                />
                {editForm.formState.errors.name ? (
                  <Text style={styles.errorText}>{t(editForm.formState.errors.name.message ?? '')}</Text>
                ) : null}

                <Text style={styles.fieldLabel}>{t('accounts.form.typeLabel')}</Text>
                <Controller
                  control={editForm.control}
                  name="type"
                  render={({ field: { onChange, value } }) => (
                    <TypePicker
                      selected={value}
                      onSelect={onChange}
                      disabled={updateAccountMutation.isPending || deleteAccountMutation.isPending}
                    />
                  )}
                />

                <Text style={styles.fieldLabel}>{t('accounts.form.openingBalanceLabel')}</Text>
                <Controller
                  control={editForm.control}
                  name="openingBalance"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      style={styles.input}
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      editable={!updateAccountMutation.isPending && !deleteAccountMutation.isPending}
                      placeholder={t('accounts.form.openingBalancePlaceholder')}
                      keyboardType="numbers-and-punctuation"
                      placeholderTextColor={colors.textMuted}
                    />
                  )}
                />
                {editForm.formState.errors.openingBalance ? (
                  <Text style={styles.errorText}>{t(editForm.formState.errors.openingBalance.message ?? '')}</Text>
                ) : null}
                <Text style={styles.helperText}>
                  {editLooksLiability ? t('accounts.form.liabilityHint') : t('accounts.form.assetHint')}
                </Text>

                <View style={styles.editorActions}>
                  <PrimaryButton
                    label={updateAccountMutation.isPending ? t('common.saving') : t('common.save')}
                    loading={updateAccountMutation.isPending}
                    disabled={updateAccountMutation.isPending || deleteAccountMutation.isPending}
                    onPress={editForm.handleSubmit((values) => {
                      updateAccountMutation.mutate({ id: editingAccount.id, values });
                    })}
                  />
                  <Pressable
                    disabled={updateAccountMutation.isPending || deleteAccountMutation.isPending}
                    style={styles.secondaryAction}
                    onPress={() => {
                      setEditingAccountId(null);
                    }}
                  >
                    <Text style={styles.secondaryActionText}>{t('common.cancel')}</Text>
                  </Pressable>

                  <Pressable
                    disabled={updateAccountMutation.isPending || deleteAccountMutation.isPending}
                    style={styles.secondaryAction}
                    onPress={() => {
                      confirmDeleteAccount(editingAccount.id, editingAccount.name);
                    }}
                  >
                    <Text style={styles.deleteLinkText}>{t('common.delete')}</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
            </Card>
            );
          })}
        </Section>
      </ScreenContainer>

      {feedback ? (
        <View
          pointerEvents="none"
          style={[
            styles.feedbackOverlay,
            { top: Math.max(insets.top + spacing.xs, spacing.md) },
          ]}
        >
          <Card
            style={[
              styles.feedbackCard,
              feedback.tone === 'success' ? styles.feedbackSuccess : styles.feedbackError,
            ]}
          >
            <Text style={styles.feedbackText}>{feedback.message}</Text>
          </Card>
        </View>
      ) : null}
    </View>
  );
}

function TypePicker({
  selected,
  onSelect,
  disabled = false,
}: {
  selected: AccountType;
  onSelect: (value: AccountType) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();

  return (
    <View style={styles.chipWrap}>
      {accountTypes.map((type) => (
        <Pressable
          key={type}
          disabled={disabled}
          onPress={() => onSelect(type)}
          style={disabled ? styles.disabledPressable : null}
        >
          <Chip
            label={getAccountTypeLabel(type, t)}
            tone={selected === type ? 'primary' : 'default'}
          />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
  },
  screenContent: {
    paddingTop: 0,
    paddingBottom: 0,
  },
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
  },
  stateText: {
    ...typography.body,
    color: colors.textMuted,
  },
  formCard: {
    gap: spacing.sm,
  },
  fieldLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  helperText: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 0,
  },
  input: {
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    color: colors.text,
    ...typography.body,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    justifyContent: 'center',
  },
  disabledPressable: {
    opacity: 0.6,
  },
  accountCard: {
    gap: spacing.sm,
  },
  accountHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  accountMeta: {
    flex: 1,
    gap: spacing.xxs,
  },
  accountName: {
    ...typography.subheading,
    color: colors.text,
  },
  accountSub: {
    ...typography.caption,
    color: colors.textMuted,
  },
  accountBalance: {
    ...typography.subheading,
    fontSize: 14,
  },
  accountBalancePositive: {
    color: colors.income,
  },
  accountBalanceNegative: {
    color: colors.expense,
  },
  accountBalanceNeutral: {
    color: colors.textMuted,
  },
  accountRole: {
    ...typography.caption,
    color: colors.textMuted,
  },
  linkText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
  },
  deleteLinkText: {
    ...typography.caption,
    color: colors.expense,
    fontWeight: '600',
  },
  disabledLinkText: {
    opacity: 0.45,
  },
  accountActions: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  inlineEditor: {
    gap: spacing.sm,
  },
  editorActions: {
    gap: spacing.xs,
  },
  secondaryAction: {
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  secondaryActionText: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '600',
  },
  baseCurrencyText: {
    ...typography.body,
    color: colors.text,
  },
  sessionCard: {
    gap: spacing.xs,
  },
  feedbackCard: {
    borderWidth: 1,
    width: '100%',
  },
  feedbackSuccess: {
    borderColor: '#17B26A',
    backgroundColor: '#EAF9F0',
  },
  feedbackError: {
    borderColor: '#F04438',
    backgroundColor: '#FDECEC',
  },
  feedbackText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  feedbackOverlay: {
    alignItems: 'center',
    left: spacing.md,
    position: 'absolute',
    right: spacing.md,
    zIndex: 9,
  },
  errorCard: {
    gap: spacing.sm,
  },
  errorTitle: {
    ...typography.subheading,
    color: colors.text,
  },
  errorText: {
    ...typography.caption,
    color: colors.expense,
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
  },
});
