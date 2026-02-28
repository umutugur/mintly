import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';

import { useAuth } from '@app/providers/AuthProvider';
import { apiClient } from '@core/api/client';
import { mobileEnv } from '@core/config/env';
import type { ProfileStackParamList } from '@core/navigation/stacks/ProfileStack';
import type { RootTabParamList } from '@core/navigation/types';
import { useI18n, type SupportedLocale } from '@shared/i18n';
import { radius, spacing, typography, useTheme, type ThemePreference } from '@shared/theme';
import { AppIcon, Card, ScreenContainer, showAlert } from '@shared/ui';
import { apiErrorText } from '@shared/utils/apiErrorText';
import { resolveUserDisplayName } from '@shared/utils/userDisplayName';

const themeOptions: ThemePreference[] = ['system', 'light', 'dark'];
const localeOptions: SupportedLocale[] = ['tr', 'en', 'ru'];
const BIOMETRIC_ENABLED_KEY = 'montly:biometric-enabled';

type LocalAuthenticationModule = {
  hasHardwareAsync: () => Promise<boolean>;
  isEnrolledAsync: () => Promise<boolean>;
  authenticateAsync: (options?: {
    promptMessage?: string;
  }) => Promise<{ success: boolean; error?: string }>;
};

const localeLabelKeyByOption: Record<SupportedLocale, string> = {
  tr: 'settings.language.options.tr',
  en: 'settings.language.options.en',
  ru: 'settings.language.options.ru',
};

const themeLabelKeyByOption: Record<ThemePreference, string> = {
  system: 'settings.theme.options.system',
  light: 'settings.theme.options.light',
  dark: 'settings.theme.options.dark',
};

function getLocalAuthenticationModule(): LocalAuthenticationModule | null {
  try {
    const globalWithRequire = globalThis as unknown as {
      require?: (moduleName: string) => unknown;
    };

    if (!globalWithRequire.require) {
      return null;
    }

    return globalWithRequire.require('expo-local-authentication') as LocalAuthenticationModule;
  } catch {
    return null;
  }
}

