const DEFAULT_CLOUDFLARE_HTTP_TIMEOUT_MS = 45_000;
const DEFAULT_CLOUDFLARE_MAX_ATTEMPTS = 2;
const DEFAULT_MAX_TOKENS = 450;
const DEFAULT_TEMPERATURE = 0.3;

export type CloudflareProviderErrorReason =
  | 'rate_limited'
  | 'request_invalid'
  | 'http_error'
  | 'timeout'
  | 'response_parse_error'
  | 'response_shape_error'
  | 'request_error';

export interface CloudflareDiagnosticEvent {
  stage:
    | 'provider_attempt'
    | 'provider_request'
    | 'provider_response'
    | 'provider_response_body'
    | 'provider_request_invalid'
    | 'provider_error'
    | 'provider_health';
  provider: 'cloudflare';
  model?: string;
  attempt?: number;
  durationMs?: number;
  status?: number;
  ok?: boolean;
  cfRay?: string | null;
  responseShape?: string;
  reason?: CloudflareProviderErrorReason;
  errorCode?: string;
  payloadKeys?: string[];
  responseTopLevelKeys?: string[];
  responseResultKeys?: string[];
  responseNestedResultKeys?: string[];
  responseBodyPreview?: string;
  detail?: string;
  retryAfterSec?: number | null;
}

export interface CloudflareProviderResult {
  provider: 'cloudflare';
  model: string;
  status: number;
  cfRay: string | null;
  text: string;
}

export interface CloudflareModelSearchResult {
  models: string[];
  latencyMs: number;
  status: number;
}

interface CloudflareRunResponsePayload {
  success?: boolean;
  errors?: Array<{
    code?: number | string;
    message?: string;
  }>;
  result?: unknown;
}

