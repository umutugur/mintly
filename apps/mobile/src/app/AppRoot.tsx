import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppErrorBoundary } from '@app/components/AppErrorBoundary';
import { AuthProvider } from '@app/providers/AuthProvider';
import { NetworkProvider } from '@app/providers/NetworkProvider';
import { QueryProvider } from '@app/providers/QueryProvider';
import { ThemeProvider } from '@app/providers/ThemeProvider';
import { AdProvider } from '@core/ads/AdProvider';
import { I18nProvider } from '@shared/i18n';
import { AppNavigator } from '@core/navigation/AppNavigator';
import { OfflineBanner } from '@shared/ui';

export function AppRoot() {
  return (
    <I18nProvider>
      <ThemeProvider initialPreference="light">
        <SafeAreaProvider>
          <AppErrorBoundary>
            <NavigationContainer>
              <NetworkProvider>
                <QueryProvider>
                  <AuthProvider>
                    <AdProvider>
                      <AppNavigator />
                      <OfflineBanner />
                    </AdProvider>
                  </AuthProvider>
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
