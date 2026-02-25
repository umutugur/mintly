const DEFAULT_API_TIMEOUT_MS = 12_000;

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
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000',
  sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  sentryEnvironment: process.env.EXPO_PUBLIC_SENTRY_ENV,
  apiTimeoutMs: readNumberEnv('EXPO_PUBLIC_API_TIMEOUT_MS', DEFAULT_API_TIMEOUT_MS),
  helpCenterUrl: process.env.EXPO_PUBLIC_HELP_CENTER_URL,
  googleOauthWebClientId: process.env.EXPO_PUBLIC_GOOGLE_OAUTH_WEB_CLIENT_ID,
  googleOauthIosClientId: process.env.EXPO_PUBLIC_GOOGLE_OAUTH_IOS_CLIENT_ID,
  googleOauthAndroidClientId: process.env.EXPO_PUBLIC_GOOGLE_OAUTH_ANDROID_CLIENT_ID,
};
