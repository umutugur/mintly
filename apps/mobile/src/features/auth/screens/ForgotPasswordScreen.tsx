import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { AuthLayout } from '@features/auth/components/AuthLayout';
import { MontlyLogo } from '../../../components/brand/MontlyLogo';
import { TextField } from '@shared/ui';
import { useI18n } from '@shared/i18n';
import type { AuthStackParamList } from '@core/navigation/types';
import { radius, spacing, typography, useTheme } from '@shared/theme';

// stitch asset: stitch/export/stitch_ana_ekran_dashboard/sifremi_unuttum_(dark)_1/screen.png
// no touch/keyboard behavior changed by this PR.
type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

export function ForgotPasswordScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async () => {
    setSubmitted(false);
    setError(null);

    if (!email.trim()) {
      setError(t('auth.validation.emailRequired'));
      return;
    }

    if (!EMAIL_REGEX.test(email.trim())) {
      setError(t('auth.validation.emailInvalid'));
      return;
    }

    setIsSubmitting(true);
    await Promise.resolve();
    setIsSubmitting(false);
    setSubmitted(true);
  };

  return (
    <AuthLayout
      contentStyle={styles.content}
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
        <MontlyLogo style={styles.logo} variant="wordmark" width={220} />
        <Text style={[styles.title, { color: theme.colors.text }]}>{t('auth.forgot.title')}</Text>
        <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
          {t('auth.forgot.subtitle')}
        </Text>
      </View>

      <TextField
        autoCapitalize="none"
        autoComplete="email"
        error={error}
        keyboardType="email-address"
        label={t('auth.forgot.fields.emailLabel')}
        leftAdornment={<IconText color={theme.colors.inputIcon} size={15} symbol="@" />}
        onChangeText={(value) => {
          setEmail(value);
          setError(null);
          setSubmitted(false);
        }}
        onSubmitEditing={() => {
          void submit();
        }}
        placeholder={t('auth.forgot.fields.emailPlaceholder')}
        returnKeyType="done"
        textContentType="emailAddress"
        value={email}
      />

      <View style={styles.bottomSection}>
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
            <View style={styles.submitContent}>
              <Text style={[styles.submitLabel, { color: theme.colors.buttonPrimaryText }]}>
                {t('auth.forgot.submit')}
              </Text>
              <IconText color={theme.colors.buttonPrimaryText} size={14} symbol=">" />
            </View>
          )}
        </Pressable>

        {submitted ? (
          <Text style={[styles.notice, { color: theme.colors.income }]}>
            {t('auth.forgot.success')}
          </Text>
        ) : null}

        <View style={styles.securityWrap}>
          <View style={styles.securityLabelRow}>
            <IconText color={theme.colors.textMuted} size={10} symbol="#" />
            <Text style={[styles.securityLabel, { color: theme.colors.textMuted }]}>
              {t('auth.forgot.secureBadge')}
            </Text>
          </View>
          <View style={[styles.securityBar, { backgroundColor: theme.colors.border }]} />
        </View>
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
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  logo: {
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.title,
    fontSize: 50,
    fontWeight: '800',
    letterSpacing: -1,
    lineHeight: 56,
  },
  subtitle: {
    ...typography.body,
    fontSize: 17,
    lineHeight: 27,
    maxWidth: 340,
  },
  bottomSection: {
    flex: 1,
    justifyContent: 'flex-end',
    marginTop: spacing.lg,
  },
  submitButton: {
    alignItems: 'center',
    borderRadius: radius.md,
    height: 52,
    justifyContent: 'center',
  },
  submitButtonPressed: {
    opacity: 0.85,
  },
  submitContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
  },
  submitLabel: {
    ...typography.subheading,
    fontWeight: '700',
  },
  notice: {
    ...typography.caption,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  securityWrap: {
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xxl,
    paddingBottom: spacing.sm,
  },
  securityLabelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  securityLabel: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  securityBar: {
    borderRadius: radius.full,
    height: 4,
    width: 44,
  },
});
