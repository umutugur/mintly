const DEFAULT_ONYSOFT_HTTP_TIMEOUT_MS = 45_000;
const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_MAX_TOKENS = 900;

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type OnysoftProviderErrorReason =
  | 'timeout'
  | 'http_error'
  | 'request_error'
  | 'response_parse_error'
  | 'response_shape_error';

export interface OnysoftProviderResult {
  provider: 'onysoft';
  status: number;
  text: string;
}

interface GenerateOnysoftTextInput {
  apiKey: string;
  baseUrl: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  timeoutMs?: number;
  temperature?: number;
  maxTokens?: number;
}

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

export async function generateOnysoftText(
  input: GenerateOnysoftTextInput,
  fetchImpl: FetchLike = (requestUrl, init) => fetch(requestUrl, init),
): Promise<OnysoftProviderResult> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_ONYSOFT_HTTP_TIMEOUT_MS;
  const temperature = input.temperature ?? DEFAULT_TEMPERATURE;
  const maxTokens = input.maxTokens ?? DEFAULT_MAX_TOKENS;
  const endpoint = `${input.baseUrl.replace(/\/+$/, '')}/v1/chat/completions`;

  let includeResponseFormat = true;
  let retriedWithoutResponseFormat = false;

  while (true) {
    const payload: Record<string, unknown> = {
      model: input.model,
      messages: [
        { role: 'system', content: input.systemPrompt },
        { role: 'user', content: input.userPrompt },
      ],
      temperature,
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
        if (
          includeResponseFormat
          && !retriedWithoutResponseFormat
          && shouldRetryWithoutResponseFormat(status, parsedBody, rawBody)
        ) {
          includeResponseFormat = false;
          retriedWithoutResponseFormat = true;
          continue;
        }

        const providerMessage = extractProviderErrorMessage(parsedBody)
          ?? `Onysoft provider returned status ${status}`;
        throw new OnysoftProviderError({
          message: providerMessage,
          reason: 'http_error',
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
}
