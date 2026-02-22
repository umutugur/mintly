import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { radius, spacing, useTheme } from '@shared/theme';

// no touch/keyboard behavior changed by this PR.
interface AuthCardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function AuthCard({ children, style }: AuthCardProps) {
  const { theme } = useTheme();
  const isDark = theme.mode === 'dark';

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: isDark ? theme.colors.cardBackground : theme.colors.surface,
          borderColor: theme.colors.cardBorder,
          shadowColor: theme.shadows.card.shadowColor,
          shadowOpacity: isDark ? 0.4 : theme.shadows.card.shadowOpacity,
          shadowRadius: isDark ? 20 : theme.shadows.card.shadowRadius,
          shadowOffset: isDark ? { width: 0, height: 12 } : theme.shadows.card.shadowOffset,
          elevation: isDark ? 12 : theme.shadows.card.elevation,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
});
