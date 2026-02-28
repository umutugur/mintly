import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { type MeUpdateInput } from '@mintly/shared';
import { useMutation } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@app/providers/AuthProvider';
import { apiClient } from '@core/api/client';
import { invalidateFinanceQueries } from '@core/api/invalidateFinanceQueries';
import { Card, PrimaryButton, ScreenContainer, TextField, showAlert } from '@shared/ui';
import { useI18n } from '@shared/i18n';
import { radius, spacing, typography, useTheme } from '@shared/theme';
import { apiErrorText } from '@shared/utils/apiErrorText';
import { resolveUserDisplayName } from '@shared/utils/userDisplayName';

// stitch asset: stitch/export/stitch_ana_ekran_dashboard/profil_düzenle_(dark)/screen.png
// no touch/keyboard behavior changed by this PR.

export function EditProfileScreen() {
  const { user, clearAuthError, withAuth, setSessionUser } = useAuth();
  const { theme, mode } = useTheme();
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const [name, setName] = useState(user?.name ?? '');
  const [baseCurrency, setBaseCurrency] = useState(user?.baseCurrency ?? '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [currencyError, setCurrencyError] = useState<string | null>(null);

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
      setCurrencyError(null);

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

    if (nextBaseCurrency && !/^[A-Z]{3}$/.test(nextBaseCurrency)) {
      setCurrencyError(t('profile.edit.currencyInvalid'));
      return;
    }

    if (!nextBaseCurrency && previousBaseCurrency) {
      setCurrencyError(t('profile.edit.currencyRequired'));
      return;
    }

    setNameError(null);
    setCurrencyError(null);

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

  const dark = mode === 'dark';
  const panelBg = dark ? '#15192A' : '#FFFFFF';
  const panelBorder = dark ? '#2A2D42' : '#E4EAF5';

  return (
    <ScreenContainer dark={dark}>
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
          <View style={styles.avatarWrap}>
            <View style={[styles.avatar, { backgroundColor: dark ? '#242B42' : '#EAF1FF' }]}> 
              <Text style={[styles.avatarInitial, { color: theme.colors.primary }]}> 
                {resolveUserDisplayName(user).charAt(0).toUpperCase()}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              style={[styles.cameraBadge, { backgroundColor: theme.colors.primary }]}
            >
              <Text style={styles.cameraText}>📷</Text>
            </Pressable>
          </View>

          <Text style={[styles.avatarTitle, { color: theme.colors.text }]}>{t('profile.edit.photoTitle')}</Text>
          <Text style={[styles.avatarSubtitle, { color: theme.colors.textMuted }]}>{t('profile.edit.photoSubtitle')}</Text>
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

          <TextField
            autoCapitalize="words"
            autoComplete="name"
            error={nameError}
            label={t('profile.edit.nameLabel')}
            onChangeText={(value) => {
              setName(value);
              setNameError(null);
            }}
            placeholder={t('profile.edit.fullNamePlaceholder')}
            textContentType="name"
            value={name}
          />

          <TextField
            autoCapitalize="none"
            autoComplete="email"
            editable={false}
            label={t('profile.edit.emailLabel')}
            onChangeText={() => {}}
            placeholder="-"
            textContentType="emailAddress"
            value={user?.email ?? '-'}
          />

          <TextField
            autoCapitalize="characters"
            autoComplete="off"
            error={currencyError}
            label={t('profile.edit.baseCurrencyLabel')}
            onChangeText={(value) => {
              setBaseCurrency(value.toUpperCase());
              setCurrencyError(null);
            }}
            placeholder={t('profile.edit.baseCurrencyPlaceholder')}
            value={baseCurrency}
            maxLength={3}
          />

          <PrimaryButton
            disabled={updateProfileMutation.isPending}
            label={updateProfileMutation.isPending ? t('common.saving') : t('profile.edit.save')}
            onPress={() => {
              void onSave();
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
  avatarCard: {
    alignItems: 'center',
    gap: spacing.xxs,
  },
  avatarWrap: {
    marginBottom: spacing.xs,
    position: 'relative',
  },
  avatar: {
    alignItems: 'center',
    borderRadius: radius.full,
    height: 96,
    justifyContent: 'center',
    width: 96,
  },
  avatarInitial: {
    ...typography.heading,
    fontSize: 34,
    fontWeight: '700',
  },
  cameraBadge: {
    alignItems: 'center',
    borderRadius: radius.full,
    bottom: 0,
    height: 30,
    justifyContent: 'center',
    position: 'absolute',
    right: 0,
    width: 30,
  },
  cameraText: {
    color: '#FFFFFF',
    fontSize: 13,
  },
  avatarTitle: {
    ...typography.subheading,
    fontWeight: '700',
  },
  avatarSubtitle: {
    ...typography.caption,
    fontSize: 12,
  },
  formCard: {
    gap: spacing.md,
  },
  formTitle: {
    ...typography.subheading,
    fontWeight: '700',
  },
});
