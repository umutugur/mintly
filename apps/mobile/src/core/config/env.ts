import Constants from 'expo-constants';

const DEFAULT_API_TIMEOUT_MS = 12_000;

type ExtraMap = Record<string, unknown>;

function readExpoExtra(): ExtraMap {
  const fromExpoConfig = Constants.expoConfig?.extra;
  if (fromExpoConfig && typeof fromExpoConfig === 'object') {
    return fromExpoConfig as ExtraMap;
  }

  const constantsWithManifest = Constants as unknown as { manifest?: { extra?: ExtraMap } };
  const fromManifest = constantsWithManifest.manifest?.extra;
  if (fromManifest && typeof fromManifest === 'object') {
    return fromManifest;
  }

  return {};
}

const EXPO_EXTRA = readExpoExtra();

function readStringEnv(name: string): string {
  const fromProcess = process.env[name];
  if (typeof fromProcess === 'string' && fromProcess.trim().length > 0) {
    return fromProcess;
  }

  const fromExtra = EXPO_EXTRA[name];
  if (typeof fromExtra === 'string' && fromExtra.trim().length > 0) {
    return fromExtra;
  }

  return '';
}

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) {
    return fallback;
  }

  return value.toLowerCase() === 'true';
}

function readNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return value;
}

export const mobileEnv = {
  sentryEnabledInDev: readBooleanEnv('EXPO_PUBLIC_ENABLE_SENTRY', false),
  apiBaseUrl: readStringEnv('EXPO_PUBLIC_API_BASE_URL') || 'http://localhost:3000',
  sentryDsn: readStringEnv('EXPO_PUBLIC_SENTRY_DSN'),
  sentryEnvironment: readStringEnv('EXPO_PUBLIC_SENTRY_ENV'),
  apiTimeoutMs: readNumberEnv('EXPO_PUBLIC_API_TIMEOUT_MS', DEFAULT_API_TIMEOUT_MS),
  helpCenterUrl: readStringEnv('EXPO_PUBLIC_HELP_CENTER_URL'),
  googleOauthWebClientId: readStringEnv('EXPO_PUBLIC_GOOGLE_OAUTH_WEB_CLIENT_ID'),
  googleOauthIosClientId: readStringEnv('EXPO_PUBLIC_GOOGLE_OAUTH_IOS_CLIENT_ID'),
  googleOauthAndroidClientId: readStringEnv('EXPO_PUBLIC_GOOGLE_OAUTH_ANDROID_CLIENT_ID'),
};
