import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@app/providers/AuthProvider';
import { OnboardingNavigator } from '@features/onboarding/screens/OnboardingNavigator';
import {
  getOnboardingCompleted,
  setOnboardingCompleted,
} from '@features/onboarding/screens/onboardingStorage';
import { useI18n } from '@shared/i18n';
import { typography, useTheme } from '@shared/theme';

import { AuthStack } from './AuthStack';
import { RootTabs } from './RootTabs';

type OnboardingStatus = 'loading' | 'pending' | 'completed';

export function AppNavigator() {
  const { status } = useAuth();
  const { theme } = useTheme();
  const { t } = useI18n();
  const [onboardingStatus, setOnboardingStatus] = useState<OnboardingStatus>('loading');
  const previousStatusRef = useRef<string | null>(null);
  const previousOnboardingRef = useRef<OnboardingStatus | null>(null);

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      const completed = await getOnboardingCompleted();
      if (isMounted) {
        setOnboardingStatus(completed ? 'completed' : 'pending');
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const statusChanged = previousStatusRef.current !== status;
    const onboardingChanged = previousOnboardingRef.current !== onboardingStatus;
    if (!statusChanged && !onboardingChanged) {
      return;
    }

    const target =
      onboardingStatus === 'loading'
        ? 'onboarding_loading'
        : onboardingStatus === 'pending'
          ? 'onboarding'
          : status === 'loading'
            ? 'session_loading'
            : status === 'authenticated'
              ? 'root_tabs'
              : 'auth_stack';

    console.info('[app][navigation] root_target', {
      status,
      onboardingStatus,
      target,
    });

    previousStatusRef.current = status;
    previousOnboardingRef.current = onboardingStatus;
  }, [onboardingStatus, status]);

  const finishOnboarding = useCallback(() => {
    void (async () => {
      await setOnboardingCompleted(true);
      setOnboardingStatus('completed');
    })();
  }, []);

  if (onboardingStatus === 'loading') {
    return (
      <View style={[styles.splash, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={[styles.splashText, { color: theme.colors.textMuted }]}>{t('app.state.preparing')}</Text>
      </View>
    );
  }

  if (onboardingStatus === 'pending') {
    return <OnboardingNavigator mode="gate" onFinished={finishOnboarding} />;
  }

  if (status === 'loading') {
    return (
      <View style={[styles.splash, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={[styles.splashText, { color: theme.colors.textMuted }]}>{t('app.state.restoring')}</Text>
      </View>
    );
  }

  if (status === 'authenticated') {
    return <RootTabs />;
  }

  return <AuthStack />;
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  splashText: {
    ...typography.body,
  },
});