interface CloudflareChatMessage {
  role: 'system' | 'user';
  content: string;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

interface GenerateCloudflareTextInput {
  apiToken: string;
  accountId: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  timeoutMs?: number;
  maxAttempts?: number;
  maxTokens?: number;
  temperature?: number;
  onDiagnostic?: (event: CloudflareDiagnosticEvent) => void;
}

interface SearchCloudflareModelsInput {
  apiToken: string;
  accountId: string;
  timeoutMs?: number;
  onDiagnostic?: (event: CloudflareDiagnosticEvent) => void;
}

export function buildCloudflareRunEndpoint(accountId: string, model: string): string {
  return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${encodeURI(model)}`;
}

export function buildCloudflareModelsSearchEndpoint(accountId: string): string {
  return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/models/search`;
}

function getRateLimitBackoffMs(): number {
  const min = 800;
  const max = 1500;
  return min + Math.floor(Math.random() * (max - min + 1));
}

function getPayloadKeys(payload: Record<string, unknown>): string[] {
  return Object.keys(payload);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getObjectKeys(value: unknown): string[] {
  if (!isRecord(value)) {
    return [];
  }

  return Object.keys(value);
}

function getNestedResultKeys(payload: unknown): {
  responseTopLevelKeys: string[];
  responseResultKeys: string[];
  responseNestedResultKeys: string[];
} {
  if (!isRecord(payload)) {
    return {
      responseTopLevelKeys: [],
      responseResultKeys: [],
      responseNestedResultKeys: [],
    };
  }

  const responseTopLevelKeys = getObjectKeys(payload);
  const result = (payload as Record<string, unknown>).result;
  const responseResultKeys = getObjectKeys(result);

  let responseNestedResultKeys: string[] = [];
  if (isRecord(result) && isRecord((result as Record<string, unknown>).result)) {
    responseNestedResultKeys = getObjectKeys((result as Record<string, unknown>).result);
  }

  return {
    responseTopLevelKeys,
    responseResultKeys,
    responseNestedResultKeys,
  };
}

function extractFromAnyResult(result: unknown): string | null {
  // Cloudflare sometimes returns `result` as an array or direct string.
  if (isRecord(result)) {
    return extractFromResultRecord(result as Record<string, unknown>, 0);
  }

  if (Array.isArray(result)) {
    // Try each item (prefer last) and join if multiple segments.
    const segments: string[] = [];
    for (let idx = result.length - 1; idx >= 0; idx -= 1) {
      const item = result[idx];
      const itemText = isRecord(item)
        ? extractFromResultRecord(item as Record<string, unknown>, 0)
        : normalizeTextContent(item);
      if (itemText) {
        segments.unshift(itemText);
      }
    }

    if (segments.length > 0) {
      return segments.join('\n');
    }

    return normalizeTextContent(result);
  }

  return normalizeTextContent(result);
}

function summarizeDetail(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  if (trimmed.length <= 180) {
    return trimmed;
  }

  return `${trimmed.slice(0, 180)}...`;
}

function parseRetryAfterSeconds(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsedInt = Number.parseInt(value, 10);
  if (Number.isFinite(parsedInt) && parsedInt >= 0) {
    return parsedInt;
  }

  const parsedDate = Date.parse(value);
  if (!Number.isNaN(parsedDate)) {
    const diffMs = parsedDate - Date.now();
    if (diffMs <= 0) {
      return 0;
    }
    return Math.ceil(diffMs / 1000);
  }

  return null;
}

function describeCloudflareResponseShape(payload: unknown): string {
  if (payload === null || payload === undefined) {
    return 'empty';
  }

  if (Array.isArray(payload)) {
    return 'array';
  }

  if (typeof payload === 'object') {
    const data = payload as CloudflareRunResponsePayload;
    if (typeof data.success === 'boolean' || Array.isArray(data.errors) || 'result' in data) {
      return 'cloudflare_run_response';
    }
    return 'object';
  }

  return typeof payload;
}

function parseCloudflareError(payload: unknown): { code: string | null; message: string | null } {
  if (!payload || typeof payload !== 'object') {
    return {
      code: null,
      message: null,
    };
  }

  const data = payload as CloudflareRunResponsePayload;
  const firstError = Array.isArray(data.errors) ? data.errors[0] : undefined;
  if (!firstError || typeof firstError !== 'object') {
    return {
      code: null,
      message: null,
    };
  }

  return {
    code:
      firstError.code === undefined || firstError.code === null
        ? null
        : String(firstError.code),
    message: typeof firstError.message === 'string' ? firstError.message : null,
  };
}

function normalizeTextContent(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (isRecord(value)) {
    const directTextFields = [
      value.text,
      value.content,
      value.value,
      value.output_text,
      value.generated_text,
      value.completion,
    ];

    for (const field of directTextFields) {
      if (typeof field !== 'string') {
        continue;
      }

      const trimmed = field.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }

    const nestedCollections = [
      value.parts,
      value.content,
      value.output,
      value.messages,
      value.choices,
      value.response,
      value.message,
      value.delta,
      value.data,
    ];

    for (const nested of nestedCollections) {
      const nestedText = normalizeTextContent(nested);
      if (nestedText) {
        return nestedText;
      }
    }
  }

  if (Array.isArray(value)) {
    const segments = value
      .map((item) => {
        if (typeof item === 'string') {
          return item.trim();
        }
        return normalizeTextContent(item) ?? '';
      })
      .filter((item) => item.length > 0);
    if (segments.length > 0) {
      return segments.join('\n');
    }
  }

  return null;
}

function extractFromMessages(resultRecord: Record<string, unknown>): string | null {
  const messages = Array.isArray(resultRecord.messages)
    ? (resultRecord.messages as Array<{ role?: string; content?: unknown; text?: unknown; message?: unknown }>)
    : [];

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const role = typeof message?.role === 'string' ? message.role.toLowerCase() : '';
    if (role !== 'assistant' && role !== 'model') {
      continue;
    }

    const assistantContent = normalizeTextContent(
      message.content ?? message.text ?? message.message,
    );
    if (assistantContent) {
      return assistantContent;
    }
  }

  return null;
}

function extractFromChoices(resultRecord: Record<string, unknown>): string | null {
  const choices = Array.isArray(resultRecord.choices)
    ? (resultRecord.choices as Array<Record<string, unknown>>)
    : [];

  for (let index = choices.length - 1; index >= 0; index -= 1) {
    const choice = choices[index];
    if (!choice || typeof choice !== 'object') {
      continue;
    }

    const messageContent = isRecord(choice.message)
      ? normalizeTextContent((choice.message as Record<string, unknown>).content)
        ?? normalizeTextContent((choice.message as Record<string, unknown>).text)
      : null;

    if (messageContent) {
      return messageContent;
    }

    const deltaContent = isRecord(choice.delta)
      ? normalizeTextContent((choice.delta as Record<string, unknown>).content)
        ?? normalizeTextContent((choice.delta as Record<string, unknown>).text)
      : null;

    if (deltaContent) {
      return deltaContent;
    }

    const directContent = normalizeTextContent(choice.content) ?? normalizeTextContent(choice.text);
    if (directContent) {
      return directContent;
    }
  }

  return null;
}

function extractFromOutput(resultRecord: Record<string, unknown>): string | null {
  if (!Array.isArray(resultRecord.output) || resultRecord.output.length === 0) {
    return null;
  }

  for (let index = resultRecord.output.length - 1; index >= 0; index -= 1) {
    const entry = resultRecord.output[index];
    const direct = normalizeTextContent(entry);
    if (direct) {
      return direct;
    }

    if (!isRecord(entry)) {
      continue;
    }

    const entryRole = typeof entry.role === 'string' ? entry.role.toLowerCase() : '';
    if (entryRole === 'assistant' || entryRole === 'model' || !entryRole) {
      const fromContent =
        normalizeTextContent(entry.content)
        ?? normalizeTextContent(entry.text)
        ?? normalizeTextContent(entry.message);
      if (fromContent) {
        return fromContent;
      }
    }
  }

  return null;
}

function extractFromResponseObject(resultRecord: Record<string, unknown>): string | null {
  if (!isRecord(resultRecord.response)) {
    return null;
  }

  const direct = normalizeTextContent(resultRecord.response);
  if (direct) {
    return direct;
  }

  return normalizeTextContent(resultRecord.response.text)
    ?? normalizeTextContent(resultRecord.response.output_text);
}

function extractFromResultRecord(resultRecord: Record<string, unknown>, depth: 0 | 1): string | null {
  const responseValue = resultRecord.response;

  if (!isRecord(responseValue)) {
    const directResponse = normalizeTextContent(responseValue);
    if (directResponse) {
      return directResponse;
    }
  }

  const outputText = normalizeTextContent(resultRecord.output_text);
  if (outputText) {
    return outputText;
  }

  if (depth === 0 && isRecord(resultRecord.result)) {
    const nestedText = extractFromResultRecord(resultRecord.result, 1);
    if (nestedText) {
      return nestedText;
    }
  }

  const generatedText = normalizeTextContent(resultRecord.generated_text);
  if (generatedText) {
    return generatedText;
  }

  const textField = normalizeTextContent(resultRecord.text);
  if (textField) {
    return textField;
  }

  const completionText = normalizeTextContent(resultRecord.completion);
  if (completionText) {
    return completionText;
  }

  const output = extractFromOutput(resultRecord);
  if (output) {
    return output;
  }

  const fromMessages = extractFromMessages(resultRecord);
  if (fromMessages) {
    return fromMessages;
  }

  const fromChoices = extractFromChoices(resultRecord);
  if (fromChoices) {
    return fromChoices;
  }

  const responseObjectText = extractFromResponseObject(resultRecord);
  if (responseObjectText) {
    return responseObjectText;
  }

  return null;
}

function extractModelName(candidate: unknown): string | null {
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const record = candidate as Record<string, unknown>;
  const direct =
    (typeof record.id === 'string' && record.id) ||
    (typeof record.name === 'string' && record.name) ||
    (typeof record.model === 'string' && record.model) ||
    (typeof record.slug === 'string' && record.slug);

  if (direct) {
    return direct.trim();
  }

  return null;
}

function collectModelNames(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const root = payload as Record<string, unknown>;
  const result = root.result;
  const source = Array.isArray(result) ? result : Array.isArray(root.models) ? root.models : [];

  const names = new Set<string>();
  for (const item of source) {
    const modelName = extractModelName(item);
    if (modelName) {
      names.add(modelName);
    }
  }

  return Array.from(names.values());
}

export function extractCloudflareAssistantText(payload: unknown): string {
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (!trimmed) {
      throw new Error('Cloudflare AI response payload is empty');
    }

    try {
      return extractCloudflareAssistantText(JSON.parse(trimmed) as unknown);
    } catch {
      const direct = normalizeTextContent(trimmed);
      if (direct) {
        return direct;
      }
    }
  }

