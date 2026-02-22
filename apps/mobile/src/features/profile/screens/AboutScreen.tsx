import { StyleSheet, Text, View } from 'react-native';

import { Card, ScreenContainer, Section } from '@shared/ui';
import { useI18n } from '@shared/i18n';
import { radius, spacing, typography, useTheme } from '@shared/theme';
import { MintlyLogo } from '../../../components/brand/MintlyLogo';

export function AboutScreen() {
  const { theme, mode } = useTheme();
  const { t } = useI18n();
  const dark = mode === 'dark';

  return (
    <ScreenContainer>
      <Card
        style={[
          styles.heroCard,
          {
            backgroundColor: dark ? '#11192E' : '#F4F8FF',
            borderColor: dark ? '#2A3658' : '#DCE8FF',
          },
        ]}
      >
        <MintlyLogo variant="banner" width={272} />
        <View
          style={[
            styles.iconPreview,
            {
              backgroundColor: dark ? '#151E32' : '#FFFFFF',
              borderColor: dark ? '#2A3A64' : '#D9E5FF',
            },
          ]}
        >
          <MintlyLogo variant="mark" width={72} />
        </View>
      </Card>

      <Section title={t('profile.about.title')} subtitle={t('profile.about.subtitle')}>
        <Card style={styles.card}>
          <InfoRow label={t('profile.about.appNameLabel')} value={t('common.appName')} />
          <InfoRow label={t('profile.about.versionLabel')} value={t('profile.about.versionValue')} />
          <InfoRow label={t('profile.about.buildLabel')} value={t('profile.about.buildValue')} />
        </Card>
      </Section>

      <Section title={t('profile.about.notesTitle')}>
        <Card style={styles.card}>
          <Text style={[styles.note, { color: theme.colors.textMuted }]}>
            {t('profile.about.noteOne')}
          </Text>
          <Text style={[styles.note, { color: theme.colors.textMuted }]}>
            {t('profile.about.noteTwo')}
          </Text>
        </Card>
      </Section>
    </ScreenContainer>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();

  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: theme.colors.textMuted }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: theme.colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    alignItems: 'center',
    borderRadius: radius.lg,
    gap: spacing.md,
    marginBottom: spacing.sm,
    paddingVertical: spacing.lg,
  },
  iconPreview: {
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    height: 92,
    justifyContent: 'center',
    width: 92,
  },
  card: {
    gap: spacing.sm,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  infoLabel: {
    ...typography.caption,
  },
  infoValue: {
    ...typography.body,
    fontWeight: '600',
  },
  note: {
    ...typography.body,
  },
});
