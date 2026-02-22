import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { darkTheme, radius, spacing, useTheme } from '@shared/theme';

interface CardProps {
  children: ReactNode;
  dark?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Card({ children, dark = false, style }: CardProps) {
  const { theme } = useTheme();
  const activeTheme = dark ? darkTheme : theme;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: activeTheme.colors.cardBackground,
          borderColor: activeTheme.colors.cardBorder,
          shadowColor: activeTheme.shadows.card.shadowColor,
          shadowOpacity: activeTheme.shadows.card.shadowOpacity,
          shadowRadius: activeTheme.shadows.card.shadowRadius,
          shadowOffset: activeTheme.shadows.card.shadowOffset,
          elevation: activeTheme.shadows.card.elevation,
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
    borderWidth: 1,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
});