  if (Array.isArray(payload)) {
    const extractedFromArray = extractFromAnyResult(payload);
    if (extractedFromArray) {
      return extractedFromArray;
    }
    throw new Error('Cloudflare AI response payload is empty');
  }

  if (!isRecord(payload)) {
    throw new Error('Cloudflare AI response payload is empty');
  }

  const data = payload as CloudflareRunResponsePayload;

  // Cloudflare Workers AI usually nests text in `result`, but `result` can be a record,
  // array, or direct string depending on the model / endpoint behavior.
  const result = data.result;
  if (result !== null && result !== undefined) {
    const extractedText = extractFromAnyResult(result);
    if (extractedText) {
      return extractedText;
    }
  }

  const extractedFromRoot = extractFromAnyResult(payload);
  if (extractedFromRoot) {
    return extractedFromRoot;
  }

  if (result === null || result === undefined) {
    throw new Error('Cloudflare AI response payload does not include result');
  }

  throw new Error('Cloudflare AI response did not contain assistant text');
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class CloudflareProviderError extends Error {
  public readonly reason: CloudflareProviderErrorReason;
  public readonly status: number | null;
  public readonly retryAfterSec: number | null;
  public readonly cfRay: string | null;
  public readonly providerCode: string | null;

  constructor(params: {
    message: string;
    reason: CloudflareProviderErrorReason;
    status?: number | null;
    retryAfterSec?: number | null;
    cfRay?: string | null;
    providerCode?: string | null;
  }) {
    super(params.message);
    this.name = 'CloudflareProviderError';
    this.reason = params.reason;
    this.status = params.status ?? null;
    this.retryAfterSec = params.retryAfterSec ?? null;
    this.cfRay = params.cfRay ?? null;
    this.providerCode = params.providerCode ?? null;
  }
}

export async function searchCloudflareModels(
  input: SearchCloudflareModelsInput,
  fetchImpl: FetchLike = (requestUrl, init) => fetch(requestUrl, init),
): Promise<CloudflareModelSearchResult> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_CLOUDFLARE_HTTP_TIMEOUT_MS;
  const endpoint = buildCloudflareModelsSearchEndpoint(input.accountId);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetchImpl(endpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${input.apiToken}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });

    const latencyMs = Date.now() - startedAt;
    const status = response.status;
    const cfRay = response.headers.get('cf-ray');
    const rawBody = await response.text();

    let payload: unknown = {};
    if (rawBody.length > 0) {
      try {
        payload = JSON.parse(rawBody) as unknown;
      } catch {
        payload = rawBody;
      }
    }

    input.onDiagnostic?.({
      stage: 'provider_health',
      provider: 'cloudflare',
      durationMs: latencyMs,
      status,
      ok: response.ok,
      cfRay,
      responseShape: describeCloudflareResponseShape(payload),
      detail: !response.ok ? summarizeDetail(typeof payload === 'string' ? payload : rawBody) : undefined,
    });

    if (!response.ok) {
      const parsedError = parseCloudflareError(payload);
      throw new CloudflareProviderError({
        message: parsedError.message ?? `Cloudflare model search failed with status ${status}`,
        reason:
          status === 429
            ? 'rate_limited'
            : status >= 400 && status < 500
              ? 'request_invalid'
              : 'http_error',
        status,
        retryAfterSec: parseRetryAfterSeconds(response.headers.get('retry-after')),
        cfRay,
        providerCode: parsedError.code,
      });
    }

    return {
      models: collectModelNames(payload),
      latencyMs,
      status,
    };
  } catch (error) {
    if (error instanceof CloudflareProviderError) {
      throw error;
    }

    const isAbortError =
      typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      (error as { name?: string }).name === 'AbortError';
    if (isAbortError) {
      throw new CloudflareProviderError({
        message: 'Cloudflare model search request timed out',
        reason: 'timeout',
      });
    }

    throw new CloudflareProviderError({
      message: error instanceof Error ? error.message : 'Cloudflare model search failed',
      reason: 'request_error',
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function verifyCloudflareModelExists(
  input: SearchCloudflareModelsInput & {
    configuredModel: string;
  },
  fetchImpl: FetchLike = (requestUrl, init) => fetch(requestUrl, init),
): Promise<{ modelExists: boolean; modelsCount: number; latencyMs: number; status: number }> {
  const result = await searchCloudflareModels(input, fetchImpl);
  const modelExists = result.models.includes(input.configuredModel);

  return {
    modelExists,
    modelsCount: result.models.length,
    latencyMs: result.latencyMs,
    status: result.status,
  };
}

export async function generateCloudflareText(
  input: GenerateCloudflareTextInput,
  fetchImpl: FetchLike = (requestUrl, init) => fetch(requestUrl, init),
): Promise<CloudflareProviderResult> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_CLOUDFLARE_HTTP_TIMEOUT_MS;
  const maxAttempts = input.maxAttempts ?? DEFAULT_CLOUDFLARE_MAX_ATTEMPTS;
  const maxTokens = input.maxTokens ?? DEFAULT_MAX_TOKENS;
  const temperature = input.temperature ?? DEFAULT_TEMPERATURE;

  const endpoint = buildCloudflareRunEndpoint(input.accountId, input.model);
  const messages: CloudflareChatMessage[] = [
    { role: 'system', content: input.systemPrompt },
    { role: 'user', content: input.userPrompt },
  ];
  const requestPayload: Record<string, unknown> = {
  messages,
  max_tokens: maxTokens,
  temperature,
  // Workers AI: JSON çıktıyı zorla (invalid JSON riskini ciddi düşürür)
  response_format: { type: 'json_object' },
};
  const payloadKeys = getPayloadKeys(requestPayload);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    input.onDiagnostic?.({
      stage: 'provider_attempt',
      provider: 'cloudflare',
      model: input.model,
      attempt,
    });

    input.onDiagnostic?.({
      stage: 'provider_request',
      provider: 'cloudflare',
      model: input.model,
      attempt,
      payloadKeys,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
    const startedAt = Date.now();

    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${input.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const status = response.status;
      const cfRay = response.headers.get('cf-ray');
      const durationMs = Date.now() - startedAt;

      input.onDiagnostic?.({
        stage: 'provider_response',
        provider: 'cloudflare',
        model: input.model,
        attempt,
        durationMs,
        status,
        ok: response.ok,
        cfRay,
      });

      let payload: unknown;
      let rawBody = '';
      try {
        rawBody = await response.text();
        payload = rawBody.length > 0 ? (JSON.parse(rawBody) as unknown) : {};
      } catch (error) {
        input.onDiagnostic?.({
          stage: 'provider_error',
          provider: 'cloudflare',
          model: input.model,
          attempt,
          durationMs,
          status,
          cfRay,
          reason: 'response_parse_error',
          detail: summarizeDetail(error instanceof Error ? error.message : 'unknown'),
        });
        throw new CloudflareProviderError({
          message: 'Cloudflare provider returned invalid JSON',
          reason: 'response_parse_error',
          status,
          cfRay,
        });
      }

      input.onDiagnostic?.({
        stage: 'provider_response_body',
        provider: 'cloudflare',
        model: input.model,
        attempt,
        durationMs,
        status,
        cfRay,
        responseShape: describeCloudflareResponseShape(payload),
      });

      if (!response.ok) {
        const parsedError = parseCloudflareError(payload);
        const retryAfterSec = parseRetryAfterSeconds(response.headers.get('retry-after'));
        const reason: CloudflareProviderErrorReason =
          status === 429
            ? 'rate_limited'
            : status >= 400 && status < 500
              ? 'request_invalid'
              : 'http_error';
        const keyDiag = getNestedResultKeys(payload);
        const detail = summarizeDetail(
          parsedError.message ?? `cloudflare provider returned status ${status}`,
        );

        input.onDiagnostic?.({
          stage: reason === 'request_invalid' ? 'provider_request_invalid' : 'provider_error',
          provider: 'cloudflare',
          model: input.model,
          attempt,
          durationMs,
          status,
          cfRay,
          reason,
          errorCode: parsedError.code ?? undefined,
          detail,
          responseTopLevelKeys: keyDiag.responseTopLevelKeys,
          responseResultKeys: keyDiag.responseResultKeys,
          responseNestedResultKeys: keyDiag.responseNestedResultKeys,
          payloadKeys,
          retryAfterSec,
        });

        if (status === 429 && attempt < maxAttempts) {
          const backoffMs = getRateLimitBackoffMs();
          await sleep(backoffMs);
          continue;
        }

        throw new CloudflareProviderError({
          message: parsedError.message ?? `Cloudflare provider returned status ${status}`,
          reason,
          status,
          retryAfterSec,
          cfRay,
          providerCode: parsedError.code,
        });
      }

      let text: string;
      try {
        text = extractCloudflareAssistantText(payload);
      } catch (error) {
        const keyDiag = getNestedResultKeys(payload);

        input.onDiagnostic?.({
          stage: 'provider_error',
          provider: 'cloudflare',
          model: input.model,
          attempt,
          durationMs,
          status,
          cfRay,
          reason: 'response_shape_error',
          responseTopLevelKeys: keyDiag.responseTopLevelKeys,
          responseResultKeys: keyDiag.responseResultKeys,
          responseNestedResultKeys: keyDiag.responseNestedResultKeys,
          detail: summarizeDetail(error instanceof Error ? error.message : 'unknown'),
        });
        throw new CloudflareProviderError({
          message: 'Cloudflare provider did not return assistant text',
          reason: 'response_shape_error',
          status,
          cfRay,
        });
      }

      return {
        provider: 'cloudflare',
        model: input.model,
        status,
        cfRay,
        text,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      const isAbortError =
        typeof error === 'object' &&
        error !== null &&
        'name' in error &&
        (error as { name?: string }).name === 'AbortError';

      if (error instanceof CloudflareProviderError) {
        throw error;
      }

      if (isAbortError) {
        input.onDiagnostic?.({
          stage: 'provider_error',
          provider: 'cloudflare',
          model: input.model,
          attempt,
          durationMs: Date.now() - startedAt,
          reason: 'timeout',
        });

        if (attempt < maxAttempts) {
          const backoffMs = getRateLimitBackoffMs();
          await sleep(backoffMs);
          continue;
        }

        throw new CloudflareProviderError({
          message: 'Cloudflare provider request timed out',
          reason: 'timeout',
        });
      }

      input.onDiagnostic?.({
        stage: 'provider_error',
        provider: 'cloudflare',
        model: input.model,
        attempt,
        durationMs: Date.now() - startedAt,
        reason: 'request_error',
        detail: summarizeDetail(error instanceof Error ? error.message : 'unknown'),
      });

      if (attempt < maxAttempts) {
        const backoffMs = getRateLimitBackoffMs();
        await sleep(backoffMs);
        continue;
      }

      throw new CloudflareProviderError({
        message: error instanceof Error ? error.message : 'Cloudflare provider request failed',
        reason: 'request_error',
      });
    }
  }

  throw new CloudflareProviderError({
    message: 'Cloudflare provider request failed',
    reason: 'request_error',
  });
}
