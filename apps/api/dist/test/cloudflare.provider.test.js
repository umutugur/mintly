import { describe, expect, it, vi } from 'vitest';
import { buildCloudflareRunEndpoint, extractCloudflareAssistantText, generateCloudflareText, } from '../src/lib/ai/cloudflare.js';
describe('Cloudflare provider response parser', () => {
    it('builds run endpoint without escaping model slashes', () => {
        const endpoint = buildCloudflareRunEndpoint('account-1', '@cf/meta/llama-3.1-8b-instruct');
        expect(endpoint).toContain('/accounts/account-1/ai/run/@cf/meta/llama-3.1-8b-instruct');
    });
    it('extracts text from result.response', () => {
        const text = extractCloudflareAssistantText({
            success: true,
            result: {
                response: '{"summary":"ok"}',
            },
            errors: [],
        });
        expect(text).toBe('{"summary":"ok"}');
    });
    it('extracts text from assistant chat messages', () => {
        const text = extractCloudflareAssistantText({
            success: true,
            result: {
                messages: [
                    { role: 'user', content: 'hello' },
                    {
                        role: 'assistant',
                        content: [
                            { text: 'first line' },
                            { text: 'second line' },
                        ],
                    },
                ],
            },
            errors: [],
        });
        expect(text).toBe('first line\nsecond line');
    });
    it('throws on unsupported payload shape', () => {
        expect(() => extractCloudflareAssistantText({
            success: true,
            result: {},
            errors: [],
        })).toThrowError();
    });
    it('maps 400 provider response to request_invalid reason', async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({
            success: false,
            errors: [{ code: 10001, message: 'bad request' }],
        }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        }));
        await expect(generateCloudflareText({
            apiToken: 'token',
            accountId: 'account',
            model: '@cf/meta/llama-3.1-8b-instruct',
            systemPrompt: 'system',
            userPrompt: 'user',
            maxAttempts: 1,
        }, fetchMock)).rejects.toMatchObject({
            reason: 'request_invalid',
            status: 400,
        });
    });
    it('retries once then maps 429 provider response to rate_limited reason', async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({
            success: false,
            errors: [{ code: 10049, message: 'quota exhausted' }],
        }), {
            status: 429,
            headers: {
                'Content-Type': 'application/json',
                'Retry-After': '5',
            },
        }));
        await expect(generateCloudflareText({
            apiToken: 'token',
            accountId: 'account',
            model: '@cf/meta/llama-3.1-8b-instruct',
            systemPrompt: 'system',
            userPrompt: 'user',
            maxAttempts: 2,
        }, fetchMock)).rejects.toMatchObject({
            reason: 'rate_limited',
            status: 429,
            retryAfterSec: 5,
        });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});
