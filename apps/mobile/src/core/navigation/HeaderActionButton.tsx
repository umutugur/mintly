import { Pressable, StyleSheet } from 'react-native';

import { AppIcon } from '@shared/ui';
import { spacing, useTheme } from '@shared/theme';

interface HeaderActionButtonProps {
  icon: Parameters<typeof AppIcon>[0]['name'];
  accessibilityLabel: string;
  onPress: () => void;
}

export function HeaderActionButton({
  icon,
  accessibilityLabel,
  onPress,
}: HeaderActionButtonProps) {
  const { theme } = useTheme();

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
    >
      <AppIcon name={icon} size={20} color={theme.colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    marginRight: spacing.xs,
    minHeight: 32,
    minWidth: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    opacity: 0.72,
  },
});