export function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const { user, withAuth } = useAuth();
  const queryClient = useQueryClient();
  const { theme, mode, preference, setPreference } = useTheme();
  const { t, locale, setLocale } = useI18n();

  const [notificationsPermissionGranted, setNotificationsPermissionGranted] = useState(false);
  const [notificationsPermissionLoading, setNotificationsPermissionLoading] = useState(true);
  const [notificationsPreferenceEnabled, setNotificationsPreferenceEnabled] = useState(true);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(true);
  const [biometricPending, setBiometricPending] = useState(false);

  const dark = mode === 'dark';
  const panelBg = dark ? '#15192A' : '#FFFFFF';
  const panelBorder = dark ? '#2A2D42' : '#E4EAF5';
  const displayName = resolveUserDisplayName(user);

  const preferencesQuery = useQuery({
    queryKey: ['me', 'preferences'],
    queryFn: () => withAuth((token) => apiClient.getMePreferences(token)),
  });

  useEffect(() => {
    const backendEnabled = preferencesQuery.data?.preferences.notificationsEnabled;
    if (backendEnabled !== undefined) {
      setNotificationsPreferenceEnabled(backendEnabled);
    }
  }, [preferencesQuery.data?.preferences.notificationsEnabled]);

  useEffect(() => {
    let active = true;

    void (async () => {
      const current = await Notifications.getPermissionsAsync();
      if (!active) {
        return;
      }

      setNotificationsPermissionGranted(current.granted);
      setNotificationsPermissionLoading(false);
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    void (async () => {
      const localAuth = getLocalAuthenticationModule();
      const stored = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);

      let supported = false;
      if (localAuth) {
        try {
          const [hasHardware, isEnrolled] = await Promise.all([
            localAuth.hasHardwareAsync(),
            localAuth.isEnrolledAsync(),
          ]);
          supported = hasHardware && isEnrolled;
        } catch {
          supported = false;
        }
      }

      if (!supported && stored === 'true') {
        await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, 'false');
      }

      if (!active) {
        return;
      }

      setBiometricSupported(supported);
      setBiometricEnabled(supported && stored === 'true');
      setBiometricLoading(false);
    })();

    return () => {
      active = false;
    };
  }, []);

  const updateNotificationsMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      withAuth((token) =>
        apiClient.updateMePreferences(
          {
            notificationsEnabled: enabled,
          },
          token,
        ),
      ),
    onSuccess: (response) => {
      queryClient.setQueryData(['me', 'preferences'], response);
      setNotificationsPreferenceEnabled(response.preferences.notificationsEnabled);
    },
    onError: (error) => {
      showAlert(t('common.error'), apiErrorText(error));
    },
  });

  const notificationsEnabled = useMemo(
    () => notificationsPermissionGranted && notificationsPreferenceEnabled,
    [notificationsPermissionGranted, notificationsPreferenceEnabled],
  );

  const notificationsBusy =
    notificationsPermissionLoading
    || preferencesQuery.isLoading
    || updateNotificationsMutation.isPending;

  const goToRecurring = () => {
    const parent = navigation.getParent?.();
    const root = parent?.getParent?.();
    const target = (root ?? parent ?? navigation) as {
      navigate: (
        routeName: keyof RootTabParamList,
        params?: RootTabParamList['TransactionsTab'],
      ) => void;
    };

    target.navigate('TransactionsTab', { screen: 'Recurring' });
  };

  const handleNotificationsToggle = async (nextValue: boolean) => {
    if (notificationsBusy) {
      return;
    }

    if (!nextValue) {
      setNotificationsPreferenceEnabled(false);
      try {
        await updateNotificationsMutation.mutateAsync(false);
      } catch {
        // Error is handled in mutation onError.
      }
      return;
    }

    const current = await Notifications.getPermissionsAsync();
    let granted = current.granted;
    if (!granted) {
      const requested = await Notifications.requestPermissionsAsync();
      granted = requested.granted;
    }

    setNotificationsPermissionGranted(granted);

    if (!granted) {
      setNotificationsPreferenceEnabled(false);
      try {
        await updateNotificationsMutation.mutateAsync(false);
      } catch {
        // Error is handled in mutation onError.
      }
      showAlert(t('common.error'), t('settings.notifications.permissionRequired'));
      return;
    }

    setNotificationsPreferenceEnabled(true);
    try {
      await updateNotificationsMutation.mutateAsync(true);
    } catch {
      // Error is handled in mutation onError.
    }
  };

  const handleBiometricToggle = async (nextValue: boolean) => {
    if (biometricPending || biometricLoading) {
      return;
    }

    if (!nextValue) {
      setBiometricEnabled(false);
      await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, 'false');
      return;
    }

    if (!biometricSupported) {
      showAlert(t('common.error'), t('settings.biometric.notSupported'));
      setBiometricEnabled(false);
      await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, 'false');
      return;
    }

    const localAuth = getLocalAuthenticationModule();
    if (!localAuth) {
      showAlert(t('common.error'), t('settings.biometric.notSupported'));
      return;
    }

    setBiometricPending(true);
    try {
      const result = await localAuth.authenticateAsync({
        promptMessage: t('settings.biometric.prompt'),
      });

      if (!result.success) {
        showAlert(t('common.error'), t('settings.biometric.enableFailed'));
        setBiometricEnabled(false);
        await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, 'false');
        return;
      }

      setBiometricEnabled(true);
      await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, 'true');
    } catch {
      showAlert(t('common.error'), t('settings.biometric.enableFailed'));
      setBiometricEnabled(false);
      await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, 'false');
    } finally {
      setBiometricPending(false);
    }
  };

  const handleOpenHelpCenter = async () => {
    const url = mobileEnv.helpCenterUrl?.trim();
    if (!url) {
      navigation.navigate('About');
      return;
    }

    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        showAlert(t('common.error'), t('settings.helpCenter.openFailed'));
        return;
      }

      await Linking.openURL(url);
    } catch {
      showAlert(t('common.error'), t('settings.helpCenter.openFailed'));
    }
  };

  return (
    <ScreenContainer dark={dark}>
      <View style={styles.container}>
        <Card
          dark={dark}
          style={[
            styles.profileHint,
            {
              borderColor: panelBorder,
              backgroundColor: panelBg,
            },
          ]}
        >
          <View style={[styles.profileIcon, { backgroundColor: dark ? 'rgba(66,17,212,0.22)' : '#ECF2FF' }]}>
            <AppIcon name="person-outline" size="lg" tone="primary" />
          </View>
          <Text style={[styles.profileName, { color: theme.colors.text }]}>{displayName}</Text>
          <Text style={[styles.profilePlan, { color: theme.colors.primary }]}>{t('settings.user.plan')}</Text>
        </Card>

        <SettingsGroup
          title={t('settings.sections.application')}
          items={[
            {
              iconName: 'language-outline',
              label: t('settings.language.title'),
              subtitle: t('settings.language.subtitle'),
              customRight: (
                <View style={styles.optionChipRow}>
                  {localeOptions.map((option) => {
                    const active = locale === option;
                    return (
                      <Pressable
                        key={option}
                        accessibilityRole="button"
                        onPress={() => {
                          void setLocale(option);
                        }}
                        style={[
                          styles.optionChip,
                          {
                            borderColor: active ? theme.colors.primary : panelBorder,
                            backgroundColor: active
                              ? dark
                                ? 'rgba(66,17,212,0.22)'
                                : '#ECF2FF'
                              : dark
                                ? '#121624'
                                : '#FFFFFF',
                          },
                        ]}
                      >
                        <Text style={[styles.optionChipText, { color: active ? theme.colors.primary : theme.colors.textMuted }]}>
                          {t(localeLabelKeyByOption[option])}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ),
            },
            {
              iconName: 'color-palette-outline',
              label: t('settings.theme.title'),
              subtitle: t('settings.theme.subtitle'),
              customRight: (
                <View style={styles.optionChipRow}>
                  {themeOptions.map((option) => {
                    const active = preference === option;
                    return (
                      <Pressable
                        key={option}
                        accessibilityRole="button"
                        onPress={() => setPreference(option)}
                        style={[
                          styles.optionChip,
                          {
                            borderColor: active ? theme.colors.primary : panelBorder,
                            backgroundColor: active
                              ? dark
                                ? 'rgba(66,17,212,0.22)'
                                : '#ECF2FF'
                              : dark
                                ? '#121624'
                                : '#FFFFFF',
                          },
                        ]}
                      >
                        <Text style={[styles.optionChipText, { color: active ? theme.colors.primary : theme.colors.textMuted }]}>
                          {t(themeLabelKeyByOption[option])}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ),
            },
            {
              iconName: 'flag-outline',
              label: t('settings.financialGoals.title'),
              subtitle: t('settings.financialGoals.subtitle'),
              onPress: () => navigation.navigate('FinancialGoals'),
              chevron: true,
            },
            {
              iconName: 'repeat-outline',
              label: t('settings.regularPayments.title'),
              subtitle: t('settings.regularPayments.subtitle'),
              onPress: goToRecurring,
              chevron: true,
            },
            {
              iconName: 'notifications-outline',
              label: t('settings.notifications.title'),
              subtitle: notificationsPermissionLoading
                ? t('common.loadingShort')
                : t('settings.notifications.subtitle'),
              customRight: (
                <Switch
                  disabled={notificationsBusy}
                  trackColor={{ false: dark ? '#3A3F56' : '#CBD5E1', true: dark ? '#3A238A' : '#CAD8FF' }}
                  thumbColor={notificationsEnabled ? theme.colors.primary : '#E2E8F0'}
                  onValueChange={(value) => {
                    void handleNotificationsToggle(value);
                  }}
                  value={notificationsEnabled}
                />
              ),
            },
          ]}
        />

        <SettingsGroup
          title={t('settings.sections.privacy')}
          items={[
            {
              iconName: 'finger-print-outline',
              label: t('settings.biometric.title'),
              subtitle: biometricSupported
                ? t('settings.biometric.subtitle')
                : t('settings.biometric.notSupported'),
              customRight: (
                <Switch
                  disabled={biometricLoading || biometricPending || !biometricSupported}
                  trackColor={{ false: dark ? '#3A3F56' : '#CBD5E1', true: dark ? '#3A238A' : '#CAD8FF' }}
                  thumbColor={biometricEnabled ? theme.colors.primary : '#E2E8F0'}
                  onValueChange={(value) => {
                    void handleBiometricToggle(value);
                  }}
                  value={biometricEnabled}
                />
              ),
            },
            {
              iconName: 'shield-checkmark-outline',
              label: t('settings.security.title'),
              subtitle: t('settings.security.subtitle'),
              onPress: () => navigation.navigate('Security'),
              chevron: true,
            },
          ]}
        />

        <SettingsGroup
          title={t('settings.sections.support')}
          items={[
            {
              iconName: 'sparkles-outline',
              label: t('settings.howItWorks.title'),
              subtitle: t('settings.howItWorks.subtitle'),
              onPress: () => navigation.navigate('HowItWorks'),
              chevron: true,
            },
            {
              iconName: 'help-circle-outline',
              label: t('settings.helpCenter.title'),
              subtitle: t('settings.helpCenter.subtitle'),
              onPress: () => {
                void handleOpenHelpCenter();
              },
              chevron: true,
            },
            {
              iconName: 'information-circle-outline',
              label: t('settings.version.title'),
              subtitle: t('settings.version.subtitle'),
            },
          ]}
        />
      </View>
    </ScreenContainer>
  );
}

function SettingsGroup({
  title,
  items,
}: {
  title: string;
  items: Array<{
    iconName: Parameters<typeof AppIcon>[0]['name'];
    label: string;
    subtitle: string;
    value?: string;
    chevron?: boolean;
    customRight?: ReactNode;
    onPress?: () => void;
  }>;
}) {
  const { theme, mode } = useTheme();
  const dark = mode === 'dark';

  return (
    <View style={styles.groupWrap}>
      <Text style={[styles.groupTitle, { color: theme.colors.primary }]}>{title}</Text>
      <Card
        dark={dark}
        style={[
          styles.groupCard,
          {
            borderColor: dark ? '#2A2D42' : '#E4EAF5',
            backgroundColor: dark ? '#15192A' : '#FFFFFF',
          },
        ]}
      >
        {items.map((item, index) => (
          <View key={`${item.label}-${index}`}>
            {item.onPress ? (
              <Pressable
                accessibilityRole="button"
                onPress={item.onPress}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              >
                <View style={[styles.leadingIconWrap, { backgroundColor: dark ? 'rgba(66,17,212,0.18)' : '#ECF2FF' }]}>
                  <AppIcon name={item.iconName} size="sm" tone="primary" />
                </View>

                <View style={styles.textWrap}>
                  <Text style={[styles.rowTitle, { color: theme.colors.text }]}>{item.label}</Text>
                  <Text style={[styles.rowSubtitle, { color: theme.colors.textMuted }]}>{item.subtitle}</Text>
                </View>

                {item.customRight ?? (
                  <View style={styles.rightMeta}>
                    {item.value ? <Text style={[styles.valueText, { color: theme.colors.textMuted }]}>{item.value}</Text> : null}
                    {item.chevron ? <AppIcon name="chevron-forward" size="sm" tone="muted" /> : null}
                  </View>
                )}
              </Pressable>
            ) : (
              <View style={styles.row}>
                <View style={[styles.leadingIconWrap, { backgroundColor: dark ? 'rgba(66,17,212,0.18)' : '#ECF2FF' }]}>
                  <AppIcon name={item.iconName} size="sm" tone="primary" />
                </View>

                <View style={styles.textWrap}>
                  <Text style={[styles.rowTitle, { color: theme.colors.text }]}>{item.label}</Text>
                  <Text style={[styles.rowSubtitle, { color: theme.colors.textMuted }]}>{item.subtitle}</Text>
                </View>

                {item.customRight ?? (
                  <View style={styles.rightMeta}>
                    {item.value ? <Text style={[styles.valueText, { color: theme.colors.textMuted }]}>{item.value}</Text> : null}
                    {item.chevron ? <AppIcon name="chevron-forward" size="sm" tone="muted" /> : null}
                  </View>
                )}
              </View>
            )}

            {index < items.length - 1 ? (
              <View style={[styles.divider, { backgroundColor: dark ? '#2A2D42' : '#E4EAF5' }]} />
            ) : null}
          </View>
        ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  profileHint: {
    alignItems: 'center',
    gap: spacing.xxs,
  },
  profileIcon: {
    alignItems: 'center',
    borderRadius: radius.full,
    height: 64,
    justifyContent: 'center',
    marginBottom: spacing.xs,
    width: 64,
  },
  profileName: {
    ...typography.subheading,
    fontSize: 18,
    fontWeight: '700',
  },
  profilePlan: {
    ...typography.caption,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  groupWrap: {
    gap: spacing.xs,
  },
  groupTitle: {
    ...typography.caption,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  groupCard: {
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 64,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowPressed: {
    opacity: 0.86,
  },
  leadingIconWrap: {
    alignItems: 'center',
    borderRadius: radius.md,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    ...typography.body,
    fontWeight: '600',
  },
  rowSubtitle: {
    ...typography.caption,
    fontSize: 11,
  },
  rightMeta: {
    alignItems: 'flex-end',
    gap: 2,
    justifyContent: 'center',
  },
  valueText: {
    ...typography.caption,
    fontSize: 11,
  },
  optionChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'flex-end',
    maxWidth: 188,
  },
  optionChip: {
    borderRadius: radius.full,
    borderWidth: 1,
    minHeight: 28,
    minWidth: 54,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionChipText: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    marginHorizontal: spacing.md,
  },
});
