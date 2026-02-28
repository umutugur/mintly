import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppErrorBoundary } from '@app/components/AppErrorBoundary';
import { AuthProvider } from '@app/providers/AuthProvider';
import { NetworkProvider } from '@app/providers/NetworkProvider';
import { QueryProvider } from '@app/providers/QueryProvider';
import { ThemeProvider } from '@app/providers/ThemeProvider';
import { AdProvider } from '@core/ads/AdProvider';
import { useAdvisorInsightPrefetch } from '@features/advisor/hooks/useAdvisorInsightPrefetch';
import { I18nProvider } from '@shared/i18n';
import { AppNavigator } from '@core/navigation/AppNavigator';
import { AppDialogProvider, OfflineBanner } from '@shared/ui';
import { DevDiagnosticsOverlay } from './DevDiagnosticsOverlay';
import { PushNotificationsBootstrap } from './PushNotificationsBootstrap';

function AdvisorInsightPrefetchBootstrap() {
  useAdvisorInsightPrefetch();
  return null;
}

export function AppRoot() {
  return (
    <I18nProvider>
      <ThemeProvider initialPreference="light">
        <SafeAreaProvider>
          <AppErrorBoundary>
            <NavigationContainer>
              <NetworkProvider>
                <QueryProvider>
                  <AppDialogProvider>
                    <AuthProvider>
                      <AdProvider>
                        <AdvisorInsightPrefetchBootstrap />
                        <PushNotificationsBootstrap />
                        <AppNavigator />
                        <OfflineBanner />
                        {__DEV__ ? <DevDiagnosticsOverlay /> : null}
                      </AdProvider>
                    </AuthProvider>
                  </AppDialogProvider>
                </QueryProvider>
              </NetworkProvider>
            </NavigationContainer>
          </AppErrorBoundary>
          <StatusBar style="auto" />
        </SafeAreaProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}
