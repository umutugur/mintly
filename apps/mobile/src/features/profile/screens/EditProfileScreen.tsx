import { useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { type MeUpdateInput } from '@mintly/shared';
import { useMutation } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@app/providers/AuthProvider';
import { apiClient } from '@core/api/client';
import { invalidateFinanceQueries } from '@core/api/invalidateFinanceQueries';
import { Card, PrimaryButton, ScreenContainer, showAlert } from '@shared/ui';
import { useI18n } from '@shared/i18n';
import { radius, spacing, typography, useTheme } from '@shared/theme';
import { apiErrorText } from '@shared/utils/apiErrorText';
import { resolveUserDisplayName } from '@shared/utils/userDisplayName';
import { getCurrencies, type CurrencyOption } from '@shared/data/currencies';

// stitch asset: stitch/export/stitch_ana_ekran_dashboard/profil_düzenle_(dark)/screen.png
// no touch/keyboard behavior changed by this PR.

export function EditProfileScreen() {
  const { user, clearAuthError, withAuth, setSessionUser } = useAuth();
  const { theme, mode } = useTheme();
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();

  const [name, setName] = useState(user?.name ?? '');
  const [baseCurrency, setBaseCurrency] = useState(user?.baseCurrency ?? '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setName(user?.name ?? '');
    setBaseCurrency(user?.baseCurrency ?? '');
  }, [user?.baseCurrency, user?.name]);

  const updateProfileMutation = useMutation({
    mutationFn: (payload: MeUpdateInput) =>
      withAuth((token) =>
        apiClient.updateMe(
          payload,
          token,
        ),
      ),
    onSuccess: async (response, variables) => {
      setSessionUser(response.user);
      setName(response.user.name ?? '');
      setBaseCurrency(response.user.baseCurrency ?? '');
      setNameError(null);

      if (variables.baseCurrency !== undefined) {
        await invalidateFinanceQueries(queryClient);
      }

      showAlert(t('profile.edit.saveSuccess'));
    },
    onError: (error) => {
      showAlert(t('common.error'), apiErrorText(error));
    },
  });

  const onSave = async () => {
    clearAuthError();

    const trimmedName = name.trim();
    const previousName = user?.name?.trim() ?? '';
    const nextBaseCurrency = baseCurrency.trim().toUpperCase();
    const previousBaseCurrency = user?.baseCurrency?.trim().toUpperCase() ?? '';

    if (!trimmedName && previousName) {
      setNameError(t('auth.validation.nameRequired'));
      return;
    }

    setNameError(null);

    const payload: MeUpdateInput = {};
    if (trimmedName && trimmedName !== previousName) {
      payload.name = trimmedName;
    }
    if (nextBaseCurrency && nextBaseCurrency !== previousBaseCurrency) {
      payload.baseCurrency = nextBaseCurrency;
    }

    if (Object.keys(payload).length === 0) {
      showAlert(t('profile.edit.noChanges'));
      return;
    }

    try {
      await updateProfileMutation.mutateAsync(payload);
    } catch {
      // Error is handled in mutation onError.
    }
  };

  const currencies = getCurrencies(locale);

  const selectedCurrency = currencies.find((c) => c.code === baseCurrency.toUpperCase());

  const filteredCurrencies = search.trim().length > 0
    ? currencies.filter((c) =>
        c.code.toLowerCase().includes(search.toLowerCase()) ||
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.symbol.toLowerCase().includes(search.toLowerCase()),
      )
    : currencies;

  const dark = mode === 'dark';
  const panelBg = dark ? '#15192A' : '#FFFFFF';
  const panelBorder = dark ? '#2A2D42' : '#E4EAF5';
  const inputBg = dark ? '#0E1523' : '#F8FBFF';
  const modalBg = dark ? '#13172A' : '#F2F5FC';
  const modalCardBg = dark ? '#1A1F33' : '#FFFFFF';

  return (
    <ScreenContainer
      dark={dark}
      safeAreaEdges={['left', 'right']}
      contentStyle={styles.screenContent}
    >
      <View style={styles.container}>
        <Card
          dark={dark}
          style={[
            styles.avatarCard,
            {
              borderColor: panelBorder,
              backgroundColor: panelBg,
            },
          ]}
        >
          <View style={[styles.avatar, { backgroundColor: dark ? '#242B42' : '#EAF1FF' }]}>
            <Text style={[styles.avatarInitial, { color: theme.colors.primary }]}>
              {resolveUserDisplayName(user).charAt(0).toUpperCase()}
            </Text>
          </View>
        </Card>

        <Card
          dark={dark}
          style={[
            styles.formCard,
            {
              borderColor: panelBorder,
              backgroundColor: panelBg,
            },
          ]}
        >
          <Text style={[styles.formTitle, { color: theme.colors.text }]}>{t('profile.edit.title')}</Text>

          {/* Ad Soyad */}
          <View style={styles.fieldWrap}>
            <Text style={[styles.fieldLabel, { color: theme.colors.labelMuted ?? theme.colors.textMuted }]}>
              {t('profile.edit.nameLabel')}
            </Text>
            <TextInput
              autoCapitalize="words"
              autoComplete="name"
              onChangeText={(value) => {
                setName(value);
                setNameError(null);
              }}
              placeholder={t('profile.edit.fullNamePlaceholder')}
              placeholderTextColor={theme.colors.textMuted}
              style={[
                styles.textInput,
                {
                  backgroundColor: inputBg,
                  borderColor: nameError ? theme.colors.expense : panelBorder,
                  color: theme.colors.text,
                },
              ]}
              textContentType="name"
              value={name}
            />
            {nameError ? (
              <Text style={[styles.fieldError, { color: theme.colors.expense }]}>{nameError}</Text>
            ) : null}
          </View>

          {/* E-posta (salt okunur) */}
          <View style={styles.fieldWrap}>
            <Text style={[styles.fieldLabel, { color: theme.colors.labelMuted ?? theme.colors.textMuted }]}>
              {t('profile.edit.emailLabel')}
            </Text>
            <View
              style={[
                styles.textInput,
                styles.readonlyInput,
                { backgroundColor: dark ? '#0A0E1A' : '#F0F4FA', borderColor: panelBorder },
              ]}
            >
              <Text style={[styles.readonlyText, { color: theme.colors.textMuted }]}>
                {user?.email ?? '-'}
              </Text>
            </View>
          </View>

          {/* Para Birimi Picker */}
          <View style={styles.fieldWrap}>
            <Text style={[styles.fieldLabel, { color: theme.colors.labelMuted ?? theme.colors.textMuted }]}>
              {t('profile.edit.baseCurrencyLabel')}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setSearch('');
                setPickerOpen(true);
              }}
              style={({ pressed }) => [
                styles.currencyPickerButton,
                {
                  backgroundColor: inputBg,
                  borderColor: panelBorder,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              {selectedCurrency ? (
                <View style={styles.currencyPickerValue}>
                  <Text style={[styles.currencySymbol, { color: theme.colors.primary }]}>
                    {selectedCurrency.symbol}
                  </Text>
                  <View>
                    <Text style={[styles.currencyCode, { color: theme.colors.text }]}>
                      {selectedCurrency.code}
                    </Text>
                    <Text style={[styles.currencyName, { color: theme.colors.textMuted }]}>
                      {selectedCurrency.name}
                    </Text>
                  </View>
                </View>
              ) : (
                <Text style={[styles.currencyPlaceholder, { color: theme.colors.textMuted }]}>
                  {t('profile.edit.baseCurrencyPlaceholder')}
                </Text>
              )}
              <Text style={[styles.currencyChevron, { color: theme.colors.textMuted }]}>›</Text>
            </Pressable>
          </View>

          <PrimaryButton
            disabled={updateProfileMutation.isPending}
            label={updateProfileMutation.isPending ? t('common.saving') : t('profile.edit.save')}
            onPress={() => {
              void onSave();
            }}
          />
        </Card>
      </View>

      {/* Para Birimi Seçici Modal */}
      <Modal
        animationType="slide"
        transparent
        visible={pickerOpen}
        onRequestClose={() => setPickerOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalDismiss} onPress={() => setPickerOpen(false)} />
          <View style={[styles.modalSheet, { backgroundColor: modalBg }]}>
            <View style={[styles.modalHeader, { borderBottomColor: panelBorder }]}>
              <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
                Para Birimi Seç
              </Text>
              <Pressable onPress={() => setPickerOpen(false)} style={styles.modalCloseBtn}>
                <Text style={[styles.modalCloseText, { color: theme.colors.textMuted }]}>✕</Text>
              </Pressable>
            </View>

            {/* Arama */}
            <View style={[styles.searchWrap, { backgroundColor: modalCardBg, borderColor: panelBorder }]}>
              <Text style={{ color: theme.colors.textMuted, fontSize: 16 }}>🔍</Text>
              <TextInput
                autoCapitalize="none"
                onChangeText={setSearch}
                placeholder={t('profile.edit.baseCurrencySearchPlaceholder')}
                placeholderTextColor={theme.colors.textMuted}
                style={[styles.searchInput, { color: theme.colors.text }]}
                value={search}
              />
            </View>

            <FlatList
              data={filteredCurrencies}
              keyExtractor={(item) => item.code}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.listContent}
              renderItem={({ item }: { item: CurrencyOption }) => {
                const selected = item.code === baseCurrency.toUpperCase();
                return (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setBaseCurrency(item.code);
                      setPickerOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.currencyRow,
                      {
                        backgroundColor: selected
                          ? dark ? 'rgba(47,107,255,0.18)' : '#EAF0FF'
                          : modalCardBg,
                        borderColor: selected ? theme.colors.primary : panelBorder,
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}
                  >
                    <View style={[styles.currencyRowSymbolWrap, { backgroundColor: dark ? '#1E2340' : '#F1F5FF' }]}>
                      <Text style={[styles.currencyRowSymbol, { color: theme.colors.primary }]}>
                        {item.symbol}
                      </Text>
                    </View>
                    <View style={styles.currencyRowText}>
                      <Text style={[styles.currencyRowCode, { color: selected ? theme.colors.primary : theme.colors.text }]}>
                        {item.code}
                      </Text>
                      <Text style={[styles.currencyRowName, { color: theme.colors.textMuted }]}>
                        {item.name}
                      </Text>
                    </View>
                    {selected ? (
                      <Text style={[styles.currencyRowCheck, { color: theme.colors.primary }]}>✓</Text>
                    ) : null}
                  </Pressable>
                );
              }}
              ItemSeparatorComponent={() => <View style={{ height: spacing.xxs }} />}
            />
          </View>
        </View>
      </Modal>
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
  avatarCard: {
    alignItems: 'center',
    gap: spacing.xxs,
  },
  avatar: {
    marginBottom: spacing.xs,
    alignItems: 'center',
    borderRadius: radius.full,
    height: 96,
    justifyContent: 'center',
    width: 96,
  },
  avatarInitial: {
    fontSize: 34,
    fontWeight: '700',
    lineHeight: 40,
  },
  formCard: {
    gap: spacing.md,
  },
  formTitle: {
    ...typography.subheading,
    fontWeight: '700',
  },
  fieldWrap: {
    gap: spacing.xxs,
  },
  fieldLabel: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '700',
  },
  fieldError: {
    ...typography.caption,
    fontSize: 12,
    marginTop: 2,
  },
  textInput: {
    borderRadius: radius.md,
    borderWidth: 1,
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  readonlyInput: {
    justifyContent: 'center',
  },
  readonlyText: {
    fontSize: 15,
  },
  // Currency picker button
  currencyPickerButton: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  currencyPickerValue: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    flex: 1,
  },
  currencySymbol: {
    fontSize: 22,
    fontWeight: '700',
    minWidth: 30,
    textAlign: 'center',
  },
  currencyCode: {
    ...typography.body,
    fontWeight: '700',
    fontSize: 15,
  },
  currencyName: {
    ...typography.caption,
    fontSize: 12,
    marginTop: 1,
  },
  currencyPlaceholder: {
    fontSize: 15,
    flex: 1,
  },
  currencyChevron: {
    fontSize: 22,
    fontWeight: '300',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  modalDismiss: {
    flex: 1,
  },
  modalSheet: {
    borderTopLeftRadius: radius.xl ?? 20,
    borderTopRightRadius: radius.xl ?? 20,
    maxHeight: '82%',
    paddingBottom: spacing.xl ?? 32,
  },
  modalHeader: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  modalTitle: {
    ...typography.subheading,
    fontWeight: '700',
    fontSize: 17,
  },
  modalCloseBtn: {
    padding: spacing.xs,
  },
  modalCloseText: {
    fontSize: 16,
    fontWeight: '600',
  },
  searchWrap: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    margin: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    minHeight: 36,
  },
  listContent: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.md,
  },
  currencyRow: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  currencyRowSymbolWrap: {
    alignItems: 'center',
    borderRadius: radius.sm,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  currencyRowSymbol: {
    fontSize: 16,
    fontWeight: '700',
  },
  currencyRowText: {
    flex: 1,
  },
  currencyRowCode: {
    ...typography.body,
    fontWeight: '700',
    fontSize: 15,
  },
  currencyRowName: {
    ...typography.caption,
    fontSize: 12,
    marginTop: 1,
  },
  currencyRowCheck: {
    fontSize: 18,
    fontWeight: '700',
  },
});
