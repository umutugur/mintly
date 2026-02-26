import { useSyncExternalStore } from 'react';

import type { AdvisorInsight, AiInsightsLanguage } from '@mintly/shared';

import { apiClient } from '@core/api/client';

type WithAuthRunner = <T>(runner: (accessToken: string) => Promise<T>) => Promise<T>;

const inflightByKey = new Map<string, Promise<AdvisorInsight>>();
const listeners = new Set<() => void>();

function makeInflightKey(month: string, language: AiInsightsLanguage): string {
  return `${month}|${language}`;
}

function notifyListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeAdvisorInsightInflight(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isAdvisorInsightInflight(month: string, language: AiInsightsLanguage): boolean {
  return inflightByKey.has(makeInflightKey(month, language));
}

export function startAdvisorInsightGeneration(input: {
  month: string;
  language: AiInsightsLanguage;
  withAuth: WithAuthRunner;
}): Promise<AdvisorInsight> {
  const key = makeInflightKey(input.month, input.language);
  const existing = inflightByKey.get(key);
  if (existing) {
    return existing;
  }

  const requestPromise = input
    .withAuth((token) =>
      apiClient.getAdvisorInsights(
        {
          month: input.month,
          language: input.language,
          regenerate: true,
        },
        token,
      ),
    )
    .finally(() => {
      inflightByKey.delete(key);
      notifyListeners();
    });

  inflightByKey.set(key, requestPromise);
  notifyListeners();
  return requestPromise;
}

export function useAdvisorInsightInflight(month: string, language: AiInsightsLanguage): boolean {
  return useSyncExternalStore(
    subscribeAdvisorInsightInflight,
    () => isAdvisorInsightInflight(month, language),
    () => false,
  );
}
