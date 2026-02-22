import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { mobileEnv } from '@core/config/env';

let sentryInitialized = false;

function resolveRelease(): string {
  const appVersion = Constants.expoConfig?.version ?? '0.0.0';
  const runtimeVersion = Constants.expoConfig?.runtimeVersion;
  const runtime =
    typeof runtimeVersion === 'string'
      ? runtimeVersion
      : runtimeVersion && 'policy' in runtimeVersion
        ? String(runtimeVersion.policy)
        : 'runtime-unknown';

  return `finsight-mobile@${appVersion}+${runtime}`;
}

function resolveEnvironment(): string {
  if (mobileEnv.sentryEnvironment) {
    return mobileEnv.sentryEnvironment;
  }

  return __DEV__ ? 'development' : 'production';
}

export function initializeSentry(): void {
  if (sentryInitialized) {
    return;
  }

  const allowInDev = mobileEnv.sentryEnabledInDev;
  const shouldInitialize = !__DEV__ || allowInDev;
  if (!shouldInitialize) {
    return;
  }

  const dsn = mobileEnv.sentryDsn;
  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    enabled: true,
    environment: resolveEnvironment(),
    release: resolveRelease(),
    tracesSampleRate: 0.2,
    attachScreenshot: false,
    sendDefaultPii: false,
  });

  Sentry.setTag('platform', Platform.OS);
  Sentry.setTag('app.version', Constants.expoConfig?.version ?? 'unknown');
  sentryInitialized = true;
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (!sentryInitialized) {
    return;
  }

  if (context) {
    Sentry.captureException(error, { extra: context });
    return;
  }

  Sentry.captureException(error);
}

export function addSentryBreadcrumb(params: {
  category: string;
  message: string;
  level?: 'debug' | 'info' | 'warning' | 'error' | 'fatal';
  data?: Record<string, unknown>;
}): void {
  if (!sentryInitialized) {
    return;
  }

  Sentry.addBreadcrumb({
    category: params.category,
    message: params.message,
    level: params.level ?? 'info',
    data: params.data,
  });
}
