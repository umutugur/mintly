import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import { budgetCreateInputSchema } from '@mintly/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { useAuth } from '@app/providers/AuthProvider';
import { apiClient } from '@core/api/client';
import { financeQueryKeys } from '@core/api/queryKeys';
import {
  buildSystemCategoryOptions,
  resolveCategoryPresentationByName,
} from '@features/finance/utils/categoryCatalog';
import { AppIcon, Card, PrimaryButton, ScreenContainer } from '@shared/ui';
import { useI18n } from '@shared/i18n';
import { radius, spacing, typography, useTheme } from '@shared/theme';
import { apiErrorText } from '@shared/utils/apiErrorText';
import { formatMonthLabel, getCurrentMonthString, shiftMonth } from '@shared/utils/month';

// stitch asset: stitch/export/stitch_ana_ekran_dashboard/bütçe_planlama/screen.png
// no touch/keyboard behavior changed by this PR.

const budgetFormSchema = z.object({
  categoryId: budgetCreateInputSchema.shape.categoryId,
  limitAmount: z
    .string()
    .trim()
    .min(1, 'errors.validation.limitAmountRequired')
    .refine((value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0;
    }, 'errors.validation.limitAmountPositive'),
});

const editBudgetFormSchema = z.object({
  limitAmount: z
    .string()
    .trim()
    .min(1, 'errors.validation.limitAmountRequired')
    .refine((value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0;
    }, 'errors.validation.limitAmountPositive'),
});

type BudgetFormValues = z.infer<typeof budgetFormSchema>;
type EditBudgetFormValues = z.infer<typeof editBudgetFormSchema>;

