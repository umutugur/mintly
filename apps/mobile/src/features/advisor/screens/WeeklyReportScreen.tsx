import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useQuery } from '@tanstack/react-query';
import { useNavigation, type NavigationProp } from '@react-navigation/native';

import { apiClient } from '@core/api/client';
import { financeQueryKeys } from '@core/api/queryKeys';
import { safePopToTop } from '@core/navigation/safePopToTop';
import { useAuth } from '@app/providers/AuthProvider';
import { Card, ScreenContainer } from '@shared/ui';
import { useI18n } from '@shared/i18n';
import { radius, spacing, typography, useTheme } from '@shared/theme';
import { apiErrorText } from '@shared/utils/apiErrorText';

const DAY_MS = 24 * 60 * 60 * 1000;

function toDateOnlyUtc(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateOnlyUtc(value: string): Date {
  const [yearRaw, monthRaw, dayRaw] = value.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

function getCurrentWeekStartString(): string {
  const now = new Date();
  const weekday = now.getUTCDay();
  const offset = weekday === 0 ? -6 : 1 - weekday;
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset));
  return toDateOnlyUtc(monday);
}

function shiftWeek(weekStart: string, deltaWeeks: number): string {
  const start = parseDateOnlyUtc(weekStart);
  return toDateOnlyUtc(new Date(start.getTime() + deltaWeeks * 7 * DAY_MS));
}

