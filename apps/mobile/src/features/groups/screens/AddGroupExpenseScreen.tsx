import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { GroupExpenseCreateInput } from '@mintly/shared';

import { apiClient } from '@core/api/client';
import { financeQueryKeys } from '@core/api/queryKeys';
import { useAuth } from '@app/providers/AuthProvider';
import {
  AppIcon, Card, GradientCard, MemberChip, PrimaryButton, ScreenContainer, SplitToggle, TextField, showAlert } from '@shared/ui';
import { useI18n } from '@shared/i18n';
import type { TransactionsStackParamList } from '@core/navigation/stacks/TransactionsStack';
import { radius, spacing, typography, useTheme } from '@shared/theme';
import { apiErrorText } from '@shared/utils/apiErrorText';

type SplitMode = 'equal' | 'custom';

const CATEGORY_OPTIONS: Array<{
  id: 'food' | 'transport' | 'rent' | 'bills' | 'shopping' | 'other';
  iconName: Parameters<typeof AppIcon>[0]['name'];
  key: string;
}> = [
  { id: 'food', iconName: 'restaurant-outline', key: 'split.addExpense.categoryOptions.food' },
  { id: 'transport', iconName: 'car-sport-outline', key: 'split.addExpense.categoryOptions.transport' },
  { id: 'rent', iconName: 'home-outline', key: 'split.addExpense.categoryOptions.rent' },
  { id: 'bills', iconName: 'receipt-outline', key: 'split.addExpense.categoryOptions.bills' },
  { id: 'shopping', iconName: 'bag-outline', key: 'split.addExpense.categoryOptions.shopping' },
  { id: 'other', iconName: 'ellipse-outline', key: 'split.addExpense.categoryOptions.other' },
];

function toInputDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatMoney(amount: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function parseDecimal(value: string): number {
  return Number(value.replace(',', '.').trim());
}

export function AddGroupExpenseScreen() {
  const route = useRoute<RouteProp<TransactionsStackParamList, 'AddGroupExpense'>>();
  const navigation = useNavigation<NativeStackNavigationProp<TransactionsStackParamList>>();
  const queryClient = useQueryClient();
  const { withAuth, user } = useAuth();
  const { theme, mode } = useTheme();
  const { locale, t } = useI18n();

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(toInputDate(new Date()));
  const [selectedCategoryId, setSelectedCategoryId] = useState<(typeof CATEGORY_OPTIONS)[number]['id']>('food');
  const [splitMode, setSplitMode] = useState<SplitMode>('equal');
  const [paidByMemberId, setPaidByMemberId] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [customSplits, setCustomSplits] = useState<Record<string, string>>({});
  const [showPaidByOptions, setShowPaidByOptions] = useState(false);

  const groupQuery = useQuery({
    queryKey: financeQueryKeys.groups.detail(route.params.groupId),
    queryFn: () => withAuth((token) => apiClient.getGroup(route.params.groupId, token)),
  });

  useEffect(() => {
    if (!groupQuery.data) {
      return;
    }

    const ids = groupQuery.data.members.map((member) => member.id);
    if (!paidByMemberId && ids.length > 0) {
      setPaidByMemberId(ids[0]);
    }

    if (selectedMemberIds.length === 0 && ids.length > 0) {
      setSelectedMemberIds(ids);
    }
  }, [groupQuery.data, paidByMemberId, selectedMemberIds.length]);

  const members = groupQuery.data?.members ?? [];

  const activeMembers = useMemo(
    () => members.filter((member) => selectedMemberIds.includes(member.id)),
    [members, selectedMemberIds],
  );

  const currency = user?.baseCurrency ?? 'TRY';

  const createMutation = useMutation({
    mutationFn: (payload: GroupExpenseCreateInput) =>
      withAuth((token) => apiClient.createGroupExpense(route.params.groupId, payload, token)),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: financeQueryKeys.groups.detail(route.params.groupId) }),
        queryClient.invalidateQueries({ queryKey: financeQueryKeys.groups.expenses(route.params.groupId) }),
        queryClient.invalidateQueries({ queryKey: financeQueryKeys.groups.list() }),
      ]);

      navigation.goBack();
    },
    onError: (error) => {
      showAlert(t('split.addExpense.errors.createFailedTitle'), apiErrorText(error));
    },
  });

  const validateAndBuildPayload = (): GroupExpenseCreateInput | null => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      showAlert(
        t('split.addExpense.errors.requiredTitleTitle'),
        t('split.addExpense.errors.requiredTitleMessage'),
      );
      return null;
    }

    const parsedAmount = parseDecimal(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      showAlert(
        t('split.addExpense.errors.invalidAmountTitle'),
        t('split.addExpense.errors.invalidAmountMessage'),
      );
      return null;
    }

    if (!paidByMemberId) {
      showAlert(
        t('split.addExpense.errors.paidByRequiredTitle'),
        t('split.addExpense.errors.paidByRequiredMessage'),
      );
      return null;
    }

    if (activeMembers.length === 0) {
      showAlert(
        t('split.addExpense.errors.membersRequiredTitle'),
        t('split.addExpense.errors.membersRequiredMessage'),
      );
      return null;
    }

    const splits =
      splitMode === 'equal'
        ? activeMembers.map((member, index) => {
            if (index === activeMembers.length - 1) {
              const distributed =
                (activeMembers.length - 1) * Number((parsedAmount / activeMembers.length).toFixed(2));
              return {
                memberId: member.id,
                amount: Number((parsedAmount - distributed).toFixed(2)),
              };
            }

            return {
              memberId: member.id,
              amount: Number((parsedAmount / activeMembers.length).toFixed(2)),
            };
          })
        : activeMembers.map((member) => ({
            memberId: member.id,
            amount: Number((customSplits[member.id] ?? '').replace(',', '.')),
          }));

    if (splitMode === 'custom') {
      const hasInvalid = splits.some((split) => !Number.isFinite(split.amount) || split.amount < 0);
      if (hasInvalid) {
        showAlert(
          t('split.addExpense.errors.invalidCustomSplitTitle'),
          t('split.addExpense.errors.invalidCustomSplitMessage'),
        );
        return null;
      }

      const splitTotal = Number(splits.reduce((sum, split) => sum + split.amount, 0).toFixed(2));
      const amountTotal = Number(parsedAmount.toFixed(2));
      if (Math.abs(splitTotal - amountTotal) > 0.01) {
        showAlert(
          t('split.addExpense.errors.splitMismatchTitle'),
          t('split.addExpense.errors.splitMismatchMessage', {
            amount: formatMoney(amountTotal, currency, locale),
            split: formatMoney(splitTotal, currency, locale),
          }),
        );
        return null;
      }
    }

    return {
      paidByMemberId,
      title: trimmedTitle,
      amount: parsedAmount,
      currency,
      splits,
    };
  };

  const selectedPaidBy = members.find((member) => member.id === paidByMemberId);

  if (groupQuery.isLoading) {
    return (
      <ScreenContainer dark={mode === 'dark'}>
        <Card dark={mode === 'dark'} style={styles.loadingCard}>
          <AppIcon name="people-outline" size="lg" tone="primary" />
          <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>{t('split.addExpense.loading')}</Text>
        </Card>
      </ScreenContainer>
    );
  }

  if (groupQuery.isError || !groupQuery.data) {
    return (
      <ScreenContainer dark={mode === 'dark'}>
        <Card dark={mode === 'dark'} style={styles.errorCard}>
          <AppIcon name="alert-circle-outline" size="lg" tone="expense" />
          <Text style={[styles.errorTitle, { color: theme.colors.text }]}>{t('split.addExpense.loadErrorTitle')}</Text>
          <Text style={[styles.errorText, { color: theme.colors.expense }]}>{apiErrorText(groupQuery.error)}</Text>
          <PrimaryButton iconName="refresh" label={t('split.addExpense.retry')} onPress={() => void groupQuery.refetch()} />
        </Card>
      </ScreenContainer>
    );
  }

  const equalShareValue =
    activeMembers.length > 0 && Number.isFinite(parseDecimal(amount))
      ? parseDecimal(amount) / activeMembers.length
      : 0;

  return (
    <ScreenContainer dark={mode === 'dark'}>
      <View style={styles.container}>
        <GradientCard>
          <View style={styles.heroHeader}>
            <AppIcon name="receipt-outline" size="md" tone="inverse" />
            <Text style={styles.heroTitle}>{t('split.addExpense.title')}</Text>
          </View>
          <Text style={styles.heroSubtitle}>{t('split.addExpense.subtitle', { group: groupQuery.data.name })}</Text>
        </GradientCard>

        <Card dark={mode === 'dark'} style={styles.formCard}>
          <TextField
            label={t('split.addExpense.fields.titleLabel')}
            value={title}
            onChangeText={setTitle}
            placeholder={t('split.addExpense.fields.titlePlaceholder')}
            returnKeyType="next"
          />

          <View style={styles.rowTwoCol}>
            <View style={styles.col}>
              <TextField
                label={t('split.addExpense.fields.amountLabel')}
                value={amount}
                onChangeText={setAmount}
                placeholder={t('split.addExpense.fields.amountPlaceholder')}
                keyboardType="decimal-pad"
                returnKeyType="done"
              />
            </View>
            <View style={styles.col}>
              <TextField
                label={t('split.addExpense.fields.dateLabel')}
                value={expenseDate}
                onChangeText={setExpenseDate}
                placeholder={t('split.addExpense.fields.datePlaceholder')}
                autoCapitalize="none"
                returnKeyType="done"
              />
            </View>
          </View>

          <View style={styles.sectionWrap}>
            <View style={styles.sectionHeader}>
              <AppIcon name="grid-outline" size="sm" tone="primary" />
              <Text style={[styles.sectionLabel, { color: theme.colors.labelMuted }]}>{t('split.addExpense.fields.categoryLabel')}</Text>
            </View>
            <View style={styles.categoryRow}>
              {CATEGORY_OPTIONS.map((item) => {
                const active = item.id === selectedCategoryId;
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityLabel={t(item.key)}
                    onPress={() => setSelectedCategoryId(item.id)}
                    style={({ pressed }) => [
                      styles.categoryItem,
                      {
                        borderColor: active ? theme.colors.primary : theme.colors.border,
                        backgroundColor: active
                          ? mode === 'dark'
                            ? 'rgba(47,107,255,0.20)'
                            : '#ECF1FF'
                          : mode === 'dark'
                            ? '#111A30'
                            : '#FFFFFF',
                      },
                      pressed ? styles.pressed : null,
                    ]}
                  >
                    <AppIcon name={item.iconName} size="sm" tone={active ? 'primary' : 'muted'} />
                    <Text numberOfLines={1} style={[styles.categoryLabel, { color: theme.colors.textMuted }]}>
                      {t(item.key)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.sectionWrap}>
            <View style={styles.sectionHeader}>
              <AppIcon name="wallet-outline" size="sm" tone="primary" />
              <Text style={[styles.sectionLabel, { color: theme.colors.labelMuted }]}>{t('split.addExpense.fields.paidByLabel')}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setShowPaidByOptions((prev) => !prev)}
              style={({ pressed }) => [
                styles.dropdown,
                {
                  borderColor: mode === 'dark' ? 'rgba(255,255,255,0.10)' : '#DFE7F4',
                  backgroundColor: mode === 'dark' ? '#0F172B' : '#F9FBFF',
                },
                pressed ? styles.pressed : null,
              ]}
            >
              <Text style={[styles.dropdownText, { color: theme.colors.text }]}>
                {selectedPaidBy?.name ?? t('split.addExpense.fields.paidByPlaceholder')}
              </Text>
              <AppIcon name={showPaidByOptions ? 'chevron-up' : 'chevron-down'} size="sm" tone="muted" />
            </Pressable>

            {showPaidByOptions ? (
              <View
                style={[
                  styles.dropdownList,
                  {
                    borderColor: mode === 'dark' ? 'rgba(255,255,255,0.10)' : '#DFE7F4',
                    backgroundColor: mode === 'dark' ? '#0F172B' : '#FFFFFF',
                  },
                ]}
              >
                {members.map((member, index) => (
                  <Pressable
                    key={member.id}
                    accessibilityRole="button"
                    onPress={() => {
                      setPaidByMemberId(member.id);
                      setShowPaidByOptions(false);
                    }}
                    style={({ pressed }) => [styles.dropdownOption, pressed ? styles.pressed : null]}
                  >
                    <Text style={[styles.dropdownOptionText, { color: theme.colors.text }]}>{member.name}</Text>
                    {member.id === paidByMemberId ? <AppIcon name="checkmark" size="sm" tone="primary" /> : null}
                    {index < members.length - 1 ? (
                      <View
                        style={[
                          styles.dropdownDivider,
                          { backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.08)' : '#E6EDF8' },
                        ]}
                      />
                    ) : null}
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>

          <View style={styles.sectionWrap}>
            <View style={styles.sectionHeader}>
              <AppIcon name="people-outline" size="sm" tone="primary" />
              <Text style={[styles.sectionLabel, { color: theme.colors.labelMuted }]}>{t('split.addExpense.fields.membersLabel')}</Text>
            </View>
            <View style={styles.membersWrap}>
              {members.map((member) => {
                const selected = selectedMemberIds.includes(member.id);

                return (
                  <MemberChip
                    key={member.id}
                    name={member.name}
                    selected={selected}
                    onPress={() => {
                      setSelectedMemberIds((prev) =>
                        prev.includes(member.id) ? prev.filter((id) => id !== member.id) : [...prev, member.id],
                      );
                    }}
                  />
                );
              })}
            </View>
            <Text style={[styles.helperText, { color: theme.colors.textMuted }]}> 
              {t('split.addExpense.memberSelectedCount', { count: selectedMemberIds.length })}
            </Text>
          </View>

          <View style={styles.sectionWrap}>
            <View style={styles.sectionHeader}>
              <AppIcon name="git-compare-outline" size="sm" tone="primary" />
              <Text style={[styles.sectionLabel, { color: theme.colors.labelMuted }]}>{t('split.addExpense.fields.splitModeLabel')}</Text>
            </View>
            <SplitToggle
              value={splitMode}
              onChange={setSplitMode}
              equalLabel={t('split.addExpense.splitModes.equal')}
              customLabel={t('split.addExpense.splitModes.custom')}
            />

            {splitMode === 'equal' ? (
              <View
                style={[
                  styles.previewCard,
                  {
                    borderColor: mode === 'dark' ? 'rgba(255,255,255,0.10)' : '#DFE7F4',
                    backgroundColor: mode === 'dark' ? '#0F172B' : '#F8FAFF',
                  },
                ]}
              >
                <Text style={[styles.previewTitle, { color: theme.colors.text }]}>{t('split.addExpense.sections.equalPreview')}</Text>
                {activeMembers.map((member) => (
                  <View key={member.id} style={styles.previewRow}>
                    <Text style={[styles.previewName, { color: theme.colors.textMuted }]}>{member.name}</Text>
                    <Text style={[styles.previewValue, { color: theme.colors.text }]}> 
                      {t('split.addExpense.equalShare', {
                        amount: formatMoney(equalShareValue, currency, locale),
                      })}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.customSplitWrap}>
                <Text style={[styles.previewTitle, { color: theme.colors.text }]}>{t('split.addExpense.sections.customPreview')}</Text>
                {activeMembers.map((member) => (
                  <TextField
                    key={member.id}
                    label={t('split.addExpense.fields.splitForMemberLabel', { name: member.name })}
                    value={customSplits[member.id] ?? ''}
                    onChangeText={(value) =>
                      setCustomSplits((prev) => ({
                        ...prev,
                        [member.id]: value,
                      }))
                    }
                    placeholder={t('split.addExpense.fields.amountPlaceholder')}
                    keyboardType="decimal-pad"
                  />
                ))}
              </View>
            )}
          </View>

          <PrimaryButton
            disabled={createMutation.isPending}
            iconName={createMutation.isPending ? 'hourglass-outline' : 'checkmark-circle-outline'}
            label={
              createMutation.isPending
                ? t('split.addExpense.actions.submitting')
                : t('split.addExpense.actions.submit')
            }
            onPress={() => {
              const payload = validateAndBuildPayload();
              if (!payload) {
                return;
              }

              createMutation.mutate(payload);
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
  loadingCard: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  heroHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  heroTitle: {
    ...typography.heading,
    color: '#FFFFFF',
    fontSize: 24,
  },
  heroSubtitle: {
    ...typography.caption,
    color: '#DFE9FF',
    fontSize: 12,
  },
  formCard: {
    gap: spacing.sm,
  },
  rowTwoCol: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  col: {
    flex: 1,
  },
  sectionWrap: {
    gap: spacing.xs,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  sectionLabel: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  categoryItem: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    minWidth: 72,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  categoryLabel: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  dropdown: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 46,
    paddingHorizontal: spacing.sm,
  },
  dropdownText: {
    ...typography.body,
    flex: 1,
    fontSize: 14,
  },
  dropdownList: {
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  dropdownOption: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 42,
    paddingHorizontal: spacing.sm,
    position: 'relative',
  },
  dropdownOptionText: {
    ...typography.body,
    fontSize: 14,
  },
  dropdownDivider: {
    bottom: 0,
    height: 1,
    left: spacing.sm,
    position: 'absolute',
    right: spacing.sm,
  },
  membersWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  previewCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  previewTitle: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '700',
  },
  previewRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  previewName: {
    ...typography.body,
    fontSize: 14,
  },
  previewValue: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '700',
  },
  customSplitWrap: {
    gap: spacing.xs,
  },
  helperText: {
    ...typography.caption,
    fontSize: 11,
  },
  errorCard: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  errorTitle: {
    ...typography.subheading,
    fontWeight: '700',
    textAlign: 'center',
  },
  errorText: {
    ...typography.body,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.86,
  },
});
