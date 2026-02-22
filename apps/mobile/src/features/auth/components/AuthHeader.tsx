import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';

import { spacing, typography, useTheme } from '@shared/theme';

// no touch/keyboard behavior changed by this PR.
interface AuthHeaderProps {
  title: string;
  subtitle?: string;
  align?: 'left' | 'center';
  titleStyle?: StyleProp<TextStyle>;
}

export function AuthHeader({
  title,
  subtitle,
  align = 'left',
  titleStyle,
}: AuthHeaderProps) {
  const { theme } = useTheme();
  const centered = align === 'center';

  return (
    <View style={styles.wrap}>
      <Text
        style={[
          styles.title,
          { color: theme.colors.text },
          centered && styles.centeredText,
          titleStyle,
        ]}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text
          style={[
            styles.subtitle,
            { color: theme.colors.textMuted },
            centered && styles.centeredText,
          ]}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  title: {
    ...typography.heading,
    fontSize: 38,
    lineHeight: 44,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  subtitle: {
    ...typography.body,
    fontSize: 17,
    lineHeight: 24,
  },
  centeredText: {
    textAlign: 'center',
  },
});
