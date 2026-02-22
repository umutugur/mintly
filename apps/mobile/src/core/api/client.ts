import { ApiClientError, createApiClient } from '@mintly/shared';

import { mobileEnv } from '@core/config/env';
import { trackAppEvent } from '@core/observability/telemetry';

function extractPath(input: string): string {
  try {
    return new URL(input).pathname;
  } catch {
    return input;
  }
}

function mapApiEvent(method: string, path: string): string | null {
  if (method === 'POST' && path === '/transactions') {
    return 'transactions.create';
  }

  if (method === 'PATCH' && /^\/transactions\/[^/]+$/.test(path)) {
    return 'transactions.update';
  }

  if (method === 'DELETE' && /^\/transactions\/[^/]+$/.test(path)) {
    return 'transactions.delete';
  }

  if (method === 'DELETE' && /^\/transfers\/[^/]+$/.test(path)) {
    return 'transactions.delete';
  }

  if (method === 'POST' && /^\/groups\/[^/]+\/expenses$/.test(path)) {
    return 'groups.expense.create';
  }

  return null;
}

function isAnalyticsPath(path: string): boolean {
  return path.startsWith('/analytics');
}

async function fetchWithTimeout(input: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  const path = extractPath(input);
  const timeoutController = new AbortController();
  const externalSignal = init.signal;
  const onExternalAbort = () => {
    timeoutController.abort();
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      timeoutController.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  const timeout = setTimeout(() => {
    timeoutController.abort();
  }, mobileEnv.apiTimeoutMs);

  try {
    const response = await fetch(input, {
      ...init,
      signal: timeoutController.signal,
    });

    const trackedEvent = mapApiEvent(method, path);
    if (trackedEvent && response.ok) {
      trackAppEvent(trackedEvent, {
        category: 'api',
        data: { method, path, status: response.status },
      });
    }

    if (isAnalyticsPath(path) && !response.ok) {
      trackAppEvent('analytics.load.failure', {
        category: 'api',
        level: 'warning',
        data: { method, path, status: response.status },
      });
    }

    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiClientError({
        code: 'REQUEST_TIMEOUT',
        message: 'REQUEST_TIMEOUT',
        status: 0,
      });
    }

    if (isAnalyticsPath(path)) {
      trackAppEvent('analytics.load.failure', {
        category: 'api',
        level: 'error',
        data: { method, path, error: error instanceof Error ? error.message : 'unknown' },
      });
    }

    throw new ApiClientError({
      code: 'SERVER_UNREACHABLE',
      message: 'SERVER_UNREACHABLE',
      status: 0,
    });
  } finally {
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
    clearTimeout(timeout);
  }
}

export const apiClient = createApiClient({
  baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
  fetchImpl: fetchWithTimeout,
});
