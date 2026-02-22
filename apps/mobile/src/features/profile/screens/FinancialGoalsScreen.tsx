import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useMutation, useQuery } from '@tanstack/react-query';

import type { RiskProfile } from '@mintly/shared';

import { useAuth } from '@app/providers/AuthProvider';
import { apiClient } from '@core/api/client';
import { AppIcon, Card, PrimaryButton, ScreenContainer, TextField } from '@shared/ui';
import { useI18n } from '@shared/i18n';
import { radius, spacing, typography, useTheme } from '@shared/theme';
import { apiErrorText } from '@shared/utils/apiErrorText';

const RISK_OPTIONS: RiskProfile[] = ['low', 'medium', 'high'];

export function FinancialGoalsScreen() {
  const { withAuth, user, setSessionUser } = useAuth();
  const { theme, mode } = useTheme();
  const { t } = useI18n();

  const [savingsTargetRateText, setSavingsTargetRateText] = useState('20');
  const [riskProfile, setRiskProfile] = useState<RiskProfile>('medium');
  const [formError, setFormError] = useState<string | null>(null);

  const preferencesQuery = useQuery({
    queryKey: ['me', 'preferences'],
    queryFn: () => withAuth((token) => apiClient.getMePreferences(token)),
  });

  useEffect(() => {
    const preferences = preferencesQuery.data?.preferences;
    if (!preferences) {
      return;
    }

    setSavingsTargetRateText(String(preferences.savingsTargetRate));
    setRiskProfile(preferences.riskProfile);
  }, [preferencesQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (payload: { savingsTargetRate: number; riskProfile: RiskProfile }) =>
      withAuth((token) => apiClient.updateMePreferences(payload, token)),
    onSuccess: (response) => {
      if (!user) {
        return;
      }

      setSessionUser({
        ...user,
        savingsTargetRate: response.preferences.savingsTargetRate,
        riskProfile: response.preferences.riskProfile,
      });
      setFormError(null);
    },
    onError: (error) => {
      setFormError(apiErrorText(error));
    },
  });

  const dark = mode === 'dark';

  const onSave = () => {
    const numericValue = Number(savingsTargetRateText.trim());
    if (!Number.isFinite(numericValue)) {
      setFormError(t('profile.financialGoals.validation.targetRequired'));
      return;
    }

    if (numericValue < 0 || numericValue > 80) {
      setFormError(t('profile.financialGoals.validation.targetRange'));
      return;
    }

    setFormError(null);
    saveMutation.mutate({
      savingsTargetRate: Math.round(numericValue),
      riskProfile,
    });
  };

  return (
    <ScreenContainer dark={dark}>
      <View style={styles.container}>
        <Card dark={dark} style={styles.headerCard}>
          <View style={[styles.headerIconWrap, { backgroundColor: dark ? 'rgba(66,17,212,0.22)' : '#ECF2FF' }]}>
            <AppIcon name="flag-outline" size="lg" tone="primary" />
          </View>
          <Text style={[styles.title, { color: theme.colors.text }]}>{t('profile.financialGoals.title')}</Text>
          <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>{t('profile.financialGoals.subtitle')}</Text>
        </Card>

        <Card dark={dark} style={styles.formCard}>
          <TextField
            autoCapitalize="none"
            keyboardType="numeric"
            label={t('profile.financialGoals.savingsTargetRateLabel')}
            onChangeText={(value) => {
              setSavingsTargetRateText(value.replace(/[^0-9]/g, ''));
              setFormError(null);
            }}
            placeholder={t('profile.financialGoals.savingsTargetRatePlaceholder')}
            value={savingsTargetRateText}
          />

          <View style={styles.riskSection}>
            <Text style={[styles.riskTitle, { color: theme.colors.text }]}>{t('profile.financialGoals.riskProfileLabel')}</Text>
            <View style={styles.riskOptions}>
              {RISK_OPTIONS.map((option) => {
                const active = option === riskProfile;

                return (
                  <Pressable
                    key={option}
                    accessibilityRole="button"
                    onPress={() => {
                      setRiskProfile(option);
                      setFormError(null);
                    }}
                    style={[
                      styles.riskOption,
                      {
                        backgroundColor: active
                          ? theme.colors.primary
                          : dark
                            ? 'rgba(255,255,255,0.08)'
                            : '#EEF2FB',
                        borderColor: active ? theme.colors.primary : theme.colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.riskOptionText,
                        {
                          color: active ? '#FFFFFF' : theme.colors.text,
                        },
                      ]}
                    >
                      {t(`profile.financialGoals.riskProfile.${option}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Text style={[styles.hintText, { color: theme.colors.textMuted }]}>
            {t('profile.financialGoals.hint')}
          </Text>

          {preferencesQuery.isError ? (
            <Text style={[styles.errorText, { color: theme.colors.expense }]}>{apiErrorText(preferencesQuery.error)}</Text>
          ) : null}

          {formError ? <Text style={[styles.errorText, { color: theme.colors.expense }]}>{formError}</Text> : null}

          <PrimaryButton
            disabled={preferencesQuery.isLoading || saveMutation.isPending}
            label={
              saveMutation.isPending
                ? t('profile.financialGoals.saving')
                : t('profile.financialGoals.save')
            }
            onPress={onSave}
          />
        </Card>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  headerCard: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerIconWrap: {
    alignItems: 'center',
    borderRadius: radius.full,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  title: {
    ...typography.subheading,
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    ...typography.body,
    textAlign: 'center',
  },
  formCard: {
    gap: spacing.md,
  },
  riskSection: {
    gap: spacing.xs,
  },
  riskTitle: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  riskOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  riskOption: {
    borderRadius: radius.full,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  riskOptionText: {
    ...typography.caption,
    fontWeight: '700',
  },
  hintText: {
    ...typography.caption,
    lineHeight: 18,
  },
  errorText: {
    ...typography.caption,
  },
});
