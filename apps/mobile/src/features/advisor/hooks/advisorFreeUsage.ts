import {
  getAdvisorUsageDayKey,
  hasUsedDailyAdvisorFreeUsage,
  markDailyAdvisorFreeUsage,
} from '@core/ads/RewardedManager';

interface AdvisorFreeUsageCheckResponse {
  allowFree: boolean;
  dayKey: string;
}

type WithAuthRunner = <T>(runner: (accessToken: string) => Promise<T>) => Promise<T>;

function normalizeBaseUrl(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

async function consumeAdvisorFreeUsageOnBackend(input: {
  apiBaseUrl: string;
  accessToken: string;
}): Promise<AdvisorFreeUsageCheckResponse | null> {
  try {
    const response = await fetch(`${normalizeBaseUrl(input.apiBaseUrl)}/advisor/insights/free-check`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${input.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || typeof payload !== 'object') {
      return null;
    }

    const allowFree = (payload as { allowFree?: unknown }).allowFree === true;
    const dayKeyCandidate = (payload as { dayKey?: unknown }).dayKey;
    const dayKey =
      typeof dayKeyCandidate === 'string' && dayKeyCandidate.length > 0
        ? dayKeyCandidate
        : getAdvisorUsageDayKey();

    return {
      allowFree,
      dayKey,
    };
  } catch {
    return null;
  }
}

export async function consumeDailyFreeAdvisorUsage(input: {
  userId: string | null;
  withAuth: WithAuthRunner;
  apiBaseUrl: string;
}): Promise<boolean> {
  const userId = input.userId;
  if (!userId) {
    return true;
  }

  const localDayKey = getAdvisorUsageDayKey();
  const hasUsedLocalFreeAccess = await hasUsedDailyAdvisorFreeUsage(userId, localDayKey);
  if (hasUsedLocalFreeAccess) {
    return false;
  }

  let backendValidation: AdvisorFreeUsageCheckResponse | null = null;
  try {
    backendValidation = await input.withAuth((token) =>
      consumeAdvisorFreeUsageOnBackend({
        apiBaseUrl: input.apiBaseUrl,
        accessToken: token,
      }),
    );
  } catch {
    backendValidation = null;
  }

  if (!backendValidation) {
    await markDailyAdvisorFreeUsage(userId, localDayKey);
    return true;
  }

  await markDailyAdvisorFreeUsage(userId, backendValidation.dayKey);
  return backendValidation.allowFree;
}
