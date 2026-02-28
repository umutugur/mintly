import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  GoogleSignin, isCancelledResponse, isErrorWithCode, isSuccessResponse, statusCodes, } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';

import { AuthFooterLinks } from '@features/auth/components/AuthFooterLinks';
import { AuthLayout } from '@features/auth/components/AuthLayout';
import { MontlyLogo } from '../../../components/brand/MontlyLogo';
import { mobileEnv } from '@core/config/env';
import { AppIcon, TextField, showAlert } from '@shared/ui';
import { useAuth } from '@app/providers/AuthProvider';
import { useI18n } from '@shared/i18n';
import type { AuthStackParamList } from '@core/navigation/types';
import { radius, spacing, typography, useTheme } from '@shared/theme';
import { apiErrorText } from '@shared/utils/apiErrorText';

// stitch asset: stitch/export/stitch_ana_ekran_dashboard/kayit_ol_(dark_mode)_2/screen.png
// no touch/keyboard behavior changed by this PR.
type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

type OauthProvider = 'google' | 'apple';

interface RegisterErrors {
  name?: string;
  email?: string;
  password?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

function validateRegister(
  name: string,
  email: string,
  password: string,
  t: (key: string) => string,
): RegisterErrors {
  const next: RegisterErrors = {};

  if (!name.trim()) {
    next.name = t('auth.validation.nameRequired');
  }

  if (!email.trim()) {
    next.email = t('auth.validation.emailRequired');
  } else if (!EMAIL_REGEX.test(email.trim())) {
    next.email = t('auth.validation.emailInvalid');
  }

  if (!password) {
    next.password = t('auth.validation.passwordRequired');
  } else if (password.length < 8) {
    next.password = t('auth.validation.passwordMin');
  }

  return next;
}

function IconText({
  color,
  size,
  symbol,
}: {
  color: string;
  size: number;
  symbol: string;
}) {
  return <Text style={[styles.iconText, { color, fontSize: size }]}>{symbol}</Text>;
}

export function RegisterScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const { register, oauthLogin, authError, clearAuthError } = useAuth();

  const emailRef = useRef<TextInput | null>(null);
  const passwordRef = useRef<TextInput | null>(null);
  const googlePromptInFlightRef = useRef(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<RegisterErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeOauthProvider, setActiveOauthProvider] = useState<OauthProvider | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const googleWebClientId = mobileEnv.googleOauthWebClientId.trim();
  const googleIosClientId = mobileEnv.googleOauthIosClientId.trim();
  const googleAndroidClientId = mobileEnv.googleOauthAndroidClientId.trim();
  const googleConfigured = googleWebClientId.length > 0;

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
      hasIosClientId: googleIosClientId.length > 0,
      hasAndroidClientId: googleAndroidClientId.length > 0,
      currentUserCached: Boolean(GoogleSignin.getCurrentUser()),
      screen: 'register',
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

    const nextErrors = validateRegister(name, email, password, t);
    setErrors(nextErrors);
    if (nextErrors.name || nextErrors.email || nextErrors.password) {
      return;
    }

    setIsSubmitting(true);
    try {
      const ok = await register({
        name: name.trim(),
        email: email.trim(),
        password,
      });

      if (!ok && !authError) {
        setRequestError(t('auth.register.fallbackError'));
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
      setRequestError(t('auth.login.oauth.googleUnavailable'));
      if (__DEV__) {
        showAlert(t('auth.login.oauth.googleCta'), t('auth.login.oauth.googleUnavailable'));
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
          screen: 'register',
        });
      }

      const result = await GoogleSignin.signIn();

