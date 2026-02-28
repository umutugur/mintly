import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  GoogleSignin, isCancelledResponse, isErrorWithCode, isSuccessResponse, statusCodes, } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';

import { useAuth } from '@app/providers/AuthProvider';
import { MontlyLogo } from '../../../components/brand/MontlyLogo';
import { mobileEnv } from '@core/config/env';
import type { AuthStackParamList } from '@core/navigation/types';
import { AuthFooterLinks } from '@features/auth/components/AuthFooterLinks';
import { AuthLayout } from '@features/auth/components/AuthLayout';
import { useI18n } from '@shared/i18n';
import { AppIcon, TextField, showAlert } from '@shared/ui';
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

async function resolveGoogleNativeIdToken(directToken: string | null | undefined): Promise<string | null> {
  const normalizedDirectToken = typeof directToken === 'string' ? directToken.trim() : '';
  if (normalizedDirectToken.length > 0) {
    return normalizedDirectToken;
  }

  try {
    const tokens = await GoogleSignin.getTokens();
    const fallbackToken = typeof tokens.idToken === 'string' ? tokens.idToken.trim() : '';
    return fallbackToken.length > 0 ? fallbackToken : null;
  } catch {
    return null;
  }
}

function configureNativeGoogleSignIn(webClientId: string, iosClientId: string): void {
  const options: {
    webClientId: string;
    iosClientId?: string;
    scopes: string[];
  } = {
    webClientId,
    scopes: ['email', 'profile'],
  };

  if (iosClientId.length > 0) {
    options.iosClientId = iosClientId;
  }

  GoogleSignin.configure(options);
}

function isLiteralEnvPlaceholder(value: string): boolean {
  return value.includes('${') && value.includes('}');
}

