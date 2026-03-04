import { DefaultTheme as NavigationDefaultTheme, NavigationContainer, type Theme as NavigationTheme } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppErrorBoundary } from '@app/components/AppErrorBoundary';
import { AuthProvider } from '@app/providers/AuthProvider';
import { NetworkProvider } from '@app/providers/NetworkProvider';
import { QueryProvider } from '@app/providers/QueryProvider';
import { ThemeProvider, useTheme } from '@app/providers/ThemeProvider';
import { AdProvider } from '@core/ads/AdProvider';
import { useAdvisorInsightPrefetch } from '@features/advisor/hooks/useAdvisorInsightPrefetch';
import { I18nProvider } from '@shared/i18n';
import { AppNavigator } from '@core/navigation/AppNavigator';
import { AppDialogProvider, OfflineBanner } from '@shared/ui';
import { PushNotificationsBootstrap } from './PushNotificationsBootstrap';

function AdvisorInsightPrefetchBootstrap() {
  useAdvisorInsightPrefetch();
  return null;
}

function AppShell() {
  const { theme, mode } = useTheme();
  const navigationTheme = useMemo<NavigationTheme>(
    () => ({
      ...NavigationDefaultTheme,
      dark: mode === 'dark',
      colors: {
        ...NavigationDefaultTheme.colors,
        primary: theme.colors.primary,
        background: theme.colors.background,
        card: theme.colors.surface,
        text: theme.colors.text,
        border: theme.colors.border,
        notification: theme.colors.primary,
      },
    }),
    [mode, theme.colors.background, theme.colors.border, theme.colors.primary, theme.colors.surface, theme.colors.text],
  );

  return (
    <>
      <NavigationContainer theme={navigationTheme}>
        <NetworkProvider>
          <QueryProvider>
            <AppDialogProvider>
              <AuthProvider>
                <AdProvider>
                  <AdvisorInsightPrefetchBootstrap />
                  <PushNotificationsBootstrap />
                  <AppNavigator />
                  <OfflineBanner />
                </AdProvider>
              </AuthProvider>
            </AppDialogProvider>
          </QueryProvider>
        </NetworkProvider>
      </NavigationContainer>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} backgroundColor={theme.colors.background} />
    </>
  );
}

export function AppRoot() {
  return (
    <I18nProvider>
      <ThemeProvider initialPreference="light">
        <SafeAreaProvider>
          <AppErrorBoundary>
            <AppShell />
          </AppErrorBoundary>
        </SafeAreaProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}