      if (isCancelledResponse(result)) {
        if (__DEV__) {
          console.info('[auth][google][native-result]', {
            type: result.type,
            hasIdToken: false,
            hasServerAuthCode: false,
            screen: 'register',
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
          screen: 'register',
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
        setRequestError(t('auth.register.fallbackError'));
      }
    } catch (error) {
      if (__DEV__) {
        console.info('[auth][google][native-error]', {
          code:
            isErrorWithCode(error) && typeof error.code === 'string'
              ? error.code
              : null,
          name: error instanceof Error ? error.name : 'unknown',
          message: error instanceof Error ? error.message : 'Unknown error',
          screen: 'register',
        });
      }

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
        setRequestError(t('auth.register.fallbackError'));
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
      contentStyle={styles.content}
      footer={
        <AuthFooterLinks
          actionLabel={t('auth.links.signIn')}
          onActionPress={() => navigation.navigate('Login')}
          prefix={t('auth.links.haveAccount')}
        />
      }
      topContent={
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <IconText color={theme.colors.text} size={18} symbol="<" />
        </Pressable>
      }
      useCard={false}
    >
      <View style={styles.headerBlock}>
        <MontlyLogo variant="wordmark" width={220} />
        <View
          style={[
            styles.headerIconWrap,
            {
              backgroundColor: theme.mode === 'dark' ? 'rgba(255,255,255,0.05)' : theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <IconText color={theme.colors.primary} size={18} symbol="◈" />
        </View>
        <Text style={[styles.title, { color: theme.colors.text }]}>{t('auth.register.title')}</Text>
        <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>{t('auth.register.subtitle')}</Text>
      </View>

      <TextField
        autoCapitalize="words"
        autoComplete="name"
        blurOnSubmit={false}
        error={errors.name}
        label={t('auth.register.fields.nameLabel')}
        leftAdornment={<IconText color={theme.colors.inputIcon} size={15} symbol="◎" />}
        onChangeText={(value) => {
          setName(value);
          setErrors((prev) => ({ ...prev, name: undefined }));
          setRequestError(null);
          clearAuthError();
        }}
        onSubmitEditing={() => emailRef.current?.focus()}
        placeholder={t('auth.register.fields.namePlaceholder')}
        returnKeyType="next"
        textContentType="name"
        value={name}
      />

      <TextField
        ref={emailRef}
        autoCapitalize="none"
        autoComplete="email"
        blurOnSubmit={false}
        error={errors.email}
        keyboardType="email-address"
        label={t('auth.register.fields.emailLabel')}
        leftAdornment={<IconText color={theme.colors.inputIcon} size={15} symbol="@" />}
        onChangeText={(value) => {
          setEmail(value);
          setErrors((prev) => ({ ...prev, email: undefined }));
          setRequestError(null);
          clearAuthError();
        }}
        onSubmitEditing={() => passwordRef.current?.focus()}
        placeholder={t('auth.register.fields.emailPlaceholder')}
        returnKeyType="next"
        textContentType="emailAddress"
        value={email}
      />

      <TextField
        ref={passwordRef}
        autoCapitalize="none"
        autoComplete="password"
        error={errors.password}
        label={t('auth.register.fields.passwordLabel')}
        leftAdornment={<IconText color={theme.colors.inputIcon} size={16} symbol="#" />}
        onChangeText={(value) => {
          setPassword(value);
          setErrors((prev) => ({ ...prev, password: undefined }));
          setRequestError(null);
          clearAuthError();
        }}
        onSubmitEditing={() => {
          void submit();
        }}
        placeholder="••••••••"
        returnKeyType="go"
        rightAdornment={
          <Pressable
            accessibilityLabel={showPassword ? t('auth.login.hidePassword') : t('auth.login.showPassword')}
            onPress={() => setShowPassword((value) => !value)}
          >
            <IconText color={theme.colors.inputIcon} size={16} symbol={showPassword ? '○' : '◉'} />
          </Pressable>
        }
        secureTextEntry={!showPassword}
        textContentType="newPassword"
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
          <Text style={[styles.submitLabel, { color: theme.colors.buttonPrimaryText }]}>
            {t('auth.register.submit')}
          </Text>
        )}
      </Pressable>

      <View style={styles.divider}>
        <View style={[styles.dividerLine, { backgroundColor: theme.colors.border }]} />
        <Text style={[styles.dividerLabel, { color: theme.colors.textMuted }]}>{t('auth.common.or')}</Text>
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
              <Text style={[styles.socialLabel, { color: theme.colors.text }]}>
                {t('auth.login.oauth.googleCta')}
              </Text>
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
                <Text style={[styles.socialLabel, { color: theme.colors.text }]}>
                  {t('auth.login.oauth.appleCta')}
                </Text>
              </View>
            )}
          </Pressable>
        ) : null}
      </View>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  iconText: {
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'center',
  },
  content: {
    justifyContent: 'flex-start',
  },
  backButton: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  headerBlock: {
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  headerIconWrap: {
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    height: 0,
    justifyContent: 'center',
    marginBottom: 0,
    width: 0,
  },
  title: {
    ...typography.title,
    fontSize: 46,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 52,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body,
    fontSize: 18,
    lineHeight: 25,
    maxWidth: 320,
    textAlign: 'center',
  },
  errorText: {
    ...typography.caption,
  },
  submitButton: {
    alignItems: 'center',
    borderRadius: radius.md,
    height: 52,
    justifyContent: 'center',
    marginTop: spacing.xs,
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
  socialContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
  },
  socialButtonPressed: {
    opacity: 0.82,
  },
  socialLabel: {
    ...typography.subheading,
    fontWeight: '600',
  },
});
