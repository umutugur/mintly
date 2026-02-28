import { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import Constants from 'expo-constants';

import { useAuth } from '@app/providers/AuthProvider';
import { useAds } from '@core/ads/AdProvider';
import { getGoogleMobileAdsModule } from '@core/ads/mobileAdsModule';
import { mobileEnv } from '@core/config/env';

type AiHealthState = 'idle' | 'checking' | 'ok' | 'error';

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function resolveScheme(): string {
  const scheme = Constants.expoConfig?.scheme;
  if (Array.isArray(scheme)) {
    return scheme.join(',');
  }

  if (typeof scheme === 'string' && scheme.trim().length > 0) {
    return scheme;
  }

  return 'unknown';
}

function resolveGoogleIosRedirectScheme(iosClientId: string): string {
  const trimmed = iosClientId.trim();
  const suffix = '.apps.googleusercontent.com';
  if (!trimmed || !trimmed.endsWith(suffix)) {
    return 'com.googleusercontent.apps.1085364770994-t92be8lrnis7ma7o8kqpa3qsiulqbra2';
  }

  const base = trimmed.slice(0, -suffix.length);
  if (!base) {
    return 'com.googleusercontent.apps.1085364770994-t92be8lrnis7ma7o8kqpa3qsiulqbra2';
  }

  return `com.googleusercontent.apps.${base}`;
}

export function DevDiagnosticsOverlay() {
  const { status, withAuth, isGuest } = useAuth();
  const { isPremium } = useAds();
  const [aiHealthState, setAiHealthState] = useState<AiHealthState>('idle');
  const [aiHealthDetail, setAiHealthDetail] = useState('not_checked');
  const configuredScheme = useMemo(resolveScheme, []);
  const adsModulePresent = useMemo(() => Boolean(getGoogleMobileAdsModule()), []);
  const googleIosScheme = useMemo(
    () => resolveGoogleIosRedirectScheme(mobileEnv.googleOauthIosClientId),
    [],
  );
  const googleConfigured = mobileEnv.googleOauthWebClientId.trim().length > 0;

  useEffect(() => {
    if (!__DEV__) {
      return;
    }

    if (status !== 'authenticated' || isGuest) {
      setAiHealthState('idle');
      setAiHealthDetail(isGuest ? 'auth_guest' : `auth_${status}`);
      return;
    }

    let active = true;
    setAiHealthState('checking');
    setAiHealthDetail('requesting');

    void withAuth(async (accessToken) => {
      const response = await fetch(`${normalizeBaseUrl(mobileEnv.apiBaseUrl)}/advisor/provider-health`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!active) {
        return;
      }

      if (response.ok) {
        setAiHealthState('ok');
        setAiHealthDetail('ok');
        return;
      }

      setAiHealthState('error');
      setAiHealthDetail(`http_${response.status}`);
    }).catch(() => {
      if (!active) {
        return;
      }

      setAiHealthState('error');
      setAiHealthDetail('request_failed');
    });

    return () => {
      active = false;
    };
  }, [isGuest, status, withAuth]);

  if (!__DEV__) {
    return null;
  }

  const lines = [
    `build=${__DEV__ ? 'dev' : 'prod'}`,
    `platform=${Platform.OS}`,
    `scheme=${configuredScheme}`,
    `googleNative=${googleConfigured ? 'configured' : 'missing_web_client'}`,
    `googleIosScheme=${googleIosScheme}`,
    `adsModule=${adsModulePresent ? 'yes' : 'no'}`,
    `isPremium=${String(isPremium)}`,
    `aiHealth=${aiHealthState}:${aiHealthDetail}`,
  ];

  return (
    <View pointerEvents="none" style={styles.container}>
      {lines.map((line, index) => (
        <Text key={`${index}-${line}`} style={styles.line}>
          {line}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 8,
    right: 8,
    top: 8,
    zIndex: 9999,
    backgroundColor: 'rgba(17,24,39,0.75)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 2,
  },
  line: {
    color: '#E2E8F0',
    fontSize: 10,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
});
