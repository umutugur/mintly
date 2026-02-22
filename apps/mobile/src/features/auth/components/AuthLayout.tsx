import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing, useTheme } from '@shared/theme';
import { ScreenContainer } from '@shared/ui';
import { AuthCard } from './AuthCard';
import { AuthHeader } from './AuthHeader';

// no touch/keyboard behavior changed by this PR.
interface AuthLayoutProps {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  topContent?: ReactNode;
  footer?: ReactNode;
  useCard?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  cardStyle?: StyleProp<ViewStyle>;
  cardBodyStyle?: StyleProp<ViewStyle>;
  maxWidth?: number;
}

export function AuthLayout({
  title,
  subtitle,
  children,
  topContent,
  footer,
  useCard = true,
  contentStyle,
  cardStyle,
  cardBodyStyle,
  maxWidth = 460,
}: AuthLayoutProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const isDark = theme.mode === 'dark';

  return (
    <ScreenContainer
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="always"
      safeAreaEdges={['top', 'bottom']}
      showsVerticalScrollIndicator={false}
      contentStyle={[
        styles.scrollContent,
        {
          paddingTop: Math.max(insets.top, spacing.lg),
          paddingBottom: Math.max(insets.bottom, spacing.lg),
        },
      ]}
    >
      {isDark ? (
        <>
          <View
            pointerEvents="none"
            style={[styles.glowTop, { backgroundColor: theme.colors.authGlowTop }]}
          />
          <View
            pointerEvents="none"
            style={[styles.glowBottom, { backgroundColor: theme.colors.authGlowBottom }]}
          />
        </>
      ) : null}
      <View style={[styles.content, contentStyle]}>
        {topContent ? <View style={[styles.block, { maxWidth }]}>{topContent}</View> : null}

        {useCard ? (
          <AuthCard style={[styles.block, { maxWidth }, cardStyle]}>
            {title ? <AuthHeader subtitle={subtitle} title={title} /> : null}
            <View style={[styles.body, cardBodyStyle]}>{children}</View>
          </AuthCard>
        ) : (
          <View style={[styles.block, styles.plainBlock, { maxWidth }]}>{children}</View>
        )}

        {footer ? <View style={[styles.block, { maxWidth }]}>{footer}</View> : null}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 0,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.lg,
    zIndex: 1,
  },
  block: {
    alignSelf: 'center',
    width: '100%',
  },
  plainBlock: {
    flex: 1,
    gap: spacing.lg,
  },
  body: {
    gap: spacing.md,
  },
  glowTop: {
    borderRadius: 220,
    height: 320,
    position: 'absolute',
    right: -130,
    top: -160,
    width: 320,
    zIndex: 0,
  },
  glowBottom: {
    borderRadius: 260,
    bottom: -200,
    height: 360,
    left: -180,
    position: 'absolute',
    width: 360,
    zIndex: 0,
  },
});
