import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, Chip, ScreenContainer, Section } from '@shared/ui';
import { useI18n } from '@shared/i18n';
import type { ModuleStackParamList } from '@core/navigation/types';
import { colors, spacing, typography } from '@shared/theme';
import { moduleLabels } from '@core/stitch/moduleLabels';
import { getScreensByModule, type StitchModule } from '@core/stitch/screenInventory';

interface ModuleHubScreenProps extends NativeStackScreenProps<ModuleStackParamList, 'Hub'> {
  title: string;
  subtitle: string;
  modules: StitchModule[];
}

export function ModuleHubScreen({ navigation, title, subtitle, modules }: ModuleHubScreenProps) {
  const { t } = useI18n();
  const screens = getScreensByModule(modules).sort((a, b) => a.folderName.localeCompare(b.folderName, 'tr'));

  const grouped = modules.map((moduleName) => ({
    moduleName,
    items: screens.filter((screen) => screen.module === moduleName),
  }));

  return (
    <ScreenContainer>
      <Card style={styles.hero}>
        <Text style={styles.heroTitle}>{title}</Text>
        <Text style={styles.heroSubtitle}>{subtitle}</Text>
        <View style={styles.heroChips}>
          <Chip label={t('stitch.hub.totalScreens', { count: screens.length })} tone="primary" />
          <Chip label={t('stitch.hub.staticPlaceholders')} />
          <Chip label={t('stitch.hub.noApi')} />
        </View>
      </Card>

      {grouped.map((group) => (
        <Section
          key={group.moduleName}
          title={t(moduleLabels[group.moduleName])}
          subtitle={t('stitch.hub.totalScreens', { count: group.items.length })}
        >
          {group.items.map((screen) => (
            <Pressable
              key={screen.screenKey}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => navigation.navigate('StitchPreview', { screenKey: screen.screenKey })}
            >
              <Text style={styles.rowTitle}>{screen.folderName}</Text>
              <View style={styles.rowMeta}>
                <Chip label={screen.hasCodeHtml ? t('stitch.hub.codeHtml') : t('stitch.hub.pngOnly')} />
                {screen.isDark ? <Chip label={t('stitch.hub.dark')} /> : null}
              </View>
            </Pressable>
          ))}
        </Section>
      ))}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  hero: {
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderColor: '#1F4CC2',
  },
  heroTitle: {
    ...typography.heading,
    color: '#FFFFFF',
  },
  heroSubtitle: {
    ...typography.body,
    color: '#D8E5FF',
  },
  heroChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  row: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.sm,
    gap: spacing.xs,
    backgroundColor: colors.surface,
  },
  rowPressed: {
    opacity: 0.88,
  },
  rowTitle: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
  },
  rowMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
});
