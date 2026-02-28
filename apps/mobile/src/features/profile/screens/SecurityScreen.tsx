import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useMutation } from '@tanstack/react-query';

import { useAuth } from '@app/providers/AuthProvider';
import { apiClient } from '@core/api/client';
import { useI18n } from '@shared/i18n';
import { spacing, typography, useTheme } from '@shared/theme';
import { Card, PrimaryButton, ScreenContainer, TextField, showAlert } from '@shared/ui';
import { apiErrorText } from '@shared/utils/apiErrorText';

export function SecurityScreen() {
  const { user, withAuth, logout } = useAuth();
  const { theme, mode } = useTheme();
  const { t } = useI18n();
  const dark = mode === 'dark';

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const canChangePassword = user?.canChangePassword ?? false;

  const changePasswordMutation = useMutation({
    mutationFn: () =>
      withAuth((token) =>
        apiClient.changeMePassword(
          {
            currentPassword,
            newPassword,
          },
          token,
        ),
      ),
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showAlert(t('profile.security.password.success'));
    },
    onError: (error) => {
      showAlert(t('common.error'), apiErrorText(error));
    },
  });

  const logoutAllMutation = useMutation({
    mutationFn: () => withAuth((token) => apiClient.logoutAll(token)),
    onSuccess: async () => {
      showAlert(t('profile.security.sessions.logoutAllSuccess'));
      await logout();
    },
    onError: (error) => {
      showAlert(t('common.error'), apiErrorText(error));
    },
  });

  const handleChangePassword = async () => {
    if (!canChangePassword || changePasswordMutation.isPending) {
      return;
    }

    if (!currentPassword.trim()) {
      showAlert(t('common.error'), t('profile.security.password.currentRequired'));
      return;
    }

    if (newPassword.length < 8) {
      showAlert(t('common.error'), t('profile.security.password.minLength'));
      return;
    }

    if (newPassword !== confirmPassword) {
      showAlert(t('common.error'), t('profile.security.password.mismatch'));
      return;
    }

    try {
      await changePasswordMutation.mutateAsync();
    } catch {
      // Error is handled in mutation onError.
    }
  };

  const handleLogout = async () => {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);
    await logout();
    setIsLoggingOut(false);
  };

  const handleLogoutAll = async () => {
    if (logoutAllMutation.isPending || isLoggingOut) {
      return;
    }

    try {
      await logoutAllMutation.mutateAsync();
    } catch {
      // Error is handled in mutation onError.
    }
  };

  const panelBg = dark ? '#15192A' : '#FFFFFF';
  const panelBorder = dark ? '#2A2D42' : '#E4EAF5';

  return (
    <ScreenContainer dark={dark}>
      <View style={styles.container}>
        <Card
          dark={dark}
          style={[
            styles.scoreCard,
            {
              borderColor: dark ? 'rgba(66,17,212,0.35)' : '#DDE8FF',
              backgroundColor: dark ? 'rgba(66,17,212,0.16)' : '#EEF3FF',
            },
          ]}
        >
          <Text style={[styles.scoreTitle, { color: theme.colors.text }]}>{t('profile.security.scoreTitle')}</Text>
          <Text style={[styles.scoreSubtitle, { color: theme.colors.textMuted }]}>{t('profile.security.scoreSubtitle')}</Text>
        </Card>

        <SectionTitle title={t('profile.security.password.sectionTitle')} />
        {canChangePassword ? (
          <Card
            dark={dark}
            style={[
              styles.groupCard,
              {
                borderColor: panelBorder,
                backgroundColor: panelBg,
              },
            ]}
          >
            <TextField
              autoCapitalize="none"
              autoComplete="password"
              label={t('profile.security.password.currentLabel')}
              onChangeText={setCurrentPassword}
              placeholder={t('auth.login.fields.passwordPlaceholder')}
              secureTextEntry
              textContentType="password"
              value={currentPassword}
            />
            <TextField
              autoCapitalize="none"
              autoComplete="password"
              label={t('profile.security.password.newLabel')}
              onChangeText={setNewPassword}
              placeholder={t('auth.login.fields.passwordPlaceholder')}
              secureTextEntry
              textContentType="newPassword"
              value={newPassword}
            />
            <TextField
              autoCapitalize="none"
              autoComplete="password"
              label={t('profile.security.password.confirmLabel')}
              onChangeText={setConfirmPassword}
              placeholder={t('auth.login.fields.passwordPlaceholder')}
              secureTextEntry
              textContentType="newPassword"
              value={confirmPassword}
            />
            <PrimaryButton
              disabled={changePasswordMutation.isPending}
              label={
                changePasswordMutation.isPending
                  ? t('profile.security.password.changing')
                  : t('profile.security.password.change')
              }
              onPress={() => {
                void handleChangePassword();
              }}
            />
          </Card>
        ) : (
          <Card
            dark={dark}
            style={[
              styles.groupCard,
              {
                borderColor: panelBorder,
                backgroundColor: panelBg,
              },
            ]}
          >
            <Text style={[styles.infoText, { color: theme.colors.textMuted }]}>
              {t('profile.security.password.notAvailable')}
            </Text>
          </Card>
        )}

        <SectionTitle title={t('profile.security.sessions.sectionTitle')} />
        <Card
          dark={dark}
          style={[
            styles.groupCard,
            {
              borderColor: panelBorder,
              backgroundColor: panelBg,
            },
          ]}
        >
          <Text style={[styles.infoText, { color: theme.colors.textMuted }]}>
            {t('profile.security.sessions.subtitle')}
          </Text>
          <PrimaryButton
            disabled={logoutAllMutation.isPending || isLoggingOut}
            label={
              logoutAllMutation.isPending
                ? t('profile.security.sessions.loggingOutAll')
                : t('profile.security.sessions.logoutAll')
            }
            onPress={() => {
              void handleLogoutAll();
            }}
          />
          <PrimaryButton
            disabled={logoutAllMutation.isPending || isLoggingOut}
            label={isLoggingOut ? t('profile.loggingOut') : t('profile.logOut')}
            onPress={() => {
              void handleLogout();
            }}
          />
        </Card>
      </View>
    </ScreenContainer>
  );
}

function SectionTitle({ title }: { title: string }) {
  const { theme } = useTheme();

  return <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>{title}</Text>;
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  scoreCard: {
    gap: spacing.xxs,
  },
  scoreTitle: {
    ...typography.subheading,
    fontWeight: '700',
  },
  scoreSubtitle: {
    ...typography.caption,
    fontSize: 12,
  },
  sectionTitle: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    paddingHorizontal: spacing.xs,
  },
  groupCard: {
    gap: spacing.sm,
  },
  infoText: {
    ...typography.caption,
    fontSize: 12,
  },
});
