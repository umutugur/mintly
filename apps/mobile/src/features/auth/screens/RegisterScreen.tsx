import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { AuthFooterLinks } from '@features/auth/components/AuthFooterLinks';
import { AuthLayout } from '@features/auth/components/AuthLayout';
import { MintlyLogo } from '../../../components/brand/MintlyLogo';
import { TextField } from '@shared/ui';
import { useAuth } from '@app/providers/AuthProvider';
import { useI18n } from '@shared/i18n';
import type { AuthStackParamList } from '@core/navigation/types';
import { radius, spacing, typography, useTheme } from '@shared/theme';
import { apiErrorText } from '@shared/utils/apiErrorText';

// stitch asset: stitch/export/stitch_ana_ekran_dashboard/kayit_ol_(dark_mode)_2/screen.png
// no touch/keyboard behavior changed by this PR.
type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

interface RegisterErrors {
  name?: string;
  email?: string;
  password?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const { register, authError, clearAuthError } = useAuth();

  const emailRef = useRef<TextInput | null>(null);
  const passwordRef = useRef<TextInput | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<RegisterErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  const submit = async () => {
    if (isSubmitting) {
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

  const globalError = useMemo(() => requestError ?? authError ?? null, [authError, requestError]);

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
        <MintlyLogo variant="wordmark" width={220} />
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
        disabled={isSubmitting}
        onPress={() => {
          void submit();
        }}
        style={({ pressed }) => [
          styles.submitButton,
          { backgroundColor: theme.colors.buttonPrimaryBackground },
          (pressed || isSubmitting) && styles.submitButtonPressed,
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
          onPress={() => undefined}
          style={({ pressed }) => [
            styles.socialButton,
            {
              backgroundColor: theme.mode === 'dark' ? 'rgba(255,255,255,0.04)' : theme.colors.surface,
              borderColor: theme.colors.border,
            },
            pressed && styles.socialButtonPressed,
          ]}
        >
          <Text style={[styles.socialLabel, { color: theme.colors.text }]}>{t('auth.common.google')}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => undefined}
          style={({ pressed }) => [
            styles.socialButton,
            {
              backgroundColor: theme.mode === 'dark' ? 'rgba(255,255,255,0.04)' : theme.colors.surface,
              borderColor: theme.colors.border,
            },
            pressed && styles.socialButtonPressed,
          ]}
        >
          <Text style={[styles.socialLabel, { color: theme.colors.text }]}>{t('auth.common.apple')}</Text>
        </Pressable>
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
  socialButtonPressed: {
    opacity: 0.82,
  },
  socialLabel: {
    ...typography.subheading,
    fontWeight: '600',
  },
});
