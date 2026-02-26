const DEFAULT_ONYSOFT_HTTP_TIMEOUT_MS = 45_000;
const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_TOP_P = 0.9;
const DEFAULT_MAX_TOKENS = 900;
const MODEL_DISCOVERY_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type OnysoftProviderErrorReason =
  | 'timeout'
  | 'rate_limited'
  | 'model_unavailable'
  | 'http_error'
  | 'request_error'
  | 'response_parse_error'
  | 'response_shape_error';

export interface OnysoftProviderResult {
  provider: 'onysoft';
  status: number;
  ok: boolean;
  text: string;
  errorReason?: OnysoftProviderErrorReason;
  detail?: string;
  bodyPreview?: string;
  retryAfterSec?: number | null;
  responseFormatUsed?: boolean;
}

export interface OnysoftModelDiscoveryResult {
  ok: boolean;
  status: number | null;
  fromCache: boolean;
  models: string[];
  detail?: string;
}

interface GenerateOnysoftTextInput {
  apiKey: string;
  baseUrl: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  timeoutMs?: number;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  includeResponseFormat?: boolean;
  allowRetryWithoutResponseFormat?: boolean;
  maxRateLimitRetries?: number;
  validateJsonText?: ((text: string) => boolean) | undefined;
  deadlineAtMs?: number;
}

interface ListOnysoftModelsInput {
  apiKey: string;
  baseUrl: string;
  timeoutMs?: number;
  deadlineAtMs?: number;
}

interface OnysoftModelCacheEntry {
  expiresAt: number;
  status: number | null;
  models: string[];
}

const onysoftModelsCache = new Map<string, OnysoftModelCacheEntry>();
const unavailableOnysoftModelsCache = new Map<string, number>();

export class OnysoftProviderError extends Error {
  public readonly reason: OnysoftProviderErrorReason;

  public readonly status: number | null;

  public readonly bodyPreview: string | null;

  public readonly retryAfterSec: number | null;

  constructor(params: {
    message: string;
    reason: OnysoftProviderErrorReason;
    status?: number | null;
    bodyPreview?: string | null;
    retryAfterSec?: number | null;
  }) {
    super(params.message);
    this.name = 'OnysoftProviderError';
    this.reason = params.reason;
    this.status = params.status ?? null;
    this.bodyPreview = params.bodyPreview ?? null;
    this.retryAfterSec = params.retryAfterSec ?? null;
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function summarizeBody(value: string, maxLen = 280): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length === 0) {
    return '';
  }

  if (normalized.length <= maxLen) {
    return normalized;
  }

  return `${normalized.slice(0, maxLen)}...`;
}

function modelCacheKey(baseUrl: string): string {
  return normalizeBaseUrl(baseUrl);
}

function unavailableModelCacheKey(baseUrl: string, model: string): string {
  return `${normalizeBaseUrl(baseUrl)}::${model.trim()}`;
}

function cleanupModelCaches(now = Date.now()): void {
  for (const [key, entry] of onysoftModelsCache.entries()) {
    if (entry.expiresAt <= now) {
      onysoftModelsCache.delete(key);
    }
  }

  for (const [key, expiresAt] of unavailableOnysoftModelsCache.entries()) {
    if (expiresAt <= now) {
      unavailableOnysoftModelsCache.delete(key);
    }
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getRateLimitBackoffMs(attempt: number): number {
  const base = 800;
  return base * (2 ** Math.max(0, attempt - 1));
}

function getRemainingMs(deadlineAtMs: number | undefined): number | null {
  if (!deadlineAtMs) {
    return null;
  }

  return deadlineAtMs - Date.now();
}

function parseRetryAfterHeader(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const asNumber = Number(value);
  if (Number.isFinite(asNumber) && asNumber >= 0) {
    return Math.floor(asNumber);
  }

  const asDate = Date.parse(value);
  if (!Number.isNaN(asDate)) {
    return Math.max(0, Math.ceil((asDate - Date.now()) / 1000));
  }

  return null;
}

function extractRetryAfterFromPayload(payload: unknown): number | null {
  if (!isRecord(payload)) {
    return null;
  }

  const candidates = [
    payload.retry_after,
    payload.retryAfter,
    payload.retry_after_seconds,
    payload.retryAfterSeconds,
  ];

  if (isRecord(payload.error)) {
    candidates.push(
      payload.error.retry_after,
      payload.error.retryAfter,
      payload.error.retry_after_seconds,
      payload.error.retryAfterSeconds,
    );
  }

  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0) {
      return Math.floor(candidate);
    }

    if (typeof candidate === 'string') {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed) && parsed >= 0) {
        return Math.floor(parsed);
      }
    }
  }

  return null;
}

