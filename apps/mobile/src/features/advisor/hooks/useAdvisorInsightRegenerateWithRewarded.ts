import { useCallback, useMemo, useState } from 'react';

import type { AdvisorInsight } from '@mintly/shared';
import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@app/providers/AuthProvider';
import { showRewardedInsightAd } from '@core/ads/RewardedManager';
import { financeQueryKeys } from '@core/api/queryKeys';
import { useI18n } from '@shared/i18n';
import {
  createAdvisorRequestId,
  logAdvisorReq,
  reserveAdvisorRequestId,
} from '@features/advisor/utils/advisorDiagnostics';

import { consumeDailyFreeAdvisorUsage } from './advisorFreeUsage';
import { startAdvisorInsightGeneration, useAdvisorInsightInflight } from './advisorInsightInflight';

function getApiBaseUrl(): string {
  return process.env.EXPO_PUBLIC_API_BASE_URL?.trim() || 'http://localhost:4000';
}

interface UseAdvisorInsightRegenerateWithRewardedResult {
  regenerate: () => void;
  isPending: boolean;
  isRewardGatePending: boolean;
  isInsightInFlight: boolean;
  error: unknown;
  clearError: () => void;
}

export function useAdvisorInsightRegenerateWithRewarded(
  month: string,
): UseAdvisorInsightRegenerateWithRewardedResult {
  const queryClient = useQueryClient();
  const { withAuth, user } = useAuth();
  const { locale } = useI18n();
  const isInsightInFlight = useAdvisorInsightInflight(month, locale);
  const [isRewardGatePending, setIsRewardGatePending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const applyInsightResult = useCallback((insight: AdvisorInsight) => {
    queryClient.setQueryData(financeQueryKeys.ai.advisorInsights(month, locale), insight);
  }, [locale, month, queryClient]);

  const startGenerationAndApply = useCallback((requestId?: string): Promise<AdvisorInsight> => {
    const resolvedRequestId = requestId ?? createAdvisorRequestId();
    reserveAdvisorRequestId({
      requestId: resolvedRequestId,
      month,
      language: locale,
      regenerate: true,
    });
    logAdvisorReq('regenerate_request_fired', {
      requestId: resolvedRequestId,
      month,
      language: locale,
      regenerate: true,
    });

    const promise = startAdvisorInsightGeneration({
      month,
      language: locale,
      withAuth,
    });

    promise
      .then((insight) => {
        applyInsightResult(insight);
        setError(null);
      })
      .catch((generationError) => {
        setError(generationError);
      });

    return promise;
  }, [applyInsightResult, locale, month, withAuth]);

  const regenerate = useCallback(() => {
    if (isRewardGatePending || isInsightInFlight) {
      return;
    }

    setError(null);

    void (async () => {
      const allowFree = await consumeDailyFreeAdvisorUsage({
        userId: user?.id ?? null,
        withAuth,
        apiBaseUrl: getApiBaseUrl(),
      });

      if (allowFree) {
        void startGenerationAndApply();
        return;
      }

      let generationPromise: Promise<AdvisorInsight> | null = null;
      let generationStarted = false;
      const adRegenerateRequestId = createAdvisorRequestId();
      const startGenerationInBackground = () => {
        if (generationStarted) {
          return;
        }

        generationStarted = true;
        generationPromise = startGenerationAndApply(adRegenerateRequestId);
      };

      setIsRewardGatePending(true);
      const rewarded = await showRewardedInsightAd({
        onAdStarted: () => {
          logAdvisorReq('rewarded_open', { month, language: locale });
          startGenerationInBackground();
        },
      }).catch(() => false);
      setIsRewardGatePending(false);

      if (!rewarded) {
        return;
      }

      logAdvisorReq('rewarded_earned', { month, language: locale });
      startGenerationInBackground();
      if (!generationPromise) {
        return;
      }

      try {
        const insight = await generationPromise;
        applyInsightResult(insight);
        setError(null);
      } catch (generationError) {
        setError(generationError);
      }
    })();
  }, [
    applyInsightResult,
    isInsightInFlight,
    isRewardGatePending,
    locale,
    month,
    startGenerationAndApply,
    user?.id,
    withAuth,
  ]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const isPending = useMemo(
    () => isRewardGatePending || isInsightInFlight,
    [isInsightInFlight, isRewardGatePending],
  );

  return {
    regenerate,
    isPending,
    isRewardGatePending,
    isInsightInFlight,
    error,
    clearError,
  };
}