function resolveGoogleNativeErrorMessage(
  error: unknown,
  platform: 'ios' | 'android',
  t: (key: string) => string,
): string | null {
  if (!isErrorWithCode(error)) {
    return null;
  }

  const code = typeof error.code === 'string' ? error.code : '';
  const message = error instanceof Error ? error.message : '';

  if (code === statusCodes.SIGN_IN_CANCELLED || code === statusCodes.IN_PROGRESS) {
    return null;
  }

  if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
    return t('auth.login.oauth.googlePlayServicesUnavailable');
  }

  if (code === statusCodes.NULL_PRESENTER) {
    return t('auth.login.oauth.googleUnavailable');
  }

  if (
    platform === 'android' &&
    (code === '10' || message.includes('DEVELOPER_ERROR'))
  ) {
    return t('auth.login.oauth.googleAndroidConfigError');
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
  const { login, oauthLogin, authError, clearAuthError, continueAsGuest } = useAuth();
  const passwordRef = useRef<TextInput | null>(null);
  const googlePromptInFlightRef = useRef(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<LoginErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeOauthProvider, setActiveOauthProvider] = useState<OauthProvider | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const googleWebClientId = mobileEnv.googleOauthWebClientId.trim();
  const googleIosClientId = mobileEnv.googleOauthIosClientId.trim();
  const googleAndroidClientId = mobileEnv.googleOauthAndroidClientId.trim();
  const googleConfigured =
    googleWebClientId.length > 0 && !isLiteralEnvPlaceholder(googleWebClientId);

  useEffect(() => {
    if (!__DEV__) {
      if (!googleConfigured) {
        return;
      }

      configureNativeGoogleSignIn(googleWebClientId, googleIosClientId);
      return;
    }

    console.info('[auth][google][native-config]', {
      platform: Platform.OS,
      hasWebClientId: googleWebClientId.length > 0,
      webClientIdIsPlaceholder: isLiteralEnvPlaceholder(googleWebClientId),
      hasIosClientId: googleIosClientId.length > 0,
      hasAndroidClientId: googleAndroidClientId.length > 0,
      currentUserCached: Boolean(GoogleSignin.getCurrentUser()),
    });

    if (!googleConfigured) {
      console.info('[auth][google][dev-hint] Missing EXPO_PUBLIC_GOOGLE_OAUTH_WEB_CLIENT_ID for native Google Sign-In.');
      return;
    }

    configureNativeGoogleSignIn(googleWebClientId, googleIosClientId);
  }, [googleAndroidClientId, googleConfigured, googleIosClientId, googleWebClientId]);

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
    if (isSubmitting || activeOauthProvider || googlePromptInFlightRef.current) {
      return;
    }

    clearAuthError();
    setRequestError(null);

    if (!googleConfigured) {
      const configErrorMessage =
        googleWebClientId.length > 0 && isLiteralEnvPlaceholder(googleWebClientId)
          ? t('auth.login.oauth.googleEnvMissingInBuild')
          : t('auth.login.oauth.googleUnavailable');
      setRequestError(configErrorMessage);
      if (__DEV__) {
        showAlert(t('auth.login.oauth.googleCta'), configErrorMessage);
      }
      return;
    }

    googlePromptInFlightRef.current = true;
    setActiveOauthProvider('google');

    try {
      if (Platform.OS === 'android') {
        const hasPlayServices = await GoogleSignin.hasPlayServices({
          showPlayServicesUpdateDialog: true,
        });

        if (!hasPlayServices) {
          setRequestError(t('auth.login.oauth.googleUnavailable'));
          return;
        }
      }

      if (__DEV__) {
        console.info('[auth][google][native-prompt]', {
          platform: Platform.OS,
          hasWebClientId: googleWebClientId.length > 0,
          hasIosClientId: googleIosClientId.length > 0,
          hasAndroidClientId: googleAndroidClientId.length > 0,
        });
      }

      const result = await GoogleSignin.signIn();

      if (isCancelledResponse(result)) {
        if (__DEV__) {
          console.info('[auth][google][native-result]', {
            type: result.type,
            hasIdToken: false,
            hasServerAuthCode: false,
          });
        }
        return;
      }

      if (!isSuccessResponse(result)) {
        setRequestError(t('auth.login.oauth.genericError'));
        return;
      }

      const idToken = await resolveGoogleNativeIdToken(result.data.idToken);

      if (__DEV__) {
        console.info('[auth][google][native-result]', {
          type: result.type,
          hasDirectIdToken: Boolean(result.data.idToken),
          hasResolvedIdToken: Boolean(idToken),
          hasServerAuthCode: Boolean(result.data.serverAuthCode),
          email: result.data.user.email,
        });
      }

      if (!idToken) {
        setRequestError(t('auth.login.oauth.tokenMissing'));
        if (__DEV__) {
          showAlert(t('auth.login.oauth.googleCta'), t('auth.login.oauth.tokenMissing'));
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
      const nativeErrorCode =
        isErrorWithCode(error) && typeof error.code === 'string'
          ? error.code
          : null;
      const nativeErrorName = error instanceof Error ? error.name : 'unknown';
      const nativeErrorMessage = error instanceof Error ? error.message : 'Unknown error';

      console.warn('[auth][google][native-error]', {
        platform: Platform.OS,
        code: nativeErrorCode,
        name: nativeErrorName,
        message: nativeErrorMessage,
      });

      if (isErrorWithCode(error)) {
        if (error.code === statusCodes.SIGN_IN_CANCELLED || error.code === statusCodes.IN_PROGRESS) {
          return;
        }

        if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
          setRequestError(t('auth.login.oauth.googleUnavailable'));
          return;
        }

        if (error.code === statusCodes.NULL_PRESENTER) {
          setRequestError(t('auth.login.oauth.googleUnavailable'));
          return;
        }
      }

      const mappedMessage = resolveGoogleNativeErrorMessage(
        error,
        Platform.OS === 'android' ? 'android' : 'ios',
        t,
      );
      if (mappedMessage) {
        setRequestError(mappedMessage);
        return;
      }

      setRequestError(apiErrorText(error));
      if (__DEV__) {
        showAlert(t('auth.login.oauth.googleCta'), apiErrorText(error));
      }
    } finally {
      googlePromptInFlightRef.current = false;
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
          <MontlyLogo variant="wordmark" width={250} />
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

      <Pressable
        accessibilityRole="button"
        disabled={isBusy}
        onPress={() => {
          void continueAsGuest();
        }}
        style={({ pressed }) => [
          styles.guestButton,
          {
            backgroundColor: theme.mode === 'dark' ? 'rgba(255,255,255,0.04)' : theme.colors.surface,
            borderColor: theme.colors.border,
          },
          (pressed || isBusy) && styles.submitButtonPressed,
        ]}
      >
        <View style={styles.socialContent}>
          <AppIcon name="compass-outline" size="sm" tone="text" />
          <Text style={[styles.guestLabel, { color: theme.colors.text }]}>
            {t('auth.guest.continueCta')}
          </Text>
        </View>
      </Pressable>

      <View style={styles.divider}>
        <View style={[styles.dividerLine, { backgroundColor: theme.colors.border }]} />
        <Text style={[styles.dividerLabel, { color: theme.colors.textMuted }]}>{t('auth.common.orContinueWith')}</Text>
        <View style={[styles.dividerLine, { backgroundColor: theme.colors.border }]} />
      </View>

      <View style={styles.socialRow}>
        <Pressable
          accessibilityRole="button"
          disabled={isBusy || !googleConfigured}
          onPress={() => {
            void submitGoogle();
          }}
          style={({ pressed }) => [
            styles.socialButton,
            {
              backgroundColor: theme.mode === 'dark' ? 'rgba(255,255,255,0.04)' : theme.colors.surface,
              borderColor: theme.colors.border,
            },
            (pressed || isBusy || !googleConfigured) && styles.socialButtonPressed,
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
  guestButton: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    height: 50,
    justifyContent: 'center',
  },
  guestLabel: {
    ...typography.subheading,
    fontWeight: '600',
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