function extractRetryAfterSec(response: Response, payload: unknown): number | null {
  return parseRetryAfterHeader(response.headers.get('retry-after')) ?? extractRetryAfterFromPayload(payload);
}

function extractProviderErrorMessage(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null;
  }

  const errorField = payload.error;
  if (isRecord(errorField) && typeof errorField.message === 'string' && errorField.message.trim().length > 0) {
    return errorField.message.trim();
  }

  if (typeof payload.message === 'string' && payload.message.trim().length > 0) {
    return payload.message.trim();
  }

  return null;
}

function unwrapOnysoftBody(payload: unknown): unknown {
  if (!isRecord(payload)) {
    return payload;
  }

  if ('data' in payload) {
    return payload.data;
  }

  return payload;
}

export function isOnysoftNoEndpointsMessage(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }

  return value.toLowerCase().includes('no endpoints found');
}

function isOnysoftRateLimitMessage(value: string): boolean {
  const lower = value.toLowerCase();
  return lower.includes('rate limit') || /api\s*hatas[iı]\s*\(429\)/i.test(value);
}

function isOnysoftRateLimit(status: number, message: string): boolean {
  return status === 429 || isOnysoftRateLimitMessage(message);
}

function shouldRetryWithoutResponseFormat(status: number, payload: unknown, rawBody: string): boolean {
  if (status !== 400 && status !== 422) {
    return false;
  }

  const message = `${extractProviderErrorMessage(payload) ?? ''} ${rawBody}`.toLowerCase();
  if (!message.includes('response_format')) {
    return false;
  }

  return [
    'unknown',
    'unsupported',
    'not allowed',
    'invalid',
    'unrecognized',
    'additional properties',
    'extra_forbidden',
  ].some((keyword) => message.includes(keyword));
}

function extractTextFromContentParts(value: unknown): string | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const segments: string[] = [];
  for (const part of value) {
    if (typeof part === 'string') {
      const trimmed = part.trim();
      if (trimmed.length > 0) {
        segments.push(trimmed);
      }
      continue;
    }

    if (!isRecord(part)) {
      continue;
    }

    if (typeof part.text === 'string' && part.text.trim().length > 0) {
      segments.push(part.text.trim());
      continue;
    }

    if (isRecord(part.text) && typeof part.text.value === 'string' && part.text.value.trim().length > 0) {
      segments.push(part.text.value.trim());
      continue;
    }

    if (typeof part.content === 'string' && part.content.trim().length > 0) {
      segments.push(part.content.trim());
    }
  }

  if (segments.length === 0) {
    return null;
  }

  return segments.join('\n');
}

function extractOnysoftChoices(payload: unknown): unknown[] {
  if (!isRecord(payload)) {
    return [];
  }

  if (Array.isArray(payload.choices)) {
    return payload.choices;
  }

  if (isRecord(payload.data) && Array.isArray(payload.data.choices)) {
    return payload.data.choices;
  }

  return [];
}

