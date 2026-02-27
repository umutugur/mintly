import { ApiClientError, createApiClient } from '@mintly/shared';

import { mobileEnv } from '@core/config/env';
import { trackAppEvent } from '@core/observability/telemetry';
import {
  consumeReservedAdvisorRequestId,
  createAdvisorRequestId,
  logAdvisorReq,
} from '@features/advisor/utils/advisorDiagnostics';

function extractPath(input: string): string {
  return parseUrl(input)?.pathname ?? input;
}

function parseUrl(input: string): URL | null {
  try {
    return new URL(input);
  } catch {
    try {
      return new URL(input, 'http://localhost');
    } catch {
      return null;
    }
  }
}

function toBooleanQuery(value: string | null): boolean | null {
  if (value === null) {
    return null;
  }

  const lowered = value.toLowerCase();
  if (lowered === 'true') {
    return true;
  }
  if (lowered === 'false') {
    return false;
  }
  return null;
}

interface AdvisorInsightsRequestMeta {
  requestId: string;
  url: string;
  month: string | null;
  language: string | null;
  regenerate: boolean | null;
}

function resolveAdvisorInsightsRequestMeta(input: string, method: string, path: string): AdvisorInsightsRequestMeta | null {
  if (method !== 'GET' || path !== '/advisor/insights') {
    return null;
  }

  const parsedUrl = parseUrl(input);
  const month = parsedUrl?.searchParams.get('month') ?? null;
  const language = parsedUrl?.searchParams.get('language') ?? null;
  const regenerate = toBooleanQuery(parsedUrl?.searchParams.get('regenerate') ?? null);
  const reservedRequestId = consumeReservedAdvisorRequestId({ month, language, regenerate });
  const requestId = reservedRequestId ?? createAdvisorRequestId();

  return {
    requestId,
    url: input,
    month,
    language,
    regenerate,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeArrayCount(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function summarizeAdvisorResponse(payload: unknown): {
  mode: string | null;
  modeReason: string | null;
  provider: string | null;
  providerStatus: number | null;
  hasAdvice: boolean;
  hasSummary: boolean;
  adviceSummaryLen: number;
  topFindingsCount: number;
  suggestedActionsCount: number;
} {
  if (!isRecord(payload)) {
    return {
      mode: null,
      modeReason: null,
      provider: null,
      providerStatus: null,
      hasAdvice: false,
      hasSummary: false,
      adviceSummaryLen: 0,
      topFindingsCount: 0,
      suggestedActionsCount: 0,
    };
  }

  const advice = isRecord(payload.advice) ? payload.advice : null;
  const summary = typeof advice?.summary === 'string' ? advice.summary.trim() : '';
  return {
    mode: typeof payload.mode === 'string' ? payload.mode : null,
    modeReason: typeof payload.modeReason === 'string' ? payload.modeReason : null,
    provider: typeof payload.provider === 'string' ? payload.provider : null,
    providerStatus: typeof payload.providerStatus === 'number' ? payload.providerStatus : null,
    hasAdvice: advice !== null,
    hasSummary: summary.length > 0,
    adviceSummaryLen: summary.length,
    topFindingsCount: safeArrayCount(advice?.topFindings),
    suggestedActionsCount: safeArrayCount(advice?.suggestedActions),
  };
}

function summarizeAdvisorDiagnosticsMeta(payload: unknown): {
  diagnosticsCount: number;
  stagesSample: string[];
} | null {
  if (!isRecord(payload)) {
    return null;
  }

  const diagnosticsValue = payload.diagnostics ?? payload.diagnosticEvents;
  if (Array.isArray(diagnosticsValue)) {
    const stagesSample = diagnosticsValue
      .map((item) => (isRecord(item) && typeof item.stage === 'string' ? item.stage : null))
      .filter((stage): stage is string => Boolean(stage))
      .slice(0, 3);
    return {
      diagnosticsCount: diagnosticsValue.length,
      stagesSample,
    };
  }

  if (isRecord(diagnosticsValue)) {
    const nestedEvents = Array.isArray(diagnosticsValue.events) ? diagnosticsValue.events : [];
    const stagesSample = nestedEvents
      .map((item) => (isRecord(item) && typeof item.stage === 'string' ? item.stage : null))
      .filter((stage): stage is string => Boolean(stage))
      .slice(0, 3);
    return {
      diagnosticsCount: nestedEvents.length > 0 ? nestedEvents.length : Object.keys(diagnosticsValue).length,
      stagesSample,
    };
  }

  return null;
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
  const startedAt = Date.now();
  const advisorMeta = resolveAdvisorInsightsRequestMeta(input, method, path);
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

  if (advisorMeta) {
    logAdvisorReq('request_start', {
      requestId: advisorMeta.requestId,
      url: advisorMeta.url,
      month: advisorMeta.month,
      language: advisorMeta.language,
      regenerate: advisorMeta.regenerate,
      timeoutMs: mobileEnv.apiTimeoutMs,
    });
  }

  try {
    const response = await fetch(input, {
      ...init,
      signal: timeoutController.signal,
    });
    const durationMs = Date.now() - startedAt;

    if (advisorMeta) {
      logAdvisorReq('request_end', {
        requestId: advisorMeta.requestId,
        status: response.status,
        durationMs,
      });

      const responseJson = await response.clone().json().catch(() => null);
      const summary = summarizeAdvisorResponse(responseJson);
      logAdvisorReq('response_summary', {
        requestId: advisorMeta.requestId,
        ...summary,
      });

      const diagnosticsMeta = summarizeAdvisorDiagnosticsMeta(responseJson);
      if (diagnosticsMeta) {
        logAdvisorReq('response_diagnostics_meta', {
          requestId: advisorMeta.requestId,
          diagnosticsCount: diagnosticsMeta.diagnosticsCount,
          stagesSample: diagnosticsMeta.stagesSample,
        });
      }
    }

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
    if (advisorMeta) {
      logAdvisorReq('request_error', {
        requestId: advisorMeta.requestId,
        durationMs: Date.now() - startedAt,
        errorName: error instanceof Error ? error.name : 'unknown',
        errorMessage: error instanceof Error ? error.message : 'unknown',
      });
    }

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
