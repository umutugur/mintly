import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import type { AppIconName } from './AppIcon';
import { AppIcon } from './AppIcon';
import { radius, spacing, typography, useTheme } from '@shared/theme';

interface PrimaryButtonProps {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  iconName?: AppIconName;
  loading?: boolean;
}

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  iconName,
  loading = false,
}: PrimaryButtonProps) {
  const { theme } = useTheme();
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: theme.colors.buttonPrimaryBackground,
          shadowColor: theme.shadows.card.shadowColor,
          shadowOpacity: theme.shadows.card.shadowOpacity,
          shadowRadius: theme.shadows.card.shadowRadius,
          shadowOffset: theme.shadows.card.shadowOffset,
          elevation: theme.shadows.card.elevation,
        },
        (pressed || isDisabled) && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={theme.colors.buttonPrimaryText} size="small" />
      ) : iconName ? (
        <AppIcon name={iconName} size="sm" tone="inverse" />
      ) : null}
      <Text numberOfLines={2} style={[styles.label, { color: theme.colors.buttonPrimaryText }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xs,
  },
  pressed: {
    opacity: 0.8,
  },
  label: {
    ...typography.subheading,
    flexShrink: 1,
    textAlign: 'center',
  },
});
