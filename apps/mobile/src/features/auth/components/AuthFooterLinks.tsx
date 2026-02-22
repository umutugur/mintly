import { Pressable, StyleSheet, Text, View } from 'react-native';

import { spacing, typography, useTheme } from '@shared/theme';

// no touch/keyboard behavior changed by this PR.
interface AuthFooterLinksProps {
  prefix: string;
  actionLabel: string;
  onActionPress: () => void;
}

export function AuthFooterLinks({
  prefix,
  actionLabel,
  onActionPress,
}: AuthFooterLinksProps) {
  const { theme } = useTheme();

  return (
    <View style={styles.row}>
      <Text style={[styles.prefix, { color: theme.colors.textMuted }]}>{prefix}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onActionPress}
        style={({ pressed }) => [pressed && styles.pressed]}
      >
        <Text style={[styles.action, { color: theme.colors.primary }]}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
  },
  prefix: {
    ...typography.body,
  },
  action: {
    ...typography.body,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.8,
  },
});
