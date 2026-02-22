import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { radius, spacing, useTheme } from '@shared/theme';

interface GradientCardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function GradientCard({ children, style }: GradientCardProps) {
  const { mode } = useTheme();
  const dark = mode === 'dark';

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: dark ? '#1A2450' : '#2F6BFF',
          borderColor: dark ? 'rgba(163, 188, 255, 0.22)' : 'rgba(255, 255, 255, 0.22)',
        },
        style,
      ]}
    >
      <View
        pointerEvents="none"
        style={[
          styles.glowTop,
          {
            backgroundColor: dark ? 'rgba(119, 152, 255, 0.26)' : 'rgba(132, 186, 255, 0.32)',
          },
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.glowBottom,
          {
            backgroundColor: dark ? 'rgba(34, 92, 255, 0.33)' : 'rgba(21, 97, 255, 0.36)',
          },
        ]}
      />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    position: 'relative',
  },
  glowTop: {
    borderRadius: radius.full,
    height: 176,
    position: 'absolute',
    right: -52,
    top: -72,
    width: 176,
  },
  glowBottom: {
    borderRadius: radius.full,
    bottom: -92,
    height: 206,
    left: -82,
    position: 'absolute',
    width: 206,
  },
  content: {
    gap: spacing.sm,
  },
});
