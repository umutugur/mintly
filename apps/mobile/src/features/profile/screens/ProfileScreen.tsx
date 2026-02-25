import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@core/api/client';
import { financeQueryKeys } from '@core/api/queryKeys';
import { useAuth } from '@app/providers/AuthProvider';
import { AppIcon, Card, ScreenContainer } from '@shared/ui';
import { useI18n } from '@shared/i18n';
import type { RootTabParamList } from '@core/navigation/types';
import { radius, spacing, typography, useTheme } from '@shared/theme';
import { apiErrorText } from '@shared/utils/apiErrorText';
import { resolveUserDisplayName } from '@shared/utils/userDisplayName';
import { MintlyLogo } from '../../../components/brand/MintlyLogo';

// stitch asset: stitch/export/stitch_ana_ekran_dashboard/profil_(dark)_2/screen.png
// no touch/keyboard behavior changed by this PR.

function formatSync(value: Date): string {
  return value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function ProfileScreen() {
  const navigation = useNavigation<any>();
  const { withAuth, user, logout } = useAuth();
  const { theme, mode } = useTheme();
  const { t } = useI18n();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const accountsQuery = useQuery({
    queryKey: financeQueryKeys.accounts.list(),
    queryFn: () => withAuth((token) => apiClient.getAccounts(token)),
  });

  const displayName = resolveUserDisplayName(user);
  const displayEmail = user?.email ?? t('common.notAvailable');
  const accountCount = accountsQuery.data?.accounts.length ?? 0;
  const lastSyncLabel = useMemo(() => formatSync(new Date()), []);

  const dark = mode === 'dark';

  const handleLogout = async () => {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);
    await logout();
    setIsLoggingOut(false);
  };

  const goToAnalyticsScreen = (screen: 'AiAdvisor' | 'WeeklyReport') => {
    const parent = navigation.getParent?.();
    const root = parent?.getParent?.();
    const target = (root ?? parent ?? navigation) as {
      navigate: (
        routeName: keyof RootTabParamList,
        params?: RootTabParamList['AnalyticsTab'],
      ) => void;
    };

    target.navigate('AnalyticsTab', { screen });
  };

  return (
    <ScreenContainer dark={dark}>
      <View style={styles.container}>
        <Card
          dark={dark}
          style={[
            styles.profileCard,
            {
              borderColor: dark ? '#2A2D42' : '#E4EAF5',
              backgroundColor: dark ? '#15192A' : '#FFFFFF',
            },
          ]}
        >
          <MintlyLogo style={styles.profileBrand} variant="wordmark" width={138} />
          <View style={styles.avatarWrap}>
            <View style={[styles.avatar, { backgroundColor: dark ? '#242B42' : '#EAF1FF' }]}>
              <Text style={[styles.avatarInitial, { color: theme.colors.primary }]}>
                {displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.verifiedChip}>
              <Text style={styles.verifiedDot}>✓</Text>
            </View>
          </View>

          <Text style={[styles.name, { color: theme.colors.text }]}>{displayName}</Text>
          <Text style={[styles.email, { color: theme.colors.textMuted }]}>{displayEmail}</Text>

          <View
            style={[
              styles.premiumPill,
              { backgroundColor: dark ? 'rgba(66,17,212,0.22)' : 'rgba(47,107,255,0.12)' },
            ]}
          >
            <Text style={[styles.premiumText, { color: theme.colors.primary }]}>{t('profile.premiumMember')}</Text>
          </View>
        </Card>

        <Card
          dark={dark}
          style={[
            styles.statsCard,
            {
              borderColor: dark ? '#2A2D42' : '#E4EAF5',
              backgroundColor: dark ? '#15192A' : '#FFFFFF',
            },
          ]}
        >
          <View style={styles.statItem}>
            <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>{t('profile.baseCurrency')}</Text>
            <Text style={[styles.statValue, { color: theme.colors.text }]}>{user?.baseCurrency ?? t('common.notAvailable')}</Text>
          </View>
          <View style={[styles.statsDivider, { backgroundColor: dark ? '#2A2D42' : '#E4EAF5' }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>{t('profile.accounts')}</Text>
            <Text style={[styles.statValue, { color: theme.colors.text }]}>
              {accountsQuery.isLoading ? t('common.loadingShort') : String(accountCount)}
            </Text>
          </View>
          <View style={[styles.statsDivider, { backgroundColor: dark ? '#2A2D42' : '#E4EAF5' }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>{t('profile.lastSync')}</Text>
            <Text style={[styles.statValue, { color: theme.colors.text }]}>{lastSyncLabel}</Text>
          </View>
        </Card>

        {accountsQuery.isError ? (
          <Text style={[styles.queryError, { color: theme.colors.expense }]}>{apiErrorText(accountsQuery.error)}</Text>
        ) : null}

        <View style={styles.sectionHeader}>
          <AppIcon name="settings-outline" size="sm" tone="muted" />
          <Text style={[styles.sectionTitle, { color: theme.colors.textMuted }]}>{t('profile.accountSettings')}</Text>
        </View>
        <Card
          dark={dark}
          style={[
            styles.listCard,
            {
              borderColor: dark ? '#2A2D42' : '#E4EAF5',
              backgroundColor: dark ? '#15192A' : '#FFFFFF',
            },
          ]}
        >
          <SettingsRow iconName="person-circle-outline" label={t('profile.rows.personalInfo')} subtitle={t('profile.rows.personalInfoSubtitle')} onPress={() => navigation.navigate('EditProfile')} />
          <Divider />
          <SettingsRow iconName="flag-outline" label={t('profile.rows.financialGoals')} subtitle={t('profile.rows.financialGoalsSubtitle')} onPress={() => navigation.navigate('FinancialGoals')} />
          <Divider />
          <SettingsRow iconName="wallet-outline" label={t('profile.rows.myAccounts')} subtitle={t('profile.rows.myAccountsSubtitle')} onPress={() => navigation.navigate('Accounts')} />
          <Divider />
          <SettingsRow iconName="settings-outline" label={t('profile.rows.appSettings')} subtitle={t('profile.rows.appSettingsSubtitle')} onPress={() => navigation.navigate('Settings')} />
          <Divider />
          <SettingsRow iconName="shield-checkmark-outline" label={t('profile.rows.security')} subtitle={t('profile.rows.securitySubtitle')} onPress={() => navigation.navigate('Security')} />
        </Card>

        <View style={styles.sectionHeader}>
          <AppIcon name="help-buoy-outline" size="sm" tone="muted" />
          <Text style={[styles.sectionTitle, { color: theme.colors.textMuted }]}>{t('profile.support')}</Text>
        </View>
        <Card
          dark={dark}
          style={[
            styles.listCard,
            {
              borderColor: dark ? '#2A2D42' : '#E4EAF5',
              backgroundColor: dark ? '#15192A' : '#FFFFFF',
            },
          ]}
        >
          <SettingsRow iconName="information-circle-outline" label={t('profile.rows.about')} subtitle={t('profile.rows.aboutSubtitle')} onPress={() => navigation.navigate('About')} />
          <Divider />
          <SettingsRow iconName="sparkles-outline" label={t('profile.rows.aiAdvisor')} subtitle={t('profile.rows.aiAdvisorSubtitle')} onPress={() => goToAnalyticsScreen('AiAdvisor')} />
          <Divider />
          <SettingsRow iconName="stats-chart-outline" label={t('profile.rows.weeklyReport')} subtitle={t('profile.rows.weeklyReportSubtitle')} onPress={() => goToAnalyticsScreen('WeeklyReport')} />
          <Divider />
          <Pressable
            accessibilityRole="button"
            disabled={isLoggingOut}
            onPress={() => {
              void handleLogout();
            }}
            style={({ pressed }) => [
              styles.logoutRow,
              {
                backgroundColor: dark ? 'rgba(240,68,56,0.12)' : '#FFF1F1',
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <View style={[styles.logoutIconWrap, { backgroundColor: dark ? 'rgba(240,68,56,0.2)' : '#FFE3E3' }]}>
              <AppIcon name="log-out-outline" size="sm" tone="expense" />
            </View>
            <View style={styles.rowTextWrap}>
              <Text style={styles.logoutLabel}>{isLoggingOut ? t('profile.loggingOut') : t('profile.logOut')}</Text>
              <Text style={styles.logoutSubtext}>{t('profile.useDifferentAccount')}</Text>
            </View>
          </Pressable>
        </Card>

        {isLoggingOut ? (
          <View style={styles.overlaySpinner}>
            <ActivityIndicator color={theme.colors.primary} size="small" />
          </View>
        ) : null}
      </View>
    </ScreenContainer>
  );
}

function SettingsRow({
  iconName,
  label,
  subtitle,
  onPress,
}: {
  iconName: Parameters<typeof AppIcon>[0]['name'];
  label: string;
  subtitle: string;
  onPress: () => void;
}) {
  const { theme, mode } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={[styles.rowIconWrap, { backgroundColor: mode === 'dark' ? 'rgba(66,17,212,0.18)' : '#ECF2FF' }]}>
        <AppIcon name={iconName} size="sm" tone="primary" />
      </View>
      <View style={styles.rowTextWrap}>
        <Text style={[styles.rowTitle, { color: theme.colors.text }]}>{label}</Text>
        <Text style={[styles.rowSubtitle, { color: theme.colors.textMuted }]}>{subtitle}</Text>
      </View>
      <AppIcon name="chevron-forward" size="sm" tone="muted" />
    </Pressable>
  );
}

function Divider() {
  const { mode } = useTheme();

  return <View style={[styles.divider, { backgroundColor: mode === 'dark' ? '#2A2D42' : '#E4EAF5' }]} />;
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  profileCard: {
    alignItems: 'center',
    gap: spacing.xxs,
  },
  profileBrand: {
    marginBottom: spacing.sm,
  },
  avatarWrap: {
    marginBottom: spacing.xs,
    position: 'relative',
  },
  avatar: {
    alignItems: 'center',
    borderRadius: radius.full,
    height: 92,
    justifyContent: 'center',
    width: 92,
  },
  avatarInitial: {
    ...typography.heading,
    fontSize: 34,
    fontWeight: '700',
  },
  verifiedChip: {
    alignItems: 'center',
    backgroundColor: '#17B26A',
    borderRadius: radius.full,
    bottom: 2,
    height: 24,
    justifyContent: 'center',
    position: 'absolute',
    right: 2,
    width: 24,
  },
  verifiedDot: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  name: {
    ...typography.heading,
    fontSize: 24,
    fontWeight: '700',
  },
  email: {
    ...typography.body,
    fontSize: 14,
  },
  premiumPill: {
    borderRadius: radius.full,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  premiumText: {
    ...typography.caption,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  statsCard: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 90,
  },
  statItem: {
    flex: 1,
    gap: spacing.xxs,
  },
  statLabel: {
    ...typography.caption,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  statValue: {
    ...typography.subheading,
    fontSize: 15,
    fontWeight: '700',
  },
  statsDivider: {
    height: 38,
    width: 1,
  },
  sectionTitle: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: spacing.xs,
    paddingHorizontal: 0,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  listCard: {
    paddingHorizontal: 0,
    paddingVertical: spacing.xs,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowPressed: {
    opacity: 0.86,
  },
  rowIconWrap: {
    alignItems: 'center',
    borderRadius: radius.md,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  rowTextWrap: {
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
  divider: {
    height: 1,
    marginHorizontal: spacing.md,
  },
  logoutRow: {
    alignItems: 'center',
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
    minHeight: 54,
    paddingHorizontal: spacing.sm,
  },
  logoutIconWrap: {
    alignItems: 'center',
    borderRadius: radius.md,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  logoutLabel: {
    ...typography.body,
    color: '#F04438',
    fontWeight: '700',
  },
  logoutSubtext: {
    ...typography.caption,
    color: '#F97066',
    fontSize: 11,
  },
  queryError: {
    ...typography.caption,
    fontSize: 12,
    paddingHorizontal: spacing.xs,
  },
  overlaySpinner: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
});
