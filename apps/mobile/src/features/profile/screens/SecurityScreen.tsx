import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Card, ScreenContainer } from '@shared/ui';
import { useI18n } from '@shared/i18n';
import { radius, spacing, typography, useTheme } from '@shared/theme';

// stitch asset: stitch/export/stitch_ana_ekran_dashboard/güvenlik_ve_gizlilik_ayarları/screen.png
// no touch/keyboard behavior changed by this PR.

export function SecurityScreen() {
  const { theme, mode } = useTheme();
  const { t } = useI18n();
  const dark = mode === 'dark';

  const [biometricEnabled, setBiometricEnabled] = useState(true);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [sharingEnabled, setSharingEnabled] = useState(true);

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
          <View style={[styles.scoreIconWrap, { backgroundColor: theme.colors.primary }]}>
            <Text style={styles.scoreIcon}>🛡️</Text>
          </View>
          <View style={styles.scoreTextWrap}>
            <Text style={[styles.scoreTitle, { color: theme.colors.text }]}>{t('profile.security.scoreTitle')}</Text>
            <Text style={[styles.scoreSubtitle, { color: theme.colors.textMuted }]}>{t('profile.security.scoreSubtitle')}</Text>
          </View>
        </Card>

        <SectionTitle title={t('profile.security.sections.accessControl')} />
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
          <ToggleRow
            icon="🧬"
            label={t('profile.security.items.biometric.title')}
            subtitle={t('profile.security.items.biometric.subtitle')}
            value={biometricEnabled}
            onValueChange={setBiometricEnabled}
          />
          <Divider />
          <ToggleRow
            icon="🔐"
            label={t('profile.security.items.twoFactor.title')}
            subtitle={t('profile.security.items.twoFactor.subtitle')}
            value={twoFactorEnabled}
            onValueChange={setTwoFactorEnabled}
          />
          <Divider />
          <ActionRow
            icon="🕘"
            label={t('profile.security.items.accountActivity.title')}
            subtitle={t('profile.security.items.accountActivity.subtitle')}
          />
        </Card>

        <SectionTitle title={t('profile.security.sections.dataPrivacy')} />
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
          <ToggleRow
            icon="🤝"
            label={t('profile.security.items.thirdParty.title')}
            subtitle={t('profile.security.items.thirdParty.subtitle')}
            value={sharingEnabled}
            onValueChange={setSharingEnabled}
          />
          <Divider />
          <ActionRow
            icon="⬇️"
            label={t('profile.security.items.downloadData.title')}
            subtitle={t('profile.security.items.downloadData.subtitle')}
          />
          <Divider />
          <ActionRow
            icon="📜"
            label={t('profile.security.items.privacyPolicy.title')}
            subtitle={t('profile.security.items.privacyPolicy.subtitle')}
          />
        </Card>

        <SectionTitle title={t('profile.security.sections.dangerZone')} accent />
        <Card
          dark={dark}
          style={[
            styles.dangerCard,
            {
              borderColor: dark ? 'rgba(240,68,56,0.30)' : '#FFD4D2',
              backgroundColor: dark ? 'rgba(240,68,56,0.09)' : '#FFF4F4',
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              Alert.alert(t('profile.security.delete.title'), t('profile.security.delete.notAvailable'));
            }}
            style={({ pressed }) => [styles.dangerButton, pressed && styles.dangerPressed]}
          >
            <Text style={styles.dangerButtonText}>{t('profile.security.delete.cta')}</Text>
          </Pressable>
          <Text style={[styles.dangerHint, { color: theme.colors.textMuted }]}>
            {t('profile.security.delete.hint')}
          </Text>
        </Card>
      </View>
    </ScreenContainer>
  );
}

function SectionTitle({ title, accent = false }: { title: string; accent?: boolean }) {
  const { theme } = useTheme();

  return (
    <Text style={[styles.sectionTitle, { color: accent ? '#F04438' : theme.colors.primary }]}>{title}</Text>
  );
}

function ToggleRow({
  icon,
  label,
  subtitle,
  value,
  onValueChange,
}: {
  icon: string;
  label: string;
  subtitle: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
}) {
  const { theme, mode } = useTheme();
  const dark = mode === 'dark';

  return (
    <View style={styles.row}>
      <View style={[styles.iconWrap, { backgroundColor: dark ? 'rgba(66,17,212,0.18)' : '#ECF2FF' }]}>
        <Text style={styles.iconText}>{icon}</Text>
      </View>

      <View style={styles.rowTextWrap}>
        <Text style={[styles.rowTitle, { color: theme.colors.text }]}>{label}</Text>
        <Text style={[styles.rowSubtitle, { color: theme.colors.textMuted }]}>{subtitle}</Text>
      </View>

      <Switch
        trackColor={{ false: dark ? '#3A3F56' : '#CBD5E1', true: dark ? '#3A238A' : '#CAD8FF' }}
        thumbColor={value ? theme.colors.primary : '#E2E8F0'}
        onValueChange={onValueChange}
        value={value}
      />
    </View>
  );
}

function ActionRow({ icon, label, subtitle }: { icon: string; label: string; subtitle: string }) {
  const { theme, mode } = useTheme();
  const dark = mode === 'dark';

  return (
    <Pressable accessibilityRole="button" style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <View style={[styles.iconWrap, { backgroundColor: dark ? 'rgba(66,17,212,0.18)' : '#ECF2FF' }]}>
        <Text style={styles.iconText}>{icon}</Text>
      </View>

      <View style={styles.rowTextWrap}>
        <Text style={[styles.rowTitle, { color: theme.colors.text }]}>{label}</Text>
        <Text style={[styles.rowSubtitle, { color: theme.colors.textMuted }]}>{subtitle}</Text>
      </View>

      <Text style={[styles.chevron, { color: theme.colors.textMuted }]}>{'>'}</Text>
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
  scoreCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  scoreIconWrap: {
    alignItems: 'center',
    borderRadius: radius.full,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  scoreIcon: {
    fontSize: 18,
  },
  scoreTextWrap: {
    flex: 1,
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
    paddingHorizontal: 0,
    paddingVertical: spacing.xs,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 58,
    paddingHorizontal: spacing.md,
  },
  rowPressed: {
    opacity: 0.86,
  },
  iconWrap: {
    alignItems: 'center',
    borderRadius: radius.md,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  iconText: {
    fontSize: 16,
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
  chevron: {
    ...typography.subheading,
    fontSize: 16,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    marginHorizontal: spacing.md,
  },
  dangerCard: {
    gap: spacing.sm,
  },
  dangerButton: {
    alignItems: 'center',
    borderColor: '#F04438',
    borderRadius: radius.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
  },
  dangerPressed: {
    opacity: 0.86,
  },
  dangerButtonText: {
    ...typography.caption,
    color: '#F04438',
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  dangerHint: {
    ...typography.caption,
    fontSize: 11,
    textAlign: 'center',
  },
});