function extractOnysoftAssistantText(rawPayload: unknown, bodyPayload: unknown): string {
  const candidatePayloads = [bodyPayload, rawPayload];

  for (const payload of candidatePayloads) {
    if (!isRecord(payload)) {
      continue;
    }

    if (typeof payload.output_text === 'string' && payload.output_text.trim().length > 0) {
      return payload.output_text.trim();
    }

    const choices = extractOnysoftChoices(payload);
    const firstChoice = choices[0];
    if (!isRecord(firstChoice)) {
      continue;
    }

    const message = firstChoice.message;
    if (isRecord(message)) {
      if (typeof message.content === 'string' && message.content.trim().length > 0) {
        return message.content.trim();
      }

      const contentPartsText = extractTextFromContentParts(message.content);
      if (contentPartsText) {
        return contentPartsText;
      }
    }

    const delta = firstChoice.delta;
    if (isRecord(delta)) {
      if (typeof delta.content === 'string' && delta.content.trim().length > 0) {
        return delta.content.trim();
      }

      const deltaPartsText = extractTextFromContentParts(delta.content);
      if (deltaPartsText) {
        return deltaPartsText;
      }
    }

    if (typeof firstChoice.text === 'string' && firstChoice.text.trim().length > 0) {
      return firstChoice.text.trim();
    }
  }

  return '';
}

function extractModelName(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (!isRecord(value)) {
    return null;
  }

  const candidate = [value.id, value.model, value.name].find((item) => typeof item === 'string');
  if (typeof candidate !== 'string') {
    return null;
  }

  const trimmed = candidate.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseOnysoftModels(payload: unknown): string[] {
  const discovered: string[] = [];
  const seen = new Set<string>();
  const addModel = (value: unknown): void => {
    const model = extractModelName(value);
    if (!model || seen.has(model)) {
      return;
    }

    seen.add(model);
    discovered.push(model);
  };

  const scanPayload = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) {
        addModel(item);
      }
      return;
    }

    if (!isRecord(value)) {
      return;
    }

    const containers = [value.data, value.models, value.result];
    for (const container of containers) {
      if (Array.isArray(container)) {
        for (const item of container) {
          addModel(item);
        }
      }
    }
  };

  scanPayload(payload);
  if (isRecord(payload) && 'data' in payload) {
    scanPayload(payload.data);
  }

  return discovered;
}

function classifyProviderFailure(status: number, message: string): OnysoftProviderErrorReason {
  if (isOnysoftRateLimit(status, message)) {
    return 'rate_limited';
  }

  if (isOnysoftNoEndpointsMessage(message)) {
    return 'model_unavailable';
  }

  return 'http_error';
}

export function markOnysoftModelUnavailable(baseUrl: string, model: string): void {
  const normalizedModel = model.trim();
  if (normalizedModel.length === 0) {
    return;
  }

  cleanupModelCaches();
  unavailableOnysoftModelsCache.set(
    unavailableModelCacheKey(baseUrl, normalizedModel),
    Date.now() + MODEL_DISCOVERY_CACHE_TTL_MS,
  );
}

export function isOnysoftModelUnavailable(baseUrl: string, model: string): boolean {
  cleanupModelCaches();
  return unavailableOnysoftModelsCache.has(unavailableModelCacheKey(baseUrl, model));
}

