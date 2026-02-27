import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as AppleAuthentication from 'expo-apple-authentication';
import { makeRedirectUri } from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';

import { useAuth } from '@app/providers/AuthProvider';
import { MintlyLogo } from '../../../components/brand/MintlyLogo';
import { mobileEnv } from '@core/config/env';
import type { AuthStackParamList } from '@core/navigation/types';
import { AuthFooterLinks } from '@features/auth/components/AuthFooterLinks';
import { AuthLayout } from '@features/auth/components/AuthLayout';
import { useI18n } from '@shared/i18n';
import { AppIcon, TextField } from '@shared/ui';
import { radius, spacing, typography, useTheme } from '@shared/theme';
import { apiErrorText } from '@shared/utils/apiErrorText';

// stitch asset: stitch/export/stitch_ana_ekran_dashboard/giris_yap_(renk_guncellemesi)/screen.png
// no touch/keyboard behavior changed by this PR.
type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

type OauthProvider = 'google' | 'apple';

interface LoginErrors {
  email?: string;
  password?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FALLBACK_GOOGLE_CLIENT_ID = 'mintly-google-missing-client-id';

WebBrowser.maybeCompleteAuthSession();

function ensureSafeRedirectUri(uri: string): string {
  return uri.includes('?') ? uri : `${uri}?`;
}

function validateLogin(email: string, password: string, t: (key: string) => string): LoginErrors {
  const next: LoginErrors = {};

  if (!email.trim()) {
    next.email = t('auth.validation.emailRequired');
  } else if (!EMAIL_REGEX.test(email.trim())) {
    next.email = t('auth.validation.emailInvalid');
  }

  if (!password) {
    next.password = t('auth.validation.passwordRequired');
  }

  return next;
}

function extractGoogleIdToken(result: unknown): string | null {
  if (!result || typeof result !== 'object') {
    return null;
  }

  const payload = result as {
    type?: string;
    params?: Record<string, unknown>;
    authentication?: { idToken?: string | null };
  };

  if (payload.type !== 'success') {
    return null;
  }

  const fromParams = payload.params?.id_token;
  if (typeof fromParams === 'string' && fromParams.length > 0) {
    return fromParams;
  }

  const fromAuthentication = payload.authentication?.idToken;
  if (typeof fromAuthentication === 'string' && fromAuthentication.length > 0) {
    return fromAuthentication;
  }

  return null;
}

function isCancelledError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const code = 'code' in error ? (error as { code?: string }).code : undefined;
  return code === 'ERR_REQUEST_CANCELED';
}

function buildAppleName(fullName: AppleAuthentication.AppleAuthenticationFullName | null): string | undefined {
  if (!fullName) {
    return undefined;
  }

  const value = [fullName.givenName, fullName.familyName]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter((part) => part.length > 0)
    .join(' ')
    .trim();

  return value.length > 0 ? value : undefined;
}

