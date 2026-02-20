const DEFAULT_CLOUDFLARE_HTTP_TIMEOUT_MS = 45_000;
const DEFAULT_CLOUDFLARE_MAX_ATTEMPTS = 2;
const DEFAULT_MAX_TOKENS = 450;
const DEFAULT_TEMPERATURE = 0.3;
export function buildCloudflareRunEndpoint(accountId, model) {
    return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${encodeURI(model)}`;
}
export function buildCloudflareModelsSearchEndpoint(accountId) {
    return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/models/search`;
}
function getRateLimitBackoffMs() {
    const min = 800;
    const max = 1500;
    return min + Math.floor(Math.random() * (max - min + 1));
}
function getPayloadKeys(payload) {
    return Object.keys(payload);
}
function summarizeDetail(value) {
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
function parseRetryAfterSeconds(value) {
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
function describeCloudflareResponseShape(payload) {
    if (payload === null || payload === undefined) {
        return 'empty';
    }
    if (Array.isArray(payload)) {
        return 'array';
    }
    if (typeof payload === 'object') {
        const data = payload;
        if (typeof data.success === 'boolean' || Array.isArray(data.errors) || 'result' in data) {
            return 'cloudflare_run_response';
        }
        return 'object';
    }
    return typeof payload;
}
function parseCloudflareError(payload) {
    if (!payload || typeof payload !== 'object') {
        return {
            code: null,
            message: null,
        };
    }
    const data = payload;
    const firstError = Array.isArray(data.errors) ? data.errors[0] : undefined;
    if (!firstError || typeof firstError !== 'object') {
        return {
            code: null,
            message: null,
        };
    }
    return {
        code: firstError.code === undefined || firstError.code === null
            ? null
            : String(firstError.code),
        message: typeof firstError.message === 'string' ? firstError.message : null,
    };
}
function normalizeTextContent(value) {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
    }
    if (Array.isArray(value)) {
        const segments = value
            .map((item) => {
            if (typeof item === 'string') {
                return item.trim();
            }
            if (item && typeof item === 'object' && 'text' in item && typeof item.text === 'string') {
                return item.text.trim();
            }
            return '';
        })
            .filter((item) => item.length > 0);
        if (segments.length > 0) {
            return segments.join('\n');
        }
    }
    return null;
}
function extractModelName(candidate) {
    if (!candidate || typeof candidate !== 'object') {
        return null;
    }
    const record = candidate;
    const direct = (typeof record.id === 'string' && record.id) ||
        (typeof record.name === 'string' && record.name) ||
        (typeof record.model === 'string' && record.model) ||
        (typeof record.slug === 'string' && record.slug);
    if (direct) {
        return direct.trim();
    }
    return null;
}
function collectModelNames(payload) {
    if (!payload || typeof payload !== 'object') {
        return [];
    }
    const root = payload;
    const result = root.result;
    const source = Array.isArray(result) ? result : Array.isArray(root.models) ? root.models : [];
    const names = new Set();
    for (const item of source) {
        const modelName = extractModelName(item);
        if (modelName) {
            names.add(modelName);
        }
    }
    return Array.from(names.values());
}
export function extractCloudflareAssistantText(payload) {
    if (!payload || typeof payload !== 'object') {
        throw new Error('Cloudflare AI response payload is empty');
    }
    const data = payload;
    const result = data.result;
    if (!result || typeof result !== 'object') {
        throw new Error('Cloudflare AI response payload does not include result');
    }
    const resultRecord = result;
    const directResponse = normalizeTextContent(resultRecord.response);
    if (directResponse) {
        return directResponse;
    }
    const outputText = normalizeTextContent(resultRecord.output_text);
    if (outputText) {
        return outputText;
    }
    const messages = Array.isArray(resultRecord.messages)
        ? resultRecord.messages
        : [];
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];
        if (message?.role !== 'assistant') {
            continue;
        }
        const assistantContent = normalizeTextContent(message.content);
        if (assistantContent) {
            return assistantContent;
        }
    }
    const choices = Array.isArray(resultRecord.choices)
        ? resultRecord.choices
        : [];
    const firstChoiceContent = choices[0]?.message?.content;
    const choiceText = normalizeTextContent(firstChoiceContent);
    if (choiceText) {
        return choiceText;
    }
    throw new Error('Cloudflare AI response did not contain assistant text');
}
async function sleep(ms) {
    await new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
export class CloudflareProviderError extends Error {
    reason;
    status;
    retryAfterSec;
    cfRay;
    providerCode;
    constructor(params) {
        super(params.message);
        this.name = 'CloudflareProviderError';
        this.reason = params.reason;
        this.status = params.status ?? null;
        this.retryAfterSec = params.retryAfterSec ?? null;
        this.cfRay = params.cfRay ?? null;
        this.providerCode = params.providerCode ?? null;
    }
}
export async function searchCloudflareModels(input, fetchImpl = (requestUrl, init) => fetch(requestUrl, init)) {
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
        let payload = {};
        if (rawBody.length > 0) {
            try {
                payload = JSON.parse(rawBody);
            }
            catch {
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
                reason: status === 429
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
    }
    catch (error) {
        if (error instanceof CloudflareProviderError) {
            throw error;
        }
        const isAbortError = typeof error === 'object' &&
            error !== null &&
            'name' in error &&
            error.name === 'AbortError';
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
    }
    finally {
        clearTimeout(timeoutId);
    }
}
export async function verifyCloudflareModelExists(input, fetchImpl = (requestUrl, init) => fetch(requestUrl, init)) {
    const result = await searchCloudflareModels(input, fetchImpl);
    const modelExists = result.models.includes(input.configuredModel);
    return {
        modelExists,
        modelsCount: result.models.length,
        latencyMs: result.latencyMs,
        status: result.status,
    };
}
export async function generateCloudflareText(input, fetchImpl = (requestUrl, init) => fetch(requestUrl, init)) {
    const timeoutMs = input.timeoutMs ?? DEFAULT_CLOUDFLARE_HTTP_TIMEOUT_MS;
    const maxAttempts = input.maxAttempts ?? DEFAULT_CLOUDFLARE_MAX_ATTEMPTS;
    const maxTokens = input.maxTokens ?? DEFAULT_MAX_TOKENS;
    const temperature = input.temperature ?? DEFAULT_TEMPERATURE;
    const endpoint = buildCloudflareRunEndpoint(input.accountId, input.model);
    const messages = [
        { role: 'system', content: input.systemPrompt },
        { role: 'user', content: input.userPrompt },
    ];
    const requestPayload = {
        messages,
        max_tokens: maxTokens,
        temperature,
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
            let payload;
            let rawBody = '';
            try {
                rawBody = await response.text();
                payload = rawBody.length > 0 ? JSON.parse(rawBody) : {};
            }
            catch (error) {
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
                const reason = status === 429
                    ? 'rate_limited'
                    : status >= 400 && status < 500
                        ? 'request_invalid'
                        : 'http_error';
                const fallbackBodyDetail = parsedError.message ??
                    (typeof payload === 'string' ? payload : rawBody);
                const detail = summarizeDetail(fallbackBodyDetail);
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
            let text;
            try {
                text = extractCloudflareAssistantText(payload);
            }
            catch (error) {
                input.onDiagnostic?.({
                    stage: 'provider_error',
                    provider: 'cloudflare',
                    model: input.model,
                    attempt,
                    durationMs,
                    status,
                    cfRay,
                    reason: 'response_shape_error',
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
        }
        catch (error) {
            clearTimeout(timeoutId);
            const isAbortError = typeof error === 'object' &&
                error !== null &&
                'name' in error &&
                error.name === 'AbortError';
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