export async function listOnysoftModels(
  input: ListOnysoftModelsInput,
  fetchImpl: FetchLike = (requestUrl, init) => fetch(requestUrl, init),
): Promise<OnysoftModelDiscoveryResult> {
  cleanupModelCaches();

  const key = modelCacheKey(input.baseUrl);
  const cached = onysoftModelsCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return {
      ok: true,
      status: cached.status,
      fromCache: true,
      models: [...cached.models],
    };
  }

  const defaultTimeoutMs = input.timeoutMs ?? DEFAULT_ONYSOFT_HTTP_TIMEOUT_MS;
  const remainingMs = getRemainingMs(input.deadlineAtMs);
  const timeoutMs = remainingMs === null ? defaultTimeoutMs : Math.max(250, Math.min(defaultTimeoutMs, remainingMs));
  const endpoint = `${normalizeBaseUrl(input.baseUrl)}/v1/models`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetchImpl(endpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });

    const status = response.status;
    const rawBody = await response.text();
    const bodyPreview = summarizeBody(rawBody);

    let parsedBody: unknown;
    if (rawBody.trim().length === 0) {
      parsedBody = {};
    } else {
      try {
        parsedBody = JSON.parse(rawBody) as unknown;
      } catch (error) {
        return {
          ok: false,
          status,
          fromCache: false,
          models: [],
          detail: error instanceof Error ? error.message : 'invalid JSON payload',
        };
      }
    }

    const rawRecord = isRecord(parsedBody) ? parsedBody : null;
    const ok = response.ok && rawRecord?.success !== false;
    if (!ok) {
      const providerMessage =
        extractProviderErrorMessage(parsedBody)
        ?? (bodyPreview.length > 0 ? bodyPreview : `Onysoft models endpoint returned status ${status}`);
      return {
        ok: false,
        status,
        fromCache: false,
        models: [],
        detail: providerMessage,
      };
    }

    const body = unwrapOnysoftBody(parsedBody);
    const models = parseOnysoftModels(body);
    if (models.length > 0) {
      onysoftModelsCache.set(key, {
        expiresAt: Date.now() + MODEL_DISCOVERY_CACHE_TTL_MS,
        status,
        models,
      });
    } else {
      onysoftModelsCache.delete(key);
    }

    return {
      ok: true,
      status,
      fromCache: false,
      models,
      detail: models.length === 0 ? 'no models discovered from /v1/models payload' : undefined,
    };
  } catch (error) {
    const isAbortError =
      typeof error === 'object'
      && error !== null
      && 'name' in error
      && (error as { name?: string }).name === 'AbortError';

    return {
      ok: false,
      status: null,
      fromCache: false,
      models: [],
      detail: isAbortError
        ? 'Onysoft model discovery request timed out'
        : error instanceof Error
          ? error.message
          : 'Onysoft model discovery request failed',
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export const discoverOnysoftModels = listOnysoftModels;

export async function generateOnysoftText(
  input: GenerateOnysoftTextInput,
  fetchImpl: FetchLike = (requestUrl, init) => fetch(requestUrl, init),
): Promise<OnysoftProviderResult> {
  const defaultTimeoutMs = input.timeoutMs ?? DEFAULT_ONYSOFT_HTTP_TIMEOUT_MS;
  const temperature = input.temperature ?? DEFAULT_TEMPERATURE;
  const topP = input.topP ?? DEFAULT_TOP_P;
  const maxTokens = input.maxTokens ?? DEFAULT_MAX_TOKENS;
  const maxRateLimitRetries = Math.max(0, input.maxRateLimitRetries ?? 1);
  const allowRetryWithoutResponseFormat = input.allowRetryWithoutResponseFormat ?? true;
  const endpoint = `${normalizeBaseUrl(input.baseUrl)}/v1/chat/completions`;

  let includeResponseFormat = input.includeResponseFormat ?? true;
  let retriedWithoutResponseFormat = false;
  let rateLimitRetryCount = 0;

  while (true) {
    const remainingMs = getRemainingMs(input.deadlineAtMs);
    if (remainingMs !== null && remainingMs <= 0) {
      return {
        provider: 'onysoft',
        status: 0,
        ok: false,
        text: '',
        errorReason: 'timeout',
        detail: 'Onysoft provider deadline exceeded before request',
        responseFormatUsed: includeResponseFormat,
      };
    }

    const timeoutMs = remainingMs === null ? defaultTimeoutMs : Math.max(250, Math.min(defaultTimeoutMs, remainingMs));
    const payload: Record<string, unknown> = {
      model: input.model,
      messages: [
        { role: 'system', content: input.systemPrompt },
        { role: 'user', content: input.userPrompt },
      ],
      temperature,
      top_p: topP,
      max_tokens: maxTokens,
    };

    if (includeResponseFormat) {
      payload.response_format = { type: 'json_object' };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${input.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const status = response.status;
      const rawBody = await response.text();
      const bodyPreview = summarizeBody(rawBody);
      let parsedJson: unknown | undefined;

      if (rawBody.trim().length > 0) {
        try {
          parsedJson = JSON.parse(rawBody) as unknown;
        } catch {
          parsedJson = undefined;
        }
      } else {
        parsedJson = {};
      }

      const rawRecord = isRecord(parsedJson) ? parsedJson : null;
      const body = unwrapOnysoftBody(parsedJson);
      const providerMessage = extractProviderErrorMessage(parsedJson) ?? bodyPreview;
      const retryAfterSec = extractRetryAfterSec(response, parsedJson);
      const ok = response.ok && rawRecord?.success !== false;

      if (!ok) {
        if (
          includeResponseFormat
          && allowRetryWithoutResponseFormat
          && !retriedWithoutResponseFormat
          && shouldRetryWithoutResponseFormat(status, parsedJson, rawBody)
        ) {
          includeResponseFormat = false;
          retriedWithoutResponseFormat = true;
          continue;
        }

        const failureReason = classifyProviderFailure(status, providerMessage);
        if (failureReason === 'rate_limited' && rateLimitRetryCount < maxRateLimitRetries) {
          const backoffMs = getRateLimitBackoffMs(rateLimitRetryCount + 1);
          const remainingForBackoff = getRemainingMs(input.deadlineAtMs);
          if (remainingForBackoff === null || remainingForBackoff > backoffMs + 200) {
            rateLimitRetryCount += 1;
            await sleep(backoffMs);
            continue;
          }
        }

        return {
          provider: 'onysoft',
          status,
          ok: false,
          text: '',
          errorReason: failureReason,
          detail: providerMessage || `Onysoft provider returned status ${status}`,
          bodyPreview,
          retryAfterSec,
          responseFormatUsed: includeResponseFormat,
        };
      }

      if (parsedJson === undefined) {
        return {
          provider: 'onysoft',
          status,
          ok: false,
          text: '',
          errorReason: 'response_parse_error',
          detail: `Onysoft provider returned invalid JSON (status ${status})`,
          bodyPreview,
          retryAfterSec,
          responseFormatUsed: includeResponseFormat,
        };
      }

      const text = extractOnysoftAssistantText(parsedJson, body).trim();
      if (text.length === 0) {
        if (includeResponseFormat && allowRetryWithoutResponseFormat && !retriedWithoutResponseFormat) {
          includeResponseFormat = false;
          retriedWithoutResponseFormat = true;
          continue;
        }

        return {
          provider: 'onysoft',
          status,
          ok: false,
          text: '',
          errorReason: 'response_shape_error',
          detail: 'Onysoft provider returned an empty assistant message',
          bodyPreview,
          retryAfterSec,
          responseFormatUsed: includeResponseFormat,
        };
      }

      if (
        includeResponseFormat
        && allowRetryWithoutResponseFormat
        && !retriedWithoutResponseFormat
        && input.validateJsonText
        && !input.validateJsonText(text)
      ) {
        includeResponseFormat = false;
        retriedWithoutResponseFormat = true;
        continue;
      }

      return {
        provider: 'onysoft',
        status,
        ok: true,
        text,
        retryAfterSec,
        responseFormatUsed: includeResponseFormat,
      };
    } catch (error) {
      const isAbortError =
        typeof error === 'object'
        && error !== null
        && 'name' in error
        && (error as { name?: string }).name === 'AbortError';

      return {
        provider: 'onysoft',
        status: 0,
        ok: false,
        text: '',
        errorReason: isAbortError ? 'timeout' : 'request_error',
        detail: isAbortError
          ? 'Onysoft provider request timed out'
          : error instanceof Error
            ? error.message
            : 'Onysoft provider request failed',
        responseFormatUsed: includeResponseFormat,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
