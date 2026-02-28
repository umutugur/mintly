import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useAuth } from '@app/providers/AuthProvider';
import type { AddStackParamList } from '@core/navigation/stacks/AddStack';
import { useI18n } from '@shared/i18n';
import { AppIcon, Card, PrimaryButton, ScreenContainer } from '@shared/ui';
import { radius, spacing, typography, useTheme } from '@shared/theme';

export function AddHubScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AddStackParamList>>();
  const { ensureSignedIn } = useAuth();
  const { t } = useI18n();
  const { theme, mode } = useTheme();

  const dark = mode === 'dark';

  const openProtectedScreen = async (screen: keyof AddStackParamList) => {
    if (!(await ensureSignedIn())) {
      return;
    }

    navigation.navigate(screen);
  };

  return (
    <ScreenContainer dark={dark}>
      <View style={styles.container}>
        <Text style={[styles.title, { color: theme.colors.text }]}>{t('add.hub.title')}</Text>
        <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>{t('add.hub.subtitle')}</Text>

        <Card
          dark={dark}
          style={[
            styles.actionCard,
            {
              borderColor: dark ? '#2B3450' : theme.colors.border,
            },
          ]}
        >
          <View style={[styles.iconWrap, { backgroundColor: dark ? '#1B2440' : '#EBF1FF' }]}>
            <AppIcon name="add-circle-outline" size="lg" tone="primary" />
          </View>

          <View style={styles.textWrap}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{t('add.hub.addTransaction')}</Text>
            <Text style={[styles.cardSubtitle, { color: theme.colors.textMuted }]}>
              {t('add.hub.addTransactionHint')}
            </Text>
          </View>

          <PrimaryButton
            iconName="arrow-forward-outline"
            label={t('add.hub.addTransactionAction')}
            onPress={() => {
              void openProtectedScreen('AddTransaction');
            }}
          />
        </Card>

        <Card
          dark={dark}
          style={[
            styles.actionCard,
            {
              borderColor: dark ? '#2B3450' : theme.colors.border,
            },
          ]}
        >
          <View style={[styles.iconWrap, { backgroundColor: dark ? '#1D213A' : '#EEF0FF' }]}>
            <AppIcon name="swap-horizontal-outline" size="lg" tone="primary" />
          </View>

          <View style={styles.textWrap}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{t('add.hub.transfer')}</Text>
            <Text style={[styles.cardSubtitle, { color: theme.colors.textMuted }]}>
              {t('add.hub.transferHint')}
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void openProtectedScreen('Transfer');
            }}
            style={[styles.secondaryButton, { borderColor: theme.colors.primary }]}
          >
            <AppIcon name="arrow-forward-outline" size="sm" tone="primary" />
            <Text style={[styles.secondaryButtonLabel, { color: theme.colors.primary }]}>
              {t('add.hub.transferAction')}
            </Text>
          </Pressable>
        </Card>

        <Card
          dark={dark}
          style={[
            styles.actionCard,
            {
              borderColor: dark ? '#2B3450' : theme.colors.border,
            },
          ]}
        >
          <View style={[styles.iconWrap, { backgroundColor: dark ? '#1D213A' : '#EEF0FF' }]}>
            <AppIcon name="repeat-outline" size="lg" tone="primary" />
          </View>

          <View style={styles.textWrap}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{t('add.hub.recurring')}</Text>
            <Text style={[styles.cardSubtitle, { color: theme.colors.textMuted }]}>
              {t('add.hub.recurringHint')}
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void openProtectedScreen('Recurring');
            }}
            style={[styles.secondaryButton, { borderColor: theme.colors.primary }]}
          >
            <AppIcon name="arrow-forward-outline" size="sm" tone="primary" />
            <Text style={[styles.secondaryButtonLabel, { color: theme.colors.primary }]}>
              {t('add.hub.recurringAction')}
            </Text>
          </Pressable>
        </Card>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  title: {
    ...typography.heading,
    fontSize: 26,
    fontWeight: '700',
  },
  subtitle: {
    ...typography.body,
    marginBottom: spacing.xs,
  },
  actionCard: {
    gap: spacing.sm,
  },
  iconWrap: {
    alignItems: 'center',
    borderRadius: radius.lg,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  textWrap: {
    gap: spacing.xxs,
  },
  cardTitle: {
    ...typography.subheading,
    fontWeight: '700',
  },
  cardSubtitle: {
    ...typography.caption,
    fontSize: 13,
  },
  secondaryButton: {
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xxs,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  secondaryButtonLabel: {
    ...typography.subheading,
    fontWeight: '700',
  },
});