function formatRange(start: string, locale: string): string {
  const startDate = parseDateOnlyUtc(start);
  const endDate = new Date(startDate.getTime() + 6 * DAY_MS);

  const startLabel = startDate.toLocaleDateString(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const endLabel = endDate.toLocaleDateString(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${startLabel} - ${endLabel}`;
}

function scoreTone(score: number): 'good' | 'medium' | 'risky' {
  if (score >= 80) {
    return 'good';
  }
  if (score >= 60) {
    return 'medium';
  }
  return 'risky';
}

function LoadingState({ dark }: { dark: boolean }) {
  const tone = dark ? '#1D2435' : '#E9EEF8';

  return (
    <View style={styles.loadingWrap}>
      <View style={[styles.loadingScore, { backgroundColor: tone }]} />
      <View style={[styles.loadingBlock, { backgroundColor: tone }]} />
      <View style={[styles.loadingBlock, { backgroundColor: tone }]} />
      <View style={[styles.loadingBlock, { backgroundColor: tone }]} />
    </View>
  );
}

export function WeeklyReportScreen() {
  const { withAuth } = useAuth();
  const { theme, mode } = useTheme();
  const { locale, t } = useI18n();
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const [weekStart, setWeekStart] = useState(getCurrentWeekStartString());

  const dark = mode === 'dark';
  const reportLanguage = locale.startsWith('tr')
    ? 'tr'
    : locale.startsWith('ru')
      ? 'ru'
      : 'en';

  useEffect(() => {
    const parent = navigation.getParent?.();
    if (!parent) {
      return undefined;
    }

    return parent.addListener('tabPress' as never, (event: any) => {
      const state = parent.getState();
      const focusedRoute = state.routes[state.index];
      if (!focusedRoute || event.target !== focusedRoute.key) {
        return;
      }

      event.preventDefault();
      safePopToTop(navigation, 'Analytics');
    });
  }, [navigation]);

  const reportQuery = useQuery({
    queryKey: [...financeQueryKeys.reports.weekly(weekStart), reportLanguage],
    queryFn: () => withAuth((token) => apiClient.getWeeklyReport({ weekStart, language: reportLanguage }, token)),
  });

  if (reportQuery.isLoading && !reportQuery.data) {
    return (
      <ScreenContainer dark={dark}>
        <LoadingState dark={dark} />
      </ScreenContainer>
    );
  }

  if (reportQuery.isError && !reportQuery.data) {
    return (
      <ScreenContainer dark={dark}>
        <Card dark={dark} style={styles.errorCard}>
          <Text style={[styles.errorTitle, { color: theme.colors.text }]}>{t('weeklyReport.state.errorTitle')}</Text>
          <Text style={[styles.errorText, { color: theme.colors.expense }]}>{apiErrorText(reportQuery.error)}</Text>
        </Card>
      </ScreenContainer>
    );
  }

  const report = reportQuery.data;
  if (!report) {
    return (
      <ScreenContainer dark={dark}>
        <Card dark={dark}>
          <Text style={[styles.errorText, { color: theme.colors.textMuted }]}>{t('weeklyReport.state.noData')}</Text>
        </Card>
      </ScreenContainer>
    );
  }

  const tone = scoreTone(report.healthScore);
  const scoreColor =
    tone === 'good' ? theme.colors.income : tone === 'medium' ? theme.colors.primary : theme.colors.expense;

  return (
    <ScreenContainer dark={dark}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.colors.text }]}>{t('weeklyReport.title')}</Text>
          <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>{t('weeklyReport.subtitle')}</Text>
        </View>

        <View style={styles.weekRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.goBack')}
            onPress={() => setWeekStart(shiftWeek(weekStart, -1))}
            style={({ pressed }) => [styles.arrowButton, pressed && styles.pressed]}
          >
            <Text style={[styles.arrowText, { color: theme.colors.text }]}>{'<'}</Text>
          </Pressable>

          <Text style={[styles.weekLabel, { color: theme.colors.textMuted }]}>{formatRange(weekStart, locale)}</Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.next')}
            onPress={() => setWeekStart(shiftWeek(weekStart, 1))}
            style={({ pressed }) => [styles.arrowButton, pressed && styles.pressed]}
          >
            <Text style={[styles.arrowText, { color: theme.colors.text }]}>{'>'}</Text>
          </Pressable>
        </View>

        <Card dark={dark} style={styles.scoreCard}>
          <View style={[styles.scoreCircle, { borderColor: scoreColor }]}> 
            <Text style={[styles.scoreValue, { color: scoreColor }]}>{report.healthScore}</Text>
            <Text style={[styles.scoreCaption, { color: theme.colors.textMuted }]}>{t('weeklyReport.scoreOutOf')}</Text>
          </View>
          <Text style={[styles.summaryText, { color: theme.colors.text }]}>{report.summaryText}</Text>
          {reportQuery.isFetching ? <ActivityIndicator size="small" color={theme.colors.primary} /> : null}
        </Card>

        <Card dark={dark} style={styles.sectionCard}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{t('weeklyReport.highlights')}</Text>
          {report.highlights.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>{t('weeklyReport.noHighlights')}</Text>
          ) : (
            <View style={styles.listWrap}>
              {report.highlights.map((item, index) => (
                <View key={`${item}-${index}`} style={styles.listRow}>
                  <View style={[styles.listDot, { backgroundColor: theme.colors.income }]} />
                  <Text style={[styles.listText, { color: theme.colors.textMuted }]}>{item}</Text>
                </View>
              ))}
            </View>
          )}
        </Card>

        <Card dark={dark} style={styles.sectionCard}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{t('weeklyReport.riskFlags')}</Text>
          {report.riskFlags.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>{t('weeklyReport.noRisks')}</Text>
          ) : (
            <View style={styles.listWrap}>
              {report.riskFlags.map((item, index) => (
                <View key={`${item}-${index}`} style={styles.listRow}>
                  <View style={[styles.listDot, { backgroundColor: theme.colors.expense }]} />
                  <Text style={[styles.listText, { color: theme.colors.textMuted }]}>{item}</Text>
                </View>
              ))}
            </View>
          )}
        </Card>

        <Card dark={dark} style={styles.forecastCard}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{t('weeklyReport.nextWeekForecast')}</Text>
          <Text style={[styles.forecastText, { color: theme.colors.textMuted }]}>{report.nextWeekForecastText}</Text>
        </Card>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  header: {
    gap: spacing.xxs,
  },
  title: {
    ...typography.heading,
    fontSize: 26,
  },
  subtitle: {
    ...typography.body,
    fontSize: 14,
  },
  weekRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  arrowButton: {
    alignItems: 'center',
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  arrowText: {
    ...typography.subheading,
    fontSize: 18,
    fontWeight: '700',
  },
  weekLabel: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
    minWidth: 160,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  scoreCard: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  scoreCircle: {
    alignItems: 'center',
    borderRadius: radius.full,
    borderWidth: 10,
    height: 132,
    justifyContent: 'center',
    width: 132,
  },
  scoreValue: {
    ...typography.heading,
    fontSize: 38,
    fontWeight: '800',
    lineHeight: 42,
  },
  scoreCaption: {
    ...typography.caption,
    fontSize: 11,
    letterSpacing: 0.4,
  },
  summaryText: {
    ...typography.body,
    textAlign: 'center',
  },
  sectionCard: {
    gap: spacing.xs,
  },
  sectionTitle: {
    ...typography.subheading,
    fontSize: 18,
    fontWeight: '700',
  },
  listWrap: {
    gap: spacing.xs,
  },
  listRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  listDot: {
    borderRadius: radius.full,
    height: 8,
    width: 8,
  },
  listText: {
    ...typography.body,
    flex: 1,
    fontSize: 14,
  },
  forecastCard: {
    gap: spacing.xs,
  },
  forecastText: {
    ...typography.body,
  },
  loadingWrap: {
    gap: spacing.sm,
  },
  loadingScore: {
    borderRadius: radius.lg,
    height: 220,
    width: '100%',
  },
  loadingBlock: {
    borderRadius: radius.md,
    height: 92,
    width: '100%',
  },
  errorCard: {
    gap: spacing.xs,
  },
  errorTitle: {
    ...typography.subheading,
    fontWeight: '700',
  },
  errorText: {
    ...typography.body,
  },
  emptyText: {
    ...typography.body,
  },
  pressed: {
    opacity: 0.85,
  },
});
