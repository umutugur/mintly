import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ScreenContainer } from '@shared/ui';
import { useI18n } from '@shared/i18n';
import { radius, spacing, typography, useTheme } from '@shared/theme';

interface OnboardingStepFrameProps {
  step: 1 | 2 | 3;
  title: string;
  subtitle: string;
  illustrationIcon: string;
  actionLabel: string;
  onActionPress: () => void;
  onSkipPress?: () => void;
}

export function OnboardingStepFrame({
  step,
  title,
  subtitle,
  illustrationIcon,
  actionLabel,
  onActionPress,
  onSkipPress,
}: OnboardingStepFrameProps) {
  const { theme, mode } = useTheme();
  const { t } = useI18n();
  const dark = mode === 'dark';

  return (
    <ScreenContainer dark={dark} scrollable={false} contentStyle={styles.containerContent}>
      <View style={styles.screen}>
        <View style={styles.topRow}>
          <View
            style={[
              styles.stepPill,
              {
                backgroundColor: dark
                  ? withAlpha(theme.colors.primary, 0.24)
                  : withAlpha(theme.colors.primary, 0.12),
                borderColor: dark
                  ? withAlpha(theme.colors.primary, 0.42)
                  : withAlpha(theme.colors.primary, 0.24),
              },
            ]}
          >
            <Text style={[styles.stepPillText, { color: theme.colors.primary }]}>
              {t('onboarding.stepLabel', { current: step, total: 3 })}
            </Text>
          </View>

          {onSkipPress ? (
            <Pressable
              accessibilityRole="button"
              onPress={onSkipPress}
              style={({ pressed }) => [styles.skipButton, pressed && styles.pressed]}
            >
              <Text style={[styles.skipText, { color: theme.colors.textMuted }]}>{t('onboarding.skip')}</Text>
            </Pressable>
          ) : (
            <View style={styles.skipPlaceholder} />
          )}
        </View>

        <View
          style={[
            styles.heroCard,
            {
              backgroundColor: dark ? theme.colors.cardBackground : theme.colors.surface,
              borderColor: theme.colors.cardBorder,
              shadowColor: theme.shadows.card.shadowColor,
              shadowOpacity: dark ? 0.34 : theme.shadows.card.shadowOpacity,
              shadowRadius: dark ? 20 : theme.shadows.card.shadowRadius,
              shadowOffset: dark ? { width: 0, height: 12 } : theme.shadows.card.shadowOffset,
              elevation: dark ? 10 : theme.shadows.card.elevation,
            },
          ]}
        >
          <View pointerEvents="none" style={styles.illustrationWrap}>
            <View
              style={[
                styles.glowA,
                { backgroundColor: dark ? theme.colors.authGlowTop : withAlpha(theme.colors.primary, 0.18) },
              ]}
            />
            <View
              style={[
                styles.glowB,
                { backgroundColor: dark ? theme.colors.authGlowBottom : withAlpha(theme.colors.primary, 0.12) },
              ]}
            />
          </View>

          <View style={[styles.iconBadge, { backgroundColor: theme.colors.primary }]}>
            <Text style={styles.iconBadgeText}>{illustrationIcon}</Text>
          </View>

          <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
          <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>{subtitle}</Text>
        </View>

        <View style={styles.dotRow}>
          {[1, 2, 3].map((index) => (
            <View
              key={`dot-${index}`}
              style={[
                styles.dot,
                index === step
                  ? { backgroundColor: theme.colors.primary, width: 22 }
                  : { backgroundColor: withAlpha(theme.colors.textMuted, dark ? 0.5 : 0.35), width: 8 },
              ]}
            />
          ))}
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={onActionPress}
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: theme.colors.buttonPrimaryBackground },
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.primaryButtonText, { color: theme.colors.buttonPrimaryText }]}>{actionLabel}</Text>
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

function withAlpha(hexColor: string, alpha: number): string {
  const color = hexColor.trim();
  const hex = color.startsWith('#') ? color.slice(1) : color;

  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    return color;
  }

  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(alpha, 1))})`;
}

const styles = StyleSheet.create({
  containerContent: {
    flexGrow: 1,
  },
  screen: {
    flex: 1,
    justifyContent: 'space-between',
    gap: spacing.lg,
  },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 34,
  },
  stepPill: {
    borderRadius: radius.full,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  stepPillText: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  skipButton: {
    borderRadius: radius.full,
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  skipText: {
    ...typography.body,
    fontWeight: '600',
  },
  skipPlaceholder: {
    width: 54,
  },
  heroCard: {
    alignItems: 'center',
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: spacing.sm,
    overflow: 'hidden',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    position: 'relative',
  },
  illustrationWrap: {
    ...StyleSheet.absoluteFillObject,
  },
  glowA: {
    borderRadius: 160,
    height: 220,
    position: 'absolute',
    right: -80,
    top: -90,
    width: 220,
  },
  glowB: {
    borderRadius: 180,
    bottom: -120,
    height: 240,
    left: -120,
    position: 'absolute',
    width: 240,
  },
  iconBadge: {
    alignItems: 'center',
    borderRadius: radius.full,
    height: 68,
    justifyContent: 'center',
    marginBottom: spacing.xs,
    width: 68,
  },
  iconBadgeText: {
    fontSize: 30,
  },
  title: {
    ...typography.title,
    fontSize: 32,
    lineHeight: 38,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body,
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 320,
    textAlign: 'center',
  },
  dotRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
  },
  dot: {
    borderRadius: radius.full,
    height: 8,
  },
  primaryButton: {
    alignItems: 'center',
    borderRadius: radius.lg,
    minHeight: 54,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  primaryButtonText: {
    ...typography.subheading,
    fontSize: 17,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.86,
  },
});
