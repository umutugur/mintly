import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@app/providers/AuthProvider';
import { financeQueryKeys } from '@core/api/queryKeys';
import { useI18n } from '@shared/i18n';
import { getCurrentMonthString } from '@shared/utils/month';

import { consumeDailyFreeAdvisorUsage } from './advisorFreeUsage';
import { startAdvisorInsightGeneration } from './advisorInsightInflight';

const PREFETCH_STORAGE_PREFIX = 'mintly:advisor-prefetch:v1';

function prefetchStorageKey(userId: string, suffix: string): string {
  return `${PREFETCH_STORAGE_PREFIX}:${userId}:${suffix}`;
}

function getApiBaseUrl(): string {
  return process.env.EXPO_PUBLIC_API_BASE_URL?.trim() || 'http://localhost:4000';
}

function getLocalDateKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function useAdvisorInsightPrefetch(): void {
  const queryClient = useQueryClient();
  const { status, user, withAuth } = useAuth();
  const { locale } = useI18n();
  const runningForUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (status !== 'authenticated' || !user?.id) {
      runningForUserRef.current = null;
      return;
    }

    const userId = user.id;
    if (runningForUserRef.current === userId) {
      return;
    }

    let cancelled = false;
    runningForUserRef.current = userId;

    void (async () => {
      const todayKey = getLocalDateKey();
      const dateKey = prefetchStorageKey(userId, 'lastPrefetchDateKey');
      const statusKey = prefetchStorageKey(userId, 'lastPrefetchStatus');
      const timestampKey = prefetchStorageKey(userId, 'lastPrefetchTimestamp');
      const successKey = prefetchStorageKey(userId, 'lastSuccessfulInsightMonthLanguage');

      const previousDateKey = await AsyncStorage.getItem(dateKey);
      if (previousDateKey === todayKey) {
        return;
      }

      const startedAt = new Date().toISOString();
      await AsyncStorage.multiSet([
        [dateKey, todayKey],
        [statusKey, 'started'],
        [timestampKey, startedAt],
      ]);

      const allowFree = await consumeDailyFreeAdvisorUsage({
        userId,
        withAuth,
        apiBaseUrl: getApiBaseUrl(),
      });

      if (!allowFree) {
        await AsyncStorage.multiSet([
          [statusKey, 'skipped_no_free'],
          [timestampKey, new Date().toISOString()],
        ]);
        return;
      }

      const month = getCurrentMonthString();
      const promise = startAdvisorInsightGeneration({
        month,
        language: locale,
        withAuth,
      });

      promise
        .then(async (insight) => {
          if (cancelled) {
            return;
          }

          queryClient.setQueryData(financeQueryKeys.ai.advisorInsights(month, locale), insight);
          await AsyncStorage.multiSet([
            [statusKey, 'success'],
            [timestampKey, new Date().toISOString()],
            [successKey, `${month}|${locale}`],
          ]);
        })
        .catch(async () => {
          if (cancelled) {
            return;
          }

          await AsyncStorage.multiSet([
            [statusKey, 'error'],
            [timestampKey, new Date().toISOString()],
          ]);
        });
    })().finally(() => {
      runningForUserRef.current = null;
    });

    return () => {
      cancelled = true;
    };
  }, [locale, queryClient, status, user?.id, withAuth]);
}
