import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';

import { AppIcon } from '@shared/ui';
import { I18N_KEYS } from '@shared/i18n/keys';
import { useT } from '@shared/i18n/t';
import { radius, spacing, typography, useTheme } from '@shared/theme';

interface AddTabButtonProps {
  onPress?: (event: GestureResponderEvent) => void;
  focused?: boolean;
}

export function AddTabButton({ onPress, focused = false }: AddTabButtonProps) {
  const { theme } = useTheme();
  const t = useT();

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityLabel={t(I18N_KEYS.common.navigation.tabs.add.label)}
        accessibilityRole="button"
        hitSlop={10}
        onPress={onPress}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: theme.colors.primary,
            borderColor: theme.colors.surface,
            shadowColor: theme.shadows.card.shadowColor,
            shadowOpacity: focused ? theme.shadows.card.shadowOpacity + 0.08 : theme.shadows.card.shadowOpacity,
            shadowRadius: focused ? theme.shadows.card.shadowRadius + 2 : theme.shadows.card.shadowRadius,
            shadowOffset: theme.shadows.card.shadowOffset,
            elevation: focused ? theme.shadows.card.elevation + 1 : theme.shadows.card.elevation,
          },
          pressed && styles.buttonPressed,
        ]}
      >
        <AppIcon name="add" size={26} tone="inverse" />
      </Pressable>
      <Text
        numberOfLines={1}
        style={[styles.label, { color: focused ? theme.colors.primary : theme.colors.textMuted }]}
      >
        {t(I18N_KEYS.common.navigation.tabs.add.label)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: -22,
    alignItems: 'center',
    gap: spacing.xxs,
    minWidth: 72,
  },
  button: {
    width: 62,
    height: 62,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
  },
  buttonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  label: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: '700',
  },
});