function formatMoney(amount: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function getProgressTone(percentUsed: number): {
  color: string;
  chipBackground: string;
  chipText: string;
} {
  if (percentUsed >= 100) {
    return {
      color: '#FF4D57',
      chipBackground: '#4D1F2A',
      chipText: '#FF7680',
    };
  }

  if (percentUsed >= 85) {
    return {
      color: '#F59E0B',
      chipBackground: '#4A3310',
      chipText: '#FFBF4D',
    };
  }

  return {
    color: '#22D3A6',
    chipBackground: '#113A33',
    chipText: '#52F3C1',
  };
}

function LoadingSkeleton({ dark }: { dark: boolean }) {
  const block = dark ? '#181C2E' : '#E8EDF7';

  return (
    <View style={styles.skeletonWrap}>
      <View style={[styles.skeletonHeader, { backgroundColor: block }]} />
      <View style={[styles.skeletonOverview, { backgroundColor: block }]} />
      <View style={[styles.skeletonRow, { backgroundColor: block }]} />
      <View style={[styles.skeletonRow, { backgroundColor: block }]} />
      <View style={[styles.skeletonRow, { backgroundColor: block }]} />
    </View>
  );
}

export function BudgetsScreen() {
  const { withAuth, user } = useAuth();
  const { theme, mode } = useTheme();
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();

  const [month, setMonth] = useState(getCurrentMonthString());
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);

  const currency = user?.baseCurrency ?? 'TRY';

  const budgetsQuery = useQuery({
    queryKey: financeQueryKeys.budgets.list(month),
    queryFn: () => withAuth((token) => apiClient.listBudgets({ month }, token)),
  });

  const categoriesQuery = useQuery({
    queryKey: financeQueryKeys.categories.list(),
    queryFn: () => withAuth((token) => apiClient.getCategories(token)),
  });

  const addForm = useForm<BudgetFormValues>({
    resolver: zodResolver(budgetFormSchema),
    defaultValues: {
      categoryId: '',
      limitAmount: '',
    },
  });

  const editForm = useForm<EditBudgetFormValues>({
    resolver: zodResolver(editBudgetFormSchema),
    defaultValues: {
      limitAmount: '',
    },
  });

  const categoryOptions = useMemo(
    () => buildSystemCategoryOptions(categoriesQuery.data?.categories ?? [], 'expense', t),
    [categoriesQuery.data?.categories, t],
  );

  const budgetedCategoryIds = useMemo(
    () => new Set((budgetsQuery.data?.budgets ?? []).map((budget) => budget.categoryId)),
    [budgetsQuery.data?.budgets],
  );

  const selectedCategoryValue = addForm.watch('categoryId');

  const selectedCategoryOption = useMemo(
    () => categoryOptions.find((category) => category.value === selectedCategoryValue) ?? null,
    [categoryOptions, selectedCategoryValue],
  );

  const availableCategories = useMemo(
    () =>
      categoryOptions.filter(
        (category) =>
          !budgetedCategoryIds.has(category.backendId) ||
          category.value === selectedCategoryValue,
      ),
    [budgetedCategoryIds, categoryOptions, selectedCategoryValue],
  );

  useEffect(() => {
    if (!composerOpen || selectedCategoryValue || availableCategories.length === 0) {
      return;
    }

    addForm.setValue('categoryId', availableCategories[0].value, { shouldValidate: true });
  }, [addForm, availableCategories, composerOpen, selectedCategoryValue]);

  async function invalidateMonthScopedData(targetMonth: string): Promise<void> {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: financeQueryKeys.budgets.month(targetMonth) }),
      queryClient.invalidateQueries({ queryKey: financeQueryKeys.analytics.month(targetMonth) }),
      queryClient.invalidateQueries({ queryKey: financeQueryKeys.dashboard.recent() }),
    ]);
  }

  const createBudgetMutation = useMutation({
    mutationFn: (values: BudgetFormValues) => {
      const selectedOption =
        categoryOptions.find((category) => category.value === values.categoryId) ??
        selectedCategoryOption;

      if (!selectedOption) {
        throw new Error(t('errors.validation.selectCategory'));
      }

      return withAuth((token) =>
        apiClient.createBudget(
          {
            categoryId: selectedOption.backendId,
            month,
            limitAmount: Number(values.limitAmount),
          },
          token,
        ),
      );
    },
    onSuccess: async () => {
      setComposerOpen(false);
      addForm.reset({ categoryId: '', limitAmount: '' });
      await invalidateMonthScopedData(month);
    },
    onError: (error) => {
      Alert.alert(t('errors.budget.createFailedTitle'), apiErrorText(error));
    },
  });

  const updateBudgetMutation = useMutation({
    mutationFn: (params: { id: string; values: EditBudgetFormValues }) =>
      withAuth((token) =>
        apiClient.updateBudget(
          params.id,
          {
            limitAmount: Number(params.values.limitAmount),
          },
          token,
        ),
      ),
    onSuccess: async () => {
      setEditingBudgetId(null);
      editForm.reset({ limitAmount: '' });
      await invalidateMonthScopedData(month);
    },
    onError: (error) => {
      Alert.alert(t('errors.budget.updateFailedTitle'), apiErrorText(error));
    },
  });

  const deleteBudgetMutation = useMutation({
    mutationFn: (budgetId: string) => withAuth((token) => apiClient.deleteBudget(budgetId, token)),
    onSuccess: async () => {
      await invalidateMonthScopedData(month);
    },
    onError: (error) => {
      Alert.alert(t('errors.budget.deleteFailedTitle'), apiErrorText(error));
    },
  });

  if (budgetsQuery.isLoading && !budgetsQuery.data) {
    return (
      <ScreenContainer scrollable={false} dark={mode === 'dark'} contentStyle={styles.containerContent}>
        <LoadingSkeleton dark={mode === 'dark'} />
      </ScreenContainer>
    );
  }

  if (budgetsQuery.isError && !budgetsQuery.data) {
    return (
      <ScreenContainer dark={mode === 'dark'}>
        <Card dark={mode === 'dark'}>
          <Text style={[styles.errorTitle, { color: theme.colors.text }]}>{t('budgets.state.unavailableTitle')}</Text>
          <Text style={[styles.errorText, { color: theme.colors.expense }]}>{apiErrorText(budgetsQuery.error)}</Text>
        </Card>
      </ScreenContainer>
    );
  }

  const budgets = budgetsQuery.data?.budgets ?? [];
  const overview = budgets.reduce(
    (accumulator, budget) => {
      accumulator.limit += budget.limitAmount;
      accumulator.spent += budget.spentAmount;
      return accumulator;
    },
    { limit: 0, spent: 0 },
  );

  const remaining = overview.limit - overview.spent;
  const usedPercent = overview.limit > 0 ? (overview.spent / overview.limit) * 100 : 0;
  const normalizedUsedPercent = Math.max(0, Math.min(100, usedPercent));

  const dark = mode === 'dark';
  const panelBg = dark ? '#14122A' : '#FFFFFF';
  const panelBorder = dark ? '#2C2753' : '#E3E9F5';
  const sectionBg = dark ? '#101229' : '#F8FAFF';
  const inputBg = dark ? '#111427' : '#FFFFFF';

  return (
    <ScreenContainer scrollable={false} dark={dark} contentStyle={styles.containerContent}>
      <View style={styles.rootWrap}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="always"
        >
          <View style={styles.topBar}>
            <Text style={[styles.topIcon, { color: theme.colors.text }]}>{'‹'}</Text>
            <Text style={[styles.screenTitle, { color: theme.colors.text }]}>{t('budgets.title')}</Text>
            <Text style={[styles.topIcon, { color: theme.colors.text }]}>⋮</Text>
          </View>

          <View style={styles.monthRow}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setMonth(shiftMonth(month, -1))}
              style={styles.monthArrow}
            >
              <Text style={[styles.monthArrowText, { color: theme.colors.text }]}>{'<'}</Text>
            </Pressable>

            <Text style={[styles.monthLabel, { color: theme.colors.textMuted }]}>{formatMonthLabel(month)}</Text>

            <Pressable
              accessibilityRole="button"
              onPress={() => setMonth(shiftMonth(month, 1))}
              style={styles.monthArrow}
            >
              <Text style={[styles.monthArrowText, { color: theme.colors.text }]}>{'>'}</Text>
            </Pressable>
          </View>

          <Card
            dark={dark}
            style={[
              styles.overviewCard,
              {
                backgroundColor: panelBg,
                borderColor: panelBorder,
              },
            ]}
          >
            <View style={styles.overviewHeader}>
              <Text style={[styles.overviewLabel, { color: theme.colors.textMuted }]}>{t('budgets.overview.totalMonthlyBudget')}</Text>
              <View style={[styles.overviewBadge, { backgroundColor: dark ? '#2F1CCF' : '#EEF0FF' }]}>
                <Text style={[styles.overviewBadgeText, { color: dark ? '#7F85FF' : '#4F46E5' }]}>{t('common.appInitials')}</Text>
              </View>
            </View>

            <Text style={[styles.overviewTotal, { color: theme.colors.text }]}>{formatMoney(overview.limit, currency, locale)}</Text>

            <View style={styles.overviewMetaRow}>
              <Text style={[styles.overviewMetaText, { color: theme.colors.textMuted }]}> 
                {t('budgets.overview.spentLabel', {
                  spent: formatMoney(overview.spent, currency, locale),
                  percent: usedPercent.toFixed(0),
                })}
              </Text>
              <Text style={[styles.overviewRemaining, { color: theme.colors.text }]}> 
                {t('budgets.overview.leftLabel', { remaining: formatMoney(Math.max(0, remaining), currency, locale) })}
              </Text>
            </View>

            <View style={[styles.overviewTrack, { backgroundColor: dark ? '#3B2F74' : '#DEE7FF' }]}> 
              <View
                style={[
                  styles.overviewFill,
                  {
                    width: `${normalizedUsedPercent}%`,
                    backgroundColor: usedPercent >= 100 ? '#FF4D57' : '#5B2BFF',
                  },
                ]}
              />
            </View>

            <View style={[styles.aiHint, { backgroundColor: dark ? '#1B1640' : '#EFF1FF' }]}> 
              <Text style={[styles.aiHintIcon, { color: theme.colors.primary }]}>✦</Text>
              <Text style={[styles.aiHintText, { color: theme.colors.textMuted }]}> 
                {t('budgets.overview.aiHintPrefix')}
                <Text style={[styles.aiHintStrong, { color: theme.colors.text }]}> {formatMoney(Math.max(0, remaining), currency, locale)}</Text>
                {' '}
                {t('budgets.overview.aiHintSuffix')}
              </Text>
            </View>
          </Card>

          {composerOpen ? (
            <Card
              dark={dark}
              style={[
                styles.composerCard,
                {
                  backgroundColor: panelBg,
                  borderColor: panelBorder,
                },
              ]}
            >
              <View style={styles.composerHeader}>
                <Text style={[styles.composerTitle, { color: theme.colors.text }]}>{t('budgets.composer.title')}</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setComposerOpen(false);
                    addForm.reset({ categoryId: '', limitAmount: '' });
                  }}
                >
                  <Text style={[styles.composerClose, { color: theme.colors.textMuted }]}>{t('common.close')}</Text>
                </Pressable>
              </View>

              {availableCategories.length === 0 ? (
                <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
                  {t('budgets.composer.noCategories')}
                </Text>
              ) : (
                <>
                  <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>{t('budgets.composer.category')}</Text>
                  <Controller
                    control={addForm.control}
                    name="categoryId"
                    render={({ field: { value, onChange } }) => (
                      <View style={styles.categoryChipWrap}>
                        {availableCategories.map((category) => {
                          const active = value === category.value;

                          return (
                            <Pressable
                              key={category.value}
                              accessibilityRole="button"
                              onPress={() => onChange(category.value)}
                              style={[
                                styles.categoryChip,
                                {
                                  backgroundColor: active
                                    ? '#5B2BFF'
                                    : dark
                                      ? 'rgba(255,255,255,0.06)'
                                      : '#EEF2FA',
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.categoryChipText,
                                  { color: active ? '#FFFFFF' : theme.colors.textMuted },
                                ]}
                              >
                                {category.label}
                              </Text>
                              <AppIcon
                                name={category.iconName}
                                size="xs"
                                color={active ? '#FFFFFF' : theme.colors.textMuted}
                              />
                            </Pressable>
                          );
                        })}
                      </View>
                    )}
                  />

                  {addForm.formState.errors.categoryId ? (
                    <Text style={[styles.errorText, { color: theme.colors.expense }]}>
                      {t(addForm.formState.errors.categoryId.message ?? '')}
                    </Text>
                  ) : null}

                  <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>{t('budgets.composer.limitAmount')}</Text>
                  <Controller
                    control={addForm.control}
                    name="limitAmount"
                    render={({ field: { value, onChange, onBlur } }) => (
                      <TextInput
                        autoCapitalize="none"
                        keyboardType="decimal-pad"
                        onBlur={onBlur}
                        onChangeText={onChange}
                        placeholder={t('budgets.composer.amountPlaceholder')}
                        placeholderTextColor={theme.colors.textMuted}
                        style={[
                          styles.amountInput,
                          {
                            backgroundColor: inputBg,
                            borderColor: panelBorder,
                            color: theme.colors.text,
                          },
                        ]}
                        value={value}
                      />
                    )}
                  />

                  {addForm.formState.errors.limitAmount ? (
                    <Text style={[styles.errorText, { color: theme.colors.expense }]}>
                      {t(addForm.formState.errors.limitAmount.message ?? '')}
                    </Text>
                  ) : null}

                  <PrimaryButton
                    label={createBudgetMutation.isPending ? t('budgets.composer.creating') : t('budgets.composer.create')}
                    onPress={addForm.handleSubmit((values) => {
                      createBudgetMutation.mutate(values);
                    })}
                    disabled={createBudgetMutation.isPending}
                  />
                </>
              )}
            </Card>
          ) : null}

          <View style={styles.sectionHeadRow}>
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{t('budgets.sections.spendingCategories')}</Text>
            <Text style={[styles.sectionLink, { color: '#5B2BFF' }]}>{t('budgets.sections.viewHistory')}</Text>
          </View>

          {budgets.length === 0 ? (
            <Card
              dark={dark}
              style={[
                styles.emptyCard,
                {
                  backgroundColor: panelBg,
                  borderColor: panelBorder,
                },
              ]}
            >
              <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>{t('budgets.state.empty')}</Text>
            </Card>
          ) : null}

          {budgets.map((budget, index) => {
            const percentUsed = budget.percentUsed;
            const normalizedPercent = Math.max(0, Math.min(100, percentUsed));
            const progress = getProgressTone(percentUsed);
            const iconBg = CATEGORY_ICON_BACKGROUNDS[index % CATEGORY_ICON_BACKGROUNDS.length];
            const overLimit = percentUsed >= 100;
            const presentation = resolveCategoryPresentationByName(budget.categoryName, 'expense', t);

            return (
              <Card
                key={budget.id}
                dark={dark}
                style={[
                  styles.budgetCard,
                  {
                    backgroundColor: panelBg,
                    borderColor: panelBorder,
                  },
                ]}
              >
                <View style={styles.budgetTopRow}>
                  <View style={styles.budgetMetaLeft}>
                    <View style={[styles.categoryIconWrap, { backgroundColor: iconBg }]}>
                      <AppIcon name={presentation.iconName} size="sm" color={theme.colors.text} />
                    </View>

                    <View>
                      <Text style={[styles.budgetName, { color: theme.colors.text }]}>
                        {presentation.label}
                      </Text>
                      <Text style={[styles.budgetMetaText, { color: theme.colors.textMuted }]}> 
                        {t('budgets.row.spentOf', {
                          spent: formatMoney(budget.spentAmount, currency, locale),
                          limit: formatMoney(budget.limitAmount, currency, locale),
                        })}
                      </Text>
                    </View>
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setEditingBudgetId((current) => {
                        if (current === budget.id) {
                          editForm.reset({ limitAmount: '' });
                          return null;
                        }

                        editForm.reset({ limitAmount: budget.limitAmount.toString() });
                        return budget.id;
                      });
                    }}
                    style={styles.editButton}
                  >
                    <Text style={[styles.editButtonText, { color: theme.colors.textMuted }]}>✎</Text>
                  </Pressable>
                </View>

                <View style={[styles.progressTrack, { backgroundColor: dark ? '#40346A' : '#E3EAFC' }]}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${normalizedPercent}%`,
                        backgroundColor: progress.color,
                      },
                    ]}
                  />
                </View>

                <View style={styles.metaFooter}>
                  <View style={[styles.percentChip, { backgroundColor: progress.chipBackground }]}> 
                    <Text style={[styles.percentChipText, { color: progress.chipText }]}>{percentUsed.toFixed(0)}%</Text>
                  </View>
                  {overLimit ? (
                    <Text style={[styles.overTag, { color: '#FF7680' }]}>{t('budgets.row.over')}</Text>
                  ) : (
                    <Text style={[styles.remainingText, { color: theme.colors.textMuted }]}>
                      {t('budgets.row.left', { remaining: formatMoney(Math.max(0, budget.remainingAmount), currency, locale) })}
                    </Text>
                  )}
                </View>

                {editingBudgetId === budget.id ? (
                  <View style={styles.inlineEditorWrap}>
                    <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>{t('budgets.inline.updateLimit')}</Text>
                    <Controller
                      control={editForm.control}
                      name="limitAmount"
                      render={({ field: { value, onChange, onBlur } }) => (
                        <TextInput
                          autoCapitalize="none"
                          keyboardType="decimal-pad"
                          onBlur={onBlur}
                          onChangeText={onChange}
                          placeholder={t('budgets.composer.amountPlaceholder')}
                          placeholderTextColor={theme.colors.textMuted}
                          style={[
                            styles.amountInput,
                            {
                              backgroundColor: inputBg,
                              borderColor: panelBorder,
                              color: theme.colors.text,
                            },
                          ]}
                          value={value}
                        />
                      )}
                    />

                    {editForm.formState.errors.limitAmount ? (
                      <Text style={[styles.errorText, { color: theme.colors.expense }]}>
                        {t(editForm.formState.errors.limitAmount.message ?? '')}
                      </Text>
                    ) : null}

                    <PrimaryButton
                      label={updateBudgetMutation.isPending ? t('common.saving') : t('budgets.inline.saveLimit')}
                      onPress={editForm.handleSubmit((values) => {
                        updateBudgetMutation.mutate({ id: budget.id, values });
                      })}
                      disabled={updateBudgetMutation.isPending}
                    />

                    <View style={styles.inlineActions}>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => {
                          setEditingBudgetId(null);
                          editForm.reset({ limitAmount: '' });
                        }}
                      >
                        <Text style={[styles.inlineActionText, { color: theme.colors.textMuted }]}>{t('common.cancel')}</Text>
                      </Pressable>

                      <Pressable
                        accessibilityRole="button"
                        onPress={() => {
                          Alert.alert(
                            t('budgets.delete.title'),
                            t('budgets.delete.message', { category: presentation.label, month }),
                            [
                              { text: t('common.cancel'), style: 'cancel' },
                              {
                                text: t('common.delete'),
                                style: 'destructive',
                                onPress: () => {
                                  deleteBudgetMutation.mutate(budget.id);
                                },
                              },
                            ],
                          );
                        }}
                      >
                        <Text style={styles.deleteText}>{t('common.delete')}</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
              </Card>
            );
          })}

          {deleteBudgetMutation.isPending ? (
            <View style={styles.inlineLoadingRow}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text style={[styles.inlineLoadingText, { color: theme.colors.textMuted }]}>
                {t('budgets.state.updating')}
              </Text>
            </View>
          ) : null}
        </ScrollView>

        <Pressable
          accessibilityRole="button"
          onPress={() => setComposerOpen((current) => !current)}
          style={[
            styles.fab,
            {
              backgroundColor: '#5B2BFF',
              shadowColor: dark ? '#000000' : '#4F46E5',
            },
          ]}
        >
          <Text style={styles.fabLabel}>{composerOpen ? '−' : '+'}</Text>
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

const CATEGORY_ICON_BACKGROUNDS = ['#523626', '#213B61', '#5A2A58', '#2D2D74', '#274B35'];

const styles = StyleSheet.create({
  containerContent: {
    flex: 1,
    gap: 0,
    paddingBottom: 0,
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  rootWrap: {
    flex: 1,
  },
  scrollContent: {
    gap: spacing.sm,
    paddingBottom: 110,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  topIcon: {
    ...typography.subheading,
    fontSize: 22,
    width: 32,
  },
  screenTitle: {
    ...typography.heading,
    fontSize: 24,
    textAlign: 'center',
  },
  monthRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  monthArrow: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  monthArrowText: {
    ...typography.subheading,
    fontSize: 18,
    fontWeight: '700',
  },
  monthLabel: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    minWidth: 168,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  overviewCard: {
    gap: spacing.sm,
  },
  overviewHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  overviewLabel: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  overviewBadge: {
    alignItems: 'center',
    borderRadius: radius.md,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  overviewBadgeText: {
    ...typography.subheading,
    fontWeight: '800',
  },
  overviewTotal: {
    ...typography.amount,
    fontSize: 52,
    fontWeight: '800',
    lineHeight: 58,
  },
  overviewMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  overviewMetaText: {
    ...typography.body,
    fontSize: 15,
  },
  overviewRemaining: {
    ...typography.subheading,
    fontSize: 32,
    fontWeight: '700',
  },
  overviewTrack: {
    borderRadius: radius.full,
    height: 10,
    overflow: 'hidden',
  },
  overviewFill: {
    borderRadius: radius.full,
    height: '100%',
  },
  aiHint: {
    alignItems: 'center',
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  aiHintIcon: {
    ...typography.subheading,
    fontSize: 15,
  },
  aiHintText: {
    ...typography.caption,
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
  aiHintStrong: {
    fontWeight: '800',
  },
  composerCard: {
    gap: spacing.sm,
  },
  composerHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  composerTitle: {
    ...typography.subheading,
    fontSize: 19,
    fontWeight: '700',
  },
  composerClose: {
    ...typography.caption,
    fontWeight: '700',
  },
  fieldLabel: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '700',
  },
  categoryChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  categoryChip: {
    alignItems: 'center',
    borderRadius: radius.full,
    flexDirection: 'row',
    gap: spacing.xxs,
    minHeight: 30,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  categoryChipText: {
    ...typography.caption,
    fontWeight: '700',
  },
  amountInput: {
    ...typography.body,
    borderRadius: radius.md,
    borderWidth: 1,
    height: 44,
    paddingHorizontal: spacing.sm,
  },
  sectionHeadRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  sectionTitle: {
    ...typography.heading,
    fontSize: 20,
  },
  sectionLink: {
    ...typography.subheading,
    fontWeight: '700',
  },
  emptyCard: {
    minHeight: 88,
    justifyContent: 'center',
  },
  emptyText: {
    ...typography.body,
  },
  budgetCard: {
    gap: spacing.sm,
  },
  budgetTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  budgetMetaLeft: {
    alignItems: 'center',
    flexDirection: 'row',
    flex: 1,
    gap: spacing.sm,
  },
  categoryIconWrap: {
    alignItems: 'center',
    borderRadius: radius.sm,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  budgetName: {
    ...typography.subheading,
    fontSize: 16,
    fontWeight: '700',
  },
  budgetMetaText: {
    ...typography.body,
    fontSize: 14,
  },
  editButton: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  editButtonText: {
    ...typography.subheading,
    fontSize: 16,
  },
  progressTrack: {
    borderRadius: radius.full,
    height: 6,
    overflow: 'hidden',
  },
  progressFill: {
    borderRadius: radius.full,
    height: '100%',
  },
  metaFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  percentChip: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  percentChipText: {
    ...typography.caption,
    fontWeight: '700',
  },
  overTag: {
    ...typography.caption,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  remainingText: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '600',
  },
  inlineEditorWrap: {
    gap: spacing.sm,
  },
  inlineActions: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  inlineActionText: {
    ...typography.caption,
    fontWeight: '700',
  },
  deleteText: {
    ...typography.caption,
    color: '#FF4D57',
    fontWeight: '700',
  },
  inlineLoadingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  inlineLoadingText: {
    ...typography.caption,
  },
  fab: {
    alignItems: 'center',
    borderRadius: radius.full,
    bottom: 32,
    elevation: 9,
    height: 56,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.lg,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    width: 56,
  },
  fabLabel: {
    ...typography.amount,
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '600',
    lineHeight: 30,
  },
  errorTitle: {
    ...typography.subheading,
  },
  errorText: {
    ...typography.body,
  },
  skeletonWrap: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  skeletonHeader: {
    borderRadius: radius.md,
    height: 42,
    width: '58%',
  },
  skeletonOverview: {
    borderRadius: radius.lg,
    height: 190,
    width: '100%',
  },
  skeletonRow: {
    borderRadius: radius.md,
    height: 86,
    width: '100%',
  },
});
