import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  accountTypeSchema,
  accountCreateInputSchema,
  type AccountType,
  type AccountUpdateInput,
  type DashboardRecentResponse,
} from '@mintly/shared';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { useAuth } from '@app/providers/AuthProvider';
import { apiClient } from '@core/api/client';
import { financeQueryKeys } from '@core/api/queryKeys';
import type { ProfileStackParamList } from '@core/navigation/stacks/ProfileStack';
import type { RootTabParamList } from '@core/navigation/types';
import { Card, Chip, PrimaryButton, ScreenContainer, Section } from '@shared/ui';
import { useI18n } from '@shared/i18n';
import { colors, radius, spacing, typography } from '@shared/theme';
import { apiErrorText } from '@shared/utils/apiErrorText';

const accountTypes: AccountType[] = ['cash', 'bank', 'credit'];

const createAccountFormSchema = z.object({
  name: accountCreateInputSchema.shape.name,
  type: accountCreateInputSchema.shape.type,
  currency: accountCreateInputSchema.shape.currency,
});

const editAccountFormSchema = z.object({
  name: z.string().trim().min(1, 'errors.validation.nameRequired').max(120),
  type: accountTypeSchema,
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
  const { t } = useI18n();
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const queryClient = useQueryClient();
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);

  const baseCurrency = user?.baseCurrency ?? null;

  const accountsQuery = useQuery({
    queryKey: financeQueryKeys.accounts.list(),
    queryFn: () => withAuth((token) => apiClient.getAccounts(token)),
  });

  const createForm = useForm<CreateAccountFormValues>({
    resolver: zodResolver(createAccountFormSchema),
    defaultValues: {
      name: '',
      type: 'bank',
      currency: baseCurrency ?? 'USD',
    },
  });

  const editForm = useForm<EditAccountFormValues>({
    resolver: zodResolver(editAccountFormSchema),
    defaultValues: {
      name: '',
      type: 'bank',
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

  const createAccountMutation = useMutation({
    mutationFn: (values: CreateAccountFormValues) =>
      withAuth((token) =>
        apiClient.createAccount(
          {
            name: values.name.trim(),
            type: values.type,
            currency: (baseCurrency ?? values.currency).toUpperCase(),
          },
          token,
        ),
      ),
    onSuccess: async () => {
      await invalidateAccountRelatedQueries();

      if (!baseCurrency) {
        await refreshUser();
      }

      createForm.reset({
        name: '',
        type: 'bank',
        currency: baseCurrency ?? createForm.getValues('currency'),
      });
    },
    onError: (error) => {
      Alert.alert(t('errors.account.createFailedTitle'), apiErrorText(error));
    },
  });

  const updateAccountMutation = useMutation({
    mutationFn: (params: { id: string; values: EditAccountFormValues }) =>
      withAuth((token) =>
        apiClient.updateAccount(
          params.id,
          {
            name: params.values.name.trim(),
            type: params.values.type,
          } satisfies AccountUpdateInput,
          token,
        ),
      ),
    onSuccess: async () => {
      setEditingAccountId(null);
      await invalidateAccountRelatedQueries();
      setFeedback({ tone: 'success', message: t('accounts.update.success') });
    },
    onError: (error) => {
      const message = apiErrorText(error) || t('accounts.update.error');
      Alert.alert(t('errors.account.updateFailedTitle'), message);
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
      Alert.alert(t('errors.account.deleteFailedTitle'), message);
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
      Alert.alert(t('errors.auth.logoutFailedTitle'), apiErrorText(error));
    }
  }, [logout, t]);

  const openTransfer = useCallback(() => {
    const parent = navigation.getParent?.();
    if (!parent || !('navigate' in parent)) {
      return;
    }

    (parent as {
      navigate: (routeName: keyof RootTabParamList, params?: RootTabParamList['AddTab']) => void;
    }).navigate('AddTab', { screen: 'Transfer' });
  }, [navigation]);

  const confirmDeleteAccount = useCallback(
    (accountId: string, accountName: string) => {
      if (deleteAccountMutation.isPending || updateAccountMutation.isPending) {
        return;
      }

      const dashboardData = queryClient.getQueryData<DashboardRecentResponse>(financeQueryKeys.dashboard.recent());
      const accountBalance = dashboardData?.balances.find((b) => b.accountId === accountId)?.balance ?? 0;

      if (accountBalance > 0) {
        Alert.alert(
          t('accounts.delete.hasBalanceTitle', { defaultValue: 'Hesapta Bakiye Var' }),
          t('accounts.delete.hasBalanceBody', { defaultValue: 'Bu hesabı silmeden önce içindeki bakiyeyi başka bir hesaba aktarmanız gerekmektedir.' }),
          [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('add.hub.transferAction'),
              onPress: openTransfer,
            }
          ]
        );
        return;
      }

      Alert.alert(
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
    [deleteAccountMutation, queryClient, openTransfer, t, updateAccountMutation.isPending],
  );

  if (accountsQuery.isLoading) {
    return (
      <ScreenContainer>
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.stateText}>{t('accounts.state.loading')}</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (accountsQuery.isError) {
    return (
      <ScreenContainer>
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
    <ScreenContainer>
      {feedback ? (
        <Card
          style={[
            styles.feedbackCard,
            feedback.tone === 'success' ? styles.feedbackSuccess : styles.feedbackError,
          ]}
        >
          <Text style={styles.feedbackText}>{feedback.message}</Text>
        </Card>
      ) : null}

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

        {accounts.map((account) => (
          <Card key={account.id} style={styles.accountCard}>
            <View style={styles.accountHeader}>
              <View style={styles.accountMeta}>
                <Text style={styles.accountName}>{account.name}</Text>
                <Text style={styles.accountSub}>{`${getAccountTypeLabel(account.type, t, account.name)} · ${account.currency}`}</Text>
              </View>

              <View style={styles.accountActions}>
                <Pressable
                  disabled={updateAccountMutation.isPending || deleteAccountMutation.isPending}
                  onPress={() => {
                    setEditingAccountId(account.id);
                    editForm.reset({
                      name: account.name,
                      type: account.type,
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
        ))}
      </Section>
    </ScreenContainer>
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
  input: {
    height: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    color: colors.text,
    ...typography.body,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
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
    marginBottom: spacing.sm,
    borderWidth: 1,
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
