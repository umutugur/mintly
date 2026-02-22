import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';

import { typography, type AppTheme } from '@shared/theme';

export function createStackOptions(theme: AppTheme): NativeStackNavigationOptions {
  return {
    keyboardHandlingEnabled: false,
    gestureEnabled: true,
    headerBackButtonDisplayMode: 'minimal',
    headerShadowVisible: true,
    headerTintColor: theme.colors.text,
    headerStyle: {
      backgroundColor: theme.colors.surface,
    },
    headerTitleStyle: {
      ...typography.subheading,
      fontSize: 17,
      fontWeight: '700',
      color: theme.colors.text,
    },
    contentStyle: {
      backgroundColor: theme.colors.background,
    },
  };
}
