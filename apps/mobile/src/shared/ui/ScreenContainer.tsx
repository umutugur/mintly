import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { darkTheme, spacing, useTheme } from '@shared/theme';

interface ScreenContainerProps {
  children: ReactNode;
  dark?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  scrollable?: boolean;
  safeAreaEdges?: Edge[];
  keyboardDismissMode?: 'none' | 'interactive' | 'on-drag';
  keyboardShouldPersistTaps?: 'always' | 'never' | 'handled';
  showsVerticalScrollIndicator?: boolean;
}

export function ScreenContainer({
  children,
  dark = false,
  contentStyle,
  scrollable = true,
  safeAreaEdges = ['top', 'left', 'right', 'bottom'],
  keyboardDismissMode = 'on-drag',
  keyboardShouldPersistTaps = 'handled',
  showsVerticalScrollIndicator = false,
}: ScreenContainerProps) {
  const { theme } = useTheme();
  const activeTheme = dark ? darkTheme : theme;

  if (!scrollable) {
    return (
      <SafeAreaView
        edges={safeAreaEdges}
        style={[styles.safe, { backgroundColor: activeTheme.colors.background }]}
      >
        <View style={[styles.content, contentStyle]}>{children}</View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={safeAreaEdges}
      style={[styles.safe, { backgroundColor: activeTheme.colors.background }]}
    >
      <KeyboardAwareScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, contentStyle]}
        keyboardDismissMode={keyboardDismissMode}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        showsVerticalScrollIndicator={showsVerticalScrollIndicator}
        enableOnAndroid={true}
        enableAutomaticScroll={true}
        extraScrollHeight={20}
      >
        {children}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
});
