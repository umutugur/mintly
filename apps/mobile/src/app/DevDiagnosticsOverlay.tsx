import { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { makeRedirectUri } from 'expo-auth-session';
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

export function DevDiagnosticsOverlay() {
  const { status, withAuth } = useAuth();
  const { isPremium } = useAds();
  const [aiHealthState, setAiHealthState] = useState<AiHealthState>('idle');
  const [aiHealthDetail, setAiHealthDetail] = useState('not_checked');

  const redirectUri = useMemo(
    () =>
      makeRedirectUri({
        scheme: 'mintly',
        path: 'oauthredirect',
      }),
    [],
  );
  const configuredScheme = useMemo(resolveScheme, []);
  const adsModulePresent = useMemo(() => Boolean(getGoogleMobileAdsModule()), []);

  useEffect(() => {
    if (!__DEV__) {
      return;
    }

    if (status !== 'authenticated') {
      setAiHealthState('idle');
      setAiHealthDetail(`auth_${status}`);
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
  }, [status, withAuth]);

  if (!__DEV__) {
    return null;
  }

  const lines = [
    `build=${__DEV__ ? 'dev' : 'prod'}`,
    `platform=${Platform.OS}`,
    `scheme=${configuredScheme}`,
    `redirect=${redirectUri}`,
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
