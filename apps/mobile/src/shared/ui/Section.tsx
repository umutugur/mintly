import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { darkTheme, spacing, typography, useTheme } from '@shared/theme';

interface SectionProps {
  title: string;
  subtitle?: string;
  dark?: boolean;
  actionLabel?: string;
  onActionPress?: () => void;
  children: ReactNode;
}

export function Section({
  title,
  subtitle,
  dark = false,
  actionLabel,
  onActionPress,
  children,
}: SectionProps) {
  const { theme } = useTheme();
  const activeTheme = dark ? darkTheme : theme;

  return (
    <View style={styles.wrapper}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: activeTheme.colors.text }]}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: activeTheme.colors.textMuted }]}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {actionLabel ? (
          <Pressable onPress={onActionPress} style={styles.actionButton}>
            <Text style={[styles.actionText, { color: activeTheme.colors.primary }]}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  headerText: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0,
  },
  title: {
    ...typography.heading,
    fontSize: 18,
    lineHeight: 24,
    flexShrink: 1,
  },
  subtitle: {
    ...typography.caption,
    flexShrink: 1,
    lineHeight: 18,
  },
  actionButton: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xxs,
    minHeight: 28,
    justifyContent: 'center',
  },
  actionText: {
    ...typography.caption,
    fontWeight: '700',
    textAlign: 'right',
  },
  body: {
    gap: spacing.sm,
  },
});