export function LoginScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const { login, oauthLogin, authError, clearAuthError } = useAuth();
  const passwordRef = useRef<TextInput | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<LoginErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeOauthProvider, setActiveOauthProvider] = useState<OauthProvider | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const googleRedirectUri = useMemo(
    () => {
      const rawUri = makeRedirectUri({
        scheme: 'mintly',
        path: 'oauthredirect',
      });
      return ensureSafeRedirectUri(rawUri);
    },
    [],
  );
  const googlePrimaryClientId = useMemo(
    () =>
      Platform.select({
        ios: mobileEnv.googleOauthIosClientId,
        android: mobileEnv.googleOauthAndroidClientId,
        default: mobileEnv.googleOauthWebClientId,
      }) ??
      mobileEnv.googleOauthIosClientId ??
      mobileEnv.googleOauthAndroidClientId ??
      mobileEnv.googleOauthWebClientId ??
      FALLBACK_GOOGLE_CLIENT_ID,
    [],
  );

  const [googleRequest, , promptGoogleAsync] = Google.useIdTokenAuthRequest({
    clientId: googlePrimaryClientId,
    webClientId: mobileEnv.googleOauthWebClientId,
    iosClientId: mobileEnv.googleOauthIosClientId,
    androidClientId: mobileEnv.googleOauthAndroidClientId,
    selectAccount: true,
    redirectUri: googleRedirectUri,
  });

  const googleConfigured =
    Boolean(mobileEnv.googleOauthWebClientId) ||
    Boolean(mobileEnv.googleOauthIosClientId) ||
    Boolean(mobileEnv.googleOauthAndroidClientId);
  const googleRequestReady = googleConfigured && Boolean(googleRequest);

  useEffect(() => {
    if (!__DEV__) {
      return;
    }

    console.info('[auth][google][dev-config]', {
      platform: Platform.OS,
      hasWebClientId: Boolean(mobileEnv.googleOauthWebClientId),
      hasIosClientId: Boolean(mobileEnv.googleOauthIosClientId),
      hasAndroidClientId: Boolean(mobileEnv.googleOauthAndroidClientId),
      primaryClientIdSet: googlePrimaryClientId !== FALLBACK_GOOGLE_CLIENT_ID,
      requestReady: Boolean(googleRequest),
      redirectUri: googleRedirectUri,
      authorizeUrl: googleRequest?.url ?? null,
    });

    if (Platform.OS === 'ios' && !mobileEnv.googleOauthIosClientId) {
      console.info('[auth][google][dev-hint] Missing EXPO_PUBLIC_GOOGLE_OAUTH_IOS_CLIENT_ID for iOS build.');
    }

    if (Platform.OS === 'android' && !mobileEnv.googleOauthAndroidClientId) {
      console.info('[auth][google][dev-hint] Missing EXPO_PUBLIC_GOOGLE_OAUTH_ANDROID_CLIENT_ID for Android build.');
    }
  }, [googlePrimaryClientId, googleRedirectUri, googleRequest]);

  const submit = async () => {
    if (isSubmitting || activeOauthProvider) {
      return;
    }

    clearAuthError();
    setRequestError(null);

    const nextErrors = validateLogin(email, password, t);
    setErrors(nextErrors);
    if (nextErrors.email || nextErrors.password) {
      return;
    }

    setIsSubmitting(true);
    try {
      const ok = await login({
        email: email.trim(),
        password,
      });

      if (!ok && !authError) {
        setRequestError(t('auth.login.fallbackError'));
      }
    } catch (error) {
      setRequestError(apiErrorText(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitGoogle = async () => {
    if (isSubmitting || activeOauthProvider) {
      return;
    }

    clearAuthError();
    setRequestError(null);

    if (!googleRequestReady || !googleRequest) {
      setRequestError(t('auth.login.oauth.googleUnavailable'));
      if (__DEV__) {
        Alert.alert(t('auth.login.oauth.googleCta'), t('auth.login.oauth.googleUnavailable'));
      }
      return;
    }

    setActiveOauthProvider('google');

    try {
      if (__DEV__) {
        console.info('[auth][google][prompt]', {
          redirectUri: googleRedirectUri,
          authorizeUrl: googleRequest.url ?? null,
        });
      }

      const promptOptions = {
        useProxy: false,
        showInRecents: true,
      } as unknown as Parameters<typeof promptGoogleAsync>[0];
      const result = await promptGoogleAsync(promptOptions);

      if (__DEV__) {
        console.info('[auth][google][result]', {
          type: typeof result?.type === 'string' ? result.type : 'unknown',
        });
      }

      const idToken = extractGoogleIdToken(result);

      if (!idToken) {
        const resultType = (result as { type?: string }).type;
        if (resultType !== 'dismiss' && resultType !== 'cancel') {
          setRequestError(t('auth.login.oauth.tokenMissing'));
          if (__DEV__) {
            Alert.alert(t('auth.login.oauth.googleCta'), t('auth.login.oauth.tokenMissing'));
          }
        } else if (__DEV__) {
          Alert.alert(t('auth.login.oauth.googleCta'), t('common.cancel'));
        }
        return;
      }

      const ok = await oauthLogin({
        provider: 'google',
        idToken,
      });

      if (!ok && !authError) {
        setRequestError(t('auth.login.fallbackError'));
      }
    } catch (error) {
      setRequestError(apiErrorText(error));
      if (__DEV__) {
        Alert.alert(t('auth.login.oauth.googleCta'), apiErrorText(error));
      }
    } finally {
      setActiveOauthProvider(null);
    }
  };

  const submitApple = async () => {
    if (Platform.OS !== 'ios' || isSubmitting || activeOauthProvider) {
      return;
    }

    clearAuthError();
    setRequestError(null);
    setActiveOauthProvider('apple');

    try {
      const isAvailable = await AppleAuthentication.isAvailableAsync();
      if (!isAvailable) {
        setRequestError(t('auth.login.oauth.appleUnavailable'));
        return;
      }

      const rawNonce = Crypto.randomUUID();
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce,
      );

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      if (!credential.identityToken) {
        setRequestError(t('auth.login.oauth.tokenMissing'));
        return;
      }

      const ok = await oauthLogin({
        provider: 'apple',
        idToken: credential.identityToken,
        nonce: rawNonce,
        name: buildAppleName(credential.fullName),
      });

      if (!ok && !authError) {
        setRequestError(t('auth.login.fallbackError'));
      }
    } catch (error) {
      if (isCancelledError(error)) {
        return;
      }

      setRequestError(
        error instanceof Error && error.message
          ? apiErrorText(error)
          : t('auth.login.oauth.genericError'),
      );
    } finally {
      setActiveOauthProvider(null);
    }
  };

  const globalError = useMemo(() => requestError ?? authError ?? null, [authError, requestError]);
  const isBusy = isSubmitting || Boolean(activeOauthProvider);

  return (
    <AuthLayout
      title={t('auth.login.welcomeBack')}
      subtitle={t('auth.login.subtitle')}
      cardStyle={styles.card}
      cardBodyStyle={styles.formBody}
      topContent={
        <View style={styles.topContent}>
          <MintlyLogo variant="wordmark" width={250} />
          <AuthFooterLinks
            actionLabel={t('auth.links.joinNow')}
            onActionPress={() => navigation.navigate('Register')}
            prefix={t('auth.links.noAccount')}
          />
        </View>
      }
      footer={
        <View style={styles.footer}>
          <AuthFooterLinks
            actionLabel={t('auth.links.joinNow')}
            onActionPress={() => navigation.navigate('Register')}
            prefix={t('auth.links.noAccount')}
          />
          <View
            style={[
              styles.secureBadge,
              {
                backgroundColor: theme.mode === 'dark' ? 'rgba(255,255,255,0.04)' : theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <AppIcon name="lock-closed-outline" size="xs" tone="income" />
            <Text style={[styles.secureBadgeText, { color: theme.colors.textMuted }]}>
              {t('auth.login.secureBadge')}
            </Text>
          </View>
        </View>
      }
    >
      <TextField
        autoCapitalize="none"
        autoComplete="email"
        blurOnSubmit={false}
        error={errors.email}
        keyboardType="email-address"
        label={t('auth.login.fields.emailLabel')}
        leftAdornment={<AppIcon name="mail-outline" size="sm" tone="muted" />}
        onChangeText={(value) => {
          setEmail(value);
          setErrors((prev) => ({ ...prev, email: undefined }));
          setRequestError(null);
          clearAuthError();
        }}
        onSubmitEditing={() => passwordRef.current?.focus()}
        placeholder={t('auth.login.fields.emailPlaceholder')}
        returnKeyType="next"
        textContentType="emailAddress"
        value={email}
      />

      <TextField
        ref={passwordRef}
        autoCapitalize="none"
        autoComplete="password"
        error={errors.password}
        label={t('auth.login.fields.passwordLabel')}
        labelRight={
          <Pressable onPress={() => navigation.navigate('ForgotPassword')}>
            <Text style={[styles.forgotLink, { color: theme.colors.primary }]}>{t('auth.login.forgot')}</Text>
          </Pressable>
        }
        leftAdornment={<AppIcon name="lock-closed-outline" size="sm" tone="muted" />}
        onChangeText={(value) => {
          setPassword(value);
          setErrors((prev) => ({ ...prev, password: undefined }));
          setRequestError(null);
          clearAuthError();
        }}
        onSubmitEditing={() => {
          void submit();
        }}
        placeholder={t('auth.login.fields.passwordPlaceholder')}
        rightAdornment={
          <Pressable
            accessibilityLabel={showPassword ? t('auth.login.hidePassword') : t('auth.login.showPassword')}
            onPress={() => setShowPassword((value) => !value)}
          >
            <AppIcon name={showPassword ? 'eye-off-outline' : 'eye-outline'} size="sm" tone="muted" />
          </Pressable>
        }
        returnKeyType="go"
        secureTextEntry={!showPassword}
        textContentType="password"
        value={password}
      />

      {globalError ? <Text style={[styles.errorText, { color: theme.colors.expense }]}>{globalError}</Text> : null}

      <Pressable
        accessibilityRole="button"
        disabled={isBusy}
        onPress={() => {
          void submit();
        }}
        style={({ pressed }) => [
          styles.submitButton,
          { backgroundColor: theme.colors.buttonPrimaryBackground },
          (pressed || isBusy) && styles.submitButtonPressed,
        ]}
      >
        {isSubmitting ? (
          <ActivityIndicator color={theme.colors.buttonPrimaryText} size="small" />
        ) : (
          <View style={styles.submitContent}>
            <Text style={[styles.submitLabel, { color: theme.colors.buttonPrimaryText }]}>{t('auth.login.submit')}</Text>
            <AppIcon name="arrow-forward" size="sm" tone="inverse" />
          </View>
        )}
      </Pressable>

      <View style={styles.divider}>
        <View style={[styles.dividerLine, { backgroundColor: theme.colors.border }]} />
        <Text style={[styles.dividerLabel, { color: theme.colors.textMuted }]}>{t('auth.common.orContinueWith')}</Text>
        <View style={[styles.dividerLine, { backgroundColor: theme.colors.border }]} />
      </View>

      <View style={styles.socialRow}>
        <Pressable
          accessibilityRole="button"
          disabled={isBusy || !googleRequestReady}
          onPress={() => {
            void submitGoogle();
          }}
          style={({ pressed }) => [
            styles.socialButton,
            {
              backgroundColor: theme.mode === 'dark' ? 'rgba(255,255,255,0.04)' : theme.colors.surface,
              borderColor: theme.colors.border,
            },
            (pressed || isBusy || !googleRequestReady) && styles.socialButtonPressed,
          ]}
        >
          {activeOauthProvider === 'google' ? (
            <ActivityIndicator color={theme.colors.text} size="small" />
          ) : (
            <View style={styles.socialContent}>
              <AppIcon name="logo-google" size="sm" tone="text" />
              <Text style={[styles.socialLabel, { color: theme.colors.text }]}>{t('auth.login.oauth.googleCta')}</Text>
            </View>
          )}
        </Pressable>

        {Platform.OS === 'ios' ? (
          <Pressable
            accessibilityRole="button"
            disabled={isBusy}
            onPress={() => {
              void submitApple();
            }}
            style={({ pressed }) => [
              styles.socialButton,
              {
                backgroundColor: theme.mode === 'dark' ? 'rgba(255,255,255,0.04)' : theme.colors.surface,
                borderColor: theme.colors.border,
              },
              (pressed || isBusy) && styles.socialButtonPressed,
            ]}
          >
            {activeOauthProvider === 'apple' ? (
              <ActivityIndicator color={theme.colors.text} size="small" />
            ) : (
              <View style={styles.socialContent}>
                <AppIcon name="logo-apple" size="sm" tone="text" />
                <Text style={[styles.socialLabel, { color: theme.colors.text }]}>{t('auth.login.oauth.appleCta')}</Text>
              </View>
            )}
          </Pressable>
        ) : null}
      </View>

    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  topContent: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  card: {
    borderRadius: 30,
    paddingTop: spacing.xl,
  },
  formBody: {
    gap: spacing.md,
  },
  forgotLink: {
    ...typography.caption,
    fontWeight: '700',
  },
  errorText: {
    ...typography.caption,
  },
  submitButton: {
    alignItems: 'center',
    borderRadius: radius.md,
    height: 50,
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  submitContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
  },
  submitButtonPressed: {
    opacity: 0.85,
  },
  submitLabel: {
    ...typography.subheading,
    fontWeight: '700',
  },
  divider: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerLabel: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  socialRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  socialButton: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    height: 50,
    justifyContent: 'center',
  },
  socialButtonPressed: {
    opacity: 0.8,
  },
  socialContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
  },
  socialLabel: {
    ...typography.subheading,
    fontSize: 15,
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    gap: spacing.md,
  },
  secureBadge: {
    alignItems: 'center',
    borderRadius: radius.full,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xxs,
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  secureBadgeText: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
