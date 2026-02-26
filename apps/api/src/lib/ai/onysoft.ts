const DEFAULT_ONYSOFT_HTTP_TIMEOUT_MS = 45_000;
const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_TOP_P = 0.9;
const DEFAULT_MAX_TOKENS = 900;
const DEFAULT_RATE_LIMIT_ATTEMPTS = 3;
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
  text: string;
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
  maxAttempts?: number;
}

interface DiscoverOnysoftModelsInput {
  apiKey: string;
  baseUrl: string;
  timeoutMs?: number;
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

  constructor(params: {
    message: string;
    reason: OnysoftProviderErrorReason;
    status?: number | null;
    bodyPreview?: string | null;
  }) {
    super(params.message);
    this.name = 'OnysoftProviderError';
    this.reason = params.reason;
    this.status = params.status ?? null;
    this.bodyPreview = params.bodyPreview ?? null;
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

    const textField = part.text;
    if (typeof textField === 'string' && textField.trim().length > 0) {
      segments.push(textField.trim());
    }
  }

  if (segments.length === 0) {
    return null;
  }

  return segments.join('\n');
}

function extractOnysoftAssistantText(payload: unknown): string {
  if (!isRecord(payload)) {
    throw new Error('Onysoft response payload is not an object');
  }

  if (typeof payload.output_text === 'string' && payload.output_text.trim().length > 0) {
    return payload.output_text.trim();
  }

  const choices = payload.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error('Onysoft response has no choices');
  }

  const firstChoice = choices[0];
  if (!isRecord(firstChoice)) {
    throw new Error('Onysoft choice is not an object');
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

  if (typeof firstChoice.text === 'string' && firstChoice.text.trim().length > 0) {
    return firstChoice.text.trim();
  }

  throw new Error('Onysoft response has no assistant text');
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

  if (Array.isArray(payload)) {
    for (const item of payload) {
      addModel(item);
    }
    return discovered;
  }

  if (!isRecord(payload)) {
    return discovered;
  }

  const data = payload.data;
  if (Array.isArray(data)) {
    for (const item of data) {
      addModel(item);
    }
  }

  const models = payload.models;
  if (Array.isArray(models)) {
    for (const item of models) {
      addModel(item);
    }
  }

  return discovered;
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

export async function discoverOnysoftModels(
  input: DiscoverOnysoftModelsInput,
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

  const timeoutMs = input.timeoutMs ?? DEFAULT_ONYSOFT_HTTP_TIMEOUT_MS;
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

    clearTimeout(timeoutId);

    const status = response.status;
    const rawBody = await response.text();
    if (!response.ok) {
      return {
        ok: false,
        status,
        fromCache: false,
        models: [],
        detail: summarizeBody(rawBody),
      };
    }

    let parsedBody: unknown;
    try {
      parsedBody = rawBody.trim().length > 0 ? (JSON.parse(rawBody) as unknown) : {};
    } catch (error) {
      return {
        ok: false,
        status,
        fromCache: false,
        models: [],
        detail: error instanceof Error ? error.message : 'invalid JSON payload',
      };
    }

    const models = parseOnysoftModels(parsedBody);
    onysoftModelsCache.set(key, {
      expiresAt: Date.now() + MODEL_DISCOVERY_CACHE_TTL_MS,
      status,
      models,
    });

    return {
      ok: true,
      status,
      fromCache: false,
      models,
    };
  } catch (error) {
    clearTimeout(timeoutId);

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

export async function generateOnysoftText(
  input: GenerateOnysoftTextInput,
  fetchImpl: FetchLike = (requestUrl, init) => fetch(requestUrl, init),
): Promise<OnysoftProviderResult> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_ONYSOFT_HTTP_TIMEOUT_MS;
  const temperature = input.temperature ?? DEFAULT_TEMPERATURE;
  const topP = input.topP ?? DEFAULT_TOP_P;
  const maxTokens = input.maxTokens ?? DEFAULT_MAX_TOKENS;
  const maxAttempts = Math.max(1, input.maxAttempts ?? DEFAULT_RATE_LIMIT_ATTEMPTS);
  const endpoint = `${normalizeBaseUrl(input.baseUrl)}/v1/chat/completions`;

  let includeResponseFormat = true;
  let attempt = 1;

  while (attempt <= maxAttempts) {
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

      clearTimeout(timeoutId);

      const status = response.status;
      const rawBody = await response.text();
      const bodyPreview = summarizeBody(rawBody);

      let parsedBody: unknown | undefined;
      if (rawBody.trim().length > 0) {
        try {
          parsedBody = JSON.parse(rawBody) as unknown;
        } catch {
          parsedBody = undefined;
        }
      }

      if (!response.ok) {
        if (includeResponseFormat && shouldRetryWithoutResponseFormat(status, parsedBody, rawBody)) {
          includeResponseFormat = false;
          continue;
        }

        const providerMessage = extractProviderErrorMessage(parsedBody)
          ?? `Onysoft provider returned status ${status}`;
        const fullMessage = `${providerMessage} ${rawBody}`;

        if (isOnysoftRateLimit(status, fullMessage)) {
          if (attempt < maxAttempts) {
            const backoffMs = getRateLimitBackoffMs(attempt);
            attempt += 1;
            await sleep(backoffMs);
            continue;
          }

          throw new OnysoftProviderError({
            message: providerMessage,
            reason: 'rate_limited',
            status,
            bodyPreview,
          });
        }

        throw new OnysoftProviderError({
          message: providerMessage,
          reason: isOnysoftNoEndpointsMessage(fullMessage) ? 'model_unavailable' : 'http_error',
          status,
          bodyPreview,
        });
      }

      if (parsedBody === undefined) {
        throw new OnysoftProviderError({
          message: `Onysoft provider returned invalid JSON (status ${status})`,
          reason: 'response_parse_error',
          status,
          bodyPreview,
        });
      }

      let text: string;
      try {
        text = extractOnysoftAssistantText(parsedBody);
      } catch (error) {
        throw new OnysoftProviderError({
          message: error instanceof Error ? error.message : 'Onysoft response missing assistant text',
          reason: 'response_shape_error',
          status,
          bodyPreview,
        });
      }

      return {
        provider: 'onysoft',
        status,
        text,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof OnysoftProviderError) {
        throw error;
      }

      const isAbortError =
        typeof error === 'object'
        && error !== null
        && 'name' in error
        && (error as { name?: string }).name === 'AbortError';

      if (isAbortError) {
        throw new OnysoftProviderError({
          message: 'Onysoft provider request timed out',
          reason: 'timeout',
        });
      }

      throw new OnysoftProviderError({
        message: error instanceof Error ? error.message : 'Onysoft provider request failed',
        reason: 'request_error',
      });
    }
  }

  throw new OnysoftProviderError({
    message: 'Onysoft provider request failed',
    reason: 'request_error',
  });
}
